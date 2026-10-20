import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { findSalonBySlug } from "@/lib/server/settings";
import { getStaff } from "@/lib/server/staff-auth";
import { demoLogin } from "./actions";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Вход для сотрудников", robots: { index: false, follow: false } };

export default async function StaffLoginPage() {
  if (await getStaff()) redirect("/staff/calendar");
  const demo = await findSalonBySlug(getDb(), "demo");
  return (
    <main id="main" data-salon-theme="pole" className="flex min-h-dvh items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 sm:p-8">
        <Link href="/" className="display text-2xl">
          CUTLINE
        </Link>
        <h1 className="mt-6 text-xl font-semibold">Вход для сотрудников</h1>
        <p className="mt-1 text-sm text-muted-text">
          Сотрудников добавляет администратор салона. Нет страницы?{" "}
          <Link href="/start" className="link">
            Открыть свою
          </Link>
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
        {demo?.mode === "demo" && (
          <div className="mt-6 rounded-xl bg-accent-soft p-4">
            <p className="text-sm font-semibold">Посмотреть кабинет демо-салона</p>
            <p className="mt-1 text-xs text-muted-text">Вымышленные данные, обновляются при перезапуске. Пароль не нужен.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={demoLogin}>
                <input type="hidden" name="role" value="admin" />
                <button type="submit" className="btn btn-dark btn-sm">
                  Как администратор
                </button>
              </form>
              <form action={demoLogin}>
                <input type="hidden" name="role" value="barber" />
                <button type="submit" className="btn btn-ghost btn-sm">
                  Как мастер
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
