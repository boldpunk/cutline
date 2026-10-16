// Pure slot calculation. No I/O: callers load schedule data and pass it in.
import { contains, intersect, normalize, overlaps, type Interval } from "./intervals";
import { MS, isoWeekday, zonedToUtc } from "./time";

/** Minutes from local midnight, half-open [startMin, endMin). endMin may be 1440. */
export type MinuteRange = { startMin: number; endMin: number };

/** A date override: closed all day, or replacement hours. */
export type DayOverride = { kind: "closed" } | { kind: "hours"; ranges: MinuteRange[] };

export type WeeklyHours = Partial<Record<number, MinuteRange[]>>; // ISO weekday → ranges

/** Wall-clock hours for one scope (salon or barber) on a date, after applying an override. */
export function hoursForDate(date: string, weekly: WeeklyHours, override?: DayOverride): MinuteRange[] {
  if (override) return override.kind === "closed" ? [] : override.ranges;
  return weekly[isoWeekday(date)] ?? [];
}

function rangesToUtc(date: string, ranges: MinuteRange[], tz: string): Interval[] {
  return ranges.map((r) => ({ start: zonedToUtc(date, r.startMin, tz), end: zonedToUtc(date, r.endMin, tz) }));
}

/**
 * Working windows (UTC) of a barber on a local date: salon hours ∩ barber hours.
 */
export function workingWindows(args: {
  date: string;
  tz: string;
  salonWeekly: WeeklyHours;
  salonOverride?: DayOverride;
  barberWeekly: WeeklyHours;
  barberOverride?: DayOverride;
}): Interval[] {
  const salon = rangesToUtc(args.date, hoursForDate(args.date, args.salonWeekly, args.salonOverride), args.tz);
  const barber = rangesToUtc(args.date, hoursForDate(args.date, args.barberWeekly, args.barberOverride), args.tz);
  return intersect(salon, barber);
}

export type SlotRequest = {
  /** Working windows for the day (UTC ms). */
  windows: Interval[];
  /** Occupied time: confirmed bookings (incl. their buffers) and time blocks. */
  busy: Interval[];
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  stepMin: number;
  /** Local midnight of the day in UTC; slot starts are aligned to it. */
  gridOrigin: number;
  /** Earliest allowed appointment start (now + minimum lead time). */
  notBefore: number;
};

/** Occupied interval of an appointment starting at `start`. */
export function occupiedInterval(
  start: number,
  durationMin: number,
  bufferBeforeMin: number,
  bufferAfterMin: number,
): Interval {
  return {
    start: start - bufferBeforeMin * MS.MINUTE,
    end: start + (durationMin + bufferAfterMin) * MS.MINUTE,
  };
}

/**
 * Appointment start instants such that the whole occupied interval
 * [start − bufferBefore, start + duration + bufferAfter) lies inside one working
 * window and overlaps no busy interval.
 */
export function computeSlots(req: SlotRequest): number[] {
  const step = req.stepMin * MS.MINUTE;
  const windows = normalize(req.windows);
  const busy = normalize(req.busy);
  const out: number[] = [];
  for (const w of windows) {
    // First grid point whose occupied start is inside the window.
    const minStart = Math.max(w.start + req.bufferBeforeMin * MS.MINUTE, req.notBefore);
    let k = Math.ceil((minStart - req.gridOrigin) / step);
    for (let start = req.gridOrigin + k * step; ; k++, start = req.gridOrigin + k * step) {
      const occ = occupiedInterval(start, req.durationMin, req.bufferBeforeMin, req.bufferAfterMin);
      if (occ.end > w.end) break;
      if (!contains(w, occ)) continue;
      if (busy.some((b) => overlaps(b, occ))) continue;
      out.push(start);
    }
  }
  return out;
}

/** True if an appointment at `start` fits the windows and avoids busy time (ignores the grid). */
export function fitsSchedule(req: Omit<SlotRequest, "stepMin" | "gridOrigin" | "notBefore">, start: number): boolean {
  const occ = occupiedInterval(start, req.durationMin, req.bufferBeforeMin, req.bufferAfterMin);
  return normalize(req.windows).some((w) => contains(w, occ)) && !normalize(req.busy).some((b) => overlaps(b, occ));
}
