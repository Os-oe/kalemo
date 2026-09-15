// Lustigster KI-Tipp (Iteration 2, R2-P3-2 + Spoiler-Entscheidung Punkt 2). Pure + testbar.
// Nur Rateversuche, die wirklich in der Sprechblase standen (engine.tips), nie ein Wort der heutigen Tagesskizze,
// mit Wiederholungs-Bremse (sonst ständig „Bein") und leichter Dämpfung der Allerwelts-Kritzel-Tipps.
import { funnyAllowed } from './i18n.js';

export const COMMON_GUESSES = new Set(['leg', 'beard', 'banana']);
export const RECENT_MAX = 10;

/**
 * results: [{ id, tips: [{id, p}] }] · exclude: Wort-IDs, die nie zitiert werden (heutiger Plan) · recent: zuletzt zitierte Rateversuche
 * → { target, id, p, idx } oder null
 */
export function pickFunniest(results, { exclude = [], recent = [] } = {}) {
  const ex = new Set(exclude); let best = null;
  (results || []).forEach((r, idx) => {
    for (const tip of r?.tips || []) {
      if (!tip || !tip.id || tip.id === r.id || ex.has(tip.id) || !funnyAllowed(r.id, tip.id)) continue;
      const rep = recent.filter((x) => x === tip.id).length;
      const score = tip.p - 0.35 * rep - (COMMON_GUESSES.has(tip.id) ? 0.12 : 0);
      if (!best || score > best.score) best = { target: r.id, id: tip.id, p: +(+tip.p).toFixed(3), idx, score: +score.toFixed(3) };
    }
  });
  if (best) delete best.score;
  return best;
}

/** Ist ein gespeicherter Tipp noch zitierbar? (heutige Wörter nie; bei vorhandenem Blasen-Protokoll nur, was dort stand) */
export function funnyValid(sum, f, exclude = []) {
  if (!f || !f.id || !f.target || f.id === f.target || exclude.includes(f.id) || !funnyAllowed(f.target, f.id)) return false;
  const idx = f.idx ?? sum.results.findIndex((r) => r.id === f.target);
  const r = sum.results[idx]; if (!r) return false;
  return !r.tips || r.tips.some((x) => x.id === f.id);
}
