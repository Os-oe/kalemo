// Demo-Modus ?demo=1 (für die Video-Aufnahme, kein Mensch nötig): eine gezeichnete Hand-Silhouette folgt echten
// Datensatz-Strichen auf der Bühne, die Klassifikation läuft ehrlich live mit.
// Szenen: ?demo=1&scene=hook|hit|article|plural|dayend|duel|landing  (+ &learn=tr&native=de, &word=cat)
// Iteration 2 (Punkt 9): klar lesbare, VOLLSTÄNDIGE Zeichnungen aus data/examples.json (nicht others.json), die Hand malt nach
// dem Erkennen fertig („Ich weiß es! Mal ruhig fertig …"), dayend öffnet die spoilerfreie Teilen-Karte, landing = Empfänger-Landeseite.
import { drawPointerSilhouette, handSvg, POSES } from './hands.js';
import { planFor } from '../core/plan.js';
import { encode } from '../core/codec.js';
import { pickFunniest } from '../core/funny.js';

const Q = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(app) {
  const scene = Q.get('scene') || 'hit';
  const landing = scene === 'landing';
  Object.assign(app.settings, { native: Q.get('native') || 'de', learn: Q.get('learn') || (scene === 'article' ? 'de' : 'tr'), airOffered: true, chosenPair: !landing, onboarded: true });
  app.applyTexts();
  document.body.classList.add('demo');
  app.warm?.(); await app.ensureClf();
  const ex = await app.examples();
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

  /** Striche mit Hand-Silhouette zeichnen (Tempo wie ein Mensch in der Luft) — malt nach dem Erkennen weiter, bis alles steht */
  async function drawWith(strokes, { pxPerMs = 0.55, gap = 420 } = {}) {
    const st = app.stage; const mapped = st.mapFixture(strokes, 0.6);
    for (const [xs, ys] of mapped) {
      if (!st.enabled) return;
      const from = hand || { x: st.w * 0.8, y: st.h * 0.8 };
      const fin = !!app.round.active?.finishing; // nach dem Erkennen malt die Hand zügig fertig (4-s-Deckel)
      const hops = fin ? 6 : 12, speed = fin ? pxPerMs * 2.4 : pxPerMs;
      for (let k = 1; k <= hops; k++) { hand = { x: from.x + (xs[0] - from.x) * k / hops, y: from.y + (ys[0] - from.y) * k / hops }; st.setCursor(hand.x, hand.y, 'hover'); await sleep(22); }
      st.beginStroke(xs[0], ys[0]);
      for (let i = 1; i < xs.length; i++) {
        const d = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); const steps = Math.max(1, Math.round(d / 7));
        for (let k = 1; k <= steps; k++) {
          if (!st.enabled) return;
          const x = xs[i - 1] + (xs[i] - xs[i - 1]) * k / steps + Math.sin(performance.now() / 60) * 0.8, y = ys[i - 1] + (ys[i] - ys[i - 1]) * k / steps;
          hand = { x, y }; st.addPoint(x, y); await sleep(Math.max(8, (d / steps) / speed));
        }
      }
      st.endStroke(); await sleep(app.round.active?.finishing ? Math.min(gap, 260) : gap); // nach dem Erkennen zügig weiter (Pause < 1,2 s)
    }
  }

  const word = Q.get('word') || 'cat';
  const drawing = (id, k = 0) => { const list = ex[id] || ex.cat; return list[k % list.length].strokes; };
  if (scene === 'dayend') {
    const plan = planFor(app.today(), app.words);
    const ids = plan.slots.map((s) => s.id);
    const results = plan.slots.map((s, i) => ({ id: s.id, kind: s.kind, n: s.n, parts: s.kind === 'plural' ? s.n : undefined, result: i === 2 ? 'timeout' : 'hit', hitAt: 3500 + i * 1700, drawMs: 3000 + i * 1500, points: i === 2 ? 0 : 80,
      strokes: drawing(s.id, 0), drawings: s.kind === 'plural' ? [0, 1, 2].slice(0, s.n).map((k) => drawing(s.id, k)) : undefined, tips: i === 1 ? [{ id: 'hat', p: 0.62 }] : i === 3 ? [{ id: 'moon', p: 0.4 }] : [] }));
    const sum = { number: plan.number, date: app.today(), hits: 4, points: 412, scored: true, learn: app.settings.learn, native: app.settings.native, results, funniest: pickFunniest(results, { exclude: ids }) };
    await app.showDayEnd(sum);
    await sleep(Number(Q.get('cardAt') || 2600));
    await app.shareToday(sum); // spoilerfreie Heute-Karte (5 Spuren + Neugier-Satz)
    app.demoResult = { card: app.lastCard ? { hero: app.lastCard.hero, text: app.lastCard.text, gates: app.lastCard.gates.length, rows: (app.lastCard.rows || []).length } : null };
    return;
  }
  if (scene === 'duel' || landing) {
    const id = landing ? (Q.get('word') || 'owl') : word;
    let t = 0; const strokes = drawing(id).map(([xs, ys]) => { const ts = xs.map((_, i) => t + i * 45); t += xs.length * 45 + 380; return [xs, ys, ts]; });
    app.demoResult = { scene };
    await app.duel.receive(encode({ classIdx: app.clf.classNames.indexOf(app.byId.get(id).cls), senderMs: 4200, strokes }), { noGate: !landing });
    return;
  }
  // Runden-Szenen
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
      await sleep(scene === 'plural' && k ? 500 : 900);
      const strokes = scene === 'hook' ? drawing(wid, 2) : drawing(wid, k);
      await drawWith(strokes, { pxPerMs: scene === 'hook' ? 0.32 : 0.55 });
    }
  };
  const base = app.round.drawCount || 0;
  drawLoop();
  const out = await app.playSlot(slot, { index: 0, total: 5 });
  hand = null;
  app.demoResult = { result: out.result, hitAt: out.hitAt, tips: out.tips, strokes: out.drawings?.length ? out.drawings.map((d) => d.length) : out.strokes.length, parts: out.parts ?? null, expected: scene === 'plural' ? [0, 1, 2].map((k) => drawing(slot.id, k).length) : drawing(slot.id, scene === 'hook' ? 2 : 0).length };
}

function waitFor(fn, timeout = 30000) {
  return new Promise((res) => { const t0 = performance.now(); const iv = setInterval(() => { if (fn() || performance.now() - t0 > timeout) { clearInterval(iv); res(); } }, 50); });
}
