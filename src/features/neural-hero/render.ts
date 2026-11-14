/**
 * Draws the network diagram: the 8×8 input grid, two hidden layers and the
 * ten output digits with probability bars. Nodes fill with crimson as they
 * activate; only the strongest connections (|weight × activation|) are drawn
 * so the picture stays readable and fast.
 */
import type { Activations, Weights } from './model';

interface Palette {
  ink: string;
  soft: string;
  faint: string;
  rule: string;
  signal: string;
  paper: string;
}

/** How many edges to draw per layer gap (input→h1, h1→h2, h2→out). */
const EDGE_BUDGET = [110, 70, 50];

export function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { ink: v('--ink'), soft: v('--ink-soft'), faint: v('--ink-faint'), rule: v('--rule'), signal: v('--signal'), paper: v('--paper-raised') };
}

interface Geometry {
  /** Node centres per layer (layer 0 = input grid cells). */
  nodes: { x: number; y: number }[][];
  cell: number;
  radius: number;
  barX: number;
  barW: number;
}

function layout(width: number, height: number, sizes: number[]): Geometry {
  const pad = 14;
  const grid = Math.min(height - pad * 2, width * 0.3);
  const cell = grid / 8;
  const gridTop = (height - grid) / 2;
  const barW = Math.max(40, width * 0.17);
  const outX = width - barW - 34;
  const cols = [pad + grid, pad + grid + (outX - pad - grid) * 0.4, pad + grid + (outX - pad - grid) * 0.75, outX];
  const radius = Math.max(3.5, Math.min(7, (height - pad * 2) / (sizes[1]! * 2.6)));

  const nodes = sizes.map((n, l) => {
    if (l === 0) {
      return Array.from({ length: n }, (_, i) => ({ x: pad + (i % 8) * cell + cell / 2, y: gridTop + Math.floor(i / 8) * cell + cell / 2 }));
    }
    const span = height - pad * 2 - radius * 2;
    return Array.from({ length: n }, (_, i) => ({ x: cols[l]!, y: pad + radius + (n === 1 ? span / 2 : (span * i) / (n - 1)) }));
  });
  return { nodes, cell, radius, barX: outX + radius + 20, barW };
}

export function drawNetwork(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  weights: Weights,
  acts: Activations,
  palette: Palette,
): void {
  const sizes = acts.map((a) => a.length);
  const g = layout(width, height, sizes);
  ctx.clearRect(0, 0, width, height);

  // Normalise hidden activations per layer so colour shows relative firing.
  const norm = acts.map((a) => {
    const max = Math.max(...a, 1e-6);
    return a.map((v) => Math.min(1, v / max));
  });

  // Edges: rank every connection by its contribution and draw the top few.
  weights.layers.forEach((layer, l) => {
    const from = g.nodes[l]!;
    const to = g.nodes[l + 1]!;
    const input = acts[l]!;
    const scored: { i: number; o: number; s: number }[] = [];
    layer.W.forEach((row, o) => row.forEach((w, i) => scored.push({ i, o, s: Math.abs(w * input[i]!) })));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, EDGE_BUDGET[l]);
    const max = top[0]?.s || 1;
    for (const { i, o, s } of top) {
      if (s <= 0) break;
      const strength = s / max;
      ctx.strokeStyle = strength > 0.55 ? palette.signal : palette.ink;
      ctx.globalAlpha = 0.08 + strength * 0.55;
      ctx.lineWidth = 0.6 + strength * 1.4;
      ctx.beginPath();
      ctx.moveTo(from[i]!.x, from[i]!.y);
      ctx.lineTo(to[o]!.x, to[o]!.y);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;

  // Input grid: what the network actually "sees".
  g.nodes[0]!.forEach(({ x, y }, i) => {
    const v = acts[0]![i]!;
    ctx.fillStyle = palette.paper;
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 1;
    ctx.fillRect(x - g.cell / 2, y - g.cell / 2, g.cell, g.cell);
    ctx.strokeRect(x - g.cell / 2 + 0.5, y - g.cell / 2 + 0.5, g.cell - 1, g.cell - 1);
    if (v > 0) {
      ctx.globalAlpha = v;
      ctx.fillStyle = palette.ink;
      ctx.fillRect(x - g.cell / 2 + 1, y - g.cell / 2 + 1, g.cell - 2, g.cell - 2);
      ctx.globalAlpha = 1;
    }
  });

  // Hidden + output nodes.
  const out = acts.at(-1)!;
  const best = out.indexOf(Math.max(...out));
  const anyInput = acts[0]!.some((v) => v > 0);
  for (let l = 1; l < g.nodes.length; l++) {
    g.nodes[l]!.forEach(({ x, y }, i) => {
      const v = anyInput ? norm[l]![i]! : 0;
      ctx.beginPath();
      ctx.arc(x, y, g.radius, 0, Math.PI * 2);
      ctx.fillStyle = palette.paper;
      ctx.fill();
      if (v > 0.02) {
        ctx.globalAlpha = 0.15 + v * 0.85;
        ctx.fillStyle = palette.signal;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = v > 0.5 ? palette.signal : palette.faint;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  }

  // Output labels and probability bars.
  const font = getComputedStyle(ctx.canvas).fontFamily;
  ctx.textBaseline = 'middle';
  g.nodes.at(-1)!.forEach(({ x, y }, d) => {
    const p = anyInput ? out[d]! : 0;
    const win = anyInput && d === best;
    ctx.font = `${win ? 700 : 500} 12px ${font}`;
    ctx.fillStyle = win ? palette.signal : palette.soft;
    ctx.textAlign = 'left';
    ctx.fillText(String(d), x + g.radius + 5, y);
    ctx.fillStyle = palette.rule;
    ctx.fillRect(g.barX, y - 2, g.barW, 4);
    ctx.fillStyle = win ? palette.signal : palette.faint;
    ctx.fillRect(g.barX, y - 2, Math.max(0, g.barW * p), 4);
  });
}
