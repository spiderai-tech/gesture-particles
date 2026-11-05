/**
 * hands.js — webcam, MediaPipe Hand Landmarker (up to 2 hands), gesture reading.
 */
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Finger landmark indices: [MCP, PIP, TIP] for index, middle, ring, pinky.
const FINGERS = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
];
const THUMB_TIP = 4;
const INDEX_TIP = 8;

// Heart pose tolerance, as a fraction of hand size.
// Raise it to make the heart easier to form, lower it to make it stricter.
export const HEART_TOLERANCE = 1.0;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/**
 * Reads the pose of one hand.
 * A finger counts as extended when its tip is clearly farther from the wrist
 * than its middle joint is.
 * @returns {'OPEN_PALM' | 'CLOSED_FIST' | 'THUMBS_UP' | 'UNKNOWN'}
 */
export function classifyGesture(lm) {
  if (!lm || lm.length < 21) return 'UNKNOWN';
  const wrist = lm[0];
  let extended = 0;
  for (const [, pip, tip] of FINGERS) {
    if (dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.12) extended++;
  }
  if (extended >= 3) return 'OPEN_PALM';
  if (extended <= 1 && isThumbsUp(lm)) return 'THUMBS_UP';
  if (extended <= 1) return 'CLOSED_FIST';
  return 'UNKNOWN';
}

/**
 * Thumbs up: the thumb is extended and points clearly upward (above the
 * index knuckle), while the fingers are curled (checked by the caller).
 */
export function isThumbsUp(lm) {
  const wrist = lm[0];
  const thumbExtended = dist(lm[THUMB_TIP], wrist) > dist(lm[2], wrist) * 1.2;
  const pointsUp = lm[THUMB_TIP].y < lm[5].y && lm[THUMB_TIP].y < lm[THUMB_TIP - 1].y;
  return thumbExtended && pointsUp;
}

/** Average of the wrist and the four knuckles, in normalised image space. */
export function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  for (const i of ids) {
    x += lm[i].x;
    y += lm[i].y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** Wrist-to-middle-knuckle distance, used as the scale of a hand. */
export function handSize(lm) {
  return dist(lm[0], lm[9]);
}

/**
 * Heart pose made with two hands: each hand's thumb and index finger meet,
 * and the two thumb tips and the two index tips come together.
 */
export function isHeartPose(a, b) {
  if (!a || !b || a.length < 21 || b.length < 21) return false;
  const sa = handSize(a);
  const sb = handSize(b);
  const tol = HEART_TOLERANCE;

  // Each hand's thumb and index form one side of the heart, so they only need
  // to be roughly close (a gap between them is normal).
  const ownA = dist(a[THUMB_TIP], a[INDEX_TIP]) < tol * 1.5 * sa;
  const ownB = dist(b[THUMB_TIP], b[INDEX_TIP]) < tol * 1.5 * sb;
  // Thumb tips meet at the bottom, index tips meet at the top.
  const thumbsTogether = dist(a[THUMB_TIP], b[THUMB_TIP]) < tol * 1.0 * sa;
  const indexTogether = dist(a[INDEX_TIP], b[INDEX_TIP]) < tol * 1.0 * sa;

  return ownA && ownB && thumbsTogether && indexTogether;
}

/**
 * Debounces the single-hand gesture (it must hold for a few frames) and
 * smooths the palm position so the shape doesn't jitter.
 */
export class GestureTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.candidate = 'UNKNOWN';
    this.count = 0;
    this.stable = 'UNKNOWN';
    this.x = 0.5;
    this.y = 0.5;
  }

  /** @returns {{hasHand: boolean, gesture: string, x: number, y: number}} */
  update(lm) {
    if (!lm) {
      this.reset();
      return { hasHand: false, gesture: 'UNKNOWN', x: 0.5, y: 0.5 };
    }

    const raw = classifyGesture(lm);
    if (raw === this.candidate) {
      this.count++;
    } else {
      this.candidate = raw;
      this.count = 1;
    }
    if (this.count >= 4) this.stable = this.candidate;

    const c = palmCenter(lm);
    this.x += (c.x - this.x) * 0.25;
    this.y += (c.y - this.y) * 0.25;

    return { hasHand: true, gesture: this.stable, x: this.x, y: this.y };
  }
}

export class HandTracker {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.video
   * @param {HTMLCanvasElement} opts.canvas   dots drawn over the preview
   * @param {(r: {hands: any[][]}) => void} opts.onHand   all visible hands (0–2)
   * @param {(status: string) => void} [opts.onStatus]
   * @param {(err: Error) => void} [opts.onError]
   */
  constructor({ video, canvas, onHand, onStatus = () => {}, onError = () => {} }) {
    this.video = video;
    this.canvas = canvas;
    this.onHand = onHand;
    this.onStatus = onStatus;
    this.onError = onError;

    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.raf = 0;
    this.lastDetect = 0;
    this.lastVideoTime = -1;
    this.interval = 1000 / 30;

    this.handleEnded = () => {
      this.onError(fail('DISCONNECTED', 'Camera disconnected'));
      this.stop();
    };
  }

  /** Opens the webcam and loads the model. Throws an Error with a `code` on failure. */
  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw fail('UNSUPPORTED', 'getUserMedia not available');
    }

    this.onStatus('OPENING CAMERA');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      const map = {
        NotAllowedError: 'DENIED',
        SecurityError: 'DENIED',
        NotFoundError: 'NO_CAMERA',
        OverconstrainedError: 'NO_CAMERA',
        NotReadableError: 'IN_USE',
      };
      throw fail(map[err.name] || 'UNKNOWN', err.message);
    }

    this.stream.getVideoTracks().forEach((t) => t.addEventListener('ended', this.handleEnded));
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    if (this.video.readyState < 2) {
      await new Promise((resolve) => this.video.addEventListener('loadeddata', resolve, { once: true }));
    }

    this.onStatus('LOADING MODEL');
    try {
      await this.loadModel();
    } catch (err) {
      this.stop();
      throw fail('MODEL', err.message);
    }

    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  async loadModel() {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const base = {
      runningMode: 'VIDEO',
      numHands: 2, // two hands are needed for the heart shape
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...base,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      });
    } catch {
      // No GPU delegate on this device: use the CPU.
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...base,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      });
    }
  }

  loop = (now) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    if (now - this.lastDetect < this.interval) return;
    if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastDetect = now;
    this.lastVideoTime = this.video.currentTime;

    let result;
    try {
      result = this.landmarker.detectForVideo(this.video, now);
    } catch (err) {
      this.onError(err);
      return;
    }

    const hands = result.landmarks || [];
    this.drawDots(hands);
    this.onHand({ hands });
  };

  drawDots(hands) {
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#63e6ff';
    for (const lm of hands) {
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Stops detection and releases the camera. Safe to call repeatedly. */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        t.removeEventListener('ended', this.handleEnded);
        t.stop();
      });
      this.stream = null;
    }
    this.video.srcObject = null;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dispose() {
    this.stop();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}