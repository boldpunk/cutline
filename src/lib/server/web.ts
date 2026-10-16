// Helpers for route handlers.
import { z } from "zod";
import { DomainError } from "./errors";
import { env } from "./env";

export function clientIp(headers: Headers): string | null {
  if (!env.trustProxy) return null;
  const xff = headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/** Rejects cross-site POSTs (CSRF) for cookie-carrying endpoints. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients don't send Origin; browsers always do on POST.
    if (req.headers.get("sec-fetch-site") === "cross-site") throw new DomainError("forbidden", "Запрос отклонён.");
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new DomainError("forbidden", "Запрос отклонён.");
  }
  if (originHost !== host && origin !== env.appUrl) throw new DomainError("forbidden", "Запрос отклонён.");
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof DomainError) {
    const headers: Record<string, string> = {};
    const retry = err.details?.retryAfterSec;
    if (typeof retry === "number") headers["Retry-After"] = String(retry);
    return json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status, headers });
  }
  if (err instanceof z.ZodError) {
    return json(
      { error: { code: "validation", message: "Проверьте заполнение полей.", details: { fields: fieldErrors(err) } } },
      { status: 400 },
    );
  }
  console.error("unhandled error", err instanceof Error ? err.message : err);
  return json({ error: { code: "internal", message: "Ошибка сервера. Попробуйте ещё раз." } }, { status: 500 });
}

export async function readJson(req: Request, maxBytes = 8_192): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new DomainError("validation", "Слишком большой запрос.");
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError("validation", "Некорректный запрос.");
  }
}
