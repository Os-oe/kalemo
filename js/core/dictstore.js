// Bildwörterbuch-Speicher: IndexedDB (Fallback localStorage). Nur lokal im Browser.
import { quantize } from './codec.js';

const DB = 'kalemo', STORE = 'words', LS = 'kalemo.dict';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    } catch (e) { rej(e); }
  }).catch(() => null);
  return dbp;
}
const lsAll = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };

export async function all() {
  const db = await open();
  if (!db) return Object.values(lsAll());
  return new Promise((res) => {
    const tx = db.transaction(STORE, 'readonly'); const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result || []); req.onerror = () => res(Object.values(lsAll()));
  });
}
export async function get(id) { return (await all()).find((e) => e.id === id) || null; }

/** Treffer speichern: eigene Striche (quantisiert), Datum, Artikel-Treffer, lustigster Fehltipp */
export async function put(id, { strokes, date, articleOk = null, funny = null }) {
  const prev = await get(id);
  const entry = {
    id, strokes: quantize(strokes, 2).map(([xs, ys]) => [xs, ys]), date,
    first: prev?.first || date, count: (prev?.count || 0) + 1,
    articleOk: articleOk ?? prev?.articleOk ?? null, funny: funny || prev?.funny || null,
  };
  const db = await open();
  if (!db) { const m = lsAll(); m[id] = entry; try { localStorage.setItem(LS, JSON.stringify(m)); } catch {} return entry; }
  await new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(entry); tx.oncomplete = res; tx.onerror = res; });
  return entry;
}
