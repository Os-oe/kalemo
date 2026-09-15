# Phase 1c — Canabalt-Selbsttest (Greybox, ohne Look/Audio)

**Frage:** Macht Malen-und-Raten schon ohne Look Spaß?
**Aufbau (15.09.2026):** `tools/canabalt.py` spielt die Tagesskizze vom 20.09.2026 mit
menschlich langsamem Timing (45 ms je Zwischenpunkt, 650 ms Pause zwischen Strichen) durch —
3 erkannte + 2 *nicht erkannte* Quick-Draw-Zeichnungen (realistisches Scheitern). Protokoll:
`tools/out/canabalt.json`, Screenshots `tools/out/canabalt-r*-*.png` (nicht im Repo, reproduzierbar).

| Runde | Wort | Quelle | Ergebnis | Tipps der KI (Wahrsch., ms) |
|---|---|---|---|---|
| 1 | Zelt | erkannt | Treffer 4,2 s | Berg 0,34 @2,9 s |
| 2 | Schneemann | erkannt | Treffer 7,1 s | Ohr 0,28 · Mond 0,32 · Uhr 0,46 |
| 3 | Stuhl | *nicht erkannt* | Treffer 10,5 s | Nase · Helm · Hut · Computer |
| 4 | Keks | erkannt | Treffer 9,1 s | Mond · Kartoffel 0,56 |
| 5 | Banane | *nicht erkannt* | Treffer 3,0 s | Bein **0,99** |

## Urteil (ehrlich)

**Ja — der Kern trägt.** Schon als Text-Blase erzeugt das Mitraten die Quick-Draw-Spannung:
Die ersten Tipps kommen genau dann, wenn die Form noch offen ist („Hmm … das Ohr?" nach dem
ersten Bogen des Schneemanns), sie sind plausibel-komisch, und der Treffer kommt, *während* man
malt — nicht erst am Ende. Die 2-s-Stille verhindert Rauschen bei den ersten Strichen; mit
1,5 s Abstand wirkt die KI eifrig, aber nicht hektisch (2–4 Tipps pro Runde).

**Was ohne Look/Audio fehlt (für Phase 4 notiert):**
1. Die Stimme ist der halbe Witz — „Bein?" bei einer Banane liest sich nett, gehört wäre es komisch.
2. Der Treffer ist nur ein Blasenwechsel — es fehlt der Belohnungs-Moment (Freeze, Chime, lebendig).
3. Die Leuchtspur zeigt bei vereinfachten Datensatz-Strichen Ecken → Kurvenglättung im Renderer.
4. Tipp-Blase springt ohne Bewegung der Zeichnung → „Zeichnung zuckt" (Juice-Checkliste).
5. Nicht erkannte Zeichnungen wurden trotzdem erkannt (Maske + Top-3 ist großzügig) — gut fürs
   Gefühl; ob es zu leicht wird, prüft der Excellence-Pass mit schlechten Kritzeleien
   (Zufallsstriche dürfen nicht treffen).

**Entscheidung:** weiter zu Phase 2, keine Mechanik-Änderung.
