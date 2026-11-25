// Procedural sound: pouring, ice clinks, shaking, cash register, room murmur and a jukebox loop.
// Club playlist: the built-in synth mix, CC BY vocal tracks from ccMixter.org and CC0 tracks from OpenGameArt.org
export const PLAYLIST = [
  { title: 'Last Call (house mix)', synth: true },
  // songs with vocals: CC BY 3.0 from ccMixter.org (credited in How it works)
  { title: 'Come Up For Air · SackJo22', file: 'music/come_up_for_air.mp3' },
  { title: "Let's Sing · SackJo22 ft. George Ellinas & Snowflake", file: 'music/lets_sing.mp3' },
  { title: 'Rescue Me · L4M', file: 'music/rescue_me.mp3' },
  { title: 'Lifted Up · Loveshadow', file: 'music/lifted_up.mp3' },
  { title: 'Hang Low · Zep Hurme', file: 'music/hang_low.mp3' },
  { title: 'Burn It Up · shagrugge', file: 'music/burn_it_up.mp3' },
  { title: 'Funky House', file: 'music/funky_house.mp3' },
  { title: 'Cool City', file: 'music/cool_city.mp3' },
  { title: 'Party Sector', file: 'music/party_sector.mp3' },
  { title: 'Funky Disco Beats', file: 'music/funky_disco.mp3' },
  { title: 'Hella Bumps', file: 'music/hella_bumps.mp3' },
  { title: '1-UP Nightclub', file: 'music/nightclub_1up.mp3' },
  { title: 'Lucid Trigger', file: 'music/lucid_trigger.mp3' },
  { title: 'Jumping Cyborg (club mix)', file: 'music/jumping_cyborg.mp3' },
];
// single-file builds may leave some songs out
if (typeof window !== 'undefined' && window.__vfsHas) for (let i = PLAYLIST.length - 1; i > 0; i--) if (PLAYLIST[i].file && !window.__vfsHas(PLAYLIST[i].file)) PLAYLIST.splice(i, 1);
export class Sound {
  constructor() { this.ctx = null; this.music = false; try { this.track = +(localStorage.getItem('lastcall-track') || 0); } catch { this.track = 0; } }
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(c.destination);
    // shared noise buffer
    const len = c.sampleRate * 2; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    // pour channel: noise -> bandpass (gurgle LFO) -> gain
    this.pourSrc = this.loopNoise();
    this.pourBP = c.createBiquadFilter(); this.pourBP.type = 'bandpass'; this.pourBP.frequency.value = 900; this.pourBP.Q.value = 1.2;
    this.pourGain = c.createGain(); this.pourGain.gain.value = 0;
    this.pourSrc.connect(this.pourBP).connect(this.pourGain).connect(this.master);
    const lfo = this.pourLfo = c.createOscillator(); lfo.frequency.value = 7; const lg = this.pourLfoG = c.createGain(); lg.gain.value = 350; lfo.connect(lg).connect(this.pourBP.frequency); lfo.start();
    this.lfo = lfo;
    // shake channel
    this.shakeSrc = this.loopNoise();
    this.shakeHP = c.createBiquadFilter(); this.shakeHP.type = 'highpass'; this.shakeHP.frequency.value = 2500;
    this.shakeGain = c.createGain(); this.shakeGain.gain.value = 0;
    this.shakeSrc.connect(this.shakeHP).connect(this.shakeGain).connect(this.master);
    // room murmur
    const mur = this.loopNoise(); const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const mg = c.createGain(); mg.gain.value = 0.035;
    const mlfo = c.createOscillator(); mlfo.frequency.value = 0.31; const mlg = c.createGain(); mlg.gain.value = 0.015; mlfo.connect(mlg).connect(mg.gain); mlfo.start();
    mur.connect(lp).connect(mg).connect(this.master);
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.master);
    // playlist player: an <audio> element routed through the music bus, with an analyser for beat detection
    this.el = new Audio(); this.el.preload = 'auto'; this.el.crossOrigin = 'anonymous';
    this.trackGain = c.createGain(); this.trackGain.gain.value = 0.75;
    this.an = c.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.2; this.fbuf = new Uint8Array(this.an.frequencyBinCount);
    try { const src = c.createMediaElementSource(this.el); src.connect(this.trackGain).connect(this.musicGain); src.connect(this.an); } catch { /* ignore */ }
    this.el.onended = () => this.next();
    this.ivl = 0.5; this.lastBeat = 0; this.bn = 0; this.eAvg = 0;
    this.playTrack(this.track ?? 0, false);
    this.nextBeat = 0;
  }
  loopNoise() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(); return s; }
  // Every liquid gets its own sound, built from tiny bubble "plips" (rising sine chirps, the way real
  // bubbles ring) on top of a soft stream of noise:
  //  spirit: thin, fast, high trickle · juice: fuller, mid · syrup: slow low glugs
  //  soda: pour + crackling fizz that keeps going after you stop · beer: foamy pour with soft fizz
  // Bubbles get higher as the glass fills, so you can hear it filling up.
  pour(flow, thick = 1, target = 'glass', kind = 'spirit', fill = 0) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime;
    const dt = Math.min(0.1, Math.max(0, now - (this._pt || now))); this._pt = now;
    const on = flow > 0;
    const K = {
      spirit: { stream: [2400, 3.5, 0.18], rate: 70, f: [1100, 2600], d: [0.012, 0.035], amp: 0.05, fizz: 0 },
      juice:  { stream: [800, 1.6, 0.34], rate: 40, f: [420, 1050], d: [0.03, 0.07], amp: 0.07, fizz: 0 },
      syrup:  { stream: [420, 2.0, 0.22], rate: 6, f: [130, 300], d: [0.09, 0.17], amp: 0.22, fizz: 0 },
      soda:   { stream: [1500, 1.6, 0.25], rate: 38, f: [800, 1900], d: [0.02, 0.05], amp: 0.05, fizz: 1 },
      beer:   { stream: [900, 1.2, 0.3], rate: 32, f: [600, 1500], d: [0.03, 0.06], amp: 0.06, fizz: 0.55 },
      mix:    { stream: [1200, 1.5, 0.28], rate: 40, f: [700, 1700], d: [0.025, 0.06], amp: 0.06, fizz: 0 },
    }[kind] || null;
    if (!on || !K) {
      this.pourGain.gain.setTargetAtTime(0, now, 0.04);
      if (this._pouring && this._kind && (this._kind.fizz > 0)) this.fizzTail(this._kind.fizz, this._fill || 0);
      this._pouring = false; this._kind = null; return;
    }
    const f = Math.min(1, flow / 30);
    this._pouring = true; this._kind = K; this._fill = fill;
    // the stream underneath
    const spill = target === 'counter';
    this.pourGain.gain.setTargetAtTime((spill ? 0.3 : K.stream[2]) * (0.35 + 0.65 * f), now, 0.04);
    this.pourBP.frequency.setTargetAtTime(spill ? 380 : K.stream[0] * (1 + fill * 0.6), now, 0.06);
    this.pourBP.Q.setTargetAtTime(K.stream[1], now, 0.05);
    this.pourLfoG.gain.setTargetAtTime(spill ? 120 : K.stream[0] * 0.15, now, 0.05);
    if (spill) return; // splashing on the bar: just the splat stream
    // bubbles
    this._carry = (this._carry || 0) + K.rate * (0.4 + 0.6 * f) * dt;
    const up = 1 + fill * 0.9; // smaller air pocket = higher ring
    while (this._carry >= 1) {
      this._carry -= 1;
      const at = now + Math.random() * dt;
      const f0 = (K.f[0] + Math.random() * (K.f[1] - K.f[0])) * up;
      this.bubble(at, f0, K.d[0] + Math.random() * (K.d[1] - K.d[0]), K.amp * (0.5 + Math.random() * 0.7));
    }
    // fizz crackle while pouring carbonated drinks
    if (K.fizz) { this._fz = (this._fz || 0) + 320 * K.fizz * dt; while (this._fz >= 1) { this._fz -= 1; this.crackle(now + Math.random() * dt, 0.08 * K.fizz * (0.4 + Math.random())); } }
  }
  bubble(t, f0, dur, amp) {
    const c = this.ctx; const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (1.6 + Math.random() * 0.9), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.01);
  }
  crackle(t, amp) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise;
    if (!this._hp) { this._hp = c.createBiquadFilter(); this._hp.type = 'highpass'; this._hp.frequency.value = 4200; this._hp.connect(this.master); }
    const g = c.createGain(); g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
    s.connect(g).connect(this._hp); s.start(t, Math.random() * 1.5, 0.008);
  }
  // after the pour stops, a soda keeps fizzing for a second or two
  fizzTail(level, fill) {
    const now = this.ctx.currentTime;
    for (let i = 0; i < 260 * level; i++) { const k = Math.pow(Math.random(), 1.6) * 2.6; this.crackle(now + k, 0.075 * level * (1 - k / 2.8) * (0.4 + Math.random())); }
    for (let i = 0; i < 10 * level; i++) { const k = Math.random() * 1.2; this.bubble(now + k, (1500 + Math.random() * 1500) * (1 + fill), 0.02, 0.02); }
  }
  shake(on) { if (!this.ctx) return; this.shakeGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.03); }
  clink(pitch = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    for (const f of [2400, 3700, 5200]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * pitch * (0.95 + Math.random() * 0.1);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 + Math.random() * 0.1);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.4);
    }
  }
  thud(v = 0.2) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
  }
  splash() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    const g = c.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.35);
  }
  register() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [[1568, 0], [2093, 0.09]].forEach(([f, d]) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.15, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
      o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.7);
    });
    const s = c.createBufferSource(); s.buffer = this.noise; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.12, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    s.connect(hp).connect(g2).connect(this.master); s.start(t); s.stop(t + 0.2);
  }
  sad() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [[392, 0], [311, 0.18]].forEach(([f, d]) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4); o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.5); });
  }
  ding() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 1320;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.55);
  }
  // nailed pour: quick bright arpeggio with a little shimmer
  perfect() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [1047, 1319, 1568, 2093].forEach((f, i) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = c.createGain(); const d = i * 0.055; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35); o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.4); });
    const n = c.createBufferSource(); const b = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate); const ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    n.buffer = b; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; const g = c.createGain(); g.gain.value = 0.05; n.connect(hp).connect(g).connect(this.master); n.start(t + 0.1);
  }
  good() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [988, 1319].forEach((f, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); const d = i * 0.07; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.14, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3); o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.35); });
  }
  // short two-blip warning
  warn() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [[880, 0], [660, 0.12]].forEach(([f, d]) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.1); o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.12); });
  }
  cheer() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = c.createGain(); const d = i * 0.08; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.14, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45); o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.5); });
  }
  setMusic(on, loud = false) {
    this.music = on; this.loud = loud;
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on ? (this.vol ?? 0.7) * (loud ? 0.42 : 0.32) : 0, this.ctx.currentTime, 0.4);
    if (this.el && !this.useSynth) { if (on) this.el.play().catch(() => {}); else this.el.pause(); }
  }
  // ---- playlist
  playTrack(i, announce = true) {
    this.track = ((i % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    try { localStorage.setItem('lastcall-track', String(this.track)); } catch { /* ignore */ }
    const tr = PLAYLIST[this.track];
    if (this.onTrack) this.onTrack(tr.title, announce);
    if (!this.ctx) return;
    if (tr.synth) { this.useSynth = true; this.el.pause(); this.t0 = 0; return; }
    this.useSynth = false; this.el.src = window.__vfsURL ? window.__vfsURL(tr.file) : tr.file; this.bn = 0; this.lastBeat = this.ctx.currentTime; this.ivl = 0.5;
    if (this.music) this.el.play().catch(() => {});
  }
  next() { this.playTrack((this.track ?? 0) + 1); }
  prev() { this.playTrack((this.track ?? 0) - 1); }
  // find kicks in the low end so lights and dancers follow whatever song is on
  detect() {
    if (this.useSynth || !this.an) return;
    const now = this.ctx.currentTime;
    this.an.getByteFrequencyData(this.fbuf);
    let e = 0; for (let i = 1; i < 5; i++) e += this.fbuf[i]; e /= 4 * 255;
    const since = now - this.lastBeat;
    if (e > this.eAvg * 1.18 + 0.03 && since > this.ivl * 0.62 && !this.el.paused) {
      if (since < 1.1) this.ivl = this.ivl * 0.85 + Math.min(0.8, Math.max(0.36, since)) * 0.15;
      this.lastBeat = now; this.bn++;
    } else if (since > this.ivl * 1.05) { this.lastBeat += this.ivl; this.bn++; } // keep time through quiet parts
    this.eAvg = this.eAvg * 0.92 + e * 0.08;
  }
  setVolume(v) { this.vol = v; this.setMusic(this.music, this.loud); }
  // platform mute (CrazyGames) always wins over in-game volume
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05); }
  // which beat we're on (0..1 phase) and which song section, for syncing lights and dancers
  beat() {
    if (this.ctx && !this.useSynth && this.el) {
      const ph = Math.min(0.999, Math.max(0, (this.ctx.currentTime - this.lastBeat) / this.ivl));
      return { n: this.bn, ph, part: Math.floor(this.bn / 16) % 4 };
    }
    const bpm = 118;
    const t = this.ctx && this.music && this.t0 ? this.ctx.currentTime - this.t0 : performance.now() / 1000;
    const b = Math.max(0, t) / (60 / bpm); const n = Math.floor(b);
    return { n, ph: b - n, part: Math.floor(n / 16) % 4 };
  }
  // upbeat pop song at 118 BPM: I–V–vi–IV, verse → pre-chorus build → two choruses with a hook
  tick() {
    if (!this.ctx || !this.music) return;
    if (!this.useSynth) { this.detect(); return; }
    const c = this.ctx, spb = 60 / 118, s16 = spb / 4;
    if (!this.t0) { this.t0 = c.currentTime + 0.1; this.next16 = this.t0; this.step = 0; }
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const chords = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]]; // C G Am F
    const roots = [36, 43, 45, 41];
    const out = this.musicGain;
    const tone = (type, f, t, len, vol, opt = {}) => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (opt.slideTo) o.frequency.exponentialRampToValueAtTime(opt.slideTo, t + (opt.slideT || 0.1));
      if (opt.vib) { const l = c.createOscillator(); l.frequency.value = 5.5; const lg = c.createGain(); lg.gain.value = f * 0.012; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + len + 0.1); }
      if (opt.detune) o.detune.value = opt.detune;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (opt.att || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      let node = o;
      if (opt.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = opt.lp; o.connect(f2); node = f2; }
      node.connect(g).connect(out); o.start(t); o.stop(t + len + 0.05);
    };
    const noise = (t, len, vol, type, freq, q = 0.7) => {
      const n = c.createBufferSource(); n.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      n.connect(f).connect(g).connect(out); n.start(t, Math.random()); n.stop(t + len + 0.02);
    };
    // chorus hook (8th-note grid over 2 bars), then answered an octave up in chorus 2
    const hook = [[0, 76], [2, 79], [4, 76], [6, 74], [8, 72], [12, 74], [14, 74], [16, 74], [18, 71], [20, 67], [24, 72], [26, 76], [28, 81], [30, 79]];
    const hookB = [[0, 77], [2, 76], [4, 74], [6, 72], [8, 74], [10, 76], [12, 72], [16, 79], [18, 79], [20, 76], [22, 74], [24, 72]];
    while (this.next16 < c.currentTime + 0.25) {
      const t = this.next16, st = this.step % 16, bar = Math.floor(this.step / 16) % 4, part = Math.floor(this.step / 64) % 4;
      const inBar2 = Math.floor(this.step / 16) % 2;
      // drums
      if (st % 4 === 0 && !(part === 1 && bar === 3 && st > 8)) tone('sine', 150, t, 0.28, 0.9, { slideTo: 48, slideT: 0.11 });
      if (st === 4 || st === 12) { noise(t, 0.16, part >= 2 ? 0.55 : 0.4, 'bandpass', 1800, 0.9); tone('triangle', 220, t, 0.08, 0.15); }
      if (st % 2 === 0) noise(t, st % 4 === 2 ? 0.09 : 0.035, st % 4 === 2 ? 0.18 : 0.08, 'highpass', 9000);
      if (part === 1 && bar === 3) { // snare roll + riser into the chorus
        const rate = st < 8 ? 2 : 1; if (st % rate === 0) noise(t, 0.08, 0.15 + st * 0.02, 'bandpass', 1600 + st * 120, 1);
        if (st === 0) { const n = c.createBufferSource(); n.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + spb * 4); const g = c.createGain(); g.gain.setValueAtTime(0.02, t); g.gain.linearRampToValueAtTime(0.18, t + spb * 4); n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + spb * 4); }
      }
      // bouncy octave bass on 8ths
      if (st % 2 === 0) tone('square', hz(roots[bar] + (st % 4 === 2 ? 12 : 0)), t, s16 * 1.7, part >= 2 ? 0.16 : 0.12, { lp: 700 });
      // bright plucked arpeggio
      if (part !== 1 || st % 2 === 0) { const ch = chords[bar]; tone('triangle', hz(ch[st % 3] + 12 + (st % 6 >= 3 ? 12 : 0)), t, 0.18, 0.05); }
      // pad on the chorus, stabs on the pre-chorus
      if (part >= 2 && st === 0) for (const m of chords[bar]) for (const d of [-8, 8]) tone('sawtooth', hz(m), t, spb * 4, 0.022, { att: 0.08, lp: 2200, detune: d });
      if (part === 1 && (st === 0 || st === 6 || st === 12)) for (const m of chords[bar]) tone('sawtooth', hz(m + 12), t, 0.2, 0.03, { lp: 3000 });
      // the hook
      if (part >= 2) {
        const pos = inBar2 * 16 + st; const seq = part === 2 ? hook : hookB;
        const hit = seq.find(([p]) => p === pos);
        if (hit) { const m = hit[1] + (part === 3 && bar >= 2 ? 0 : 0); tone('square', hz(m), t, s16 * 3.2, 0.055, { vib: true, lp: 3800 }); tone('triangle', hz(m - 12), t, s16 * 3.2, 0.04); }
      }
      // little vocal-chop answer in the verse
      if (part === 0 && bar % 2 === 1 && (st === 10 || st === 12 || st === 14)) tone('square', hz([72, 74, 76][(st - 10) / 2]), t, 0.12, 0.035, { lp: 2500, vib: true });
      this.next16 += s16; this.step++;
    }
  }
}
