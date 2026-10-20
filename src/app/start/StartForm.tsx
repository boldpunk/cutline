"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { suggestSlug } from "@/lib/slug";
import { startAction, type StartState } from "./actions";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function StartForm({ host }: { host: string }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startAction, {});
  const v = state.values ?? {};
  const f = state.fields ?? {};
  const [name, setName] = useState(v.businessName ?? "");
  const [slug, setSlug] = useState(v.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!v.slug);
  const [check, setCheck] = useState<{ available: boolean; problem: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(suggestSlug(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (slug.length < 3) {
      setCheck(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/public/slug-check?slug=${encodeURIComponent(slug)}`);
        setCheck(await r.json());
      } catch {
        setCheck(null);
      }
    }, 350);
  }, [slug]);

  const slugError = f.slug ?? (check && !check.available ? (check.problem ?? "Адрес недоступен") : undefined);

  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="businessName" label="Название барбершопа" error={f.businessName}>
        <input id="businessName" name="businessName" className="input" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="slug" label="Адрес вашей страницы" error={slugError} hint={check?.available ? "Адрес свободен ✓" : "Латиница, цифры и дефис"}>
        <div className="flex items-center rounded-lg border-[1.5px] border-control bg-white pl-3 focus-within:outline focus-within:outline-3 focus-within:outline-ink">
          <span className="shrink-0 text-muted-text">{host}/</span>
          <input
            id="slug"
            name="slug"
            className="min-h-11 min-w-0 flex-1 bg-transparent py-2 pr-3 font-semibold outline-none"
            maxLength={40}
            value={slug}
            aria-invalid={!!slugError}
            aria-describedby={slugError ? "slug-err" : "slug-hint"}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
          />
        </div>
      </Field>
      <Field id="instagramUrl" label="Instagram (необязательно)" error={f.instagramUrl} hint="Появится в подвале вашей страницы">
        <input id="instagramUrl" name="instagramUrl" className="input" placeholder="https://www.instagram.com/имя/" defaultValue={v.instagramUrl} maxLength={300} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="ownerName" label="Ваше имя" error={f.ownerName}>
          <input id="ownerName" name="ownerName" className="input" autoComplete="name" maxLength={80} required defaultValue={v.ownerName} />
        </Field>
        <Field id="email" label="E-mail для входа" error={f.email}>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required defaultValue={v.email} />
        </Field>
      </div>
      <Field id="password" label="Пароль" error={f.password} hint="Не короче 10 символов">
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required />
      </Field>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="ownerIsBarber" defaultChecked={v.ownerIsBarber !== ""} className="mt-1 h-5 w-5 accent-ink" />
        <span>Я сам принимаю клиентов — создать мой профиль мастера</span>
      </label>
      <div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="confirm" defaultChecked={v.confirm === "on"} className="mt-1 h-5 w-5 accent-ink" aria-invalid={!!f.confirm} />
          <span>Я представляю этот бизнес и буду указывать на странице только достоверные данные</span>
        </label>
        {f.confirm && <p className="field-error">{f.confirm}</p>}
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full text-lg" disabled={pending}>
        {pending ? "Создаём страницу…" : "Создать страницу"}
      </button>
      <p className="text-center text-sm text-muted-text">Страница не видна клиентам, пока вы её не заполните и не опубликуете.</p>
    </form>
  );
}
