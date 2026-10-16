"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DayStatus } from "@/lib/client/api";
import { addDays, isoWeekday } from "@/lib/domain/time";
import { formatLocalDate, WEEKDAYS_SHORT } from "@/lib/format";

const STATUS_TEXT: Record<DayStatus, string> = {
  available: "есть время",
  full: "нет мест",
  closed: "выходной",
  out_of_range: "",
};

function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Keyboard-accessible month grid. Arrow keys move between days, Home/End to week
 * edges, PageUp/PageDown change month. Days without free time stay focusable and
 * carry a visible text label instead of being blank holes.
 */
export function MonthCalendar({
  month,
  minMonth,
  maxMonth,
  statuses,
  loading,
  selected,
  onSelect,
  onMonthChange,
}: {
  month: string; // YYYY-MM
  minMonth: string;
  maxMonth: string;
  statuses: Record<string, DayStatus>;
  loading: boolean;
  selected: string | null;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
}) {
  const days = useMemo(() => monthDays(month), [month]);
  const leading = isoWeekday(days[0]!) - 1;
  const [focusDate, setFocusDate] = useState<string>(() =>
    selected && selected.startsWith(month) ? selected : days.find((d) => statuses[d] === "available") ?? days[0]!,
  );
  const gridRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);

  useEffect(() => {
    if (!focusDate.startsWith(month)) {
      setFocusDate(selected && selected.startsWith(month) ? selected : days.find((d) => statuses[d] === "available") ?? days[0]!);
    }
  }, [month, days, focusDate, selected, statuses]);

  useEffect(() => {
    if (wantFocus.current) {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
      wantFocus.current = false;
    }
  }, [focusDate]);

  function move(to: string) {
    wantFocus.current = true;
    if (!to.startsWith(month)) {
      const target = to.slice(0, 7);
      if (target < minMonth || target > maxMonth) return;
      onMonthChange(target);
    }
    setFocusDate(to);
  }

  function onKeyDown(e: React.KeyboardEvent, date: string) {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) {
      e.preventDefault();
      move(addDays(date, map[e.key]!));
    } else if (e.key === "Home") {
      e.preventDefault();
      move(addDays(date, 1 - isoWeekday(date)));
    } else if (e.key === "End") {
      e.preventDefault();
      move(addDays(date, 7 - isoWeekday(date)));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const target = shiftMonth(month, e.key === "PageUp" ? -1 : 1);
      if (target >= minMonth && target <= maxMonth) {
        wantFocus.current = true;
        onMonthChange(target);
        setFocusDate(`${target}-01`);
      }
    }
  }

  const monthLabel = formatLocalDate(`${month}-01`, { month: "long", year: "numeric" });
  const rows: (string | null)[][] = [];
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          disabled={month <= minMonth}
          aria-label="Предыдущий месяц"
        >
          ←
        </button>
        <h3 className="text-lg font-semibold capitalize" id={`cal-${month}`} aria-live="polite">
          {monthLabel}
        </h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          disabled={month >= maxMonth}
          aria-label="Следующий месяц"
        >
          →
        </button>
      </div>
      <div ref={gridRef} role="grid" aria-labelledby={`cal-${month}`} aria-busy={loading} className="select-none">
        <div role="row" className="grid grid-cols-7 gap-1 pb-1">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} role="columnheader" className="text-center text-xs font-semibold uppercase text-muted-text">
              {w}
            </div>
          ))}
        </div>
        {rows.map((row, ri) => (
          <div role="row" key={ri} className="grid grid-cols-7 gap-1 pb-1">
            {row.map((date, ci) => {
              if (!date) return <div role="gridcell" key={ci} />;
              const status: DayStatus = loading ? "out_of_range" : statuses[date] ?? "out_of_range";
              const isSelected = selected === date;
              const day = Number(date.slice(8));
              const label = `${formatLocalDate(date, { weekday: "long", day: "numeric", month: "long" })}${
                loading ? "" : status === "out_of_range" ? " — запись недоступна" : ` — ${STATUS_TEXT[status]}`
              }${isSelected ? ", выбрано" : ""}`;
              const unavailable = status !== "available";
              return (
                <div role="gridcell" key={date} aria-selected={isSelected}>
                  <button
                    type="button"
                    data-date={date}
                    tabIndex={date === focusDate ? 0 : -1}
                    aria-label={label}
                    aria-disabled={unavailable}
                    onKeyDown={(e) => onKeyDown(e, date)}
                    onFocus={() => setFocusDate(date)}
                    onClick={() => !unavailable && onSelect(date)}
                    className={[
                      "flex h-14 w-full flex-col items-center justify-center rounded-lg border text-base leading-none transition-colors",
                      isSelected
                        ? "border-ink bg-ink text-paper"
                        : status === "available"
                          ? "border-ink/70 bg-white font-semibold hover:bg-accent"
                          : status === "out_of_range"
                            ? "border-transparent text-muted"
                            : "border-line bg-paper text-muted-text",
                      unavailable ? "cursor-default" : "cursor-pointer",
                    ].join(" ")}
                  >
                    <span className="tabular-nums">{day}</span>
                    {!loading && status !== "out_of_range" && status !== "available" && (
                      <span aria-hidden className="mt-1 text-[10px] leading-none">
                        {STATUS_TEXT[status]}
                      </span>
                    )}
                    {status === "available" && (
                      <span aria-hidden className={`mt-1 text-[10px] leading-none ${isSelected ? "text-accent" : "text-success"}`}>
                        {isSelected ? "✓" : "●"}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-text">
        ● — есть свободное время. Стрелки на клавиатуре перемещают по дням, PageUp/PageDown — по месяцам.
      </p>
    </div>
  );
}
