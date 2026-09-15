// Tagesskizze: 5 Slots nacheinander, danach Tagesende.
import { planFor, addDays } from '../core/plan.js';
import { dayResult, saveDayResult, bumpStreak, store } from '../core/store.js';
import { t } from '../core/i18n.js';
import { compact } from '../core/codec.js';
import { pickFunniest, RECENT_MAX } from '../core/funny.js';
import { recordWeak } from './practice.js';

export async function playDaily(app, { practice = false } = {}) {
  const iso = app.today();
  const plan = planFor(iso, app.words);
  const already = dayResult(iso);
  const scored = !practice && !already;
  const run = app.dailyRun = { iso, plan, results: [], scored, index: 0 };
  app.show('round');
  app.ui.slots(plan.slots.length, 0, []);
  for (let i = 0; i < plan.slots.length; i++) {
    if (app.dailyRun !== run) return null; // abgebrochen
    run.index = i;
    app.ui.slots(plan.slots.length, i, run.results);
    const res = await app.playSlot(plan.slots[i], { index: i, total: plan.slots.length });
    if (!res || app.dailyRun !== run) return null;
    run.results.push(res);
    recordWeak(res, iso); // Zusatz 22: „Zeit um"/Hilfe merken → „Üb deine schwachen Wörter"
  }
  app.ui.slots(plan.slots.length, plan.slots.length, run.results);
  const summary = {
    number: plan.number, date: iso, pair: `${app.settings.learn}`, native: app.settings.native,
    hits: run.results.filter((r) => r.result === 'hit').length,
    points: run.results.reduce((a, r) => a + (r.points || 0), 0),
    results: run.results.map((r) => { const c = compact(r.strokes || []); return { id: r.id, kind: r.kind, result: r.result, hitAt: r.hitAt, drawMs: r.drawMs ?? null, points: r.points, n: r.n, parts: r.parts,
      articleOk: r.articleOk, real: r.real, bestWrong: r.bestWrong, tips: (r.tips || []).map((x) => ({ id: x.id, p: x.p })), strokes: c.strokes, timing: c.timing, drawings: r.drawings?.map((d) => compact(d).strokes) }; }),
    // Iteration 2 (R2-P3-2): nur Rateversuche, die in der Sprechblase standen, nie ein Tageswort, mit Wiederholungs-Bremse
    funniest: pickFunniest(run.results, { exclude: plan.slots.map((s) => s.id), recent: store.get('funnyRecent', []) }),
    learn: app.settings.learn,
    scored,
  };
  if (scored) {
    saveDayResult(iso, summary);
    bumpStreak(iso, addDays(iso, -1));
    if (summary.funniest) store.set('funnyRecent', [...store.get('funnyRecent', []), summary.funniest.id].slice(-RECENT_MAX));
  }
  run.summary = summary;
  await app.showDayEnd(summary);
  return summary;
}
export const dayTitle = (n, lang) => t('dayEndT', { n }, lang);
