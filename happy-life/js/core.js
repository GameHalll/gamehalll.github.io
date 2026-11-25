'use strict';
// Core: constants, utils, storage, sound effects, music, skins.
window.HL = window.HL || {};
(() => {
const HL = window.HL;
HL.W = 960; HL.H = 540; HL.T = 40;

// ---------------- utils ----------------
HL.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
HL.rnd = (a, b) => a + Math.random() * (b - a);
HL.pick = (arr) => arr[(Math.random() * arr.length) | 0];
HL.hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
HL.overlap = (p, x, y, w, h) => p.x < x + w && p.x + p.w > x && p.y < y + h && p.y + p.h > y;
HL.moveToward = (o, tx, ty, speed, dt) => {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy), s = speed * dt;
  if (d <= s) { o.x = tx; o.y = ty; return true; }
  o.x += (dx / d) * s; o.y += (dy / d) * s; return false;
};
HL.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
HL.cleanName = (s) => (String(s || '').replace(/[^\p{L}\p{N} _\-.!?]/gu, '').trim().slice(0, 14) || 'Dummy');

// ---------------- storage ----------------
HL.store = {
  get(k, def) { try { const v = localStorage.getItem('hl2_' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('hl2_' + k, JSON.stringify(v)); } catch (e) {} },
};
HL.settings = Object.assign({ music: 0.5, sfx: 0.7 }, HL.store.get('settings', {}));
HL.profile = Object.assign({ name: 'Dummy' + (100 + ((Math.random() * 900) | 0)), skin: { color: 0, hat: 0, face: 0 } }, HL.store.get('profile', {}));
HL.saveProfile = () => HL.store.set('profile', HL.profile);
HL.saveSettings = () => HL.store.set('settings', HL.settings);

// ---------------- audio graph ----------------
const A = HL.audio = {
  ctx: null, master: null, music: null, sfx: null, noiseBuf: null, adMuted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.music = ctx.createGain(); this.music.connect(this.master);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      HL.music.resume();
    } catch (e) { this.ctx = null; }
  },
  applyVolumes() {
    if (!this.ctx) return;
    this.music.gain.value = HL.settings.music * 0.35;
    this.sfx.gain.value = HL.settings.sfx;
    this.master.gain.value = this.adMuted ? 0 : 1;
  },
  setAdMuted(m) { this.adMuted = m; this.applyVolumes(); },
  tone(dest, freq, t, dur, type = 'sine', vol = 0.12, slide = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dest, t, dur, vol = 0.15, freq = 1200, type = 'lowpass') {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur);
  },
};

// ---------------- sound effects ----------------
const sfx = (fn) => () => { if (!A.ctx || HL.settings.sfx <= 0) return; fn(A.ctx.currentTime, A.sfx); };
HL.sfx = {
  jump: sfx((t, d) => A.tone(d, 380, t, 0.12, 'square', 0.04, 280)),
  dash: sfx((t, d) => { A.noise(d, t, 0.18, 0.12, 2500, 'bandpass'); A.tone(d, 300, t, 0.15, 'sawtooth', 0.04, 500); }),
  boing: sfx((t, d) => A.tone(d, 180, t, 0.35, 'sine', 0.18, 520)),
  poof: sfx((t, d) => A.noise(d, t, 0.25, 0.12, 900)),
  click: sfx((t, d) => A.tone(d, 900, t, 0.05, 'square', 0.06)),
  ui: sfx((t, d) => { A.tone(d, 660, t, 0.07, 'triangle', 0.08); A.tone(d, 990, t + 0.05, 0.08, 'triangle', 0.06); }),
  airbag: sfx((t, d) => { A.noise(d, t, 0.35, 0.2, 700); A.tone(d, 320, t, 0.25, 'sine', 0.1, -160); }),
  tweet: sfx((t, d) => { A.tone(d, 2200, t, 0.08, 'sine', 0.06, 600); A.tone(d, 2400, t + 0.1, 0.08, 'sine', 0.06, 600); }),
  angel: sfx((t, d) => { A.tone(d, 880, t, 0.5, 'sine', 0.08, 440); A.tone(d, 1320, t + 0.08, 0.5, 'sine', 0.05, 660); }),
  thud: sfx((t, d) => { A.noise(d, t, 0.3, 0.3, 300); A.tone(d, 90, t, 0.3, 'sine', 0.2, -40); }),
  clang: sfx((t, d) => { A.tone(d, 520, t, 0.25, 'square', 0.05); A.tone(d, 780, t, 0.2, 'square', 0.04); }),
  beep: sfx((t, d) => { A.tone(d, 1200, t, 0.08, 'square', 0.05); A.tone(d, 1200, t + 0.12, 0.08, 'square', 0.05); }),
  checkpoint: sfx((t, d) => [523, 659, 784].forEach((f, i) => A.tone(d, f, t + i * 0.07, 0.15, 'triangle', 0.08))),
  count: sfx((t, d) => A.tone(d, 660, t, 0.18, 'triangle', 0.12)),
  go: sfx((t, d) => A.tone(d, 1320, t, 0.4, 'triangle', 0.14)),
  bonk: sfx((t, d) => {
    A.noise(d, t, 0.4, 0.35, 2000); A.tone(d, 220, t, 0.35, 'square', 0.12, -150);
    [523, 659, 784, 1047].forEach((f, i) => A.tone(d, f, t + 0.35 + i * 0.1, 0.18, 'triangle', 0.08));
  }),
  lose: sfx((t, d) => [392, 349, 311, 262].forEach((f, i) => A.tone(d, f, t + i * 0.16, 0.22, 'triangle', 0.08))),
};

// ---------------- music (tiny step sequencer) ----------------
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] ? 1 : 0); };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const parseBars = (s) => s.trim().split('|').map((bar) => bar.trim().split(/\s+/).map((x) => (x === '.' ? null : midi(x))));
const CH = { C: [48, 52, 55], G: [43, 47, 50], Am: [45, 48, 52], F: [41, 45, 48], Dm: [38, 41, 45], Em: [40, 43, 47] };

const TRACKS = {
  menu: {
    bpm: 100,
    chords: ['F', 'C', 'G', 'Am', 'F', 'C', 'Dm', 'G'],
    melody: parseBars(`A4 . C5 . F5 . E5 . | G4 . C5 . E5 . D5 . | B4 . D5 . G5 . D5 . | C5 . E5 . A5 . G5 . |
      F5 . E5 . C5 . A4 . | E5 . D5 . C5 . G4 . | F4 . A4 . D5 . C5 . | B4 . D5 . G4 . . .`),
    lead: 'triangle', leadVol: 0.10, arp: true, drums: 'soft',
  },
  race: {
    bpm: 148,
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
    melody: parseBars(`E5 E5 G5 E5 C5 D5 E5 . | D5 D5 G5 D5 B4 C5 D5 . | C5 C5 E5 C5 A4 B4 C5 E5 | F5 E5 D5 C5 A4 . C5 . |
      E5 E5 G5 E5 C6 . G5 . | B5 A5 G5 D5 G5 . B4 . | A5 G5 F5 E5 D5 C5 A4 C5 | D5 . B4 . G4 . . .`),
    lead: 'square', leadVol: 0.05, arp: false, drums: 'full',
  },
};

HL.RACE_VARIANTS = [{}, { tr: 2, lead: 'triangle', bpm: 156 }, { tr: -3, lead: 'sine', bpm: 138 }, { tr: 5, lead: 'square', bpm: 164 }, { tr: -2, lead: 'sawtooth', bpm: 170 }];
HL.music = {
  name: null, step: 0, next: 0, timer: null, v: {},
  // variant: { tr: semitones, lead: oscillator type, bpm }
  play(name, variant = {}) {
    const key = name + JSON.stringify(variant);
    if (this.key === key && this.timer) return;
    this.key = key; this.name = name; this.v = variant; this.step = 0;
    this.resume();
  },
  resume() {
    if (!A.ctx || !this.name) return;
    this.next = A.ctx.currentTime + 0.08;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 30);
  },
  stop() { this.name = null; clearInterval(this.timer); this.timer = null; },
  tick() {
    const tr = TRACKS[this.name];
    if (!tr || !A.ctx) return;
    const sixteenth = 60 / (this.v.bpm || tr.bpm) / 4;
    if (this.next < A.ctx.currentTime - 0.5) this.next = A.ctx.currentTime + 0.05; // after tab sleep
    while (this.next < A.ctx.currentTime + 0.15) {
      this.playStep(tr, this.step, this.next, sixteenth);
      this.next += sixteenth;
      this.step = (this.step + 1) % (tr.chords.length * 16);
    }
  },
  playStep(tr, step, t, s16) {
    if (HL.settings.music <= 0) return;
    const X = this.v.tr || 0, hz2 = (m) => hz(m + X), lead = this.v.lead || tr.lead;
    const d = A.music, bar = (step / 16) | 0, s = step % 16, chord = CH[tr.chords[bar]];
    // melody on 8ths
    if (s % 2 === 0) {
      const n = tr.melody[bar][s / 2];
      if (n != null) A.tone(d, hz2(n), t, s16 * 1.8, lead, tr.leadVol);
    }
    // bass
    if (tr.drums === 'full') {
      if (s % 2 === 0) A.tone(d, hz2(chord[0] - 12 + (s % 4 === 2 ? 12 : 0)), t, s16 * 1.6, 'triangle', 0.22);
    } else if (s === 0 || s === 8) A.tone(d, hz2(chord[0] - 12), t, s16 * 7, 'triangle', 0.2);
    // arpeggio
    if (tr.arp && s % 2 === 1) A.tone(d, hz2(chord[(s >> 1) % 3] + 12), t, s16 * 1.5, 'sine', 0.05);
    if (tr.drums === 'full' && s % 4 === 2) chord.forEach((m) => A.tone(d, hz2(m + 12), t, s16 * 1.2, 'sawtooth', 0.012));
    // drums
    if (tr.drums === 'full') {
      if (s === 0 || s === 8 || s === 10) A.tone(d, 150, t, 0.12, 'sine', 0.35, -110);
      if (s === 4 || s === 12) A.noise(d, t, 0.12, 0.16, 1800, 'bandpass');
      if (s % 2 === 0) A.noise(d, t, 0.04, 0.05, 7000, 'highpass');
    } else {
      if (s % 4 === 2) A.noise(d, t, 0.03, 0.03, 8000, 'highpass');
      if (s === 0) A.tone(d, 120, t, 0.1, 'sine', 0.15, -70);
    }
  },
};

// ---------------- skins ----------------
HL.SKIN = {
  colors: [
    { name: 'Classic', body: '#ffd43b', limb: '#f2b81d' },
    { name: 'Bubblegum', body: '#ff9ec7', limb: '#f07aae' },
    { name: 'Mint', body: '#8ce99a', limb: '#5fcf73' },
    { name: 'Sky', body: '#74c0fc', limb: '#4dabf7' },
    { name: 'Grape', body: '#c4a3ff', limb: '#a37cf0' },
    { name: 'Tangerine', body: '#ffa94d', limb: '#fd7e14' },
    { name: 'Tomato', body: '#ff6b6b', limb: '#e03131' },
    { name: 'Ghost', body: '#f1f3f5', limb: '#ced4da' },
    { name: 'Midnight', body: '#495057', limb: '#343a40' },
  ],
  hats: ['None', 'Cap', 'Crown', 'Party hat', 'Top hat', 'Flower', 'Headphones', 'Bunny ears', 'Halo'],
  faces: ['Bored', 'Happy', 'Angry', 'Cool', 'Sleepy'],
};
HL.skinColor = (skin) => HL.SKIN.colors[(skin && skin.color) | 0] || HL.SKIN.colors[0];

function circle(ctx, x, y, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
HL.circle = circle;
function rrect(ctx, x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
HL.rrect = rrect;
function marker(ctx, x, y, r) {
  circle(ctx, x, y, r, '#fff');
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, 0, Math.PI / 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, Math.PI, Math.PI * 1.5); ctx.fill();
}

// head at (cx, cy), radius 8.5, facing f (1/-1)
HL.drawHead = (ctx, cx, cy, f, skin, broken) => {
  const col = HL.skinColor(skin), hat = (skin && skin.hat) | 0, face = (skin && skin.face) | 0;
  const line = '#3d3a2a';
  if (hat === 7) { // bunny ears behind head
    for (const dx of [-3.5, 3.5]) { ctx.beginPath(); ctx.ellipse(cx + dx, cy - 13, 2.8, 7, dx * 0.04, 0, 7); ctx.fillStyle = col.body; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.stroke(); }
  }
  circle(ctx, cx, cy, 8.5, col.body, line, 2);
  marker(ctx, cx - f * 3, cy - 1, 3.4);
  ctx.strokeStyle = '#222'; ctx.fillStyle = '#222'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  const e1 = cx + f * 3, e2 = cx + f * 6.5, ey = cy - 1;
  if (broken) {
    for (const ex of [e1, e2]) { ctx.beginPath(); ctx.moveTo(ex - 1.6, ey - 1.6); ctx.lineTo(ex + 1.6, ey + 1.6); ctx.moveTo(ex + 1.6, ey - 1.6); ctx.lineTo(ex - 1.6, ey + 1.6); ctx.stroke(); }
  } else if (face === 3) { // cool shades
    ctx.fillStyle = '#111'; ctx.fillRect(Math.min(e1, e2) - 2.5, ey - 2.4, 8.5, 3.6);
    ctx.beginPath(); ctx.moveTo(cx + f * 3, cy + 4); ctx.lineTo(cx + f * 7, cy + 3); ctx.stroke();
  } else if (face === 4) { // sleepy
    for (const ex of [e1, e2]) { ctx.beginPath(); ctx.moveTo(ex - 1.5, ey); ctx.lineTo(ex + 1.5, ey); ctx.stroke(); }
    circle(ctx, cx + f * 5, cy + 4, 1.3, null, '#222', 1.2);
  } else {
    circle(ctx, e1, ey, 1.4, '#222'); circle(ctx, e2, ey, 1.4, '#222');
    ctx.beginPath();
    if (face === 1) ctx.arc(cx + f * 5, cy + 2.4, 2.6, 0.2, Math.PI - 0.2);
    else if (face === 2) { ctx.arc(cx + f * 5, cy + 5.5, 2.4, Math.PI + 0.3, -0.3); ctx.moveTo(e1 - 1.8, ey - 3.6); ctx.lineTo(e1 + 1.6, ey - 2.2); ctx.moveTo(e2 + 1.8, ey - 3.6); ctx.lineTo(e2 - 1.6, ey - 2.2); }
    else { ctx.moveTo(cx + f * 3, cy + 4); ctx.lineTo(cx + f * 7, cy + 3.4); }
    ctx.stroke();
  }
  // hats
  if (hat === 1) { // cap
    ctx.beginPath(); ctx.arc(cx, cy - 2, 8.8, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#e03131'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.stroke();
    rrect(ctx, f > 0 ? cx + 2 : cx - 14, cy - 4, 12, 3.5, 1.5, '#c92a2a', line, 1.4);
  } else if (hat === 2) { // crown
    ctx.beginPath(); ctx.moveTo(cx - 7, cy - 6); ctx.lineTo(cx - 7, cy - 15); ctx.lineTo(cx - 3.5, cy - 10); ctx.lineTo(cx, cy - 16);
    ctx.lineTo(cx + 3.5, cy - 10); ctx.lineTo(cx + 7, cy - 15); ctx.lineTo(cx + 7, cy - 6); ctx.closePath();
    ctx.fillStyle = '#fcc419'; ctx.fill(); ctx.strokeStyle = '#e67700'; ctx.lineWidth = 1.5; ctx.stroke();
    circle(ctx, cx, cy - 9, 1.6, '#fa5252');
  } else if (hat === 3) { // party hat
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx + 1, cy - 22); ctx.lineTo(cx + 6, cy - 6); ctx.closePath();
    ctx.fillStyle = '#845ef7'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 3.5, cy - 11); ctx.lineTo(cx + 4, cy - 12); ctx.moveTo(cx - 1.3, cy - 16); ctx.lineTo(cx + 2.5, cy - 16.5); ctx.stroke();
    circle(ctx, cx + 1, cy - 22, 2.4, '#ff6b6b');
  } else if (hat === 4) { // top hat
    rrect(ctx, cx - 10, cy - 8, 20, 3, 1.5, '#212529');
    rrect(ctx, cx - 6.5, cy - 21, 13, 14, 1.5, '#212529');
    ctx.fillStyle = '#e03131'; ctx.fillRect(cx - 6.5, cy - 11, 13, 2.5);
  } else if (hat === 5) { // flower
    const fx = cx - f * 5, fy = cy - 8;
    for (let k = 0; k < 5; k++) circle(ctx, fx + Math.cos(k * 1.26) * 3.2, fy + Math.sin(k * 1.26) * 3.2, 2.6, '#ff8fb8');
    circle(ctx, fx, fy, 2, '#ffd43b');
  } else if (hat === 6) { // headphones
    ctx.strokeStyle = '#343a40'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy - 1, 10, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    rrect(ctx, cx - 11.5, cy - 3, 5, 8, 2, '#e64980'); rrect(ctx, cx + 6.5, cy - 3, 5, 8, 2, '#e64980');
  } else if (hat === 8) { // halo
    ctx.strokeStyle = '#fcc419'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(cx, cy - 14, 8, 2.8, 0, 0, 7); ctx.stroke();
  }
};

function limb(ctx, x, y, ang, len) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(ang) * len, y + Math.cos(ang) * len); ctx.stroke(); }

// Draws a dummy whose 24x36 bounding box starts at (x, y).
HL.drawDummy = (ctx, x, y, skin, o = {}) => {
  const col = HL.skinColor(skin), f = o.face || 1, cx = x + 12;
  const ninja = (o.sprint || o.dash) && !o.carried;
  const sw = o.moving ? Math.sin(o.walk || 0) * (ninja ? 1.05 : 0.6) : 0;
  ctx.save(); ctx.lineCap = 'round';
  const lean = o.dash ? 0.6 : 0.42;
  if (ninja) { ctx.translate(cx, y + 36); ctx.rotate(f * lean); ctx.translate(-cx, -(y + 36)); } // lean forward
  const legs = o.dash ? [f * 0.9, -f * 0.6] : [o.air && !ninja ? 0.35 : sw, o.air && !ninja ? -0.25 : -sw];
  // naruto run: arms stretched straight back
  const back = -f * (1.5 - lean + Math.sin((o.walk || 0) * 2) * 0.06); // straight back, a bit down, in world space
  const arms = o.carried ? [2.6, -2.6] : ninja ? [back, back + f * 0.12] : o.air ? [2.5, -2.4] : [-sw * 0.8 + 0.15, sw * 0.8 - 0.15];
  for (const [lw, c] of [[7, '#3d3a2a'], [4.5, col.limb]]) {
    ctx.strokeStyle = c; ctx.lineWidth = lw;
    limb(ctx, cx - 3, y + 26, legs[0], 10); limb(ctx, cx + 3, y + 26, legs[1], 10);
    limb(ctx, cx - 6, y + 16, arms[0], 10); limb(ctx, cx + 6, y + 16, arms[1], 10);
  }
  rrect(ctx, cx - 8, y + 13, 16, 15, 4, col.body, '#3d3a2a', 2);
  marker(ctx, cx, y + 20, 3.6);
  HL.drawHead(ctx, cx, y + 7, f, skin, false);
  ctx.restore();
};
HL.marker = marker;

// ---------------- drawn symbols (no emoji anywhere) ----------------
HL.drawHeart = (ctx, x, y, s, fill, stroke) => {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.7, y - s * 0.2, x - s * 0.8, y - s * 1.5, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.8, y - s * 1.5, x + s * 1.7, y - s * 0.2, x, y + s * 0.9);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
};
// emotes: 0 laugh, 1 angry, 2 wave, 3 broken
HL.EMOTE_NAMES = ['Haha', 'Grr', 'Hi', 'Bonk'];
HL.drawEmote = (ctx, i, x, y, r) => {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ink = '#3d3a2a';
  if (i === 2) { // waving hand
    ctx.translate(x, y); ctx.rotate(Math.sin(performance.now() / 120) * 0.25);
    ctx.fillStyle = '#ffd8a8'; ctx.strokeStyle = ink; ctx.lineWidth = r * 0.14;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(-r * 0.45 + k * r * 0.3, -r * 0.55, r * 0.14, r * 0.38, 0, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(-r * 0.75, r * 0.05, r * 0.14, r * 0.34, -0.9, 0, 7); ctx.fill(); ctx.stroke();
    rrect(ctx, -r * 0.62, -r * 0.4, r * 1.1, r * 1.05, r * 0.35, '#ffd8a8', ink, r * 0.14);
    ctx.strokeStyle = '#74c0fc'; ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.25, -0.6, 0.1); ctx.stroke();
  } else {
    const face = i === 1 ? '#ff8a65' : i === 3 ? '#ffd43b' : '#ffe066';
    circle(ctx, x, y, r, face, ink, r * 0.14);
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = r * 0.14;
    if (i === 0) { // laugh: ^ ^ eyes, open mouth, tears
      for (const dx of [-0.38, 0.38]) { ctx.beginPath(); ctx.moveTo(x + (dx - 0.18) * r, y - 0.18 * r); ctx.lineTo(x + dx * r, y - 0.38 * r); ctx.lineTo(x + (dx + 0.18) * r, y - 0.18 * r); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x - 0.5 * r, y + 0.1 * r); ctx.arc(x, y + 0.1 * r, 0.5 * r, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4dabf7'; for (const dx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + dx * 0.95 * r, y - 0.05 * r, 0.16 * r, 0.26 * r, 0, 0, 7); ctx.fill(); }
    } else if (i === 1) { // angry
      ctx.beginPath(); ctx.moveTo(x - 0.6 * r, y - 0.5 * r); ctx.lineTo(x - 0.15 * r, y - 0.28 * r); ctx.moveTo(x + 0.6 * r, y - 0.5 * r); ctx.lineTo(x + 0.15 * r, y - 0.28 * r); ctx.stroke();
      circle(ctx, x - 0.32 * r, y - 0.08 * r, 0.11 * r, ink); circle(ctx, x + 0.32 * r, y - 0.08 * r, 0.11 * r, ink);
      ctx.beginPath(); ctx.arc(x, y + 0.6 * r, 0.32 * r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else { // broken dummy: X eyes + crack
      for (const dx of [-0.35, 0.35]) { ctx.beginPath(); ctx.moveTo(x + (dx - 0.15) * r, y - 0.32 * r); ctx.lineTo(x + (dx + 0.15) * r, y - 0.02 * r); ctx.moveTo(x + (dx + 0.15) * r, y - 0.32 * r); ctx.lineTo(x + (dx - 0.15) * r, y - 0.02 * r); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x - 0.3 * r, y + 0.4 * r); ctx.lineTo(x + 0.3 * r, y + 0.4 * r); ctx.stroke();
      ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(x + 0.2 * r, y - r); ctx.lineTo(x + 0.05 * r, y - 0.7 * r); ctx.lineTo(x + 0.25 * r, y - 0.55 * r); ctx.stroke();
    }
  }
  ctx.restore();
};
})();
