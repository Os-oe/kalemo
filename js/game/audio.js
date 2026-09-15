// Audio: Stimmen-Clips (Gemini TTS, vorproduziert, audio/v1), WebAudio-SFX, Musik-Loop.
// AudioContext erst nach User-Geste. Stimme hat Vorrang: Musik duckt, Treffer unterbricht laufende Äußerung.
import { createSfx } from './sfx.js';

const Q = new URLSearchParams(location.search);

export function installAudio(app) {
  let ctx = null, master = null, voiceBus = null, sfxBus = null, musicBus = null, manifest = {};
  const buffers = new Map(), pending = new Map();
  let playing = []; let seq = 0;

  const ready = () => !!ctx;
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.connect(ctx.destination);
      voiceBus = ctx.createGain(); voiceBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      applySettings();
      app.log.push('audio unlocked');
    } catch (e) { app.log.push('audio ' + e.message); }
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  function applySettings() {
    if (!ctx) return;
    master.gain.setTargetAtTime(app.settings.muted ? 0 : 1, ctx.currentTime, 0.02);
    if (!app.settings.music) music.stop();
  }
  fetch('audio/v1/manifest.json').then((r) => (r.ok ? r.json() : {})).then((m) => (manifest = m || {})).catch(() => {});

  async function load(path) {
    if (buffers.has(path)) return buffers.get(path);
    if (pending.has(path)) return pending.get(path);
    const p = (async () => {
      try {
        const res = await fetch('audio/v1/' + path + '.mp3'); if (!res.ok) throw new Error(res.status);
        const ab = await res.arrayBuffer();
        if (!ctx) { pending.delete(path); return { raw: ab }; }
        const buf = await ctx.decodeAudioData(ab); buffers.set(path, buf); return buf;
      } catch { buffers.set(path, null); return null; } finally { pending.delete(path); }
    })();
    pending.set(path, p);
    return p;
  }
  /** Vorladen (auch vor der Geste: nur Bytes), dekodiert nach unlock */
  const raw = new Map();
  function preload(paths) {
    for (const p of paths) if (!buffers.has(p) && !raw.has(p)) raw.set(p, fetch('audio/v1/' + p + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  }
  async function get(path) {
    if (buffers.has(path)) return buffers.get(path);
    if (!ctx) return null;
    if (raw.has(path)) { const ab = await raw.get(path); raw.delete(path); if (ab) { try { const b = await ctx.decodeAudioData(ab); buffers.set(path, b); return b; } catch {} } }
    return load(path);
  }

  const clsOf = (id) => app.byId.get(id)?.cls || String(id).replace(/ /g, '_');
  const P = {
    word: (id, l) => `${l}/w/${clsOf(id)}`, bare: (id) => `de/b/${clsOf(id)}`, plural: (id, l) => `${l}/p/${clsOf(id)}`,
    num: (n, l) => `${l}/n/${n}`, x: (k, l) => `${l}/x/${k}`, u: (k, l) => `${l}/u/${k}`,
  };
  function stopVoice() { seq++; for (const s of playing) { try { s.stop(); } catch {} } playing = []; duck(false); }
  let duckT = null;
  function duck(on) { if (!ctx) return; clearTimeout(duckT); musicBus.gain.setTargetAtTime(on ? music.level * 0.25 : music.level, ctx.currentTime, 0.12); }

  /** Clips nacheinander (mit Pausen in s). Rückgabe: Gesamtdauer in s (sofort bekannt, wenn geladen) */
  async function sequence(parts, { gap = 0.05, delay = 0 } = {}) {
    if (app.TEST) (app.voiceLog ||= []).push({ t: Math.round(performance.now()), parts: parts.filter((p) => typeof p === 'string') });
    if (!ctx || app.settings.muted) return 0;
    const my = ++seq;
    const bufs = await Promise.all(parts.map((p) => (typeof p === 'number' ? p : get(p))));
    if (my !== seq) return 0;
    let t = ctx.currentTime + 0.02 + delay, total = 0;
    duck(true);
    // Notfall: fehlen Clips komplett, spricht die Browser-Stimme (nur wenn eine passende Stimme existiert)
    if (bufs.every((b) => typeof b === 'number' || !b) && bufs.some((b) => b === null)) { speakFallback(parts.filter((p, i) => typeof p === 'string' && !bufs[i])); return 0; }
    for (const b of bufs) {
      if (typeof b === 'number') { t += b; total += b; continue; }
      if (!b) continue;
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(voiceBus); s.start(t);
      playing.push(s); s.onended = () => { playing = playing.filter((x) => x !== s); if (!playing.length) duckT = setTimeout(() => duck(false), 250); };
      t += b.duration + gap; total += b.duration + gap;
    }
    app.lastVoice = { parts: parts.filter((p) => typeof p === 'string'), at: performance.now() };
    return total;
  }
  const pickHmm = () => `hmm${1 + Math.floor(Math.random() * 3)}`;
  let lines = null; fetch('data/voice-lines.json').then((r) => r.json()).then((j) => (lines = j)).catch(() => {});
  const NUMS = { de: ['', 'eins', 'zwei', 'drei', 'vier', 'fünf'], en: ['', 'one', 'two', 'three', 'four', 'five'], tr: ['', 'bir', 'iki', 'üç', 'dört', 'beş'] };
  function speakFallback(paths) {
    try {
      if (!('speechSynthesis' in window) || app.settings.muted || !paths.length || navigator.webdriver) return; // headless: Sprachausgabe blockiert
      const voices = speechSynthesis.getVoices(); speechSynthesis.cancel();
      const groups = []; for (const p of paths) { const l = p.split('/')[0]; if (groups.length && groups[groups.length - 1].l === l) groups[groups.length - 1].ps.push(p); else groups.push({ l, ps: [p] }); }
      for (const { l: lang, ps } of groups) {
      const v = voices.find((x) => x.lang?.toLowerCase().startsWith(lang)); if (!v) continue;
      const text = ps.map((p) => {
        const [l, kind, key] = p.split('/'); const w = app.words.find((x) => x.cls === key);
        if (kind === 'w' && w) return l === 'de' ? `${w.de.art} ${w.de.noun}` : l === 'en' ? w.en.word : w.tr.word;
        if (kind === 'b' && w) return w.de.noun;
        if (kind === 'p' && w) return l === 'de' ? w.de.pl : w.en.pl;
        if (kind === 'n') return key === 'tane' ? 'tane' : NUMS[l][+key];
        return lines?.[l]?.[kind]?.[key] || '';
      }).join(' ');
      const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = 0.95; speechSynthesis.speak(u);
      }
    } catch {}
  }

  app.voice = {
    word: (id, l) => sequence([P.word(id, l)]),
    bare: (id) => sequence([P.bare(id)]),
    plural: (id, l, n) => sequence(l === 'tr' ? [P.num(n, 'tr'), ...(app.byId.get(id)?.tr?.tane ? ['tr/n/tane'] : []), P.word(id, 'tr')] : [P.num(n, l), P.plural(id, l)], { gap: 0.02 }),
    guess: (id, l) => sequence([P.x(pickHmm(), l), 0.12, P.word(id, l)]),
    prefix: (k, l) => sequence([P.x(k, l)]),
    hit: (id, l) => { stopVoice(); return sequence([P.x(Math.random() < 0.5 ? 'hit1' : 'hit2', l), 0.08, P.word(id, l)]); },
    /** „kedi · die Katze · cat": Lernsprache, Muttersprache, dritte */
    announce: (id, order, { delay = 0, plural = null } = {}) => sequence(order.flatMap((l, i) => [...(i ? [0.35] : []), ...(plural ? (l === 'tr' ? [P.num(plural, 'tr'), ...(app.byId.get(id)?.tr?.tane ? ['tr/n/tane'] : []), P.word(id, 'tr')] : [P.num(plural, l), P.plural(id, l)]) : [P.word(id, l)])]), { delay: delay / 1000 }),
    timeup: (l) => sequence([P.x('timeup', l)]),
    /** Mehrzahl-Zwischenstand: „eins!" / „bir!" (vorhandene Zahl-Clips) */
    count: (i, l) => sequence([P.num(i, l)]),
    /** Mehrzahl geschafft: „Ich weiß! Zwei Frösche!" … „iki kurbağa · two frogs" (Zahl-Clip + Plural-Clip, TR Zahl + Wort) */
    pluralHitAnnounce: (id, order, n) => { stopVoice(); const ph = (l) => (l === 'tr' ? [P.num(n, 'tr'), ...(app.byId.get(id)?.tr?.tane ? ['tr/n/tane'] : []), P.word(id, 'tr')] : [P.num(n, l), P.plural(id, l)]); return sequence([P.x(Math.random() < 0.5 ? 'hit1' : 'hit2', order[0]), 0.08, ...ph(order[0]), 0.55, ...ph(order[1]), 0.35, ...ph(order[2])], { gap: 0.02 }); },
    /** Treffer: „Buldum! Kedi!" … „die Katze · cat" (ein Ablauf, Lernsprache zuerst) */
    hitAnnounce: (id, order) => { stopVoice(); return sequence([P.x(Math.random() < 0.5 ? 'hit1' : 'hit2', order[0]), 0.08, P.word(id, order[0]), 0.55, P.word(id, order[1]), 0.35, P.word(id, order[2])]); },
    /** Zeit um: freundlich + Wort trotzdem in 3 Sprachen */
    missAnnounce: (id, order) => { stopVoice(); return sequence([P.x('timeup', order[0]), 0.45, P.word(id, order[0]), 0.35, P.word(id, order[1]), 0.35, P.word(id, order[2])]); },
    stop: stopVoice,
    preloadWords: (ids, langs) => { const ps = []; for (const id of ids) for (const l of langs) { ps.push(P.word(id, l)); if (l !== 'tr') ps.push(P.plural(id, l)); } for (const id of ids) ps.push(P.bare(id)); for (const l of langs) { ['hmm1', 'hmm2', 'hmm3', 'hit1', 'hit2', 'timeup', 'hard'].forEach((k) => ps.push(P.x(k, l))); [1, 2, 3].forEach((n) => ps.push(P.num(n, l))); } preload(ps); },
    duration: (path) => (manifest[path + '.mp3'] || manifest[path] || 0) / 1000,
  };

  const sfx = createSfx(() => ctx, () => sfxBus);
  app.sfx = { play: (name, ...a) => { if (app.TEST) (app.fxLog ||= []).push({ t: Math.round(performance.now()), name }); if (!ctx || app.settings.muted) return; try { sfx[name]?.(...a); } catch {} }, scribble: (v) => { if (ctx && !app.settings.muted) sfx.scribble(v); }, scribbleStop: () => ctx && sfx.scribbleStop() };

  // Musik: 1 ruhiger Loop, nur Start/Tagesende/Wörterbuch
  const music = app.music = {
    level: 0.32, el: null, node: null,
    play() {
      if (!ctx || !app.settings.music || app.settings.muted || app.screen === 'round' || Q.get('nomusic')) return;
      if (!this.el) {
        this.el = new Audio('audio/v1/music/loop.mp3'); this.el.loop = true; this.el.crossOrigin = 'anonymous';
        this.el.addEventListener('error', () => { this.failed = true; });
        try { this.node = ctx.createMediaElementSource(this.el); this.node.connect(musicBus); } catch { this.failed = true; }
      }
      if (this.failed) return;
      this.el.play().catch(() => {});
      musicBus.gain.setTargetAtTime(this.level, ctx.currentTime, 0.8);
      this.on = true;
    },
    stop() { if (!ctx || !this.el) return; musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.25); const el = this.el; setTimeout(() => { if (!this.on) el.pause(); }, 900); this.on = false; },
  };
  app.audio = { unlock, ready, applySettings, get ctx() { return ctx; } };
}
