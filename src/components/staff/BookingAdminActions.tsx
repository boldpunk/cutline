"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelAction, outcomeAction, rescheduleAction } from "@/app/staff/(app)/bookings/actions";
import { DateTimePicker } from "@/components/booking/DateTimePicker";
import { Dialog } from "@/components/ui/Dialog";
import type { SlotOption } from "@/lib/client/api";
import type { BookingStatus } from "@/lib/db/schema";
import { formatUzs } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server/action-result";

export function BookingAdminActions(props: {
  bookingId: string;
  isAdmin: boolean;
  status: BookingStatus;
  started: boolean;
  serviceId: string;
  barberId: string;
  priceUzs: number;
  offers: { barberId: string; barberName: string; priceUzs: number }[];
  timezone: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [resched, setResched] = useState(false);
  const [barberId, setBarberId] = useState(props.barberId);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [reschedReason, setReschedReason] = useState("");

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setCancelOpen(false);
        setResched(false);
        router.refresh();
      }
    });

  const same = barberId === props.barberId;
  const newPrice = same ? props.priceUzs : props.offers.find((o) => o.barberId === barberId)?.priceUzs ?? props.priceUzs;
  const canOutcome = props.started && ["confirmed", "completed", "no_show"].includes(props.status);

  return (
    <section className="mt-6" aria-label="Действия с записью">
      {result && (
        <p role="status" className={`mb-3 rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {result.ok ? result.message : result.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canOutcome && (
          <>
            <button type="button" className="btn btn-dark btn-sm" disabled={pending || props.status === "completed"} onClick={() => run(() => outcomeAction(props.bookingId, "completed"))}>
              Визит состоялся
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending || props.status === "no_show"} onClick={() => run(() => outcomeAction(props.bookingId, "no_show"))}>
              Клиент не пришёл
            </button>
          </>
        )}
        {!props.started && props.status === "confirmed" && !props.isAdmin && (
          <p className="text-sm text-muted-text">Отметить визит можно после его начала. Перенос и отмену делает администратор.</p>
        )}
        {props.isAdmin && props.status === "confirmed" && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResched((v) => !v)} aria-expanded={resched}>
              Перенести
            </button>
            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setCancelOpen(true)}>
              Отменить
            </button>
          </>
        )}
      </div>

      {resched && props.isAdmin && (
        <div className="mt-4 rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold">Перенос записи</h2>
          <p className="text-sm text-muted-text">Показано всё свободное время (включая ближайший час). Старое время освобождается только после успешного переноса.</p>
          {props.offers.length > 1 && (
            <div className="mt-3 max-w-xs">
              <label className="field-label text-sm" htmlFor="rs-barber">
                Мастер
              </label>
              <select
                id="rs-barber"
                className="input"
                value={barberId}
                onChange={(e) => {
                  setBarberId(e.target.value);
                  setDate(null);
                  setSlot(null);
                }}
              >
                {props.offers.map((o) => (
                  <option key={o.barberId} value={o.barberId}>
                    {o.barberName} — {o.barberId === props.barberId ? `${formatUzs(props.priceUzs)} (текущая)` : formatUzs(o.priceUzs)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-4">
            <DateTimePicker
              key={barberId}
              serviceId={props.serviceId}
              barberId={barberId}
              timezone={props.timezone}
              date={date}
              time={slot?.startAt ?? null}
              todayHint={props.today}
              scope="staff"
              onDate={(d) => {
                setDate(d);
                setSlot(null);
              }}
              onTime={(s) => setSlot(s)}
            />
          </div>
          <div className="mt-4 max-w-md">
            <label className="field-label text-sm" htmlFor="rs-reason">
              Причина переноса
            </label>
            <input id="rs-reason" className="input" value={reschedReason} maxLength={300} onChange={(e) => setReschedReason(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm mt-3"
            disabled={!slot || pending}
            onClick={() =>
              run(() =>
                rescheduleAction({
                  bookingId: props.bookingId,
                  startAt: slot!.startAt,
                  barberId: same ? undefined : barberId,
                  expectedPriceUzs: same ? undefined : newPrice,
                  reason: reschedReason,
                }),
              )
            }
          >
            {slot ? `Перенести на ${formatDateTime(slot.startAt, props.timezone)} · ${formatUzs(newPrice)}` : "Выберите время"}
          </button>
        </div>
      )}

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Отменить запись?">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => cancelAction(props.bookingId, reason));
          }}
        >
          <label htmlFor="cancel-reason" className="field-label">
            Причина (видна в журнале)
          </label>
          <input id="cancel-reason" className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} required minLength={3} />
          {result && !result.ok && <p className="field-error">{result.message}</p>}
          <div className="mt-4 flex gap-2">
            <button type="submit" className="btn btn-danger btn-sm" disabled={pending}>
              Отменить запись
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelOpen(false)}>
              Закрыть
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
