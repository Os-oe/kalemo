// Luft-Duell ohne Server: Link mit Striche-Code im #-Hash → Replay mit Original-Timing + nachgespielte KI-Tipps
// → 4 Antwort-Optionen in der eigenen Lernsprache → Auflösung + 3 Sprachen + Zeitvergleich → Mal zurück.
import { t, word, cap, strokeColor, LANGS, LANG_CODE } from '../core/i18n.js';
import { encode, decode, withTimes, timingOf } from '../core/codec.js';
import { saveSettings } from '../core/store.js';
import { RoundEngine } from '../core/engine.js';
import { escapeHtml } from './round.js';
import { shareLink } from './share.js';
import { mount, unmountAll } from './alive.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function installDuel(app) {
  let classNames = null;
  const classes = async () => (classNames ||= app.clf?.classNames || (await fetch('models/v1/doodlenet/class_names.txt').then((r) => r.text())).split('\n').map((s) => s.trim()).filter(Boolean));
  const baseUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

  const duel = app.duel = {
    linkFor: async (id, strokes, senderMs) => {
      const w = app.byId.get(id); const idx = (await classes()).indexOf(w.cls);
      const code = encode({ classIdx: idx, senderMs, strokes });
      return { code, url: `${baseUrl()}#d=${code}` };
    },
    /** Zeichnung (mit ts oder kompakt+timing) als Duell verschicken */
    sendDrawing: async (id, strokes, senderMs = 0, timing = null) => {
      const withTs = strokes[0] && strokes[0][2] ? strokes : withTimes(strokes, timing || strokes.map(() => ({ gap: 300, dur: 700 })));
      const { url, code } = await duel.linkFor(id, withTs, senderMs);
      app.lastDuel = { url, code, length: url.length, id };
      showLinkCard(url);
      return url;
    },
    /** Erstellen: 1 von 3 Wörtern wählen → malen → Link */
    create: () => {
      app.show('duel');
      const pool = app.words.filter((w) => (w.acc ?? 0) >= 0.9);
      const pick = []; const used = new Set();
      while (pick.length < 3 && pick.length < pool.length) { const w = pool[Math.floor(Math.random() * pool.length)]; if (!used.has(w.id)) { used.add(w.id); pick.push(w); } }
      const learn = app.settings.learn;
      document.body.classList.remove('replay', 'options');
      $('#duel-body').innerHTML = `<h2 class="h-hand">${escapeHtml(t('duelT'))}</h2><canvas class="duel-stage" aria-hidden="true"></canvas><p class="lead">${escapeHtml(t('duelPick'))}</p>
        <div class="word-picks">${pick.map((w) => `<button class="word-pick" data-id="${escapeHtml(w.id)}" style="--c:${strokeColor(w, learn)}"><span>${escapeHtml(word(w, learn))}</span></button>`).join('')}</div>
        <p class="hint">${escapeHtml(t('duelDraw'))}</p><button class="btn ghost" data-act="home">${escapeHtml(t('home'))}</button>`;
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
        await sleep(700);
        await duel.sendDrawing(w.id, out.strokes, out.result === 'hit' ? out.hitAt : 20000);
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
        const s = app.settings;
        const seg = (key) => LANGS.map((l) => `<button role="radio" aria-checked="${s[key] === l}" data-k="${key}" data-l="${l}" aria-label="${escapeHtml(t('langName.' + l))}">${LANG_CODE[l]}</button>`).join('');
        $('#duel-body').innerHTML = `<h2 class="h-hand">${escapeHtml(t('duelIncoming'))}</h2>
          <section class="pair"><label class="pair-col"><span>${escapeHtml(t('iSpeak'))}</span><div class="seg" role="radiogroup">${seg('native')}</div></label>
          <label class="pair-col"><span>${escapeHtml(t('iLearn'))}</span><div class="seg" role="radiogroup">${seg('learn')}</div></label></section>
          <button class="btn primary big" data-act="go">${escapeHtml(t('duelWatch'))}</button>`;
      };
      render();
      $('#duel-body').onclick = (e) => {
        const b = e.target.closest('[data-l]');
        if (b) { const key = b.dataset.k, other = key === 'native' ? 'learn' : 'native', l = b.dataset.l; const patch = { [key]: l }; if (app.settings[other] === l) patch[other] = app.settings[key]; app.settings = saveSettings(patch); app.applyTexts(); render(); return; }
        if (e.target.closest('[data-act=go]')) { app.settings = saveSettings({ chosenPair: true }); app.applyTexts(); resolve(); }
      };
      app.hooks.pairGo = () => { app.settings = saveSettings({ chosenPair: true }); app.applyTexts(); resolve(); };
    });
  }

  async function replay(d, w) {
    const learn = app.settings.learn;
    app.show('round'); app.renderToggle(); app.ui.slots(0, 0, []); document.body.classList.add('replay');
    $('#word').textContent = '?'; $('#word-sub').textContent = t('duelWatch');
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
    // Striche mit Original-Timing abspielen
    for (let s = 0; s < mapped.length; s++) {
      const [xs, ys, ts] = mapped[s];
      await sleep(Math.max(0, t0 + ts[0] - performance.now()));
      st.beginStroke(xs[0], ys[0]);
      for (let i = 1; i < xs.length; i++) {
        const target = t0 + ts[i];
        while (performance.now() < target) {
          const k = Math.min(1, 1 - (target - performance.now()) / Math.max(16, ts[i] - ts[i - 1]));
          st.addPoint(xs[i - 1] + (xs[i] - xs[i - 1]) * k, ys[i - 1] + (ys[i] - ys[i - 1]) * k);
          if (performance.now() - lastClassify > 450) { lastClassify = performance.now(); classify(); }
          await sleep(16);
        }
        st.addPoint(xs[i], ys[i]);
      }
      st.endStroke(); classify();
    }
    await sleep(700);
    st.enabled = false; st.hintOn = true;
    return askOptions(d, w, t0);
  }

  function askOptions(d, w, t0) {
    return new Promise((resolve) => {
      const learn = app.settings.learn, ui = app.settings.native;
      const tips = (app.duelState.tips || []).filter((id) => id !== w.id);
      const opts = [w.id, ...new Set(tips)].slice(0, 4);
      while (opts.length < 4) { const r = app.words[Math.floor(Math.random() * app.words.length)].id; if (!opts.includes(r)) opts.push(r); }
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      app.duelState = { ...app.duelState, phase: 'options', options: opts };
      document.body.classList.add('options'); $('#word-sub').textContent = '';
      app.showCard(`<h3>${escapeHtml(t('duelWhat', {}, ui))}</h3><div class="answer-grid">${opts.map((id) => `<button class="btn answer" data-id="${escapeHtml(id)}">${escapeHtml(word(app.byId.get(id), learn))}</button>`).join('')}</div>`, 'duel');
      const card = document.querySelector('#round-overlay .card');
      const pick = async (id) => {
        const you = Math.round((performance.now() - t0) / 1000), them = Math.round(d.senderMs / 1000);
        const ok = id === w.id;
        app.duelState = { ...app.duelState, phase: 'reveal', chosen: id, ok };
        app.sfx?.play(ok ? 'hit' : 'articleNo');
        card.querySelectorAll('.answer').forEach((b) => { b.disabled = true; b.classList.toggle('right', b.dataset.id === w.id); b.classList.toggle('picked', b.dataset.id === id && !ok); });
        await sleep(650);
        const langs = app.round.langOrder().map((l, i) => `<button class="lang-line${i === 0 ? ' first' : ''}" data-say="${l}"><small>${l.toUpperCase()}</small><span>${escapeHtml(word(w, l))}</span></button>`).join('');
        app.showCard(`<h3>${escapeHtml(ok ? t('duelRight', {}, ui) : t('duelWas', { w: word(w, learn) }, ui))}</h3><canvas class="alive"></canvas><div class="langs">${langs}</div>
          <p class="times">${escapeHtml(t('duelYou', { a: you }, ui))} · ${escapeHtml(t('duelThem', { b: them || '–' }, ui))}</p>
          <div class="actions"><button class="btn primary" data-act="back">${escapeHtml(t('duelBack', {}, ui))}</button><button class="btn ghost" data-act="home">${escapeHtml(t('home', {}, ui))}</button></div>`, 'duel');
        const c2 = document.querySelector('#round-overlay .card');
        mount(c2.querySelector('canvas.alive'), { strokes: d.strokes, color: '#1E2A3A', style: 'pencil', width: 3.4, motion: { kind: w.motion, id: w.id }, delay: 100 });
        app.voice?.announce(w.id, app.round.langOrder(), { delay: 200 });
        history.replaceState(null, '', location.pathname + location.search);
        c2.addEventListener('click', (e) => {
          const s = e.target.closest('[data-say]'); if (s) { app.voice?.word(w.id, s.dataset.say); return; }
          if (e.target.closest('[data-act=back]')) { app.hideCard(); unmountAll(); duel.create(); resolve('back'); }
          if (e.target.closest('[data-act=home]')) { app.hideCard(); unmountAll(); app.goHome(); resolve('home'); }
        });
      };
      card.addEventListener('click', (e) => { const b = e.target.closest('.answer'); if (b && !b.disabled) pick(b.dataset.id); });
      app.hooks.answer = (id) => pick(id);
    });
  }

  function showLinkCard(url) {
    const ui = app.settings.native;
    app.showCard(`<h3>${escapeHtml(t('duelLink', {}, ui))}</h3><p class="link-box"><code>${escapeHtml(url)}</code></p>
      <div class="actions"><button class="btn primary" data-act="share">${escapeHtml(t('duelSend', {}, ui))}</button><button class="btn" data-act="copy">${escapeHtml(t('duelCopy', {}, ui))}</button><button class="btn ghost" data-act="home">${escapeHtml(t('finish', {}, ui))}</button></div>`, 'duel');
    const card = document.querySelector('#round-overlay .card');
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act=share]')) await shareLink(app, { url, text: t('duelIncoming', {}, ui) });
      if (e.target.closest('[data-act=copy]')) { const { copyText } = await import('./share.js'); if (await copyText(url)) app.ui.toast(t('duelCopied', {}, ui)); }
      if (e.target.closest('[data-act=home]')) { app.hideCard(); app.goHome(); }
    });
  }
}
