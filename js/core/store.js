// localStorage-Zugriff (Einstellungen, Tagesergebnisse, Serie). Keine Cookies, nichts verlässt das Gerät.
const NS = 'kalemo.';
const mem = new Map();
function get(key, def) {
  try { const v = localStorage.getItem(NS + key); return v == null ? def : JSON.parse(v); }
  catch { return mem.has(key) ? mem.get(key) : def; }
}
function set(key, val) {
  try { localStorage.setItem(NS + key, JSON.stringify(val)); } catch { mem.set(key, val); }
  return val;
}
export const store = { get, set };

const LANGS = ['de', 'en', 'tr'];
export function defaultPair() {
  const nav = (navigator.languages || [navigator.language || 'de']).map((l) => l.slice(0, 2).toLowerCase());
  const native = nav.find((l) => LANGS.includes(l)) || 'de';
  const learn = native === 'de' ? 'tr' : native === 'tr' ? 'de' : 'de';
  return { native, learn };
}
export function settings() {
  const s = get('settings', null);
  const d = defaultPair();
  return { native: d.native, learn: d.learn, muted: false, music: true, pinch: false, air: false, onboarded: false, chosenPair: false, ...(s || {}) };
}
export function saveSettings(patch) { return set('settings', { ...settings(), ...patch }); }

/**
 * Lokale Spieler-Kennung fürs Duell (Iteration 2, R2-P3-10): zufällig, 21 Bit, nichts Persönliches, verlässt das Gerät nur
 * im Duell-Link — damit nur die zwei Beteiligten den Stand sehen.
 */
export function playerId() {
  let id = get('player', 0);
  if (!Number.isInteger(id) || id < 1 || id > 0x1fffff) { id = 1 + Math.floor(Math.random() * 0x1ffffe); set('player', id); }
  return id;
}

/** Tagesergebnis (einmal pro Tag wertbar) */
export function dayResult(iso) { return get('day.' + iso, null); }
export function saveDayResult(iso, res) {
  set('day.' + iso, res);
  const idx = get('days', []); if (!idx.includes(iso)) { idx.push(iso); idx.sort(); }
  while (idx.length > 30) { const old = idx.shift(); try { localStorage.removeItem(NS + 'day.' + old); } catch {} }
  set('days', idx);
  return res;
}
export function playedDays() { return get('days', []); }

/** Serie: Tag gespielt = +1, Lücke → 1 */
export function bumpStreak(iso, prevIso) {
  const s = get('streak', { count: 0, last: null });
  if (s.last === iso) return s;
  const next = { count: s.last === prevIso ? s.count + 1 : 1, last: iso, best: Math.max(s.best || 0, s.last === prevIso ? s.count + 1 : 1) };
  return set('streak', next);
}
export function streak(todayIso, yesterdayIso) {
  const s = get('streak', { count: 0, last: null });
  if (s.last === todayIso || s.last === yesterdayIso) return s.count;
  return 0;
}
