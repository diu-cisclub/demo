/**
 * "Wake the AI": a small instruction-tuned model (Qwen2.5 0.5B) running on
 * the visitor's GPU through WebLLM. It answers only from the passages that
 * retrieval found, and cites them. Needs WebGPU; downloads ~300 MB once.
 */
import type { MLCEngineInterface } from '@mlc-ai/web-llm';
import type { Hit } from './retrieval';

let engine: Promise<MLCEngineInterface> | null = null;

export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function pickModel(): Promise<string> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter();
  // f16 shaders are faster and smaller; fall back to f32 on GPUs without them.
  return adapter?.features.has('shader-f16') ? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' : 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';
}

export function loadLLM(onProgress: (fraction: number, text: string) => void): Promise<MLCEngineInterface> {
  engine ??= (async () => {
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
    return CreateWebWorkerMLCEngine(worker, await pickModel(), {
      initProgressCallback: (p) => onProgress(p.progress, p.text),
    });
  })();
  engine.catch(() => (engine = null));
  return engine;
}

const SYSTEM = `You are Ask CIS, the assistant on the DIU CIS Club website.
Answer ONLY using the numbered sources. If they don't contain the answer, say you don't know and suggest the Contact page.
Be brief (at most 4 sentences). Cite sources like [1] or [2]. Never invent dates, names, prices or phone numbers.`;

/** Streams an answer grounded in `hits`. */
export async function* answer(question: string, hits: Hit[]): AsyncGenerator<string> {
  const llm = await engine!;
  const sources = hits.map((h, i) => `[${i + 1}] ${h.doc.title}: ${h.doc.text.slice(0, 900)}`).join('\n\n');
  const stream = await llm.chat.completions.create({
    stream: true,
    temperature: 0.2,
    max_tokens: 220,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Sources:\n${sources}\n\nQuestion: ${question}` },
    ],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
