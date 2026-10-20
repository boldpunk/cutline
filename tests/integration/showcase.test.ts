import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { barbers, bookings, salonGallery, salons, users } from "@/lib/db/schema";
import { getGallery } from "@/lib/server/public-data";
import { registerSalon } from "@/lib/server/onboarding";
import { seedDemo } from "../../scripts/seed-demo";
import { resetDatabase } from "./harness";

beforeEach(resetDatabase);

const quiet = { log: () => {} };

describe("public demo showcase", () => {
  it("builds the demo salon with illustrations, gallery and amenities", async () => {
    await seedDemo({ ...quiet, morki: false, withBookings: false });
    const db = getDb();
    const [demo] = await db.select().from(salons).where(eq(salons.slug, "demo"));
    expect(demo?.mode).toBe("demo");
    expect(demo?.heroMediaId).toBeTruthy();
    expect(demo?.amenities.length).toBeGreaterThan(0);
    const team = await db.select().from(barbers).where(eq(barbers.salonId, demo!.id));
    expect(team.every((b) => b.photoMediaId)).toBe(true);
    const gallery = await getGallery(demo!.id);
    expect(gallery).toHaveLength(9);
    expect(gallery[0]?.url).toMatch(/^\/media\/[0-9a-f-]{36}$/);
  });

  it("reset rebuilds only the demo salon and never touches a real one", async () => {
    const real = await registerSalon({
      businessName: "Morki Barber",
      slug: "morki",
      ownerName: "Morki",
      email: "owner@example.com",
      password: "long-enough-pass",
      ownerIsBarber: true,
    });
    await seedDemo({ ...quiet, morki: false, withBookings: false });
    const db = getDb();
    const [first] = await db.select({ id: salons.id }).from(salons).where(eq(salons.slug, "demo"));
    // A visitor's edit through the public demo login…
    await db.update(salons).set({ name: "Defaced" }).where(eq(salons.id, first!.id));

    await seedDemo({ ...quiet, reset: true, morki: false, withBookings: false });
    const [second] = await db.select().from(salons).where(eq(salons.slug, "demo"));
    expect(second!.id).not.toBe(first!.id);
    expect(second!.name).toBe("CUTLINE");
    expect(await db.select().from(salonGallery).where(eq(salonGallery.salonId, first!.id))).toHaveLength(0);

    const [morki] = await db.select().from(salons).where(eq(salons.id, real.salonId));
    expect(morki?.slug).toBe("morki");
    expect(await db.select().from(users).where(eq(users.salonId, real.salonId))).toHaveLength(1);
  });

  it("leaves a live salon that happens to use the 'demo' address alone", async () => {
    const db = getDb();
    await db.insert(salons).values({ slug: "demo", name: "Real", mode: "live", published: true });
    await seedDemo({ ...quiet, reset: true, morki: false });
    const rows = await db.select().from(salons).where(eq(salons.slug, "demo"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Real");
    expect(await db.select().from(bookings)).toHaveLength(0);
  });
});
