/**
 * Retrieval for Ask CIS: embeds every passage of the site once, caches the
 * vectors in IndexedDB (keyed by the index build time, so a new deploy
 * re-embeds), then finds the passages closest in meaning to a question.
 */
import type { SearchDoc } from '../../lib/search-docs';
import { embed, isEmbedderReady } from './embedder';

interface Indexed {
  doc: SearchDoc;
  vector: number[];
}
export interface Hit {
  doc: SearchDoc;
  score: number;
}

let index: Promise<Indexed[]> | null = null;

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
const passageText = (d: SearchDoc) => `${d.title}. ${d.text}`;

// ── Tiny IndexedDB cache (failures just mean re-embedding) ─────────────────
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('ask-cis', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('vectors');
      req.onerror = () => resolve(undefined);
      req.onsuccess = () => {
        const r = fn(req.result.transaction('vectors', mode).objectStore('vectors'));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(undefined);
      };
    } catch {
      resolve(undefined);
    }
  });
}

export function buildIndex(base: string, onProgress?: (fraction: number) => void): Promise<Indexed[]> {
  index ??= (async () => {
    const res = await fetch(`${base}search-index.json`);
    const { builtAt, docs } = (await res.json()) as { builtAt: string; docs: SearchDoc[] };
    const cached = await idb<{ builtAt: string; vectors: number[][] }>('readonly', (s) => s.get('site'));
    if (cached?.builtAt === builtAt && cached.vectors.length === docs.length) {
      return docs.map((doc, i) => ({ doc, vector: cached.vectors[i]! }));
    }
    const vectors: number[][] = [];
    for (let i = 0; i < docs.length; i += 32) {
      vectors.push(...(await embed(docs.slice(i, i + 32).map(passageText))));
      onProgress?.(Math.min(1, (i + 32) / docs.length));
    }
    await idb('readwrite', (s) => s.put({ builtAt, vectors }, 'site'));
    return docs.map((doc, i) => ({ doc, vector: vectors[i]! }));
  })();
  return index;
}

/** The passages most similar in meaning to `question`. */
export async function retrieve(question: string, k = 4): Promise<Hit[]> {
  const items = await index!;
  const [q] = await embed([question]);
  return items
    .map(({ doc, vector }) => ({ doc, score: dot(q!, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Used by ⌘K search: re-order keyword results by meaning, if the model is already loaded. */
export async function rerank(docs: SearchDoc[], query: string): Promise<SearchDoc[]> {
  if (!isEmbedderReady() || !index || docs.length < 2) return docs;
  const items = await index;
  const [q] = await embed([query]);
  const byId = new Map(items.map((i) => [i.doc.id, i.vector]));
  return [...docs].sort((a, b) => dot(q!, byId.get(b.id) ?? []) - dot(q!, byId.get(a.id) ?? []));
}
