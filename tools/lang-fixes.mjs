// Sprach-Review-Fixes auf die Wortdaten (idempotent). Quelle: docs/sprach-review-1.md (+ spätere Runden).
// Patcht data/words.src.json UND data/words.json (Pool), damit ein erneuter Genauigkeitslauf die Fixes nicht verliert.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const PATCH = {
  // Nr. 1: n-Deklination (Akkusativ) schwacher Maskulina
  lion: { de: { akk: 'Löwen' } }, monkey: { de: { akk: 'Affen' } }, elephant: { de: { akk: 'Elefanten' } },
  octopus: { de: { akk: 'Kraken' } }, diamond: { de: { akk: 'Diamanten' } }, 'teddy-bear': { de: { akk: 'Teddybären' } },
  // Nr. 5: grapes ohne Mehrzahl-Runde
  grapes: { kP: true, kPReason: 'Sprach-Review 1 Nr. 5: grapes ist schon Mehrzahl; TR üç üzüm = drei Beeren', de: { pl: null }, en: { pl: null } },
  // Nr. 6 + 9: TR Zählwort „tane" bei Verwechslung mit Zahl/Zeit
  face: { tr: { tane: true } }, moon: { tr: { tane: true } }, clock: { tr: { tane: true } },
  // Nr. 4/24: unzählbar → ohne Artikel im Lustig-Satz
  rain: { en: { mass: true }, de: { mass: true } }, lightning: { en: { mass: true } }, bread: { en: { mass: true } },
  // Nr. 28/33/34
  sailboat: { en: { word: 'sailing boat', pl: 'sailing boats' } },
  shark: { tr: { word: 'köpek balığı' } },
  firetruck: { tr: { word: 'itfaiye arabası' } },
  // Nr. 16 + 35: Mehrdeutigkeit als Spieler-Text, je Sprache des Wortes, in allen 3 UI-Sprachen
  bat: { amb: { en: { de: '„bat" heißt auch Schläger (Baseball, Cricket).', en: '“bat” can also mean a cricket or baseball bat.', tr: '“bat” aynı zamanda beyzbol ya da kriket sopası demek.' } } },
  mouse: { amb: { de: { de: '„Maus" heißt auch Computermaus.', en: 'German “Maus” also means a computer mouse.', tr: 'Almanca “Maus” bilgisayar faresi anlamına da gelir.' }, en: { de: '„mouse" heißt auch Computermaus.', en: '“mouse” can also mean a computer mouse.', tr: '“mouse” aynı zamanda bilgisayar faresi demek.' }, tr: { de: '„fare" heißt auch Computermaus.', en: 'Turkish “fare” also means a computer mouse.', tr: '“fare” bilgisayar faresi anlamına da gelir.' } } },
  pear: { amb: { de: { de: '„Birne" heißt auch Glühbirne.', en: 'German “Birne” also means a light bulb.', tr: 'Almanca “Birne” ampul anlamına da gelir.' } } },
  'ice cream': { amb: { de: { de: '„Eis" ist auch gefrorenes Wasser.', en: 'German “Eis” also means ice.', tr: 'Almanca “Eis” buz anlamına da gelir.' } } },
  clock: { tr: { tane: true }, amb: { tr: { de: '„saat" heißt auch Stunde und Armbanduhr.', en: 'Turkish “saat” also means hour and watch.', tr: '“saat” aynı zamanda zaman birimi ve kol saati demek.' } } },
  snake: { amb: { de: { de: '„Schlange" heißt auch Warteschlange.', en: 'German “Schlange” also means a queue.', tr: 'Almanca “Schlange” kuyruk (sıra) anlamına da gelir.' } } },
  bench: { amb: { de: { de: '„Bank" heißt auch Geldinstitut (Mehrzahl dann „Banken").', en: 'German “Bank” also means a bank for money (plural “Banken”).', tr: 'Almanca “Bank” para bankası anlamına da gelir (çoğulu “Banken”).' } } },
  pants: { amb: { en: { de: '„pants" heißt in den USA Hose, in Großbritannien Unterhose — darum „trousers".', en: 'We use “trousers”: in British English “pants” means underwear.', tr: '“trousers” kullanıyoruz: İngiliz İngilizcesinde “pants” iç çamaşırı demek.' } } },
  leaf: { amb: { de: { de: '„Blatt" heißt auch ein Blatt Papier.', en: 'German “Blatt” also means a sheet of paper.', tr: 'Almanca “Blatt” kâğıt yaprağı anlamına da gelir.' } } },
  face: { tr: { tane: true }, amb: { tr: { de: '„yüz" heißt auch hundert.', en: 'Turkish “yüz” also means one hundred.', tr: '“yüz” aynı zamanda sayı olarak yüz demek.' } } },
  moon: { tr: { tane: true }, amb: { tr: { de: '„ay" heißt auch Monat.', en: 'Turkish “ay” also means month.', tr: '“ay” aynı zamanda takvimdeki ay demek.' } } },
  castle: { amb: { de: { de: '„Burg" ist nah an „Schloss" — beides kann gemeint sein.', en: 'German “Burg” is close to “Schloss” (palace).', tr: 'Almanca “Burg” “Schloss” (saray) kelimesine yakın.' }, tr: { de: '„kale" heißt auch Fußballtor.', en: 'Turkish “kale” also means a football goal.', tr: '“kale” futbolda kale anlamına da gelir.' } } },
  cake: { amb: { tr: { de: '„pasta" heißt Torte — nicht Nudeln!', en: 'Turkish “pasta” means cake — not noodles!', tr: '“pasta” tatlı pasta demek, makarna değil.' } } },
  stairs: { amb: { tr: { de: '„merdiven" heißt auch Leiter.', en: 'Turkish “merdiven” also means ladder.', tr: '“merdiven” aynı zamanda el merdiveni demek.' } } },
  'light bulb': { amb: { tr: { de: '„ampul" heißt auch Ampulle.', en: 'Turkish “ampul” also means an ampoule.', tr: '“ampul” aynı zamanda ilaç ampulü demek.' } } },
};

// Sprach-Review 2 (docs/sprach-review-2.md): Burg/Schloss, Ampulle, falsche Freunde, Uhr, Hase, banka, Anführungszeichen
const PATCH2 = {
  castle: { amb: { de: { en: 'German has two words: a “Burg” is a fortified castle, a “Schloss” is more like a palace.', tr: 'Almancada “Burg” (kale) ile “Schloss” (şato, saray) birbirine benzer.' },
    tr: { en: 'Turkish “kale” also means a football goal — and it’s not the vegetable kale!' } } },
  'light bulb': { amb: { tr: { de: '„ampul“ heißt auch: kleines Glasröhrchen für Medizin.', en: 'Turkish “ampul” also means a small glass tube for medicine.' } } },
  moon: { amb: { tr: { en: 'Turkish “ay” also means ‘month’.' } } },
  stairs: { amb: { tr: { en: 'Turkish “merdiven” also means ‘ladder’.' } } },
  clock: { amb: { tr: { en: 'Turkish “saat” also means ‘hour’ and ‘watch’.' },
    de: { en: 'German “Uhr” also means a watch — and the time (“3 Uhr”).', tr: 'Almanca “Uhr” kol saati ve saat (“3 Uhr”) anlamına da gelir.' } } },
  rabbit: { amb: { de: { en: '“Kaninchen” and “Hase” (hare) look alike, but they are different animals.', tr: '“Kaninchen” (tavşan) ile “Hase” (yaban tavşanı) benzer ama farklı hayvanlar.' } } },
  bench: { amb: { de: { tr: 'Almanca “Bank” aynı zamanda banka demek (çoğulu “Banken”).' },
    tr: { en: 'Turkish “bank” means bench — a bank for money is “banka”.', de: '„bank“ heißt auf Türkisch Sitzbank — die Bank für Geld heißt „banka“.' } } },
  candle: { amb: { tr: { en: 'Turkish “mum” means candle — nothing to do with your mum!' } } },
  'cell phone': { amb: { de: { en: 'German “Handy” means mobile phone — not ‘handy’ (useful).' } } },
  eyeglasses: { amb: { en: { de: '„glasses“ heißt auch Trinkgläser.', tr: '“glasses” aynı zamanda bardaklar demek.' } } },
  // Sprach-Review 3 Nr. 2–4
  pants: { amb: { en: { tr: 'Burada “trousers” diyoruz, çünkü İngiliz İngilizcesinde “pants” iç çamaşırı demek.' } } },
};
Object.assign(PATCH2.clock.amb.de, { en: 'German “Uhr” also means a watch — and it’s used for the time (“3 Uhr” = 3 o’clock).', tr: 'Almanca “Uhr” aynı zamanda kol saati demek; saati söylerken de kullanılır (“3 Uhr” = saat üç).' });

function deepMerge(a, b) { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v)) { a[k] = deepMerge(a[k] && typeof a[k] === 'object' ? a[k] : {}, v); } else a[k] = v; } return a; }
for (const f of ['data/words.src.json', 'data/words.json']) {
  const p = path.join(ROOT, f); const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  let n = 0;
  for (const w of arr) if (PATCH[w.id]) { deepMerge(w, PATCH[w.id]); n++; }
  for (const w of arr) if (PATCH2[w.id]) deepMerge(w, PATCH2[w.id]);
  // Deutsche Anführungszeichen „…“ (Review 2 Nr. 12): „x" → „x“
  for (const w of arr) if (w.amb) for (const byUi of Object.values(w.amb)) for (const k of Object.keys(byUi)) byUi[k] = byUi[k].replace(/„([^"“]*)"/g, '„$1“');
  fs.writeFileSync(p, f.endsWith('src.json') ? JSON.stringify(arr, null, 1) : JSON.stringify(arr));
  console.log(f, 'gepatcht:', n);
}
