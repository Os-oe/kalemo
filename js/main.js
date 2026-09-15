// Kalemo — Einstieg. Statische Seite, ES-Module, kein Framework, keine externen Requests.
import { settings, saveSettings, streak, dayResult } from './core/store.js';
export { saveSettings };
import { setUiLang, t, LANGS, LANG_CODE } from './core/i18n.js';
import { planFor, berlinDate, addDays } from './core/plan.js';
import { createClassifier } from './core/classifier.js';
import { Stage } from './game/stage.js';
import { RoundController, escapeHtml } from './game/round.js';
import { playDaily } from './game/daily.js';
import { drawStrokes } from './game/ink.js';
import { installFlow, isDesktop, inAppBrowser } from './game/flow.js';
import { installPlural } from './game/plural.js';
import { installDayEnd } from './game/dayend.js';
import { installDuel } from './game/duel.js';
import { installDict } from './game/dict.js';
import { yesterdayCard } from './game/cards.js';
import { shareImage } from './game/share.js';
import { mount } from './game/alive.js';
import { installAudio } from './game/audio.js';
import { installAttract } from './game/attract.js';

/** Beim Rundenstart: Luft-Modus wieder aufnehmen, wenn früher erlaubt (Desktop, nicht abgelehnt) */
async function startRoundMode() {
  app.show('round');
  if (app.settings.air && !app.settings.airDenied && !inAppBrowser() && app.mode !== 'air') await app.enterAir({ handCheck: false });
  app.renderToggle();
}

const Q = new URLSearchParams(location.search);
const $ = (s, r = document) => r.querySelector(s);

export const app = window.__kalemo = {
  TEST: Q.get('test') === '1', DEMO: Q.get('demo') === '1',
  settings: settings(), words: [], byId: new Map(), clf: null, mode: 'screen', screen: 'start',
  dateOverride: null, log: [],
  today() { return this.dateOverride || berlinDate(); },
  async others() { return (this._others ||= fetch('data/others.json').then((r) => r.json())); },
};

// ---------- UI-Helfer ----------
app.ui = {
  timer(leftMs, total) {
    const bar = $('#timer .bar'); if (!bar) return;
    bar.style.strokeDashoffset = String(119.4 * (1 - leftMs / total));
    bar.style.stroke = leftMs < 5000 ? '#FF8A7A' : '';
    const s = Math.ceil(leftMs / 1000); const el = $('#timer-s'); if (el.textContent !== String(s)) el.textContent = s;
  },
  slots(n, current, results) {
    $('#slots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < results.length ? (results[i].result === 'hit' ? 'hit' : 'miss') : i === current ? 'on' : ''}"></i>`).join('');
  },
  toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(this._tt); this._tt = setTimeout(() => (el.hidden = true), ms); },
};

app.show = function (name) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== 'screen-' + name;
  document.body.dataset.screen = name; app.screen = name;
  if (name === 'round' && app.stage) { app.stage.resize(); app.round.ensureLoop(); app.music?.stop(); } // sofort messen, nicht erst im ResizeObserver (sonst 1×1-Bühne)
  else { if (app.round) app.round.stopLoop(); if (name !== 'duel') app.music?.play(); }
  app.attract?.[name === 'start' ? 'start' : 'stop']();
  app.onScreen?.(name);
};

app.applyTexts = applyTexts;
function applyTexts() {
  setUiLang(app.settings.native);
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  renderStart();
}

// ---------- Start ----------
function renderStart() {
  const s = app.settings, iso = app.today();
  const mk = (box, key, other) => {
    box.innerHTML = LANGS.map((l) => `<button role="radio" aria-checked="${s[key] === l}" data-l="${l}" aria-label="${t('langName.' + l)}">${LANG_CODE[l]}</button>`).join('');
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const l = b.dataset.l; const patch = { [key]: l, chosenPair: true };
      if (s[other] === l) patch[other] = s[key]; // tauschen statt gleiche Sprache
      app.settings = saveSettings(patch); app.sfx?.play('tap'); applyTexts();
    };
  };
  mk($('#pair-native'), 'native', 'learn'); mk($('#pair-learn'), 'learn', 'native');
  const plan = planFor(iso, app.words.length ? app.words : [{ id: 'x', acc: 1 }]);
  const done = !!dayResult(iso);
  $('#daily-label').textContent = done ? t('practice') : t('daily', { n: plan.number });
  const st = streak(iso, addDays(iso, -1));
  const badge = $('#streak-badge'); badge.hidden = st < 1; badge.textContent = t('streak', { n: st });
  // „Gestern gemalt"-Kachel, sobald eine Gestern-Karte existiert
  const y = dayResult(addDays(iso, -1)); const tile = $('#btn-yesterday');
  tile.hidden = !y;
  if (y) { const c = tile.querySelector('canvas'); const r = y.results.find((x) => x.strokes?.length); if (r) mount(c, { strokes: r.strokes, color: '#1E2A3A', style: 'pencil', width: 2, still: true }); app.yesterday = y; }
}

app.hooks = {};

app.goHome = () => {
  app.dailyRun = null; app.round.active = null; app.hideCard?.(); app.stage.enabled = false; document.body.classList.remove('replay', 'options');
  if (app.air) app.air.stop(); app.setMode?.('screen');
  const sheet = $('#sheet'); sheet.hidden = true; sheet.innerHTML = '';
  app.show('start'); renderStart();
};

/** Einstellungen (Ton, Musik, Zwicken, Luft-Modus am Handy) */
function openSettings() {
  const s = app.settings; const sheet = $('#sheet');
  const row = (k, label, on) => `<label class="toggle"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`;
  sheet.innerHTML = `<div class="sheet-card" role="dialog"><h3>${escapeHtml(t('settings'))}</h3>
    ${row('sound', t('unmute'), !s.muted)}${row('music', t('music'), s.music)}${row('pinch', t('pinch'), s.pinch)}${row('air', t('airToggle'), s.air)}
    <button class="btn primary" data-act="close">${escapeHtml(t('close'))}</button></div>`;
  sheet.hidden = false;
  sheet.onclick = (e) => { if (e.target === sheet || e.target.closest('[data-act=close]')) { sheet.hidden = true; sheet.innerHTML = ''; } };
  sheet.onchange = (e) => {
    const k = e.target.dataset.k, v = e.target.checked;
    if (k === 'sound') app.settings = saveSettings({ muted: !v });
    else if (k === 'air') app.settings = saveSettings({ air: v, airDenied: false, airOffered: true });
    else app.settings = saveSettings({ [k]: v });
    if (app.air) app.air.pen.pinch = app.settings.pinch;
    app.audio?.applySettings?.();
  };
}

// ---------- Boot ----------
window.addEventListener('keydown', (e) => { if (e.key === 'Tab') document.body.classList.add('kbd'); });
window.addEventListener('pointerdown', () => document.body.classList.remove('kbd'));
window.addEventListener('unhandledrejection', (e) => app.log.push('reject ' + (e.reason?.stack || e.reason || '').toString().slice(0, 300)));
window.addEventListener('error', (e) => app.log.push('error ' + (e.message || '').slice(0, 200)));
async function boot() {
  const words = await fetch('data/words.json').then((r) => r.json());
  app.words = words; app.byId = new Map(words.map((w) => [w.id, w]));
  app.stage = new Stage($('#stage'));
  app.round = new RoundController(app);
  installAudio(app); installAttract(app); app.attract.start();
  app.voice.preloadWords(planFor(app.today(), words).slots.map((s) => s.id), ['de', 'en', 'tr']); // Audio der 5 Tageswörter
  installFlow(app); installPlural(app); installDayEnd(app); installDuel(app); installDict(app);
  window.addEventListener('pointerdown', () => { if (app.screen !== 'round') setTimeout(() => app.music?.play(), 50); }, { once: true });
  app.setMode('screen');
  applyTexts();
  if (inAppBrowser()) $('#inapp').hidden = false;
  app.clfPromise = createClassifier({ words, backend: Q.get('backend') || undefined }).then((c) => (app.clf = c)).catch((e) => { app.log.push('clf ' + e.message); throw e; });
  $('#btn-daily').addEventListener('click', async () => { app.sfx?.play('tap'); await startRoundMode(); await app.clfPromise; playDaily(app, { practice: !!dayResult(app.today()) }); });
  $('#round-close').addEventListener('click', () => app.goHome());
  app.onLowFps = () => {
    app.choice(`<h3>${escapeHtml(t('moreLight'))}</h3>`, [['screen', t('toScreen'), 'primary'], ['stay', t('next'), 'ghost']]).then((k) => { if (k === 'screen') app.leaveAir(); });
  };
  $('#btn-dayend-home').addEventListener('click', () => app.goHome());
  $('#btn-duel').addEventListener('click', () => { app.sfx?.play('tap'); app.duel.create(); });
  $('#btn-dict').addEventListener('click', () => { app.sfx?.play('tap'); app.openDict(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-yesterday').addEventListener('click', async () => {
    const y = app.yesterday; if (!y) return; await app.clfPromise;
    const card = await yesterdayCard(app, y); app.lastCard = { kind: 'yesterday', text: card.text, bytes: card.blob.size };
    await shareImage(app, { blob: card.blob, filename: `kalemo-${y.number}-gestern.png`, text: card.text, forceFallback: !!app.TEST });
  });
  const hash = location.hash.match(/^#d=([A-Za-z0-9_-]+)/);
  if (hash) app.duel.receive(hash[1]);
  if (app.TEST) {
    const th = await import('./testhooks.js'); th.install(app);
    if (Q.get('scene')) { app.t = t; await th.scene(app, Q.get('scene')); }
  }
  app.ready = true;
  document.body.classList.add('ready');
}
boot();
