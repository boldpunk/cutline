import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { BarberProfileForm } from "@/components/staff/BarberForms";
import { getDb } from "@/lib/db/client";
import { barbers } from "@/lib/db/schema";
import { getSalon } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";

export const metadata: Metadata = { title: "Мастера" };

export default async function BarbersAdminPage() {
  const user = await requireAdmin();
  const db = getDb();
  const [settings, list] = await Promise.all([getSalon(db, user.salonId), db.select().from(barbers).orderBy(asc(barbers.sortOrder), asc(barbers.name))]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Мастера</h1>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {list.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span>
              <Link href={`/staff/barbers/${b.id}`} className="link font-semibold">
                {b.name}
              </Link>
              <span className="text-sm text-muted-text">
                {b.specialization ? ` · ${b.specialization}` : ""}
                {b.active ? "" : " · скрыт"}
                {b.isDemo ? " · демо" : ""}
                {!b.photoMediaId ? " · нет фото" : ""}
                {!b.bio ? " · нет описания" : ""}
              </span>
            </span>
            <Link href={`/staff/barbers/${b.id}`} className="btn btn-ghost btn-sm">
              Профиль и график
            </Link>
          </li>
        ))}
      </ul>
      <details className="rounded-xl border border-line bg-card p-4">
        <summary className="cursor-pointer font-semibold">+ Добавить мастера</summary>
        <div className="mt-4">
          <BarberProfileForm id={null} initial={{ name: "", specialization: "", bio: "", sortOrder: list.length + 1 }} tz={settings.timezone} />
        </div>
      </details>
    </div>
  );
}
