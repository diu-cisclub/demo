/**
 * Client controller for the hero: captures drawing, runs the network and
 * animates activations flowing layer by layer. Makes no network requests:
 * the weights are bundled with this script.
 */
import weightsJson from './weights.json';
import { forward, predict, type Activations, type Weights } from './model';
import { strokesToInput, type Point, type Stroke } from './raster';
import { drawNetwork, readPalette } from './render';
import { SAMPLE_DIGITS } from './samples';

const weights = weightsJson as Weights;
const LAYER_DELAY = 90; // ms between layers lighting up
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountNeuralHero(root: HTMLElement): void {
  const pad = root.querySelector<HTMLCanvasElement>('[data-pad]')!;
  const net = root.querySelector<HTMLCanvasElement>('[data-net]')!;
  const readout = root.querySelector<HTMLElement>('[data-readout]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const padCtx = pad.getContext('2d')!;
  const netCtx = net.getContext('2d')!;
  let palette = readPalette(root);

  let strokes: Point[][] = [];
  let target: Activations = forward(weights, strokesToInput([]));
  let shown: Activations = target.map((l) => [...l]);
  let changedAt = 0;
  let frame = 0;
  let demo: { stop: () => void } | null = null;
  /** Once the visitor draws or picks a sample, the demo never restarts. */
  let touched = false;

  // ── Canvas sizing (crisp on high-DPI screens) ───────────────────────────
  const fit = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  };
  let padSize = fit(pad, padCtx);
  let netSize = fit(net, netCtx);
  new ResizeObserver(() => {
    padSize = fit(pad, padCtx);
    netSize = fit(net, netCtx);
    palette = readPalette(root);
    paintPad();
    paintNet();
  }).observe(root);

  // ── Painting ────────────────────────────────────────────────────────────
  function paintPad() {
    const { width, height } = padSize;
    padCtx.clearRect(0, 0, width, height);
    padCtx.strokeStyle = palette.ink;
    padCtx.lineWidth = Math.max(10, width * 0.075);
    padCtx.lineCap = padCtx.lineJoin = 'round';
    for (const s of strokes) {
      padCtx.beginPath();
      s.forEach(([x, y], i) => (i ? padCtx.lineTo(x * width, y * height) : padCtx.moveTo(x * width, y * height)));
      if (s.length === 1) padCtx.lineTo(s[0]![0] * width + 0.1, s[0]![1] * height);
      padCtx.stroke();
    }
  }
  const paintNet = () => drawNetwork(netCtx, netSize.width, netSize.height, weights, shown, palette);

  // Ease displayed activations toward the target, one layer after another.
  function tick(now: number) {
    let moving = false;
    shown = shown.map((layer, l) => {
      if (reducedMotion) return [...target[l]!];
      if (now - changedAt < l * LAYER_DELAY) return (moving = true), layer;
      return layer.map((v, i) => {
        const t = target[l]![i]!;
        if (Math.abs(t - v) > 0.002) moving = true;
        return v + (t - v) * 0.28;
      });
    });
    paintNet();
    frame = moving ? requestAnimationFrame(tick) : 0;
  }

  function update() {
    target = forward(weights, strokesToInput(strokes));
    changedAt = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
    const hasInk = strokes.length > 0;
    const { digit, confidence } = predict(target.at(-1)!);
    readout.textContent = hasInk ? String(digit) : '–';
    status.textContent = hasInk ? `Reads as ${digit}, ${Math.round(confidence * 100)}% sure` : 'Waiting for a digit';
    root.toggleAttribute('data-has-ink', hasInk);
  }

  function setStrokes(next: Point[][]) {
    strokes = next;
    paintPad();
    update();
  }

  // ── Drawing input (mouse, pen, touch) ──────────────────────────────────
  const toPoint = (e: PointerEvent): Point => {
    const r = pad.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  let drawing = false;
  let pending = false;
  pad.addEventListener('pointerdown', (e) => {
    takeOver();
    drawing = true;
    pad.setPointerCapture(e.pointerId);
    strokes = [...strokes, [toPoint(e)]];
    paintPad();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    strokes.at(-1)!.push(toPoint(e));
    // Coalesce to one network update per frame.
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        paintPad();
        update();
      });
    }
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    update();
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    takeOver();
    setStrokes([]);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((btn) =>
    btn.addEventListener('click', () => {
      takeOver();
      setStrokes(SAMPLE_DIGITS[Number(btn.dataset.sample)]!.map((s) => [...s]));
    }),
  );

  // ── Idle demo: draws sample digits until the visitor takes over ─────────
  function takeOver() {
    touched = true;
    stopDemo();
  }
  function stopDemo() {
    demo?.stop();
    demo = null;
  }
  function startDemo() {
    const order = [3, 7, 2, 5, 9, 4, 8, 0, 6, 1];
    let alive = true;
    let timer = 0;
    let k = 0;
    const play = () => {
      if (!alive) return;
      const sample: Stroke[] = SAMPLE_DIGITS[order[k++ % order.length]!]!;
      const total = sample.reduce((n, s) => n + s.length, 0);
      const started = performance.now();
      const step = () => {
        if (!alive) return;
        // Reveal points progressively, densifying long segments.
        let budget = ((performance.now() - started) / 1100) * total;
        const partial = sample.map((s) => {
          const take = Math.max(0, Math.min(s.length, Math.ceil(budget)));
          budget -= s.length;
          return s.slice(0, take).map((p) => [...p] as unknown as Point);
        });
        setStrokes(partial.filter((s) => s.length));
        if (budget < 0) timer = requestAnimationFrame(step) as unknown as number;
        else timer = window.setTimeout(() => (setStrokes([]), (timer = window.setTimeout(play, 500))), 1900);
      };
      step();
    };
    play();
    return {
      stop() {
        alive = false;
        cancelAnimationFrame(timer);
        clearTimeout(timer);
      },
    };
  }

  paintPad();
  update();
  if (reducedMotion) {
    // No motion: show one finished example instead of animating.
    setStrokes(SAMPLE_DIGITS[7]!.map((s) => [...s]));
  } else {
    // Only animate while the hero is on screen.
    new IntersectionObserver(([entry]) => {
      if (touched) return;
      if (entry?.isIntersecting && !demo) demo = startDemo();
      else if (!entry?.isIntersecting && demo) {
        stopDemo();
        setStrokes([]);
      }
    }).observe(root);
  }
}
