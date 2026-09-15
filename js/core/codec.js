// Striche-Code für das Luft-Duell (ohne Server, nur im #-Hash):
// normieren 0..255 → Ramer-Douglas-Peucker ε≈3 → Delta → Zigzag-Varint → base64url. Deflate bringt nichts (gemessen).
// Format v1: [ver][classIdx][senderDs][nStrokes] je Strich [nPts][gap20ms][dur20ms] Punkte als Deltas … [checksum]
import { normalize, rdp } from './raster.js';

export const VERSION = 1;
const zz = (v) => (v << 1) ^ (v >> 31);
const unzz = (u) => (u >>> 1) ^ -(u & 1);
function pushVar(arr, v) { v >>>= 0; while (v >= 0x80) { arr.push((v & 0x7f) | 0x80); v >>>= 7; } arr.push(v); }
function readVar(buf, pos) {
  let v = 0, shift = 0, b;
  do { if (pos.i >= buf.length) throw new Error('truncated'); b = buf[pos.i++]; v |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80 && shift < 35);
  return v >>> 0;
}
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

/** Striche vereinfachen + quantisieren (das, was tatsächlich im Link steht) */
export function quantize(strokes, eps = 3) {
  const valid = strokes.filter((s) => s[0].length);
  if (!valid.length) return [];
  const norm = normalize(valid);
  return norm.map((s) => {
    const [xs, ys, ts] = rdp(s, eps);
    return [xs.map((x) => Math.max(0, Math.min(255, Math.round(x)))), ys.map((y) => Math.max(0, Math.min(255, Math.round(y)))), ts || null];
  });
}

/**
 * encode({classIdx, senderMs, strokes:[xs,ys,ts]}) → base64url
 * Timing: Pause vor jedem Strich + Strichdauer (20-ms-Raster, max ~5 s je Wert).
 */
export function encode({ classIdx, senderMs = 0, strokes }) {
  const q = quantize(strokes);
  const a = [];
  pushVar(a, VERSION); pushVar(a, classIdx); pushVar(a, Math.round(Math.min(senderMs, 60000) / 100)); pushVar(a, q.length);
  let px = 0, py = 0, prevEnd = null;
  const orig = strokes.filter((s) => s[0].length);
  q.forEach(([xs, ys], si) => {
    const ts = orig[si][2];
    const t0 = ts ? ts[0] : 0, t1 = ts ? ts[ts.length - 1] : 0;
    const gap = prevEnd == null ? 0 : Math.max(0, t0 - prevEnd);
    prevEnd = t1;
    pushVar(a, xs.length); pushVar(a, Math.min(3000, Math.round(gap / 20))); pushVar(a, Math.min(3000, Math.round((t1 - t0) / 20)));
    for (let i = 0; i < xs.length; i++) { pushVar(a, zz(xs[i] - px)); pushVar(a, zz(ys[i] - py)); px = xs[i]; py = ys[i]; }
  });
  let sum = 0; for (const b of a) sum = (sum + b) & 0xff;
  a.push(sum);
  return b64u(a);
}

/** decode(code) → {version, classIdx, senderMs, strokes:[[xs,ys],...], timing:[{gap,dur}]} · wirft bei defektem Code */
export function decode(code) {
  const buf = unb64u(code.trim());
  if (buf.length < 5) throw new Error('short');
  let sum = 0; for (let i = 0; i < buf.length - 1; i++) sum = (sum + buf[i]) & 0xff;
  if (sum !== buf[buf.length - 1]) throw new Error('checksum');
  const pos = { i: 0 }, body = buf.subarray(0, buf.length - 1);
  const version = readVar(body, pos);
  if (version !== VERSION) throw new Error('version');
  const classIdx = readVar(body, pos), senderMs = readVar(body, pos) * 100, n = readVar(body, pos);
  if (n > 200) throw new Error('strokes');
  const strokes = [], timing = []; let px = 0, py = 0;
  for (let s = 0; s < n; s++) {
    const m = readVar(body, pos); if (m > 5000) throw new Error('points');
    const gap = readVar(body, pos) * 20, dur = readVar(body, pos) * 20;
    const xs = [], ys = [];
    for (let i = 0; i < m; i++) { px += unzz(readVar(body, pos)); py += unzz(readVar(body, pos)); xs.push(px); ys.push(py); }
    strokes.push([xs, ys]); timing.push({ gap, dur });
  }
  if (pos.i !== body.length) throw new Error('trailing');
  return { version, classIdx, senderMs, strokes, timing };
}

/** Strich-Timing [{gap, dur}] aus Strichen mit Zeitstempeln */
export function timingOf(strokes) {
  let prevEnd = null;
  return strokes.filter((s) => s[0].length).map(([, , ts]) => {
    const t0 = ts ? ts[0] : 0, t1 = ts ? ts[ts.length - 1] : 0; const gap = prevEnd == null ? 0 : Math.max(0, t0 - prevEnd); prevEnd = t1;
    return { gap: Math.round(gap), dur: Math.round(t1 - t0) };
  });
}
/** Kompakte Ablage: quantisiert ohne Zeitstempel + Timing */
export const compact = (strokes) => ({ strokes: quantize(strokes, 2).map(([xs, ys]) => [xs, ys]), timing: timingOf(strokes) });

/** Timing → absolute Zeitstempel je Punkt (gleichmäßig nach Bogenlänge innerhalb eines Strichs) */
export function withTimes(strokes, timing) {
  let t = 0;
  return strokes.map(([xs, ys], si) => {
    const { gap, dur } = timing[si] || { gap: 250, dur: 600 };
    t += si === 0 ? 0 : gap;
    const L = [0]; for (let i = 1; i < xs.length; i++) L.push(L[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    const tot = L[L.length - 1] || 1;
    const ts = L.map((l) => t + (dur * l) / tot);
    t += dur;
    return [xs, ys, ts];
  });
}
