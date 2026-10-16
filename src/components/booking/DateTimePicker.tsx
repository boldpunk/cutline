"use client";
import { useEffect, useState } from "react";
import { apiGet, type DayStatus, type DaysResponse, type SlotOption, type SlotsResponse } from "@/lib/client/api";
import { formatLocalDate, formatTime } from "@/lib/format";
import { MonthCalendar, shiftMonth } from "./MonthCalendar";

function endOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

const PARTS: { key: string; label: string; test: (h: number) => boolean }[] = [
  { key: "morning", label: "Утро", test: (h) => h < 12 },
  { key: "day", label: "День", test: (h) => h >= 12 && h < 17 },
  { key: "evening", label: "Вечер", test: (h) => h >= 17 },
];

export function DateTimePicker({
  serviceId,
  barberId,
  timezone,
  date,
  time,
  onDate,
  onTime,
  todayHint,
}: {
  serviceId: string;
  barberId: string; // id or "any"
  timezone: string;
  date: string | null;
  time: string | null;
  onDate: (date: string, opts: { auto: boolean }) => void;
  onTime: (slot: SlotOption, offers: SlotsResponse["offers"]) => void;
  todayHint: string; // salon-local today, used before the first response arrives
}) {
  const [month, setMonth] = useState((date ?? todayHint).slice(0, 7));
  const [range, setRange] = useState<{ today: string; lastDate: string } | null>(null);
  const [statuses, setStatuses] = useState<Record<string, DayStatus>>({});
  const [daysLoading, setDaysLoading] = useState(true);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Day statuses for the visible month.
  useEffect(() => {
    let cancelled = false;
    setDaysLoading(true);
    setDaysError(null);
    const from = `${month}-01` < todayHint ? todayHint : `${month}-01`;
    const to = endOfMonth(month);
    if (from > to) {
      setStatuses({});
      setDaysLoading(false);
      return;
    }
    apiGet<DaysResponse>(`/api/public/days?service=${serviceId}&barber=${barberId}&from=${from}&to=${to}`).then((r) => {
      if (cancelled) return;
      setDaysLoading(false);
      if (!r.ok) {
        setDaysError(r.error.message);
        return;
      }
      setRange({ today: r.data.today, lastDate: r.data.lastDate });
      const map: Record<string, DayStatus> = {};
      for (const d of r.data.days) map[d.date] = d.status;
      setStatuses(map);
      // Pre-select the first day with free time so slots are visible right away.
      if (!date) {
        const first = r.data.days.find((d) => d.status === "available");
        if (first) onDate(first.date, { auto: true });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, serviceId, barberId, todayHint, reload]);

  // Slots for the selected date.
  useEffect(() => {
    if (!date) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError(null);
    apiGet<SlotsResponse>(`/api/public/slots?service=${serviceId}&barber=${barberId}&date=${date}`).then((r) => {
      if (cancelled) return;
      setSlotsLoading(false);
      if (r.ok) setSlots(r.data);
      else setSlotsError(r.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [date, serviceId, barberId, reload]);

  const minMonth = (range?.today ?? todayHint).slice(0, 7);
  const maxMonth = (range?.lastDate ?? shiftMonth(todayHint.slice(0, 7), 2) + "-01").slice(0, 7);
  const monthHasFree = Object.values(statuses).some((s) => s === "available");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <section aria-labelledby="pick-date-h">
        <h2 id="pick-date-h" className="mb-3 text-lg font-semibold">
          Дата
        </h2>
        <MonthCalendar
          month={month}
          minMonth={minMonth}
          maxMonth={maxMonth}
          statuses={statuses}
          loading={daysLoading}
          selected={date}
          onSelect={(d) => onDate(d, { auto: false })}
          onMonthChange={setMonth}
        />
        {daysError && (
          <p role="alert" className="field-error">
            {daysError}{" "}
            <button type="button" className="link" onClick={() => setReload((n) => n + 1)}>
              Повторить
            </button>
          </p>
        )}
        {!daysLoading && !daysError && !monthHasFree && (
          <p className="mt-3 rounded-lg border border-line bg-card p-3 text-sm">
            В этом месяце свободного времени нет.
            {month < maxMonth && (
              <>
                {" "}
                <button type="button" className="link font-medium" onClick={() => setMonth(shiftMonth(month, 1))}>
                  Смотреть следующий месяц
                </button>
              </>
            )}
          </p>
        )}
      </section>

      <section aria-labelledby="pick-time-h" aria-live="polite">
        <h2 id="pick-time-h" className="mb-3 text-lg font-semibold">
          Время{date ? `: ${formatLocalDate(date, { weekday: "long", day: "numeric", month: "long" })}` : ""}
        </h2>
        {!date && <p className="text-muted-text">Выберите дату в календаре.</p>}
        {date && slotsLoading && <p className="text-muted-text">Загружаем свободное время…</p>}
        {date && slotsError && (
          <p role="alert" className="field-error">
            {slotsError}{" "}
            <button type="button" className="link" onClick={() => setReload((n) => n + 1)}>
              Повторить
            </button>
          </p>
        )}
        {date && !slotsLoading && slots && slots.slots.length === 0 && (
          <p className="rounded-lg border border-line bg-card p-4">На эту дату свободного времени нет. Выберите другой день.</p>
        )}
        {date && !slotsLoading && slots && slots.slots.length > 0 && (
          <div className="space-y-5">
            {PARTS.map((part) => {
              const list = slots.slots.filter((s) => part.test(Number(formatTime(s.startAt, timezone).slice(0, 2))));
              if (list.length === 0) return null;
              return (
                <div key={part.key}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-text">{part.label}</h3>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                    {list.map((s) => {
                      const chosen = time === s.startAt;
                      return (
                        <li key={s.startAt}>
                          <button
                            type="button"
                            aria-pressed={chosen}
                            onClick={() => onTime(s, slots.offers)}
                            className={`flex h-12 w-full items-center justify-center gap-1 rounded-lg border-2 text-base font-semibold tabular-nums transition-colors ${
                              chosen ? "border-ink bg-ink text-paper" : "border-ink/60 bg-white hover:bg-accent"
                            }`}
                          >
                            {chosen && <span aria-hidden>✓</span>}
                            {formatTime(s.startAt, timezone)}
                            {chosen && <span className="sr-only">(выбрано)</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
