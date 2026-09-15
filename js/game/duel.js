// Luft-Duell ohne Server: Link mit Striche-Code im #-Hash → Replay mit Original-Timing + nachgespielte KI-Tipps
// → 4 Antwort-Optionen in der eigenen Lernsprache → Auflösung + 3 Sprachen + Zeitvergleich → Mal zurück.
import { t, word, cap, strokeColor, LANGS, LANG_CODE } from '../core/i18n.js';
import { encode, decode, withTimes, timingOf } from '../core/codec.js';
import { saveSettings } from '../core/store.js';
import { RoundEngine } from '../core/engine.js';
import { escapeHtml } from './round.js';
import { shareLink, copyText } from './share.js';
import { mount, unmountAll, confetti } from './alive.js';
import { duelOutcome, secs1, OPTIONS_AT_MS } from '../core/duelscore.js';
import { mountPair } from './pair.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function installDuel(app) {
  let classNames = null;
  const classes = async () => (classNames ||= app.clf?.classNames || (await fetch('models/v1/doodlenet/class_names.txt').then((r) => r.text())).split('\n').map((s) => s.trim()).filter(Boolean));
  const baseUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

  const duel = app.duel = {
    linkFor: async (id, strokes, senderMs, score = [0, 0]) => {
      const w = app.byId.get(id); const idx = (await classes()).indexOf(w.cls);
      const code = encode({ classIdx: idx, senderMs, strokes, score });
      return { code, url: `${baseUrl()}#d=${code}` };
    },
    /** Zeichnung (mit ts oder kompakt+timing) als Duell verschicken. autoShare: direkt Teilen-Menü öffnen (Tagesende). score = [ich, du] */
    sendDrawing: async (id, strokes, senderMs = 0, timing = null, { autoShare = false, score = [0, 0] } = {}) => {
      const withTs = strokes[0] && strokes[0][2] ? strokes : withTimes(strokes, timing || strokes.map(() => ({ gap: 300, dur: 700 })));
      const { url, code } = await duel.linkFor(id, withTs, senderMs, score);
      app.lastDuel = { url, code, length: url.length, id, score };
      showLinkCard(url, { strokes: withTs, autoShare, score });
      return url;
    },
    /** Erstellen: 1 von 3 Wörtern wählen → malen → Link. score = Stand aus eigener Sicht (Rückspiel) */
    create: ({ score = null } = {}) => {
      const sc = score || [0, 0];
      app.show('duel');
      const pool = app.words.filter((w) => (w.acc ?? 0) >= 0.9);
      const pick = []; const used = new Set();
      while (pick.length < 3 && pick.length < pool.length) { const w = pool[Math.floor(Math.random() * pool.length)]; if (!used.has(w.id)) { used.add(w.id); pick.push(w); } }
      const learn = app.settings.learn;
      document.body.classList.remove('replay', 'options');
      $('#duel-body').innerHTML = `<h2 class="h-hand">${escapeHtml(t('duelT'))}</h2><canvas class="duel-stage" aria-hidden="true"></canvas><p class="lead">${escapeHtml(t('duelPick'))}</p>
        <div class="word-picks">${pick.map((w) => `<button class="word-pick" data-id="${escapeHtml(w.id)}" style="--c:${strokeColor(w, learn)}"><span>${escapeHtml(word(w, learn))}</span>${app.settings.native !== learn ? `<small>${escapeHtml(word(w, app.settings.native))}</small>` : ''}</button>`).join('')}</div>
        <p class="hint">${escapeHtml(t('duelDraw'))}</p><button class="btn ghost" data-act="home">${escapeHtml(t('back'))}</button>`;
      app.duelPicks = pick.map((w) => w.id);
      app.others().then((o) => { const c = $('#duel-body canvas.duel-stage'); if (c) mount(c, { strokes: o.star[0].strokes, color: '#FFC857', style: 'glow', width: 2.3, replay: 2.2, boil: 0.4 }); });
      $('#duel-body').onclick = async (e) => {
        const b = e.target.closest('.word-pick');
        if (e.target.closest('[data-act=home]')) { app.goHome(); return; }
        if (!b) return;
        app.sfx?.play('tap');
        await app.clfPromise;
        const w = app.byId.get(b.dataset.id);
        app.show('round'); app.renderToggle(); app.ui.slots(0, 0, []);
        app.round.showWord(w); app.voice?.word(w.id, learn);
        const out = await app.round.draw({ id: w.id, color: strokeColor(w, learn) });
        app.lastResult = { ...out, kind: 'duel' };
        if (out.result === 'hit') app.voice?.hitAnnounce(w.id, app.round.langOrder()); else app.voice?.missAnnounce(w.id, app.round.langOrder());
        await sleep(1100);
        await duel.sendDrawing(w.id, out.strokes, out.result === 'hit' ? out.hitAt : 20000, null, { score: sc });
      };
    },
    /** Empfangen */
    receive: async (code) => {
      let d;
      try { d = decode(code); } catch (e) { app.log.push('duel ' + e.message); app.ui.toast(t('duelBroken'), 4000); history.replaceState(null, '', location.pathname + location.search); return false; }
      const cls = (await classes())[d.classIdx]; const w = app.words.find((x) => x.cls === cls) || app.wordsAll?.find((x) => x.cls === cls);
      if (!w) { app.ui.toast(t('duelBroken'), 4000); return false; }
      app.incoming = { d, w };
      if (!app.settings.chosenPair) { await pairIntro(); }
      await app.clfPromise;
      return replay(d, w);
    },
  };

  function pairIntro() {
    return new Promise((resolve) => {
      app.show('duel');
      const render = () => {
        $('#duel-body').innerHTML = `<h2 class="h-hand">${escapeHtml(t('duelIncoming'))}</h2>
          <section class="pair" id="duel-pair"><div class="pair-col"><span id="dp-n">${escapeHtml(t('iSpeak'))}</span><div class="seg" data-pair="native" role="radiogroup" aria-labelledby="dp-n"></div></div>
          <button type="button" class="swap-btn" data-pair="swap"></button>
          <div class="pair-col"><span id="dp-l">${escapeHtml(t('iLearn'))}</span><div class="seg" data-pair="learn" role="radiogroup" aria-labelledby="dp-l"></div></div></section>
          <button class="btn primary big" data-act="go">${escapeHtml(t('duelWatch'))}</button>`;
        mountPair($('#duel-pair'), app, { onChange: () => { app.applyTexts(); render(); } });
      };
      render();
      $('#duel-body').onclick = (e) => {
        if (e.target.closest('[data-act=go]')) { app.settings = saveSettings({ chosenPair: true }); app.applyTexts(); resolve(); }
      };
      app.hooks.pairGo = () => { app.settings = saveSettings({ chosenPair: true }); app.applyTexts(); resolve(); };
    });
  }

  async function replay(d, w) {
    const learn = app.settings.learn;
    app.show('round'); app.renderToggle(); app.ui.slots(0, 0, []); document.body.classList.add('replay');
    const [sThem, sYou] = d.score || [0, 0];
    $('#word').textContent = '?'; $('#word-sub').textContent = sThem + sYou > 0 ? `${t('duelWatch')} · ${t('duelRematch', { a: sYou, b: sThem })}` : t('duelWatch');
    const st = app.stage; st.clear(); st.setColor(strokeColor(w, learn)); st.enabled = true; st.pointerOn = false; st.hintOn = false;
    const strokes = withTimes(d.strokes, d.timing);
    const mapped = st.mapFixture(strokes).map((s, i) => [s[0], s[1], strokes[i][2]]);
    const total = strokes.length ? strokes[strokes.length - 1][2].slice(-1)[0] : 0;
    const engine = new RoundEngine({ target: w.id, durationMs: total + 1500, minInk: Math.min(st.w, st.h) * 0.18 });
    const t0 = performance.now(); engine.start(t0);
    app.duelState = { phase: 'replay', target: w.id, tips: [] };
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
    // Striche mit Original-Timing abspielen — läuft weiter, während die Antworten schon eingeblendet sind
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
    // Antworten nach ~3 s (oder sobald die Wiedergabe vorher fertig ist)
    await Promise.race([sleep(OPTIONS_AT_MS), playback.then(() => sleep(300))]);
    return askOptions(d, w, play, playback, distract);
  }

  function askOptions(d, w, play, playback, distract = []) {
    return new Promise((resolve) => {
      const learn = app.settings.learn, ui = app.settings.native;
      const tips = (app.duelState.tips || []).filter((id) => id !== w.id);
      const opts = [w.id, ...new Set([...distract.slice(0, 2), ...tips, ...distract.slice(2)])].slice(0, 4);
      while (opts.length < 4) { const r = app.words[Math.floor(Math.random() * app.words.length)].id; if (!opts.includes(r)) opts.push(r); }
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      const score = d.score || [0, 0];
      const shownAt = performance.now();
      app.duelState = { ...app.duelState, phase: 'options', options: opts, replaying: !play.done, shownAt: Math.round(shownAt) };
      document.body.classList.add('options'); $('#word-sub').textContent = '';
      app.stage.viewTarget = { s: 0.78, dy: -app.stage.h * 0.15 };
      app.showCard(`<h3>${escapeHtml(t('duelWhat', {}, ui))}</h3>
        <p class="duel-clock"><span class="you"><b>0,0</b> s</span><span class="them">${escapeHtml(t('duelThem', { b: secs1(d.senderMs, ui) }, ui))}</span></p>
        <div class="answer-grid">${opts.map((id) => `<button class="btn answer" data-id="${escapeHtml(id)}">${escapeHtml(word(app.byId.get(id), learn))}</button>`).join('')}</div>`, 'duel');
      const card = document.querySelector('#round-overlay .card');
      const clock = card.querySelector('.duel-clock b'); let clockRaf = 0;
      const tickClock = () => { if (!clock.isConnected) return; clock.textContent = secs1(performance.now() - shownAt, ui); clockRaf = requestAnimationFrame(tickClock); };
      tickClock();
      let picked = false;
      const pick = async (id, { ms = null } = {}) => {
        if (picked) return; picked = true; cancelAnimationFrame(clockRaf);
        const youMs = ms ?? Math.round(performance.now() - shownAt), themMs = d.senderMs;
        const ok = id === w.id;
        const res = duelOutcome({ ok, youMs, themMs, score });
        play.stop = true; await playback; // Wiedergabe beenden (Auflösung zeigt die ganze Zeichnung)
        app.duelState = { ...app.duelState, phase: 'reveal', chosen: id, ok, youMs, themMs, outcome: res.key, score: { you: res.you, them: res.them }, replaying: false };
        app.sfx?.play(ok ? 'hit' : 'articleNo');
        card.querySelectorAll('.answer').forEach((b) => { b.disabled = true; b.classList.toggle('right', b.dataset.id === w.id); b.classList.toggle('picked', b.dataset.id === id && !ok); });
        await sleep(650);
        const title = { faster: t('duelFaster', {}, ui), closeWin: t('duelCloseWin', {}, ui), closeLose: t('duelCloseLose', {}, ui), slower: t('duelSlower', {}, ui), wrong: t('duelWas', { w: word(w, learn) }, ui) }[res.key];
        const win = res.key === 'faster' || res.key === 'closeWin';
        const langs = app.round.langOrder().map((l, i) => `<button class="lang-line${i === 0 ? ' first' : ''}" data-say="${l}"><small>${l.toUpperCase()}</small><span>${escapeHtml(word(w, l))}</span></button>`).join('');
        app.showCard(`<h3 class="duel-result ${win ? 'win' : 'lose'}">${escapeHtml(title)}</h3>
          <p class="duel-score" aria-label="${escapeHtml(t('duelScore', { a: res.you, b: res.them }, ui))}"><span>${escapeHtml(t('duelYouShort', {}, ui))}</span><b>${res.you}</b><i>:</i><b>${res.them}</b><span>${escapeHtml(t('duelThemShort', {}, ui))}</span></p>
          <canvas class="alive"></canvas><div class="langs">${langs}</div>
          <p class="times">${escapeHtml(t('duelYou', { a: ok ? secs1(youMs, ui) : '–' }, ui))} · ${escapeHtml(t('duelThem', { b: secs1(themMs, ui) }, ui))}</p>
          <div class="actions"><button class="btn primary" data-act="back">${escapeHtml(t('duelBack', {}, ui))}</button><button class="btn ghost" data-act="home">${escapeHtml(t('home', {}, ui))}</button></div>`, 'duel');
        const c2 = document.querySelector('#round-overlay .card');
        if (win) confetti(document.querySelector('#stage canvas.fx'), '#FFC857', 50);
        mount(c2.querySelector('canvas.alive'), { strokes: d.strokes, color: '#1E2A3A', style: 'pencil', width: 3.4, motion: { kind: w.motion, id: w.id }, delay: 100 });
        app.voice?.announce(w.id, app.round.langOrder(), { delay: 200 });
        history.replaceState(null, '', location.pathname + location.search);
        c2.addEventListener('click', (e) => {
          const s = e.target.closest('[data-say]'); if (s) { app.voice?.word(w.id, s.dataset.say); return; }
          // Rückspiel trägt den Stand aus Sicht des neuen Absenders mit
          if (e.target.closest('[data-act=back]')) { app.hideCard(); unmountAll(); duel.create({ score: [res.you, res.them] }); resolve('back'); }
          if (e.target.closest('[data-act=home]')) { app.hideCard(); unmountAll(); app.goHome(); resolve('home'); }
        });
      };
      card.addEventListener('click', (e) => { const b = e.target.closest('.answer'); if (b && !b.disabled) pick(b.dataset.id); });
      app.hooks.answer = (id, o) => pick(id, o);
    });
  }

  /**
   * Link-Karte. In der Runde als Karte über der Bühne; auf jedem anderen Screen (Tagesende, Start) als Sheet
   * auf genau diesem Screen (P1-2: früher landete sie im versteckten Runden-Screen). Kopieren nimmt immer den Satz mit (P3-11).
   */
  function showLinkCard(url, { strokes = null, autoShare = false, score = [0, 0] } = {}) {
    const ui = app.settings.native, text = t('duelIncoming', {}, ui);
    const inRound = app.screen === 'round';
    const html = `<h3>${escapeHtml(t('duelLink', {}, ui))}</h3>${!inRound && strokes ? '<canvas class="link-art" aria-hidden="true"></canvas>' : ''}${score[0] + score[1] > 0 ? `<p class="duel-score small"><span>${escapeHtml(t('duelYouShort', {}, ui))}</span><b>${score[0]}</b><i>:</i><b>${score[1]}</b><span>${escapeHtml(t('duelOtherShort', {}, ui))}</span></p>` : ''}
      <p class="link-say">${escapeHtml(text)}</p><p class="link-box"><code>${escapeHtml(url)}</code></p><p class="hint ok link-status" hidden></p>
      <div class="actions"><button class="btn primary" data-act="share">${escapeHtml(t('duelSend', {}, ui))}</button><button class="btn" data-act="copy">${escapeHtml(t('duelCopy', {}, ui))}</button><button class="btn ghost" data-act="done">${escapeHtml(t('finish', {}, ui))}</button></div>`;
    let card;
    const sheet = document.getElementById('sheet');
    if (inRound) { app.showCard(html, 'duel'); card = document.querySelector('#round-overlay .card'); }
    else {
      sheet.innerHTML = `<div class="sheet-card link-card" role="dialog" aria-label="${escapeHtml(t('duelLink', {}, ui))}">${html}</div>`; sheet.hidden = false; card = sheet.firstElementChild;
      const art = card.querySelector('canvas.link-art'); if (art) mount(art, { strokes, color: '#1E2A3A', style: 'pencil', width: 2.6, still: true });
      sheet.onclick = (e) => { if (e.target === sheet) close(); };
    }
    const status = card.querySelector('.link-status');
    const say = (msg) => { status.textContent = msg; status.hidden = false; };
    const close = () => { if (inRound) { app.hideCard(); app.goHome(); } else { unmountAll(sheet); sheet.hidden = true; sheet.innerHTML = ''; } };
    const doShare = async () => { const r = await shareLink(app, { url, text, quiet: true }); app.lastLinkShare = { mode: r, url, text }; if (r === 'copied') say(t('duelCopied', {}, ui)); return r; };
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act=share]')) await doShare();
      if (e.target.closest('[data-act=copy]')) { const ok = await copyText(`${text}\n${url}`); app.lastLinkShare = { mode: ok ? 'copied' : 'failed', url, text }; if (ok) say(t('duelCopied', {}, ui)); }
      if (e.target.closest('[data-act=done]')) close();
    });
    if (autoShare) doShare();
  }
}
