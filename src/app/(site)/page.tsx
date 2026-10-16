import Link from "next/link";
import { Monogram } from "@/components/site/Monogram";
import { DurationRange, PriceRange } from "@/components/site/PriceRange";
import { formatUzs } from "@/lib/domain/money";
import { todayIn, utcToZoned, addDays } from "@/lib/domain/time";
import { formatDayLong, formatTime } from "@/lib/format";
import { groupHours } from "@/lib/hours";
import { getCatalog, getNearestSlot, getPublicSettings, getSalonHours, mediaUrl } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";

function relativeDay(iso: string, tz: string): string {
  const date = utcToZoned(Date.parse(iso), tz).date;
  const today = todayIn(tz);
  if (date === today) return "сегодня";
  if (date === addDays(today, 1)) return "завтра";
  return formatDayLong(iso, tz);
}

export default async function HomePage() {
  const settings = await getPublicSettings();
  const [catalog, hours] = await Promise.all([getCatalog(), getSalonHours()]);
  const nearest = await getNearestSlot(settings, catalog);
  const tz = settings.timezone;
  const hero = mediaUrl(settings.heroMediaId);
  const grouped = groupHours(hours);

  return (
    <>
      {/* Hero */}
      <section className="on-dark bg-ink text-paper">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 md:grid-cols-[1.15fr_1fr] md:pb-20 md:pt-16">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Барбершоп по записи</p>
            <h1 className="display mt-4 text-[clamp(4rem,17vw,9.5rem)] break-words">{settings.name}</h1>
            {settings.tagline && <p className="mt-5 max-w-xl text-lg leading-relaxed text-paper/90">{settings.tagline}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="btn btn-primary px-7 text-lg">
                Записаться
              </Link>
              <Link href="/services" className="btn border-2 border-paper/60 text-paper hover:bg-paper/10">
                Услуги и цены
              </Link>
            </div>
            <div className="mt-6 text-[15px]" aria-live="polite">
              {nearest ? (
                <p>
                  <span className="text-muted-dark">Ближайшее свободное время: </span>
                  <Link
                    className="link font-semibold text-accent"
                    href={`/book?service=${nearest.serviceId}&barber=any&date=${utcToZoned(Date.parse(nearest.startAt), tz).date}&step=time`}
                  >
                    {relativeDay(nearest.startAt, tz)}, {formatTime(nearest.startAt, tz)}
                  </Link>
                  <span className="text-muted-dark"> · {nearest.serviceName}</span>
                </p>
              ) : (
                <p className="text-muted-dark">
                  На ближайшую неделю свободного времени нет.{" "}
                  <Link href="/book" className="link text-paper">
                    Посмотреть расписание
                  </Link>
                </p>
              )}
            </div>
          </div>

          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt="" className="aspect-[4/5] w-full rounded-2xl object-cover" />
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-paper/15 bg-surface p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dark">Прайс</p>
              <ul className="mt-4 divide-y divide-paper/15">
                {catalog.services.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="display text-2xl sm:text-3xl">{s.name}</span>
                    <span className="shrink-0 text-right font-semibold text-accent tabular-nums">
                      {s.minPrice === s.maxPrice ? formatUzs(s.minPrice) : `${formatUzs(s.minPrice)} – ${formatUzs(s.maxPrice)}`}
                    </span>
                  </li>
                ))}
              </ul>
              {catalog.services.some((s) => s.minPrice !== s.maxPrice) && (
                <p className="mt-3 text-xs text-muted-dark">Диапазон — цена зависит от мастера; точная сумма видна до подтверждения записи.</p>
              )}
              <div aria-hidden className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full border-[18px] border-accent/80" />
            </div>
          )}
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20" aria-labelledby="services-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="services-h" className="display text-5xl md:text-6xl">
            Услуги
          </h2>
          <Link href="/services" className="link font-medium">
            Полный прайс
          </Link>
        </div>
        {catalog.services.length === 0 ? (
          <p className="mt-6 text-muted-text">Услуги ещё не опубликованы.</p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.services.slice(0, 4).map((s) => (
              <li key={s.id} className="card flex flex-col p-5">
                <h3 className="display text-2xl">{s.name}</h3>
                {s.description && <p className="mt-2 text-sm text-muted-text">{s.description}</p>}
                <div className="mt-auto pt-5">
                  <p className="text-sm text-muted-text">
                    <DurationRange min={s.minDuration} max={s.maxDuration} />
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    <PriceRange min={s.minPrice} max={s.maxPrice} />
                  </p>
                  <Link href={`/book?service=${s.id}&step=barber`} className="btn btn-dark btn-sm mt-4 w-full">
                    Записаться
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Team */}
      {catalog.barbers.length > 0 && (
        <section className="border-y border-line bg-card" aria-labelledby="team-h">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="team-h" className="display text-5xl md:text-6xl">
                Мастера
              </h2>
              <Link href="/team" className="link font-medium">
                Все мастера
              </Link>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.barbers.map((b) => (
                <li key={b.id} className="overflow-hidden rounded-2xl border border-line bg-paper">
                  {b.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.photoUrl} alt={`Мастер ${b.name}`} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <Monogram name={b.name} className="aspect-[4/3] w-full [container-type:inline-size]" />
                  )}
                  <div className="p-5">
                    <h3 className="display text-3xl">{b.name}</h3>
                    {b.specialization && <p className="mt-1 text-muted-text">{b.specialization}</p>}
                    {b.isDemo && <p className="chip mt-3 text-muted-text">вымышленный мастер</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* How it works — only claims what the system actually does */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20" aria-labelledby="how-h">
        <h2 id="how-h" className="display text-5xl md:text-6xl">
          Как работает запись
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["01", "Услуга и мастер", "Цена и длительность видны до выбора времени. Можно выбрать «любого мастера»."],
            ["02", "Свободное время", `Показываем только время, которое реально свободно в расписании. Запись — не позже чем за ${settings.minLeadMin >= 60 ? `${Math.round(settings.minLeadMin / 60)} ч` : `${settings.minLeadMin} мин`} до визита.`],
            ["03", "Подтверждение на экране", `Сразу после записи — номер и личная ссылка для переноса или отмены (не позднее чем за ${settings.cancelCutoffHours} ч).`],
          ].map(([n, t, d]) => (
            <li key={n} className="border-t-2 border-ink pt-4">
              <span className="display text-accent [-webkit-text-stroke:1.5px_var(--color-ink)] text-5xl">{n}</span>
              <h3 className="mt-2 text-xl font-semibold">{t}</h3>
              <p className="mt-2 text-muted-text">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Contacts & hours */}
      <section id="contacts" className="on-dark bg-surface text-paper" aria-labelledby="contacts-h">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <h2 id="contacts-h" className="display text-5xl md:text-6xl">
              Адрес и часы
            </h2>
            {settings.address ? (
              <p className="mt-6 text-xl">{settings.address}</p>
            ) : settings.mode === "demo" ? (
              <p className="mt-6 text-muted-dark">Это демонстрационный салон — у него нет адреса и телефона.</p>
            ) : null}
            {settings.phone && (
              <p className="mt-2 text-xl">
                <a className="link" href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
                  {settings.phone}
                </a>
              </p>
            )}
            {settings.mapUrl && (
              <p className="mt-4">
                <a className="link text-accent" href={settings.mapUrl} target="_blank" rel="noopener noreferrer">
                  Открыть на карте
                </a>
              </p>
            )}
          </div>
          <div>
            {grouped.some((g) => g.hours !== "выходной") ? (
              <table className="w-full text-lg">
                <caption className="sr-only">Часы работы салона</caption>
                <tbody>
                  {grouped.map((g) => (
                    <tr key={g.days} className="border-b border-paper/15">
                      <th scope="row" className="py-3 text-left font-semibold">
                        {g.days}
                      </th>
                      <td className="py-3 text-right tabular-nums">{g.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted-dark">Часы работы ещё не указаны.</p>
            )}
            <Link href="/book" className="btn btn-primary mt-8">
              Записаться
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
