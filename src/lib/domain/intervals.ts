// Half-open intervals [start, end) on numbers (epoch ms or minutes).
export type Interval = { start: number; end: number };

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** Sorts and merges overlapping or touching intervals; drops empty ones. */
export function normalize(list: readonly Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const na = normalize(a);
  const nb = normalize(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < na.length && j < nb.length) {
    const x = na[i]!;
    const y = nb[j]!;
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (start < end) out.push({ start, end });
    if (x.end < y.end) i++;
    else j++;
  }
  return out;
}

export function subtract(from: readonly Interval[], remove: readonly Interval[]): Interval[] {
  let result = normalize(from);
  for (const r of normalize(remove)) {
    const next: Interval[] = [];
    for (const f of result) {
      if (!overlaps(f, r)) {
        next.push(f);
        continue;
      }
      if (f.start < r.start) next.push({ start: f.start, end: r.start });
      if (r.end < f.end) next.push({ start: r.end, end: f.end });
    }
    result = next;
  }
  return result;
}
