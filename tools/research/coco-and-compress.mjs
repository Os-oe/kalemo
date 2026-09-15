import fs from 'node:fs';
import zlib from 'node:zlib';

// ---------- 1) COCO ∩ Quick Draw ----------
const qd = new Set(fs.readFileSync('categories.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
const src = await (await fetch('https://raw.githubusercontent.com/tensorflow/tfjs-models/master/coco-ssd/src/classes.ts')).text().catch(() => '');
let coco = [...src.matchAll(/displayName:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
coco = [...new Set(coco)];
const syn = { motorcycle: 'motorbike', tv: 'television', 'dining table': 'table', 'potted plant': 'house plant', 'teddy bear': 'teddy-bear', 'remote': 'remote control', 'tennis racket': 'tennis racquet', 'sports ball': 'soccer ball|basketball|baseball', 'cake': 'birthday cake|cake', 'hair drier': 'hair dryer', 'traffic light': 'traffic light', 'mouse': 'mouse', 'tie': 'bowtie', 'boat': 'sailboat|speedboat|canoe', 'truck': 'truck|pickup truck', 'bowl': 'bowl', 'wine glass': 'wine glass|wine bottle', 'bottle': 'wine bottle', 'refrigerator': 'refrigerator', 'handbag': 'purse', 'person': 'face', 'cup': 'cup|coffee cup|mug', 'kite': 'kite', 'bench': 'bench' };
const exact = [], mapped = [];
for (const c of coco) {
  if (qd.has(c)) exact.push(c);
  if (syn[c]) { const hits = syn[c].split('|').filter(x => qd.has(x) && x !== c); if (hits.length) mapped.push(`${c}→${hits.join('/')}`); }
}
console.log('COCO classes', coco.length, '| exakt', exact.length, ':', exact.join(', '));
console.log('über Synonym', mapped.length, ':', mapped.join(', '));

// ---------- 2) Duell-Link: Strich-Kompression ----------
const raw = JSON.parse(fs.readFileSync('data/raw.json', 'utf8'));
const simp = JSON.parse(fs.readFileSync('data/simplified.json', 'utf8'));
function rdp(xs, ys, eps) {
  const n = xs.length; if (n < 3) return [xs.slice(), ys.slice()];
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const dx = xs[b] - xs[a], dy = ys[b] - ys[a], L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = L < 1e-6 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) : Math.abs(dy * xs[i] - dx * ys[i] + xs[b] * ys[a] - ys[b] * xs[a]) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  const X = [], Y = []; for (let i = 0; i < n; i++) if (keep[i]) { X.push(xs[i]); Y.push(ys[i]); } return [X, Y];
}
// Google-Pipeline nachgebaut: auf 0..255 skalieren, RDP eps 2
function simplifyRaw(drawing) {
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  for (const [xs, ys] of drawing) { for (const x of xs) { mx = Math.min(mx, x); Mx = Math.max(Mx, x); } for (const y of ys) { my = Math.min(my, y); My = Math.max(My, y); } }
  const s = 255 / Math.max(Mx - mx, My - my, 1);
  return drawing.map(([xs, ys]) => rdp(xs.map(x => Math.round((x - mx) * s)), ys.map(y => Math.round((y - my) * s)), 2));
}
const zz = v => (v << 1) ^ (v >> 31);
function varint(arr, v) { v = zz(v); while (v >= 0x80) { arr.push((v & 0x7f) | 0x80); v >>>= 7; } arr.push(v); }
// Format: [nStrokes] je Strich [nPts][dt_ms/10 dauer] dann Delta-x/y (zigzag varint), Koordinaten optional halbiert (0..127)
function encode(strokes, { half = false, durations = null } = {}) {
  const a = []; varint(a, strokes.length); let px = 0, py = 0;
  strokes.forEach(([xs, ys], si) => { varint(a, xs.length); if (durations) varint(a, Math.round(durations[si] / 20));
    for (let i = 0; i < xs.length; i++) { const x = half ? xs[i] >> 1 : xs[i], y = half ? ys[i] >> 1 : ys[i]; varint(a, x - px); varint(a, y - py); px = x; py = y; } });
  return Buffer.from(a);
}
const b64u = b => b.toString('base64url').length;
const stats = { pts: [], strokes: [], json: [], bin: [], b64: [], defl: [], b64half: [], withTime: [], rawPts: [] };
for (const [w, v] of Object.entries(raw)) for (const d of v.drawings) {
  const s = simplifyRaw(d.drawing);
  const durations = d.drawing.map(st => (st[2]?.at(-1) ?? 0) - (st[2]?.[0] ?? 0));
  stats.rawPts.push(d.drawing.reduce((n, st) => n + st[0].length, 0));
  stats.pts.push(s.reduce((n, st) => n + st[0].length, 0)); stats.strokes.push(s.length);
  stats.json.push(JSON.stringify(s).length);
  const bin = encode(s); stats.bin.push(bin.length); stats.b64.push(b64u(bin));
  stats.defl.push(b64u(zlib.deflateRawSync(bin, { level: 9 })));
  stats.b64half.push(b64u(encode(s, { half: true })));
  stats.withTime.push(b64u(encode(s, { durations })));
}
// Luftzeichnen simuliert: Rohpunkte auf 30-fps-Dichte (alle ~4 Einheiten), Zittern sigma 2, EMA, RDP eps 2 bzw. 3
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const air = { eps2: [], eps3: [], ptsIn: [] };
for (const v of Object.values(simp)) for (const d of v.drawings.slice(0, 20)) {
  let nIn = 0; const mk = eps => d.drawing.map(([xs, ys]) => { const X = [], Y = []; let sx = null, sy = null;
    for (let i = 0; i < xs.length - 1; i++) { const n = Math.max(1, Math.round(Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]) / 4));
      for (let k = 0; k < n; k++) { const nx = xs[i] + (xs[i + 1] - xs[i]) * k / n + gauss() * 2, ny = ys[i] + (ys[i + 1] - ys[i]) * k / n + gauss() * 2;
        sx = sx === null ? nx : 0.5 * sx + 0.5 * nx; sy = sy === null ? ny : 0.5 * sy + 0.5 * ny; X.push(Math.round(Math.max(0, Math.min(255, sx)))); Y.push(Math.round(Math.max(0, Math.min(255, sy)))); } }
    nIn += X.length; return rdp(X, Y, eps); });
  air.eps2.push(b64u(encode(mk(2)))); air.ptsIn.push(nIn); air.eps3.push(b64u(encode(mk(3))));
}
const q =(arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const fmt = k => `median ${q(stats[k], 0.5)} / p90 ${q(stats[k], 0.9)} / max ${Math.max(...stats[k])}`;
console.log(`\nRAW-Datensatz (n=${stats.pts.length}, 6 Kategorien) -> eigene RDP-Vereinfachung`);
for (const k of Object.keys(stats)) console.log(k.padEnd(9), fmt(k));

// Simplified-Datensatz (alle 24 Wörter x 50), fertiges Format
const s2 = { b64: [], b64half: [] };
for (const v of Object.values(simp)) for (const d of v.drawings) { s2.b64.push(b64u(encode(d.drawing))); s2.b64half.push(b64u(encode(d.drawing, { half: true }))); }
console.log(`\nSimplified-Datensatz (n=${s2.b64.length}): b64url ${`median ${q(s2.b64, .5)} / p90 ${q(s2.b64, .9)} / max ${Math.max(...s2.b64)}`} | halbe Aufl. median ${q(s2.b64half, .5)} / p90 ${q(s2.b64half, .9)} / max ${Math.max(...s2.b64half)}`);
console.log(`Luft-Simulation (n=${air.eps2.length}): Eingangspunkte median ${q(air.ptsIn, .5)} | b64url RDP2 median ${q(air.eps2, .5)} / p90 ${q(air.eps2, .9)} / max ${Math.max(...air.eps2)} | RDP3 median ${q(air.eps3, .5)} / p90 ${q(air.eps3, .9)} / max ${Math.max(...air.eps3)}`);
// Duell-Link mit 1 Zeichnung + Wort-ID + Sprachpaar
console.log('Beispiel-URL-Länge (Domain 30 + "#d=" + p90 simplified + 20 Meta):', 30 + 3 + q(s2.b64, .9) + 20);
