// Luft-Duell ohne Server: Link mit Striche-Code im #-Hash → Landeseite (neue Leute) → Replay mit Original-Timing + KI-Tipps
// → 4 Antwort-Optionen (✓/✗) → du malst zurück → erst DANN Malzeit gegen Malzeit + Stand → Link zurück.
// Iteration 2: R2-P2-5 (fair: Malzeit gegen Malzeit), R2-P3-10 (Stand nur für die zwei Beteiligten), R2-P2-6 (Landeseite),
// Punkt 2e (Duell-Wort = heutiges Tageswort → erst Tagesskizze anbieten), Punkt 13 (Link hinter „Link anzeigen").
import { t, word, strokeColor, LANGS } from '../core/i18n.js';
import { encode, decode, withTimes } from '../core/codec.js';
import { saveSettings, dayResult, playerId, store } from '../core/store.js';
import { planFor } from '../core/plan.js';
import { RoundEngine } from '../core/engine.js';
import { escapeHtml } from './round.js';
import { shareLink, copyText } from './share.js';
import { mount, unmountAll, confetti } from './alive.js';
import { duelOutcome, secs1, OPTIONS_AT_MS, NOT_RECOGNIZED_MS, isRecognized } from '../core/duelscore.js';
import { mountPair } from './pair.js';
import { drawPointerSilhouette } from './hands.js';
import { reducedMotion } from './ink.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGO = '<h1 class="logo landing-logo">Kalemo<svg class="logo-trail" viewBox="0 0 220 26" aria-hidden="true"><path d="M6 16c30-10 60 8 92-2s62-10 116-3" pathLength="1"/></svg></h1>';

export function installDuel(app) {
  let classNames = null;
  const classes = async () => (classNames ||= app.clf?.classNames || (await fetch('models/v1/doodlenet/class_names.txt').then((r) => r.text())).split('\n').map((s) => s.trim()).filter(Boolean));
  const baseUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const todayIds = () => (app.words.length ? planFor(app.today(), app.words).slots.map((s) => s.id) : []);

  const duel = app.duel = {
    linkFor: async (id, strokes, senderMs, score = [0, 0], to = 0) => {
      const w = app.byId.get(id); const idx = (await classes()).indexOf(w.cls);
      const code = encode({ classIdx: idx, senderMs, strokes, score, from: playerId(), to });
      return { code, url: `${baseUrl()}#d=${code}` };
    },
    /** Zeichnung (mit ts oder kompakt+timing) als Duell verschicken. autoShare: direkt Teilen-Menü (Tagesende). score = [ich, du], to = Gegenüber */
    sendDrawing: async (id, strokes, senderMs = 0, timing = null, { autoShare = false, score = [0, 0], to = 0, result = null } = {}) => {
      const withTs = strokes[0] && strokes[0][2] ? strokes : withTimes(strokes, timing || strokes.map(() => ({ gap: 300, dur: 700 })));
      const { url, code } = await duel.linkFor(id, withTs, senderMs, score, to);
      app.lastDuel = { url, code, length: url.length, id, score, to };
      showLinkCard(url, { strokes: withTs, autoShare, score, result });
      return url;
    },
    /** Erstellen: 1 von 3 Wörtern (nie ein heutiges Tageswort) → malen → Link. versus = Rückspiel nach dem Raten: {ok, themMs, score:[them,you], opp} */
    create: ({ versus = null } = {}) => {
      app.show('duel');
      const blocked = new Set(todayIds());
      const pool = app.words.filter((w) => (w.acc ?? 0) >= 0.9 && !blocked.has(w.id));
      const pick = []; const used = new Set();
      while (pick.length < 3 && pick.length < pool.length) { const w = pool[Math.floor(Math.random() * pool.length)]; if (!used.has(w.id)) { used.add(w.id); pick.push(w); } }
      const learn = app.settings.learn;
      document.body.classList.remove('replay', 'options');
      const lead = versus ? (versus.ok && isRecognized(versus.themMs) ? t('duelBeat', { b: secs1(versus.themMs, app.settings.native) }) : t('duelPick')) : t('duelPick');
      $('#duel-body').innerHTML = `<h2 class="h-hand">${escapeHtml(t('duelT'))}</h2><canvas class="duel-stage" aria-hidden="true"></canvas><p class="lead">${escapeHtml(lead)}</p>
        <div class="word-picks">${pick.map((w) => `<button class="word-pick" data-id="${escapeHtml(w.id)}" style="--c:${strokeColor(w, learn)}"><span>${escapeHtml(word(w, learn))}</span>${app.settings.native !== learn ? `<small>${escapeHtml(word(w, app.settings.native))}</small>` : ''}</button>`).join('')}</div>
        <p class="hint">${escapeHtml(t('duelDraw'))}</p><button class="btn ghost" data-act="home">${escapeHtml(t('back'))}</button>`;
      app.duelPicks = pick.map((w) => w.id);
      app.others().then((o) => { const c = $('#duel-body canvas.duel-stage'); if (c) mount(c, { strokes: o.star[0].strokes, color: '#FFC857', style: 'glow', width: 2.3, replay: 2.2, boil: 0.4 }); });
      $('#duel-body').onclick = async (e) => {
        const b = e.target.closest('.word-pick');
        if (e.target.closest('[data-act=home]')) { app.goHome(); return; }
        if (!b) return;
        app.sfx?.play('tap');
        await app.ensureClf();
        const w = app.byId.get(b.dataset.id);
        app.show('round'); app.renderToggle(); app.ui.slots(0, 0, []);
        app.round.showWord(w); app.voice?.word(w.id, learn);
        const out = await app.round.draw({ id: w.id, color: strokeColor(w, learn), onRecognized: () => app.voice?.hitAnnounce(w.id, app.round.langOrder()) });
        app.lastResult = { ...out, kind: 'duel' };
        if (out.result !== 'hit') app.voice?.missAnnounce(w.id, app.round.langOrder());
        await sleep(out.result === 'hit' ? 300 : 1100);
        const myMs = out.result === 'hit' ? (out.drawMs ?? out.hitAt) : NOT_RECOGNIZED_MS;
        if (!versus) { await duel.sendDrawing(w.id, out.strokes, myMs, null, { score: [0, 0], to: 0 }); return; }
        // Erst jetzt: Malzeit gegen Malzeit (bzw. falsch geraten = Runde an den Absender)
        const res = duelOutcome({ ok: versus.ok, youMs: out.result === 'hit' ? myMs : null, themMs: versus.themMs, score: versus.score });
        app.duelState = { phase: 'result', outcome: res.key, ok: versus.ok, youMs: out.result === 'hit' ? myMs : null, themMs: versus.themMs, score: { you: res.you, them: res.them } };
        if (res.key === 'faster' || res.key === 'closeWin') confetti(document.querySelector('#stage canvas.fx'), '#FFC857', 50);
        await duel.sendDrawing(w.id, out.strokes, myMs, null, { score: [res.you, res.them], to: versus.opp || 0, result: { ...res, youMs: out.result === 'hit' ? myMs : null, themMs: versus.themMs, ok: versus.ok } });
      };
    },
    /** Empfangen */
    receive: async (code, { noGate = false } = {}) => { // noGate: Test-/Demo-Szenen (op-capture) ohne Tageswort-Sperre
      let d;
      try { d = decode(code); } catch (e) { app.log.push('duel ' + e.message); app.ui.toast(t('duelBroken'), 4000); history.replaceState(null, '', location.pathname + location.search); return false; }
      const needLanding = !app.settings.chosenPair;
      if (needLanding) landingSkeleton(); // Logo + Einzeiler sofort, Knöpfe sobald das Wort bekannt ist
      const cls = (await classes())[d.classIdx]; const w = app.words.find((x) => x.cls === cls) || app.wordsAll?.find((x) => x.cls === cls);
      if (!w) { app.ui.toast(t('duelBroken'), 4000); return false; }
      app.incoming = { d, w, code };
      app.warm?.(); // Duell-Link = klare Spiel-Absicht → Mal-KI parallel laden
      // R2-P3-10: Stand nur, wenn dieser Link an MICH adressiert ist (meine lokale Kennung); sonst neues Duell ohne fremden Stand
      const part = !!d.to && d.to === playerId();
      const score = part ? d.score : [0, 0];
      const stale = !part && d.score[0] + d.score[1] > 0;
      const iso = app.today(), plan = planFor(iso, app.words);
      const unplayed = !noGate && !dayResult(iso);
      const gate = unplayed && plan.slots.some((s) => s.id === w.id); // Punkt 2e: Tageswort, heute noch nicht gespielt
      // R3-P3-3: auch ohne Tageswort-Sperre (z. B. beim Rückspiel-Link) beide Wege anbieten — sonst verliert die
      // Kette genau dort den Trichter in die Tagesskizze, wo neue Leute ankommen.
      const offer = unplayed && !gate;
      app.duelLanding = { gate, offer, part, stale, number: plan.number };
      if (needLanding || gate) {
        const k = await landing({ gate, offer, part, score, stale, number: plan.number });
        if (k === 'daily') { store.set('pendingDuel', { code, date: iso }); app.startDaily?.(); return 'daily'; }
      }
      await app.ensureClf();
      return replay(d, w, { part, score });
    },
  };

  // ---------- Landeseite (erster Kontakt über den Link) ----------
  let teaserRaf = 0;
  function teaser(canvas) {
    cancelAnimationFrame(teaserRaf);
    const ctx = canvas.getContext('2d'); const pts = []; const t0 = performance.now();
    const step = (now) => {
      if (!canvas.isConnected) return;
      teaserRaf = requestAnimationFrame(step);
      const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (!W || !H) return; if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const s = reducedMotion() ? 2.2 : (now - t0) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#13203A'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 22; i++) { const x = (i * 97.13 + s * 8 * (1 + (i % 3))) % W, y = (i * 61.7 * dpr) % H; ctx.fillStyle = `rgba(255,236,190,${0.06 + (i % 4) * 0.03})`; ctx.beginPath(); ctx.arc(x, y, (1 + (i % 3)) * dpr, 0, 6.28); ctx.fill(); }
      // abstrakte Lichtschleife (kein Motiv, kein Spoiler): die Hand malt eine Lissajous-Figur, die Spur verglüht
      const at = (u) => [W / 2 + Math.sin(u * 1.0) * W * 0.3, H / 2 + Math.sin(u * 2.0 + 0.6) * H * 0.26];
      const u = s * 1.3; pts.push(at(u)); while (pts.length > 70) pts.shift();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        const a = i / pts.length;
        ctx.strokeStyle = `rgba(255,200,87,${0.18 * a})`; ctx.lineWidth = 16 * dpr * a; ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke();
        ctx.strokeStyle = `rgba(255,251,239,${0.85 * a})`; ctx.lineWidth = 3.2 * dpr * a; ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke();
      }
      ctx.restore();
      const [hx, hy] = pts[pts.length - 1];
      drawPointerSilhouette(ctx, hx, hy, 0.9 * dpr * Math.max(0.7, H / (300 * dpr)), { fill: 'rgba(255,251,239,0.14)', stroke: 'rgba(255,251,239,0.6)' });
    };
    teaserRaf = requestAnimationFrame(step);
  }
  function landingHtml({ gate = null, offer = false, part = false, score = [0, 0], stale = false, number = 1, loading = false } = {}) {
    const acts = loading ? `<button class="btn primary big" disabled>${escapeHtml(t('loading'))}</button>`
      : gate ? `<button class="btn primary big" data-act="daily-first">${escapeHtml(t('duelDailyFirst', { n: number }))}</button><button class="btn" data-act="go">${escapeHtml(t('duelDirect'))}</button>`
        : offer ? `<button class="btn primary big" data-act="go">${escapeHtml(t('duelWatch'))}</button><button class="btn" data-act="daily-first">${escapeHtml(t('duelDailyFirst', { n: number }))}</button>`
          : `<button class="btn primary big" data-act="go">${escapeHtml(t('duelWatch'))}</button>`;
    const sc = part && score[0] + score[1] > 0 ? `<p class="landing-score">${escapeHtml(t('duelRematch', { a: score[1], b: score[0] }))}</p>` : stale ? `<p class="landing-score">${escapeHtml(t('duelNew'))}</p>` : '';
    return `<div class="landing"><header class="landing-head">${LOGO}<p class="tagline">${escapeHtml(t('tagline'))}</p></header>
      <div class="landing-art"><canvas aria-hidden="true"></canvas></div>
      <p class="landing-lead">${escapeHtml(t('landingLead'))}</p>${sc}
      <div class="landing-acts">${acts}</div>
      <section class="pair" id="duel-pair"><div class="pair-col"><span id="dp-n">${escapeHtml(t('iSpeak'))}</span><div class="seg" data-pair="native" role="radiogroup" aria-labelledby="dp-n"></div></div>
        <button type="button" class="swap-btn" data-pair="swap"></button>
        <div class="pair-col"><span id="dp-l">${escapeHtml(t('iLearn'))}</span><div class="seg" data-pair="learn" role="radiogroup" aria-labelledby="dp-l"></div></div></section></div>`;
  }
  function landingSkeleton() {
    app.show('duel'); document.body.classList.add('landing-on');
    $('#duel-body').innerHTML = landingHtml({ loading: true });
    mountPair($('#duel-pair'), app, { onChange: () => app.applyTexts() });
    teaser($('#duel-body .landing-art canvas'));
  }
  function landing(opts) {
    return new Promise((resolve) => {
      app.show('duel'); document.body.classList.add('landing-on');
      const render = () => {
        $('#duel-body').innerHTML = landingHtml(opts);
        mountPair($('#duel-pair'), app, { onChange: () => { app.applyTexts(); render(); } });
        teaser($('#duel-body .landing-art canvas'));
      };
      render();
      const done = (k) => { app.settings = saveSettings({ chosenPair: true }); app.applyTexts(); cancelAnimationFrame(teaserRaf); document.body.classList.remove('landing-on'); app.sfx?.play('tap'); resolve(k); };
      $('#duel-body').onclick = (e) => {
        if (e.target.closest('[data-act=go]')) done('go');
        else if (e.target.closest('[data-act=daily-first]')) done('daily');
      };
      app.hooks.pairGo = () => done('go');
    });
  }

  async function replay(d, w, { part = false, score = [0, 0] } = {}) {
    const learn = app.settings.learn;
    app.show('round'); app.renderToggle(); app.ui.slots(0, 0, []); document.body.classList.add('replay');
    const [sThem, sYou] = score;
    $('#word').textContent = '?'; $('#word-sub').textContent = part && sThem + sYou > 0 ? `${t('duelWatch')} · ${t('duelRematch', { a: sYou, b: sThem })}` : t('duelWatch');
    const st = app.stage; st.clear(); st.setColor(strokeColor(w, learn)); st.enabled = true; st.pointerOn = false; st.hintOn = false;
    const strokes = withTimes(d.strokes, d.timing);
    const mapped = st.mapFixture(strokes, 0.74).map((s, i) => [s[0], s[1], strokes[i][2]]); // Iteration 2: Replay groß (vorher 62 %)
    const total = strokes.length ? strokes[strokes.length - 1][2].slice(-1)[0] : 0;
    const engine = new RoundEngine({ target: w.id, durationMs: total + 1500, minInk: Math.min(st.w, st.h) * 0.18 });
    const t0 = performance.now(); engine.start(t0);
    app.duelState = { phase: 'replay', target: w.id, tips: [], part };
    let lastClassify = 0, busy = false;
    const classify = async () => {
      if (busy || engine.done) return; busy = true;
      try {
        const res = await app.clf.classify(st.allStrokes()); if (!res) return;
        for (const e of engine.onPrediction(performance.now(), res.top, st.inkLength())) {
          if (e.type === 'guess') { const g = app.byId.get(e.id); app.round.showBubble(t('guessHmm', { w: word(g, learn) }, learn)); st.pulse(); app.sfx?.play('guessPop'); app.voice?.guess(e.id, learn); app.duelState.tips.push(e.id); }
        }
      } finally { busy = false; }
    };
    // Ablenker vorab aus der fertigen Zeichnung (plausible Verwechslungen statt Zufall)
    const pre = await app.clf.classify(mapped.map((s) => [s[0], s[1]])).catch(() => null);
    const distract = (pre?.top || []).map((x) => x.id).filter((id) => id !== w.id);
    const play = { stop: false, done: false };
    const playback = (async () => {
      for (let s = 0; s < mapped.length && !play.stop; s++) {
        const [xs, ys, ts] = mapped[s];
        await sleep(Math.max(0, t0 + ts[0] - performance.now()));
        if (play.stop) break;
        st.beginStroke(xs[0], ys[0]);
        for (let i = 1; i < xs.length && !play.stop; i++) {
          const target = t0 + ts[i];
          while (performance.now() < target && !play.stop) {
            const k = Math.min(1, 1 - (target - performance.now()) / Math.max(16, ts[i] - ts[i - 1]));
            st.addPoint(xs[i - 1] + (xs[i] - xs[i - 1]) * k, ys[i - 1] + (ys[i] - ys[i - 1]) * k);
            if (performance.now() - lastClassify > 450) { lastClassify = performance.now(); classify(); }
            await sleep(16);
          }
          st.addPoint(xs[i], ys[i]);
        }
        if (st.active) st.endStroke();
        classify();
      }
      play.done = true; st.enabled = false; st.hintOn = true;
      if (app.duelState?.phase === 'options') app.duelState.replaying = false;
    })();
    await Promise.race([sleep(OPTIONS_AT_MS), playback.then(() => sleep(300))]);
    return askOptions(d, w, play, playback, distract, { part, score });
  }

  function askOptions(d, w, play, playback, distract = [], { part = false, score = [0, 0] } = {}) {
    return new Promise((resolve) => {
      const learn = app.settings.learn, ui = app.settings.native;
      const tips = (app.duelState.tips || []).filter((id) => id !== w.id);
      const opts = [w.id, ...new Set([...distract.slice(0, 2), ...tips, ...distract.slice(2)])].slice(0, 4);
      while (opts.length < 4) { const r = app.words[Math.floor(Math.random() * app.words.length)].id; if (!opts.includes(r)) opts.push(r); }
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      const shownAt = performance.now();
      app.duelState = { ...app.duelState, phase: 'options', options: opts, replaying: !play.done, shownAt: Math.round(shownAt) };
      document.body.classList.add('options'); $('#word-sub').textContent = '';
      app.stage.viewTarget = { s: 0.78, dy: -app.stage.h * 0.15 };
      // Raten zählt als ✓/✗ — keine Stoppuhr mehr (Tempo zählt erst beim eigenen Malen)
      app.showCard(`<h3>${escapeHtml(t('duelWhat', {}, ui))}</h3>
        <div class="answer-grid">${opts.map((id) => `<button class="btn answer" data-id="${escapeHtml(id)}">${escapeHtml(word(app.byId.get(id), learn))}</button>`).join('')}</div>`, 'duel');
      const card = document.querySelector('#round-overlay .card');
      let picked = false;
      const pick = async (id) => {
        if (picked) return; picked = true;
        const ok = id === w.id, themMs = d.senderMs;
        play.stop = true; await playback; // Wiedergabe beenden (Auflösung zeigt die ganze Zeichnung)
        app.duelState = { ...app.duelState, phase: 'reveal', chosen: id, ok, themMs, youMs: Math.round(performance.now() - shownAt), part, score: { you: score[1], them: score[0] }, replaying: false };
        app.sfx?.play(ok ? 'hit' : 'articleNo');
        card.querySelectorAll('.answer').forEach((b) => { b.disabled = true; b.classList.toggle('right', b.dataset.id === w.id); b.classList.toggle('picked', b.dataset.id === id && !ok); });
        await sleep(650);
        const sent = isRecognized(themMs);
        const langs = app.round.langOrder().map((l, i) => `<button class="lang-line${i === 0 ? ' first' : ''}" data-say="${l}"><small>${l.toUpperCase()}</small><span>${escapeHtml(word(w, l))}</span></button>`).join('');
        app.showCard(`<h3 class="duel-result ${ok ? 'win' : 'lose'}">${escapeHtml(ok ? t('duelRight', {}, ui) : t('duelWas', { w: word(w, learn) }, ui))}</h3>
          <canvas class="alive"></canvas><div class="langs">${langs}</div>
          <p class="times">${escapeHtml(sent ? t('duelSenderDrew', { b: secs1(themMs, ui) }, ui) : t('duelSenderMissed', {}, ui))}</p>
          <p class="duel-next">${escapeHtml(!ok ? t('duelLostRound', {}, ui) : sent ? t('duelBeat', { b: secs1(themMs, ui) }, ui) : t('duelBeatAny', {}, ui))}</p>
          <div class="actions"><button class="btn primary" data-act="back">${escapeHtml(t('duelBack', {}, ui))}</button><button class="btn ghost" data-act="home">${escapeHtml(t('home', {}, ui))}</button></div>`, 'duel');
        const c2 = document.querySelector('#round-overlay .card');
        if (ok) confetti(document.querySelector('#stage canvas.fx'), '#FFC857', 40);
        mount(c2.querySelector('canvas.alive'), { strokes: d.strokes, color: '#1E2A3A', style: 'pencil', width: 3.4, motion: { kind: w.motion, id: w.id }, delay: 100 });
        app.voice?.announce(w.id, app.round.langOrder(), { delay: 200 });
        history.replaceState(null, '', location.pathname + location.search);
        c2.addEventListener('click', (e) => {
          const s = e.target.closest('[data-say]'); if (s) { app.voice?.word(w.id, s.dataset.say); return; }
          // Rückspiel: du malst — erst danach Malzeit gegen Malzeit. Stand aus Sicht des neuen Absenders, adressiert an den Absender.
          if (e.target.closest('[data-act=back]')) { app.hideCard(); unmountAll(); duel.create({ versus: { ok, themMs, score: [score[0], score[1]], opp: d.from || 0 } }); resolve('back'); }
          if (e.target.closest('[data-act=home]')) { app.hideCard(); unmountAll(); app.goHome(); resolve('home'); }
        });
      };
      card.addEventListener('click', (e) => { const b = e.target.closest('.answer'); if (b && !b.disabled) pick(b.dataset.id); });
      app.hooks.answer = (id) => pick(id);
    });
  }

  /**
   * Link-Karte. In der Runde als Karte über der Bühne; auf jedem anderen Screen (Tagesende, Start) als Sheet auf genau diesem Screen.
   * result (Rückspiel): Ergebnis „Du hast in 3,1 s gemalt — Absender 4,2 s. Du führst 1:0" über den Link-Knöpfen.
   * Punkt 13: roher Link nur hinter „Link anzeigen"; „Link markieren und kopieren" nur, wenn Kopieren fehlschlug.
   */
  function showLinkCard(url, { strokes = null, autoShare = false, score = [0, 0], result = null } = {}) {
    const ui = app.settings.native, text = t('duelIncoming', {}, ui);
    const inRound = app.screen === 'round';
    let head;
    if (result) {
      const title = { faster: t('duelFaster', {}, ui), closeWin: t('duelCloseWin', {}, ui), closeLose: t('duelCloseLose', {}, ui), slower: t('duelSlower', {}, ui), wrong: t('duelWrongRound', {}, ui), tie: t('duelTie', {}, ui) }[result.key];
      const win = result.key === 'faster' || result.key === 'closeWin';
      const them = isRecognized(result.themMs) ? secs1(result.themMs, ui) : '–';
      const cmp = result.youMs != null ? t('duelCompare', { a: secs1(result.youMs, ui), b: them }, ui) : t('duelYouMissed', { b: them }, ui);
      const lead = result.you > result.them ? t('duelLeadYou', { a: result.you, b: result.them }, ui) : result.you < result.them ? t('duelLeadThem', { a: result.you, b: result.them }, ui) : t('duelTied', { a: result.you, b: result.them }, ui);
      head = `<h3 class="duel-result ${win ? 'win' : 'lose'}">${escapeHtml(title)}</h3>
        <p class="duel-score" aria-label="${escapeHtml(t('duelScore', { a: result.you, b: result.them }, ui))}"><span>${escapeHtml(t('duelYouShort', {}, ui))}</span><b>${result.you}</b><i>:</i><b>${result.them}</b><span>${escapeHtml(t('duelOtherShort', {}, ui))}</span></p>
        <p class="times duel-compare">${escapeHtml(cmp)}</p><p class="duel-lead">${escapeHtml(lead)}</p>`;
    } else head = `<h3>${escapeHtml(t('duelLink', {}, ui))}</h3>`;
    const html = `${head}${!inRound && strokes ? '<canvas class="link-art" aria-hidden="true"></canvas>' : ''}
      <p class="link-say">${escapeHtml(text)}</p><p class="hint link-status" hidden></p>
      <div class="actions"><button class="btn primary" data-act="share">${escapeHtml(result ? t('duelSendBack', {}, ui) : t('duelSend', {}, ui))}</button><button class="btn" data-act="copy">${escapeHtml(t('duelCopy', {}, ui))}</button><button class="btn ghost" data-act="done">${escapeHtml(t('finish', {}, ui))}</button></div>
      <details class="link-details"><summary>${escapeHtml(t('duelShowLink', {}, ui))}</summary><p class="link-box"><code>${escapeHtml(url)}</code></p></details>`;
    let card;
    const sheet = document.getElementById('sheet');
    if (inRound) { app.showCard(html, 'duel'); card = document.querySelector('#round-overlay .card'); }
    else {
      sheet.innerHTML = `<div class="sheet-card link-card" role="dialog" aria-label="${escapeHtml(t('duelLink', {}, ui))}">${html}</div>`; sheet.hidden = false; card = sheet.firstElementChild;
      const art = card.querySelector('canvas.link-art'); if (art) mount(art, { strokes, color: '#1E2A3A', style: 'pencil', width: 2.6, still: true });
      sheet.onclick = (e) => { if (e.target === sheet) close(); };
    }
    const status = card.querySelector('.link-status');
    const say = (msg, ok) => { status.textContent = msg; status.hidden = false; status.classList.toggle('ok', !!ok); if (!ok) { const det = card.querySelector('.link-details'); if (det) det.open = true; } };
    const close = () => { if (inRound) { app.hideCard(); app.goHome(); } else { unmountAll(sheet); sheet.hidden = true; sheet.innerHTML = ''; } };
    const doShare = async () => { const r = await shareLink(app, { url, text, quiet: true }); app.lastLinkShare = { mode: r, url, text }; if (r === 'copied') say(t('duelCopied', {}, ui), true); else if (r === 'shown') say(t('duelCopyManual', {}, ui), false); return r; };
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act=share]')) await doShare();
      if (e.target.closest('[data-act=copy]')) { const ok = await copyText(`${text}\n${url}`); app.lastLinkShare = { mode: ok ? 'copied' : 'failed', url, text }; say(t(ok ? 'duelCopied' : 'duelCopyManual', {}, ui), ok); }
      if (e.target.closest('[data-act=done]')) close();
    });
    if (autoShare) doShare();
  }
  app.duel.showLinkCard = showLinkCard;
}
