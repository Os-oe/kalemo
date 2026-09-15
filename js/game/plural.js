// Mehrzahl-Runde (Slot 5): Wort von Tag−7 N-mal hintereinander malen, jede Zeichnung einzeln erkannt, 30 s gesamt.
import { t, word, pluralPhrase, strokeColor, cap } from '../core/i18n.js';
import { escapeHtml } from './round.js';

const TOTAL = 30000;
const regularEN = (w) => { const s = w.en.word; const reg = /(s|x|z|ch|sh)$/.test(s) ? s + 'es' : /[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s + 's'; return w.en.pl === reg; };

/** Tipp-Karte je Lernsprache (in UI-Sprache) */
export function pluralTip(w, learn, ui, n) {
  if (learn === 'tr') return t(w.tr.tane ? 'pluralTipTRtane' : 'pluralTipTR', { ex: pluralPhrase(w, 'tr', n) }, ui);
  if (learn === 'de') return t('pluralTipDE', { sg: `${w.de.art} ${w.de.noun}`, pl: w.de.pl }, ui);
  return regularEN(w) ? t('pluralTipENreg', { sg: w.en.word, pl: w.en.pl }, ui) : t('pluralTipEN', { sg: w.en.word, pl: w.en.pl }, ui);
}

export function installPlural(app) {
  app.pluralRound = async (w, n) => {
    const learn = app.settings.learn, ui = app.settings.native;
    const color = strokeColor(w, learn, { plural: true });
    const sub = document.getElementById('word-sub');
    const t0 = performance.now(); let parts = 0, lastOut = null; const drawings = [], tips = []; let bestWrong = null;
    app.stage.clearGhosts();
    for (let i = 1; i <= n; i++) {
      const left = TOTAL - (performance.now() - t0);
      if (left < 800) break;
      sub.textContent = `${t('pluralDraw', { n }, ui)} · ${t('pluralCount', { i, n }, ui)}`;
      const out = await app.round.draw({ id: w.id, durationMs: left, color, totalMs: TOTAL, hardAtMs: 5000, plural: { i, n } });
      lastOut = out; tips.push(...out.tips);
      if (out.bestWrong && (!bestWrong || out.bestWrong.p > bestWrong.p)) bestWrong = out.bestWrong;
      if (out.result !== 'hit') break;
      parts++; drawings.push(out.strokes);
      app.stage.addGhost(out.strokes, color);
      sub.textContent = `${t('pluralCount', { i, n }, ui)}`;
      app.sfx?.play('hit');
      await new Promise((r) => setTimeout(r, i < n ? 620 : 300));
    }
    const elapsed = performance.now() - t0;
    app.stage.clearGhosts(); sub.textContent = '';
    const all = parts === n;
    return {
      id: w.id, result: all ? 'hit' : 'timeout', hitAt: all ? Math.round(elapsed) : null, parts, n,
      points: Math.round((100 * parts) / n), strokes: drawings[0] || lastOut?.strokes || [], drawings,
      tips, bestWrong, stage: lastOut?.stage, tip: pluralTip(w, learn, ui, n),
    };
  };
}
