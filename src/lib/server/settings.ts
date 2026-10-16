import { eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { salonSettings } from "@/lib/db/schema";

export type Settings = typeof salonSettings.$inferSelect;

export async function getSettings(ex: Executor): Promise<Settings> {
  const [row] = await ex.select().from(salonSettings).where(eq(salonSettings.id, 1));
  if (!row) throw new Error("salon_settings row is missing — run `npm run db:init-live` or `npm run db:seed-demo`");
  return row;
}
