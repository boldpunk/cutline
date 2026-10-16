"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost, type SlotOption } from "@/lib/client/api";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { normalizePhone } from "@/lib/domain/phone";
import { utcToZoned } from "@/lib/domain/time";
import { formatDateTime, formatTime, tzLabel } from "@/lib/format";
import type { Catalog, PublicConfig } from "@/lib/server/public-data";
import { DateTimePicker } from "./DateTimePicker";
import { LAST_OPERATION_KEY, type LastOperation } from "./last-operation";

const STEPS = [
  { key: "service", label: "Услуга" },
  { key: "barber", label: "Мастер" },
  { key: "time", label: "Дата и время" },
  { key: "details", label: "Контакты" },
  { key: "review", label: "Проверка" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

type Contact = { name: string; phone: string; email: string; comment: string; consent: boolean };
const EMPTY_CONTACT: Contact = { name: "", phone: "", email: "", comment: "", consent: false };
const CONTACT_KEY = "cutline:booking-contact";

type Conflict =
  | { kind: "slot_taken"; message: string; alternatives: SlotOption[] }
  | { kind: "price_changed"; message: string; offers: { barberId: string; barberName: string; priceUzs: number }[] }
  | { kind: "error"; message: string; retry: boolean };

function validateContact(c: Contact, emailEnabled: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.name.trim()) e.name = "Укажите имя";
  else if (c.name.trim().length > 100) e.name = "Не длиннее 100 символов";
  if (!c.phone.trim()) e.phone = "Укажите телефон";
  else if (!normalizePhone(c.phone)) e.phone = "Проверьте номер: нужен международный формат, например +998 90 123 45 67";
  if (emailEnabled && c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) e.email = "Некорректный e-mail";
  if (c.comment.length > 500) e.comment = "Не длиннее 500 символов";
  if (!c.consent) e.consent = "Нужно согласие на обработку данных";
  return e;
}

export function BookingWizard({ catalog, config, today }: { catalog: Catalog; config: PublicConfig; today: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tz = config.timezone;

  // ---- URL state (so browser Back/Forward keeps every choice) ----
  const service = catalog.services.find((s) => s.id === sp.get("service")) ?? null;
  const barberParam = sp.get("barber");
  const barberPreset = catalog.barbers.find((b) => b.id === barberParam) ?? null;
  const barberValid =
    barberParam === "any" ? !!service : !!(service && barberPreset && service.offers.some((o) => o.barberId === barberPreset.id));
  const barberId = barberValid ? barberParam! : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? sp.get("date") : null;
  const time = sp.get("time");
  const timeValid = !!(time && date && !Number.isNaN(Date.parse(time)) && utcToZoned(Date.parse(time), tz).date === date);
  const avail = (sp.get("avail") ?? "").split(",").filter((id) => service?.offers.some((o) => o.barberId === id));
  const assigned = barberId === "any" ? (avail.includes(sp.get("as") ?? "") ? sp.get("as") : avail[0] ?? null) : barberId;

  // ---- Contact (kept in memory + sessionStorage, never in the URL) ----
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CONTACT_KEY);
      if (saved) setContact({ ...EMPTY_CONTACT, ...JSON.parse(saved) });
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(CONTACT_KEY, JSON.stringify(contact));
    } catch {
      /* ignore */
    }
  }, [contact]);
  const contactErrors = validateContact(contact, config.emailEnabled);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});

  // ---- Step resolution ----
  const firstMissing: StepKey = !service
    ? "service"
    : !barberId
      ? "barber"
      : !timeValid || (barberId === "any" && !assigned)
        ? "time"
        : Object.keys(contactErrors).length
          ? "details"
          : "review";
  const requested = (STEPS.find((s) => s.key === sp.get("step"))?.key ?? firstMissing) as StepKey;
  const order = (k: StepKey) => STEPS.findIndex((s) => s.key === k);
  const step: StepKey = order(requested) <= order(firstMissing) ? requested : firstMissing;
  const stepIndex = order(step);

  function go(patch: Record<string, string | null>, opts: { replace?: boolean } = {}) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const url = `${pathname}?${next.toString()}`;
    if (opts.replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  /**
   * Records a choice on the current history entry, then pushes the next step.
   * Browser Back therefore returns to a step that still shows what was chosen.
   */
  function advance(selection: Record<string, string | null>, nextStep: StepKey) {
    const current = new URLSearchParams(sp.toString());
    current.set("step", step);
    for (const [k, v] of Object.entries(selection)) {
      if (v === null) current.delete(k);
      else current.set(k, v);
    }
    window.history.replaceState(window.history.state, "", `${pathname}?${current.toString()}`);
    current.set("step", nextStep);
    router.push(`${pathname}?${current.toString()}`, { scroll: false });
  }

  // Move focus to the step heading on step change (screen readers, keyboard).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step]);

  // ---- Prices ----
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const offerFor = (id: string | null) => {
    const o = service?.offers.find((x) => x.barberId === id);
    return o ? { ...o, priceUzs: priceOverrides[o.barberId] ?? o.priceUzs } : null;
  };
  const barberName = (id: string | null) => catalog.barbers.find((b) => b.id === id)?.name ?? "";
  const currentOffer = offerFor(assigned);

  // ---- Submit ----
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const idem = useRef<{ payload: string; key: string } | null>(null);

  const payload = useMemo(() => {
    if (!service || !barberId || !time || !currentOffer) return null;
    return {
      serviceId: service.id,
      barberId,
      assignedBarberId: barberId === "any" ? (assigned ?? undefined) : undefined,
      startAt: time,
      expectedPriceUzs: currentOffer.priceUzs,
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      email: config.emailEnabled && contact.email.trim() ? contact.email.trim() : undefined,
      comment: contact.comment.trim() || undefined,
      consent: true as const,
      consentVersion: config.consentVersion,
    };
  }, [service, barberId, assigned, time, currentOffer, contact, config]);

  async function submit() {
    if (!payload || submitting) return;
    const serialized = JSON.stringify(payload);
    // Same data → same key, so retries after a network error can't double-book.
    if (!idem.current || idem.current.payload !== serialized) idem.current = { payload: serialized, key: crypto.randomUUID() };
    setSubmitting(true);
    setConflict(null);
    const res = await apiPost<{
      code: string;
      token: string;
      manageUrl: string;
      startAt: string;
      endAt: string;
      serviceName: string;
      priceUzs: number;
      durationMin: number;
      barberName: string;
    }>("/api/public/bookings", { ...payload, idempotencyKey: idem.current.key });
    setSubmitting(false);
    if (res.ok) {
      const op: LastOperation = {
        kind: "created",
        code: res.data.code,
        manageUrl: res.data.manageUrl,
        startAt: res.data.startAt,
        endAt: res.data.endAt,
        serviceName: res.data.serviceName,
        priceUzs: res.data.priceUzs,
        durationMin: res.data.durationMin,
        barberName: res.data.barberName,
        timezone: tz,
        salonName: config.salonName,
        address: config.address,
        demo: config.mode === "demo",
        cancelCutoffHours: config.cancelCutoffHours,
        emailSent: !!payload.email,
      };
      try {
        sessionStorage.setItem(LAST_OPERATION_KEY, JSON.stringify(op));
        sessionStorage.removeItem(CONTACT_KEY);
      } catch {
        /* ignore */
      }
      router.replace("/booking/success");
      return;
    }
    const { error } = res;
    if (error.code === "slot_taken") {
      setConflict({ kind: "slot_taken", message: error.message, alternatives: (error.details?.alternatives as SlotOption[]) ?? [] });
    } else if (error.code === "price_changed") {
      const offers = (error.details?.offers as { barberId: string; barberName: string; priceUzs: number }[]) ?? [];
      setPriceOverrides((p) => ({ ...p, ...Object.fromEntries(offers.map((o) => [o.barberId, o.priceUzs])) }));
      setConflict({ kind: "price_changed", message: error.message, offers });
      if (barberId === "any" && offers[0]) {
        go({ avail: offers.map((o) => o.barberId).join(","), as: offers[0].barberId }, { replace: true });
      }
    } else if (error.code === "validation" && error.details?.fields) {
      setServerFieldErrors(error.details.fields as Record<string, string>);
      setTouched(true);
      go({ step: "details" });
    } else {
      setConflict({ kind: "error", message: error.message, retry: res.network });
    }
  }

  function chooseSlot(slot: SlotOption) {
    setConflict(null);
    const d = utcToZoned(Date.parse(slot.startAt), tz).date;
    const selection = {
      date: d,
      time: slot.startAt,
      avail: barberId === "any" ? slot.barberIds.join(",") : null,
      as: barberId === "any" ? slot.barberIds[0]! : null,
    };
    if (step === "review") go(selection, { replace: true });
    else advance(selection, "details");
  }

  const visibleServices = barberPreset && !service ? catalog.services.filter((s) => barberPreset.serviceIds.includes(s.id)) : catalog.services;

  // ---- Render ----
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 md:pt-12">
      <h1 className="display text-5xl md:text-6xl">Запись</h1>

      <nav aria-label="Шаги записи" className="mt-6">
        <ol className="flex flex-wrap gap-x-2 gap-y-2 text-sm">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            const reachable = i <= order(firstMissing);
            const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
              current ? "border-ink bg-ink text-paper" : done ? "border-ink bg-white" : "border-line text-muted-text"
            }`;
            const content = (
              <>
                <span className="tabular-nums font-semibold">{i + 1}</span> {s.label}
                {done && <span className="sr-only"> (готово)</span>}
              </>
            );
            return (
              <li key={s.key}>
                {reachable && !current ? (
                  <button type="button" className={`${cls} hover:bg-accent`} onClick={() => go({ step: s.key })}>
                    {content}
                  </button>
                ) : (
                  <span className={cls} aria-current={current ? "step" : undefined}>
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Running summary */}
      {service && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <span>
            <span className="text-muted-text">Услуга:</span> <strong>{service.name}</strong>
          </span>
          {barberId && (
            <span>
              <span className="text-muted-text">Мастер:</span>{" "}
              <strong>{barberId === "any" ? (assigned && timeValid ? `${barberName(assigned)} (назначен автоматически)` : "любой") : barberName(barberId)}</strong>
            </span>
          )}
          {timeValid && time && (
            <span>
              <span className="text-muted-text">Время:</span> <strong>{formatDateTime(time, tz)}</strong>
            </span>
          )}
          {currentOffer && (
            <span>
              <span className="text-muted-text">Стоимость:</span>{" "}
              <strong className="tabular-nums">{formatUzs(currentOffer.priceUzs)}</strong> · {formatDuration(currentOffer.durationMin)}
            </span>
          )}
        </div>
      )}

      <section className="mt-8" aria-labelledby="step-h">
        <h2 id="step-h" ref={headingRef} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">
          {stepIndex + 1}. {STEPS[stepIndex]!.label}
        </h2>

        {step === "service" && (
          <div className="mt-6">
            {barberPreset && !service && (
              <p className="mb-4 text-muted-text">
                Услуги мастера {barberPreset.name}.{" "}
                <button type="button" className="link" onClick={() => go({ barber: null })}>
                  Показать все услуги
                </button>
              </p>
            )}
            {visibleServices.length === 0 ? (
              <p className="rounded-lg border border-line bg-card p-4">Сейчас нет услуг, доступных для онлайн-записи.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {visibleServices.map((s) => {
                  const preOffer = barberPreset ? s.offers.find((o) => o.barberId === barberPreset.id) : null;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-pressed={service?.id === s.id}
                        onClick={() =>
                          advance(
                            {
                              service: s.id,
                              barber: preOffer ? barberPreset!.id : null,
                              date: null,
                              time: null,
                              avail: null,
                              as: null,
                            },
                            preOffer ? "time" : "barber",
                          )
                        }
                        className={`flex w-full flex-col rounded-xl border-2 p-4 text-left transition-colors hover:bg-accent ${
                          service?.id === s.id ? "border-ink bg-white" : "border-line bg-card"
                        }`}
                      >
                        <span className="flex w-full items-baseline justify-between gap-3">
                          <span className="text-lg font-semibold">{s.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {preOffer
                              ? formatUzs(preOffer.priceUzs)
                              : s.minPrice === s.maxPrice
                                ? formatUzs(s.minPrice)
                                : `${formatUzs(s.minPrice)} – ${formatUzs(s.maxPrice)}`}
                          </span>
                        </span>
                        {s.description && <span className="mt-1 text-sm text-muted-text">{s.description}</span>}
                        <span className="mt-2 text-sm text-muted-text">
                          {preOffer
                            ? formatDuration(preOffer.durationMin)
                            : s.minDuration === s.maxDuration
                              ? formatDuration(s.minDuration)
                              : `${formatDuration(s.minDuration)} – ${formatDuration(s.maxDuration)}`}
                          {!preOffer && s.minPrice !== s.maxPrice && " · цена зависит от мастера"}
                        </span>
                        {service?.id === s.id && <span className="mt-2 text-sm font-semibold">✓ Выбрано</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {step === "barber" && service && (
          <div className="mt-6">
            <ul className="grid gap-3 md:grid-cols-2">
              <li>
                <button
                  type="button"
                  aria-pressed={barberId === "any"}
                  onClick={() => advance({ barber: "any", date: null, time: null, avail: null, as: null }, "time")}
                  className={`flex w-full flex-col rounded-xl border-2 p-4 text-left transition-colors hover:bg-accent ${
                    barberId === "any" ? "border-ink bg-white" : "border-line bg-card"
                  }`}
                >
                  <span className="flex w-full items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold">Любой мастер</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {service.minPrice === service.maxPrice ? formatUzs(service.minPrice) : `${formatUzs(service.minPrice)} – ${formatUzs(service.maxPrice)}`}
                    </span>
                  </span>
                  <span className="mt-1 text-sm text-muted-text">
                    Покажем всё свободное время. Мастер назначится автоматически
                    {service.minPrice !== service.maxPrice ? " — точную цену увидите до подтверждения" : ""}.
                  </span>
                  {barberId === "any" && <span className="mt-2 text-sm font-semibold">✓ Выбрано</span>}
                </button>
              </li>
              {service.offers.map((o) => {
                const b = catalog.barbers.find((x) => x.id === o.barberId)!;
                return (
                  <li key={o.barberId}>
                    <button
                      type="button"
                      aria-pressed={barberId === o.barberId}
                      onClick={() => advance({ barber: o.barberId, date: null, time: null, avail: null, as: null }, "time")}
                      className={`flex w-full flex-col rounded-xl border-2 p-4 text-left transition-colors hover:bg-accent ${
                        barberId === o.barberId ? "border-ink bg-white" : "border-line bg-card"
                      }`}
                    >
                      <span className="flex w-full items-baseline justify-between gap-3">
                        <span className="text-lg font-semibold">{b.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{formatUzs(priceOverrides[o.barberId] ?? o.priceUzs)}</span>
                      </span>
                      {b.specialization && <span className="mt-1 text-sm text-muted-text">{b.specialization}</span>}
                      <span className="mt-1 text-sm text-muted-text">{formatDuration(o.durationMin)}</span>
                      {barberId === o.barberId && <span className="mt-2 text-sm font-semibold">✓ Выбрано</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {step === "time" && service && barberId && (
          <div className="mt-6">
            <p className="mb-5 text-sm text-muted-text">Время указано по часовому поясу салона ({tzLabel(tz)}).</p>
            <DateTimePicker
              serviceId={service.id}
              barberId={barberId}
              timezone={tz}
              date={date}
              time={timeValid ? time : null}
              todayHint={today}
              onDate={(d, { auto }) => go({ date: d, time: null, avail: null, as: null }, { replace: auto })}
              onTime={(slot) => chooseSlot(slot)}
            />
          </div>
        )}

        {step === "details" && (
          <form
            className="mt-6 max-w-xl space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              setServerFieldErrors({});
              if (Object.keys(contactErrors).length === 0) advance({}, "review");
              else document.getElementById(`f-${Object.keys(contactErrors)[0]}`)?.focus();
            }}
          >
            <Field id="f-name" label="Имя" error={touched ? (serverFieldErrors.name ?? contactErrors.name) : undefined}>
              <input
                id="f-name"
                className="input"
                autoComplete="given-name"
                maxLength={100}
                value={contact.name}
                aria-invalid={touched && !!contactErrors.name}
                aria-describedby={touched && contactErrors.name ? "f-name-err" : undefined}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
              />
            </Field>
            <Field
              id="f-phone"
              label="Телефон"
              hint="В международном формате, например +998 90 123 45 67. Последние 4 цифры понадобятся, чтобы открыть запись по ссылке."
              error={touched ? (serverFieldErrors.phone ?? contactErrors.phone) : undefined}
            >
              <input
                id="f-phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={32}
                placeholder="+998 __ ___ __ __"
                value={contact.phone}
                aria-invalid={touched && !!contactErrors.phone}
                aria-describedby={`f-phone-hint${touched && contactErrors.phone ? " f-phone-err" : ""}`}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              />
            </Field>
            {config.emailEnabled && (
              <Field id="f-email" label="E-mail (необязательно)" hint="Пришлём подтверждение и напоминание о визите." error={touched ? contactErrors.email : undefined}>
                <input
                  id="f-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  value={contact.email}
                  aria-invalid={touched && !!contactErrors.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                />
              </Field>
            )}
            <Field id="f-comment" label="Комментарий (необязательно)" hint={`${contact.comment.length}/500`} error={touched ? contactErrors.comment : undefined}>
              <textarea
                id="f-comment"
                className="input min-h-24"
                maxLength={500}
                value={contact.comment}
                onChange={(e) => setContact({ ...contact, comment: e.target.value })}
              />
            </Field>
            <div>
              <label className="flex items-start gap-3">
                <input
                  id="f-consent"
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 accent-ink"
                  checked={contact.consent}
                  aria-invalid={touched && !!contactErrors.consent}
                  aria-describedby={touched && contactErrors.consent ? "f-consent-err" : undefined}
                  onChange={(e) => setContact({ ...contact, consent: e.target.checked })}
                />
                <span>
                  Согласен(на) на обработку имени и телефона для записи —{" "}
                  <Link href="/privacy" target="_blank" className="link">
                    условия
                  </Link>{" "}
                  <span className="text-sm text-muted-text">(версия {config.consentVersion})</span>
                </span>
              </label>
              {touched && contactErrors.consent && (
                <p id="f-consent-err" className="field-error">
                  {contactErrors.consent}
                </p>
              )}
            </div>
            {config.mode === "demo" && (
              <p className="rounded-lg border-2 border-ink bg-accent/40 p-3 text-sm font-medium">
                Это демо: не вводите реальные данные. Можно указать вымышленное имя и номер вроде +998 90 000 00 00.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-primary">
                Проверить запись
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go({ step: "time" })}>
                Назад
              </button>
            </div>
          </form>
        )}

        {step === "review" && service && currentOffer && time && (
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
            <div>
              <dl className="divide-y divide-line rounded-2xl border border-line bg-card">
                <Row label="Услуга">{service.name}</Row>
                <Row label="Мастер">
                  {barberName(assigned)}
                  {barberId === "any" && <span className="block text-sm text-muted-text">назначен автоматически</span>}
                </Row>
                <Row label="Дата и время">
                  {formatDateTime(time, tz)}
                  <span className="block text-sm text-muted-text">
                    до {formatTime(Date.parse(time) + currentOffer.durationMin * 60_000, tz)} · время салона ({tzLabel(tz)})
                  </span>
                </Row>
                <Row label="Длительность">{formatDuration(currentOffer.durationMin)}</Row>
                <Row label="Стоимость">
                  <span className="text-xl font-semibold tabular-nums">{formatUzs(currentOffer.priceUzs)}</span>
                  <span className="block text-sm text-muted-text">оплата в салоне</span>
                </Row>
                <Row label="Имя">{contact.name}</Row>
                <Row label="Телефон">{contact.phone}</Row>
                {config.emailEnabled && contact.email && <Row label="E-mail">{contact.email}</Row>}
                {contact.comment && <Row label="Комментарий">{contact.comment}</Row>}
              </dl>

              {barberId === "any" && avail.length > 1 && (
                <fieldset className="mt-6">
                  <legend className="font-semibold">Свободные мастера на это время</legend>
                  <div className="mt-2 space-y-2">
                    {avail.map((id) => {
                      const o = offerFor(id)!;
                      return (
                        <label key={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3">
                          <span className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="assigned"
                              className="h-5 w-5 accent-ink"
                              checked={assigned === id}
                              onChange={() => go({ as: id }, { replace: true })}
                            />
                            {barberName(id)}
                          </span>
                          <span className="tabular-nums">{formatUzs(o.priceUzs)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>

            <div className="space-y-4">
              {conflict?.kind === "slot_taken" && (
                <div role="alert" className="rounded-xl border-2 border-danger bg-danger-bg p-4">
                  <p className="font-semibold text-danger">{conflict.message}</p>
                  {conflict.alternatives.length > 0 ? (
                    <>
                      <p className="mt-2 text-sm">Ближайшее свободное время:</p>
                      <ul className="mt-2 grid grid-cols-2 gap-2">
                        {conflict.alternatives.map((a) => (
                          <li key={a.startAt}>
                            <button type="button" className="btn btn-ghost btn-sm w-full bg-white" onClick={() => chooseSlot(a)}>
                              {formatDateTime(a.startAt, tz).replace(/^[^,]+, /, "")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs">Выбор нового времени не сбросит ваши контакты.</p>
                    </>
                  ) : (
                    <button type="button" className="link mt-2 text-sm" onClick={() => go({ step: "time", time: null })}>
                      Выбрать другое время
                    </button>
                  )}
                </div>
              )}
              {conflict?.kind === "price_changed" && (
                <div role="alert" className="rounded-xl border-2 border-ink bg-accent/40 p-4">
                  <p className="font-semibold">{conflict.message}</p>
                  <p className="mt-1 text-sm">Новая стоимость указана слева. Нажмите «Подтвердить запись», если она вам подходит.</p>
                </div>
              )}
              {conflict?.kind === "error" && (
                <div role="alert" className="rounded-xl border-2 border-danger bg-danger-bg p-4">
                  <p className="font-semibold text-danger">{conflict.message}</p>
                  {conflict.retry && <p className="mt-1 text-sm">Повторная отправка не создаст вторую запись.</p>}
                </div>
              )}
              <button type="button" className="btn btn-primary w-full text-lg" onClick={submit} disabled={submitting} aria-busy={submitting}>
                {submitting ? "Отправляем…" : conflict?.kind === "error" && conflict.retry ? "Повторить" : "Подтвердить запись"}
              </button>
              <button type="button" className="btn btn-ghost w-full" onClick={() => go({ step: "details" })}>
                Назад
              </button>
              <p className="text-sm text-muted-text">
                Перенести или отменить запись можно по личной ссылке не позднее чем за {config.cancelCutoffHours} ч до визита.
                {config.mode === "demo" && " Демо: запись сохранится в тестовой базе, визит не состоится."}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-text">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
