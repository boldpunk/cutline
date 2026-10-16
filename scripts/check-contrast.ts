// WCAG 2.x contrast ratios for the text/background pairs actually used in the UI.
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

export const PAIRS: [string, string, string, number][] = [
  // label, fg, bg, required ratio
  ["ink on paper (body text)", "#171715", "#F3F0E8", 4.5],
  ["paper on ink (dark sections)", "#F3F0E8", "#171715", 4.5],
  ["paper on surface (cards on dark)", "#F3F0E8", "#262622", 4.5],
  ["accent on ink (headline accent)", "#D9F05A", "#171715", 4.5],
  ["accent on surface", "#D9F05A", "#262622", 4.5],
  ["ink on accent (primary button)", "#171715", "#D9F05A", 4.5],
  ["muted #77776F on paper — large text / icons only", "#77776F", "#F3F0E8", 3],
  ["muted-text on paper (used: #5F5F58)", "#5F5F58", "#F3F0E8", 4.5],
  ["muted-text on white card", "#5F5F58", "#FFFFFF", 4.5],
  ["muted on ink (#A3A39A)", "#A3A39A", "#171715", 4.5],
  ["line on paper (non-text, borders)", "#C9C8BE", "#F3F0E8", 1.0],
  ["control border on paper (#8A897F, UI 3:1)", "#8A897F", "#F3F0E8", 3],
  ["danger text on paper (#A3261B)", "#A3261B", "#F3F0E8", 4.5],
  ["success text on paper (#2F6B2A)", "#2F6B2A", "#F3F0E8", 4.5],
  ["accent on paper (NOT used for text)", "#D9F05A", "#F3F0E8", 0],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false;
  for (const [label, fg, bg, need] of PAIRS) {
    const r = ratio(fg, bg);
    const ok = r >= need;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1  (need ${need})  ${label}`);
  }
  process.exit(failed ? 1 : 0);
}
