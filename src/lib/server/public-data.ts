// Read models for public pages. Never selects client contact data.
import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { barberServices, barbers, services, weeklyAvailability } from "@/lib/db/schema";
import { addDays } from "@/lib/domain/time";
import { clientPolicy, loadOfferings, nearestSlots } from "./availability";
import { env } from "./env";
import { getSettings, type Settings } from "./settings";

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isDemo: boolean;
  /** Price/duration per barber who performs it (active barbers only). */
  offers: { barberId: string; priceUzs: number; durationMin: number }[];
  minPrice: number;
  maxPrice: number;
  minDuration: number;
  maxDuration: number;
};

export type PublicBarber = {
  id: string;
  name: string;
  specialization: string | null;
  bio: string | null;
  photoUrl: string | null;
  isDemo: boolean;
  serviceIds: string[];
};

export type Catalog = { services: PublicService[]; barbers: PublicBarber[] };

export function mediaUrl(id: string | null): string | null {
  return id ? `/media/${id}` : null;
}

/** Active services that at least one active barber performs, with real per-barber prices. */
export async function getCatalog(): Promise<Catalog> {
  const db = getDb();
  const [svcRows, barberRows, links] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)).orderBy(asc(services.sortOrder), asc(services.name)),
    db.select().from(barbers).where(eq(barbers.active, true)).orderBy(asc(barbers.sortOrder), asc(barbers.name), asc(barbers.id)),
    db.select().from(barberServices),
  ]);
  const activeBarbers = new Set(barberRows.map((b) => b.id));
  const out: PublicService[] = [];
  for (const s of svcRows) {
    const offers = barberRows
      .map((b) => {
        const link = links.find((l) => l.barberId === b.id && l.serviceId === s.id);
        if (!link) return null;
        return { barberId: b.id, priceUzs: link.priceUzs ?? s.priceUzs, durationMin: link.durationMin ?? s.durationMin };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null && activeBarbers.has(o.barberId));
    if (offers.length === 0) continue;
    const prices = offers.map((o) => o.priceUzs);
    const durations = offers.map((o) => o.durationMin);
    out.push({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      isDemo: s.isDemo,
      offers,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
    });
  }
  const bookable = new Set(out.map((s) => s.id));
  return {
    services: out,
    barbers: barberRows.map((b) => ({
      id: b.id,
      name: b.name,
      specialization: b.specialization,
      bio: b.bio,
      photoUrl: mediaUrl(b.photoMediaId),
      isDemo: b.isDemo,
      serviceIds: links.filter((l) => l.barberId === b.id && bookable.has(l.serviceId)).map((l) => l.serviceId),
    })),
  };
}

/** Salon weekly hours as display rows, consecutive equal days grouped ("Пн–Сб 10:00–21:00"). */
export async function getSalonHours(): Promise<{ weekday: number; ranges: { startMin: number; endMin: number }[] }[]> {
  const rows = await getDb()
    .select()
    .from(weeklyAvailability)
    .where(isNull(weeklyAvailability.barberId))
    .orderBy(asc(weeklyAvailability.weekday), asc(weeklyAvailability.startMin));
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    ranges: rows.filter((r) => r.weekday === weekday).map((r) => ({ startMin: r.startMin, endMin: r.endMin })),
  }));
}

/** The earliest bookable time for the first listed service, computed from the DB (or null). */
export async function getNearestSlot(
  settings: Settings,
  catalog: Catalog,
): Promise<{ startAt: string; serviceId: string; serviceName: string } | null> {
  const first = catalog.services[0];
  if (!first) return null;
  const db = getDb();
  const now = Date.now();
  const policy = clientPolicy(settings, now);
  const offerings = await loadOfferings(db, first.id);
  // Look a week ahead at most for the hero line.
  const [slot] = await nearestSlots(db, settings, offerings, policy.firstDate, { ...policy, lastDate: minDate(policy.lastDate, addDays(policy.firstDate, 7)) }, 1);
  return slot ? { startAt: slot.startAt, serviceId: first.id, serviceName: first.name } : null;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export type PublicConfig = {
  salonName: string;
  timezone: string;
  mode: "demo" | "live";
  emailEnabled: boolean;
  consentVersion: string;
  cancelCutoffHours: number;
  horizonDays: number;
  minLeadMin: number;
  address: string | null;
  phone: string | null;
};

export function publicConfig(settings: Settings): PublicConfig {
  return {
    salonName: settings.name,
    timezone: settings.timezone,
    mode: settings.mode,
    emailEnabled: env.emailEnabled,
    consentVersion: settings.consentVersion,
    cancelCutoffHours: settings.cancelCutoffHours,
    horizonDays: settings.horizonDays,
    minLeadMin: settings.minLeadMin,
    address: settings.address,
    phone: settings.phone,
  };
}

export async function getPublicSettings(): Promise<Settings> {
  return getSettings(getDb());
}
