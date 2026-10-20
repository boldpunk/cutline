"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/server/env";
import { DomainError } from "@/lib/server/errors";
import { registerSalon } from "@/lib/server/onboarding";
import { rateLimit } from "@/lib/server/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SEC, createSession } from "@/lib/server/sessions";
import { clientIp, fieldErrors } from "@/lib/server/web";

export type StartState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

const schema = z.object({
  businessName: z.string().trim().min(2, "Укажите название").max(80),
  slug: z.string().trim().toLowerCase().min(3, "Минимум 3 символа").max(40),
  ownerName: z.string().trim().min(1, "Укажите имя").max(80),
  email: z.string().trim().toLowerCase().email("Некорректный e-mail").max(200),
  password: z.string().min(10, "Не короче 10 символов").max(200),
  instagramUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(v), "Ссылка вида https://www.instagram.com/имя/"),
  ownerIsBarber: z.boolean(),
  confirm: z.literal(true, { message: "Подтвердите, что представляете этот бизнес" }),
});

export async function startAction(_prev: StartState, form: FormData): Promise<StartState> {
  const raw = {
    businessName: String(form.get("businessName") ?? ""),
    slug: String(form.get("slug") ?? ""),
    ownerName: String(form.get("ownerName") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    instagramUrl: String(form.get("instagramUrl") ?? ""),
    ownerIsBarber: form.get("ownerIsBarber") === "on",
    confirm: form.get("confirm") === "on",
  };
  const values = { ...raw, password: "", ownerIsBarber: raw.ownerIsBarber ? "on" : "", confirm: raw.confirm ? "on" : "" };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Проверьте поля формы.", fields: fieldErrors(parsed.error), values };

  const ip = clientIp(await headers());
  const limits = [rateLimit(`signup:email:${parsed.data.email}`, 5, 3600)];
  if (ip) limits.push(rateLimit(`signup:ip:${ip}`, 5, 3600));
  if ((await Promise.all(limits)).some((r) => !r.ok)) return { error: "Слишком много попыток. Попробуйте через час.", values };

  try {
    const { userId } = await registerSalon({ ...parsed.data, instagramUrl: parsed.data.instagramUrl || null });
    const { token } = await createSession(userId);
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SEC,
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return { error: err.message, fields: (err.details?.fields as Record<string, string>) ?? undefined, values };
    }
    throw err;
  }
  redirect("/staff/setup");
}
