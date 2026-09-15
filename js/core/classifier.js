// DoodleNet (ml5, MIT; Daten Google Quick, Draw! CC BY 4.0) via TensorFlow.js — selbst gehostet.
// Vokabel-Maske + Synonym-Gruppen: Wahrscheinlichkeiten nur über die aktiven Wörter, Geschwister summiert.
import { toInput } from './raster.js';

// Geschwister zählen als Treffer (WORTLISTE + Build-Ergänzungen, siehe tools/accuracy-report.json)
export const SYNONYMS = {
  cup: ['mug', 'coffee_cup'],
  car: ['police_car', 'van'],
  bus: ['school_bus'],
  clock: ['alarm_clock'],
  violin: ['cello'],
  cake: ['birthday_cake'],
  truck: ['pickup_truck'],
  sailboat: ['speedboat'],
  house: ['barn'],
  computer: ['laptop'],
  tree: ['palm_tree'],
  face: ['smiley_face'],
};

/**
 * Mindest-Wahrscheinlichkeit für einen Treffer bei Wörtern, die Zufallskritzel besonders oft in die Top-3 bringen
 * (Excellence-Pass, gemessen: 600 Zufallskritzel → nose 32 % → 20 %, bird 16 % → 8 %; Luft-Sim-Trefferquote bleibt ≥ 80 %).
 */
export const HIT_FLOOR = { nose: 0.15, bird: 0.15, leg: 0.15, lightning: 0.15, snake: 0.15, rain: 0.15, face: 0.15, stairs: 0.15, foot: 0.15 };

let tfReady = null;
export function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Script-Ladefehler ' + src));
    document.head.appendChild(s);
  });
}
async function ensureTf(base, backend) {
  if (!tfReady) {
    tfReady = (async () => {
      if (!globalThis.tf) await loadScript(base + 'vendor/v1/tf.min.js');
      const tf = globalThis.tf;
      tf.enableProdMode();
      const order = backend ? [backend] : ['webgl', 'cpu'];
      for (const b of order) { try { if (await tf.setBackend(b)) break; } catch {} }
      await tf.ready();
      return tf;
    })();
  }
  return tfReady;
}

/** Maske: pro aktivem Wort die Klassen-Indizes (Wort + Geschwister) */
export function buildMask(classNames, words) {
  const idx = new Map(classNames.map((c, i) => [c, i]));
  return words.map((w) => {
    const cls = w.cls || w.id.replace(/ /g, '_');
    const list = [cls, ...(SYNONYMS[cls] || [])].map((c) => idx.get(c)).filter((i) => i !== undefined);
    return { id: w.id, idx: list };
  });
}

/** Wahrscheinlichkeiten (345) → sortierte Liste [{id,p}] über die Maske (renormiert) */
export function rankMasked(probs, mask) {
  let sum = 0;
  const out = new Array(mask.length);
  for (let g = 0; g < mask.length; g++) {
    let p = 0; for (const i of mask[g].idx) p += probs[i];
    out[g] = { id: mask[g].id, p }; sum += p;
  }
  if (sum > 0) for (const o of out) o.p /= sum;
  out.sort((a, b) => b.p - a.p);
  return out;
}

export async function createClassifier({ base = '', words, backend } = {}) {
  const tf = await ensureTf(base, backend);
  const [model, classTxt] = await Promise.all([
    tf.loadLayersModel(base + 'models/v1/doodlenet/model.json'),
    fetch(base + 'models/v1/doodlenet/class_names.txt').then((r) => r.text()),
  ]);
  const classNames = classTxt.split('\n').map((s) => s.trim()).filter(Boolean);
  let mask = buildMask(classNames, words || []);
  // Aufwärmen (Shader kompilieren), damit der erste echte Tipp nicht hängt
  tf.tidy(() => model.predict(tf.zeros([1, 28, 28, 1])));

  async function predictBatch(inputs) {
    const n = inputs.length, buf = new Float32Array(n * 784);
    inputs.forEach((b, i) => buf.set(b, i * 784));
    const t = tf.tidy(() => model.predict(tf.tensor4d(buf, [n, 28, 28, 1])));
    const data = await t.data(); t.dispose();
    const res = [];
    for (let i = 0; i < n; i++) res.push(data.subarray(i * 345, (i + 1) * 345));
    return res;
  }
  return {
    get backend() { return tf.getBackend(); },
    /** FPS-Wächter (Review P3-14): bei zu wenig Bildern pro Sekunde auf das CPU-Backend wechseln (Gewichte ziehen einmalig um) */
    async useCpu() {
      if (tf.getBackend() === 'cpu') return false;
      try { await tf.setBackend('cpu'); await tf.ready(); tf.tidy(() => model.predict(tf.zeros([1, 28, 28, 1]))); return true; } catch { return false; }
    },
    classNames,
    get mask() { return mask; },
    setWords(ws) { mask = buildMask(classNames, ws); },
    predictBatch,
    rank: (probs, m = mask) => rankMasked(probs, m),
    /** Striche (beliebige Koordinaten) → {top:[{id,p}], ms} oder null */
    async classify(strokes, m = mask) {
      const t0 = performance.now();
      const input = toInput(strokes);
      if (!input) return null;
      const [probs] = await predictBatch([input]);
      return { top: rankMasked(probs, m).slice(0, 5), ms: performance.now() - t0 };
    },
    async classifyInput(input, m = mask) {
      const [probs] = await predictBatch([input]);
      return rankMasked(probs, m).slice(0, 5);
    },
  };
}
