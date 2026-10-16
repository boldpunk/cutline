import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookingEvents, bookings, services } from "@/lib/db/schema";
import { clientPolicy, loadOfferings, loadSchedule, mergeSlots } from "@/lib/server/availability";
import { cancelBooking, createBooking, rescheduleBooking, setOutcome } from "@/lib/server/bookings";
import { DomainError } from "@/lib/server/errors";
import { getSettings } from "@/lib/server/settings";
import { DAY1, NOW, at, buildWorld, clientInput, resetDatabase, type World } from "./harness";

let w: World;
beforeEach(async () => {
  await resetDatabase();
  w = await buildWorld();
});

async function confirmedCount(barberId?: string) {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.status, "confirmed"), barberId ? eq(bookings.barberId, barberId) : undefined));
  return rows[0]!.n;
}

async function events(bookingId: string, type?: string) {
  const rows = await getDb().select().from(bookingEvents).where(eq(bookingEvents.bookingId, bookingId));
  return type ? rows.filter((r) => r.type === type) : rows;
}

async function errorOf(p: Promise<unknown>): Promise<DomainError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error("expected a DomainError");
}

describe("A01 create", () => {
  it("stores one booking with the agreed snapshot", async () => {
    const res = await createBooking(clientInput(w));
    expect(res.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(res.token.length).toBeGreaterThanOrEqual(43);
    expect(res.barberName).toBe("Anvar");
    expect(res.priceUzs).toBe(150_000);
    const [row] = await getDb().select().from(bookings).where(eq(bookings.id, res.bookingId));
    expect(row!.startAt.toISOString()).toBe(at(DAY1, "10:00"));
    expect(row!.endAt.toISOString()).toBe(at(DAY1, "11:00"));
    expect(row!.occupiedUntil.toISOString()).toBe(at(DAY1, "11:15")); // + buffer
    expect(row!.accessTokenHash).not.toContain(res.token);
    expect(await events(res.bookingId, "created")).toHaveLength(1);
  });

  it("rejects times inside the minimum lead time or off the grid", async () => {
    const e1 = await errorOf(createBooking(clientInput(w, { startAt: at("2030-01-07", "08:30") })));
    expect(e1.code).toBe("slot_unavailable");
    const e2 = await errorOf(createBooking(clientInput(w, { startAt: at(DAY1, "10:05") })));
    expect(e2.code).toBe("slot_taken");
    const e3 = await errorOf(createBooking(clientInput(w, { startAt: at(DAY1, "19:30") }))); // ends after closing
    expect(e3.code).toBe("slot_taken");
  });

  it("refuses an inactive service", async () => {
    await getDb().update(services).set({ active: false }).where(eq(services.id, w.cut.id));
    const e = await errorOf(createBooking(clientInput(w)));
    expect(e.code).toBe("service_unavailable");
  });
});

describe("A02 concurrent bookings of one slot", () => {
  it("exactly one of many parallel requests wins; losers get fresh alternatives", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => createBooking(clientInput(w))),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(11);
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(DomainError);
      expect(f.reason.code).toBe("slot_taken");
      const alts = f.reason.details.alternatives as { startAt: string }[];
      expect(alts.length).toBeGreaterThan(0);
      expect(alts.map((a) => a.startAt)).not.toContain(at(DAY1, "10:00"));
    }
    expect(await confirmedCount()).toBe(1);
  });

  it("overlapping (not identical) times also race safely", async () => {
    const starts = ["10:00", "10:15", "10:30", "10:45"].map((t) => at(DAY1, t));
    const results = await Promise.allSettled(starts.map((s) => createBooking(clientInput(w, { startAt: s }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await confirmedCount()).toBe(1);
  });

  it("'any barber' assigns distinct barbers until the slot is exhausted", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createBooking(clientInput(w, { barberId: "any", assignedBarberId: w.anvar.id }))),
    );
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ barberId: string }>).value);
    expect(ok).toHaveLength(2);
    expect(new Set(ok.map((o) => o.barberId)).size).toBe(2);
    expect(await confirmedCount()).toBe(2);
  });

  it("the database itself rejects overlapping confirmed bookings (exclusion constraint)", async () => {
    const res = await createBooking(clientInput(w));
    const clone = sql`
      insert into bookings (code, access_token_hash, barber_id, service_id, service_name, price_uzs, duration_min,
        buffer_before_min, buffer_after_min, start_at, end_at, occupied_from, occupied_until, status, source)
      select 'ZZZZZZZZ', 'other-hash', barber_id, service_id, service_name, price_uzs, duration_min,
        buffer_before_min, buffer_after_min, start_at + interval '30 minutes', end_at + interval '30 minutes',
        occupied_from + interval '30 minutes', occupied_until + interval '30 minutes', ${"confirmed"}, source
      from bookings where id = ${res.bookingId}`;
    await expect(getDb().execute(clone)).rejects.toMatchObject({ cause: { code: "23P01" } });
    // Cancelled rows don't occupy time.
    await getDb().update(bookings).set({ status: "cancelled_by_staff" }).where(eq(bookings.id, res.bookingId));
    await expect(getDb().execute(clone)).resolves.toBeDefined();
  });
});

describe("A03 idempotency", () => {
  it("double click / retries with one key produce one booking and one event set", async () => {
    const input = clientInput(w);
    const results = await Promise.all(Array.from({ length: 6 }, () => createBooking({ ...input })));
    expect(new Set(results.map((r) => r.bookingId)).size).toBe(1);
    expect(new Set(results.map((r) => r.token)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await confirmedCount()).toBe(1);
    expect(await events(results[0]!.bookingId)).toHaveLength(1);
    // A later retry (e.g. after a network error) replays as well.
    const again = await createBooking({ ...input });
    expect(again.replayed).toBe(true);
    expect(again.code).toBe(results[0]!.code);
  });

  it("reusing a key with different data is refused", async () => {
    const input = clientInput(w);
    await createBooking(input);
    const e = await errorOf(createBooking({ ...input, startAt: at(DAY1, "12:00") }));
    expect(e.code).toBe("idempotency_mismatch");
  });
});

describe("prices", () => {
  it("A09: later price changes don't rewrite existing bookings; new bookings need the new price", async () => {
    const first = await createBooking(clientInput(w));
    await getDb().update(services).set({ priceUzs: 180_000 }).where(eq(services.id, w.cut.id));
    const [row] = await getDb().select().from(bookings).where(eq(bookings.id, first.bookingId));
    expect(row!.priceUzs).toBe(150_000);

    const stale = await errorOf(createBooking(clientInput(w, { startAt: at(DAY1, "12:00") })));
    expect(stale.code).toBe("price_changed");
    const fresh = await createBooking(clientInput(w, { startAt: at(DAY1, "12:00"), expectedPriceUzs: 180_000 }));
    expect(fresh.priceUzs).toBe(180_000);
  });

  it("'any barber' never silently switches to a barber with another price", async () => {
    // Beard: Anvar 90 000, Bekzod 100 000. Anvar is busy at 10:00.
    await createBooking(clientInput(w, { serviceId: w.beard.id, expectedPriceUzs: 90_000 }));
    const e = await errorOf(
      createBooking(
        clientInput(w, { serviceId: w.beard.id, barberId: "any", assignedBarberId: w.anvar.id, expectedPriceUzs: 90_000 }),
      ),
    );
    expect(e.code).toBe("price_changed");
    expect(e.details!.offers).toEqual([{ barberId: w.bekzod.id, barberName: "Bekzod", priceUzs: 100_000 }]);
    const ok = await createBooking(
      clientInput(w, { serviceId: w.beard.id, barberId: "any", assignedBarberId: w.bekzod.id, expectedPriceUzs: 100_000 }),
    );
    expect(ok.barberName).toBe("Bekzod");
  });
});

describe("A06/A07 reschedule and cancel", () => {
  it("A06: rescheduling onto a taken slot keeps the original booking", async () => {
    const mine = await createBooking(clientInput(w));
    await createBooking(clientInput(w, { startAt: at(DAY1, "14:00") }));
    const e = await errorOf(
      rescheduleBooking({ bookingId: mine.bookingId, newStartAt: at(DAY1, "14:30"), actor: { type: "client" }, now: NOW }),
    );
    expect(e.code).toBe("slot_taken");
    const [row] = await getDb().select().from(bookings).where(eq(bookings.id, mine.bookingId));
    expect(row!.status).toBe("confirmed");
    expect(row!.startAt.toISOString()).toBe(at(DAY1, "10:00"));
    expect(await events(mine.bookingId, "rescheduled")).toHaveLength(0);
  });

  it("A07: reschedule frees the old slot; repeated submit is a no-op", async () => {
    const mine = await createBooking(clientInput(w));
    const r1 = await rescheduleBooking({ bookingId: mine.bookingId, newStartAt: at(DAY1, "15:00"), actor: { type: "client" }, now: NOW });
    expect(r1.changed).toBe(true);
    const r2 = await rescheduleBooking({ bookingId: mine.bookingId, newStartAt: at(DAY1, "15:00"), actor: { type: "client" }, now: NOW });
    expect(r2.changed).toBe(false);
    expect(await events(mine.bookingId, "rescheduled")).toHaveLength(1);
    // Old slot is bookable again.
    const other = await createBooking(clientInput(w));
    expect(other.startAt).toBe(at(DAY1, "10:00"));
  });

  it("reschedule overlapping its own old interval works (shift by 15 min)", async () => {
    const mine = await createBooking(clientInput(w));
    const r = await rescheduleBooking({ bookingId: mine.bookingId, newStartAt: at(DAY1, "10:15"), actor: { type: "client" }, now: NOW });
    expect(r.startAt).toBe(at(DAY1, "10:15"));
  });

  it("changing barber requires confirming that barber's price", async () => {
    const mine = await createBooking(clientInput(w, { serviceId: w.beard.id, expectedPriceUzs: 90_000 }));
    const e = await errorOf(
      rescheduleBooking({ bookingId: mine.bookingId, newStartAt: at(DAY1, "11:00"), newBarberId: w.bekzod.id, expectedPriceUzs: 90_000, actor: { type: "client" }, now: NOW }),
    );
    expect(e.code).toBe("price_changed");
    const r = await rescheduleBooking({ bookingId: mine.bookingId, newStartAt: at(DAY1, "11:00"), newBarberId: w.bekzod.id, expectedPriceUzs: 100_000, actor: { type: "client" }, now: NOW });
    expect(r.barberName).toBe("Bekzod");
    expect(r.priceUzs).toBe(100_000);
  });

  it("A07: cancel frees the slot; cancelling twice is not an error and logs once", async () => {
    const mine = await createBooking(clientInput(w));
    const c1 = await cancelBooking({ bookingId: mine.bookingId, actor: { type: "client" }, now: NOW });
    expect(c1).toEqual({ status: "cancelled_by_client", changed: true });
    const c2 = await cancelBooking({ bookingId: mine.bookingId, actor: { type: "client" }, now: NOW });
    expect(c2.changed).toBe(false);
    expect(await events(mine.bookingId, "cancelled")).toHaveLength(1);
    const again = await createBooking(clientInput(w));
    expect(again.startAt).toBe(at(DAY1, "10:00"));
    // Cancelled booking can't be rescheduled by the client.
    const e = await errorOf(rescheduleBooking({ bookingId: mine.bookingId, newStartAt: at(DAY1, "16:00"), actor: { type: "client" }, now: NOW }));
    expect(e.code).toBe("too_late");
  });

  it("client changes are refused inside the cutoff window", async () => {
    const mine = await createBooking(clientInput(w));
    const late = Date.parse(at(DAY1, "10:00")) - 11 * 3600_000;
    const e = await errorOf(cancelBooking({ bookingId: mine.bookingId, actor: { type: "client" }, now: late }));
    expect(e.code).toBe("too_late");
    // Admin can still cancel, with a reason.
    const r = await cancelBooking({ bookingId: mine.bookingId, actor: w.adminActor, reason: "client called", now: late });
    expect(r.status).toBe("cancelled_by_staff");
  });

  it("barbers can't cancel; outcomes only after the start time and only own bookings", async () => {
    const mine = await createBooking(clientInput(w));
    expect((await errorOf(cancelBooking({ bookingId: mine.bookingId, actor: w.barberActor, now: NOW }))).code).toBe("forbidden");
    expect((await errorOf(setOutcome({ bookingId: mine.bookingId, outcome: "completed", actor: w.barberActor, now: NOW }))).code).toBe("not_modifiable");
    const after = Date.parse(at(DAY1, "11:00"));
    expect(await setOutcome({ bookingId: mine.bookingId, outcome: "completed", actor: w.barberActor, now: after })).toEqual({ changed: true });
    const other = await createBooking(clientInput(w, { barberId: w.bekzod.id }));
    expect((await errorOf(setOutcome({ bookingId: other.bookingId, outcome: "no_show", actor: w.barberActor, now: after }))).code).toBe("forbidden");
  });
});

describe("availability listing", () => {
  it("lists slots per barber and hides taken ones", async () => {
    await createBooking(clientInput(w));
    const db = getDb();
    const settings = await getSettings(db);
    const offerings = await loadOfferings(db, w.cut.id);
    const data = await loadSchedule(db, settings.timezone, offerings.map((o) => o.barberId), DAY1, DAY1);
    const slots = mergeSlots(data, offerings, DAY1, clientPolicy(settings, NOW));
    const ten = slots.find((s) => s.startAt === at(DAY1, "10:00"));
    expect(ten?.barberIds).toEqual([w.bekzod.id]);
    expect(slots.at(-1)?.startAt).toBe(at(DAY1, "18:45")); // 18:45 + 60 + 15 = 20:00
  });
});
