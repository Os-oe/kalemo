// Teilen-Karten (PNG, 0 €): Heute-Karte spoilerfrei (+ Spoiler-Gate per Klassifikator), Gestern-Karte, Poster.
import { t, word, ART_COLOR, ART_TEXT, LANG_CODE, funnyLine, funnyAllowed } from '../core/i18n.js';
import { drawStrokes } from './ink.js';
import { makeRng } from '../core/raster.js';

const PAPER = '#F7F1E3', INK = '#1E2A3A', PENCIL = '#6B7280', NIGHT = '#13203A';
const fontsReady = () => Promise.all(['700 80px Caveat', '800 40px Nunito', '400 30px Nunito', '600 60px Caveat'].map((f) => document.fonts.load(f, 'ğüşıöçİĞÜŞÖÇäöüß'))).catch(() => {});
const seedOf = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7;

function paper(ctx, W, H, seed = 3) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  const rng = makeRng(seed);
  for (let i = 0; i < W * H / 900; i++) { ctx.fillStyle = `rgba(30,42,58,${0.025 + rng.rnd() * 0.035})`; ctx.fillRect(rng.rnd() * W, rng.rnd() * H, 1.6, 1.6); }
  const g = ctx.createLinearGradient(0, 0, 60, 0); g.addColorStop(0, 'rgba(30,42,58,0.10)'); g.addColorStop(1, 'rgba(30,42,58,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 60, H);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function check(ctx, x, y, s, ok) {
  ctx.save(); ctx.lineWidth = s * 0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ok ? '#15803D' : PENCIL;
  ctx.beginPath();
  if (ok) { ctx.moveTo(x, y + s * 0.5); ctx.quadraticCurveTo(x + s * 0.25, y + s * 0.7, x + s * 0.38, y + s * 0.95); ctx.quadraticCurveTo(x + s * 0.6, y + s * 0.35, x + s, y); }
  else { ctx.moveTo(x + s * 0.1, y + s * 0.1); ctx.lineTo(x + s * 0.9, y + s * 0.9); ctx.moveTo(x + s * 0.9, y + s * 0.1); ctx.lineTo(x + s * 0.1, y + s * 0.9); }
  ctx.stroke(); ctx.restore();
}
const slotColor = (w, r, learn) => (learn !== 'de' ? ART_COLOR.neutral : r.kind === 'plural' ? ART_COLOR.plural : ART_COLOR[w.de.art]);

/** Punkte gleichmäßig entlang der Striche (0..1-Box) */
function resample(strokes, n = 70) {
  const segs = []; let total = 0;
  for (const [xs, ys] of strokes) for (let i = 1; i < xs.length; i++) { const l = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); segs.push([xs[i - 1], ys[i - 1], xs[i], ys[i], l]); total += l; }
  if (!segs.length) return [];
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  for (const [a, b, c, d] of segs) { mx = Math.min(mx, a, c); my = Math.min(my, b, d); Mx = Math.max(Mx, a, c); My = Math.max(My, b, d); }
  const sc = Math.max(Mx - mx, My - my, 1);
  const out = []; let acc = 0, k = 0;
  for (const [a, b, c, d, l] of segs) { while (k < n && acc + l >= (k * total) / n) { const f = l ? ((k * total) / n - acc) / l : 0; out.push([(a + (c - a) * f - mx) / sc, (b + (d - b) * f - my) / sc]); k++; } acc += l; }
  return out;
}

/** Abstrakte Luftspur: Partikel entlang des Pfads, stark verwischt. level = Verwischungsstufe */
export function drawTrail(ctx, strokes, { x, y, w, h, color, seed, level = 1, glow = true }) {
  const pts = resample(strokes, 64); const rng = makeRng(seed);
  const size = Math.min(w, h) * 0.8, ox = x + (w - size) / 2, oy = y + (h - size) / 2;
  const sigma = size * 0.1 * level;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.filter = `blur(${Math.round(5 + 3 * level)}px)`; if (glow) ctx.globalCompositeOperation = 'lighter';
  // Reihenfolge mischen, damit keine Linie entsteht
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rng.rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  for (const [px, py] of pts) for (let k = 0; k < 3; k++) {
    const cx = ox + px * size + rng.gauss() * sigma, cy = oy + py * size + rng.gauss() * sigma;
    ctx.fillStyle = k === 0 ? 'rgba(255,251,239,0.28)' : color + '55';
    ctx.beginPath(); ctx.arc(cx, cy, (3 + rng.rnd() * 7) * (size / 160), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Bild-Ausschnitt → 28×28 wie die Strich-Pipeline (Box 304, Inhalt 256, zentriert) */
function imageToInput(src) {
  const W = src.width, H = src.height, d = src.getContext('2d').getImageData(0, 0, W, H).data;
  let mx = W, my = H, Mx = 0, My = 0; const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const v = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255; lum[i] = v; if (v > 0.12) { const x = i % W, y = (i / W) | 0; mx = Math.min(mx, x); Mx = Math.max(Mx, x); my = Math.min(my, y); My = Math.max(My, y); } }
  const out = new Float32Array(784); if (Mx <= mx) return out;
  const bw = Mx - mx + 1, bh = My - my + 1, s = 256 / Math.max(bw, bh), box = 304;
  const offX = (box - bw * s) / 2, offY = (box - bh * s) / 2;
  const cnt = new Float32Array(784);
  for (let y = my; y <= My; y++) for (let x = mx; x <= Mx; x++) {
    const bx = offX + (x - mx) * s, by = offY + (y - my) * s; const cxI = Math.min(27, Math.floor((bx / box) * 28)), cyI = Math.min(27, Math.floor((by / box) * 28));
    out[cyI * 28 + cxI] += Math.min(1, lum[y * W + x] * 1.6); cnt[cyI * 28 + cxI]++;
  }
  // Fläche je Zelle normieren (Rest der Zelle = Hintergrund)
  const cell = (box / 28 / s) ** 2;
  for (let i = 0; i < 784; i++) out[i] = Math.min(1, out[i] / Math.max(cell, 1));
  return out;
}

/** Spoiler-Gate: Luftspur-Grafik darf das Zielwort nicht in Top-3 haben. Liefert {level, top, ok} */
export async function spoilerGate(clf, id, strokes, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
  for (const level of [1, 1.6, 2.4, 3.4]) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
    drawTrail(ctx, strokes, { x: 0, y: 0, w: 256, h: 256, color, seed: seedOf(id), level });
    const top = (await clf.classifyInput(imageToInput(c))).slice(0, 3).map((x) => x.id);
    if (!top.includes(id)) return { level, top, ok: true };
  }
  return { level: null, top: null, ok: false }; // dann ohne Spur
}

async function toBlob(c) { return new Promise((res) => c.toBlob(res, 'image/png')); }

/** Heute-Karte 1080×1350 (spoilerfrei) */
export async function todayCard(app, sum) {
  await fontsReady();
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const { learn, native } = app.settings; const ui = native;
  paper(ctx, W, H, sum.number * 17);
  ctx.fillStyle = INK; ctx.font = '700 132px Caveat'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Kalemo', 70, 170);
  ctx.textAlign = 'right'; ctx.font = '700 120px Caveat'; ctx.fillText('#' + sum.number, W - 70, 170); ctx.textAlign = 'left';
  const streakN = sum.streak ?? 1;
  ctx.font = '800 46px Nunito'; ctx.fillStyle = INK;
  ctx.fillText(`${LANG_CODE[native]} → ${LANG_CODE[learn]}  ·  ${sum.hits}/5  ·  ${t('streak', { n: streakN }, ui)}`, 72, 250);
  const gates = [];
  const rowH = 180, y0 = 310;
  for (let i = 0; i < 5; i++) {
    const r = sum.results[i]; if (!r) continue; const w = app.byId.get(r.id); const y = y0 + i * rowH;
    const col = slotColor(w, r, learn);
    ctx.fillStyle = col; rr(ctx, 72, y + 20, 120, 120, 26); ctx.fill();
    ctx.fillStyle = NIGHT; rr(ctx, 222, y + 10, 330, 140, 24); ctx.fill();
    const strokes = r.drawings?.length ? r.drawings[0] : r.strokes;
    if (strokes?.length && app.clf) {
      const g = await spoilerGate(app.clf, r.id, strokes, col); gates.push({ id: r.id, ...g });
      if (g.ok) drawTrail(ctx, strokes, { x: 222, y: y + 10, w: 330, h: 140, color: col, seed: seedOf(r.id), level: g.level });
    }
    // Zeitbalken
    const frac = r.result === 'hit' && r.hitAt != null ? Math.max(0.06, Math.min(1, r.hitAt / (r.kind === 'plural' ? 30000 : 20000))) : 1;
    ctx.fillStyle = 'rgba(30,42,58,0.12)'; rr(ctx, 590, y + 66, 300, 28, 14); ctx.fill();
    ctx.fillStyle = r.result === 'hit' ? INK : PENCIL; rr(ctx, 590, y + 66, 300 * frac, 28, 14); ctx.fill();
    check(ctx, 930, y + 44, 72, r.result === 'hit' || (r.parts && r.parts === r.n));
  }
  ctx.fillStyle = PENCIL; ctx.font = '600 58px Caveat'; ctx.fillText(t('tagline', {}, ui), 72, H - 80);
  ctx.textAlign = 'right'; ctx.font = '700 30px Nunito'; ctx.fillText('kalemo.demo.osai.solutions', W - 72, H - 88); ctx.textAlign = 'left';
  const blob = await toBlob(c);
  return { blob, canvas: c, gates, text: t('shareText', { n: sum.number, pair: `${LANG_CODE[native]} → ${LANG_CODE[learn]}`, x: sum.hits, s: streakN }, ui) };
}

/** Gestern-Karte: echte Zeichnungen + lustigster Fehltipp */
export async function yesterdayCard(app, sum) {
  await fontsReady();
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const learn = sum.learn || app.settings.learn, ui = app.settings.native;
  paper(ctx, W, H, sum.number * 29);
  ctx.fillStyle = INK; ctx.font = '700 120px Caveat'; ctx.fillText('Kalemo #' + sum.number, 70, 160);
  ctx.font = '800 40px Nunito'; ctx.fillStyle = PENCIL; ctx.fillText(t('yesterdayCard', {}, ui), 74, 225);
  const cells = [[70, 280], [560, 280], [70, 690], [560, 690], [315, 1000]];
  sum.results.slice(0, 5).forEach((r, i) => {
    const w = app.byId.get(r.id); if (!w) return; const [x, y] = cells[i]; const size = i < 4 ? 450 : 300;
    ctx.fillStyle = '#FFFDF7'; rr(ctx, x, y, size, i < 4 ? 380 : 250, 26); ctx.fill();
    const col = learn === 'de' ? ART_TEXT[r.kind === 'plural' ? 'plural' : w.de.art] : INK;
    const strokes = r.drawings?.length ? r.drawings[0] : r.strokes;
    if (strokes?.length) drawStrokes(ctx, strokes, { style: 'pencil', color: col, width: 7, box: { x: x + 20, y: y + 10, w: size - 40, h: (i < 4 ? 380 : 250) - 80 }, seed: i + 5 });
    ctx.fillStyle = col; ctx.font = `700 ${i < 4 ? 56 : 44}px Caveat`; ctx.textAlign = 'center'; ctx.fillText(word(w, learn), x + size / 2, y + (i < 4 ? 360 : 235)); ctx.textAlign = 'left';
  });
  const f = sum.funniest && app.byId.get(sum.funniest.target) && app.byId.get(sum.funniest.id) && funnyAllowed(sum.funniest.target, sum.funniest.id)
    ? funnyLine(app.byId.get(sum.funniest.target), app.byId.get(sum.funniest.id), ui) : null;
  if (f) { ctx.fillStyle = INK; ctx.font = '700 50px Caveat'; wrap(ctx, f, 540, 1300, 940, 56, true); }
  const blob = await toBlob(c);
  return { blob, canvas: c, text: `Kalemo #${sum.number} · ${f || t('yesterday', {}, ui)}` };
}
function wrap(ctx, text, x, yBottom, maxW, lh, center) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  lines.push(line); ctx.textAlign = center ? 'center' : 'left';
  lines.forEach((l, i) => ctx.fillText(l, x, yBottom - (lines.length - 1 - i) * lh)); ctx.textAlign = 'left';
}

/** Poster 1240×1754: Skizzenbuch-Seite mit eigenen Zeichnungen */
export async function poster(app, entries) {
  await fontsReady();
  const W = 1240, H = 1754, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const { learn, native } = app.settings;
  paper(ctx, W, H, 99);
  ctx.fillStyle = INK; ctx.font = '700 110px Caveat'; ctx.fillText(t('dict', {}, native), 80, 160);
  ctx.font = '700 30px Nunito'; ctx.fillStyle = PENCIL; ctx.fillText(`${LANG_CODE[learn]} · ${LANG_CODE[native]} · ${new Date().toLocaleDateString(native)}`, 84, 215);
  const list = entries.slice(0, 20); const cols = 4, cw = (W - 160) / cols, ch = 360;
  list.forEach((e, i) => {
    const w = app.byId.get(e.id); if (!w) return; const x = 80 + (i % cols) * cw, y = 260 + Math.floor(i / cols) * ch;
    const col = learn === 'de' ? ART_TEXT[w.de.art] : INK;
    drawStrokes(ctx, e.strokes, { style: 'pencil', color: learn === 'de' ? ART_COLOR[w.de.art] : INK, width: 5, box: { x: x + 10, y: y + 6, w: cw - 20, h: ch - 120 }, seed: i + 1 });
    ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.font = '700 46px Caveat'; ctx.fillText(word(w, learn), x + cw / 2, y + ch - 70);
    ctx.fillStyle = PENCIL; ctx.font = '400 28px Nunito'; ctx.fillText(word(w, native), x + cw / 2, y + ch - 32); ctx.textAlign = 'left';
  });
  ctx.fillStyle = INK; ctx.font = '700 64px Caveat'; ctx.textAlign = 'right'; ctx.fillText('Kalemo', W - 80, H - 70);
  ctx.fillStyle = PENCIL; ctx.font = '700 26px Nunito'; ctx.fillText('kalemo.demo.osai.solutions', W - 80, H - 36); ctx.textAlign = 'left';
  return { blob: await toBlob(c), canvas: c };
}
