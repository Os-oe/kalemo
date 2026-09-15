// DoodleNet: Empfindlichkeit gegen Strichstärke (Raster aus mv-test.mjs übernommen)
import fs from 'node:fs';
import * as tf from '@tensorflow/tfjs';
const src = fs.readFileSync('mv-test.mjs', 'utf8').split('\n').slice(5, 29).join('\n');
const raster = new Function(`${src}; return raster;`)();
const data = JSON.parse(fs.readFileSync('data/simplified.json', 'utf8'));
const j = JSON.parse(fs.readFileSync('models/doodlenet/model.json', 'utf8'));
const bin = fs.readFileSync('models/doodlenet/group1-shard1of1.bin');
const m = await tf.loadLayersModel(tf.io.fromMemory({ modelTopology: j.modelTopology, weightSpecs: j.weightsManifest[0].weights, weightData: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) }));
const cls = fs.readFileSync('models/doodlenet/class_names.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
for (const [lineD, pad] of [[8, 16], [16, 16], [24, 16], [32, 8]]) {
  const items = []; for (const w of Object.keys(data)) for (const d of data[w].drawings.slice(0, 20)) items.push([w, raster(d.drawing, lineD, pad)]);
  const buf = new Float32Array(items.length * 784); items.forEach(([, b], i) => buf.set(b, i * 784));
  const P = tf.tidy(() => m.predict(tf.tensor4d(buf, [items.length, 28, 28, 1])).arraySync());
  let t1 = 0, t3 = 0; P.forEach((p, i) => { const top = [...p.keys()].sort((a, b) => p[b] - p[a]).slice(0, 3).map(k => cls[k]); t1 += top[0] === items[i][0]; t3 += top.includes(items[i][0]); });
  console.log(`DoodleNet line${lineD} pad${pad} top1 ${(t1 / items.length * 100).toFixed(1)} top3 ${(t3 / items.length * 100).toFixed(1)} n ${items.length}`);
}
