// Teilen-Karten (PNG, 0 €): Heute-Karte spoilerfrei (+ Spoiler-Gate per Klassifikator), Gestern-Karte, Poster.
import { t, word, ART_COLOR, ART_TEXT, FRINGE, LANG_CODE, funnyLine, funnyAllowed, quoted } from '../core/i18n.js';
import { drawStrokes } from './ink.js';
import { makeRng } from '../core/raster.js';

const PAPER = '#F7F1E3', INK = '#1E2A3A', PENCIL = '#5F6672', NIGHT = '#13203A';
const fontsReady = () => Promise.all(['700 80px Caveat', '800 40px Nunito', '400 30px Nunito', '600 60px Caveat'].map((f) => document.fonts.load(f, 'ğüşıöçİĞÜŞÖÇäöüß'))).catch(() => {});
const seedOf = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7;

function paper(ctx, W, H, seed = 3) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  const rng = makeRng(seed);
  for (let i = 0; i < W * H / 900; i++) { ctx.fillStyle = `rgba(30,42,58,${0.025 + rng.rnd() * 0.035})`; ctx.fillRect(rng.rnd() * W, rng.rnd() * H, 1.6, 1.6); }
  const g = ctx.createLinearGradient(0, 0, 36, 0); g.addColorStop(0, 'rgba(30,42,58,0.07)'); g.addColorStop(1, 'rgba(30,42,58,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 36, H);
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
  // Funken mit Lichtkreuz
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
  // Fläche je Zelle normieren (Rest der Zelle = Hintergrund)
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

/**
 * Heute-Karte 1080×1350 (Iteration 1, Review P2-1): großes Zitat der lustigsten KI-Rate, genau EINE Zeichnung scharf
 * (die zum Zitat, Buntstift mit Farbsaum), die übrigen als Langzeitbelichtungs-Leuchtspuren auf Navy (Spoiler-Gate
 * je Spur). Ohne lustigen Tipp: alle 5 Spuren abstrakt, keine scharfe Zeichnung. Zeit statt unbeschrifteter Balken.
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
  const fz = sum.funniest && app.byId.get(sum.funniest.target) && app.byId.get(sum.funniest.id) && funnyAllowed(sum.funniest.target, sum.funniest.id) ? sum.funniest : null;
  const heroIdx = fz ? sum.results.findIndex((r) => r.id === fz.target && (r.drawings?.length ? r.drawings[0] : r.strokes)?.length) : -1;
  const quote = heroIdx >= 0 ? funnyLine(app.byId.get(fz.target), app.byId.get(fz.id), ui) : null;
  const trailTile = async (r, i, x, y, w, h) => {
    const wd = app.byId.get(r.id), col = slotColor(wd, r, learn);
    ctx.save(); ctx.shadowColor = 'rgba(30,42,58,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; ctx.fillStyle = NIGHT; rr(ctx, x, y, w, h, 26); ctx.fill(); ctx.restore();
    const strokes = r.drawings?.length ? r.drawings[0] : r.strokes;
    if (strokes?.length && app.clf) {
      const g = await spoilerGate(app.clf, r.id, strokes, col); gates.push({ id: r.id, ...g });
      if (g.ok) drawExposure(ctx, strokes, { x, y, w, h, color: col, seed: seedOf(r.id), level: g.level });
    }
    // Nummer im Farbpunkt (Artikel-Farbe bzw. Gold) + Ergebnis + Zeit (auf dunklem Verlauf, lesbar über der Spur)
    ctx.save(); rr(ctx, x, y, w, h, 26); ctx.clip(); const sg = ctx.createLinearGradient(0, y + h - 64, 0, y + h); sg.addColorStop(0, 'rgba(19,32,58,0)'); sg.addColorStop(1, 'rgba(19,32,58,0.92)'); ctx.fillStyle = sg; ctx.fillRect(x, y + h - 64, w, 64); ctx.restore();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + 34, y + 34, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.font = '800 24px Nunito'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x + 34, y + 43);
    ctx.textAlign = 'right'; ctx.fillStyle = okOf(r) ? '#FFF6D8' : 'rgba(255,251,239,0.6)'; ctx.font = '800 28px Nunito';
    ctx.fillText(secsLabel(r, ui), x + w - 18, y + h - 20); ctx.textAlign = 'left';
    const tw2 = ctx.measureText(secsLabel(r, ui)).width;
    ctx.save(); ctx.strokeStyle = okOf(r) ? '#86EFAC' : 'rgba(255,251,239,0.55)'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    const bx = x + w - 30 - tw2 - 26, by = y + h - 40;
    if (okOf(r)) { ctx.moveTo(bx, by + 11); ctx.lineTo(bx + 8, by + 19); ctx.lineTo(bx + 22, by + 2); } else { ctx.moveTo(bx + 3, by + 3); ctx.lineTo(bx + 19, by + 19); ctx.moveTo(bx + 19, by + 3); ctx.lineTo(bx + 3, by + 19); }
    ctx.stroke(); ctx.restore();
  };
  if (quote) {
    // Zitat groß (Pointe zuerst): kleines Label, Satz in Anführungszeichen, Leuchtmarker unter der letzten Zeile
    ctx.fillStyle = PENCIL; ctx.font = '800 30px Nunito'; ctx.fillText(t('funniest', {}, ui).toLocaleUpperCase(ui), 74, 318);
    ctx.font = '700 74px Caveat';
    const lines = wrapLines(ctx, quoted(quote, ui), 930).slice(0, 3); const lh = 76; const qy = 398;
    const lastW = ctx.measureText(lines[lines.length - 1]).width;
    ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#FFC857'; ctx.lineCap = 'round'; ctx.lineWidth = 26; ctx.beginPath();
    const my = qy + (lines.length - 1) * lh + 4; ctx.moveTo(78, my); ctx.quadraticCurveTo(78 + lastW / 2, my - 10, 72 + lastW, my - 2); ctx.stroke(); ctx.restore();
    ctx.fillStyle = INK; lines.forEach((l, k) => ctx.fillText(l, 72, qy + k * lh));
    // die EINE scharfe Zeichnung (Buntstift mit Farbsaum) auf Papierkarte mit Klebeband
    const r = sum.results[heroIdx], wd = app.byId.get(r.id), strokes = r.drawings?.length ? r.drawings[0] : r.strokes;
    const hx = 250, hy = qy + (lines.length - 1) * lh + 70, hw = 580, hh = Math.min(420, 1000 - (qy + (lines.length - 1) * lh + 70));
    ctx.save(); ctx.translate(hx + hw / 2, hy + hh / 2); ctx.rotate(-0.025); ctx.translate(-(hx + hw / 2), -(hy + hh / 2));
    ctx.save(); ctx.shadowColor = 'rgba(30,42,58,0.28)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10; ctx.fillStyle = '#FFFDF7'; rr(ctx, hx, hy, hw, hh, 22); ctx.fill(); ctx.restore();
    const core = learn === 'de' ? ART_TEXT[r.kind === 'plural' ? 'plural' : wd.de.art] : INK;
    const fringe = learn === 'de' ? FRINGE[r.kind === 'plural' ? 'plural' : wd.de.art] : FRINGE.neutral;
    drawStrokes(ctx, strokes, { style: 'crayon', color: core, fringe, paper: 'rgba(255,253,247,0.6)', width: 11, box: { x: hx + 30, y: hy + 24, w: hw - 60, h: hh - 48 }, seed: 11 });
    check(ctx, hx + hw - 86, hy + 24, 54, okOf(r));
    ctx.restore();
    tape(ctx, hx + 20, hy + 12, 150, -0.6); tape(ctx, hx + hw - 16, hy + hh - 10, 150, -0.6);
    // übrige 4 als Leuchtspuren
    const rest = sum.results.map((x, i) => [x, i]).filter(([, i]) => i !== heroIdx).slice(0, 4);
    const tw = 219, th = 190, gap = (W - 144 - tw * 4) / 3;
    for (let k = 0; k < rest.length; k++) await trailTile(rest[k][0], rest[k][1], 72 + k * (tw + gap), 1040, tw, th);
  } else {
    const tw = 300, th = 250, gapX = (W - 144 - tw * 3) / 2;
    const pos = [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1]];
    for (let i = 0; i < Math.min(5, sum.results.length); i++) await trailTile(sum.results[i], i, 72 + pos[i][0] * (tw + gapX), 320 + pos[i][1] * (th + 40), tw, th);
    ctx.fillStyle = INK; ctx.font = '700 84px Caveat'; ctx.textAlign = 'center'; ctx.fillText(t('aiRecognized', { x: sum.hits }, ui), W / 2, 1010); ctx.textAlign = 'left';
  }
  ctx.fillStyle = PENCIL; ctx.font = '600 54px Caveat'; ctx.fillText(t('tagline', {}, ui), 72, H - 46);
  ctx.textAlign = 'right'; ctx.font = '700 28px Nunito'; ctx.fillText('kalemo.demo.osai.solutions', W - 72, H - 54); ctx.textAlign = 'left';
  const blob = await toBlob(c);
  const head = t('shareText', { n: sum.number, pair: `${LANG_CODE[native]} → ${LANG_CODE[learn]}`, x: sum.hits, s: streakN }, ui);
  return { blob, canvas: c, gates, quote, hero: heroIdx >= 0 ? sum.results[heroIdx].id : null, text: quote ? `${head}\n${quoted(quote, ui)}` : head };
}
function wrapLines(ctx, text, maxW) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  lines.push(line); return lines;
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
    ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.font = `700 ${fs}px Caveat`; ctx.fillText(word(w, learn), x + cw / 2, y + ch - fs2 - 34);
    ctx.fillStyle = PENCIL; ctx.font = `400 ${fs2}px Nunito`; ctx.fillText(word(w, native), x + cw / 2, y + ch - 24); ctx.textAlign = 'left';
  });
  ctx.fillStyle = INK; ctx.font = '700 64px Caveat'; ctx.textAlign = 'right'; ctx.fillText('Kalemo', W - 80, H - 70);
  ctx.fillStyle = PENCIL; ctx.font = '700 26px Nunito'; ctx.fillText('kalemo.demo.osai.solutions', W - 80, H - 36); ctx.textAlign = 'left';
  // Füllgrad (Test): Anteil Zeilen im Rasterbereich mit Tinte
  const d = ctx.getImageData(0, top, W, avail).data; let inked = 0; for (let y = 0; y < avail; y += 8) { let any = false; for (let x = 80; x < W - 80; x += 6) { const k = (y * W + x) * 4; if (d[k] + d[k + 1] + d[k + 2] < 400) { any = true; break; } } if (any) inked++; }
  return { blob: await toBlob(c), canvas: c, tiles, fill: +(inked / Math.ceil(avail / 8)).toFixed(2) };
}
