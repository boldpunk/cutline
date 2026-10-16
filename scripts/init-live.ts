// Prepares an EMPTY production database for a real salon: runs migrations and
// creates the settings row in live mode. Creates no barbers, services or bookings.
// Usage: npm run db:init-live -- --name "Salon name" [--timezone Asia/Tashkent]
import { parseArgs } from "node:util";
import { closeDb, getDb } from "@/lib/db/client";
import { salonSettings } from "@/lib/db/schema";
import { isValidTimeZone } from "@/lib/domain/time";
import { migrate } from "./migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { values } = parseArgs({ options: { name: { type: "string" }, timezone: { type: "string" } } });
  const name = values.name?.trim();
  const timezone = values.timezone ?? "Asia/Tashkent";
  if (!name) throw new Error('Pass --name "Salon name"');
  if (!isValidTimeZone(timezone)) throw new Error(`Unknown IANA time zone: ${timezone}`);
  await migrate(url);
  const db = getDb();
  const existing = await db.select().from(salonSettings);
  if (existing.length) {
    console.log("Settings already exist — nothing to do.");
    return;
  }
  await db.insert(salonSettings).values({
    id: 1,
    name,
    timezone,
    slotStepMin: 15,
    minLeadMin: 60,
    horizonDays: 60,
    cancelCutoffHours: 12,
    // Starts in demo mode until the owner fills privacy facts; switch to live in /staff/settings.
    mode: "demo",
    barbersCanBlock: true,
    consentVersion: "v1",
  });
  console.log(`Initialized "${name}" (${timezone}). Next: npm run create-admin -- --email you@example.com`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
