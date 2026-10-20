// What a verified client may see about their own booking.
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { barbers, bookingContacts, bookingEvents, bookings } from "@/lib/db/schema";
import { maskPhone } from "@/lib/domain/phone";
import { loadOfferings } from "./availability";
import { clientChangeAllowed } from "./bookings";
import { getSalon } from "./settings";

export async function clientBookingView(bookingId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      b: bookings,
      barberName: barbers.name,
      clientName: bookingContacts.clientName,
      phone: bookingContacts.phoneE164,
    })
    .from(bookings)
    .innerJoin(barbers, eq(barbers.id, bookings.barberId))
    .leftJoin(bookingContacts, eq(bookingContacts.bookingId, bookings.id))
    .where(eq(bookings.id, bookingId));
  if (!row) return null;
  const settings = await getSalon(db, row.b.salonId);
  const history = await db
    .select({ type: bookingEvents.type, createdAt: bookingEvents.createdAt, actorType: bookingEvents.actorType, data: bookingEvents.data })
    .from(bookingEvents)
    .where(and(eq(bookingEvents.bookingId, bookingId)))
    .orderBy(asc(bookingEvents.createdAt));
  const allowed = clientChangeAllowed(row.b, settings, Date.now());
  const offers = allowed.ok ? await loadOfferings(db, row.b.serviceId) : [];
  return {
    salon: settings,
    code: row.b.code,
    status: row.b.status,
    serviceId: row.b.serviceId,
    serviceName: row.b.serviceName,
    barberId: row.b.barberId,
    barberName: row.barberName,
    startAt: row.b.startAt.toISOString(),
    endAt: row.b.endAt.toISOString(),
    priceUzs: row.b.priceUzs,
    durationMin: row.b.durationMin,
    clientName: row.clientName,
    phoneMasked: row.phone ? maskPhone(row.phone) : null,
    canChange: allowed.ok,
    reason: allowed.ok ? null : allowed.reason,
    offers: offers.map((o) => ({ barberId: o.barberId, barberName: o.barberName, priceUzs: o.priceUzs, durationMin: o.durationMin })),
    history: history.map((h) => ({ type: h.type, at: h.createdAt.toISOString(), actor: h.actorType })),
  };
}

export type ClientBookingView = Omit<NonNullable<Awaited<ReturnType<typeof clientBookingView>>>, "salon">;
