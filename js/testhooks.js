// Test-Hooks — nur mit ?test=1 geladen. Liefern nie Engine-/DOM-Objekte, nur serialisierbare Daten.
import { planFor } from './core/plan.js';
import { playDaily } from './game/daily.js';

export function install(app) {
  window.__feedStrokes = async (strokes, opts = {}) => { await app.round.feed(strokes, opts); return true; };
  window.__setDate = (iso) => { app.dateOverride = iso; app.onDateChange?.(); return app.today(); };
  window.__plan = (iso) => planFor(iso || app.today(), app.words);
  window.__startDaily = async (opts = {}) => { await app.clfPromise; playDaily(app, opts); return true; };
  window.__next = () => { const b = document.querySelector('#round-overlay [data-act=next]'); if (b) b.click(); return !!b; };
  window.__state = () => {
    const r = app.round?.active;
    return JSON.parse(JSON.stringify({
      screen: app.screen, mode: app.mode, settings: app.settings, date: app.today(), clfReady: !!app.clf, backend: app.clf?.backend,
      round: r ? { target: r.w.id, elapsedMs: Math.round(r.engine.elapsed(performance.now())), tips: r.engine.tips, lastTop: r.engine.lastTop, predictions: r.engine.predictions } : null,
      overlay: !document.querySelector('#round-overlay').hidden,
      lastResult: app.lastResult ? { ...app.lastResult, strokes: app.lastResult.strokes?.length } : null,
      daily: app.dailyRun ? { number: app.dailyRun.plan.number, index: app.dailyRun.index, results: app.dailyRun.results.map((x) => ({ id: x.id, kind: x.kind, result: x.result, points: x.points })) } : null,
      log: app.log.slice(-20),
    }));
  };
}
