import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { barberServices, barbers, salons, services, users, weeklyAvailability } from "@/lib/db/schema";
import { createBooking } from "@/lib/server/bookings";
import { DomainError } from "@/lib/server/errors";
import { registerSalon, setPublished, setupStatus } from "@/lib/server/onboarding";
import { DAY1, at, clientInput, resetDatabase } from "./harness";

beforeEach(resetDatabase);

async function errorOf(p: Promise<unknown>): Promise<DomainError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error("expected a DomainError");
}

const input = (over: Partial<Parameters<typeof registerSalon>[0]> = {}) => ({
  businessName: "Morki Barber",
  slug: "morki",
  ownerName: "Morki",
  email: "owner@morki.test",
  password: "long-enough-password",
  instagramUrl: "https://www.instagram.com/morki_barber/",
  ownerIsBarber: true,
  ...over,
});

describe("self-serve onboarding", () => {
  it("creates an unpublished salon, its admin and (optionally) the owner's barber profile", async () => {
    const { salonId, userId } = await registerSalon(input());
    const [salon] = await getDb().select().from(salons).where(eq(salons.id, salonId));
    expect(salon).toMatchObject({ slug: "morki", name: "Morki Barber", published: false, mode: "live" });
    const [user] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(user!.role).toBe("admin");
    expect(user!.passwordHash).not.toContain("long-enough");
    const team = await getDb().select().from(barbers).where(eq(barbers.salonId, salonId));
    expect(team.map((b) => b.name)).toEqual(["Morki"]);
    expect(user!.barberId).toBe(team[0]!.id);
  });

  it("refuses taken, reserved or malformed addresses and duplicate e-mails", async () => {
    await registerSalon(input());
    expect((await errorOf(registerSalon(input({ email: "x@y.z" })))).message).toMatch(/занят/);
    expect((await errorOf(registerSalon(input({ slug: "other", email: "OWNER@morki.test" })))).message).toMatch(/e-mail/);
    expect((await errorOf(registerSalon(input({ slug: "staff", email: "a@b.c" })))).message).toMatch(/зарезервирован/);
    expect((await errorOf(registerSalon(input({ slug: "Морки", email: "a@b.c" })))).code).toBe("validation");
    expect((await errorOf(registerSalon(input({ slug: "ok-slug", email: "a@b.c", password: "short" })))).code).toBe("validation");
  });

  it("publishing requires every checklist step; then online booking opens", async () => {
    const { salonId, userId } = await registerSalon(input());
    let st = await setupStatus(salonId);
    expect(st.ready).toBe(false);
    expect(st.steps.filter((s) => s.done)).toHaveLength(0);
    expect((await errorOf(setPublished(salonId, userId, true))).message).toMatch(/Сначала заполните/);

    const db = getDb();
    const [barber] = await db.select().from(barbers).where(eq(barbers.salonId, salonId));
    const [svc] = await db.insert(services).values({ salonId, name: "Стрижка", durationMin: 60, priceUzs: 100_000 }).returning();
    await db.insert(barberServices).values({ salonId, barberId: barber!.id, serviceId: svc!.id });
    const days = [1, 2, 3, 4, 5, 6, 7];
    await db.insert(weeklyAvailability).values([
      ...days.map((weekday) => ({ salonId, barberId: null, weekday, startMin: 600, endMin: 1200 })),
      ...days.map((weekday) => ({ salonId, barberId: barber!.id, weekday, startMin: 600, endMin: 1200 })),
    ]);
    await db
      .update(salons)
      .set({ phone: "+998 90 000 00 00", privacyController: "ИП Morki", privacyContact: "owner@morki.test", retentionDays: 365 })
      .where(eq(salons.id, salonId));
    st = await setupStatus(salonId);
    expect(st.ready).toBe(true);

    // Before publishing, the public booking path is closed.
    const draftAttempt = clientInput({ cut: svc!, anvar: barber! } as never, { serviceId: svc!.id, barberId: barber!.id, expectedPriceUzs: 100_000, startAt: at(DAY1, "10:00") });
    expect((await errorOf(createBooking(draftAttempt))).code).toBe("service_unavailable");
    await setPublished(salonId, userId, true);
    const ok = await createBooking({ ...draftAttempt, idempotencyKey: `${draftAttempt.idempotencyKey}-2` });
    expect(ok.code).toBeTruthy();
  });
});
