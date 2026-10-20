import { eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { salons } from "@/lib/db/schema";
import { DomainError } from "./errors";

/** A business (tenant). Formerly the single-row salon_settings. */
export type Salon = typeof salons.$inferSelect;
/** Kept as an alias: most code only needs the salon's settings. */
export type Settings = Salon;

export async function getSalon(ex: Executor, salonId: string): Promise<Salon> {
  const [row] = await ex.select().from(salons).where(eq(salons.id, salonId));
  if (!row) throw new DomainError("not_found", "Салон не найден.");
  return row;
}

export async function findSalonBySlug(ex: Executor, slug: string): Promise<Salon | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const [row] = await ex.select().from(salons).where(eq(salons.slug, slug));
  return row ?? null;
}

// Addresses that can never be a salon's page (they are app routes or confusing).
export const RESERVED_SLUGS = new Set([
  "api", "staff", "booking", "start", "search", "media", "admin", "login", "logout", "signup", "register",
  "about", "pricing", "privacy", "terms", "help", "support", "blog", "static", "assets", "public", "app",
  "www", "mail", "robots", "sitemap", "favicon", "cutline", "platform", "settings", "account", "new",
  "_next", "next", "book", "services", "team", "demo",
]);

export function slugProblem(slug: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
    return "Адрес: 3–40 символов, латинские буквы, цифры и дефис (не в начале и не в конце).";
  }
  if (slug.includes("--")) return "Два дефиса подряд нельзя.";
  if (RESERVED_SLUGS.has(slug)) return "Этот адрес зарезервирован. Выберите другой.";
  return null;
}
