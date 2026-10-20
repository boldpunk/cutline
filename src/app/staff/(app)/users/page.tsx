import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { CreateUserForm, UserRowActions } from "@/components/staff/UserForms";
import { getDb } from "@/lib/db/client";
import { barbers, users } from "@/lib/db/schema";
import { getSalon } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";
import { listBarbersBasic } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Сотрудники" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const user = me;
  const db = getDb();
  const [settings, list, allBarbers] = await Promise.all([
    getSalon(db, user.salonId),
    db
      .select({ u: users, barberName: barbers.name })
      .from(users)
      .leftJoin(barbers, eq(barbers.id, users.barberId))
      .where(eq(users.salonId, me.salonId))
      .orderBy(asc(users.role), asc(users.name)),
    listBarbersBasic(user.salonId),
  ]);
  const linked = new Set(list.map((r) => r.u.barberId).filter(Boolean));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Сотрудники и доступ</h1>
      <p className="text-sm text-muted-text">Публичной регистрации нет. Мастер видит только свой календарь и своих клиентов.</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {list.map(({ u, barberName }) => (
          <li key={u.id} className="grid gap-2 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <span className="font-semibold">{u.name}</span> <span className="text-sm text-muted-text">{u.email}</span>
              <span className="block text-sm">
                {u.role === "admin" ? "Администратор" : `Мастер · ${barberName}`}
                {!u.active && <span className="text-danger"> · доступ отключён</span>}
                {u.id === me.id && <span className="text-muted-text"> · это вы</span>}
              </span>
            </div>
            <UserRowActions userId={u.id} active={u.active} tz={settings.timezone} />
          </li>
        ))}
      </ul>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 font-semibold">Новая учётная запись</h2>
        <CreateUserForm barbers={allBarbers.filter((b) => !linked.has(b.id))} tz={settings.timezone} />
      </section>
    </div>
  );
}
