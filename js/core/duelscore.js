// Luft-Duell-Wertung. Pure + testbar.
// Iteration 2 (R2-P2-5): Gleiches mit Gleichem — MALZEIT gegen MALZEIT (ab erstem Strich bis KI-Treffer, bei beiden gleich gemessen).
// Raten zählt als ✓/✗: falsch geraten = Runde an den Absender, egal wie schnell gemalt. Differenz < 0,5 s = „Knapp!".
// score im Link = [Absender, Empfänger]; das Rückspiel trägt den Stand aus Sicht des neuen Absenders weiter.

export const CLOSE_MS = 500; // „Knapp!" unter 0,5 s Abstand
export const OPTIONS_AT_MS = 3000; // Antworten erscheinen nach ~3 s, die Wiedergabe läuft weiter
export const NOT_RECOGNIZED_MS = 20000; // ≥ 20 s im Link = die KI hat die Zeichnung nicht erkannt

const recognized = (ms) => ms != null && ms >= 0 && ms < NOT_RECOGNIZED_MS;

/**
 * ok = richtig geraten · youMs = eigene Malzeit (null = nicht erkannt) · themMs = Malzeit des Absenders · score = [Absender, du] vor der Runde
 * → { key: 'faster'|'closeWin'|'closeLose'|'slower'|'wrong'|'tie', you, them } (Punkte nach dieser Runde)
 */
export function duelOutcome({ ok, youMs, themMs, score = [0, 0] }) {
  let [them, you] = score;
  let key;
  const yOk = recognized(youMs), tOk = recognized(themMs);
  if (!ok) { key = 'wrong'; them++; }
  else if (!yOk && !tOk) key = 'tie';
  else if (!yOk) { key = 'slower'; them++; }
  else if (!tOk) { key = 'faster'; you++; }
  else if (Math.abs(youMs - themMs) < CLOSE_MS) { if (youMs <= themMs) { key = 'closeWin'; you++; } else { key = 'closeLose'; them++; } }
  else if (youMs < themMs) { key = 'faster'; you++; }
  else { key = 'slower'; them++; }
  return { key, you, them };
}

/** Sekunden mit einer Nachkommastelle in UI-Schreibweise (DE/TR Komma) */
export const secs1 = (ms, lang) => (Math.max(0, ms) / 1000).toFixed(1).replace('.', lang === 'en' ? '.' : ',');
export const isRecognized = recognized;
