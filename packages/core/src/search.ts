// Small fuzzy matcher for the command palette. Pure, no dependencies.

/**
 * Scores how well `query` matches `text`. Higher is better, null means no match.
 * Exact prefix beats word start beats initials ("mca" for Mill Creek Auto) beats substring
 * beats scattered letters in order.
 */
export function fuzzyScore(query: string, text: string | null | undefined): number | null {
  const q = query.trim().toLowerCase();
  const t = (text ?? "").toLowerCase();
  if (!q) return 0;
  if (!t) return null;
  if (t.startsWith(q)) return 1000 - t.length;
  const words = t.split(/[\s\-_'.&/]+/);
  if (words.some((w) => w.startsWith(q))) return 800 - t.length;
  const initials = words.map((w) => w[0] ?? "").join("");
  if (q.length > 1 && initials.startsWith(q)) return 700 - t.length;
  const at = t.indexOf(q);
  if (at >= 0) return 600 - at - t.length;
  // Letters in order, rewarding runs of consecutive letters.
  let score = 0;
  let run = 0;
  let i = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const next = t.indexOf(ch, i);
    if (next < 0) return null;
    run = next === i ? run + 1 : 0;
    score += 10 + run * 5 - Math.min(next - i, 10);
    i = next + 1;
  }
  return score;
}

/** Best score across several fields, with the first field weighted highest. */
export function fuzzyBest(query: string, fields: (string | null | undefined)[]): number | null {
  let best: number | null = null;
  fields.forEach((f, idx) => {
    const s = fuzzyScore(query, f);
    if (s == null) return;
    const weighted = s - idx * 50;
    if (best == null || weighted > best) best = weighted;
  });
  return best;
}

/** Filters and sorts items by fuzzy match. Empty query keeps the original order. */
export function fuzzyFilter<T>(query: string, items: T[], fields: (item: T) => (string | null | undefined)[], limit = 8): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, i) => ({ item, i, s: fuzzyBest(query, fields(item)) }))
    .filter((x): x is { item: T; i: number; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}
