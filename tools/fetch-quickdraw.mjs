// Holt pro Wort Quick-Draw-Zeichnungen (simplified ndjson, CC BY 4.0) per HTTP-Range aus 4 Stellen der Datei.
// Ausgabe: tools/data/quickdraw.json  { id: { eval: [...50], pool: [...40], unrecognizedEval: [...20] } }
// Nur Build-Zeit — zur Laufzeit lädt die App nie etwas von Google.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/words.src.json'), 'utf8'));
const EXTRA = (process.env.EXTRA || '').split(',').filter(Boolean); // z. B. Synonym-Klassen
const ids = [...words.map((w) => w.id), ...EXTRA];
const CHUNK = 110000;
const FRACS = [0.08, 0.33, 0.58, 0.83];
fs.mkdirSync(path.join(ROOT, 'tools/data'), { recursive: true });
const OUT = path.join(ROOT, 'tools/data/quickdraw.json');
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

async function get(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, opts); if (r.ok || r.status === 206) return r; throw new Error('HTTP ' + r.status); }
    catch (e) { if (i === tries - 1) throw e; await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
  }
}
async function one(id) {
  if (out[id]?.eval?.length >= 50) return;
  const url = `https://storage.googleapis.com/quickdraw_dataset/full/simplified/${encodeURIComponent(id)}.ndjson`;
  const len = +(await get(url, { method: 'HEAD' })).headers.get('content-length');
  const rec = [], unrec = [];
  for (const f of FRACS) {
    const a = Math.floor(len * f);
    const txt = await (await get(url, { headers: { Range: `bytes=${a}-${a + CHUNK}` } })).text();
    for (const l of txt.split('\n').slice(1, -1)) {
      try { const d = JSON.parse(l); (d.recognized ? rec : unrec).push(d.drawing); } catch {}
    }
  }
  // gleichmäßig über die 4 Stellen mischen (deterministisch: abwechselnd)
  out[id] = { bytes: len, eval: rec.filter((_, i) => i % 2 === 0).slice(0, 50), pool: rec.filter((_, i) => i % 2 === 1).slice(0, 40), unrecognizedEval: unrec.slice(0, 20) };
  process.stdout.write(`${id}:${out[id].eval.length}/${out[id].pool.length} `);
}
const queue = [...ids];
await Promise.all(Array.from({ length: 10 }, async () => { while (queue.length) { const id = queue.shift(); try { await one(id); } catch (e) { console.log('\nFEHLER', id, e.message); } } }));
fs.writeFileSync(OUT, JSON.stringify(out));
const short = ids.filter((id) => !(out[id]?.eval?.length >= 50));
console.log('\nfertig', Object.keys(out).length, 'Wörter; zu wenig Daten:', short.join(', ') || '–');
