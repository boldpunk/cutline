"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBlockAction, deleteBlockAction } from "@/app/staff/(app)/schedule/actions";
import type { ActionResult } from "@/lib/server/action-result";
import { ResultNote } from "./ResultNote";

export function BlockForm({ barbers, today, tz }: { barbers: { id: string; name: string }[]; today: string; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({
    barberId: barbers[0]?.id ?? "",
    kind: "break" as "break" | "vacation" | "other",
    startDate: today,
    startTime: "13:00",
    endDate: today,
    endTime: "14:00",
    note: "",
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  return (
    <form
      className="space-y-4 rounded-xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createBlockAction(f);
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <h2 className="font-semibold">Заблокировать время</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {barbers.length > 1 && (
          <div>
            <label className="field-label text-sm" htmlFor="bl-barber">
              Мастер
            </label>
            <select id="bl-barber" className="input" value={f.barberId} onChange={(e) => set({ barberId: e.target.value })}>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="field-label text-sm" htmlFor="bl-kind">
            Тип
          </label>
          <select id="bl-kind" className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value as typeof f.kind })}>
            <option value="break">Перерыв</option>
            <option value="vacation">Отпуск</option>
            <option value="other">Другое</option>
          </select>
        </div>
        <div>
          <label className="field-label text-sm" htmlFor="bl-sd">
            Начало
          </label>
          <div className="flex gap-1">
            <input id="bl-sd" type="date" className="input" value={f.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} required />
            <input aria-label="Время начала" type="time" step={900} className="input w-28" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} required />
          </div>
        </div>
        <div>
          <label className="field-label text-sm" htmlFor="bl-ed">
            Окончание
          </label>
          <div className="flex gap-1">
            <input id="bl-ed" type="date" className="input" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} required />
            <input aria-label="Время окончания" type="time" step={900} className="input w-28" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} required />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="field-label text-sm" htmlFor="bl-note">
            Комментарий
          </label>
          <input id="bl-note" className="input" maxLength={200} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </div>
      </div>
      <p className="text-xs text-muted-text">Время салона. Блокировка, пересекающая подтверждённую запись, не будет создана — запись не удаляется автоматически.</p>
      <ResultNote result={result} tz={tz} />
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
        {pending ? "Сохраняем…" : "Заблокировать"}
      </button>
    </form>
  );
}

export function DeleteBlockButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await deleteBlockAction(id);
            if (r.ok) router.refresh();
            else setError(r.message);
          })
        }
      >
        Удалить
      </button>
      {error && <span className="field-error">{error}</span>}
    </>
  );
}
