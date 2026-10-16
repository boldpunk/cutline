// Time-zone helpers built on Intl only (no dependencies).
// Wall-clock values in the salon zone are expressed as a local date "YYYY-MM-DD"
// plus minutes from local midnight. Instants are epoch milliseconds (UTC).

const MINUTE = 60_000;
const DAY = 86_400_000;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallParts(instant: number, tz: string): WallParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(instant))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour === 24 ? 0 : out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

/** Offset of `tz` from UTC at `instant`, in ms (e.g. +5h for Asia/Tashkent). */
export function tzOffsetMs(instant: number, tz: string): number {
  const p = wallParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function parseDate(date: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function isValidDateString(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return formatUtcDate(t) === date;
}

function formatUtcDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Local wall time (date + minutes from midnight, may be 1440) in `tz` → UTC instant.
 * A non-existent local time (DST gap) resolves forward to the first valid instant after it.
 */
export function zonedToUtc(date: string, minutes: number, tz: string): number {
  const { y, m, d } = parseDate(date);
  const local = Date.UTC(y, m - 1, d) + minutes * MINUTE;
  const o1 = tzOffsetMs(local, tz);
  const utc = local - o1;
  const o2 = tzOffsetMs(utc, tz);
  if (o1 === o2) return utc;
  const alt = local - o2;
  return tzOffsetMs(alt, tz) === o2 ? alt : Math.max(utc, alt);
}

/** UTC instant → local date, minutes from midnight and ISO weekday (1 = Monday). */
export function utcToZoned(instant: number, tz: string): { date: string; minutes: number; weekday: number } {
  const p = wallParts(instant, tz);
  const dayUtc = Date.UTC(p.year, p.month - 1, p.day);
  return {
    date: formatUtcDate(dayUtc),
    minutes: p.hour * 60 + p.minute,
    weekday: ((new Date(dayUtc).getUTCDay() + 6) % 7) + 1,
  };
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  return formatUtcDate(Date.UTC(y, m - 1, d) + n * DAY);
}

export function diffDays(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / DAY);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const { y, m, d } = parseDate(date);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export function todayIn(tz: string, now: number = Date.now()): string {
  return utcToZoned(now, tz).date;
}

/** Monday of the ISO week containing `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59 || h > 24 || (h === 24 && mm !== 0)) return null;
  return h * 60 + mm;
}

export const MS = { MINUTE, HOUR: 60 * MINUTE, DAY };
