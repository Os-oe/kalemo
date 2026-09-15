# Excellence-Pass (Autonomie-Pflicht) — die 10 schwächsten Stellen, die 5 wirksamsten gefixt

Stand 15.09.2026, vor dem finalen Live-Deploy. Ehrlich, nach Wirkung auf das Erfolgskriterium sortiert
(„sehe nur kedi, male, lache über den Fehltipp, hüpfende Katze + 3 Sprachen, sofort nächstes Wort, Duell an die Schwester").

## Die 10 schwächsten Stellen

| # | Schwäche | Beleg / Messung | Wirkung | Entscheidung |
|---|---|---|---|---|
| 1 | **Zufallskritzel treffen zu leicht** bei einigen Wörtern (Top-3 aus 148 ist großzügig) | 600 Zufallskritzel: „nose" 32 %, „bird" 16 %, „leg" 15 %, „lightning" 14 %, „snake" 12 %, „rain" 12 % in den Top-3 | Treffer ohne Leistung entwertet den Lach-Moment und das Lernen | **gefixt** (Fix A) |
| 2 | **Stille Ladezeit**: Klick auf „Tagesskizze" wartet unsichtbar auf die Mal-KI (langsames Handy-Netz), bei Ladefehler passiert gar nichts | Code-Review `main.js`; auf 3G ≈ 2–4 s ohne Rückmeldung | erster Treffer < 60 s gefährdet, Nutzer tippt mehrfach | **gefixt** (Fix B) |
| 3 | **Hängen bleiben**: wer das Wort nicht malen kann (Kind, Tastatur-Nutzer), muss 20 s warten; ohne Zeigegerät ist eine Runde gar nicht abschließbar | Konzept-Barrierefreiheit, Tastatur-Durchlauf | Frust statt „ich will sofort das nächste Wort" | **gefixt** (Fix C) |
| 4 | **Wörterbuch animiert alle Zeichnungen gleichzeitig**, auch außerhalb des Bildschirms | 148 mögliche Einträge × Canvas-Boil 60 fps | Akku/Hitze am Handy, Ruckeln | **gefixt** (Fix D) |
| 5 | **Keine Stimme, wenn ein Clip fehlt** (Netzfehler, Cache) — die KI „rät laut" dann stumm | Audio-Engine: `null`-Buffer wurde übersprungen | Kern-Witz („Hmm … ay?") geht verloren | **gefixt** (Fix E, Notfall-Browserstimme nur wenn eine passende Stimme existiert) |
| 6 | **Echtes Luftmalen nie mit einem Menschen getestet** — nur Fake-Kamera (statisch + bewegtes Foto) und synthetische Landmarken | Lücke Finger ↔ Linie gemessen: Median 12,9 px, p90 15,8 px bei ≈ 650 px/s (1280-px-Bühne) | Licht, Zittern, Armermüdung unbekannt | offen → Launch-Paket: echter 30-s-Handyclip + Fresh-Eyes-Review mit Mensch |
| 7 | **iOS/iPadOS ungetestet** (CPU-Delegate erzwungen, Canvas-`filter` für die Luftspur fehlt in älterem Safari) | kein Gerät im Lauf | Heute-Karte ohne Verwischung → Spoiler-Gate greift und lässt die Spur weg (sicher, aber ärmer) | offen, dokumentiert |
| 8 | **„Hol es echt" nie mit einem echten Gegenstand geprüft** | Test nur: Detektor lädt lazy, Suche endet sauber, Rahmen/Stempel/Fanfare per Mock | Baustein könnte in der Praxis selten auslösen | offen, dokumentiert |
| 9 | **Duell-Absender erfährt nie, ob die Schwester es erraten hat** (kein Server, bewusst) | Architektur | weniger Rückkanal, dafür Datenschutz | bewusst so (Konzept) |
| 10 | **Codes „DE · EN · TR" statt Sprachnamen** sind für kleine Kinder abstrakt | Start-Screen | Eltern wählen meist, Kinder spielen | bewusst so (Konzept: keine Flaggen, Codes) |

## Die 5 Fixes

**A — Mindest-Wahrscheinlichkeit für scribble-anfällige Wörter** (`js/core/classifier.js` `HIT_FLOOR`, `engine.js`):
Für nose, bird, leg, lightning, snake, rain, face, stairs, foot muss das Zielwort zusätzlich zu Top-3 + 300 ms
mindestens p ≥ 0,15 haben. Gemessen (Luft-Simulation, 50 je Wort): Zufallstreffer halbiert (nose 32 → 20 %, bird 16 → 8 %,
leg 15 → 8 %, lightning 14 → 7 %), echte Zeichnungen bleiben ≥ 80 % (nose 86 → 80, bird 90 → 86, rain 96 → 96).
Wörter, bei denen die Schwelle echte Treffer unter 70 % drücken würde (mouse, bench, bread), bleiben ohne Schwelle.

**B — Lade- und Fehlerzustand** (`main.js`): Button zeigt „Die Mal-KI lädt noch …" und atmet; bei Ladefehler
freundlicher Hinweis „Die Mal-KI konnte nicht laden. Bitte lade die Seite neu." statt Stille.

**C — „Zeig mir, wie andere es malen"** (`round.js`): ab Sekunde 8 erscheint ein erreichbarer Knopf, der die Runde
freundlich beendet (KI-Schuld-Formulierung, Beispiele, Stimme in 3 Sprachen, 0 Punkte). Hilft Kindern und Tastatur-Nutzern.

**D — Nur sichtbare Zeichnungen animieren** (`alive.js`): IntersectionObserver; außerhalb des Bildschirms bleibt der letzte Frame stehen.

**E — Notfall-Stimme** (`audio.js`): Fehlen alle Clips einer Äußerung, spricht die Browser-Stimme je Sprache — nur wenn
eine passende Stimme installiert ist (Türkisch fehlt oft → dann still, wie vorher). In automatisierten Browsern deaktiviert.

## Erneut geprüft

Siehe BUILD-STATUS Phase 5: Regression aller Suiten nach den Fixes + E2E gegen die Live-URL (Desktop + mobil, 2×).
