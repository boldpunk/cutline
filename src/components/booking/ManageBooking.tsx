"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { apiPost, type SlotOption } from "@/lib/client/api";
import { formatCodeClient } from "@/lib/client/code";
import { buildIcs, downloadIcs } from "@/lib/client/ics";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { formatDateTime, formatDateTimeCompact, formatTime, STATUS_LABELS, tzLabel } from "@/lib/format";
import type { ClientBookingView } from "@/lib/server/client-booking";
import type { PublicConfig } from "@/lib/server/public-data";
import { DateTimePicker } from "./DateTimePicker";
import { LAST_OPERATION_KEY, type LastOperation } from "./last-operation";

const EVENT_LABELS: Record<string, string> = {
  created: "Создана",
  rescheduled: "Перенесена",
  cancelled: "Отменена",
  completed: "Визит состоялся",
  no_show: "Отмечена неявка",
};

export function ManageBooking({
  token,
  manageUrl,
  view,
  config,
  today,
}: {
  token: string;
  manageUrl: string;
  view: ClientBookingView;
  config: PublicConfig;
  today: string;
}) {
  const router = useRouter();
  const tz = config.timezone;
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [barberId, setBarberId] = useState(view.barberId);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; alternatives?: SlotOption[] } | null>(null);

  const newOffer = view.offers.find((o) => o.barberId === barberId);
  const sameBarber = barberId === view.barberId;
  // Same barber keeps the agreed price; another barber means their current price.
  const newPrice = sameBarber ? view.priceUzs : newOffer?.priceUzs ?? view.priceUzs;
  const newDuration = sameBarber ? view.durationMin : newOffer?.durationMin ?? view.durationMin;

  function finish(kind: LastOperation["kind"], data: { startAt: string; endAt: string; barberName: string; priceUzs: number; durationMin: number }) {
    const op: LastOperation = {
      kind,
      code: view.code,
      manageUrl: kind === "cancelled" ? null : manageUrl,
      startAt: data.startAt,
      endAt: data.endAt,
      serviceName: view.serviceName,
      priceUzs: data.priceUzs,
      durationMin: data.durationMin,
      barberName: data.barberName,
      timezone: tz,
      salonName: config.salonName,
      address: config.address,
      demo: config.mode === "demo",
      cancelCutoffHours: config.cancelCutoffHours,
      emailSent: false,
    };
    try {
      sessionStorage.setItem(LAST_OPERATION_KEY, JSON.stringify(op));
    } catch {
      /* ignore */
    }
    router.push("/booking/success");
  }

  async function doCancel() {
    setBusy(true);
    setError(null);
    const r = await apiPost<{ ok: true; status: string }>("/api/public/booking-manage", { token, action: "cancel" });
    setBusy(false);
    if (r.ok) {
      setCancelOpen(false);
      finish("cancelled", { startAt: view.startAt, endAt: view.endAt, barberName: view.barberName, priceUzs: view.priceUzs, durationMin: view.durationMin });
    } else if (r.status === 401) {
      router.refresh();
    } else {
      setCancelOpen(false);
      setError({ message: r.error.message });
    }
  }

  async function doReschedule() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    const r = await apiPost<{ startAt: string; endAt: string; barberName: string; priceUzs: number; durationMin: number }>(
      "/api/public/booking-manage",
      {
        token,
        action: "reschedule",
        startAt: slot.startAt,
        barberId: sameBarber ? undefined : barberId,
        expectedPriceUzs: sameBarber ? undefined : newPrice,
      },
    );
    setBusy(false);
    if (r.ok) finish("rescheduled", r.data);
    else if (r.status === 401) router.refresh();
    else setError({ message: r.error.message, alternatives: r.error.details?.alternatives as SlotOption[] | undefined });
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-text">Код записи {formatCodeClient(view.code)}</p>
      <h1 className="display mt-2 text-5xl">Ваша запись</h1>
      <p className="mt-3">
        <span className={`chip ${view.status === "confirmed" ? "text-success" : "text-muted-text"}`}>{STATUS_LABELS[view.status]}</span>
      </p>

      <dl className="mt-6 divide-y divide-line rounded-2xl border border-line bg-card">
        {[
          ["Услуга", view.serviceName],
          ["Мастер", view.barberName],
          ["Дата и время", `${formatDateTime(view.startAt, tz)}–${formatTime(view.endAt, tz)} (${tzLabel(tz)})`],
          ["Длительность", formatDuration(view.durationMin)],
          ["Стоимость", formatUzs(view.priceUzs)],
          ["Клиент", [view.clientName, view.phoneMasked].filter(Boolean).join(", ") || "данные удалены"],
        ].map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm text-muted-text">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <div role="alert" className="mt-6 rounded-xl border-2 border-danger bg-danger-bg p-4">
          <p className="font-semibold text-danger">{error.message}</p>
          {error.alternatives && error.alternatives.length > 0 && (
            <>
              <p className="mt-2 text-sm">Свободное время рядом:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {error.alternatives.map((a) => (
                  <li key={a.startAt}>
                    <button type="button" className="btn btn-ghost btn-sm bg-white" onClick={() => setSlot(a)}>
                      {formatDateTime(a.startAt, tz)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!view.canChange && view.status === "confirmed" && view.reason && (
        <p className="mt-6 rounded-xl border border-line bg-card p-4">{view.reason}</p>
      )}

      {view.status === "confirmed" && mode === "view" && (
        <div className="mt-6 flex flex-wrap gap-3">
          {view.canChange && (
            <>
              <button type="button" className="btn btn-dark" onClick={() => setMode("reschedule")}>
                Перенести
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(true)}>
                Отменить запись
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              downloadIcs(
                `cutline-${view.code}.ics`,
                buildIcs({
                  code: view.code,
                  startAt: view.startAt,
                  endAt: view.endAt,
                  title: `${view.serviceName} — ${config.salonName}`,
                  description: `Мастер: ${view.barberName}. Код записи: ${formatCodeClient(view.code)}.`,
                  location: config.address,
                }),
              )
            }
          >
            В календарь (.ics)
          </button>
        </div>
      )}

      {mode === "reschedule" && view.canChange && (
        <section className="mt-8" aria-labelledby="resched-h">
          <h2 id="resched-h" className="display text-3xl">
            Перенос
          </h2>
          <p className="mt-2 text-sm text-muted-text">
            Текущая запись останется в силе, пока новое время не будет подтверждено.
          </p>
          {view.offers.length > 1 && (
            <div className="mt-4 max-w-sm">
              <label htmlFor="resched-barber" className="field-label">
                Мастер
              </label>
              <select
                id="resched-barber"
                className="input"
                value={barberId}
                onChange={(e) => {
                  setBarberId(e.target.value);
                  setDate(null);
                  setSlot(null);
                }}
              >
                {view.offers.map((o) => (
                  <option key={o.barberId} value={o.barberId}>
                    {o.barberName} — {o.barberId === view.barberId ? formatUzs(view.priceUzs) + " (как сейчас)" : formatUzs(o.priceUzs)}
                  </option>
                ))}
              </select>
              {!sameBarber && newPrice !== view.priceUzs && (
                <p className="field-hint font-medium text-ink">
                  У этого мастера стоимость {formatUzs(newPrice)} вместо {formatUzs(view.priceUzs)}.
                </p>
              )}
            </div>
          )}
          <div className="mt-6">
            <DateTimePicker
              key={barberId}
              serviceId={view.serviceId}
              barberId={barberId}
              timezone={tz}
              date={date}
              time={slot?.startAt ?? null}
              todayHint={today}
              onDate={(d) => {
                setDate(d);
                setSlot(null);
              }}
              onTime={(s) => setSlot(s)}
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={!slot || busy} onClick={doReschedule}>
              {busy ? "Переносим…" : slot ? `Перенести на ${formatDateTime(slot.startAt, tz)}` : "Выберите новое время"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setMode("view");
                setSlot(null);
                setError(null);
              }}
            >
              Не переносить
            </button>
          </div>
          {slot && (
            <p className="mt-3 text-sm">
              Новая стоимость: <strong>{formatUzs(newPrice)}</strong> · {formatDuration(newDuration)}
            </p>
          )}
        </section>
      )}

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Отменить запись?">
        <p>
          {view.serviceName}, мастер {view.barberName}
          <br />
          <strong>{formatDateTime(view.startAt, tz)}</strong>
        </p>
        <p className="mt-3 text-sm text-muted-text">
          Отмена онлайн возможна не позднее чем за {config.cancelCutoffHours} ч до визита. После отмены время станет доступно
          другим клиентам, восстановить запись будет нельзя.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-danger" onClick={doCancel} disabled={busy}>
            {busy ? "Отменяем…" : "Да, отменить"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(false)}>
            Оставить запись
          </button>
        </div>
      </Dialog>

      {view.history.length > 0 && (
        <section className="mt-10" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-semibold">
            История
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-text">
            {view.history.map((h, i) => (
              <li key={i}>
                {formatDateTimeCompact(h.at, tz)} — {EVENT_LABELS[h.type] ?? h.type}
                {h.actor === "staff" ? " (салон)" : h.actor === "client" ? " (вы)" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
