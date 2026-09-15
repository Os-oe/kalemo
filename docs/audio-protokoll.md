# Kalemo · Audio-Protokoll Sprach-Clips v1

- **Datum:** 15.09.2026, 04:43–06:48 Uhr
- **Ergebnis:** 909 von 909 Clips per blinder Spracherkennung (STT) verifiziert, also **100 %**
- **Ausgabe:** `audio/v1/<lang>/{w,b,p,n,x,u}/*.mp3` · `audio/v1/verify-report.json` · `audio/v1/manifest.json` (`audio/v1/music/` nicht angefasst)
- **Werkzeuge:** `tools/audio/common.py` (Hilfsfunktionen) · `tools/audio/voice_test.py` (Stimmen-A/B) · `tools/audio/produce.py` (Produktion, Prüfung, Report). Arbeitsstand in `tools/audio/work/` (gitignored): `state.json`, `usage.jsonl`, Roh-Takes `raw/`, Logs `stage-*.log`
- **Ist-Kosten:** 0,8736 € (0,9495 US$), alles aus `work/usage.jsonl`, vollständig per budget-guard verbucht

## 0. Übernahme von der abgebrochenen Vorgänger-Session

Die erste Session hatte `common.py` und `voice_test.py` angelegt. Ihre letzte Aktivität war um 03:42 Uhr. Um 04:43 Uhr war sie 61 Minuten ohne Dateiänderung und ohne laufenden Prozess, sie galt also als abgebrochen (siehe `work/OWNER.txt`). Hinterlassen hatte sie:

- EN-Stimmproben (Aoede, Achernar), aber ohne `results.json`
- ein TR-Bündel „Sulafat“ mit nur 0,81 s Audio
- leere DE-Ordner
- noch keinen einzigen Clip
- Kosten bis dahin: 0,0062 €

Die Takes der Vorgängerin wurden weiterverwendet (`work/voicetest/*/take-lines-run1-vorgaenger.flac`).

**Befund zu „Sulafat 0,81 s“:** Das ist ein reproduzierbares Formatproblem, kein Zufall. Sulafat liest im Zeilenformat (ein Eintrag je Zeile) nur 1–2 Einträge und bricht dann ab: 3 von 3 Takes (0,8 s, 2,7 s, 0,8 s). Mit dem Ellipsen-Format („kedi … sincap … …“) und mit Zählsatz kamen 3 von 3 Takes vollständig. Die Anweisung war schon auf Türkisch, daran lag es nicht.

## 1. Stimmenwahl (A/B, je 5 Beispielwörter)

Methode: dieselben 5 Wörter je Sprache, im Bündel erzeugt. Es wurden alle vorhandenen Takes ausgewertet, aus der Vorgänger-Session und aus der Prompt-Diagnose (Formate Zeilen, Ellipse, Zeilen mit Zählsatz, Absätze). Ein Take gilt als „vollständig“, wenn silencedetect exakt 5 Segmente findet. Die STT lief mit dem finalen Prüfverfahren (Abschnitt 3). Rohdaten: `work/voicetest/results.json`.

| Sprache | Stimme | vollständige Takes | STT-Treffer | Tempo (Silben/s) | Pause Ø | s je Eintrag | Lautheits-Streuung roh | Wahl |
|---|---|---|---|---|---|---|---|---|
| DE | **Kore** | 2/4 | 10/10 | 4,48 | 1,4 s | 2,42 | 1,0 dB | ✔ |
| DE | Leda | 0/3 | – | – | – | – | – | |
| EN | **Aoede** | 1/1 | 5/5 | 4,04 | 0,97 s | 1,59 | 1,62 dB | ✔ |
| EN | Achernar | 1/1 | 5/5 | 2,77 | 2,18 s | 3,10 | 2,12 dB | |
| TR | Sulafat | 3/6 | 15/15 | 4,77 | 1,99 s | 2,70 | 0,94 dB | |
| TR | **Laomedeia** | 4/5 | 20/20 | 5,28 | 2,43 s | 2,90 | 1,24 dB | ✔ |

**Begründung:**

- **DE Kore:** Leda ließ in allen 3 Takes Einträge aus (Voll-Transkript des Bündels: „das Eichhörnchen“ fehlte), damit fällt sie aus. Kore ist klar und hat mittleres Tempo.
- **EN Aoede:** Beide Stimmen erzielen 5/5. Aoede hat die stabilere Lautheit, ein natürliches mittleres Tempo und nur halb so viel bezahlte Pause. Achernar ist sehr langsam (2,8 Silben/s).
- **TR Laomedeia:** Laomedeia ist über alle Formate robust. Der einzige Fehlschlag war eine Endlos-Ausgabe, siehe Abschnitt 6. Sulafat scheitert systematisch im Zeilenformat, und genau das brauchen die KI-Präfixe, weil sie selbst „…“ enthalten. Laomedeia ist etwas schneller, 5,3 Silben/s liegen für Türkisch aber im normalen Bereich.

## 2. Parameter

| Bereich | Wert |
|---|---|
| TTS | `gemini-2.5-flash-preview-tts`, generateContent, `responseModalities: AUDIO`, `prebuiltVoiceConfig.voiceName` → PCM s16le 24 kHz mono |
| Deckel je TTS-Anfrage | `maxOutputTokens` = erwartete Sekunden × 25 (Bündel n × 4 s + 6 s; einzeln 10 s; Trägersatz 16 s), HTTP-Timeout max(60 s, 1,5 × Deckel) |
| Prompt-Formate | DE-Wörter Ellipse (Zeilen als Ausweichformat) · EN/TR-Wörter Zeilen (Ellipse als Ausweichformat) · KI-/UI-Sätze nur Zeilen. Regiezeile mit Ton (neutral / neugierig-fragend / freudig / freundlich-tröstend), „etwa eine Sekunde Pause“, „sprich nichts anderes“ |
| Einzelanfrage | „Sprich auf Deutsch, {Ton}, exakt dieses Wort …, nichts davor und nichts danach:“ (EN/TR sinngemäß in der Zielsprache) |
| Schnitt Bündel | `ffmpeg silencedetect`: Suche über noise −45/−40/−50/−35 dB × d 0,25–0,75 s, bis die Segmentzahl **exakt** stimmt, sonst Bündel halbieren + Ausweichformat (bis 3 Einträge) |
| Schnitt einzeln | Anfang und Ende bei −45 dB (d = 0,05 s, Intervalle < 70 ms ignoriert), Ausklang bis 150 ms verlängert, solange > −55 dB |
| Rand | 40 ms vor und nach der Sprache, 6 ms Ein-/Ausblendung |
| Lautheit | EBU R128 je Clip; kurze Clips werden zur Messung geloopt (≥ 2 s), damit das 400-ms-Gating greift. Gain auf −16 LUFS, `alimiter`, Ziel True Peak ≤ −1 dBTP (Messung nach MP3-Dekodierung). Drückt der Limiter unter −16,4 LUFS, gibt es bis zu +4 dB Zusatz-Gain |
| Format | MP3 mono 24 kHz 48 kbps (libmp3lame), per ffmpeg-Probe für alle 909 geprüft |
| Parallelität | höchstens 3 gleichzeitige HTTP-Anfragen, Backoff bei 429/5xx (`retryDelay`), Tageskontingent → sofortiger Stopp mit Zwischenstand |

**Ergebnis-Pegel (909 Clips):**

- Lautheit Ø −16,43 LUFS, Spanne −17,9 bis −16,0
- 907 Clips liegen innerhalb ±1 LU, 800 innerhalb ±0,5 LU
- True Peak maximal −1,0 dBTP, kein Clip darüber
- Dauer 362–2687 ms, Median 823 ms

## 3. Verifikation und Normalisierung

- **STT:** `gemini-2.5-flash`, Temperatur 0, ohne Thinking. Das Audio geht inline als WAV: der finale MP3-Clip dekodiert, mit je 0,4 s digitaler Stille davor und danach. Der Erwartungstext wird dem Modell nie gezeigt.
  - Warum das Polster: Ohne Polster und mit dem alten deutschen Prompt der Vorgängerin (mit Ausweg „[unverständlich]“) kamen bei <1-s-Clips nur 5 von 10 richtig. Mit Polster und englischem Prompt waren es 10 von 10.
  - Der Prompt verlangt, Interjektionen („hmm, oh, ooh“) und umgangssprachliche Kurzformen so zu schreiben, wie sie zu hören sind.
- **Lesungen:**
  - Passt Lesung 1, gilt der Clip als verifiziert (807 Clips `exact`, 6 `homophone`).
  - Passt Lesung 1 nicht, folgt Lesung 2 mit umgekehrter Teil-Reihenfolge. Passt diese, entscheidet Lesung 3 (anders formulierter Prompt). Der Clip gilt dann nur bei **Mehrheit 2 von 3** als verifiziert: 96 Clips, `matchRule: exact+mehrheit-2/3`.
  - Eine anfangs genutzte „Zweitlesung reicht“-Regel wurde verworfen, weil „Havada çizgi“ und „Havada çiz“ gegeneinander standen. Alle so angenommenen Clips wurden nachgeprüft.
- **Normalisierung** (auch als `normalization[]` im Report):
  1. Unicode NFC. Kleinschreibung, im Türkischen sprachgerecht (I→ı, İ→i)
  2. Satzzeichen, Ellipsen und Anführungszeichen entfernt
  3. Apostrophe entfernt (Mal’s ≈ Mals, Time’s ≈ Times)
  4. Bindestriche und Gedankenstriche zählen als Leerzeichen, verglichen wird ohne Leerzeichen (köpek balığı ≈ köpekbalığı, T-shirt ≈ tshirt)
  5. Ziffern ≈ Zahlwörter je Sprache (1–5, 100)
  6. Interjektionen: Buchstabenwiederholung zusammengefasst (ooh ≈ oh). Summlaut-Schreibungen hm ≈ hmm ≈ mmm ≈ türkisch hım/hımm, nur als ganzes Token. Die TR-Stimme spricht „Hmm“ hörbar, die STT schreibt es türkisch „Hım“.
  7. ß ≈ ss
  8. Deutsch: ein führendes „dass“ ≈ „das“
  9. Vorab festgelegte Homophon-Tabelle, nur lautgleiche Schreibungen. Tatsächlich genutzt in 6 Fällen: de/w/whale „Der Wahl“, de/b/whale „Wahl“, de/b/shark „Hi“, en/w/bee „B“, en/w/pear „Pair“, en/w/eye „I“
- **DE-Artikel:** Der Artikel ist ein eigenes Token und muss exakt passen. „Katze“ gegen „die Katze“ zählt als Fehlschlag.

## 4. Ablauf, Etappen und die Abweichung vom Bündel-Plan

| Etappe | Verfahren | Clips | beim 1. Versuch verifiziert | Kosten |
|---|---|---|---|---|
| Stimmentest + Prompt-/STT-Diagnose | Bündel à 5 | – | – | 0,2063 € |
| KI-/UI-Sätze (3 Läufe) | Bündel à 2–4, dann einzeln/Trägersatz | 25 | 16 | 0,0564 € |
| en-w | Bündel à 19–20 (Zeilen), Ausweich Ellipse à 9–10 | 153 | 150 | 0,1502 € |
| en-p + de/x/hit2 | **einzeln** | 139 | 128 | 0,0941 € |
| de-w + de-b | einzeln | 301 | 272 | 0,1339 € |
| de-p + tr-w | einzeln | 292 | 234 | 0,1152 € |
| Neuversuch Fehlschläge | Bündel à ≤6 (DE Ellipse, TR Zeilen), halbiert bei falscher Segmentzahl | 87 | 50 | 0,0532 € |
| Neuversuch Rest | einzeln, 3 Runden | 37 | 35 | 0,0206 € |
| letzte 2 (tr/w/hand „el“, tr/w/suitcase „bavul“) | einzeln, dann Trägersatz | 2 | 2 | 0,0052 € |
| Nachschnitt (Stille) + Nachprüfung | nur STT | 315 | 288 übernommen | 0,0326 € |
| Pegel-Nachbesserung + Nachprüfung | Neu-Render, 1 neuer Take | 37 | 36 übernommen | 0,0059 € |

**Abweichung: Bündeln wurde ab Etappe en-p durch Einzelanfragen ersetzt.** Die Messung in en-w zeigte, dass die Stimme die „~1-s-Pause“ in langen Bündeln auf etwa 3 s streckt. 19 Einträge ergaben 72–84 s Audio, also rund 3,8 s bezahltes Audio je Clip bzw. 0,0009 € TTS je Clip. Eine Einzelanfrage kostet im Schnitt 1,27 s Audio, also 0,0003 € je Clip.

Hochgerechnet hätten die restlichen 732 Clips im Bündelverfahren das Tages-Cap Audio (1 €, davon 0,10 € Musik) überschritten. Ein Budget-Abbruch mit Teilstand wäre die Folge gewesen. Einzelanfragen artikulieren isolierte Nomen etwas schlechter: Beim 1. Versuch kamen EN 93 %, DE 90 %, TR 80 % durch, im Bündel waren es bei en-w 98 %. Deshalb liefen die Neuversuche wieder als kleine Bündel. Die Pflichtprüfung, also Segmentzahl exakt und STT je Clip, galt in jedem Verfahren unverändert.

**Trägersatz** („Das nächste Wort ist: … Danke.“): ab de-w abgeschaltet. Er kostet im Schnitt 8,6 s Audio, das Siebenfache einer Einzelanfrage, und traf in en-p nur 3 von 16 Mal. Nur für die letzten zwei TR-Wörter wurde er wieder eingeschaltet, dort mit Erfolg.

**Inventar-Änderungen während des Laufs** (vom Build-Orchestrator in `data/voice-lines.json`): `tr.x.hit2` „Tamam, anladım!“ → „Bildim!“ sowie `de.x.hit2` „Jetzt hab ich’s!“ → „Jetzt habe ich’s!“. Der Grund für die zweite Änderung: 12 Versuche mit Bündel, einzeln, Trägersatz, Aussprache-Hinweis und der Schreibung „hab’“ wurden stets als „Jetzt habe ich’s“ transkribiert, die Stimme sagt die Kurzform nicht. `produce.py` erkennt Textänderungen und erzeugt den Clip neu.

## 5. Neuversuche

Versuche je Clip (1 Versuch = 1 TTS-Take mit Prüfung):

| Versuche | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 11 |
|---|---|---|---|---|---|---|---|---|---|
| Clips | 801 | 77 | 15 | 9 | 1 | 3 | 1 | 1 | 1 |

**Hartnäckige Fälle:**

- en/p/snowman „snowmen“: 11 Versuche, wiederholt als „snowman“ gehört
- tr/x/hard „Hmm, zor …“: 8 Versuche, das „Hmm“ wurde verschluckt. Gelöst per TTS-Schreibung „Hımm, zor …“ mit Hinweis
- tr/w/hand „el“: 7 Versuche, gelöst per Trägersatz
- tr/x/hmm1, tr/w/suitcase, en/x/hard: je 6 Versuche

Typische Ablehnungen beim Einzelwort waren Anlaut- und Vokalverwechslungen, zum Beispiel Brot → Boot, Zelt → Zeit, Ohr → Uhr, Fahrrad → Saarland, bats → That’s. Eine Prüfung am unbeschnittenen Roh-Take zeigte, dass meist die Aussprache des Takes selbst unsauber war und nicht der Schnitt.

**Nachschnitt:**

- Einzelclips aus den Läufen 05:41 (d = 0,3 s, Vorlauf-Stille blieb stehen) und 06:00 (−55 dB, Störblips im Vorlauf zählten als Sprache) wurden aus dem Roh-Take neu geschnitten und erneut geprüft. Übernommen wurde nur, was die Prüfung bestand: 288 von 315.
- Pegel: 37 Clips unter −17 LUFS wurden mit der verbesserten Render-Schleife aus dem rekonstruierten Originalschnitt neu erzeugt und geprüft. 35 davon übernommen, de/p/traffic_light zusätzlich per neuem Take (−16,4 LUFS).

## 6. Kosten

| Posten | € |
|---|---|
| Stimmentest + Diagnose (inkl. Endlos-Ausgabe) | 0,2083 |
| TTS Bündel | 0,1982 |
| TTS einzeln | 0,2556 |
| TTS Trägersatz | 0,0578 |
| STT-Prüfung (2031 Lesungen gesamt, inkl. Diagnose) | 0,1537 |
| **Summe** | **0,8736** |

Aufteilung nach Anbieter-Posten: TTS 939 Aufrufe, 0,7078 € · STT 2031 Aufrufe, 0,1658 €. Umrechnung 1 US$ = 0,92 €. Listenpreise: TTS 0,50 $/M Text-Tokens und 10 $/M Audio-Tokens; STT 1 $/M Audio-, 0,30 $/M Text- und 2,50 $/M Ausgabe-Tokens.

**Vorfall:** Ein Diagnose-Take (TR Laomedeia, Absatzformat mit Zählsatz) lief ohne Deckel auf 655 s aus und kostete allein **0,15 €**. Seitdem hat jede TTS-Anfrage `maxOutputTokens` als harte Obergrenze. Getestet: Das Limit wird eingehalten.

**budget-guard:** `record audio 0,21` (Teilbuchung Stimmentest, 05:01) + `record audio 0,67` (Rest, 06:48). Tagesstand Audio **0,97 / 1,00 €**, inklusive 0,10 € Musik. Dazu kam ein interner Deckel in `produce.py` (verbucht + unverbucht + nächste Anfrage ≤ 0,98 €). Kontingent-Probleme (429/Tageslimit) traten nicht auf.

## 7. Offene Punkte

1. **Zwei Pegel-Ausreißer:** tr/w/bee „arı“ −17,9 LUFS (nur Mehrheit 2/3) und tr/w/airplane −17,4 LUFS (beim Neu-Render von −17,7 verbessert; der Zusatz-Gain ist bei +4 dB gedeckelt). Für „arı“ blieben 4 neue Takes erfolglos (das kurze Wort wird einzeln unsauber artikuliert). Behalten wurde der verifizierte Clip.
2. **26 Clips mit längerem Vor- oder Nachlauf** (etwa 60–900 ms mehr als der neue Schnitt). Der Nachschnitt bestand die Nachprüfung nicht, deshalb blieb der ältere verifizierte Clip stehen: de/b/owl, de/b/tent, de/p/bench, de/p/camel, de/p/chair, de/p/cookie, de/p/duck, de/p/monkey, de/p/octopus, de/p/see_saw, en/p/cactus, en/p/hat, en/p/helmet, en/p/mouse, en/p/owl, en/p/see_saw, en/p/snowman, tr/n/3, tr/w/apple, tr/w/bee, tr/w/carrot, tr/w/foot, tr/w/mouth, tr/w/pizza, tr/w/teddy-bear, tr/w/train. Die exakten Dauern stehen im `manifest.json`.
3. **96 Clips nur per Mehrheit 2/3 verifiziert** (tr/w 35, de/b 24, de/p 21, tr/n 4, de/w 3, en/w 2, en/p 2, de/n 2, tr/x 2, en/x 1). Hier war die Erkennung knapp. Empfehlung: kurz reinhören, vor allem bei türkischen Kurzwörtern und deutschen Plural-Endungen (-e/-en).
4. **6 Homophon-Treffer** (siehe Abschnitt 3): akustisch nicht unterscheidbar, trotzdem einmal reinhören.
5. **Klangbild:** 680 Clips stammen aus Einzelanfragen (Zitierform), 216 aus Bündeln, 13 aus Trägersätzen. Die Lautheit ist angeglichen, kleine Unterschiede in Sprechmelodie und Tempo zwischen w/b/p-Clips desselben Worts sind möglich.
6. **Budget:** Das Tages-Cap Audio ist mit 0,97 € fast ausgeschöpft. Heute keine weiteren bezahlten Läufe, Nachbesserungen erst morgen.
7. **Menschliches Probehören** hat nicht stattgefunden. Die Verifikation ist rein maschinell (STT).

## 8. Wiederholen / Fortsetzen

```bash
cd /Users/Osman/Desktop/APPS/kalemo/tools/audio
python3 voice_test.py                              # Stimmen-A/B aus vorhandenen Takes (--generate: fehlende erzeugen)
python3 produce.py --single --rounds 1 --only de-w # Etappe: offene Clips einer Gruppe, einzeln, 1 Runde
python3 produce.py --rebundle 6 --rounds 0         # Fehlschläge in kleinen Bündeln neu
python3 produce.py --single --carrier --rounds 2   # Einzel-/Trägersatz-Neuversuche
python3 produce.py --reverify | --retrim | --rerender
python3 produce.py --report                        # verify-report.json + manifest.json aus state.json
```

Verifizierte Clips werden nie neu erzeugt. Eine Textänderung in `data/*.json` setzt den betroffenen Clip automatisch zurück.
