// src/game/audio.js — core movement sounds, made in code with Web Audio (no sound files).
//
// Every sound takes the body into account:
//   step(surface, body)       footfall: heavier, bigger bodies are lower, louder and thuddier
//   jump(body)                a short breath of effort: voice pitch from masculine/feminine
//   land(body, impact)        landing thud: size and weight set the pitch, the fall speed the force
// body: { mass (kg), size (height ÷ 1.75 m), fem (0..1) }. surface: a sound id from src/data/surfaces.js.
// Browsers only allow sound after a click, so the context starts on the first click into the game.

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, volume = 0.8, lowpass = null, muffleK = 0;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.5;   // (muffled hearing: a monster's screech)
    master.connect(lowpass).connect(comp).connect(ctx.destination);
    // one second of white noise, reused by every sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // weight → how deep and how loud. 70 kg at average size is 1.
  const heft = b => Math.max(0.4, Math.min(3, Math.pow((b?.mass ?? 70) / 70, 0.6)));

  function noise(t, dur, { type = 'lowpass', freq = 800, q = 0.7, gain = 0.3, attack = 0.004, sweepTo = null, out = null }) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rnd(0.9, 1.1);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  function tone(t, dur, { freq, to = freq, gain = 0.3, type = 'sine', attack = 0.004, out = null, vib = 0, vibHz = 0 }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibHz; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.02); }   // (a wobble: a screech's warble)
    o.connect(g).connect(out || master); o.start(t); o.stop(t + dur + 0.02);
  }

  // running water: one steady river bed (louder and brighter where it runs rough), a fall's roar, and gurgles: short
  // random splashes where the water breaks round rocks. The beds drift slowly at random (never a regular wobble), and
  // each fades with distance and pans toward its side (play.js works that out each moment)
  let waterBeds = null, gurgleNext = 0, weatherBeds = null, patterNext = 0, weatherBuf = null, gustLv = 0.5, gustTo = 0.5, gustNext = 0;
  function beds() {
    if (waterBeds) return waterBeds;
    const mk = (filters, max) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rnd(0.95, 1.05);
      let node = src; const fs = []; for (const [type, freq, q] of filters) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; node.connect(f); node = f; fs.push(f); }
      const g = ctx.createGain(); g.gain.value = 0; const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      node.connect(g); if (pan) g.connect(pan).connect(master); else g.connect(master); src.start(0, Math.random()); return { g, pan, max, fs, base: filters.map(f => f[1]), drift: 0 };
    };
    waterBeds = { river: mk([['lowpass', 1400, 0.5], ['peaking', 700, 0.8]], 0.08), fall: mk([['lowpass', 900, 0.5], ['lowpass', 1400, 0.4]], 0.2) };
    return waterBeds;
  }
  function gurgle(t, level, pan) {                                          // a little splash where the water breaks on a rock
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rnd(0.6, 1.4);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; const f0 = rnd(500, 2200); f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f0 * rnd(0.5, 1.6), t + 0.15); f.Q.value = rnd(2, 6);
    const g = ctx.createGain(), dur = rnd(0.06, 0.22), a = 0.05 * level * rnd(0.4, 1); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) p.pan.value = Math.max(-1, Math.min(1, pan + rnd(-0.3, 0.3)));
    src.connect(f).connect(g); if (p) g.connect(p).connect(master); else g.connect(master); src.start(t, Math.random() * 0.8); src.stop(t + dur + 0.02);
  }

  // ---- monster voices (docs/MONSTERS.md) ----
  // each call gets a little bus: its loudness (distance) and its side (pan), so many voices can sound at once
  function bus(gain, pan) {
    const g = ctx.createGain(); g.gain.value = gain; const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(master); } else g.connect(master);
    setTimeout(() => { try { g.disconnect(); p?.disconnect(); } catch (e) {} }, 4000); return g;
  }
  const MON = {
    // the Nocturian bat: leathery wing beats, the whoosh of its dive, a needle-toothed snap, a rasping screech
    batFlap: (t, o) => { noise(t, 0.09, { type: 'bandpass', freq: rnd(260, 380), q: 1.2, gain: 0.32, attack: 0.012, out: o }); noise(t + 0.01, 0.06, { type: 'lowpass', freq: 160, gain: 0.25, attack: 0.01, out: o }); },
    batSwoop: (t, o) => { noise(t, 0.7, { type: 'bandpass', freq: 380, q: 2.2, gain: 0.32, attack: 0.35, sweepTo: 2200, out: o }); noise(t + 0.25, 0.5, { type: 'bandpass', freq: 900, q: 4, gain: 0.12, attack: 0.15, sweepTo: 3200, out: o }); },
    batBite: (t, o) => { tone(t, 0.05, { freq: 1500, to: 500, type: 'square', gain: 0.1, out: o }); noise(t, 0.04, { type: 'highpass', freq: 3000, gain: 0.35, out: o }); tone(t + 0.02, 0.08, { freq: 3400, to: 2600, type: 'triangle', gain: 0.08, out: o }); },
    batScreech: (t, o) => {
      for (const [f, d] of [[2600, 0], [3150, 0.02], [2050, 0.04], [4100, 0.01]]) tone(t + d, 1.1, { freq: f, to: f * 0.78, type: 'sawtooth', gain: 0.035, attack: 0.04, vib: f * 0.04, vibHz: rnd(28, 40), out: o });
      noise(t, 1.0, { type: 'bandpass', freq: 3400, q: 3, gain: 0.18, attack: 0.05, sweepTo: 2200, out: o });
    },
    batHurt: (t, o) => { tone(t, 0.14, { freq: 3600, to: 2400, type: 'triangle', gain: 0.12, vib: 200, vibHz: 45, out: o }); },
    batDie: (t, o) => { tone(t, 0.5, { freq: 3000, to: 900, type: 'triangle', gain: 0.12, vib: 240, vibHz: 30, out: o }); noise(t + 0.1, 1.6, { type: 'bandpass', freq: 1200, q: 1.5, gain: 0.16, attack: 0.2, sweepTo: 200, out: o }); },
    // the Umbrafiend: a breathy growl under the smoke, a heavy snap, a raking swipe, a pounce that lands soft and heavy
    fiendGrowl: (t, o) => { const f = rnd(55, 70); tone(t, 1.2, { freq: f, to: f * 0.85, type: 'sawtooth', gain: 0.08, attack: 0.25, vib: 6, vibHz: 9, out: o }); tone(t, 1.2, { freq: f * 1.5, to: f * 1.3, type: 'sawtooth', gain: 0.03, attack: 0.3, vib: 8, vibHz: 7, out: o }); noise(t, 1.2, { type: 'lowpass', freq: 520, gain: 0.14, attack: 0.3, out: o }); },
    fiendBite: (t, o) => { noise(t, 0.07, { type: 'bandpass', freq: 900, q: 1.5, gain: 0.5, out: o }); tone(t, 0.12, { freq: 220, to: 70, type: 'square', gain: 0.1, out: o }); },
    fiendClaw: (t, o) => { noise(t, 0.32, { type: 'bandpass', freq: 700, q: 2.5, gain: 0.38, attack: 0.12, sweepTo: 3200, out: o }); noise(t + 0.18, 0.12, { type: 'highpass', freq: 2500, gain: 0.15, out: o }); },
    fiendPounce: (t, o) => { noise(t, 0.5, { type: 'bandpass', freq: 300, q: 1.5, gain: 0.3, attack: 0.2, sweepTo: 1400, out: o }); MON.fiendGrowl(t, o); },
    fiendLand: (t, o) => { tone(t, 0.25, { freq: 90, to: 38, gain: 0.35, out: o }); noise(t, 0.2, { type: 'lowpass', freq: 280, gain: 0.4, out: o }); },
    fiendStep: (t, o) => { tone(t, 0.09, { freq: rnd(70, 90), to: 45, gain: 0.12, out: o }); noise(t, 0.07, { type: 'lowpass', freq: 380, gain: 0.1, out: o }); },
    fiendCharge: (t, o) => { tone(t, 0.9, { freq: 90, to: 420, type: 'sawtooth', gain: 0.05, attack: 0.3, vib: 18, vibHz: 14, out: o }); tone(t, 0.9, { freq: 180, to: 840, gain: 0.06, attack: 0.3, out: o }); noise(t, 0.9, { type: 'bandpass', freq: 300, q: 4, gain: 0.12, attack: 0.5, sweepTo: 1500, out: o }); },
    fiendFire: (t, o) => { tone(t, 0.35, { freq: 520, to: 70, type: 'sawtooth', gain: 0.12, out: o }); noise(t, 0.3, { type: 'lowpass', freq: 1400, gain: 0.35, sweepTo: 200, out: o }); },
    shotHit: (t, o) => { noise(t, 0.4, { type: 'lowpass', freq: 900, gain: 0.4, sweepTo: 120, out: o }); tone(t, 0.3, { freq: 160, to: 45, gain: 0.2, out: o }); },
    fiendSink: (t, o) => { noise(t, 1.3, { type: 'lowpass', freq: 240, q: 1.5, gain: 0.45, attack: 0.3, sweepTo: 90, out: o }); tone(t, 1.3, { freq: 60, to: 35, gain: 0.12, attack: 0.3, out: o }); },
    fiendRise: (t, o) => { noise(t, 1.1, { type: 'lowpass', freq: 90, q: 1.5, gain: 0.45, attack: 0.5, sweepTo: 300, out: o }); MON.fiendGrowl(t + 0.6, o); },
    fiendHurt: (t, o) => { const f = rnd(110, 140); tone(t, 0.3, { freq: f * 1.6, to: f, type: 'sawtooth', gain: 0.08, vib: 10, vibHz: 20, out: o }); noise(t, 0.25, { type: 'bandpass', freq: 800, q: 1, gain: 0.2, out: o }); },
    // the Nyluth: bird-like chirps and trills as the pack circles ("not birds"), a yelp when hurt, a howl when it falls
    nylChirp: (t, o) => { const n = 2 + Math.floor(Math.random() * 3), f0 = rnd(2200, 3200); for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.07, 0.12); tone(tt, 0.06, { freq: f0 * rnd(0.9, 1.1), to: f0 * rnd(1.25, 1.5), gain: 0.07, attack: 0.008, out: o }); } tone(t + n * 0.1, 0.18, { freq: f0 * 0.8, to: f0 * 1.35, gain: 0.05, vib: 120, vibHz: 28, out: o }); },
    nylYelp: (t, o) => { tone(t, 0.22, { freq: 1300, to: 600, type: 'triangle', gain: 0.12, vib: 40, vibHz: 18, out: o }); noise(t, 0.12, { type: 'bandpass', freq: 1800, q: 2, gain: 0.08, out: o }); },
    nylHowl: (t, o) => { const g = ctx.createGain(); g.gain.value = 1; g.connect(o); tone(t, 1.6, { freq: 420, to: 640, gain: 0.07, attack: 0.25, vib: 9, vibHz: 5, out: g }); tone(t + 1.2, 1.2, { freq: 640, to: 330, gain: 0.06, attack: 0.05, vib: 9, vibHz: 5, out: g }); noise(t, 2.2, { type: 'bandpass', freq: 900, q: 1.2, gain: 0.05, attack: 0.3, out: g }); },
    fiendDie: (t, o) => { tone(t, 1.6, { freq: 120, to: 40, type: 'sawtooth', gain: 0.1, attack: 0.05, vib: 8, vibHz: 6, out: o }); noise(t, 2.2, { type: 'bandpass', freq: 1500, q: 0.8, gain: 0.22, attack: 0.3, sweepTo: 150, out: o }); },
  };

  return {
    start: ensure,
    // a monster's sound: gain from its distance (monsterActors works it out), pan toward its side
    monster(name, gain = 1, pan = 0) { if (!ctx || ctx.state !== 'running' || gain < 0.01) return; const f = MON[name]; if (!f) return; f(ctx.currentTime + 0.005, bus(gain, pan)); },
    // levels: { river, rough, fall, gurgle } (0..1) and pans (-1 left .. 1 right) for each
    water(levels, pans = {}) {
      if (!ctx || ctx.state !== 'running') return; const B = beds(), t = ctx.currentTime;
      const rough = Math.min(1, levels.rough || 0);
      for (const k of ['river', 'fall']) {
        const b = B[k], lv = Math.min(1, levels[k] || 0) * (k === 'river' ? 0.7 + 0.5 * rough : 1);
        b.g.gain.setTargetAtTime(lv * b.max, t, 0.4); if (b.pan) b.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pans[k] || 0)) * 0.7, t, 0.4);
        if (t > b.drift) { b.drift = t + rnd(0.4, 1.6); b.fs.forEach((f, n) => f.frequency.setTargetAtTime(b.base[n] * rnd(0.85, 1.15) * (k === 'river' ? 1 + rough * 0.6 : 1), t, rnd(0.3, 0.9))); }   // a slow random drift
      }
      const gl = Math.min(1, levels.gurgle || 0);
      if (gl > 0.02 && t > gurgleNext) { gurgle(t, gl, pans.gurgle || 0); gurgleNext = t + rnd(0.08, 0.5) / (0.3 + gl); }
    },
    // weather: steady beds of rain (a hiss with a patter), wind (a low roar that swells with the gusts) and blowing sand
    // or dust (a dry high hiss); levels 0..1. thunder(distance m): a crack close by, a long low rumble far off.
    weather(levels) {
      if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime;
      if (!weatherBeds) {
        // twelve seconds of noise of its own (the shared one-second loop repeats audibly in a long steady sound), brown-ish
        // for the wind's depth: no loop you can hear
        const len = ctx.sampleRate * 12, lb = ctx.createBuffer(1, len, ctx.sampleRate), dd = lb.getChannelData(0); let br = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; br = (br + 0.02 * w) / 1.02; dd[i] = w * 0.35 + br * 3.2; }
        const fadeN = ctx.sampleRate * 0.5; for (let i = 0; i < fadeN; i++) { const k = i / fadeN; dd[len - fadeN + i] = dd[len - fadeN + i] * (1 - k) + dd[i] * k; }   // (the loop's seam blended)
        weatherBuf = lb;
        const mk = (filters, max) => { const src = ctx.createBufferSource(); src.buffer = weatherBuf; src.loop = true; src.loopStart = 0.5; src.loopEnd = 12; let node = src; const fs = []; for (const [type, freq, q] of filters) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; node.connect(f); node = f; fs.push(f); }
          const g = ctx.createGain(); g.gain.value = 0; node.connect(g).connect(master); src.start(0, 0.5 + Math.random() * 11); return { g, max, fs, base: filters.map(f => f[1]), drift: 0 }; };
        weatherBeds = { rain: mk([['highpass', 180, 0.5], ['lowpass', 1500, 0.4], ['lowpass', 2600, 0.3]], 0.05), wind: mk([['lowpass', 320, 0.5], ['lowpass', 600, 0.4]], 0.09), sand: mk([['bandpass', 1600, 0.4], ['lowpass', 2400, 0.4]], 0.035) }; }   // (soft and low: a steady wash, nothing that whistles)
      // the wind swells and drops with gusts of its own (a slow random walk, never a regular rise and fall)
      if (t > gustNext) { gustNext = t + rnd(1.2, 5); gustTo = Math.random() < 0.3 ? rnd(0.85, 1.25) : rnd(0.35, 0.75); }
      gustLv += (gustTo - gustLv) * 0.05;
      for (const k of ['rain', 'wind', 'sand']) { const b = weatherBeds[k], lv = Math.max(0, Math.min(1.5, levels[k] || 0)) * (k === 'wind' ? gustLv * 1.2 : k === 'sand' ? 0.6 + gustLv * 0.5 : 1); b.g.gain.setTargetAtTime(lv * b.max, t, k === 'wind' ? 1.2 : 0.8);
        if (t > b.drift) { b.drift = t + rnd(1.5, 4); b.fs.forEach((f, n) => f.frequency.setTargetAtTime(b.base[n] * rnd(0.9, 1.1) * (k === 'wind' ? 0.85 + lv * 0.35 : 1), t, rnd(1.5, 3))); } }   // (slow, small drifts: no sweeping tones)
      if ((levels.rain || 0) > 0.05 && t > patterNext) { patterNext = t + rnd(0.05, 0.25) / Math.min(1.2, levels.rain); noise(t, rnd(0.03, 0.06), { type: 'lowpass', freq: rnd(700, 1400), q: 0.5, gain: 0.008 * Math.min(1, levels.rain) }); }   // (now and then a soft drop close by)
    },
    thunder(dist = 600) {
      if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime, k = Math.max(0.25, Math.min(1, 300 / Math.max(50, dist)));
      if (dist < 300) noise(t, 0.4, { type: 'lowpass', freq: 900, gain: 0.18 * k, attack: 0.02 });                    // the crack (softened)
      for (let i = 0; i < 4; i++) noise(t + 0.05 + i * rnd(0.3, 0.9), rnd(1.5, 3.2), { type: 'lowpass', freq: rnd(90, 180), q: 0.5, gain: 0.3 * k * rnd(0.6, 1), attack: rnd(0.15, 0.4), sweepTo: 50 });   // the rumble rolling on
    },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    // muffled hearing (0 clear .. 1 half-deaf): quieter and dull, as if through cloth
    muffle(k) { k = Math.max(0, Math.min(1, k)); if (Math.abs(k - muffleK) < 0.01 || !master) return; muffleK = k; master.gain.value = volume * (1 - 0.5 * k); lowpass.frequency.value = 20000 * Math.pow(600 / 20000, k); },
    // a footfall. speed 0..1+ (stroll .. sprint) makes it firmer; crouching makes it soft.
    // what's underfoot: the surface's own sound, and on top of it the weather: wet (a soft squish under the step), a
    // puddle (a splash), snow (a crunch, deeper and slower when it's deep).
    step(surface = 'grass', body, { speed = 0.5, soft = false, wet = 0, splash = false, snow = 0 } = {}) {
      if (!ensure()) return; const t = ctx.currentTime, h = heft(body), sz = body?.size ?? 1;
      const forceW = 0.25 * (0.45 + 0.55 * Math.min(1.3, speed)) * (soft ? 0.35 : 1), lowW = 1 / (Math.pow(h, 0.5) * Math.pow(sz, 0.6));
      if (snow > 0.015) {                                         // snow: a packed crunch of many small grains; deep snow muffles the step under it
        const deep = Math.min(1, snow / 0.2);
        for (let i = 0; i < 5; i++) noise(t + i * rnd(0.012, 0.03), rnd(0.03, 0.06), { type: 'bandpass', freq: rnd(1400, 2600) * (1 - deep * 0.35), q: 1.2, gain: 0.07 * forceW * (1 - i * 0.12) });
        noise(t, 0.18 + deep * 0.12, { type: 'lowpass', freq: (700 - deep * 300) * lowW, gain: 0.16 * forceW, attack: 0.02 });
        if (deep > 0.6) return;                                   // (deep: the ground beneath isn't heard)
      }
      if (splash) {                                               // a puddle
        noise(t, 0.18, { type: 'bandpass', freq: rnd(900, 1400) * lowW, q: 1.1, gain: 0.22 * forceW, attack: 0.006, sweepTo: 500 * lowW });
        noise(t + 0.03, 0.22, { type: 'highpass', freq: rnd(2600, 3600), gain: 0.06 * forceW, attack: 0.01 });
      } else if (wet > 0.25 && surface !== 'water') {             // wet ground: a soft squish under the step
        noise(t + 0.01, 0.09, { type: 'bandpass', freq: rnd(2200, 3200), q: 0.9, gain: 0.05 * forceW * wet });
        noise(t + 0.02, 0.07, { type: 'lowpass', freq: 500 * lowW, gain: 0.05 * forceW * wet });
      }
      const force = 0.25 * (0.45 + 0.55 * Math.min(1.3, speed)) * (soft ? 0.35 : 1) * Math.min(1.6, 0.6 + 0.4 * h);   // footsteps sit well under everything else
      const low = 1 / (Math.pow(h, 0.5) * Math.pow(sz, 0.6));         // heavier and bigger: deeper
      if (surface === 'water') {                                  // wading
        noise(t, 0.25, { type: 'bandpass', freq: rnd(1200, 1800) * low, q: 0.8, gain: 0.35 * force, attack: 0.01, sweepTo: 600 * low });
        noise(t + 0.04, 0.2, { type: 'highpass', freq: 3000, gain: 0.08 * force });
      } else if (surface === 'wood') {                            // hollow knock
        noise(t, 0.06, { type: 'bandpass', freq: rnd(900, 1200) * low, q: 2, gain: 0.2 * force });
        tone(t, 0.12, { freq: 220 * low, to: 160 * low, gain: 0.16 * force, type: 'triangle' });
        tone(t, 0.1, { freq: 110 * low, to: 60 * low, gain: 0.16 * force * Math.min(1.5, h) });
      } else if (surface === 'metal') {                           // ringing clank
        noise(t, 0.05, { type: 'highpass', freq: 2500, gain: 0.14 * force });
        tone(t, 0.35, { freq: rnd(780, 900) * low, to: 760 * low, gain: 0.05 * force, type: 'triangle' });
        tone(t, 0.25, { freq: rnd(1500, 1700) * low, to: 1450 * low, gain: 0.025 * force });
        tone(t, 0.09, { freq: 130 * low, to: 65 * low, gain: 0.15 * force * Math.min(1.5, h) });
      } else if (surface === 'sand') {                            // soft crunch
        noise(t, 0.2, { type: 'bandpass', freq: rnd(2500, 3200), q: 0.5, gain: 0.08 * force, attack: 0.02 });
        noise(t, 0.15, { type: 'lowpass', freq: 600 * low, gain: 0.14 * force, attack: 0.015 });
      } else if (surface === 'gravel') {                          // loose stones shifting
        for (let i = 0; i < 6; i++) noise(t + i * rnd(0.008, 0.025), rnd(0.02, 0.05), { type: 'bandpass', freq: rnd(2500, 4500), q: 1.5, gain: 0.06 * force * (1 - i * 0.1) });
        noise(t, 0.1, { type: 'lowpass', freq: 700 * low, gain: 0.16 * force });
        tone(t, 0.08, { freq: 110 * low, to: 60 * low, gain: 0.12 * force * Math.min(1.5, h) });
      } else if (surface === 'dirt') {                            // packed earth: a dull thud with a little grit
        noise(t, 0.12, { type: 'lowpass', freq: rnd(500, 700) * low, gain: 0.24 * force, attack: 0.01 });
        noise(t + 0.01, 0.06, { type: 'bandpass', freq: rnd(1800, 2600), q: 1, gain: 0.04 * force });
        tone(t, 0.1, { freq: 100 * low, to: 55 * low, gain: 0.18 * force * Math.min(1.5, h) });
      } else if (surface === 'mud') {                             // squelch
        noise(t, 0.22, { type: 'bandpass', freq: rnd(500, 700) * low, q: 3, gain: 0.25 * force, attack: 0.02, sweepTo: 250 * low });
        tone(t + 0.05, 0.12, { freq: 180 * low, to: 90 * low, gain: 0.08 * force });
      } else if (surface === 'stone') {
        noise(t, 0.07, { type: 'bandpass', freq: rnd(1700, 2300) * low, q: 1.2, gain: 0.16 * force });     // heel click
        noise(t + 0.012, 0.11, { type: 'lowpass', freq: 900 * low, gain: 0.22 * force });
        tone(t, 0.09, { freq: 140 * low, to: 70 * low, gain: 0.18 * force * Math.min(1.5, h) });
      } else {
        noise(t, 0.16, { type: 'lowpass', freq: rnd(1100, 1500) * low, gain: 0.2 * force, attack: 0.012, sweepTo: 400 * low });   // grass brush
        noise(t + 0.03, 0.12, { type: 'bandpass', freq: 3200 * low, q: 0.6, gain: 0.05 * force });
        tone(t, 0.1, { freq: 95 * low, to: 50 * low, gain: 0.2 * force * Math.min(1.5, h) });                // the thud of weight
      }
    },
    // effort on a jump: a short exhale through a voiced "hup", pitched by the body
    jump(body) {
      if (!ensure()) return; const t = ctx.currentTime, f = body?.fem ?? 0.5, sz = body?.size ?? 1;
      const pitch = (110 + 110 * f) / Math.pow(sz, 0.5) * rnd(0.95, 1.06);
      noise(t, 0.16, { type: 'bandpass', freq: (900 + 700 * f), q: 1.4, gain: 0.07, attack: 0.01 });          // breath
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(pitch * 1.08, t); o.frequency.exponentialRampToValueAtTime(pitch * 0.92, t + 0.13);
      const formant = ctx.createBiquadFilter(); formant.type = 'bandpass'; formant.frequency.value = 500 + 300 * f; formant.Q.value = 3;
      const formant2 = ctx.createBiquadFilter(); formant2.type = 'lowpass'; formant2.frequency.value = 1400 + 900 * f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(formant).connect(formant2).connect(g).connect(master); o.start(t); o.stop(t + 0.18);
    },
    // landing: impact is the downward speed in m/s
    land(body, impact = 4, surface = 'grass') {
      if (!ensure()) return; const t = ctx.currentTime, h = heft(body), sz = body?.size ?? 1;
      const force = Math.min(1.8, Math.max(0.25, impact / 6)) * Math.min(1.8, 0.5 + 0.5 * h);
      const low = 1 / (Math.pow(h, 0.55) * Math.pow(sz, 0.6));
      tone(t, 0.22, { freq: 85 * low, to: 38 * low, gain: 0.35 * force });                                      // body thud
      noise(t, 0.2, { type: 'lowpass', freq: (surface === 'stone' || surface === 'metal' || surface === 'wood' ? 1400 : 900) * low, gain: 0.3 * force, sweepTo: 200 });
      if (surface === 'metal') tone(t, 0.5, { freq: 700 * low, to: 660 * low, gain: 0.07 * force, type: 'triangle' });
      if (surface === 'stone' || surface === 'metal' || surface === 'wood') noise(t, 0.06, { type: 'bandpass', freq: 2200 * low, q: 1.5, gain: 0.12 * force });
      else noise(t + 0.02, 0.18, { type: 'highpass', freq: 2500, gain: 0.04 * force });                          // grass scatter
    },
    // dropping into a slide: a long scrape that fades
    slide(body, surface = 'grass') {
      if (!ensure()) return; const t = ctx.currentTime, h = heft(body);
      noise(t, 0.9, { type: 'bandpass', freq: surface === 'stone' ? 1800 : 1100, q: 0.6, gain: 0.12 * Math.min(1.5, h), attack: 0.04, sweepTo: 500 });
      tone(t, 0.12, { freq: 90, to: 45, gain: 0.15 * Math.min(1.5, h) });
    },
    // a leap off a wall (side leap, push off): the kick against the wall, a rush of air and a grunt
    leap(body) {
      if (!ensure()) return; const t = ctx.currentTime, h = heft(body), f = body?.fem ?? 0.5, sz = body?.size ?? 1;
      noise(t, 0.05, { type: 'bandpass', freq: 1500, q: 1.5, gain: 0.12 * Math.min(1.5, h) });                   // hands and feet pushing off
      tone(t, 0.08, { freq: 120, to: 60, gain: 0.12 * Math.min(1.5, h) });
      noise(t + 0.03, 0.35, { type: 'bandpass', freq: 600, q: 0.8, gain: 0.08, attack: 0.08, sweepTo: 2200 });     // the rush of air
      const pitch = (120 + 110 * f) / Math.pow(sz, 0.5) * rnd(0.95, 1.05);
      tone(t + 0.01, 0.14, { freq: pitch * 1.1, to: pitch * 0.85, gain: 0.05, type: 'sawtooth' });              // effort
    },
    // a dodge roll: a shoulder hitting the ground and a rustle
    roll(body) {
      if (!ensure()) return; const t = ctx.currentTime, h = heft(body);
      tone(t + 0.08, 0.15, { freq: 80, to: 40, gain: 0.2 * Math.min(1.5, h) });
      noise(t, 0.4, { type: 'bandpass', freq: 900, q: 0.5, gain: 0.1, attack: 0.05, sweepTo: 400 });
    },
    // falling or jumping into water
    splash(body, impact = 4) {
      if (!ensure()) return; const t = ctx.currentTime, h = heft(body), f = Math.min(1.6, Math.max(0.3, impact / 6)) * Math.min(1.5, 0.6 + 0.4 * h);
      noise(t, 0.5, { type: 'lowpass', freq: 2500, gain: 0.32 * f, attack: 0.005, sweepTo: 500 });
      noise(t + 0.03, 0.7, { type: 'bandpass', freq: 3500, q: 0.8, gain: 0.1 * f, sweepTo: 1500 });
      tone(t, 0.25, { freq: 120 / Math.sqrt(h), to: 50, gain: 0.2 * f });
      for (let i = 0; i < 5; i++) tone(t + 0.15 + Math.random() * 0.4, 0.06, { freq: rnd(500, 1100), to: rnd(1200, 2000), gain: 0.03 * f });   // droplets
    },
    // a swimming stroke; muffled underwater
    stroke(body, hard = false, under = false) {
      if (!ensure()) return; const t = ctx.currentTime, g = (hard ? 0.09 : 0.05) * (under ? 0.6 : 1);
      noise(t, 0.35, { type: under ? 'lowpass' : 'bandpass', freq: under ? 600 : 1400, q: 0.7, gain: g, attack: 0.06, sweepTo: under ? 300 : 700 });
    },
    // a weapon cutting the air: heavier and slower swings whoosh lower and longer
    swing(heavy = false) {
      if (!ensure()) return; const t = ctx.currentTime, d = heavy ? 0.42 : 0.26;
      noise(t, d, { type: 'bandpass', freq: heavy ? 500 : 800, q: 1.2, gain: heavy ? 0.16 : 0.11, attack: d * 0.5, sweepTo: heavy ? 1400 : 2200 });
    },
    // a blunt blow landing: a deep thud with a crack of wood or bone; power 0..2
    impact(power = 1, material = 'wood') {
      if (!ensure()) return; const t = ctx.currentTime, p = Math.min(2, Math.max(0.3, power));
      tone(t, 0.18, { freq: 110, to: 45, gain: 0.32 * p });
      noise(t, 0.09, { type: 'bandpass', freq: material === 'flesh' ? 700 : 1300, q: 1.4, gain: 0.25 * p });
      noise(t, 0.25, { type: 'lowpass', freq: 900, gain: 0.18 * p, sweepTo: 200 });
      if (material === 'metal') tone(t, 0.6, { freq: rnd(620, 700), to: 600, gain: 0.08 * p, type: 'triangle' });
    },
    // a blow caught on the guard: a ringing clang
    block(power = 1) {
      if (!ensure()) return; const t = ctx.currentTime, p = Math.min(2, Math.max(0.3, power));
      noise(t, 0.05, { type: 'highpass', freq: 2200, gain: 0.2 * p });
      tone(t, 0.5, { freq: rnd(900, 1000), to: 880, gain: 0.08 * p, type: 'triangle' });
      tone(t, 0.35, { freq: rnd(1800, 2000), to: 1750, gain: 0.04 * p });
      tone(t, 0.12, { freq: 140, to: 70, gain: 0.18 * p });
    },
    // a perfect moment (a perfect block, a combo press on the beat): a bright, short two-note chime — 'block' a little lower
    perfect(kind = 'combo') {
      // Phantasy Star Universe's just-attack, measured from a clean clip: a cluster of glassy partials (3.6–7.8 kHz; the
      // 7.8 kHz pair, slightly detuned so it shimmers, and 4.15 kHz the strongest) that swells up ~25 dB over 0.36 s, every
      // partial gliding up about 1.5% as it grows, the top ones entering first — then it cuts off. A perfect block is a bit
      // lower. (Scheduled on the audio clock: frame rate never changes its speed or pitch.)
      if (!ensure()) return; const t = ctx.currentTime, k = kind === 'block' ? 0.85 : 1, rise = 0.36, cut = 0.035, G = 0.03;
      for (const [f, g, d] of [[7816, 1, 0], [7730, 0.45, 0], [4155, 0.8, 0.06], [3639, 0.32, 0.06], [6406, 0.28, 0.08], [5200, 0.4, 0.12], [5469, 0.36, 0.12], [5857, 0.36, 0.16], [7245, 0.22, 0.16]]) {
        const o = ctx.createOscillator(), t0 = t + d; o.type = 'sine';
        o.frequency.setValueAtTime(f * k * 0.985, t0); o.frequency.linearRampToValueAtTime(f * k, t + rise);
        const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g * G, t + rise); gn.gain.linearRampToValueAtTime(0.0001, t + rise + cut);
        o.connect(gn).connect(master); o.start(t0); o.stop(t + rise + cut + 0.02);
      }
    },
    // speaking a spell: a low murmur of voice and a rising hum of gathering power, over the cast time
    chant(spoken = true, dur = 1.5) {
      if (!ensure()) return; const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(spoken ? 140 : 220, t); o.frequency.linearRampToValueAtTime(spoken ? 190 : 330, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = spoken ? 600 : 900; f.Q.value = 4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(spoken ? 0.05 : 0.03, t + 0.15); g.gain.setValueAtTime(spoken ? 0.05 : 0.03, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
      this._chant = { o, g };
    },
    chantStop() { const c = this._chant; if (!c || !ctx) return; const t = ctx.currentTime; c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(c.g.gain.value, t); c.g.gain.linearRampToValueAtTime(0, t + 0.08); this._chant = null; },
    // fire leaving the hand: a roaring whoosh (bigger for a fireball)
    fireLaunch(big = false) {
      if (!ensure()) return; const t = ctx.currentTime;
      noise(t, big ? 0.7 : 0.4, { type: 'lowpass', freq: big ? 500 : 900, gain: big ? 0.3 : 0.18, attack: 0.03, sweepTo: big ? 1800 : 2600 });
      noise(t, big ? 0.6 : 0.3, { type: 'bandpass', freq: 2500, q: 0.6, gain: 0.05, attack: 0.05 });
    },
    // a fireball bursting: a deep boom with crackle
    fireBurst() {
      if (!ensure()) return; const t = ctx.currentTime;
      tone(t, 0.6, { freq: 70, to: 30, gain: 0.45 });
      noise(t, 0.8, { type: 'lowpass', freq: 1200, gain: 0.4, sweepTo: 150 });
      for (let i = 0; i < 8; i++) noise(t + 0.05 + Math.random() * 0.6, 0.04, { type: 'highpass', freq: 3000, gain: 0.06 });
    },
    // a bolt striking: a hiss and a pop
    fireHit() {
      if (!ensure()) return; const t = ctx.currentTime;
      noise(t, 0.25, { type: 'highpass', freq: 1800, gain: 0.12, sweepTo: 5000 });
      tone(t, 0.12, { freq: 160, to: 70, gain: 0.15 });
    },
    dispose() { if (ctx) ctx.close(); ctx = null; },
  };
}
