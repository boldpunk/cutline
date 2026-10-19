"use client";
import { useEffect, useState } from "react";
import { OPEN_SEARCH_EVENT } from "./SearchDialog";

/** Header search trigger. A real link to /search, so it works without JS too. */
export function SearchButton({ href }: { href: string }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
      }}
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-card px-3 text-sm text-muted-text transition-colors hover:border-ink hover:text-ink"
    >
      <span aria-hidden className="text-base leading-none">
        ⌕
      </span>
      <span className="sr-only sm:not-sr-only">Поиск</span>
      <kbd aria-hidden className="hidden rounded border border-line px-1.5 py-0.5 font-sans text-[11px] leading-none lg:inline">
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </a>
  );
}
