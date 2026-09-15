// Holt pro Kategorie ~50 Zeichnungen per HTTP-Range aus 3 Stellen der ndjson-Datei.
import fs from 'node:fs';
const WORDS = ['apple','cat','umbrella','key','cup','house','sun','fish','tree','car','bicycle','clock','banana','chair','book','scissors','dog','bird','flower','hat','shoe','bed','door','pizza'];
const PER = 50, CHUNK = 60000;
fs.mkdirSync('data', { recursive: true });
async function size(url) { const r = await fetch(url, { method: 'HEAD' }); return +r.headers.get('content-length'); }
async function range(url, a, b) { const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } }); if (r.status !== 206) throw new Error('status ' + r.status); return r.text(); }
const out = {};
await Promise.all(WORDS.map(async (w) => {
  const url = `https://storage.googleapis.com/quickdraw_dataset/full/simplified/${encodeURIComponent(w)}.ndjson`;
  const len = await size(url);
  const drawings = [];
  for (const frac of [0.05, 0.45, 0.85]) {
    const a = Math.floor(len * frac);
    const txt = await range(url, a, a + CHUNK);
    const lines = txt.split('\n').slice(1, -1); // erste + letzte Zeile ggf. abgeschnitten
    for (const l of lines.slice(0, Math.ceil(PER / 3))) { try { drawings.push(JSON.parse(l)); } catch {} }
  }
  out[w] = { bytes: len, drawings: drawings.slice(0, PER) };
}));
fs.writeFileSync('data/simplified.json', JSON.stringify(out));
console.log(Object.entries(out).map(([w, v]) => `${w}:${v.drawings.length} (${(v.bytes / 1e6).toFixed(0)}MB, recog ${v.drawings.filter(d => d.recognized).length})`).join(' | '));

// Raw-Daten (mit Zeitstempeln) für Kompressions-Rechnung, 6 Kategorien
const RAW = ['apple','cat','house','bicycle','fish','umbrella'];
const raw = {};
await Promise.all(RAW.map(async (w) => {
  const url = `https://storage.googleapis.com/quickdraw_dataset/full/raw/${encodeURIComponent(w)}.ndjson`;
  const len = await size(url);
  const txt = await range(url, Math.floor(len * 0.3), Math.floor(len * 0.3) + 250000);
  const lines = txt.split('\n').slice(1, -1).slice(0, 30);
  raw[w] = { bytes: len, drawings: lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) };
}));
fs.writeFileSync('data/raw.json', JSON.stringify(raw));
console.log('raw:', Object.entries(raw).map(([w, v]) => `${w}:${v.drawings.length} (${(v.bytes / 1e6).toFixed(0)}MB)`).join(' | '));
