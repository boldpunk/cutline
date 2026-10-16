// Shared fixture for integration tests: a fresh schema in the test database
// and a small, fully known salon. Times are relative to a fixed "now".
import postgres from "postgres";
import { closeDb, getDb } from "@/lib/db/client";
import { barberServices, barbers, salonSettings, services, users, weeklyAvailability } from "@/lib/db/schema";
import { zonedToUtc } from "@/lib/domain/time";
import { migrate } from "../../scripts/migrate";

export const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://cutline:cutline@localhost:5432/cutline_test";
export const TZ = "Asia/Tashkent";

/** Monday 2030-01-07, 08:00 in Tashkent. */
export const NOW = zonedToUtc("2030-01-07", 8 * 60, TZ);
export const DAY1 = "2030-01-08"; // Tuesday
export const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(zonedToUtc(date, h! * 60 + m!, TZ)).toISOString();
};

export async function resetDatabase(): Promise<void> {
  process.env.DATABASE_URL = TEST_DB_URL;
  await closeDb();
  const sql = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; create schema public;");
  await sql.end();
  await migrate(TEST_DB_URL, () => {});
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

/** Two barbers working 10:00–20:00 every day; salon open 10:00–20:00. */
export async function buildWorld() {
  const db = getDb();
  await db.insert(salonSettings).values({
    id: 1,
    name: "Test salon",
    timezone: TZ,
    slotStepMin: 15,
    minLeadMin: 60,
    horizonDays: 60,
    cancelCutoffHours: 12,
    mode: "demo",
    barbersCanBlock: true,
    consentVersion: "test-1",
  });
  const [cut, beard] = await db
    .insert(services)
    .values([
      { name: "Haircut", durationMin: 60, priceUzs: 150_000, bufferAfterMin: 15, sortOrder: 1 },
      { name: "Beard", durationMin: 30, priceUzs: 90_000, sortOrder: 2 },
    ])
    .returning();
  const [a, b] = await db
    .insert(barbers)
    .values([
      { name: "Anvar", sortOrder: 1 },
      { name: "Bekzod", sortOrder: 2 },
    ])
    .returning();
  await db.insert(barberServices).values([
    { barberId: a!.id, serviceId: cut!.id },
    { barberId: b!.id, serviceId: cut!.id },
    { barberId: a!.id, serviceId: beard!.id },
    { barberId: b!.id, serviceId: beard!.id, priceUzs: 100_000 },
  ]);
  const days = [1, 2, 3, 4, 5, 6, 7];
  await db.insert(weeklyAvailability).values([
    ...days.map((weekday) => ({ barberId: null, weekday, startMin: 600, endMin: 1200 })),
    ...days.map((weekday) => ({ barberId: a!.id, weekday, startMin: 600, endMin: 1200 })),
    ...days.map((weekday) => ({ barberId: b!.id, weekday, startMin: 600, endMin: 1200 })),
  ]);
  const [admin, barberUser] = await db
    .insert(users)
    .values([
      { email: "admin@test", name: "Admin", passwordHash: "x", role: "admin" },
      { email: "anvar@test", name: "Anvar", passwordHash: "x", role: "barber", barberId: a!.id },
    ])
    .returning();
  return {
    cut: cut!,
    beard: beard!,
    anvar: a!,
    bekzod: b!,
    adminActor: { type: "staff" as const, userId: admin!.id, role: "admin" as const, barberId: null },
    barberActor: { type: "staff" as const, userId: barberUser!.id, role: "barber" as const, barberId: a!.id },
  };
}

let seq = 0;
export function clientInput(world: World, overrides: Record<string, unknown> = {}) {
  seq++;
  return {
    serviceId: world.cut.id,
    barberId: world.anvar.id,
    startAt: at(DAY1, "10:00"),
    expectedPriceUzs: 150_000,
    clientName: `Client ${seq}`,
    phoneE164: "+998901234567",
    consentVersion: "test-1",
    idempotencyKey: `test-key-${seq}-${Math.random().toString(36).slice(2)}`,
    source: "online" as const,
    now: NOW,
    ...overrides,
  };
}
