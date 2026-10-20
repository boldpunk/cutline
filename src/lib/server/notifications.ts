// Notification delivery. One interface for all events; e-mail is the only
// channel in v1 and works only when SMTP is configured by the owner.
import nodemailer from "nodemailer";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { barbers, bookingContacts, bookings, notificationOutbox, type NotificationEvent } from "@/lib/db/schema";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { formatDateTime, tzLabel } from "@/lib/format";
import { formatCode } from "./crypto";
import { env } from "./env";
import { getSalon } from "./settings";

export type EmailMessage = { to: string; subject: string; text: string };
export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

export function smtpProvider(): EmailProvider | null {
  const cfg = env.smtp;
  if (!cfg) return null;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    async send(msg) {
      await transport.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, text: msg.text });
    },
  };
}

const SUBJECTS: Record<NotificationEvent, string> = {
  booking_confirmed: "Запись подтверждена",
  rescheduled: "Запись перенесена",
  cancelled: "Запись отменена",
  reminder: "Напоминание о визите",
};

/** Error text safe to store: no credentials, bounded length. */
export function safeError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw
    .replace(/(pass(word)?|auth|user(name)?)\s*[=:]\s*\S+/gi, "$1=***")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "***@***")
    .slice(0, 400);
}

const BACKOFF_MIN = [1, 5, 15, 60, 240];

/**
 * Claims due outbox rows (safe with several workers: SKIP LOCKED + lease) and
 * delivers them. Returns how many rows were processed.
 */
export async function processOutboxOnce(provider: EmailProvider | null, now: Date = new Date(), batch = 20): Promise<number> {
  const db = getDb();
  const claimed = await db.execute<{ id: string }>(sql`
    update ${notificationOutbox} set locked_until = ${new Date(now.getTime() + 120_000).toISOString()}::timestamptz,
           attempts = attempts + 1, updated_at = ${now.toISOString()}::timestamptz
     where id in (
       select id from ${notificationOutbox}
        where status = 'queued' and next_attempt_at <= ${now.toISOString()}::timestamptz
          and (locked_until is null or locked_until < ${now.toISOString()}::timestamptz)
        order by next_attempt_at limit ${batch}
        for update skip locked)
    returning id`);
  if (claimed.length === 0) return 0;
  const rows = await db
    .select({ o: notificationOutbox, b: bookings, email: bookingContacts.email, name: bookingContacts.clientName, barberName: barbers.name })
    .from(notificationOutbox)
    .innerJoin(bookings, eq(bookings.id, notificationOutbox.bookingId))
    .innerJoin(barbers, eq(barbers.id, bookings.barberId))
    .leftJoin(bookingContacts, eq(bookingContacts.bookingId, bookings.id))
    .where(inArray(notificationOutbox.id, claimed.map((c) => c.id)));

  for (const { o, b, email, name, barberName } of rows) {
    const settings = await getSalon(db, b.salonId);
    const done = (patch: Partial<typeof notificationOutbox.$inferInsert>) =>
      db.update(notificationOutbox).set({ ...patch, lockedUntil: null, updatedAt: now }).where(eq(notificationOutbox.id, o.id));

    if (o.eventType === "reminder" && (b.status !== "confirmed" || b.startAt <= now)) {
      await done({ status: "cancelled", lastError: "Запись отменена, перенесена или уже прошла" });
      continue;
    }
    if (!email) {
      await done({ status: "cancelled", lastError: "Нет e-mail клиента" });
      continue;
    }
    if (!provider) {
      // Leave it queued; it will go out once SMTP is configured.
      await done({ attempts: o.attempts - 1, nextAttemptAt: new Date(now.getTime() + 15 * 60_000), lastError: "E-mail провайдер не настроен" });
      continue;
    }
    const tz = settings.timezone;
    const lines = [
      `${name ?? "Здравствуйте"}!`,
      "",
      o.eventType === "cancelled" ? "Ваша запись отменена:" : "Ваша запись:",
      `${b.serviceName}, мастер ${barberName}`,
      `${formatDateTime(b.startAt, tz, true)} (${tzLabel(tz)}), ${formatDuration(b.durationMin)}`,
      `Стоимость: ${formatUzs(b.priceUzs)}`,
      settings.address ? `Адрес: ${settings.address}` : "",
      `Код записи: ${formatCode(b.code)}`,
      "",
      o.eventType === "cancelled" ? "" : "Перенести или отменить запись можно по личной ссылке, которую вы сохранили при записи, или по телефону салона.",
      settings.phone ? `Телефон салона: ${settings.phone}` : "",
      settings.mode === "demo" ? "\nЭто демонстрационный салон — визит не состоится." : "",
      "",
      `— ${settings.name}`,
    ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
    try {
      await provider.send({ to: email, subject: `${SUBJECTS[o.eventType]} — ${settings.name}`, text: lines.join("\n") });
      await done({ status: "sent", sentAt: now, lastError: null });
    } catch (err) {
      const final = o.attempts >= o.maxAttempts;
      await done({
        status: final ? "failed" : "queued",
        nextAttemptAt: new Date(now.getTime() + (BACKOFF_MIN[Math.min(o.attempts - 1, BACKOFF_MIN.length - 1)] ?? 60) * 60_000),
        lastError: safeError(err),
      });
    }
  }
  return rows.length;
}

/** Periodic cleanup: rate-limit windows, idempotency replies, expired sessions, contacts past retention. */
export async function housekeeping(now: Date = new Date()): Promise<{ contactsDeleted: number }> {
  const db = getDb();
  await db.execute(sql`delete from rate_limits where window_start < ${new Date(now.getTime() - 2 * 86_400_000).toISOString()}::timestamptz`);
  await db.execute(sql`delete from idempotency_keys where created_at < ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz`);
  await db.execute(sql`delete from sessions where expires_at < ${now.toISOString()}::timestamptz`);
  // Each salon keeps contacts for its own retention period (unset = keep).
  const res = await db.execute(sql`
    delete from booking_contacts c using bookings b, salons s
     where b.id = c.booking_id and s.id = b.salon_id and s.retention_days is not null
       and b.end_at < ${now.toISOString()}::timestamptz - make_interval(days => s.retention_days)
    returning c.booking_id`);
  return { contactsDeleted: res.length };
}

