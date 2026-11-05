/**
 * particles.js — one THREE.Points object holding all particles.
 * Positions, colours and sizes are typed arrays that ease toward the
 * current formation's targets every frame. No per-particle objects.
 */
import * as THREE from 'three';
import { COUNT, paletteInto } from './palette.js';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixel;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = color;
    float tw = 0.82 + 0.18 * sin(uTime * 1.6 + aPhase);
    vAlpha = tw;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Small, crisp points: about 4-12px on screen at the default camera distance.
    gl_PointSize = aSize * uPixel * (74.0 / -mv.z) * tw;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor * (0.6 + 0.7 * a), a * vAlpha);
  }
`;

export class ParticleField {
  /** @param {THREE.Object3D} parent */
  constructor(parent) {
    this.count = COUNT;

    this.pos = new Float32Array(COUNT * 3);
    this.col = new Float32Array(COUNT * 3);
    this.siz = new Float32Array(COUNT);

    this.tPos = new Float32Array(COUNT * 3);
    this.tCol = new Float32Array(COUNT * 3);
    this.tSiz = new Float32Array(COUNT);

    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) phase[i] = Math.random() * Math.PI * 2;

    this.posA = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colA = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizA = new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', this.posA);
    this.geo.setAttribute('color', this.colA);
    this.geo.setAttribute('aSize', this.sizA);
    this.geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.parent = parent;

    // Start as a loose cloud; targets mirror it until a formation is set.
    this.scatter();
    this.tPos.set(this.pos);
    this.tCol.set(this.col);
    this.tSiz.set(this.siz);
  }

  /** Puts every particle at a random spot in a loose shell (used on start and restart). */
  scatter() {
    for (let i = 0; i < this.count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 5 + Math.random() * 3;
      this.pos[i * 3] = s * Math.cos(th) * r;
      this.pos[i * 3 + 1] = u * r;
      this.pos[i * 3 + 2] = s * Math.sin(th) * r;
      paletteInto(Math.random(), this.col, i);
      this.siz[i] = 1.2 + Math.random();
    }
    this.posA.needsUpdate = true;
    this.colA.needsUpdate = true;
    this.sizA.needsUpdate = true;
  }

  /** Sets the formation the particles will glide toward. */
  setTarget({ positions, colors, sizes }) {
    this.tPos.set(positions);
    this.tCol.set(colors);
    this.tSiz.set(sizes);
  }

  /** Moves every particle a fraction k of the way toward its target. */
  step(k) {
    const p = this.pos;
    const tp = this.tPos;
    const c = this.col;
    const tc = this.tCol;
    const n3 = this.count * 3;
    for (let i = 0; i < n3; i++) {
      p[i] += (tp[i] - p[i]) * k;
      c[i] += (tc[i] - c[i]) * k;
    }
    const s = this.siz;
    const ts = this.tSiz;
    for (let i = 0; i < this.count; i++) {
      s[i] += (ts[i] - s[i]) * k;
    }
    this.posA.needsUpdate = true;
    this.colA.needsUpdate = true;
    this.sizA.needsUpdate = true;
  }

  setTime(t) {
    this.mat.uniforms.uTime.value = t;
  }

  setPixel(ratio) {
    this.mat.uniforms.uPixel.value = ratio;
  }

  dispose() {
    this.parent.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}
