import { z } from "zod";
import { DomainError } from "./errors";
import { fieldErrors } from "./web";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; code?: string; fields?: Record<string, string>; details?: Record<string, unknown> };

/** Runs a server action body and converts expected errors into a serializable result. */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, message: err.message, code: err.code, details: err.details };
    if (err instanceof z.ZodError) return { ok: false, message: "Проверьте заполнение полей.", code: "validation", fields: fieldErrors(err) };
    // Next.js redirect()/notFound() throw special errors that must propagate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("action failed", err instanceof Error ? err.message : err);
    return { ok: false, message: "Ошибка сервера. Попробуйте ещё раз.", code: "internal" };
  }
}
