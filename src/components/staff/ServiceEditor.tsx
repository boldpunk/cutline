"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveServiceAction, saveServiceOffersAction } from "@/app/staff/(app)/admin-actions";
import type { ActionResult } from "@/lib/server/action-result";
import { ResultNote } from "./ResultNote";

export type ServiceRow = {
  id: string | null;
  name: string;
  description: string;
  category: string;
  durationMin: number;
  priceUzs: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  sortOrder: number;
  active: boolean;
};

type Offer = { barberId: string; barberName: string; enabled: boolean; priceUzs: string; durationMin: string };

function Num({ id, label, value, onChange, hint, step = 1 }: { id: string; label: string; value: number; onChange: (n: number) => void; hint?: string; step?: number }) {
  return (
    <div>
      <label htmlFor={id} className="field-label text-sm">
        {label}
      </label>
      <input id={id} type="number" inputMode="numeric" className="input" value={Number.isNaN(value) ? "" : value} step={step} onChange={(e) => onChange(e.target.valueAsNumber)} />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function ServiceEditor({ initial, offers: initialOffers, tz }: { initial: ServiceRow; offers: Offer[]; tz: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [offers, setOffers] = useState(initialOffers);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [offerResult, setOfferResult] = useState<ActionResult | null>(null);
  const set = (p: Partial<ServiceRow>) => setS((x) => ({ ...x, ...p }));
  const pre = initial.id ?? "new";

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveServiceAction(initial.id, { ...s });
            setResult(r);
            if (r.ok) {
              router.refresh();
              if (!initial.id) setS({ ...initial });
            }
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor={`${pre}-name`} className="field-label text-sm">
              Название
            </label>
            <input id={`${pre}-name`} className="input" maxLength={80} value={s.name} onChange={(e) => set({ name: e.target.value })} required />
          </div>
          <div>
            <label htmlFor={`${pre}-cat`} className="field-label text-sm">
              Категория
            </label>
            <input id={`${pre}-cat`} className="input" maxLength={60} value={s.category} onChange={(e) => set({ category: e.target.value })} />
          </div>
          <Num id={`${pre}-sort`} label="Порядок" value={s.sortOrder} onChange={(n) => set({ sortOrder: n })} />
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor={`${pre}-desc`} className="field-label text-sm">
              Описание
            </label>
            <textarea id={`${pre}-desc`} className="input" maxLength={600} value={s.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <Num id={`${pre}-price`} label="Цена, сум" value={s.priceUzs} step={1000} onChange={(n) => set({ priceUzs: n })} hint="Целое число" />
          <Num id={`${pre}-dur`} label="Длительность, мин" value={s.durationMin} step={5} onChange={(n) => set({ durationMin: n })} />
          <Num id={`${pre}-bb`} label="Подготовка до, мин" value={s.bufferBeforeMin} step={5} onChange={(n) => set({ bufferBeforeMin: n })} />
          <Num id={`${pre}-ba`} label="Уборка после, мин" value={s.bufferAfterMin} step={5} onChange={(n) => set({ bufferAfterMin: n })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-ink" checked={s.active} onChange={(e) => set({ active: e.target.checked })} />
          Доступна для записи
        </label>
        <ResultNote result={result} tz={tz} />
        <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
          {initial.id ? "Сохранить услугу" : "Добавить услугу"}
        </button>
      </form>

      {initial.id && (
        <form
          className="rounded-lg border border-line bg-paper p-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveServiceOffersAction(initial.id!, offers.map((o) => ({ barberId: o.barberId, enabled: o.enabled, priceUzs: o.priceUzs, durationMin: o.durationMin })));
              setOfferResult(r);
              if (r.ok) router.refresh();
            });
          }}
        >
          <fieldset>
            <legend className="text-sm font-semibold">Кто выполняет и по какой цене</legend>
            <p className="text-xs text-muted-text">Пустые поля — базовая цена и длительность услуги.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="text-left text-muted-text">
                  <tr>
                    <th className="py-1 font-medium">Мастер</th>
                    <th className="py-1 font-medium">Цена, сум</th>
                    <th className="py-1 font-medium">Мин</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o, i) => (
                    <tr key={o.barberId}>
                      <td className="py-1 pr-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-ink"
                            checked={o.enabled}
                            onChange={(e) => setOffers((l) => l.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))}
                          />
                          {o.barberName}
                        </label>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          aria-label={`Цена для ${o.barberName}`}
                          className="input min-h-9 py-1"
                          inputMode="numeric"
                          placeholder={String(s.priceUzs)}
                          value={o.priceUzs}
                          disabled={!o.enabled}
                          onChange={(e) => setOffers((l) => l.map((x, j) => (j === i ? { ...x, priceUzs: e.target.value.replace(/\D/g, "") } : x)))}
                        />
                      </td>
                      <td className="py-1">
                        <input
                          aria-label={`Длительность для ${o.barberName}`}
                          className="input min-h-9 w-20 py-1"
                          inputMode="numeric"
                          placeholder={String(s.durationMin)}
                          value={o.durationMin}
                          disabled={!o.enabled}
                          onChange={(e) => setOffers((l) => l.map((x, j) => (j === i ? { ...x, durationMin: e.target.value.replace(/\D/g, "") } : x)))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
          <div className="mt-2 space-y-2">
            <ResultNote result={offerResult} tz={tz} />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
              Сохранить мастеров
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
