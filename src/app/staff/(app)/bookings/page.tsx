import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/db/schema";
import { formatUzs } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import { isValidDateString } from "@/lib/domain/time";
import { formatCode } from "@/lib/server/crypto";
import { formatDateTimeCompact, STATUS_LABELS } from "@/lib/format";
import { getSettings } from "@/lib/server/settings";
import { requireStaff } from "@/lib/server/staff-auth";
import { listBarbersBasic, listBookings } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Записи" };
const PAGE_SIZE = 25;

type SP = Promise<Record<string, string | undefined>>;

export default async function BookingsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireStaff();
  const settings = await getSettings(getDb());
  const tz = settings.timezone;
  const sp = await searchParams;
  const filters = {
    from: sp.from && isValidDateString(sp.from) ? sp.from : undefined,
    to: sp.to && isValidDateString(sp.to) ? sp.to : undefined,
    barberId: user.role === "admin" && sp.barber && /^[0-9a-f-]{36}$/.test(sp.barber) ? sp.barber : undefined,
    status: BOOKING_STATUSES.includes(sp.status as BookingStatus) ? (sp.status as BookingStatus) : undefined,
    q: sp.q?.trim().slice(0, 40) || undefined,
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: PAGE_SIZE,
  };
  const [{ total, rows }, barbers] = await Promise.all([listBookings(user, settings, filters), listBarbersBasic()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `?${p}`;
  };
  const exportQs = new URLSearchParams(Object.entries({ from: filters.from, to: filters.to, barber: filters.barberId, status: filters.status, q: filters.q }).filter(([, v]) => v) as [string, string][]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{user.role === "admin" ? "Записи" : "Мои записи"}</h1>
        {user.role === "admin" && (
          <div className="flex gap-2">
            <Link href="/staff/new-booking" className="btn btn-primary btn-sm">
              Новая запись
            </Link>
            <a href={`/staff/export?${exportQs}`} className="btn btn-ghost btn-sm">
              Экспорт CSV
            </a>
          </div>
        )}
      </div>

      <form className="mt-4 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-6" action="/staff/bookings">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="field-label text-sm">
            Телефон или код записи
          </label>
          <input id="q" name="q" defaultValue={filters.q} className="input" placeholder="+998 90 … или ABCD-EFGH" />
        </div>
        <div>
          <label htmlFor="from" className="field-label text-sm">
            С даты
          </label>
          <input id="from" name="from" type="date" defaultValue={filters.from} className="input" />
        </div>
        <div>
          <label htmlFor="to" className="field-label text-sm">
            По дату
          </label>
          <input id="to" name="to" type="date" defaultValue={filters.to} className="input" />
        </div>
        {user.role === "admin" && (
          <div>
            <label htmlFor="barber" className="field-label text-sm">
              Мастер
            </label>
            <select id="barber" name="barber" defaultValue={filters.barberId ?? ""} className="input">
              <option value="">Все</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.active ? "" : " (неактивен)"}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="status" className="field-label text-sm">
            Статус
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="input">
            <option value="">Все</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="btn btn-dark btn-sm">
            Найти
          </button>
          <Link href="/staff/bookings" className="btn btn-ghost btn-sm">
            Сбросить
          </Link>
          <span className="ml-auto text-sm text-muted-text">Найдено: {total}</span>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="mt-6 text-muted-text">Записей не найдено.</p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-muted-text">
                <tr>
                  <th className="px-3 py-2 font-medium">Время</th>
                  <th className="px-3 py-2 font-medium">Клиент</th>
                  <th className="px-3 py-2 font-medium">Услуга</th>
                  <th className="px-3 py-2 font-medium">Мастер</th>
                  <th className="px-3 py-2 font-medium">Цена</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                  <th className="px-3 py-2 font-medium">Код</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-paper">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      <Link className="link" href={`/staff/bookings/${r.id}`}>
                        {formatDateTimeCompact(r.startAt, tz)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {r.clientName ?? <span className="text-muted-text">удалено</span>}
                      {r.phone && <span className="block text-xs text-muted-text tabular-nums">{formatPhone(r.phone)}</span>}
                    </td>
                    <td className="px-3 py-2">{r.serviceName}</td>
                    <td className="px-3 py-2">{r.barberName}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatUzs(r.priceUzs)}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[r.status]}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatCode(r.code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-card md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/staff/bookings/${r.id}`} className="block px-3 py-3">
                  <span className="font-semibold tabular-nums">{formatDateTimeCompact(r.startAt, tz)}</span> · {r.serviceName}
                  <span className="block text-sm text-muted-text">
                    {r.clientName ?? "—"} · {r.barberName} · {STATUS_LABELS[r.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Страницы" className="mt-4 flex items-center gap-2">
              {filters.page > 1 && (
                <Link className="btn btn-ghost btn-sm" href={qs({ page: String(filters.page - 1) })}>
                  ← Назад
                </Link>
              )}
              <span className="text-sm">
                Стр. {filters.page} из {pages}
              </span>
              {filters.page < pages && (
                <Link className="btn btn-ghost btn-sm" href={qs({ page: String(filters.page + 1) })}>
                  Дальше →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
