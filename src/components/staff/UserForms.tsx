"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createUserAction, resetPasswordAction, setUserActiveAction } from "@/app/staff/(app)/admin-actions";
import type { ActionResult } from "@/lib/server/action-result";
import { ResultNote } from "./ResultNote";

export function CreateUserForm({ barbers, tz }: { barbers: { id: string; name: string }[]; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({ email: "", name: "", role: "barber" as "admin" | "barber", barberId: barbers[0]?.id ?? "", password: "" });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createUserAction(f);
          setResult(r);
          if (r.ok) {
            setF({ ...f, email: "", name: "", password: "" });
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="field-label text-sm" htmlFor="u-email">
            E-mail (логин)
          </label>
          <input id="u-email" type="email" className="input" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div>
          <label className="field-label text-sm" htmlFor="u-name">
            Имя
          </label>
          <input id="u-name" className="input" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="field-label text-sm" htmlFor="u-role">
            Роль
          </label>
          <select id="u-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "barber" })}>
            <option value="barber">Мастер</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
        {f.role === "barber" && (
          <div>
            <label className="field-label text-sm" htmlFor="u-barber">
              Профиль мастера
            </label>
            <select id="u-barber" className="input" value={f.barberId} onChange={(e) => setF({ ...f, barberId: e.target.value })}>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="field-label text-sm" htmlFor="u-pw">
            Временный пароль
          </label>
          <input id="u-pw" type="text" autoComplete="new-password" className="input font-mono" minLength={10} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <p className="field-hint">Не короче 10 символов. Передайте лично.</p>
        </div>
      </div>
      <ResultNote result={result} tz={tz} />
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
        Создать учётную запись
      </button>
    </form>
  );
}

export function UserRowActions({ userId, active, tz }: { userId: string; active: boolean; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pw, setPw] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`pw-${userId}`}>
          Новый пароль
        </label>
        <input id={`pw-${userId}`} className="input min-h-9 w-44 py-1 font-mono text-sm" placeholder="новый пароль" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending || pw.length < 10}
          onClick={() =>
            start(async () => {
              const r = await resetPasswordAction(userId, pw);
              setResult(r);
              if (r.ok) setPw("");
            })
          }
        >
          Сменить пароль
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setUserActiveAction(userId, !active);
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          {active ? "Отключить доступ" : "Включить доступ"}
        </button>
      </div>
      <ResultNote result={result} tz={tz} />
    </div>
  );
}
