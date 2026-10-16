// Demo data for local development and the portfolio demo.
// EVERYTHING here is fictional: people, prices, durations, hours, bookings.
// Never run against a live salon database (the script refuses if mode = 'live').
import { randomUUID } from "node:crypto";
import { closeDb, getDb } from "@/lib/db/client";
import {
  barberServices,
  barbers,
  salonSettings,
  services,
  timeBlocks,
  users,
  weeklyAvailability,
} from "@/lib/db/schema";
import { normalizePhone } from "@/lib/domain/phone";
import { addDays, todayIn, utcToZoned, zonedToUtc } from "@/lib/domain/time";
import { clientPolicy, loadOfferings, loadSchedule, slotsFor } from "@/lib/server/availability";
import { createBooking } from "@/lib/server/bookings";
import { hashPassword } from "@/lib/server/passwords";
import { getSettings } from "@/lib/server/settings";
import { migrate } from "./migrate";

const TZ = "Asia/Tashkent";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-cutline-2026";

export async function seedDemo(opts: { withBookings?: boolean; log?: (s: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const db = getDb();
  const [existing] = await db.select().from(salonSettings);
  if (existing?.mode === "live") throw new Error("Refusing to seed demo data into a live database.");
  if (existing) {
    log("Demo data already present — skipping. (Drop the database to reseed.)");
    return;
  }

  await db.insert(salonSettings).values({
    id: 1,
    name: "CUTLINE",
    tagline: "Мужские стрижки и борода по записи. Время и цена известны заранее.",
    about:
      "Демонстрационный барбершоп. Сайт показывает, как работает онлайн-запись: свободное время считается по реальному расписанию мастеров.",
    address: null,
    mapUrl: null,
    phone: null,
    socials: [],
    timezone: TZ,
    slotStepMin: 15,
    minLeadMin: 60,
    horizonDays: 60,
    cancelCutoffHours: 12,
    mode: "demo",
    barbersCanBlock: true,
    privacyController: null,
    privacyContact: null,
    retentionDays: 365,
    consentVersion: "demo-2026-10",
  });

  // Salon hours: Mon–Sat 10–21, Sun 11–19 (demo values).
  await db.insert(weeklyAvailability).values([
    ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ barberId: null, weekday, startMin: 600, endMin: 1260 })),
    { barberId: null, weekday: 7, startMin: 660, endMin: 1140 },
  ]);

  const svc = await db
    .insert(services)
    .values([
      {
        name: "Мужская стрижка",
        description: "Стрижка ножницами и машинкой, мытьё головы, укладка.",
        category: "Стрижки",
        durationMin: 60,
        priceUzs: 150_000,
        bufferAfterMin: 10,
        sortOrder: 1,
        isDemo: true,
      },
      {
        name: "Оформление бороды",
        description: "Коррекция формы, контуры, горячее полотенце.",
        category: "Борода",
        durationMin: 30,
        priceUzs: 90_000,
        bufferAfterMin: 5,
        sortOrder: 2,
        isDemo: true,
      },
      {
        name: "Стрижка машинкой",
        description: "Одна или две насадки, окантовка.",
        category: "Стрижки",
        durationMin: 30,
        priceUzs: 80_000,
        bufferAfterMin: 5,
        sortOrder: 3,
        isDemo: true,
      },
      {
        name: "Стрижка + борода",
        description: "Мужская стрижка и оформление бороды за один визит.",
        category: "Комплекс",
        durationMin: 90,
        priceUzs: 220_000,
        bufferAfterMin: 10,
        sortOrder: 4,
        isDemo: true,
      },
    ])
    .returning();
  const byName = Object.fromEntries(svc.map((s) => [s.name, s]));

  const team = await db
    .insert(barbers)
    .values([
      { name: "Тимур", specialization: "Классические стрижки", bio: "Вымышленный мастер для демонстрации.", sortOrder: 1, isDemo: true },
      { name: "Алишер", specialization: "Фейды и борода", bio: "Вымышленный мастер для демонстрации.", sortOrder: 2, isDemo: true },
      { name: "Дмитрий", specialization: "Короткие стрижки", bio: "Вымышленный мастер для демонстрации.", sortOrder: 3, isDemo: true },
    ])
    .returning();
  const [timur, alisher, dmitry] = team as [typeof team[number], typeof team[number], typeof team[number]];

  await db.insert(barberServices).values([
    { barberId: timur.id, serviceId: byName["Мужская стрижка"]!.id },
    { barberId: timur.id, serviceId: byName["Стрижка машинкой"]!.id },
    { barberId: timur.id, serviceId: byName["Стрижка + борода"]!.id },
    // Demonstrates a per-barber price.
    { barberId: alisher.id, serviceId: byName["Мужская стрижка"]!.id, priceUzs: 170_000 },
    { barberId: alisher.id, serviceId: byName["Оформление бороды"]!.id },
    { barberId: alisher.id, serviceId: byName["Стрижка + борода"]!.id, priceUzs: 240_000 },
    { barberId: dmitry.id, serviceId: byName["Мужская стрижка"]!.id },
    { barberId: dmitry.id, serviceId: byName["Стрижка машинкой"]!.id },
    { barberId: dmitry.id, serviceId: byName["Оформление бороды"]!.id },
  ]);

  await db.insert(weeklyAvailability).values([
    // Тимур: Mon–Fri 10–19 with a 14–15 lunch break
    ...[1, 2, 3, 4, 5].flatMap((weekday) => [
      { barberId: timur.id, weekday, startMin: 600, endMin: 840 },
      { barberId: timur.id, weekday, startMin: 900, endMin: 1140 },
    ]),
    // Алишер: Tue–Sat 12–21
    ...[2, 3, 4, 5, 6].map((weekday) => ({ barberId: alisher.id, weekday, startMin: 720, endMin: 1260 })),
    // Дмитрий: Wed–Sun 10–18 (salon opens 11 on Sunday → effective 11–18)
    ...[3, 4, 5, 6, 7].map((weekday) => ({ barberId: dmitry.id, weekday, startMin: 600, endMin: 1080 })),
  ]);

  const pw = await hashPassword(DEMO_PASSWORD);
  await db.insert(users).values([
    { email: "admin@demo.cutline", name: "Администратор (демо)", passwordHash: pw, role: "admin" },
    { email: "timur@demo.cutline", name: "Тимур", passwordHash: pw, role: "barber", barberId: timur.id },
    { email: "alisher@demo.cutline", name: "Алишер", passwordHash: pw, role: "barber", barberId: alisher.id },
    { email: "dmitry@demo.cutline", name: "Дмитрий", passwordHash: pw, role: "barber", barberId: dmitry.id },
  ]);

  // A personal break for Алишер two days from now, 15:00–16:00.
  const today = todayIn(TZ);
  const d2 = addDays(today, 2);
  await db.insert(timeBlocks).values({
    barberId: alisher.id,
    kind: "break",
    startAt: new Date(zonedToUtc(d2, 900, TZ)),
    endAt: new Date(zonedToUtc(d2, 960, TZ)),
    note: "Демо-перерыв",
  });

  if (opts.withBookings !== false) {
    // A handful of fictional bookings over the next days, created through the
    // normal booking path so they obey every rule.
    const settings = await getSettings(db);
    const now = Date.now();
    const policy = clientPolicy(settings, now);
    let n = 0;
    for (let day = 1; day <= 6 && n < 8; day++) {
      const date = addDays(today, day);
      for (const svcName of ["Мужская стрижка", "Оформление бороды", "Стрижка + борода"]) {
        const offerings = await loadOfferings(db, byName[svcName]!.id);
        const data = await loadSchedule(db, TZ, offerings.map((o) => o.barberId), date, date);
        const o = offerings[(day + n) % offerings.length]!;
        const slots = slotsFor(data, o, date, policy);
        const start = slots[(day * 3 + n * 5) % Math.max(1, slots.length)];
        if (start === undefined) continue;
        n++;
        await createBooking({
          serviceId: o.serviceId,
          barberId: o.barberId,
          startAt: new Date(start).toISOString(),
          expectedPriceUzs: o.priceUzs,
          clientName: `Демо-клиент ${n}`,
          phoneE164: normalizePhone(`+99890000${String(n).padStart(4, "0")}`) ?? "+998900000000",
          comment: "Вымышленная запись для демонстрации",
          consentVersion: settings.consentVersion,
          idempotencyKey: randomUUID(),
          source: "staff",
        });
        log(`demo booking ${n}: ${o.barberName}, ${svcName}, ${utcToZoned(start, TZ).date}`);
      }
    }
  }

  log("");
  log("Demo data created (all people, prices and bookings are fictional).");
  log(`Staff login: admin@demo.cutline / ${DEMO_PASSWORD}`);
  log(`Barbers:     timur@demo.cutline, alisher@demo.cutline, dmitry@demo.cutline (same password)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  migrate(url)
    .then(() => seedDemo())
    .then(() => closeDb())
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
