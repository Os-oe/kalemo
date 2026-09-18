// Attract-Loop auf dem Start (Motion-Pflicht ab Sekunde 0): Hand-Silhouette malt ein Motiv als Leuchtspur.
// Iteration 1 (Review P2-8): EINE Schleife pro Lernsprache — Wort → Tipps nur in der Lernsprache → Treffer → Motiv lebt →
// Belohnungs-Karte „mantar · der Pilz · mushroom" (Lern-, Mutter-, dritte Sprache).
// Iteration 2 (R2-P3-1): das Motiv ist nie ein Wort der kuratierten Launch-Tage #1–#14 und nie ein Wort des heutigen Plans
// (vorher immer die Katze = Wort 1 von Tag #1). Eigenes Motiv je Lernsprache, Fallback-Reihe bei Überschneidung; Tipps ebenso gefiltert.
// P3-16: Tagline beginnt in der Muttersprache. P3-7: prefers-reduced-motion → Standbild (fertiges Motiv + Karte).
import { drawStrokes, reducedMotion, rgba } from './ink.js';
import { drawPointerSilhouette } from './hands.js';
import { t, word, cap, LANGS, ART_TEXT } from '../core/i18n.js';
import { planFor, CURATED } from '../core/plan.js';

// Iteration 3 (R3-P2-4): Malen füllt mehr als die Hälfte der Schleife, die Auflösungskarte ist deutlich kürzer.
export const LOOP = 11.0;
const DRAW_START = 0.4, DRAW_END = 6.4, HIT_AT = 6.6, CARD_AT = 7.6, FADE = 0.5;
const TIP_TIMES = [[1.9, 3.3], [3.5, 4.9], [5.0, 6.4]];
// Kuratierte Quick-Draw-Zeichnungen (data/examples.json, CC BY 4.0), eingebettet — der Start braucht so keine Datendatei
export const MOTIFS = {
  mushroom: { tips: ['hat', 'ice cream', 'leaf'], strokes: [[[79,83,96,90,63,1,0,12,37,85,111,125,144,191,206,226,247,255,184,150,130,113,96,69],[234,197,146,143,140,118,114,94,69,27,7,1,0,20,31,55,100,148,120,112,112,156,233,218]],[[97,108,110,137],[144,102,105,113]],[[88,82,82,86,99,116,122,124,122,114,98,88],[49,66,80,82,82,74,67,53,41,36,36,41]],[[182,163,159,160,173,191,199,202,208,208,199,189],[66,82,89,93,102,106,104,98,69,54,50,50]],[[53,73,82,86,87,81,62,44,44],[115,130,133,122,99,92,90,105,108]],[[36,59,69,70],[64,68,50,33]],[[154,160],[17,29]]] },
  'soccer ball': { tips: ['moon', 'clock', 'watermelon'], strokes: [[[129,114,106,59,27,12,6,1,2,12,29,43,68,104,124,157,179,198,214,220,224,224,214,179,151,119,97],[249,255,254,229,198,177,164,138,90,68,41,25,8,0,0,11,25,44,71,94,129,168,194,235,248,253,251]],[[26,36,48,53,53,47,10],[52,55,74,91,111,123,164]],[[63,69,84,90,107,128,155,185],[16,43,67,73,78,76,61,23]],[[208,186,167,161,161,168,181,198,227],[88,92,104,113,139,157,170,179,186]],[[74,74,91,114,139,156,173,184,181],[233,221,201,190,190,195,209,238,245]],[[120,102,88,81,79,87,93,113,126,135,135,125,107,98,97],[141,143,138,131,114,102,99,96,100,109,120,139,141,135,127]]] },
  'light bulb': { tips: ['pear', 'hot air balloon', 'ice cream'], strokes: [[[78,82,96,102,128,144,151,152,151,146],[170,201,244,251,255,249,232,174,167,163]],[[75,95,148],[168,164,162]],[[135,112,116,135,121],[183,189,198,213,234]],[[88,66,63,64,74,83,114,129,150,159,167,165,154,151],[167,134,126,107,84,76,64,63,68,72,84,112,134,154]],[[61,28],[53,27]],[[35,0],[93,100]],[[141,170],[27,0]],[[196,233],[91,85]]] },
  rain: { tips: ['moon', 'hat', 'leaf'], strokes: [[[5,0,11,29,43,79,83,91,101,120,160,180,185,197,219,243,251,255,252,240,228,208,156,112,104,101,102,94,80,62,39,17,8,8],[21,54,73,80,80,71,83,91,96,96,84,70,80,84,82,72,66,58,41,20,11,4,2,13,21,30,16,6,1,0,2,10,15,24]],[[46,36,36,41,48,48],[94,107,113,114,108,98]],[[109,107,117,117,111],[112,126,127,119,110]],[[169,168,173,177,172],[110,129,129,125,112]],[[61,56,58,67,68,64],[152,166,173,173,162,153]],[[126,123,132,133,126],[159,176,178,176,162]],[[191,191,197,199,199,193],[160,170,173,171,162,156]]] },
  helicopter: { tips: ['hat', 'clock', 'leaf'], strokes: [[[82,57,35,24,24,41,75,117],[81,80,97,113,140,158,179,180]],[[103,174,175,167,156,124,81,72],[180,186,138,117,105,95,72,72]],[[90,47],[180,220]],[[28,244],[220,218]],[[140,160],[189,218]],[[90,93],[74,51]],[[88,0,10],[50,47,52]],[[90,92],[51,0]],[[94,164],[51,54]]] },
};
/** Eigenes Motiv je Lernsprache, danach die Fallback-Reihe */
const ORDER = { tr: ['mushroom', 'soccer ball', 'light bulb', 'rain', 'helicopter'], de: ['soccer ball', 'mushroom', 'light bulb', 'rain', 'helicopter'], en: ['light bulb', 'mushroom', 'soccer ball', 'rain', 'helicopter'] };
const SPARE_TIPS = ['moon', 'hat', 'clock', 'leaf', 'onion', 'cookie', 'potato', 'pear', 'ice cream', 'watermelon'];
const CURATED_IDS = new Set(CURATED.flat().map(([id]) => id));

/**
 * Motive + je 3 Tipps für Lernsprache und Datum (pure, testbar). Iteration 3 (R3-P2-4): 3–4 Motive im Wechsel
 * statt dreimal derselbe Pilz — keins aus den kuratierten Tagen #1–#14, keins aus dem heutigen Plan.
 */
export function pickMotifs(learn, planIds, byId, count = 4) {
  const blocked = new Set([...CURATED_IDS, ...planIds]);
  const ids = (ORDER[learn] || ORDER.de).filter((m) => !blocked.has(m) && byId.has(m)).slice(0, count);
  const list = (ids.length ? ids : [ORDER.de[0]]).map((id) => ({
    id, tips: [...MOTIFS[id].tips, ...SPARE_TIPS].filter((x, i, a) => a.indexOf(x) === i && x !== id && !blocked.has(x) && byId.has(x)).slice(0, 3),
  }));
  return list;
}
/** Erstes Motiv (Rückwärtskompatibilität für Werkzeuge) */
export function pickMotif(learn, planIds, byId) { return pickMotifs(learn, planIds, byId)[0]; }
// Rückwärtskompatibel für Werkzeuge (Szenen, OG-Bild): früheres Katzen-Motiv
export const CAT = MOTIFS.mushroom.strokes;

export function installAttract(app) {
  const canvas = document.getElementById('attract'); const ctx = canvas.getContext('2d');
  const bubble = document.getElementById('attract-bubble'); const tag = document.getElementById('tagline');
  let raf = null, t0 = 0, loopN = -1, lastBubble = '', staticKey = '', lastPair = '', motifs = null;

  function setBubble(key, html) {
    if (key === lastBubble) return; lastBubble = key;
    bubble.style.opacity = key ? '1' : '0';
    bubble.classList.toggle('reward', key.startsWith('card'));
    if (key) { bubble.innerHTML = html; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function rewardHtml(order, w) {
    if (!w) return '';
    return order.map((l, i) => `<span class="${i === 0 ? 'rw-first' : 'rw'}" lang="${l}"${l === 'de' ? ` style="color:${ART_TEXT[w.de.art]}"` : ''}>${esc(word(w, l))}</span>`).join('<i> · </i>');
  }
  /** Motiv-Reihe neu wählen (Sprachwechsel, neuer Tag) */
  function choose() {
    const { learn } = app.settings; const iso = app.today();
    const key = `${learn}|${iso}|${app.words.length}`;
    if (motifs && motifs.key === key) return motifs;
    const planIds = app.words.length ? planFor(iso, app.words).slots.map((s) => s.id) : [];
    const list = pickMotifs(learn, planIds, app.byId).map((m) => ({ ...m, strokes: MOTIFS[m.id].strokes }));
    motifs = { key, list, iso, learn };
    setInfo(0);
    return motifs;
  }
  /** Sichtbares Motiv melden (Spoiler-Wächter G1 und Tests lesen app.attract.info) */
  function setInfo(i) {
    const m = motifs.list[i];
    app.attract.info = { motif: m.id, tips: m.tips.slice(), motifs: motifs.list.map((x) => x.id), date: motifs.iso, learn: motifs.learn };
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return;
    const reduce = reducedMotion();
    const { learn, native } = app.settings;
    const list = choose().list;
    const time = (now - t0) / 1000, n = Math.floor(time / LOOP);
    // R3-P2-4: je Schleife ein anderes Motiv (Standbild bei prefers-reduced-motion bleibt bei einem)
    const mi = reduce ? 0 : ((n % list.length) + list.length) % list.length;
    const m = list[mi]; const mw = app.byId.get(m.id);
    if (!mw) return;
    if (app.attract.info?.motif !== m.id) setInfo(mi);
    const third = LANGS.find((l) => l !== learn && l !== native);
    const order = [learn, native, third];
    const key = `${W}x${H}|${learn}|${native}|${m.id}`;
    if (reduce && staticKey === key) return; // Standbild: nur bei Größen-/Sprachwechsel neu zeichnen
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    if (lastPair !== learn + native) { lastPair = learn + native; loopN = -1; lastBubble = ''; } // Sprachwechsel: Tagline + Blase sofort neu
    const lt = reduce ? CARD_AT + 1 : time % LOOP;
    if (n !== loopN || reduce) {
      loopN = n; const tl = reduce ? native : [native, learn, third][n % 3]; // Tagline zuerst in der Muttersprache
      if (tag.textContent !== t('tagline', {}, tl)) { tag.textContent = t('tagline', {}, tl); tag.lang = tl; }
      if (!reduce) { tag.parentElement.classList.remove('fade'); void tag.offsetWidth; tag.parentElement.classList.add('fade'); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#13203A'; ctx.fillRect(0, 0, W, H);
    const dt = reduce ? 0 : time;
    for (let i = 0; i < 26; i++) { const x = ((i * 97.13 + dt * 6 * (1 + (i % 3))) % W), y = (i * 53.7 * dpr) % H; ctx.fillStyle = `rgba(255,236,190,${0.06 + (i % 4) * 0.03})`; ctx.beginPath(); ctx.arc(x, y, (1 + (i % 3)) * dpr, 0, 6.28); ctx.fill(); }
    const box = { x: W * 0.22, y: H * 0.1, w: W * 0.56, h: H * 0.66 };
    const p = reduce ? 1 : Math.max(0, Math.min(1, (lt - DRAW_START) / (DRAW_END - DRAW_START)));
    const alive = reduce ? 0 : lt > HIT_AT + 0.15 ? Math.min(1, (lt - HIT_AT - 0.15) * 3) : 0;
    const fade = reduce ? 1 : lt > LOOP - FADE ? (LOOP - lt) / FADE : lt < 0.25 ? lt / 0.25 : 1;
    ctx.globalAlpha = fade;
    // Treffer-Glühen hinter dem Motiv
    if (lt >= HIT_AT && !reduce) {
      const g = Math.max(0, 1 - (lt - HIT_AT) / 1.4); const cx = W / 2, cy = box.y + box.h / 2, R = Math.min(W, H) * (0.3 + 0.25 * (1 - g));
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, rgba('#FFC857', 0.28 * g)); gr.addColorStop(1, rgba('#FFC857', 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    const strokes = m.strokes;
    const fit = drawStrokes(ctx, strokes, { style: 'glow', color: '#FFC857', width: 3.4 * dpr * Math.max(0.8, W / (520 * dpr)), box, progress: p, motion: { kind: mw.motion === 'munch' ? 'hop' : mw.motion, id: m.id }, alive, t: lt, boil: alive ? 0.5 : 0 });
    // Funken beim Treffer
    if (!reduce && lt >= HIT_AT && lt < HIT_AT + 1.2 && fit) {
      const k = (lt - HIT_AT) / 1.2;
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + i, d = (0.1 + k * 0.32) * Math.min(W, H); ctx.fillStyle = rgba(i % 2 ? '#FFF6D8' : '#FFC857', 1 - k); ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * d, box.y + box.h / 2 + Math.sin(a) * d, (2.2 - k) * dpr, 0, 6.28); ctx.fill(); }
    }
    // Hand-Silhouette an der aktuellen Spitze
    if (p > 0 && p < 1 && fit) {
      let total = 0; for (const s of strokes) total += s[0].length;
      let k = Math.max(0, Math.round(total * p) - 1); let si = 0; while (si < strokes.length && k >= strokes[si][0].length) { k -= strokes[si][0].length; si++; }
      const s = strokes[Math.min(si, strokes.length - 1)]; const [hx, hy] = fit.map(s[0][Math.min(k, s[0].length - 1)], s[1][Math.min(k, s[0].length - 1)]);
      drawPointerSilhouette(ctx, hx, hy, 0.9 * dpr * Math.max(0.7, H / (360 * dpr)), { fill: 'rgba(255,251,239,0.14)', stroke: 'rgba(255,251,239,0.6)' });
    }
    // Wort oben links (Klebeband sitzt oben rechts): nur das Wort in der Lernsprache, lange Wörter passen sich an
    let fs = Math.round(H * 0.1); ctx.font = `700 ${fs}px Caveat, cursive`;
    const label = word(mw, learn); const maxW = W * 0.62; const tw = ctx.measureText(label).width;
    if (tw > maxW) { fs = Math.max(10, Math.floor(fs * maxW / tw)); ctx.font = `700 ${fs}px Caveat, cursive`; }
    ctx.fillStyle = 'rgba(255,251,239,0.92)'; ctx.textAlign = 'left';
    ctx.fillText(label, W * 0.05, H * 0.15);
    ctx.globalAlpha = 1;
    // KI rät — nur in der Lernsprache; dann Treffer; dann Belohnungs-Karte in 3 Sprachen
    let bKey = '', bHtml = '';
    if (!reduce) {
      m.tips.forEach((id, i) => { const [a, b] = TIP_TIMES[i]; if (lt > a && lt < b) { bKey = 'tip' + id; bHtml = esc(t('guessHmm', { w: word(app.byId.get(id), learn) }, learn)); } });
      if (lt >= HIT_AT && lt < CARD_AT) { bKey = 'hit' + m.id; bHtml = esc(t('guessHit', { w: cap(word(mw, learn), learn) }, learn)); }
    }
    if (lt >= CARD_AT && lt < LOOP - 0.35) { bKey = 'card' + order.join('') + m.id; bHtml = rewardHtml(order, mw); }
    setBubble(bKey, bHtml);
    if (reduce) staticKey = key;
  }
  app.attract = {
    info: null,
    start() { if (raf || !canvas) return; t0 = performance.now(); loopN = -1; staticKey = ''; lastBubble = ''; raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
    /** Test: Zustand zu einem Schleifen-Zeitpunkt */
    at: (sec) => { t0 = performance.now() - sec * 1000; loopN = -1; },
    /** Tageswechsel/Sprachwechsel: Motive neu wählen */
    refresh: () => { motifs = null; lastBubble = ''; staticKey = ''; },
  };
  choose();
}
