import Link from "next/link";
import type { Interval } from "@/lib/domain/intervals";
import { minutesToHHMM, zonedToUtc } from "@/lib/domain/time";
import { formatTime, STATUS_LABELS } from "@/lib/format";
import type { CalendarItem } from "@/lib/server/staff-data";

const ROW_MIN = 15;
const ROW_PX = 20;

export type CalendarColumn = { key: string; label: string; sublabel?: string; date: string; barberId: string };

const BLOCK_LABELS: Record<string, string> = { break: "Перерыв", vacation: "Отпуск", other: "Занято" };

/** Week/day time grid (desktop). Positions are computed in the salon time zone. */
export function CalendarGrid({
  columns,
  items,
  windows,
  tz,
  startMin,
  endMin,
  showClient,
}: {
  columns: CalendarColumn[];
  items: CalendarItem[];
  windows: Map<string, Interval[]>;
  tz: string;
  startMin: number;
  endMin: number;
  showClient: (barberId: string) => boolean;
}) {
  const rows = Math.ceil((endMin - startMin) / ROW_MIN);
  const height = rows * ROW_PX;
  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m < endMin; m += 60) hours.push(m);

  function place(col: CalendarColumn, start: number, end: number) {
    const dayStart = zonedToUtc(col.date, startMin, tz);
    const dayEnd = zonedToUtc(col.date, endMin, tz);
    const s = Math.max(start, dayStart);
    const e = Math.min(end, dayEnd);
    if (e <= s) return null;
    const top = ((s - dayStart) / 60_000 / ROW_MIN) * ROW_PX;
    const h = Math.max(((e - s) / 60_000 / ROW_MIN) * ROW_PX, ROW_PX);
    return { top, height: h };
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(9rem, 1fr))` }}>
        <div className="sticky left-0 z-10 border-b border-line bg-card" />
        {columns.map((c) => (
          <div key={c.key} className="border-b border-l border-line px-2 py-2 text-sm">
            <div className="font-semibold">{c.label}</div>
            {c.sublabel && <div className="text-xs text-muted-text">{c.sublabel}</div>}
          </div>
        ))}

        <div className="relative sticky left-0 z-10 bg-card" style={{ height }}>
          {hours.map((m) => (
            <div key={m} className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-muted-text" style={{ top: ((m - startMin) / ROW_MIN) * ROW_PX }}>
              {minutesToHHMM(m)}
            </div>
          ))}
        </div>
        {columns.map((c) => {
          const colWindows = windows.get(`${c.barberId}|${c.date}`) ?? [];
          const colItems = items.filter((i) => i.barberId === c.barberId);
          return (
            <div
              key={c.key}
              className="relative border-l border-line"
              style={{
                height,
                backgroundImage: "repeating-linear-gradient(135deg, rgb(201 200 190 / 0.35) 0 6px, transparent 6px 12px)",
              }}
            >
              {/* working time */}
              {colWindows.map((w, i) => {
                const p = place(c, w.start, w.end);
                return p ? <div key={i} className="absolute inset-x-0 bg-white" style={{ top: p.top, height: p.height }} /> : null;
              })}
              {/* hour lines */}
              {hours.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-line/70" style={{ top: ((m - startMin) / ROW_MIN) * ROW_PX }} />
              ))}
              {colItems.map((it) => {
                const p = place(c, it.start, it.kind === "booking" ? it.end : it.end);
                if (!p) return null;
                if (it.kind === "block") {
                  return (
                    <div
                      key={it.id}
                      className="absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-muted bg-paper px-2 py-0.5 text-xs text-muted-text"
                      style={{ top: p.top, height: p.height }}
                    >
                      {BLOCK_LABELS[it.blockKind] ?? "Блок"}
                      {it.note ? ` · ${it.note}` : ""}
                    </div>
                  );
                }
                const buffer = place(c, it.end, it.occupiedEnd);
                const done = it.status !== "confirmed";
                return (
                  <div key={it.id}>
                    {buffer && <div aria-hidden className="absolute inset-x-1 rounded-b-md bg-line/60" style={{ top: buffer.top, height: buffer.height }} />}
                    <Link
                      href={`/staff/bookings/${it.id}`}
                      className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-xs leading-tight shadow-sm hover:z-10 hover:shadow-md ${
                        done ? "border-muted bg-line/40 text-muted-text" : "border-accent bg-accent-soft text-ink"
                      }`}
                      style={{ top: p.top, height: p.height }}
                    >
                      <span className="font-semibold tabular-nums">
                        {formatTime(it.start, tz)}–{formatTime(it.end, tz)}
                      </span>{" "}
                      {it.serviceName}
                      {showClient(it.barberId) && it.clientName && <span className="block truncate">{it.clientName}</span>}
                      {done && <span className="block">{STATUS_LABELS[it.status]}</span>}
                    </Link>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact list for phones and screen readers. */
export function AgendaList({
  days,
  items,
  tz,
  barberName,
  showBarber,
}: {
  days: { date: string; label: string }[];
  items: CalendarItem[];
  tz: string;
  barberName: (id: string) => string;
  showBarber: boolean;
}) {
  return (
    <ol className="space-y-5">
      {days.map((d) => {
        const dayStart = zonedToUtc(d.date, 0, tz);
        const dayEnd = zonedToUtc(d.date, 1440, tz);
        const list = items
          .filter((i) => i.start < dayEnd && i.end > dayStart)
          .sort((a, b) => a.start - b.start);
        return (
          <li key={d.date}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-text">{d.label}</h3>
            {list.length === 0 ? (
              <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-muted-text">Записей нет</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-card">
                {list.map((it) =>
                  it.kind === "block" ? (
                    <li key={it.id} className="px-3 py-2 text-sm text-muted-text">
                      {formatTime(Math.max(it.start, dayStart), tz)}–{formatTime(Math.min(it.end, dayEnd), tz)} · {BLOCK_LABELS[it.blockKind]}
                      {showBarber && ` · ${barberName(it.barberId)}`}
                      {it.note ? ` · ${it.note}` : ""}
                    </li>
                  ) : (
                    <li key={it.id}>
                      <Link href={`/staff/bookings/${it.id}`} className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-paper">
                        <span>
                          <span className="font-semibold tabular-nums">
                            {formatTime(it.start, tz)}–{formatTime(it.end, tz)}
                          </span>{" "}
                          {it.serviceName}
                          <span className="block text-sm text-muted-text">
                            {[it.clientName, showBarber ? barberName(it.barberId) : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {it.status !== "confirmed" && <span className="chip shrink-0 text-muted-text">{STATUS_LABELS[it.status]}</span>}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
