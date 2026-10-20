import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { DurationRange, PriceRange } from "@/components/site/PriceRange";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { getCatalog, loadSalonPage } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Услуги и цены",
  description: "Полный прайс барбершопа: длительность, описание и стоимость каждой услуги.",
};

export default async function ServicesPage({ params }: { params: Promise<{ salon: string }> }) {
  const page = await loadSalonPage((await params).salon);
  if (!page) notFound();
  const settings = page.salon;
  const base = `/${settings.slug}`;
  const { services, barbers } = await getCatalog(settings.id);
  const byCategory = new Map<string, typeof services>();
  for (const s of services) {
    const key = s.category ?? "Услуги";
    byCategory.set(key, [...(byCategory.get(key) ?? []), s]);
  }
  const barberName = new Map(barbers.map((b) => [b.id, b.name]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 className="display text-4xl md:text-5xl">Услуги и цены</h1>
      <p className="mt-4 max-w-2xl text-muted-text">
        Цены указаны в сумах. Если цена или длительность зависит от мастера, это указано в строке услуги; при записи вы
        увидите точную сумму до подтверждения.
      </p>
      {services.some((s) => s.isDemo) && (
        <p className="mt-3 text-sm font-medium">Демонстрационный прайс: цены и длительности вымышлены.</p>
      )}
      {services.length === 0 && <p className="mt-10 text-muted-text">Услуги ещё не опубликованы.</p>}
      {[...byCategory.entries()].map(([cat, list]) => (
        <section key={cat} className="mt-12" aria-labelledby={`cat-${cat}`}>
          <h2 id={`cat-${cat}`} className="display border-b-2 border-ink pb-2 text-2xl">
            {cat}
          </h2>
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="grid gap-3 py-6 sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <h3 className="text-xl font-semibold">{s.name}</h3>
                  {s.description && <p className="mt-1 text-muted-text">{s.description}</p>}
                  <p className="mt-2 text-sm text-muted-text">
                    Длительность: <DurationRange min={s.minDuration} max={s.maxDuration} />
                  </p>
                  {(s.minPrice !== s.maxPrice || s.minDuration !== s.maxDuration) && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer font-medium underline underline-offset-4">Цены по мастерам</summary>
                      <ul className="mt-2 space-y-1">
                        {s.offers.map((o) => (
                          <li key={o.barberId} className="flex justify-between gap-4 tabular-nums">
                            <span>{barberName.get(o.barberId)}</span>
                            <span>
                              {formatUzs(o.priceUzs)} · {formatDuration(o.durationMin)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <p className="text-lg font-semibold tabular-nums sm:text-right">
                    <PriceRange min={s.minPrice} max={s.maxPrice} />
                  </p>
                  <Link href={`${base}/book?service=${s.id}&step=barber`} className="btn btn-dark btn-sm">
                    Записаться
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
