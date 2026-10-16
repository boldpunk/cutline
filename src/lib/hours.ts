import { minutesToHHMM } from "@/lib/domain/time";
import { WEEKDAYS_SHORT } from "@/lib/format";

type DayHours = { weekday: number; ranges: { startMin: number; endMin: number }[] };

/** Groups consecutive weekdays with identical hours: [{ days: "Пн–Сб", hours: "10:00–21:00" }]. */
export function groupHours(days: DayHours[]): { days: string; hours: string }[] {
  const label = (d: DayHours) =>
    d.ranges.length === 0 ? "выходной" : d.ranges.map((r) => `${minutesToHHMM(r.startMin)}–${minutesToHHMM(r.endMin)}`).join(", ");
  const out: { from: number; to: number; hours: string }[] = [];
  for (const d of days) {
    const h = label(d);
    const last = out[out.length - 1];
    if (last && last.hours === h && last.to === d.weekday - 1) last.to = d.weekday;
    else out.push({ from: d.weekday, to: d.weekday, hours: h });
  }
  return out.map((g) => ({
    days: g.from === g.to ? WEEKDAYS_SHORT[g.from - 1]! : `${WEEKDAYS_SHORT[g.from - 1]}–${WEEKDAYS_SHORT[g.to - 1]}`,
    hours: g.hours,
  }));
}
