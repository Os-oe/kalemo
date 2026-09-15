# Juice-Checkliste (Konzept) — Punkt für Punkt

Jede Aktion ≥ 3 Feedback-Kanäle. Beleg = automatischer Check in `tests/test_phase4.py` (Report `tests/reports/phase4.jsonl`) bzw. Code-Stelle.

| Aktion | Kanäle laut Konzept | Umsetzung | Beleg |
|---|---|---|---|
| **Stift runter** | Cursor füllt sich · Tick · Leuchtspur startet | Stage-Cursor `draw` (gefüllter Leuchtpunkt) statt Ring · `sfx.penDown` · Strich beginnt sofort (Luft: gepufferte Hysterese-Frames werden nachgezeichnet) | Check „Juice Stift runter" |
| **Malen** | Strichbreite nach Tempo · Kritzel-Rauschen · Funken | `Stage.addPoint`: Breite 0,55–1,35 × Tempo (geglättet) · `sfx.scribble(v)` Bandpass-Rauschen, Lautstärke/Filter folgen Tempo · Funken-Partikel am Stiftpunkt | `js/game/stage.js`, `js/game/sfx.js` |
| **KI-Tipp** | Blase ploppt · Stimme · Zeichnung zuckt | `.bubble.pop` · `voice.guess` (Präfix-Clip + Wort-Clip, DE mit Artikel, Wort in Artikel-Farbe) · `stage.pulse()` Zucken + `sfx.guessPop` | Check „Juice KI-Tipp" (sobald vor dem Treffer ein Tipp fällt) |
| **Treffer** | Freeze 80–120 ms · Chime · Squash-Pop 1→1,25→0,95→1 · Konfetti in Strichfarbe · Kategorie-Bewegung · Stimme 3 Sprachen · Vibration | `frozenUntil +100 ms` · `sfx.hit` · CSS `@keyframes squash` auf der Leuchtspur · `confetti()` in `stage.color` · Kategorie-Klang nach 520 ms + lebende Zeichnung (Kategorie-Bewegung) auf der Treffer-Karte, „landet" als Buntstift-Skizze + „+1 Bildwörterbuch" · `voice.hitAnnounce` (Ausruf + Lernsprache, Muttersprache, dritte) · `navigator.vibrate(40)` | Checks „Juice Treffer …", „Kategorie-Bewegung-Klang", „Treffer-Karte: lebende Zeichnung + 3 Sprachen" |
| **Zeit um** | Zerbröseln · weicher fallender Ton · Beispiele blenden ein · Stimme | `stage.crumble()` (Striche fallen/verblassen 900 ms) · `sfx.crumble` + `sfx.timeup` (fallende Sinus-Töne, kein Buzzer) · Karte „Ich hab’s nicht erkannt — so malen es andere:" mit 3 kuratierten Zeichnungen · `voice.missAnnounce` | Checks „Juice Zeit um", „Zeit um: freundliche Stimme …", „… 3 Beispiele, KI trägt die Schuld" |
| **Artikel richtig** | Karte blitzt · Chime · Finger-Icon hüpft | `.art-card.flash` (Farbfläche + Ring) · `sfx.articleOk` · `@keyframes hop` auf der Hand · Stimme sagt Artikel + Wort | Check „Juice Artikel richtig" |
| **Artikel anders gewählt** | sanftes Wackeln · richtige Farbe · Stimme | `.wobble` auf der gewählten, `.flash` auf der richtigen Karte · Hinweis „Es heißt: die Katze" · `sfx.articleNo` (weich) · Stimme | Check „Juice Artikel anders gewählt" |
| **Hol es echt** | Objekt-Rahmen glüht · Fanfare · „×2"-Stempel | Detektor-Box → Bühnen-Koordinaten (gespiegelt), pulsierender Gold-Rahmen · `sfx.fanfare` · `.x2` Stempel-Animation | Check „Juice Hol es echt" |
| **Tagesende** | lebende Zeichnungen · Punkte-Count-up · Serien-Flamme · Musik-Schwelle | `alive.mount` mit Kategorie-Bewegung + Line-Boil · Count-up 1,2 s (ease-out) + `sfx.streak` · SVG-Flamme flackert · Musik-Loop blendet auf dem Tagesende ein (nie in Runden, duckt unter Stimme) | Check „Juice Tagesende" |

Zusätzlich: Countdown-Tick in den letzten 5 s, Ring wird rot · UI-Tap-Klick · Teilen-Whoosh · Line-Boil-Glitzer beim Erscheinen der lebenden Zeichnung · `prefers-reduced-motion` dämpft Boil/Parallax/Partikel, Treffer bleibt über Farbe + Ton + Text erkennbar.
