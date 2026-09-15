// Hand-Landmarken → Stift + Artikel-Zählung. Pure, deterministisch (Tests via __feedLandmarks).
// MediaPipe-Indizes: 0 Handgelenk · 4 Daumenspitze · 5/6/8 Zeigefinger MCP/PIP/TIP · 9/10/12 Mittel · 13/14/16 Ring · 17/18/20 kleiner Finger

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
/** Landmarken-Normalisierung: akzeptiert [{x,y,z}] oder [[x,y,z]] */
export const asPoints = (lm) => (lm && lm.length && Array.isArray(lm[0]) ? lm.map(([x, y, z]) => ({ x, y, z: z || 0 })) : lm);

/** Finger gestreckt: Spitze weiter vom Handgelenk als PIP × 1,15 */
export function fingers(lmRaw) {
  const lm = asPoints(lmRaw); const w = lm[0];
  const ext = (tip, pip) => dist(lm[tip], w) > dist(lm[pip], w) * 1.15;
  const handSize = dist(lm[0], lm[9]) || 1e-6;
  return {
    index: ext(8, 6), middle: ext(12, 10), ring: ext(16, 14), pinky: ext(20, 18),
    pinch: dist(lm[4], lm[8]) / handSize,
  };
}
/** Stift-Pose: nur Zeigefinger gestreckt (Mittel, Ring, klein gebeugt) */
export const isPenPose = (f) => f.index && !f.middle && !f.ring && !f.pinky;
/**
 * Artikel-Zählung: nur Zeige-, Mittel-, Ringfinger zählen, Daumen ignoriert, kleiner Finger muss gebeugt sein.
 * 1 = Zeigefinger · 2 = Zeige + Mittel · 3 = Zeige + Mittel + Ring. Alles andere ungültig (null).
 * (Keine 4-Finger-Geste, kein Zeigefinger + kleiner Finger.)
 */
export function articleCount(f) {
  if (f.pinky) return null;
  if (f.index && !f.middle && !f.ring) return 1;
  if (f.index && f.middle && !f.ring) return 2;
  if (f.index && f.middle && f.ring) return 3;
  return null;
}

// ---------- One-Euro-Filter (Casiez et al.) ----------
class LowPass { constructor() { this.y = null; } filter(x, a) { this.y = this.y == null ? x : a * x + (1 - a) * this.y; return this.y; } }
const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
export class OneEuro {
  constructor({ minCutoff = 1.0, beta = 0.007, dCutoff = 1.0 } = {}) { Object.assign(this, { minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.x = new LowPass(); this.dx = new LowPass(); this.tPrev = null; }
  filter(x, tMs) {
    if (this.tPrev == null) { this.tPrev = tMs; this.dx.filter(0, 1); return this.x.filter(x, 1); }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000); this.tPrev = tMs;
    const dxv = (x - (this.x.y ?? x)) / dt;
    const edx = this.dx.filter(dxv, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(x, alpha(cutoff, dt));
  }
}

/**
 * Stift-Zustandsmaschine.
 * update(landmarks|null, tMs, map) → Ereignisse
 *   {type:'down', pts:[[x,y,t],...]} · {type:'move', x,y,t} · {type:'up', t, cutMs} · {type:'hover', x,y} · {type:'lost'}
 * map(xNorm, yNorm) → [xPx, yPx]  (Spiegelung + Mal-Zone passiert im Mapper)
 */
export class PenMachine {
  constructor({ stableFrames = 3, lostMs = 150, cutMs = 100, pinch = false } = {}) {
    Object.assign(this, { stableFrames, lostMs, cutMs, pinch });
    this.fx = new OneEuro(); this.fy = new OneEuro();
    this.reset();
  }
  reset() { this.down = false; this.cand = 0; this.lastSeen = null; this.buf = []; this.fx.reset(); this.fy.reset(); this.lost = true; this.pinched = false; }
  wantDown(f) {
    if (!this.pinch) return isPenPose(f);
    // Zwicken mit Hysterese
    this.pinched = this.pinched ? f.pinch < 0.5 : f.pinch < 0.33;
    return this.pinched;
  }
  update(lmRaw, t, map) {
    const ev = [];
    if (!lmRaw) {
      if (this.lastSeen != null && t - this.lastSeen > this.lostMs && !this.lost) {
        if (this.down) ev.push({ type: 'up', t, cutMs: this.cutMs, reason: 'lost' });
        this.down = false; this.cand = 0; this.buf = []; this.fx.reset(); this.fy.reset(); this.lost = true;
        ev.push({ type: 'lost' });
      }
      return ev;
    }
    const lm = asPoints(lmRaw);
    const f = fingers(lm);
    if (this.lost) { this.fx.reset(); this.fy.reset(); this.lost = false; }
    this.lastSeen = t;
    const [px, py] = map(lm[8].x, lm[8].y);
    const x = this.fx.filter(px, t), y = this.fy.filter(py, t);
    this.buf.push([x, y, t]); if (this.buf.length > this.stableFrames) this.buf.shift();
    const want = this.wantDown(f);
    this.cand = want !== this.down ? this.cand + 1 : 0;
    if (this.cand >= this.stableFrames) {
      this.down = want; this.cand = 0;
      if (want) ev.push({ type: 'down', pts: this.buf.slice() });
      else ev.push({ type: 'up', t, cutMs: this.cutMs, reason: 'pose' });
      return ev;
    }
    ev.push(this.down ? { type: 'move', x, y, t } : { type: 'hover', x, y });
    return ev;
  }
}

/** Artikel-Zähler: Zahl 1 s stabil halten → Auswahl */
export class ArticleCounter {
  constructor({ holdMs = 1000, graceFrames = 2 } = {}) { this.holdMs = holdMs; this.grace = graceFrames; this.reset(); }
  reset() { this.count = null; this.since = null; this.miss = 0; this.selected = null; }
  update(lmRaw, t) {
    if (this.selected) return { count: this.count, progress: 1, selected: this.selected };
    const c = lmRaw ? articleCount(fingers(lmRaw)) : null;
    if (c !== this.count) {
      // kurze Aussetzer (1–2 Frames) tolerieren, sonst neu starten
      if (this.count != null && this.miss < this.grace) { this.miss++; }
      else { this.count = c; this.since = c == null ? null : t; this.miss = 0; }
    } else this.miss = 0;
    const progress = this.count == null ? 0 : Math.min(1, (t - this.since) / this.holdMs);
    if (this.count != null && progress >= 1) this.selected = this.count;
    return { count: this.count, progress, selected: this.selected };
  }
}
