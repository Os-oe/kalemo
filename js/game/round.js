// Runden-Controller: verbindet Bühne, Klassifikator, RoundEngine, Stimme/SFX und Overlay.
import { RoundEngine } from '../core/engine.js';
import { HIT_FLOOR } from '../core/classifier.js';
import { t, word, cap, strokeColor, LANGS, pluralPhrase, ART_TEXT, FRINGE, NUM } from '../core/i18n.js';
import { drawStrokes } from './ink.js';
import { mount as mountAlive, confetti, unmountAll } from './alive.js';

const CLASSIFY_MS = 450;
/** Iteration 2 (R2-P2-1): nach dem Erkennen fertig malen — Karte erst nach Stift-Pause, spätestens nach dem Deckel */
export const FINISH = { pauseMs: 1200, capMs: 4000 };
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
  ensureLoop() { if (!this.raf) this.raf = requestAnimationFrame(this._loop); }
  stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }

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
   * Eine Mal-Runde. Löst auf mit {id, result, hitAt, drawMs, points, strokes, tips, bestWrong, ms}
   * opts: { id, durationMs, color, plural {i,n}, totalMs, finish (false = Karte sofort), onRecognized(r) }
   * Treffer (Iteration 2): Uhr stoppt beim Erkennen (Wertung = Erkennungszeitpunkt), die Runde nimmt aber weiter Striche an,
   * bis der Stift 1,2 s ruht, 4 s vergangen sind oder „Fertig" getippt wird — die gespeicherte Zeichnung ist vollständig.
   */
  draw(opts) {
    const app = this.app, w = app.byId.get(opts.id);
    this.drawCount = (this.drawCount || 0) + 1;
    this.stage.resize();
    const minInk = Math.min(this.stage.w, this.stage.h) * 0.18;
    const engine = new RoundEngine({ target: w.id, durationMs: opts.durationMs ?? 20000, minInk, floor: HIT_FLOOR[w.id] || 0 });
    if (opts.keep) this.stage.version++; else this.stage.clear(); // Mehrzahl: ein mitgenommener Strich zählt schon zum nächsten Objekt
    this.stage.setColor(opts.color || strokeColor(w, app.settings.learn));
    this.stage.enabled = true;
    this.stage.pointerOn = app.mode === 'screen';
    if (!opts.plural || opts.plural.i === 1) this.bubble.hidden = true; // Mehrzahl: „Eins!" bleibt stehen, bis die KI wieder rät
    return new Promise((resolve) => {
      const r = this.active = {
        w, engine, opts, resolve, lastVersion: -1, lastClassify: 0, busy: false, confirmAt: null, frozenUntil: 0,
        t0: performance.now(), endAt: null, deadline: opts.deadline || null, firstStrokeAt: this.stage.active ? 0 : null, finishing: false,
      };
      engine.start(r.t0);
      this.stage.cb.onStrokeEnd = () => { app.sfx?.scribbleStop(); if (r.finishing) this._armFinish(r); else this._classify(true); };
      this.stage.cb.onStrokeStart = (x, y) => {
        app.sfx?.play('penDown');
        if (r.firstStrokeAt == null && !engine.done) r.firstStrokeAt = engine.elapsed(performance.now()); // Malzeit ab erstem Strich (Duell)
        if (r.finishing) { clearTimeout(r.finishT); r.finishT = null; if (r.opts.carryOutside && this._outside(r, x, y)) this._complete(r, 'hit', { carry: true }); }
      };
      this.stage.cb.onPoint = (x, y, t, v) => app.sfx?.scribble(v);
      if (!this.raf) this.raf = requestAnimationFrame(this._loop);
    });
  }

  async _classify(force = false) {
    const r = this.active; if (!r || r.engine.done || r.engine.paused) return;
    if (r.busy) { if (force) r.pending = true; return; } // erzwungene Klassifikation nie verlieren
    const clf = this.app.clf; if (!clf) return;
    const now = performance.now();
    if (!force && (this.stage.version === r.lastVersion || now - r.lastClassify < CLASSIFY_MS)) return;
    const strokes = this.stage.allStrokes(); if (!strokes.length) return;
    r.busy = true; r.pending = false; r.lastVersion = this.stage.version; r.lastClassify = now;
    try {
      const res = await clf.classify(strokes);
      if (!res || this.active !== r || r.engine.done) return;
      const tNow = performance.now();
      this._handle(r, r.engine.onPrediction(tNow, res.top, this.stage.inkLength()));
    } finally {
      r.busy = false;
      if (r.pending && this.active === r && !r.engine.done) { r.pending = false; this._classify(true); }
    }
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
    // DE: getipptes Wort in Artikel-Farbe (Text-Variante, Kontrast ≥ 4,5:1)
    if (g && this.app.settings.learn === 'de') {
      const wd = `${g.de.art} ${g.de.noun}`, i = text.indexOf(wd);
      if (i >= 0) { b.textContent = ''; const span = document.createElement('span'); span.textContent = wd; span.style.color = ART_TEXT[g.de.art]; b.append(text.slice(0, i), span, text.slice(i + wd.length)); }
    }
    // Review P3-16: winzig die Muttersprache des GERATENEN Worts (g ist nie das Zielwort — Tipps sprechen nur Fehl-Rateversuche)
    const { native, learn } = this.app.settings;
    if (g && native !== learn && (!this.active || g.id !== this.active.w.id)) { const s = document.createElement('small'); s.className = 'bubble-sub'; s.lang = native; s.textContent = word(g, native); b.append(s); }
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    if (this.app.TEST) (this.app.bubbleLog ||= []).push({ target: this.active?.w.id || null, guess: g?.id || null, text: b.textContent }); // Iteration 2: Zitat-Quelle prüfbar
  }

  _loop(now) {
    this.raf = requestAnimationFrame(this._loop);
    const r = this.active;
    if (r && !r.engine.done && !r.engine.paused) {
      if (r.confirmAt && now >= r.confirmAt && !r.busy) { r.confirmAt = null; this._classify(true); }
      else if (r.engine.targetSince != null && !r.busy && now - r.lastClassify >= 320) this._classify(true); // Bestätigung auch ohne neue Striche
      else this._classify(false);
      this._handle(r, r.engine.tick(now));
      const left = Math.max(0, r.engine.duration - r.engine.elapsed(now));
      this.app.ui?.timer(left, r.opts.totalMs || r.engine.duration);
      // Hilfe nach 8 s: „So malen es andere — jetzt du!" = Hinweis, kein Aufgeben (Runde pausiert, danach Restzeit)
      if (!r.helpShown && r.engine.elapsed(now) > 8000 && !r.opts.totalMs) { r.helpShown = true; const hb = document.getElementById('round-help'); hb.hidden = false; hb.onclick = () => this.help(r); }
      if (left < 5000 && left > 0 && Math.floor(left / 1000) !== r.lastTickS) { r.lastTickS = Math.floor(left / 1000); this.app.sfx?.play('tick'); }
    }
    if (!r || now >= (r.frozenUntil || 0)) this.stage.render(now);
    this.app.onFrame?.(now);
  }

  _end(r, result) {
    if (result !== 'hit') return this._complete(r, result);
    const app = this.app, learn = app.settings.learn, ui = app.settings.native;
    document.getElementById('round-help').hidden = true;
    const ink = this.stage.canvas;
    r.frozenUntil = performance.now() + 100; // Freeze 80–120 ms
    const pl = r.opts.plural; // Mehrzahl (Review P3-4): Zwischenstand zählen, am Ende „Ich weiß! Zwei Frösche!"
    if (pl && pl.i < pl.n) { this.showBubble(`${cap(NUM[learn][pl.i], learn)}!`); app.voice?.count(pl.i, learn); }
    else if (pl) this.showBubble(t('guessHit', { w: cap(pluralPhrase(r.w, learn, pl.n), learn) }, learn));
    else this.showBubble(t('guessHit', { w: cap(word(r.w, learn), learn) }, learn));
    app.sfx?.play('hit');
    try { navigator.vibrate?.(40); } catch {}
    setTimeout(() => { ink.classList.remove('squash'); void ink.offsetWidth; ink.classList.add('squash'); confetti(document.querySelector('#stage canvas.fx'), this.stage.color); }, 100);
    setTimeout(() => app.sfx?.play(r.w.sfx), 520);
    r.opts.onRecognized?.(r);
    if (r.opts.finish === false) return this._complete(r, 'hit');
    // Fertig malen: Hinweis in der Blase (UI-Sprache), „Fertig"-Knopf, Karte nach Stift-Pause bzw. Deckel
    r.finishing = true; r.recognizedAt = performance.now(); r.recognizedStrokes = this.stage.strokes.length + (this.stage.active ? 1 : 0);
    if (!pl || pl.i === pl.n) { const s = document.createElement('small'); s.className = 'bubble-hint'; s.lang = ui; s.textContent = t('finishHint', {}, ui); this.bubble.append(s); }
    const done = document.getElementById('round-done'); done.hidden = false; done.onclick = () => { app.sfx?.play('tap'); this._complete(r, 'hit', { carry: false }); };
    app.hooks.finishNow = () => this._complete(r, 'hit');
    r.capT = setTimeout(() => this._complete(r, 'hit', { carry: !!r.opts.carryOutside }), r.opts.finishCapMs ?? FINISH.capMs);
    if (!this.stage.active) this._armFinish(r);
  }

  _armFinish(r) { clearTimeout(r.finishT); r.finishT = setTimeout(() => this._complete(r, 'hit'), r.opts.finishPauseMs ?? FINISH.pauseMs); }

  /** Mehrzahl: beginnt ein neuer Strich klar außerhalb des erkannten Objekts, ist es schon das nächste */
  _outside(r, x, y) {
    const b = bboxOf(this.stage.strokes); if (!b) return false;
    const m = Math.max(28, Math.max(b.w, b.h) * 0.2);
    return x < b.x - m || x > b.x + b.w + m || y < b.y - m || y > b.y + b.h + m;
  }

  /** Runde abschließen (Treffer nach dem Fertigmalen oder Zeit um). carry: laufenden Strich fürs nächste Mehrzahl-Objekt stehen lassen */
  _complete(r, result, { carry = false } = {}) {
    if (r.completed) return; r.completed = true;
    clearTimeout(r.finishT); clearTimeout(r.capT); r.finishing = false;
    const app = this.app, learn = app.settings.learn;
    document.getElementById('round-done').hidden = true; app.hooks.finishNow = null;
    if (this.active !== r) return; // Runde inzwischen geschlossen
    let strokes;
    if (carry) { strokes = this.stage.detach(); } // Mehrzahl: fertige Striche raus, laufender Strich bleibt für das nächste Objekt
    else {
      this.stage.enabled = false;
      if (this.stage.active) this.stage.endStroke();
      strokes = this.stage.allStrokes();
    }
    if (result !== 'hit') app.voice?.stop();
    const snap = r.engine.snapshot();
    const out = {
      id: r.w.id, result, hitAt: snap.hitAt, points: r.engine.points(), strokes,
      drawMs: result === 'hit' && r.firstStrokeAt != null ? Math.max(0, Math.round(snap.hitAt - r.firstStrokeAt)) : null,
      elapsedMs: Math.round(result === 'hit' ? snap.hitAt : r.engine.duration),
      tips: snap.tips, bestWrong: snap.bestWrong, lastTop: snap.lastTop, predictions: snap.predictions,
      stage: { w: this.stage.w, h: this.stage.h }, recognizedStrokes: r.recognizedStrokes ?? null, carried: !!carry,
    };
    app.sfx?.scribbleStop();
    document.getElementById('round-help').hidden = true;
    if (result !== 'hit') {
      this.showBubble(t('timeUp', {}, learn));
      this.stage.crumble();
      app.sfx?.play('crumble'); app.sfx?.play('timeup');
    }
    out.helped = !!r.helped;
    this.active = null;
    r.resolve(out);
  }

  /**
   * Hilfe als Hinweis (Review 1 P1-3): Uhr pausiert, Karte „So malen es andere — jetzt du!" mit Beispielen OHNE
   * Übersetzung, danach geht dieselbe Runde mit der Restzeit weiter. Treffer zählt (ohne Tempo-Bonus).
   */
  async help(r) {
    const app = this.app, ui = app.settings.native;
    if (this.active !== r || r.engine.done || r.helpOpen) return;
    r.helpOpen = true; r.helped = true; r.engine.helped = true;
    document.getElementById('round-help').hidden = true;
    r.engine.pause(performance.now());
    if (this.stage.active) this.stage.endStroke();
    this.stage.enabled = false; app.sfx?.play('tap'); app.sfx?.scribbleStop(); app.voice?.stop();
    this.bubble.hidden = true;
    this.overlay.className = 'overlay'; this.overlay.hidden = false;
    this.overlay.innerHTML = `<div class="card help" role="dialog" aria-live="polite"><h3>${escapeHtml(t('helpTitle', {}, ui))}</h3><div class="others"></div>
      <button class="btn primary big" data-act="help-go">${escapeHtml(t('helpGo', {}, ui))}</button></div>`;
    this._fillOthers(r.w, this.overlay.querySelector('.others'), { replay: true });
    await new Promise((res) => {
      const go = this.overlay.querySelector('[data-act=help-go]');
      go.addEventListener('click', () => res(), { once: true });
      app.hooks.helpGo = res;
      setTimeout(() => go.focus({ preventScroll: true }), 50);
    });
    if (this.active !== r || r.engine.done) return; // Runde inzwischen geschlossen
    unmountAll(this.overlay); this.overlay.hidden = true; this.overlay.innerHTML = '';
    app.sfx?.play('tap');
    r.engine.resume(performance.now()); r.helpOpen = false;
    this.stage.enabled = true; this.stage.pointerOn = app.mode === 'screen';
    app.voice?.word(r.w.id, app.settings.learn);
  }

  /** Wörter in 3 Sprachen: Lernsprache zuerst, dann Muttersprache, dann dritte */
  langOrder() { const { learn, native } = this.app.settings; return [learn, native, LANGS.find((l) => l !== learn && l !== native)]; }

  /** Ergebnis-Karte (Treffer oder Zeit um). Löst bei „Weiter" auf. */
  resultCard(out, { plural = null, extraHtml = '', partial = false } = {}) {
    const app = this.app, w = app.byId.get(out.id), ui = app.settings.native;
    // Iteration 2 (R2-P2-2): Mehrzahl-Teilerfolg = eigene Karte „Fast! 2 von 3" mit den erkannten Zeichnungen, ohne „+1 Bildwörterbuch"
    const hit = out.result === 'hit' || partial;
    const title = partial ? t('pluralPartial', { x: out.parts, n: plural }, ui) : hit ? t('hitTitle', {}, ui) : t('missTitle', {}, ui);
    const langs = this.langOrder().map((l, i) => `<button class="lang-line${i === 0 ? ' first' : ''}" data-say="${l}"><small>${l.toUpperCase()}</small><span>${escapeHtml(plural ? pluralPhrase(w, l, plural) : word(w, l))}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6"/></svg></button>`).join('');
    this.overlay.innerHTML = `<div class="card ${hit ? 'hit' : 'miss'}${partial ? ' partial' : ''}" role="dialog" aria-live="polite">
      <h3>${escapeHtml(title)}</h3>
      ${hit ? `<div class="alive-wrap"><canvas class="alive" width="280" height="200"></canvas>${partial ? '' : `<span class="to-dict"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>+1 ${escapeHtml(t('dict', {}, ui))}</span>`}</div>` : '<div class="others"></div>'}
      <div class="langs">${langs}</div>${extraHtml}
      <button class="btn primary big" data-act="next">${escapeHtml(t('next', {}, ui))}</button></div>`;
    this.overlay.hidden = false;
    if (!hit) this._fillOthers(w, this.overlay.querySelector('.others'));
    else {
      const learn = app.settings.learn;
      // Money-Shot (Iteration 1): Leuchtspur „landet" als kräftiger Buntstift mit Farbsaum, groß, Bewegung bleibt im Rahmen
      const key = plural ? 'plural' : w.de.art;
      const col = learn === 'de' ? ART_TEXT[key] : '#1E2A3A';
      const fringe = learn === 'de' ? FRINGE[key] : FRINGE.neutral;
      const strokes = out.drawings?.length ? out.drawings[0] : out.strokes;
      const groups = plural && out.drawings?.length > 1 ? out.drawings : null; // Mehrzahl: alle N Zeichnungen nebeneinander
      mountAlive(this.overlay.querySelector('canvas.alive'), { strokes, groups, color: col, fringe, style: 'crayon', width: groups ? 4.2 : 5.2, padding: 0.12, motion: { kind: w.motion, id: w.id }, delay: 120, seed: 4 });
      setTimeout(() => app.sfx?.play('glitter'), 350);
    }
    this.overlay.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => app.voice?.word(w.id, b.dataset.say)));
    return new Promise((res) => {
      const btn = this.overlay.querySelector('[data-act=next]');
      btn.addEventListener('click', () => { this.overlay.hidden = true; this.overlay.innerHTML = ''; app.sfx?.play('tap'); res(); }, { once: true });
      setTimeout(() => btn.focus({ preventScroll: true }), 50);
    });
  }

  async _fillOthers(w, box, { replay = false } = {}) {
    const others = await this.app.examples();
    const list = (others[w.id] || []).slice(0, 3);
    box.innerHTML = list.map(() => '<canvas width="160" height="160"></canvas>').join('');
    [...box.querySelectorAll('canvas')].forEach((c, i) => {
      if (replay) { mountAlive(c, { strokes: list[i].strokes, color: '#1E2A3A', style: 'pencil', width: 3, replay: 2.2 + i * 0.35, delay: i * 350, boil: 0.5, still: true, seed: i + 3 }); return; }
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
    const abort = (where) => { this.app.log.push(`feed-abort ${where} enabled=${st.enabled} active=${!!this.active}`); };
    for (const [xs, ys] of pts) {
      if (!st.enabled) return abort('stroke');
      st.beginStroke(xs[0], ys[0]);
      for (let i = 1; i < xs.length; i++) {
        // Zwischenpunkte wie echte Pointer-Events
        const steps = Math.max(1, Math.round(Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) / 9));
        for (let k = 1; k <= steps; k++) { if (!st.enabled) return abort('point'); st.addPoint(xs[i - 1] + (xs[i] - xs[i - 1]) * k / steps, ys[i - 1] + (ys[i] - ys[i - 1]) * k / steps); await sleep(ptMs); }
      }
      st.endStroke();
      await sleep(gapMs);
    }
    this.app.log.push('feed-done ' + pts.length);
  }
}

/** Bounding-Box fertiger Striche in Bühnen-Pixeln (null = leer) */
function bboxOf(strokes) {
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  for (const [xs, ys] of strokes) for (let i = 0; i < xs.length; i++) { if (xs[i] < mx) mx = xs[i]; if (xs[i] > Mx) Mx = xs[i]; if (ys[i] < my) my = ys[i]; if (ys[i] > My) My = ys[i]; }
  return isFinite(mx) ? { x: mx, y: my, w: Mx - mx, h: My - my } : null;
}

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
