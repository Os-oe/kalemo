// Tagesskizze: deterministischer Tagesplan (für alle gleich), Tageswechsel Mitternacht Europe/Berlin.
// Slots: [neu, neu, Wiederholung(Tag−2), neu, Mehrzahl(Wort von Tag−7)]
// Vor Launch+2 / +7 ziehen die modularen Indizes automatisch Wörter vom Ende der Pool-Reihenfolge.

export const LAUNCH = '2026-09-15'; // Tagesskizze #1 = Deploy-Tag
const SEED = 0x4b414c45; // "KALE"

export function berlinDate(ms = Date.now()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date(ms)); // YYYY-MM-DD
}
const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const dayIndex = (iso) => dayNum(iso) - dayNum(LAUNCH);
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
function newWords(order, d) { const N = order.length; return [0, 1, 2].map((k) => order[mod(3 * d + k, N)]); }

/** Plan für ein Datum. pool = Wörter aus data/words.json (mit acc, kP). */
export function planFor(iso, pool) {
  const byId = new Map(pool.map((w) => [w.id, w]));
  const order = poolOrder(pool);
  const d = dayIndex(iso);
  const fresh = newWords(order, d);
  // leichtestes neues Wort zuerst (schneller erster Treffer), Rest in Planreihenfolge
  const sorted = [...fresh].sort((a, b) => (byId.get(b).acc ?? 0) - (byId.get(a).acc ?? 0) || fresh.indexOf(a) - fresh.indexOf(b));
  const review = newWords(order, d - 2)[mod(d, 3)];
  const used = new Set([...fresh, review]);
  let plural = null;
  const cand = newWords(order, d - 7);
  for (let k = 0; k < 3 && !plural; k++) { const id = cand[mod(d + k, 3)]; if (!byId.get(id).kP && !used.has(id)) plural = id; }
  for (let s = 0; !plural && s < order.length; s++) { // Fallback: nächstes pluralfähiges Wort nach Tag−7
    const id = order[mod(3 * (d - 7) + 3 + s, order.length)]; if (!byId.get(id).kP && !used.has(id)) plural = id;
  }
  const n = 2 + (mod(d * 2654435761, 7) % 2); // 2 oder 3
  return {
    date: iso, index: d, number: dayNumber(iso),
    slots: [
      { id: sorted[0], kind: 'new' }, { id: sorted[1], kind: 'new' },
      { id: review, kind: 'review' },
      { id: sorted[2], kind: 'new' },
      { id: plural, kind: 'plural', n },
    ],
  };
}
