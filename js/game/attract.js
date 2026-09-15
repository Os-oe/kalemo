// Attract-Loop auf dem Start (Motion-Pflicht ab Sekunde 0): Hand-Silhouette malt eine Katze als Leuchtspur.
// Iteration 1 (Review P2-8): EINE Schleife pro Lernsprache — Wort → Tipps nur in der Lernsprache → Treffer →
// Katze hüpft → Belohnungs-Karte „kedi · die Katze · cat" (Lern-, Mutter-, dritte Sprache).
// P3-16: Tagline beginnt in der Muttersprache. P3-7: prefers-reduced-motion → Standbild (fertige Katze + Karte).
import { drawStrokes, reducedMotion, rgba } from './ink.js';
import { drawPointerSilhouette } from './hands.js';
import { t, word, cap, LANGS, ART_TEXT } from '../core/i18n.js';

export const LOOP = 11.6;
const DRAW_START = 0.5, DRAW_END = 5.2, HIT_AT = 5.5, CARD_AT = 7.0, FADE = 0.5;
const TIPS = [[1.8, 2.9, 'moon'], [3.1, 4.1, 'sun'], [4.2, 5.2, 'owl']];
// Katzenkopf = data/others.json cat[0] (kuratierte Quick-Draw-Zeichnung, CC BY 4.0), eingebettet — der Start braucht so kein others.json
export const CAT = [[[24,27,36,64,84,107,130,152,170,200,216,218,215,205,191,173,153,115,99,69,41,27,24,24,29,40,53,84],[116,96,83,57,46,38,35,35,40,62,95,133,154,175,194,209,220,225,225,214,190,167,151,132,112,94,80,58]],[[202,248,255,218],[47,12,10,128]],[[65,55,4,1,14,23,34],[66,46,0,97,117,124,127]],[[204,223,230,225,212,215],[68,46,44,65,92,92]]];

export function installAttract(app) {
  const canvas = document.getElementById('attract'); const ctx = canvas.getContext('2d');
  const bubble = document.getElementById('attract-bubble'); const tag = document.getElementById('tagline');
  let raf = null, t0 = 0, loopN = -1, lastBubble = '', staticKey = '';
  const strokes = CAT;

  function setBubble(key, html) {
    if (key === lastBubble) return; lastBubble = key;
    bubble.style.opacity = key ? '1' : '0';
    bubble.classList.toggle('reward', key.startsWith('card'));
    if (key) { bubble.innerHTML = html; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function rewardHtml(order) {
    const cat = app.byId.get('cat'); if (!cat) return '';
    return order.map((l, i) => `<span class="${i === 0 ? 'rw-first' : 'rw'}" lang="${l}"${l === 'de' ? ` style="color:${ART_TEXT[cat.de.art]}"` : ''}>${esc(word(cat, l))}</span>`).join('<i> · </i>');
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return;
    const reduce = reducedMotion();
    const { learn, native } = app.settings;
    const third = LANGS.find((l) => l !== learn && l !== native);
    const order = [learn, native, third];
    const key = `${W}x${H}|${learn}|${native}`;
    if (reduce && staticKey === key) return; // Standbild: nur bei Größen-/Sprachwechsel neu zeichnen
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const time = (now - t0) / 1000, n = Math.floor(time / LOOP);
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
    const catW = app.byId.get('cat');
    // Treffer-Glühen hinter der Katze
    if (lt >= HIT_AT && !reduce) {
      const g = Math.max(0, 1 - (lt - HIT_AT) / 1.4); const cx = W / 2, cy = box.y + box.h / 2, R = Math.min(W, H) * (0.3 + 0.25 * (1 - g));
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, rgba('#FFC857', 0.28 * g)); gr.addColorStop(1, rgba('#FFC857', 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    const fit = drawStrokes(ctx, strokes, { style: 'glow', color: '#FFC857', width: 3.4 * dpr * Math.max(0.8, W / (520 * dpr)), box, progress: p, motion: { kind: 'hop', id: 'cat' }, alive, t: lt, boil: alive ? 0.5 : 0 });
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
    // Wort oben links (Klebeband sitzt jetzt oben rechts): nur das Wort in der Lernsprache
    ctx.font = `700 ${Math.round(H * 0.1)}px Caveat, cursive`; ctx.fillStyle = 'rgba(255,251,239,0.92)'; ctx.textAlign = 'left';
    ctx.fillText(word(catW, learn), W * 0.05, H * 0.15);
    ctx.globalAlpha = 1;
    // KI rät — nur in der Lernsprache; dann Treffer; dann Belohnungs-Karte in 3 Sprachen
    let bKey = '', bHtml = '';
    if (!reduce) {
      for (const [a, b, id] of TIPS) if (lt > a && lt < b) { bKey = 'tip' + id; bHtml = esc(t('guessHmm', { w: word(app.byId.get(id), learn) }, learn)); }
      if (lt >= HIT_AT && lt < CARD_AT) { bKey = 'hit'; bHtml = esc(t('guessHit', { w: cap(word(catW, learn), learn) }, learn)); }
    }
    if (lt >= CARD_AT && lt < LOOP - 0.35) { bKey = 'card' + order.join(''); bHtml = rewardHtml(order); }
    setBubble(bKey, bHtml);
    if (reduce) staticKey = key;
  }
  app.attract = {
    start() { if (raf || !canvas) return; t0 = performance.now(); loopN = -1; staticKey = ''; lastBubble = ''; raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
    /** Test: Zustand zu einem Schleifen-Zeitpunkt */
    at: (sec) => { t0 = performance.now() - sec * 1000; loopN = -1; },
  };
}
