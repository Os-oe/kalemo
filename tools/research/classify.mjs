// Top-1/Top-3 für DoodleNet (tfjs) und quickdraw-mobilevit-small (ONNX quantized) auf echten Quick-Draw-Zeichnungen.
// Varianten: clean | noisy (Hand-Tracking-Zittern simuliert) | noisy+connected (kein Stift-hoch erkannt)
import fs from 'node:fs';
import * as tf from '@tensorflow/tfjs';
import ort from 'onnxruntime-node';

const data = JSON.parse(fs.readFileSync('data/simplified.json', 'utf8'));
const WORDS = Object.keys(data);

// ---------- Rasterizer (nachgebaut nach dem cairo-Snippet der Quick-Draw-Autoren: line 16, padding 16, zentriert) ----------
function raster(strokes, side = 28, SS = 8) {
  const S = side * SS, orig = 256, lineD = 16, pad = 16;
  const totalPad = pad * 2 + lineD, scale = S / (orig + totalPad);
  let maxX = 0, maxY = 0;
  for (const [xs, ys] of strokes) { for (const x of xs) maxX = Math.max(maxX, x); for (const y of ys) maxY = Math.max(maxY, y); }
  const offX = (orig - maxX) / 2, offY = (orig - maxY) / 2;
  const hi = new Uint8Array(S * S), r = (lineD / 2) * scale, r2 = r * r;
  const P = (x, y) => [(x + offX + totalPad / 2) * scale, (y + offY + totalPad / 2) * scale];
  for (const [xs, ys] of strokes) {
    const pts = xs.map((x, i) => P(x, ys[i]));
    if (pts.length === 1) pts.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let t = ((px - ax) * dx + (py - ay) * dy) / L; t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx - px, qy = ay + t * dy - py;
        if (qx * qx + qy * qy <= r2) hi[y * S + x] = 1;
      }
    }
  }
  const out = new Float32Array(side * side);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (hi[y * S + x]) out[((y / SS) | 0) * side + ((x / SS) | 0)] += 1 / (SS * SS);
  return out; // 0 = Hintergrund, 1 = Strich
}

// ---------- Simulation Luftzeichnen ----------
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
function densify(xs, ys, step = 4) { // Zwischenpunkte wie bei 30-fps-Tracking
  const X = [], Y = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const d = Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]), n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k++) { X.push(xs[i] + (xs[i + 1] - xs[i]) * k / n); Y.push(ys[i] + (ys[i + 1] - ys[i]) * k / n); }
  }
  X.push(xs.at(-1)); Y.push(ys.at(-1)); return [X, Y];
}
function noisy(strokes, sigma) { // Zittern + niederfrequente Drift, danach leichtes Glätten (EMA wie One-Euro light)
  return strokes.map(([xs, ys]) => {
    const [X, Y] = densify(xs, ys);
    let dx = 0, dy = 0, sx = null, sy = null; const NX = [], NY = [];
    for (let i = 0; i < X.length; i++) {
      dx = 0.9 * dx + gauss() * sigma * 0.3; dy = 0.9 * dy + gauss() * sigma * 0.3;
      const nx = X[i] + dx + gauss() * sigma, ny = Y[i] + dy + gauss() * sigma;
      sx = sx === null ? nx : 0.5 * sx + 0.5 * nx; sy = sy === null ? ny : 0.5 * sy + 0.5 * ny;
      NX.push(Math.max(0, Math.min(255, sx))); NY.push(Math.max(0, Math.min(255, sy)));
    }
    return [NX, NY];
  });
}
const connect = (strokes) => [[strokes.flatMap(s => s[0]), strokes.flatMap(s => s[1])]];
function renorm(strokes) { // wieder auf 0..255 oben links ausrichten wie im Datensatz
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  for (const [xs, ys] of strokes) { for (const x of xs) { mx = Math.min(mx, x); Mx = Math.max(Mx, x); } for (const y of ys) { my = Math.min(my, y); My = Math.max(My, y); } }
  const s = 255 / Math.max(Mx - mx, My - my, 1);
  return strokes.map(([xs, ys]) => [xs.map(x => (x - mx) * s), ys.map(y => (y - my) * s)]);
}

// ---------- Modelle ----------
const dnJson = JSON.parse(fs.readFileSync('models/doodlenet/model.json', 'utf8'));
const dnBin = fs.readFileSync('models/doodlenet/group1-shard1of1.bin');
const dn = await tf.loadLayersModel(tf.io.fromMemory({
  modelTopology: dnJson.modelTopology, weightSpecs: dnJson.weightsManifest[0].weights,
  weightData: dnBin.buffer.slice(dnBin.byteOffset, dnBin.byteOffset + dnBin.byteLength),
}));
const dnClasses = fs.readFileSync('models/doodlenet/class_names.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const mvCfg = JSON.parse(fs.readFileSync('models/mobilevit/config.json', 'utf8'));
const mvClasses = Object.keys(mvCfg.id2label).sort((a, b) => a - b).map(k => mvCfg.id2label[k]);
const mv = await ort.InferenceSession.create('models/mobilevit/model.onnx');
const mvIn = mv.inputNames[0], mvOut = mv.outputNames[0];

function topk(arr, k) { return [...arr.keys()].sort((a, b) => arr[b] - arr[a]).slice(0, k); }

async function runDoodleNet(bitmaps, mode) {
  const n = bitmaps.length, buf = new Float32Array(n * 784);
  bitmaps.forEach((b, i) => buf.set(mode === 'binary' ? b.map(v => (v >= 0.5 ? 1 : 0)) : b, i * 784));
  const t0 = performance.now();
  const probs = tf.tidy(() => dn.predict(tf.tensor4d(buf, [n, 28, 28, 1])).arraySync());
  return { preds: probs.map(p => topk(p, 3).map(i => dnClasses[i])), ms: (performance.now() - t0) / n };
}
async function runMobileViT(bitmaps, invert) {
  const preds = []; const t0 = performance.now();
  for (const b of bitmaps) { // Batch 1 (sicher bzgl. fixer Batch-Dim)
    const x = new Float32Array(784); for (let i = 0; i < 784; i++) x[i] = invert ? 1 - b[i] : b[i];
    const out = await mv.run({ [mvIn]: new ort.Tensor('float32', x, [1, 1, 28, 28]) });
    preds.push(topk(Array.from(out[mvOut].data), 3).map(i => mvClasses[i]));
  }
  return { preds, ms: (performance.now() - t0) / bitmaps.length };
}

function rdp(xs, ys, eps) { // Ramer-Douglas-Peucker wie im Quick-Draw-"simplified"-Datensatz (eps 2.0)
  const keep = new Uint8Array(xs.length); keep[0] = keep[xs.length - 1] = 1;
  const st = [[0, xs.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1;
    const dx = xs[b] - xs[a], dy = ys[b] - ys[a], L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * xs[i] - dx * ys[i] + xs[b] * ys[a] - ys[b] * xs[a]) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  const X = [], Y = []; for (let i = 0; i < xs.length; i++) if (keep[i]) { X.push(xs[i]); Y.push(ys[i]); } return [X, Y];
}
const simplify = (strokes, eps) => strokes.map(([xs, ys]) => rdp(xs, ys, eps));
const VSET = process.env.VSET || 'base';
const variants = VSET === 'sweep' ? {
  'connected(no noise)': d => connect(d.drawing),
  'noise s1': d => renorm(noisy(d.drawing, 1)),
  'noise s2': d => renorm(noisy(d.drawing, 2)),
  'noise s3': d => renorm(noisy(d.drawing, 3)),
  'noise s3 + RDP4': d => simplify(renorm(noisy(d.drawing, 3)), 4),
  'noise s5': d => renorm(noisy(d.drawing, 5)),
  'noise s5 + RDP6': d => simplify(renorm(noisy(d.drawing, 5)), 6),
  'noise s3 + connected + RDP4': d => simplify(renorm(connect(noisy(d.drawing, 3))), 4),
} : {
  clean: d => d.drawing,
  noisy: d => renorm(noisy(d.drawing, 5)),
  'noisy+connected': d => renorm(connect(noisy(d.drawing, 5))),
};
if (VSET === 'sweep') for (const w of WORDS) data[w].drawings = data[w].drawings.slice(0, 25);
const results = {};
for (const [vname, fn] of Object.entries(variants)) {
  const items = []; for (const w of WORDS) for (const d of data[w].drawings) items.push({ w, bmp: raster(fn(d)), recog: d.recognized });
  const bm = items.map(i => i.bmp);
  const runs = {
    'DoodleNet/gray': await runDoodleNet(bm, 'gray'),
    ...(VSET === 'sweep' ? {} : { 'DoodleNet/binary': await runDoodleNet(bm, 'binary') }),
    'MobileViT-fp32': await runMobileViT(bm, false),
  };
  // Ensemble: Wahrscheinlichkeiten nicht verfügbar -> einfache Rang-Fusion der Top-3
  runs['Ensemble(rank)'] = { ms: 0, preds: bm.map((_, i) => {
    const sc = {}; [runs['DoodleNet/gray'].preds[i], runs['MobileViT-fp32'].preds[i]].forEach(p => p.forEach((c, r) => { const k = c.replace(/_/g, ' '); sc[k] = (sc[k] || 0) + (3 - r); }));
    return Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  }) };
  for (const [rname, r] of Object.entries(runs)) {
    let t1 = 0, t3 = 0; const per = {};
    items.forEach((it, i) => { const p = r.preds[i]; const h1 = p[0] === it.w, h3 = p.includes(it.w); t1 += h1; t3 += h3; (per[it.w] ||= [0, 0, 0, {}]); per[it.w][0] += h1; per[it.w][1] += h3; per[it.w][2]++; if (!h1) per[it.w][3][p[0]] = (per[it.w][3][p[0]] || 0) + 1; });
    results[`${vname} | ${rname}`] = { top1: +(t1 / items.length * 100).toFixed(1), top3: +(t3 / items.length * 100).toFixed(1), msPerImg: +r.ms.toFixed(2), per };
  }
}
fs.writeFileSync(`results-classify-${VSET}.json`, JSON.stringify(results, null, 1));
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(45), 'top1', v.top1, 'top3', v.top3, 'ms', v.msPerImg);
// Pro-Wort-Tabelle für die besten clean-Läufe
for (const key of Object.keys(results).filter(k => k.startsWith('clean'))) {
  console.log('\n' + key);
  console.log(Object.entries(results[key].per).map(([w, [a, b, n, conf]]) => `${w} ${a}/${b}/${n} [${Object.entries(conf).sort((x, y) => y[1] - x[1]).slice(0, 2).map(c => c.join(':')).join(',')}]`).join(' · '));
}
