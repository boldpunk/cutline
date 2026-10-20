// Staff-side schedule changes. Any change that would leave a future confirmed
// booking outside working time (or under a block) is rejected with the list of
// affected bookings; staff must reschedule/cancel those first.
import { and, asc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { getDb, type Executor } from "@/lib/db/client";
import { barbers, bookings, scheduleExceptions, timeBlocks, weeklyAvailability, type BlockKind } from "@/lib/db/schema";
import { contains, overlaps } from "@/lib/domain/intervals";
import type { MinuteRange } from "@/lib/domain/slots";
import { isValidDateString, utcToZoned } from "@/lib/domain/time";
import { loadSchedule, windowsFor } from "./availability";
import { audit } from "./audit";
import type { Actor } from "./bookings";
import { DomainError } from "./errors";
import { lockBarbers } from "./locks";
import { getSalon, type Salon } from "./settings";

export type StaffActor = Extract<Actor, { type: "staff" }>;

export type AffectedBooking = {
  id: string;
  code: string;
  startAt: string;
  barberId: string;
  barberName: string;
  serviceName: string;
};

async function allBarberIds(ex: Executor, salonId: string): Promise<string[]> {
  return (await ex.select({ id: barbers.id }).from(barbers).where(eq(barbers.salonId, salonId))).map((b) => b.id);
}

/** Refuses ids of barbers from another salon (reported as not found). */
async function assertBarberInSalon(ex: Executor, barberId: string, salonId: string): Promise<void> {
  const [b] = await ex
    .select({ id: barbers.id })
    .from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.salonId, salonId)));
  if (!b) throw new DomainError("not_found", "Мастер не найден.");
}

/**
 * Future confirmed bookings of `barberIds` that no longer fit their barber's
 * working windows or overlap a time block. Call inside the transaction after
 * applying the change (and after locking the barbers).
 */
export async function findScheduleConflicts(
  ex: Executor,
  settings: Salon,
  barberIds: string[],
  now: number,
): Promise<AffectedBooking[]> {
  if (barberIds.length === 0) return [];
  const future = await ex
    .select({
      id: bookings.id,
      code: bookings.code,
      barberId: bookings.barberId,
      barberName: barbers.name,
      serviceName: bookings.serviceName,
      startAt: bookings.startAt,
      occupiedFrom: bookings.occupiedFrom,
      occupiedUntil: bookings.occupiedUntil,
      barberActive: barbers.active,
    })
    .from(bookings)
    .innerJoin(barbers, eq(barbers.id, bookings.barberId))
    .where(
      and(
        eq(bookings.salonId, settings.id),
        inArray(bookings.barberId, barberIds),
        eq(bookings.status, "confirmed"),
        gt(bookings.startAt, new Date(now)),
      ),
    )
    .orderBy(asc(bookings.startAt));
  if (future.length === 0) return [];

  const tz = settings.timezone;
  const dates = future.map((b) => utcToZoned(b.startAt.getTime(), tz).date);
  const from = dates.reduce((a, b) => (a < b ? a : b));
  const to = dates.reduce((a, b) => (a > b ? a : b));
  const data = await loadSchedule(ex, settings, [...new Set(future.map((b) => b.barberId))], from, to);

  const out: AffectedBooking[] = [];
  future.forEach((b, i) => {
    const occ = { start: b.occupiedFrom.getTime(), end: b.occupiedUntil.getTime() };
    const fitsWindow = windowsFor(data, b.barberId, dates[i]!).some((w) => contains(w, occ));
    const blocked = (data.blocks.get(b.barberId) ?? []).some((blk) => overlaps(blk, occ));
    if (!b.barberActive || !fitsWindow || blocked) {
      out.push({
        id: b.id,
        code: b.code,
        startAt: b.startAt.toISOString(),
        barberId: b.barberId,
        barberName: b.barberName,
        serviceName: b.serviceName,
      });
    }
  });
  return out;
}

function conflictError(affected: AffectedBooking[]): DomainError {
  return new DomainError(
    "schedule_conflict",
    `Изменение затрагивает ${affected.length} подтверждённ${affected.length === 1 ? "ую запись" : "ых записей"}. Сначала перенесите или отмените их.`,
    { affected },
  );
}

function assertCanManageBarber(actor: StaffActor, barberId: string, barbersCanBlock: boolean) {
  if (actor.role === "admin") return;
  if (actor.barberId !== barberId || !barbersCanBlock) throw new DomainError("forbidden", "Недостаточно прав.");
}

function assertAdmin(actor: StaffActor) {
  if (actor.role !== "admin") throw new DomainError("forbidden", "Недостаточно прав.");
}

function validateRanges(ranges: MinuteRange[]) {
  const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin);
  sorted.forEach((r, i) => {
    if (!(Number.isInteger(r.startMin) && Number.isInteger(r.endMin)) || r.startMin < 0 || r.endMin > 1440 || r.startMin >= r.endMin) {
      throw new DomainError("validation", "Некорректный интервал времени.");
    }
    const prev = sorted[i - 1];
    if (prev && prev.endMin > r.startMin) throw new DomainError("validation", "Интервалы пересекаются.");
  });
}

// ---------------------------------------------------------------------------
// Time blocks (vacations, breaks)
// ---------------------------------------------------------------------------

export async function createTimeBlock(input: {
  actor: StaffActor;
  barberId: string;
  kind: BlockKind;
  startAt: Date;
  endAt: Date;
  note?: string | null;
  now?: number;
}): Promise<{ id: string }> {
  const db = getDb();
  const settings = await getSalon(db, input.actor.salonId);
  assertCanManageBarber(input.actor, input.barberId, settings.barbersCanBlock);
  if (!(input.endAt > input.startAt)) throw new DomainError("validation", "Окончание должно быть позже начала.");
  if (input.endAt.getTime() - input.startAt.getTime() > 366 * 86_400_000) {
    throw new DomainError("validation", "Блокировка не может быть длиннее года.");
  }

  return db.transaction(async (tx) => {
    await assertBarberInSalon(tx, input.barberId, input.actor.salonId);
    await lockBarbers(tx, [input.barberId]);
    // A block may never silently swallow a confirmed booking.
    const clashing = await tx
      .select({
        id: bookings.id,
        code: bookings.code,
        startAt: bookings.startAt,
        barberId: bookings.barberId,
        barberName: barbers.name,
        serviceName: bookings.serviceName,
      })
      .from(bookings)
      .innerJoin(barbers, eq(barbers.id, bookings.barberId))
      .where(
        and(
          eq(bookings.barberId, input.barberId),
          eq(bookings.status, "confirmed"),
          lt(bookings.occupiedFrom, input.endAt),
          gt(bookings.occupiedUntil, input.startAt),
        ),
      )
      .orderBy(asc(bookings.startAt));
    if (clashing.length > 0) {
      throw conflictError(clashing.map((c) => ({ ...c, startAt: c.startAt.toISOString() })));
    }
    const [row] = await tx
      .insert(timeBlocks)
      .values({
        salonId: input.actor.salonId,
        barberId: input.barberId,
        kind: input.kind,
        startAt: input.startAt,
        endAt: input.endAt,
        note: input.note ?? null,
        createdBy: input.actor.userId,
      })
      .returning({ id: timeBlocks.id });
    await audit(tx, input.actor.salonId, input.actor.userId, "time_block.create", "time_block", row!.id, {
      barberId: input.barberId,
      kind: input.kind,
      startAt: input.startAt.toISOString(),
      endAt: input.endAt.toISOString(),
    });
    return { id: row!.id };
  });
}

export async function deleteTimeBlock(input: { actor: StaffActor; blockId: string }): Promise<void> {
  const db = getDb();
  const settings = await getSalon(db, input.actor.salonId);
  await db.transaction(async (tx) => {
    const [blk] = await tx.select().from(timeBlocks).where(eq(timeBlocks.id, input.blockId)).for("update");
    if (!blk || blk.salonId !== input.actor.salonId) throw new DomainError("not_found", "Блокировка не найдена.");
    assertCanManageBarber(input.actor, blk.barberId, settings.barbersCanBlock);
    await lockBarbers(tx, [blk.barberId]);
    await tx.delete(timeBlocks).where(eq(timeBlocks.id, blk.id));
    await audit(tx, input.actor.salonId, input.actor.userId, "time_block.delete", "time_block", blk.id, {
      barberId: blk.barberId,
      startAt: blk.startAt.toISOString(),
      endAt: blk.endAt.toISOString(),
    });
  });
}

// ---------------------------------------------------------------------------
// Weekly hours & date exceptions (admin only)
// ---------------------------------------------------------------------------

/** Replaces the weekly hours of a barber (or the salon when barberId is null). */
export async function replaceWeeklyHours(input: {
  actor: StaffActor;
  barberId: string | null;
  hours: Record<number, MinuteRange[]>;
  now?: number;
}): Promise<void> {
  assertAdmin(input.actor);
  const now = input.now ?? Date.now();
  for (const [day, ranges] of Object.entries(input.hours)) {
    const d = Number(day);
    if (!(d >= 1 && d <= 7)) throw new DomainError("validation", "Некорректный день недели.");
    validateRanges(ranges);
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    if (input.barberId) await assertBarberInSalon(tx, input.barberId, input.actor.salonId);
    const affectedBarbers = input.barberId ? [input.barberId] : await allBarberIds(tx, input.actor.salonId);
    await lockBarbers(tx, affectedBarbers);
    await tx
      .delete(weeklyAvailability)
      .where(
        and(
          eq(weeklyAvailability.salonId, input.actor.salonId),
          input.barberId ? eq(weeklyAvailability.barberId, input.barberId) : isNull(weeklyAvailability.barberId),
        ),
      );
    const rows = Object.entries(input.hours).flatMap(([day, ranges]) =>
      ranges.map((r) => ({
        salonId: input.actor.salonId,
        barberId: input.barberId,
        weekday: Number(day),
        startMin: r.startMin,
        endMin: r.endMin,
      })),
    );
    if (rows.length) await tx.insert(weeklyAvailability).values(rows);
    const conflicts = await findScheduleConflicts(tx, await getSalon(tx, input.actor.salonId), affectedBarbers, now);
    if (conflicts.length) throw conflictError(conflicts);
    await audit(tx, input.actor.salonId, input.actor.userId, "weekly_hours.replace", input.barberId ? "barber" : "salon", input.barberId, {
      hours: input.hours,
    });
  });
}

/** Sets the override for a date: closed, or specific hours. Replaces any previous override for that date/scope. */
export async function setDateException(input: {
  actor: StaffActor;
  barberId: string | null;
  date: string;
  kind: "closed" | "hours";
  ranges?: MinuteRange[];
  note?: string | null;
  now?: number;
}): Promise<void> {
  assertAdmin(input.actor);
  const now = input.now ?? Date.now();
  if (!isValidDateString(input.date)) throw new DomainError("validation", "Некорректная дата.");
  const ranges = input.kind === "hours" ? (input.ranges ?? []) : [];
  if (input.kind === "hours") {
    if (ranges.length === 0) throw new DomainError("validation", "Укажите часы работы.");
    validateRanges(ranges);
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    if (input.barberId) await assertBarberInSalon(tx, input.barberId, input.actor.salonId);
    const affectedBarbers = input.barberId ? [input.barberId] : await allBarberIds(tx, input.actor.salonId);
    await lockBarbers(tx, affectedBarbers);
    await tx
      .delete(scheduleExceptions)
      .where(
        and(
          eq(scheduleExceptions.salonId, input.actor.salonId),
          eq(scheduleExceptions.date, input.date),
          input.barberId ? eq(scheduleExceptions.barberId, input.barberId) : isNull(scheduleExceptions.barberId),
        ),
      );
    const base = { salonId: input.actor.salonId, barberId: input.barberId, date: input.date, note: input.note ?? null, createdBy: input.actor.userId };
    if (input.kind === "closed") await tx.insert(scheduleExceptions).values({ ...base, kind: "closed" });
    else await tx.insert(scheduleExceptions).values(ranges.map((r) => ({ ...base, kind: "hours" as const, ...r })));
    const conflicts = await findScheduleConflicts(tx, await getSalon(tx, input.actor.salonId), affectedBarbers, now);
    if (conflicts.length) throw conflictError(conflicts);
    await audit(tx, input.actor.salonId, input.actor.userId, "schedule_exception.set", input.barberId ? "barber" : "salon", input.barberId, {
      date: input.date,
      kind: input.kind,
      ranges,
    });
  });
}

export async function removeDateException(input: {
  actor: StaffActor;
  barberId: string | null;
  date: string;
  now?: number;
}): Promise<void> {
  assertAdmin(input.actor);
  const now = input.now ?? Date.now();
  const db = getDb();
  await db.transaction(async (tx) => {
    if (input.barberId) await assertBarberInSalon(tx, input.barberId, input.actor.salonId);
    const affectedBarbers = input.barberId ? [input.barberId] : await allBarberIds(tx, input.actor.salonId);
    await lockBarbers(tx, affectedBarbers);
    await tx
      .delete(scheduleExceptions)
      .where(
        and(
          eq(scheduleExceptions.salonId, input.actor.salonId),
          eq(scheduleExceptions.date, input.date),
          input.barberId ? eq(scheduleExceptions.barberId, input.barberId) : isNull(scheduleExceptions.barberId),
        ),
      );
    // Removing a "custom hours" override can shrink the day back to weekly hours.
    const conflicts = await findScheduleConflicts(tx, await getSalon(tx, input.actor.salonId), affectedBarbers, now);
    if (conflicts.length) throw conflictError(conflicts);
    await audit(tx, input.actor.salonId, input.actor.userId, "schedule_exception.remove", input.barberId ? "barber" : "salon", input.barberId, {
      date: input.date,
    });
  });
}

/** Deactivating a barber with future bookings is refused until they're resolved. */
export async function setBarberActive(input: { actor: StaffActor; barberId: string; active: boolean; now?: number }) {
  assertAdmin(input.actor);
  const now = input.now ?? Date.now();
  const db = getDb();
  await db.transaction(async (tx) => {
    await assertBarberInSalon(tx, input.barberId, input.actor.salonId);
    await lockBarbers(tx, [input.barberId]);
    await tx.update(barbers).set({ active: input.active, updatedAt: new Date(now) }).where(eq(barbers.id, input.barberId));
    if (!input.active) {
      const conflicts = await findScheduleConflicts(tx, await getSalon(tx, input.actor.salonId), [input.barberId], now);
      if (conflicts.length) throw conflictError(conflicts);
    }
    await audit(tx, input.actor.salonId, input.actor.userId, input.active ? "barber.activate" : "barber.deactivate", "barber", input.barberId);
  });
}

