// Display formatting in Russian for the salon time zone. Safe on client and server.
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...opts });
    cache.set(key, f);
  }
  return f;
}

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));

/** "15:30" */
export function formatTime(v: string | number | Date, tz: string): string {
  return fmt(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(toDate(v));
}

/** "вторник, 20 октября" */
export function formatDayLong(v: string | number | Date, tz: string): string {
  return fmt(tz, { weekday: "long", day: "numeric", month: "long" }).format(toDate(v));
}

/** "вт, 20 окт." */
export function formatDayShort(v: string | number | Date, tz: string): string {
  return fmt(tz, { weekday: "short", day: "numeric", month: "short" }).format(toDate(v));
}

/** "вторник, 20 октября 2026, 15:30" */
export function formatDateTime(v: string | number | Date, tz: string, withYear = false): string {
  const d = toDate(v);
  const day = fmt(tz, { weekday: "long", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) }).format(d);
  return `${day}, ${formatTime(d, tz)}`;
}

/** "20.10.2026 15:30" — dense staff tables */
export function formatDateTimeCompact(v: string | number | Date, tz: string): string {
  const d = toDate(v);
  return `${fmt(tz, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d)} ${formatTime(d, tz)}`;
}

/** Calendar date string "2026-10-20" → "20 октября" (no tz math: it's already a local date). */
export function formatLocalDate(date: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

/** "UTC+5" style label for the salon zone. */
export function tzLabel(tz: string, at: number = Date.now()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date(at))
    .find((p) => p.type === "timeZoneName")?.value;
  return part ? part.replace("GMT", "UTC") : tz;
}

export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const WEEKDAYS_LONG = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

export const STATUS_LABELS: Record<string, string> = {
  confirmed: "Подтверждена",
  cancelled_by_client: "Отменена клиентом",
  cancelled_by_staff: "Отменена салоном",
  completed: "Визит состоялся",
  no_show: "Не пришёл",
};
