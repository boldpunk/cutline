import type { Metadata } from "next";
import Link from "next/link";
import { StaffNav, type NavItem } from "@/components/staff/StaffNav";
import { getPublicSettings } from "@/lib/server/public-data";
import { requireStaff } from "@/lib/server/staff-auth";
import { logout } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Кабинет", template: "%s · Кабинет" }, robots: { index: false, follow: false } };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const s = await getPublicSettings();
  const items: NavItem[] =
    user.role === "admin"
      ? [
          { href: "/staff/calendar", label: "Календарь" },
          { href: "/staff/bookings", label: "Записи" },
          { href: "/staff/new-booking", label: "Новая запись" },
          { href: "/staff/blocks", label: "Блокировки" },
          { href: "/staff/schedule", label: "График" },
          { href: "/staff/services", label: "Услуги" },
          { href: "/staff/barbers", label: "Мастера" },
          { href: "/staff/users", label: "Сотрудники" },
          { href: "/staff/settings", label: "Настройки" },
          { href: "/staff/notifications", label: "Уведомления" },
          { href: "/staff/audit", label: "Журнал" },
        ]
      : [
          { href: "/staff/calendar", label: "Календарь" },
          { href: "/staff/bookings", label: "Мои записи" },
          ...(s.barbersCanBlock ? [{ href: "/staff/blocks", label: "Блокировки" }] : []),
        ];
  return (
    <div className="min-h-dvh bg-paper">
      {s.mode === "demo" && (
        <p className="bg-accent px-4 py-1 text-center text-xs font-semibold">Демо-режим: все данные вымышлены</p>
      )}
      <header className="on-dark bg-ink text-paper">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-4 px-4">
          <Link href="/staff/calendar" className="display text-xl">
            {s.name}
          </Link>
          <span className="hidden text-sm text-muted-dark sm:inline">Кабинет</span>
          <span className="ml-auto truncate text-sm">
            {user.name} <span className="text-muted-dark">· {user.role === "admin" ? "администратор" : "мастер"}</span>
          </span>
          <form action={logout}>
            <button type="submit" className="btn btn-sm border border-paper/40 text-paper hover:bg-paper/10">
              Выйти
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-[90rem] gap-6 px-4 py-4 lg:grid lg:grid-cols-[12rem_1fr] lg:py-6">
        <aside className="mb-4 lg:mb-0">
          <StaffNav items={items} />
        </aside>
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
