# Kalemo — Lessons (op-build, 15.09.2026)

Autonomer Build aus `CONCEPT.md` (one-prompt-kit, Autonomie-Modus). Wiederverwendbare Erkenntnisse.

## Klassifikator (DoodleNet)
- **Eingabe aus den Strichen rendern, nie aus dem sichtbaren Canvas** — die Recherche-Messung (Linie 16 in 304er-Box → 28×28) war exakt reproduzierbar, weil `raster.js` als pures Modul in Browser, Tests und Genauigkeits-Werkzeug identisch läuft.
- **Genauigkeits-Gate im Browser über die echte App-Pipeline** statt Node-tfjs: keine 600-MB-`node_modules` im iCloud-Repo, und es misst genau das, was ausgeliefert wird. 7 400 Zeichnungen in ~5 min (CPU-Backend headless).
- **float16-Gewichte halbieren das Modell (2,18 → 1,09 MB) ohne messbaren Verlust** (Top-3 94,26 → 94,24 %). tfjs dekodiert `quantization.dtype: float16` nativ — 20 Zeilen Python, keine Toolchain.
- **Top-3 aus 148 ist großzügig:** Zufallskritzel landen bei „nose" in 32 % der Fälle in den Top-3. Pro Wort messen (Zufallskritzel vs. Luft-Simulation) und nur dort eine Mindest-Wahrscheinlichkeit setzen, wo echte Treffer ≥ 80 % bleiben.
- „recognized"-Filter des Quick-Draw-Datensatzes dokumentieren — nicht erkannte Datensatz-Zeichnungen sind oft abgebrochene Kritzel (45,7 % Top-3 als Info).

## Bugs, die nur ein echter Durchlauf findet
- **Bühne 1×1 px vor dem ersten ResizeObserver-Callback:** Screen wird sichtbar, Striche kommen im selben Tick → alles kollabiert auf einen Punkt, Klassifikation „rain/face/watermelon", Test flackert. Fix: beim Anzeigen synchron `resize()`. Heisenbug-Muster: „Feed endet früher als erwartet".
- **Erzwungene Klassifikation ging verloren, wenn gerade eine lief** (`busy`) → Treffer-Bestätigung nach 300 ms kam nie, Runde lief in den Timeout. Fix: `pending`-Flag + Bestätigung auch ohne neue Striche.
- **CSS-Transform auf dem ganzen Canvas** verschiebt auch den Lichtstaub → sichtbare Kante. Ansicht nur im Renderer transformieren.
- **Partikel außerhalb der Ansichts-Transformation** landen an alter Stelle — Effekte an dieselbe Transformation koppeln oder pausieren.

## Luft-Modus (MediaPipe tasks-vision 1.0.1)
- **Kamera-Abfrage vor dem Modell-Download**: bei Ablehnung 11 MB gespart.
- **Mal-Zone ×1,4 als Zoom der gezeigten Kamera** (cover × 1,4) statt reiner Koordinaten-Verstärkung — sonst liegt die Linie nicht unter dem Finger.
- **„Lücke Finger ↔ Linie" messbar machen**: Fake-Kamera aus bewegtem Foto (`ffmpeg overlay` mit `sin(t)` → mjpeg) + Abstand roher Fingerspitzen-Punkt vs. gefilterter Stiftpunkt. Ergebnis: Median 12,9 px bei ≈ 650 px/s (One-Euro minCutoff 1,0 / beta 0,007).
- Synthetische Hand-Landmarken (21 Punkte, gestreckt/gebeugt) reichen, um Hysterese, Strich-Ende-Schnitt, Hand-verloren und Artikel-Zählung deterministisch zu testen.

## Tests & Werkzeuge
- **Szenen-Hooks `?test=1&scene=…`** machen jeden Screen für `acuity-shot` direkt ansteuerbar (Runde mit Kamera-Attrappe, Duell-Optionen, Wörterbuch-Detail) — ohne sie ist acuity-loop auf einer SPA kaum durchführbar.
- **Animationen + Playwright-Klicks:** schwebende Buttons sind nie „stable" → `force=True` für bewusst animierte Elemente.
- **`navigator.webdriver` für Browser-Sprachausgabe abfragen:** `speechSynthesis` im headless Chromium verlangsamte eine Suite von 33 s auf 16 min.
- **Commit-Messages mit Anführungszeichen immer per `git commit -F datei`** — ein „…" im `-m`-String hat die Shell zerlegt.
- **Dateien nie per `sed -i`/Python-Patch ändern, wenn das Harness Dateistände verfolgt** — jede solche Änderung wird komplett zurück in den Kontext gespiegelt. Edit-Werkzeug nutzen.
- **iCloud-Desktop + viele kleine Dateien (Audio-Produktion) = fileproviderd 75 % CPU** → Test-Suiten 3–10× langsamer. Schwere Datei-Erzeugung außerhalb von iCloud (Scratchpad) bauen und am Ende gebündelt kopieren.

## Sprache
- **Unabhängiger Sprach-Review lohnt sich zweimal:** Runde 1 fand 6 P1 (u. a. n-Deklination im teilbaren Satz „für einen Löwe", „üç yüz" = dreihundert, „grapeses"), Runde 2 fand 2 P1 in den EN/TR-Kurzfassungen der Datenschutzerklärung („nothing is stored" widerspricht der deutschen Fassung).
- Teilbare Satzschablonen (Lustiger KI-Tipp) brauchen eine **Sperrliste** (Körperteil × Schwein/Schaf/Toilette …) — Kinder teilen das.
- Mehrdeutigkeits-Hinweise als eigenes Feld je *Wortsprache × UI-Sprache*, interne Notizen nie anzeigen; neutraler Rahmen „Gut zu wissen:" statt „mehrere Bedeutungen".

## Audio
- Gemini TTS: Einzelwörter unzuverlässig, Bündel mit Pausen + `silencedetect` + STT-Gegenprüfung je Clip. **Harter `maxOutputTokens`-Deckel + HTTP-Timeout pro Anfrage** — eine „Endlos-Ausgabe" von 655 s kostete allein ≈ 0,16 €.
- Subagenten für lange Produktionsläufe in kurzen Etappen arbeiten lassen; eine erste Audio-Session stand 1 h still (nicht stoppbar) — Fortsetzung mit Übernahme-Protokoll (`OWNER.txt`, Aktivitäts-Check) hat funktioniert.
- Suno-Loop: Variante mit geringerer Lautheitsspanne (LRA 2,7 statt 4,2 LU) als Hintergrund, 3-s-Crossfade-Loop per ffmpeg-`amix`, −20 LUFS.

## Ergebnis-Zahlen
- Genauigkeits-Gate: Pool 148/150 (bear, dog raus), Luft-Simulation Top-3 94,2 %, clean Top-1 84,9 %.
- Live: Bildschirm-Modus spielbar nach **2,07 MB** Transfer (Budget 3,5 MB), erster Treffer nach 7–9 s (Fixture-Spieler), E2E live 22/22 ×2 (Desktop, Handy, Luft-Modus unter echter CSP).
- Suiten: phase1 20 · phase2 31 · phase3 40 · phase4 34 · e2e 22 Checks — alle je 2× grün.

## Kosten (Ist)
| Posten | Ist |
|---|---|
| Gemini 2.5 Flash TTS + STT-Verifikation (909 Clips, inkl. Stimmproben und einer 655-s-Endlos-Ausgabe) | 0,87 € |
| Suno V4.5 Musik-Loop (Kie) | 0,10 € |
| DoodleNet, MediaPipe, Fonts, SFX (WebAudio), OG-Bild (Playwright), Karten/Poster (Canvas) | 0,00 € |
| **Gesamt** | **0,97 €** (Budget 10 €, Konzept-Schätzung ≈ 0,45 €) |

Der Mehrpreis gegenüber der Schätzung kam fast vollständig aus der TTS: lange Bündel dehnen Pausen (Pausen-Audio wird bezahlt), eine ungedeckelte Anfrage lief 655 s. Mit Längendeckel + Einzelclips wären ≈ 0,45 € realistisch gewesen.

---

# Iteration 1 (Fix-Session nach Fresh-Eyes-Review 1, 15.09.2026)

**⚠ Beim Launch:** `LAUNCH_DATE` in `js/core/plan.js` auf den tatsächlichen Post-Tag setzen + redeployen (`vercel deploy --prod` → `vercel alias set …`). Davor zeigt jedes Datum Tag #1; die 14 kuratierten Launch-Tage laufen erst ab dem Anker.

## Produkt
- **Die Viral-Stellen sind die zerbrechlichsten.** Review fand genau dort P1: In-App-Balken über dem Wort, „Herausfordern" landete in einem versteckten Screen, Hilfe = Aufgeben. Alle drei waren von den Phasen-Suiten nicht abgedeckt, weil die Suiten Hooks statt der sichtbaren Wege nutzten → je Viral-Weg ein Test über die echte Oberfläche (Klick, `elementFromPoint`, Zwischenablage).
- **Hilfe als Pause statt Abbruch:** `RoundEngine.pause/resume` verschiebt `t0` (und Sprech-Zeitfenster) um die Pausendauer — Timer, Tempo-Bonus und Timing-Regeln bleiben ohne Sonderfälle korrekt.
- **Teilen-Karte mit Pointe ohne Spoiler:** ein Zitat + genau eine scharfe Zeichnung verrät ein Wort (bewusst), die übrigen als „Langzeitbelichtung" (rotierte, verdrillte Kopien des eigenen Pfads) sehen schön aus und bestehen das Klassifikator-Spoiler-Gate schon auf Stufe 1. Verwischte Partikel wirkten dagegen wie Kleckse.
- **„Wenige Striche" ist kein Lesbarkeitsmaß:** Die alte Kuratierung (hohe Konfidenz − Strafpunkte je Strich) lieferte Kürzel (Fahrrad = 2 Kreise), die der Klassifikator liebt und Menschen nicht lesen. Besser: Top-1 + Luft-robust + Detail-Score (Striche 3–14, Tintenlänge) — `tools/examples.py`.
- **Launch-Tage kuratieren + ein Anker:** deterministische Pläne sind fair, aber der erste Eindruck braucht leichte, ikonische Wörter; Launch-Wörter danach ans Ende der Pool-Reihenfolge, damit sie im ersten Umlauf nicht wieder als „neu" kommen.
- **Duell fair machen:** Antworten nach 3 s bei laufender Wiedergabe, Zeit ab Einblendung; Stand im Link (Code v2) — alte v1-Links weiter lesbar halten (echten Live-Link als Test-Fixture nutzen).
- **Countdown bis Mitternacht Berlin** sommerzeitfest rechnen (25-/23-h-Tage) und gegen `zoneinfo` testen.

## Technik
- **Startseite leicht:** tfjs + DoodleNet + Tages-Audio erst bei Absicht (pointerenter/touchstart/focus/Klick, Duell-Link) → 225 KB Start, Ladeanzeige ~0,2 s lokal. Test-Suiten laden weiter sofort (`?test=1`), `?lazy=1` prüft den leichten Weg.
- **FPS-Wächter:** Headless-Chromium hat standardmäßig kein WebGL (tfjs fällt still auf CPU) — echtes Software-WebGL gibt es mit `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` (11–23 fps) → der Wächter-Test misst reale Bedingungen statt injizierter Zahlen.
- **Ebenen explizit:** Canvas mit `z-index` im Luft-Modus lag über z-auto-Dialogen → Kopf/Blase/Schalter/Dialoge bekommen feste z-Ebenen; Pixelprobe im Test.
- **Keras-`model.json`:** ein überzähliges `batch_input_shape` an einer inneren Schicht erzeugt bei jedem Laden eine tfjs-Warnung; Entfernen ändert nichts an den Gewichten.

## Tests & Werkzeuge
- **`aria-disabled` macht Playwright-Klicks „not enabled"** → für bewusst klickbare Sperr-Knöpfe `force=True` bzw. kein `aria-disabled`, wenn der Klick etwas erklärt.
- **Einblend-Animationen verfälschen `getBoundingClientRect`** (translateY) → Layout-Messungen erst nach der Animation.
- **Motion-Gate-Aliasing:** eine Animation mit ~3 s Periode wird bei 3 s Messabstand in derselben Phase fotografiert → „STILLSTAND" trotz Bewegung; nicht-harmonische Perioden (2,3 s) wählen.
- **Nie Screenshots/zweite Suite parallel zu einer laufenden Suite, und keine JS-Edits während Suiten laufen:** Browser stürzte ab (`TargetClosedError`), bzw. Seiten laden halb geänderten Code. Suiten allein laufen lassen; `KALEMO_PORT` erlaubt getrennte Ports.
- **`tools/serve.py` spiegelt die CSP** → Werkzeug-Seiten mit Inline-Modul brauchen `KALEMO_NO_CSP=1`.
- **Web Share nur mit Nutzer-Geste:** Link-Erzeugung (await) direkt nach dem Tipp bleibt im Aktivierungsfenster; in Tests `navigator.share` als Attrappe mit `__mock` injizieren, sonst nutzt der Testmodus die Kopier-Variante.

## Ist-Kosten Iteration 1
| Posten | Ist |
|---|---|
| Neue Audio-Clips | 0,00 € (Mehrzahl-Ausruf aus vorhandenen Zahl- + Plural-Clips, Audio-Tages-Cap nicht angefasst) |
| KI-Bilder/-Videos | 0,00 € (keine) |
| **Iteration 1 gesamt** | **0,00 €** (Lauf gesamt weiter 0,97 €) |

---

# Iteration 3 (Fix-Session nach Fresh-Eyes-Review 3, 18.09.2026)

## Produkt
- **Spoilerfreiheit besser über Auswahl als über Verwischen.** Iteration 2 machte die Teilen-Karte
  spoilerfrei, indem sie die eigenen Zeichnungen abstrahierte — als Bild kamen fünf gelbe Wollknäuel
  heraus. Iteration 3 zeigt stattdessen *was nichts verrät*: Textzeilen über die Fehltipps und
  optional **eine** scharfe Zeichnung, deren Wort heute und in den nächsten zwei Tagen nicht drankommt.
  Regel: erst fragen „welcher Inhalt ist ohnehin unverfänglich?", dann erst „wie mache ich Inhalt unkenntlich?".
- **Die Karte muss auch in der leeren Variante tragen.** Der Held existiert nur, wenn das Bildwörterbuch
  einen passenden Eintrag hat — beim allerersten Spieler nie. Beide Fassungen wurden gerendert und
  angesehen, das Layout schaltet um (ohne Held: größere Zeilen + Schlusszeile „Die KI erkannte x/5").
- **Zeitdeckel, die Eingaben abschneiden, müssen Ruhe zählen, nicht Zeit.** „Karte spätestens nach 4 s"
  klang harmlos und schnitt jede fünfstrichige Zeichnung in der Mitte ab. Richtig: jeder neue Strich
  setzt den Deckel zurück, und es gibt eine zweite, deutlich größere Grenze (12 s) gegen Endlosfälle.
  Beim Erzwingen darf nichts verloren gehen — der laufende Strich wird abgesetzt, nicht verworfen.
- **Zwei ehrliche Meldungen können sich widersprechen.** „Erkannt! Buldum! Salyangoz!" neben „Fast —
  das ist eher ein Gesicht" entzaubert genau den Moment, der zaubern soll. Ein Hinweis, der die eigene
  Hauptaussage relativiert, braucht einen engen, kuratierten Auslöser (hier: nur echte Nachbar-Klassen).
- **Messwerte aus dem Trainingsdatensatz sind notwendig, nicht hinreichend.** „eye/göz" erfüllte die
  Kuratierungsregel (Top-3 98 %, Top-1 90 %) und fiel im Menschen-Review durch (3/4 sauber, 0/1
  unordentlich). Ein Review-Befund am Produkt sticht die Offline-Messung.
- **Ein Toast ist eine Meldung, kein Knopf.** Der neu eingeführte Toast lag genau über der Kachel
  „Gestern gemalt" und schluckte den Tipp — `pointer-events: none` gehört an jede transiente Einblendung.

## Tests & Werkzeuge
- **Suiten aus einer Repo-Kopie außerhalb von iCloud laufen lassen** (`rsync` → `/tmp/kalemo-run`) löst
  zwei Probleme auf einmal: der fileproviderd/fseventsd-Sturm entfällt, und man darf **während** eines
  laufenden Gates weiter am Repo arbeiten — die Suite serviert den Schnappschuss, nicht den Arbeitsbaum.
  Damit fällt die alte Regel „keine JS-Edits während Suiten laufen" weg.
- **Zeitmessungen im Test immer auf den Produkt-Zeitpunkt beziehen, nicht auf den Teststart.** Der
  12-s-Deckel zählt ab dem Erkennen; gemessen ab `wait_state` fehlten 2 s und der Test war falsch rot.
  `round.recognizedAt` aus dem Zustand lesen.
- **`__feedStrokes` wartet nach dem letzten Strich noch `gapMs`** — wer die Stift-Pause misst, muss das
  herausrechnen, sonst misst er 0,5 s statt 1,2 s.
- **Tests, die den alten Vertrag festschreiben, gehören mit dem Fix umgeschrieben, nicht gelöscht.**
  Fünf Suiten prüften „5 Leuchtspuren, kein Held". Sie prüfen jetzt „Textreihe je Wort, Held nie aus den
  nächsten Plänen" — derselbe Schutz, neuer Vertrag.
