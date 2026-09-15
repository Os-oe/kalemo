// „Üb deine schwachen Wörter" (Iteration 1, Zusatz 22): Wörter mit „Zeit um" oder Hilfe kommen zuerst dran —
// lokale Wiederholung im Bildwörterbuch, nicht Teil der Tagesskizzen-Wertung (kein Tagesergebnis, keine Serie).
import { store } from '../core/store.js';
import { t, word } from '../core/i18n.js';
import { escapeHtml } from './round.js';

const KEY = 'weak';
const CLEAN_HITS_TO_DROP = 2; // zwei saubere Treffer (ohne Hilfe) → Wort gilt als gefestigt

/** Liste der schwachen Wörter: { id: { misses, helps, clean, last } } */
export const weakMap = () => store.get(KEY, {});

/** Ergebnis einer Runde verbuchen (Tagesskizze, Üben, Duell nicht) */
export function recordWeak(out, iso) {
  if (!out || !out.id || out.kind === 'plural') return;
  const m = weakMap(); const e = m[out.id];
  if (out.result !== 'hit' || out.helped) {
    const n = e || { misses: 0, helps: 0, clean: 0 };
    if (out.result !== 'hit') n.misses++; else n.helps++;
    n.clean = 0; n.last = iso; m[out.id] = n;
  } else if (e) {
    e.clean = (e.clean || 0) + 1; e.last = iso;
    if (e.clean >= CLEAN_HITS_TO_DROP) delete m[out.id];
  }
  store.set(KEY, m);
}

/** Schwächste zuerst: mehr „Zeit um" > mehr Hilfe > länger her */
export function weakest(app, limit = 5) {
  return Object.entries(weakMap()).filter(([id]) => app.byId.has(id))
    .sort(([, a], [, b]) => (b.misses * 2 + b.helps) - (a.misses * 2 + a.helps) || (a.last || '').localeCompare(b.last || ''))
    .slice(0, limit).map(([id]) => id);
}

/** Übungsrunde mit bis zu 5 schwachen Wörtern; danach kleine Auswertung, zurück ins Wörterbuch */
export async function playWeak(app) {
  const ids = weakest(app, 5); if (!ids.length) return null;
  await app.ensureClf();
  const run = app.dailyRun = { iso: app.today(), plan: { number: 0, slots: ids.map((id) => ({ id, kind: 'weak' })) }, results: [], scored: false, index: 0, weak: true };
  app.show('round'); app.renderToggle();
  for (let i = 0; i < ids.length; i++) {
    if (app.dailyRun !== run) return null;
    run.index = i; app.ui.slots(ids.length, i, run.results);
    const res = await app.playSlot({ id: ids[i], kind: 'weak' }, { index: i, total: ids.length });
    if (!res || app.dailyRun !== run) return null;
    run.results.push(res); recordWeak(res, run.iso);
  }
  app.dailyRun = null;
  const hits = run.results.filter((r) => r.result === 'hit').length, learn = app.settings.learn;
  app.lastWeakRun = { ids, hits, results: run.results.map((r) => ({ id: r.id, result: r.result, helped: !!r.helped })) };
  await app.openDict();
  const box = document.getElementById('sheet');
  box.innerHTML = `<div class="sheet-card weak-done" role="dialog"><h3>${escapeHtml(t('weakDone', { x: hits, n: ids.length }))}</h3>
    <ul class="weak-list">${run.results.map((r) => `<li class="${r.result === 'hit' ? 'ok' : ''}">${escapeHtml(word(app.byId.get(r.id), learn))}</li>`).join('')}</ul>
    <p class="hint">${escapeHtml(t('weakNote'))}</p><button class="btn primary" data-act="close">${escapeHtml(t('close'))}</button></div>`;
  box.hidden = false;
  box.onclick = (e) => { if (e.target === box || e.target.closest('[data-act=close]')) { box.hidden = true; box.innerHTML = ''; } };
  return app.lastWeakRun;
}
