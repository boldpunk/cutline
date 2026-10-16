"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/server/env";
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
  const { token } = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  redirect("/staff/calendar");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/staff");
}
