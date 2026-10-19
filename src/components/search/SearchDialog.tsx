"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { prepare, search, type SearchDoc, type SearchHit } from "@/lib/search/engine";
import { groupHits, KIND_LABELS, SearchResultRow } from "./SearchResultRow";

export const OPEN_SEARCH_EVENT = "cutline:open-search";

const indexPromises = new Map<string, Promise<SearchDoc[]>>();
function loadIndex(slug: string): Promise<SearchDoc[]> {
  const cached = indexPromises.get(slug);
  if (cached) return cached;
  const p = fetch(`/api/public/search-index?salon=${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { docs: SearchDoc[] }) => d.docs)
    .catch((e) => {
      indexPromises.delete(slug); // allow a retry on the next open
      throw e;
    });
  indexPromises.set(slug, p);
  return p;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Site-wide search palette. Opens with Cmd/Ctrl+K, "/" (outside text fields)
 * or the header button; Esc closes and returns focus.
 */
export function SearchDialog({ slug }: { slug: string }) {
  const base = `/${slug}`;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  const show = useCallback(() => {
    if (dialogRef.current?.open) return;
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    setError(false);
    loadIndex(slug).then(setDocs, () => setError(true));
  }, [slug]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      requestAnimationFrame(() => inputRef.current?.select());
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        show();
      }
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, [show]);

  const index = useMemo(() => (docs ? prepare(docs) : null), [docs]);
  const hits: SearchHit[] = useMemo(() => {
    if (!index || !docs) return [];
    if (!query.trim()) {
      // Suggestions before typing: services first, then the two most asked info entries.
      return docs
        .filter((d) => d.kind === "service" || d.id === "info:contacts" || d.id === "info:manage")
        .slice(0, 8)
        .map((doc) => ({ doc, score: 0, highlights: [], via: "direct" as const }));
    }
    return search(index, query, 12);
  }, [index, docs, query]);
  const groups = groupHits(hits);
  const flat = groups.flatMap((g) => g.hits);
  const current = flat[Math.min(active, flat.length - 1)];
  const reinterpreted = query.trim() && hits[0] && hits[0].via !== "direct";

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (current) document.getElementById(`${listId}-${current.doc.id}`)?.scrollIntoView({ block: "nearest" });
  }, [current, listId]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === "Escape") {
      // type=search would spend the first Esc on clearing the text; Esc always closes here.
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (current) go(current.doc.href);
      else if (query.trim()) go(`${base}/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Поиск по сайту"
      onClose={() => {
        setOpen(false);
        opener.current?.focus?.();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) setOpen(false);
      }}
      className="mx-auto mt-[min(12vh,6rem)] mb-auto w-[min(40rem,calc(100vw-2rem))] max-h-[min(36rem,calc(100dvh-4rem))] overflow-hidden rounded-2xl border-2 border-ink bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/60"
    >
      <div className="flex max-h-[min(36rem,calc(100dvh-4rem))] flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span aria-hidden className="text-lg text-muted">
            ⌕
          </span>
          <label htmlFor={`${listId}-input`} className="sr-only">
            Поиск по услугам, мастерам и информации
          </label>
          <input
            id={`${listId}-input`}
            ref={inputRef}
            type="text"
            inputMode="search"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={`${listId}-list`}
            aria-activedescendant={current ? `${listId}-${current.doc.id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={80}
            placeholder="Стрижка, борода, имя мастера, адрес…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            className="h-14 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-text"
          />
          <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm shrink-0 border-line px-2.5 text-xs" aria-label="Закрыть поиск">
            Esc
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-live="polite">
          {error && (
            <p className="px-3 py-6 text-center text-sm">
              Не удалось загрузить данные для поиска.{" "}
              <button type="button" className="link" onClick={() => loadIndex(slug).then(setDocs, () => setError(true))}>
                Повторить
              </button>
            </p>
          )}
          {!error && !docs && <p className="px-3 py-6 text-center text-sm text-muted-text">Загрузка…</p>}
          {docs && reinterpreted && (
            <p className="px-3 pb-1 pt-2 text-xs text-muted-text">
              {hits[0]!.via === "layout" ? "Похоже, включена английская раскладка — ищем по-русски." : "Ищем латиницу как кириллицу."}
            </p>
          )}
          {docs && !query.trim() && <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-text">Популярное</p>}
          {docs && query.trim() && flat.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="font-medium">Ничего не нашли по «{query.trim()}»</p>
              <p className="mt-2 text-sm text-muted-text">
                Посмотрите{" "}
                <Link href={`${base}/services`} className="link" onClick={() => setOpen(false)}>
                  все услуги
                </Link>{" "}
                или{" "}
                <Link href={`${base}/team`} className="link" onClick={() => setOpen(false)}>
                  мастеров
                </Link>
                .
              </p>
            </div>
          )}
          <div role="listbox" id={`${listId}-list`} aria-label="Результаты поиска">
            {groups.map((g) => (
              <div key={g.kind} role="group" aria-labelledby={`${listId}-g-${g.kind}`} className="pb-1">
                {query.trim() && (
                  <p id={`${listId}-g-${g.kind}`} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-text">
                    {KIND_LABELS[g.kind]}
                  </p>
                )}
                {!query.trim() && <span id={`${listId}-g-${g.kind}`} className="sr-only">{KIND_LABELS[g.kind]}</span>}
                {g.hits.map((h) => {
                  const isActive = h === current;
                  return (
                    <div
                      key={h.doc.id}
                      id={`${listId}-${h.doc.id}`}
                      role="option"
                      aria-selected={isActive}
                      className="cursor-pointer"
                      onMouseMove={() => setActive(flat.indexOf(h))}
                      onClick={() => go(h.doc.href)}
                    >
                      <SearchResultRow hit={h} active={isActive} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted-text sm:flex">
          <span>
            <kbd className="font-sans">↑↓</kbd> выбрать
          </span>
          <span>
            <kbd className="font-sans">Enter</kbd> открыть
          </span>
          <span>
            <kbd className="font-sans">Esc</kbd> закрыть
          </span>
          <span className="ml-auto">Можно печатать в любой раскладке и латиницей</span>
        </div>
      </div>
    </dialog>
  );
}
