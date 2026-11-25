// WebAudio synth: every sfx, the per-world soundtrack and the ambience beds are generated, no files.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], hmin: [0, 2, 3, 5, 7, 8, 11], lyd: [0, 2, 4, 6, 7, 9, 11] };
const deg = (sc, d) => { const n = sc.length, o = Math.floor(d / n); return sc[d - o * n] + 12 * o; };
// melody: 8 tokens per bar (8th notes): number = scale degree, '_' = hold, '.' = rest
const parseMel = s => { const tk = s.trim().split(/\s+/); return tk.map((x, i) => { if (x === '_' || x === '.') return null; let len = 1; while (tk[i + len] === '_') len++; return { d: +x, len }; }); };
// bass: 16 chars per bar: 0 root, 3 third, 5 fifth, 7 seventh, 8 octave, '-' hold, '.' rest
const BASS_OFF = { 0: 0, 3: 2, 5: 4, 7: 6, 8: 7 };
const parseSteps = s => [...s].map((c, i) => { if (!(c in BASS_OFF)) return null; let len = 1; while (s[i + len] === '-') len++; return { o: BASS_OFF[c], len }; });
// Song form: 2-bar intro, then a 16-bar cycle A A B B (4 bars each, one chord per bar).
const SONGS = [
  { // 0 Sunny Shores: tropical calypso, steel drums + marimba
    bpm: 112, swing: 0.08, root: 60, scale: 'maj', dly: 0.75, fb: 0.28, rev: 0.25,
    lead: { inst: 'steel', oct: 12, vol: 0.2 },
    chords: [{ inst: 'skank', rh: '..x...x...x...x.', gate: 0.45, oct: 0, vol: 0.05 }],
    bassInst: 'pluckBass', bassOct: -24, bass: '0--5..0-8--5..0.', bassVol: 0.34,
    drums: { k: 'x...x...x...x...', c: '....x.......x...', x: 'x.xxx.xxx.xxx.xx', r: '...x..x....x..x.' },
    drumsB: { k: 'x...x...x...x...', c: '....x.......x...', h: '..x...x...x...x.', x: 'x.xxx.xxx.xxx.xx', t: '..........x..x..' },
    arp: { inst: 'marimba', oct: 12, vol: 0.06, when: 'second' }, fill: 't',
    A: { ch: [0, 4, 5, 3], mel: '2 . 2 4 7 _ 4 . 6 _ 4 . 1 _ 4 . 5 _ 7 5 4 _ 2 . 3 _ 2 1 0 _ _ .' },
    B: { ch: [3, 4, 2, 5], mel: '7 _ 7 8 9 _ 7 . 8 _ 6 . 4 _ 6 8 9 _ 7 . 6 _ 4 . 5 _ _ 4 5 7 9 _' },
    amb: { beach: 0.55, gulls: 1 } },
  { // 1 Golden Hour: warm swung lofi, rhodes + vinyl crackle
    bpm: 84, swing: 0.22, root: 53, scale: 'maj', dly: 0.75, fb: 0.35, rev: 0.35, crackle: true,
    lead: { inst: 'flute', oct: 12, vol: 0.13 },
    chords: [{ inst: 'rhodes', rh: 'x.........x.....', gate: 1, oct: 12, vol: 0.055, sev: true }],
    bassInst: 'sub', bassOct: -12, bass: '0-----.0--5-----', bassVol: 0.36,
    drums: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    drumsB: { k: 'x......x..x..x..', s: '....x.......x...', h: 'x.x.x.x.x.xxx.x.', r: '.......x........' },
    arp: null, fill: 's',
    A: { ch: [1, 4, 0, 5], mel: '4 _ _ 3 2 _ . . 1 _ 2 _ 6 _ _ . 4 _ _ _ 2 _ 0 . 5 _ 4 2 _ _ . .' },
    B: { ch: [3, 2, 1, 4], mel: '7 _ _ 6 5 _ 4 . 4 _ _ 2 4 _ 5 . 3 _ _ 4 3 2 1 . 1 _ _ _ . . -1 .' },
    amb: { beach: 0.35 } },
  { // 2 Neon Night: synthwave, octave saw bass, gated snare, delay lead
    bpm: 104, swing: 0, root: 57, scale: 'min', dly: 0.75, fb: 0.42, rev: 0.45,
    lead: { inst: 'sawLead', oct: 12, vol: 0.11 },
    chords: [{ inst: 'pad', rh: 'x...............', gate: 1, oct: 0, vol: 0.035 }],
    bassInst: 'sawBass', bassOct: -24, bass: '0.8.0.8.0.8.0.8.', bassVol: 0.26,
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
    drumsB: { k: 'x...x...x...x..x', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
    arp: { inst: 'arp', oct: 12, vol: 0.045, when: 'second' }, fill: 's',
    A: { ch: [0, 5, 2, 6], mel: '4 _ _ 4 7 _ 6 _ 5 _ _ 4 2 _ 4 _ 2 _ _ 2 4 _ 7 _ 6 _ _ _ 4 _ 1 _' },
    B: { ch: [3, 5, 6, 6], mel: '7 _ 8 _ 9 _ 7 _ 9 _ _ 8 7 _ 5 _ 8 _ _ 7 6 _ 4 _ 6 _ _ _ 8 _ 9 _' },
    amb: { beach: 0.22, crickets: 1 } },
  { // 3 Storm Coast: tense harmonic minor, ostinato bass, toms, brass
    bpm: 132, swing: 0, root: 50, scale: 'hmin', dly: 0.5, fb: 0.25, rev: 0.4,
    lead: { inst: 'brass', oct: 12, vol: 0.1 },
    chords: [{ inst: 'strings', rh: 'x.......x.......', gate: 1, oct: 0, vol: 0.03 }, { inst: 'stab', rh: 'x.....x.....x...', gate: 0.25, oct: 12, vol: 0.028 }],
    bassInst: 'sawBass', bassOct: -12, bass: '0.00.00.0.00.0.8', bassVol: 0.22,
    drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', t: '..........x..x.x' },
    drumsB: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', t: '..x.......x..x.x' },
    arp: { inst: 'arp', oct: 12, vol: 0.04, when: 'B' }, fill: 't',
    A: { ch: [0, 0, 5, 4], mel: '0 _ _ 2 4 _ _ _ 5 _ 4 _ 2 _ 1 _ 2 _ _ 4 7 _ _ 5 4 _ _ _ 6 _ _ _' },
    B: { ch: [3, 5, 4, 4], mel: '7 _ 5 _ 3 _ 5 _ 9 _ _ 8 7 _ 5 _ 8 _ _ 6 4 _ 6 _ 6 _ _ _ 8 _ 11 _' },
    amb: { rain: 0.6, wind: 0.4, beach: 0.18 } },
  { // 4 Cosmic Shore: lydian, glassy arps, bells, lush pad
    bpm: 92, swing: 0, root: 52, scale: 'lyd', dly: 0.75, fb: 0.5, rev: 0.6,
    lead: { inst: 'bell', oct: 24, vol: 0.09 },
    chords: [{ inst: 'pad', rh: 'x...............', gate: 1, oct: 12, vol: 0.03 }],
    bassInst: 'sub', bassOct: -12, bass: '0-------5-------', bassVol: 0.3,
    drums: { k: 'x.........x.....', h: '....x.......x...' },
    drumsB: { k: 'x.....x...x.....', c: '....x.......x...', h: '..x...x...x...x.' },
    arp: { inst: 'glass', oct: 12, vol: 0.05, when: 'always' }, fill: null,
    A: { ch: [0, 1, 0, 1], mel: '4 _ _ _ 6 _ 7 _ 8 _ _ _ 7 _ 5 _ 4 _ _ 6 4 _ 2 _ 1 _ _ _ _ _ . .' },
    B: { ch: [5, 2, 4, 1], mel: '9 _ _ _ 7 _ 5 _ 8 _ _ _ 6 _ 4 _ 7 _ _ 6 5 _ 4 _ 3 _ _ _ 4 _ _ _' },
    amb: { hum: 0.5, beach: 0.12 } },
];
for (const S of SONGS) { S.A.ev = parseMel(S.A.mel); S.B.ev = parseMel(S.B.mel); S.bassEv = parseSteps(S.bass); }
const ARP = [0, 2, 4, 7, 9, 7, 4, 2];
const MUS_VOL = 0.34;

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.musicOn = true; this.rumble = null;
    this.world = 0; this.intensity = 0; this.intS = 0; this.players = []; this.beds = {}; this.ambMix = {}; this.nextAmb = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = MUS_VOL; this.mus.connect(this.master);
    this.musLP = c.createBiquadFilter(); this.musLP.type = 'lowpass'; this.musLP.frequency.value = 7000; this.musLP.connect(this.mus);
    this.amb = c.createGain(); this.amb.gain.value = 0.3; this.amb.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // shared fx: tempo-synced delay for music, small reverb for music + sfx
    this.musSend = c.createGain();
    this.dly = c.createDelay(2); this.dly.delayTime.value = 0.4;
    this.dlyFb = c.createGain(); this.dlyFb.gain.value = 0.3;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    const dIn = c.createGain(); dIn.gain.value = 0.5;
    this.musSend.connect(dIn); dIn.connect(this.dly); this.dly.connect(dlp); dlp.connect(this.dlyFb); this.dlyFb.connect(this.dly); dlp.connect(this.musLP);
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(2.2);
    this.revMus = c.createGain(); this.revMus.gain.value = 0.1; this.musSend.connect(this.revMus); this.revMus.connect(this.verb);
    this.revSfx = c.createGain(); this.revSfx.gain.value = 0.35; this.revSfx.connect(this.verb);
    this.verb.connect(this.master);
    this.startMusic();
  }
  _impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  // switch the soundtrack + ambience to world i (0..4), crossfading from the current one
  setWorld(i) {
    i = Math.max(0, Math.min(SONGS.length - 1, i | 0));
    const same = i === this.world && this.players.some(p => !p.endAt);
    this.world = i;
    if (!this.ctx || !this.musicTimer || same) return;
    this._startSong(i);
  }
  // 0 = calm, 1 = full tension (wave incoming): adds hats, kicks, arps, crashes, brighter mix
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, +v || 0)); }
  tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0, out = this.sfx, attack = 0.005, lp = 0, rev = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); f.connect(g); } else o.connect(g);
    g.connect(out); if (rev) this._rev(g, rev); o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, { vol = 0.3, freq = 1200, q = 0.8, delay = 0, type = 'bandpass', sweep = 0, out = this.sfx, rev = 0, attack = 0.004 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); if (rev) this._rev(g, rev); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  _rev(g, amt) { const s = this.ctx.createGain(); s.gain.value = amt; g.connect(s); s.connect(this.revSfx); }
  // ---- sfx (names/signatures unchanged)
  grab(r = 0) { // bright rising pickup that grows with rarity
    const b = 523 * Math.pow(2, Math.min(r, 6) / 6);
    [1, 1.26, 1.5].forEach((m, i) => { this.tone(b * m, 0.12, { vol: 0.09, delay: i * 0.05, lp: 4200 }); this.tone(b * m * 2, 0.1, { type: 'triangle', vol: 0.05, delay: i * 0.05 }); });
    this.hiss(0.05, { vol: 0.12, freq: 3000, q: 1 });
    if (r >= 3) this.tone(b * 2, 0.35, { type: 'triangle', vol: 0.12, delay: 0.15, rev: 0.4 });
    if (r >= 5) { this.hiss(0.5, { vol: 0.08, freq: 7000, type: 'highpass', delay: 0.12, rev: 0.5 }); this.tone(b * 3, 0.4, { type: 'sine', vol: 0.08, delay: 0.22, rev: 0.5 }); }
  }
  place() { this.tone(180, 0.12, { type: 'sine', vol: 0.4, slide: -80 }); this.hiss(0.05, { vol: 0.2, freq: 1500 }); this.tone(659, 0.16, { type: 'triangle', vol: 0.18, delay: 0.06 }); this.tone(988, 0.3, { type: 'triangle', vol: 0.14, delay: 0.12, rev: 0.3 }); }
  cash(big = false) {
    this.tone(988, 0.07, { vol: 0.08, lp: 5000 }); this.tone(1319, big ? 0.35 : 0.2, { vol: 0.08, delay: 0.06, lp: 5000 }); this.tone(2637, 0.15, { type: 'sine', vol: 0.04, delay: 0.06 });
    if (big) { [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.07, delay: 0.14 + i * 0.05, rev: 0.4 })); this.hiss(0.4, { vol: 0.05, freq: 9000, type: 'highpass', delay: 0.12 }); }
  }
  buy() { // ka-ching
    this.hiss(0.04, { vol: 0.3, freq: 2500, q: 1.5 }); this.tone(120, 0.08, { type: 'sine', vol: 0.3, slide: -40 });
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.16, { vol: 0.08, delay: 0.04 + i * 0.05, lp: 4000 }));
    this.tone(2093, 0.6, { type: 'sine', vol: 0.09, delay: 0.3, rev: 0.5 }); this.tone(2637, 0.5, { type: 'sine', vol: 0.05, delay: 0.32, rev: 0.5 });
  }
  deny() { this.tone(220, 0.12, { vol: 0.14, type: 'sawtooth', lp: 1200 }); this.tone(165, 0.22, { vol: 0.16, type: 'sawtooth', delay: 0.11, slide: -30, lp: 1000 }); this.tone(82, 0.2, { vol: 0.2, type: 'sine', delay: 0.11 }); }
  jump() { this.tone(260, 0.16, { vol: 0.1, slide: 420, type: 'triangle' }); this.tone(520, 0.1, { vol: 0.035, slide: 600, type: 'square', lp: 2500 }); this.hiss(0.08, { vol: 0.06, freq: 900, sweep: 1500 }); }
  slap() { this.hiss(0.09, { vol: 0.7, freq: 3200, q: 0.5, type: 'highpass' }); this.hiss(0.15, { vol: 0.4, freq: 1200, q: 0.8 }); this.tone(150, 0.12, { vol: 0.45, type: 'sine', slide: -80 }); this.tone(90, 0.08, { vol: 0.2, type: 'square', lp: 400 }); }
  bonk(metal) {
    this.tone(170, 0.16, { type: 'sine', vol: 0.6, slide: -110 }); this.hiss(0.07, { vol: 0.5, freq: 1800, q: 0.7 }); this.tone(90, 0.1, { type: 'square', vol: 0.12, lp: 500 });
    if (metal) [[1180, 0.12], [3257, 0.06], [2140, 0.07], [5300, 0.03]].forEach(([f, v]) => this.tone(f, 0.45, { type: 'sine', vol: v, rev: 0.3 }));
  }
  burn() { this.hiss(1.0, { vol: 0.5, freq: 400, q: 0.3, sweep: 3500 }); this.hiss(0.8, { vol: 0.22, freq: 6000, type: 'highpass', delay: 0.05 }); this.tone(200, 0.6, { type: 'sawtooth', vol: 0.15, slide: -140, lp: 900 }); this.tone(60, 0.5, { type: 'sine', vol: 0.3, slide: -20 }); }
  thunder() {
    this.hiss(0.25, { vol: 0.45, freq: 2500, q: 0.4, type: 'highpass', rev: 0.6 });
    this.hiss(2.8, { vol: 0.8, freq: 320, q: 0.3, sweep: -240, type: 'lowpass', delay: 0.05, rev: 0.4 });
    this.hiss(1.8, { vol: 0.4, freq: 180, q: 0.5, type: 'lowpass', delay: 0.6, attack: 0.2 });
    this.tone(52, 2, { type: 'sine', vol: 0.5, slide: -18, delay: 0.08 });
  }
  fall() { this.tone(900, 1.0, { type: 'triangle', vol: 0.16, slide: -780 }); this.tone(905, 1.0, { type: 'sine', vol: 0.08, slide: -780 }); this.hiss(0.9, { vol: 0.1, freq: 1500, sweep: -1100 }); }
  whoosh() { this.hiss(0.28, { vol: 0.25, freq: 500, q: 1.2, sweep: 2500, attack: 0.06 }); this.hiss(0.2, { vol: 0.08, freq: 4000, type: 'highpass', delay: 0.05 }); }
  splash() {
    this.hiss(0.15, { vol: 0.6, freq: 3000, q: 0.5, type: 'highpass' }); this.hiss(1.3, { vol: 0.7, freq: 1100, q: 0.4, sweep: -800, type: 'lowpass', rev: 0.3 }); this.tone(95, 0.5, { vol: 0.45, type: 'sine', slide: -45 });
    for (let i = 0; i < 5; i++) this.tone(400 + Math.random() * 500, 0.06, { type: 'sine', vol: 0.06, slide: 500, delay: 0.15 + i * 0.07 + Math.random() * 0.04 });
  }
  siren() { for (let i = 0; i < 3; i++) { this.tone(560, 0.38, { vol: 0.12, type: 'sawtooth', slide: 380, delay: i * 0.42, lp: 2400, attack: 0.03 }); this.tone(562, 0.38, { vol: 0.06, type: 'square', slide: 380, delay: i * 0.42, lp: 1500, attack: 0.03 }); } }
  tick() { this.tone(1250, 0.04, { vol: 0.12, type: 'triangle' }); this.hiss(0.02, { vol: 0.08, freq: 4000, q: 2 }); }
  alarm() { for (let i = 0; i < 4; i++) { const f = i % 2 ? 700 : 950; this.tone(f, 0.13, { vol: 0.1, type: 'square', delay: i * 0.14, lp: 3000 }); this.tone(f * 1.01, 0.13, { vol: 0.06, type: 'sawtooth', delay: i * 0.14, lp: 2000 }); } }
  newCreature(r) {
    const base = [392, 440, 494, 523, 587, 659, 784][r] || 440;
    [1, 1.25, 1.5, 2].forEach((m, i) => { this.tone(base * m, 0.24, { vol: 0.11, delay: i * 0.085, type: 'triangle', rev: 0.25 }); this.tone(base * m, 0.12, { vol: 0.04, delay: i * 0.085, type: 'square', lp: 3000 }); });
    this.tone(base * 2, 0.7, { vol: 0.09, delay: 0.34, type: 'sine', rev: 0.5 });
    if (r >= 4) this.hiss(0.6, { vol: 0.07, freq: 8000, type: 'highpass', delay: 0.3, rev: 0.5 });
  }
  safe() { this.tone(660, 0.12, { vol: 0.12, type: 'triangle' }); this.tone(990, 0.25, { vol: 0.12, type: 'triangle', delay: 0.08, rev: 0.3 }); this.tone(1320, 0.3, { vol: 0.05, type: 'sine', delay: 0.14, rev: 0.3 }); }
  // continuous wave rumble, volume follows distance
  setRumble(v) {
    if (!this.ctx) return;
    if (!this.rumble) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
      this.rumble = g;
    }
    this.rumble.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.1);
  }
  // ---- music: per-world songs scheduled ~0.3s ahead, each on its own fader ("deck") for crossfades
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this._startSong(this.world);
    this.musicTimer = setInterval(() => this._tick(), 50);
  }
  _startSong(i) {
    const c = this.ctx, now = c.currentTime, S = SONGS[i], spb = 60 / S.bpm;
    for (const p of this.players) if (!p.endAt) {
      p.endAt = now + 3;
      for (const n of [p.D.g, p.D.sg]) { n.gain.cancelScheduledValues(now); n.gain.setValueAtTime(n.gain.value, now); n.gain.setTargetAtTime(0, now, 0.6); }
    }
    const D = { g: c.createGain(), sg: c.createGain() }; D.g.connect(this.musLP); D.sg.connect(this.musSend);
    for (const n of [D.g, D.sg]) { n.gain.setValueAtTime(0, now); n.gain.setTargetAtTime(1, now + 0.3, 0.5); }
    this.dly.delayTime.setTargetAtTime(S.dly * spb, now, 0.3); this.dlyFb.gain.setTargetAtTime(S.fb, now, 0.3);
    this.revMus.gain.setTargetAtTime(S.rev * MUS_VOL, now, 0.5);
    this.players.push({ S, D, step: 0, dur: spb / 4, next: now + 0.15, endAt: 0 });
    this._ambTo(S.amb);
  }
  _tick() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    this.intS += (this.intensity - this.intS) * 0.08;
    this.mus.gain.setTargetAtTime(MUS_VOL * (0.9 + 0.3 * this.intS), now, 0.2);
    this.musLP.frequency.setTargetAtTime(7000 + 13000 * this.intS, now, 0.2);
    for (const p of this.players) {
      if (p.next < now - 0.15) { const k = Math.ceil((now + 0.05 - p.next) / p.dur); p.step += k; p.next += k * p.dur; } // throttled tab: skip, don't burst
      const until = p.endAt ? Math.min(now + 0.3, p.endAt - 0.6) : now + 0.3;
      while (p.next < until) { if (this.musicOn) this._step(p, p.next); p.step++; p.next += p.dur; }
    }
    this.players = this.players.filter(p => { if (p.endAt && now > p.endAt) { p.D.g.disconnect(); p.D.sg.disconnect(); return false; } return true; });
    if (now > this.nextAmb) this._ambShot(now);
  }
  _step(p, t) {
    const S = p.S, i = p.step, s = i & 15, bar = i >> 4, I = this.intS, D = p.D, dur = p.dur;
    const intro = bar < 2, cyc = intro ? 0 : (bar - 2) % 16, sec = cyc >> 2, bi = cyc & 3;
    const P = sec < 2 ? S.A : S.B, cd = intro ? P.ch[0] : P.ch[bi], sc = SCALES[S.scale];
    const tt = t + (s & 1 ? S.swing * dur : 0);
    // drums
    const dr = (sec >= 2 && S.drumsB) || S.drums, hit = k => !!dr[k] && dr[k][s] === 'x';
    if (hit('k') || (I > 0.6 && !intro && (s & 3) === 0)) this._drum('kick', D, tt, 1);
    if (!intro) {
      if (hit('s')) this._drum('snare', D, tt, 1);
      if (hit('c')) this._drum('clap', D, tt, 1);
      if (hit('r')) this._drum('rim', D, tt, 1);
      if (hit('t')) this._drum('tom', D, tt, 1, s);
      if (hit('o')) this._drum('ohat', D, tt, 1);
      if (hit('x')) this._drum('shaker', D, tt, (s & 3) === 0 ? 1 : 0.6);
      if (s === 0 && (cyc === 0 || (I > 0.55 && bi === 0))) this._drum('crash', D, tt, 0.8);
      if (S.fill && cyc === 15 && s >= 12) this._drum(S.fill === 't' ? 'tom' : 'snare', D, tt, 0.5 + (s - 12) * 0.15, 15 - s);
    }
    if (hit('h')) this._drum('hat', D, tt, (s & 3) === 0 ? 1 : 0.7);
    else if (I > 0.3 && !intro) this._drum('hat', D, tt, 0.3 + 0.4 * I);
    // bass
    const b = S.bassEv[s];
    if (b) this._inst(S.bassInst, D, tt, S.root + S.bassOct + deg(sc, cd + b.o), b.len * dur * 0.92, S.bassVol);
    // chords (voiced close around the layer's centre for smooth voice leading)
    for (const L of S.chords) if (L.rh[s] === 'x') {
      let n = 1; while (s + n < 16 && L.rh[s + n] !== 'x') n++;
      const ctr = S.root + L.oct;
      for (const k of L.sev ? [0, 2, 4, 6] : [0, 2, 4]) {
        let m = ctr + deg(sc, cd + k); while (m >= ctr + 7) m -= 12; while (m < ctr - 5) m += 12;
        this._inst(L.inst, D, tt, m, n * dur * L.gate, L.vol);
      }
    }
    // lead melody (doubled an octave up in the last section or at high intensity)
    if (!intro && !(s & 1)) {
      const e = P.ev[bi * 8 + (s >> 1)];
      if (e) {
        const m = S.root + S.lead.oct + deg(sc, e.d), ln = e.len * 2 * dur * 0.95;
        this._inst(S.lead.inst, D, tt, m, ln, S.lead.vol);
        if (sec === 3 || I > 0.75) this._inst(S.lead.inst, D, tt, m + 12, ln, S.lead.vol * 0.35);
      }
    }
    // arpeggio layer (song signature, or forced on by intensity)
    const A = S.arp, arpOn = !intro && ((A && (A.when === 'always' || (A.when === 'second' && (sec & 1)) || (A.when === 'B' && sec >= 2))) || I > 0.55);
    if (arpOn) this._inst(A ? A.inst : 'pluck', D, tt, S.root + (A ? A.oct : 12) + deg(sc, cd + ARP[s & 7]), dur * 1.5, A ? A.vol : 0.04);
    if (S.crackle && Math.random() < 0.3) this._drum('crackle', D, t + Math.random() * dur, 1);
  }
  // generic voice: 1-2 oscillators -> optional lowpass (with env) -> gain env -> deck (+ fx send)
  _v(D, t, f, dur, { type = 'sine', vol = 0.1, a = 0.004, r = 0.2, pad = false, det = 0, lp = 0, lpEnv = 0, q = 0.7, send = 0 } = {}) {
    const c = this.ctx, g = c.createGain(), n = det ? 2 : 1, oscs = [];
    for (let k = 0; k < n; k++) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; if (det) o.detune.value = k ? det : -det; oscs.push(o); }
    if (lp) {
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q;
      fl.frequency.setValueAtTime(lp * (lpEnv || 1), t); if (lpEnv) fl.frequency.exponentialRampToValueAtTime(lp, t + Math.min(dur, 0.3));
      oscs.forEach(o => o.connect(fl)); fl.connect(g);
    } else oscs.forEach(o => o.connect(g));
    const v = vol / (det ? 1.4 : 1); let end;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a);
    if (pad) { const h = Math.max(a, dur); g.gain.setValueAtTime(v, t + h); g.gain.linearRampToValueAtTime(0, t + h + r); end = t + h + r; }
    else { g.gain.exponentialRampToValueAtTime(0.0005, t + Math.max(dur, a + 0.01)); end = t + Math.max(dur, a + 0.01); }
    g.connect(D.g); if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(D.sg); }
    oscs.forEach(o => { o.start(t); o.stop(end + 0.05); });
  }
  _inst(name, D, t, m, dur, vol) {
    const f = mtof(m), V = (fr, d, o) => this._v(D, t, fr, d, o);
    switch (name) {
      case 'steel': { const d = Math.max(0.3, Math.min(dur, 0.9)); V(f, d, { vol, send: 0.25 }); V(f * 2, d * 0.4, { vol: vol * 0.35 }); V(f * 3.01, 0.12, { vol: vol * 0.15 }); break; }
      case 'marimba': V(f, 0.25, { vol, send: 0.2 }); V(f * 4, 0.05, { vol: vol * 0.2 }); break;
      case 'skank': V(f, dur, { type: 'square', vol, lp: 1800, send: 0.15 }); break;
      case 'pluckBass': V(f, dur, { type: 'triangle', vol }); V(f, dur * 0.5, { type: 'square', vol: vol * 0.25, lp: 600 }); break;
      case 'sub': V(f, dur, { vol, pad: true, a: 0.01, r: 0.08 }); V(f * 2, dur, { type: 'triangle', vol: vol * 0.12, pad: true, a: 0.01, r: 0.08 }); break;
      case 'sawBass': V(f, dur + 0.05, { type: 'sawtooth', vol, lp: 480, lpEnv: 3.5, q: 5 }); break;
      case 'flute': V(f, dur, { type: 'triangle', vol, pad: true, a: 0.04, r: 0.15, lp: 2600, send: 0.35 }); V(f * 2, dur, { vol: vol * 0.15, pad: true, a: 0.05, r: 0.15 }); break;
      case 'rhodes': V(f, Math.max(dur, 1.2), { vol, send: 0.3 }); V(f, dur * 0.6, { type: 'triangle', vol: vol * 0.4, lp: 1500 }); V(f * 4, 0.08, { vol: vol * 0.08 }); break;
      case 'pad': V(f, dur, { type: 'sawtooth', det: 9, vol, lp: 1400, pad: true, a: 0.35, r: 0.7, send: 0.45 }); break;
      case 'strings': V(f, dur, { type: 'sawtooth', det: 10, vol, lp: 1000, pad: true, a: 0.3, r: 0.5, send: 0.4 }); break;
      case 'sawLead': V(f, dur, { type: 'sawtooth', det: 7, vol, lp: 3200, lpEnv: 1.8, q: 2, pad: true, a: 0.01, r: 0.12, send: 0.4 }); break;
      case 'brass': case 'stab': V(f, dur, { type: 'sawtooth', det: 6, vol, lp: 1600, lpEnv: 2, pad: true, a: name === 'stab' ? 0.005 : 0.03, r: 0.15, send: 0.3 }); break;
      case 'bell': V(f, Math.max(dur, 1.2), { vol, send: 0.5 }); V(f * 2.76, 0.4, { vol: vol * 0.3 }); break;
      case 'glass': V(f, 0.35, { vol, send: 0.6 }); V(f * 2, 0.12, { type: 'triangle', vol: vol * 0.3 }); break;
      case 'arp': V(f, Math.max(dur, 0.15), { type: 'square', vol, lp: 2400, lpEnv: 2, send: 0.45 }); break;
      default: V(f, Math.max(dur, 0.2), { type: 'triangle', vol, lp: 3000, send: 0.3 }); // 'pluck'
    }
  }
  _noise(D, t, dur, { type = 'highpass', f = 8000, q = 0.7, vol = 0.1, a = 0.001, send = 0 } = {}) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(fl); fl.connect(g); g.connect(D.g); if (send) { const x = c.createGain(); x.gain.value = send; g.connect(x); x.connect(D.sg); }
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    return g;
  }
  _drum(k, D, t, v = 1, x = 0) {
    const c = this.ctx;
    switch (k) {
      case 'kick': {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.85 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        o.connect(g); g.connect(D.g); o.start(t); o.stop(t + 0.4);
        this._noise(D, t, 0.015, { f: 3000, vol: 0.1 * v }); break;
      }
      case 'snare': this._noise(D, t, 0.2, { type: 'bandpass', f: 1900, q: 0.7, vol: 0.4 * v, send: 0.35 }); this._v(D, t, 200, 0.1, { type: 'triangle', vol: 0.22 * v }); break;
      case 'clap': {
        const g = this._noise(D, t, 0.2, { type: 'bandpass', f: 1300, q: 1.2, vol: 0.35 * v, send: 0.3 });
        g.gain.cancelScheduledValues(t);
        for (const o of [0, 0.011, 0.022]) { g.gain.setValueAtTime(0.35 * v, t + o); g.gain.exponentialRampToValueAtTime(0.04, t + o + 0.009); }
        g.gain.setValueAtTime(0.3 * v, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.2); break;
      }
      case 'hat': this._noise(D, t, 0.045, { f: 8500, vol: 0.1 * v }); break;
      case 'ohat': this._noise(D, t, 0.22, { f: 7500, vol: 0.08 * v, send: 0.2 }); break;
      case 'shaker': this._noise(D, t, 0.07, { type: 'bandpass', f: 6500, q: 1.4, vol: 0.08 * v, a: 0.012 }); break;
      case 'rim': this._v(D, t, 1750, 0.035, { type: 'triangle', vol: 0.15 * v }); this._noise(D, t, 0.02, { type: 'bandpass', f: 3200, q: 2, vol: 0.08 * v }); break;
      case 'tom': {
        const f = [190, 160, 135, 110][x & 3], o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.25);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(D.g); o.start(t); o.stop(t + 0.32); break;
      }
      case 'crash': this._noise(D, t, 1.6, { f: 5000, vol: 0.08 * v, send: 0.4 }); break;
      case 'crackle': this._noise(D, t, 0.006, { type: 'bandpass', f: 2500 + Math.random() * 3000, q: 1, vol: 0.04 }); break;
    }
  }
  // ---- ambience beds: looped noise/osc layers built lazily, crossfaded per world
  _bed(name) {
    if (this.beds[name]) return this.beds[name];
    const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.amb);
    const src = (rate = 1) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * 2); return s; };
    const lfo = (hz, depth, param) => { const o = c.createOscillator(), d = c.createGain(); o.frequency.value = hz; d.gain.value = depth; o.connect(d); d.connect(param); o.start(); };
    const filt = (type, f, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
    const amp = v => { const x = c.createGain(); x.gain.value = v; return x; };
    const chain = (...n) => { for (let k = 0; k < n.length - 1; k++) n[k].connect(n[k + 1]); };
    if (name === 'beach') { // slow surf swells + foam
      const sw = amp(0.55); lfo(0.11, 0.4, sw.gain); chain(src(0.9), filt('lowpass', 520), sw, g);
      const fo = amp(0.1), bp = filt('bandpass', 2200, 0.6); lfo(0.11, 0.08, fo.gain); lfo(0.07, 900, bp.frequency); chain(src(1.1), bp, fo, g);
    } else if (name === 'rain') {
      chain(src(1), filt('highpass', 2400), filt('lowpass', 9000), amp(0.5), g);
      chain(src(0.7), filt('bandpass', 800, 0.5), amp(0.35), g);
    } else if (name === 'wind') {
      const bp = filt('bandpass', 450, 3), k = amp(0.6); lfo(0.06, 250, bp.frequency); lfo(0.09, 0.35, k.gain); chain(src(0.6), bp, k, g);
    } else if (name === 'hum') {
      const lp = filt('lowpass', 500), k = amp(0.3); lfo(0.13, 0.12, k.gain);
      for (const [hz, ty, v] of [[55, 'sine', 1], [55.35, 'sine', 1], [110.4, 'triangle', 0.35], [164.8, 'sine', 0.2]]) { const o = c.createOscillator(); o.type = ty; o.frequency.value = hz; chain(o, amp(v), lp); o.start(); }
      chain(lp, k, g);
      const hf = filt('bandpass', 3000, 4); lfo(0.05, 1500, hf.frequency); chain(src(0.5), hf, amp(0.05), g);
    }
    return (this.beds[name] = g);
  }
  _ambTo(mix) {
    this.ambMix = mix || {};
    const now = this.ctx.currentTime;
    for (const n of ['beach', 'rain', 'wind', 'hum']) {
      const v = this.ambMix[n] || 0;
      if (v > 0 || this.beds[n]) this._bed(n).gain.setTargetAtTime(v, now, 1.0);
    }
    this.nextAmb = now + 2;
  }
  _ambShot(now) { // occasional one-shots: seagulls (beach), crickets (night)
    const m = this.ambMix; this.nextAmb = now + 4 + Math.random() * 8;
    if (m.gulls && Math.random() < 0.7) {
      const n = 1 + Math.floor(Math.random() * 3), f = 1400 + Math.random() * 300;
      for (let k = 0; k < n; k++) { this.tone(f, 0.28, { type: 'triangle', vol: 0.05, slide: -500, delay: k * 0.32, out: this.amb, attack: 0.03 }); this.tone(f * 2, 0.2, { type: 'sine', vol: 0.012, slide: -900, delay: k * 0.32, out: this.amb, attack: 0.03 }); }
    }
    if (m.crickets) {
      this.nextAmb = now + 1.5 + Math.random() * 3;
      for (let k = 0; k < 6; k++) this.tone(4400, 0.035, { type: 'sine', vol: 0.025, delay: k * 0.06 + (k >= 3 ? 0.35 : 0), out: this.amb });
    }
  }
}
