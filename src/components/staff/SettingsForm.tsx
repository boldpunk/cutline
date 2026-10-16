"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { heroPhotoAction, saveSettingsAction } from "@/app/staff/(app)/admin-actions";
import type { ActionResult } from "@/lib/server/action-result";
import { ResultNote } from "./ResultNote";

export type SettingsValues = {
  name: string;
  tagline: string;
  about: string;
  address: string;
  mapUrl: string;
  phone: string;
  socials: { label: string; url: string }[];
  timezone: string;
  slotStepMin: number;
  minLeadMin: number;
  horizonDays: number;
  cancelCutoffHours: number;
  mode: "demo" | "live";
  barbersCanBlock: boolean;
  privacyController: string;
  privacyContact: string;
  retentionDays: number | "";
  consentVersion: string;
};

function Text({ id, label, value, onChange, hint, max, area }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; max: number; area?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="field-label text-sm">
        {label}
      </label>
      {area ? (
        <textarea id={id} className="input" maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ initial, tzLocked, tz }: { initial: SettingsValues; tzLocked: boolean; tz: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const set = (p: Partial<SettingsValues>) => setV((x) => ({ ...x, ...p }));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettingsAction({ ...v, socials: v.socials.filter((s) => s.label && s.url) });
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <fieldset className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2">
        <legend className="px-1 font-semibold">Салон на сайте</legend>
        <Text id="s-name" label="Название" value={v.name} max={80} onChange={(name) => set({ name })} />
        <Text id="s-phone" label="Телефон салона" value={v.phone} max={40} onChange={(phone) => set({ phone })} hint="Пусто — блок скрыт на сайте" />
        <div className="sm:col-span-2">
          <Text id="s-tag" label="Короткое обещание (первый экран)" value={v.tagline} max={160} onChange={(tagline) => set({ tagline })} />
        </div>
        <div className="sm:col-span-2">
          <Text id="s-about" label="О салоне" value={v.about} max={1000} area onChange={(about) => set({ about })} />
        </div>
        <Text id="s-addr" label="Адрес" value={v.address} max={200} onChange={(address) => set({ address })} hint="Только фактический адрес" />
        <Text id="s-map" label="Ссылка на карту" value={v.mapUrl} max={500} onChange={(mapUrl) => set({ mapUrl })} />
        <div className="sm:col-span-2">
          <span className="field-label text-sm">Соцсети</span>
          {v.socials.map((s, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input aria-label="Название" className="input w-36" maxLength={40} value={s.label} onChange={(e) => set({ socials: v.socials.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input aria-label="Ссылка" className="input" maxLength={300} value={s.url} onChange={(e) => set({ socials: v.socials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Удалить ссылку" onClick={() => set({ socials: v.socials.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          {v.socials.length < 8 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ socials: [...v.socials, { label: "", url: "https://" }] })}>
              + ссылка
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-1 font-semibold">Правила записи</legend>
        <div>
          <label htmlFor="s-step" className="field-label text-sm">
            Шаг начала слотов, мин
          </label>
          <select id="s-step" className="input" value={v.slotStepMin} onChange={(e) => set({ slotStepMin: Number(e.target.value) })}>
            {[5, 10, 15, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {(
          [
            ["minLeadMin", "Минимум до записи, мин", 0, 10080],
            ["horizonDays", "Горизонт записи, дней", 1, 365],
            ["cancelCutoffHours", "Перенос/отмена клиентом не позднее, ч", 0, 168],
          ] as const
        ).map(([k, label, min, max]) => (
          <div key={k}>
            <label htmlFor={`s-${k}`} className="field-label text-sm">
              {label}
            </label>
            <input id={`s-${k}`} type="number" min={min} max={max} className="input" value={v[k]} onChange={(e) => set({ [k]: e.target.valueAsNumber } as Partial<SettingsValues>)} />
          </div>
        ))}
        <div>
          <label htmlFor="s-tz" className="field-label text-sm">
            Часовой пояс (IANA)
          </label>
          <input id="s-tz" className="input" value={v.timezone} disabled={tzLocked} onChange={(e) => set({ timezone: e.target.value })} />
          {tzLocked && <p className="field-hint">Заблокировано: в базе уже есть записи. Смена — только по процедуре из README.</p>}
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-ink" checked={v.barbersCanBlock} onChange={(e) => set({ barbersCanBlock: e.target.checked })} />
          Мастера могут сами блокировать своё время (перерывы, отпуск)
        </label>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2">
        <legend className="px-1 font-semibold">Персональные данные и режим</legend>
        <Text id="s-ctrl" label="Оператор персональных данных" value={v.privacyController} max={300} onChange={(privacyController) => set({ privacyController })} hint="Юр. лицо или ИП владельца" />
        <Text id="s-pc" label="Контакт по вопросам данных" value={v.privacyContact} max={300} onChange={(privacyContact) => set({ privacyContact })} />
        <div>
          <label htmlFor="s-ret" className="field-label text-sm">
            Срок хранения контактов после визита, дней
          </label>
          <input id="s-ret" type="number" min={1} max={3650} className="input" value={v.retentionDays} onChange={(e) => set({ retentionDays: Number.isNaN(e.target.valueAsNumber) ? "" : e.target.valueAsNumber })} />
          <p className="field-hint">После срока имя, телефон и комментарий удаляются фоновым процессом.</p>
        </div>
        <Text id="s-cv" label="Версия текста согласия" value={v.consentVersion} max={40} onChange={(consentVersion) => set({ consentVersion })} hint="Меняйте при изменении текста политики" />
        <div className="sm:col-span-2">
          <span className="field-label text-sm">Режим</span>
          <label className="mr-6 inline-flex items-center gap-2 text-sm">
            <input type="radio" name="mode" className="h-5 w-5 accent-ink" checked={v.mode === "demo"} onChange={() => set({ mode: "demo" })} />
            Демо (плашка «Демонстрационный барбершоп», визиты не состоятся)
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="mode" className="h-5 w-5 accent-ink" checked={v.mode === "live"} onChange={() => set({ mode: "live" })} />
            Live (реальный салон)
          </label>
        </div>
      </fieldset>

      <ResultNote result={result} tz={tz} />
      <button type="submit" className="btn btn-dark" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить настройки"}
      </button>
    </form>
  );
}

export function HeroPhotoForm({ hasPhoto, tz }: { hasPhoto: boolean; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const submit = (fd: FormData) =>
    start(async () => {
      const r = await heroPhotoAction(fd);
      setResult(r);
      if (r.ok) router.refresh();
    });
  return (
    <form
      className="space-y-2 rounded-xl border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <h2 className="font-semibold">Фото на первом экране</h2>
      <p className="text-sm text-muted-text">{hasPhoto ? "Фото загружено." : "Сейчас вместо фото показывается прайс-табло."}</p>
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Файл фото" className="block text-sm" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rights" className="mt-0.5 h-5 w-5 accent-ink" />У салона есть право публиковать это фото
      </label>
      <ResultNote result={result} tz={tz} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
          Загрузить
        </button>
        {hasPhoto && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const fd = new FormData();
              fd.set("remove", "1");
              submit(fd);
            }}
          >
            Убрать
          </button>
        )}
      </div>
    </form>
  );
}
