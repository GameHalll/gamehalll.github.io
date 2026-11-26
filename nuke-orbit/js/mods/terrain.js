/* =========================================================================
   NUKE ORBIT mod: terrain — ground objects on the course surface.
   Spawned per world chunk, themed per environment:
     spring  big extra bounce (trampoline / mushroom / coil / raft / jelly)
     pad     flat boost strip: horizontal speed kick
     ramp    wedge: rolling bombs ride up and get launched, landing bombs get kicked up
     mud     hazard that eats speed (mud / quicksand / snow drift / cement / seaweed / goo)
   Interaction: 'bounce' (landing on it) and 'physics' while rolling.
   ========================================================================= */
'use strict';

(function () {
  const OUT = '#1f1b4d';
  const START_X = 22;            // never place anything before this (launch site)
  const TAU = Math.PI * 2;

  /* ------------------------------ tuning ------------------------------- */
  const T = {
    density0: 0.3, densityK: 1 / 250, densityMax: 0.6,   // chance per chunk
    secondChance: 0.25,                                     // 2nd object in long chunks (far only)
    springMul: 1.8, springAdd: 13, springCapMul: 1.15, springCapAdd: 8, springVx: 1.05,
    springRollVy: 11, springRollK: 0.22, springRollCap: 28,
    padAdd: 8, padK: 0.2, padCap: 30, padHop: 5,
    rampK: 0.66, rampMin: 7, rampMax: 55, rampKeepX: 0.93, rampBounceK: 0.28, rampBounceMax: 22,
    fade: 0.7, maxGood: 6,   // every helpful hit in a run is weaker (x0.7); after maxGood they do nothing -> runs always end
    mudKeepX: 0.8, mudKeepY: 0.5, mudDecel: 10, mudDecelK: 0.6,
  };

  /* --------------------------- world themes ---------------------------- */
  const THEME = {
    country: { spring: ['SPRING!', 'MUSHROOM!'], pad: 'BOOST PAD!', ramp: 'RAMP!',       mud: 'MUD! STUCK!' },
    desert:  { spring: ['SPROING!'],             pad: 'BOOST PAD!', ramp: 'DUNE JUMP!',  mud: 'QUICKSAND!' },
    snow:    { spring: ['ICE BOING!'],           pad: 'ICE SLIDE!', ramp: 'SKI JUMP!',   mud: 'SNOW DRIFT!' },
    city:    { spring: ['TRAMPOLINE!'],          pad: 'BOOST PAD!', ramp: 'SKATE RAMP!', mud: 'WET CEMENT!' },
    ocean:   { spring: ['BOUNCY RAFT!'],         pad: 'TURBO WAVE!', ramp: 'WAVE RAMP!', mud: 'TANGLED!' },
    space:   { spring: ['JELLY JUMP!'],          pad: 'WARP PAD!',  ramp: 'LAUNCH RAIL!', mud: 'GOOED!' },
  };
  const PAD_COL = {
    country: ['#ffd23f', '#ff8f1f'], desert: ['#ff6b35', '#ffd23f'], snow: ['#9fe7ff', '#ffffff'],
    city: ['#ff3fd0', '#7df9ff'], ocean: ['#7df9ff', '#ffffff'], space: ['#b56bff', '#7df9ff'],
  };
  const MUD_COL = {
    country: ['#6b4423', '#8a5a32', '#4e2f17'], desert: ['#d9a35a', '#c78a43', '#b5763a'],
    snow: ['#ffffff', '#dfeafb', '#b9cdee'], city: ['#9a9aa8', '#b8b8c4', '#77778a'],
    ocean: ['#2f8a4a', '#45b360', '#1f6a36'], space: ['#7cff4f', '#b6ff8a', '#3fbf2a'],
  };

  /* ------------------------------ state -------------------------------- */
  let list = [];          // sorted by x
  let cur = 0;            // first object that may still be relevant
  let lastEnd = 0;
  const M = { id: 'terrain', enabled: true, list: () => list, T };

  /* ------------------------------ audio -------------------------------- */
  let actx = null, master = null;
  function audio() {
    if (NO.Save.data.muted) return null;
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = 0.35; master.connect(actx.destination);
      } catch (e) { actx = null; return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, to, delay) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, vol, f0, f1, type) {
    const a = audio(); if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const t0 = a.currentTime;
    const s = a.createBufferSource(); s.buffer = noiseBuf;
    const fl = a.createBiquadFilter(); fl.type = type || 'lowpass';
    fl.frequency.setValueAtTime(f0, t0); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = a.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }
  const SFX = {
    // cartoon "boi-oi-oing": rising sweep with a wobbling tail
    spring() { tone(150, 0.16, 'sine', 0.3, 700); tone(520, 0.14, 'triangle', 0.18, 380, 0.13); tone(460, 0.18, 'triangle', 0.14, 320, 0.24); },
    // zippy arpeggio + whoosh
    pad() { [0, 4, 7, 12, 16].forEach((s, i) => tone(440 * Math.pow(2, s / 12), 0.09, 'square', 0.08, null, i * 0.035)); noise(0.4, 0.22, 600, 5000, 'bandpass'); },
    // clack + rising whoosh
    ramp() { tone(240, 0.08, 'square', 0.15, 120); noise(0.45, 0.25, 400, 3500, 'bandpass'); tone(200, 0.4, 'sawtooth', 0.08, 520, 0.05); },
    // wet squelch going down
    mud() { noise(0.35, 0.4, 900, 150); tone(170, 0.3, 'sawtooth', 0.14, 55); tone(90, 0.25, 'sine', 0.2, 45, 0.08); },
  };

  /* ---------------------------- spawning ------------------------------- */
  function pickType(x) {
    const r = Math.random();
    const hz = x < 90 ? 0.06 : x < 250 ? 0.12 : 0.17;   // hazards rarer near the start
    if (r < hz) return 'mud';
    const g = (r - hz) / (1 - hz);
    return g < 0.42 ? 'spring' : g < 0.74 ? 'pad' : 'ramp';
  }
  function makeObj(type, x) {
    const o = { type, x, w: 3, h: 0, used: false, hitT: -9, seed: Math.random() * 1000, v: 0 };
    if (type === 'spring') { o.w = 2.8; o.v = Math.random() < 0.5 ? 0 : 1; }
    else if (type === 'pad') o.w = 4.2;
    else if (type === 'ramp') { o.w = 3.4; o.h = 1.25; }
    else o.w = 3.5 + Math.random() * 1.8;
    return o;
  }
  function spawn(x0, len) {
    if (x0 + len < START_X) return;
    const p = Math.min(T.densityMax, T.density0 + x0 * T.densityK);
    let n = Math.random() < p ? 1 : 0;
    if (n && len > 35 && x0 > 120 && Math.random() < T.secondChance) n = 2;
    for (let i = 0; i < n; i++) {
      let x = x0 + (i + Math.random() * 0.8) * (len / n);
      x = Math.max(x, START_X, lastEnd + 5);
      if (x > x0 + len) continue;
      const o = makeObj(pickType(x), x);
      list.push(o); lastEnd = x + o.w;
    }
  }

  /* --------------------------- interactions ---------------------------- */
  const api = () => NO.Game.api;
  const R = () => NO.CONFIG.BOMB_RADIUS;
  function label(S, o) {
    const th = THEME[S.env] || THEME.country;
    return o.type === 'spring' ? th.spring[o.v % th.spring.length] : th[o.type];
  }
  function burst(S, o, b) {
    const P = S.particles, cx = b.x;
    if (o.type === 'spring') {
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (0.15 + Math.random() * 0.7), sp = 6 + Math.random() * 10;
        P.push({ k: 'spark', x: cx, y: 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.5 + Math.random() * 0.3, size: 0.14, color: ['#ffd23f', '#fff', '#e8475b'][i % 3] });
      }
      P.push({ k: 'ring', x: cx, y: 0.5, life: 0, max: 0.5, size: 3.5, color: '#ffd23f' });
    } else if (o.type === 'pad') {
      const c = PAD_COL[S.env] || PAD_COL.country;
      for (let i = 0; i < 12; i++) P.push({ k: 'glow', x: cx - Math.random() * 2, y: 0.3 + Math.random() * 0.8, vx: -4 - Math.random() * 6, vy: Math.random() * 2, life: 0, max: 0.5, size: 0.35 + Math.random() * 0.3, color: c[i % 2] });
      for (let i = 0; i < 8; i++) P.push({ k: 'spark', x: cx, y: 0.4, vx: 6 + Math.random() * 10, vy: 2 + Math.random() * 5, life: 0, max: 0.4, size: 0.12, color: c[i % 2] });
    } else if (o.type === 'ramp') {
      for (let i = 0; i < 12; i++) P.push({ k: 'spark', x: cx, y: b.y, vx: (Math.random() - 0.3) * 8, vy: 3 + Math.random() * 8, life: 0, max: 0.45, size: 0.13, color: i % 2 ? '#ffd23f' : '#fff' });
      P.push({ k: 'ring', x: cx, y: b.y, life: 0, max: 0.4, size: 2.5, color: '#fff' });
    } else {
      const c = MUD_COL[S.env] || MUD_COL.country;
      const drop = S.env === 'ocean';
      for (let i = 0; i < 18; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        P.push({ k: drop ? 'drop' : (i % 3 ? 'dust' : 'debris'), x: cx + (Math.random() - 0.5), y: 0.2, vx: dir * (1 + Math.random() * 4), vy: 3 + Math.random() * 7, life: 0, max: 0.8 + Math.random() * 0.4, size: 0.2 + Math.random() * 0.35, color: c[i % 3] });
      }
    }
  }
  function fx(S, o, b, extra) {
    o.hitT = S.t;
    SFX[o.type]();
    burst(S, o, b);
    const good = o.type !== 'mud';
    api().popup(b.x, 3.2 + (extra || 0), label(S, o), good ? '#ffd23f' : '#e8475b', 1.25, true);
    if (good) S.cam.shake = Math.max(S.cam.shake, 0.3);
    else S.cam.shake = Math.max(S.cam.shake, 0.45);
    M.stats[o.type] = (M.stats[o.type] || 0) + 1;
  }
  function inside(o, x, pad) { return x >= o.x - pad && x <= o.x + o.w + pad; }
  function find(x, pad) {
    for (let i = cur; i < list.length; i++) {
      const o = list[i];
      if (o.x - pad > x) return null;
      if (inside(o, x, pad)) return o;
    }
    return null;
  }

  /* helpful objects lose power with every use in a run, so they can never keep the bomb going forever */
  let goodHits = 0;
  function power() { return goodHits >= T.maxGood ? 0 : Math.pow(T.fade, goodHits); }
  function onBounce(S, impact, b) {
    const o = find(b.x, 0.35);
    if (!o || o.used) return;
    const f = o.type === 'mud' ? 1 : power();
    if (f <= 0) return;
    if (o.type !== 'mud') { o.used = true; goodHits++; }
    if (o.type === 'spring') {
      const vy = Math.min(Math.max(b.vy * T.springMul, b.vy + T.springAdd), impact * T.springCapMul + T.springCapAdd);
      b.vy = Math.max(b.vy, b.vy + (vy - b.vy) * f); b.vx *= 1 + (T.springVx - 1) * f; b.squash = 1;
      fx(S, o, b, Math.min(2, impact / 30));
    } else if (o.type === 'pad') {
      b.vx += (T.padAdd + Math.min(b.vx * T.padK, T.padCap)) * f;
      b.vy = Math.max(b.vy, T.padHop * f);
      fx(S, o, b);
    } else if (o.type === 'ramp') {
      b.vy += Math.min(Math.max(3, b.vx * T.rampBounceK), T.rampBounceMax) * f;
      b.y = Math.max(b.y, R() + o.h * Math.min(1, Math.max(0, (b.x - o.x) / o.w)));
      fx(S, o, b);
    } else {
      b.vx *= T.mudKeepX; b.vy *= T.mudKeepY;
      o.used = true;
      fx(S, o, b);
    }
  }

  function onRoll(S, dt, b) {
    const o = find(b.x, Math.max(0.3, b.vx * dt * 1.5));
    if (!o) return;
    if (o.type === 'mud') {
      b.vx = Math.max(0, b.vx - (T.mudDecel + T.mudDecelK * b.vx) * dt);
      if (!o.used) { o.used = true; fx(S, o, b); }
      if (S.particles.length < 700 && Math.random() < 0.25) {
        const c = MUD_COL[S.env] || MUD_COL.country;
        S.particles.push({ k: 'dust', x: b.x, y: 0.15, vx: -1 - Math.random() * 2, vy: 1 + Math.random() * 2, life: 0, max: 0.5, size: 0.25, color: c[0] });
      }
      return;
    }
    if (o.used) return;
    const f = power();
    if (f <= 0) return;
    if (o.type === 'spring') {
      if (Math.abs(b.x - (o.x + o.w / 2)) > o.w * 0.35) return;
      o.used = true; goodHits++;
      b.rolling = false; b.y = R() + 0.35;
      b.vy = Math.min(T.springRollVy + b.vx * T.springRollK, T.springRollCap) * f;
      b.vx *= 1 + (T.springVx - 1) * f; b.squash = 1;
      fx(S, o, b);
    } else if (o.type === 'pad') {
      if (b.x < o.x + 0.4) return;
      o.used = true; goodHits++;
      b.vx += (T.padAdd + Math.min(b.vx * T.padK, T.padCap)) * f;
      b.rolling = false; b.vy = T.padHop * f;
      fx(S, o, b);
    } else if (o.type === 'ramp') {
      const t = (b.x - o.x) / o.w;
      if (t < 0) return;
      if (t < 1) {
        // ride up the slope (loses a bit of speed to gravity)
        b.y = R() + t * o.h;
        b.vx -= api().gravity() * 0.25 * dt;
        return;
      }
      o.used = true; goodHits++;
      b.rolling = false; b.y = R() + o.h;
      b.vy = Math.min(Math.max(b.vx * T.rampK, T.rampMin * f), T.rampMax);
      b.vx *= T.rampKeepX;
      fx(S, o, b);
    }
  }

  /* ------------------------------ drawing ------------------------------ */
  function fs(ctx, fill) { ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU); }
  function chevrons(ctx, x, y, w, h, m, cols, t) {
    const n = 3, step = w / (n + 0.5), phase = (t * 2.2) % 1;
    for (let i = 0; i < n; i++) {
      const cx = x + step * (i + 0.6), a = 0.45 + 0.55 * Math.abs(Math.sin((i / n - phase) * Math.PI));
      ctx.globalAlpha = a; ctx.fillStyle = cols[1];
      ctx.beginPath(); ctx.moveTo(cx - h * 0.35, y + h * 0.18); ctx.lineTo(cx + h * 0.15, y + h * 0.5); ctx.lineTo(cx - h * 0.35, y + h * 0.82);
      ctx.lineTo(cx - h * 0.1, y + h * 0.82); ctx.lineTo(cx + h * 0.4, y + h * 0.5); ctx.lineTo(cx - h * 0.1, y + h * 0.18); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSpring(ctx, S, o, x, gy, m, t, k) {
    const w = o.w * m, env = S.env;
    const press = k > 0 ? Math.sin(k * Math.PI * 3) * k : 0;     // wobble after a hit
    if (env === 'space') {   // alien jelly blob
      const wob = Math.sin(t * 4 + o.seed) * 0.06 + press * 0.3;
      const hh = m * 0.9 * (1 - wob), ww = w * 0.55 * (1 + wob * 0.8);
      ctx.shadowColor = '#9dff8a'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(x, gy, ww, hh, 0, Math.PI, TAU); ctx.closePath(); fs(ctx, '#6bf05a');
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ell(ctx, x - ww * 0.35, gy - hh * 0.6, ww * 0.18, hh * 0.14); ctx.fill();
      ctx.fillStyle = OUT; ell(ctx, x - ww * 0.18, gy - hh * 0.45, m * 0.07, m * 0.11); ctx.fill(); ell(ctx, x + ww * 0.18, gy - hh * 0.45, m * 0.07, m * 0.11); ctx.fill();
      return;
    }
    if (env === 'ocean') {   // inflatable bouncy raft
      const bob = Math.sin(t * 2.5 + o.seed) * m * 0.08, y = gy + bob - press * m * 0.25;
      rrect(ctx, x - w / 2, y - m * 0.55, w, m * 0.65, m * 0.32); fs(ctx, '#e8475b');
      ctx.save(); ctx.clip(); ctx.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - w / 2 + (i + 0.5) * w / 4 - m * 0.12, y - m * 0.6, m * 0.24, m * 0.8);
      ctx.restore(); ctx.stroke();
      rrect(ctx, x - w * 0.36, y - m * 0.68, w * 0.72, m * 0.22, m * 0.1); fs(ctx, '#ffd23f');
      return;
    }
    if (env === 'desert') {  // big coil spring with a plate
      const hh = m * (1.0 - press * 0.45);
      ctx.strokeStyle = '#8d93a8'; ctx.lineWidth = Math.max(2, m * 0.14); ctx.beginPath();
      for (let i = 0; i <= 5; i++) { const yy = gy - (i / 5) * hh; ctx.lineTo(x + (i % 2 ? 1 : -1) * w * 0.22, yy); }
      ctx.stroke();
      ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, m * 0.045);
      rrect(ctx, x - w * 0.34, gy - m * 0.15, w * 0.68, m * 0.18, m * 0.05); fs(ctx, '#6b7186');
      rrect(ctx, x - w * 0.5, gy - hh - m * 0.22, w, m * 0.24, m * 0.1); fs(ctx, '#e8475b');
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - w * 0.4, gy - hh - m * 0.16, w * 0.8, m * 0.06);
      return;
    }
    if ((env === 'country' && o.v === 1) || env === 'snow') {   // springy mushroom (frosty in snow)
      const snow = env === 'snow';
      const sq = press * 0.35, cw = w * 0.55 * (1 + sq * 0.5), ch = m * 0.75 * (1 - sq);
      rrect(ctx, x - m * 0.28, gy - m * 0.75, m * 0.56, m * 0.78, m * 0.2); fs(ctx, snow ? '#e9f2ff' : '#fff3dc');
      const cy = gy - m * 0.7 + sq * m * 0.3;
      ctx.beginPath(); ctx.ellipse(x, cy, cw, ch, 0, Math.PI, TAU); ctx.closePath(); fs(ctx, snow ? '#5fb4ff' : '#e8475b');
      ctx.fillStyle = '#fff';
      [[-0.5, 0.45, 0.16], [0.05, 0.75, 0.2], [0.5, 0.4, 0.14]].forEach(([a, b2, r]) => { ell(ctx, x + a * cw, cy - b2 * ch, r * m, r * m * 0.8); ctx.fill(); });
      if (snow) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(x, cy - ch * 0.85, cw * 0.55, ch * 0.22, 0, Math.PI, TAU); ctx.fill(); }
      return;
    }
    // trampoline (country red / city blue): side view with a little perspective
    const frame = env === 'city' ? '#3a7bd5' : '#e8475b', frame2 = env === 'city' ? '#2a5aa8' : '#b8323f';
    const top = gy - m * 0.95, rx = w * 0.5, ry = m * 0.26;
    ctx.fillStyle = OUT;
    [-0.4, 0.4].forEach((f) => { rrect(ctx, x + f * w - m * 0.09, top, m * 0.18, m * 0.96, m * 0.06); ctx.fill(); });
    rrect(ctx, x - m * 0.09, top, m * 0.18, m * 0.96, m * 0.06); ctx.fill();
    // yellow coil springs hanging under the rim
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(1.5, m * 0.05);
    for (let i = -3; i <= 3; i++) { const sx = x + i * rx * 0.27; ctx.beginPath(); ctx.moveTo(sx, top + ry * 0.6); ctx.lineTo(sx + m * 0.05, top + ry * 0.6 + m * 0.12); ctx.lineTo(sx - m * 0.05, top + ry * 0.6 + m * 0.22); ctx.stroke(); }
    ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, m * 0.05);
    // rim (back + front) and the mat that dips when hit
    ell(ctx, x, top, rx, ry); fs(ctx, frame2);
    const dip = m * press * 0.5;
    ctx.save(); ell(ctx, x, top, rx * 0.9, ry * 0.72); ctx.clip();
    ell(ctx, x, top + dip, rx * 0.9, ry * 0.72); ctx.fillStyle = '#2a2550'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ell(ctx, x - rx * 0.2, top - ry * 0.2 + dip, rx * 0.45, ry * 0.25); ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(3, m * 0.13); ctx.strokeStyle = frame;
    ctx.beginPath(); ctx.ellipse(x, top, rx * 0.95, ry * 0.86, 0, 0.05, Math.PI - 0.05); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, m * 0.05);
    ctx.fillStyle = '#ffd23f'; for (let i = -2; i <= 2; i++) { ell(ctx, x + i * rx * 0.38, top + ry * 0.86 * Math.sqrt(1 - Math.pow(i * 0.38 / 0.95, 2)), m * 0.06, m * 0.06); ctx.fill(); }
  }

  function drawPad(ctx, S, o, x0, gy, m, t, k) {
    const w = o.w * m, env = S.env, c = PAD_COL[env] || PAD_COL.country;
    const bob = env === 'ocean' ? Math.sin(t * 2.5 + o.seed) * m * 0.08 : 0;
    const h = m * 0.42, y = gy - h + m * 0.06 + bob;
    // dark base slab with a glowing strip on top
    rrect(ctx, x0, y, w, h, h * 0.35); fs(ctx, '#2a2550');
    const ih = h * 0.62, iy = y + h * 0.14, ix = x0 + m * 0.14, iw = w - m * 0.28;
    ctx.shadowColor = c[0]; ctx.shadowBlur = 10 + k * 24;
    rrect(ctx, ix, iy, iw, ih, ih * 0.4); ctx.fillStyle = c[0]; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save(); ctx.clip();
    chevrons(ctx, ix, iy, iw, ih, m, env === 'city' || env === 'space' ? ['#2a2550', '#ffffff'] : ['#2a2550', c[1] === '#ffffff' ? '#2a7bd5' : '#ffffff'], t);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(ix, iy, iw, ih * 0.25);
    ctx.restore();
    if (k > 0) { ctx.globalAlpha = k; ctx.fillStyle = '#fff'; rrect(ctx, x0, y, w, h, h * 0.35); ctx.fill(); ctx.globalAlpha = 1; }
  }

  function drawRamp(ctx, S, o, x0, gy, m, t, k) {
    const w = o.w * m, h = o.h * m, env = S.env;
    const bob = env === 'ocean' ? Math.sin(t * 2.5 + o.seed) * m * 0.06 : 0;
    const y = gy + bob;
    const col = { country: ['#c98a4b', '#a86a33'], desert: ['#e8b86a', '#c98a43'], snow: ['#ffffff', '#9fc7f2'], city: ['#8d93a8', '#ff8f1f'], ocean: ['#ffd23f', '#e8475b'], space: ['#b7bccc', '#7df9ff'] }[env] || ['#c98a4b', '#a86a33'];
    if (env === 'ocean') { rrect(ctx, x0 - m * 0.1, y - m * 0.2, w + m * 0.2, m * 0.35, m * 0.15); fs(ctx, '#fff'); }
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y - h); ctx.lineTo(x0 + w, y); ctx.closePath(); fs(ctx, col[0]);
    // stripes / planks along the slope
    ctx.save(); ctx.clip(); ctx.fillStyle = col[1];
    for (let i = 1; i < 5; i++) { const f = i / 5; ctx.fillRect(x0 + w * f - m * 0.07, y - h * f, m * 0.14, h * f + 2); }
    ctx.restore();
    ctx.lineWidth = Math.max(2, m * 0.1); ctx.strokeStyle = env === 'space' ? '#7df9ff' : '#ffd23f';
    ctx.beginPath(); ctx.moveTo(x0 + m * 0.1, y - m * 0.06); ctx.lineTo(x0 + w - m * 0.05, y - h + m * 0.02); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, m * 0.045); ctx.strokeStyle = OUT;
    if (k > 0) { ctx.globalAlpha = k * 0.8; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y - h); ctx.lineTo(x0 + w, y); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
  }

  function drawMud(ctx, S, o, x0, gy, m, t, k) {
    const w = o.w * m, env = S.env, c = MUD_COL[env] || MUD_COL.country;
    const cx = x0 + w / 2, jig = k > 0 ? Math.sin(k * 20) * k * m * 0.06 : 0;
    if (env === 'snow') {   // snow drift mound
      ctx.beginPath(); ctx.moveTo(x0, gy + 1);
      ctx.bezierCurveTo(x0 + w * 0.15, gy - m * 0.9 - jig, x0 + w * 0.45, gy - m * 0.75, cx, gy - m * 0.7);
      ctx.bezierCurveTo(x0 + w * 0.65, gy - m * 0.95 + jig, x0 + w * 0.9, gy - m * 0.5, x0 + w, gy + 1); ctx.closePath();
      fs(ctx, c[0]);
      ctx.save(); ctx.clip(); ctx.fillStyle = c[2]; ell(ctx, cx + w * 0.2, gy + m * 0.1, w * 0.45, m * 0.45); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const sx = x0 + w * (0.25 + i * 0.25); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i + o.seed); ell(ctx, sx, gy - m * 0.75, m * 0.05, m * 0.05); ctx.fill(); }
      ctx.globalAlpha = 1;
      return;
    }
    if (env === 'ocean') {  // floating seaweed tangle
      for (let i = 0; i < 6; i++) {
        const fx = x0 + w * (i + 0.5) / 6, bob = Math.sin(t * 2 + i + o.seed) * m * 0.1;
        ell(ctx, fx, gy + bob, w / 9, m * 0.2); fs(ctx, c[i % 2]);
        ctx.strokeStyle = c[2]; ctx.lineWidth = Math.max(2, m * 0.08);
        ctx.beginPath(); ctx.moveTo(fx, gy + bob); ctx.quadraticCurveTo(fx + Math.sin(t * 3 + i) * m * 0.3, gy - m * 0.4, fx + m * 0.1, gy - m * (0.55 + (i % 3) * 0.12) + bob); ctx.stroke();
        ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, m * 0.045);
      }
      return;
    }
    // flat puddle / bunker sitting in the ground surface
    const ry = m * 0.32;
    ell(ctx, cx, gy + m * 0.05, w / 2 + jig, ry); fs(ctx, c[0]);
    ctx.save(); ell(ctx, cx, gy + m * 0.05, w / 2, ry); ctx.clip();
    ctx.fillStyle = c[2]; ell(ctx, cx + w * 0.12, gy + ry * 0.7, w * 0.45, ry * 0.8); ctx.fill();
    if (env === 'desert') { // quicksand swirl
      ctx.strokeStyle = c[2]; ctx.lineWidth = Math.max(1.5, m * 0.045);
      ctx.beginPath(); for (let a = 0; a < 9; a += 0.3) { const r = a / 9; ctx.lineTo(cx + Math.cos(a + t * 2) * r * w * 0.4, gy + m * 0.05 + Math.sin(a + t * 2) * r * ry * 0.8); } ctx.stroke();
    } else {
      ctx.fillStyle = c[1];
      ell(ctx, cx - w * 0.2, gy - ry * 0.15, w * 0.16, ry * 0.25); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = OUT;
    // bubbles (mud / goo / cement)
    if (env !== 'desert') {
      ctx.fillStyle = c[1];
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.8 + i * 0.37 + o.seed) % 1, bx = x0 + w * (0.25 + i * 0.25);
        const r = m * 0.12 * Math.sin(ph * Math.PI);
        if (r > 1) { ell(ctx, bx, gy - r * 0.6, r, r); ctx.fill(); ctx.stroke(); }
      }
    }
    if (env === 'city') {   // little warning cone + tape
      const px = x0 + w + m * 0.2;
      ctx.beginPath(); ctx.moveTo(px - m * 0.3, gy); ctx.lineTo(px, gy - m * 0.9); ctx.lineTo(px + m * 0.3, gy); ctx.closePath(); fs(ctx, '#ff8f1f');
      ctx.fillStyle = '#fff'; ctx.fillRect(px - m * 0.14, gy - m * 0.5, m * 0.28, m * 0.12);
    }
  }

  function render(ctx, v, S) {
    if (!list.length) return;
    const m = v.ppm, gy = v.sy(0);
    if (gy > v.H + 60) return;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = Math.max(0, cur - 4); i < list.length; i++) {
      const o = list[i];
      const x0 = v.sx(o.x);
      if (x0 > v.W + 40) break;
      if (x0 + o.w * m < -40) continue;
      const k = Math.max(0, 1 - (S.t - o.hitT) / 0.6);
      ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, m * 0.045);
      // soft contact shadow
      if (o.type !== 'mud') { ctx.fillStyle = 'rgba(20,10,60,.18)'; ell(ctx, x0 + o.w * m / 2, gy + 2, o.w * m * 0.52, Math.max(2, m * 0.1)); ctx.fill(); }
      if (o.type === 'spring') drawSpring(ctx, S, o, x0 + o.w * m / 2, gy, m, S.t, k);
      else if (o.type === 'pad') drawPad(ctx, S, o, x0, gy, m, S.t, k);
      else if (o.type === 'ramp') drawRamp(ctx, S, o, x0, gy, m, S.t, k);
      else drawMud(ctx, S, o, x0, gy, m, S.t, k);
    }
    ctx.restore();
  }

  /* ------------------------------ wiring ------------------------------- */
  M.stats = {};
  M.reset = function () { list = []; cur = 0; lastEnd = 0; };
  M.aim = function () { M.stats = {}; goodHits = 0; };
  M.chunk = function (S, x0, len) { if (M.enabled) spawn(x0, len); };
  M.physics = function (S, dt, b) {
    if (!list.length || S.mode !== 'flight') return;
    if (!b.rolling) return;
    while (cur < list.length && list[cur].x + list[cur].w < b.x - 3) cur++;
    onRoll(S, dt, b);
  };
  M.bounce = function (S, impact, b) {
    if (!list.length) return;
    while (cur < list.length && list[cur].x + list[cur].w < b.x - 3) cur++;
    onBounce(S, impact, b);
  };
  M.renderWorld = render;
  M.boom = function () {
    const st = NO.Mods.store('terrain');
    for (const k in M.stats) st[k] = (st[k] || 0) + M.stats[k];
  };

  NO.Mods.register(M);
})();
