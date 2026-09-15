// Demo-Modus ?demo=1 (für die Video-Aufnahme, kein Mensch nötig): eine gezeichnete Hand-Silhouette folgt echten
// Datensatz-Strichen auf der Bühne, die Klassifikation läuft ehrlich live mit.
// Szenen: ?demo=1&scene=hit|hook|article|plural|dayend|duel  (+ &learn=tr&native=de, &word=cat)
import { drawPointerSilhouette, handSvg, POSES } from './hands.js';
import { planFor } from '../core/plan.js';
import { encode } from '../core/codec.js';

const Q = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(app) {
  const scene = Q.get('scene') || 'hit';
  Object.assign(app.settings, { native: Q.get('native') || 'de', learn: Q.get('learn') || (scene === 'article' ? 'de' : 'tr'), airOffered: true, chosenPair: true, onboarded: true });
  app.applyTexts();
  document.body.classList.add('demo');
  app.warm?.(); await app.ensureClf();
  const others = await app.others();
  const fx = document.createElement('canvas'); fx.className = 'fx demo-layer'; fx.setAttribute('aria-hidden', 'true');
  document.getElementById('stage').appendChild(fx);
  let hand = null; // {x,y}
  const overlayLoop = () => {
    requestAnimationFrame(overlayLoop);
    const st = app.stage, dpr = st.dpr, c = fx.getContext('2d');
    if (fx.width !== st.canvas.width || fx.height !== st.canvas.height) { fx.width = st.canvas.width; fx.height = st.canvas.height; }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, fx.width, fx.height);
    if (!hand || app.screen !== 'round') return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPointerSilhouette(c, hand.x, hand.y, Math.max(0.9, st.h / 520), { fill: 'rgba(255,251,239,0.18)', stroke: 'rgba(255,251,239,0.75)' });
  };
  requestAnimationFrame(overlayLoop);

  /** Striche mit Hand-Silhouette zeichnen (Tempo wie ein Mensch in der Luft) */
  async function drawWith(strokes, { pxPerMs = 0.55, gap = 420 } = {}) {
    const st = app.stage; const mapped = st.mapFixture(strokes, 0.6);
    for (const [xs, ys] of mapped) {
      if (!st.enabled) return;
      // Hand schwebt zum Strichanfang
      const from = hand || { x: st.w * 0.8, y: st.h * 0.8 };
      for (let k = 1; k <= 12; k++) { hand = { x: from.x + (xs[0] - from.x) * k / 12, y: from.y + (ys[0] - from.y) * k / 12 }; st.setCursor(hand.x, hand.y, 'hover'); await sleep(22); }
      st.beginStroke(xs[0], ys[0]);
      for (let i = 1; i < xs.length; i++) {
        const d = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); const steps = Math.max(1, Math.round(d / 7));
        for (let k = 1; k <= steps; k++) {
          if (!st.enabled) return;
          const x = xs[i - 1] + (xs[i] - xs[i - 1]) * k / steps + Math.sin(performance.now() / 60) * 0.8, y = ys[i - 1] + (ys[i] - ys[i - 1]) * k / steps;
          hand = { x, y }; st.addPoint(x, y); await sleep(Math.max(8, (d / steps) / pxPerMs));
        }
      }
      st.endStroke(); await sleep(gap);
    }
  }

  const word = Q.get('word') || 'cat';
  const drawing = (id, k = 0) => (others[id] || others.cat)[k % (others[id] || others.cat).length].strokes;
  if (scene === 'dayend') {
    const plan = planFor(app.today(), app.words);
    const ids = ['cat', 'apple', 'sun', 'house', 'fish'];
    await app.showDayEnd({ number: plan.number, date: app.today(), hits: 4, points: 412, scored: true, learn: app.settings.learn,
      results: ids.map((id, i) => ({ id, kind: i === 4 ? 'plural' : 'new', n: i === 4 ? 3 : undefined, parts: i === 4 ? 3 : undefined, result: i === 2 ? 'timeout' : 'hit', hitAt: 3500 + i * 1700, points: 80, strokes: drawing(id, 1) })),
      funniest: { target: 'cat', id: 'lion', p: 0.71 } });
    return;
  }
  if (scene === 'duel') {
    let t = 0; const strokes = drawing(word).map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 45); t += xs.length * 45 + 380; return [xs, ys, ts]; });
    app.settings.chosenPair = true;
    await app.duel.receive(encode({ classIdx: app.clf.classNames.indexOf(app.byId.get(word).cls), senderMs: 11000, strokes }));
    return;
  }
  // Runden-Szenen
  const w = app.byId.get(word);
  const slot = scene === 'plural' ? { id: Q.get('word') || 'apple', kind: 'plural', n: 3 } : { id: word, kind: 'new' };
  app.show('round'); app.renderToggle(); app.ui.slots(5, scene === 'plural' ? 4 : 0, scene === 'plural' ? [{ result: 'hit' }, { result: 'hit' }, { result: 'hit' }, { result: 'hit' }] : []);
  if (scene === 'article') {
    // Silhouette zeigt 2 Finger → „die" (rot)
    setTimeout(() => {
      const card = document.querySelector('.article-card'); if (!card) return;
      const el = document.createElement('div'); el.className = 'demo-hand'; el.innerHTML = handSvg(POSES[2], { size: 120, ink: '#FFFBEF', fill: 'rgba(255,251,239,.12)', accent: '#EF4444' });
      document.getElementById('screen-round').appendChild(el);
      const target = card.querySelector('[data-a="die"] .ring'); let p = 0;
      const iv = setInterval(() => { p = Math.min(1, p + 0.05); target?.style.setProperty('--p', p); card.querySelector('[data-a="die"]')?.classList.add('live'); if (p >= 1) { clearInterval(iv); el.remove(); app.hooks.chooseArticle?.(app.byId.get(slot.id).de.art); } }, 50);
    }, 1400);
  }
  const drawLoop = async () => {
    const wid = slot.id;
    for (let k = 0; k < (scene === 'plural' ? slot.n : 1); k++) {
      await waitFor(() => app.round.active && app.round.active.w.id === wid && app.round.drawCount > k + base);
      await sleep(900);
      const strokes = scene === 'hook' ? drawing(wid, 2) : drawing(wid, k);
      await drawWith(strokes, { pxPerMs: scene === 'hook' ? 0.32 : 0.55 });
    }
  };
  const base = app.round.drawCount || 0;
  drawLoop();
  const out = await app.playSlot(slot, { index: 0, total: 5 });
  hand = null;
  app.demoResult = { result: out.result, hitAt: out.hitAt, tips: out.tips };
}

function waitFor(fn, timeout = 30000) {
  return new Promise((res) => { const t0 = performance.now(); const iv = setInterval(() => { if (fn() || performance.now() - t0 > timeout) { clearInterval(iv); res(); } }, 50); });
}
