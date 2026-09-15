// Teilen-Karten (PNG, 0 €): Heute-Karte spoilerfrei (+ Spoiler-Gate per Klassifikator), Gestern-Karte, Poster.
import { t, word, ART_COLOR, ART_TEXT, FRINGE, LANG_CODE, funnyLine, funnyQuiz, quoted } from '../core/i18n.js';
import { funnyValid } from '../core/funny.js';
import { planFor } from '../core/plan.js';
import { drawStrokes } from './ink.js';
import { makeRng } from '../core/raster.js';

const PAPER = '#F7F1E3', INK = '#1E2A3A', PENCIL = '#5F6672', NIGHT = '#13203A';
const fontsReady = () => Promise.all(['700 80px Caveat', '800 40px Nunito', '400 30px Nunito', '600 60px Caveat'].map((f) => document.fonts.load(f, 'ğüşıöçİĞÜŞÖÇäöüß'))).catch(() => {});
const seedOf = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7;
const planIdsOf = (app, iso) => (app.words?.length ? planFor(iso, app.words).slots.map((s) => s.id) : []);

function paper(ctx, W, H, seed = 3) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  const rng = makeRng(seed);
  for (let i = 0; i < W * H / 900; i++) { ctx.fillStyle = `rgba(30,42,58,${0.025 + rng.rnd() * 0.035})`; ctx.fillRect(rng.rnd() * W, rng.rnd() * H, 1.6, 1.6); }
  const g = ctx.createLinearGradient(0, 0, 36, 0); g.addColorStop(0, 'rgba(30,42,58,0.07)'); g.addColorStop(1, 'rgba(30,42,58,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 36, H);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
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
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rng.rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  for (const [px, py] of pts) for (let k = 0; k < 3; k++) {
    const cx = ox + px * size + rng.gauss() * sigma, cy = oy + py * size + rng.gauss() * sigma;
    ctx.fillStyle = k === 0 ? 'rgba(255,251,239,0.28)' : color + '55';
    ctx.beginPath(); ctx.arc(cx, cy, (3 + rng.rnd() * 7) * (size / 160), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/**
 * Abstrakte Leuchtspur im Langzeitbelichtungs-Look (Iteration 1, Review P2-1): der eigene Pfad kreist als
 * Lichtspur mehrfach um die Mitte (rotierte, verdrillte Kopien) + Funken — schön, aber Form unkenntlich.
 * level erhöht Kopien + Verdrillung (Spoiler-Gate eskaliert).
 */
export function drawExposure(ctx, strokes, { x, y, w, h, color, seed, level = 1 }) {
  const pts = resample(strokes, 96); const rng = makeRng(seed);
  if (!pts.length) return;
  let mx = 0, my = 0; for (const [px, py] of pts) { mx += px; my += py; } mx /= pts.length; my /= pts.length;
  const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.66;
  const copies = Math.round(3 + level * 2), twist = 0.9 + level * 0.9, rot0 = rng.rnd() * Math.PI * 2;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); bg.addColorStop(0, color + '30'); bg.addColorStop(1, color + '00');
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const n = pts.length;
  const at = (k, i, s = 1) => { const a = rot0 + (k * Math.PI * 2) / copies + twist * (i / n); const px = (pts[i][0] - mx) * R * s, py = (pts[i][1] - my) * R * s; return [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)]; };
  for (let k = 0; k < copies; k++) {
    const s = 0.72 + 0.28 * ((k % 3) / 2);
    const path = () => { ctx.beginPath(); for (let i = 0; i < n; i++) { const [px, py] = at(k, i, s); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } };
    ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.strokeStyle = color + '22'; ctx.lineWidth = 9; path(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = color + '66'; ctx.lineWidth = 2.6; path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,251,239,0.55)'; ctx.lineWidth = 0.9; path(); ctx.stroke();
  }
  for (let i = 0; i < 22; i++) {
    const [px, py] = at(Math.floor(rng.rnd() * copies), Math.floor(rng.rnd() * n), 0.72 + rng.rnd() * 0.28);
    const r = 1 + rng.rnd() * 2.2;
    ctx.fillStyle = 'rgba(255,251,239,0.9)'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    if (i % 4 === 0) { ctx.strokeStyle = 'rgba(255,241,201,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - r * 5, py); ctx.lineTo(px + r * 5, py); ctx.moveTo(px, py - r * 5); ctx.lineTo(px, py + r * 5); ctx.stroke(); }
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
  const cell = (box / 28 / s) ** 2;
  for (let i = 0; i < 784; i++) out[i] = Math.min(1, out[i] / Math.max(cell, 1));
  return out;
}

/** Spoiler-Gate: Luftspur-Grafik darf das Zielwort nicht in Top-3 haben. Liefert {level, top, ok}. draw = Zeichen-Funktion */
export async function spoilerGate(clf, id, strokes, color, draw = drawExposure) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
  for (const level of [1, 1.6, 2.4, 3.4]) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
    draw(ctx, strokes, { x: 0, y: 0, w: 256, h: 256, color, seed: seedOf(id), level });
    const top = (await clf.classifyInput(imageToInput(c))).slice(0, 3).map((x) => x.id);
    if (!top.includes(id)) return { level, top, ok: true };
  }
  return { level: null, top: null, ok: false }; // dann ohne Spur
}

async function toBlob(c) { return new Promise((res) => c.toBlob(res, 'image/png')); }

/** Washi-Tape-Streifen */
function tape(ctx, x, y, w, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = 'rgba(255,200,87,0.62)'; ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3; ctx.fillRect(-w / 2, -16, w, 32); ctx.restore();
}
const secsLabel = (r, ui) => (r.result === 'hit' && r.hitAt != null ? t('secs', { n: Math.max(1, Math.round(r.hitAt / 1000)) }, ui) : '–');
const okOf = (r) => r.result === 'hit' || (r.parts && r.parts === r.n);
/** Text in eine Breite einpassen (Schrift verkleinern), liefert die tatsächliche Breite */
function fitText(ctx, text, maxW, size, weight = 700, family = 'Caveat', min = 18) {
  let s = size; ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return { size: s, w: ctx.measureText(text).width };
}
function wrapLines(ctx, text, maxW) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  lines.push(line); return lines;
}
/** Zitat-Block: Label + Satz in Anführungszeichen + Leuchtmarker; liefert y-Ende */
function quoteBlock(ctx, label, text, y0, W, { size = 70, lh = 74, maxLines = 3 } = {}) {
  ctx.fillStyle = PENCIL; ctx.font = '800 30px Nunito'; ctx.textAlign = 'left'; ctx.fillText(label, 74, y0);
  ctx.font = `700 ${size}px Caveat`;
  const lines = wrapLines(ctx, text, W - 150).slice(0, maxLines); const qy = y0 + size + 10;
  const lastW = ctx.measureText(lines[lines.length - 1]).width;
  ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#FFC857'; ctx.lineCap = 'round'; ctx.lineWidth = 24; ctx.beginPath();
  const my = qy + (lines.length - 1) * lh + 4; ctx.moveTo(78, my); ctx.quadraticCurveTo(78 + lastW / 2, my - 10, 72 + lastW, my - 2); ctx.stroke(); ctx.restore();
  ctx.fillStyle = INK; lines.forEach((l, k) => ctx.fillText(l, 72, qy + k * lh));
  return { bottom: qy + (lines.length - 1) * lh + 22, lines: lines.length };
}

/**
 * Heute-Karte 1080×1350 — Iteration 2 (Spoiler-Entscheidung Punkt 2a): KEINE scharfe Zeichnung. 5 abstrakte Leuchtspuren
 * (Spoiler-Gate je Spur) + Zitat OHNE Zielwort als Neugier-Lücke: „Die KI hielt Wort 3 erst für ein Bein. Was hab ich gemalt?".
 * Der Rateversuch stand wirklich in der Sprechblase und ist nie ein Wort der Tagesskizze (core/funny.js).
 */
export async function todayCard(app, sum) {
  await fontsReady();
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  // gespieltes Paar aus dem Tagesergebnis (auch wenn die Sprachwahl seitdem geändert wurde), Texte in aktueller UI-Sprache
  const learn = sum.learn || app.settings.learn, native = sum.native || app.settings.native; const ui = app.settings.native;
  paper(ctx, W, H, sum.number * 17);
  ctx.fillStyle = INK; ctx.font = '700 132px Caveat'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Kalemo', 70, 160);
  ctx.textAlign = 'right'; ctx.font = '700 120px Caveat'; ctx.fillText('#' + sum.number, W - 70, 160); ctx.textAlign = 'left';
  const streakN = sum.streak ?? 1;
  ctx.font = '800 44px Nunito'; ctx.fillStyle = INK;
  ctx.fillText(`${LANG_CODE[native]} → ${LANG_CODE[learn]}  ·  ${sum.hits}/5  ·  ${t('streak', { n: streakN }, ui)}`, 72, 236);
  const gates = [];
  const exclude = planIdsOf(app, sum.date);
  const fz = sum.funniest && app.byId.get(sum.funniest.target) && app.byId.get(sum.funniest.id) && funnyValid(sum, sum.funniest, exclude) ? sum.funniest : null;
  const qIdx = fz ? (fz.idx ?? sum.results.findIndex((r) => r.id === fz.target)) : -1;
  const quote = fz ? funnyQuiz(qIdx + 1, app.byId.get(fz.id), ui) : null;
  const trailTile = async (r, i, x, y, w, h, mark) => {
    const wd = app.byId.get(r.id), col = slotColor(wd, r, learn);
    ctx.save(); ctx.shadowColor = 'rgba(30,42,58,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; ctx.fillStyle = NIGHT; rr(ctx, x, y, w, h, 26); ctx.fill(); ctx.restore();
    const strokes = r.drawings?.length ? r.drawings[0] : r.strokes;
    if (strokes?.length && app.clf) {
      const g = await spoilerGate(app.clf, r.id, strokes, col); gates.push({ id: r.id, ...g });
      if (g.ok) drawExposure(ctx, strokes, { x, y, w, h, color: col, seed: seedOf(r.id), level: g.level });
    }
    if (mark) { ctx.save(); ctx.strokeStyle = '#FFC857'; ctx.lineWidth = 6; ctx.shadowColor = 'rgba(255,200,87,0.8)'; ctx.shadowBlur = 14; rr(ctx, x - 3, y - 3, w + 6, h + 6, 28); ctx.stroke(); ctx.restore(); }
    ctx.save(); rr(ctx, x, y, w, h, 26); ctx.clip(); const sg = ctx.createLinearGradient(0, y + h - 64, 0, y + h); sg.addColorStop(0, 'rgba(19,32,58,0)'); sg.addColorStop(1, 'rgba(19,32,58,0.92)'); ctx.fillStyle = sg; ctx.fillRect(x, y + h - 64, w, 64); ctx.restore();
    ctx.fillStyle = mark ? '#FFC857' : col; ctx.beginPath(); ctx.arc(x + 34, y + 34, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.font = '800 26px Nunito'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x + 34, y + 43);
    ctx.textAlign = 'right'; ctx.fillStyle = okOf(r) ? '#FFF6D8' : 'rgba(255,251,239,0.6)'; ctx.font = '800 28px Nunito';
    ctx.fillText(secsLabel(r, ui), x + w - 18, y + h - 20); ctx.textAlign = 'left';
    const tw2 = ctx.measureText(secsLabel(r, ui)).width;
    ctx.save(); ctx.strokeStyle = okOf(r) ? '#86EFAC' : 'rgba(255,251,239,0.55)'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    const bx = x + w - 30 - tw2 - 26, by = y + h - 40;
    if (okOf(r)) { ctx.moveTo(bx, by + 11); ctx.lineTo(bx + 8, by + 19); ctx.lineTo(bx + 22, by + 2); } else { ctx.moveTo(bx + 3, by + 3); ctx.lineTo(bx + 19, by + 19); ctx.moveTo(bx + 19, by + 3); ctx.lineTo(bx + 3, by + 19); }
    ctx.stroke(); ctx.restore();
  };
  let y0 = 300;
  if (quote) y0 = quoteBlock(ctx, t('funniest', {}, ui).toLocaleUpperCase(ui), quoted(quote, ui), 318, W).bottom + 30;
  const n = Math.min(5, sum.results.length), tw = 300, th = quote ? Math.min(250, Math.floor((1160 - y0 - 28) / 2)) : 250, gapX = (W - 144 - tw * 3) / 2;
  const pos = [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1]];
  for (let i = 0; i < n; i++) await trailTile(sum.results[i], i, 72 + pos[i][0] * (tw + gapX), y0 + pos[i][1] * (th + 28), tw, th, i === qIdx);
  ctx.fillStyle = INK; ctx.font = '700 80px Caveat'; ctx.textAlign = 'center'; ctx.fillText(t('aiRecognized', { x: sum.hits }, ui), W / 2, Math.min(H - 120, y0 + 2 * th + 28 + 92)); ctx.textAlign = 'left';
  ctx.fillStyle = PENCIL; ctx.font = '600 54px Caveat'; ctx.fillText(t('tagline', {}, ui), 72, H - 46);
  ctx.textAlign = 'right'; ctx.font = '700 28px Nunito'; ctx.fillText('kalemo.demo.osai.solutions', W - 72, H - 54); ctx.textAlign = 'left';
  const blob = await toBlob(c);
  const head = t('shareText', { n: sum.number, pair: `${LANG_CODE[native]} → ${LANG_CODE[learn]}`, x: sum.hits, s: streakN }, ui);
  return { blob, canvas: c, gates, quote, hero: null, quoteIdx: qIdx >= 0 ? qIdx : null, text: quote ? `${head}\n${quoted(quote, ui)}` : head };
}

/** Raster für 1–5 Kacheln ohne Überlappung: ≤3 eine Reihe, 4 = 2+2, 5 = 3+2 (letzte Reihe mittig) */
export function gridLayout(n, { x0 = 72, y0 = 300, W = 1080, bottom = 1230, gap = 24, ratio = 1.15 } = {}) {
  const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3, rows = Math.ceil(n / cols);
  const tw = Math.floor((W - 2 * x0 - gap * (cols - 1)) / cols);
  const th = Math.floor(Math.min(tw * ratio, (bottom - y0 - gap * (rows - 1)) / rows));
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - row * cols : cols;
    const off = ((cols - inRow) * (tw + gap)) / 2;
    out.push({ x: x0 + off + (i % cols) * (tw + gap), y: y0 + row * (th + gap), w: tw, h: th });
  }
  return out;
}

/**
 * Gestern-Karte — Iteration 2 (Punkt 2b + R2-P2-7): die scharfen, großen Zeichnungen mit Wort + Zitat MIT Wort
 * („Die KI dachte bei meinem Haus erst an ein Bein"). Am Folgetag ist das kein Spoiler mehr — außer ein Wort steht
 * auch in der HEUTIGEN Tagesskizze (z. B. Wiederholung): diese Kachel bleibt abstrakt und unbenannt.
 */
export async function yesterdayCard(app, sum) {
  await fontsReady();
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const learn = sum.learn || app.settings.learn, ui = app.settings.native;
  const todayIds = planIdsOf(app, app.today());
  paper(ctx, W, H, sum.number * 29);
  ctx.fillStyle = INK; ctx.font = '700 120px Caveat'; ctx.textAlign = 'left'; ctx.fillText('Kalemo #' + sum.number, 70, 150);
  ctx.font = '800 40px Nunito'; ctx.fillStyle = PENCIL; ctx.fillText(t('yesterdayCard', {}, ui), 74, 214);
  const f = sum.funniest && app.byId.get(sum.funniest.target) && app.byId.get(sum.funniest.id) && funnyValid(sum, sum.funniest, todayIds) ? sum.funniest : null;
  let quote = null;
  if (f) {
    const fIdx = f.idx ?? sum.results.findIndex((r) => r.id === f.target);
    quote = todayIds.includes(f.target) ? funnyQuiz(fIdx + 1, app.byId.get(f.id), ui) : funnyLine(app.byId.get(f.target), app.byId.get(f.id), ui);
  }
  let y0 = 262; let quoteRect = null;
  if (quote) { const q = quoteBlock(ctx, t('funniest', {}, ui).toLocaleUpperCase(ui), quoted(quote, ui), 280, W, { size: 58, lh: 62, maxLines: 2 }); quoteRect = { x: 60, y: 250, w: W - 120, h: q.bottom - 250 }; y0 = q.bottom + 24; }
  const results = sum.results.slice(0, 5).filter((r) => app.byId.get(r.id));
  const cells = gridLayout(results.length, { y0, bottom: H - 120 });
  const tiles = [];
  results.forEach((r, i) => {
    const w = app.byId.get(r.id), { x, y, w: tw, h: th } = cells[i];
    const hide = todayIds.includes(r.id);
    const col = learn === 'de' ? ART_TEXT[r.kind === 'plural' ? 'plural' : w.de.art] : INK;
    const capH = Math.round(Math.min(78, th * 0.2));
    ctx.save(); ctx.shadowColor = 'rgba(30,42,58,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; ctx.fillStyle = hide ? NIGHT : '#FFFDF7'; rr(ctx, x, y, tw, th, 24); ctx.fill(); ctx.restore();
    const strokes = r.drawings?.length ? r.drawings[0] : r.strokes;
    const box = { x: x + 16, y: y + 12, w: tw - 32, h: th - capH - 18 };
    if (strokes?.length) {
      if (hide) drawExposure(ctx, strokes, { ...box, color: slotColor(w, r, learn), seed: seedOf(r.id), level: 3.4 });
      else drawStrokes(ctx, strokes, { style: 'crayon', color: col, fringe: learn === 'de' ? FRINGE[r.kind === 'plural' ? 'plural' : w.de.art] : FRINGE.neutral, paper: 'rgba(255,253,247,0.6)', width: Math.max(6, Math.min(11, tw / 34)), box, seed: i + 5 });
    }
    const label = hide ? '?' : word(w, learn);
    const fit = fitText(ctx, label, tw - 28, Math.round(capH * 0.78));
    ctx.fillStyle = hide ? '#FFF6D8' : col; ctx.textAlign = 'center'; ctx.fillText(label, x + tw / 2, y + th - Math.round(capH * 0.32)); ctx.textAlign = 'left';
    tiles.push({ id: r.id, hidden: hide, x, y, w: tw, h: th, box, cap: { x: x + tw / 2 - fit.w / 2, y: y + th - capH, w: fit.w, h: capH }, label });
  });
  ctx.fillStyle = PENCIL; ctx.font = '600 54px Caveat'; ctx.textAlign = 'left'; ctx.fillText(t('tagline', {}, ui), 72, H - 46);
  ctx.textAlign = 'right'; ctx.font = '700 28px Nunito'; ctx.fillText('kalemo.demo.osai.solutions', W - 72, H - 54); ctx.textAlign = 'left';
  const blob = await toBlob(c);
  return { blob, canvas: c, tiles, quote, quoteRect, text: `Kalemo #${sum.number} · ${quote || t('yesterday', {}, ui)}` };
}

/** Poster 1240×1754: Skizzenbuch-Seite mit eigenen Zeichnungen */
export async function poster(app, entries) {
  await fontsReady();
  const W = 1240, H = 1754, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const { learn, native } = app.settings;
  paper(ctx, W, H, 99);
  ctx.fillStyle = INK; ctx.font = '700 110px Caveat'; ctx.fillText(t('dict', {}, native), 80, 160);
  ctx.font = '700 30px Nunito'; ctx.fillStyle = PENCIL; ctx.fillText(`${LANG_CODE[learn]} · ${LANG_CODE[native]} · ${new Date().toLocaleDateString(native)}`, 84, 215);
  // Review P3-6: Raster passt sich der Wortzahl an (große Kacheln bei wenigen Wörtern, Seite immer gefüllt)
  const list = entries.slice(0, 20), n = Math.max(1, list.length), tiles = [];
  const cols = n === 1 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4, rows = Math.ceil(n / cols);
  const top = 262, avail = H - 150 - top, cw = (W - 160) / cols, ch = Math.min(avail / rows, cw * 1.25);
  const y0 = top + (avail - ch * rows) / 2, fs = Math.round(Math.max(44, Math.min(96, cw * 0.15))), fs2 = Math.round(Math.max(26, Math.min(44, cw * 0.075)));
  list.forEach((e, i) => {
    const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - row * cols : cols; // unvollständige letzte Zeile mittig
    const w = app.byId.get(e.id); if (!w) return; const x = 80 + (i % cols) * cw + ((cols - inRow) * cw) / 2, y = y0 + row * ch;
    const col = learn === 'de' ? ART_TEXT[w.de.art] : INK;
    ctx.fillStyle = 'rgba(255,253,247,0.75)'; rr(ctx, x + 8, y + 8, cw - 16, ch - 16, 22); ctx.fill();
    const box = { x: x + 20, y: y + 16, w: cw - 40, h: ch - fs - fs2 - 60 }; tiles.push({ id: e.id, ...box });
    drawStrokes(ctx, e.strokes, { style: 'crayon', color: col, fringe: learn === 'de' ? FRINGE[w.de.art] : FRINGE.neutral, paper: 'rgba(255,253,247,0.6)', width: Math.max(5, Math.min(12, cw / 55)), box, seed: i + 1 });
    ctx.textAlign = 'center'; ctx.fillStyle = col; fitText(ctx, word(w, learn), cw - 40, fs); ctx.fillText(word(w, learn), x + cw / 2, y + ch - fs2 - 34);
    ctx.fillStyle = PENCIL; fitText(ctx, word(w, native), cw - 40, fs2, 400, 'Nunito', 14); ctx.fillText(word(w, native), x + cw / 2, y + ch - 24); ctx.textAlign = 'left';
  });
  ctx.fillStyle = INK; ctx.font = '700 64px Caveat'; ctx.textAlign = 'right'; ctx.fillText('Kalemo', W - 80, H - 70);
  ctx.fillStyle = PENCIL; ctx.font = '700 26px Nunito'; ctx.fillText('kalemo.demo.osai.solutions', W - 80, H - 36); ctx.textAlign = 'left';
  // Füllgrad (Test): Anteil Zeilen im Rasterbereich mit Tinte
  const d = ctx.getImageData(0, top, W, avail).data; let inked = 0; for (let y = 0; y < avail; y += 8) { let any = false; for (let x = 80; x < W - 80; x += 6) { const k = (y * W + x) * 4; if (d[k] + d[k + 1] + d[k + 2] < 400) { any = true; break; } } if (any) inked++; }
  return { blob: await toBlob(c), canvas: c, tiles, fill: +(inked / Math.ceil(avail / 8)).toFixed(2) };
}
