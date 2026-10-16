"use server";
// Admin-only mutations for catalog, team, accounts and settings. Each action
// re-checks the session role on the server and writes an audit entry.
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { barberServices, barbers, bookings, media, salonSettings, services, users } from "@/lib/db/schema";
import { isValidTimeZone } from "@/lib/domain/time";
import { runAction, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { DomainError, PG, isPgError } from "@/lib/server/errors";
import { PASSWORD_MIN_LENGTH, hashPassword } from "@/lib/server/passwords";
import { setBarberActive } from "@/lib/server/schedule-admin";
import { deleteUserSessions } from "@/lib/server/sessions";
import { actorOf, requireAdmin } from "@/lib/server/staff-auth";
import { uuid } from "@/lib/validation";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не длиннее ${max} символов`)
    .transform((v) => (v === "" ? null : v));

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
const serviceSchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(80),
  description: optText(600),
  category: optText(60),
  durationMin: z.coerce.number().int().min(5, "Минимум 5 минут").max(480),
  priceUzs: z.coerce.number().int("Цена — целое число сум").min(0).max(100_000_000),
  bufferBeforeMin: z.coerce.number().int().min(0).max(120),
  bufferAfterMin: z.coerce.number().int().min(0).max(120),
  sortOrder: z.coerce.number().int().min(-1000).max(1000),
  active: z.boolean(),
});

export async function saveServiceAction(id: string | null, input: z.input<typeof serviceSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const data = serviceSchema.parse(input);
    const db = getDb();
    let serviceId: string;
    if (id) {
      serviceId = uuid.parse(id);
      const [before] = await db.select().from(services).where(eq(services.id, serviceId));
      if (!before) throw new DomainError("not_found", "Услуга не найдена.");
      await db.update(services).set({ ...data, updatedAt: new Date() }).where(eq(services.id, serviceId));
      await audit(db, user.id, "service.update", "service", serviceId, {
        before: { priceUzs: before.priceUzs, durationMin: before.durationMin, active: before.active },
        after: { priceUzs: data.priceUzs, durationMin: data.durationMin, active: data.active },
      });
    } else {
      const [row] = await db.insert(services).values(data).returning({ id: services.id });
      serviceId = row!.id;
      await audit(db, user.id, "service.create", "service", serviceId, { name: data.name });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Услуга сохранена. Уже созданные записи сохраняют согласованную цену.", data: { id: serviceId } };
  });
}

const offerSchema = z.array(
  z.object({
    barberId: uuid,
    enabled: z.boolean(),
    priceUzs: z.union([z.coerce.number().int().min(0).max(100_000_000), z.literal("")]).optional(),
    durationMin: z.union([z.coerce.number().int().min(5).max(480), z.literal("")]).optional(),
  }),
);

export async function saveServiceOffersAction(serviceId: string, input: z.input<typeof offerSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    const sid = uuid.parse(serviceId);
    const offers = offerSchema.parse(input);
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.delete(barberServices).where(eq(barberServices.serviceId, sid));
      const rows = offers
        .filter((o) => o.enabled)
        .map((o) => ({
          barberId: o.barberId,
          serviceId: sid,
          priceUzs: o.priceUzs === "" || o.priceUzs === undefined ? null : o.priceUzs,
          durationMin: o.durationMin === "" || o.durationMin === undefined ? null : o.durationMin,
        }));
      if (rows.length) await tx.insert(barberServices).values(rows);
      await audit(tx, user.id, "service.offers", "service", sid, { offers: rows.map((r) => ({ barberId: r.barberId, priceUzs: r.priceUzs, durationMin: r.durationMin })) });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Мастера и цены сохранены." };
  });
}

// ---------------------------------------------------------------------------
// Barbers
// ---------------------------------------------------------------------------
const barberSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(80),
  specialization: optText(120),
  bio: optText(600),
  sortOrder: z.coerce.number().int().min(-1000).max(1000),
});

export async function saveBarberAction(id: string | null, input: z.input<typeof barberSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const data = barberSchema.parse(input);
    const db = getDb();
    if (id) {
      const bid = uuid.parse(id);
      await db.update(barbers).set({ ...data, updatedAt: new Date() }).where(eq(barbers.id, bid));
      await audit(db, user.id, "barber.update", "barber", bid, { name: data.name });
      revalidatePath("/", "layout");
      return { ok: true, message: "Профиль сохранён.", data: { id: bid } };
    }
    const [row] = await db.insert(barbers).values({ ...data, active: true }).returning({ id: barbers.id });
    await audit(db, user.id, "barber.create", "barber", row!.id, { name: data.name });
    revalidatePath("/", "layout");
    return { ok: true, message: "Мастер добавлен. Укажите его услуги и график.", data: { id: row!.id } };
  });
}

export async function setBarberActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    await setBarberActive({ actor: actorOf(user), barberId: uuid.parse(id), active });
    revalidatePath("/", "layout");
    return { ok: true, message: active ? "Мастер снова принимает запись." : "Мастер скрыт с сайта и не принимает запись." };
  });
}

const IMAGE_TYPES: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
};
const MAX_IMAGE = 3 * 1024 * 1024;

async function storeImage(file: File | null): Promise<string> {
  if (!file || file.size === 0) throw new DomainError("validation", "Выберите файл.");
  if (file.size > MAX_IMAGE) throw new DomainError("validation", "Файл больше 3 МБ.");
  const check = IMAGE_TYPES[file.type];
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!check || !check(bytes)) throw new DomainError("validation", "Поддерживаются JPEG, PNG и WebP.");
  const [row] = await getDb().insert(media).values({ contentType: file.type, bytes, size: bytes.length }).returning({ id: media.id });
  return row!.id;
}

/** Upload or remove a barber photo. Only upload photos you have the right to publish. */
export async function barberPhotoAction(barberId: string, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    const bid = uuid.parse(barberId);
    const db = getDb();
    const [b] = await db.select({ photo: barbers.photoMediaId }).from(barbers).where(eq(barbers.id, bid));
    if (!b) throw new DomainError("not_found", "Мастер не найден.");
    if (form.get("remove") === "1") {
      await db.update(barbers).set({ photoMediaId: null }).where(eq(barbers.id, bid));
    } else {
      if (form.get("rights") !== "on") throw new DomainError("validation", "Подтвердите, что у салона есть право публиковать это фото.");
      const id = await storeImage(form.get("photo") as File | null);
      await db.update(barbers).set({ photoMediaId: id, updatedAt: new Date() }).where(eq(barbers.id, bid));
    }
    if (b.photo) await db.delete(media).where(eq(media.id, b.photo));
    await audit(db, user.id, form.get("remove") === "1" ? "barber.photo_remove" : "barber.photo_upload", "barber", bid);
    revalidatePath("/", "layout");
    return { ok: true, message: "Фото обновлено." };
  });
}

export async function heroPhotoAction(form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    const db = getDb();
    const [s] = await db.select({ hero: salonSettings.heroMediaId }).from(salonSettings);
    if (form.get("remove") === "1") {
      await db.update(salonSettings).set({ heroMediaId: null });
    } else {
      if (form.get("rights") !== "on") throw new DomainError("validation", "Подтвердите, что у салона есть право публиковать это фото.");
      const id = await storeImage(form.get("photo") as File | null);
      await db.update(salonSettings).set({ heroMediaId: id, updatedAt: new Date() });
    }
    if (s?.hero) await db.delete(media).where(eq(media.id, s.hero));
    await audit(db, user.id, "settings.hero_photo", "salon", null);
    revalidatePath("/", "layout");
    return { ok: true, message: "Фото главной страницы обновлено." };
  });
}

// ---------------------------------------------------------------------------
// Staff accounts
// ---------------------------------------------------------------------------
const userSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Некорректный e-mail").max(200),
    name: z.string().trim().min(1).max(80),
    role: z.enum(["admin", "barber"]),
    barberId: z.union([uuid, z.literal("")]).optional(),
    password: z.string().min(PASSWORD_MIN_LENGTH, `Пароль не короче ${PASSWORD_MIN_LENGTH} символов`).max(200),
  })
  .refine((u) => u.role === "admin" || !!u.barberId, { message: "Для мастера выберите профиль мастера", path: ["barberId"] });

export async function createUserAction(input: z.input<typeof userSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const u = userSchema.parse(input);
    const db = getDb();
    try {
      const [row] = await db
        .insert(users)
        .values({
          email: u.email,
          name: u.name,
          role: u.role,
          barberId: u.role === "barber" ? u.barberId || null : null,
          passwordHash: await hashPassword(u.password),
        })
        .returning({ id: users.id });
      await audit(db, admin.id, "user.create", "user", row!.id, { email: u.email, role: u.role });
    } catch (err) {
      if (isPgError(err, PG.UNIQUE_VIOLATION)) throw new DomainError("conflict", "Этот e-mail или профиль мастера уже привязан к учётной записи.");
      throw err;
    }
    revalidatePath("/staff/users");
    return { ok: true, message: "Учётная запись создана. Передайте пароль сотруднику лично." };
  });
}

export async function resetPasswordAction(userId: string, password: string): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const uid = uuid.parse(userId);
    const pw = z.string().min(PASSWORD_MIN_LENGTH, `Пароль не короче ${PASSWORD_MIN_LENGTH} символов`).max(200).parse(password);
    await getDb().update(users).set({ passwordHash: await hashPassword(pw), updatedAt: new Date() }).where(eq(users.id, uid));
    await deleteUserSessions(uid);
    await audit(getDb(), admin.id, "user.reset_password", "user", uid);
    return { ok: true, message: "Пароль изменён, активные сессии завершены." };
  });
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const uid = uuid.parse(userId);
    const db = getDb();
    if (!active) {
      if (uid === admin.id) throw new DomainError("validation", "Нельзя отключить свою учётную запись.");
      const [{ n }] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, uid)))) as [{ n: number }];
      if (n === 0) throw new DomainError("validation", "Должен остаться хотя бы один активный администратор.");
    }
    await db.update(users).set({ active, updatedAt: new Date() }).where(eq(users.id, uid));
    if (!active) await deleteUserSessions(uid);
    await audit(db, admin.id, active ? "user.activate" : "user.deactivate", "user", uid);
    revalidatePath("/staff/users");
    return { ok: true, message: active ? "Доступ включён." : "Доступ отключён." };
  });
}

// ---------------------------------------------------------------------------
// Salon settings
// ---------------------------------------------------------------------------
const socialSchema = z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.string().trim().url().max(300).refine((u) => /^https?:\/\//.test(u), "Ссылка должна начинаться с http(s)://") })).max(8);

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: optText(160),
  about: optText(1000),
  address: optText(200),
  mapUrl: optText(500).refine((v) => v === null || /^https?:\/\//.test(v), "Ссылка должна начинаться с http(s)://"),
  phone: optText(40),
  socials: socialSchema,
  timezone: z.string().refine(isValidTimeZone, "Неизвестный часовой пояс IANA"),
  slotStepMin: z.coerce.number().refine((n) => [5, 10, 15, 20, 30, 60].includes(n), "Допустимо 5, 10, 15, 20, 30 или 60"),
  minLeadMin: z.coerce.number().int().min(0).max(10080),
  horizonDays: z.coerce.number().int().min(1).max(365),
  cancelCutoffHours: z.coerce.number().int().min(0).max(168),
  mode: z.enum(["demo", "live"]),
  barbersCanBlock: z.boolean(),
  privacyController: optText(300),
  privacyContact: optText(300),
  retentionDays: z.union([z.coerce.number().int().min(1).max(3650), z.literal("")]).transform((v) => (v === "" ? null : v)),
  consentVersion: z.string().trim().min(1).max(40),
});

export async function saveSettingsAction(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    const data = settingsSchema.parse(input);
    const db = getDb();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(salonSettings).for("update");
      if (!current) throw new DomainError("not_found", "Настройки не найдены.");
      if (data.timezone !== current.timezone) {
        // Changing the zone would silently move every stored wall-clock schedule.
        const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(bookings)) as [{ n: number }];
        if (n > 0) {
          throw new DomainError(
            "validation",
            "Часовой пояс нельзя менять, когда в базе уже есть записи: это изменит смысл сохранённых дат. См. процедуру в README.",
          );
        }
      }
      if (data.mode === "live" && (!data.privacyController || !data.privacyContact || !data.retentionDays)) {
        throw new DomainError("validation", "Для режима live заполните оператора персональных данных, контакт и срок хранения.");
      }
      await tx.update(salonSettings).set({ ...data, updatedAt: new Date() });
      await audit(tx, user.id, "settings.update", "salon", null, {
        changed: Object.keys(data).filter((k) => JSON.stringify((current as Record<string, unknown>)[k]) !== JSON.stringify((data as Record<string, unknown>)[k])),
      });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Настройки сохранены." };
  });
}
