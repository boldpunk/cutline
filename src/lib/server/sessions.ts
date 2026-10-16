// Staff sessions: random token in an httpOnly cookie, only its hash in the DB.
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sessions, users, type Role } from "@/lib/db/schema";
import { randomToken, sha256Hex } from "./crypto";
import { hashPassword, verifyPassword } from "./passwords";

export const SESSION_COOKIE = "cutline_session";
export const SESSION_TTL_SEC = 12 * 3600;

export type StaffUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  barberId: string | null;
};

// Used to keep login timing similar for unknown e-mails.
let dummyHash: Promise<string> | null = null;

export async function checkCredentials(email: string, password: string): Promise<StaffUser | null> {
  const [u] = await getDb().select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!u || !u.active) {
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  if (!(await verifyPassword(password, u.passwordHash))) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, barberId: u.barberId };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000);
  await getDb().insert(sessions).values({ id: sha256Hex(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function userForSession(token: string | undefined): Promise<StaffUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, barberId: users.barberId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256Hex(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)));
  return row ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
