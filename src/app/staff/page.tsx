import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPublicSettings } from "@/lib/server/public-data";
import { getStaff } from "@/lib/server/staff-auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Вход для сотрудников", robots: { index: false, follow: false } };

export default async function StaffLoginPage() {
  if (await getStaff()) redirect("/staff/calendar");
  const s = await getPublicSettings();
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 sm:p-8">
        <Link href="/" className="display text-3xl">
          {s.name}
        </Link>
        <h1 className="mt-6 text-xl font-semibold">Вход для сотрудников</h1>
        <p className="mt-1 text-sm text-muted-text">Учётные записи создаёт администратор салона.</p>
        <div className="mt-6">
          <LoginForm />
        </div>
        {s.mode === "demo" && (
          <p className="mt-6 rounded-lg bg-accent/50 p-3 text-xs">
            Демо: admin@demo.cutline или timur@demo.cutline, пароль из README (по умолчанию <code>demo-cutline-2026</code>).
          </p>
        )}
      </div>
    </main>
  );
}
