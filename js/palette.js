/**
 * palette.js — shared constants and the colour ramp.
 * Ramp: crimson → hot pink-red → soft pink → white-pink highlight.
 */
import * as THREE from 'three';

// Use the hex values exactly as written (no sRGB→linear conversion),
// so the colours on screen match the values below.
THREE.ColorManagement.enabled = false;

export const COUNT = 16000;

const STOPS = [
  { t: 0.0, c: new THREE.Color('#b0003a') }, // deep crimson (outer edge)
  { t: 0.4, c: new THREE.Color('#ff1f6b') }, // hot pink-red (main body)
  { t: 0.75, c: new THREE.Color('#ff7fb0') }, // soft pink (inner glow)
  { t: 1.0, c: new THREE.Color('#ffe6f0') }, // white-pink highlight
];

const tmp = new THREE.Color();

/**
 * Writes the ramp colour for t (0..1) into out[i*3 .. i*3+2].
 */
export function paletteInto(t, out, i) {
  const u = Math.min(1, Math.max(0, t));
  for (let s = 0; s < STOPS.length - 1; s++) {
    const a = STOPS[s];
    const b = STOPS[s + 1];
    if (u <= b.t) {
      const k = (u - a.t) / (b.t - a.t);
      tmp.copy(a.c).lerp(b.c, k);
      break;
    }
  }
  out[i * 3] = tmp.r;
  out[i * 3 + 1] = tmp.g;
  out[i * 3 + 2] = tmp.b;
}