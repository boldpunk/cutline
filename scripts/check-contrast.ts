// WCAG 2.x contrast of the text/background pairs the UI actually uses, for
// every page theme. Colors are read from src/app/globals.css (single source).
import { readFileSync } from "node:fs";
import path from "node:path";

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => {
  const [r, g, b] = hex(h).map(lin) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]!] = m[2]!.toLowerCase();
  return out;
}

export function themes(): Record<string, Record<string, string>> {
  const css = readFileSync(path.resolve(import.meta.dirname, "../src/app/globals.css"), "utf8");
  const base = tokens(/@theme\s*{([\s\S]*?)\n}/.exec(css)![1]!);
  const out: Record<string, Record<string, string>> = { pole: base };
  for (const m of css.matchAll(/\[data-salon-theme="([a-z]+)"\]\s*{([\s\S]*?)\n}/g)) out[m[1]!] = { ...base, ...tokens(m[2]!) };
  return out;
}

// [fg, bg, required ratio, what]
const PAIRS: [string, string, number, string][] = [
  ["ink", "paper", 4.5, "body text"],
  ["ink", "card", 4.5, "text on cards"],
  ["muted-text", "paper", 4.5, "secondary text"],
  ["muted-text", "card", 4.5, "secondary text on cards"],
  ["paper", "ink", 4.5, "text on dark sections"],
  ["paper", "surface", 4.5, "text on dark cards"],
  ["muted-dark", "ink", 4.5, "secondary text on dark"],
  ["highlight", "ink", 4.5, "accent text on dark"],
  ["highlight", "surface", 4.5, "accent text on dark cards"],
  ["on-accent", "accent", 4.5, "primary button label"],
  ["ink", "accent-soft", 4.5, "text on hover / selection tint"],
  ["control", "paper", 3, "input borders (non-text)"],
  ["danger", "paper", 4.5, "error text"],
  ["success", "paper", 4.5, "success text"],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false;
  for (const [name, t] of Object.entries(themes())) {
    console.log(`\n[${name}]`);
    for (const [fg, bg, need, what] of PAIRS) {
      const r = ratio(t[fg]!, t[bg]!);
      const ok = r >= need;
      if (!ok) failed = true;
      console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (need ${need})  ${fg} on ${bg} — ${what}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
