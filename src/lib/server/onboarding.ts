// Self-serve onboarding: a business opens its own page, fills it in, publishes.
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { barberServices, barbers, salons, services, users, weeklyAvailability } from "@/lib/db/schema";
import { audit } from "./audit";
import { DomainError, PG, isPgError } from "./errors";
import { PASSWORD_MIN_LENGTH, hashPassword } from "./passwords";
import { getSalon, slugProblem, type Salon } from "./settings";

export type RegisterInput = {
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  password: string;
  instagramUrl?: string | null;
  /** The owner also takes clients: create their barber profile. */
  ownerIsBarber: boolean;
};

export async function registerSalon(input: RegisterInput): Promise<{ salonId: string; userId: string }> {
  const slug = input.slug.trim().toLowerCase();
  const problem = slugProblem(slug);
  if (problem) throw new DomainError("validation", problem, { fields: { slug: problem } });
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new DomainError("validation", `Пароль не короче ${PASSWORD_MIN_LENGTH} символов.`, {
      fields: { password: `Не короче ${PASSWORD_MIN_LENGTH} символов` },
    });
  }
  const passwordHash = await hashPassword(input.password);
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [salon] = await tx
        .insert(salons)
        .values({
          slug,
          name: input.businessName.trim(),
          instagramUrl: input.instagramUrl || null,
          published: false,
          mode: "live",
          theme: "pole",
        })
        .returning({ id: salons.id });
      const salonId = salon!.id;
      let barberId: string | null = null;
      if (input.ownerIsBarber) {
        const [b] = await tx
          .insert(barbers)
          .values({ salonId, name: input.ownerName.trim(), sortOrder: 1 })
          .returning({ id: barbers.id });
        barberId = b!.id;
      }
      const [user] = await tx
        .insert(users)
        .values({
          salonId,
          email: input.email.trim().toLowerCase(),
          name: input.ownerName.trim(),
          role: "admin",
          barberId,
          passwordHash,
        })
        .returning({ id: users.id });
      await audit(tx, salonId, user!.id, "salon.register", "salon", salonId, { slug });
      return { salonId, userId: user!.id };
    });
  } catch (err) {
    if (isPgError(err, PG.UNIQUE_VIOLATION)) {
      const msg = String((err as { cause?: { constraint_name?: string } }).cause?.constraint_name ?? "");
      if (msg.includes("slug")) throw new DomainError("validation", "Этот адрес уже занят.", { fields: { slug: "Этот адрес уже занят" } });
      throw new DomainError("validation", "Этот e-mail уже зарегистрирован. Войдите в кабинет.", {
        fields: { email: "Уже зарегистрирован" },
      });
    }
    throw err;
  }
}

export type SetupStep = { key: string; title: string; done: boolean; hint: string; href: string };

/** What is still missing before the page can go public. */
export async function setupStatus(salonId: string): Promise<{ salon: Salon; steps: SetupStep[]; ready: boolean }> {
  const db = getDb();
  const salon = await getSalon(db, salonId);
  const [[salonHours], [readyBarbers], [readyServices]] = await Promise.all([
    db
      .select({ n: count() })
      .from(weeklyAvailability)
      .where(and(eq(weeklyAvailability.salonId, salonId), isNull(weeklyAvailability.barberId))),
    db
      .select({ n: sql<number>`count(distinct ${barbers.id})::int` })
      .from(barbers)
      .innerJoin(weeklyAvailability, eq(weeklyAvailability.barberId, barbers.id))
      .where(and(eq(barbers.salonId, salonId), eq(barbers.active, true))),
    db
      .select({ n: sql<number>`count(distinct ${services.id})::int` })
      .from(services)
      .innerJoin(barberServices, eq(barberServices.serviceId, services.id))
      .innerJoin(barbers, eq(barbers.id, barberServices.barberId))
      .where(and(eq(services.salonId, salonId), eq(services.active, true), eq(barbers.active, true))),
  ]);
  const steps: SetupStep[] = [
    {
      key: "contacts",
      title: "Адрес или телефон",
      done: !!(salon.address || salon.phone),
      hint: "Клиенты должны знать, куда идти или куда звонить.",
      href: "/staff/settings",
    },
    {
      key: "hours",
      title: "Часы работы салона",
      done: (salonHours?.n ?? 0) > 0,
      hint: "Дни и часы, когда вы открыты.",
      href: "/staff/schedule",
    },
    {
      key: "barbers",
      title: "Мастер с графиком",
      done: (readyBarbers?.n ?? 0) > 0,
      hint: "Хотя бы один мастер и его рабочие часы.",
      href: "/staff/barbers",
    },
    {
      key: "services",
      title: "Услуга с ценой",
      done: (readyServices?.n ?? 0) > 0,
      hint: "Хотя бы одна услуга, которую выполняет мастер.",
      href: "/staff/services",
    },
    {
      key: "privacy",
      title: "Данные для политики конфиденциальности",
      done: !!(salon.privacyController && salon.privacyContact && salon.retentionDays),
      hint: "Кто обрабатывает данные клиентов, контакт и срок хранения.",
      href: "/staff/settings",
    },
  ];
  return { salon, steps, ready: steps.every((s) => s.done) };
}

export async function setPublished(salonId: string, actorUserId: string, published: boolean): Promise<void> {
  if (published) {
    const { ready, steps } = await setupStatus(salonId);
    if (!ready) {
      throw new DomainError("validation", "Сначала заполните: " + steps.filter((s) => !s.done).map((s) => s.title.toLowerCase()).join(", ") + ".");
    }
  }
  const db = getDb();
  await db.update(salons).set({ published, updatedAt: new Date() }).where(eq(salons.id, salonId));
  await audit(db, salonId, actorUserId, published ? "salon.publish" : "salon.unpublish", "salon", salonId);
}
