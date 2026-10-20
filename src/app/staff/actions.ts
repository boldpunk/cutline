"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/server/env";
import { findSalonBySlug, getSalon } from "@/lib/server/settings";
import { clearRateLimit, rateLimit } from "@/lib/server/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SEC, checkCredentials, createSession, deleteSession } from "@/lib/server/sessions";
import { clientIp } from "@/lib/server/web";

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Введите e-mail и пароль." };
  const { email, password } = parsed.data;
  const ip = clientIp(await headers());
  const byEmail = await rateLimit(`login:email:${email}`, 8, 900);
  const byIp = ip ? await rateLimit(`login:ip:${ip}`, 30, 900) : { ok: true };
  if (!byEmail.ok || !byIp.ok) return { error: "Слишком много попыток входа. Подождите 15 минут.", email };

  const user = await checkCredentials(email, password);
  if (!user) return { error: "Неверный e-mail или пароль.", email };
  await clearRateLimit(`login:email:${email}`);
  await startSession(user.id);
  // A fresh business lands on its setup checklist until the page is published.
  const salon = await getSalon(getDb(), user.salonId);
  redirect(user.role === "admin" && !salon.published ? "/staff/setup" : "/staff/calendar");
}

async function startSession(userId: string): Promise<void> {
  const { token } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

const DEMO_ACCOUNTS = { admin: "admin@demo.cutline", barber: "timur@demo.cutline" } as const;

/** One-click entry into the fictional demo salon. Never reaches a real salon. */
export async function demoLogin(form: FormData): Promise<void> {
  const role = form.get("role") === "barber" ? "barber" : "admin";
  const ip = clientIp(await headers());
  if (ip && !(await rateLimit(`demo-login:${ip}`, 20, 900)).ok) redirect("/staff");
  const db = getDb();
  const demo = await findSalonBySlug(db, "demo");
  if (!demo || demo.mode !== "demo") redirect("/staff");
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.salonId, demo.id), eq(users.email, DEMO_ACCOUNTS[role]), eq(users.active, true)));
  if (!u) redirect("/staff");
  await startSession(u.id);
  redirect("/staff/calendar");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/staff");
}
