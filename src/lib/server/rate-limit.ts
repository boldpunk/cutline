import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Fixed-window counter stored in Postgres (works across app instances).
 * Returns ok=false once `limit` hits within the window.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  now: number = Date.now(),
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const rows = await getDb().execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(rows[0]?.count ?? 0);
  const retryAfterSec = Math.ceil((windowStart.getTime() + windowMs - now) / 1000);
  return { ok: count <= limit, retryAfterSec };
}

export async function clearRateLimit(key: string): Promise<void> {
  await getDb().execute(sql`delete from rate_limits where key = ${key}`);
}
