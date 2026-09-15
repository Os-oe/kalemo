// WebAudio-Synth-SFX (0 €, 0 ms Latenz). Alle Klänge prozedural.
export function createSfx(getCtx, bus) {
  const now = () => getCtx().currentTime;
  let noiseBuf = null;
  const noise = () => {
    const ctx = getCtx();
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  };
  function tone(freq, { type = 'sine', dur = 0.15, vol = 0.2, attack = 0.005, slide = 0, delay = 0, detune = 0 } = {}) {
    const ctx = getCtx(); const t = now() + delay;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur); o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus()); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss({ dur = 0.2, vol = 0.1, freq = 3000, q = 1, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    const ctx = getCtx(); const t = now() + delay; const s = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur); f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus()); s.start(t); s.stop(t + dur + 0.05);
  }
  const arp = (notes, step, opts) => notes.forEach((n, i) => tone(n, { ...opts, delay: (opts?.delay || 0) + i * step }));

  const S = {
    penDown: () => { tone(1800, { type: 'triangle', dur: 0.04, vol: 0.12 }); hiss({ dur: 0.03, vol: 0.05, freq: 5000 }); },
    tap: () => tone(660, { type: 'triangle', dur: 0.06, vol: 0.12, slide: 1.3 }),
    guessPop: () => { tone(520, { type: 'sine', dur: 0.12, vol: 0.18, slide: 1.9 }); hiss({ dur: 0.05, vol: 0.04, freq: 2500 }); },
    hit: () => { arp([784, 988, 1175, 1568], 0.065, { type: 'triangle', dur: 0.45, vol: 0.16 }); arp([1568, 1976], 0.09, { type: 'sine', dur: 0.6, vol: 0.06, delay: 0.25 }); },
    glitter: () => arp([2093, 2637, 3136], 0.04, { type: 'sine', dur: 0.2, vol: 0.03 }),
    timeup: () => { tone(440, { type: 'sine', dur: 0.7, vol: 0.12, slide: 0.5 }); tone(330, { type: 'triangle', dur: 0.8, vol: 0.06, slide: 0.5, delay: 0.12 }); },
    crumble: () => { for (let i = 0; i < 7; i++) hiss({ dur: 0.08, vol: 0.05, freq: 800 + Math.random() * 2500, q: 3, delay: i * 0.05 }); },
    tick: () => tone(1200, { type: 'square', dur: 0.03, vol: 0.05 }),
    articleOk: () => arp([880, 1320], 0.07, { type: 'triangle', dur: 0.3, vol: 0.15 }),
    articleNo: () => { tone(300, { type: 'sine', dur: 0.18, vol: 0.12, slide: 0.85 }); tone(260, { type: 'sine', dur: 0.2, vol: 0.1, delay: 0.14, slide: 0.85 }); },
    fanfare: () => { arp([523, 659, 784, 1047], 0.09, { type: 'sawtooth', dur: 0.35, vol: 0.06 }); arp([523, 659, 784, 1047], 0.09, { type: 'triangle', dur: 0.5, vol: 0.12 }); tone(1047, { type: 'triangle', dur: 0.9, vol: 0.12, delay: 0.4 }); },
    streak: () => { hiss({ dur: 0.5, vol: 0.06, freq: 600, sweep: 4, type: 'lowpass' }); arp([659, 880], 0.1, { type: 'triangle', dur: 0.35, vol: 0.1, delay: 0.15 }); },
    whoosh: () => hiss({ dur: 0.35, vol: 0.12, freq: 400, sweep: 8, q: 0.7 }),
    // Kategorie-Klänge („wird lebendig")
    animal: () => { tone(220, { type: 'sine', dur: 0.25, vol: 0.2, slide: 2.4 }); tone(330, { type: 'sine', dur: 0.2, vol: 0.12, slide: 1.8, delay: 0.18 }); },
    vehicle: () => { tone(70, { type: 'sawtooth', dur: 0.6, vol: 0.07, slide: 1.6 }); hiss({ dur: 0.5, vol: 0.04, freq: 300, type: 'lowpass' }); },
    flyer: () => hiss({ dur: 0.7, vol: 0.12, freq: 500, sweep: 6, q: 1.2 }),
    food: () => { hiss({ dur: 0.07, vol: 0.12, freq: 1200, q: 2 }); hiss({ dur: 0.07, vol: 0.12, freq: 1000, q: 2, delay: 0.16 }); tone(180, { type: 'sine', dur: 0.1, vol: 0.1, delay: 0.3 }); },
    weather: () => hiss({ dur: 0.9, vol: 0.07, freq: 900, sweep: 0.4, q: 0.5, type: 'lowpass' }),
    plant: () => tone(300, { type: 'sine', dur: 0.6, vol: 0.12, slide: 2.5 }),
    music: () => arp([523, 659, 784, 988, 1175], 0.07, { type: 'triangle', dur: 0.3, vol: 0.1 }),
    clothes: () => { hiss({ dur: 0.12, vol: 0.08, freq: 4000, q: 0.8 }); hiss({ dur: 0.12, vol: 0.06, freq: 3000, q: 0.8, delay: 0.1 }); },
    body: () => tone(400, { type: 'sine', dur: 0.12, vol: 0.18, slide: 0.4 }),
    house: () => { tone(160, { type: 'triangle', dur: 0.08, vol: 0.2 }); tone(160, { type: 'triangle', dur: 0.08, vol: 0.2, delay: 0.14 }); },
    building: () => { tone(660, { type: 'sine', dur: 1.2, vol: 0.12 }); tone(990, { type: 'sine', dur: 1, vol: 0.05 }); },
    toy: () => tone(900, { type: 'square', dur: 0.12, vol: 0.06, slide: 1.8 }),
  };
  // Kritzel-Rauschen (Dauerklang, Lautstärke folgt Tempo)
  let scr = null;
  S.scribble = (speed) => {
    const ctx = getCtx();
    if (!scr) { const s = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.9; const g = ctx.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(bus()); s.start(); scr = { g, f }; }
    const v = Math.min(0.07, speed * 0.05); scr.g.gain.setTargetAtTime(v, now(), 0.04); scr.f.frequency.setTargetAtTime(2000 + speed * 1500, now(), 0.05);
  };
  S.scribbleStop = () => { if (scr) scr.g.gain.setTargetAtTime(0, now(), 0.05); };
  return S;
}
