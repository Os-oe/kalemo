// Tagesskizze: 5 Slots nacheinander, danach Tagesende.
import { planFor, addDays } from '../core/plan.js';
import { dayResult, saveDayResult, bumpStreak } from '../core/store.js';
import { t, funnyAllowed } from '../core/i18n.js';
import { compact } from '../core/codec.js';

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
  }
  app.ui.slots(plan.slots.length, plan.slots.length, run.results);
  const summary = {
    number: plan.number, date: iso, pair: `${app.settings.learn}`, native: app.settings.native,
    hits: run.results.filter((r) => r.result === 'hit').length,
    points: run.results.reduce((a, r) => a + (r.points || 0), 0),
    results: run.results.map((r) => { const c = compact(r.strokes || []); return { id: r.id, kind: r.kind, result: r.result, hitAt: r.hitAt, points: r.points, n: r.n, parts: r.parts,
      articleOk: r.articleOk, real: r.real, bestWrong: r.bestWrong, strokes: c.strokes, timing: c.timing, drawings: r.drawings?.map((d) => compact(d).strokes) }; }),
    funniest: run.results.map((r) => r.bestWrong && { target: r.id, ...r.bestWrong }).filter((f) => f && funnyAllowed(f.target, f.id)).sort((a, b) => b.p - a.p)[0] || null,
    learn: app.settings.learn,
    scored,
  };
  if (scored) {
    saveDayResult(iso, summary);
    bumpStreak(iso, addDays(iso, -1));
  }
  run.summary = summary;
  await app.showDayEnd(summary);
  return summary;
}
export const dayTitle = (n, lang) => t('dayEndT', { n }, lang);
