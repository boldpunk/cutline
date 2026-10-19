"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/client/api";

export function AccessForm({ token }: { token: string }) {
  const router = useRouter();
  const [last4, setLast4] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(last4)) {
      setError("Введите 4 цифры.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await apiPost<{ ok: true }>("/api/public/booking-access", { token, last4 });
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.error.message);
  }

  return (
    <div className="max-w-md">
      <h1 className="display text-4xl">Ваша запись</h1>
      <p className="mt-4">
        Чтобы открыть запись, введите последние 4 цифры телефона, который вы указали при записи.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="last4" className="field-label">
            Последние 4 цифры телефона
          </label>
          <input
            id="last4"
            className="input max-w-40 text-center font-mono text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4}"
            maxLength={4}
            value={last4}
            aria-invalid={!!error}
            aria-describedby={error ? "last4-err" : "last4-hint"}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <p id="last4-hint" className="field-hint">
            Количество попыток ограничено.
          </p>
          {error && (
            <p id="last4-err" role="alert" className="field-error">
              {error}
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Проверяем…" : "Открыть запись"}
        </button>
      </form>
      <p className="mt-8 text-sm text-muted-text">
        Не помните номер или потеряли доступ? Позвоните в салон — администратор поможет найти запись.
      </p>
    </div>
  );
}
