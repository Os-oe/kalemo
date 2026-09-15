// Tagesskizze: 5 Slots nacheinander, danach Tagesende.
// Iteration 2 (R2-P2-8): Fortschritt wird nach jedem Wort gespeichert (gleicher Tag) — ×/Esc/Zurück fragen nach, ein Reload
// verliert nichts, die Wiederaufnahme beginnt bei Wort n. Das erste abgeschlossene Tagesergebnis ist festgeschrieben;
// weitere Durchläufe sind „Noch mal üben" ohne Einfluss auf x/5, Serie und Teilen-Karte.
import { planFor, addDays } from '../core/plan.js';
import { dayResult, saveDayResult, bumpStreak, store, loadProgress, saveProgress, clearProgress } from '../core/store.js';
import { t } from '../core/i18n.js';
import { compact } from '../core/codec.js';
import { pickFunniest, RECENT_MAX } from '../core/funny.js';
import { recordWeak } from './practice.js';

/** Ergebnis kompakt (Tagesergebnis + Zwischenstand); schon kompakte Ergebnisse (c: 1) bleiben unverändert */
export function compactResult(r) {
  if (r.c) return r;
  const k = compact(r.strokes || []);
  return { c: 1, id: r.id, kind: r.kind, result: r.result, hitAt: r.hitAt, drawMs: r.drawMs ?? null, points: r.points, n: r.n, parts: r.parts,
    articleOk: r.articleOk, real: r.real, helped: !!r.helped, bestWrong: r.bestWrong, tips: (r.tips || []).map((x) => ({ id: x.id, p: x.p })),
    strokes: k.strokes, timing: k.timing, drawings: r.drawings?.map((d) => compact(d).strokes) };
}

export async function playDaily(app, { practice = false } = {}) {
  const iso = app.today();
  const plan = planFor(iso, app.words);
  const already = dayResult(iso);
  const scored = !practice && !already;
  const prog = scored ? loadProgress(iso) : null;
  const run = app.dailyRun = { iso, plan, results: prog ? prog.results.slice(0, plan.slots.length) : [], scored, index: 0, resumed: !!(prog && prog.results.length) };
  app.show('round');
  if (scored) app.guardHistory?.();
  app.ui.slots(plan.slots.length, run.results.length, run.results);
  for (let i = run.results.length; i < plan.slots.length; i++) {
    if (app.dailyRun !== run) return null; // abgebrochen
    run.index = i;
    app.ui.slots(plan.slots.length, i, run.results);
    const res = await app.playSlot(plan.slots[i], { index: i, total: plan.slots.length });
    if (!res || app.dailyRun !== run) return null;
    run.results.push(res);
    recordWeak(res, iso); // Zusatz 22: „Zeit um"/Hilfe merken → „Üb deine schwachen Wörter"
    if (scored) saveProgress({ date: iso, learn: app.settings.learn, native: app.settings.native, results: run.results.map(compactResult) });
  }
  app.ui.slots(plan.slots.length, plan.slots.length, run.results);
  const results = run.results.map(compactResult);
  const summary = {
    number: plan.number, date: iso, pair: `${app.settings.learn}`, native: app.settings.native,
    hits: results.filter((r) => r.result === 'hit').length,
    points: results.reduce((a, r) => a + (r.points || 0), 0),
    results,
    // Iteration 2 (R2-P3-2): nur Rateversuche, die in der Sprechblase standen, nie ein Tageswort, mit Wiederholungs-Bremse
    funniest: pickFunniest(results, { exclude: plan.slots.map((s) => s.id), recent: store.get('funnyRecent', []) }),
    learn: app.settings.learn,
    scored,
  };
  if (scored) {
    saveDayResult(iso, summary);
    bumpStreak(iso, addDays(iso, -1));
    clearProgress();
    if (summary.funniest) store.set('funnyRecent', [...store.get('funnyRecent', []), summary.funniest.id].slice(-RECENT_MAX));
  }
  app.releaseHistory?.();
  run.summary = summary;
  await app.showDayEnd(summary);
  return summary;
}
export const dayTitle = (n, lang) => t('dayEndT', { n }, lang);
