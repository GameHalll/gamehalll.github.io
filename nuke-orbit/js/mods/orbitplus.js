/* =========================================================================
   NUKE ORBIT mod: orbitplus — "Orbit spectacle"
   Draws on top of the core orbit view (renderOrbit) and adds:
     - twinkling parallax starfield, drifting nebula wisps, comets, a cratered moon
     - per-world atmosphere rim glow on the planet
     - glowing trail ring that follows the bomb along the orbit path
     - lap progress arc around the planet + lap pips
     - space junk / satellites on the orbit path, auto-smashed for bonus coins
     - "LAP x" fanfare (shockwaves, confetti, stamp text)
     - dramatic de-orbit fire streak while phase === 'exit'
   Only uses the event bus; never touches input.
   ========================================================================= */
'use strict';

(function () {
  if (!window.NO || !NO.Mods) return;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const FONT = '"Fredoka", "Arial Rounded MT Bold", sans-serif';

  // world tint (r,g,b) for rim glow, nebula and ring accents
  const WORLD = {
    country: { atmo: [120, 200, 255], neb: [90, 200, 255], ring: [140, 230, 255] },
    desert:  { atmo: [255, 180, 110], neb: [255, 140, 80], ring: [255, 210, 120] },
    snow:    { atmo: [200, 235, 255], neb: [150, 200, 255], ring: [210, 240, 255] },
    city:    { atmo: [255, 120, 210], neb: [255, 90, 200], ring: [255, 170, 230] },
    ocean:   { atmo: [100, 220, 255], neb: [60, 190, 230], ring: [130, 240, 255] },
    space:   { atmo: [190, 150, 255], neb: [170, 110, 255], ring: [210, 180, 255] },
  };
  const worldOf = (S) => WORLD[S.env] || WORLD.country;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // deterministic star seeds (3 parallax layers)
  const STARS = [];
  (function () {
    let s = 1337;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 110; i++) {
      const layer = i < 60 ? 0 : i < 92 ? 1 : 2;
      STARS.push({ x: r(), y: r(), layer, ph: r() * TAU, sp: 1.5 + r() * 3, hue: r() < 0.25 ? 'warm' : r() < 0.5 ? 'cool' : 'white' });
    }
  })();
  const LAYER_SPEED = [6, 16, 34];
  const LAYER_SIZE = [1.2, 1.9, 2.8];

  // per-orbit state (reset when a new S.orbit object appears)
  let st = null;
  function fresh(O) {
    return {
      O, t: 0, lastLaps: 0, junk: [], parts: [], rings: [], texts: [], comets: [],
      cometT: rnd(0.6, 1.6), fanfare: 0, fanLap: 0, exitEmb: 0, junkCoins: 0, smashed: 0,
    };
  }
  function ensure(S) {
    const O = S.orbit;
    if (!O) { st = null; return null; }
    if (!st || st.O !== O) { st = fresh(O); spawnJunk(S, 0); }
    return st;
  }

  // ----------------------------------------------------------- space junk
  const JUNK_TYPES = ['sat', 'sat', 'rock', 'dish', 'panel'];
  function junkValue(S, lap) {
    // ~8% of that lap's lap-bonus per item, at most 2 per lap -> stays under ~+16%
    const C = NO.CONFIG || {};
    return Math.max(6, Math.round((C.ORBIT_LAP_BONUS || 150) * (lap + 1) * 0.08));
  }
  function spawnJunk(S, lap) {
    const O = S.orbit;
    const n = Math.random() < 0.55 ? 2 : 1;
    const used = [];
    for (let i = 0; i < n; i++) {
      let p = 0, tries = 0;
      do {
        p = lap + rnd(0.22, 0.92);
        tries++;
      } while (tries < 12 && (O.coins.some((c) => Math.abs(c.p - p) < 0.04) || used.some((u) => Math.abs(u - p) < 0.12)));
      used.push(p);
      st.junk.push({ p, type: JUNK_TYPES[Math.floor(Math.random() * JUNK_TYPES.length)], rot: rnd(0, TAU), spin: rnd(-2, 2), wob: rnd(0, TAU), lap, hit: false });
    }
  }

  function smash(S, j, pos, R) {
    j.hit = true;
    const v = junkValue(S, j.lap);
    st.junkCoins += v; st.smashed++;
    NO.Game.api.addCoins(v, 'Space junk');
    const W = worldOf(S);
    const cols = ['#ffffff', '#ffd23f', '#ff8a3d', '#9ad8ff', rgba(W.ring, 1)];
    for (let i = 0; i < 26; i++) {
      const a = rnd(0, TAU), sp = rnd(60, 260) * (R / 140);
      st.parts.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.45, 0.9), size: rnd(2, 5) * (R / 140), col: cols[i % cols.length], kind: i % 3 === 0 ? 'shard' : 'spark', rot: rnd(0, TAU), vr: rnd(-12, 12) });
    }
    for (let i = 0; i < 4; i++) st.parts.push({ x: pos.x, y: pos.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0, max: 0.7, size: rnd(10, 16) * (R / 140), col: '#ffb347', kind: 'puff', rot: 0, vr: 0 });
    st.rings.push({ x: pos.x, y: pos.y, life: 0, max: 0.45, r0: R * 0.06, r1: R * 0.5, col: '#ffffff', w: 4 });
    st.texts.push({ x: pos.x, y: pos.y - R * 0.18, text: '+' + v, sub: ['SMASH!', 'CRUNCH!', 'KA-BLAM!', 'SPLAT!'][st.smashed % 4], life: 0, max: 1.1 });
    S.flash = Math.max(S.flash || 0, 0.12);
    S.flyers.push({ x: pos.x, y: pos.y, t: 0, gem: false });
    try { NO.Audio.whack(); NO.Audio.coin(6); } catch (e) { /* audio optional */ }
  }

  // ----------------------------------------------------------- lap fanfare
  function lapFanfare(S, lap, g) {
    st.fanfare = 1.4; st.fanLap = lap;
    const pos = NO.Game.api.orbitPos(S.orbit.prog);
    st.rings.push({ x: g.cx, y: g.cy, life: 0, max: 0.9, r0: g.R, r1: g.r * 1.9, col: rgba(worldOf(S).ring, 1), w: 6 });
    st.rings.push({ x: g.cx, y: g.cy, life: -0.15, max: 0.9, r0: g.R, r1: g.r * 1.5, col: '#ffe14d', w: 4 });
    const cols = ['#ffe14d', '#ff5a7a', '#56e0ff', '#9dff8a', '#ffffff', '#c58bff'];
    for (let i = 0; i < 40; i++) {
      const a = rnd(0, TAU), sp = rnd(80, 320) * (g.R / 140);
      st.parts.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.8, 1.4), size: rnd(3, 6) * (g.R / 140), col: cols[i % cols.length], kind: i % 2 ? 'star' : 'confetti', rot: rnd(0, TAU), vr: rnd(-10, 10) });
    }
    try { if (NO.Audio.perfect) NO.Audio.perfect(); } catch (e) { /* audio optional */ }
  }

  // ----------------------------------------------------------- update
  function update(S, dt) {
    const s = ensure(S);
    if (!s) return;
    const O = S.orbit, api = NO.Game.api, g = api.orbitGeom();
    s.t += dt;
    // lap change -> fanfare + new junk
    if (O.laps > s.lastLaps) {
      s.lastLaps = O.laps;
      lapFanfare(S, O.laps, g);
      if (O.phase === 'loop') spawnJunk(S, O.laps);
    }
    // smash junk the bomb reaches (orbitUpdate fires before O.prog advances, so look slightly ahead)
    for (const j of s.junk) {
      if (j.hit) continue;
      j.rot += j.spin * dt;
      if (O.prog >= j.p - 0.012) smash(S, j, api.orbitPos(j.p), g.R);
    }
    s.junk = s.junk.filter((j) => !j.hit);
    // particles
    for (const p of s.parts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = p.kind === 'confetti' ? 2.2 : 3;
      p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
      if (p.kind === 'confetti') p.vy += 60 * dt;
      p.rot += p.vr * dt;
    }
    s.parts = s.parts.filter((p) => p.life < p.max);
    for (const r of s.rings) r.life += dt;
    s.rings = s.rings.filter((r) => r.life < r.max);
    for (const x of s.texts) x.life += dt;
    s.texts = s.texts.filter((x) => x.life < x.max);
    if (s.fanfare > 0) s.fanfare -= dt;
    // comets
    s.cometT -= dt;
    const Wd = g.cx * 2, Hd = g.cy / 0.55;
    if (s.cometT <= 0 && s.comets.length < 2) {
      s.cometT = rnd(2.2, 4.5);
      const fromLeft = Math.random() < 0.5;
      const sp = rnd(260, 420) * (g.R / 140 + 0.3);
      const ang = (fromLeft ? 0 : Math.PI) + (fromLeft ? 1 : -1) * rnd(0.25, 0.6);
      s.comets.push({ x: fromLeft ? -40 : Wd + 40, y: rnd(0.04, 0.4) * Hd, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, hue: Math.random() < 0.5 ? [160, 230, 255] : [255, 210, 150] });
    }
    for (const c of s.comets) { c.life += dt; c.x += c.vx * dt; c.y += c.vy * dt; }
    s.comets = s.comets.filter((c) => c.life < 6 && c.x > -300 && c.x < Wd + 300 && c.y < Hd + 300);
    // de-orbit embers
    if (O.phase === 'exit') {
      s.exitEmb += dt * 70;
      const pos = api.orbitPos(O.prog), k = clamp(O.exitT / 1.5, 0, 1);
      const tx = -Math.sin(pos.a), ty = Math.cos(pos.a); // direction of travel
      while (s.exitEmb >= 1) {
        s.exitEmb -= 1;
        const sp = rnd(40, 160) * (g.R / 140);
        s.parts.push({ x: pos.x - tx * g.R * 0.15, y: pos.y - ty * g.R * 0.15, vx: -tx * sp + rnd(-40, 40), vy: -ty * sp + rnd(-40, 40), life: 0, max: rnd(0.3, 0.7), size: rnd(2, 4.5) * (g.R / 140) * (0.6 + k), col: Math.random() < 0.5 ? '#ffd23f' : '#ff6a2b', kind: 'ember', rot: 0, vr: 0 });
      }
    }
  }

  // ----------------------------------------------------------- drawing helpers
  function sparkle(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
  }
  function outside(g, x, y, k) { const dx = x - g.cx, dy = y - g.cy; return dx * dx + dy * dy > (g.R * k) * (g.R * k); }

  function drawStars(ctx, S, g, Wd, Hd) {
    const t = st.t, dir = -0.35 + Math.sin(t * 0.05) * 0.1;
    const dx = Math.cos(dir), dy = Math.sin(dir);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i], sp = LAYER_SPEED[s.layer];
      const x = ((s.x * Wd - dx * t * sp) % Wd + Wd) % Wd;
      const y = ((s.y * Hd - dy * t * sp) % Hd + Hd) % Hd;
      if (!outside(g, x, y, 1.38)) continue;
      const tw = 0.5 + 0.5 * Math.sin(S.t * s.sp + s.ph);
      const a = (0.25 + 0.6 * tw) * (s.layer === 2 ? 1 : 0.8);
      const col = s.hue === 'warm' ? [255, 220, 170] : s.hue === 'cool' ? [170, 210, 255] : [255, 255, 255];
      ctx.fillStyle = rgba(col, a);
      const z = LAYER_SIZE[s.layer];
      if (s.layer === 2 && tw > 0.55) sparkle(ctx, x, y, z * (1.6 + tw * 1.6));
      else ctx.fillRect(x - z / 2, y - z / 2, z, z);
    }
    ctx.restore();
  }

  function drawNebula(ctx, S, g, Wd, Hd) {
    const c = worldOf(S).neb, t = st.t;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const spots = [[0.86, 0.78, 0.45, 0.10], [0.78, 0.12, 0.3, 0.07], [0.1, 0.9, 0.35, 0.06]];
    for (const [px, py, rr, a] of spots) {
      const x = px * Wd + Math.sin(t * 0.07 + px * 9) * 20, y = py * Hd + Math.cos(t * 0.05 + py * 7) * 14;
      const r = rr * Math.max(Wd, Hd);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function drawComets(ctx, g) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const c of st.comets) {
      const fade = clamp(c.life * 2, 0, 1) * clamp((6 - c.life), 0, 1);
      const dx = c.x - g.cx, dy = c.y - g.cy, d = Math.sqrt(dx * dx + dy * dy);
      const occl = clamp((d - g.R * 1.05) / (g.R * 0.35), 0, 1);
      const a = fade * occl;
      if (a <= 0.01) continue;
      const sp = Math.hypot(c.vx, c.vy), ux = c.vx / sp, uy = c.vy / sp, len = g.R * 1.1;
      const gr = ctx.createLinearGradient(c.x, c.y, c.x - ux * len, c.y - uy * len);
      gr.addColorStop(0, rgba(c.hue, 0.85 * a)); gr.addColorStop(1, rgba(c.hue, 0));
      ctx.strokeStyle = gr;
      ctx.lineWidth = g.R * 0.045; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - ux * len, c.y - uy * len); ctx.stroke();
      ctx.lineWidth = g.R * 0.015; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - ux * len * 0.6 + uy * 6, c.y - uy * len * 0.6 - ux * 6); ctx.stroke();
      const hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, g.R * 0.09);
      hg.addColorStop(0, `rgba(255,255,255,${a})`); hg.addColorStop(1, rgba(c.hue, 0));
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(c.x, c.y, g.R * 0.09, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function moonSpot(g, Wd, Hd) {
    const mr = g.R * 0.26;
    const cands = [[Wd * 0.1, Hd * 0.34], [Wd * 0.9, Hd * 0.72], [Wd * 0.1, Hd * 0.74], [Wd * 0.5, Hd * 0.12], [Wd * 0.88, Hd * 0.3]];
    for (const [x, y] of cands) {
      const d = Math.hypot(x - g.cx, y - g.cy);
      if (d > g.r + g.R * 0.35 + mr && x - mr > 4 && x + mr < Wd - 4 && y - mr > 4 && y + mr < Hd - 4) return { x, y, r: mr };
    }
    // fall back to a smaller moon squeezed in the top-right
    const r2 = g.R * 0.15, x = r2 + 14, y = Hd * 0.3;
    if (Math.hypot(x - g.cx, y - g.cy) > g.r + g.R * 0.3 + r2) return { x, y, r: r2 };
    return null;
  }
  function drawMoon(ctx, S, g, Wd, Hd) {
    const m = moonSpot(g, Wd, Hd);
    if (!m) return;
    const t = st.t, bob = Math.sin(t * 0.6) * m.r * 0.05;
    const x = m.x, y = m.y + bob, r = m.r;
    ctx.save();
    const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.8);
    halo.addColorStop(0, 'rgba(230,225,255,.22)'); halo.addColorStop(1, 'rgba(230,225,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#e4dff5'; ctx.fill();
    ctx.save(); ctx.clip();
    // craters scroll slowly (moon rotation)
    const crat = [[0.2, -0.3, 0.22], [-0.35, 0.1, 0.16], [0.3, 0.35, 0.13], [-0.1, -0.55, 0.1], [0.55, -0.05, 0.11], [-0.6, -0.4, 0.09]];
    const shift = (t * 0.04) % 2;
    for (const [cxk, cyk, rk] of crat) {
      const px = x + (((cxk + shift + 1) % 2) - 1) * r, py = y + cyk * r;
      ctx.fillStyle = 'rgba(150,140,190,.55)'; ctx.beginPath(); ctx.arc(px, py, rk * r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(px - rk * r * 0.25, py - rk * r * 0.25, rk * r * 0.45, 0, TAU); ctx.fill();
    }
    // terminator
    ctx.fillStyle = 'rgba(25,15,70,.45)';
    ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.arc(x - r * 0.35, y - r * 0.25, r * 1.05, 0, TAU); ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r - 0.5, Math.PI * 0.95, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
  }

  function drawRim(ctx, S, g) {
    const c = worldOf(S).atmo, pulse = 0.85 + 0.15 * Math.sin(st.t * 1.7);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(g.cx, g.cy, g.R * 0.9, g.cx, g.cy, g.R * 1.28);
    gr.addColorStop(0, rgba(c, 0));
    gr.addColorStop(0.28, rgba(c, 0.28 * pulse));
    gr.addColorStop(0.42, rgba(c, 0.16 * pulse));
    gr.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R * 1.28, 0, TAU); ctx.fill();
    // bright lit-side rim (sun from top-left)
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba([255, 255, 255], 0.35 * pulse); ctx.lineWidth = Math.max(2, g.R * 0.025);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R * 1.005, Math.PI * 0.95, Math.PI * 1.55); ctx.stroke();
    ctx.strokeStyle = rgba(c, 0.45 * pulse); ctx.lineWidth = Math.max(3, g.R * 0.05);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R * 1.03, Math.PI * 0.85, Math.PI * 1.7); ctx.stroke();
    ctx.restore();
  }

  function trailColor(S) {
    const skin = NO.Save.data.bomb;
    if (skin === 'neon') return [0, 245, 255];
    if (skin === 'alienbomb') return [157, 255, 138];
    if (skin === 'golden') return [255, 225, 120];
    if (skin === 'rainbow') { const h = (S.t * 120) % 360; return hsl2rgb(h); }
    return worldOf(S).ring;
  }
  function hsl2rgb(h) {
    const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.62 - 0.59 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }

  function drawTrailRing(ctx, S, g) {
    const O = S.orbit, col = trailColor(S);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    // completed-lap glow: the path brightens with every lap
    const lapGlow = Math.min(0.5, 0.08 + O.laps * 0.07) + (st.fanfare > 0 ? st.fanfare * 0.35 : 0);
    ctx.strokeStyle = rgba(col, lapGlow * 0.5); ctx.lineWidth = g.R * 0.06;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, TAU); ctx.stroke();
    // comet-like glowing ribbon behind the bomb (most of a lap long)
    const N = 48, span = Math.min(0.75, 0.25 + O.t * 0.25);
    const a1 = -Math.PI / 2 + O.prog * TAU;
    for (let i = 0; i < N; i++) {
      const k0 = i / N, k1 = (i + 1) / N;
      const s0 = a1 - span * TAU * k0, s1 = a1 - span * TAU * k1;
      const k = 1 - k0;
      ctx.strokeStyle = rgba(col, 0.55 * k * k);
      ctx.lineWidth = g.R * (0.025 + 0.11 * k * k);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, s1, s0); ctx.stroke();
    }
    // hot core line
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1.5, g.R * 0.014);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, a1 - span * TAU * 0.35, a1); ctx.stroke();
    ctx.restore();
  }

  function drawJunk(ctx, S, g) {
    const s = g.R / 140;
    for (const j of st.junk) {
      if (j.p > S.orbit.prog + 1.02) continue; // only show what's within the next lap
      const wob = Math.sin(st.t * 2 + j.wob) * g.R * 0.03;
      const p = NO.Game.api.orbitPos(j.p, g.r + wob);
      const appear = clamp(1 - (j.p - S.orbit.prog - 0.75) / 0.27, 0, 1);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(j.rot); ctx.scale(s * appear, s * appear);
      // warning glint
      ctx.globalCompositeOperation = 'lighter';
      const gl = 0.25 + 0.2 * Math.sin(st.t * 6 + j.wob);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
      hg.addColorStop(0, `rgba(255,120,80,${gl})`); hg.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#1b1440'; ctx.lineJoin = 'round';
      if (j.type === 'sat' || j.type === 'panel') {
        // solar wings
        const wl = j.type === 'panel' ? 24 : 18;
        ctx.fillStyle = '#3a6df0';
        ctx.fillRect(-wl - 7, -5, wl, 10); ctx.strokeRect(-wl - 7, -5, wl, 10);
        ctx.fillRect(7, -5, wl, 10); ctx.strokeRect(7, -5, wl, 10);
        ctx.strokeStyle = 'rgba(180,220,255,.8)'; ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) { const xx = -wl - 7 + (wl / 4) * k; ctx.beginPath(); ctx.moveTo(xx, -5); ctx.lineTo(xx, 5); ctx.moveTo(xx + wl + 14, -5); ctx.lineTo(xx + wl + 14, 5); ctx.stroke(); }
        ctx.strokeStyle = '#1b1440'; ctx.lineWidth = 2.2;
        ctx.fillStyle = j.type === 'panel' ? '#e9e6f5' : '#ffcf4a';
        ctx.fillRect(-8, -8, 16, 16); ctx.strokeRect(-8, -8, 16, 16);
        ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(0, -12, 2.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -12); ctx.stroke();
      } else if (j.type === 'dish') {
        ctx.fillStyle = '#d9d4ee';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); ctx.stroke();
        ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(0, -13, 3, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7d77a8'; ctx.fillRect(-5, 6, 10, 7); ctx.strokeRect(-5, 6, 10, 7);
      } else {
        ctx.fillStyle = '#8a7f9e';
        ctx.beginPath();
        const pts = [[-13, -4], [-6, -12], [6, -10], [13, -2], [9, 9], [-4, 12], [-12, 6]];
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6a6080'; ctx.beginPath(); ctx.arc(-3, 2, 3.5, 0, TAU); ctx.arc(5, -4, 2.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawParts(ctx) {
    ctx.save();
    for (const p of st.parts) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = clamp(k * 1.3, 0, 1);
      if (p.kind === 'puff') {
        ctx.globalCompositeOperation = 'lighter';
        const r = p.size * (1 + (1 - k) * 1.5);
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, 'rgba(255,220,150,.7)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      } else if (p.kind === 'ember' || p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU); ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col;
        if (p.kind === 'star') sparkle(ctx, 0, 0, p.size * 1.4);
        else if (p.kind === 'confetti') ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9 * Math.abs(Math.cos(p.rot * 1.3)) + 0.5);
        else { ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size * 0.4, p.size * 0.8); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawRings(ctx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const r of st.rings) {
      if (r.life < 0) continue;
      const k = r.life / r.max, e = 1 - Math.pow(1 - k, 3);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function outlineText(ctx, text, x, y, size, fill, stroke) {
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.lineWidth = Math.max(3, size * 0.16); ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }

  function drawTexts(ctx, g) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const x of st.texts) {
      const k = x.life / x.max, pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const yy = x.y - k * g.R * 0.35, sz = Math.max(16, g.R * 0.15) * pop;
      outlineText(ctx, x.sub, x.x, yy - sz * 0.9, sz * 0.7, '#ffffff', '#2a1555');
      outlineText(ctx, x.text, x.x, yy, sz, '#ffd23f', '#5a2a00');
    }
    ctx.restore();
  }

  function drawLapUI(ctx, S, g) {
    const O = S.orbit, C = NO.CONFIG || {}, maxL = C.ORBIT_MAX_LAPS || 6;
    if (O.phase !== 'exit') {
      const frac = clamp(O.prog - O.laps, 0, 1), rr = g.R * 1.42;
      const a0 = -Math.PI / 2, a1 = a0 + frac * TAU;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = Math.max(3, g.R * 0.03);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, rr, 0, TAU); ctx.stroke();
      const col = trailColor(S);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(col, 0.25); ctx.lineWidth = Math.max(7, g.R * 0.07);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, rr, a0, a1); ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = Math.max(3, g.R * 0.028);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, rr, a0, a1); ctx.stroke();
      const hx = g.cx + Math.cos(a1) * rr, hy = g.cy + Math.sin(a1) * rr;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy, Math.max(2.5, g.R * 0.025), 0, TAU); ctx.fill();
      // finish tick at the top
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffe14d';
      sparkle(ctx, g.cx, g.cy - rr, Math.max(5, g.R * 0.05) * (1 + 0.2 * Math.sin(st.t * 5)));
      ctx.restore();
    }
    // lap pips under the bottom label
    const Hd = g.cy / 0.55, by = Math.min(Hd - 8, Hd - Math.max(40, Hd * 0.07) + Math.max(18, g.R * 0.16) * 0.95);
    const pr = Math.max(4, g.R * 0.035), gap = pr * 3.2, x0 = g.cx - (gap * (maxL - 1)) / 2;
    ctx.save();
    for (let i = 0; i < maxL; i++) {
      const x = x0 + i * gap, done = i < O.laps, cur = i === O.laps && O.phase !== 'exit';
      ctx.fillStyle = done ? '#ffe14d' : cur ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.18)';
      const pulse = cur ? 1 + 0.25 * Math.sin(st.t * 6) : done && st.fanfare > 0 && i === O.laps - 1 ? 1 + st.fanfare * 0.6 : 1;
      if (done) sparkle(ctx, x, by, pr * 1.5 * pulse);
      else { ctx.beginPath(); ctx.arc(x, by, pr * pulse, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawFanfare(ctx, S, g) {
    if (st.fanfare <= 0) return;
    const k = 1 - st.fanfare / 1.4; // 0 -> 1
    const scale = k < 0.18 ? lerp(2.4, 1, A_easeOut(k / 0.18)) : 1 + (k - 0.18) * 0.12;
    const alpha = k > 0.75 ? (1 - k) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.translate(g.cx, g.cy); ctx.scale(scale, scale);
    // burst rays behind the stamp
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.rotate(st.t * 0.8);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.fillStyle = i % 2 ? 'rgba(255,225,77,.18)' : 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(g.R * 0.95, -g.R * 0.12); ctx.lineTo(g.R * 0.95, g.R * 0.12); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    // small tag riding with the bomb (the core banner already shouts "LAP x!")
    const p = NO.Game.api.orbitPos(S.orbit.prog);
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = alpha;
    const tag = st.fanLap >= 2 ? 'x' + st.fanLap + ' COMBO!' : 'NICE ORBIT!';
    const out = 1 + g.R * 0.55 / Math.hypot(p.x - g.cx, p.y - g.cy);
    outlineText(ctx, tag, g.cx + (p.x - g.cx) * out, g.cy + (p.y - g.cy) * out, Math.max(14, g.R * 0.12) * Math.min(1.25, scale), '#ffffff', '#3b1a6e');
    ctx.restore();
  }
  function A_easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }

  function drawDeorbit(ctx, S, g) {
    const O = S.orbit;
    if (O.phase !== 'exit') return;
    const k = clamp(O.exitT / 1.5, 0, 1);
    const pos = NO.Game.api.orbitPos(O.prog);
    const tx = -Math.sin(pos.a), ty = Math.cos(pos.a);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    // red-hot atmosphere flare where the bomb is diving in
    const fl = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, g.R * (0.5 + k * 0.6));
    fl.addColorStop(0, `rgba(255,170,60,${0.35 * k})`); fl.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(pos.x, pos.y, g.R * (0.5 + k * 0.6), 0, TAU); ctx.fill();
    // fire streak: layered flame tongues trailing behind
    const len = g.R * (0.7 + k * 1.8);
    const layers = [[1.0, 0.16, '255,70,20'], [0.8, 0.11, '255,150,40'], [0.55, 0.065, '255,235,140'], [0.3, 0.03, '255,255,255']];
    for (const [lk, wk, col] of layers) {
      const L = len * lk * (0.9 + 0.1 * Math.sin(st.t * 40 + lk * 7));
      const w = g.R * wk * (0.9 + k * 0.8);
      const ex = pos.x - tx * L, ey = pos.y - ty * L, nx = -ty, ny = tx;
      const gr = ctx.createLinearGradient(pos.x, pos.y, ex, ey);
      gr.addColorStop(0, `rgba(${col},${0.9 * (0.5 + k * 0.5)})`); gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(pos.x + nx * w + tx * w * 0.4, pos.y + ny * w + ty * w * 0.4);
      ctx.quadraticCurveTo(pos.x - tx * L * 0.4 + nx * w * 1.2, pos.y - ty * L * 0.4 + ny * w * 1.2, ex, ey);
      ctx.quadraticCurveTo(pos.x - tx * L * 0.4 - nx * w * 1.2, pos.y - ty * L * 0.4 - ny * w * 1.2, pos.x - nx * w + tx * w * 0.4, pos.y - ny * w + ty * w * 0.4);
      ctx.arc(pos.x, pos.y, w * 1.05, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function redrawBomb(ctx, S, g) {
    const O = S.orbit, p = NO.Game.api.orbitPos(O.prog);
    const k = O.phase === 'exit' ? clamp(O.exitT / 1.5, 0, 1) : 0;
    const jit = k > 0 ? (Math.random() - 0.5) * g.R * 0.02 * k : 0;
    try { NO.Art.drawBomb(ctx, NO.Save.data.bomb, p.x + jit, p.y + jit, g.R * 0.34, p.a + Math.PI / 2 + Math.sin(st.t * 30) * 0.04 * k, S.t, 0); } catch (e) { return; }
    if (k > 0) {
      // heat glow over the nose
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tx = -Math.sin(p.a), ty = Math.cos(p.a);
      const nx = p.x + tx * g.R * 0.12, ny = p.y + ty * g.R * 0.12;
      const hg = ctx.createRadialGradient(nx, ny, 0, nx, ny, g.R * 0.25);
      hg.addColorStop(0, `rgba(255,200,120,${0.55 * k})`); hg.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(nx, ny, g.R * 0.25, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // ----------------------------------------------------------- render
  function render(ctx, S, g) {
    const s = ensure(S);
    if (!s) return;
    const Wd = g.cx * 2, Hd = g.cy / 0.55;
    ctx.save();
    drawNebula(ctx, S, g, Wd, Hd);
    drawStars(ctx, S, g, Wd, Hd);
    drawComets(ctx, g);
    drawMoon(ctx, S, g, Wd, Hd);
    drawRim(ctx, S, g);
    drawLapUI(ctx, S, g);
    drawTrailRing(ctx, S, g);
    drawJunk(ctx, S, g);
    drawDeorbit(ctx, S, g);
    redrawBomb(ctx, S, g);
    drawRings(ctx);
    drawParts(ctx);
    drawTexts(ctx, g);
    drawFanfare(ctx, S, g);
    ctx.restore();
  }

  NO.Mods.register({
    id: 'orbitplus',
    reset() { st = null; },
    aim() { st = null; },
    orbitUpdate(S, dt) { update(S, dt); },
    renderOrbit(ctx, S, g) { render(ctx, S, g); },
  });
})();
