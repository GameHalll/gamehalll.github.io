/* =========================================================================
   NUKE ORBIT mod: hoops
   Floating hoops & glowing rings along the flight path. Fly through them for
   a swish, a small forward kick and coins; chain them without touching the
   ground for a combo multiplier. Clipping the rim deflects the bomb a bit.
   ========================================================================= */
'use strict';

(function () {
  const C = NO.CONFIG;
  const R_BOMB = C.BOMB_RADIUS;
  const RIM = 0.2;                  // rim tube radius (m)
  const MIN_X = 14;                 // no rings right at the launch site
  const COMBO_CAP = 6;              // multiplier cap
  const KICK = 0.025;               // +2.5% forward speed per pass (hoop +3.5%)

  let rings = [];                   // sorted by x
  let pending = [];                 // chunks generated before launch
  let lastX = -1e9;                   // x of the last spawned ring
  let combo = 0, comboPop = 0, comboShowT = 0, bestRun = 0, passes = 0;
  let hudCombo = 0;                 // combo value shown (keeps last value while fading out)

  /* ------------------------------- audio -------------------------------- */
  let ac = null, out = null;
  function audio() {
    if (NO.Save.data.muted) return null;
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        out = ac.createGain(); out.gain.value = 0.45; out.connect(ac.destination);
      } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f, dur, type, vol, delay, slide) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  let noiseBuf = null;
  function whoosh(dur, vol, f0, f1) {
    const a = audio(); if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.5), a.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const t0 = a.currentTime;
    const src = a.createBufferSource(); src.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t0); src.stop(t0 + dur + 0.05);
  }
  function sfxSwish(kind, c, perfect) {
    whoosh(0.28, 0.5, 2200, 6500);
    const base = kind === 'hoop' ? 784 : 659;
    const st = Math.pow(2, Math.min(c - 1, 10) / 12 * 2);      // rises a whole tone per combo step
    tone(base * st, 0.16, 'triangle', 0.2, 0.03);
    tone(base * st * 1.5, 0.28, 'triangle', 0.16, 0.09);
    if (perfect) tone(base * st * 2, 0.35, 'sine', 0.14, 0.16);
  }
  function sfxRim() {
    tone(420, 0.18, 'square', 0.09, 0, 300);
    tone(1260, 0.12, 'triangle', 0.08, 0.01);
    whoosh(0.08, 0.25, 3000, 1500);
  }

  /* --------------------------- path prediction -------------------------- */
  // Coarse copy of game.js physics: returns {y, vx, vy} where the bomb is
  // expected to be at world x = tx, or null if it will be rolling/stopped.
  function predict(S, tx) {
    const b = S.bomb, P = S.phys; if (!b || !P) return null;
    const g = NO.Game.api.gravity(), dt = 1 / 60, d = Math.exp(-P.drag * dt);
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
    if (b.rolling || vx <= 0.5) return null;
    for (let i = 0; i < 6000; i++) {
      vy -= g * dt; vx *= d; vy *= d;
      const nx = x + vx * dt, ny = y + vy * dt;
      if (nx >= tx) {
        const k = (tx - x) / (nx - x);
        return { y: y + (ny - y) * k, vx, vy };
      }
      x = nx; y = ny;
      if (y <= R_BOMB) {
        y = R_BOMB; vy = -vy * P.restitution; vx *= P.keepX;
        if (vy < C.MIN_BOUNCE_VY) return null;
      }
    }
    return null;
  }

  /* ------------------------------ spawning ------------------------------ */
  function makeRing(x, y, kind, tilt, scale) {
    const r = scale * (kind === 'hoop' ? 1 : 1.45);
    return { x, y, r, kind, tilt, nx: Math.cos(tilt), ny: Math.sin(tilt), ph: Math.random() * 6,
      passed: false, passT: 0, wob: 0, rimCd: 0, rimmed: false, net: 0, dead: false };
  }

  function spawnChunk(S, x0, len, apex) {
    if (x0 + len < MIN_X) return;
    const gap = Math.max(18, Math.min(90, apex * 1.4));
    if (x0 + len - lastX < gap) return;
    if (Math.random() > 0.6) return;
    const tx = Math.max(x0, MIN_X, lastX + gap) + Math.random() * Math.max(4, len * 0.6);
    const p = predict(S, tx);
    if (!p || p.y < 1.4) return;
    const scale = Math.min(4, Math.max(1.3, 1.25 + apex * 0.035));
    const chain = Math.random() < 0.22 ? 2 + (Math.random() < 0.4 ? 1 : 0) : 1;
    const kind = chain > 1 ? 'ring' : (Math.random() < 0.55 ? 'hoop' : 'ring');
    // offset from the predicted path: sometimes dead on, sometimes needs a nudge
    const spread = scale * 1.5 + p.y * 0.12;
    let off = (Math.random() + Math.random() - 1) * spread * (chain > 1 ? 0.7 : 1.2);
    const ang = Math.atan2(p.vy, p.vx);
    let cx = tx;
    for (let i = 0; i < chain; i++) {
      const pi = i === 0 ? p : predict(S, cx);
      if (!pi) break;
      const r = makeRing(cx, 0, kind, 0, scale);
      r.y = Math.max(r.r + 0.8, pi.y + off);
      const a = Math.atan2(pi.vy, pi.vx) * 0.75 + (Math.random() - 0.5) * 0.25;
      r.tilt = Math.max(-0.75, Math.min(0.6, i === 0 ? ang * 0.75 : a));
      r.nx = Math.cos(r.tilt); r.ny = Math.sin(r.tilt);
      rings.push(r); lastX = cx;
      cx += Math.max(7, Math.min(22, pi.vx * 0.12)) + r.r;
    }
  }

  /* ------------------------------ scoring ------------------------------- */
  function onPass(S, ring, lateral, b) {
    ring.passed = true; ring.passT = 0; ring.net = 1;
    combo++; comboPop = 1; comboShowT = 1.2; hudCombo = combo;
    bestRun = Math.max(bestRun, combo);
    const perfect = Math.abs(lateral) < ring.r * 0.28;
    const mult = Math.min(combo, COMBO_CAP);
    const base = ring.kind === 'hoop' ? 8 : 5;
    const coins = Math.round(base * mult * (perfect ? 1.5 : 1));
    const api = NO.Game.api;
    api.addCoins(coins, 'Hoops');
    // forward kick (never pushes a pre-apex bomb past the orbit threshold)
    const k = (ring.kind === 'hoop' ? KICK + 0.01 : KICK) / (1 + passes * 0.3);   // diminishing per run
    passes++;
    let nvx = b.vx * (1 + k) + 0.3;
    if (!S.run.apexChecked && b.bounces === 0 && b.vx < C.ORBIT_VX && nvx >= C.ORBIT_VX) nvx = Math.max(b.vx, C.ORBIT_VX - 1);
    b.vx = nvx;
    const st = NO.Mods.store('hoops');
    st.total = (st.total || 0) + 1;
    if (combo > (st.bestCombo || 0)) st.bestCombo = combo;
    // feedback
    const words = ring.kind === 'hoop' ? ['SWISH!', 'NOTHING BUT NET!', 'SWISH!', 'BUCKET!'] : ['RING!', 'THREADED!', 'ZOOM!', 'NICE!'];
    let txt = ring.rimmed ? 'RIM SHOT!' : perfect ? (ring.kind === 'hoop' ? 'PERFECT SWISH!' : 'BULLSEYE!') : words[(combo + (ring.kind === 'hoop' ? 0 : 1)) % words.length];
    api.popup(ring.x, ring.y + ring.r + 1.2, txt, ring.kind === 'hoop' ? '#ff9a3c' : '#ffd23f', perfect ? 1.35 : 1.15, true);
    api.popup(ring.x + 1.5, ring.y + ring.r + 2.9, (combo > 1 ? 'x' + Math.min(combo, COMBO_CAP) + ' ' : '') + '+' + coins, combo > 1 ? '#e8475b' : '#fff', 0.85 + Math.min(combo, 6) * 0.06, true);
    sfxSwish(ring.kind, combo, perfect);
    S.cam.shake = Math.max(S.cam.shake, 0.12 + Math.min(combo, 6) * 0.03);
    // burst: sparks around the rim
    const col = ring.kind === 'hoop' ? ['#ff9a3c', '#ffd23f', '#fff'] : ['#ffd23f', '#fff3b0', '#7df9ff'];
    const tx = -ring.ny, ty = ring.nx;
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
      const px = ring.x + tx * ring.r * s + ring.nx * ring.r * 0.3 * c, py = ring.y + ty * ring.r * s + ring.ny * ring.r * 0.3 * c;
      const sp = 4 + Math.random() * 5;
      S.particles.push({ k: 'spark', x: px, y: py, vx: tx * s * sp + b.vx * 0.35, vy: ty * s * sp + 2, life: 0, max: 0.45 + Math.random() * 0.25, size: 0.12 + Math.random() * 0.08, color: col[i % 3] });
    }
    // a few coins fly to the HUD
    const v = api.view();
    for (let i = 0; i < Math.min(5, 1 + Math.floor(coins / 6)); i++) S.flyers.push({ x: v.sx(ring.x) + (Math.random() - 0.5) * 30, y: v.sy(ring.y) + (Math.random() - 0.5) * 30, t: -i * 0.06, gem: false });
  }

  function onRim(S, ring, px, py, b) {
    // push the bomb away from the rim point, mostly perpendicular to the ring's axis
    let dx = b.x - px, dy = b.y - py; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const vn = b.vx * dx + b.vy * dy;
    if (vn >= 0) return false;
    const ovx = b.vx, osp = Math.hypot(b.vx, b.vy);
    b.vx -= 1.35 * vn * dx; b.vy -= 1.35 * vn * dy;
    // never stop or reverse it: keep most of the forward speed, lose a little overall
    if (b.vx < ovx * 0.9) b.vx = ovx * 0.9;
    const cap = osp * 0.97;
    if (b.vx * b.vx + b.vy * b.vy > cap * cap) {
      if (b.vx > cap) b.vx = cap;
      b.vy = (b.vy < 0 ? -1 : 1) * Math.sqrt(Math.max(0, cap * cap - b.vx * b.vx));
    }
    b.x = px + dx * (R_BOMB + RIM + 0.02); b.y = Math.max(R_BOMB + 0.01, py + dy * (R_BOMB + RIM + 0.02));
    ring.wob = 1; ring.rimCd = 0.25; ring.rimmed = true;
    sfxRim();
    NO.Game.api.popup(px, py + 1, ['CLANK!', 'RIM!', 'DOINK!'][Math.floor(Math.random() * 3)], '#fff', 0.8, true);
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 4;
      S.particles.push({ k: 'spark', x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.3, size: 0.1, color: i % 2 ? '#fff' : '#ff9a3c' });
    }
    S.cam.shake = Math.max(S.cam.shake, 0.18);
    return true;
  }

  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px, qy = ay + dy * t - py; return qx * qx + qy * qy;
  }

  /* ------------------------------ drawing ------------------------------- */
  // half = 0: back half (behind bomb), 1: front half
  function drawRing(ctx, v, S, ring, half) {
    const x = v.sx(ring.x), y = v.sy(ring.y), R = ring.r * v.ppm;
    if (x < -R * 2 - 40 || x > v.W + R * 2 + 40 || y < -R * 2 - 40 || y > v.H + R * 2 + 40) return;
    let alpha = 1, sc = 1;
    if (ring.passed) {
      const f = ring.passT / 0.45; if (f >= 1) return;
      alpha = 1 - f; sc = 1 + f * 0.6;
    }
    const wob = ring.wob > 0 ? Math.sin(ring.wob * 28) * 0.12 * ring.wob : 0;
    const Rr = R * sc, rx = Rr * 0.3;
    const lw = Math.max(3, RIM * 2 * v.ppm * (ring.kind === 'ring' ? 1.15 : 1));
    const a0 = half ? -Math.PI / 2 : Math.PI / 2, a1 = half ? Math.PI / 2 : Math.PI * 1.5;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-(ring.tilt + wob));
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    if (ring.kind === 'ring') {
      const pulse = 0.5 + 0.5 * Math.sin(S.t * 4 + ring.ph);
      // glow
      ctx.strokeStyle = `rgba(255,226,120,${0.18 + pulse * 0.14})`; ctx.lineWidth = lw * 3.2;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, Rr, 0, a0, a1); ctx.stroke();
      ctx.strokeStyle = half ? '#ffd23f' : '#d99a1c'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, Rr, 0, a0, a1); ctx.stroke();
      ctx.strokeStyle = half ? '#fff6c8' : 'rgba(255,240,170,.55)'; ctx.lineWidth = Math.max(1.5, lw * 0.32);
      ctx.beginPath(); ctx.ellipse(-lw * 0.12, 0, rx, Rr - lw * 0.18, 0, a0, a1); ctx.stroke();
      if (half) {   // orbiting sparkle on the front arc
        const th = -Math.PI / 2 + ((S.t * 0.9 + ring.ph) % 1) * Math.PI;
        const sx = Math.cos(th) * rx, sy = Math.sin(th) * Rr;
        ctx.fillStyle = '#fff'; NO.Art.star(ctx, sx, sy, lw * 1.1, lw * 0.4);
      }
    } else {
      ctx.strokeStyle = half ? '#ff7a1f' : '#b84c14'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, Rr, 0, a0, a1); ctx.stroke();
      ctx.strokeStyle = half ? '#ffc07a' : 'rgba(255,150,80,.5)'; ctx.lineWidth = Math.max(1.2, lw * 0.3);
      ctx.beginPath(); ctx.ellipse(-lw * 0.12, 0, rx, Rr - lw * 0.2, 0, a0, a1); ctx.stroke();
      if (half) drawNet(ctx, ring, Rr, rx, lw, S.t);
      else { // little red-white tabs where the rim meets its (imaginary) mount
        ctx.fillStyle = '#e8475b';
        ctx.beginPath(); ctx.arc(0, -Rr, lw * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, Rr, lw * 0.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // net: a short funnel trailing out of the exit side of the hoop
  function drawNet(ctx, ring, Rr, rx, lw, t) {
    const sw = ring.net;   // swish animation 1 -> 0
    const len = Rr * (0.75 + sw * 0.55) + Math.sin(t * 3 + ring.ph) * Rr * 0.04;
    const shrink = 0.55 - sw * 0.15, flap = Math.sin(sw * 20) * sw * Rr * 0.15;
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, lw * 0.28);
    ctx.beginPath();
    const N = 7;
    for (let i = 0; i <= N; i++) {
      const s = -1 + (2 * i) / N;
      const y0 = s * Rr * 0.92, x0 = Math.sqrt(Math.max(0, 1 - s * s)) * rx;
      const y1 = s * Rr * shrink + flap, x1 = x0 * 0.6 + len;
      ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + len * 0.05, (y0 + y1) / 2 + flap * 0.5, x1, y1);
      // diamond crossings
      if (i < N) {
        const s2 = -1 + (2 * (i + 1)) / N;
        const y2 = s2 * Rr * shrink + flap, x2 = Math.sqrt(Math.max(0, 1 - s2 * s2)) * rx * 0.6 + len;
        ctx.moveTo(x0, y0); ctx.lineTo((x0 + x2) / 2, (y0 + y2) / 2);
      }
    }
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(len, flap, rx * 0.5, Rr * shrink, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  }

  /* ------------------------------ HUD ----------------------------------- */
  function drawHUD(ctx, S, W, H) {
    if (comboShowT <= 0 || hudCombo < 2) return;
    const a = Math.min(1, comboShowT / 0.3);
    const pop = 1 + comboPop * 0.3;
    const m = Math.min(hudCombo, COMBO_CAP);
    const s = Math.max(0.66, Math.min(1.1, H / 820));
    const x = W - 18 * s, y = H * 0.5;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y); ctx.scale(s * pop, s * pop);
    const w = 118, h = 66;
    ctx.fillStyle = 'rgba(20,16,60,.35)'; NO.Art.rr(ctx, -w, -h / 2 + 4, w, h, 18); ctx.fill();
    ctx.fillStyle = '#1f1b4d'; NO.Art.rr(ctx, -w, -h / 2, w, h, 18); ctx.fill();
    ctx.fillStyle = hudCombo >= COMBO_CAP ? '#e8475b' : '#ff7a1f'; NO.Art.rr(ctx, -w + 5, -h / 2 + 5, w - 10, h - 10, 14); ctx.fill();
    // mini hoop icon
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.ellipse(-w + 28, 0, 6, 15, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-w + 32, -12); ctx.lineTo(-w + 42, -6); ctx.moveTo(-w + 32, 12); ctx.lineTo(-w + 42, 6); ctx.moveTo(-w + 34, 0); ctx.lineTo(-w + 43, 0); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '700 13px "Fredoka", "Arial Rounded MT Bold", sans-serif';
    ctx.fillStyle = '#ffe9b0'; ctx.fillText(hudCombo > COMBO_CAP ? 'MAX ' + hudCombo : 'COMBO', -14, -16);
    ctx.font = '700 34px "Fredoka", "Arial Rounded MT Bold", sans-serif';
    ctx.fillStyle = 'rgba(20,16,60,.35)'; ctx.fillText('x' + m, -13, 11);
    ctx.fillStyle = '#ffd23f'; ctx.fillText('x' + m, -14, 8);
    ctx.restore();
  }

  /* -------------------------------- mod --------------------------------- */
  NO.Mods.register({
    id: 'hoops',
    off: false,              // debug toggle: NO.Mods.list.find(m => m.id === 'hoops').off = true
    get rings() { return rings; },
    get combo() { return combo; },

    reset() { rings = []; pending = []; lastX = -1e9; combo = 0; comboPop = 0; comboShowT = 0; hudCombo = 0; bestRun = 0; passes = 0; },

    chunk(S, x0, len, apex) {
      if (this.off) return;
      if (S.mode !== 'flight') { pending.push([x0, len]); return; }
      spawnChunk(S, x0, len, apex);
    },

    launch(S) {
      if (this.off) return;
      const apex = Math.max(6, S.run.apex || 10);
      for (const p of pending) spawnChunk(S, p[0], p[1], apex);
      pending = [];
    },

    physics(S, dt, b) {
      if (b.rolling || rings.length === 0) return;
      const px = b.x - b.vx * dt, py = b.y - b.vy * dt;
      const hitR = R_BOMB + RIM;
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        if (r.x - r.r - 3 > b.x) break;           // sorted by x: nothing further can be in range
        if (r.passed || r.x + r.r + 3 < px) continue;
        const dx0 = px - r.x, dy0 = py - r.y, dx1 = b.x - r.x, dy1 = b.y - r.y;
        // rim points (ends of the ring's visible diameter)
        if (r.rimCd <= 0) {
          const tx = -r.ny * r.r, ty = r.nx * r.r;
          if (segDist2(r.x + tx, r.y + ty, px, py, b.x, b.y) < hitR * hitR) { if (onRim(S, r, r.x + tx, r.y + ty, b)) continue; }
          if (segDist2(r.x - tx, r.y - ty, px, py, b.x, b.y) < hitR * hitR) { if (onRim(S, r, r.x - tx, r.y - ty, b)) continue; }
        }
        // crossing the ring plane from the back side to the front side
        const s0 = dx0 * r.nx + dy0 * r.ny, s1 = dx1 * r.nx + dy1 * r.ny;
        if (s0 < 0 && s1 >= 0) {
          const k = s0 / (s0 - s1);
          const lx = dx0 + (dx1 - dx0) * k, ly = dy0 + (dy1 - dy0) * k;
          const lat = -lx * r.ny + ly * r.nx;
          if (Math.abs(lat) < r.r - R_BOMB * 0.6) onPass(S, r, lat, b);
        }
      }
    },

    bounce() {
      if (combo >= 3) NO.Game.api.popup(NO.Game.api.S.bomb.x, 4, 'COMBO x' + Math.min(combo, COMBO_CAP) + ' ENDED', 'rgba(255,255,255,.85)', 0.7, true);
      combo = 0;
    },

    update(S, dt) {
      comboPop = Math.max(0, comboPop - dt * 5);
      if (combo === 0) comboShowT = Math.max(0, comboShowT - dt);
      else comboShowT = Math.max(comboShowT, 0.3);
      if (!rings.length) return;
      for (const r of rings) {
        if (r.passed) r.passT += dt;
        if (r.wob > 0) r.wob = Math.max(0, r.wob - dt * 1.6);
        if (r.net > 0) r.net = Math.max(0, r.net - dt * 1.4);
        if (r.rimCd > 0) r.rimCd -= dt;
      }
      // drop rings far behind the bomb (or finished animations behind it)
      const bx = S.bomb ? S.bomb.x : 0;
      if (rings[0] && (rings[0].x < bx - 160 || (rings[0].passed && rings[0].passT > 0.5 && rings[0].x < bx))) {
        rings = rings.filter((r) => r.x >= bx - 160 && !(r.passed && r.passT > 0.5));
      }
    },

    renderWorld(ctx, v, S) {
      if (S.mode === 'orbit') return;
      for (const r of rings) drawRing(ctx, v, S, r, 0);
    },
    renderFront(ctx, v, S) {
      if (S.mode === 'orbit') return;
      for (const r of rings) drawRing(ctx, v, S, r, 1);
    },
    renderHUD(ctx, S, W, H) {
      if (S.mode === 'flight' || S.mode === 'boom') drawHUD(ctx, S, W, H);
    },
  });
})();
