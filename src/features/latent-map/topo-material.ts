/**
 * "Paper topographic model" material: cream paper shaded by the slope, ink
 * contour lines (every fifth one heavier), a faint graph-paper grid on the
 * flat ground, and crimson contours glowing around the hovered event.
 * Colours are passed in as sRGB and written out unchanged, so they match the
 * CSS tokens exactly.
 */
import { Color, ShaderMaterial, Vector3 } from 'three';

export interface TopoColors {
  paper: string;
  sunk: string;
  ink: string;
  signal: string;
}

export function createTopoMaterial(colors: TopoColors, maxHeight: number) {
  const srgb = (hex: string) => new Color().setStyle(hex, 'srgb-linear'); // keep raw sRGB values
  return new ShaderMaterial({
    uniforms: {
      uPaper: { value: srgb(colors.paper) },
      uSunk: { value: srgb(colors.sunk) },
      uInk: { value: srgb(colors.ink) },
      uSignal: { value: srgb(colors.signal) },
      uLight: { value: new Vector3(-0.5, 0.9, 0.35).normalize() },
      uMaxHeight: { value: maxHeight },
      uSpacing: { value: maxHeight / 18 },
      /** xz of the hovered event, and strength 0…1 in z. */
      uHover: { value: new Vector3(0, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec2 vXZ;
      void main() {
        vH = position.y;
        vN = normal;
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPaper, uSunk, uInk, uSignal, uLight, uHover;
      uniform float uMaxHeight, uSpacing;
      varying float vH;
      varying vec3 vN;
      varying vec2 vXZ;

      // Anti-aliased line where value v crosses whole numbers.
      float isoLine(float v, float width) {
        float d = abs(fract(v - 0.5) - 0.5) / fwidth(v);
        return 1.0 - min(d / width, 1.0);
      }

      void main() {
        float shade = 0.8 + 0.2 * clamp(dot(normalize(vN), uLight), 0.0, 1.0);
        vec3 col = mix(uPaper, uSunk, smoothstep(0.0, uMaxHeight, vH) * 0.7) * shade;

        float raised = smoothstep(0.03, 0.18, vH);
        float minor = isoLine(vH / uSpacing, 1.0) * 0.32;
        float major = isoLine(vH / (uSpacing * 5.0), 1.6) * 0.75;
        vec2 g = vXZ / 1.1;
        float grid = max(isoLine(g.x, 1.0), isoLine(g.y, 1.0)) * 0.16 * (1.0 - raised);
        float ink = max(max(minor, major) * raised, grid);

        float near = uHover.z * (1.0 - smoothstep(0.0, 2.4, distance(vXZ, uHover.xy)));
        col = mix(col, mix(uInk, uSignal, near), ink);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// perf: cheap. One draw call; per-fragment cost is a few fract/fwidth ops.
