// Ablauf einer Tagesskizzen-Runde: Artikel-Schritt → Malen (bzw. Mehrzahl) → Hol es echt → Ergebnis.
// Plus Luft-Modus-Einstieg (Onboarding-Kette) und Kamera-Fallbacks.
import { t, word, strokeColor, ART_COLOR, ART_TEXT, cap, funnyAllowed } from '../core/i18n.js';
import { saveSettings } from '../core/store.js';
import { handSvg, POSES } from './hands.js';
import { escapeHtml } from './round.js';

const $ = (s, r = document) => r.querySelector(s);
const ARTS = ['der', 'die', 'das'];
export const isDesktop = () => { try { return matchMedia('(pointer: fine)').matches && !matchMedia('(hover: none)').matches && !('ontouchstart' in window && navigator.maxTouchPoints > 0); } catch { return true; } };
export const inAppBrowser = () => /Instagram|FBAN|FBAV|LinkedInApp/i.test(navigator.userAgent);

export function installFlow(app) {
  const ov = () => app.round.overlay;
  const ui = () => app.settings.native;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Luft-Modus ----------
  app.getAir = async () => {
    if (!app.air) { const { Air } = await import('./air.js'); app.air = new Air(app); }
    return app.air;
  };
  /** Luft-Modus einschalten. Rückgabe true = läuft. Fehler → Bildschirm-Modus ohne Nachhaken. */
  app.enterAir = async ({ handCheck = true } = {}) => {
    if (inAppBrowser()) { app.ui.toast(`${t('inApp')} — ${t('inAppB')}`, 4200); return false; }
    const air = await app.getAir();
    // Erst die Kamera-Abfrage (direkt nach der Vorab-Karte), dann die Modelle — bei Ablehnung kein Download umsonst
    try { await air.startCamera(); }
    catch (e) {
      app.log.push('camera ' + e.name);
      app.settings = saveSettings({ air: false, airDenied: e.name === 'NotAllowedError' || e.name === 'SecurityError' });
      app.ui.toast(e.name === 'NotAllowedError' ? t('camDenied') : t('camFail'), 3600);
      setMode('screen'); return false;
    }
    const card = showCard(`<h3>${escapeHtml(t('loadingAir', { p: 0 }))}</h3><div class="progress"><i style="width:0%"></i></div>`);
    try {
      await air.load((p) => { const bar = card.querySelector('.progress i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; const h = card.querySelector('h3'); if (h) h.textContent = t('loadingAir', { p: Math.round(p * 100) }); });
    } catch (e) {
      app.log.push('air-load ' + e.message); hideCard(); air.stop(); app.ui.toast(t('camFail')); setMode('screen'); return false;
    }
    air.start(); setMode('air');
    app.settings = saveSettings({ air: true, airDenied: false });
    if (handCheck) await app.handCheck();
    else hideCard();
    return true;
  };
  app.leaveAir = () => { app.air?.stop(); setMode('screen'); app.settings = saveSettings({ air: false }); };
  function setMode(m) {
    app.mode = m; document.body.dataset.mode = m;
    app.stage.pointerOn = m === 'screen';
    if (m === 'screen' && app.air) app.air.stop();
    renderToggle();
  }
  app.setMode = setMode;
  function renderToggle() {
    const el = $('#mode-toggle'); if (!el) return;
    el.hidden = app.screen !== 'round';
    // In-App-Browser: kein Balken über der Runde, nur ein kleiner Hinweis-Chip am „In die Luft"-Schalter
    const air = inAppBrowser()
      ? `<button class="chip locked" data-m="air" aria-pressed="false" title="${escapeHtml(t('inApp'))}">${escapeHtml(t('airToggle'))}<small>${escapeHtml(t('inAppChip'))}</small></button>`
      : `<button class="chip" data-m="air" aria-pressed="${app.mode === 'air'}">${escapeHtml(t('airToggle'))}</button>`;
    el.innerHTML = `<button class="chip" data-m="screen" aria-pressed="${app.mode === 'screen'}">${escapeHtml(t('screenToggle'))}</button>${air}`;
  }
  app.renderToggle = renderToggle;
  $('#mode-toggle').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.m === app.mode) return;
    app.sfx?.play('tap');
    if (b.dataset.m === 'air') { const wasEnabled = app.stage.enabled; app.stage.enabled = false; await app.enterAir({ handCheck: false }); app.stage.enabled = wasEnabled; }
    else app.leaveAir();
  });

  /** Hand-Check: Hand ≥ 0,5 s sichtbar → grün → weiter */
  app.handCheck = () => new Promise((resolve) => {
    const air = app.air;
    const card = showCard(`<div class="handcheck"><div class="hc-ring">${handSvg(POSES.open, { size: 90, ink: '#FFFBEF', fill: 'rgba(255,251,239,.08)' })}</div><h3>${escapeHtml(t('handCheck'))}</h3></div>`, 'clear');
    let since = null, done = false;
    const finish = () => { if (done) return; done = true; air.listeners.handcheck = null; card.classList.add('ok'); card.querySelector('h3').textContent = t('handOk'); app.sfx?.play('articleOk'); setTimeout(() => { hideCard(); resolve(true); }, 650); };
    air.listeners.handcheck = (hand, tt) => { if (hand) { since ??= tt; if (tt - since > 500) finish(); } else since = null; };
    app.hooks.handCheckSkip = finish;
    setTimeout(() => { if (!done) { done = true; air.listeners.handcheck = null; hideCard(); resolve(false); } }, 20000);
  });

  /** Nach dem ersten Treffer am Laptop: Angebot → Vorab-Karte → Abfrage → Hand-Check */
  app.offerAir = async () => {
    app.settings = saveSettings({ airOffered: true });
    const yes = await choice(`<h3>${escapeHtml(t('airOfferT'))}</h3><p>${escapeHtml(t('airOfferB'))}</p>`, [['yes', t('airYes'), 'primary'], ['no', t('airNo'), 'ghost']]);
    if (yes !== 'yes') { app.settings = saveSettings({ airDeclined: true }); return false; }
    const go = await choice(`<div class="precam">${handSvg(POSES.draw, { size: 84, accent: '#FFC857' })}<p class="pose">${escapeHtml(t('poseDraw'))}</p>${handSvg(POSES.open, { size: 84 })}<p class="pose">${escapeHtml(t('posePause'))}</p></div><h3>${escapeHtml(t('preCamT'))}</h3><p>${escapeHtml(t('preCamB'))}</p>`,
      [['go', t('preCamGo'), 'primary'], ['no', t('airNo'), 'ghost']], 'precam-card');
    if (go !== 'go') { app.settings = saveSettings({ airDeclined: true }); return false; }
    return app.enterAir({ handCheck: true });
  };

  // ---------- Artikel-Schritt (nur Lernsprache Deutsch) ----------
  app.articleStep = (w) => new Promise((resolve) => {
    const air = app.mode === 'air' && app.air?.cameraOn;
    const hint = air ? t('articleHintAir') : t('articleHintTap');
    const cards = ARTS.map((a, i) => `<button class="art-card art-${a}" data-a="${a}" style="--c:${ART_COLOR[a]};--ct:${ART_TEXT[a]}"><span class="ring" style="--p:0"></span>${handSvg(POSES[i + 1], { size: 58, accent: ART_COLOR[a] })}<span class="art-label">${a}</span><span class="art-n">${escapeHtml(t('fingers.' + (i + 1)))}</span></button>`).join('');
    const card = showCard(`<h3 class="art-q">${escapeHtml(t('articleQ', {}, 'de'))}</h3><p class="art-noun">${escapeHtml(w.de.noun)}</p><div class="art-cards">${cards}</div><p class="hint">${escapeHtml(hint)}</p>`, 'article');
    app.voice?.bare(w.id);
    let chosen = false;
    const choose = async (a, via) => {
      if (chosen) return; chosen = true;
      if (air) { app.air.listeners.article = null; app.air.counter.reset(); }
      const ok = a === w.de.art;
      const btn = card.querySelector(`[data-a="${a}"]`), right = card.querySelector(`[data-a="${w.de.art}"]`);
      card.classList.add('chosen');
      if (ok) { btn.classList.add('flash'); app.sfx?.play('articleOk'); }
      else { btn.classList.add('wobble'); right.classList.add('flash'); app.sfx?.play('articleNo'); card.querySelector('.hint').textContent = t('articleShow', { w: `${w.de.art} ${w.de.noun}` }); }
      app.voice?.word(w.id, 'de');
      app.lastArticle = { choice: a, ok, via };
      await sleep(ok ? 900 : 1700);
      hideCard();
      resolve({ choice: a, ok, via });
    };
    card.addEventListener('click', (e) => { const b = e.target.closest('.art-card'); if (b) choose(b.dataset.a, 'tap'); });
    app.hooks.chooseArticle = (a) => choose(a, 'hook');
    if (air) {
      app.air.counter.reset();
      app.air.listeners.article = (st) => {
        card.querySelectorAll('.art-card').forEach((b, i) => { b.querySelector('.ring').style.setProperty('--p', st.count === i + 1 ? st.progress : 0); b.classList.toggle('live', st.count === i + 1); });
        if (st.selected) choose(ARTS[st.selected - 1], 'fingers');
      };
    }
  });

  // ---------- Hol es echt ----------
  app.realStep = async (w) => {
    if (!w.echt || !app.air?.cameraOn || app.mode !== 'air') return null;
    const label = ui() === 'tr' ? word(w, 'tr') : cap(word(w, ui()), ui()); // Sprach-Review 1 Nr. 2/3/11: kasusneutral
    const card = showCard(`<h3>${escapeHtml(t('realQ', { w: label }))}</h3><div class="progress real"><i style="width:0%"></i></div><button class="btn ghost" data-act="skip">${escapeHtml(t('skip'))}</button>`, 'real');
    card.querySelector('[data-act=skip]').addEventListener('click', () => app.air.cancelHunt());
    await app.air.loadObjectDetector();
    app.onRealFrame = (score, box, p) => {
      const bar = card.querySelector('.progress i'); if (bar) bar.style.width = Math.round(Math.min(1, p) * 100) + '%';
      if (score >= 0.5 && box && app.air.layout) { // Objekt-Rahmen glüht (Video-Pixel → Bühne, gespiegelt)
        const L = app.air.layout(), vw = app.air.video.videoWidth || 640, vh = app.air.video.videoHeight || 480;
        const x0 = L.ox + (1 - (box.originX + box.width) / vw) * L.dw, y0 = L.oy + (box.originY / vh) * L.dh;
        app.stage.realBox = { x: x0, y: y0, w: (box.width / vw) * L.dw, h: (box.height / vh) * L.dh };
      } else app.stage.realBox = null;
    };
    const r = await app.air.hunt(w.echt);
    app.onRealFrame = null; app.stage.realBox = r.found && r.box ? app.stage.realBox : null;
    if (r.found) { app.stage.realGlowUntil = performance.now() + 1500; }
    if (r.found) { card.classList.add('stamp'); card.innerHTML = `<div class="x2">×2</div><h3>${escapeHtml(t('realOk'))}</h3>`; app.sfx?.play('fanfare'); await sleep(1500); }
    else if (!r.cancelled) { card.querySelector('h3').textContent = t('realNone'); await sleep(1100); }
    hideCard();
    return r.found;
  };

  // ---------- Karten-Helfer ----------
  function showCard(html, cls = '') {
    const o = ov(); o.hidden = false; o.className = 'overlay ' + cls;
    o.innerHTML = `<div class="card ${cls}-card" role="dialog">${html}</div>`;
    return o.firstElementChild;
  }
  function hideCard() { const o = ov(); o.hidden = true; o.innerHTML = ''; o.className = 'overlay'; }
  function choice(html, buttons, cls = '') {
    return new Promise((resolve) => {
      const card = showCard(`${html}<div class="actions">${buttons.map(([k, l, c]) => `<button class="btn ${c || ''}" data-k="${k}">${escapeHtml(l)}</button>`).join('')}</div>`, cls);
      card.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; app.sfx?.play('tap'); hideCard(); resolve(b.dataset.k); });
      app.hooks.choose = (k) => { hideCard(); resolve(k); };
      setTimeout(() => card.querySelector('.btn')?.focus({ preventScroll: true }), 30);
    });
  }
  app.showCard = showCard; app.hideCard = hideCard; app.choice = choice;

  // ---------- Slot ----------
  app.playSlot = async (slot, { index }) => {
    const w = app.byId.get(slot.id), learn = app.settings.learn;
    const plural = slot.kind === 'plural' ? slot.n : null;
    app.renderToggle();
    let articleOk = null;
    if (learn === 'de' && !plural) {
      app.round.showWord(w, { article: false });
      app.stage.clear(); app.stage.enabled = false;
      const a = await app.articleStep(w);
      articleOk = a.ok;
      app.round.showWord(w);
    } else {
      app.round.showWord(w, { plural });
      if (plural) app.voice?.plural(w.id, learn, plural); else app.voice?.word(w.id, learn);
    }
    let out;
    if (plural) out = await app.pluralRound(w, plural);
    else out = await app.round.draw({ id: w.id, color: strokeColor(w, learn) });
    out.kind = slot.kind; out.n = plural; out.articleOk = articleOk;
    if (articleOk) out.points += 20;
    const order = app.round.langOrder();
    if (plural) app.voice?.announce(w.id, order, { delay: 400, plural });
    else if (out.result === 'hit') app.voice?.hitAnnounce(w.id, order);
    else if (out.helped) app.voice?.announce(w.id, order, { delay: 500 });
    else app.voice?.missAnnounce(w.id, order);
    await sleep(out.result === 'hit' ? 950 : 1000); // Treffer-/Zerbrösel-Animation wirken lassen
    if (out.result === 'hit' && !plural) {
      const real = await app.realStep(w);
      out.real = !!real; if (real) out.points *= 2;
    }
    app.lastResult = out;
    if (out.result === 'hit' || out.parts > 0) {
      const strokes = out.drawings?.length ? out.drawings[0] : out.strokes;
      app.dict.put(w.id, { strokes, date: app.today(), articleOk, funny: out.bestWrong && funnyAllowed(w.id, out.bestWrong.id) ? out.bestWrong.id : null }).then(() => app.onDictChange?.());
    }
    const extraHtml = plural && out.tip ? `<p class="tipcard">${escapeHtml(out.tip)}</p>` : '';
    await app.round.resultCard(out, { plural, extraHtml, forceHit: !!(plural && out.parts > 0) });
    if (out.result === 'hit' && isDesktop() && !app.settings.airOffered && app.mode === 'screen' && !app.settings.air && !app.DEMO) {
      await app.offerAir();
    }
    return out;
  };
}
