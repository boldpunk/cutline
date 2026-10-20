import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { isValidDateString } from "@/lib/domain/time";
import { staffPolicy, clientPolicy, loadOfferings, loadSchedule, mergeSlots } from "@/lib/server/availability";
import { DomainError } from "@/lib/server/errors";
import { salonForService } from "@/lib/server/public-data";
import { errorResponse, json } from "@/lib/server/web";
import { isoDate, uuid } from "@/lib/validation";


const query = z.object({ service: uuid, barber: z.union([uuid, z.literal("any")]),
  scope: z.enum(["client", "staff"]).optional(), date: isoDate });

/** Free start times for a service on a date. Returns no client data and no counts of bookings. */
export async function GET(req: Request) {
  try {
    const p = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    if (!isValidDateString(p.date)) throw new DomainError("validation", "Некорректная дата");
    const db = getDb();
    const found = await salonForService(p.service);
    if (!found) throw new DomainError("not_found", "Услуга не найдена.");
    const settings = found.salon;
    const offerings = await loadOfferings(db, p.service, p.barber === "any" ? undefined : [p.barber]);
    const data = await loadSchedule(db, settings, offerings.map((o) => o.barberId), p.date, p.date);
    const slots = mergeSlots(data, offerings, p.date, p.scope === "staff" && found.isAdmin ? staffPolicy(settings, Date.now()) : clientPolicy(settings, Date.now()));
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
