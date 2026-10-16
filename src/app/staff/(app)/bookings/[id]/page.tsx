import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingAdminActions } from "@/components/staff/BookingAdminActions";
import { getDb } from "@/lib/db/client";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import { todayIn } from "@/lib/domain/time";
import { formatDateTime, formatDateTimeCompact, formatTime, STATUS_LABELS } from "@/lib/format";
import { loadOfferings } from "@/lib/server/availability";
import { formatCode } from "@/lib/server/crypto";
import { getSettings } from "@/lib/server/settings";
import { requireStaff } from "@/lib/server/staff-auth";
import { bookingDetail } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Запись" };

const EVENT_LABELS: Record<string, string> = {
  created: "Создана",
  rescheduled: "Перенесена",
  cancelled: "Отменена",
  completed: "Визит состоялся",
  no_show: "Неявка",
  access_verified: "Клиент открыл запись",
};

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await bookingDetail(user, id);
  if (!detail) notFound();
  const settings = await getSettings(getDb());
  const tz = settings.timezone;
  const { b, contact, barberName, events, outbox } = detail;
  const offers = user.role === "admin" && b.status === "confirmed" ? await loadOfferings(getDb(), b.serviceId) : [];
  const started = b.startAt.getTime() <= Date.now();

  return (
    <div className="max-w-4xl">
      <Link href="/staff/bookings" className="link text-sm">
        ← Все записи
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Запись {formatCode(b.code)}</h1>
        <span className={`chip ${b.status === "confirmed" ? "text-success" : "text-muted-text"}`}>{STATUS_LABELS[b.status]}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <dl className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
          {[
            ["Время", `${formatDateTime(b.startAt, tz, true)}–${formatTime(b.endAt, tz)}`],
            ["Услуга", b.serviceName],
            ["Мастер", barberName],
            ["Длительность", formatDuration(b.durationMin) + (b.bufferBeforeMin || b.bufferAfterMin ? ` (+ подготовка ${b.bufferBeforeMin} / уборка ${b.bufferAfterMin} мин)` : "")],
            ["Цена (согласована)", formatUzs(b.priceUzs)],
            ["Источник", b.source === "online" ? "онлайн" : "администратор"],
            ...(b.statusReason ? [["Причина", b.statusReason]] : []),
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9rem_1fr] gap-2 px-3 py-2">
              <dt className="text-muted-text">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <section className="rounded-xl border border-line bg-card p-4 text-sm" aria-labelledby="contact-h">
          <h2 id="contact-h" className="font-semibold">
            Клиент
          </h2>
          {contact ? (
            <dl className="mt-2 space-y-1">
              <div>
                <dt className="sr-only">Имя</dt>
                <dd className="text-base font-medium">{contact.clientName}</dd>
              </div>
              <div>
                <dt className="sr-only">Телефон</dt>
                <dd>
                  <a className="link tabular-nums" href={`tel:${contact.phoneE164}`}>
                    {formatPhone(contact.phoneE164)}
                  </a>
                </dd>
              </div>
              {contact.email && <dd>{contact.email}</dd>}
              {contact.comment && (
                <div className="pt-2">
                  <dt className="text-muted-text">Комментарий</dt>
                  <dd className="whitespace-pre-wrap">{contact.comment}</dd>
                </div>
              )}
              <div className="pt-2 text-xs text-muted-text">
                Согласие на обработку данных: {formatDateTimeCompact(contact.consentedAt, tz)}, версия {contact.consentVersion}
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-muted-text">Контактные данные удалены по сроку хранения.</p>
          )}
        </section>
      </div>

      <BookingAdminActions
        bookingId={b.id}
        isAdmin={user.role === "admin"}
        status={b.status}
        started={started}
        serviceId={b.serviceId}
        barberId={b.barberId}
        priceUzs={b.priceUzs}
        offers={offers.map((o) => ({ barberId: o.barberId, barberName: o.barberName, priceUzs: o.priceUzs }))}
        timezone={tz}
        today={todayIn(tz)}
      />

      <section className="mt-8" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-semibold">
          История изменений
        </h2>
        <ol className="mt-2 divide-y divide-line rounded-xl border border-line bg-card text-sm">
          {events.map(({ e, actorName }) => {
            const d = e.data as Record<string, unknown>;
            const from = d.from as { startAt?: string } | undefined;
            const to = d.to as { startAt?: string } | undefined;
            return (
              <li key={e.id} className="px-3 py-2">
                <span className="tabular-nums text-muted-text">{formatDateTimeCompact(e.createdAt, tz)}</span> — {EVENT_LABELS[e.type] ?? e.type}
                <span className="text-muted-text">
                  {" "}
                  · {actorName ?? (e.actorType === "client" ? "клиент" : e.actorType === "system" ? "система" : "сотрудник")}
                </span>
                {from?.startAt && to?.startAt && (
                  <span className="block">
                    {formatDateTimeCompact(from.startAt, tz)} → {formatDateTimeCompact(to.startAt, tz)}
                  </span>
                )}
                {typeof d.reason === "string" && d.reason && <span className="block">Причина: {d.reason}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      {user.role === "admin" && (
        <section className="mt-6" aria-labelledby="notif-h">
          <h2 id="notif-h" className="text-lg font-semibold">
            Уведомления клиенту
          </h2>
          {outbox.length === 0 ? (
            <p className="mt-1 text-sm text-muted-text">
              Не отправлялись: {contact?.email ? "канал e-mail не настроен" : "клиент не указал e-mail или канал не настроен"}. Подтверждение клиент
              видел на экране.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card text-sm">
              {outbox.map((o) => (
                <li key={o.id} className="px-3 py-2">
                  {o.eventType} · {o.channel} · <strong>{o.status}</strong> · попыток: {o.attempts}
                  {o.lastError && <span className="block text-danger">{o.lastError}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
