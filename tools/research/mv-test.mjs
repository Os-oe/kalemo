// MobileViT-Nachtest: fp32 vs quantized, Strichstärke + Rand wie Doodle Dash (Crop auf Bounding-Box)
import fs from 'node:fs';
import ort from 'onnxruntime-node';
const data = JSON.parse(fs.readFileSync('data/simplified.json', 'utf8'));
const WORDS = Object.keys(data);
function raster(strokes, lineD, pad, side = 28, SS = 8) {
  const S = side * SS, orig = 256, totalPad = pad * 2 + lineD, scale = S / (orig + totalPad);
  let maxX = 0, maxY = 0;
  for (const [xs, ys] of strokes) { for (const x of xs) maxX = Math.max(maxX, x); for (const y of ys) maxY = Math.max(maxY, y); }
  const offX = (orig - maxX) / 2, offY = (orig - maxY) / 2;
  const hi = new Uint8Array(S * S), r = (lineD / 2) * scale, r2 = r * r;
  const P = (x, y) => [(x + offX + totalPad / 2) * scale, (y + offY + totalPad / 2) * scale];
  for (const [xs, ys] of strokes) {
    const pts = xs.map((x, i) => P(x, ys[i])); if (pts.length === 1) pts.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5; let t = ((px - ax) * dx + (py - ay) * dy) / L; t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx - px, qy = ay + t * dy - py; if (qx * qx + qy * qy <= r2) hi[y * S + x] = 1;
      }
    }
  }
  const out = new Float32Array(side * side);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (hi[y * S + x]) out[((y / SS) | 0) * side + ((x / SS) | 0)] += 1 / (SS * SS);
  return out;
}
const cfg = JSON.parse(fs.readFileSync('models/mobilevit/config.json', 'utf8'));
const cls = Object.keys(cfg.id2label).sort((a, b) => a - b).map(k => cfg.id2label[k]);
const topk = (a, k) => [...a.keys()].sort((i, j) => a[j] - a[i]).slice(0, k);
for (const file of process.argv.slice(2)) {
  const s = await ort.InferenceSession.create(file);
  for (const [lineD, pad] of [[16, 16], [8, 16], [4, 8], [24, 16], [32, 8]]) {
    let t1 = 0, t3 = 0, n = 0; const t0 = performance.now();
    for (const w of WORDS) for (const d of data[w].drawings.slice(0, 20)) {
      const x = raster(d.drawing, lineD, pad);
      const o = await s.run({ pixel_values: new ort.Tensor('float32', x, [1, 1, 28, 28]) });
      const p = topk(Array.from(o.logits.data), 3).map(i => cls[i]); t1 += p[0] === w; t3 += p.includes(w); n++;
    }
    console.log(file.split('/').pop(), `line${lineD} pad${pad}`, 'top1', (t1 / n * 100).toFixed(1), 'top3', (t3 / n * 100).toFixed(1), 'ms', ((performance.now() - t0) / n).toFixed(1), 'n', n);
  }
}
