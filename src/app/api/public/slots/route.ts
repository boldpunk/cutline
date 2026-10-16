import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { isValidDateString } from "@/lib/domain/time";
import { clientPolicy, loadOfferings, loadSchedule, mergeSlots } from "@/lib/server/availability";
import { DomainError } from "@/lib/server/errors";
import { getSettings } from "@/lib/server/settings";
import { errorResponse, json } from "@/lib/server/web";
import { isoDate, uuid } from "@/lib/validation";

const query = z.object({ service: uuid, barber: z.union([uuid, z.literal("any")]), date: isoDate });

/** Free start times for a service on a date. Returns no client data and no counts of bookings. */
export async function GET(req: Request) {
  try {
    const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    if (!isValidDateString(p.date)) throw new DomainError("validation", "Некорректная дата");
    const db = getDb();
    const settings = await getSettings(db);
    const offerings = await loadOfferings(db, p.service, p.barber === "any" ? undefined : [p.barber]);
    const data = await loadSchedule(db, settings.timezone, offerings.map((o) => o.barberId), p.date, p.date);
    const slots = mergeSlots(data, offerings, p.date, clientPolicy(settings, Date.now()));
    return json({
      date: p.date,
      timezone: settings.timezone,
      offers: offerings.map((o) => ({
        barberId: o.barberId,
        barberName: o.barberName,
        priceUzs: o.priceUzs,
        durationMin: o.durationMin,
      })),
      slots,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
