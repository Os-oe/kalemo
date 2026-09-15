# Kalemo · Sprach-Review 3 (Abschluss-Nachprüfung)

- **Datum:** 15.09.2026
- **Rollen:** (1) Deutschlehrerin DaZ · (2) Englisch-Muttersprachlerin (britisch/international) · (3) Türkisch-Muttersprachlerin und Lehrerin
- **Geprüfter Stand:** Arbeitskopie nach Commit `be726ab` („Sprach-Review 2 umgesetzt“), nur gelesen, nichts geändert.
- **Umfang:**
  - `js/core/i18n.js`: 141 Schlüssel je Sprache (inkl. `langName`, `fingers`, `cats`), neu `dailyHint`, `helpOthers`, `modelFail`, `pluralTipTRtane`.
  - `data/words.json`: 148 Wörter, `amb` jetzt 64 Texte in 19 Wörtern. Davon sind 46 für Spieler erreichbar. Lern- und UI-Sprache können nicht gleich sein, weil `main.js` beim Wählen tauscht.
  - `data/voice-lines.json`, `index.html`, `impressum.html`, `datenschutz.html`, `credits.html`, `js/game/plural.js`.
  - Nebenbei gelesen, weil der Kontext eines Textes davon abhängt: `round.js` (Hilfe-Knopf), `flow.js` (Ansage nach der Runde), `dict.js` (Hinweis-Rahmen), `main.js` (`data-t`, Sprachwahl).
- **Per Skript geprüft:**
  - Alle Schlüssel sind in de/en/tr vorhanden, Platzhalter je Schlüssel gleich: 0 Abweichungen.
  - Kein gerades ASCII-Schlusszeichen nach „ in DE-Texten (i18n, alle `amb.*.de`, voice-lines, alle 4 HTML-Dateien): 0 Treffer. Auch keine `&quot;`-Entitäten und keine geraden Apostrophe in sichtbaren Texten.
  - Kein „falsch/Fehler/wrong/mistake/yanlış/hata“, keine Emojis oder Flaggen.
  - TR-Auslassungspunkte in i18n.js stehen ohne Leerzeichen.
- **Gerendert** (Import von `i18n.js` und `plural.js` in Node):
  - `funnyLine`: 18 Wortpaare × 3 Sprachen. Beispiele: „Die KI hielt meinen Löwen für einen Affen.“ · „Die KI hielt meinen Blitz für Regen.“ · „The AI mistook my stairs for trousers.“ · „Yapay zekâ kale yerine bank dedi.“ Die Paare face→sheep, leg→elephant und face→whale gibt `funnyAllowed` jetzt als `false` zurück.
  - `pluralPhrase`: 148 Wörter × n = 2/3/5 × 3 Sprachen. „null“ steht nur bei den 10 `kP`-Wörtern, und die sind in `plan.js` und `dict.js` ausgeschlossen. Beispiele: „üç tane saat“, „fünf Messer“, „five sheep“.
  - `ambHint` + `dictAmbig`: alle 46 erreichbaren Hinweise mit Rahmen.
  - `pluralTip`: 7 Wörter × 6 Sprachpaare. `pluralTipTRtane` wird genau bei clock, face und moon gewählt.

## Runde-2-Nachprüfung

| Nr | Status | Nachweis |
|---|---|---|
| 1 | behoben | EN-Kurzfassung: „… run locally, and no camera images or hand data are stored or sent.“ |
| 2 | behoben | TR-Kurzfassung: „… kamera görüntüleri ve el verileri kaydedilmez, hiçbir yere gönderilmez.“ |
| 3 | behoben | `preCamB` DE „Vom Kamerabild wird nichts gespeichert oder gesendet.“ · EN „No camera images are stored or sent.“ · TR „Kamera görüntüsü kaydedilmez ya da gönderilmez.“ |
| 4 | behoben | `dictAmbig` „Gut zu wissen: {h}“ · „Good to know: {h}“ · „Bilmekte fayda var: {h}“. Gerendert passt der Rahmen zu allen 46 Hinweisen (Doppelpunkt-Rest bei pants TR → neu Nr. 2) |
| 5 | behoben | `duelDraw` „… im Link steckt nur diese eine Zeichnung.“ · „… your link only contains this one drawing.“ · „… linkinde yalnızca bu çizim var.“ |
| 6 | behoben | `de.duelBack` „Du bist dran“ |
| 7 | behoben | Datenschutz §7: „… einfach ausgeschaltet lassen — gespielt wird dann nur auf dem Bildschirm.“ |
| 8 | behoben | `INSULT` enthält sheep, elephant, whale. `funnyAllowed('face','sheep')`, `('leg','elephant')`, `('face','whale')` = false |
| 9 | behoben | `castle.amb.de.en` „German has two words: a “Burg” is a fortified castle, a “Schloss” is more like a palace.“ |
| 10 | behoben | `castle.amb.de.tr` „Almancada “Burg” (kale) ile “Schloss” (şato, saray) birbirine benzer.“ |
| 11 | behoben | „Ayarlar, seri bilgin, son 30 günün sonuçları ve Resimli Sözlüğün …“ |
| 12 | behoben | Skript: 0 gerade Schlusszeichen in allen DE-Texten, die erreichbaren und die nicht erreichbaren `amb`-Texte eingeschlossen, ebenso Datenschutz §3/§5 („Hol es echt“, „Bildschirm“, „#“) und Credits („So malen andere“) |
| 13 | behoben | „„ampul“ heißt auch: kleines Glasröhrchen für Medizin.“ · „… also means a small glass tube for medicine.“ |
| 14 | behoben | `de.pinch` „Malen mit Daumen und Zeigefinger zusammen“ |
| 15 | behoben | `de.offlineModel` „Die Mal-KI lädt noch …“ |
| 16 | behoben | `clock.amb.de.en/tr` und `rabbit.amb.de.en/tr` sind vorhanden (Wortlaut clock → neu Nr. 4) |
| 17 | behoben | Credits: „nach einer verbreiteten Konvention im DaZ-Unterricht (blau/rot/grün)“ |
| 18 | behoben | `#round-speaker` `aria-label="Noch mal hören"`. Dass die statischen Labels nicht übersetzt werden → neu Nr. 5 |
| 19 | behoben | `pluralTipENreg` „Regular plural: bus → buses“ · „Regelmäßige Mehrzahl: …“ · „Düzenli çoğul: …“ |
| 20 | behoben | „… also means ‘month’.“ · „… ‘ladder’.“ · „… ‘hour’ and ‘watch’.“ |
| 21 | behoben | bench.tr.en, candle.tr.en, castle.tr.en (Ergänzung „kale“), cell phone.de.en, eyeglasses.en.de und .en.tr vorhanden (Wortlaut eyeglasses TR → neu Nr. 3) |
| 22 | behoben | `en.duelWas` „The answer: {w}“ |
| 23 | behoben | `en.reduced` „Reduce motion“ |
| 24 | behoben | „Try it in the air?“ · „Havada denemek ister misin?“ |
| 25 | behoben | „Du: {a} s“ / „Absender: {b} s“ · „You:“ / „Sender:“ · „Sen: {a} sn“ / „Gönderen: {b} sn“ |
| 26 | behoben | „clearing this site’s data“ · „a time value“ |
| 27 | behoben | `camDenied`, `camFail`, `inAppB` (tr) enden auf „… ekranda çizebilirsin.“ |
| 28 | behoben | `tr.posePause` „Açık el = dur“ |
| 29 | behoben | „Hmm… {w}?“ · „Hmm, zor…“ · „El takibi yükleniyor… %{p}“ · „İzle…“ · „Yükleniyor…“ · „… hâlâ yükleniyor…“ (voice-lines behalten das Leerzeichen, sind aber nur Sprechtext, nie Anzeige) |
| 30 | behoben | `tr.x.hit2` „Bildim!“. `audio/v1/tr/x/hit2.mp3` ist neuer als die JSON (05:29 gegenüber 04:49), den Clip selbst haben wir nicht angehört |
| 31 | behoben | `pluralTipTRtane` DE „Im Türkischen reicht die Zahl — „tane“ heißt „Stück“: üç tane saat“ · EN „… — “tane” means ‘piece’: üç tane ay“. `plural.js` wählt den Schlüssel über `w.tr.tane` |
| 32 | behoben | `bench.amb.de.tr` „Almanca “Bank” aynı zamanda banka demek (çoğulu “Banken”).“ |
| 33 | behoben | „Veri sorumlusu: OsAI by Osman Öztopcu …“ |
| 34 | behoben | Impressum TR: „Kalemo, OsAI tarafından hazırlanan ücretsiz bir demodur …“ |
| 35 | behoben | Credits: Abschnitte „In English“ und „Türkçe“ mit allen Lizenzen, Stimmen, Klang und Musik |

**Ergebnis:** Alle 35 Befunde aus Runde 2 sind umgesetzt. Keiner ist teilweise umgesetzt oder offen.

## Neue Befunde

| Nr | Prio | Rolle | Datei · Schlüssel | Ist | Soll | Begründung |
|---|---|---|---|---|---|---|
| 1 | P2 | alle | i18n.js · `timeUp` + voice-lines.json · `x.timeup`, wenn die Runde über `helpOthers` endet (`round.js`: `finish(…, 'timeout')`, `flow.js`: `missAnnounce`) | Das Kind tippt nach 8 s auf „Zeig mir, wie andere es malen“. Dann erscheint die Blase „Zeit ist um.“, und die Stimme sagt „Zeit ist um — schön versucht!“ (EN „Time’s up — nice try!“, TR „Süre doldu — güzel denemeydi!“), obwohl der Timer noch läuft. | Für den Hilfe-Weg eine eigene Blase, z. B. neuer Schlüssel `helpBubble`: DE „Schauen wir mal, wie andere es malen.“ · EN „Let’s see how others draw it.“ · TR „Bakalım başkaları nasıl çizmiş.“ Den `timeup`-Clip weglassen, nur die drei Wort-Clips abspielen. | Die Aussage stimmt nicht: Die Zeit war nicht um, das Kind hat selbst um Hilfe gebeten. Ein Kind liest daraus „ich war zu langsam“. Das widerspricht dem Zweck des Knopfs, die Runde freundlich zu beenden. Die Kartenüberschrift „Ich hab’s nicht erkannt — so malen es andere:“ kann bleiben, weil die KI die Schuld trägt. |
| 2 | P3 | TR | words.json · `pants` · `amb.en.tr` | Gerendert: „Bilmekte fayda var: “trousers” kullanıyoruz: İngiliz İngilizcesinde “pants” iç çamaşırı demek.“ | „Burada “trousers” diyoruz, çünkü İngiliz İngilizcesinde “pants” iç çamaşırı demek.“ | Mit dem neuen Rahmen stehen zwei Doppelpunkte hintereinander. Das ist der Fall aus Runde 2 Nr. 4, der dort nur für EN genannt war. Die TR-Fassung ist erreichbar (Lernsprache EN, UI TR). Bei „kullanıyoruz“ allein bleibt außerdem offen, wer „wir“ ist. |
| 3 | P3 | TR | words.json · `eyeglasses` · `amb.en.tr` | „“glasses” içme bardakları anlamına da gelir.“ | „“glasses” aynı zamanda bardaklar demek.“ | „Bardak“ ist schon das Trinkglas, „içme bardağı“ ist doppelt gemoppelt und klingt übersetzt. Die Soll-Form folgt dem Muster der übrigen TR-Hinweise („… aynı zamanda … demek“). |
| 4 | P3 | EN + TR | words.json · `clock` · `amb.de.en`, `amb.de.tr` | EN „German “Uhr” also means a watch — and the time (“3 Uhr”).“ · TR „Almanca “Uhr” kol saati ve saat (“3 Uhr”) anlamına da gelir.“ | EN „German “Uhr” also means a watch — and it’s used for the time (“3 Uhr” = 3 o’clock).“ · TR „Almanca “Uhr” aynı zamanda kol saati demek; saati söylerken de kullanılır (“3 Uhr” = saat üç).“ | Das Beispiel „3 Uhr“ wird nicht übersetzt, und Kinder können es nicht auflösen. Im TR-Satz steht als Übersetzung von „Uhr“ schon „saat“. „… saat anlamına da gelir“ sagt deshalb nichts Neues. Die Soll-Formen enthalten keinen zweiten Doppelpunkt (Rahmen „Good to know:“). |
| 5 | P3 | alle | index.html · statische `aria-label` | `section.pair` „Sprachen“, `#screen-round` „Runde“, `#round-close` „Schließen“, `#round-speaker` „Noch mal hören“, `#screen-duel` „Luft-Duell“, `#screen-dict` „Bildwörterbuch“. `applyTexts()` setzt nur `textContent` über `data-t`, die Labels bleiben also deutsch. | Die Labels bei jedem Sprachwechsel aus `T` setzen. Vorhandene Schlüssel: `close`, `speaker`, `duelT`, `dictT`. Neu nötig: `languages` („Sprachen“ · „Languages“ · „Diller“) und `round` („Runde“ · „Round“ · „Tur“). | Wer die EN- oder TR-UI mit einem Screenreader nutzt, hört „Schließen“ und „Noch mal hören“ auf Deutsch. Runde 2 Nr. 18 hat nur die DE-Schreibweise korrigiert. |
| 6 | P3 | DaZ | datenschutz.html · §3 (Überschrift und Text) | „3. Kamera (Luft-Modus und „Hol es echt“)“ · „… die Objekterkennung („Hol es echt“) …“ | „3. Kamera (Luft-Modus und „Findest du das in echt?“)“ · „… die Objekterkennung (bei „Findest du das in echt?“) …“ | „Hol es echt“ ist nur ein interner Name aus dem Code-Kommentar. Im Spiel steht der Name nirgends, dort heißt der Schritt „Findest du das in echt?“ (`realQ`). Eltern können die Stelle im Rechtstext deshalb keinem Moment im Spiel zuordnen. EN und TR sagen neutral „object detection“ bzw. „nesne tanıma“, dort ist nichts zu tun. |

## Ohne Befund

- **Neue Schlüssel:**
  - `dailyHint` (DE „5 Wörter · etwa 2 Minuten · für alle gleich“, EN und TR entsprechend) ist ein Richtwert neben dem Start-Knopf, kein Werbeversprechen. Die tatsächliche Spieldauer haben wir nicht gemessen.
  - `helpOthers`: DE „Zeig mir, wie andere es malen“ (Komma korrekt), EN „Show me how others draw it“, TR „Başkaları nasıl çiziyor, göster“ (gesprochene Form, für Kinder natürlich).
  - `modelFail` gibt nirgends dem Spieler die Schuld und passt in allen drei Sprachen zu `offlineModel` („Mal-KI“ · „drawing AI“ · „Çizim yapay zekâsı“).
  - `pluralTipTRtane` ist in allen drei Sprachen verständlich. Die TR-Fassung erscheint nur, wenn Lern- und UI-Sprache gleich sind, und das lässt die Sprachwahl nicht zu.
- **DaZ:** Die n-Deklination und `mass` in `funnyLine` stimmen weiter („meinen Diamanten für einen Teddybären“, „für Regen“, „für ein Brot“). Alle 13 erreichbaren DE-Hinweise sind kindgerecht und haben korrekte Anführungszeichen. Titel, Description und og-Texte enthalten keine Zahlen-Versprechen.
- **EN:** Artikel und Pluraliatantum in `funnyLine` stimmen („for trousers“, „for grapes“, „an ice cream“). Wortliste und Texte bleiben britisch (fire engine, sailing boat, mobile phone, synthesised). Die neuen EN-Absätze in Credits und Datenschutz widersprechen der DE-Fassung nicht und tragen den Hinweis auf die maßgebliche deutsche Fassung, wo es ein Rechtstext ist.
- **TR:** `tane` ist in Anzeige, Tipp und Audio stimmig. „Bildim!“ passt zu `duelRight` „Bildin!“. Die TR-Kurzfassungen von Impressum und Datenschutz decken sich inhaltlich mit der DE-Fassung (Datenschutz: „bir süreyi“ = die Zeitangabe des Absenders) und tragen „Hukuken geçerli olan yukarıdaki Almanca metindir.“

Offene Befunde: 6
