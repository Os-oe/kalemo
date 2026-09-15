// Die Bühne: Leuchtspur-Canvas über Nachtpapier bzw. Kamerabild. Nimmt Punkte von Maus/Touch
// (Bildschirm-Modus) oder vom Stift-Automaten (Luft-Modus) entgegen. Striche in CSS-Pixeln.
import { inkLength } from '../core/raster.js';
import { rgba, Particles, reducedMotion } from './ink.js';

export class Stage {
  constructor(el, { onStrokeStart, onStrokeEnd, onPoint } = {}) {
    this.el = el;
    this.canvas = el.querySelector('canvas.ink');
    this.ctx = this.canvas.getContext('2d');
    this.layer = document.createElement('canvas'); // fertige Striche (Cache)
    this.lctx = this.layer.getContext('2d');
    this.cb = { onStrokeStart, onStrokeEnd, onPoint };
    this.strokes = []; this.widths = []; this.active = null; this.activeW = null;
    this.color = '#FFC857'; this.baseWidth = 7; this.enabled = false; this.pointerOn = false;
    this.cursor = null; this.sparks = new Particles(); this.shift = 0; this.ghosts = [];
    this.twitch = 0; this.frozen = false; this.lastT = performance.now(); this.version = 0;
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(el);
    this.resize();
    this._bindPointer();
  }
  get size() { return { w: this.w, h: this.h }; }
  resize() {
    const r = this.el.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = dpr;
    for (const c of [this.canvas, this.layer]) { c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr); }
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    this._rebuildLayer();
  }
  setColor(c) { this.color = c; this._rebuildLayer(); }
  /** Stiftbreite relativ zur Bühne */
  get penWidth() { return Math.max(4, Math.min(11, Math.min(this.w, this.h) / 70)); }
  clear() { this.strokes = []; this.widths = []; this.active = null; this.activeW = null; this.version++; this._rebuildLayer(); }
  inkLength() { return inkLength(this.active ? [...this.strokes, this.active] : this.strokes); }
  /** Alle Striche inkl. laufendem (Kopie) */
  allStrokes() { const all = this.active && this.active[0].length ? [...this.strokes, this.active] : this.strokes; return all.map((s) => [s[0].slice(), s[1].slice(), s[2].slice()]); }

  beginStroke(x, y, t = performance.now()) {
    if (!this.enabled) return;
    if (this.active) this.endStroke(t);
    this.active = [[x], [y], [t]]; this.activeW = [this.penWidth];
    this.cursor = { x, y, state: 'draw' };
    this.version++;
    this.cb.onStrokeStart?.(x, y, t);
  }
  addPoint(x, y, t = performance.now()) {
    if (!this.active) return;
    const [xs, ys, ts] = this.active; const n = xs.length;
    const d = Math.hypot(x - xs[n - 1], y - ys[n - 1]);
    this.cursor = { x, y, state: 'draw' };
    if (d < 2.5) return; // Mindestabstand
    const dt = Math.max(1, t - ts[n - 1]); const v = d / dt; // px/ms
    const w = this.penWidth * Math.max(0.55, Math.min(1.35, 1.3 - v * 0.35)); // Strichbreite folgt Tempo
    const prevW = this.activeW[n - 1];
    xs.push(x); ys.push(y); ts.push(t); this.activeW.push(prevW * 0.6 + w * 0.4);
    this.version++;
    if (!reducedMotion() && Math.random() < 0.55) this.sparks.emit(1, () => ({ x, y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.7) * 90, g: 160, life: 0.35 + Math.random() * 0.3, max: 0.6, size: 1.4 + Math.random() * 1.8, color: Math.random() < 0.5 ? '#FFF6D8' : this.color }));
    this.cb.onPoint?.(x, y, t, v);
  }
  /** cutMs: letzte Millisekunden abschneiden (Luft-Modus) */
  endStroke(t = performance.now(), cutMs = 0) {
    if (!this.active) return;
    let [xs, ys, ts] = this.active; let ws = this.activeW;
    if (cutMs > 0 && ts.length > 2) {
      const lim = ts[ts.length - 1] - cutMs; let k = ts.length; while (k > 1 && ts[k - 1] > lim) k--;
      k = Math.max(1, k); xs = xs.slice(0, k); ys = ys.slice(0, k); ts = ts.slice(0, k); ws = ws.slice(0, k);
    }
    const s = [xs, ys, ts];
    this.active = null; this.activeW = null;
    if (this.cursor) this.cursor.state = 'hover';
    if (xs.length) { this.strokes.push(s); this.widths.push(ws); this._drawStroke(this.lctx, s, ws, true); }
    this.version++;
    this.cb.onStrokeEnd?.(s, t);
  }
  setCursor(x, y, state) { this.cursor = x == null ? null : { x, y, state }; }
  pulse() { this.twitch = 1; }

  _bindPointer() {
    const c = this.canvas; let id = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => {
      if (!this.enabled || !this.pointerOn || id !== null) return;
      id = e.pointerId; try { c.setPointerCapture(id); } catch {}
      const [x, y] = pos(e); this.beginStroke(x, y, e.timeStamp || performance.now()); e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) { if (this.pointerOn && e.pointerType === 'mouse' && this.enabled) { const [x, y] = pos(e); this.cursor = { x, y, state: 'hover' }; } return; }
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ce of evs.length ? evs : [e]) { const [x, y] = pos(ce); this.addPoint(x, y, ce.timeStamp || performance.now()); }
    });
    const up = (e) => { if (e.pointerId !== id) return; id = null; this.endStroke(e.timeStamp || performance.now()); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && id === null) this.cursor = null; });
  }

  _drawStroke(ctx, [xs, ys], ws, cached) {
    const n = xs.length; if (!n) return;
    const color = this.color, dpr = this.dpr;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const avg = ws.reduce((a, b) => a + b, 0) / ws.length;
    const path = () => { ctx.beginPath(); ctx.moveTo(xs[0], ys[0]); if (n === 1) ctx.lineTo(xs[0] + 0.1, ys[0]); for (let i = 1; i < n; i++) { const mx = (xs[i - 1] + xs[i]) / 2, my = (ys[i - 1] + ys[i]) / 2; ctx.quadraticCurveTo(xs[i - 1], ys[i - 1], mx, my); } ctx.lineTo(xs[n - 1], ys[n - 1]); };
    // Halo
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color; ctx.shadowBlur = avg * 2.6; ctx.strokeStyle = rgba(color, 0.2); ctx.lineWidth = avg * 3.4; path(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
    // Farbsaum + Kern mit variabler Breite
    for (const [col, k] of [[color, 1.25], ['#FFFBEF', 0.45]]) {
      ctx.strokeStyle = col;
      if (n === 1) { ctx.lineWidth = ws[0] * k; ctx.beginPath(); ctx.moveTo(xs[0], ys[0]); ctx.lineTo(xs[0] + 0.1, ys[0]); ctx.stroke(); continue; }
      for (let i = 1; i < n; i++) { ctx.lineWidth = Math.max(1, ws[i] * k); ctx.beginPath(); ctx.moveTo(xs[i - 1], ys[i - 1]); ctx.lineTo(xs[i], ys[i]); ctx.stroke(); }
    }
    ctx.restore();
  }
  _rebuildLayer() {
    this.lctx.setTransform(1, 0, 0, 1, 0, 0); this.lctx.clearRect(0, 0, this.layer.width, this.layer.height);
    this.strokes.forEach((s, i) => this._drawStroke(this.lctx, s, this.widths[i] || s[0].map(() => this.penWidth), true));
  }
  /** Pro Frame aufrufen */
  render(now = performance.now()) {
    const dt = Math.min(0.05, (now - this.lastT) / 1000); this.lastT = now;
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    if (this.twitch > 0) { const k = this.twitch; ctx.translate((Math.random() - 0.5) * 5 * k * dpr, (Math.random() - 0.5) * 5 * k * dpr); this.twitch = Math.max(0, k - dt * 5); }
    if (this.shift) ctx.translate(this.shift * dpr, 0);
    ctx.drawImage(this.layer, 0, 0);
    if (this.active) this._drawStroke(ctx, this.active, this.activeW, false);
    ctx.restore();
    this.sparks.update(dt);
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'lighter'; this.sparks.draw(ctx); ctx.restore();
    if (this.cursor && this.enabled) {
      const { x, y, state } = this.cursor;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state === 'draw') { ctx.shadowColor = this.color; ctx.shadowBlur = 18; ctx.fillStyle = '#FFFBEF'; ctx.beginPath(); ctx.arc(x, y, this.penWidth * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = rgba(this.color, 0.9); ctx.beginPath(); ctx.arc(x, y, this.penWidth * 0.45, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,251,239,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, this.penWidth * 1.5, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
  }
  /** Datensatz-/Fixture-Striche (0..255) in die Bühnenmitte abbilden */
  mapFixture(strokes, frac = 0.62) {
    const size = Math.min(this.w, this.h) * frac; const ox = (this.w - size) / 2, oy = (this.h - size) / 2 + this.h * 0.04;
    return strokes.map(([xs, ys]) => [xs.map((x) => ox + (x / 255) * size), ys.map((y) => oy + (y / 255) * size)]);
  }
}
