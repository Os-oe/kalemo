// Die Bühne: Leuchtspur-Canvas über Nachtpapier bzw. Kamerabild. Nimmt Punkte von Maus/Touch
// (Bildschirm-Modus) oder vom Stift-Automaten (Luft-Modus) entgegen. Striche in CSS-Pixeln.
import { inkLength } from '../core/raster.js';
import { rgba, Particles, reducedMotion, drawStrokes } from './ink.js';
const drawStrokesGlow = (ctx, strokes, box, color) => drawStrokes(ctx, strokes, { style: 'glow', color, width: Math.max(2.5, box.w / 60), box });
import { drawPointerSilhouette } from './hands.js';

/** Chaikin-Glättung (nur fürs Zeichnen; Rohdaten bleiben unverändert) */
function chaikin(xs, ys, ws, iter = 2) {
  let X = xs, Y = ys, W = ws;
  for (let k = 0; k < iter && X.length > 2; k++) {
    const nx = [X[0]], ny = [Y[0]], nw = [W[0]];
    for (let i = 0; i < X.length - 1; i++) {
      nx.push(0.75 * X[i] + 0.25 * X[i + 1], 0.25 * X[i] + 0.75 * X[i + 1]);
      ny.push(0.75 * Y[i] + 0.25 * Y[i + 1], 0.25 * Y[i] + 0.75 * Y[i + 1]);
      nw.push(0.75 * W[i] + 0.25 * W[i + 1], 0.25 * W[i] + 0.75 * W[i + 1]);
    }
    nx.push(X[X.length - 1]); ny.push(Y[Y.length - 1]); nw.push(W[W.length - 1]);
    X = nx; Y = ny; W = nw;
  }
  return [X, Y, W];
}

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
  get penWidth() { return Math.max(5.5, Math.min(11, Math.min(this.w, this.h) / 66)); }
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

  _drawStroke(ctx, raw, wsRaw, cached) {
    const [xs, ys, ws] = chaikin(raw[0], raw[1], wsRaw, raw[0].length > 60 ? 1 : 2);
    const n = xs.length; if (!n) return;
    const color = this.color, dpr = this.dpr;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const avg = ws.reduce((a, b) => a + b, 0) / ws.length;
    const path = () => { ctx.beginPath(); ctx.moveTo(xs[0], ys[0]); if (n === 1) ctx.lineTo(xs[0] + 0.1, ys[0]); for (let i = 1; i < n; i++) { const mx = (xs[i - 1] + xs[i]) / 2, my = (ys[i - 1] + ys[i]) / 2; ctx.quadraticCurveTo(xs[i - 1], ys[i - 1], mx, my); } ctx.lineTo(xs[n - 1], ys[n - 1]); };
    // Halo: zwei weiche Schichten statt eines harten Bandes
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = rgba(color, 0.9); ctx.shadowBlur = avg * 4.5; ctx.strokeStyle = rgba(color, 0.07); ctx.lineWidth = avg * 3.8; path(); ctx.stroke();
    ctx.shadowBlur = avg * 1.8; ctx.strokeStyle = rgba(color, 0.16); ctx.lineWidth = avg * 2.1; path(); ctx.stroke();
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
    this._dust(ctx, now, dt);
    ctx.save();
    if (this.twitch > 0) { const k = this.twitch; ctx.translate((Math.random() - 0.5) * 5 * k * dpr, (Math.random() - 0.5) * 5 * k * dpr); this.twitch = Math.max(0, k - dt * 5); }
    if (this.shift) ctx.translate(this.shift * dpr, 0);
    ctx.drawImage(this.layer, 0, 0);
    if (this.active) this._drawStroke(ctx, this.active, this.activeW, false);
    ctx.restore();
    if (this.ghosts.length) this._drawGhosts(ctx, now);
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
  /** Mehrzahl-Runde: fertige Zeichnung gleitet klein an den Rand */
  addGhost(strokes, color) { this.ghosts.push({ strokes, color, born: performance.now(), from: { w: this.w, h: this.h } }); }
  clearGhosts() { this.ghosts = []; }
  _drawGhosts(ctx, now) {
    const dpr = this.dpr, n = this.ghosts.length, size = Math.min(this.w * 0.22, this.h * 0.2, 150);
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ghosts.forEach((g, i) => {
      const k = Math.min(1, (now - g.born) / 450), e = 1 - (1 - k) ** 3;
      const tx = 14 + i * (size + 8), ty = this.h - size - 110;
      const box = { x: this.w * 0.15 * (1 - e) + tx * e, y: this.h * 0.15 * (1 - e) + ty * e, w: this.w * 0.7 * (1 - e) + size * e, h: this.h * 0.7 * (1 - e) + size * e };
      ctx.globalAlpha = 0.55 + 0.45 * (1 - e);
      drawStrokesGlow(ctx, g.strokes, box, g.color);
    });
    ctx.restore();
  }

  /** Ruhe-Bewegung: treibender Lichtstaub + Mal-Hinweis, solange noch nichts gemalt ist */
  _dust(ctx, now, dt) {
    const dpr = this.dpr, reduce = reducedMotion();
    if (!this.dustP) {
      let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      this.dustP = Array.from({ length: 46 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, ph: r() * 6.28 }));
    }
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'lighter';
    const t = now / 1000;
    if (!reduce) { // wandernder Lichtschein über dem Nachtpapier
      const bx = this.w * (0.5 + 0.42 * Math.sin(t * 0.21)), by = this.h * (0.45 + 0.3 * Math.cos(t * 0.17)), R = Math.max(this.w, this.h) * 0.45;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, R); g.addColorStop(0, 'rgba(170,196,255,0.07)'); g.addColorStop(1, 'rgba(170,196,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
    }
    // Glut steigt aus der Leuchtspur
    if (!reduce && this.strokes.length && Math.random() < 0.5) {
      const s = this.strokes[(Math.random() * this.strokes.length) | 0]; const i = (Math.random() * s[0].length) | 0;
      this.sparks.emit(1, () => ({ x: s[0][i] + this.shift, y: s[1][i], vx: (Math.random() - 0.5) * 14, vy: -18 - Math.random() * 26, g: 0, life: 1.4 + Math.random(), max: 2.4, size: 1.2 + Math.random() * 1.6, color: Math.random() < 0.6 ? '#FFF1C9' : this.color }));
    }
    for (const p of this.dustP) {
      const x = ((p.x + (reduce ? 0 : t * 0.006 * p.z)) % 1) * this.w;
      const y = ((p.y + (reduce ? 0 : Math.sin(t * 0.3 + p.ph) * 0.01)) % 1) * this.h;
      const a = 0.05 + 0.1 * p.z * (0.6 + 0.4 * Math.sin(t * 1.3 + p.ph));
      ctx.fillStyle = `rgba(255,236,190,${a})`; ctx.beginPath(); ctx.arc(x, y, 0.8 + p.z * 1.8, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    // Hinweis-Hand: malt eine kleine Schleife, bis der erste Strich kommt
    if (this.enabled && !this.strokes.length && !this.active && this.hintOn !== false) {
      this.enabledAt ??= now;
      const k = (now - this.enabledAt - 2200) / 1000;
      if (k > 0 && !reduce) {
        const cx = this.w / 2, cy = this.h * 0.55, R = Math.min(this.w, this.h) * 0.09;
        const ph = (k % 2.4) / 2.4 * Math.PI * 2;
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = rgba(this.color, 0.35); ctx.lineWidth = 3; ctx.setLineDash([2, 9]); ctx.lineCap = 'round';
        ctx.beginPath(); for (let a = 0; a <= ph; a += 0.12) { const px = cx + Math.sin(a) * R * 1.3, py = cy - Math.sin(a * 2) * R * 0.6; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.stroke();
        const hx = cx + Math.sin(ph) * R * 1.3, hy = cy - Math.sin(ph * 2) * R * 0.6;
        drawPointerSilhouette(ctx, hx, hy, Math.max(0.6, Math.min(1.1, this.h / 700)), { fill: 'rgba(255,251,239,0.10)', stroke: 'rgba(255,251,239,0.45)' });
        ctx.restore();
      }
    } else this.enabledAt = null;
  }

  /** Datensatz-/Fixture-Striche (0..255) in die Bühnenmitte abbilden */
  mapFixture(strokes, frac = 0.62) {
    const size = Math.min(this.w, this.h) * frac; const ox = (this.w - size) / 2, oy = (this.h - size) / 2 + this.h * 0.04;
    return strokes.map(([xs, ys]) => [xs.map((x) => ox + (x / 255) * size), ys.map((y) => oy + (y / 255) * size)]);
  }
}
