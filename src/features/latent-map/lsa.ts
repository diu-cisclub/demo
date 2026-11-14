/**
 * Feature C, build-time half: latent semantic analysis of the events.
 * Each event's text becomes a TF-IDF vector; the two strongest directions of
 * variation (PCA via power iteration on the document Gram matrix) give every
 * event an (x, y) position. Events about similar things land close together.
 * Runs at build time only; the page receives just the numbers.
 */
const STOP = new Set(
  'a an and are as at be by for from has have in is it its of on or our that the their this to was were will with we you your all also into who which more over one two three new day days its they them dhaka diu daffodil international university club cis department students student event members member'.split(
    ' ',
  ),
);

/** Lowercase words of 3+ letters, minus stop words, with a light plural strip. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

function tfidf(docs: string[][]): number[][] {
  const vocab = new Map<string, number>();
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const w of new Set(doc)) df.set(w, (df.get(w) ?? 0) + 1);
  }
  // Words used by only one event carry no similarity signal.
  for (const [w, n] of df) if (n > 1) vocab.set(w, vocab.size);
  const idf = [...vocab.keys()].map((w) => Math.log(docs.length / df.get(w)!));
  return docs.map((doc) => {
    const v = new Array(vocab.size).fill(0);
    for (const w of doc) {
      const i = vocab.get(w);
      if (i !== undefined) v[i] += 1;
    }
    const weighted = v.map((tf, i) => (tf ? (1 + Math.log(tf)) * idf[i]! : 0));
    const norm = Math.hypot(...weighted) || 1;
    return weighted.map((x) => x / norm);
  });
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);

/** Top-k eigenvectors of a symmetric matrix by power iteration with deflation. */
function topEigen(m: number[][], k: number): { vector: number[]; value: number }[] {
  const n = m.length;
  const work = m.map((r) => [...r]);
  const out: { vector: number[]; value: number }[] = [];
  for (let c = 0; c < k; c++) {
    // Deterministic start so builds are reproducible.
    let v = Array.from({ length: n }, (_, i) => Math.sin(i + 1 + c));
    let value = 0;
    for (let it = 0; it < 300; it++) {
      const next = work.map((row) => dot(row, v));
      const norm = Math.hypot(...next) || 1;
      v = next.map((x) => x / norm);
      value = norm;
    }
    out.push({ vector: v, value });
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) work[i]![j]! -= value * v[i]! * v[j]!;
  }
  return out;
}

/** Positions in 0…1 for each document, in input order. */
export function latentPositions(texts: string[]): { x: number; y: number }[] {
  const X = tfidf(texts.map(tokenize));
  // Centre the vectors (PCA), then work with the small doc×doc Gram matrix.
  const mean = X[0]!.map((_, j) => X.reduce((s, row) => s + row[j]!, 0) / X.length);
  const C = X.map((row) => row.map((v, j) => v - mean[j]!));
  const gram = C.map((a) => C.map((b) => dot(a, b)));
  const [pc1, pc2] = topEigen(gram, 2);
  const raw = texts.map((_, i) => [pc1!.vector[i]! * Math.sqrt(pc1!.value), pc2!.vector[i]! * Math.sqrt(pc2!.value)] as const);
  // Blend min-max scaling with rank order: keeps clusters together but stops
  // one dense cluster from squeezing everything else into a corner.
  const scale = (vals: number[]) => {
    const min = Math.min(...vals);
    const span = Math.max(...vals) - min || 1;
    const rank = [...vals.keys()].sort((a, b) => vals[a]! - vals[b]!);
    const ranked = new Array<number>(vals.length);
    rank.forEach((idx, r) => (ranked[idx] = r / Math.max(1, vals.length - 1)));
    return vals.map((v, i) => 0.45 * ((v - min) / span) + 0.55 * ranked[i]!);
  };
  const xs = scale(raw.map((p) => p[0]));
  const ys = scale(raw.map((p) => p[1]));
  return xs.map((x, i) => ({ x, y: ys[i]! }));
}

/**
 * Groups nearby points (k-means, deterministic farthest-point start) and names
 * each group after its most common label. Used to title the map's "hills".
 */
export function namedClusters(points: { x: number; y: number }[], labels: string[], k: number) {
  const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const centres = [points[0]!];
  while (centres.length < Math.min(k, points.length)) {
    centres.push(points.reduce((far, p) => (Math.min(...centres.map((c) => d2(c, p))) > Math.min(...centres.map((c) => d2(c, far))) ? p : far)));
  }
  let assign: number[] = [];
  for (let it = 0; it < 30; it++) {
    assign = points.map((p) => centres.reduce((best, c, i) => (d2(p, c) < d2(p, centres[best]!) ? i : best), 0));
    centres.forEach((_, c) => {
      const members = points.filter((_, i) => assign[i] === c);
      if (members.length) centres[c] = { x: members.reduce((s, p) => s + p.x, 0) / members.length, y: members.reduce((s, p) => s + p.y, 0) / members.length };
    });
  }
  return centres
    .map((centre, c) => {
      const counts = new Map<string, number>();
      labels.forEach((l, i) => assign[i] === c && counts.set(l, (counts.get(l) ?? 0) + 1));
      const [label = '', size = 0] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
      return { ...centre, label, size };
    })
    .filter((c) => c.size >= 3)
    .sort((a, b) => b.size - a.size)
    // One label per name: the biggest hill keeps it.
    .filter((c, i, all) => all.findIndex((o) => o.label === c.label) === i);
}
