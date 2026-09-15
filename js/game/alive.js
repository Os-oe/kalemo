// „Wird lebendig": eine Animationsschleife für alle lebenden Zeichnungen (Treffer-Karte, Tagesende, Wörterbuch).
import { drawStrokes, Particles, reducedMotion } from './ink.js';

const items = new Set();
let raf = null;
const W = new WeakMap();

/**
 * mount(canvas, {strokes, color, style, motion:{kind,id}, width, boil, delay})
 * Canvas-Größe wird aus CSS gemessen (DPR-scharf).
 */
// Nur sichtbare Zeichnungen animieren (Wörterbuch mit vielen Einträgen am Handy)
const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => { for (const e of entries) { const it = W.get(e.target); if (it) it.visible = e.isIntersecting; } }, { rootMargin: '80px' }) : null;

export function mount(canvas, opts) {
  const it = { canvas, ctx: canvas.getContext('2d'), opts, t0: performance.now() + (opts.delay || 0), particles: new Particles(), last: performance.now(), visible: true, drawn: false };
  W.set(canvas, it); items.add(it); io?.observe(canvas);
  if (!raf) raf = requestAnimationFrame(loop);
  return it;
}
export function unmountAll(root) { for (const it of [...items]) if (!root || root.contains(it.canvas)) items.delete(it); }

function size(it) {
  const r = it.canvas.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (it.canvas.width !== w || it.canvas.height !== h) { it.canvas.width = w; it.canvas.height = h; }
  return { w, h, dpr };
}

function loop(now) {
  raf = items.size ? requestAnimationFrame(loop) : null;
  const reduce = reducedMotion();
  for (const it of items) {
    if (!it.canvas.isConnected) { items.delete(it); continue; }
    if (it.canvas.offsetParent === null && !it.opts.offscreen) continue;
    if (!it.visible && it.drawn) continue; // außerhalb des Bildschirms: letzten Frame stehen lassen
    it.drawn = true;
    const { w, h, dpr } = size(it); const o = it.opts, ctx = it.ctx;
    const t = Math.max(0, (now - it.t0) / 1000), dt = Math.min(0.05, (now - it.last) / 1000); it.last = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h); }
    const alive = now < it.t0 ? 0 : Math.min(1, t * 2.5);
    const box = { x: 0, y: 0, w, h };
    const progress = o.replay ? Math.min(1, ((t % (o.replay + 1.2)) / o.replay)) : 1; // Leuchtspur entsteht in Schleife
    const fit = drawStrokes(ctx, o.strokes, { style: o.style || 'pencil', color: o.color, fringe: o.fringe, paper: o.paper, padding: o.padding, width: (o.width || 3.2) * dpr * Math.max(0.7, Math.min(1.6, w / (200 * dpr))), box, boil: reduce ? 0 : (o.boil ?? 0.9), t, motion: o.motion, alive: o.still ? 0 : alive, seed: o.seed || 1, progress: reduce ? 1 : progress });
    // Kategorie-Partikel
    if (!reduce && !o.still && alive > 0 && o.motion && fit) particles(it, o.motion, fit, box, dt, dpr);
    it.particles.update(dt); it.particles.draw(ctx);
  }
}

function particles(it, motion, fit, box, dt, dpr) {
  const id = motion.id, kind = motion.kind, P = it.particles, r = Math.random;
  const cx = fit.cx, top = box.h * 0.2, bottom = fit.bottom;
  if (kind === 'weather' && ['cloud', 'rain', 'rainbow'].includes(id) && r() < dt * 22) P.emit(1, () => ({ kind: 'drop', x: cx + (r() - 0.5) * box.w * 0.5, y: box.h * 0.55, vx: 0, vy: 160 * dpr, life: 0.6, max: 0.6, size: 7 * dpr, color: '#3B82F6' }));
  if (kind === 'weather' && id === 'snowman' && r() < dt * 8) P.emit(1, () => ({ x: r() * box.w, y: 0, vx: (r() - 0.5) * 20, vy: 30 * dpr, life: 3, max: 3, size: 2.5 * dpr, color: '#94A3B8' }));
  if (kind === 'music' && r() < dt * 3) P.emit(1, () => ({ kind: 'note', x: cx + (r() - 0.5) * box.w * 0.4, y: top + box.h * 0.2, vx: (r() - 0.5) * 30, vy: -40 * dpr, life: 1.4, max: 1.4, size: 18 * dpr, color: it.opts.color, vr: (r() - 0.5) }));
  if (kind === 'munch' && r() < dt * 2.5) P.emit(3, () => ({ x: cx + (r() - 0.5) * 30 * dpr, y: bottom - 10 * dpr, vx: (r() - 0.5) * 120, vy: -80 - r() * 60, g: 300, life: 0.7, max: 0.7, size: 2.5 * dpr, color: it.opts.color }));
  // Fahrzeug: kleine Fahrtwind-Striche hinter der Zeichnung (Richtung folgt dem Hin-und-her)
  if (kind === 'drive' && r() < dt * 7) { const dir = Math.cos(((performance.now() - it.t0) / 1000) * 1.7) >= 0 ? -1 : 1; P.emit(1, () => ({ kind: 'dash', x: cx + dir * box.w * (0.34 + r() * 0.08), y: box.h * (0.35 + r() * 0.35), vx: dir * 60 * dpr, vy: 0, life: 0.45, max: 0.45, size: (10 + r() * 10) * dpr, color: it.opts.fringe || it.opts.color })); }
  if (kind === 'glow' && r() < dt * 4) P.emit(1, () => ({ x: cx + (r() - 0.5) * box.w * 0.5, y: box.h * (0.3 + r() * 0.4), vx: 0, vy: -10, life: 1.2, max: 1.2, size: 3 * dpr, color: '#FACC15' }));
}

/** Konfetti in Strichfarbe (Treffer) auf einem Overlay-Canvas */
export function confetti(canvas, color, n = 70) {
  const it = { canvas, ctx: canvas.getContext('2d'), opts: { strokes: [], offscreen: true }, t0: performance.now(), particles: new Particles(), last: performance.now() };
  const { w, h, dpr } = size(it);
  const cols = [color, '#FFFBEF', '#FFC857', color];
  it.particles.emit(n, (i) => ({ kind: i % 3 ? 'rect' : undefined, x: w / 2, y: h * 0.45, vx: (Math.random() - 0.5) * 900 * dpr, vy: (-300 - Math.random() * 600) * dpr, g: 1100 * dpr, life: 1.4 + Math.random() * 0.6, max: 2, size: (5 + Math.random() * 6) * dpr, color: cols[i % 4], vr: (Math.random() - 0.5) * 12 }));
  it.opts.draw = true;
  const step = (now) => {
    const dt = Math.min(0.05, (now - it.last) / 1000); it.last = now;
    it.ctx.setTransform(1, 0, 0, 1, 0, 0); it.ctx.clearRect(0, 0, w, h);
    it.particles.update(dt); it.particles.draw(it.ctx);
    if (it.particles.list.length) requestAnimationFrame(step); else it.ctx.clearRect(0, 0, w, h);
  };
  if (!reducedMotion()) requestAnimationFrame(step);
}
