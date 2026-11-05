/**
 * main.js — app wiring: scene, lifecycle, gestures and controls.
 *
 *   BEGIN            → WebGL scene + camera + hand model
 *   Open palm        → Galaxy (flower)
 *   Closed fist      → PLANET (glowing globe with rings)
 *   Thumbs up        → ROSE (red rose with stem and leaves)
 *   Both hands heart → HEART (red-pink heart)
 *   Hand left/right  → turn the shape; up/down → lift it
 *   Mouse / touch    → drag to turn, tap to cycle shapes
 */
import * as THREE from 'three';
import { ParticleField } from './particles.js';
import { buildGalaxy, buildPlanet, buildHeart, buildRose } from './shapes.js';
import { HandTracker, GestureTracker, isHeartPose, palmCenter } from './hands.js';
import { UI } from './ui.js';

const Galaxy = 'Galaxy';
const PLANET = 'PLANET';
const HEART = 'HEART';
const ROSE = 'ROSE';
const SHAPE_ORDER = [Galaxy, PLANET, ROSE, HEART];

const FORM_EASE = 3; // how fast particles travel to a new shape
const CTRL_EASE = 4.0; // how smoothly hand / drag motion is followed
const HEART_HOLD_FRAMES = 4; // the heart pose must hold this many detections
const FIT_MARGIN = 0.85; // portrait screens: keep each shape inside this share of the view
const MIN_FIT = 0.25; // never shrink a shape below this scale
const FIT_EASE = 3; // how smoothly the scale changes when the shape changes

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Furthest distance from the origin among the given xyz positions. */
const maxRadius = (positions) => {
  let max = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    max = Math.max(max, Math.sqrt(x * x + y * y + z * z));
  }
  return max || 1;
};

/** Eases an angle toward the nearest multiple of π, at most `step` per call. */
const alignToPi = (v, step) => {
  const target = Math.round(v / Math.PI) * Math.PI;
  return v + clamp(target - v, -step, step);
};

/** Eases an angle toward the nearest multiple of 2π, at most `step` per call. */
const alignToTwoPi = (v, step) => {
  const target = Math.round(v / (2 * Math.PI)) * 2 * Math.PI;
  return v + clamp(target - v, -step, step);
};

class App {
  constructor() {
    this.ui = new UI();
    this.gestures = new GestureTracker();
    this.tracker = null;
    this.starting = false;

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.pivot = null; // hand/drag-driven rotation and lift
    this.spin = null; // continuous spin
    this.field = null;
    this.forms = null;
    this.shape = '';
    this.radii = {}; // furthest distance of each shape's particles from its centre
    this.fitNow = 1; // current scale of the formation
    this.fitTarget = 1; // scale the formation should reach

    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.time = 0;

    this.mouseMode = false;
    this.handOn = false;
    this.gestureNow = 'NONE';
    this.heartHold = 0;
    this.heartOn = false;
    this.target = { x: 0, y: 0 };
    this.ctrl = { x: 0, y: 0 };
    this.drag = { down: false, moved: 0, lx: 0, ly: 0, yaw: 0, tilt: 0 };

    this.noticeAction = '';
    this.lastHiccup = 0;
    this.handOnlyView = false; // false: live video behind the hand dots

    this.bindControls();
    this.ui.showIntro();
  }

  bindControls() {
    $('btn-begin').onclick = () => this.begin(true);
    $('btn-nocam').onclick = () => this.begin(false);
    $('btn-retry').onclick = () => this.onRetry();
    $('btn-dismiss').onclick = () => this.onDismiss();
    $('btn-hud-close').onclick = () => this.ui.showChrome(false);
    $('btn-restart').onclick = () => this.restart();
    $('btn-camera').onclick = () => this.toggleCamera();
    $('btn-exit').onclick = () => this.exit();
    $('btn-fullscreen').onclick = () => this.ui.fullscreen();
    $('btn-hands-view').onclick = () => this.toggleHandView();
    $('btn-about').onclick = () => this.ui.info('about');
    $('btn-how').onclick = () => this.ui.info('how');
    $('btn-info-close').onclick = () => this.ui.hideInfo();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.ui.hideInfo();
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => {
      if (this.tracker) this.tracker.dispose();
    });

    // Mouse / touch: drag to turn, tap to cycle shapes.
    const stage = $('stage');
    const d = this.drag;
    stage.addEventListener('pointerdown', (e) => {
      if (!this.running) return;
      d.down = true;
      d.moved = 0;
      d.lx = e.clientX;
      d.ly = e.clientY;
    });
    stage.addEventListener('pointermove', (e) => {
      if (!d.down) return;
      const dx = e.clientX - d.lx;
      const dy = e.clientY - d.ly;
      d.lx = e.clientX;
      d.ly = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      d.yaw = clamp(d.yaw + dx * 0.006, -2.4, 2.4);
      d.tilt = clamp(d.tilt + dy * 0.004, -0.8, 0.8);
    });
    const release = () => {
      if (!d.down) return;
      d.down = false;
      if (d.moved < 8 && this.running) this.toggleShape();
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', () => {
      d.down = false;
    });
  }

  /** Switches the camera box between the live video and the hand-only view. */
  toggleHandView() {
    this.handOnlyView = !this.handOnlyView;
    $('cam').classList.toggle('hand-only', this.handOnlyView);
    $('btn-hands-view').textContent = this.handOnlyView ? 'SHOW VIDEO' : 'HAND ONLY';
  }

  /* ---------- Scene ---------- */

  /** Creates the WebGL scene once. Returns false if WebGL is unavailable. */
  init3D() {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      return false;
    }

    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setClearColor(0x000000, 0);
    r.setSize(window.innerWidth, window.innerHeight);
    $('stage').appendChild(r.domElement);

    r.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stopLoop();
      this.noticeAction = 'context';
      this.ui.notice(
        'Graphics were reset',
        'The browser reset the graphics device. Press RELOAD to bring the field back.',
        { retry: true, retryLabel: 'RELOAD', dismiss: 'Back to start' },
      );
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

    this.pivot = new THREE.Group();
    this.spin = new THREE.Group();
    this.pivot.add(this.spin);
    this.scene.add(this.pivot);

    this.forms = {
      [Galaxy]: buildGalaxy(),
      [PLANET]: buildPlanet(),
      [HEART]: buildHeart(),
      [ROSE]: buildRose(),
    };
    for (const name of SHAPE_ORDER) {
      this.radii[name] = maxRadius(this.forms[name].positions);
    }
    this.field = new ParticleField(this.spin);
    this.shape = Galaxy;
    this.field.setTarget(this.forms[Galaxy]);
    this.ui.setShape(Galaxy);

    this.resize();
    return true;
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Pull the camera back on tall screens so the shape still fits.
    this.camera.position.set(0, 0, w / h < 1 ? 20 : 14);
    this.camera.updateProjectionMatrix();

    this.fitTarget = this.fitFor(this.shape);
    this.field.setPixel(this.renderer.getPixelRatio());
  }

  /**
   * Scale that keeps a shape inside the view. Only needed on portrait
   * screens (phones); landscape screens keep the original size.
   */
  fitFor(name) {
    if (!this.camera || window.innerWidth / window.innerHeight >= 1) return 1;
    const halfH = this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfW = halfH * this.camera.aspect;
    return clamp((Math.min(halfW, halfH) * FIT_MARGIN) / this.radii[name], MIN_FIT, 1);
  }

  setShape(name) {
    if (name === this.shape) return;
    this.shape = name;
    this.field.setTarget(this.forms[name]);
    this.fitTarget = this.fitFor(name);
    this.ui.setShape(name);
  }

  toggleShape() {
    const i = SHAPE_ORDER.indexOf(this.shape);
    this.setShape(SHAPE_ORDER[(i + 1) % SHAPE_ORDER.length]);
    this.ui.chip(`${this.shape} FORMED`);
  }

  /* ---------- Lifecycle ---------- */

  begin(withCamera) {
    this.ui.hideIntro();
    if (!this.init3D()) {
      this.noticeAction = 'webgl';
      this.ui.notice(
        'WebGL is unavailable',
        'This browser cannot draw the particle field. Try the latest Chrome, Edge, Firefox or Safari.',
        { retry: false, dismiss: 'Back to start' },
      );
      return;
    }
    this.ui.showChrome(true);
    this.startLoop();
    if (withCamera) {
      this.startCamera();
    } else {
      this.enterMouse();
    }
  }

  async startCamera() {
    if (this.starting) return;
    this.starting = true;
    this.releaseTracker();

    this.ui.loadingOn('OPENING CAMERA');
    this.tracker = new HandTracker({
      video: $('webcam'),
      canvas: $('hand-canvas'),
      onHand: (res) => this.onHand(res),
      onStatus: (s) => this.ui.setLoadingText(s),
      onError: (err) => this.onTrackerError(err),
    });

    try {
      await this.tracker.start();
      this.mouseMode = false;
      this.ui.loadingOff();
      this.ui.setCam(true);
      this.ui.setCamButton(true);
      this.ui.setTracking('WAITING FOR HAND');
      this.ui.chip('CAMERA ONLINE');
    } catch (err) {
      this.releaseTracker();
      this.ui.loadingOff();
      this.enterMouse();
      this.showCameraNotice(err.code);
    } finally {
      this.starting = false;
    }
  }

  enterMouse() {
    this.mouseMode = true;
    this.handOn = false;
    this.ui.setCam(false);
    this.ui.setCamButton(false);
    this.ui.setGesture('—');
    this.ui.setTracking('MOUSE / TOUCH');
  }

  releaseTracker() {
    if (this.tracker) {
      this.tracker.dispose();
      this.tracker = null;
    }
    this.handOn = false;
    this.gestureNow = 'NONE';
    this.heartHold = 0;
    this.heartOn = false;
    this.gestures.reset();
    this.target.x = 0;
    this.target.y = 0;
  }

  toggleCamera() {
    if (this.tracker) {
      this.releaseTracker();
      this.enterMouse();
      this.ui.chip('CAMERA OFF');
    } else {
      this.startCamera();
    }
  }

  showCameraNotice(code) {
    const m = this.ui.copyFor(code);
    this.noticeAction = 'camera';
    this.ui.notice(m.title, m.body, { retry: true, dismiss: 'Continue with mouse / touch' });
  }

  onTrackerError(err) {
    if (err.code === 'DISCONNECTED') {
      this.releaseTracker();
      this.enterMouse();
      this.showCameraNotice('DISCONNECTED');
      return;
    }
    // Single-frame detection hiccups: report at most every few seconds.
    const now = performance.now();
    if (now - this.lastHiccup > 4000) {
      this.lastHiccup = now;
      this.ui.chip('TRACKING HICCUP', 'warn');
    }
  }

  onRetry() {
    const action = this.noticeAction;
    this.ui.hideNotice();
    if (action === 'camera') this.startCamera();
    else if (action === 'context') window.location.reload();
  }

  onDismiss() {
    this.ui.hideNotice();
    if (this.noticeAction === 'webgl' || this.noticeAction === 'context') {
      this.exit();
    } else {
      this.enterMouse();
    }
  }

  restart() {
    this.drag.yaw = 0;
    this.drag.tilt = 0;
    this.spin.rotation.set(0, 0, 0);
    this.shape = '';
    this.field.scatter();
    this.setShape(Galaxy);
    this.ui.chip('FIELD RESET');
  }

  exit() {
    this.releaseTracker();
    this.stopLoop();
    this.mouseMode = false;
    this.ui.loadingOff();
    this.ui.hideNotice();
    this.ui.hideInfo();
    this.ui.showChrome(false);
    this.ui.setCam(false);
    this.ui.showIntro();
  }

  /* ---------- Hand input ---------- */

  onHand({ hands }) {
    // Single-hand gesture reading uses the first visible hand.
    const r = this.gestures.update(hands[0] || null);

    // Two hands forming a heart take priority once held steady.
    const heartPose = isHeartPose(hands[0], hands[1]);
    this.heartHold = heartPose ? this.heartHold + 1 : 0;

    if (this.heartHold >= HEART_HOLD_FRAMES) {
      if (!this.heartOn) {
        this.heartOn = true;
        this.handOn = true;
        this.ui.setTracking('LIVE · 2 HANDS');
        this.ui.setGesture('HEART');
        this.ui.chip('HEART · BOTH HANDS');
        this.setShape(HEART);
      }
      // The heart follows the midpoint between the two hands.
      const a = palmCenter(hands[0]);
      const b = palmCenter(hands[1]);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.target.x = clamp((0.5 - mx) * 2.4, -1, 1);
      this.target.y = clamp((0.5 - my) * 2.4, -1, 1);
      return;
    }

    if (this.heartOn) {
      this.heartOn = false;
      this.gestureNow = 'NONE';
      this.ui.chip('HEART RELEASED');
      this.setShape(Galaxy);
    }

    if (!r.hasHand) {
      if (this.handOn) {
        this.handOn = false;
        this.gestureNow = 'NONE';
        this.ui.setTracking('WAITING FOR HAND');
        this.ui.setGesture('—');
        this.ui.chip('HAND LOST', 'warn');
      }
      this.target.x = 0;
      this.target.y = 0;
      return;
    }

    if (!this.handOn) {
      this.handOn = true;
      this.ui.setTracking('LIVE');
      this.ui.chip('HAND FOUND');
    }

    if (r.gesture !== 'UNKNOWN' && r.gesture !== this.gestureNow) {
      this.gestureNow = r.gesture;
      if (r.gesture === 'OPEN_PALM') {
        this.ui.setGesture('OPEN PALM');
        this.ui.chip('OPEN PALM · Galaxy');
        this.setShape(Galaxy);
      } else if (r.gesture === 'THUMBS_UP') {
        this.ui.setGesture('THUMBS UP');
        this.ui.chip('THUMBS UP · ROSE');
        this.setShape(ROSE);
      } else {
        this.ui.setGesture('CLOSED FIST');
        this.ui.chip('CLOSED FIST · PLANET');
        this.setShape(PLANET);
      }
    }

    // The camera image is not mirrored, so (0.5 - x) is positive when the
    // hand is on the right of the (mirrored) screen.
    this.target.x = clamp((0.5 - r.x) * 2.4, -1, 1);
    this.target.y = clamp((0.5 - r.y) * 2.4, -1, 1);
  }

  /* ---------- Render loop ---------- */

  startLoop() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.animate);
  }

  stopLoop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  animate = (now) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.animate);

    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;

    // Particles glide toward the current shape.
    this.field.step(1 - Math.exp(-dt * FORM_EASE));
    this.field.setTime(this.time);

    // Smooth the hand / mouse control values.
    const c = 1 - Math.exp(-dt * CTRL_EASE);
    const live = !this.mouseMode && this.handOn;
    this.ctrl.x += ((live ? this.target.x : 0) - this.ctrl.x) * c;
    this.ctrl.y += ((live ? this.target.y : 0) - this.ctrl.y) * c;

    const d = this.drag;
    const cx = this.ctrl.x;
    const cy = this.ctrl.y;
    const isPlanet = this.shape === PLANET;
    const k3 = 1 - Math.exp(-dt * 3);

    // Hand/drag control of the shape:
    //   left/right hand → turn (rotation.y)
    //   up/down hand    → tilt (rotation.x) and lift (position.y)
    const tx = isPlanet
      ? clamp(0.35 + d.tilt + cy * 0.7, -1.4, 1.4)
      : clamp(d.tilt + cy * 0.5, -0.9, 0.9);
    const ty = isPlanet
      ? cx * 1.6 + d.yaw
      : clamp(cx * 0.9 + d.yaw * 0.4, -1.3, 1.3);
    this.pivot.rotation.x += (tx - this.pivot.rotation.x) * k3;
    this.pivot.rotation.y += (ty - this.pivot.rotation.y) * k3;
    this.pivot.position.y = cy * 2.2;

    // Ease the formation to its fitted size (phones) without a sudden jump.
    this.fitNow += (this.fitTarget - this.fitNow) * (1 - Math.exp(-dt * FIT_EASE));
    this.pivot.scale.setScalar(this.fitNow);

    // Spin per shape:
    //   No automatic rotation: every shape only eases back to its resting
    //   pose. Turning comes from hand movement or drag.
    const sp = this.spin.rotation;
    const upright = this.shape === ROSE;
    sp.y = upright ? alignToTwoPi(sp.y, dt * 1.5) : alignToPi(sp.y, dt * 1.5);
    sp.z = this.shape === HEART || upright
      ? alignToTwoPi(sp.z, dt * 1.5)
      : alignToPi(sp.z, dt * 1.5);

    this.renderer.render(this.scene, this.camera);
  };
}

const app = new App();
// Exposed for debugging in the browser console.
window.GalaxyAndKnot = app;