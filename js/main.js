// Kalemo — Einstieg. Statische Seite, ES-Module, kein Framework, keine externen Requests.
import { settings, saveSettings, streak, dayResult } from './core/store.js';
import { setUiLang, t, LANGS, LANG_CODE } from './core/i18n.js';
import { planFor, berlinDate, addDays } from './core/plan.js';
import { createClassifier } from './core/classifier.js';
import { Stage } from './game/stage.js';
import { RoundController, escapeHtml } from './game/round.js';
import { playDaily } from './game/daily.js';
import { drawStrokes } from './game/ink.js';

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
  app.onScreen?.(name);
};

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
}

// ---------- Slot spielen (Phase 1: Malen + Ergebnis; Artikel/Mehrzahl folgen) ----------
app.playSlot = async function (slot, { index, total }) {
  const w = app.byId.get(slot.id);
  app.round.showWord(w, { plural: slot.kind === 'plural' ? slot.n : null });
  const out = await app.round.draw({ id: slot.id });
  out.kind = slot.kind;
  app.lastResult = out;
  await app.round.resultCard(out, { plural: slot.kind === 'plural' ? slot.n : null });
  return out;
};

// ---------- Tagesende (Phase 1: schlicht) ----------
app.showDayEnd = async function (sum) {
  app.show('dayend');
  $('#dayend-title').textContent = t('dayEndT', { n: sum.number });
  $('#dayend-recog').textContent = t('aiRecognized', { x: sum.hits });
  $('#dayend-points').textContent = sum.points;
  $('#dayend-grid').innerHTML = sum.results.map((r) => `<figure><canvas width="200" height="200"></canvas><figcaption>${escapeHtml(app.byId.get(r.id)?.[app.settings.learn === 'de' ? 'de' : app.settings.learn]?.noun || '')}</figcaption></figure>`).join('');
  [...document.querySelectorAll('#dayend-grid canvas')].forEach((c, i) => {
    drawStrokes(c.getContext('2d'), sum.results[i].strokes, { style: 'pencil', color: '#1E2A3A', width: 4, box: { x: 0, y: 0, w: 200, h: 200 } });
  });
};

// ---------- Boot ----------
async function boot() {
  const words = await fetch('data/words.json').then((r) => r.json());
  app.words = words; app.byId = new Map(words.map((w) => [w.id, w]));
  app.stage = new Stage($('#stage'));
  app.round = new RoundController(app);
  applyTexts();
  app.clfPromise = createClassifier({ words, backend: Q.get('backend') || undefined }).then((c) => (app.clf = c)).catch((e) => { app.log.push('clf ' + e.message); throw e; });
  $('#btn-daily').addEventListener('click', async () => { await app.clfPromise; playDaily(app, { practice: !!dayResult(app.today()) }); });
  $('#round-close').addEventListener('click', () => { app.dailyRun = null; app.round.active = null; app.round.overlay.hidden = true; app.stage.enabled = false; app.show('start'); renderStart(); });
  $('#btn-dayend-home').addEventListener('click', () => { app.show('start'); renderStart(); });
  if (app.TEST) (await import('./testhooks.js')).install(app);
  app.ready = true;
  document.body.classList.add('ready');
}
boot();
