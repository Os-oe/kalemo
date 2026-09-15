// Effekt einer Vokabel-Maske: Softmax nur über die Spiel-Wörter (24 bzw. 150) statt 345 Klassen; plus "Ziel in Top-3"
import fs from 'node:fs';
import * as tf from '@tensorflow/tfjs';
const src = fs.readFileSync('mv-test.mjs', 'utf8').split('\n').slice(5, 29).join('\n');
const raster = new Function(`${src}; return raster;`)();
const data = JSON.parse(fs.readFileSync('data/simplified.json', 'utf8'));
const WORDS = Object.keys(data);
const j = JSON.parse(fs.readFileSync('models/doodlenet/model.json', 'utf8'));
const bin = fs.readFileSync('models/doodlenet/group1-shard1of1.bin');
const m = await tf.loadLayersModel(tf.io.fromMemory({ modelTopology: j.modelTopology, weightSpecs: j.weightsManifest[0].weights, weightData: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) }));
const cls = fs.readFileSync('models/doodlenet/class_names.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const noisy = (strokes, s) => strokes.map(([xs, ys]) => { const X = [], Y = []; let sx = null, sy = null;
  for (let i = 0; i < xs.length - 1; i++) { const n = Math.max(1, Math.round(Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]) / 4));
    for (let k = 0; k < n; k++) { const nx = xs[i] + (xs[i + 1] - xs[i]) * k / n + gauss() * s, ny = ys[i] + (ys[i + 1] - ys[i]) * k / n + gauss() * s; sx = sx === null ? nx : .5 * sx + .5 * nx; sy = sy === null ? ny : .5 * sy + .5 * ny; X.push(Math.max(0, Math.min(255, sx))); Y.push(Math.max(0, Math.min(255, sy))); } }
  return [X, Y]; });
const connect = st => [[st.flatMap(s => s[0]), st.flatMap(s => s[1])]];
// 150er-Vokabular: 24 Testwörter + 126 zufällige andere Klassen (fester Seed)
const others = cls.filter(c => !WORDS.includes(c)); const v150 = new Set(WORDS);
while (v150.size < 150) v150.add(others[Math.floor(rnd() * others.length)]);
const masks = { 'alle 345': null, 'Vokabel 150': v150, 'Vokabel 24': new Set(WORDS) };
for (const [vn, fn] of [['clean', d => d.drawing], ['Zittern s3', d => noisy(d.drawing, 3)], ['durchgezogen (kein Stift-hoch)', d => connect(d.drawing)]]) {
  const items = []; for (const w of WORDS) for (const d of data[w].drawings) items.push([w, raster(fn(d), 16, 16)]);
  const buf = new Float32Array(items.length * 784); items.forEach(([, b], i) => buf.set(b, i * 784));
  const P = tf.tidy(() => m.predict(tf.tensor4d(buf, [items.length, 28, 28, 1])).arraySync());
  const row = [];
  for (const [mn, mask] of Object.entries(masks)) {
    let t1 = 0, t3 = 0, conf = 0;
    P.forEach((p, i) => { const idx = [...p.keys()].filter(k => !mask || mask.has(cls[k])).sort((a, b) => p[b] - p[a]); const top = idx.slice(0, 3).map(k => cls[k]); t1 += top[0] === items[i][0]; t3 += top.includes(items[i][0]); });
    row.push(`${mn}: T1 ${(t1 / items.length * 100).toFixed(1)} / T3 ${(t3 / items.length * 100).toFixed(1)}`);
  }
  console.log(`${vn} (n=${items.length}) -> ${row.join(' | ')}`);
}
