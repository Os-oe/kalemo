# Sprach-Review 3 — Umsetzung der 6 neuen Befunde

| Nr | Prio | Umsetzung | Nachweis |
|---|---|---|---|
| 1 | P2 | Hilfe-Weg („Zeig mir, wie andere es malen") sagt nicht mehr „Zeit ist um": eigene Blase `helpBubble` (DE „Schauen wir mal, wie andere es malen." · EN „Let’s see how others draw it." · TR „Bakalım başkaları nasıl çizmiş."), kein `timeup`-Clip/-Ton, nur die drei Wort-Clips | `round.js` (`r.helped`), `flow.js` (`announce` statt `missAnnounce`), Check „Hilfe-Weg" in `tests/test_phase4.py` |
| 2 | P3 | `pants.amb.en.tr` → „Burada “trousers” diyoruz, çünkü İngiliz İngilizcesinde “pants” iç çamaşırı demek." | `tools/lang-fixes.mjs` |
| 3 | P3 | `eyeglasses.amb.en.tr` → „“glasses” aynı zamanda bardaklar demek." | `tools/lang-fixes.mjs` |
| 4 | P3 | `clock.amb.de.en/tr` mit übersetztem Beispiel („3 Uhr" = 3 o’clock / saat üç), ohne zweiten Doppelpunkt | `tools/lang-fixes.mjs` |
| 5 | P3 | Statische `aria-label` werden bei jedem Sprachwechsel aus `T` gesetzt (`data-t-aria`; neue Schlüssel `languages`, `round`) | `index.html`, `main.js` `applyTexts()` |
| 6 | P3 | Datenschutz §3 nennt den Schritt wie im Spiel: „Findest du das in echt?" | `datenschutz.html` |

Offene Befunde nach Umsetzung: 0 (Runde 1: 37/37 · Runde 2: 35/35 · Runde 3: 6/6).
