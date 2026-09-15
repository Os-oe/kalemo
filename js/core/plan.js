// Tagesskizze: deterministischer Tagesplan (für alle gleich), Tageswechsel Mitternacht Europe/Berlin.
// Slots: [neu, neu, Wiederholung(Tag−2), neu, Mehrzahl(Wort von Tag−7)]
// Vor Launch+2 / +7 ziehen die modularen Indizes automatisch Wörter vom Ende der Pool-Reihenfolge.

/**
 * EINZIGER Anker der Tagesskizze (Nachtrag 1.1): Tag #1. Tagesnummer, Teilen-Karte, Duell-/Serien-Daten und der
 * kuratierte Launch-Plan leiten sich hiervon ab. BEIM LAUNCH auf den tatsächlichen Post-Tag setzen + redeployen.
 * Vor dem Anker gilt Inhalt + Nummer von Tag #1.
 */
export const LAUNCH_DATE = '2026-09-15';
export const LAUNCH = LAUNCH_DATE; // Alias (ältere Werkzeuge)
const SEED = 0x4b414c45; // "KALE"

export function berlinDate(ms = Date.now()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date(ms)); // YYYY-MM-DD
}
/** Millisekunden bis zur nächsten Mitternacht Europe/Berlin (Tageswechsel der Tagesskizze, sommerzeitfest) */
export function msToBerlinMidnight(ms = Date.now()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  let left = (24 * 3600 - ((+p.hour % 24) * 3600 + +p.minute * 60 + +p.second)) * 1000 - (ms % 1000);
  const today = berlinDate(ms);
  if (berlinDate(ms + left) === today) left += 3600000; // Umstellung auf Winterzeit (25-h-Tag)
  else if (berlinDate(ms + left - 3600000) !== today) left -= 3600000; // Umstellung auf Sommerzeit (23-h-Tag)
  return Math.max(0, left);
}
const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const dayIndex = (iso) => Math.max(0, dayNum(iso) - dayNum(LAUNCH_DATE)); // vor dem Anker = Tag #1
export const addDays = (iso, n) => new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);
export const dayNumber = (iso) => Math.max(1, dayIndex(iso) + 1);

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const orderCache = new Map();
export function poolOrder(pool) {
  const key = pool.map((w) => w.id).join('|');
  if (orderCache.has(key)) return orderCache.get(key);
  const ids = pool.map((w) => w.id).sort();
  const rnd = mulberry32(SEED);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  orderCache.set(key, ids);
  return ids;
}
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Launch-Tage #1–#14 fest kuratiert (Iteration 1, Review P2-7 + Nachtrag 1.1): leicht + ikonisch, Tag #1 beginnt mit
 * der Katze. Nur Wörter mit Top-3 ≥ 90 % UND Top-1 ≥ 80 % im accuracy-report (Luft-Simulation), keine als mehrdeutig
 * markierten Wörter, kein Sandwich. Artikel-Schritt + Mehrzahl frühestens ab Tag #3 (Tag #1/#2: 5 Einzelwörter,
 * DE-Lernende sehen den Artikel direkt in Farbe). Wiederholung = neues Wort von Tag−2 (Tag #2: von Tag #1),
 * Mehrzahl = frühes Launch-Wort. 14 Tage = Puffer, falls der Launch-Post später kommt.
 */
export const CURATED = [
  [['cat', 'new'], ['house', 'new'], ['sun', 'new'], ['tree', 'new'], ['fish', 'new']],
  [['apple', 'new'], ['car', 'new'], ['fish', 'review'], ['flower', 'new'], ['star', 'new']],
  [['cloud', 'new'], ['book', 'new'], ['cat', 'review'], ['cup', 'new'], ['apple', 'plural', 3]],
  [['snail', 'new'], ['umbrella', 'new'], ['car', 'review'], ['eye', 'new'], ['tree', 'plural', 2]],
  [['bicycle', 'new'], ['owl', 'new'], ['book', 'review'], ['snowman', 'new'], ['cat', 'plural', 2]],
  [['carrot', 'new'], ['guitar', 'new'], ['umbrella', 'review'], ['airplane', 'new'], ['star', 'plural', 3]],
  [['cake', 'new'], ['giraffe', 'new'], ['owl', 'review'], ['crown', 'new'], ['flower', 'plural', 2]],
  [['lion', 'new'], ['pineapple', 'new'], ['guitar', 'review'], ['key', 'new'], ['car', 'plural', 3]],
  [['butterfly', 'new'], ['mountain', 'new'], ['giraffe', 'review'], ['teapot', 'new'], ['house', 'plural', 2]],
  [['penguin', 'new'], ['bus', 'new'], ['lion', 'review'], ['camel', 'new'], ['book', 'plural', 3]],
  [['zebra', 'new'], ['snowflake', 'new'], ['mountain', 'review'], ['sheep', 'new'], ['cup', 'plural', 2]],
  [['hedgehog', 'new'], ['tent', 'new'], ['penguin', 'review'], ['sailboat', 'new'], ['umbrella', 'plural', 2]],
  [['octopus', 'new'], ['cactus', 'new'], ['zebra', 'review'], ['squirrel', 'new'], ['snail', 'plural', 3]],
  [['bee', 'new'], ['sweater', 'new'], ['tent', 'review'], ['lighthouse', 'new'], ['owl', 'plural', 2]],
];
const CURATED_NEW = CURATED.map((day) => day.filter(([, k]) => k === 'new').map(([id]) => id));
const CURATED_IDS = new Set(CURATED_NEW.flat());

/** Reihenfolge für Tag #8 ff.: erst alle nicht kuratierten Wörter (gemischt), die Launch-Wörter kommen erst im nächsten Umlauf wieder */
function algoOrder(pool) {
  const order = poolOrder(pool);
  const valid = order.filter((id) => !CURATED_IDS.has(id));
  return valid.length === order.length ? order : [...valid, ...order.filter((id) => CURATED_IDS.has(id))];
}
/** Neue Wörter eines Tages (kuratiert für #1–#7, sonst deterministisch aus der Pool-Reihenfolge) */
function newWords(order, d, byId) {
  if (d >= 0 && d < CURATED.length && CURATED_NEW[d].every((id) => byId.has(id))) return CURATED_NEW[d];
  const N = order.length, e = d - CURATED.length;
  return [0, 1, 2].map((k) => order[mod(3 * e + k, N)]);
}

/** Plan für ein Datum. pool = Wörter aus data/words.json (mit acc, kP). */
export function planFor(iso, pool) {
  const byId = new Map(pool.map((w) => [w.id, w]));
  const d = dayIndex(iso);
  const base = { date: iso, index: d, number: dayNumber(iso) };
  if (d >= 0 && d < CURATED.length && CURATED[d].every(([id]) => byId.has(id))) {
    const early = d < 2; // Tag #1/#2: kein Artikel-Schritt, keine Mehrzahl
    return { ...base, curated: true, slots: CURATED[d].map(([id, kind, n]) => ({ id, kind, ...(n ? { n } : {}), ...(early ? { article: false } : {}) })) };
  }
  const order = algoOrder(pool);
  const fresh = newWords(order, d, byId);
  // leichtestes neues Wort zuerst (schneller erster Treffer), Rest in Planreihenfolge
  const sorted = [...fresh].sort((a, b) => (byId.get(b).acc ?? 0) - (byId.get(a).acc ?? 0) || fresh.indexOf(a) - fresh.indexOf(b));
  const prev2 = newWords(order, d - 2, byId);
  const review = prev2.find((id, i) => i >= mod(d, 3) && !fresh.includes(id)) || prev2.find((id) => !fresh.includes(id)) || prev2[0];
  const used = new Set([...fresh, review]);
  let plural = null;
  const cand = newWords(order, d - 7, byId);
  for (let k = 0; k < cand.length && !plural; k++) { const id = cand[mod(d + k, cand.length)]; if (!byId.get(id).kP && !used.has(id)) plural = id; }
  for (let s = 0; !plural && s < order.length; s++) { // Fallback: nächstes pluralfähiges Wort nach Tag−7
    const id = order[mod(3 * (d - 7 - CURATED.length) + 3 + s, order.length)]; if (!byId.get(id).kP && !used.has(id)) plural = id;
  }
  const n = 2 + (mod(d * 2654435761, 7) % 2); // 2 oder 3
  return {
    ...base,
    slots: [
      { id: sorted[0], kind: 'new' }, { id: sorted[1], kind: 'new' },
      { id: review, kind: 'review' },
      { id: sorted[2], kind: 'new' },
      { id: plural, kind: 'plural', n },
    ],
  };
}
