import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { groupHits, KIND_LABELS, SearchResultRow } from "@/components/search/SearchResultRow";
import { prepare, search } from "@/lib/search/engine";
import { loadSalonPage } from "@/lib/server/public-data";
import { buildSearchIndex } from "@/lib/server/search-index";

export const dynamic = "force-dynamic";
// Result pages are not indexed; the catalog pages already are.
export const metadata: Metadata = { title: "Поиск", robots: { index: false, follow: true } };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ salon: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const page = await loadSalonPage((await params).salon);
  if (!page) notFound();
  const settings = page.salon;
  const base = `/${settings.slug}`;
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80).trim() ?? "";
  const hits = q ? search(prepare(await buildSearchIndex(settings)), q, 30) : [];
  const groups = groupHits(hits);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="display text-3xl md:text-[2.75rem]">Поиск</h1>
      <form action={`${base}/search`} method="get" role="search" className="mt-6 flex gap-2">
        <label htmlFor="search-q" className="sr-only">
          Что ищем
        </label>
        <input id="search-q" name="q" type="search" defaultValue={q} maxLength={80} placeholder="Стрижка, борода, имя мастера, адрес…" className="input" />
        <button type="submit" className="btn btn-dark shrink-0">
          Найти
        </button>
      </form>

      {q && hits[0] && hits[0].via !== "direct" && (
        <p className="mt-4 text-sm text-muted-text">
          {hits[0].via === "layout" ? "Похоже, запрос набран в английской раскладке — показываем результаты по-русски." : "Показываем результаты для латиницы, прочитанной как кириллица."}
        </p>
      )}

      {q && hits.length === 0 && (
        <div className="mt-10 rounded-xl border border-line bg-card p-6">
          <p className="font-medium">Ничего не нашли по «{q}».</p>
          <p className="mt-2 text-muted-text">
            Посмотрите{" "}
            <Link className="link" href={`${base}/services`}>
              все услуги и цены
            </Link>{" "}
            или{" "}
            <Link className="link" href={`${base}/team`}>
              мастеров
            </Link>
            .
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.kind} className="mt-8" aria-labelledby={`sg-${g.kind}`}>
          <h2 id={`sg-${g.kind}`} className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-text">
            {KIND_LABELS[g.kind]}
          </h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {g.hits.map((h) => (
              <li key={h.doc.id}>
                <Link href={h.doc.href} className="block hover:bg-paper">
                  <SearchResultRow hit={h} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!q && (
        <p className="mt-6 text-muted-text">
          Ищите по названию услуги, имени мастера или вопросу — например, «борода», «Тимур», «адрес», «отменить запись». Подсказка: на любой странице
          нажмите <kbd className="rounded border border-line px-1">Ctrl K</kbd> или <kbd className="rounded border border-line px-1">/</kbd>.
        </p>
      )}
    </div>
  );
}
