// Loads schedule data from the DB and feeds the pure slot calculator.
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { barbers, barberServices, bookings, scheduleExceptions, services, timeBlocks, weeklyAvailability } from "@/lib/db/schema";
import type { Interval } from "@/lib/domain/intervals";
import { computeSlots, fitsSchedule, workingWindows, type DayOverride, type WeeklyHours } from "@/lib/domain/slots";
import { MS, addDays, diffDays, todayIn, zonedToUtc } from "@/lib/domain/time";
import type { Settings } from "./settings";

/** What a specific barber charges and needs for a service right now. */
export type Offering = {
  barberId: string;
  barberName: string;
  barberSortOrder: number;
  serviceId: string;
  serviceName: string;
  priceUzs: number;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
};

/** Active barbers offering an active service, in stable order (sort_order, name, id). */
export async function loadOfferings(ex: Executor, serviceId: string, barberIds?: string[]): Promise<Offering[]> {
  const rows = await ex
    .select({
      barberId: barbers.id,
      barberName: barbers.name,
      barberSortOrder: barbers.sortOrder,
      serviceId: services.id,
      serviceName: services.name,
      basePrice: services.priceUzs,
      baseDuration: services.durationMin,
      priceOverride: barberServices.priceUzs,
      durationOverride: barberServices.durationMin,
      bufferBeforeMin: services.bufferBeforeMin,
      bufferAfterMin: services.bufferAfterMin,
    })
    .from(barberServices)
    .innerJoin(barbers, eq(barbers.id, barberServices.barberId))
    .innerJoin(services, eq(services.id, barberServices.serviceId))
    .where(
      and(
        eq(barberServices.serviceId, serviceId),
        eq(barbers.active, true),
        eq(services.active, true),
        barberIds ? inArray(barbers.id, barberIds) : undefined,
      ),
    )
    .orderBy(asc(barbers.sortOrder), asc(barbers.name), asc(barbers.id));
  return rows.map((r) => ({
    barberId: r.barberId,
    barberName: r.barberName,
    barberSortOrder: r.barberSortOrder,
    serviceId: r.serviceId,
    serviceName: r.serviceName,
    priceUzs: r.priceOverride ?? r.basePrice,
    durationMin: r.durationOverride ?? r.baseDuration,
    bufferBeforeMin: r.bufferBeforeMin,
    bufferAfterMin: r.bufferAfterMin,
  }));
}

export type ScheduleData = {
  tz: string;
  salonWeekly: WeeklyHours;
  salonOverrides: Map<string, DayOverride>;
  barberWeekly: Map<string, WeeklyHours>;
  barberOverrides: Map<string, Map<string, DayOverride>>;
  /** Confirmed bookings' occupied intervals + time blocks, per barber. */
  busy: Map<string, Interval[]>;
  /** Time blocks only (vacations, breaks), per barber. */
  blocks: Map<string, Interval[]>;
};

function addWeekly(target: WeeklyHours, weekday: number, startMin: number, endMin: number) {
  (target[weekday] ??= []).push({ startMin, endMin });
}

function addOverride(target: Map<string, DayOverride>, date: string, kind: "closed" | "hours", startMin: number | null, endMin: number | null) {
  const existing = target.get(date);
  if (kind === "closed" || existing?.kind === "closed") {
    target.set(date, { kind: "closed" });
    return;
  }
  const range = { startMin: startMin!, endMin: endMin! };
  if (existing?.kind === "hours") existing.ranges.push(range);
  else target.set(date, { kind: "hours", ranges: [range] });
}

/** Loads everything needed to compute availability for `barberIds` between two local dates (inclusive). */
export async function loadSchedule(
  ex: Executor,
  tz: string,
  barberIds: string[],
  fromDate: string,
  toDate: string,
  opts: { excludeBookingId?: string } = {},
): Promise<ScheduleData> {
  const data: ScheduleData = {
    tz,
    salonWeekly: {},
    salonOverrides: new Map(),
    barberWeekly: new Map(barberIds.map((id) => [id, {}])),
    barberOverrides: new Map(barberIds.map((id) => [id, new Map()])),
    busy: new Map(barberIds.map((id) => [id, []])),
    blocks: new Map(barberIds.map((id) => [id, []])),
  };
  if (barberIds.length === 0) return data;

  // Buffers can reach across midnight; widen the instant range by a day each side.
  const rangeStart = new Date(zonedToUtc(fromDate, 0, tz) - MS.DAY);
  const rangeEnd = new Date(zonedToUtc(addDays(toDate, 1), 0, tz) + MS.DAY);

  const [weekly, exceptions, blocks, booked] = await Promise.all([
    ex
      .select()
      .from(weeklyAvailability)
      .where(or(isNull(weeklyAvailability.barberId), inArray(weeklyAvailability.barberId, barberIds))),
    ex
      .select()
      .from(scheduleExceptions)
      .where(
        and(
          gte(scheduleExceptions.date, fromDate),
          lte(scheduleExceptions.date, toDate),
          or(isNull(scheduleExceptions.barberId), inArray(scheduleExceptions.barberId, barberIds)),
        ),
      ),
    ex
      .select({ barberId: timeBlocks.barberId, startAt: timeBlocks.startAt, endAt: timeBlocks.endAt })
      .from(timeBlocks)
      .where(
        and(
          inArray(timeBlocks.barberId, barberIds),
          lt(timeBlocks.startAt, rangeEnd),
          gt(timeBlocks.endAt, rangeStart),
        ),
      ),
    ex
      .select({ barberId: bookings.barberId, from: bookings.occupiedFrom, until: bookings.occupiedUntil })
      .from(bookings)
      .where(
        and(
          inArray(bookings.barberId, barberIds),
          eq(bookings.status, "confirmed"),
          lt(bookings.occupiedFrom, rangeEnd),
          gt(bookings.occupiedUntil, rangeStart),
          opts.excludeBookingId ? ne(bookings.id, opts.excludeBookingId) : undefined,
        ),
      ),
  ]);

  for (const w of weekly) {
    const target = w.barberId === null ? data.salonWeekly : data.barberWeekly.get(w.barberId);
    if (target) addWeekly(target, w.weekday, w.startMin, w.endMin);
  }
  for (const e of exceptions) {
    const target = e.barberId === null ? data.salonOverrides : data.barberOverrides.get(e.barberId);
    if (target) addOverride(target, e.date, e.kind, e.startMin, e.endMin);
  }
  for (const b of blocks) {
    const interval = { start: b.startAt.getTime(), end: b.endAt.getTime() };
    data.busy.get(b.barberId)?.push(interval);
    data.blocks.get(b.barberId)?.push({ ...interval });
  }
  for (const b of booked) data.busy.get(b.barberId)?.push({ start: b.from.getTime(), end: b.until.getTime() });
  return data;
}

export function windowsFor(data: ScheduleData, barberId: string, date: string): Interval[] {
  return workingWindows({
    date,
    tz: data.tz,
    salonWeekly: data.salonWeekly,
    salonOverride: data.salonOverrides.get(date),
    barberWeekly: data.barberWeekly.get(barberId) ?? {},
    barberOverride: data.barberOverrides.get(barberId)?.get(date),
  });
}

/** Booking-window policy. Online clients get lead time + horizon; staff may book any future time. */
export type Policy = { notBefore: number; firstDate: string; lastDate: string; stepMin: number };

export function clientPolicy(settings: Settings, now: number): Policy {
  const today = todayIn(settings.timezone, now);
  return {
    notBefore: now + settings.minLeadMin * MS.MINUTE,
    firstDate: today,
    lastDate: addDays(today, settings.horizonDays),
    stepMin: settings.slotStepMin,
  };
}

export function staffPolicy(settings: Settings, now: number): Policy {
  const today = todayIn(settings.timezone, now);
  return { notBefore: now, firstDate: today, lastDate: addDays(today, 365), stepMin: settings.slotStepMin };
}

export function inPolicyRange(policy: Policy, date: string): boolean {
  return diffDays(date, policy.firstDate) >= 0 && diffDays(policy.lastDate, date) >= 0;
}

export function slotsFor(data: ScheduleData, offering: Offering, date: string, policy: Policy): number[] {
  if (!inPolicyRange(policy, date)) return [];
  return computeSlots({
    windows: windowsFor(data, offering.barberId, date),
    busy: data.busy.get(offering.barberId) ?? [],
    durationMin: offering.durationMin,
    bufferBeforeMin: offering.bufferBeforeMin,
    bufferAfterMin: offering.bufferAfterMin,
    stepMin: policy.stepMin,
    gridOrigin: zonedToUtc(date, 0, data.tz),
    notBefore: policy.notBefore,
  });
}

/** Does an appointment at `start` fit the barber's schedule (ignoring the slot grid)? */
export function fitsFor(data: ScheduleData, offering: Offering, date: string, start: number): boolean {
  return fitsSchedule(
    {
      windows: windowsFor(data, offering.barberId, date),
      busy: data.busy.get(offering.barberId) ?? [],
      durationMin: offering.durationMin,
      bufferBeforeMin: offering.bufferBeforeMin,
      bufferAfterMin: offering.bufferAfterMin,
    },
    start,
  );
}

export type SlotOption = { startAt: string; barberIds: string[] };

/** Slots for one date; each slot lists the barbers who can take it, in stable order. */
export function mergeSlots(data: ScheduleData, offerings: Offering[], date: string, policy: Policy): SlotOption[] {
  const byStart = new Map<number, string[]>();
  for (const o of offerings) {
    for (const s of slotsFor(data, o, date, policy)) {
      const list = byStart.get(s);
      if (list) list.push(o.barberId);
      else byStart.set(s, [o.barberId]);
    }
  }
  return [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([s, ids]) => ({ startAt: new Date(s).toISOString(), barberIds: ids }));
}

export type DayStatus = "available" | "full" | "closed" | "out_of_range";

export function dayStatus(data: ScheduleData, offerings: Offering[], date: string, policy: Policy): DayStatus {
  if (!inPolicyRange(policy, date)) return "out_of_range";
  let anyWindow = false;
  for (const o of offerings) {
    if (windowsFor(data, o.barberId, date).length > 0) anyWindow = true;
    if (slotsFor(data, o, date, policy).length > 0) return "available";
  }
  return anyWindow ? "full" : "closed";
}

/** Earliest slots from `fromDate` onward (used for "nearest free time" and conflict alternatives). */
export async function nearestSlots(
  ex: Executor,
  settings: Settings,
  offerings: Offering[],
  fromDate: string,
  policy: Policy,
  limit: number,
): Promise<SlotOption[]> {
  const out: SlotOption[] = [];
  const ids = offerings.map((o) => o.barberId);
  // Load in 14-day chunks until we have enough.
  let chunkStart = diffDays(fromDate, policy.firstDate) < 0 ? policy.firstDate : fromDate;
  while (out.length < limit && diffDays(policy.lastDate, chunkStart) >= 0) {
    const chunkEnd = diffDays(policy.lastDate, addDays(chunkStart, 13)) < 0 ? policy.lastDate : addDays(chunkStart, 13);
    const data = await loadSchedule(ex, settings.timezone, ids, chunkStart, chunkEnd);
    for (let d = chunkStart; diffDays(chunkEnd, d) >= 0 && out.length < limit; d = addDays(d, 1)) {
      out.push(...mergeSlots(data, offerings, d, policy).slice(0, limit - out.length));
    }
    chunkStart = addDays(chunkEnd, 1);
  }
  return out;
}
