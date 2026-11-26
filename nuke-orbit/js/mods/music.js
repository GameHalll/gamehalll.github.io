/* =========================================================================
   NUKE ORBIT mod: music
   1) Procedural WebAudio soundtrack (no files) with a lookahead scheduler:
        menu    – light funky chiptune groove (also under results, quieter)
        aim     – tense minor build, filter opens while you aim
        flight  – energetic four-on-the-floor; layers + brightness follow bomb speed
        orbit   – spacey lydian pads + echoing bells
        boom / record – short stingers
      Starts only after a user gesture, follows NO.Save.data.muted live, has
      its own MUSIC toggle (persisted in NO.Mods.store('music')), and suspends
      its AudioContext while the tab is hidden or sound is off.
   2) Menu presentation: drifting clouds + sparkles behind the menu, a tiny
      nuke orbiting the logo, staggered entrance animations, button polish.
      Respects prefers-reduced-motion.
   ========================================================================= */
'use strict';

(function () {
  // always re-fetch: NO.Save.load()/reset() replace the data object
  function st() { const s = NO.Mods.store('music'); if (typeof s.on !== 'boolean') s.on = true; return s; }

  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(reduceMQ && reduceMQ.matches);

  /* =========================================================== AUDIO === */
  const VOL = 0.3;            // overall music level (SFX master is 0.5)
  const LOOKAHEAD = 0.14;     // seconds scheduled ahead
  const TICK_MS = 30;

  let ctx = null, out = null, musicBus = null, stingBus = null;
  let drumBus, bassBus, toneBus, toneFilter, padBus, padFilter, delayIn;
  let noiseBuf = null, timer = 0;
  let step = 0, nextT = 0, sec = 'none', want = 'menu';
  let intensity = 0, intensityTarget = 0, aimStart = 0;
  let resultsAt = 0, boomAt = 0, lastSilent = null;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const silent = () => !st().on || !!(NO.Save.data && NO.Save.data.muted) || document.hidden;

  function build() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }

    out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(out);
    stingBus = ctx.createGain(); stingBus.gain.value = 1; stingBus.connect(out);

    // echo (shared send)
    delayIn = ctx.createGain(); delayIn.gain.value = 1;
    const dl = ctx.createDelay(1.5); dl.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    delayIn.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(wet); wet.connect(musicBus);

    drumBus = ctx.createGain(); drumBus.gain.value = 0.9; drumBus.connect(musicBus);
    const bassF = ctx.createBiquadFilter(); bassF.type = 'lowpass'; bassF.frequency.value = 900; bassF.Q.value = 2;
    bassBus = ctx.createGain(); bassBus.gain.value = 0.9; bassBus.connect(bassF); bassF.connect(musicBus);
    bassBus._f = bassF;
    toneFilter = ctx.createBiquadFilter(); toneFilter.type = 'lowpass'; toneFilter.frequency.value = 2600; toneFilter.Q.value = 1.2;
    toneBus = ctx.createGain(); toneBus.gain.value = 1; toneBus.connect(toneFilter); toneFilter.connect(musicBus);
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 1400;
    padBus = ctx.createGain(); padBus.gain.value = 1; padBus.connect(padFilter); padFilter.connect(musicBus);
    const padSend = ctx.createGain(); padSend.gain.value = 0.5; padFilter.connect(padSend); padSend.connect(delayIn);

    const len = Math.floor(ctx.sampleRate * 1);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

    timer = setInterval(tick, TICK_MS);
    return true;
  }

  /* ------------------------------------------------------------ voices -- */
  function voice(type, freq, t, dur, vol, dest, o) {
    o = o || {};
    const a = o.attack || 0.004, rel = o.release || 0;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + (o.slideT || dur));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (rel) { // sustained (pad)
      g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    osc.connect(g); g.connect(dest);
    if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(delayIn); }
    osc.start(t); osc.stop(t + dur + 0.03);
  }
  function noiseHit(t, dur, vol, ftype, freq, dest, freqTo, q) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t);
    if (q) f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || drumBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  function riser(t, dur, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(drumBus);
    src.start(t); src.stop(t + dur + 0.02);
  }
  const kick = (t, v) => voice('sine', 150, t, 0.28, 0.7 * v, drumBus, { slide: 42, slideT: 0.12 });
  const snare = (t, v) => { noiseHit(t, 0.16, 0.32 * v, 'highpass', 1400); voice('triangle', 200, t, 0.09, 0.22 * v, drumBus, { slide: 140 }); };
  const clap = (t, v) => { noiseHit(t, 0.12, 0.3 * v, 'bandpass', 1500, null, null, 1.2); noiseHit(t + 0.012, 0.14, 0.24 * v, 'bandpass', 1300, null, null, 1.2); };
  const hat = (t, v) => noiseHit(t, 0.035 + v * 0.02, 0.14 * v, 'highpass', 7500);
  const crash = (t, v) => noiseHit(t, 1.4, 0.18 * v, 'highpass', 5000, null, 3000);
  function bass(m, t, dur, v) {
    voice('square', mtof(m), t, dur, 0.13 * v, bassBus);
    voice('triangle', mtof(m - 12), t, dur * 1.1, 0.32 * v, bassBus);
  }
  function stab(chord, t, dur, v) {
    for (let i = 0; i < chord.length; i++) voice('square', mtof(chord[i] + 12), t, dur, 0.035 * v, toneBus, { detune: (i - 1) * 6 });
  }
  const lead = (m, t, dur, v, type) => voice(type || 'square', mtof(m), t, dur, 0.06 * v, toneBus, { send: 0.35, attack: 0.006 });
  const pluck = (m, t, v) => voice('triangle', mtof(m), t, 0.22, 0.09 * v, toneBus, { send: 0.25 });
  function pad(chord, t, dur, v) {
    for (let i = 0; i < chord.length; i++) {
      voice('sawtooth', mtof(chord[i]), t, dur, 0.022 * v, padBus, { attack: Math.min(1.2, dur * 0.4), release: Math.min(1.2, dur * 0.4), detune: -7 });
      voice('sawtooth', mtof(chord[i]), t, dur, 0.022 * v, padBus, { attack: Math.min(1.2, dur * 0.4), release: Math.min(1.2, dur * 0.4), detune: 7 });
    }
  }
  function bell(m, t, v) {
    voice('sine', mtof(m), t, 1.6, 0.07 * v, padBus, { send: 0.8 });
    voice('sine', mtof(m) * 3.01, t, 0.5, 0.018 * v, padBus, { send: 0.6 });
  }

  /* ----------------------------------------------------------- patterns -- */
  const P = (s) => s.split('').map((c) => (c === 'X' ? 1 : c === 'x' ? 0.75 : c === 'o' ? 0.45 : 0));
  // ---- menu: funky light groove in F (Fmaj7 – Dm7 – Bbmaj7 – C7)
  const M = {
    bpm: 104, swing: 0.14,
    roots: [53, 50, 46, 48],
    chords: [[57, 60, 64], [57, 60, 65], [57, 62, 65], [58, 64, 67]],
    kick: P('X.....x...X..o..'),
    snare: P('....X.......X..o'),
    hat: P('o.x.o.x.o.x.o.xx'),
    stab: P('...x..x....x.x..'),
    bassSteps: { 0: 0, 3: 0, 6: 12, 8: 0, 10: 7, 11: 0, 12: 12, 14: 7 },
    melody: [ // [step in 4 bars, midi, len(steps)]  — F major pentatonic
      [0, 72, 2], [3, 69, 1], [4, 72, 2], [6, 74, 2], [10, 72, 1], [11, 69, 1], [12, 67, 2], [14, 65, 2],
      [18, 69, 2], [20, 72, 3], [24, 74, 1], [25, 72, 1], [26, 69, 2], [30, 67, 2],
      [32, 65, 2], [35, 67, 1], [36, 69, 2], [38, 74, 3], [42, 72, 2], [44, 69, 1], [45, 67, 1], [46, 65, 2],
      [48, 67, 3], [52, 70, 2], [54, 72, 2], [56, 76, 4], [62, 72, 2],
    ],
  };
  const melAt = {}; M.melody.forEach((n) => { melAt[n[0]] = n; });
  // ---- aim: tense D minor build (Dm – Bb – Gm – A)
  const A = {
    bpm: 108, swing: 0,
    roots: [50, 46, 43, 45],
    chords: [[57, 62, 65], [58, 62, 65], [58, 62, 67], [57, 61, 64]],
    kick: P('X...X...X...X...'),
    hat: P('xoooxoooxoooxooo'),
  };
  // ---- flight: energetic F – C – Dm – Bb
  const F = {
    bpm: 128, swing: 0,
    roots: [53, 48, 50, 46],
    chords: [[57, 60, 65], [55, 60, 64], [57, 62, 65], [58, 62, 65]],
    kick: P('X...X...X...X...'),
    clap: P('....X.......X...'),
    hat8: P('..x...x...x...x.'),
    hat16: P('o.o.o.o.o.o.o.oo'),
    stab: P('..x..x....x..x..'),
    hook: [ // fast hook over 2 bars, pentatonic
      [0, 77, 2], [2, 74, 1], [3, 72, 1], [4, 74, 2], [6, 77, 2], [8, 79, 3], [12, 77, 1], [13, 74, 1], [14, 72, 2],
      [16, 72, 2], [18, 74, 1], [19, 72, 1], [20, 69, 2], [22, 72, 2], [24, 74, 4], [30, 77, 2],
    ],
  };
  const hookAt = {}; F.hook.forEach((n) => { hookAt[n[0]] = n; });
  // ---- orbit: F lydian (Fmaj7 / G over F)
  const O = {
    bpm: 80, swing: 0,
    chords: [[53, 57, 60, 64, 67], [55, 59, 62, 67, 71]],
    bells: [77, 79, 81, 83, 84, 88, 89, 91],
  };
  const SEC = { menu: M, results: M, aim: A, flight: F, orbit: O };

  function playStep(s, t, sd) {
    const i16 = s % 16, bar = Math.floor(s / 16);
    if (sec === 'menu' || sec === 'results') {
      const c = bar % 4, lite = sec === 'results';
      if (M.kick[i16]) kick(t, M.kick[i16]);
      if (M.snare[i16]) snare(t, M.snare[i16]);
      if (M.hat[i16]) hat(t, M.hat[i16] * (lite ? 0.7 : 1));
      const bo = M.bassSteps[i16];
      if (bo !== undefined) bass(M.roots[c] + bo, t, sd * (i16 === 0 || i16 === 8 ? 1.8 : 0.9), 1);
      if (M.stab[i16]) stab(M.chords[c], t, sd * 0.9, M.stab[i16]);
      if (!lite) {
        const phrase = Math.floor(bar / 4) % 2;
        if (phrase === 0) { const n = melAt[s % 64]; if (n) lead(n[1], t, sd * n[2] * 0.95, 1); }
        else if (i16 % 2 === 0) { const ch = M.chords[c]; pluck(ch[(i16 / 2) % ch.length] + 12 + (i16 >= 8 ? 12 : 0), t, 0.8); }
      }
      if (s % 64 === 0 && s > 0) crash(t, 0.5);
    } else if (sec === 'aim') {
      const c = bar % 4;
      const build = Math.min(1, (ctx.currentTime - aimStart) / 8);
      if (A.kick[i16]) kick(t, A.kick[i16] * (0.7 + build * 0.3));
      if (A.hat[i16]) hat(t, A.hat[i16] * (0.6 + build * 0.4));
      bass(A.roots[c] + (i16 % 8 === 6 ? 12 : 0), t, sd * 0.8, i16 % 4 === 0 ? 1 : 0.65);
      if (i16 === 0) pad(A.chords[c], t, sd * 16, 0.9 + build * 0.6);
      if (i16 % 4 === 2) stab(A.chords[c], t, sd * 0.6, 0.6 + build * 0.6);
      if (c === 3 && i16 >= 8) snare(t, 0.25 + (i16 - 8) / 8 * 0.6);
      if (c === 2 && i16 === 0) riser(t, sd * 32, 0.18);
      toneFilter.frequency.setTargetAtTime(500 + build * 2800 + (c === 3 ? 900 : 0), t, 0.3);
    } else if (sec === 'flight') {
      const c = bar % 4, it = intensity;
      if (F.kick[i16]) kick(t, 1);
      if (F.clap[i16]) clap(t, 0.8 + it * 0.3);
      if (F.hat8[i16]) hat(t, 0.9);
      if (it > 0.5 && F.hat16[i16]) hat(t, F.hat16[i16] * it);
      bass(F.roots[c] + (i16 % 4 === 2 ? 12 : 0), t, sd * 1.6, i16 % 2 === 0 ? 1 : 0);
      if (it > 0.12 && F.stab[i16]) stab(F.chords[c], t, sd * 0.8, 0.7 + it * 0.4);
      if (it > 0.35) { const ch = F.chords[c]; pluck(ch[i16 % 3] + 12 + (i16 % 6 >= 3 ? 12 : 0), t, 0.45 + it * 0.4); }
      if (it > 0.68) { const n = hookAt[s % 32]; if (n) lead(n[1], t, sd * n[2] * 0.9, 0.9, 'sawtooth'); }
      if (s === 0 || (s % 64 === 0)) crash(t, 0.6 + it * 0.4);
    } else if (sec === 'orbit') {
      const c = Math.floor(bar / 2) % 2;
      if (s % 32 === 0) {
        pad(O.chords[c], t, sd * 32 + 0.6, 1);
        voice('sine', mtof(c === 0 ? 29 + 12 : 31 + 12), t, sd * 32, 0.22, bassBus, { attack: 0.8, release: 1 });
      }
      if (i16 === 0) kick(t, 0.35);
      if (i16 % 2 === 0 && Math.random() < 0.3) bell(O.bells[(Math.random() * O.bells.length) | 0], t, 0.9);
      if (i16 === 8 && bar % 2 === 1) noiseHit(t, 0.6, 0.05, 'bandpass', 3000, null, 8000, 4);
    }
  }

  const SEC_GAIN = { menu: 0.85, results: 0.6, aim: 0.85, flight: 0.85, orbit: 1, none: 0 };

  function tick() {
    if (!ctx) return;
    const sil = silent();
    if (sil !== lastSilent) {
      lastSilent = sil;
      if (sil) {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(() => { if (silent() && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 260);
      } else {
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(VOL, ctx.currentTime, 0.4);
      }
    }
    if (sil || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.04;           // resync after suspend / stall
    while (nextT < now + LOOKAHEAD) {
      if (want !== sec && (step % 4 === 0 || want === 'none' || sec === 'none')) {
        sec = want; step = 0;
        musicBus.gain.cancelScheduledValues(nextT);
        musicBus.gain.setTargetAtTime(SEC_GAIN[sec] || 0, nextT, sec === 'none' ? 0.05 : 0.25);
        if (sec === 'menu' || sec === 'results') toneFilter.frequency.setTargetAtTime(2600, nextT, 0.3);
        if (sec === 'orbit') toneFilter.frequency.setTargetAtTime(1800, nextT, 0.5);
        bassBus._f.frequency.setTargetAtTime(sec === 'orbit' ? 300 : 900, nextT, 0.3);
      }
      const def = SEC[sec];
      if (!def) { nextT += 0.06; continue; }
      const sd = 60 / def.bpm / 4;
      const t = nextT + (step % 2 === 1 ? def.swing * sd : 0);
      playStep(step, t, sd);
      step++;
      nextT += sd;
    }
    if (sec === 'flight') {
      musicBus.gain.setTargetAtTime(0.7 + intensity * 0.3, now, 0.3);
      toneFilter.frequency.setTargetAtTime(700 + intensity * intensity * 5200, now, 0.15);
    }
  }

  /* ---------------------------------------------------------- stingers -- */
  function stingBoom() {
    if (!ctx || silent()) return;
    const t = ctx.currentTime + 0.55;
    [65, 69, 72].forEach((m, i) => voice('square', mtof(m), t + i * 0.09, 0.16, 0.07, stingBus));
    [65, 69, 72, 77].forEach((m) => {
      voice('sawtooth', mtof(m), t + 0.27, 0.9, 0.035, stingBus, { attack: 0.02, send: 0.3 });
      voice('square', mtof(m), t + 0.27, 0.9, 0.025, stingBus, { attack: 0.02, detune: 8 });
    });
    voice('triangle', mtof(41), t + 0.27, 0.9, 0.25, stingBus);
  }
  function stingRecord() {
    if (!ctx || silent()) return;
    const t = ctx.currentTime + 0.6;
    [67, 71, 74, 79, 83, 86].forEach((m, i) => voice('square', mtof(m), t + i * 0.065, 0.14, 0.055, stingBus, { send: 0.3 }));
    [67, 71, 74, 79].forEach((m) => voice('sawtooth', mtof(m), t + 0.42, 1.3, 0.03, stingBus, { attack: 0.02, send: 0.4 }));
    voice('triangle', mtof(43), t + 0.42, 1.2, 0.25, stingBus);
    for (let i = 0; i < 6; i++) voice('sine', mtof(91 + [0, 4, 7, 12, 7, 16][i]), t + 0.5 + i * 0.08, 0.4, 0.03, stingBus, { send: 0.6 });
  }

  /* --------------------------------------------------------- unlocking -- */
  function unlock() {
    if (!build()) return;
    if (ctx.state === 'suspended' && !silent()) ctx.resume().catch(() => {});
    lastSilent = null; tick();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  const origInit = NO.Audio && NO.Audio.init;
  if (typeof origInit === 'function') NO.Audio.init = function () { const r = origInit.apply(this, arguments); try { unlock(); } catch (e) { /* ignore */ } return r; };
  document.addEventListener('visibilitychange', () => { if (ctx) tick(); });

  /* ====================================================== MENU VISUALS === */
  const CSS = `
#music-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
#music-bg .music-glow{position:absolute;width:70vmin;height:70vmin;border-radius:50%;right:calc(6vw + 260px - 35vmin);top:4vh;
  background:radial-gradient(circle,rgba(255,236,150,.32),rgba(255,236,150,0) 65%);animation:music-glow 5s ease-in-out infinite}
@media (max-width:900px){#music-bg .music-glow{right:auto;left:50%;margin-left:-35vmin}}
#music-bg .music-cloud{position:absolute;left:0;width:var(--w);height:calc(var(--w)*.32);border-radius:999px;background:rgba(255,255,255,.42);
  filter:blur(1px);animation:music-drift var(--d) linear infinite;animation-delay:var(--dl)}
#music-bg .music-cloud::before,#music-bg .music-cloud::after{content:'';position:absolute;border-radius:50%;background:inherit}
#music-bg .music-cloud::before{width:46%;height:120%;left:14%;bottom:30%}
#music-bg .music-cloud::after{width:34%;height:95%;left:48%;bottom:38%}
#music-bg .music-spark{position:absolute;width:6px;height:6px;margin:-3px;background:#fff;border-radius:2px;transform:rotate(45deg);
  box-shadow:0 0 8px 2px rgba(255,255,255,.7);opacity:0;animation:music-twinkle var(--d) ease-in-out infinite;animation-delay:var(--dl)}
@keyframes music-drift{from{transform:translateX(-30vw)}to{transform:translateX(130vw)}}
@keyframes music-twinkle{0%,100%{opacity:0;scale:.4}50%{opacity:.85;scale:1}}
@keyframes music-glow{50%{opacity:.6;scale:1.08}}

#screen-menu .logo .l1,#screen-menu .logo .l2{position:relative;z-index:1}
#screen-menu .logo em{z-index:3}
#music-ring{position:absolute;left:-12%;top:28%;width:124%;height:44%;border-radius:50%;border:3px dashed rgba(255,255,255,.35);
  transform:rotate(-12deg);z-index:0;pointer-events:none;animation:music-ringIn .7s .45s cubic-bezier(.3,1.5,.5,1) backwards}
#music-orbiter{position:absolute;left:50%;top:50%;width:.36em;height:.36em;margin:-.18em 0 0 -.18em;font-size:inherit;z-index:0;pointer-events:none;
  will-change:transform;filter:drop-shadow(0 3px 0 rgba(20,16,60,.28))}
#music-orbiter svg{width:100%;height:100%;display:block;overflow:visible}

/* entrance */
#screen-menu .logo .l1{animation:music-drop .62s .05s cubic-bezier(.3,1.6,.5,1) backwards}
#screen-menu .logo .l2{animation:music-drop .62s .16s cubic-bezier(.3,1.6,.5,1) backwards}
#screen-menu .logo em{animation:music-emIn .6s .34s cubic-bezier(.3,1.6,.5,1) backwards,wobble 3s .94s ease-in-out infinite}
#screen-menu .menu-wrap>.tagline{animation:music-up .45s .42s ease-out backwards}
#screen-menu .menu-wrap>.stat-row>.stat{animation:music-pop .45s cubic-bezier(.3,1.6,.5,1) backwards}
#screen-menu .menu-wrap>.stat-row>.stat:nth-child(1){animation-delay:.5s}
#screen-menu .menu-wrap>.stat-row>.stat:nth-child(2){animation-delay:.57s}
#screen-menu .menu-wrap>.stat-row>.stat:nth-child(3){animation-delay:.64s}
#screen-menu .menu-wrap>.btn.play{overflow:hidden;animation:music-pop .55s .66s cubic-bezier(.3,1.7,.5,1) backwards,music-breathe 2.2s 1.4s ease-in-out infinite}
#screen-menu .menu-wrap>.btn.play::after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:40%;pointer-events:none;
  background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.45),rgba(255,255,255,0));transform:skewX(-18deg);
  animation:music-shine 3.6s 1.6s ease-in-out infinite}
#screen-menu .menu-wrap>.menu-grid>.btn{animation:music-up .45s cubic-bezier(.3,1.5,.5,1) backwards}
#screen-menu .menu-wrap>.menu-grid>.btn:nth-child(1){animation-delay:.76s}
#screen-menu .menu-wrap>.menu-grid>.btn:nth-child(2){animation-delay:.82s}
#screen-menu .menu-wrap>.menu-grid>.btn:nth-child(3){animation-delay:.88s}
#screen-menu .menu-wrap>.menu-grid>.btn:nth-child(4){animation-delay:.94s}
#screen-menu .menu-wrap>.menu-foot{flex-wrap:wrap;justify-content:center;animation:music-up .4s 1.02s ease-out backwards}
@keyframes music-drop{from{opacity:0;translate:0 -70px;scale:.6}}
@keyframes music-emIn{from{opacity:0;scale:0;rotate:-200deg}}
@keyframes music-up{from{opacity:0;translate:0 22px}}
@keyframes music-pop{from{opacity:0;scale:.5}}
@keyframes music-ringIn{from{opacity:0;scale:.4}}
@keyframes music-breathe{50%{scale:1.045}}
@keyframes music-shine{0%,62%{left:-60%}100%{left:130%}}

/* hover / press polish (menu buttons only) */
#screen-menu .menu-wrap>.btn.play,#screen-menu .menu-wrap>.menu-grid>.btn,#screen-menu .menu-wrap>.menu-foot>.btn{
  transition:transform .09s,box-shadow .09s,filter .15s,scale .2s cubic-bezier(.3,1.6,.5,1)}
#screen-menu .menu-wrap>.menu-grid>.btn:hover{transform:translateY(-3px) rotate(-1deg);filter:brightness(1.08)}
#screen-menu .menu-wrap>.menu-grid>.btn:nth-child(even):hover{transform:translateY(-3px) rotate(1deg)}
#screen-menu .menu-wrap>.menu-grid>.btn:active,#screen-menu .menu-wrap>.menu-foot>.btn:active{transform:translateY(4px) scale(.97)}
#screen-menu .menu-wrap>.btn.play:hover{filter:brightness(1.08) saturate(1.1)}
#screen-menu .menu-wrap>.btn.play:active{transform:translateY(5px) scale(.97)}
#music-toggle.off{opacity:.75}

@media (prefers-reduced-motion: reduce){
  #music-bg .music-cloud,#music-bg .music-spark,#music-bg .music-glow{animation:none}
  #music-bg .music-spark{display:none}
  #music-orbiter{display:none}
  #music-ring,#screen-menu .logo .l1,#screen-menu .logo .l2,#screen-menu .menu-wrap>.tagline,#screen-menu .menu-wrap>.stat-row>.stat,
  #screen-menu .menu-wrap>.btn.play,#screen-menu .menu-wrap>.btn.play::after,#screen-menu .menu-wrap>.menu-grid>.btn,#screen-menu .menu-wrap>.menu-foot{animation:none}
  #screen-menu .logo em{animation:none}
}`;

  // tiny original cartoon nuke, pointing right (+x)
  const NUKE_SVG = '<svg viewBox="-24 -14 48 28" aria-hidden="true">' +
    '<path d="M-26 0 L-36 -3 L-34 0 L-36 3 Z" fill="#ffd23f" opacity=".9"/>' +
    '<path d="M-14 -5 L-21 -12 L-23 -12 L-19 -3 Z M-14 5 L-21 12 L-23 12 L-19 3 Z" fill="#e8475b"/>' +
    '<rect x="-20" y="-3" width="8" height="6" rx="1.5" fill="#e8475b"/>' +
    '<ellipse cx="2" cy="0" rx="17" ry="9.5" fill="#6d8a3a"/>' +
    '<path d="M-3 -9 Q-1 0 -3 9 L3 9.3 Q5 0 3 -9.3 Z" fill="#ffd23f"/>' +
    '<circle cx="0" cy="0" r="3.2" fill="#1f1b4d"/>' +
    '<path d="M0 0 L0 -2.6 M0 0 L2.2 1.3 M0 0 L-2.2 1.3" stroke="#ffd23f" stroke-width="1.4"/>' +
    '<ellipse cx="9" cy="-4" rx="5" ry="2" fill="#fff" opacity=".35"/>' +
    '<path d="M18 -3.5 Q22 0 18 3.5" fill="none" stroke="#1f1b4d" stroke-width="1.5" opacity=".35"/>' +
    '</svg>';

  let orbiter = null, logoEl = null, logoW = 0, logoH = 0, toggleBtn = null;

  function injectStyle() {
    if (document.getElementById('music-style')) return;
    const st = document.createElement('style'); st.id = 'music-style'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function buildMenuDom() {
    const scr = document.getElementById('screen-menu');
    if (!scr) return;
    if (!document.getElementById('music-bg')) {
      const bg = document.createElement('div'); bg.id = 'music-bg'; bg.setAttribute('aria-hidden', 'true');
      let html = '<div class="music-glow"></div>';
      const clouds = [[8, 220, 95], [22, 150, 70], [62, 260, 120], [78, 170, 85], [40, 120, 60]];
      clouds.forEach((c, i) => {
        html += `<div class="music-cloud" style="top:${c[0]}%;--w:${c[1]}px;--d:${c[2]}s;--dl:-${(i * 0.37 % 1 * c[2]).toFixed(1)}s;opacity:${(0.5 + (i % 3) * 0.2).toFixed(2)}"></div>`;
      });
      for (let i = 0; i < 12; i++) {
        html += `<i class="music-spark" style="left:${rnd(4, 96).toFixed(1)}%;top:${rnd(4, 70).toFixed(1)}%;--d:${rnd(2.4, 4.6).toFixed(2)}s;--dl:-${rnd(0, 4).toFixed(2)}s"></i>`;
      }
      bg.innerHTML = html;
      scr.insertBefore(bg, scr.firstChild);
    }
    logoEl = scr.querySelector('.logo');
    if (logoEl && !document.getElementById('music-orbiter')) {
      const ring = document.createElement('div'); ring.id = 'music-ring'; ring.setAttribute('aria-hidden', 'true');
      orbiter = document.createElement('div'); orbiter.id = 'music-orbiter'; orbiter.setAttribute('aria-hidden', 'true');
      orbiter.innerHTML = NUKE_SVG;
      logoEl.appendChild(ring); logoEl.appendChild(orbiter);
    }
    const foot = scr.querySelector('.menu-foot');
    if (foot && !document.getElementById('music-toggle')) {
      toggleBtn = document.createElement('button');
      toggleBtn.id = 'music-toggle'; toggleBtn.className = 'btn tiny ghost'; toggleBtn.type = 'button';
      toggleBtn.addEventListener('click', () => {
        st().on = !st().on; NO.Save.save(); refreshToggle(); unlock();
        if (NO.Audio && NO.Audio.click) NO.Audio.click();
      });
      const mute = document.getElementById('btnMute');
      if (mute && mute.parentNode === foot) foot.insertBefore(toggleBtn, mute.nextSibling); else foot.appendChild(toggleBtn);
    }
    refreshToggle();
    measure();
  }
  function refreshToggle() {
    if (!toggleBtn) return;
    toggleBtn.textContent = st().on ? '🎵 MUSIC ON' : '🎵 MUSIC OFF';
    toggleBtn.classList.toggle('off', !st().on);
    toggleBtn.title = NO.Save.data.muted ? 'Sound is off – turn SOUND on to hear music' : '';
  }
  function measure() {
    if (!logoEl) return;
    logoW = logoEl.offsetWidth; logoH = logoEl.offsetHeight;
  }
  window.addEventListener('resize', measure);

  const TILT = -12 * Math.PI / 180, cT = Math.cos(TILT), sT = Math.sin(TILT);
  function animateOrbiter() {
    if (!orbiter || reduced()) return;
    if (NO.UI.current !== 'menu') return;
    if (!logoW) measure();
    const tm = performance.now() / 1000;
    const a = tm * 1.5;
    const rx = logoW * 0.62, ry = logoH * 0.22;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    const X = x * cT - y * sT, Y = x * sT + y * cT;
    const dx = -Math.sin(a) * rx, dy = Math.cos(a) * ry;
    const hd = Math.atan2(dx * sT + dy * cT, dx * cT - dy * sT) * 180 / Math.PI;
    const depth = Math.sin(a);
    const sc = 0.78 + 0.28 * (depth * 0.5 + 0.5);
    orbiter.style.transform = `translate(${X.toFixed(1)}px,${Y.toFixed(1)}px) rotate(${hd.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
    orbiter.style.zIndex = depth > 0 ? '2' : '0';
  }

  /* ========================================================= REGISTER === */
  injectStyle();
  buildMenuDom();

  NO.Mods.register({
    id: 'music',
    menu() { buildMenuDom(); },
    mode(mode) {
      if (mode === 'aim' && ctx) aimStart = ctx.currentTime;
      if (mode === 'boom') { boomAt = performance.now(); stingBoom(); }
    },
    aim() { intensity = 0; intensityTarget = 0; if (ctx) aimStart = ctx.currentTime; },
    results(S, r) {
      resultsAt = performance.now();
      if (r && r.isRecord && r.prevBest > 0) stingRecord();
    },
    update(S, dt, rawDt) {
      animateOrbiter();
      const m = S.mode;
      let w;
      if (m === 'menu') w = 'menu';
      else if (m === 'aim' || m === 'launch') w = 'aim';
      else if (m === 'flight') w = 'flight';
      else if (m === 'orbit') w = 'orbit';
      else if (m === 'boom') w = 'none';
      else if (m === 'results') w = (performance.now() - resultsAt > 2600) ? 'results' : 'none';
      else w = 'menu';
      want = w;
      if (m === 'flight' && S.bomb) {
        const sp = Math.hypot(S.bomb.vx || 0, S.bomb.vy || 0);
        intensityTarget = Math.min(1, Math.sqrt(sp / 140));
      } else if (m === 'orbit') intensityTarget = 1;
      const k = Math.min(1, (rawDt || dt || 0.016) * (intensityTarget > intensity ? 4 : 1.2));
      intensity += (intensityTarget - intensity) * k;
    },
  });

  // debug handle
  NO.Music = { get section() { return sec; }, get want() { return want; }, get intensity() { return intensity; }, get state() { return ctx ? ctx.state : 'none'; }, get boomAt() { return boomAt; } };
})();
