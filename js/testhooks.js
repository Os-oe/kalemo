// Test-Hooks — nur mit ?test=1 geladen. Liefern nie Engine-/DOM-Objekte, nur serialisierbare Daten.
import { planFor } from './core/plan.js';
import { playDaily } from './game/daily.js';

/** Szenen für Screenshots/acuity-loop: ?test=1&scene=<name> */
export async function scene(app, name) {
  const $ = (s) => document.querySelector(s);
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
    case 'article': setPair('tr', 'de'); roundBase('cat', { learnArticle: false }); app.stage.enabled = false; app.articleStep(app.byId.get('cat')); loop(); break;
    case 'offer': setPair('de', 'tr'); roundBase('cat'); app.choice(`<h3>${app.t('airOfferT')}</h3><p>${app.t('airOfferB')}</p>`, [['yes', app.t('airYes'), 'primary'], ['no', app.t('airNo'), 'ghost']]); loop(); break;
    case 'precam': setPair('de', 'tr'); roundBase('cat'); app.settings.airOffered = false; app.offerAir(); setTimeout(() => $('.overlay [data-k="yes"]')?.click(), 50); loop(); break;
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
  window.__airStats = () => app.air ? { state: app.air.state, delegate: app.air.delegate, frames: app.air.frames, handFrames: app.air.handFrames, poseFrames: app.air.poseFrames, fps: app.air.fps, camera: app.air.cameraOn } : null;
  window.__chooseArticle = (a) => { app.hooks.chooseArticle?.(a); return true; };
  window.__choose = (k) => { app.hooks.choose?.(k); return true; };
  window.__mode = (m) => { if (m === 'air') return window.__enableAir(); app.setMode(m === 'airsim' ? 'air' : m); return app.mode; };
  window.__settings = (patch) => { Object.assign(app.settings, patch); localStorage.setItem('kalemo.settings', JSON.stringify(app.settings)); app.applyTexts?.(); return app.settings; };
  window.__next = () => { const b = document.querySelector('#round-overlay [data-act=next]'); if (b) b.click(); return !!b; };
  window.__state = () => {
    const r = app.round?.active;
    return JSON.parse(JSON.stringify({
      screen: app.screen, mode: app.mode, settings: app.settings, date: app.today(), clfReady: !!app.clf, backend: app.clf?.backend,
      round: r ? { target: r.w.id, elapsedMs: Math.round(r.engine.elapsed(performance.now())), tips: r.engine.tips, lastTop: r.engine.lastTop, predictions: r.engine.predictions } : null,
      overlay: !document.querySelector('#round-overlay').hidden,
      overlayClass: document.querySelector('#round-overlay').className,
      lastArticle: app.lastArticle || null, toast: document.querySelector('#toast').hidden ? null : document.querySelector('#toast').textContent,
      lastResult: app.lastResult ? { ...app.lastResult, strokes: app.lastResult.strokes?.length } : null,
      daily: app.dailyRun ? { number: app.dailyRun.plan.number, index: app.dailyRun.index, results: app.dailyRun.results.map((x) => ({ id: x.id, kind: x.kind, result: x.result, points: x.points })) } : null,
      log: app.log.slice(-20),
    }));
  };
}
