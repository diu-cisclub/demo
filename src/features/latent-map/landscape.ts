/**
 * Feature C, client half: the 3D "latent landscape" of events.
 * Terrain = density of similar events; pins = events; the timeline grows the
 * landscape from the club's first meeting to today. Loaded on demand by
 * LatentMap.astro; if WebGL is missing, the static SVG map stays instead.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  EdgesGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createHeightField, growthAt, MAX_HEIGHT, SEGMENTS, WORLD, type Peak } from './terrain';
import { createTopoMaterial } from './topo-material';

export interface MapEvent {
  title: string;
  url: string;
  t: number;
  dateLabel: string;
  category: string;
  cat: string;
  x: number;
  y: number;
  weight: number;
  thumb?: string | undefined;
  upcoming: boolean;
}
export interface MapData {
  events: MapEvent[];
  clusters: { x: number; y: number; label: string }[];
  start: number;
  end: number;
}

const PLAY_MS = 9000;
const PIN_MS = 10 * 24 * 3600 * 1000;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const toWorld = (v: number) => (v * 0.84 + 0.08 - 0.5) * WORLD;
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' });

export function mountLandscape(root: HTMLElement, data: MapData): boolean {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-map-canvas]')!;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return false; // no WebGL: keep the SVG fallback
  }
  root.dataset.webgl = '';
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // ── Colours from the design tokens ────────────────────────────────────────
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const catColor = (cat: string) => new Color(token(`--cat-${cat}`) || token('--ink'));

  // ── Scene, camera, controls ──────────────────────────────────────────────
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 200);
  camera.position.set(-21, 23, 30);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.6, 0);
  Object.assign(controls, {
    enableDamping: true,
    enablePan: false,
    minDistance: 16,
    maxDistance: 55,
    minPolarAngle: 0.35,
    maxPolarAngle: 1.25,
    autoRotate: !reducedMotion,
    autoRotateSpeed: 0.35,
  });

  // ── Terrain ──────────────────────────────────────────────────────────────
  const peaks: Peak[] = data.events.map((e) => ({ x: toWorld(e.x), z: toWorld(e.y), weight: e.weight, t: e.t }));
  const plane = new PlaneGeometry(WORLD, WORLD, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2);
  const pos = plane.attributes.position as BufferAttribute;
  const xz = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) (xz[i * 2] = pos.getX(i)), (xz[i * 2 + 1] = pos.getZ(i));
  const field = createHeightField(peaks, xz);
  const heights = new Float32Array(pos.count);
  const material = createTopoMaterial({ paper: token('--paper-raised'), sunk: token('--paper-sunk'), ink: token('--ink'), signal: token('--signal') }, MAX_HEIGHT);
  scene.add(new Mesh(plane, material));

  // The model's base: a slab with crisp ink edges, like an architect's model.
  const slab = new BoxGeometry(WORLD, 0.9, WORLD).translate(0, -0.46, 0);
  scene.add(new Mesh(slab, new MeshBasicMaterial({ color: new Color(token('--paper-sunk')) })));
  scene.add(new LineSegments(new EdgesGeometry(slab), new LineBasicMaterial({ color: new Color(token('--ink')), transparent: true, opacity: 0.55 })));

  // ── Pins: stem + head + soft shadow on the ground ────────────────────────
  const n = data.events.length;
  const heads = new InstancedMesh(new SphereGeometry(0.22, 18, 12), new MeshBasicMaterial(), n);
  const shadows = new InstancedMesh(new CircleGeometry(0.34, 20).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color(token('--ink')), transparent: true, opacity: 0.16, depthWrite: false }), n);
  const stemGeo = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(n * 6), 3));
  const stems = new LineSegments(stemGeo, new LineBasicMaterial({ color: new Color(token('--ink')), transparent: true, opacity: 0.6 }));
  data.events.forEach((e, i) => heads.setColorAt(i, e.upcoming ? new Color(token('--signal')) : catColor(e.cat)));
  scene.add(stems, shadows, heads);

  // ── State ────────────────────────────────────────────────────────────────
  const slider = root.querySelector<HTMLInputElement>('[data-map-time]')!;
  const readout = root.querySelector<HTMLElement>('[data-map-date]')!;
  const counter = root.querySelector<HTMLElement>('[data-map-count]')!;
  const playBtn = root.querySelector<HTMLButtonElement>('[data-map-play]')!;
  const card = root.querySelector<HTMLElement>('[data-map-card]')!;
  const latest = root.querySelector<HTMLElement>('[data-map-latest]')!;
  slider.min = String(data.start);
  slider.max = String(data.end);
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((tick) => {
    tick.style.left = `${((Number(tick.dataset.t) - data.start) / (data.end - data.start)) * 100}%`;
  });

  let now = reducedMotion ? data.end : data.start;
  let growth = growthAt(peaks, now);
  let dirty = true; // terrain needs regrowing
  let playing: { from: number; started: number } | null = null;
  let hovered = -1;
  let hoverGlow = 0;
  const scratch = new Object3D();
  const scratchMatrix = new Matrix4();
  const tmp = new Vector3();

  const labels = data.clusters.map((c) => {
    const el = document.createElement('span');
    el.className = 'hill-label';
    el.textContent = c.label;
    root.querySelector('[data-map-labels]')!.append(el);
    return { el, x: toWorld(c.x), z: toWorld(c.y) };
  });

  function regrow() {
    growth = growthAt(peaks, now);
    field.fill(growth, heights);
    for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]!);
    pos.needsUpdate = true;
    plane.computeVertexNormals();
    const stemArr = stemGeo.attributes.position!.array as Float32Array;
    peaks.forEach((p, i) => {
      // Pins pop up over the 10 days before their date, so every event is
      // standing by the end of the timeline; hills keep growing for weeks after.
      const g = Math.min(1, Math.max(0, (now - p.t) / PIN_MS + 1));
      const ground = field.at(p.x, p.z, growth);
      const top = ground + 1.1 + 0.35 * Math.sqrt(p.weight);
      stemArr.set([p.x, ground, p.z, p.x, g > 0 ? ground + (top - ground) * g : ground, p.z], i * 6);
      scratch.position.set(p.x, top, p.z);
      scratch.scale.setScalar(g > 0 ? g * (i === hovered ? 1.6 : 1) : 0);
      scratch.updateMatrix();
      heads.setMatrixAt(i, scratch.matrix);
      scratch.position.set(p.x, ground + 0.03, p.z);
      scratch.scale.setScalar(g);
      scratch.updateMatrix();
      shadows.setMatrixAt(i, scratch.matrix);
    });
    stemGeo.attributes.position!.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = shadows.instanceMatrix.needsUpdate = true;
    const shown = peaks.filter((p) => now >= p.t - PIN_MS).length;
    counter.textContent = `${shown} event${shown === 1 ? '' : 's'}`;
    readout.textContent = monthYear.format(now);
    // Narrate the timeline: the most recent event reached so far.
    const last = data.events.filter((e) => e.t <= now).at(-1);
    latest.textContent = last ? `Latest: ${last.title}` : '';
    slider.value = String(now);
    dirty = false;
  }

  // ── Timeline ─────────────────────────────────────────────────────────────
  const setPlaying = (on: boolean) => {
    playing = on ? { from: now >= data.end ? data.start : now, started: performance.now() } : null;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.querySelector('span')!.textContent = on ? 'Pause' : 'Play history';
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  slider.addEventListener('input', () => {
    setPlaying(false);
    now = Number(slider.value);
    dirty = true;
  });

  // ── Hover / tap ──────────────────────────────────────────────────────────
  const ray = new Raycaster();
  const pointer = new Vector2();
  let downAt: { x: number; y: number } | null = null;
  const pick = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObject(heads)[0]?.instanceId ?? -1;
  };
  function setHover(i: number) {
    if (i === hovered) return;
    hovered = i;
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
    card.hidden = i < 0;
    if (i >= 0) {
      const e = data.events[i]!;
      card.querySelector('[data-card-title]')!.textContent = e.title;
      card.querySelector('[data-card-meta]')!.textContent = `${e.dateLabel}, ${e.upcoming ? 'upcoming' : e.category}`;
      const img = card.querySelector<HTMLImageElement>('[data-card-img]')!;
      img.hidden = !e.thumb;
      if (e.thumb) img.src = e.thumb;
      material.uniforms.uHover!.value.set(peaks[i]!.x, peaks[i]!.z, hoverGlow);
    }
    dirty = true;
  }
  canvas.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && setHover(pick(e)));
  canvas.addEventListener('pointerleave', () => setHover(-1));
  canvas.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99;
    downAt = null;
    if (moved > 6) return; // that was a drag to orbit
    const i = pick(e);
    // Mouse: click opens. Touch: first tap previews, second tap opens.
    if (i >= 0 && (e.pointerType === 'mouse' || i === hovered)) location.assign(data.events[i]!.url);
    else setHover(i);
  });
  controls.addEventListener('start', () => (controls.autoRotate = false));

  // ── Frame loop (only while visible) ──────────────────────────────────────
  let visible = false;
  let frame = 0;
  const baseDistance = camera.position.distanceTo(controls.target);
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    // Portrait screens: move the camera back until the whole model fits.
    const fit = Math.max(1, 1.2 / camera.aspect);
    controls.maxDistance = 55 * fit;
    camera.position.sub(controls.target).setLength(baseDistance * fit).add(controls.target);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  function tick() {
    frame = 0;
    if (!visible || document.hidden) return;
    if (playing) {
      const p = Math.min(1, (performance.now() - playing.started) / PLAY_MS);
      now = playing.from + (data.end - playing.from) * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
      dirty = true;
      if (p >= 1) setPlaying(false);
    }
    const targetGlow = hovered >= 0 ? 1 : 0;
    if (Math.abs(hoverGlow - targetGlow) > 0.01) {
      hoverGlow += (targetGlow - hoverGlow) * 0.15;
      (material.uniforms.uHover!.value as Vector3).z = hoverGlow;
    }
    if (dirty) regrow();
    controls.update();
    // Hill labels and the hover card follow their 3D anchors.
    for (const l of labels) {
      const h = field.at(l.x, l.z, growth);
      tmp.set(l.x, h + 1.9, l.z).project(camera);
      l.el.style.transform = `translate(${((tmp.x + 1) / 2) * canvas.clientWidth}px, ${((1 - tmp.y) / 2) * canvas.clientHeight}px) translate(-50%, -100%)`;
      l.el.style.opacity = String(Math.min(1, Math.max(0, (h - 0.8) / 0.8)));
    }
    if (hovered >= 0) {
      heads.getMatrixAt(hovered, scratchMatrix);
      tmp.setFromMatrixPosition(scratchMatrix).project(camera);
      const x = ((tmp.x + 1) / 2) * canvas.clientWidth;
      const y = ((1 - tmp.y) / 2) * canvas.clientHeight;
      const left = Math.min(canvas.clientWidth - card.offsetWidth - 8, Math.max(8, x + 18));
      card.style.transform = `translate(${left}px, ${Math.max(8, y - card.offsetHeight / 2)}px)`;
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    // First time on screen: play the club's history once.
    if (visible && !reducedMotion && !root.dataset.played) {
      root.dataset.played = '';
      setPlaying(true);
    }
    wake();
  }).observe(root);
  document.addEventListener('visibilitychange', wake);
  return true;
}

// perf: medium. ~6 draw calls (terrain, slab, edges, stems, shadows, heads); ~20k-vertex terrain regrown only while the timeline moves.
