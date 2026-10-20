"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addGalleryAction, removeGalleryAction } from "@/app/staff/(app)/admin-actions";
import type { ActionResult } from "@/lib/server/action-result";
import type { GalleryItem } from "@/lib/server/public-data";
import { ResultNote } from "./ResultNote";

export function GalleryManager({ items, tz, max }: { items: GalleryItem[]; tz: string; max: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      {items.length < max && (
        <form
          className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const formEl = e.currentTarget;
            const fd = new FormData(formEl);
            run(() => addGalleryAction(fd), () => formEl.reset());
          }}
        >
          <div>
            <label htmlFor="g-photo" className="field-label text-sm">
              Фото работы (JPEG, PNG или WebP, до 3 МБ)
            </label>
            <input id="g-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="block text-sm" required />
          </div>
          <div>
            <label htmlFor="g-caption" className="field-label text-sm">
              Подпись
            </label>
            <input id="g-caption" name="caption" className="input" maxLength={80} placeholder="Например: скин-фейд, борода" />
          </div>
          <button type="submit" className="btn btn-dark" disabled={pending}>
            Добавить
          </button>
          <label className="flex items-start gap-2 text-sm sm:col-span-3">
            <input type="checkbox" name="rights" className="mt-0.5 h-5 w-5 accent-ink" />
            Это работа нашего салона, клиент согласен на публикацию, у салона есть право публиковать фото
          </label>
        </form>
      )}
      <ResultNote result={result} tz={tz} />
      {items.length === 0 ? (
        <p className="text-muted-text">Пока пусто. Добавьте 4–8 лучших работ — фейды, бороды, детские стрижки.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((g) => (
            <li key={g.id} className="overflow-hidden rounded-xl border border-line bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt={g.caption ?? "Работа салона"} className="aspect-square w-full object-cover" />
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-sm">{g.caption ?? "Без подписи"}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  disabled={pending}
                  aria-label={`Удалить ${g.caption ?? "работу"}`}
                  onClick={() => run(() => removeGalleryAction(g.id))}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-text">
        {items.length} из {max}. Работы показываются на главной странице салона в блоке «Работы».
      </p>
    </div>
  );
}
