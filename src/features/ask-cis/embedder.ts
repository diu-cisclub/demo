/**
 * Sentence embeddings in the browser (Transformers.js + all-MiniLM-L6-v2,
 * ~23 MB, cached by the browser after the first download).
 * The library is imported only when the visitor asks for it.
 */
type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

const MODEL = 'Xenova/all-MiniLM-L6-v2';
let extractor: Extractor | null = null;
let loading: Promise<Extractor> | null = null;

export const isEmbedderReady = (): boolean => extractor !== null;

export function loadEmbedder(base: string, onProgress?: (fraction: number) => void): Promise<Extractor> {
  loading ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    // Serve the ONNX runtime from this site instead of a CDN (see scripts/copy-vendor.mjs).
    const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } };
    if (onnx.wasm) {
      onnx.wasm.wasmPaths = { mjs: `${base}vendor/ort/ort-wasm-simd-threaded.mjs`, wasm: `${base}vendor/ort/ort-wasm-simd-threaded.wasm` };
    }
    const files = new Map<string, { loaded: number; total: number }>();
    const pipe = await pipeline('feature-extraction', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        const all = [...files.values()];
        const total = all.reduce((n, f) => n + f.total, 0);
        if (total) onProgress?.(all.reduce((n, f) => n + f.loaded, 0) / total);
      },
    });
    extractor = pipe as unknown as Extractor;
    return extractor;
  })();
  return loading;
}

/** Unit-length vectors, one per text. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!extractor) throw new Error('Embedder not loaded');
  const out: number[][] = [];
  // Small batches keep the page responsive on slow phones.
  for (let i = 0; i < texts.length; i += 16) {
    out.push(...(await extractor(texts.slice(i, i + 16), { pooling: 'mean', normalize: true })).tolist());
    await new Promise((r) => setTimeout(r));
  }
  return out;
}
