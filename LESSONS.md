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
