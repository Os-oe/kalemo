// Stift-Kalibrierung im Luft-Modus (Iteration 1, Zusatz 23). Pure + deterministisch testbar.
// Misst in zwei kurzen Phasen, wie stabil der Stift mit „nur Zeigefinger" bzw. „Daumen + Zeigefinger zusammen"
// erkannt wird, und wählt die robustere Geste. Einstellungen (Zwicken an/aus) können das jederzeit überschreiben.
import { fingers, isPenPose, asPoints } from './pen.js';

const PINCH_ON = 0.33;

/**
 * frames: [{ lm: Landmarken | null, t }] einer Phase, mode 'index' | 'pinch'.
 * → { frames, hand, pose (Anteil Frames mit erkannter Geste), jitter (px-Streuung der Fingerspitze bei erkannter Geste),
 *     flips (Wechsel Geste an/aus je Sekunde), score }
 */
export function gestureStability(frames, mode, { w = 640, h = 480 } = {}) {
  let hand = 0, pose = 0, flips = 0, prev = null;
  const xs = [], ys = [];
  for (const f of frames) {
    if (!f.lm) { prev = null; continue; }
    hand++;
    const lm = asPoints(f.lm), fg = fingers(lm);
    const on = mode === 'pinch' ? fg.pinch < PINCH_ON : isPenPose(fg);
    if (prev != null && on !== prev) flips++;
    prev = on;
    if (on) { pose++; xs.push(lm[8].x * w); ys.push(lm[8].y * h); }
  }
  const n = frames.length || 1, dur = frames.length > 1 ? Math.max(0.001, (frames[frames.length - 1].t - frames[0].t) / 1000) : 1;
  const sd = (a) => { if (a.length < 2) return 0; const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const jitter = Math.hypot(sd(xs), sd(ys));
  const ratio = pose / n, flipRate = flips / dur;
  const score = ratio / (1 + jitter / 12) / (1 + flipRate / 2);
  return { frames: frames.length, hand, pose: +ratio.toFixed(3), jitter: +jitter.toFixed(2), flips: +flipRate.toFixed(2), score: +score.toFixed(3) };
}

/** → { choice: 'index' | 'pinch', index, pinch } — Zeigefinger bei Gleichstand (einfachere Geste, kein Zwicken nötig) */
export function chooseGesture(indexFrames, pinchFrames, size) {
  const index = gestureStability(indexFrames, 'index', size), pinch = gestureStability(pinchFrames, 'pinch', size);
  const choice = pinch.score > index.score * 1.15 && pinch.pose >= 0.5 ? 'pinch' : 'index';
  return { choice, index, pinch };
}
