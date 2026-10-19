import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { barberServices, bookings, salons } from "@/lib/db/schema";
import { clientPolicy, loadOfferings, loadSchedule, mergeSlots } from "@/lib/server/availability";
import { cancelBooking, createBooking, rescheduleBooking, setOutcome } from "@/lib/server/bookings";
import { DomainError } from "@/lib/server/errors";
import { createTimeBlock, replaceWeeklyHours, setBarberActive, setDateException } from "@/lib/server/schedule-admin";
import { getSalon } from "@/lib/server/settings";
import { bookingDetail, listBookings } from "@/lib/server/staff-data";
import { DAY1, NOW, at, buildWorld, clientInput, resetDatabase, type World } from "./harness";

let A: World;
let B: World;
beforeEach(async () => {
  await resetDatabase();
  A = await buildWorld("salon-a");
  B = await buildWorld("salon-b");
});

async function errorOf(p: Promise<unknown>): Promise<DomainError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error("expected a DomainError");
}

const userOf = (w: World, actor = w.adminActor) => ({
  id: actor.userId,
  salonId: w.salon.id,
  email: "x",
  name: "x",
  role: actor.role,
  barberId: actor.barberId,
});

async function slots(w: World) {
  const db = getDb();
  const s = await getSalon(db, w.salon.id);
  const offerings = await loadOfferings(db, w.cut.id);
  const data = await loadSchedule(db, s, offerings.map((o) => o.barberId), DAY1, DAY1);
  return mergeSlots(data, offerings, DAY1, clientPolicy(s, NOW));
}

describe("tenant isolation", () => {
  it("staff of one salon can't touch another salon's bookings", async () => {
    const a = await createBooking(clientInput(A));
    expect((await errorOf(cancelBooking({ bookingId: a.bookingId, actor: B.adminActor, reason: "x", now: NOW }))).code).toBe("not_found");
    expect(
      (await errorOf(rescheduleBooking({ bookingId: a.bookingId, newStartAt: at(DAY1, "15:00"), actor: B.adminActor, reason: "x", now: NOW }))).code,
    ).toBe("not_found");
    const later = Date.parse(at(DAY1, "12:00"));
    expect((await errorOf(setOutcome({ bookingId: a.bookingId, outcome: "no_show", actor: B.adminActor, now: later }))).code).toBe("not_found");
    const [row] = await getDb().select().from(bookings).where(eq(bookings.id, a.bookingId));
    expect(row!.status).toBe("confirmed");
  });

  it("staff of one salon can't change another salon's schedule or barbers", async () => {
    const block = { actor: B.adminActor, barberId: A.anvar.id, kind: "break" as const, startAt: new Date(at(DAY1, "13:00")), endAt: new Date(at(DAY1, "14:00")) };
    expect((await errorOf(createTimeBlock(block))).code).toBe("not_found");
    expect((await errorOf(replaceWeeklyHours({ actor: B.adminActor, barberId: A.anvar.id, hours: {}, now: NOW }))).code).toBe("not_found");
    expect((await errorOf(setBarberActive({ actor: B.adminActor, barberId: A.anvar.id, active: false, now: NOW }))).code).toBe("not_found");
    expect((await errorOf(setDateException({ actor: B.adminActor, barberId: A.anvar.id, date: DAY1, kind: "closed", now: NOW }))).code).toBe("not_found");
  });

  it("staff can't create bookings in another salon", async () => {
    const e = await errorOf(createBooking(clientInput(A, { source: "staff", actorUserId: B.adminActor.userId, actorSalonId: B.salon.id })));
    expect(e.code).toBe("forbidden");
  });

  it("salon-wide hours and closures only affect their own salon", async () => {
    await setDateException({ actor: B.adminActor, barberId: null, date: DAY1, kind: "closed", now: NOW });
    await replaceWeeklyHours({ actor: B.adminActor, barberId: null, hours: {}, now: NOW });
    expect(await slots(B)).toEqual([]);
    expect((await slots(A)).length).toBeGreaterThan(20);
  });

  it("staff lists and details never include other salons' bookings", async () => {
    const a = await createBooking(clientInput(A));
    await createBooking(clientInput(B));
    const settingsB = await getSalon(getDb(), B.salon.id);
    const list = await listBookings(userOf(B), settingsB, { page: 1, pageSize: 50 });
    expect(list.total).toBe(1);
    expect(list.rows.every((r) => r.barberName === "Anvar" || r.barberName === "Bekzod")).toBe(true);
    expect(list.rows.map((r) => r.id)).not.toContain(a.bookingId);
    expect(await bookingDetail(userOf(B), a.bookingId)).toBeNull();
    // Searching by the other salon's phone/code finds nothing.
    const byCode = await listBookings(userOf(B), settingsB, { q: a.code, page: 1, pageSize: 50 });
    expect(byCode.total).toBe(0);
  });

  it("the database rejects cross-salon references (composite foreign keys)", async () => {
    await expect(
      getDb().insert(barberServices).values({ salonId: B.salon.id, barberId: A.anvar.id, serviceId: B.cut.id }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    const a = await createBooking(clientInput(A));
    await expect(getDb().execute(sql`update bookings set salon_id = ${B.salon.id} where id = ${a.bookingId}`)).rejects.toMatchObject({
      cause: { code: "23503" },
    });
  });

  it("an unpublished salon takes no online bookings but staff can still book", async () => {
    await getDb().update(salons).set({ published: false }).where(eq(salons.id, A.salon.id));
    expect((await errorOf(createBooking(clientInput(A)))).code).toBe("service_unavailable");
    const staff = await createBooking(clientInput(A, { source: "staff", actorUserId: A.adminActor.userId, actorSalonId: A.salon.id }));
    expect(staff.code).toBeTruthy();
  });

  it("barber offerings never mix salons", async () => {
    const offers = await loadOfferings(getDb(), A.cut.id);
    expect(offers.map((o) => o.barberName).sort()).toEqual(["Anvar", "Bekzod"]);
    expect(offers.every((o) => o.salonId === A.salon.id)).toBe(true);
  });
});
