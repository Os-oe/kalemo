// Luft-Modus: MediaPipe tasks-vision 1.0.1 (Apache-2.0), lazy geladen, alles lokal im Browser.
// Kamera → ausgewerteter Frame wird gezeichnet (keine Lücke Finger ↔ Linie) → Landmarken → Stift/Artikel.
import { PenMachine, ArticleCounter, fingers, isPenPose, asPoints } from '../core/pen.js';

const Q = new URLSearchParams(location.search);
export const ZONE = 1.4; // Mal-Zone: kleine Bewegungen reichen
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function fetchWithProgress(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); onBytes(b.length, total || b.length); return b; }
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onBytes(got, total); }
  const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export class Air {
  constructor(app) {
    this.app = app;
    this.canvas = document.querySelector('#stage canvas.cam');
    this.ctx = this.canvas.getContext('2d');
    this.video = document.createElement('video');
    Object.assign(this.video, { muted: true, playsInline: true, autoplay: true });
    this.video.setAttribute('playsinline', '');
    this.pen = new PenMachine({ pinch: !!app.settings.pinch });
    this.counter = new ArticleCounter();
    this.state = 'off'; // off | loading | ready | running | failed
    this.frames = 0; this.handFrames = 0; this.poseFrames = 0; this.lastLm = null; this.fpsLog = [];
    this.listeners = { article: null, handcheck: null, real: null };
    this.delegate = null; this.lowFpsSince = null; this.lowFpsWarned = false;
    this._frame = this._frame.bind(this);
  }

  /** Modell + WASM laden (Fortschritt 0..1) */
  async load(onProgress = () => {}) {
    if (this.landmarker) return this.landmarker;
    if (this._loading) return this._loading;
    this.state = 'loading';
    this._loading = (async () => {
      const base = new URL('.', location.href).href;
      const prog = { wasm: 0, model: 0 };
      const report = () => onProgress(Math.min(0.99, prog.wasm * 0.45 + prog.model * 0.55));
      const [vision, , model] = await Promise.all([
        import(base + 'vendor/v1/mediapipe/vision_bundle.mjs'),
        fetchWithProgress(base + 'vendor/v1/mediapipe/vision_wasm_internal.wasm', (g, t) => { prog.wasm = t ? g / t : 0.5; report(); }).catch(() => null),
        fetchWithProgress(base + 'models/v1/mediapipe/hand_landmarker.task', (g, t) => { prog.model = t ? g / t : 0.5; report(); }),
      ]);
      this.vision = vision;
      this.fileset = await vision.FilesetResolver.forVisionTasks(base + 'vendor/v1/mediapipe');
      const forced = Q.get('delegate');
      const order = forced ? [forced] : isIOS() ? ['CPU'] : ['GPU', 'CPU']; // iOS: GPU liefert falsche Ergebnisse (#6142)
      let lastErr;
      for (const delegate of order) {
        try {
          this.landmarker = await vision.HandLandmarker.createFromOptions(this.fileset, {
            baseOptions: { modelAssetBuffer: model, delegate }, runningMode: 'VIDEO', numHands: 1,
            minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
          });
          this.delegate = delegate; break;
        } catch (e) { lastErr = e; }
      }
      if (!this.landmarker) throw lastErr || new Error('HandLandmarker nicht verfügbar');
      onProgress(1);
      this.state = 'ready';
      return this.landmarker;
    })();
    try { return await this._loading; } catch (e) { this.state = 'failed'; this._loading = null; throw e; }
  }

  /** Kamera starten. Wirft bei Ablehnung (NotAllowedError) */
  async startCamera() {
    if (this.stream) return this.stream;
    if (!navigator.mediaDevices?.getUserMedia) { const e = new Error('no-media'); e.name = 'NotSupportedError'; throw e; }
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    await new Promise((r) => (this.video.readyState >= 2 ? r() : this.video.addEventListener('loadeddata', r, { once: true })));
    return this.stream;
  }
  get cameraOn() { return !!this.stream; }

  start() {
    if (this.state === 'running') return;
    this.state = 'running'; this.canvas.hidden = false; this.lastVideoTime = -1;
    document.body.classList.add('air');
    this._schedule();
  }
  stop({ camera = true } = {}) {
    if (this.state === 'running') this.state = 'ready';
    this.canvas.hidden = true; document.body.classList.remove('air');
    if (camera && this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; this.video.srcObject = null; }
    this.pen.reset();
  }
  _schedule() {
    if (this.state !== 'running') return;
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(this._frame);
    else requestAnimationFrame(this._frame);
  }

  /** Abbildung Kamera-normiert → Bühnen-Pixel (gespiegelt, cover + Zone-Zoom) — identisch zur Frame-Darstellung */
  layout() {
    const st = this.app.stage, vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
    const s = Math.max(st.w / vw, st.h / vh) * ZONE; const dw = vw * s, dh = vh * s;
    return { W: st.w, H: st.h, dw, dh, ox: (st.w - dw) / 2, oy: (st.h - dh) / 2 };
  }
  mapper() {
    const L = this.layout();
    return (x, y) => [Math.max(0, Math.min(L.W, L.ox + (1 - x) * L.dw)), Math.max(0, Math.min(L.H, L.oy + y * L.dh))];
  }

  _frame(now) {
    if (this.state !== 'running') return;
    this._schedule();
    const v = this.video; if (v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const t = performance.now();
    let res = null;
    try {
      if (this.detectReal && this.objectDetector && (this.frames % 2 === 0)) this._detectObject(t);
      if (!this.pauseHands) res = this.landmarker.detectForVideo(v, t);
    } catch (e) { this.app.log.push('air ' + e.message); }
    // ausgewerteten Frame zeichnen (gespiegelt)
    const st = this.app.stage, dpr = st.dpr, L = this.layout();
    if (this.canvas.width !== st.canvas.width || this.canvas.height !== st.canvas.height) { this.canvas.width = st.canvas.width; this.canvas.height = st.canvas.height; }
    const c = this.ctx; c.setTransform(-dpr, 0, 0, dpr, L.W * dpr, 0); c.drawImage(v, L.ox, L.oy, L.dw, L.dh);
    this.frames++;
    const lm = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
    this.onLandmarks(lm, t);
    this._fps(t);
    st.render(t); st.renderedByAir = t;
  }

  /** Gemeinsamer Pfad für Kamera und __feedLandmarks. Liefert Trace-Eintrag. */
  onLandmarks(lmRaw, t, map = null) {
    const lm = lmRaw ? asPoints(lmRaw) : null;
    const st = this.app.stage; map = map || this.mapper();
    this.lastLm = lm;
    const out = { t, hand: !!lm };
    if (lm) { this.handFrames++; const f = fingers(lm); out.fingers = f; if (isPenPose(f)) this.poseFrames++; }
    if (this.listeners.handcheck) this.listeners.handcheck(!!lm, t);
    if (this.listeners.article) { const a = this.counter.update(lm, t); out.article = a; this.listeners.article(a); }
    const drawing = st.enabled && this.app.mode === 'air' && !this.listeners.article;
    const ev = this.pen.update(lm, t, map);
    // Messung „Lücke Finger ↔ Linie": roher Fingerspitzen-Punkt im gezeigten Frame vs. gefilterter Stiftpunkt
    if (lm) {
      const [rx, ry] = map(lm[8].x, lm[8].y); const p = ev.find((e) => e.type === 'move' || e.type === 'hover');
      if (p) { (this.gaps ||= []).push(Math.hypot(p.x - rx, p.y - ry)); if (this.gaps.length > 900) this.gaps.shift(); }
    }
    for (const e of ev) {
      if (e.type === 'down') { if (drawing) { const [p0, ...rest] = e.pts; st.beginStroke(p0[0], p0[1], p0[2]); for (const p of rest) st.addPoint(p[0], p[1], p[2]); } }
      else if (e.type === 'move') { if (drawing) st.addPoint(e.x, e.y, e.t); else st.setCursor(e.x, e.y, 'hover'); }
      else if (e.type === 'up') { if (st.active) st.endStroke(e.t, e.cutMs); }
      else if (e.type === 'hover') st.setCursor(e.x, e.y, 'hover');
      else if (e.type === 'lost') st.setCursor(null);
    }
    out.pen = this.pen.down ? 'down' : 'up';
    out.events = ev.map((e) => e.type);
    return out;
  }

  _fps(t) {
    this.fpsLog.push(t); while (this.fpsLog.length && t - this.fpsLog[0] > 1000) this.fpsLog.shift();
    this.fps = this.fpsLog.length;
    if (this.frames < 45) return; // Anlaufphase ignorieren
    if (this.fps < 20) { this.lowFpsSince ??= t; if (t - this.lowFpsSince > 2000 && !this.lowFpsWarned) { this.lowFpsWarned = true; this.app.onLowFps?.(this.fps); } }
    else this.lowFpsSince = null;
  }

  // ---------- Hol es echt ----------
  async loadObjectDetector(onProgress = () => {}) {
    if (this.objectDetector) return this.objectDetector;
    await this.load();
    const base = new URL('.', location.href).href;
    const model = await fetchWithProgress(base + 'models/v1/mediapipe/efficientdet_lite0.tflite', (g, t) => onProgress(t ? g / t : 0.5));
    for (const delegate of [this.delegate, 'CPU']) {
      try {
        this.objectDetector = await this.vision.ObjectDetector.createFromOptions(this.fileset, { baseOptions: { modelAssetBuffer: model, delegate }, runningMode: 'VIDEO', scoreThreshold: 0.3, maxResults: 5 });
        break;
      } catch (e) { this.app.log.push('od ' + e.message); }
    }
    return this.objectDetector;
  }
  /** Ziel-Klasse ≥ 0,5 in 5 von 10 Frames innerhalb von 10 s */
  hunt(cocoClass, { windowMs = 10000 } = {}) {
    const NEVER = new Set(['knife', 'scissors', 'toilet']);
    if (NEVER.has(cocoClass)) return Promise.resolve({ found: false, reason: 'blocked' });
    return new Promise((resolve) => {
      const hits = []; const t0 = performance.now();
      this.detectReal = { cls: cocoClass, onFrame: (score, box) => {
        hits.push(score >= 0.5); if (hits.length > 10) hits.shift();
        this.app.onRealFrame?.(score, box, (performance.now() - t0) / windowMs);
        if (hits.filter(Boolean).length >= 5) { this.detectReal = null; resolve({ found: true, box }); }
      } };
      this.pauseHands = true;
      setTimeout(() => { if (this.detectReal) { this.detectReal = null; resolve({ found: false }); } this.pauseHands = false; }, windowMs);
      this._huntCancel = () => { if (this.detectReal) { this.detectReal = null; resolve({ found: false, cancelled: true }); } this.pauseHands = false; };
    }).finally(() => { this.pauseHands = false; });
  }
  cancelHunt() { this._huntCancel?.(); }
  _detectObject(t) {
    const r = this.objectDetector.detectForVideo(this.video, t);
    const want = this.detectReal; if (!want) return;
    let best = 0, box = null;
    for (const d of r.detections || []) for (const c of d.categories) if (c.categoryName === want.cls && c.score > best) { best = c.score; box = d.boundingBox; }
    want.onFrame(best, box);
  }
}
