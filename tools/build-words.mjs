// Parst WORTLISTE.md (op-plan) → data/words.src.json (alle 150 Einträge, angereichert).
// Aufruf: node tools/build-words.mjs [pfad/zur/WORTLISTE.md]
// Einzige Quelle danach: data/words.src.json → tools/accuracy (Pool-Filter) → data/words.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = process.argv[2] || '/Users/Osman/Desktop/APPS/agent-studio/.planning/one-prompt/kalemo/WORTLISTE.md';
const md = fs.readFileSync(SRC, 'utf8');

// EN-Plural: unregelmäßige + Sonderfälle explizit, sonst Regel.
const EN_PL = {
  mouse: 'mice', foot: 'feet', tooth: 'teeth', sheep: 'sheep', fish: 'fish', knife: 'knives',
  leaf: 'leaves', snowman: 'snowmen', cactus: 'cacti', octopus: 'octopuses', potato: 'potatoes',
  bus: 'buses', sandwich: 'sandwiches', watch: 'watches', bench: 'benches', 'mobile phone': 'mobile phones',
  'fire engine': 'fire engines', 'teddy bear': 'teddy bears', 'T-shirt': 'T-shirts',
};
// Wörter, deren Mehrzahl in mindestens einer Sprache nicht sauber funktioniert → global [kP]
// (Tagesplan ist für alle gleich, also muss der Plural in allen drei Lernsprachen tragen).
const EXTRA_KP = {
  eyeglasses: 'EN glasses = Paarwort (three glasses = Trinkgläser)',
  pants: 'EN trousers = Paarwort',
  scissors: 'EN scissors = Paarwort',
  stairs: 'EN stairs = Pluralwort',
  drums: 'EN drums = Pluralwort',
};
const enPlural = (w) => {
  if (EN_PL[w]) return EN_PL[w];
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
};

const rows = md.split('\n').filter((l) => /^\| [a-z]/.test(l) && !l.startsWith('| quickdraw_id'));
const words = rows.map((l) => {
  const c = l.split('|').slice(1, -1).map((s) => s.trim());
  const [id, catRaw, deFull, dePlRaw, en, tr, hints] = c;
  const m = deFull.match(/^(der|die|das) (.+)$/);
  if (!m) throw new Error('DE ohne Artikel: ' + l);
  const kP = /\[kP\]/.test(hints) || dePlRaw === '–' || !!EXTRA_KP[id];
  const echt = (hints.match(/(?:^|[ ·])echt \(([^)]+)\)/) || [])[1] || null;
  const noEcht = /NICHT „echt"/.test(hints);
  const category = catRaw; // z. B. "Tier (fliegt)"
  const motion = (() => {
    if (/Wasser/.test(catRaw)) return 'swim';
    if (/fliegt/.test(catRaw)) return 'fly';
    if (catRaw.startsWith('Tier')) return 'hop';
    if (catRaw.startsWith('Fahrzeug')) return 'drive';
    if (catRaw === 'Essen') return 'munch';
    if (catRaw === 'Wetter/Himmel') return 'weather';
    if (catRaw === 'Natur') return 'grow';
    if (catRaw === 'Musik') return 'music';
    if (['Gebäude', 'Straße'].includes(catRaw)) return 'glow';
    if (catRaw === 'Körper') return 'wobble';
    return 'bounce'; // Haus, Küche, Ding, Kleidung, Spiel, Draußen
  })();
  const sfx = (() => {
    if (catRaw.startsWith('Tier')) return 'animal';
    if (/fliegt/.test(catRaw) && catRaw.startsWith('Fahrzeug')) return 'flyer';
    if (catRaw.startsWith('Fahrzeug')) return 'vehicle';
    return { Essen: 'food', 'Wetter/Himmel': 'weather', Natur: 'plant', Musik: 'music', Kleidung: 'clothes',
      Körper: 'body', Haus: 'house', Küche: 'house', Gebäude: 'building', Straße: 'building', Spiel: 'toy',
      Ding: 'toy', Draußen: 'house' }[catRaw] || 'toy';
  })();
  return {
    id, cls: id.replace(/ /g, '_'), category, motion, sfx,
    de: { art: m[1], noun: m[2], pl: kP ? null : (dePlRaw === '–' ? null : dePlRaw) },
    en: { word: en, pl: kP ? null : enPlural(en) },
    tr: { word: tr },
    kP, kPReason: EXTRA_KP[id] || (kP ? 'WORTLISTE [kP]' : null),
    ambiguous: /\[M\]/.test(hints), hint: hints || null,
    weak: /Erkennung schwach/.test(hints),
    echt: noEcht ? null : echt,
  };
});
if (words.length !== 150) console.warn('Achtung: erwartet 150 Wörter, gefunden', words.length);
const ids = new Set(words.map((w) => w.id));
if (ids.size !== words.length) throw new Error('doppelte IDs');
const classes = fs.readFileSync(path.join(ROOT, 'models/v1/doodlenet/class_names.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const missing = words.filter((w) => !classes.includes(w.cls)).map((w) => w.id);
if (missing.length) throw new Error('nicht in DoodleNet-Klassen: ' + missing.join(', '));
fs.writeFileSync(path.join(ROOT, 'data/words.src.json'), JSON.stringify(words, null, 1));
const art = words.reduce((a, w) => ((a[w.de.art] = (a[w.de.art] || 0) + 1), a), {});
console.log('words', words.length, 'articles', JSON.stringify(art), 'kP', words.filter((w) => w.kP).length,
  'echt', words.filter((w) => w.echt).map((w) => w.id + ':' + w.echt).join(' '));
