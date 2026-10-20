"use client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { createStaffBookingAction } from "@/app/staff/(app)/bookings/actions";
import { DateTimePicker } from "@/components/booking/DateTimePicker";
import type { SlotOption } from "@/lib/client/api";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server/action-result";
import type { Catalog } from "@/lib/server/public-data";

export function NewBookingForm({ catalog, timezone, today }: { catalog: Catalog; timezone: string; today: string }) {
  const [serviceId, setServiceId] = useState(catalog.services[0]?.id ?? "");
  const service = catalog.services.find((s) => s.id === serviceId);
  const [barberId, setBarberId] = useState(service?.offers[0]?.barberId ?? "");
  const offer = service?.offers.find((o) => o.barberId === barberId);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<{ code: string; manageUrl: string; bookingId: string }> | null>(null);
  const idem = useRef<{ payload: string; key: string } | null>(null);
  const barberName = (id: string) => catalog.barbers.find((b) => b.id === id)?.name ?? "";

  const payload = useMemo(
    () =>
      slot && offer
        ? { serviceId, barberId, startAt: slot.startAt, expectedPriceUzs: offer.priceUzs, name, phone, comment: comment || undefined, consent }
        : null,
    [serviceId, barberId, slot, offer, name, phone, comment, consent],
  );

  if (result?.ok && result.data) {
    return (
      <div className="mt-6 max-w-xl rounded-xl border-2 border-ink bg-card p-5">
        <h2 className="text-xl font-semibold">Запись создана: {result.data.code.slice(0, 4)}-{result.data.code.slice(4)}</h2>
        <p className="mt-2 text-sm">
          Личная ссылка клиента (показывается один раз — передайте её клиенту, если нужно). Для входа клиенту понадобятся последние 4 цифры телефона.
        </p>
        <input readOnly className="input mt-2 font-mono text-xs" value={result.data.manageUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Ссылка клиента" />
        <div className="mt-4 flex gap-2">
          <Link href={`/staff/bookings/${result.data.bookingId}`} className="btn btn-dark btn-sm">
            Открыть запись
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setResult(null);
              setSlot(null);
              setName("");
              setPhone("");
              setComment("");
              setConsent(false);
            }}
          >
            Ещё запись
          </button>
        </div>
      </div>
    );
  }

  const err = result && !result.ok ? result : null;
  return (
    <form
      className="mt-6 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!payload) return;
        const ser = JSON.stringify(payload);
        if (!idem.current || idem.current.payload !== ser) idem.current = { payload: ser, key: crypto.randomUUID() };
        const key = idem.current.key;
        start(async () => setResult(await createStaffBookingAction({ ...payload, consent: payload.consent as true, idempotencyKey: key })));
      }}
    >
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nb-service" className="field-label">
            Услуга
          </label>
          <select
            id="nb-service"
            className="input"
            value={serviceId}
            onChange={(e) => {
              const s = catalog.services.find((x) => x.id === e.target.value);
              setServiceId(e.target.value);
              setBarberId(s?.offers[0]?.barberId ?? "");
              setDate(null);
              setSlot(null);
            }}
          >
            {catalog.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nb-barber" className="field-label">
            Мастер
          </label>
          <select
            id="nb-barber"
            className="input"
            value={barberId}
            onChange={(e) => {
              setBarberId(e.target.value);
              setDate(null);
              setSlot(null);
            }}
          >
            {service?.offers.map((o) => (
              <option key={o.barberId} value={o.barberId}>
                {barberName(o.barberId)} — {formatUzs(o.priceUzs)}, {formatDuration(o.durationMin)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {service && barberId && (
        <DateTimePicker
          key={`${serviceId}-${barberId}`}
          serviceId={serviceId}
          barberId={barberId}
          timezone={timezone}
          date={date}
          time={slot?.startAt ?? null}
          todayHint={today}
          scope="staff"
          onDate={(d) => {
            setDate(d);
            setSlot(null);
          }}
          onTime={(s) => setSlot(s)}
        />
      )}

      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nb-name" className="field-label">
            Имя клиента
          </label>
          <input id="nb-name" className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
          {err?.fields?.name && <p className="field-error">{err.fields.name}</p>}
        </div>
        <div>
          <label htmlFor="nb-phone" className="field-label">
            Телефон
          </label>
          <input id="nb-phone" className="input" type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} required />
          {(err?.fields?.phone ?? (err?.details?.fields as Record<string, string> | undefined)?.phone) && (
            <p className="field-error">{err?.fields?.phone ?? (err?.details?.fields as Record<string, string>).phone}</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="nb-comment" className="field-label">
            Комментарий
          </label>
          <textarea id="nb-comment" className="input" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <label className="flex items-start gap-3 sm:col-span-2">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-ink" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Клиент согласился на обработку имени и телефона (устно или лично)</span>
        </label>
      </div>

      {err && (
        <div role="alert" className="max-w-2xl rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {err.message}
          {Array.isArray(err.details?.alternatives) && (err.details.alternatives as SlotOption[]).length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {(err.details.alternatives as SlotOption[]).map((a) => (
                <li key={a.startAt}>
                  <button type="button" className="btn btn-ghost btn-sm bg-white" onClick={() => setSlot(a)}>
                    {formatDateTime(a.startAt, timezone)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={!payload || !consent || pending}>
        {pending ? "Создаём…" : slot && offer ? `Записать на ${formatDateTime(slot.startAt, timezone)} · ${formatUzs(offer.priceUzs)}` : "Выберите время"}
      </button>
    </form>
  );
}
