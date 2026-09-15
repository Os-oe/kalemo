// Runden-Controller: verbindet Bühne, Klassifikator, RoundEngine, Stimme/SFX und Overlay.
import { RoundEngine } from '../core/engine.js';
import { t, word, cap, strokeColor, LANGS, pluralPhrase } from '../core/i18n.js';
import { drawStrokes } from './ink.js';

const CLASSIFY_MS = 450;
const $ = (s, r = document) => r.querySelector(s);

export class RoundController {
  constructor(app) {
    this.app = app;
    this.el = $('#screen-round');
    this.bubble = $('#bubble');
    this.overlay = $('#round-overlay');
    this.active = null;
    this.raf = null;
    this._loop = this._loop.bind(this);
  }
  get stage() { return this.app.stage; }

  /** Wortanzeige oben (Lernsprache). */
  showWord(w, { article = true, plural = null } = {}) {
    const { learn } = this.app.settings;
    const el = $('#word'); const sub = $('#word-sub');
    if (plural) el.textContent = pluralPhrase(w, learn, plural);
    else if (learn === 'de' && !article) el.textContent = w.de.noun;
    else el.textContent = word(w, learn);
    el.style.color = '';
    sub.textContent = '';
  }

  /**
   * Eine Mal-Runde. Löst auf mit {id, result, hitAt, points, strokes, tips, bestWrong, ms}
   * opts: { id, durationMs, color, n (Mehrzahl-Zeichnung i/n), silentIntro, onHitCard (false = kein Overlay), label }
   */
  draw(opts) {
    const app = this.app, w = app.byId.get(opts.id);
    const minInk = Math.min(this.stage.w, this.stage.h) * 0.18;
    const engine = new RoundEngine({ target: w.id, durationMs: opts.durationMs ?? 20000, minInk });
    this.stage.clear();
    this.stage.setColor(opts.color || strokeColor(w, app.settings.learn));
    this.stage.enabled = true;
    this.stage.pointerOn = app.mode === 'screen';
    this.bubble.hidden = true;
    return new Promise((resolve) => {
      const r = this.active = {
        w, engine, opts, resolve, lastVersion: -1, lastClassify: 0, busy: false, confirmAt: null, frozenUntil: 0,
        t0: performance.now(), endAt: null, deadline: opts.deadline || null,
      };
      engine.start(r.t0);
      this.stage.cb.onStrokeEnd = () => this._classify(true);
      this.stage.cb.onStrokeStart = () => app.sfx?.play('penDown');
      if (!this.raf) this.raf = requestAnimationFrame(this._loop);
    });
  }

  async _classify(force = false) {
    const r = this.active; if (!r || r.engine.done || r.busy) return;
    const clf = this.app.clf; if (!clf) return;
    const now = performance.now();
    if (!force && (this.stage.version === r.lastVersion || now - r.lastClassify < CLASSIFY_MS)) return;
    const strokes = this.stage.allStrokes(); if (!strokes.length) return;
    r.busy = true; r.lastVersion = this.stage.version; r.lastClassify = now;
    try {
      const res = await clf.classify(strokes);
      if (!res || this.active !== r || r.engine.done) return;
      const tNow = performance.now();
      this._handle(r, r.engine.onPrediction(tNow, res.top, this.stage.inkLength()));
    } finally { r.busy = false; }
  }

  _handle(r, events) {
    const app = this.app, learn = app.settings.learn;
    for (const e of events) {
      if (e.type === 'confirm') r.confirmAt = e.at;
      else if (e.type === 'guess') {
        const g = app.byId.get(e.id);
        this.showBubble(t('guessHmm', { w: word(g, learn) }, learn), g);
        this.stage.pulse();
        app.sfx?.play('guessPop');
        app.voice?.guess(e.id, learn).then((dur) => { if (dur && this.active === r) r.engine.speechStarted(performance.now() - 10, dur * 1000); });
      } else if (e.type === 'hard') {
        this.showBubble(t('guessHard', {}, learn));
        app.voice?.prefix('hard', learn);
      } else if (e.type === 'hit') this._end(r, 'hit');
      else if (e.type === 'timeout') this._end(r, 'timeout');
    }
  }

  showBubble(text, g = null) {
    const b = this.bubble; b.hidden = false; b.textContent = text;
    b.style.color = '';
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }

  _loop(now) {
    this.raf = requestAnimationFrame(this._loop);
    const r = this.active;
    if (r && !r.engine.done) {
      if (r.confirmAt && now >= r.confirmAt) { r.confirmAt = null; this._classify(true); }
      else this._classify(false);
      this._handle(r, r.engine.tick(now));
      const left = Math.max(0, r.engine.duration - r.engine.elapsed(now));
      this.app.ui?.timer(left, r.engine.duration);
      if (left < 5000 && left > 0 && Math.floor(left / 1000) !== r.lastTickS) { r.lastTickS = Math.floor(left / 1000); this.app.sfx?.play('tick'); }
    }
    if (!r || now >= (r.frozenUntil || 0)) this.stage.render(now);
    this.app.onFrame?.(now);
  }

  _end(r, result) {
    const app = this.app, learn = app.settings.learn;
    this.stage.enabled = false;
    if (this.stage.active) this.stage.endStroke();
    app.voice?.stop();
    const snap = r.engine.snapshot();
    const out = {
      id: r.w.id, result, hitAt: snap.hitAt, points: r.engine.points(), strokes: this.stage.allStrokes(),
      tips: snap.tips, bestWrong: snap.bestWrong, lastTop: snap.lastTop, predictions: snap.predictions,
      stage: { w: this.stage.w, h: this.stage.h },
    };
    if (result === 'hit') {
      r.frozenUntil = performance.now() + 100; // Freeze 80–120 ms
      this.showBubble(t('guessHit', { w: cap(word(r.w, learn), learn) }, learn));
      app.sfx?.play('hit');
      app.vibrate?.(40);
    } else {
      this.showBubble(t('timeUp', {}, learn));
      app.sfx?.play('timeup');
    }
    this.active = null;
    r.resolve(out);
  }

  /** Wörter in 3 Sprachen: Lernsprache zuerst, dann Muttersprache, dann dritte */
  langOrder() { const { learn, native } = this.app.settings; return [learn, native, LANGS.find((l) => l !== learn && l !== native)]; }

  /** Ergebnis-Karte (Treffer oder Zeit um). Löst bei „Weiter" auf. */
  resultCard(out, { plural = null, extraHtml = '' } = {}) {
    const app = this.app, w = app.byId.get(out.id), ui = app.settings.native;
    const hit = out.result === 'hit';
    const langs = this.langOrder().map((l) => `<div><small>${l.toUpperCase()}</small>${escapeHtml(plural ? pluralPhrase(w, l, plural) : word(w, l))}</div>`).join('');
    this.overlay.innerHTML = `<div class="card ${hit ? 'hit' : 'miss'}" role="dialog" aria-live="polite">
      <h3>${escapeHtml(hit ? t('hitTitle', {}, ui) : t('missTitle', {}, ui))}</h3>
      ${hit ? '<canvas class="alive" width="280" height="200"></canvas>' : '<div class="others"></div>'}
      <div class="langs">${langs}</div>${extraHtml}
      <button class="btn primary big" data-act="next">${escapeHtml(t('next', {}, ui))}</button></div>`;
    this.overlay.hidden = false;
    if (!hit) this._fillOthers(w, this.overlay.querySelector('.others'));
    return new Promise((res) => {
      const btn = this.overlay.querySelector('[data-act=next]');
      btn.addEventListener('click', () => { this.overlay.hidden = true; this.overlay.innerHTML = ''; app.sfx?.play('tap'); res(); }, { once: true });
      setTimeout(() => btn.focus({ preventScroll: true }), 50);
    });
  }

  async _fillOthers(w, box) {
    const others = await this.app.others();
    const list = (others[w.id] || []).slice(0, 3);
    box.innerHTML = list.map(() => '<canvas width="160" height="160"></canvas>').join('');
    [...box.querySelectorAll('canvas')].forEach((c, i) => {
      const ctx = c.getContext('2d');
      drawStrokes(ctx, list[i].strokes, { style: 'pencil', color: '#1E2A3A', width: 3.2, box: { x: 0, y: 0, w: 160, h: 160 }, seed: i + 3 });
    });
  }

  /** Test-Hook: Striche (0..255) mit Timing einspeisen */
  async feed(strokes, { timing = 'real', ptMs = 16, gapMs = 220, mapped = false } = {}) {
    const st = this.stage;
    const pts = mapped ? strokes : st.mapFixture(strokes);
    if (timing === 'instant') {
      for (const [xs, ys] of pts) { st.beginStroke(xs[0], ys[0]); for (let i = 1; i < xs.length; i++) st.addPoint(xs[i], ys[i], performance.now() + i); st.endStroke(); }
      return;
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const [xs, ys] of pts) {
      if (!st.enabled) return;
      st.beginStroke(xs[0], ys[0]);
      for (let i = 1; i < xs.length; i++) {
        // Zwischenpunkte wie echte Pointer-Events
        const steps = Math.max(1, Math.round(Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) / 9));
        for (let k = 1; k <= steps; k++) { if (!st.enabled) return; st.addPoint(xs[i - 1] + (xs[i] - xs[i - 1]) * k / steps, ys[i - 1] + (ys[i] - ys[i - 1]) * k / steps); await sleep(ptMs); }
      }
      st.endStroke();
      await sleep(gapMs);
    }
  }
}

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
