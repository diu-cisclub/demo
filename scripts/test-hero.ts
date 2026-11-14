/**
 * Checks that the hero network reads every sample digit correctly, including
 * jittered copies (to mimic shaky mouse/finger drawing).
 * Run: node scripts/test-hero.ts
 */
import { readFileSync } from 'node:fs';
import { forward, predict, type Weights } from '../src/features/neural-hero/model.ts';
import { strokesToInput, type Stroke } from '../src/features/neural-hero/raster.ts';
import { SAMPLE_DIGITS } from '../src/features/neural-hero/samples.ts';

const weights: Weights = JSON.parse(readFileSync(new URL('../src/features/neural-hero/weights.json', import.meta.url), 'utf8'));

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
const jitter = (strokes: Stroke[], amount: number): Stroke[] =>
  strokes.map((s) => s.map(([x, y]) => [x + rand() * amount, y + rand() * amount] as const));

let failures = 0;
for (const [digit, strokes] of Object.entries(SAMPLE_DIGITS)) {
  const results = [strokes, ...Array.from({ length: 20 }, () => jitter(strokes, 0.06))].map((s) =>
    predict(forward(weights, strokesToInput(s)).at(-1)!),
  );
  const correct = results.filter((r) => r.digit === Number(digit)).length;
  const clean = results[0]!;
  const ok = clean.digit === Number(digit);
  if (!ok) failures++;
  console.log(
    `${digit}: ${ok ? 'ok  ' : 'FAIL'} read as ${clean.digit} (${(clean.confidence * 100).toFixed(0)}%), jittered ${correct}/${results.length}`,
  );
}
process.exit(failures ? 1 : 0);
