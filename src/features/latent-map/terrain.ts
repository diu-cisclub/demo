/**
 * The landscape's height field. Every event raises a smooth hill (a Gaussian)
 * at its position in latent space, weighted by its size, so clusters of
 * similar events become ranges and peaks. Each hill "grows in" over a few
 * weeks after the event's date, which is what the timeline animates.
 *
 * Per-event kernels over the grid are computed once; a frame only sums the
 * visible ones (≈ events × vertices additions, no exp() in the loop).
 */
export interface Peak {
  /** World position (already mapped from latent 0…1 space). */
  x: number;
  z: number;
  /** Relative size of the hill. */
  weight: number;
  /** Event time (ms). */
  t: number;
}

export const WORLD = 22; // terrain width/depth in world units
export const SEGMENTS = 140; // grid resolution
export const MAX_HEIGHT = 4.2;
const SIGMA = 1.55;
/** How long a hill takes to grow after its event (ms). */
const GROW_MS = 50 * 24 * 3600 * 1000;

const kernel = (dx: number, dz: number) => Math.exp(-(dx * dx + dz * dz) / (2 * SIGMA * SIGMA));
const ease = (v: number) => 1 - (1 - v) ** 3;

/** 0…1 growth of each peak at time `now`. */
export const growthAt = (peaks: Peak[], now: number): number[] => peaks.map((p) => ease(Math.min(1, Math.max(0, (now - p.t) / GROW_MS))));

export function createHeightField(peaks: Peak[], vertexXZ: Float32Array) {
  const count = vertexXZ.length / 2;
  const kernels = peaks.map((p) => {
    const k = new Float32Array(count);
    for (let v = 0; v < count; v++) k[v] = p.weight * kernel(vertexXZ[v * 2]! - p.x, vertexXZ[v * 2 + 1]! - p.z);
    return k;
  });
  // Normalise against the fully grown landscape so heights grow, not rescale.
  const full = new Float32Array(count);
  kernels.forEach((k) => k.forEach((v, i) => (full[i]! += v)));
  const scale = MAX_HEIGHT / Math.max(...full, 1e-6);

  return {
    /** Writes heights for the given growth into `out` (one value per vertex). */
    fill(growth: number[], out: Float32Array) {
      out.fill(0);
      kernels.forEach((k, e) => {
        const g = growth[e]! * scale;
        if (g > 0) for (let i = 0; i < count; i++) out[i]! += k[i]! * g;
      });
    },
    /** Height at any world point, for standing pins on the surface. */
    at(x: number, z: number, growth: number[]) {
      return peaks.reduce((h, p, e) => h + growth[e]! * p.weight * kernel(x - p.x, z - p.z), 0) * scale;
    },
  };
}

// perf: medium. ~20k vertices × ~55 kernels ≈ 1.1M float adds per regrow, only while the timeline moves.
