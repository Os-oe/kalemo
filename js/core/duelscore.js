// Luft-Duell-Wertung (Iteration 1, Review P2-3). Pure + testbar.
// Empfänger-Zeit = ab Einblenden der Antworten; Absender-Zeit = bis die KI seine Zeichnung erkannt hat.
// score im Link = [Absender, Empfänger]; das Rückspiel trägt den Stand aus Sicht des neuen Absenders weiter.

export const CLOSE_MS = 1000; // „Knapp!" innerhalb von 1 s
export const OPTIONS_AT_MS = 3000; // Antworten erscheinen nach ~3 s, die Wiedergabe läuft weiter

/** → { key: 'faster'|'closeWin'|'closeLose'|'slower'|'wrong', you, them } (Punkte nach dieser Runde) */
export function duelOutcome({ ok, youMs, themMs, score = [0, 0] }) {
  let [them, you] = score;
  let key;
  if (!ok) { key = 'wrong'; them++; }
  else if (Math.abs(youMs - themMs) <= CLOSE_MS) { if (youMs <= themMs) { key = 'closeWin'; you++; } else { key = 'closeLose'; them++; } }
  else if (youMs < themMs) { key = 'faster'; you++; }
  else { key = 'slower'; them++; }
  return { key, you, them };
}

/** Sekunden mit einer Nachkommastelle in UI-Schreibweise (DE/TR Komma) */
export const secs1 = (ms, lang) => (Math.max(0, ms) / 1000).toFixed(1).replace('.', lang === 'en' ? '.' : ',');
