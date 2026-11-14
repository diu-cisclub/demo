/**
 * Forward pass of the hero network: 64 → 16 → 12 → 10, ReLU then softmax.
 * Weights come from scripts/train_digits.py (scikit-learn MLPClassifier) and
 * are stored as W[out][in]. No libraries, just a few small matrix products.
 */
export interface Layer {
  W: number[][];
  b: number[];
}
export interface Weights {
  layers: Layer[];
  inputSize: number;
  accuracy: number;
}

/** Activations of every layer, input first. The last entry is the softmax output. */
export type Activations = number[][];

const relu = (x: number) => (x > 0 ? x : 0);

function softmax(z: number[]): number[] {
  const max = Math.max(...z);
  const exp = z.map((v) => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / sum);
}

export function forward(weights: Weights, input: number[]): Activations {
  const acts: Activations = [input];
  weights.layers.forEach((layer, i) => {
    const prev = acts[i]!;
    const z = layer.W.map((row, o) => row.reduce((sum, w, j) => sum + w * prev[j]!, layer.b[o]!));
    const isOutput = i === weights.layers.length - 1;
    acts.push(isOutput ? softmax(z) : z.map(relu));
  });
  return acts;
}

/** Index and probability of the most likely digit. */
export function predict(output: number[]): { digit: number; confidence: number } {
  let digit = 0;
  output.forEach((p, i) => {
    if (p > output[digit]!) digit = i;
  });
  return { digit, confidence: output[digit]! };
}
