"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buildIcs, downloadIcs } from "@/lib/client/ics";
import { formatCodeClient } from "@/lib/client/code";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { formatDateTime, formatTime, tzLabel } from "@/lib/format";
import { LAST_OPERATION_KEY, type LastOperation } from "./last-operation";

const TITLES: Record<LastOperation["kind"], string> = {
  created: "Вы записаны",
  rescheduled: "Запись перенесена",
  cancelled: "Запись отменена",
};

export function SuccessView() {
  const [op, setOp] = useState<LastOperation | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_OPERATION_KEY);
      setOp(raw ? (JSON.parse(raw) as LastOperation) : null);
    } catch {
      setOp(null);
    }
  }, []);

  if (op === undefined) return <p>Загрузка…</p>;
  if (op === null) {
    return (
      <div>
        <h1 className="display text-4xl">Нет данных об операции</h1>
        <p className="mt-4 text-muted-text">
          Эта страница показывает результат записи только в той вкладке, где она была сделана. Если вы сохранили личную
          ссылку на запись — откройте её. Если ссылка потерялась, позвоните в салон: администратор найдёт запись по номеру
          телефона.
        </p>
        <Link href="/" className="btn btn-dark mt-6">
          На главную
        </Link>
      </div>
    );
  }

  const tz = op.timezone;
  async function copy() {
    if (!op?.manageUrl) return;
    try {
      await navigator.clipboard.writeText(op.manageUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="animate-rise">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-text">Код записи {formatCodeClient(op.code)}</p>
      <h1 className="display mt-2 text-4xl">{TITLES[op.kind]}</h1>
      {op.demo && (
        <p className="mt-4 rounded-lg border-2 border-ink bg-accent-soft p-3 font-medium">
          Это демонстрационный салон: запись сохранена в тестовой базе, но визит не состоится.
        </p>
      )}

      <dl className={`mt-8 divide-y divide-line rounded-2xl border border-line bg-card ${op.kind === "cancelled" ? "opacity-70" : ""}`}>
        {[
          ["Услуга", op.serviceName],
          ["Мастер", op.barberName],
          ["Дата и время", `${formatDateTime(op.startAt, tz)}–${formatTime(op.endAt, tz)} (${tzLabel(tz)})`],
          ["Длительность", formatDuration(op.durationMin)],
          ["Стоимость", formatUzs(op.priceUzs)],
          ...(op.address ? [["Адрес", op.address]] : []),
        ].map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm text-muted-text">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {op.kind !== "cancelled" && (
        <>
          {op.manageUrl && (
            <section className="mt-8 rounded-2xl border-2 border-ink p-5" aria-labelledby="link-h">
              <h2 id="link-h" className="text-xl font-semibold">
                Сохраните личную ссылку
              </h2>
              <p className="mt-2 text-sm">
                По ней можно посмотреть, перенести или отменить запись (не позднее чем за {op.cancelCutoffHours} ч до визита). Для
                входа понадобятся последние 4 цифры вашего телефона. Мы не отправляем эту ссылку по SMS — скопируйте её сейчас.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input readOnly value={op.manageUrl} aria-label="Личная ссылка на запись" className="input font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-dark shrink-0" onClick={copy}>
                  {copied ? "Скопировано ✓" : "Скопировать"}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-text">Не пересылайте ссылку посторонним.</p>
            </section>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                downloadIcs(
                  `cutline-${op.code}.ics`,
                  buildIcs({
                    code: op.code,
                    startAt: op.startAt,
                    endAt: op.endAt,
                    title: `${op.serviceName} — ${op.salonName}`,
                    description: `Мастер: ${op.barberName}. Код записи: ${formatCodeClient(op.code)}.${op.demo ? " Демонстрационная запись." : ""}`,
                    location: op.address,
                  }),
                )
              }
            >
              Добавить в календарь (.ics)
            </button>
            <Link href={op.base} className="btn btn-ghost">
              На страницу салона
            </Link>
          </div>
          {op.emailSent ? (
            <p className="mt-6 text-sm text-muted-text">Письмо с подтверждением поставлено в очередь отправки на указанный e-mail.</p>
          ) : (
            <p className="mt-6 text-sm text-muted-text">Подтверждение — эта страница. SMS и сообщения мы не отправляем.</p>
          )}
        </>
      )}
      {op.kind === "cancelled" && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`${op.base}/book`} className="btn btn-primary">
            Записаться снова
          </Link>
          <Link href={op.base} className="btn btn-ghost">
            На страницу салона
          </Link>
        </div>
      )}
    </div>
  );
}
