"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeExceptionAction, setExceptionAction } from "@/app/staff/(app)/schedule/actions";
import type { ActionResult } from "@/lib/server/action-result";
import { ResultNote } from "./ResultNote";

export function ExceptionForm({ barbers, today, tz }: { barbers: { id: string; name: string }[]; today: string; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [scope, setScope] = useState<string>("salon");
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<"closed" | "hours">("closed");
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("16:00");
  const [note, setNote] = useState("");

  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setExceptionAction({
            barberId: scope === "salon" ? null : scope,
            date,
            kind,
            ranges: kind === "hours" ? [{ start: from, end: to }] : undefined,
            note: note || undefined,
          });
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <h2 className="font-semibold">Исключение на дату</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="ex-scope" className="field-label text-sm">
            Для кого
          </label>
          <select id="ex-scope" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="salon">Весь салон</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ex-date" className="field-label text-sm">
            Дата
          </label>
          <input id="ex-date" type="date" className="input" value={date} min={today} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="ex-kind" className="field-label text-sm">
            Что
          </label>
          <select id="ex-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as "closed" | "hours")}>
            <option value="closed">Закрыто весь день</option>
            <option value="hours">Особые часы</option>
          </select>
        </div>
        {kind === "hours" && (
          <div>
            <span className="field-label text-sm">Часы</span>
            <div className="flex items-center gap-1">
              <input aria-label="С" type="time" step={900} className="input w-28" value={from} onChange={(e) => setFrom(e.target.value)} />–
              <input aria-label="До" type="time" step={900} className="input w-28" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="ex-note" className="field-label text-sm">
            Примечание
          </label>
          <input id="ex-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <ResultNote result={result} tz={tz} />
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
        {pending ? "Проверяем записи…" : "Сохранить исключение"}
      </button>
    </form>
  );
}

export function RemoveExceptionButton({ barberId, date, tz }: { barberId: string | null; date: string; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await removeExceptionAction(barberId, date);
            setResult(r.ok ? null : r);
            if (r.ok) router.refresh();
          })
        }
      >
        Удалить
      </button>
      {result && <ResultNote result={result} tz={tz} />}
    </span>
  );
}
