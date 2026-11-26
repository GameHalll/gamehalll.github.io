/* =========================================================================
   NUKE ORBIT — save.js
   Persistent progress (localStorage, defensive) + tiny WebAudio SFX synth.
   ========================================================================= */
'use strict';

/* ------------------------------ SAVE ---------------------------------- */
NO.Save = (function () {
  const defaults = () => ({
    coins: 0,
    best: 0,
    bestByEnv: {},
    up: { launch: 0, bounce: 0, speed: 0 },
    chars: ['kim', 'general'],
    bombs: ['classic'],
    char: 'kim',
    bomb: 'classic',
    env: 'country',
    envSeen: ['country'],
    launches: 0,
    totalDistance: 0,
    muted: false,
    mods: {},
  });

  let data = defaults();

  function load() {
    try {
      const raw = localStorage.getItem(NO.CONFIG.SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const d = defaults();
        data = Object.assign(d, parsed);
        data.up = Object.assign(d.up, parsed.up || {});
        data.bestByEnv = Object.assign({}, parsed.bestByEnv || {});
        data.mods = (parsed.mods && typeof parsed.mods === 'object') ? parsed.mods : {};
      }
    } catch (e) { data = defaults(); }
    fillUpgrades();
    return data;
  }

  function save() {
    try { localStorage.setItem(NO.CONFIG.SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked: keep playing */ }
  }

  function reset() { data = defaults(); fillUpgrades(); save(); return data; }
  /* upgrades added by mods start at level 0 */
  function fillUpgrades() { for (const u of NO.UPGRADES) if (!(data.up[u.id] >= 0)) data.up[u.id] = 0; }

  return { load, save, reset, get data() { return data; } };
})();

/* ------------------------------ AUDIO --------------------------------- */
NO.Audio = (function () {
  let ctx = null, master = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }

  const muted = () => NO.Save.data.muted;

  function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
    if (!ctx || muted()) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol = 0.3, filterFreq = 1200, filterTo = null, type = 'lowpass') {
    if (!ctx || muted()) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(filterFreq, t0);
    if (filterTo) f.frequency.exponentialRampToValueAtTime(filterTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  return {
    init,
    click: () => tone(660, 0.07, 'square', 0.12),
    buy: () => { tone(523, 0.1, 'square', 0.15); tone(784, 0.18, 'square', 0.15, null, 0.08); tone(1046, 0.25, 'triangle', 0.15, null, 0.16); },
    error: () => tone(160, 0.2, 'sawtooth', 0.15, 90),
    launch: () => { noise(0.5, 0.45, 3000, 300); tone(140, 0.35, 'sawtooth', 0.2, 60); },
    whack: () => { noise(0.12, 0.6, 5000, 800, 'bandpass'); tone(220, 0.12, 'square', 0.25, 80); },
    bounce: (strength) => tone(180 + strength * 260, 0.22, 'sine', Math.min(0.35, 0.08 + strength * 0.3), 90 + strength * 80),
    splash: () => noise(0.35, 0.3, 2500, 400),
    coin: (pitch = 0) => { tone(988 + pitch * 40, 0.06, 'square', 0.08); tone(1318 + pitch * 40, 0.12, 'square', 0.08, null, 0.05); },
    gem: () => { [0, 4, 7, 12].forEach((s, i) => tone(660 * Math.pow(2, s / 12), 0.15, 'triangle', 0.15, null, i * 0.05)); },
    milestone: () => { [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.2, 'square', 0.1, null, i * 0.07)); },
    perfect: () => { tone(880, 0.1, 'triangle', 0.2); tone(1760, 0.2, 'triangle', 0.15, null, 0.07); },
    boom: () => { noise(2.2, 0.9, 900, 60); tone(70, 1.4, 'sine', 0.6, 30); },
    record: () => { [0, 7, 12, 7, 12, 19].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.18, 'square', 0.1, null, i * 0.09)); },
  };
})();
