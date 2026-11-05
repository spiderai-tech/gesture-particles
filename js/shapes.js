/**
 * shapes.js — the formations.
 *  Galaxy  : a five-petal flower layered with smaller petal rings, filling the screen.
 *  PLANET : a lit, glowing particle globe with three tilted rings (closed fist).
 *  HEART  : a red-pink heart outline with an empty centre and white highlights
 *           at the bottom tip and the top dip.
 *  ROSE   : a red rose with spiralling petals, sepals, a stem and two leaves (thumbs up).
 * Each builder returns {positions, colors, sizes} with exactly COUNT entries.
 */
import * as THREE from 'three';
import { COUNT } from './palette.js';

// Half-size of the visible area at the default camera distance (z = 14).
const HALF_W = 13.5;
const HALF_H = 8.0;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/*
 * Galaxy (open palm): a wide, folded particle sheet swirling into a dark centre.
 * The sheet is sampled over a twisted, rippling surface so the particles form
 * dense wavy bands. Outer bands glow blue, inner bands violet, and the fold
 * crests burn bright magenta with hot white-pink highlights.
 */
const Galaxy_BLUE = new THREE.Color('#2a2dff');
const Galaxy_VIOLET = new THREE.Color('#7b2cff');
const Galaxy_MAGENTA = new THREE.Color('#e83cff');
const Galaxy_HOT = new THREE.Color('#ffc4ff');
const Galaxy_TWIST = 8.0; // how strongly the sheet winds toward the centre
const Galaxy_ARMS = 2; // number of curling arms
const Galaxy_FOLDS = 4; // number of folds (ripple crests) along each arm
const Galaxy_WAVES = 2; // extra ripple layers for a richer, rolling surface
const Galaxy_HOLE = 0.1; // radius of the dark centre (fraction of the screen)

const gaussian = () => {
  const u = Math.max(Math.random(), 1e-6);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

export function buildGalaxy() {
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const c = new THREE.Color();

  for (let i = 0; i < COUNT; i++) {
    // t: 0 at the dark centre, 1 at the outer edge of the sheet.
    const t = Math.pow(Math.random(), 0.85);
    const R = Galaxy_HOLE + t * (1.05 - Galaxy_HOLE);

    // Particles gather into curling arms; a few stray across the gaps between them.
    let a;
    if (Math.random() < 0.88) {
      const arm = Math.floor(Math.random() * Galaxy_ARMS);
      a = (arm / Galaxy_ARMS) * Math.PI * 2 + gaussian() * 0.26;
    } else {
      a = Math.random() * Math.PI * 2;
    }

    // Swirl: each arm winds tighter as it nears the centre.
    const swirl = a + Galaxy_TWIST * Math.pow(1 - t, 1.4);
    // Folds: a ripple that runs along the sheet and lifts it in depth.
    const fold = Math.sin(Galaxy_FOLDS * swirl + 6 * t);
    // Secondary ripples at other frequencies make the surface roll rather than repeat.
    const roll = Galaxy_WAVES > 0
      ? 0.5 * Math.sin(Galaxy_FOLDS * 1.5 * swirl - 5 * t) + 0.3 * Math.sin(Galaxy_FOLDS * 0.5 * swirl + 9 * t)
      : 0;
    const r = R + (fold * 0.05 + roll * 0.035) * (0.4 + t);

    const x = Math.cos(swirl) * r * HALF_W;
    const y = Math.sin(swirl) * r * HALF_H * 0.85;
    const z = (fold * 1.6 + roll * 1.1) * (1 - 0.5 * t) + Math.sin(2 * swirl - 4 * t) * 0.5;

    // Bright crests where the folds peak, strongest toward the centre.
    const crest = Math.pow(Math.max(0, fold), 6) * (0.5 + 0.5 * (1 - t));

    // Blue at the outer edge, violet through the middle, magenta on the crests.
    c.copy(Galaxy_BLUE).lerp(Galaxy_VIOLET, Math.min(1, (1 - t) * 1.3));
    c.lerp(Galaxy_MAGENTA, Math.min(1, crest * 0.9 + (1 - t) * 0.25));
    if (Math.random() < crest * 0.2) c.copy(Galaxy_HOT);

    const bright = (0.55 + 0.45 * (1 - t) + crest * 1.1) * (0.85 + Math.random() * 0.3);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = c.r * bright;
    colors[i * 3 + 1] = c.g * bright;
    colors[i * 3 + 2] = c.b * bright;
    sizes[i] = 0.9 + Math.random() * 0.7 + crest * 0.8;
  }

  return { positions, colors, sizes };
}

/* ---------- Planet: glowing globe with rings ---------- */

const PLANET_SCALE = 0.8; // overall size of the globe and rings
const GLOBE_RADIUS = 4.0;
const GLOBE_FRACTION = 0.6; // share of particles on the globe
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LIGHT_DIR = new THREE.Vector3(-0.45, 0.6, 0.66).normalize();

const GLOBE_CYAN = new THREE.Color('#38d9d0');
const GLOBE_MAGENTA = new THREE.Color('#ff7a59');
const GLOBE_VIOLET = new THREE.Color('#7b5cff');
const GLOBE_PINK = new THREE.Color('#ffe3a3'); // soft light-pink glow on the rim

// Ring definitions: radius, width, colour, tilt (radians) around X and Z.
const RINGS = [
  { radius: 6.4, width: 0.42, color: new THREE.Color('#ffb36b'), tiltX: 1.25, tiltZ: 0.35 },
  { radius: 7.5, width: 0.5, color: new THREE.Color('#ffe08a'), tiltX: 1.22, tiltZ: 0.35 },
  { radius: 8.7, width: 0.38, color: new THREE.Color('#ff8fb1'), tiltX: 1.18, tiltZ: 0.35 },
];

const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

export function buildPlanet() {
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);

  const globeCount = Math.floor(COUNT * GLOBE_FRACTION);
  const ringCount = COUNT - globeCount;

  // ---- Globe: Fibonacci lattice, lit from one side, magenta at the rim ----
  for (let i = 0; i < globeCount; i++) {
    const y = 1 - (i / (globeCount - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;

    const r = GLOBE_RADIUS * (1 - Math.random() * 0.03);
    const nx = Math.cos(theta) * ring;
    const ny = y;
    const nz = Math.sin(theta) * ring;
    setVec(positions, i, nx * r, ny * r, nz * r);

    const diffuse = Math.max(0, nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + nz * LIGHT_DIR.z);
    const rim = Math.pow(1 - Math.abs(nz), 2.2);

    tmpColor.copy(GLOBE_VIOLET).lerp(GLOBE_CYAN, Math.min(1, diffuse * 0.9));
    tmpColor.lerp(GLOBE_MAGENTA, Math.min(1, 0.35 + rim * 0.5));
    tmpColor.lerp(GLOBE_PINK, Math.min(1, Math.pow(rim, 3) * 0.9));
    tmpColor.multiplyScalar(0.55 + diffuse * 0.7 + Math.random() * 0.12);
    setColor(colors, i, tmpColor);

    sizes[i] = 1.0 + Math.random() * 1.0;
  }

  // ---- Rings: three tilted elliptical bands ----
  const perRing = Math.floor(ringCount / RINGS.length);
  let idx = globeCount;
  for (let r = 0; r < RINGS.length; r++) {
    const ring = RINGS[r];
    const n = r === RINGS.length - 1 ? COUNT - idx : perRing;

    for (let k = 0; k < n; k++, idx++) {
      const angle = Math.random() * Math.PI * 2;
      const radial = ring.radius + (Math.random() - 0.5) * ring.width * 2;
      const thick = (Math.random() - 0.5) * 0.3;

      tmpVec.set(Math.cos(angle) * radial, thick, Math.sin(angle) * radial);
      applyTilt(tmpVec, ring.tiltX, ring.tiltZ);
      setVec(positions, idx, tmpVec.x, tmpVec.y, tmpVec.z);

      tmpColor.copy(ring.color).multiplyScalar(0.7 + Math.random() * 0.5);
      setColor(colors, idx, tmpColor);

      sizes[idx] = 1.0 + Math.random() * 1.0;
    }
  }

  // Apply the overall scale.
  for (let i = 0; i < positions.length; i++) positions[i] *= PLANET_SCALE;

  return { positions, colors, sizes };
}

/** Rotates a vector by tiltX (around X), then tiltZ (around Z). */
function applyTilt(v, tiltX, tiltZ) {
  const cx = Math.cos(tiltX);
  const sx = Math.sin(tiltX);
  const y1 = v.y * cx - v.z * sx;
  const z1 = v.y * sx + v.z * cx;
  v.y = y1;
  v.z = z1;

  const cz = Math.cos(tiltZ);
  const sz = Math.sin(tiltZ);
  const x2 = v.x * cz - v.y * sz;
  const y2 = v.x * sz + v.y * cz;
  v.x = x2;
  v.y = y2;
}

function setVec(arr, i, x, y, z) {
  arr[i * 3] = x;
  arr[i * 3 + 1] = y;
  arr[i * 3 + 2] = z;
}

function setColor(arr, i, c) {
  arr[i * 3] = c.r;
  arr[i * 3 + 1] = c.g;
  arr[i * 3 + 2] = c.b;
}

/* ---------- Rose: spiralling petals, sepals, stem and leaves ---------- */

const ROSE_BASE = 0.0; // height where the Galaxy meets the stem
const ROSE_SCALE = COUNT / 10000; // the rose counts below are written for 10,000 particles
const ROSE_STEM_LEN = 4.9; // how far the stem runs below the Galaxy

// Petal layers from the outside in. Outer petals open wide and low;
// inner petals curl tight and rise to a centre bud.
const ROSE_LAYERS = [
  { n: 5, radius: 2.1, height: 0.5, rise: 0.3, flare: 0.5, width: 1.3, curl: 0.4, count: 1700 },
  { n: 5, radius: 1.6, height: 0.8, rise: 0.5, flare: 0.3, width: 1.2, curl: 0.6, count: 1500 },
  { n: 5, radius: 1.2, height: 1.2, rise: 0.6, flare: 0.2, width: 1.0, curl: 0.8, count: 1300 },
  { n: 4, radius: 0.85, height: 1.6, rise: 0.7, flare: 0.1, width: 0.9, curl: 1.0, count: 1000 },
  { n: 3, radius: 0.5, height: 2.0, rise: 0.6, flare: 0.05, width: 0.7, curl: 1.2, count: 700 },
];

const ROSE_RED = new THREE.Color('#ff2e63'); // pink-red glow
const ROSE_DEEP = new THREE.Color('#1a0710'); // dark glassy petal
const ROSE_EDGE = new THREE.Color('#ff9ec4'); // soft pink rim light
const ROSE_CORE = new THREE.Color('#ff5c8a'); // hot pink centre
const ROSE_SPARK = new THREE.Color('#fff4f8'); // white sparkle
const LEAF_DARK = new THREE.Color('#0b0912');
const LEAF_LIGHT = new THREE.Color('#ff7aa5');
const STEM_COLOR = new THREE.Color('#2a1420');

/** Point on the stem centre line, t from 0 (Galaxy) to 1 (bottom). */
function roseStemAt(t, out) {
  return out.set(0.15 * Math.sin(t * 3.2), ROSE_BASE - 0.3 - t * ROSE_STEM_LEN, 0.05 * Math.cos(t * 2.5));
}

export function buildRose() {
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const c = new THREE.Color();
  let n = 0;

  // Writes one particle: position, then colour multiplied by brightness.
  const put = (x, y, z, col, bright, size) => {
    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = z;
    colors[n * 3] = col.r * bright;
    colors[n * 3 + 1] = col.g * bright;
    colors[n * 3 + 2] = col.b * bright;
    sizes[n] = size;
    n++;
  };

  // ---- Galaxy: petal layers, each a cupped sheet with a spiral twist ----
  ROSE_LAYERS.forEach((L, li) => {
    const depth = li / (ROSE_LAYERS.length - 1); // 0 outside, 1 centre
    const layerCount = Math.round(L.count * ROSE_SCALE);
    for (let k = 0; k < layerCount; k++) {
      const p = Math.floor(Math.random() * L.n);
      const u = Math.random(); // base (0) to rim (1) of the petal
      const v = Math.random() * 2 - 1; // across the petal

      const phi = (p / L.n) * Math.PI * 2 + u * L.curl + (Math.random() - 0.5) * 0.08;
      // Small uneven wobble per petal, so the Galaxy looks hand-shaped rather than perfect.
      const wobble = 1 + 0.12 * Math.sin(p * 2.7 + li * 1.3 + u * 4);
      const rho = L.radius * wobble * (0.25 + 0.75 * u) * (1 + L.flare * u * u);
      const across = v * L.width * Math.sin(Math.PI * Math.pow(u, 0.8)) * 0.55;
      const cs = Math.cos(phi);
      const sn = Math.sin(phi);
      const x = cs * rho - sn * across;
      const z = sn * rho + cs * across;
      const y = ROSE_BASE + L.height + L.rise * u;

      // Dark glassy petals with pink-red light on the edges, a hot pink centre
      // and white sparkles scattered over the surface.
      const edge = Math.pow(Math.abs(v), 4);
      c.copy(ROSE_DEEP).lerp(ROSE_RED, 0.25 + depth * 0.5 + u * 0.2);
      c.lerp(ROSE_CORE, depth * depth * 0.6);
      c.lerp(ROSE_EDGE, edge * 0.8);
      let bright = 0.3 + 0.35 * (1 - edge) + depth * 0.5 + edge * 0.6;
      bright *= 0.85 + Math.random() * 0.3;
      let col = c;
      if (Math.random() < 0.05) {
        col = ROSE_SPARK;
        bright = 1.4;
      }
      put(x, y, z, col, bright, 0.5 + Math.random() * 0.5);
    }
  });

  // ---- Sepals: five green points curling down under the Galaxy ----
  for (let k = 0; k < Math.round(600 * ROSE_SCALE); k++) {
    const p = Math.floor(Math.random() * 5);
    const u = Math.random();
    const v = Math.random() * 2 - 1;
    const phi = (p / 5) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
    const rho = 0.6 + 1.6 * u;
    const across = v * 0.5 * Math.sin(Math.PI * u);
    const cs = Math.cos(phi);
    const sn = Math.sin(phi);
    const x = cs * rho - sn * across;
    const z = sn * rho + cs * across;
    const y = ROSE_BASE - 0.1 - 1.1 * u * u;

    c.copy(LEAF_DARK).lerp(LEAF_LIGHT, 0.3 + 0.5 * (1 - Math.abs(v)));
    put(x, y, z, c, 0.6 + Math.random() * 0.4, 0.5 + Math.random() * 0.3);
  }

  // ---- Stem: a slim, gently swaying tube below the Galaxy ----
  const sp = new THREE.Vector3();
  for (let k = 0; k < Math.round(1400 * ROSE_SCALE); k++) {
    const t = Math.random();
    roseStemAt(t, sp);
    const ang = Math.random() * Math.PI * 2;
    const rr = 0.05 + Math.random() * 0.05;
    c.copy(STEM_COLOR).lerp(LEAF_LIGHT, 0.2);
    put(sp.x + Math.cos(ang) * rr, sp.y, sp.z + Math.sin(ang) * rr, c, 0.6 + Math.random() * 0.4, 0.5 + Math.random() * 0.3);
  }

  // ---- Two leaves on the stem, with a bright midrib and lit edges ----
  const LEAVES = [
    { t: 0.45, angle: 0.8, len: 2.6 },
    { t: 0.7, angle: -2.3, len: 2.2 },
  ];
  const dirL = new THREE.Vector3();
  const across = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const base = new THREE.Vector3();
  for (const leaf of LEAVES) {
    roseStemAt(leaf.t, base);
    dirL.set(Math.sin(leaf.angle) * 0.8, 0.45, Math.cos(leaf.angle) * 0.8).normalize();
    across.set(Math.cos(leaf.angle), 0, -Math.sin(leaf.angle));
    nrm.crossVectors(dirL, across).normalize();

    for (let k = 0; k < Math.round(900 * ROSE_SCALE); k++) {
      const u = Math.random();
      const v = Math.random() * 2 - 1;
      const w = 0.9 * Math.pow(Math.sin(Math.PI * u), 0.9);
      const bulge = 0.25 * (1 - v * v) * Math.sin(Math.PI * u);
      const x = base.x + dirL.x * u * leaf.len + across.x * v * w * 0.6 + nrm.x * bulge;
      const y = base.y + dirL.y * u * leaf.len + across.y * v * w * 0.6 + nrm.y * bulge;
      const z = base.z + dirL.z * u * leaf.len + across.z * v * w * 0.6 + nrm.z * bulge;

      const vein = Math.exp(-v * v * 60);
      c.copy(LEAF_DARK).lerp(LEAF_LIGHT, 0.25 + 0.5 * (1 - Math.abs(v)));
      c.lerp(LEAF_LIGHT, vein * 0.7);
      put(x, y, z, c, 0.55 + Math.random() * 0.4, 0.5 + Math.random() * 0.4);
    }
  }

  // Centre the whole rose vertically on the origin, then enlarge it.
  const ROSE_SIZE = 1.35;
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] *= ROSE_SIZE;
    positions[i * 3 + 1] = (positions[i * 3 + 1] + 1.3) * ROSE_SIZE;
    positions[i * 3 + 2] *= ROSE_SIZE;
  }

  return { positions, colors, sizes };
}

/* ---------- Heart ---------- */

const HEART_SCALE = 0.36;
const HEART_RED = new THREE.Color('#ff4e5e');
const HEART_PINK = new THREE.Color('#ff8c9c');
const HEART_WHITE = new THREE.Color('#ffffff');

/**
 * Heart outline: a thick band of particles with an empty centre.
 * Brightest at the bottom tip (narrow white streak) and at the top dip.
 */
export function buildHeart() {
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const c = new THREE.Color();

  for (let i = 0; i < COUNT; i++) {
    const t = Math.random() * Math.PI * 2;
    const sinT = Math.sin(t);
    const hx = 16 * sinT * sinT * sinT;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

    // Particles sit in a band along the outline; a few spread slightly outward for a soft edge.
    const k = Math.random() < 0.9
      ? 0.9 + Math.random() * 0.2
      : 1.1 + Math.random() * 0.15;

    positions[i * 3] = hx * k * HEART_SCALE;
    positions[i * 3 + 1] = hy * k * HEART_SCALE;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;

    // Red-pink body; whiten toward the bottom tip (narrow streak) and the top dip.
    const tipStreak = clamp01((-hy - 8) / 8) * clamp01(1 - Math.abs(hx) / 4);
    const dip = Math.max(0, 1 - Math.abs(hx) / 3) * clamp01((hy - 2) / 3);
    c.copy(HEART_RED).lerp(HEART_PINK, Math.random() * 0.6);
    c.lerp(HEART_WHITE, Math.max(tipStreak, dip) * 0.9);
    c.multiplyScalar(0.8 + Math.random() * 0.3);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = 1.0 + Math.random() * 0.9;
  }

  return { positions, colors, sizes };
}