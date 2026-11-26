/* =========================================================================
   NUKE ORBIT mod: sky — "Living sky"
   - Themed air traffic per world (birds, hot-air balloons, bouncy clouds,
     blimps, paper planes, vultures, helicopters, drones, seagulls,
     satellites, asteroids). Spawned in 'chunk', moved in 'update',
     collided in 'physics'. Every hit is readable (popup + burst + sound)
     and pays a few coins ("Sky hits"), with a sky-combo multiplier.
   - Altitude atmosphere (renderBack): high cloud deck, altitude markers,
     stratosphere tint and stars that fade in with camera height.
   Safety: every object has a hit cap + cooldown, the run has a global
   bounce cap and a coin cap, object/particle lists are capped.
   ========================================================================= */
'use strict';

(function () {
  if (!window.NO || !NO.Mods) return;
  const TAU = Math.PI * 2;
  const R_BOMB = (NO.CONFIG && NO.CONFIG.BOMB_RADIUS) || 0.55;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  /* ------------------------------ tuning ------------------------------ */
  const T = {
    SPAWN_CHANCE: 0.5,      // per generated chunk (chunks are 25-65 m long)
    PATH_BIAS: 0.35,        // share of spawns placed near the bomb's predicted path
    EXTRA_CHANCE: 0.18,     // chance of a second object in the same chunk
    MIN_X: 22,              // nothing right on top of the launch site
    MAX_OBJS: 40,
    MAX_FX: 90,
    MAX_PUSHES: 12,         // trampoline/boost hits per run (stall guard)
    RUN_COIN_CAP: 220,      // max sky coins per run (before nothing more is paid)
    COMBO_WINDOW: 2.5,      // seconds (sim time) to chain sky hits
  };

  /* Object types. kind:
     bonk  = small speed loss, object knocked away (birds, drones)
     tramp = reflect on the surface (+ minimum upward kick when hit from above)
     cloud = trampoline from above only, pass-through from below
     boost = small forward push (paper planes, satellites)                  */
  const TYPES = {
    bird:    { kind: 'bonk',  vis: 1.3, r: 0.9, mul: 0.965, coins: 2, words: ['BONK!', 'TWEET?!', 'SQUAWK!'], color: '#e8475b' },
    vulture: { kind: 'bonk',  vis: 1.15, r: 1.15, mul: 0.95, coins: 3, words: ['SQUAWK!', 'RUDE!', 'BONK!'], color: '#5a3b2e' },
    gull:    { kind: 'bonk',  vis: 1.3, r: 0.95, mul: 0.965, coins: 2, words: ['MINE?!', 'SKREE!', 'BONK!'], color: '#ffffff' },
    drone:   { kind: 'bonk',  vis: 1.25, r: 1.0, mul: 0.97, coins: 3, words: ['BZZT!', 'DRONE DOWN!', 'CLONK!'], color: '#6b7080' },
    hotair:  { kind: 'tramp', r: 2.1, e: 0.85, kick: 9, vxMul: 1.0, maxHits: 2, coins: 4, words: ['BOING!', 'POMF!', 'BALLOON BOUNCE!'] },
    heli:    { kind: 'tramp', r: 1.5, e: 0.8, kick: 12, vxMul: 0.97, maxHits: 1, coins: 6, words: ['CHOP CHOP!', 'ROTOR BOUNCE!'] },
    rock:    { kind: 'tramp', r: 1.5, e: 0.75, kick: 8, vxMul: 0.98, maxHits: 2, coins: 4, words: ['CRUNCH!', 'ROCK HOP!'] },
    blimp:   { kind: 'tramp', ell: true, rx: 5.2, ry: 1.7, e: 0.95, kick: 14, vxMul: 1.03, maxHits: 3, coins: 8, words: ['MEGA BOING!', 'BLIMP BOUNCE!'] },
    cloud:   { kind: 'cloud', ell: true, rx: 3.3, ry: 1.0, e: 0.72, kick: 7, vxMul: 1.0, maxHits: 2, coins: 1, words: ['FLUFF!', 'POOF!', 'BOUNCY!'] },
    plane:   { kind: 'boost', vis: 1.25, r: 1.0, vxMul: 1.04, vyAdd: 3, coins: 2, words: ['WHOOSH!', 'FOLDED!'] },
    sat:     { kind: 'boost', r: 1.3, vxMul: 1.05, vyAdd: 2, coins: 6, words: ['CLANG!', 'SLINGSHOT!'] },
  };

  /* world -> weighted spawn table */
  const WORLD = {
    country: ['bird', 'bird', 'bird', 'cloud', 'cloud', 'hotair', 'hotair', 'plane', 'blimp'],
    desert:  ['vulture', 'vulture', 'vulture', 'hotair', 'hotair', 'plane', 'blimp'],
    snow:    ['cloud', 'cloud', 'cloud', 'bird', 'bird', 'hotair', 'blimp'],
    city:    ['heli', 'heli', 'drone', 'drone', 'drone', 'blimp', 'plane'],
    ocean:   ['gull', 'gull', 'gull', 'hotair', 'blimp', 'cloud'],
    space:   ['sat', 'sat', 'rock', 'rock', 'rock'],
  };
  const ENV_IDX = { country: 0, desert: 1, snow: 2, city: 3, ocean: 4, space: 5 };

  /* ------------------------------ state ------------------------------- */
  let objs = [], fx = [], simT = 0, peak = 10, pushes = 0, runCoins = 0;
  let flockSeq = 0, combo = 0, comboT = -99, runHits = 0, runBestCombo = 0;

  function clear() { objs = []; fx = []; simT = 0; pushes = 0; runCoins = 0; combo = 0; comboT = -99; runHits = 0; runBestCombo = 0; }

  function gravity() { try { return NO.Game.api.gravity(); } catch (e) { return 50; } }
  function audio(fn, a) { try { if (NO.Audio && NO.Audio[fn]) NO.Audio[fn](a); } catch (e) { /* ignore */ } }

  /* size grows with altitude so things stay readable when the camera zooms out */
  const sizeFor = (y) => clamp(1 + y / 30, 1.1, 6);

  function make(type, x, y, extra) {
    const D = TYPES[type];
    const sz = sizeFor(y);
    const o = {
      type, D, x, y, y0: y, sz, hits: 0, cd: -1, dead: false, deadT: 0, ph: Math.random() * TAU,
      vx: 0, bob: 0.3 * sz, bobF: rnd(0.8, 1.6), flip: 1, spin: 0, dvx: 0, dvy: 0, squash: 0,
    };
    if (D.ell) { o.rx = D.rx * sz; o.ry = D.ry * sz; o.r = o.rx; } else o.r = D.r * sz;
    switch (type) {
      case 'bird': case 'gull': o.vx = rnd(3, 7) * (Math.random() < 0.7 ? -1 : 1); break;
      case 'vulture': o.vx = rnd(1, 3) * (Math.random() < 0.5 ? -1 : 1); o.circle = rnd(3, 6) * sz; o.cx = x; break;
      case 'drone': o.vx = rnd(-2, 2); o.bob = 0.6 * sz; o.bobF = rnd(1.5, 3); break;
      case 'hotair': o.vx = rnd(0.5, 1.5); o.bob = 0.5 * sz; o.bobF = 0.5; o.hue = Math.floor(Math.random() * 3); break;
      case 'heli': o.vx = rnd(-6, 6); o.bob = 0.4 * sz; break;
      case 'blimp': o.vx = rnd(-2.5, -1); o.bob = 0.25 * sz; o.bobF = 0.4; break;
      case 'cloud': o.vx = rnd(0.5, 2); o.bob = 0.15 * sz; o.bobF = 0.6; break;
      case 'plane': o.vx = rnd(6, 10); o.bob = 0.8 * sz; o.bobF = rnd(1, 2); break;
      case 'sat': o.vx = rnd(-1.5, 1.5); o.bob = 0.2 * sz; o.spinV = rnd(-0.6, 0.6); break;
      case 'rock': o.vx = rnd(-3, 3); o.bob = 0.1; o.spinV = rnd(-1.2, 1.2); o.seed = Math.random() * 100; break;
    }
    if (o.vx < 0) o.flip = -1;
    if (extra) Object.assign(o, extra);
    objs.push(o);
    return o;
  }

  // rough ballistic guess of the bomb height when it reaches x (ignores drag and bounces)
  function pathY(b, x) {
    if (!(b.vx > 1)) return -1;
    const t = (x - b.x) / b.vx;
    return b.y + b.vy * t - 0.5 * gravity() * t * t;
  }

  function spawnOne(S, x, hTop) {
    const table = WORLD[S.env] || WORLD.country;
    const type = pick(table);
    const lo = 2.6;
    const hi = Math.max(lo + 2, hTop * 1.05);
    let y = lo + (hi - lo) * (0.2 + 0.8 * Math.random());
    const py = pathY(S.bomb, x);
    if (py > lo + 1 && py < hi * 1.1 && Math.random() < T.PATH_BIAS) y = py + rnd(-1.5, 2.5) * sizeFor(py);
    const D = TYPES[type];
    const half = D.ell ? D.ry * sizeFor(y) : D.r * sizeFor(y);
    y = Math.max(y, half + 1.4);
    if ((type === 'bird' || type === 'gull') && Math.random() < 0.75) {
      // small flock: V-ish formation
      const n = 3 + Math.floor(Math.random() * 3);
      const dir = Math.random() < 0.7 ? -1 : 1, sp = rnd(3, 7) * dir, sz = sizeFor(y), fid = ++flockSeq;
      for (let i = 0; i < n && objs.length < T.MAX_OBJS; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        make(type, x - dir * Math.abs(k) * 1.6 * sz, y + k * 0.9 * sz, { vx: sp, flip: dir, y0: y + k * 0.9 * sz, ph: i * 0.7, flock: fid });
      }
    } else make(type, x, y);
  }

  /* ----------------------------- collisions --------------------------- */
  function payCoins(S, o, base) {
    let n = base * (1 + (ENV_IDX[S.env] || 0) * 0.25) * (1 + 0.5 * (combo - 1));
    n = Math.round(Math.min(n, T.RUN_COIN_CAP - runCoins));
    if (n <= 0) return 0;
    runCoins += n;
    NO.Game.api.addCoins(n, 'Sky hits');
    return n;
  }

  function onHit(S, o, b, word, color) {
    combo = simT - comboT < T.COMBO_WINDOW ? combo + 1 : 1;
    comboT = simT;
    runHits++; S._skyHits = runHits; runBestCombo = Math.max(runBestCombo, combo);
    const n = payCoins(S, o, o.D.coins);
    const api = NO.Game.api;
    const top = o.y + (o.D.ell ? o.ry : o.r);
    api.popup(o.x, top + 1.2 * o.sz, word, color || '#fff', 1.0 + Math.min(0.4, o.sz * 0.06), true);
    if (n > 0) api.popup(o.x + 1.2 * o.sz, top + 0.2, '+' + n, '#ffd23f', 0.8, true);
    if (combo >= 2) api.popup(b.x, b.y + 2.2 * o.sz, 'SKY COMBO x' + combo + '!', '#7df9ff', 1.0 + Math.min(0.5, combo * 0.08), true);
    if (S.cam) S.cam.shake = Math.max(S.cam.shake, o.type === 'blimp' ? 0.45 : 0.22);
  }

  function burst(o, k, n, colors, speed) {
    for (let i = 0; i < n && fx.length < T.MAX_FX; i++) {
      const a = Math.random() * TAU, sp = speed * (0.4 + Math.random() * 0.8) * Math.max(1, o.sz * 0.7);
      fx.push({ k, x: o.x + Math.cos(a) * o.r * 0.4, y: o.y + Math.sin(a) * o.r * 0.3, vx: Math.cos(a) * sp + o.vx, vy: Math.sin(a) * sp + 2,
        life: 0, max: k === 'feather' ? rnd(0.9, 1.5) : rnd(0.4, 0.8), rot: Math.random() * TAU, vr: rnd(-6, 6),
        size: (k === 'feather' ? 0.35 : 0.5) * Math.max(1, o.sz * 0.8), color: pick(colors) });
    }
  }

  // normal from object centre to bomb (ellipse-aware); returns null if no overlap
  function contact(o, b) {
    const dx = b.x - o.x, dy = b.y - o.y;
    if (o.D.ell) {
      const ax = o.rx + R_BOMB, ay = o.ry + R_BOMB;
      const q = (dx * dx) / (ax * ax) + (dy * dy) / (ay * ay);
      if (q > 1) return null;
      let nx = dx / (ax * ax), ny = dy / (ay * ay); const l = Math.hypot(nx, ny) || 1;
      return { nx: nx / l, ny: ny / l, dx, dy, q };
    }
    const rr = o.r + R_BOMB, d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) return null;
    const l = Math.sqrt(d2) || 1;
    return { nx: dx / l, ny: dy / l, dx, dy, q: d2 / (rr * rr) };
  }

  function collide(S, o, b, c) {
    const D = o.D;
    if (D.kind === 'bonk') {
      b.vx *= D.mul; b.vy = b.vy * D.mul + 1.5;
      o.dead = true; o.deadT = 0; o.dvx = b.vx * 0.25 + rnd(-2, 2); o.dvy = rnd(6, 11); o.spin = rnd(-8, 8);
      if (o.flock) {   // the whole flock scatters at once: one hit, one speed loss
        for (let i = 0; i < objs.length; i++) {
          const q = objs[i];
          if (q.flock === o.flock && !q.dead) { q.dead = true; q.deadT = 0; q.scared = true; q.dvx = q.vx * 2 + rnd(-4, 4); q.dvy = rnd(8, 14); q.spin = 0; }
        }
      }
      const cols = o.type === 'drone' ? ['#ffd23f', '#ff6b35', '#fff'] : o.type === 'vulture' ? ['#5a3b2e', '#7a5341', '#f29a9a'] : o.type === 'gull' ? ['#fff', '#cfd6e6', '#fff'] : ['#e8475b', '#ff8a9a', '#fff'];
      burst(o, o.type === 'drone' ? 'spark' : 'feather', o.type === 'drone' ? 10 : 9, cols, 6);
      onHit(S, o, b, pick(D.words), '#fff');
      audio('whack');
      return;
    }
    if (pushes >= T.MAX_PUSHES) return;       // stall guard: sky can only push so many times per run
    if (D.kind === 'boost') {
      b.vx *= D.vxMul; b.vy = Math.max(b.vy, 0) + D.vyAdd;
      pushes++; o.dead = true; o.deadT = 0; o.dvx = b.vx * 0.15; o.dvy = rnd(3, 6); o.spin = rnd(-5, 5);
      burst(o, 'spark', 8, o.type === 'sat' ? ['#ffd23f', '#7df9ff', '#fff'] : ['#fff', '#dfe8ff'], 5);
      onHit(S, o, b, pick(D.words), o.type === 'sat' ? '#7df9ff' : '#fff');
      audio('perfect');
      return;
    }
    // tramp / cloud
    const vn = b.vx * c.nx + b.vy * c.ny;
    const top = c.ny >= 0.2;
    if (D.kind === 'cloud' && (!top || b.vy >= 0)) {   // from below: puff through
      if (!o.puffed) { o.puffed = true; burst(o, 'puff', 5, ['rgba(255,255,255,.9)'], 2); }
      return;
    }
    if (top && b.vy >= 0) return;                // rising out of the top: no effect
    if (!top) {
      if (vn >= 0) return;                       // already separating                            // side / underside: glance off, keep the flight alive
      o.cd = simT + 0.5; o.squash = 0.6;
      if ((o.glances = (o.glances || 0) + 1) > 2) return;
      b.vx *= 0.98;
      if (b.vy > 0) b.vy *= 0.9;
      burst(o, o.type === 'rock' ? 'chip' : 'spark', 5, o.type === 'rock' ? ['#7a6f9b', '#a99fcf'] : ['#ffd23f', '#fff'], 4);
      onHit(S, o, b, pick(['SCRAPE!', 'OOF!', 'BUMP!']), '#fff');
      audio('bounce', 0.3);
      return;
    }
    o.hits++; o.cd = simT + 0.35; pushes++;
    // trampoline: flip the fall into a hop, keep the forward speed (readable + never punishing)
    b.vy = Math.max(Math.abs(b.vy) * D.e, D.kick);
    b.vx = Math.max(2, b.vx * D.vxMul);
    // pop the bomb just outside the surface (radially), never below ground / behind its x
    const k = 1.03 / Math.sqrt(Math.max(c.q, 0.01));
    if (c.q > 0.0001) { b.x = Math.max(b.x, o.x + c.dx * k); b.y = Math.max(R_BOMB + 0.01, o.y + c.dy * k); }
    o.squash = 1;
    if (o.type === 'cloud') burst(o, 'puff', 6, ['rgba(255,255,255,.95)'], 3);
    else if (o.type === 'rock') burst(o, 'chip', 7, ['#7a6f9b', '#574e7c', '#a99fcf'], 5);
    else if (o.type === 'heli') burst(o, 'spark', 8, ['#ffd23f', '#fff'], 6);
    else burst(o, 'spark', 6, ['#ffd23f', '#fff', '#e8475b'], 4);
    onHit(S, o, b, pick(D.words), o.type === 'blimp' ? '#ffd23f' : '#fff');
    audio('bounce', clamp(Math.abs(vn) / 50, 0.3, 1));
    if (o.hits >= D.maxHits && o.type !== 'blimp' && o.type !== 'cloud') { o.dead = true; o.deadT = 0; o.dvx = 0; o.dvy = o.type === 'hotair' ? 1.5 : -2; o.spin = 0; }
  }

  /* ------------------------------ drawing ----------------------------- */
  function drawBird(ctx, o, X, Y, s, t) {
    const flap = Math.sin(t * (o.dead ? 20 : 11) + o.ph);
    const col = o.D.color, wing = o.type === 'gull' ? '#cfd6e6' : o.type === 'vulture' ? '#3e281f' : '#c23047';
    ctx.save(); ctx.translate(X, Y); ctx.scale(o.flip, 1); if (o.dead) ctx.rotate(o.rot || 0);
    // back wing
    ctx.fillStyle = wing; ctx.beginPath(); ctx.moveTo(-0.1 * s, -0.1 * s); ctx.quadraticCurveTo(-0.3 * s, -0.9 * s * flap - 0.1 * s, -0.7 * s, -0.75 * s * flap); ctx.lineTo(0.15 * s, 0); ctx.fill();
    // body
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 0.62 * s, 0.38 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.5 * s, -0.05 * s); ctx.lineTo(-0.95 * s, -0.3 * s); ctx.lineTo(-0.9 * s, 0.15 * s); ctx.fill(); // tail
    // head
    if (o.type === 'vulture') { ctx.fillStyle = '#f29a9a'; ctx.beginPath(); ctx.arc(0.6 * s, -0.25 * s, 0.24 * s, 0, TAU); ctx.fill(); ctx.fillStyle = '#efe6d2'; ctx.beginPath(); ctx.ellipse(0.35 * s, -0.1 * s, 0.2 * s, 0.14 * s, 0, 0, TAU); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0.5 * s, -0.18 * s, 0.27 * s, 0, TAU); ctx.fill(); }
    const hx = o.type === 'vulture' ? 0.6 * s : 0.5 * s, hy = o.type === 'vulture' ? -0.25 * s : -0.18 * s;
    ctx.fillStyle = o.type === 'vulture' ? '#e6b94a' : '#ffd23f';
    ctx.beginPath(); ctx.moveTo(hx + 0.18 * s, hy - 0.05 * s); ctx.lineTo(hx + 0.55 * s, hy + 0.06 * s); ctx.lineTo(hx + 0.16 * s, hy + 0.14 * s); ctx.fill();
    ctx.fillStyle = '#1d1530';
    if (o.dead) { ctx.lineWidth = Math.max(1, s * 0.05); ctx.strokeStyle = '#1d1530'; ctx.beginPath(); const ex = hx + 0.06 * s, ey = hy - 0.06 * s, d = 0.07 * s; ctx.moveTo(ex - d, ey - d); ctx.lineTo(ex + d, ey + d); ctx.moveTo(ex + d, ey - d); ctx.lineTo(ex - d, ey + d); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(hx + 0.06 * s, hy - 0.06 * s, Math.max(1, 0.06 * s), 0, TAU); ctx.fill(); }
    // front wing
    ctx.fillStyle = o.type === 'gull' ? '#e9edf5' : col; ctx.beginPath(); ctx.moveTo(-0.2 * s, -0.05 * s); ctx.quadraticCurveTo(0.05 * s, -1.0 * s * flap, -0.45 * s, -0.95 * s * flap); ctx.lineTo(0.25 * s, -0.05 * s); ctx.fill();
    if (o.type === 'gull') { ctx.fillStyle = '#1d1530'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(-0.45 * s, -0.95 * s * flap, 0.08 * s, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
  }

  function drawDrone(ctx, o, X, Y, s, t) {
    ctx.save(); ctx.translate(X, Y); if (o.dead) ctx.rotate(o.rot || 0);
    ctx.fillStyle = '#4a4f5e'; ctx.fillRect(-0.9 * s, -0.12 * s, 1.8 * s, 0.14 * s);
    for (const sx of [-0.85, 0.85]) {
      ctx.fillStyle = '#4a4f5e'; ctx.fillRect(sx * s - 0.04 * s, -0.3 * s, 0.08 * s, 0.2 * s);
      ctx.fillStyle = 'rgba(220,230,255,.55)'; const w = (0.35 + 0.15 * Math.sin(t * 60 + sx * 3)) * s;
      ctx.beginPath(); ctx.ellipse(sx * s, -0.32 * s, w, 0.06 * s, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = o.D.color; ctx.beginPath(); ctx.ellipse(0, 0, 0.45 * s, 0.3 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1d1530'; ctx.beginPath(); ctx.arc(0.15 * s, 0.12 * s, 0.13 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = (Math.sin(t * 8) > 0 && !o.dead) ? '#e8475b' : '#5a2030'; ctx.beginPath(); ctx.arc(-0.2 * s, -0.12 * s, 0.07 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  const HOT = [['#e8475b', '#ffd23f'], ['#3a6fd8', '#ffffff'], ['#2fb36a', '#ffd23f']];
  function drawHotAir(ctx, o, X, Y, s, t) {
    const r = 2.1 * s, sq = o.squash * 0.18;
    ctx.save(); ctx.translate(X, Y); if (o.dead) { ctx.rotate(o.rot || 0); ctx.globalAlpha = Math.max(0, 1 - o.deadT / 1.5); }
    // ropes + basket
    ctx.strokeStyle = '#6b4f3a'; ctx.lineWidth = Math.max(1, 0.06 * s);
    ctx.beginPath(); ctx.moveTo(-0.55 * r, 0.75 * r); ctx.lineTo(-0.25 * r, 1.35 * r); ctx.moveTo(0.55 * r, 0.75 * r); ctx.lineTo(0.25 * r, 1.35 * r); ctx.stroke();
    ctx.fillStyle = '#a0683a'; ctx.fillRect(-0.3 * r, 1.3 * r, 0.6 * r, 0.38 * r);
    ctx.fillStyle = '#7d4f2b'; ctx.fillRect(-0.3 * r, 1.3 * r, 0.6 * r, 0.08 * r);
    // envelope (squashes on bounce)
    ctx.save(); ctx.scale(1 + sq, 1 - sq);
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.8, Math.PI * 2.2); ctx.quadraticCurveTo(0.45 * r, 0.95 * r, 0.3 * r, 1.05 * r); ctx.lineTo(-0.3 * r, 1.05 * r); ctx.quadraticCurveTo(-0.45 * r, 0.95 * r, Math.cos(Math.PI * 0.8) * r, Math.sin(Math.PI * 0.8) * r); ctx.closePath();
    const pal = HOT[o.hue || 0];
    ctx.fillStyle = pal[0]; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = pal[1];
    for (let i = -2; i <= 2; i += 2) { ctx.beginPath(); ctx.ellipse(i * 0.42 * r, 0, 0.2 * r, 1.2 * r, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(25,12,70,.16)'; ctx.fillRect(0.25 * r, -r * 1.2, r, r * 2.5);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-0.45 * r, -0.45 * r, 0.18 * r, 0.32 * r, -0.5, 0, TAU); ctx.fill();
    ctx.restore(); ctx.restore();
    ctx.restore();
  }

  function drawHeli(ctx, o, X, Y, s, t) {
    ctx.save(); ctx.translate(X, Y); ctx.scale(o.flip, 1); if (o.dead) ctx.rotate(o.rot || 0); else ctx.rotate(0.08);
    ctx.fillStyle = '#d9a92a'; ctx.fillRect(-2.2 * s, -0.15 * s, 1.6 * s, 0.3 * s);        // tail boom
    ctx.fillStyle = '#e8475b'; ctx.beginPath(); ctx.ellipse(-2.2 * s, -0.1 * s, 0.12 * s, 0.4 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, 0, 1.0 * s, 0.62 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(25,12,70,.16)'; ctx.beginPath(); ctx.ellipse(0, 0.2 * s, 1.0 * s, 0.42 * s, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#9fe3ff'; ctx.beginPath(); ctx.ellipse(0.45 * s, -0.12 * s, 0.42 * s, 0.3 * s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4a4f5e'; ctx.lineWidth = Math.max(1.5, 0.09 * s);
    ctx.beginPath(); ctx.moveTo(-0.7 * s, 0.85 * s); ctx.lineTo(0.8 * s, 0.85 * s); ctx.moveTo(-0.4 * s, 0.55 * s); ctx.lineTo(-0.4 * s, 0.85 * s); ctx.moveTo(0.4 * s, 0.55 * s); ctx.lineTo(0.4 * s, 0.85 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.62 * s); ctx.lineTo(0, -0.85 * s); ctx.stroke();
    const w = Math.abs(Math.cos(t * 30)) * 1.9 * s + 0.2 * s;
    ctx.fillStyle = 'rgba(40,40,70,.7)'; ctx.fillRect(-w, -0.92 * s, w * 2, 0.1 * s);
    ctx.restore();
  }

  function drawBlimp(ctx, o, X, Y, s, t) {
    const rx = 5.2 * s, ry = 1.7 * s, sq = o.squash * 0.15;
    ctx.save(); ctx.translate(X, Y); ctx.scale(1 + sq * 0.5, 1 - sq);
    ctx.fillStyle = '#e8475b';
    ctx.beginPath(); ctx.moveTo(0.75 * rx, -0.2 * ry); ctx.lineTo(1.12 * rx, -1.0 * ry); ctx.lineTo(1.15 * rx, -0.1 * ry); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.75 * rx, 0.2 * ry); ctx.lineTo(1.12 * rx, 1.0 * ry); ctx.lineTo(1.15 * rx, 0.1 * ry); ctx.fill();
    ctx.fillStyle = '#d7dbe6'; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(25,12,70,.14)'; ctx.fillRect(-rx, 0.25 * ry, rx * 2, ry);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-rx, -0.18 * ry, rx * 2, 0.32 * ry);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-0.2 * rx, -0.55 * ry, 0.55 * rx, 0.14 * ry, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (s * 0.9 > 6) {
      ctx.fillStyle = '#1d1530'; ctx.font = `700 ${Math.round(0.36 * ry)}px "Fredoka", "Arial Rounded MT Bold", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BOUNCE AIR', -0.05 * rx, 0);
    }
    ctx.fillStyle = '#4a4f5e'; A_rr(ctx, -0.22 * rx, 0.9 * ry, 0.4 * rx, 0.35 * ry, 0.12 * ry); ctx.fill();
    ctx.fillStyle = '#9fe3ff'; for (let i = 0; i < 3; i++) ctx.fillRect((-0.18 + i * 0.12) * rx, 0.98 * ry, 0.07 * rx, 0.14 * ry);
    ctx.restore();
  }

  function drawCloud(ctx, o, X, Y, s, t) {
    const rx = 3.3 * s, ry = 1.0 * s, sq = o.squash * 0.25;
    ctx.save(); ctx.translate(X, Y); ctx.scale(1 + sq * 0.4, 1 - sq);
    ctx.fillStyle = 'rgba(205,220,245,.95)'; ctx.beginPath(); ctx.ellipse(0, 0.35 * ry, rx * 0.95, ry * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(0, 0.1 * ry, rx * 0.92, ry * 0.75, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.35 * rx, -0.35 * ry, 0.38 * rx, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0.2 * rx, -0.55 * ry, 0.45 * rx, 0, TAU); ctx.fill();
    // sleepy face: it's a living cloud
    const blink = Math.sin(t * 1.3 + o.ph) > 0.96 || o.squash > 0.3;
    ctx.fillStyle = '#1d1530'; ctx.strokeStyle = '#1d1530'; ctx.lineWidth = Math.max(1.2, 0.08 * s); ctx.lineCap = 'round';
    for (const ex of [-0.28, 0.12]) {
      if (blink) { ctx.beginPath(); ctx.moveTo((ex - 0.06) * rx, -0.1 * ry); ctx.lineTo((ex + 0.06) * rx, -0.1 * ry); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(ex * rx, -0.1 * ry, Math.max(1.2, 0.09 * s), 0, TAU); ctx.fill(); }
    }
    ctx.beginPath(); ctx.arc(-0.08 * rx, 0.12 * ry, 0.08 * rx, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,170,.45)'; ctx.beginPath(); ctx.arc(-0.42 * rx, 0.1 * ry, 0.07 * rx, 0, TAU); ctx.arc(0.26 * rx, 0.1 * ry, 0.07 * rx, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPlane(ctx, o, X, Y, s, t) {
    ctx.save(); ctx.translate(X, Y); ctx.rotate(o.dead ? (o.rot || 0) : -0.12 + Math.sin(t * 2 + o.ph) * 0.12);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(1.0 * s, 0); ctx.lineTo(-0.9 * s, -0.55 * s); ctx.lineTo(-0.45 * s, 0.02 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d6def0'; ctx.beginPath(); ctx.moveTo(1.0 * s, 0); ctx.lineTo(-0.45 * s, 0.02 * s); ctx.lineTo(-0.75 * s, 0.35 * s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8475b'; ctx.lineWidth = Math.max(1, 0.05 * s); ctx.beginPath(); ctx.moveTo(0.2 * s, -0.12 * s); ctx.lineTo(-0.5 * s, -0.4 * s); ctx.stroke();
    ctx.restore();
  }

  function drawSat(ctx, o, X, Y, s, t) {
    ctx.save(); ctx.translate(X, Y); ctx.rotate((o.rot || 0));
    ctx.fillStyle = '#9aa3b8'; ctx.fillRect(-1.5 * s, -0.04 * s, 3 * s, 0.08 * s);
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#3a6fd8'; ctx.fillRect(sx > 0 ? 0.55 * s : -1.55 * s, -0.4 * s, 1.0 * s, 0.8 * s);
      ctx.strokeStyle = 'rgba(160,210,255,.6)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 1; k < 3; k++) { const x = (sx > 0 ? 0.55 : -1.55) * s + k * 0.33 * s; ctx.moveTo(x, -0.4 * s); ctx.lineTo(x, 0.4 * s); }
      ctx.stroke();
    }
    ctx.fillStyle = '#e6b94a'; ctx.fillRect(-0.45 * s, -0.45 * s, 0.9 * s, 0.9 * s);
    ctx.fillStyle = 'rgba(25,12,70,.18)'; ctx.fillRect(0, -0.45 * s, 0.45 * s, 0.9 * s);
    ctx.strokeStyle = '#d7dbe6'; ctx.lineWidth = Math.max(1, 0.06 * s); ctx.beginPath(); ctx.moveTo(0, -0.45 * s); ctx.lineTo(0.2 * s, -0.95 * s); ctx.stroke();
    ctx.fillStyle = (Math.sin(t * 5 + o.ph) > 0.3) ? '#e8475b' : '#7a2030'; ctx.beginPath(); ctx.arc(0.2 * s, -0.98 * s, 0.1 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawRock(ctx, o, X, Y, s, t) {
    const r = 1.5 * s * (1 - o.squash * 0.1);
    ctx.save(); ctx.translate(X, Y); ctx.rotate(o.rot || 0);
    ctx.fillStyle = '#7a6f9b'; ctx.beginPath();
    for (let j = 0; j < 9; j++) { const a = j / 9 * TAU, r2 = r * (0.82 + hash(o.seed + j) * 0.3); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); }
    ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(25,12,70,.2)'; ctx.fillRect(0, -r * 1.3, r * 1.4, r * 2.6); ctx.restore();
    ctx.fillStyle = '#574e7c';
    ctx.beginPath(); ctx.arc(-0.3 * r, -0.25 * r, 0.25 * r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0.35 * r, 0.3 * r, 0.17 * r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function A_rr(ctx, x, y, w, h, r) {
    if (NO.Art && NO.Art.rr) return NO.Art.rr(ctx, x, y, w, h, r);
    ctx.beginPath(); ctx.rect(x, y, w, h);
  }

  const DRAW = { bird: drawBird, vulture: drawBird, gull: drawBird, drone: drawDrone, hotair: drawHotAir, heli: drawHeli, blimp: drawBlimp, cloud: drawCloud, plane: drawPlane, sat: drawSat, rock: drawRock };

  function drawFx(ctx, v) {
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i], f = p.life / p.max;
      const X = v.sx(p.x), Y = v.sy(p.y);
      if (X < -60 || X > v.W + 60 || Y < -60 || Y > v.H + 60) continue;
      const s = Math.max(2, p.size * v.ppm);
      ctx.globalAlpha = 1 - f;
      ctx.fillStyle = p.color;
      if (p.k === 'feather') {
        ctx.save(); ctx.translate(X, Y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.32, 0, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (p.k === 'puff') {
        ctx.beginPath(); ctx.arc(X, Y, s * (1 + f * 1.5), 0, TAU); ctx.fill();
      } else if (p.k === 'chip') {
        ctx.fillRect(X - s * 0.4, Y - s * 0.4, s * 0.8, s * 0.8);
      } else {
        const R = s * 0.7; ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rad = k % 2 ? R * 0.4 : R; ctx.lineTo(X + Math.cos(a) * rad, Y + Math.sin(a) * rad); }
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------- altitude atmosphere (renderBack) -------------- */
  const DECK_ALT = 150, MARKERS = [[100, '100 m'], [250, 'THIN AIR · 250 m'], [400, 'EDGE OF SPACE · 400 m']];
  function drawAtmosphere(ctx, v, S) {
    const env = S.env, W = v.W, H = v.H;
    const camY = v.camY;
    const topAlt = camY + (H * v.groundFrac) / v.ppm;         // altitude at the top of the screen
    if (topAlt < 60) return;                                    // nothing up there yet: zero cost
    const space = env === 'space';
    // 1) stratosphere tint (top-heavy gradient), fades in with camera height
    const tintA = space ? 0 : clamp((camY - 90) / 420, 0, 0.42);
    if (tintA > 0.01) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(10,8,46,${tintA})`);
      g.addColorStop(0.7, `rgba(16,12,70,${tintA * 0.35})`);
      g.addColorStop(1, 'rgba(16,12,70,0)');
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    // 2) stars far up (space/city already have their own)
    const starA = space ? 0 : clamp((camY - 140) / 240, 0, 1) * (env === "city" ? 0.55 : 0.95);
    if (starA > 0.02) {
      const span = H * 1.4;
      for (let i = 0; i < 70; i++) {
        const px = ((hash(i * 3.7) * W * 2 - v.camX * v.ppmBG * 0.008) % W + W) % W;
        const py = ((hash(i * 5.3 + 11) * span + camY * v.ppm * 0.05) % span + span) % span - H * 0.2;
        const k = 1 - clamp(py / (H * 0.85), 0, 1);              // brighter towards the top
        if (k <= 0) continue;
        const tw = 0.6 + 0.4 * Math.sin(v.t * 2.3 + i * 1.7);
        const sz = hash(i + 0.5) > 0.88 ? 2.6 : 1.5;
        ctx.fillStyle = `rgba(255,255,255,${starA * k * tw})`;
        ctx.fillRect(px, py, sz, sz);
      }
    }
    // 3) aurora ribbon high up in the snow world
    if (env === 'snow' && camY > 140) {
      const a = clamp((camY - 140) / 250, 0, 0.35);
      const y0 = H * 0.12;
      ctx.fillStyle = `rgba(110,255,190,${a})`;
      ctx.beginPath(); ctx.moveTo(0, y0);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, y0 + Math.sin(x * 0.006 + v.t * 0.6) * H * 0.04);
      for (let x = W; x >= 0; x -= 40) ctx.lineTo(x, y0 + H * 0.06 + Math.sin(x * 0.008 + v.t * 0.5 + 1) * H * 0.05);
      ctx.closePath(); ctx.fill();
    }
    // 4) high cloud deck (world-anchored at ~150 m): you punch through it on big launches
    if (!space) {
      const yDeck = v.sy(DECK_ALT);
      if (yDeck > -H * 0.3 && yDeck < H * 1.2) {
        const col = env === 'city' ? '255,205,230' : env === 'desert' ? '255,240,220' : '255,255,255';
        const spacing = 34, x0 = Math.floor((v.camX - (W * 0.4) / v.ppm) / spacing) - 1, x1 = Math.ceil((v.camX + W / v.ppm) / spacing) + 1;
        for (let i = x0; i <= x1; i++) {
          const wx = i * spacing + hash(i * 1.3) * spacing * 0.6;
          const alt = DECK_ALT + (hash(i * 7.7) - 0.5) * 22;
          const w = (18 + hash(i * 2.9) * 26) * v.ppm, h = (2.2 + hash(i * 4.1) * 2) * v.ppm;
          const X = v.sx(wx), Y = v.sy(alt);
          if (X + w < -50 || X > W + 50) continue;
          ctx.fillStyle = `rgba(${col},${0.16 + hash(i * 3.3) * 0.12})`;
          pill(ctx, X, Y, w, h);
          if (hash(i * 6.1) > 0.4) pill(ctx, X + w * 0.25, Y - h * 0.7, w * 0.5, h);
        }
      }
    }
    // 5) altitude markers (subtle dashed lines + label)
    ctx.save();
    ctx.setLineDash([10, 12]); ctx.lineWidth = 2;
    ctx.font = `700 ${Math.round(clamp(H * 0.022, 11, 16))}px "Fredoka", "Arial Rounded MT Bold", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (let i = 0; i < MARKERS.length; i++) {
      const alt = MARKERS[i][0];
      if (space && alt !== 400) continue;
      const Y = v.sy(alt);
      if (Y < -10 || Y > H * 0.9) continue;
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.moveTo(0, Y); ctx.lineTo(W, Y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillText(space ? 'HIGH ORBIT · 400 m' : MARKERS[i][1], 14, Y - 4);
    }
    ctx.restore();
  }
  function pill(ctx, x, y, w, h) { if (NO.Art && NO.Art.rr) NO.Art.rr(ctx, x, y, w, h, h / 2); else { ctx.beginPath(); ctx.rect(x, y, w, h); } ctx.fill(); }

  /* ------------------------------- mod ------------------------------- */
  NO.Mods.register({
    id: 'sky',
    enabled: true,   // test hook: set NO.Mods.list.find(m => m.id === 'sky').enabled = false for A/B
    debugSpawn(type, x, y) { if (TYPES[type]) return make(type, x, y); },   // test hook
    get debugObjs() { return objs; },

    reset() { clear(); },
    aim(S) { clear(); S._skyHits = 0; },
    launch(S) { peak = Math.max(4, (S.run && S.run.apex) || 10); },

    chunk(S, x0, len, apex) {
      if (!this.enabled || S.mode !== 'flight') return;
      const b = S.bomb;
      if (!b || objs.length >= T.MAX_OBJS) return;
      // how high can the bomb still get? keeps objects reachable as bounces decay
      const reach = b.vy > 0 ? b.y + (b.vy * b.vy) / (2 * gravity()) : peak;
      const hTop = Math.max(4, Math.min(reach, apex * 1.05));
      if (Math.random() < T.SPAWN_CHANCE) {
        const x = x0 + Math.random() * len;
        if (x > T.MIN_X) spawnOne(S, x, hTop);
        if (Math.random() < T.EXTRA_CHANCE && objs.length < T.MAX_OBJS) {
          const x2 = x0 + Math.random() * len;
          if (x2 > T.MIN_X && Math.abs(x2 - x) > 8) spawnOne(S, x2, hTop);
        }
      }
    },

    physics(S, dt, b) {
      simT += dt;
      if (b.rolling || !this.enabled) return;
      if (b.vy > 0) { const r = b.y + (b.vy * b.vy) / (2 * gravity()); if (r > peak || b.vy > 1) peak = r; }
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        if (o.dead || o.cd > simT) continue;
        const ext = (o.D.ell ? o.rx : o.r) + R_BOMB;
        if (Math.abs(b.x - o.x) > ext || Math.abs(b.y - o.y) > ext + 2) continue;
        const c = contact(o, b);
        if (c) collide(S, o, b, c);
      }
    },

    bounce() { combo = 0; },   // touching the ground breaks the sky combo

    update(S, dt) {
      if (!objs.length && !fx.length) return;
      const t = S.t;
      const b = S.bomb;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        o.squash = Math.max(0, o.squash - dt * 3);
        if (o.dead) {
          o.deadT += dt;
          o.dvy -= (o.scared ? -4 : o.type === 'hotair' ? 2 : 20) * dt;
          o.x += o.dvx * dt; o.y += o.dvy * dt; o.rot = (o.rot || 0) + o.spin * dt;
          continue;
        }
        if (o.type === 'vulture') { // lazy circling
          o.cx += o.vx * dt;
          const a = t * 0.6 + o.ph;
          o.x = o.cx + Math.cos(a) * o.circle; o.y = o.y0 + Math.sin(a) * o.circle * 0.3;
          o.flip = -Math.sin(a) >= 0 ? 1 : -1;
        } else {
          o.x += o.vx * dt;
          o.y = o.y0 + Math.sin(t * o.bobF + o.ph) * o.bob;
        }
        if (o.spinV) o.rot = (o.rot || 0) + o.spinV * dt;
      }
      // cull: dead and gone, or left far behind
      const bx = b ? b.x : 0;
      let w = 0;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        const gone = (o.dead && (o.deadT > 3 || o.y < -5)) || (S.mode === 'flight' && o.x < bx - 260);
        if (!gone) objs[w++] = o;
      }
      objs.length = w;
      // fx
      w = 0;
      for (let i = 0; i < fx.length; i++) {
        const p = fx[i];
        p.life += dt;
        if (p.life >= p.max) continue;
        if (p.k === 'feather') { p.vx *= Math.exp(-3 * dt); p.vy = p.vy * Math.exp(-3 * dt) - 3 * dt; p.x += (p.vx + Math.sin(p.life * 6 + p.rot) * 1.5) * dt; p.rot += p.vr * dt; }
        else if (p.k === 'puff') { p.vx *= Math.exp(-4 * dt); p.vy *= Math.exp(-4 * dt); p.x += p.vx * dt; }
        else { p.vy -= 25 * dt; p.x += p.vx * dt; p.rot += p.vr * dt; }
        p.y += p.vy * dt;
        fx[w++] = p;
      }
      fx.length = w;
    },

    boom() {
      if (!runHits) return;
      const st = NO.Mods.store('sky');
      st.hits = (st.hits || 0) + runHits;
      st.bestCombo = Math.max(st.bestCombo || 0, runBestCombo);
    },

    renderBack(ctx, v, S) { drawAtmosphere(ctx, v, S); },

    renderWorld(ctx, v, S) {
      if (!objs.length) return;
      const t = S.t;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        const X = v.sx(o.x), Y = v.sy(o.y);
        const m = (o.D.ell ? o.rx : o.r) * v.ppm * 1.6 + 20;
        if (X < -m || X > v.W + m || Y < -m || Y > v.H + m) continue;
        DRAW[o.type](ctx, o, X, Y, o.sz * v.ppm * (o.D.vis || 1), t);
      }
    },

    renderFront(ctx, v) { if (fx.length) drawFx(ctx, v); },
  });
})();
