"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="field-label">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" defaultValue={state.email} />
      </div>
      <div>
        <label htmlFor="password" className="field-label">
          Пароль
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state.error && (
        <p role="alert" className="field-error">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-dark w-full" disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
