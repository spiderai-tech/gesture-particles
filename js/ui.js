/**
 * ui.js — all DOM work: overlays, status panel, chips, notices, info.
 */

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.add('show');
const hide = (el) => el.classList.remove('show');

const INFO = {
  about: {
    title: 'ABOUT',
    html: `
      <p><b>Galaxy &amp; KNOT</b> turns your webcam into a sculpting tool. Ten thousand particles hold two
      living forms, and your hands decide which one they take.</p>
      <p>Hand tracking runs entirely in your browser with MediaPipe. Your video never leaves your device.</p>
    `,
  },
  how: {
    title: 'HOW TO USE',
    html: `
      <p class="how-intro">Show your hand to the camera and make a gesture. The shape changes right away.</p>
      <div class="how-grid">
        <div class="how-item">
          <span class="how-icon" aria-hidden="true">🖐️</span>
          <div><b>Open palm</b><span>Turns into Galaxy, a swirling vortex of light.</span></div>
        </div>
        <div class="how-item">
          <span class="how-icon" aria-hidden="true">✊</span>
          <div><b>Closed fist</b><span>Turns into PLANET, a glowing globe with rings.</span></div>
        </div>
        <div class="how-item">
          <span class="how-icon" aria-hidden="true">👍</span>
          <div><b>Thumbs up</b><span>Turns into ROSE, a red rose with stem and leaves.</span></div>
        </div>
        <div class="how-item">
          <span class="how-icon" aria-hidden="true">🫶</span>
          <div><b>Both hands, heart shape</b><span>Hold for a moment to form a HEART. Release it to return to Galaxy.</span></div>
        </div>
      </div>
      <h3 class="how-sub">Moving the shape</h3>
      <ul class="how-list">
        <li><b>Move your hand left or right</b> to turn the shape.</li>
        <li><b>Move your hand up or down</b> to lift it.</li>
      </ul>
      <h3 class="how-sub">Without a camera</h3>
      <ul class="how-list">
        <li><b>Drag</b> to turn the shape.</li>
        <li><b>Tap or click</b> to switch to the next shape.</li>
      </ul>
      <p class="how-tip">Keep your hand in good light, about an arm's length from the camera.</p>
    `,
  },
};

export class UI {
  constructor() {
    this.intro = $('intro');
    this.loading = $('loading');
    this.loadingText = $('loading-text');
    this.notice = $('notice');
    this.noticeTitle = $('notice-title');
    this.noticeBody = $('notice-body');
    this.btnRetry = $('btn-retry');
    this.btnDismiss = $('btn-dismiss');
    this.infoPanel = $('info');
    this.infoTitle = $('info-title');
    this.infoBody = $('info-body');
    this.hud = $('hud');
    this.hudGesture = $('hud-gesture');
    this.hudShape = $('hud-shape');
    this.hudTracking = $('hud-tracking');
    this.cam = $('cam');
    this.btnCam = $('btn-camera');
    this.chips = $('chips');
  }

  showIntro() {
    show(this.intro);
  }

  hideIntro() {
    hide(this.intro);
  }

  loadingOn(text) {
    this.loadingText.textContent = text;
    show(this.loading);
  }

  setLoadingText(text) {
    this.loadingText.textContent = text;
  }

  loadingOff() {
    hide(this.loading);
  }

  showChrome(on) {
    this.hud.hidden = !on;
  }

  setCam(on) {
    this.cam.hidden = !on;
  }

  setCamButton(on) {
    this.btnCam.textContent = on ? 'STOP CAMERA' : 'START CAMERA';
  }

  setGesture(text) {
    this.hudGesture.textContent = text;
  }

  setShape(text) {
    this.hudShape.textContent = text;
  }

  setTracking(text) {
    this.hudTracking.textContent = text;
  }

  /** Brief status message at the top of the screen. */
  chip(text, variant = '') {
    const el = document.createElement('span');
    el.className = variant ? `chip chip-${variant}` : 'chip';
    el.textContent = text;
    this.chips.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  /**
   * @param {string} title
   * @param {string} body
   * @param {{retry?: boolean, retryLabel?: string, dismiss?: string}} [opts]
   */
  notice(title, body, opts = {}) {
    this.noticeTitle.textContent = title;
    this.noticeBody.textContent = body;
    this.btnRetry.hidden = !opts.retry;
    this.btnRetry.textContent = opts.retryLabel || 'TRY AGAIN';
    this.btnDismiss.textContent = opts.dismiss || 'Continue with mouse / touch';
    show(this.notice);
  }

  hideNotice() {
    hide(this.notice);
  }

  info(kind) {
    const content = INFO[kind];
    if (!content) return;
    this.infoTitle.textContent = content.title;
    this.infoBody.innerHTML = content.html;
    show(this.infoPanel);
  }

  hideInfo() {
    hide(this.infoPanel);
  }

  fullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  /** Plain-language title and body for a camera error code. */
  copyFor(code) {
    switch (code) {
      case 'DENIED':
        return {
          title: 'Camera access was blocked',
          body:
            'Allow camera access for this site in your browser\'s address-bar settings, then press TRY AGAIN. You can also continue with mouse or touch.',
        };
      case 'NO_CAMERA':
        return {
          title: 'No camera found',
          body: 'Connect a webcam, then press TRY AGAIN, or continue with mouse or touch.',
        };
      case 'IN_USE':
        return {
          title: 'The camera is busy',
          body: 'Another app is using the camera. Close it and press TRY AGAIN.',
        };
      case 'UNSUPPORTED':
        return {
          title: 'Your browser cannot use the camera',
          body: 'Try a current version of Chrome, Edge, Firefox or Safari.',
        };
      case 'DISCONNECTED':
        return {
          title: 'Camera disconnected',
          body: 'Reconnect the camera and press TRY AGAIN, or continue with mouse or touch.',
        };
      case 'MODEL':
        return {
          title: 'The hand model did not load',
          body: 'The tracking model loads from the web. Check your connection and press TRY AGAIN.',
        };
      default:
        return {
          title: 'The camera did not start',
          body: 'Press TRY AGAIN, or continue with mouse or touch.',
        };
    }
  }
}