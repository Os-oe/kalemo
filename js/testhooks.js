// Test-Hooks — nur mit ?test=1 geladen. Liefern nie Engine-/DOM-Objekte, nur serialisierbare Daten.
import { planFor } from './core/plan.js';
export { planFor };
import { playDaily } from './game/daily.js';

/** Szenen für Screenshots/acuity-loop: ?test=1&scene=<name> */
export async function scene(app, name) {
  const $ = (s) => document.querySelector(s);
  const Q = (k) => new URLSearchParams(location.search).get(k);
  const others = await app.others();
  const pick = (id) => others[id][0].strokes;
  const setPair = (native, learn) => { Object.assign(app.settings, { native, learn, airOffered: true }); app.applyTexts(); };
  const roundBase = (id, { learnArticle = true } = {}) => {
    app.show('round'); app.renderToggle();
    const w = app.byId.get(id); app.round.showWord(w, { article: learnArticle });
    app.ui.slots(5, 1, [{ result: 'hit' }]); app.ui.timer(13400, 20000);
    app.stage.clear(); app.stage.enabled = true; app.stage.setColor(app.settings.learn === 'de' ? '#EF4444' : '#FFC857');
    return w;
  };
  const loop = () => { app.stage.render(performance.now()); requestAnimationFrame(loop); };
  switch (name) {
    case 'start': setPair('de', 'tr'); app.show('start'); break;
    case 'round': {
      setPair('de', 'tr'); roundBase('cat');
      await app.round.feed(pick('cat').slice(0, 3), { timing: 'instant' });
      app.round.showBubble('Hmm … ay?'); app.stage.setCursor(app.stage.w * 0.55, app.stage.h * 0.5, 'hover'); loop();
      break;
    }
    case 'roundair': {
      setPair('de', 'tr'); roundBase('cat'); app.setMode('air');
      const cam = document.querySelector('#stage canvas.cam'); cam.hidden = false; const cctx = cam.getContext('2d');
      const img = new Image(); img.src = 'tools/fixtures/pointing_up.jpg'; await img.decode().catch(() => {});
      const st = app.stage;
      await app.round.feed(pick('cat'), { timing: 'instant' });
      const draw = (now) => {
        cam.width = st.canvas.width; cam.height = st.canvas.height; const s = Math.max(cam.width / img.width, cam.height / img.height) * 1.4;
        const dx = Math.sin(now / 900) * 6 * st.dpr, dy = Math.cos(now / 1300) * 4 * st.dpr; // Kamera „lebt"
        cctx.setTransform(-1, 0, 0, 1, cam.width, 0); cctx.drawImage(img, (cam.width - img.width * s) / 2 + dx, (cam.height - img.height * s) / 2 + dy, img.width * s, img.height * s);
        st.setCursor(st.w * 0.62 + Math.sin(now / 700) * 20, st.h * 0.3, 'hover'); requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw); app.round.showBubble('Hmm … ay?');
      break;
    }
    case 'help': { // Iteration 1: Hilfe-Karte „So malen es andere — jetzt du!" über laufender Runde
      setPair('de', 'tr'); await app.clfPromise; roundBase(Q('word') || 'bicycle');
      app.round.draw({ id: Q('word') || 'bicycle' });
      await app.round.feed(pick('bicycle').slice(0, 1), { timing: 'instant' });
      app.round.help(app.round.active);
      break;
    }
    case 'article': setPair('tr', 'de'); roundBase('cat', { learnArticle: false }); app.stage.enabled = false; app.articleStep(app.byId.get('cat')); loop(); break;
    case 'offer': setPair('de', 'tr'); roundBase('cat'); app.choice(`<h3>${app.t('airOfferT')}</h3><p>${app.t('airOfferB')}</p>`, [['yes', app.t('airYes'), 'primary'], ['no', app.t('airNo'), 'ghost']]); loop(); break;
    case 'precam': setPair('de', 'tr'); roundBase('cat'); app.settings.airOffered = false; app.offerAir(); setTimeout(() => $('.overlay [data-k="yes"]')?.click(), 50); loop(); break;
    case 'dayend': case 'card': case 'ycard': {
      setPair('de', 'tr'); await app.clfPromise;
      const plan = planFor('2026-09-20', app.words);
      const sum = { number: 5, date: '2026-09-20', hits: 4, points: 377, scored: true, learn: 'tr', native: 'de',
        results: plan.slots.map((s, i) => ({ id: s.id, kind: s.kind, n: s.n, parts: s.kind === 'plural' ? s.n : undefined, result: i === 3 ? 'timeout' : 'hit', hitAt: 3000 + i * 1900, points: i === 3 ? 0 : 80, strokes: (others[s.id] || others.cat)[1 % (others[s.id] || others.cat).length].strokes })),
        funniest: { target: plan.slots[0].id, id: 'lion', p: 0.8 } };
      localStorage.setItem('kalemo.streak', JSON.stringify({ count: 3, last: '2026-09-20' })); app.dateOverride = '2026-09-20';
      await app.showDayEnd(sum);
      if (name === 'card') document.querySelector('#btn-share').click();
      if (name === 'ycard') { const { yesterdayCard } = await import('./game/cards.js'); const { shareImage } = await import('./game/share.js'); const c = await yesterdayCard(app, sum); shareImage(app, { blob: c.blob, text: c.text, forceFallback: true }); }
      break;
    }
    case 'dict': {
      setPair('de', 'tr');
      for (const id of ['cat', 'apple', 'sun', 'bicycle', 'fish', 'house', 'guitar', 'tree', 'moon']) await app.dict.put(id, { strokes: others[id][0].strokes.map(([x, y]) => [x, y, x.map((_, i) => i * 30)]), date: '2026-09-20' });
      await app.openDict();
      if (new URLSearchParams(location.search).get('detail')) document.querySelector('.dict-cell').click();
      break;
    }
    case 'duel': setPair('de', 'tr'); app.duel.create(); break;
    case 'duelopts': {
      setPair('de', 'tr'); app.settings.chosenPair = true; await app.clfPromise;
      const { encode } = await import('./core/codec.js');
      let tt = 0; const strokes = pick('cat').map(([xs, ys]) => { const ts = xs.map((_, i) => tt + i * 8); tt += xs.length * 8 + 60; return [xs, ys, ts]; });
      app.duel.receive(encode({ classIdx: app.clf.classNames.indexOf('cat'), senderMs: 9000, strokes }));
      break;
    }
    default: break;
  }
}

export function install(app) {
  window.__feedStrokes = async (strokes, opts = {}) => { await app.round.feed(strokes, opts); return true; };
  window.__setDate = (iso) => { app.dateOverride = iso; app.onDateChange?.(); return app.today(); };
  window.__plan = (iso) => planFor(iso || app.today(), app.words);
  window.__startDaily = async (opts = {}) => { await app.clfPromise; playDaily(app, opts); return true; };
  /** frames: [{lm:[[x,y,z]×21]|null, t}] → Trace (Stift/Artikel), optional in laufende Runde (inRound) */
  window.__feedLandmarks = async (frames, { article = false, fresh = true, pinch = false } = {}) => {
    const air = await app.getAir();
    if (fresh) { air.pen.reset(); air.pen.pinch = pinch; air.counter.reset(); }
    let restore = null;
    if (article && !air.listeners.article) { restore = true; air.listeners.article = () => {}; }
    const st = app.stage; const map = (x, y) => [(1 - x) * st.w, y * st.h];
    const trace = frames.map((f) => { const o = air.onLandmarks(f.lm, f.t, map); return { t: f.t, hand: o.hand, pen: o.pen, events: o.events, article: o.article ? { count: o.article.count, selected: o.article.selected, progress: +o.article.progress.toFixed(2) } : null }; });
    if (restore) air.listeners.article = null;
    return { trace, strokes: st.allStrokes().map((s) => ({ n: s[0].length, t0: Math.round(s[2][0]), t1: Math.round(s[2][s[2].length - 1]) })), active: !!st.active };
  };
  window.__enableAir = async (opts = {}) => { const ok = await app.enterAir({ handCheck: false, ...opts }); return ok; };
  window.__airStats = () => {
    if (!app.air) return null;
    const g = [...(app.air.gaps || [])].sort((a, b) => a - b); const q = (p) => (g.length ? +g[Math.min(g.length - 1, Math.floor(g.length * p))].toFixed(1) : null);
    return { state: app.air.state, delegate: app.air.delegate, frames: app.air.frames, handFrames: app.air.handFrames, poseFrames: app.air.poseFrames, fps: app.air.fps, camera: app.air.cameraOn, gapMedian: q(0.5), gapP90: q(0.9), gapN: g.length, stageW: app.stage.w };
  };
  window.__chooseArticle = (a) => { app.hooks.chooseArticle?.(a); return true; };
  window.__choose = (k) => { app.hooks.choose?.(k); return true; };
  window.__mode = (m) => { if (m === 'air') return window.__enableAir(); app.setMode(m === 'airsim' ? 'air' : m); return app.mode; };
  window.__settings = (patch) => { Object.assign(app.settings, patch); localStorage.setItem('kalemo.settings', JSON.stringify(app.settings)); app.applyTexts?.(); return app.settings; };
  window.__answer = (id, o) => { app.hooks.answer?.(id, o); return true; };
  window.__pairGo = () => { app.hooks.pairGo?.(); return true; };
  window.__home = () => { app.goHome(); return true; };
  window.__next = () => { const b = document.querySelector('#round-overlay [data-act=next]'); if (b) b.click(); return !!b; };
  window.__state = () => {
    const r = app.round?.active;
    return JSON.parse(JSON.stringify({
      screen: app.screen, mode: app.mode, settings: app.settings, date: app.today(), clfReady: !!app.clf, backend: app.clf?.backend,
      round: r ? { target: r.w.id, elapsedMs: Math.round(r.engine.elapsed(performance.now())), tips: r.engine.tips, lastTop: r.engine.lastTop, predictions: r.engine.predictions, paused: r.engine.paused, helped: !!r.helped, enabled: app.stage.enabled } : null,
      overlay: !document.querySelector('#round-overlay').hidden,
      overlayClass: document.querySelector('#round-overlay').className,
      lastArticle: app.lastArticle || null, toast: document.querySelector('#toast').hidden ? null : document.querySelector('#toast').textContent,
      drawCount: app.round?.drawCount || 0, duelState: app.duelState || null, lastDuel: app.lastDuel || null, lastShare: app.lastShare || null,
      lastCard: app.lastCard || null, lastPoster: app.lastPoster || null, dictEntries: app.dictEntries || null, sheet: !document.querySelector('#sheet').hidden,
      summary: app.lastSummary ? { number: app.lastSummary.number, hits: app.lastSummary.hits, points: app.lastSummary.points, streak: app.lastSummary.streak, funniest: app.lastSummary.funniest, results: app.lastSummary.results.map((r) => ({ id: r.id, kind: r.kind, result: r.result, parts: r.parts, n: r.n })) } : null,
      duelPicks: app.duelPicks || null, inapp: !document.querySelector('#inapp').hidden, lastLinkShare: app.lastLinkShare || null,
      fxLog: (app.fxLog || []).slice(-40), voiceLog: (app.voiceLog || []).slice(-20), audioReady: !!app.audio?.ready(),
      stageFx: app.stage ? { strokes: app.stage.strokes.length, squash:app.stage.canvas.classList.contains('squash'), crumbling: app.stage.crumbleAt != null, twitch: +app.stage.twitch.toFixed(2), cursor: app.stage.cursor?.state || null, realBox: !!app.stage.realBox } : null,
      bubble: document.querySelector('#bubble').hidden ? null : { text: document.querySelector('#bubble').textContent, pop: document.querySelector('#bubble').classList.contains('pop') },
      lastResult: app.lastResult ? { ...app.lastResult, strokes: app.lastResult.strokes?.length } : null,
      daily: app.dailyRun ? { number: app.dailyRun.plan.number, index: app.dailyRun.index, results: app.dailyRun.results.map((x) => ({ id: x.id, kind: x.kind, result: x.result, points: x.points })) } : null,
      log: app.log.slice(-20),
    }));
  };
}
