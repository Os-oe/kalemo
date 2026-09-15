// Ablauf einer Tagesskizzen-Runde: Artikel-Schritt → Malen (bzw. Mehrzahl) → Hol es echt → Ergebnis.
// Plus Luft-Modus-Einstieg (Onboarding-Kette) und Kamera-Fallbacks.
import { t, word, strokeColor, ART_COLOR, ART_TEXT, cap, funnyAllowed } from '../core/i18n.js';
import { saveSettings } from '../core/store.js';
import { pickFunniest } from '../core/funny.js';
import { handSvg, POSES } from './hands.js';
import { escapeHtml } from './round.js';

const $ = (s, r = document) => r.querySelector(s);
const ARTS = ['der', 'die', 'das'];
export const isDesktop = () => { try { return matchMedia('(pointer: fine)').matches && !matchMedia('(hover: none)').matches && !('ontouchstart' in window && navigator.maxTouchPoints > 0); } catch { return true; } };
export const inAppBrowser = () => /Instagram|FBAN|FBAV|LinkedInApp/i.test(navigator.userAgent);
/** Mobilfunk / Datensparen / langsames Netz (navigator.connection; unbekannt = nicht getaktet) */
export const metered = () => { try { const c = navigator.connection; return !!c && (!!c.saveData || c.type === 'cellular' || /(^|-)(2g|3g)$/.test(c.effectiveType || '')); } catch { return false; } };
export const AIR_ASSETS = ['vendor/v1/mediapipe/vision_bundle.mjs', 'vendor/v1/mediapipe/vision_wasm_internal.wasm', 'models/v1/mediapipe/hand_landmarker.task'];

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
    if (handCheck) {
      if (!app.round.active) app.stage.clear();
      const seen = await app.handCheck();
      if (seen && !app.settings.penCalib) await app.calibratePen(); // Zusatz 23: einmalig anbieten, überspringbar
    }
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
    if (!el.hidden && !app._airPreloadT && app.mode === 'screen') app._airPreloadT = setTimeout(() => { if (app.screen === 'round') app.preloadAir(); else app._airPreloadT = null; }, 2500);
  }
  app.renderToggle = renderToggle;
  $('#mode-toggle').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.m === app.mode) return;
    app.sfx?.play('tap');
    if (b.dataset.m === 'air') await app.airFromToggle();
    else app.leaveAir();
  });

  /**
   * Iteration 2 (R2-P2-9): Umschalter „In die Luft" mitten in der Runde — die Uhr steht, bis die Handerkennung läuft;
   * beim ersten Mal dieselbe Onboarding-Kette wie am Tagesende (Gesten + Datenschutz-Satz → Kamera → Hand-Check →
   * Kalibrierungs-Angebot); auf Mobilfunk erst die Größe ansagen.
   */
  app.airFromToggle = async () => {
    if (inAppBrowser()) { app.ui.toast(`${t('inApp')} — ${t('inAppB')}`, 4200); return false; }
    const r = app.round.active, wasEnabled = app.stage.enabled;
    const paused = !!(r && !r.engine.done && !r.engine.paused);
    if (paused) { r.engine.pause(performance.now()); if (app.stage.active) app.stage.endStroke(); }
    app.stage.enabled = false;
    app.airToggle = { paused, elapsedBefore: r ? Math.round(r.engine.elapsed(performance.now())) : null };
    let ok = false;
    try {
      if (metered() && !app.air?.landmarker) {
        const k = await choice(`<h3>${escapeHtml(t('airSizeT'))}</h3><p>${escapeHtml(t('airSizeB'))}</p>`, [['load', t('airSizeGo'), 'primary'], ['no', t('airNo'), 'ghost']], 'airsize');
        if (k !== 'load') return false;
      }
      ok = app.settings.airOnboarded ? await app.enterAir({ handCheck: false }) : await app.offerAir({ skipAsk: true, keepInk: true });
    } finally {
      if (app.round.active === r) { app.stage.enabled = wasEnabled; app.stage.pointerOn = app.mode === 'screen'; }
      if (paused && app.round.active === r && !r.engine.done) r.engine.resume(performance.now());
      app.airToggle = { ...app.airToggle, ok, elapsedAfter: r && app.round.active === r ? Math.round(r.engine.elapsed(performance.now())) : null };
      renderToggle();
    }
    return ok;
  };

  /** Handerkennung im Hintergrund vorladen (nur Bytes in den HTTP-Cache, kein Kompilieren): Laptop, WLAN/unbekannt, nicht In-App */
  app.preloadAir = () => {
    if (app._airPreload || app.air?.landmarker || inAppBrowser() || metered() || !isDesktop()) return null;
    if (app.TEST && new URLSearchParams(location.search).get('preload') !== '1') return null; // Test-Suiten laden die 20 MB nur auf Wunsch
    app._airPreload = Promise.all(AIR_ASSETS.map((u) => fetch(u, { priority: 'low' }).then((res) => res.arrayBuffer()).then((b) => b.byteLength).catch(() => 0)));
    app.log.push('air-preload');
    return app._airPreload;
  };

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

  /**
   * Stift-Kalibrierung (Zusatz 23): 5 s „Zeigefinger hoch", 5 s „Daumen + Zeigefinger zusammen" → misst Erkennungs-Anteil,
   * Fingerspitzen-Zittern und Wackler je Geste (core/calib.js) und stellt die robustere ein. Einstellungen können überschreiben.
   */
  app.calibratePen = async ({ phaseMs = 5000, ask = true } = {}) => {
    const air = app.air; if (!air) return null;
    if (ask) {
      const k = await choice(`<div class="calib-ill">${handSvg(POSES.draw, { size: 84, accent: '#FFC857' })}</div><h3>${escapeHtml(t('calibT'))}</h3><p>${escapeHtml(t('calibB'))}</p>`,
        [['go', t('calibGo'), 'primary'], ['skip', t('skip'), 'ghost']], 'calib');
      if (k !== 'go') { app.settings = saveSettings({ penCalib: { skipped: true, at: app.today() } }); app.calibPhase = 'skipped'; return null; }
    }
    const { chooseGesture } = await import('../core/calib.js');
    const frames = { index: [], pinch: [] }; let phase = 'index';
    air.listeners.calib = (lm, tt) => frames[phase].push({ lm, t: tt });
    for (const [ph, key] of [['index', 'calibIndex'], ['pinch', 'calibPinch']]) {
      phase = ph; app.calibPhase = ph;
      const card = showCard(`<div class="hc-ring calib-ring${ph === 'pinch' ? ' pinch' : ''}">${handSvg(POSES.draw, { size: 90, ink: '#FFFBEF', fill: 'rgba(255,251,239,.08)', accent: '#FFC857' })}</div><h3>${escapeHtml(t(key))}</h3><div class="progress"><i style="width:0%"></i></div><button class="btn calib-skip" data-act="calib-skip">${escapeHtml(t('skip'))}</button>`, 'clear');
      card.querySelector('[data-act=calib-skip]').addEventListener('click', () => { app.sfx?.play('tap'); app.calibPhase = 'skipped'; });
      app.hooks.calibSkip = () => { app.calibPhase = 'skipped'; };
      const t0 = performance.now(), bar = card.querySelector('.progress i');
      await new Promise((res) => { const step = () => { const k = Math.min(1, (performance.now() - t0) / phaseMs); if (bar) bar.style.width = Math.round(k * 100) + '%'; if (k < 1 && app.calibPhase === ph) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      if (app.calibPhase === 'skipped') { // REVIEW-2 Zusatz 23: Überspringen während der Messung
        air.listeners.calib = null; app.settings = saveSettings({ penCalib: { skipped: true, at: app.today() } }); hideCard();
        return null;
      }
    }
    air.listeners.calib = null;
    const res = chooseGesture(frames.index, frames.pinch, { w: air.video?.videoWidth || 640, h: air.video?.videoHeight || 480 });
    app.settings = saveSettings({ pinch: res.choice === 'pinch', penCalib: { choice: res.choice, at: app.today(), index: res.index, pinch: res.pinch } });
    air.pen.pinch = res.choice === 'pinch'; app.lastCalib = res; app.calibPhase = 'done';
    showCard(`<h3>${escapeHtml(t(res.choice === 'pinch' ? 'calibResPinch' : 'calibResIndex'))}</h3>`, 'clear'); app.sfx?.play('articleOk');
    await sleep(1400); hideCard();
    return res;
  };

  /** Angebot → Vorab-Karte → Abfrage → Hand-Check. skipAsk: Frage wurde schon beantwortet (Tagesende-Kachel) */
  app.offerAir = async ({ skipAsk = false, keepInk = false } = {}) => {
    app.settings = saveSettings({ airOffered: true });
    const yes = skipAsk ? 'yes' : await choice(`<h3>${escapeHtml(t('airOfferT'))}</h3><p>${escapeHtml(t('airOfferB'))}</p>`, [['yes', t('airYes'), 'primary'], ['no', t('airNo'), 'ghost']]);
    if (yes !== 'yes') { app.settings = saveSettings({ airDeclined: true }); return false; }
    // Review P2-6: alte Leuchttinte weg, bevor Kamera-Onboarding und Hand-Check darüber liegen
    if (!keepInk) { app.stage.clear(); app.stage.clearGhosts(); } app.round.bubble.hidden = true; // in der Runde (Umschalter) bleibt die Zeichnung
    const go = await choice(`<div class="precam">${handSvg(POSES.draw, { size: 84, accent: '#FFC857' })}<p class="pose">${escapeHtml(t('poseDraw'))}</p>${handSvg(POSES.open, { size: 84 })}<p class="pose">${escapeHtml(t('posePause'))}</p></div><h3>${escapeHtml(t('preCamT'))}</h3><p>${escapeHtml(t('preCamB'))}</p>`,
      [['go', t('preCamGo'), 'primary'], ['no', t('airNo'), 'ghost']], 'precam-card');
    if (go !== 'go') { app.settings = saveSettings({ airDeclined: true }); return false; }
    app.settings = saveSettings({ airOnboarded: true });
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
      else { btn.classList.add('wobble', 'wrong'); right.classList.add('flash'); try { navigator.vibrate?.([30, 40, 30]); } catch {} app.sfx?.play('articleNo'); card.querySelector('.hint').textContent = t('articleShow', { w: `${w.de.art} ${w.de.noun}` }); }
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
    app.round.bubble.hidden = true; // Review P3-3: Sprechblase der Vorrunde („Zeit ist um.") nicht unter die nächste Karte mitnehmen
    let articleOk = null;
    if (learn === 'de' && !plural && slot.article !== false) { // Launch-Tage #1/#2 ohne Artikel-Schritt (P2-7)
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
    const order = app.round.langOrder();
    // Iteration 2: Treffer-Stimme („Buldum! Kedi! … die Katze · cat") schon beim Erkennen — man malt beim Zuhören fertig
    if (plural) out = await app.pluralRound(w, plural);
    else out = await app.round.draw({ id: w.id, color: strokeColor(w, learn), onRecognized: () => app.voice?.hitAnnounce(w.id, order) });
    out.kind = slot.kind; out.n = plural; out.articleOk = articleOk;
    if (articleOk) out.points += 20;
    if (plural && out.result !== 'hit') app.voice?.announce(w.id, order, { delay: 400, plural });
    else if (!plural && out.result !== 'hit') app.voice?.missAnnounce(w.id, order);
    await sleep(out.result === 'hit' ? 200 : 1000); // Zerbrösel-Animation wirken lassen (Treffer: das Fertigmalen war die Pause)
    if (out.result === 'hit' && !plural) {
      const real = await app.realStep(w);
      out.real = !!real; if (real) out.points *= 2;
    }
    app.lastResult = out;
    if (out.result === 'hit') { // Iteration 2 (R2-P2-2): Mehrzahl-Teilerfolg ist kein „+1 Bildwörterbuch"
      const strokes = out.drawings?.length ? out.drawings[0] : out.strokes;
      const ft = pickFunniest([out]); // nur ein Tipp, der wirklich in der Blase stand (R2-P3-2)
      app.dict.put(w.id, { strokes, date: app.today(), articleOk, funny: ft ? ft.id : null }).then(() => app.onDictChange?.());
    }
    const extraHtml = plural && out.tip ? `<p class="tipcard">${escapeHtml(out.tip)}</p>` : '';
    await app.round.resultCard(out, { plural, extraHtml, partial: !!(plural && out.partial) });
    return out; // Review P3-1: kein Luft-Angebot mehr direkt nach Treffer 1 — das Tagesende bietet es an
  };

  /** Tagesende am Laptop: „Jetzt in die Luft?" (nur einmal, nicht am Handy/In-App/Demo) */
  app.shouldOfferAir = () => isDesktop() && !app.settings.airOffered && !app.settings.air && app.mode === 'screen' && !app.DEMO && !inAppBrowser();
  app.airFromDayEnd = async () => {
    app.show('round'); app.renderToggle(); app.ui.slots(0, 0, []);
    $('#word').textContent = t('airToggle'); $('#word-sub').textContent = '';
    app.stage.clear(); app.stage.enabled = false;
    const ok = await app.offerAir({ skipAsk: true });
    if (!ok || app.mode !== 'air') { app.show('dayend'); return false; }
    const { playDaily } = await import('./daily.js');
    playDaily(app, { practice: true }); // gleich ausprobieren: Übungsrunde in der Luft
    return true;
  };
}
