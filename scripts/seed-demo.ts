// Demo data for local development and the public showcase.
// EVERYTHING here is fictional: people, prices, durations, hours, bookings.
// The pictures are flat illustrations drawn by scripts/demo-art/generate.mjs.
// `--showcase` (used on the live site): rebuild the demo salon from scratch on
// every start, so it always has fresh upcoming bookings and any edits made by
// visitors through the public demo login are wiped. Real salons are untouched.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { closeDb, getDb } from "@/lib/db/client";
import { and, eq, sql } from "drizzle-orm";
import {
  barberServices,
  barbers,
  media,
  salonGallery,
  salons,
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
import { getSalon } from "@/lib/server/settings";
import { registerSalon } from "@/lib/server/onboarding";
import { migrate } from "./migrate";

const TZ = "Asia/Tashkent";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-cutline-2026";

const ART = path.join(import.meta.dirname, "demo-art");

async function storeArt(salonId: string, file: string): Promise<string> {
  const bytes = readFileSync(path.join(ART, file));
  const [row] = await getDb()
    .insert(media)
    .values({ salonId, contentType: "image/webp", bytes, size: bytes.length })
    .returning({ id: media.id });
  return row!.id;
}

export async function seedDemo(
  opts: { withBookings?: boolean; log?: (s: string) => void; morki?: boolean; reset?: boolean } = {},
) {
  const log = opts.log ?? console.log;
  const db = getDb();
  const [existing] = await db.select().from(salons).where(eq(salons.slug, "demo"));
  if (existing && existing.mode !== "demo") {
    log("A live salon uses the slug 'demo' — demo data not touched.");
    return;
  }
  if (opts.reset) {
    // Only seed-made salons are in demo mode. Everything of theirs cascades
    // (barbers, bookings, users, media…).
    await db.delete(salons).where(eq(salons.mode, "demo"));
    log("Demo salon reset.");
  } else if (existing) {
    // A database from an older version: keep its data, only add what's new.
    await addDemoArt(existing.id, log);
    if (opts.morki !== false) await seedMorki(log);
    log("Demo data already present — skipping. (Drop the database to reseed.)");
    return;
  }

  const [demo] = await db
    .insert(salons)
    .values({
    slug: "demo",
    published: true,
    theme: "pole",
    name: "CUTLINE",
    tagline: "Фейды, бороды и классика по записи. Время и цена известны заранее.",
    about:
      "Демонстрационный барбершоп: так выглядит страница салона на CUTLINE. Свободное время считается по настоящему расписанию мастеров, а запись нельзя поставить на занятое время.\n\nМастера, цены и записи вымышлены, картинки нарисованы.",
    amenities: ["coffee", "wifi", "playstation", "kids", "card", "towel"],
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
  })
    .returning();
  const salonId = demo!.id;

  // Salon hours: Mon–Sat 10–21, Sun 11–19 (demo values).
  await db.insert(weeklyAvailability).values([
    ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ salonId, barberId: null, weekday, startMin: 600, endMin: 1260 })),
    { salonId, barberId: null, weekday: 7, startMin: 660, endMin: 1140 },
  ]);

  const svc = await db
    .insert(services)
    .values([
      {
        salonId,
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
        salonId,
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
        salonId,
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
        salonId,
        name: "Стрижка + борода",
        description: "Мужская стрижка и оформление бороды за один визит.",
        category: "Комплекс",
        durationMin: 90,
        priceUzs: 220_000,
        bufferAfterMin: 10,
        sortOrder: 4,
        isDemo: true,
      },
      {
        salonId,
        name: "Королевское бритьё",
        description: "Опасная бритва, распаривание, горячее и холодное полотенце.",
        category: "Борода",
        durationMin: 45,
        priceUzs: 130_000,
        bufferAfterMin: 10,
        sortOrder: 5,
        isDemo: true,
      },
      {
        salonId,
        name: "Детская стрижка",
        description: "Для мальчиков до 12 лет. Есть детское кресло и мультики.",
        category: "Стрижки",
        durationMin: 40,
        priceUzs: 70_000,
        bufferAfterMin: 5,
        sortOrder: 6,
        isDemo: true,
      },
    ])
    .returning();
  const byName = Object.fromEntries(svc.map((s) => [s.name, s]));

  const team = await db
    .insert(barbers)
    .values([
      { salonId, name: "Тимур", specialization: "Топ-барбер · классика и пробор", bio: "Вымышленный мастер для демонстрации.", sortOrder: 1, isDemo: true },
      { salonId, name: "Алишер", specialization: "Бренд-барбер · фейды и борода", bio: "Вымышленный мастер для демонстрации.", sortOrder: 2, isDemo: true },
      { salonId, name: "Дмитрий", specialization: "Барбер · короткие и детские стрижки", bio: "Вымышленный мастер для демонстрации.", sortOrder: 3, isDemo: true },
    ])
    .returning();
  const [timur, alisher, dmitry] = team as [typeof team[number], typeof team[number], typeof team[number]];

  await db.insert(barberServices).values([
    { salonId, barberId: timur.id, serviceId: byName["Мужская стрижка"]!.id },
    { salonId, barberId: timur.id, serviceId: byName["Стрижка машинкой"]!.id },
    { salonId, barberId: timur.id, serviceId: byName["Стрижка + борода"]!.id },
    // Demonstrates a per-barber price.
    { salonId, barberId: alisher.id, serviceId: byName["Мужская стрижка"]!.id, priceUzs: 170_000 },
    { salonId, barberId: alisher.id, serviceId: byName["Оформление бороды"]!.id },
    { salonId, barberId: alisher.id, serviceId: byName["Стрижка + борода"]!.id, priceUzs: 240_000 },
    { salonId, barberId: dmitry.id, serviceId: byName["Мужская стрижка"]!.id },
    { salonId, barberId: dmitry.id, serviceId: byName["Стрижка машинкой"]!.id },
    { salonId, barberId: dmitry.id, serviceId: byName["Оформление бороды"]!.id },
    { salonId, barberId: alisher.id, serviceId: byName["Королевское бритьё"]!.id, priceUzs: 150_000 },
    { salonId, barberId: timur.id, serviceId: byName["Королевское бритьё"]!.id },
    { salonId, barberId: dmitry.id, serviceId: byName["Детская стрижка"]!.id },
    { salonId, barberId: timur.id, serviceId: byName["Детская стрижка"]!.id },
  ]);

  await db.insert(weeklyAvailability).values([
    // Тимур: Mon–Fri 10–19 with a 14–15 lunch break
    ...[1, 2, 3, 4, 5].flatMap((weekday) => [
      { salonId, barberId: timur.id, weekday, startMin: 600, endMin: 840 },
      { salonId, barberId: timur.id, weekday, startMin: 900, endMin: 1140 },
    ]),
    // Алишер: Tue–Sat 12–21
    ...[2, 3, 4, 5, 6].map((weekday) => ({ salonId, barberId: alisher.id, weekday, startMin: 720, endMin: 1260 })),
    // Дмитрий: Wed–Sun 10–18 (salon opens 11 on Sunday → effective 11–18)
    ...[3, 4, 5, 6, 7].map((weekday) => ({ salonId, barberId: dmitry.id, weekday, startMin: 600, endMin: 1080 })),
  ]);

  const pw = await hashPassword(DEMO_PASSWORD);
  await db.insert(users).values([
    { salonId, email: "admin@demo.cutline", name: "Администратор (демо)", passwordHash: pw, role: "admin" },
    { salonId, email: "timur@demo.cutline", name: "Тимур", passwordHash: pw, role: "barber", barberId: timur.id },
    { salonId, email: "alisher@demo.cutline", name: "Алишер", passwordHash: pw, role: "barber", barberId: alisher.id },
    { salonId, email: "dmitry@demo.cutline", name: "Дмитрий", passwordHash: pw, role: "barber", barberId: dmitry.id },
  ]);

  // A personal break for Алишер two days from now, 15:00–16:00.
  const today = todayIn(TZ);
  const d2 = addDays(today, 2);
  await db.insert(timeBlocks).values({
    salonId,
    barberId: alisher.id,
    kind: "break",
    startAt: new Date(zonedToUtc(d2, 900, TZ)),
    endAt: new Date(zonedToUtc(d2, 960, TZ)),
    note: "Демо-перерыв",
  });

  if (opts.withBookings !== false) {
    // A handful of fictional bookings over the next days, created through the
    // normal booking path so they obey every rule.
    const settings = await getSalon(db, salonId);
    const now = Date.now();
    const policy = clientPolicy(settings, now);
    let n = 0;
    for (let day = 0; day <= 6 && n < 16; day++) {
      const date = addDays(today, day);
      for (const svcName of ["Мужская стрижка", "Оформление бороды", "Стрижка + борода", "Королевское бритьё"]) {
        const offerings = await loadOfferings(db, byName[svcName]!.id);
        const data = await loadSchedule(db, settings, offerings.map((o) => o.barberId), date, date);
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
          actorSalonId: salonId,
        });
        log(`demo booking ${n}: ${o.barberName}, ${svcName}, ${utcToZoned(start, TZ).date}`);
      }
    }
  }

  await addDemoArt(salonId, log);
  if (opts.morki !== false) await seedMorki(log);

  log("");
  log("Demo data created (all people, prices and bookings are fictional).");
  log(`Staff login: admin@demo.cutline / ${DEMO_PASSWORD}`);
  log(`Barbers:     timur@demo.cutline, alisher@demo.cutline, dmitry@demo.cutline (same password)`);
}

const GALLERY: [string, string][] = [
  ["work-fade.webp", "Скин-фейд"],
  ["work-beard.webp", "Борода и контур"],
  ["work-crop.webp", "Кроп с текстурой"],
  ["work-classic.webp", "Классика с пробором"],
  ["work-undercut.webp", "Андеркат"],
  ["work-kid.webp", "Детская стрижка"],
  ["work-taper.webp", "Тейпер и короткая борода"],
  ["work-shave.webp", "Королевское бритьё"],
  ["work-gentleman.webp", "Пробор и густая борода"],
];

/** Hero, barber portraits and the works gallery — only where nothing is set yet. */
async function addDemoArt(salonId: string, log: (s: string) => void) {
  const db = getDb();
  const [s] = await db.select({ hero: salons.heroMediaId }).from(salons).where(eq(salons.id, salonId));
  if (!s?.hero) await db.update(salons).set({ heroMediaId: await storeArt(salonId, "hero.webp") }).where(eq(salons.id, salonId));
  const portraits: Record<string, string> = { Тимур: "barber-timur.webp", Алишер: "barber-alisher.webp", Дмитрий: "barber-dmitry.webp" };
  for (const b of await db.select().from(barbers).where(eq(barbers.salonId, salonId))) {
    const file = portraits[b.name];
    if (file && !b.photoMediaId) await db.update(barbers).set({ photoMediaId: await storeArt(salonId, file) }).where(eq(barbers.id, b.id));
  }
  const [anyWork] = await db.select({ id: salonGallery.id }).from(salonGallery).where(eq(salonGallery.salonId, salonId)).limit(1);
  if (!anyWork) {
    for (const [i, [file, caption]] of GALLERY.entries()) {
      await db.insert(salonGallery).values({ salonId, mediaId: await storeArt(salonId, file), caption, sortOrder: i + 1 });
    }
  }
  await db
    .update(salons)
    .set({ amenities: ["coffee", "wifi", "playstation", "kids", "card", "towel"] })
    .where(and(eq(salons.id, salonId), sql`cardinality(${salons.amenities}) = 0`));
  log("Demo illustrations in place.");
}

// First real client as an unpublished draft: only facts we have (name from the
// Instagram handle, the Instagram link). The owner fills in the rest and publishes.
async function seedMorki(log: (s: string) => void) {
  const db = getDb();
  const [found] = await db.select({ id: salons.id }).from(salons).where(eq(salons.slug, "morki"));
  if (!found) {
    await registerSalon({
      businessName: "Morki Barber",
      slug: "morki",
      ownerName: "Morki",
      email: "morki@demo.cutline",
      password: DEMO_PASSWORD,
      instagramUrl: "https://www.instagram.com/morki_barber/",
      ownerIsBarber: true,
    });
    await db.update(salons).set({ theme: "brass" }).where(eq(salons.slug, "morki"));
  }
  log(`Draft salon: /morki — owner morki@demo.cutline (same password), not published yet`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const showcase = process.argv.includes("--showcase");
  migrate(url)
    .then(() => (showcase ? seedDemo({ reset: true, morki: false }) : seedDemo()))
    .then(() => closeDb())
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
