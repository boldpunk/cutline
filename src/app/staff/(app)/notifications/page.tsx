import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { formatDateTimeCompact } from "@/lib/format";
import { formatCode } from "@/lib/server/crypto";
import { env } from "@/lib/server/env";
import { getSettings } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";
import { outboxEntries } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Уведомления" };
const EVENT: Record<string, string> = { booking_confirmed: "подтверждение", rescheduled: "перенос", cancelled: "отмена", reminder: "напоминание" };
const STATUS: Record<string, string> = { queued: "в очереди", sent: "отправлено", failed: "ошибка", cancelled: "не требуется" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const tz = (await getSettings(getDb())).timezone;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { rows, hasMore, counts } = await outboxEntries(page, 50);
  const smtp = env.smtp;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Уведомления</h1>
      <section className="rounded-xl border border-line bg-card p-4 text-sm">
        <h2 className="font-semibold">Каналы</h2>
        <ul className="mt-2 space-y-1">
          <li>
            E-mail:{" "}
            {smtp ? (
              <strong className="text-success">настроен ({smtp.host})</strong>
            ) : (
              <strong>не настроен</strong>
            )}{" "}
            {smtp
              ? `— письма отправляет фоновый процесс (npm run worker). Напоминание: ${env.reminderHoursBefore ? `за ${env.reminderHoursBefore} ч` : "выключено"}.`
              : "— клиентам не предлагается указать e-mail; подтверждение показывается на экране, есть ссылка и .ics."}
          </li>
          <li>SMS: не подключено (следующий этап).</li>
          <li>Telegram: не подключено (следующий этап).</li>
        </ul>
        {counts.length > 0 && (
          <p className="mt-3">
            {counts.map((c) => `${STATUS[c.status] ?? c.status}: ${c.n}`).join(" · ")}
          </p>
        )}
      </section>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-text">Очередь пуста.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted-text">
              <tr>
                <th className="px-3 py-2 font-medium">Создано</th>
                <th className="px-3 py-2 font-medium">Запись</th>
                <th className="px-3 py-2 font-medium">Событие</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Попытки</th>
                <th className="px-3 py-2 font-medium">Следующая / отправлено</th>
                <th className="px-3 py-2 font-medium">Ошибка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ o, code }) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 tabular-nums">{formatDateTimeCompact(o.createdAt, tz)}</td>
                  <td className="px-3 py-2">
                    <Link className="link font-mono text-xs" href={`/staff/bookings/${o.bookingId}`}>
                      {formatCode(code)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{EVENT[o.eventType]}</td>
                  <td className={`px-3 py-2 font-medium ${o.status === "failed" ? "text-danger" : ""}`}>{STATUS[o.status]}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {o.attempts}/{o.maxAttempts}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatDateTimeCompact(o.sentAt ?? o.nextAttemptAt, tz)}</td>
                  <td className="px-3 py-2 text-danger">{o.lastError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="flex gap-2" aria-label="Страницы">
        {page > 1 && (
          <Link className="btn btn-ghost btn-sm" href={`?page=${page - 1}`}>
            ← Новее
          </Link>
        )}
        {hasMore && (
          <Link className="btn btn-ghost btn-sm" href={`?page=${page + 1}`}>
            Старее →
          </Link>
        )}
      </nav>
    </div>
  );
}
