import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { findSalonBySlug } from "@/lib/server/settings";
import { getStaff } from "@/lib/server/staff-auth";
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
          <p className="mt-6 rounded-lg bg-accent-soft p-3 text-xs">
            Демо: admin@demo.cutline или timur@demo.cutline, пароль из README (по умолчанию <code>demo-cutline-2026</code>).
          </p>
        )}
      </div>
    </main>
  );
}
