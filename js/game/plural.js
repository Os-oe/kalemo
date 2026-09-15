// Mehrzahl-Runde (Slot 5): Wort von Tag−7 N-mal hintereinander malen, jede Zeichnung einzeln erkannt.
// Iteration 2 (R2-P2-2 + R2-P2-3): nach jedem erkannten Objekt darf man es fertig malen; dann werden seine Striche eingefroren
// (gleiten klein an den Rand) und die Erkennung des nächsten Objekts sieht nur neue Striche — ein Strich, der klar außerhalb des
// erkannten Objekts beginnt, ist schon das nächste (geht nie verloren). +8 s je Treffer. Karte ehrlich: N/N „Erkannt!",
// Teilerfolg „Fast! 2 von 3" ohne „+1 Bildwörterbuch".
import { t, pluralPhrase, strokeColor } from '../core/i18n.js';

export const PLURAL = { totalMs: 30000, bonusMs: 8000, pauseMs: 1000 };
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
    const cfg = { ...PLURAL, ...(app.TEST && app.pluralTest ? app.pluralTest : {}) }; // Tests dürfen die Zeit verkürzen
    const color = strokeColor(w, learn, { plural: true });
    const sub = document.getElementById('word-sub');
    let budget = cfg.totalMs, used = 0, parts = 0, lastOut = null, carry = false, bestWrong = null;
    const drawings = [], tips = [], perObject = [];
    app.stage.clearGhosts();
    for (let i = 1; i <= n; i++) {
      const left = budget - used;
      if (left < 800) break;
      const last = i === n;
      sub.textContent = `${t('pluralDraw', { n }, ui)} · ${t('pluralCount', { i, n }, ui)}`;
      const out = await app.round.draw({
        id: w.id, durationMs: left, color, totalMs: budget, plural: { i, n }, keep: carry,
        carryOutside: !last, finishPauseMs: last ? undefined : cfg.pauseMs,
        onRecognized: last ? () => app.voice?.pluralHitAnnounce(w.id, app.round.langOrder(), n) : null,
      });
      lastOut = out; used += out.elapsedMs || 0; tips.push(...out.tips);
      perObject.push({ i, result: out.result, elapsedMs: out.elapsedMs, strokes: out.strokes.length, carried: out.carried, budget });
      if (out.bestWrong && (!bestWrong || out.bestWrong.p > bestWrong.p)) bestWrong = out.bestWrong;
      if (out.result !== 'hit') break;
      parts++; drawings.push(out.strokes); carry = !!out.carried;
      if (!last) {
        budget += cfg.bonusMs; // +8 s je Treffer
        app.stage.addGhost(out.strokes, color);
        sub.textContent = `${t('pluralCount', { i, n }, ui)}`;
        app.sfx?.play('hit');
      }
    }
    app.stage.clearGhosts(); sub.textContent = '';
    const all = parts === n;
    app.lastPlural = { parts, n, perObject, budget };
    return {
      id: w.id, result: all ? 'hit' : 'timeout', hitAt: all ? Math.round(used) : null, parts, n, partial: parts > 0 && !all,
      points: Math.round((100 * parts) / n), strokes: drawings[0] || lastOut?.strokes || [], drawings,
      tips, bestWrong, stage: lastOut?.stage, tip: pluralTip(w, learn, ui, n),
    };
  };
}
