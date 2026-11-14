/**
 * Keyword search over /search-index.json. Fast and dependency-free.
 * Used by the ⌘K palette and as Ask CIS's last-resort fallback.
 */
import type { SearchDoc } from '../../lib/search-docs';

let cache: Promise<SearchDoc[]> | null = null;

/** Loads the index once per page view. */
export function loadIndex(base: string): Promise<SearchDoc[]> {
  cache ??= fetch(`${base}search-index.json`)
    .then((r) => (r.ok ? r.json() : { docs: [] }))
    .then((j: { docs: SearchDoc[] }) => j.docs);
  return cache;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const terms = (q: string) => norm(q).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);

/** Title hits outweigh body hits; prefix matches count ("comp" finds "competition"). */
export function keywordSearch(docs: SearchDoc[], query: string, limit = 8): SearchDoc[] {
  const qs = terms(query);
  if (!qs.length) return [];
  const scored = docs.map((d) => {
    const title = norm(d.title);
    const body = norm(d.text);
    let score = 0;
    for (const q of qs) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u');
      if (re.test(title)) score += 3;
      if (re.test(body)) score += 1;
    }
    // Every term matched → strong boost.
    return { d, score: score + (score >= qs.length * 1 ? qs.length : 0) };
  });
  const seen = new Set<string>();
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.d)
    .filter((d) => (seen.has(d.url + d.title) ? false : (seen.add(d.url + d.title), true)))
    .slice(0, limit);
}
