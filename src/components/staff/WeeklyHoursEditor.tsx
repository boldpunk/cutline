"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveWeeklyHoursAction } from "@/app/staff/(app)/schedule/actions";
import { WEEKDAYS_LONG } from "@/lib/format";
import type { ActionResult } from "@/lib/server/action-result";
import { ResultNote } from "./ResultNote";

type Range = { start: string; end: string };

export function WeeklyHoursEditor({
  barberId,
  initial,
  tz,
  title,
}: {
  barberId: string | null;
  initial: Record<number, Range[]>;
  tz: string;
  title: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState<Record<number, Range[]>>(() =>
    Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, initial[d] ?? []])),
  );
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const update = (d: number, fn: (list: Range[]) => Range[]) => setDays((x) => ({ ...x, [d]: fn(x[d] ?? []) }));

  return (
    <form
      className="rounded-xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveWeeklyHoursAction(barberId, days);
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="text-xs text-muted-text">Перерыв в течение дня — два интервала. Пустой день — выходной.</p>
      <div className="mt-3 divide-y divide-line">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <fieldset key={d} className="flex flex-wrap items-center gap-2 py-2">
            <legend className="sr-only">{WEEKDAYS_LONG[d - 1]}</legend>
            <span aria-hidden className="w-32 text-sm font-medium">
              {WEEKDAYS_LONG[d - 1]}
            </span>
            {(days[d] ?? []).length === 0 && <span className="text-sm text-muted-text">выходной</span>}
            {(days[d] ?? []).map((r, i) => (
              <span key={i} className="flex items-center gap-1">
                <input
                  type="time"
                  step={900}
                  aria-label={`${WEEKDAYS_LONG[d - 1]}, начало интервала ${i + 1}`}
                  className="input min-h-9 w-28 py-1"
                  value={r.start}
                  onChange={(e) => update(d, (l) => l.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                />
                –
                <input
                  type="time"
                  step={900}
                  aria-label={`${WEEKDAYS_LONG[d - 1]}, конец интервала ${i + 1}`}
                  className="input min-h-9 w-28 py-1"
                  value={r.end === "24:00" ? "23:59" : r.end}
                  onChange={(e) => update(d, (l) => l.map((x, j) => (j === i ? { ...x, end: e.target.value === "23:59" ? "24:00" : e.target.value } : x)))}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-2"
                  aria-label={`Удалить интервал ${i + 1}, ${WEEKDAYS_LONG[d - 1]}`}
                  onClick={() => update(d, (l) => l.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => update(d, (l) => [...l, l.length ? { start: "15:00", end: "19:00" } : { start: "10:00", end: "19:00" }])}
            >
              + интервал
            </button>
          </fieldset>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        <ResultNote result={result} tz={tz} />
        <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
          {pending ? "Проверяем записи…" : "Сохранить график"}
        </button>
      </div>
    </form>
  );
}
