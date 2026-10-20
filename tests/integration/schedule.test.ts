import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditLog, bookings, salons } from "@/lib/db/schema";
import { clientPolicy, loadOfferings, loadSchedule, mergeSlots, dayStatus } from "@/lib/server/availability";
import { cancelBooking, createBooking } from "@/lib/server/bookings";
import { DomainError } from "@/lib/server/errors";
import {
  createTimeBlock,
  replaceWeeklyHours,
  setBarberActive,
  setDateException,
} from "@/lib/server/schedule-admin";
import { getSalon } from "@/lib/server/settings";
import { DAY1, NOW, at, buildWorld, clientInput, resetDatabase, type World } from "./harness";

let w: World;
beforeEach(async () => {
  await resetDatabase();
  w = await buildWorld();
});

async function slotsOn(date: string, barberId: string, serviceId = w.cut.id) {
  const db = getDb();
  const settings = await getSalon(db, w.salon.id);
  const offerings = await loadOfferings(db, serviceId, [barberId]);
  const data = await loadSchedule(db, settings, [barberId], date, date);
  return mergeSlots(data, offerings, date, clientPolicy(settings, NOW)).map((s) => s.startAt);
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

describe("A04 breaks, vacations, closures", () => {
  it("a personal break removes overlapping slots", async () => {
    await createTimeBlock({ actor: w.barberActor, barberId: w.anvar.id, kind: "break", startAt: new Date(at(DAY1, "13:00")), endAt: new Date(at(DAY1, "14:00")) });
    const s = await slotsOn(DAY1, w.anvar.id);
    expect(s).toContain(at(DAY1, "11:45")); // 11:45 + 75 = 13:00
    expect(s).not.toContain(at(DAY1, "12:00"));
    expect(s).not.toContain(at(DAY1, "13:30"));
    expect(s).toContain(at(DAY1, "14:00"));
  });

  it("a vacation spanning days removes all its slots", async () => {
    await createTimeBlock({ actor: w.adminActor, barberId: w.anvar.id, kind: "vacation", startAt: new Date(at(DAY1, "00:00")), endAt: new Date(at("2030-01-10", "00:00")) });
    expect(await slotsOn(DAY1, w.anvar.id)).toEqual([]);
    expect(await slotsOn("2030-01-09", w.anvar.id)).toEqual([]);
    expect((await slotsOn("2030-01-10", w.anvar.id)).length).toBeGreaterThan(0);
  });

  it("a salon closure removes every barber's slots and labels the day closed", async () => {
    await setDateException({ actor: w.adminActor, barberId: null, date: DAY1, kind: "closed", now: NOW });
    expect(await slotsOn(DAY1, w.anvar.id)).toEqual([]);
    expect(await slotsOn(DAY1, w.bekzod.id)).toEqual([]);
    const db = getDb();
    const settings = await getSalon(db, w.salon.id);
    const offerings = await loadOfferings(db, w.cut.id);
    const data = await loadSchedule(db, settings, offerings.map((o) => o.barberId), DAY1, "2030-01-09");
    expect(dayStatus(data, offerings, DAY1, clientPolicy(settings, NOW))).toBe("closed");
    expect(dayStatus(data, offerings, "2030-01-09", clientPolicy(settings, NOW))).toBe("available");
  });

  it("shortened hours: a service is offered only if it fits completely", async () => {
    await setDateException({ actor: w.adminActor, barberId: w.anvar.id, date: DAY1, kind: "hours", ranges: [{ startMin: 600, endMin: 720 }], now: NOW });
    const s = await slotsOn(DAY1, w.anvar.id);
    expect(s.at(-1)).toBe(at(DAY1, "10:45")); // 10:45 + 60 + 15 buffer = 12:00
  });

  it("a barber can't block time over a confirmed booking", async () => {
    await createBooking(clientInput(w, { startAt: at(DAY1, "13:00") }));
    const e = await errorOf(
      createTimeBlock({ actor: w.barberActor, barberId: w.anvar.id, kind: "break", startAt: new Date(at(DAY1, "13:30")), endAt: new Date(at(DAY1, "14:00")) }),
    );
    expect(e.code).toBe("schedule_conflict");
    expect((e.details!.affected as unknown[]).length).toBe(1);
    // The booking is untouched.
    const rows = await getDb().select().from(bookings);
    expect(rows[0]!.status).toBe("confirmed");
  });

  it("a barber can't block another barber's time, nor any time when disabled by admin", async () => {
    const e1 = await errorOf(createTimeBlock({ actor: w.barberActor, barberId: w.bekzod.id, kind: "break", startAt: new Date(at(DAY1, "13:00")), endAt: new Date(at(DAY1, "14:00")) }));
    expect(e1.code).toBe("forbidden");
    await getDb().update(salons).set({ barbersCanBlock: false }).where(eq(salons.id, w.salon.id));
    const e2 = await errorOf(createTimeBlock({ actor: w.barberActor, barberId: w.anvar.id, kind: "break", startAt: new Date(at(DAY1, "13:00")), endAt: new Date(at(DAY1, "14:00")) }));
    expect(e2.code).toBe("forbidden");
  });

  it("booking and block racing for the same time: exactly one wins", async () => {
    for (let i = 0; i < 5; i++) {
      await resetDatabase();
      w = await buildWorld();
      const results = await Promise.allSettled([
        createBooking(clientInput(w, { startAt: at(DAY1, "13:00") })),
        createTimeBlock({ actor: w.adminActor, barberId: w.anvar.id, kind: "break", startAt: new Date(at(DAY1, "13:00")), endAt: new Date(at(DAY1, "14:00")) }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    }
  });
});

describe("A10 schedule changes over future bookings", () => {
  it("shrinking weekly hours is refused with the affected bookings listed", async () => {
    const b = await createBooking(clientInput(w, { startAt: at(DAY1, "18:00") }));
    const allDays = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, [{ startMin: 600, endMin: 1020 }]]));
    const e = await errorOf(replaceWeeklyHours({ actor: w.adminActor, barberId: w.anvar.id, hours: allDays, now: NOW }));
    expect(e.code).toBe("schedule_conflict");
    expect((e.details!.affected as { id: string }[]).map((a) => a.id)).toEqual([b.bookingId]);
    // Nothing was saved: Anvar still has evening slots on another day.
    expect(await slotsOn("2030-01-09", w.anvar.id)).toContain(at("2030-01-09", "18:00"));
    // After the admin resolves the booking, the change goes through.
    await cancelBooking({ bookingId: b.bookingId, actor: w.adminActor, reason: "schedule change", now: NOW });
    await replaceWeeklyHours({ actor: w.adminActor, barberId: w.anvar.id, hours: allDays, now: NOW });
    expect(await slotsOn("2030-01-09", w.anvar.id)).not.toContain(at("2030-01-09", "18:00"));
    expect((await getDb().select().from(auditLog)).map((a) => a.action)).toContain("weekly_hours.replace");
  });

  it("closing the salon on a day with bookings is refused", async () => {
    await createBooking(clientInput(w, { barberId: w.bekzod.id, startAt: at(DAY1, "12:00") }));
    const e = await errorOf(setDateException({ actor: w.adminActor, barberId: null, date: DAY1, kind: "closed", now: NOW }));
    expect(e.code).toBe("schedule_conflict");
  });

  it("deactivating a barber with future bookings is refused", async () => {
    await createBooking(clientInput(w));
    const e = await errorOf(setBarberActive({ actor: w.adminActor, barberId: w.anvar.id, active: false, now: NOW }));
    expect(e.code).toBe("schedule_conflict");
    const [row] = await getDb().select().from(bookings).where(eq(bookings.barberId, w.anvar.id));
    expect(row!.status).toBe("confirmed");
  });

  it("barbers can't edit weekly hours", async () => {
    const e = await errorOf(replaceWeeklyHours({ actor: w.barberActor, barberId: w.anvar.id, hours: {}, now: NOW }));
    expect(e.code).toBe("forbidden");
  });
});
