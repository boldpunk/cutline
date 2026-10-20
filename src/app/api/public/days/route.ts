import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { addDays, diffDays, isValidDateString } from "@/lib/domain/time";
import { staffPolicy, clientPolicy, dayStatus, loadOfferings, loadSchedule } from "@/lib/server/availability";
import { DomainError } from "@/lib/server/errors";
import { salonForService } from "@/lib/server/public-data";
import { errorResponse, json } from "@/lib/server/web";
import { isoDate, uuid } from "@/lib/validation";


const query = z.object({ service: uuid, barber: z.union([uuid, z.literal("any")]),
  scope: z.enum(["client", "staff"]).optional(), from: isoDate, to: isoDate });

/** Per-day status for a calendar month: available | full | closed | out_of_range. */
export async function GET(req: Request) {
  try {
    const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    if (!isValidDateString(p.from) || !isValidDateString(p.to)) throw new DomainError("validation", "Некорректная дата");
    const span = diffDays(p.to, p.from);
    if (span < 0 || span > 42) throw new DomainError("validation", "Слишком большой период");
    const db = getDb();
    const found = await salonForService(p.service);
    if (!found) throw new DomainError("not_found", "Услуга не найдена.");
    const settings = found.salon;
    const policy = p.scope === "staff" && found.isAdmin ? staffPolicy(settings, Date.now()) : clientPolicy(settings, Date.now());
    const offerings = await loadOfferings(db, p.service, p.barber === "any" ? undefined : [p.barber]);
    const data = await loadSchedule(db, settings, offerings.map((o) => o.barberId), p.from, p.to);
    const days = [];
    for (let d = p.from; diffDays(p.to, d) >= 0; d = addDays(d, 1)) {
      days.push({ date: d, status: offerings.length ? dayStatus(data, offerings, d, policy) : "closed" });
    }
    return json({ today: policy.firstDate, lastDate: policy.lastDate, days });
  } catch (err) {
    return errorResponse(err);
  }
}
