// Zeichen-Helfer für alle Canvas-Darstellungen: Leuchtspur (Bühne), Buntstift (Skizzenbuch),
// „wird lebendig"-Kategorie-Bewegungen und Line-Boil. Striche: [xs, ys, ts?].
import { bbox } from '../core/raster.js';

const TAU = Math.PI * 2;
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Hex → rgba */
export function rgba(hex, a) {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Deterministisches Rauschen für Line-Boil */
function hash(i, j) { let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

/** Striche in Zielbox einpassen: gibt Transform-Funktion zurück */
export function fitter(strokes, box, padding = 0.12) {
  const b = bbox(strokes);
  if (!isFinite(b.mx)) return { map: (x, y) => [x, y], scale: 1, cx: box.x + box.w / 2, cy: box.y + box.h / 2, bottom: box.y + box.h };
  const w = Math.max(b.w, 1), h = Math.max(b.h, 1);
  const s = Math.min((box.w * (1 - 2 * padding)) / w, (box.h * (1 - 2 * padding)) / h);
  const ox = box.x + (box.w - w * s) / 2 - b.mx * s, oy = box.y + (box.h - h * s) / 2 - b.my * s;
  return { map: (x, y) => [x * s + ox, y * s + oy], scale: s, cx: box.x + box.w / 2, cy: box.y + box.h / 2, bottom: oy + b.My * s };
}

/**
 * Zeichnet Striche.
 * style: 'glow' (Leuchtspur, Nachtbühne) | 'pencil' (Buntstift auf Papier) | 'ink'
 * opts: { color, width, box, boil (0..1), t (s), motion, alive (0..1 Intensität), seed, progress (0..1 Replay), crumble (0..1) }
 */
export function drawStrokes(ctx, strokes, opts = {}) {
  const { color = '#FFC857', width = 6, style = 'glow', box = null, boil = 0, t = 0, motion = null, alive = 0, seed = 1, progress = 1, crumble = 0 } = opts;
  if (!strokes || !strokes.length) return;
  const fit = box ? fitter(strokes, box) : { map: (x, y) => [x, y], scale: 1, cx: 0, cy: 0, bottom: 0 };
  const reduce = reducedMotion();
  const boilFrame = Math.floor(t * 12); // ~12 fps
  const bAmp = reduce ? 0 : boil * Math.max(1, width * 0.28);
  // Punkte vorbereiten (mit Boil + Fortschritt)
  let total = 0; for (const s of strokes) total += s[0].length;
  let budget = Math.max(0, Math.round(total * progress));
  const paths = [];
  for (let si = 0; si < strokes.length && budget > 0; si++) {
    const [xs, ys] = strokes[si]; const n = Math.min(xs.length, budget); budget -= n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      let [x, y] = fit.map(xs[i], ys[i]);
      if (bAmp) { x += (hash(i * 7 + si * 131 + seed, boilFrame) - 0.5) * 2 * bAmp; y += (hash(i * 13 + si * 97 + seed, boilFrame + 999) - 0.5) * 2 * bAmp; }
      if (crumble > 0) { const r = hash(i + si * 50, seed); y += crumble * crumble * (60 + r * 140); x += (r - 0.5) * crumble * 40; }
      pts.push([x, y]);
    }
    paths.push(pts);
  }
  ctx.save();
  if (crumble > 0) ctx.globalAlpha *= Math.max(0, 1 - crumble);
  if (motion && alive > 0 && !reduce) applyMotion(ctx, motion, t, alive, fit, box);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const trace = (pts) => { ctx.beginPath(); if (pts.length === 1) { ctx.moveTo(pts[0][0] - 0.1, pts[0][1]); ctx.lineTo(pts[0][0] + 0.1, pts[0][1]); } else { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2); } const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]); } ctx.stroke(); };
  if (style === 'glow') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(color, 0.22); ctx.lineWidth = width * 3.2; ctx.shadowColor = color; ctx.shadowBlur = width * 2.4;
    paths.forEach(trace);
    ctx.shadowBlur = 0; ctx.strokeStyle = rgba(color, 0.85); ctx.lineWidth = width * 1.25; paths.forEach(trace);
    ctx.strokeStyle = 'rgba(255,252,240,0.95)'; ctx.lineWidth = Math.max(1.2, width * 0.42); paths.forEach(trace);
  } else if (style === 'pencil') {
    // Buntstift: mehrere leicht versetzte, halbtransparente Linien = körnige Textur
    ctx.strokeStyle = rgba(color, 0.55); ctx.lineWidth = width;
    for (let k = 0; k < 3; k++) {
      const dx = (hash(k, seed) - 0.5) * width * 0.5, dy = (hash(k + 9, seed) - 0.5) * width * 0.5;
      ctx.save(); ctx.translate(dx, dy); ctx.lineWidth = width * (0.7 + k * 0.18); ctx.globalAlpha *= 0.55 + 0.15 * k; paths.forEach(trace); ctx.restore();
    }
    ctx.strokeStyle = rgba(color, 0.9); ctx.lineWidth = width * 0.45; paths.forEach(trace);
  } else {
    ctx.strokeStyle = color; ctx.lineWidth = width; paths.forEach(trace);
  }
  ctx.restore();
  return fit;
}

/** Kategorie-Bewegung als Transform um die Zeichnung */
function applyMotion(ctx, motion, t, a, fit, box) {
  const cx = fit.cx, cy = fit.cy, H = box ? box.h : 200, W = box ? box.w : 200;
  const m = typeof motion === 'string' ? motion : motion.kind;
  const id = typeof motion === 'string' ? '' : motion.id || '';
  const p = (t % 1.2) / 1.2;
  switch (m) {
    case 'hop': { const hop = Math.abs(Math.sin(t * Math.PI * 1.6)); const squash = hop < 0.15 ? 1 - (0.15 - hop) * 1.2 : 1; ctx.translate(cx, cy + H * 0.1); ctx.scale(1 / squash, squash); ctx.translate(-cx, -cy - H * 0.1); ctx.translate(Math.sin(t * 1.3) * W * 0.06 * a, -hop * H * 0.14 * a); break; }
    case 'fly': ctx.translate(Math.sin(t * 1.1) * W * 0.08 * a, (Math.sin(t * 2.6) * H * 0.06 - H * 0.04) * a); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 2.6) * 0.08 * a); ctx.translate(-cx, -cy); break;
    case 'swim': ctx.translate(Math.sin(t * 1.4) * W * 0.1 * a, Math.sin(t * 2.8) * H * 0.04 * a); ctx.translate(cx, cy); ctx.rotate(Math.cos(t * 2.8) * 0.12 * a); ctx.translate(-cx, -cy); break;
    case 'drive': { const q = (t % 3) / 3; const x = q < 0.45 ? q / 0.45 * W * 0.9 : q < 0.5 ? W * 0.9 - (q - 0.45) / 0.05 * W * 1.8 : q < 0.95 ? -W * 0.9 + (q - 0.5) / 0.45 * W * 0.9 : 0; ctx.translate(x * a, Math.abs(Math.sin(t * 18)) * -2 * a); break; }
    case 'munch': { const s = 1 + Math.sin(t * 9) * 0.07 * a; ctx.translate(cx, fit.bottom); ctx.scale(1 + (1 - s) * 0.7, s); ctx.rotate(Math.sin(t * 4.5) * 0.05 * a); ctx.translate(-cx, -fit.bottom); break; }
    case 'weather': {
      if (id === 'sun' || id === 'snowflake') { ctx.translate(cx, cy); ctx.rotate(t * (id === 'sun' ? 0.6 : 0.9) * a); ctx.translate(-cx, -cy); }
      else if (id === 'lightning') { ctx.globalAlpha *= 0.55 + 0.45 * (hash(Math.floor(t * 10), 3) > 0.3 ? 1 : 0.2); }
      else { ctx.translate(0, Math.sin(t * 1.5) * H * 0.03 * a); const s = 1 + Math.sin(t * 3) * 0.03 * a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
      break;
    }
    case 'grow': { const g = Math.min(1, 0.55 + p * 0.6); const s = (id ? 1 : 1) * (0.9 + 0.1 * Math.sin(t * 2)) * (a < 1 ? 1 : 1); ctx.translate(cx, fit.bottom); ctx.scale(1 + Math.sin(t * 2) * 0.03 * a, (0.94 + 0.06 * Math.sin(t * 2)) * (a ? 1 : g) * s); ctx.translate(-cx, -fit.bottom); break; }
    case 'music': ctx.translate(Math.sin(t * 40) * 1.8 * a, Math.cos(t * 37) * 1.2 * a); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 3) * 0.05 * a); ctx.translate(-cx, -cy); break;
    case 'glow': ctx.shadowColor = '#FFE9A8'; ctx.shadowBlur = (12 + Math.sin(t * 3) * 8) * a; break;
    case 'wobble': ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 5) * 0.09 * a); ctx.translate(-cx, -cy); break;
    default: { const b = Math.abs(Math.sin(t * Math.PI * 1.4)); const sq = 1 - (b < 0.2 ? (0.2 - b) * 0.8 : 0); ctx.translate(cx, fit.bottom); ctx.scale(2 - sq, sq); ctx.translate(-cx, -fit.bottom); ctx.translate(0, -b * H * 0.08 * a); }
  }
}

/** Partikel neben der Zeichnung (Regen, Noten, Schnee, Konfetti, Funken) */
export class Particles {
  constructor() { this.list = []; }
  emit(n, f) { for (let i = 0; i < n; i++) this.list.push(f(i)); }
  update(dt) {
    for (const p of this.list) { p.life -= dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot || 0) + (p.vr || 0) * dt; }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(ctx) {
    for (const p of this.list) {
      const a = Math.max(0, Math.min(1, p.life / (p.max || 1)));
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      if (p.kind === 'note') { ctx.font = `700 ${p.size}px Caveat, cursive`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.28, p.size * 0.2, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(p.size * 0.22, -p.size * 0.9, 2, p.size * 0.9); }
      else if (p.kind === 'drop') { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, p.size); ctx.stroke(); }
      else if (p.kind === 'rect') { ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else { ctx.beginPath(); ctx.arc(0, 0, p.size * a, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
}
