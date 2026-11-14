/**
 * Turns pen strokes into the 8×8 input the network was trained on.
 *
 * scikit-learn's digits come from 32×32 bitmaps that were size-normalised,
 * then split into 4×4 blocks; each input value is the count of "on" pixels
 * in a block (0–16) divided by 16. We reproduce exactly that: fit the
 * strokes' bounding box into 32×32 (keeping aspect ratio, centred), draw them
 * with a pen of fixed width, and count pixels per block. Pure maths, so it
 * runs identically in the browser and in tests.
 */
export type Point = readonly [x: number, y: number];
export type Stroke = readonly Point[];

const SIZE = 32;
const BLOCK = 4;
/** Pen radius in 32×32 pixels. Tuned with scripts/test-hero.ts to match the training digits. */
const PEN = 3;

function distanceToSegment(px: number, py: number, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Returns 64 values in 0…1, row by row. All zeros when there is nothing drawn. */
export function strokesToInput(strokes: readonly Stroke[]): number[] {
  const points = strokes.flat();
  if (points.length === 0) return new Array(64).fill(0);

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  // Leave room for the pen so strokes on the edge are not cut off.
  const inner = SIZE - 2 * PEN;
  const scale = inner / Math.max(w, h, 1e-6);
  const offX = PEN + (inner - w * scale) / 2;
  const offY = PEN + (inner - h * scale) / 2;
  const map = ([x, y]: Point): Point => [offX + (x - minX) * scale, offY + (y - minY) * scale];
  const segments = strokes.flatMap((s) => {
    const m = s.map(map);
    return m.length === 1 ? [[m[0]!, m[0]!] as const] : m.slice(1).map((p, i) => [m[i]!, p] as const);
  });

  const blocks = new Array(64).fill(0);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const on = segments.some(([a, b]) => distanceToSegment(x + 0.5, y + 0.5, a, b) <= PEN);
      if (on) blocks[Math.floor(y / BLOCK) * 8 + Math.floor(x / BLOCK)] += 1;
    }
  }
  return blocks.map((count) => count / (BLOCK * BLOCK));
}
