// Client access to their own booking: private link token + last 4 phone digits.
// This is a practical v1 check (no SMS provider), not strong authentication;
// it is rate-limited per booking and per IP.
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookingContacts, bookings } from "@/lib/db/schema";
import { hmac, safeEqual, sha256Hex } from "./crypto";
import { DomainError } from "./errors";
import { rateLimit } from "./rate-limit";

export const GRANT_TTL_SEC = 30 * 60;
export const PIN_ATTEMPTS_PER_BOOKING = 5;
export const PIN_WINDOW_SEC = 15 * 60;
export const PIN_ATTEMPTS_PER_IP = 30;

export function grantCookieName(tokenHash: string): string {
  return `cl_${tokenHash.slice(0, 16)}`;
}

export function makeGrant(bookingId: string, now: number = Date.now()): string {
  const exp = Math.floor(now / 1000) + GRANT_TTL_SEC;
  return `${exp}.${hmac(`${bookingId}.${exp}`, "client-grant")}`;
}

export function checkGrant(value: string | undefined, bookingId: string, now: number = Date.now()): boolean {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp * 1000 < now) return false;
  return safeEqual(sig, hmac(`${bookingId}.${exp}`, "client-grant"));
}

export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

/** Minimal lookup by private token. Never returns contact data. */
export async function findBookingIdByToken(token: string): Promise<{ id: string; tokenHash: string } | null> {
  if (!looksLikeToken(token)) return null;
  const tokenHash = sha256Hex(token);
  const [row] = await getDb()
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.accessTokenHash, tokenHash));
  return row ? { id: row.id, tokenHash } : null;
}

export async function verifyAccess(
  token: string,
  last4: string,
  ip: string | null,
  now: number = Date.now(),
): Promise<{ bookingId: string; cookieName: string; grant: string }> {
  if (ip) {
    const perIp = await rateLimit(`pin:ip:${ip}`, PIN_ATTEMPTS_PER_IP, 3600, now);
    if (!perIp.ok) throw new DomainError("rate_limited", "Слишком много попыток. Попробуйте позже.", { retryAfterSec: perIp.retryAfterSec });
  }
  const found = await findBookingIdByToken(token);
  if (!found) throw new DomainError("not_found", "Ссылка недействительна.");
  const perBooking = await rateLimit(`pin:bk:${found.tokenHash}`, PIN_ATTEMPTS_PER_BOOKING, PIN_WINDOW_SEC, now);
  if (!perBooking.ok) {
    throw new DomainError("rate_limited", "Слишком много неверных попыток. Попробуйте через 15 минут или позвоните в салон.", {
      retryAfterSec: perBooking.retryAfterSec,
    });
  }
  const [c] = await getDb()
    .select({ last4: bookingContacts.phoneLast4 })
    .from(bookingContacts)
    .where(eq(bookingContacts.bookingId, found.id));
  if (!c || !/^\d{4}$/.test(last4) || !safeEqual(c.last4, last4)) {
    throw new DomainError("unauthorized", "Цифры не совпадают с номером, указанным при записи.");
  }
  return { bookingId: found.id, cookieName: grantCookieName(found.tokenHash), grant: makeGrant(found.id, now) };
}
