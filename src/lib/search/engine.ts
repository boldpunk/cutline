// Small client-side search engine for the site catalog (dozens of documents).
// Pure functions, no dependencies. Russian-first:
//  - case/ё-insensitive, punctuation ignored;
//  - prefix matching per word ("стриж" → "Стрижка");
//  - one-typo tolerance for words of 4+ letters ("стришка" → "стрижка");
//  - wrong keyboard layout ("cnhb;rf" → "стрижка");
//  - Latin transliteration ("strizhka", "boroda" → "стрижка", "борода").

export type SearchKind = "service" | "barber" | "info";

export type SearchDoc = {
  id: string;
  kind: SearchKind;
  title: string;
  /** Short secondary line shown under the title (price, specialization…). */
  subtitle?: string;
  /** Extra searchable text that is not displayed (description, synonyms). */
  keywords?: string;
  href: string;
  /** Static boost for ordering ties (e.g. services before info). */
  weight?: number;
};

export type SearchHit = {
  doc: SearchDoc;
  score: number;
  /** [start, end) ranges in doc.title to highlight. */
  highlights: [number, number][];
  /** Which interpretation of the query matched. */
  via: "direct" | "layout" | "translit";
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(" ") : [];
}

// ЙЦУКЕН ↔ QWERTY, by physical key.
const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const RU = "ёйцукенгшщзхъфывапролджэячсмитьбю";
const EN_TO_RU = new Map([...EN].map((c, i) => [c, RU[i]!]));

/** Re-types Latin keystrokes on the Russian layout: "cnhb;rf" → "стрижка". */
export function fixLayout(s: string): string {
  return [...s.toLowerCase()].map((c) => EN_TO_RU.get(c) ?? c).join("");
}

const TRANSLIT: [string, string][] = [
  ["shch", "щ"], ["sch", "щ"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"],
  ["yu", "ю"], ["ya", "я"], ["yo", "ё"], ["ye", "е"], ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"],
  ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["y", "ы"], ["j", "й"], ["k", "к"], ["l", "л"],
  ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"],
  ["f", "ф"], ["h", "х"], ["c", "к"], ["w", "в"], ["x", "кс"], ["q", "к"],
];

/** Phonetic Latin → Cyrillic: "strizhka" → "стрижка". */
export function transliterate(s: string): string {
  let out = "";
  const src = s.toLowerCase();
  for (let i = 0; i < src.length; ) {
    const hit = TRANSLIT.find(([lat]) => src.startsWith(lat, i));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

/** Damerau–Levenshtein distance with early exit above `max`. */
export function editDistance(a: string, b: string, max = 1): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length]!;
}

/** Score of one query word against one document word (0 = no match). */
function wordScore(q: string, w: string): number {
  if (w === q) return 10;
  if (w.startsWith(q)) return q.length >= 2 ? 7 : 3;
  if (q.length >= 4) {
    // Typo in what the user has typed so far: compare with the same-length prefix too.
    const prefix = w.slice(0, q.length);
    if (editDistance(q, w, 1) <= 1 || editDistance(q, prefix, 1) <= 1) return 4;
  }
  if (q.length >= 3 && w.includes(q)) return 2;
  return 0;
}

type Prepared = { doc: SearchDoc; titleWords: { w: string; start: number }[]; otherWords: string[] };

export function prepare(docs: SearchDoc[]): Prepared[] {
  return docs.map((doc) => {
    const titleWords: { w: string; start: number }[] = [];
    const re = /[\p{L}\p{N}]+/gu;
    for (let m; (m = re.exec(doc.title)); ) titleWords.push({ w: normalize(m[0]), start: m.index });
    return { doc, titleWords, otherWords: tokenize(`${doc.subtitle ?? ""} ${doc.keywords ?? ""}`) };
  });
}

function scoreQuery(words: string[], p: Prepared): { score: number; highlights: [number, number][] } | null {
  let total = 0;
  const highlights: [number, number][] = [];
  for (const q of words) {
    let best = 0;
    let bestRange: [number, number] | null = null;
    for (const tw of p.titleWords) {
      const s = wordScore(q, tw.w) * 2; // title matches count double
      if (s > best) {
        best = s;
        bestRange = [tw.start, tw.start + Math.min(q.length, tw.w.length)];
      }
    }
    for (const ow of p.otherWords) {
      const s = wordScore(q, ow);
      if (s > best) {
        best = s;
        bestRange = null;
      }
    }
    if (best === 0) return null; // every word must match somewhere (AND)
    total += best;
    if (bestRange) highlights.push(bestRange);
  }
  return { score: total, highlights };
}

/**
 * Ranked results. The query is tried as typed; if that finds nothing, it is
 * re-read as the Russian keyboard layout, then as Latin transliteration.
 */
export function search(index: Prepared[], query: string, limit = 12): SearchHit[] {
  const raw = query.trim();
  if (!raw) return [];
  const attempts: [SearchHit["via"], string][] = [["direct", raw]];
  if (/[a-z]/i.test(raw)) attempts.push(["layout", fixLayout(raw)], ["translit", transliterate(raw)]);

  for (const [via, q] of attempts) {
    const words = tokenize(q);
    if (words.length === 0) continue;
    const hits: SearchHit[] = [];
    for (const p of index) {
      const r = scoreQuery(words, p);
      if (r) hits.push({ doc: p.doc, score: r.score + (p.doc.weight ?? 0), highlights: r.highlights, via });
    }
    if (hits.length) {
      return hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, "ru")).slice(0, limit);
    }
  }
  return [];
}

/** Splits a title into plain/highlighted parts for rendering. */
export function highlightParts(title: string, ranges: [number, number][]): { text: string; mark: boolean }[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: { text: string; mark: boolean }[] = [];
  let pos = 0;
  for (const [s, e] of sorted) {
    if (s < pos) continue;
    if (s > pos) parts.push({ text: title.slice(pos, s), mark: false });
    parts.push({ text: title.slice(s, e), mark: true });
    pos = e;
  }
  if (pos < title.length) parts.push({ text: title.slice(pos), mark: false });
  return parts;
}
