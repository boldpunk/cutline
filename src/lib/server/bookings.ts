// Booking lifecycle: create, reschedule, cancel, outcome. Every write runs in one
// transaction that (1) locks the affected barbers, (2) re-validates against the
// current schedule, (3) writes. The bookings_no_overlap exclusion constraint is
// the final guarantee if anything ever bypasses this module.
import { and, eq, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/lib/db/client";
import {
  barbers,
  services,
  bookingContacts,
  bookingEvents,
  bookings,
  idempotencyKeys,
  type BookingStatus,
} from "@/lib/db/schema";
import { phoneLast4 } from "@/lib/domain/phone";
import { MS, utcToZoned } from "@/lib/domain/time";
import {
  clientPolicy,
  inPolicyRange,
  loadOfferings,
  loadSchedule,
  nearestSlots,
  slotsFor,
  staffPolicy,
  type Offering,
  type Policy,
  type SlotOption,
} from "./availability";
import { bookingCode, randomToken, seal, sha256Hex, unseal } from "./crypto";
import { DomainError, PG, isPgError } from "./errors";
import { lockBarbers } from "./locks";
import { enqueueForBooking } from "./outbox";
import { getSalon, type Settings } from "./settings";

export type Actor =
  | { type: "client" }
  | { type: "staff"; userId: string; role: "admin" | "barber"; barberId: string | null; salonId: string };

export type BookingSummary = {
  bookingId: string;
  code: string;
  startAt: string;
  endAt: string;
  serviceName: string;
  priceUzs: number;
  durationMin: number;
  barberId: string;
  barberName: string;
};

export type CreatedBooking = BookingSummary & { token: string; replayed: boolean };

export type CreateBookingInput = {
  serviceId: string;
  /** A barber id, or "any" to let the server assign one. */
  barberId: string;
  /** For "any": the barber the client saw on the review screen (tried first). */
  assignedBarberId?: string;
  startAt: string;
  /** The price the client saw and agreed to; a different price is never applied silently. */
  expectedPriceUzs: number;
  clientName: string;
  phoneE164: string;
  email?: string | null;
  comment?: string | null;
  consentVersion: string;
  idempotencyKey: string;
  source: "online" | "staff";
  actorUserId?: string;
  /** Required for staff bookings: the staff member's salon (cross-salon writes are refused). */
  actorSalonId?: string;
  now?: number;
};

const IDEMPOTENCY_SCOPE = "booking.create";
const TOKEN_SEAL = "idempotent-token";

function summaryOf(b: typeof bookings.$inferSelect, barberName: string): BookingSummary {
  return {
    bookingId: b.id,
    code: b.code,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    serviceName: b.serviceName,
    priceUzs: b.priceUzs,
    durationMin: b.durationMin,
    barberId: b.barberId,
    barberName,
  };
}

async function uniqueCode(tx: Executor): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = bookingCode();
    const [hit] = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.code, code));
    if (!hit) return code;
  }
  throw new Error("could not allocate a booking code");
}

function requestHash(input: CreateBookingInput): string {
  return sha256Hex(
    JSON.stringify([
      input.serviceId,
      input.barberId,
      input.assignedBarberId ?? null,
      new Date(input.startAt).toISOString(),
      input.expectedPriceUzs,
      input.clientName,
      input.phoneE164,
      input.email ?? null,
      input.comment ?? null,
      input.source,
    ]),
  );
}

async function alternativesFor(
  settings: Settings,
  serviceId: string,
  barberId: string,
  fromInstant: number,
  policy: Policy,
): Promise<SlotOption[]> {
  const db = getDb();
  const offerings = await loadOfferings(db, serviceId, barberId === "any" ? undefined : [barberId]);
  if (offerings.length === 0) return [];
  const date = utcToZoned(fromInstant, settings.timezone).date;
  return nearestSlots(db, settings, offerings, date, policy, 6);
}

async function salonOfService(serviceId: string): Promise<Settings> {
  const db = getDb();
  const [svc] = await db.select({ salonId: services.salonId }).from(services).where(eq(services.id, serviceId));
  if (!svc) throw new DomainError("service_unavailable", "Эта услуга сейчас недоступна для записи.");
  return getSalon(db, svc.salonId);
}

export async function createBooking(input: CreateBookingInput): Promise<CreatedBooking> {
  const db = getDb();
  const now = input.now ?? Date.now();
  const settings = await salonOfService(input.serviceId);
  if (input.source === "online" && !settings.published) {
    throw new DomainError("service_unavailable", "Онлайн-запись в этот салон ещё не открыта.");
  }
  if (input.source === "staff" && input.actorSalonId !== settings.id) {
    throw new DomainError("forbidden", "Недостаточно прав.");
  }
  const policy = input.source === "online" ? clientPolicy(settings, now) : staffPolicy(settings, now);
  const start = Date.parse(input.startAt);
  if (!Number.isFinite(start)) throw new DomainError("validation", "Некорректное время записи");
  const date = utcToZoned(start, settings.timezone).date;
  const hash = requestHash(input);

  try {
    return await db.transaction(async (tx) => {
      // 1. Idempotency: the key row is part of this transaction. A concurrent
      //    request with the same key blocks on the unique index until we finish,
      //    then sees our committed response.
      const claimed = await tx
        .insert(idempotencyKeys)
        .values({ scope: IDEMPOTENCY_SCOPE, key: input.idempotencyKey, requestHash: hash })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      if (claimed.length === 0) {
        const [prev] = await tx
          .select()
          .from(idempotencyKeys)
          .where(and(eq(idempotencyKeys.scope, IDEMPOTENCY_SCOPE), eq(idempotencyKeys.key, input.idempotencyKey)))
          .for("update");
        if (!prev || prev.requestHash !== hash || !prev.response) {
          throw new DomainError("idempotency_mismatch", "Этот запрос уже был отправлен с другими данными. Обновите страницу.");
        }
        const stored = prev.response as BookingSummary & { sealedToken: string };
        const token = unseal(stored.sealedToken, TOKEN_SEAL);
        if (!token) throw new DomainError("idempotency_mismatch", "Повторный запрос устарел. Обновите страницу.");
        const { sealedToken: _ignored, ...summary } = stored;
        return { ...summary, token, replayed: true };
      }

      // 2. Who can do it, at what price.
      const all = await loadOfferings(tx, input.serviceId);
      let candidates: Offering[];
      if (input.barberId === "any") {
        const preferred = all.find((o) => o.barberId === input.assignedBarberId);
        candidates = preferred ? [preferred, ...all.filter((o) => o !== preferred)] : all;
      } else {
        candidates = all.filter((o) => o.barberId === input.barberId);
      }
      if (candidates.length === 0) {
        throw new DomainError(
          all.length === 0 ? "service_unavailable" : "barber_unavailable",
          all.length === 0
            ? "Эта услуга сейчас недоступна для записи."
            : "Мастер сейчас не принимает запись на эту услугу.",
        );
      }
      if (!inPolicyRange(policy, date) || start < policy.notBefore) {
        throw new DomainError("slot_unavailable", "Это время уже недоступно для записи.");
      }

      // 3. Serialize with every other write for these barbers, then re-check.
      await lockBarbers(
        tx,
        candidates.map((c) => c.barberId),
      );
      const schedule = await loadSchedule(
        tx,
        settings,
        candidates.map((c) => c.barberId),
        date,
        date,
      );
      const free = candidates.filter((o) => slotsFor(schedule, o, date, policy).includes(start));
      if (free.length === 0) throw new DomainError("slot_taken", "Это время только что заняли.");
      const chosen = free.find((o) => o.priceUzs === input.expectedPriceUzs);
      if (!chosen) {
        throw new DomainError("price_changed", "Стоимость изменилась. Проверьте новую цену перед подтверждением.", {
          offers: free.map((o) => ({ barberId: o.barberId, barberName: o.barberName, priceUzs: o.priceUzs })),
        });
      }

      // 4. Write booking, contacts, history, notifications, idempotent reply.
      const token = randomToken();
      const occupiedFrom = new Date(start - chosen.bufferBeforeMin * MS.MINUTE);
      const endAt = new Date(start + chosen.durationMin * MS.MINUTE);
      const occupiedUntil = new Date(endAt.getTime() + chosen.bufferAfterMin * MS.MINUTE);
      const [row] = await tx
        .insert(bookings)
        .values({
          salonId: settings.id,
          code: await uniqueCode(tx),
          accessTokenHash: sha256Hex(token),
          barberId: chosen.barberId,
          serviceId: chosen.serviceId,
          serviceName: chosen.serviceName,
          priceUzs: chosen.priceUzs,
          durationMin: chosen.durationMin,
          bufferBeforeMin: chosen.bufferBeforeMin,
          bufferAfterMin: chosen.bufferAfterMin,
          startAt: new Date(start),
          endAt,
          occupiedFrom,
          occupiedUntil,
          status: "confirmed",
          source: input.source,
          createdByUserId: input.actorUserId ?? null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .returning();
      const booking = row!;
      await tx.insert(bookingContacts).values({
        bookingId: booking.id,
        clientName: input.clientName,
        phoneE164: input.phoneE164,
        phoneLast4: phoneLast4(input.phoneE164),
        email: input.email || null,
        comment: input.comment || null,
        consentVersion: input.consentVersion,
        consentedAt: new Date(now),
      });
      await tx.insert(bookingEvents).values({
        bookingId: booking.id,
        type: "created",
        actorType: input.source === "online" ? "client" : "staff",
        actorUserId: input.actorUserId ?? null,
        data: {
          startAt: booking.startAt.toISOString(),
          barberId: booking.barberId,
          serviceName: booking.serviceName,
          priceUzs: booking.priceUzs,
          source: input.source,
          autoAssigned: input.barberId === "any",
        },
        createdAt: new Date(now),
      });
      await enqueueForBooking(tx, booking, input.email || null, "booking_confirmed", now);

      const summary = summaryOf(booking, chosen.barberName);
      await tx
        .update(idempotencyKeys)
        .set({ bookingId: booking.id, response: { ...summary, sealedToken: seal(token, TOKEN_SEAL) } })
        .where(and(eq(idempotencyKeys.scope, IDEMPOTENCY_SCOPE), eq(idempotencyKeys.key, input.idempotencyKey)));
      return { ...summary, token, replayed: false };
    });
  } catch (err) {
    const taken =
      (err instanceof DomainError && err.code === "slot_taken") || isPgError(err, PG.EXCLUSION_VIOLATION);
    if (taken) {
      throw new DomainError("slot_taken", "Это время только что заняли. Выберите другое — ваши данные сохранены.", {
        alternatives: await alternativesFor(settings, input.serviceId, input.barberId, start, policy),
      });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------

async function lockedBooking(tx: Executor, bookingId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
  if (!b) throw new DomainError("not_found", "Запись не найдена.");
  return b;
}

async function barberName(ex: Executor, id: string): Promise<string> {
  const [b] = await ex.select({ name: barbers.name }).from(barbers).where(eq(barbers.id, id));
  return b?.name ?? "";
}

async function contactEmail(ex: Executor, bookingId: string): Promise<string | null> {
  const [c] = await ex
    .select({ email: bookingContacts.email })
    .from(bookingContacts)
    .where(eq(bookingContacts.bookingId, bookingId));
  return c?.email ?? null;
}

/** Whether the client may still change this booking (status, time, cutoff). */
export function clientChangeAllowed(
  b: { status: BookingStatus; startAt: Date },
  settings: Settings,
  now: number,
): { ok: true } | { ok: false; reason: string } {
  if (b.status !== "confirmed") return { ok: false, reason: "Запись уже отменена или завершена." };
  if (b.startAt.getTime() <= now) return { ok: false, reason: "Время визита уже прошло." };
  const cutoff = b.startAt.getTime() - settings.cancelCutoffHours * MS.HOUR;
  if (now > cutoff) {
    return {
      ok: false,
      reason: `Перенос и отмена онлайн доступны не позднее чем за ${settings.cancelCutoffHours} ч до визита. Позвоните в салон.`,
    };
  }
  return { ok: true };
}

function assertStaffAdmin(actor: Actor): asserts actor is Extract<Actor, { type: "staff" }> {
  if (actor.type !== "staff" || actor.role !== "admin") {
    throw new DomainError("forbidden", "Недостаточно прав.");
  }
}

export type RescheduleInput = {
  bookingId: string;
  newStartAt: string;
  /** Defaults to the current barber. */
  newBarberId?: string;
  /** Required when the barber changes: the new price the client saw. */
  expectedPriceUzs?: number;
  actor: Actor;
  reason?: string | null;
  now?: number;
};

export type RescheduleResult = BookingSummary & { changed: boolean };

export async function rescheduleBooking(input: RescheduleInput): Promise<RescheduleResult> {
  const db = getDb();
  const now = input.now ?? Date.now();
  if (input.actor.type === "staff") assertStaffAdmin(input.actor);
  // Peek (no lock) to know the salon and which barbers to lock; re-read under lock below.
  const [peek] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!peek || (input.actor.type === "staff" && peek.salonId !== input.actor.salonId)) {
    throw new DomainError("not_found", "Запись не найдена.");
  }
  const settings = await getSalon(db, peek.salonId);
  const policy = input.actor.type === "client" ? clientPolicy(settings, now) : staffPolicy(settings, now);
  const start = Date.parse(input.newStartAt);
  if (!Number.isFinite(start)) throw new DomainError("validation", "Некорректное время.");
  const date = utcToZoned(start, settings.timezone).date;
  const targetBarberId = input.newBarberId ?? peek.barberId;

  try {
    return await db.transaction(async (tx) => {
      await lockBarbers(tx, [peek.barberId, targetBarberId]);
      const b = await lockedBooking(tx, input.bookingId);
      if (b.barberId !== peek.barberId) throw new DomainError("conflict", "Запись изменилась. Обновите страницу.");

      if (input.actor.type === "client") {
        const allowed = clientChangeAllowed(b, settings, now);
        if (!allowed.ok) throw new DomainError("too_late", allowed.reason);
      } else if (b.status !== "confirmed") {
        throw new DomainError("not_modifiable", "Перенести можно только подтверждённую запись.");
      }

      // Repeated submit of the same change: nothing to do, no duplicate event.
      if (b.startAt.getTime() === start && b.barberId === targetBarberId) {
        return { ...summaryOf(b, await barberName(tx, b.barberId)), changed: false };
      }

      let terms: Offering;
      if (targetBarberId === b.barberId) {
        // Same barber: the agreed snapshot (price, duration, buffers) stays.
        terms = {
          barberId: b.barberId,
          barberName: await barberName(tx, b.barberId),
          barberSortOrder: 0,
          salonId: b.salonId,
          serviceId: b.serviceId,
          serviceName: b.serviceName,
          priceUzs: b.priceUzs,
          durationMin: b.durationMin,
          bufferBeforeMin: b.bufferBeforeMin,
          bufferAfterMin: b.bufferAfterMin,
        };
      } else {
        const [offer] = await loadOfferings(tx, b.serviceId, [targetBarberId]);
        if (!offer) throw new DomainError("barber_unavailable", "Этот мастер не выполняет эту услугу.");
        if (offer.priceUzs !== input.expectedPriceUzs) {
          throw new DomainError("price_changed", "У выбранного мастера другая стоимость. Подтвердите новую цену.", {
            offers: [{ barberId: offer.barberId, barberName: offer.barberName, priceUzs: offer.priceUzs }],
          });
        }
        terms = offer;
      }

      const schedule = await loadSchedule(tx, settings, [targetBarberId], date, date, {
        excludeBookingId: b.id,
      });
      if (!slotsFor(schedule, terms, date, policy).includes(start)) {
        throw new DomainError("slot_taken", "Это время недоступно.");
      }

      const endAt = new Date(start + terms.durationMin * MS.MINUTE);
      const [updated] = await tx
        .update(bookings)
        .set({
          barberId: terms.barberId,
          priceUzs: terms.priceUzs,
          durationMin: terms.durationMin,
          bufferBeforeMin: terms.bufferBeforeMin,
          bufferAfterMin: terms.bufferAfterMin,
          startAt: new Date(start),
          endAt,
          occupiedFrom: new Date(start - terms.bufferBeforeMin * MS.MINUTE),
          occupiedUntil: new Date(endAt.getTime() + terms.bufferAfterMin * MS.MINUTE),
          rescheduleCount: sql`${bookings.rescheduleCount} + 1`,
          updatedAt: new Date(now),
        })
        .where(eq(bookings.id, b.id))
        .returning();
      await tx.insert(bookingEvents).values({
        bookingId: b.id,
        type: "rescheduled",
        actorType: input.actor.type,
        actorUserId: input.actor.type === "staff" ? input.actor.userId : null,
        data: {
          from: { startAt: b.startAt.toISOString(), barberId: b.barberId, priceUzs: b.priceUzs },
          to: { startAt: updated!.startAt.toISOString(), barberId: updated!.barberId, priceUzs: updated!.priceUzs },
          reason: input.reason ?? null,
        },
        createdAt: new Date(now),
      });
      await enqueueForBooking(tx, updated!, await contactEmail(tx, b.id), "rescheduled", now);
      return { ...summaryOf(updated!, terms.barberName), changed: true };
    });
  } catch (err) {
    if ((err instanceof DomainError && err.code === "slot_taken") || isPgError(err, PG.EXCLUSION_VIOLATION)) {
      throw new DomainError("slot_taken", "Это время уже занято. Ваша текущая запись осталась без изменений.", {
        alternatives: await alternativesFor(settings, peek.serviceId, targetBarberId, start, policy),
      });
    }
    throw err;
  }
}

export type CancelInput = { bookingId: string; actor: Actor; reason?: string | null; now?: number };

export async function cancelBooking(input: CancelInput): Promise<{ status: BookingStatus; changed: boolean }> {
  const db = getDb();
  const now = input.now ?? Date.now();
  if (input.actor.type === "staff") assertStaffAdmin(input.actor);

  return db.transaction(async (tx) => {
    const b = await lockedBooking(tx, input.bookingId);
    if (input.actor.type === "staff" && b.salonId !== input.actor.salonId) {
      throw new DomainError("not_found", "Запись не найдена.");
    }
    const settings = await getSalon(tx, b.salonId);
    // Repeated cancel is a no-op: no error, no second event.
    if (b.status === "cancelled_by_client" || b.status === "cancelled_by_staff") {
      return { status: b.status, changed: false };
    }
    if (input.actor.type === "client") {
      const allowed = clientChangeAllowed(b, settings, now);
      if (!allowed.ok) throw new DomainError("too_late", allowed.reason);
    } else if (b.status !== "confirmed") {
      throw new DomainError("not_modifiable", "Отменить можно только подтверждённую запись.");
    }
    const status: BookingStatus = input.actor.type === "client" ? "cancelled_by_client" : "cancelled_by_staff";
    await tx
      .update(bookings)
      .set({ status, statusReason: input.reason ?? null, updatedAt: new Date(now) })
      .where(eq(bookings.id, b.id));
    await tx.insert(bookingEvents).values({
      bookingId: b.id,
      type: "cancelled",
      actorType: input.actor.type,
      actorUserId: input.actor.type === "staff" ? input.actor.userId : null,
      data: { status, reason: input.reason ?? null, startAt: b.startAt.toISOString() },
      createdAt: new Date(now),
    });
    await enqueueForBooking(tx, b, await contactEmail(tx, b.id), "cancelled", now);
    return { status, changed: true };
  });
}

export async function setOutcome(input: {
  bookingId: string;
  outcome: "completed" | "no_show";
  actor: Extract<Actor, { type: "staff" }>;
  now?: number;
}): Promise<{ changed: boolean }> {
  const db = getDb();
  const now = input.now ?? Date.now();
  return db.transaction(async (tx) => {
    const b = await lockedBooking(tx, input.bookingId);
    if (b.salonId !== input.actor.salonId) throw new DomainError("not_found", "Запись не найдена.");
    if (input.actor.role !== "admin" && b.barberId !== input.actor.barberId) {
      throw new DomainError("forbidden", "Это не ваша запись.");
    }
    if (b.status === input.outcome) return { changed: false };
    if (!["confirmed", "completed", "no_show"].includes(b.status)) {
      throw new DomainError("not_modifiable", "Запись отменена.");
    }
    if (b.startAt.getTime() > now) {
      throw new DomainError("not_modifiable", "Отметить визит можно после его начала.");
    }
    await tx
      .update(bookings)
      .set({ status: input.outcome, updatedAt: new Date(now) })
      .where(eq(bookings.id, b.id));
    await tx.insert(bookingEvents).values({
      bookingId: b.id,
      type: input.outcome,
      actorType: "staff",
      actorUserId: input.actor.userId,
      data: { previousStatus: b.status },
      createdAt: new Date(now),
    });
    return { changed: true };
  });
}
