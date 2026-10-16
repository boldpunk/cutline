"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { barberPhotoAction, saveBarberAction, setBarberActiveAction } from "@/app/staff/(app)/admin-actions";
import type { ActionResult } from "@/lib/server/action-result";
import { ResultNote } from "./ResultNote";

type Profile = { name: string; specialization: string; bio: string; sortOrder: number };

export function BarberProfileForm({ id, initial, tz }: { id: string | null; initial: Profile; tz: string }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<{ id: string }> | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBarberAction(id, p);
          setResult(r);
          if (r.ok && !id && r.data) router.push(`/staff/barbers/${r.data.id}`);
          else if (r.ok) router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`b-name-${id}`} className="field-label text-sm">
            Имя
          </label>
          <input id={`b-name-${id}`} className="input" maxLength={80} required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`b-spec-${id}`} className="field-label text-sm">
            Специализация
          </label>
          <input id={`b-spec-${id}`} className="input" maxLength={120} value={p.specialization} onChange={(e) => setP({ ...p, specialization: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`b-bio-${id}`} className="field-label text-sm">
            Коротко о мастере
          </label>
          <textarea id={`b-bio-${id}`} className="input" maxLength={600} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} />
          <p className="field-hint">Только подтверждённые факты. Не указывайте стаж и сертификаты, если они не проверены.</p>
        </div>
        <div>
          <label htmlFor={`b-sort-${id}`} className="field-label text-sm">
            Порядок на сайте
          </label>
          <input id={`b-sort-${id}`} type="number" className="input" value={p.sortOrder} onChange={(e) => setP({ ...p, sortOrder: e.target.valueAsNumber || 0 })} />
        </div>
      </div>
      <ResultNote result={result} tz={tz} />
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
        {id ? "Сохранить профиль" : "Добавить мастера"}
      </button>
    </form>
  );
}

export function BarberActiveToggle({ id, active, tz }: { id: string; active: boolean; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`btn btn-sm ${active ? "btn-ghost" : "btn-dark"}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setBarberActiveAction(id, !active);
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {active ? "Скрыть мастера и закрыть запись" : "Вернуть мастера"}
      </button>
      <ResultNote result={result} tz={tz} />
    </div>
  );
}

export function PhotoForm({ barberId, hasPhoto, tz }: { barberId: string; hasPhoto: boolean; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await barberPhotoAction(barberId, fd);
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <label htmlFor="photo" className="field-label text-sm">
        Фото (JPEG, PNG или WebP, до 3 МБ)
      </label>
      <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="block text-sm" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rights" className="mt-0.5 h-5 w-5 accent-ink" />
        Фото предоставлено мастером/салоном, и у салона есть право его публиковать
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
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("remove", "1");
              start(async () => {
                const r = await barberPhotoAction(barberId, fd);
                setResult(r);
                if (r.ok) router.refresh();
              });
            }}
          >
            Убрать фото
          </button>
        )}
      </div>
    </form>
  );
}
