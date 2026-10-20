import { notFound } from "next/navigation";
import Link from "next/link";
import { Monogram } from "@/components/site/Monogram";
import { DurationRange, PriceRange } from "@/components/site/PriceRange";
import { formatUzs } from "@/lib/domain/money";
import { todayIn, utcToZoned, addDays } from "@/lib/domain/time";
import { formatDayLong, formatTime } from "@/lib/format";
import { groupHours } from "@/lib/hours";
import { amenityLabels } from "@/lib/amenities";
import { getCatalog, getGallery, getNearestSlot, getSalonHours, loadSalonPage, mediaUrl } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";

function relativeDay(iso: string, tz: string): string {
  const date = utcToZoned(Date.parse(iso), tz).date;
  const today = todayIn(tz);
  if (date === today) return "сегодня";
  if (date === addDays(today, 1)) return "завтра";
  return formatDayLong(iso, tz);
}

export default async function HomePage({ params }: { params: Promise<{ salon: string }> }) {
  const page = await loadSalonPage((await params).salon);
  if (!page) notFound();
  const settings = page.salon;
  const base = `/${settings.slug}`;
  const [catalog, hours, gallery] = await Promise.all([getCatalog(settings.id), getSalonHours(settings.id), getGallery(settings.id)]);
  const amenities = amenityLabels(settings.amenities);
  // A large first tile only when the rest fills whole rows (1 + 4 or 1 + 8).
  const shown = gallery.length >= 9 ? gallery.slice(0, 9) : gallery.length >= 5 ? gallery.slice(0, 5) : gallery;
  const featured = shown.length === 5 || shown.length === 9;
  const links = [
    ...(settings.instagramUrl ? [{ label: "Instagram", url: settings.instagramUrl }] : []),
    ...settings.socials,
  ];
  const nearest = await getNearestSlot(settings, catalog);
  const tz = settings.timezone;
  const hero = mediaUrl(settings.heroMediaId);
  const grouped = groupHours(hours);

  return (
    <>
      {/* Hero */}
      <section className="on-dark relative overflow-hidden bg-ink text-paper">
        {/* Barber pole: the one decorative flourish, it turns slowly (static with reduced motion). */}
        <div aria-hidden className="pole pole-turning absolute inset-y-0 left-0 w-2.5 md:w-3.5" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 md:grid-cols-[1.15fr_1fr] md:pb-20 md:pt-16 md:pl-8">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-highlight">Барбершоп по записи</p>
            <h1 className="display mt-4 text-[clamp(2.5rem,9.5vw,5.75rem)] [overflow-wrap:anywhere]">{settings.name}</h1>
            {settings.tagline && <p className="mt-5 max-w-xl text-lg leading-relaxed text-paper/90">{settings.tagline}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`${base}/book`} className="btn btn-primary px-7 text-lg">
                Записаться
              </Link>
              <Link href={`${base}/services`} className="btn border-2 border-paper/60 text-paper hover:bg-paper/10">
                Услуги и цены
              </Link>
            </div>
            <div className="mt-6 text-[15px]" aria-live="polite">
              {nearest ? (
                <p>
                  <span className="text-muted-dark">Ближайшее свободное время: </span>
                  <Link
                    className="link font-semibold text-highlight"
                    href={`${base}/book?service=${nearest.serviceId}&barber=any&date=${utcToZoned(Date.parse(nearest.startAt), tz).date}&step=time`}
                  >
                    {relativeDay(nearest.startAt, tz)}, {formatTime(nearest.startAt, tz)}
                  </Link>
                  <span className="text-muted-dark"> · {nearest.serviceName}</span>
                </p>
              ) : (
                <p className="text-muted-dark">
                  На ближайшую неделю свободного времени нет.{" "}
                  <Link href={`${base}/book`} className="link text-paper">
                    Посмотреть расписание
                  </Link>
                </p>
              )}
            </div>
          </div>

          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt="" className="aspect-[16/11] w-full rounded-2xl object-cover md:aspect-[4/5]" />
          ) : (
            <div className="relative overflow-hidden rounded-3xl border border-paper/10 bg-surface p-6 shadow-2xl sm:p-8">
              <div aria-hidden className="pole absolute inset-x-0 top-0 h-1.5" />
              <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-muted-dark">Прайс</p>
              {catalog.services.length === 0 && (
                <p className="mt-6 text-muted-dark">Здесь появится прайс, когда в кабинете будут добавлены услуги и мастера.</p>
              )}
              <ul className="relative mt-4 divide-y divide-paper/15 pr-2">
                {catalog.services.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="display text-lg sm:text-xl">{s.name}</span>
                    <span className="font-semibold text-highlight tabular-nums sm:shrink-0 sm:text-right">
                      {s.minPrice === s.maxPrice ? formatUzs(s.minPrice) : `${formatUzs(s.minPrice)} – ${formatUzs(s.maxPrice)}`}
                    </span>
                  </li>
                ))}
              </ul>
              {catalog.services.some((s) => s.minPrice !== s.maxPrice) && (
                <p className="mt-3 text-xs text-muted-dark">Диапазон — цена зависит от мастера; точная сумма видна до подтверждения записи.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20" aria-labelledby="services-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="services-h" className="display text-3xl md:text-[2.75rem]">
            Услуги
          </h2>
          <Link href={`${base}/services`} className="link font-medium">
            Полный прайс
          </Link>
        </div>
        {catalog.services.length === 0 ? (
          <p className="mt-6 text-muted-text">Услуги ещё не опубликованы.</p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.services.slice(0, 4).map((s) => (
              <li key={s.id} className="card flex flex-col p-5">
                <h3 className="display text-lg">{s.name}</h3>
                {s.description && <p className="mt-2 text-sm text-muted-text">{s.description}</p>}
                <div className="mt-auto pt-5">
                  <p className="text-sm text-muted-text">
                    <DurationRange min={s.minDuration} max={s.maxDuration} />
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    <PriceRange min={s.minPrice} max={s.maxPrice} />
                  </p>
                  <Link href={`${base}/book?service=${s.id}&step=barber`} className="btn btn-dark btn-sm mt-4 w-full">
                    Записаться
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Works */}
      {gallery.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-14 md:pb-20" aria-labelledby="works-h">
          <h2 id="works-h" className="display text-3xl md:text-[2.75rem]">
            Работы
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {shown.map((g, i) => (
              <li key={g.id} className={`group relative overflow-hidden rounded-2xl bg-card ${i === 0 && featured ? "col-span-2 row-span-2" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.url}
                  alt={g.caption ?? "Работа салона"}
                  loading={i > 2 ? "lazy" : undefined}
                  className="aspect-square h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                />
                {g.caption && (
                  <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8 text-sm font-semibold text-white">
                    {g.caption}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Team */}
      {catalog.barbers.length > 0 && (
        <section className="border-y border-line bg-card" aria-labelledby="team-h">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="team-h" className="display text-3xl md:text-[2.75rem]">
                Мастера
              </h2>
              <Link href={`${base}/team`} className="link font-medium">
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
                    <h3 className="display text-2xl">{b.name}</h3>
                    {b.specialization && <p className="mt-1 text-muted-text">{b.specialization}</p>}
                    {b.isDemo && <p className="chip mt-3 text-muted-text">вымышленный мастер</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* About & amenities */}
      {(settings.about || amenities.length > 0) && (
        <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-14 md:grid-cols-[1.2fr_1fr] md:pt-20" aria-labelledby="about-h">
          <div>
            <h2 id="about-h" className="display text-3xl md:text-[2.75rem]">
              О салоне
            </h2>
            {settings.about && <p className="mt-6 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-muted-text">{settings.about}</p>}
          </div>
          {amenities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-text">Что есть в салоне</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <li key={a} className="rounded-full border-2 border-ink px-4 py-2 font-semibold">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* How it works — only claims what the system actually does */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-14 md:py-20" aria-labelledby="how-h">
        <h2 id="how-h" className="display text-3xl md:text-[2.75rem]">
          Как работает запись
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Услуга и мастер", "Цена и длительность видны до выбора времени. Можно выбрать «любого мастера»."],
            ["2", "Свободное время", `Показываем только время, которое реально свободно в расписании. Запись — не позже чем за ${settings.minLeadMin >= 60 ? `${Math.round(settings.minLeadMin / 60)} ч` : `${settings.minLeadMin} мин`} до визита.`],
            ["3", "Подтверждение на экране", `Сразу после записи — номер и личная ссылка для переноса или отмены (не позднее чем за ${settings.cancelCutoffHours} ч).`],
          ].map(([n, t, d]) => (
            <li key={n} className="border-t-2 border-ink pt-5">
              <span className="display inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-base text-on-accent">{n}</span>
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
            <h2 id="contacts-h" className="display text-3xl md:text-[2.75rem]">
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
            {links.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2">
                {links.map((l) => (
                  <li key={l.url}>
                    <a className="btn btn-sm border-2 border-paper/60 text-paper hover:bg-paper/10" href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {settings.mapUrl && (
              <p className="mt-4">
                <a className="link text-highlight" href={settings.mapUrl} target="_blank" rel="noopener noreferrer">
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
            <Link href={`${base}/book`} className="btn btn-primary mt-8">
              Записаться
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
