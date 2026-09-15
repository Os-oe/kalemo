// Attract-Loop auf dem Start (Motion-Pflicht ab Sekunde 0): Hand-Silhouette malt eine Katze als Leuchtspur,
// die KI rät in wechselnder Sprache, die Katze wird lebendig — beantwortet „was ist das?" in < 10 s.
import { drawStrokes, reducedMotion } from './ink.js';
import { drawPointerSilhouette } from './hands.js';
import { t, word, cap, LANGS } from '../core/i18n.js';

const LOOP = 9.2, DRAW_START = 0.5, DRAW_END = 5.4;

export function installAttract(app) {
  const canvas = document.getElementById('attract'); const ctx = canvas.getContext('2d');
  const bubble = document.getElementById('attract-bubble'); const tag = document.getElementById('tagline');
  let raf = null, t0 = 0, strokes = null, loopN = -1, lastBubble = '';
  app.others().then((o) => { strokes = o.cat[0].strokes; });

  function setBubble(text) {
    if (text === lastBubble) return; lastBubble = text;
    bubble.style.opacity = text ? '1' : '0';
    if (text) { bubble.textContent = text; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const time = (now - t0) / 1000, n = Math.floor(time / LOOP), lt = time % LOOP;
    if (n !== loopN) { loopN = n; const l = LANGS[(n + LANGS.indexOf(app.settings.learn)) % 3]; tag.textContent = t('tagline', {}, l); tag.lang = l; tag.parentElement.classList.remove('fade'); void tag.offsetWidth; tag.parentElement.classList.add('fade'); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    // Nachtbühne mit Staub
    ctx.fillStyle = '#13203A'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { const x = ((i * 97.13 + time * 6 * (1 + (i % 3))) % W), y = (i * 53.7 * dpr) % H; ctx.fillStyle = `rgba(255,236,190,${0.06 + (i % 4) * 0.03})`; ctx.beginPath(); ctx.arc(x, y, (1 + (i % 3)) * dpr, 0, 6.28); ctx.fill(); }
    if (!strokes) return;
    const box = { x: W * 0.22, y: H * 0.08, w: W * 0.56, h: H * 0.72 };
    const reduce = reducedMotion();
    const p = reduce ? 1 : Math.max(0, Math.min(1, (lt - DRAW_START) / (DRAW_END - DRAW_START)));
    const alive = lt > DRAW_END + 0.25 ? Math.min(1, (lt - DRAW_END - 0.25) * 3) : 0;
    const fade = lt > LOOP - 0.5 ? (LOOP - lt) / 0.5 : 1;
    ctx.globalAlpha = fade;
    const learnL = LANGS[(n + LANGS.indexOf(app.settings.learn)) % 3];
    const catW = app.byId.get('cat');
    const fit = drawStrokes(ctx, strokes, { style: 'glow', color: '#FFC857', width: 3.4 * dpr * Math.max(0.8, W / (520 * dpr)), box, progress: p, motion: { kind: 'hop', id: 'cat' }, alive, t: lt, boil: alive ? 0.5 : 0 });
    // Hand-Silhouette an der aktuellen Spitze
    if (p > 0 && p < 1 && fit) {
      let total = 0; for (const s of strokes) total += s[0].length;
      let k = Math.max(0, Math.round(total * p) - 1); let si = 0; while (si < strokes.length && k >= strokes[si][0].length) { k -= strokes[si][0].length; si++; }
      const s = strokes[Math.min(si, strokes.length - 1)]; const [hx, hy] = fit.map(s[0][Math.min(k, s[0].length - 1)], s[1][Math.min(k, s[0].length - 1)]);
      drawPointerSilhouette(ctx, hx, hy, 0.9 * dpr * Math.max(0.7, H / (360 * dpr)), { fill: 'rgba(255,251,239,0.14)', stroke: 'rgba(255,251,239,0.6)' });
    }
    ctx.globalAlpha = 1;
    // Wort-Chip oben links: nur das Wort in der Lernsprache
    ctx.font = `700 ${Math.round(H * 0.1)}px Caveat, cursive`; ctx.fillStyle = 'rgba(255,251,239,0.92)'; ctx.fillText(word(catW, learnL), W * 0.05, H * 0.15);
    // KI rät in wechselnden Sprachen
    const moon = app.byId.get('moon'), sun = app.byId.get('sun');
    let text = '';
    if (lt > 1.9 && lt < 3.1) text = t('guessHmm', { w: word(moon, 'tr') }, 'tr');
    else if (lt > 3.2 && lt < 4.3) text = t('guessHmm', { w: word(sun, 'en') }, 'en');
    else if (lt > 4.4 && lt < 5.4) text = t('guessHmm', { w: word(moon, 'de') }, 'de');
    else if (lt >= 5.6 && lt < LOOP - 0.4) text = `${t('guessHit', { w: cap(word(catW, learnL), learnL) }, learnL)}`;
    setBubble(reduce ? '' : text);
  }
  app.attract = {
    start() { if (raf || !canvas) return; t0 = performance.now(); loopN = -1; raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
  };
}
