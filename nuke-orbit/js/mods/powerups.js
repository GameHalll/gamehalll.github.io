/* =========================================================================
   NUKE ORBIT mod: powerups
   Rare floating pickup bubbles along the flight path. Fly through one to get
   a short effect:
     MAGNET        pulls nearby coins into the bomb for 6 s
     COIN x2       coins collected in the next 8 s pay double
     ROCKET        instant forward + up kick
     SUPER BOUNCE  next 3 bounces keep much more speed
     FEATHER       low gravity for 5 s
   Active effects are shown as timer badges at the top-center of the HUD.
   ========================================================================= */
'use strict';

(function () {
  const ID = 'powerups';
  const TAU = Math.PI * 2;
  const FONT = '"Fredoka", "Arial Rounded MT Bold", sans-serif';

  /* ------------------------------ tuning -------------------------------- */
  const T = {
    FIRST_MIN: 45, FIRST_RAND: 110,     // first bubble between 45 and 155 m
    GAP_MIN: 150, GAP_RAND: 150,        // then one every 150..300 m
    BUBBLE_R: 0.95,                     // bubble radius (m)
    GRAB_PAD: 0.45,                     // extra pickup reach (m)
    HOME_R: 5,                          // bubbles drift toward a bomb closer than this (m)
    MAGNET_T: 6, MAGNET_R: 10, MAGNET_PULL: 9,
    X2_T: 8,
    ROCKET_K: 0.26, ROCKET_MIN: 14, ROCKET_MAX: 42,  // kick = 26% of launch speed, clamped
    SB_COUNT: 3, SB_REST: 0.3, SB_REST_MAX: 0.9, SB_KEEPX: 0.97,
    FEATHER_T: 5, FEATHER_G: 0.55,      // cancels 55% of gravity while airborne
  };

  const TYPES = {
    magnet:  { name: 'MAGNET!',       color: '#e8475b', light: '#ffb3bd', w: 22 },
    x2:      { name: 'COINS x2!',     color: '#ffd23f', light: '#fff1a8', w: 22 },
    rocket:  { name: 'ROCKET!',       color: '#ff8a2a', light: '#ffd0a3', w: 18 },
    bounce:  { name: 'SUPER BOUNCE!', color: '#3fcf6a', light: '#b8f5c9', w: 20 },
    feather: { name: 'FEATHER!',      color: '#58c4ff', light: '#cdeeff', w: 18 },
  };
  const TYPE_IDS = Object.keys(TYPES);
  const W_TOTAL = TYPE_IDS.reduce((s, k) => s + TYPES[k].w, 0);
  function pickType() {
    let r = Math.random() * W_TOTAL;
    for (const k of TYPE_IDS) { r -= TYPES[k].w; if (r <= 0) return k; }
    return 'magnet';
  }

  /* ------------------------------- state -------------------------------- */
  const P = {
    items: [], head: 0, nextX: 0,
    fx: { magnet: 0, x2: 0, feather: 0, bounce: 0, rocket: 0 },  // seconds left (bounce = charges)
    lastCollected: 0, x2Bonus: 0,
    reach: 2,        // pickup reach (m); grows when zoomed out so it matches the drawn bubble
    pops: [],        // pop rings: { x, y, life, color }
    hudPulse: {},    // per-effect badge pop-in animation
  };

  function clearAll() {
    P.items.length = 0; P.head = 0; P.pops.length = 0;
    P.nextX = T.FIRST_MIN + Math.random() * T.FIRST_RAND;
    endEffects();
  }
  function endEffects() {
    P.fx.magnet = 0; P.fx.x2 = 0; P.fx.feather = 0; P.fx.bounce = 0; P.fx.rocket = 0;
    P.hudPulse = {};
  }

  /* ------------------------------- sound -------------------------------- */
  let ac = null, master = null;
  function audioInit() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC(); master = ac.createGain(); master.gain.value = 0.4; master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  window.addEventListener('pointerdown', audioInit, { passive: true });
  window.addEventListener('keydown', audioInit, { passive: true });
  const muted = () => !ac || ac.state !== 'running' || (NO.Save && NO.Save.data && NO.Save.data.muted);
  function tone(f, dur, type, vol, slideTo, delay) {
    if (muted()) return;
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, vol, f0, f1, type) {
    if (muted()) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.8), ac.sampleRate);
      const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const t0 = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + 0.05);
  }
  const SFX = {
    pop() { noise(0.09, 0.5, 2600, 900, 'bandpass'); tone(900, 0.08, 'sine', 0.2, 1500); },
    magnet() { [0, 1, 2, 3].forEach((i) => tone(330 + i * 110, 0.1, 'square', 0.07, 380 + i * 130, 0.05 + i * 0.06)); },
    x2() { [0, 4, 7, 12, 16].forEach((s, i) => tone(784 * Math.pow(2, s / 12), 0.12, 'square', 0.07, null, 0.04 + i * 0.05)); },
    rocket() { noise(0.6, 0.45, 600, 4000, 'bandpass'); tone(160, 0.5, 'sawtooth', 0.12, 700, 0.03); },
    bounce() { tone(220, 0.35, 'sine', 0.3, 880, 0.03); tone(440, 0.25, 'triangle', 0.1, 1320, 0.12); },
    feather() { [12, 7, 4, 0].forEach((s, i) => tone(1046 * Math.pow(2, s / 12), 0.3, 'triangle', 0.08, null, 0.04 + i * 0.08)); },
    superBoing() { tone(300, 0.3, 'sine', 0.25, 900); },
  };

  /* --------------------------- icon drawing ----------------------------- */
  // all icons drawn centred at (0,0), fitting inside radius s
  function iconMagnet(ctx, s) {
    ctx.save(); ctx.rotate(-0.5);
    ctx.lineCap = 'butt'; ctx.lineWidth = s * 0.42;
    ctx.strokeStyle = '#e8475b';
    ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.42, Math.PI, 0, false); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.06); ctx.lineTo(-s * 0.42, s * 0.3); ctx.moveTo(s * 0.42, -s * 0.06); ctx.lineTo(s * 0.42, s * 0.3); ctx.stroke();
    ctx.strokeStyle = '#eef0f6';
    ctx.beginPath(); ctx.moveTo(-s * 0.42, s * 0.3); ctx.lineTo(-s * 0.42, s * 0.62); ctx.moveTo(s * 0.42, s * 0.3); ctx.lineTo(s * 0.42, s * 0.62); ctx.stroke();
    ctx.lineWidth = s * 0.1; ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.5, Math.PI * 1.15, Math.PI * 1.5); ctx.stroke();
    ctx.restore();
  }
  function iconX2(ctx, s) {
    ctx.fillStyle = '#f4a100'; ctx.beginPath(); ctx.arc(0, s * 0.06, s * 0.66, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, s * 0.66, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4a100'; ctx.beginPath(); ctx.arc(0, 0, s * 0.48, 0, TAU); ctx.fill();
    ctx.font = `700 ${s * 0.72}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7a4a00'; ctx.fillText('x2', 0, s * 0.1);
    ctx.fillStyle = '#fff6c0'; ctx.fillText('x2', 0, s * 0.04);
  }
  function iconRocket(ctx, s, t) {
    ctx.save(); ctx.rotate(-0.75);
    // flame
    const fl = 0.85 + Math.sin((t || 0) * 40) * 0.15;
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-s * 0.18, s * 0.42); ctx.quadraticCurveTo(0, s * (0.42 + 0.5 * fl), s * 0.18, s * 0.42); ctx.fill();
    ctx.fillStyle = '#ff6b35'; ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.42); ctx.quadraticCurveTo(0, s * (0.42 + 0.3 * fl), s * 0.1, s * 0.42); ctx.fill();
    // fins
    ctx.fillStyle = '#e8475b';
    ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.05); ctx.lineTo(-s * 0.42, s * 0.48); ctx.lineTo(-s * 0.2, s * 0.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.05); ctx.lineTo(s * 0.42, s * 0.48); ctx.lineTo(s * 0.2, s * 0.4); ctx.fill();
    // body
    ctx.fillStyle = '#f2f3f8';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.72); ctx.quadraticCurveTo(s * 0.3, -s * 0.35, s * 0.22, s * 0.44); ctx.lineTo(-s * 0.22, s * 0.44); ctx.quadraticCurveTo(-s * 0.3, -s * 0.35, 0, -s * 0.72); ctx.fill();
    ctx.fillStyle = 'rgba(25,12,70,.14)';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.72); ctx.quadraticCurveTo(s * 0.3, -s * 0.35, s * 0.22, s * 0.44); ctx.lineTo(s * 0.05, s * 0.44); ctx.quadraticCurveTo(s * 0.1, -s * 0.3, 0, -s * 0.72); ctx.fill();
    ctx.fillStyle = '#e8475b';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.72); ctx.quadraticCurveTo(s * 0.17, -s * 0.55, s * 0.21, -s * 0.38); ctx.lineTo(-s * 0.21, -s * 0.38); ctx.quadraticCurveTo(-s * 0.17, -s * 0.55, 0, -s * 0.72); ctx.fill();
    ctx.fillStyle = '#58c4ff'; ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.12, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function iconBounce(ctx, s, t) {
    const sq = 1 + Math.sin((t || 0) * 6) * 0.12;
    // spring
    ctx.strokeStyle = '#2b2d35'; ctx.lineWidth = s * 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const top = s * 0.02 * sq - s * 0.1, bot = s * 0.62, n = 4;
    ctx.beginPath(); ctx.moveTo(0, bot);
    for (let i = 0; i <= n; i++) { const y = bot - (bot - top) * (i / n); ctx.lineTo(i % 2 ? s * 0.32 : -s * 0.32, y); }
    ctx.stroke();
    ctx.fillStyle = '#4a4e5a'; ctx.fillRect(-s * 0.45, bot - s * 0.02, s * 0.9, s * 0.14);
    // ball
    ctx.fillStyle = '#3fcf6a'; ctx.beginPath(); ctx.arc(0, top - s * 0.3, s * 0.34, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(-s * 0.1, top - s * 0.4, s * 0.1, 0, TAU); ctx.fill();
  }
  function iconFeather(ctx, s, t) {
    ctx.save(); ctx.rotate(0.6 + Math.sin((t || 0) * 2.5) * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.75);
    ctx.bezierCurveTo(s * 0.42, -s * 0.45, s * 0.38, s * 0.2, 0, s * 0.45);
    ctx.bezierCurveTo(-s * 0.38, s * 0.2, -s * 0.42, -s * 0.45, 0, -s * 0.75); ctx.fill();
    ctx.fillStyle = '#8fd0ff';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.75);
    ctx.bezierCurveTo(s * 0.42, -s * 0.45, s * 0.38, s * 0.2, 0, s * 0.45); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3a6ea8'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.72); ctx.stroke();
    ctx.lineWidth = Math.max(1, s * 0.04); ctx.strokeStyle = 'rgba(127,138,168,.6)';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const y = -s * 0.35 + i * s * 0.22; ctx.moveTo(0, y); ctx.lineTo(-s * 0.22, y + s * 0.12); ctx.moveTo(0, y); ctx.lineTo(s * 0.22, y + s * 0.12); }
    ctx.stroke();
    ctx.restore();
  }
  const ICONS = { magnet: iconMagnet, x2: iconX2, rocket: iconRocket, bounce: iconBounce, feather: iconFeather };

  function drawBubble(ctx, x, y, r, type, t, alpha) {
    const ty = TYPES[type];
    ctx.save(); ctx.translate(x, y);
    if (alpha < 1) ctx.globalAlpha = alpha;
    const wob = Math.sin(t * 5) * 0.04;
    ctx.scale(1 + wob, 1 - wob);
    // glow halo
    ctx.fillStyle = ty.color; ctx.globalAlpha = alpha * (0.18 + 0.08 * Math.sin(t * 4));
    ctx.beginPath(); ctx.arc(0, 0, r * 1.28, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha;
    // bubble body
    ctx.fillStyle = ty.light; ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(2, r * 0.09); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    ctx.lineWidth = Math.max(1.5, r * 0.05); ctx.strokeStyle = ty.color;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.stroke();
    // icon
    ICONS[type](ctx, r * 0.72, t);
    // glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(-r * 0.42, -r * 0.48, r * 0.22, r * 0.11, -0.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.66, -r * 0.18, r * 0.06, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ----------------------------- gameplay ------------------------------- */
  function spawnIn(S, x0, len, apex) {
    const x1 = x0 + len;
    if (P.nextX < x0) P.nextX = x0 + Math.random() * len;   // skipped ahead (e.g. after orbit re-entry)
    while (P.nextX < x1) {
      const x = P.nextX;
      const hi = Math.max(5, Math.min(apex, 400) * 0.75);
      // 40% low (catchable by bounces / rolls), else somewhere up the arc
      const y = Math.random() < 0.4 ? 1.5 + Math.random() * 2 : 2.5 + Math.pow(Math.random(), 1.5) * hi;
      P.items.push({ x, y, bx: x, by: y, type: pickType(), ph: Math.random() * TAU, got: false });
      P.nextX += T.GAP_MIN + Math.random() * T.GAP_RAND;
    }
  }

  function collect(S, it, b) {
    it.got = true;
    const api = NO.Game.api, ty = TYPES[it.type];
    api.popup(it.x, it.y + 1.6, ty.name, ty.color, 1.25, true);
    // pop particles
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + Math.random() * 0.3, sp = 5 + Math.random() * 6;
      S.particles.push({ k: 'spark', x: it.x, y: it.y, vx: Math.cos(a) * sp + b.vx * 0.2, vy: Math.sin(a) * sp + b.vy * 0.2, life: 0, max: 0.45 + Math.random() * 0.2, size: 0.13, color: i % 2 ? ty.color : '#ffffff' });
    }
    P.pops.push({ x: it.x, y: it.y, life: 0, color: ty.color });
    S.cam.shake = Math.max(S.cam.shake, 0.25);
    SFX.pop(); SFX[it.type]();
    P.hudPulse[it.type] = 0;
    const st = NO.Mods.store(ID); st.picked = (st.picked || 0) + 1;

    switch (it.type) {
      case 'magnet': P.fx.magnet = T.MAGNET_T; break;
      case 'x2': P.fx.x2 = T.X2_T; break;
      case 'feather': P.fx.feather = T.FEATHER_T; break;
      case 'bounce':
        P.fx.bounce = T.SB_COUNT;
        if (b.rolling) { b.rolling = false; b.vy = Math.max(9, b.vx * 0.3); b.y = Math.max(b.y, 0.6); }
        break;
      case 'rocket': {
        const ls = (S.run && S.run.launchSpeed) || 30;
        const k = Math.max(T.ROCKET_MIN, Math.min(T.ROCKET_MAX, ls * T.ROCKET_K));
        b.vx = Math.max(b.vx, 0) + k * 0.75;
        b.vy = Math.max(b.vy, 0) + k * 0.7;
        if (b.rolling) { b.rolling = false; b.y = Math.max(b.y, 0.6); }
        P.fx.rocket = 0.7;  // flame trail duration
        S.flash = Math.max(S.flash, 0.25);
        break;
      }
    }
  }

  function checkPickups(S, b) {
    const items = P.items;
    while (P.head < items.length && (items[P.head].got || items[P.head].x < b.x - 4)) P.head++;
    const reach = P.reach, r2 = reach * reach;
    for (let i = P.head; i < items.length && i < P.head + 3; i++) {
      const it = items[i];
      if (it.got) continue;
      const dx = it.x - b.x;
      if (dx > reach + 1) break;
      const dy = it.y - b.y;
      if (dx * dx + dy * dy < r2) collect(S, it, b);
    }
  }

  function applyMagnet(S, dt, b) {
    const R = T.MAGNET_R, R2 = R * R, k = 1 - Math.exp(-T.MAGNET_PULL * dt);
    const coins = S.coins;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.got) continue;
      const dx = b.x - c.x;
      if (dx > R || dx < -R) continue;
      const dy = b.y - c.y;
      if (dx * dx + dy * dy > R2) continue;
      // follow the bomb and close the gap
      c.x += b.vx * dt + dx * k;
      c.y += b.vy * dt + dy * k;
      if (c.y < 0.5) c.y = 0.5;
      c._mag = 1;
    }
  }

  /* -------------------------------- mod --------------------------------- */
  NO.Mods.register({
    id: ID,

    reset() { clearAll(); P.lastCollected = 0; },
    aim(S) { clearAll(); P.lastCollected = S.run ? S.run.collected : 0; P.x2Bonus = 0; },
    boom(S) {
      if (P.fx.x2 > 0) this.update(S, 0, 0);  // settle a last x2 delta
      endEffects(); P.items.length = 0; P.head = 0;
    },

    chunk(S, x0, len, apex) { spawnIn(S, x0, len, apex); },

    physics(S, dt, b) {
      if (P.fx.feather > 0 && !b.rolling) b.vy += NO.Game.api.gravity() * T.FEATHER_G * dt;
      if (P.items.length) checkPickups(S, b);
    },

    bounce(S, impact, b) {
      if (P.fx.bounce <= 0) return;
      P.fx.bounce--;
      const rest = Math.min(T.SB_REST_MAX, S.phys.restitution + T.SB_REST);
      b.vy = Math.max(b.vy, impact * rest);
      b.vx = Math.max(b.vx, (b.vx / Math.max(0.01, S.phys.keepX)) * Math.max(S.phys.keepX, T.SB_KEEPX));
      NO.Game.api.popup(b.x, 3.5, 'SUPER BOING!', '#3fcf6a', 1.1, true);
      P.pops.push({ x: b.x, y: 0.3, life: 0, color: '#3fcf6a' });
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * (0.1 + 0.8 * Math.random()), sp = 4 + Math.random() * 6;
        S.particles.push({ k: 'spark', x: b.x, y: 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.5, size: 0.14, color: i % 2 ? '#3fcf6a' : '#ffffff' });
      }
      SFX.superBoing();
    },

    update(S, dt) {
      if (!S.run) return;
      // COIN x2: double whatever was collected this frame (flight only; orbit coins excluded)
      const d = S.run.collected - P.lastCollected;
      P.lastCollected = S.run.collected;
      if (d > 0 && P.fx.x2 > 0 && (S.mode === 'flight' || S.mode === 'boom')) {
        NO.Game.api.addCoins(d, 'Power-ups');
        P.x2Bonus += d;
      }
      for (const k in P.hudPulse) P.hudPulse[k] += dt;
      if (P.pops.length) { for (const p of P.pops) p.life += dt; P.pops = P.pops.filter((p) => p.life < 0.45); }
      if (S.mode !== 'flight') return;
      const b = S.bomb;
      const ppm = NO.Game.api.view().ppm;
      P.reach = Math.min(3.2, Math.max(T.BUBBLE_R + NO.CONFIG.BOMB_RADIUS + T.GRAB_PAD, (20 + 0.6 * 1.75 * ppm) / ppm));
      // timers
      const fx = P.fx;
      if (fx.magnet > 0) { fx.magnet = Math.max(0, fx.magnet - dt); applyMagnet(S, dt, b); }
      if (fx.x2 > 0) {
        fx.x2 = Math.max(0, fx.x2 - dt);
        if (Math.random() < 0.25) S.particles.push({ k: 'spark', x: b.x + (Math.random() - 0.5) * 1.6, y: b.y + (Math.random() - 0.5) * 1.6, vx: -b.vx * 0.05, vy: 1, life: 0, max: 0.5, size: 0.11, color: '#ffe066' });
      }
      if (fx.feather > 0) {
        fx.feather = Math.max(0, fx.feather - dt);
        if (Math.random() < 0.2) S.particles.push({ k: 'glow', x: b.x + (Math.random() - 0.5), y: b.y + (Math.random() - 0.5), vx: -b.vx * 0.05, vy: -0.5, life: 0, max: 0.8, size: 0.25, color: 'rgba(205,238,255,.9)' });
      }
      if (fx.rocket > 0) {
        fx.rocket = Math.max(0, fx.rocket - dt);
        const ang = Math.atan2(b.vy, b.vx), tx = b.x - Math.cos(ang) * 1.1, ty = b.y - Math.sin(ang) * 1.1;
        for (let i = 0; i < 2; i++) S.particles.push({ k: 'glow', x: tx + (Math.random() - 0.5) * 0.4, y: ty + (Math.random() - 0.5) * 0.4, vx: -b.vx * 0.15, vy: -b.vy * 0.15, life: 0, max: 0.4, size: 0.5 + Math.random() * 0.4, color: ['#ffd23f', '#ff8a2a'][i] });
      }
      // bubbles: bob + gentle homing toward a close bomb; prune old ones
      const items = P.items;
      for (let i = P.head; i < items.length; i++) {
        const it = items[i];
        if (it.got) continue;
        if (it.bx > b.x + 200) break;
        it.ph += dt * 2.4;
        const tx = it.bx, ty = it.by + Math.sin(it.ph) * 0.35;
        const dx = b.x - it.x, dy = b.y - it.y, d2 = dx * dx + dy * dy;
        if (d2 < T.HOME_R * T.HOME_R) {
          const k = 1 - Math.exp(-3 * dt);
          it.x += dx * k * 0.5; it.y += dy * k * 0.5;
        } else { it.x = tx; it.y = ty; }
      }
      if (P.head > 30) { items.splice(0, P.head); P.head = 0; }
    },

    renderWorld(ctx, v, S) {
      if (!P.items.length) return;
      const r = Math.max(20, T.BUBBLE_R * v.ppm);
      for (let i = P.head; i < P.items.length; i++) {
        const it = P.items[i];
        if (it.got) continue;
        const x = v.sx(it.x);
        if (x > v.W + r * 2) break;
        if (x < -r * 2) continue;
        const y = v.sy(it.y);
        if (y < -r * 2 || y > v.H + r * 2) continue;
        drawBubble(ctx, x, y, r, it.type, S.t + it.ph, 1);
      }
    },

    renderFront(ctx, v, S) {
      // pop rings
      for (const p of P.pops) {
        const f = p.life / 0.45, r = Math.max(14, 1.2 * v.ppm) * (0.6 + f * 1.4);
        ctx.globalAlpha = 1 - f; ctx.strokeStyle = p.color; ctx.lineWidth = 5 * (1 - f) + 1;
        ctx.beginPath(); ctx.arc(v.sx(p.x), v.sy(p.y), r, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (S.mode !== 'flight' || !S.bomb) return;
      const b = S.bomb, bx = v.sx(b.x), by = v.sy(b.y), br = Math.max(12, 1.15 * v.ppm);
      if (P.fx.magnet > 0) {
        const ph = (S.t * 1.6) % 1;
        ctx.strokeStyle = '#e8475b';
        for (let i = 0; i < 2; i++) {
          const f = (ph + i * 0.5) % 1;
          ctx.globalAlpha = 0.55 * f; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(bx, by, br * (1 + (1 - f) * 2.2), 0, TAU); ctx.stroke();
        }
      }
      if (P.fx.bounce > 0) {
        ctx.globalAlpha = 0.5 + 0.2 * Math.sin(S.t * 10); ctx.strokeStyle = '#3fcf6a'; ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(bx, by, br * 1.1, S.t * 3, S.t * 3 + TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    },

    renderHUD(ctx, S, W) {
      if (S.mode !== 'flight' && S.mode !== 'boom') return;
      const list = [];
      const fx = P.fx;
      if (fx.magnet > 0) list.push(['magnet', fx.magnet / T.MAGNET_T, fx.magnet]);
      if (fx.x2 > 0) list.push(['x2', fx.x2 / T.X2_T, fx.x2]);
      if (fx.feather > 0) list.push(['feather', fx.feather / T.FEATHER_T, fx.feather]);
      if (fx.bounce > 0) list.push(['bounce', fx.bounce / T.SB_COUNT, -fx.bounce]);
      if (!list.length) return;
      const R = W < 600 ? 19 : 23, gap = R * 2 + 12;
      const y0 = 70 + R;
      let x = W / 2 - ((list.length - 1) * gap) / 2;
      for (const [type, frac, left] of list) {
        const ty = TYPES[type];
        const pt = P.hudPulse[type] == null ? 1 : P.hudPulse[type];
        const sc = pt < 0.3 ? 0.4 + 0.6 * (1 - Math.pow(1 - pt / 0.3, 3)) * 1.15 : 1;
        const blink = left > 0 && left < 1.5 && Math.sin(S.t * 22) < 0;
        ctx.save(); ctx.translate(x, y0); ctx.scale(sc, sc);
        if (blink) ctx.globalAlpha = 0.45;
        ctx.fillStyle = 'rgba(20,16,60,.35)'; ctx.beginPath(); ctx.arc(0, 3, R + 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1f1b4d'; ctx.beginPath(); ctx.arc(0, 0, R + 4, 0, TAU); ctx.fill();
        ctx.fillStyle = ty.light; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = blink ? 0.45 : 1;
        ctx.strokeStyle = ty.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, R + 1, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, frac)); ctx.stroke();
        ICONS[type](ctx, R * 0.7, S.t);
        if (left < 0) {  // charges badge
          const n = -left;
          ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(R * 0.78, R * 0.72, R * 0.42, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1f1b4d'; ctx.font = `700 ${R * 0.6}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(n), R * 0.78, R * 0.76);
        }
        ctx.restore();
        x += gap;
      }
    },
  });

  // debug helper for headless testing: NO.Mods.list.find(m => m.id==='powerups')._debug
  NO.Mods.list[NO.Mods.list.length - 1]._debug = {
    P, T,
    give(type) { const S = NO.Game.state; if (S.mode === 'flight') collect(S, { x: S.bomb.x, y: S.bomb.y, type, got: false }, S.bomb); },
  };
})();
