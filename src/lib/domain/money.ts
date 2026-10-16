const NBSP = " ";

/** 150000 → "150 000 сум" (integer sums, non-breaking spaces). */
export function formatUzs(amount: number): string {
  const n = Math.round(amount);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "−" : ""}${digits}${NBSP}сум`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}${NBSP}ч ${m}${NBSP}мин`;
  if (h) return `${h}${NBSP}ч`;
  return `${m}${NBSP}мин`;
}
