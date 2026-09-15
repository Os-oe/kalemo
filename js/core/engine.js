// Runden-Logik ohne DOM/Audio: Treffer-Erkennung + KI-rät-live-Timing-Regeln. Pure + deterministisch testbar.
// Zeit t in ms (Rundenuhr). Rückgabe: Liste von Ereignissen, die der Controller in Ton/Bild übersetzt.

export const RULES = {
  silentMs: 2000,        // erste ~2 s schweigen
  minProb: 0.25,         // Tipp nur ab Wahrscheinlichkeit > 0,25
  gapMs: 1500,           // letzte Äußerung ≥ 1,5 s her (ab Beginn) und keine laufende
  maxTips: 5,            // max. 5 Tipps pro Runde
  confirmMs: 300,        // Zielwort ≥ 300 ms stabil in Top-3
  hardMs: 5000,          // letzte 5 s „Hmm, schwierig …"
  topK: 3,
};

export class RoundEngine {
  /**
   * @param {object} o
   * @param {string} o.target  Wort-ID
   * @param {number} [o.durationMs=20000]
   * @param {number} [o.minInk]  Mindest-Strichlänge (gleiche Einheit wie ink in onPrediction)
   */
  constructor({ target, durationMs = 20000, minInk = 0, rules = {}, floor = 0 }) {
    this.target = target; this.duration = durationMs; this.minInk = minInk; this.floor = floor;
    this.r = { ...RULES, ...rules };
    this.reset();
  }
  reset() {
    this.t0 = null; this.done = false; this.result = null; this.hitAt = null;
    this.targetSince = null; this.lastSpokenId = null; this.speechEnd = -Infinity; this.speechStart = -Infinity;
    this.tips = []; this.hardSaid = false; this.bestWrong = null; this.lastTop = null; this.predictions = 0;
  }
  start(t) { this.reset(); this.t0 = t; return [{ type: 'start', t }]; }
  elapsed(t) { return this.t0 == null ? 0 : t - this.t0; }
  /** Controller meldet Ende einer Sprachausgabe (sonst Schätzung aus speak-Ereignis) */
  speechEnded(t) { this.speechEnd = t; }
  /** Controller meldet echte Clip-Dauer (verlängert/verkürzt die Schätzung) */
  speechStarted(t, durMs) { this.speechStart = t; this.speechEnd = t + durMs; }
  speaking(t) { return t < this.speechEnd; }

  /** Neue Klassifikation. top = [{id,p}] absteigend (maskiert), ink = bisherige Strichlänge */
  onPrediction(t, top, ink, { estSpeechMs = 1300 } = {}) {
    if (this.done || this.t0 == null || !top || !top.length) return [];
    const ev = [], e = this.elapsed(t);
    this.predictions++;
    this.lastTop = top.slice(0, 5).map((x) => ({ id: x.id, p: +x.p.toFixed(3) }));
    const inkOk = ink >= this.minInk;
    const inTop = top.slice(0, this.r.topK).some((x) => x.id === this.target && x.p >= this.floor);
    // Treffer: Zielwort in Top-3, ≥ confirmMs stabil (erst ab Mindest-Strichlänge)
    if (inTop && inkOk) {
      if (this.targetSince == null) { this.targetSince = t; ev.push({ type: 'confirm', at: t + this.r.confirmMs }); }
      else if (t - this.targetSince >= this.r.confirmMs) return this.finish(t, 'hit', ev);
    } else this.targetSince = null;
    // lustigster Fehltipp: höchste Konfidenz eines falschen Top-1
    const top1 = top[0];
    if (top1.id !== this.target && (!this.bestWrong || top1.p > this.bestWrong.p) && inkOk) this.bestWrong = { id: top1.id, p: +top1.p.toFixed(3) };
    // Sprechen?
    const canSpeak = e >= this.r.silentMs && inkOk && this.tips.length < this.r.maxTips
      && t - this.speechStart >= this.r.gapMs && !this.speaking(t);
    if (canSpeak && top1.id !== this.target && top1.id !== this.lastSpokenId && top1.p > this.r.minProb && this.targetSince == null) {
      this.lastSpokenId = top1.id;
      this.speechStart = t; this.speechEnd = t + estSpeechMs;
      this.tips.push({ id: top1.id, p: +top1.p.toFixed(3), t: Math.round(e) });
      ev.push({ type: 'guess', id: top1.id, p: top1.p, n: this.tips.length });
    }
    return ev;
  }
  /** Uhr-Tick (z. B. jede Animation-Frame) */
  tick(t) {
    if (this.done || this.t0 == null) return [];
    const e = this.elapsed(t), ev = [];
    if (e >= this.duration) return this.finish(t, 'timeout', ev);
    if (!this.hardSaid && e >= this.duration - this.r.hardMs && e < this.duration - 1200 && !this.speaking(t) && t - this.speechEnd >= 600) {
      this.hardSaid = true; this.speechStart = t; this.speechEnd = t + 1400; ev.push({ type: 'hard' });
    }
    return ev;
  }
  finish(t, result, ev = []) {
    this.done = true; this.result = result; this.hitAt = result === 'hit' ? this.elapsed(t) : null;
    ev.push({ type: result, t: this.elapsed(t), interrupt: true });
    return ev;
  }
  /** Punkte: Treffer 60 + Tempo-Bonus bis 40 (linear über Dauer) */
  points() {
    if (this.result !== 'hit') return 0;
    return 60 + Math.round(40 * Math.max(0, 1 - this.hitAt / this.duration));
  }
  snapshot() {
    return { target: this.target, result: this.result, hitAt: this.hitAt, tips: this.tips.slice(), hardSaid: this.hardSaid,
      bestWrong: this.bestWrong, lastTop: this.lastTop, predictions: this.predictions };
  }
}
