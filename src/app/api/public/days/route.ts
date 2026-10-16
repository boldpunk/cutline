import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { addDays, diffDays, isValidDateString } from "@/lib/domain/time";
import { clientPolicy, dayStatus, loadOfferings, loadSchedule } from "@/lib/server/availability";
import { DomainError } from "@/lib/server/errors";
import { getSettings } from "@/lib/server/settings";
import { errorResponse, json } from "@/lib/server/web";
import { isoDate, uuid } from "@/lib/validation";

const query = z.object({ service: uuid, barber: z.union([uuid, z.literal("any")]), from: isoDate, to: isoDate });

/** Per-day status for a calendar month: available | full | closed | out_of_range. */
export async function GET(req: Request) {
  try {
    const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    if (!isValidDateString(p.from) || !isValidDateString(p.to)) throw new DomainError("validation", "Некорректная дата");
    const span = diffDays(p.to, p.from);
    if (span < 0 || span > 42) throw new DomainError("validation", "Слишком большой период");
    const db = getDb();
    const settings = await getSettings(db);
    const policy = clientPolicy(settings, Date.now());
    const offerings = await loadOfferings(db, p.service, p.barber === "any" ? undefined : [p.barber]);
    const data = await loadSchedule(db, settings.timezone, offerings.map((o) => o.barberId), p.from, p.to);
    const days = [];
    for (let d = p.from; diffDays(p.to, d) >= 0; d = addDays(d, 1)) {
      days.push({ date: d, status: offerings.length ? dayStatus(data, offerings, d, policy) : "closed" });
    }
    return json({ today: policy.firstDate, lastDate: policy.lastDate, days });
  } catch (err) {
    return errorResponse(err);
  }
}
