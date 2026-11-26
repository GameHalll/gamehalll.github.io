/* =========================================================================
   NUKE ORBIT — game.js
   Game state machine, physics, camera, coins, particles, rendering, loop.
   ========================================================================= */
'use strict';

NO.Game = (function () {
  const A = NO.Art, C = NO.CONFIG;
  const { lerp, clamp, hash } = A;

  /* ------------------------------ canvas ------------------------------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, PPM_BASE = 40;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    PPM_BASE = Math.min(H / 16, W / 24);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ------------------------------ state -------------------------------- */
  const CHAR_X = 0, CHAR_UNIT = 2.7 / 100, TEE_H = 0.4;   // character is ~2.7 m tall
  const LAUNCH_DUR = 0.8, RELEASE_P = 0.55;

  const S = {
    mode: 'menu',            // menu | aim | launch | flight | boom | results
    t: 0,
    timeScale: 1,
    power: 0, powerT: 0, lockedPower: 0, perfect: false,
    launchP: 0, released: false,
    bomb: null,
    cam: { x: 3, y: 0, zoom: 1, look: 0, shake: 0 },
    particles: [], flyers: [], popups: [],
    coins: [], genUntil: 0,
    run: null,
    boomT: 0,
    shout: null,
    env: 'country',
    phys: null,
    trailTimer: 0,
    flash: 0,
  };

  function newBomb() {
    return { x: CHAR_X + C.TEE_OFFSET, y: C.BOMB_RADIUS + TEE_H, vx: 0, vy: 0, angle: 0, squash: 0, rolling: false, bounces: 0, stopped: false, maxY: 0 };
  }

  function resetScene() {
    S.bomb = newBomb();
    S.cam.x = 3; S.cam.y = 0; S.cam.zoom = 1; S.cam.look = 0; S.cam.shake = 0;
    S.particles.length = 0; S.flyers.length = 0; S.popups.length = 0; S.coins.length = 0;
    S.genUntil = 14;
    S.launchP = 0; S.released = false; S.boomT = 0; S.shout = null; S.flash = 0;
    S.timeScale = 1;
    S.env = NO.Save.data.env;
    S.phys = NO.physicsFor(NO.Save.data.up);
    NO.Mods.emit('reset', S);
  }

  /* ------------------------------ modes -------------------------------- */
  function toMenu() { resetScene(); S.mode = 'menu'; NO.UI.onMode('menu'); }

  function startAim() {
    resetScene();
    S.mode = 'aim'; S.powerT = Math.random() * 3;
    S.run = { collected: 0, gems: 0, milestones: [], milestoneCoins: 0, nextMs: 0, distance: 0, topSpeed: 0, maxAlt: 0, apexChecked: false, apexVx: 0, orbitLaps: 0, orbitCoins: 0, modCoins: 0, modRows: [] };
    S.orbit = null; S.reentry = 0;
    NO.Mods.emit('aim', S);
    NO.UI.onMode('aim');
  }

  function triggerLaunch() {
    if (S.mode !== 'aim') return;
    NO.Audio.init();
    S.lockedPower = S.power;
    S.perfect = S.power >= C.PERFECT_THRESHOLD;
    S.mode = 'launch'; S.launchP = 0; S.released = false;
    NO.UI.onMode('launch');
  }

  function release() {
    S.released = true;
    const pf = S.perfect ? C.PERFECT_MULT : 0.45 + 0.55 * S.lockedPower;
    const v = S.phys.v0 * pf;
    const b = S.bomb;
    b.vx = v * Math.cos(C.LAUNCH_ANGLE); b.vy = v * Math.sin(C.LAUNCH_ANGLE);
    S.run.apex = (b.vy * b.vy) / (2 * gravity());
    S.run.launchSpeed = v;
    S.cam.shake = 0.5;
    NO.Audio.whack(); NO.Audio.launch();
    if (S.perfect) { NO.Audio.perfect(); popup(b.x, b.y + 2.5, 'PERFECT!', '#ffd23f', 1.4); }
    const ch = NO.byId(NO.CHARACTERS, NO.Save.data.char);
    S.shout = { text: ch.shout, t: 0 };
    // impact burst
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 10;
      S.particles.push({ k: 'spark', x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.4 + Math.random() * 0.3, size: 0.12 + Math.random() * 0.1, color: ['#ffd23f', '#ff6b35', '#fff'][i % 3] });
    }
    popup(b.x + 0.5, b.y + 1.2, ['POW!', 'WHAM!', 'BONK!', 'KAPOW!'][Math.floor(Math.random() * 4)], '#fff', 1.2, true);
    S.mode = 'flight';
    NO.Mods.emit('launch', S, b);
    NO.UI.onMode('flight');
  }

  function gravity() { return C.GRAVITY * NO.byId(NO.ENVIRONMENTS, S.env).gravity; }

  /* ----------------------------- physics ------------------------------- */
  function stepPhysics(dt) {
    const b = S.bomb, P = S.phys, R = C.BOMB_RADIUS;
    const px = b.x, py = b.y;
    if (!b.rolling) {
      b.vy -= gravity() * dt;
      const d = Math.exp(-P.drag * dt);
      b.vx *= d; b.vy *= d;
      b.x += b.vx * dt; b.y += b.vy * dt;
      NO.Mods.emit('physics', S, dt, b);
      if (b.y <= R) {
        b.y = R;
        const impact = -b.vy;
        b.vy = impact * P.restitution;
        b.vx *= P.keepX;
        b.bounces++;
        onBounce(impact);
        NO.Mods.emit('bounce', S, impact, b);
        if (b.vy < C.MIN_BOUNCE_VY) { b.rolling = true; b.vy = 0; }
      }
    } else {
      b.vx -= (P.rollFriction + P.rollDrag * b.vx) * dt;
      NO.Mods.emit('physics', S, dt, b);
      if (b.rolling && b.vx <= C.STOP_SPEED) { b.vx = 0; b.stopped = true; }
      b.x += b.vx * dt;
      b.angle += (b.vx * dt) / R * 0.5;
    }
    b.maxY = Math.max(b.maxY, b.y);
    collectCoins(px, py, b.x, b.y);
  }

  function onBounce(impact) {
    const b = S.bomb;
    const strength = clamp(impact / 60, 0, 1);
    b.squash = 0.3 + strength * 0.7;
    S.cam.shake = Math.max(S.cam.shake, 0.15 + strength * 0.5);
    const water = S.env === 'ocean';
    if (water) NO.Audio.splash(); else NO.Audio.bounce(strength);
    const n = 8 + Math.floor(strength * 16);
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (water) {
        S.particles.push({ k: 'drop', x: b.x + (Math.random() - 0.5), y: 0.1, vx: dir * (1 + Math.random() * 5) + b.vx * 0.15, vy: 5 + Math.random() * 12 * (0.4 + strength), life: 0, max: 0.9, size: 0.12 + Math.random() * 0.15, color: Math.random() < 0.5 ? '#bfe9ff' : '#fff' });
      } else {
        S.particles.push({ k: 'dust', x: b.x + (Math.random() - 0.5), y: 0.2, vx: dir * (1 + Math.random() * 4) + b.vx * 0.1, vy: 1 + Math.random() * 3, life: 0, max: 0.6 + Math.random() * 0.5, size: 0.35 + Math.random() * 0.5 * (0.5 + strength), color: dustColor() });
      }
    }
    if (strength > 0.35) {
      const words = water ? ['SPLOOSH!', 'SPLASH!', 'SKIP!'] : ['BOING!', 'BOUNCE!', 'THUD!', 'SPROING!'];
      popup(b.x, 2.2 + strength * 2, words[b.bounces % words.length], '#fff', 0.9 + strength * 0.6, true);
    }
    S.particles.push({ k: 'ring', x: b.x, y: 0.05, life: 0, max: 0.45, size: 1 + strength * 3, color: water ? '#e0f7ff' : 'rgba(255,255,255,.8)' });
  }

  function dustColor() {
    return { country: '#a3784d', desert: '#f0c27b', snow: '#ffffff', city: '#b9bcc6', ocean: '#fff', space: '#c4c4d4' }[S.env];
  }

  /* ------------------------------ coins -------------------------------- */
  function generateCoins(untilX) {
    const apex = Math.max(6, (S.run && S.run.apex) || 10);
    while (S.genUntil < untilX) {
      const len = 25 + Math.random() * 40;
      const x0 = S.genUntil + Math.random() * len * 0.5;
      if (Math.random() < 0.6) {
        const h = 1.4 + Math.pow(Math.random(), 1.6) * apex * 1.05;
        const n = 5 + Math.floor(Math.random() * 4);
        const pattern = Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          let cx = x0 + i * 1.7, cy = h;
          if (pattern === 1) cy = h + Math.sin((i / (n - 1)) * Math.PI) * 2.2;
          if (pattern === 2) { cx = x0 + (i % 3) * 1.7; cy = h + Math.floor(i / 3) * 1.7; }
          S.coins.push({ x: cx, y: Math.max(0.9, cy), gem: false, got: false, ph: Math.random() * 6 });
        }
      }
      if (Math.random() < 0.08) S.coins.push({ x: x0 + len * 0.6, y: 2 + Math.random() * apex * 0.8, gem: true, got: false, ph: 0 });
      NO.Mods.emit('chunk', S, S.genUntil, len, apex);
      S.genUntil += len;
    }
  }

  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = clamp(t, 0, 1);
    const qx = ax + dx * t - px, qy = ay + dy * t - py; return qx * qx + qy * qy;
  }

  let coinStreak = 0, coinStreakT = 0;
  function collectCoins(ax, ay, bx, by) {
    const r = C.BOMB_RADIUS + 0.9;
    const minX = Math.min(ax, bx) - 2, maxX = Math.max(ax, bx) + 2;
    for (const c of S.coins) {
      if (c.got || c.x < minX || c.x > maxX) continue;
      const rr = c.gem ? r + 0.4 : r;
      if (segDist2(c.x, c.y, ax, ay, bx, by) < rr * rr) {
        c.got = true;
        const v = c.gem ? C.GEM_VALUE : C.COIN_VALUE;
        S.run.collected += v;
        if (c.gem) { S.run.gems++; NO.Audio.gem(); popup(c.x, c.y + 1, '+' + v + ' GEM!', '#7df9ff', 1.1, true); }
        else { coinStreak = coinStreakT > 0 ? coinStreak + 1 : 0; coinStreakT = 0.35; NO.Audio.coin(Math.min(coinStreak, 12)); }
        for (let i = 0; i < (c.gem ? 14 : 6); i++) {
          const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
          S.particles.push({ k: 'spark', x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.35, size: 0.1, color: c.gem ? '#7df9ff' : '#ffe066' });
        }
        const v2 = view();
        S.flyers.push({ x: v2.sx(c.x), y: v2.sy(c.y), t: 0, gem: c.gem });
      }
    }
  }

  /* ---------------------------- particles ------------------------------ */
  function popup(x, y, text, color, scale = 1, bold = false) {
    S.popups.push({ x, y, text, color, scale, bold, life: 0, max: 1.1 });
  }

  function emitTrail(dt) {
    const b = S.bomb;
    const sp = Math.hypot(b.vx, b.vy);
    if (b.rolling || sp < 4) return;
    S.trailTimer -= dt;
    if (S.trailTimer > 0) return;
    S.trailTimer = 0.018;
    const ang = Math.atan2(b.vy, b.vx);
    const tx = b.x - Math.cos(ang) * 0.9, ty = b.y - Math.sin(ang) * 0.9;
    const skin = NO.Save.data.bomb;
    let color = 'rgba(240,240,240,0.9)', k = 'smoke';
    if (S.reentry > 0) {
      for (let i = 0; i < 3; i++) S.particles.push({ k: 'glow', x: tx + (Math.random() - 0.5) * 0.6, y: ty + (Math.random() - 0.5) * 0.6, vx: -b.vx * 0.1, vy: -b.vy * 0.1, life: 0, max: 0.5, size: 0.8 + Math.random() * 0.6, color: ['#ffe066', '#ff9a1f', '#f2541b'][i] });
    }
    if (skin === 'rainbow') { color = `hsl(${(S.t * 400) % 360},95%,62%)`; k = 'glow'; }
    else if (skin === 'neon') { color = Math.random() < 0.5 ? '#00f5ff' : '#ff2bd6'; k = 'glow'; }
    else if (skin === 'alienbomb') { color = '#9dff8a'; k = 'glow'; }
    else if (skin === 'golden') { if (Math.random() < 0.6) S.particles.push({ k: 'spark', x: tx, y: ty, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0, max: 0.6, size: 0.12, color: '#fff3b0' }); }
    else if (skin === 'christmas') { if (Math.random() < 0.5) S.particles.push({ k: 'flake', x: tx, y: ty, vx: (Math.random() - 0.5) * 2, vy: -1, life: 0, max: 1.2, size: 0.16, color: '#fff' }); }
    S.particles.push({ k, x: tx + (Math.random() - 0.5) * 0.3, y: ty + (Math.random() - 0.5) * 0.3, vx: -b.vx * 0.05, vy: -b.vy * 0.05 + 0.6, life: 0, max: k === 'glow' ? 0.7 : 1.0 + Math.random() * 0.5, size: 0.35 + Math.random() * 0.25, color });
  }

  function updateParticles(dt) {
    const g = gravity();
    for (const p of S.particles) {
      p.life += dt;
      if (p.k === 'spark' || p.k === 'drop' || p.k === 'debris') { p.vy -= g * 0.5 * dt; }
      if (p.k === 'dust') { p.vx *= Math.exp(-3 * dt); p.vy -= 3 * dt; }
      if (p.k === 'smoke' || p.k === 'glow') { p.vx *= Math.exp(-2 * dt); p.vy *= Math.exp(-2 * dt); }
      if (p.k === 'flake') { p.vx = Math.sin(p.life * 5) * 0.8; }
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if ((p.k === 'drop' || p.k === 'debris') && p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; }
    }
    S.particles = S.particles.filter((p) => p.life < p.max);
    if (S.particles.length > 900) S.particles.splice(0, S.particles.length - 900);
    for (const p of S.popups) { p.life += dt; p.y += dt * 1.2; }
    S.popups = S.popups.filter((p) => p.life < p.max);
  }

  /* ----------------------------- camera -------------------------------- */
  function view() {
    const ppm = PPM_BASE * S.cam.zoom;
    const anchorX = 0.36, groundFrac = 0.8;
    const camX = S.cam.x, camY = S.cam.y;
    return {
      W, H, ppm, ppmBG: PPM_BASE, anchorX, groundFrac, camX, camY, t: S.t, zoom: S.cam.zoom,
      sx: (wx) => (wx - camX) * ppm + W * anchorX,
      sy: (wy) => H * groundFrac - (wy - camY) * ppm,
    };
  }

  function updateCamera(dt) {
    const c = S.cam, b = S.bomb;
    if (S.mode === 'orbit') { c.shake = Math.max(0, c.shake - dt * 1.6); return; }
    let tz = 1, tx = 3.2, ty = 0, look = 0;
    if (S.mode === 'flight' || S.mode === 'boom' || (S.mode === 'results' && b.x > 4)) {
      const sp = Math.hypot(b.vx, b.vy);
      const zH = (H * 0.8 * 0.7) / (PPM_BASE * (b.y + 5 + Math.max(0, b.vy) * 0.35));
      const zS = 1 / (1 + sp / 90);
      tz = clamp(Math.min(zH, zS, 1), 0.16, 1);
      if (S.mode === 'boom' || S.mode === 'results') tz = clamp((H * 0.8 * 0.8) / (PPM_BASE * 14), 0.2, 1);
      look = clamp(b.vx * 0.04, 0, (W * 0.16) / (PPM_BASE * tz));
      c.look = lerp(c.look, look, 1 - Math.exp(-3 * dt));
      tx = b.x + c.look;
      const visTop = (H * 0.8) / (PPM_BASE * tz);
      ty = b.y > visTop * 0.75 ? b.y - visTop * 0.55 : 0;
      if (S.mode === 'boom' || S.mode === 'results') ty = 0;
      c.x = S.mode === 'boom' ? lerp(c.x, tx, 1 - Math.exp(-3 * dt)) : tx;
    } else {
      c.look = 0;
      c.x = lerp(c.x, tx, 1 - Math.exp(-5 * dt));
    }
    c.zoom = lerp(c.zoom, tz, 1 - Math.exp(-(tz < c.zoom ? 9 : 2) * dt));
    c.y = lerp(c.y, ty, 1 - Math.exp(-5 * dt));
    c.shake = Math.max(0, c.shake - dt * 1.6);
  }

  /* ------------------------------ update ------------------------------- */
  const SUB = 1 / 240;
  let acc = 0;

  function update(rawDt) {
    S.t += rawDt;
    const dt = rawDt * S.timeScale;
    coinStreakT -= dt;

    if (S.mode === 'aim') {
      S.powerT += rawDt;
      // ease-in-out oscillation, slightly lingers at the top for skill
      S.power = (1 - Math.cos(S.powerT * 3.6)) / 2;
    }

    if (S.mode === 'launch') {
      S.launchP += rawDt / LAUNCH_DUR;
      const ch = NO.byId(NO.CHARACTERS, NO.Save.data.char);
      if (ch.style === 'beam' && !S.released) S.bomb.y = C.BOMB_RADIUS + TEE_H + 1.0 * A.easeOut(S.launchP / RELEASE_P);
      if (ch.style === 'ray' && S.launchP > 0.3 && S.launchP < RELEASE_P && Math.random() < 0.5) {
        S.particles.push({ k: 'spark', x: S.bomb.x, y: S.bomb.y, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 6, life: 0, max: 0.3, size: 0.1, color: '#ff4fd8' });
      }
      if (S.launchP >= RELEASE_P && !S.released) release();
    }

    if (S.mode === 'flight') {
      acc += dt;
      let steps = 0;
      while (acc >= SUB && steps < 2400) { stepPhysics(SUB); acc -= SUB; steps++; if (S.bomb.stopped) break; }
      const b = S.bomb;
      // visual rotation
      if (!b.rolling) {
        const target = Math.atan2(-b.vy, b.vx);
        let d = target - b.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
        b.angle += d * (1 - Math.exp(-10 * dt));
      }
      b.squash = Math.max(0, b.squash - dt * 4);
      emitTrail(dt);
      const run = S.run;
      run.distance = Math.max(0, b.x - (CHAR_X + C.TEE_OFFSET));
      run.topSpeed = Math.max(run.topSpeed, Math.hypot(b.vx, b.vy));
      run.maxAlt = Math.max(run.maxAlt, b.y);
      checkMilestones();
      // ORBIT check: at the first apex, a fast enough bomb breaks into orbit
      if (!run.apexChecked && !b.rolling && b.vy <= 0 && b.bounces === 0) {
        run.apexChecked = true; run.apexVx = b.vx;
        if (b.vx >= C.ORBIT_VX) { enterOrbit(); return; }
      }
      S.reentry = Math.max(0, S.reentry - dt);
      generateCoins(b.x + W / (PPM_BASE * 0.16) + 50);
      if (S.coins.length > 600) S.coins = S.coins.filter((c) => c.x > b.x - 200);
      if (b.stopped) startBoom();
      S.shout && (S.shout.t += rawDt);
    }

    if (S.mode === 'orbit') updateOrbit(dt);

    if (S.mode === 'boom') {
      S.boomT += rawDt;
      S.bomb.squash = 0;
      if (S.boomT > 2.4 && !S.resultsShown) { S.resultsShown = true; finishRun(); }
    }
    if (S.mode === 'launch' || S.mode === 'results') { S.shout && (S.shout.t += rawDt); }

    NO.Mods.emit('update', S, dt, rawDt);
    S.flash = Math.max(0, S.flash - rawDt * 1.5);
    updateParticles(dt);
    updateFlyers(rawDt);
    updateCamera(rawDt);
    NO.UI.hud(S);
  }

  function checkMilestones() {
    const run = S.run;
    while (run.nextMs < NO.MILESTONES.length && run.distance >= NO.MILESTONES[run.nextMs]) {
      const m = NO.MILESTONES[run.nextMs];
      const bonus = NO.milestoneBonus(m);
      run.milestones.push(m); run.milestoneCoins += bonus;
      if (S.mode !== 'orbit') NO.UI.banner((m >= 1000 ? m / 1000 + ' KM' : m + ' M') + '!', '+' + bonus + ' bonus coins');
      NO.Audio.milestone();
      run.nextMs++;
    }
  }

  /* ------------------------------- ORBIT ------------------------------- */
  function enterOrbit() {
    const b = S.bomb;
    S.mode = 'orbit';
    S.flash = 1; S.cam.shake = 0.6;
    S.orbit = { t: 0, phase: 'loop', prog: 0, speed: b.vx, laps: 0, entryX: b.x, entryDist: S.run.distance, exitT: 0,
      keep: 0.86 + 0.0035 * NO.Save.data.up.speed, coins: [], spin: 0 };
    spawnOrbitCoins(0);
    NO.Audio.record();
    NO.UI.banner('ORBIT!', 'Escape velocity reached!');
    NO.UI.onMode('orbit');
  }
  function spawnOrbitCoins(lap) {
    const O = S.orbit;
    const start = lap + 0.12 + Math.random() * 0.2;
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) O.coins.push({ p: start + i * 0.045, gem: i === n - 1 && Math.random() < 0.4, got: false });
  }
  function orbitLapTime() { return clamp(3.4 - (S.orbit.speed - C.ORBIT_VX) / 45, 1.7, 3.4); }

  function updateOrbit(dt) {
    const O = S.orbit, run = S.run;
    O.t += dt;
    NO.Mods.emit('orbitUpdate', S, dt);
    O.prog += dt / orbitLapTime();
    if (O.phase === 'loop' && O.prog >= O.laps + 1) {
      O.laps++;
      const bonus = C.ORBIT_LAP_BONUS * O.laps;
      run.orbitLaps = O.laps; run.orbitCoins += bonus;
      NO.UI.banner('LAP ' + O.laps + '!', '+' + bonus + ' orbit bonus');
      NO.Audio.gem();
      O.speed *= O.keep;
      if (O.speed < C.ORBIT_VX || O.laps >= C.ORBIT_MAX_LAPS) { O.phase = 'exit'; O.exitT = 0; }
      else spawnOrbitCoins(O.laps);
    }
    if (O.phase === 'exit') { O.exitT += dt; if (O.exitT >= 1.5) { exitOrbit(); return; } }
    for (const c of O.coins) {
      if (!c.got && O.prog >= c.p) {
        c.got = true;
        const v = c.gem ? C.GEM_VALUE : C.COIN_VALUE * 2;
        run.collected += v; if (c.gem) { run.gems++; NO.Audio.gem(); } else NO.Audio.coin(4);
        const pos = orbitPos(c.p);
        S.flyers.push({ x: pos.x, y: pos.y, t: 0, gem: c.gem });
      }
    }
    run.distance = O.entryDist + O.prog * C.ORBIT_LAP;
    run.topSpeed = Math.max(run.topSpeed, O.speed);
    checkMilestones();
  }

  function exitOrbit() {
    const O = S.orbit, b = S.bomb;
    b.x = O.entryX + O.prog * C.ORBIT_LAP;
    b.y = 170; b.vx = Math.max(70, O.speed * 0.7); b.vy = -30;
    b.angle = Math.atan2(-b.vy, b.vx);
    S.coins = []; S.genUntil = b.x + 20;
    S.cam.x = b.x; S.cam.zoom = 0.25; S.cam.y = b.y - 40; S.cam.look = 0;
    S.particles.length = 0;
    S.reentry = 3;
    S.flash = 0.9;
    S.mode = 'flight';
    NO.UI.banner('RE-ENTRY!', 'Incoming!!');
    NO.UI.onMode('flight');
  }

  // planet view geometry
  function orbitGeom() {
    const R = Math.min(W, H) * 0.24;
    const cx = W * 0.5, cy = H * 0.55;
    const O = S.orbit;
    let r = R * 1.6;
    if (O && O.phase === 'exit') r = lerp(R * 1.6, R * 1.02, A.easeIn(O.exitT / 1.5));
    return { R, cx, cy, r };
  }
  function orbitPos(prog, rOverride) {
    const g = orbitGeom();
    const a = -Math.PI / 2 + prog * Math.PI * 2;
    const r = rOverride || g.r;
    return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r, a };
  }

  function updateFlyers(dt) {
    const target = NO.UI.coinTarget();
    for (const f of S.flyers) {
      f.t += dt * 1.6;
      if (f.t >= 1 && !f.done) { f.done = true; NO.UI.bumpCoins(); }
    }
    S.flyers = S.flyers.filter((f) => f.t < 1);
    S.flyTarget = target;
  }

  function startBoom() {
    S.mode = 'boom'; S.boomT = 0; S.resultsShown = false;
    S.flash = 1; S.cam.shake = 1.4;
    NO.Audio.boom();
    const b = S.bomb;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI, sp = 6 + Math.random() * 22;
      S.particles.push({ k: 'debris', x: b.x, y: 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.6 + Math.random(), size: 0.15 + Math.random() * 0.25, color: ['#ff6b35', '#ffd23f', '#6b4f3a', '#444'][i % 4] });
    }
    popup(b.x, 9, ['KA-BOOM!', 'NUKED!', 'BIG BADA BOOM!', 'OOPSIE!'][Math.floor(Math.random() * 4)], '#ffd23f', 2.0, true);
    NO.Mods.emit('boom', S);
    NO.UI.onMode('boom');
  }

  function finishRun() {
    const d = NO.Save.data, run = S.run;
    const env = NO.byId(NO.ENVIRONMENTS, S.env);
    const distCoins = Math.floor(run.distance * C.COINS_PER_METER);
    const base = distCoins + run.collected + run.milestoneCoins + run.orbitCoins + (run.modCoins || 0);
    const total = Math.round(base * env.mult);
    const prevBest = d.best;
    const isRecord = run.distance > prevBest + 0.01;
    d.coins += total;
    d.launches++;
    d.totalDistance += run.distance;
    if (isRecord) d.best = run.distance;
    d.bestByEnv[S.env] = Math.max(d.bestByEnv[S.env] || 0, run.distance);
    const newWorlds = NO.ENVIRONMENTS.filter((e) => d.best >= e.unlock && !d.envSeen.includes(e.id));
    newWorlds.forEach((e) => d.envSeen.push(e.id));
    NO.Save.save();
    if (isRecord && prevBest > 0) NO.Audio.record();
    S.mode = 'results';
    const res = { distance: run.distance, distCoins, collected: run.collected, gems: run.gems, milestoneCoins: run.milestoneCoins, mult: env.mult, total, best: d.best, isRecord, prevBest, newWorlds, topSpeed: run.topSpeed, maxAlt: run.maxAlt, bounces: S.bomb.bounces, perfect: S.perfect, orbitLaps: run.orbitLaps, orbitCoins: run.orbitCoins, apexVx: run.apexVx, modCoins: run.modCoins || 0, modRows: run.modRows || [] };
    NO.Mods.emit('results', S, res);
    NO.UI.showResults(res);
    NO.Mods.emit('resultsShown', res);
  }

  /* ------------------------------ render ------------------------------- */
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S.mode === 'orbit') {
      drawOrbitView();
      NO.Mods.emit('renderOrbit', ctx, S, orbitGeom());
      drawFlyers();
      drawVignette();
      if (S.flash > 0) { ctx.fillStyle = `rgba(255,250,220,${S.flash * 0.9})`; ctx.fillRect(0, 0, W, H); }
      return;
    }
    const v = view();
    const sh = S.cam.shake;
    const ox = sh > 0 ? (Math.random() - 0.5) * sh * 14 : 0, oy = sh > 0 ? (Math.random() - 0.5) * sh * 14 : 0;
    A.drawWorldBack(ctx, S.env, v);
    ctx.save(); ctx.translate(ox, oy);
    NO.Mods.emit('renderBack', ctx, v, S);

    // coins (behind ground props looks odd; draw before ground front props but after sky)
    drawCoins(v);
    A.drawWorldFront(ctx, S.env, v, NO.Save.data.best + C.TEE_OFFSET, 2);

    // launch tee + character
    drawLaunchSite(v);
    NO.Mods.emit('renderWorld', ctx, v, S);

    // particles behind bomb
    drawParticles(v, false);

    // bomb (+ ground shadow)
    const b = S.bomb;
    if (b.y < 60 && S.mode !== 'boom' && S.mode !== 'results') {
      const k = 1 - b.y / 60;
      ctx.fillStyle = `rgba(20,10,60,${0.25 * k})`;
      ctx.beginPath(); ctx.ellipse(v.sx(b.x), v.sy(0) + 2, 0.9 * v.ppm * (0.4 + k * 0.6), 0.18 * v.ppm * (0.4 + k * 0.6), 0, 0, Math.PI * 2); ctx.fill();
    }
    if (S.mode !== 'boom' && S.mode !== 'results' || (S.mode === 'results' && b.x < 4)) {
      const len = 1.75 * v.ppm;
      A.drawBomb(ctx, NO.Save.data.bomb, v.sx(b.x), v.sy(b.y), len, b.angle, S.t, b.squash);
    }
    if (S.mode === 'boom' || (S.mode === 'results' && b.x > 4)) drawMushroom(v);

    drawParticles(v, true);
    drawPopups(v);
    NO.Mods.emit('renderFront', ctx, v, S);
    drawShout(v);
    drawForeground(v);
    ctx.restore();
    drawVignette();
    NO.Mods.emit('renderHUD', ctx, S, W, H);

    // speed lines
    if (S.mode === 'flight') {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 50) drawSpeedLines(clamp((sp - 50) / 200, 0, 1));
      if (b.y > 0 && v.sy(b.y) < 30) drawOffscreenArrow(v);
    }
    if (S.mode === 'aim') drawPowerMeter(v);
    drawFlyers();
    if (S.flash > 0) { ctx.fillStyle = `rgba(255,250,220,${S.flash * 0.9})`; ctx.fillRect(0, 0, W, H); }
    // snow / weather overlay
    if (S.env === 'snow') drawSnowfall(v);
  }

  function drawLaunchSite(v) {
    const ch = NO.byId(NO.CHARACTERS, NO.Save.data.char);
    const gx = v.sx(CHAR_X), gy = v.sy(0);
    if (gx < -300 || gx > W + 300) return;
    const s = v.ppm * CHAR_UNIT;
    // launch pad / tee
    const tx = v.sx(CHAR_X + C.TEE_OFFSET);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(tx, gy + 2, 0.45 * v.ppm, 0.1 * v.ppm, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8d93a8'; ctx.fillRect(tx - 0.07 * v.ppm, gy - TEE_H * v.ppm, 0.14 * v.ppm, TEE_H * v.ppm);
    ctx.fillStyle = '#b7bccc'; ctx.fillRect(tx - 0.07 * v.ppm, gy - TEE_H * v.ppm, 0.05 * v.ppm, TEE_H * v.ppm);
    A.rr(ctx, tx - 0.28 * v.ppm, gy - (TEE_H + 0.06) * v.ppm, 0.56 * v.ppm, 0.1 * v.ppm, 3); A.fillStroke(ctx, '#6b7186');
    // big red button podium for fun
    const p = (S.mode === 'launch' || S.mode === 'flight' || S.mode === 'boom' || S.mode === 'results') ? Math.min(1, S.mode === 'launch' ? S.launchP : 1) : null;
    A.drawCharacter(ctx, ch.id, gx, gy, s, S.t, p);
    // effects for ray / beam styles
    if (S.mode === 'launch' || (S.mode === 'flight' && S.launchP < 1)) {
      const lp = S.launchP;
      const b = S.bomb;
      if (ch.style === 'ray' && lp > 0.3 && lp < 0.62) {
        const gunX = gx + 1.3 * v.ppm * 0.98, gunY = gy - 1.72 * v.ppm;
        const bx = v.sx(b.x), by = v.sy(b.y);
        ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 4; ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.moveTo(gunX, gunY);
        for (let i = 1; i <= 6; i++) { const f = i / 6; ctx.lineTo(lerp(gunX, bx, f) + (i < 6 ? (Math.random() - 0.5) * 18 : 0), lerp(gunY, by, f) + (i < 6 ? (Math.random() - 0.5) * 18 : 0)); }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      if (ch.style === 'beam' && lp < 0.62) {
        const hx = gx + 0.75 * v.ppm, hy = gy - 1.6 * v.ppm;
        const bx = v.sx(b.x), by = v.sy(b.y);
        const g = ctx.createLinearGradient(hx, hy, bx, by);
        g.addColorStop(0, 'rgba(157,255,138,.8)'); g.addColorStop(1, 'rgba(157,255,138,.15)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx, hy - 4); ctx.lineTo(bx, by - 0.9 * v.ppm); ctx.lineTo(bx, by + 0.9 * v.ppm); ctx.lineTo(hx, hy + 4); ctx.closePath(); ctx.fill();
      }
    }
    S.launchP = S.mode === 'flight' ? Math.min(1, S.launchP + 0.016) : S.launchP;
  }

  function drawCoins(v) {
    const r = Math.max(5, 0.45 * v.ppm);
    for (const c of S.coins) {
      if (c.got) continue;
      const x = v.sx(c.x), y = v.sy(c.y);
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      if (c.gem) {
        const s = r * 1.5;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(S.t * 3) * 0.2);
        ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, -s * 0.2); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, -s * 0.2); ctx.closePath();
        A.fillStroke(ctx, '#56e0ff', 2.5); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.35, -s * 0.2); ctx.lineTo(-s * 0.35, -s * 0.2); ctx.closePath(); ctx.fill();
        ctx.restore();
        continue;
      }
      const sq = Math.abs(Math.cos(S.t * 4 + c.ph));
      ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.15, sq), 1);
      A.circle(ctx, 0, 0, r, '#ffd23f', 2.5);
      ctx.fillStyle = '#f4a100'; A.circle(ctx, 0, 0, r * 0.6); ctx.fill();
      ctx.fillStyle = '#fff6c0'; ctx.font = `700 ${r * 1.1}px "Fredoka", "Arial Rounded MT Bold", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, r * 0.08);
      ctx.restore();
    }
  }

  function drawParticles(v, front) {
    for (const p of S.particles) {
      const isFront = p.k === 'spark' || p.k === 'drop' || p.k === 'flake' || p.k === 'debris' || p.k === 'ring';
      if (isFront !== front) continue;
      const f = p.life / p.max;
      const x = v.sx(p.x), y = v.sy(p.y);
      if (x < -80 || x > W + 80 || y < -80 || y > H + 80) continue;
      switch (p.k) {
        case 'smoke': {
          const r = (p.size + f * 1.1) * v.ppm;
          ctx.globalAlpha = (1 - f) * 0.75;
          A.circle(ctx, x, y, r); ctx.fillStyle = p.color; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(80,80,100,.35)'; ctx.stroke();
          break;
        }
        case 'glow': {
          const r = (p.size * (1 - f * 0.5)) * v.ppm;
          ctx.globalAlpha = (1 - f) * 0.9;
          ctx.fillStyle = p.color; A.circle(ctx, x, y, r); ctx.fill();
          break;
        }
        case 'dust': {
          const r = (p.size + f * 0.6) * v.ppm;
          ctx.globalAlpha = (1 - f) * 0.8; ctx.fillStyle = p.color; A.circle(ctx, x, y, r); ctx.fill();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = 1 - f; ctx.strokeStyle = p.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(x, y, p.size * f * v.ppm * 1.4 + 4, p.size * f * v.ppm * 0.3 + 2, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'flake': {
          ctx.globalAlpha = 1 - f; ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(8, p.size * v.ppm * 3)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('❄', x, y);
          break;
        }
        default: {
          ctx.globalAlpha = 1 - f * 0.8; ctx.fillStyle = p.color;
          const r = Math.max(1.5, p.size * v.ppm);
          if (p.k === 'spark') { A.star(ctx, x, y, r * 1.6, r * 0.6); } else { A.circle(ctx, x, y, r); ctx.fill(); }
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPopups(v) {
    for (const p of S.popups) {
      const f = p.life / p.max;
      const pop = f < 0.15 ? A.easeOut(f / 0.15) * 1.25 : 1.25 - Math.min(0.25, (f - 0.15) * 2);
      const size = Math.max(16, Math.min(56, v.ppm * 0.9)) * p.scale * pop;
      ctx.save(); ctx.translate(v.sx(p.x), v.sy(p.y)); ctx.rotate(-0.08);
      ctx.globalAlpha = f > 0.75 ? (1 - f) / 0.25 : 1;
      ctx.font = `700 ${size}px "Fredoka", "Arial Rounded MT Bold", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(20,16,60,.35)'; ctx.fillText(p.text, 0, size * 0.09);
      ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawShout(v) {
    if (!S.shout || S.shout.t > 1.6) return;
    const f = S.shout.t / 1.6;
    const x = v.sx(CHAR_X) - 0.2 * v.ppm, y = v.sy(3.4);
    if (x < -200 || x > W + 200) return;
    const size = Math.max(16, v.ppm * 0.6) * (f < 0.1 ? A.easeOut(f / 0.1) : 1);
    ctx.save(); ctx.globalAlpha = f > 0.8 ? (1 - f) / 0.2 : 1;
    ctx.font = `700 ${size}px "Fredoka", "Arial Rounded MT Bold", sans-serif`;
    const w = ctx.measureText(S.shout.text).width + size;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; A.rr(ctx, x - w / 2, y - size * 0.92, w, size * 1.6, size * 0.6); ctx.fill();
    A.rr(ctx, x - w / 2, y - size * 1.0, w, size * 1.6, size * 0.6); A.fillStroke(ctx, '#fff');
    ctx.beginPath(); ctx.moveTo(x - size * 0.3, y + size * 0.55); ctx.lineTo(x, y + size * 1.3); ctx.lineTo(x + size * 0.4, y + size * 0.55); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#e63946'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S.shout.text, x, y - size * 0.18);
    ctx.restore();
  }

  function drawMushroom(v) {
    const t = S.boomT + (S.mode === 'results' ? 0 : 0);
    const b = S.bomb;
    const x = v.sx(b.x), gy = v.sy(0), m = v.ppm;
    const grow = A.easeOut(Math.min(1, t / 1.2));
    const fade = S.mode === 'results' ? Math.max(0.0, 1 - S.resultsT * 0.5) : 1;
    if (fade <= 0) return;
    ctx.save(); ctx.globalAlpha = fade;
    // shockwave
    if (t < 1.2) {
      ctx.strokeStyle = `rgba(255,255,255,${1 - t / 1.2})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(x, gy, t * 40 * m, t * 8 * m, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const capY = gy - (3 + grow * 9) * m;
    const heat = Math.max(0, 1 - t / 3);
    const mix = (hot, cold) => { const a = parseInt(hot.slice(1), 16), c = parseInt(cold.slice(1), 16);
      const ch = (n, sh) => (n >> sh) & 255;
      return `rgb(${[16, 8, 0].map((sh) => Math.round(lerp(ch(c, sh), ch(a, sh), heat))).join(',')})`; };
    const dark = mix('#f2541b', '#7a6a6a'), mid = mix('#ff9a1f', '#a39494'), light = mix('#ffe066', '#d3c9c4');
    const wob = (i) => Math.sin(S.t * 3 + i) * 0.08 * m;
    // stem
    ctx.fillStyle = mid;
    ctx.beginPath(); ctx.moveTo(x - 1.5 * m * grow, gy); ctx.quadraticCurveTo(x - 0.7 * m, (gy + capY) / 2, x - 1.1 * m * grow, capY + 1.5 * m);
    ctx.lineTo(x + 1.1 * m * grow, capY + 1.5 * m); ctx.quadraticCurveTo(x + 0.7 * m, (gy + capY) / 2, x + 1.5 * m * grow, gy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = light; ctx.fillRect(x - 0.4 * m * grow, capY + 1.5 * m, 0.35 * m * grow, Math.max(0, gy - capY - 2 * m));
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(x, (gy + capY) / 2 + m, 2.4 * m * grow, 0.55 * m * grow, 0, 0, Math.PI * 2); ctx.fill();
    // base cloud
    for (let i = -4; i <= 4; i++) { ctx.fillStyle = Math.abs(i) % 2 ? dark : mid; A.circle(ctx, x + i * 1.15 * m * grow, gy - 0.5 * m, (1.5 - Math.abs(i) * 0.1) * m * grow); ctx.fill(); }
    // cap
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      ctx.fillStyle = i % 2 ? dark : mid;
      A.circle(ctx, x + Math.cos(a) * 3.8 * m * grow, capY + Math.sin(a) * 2.2 * m * grow + 0.8 * m * grow + wob(i), (1.6 + hash(i) * 0.5) * m * grow); ctx.fill();
    }
    ctx.fillStyle = mid; A.circle(ctx, x, capY - 0.2 * m * grow, 3.0 * m * grow); ctx.fill();
    ctx.fillStyle = light; A.circle(ctx, x - 1.1 * m * grow, capY - 0.7 * m * grow, 1.6 * m * grow); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; A.circle(ctx, x - 1.6 * m * grow, capY - 1.3 * m * grow, 0.6 * m * grow); ctx.fill();
    ctx.restore();
  }

  /* ----------------------- foreground & vignette ----------------------- */
  const FG = { country: '#1f6a2c', desert: '#b5662f', snow: '#bcd2ee', city: '#1d1d33', ocean: '#0f5fb0', space: '#3a365a' };
  function drawForeground(v) {
    const gy = v.sy(0);
    if (gy > H - 6) return;
    const fp = v.ppm * 1.45, sp = 6.5;
    const ax = W * v.anchorX;
    const i0 = Math.floor((v.camX - ax / fp) / sp) - 2, i1 = Math.ceil((v.camX + (W - ax) / fp) / sp) + 2;
    ctx.fillStyle = FG[S.env];
    for (let i = i0; i <= i1; i++) {
      if (hash(i * 3.3 + 1) > 0.55) continue;
      const x = (i * sp + hash(i) * 3 - v.camX) * fp + ax;
      const r = fp * (0.5 + hash(i * 1.7) * 0.6);
      const y = H + r * 0.25;
      A.circle(ctx, x, y, r); ctx.fill();
      A.circle(ctx, x + r * 0.8, y + r * 0.2, r * 0.75); ctx.fill();
      A.circle(ctx, x - r * 0.75, y + r * 0.3, r * 0.6); ctx.fill();
      if (S.env === 'country' || S.env === 'desert') {
        for (let j = 0; j < 4; j++) { const bx = x - r * 0.4 + j * r * 0.25, bh = r * (0.35 + hash(i + j) * 0.3); ctx.fillRect(bx, y - r - bh + 4, Math.max(2, r * 0.07), bh); }
      }
    }
  }
  let vig = null, vigKey = '';
  function drawVignette() {
    const key = W + 'x' + H;
    if (key !== vigKey) {
      vigKey = key;
      vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
      vig.addColorStop(0, 'rgba(15,8,50,0)'); vig.addColorStop(1, 'rgba(15,8,50,.32)');
    }
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  /* ---------------------------- orbit view ----------------------------- */
  const PLANETS = {
    country: { sea: '#2f7fe0', land: '#4fbf55', land2: '#3a9c45', cap: '#ffffff', atmo: '120,190,255' },
    desert:  { sea: '#e9a55e', land: '#c56a3a', land2: '#a9552c', cap: '#ffe2b8', atmo: '255,190,130' },
    snow:    { sea: '#8fb6ea', land: '#ffffff', land2: '#dbe8fa', cap: '#ffffff', atmo: '200,225,255' },
    city:    { sea: '#33407c', land: '#5b5a7a', land2: '#ffd36e', cap: '#8d8db0', atmo: '230,140,200' },
    ocean:   { sea: '#1e88e5', land: '#f4d58d', land2: '#4caf50', cap: '#e8f6ff', atmo: '120,200,255' },
    space:   { sea: '#8a86a8', land: '#77739b', land2: '#5f5b84', cap: '#a9a5c8', atmo: '180,160,255' },
  };
  function drawOrbitView() {
    const O = S.orbit, g = orbitGeom(), P = PLANETS[S.env];
    const { R, cx, cy } = g;
    const bg = ctx.createRadialGradient(cx, cy, R, cx, cy, Math.max(W, H));
    bg.addColorStop(0, '#1d1556'); bg.addColorStop(1, '#05031a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // nebula + stars
    const nb = ctx.createRadialGradient(W * 0.2, H * 0.25, 10, W * 0.2, H * 0.25, H * 0.5);
    nb.addColorStop(0, 'rgba(220,90,255,.22)'); nb.addColorStop(1, 'rgba(220,90,255,0)');
    ctx.fillStyle = nb; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 220; i++) {
      const x = ((hash(i) * W - O.t * (4 + hash(i + 9) * 10)) % W + W) % W, y = hash(i + 50) * H;
      const tw = 0.5 + 0.5 * Math.sin(S.t * 3 + i);
      const sz = hash(i + 7) > 0.9 ? 3 : 1.6;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + tw * 0.55})`; ctx.fillRect(x, y, sz, sz);
    }
    // small moon
    const ma = O.t * 0.25;
    const mx = cx + Math.cos(ma) * R * 2.7, my = cy + Math.sin(ma) * R * 0.9 - R * 0.3;
    ctx.fillStyle = '#c9c4e6'; A.circle(ctx, mx, my, R * 0.13); ctx.fill();
    ctx.fillStyle = 'rgba(20,10,60,.3)'; A.circle(ctx, mx + R * 0.04, my + R * 0.03, R * 0.11); ctx.fill();
    // atmosphere
    [[1.32, 0.08], [1.2, 0.12], [1.1, 0.2]].forEach(([k, a]) => { ctx.fillStyle = `rgba(${P.atmo},${a})`; A.circle(ctx, cx, cy, R * k); ctx.fill(); });
    // planet body
    ctx.save(); A.circle(ctx, cx, cy, R); ctx.clip();
    ctx.fillStyle = P.sea; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    const spin = O.t * R * 0.12, span = R * 2.8;
    for (let i = 0; i < 14; i++) {
      const a = hash(i * 2.1) * Math.PI * 2, d = Math.sqrt(hash(i + 3)) * R * 0.9;
      const lx = cx + ((((Math.cos(a) * d + spin) + span / 2) % span + span) % span - span / 2);
      const ly = cy + Math.sin(a) * d * 0.85;
      const rx = R * (0.2 + hash(i + 2) * 0.22), ry = rx * (0.55 + hash(i + 6) * 0.3), rr2 = hash(i + 8) * 1.2 - 0.6;
      ctx.fillStyle = P.land; ctx.beginPath(); ctx.ellipse(lx, ly, rx, ry, rr2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx + rx * 0.5, ly - ry * 0.3, rx * 0.6, ry * 0.7, rr2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.land2; ctx.beginPath(); ctx.ellipse(lx + rx * 0.1, ly + ry * 0.15, rx * 0.45, ry * 0.4, rr2, 0, Math.PI * 2); ctx.fill();
      if (S.env === 'city') { ctx.fillStyle = '#ffe9a8'; for (let j = 0; j < 7; j++) ctx.fillRect(lx + (hash(i * 9 + j) - 0.5) * rx * 1.4, ly + (hash(i * 7 + j) - 0.5) * ry * 1.2, 2.5, 2.5); }
    }
    ctx.fillStyle = P.cap;
    ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.98, R * 0.55, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.98, R * 0.45, R * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    // flat cloud streaks over the planet
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 5; i++) {
      const x = cx + ((((hash(i + 30) * 2.6 + O.t * 0.2) % 2.6) + 2.6) % 2.6 - 1.3) * R * 1.3, y = cy + (hash(i + 40) - 0.5) * R * 1.5;
      A.rr(ctx, x, y, R * (0.3 + hash(i) * 0.3), R * 0.06, R * 0.03); ctx.fill();
    }
    // terminator shading (flat crescent)
    ctx.fillStyle = 'rgba(12,6,45,.38)';
    ctx.beginPath(); ctx.rect(cx - R, cy - R, R * 2, R * 2); ctx.arc(cx - R * 0.2, cy - R * 0.16, R * 1.0, 0, Math.PI * 2); ctx.fill('evenodd');
    ctx.fillStyle = 'rgba(255,255,255,.12)'; A.circle(ctx, cx - R * 0.35, cy - R * 0.35, R * 0.35); ctx.fill();
    ctx.restore();
    // launch-site pin on top
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 1.5, cy - R - R * 0.16, 3, R * 0.16);
    ctx.fillStyle = '#e8475b'; ctx.beginPath(); ctx.moveTo(cx + 1.5, cy - R - R * 0.16); ctx.lineTo(cx + R * 0.1, cy - R - R * 0.12); ctx.lineTo(cx + 1.5, cy - R - R * 0.08); ctx.fill();
    // orbit path
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.setLineDash([6, 12]);
    A.circle(ctx, cx, cy, g.r); ctx.stroke(); ctx.setLineDash([]);
    // orbit coins
    for (const c of O.coins) {
      if (c.got) continue;
      const p = orbitPos(c.p);
      const sq = Math.abs(Math.cos(S.t * 4 + c.p * 20));
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(c.gem ? 1 : Math.max(0.2, sq), 1);
      ctx.fillStyle = c.gem ? '#56e0ff' : '#ffd23f'; A.circle(ctx, 0, 0, R * (c.gem ? 0.07 : 0.055)); ctx.fill();
      ctx.fillStyle = c.gem ? '#b5f3ff' : '#f4a100'; A.circle(ctx, 0, 0, R * (c.gem ? 0.035 : 0.03)); ctx.fill();
      ctx.restore();
    }
    // trail
    const skin = NO.Save.data.bomb;
    for (let i = 26; i >= 1; i--) {
      const p = orbitPos(O.prog - i * 0.011);
      const k = 1 - i / 27;
      let col = `rgba(255,255,255,${k * 0.7})`;
      if (skin === 'rainbow') col = `hsla(${(i * 14 + S.t * 300) % 360},95%,62%,${k})`;
      else if (skin === 'neon') col = i % 2 ? `rgba(0,245,255,${k})` : `rgba(255,43,214,${k})`;
      else if (skin === 'alienbomb') col = `rgba(157,255,138,${k})`;
      else if (skin === 'golden') col = `rgba(255,225,120,${k})`;
      ctx.fillStyle = col; A.circle(ctx, p.x, p.y, R * 0.07 * k + 2); ctx.fill();
    }
    // bomb
    const p = orbitPos(O.prog);
    A.drawBomb(ctx, skin, p.x, p.y, R * 0.34, p.a + Math.PI / 2, S.t, 0);
    // labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(18, R * 0.16)}px "Fredoka", "Arial Rounded MT Bold", sans-serif`;
    const label = O.phase === 'exit' ? 'DE-ORBITING...' : 'ORBIT  ·  LAP ' + (O.laps + 1);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillText(label, cx, H - Math.max(40, H * 0.07) + 3);
    ctx.fillStyle = '#ffe14d'; ctx.fillText(label, cx, H - Math.max(40, H * 0.07));
  }

  const speedLineSeeds = Array.from({ length: 26 }, (_, i) => ({ y: hash(i * 3.3), x: hash(i * 7.7), l: 0.3 + hash(i) * 0.7 }));
  function drawSpeedLines(k) {
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + k * 0.35})`; ctx.lineWidth = 2;
    for (const s of speedLineSeeds) {
      const len = (60 + s.l * 160) * k;
      const x = ((s.x * W - S.t * 2400 * (0.5 + s.l)) % (W + len) + W + len) % (W + len) - len;
      ctx.beginPath(); ctx.moveTo(x, s.y * H); ctx.lineTo(x + len, s.y * H); ctx.stroke();
    }
  }

  function drawOffscreenArrow(v) {
    const x = v.sx(S.bomb.x);
    ctx.fillStyle = '#ff3366';
    ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x - 12, 32); ctx.lineTo(x + 12, 32); ctx.closePath(); A.fillStroke(ctx, '#ff3366', 2);
    ctx.font = '16px "Fredoka", "Arial Rounded MT Bold", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(Math.round(S.bomb.y) + 'm', x, 50);
  }

  // Fan-shaped power gauge anchored at the bomb on its tee.
  const FAN_A0 = -0.08, FAN_A1 = 1.45;   // radians above horizontal
  const FAN_BANDS = ['#e8475b', '#f2723b', '#f7a531', '#f9d23c', '#c8e04a', '#5fd36a'];
  function drawPowerMeter(v) {
    const b = S.bomb;
    const cx = v.sx(b.x) + 0.2 * v.ppm, cy = v.sy(b.y);
    const R = Math.min(Math.max(3.2 * v.ppm, 110), H * 0.38), r0 = R * 0.22;
    const ang = (p) => -(FAN_A0 + (FAN_A1 - FAN_A0) * p);     // canvas angle (y down)
    ctx.save();
    // white rim
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, R + 7, ang(0) + 0.05, ang(1) - 0.05, true); ctx.arc(cx, cy, r0 - 6, ang(1) - 0.1, ang(0) + 0.1, false); ctx.closePath(); ctx.fill();
    // colour bands by power
    const n = FAN_BANDS.length;
    for (let i = 0; i < n; i++) {
      const p0 = i / n, p1 = i === n - 1 ? 1 : (i + 1) / n;
      ctx.fillStyle = FAN_BANDS[i];
      ctx.beginPath(); ctx.arc(cx, cy, R, ang(p0), ang(p1), true); ctx.arc(cx, cy, r0, ang(p1), ang(p0), false); ctx.closePath(); ctx.fill();
    }
    // perfect zone highlight
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(cx, cy, R, ang(C.PERFECT_THRESHOLD), ang(1), true); ctx.arc(cx, cy, r0, ang(1), ang(C.PERFECT_THRESHOLD), false); ctx.closePath(); ctx.fill();
    // light cone behind the needle
    const na = ang(S.power);
    const cone = ctx.createRadialGradient(cx, cy, r0 * 0.5, cx, cy, R);
    cone.addColorStop(0, 'rgba(255,255,255,.65)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, na + 0.16, na - 0.16, true); ctx.closePath(); ctx.fill();
    // needle arrow
    ctx.translate(cx, cy); ctx.rotate(na);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(r0 * 0.6, -3, R * 0.95 - r0 * 0.6, 6);
    ctx.beginPath(); ctx.moveTo(R * 1.02, 0); ctx.lineTo(R * 0.86, -11); ctx.lineTo(R * 0.86, 11); ctx.closePath(); ctx.fill();
    ctx.restore();
    // labels
    ctx.font = `700 ${Math.max(16, R * 0.13)}px "Fredoka", "Arial Rounded MT Bold", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillText(Math.round(S.power * 100) + '%', cx + R * 0.2 + 2, cy + R * 0.2 + 3);
    ctx.fillStyle = '#fff'; ctx.fillText(Math.round(S.power * 100) + '%', cx + R * 0.2, cy + R * 0.2);
    if (S.power >= C.PERFECT_THRESHOLD) {
      ctx.fillStyle = '#ffe14d'; ctx.fillText('PERFECT!', cx - R * 0.15, cy - R * 1.12);
    }
  }

  function drawFlyers() {
    const tgt = S.flyTarget || { x: W - 60, y: 30 };
    for (const f of S.flyers) {
      const e = A.easeOut(f.t);
      const x = lerp(f.x, tgt.x, e), y = lerp(f.y, tgt.y, e) - Math.sin(f.t * Math.PI) * 60;
      const r = 9 * (1 - f.t * 0.4);
      A.circle(ctx, x, y, r, f.gem ? '#56e0ff' : '#ffd23f');
    }
  }

  const flakes = Array.from({ length: 80 }, (_, i) => ({ x: hash(i * 1.1), y: hash(i * 2.2), s: 1 + hash(i * 3.3) * 2.5 }));
  function drawSnowfall(v) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const f of flakes) {
      const x = ((f.x * W - v.camX * v.ppm * 0.6 * (f.s / 3) + Math.sin(S.t + f.y * 10) * 20) % W + W) % W;
      const y = ((f.y * H + S.t * 40 * f.s + v.camY * v.ppm * 0.4) % H + H) % H;
      A.circle(ctx, x, y, f.s); ctx.fill();
    }
  }

  /* ------------------------------- loop -------------------------------- */
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 1 / 20);
    if (S.mode === 'results') S.resultsT = (S.resultsT || 0) + dt; else S.resultsT = 0;
    update(dt);
    render();
    NO.UI.tick(dt, S.t);
    requestAnimationFrame(frame);
  }

  function setFast(on) { S.timeScale = on ? 3 : 1; }

  /* ------------------------------ input -------------------------------- */
  canvas.addEventListener('pointerdown', (e) => {
    NO.Audio.init();
    if (S.mode === 'aim') { e.preventDefault(); triggerLaunch(); }
    else if (S.mode === 'flight' || S.mode === 'orbit') { e.preventDefault(); tapDown(e); }
  });
  window.addEventListener('pointerup', () => tapUp());
  window.addEventListener('pointercancel', () => tapUp());
  window.addEventListener('blur', () => tapUp());
  let tapping = false;
  function tapDown(e) { if (tapping) return; tapping = true; S.tapping = true; NO.Mods.emit('tap', S, e || null); }
  function tapUp() { if (!tapping) return; tapping = false; S.tapping = false; NO.Mods.emit('tapEnd', S); }

  function boot() {
    resetScene();
    toMenu();
    requestAnimationFrame((t) => { last = t; frame(t); });
  }

  return {
    boot, startAim, toMenu, triggerLaunch, setFast, tapDown, tapUp,
    /* helpers for feature mods (see js/mods.js) */
    api: {
      get S() { return S; }, get ctx() { return ctx; }, get canvas() { return canvas; },
      get W() { return W; }, get H() { return H; }, get PPM() { return PPM_BASE; },
      view, popup, gravity, orbitGeom, orbitPos,
      addCoins(n, label) {
        if (!S.run || !(n > 0)) return;
        n = Math.round(n); S.run.modCoins = (S.run.modCoins || 0) + n;
        if (label) { const row = S.run.modRows.find((r) => r.label === label); if (row) row.coins += n; else S.run.modRows.push({ label, coins: n }); }
      },
    },
    // test hook: advance the simulation without requestAnimationFrame (e.g. hidden tab)
    debugStep(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) update(1 / 60); render(); return S.mode; },
    get state() { return S; },
    refreshEnv() { S.env = NO.Save.data.env; S.phys = NO.physicsFor(NO.Save.data.up); },
    drawEnvThumb(c2, envId) {
      const w = c2.width, h = c2.height;
      const ppm = Math.min(h / 9, w / 14);
      const v = { W: w, H: h, ppm, ppmBG: ppm, anchorX: 0.1, groundFrac: 0.78, camX: 30, camY: 0, t: S.t, zoom: 1,
        sx: (wx) => (wx - 30) * ppm + w * 0.1, sy: (wy) => h * 0.78 - wy * ppm };
      const g = c2.getContext('2d');
      A.drawWorldBack(g, envId, v);
      A.drawWorldFront(g, envId, v, 0, 0);
    },
  };
})();
