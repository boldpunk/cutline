import { highlightParts, type SearchHit, type SearchKind } from "@/lib/search/engine";

export const KIND_LABELS: Record<SearchKind, string> = { service: "Услуги", barber: "Мастера", info: "Информация" };
export const KIND_ORDER: SearchKind[] = ["service", "barber", "info"];

/**
 * Groups hits by kind. Groups are ordered by their best hit, so the top match
 * is always first (searching a barber's name shows "Мастера" first); ties fall
 * back to services → barbers → info.
 */
export function groupHits(hits: SearchHit[]): { kind: SearchKind; hits: SearchHit[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, hits: hits.filter((h) => h.doc.kind === kind) }))
    .filter((g) => g.hits.length)
    .sort((a, b) => Math.max(...b.hits.map((h) => h.score)) - Math.max(...a.hits.map((h) => h.score)));
}

const ICONS: Record<SearchKind, string> = { service: "✂", barber: "◉", info: "i" };

export function SearchResultRow({ hit, active = false }: { hit: SearchHit; active?: boolean }) {
  return (
    <span className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${active ? "bg-ink text-paper" : ""}`}>
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${active ? "bg-accent text-on-accent" : "bg-line/60 text-ink"}`}
      >
        {ICONS[hit.doc.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {highlightParts(hit.doc.title, hit.highlights).map((p, i) =>
            p.mark ? (
              <mark key={i} className={`rounded-sm px-0.5 ${active ? "bg-highlight text-ink" : "bg-accent-soft text-ink"}`}>
                {p.text}
              </mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </span>
        {hit.doc.subtitle && <span className={`block truncate text-sm ${active ? "text-paper/80" : "text-muted-text"}`}>{hit.doc.subtitle}</span>}
      </span>
      <span aria-hidden className={`shrink-0 text-sm ${active ? "text-highlight" : "text-muted"}`}>
        →
      </span>
    </span>
  );
}
