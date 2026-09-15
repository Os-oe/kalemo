// Striche → 28×28-Eingabe für DoodleNet. Pure Funktionen (Browser + Node + Tests).
// Strich-Format überall: [xs[], ys[], ts[]?]  (Quick-Draw-Format, ts in ms optional)
// Messung Recherche 15.09.: Linie 16 in 304er-Box (256 + Rand 16·2 + 16) → 28×28; halbe Stärke → 1 % Treffer.

/** Bounding-Box aller Striche */
export function bbox(strokes) {
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  for (const [xs, ys] of strokes) {
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (x < mx) mx = x; if (x > Mx) Mx = x; if (y < my) my = y; if (y > My) My = y;
    }
  }
  return { mx, my, Mx, My, w: Mx - mx, h: My - my };
}

/** Auf 0..255 normieren (größere Seite = 255, oben links), wie der Quick-Draw-„simplified"-Datensatz */
export function normalize(strokes) {
  const b = bbox(strokes);
  const s = 255 / Math.max(b.w, b.h, 1e-6);
  return strokes.map(([xs, ys, ts]) => {
    const X = new Array(xs.length), Y = new Array(xs.length);
    for (let i = 0; i < xs.length; i++) { X[i] = (xs[i] - b.mx) * s; Y[i] = (ys[i] - b.my) * s; }
    return ts ? [X, Y, ts.slice()] : [X, Y];
  });
}

/** Ramer-Douglas-Peucker (iterativ). Behält ts-Werte der verbleibenden Punkte. */
export function rdp(stroke, eps) {
  const [xs, ys, ts] = stroke;
  const n = xs.length;
  if (n < 3) return ts ? [xs.slice(), ys.slice(), ts.slice()] : [xs.slice(), ys.slice()];
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = 0, mi = -1;
    const dx = xs[b] - xs[a], dy = ys[b] - ys[a], L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-6 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a])
        : Math.abs(dy * xs[i] - dx * ys[i] + xs[b] * ys[a] - ys[b] * xs[a]) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const X = [], Y = [], T = [];
  for (let i = 0; i < n; i++) if (keep[i]) { X.push(xs[i]); Y.push(ys[i]); if (ts) T.push(ts[i]); }
  return ts ? [X, Y, T] : [X, Y];
}

export const simplify = (strokes, eps = 2) => strokes.map((s) => rdp(s, eps));

/** Gesamtlänge der Striche (in Eingabe-Einheiten) */
export function inkLength(strokes) {
  let L = 0;
  for (const [xs, ys] of strokes) for (let i = 1; i < xs.length; i++) L += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  return L;
}

/**
 * Rasterisiert 0..255-Striche wie das cairo-Snippet der Quick-Draw-Autoren:
 * Box 304 (256 + 2·16 Rand + 16 Linie), Linienstärke 16, zentriert, 8× Supersampling → 28×28 Graustufen.
 * Rückgabe Float32Array(784), 0 = Hintergrund, 1 = Strich.
 */
export function raster(strokes, side = 28, SS = 8, lineD = 16, pad = 16) {
  const S = side * SS, orig = 256, totalPad = pad * 2 + lineD, scale = S / (orig + totalPad);
  let maxX = 0, maxY = 0;
  for (const [xs, ys] of strokes) { for (const x of xs) if (x > maxX) maxX = x; for (const y of ys) if (y > maxY) maxY = y; }
  const offX = (orig - maxX) / 2, offY = (orig - maxY) / 2;
  const hi = new Uint8Array(S * S), r = (lineD / 2) * scale, r2 = r * r;
  for (const [xs, ys] of strokes) {
    const n = xs.length;
    if (!n) continue;
    const px = new Float32Array(Math.max(n, 2)), py = new Float32Array(Math.max(n, 2));
    for (let i = 0; i < n; i++) { px[i] = (xs[i] + offX + totalPad / 2) * scale; py[i] = (ys[i] + offY + totalPad / 2) * scale; }
    const m = n === 1 ? 2 : n;
    if (n === 1) { px[1] = px[0]; py[1] = py[0]; }
    for (let i = 0; i < m - 1; i++) {
      const ax = px[i], ay = py[i], bx = px[i + 1], by = py[i + 1];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
      for (let y = y0; y <= y1; y++) {
        const row = y * S, cy = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const cx = x + 0.5;
          let t = ((cx - ax) * dx + (cy - ay) * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + t * dx - cx, qy = ay + t * dy - cy;
          if (qx * qx + qy * qy <= r2) hi[row + x] = 1;
        }
      }
    }
  }
  const out = new Float32Array(side * side), inv = 1 / (SS * SS);
  for (let y = 0; y < S; y++) { const oy = ((y / SS) | 0) * side, row = y * S; for (let x = 0; x < S; x++) if (hi[row + x]) out[oy + ((x / SS) | 0)] += inv; }
  return out;
}

/** Komplette App-Pipeline: beliebige Koordinaten → normiert → RDP ε2 → 28×28 */
export function toInput(strokes) {
  const valid = strokes.filter((s) => s[0].length > 0);
  if (!valid.length) return null;
  return raster(simplify(normalize(valid), 2));
}

// ---------- Simulation Luftzeichnen (Genauigkeits-Gate + Tests) ----------
export function makeRng(seed = 42) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  return { rnd, gauss };
}
/** Verdichten (≈30-fps-Tracking), Zittern σ + niederfrequente Drift, leichte Glättung (wie Harness) */
export function jitter(strokes, sigma, rng = makeRng(42), step = 4) {
  return strokes.map(([xs, ys]) => {
    const X = [], Y = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const d = Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]), n = Math.max(1, Math.round(d / step));
      for (let k = 0; k < n; k++) { X.push(xs[i] + (xs[i + 1] - xs[i]) * k / n); Y.push(ys[i] + (ys[i + 1] - ys[i]) * k / n); }
    }
    X.push(xs[xs.length - 1]); Y.push(ys[ys.length - 1]);
    let dx = 0, dy = 0, sx = null, sy = null; const NX = [], NY = [];
    for (let i = 0; i < X.length; i++) {
      dx = 0.9 * dx + rng.gauss() * sigma * 0.3; dy = 0.9 * dy + rng.gauss() * sigma * 0.3;
      const nx = X[i] + dx + rng.gauss() * sigma, ny = Y[i] + dy + rng.gauss() * sigma;
      sx = sx === null ? nx : 0.5 * sx + 0.5 * nx; sy = sy === null ? ny : 0.5 * sy + 0.5 * ny;
      NX.push(sx); NY.push(sy);
    }
    return [NX, NY];
  });
}
