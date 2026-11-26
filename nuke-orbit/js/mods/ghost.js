/* =========================================================================
   NUKE ORBIT mod: ghost
   - Records every (non-orbit) run's bomb trajectory; keeps the best run per
     world and replays it as a translucent "ghost" bomb + faint dotted path.
   - Popup "PASSED YOUR BEST!" when the live bomb overtakes the best distance.
   - Distance landmarks every 100 m (bigger at 500 m / 1 km), styled per world,
     plus a small "LAST" flag at the previous run's distance.
   - Scorched crater + smoke wisps at the explosion point (boom / results),
     and a faint old scorch mark where the previous run blew up.
   ========================================================================= */
'use strict';

(function () {
  const C = NO.CONFIG, A = NO.Art;
  const OUT = '#1f1b4d', YEL = '#ffd23f', RED = '#e8475b';
  const FONT = '"Fredoka", "Arial Rounded MT Bold", sans-serif';
  const SAMPLE = 1 / 30;      // raw recording interval (game seconds)
  const MAX_PTS = 300;        // stored points per world
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r1 = (v) => Math.round(v * 10) / 10;

  /* ---------------- per-world landmark styles ---------------- */
  const STYLE = {
    country: { kind: 'post', post: '#7a4b25', board: '#fff3d6', text: '#5b3a1e', accent: RED, paint: 'rgba(255,255,255,.55)', scorch: '#2a1d10', rim: '#5a3d22', smoke: '90,80,75' },
    desert:  { kind: 'post', post: '#8a5a2b', board: '#ffe2a8', text: '#7a3f17', accent: '#2fa7a0', paint: 'rgba(255,255,255,.45)', scorch: '#3a2112', rim: '#b0703a', smoke: '110,85,70' },
    snow:    { kind: 'pole', post: RED, board: '#ffffff', text: '#2e4a86', accent: '#2f6fe0', paint: 'rgba(47,111,224,.35)', scorch: '#2b2b33', rim: '#9aaed0', smoke: '80,85,100' },
    city:    { kind: 'lamp', post: '#2c2c44', board: '#2f9e5a', text: '#ffffff', accent: YEL, paint: 'rgba(255,210,63,.7)', scorch: '#141420', rim: '#2f2f45', smoke: '70,65,80' },
    ocean:   { kind: 'buoy', post: '#ffffff', board: '#ffffff', text: OUT, accent: RED, paint: null, scorch: 'rgba(15,40,80,.55)', rim: 'rgba(255,255,255,.7)', smoke: '235,240,250' },
    space:   { kind: 'beacon', post: '#8d8fb0', board: '#2a2550', text: '#9ff6ff', accent: '#9ff6ff', paint: 'rgba(159,246,255,.35)', scorch: '#141225', rim: '#7d7aa3', smoke: '170,160,200' },
  };
  const styleFor = (env) => STYLE[env] || STYLE.country;

  /* ---------------- state ---------------- */
  let rec = null;        // { t, acc, si, pts:[x,y,...], skip }
  let ghost = null;      // { d, T, p:[x,y,...] } best run for current world
  let gt = 0;            // ghost playback time
  let passed = false;
  let crater = null;     // { x, t0 } current run explosion
  let prevLast = null;   // previous run's distance (world x) in this world

  function store() {
    const st = NO.Mods.store('ghost');
    if (!st.g || typeof st.g !== 'object') st.g = {};
    if (!st.l || typeof st.l !== 'object') st.l = {};
    return st;
  }
  function loadGhost(env) {
    const g = store().g[env];
    ghost = g && Array.isArray(g.p) && g.p.length >= 4 && g.T > 0 ? g : null;
  }
  function loadLast(env) {
    const l = store().l[env];
    prevLast = typeof l === 'number' && l > 3 ? l : null;
  }

  /* ---------------- recording ---------------- */
  function pushSample(b) {
    rec.pts.push(b.x, b.y);
    if (rec.pts.length > 12000) {       // keep memory bounded: decimate by 2
      const p = [];
      for (let i = 0; i < rec.pts.length; i += 4) p.push(rec.pts[i], rec.pts[i + 1]);
      rec.pts = p; rec.si *= 2;
    }
  }
  function resample(pts, si, T) {
    const n = pts.length / 2;
    const N = Math.min(MAX_PTS, n);
    const out = [];
    for (let k = 0; k < N; k++) {
      const tt = N === 1 ? 0 : (k / (N - 1)) * T;
      const f = Math.min(n - 1, tt / si), i = Math.floor(f), u = f - i, j = Math.min(n - 1, i + 1);
      out.push(r1(pts[i * 2] + (pts[j * 2] - pts[i * 2]) * u), r1(Math.max(0, pts[i * 2 + 1] + (pts[j * 2 + 1] - pts[i * 2 + 1]) * u)));
    }
    return out;
  }
  function ghostPos(t) {
    const p = ghost.p, N = p.length / 2;
    const f = clamp(t / ghost.T, 0, 1) * (N - 1), i = Math.floor(f), u = f - i, j = Math.min(N - 1, i + 1);
    const x = p[i * 2] + (p[j * 2] - p[i * 2]) * u, y = p[i * 2 + 1] + (p[j * 2 + 1] - p[i * 2 + 1]) * u;
    const dx = p[j * 2] - p[i * 2], dy = p[j * 2 + 1] - p[i * 2 + 1];
    return { x, y, ang: Math.abs(dx) + Math.abs(dy) > 0.01 ? Math.atan2(-dy, dx) : 0, done: t >= ghost.T };
  }

  /* ---------------- drawing helpers ---------------- */
  function visRange(v) {
    const x0 = (0 - v.W * v.anchorX) / v.ppm + v.camX, x1 = (v.W - v.W * v.anchorX) / v.ppm + v.camX;
    return [x0, x1];
  }
  function tag(ctx, x, y, text, fill, color, size) {
    ctx.font = `700 ${size}px ${FONT}`;
    const w = ctx.measureText(text).width + size * 0.9, h = size * 1.35;
    A.rr(ctx, x - w / 2, y - h / 2, w, h, h / 2); A.fillStroke(ctx, fill, 2);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + size * 0.05);
  }

  // A world-styled arch over the ground every 100 m. It deliberately spans the
  // core game's small distance sign (art.js drawMarkers) so the two read as one.
  function drawLandmark(ctx, v, S, dist, tier) {
    const st = styleFor(S.env);
    const x = v.sx(dist), gy0 = v.sy(0);   // same x as the core sign
    const s = clamp(v.ppm * 0.6, 13, 24) * (tier === 2 ? 1.35 : tier === 1 ? 1.15 : 1);
    const label = dist >= 1000 ? (dist % 1000 ? (dist / 1000).toFixed(1) : dist / 1000) + ' KM' : dist + ' M';
    const bob = st.kind === 'buoy' ? Math.sin(S.t * 2 + dist * 0.07) * s * 0.15 : 0;
    const gy = gy0 + bob;
    const half = s * 2.35, top = s * (tier ? 5.9 : 5.3), pw = Math.max(3, s * 0.32);
    ctx.save();
    ctx.lineJoin = 'round';
    if (st.paint) {
      const topH = Math.max(12, v.ppm * 0.7);
      ctx.fillStyle = st.paint;
      ctx.fillRect(x - half, gy0 + 1, half * 2, Math.max(3, topH * 0.28));
    }
    // posts
    for (const side of [-1, 1]) {
      const px = x + side * half;
      if (st.kind === 'pole') {
        const seg = top / 6;
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : st.post; ctx.fillRect(px - pw / 2, gy - seg * (i + 1), pw, seg); }
        ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(px - pw / 2, gy - top, pw, top);
      } else {
        A.rr(ctx, px - pw / 2, gy - top, pw, top, pw * 0.3); A.fillStroke(ctx, st.post, 2);
      }
      if (st.kind === 'buoy') { // float at the base
        ctx.beginPath(); ctx.moveTo(px - s * 0.7, gy - s * 0.5); ctx.lineTo(px + s * 0.7, gy - s * 0.5); ctx.lineTo(px + s * 0.5, gy + s * 0.35); ctx.lineTo(px - s * 0.5, gy + s * 0.35); ctx.closePath(); A.fillStroke(ctx, RED, 2);
        ctx.fillStyle = '#fff'; ctx.fillRect(px - s * 0.6, gy - s * 0.2, s * 1.2, s * 0.22);
      } else if (st.kind === 'post') {
        A.rr(ctx, px - pw * 0.9, gy - s * 0.35, pw * 1.8, s * 0.45, 3); A.fillStroke(ctx, '#8d8a80', 2);
      }
      // topper light / knob
      if (st.kind === 'beacon' || st.kind === 'lamp' || st.kind === 'buoy') {
        const on = Math.sin(S.t * 5 + dist * 0.1 + side) > 0;
        if (on) { ctx.fillStyle = st.kind === 'beacon' ? 'rgba(159,246,255,.3)' : 'rgba(255,225,140,.35)'; ctx.beginPath(); ctx.arc(px, gy - top - s * 0.3, s * 0.9, 0, Math.PI * 2); ctx.fill(); }
        A.circle(ctx, px, gy - top - s * 0.3, s * 0.3, on ? (st.kind === 'beacon' ? '#e8fdff' : '#ffe38f') : st.accent, 2);
      } else {
        A.circle(ctx, px, gy - top - s * 0.15, s * 0.25, st.accent, 2);
      }
    }
    // pennant string for big ones
    if (tier) {
      const n = 7, sag = s * 0.7;
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - half, gy - top + s * 0.9); ctx.quadraticCurveTo(x, gy - top + s * 0.9 + sag * 2, x + half, gy - top + s * 0.9); ctx.stroke();
      const cols = [st.accent, YEL, '#fff', RED];
      for (let i = 1; i < n; i++) {
        const f = i / n, px = x - half + half * 2 * f, py = gy - top + s * 0.9 + sag * 4 * f * (1 - f);
        const w = Math.sin(S.t * 4 + i) * s * 0.06;
        ctx.beginPath(); ctx.moveTo(px - s * 0.22, py); ctx.lineTo(px + s * 0.22, py); ctx.lineTo(px + w, py + s * 0.55); ctx.closePath(); A.fillStroke(ctx, cols[i % cols.length], 1.5);
      }
    }
    // banner
    const fs = s * (tier ? 0.95 : 0.8);
    ctx.font = `700 ${fs}px ${FONT}`;
    const bw = Math.max(half * 2 + pw * 2, ctx.measureText(label).width + fs * 1.4), bh = fs * 1.45;
    const by = gy - top - bh * 0.55;
    ctx.fillStyle = 'rgba(20,16,60,.25)'; A.rr(ctx, x - bw / 2, by + 3, bw, bh, bh * 0.35); ctx.fill();
    A.rr(ctx, x - bw / 2, by, bw, bh, bh * 0.35); A.fillStroke(ctx, st.board, 2.5);
    ctx.fillStyle = st.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, by + bh * 0.53);
    if (tier === 2) { // 1 km: gold star crown
      ctx.fillStyle = YEL; A.star(ctx, x, by - s * 0.55, s * 0.75, s * 0.32);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  function drawLandmarks(ctx, v, S) {
    const [x0, x1] = visRange(v);
    const pad = 90 / Math.max(0.5, v.ppm);
    const k0 = Math.max(1, Math.floor((x0 - pad) / 100)), k1 = Math.ceil((x1 + pad) / 100);
    if (k1 - k0 > 60) return;
    for (let k = k0; k <= k1; k++) {
      const d = k * 100;
      drawLandmark(ctx, v, S, d, d % 1000 === 0 ? 2 : d % 500 === 0 ? 1 : 0);
    }
  }

  function drawLastFlag(ctx, v, S) {
    if (prevLast == null) return;
    const x = v.sx(prevLast), gy = v.sy(0);
    if (x < -60 || x > v.W + 60) return;
    const u = clamp(v.ppm * 0.38, 6, 15);
    ctx.save();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - u * 3.4); ctx.stroke();
    const w = Math.sin(S.t * 5) * u * 0.12;
    ctx.beginPath(); ctx.moveTo(x, gy - u * 3.4); ctx.lineTo(x + u * 2.3, gy - u * 3.0 + w); ctx.lineTo(x, gy - u * 2.5); ctx.closePath(); A.fillStroke(ctx, '#c9c6e8', 2);
    ctx.fillStyle = OUT; ctx.font = `700 ${u * 0.6}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('LAST', x + u * 0.2, gy - u * 2.97 + w * 0.5);
    ctx.restore();
  }

  function drawScorch(ctx, v, S, wx, alpha, smoke, age) {
    const st = styleFor(S.env);
    const x = v.sx(wx), gy = v.sy(0), m = v.ppm;
    const R = 4.4 * m;
    if (x < -R * 2 || x > v.W + R * 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const grow = smoke ? A.easeOut(clamp(age / 0.35, 0, 1)) : 1;
    // scorch halo on the ground
    const g = ctx.createRadialGradient(x, gy, 0, x, gy, R * 1.6 * grow);
    g.addColorStop(0, 'rgba(20,10,5,.55)'); g.addColorStop(0.6, 'rgba(20,10,5,.22)'); g.addColorStop(1, 'rgba(20,10,5,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, gy + m * 0.15, R * 1.6 * grow, m * 0.7 * grow, 0, 0, Math.PI * 2); ctx.fill();
    // crater bowl
    ctx.beginPath(); ctx.ellipse(x, gy + m * 0.05, R * grow, m * 0.55 * grow, 0, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = st.scorch; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, m * 0.06); ctx.stroke();
    // embers glowing inside, fading out over time
    if (smoke) {
      const heat = clamp(1 - (age - 0.3) / 6, 0.25, 1);
      for (let i = 0; i < 6; i++) {
        const ex = x + (A.hash(i * 3.1 + wx) - 0.5) * R * 1.3, ey = gy + m * (0.12 + A.hash(i * 1.7) * 0.22);
        const fl = 0.6 + 0.4 * Math.sin(S.t * 6 + i * 2);
        ctx.fillStyle = `rgba(255,${120 + i * 15},40,${0.7 * heat * fl})`;
        ctx.beginPath(); ctx.ellipse(ex, ey, m * 0.22, m * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    // rim clumps
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1, f = 0.75 + A.hash(i + wx * 0.3) * 0.45;
      const cx = x + side * R * f * grow, cy = gy - m * (0.05 + A.hash(i * 5 + wx) * 0.15);
      const r = m * (0.22 + A.hash(i * 7 + wx) * 0.25) * grow;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, r), 0, Math.PI * 2);
      ctx.fillStyle = st.rim; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // smoke wisps
    if (smoke) {
      const fade = clamp(age / 1.2, 0, 1);
      for (let i = 0; i < 7; i++) {
        const ph = (S.t * 0.28 + i / 7) % 1;
        const sx = x + (i % 2 ? 1 : -1) * R * (0.55 + A.hash(i * 9 + 1) * 0.5) + Math.sin(ph * 5 + i) * m * 0.6 + ph * m * 1.2;
        const sy = gy - ph * 7 * m;
        const rad = m * (0.45 + ph * 1.4);
        ctx.fillStyle = `rgba(${st.smoke},${0.38 * (1 - ph) * fade})`;
        ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGhost(ctx, v, S) {
    if (!ghost || S.mode !== 'flight') return;
    const [x0, x1] = visRange(v);
    // faint dotted path (only the visible part)
    const p = ghost.p, N = p.length / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    const dot = Math.max(1.5, Math.min(3.2, v.ppm * 0.08));
    let lastSX = -1e9, lastSY = -1e9;
    for (let i = 0; i < N - 1; i++) {
      const ax = p[i * 2], bx = p[i * 2 + 2];
      if (bx < x0 - 2 || ax > x1 + 2) continue;
      const ay = p[i * 2 + 1], by = p[i * 2 + 3];
      const sax = v.sx(ax), say = v.sy(ay), sbx = v.sx(bx), sby = v.sy(by);
      const len = Math.hypot(sbx - sax, sby - say), n = Math.ceil(len / 12);
      for (let k = 0; k < n; k++) {
        const f = k / n, px = sax + (sbx - sax) * f, py = say + (sby - say) * f;
        if (Math.hypot(px - lastSX, py - lastSY) < 11) continue;
        lastSX = px; lastSY = py;
        ctx.beginPath(); ctx.arc(px, py, dot, 0, Math.PI * 2); ctx.fill();
      }
    }
    // ghost bomb
    const g = ghostPos(gt);
    const gx = v.sx(g.x), gy = v.sy(g.y);
    const a = passed ? 0.22 : 0.42;
    if (gx > -80 && gx < v.W + 80 && gy > -80 && gy < v.H + 80) {
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = '#bdf6ff'; ctx.beginPath(); ctx.arc(gx, gy, Math.max(16, 1.2 * v.ppm), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      A.drawBomb(ctx, NO.Save.data.bomb, gx, gy, 1.75 * v.ppm, g.ang, S.t, 0);
      ctx.globalAlpha = passed ? 0.5 : 0.95;
      const fs = clamp(v.ppm * 0.42, 10, 16);
      tag(ctx, gx, gy - 1.5 * v.ppm - fs, 'BEST', 'rgba(255,255,255,.85)', OUT, fs);
    } else if (!passed && gx >= v.W + 80) {
      // ghost ahead off-screen: small edge pill
      const ahead = Math.max(0, Math.round(g.x - S.bomb.x));
      const fs = 13, y = clamp(gy, 70, v.H * 0.7);
      ctx.globalAlpha = 0.9;
      tag(ctx, v.W - 62, y, 'BEST +' + ahead + 'm ▶', 'rgba(255,255,255,.8)', OUT, fs);
    }
    ctx.restore();
  }

  /* ---------------- mod ---------------- */
  NO.Mods.register({
    id: 'ghost',

    reset(S) {
      rec = null; crater = null; gt = 0; passed = false;
      loadGhost(S.env); loadLast(S.env);
    },
    aim(S) {
      rec = null; crater = null; gt = 0; passed = false;
      loadGhost(S.env); loadLast(S.env);
    },
    launch(S, b) {
      rec = { t: 0, acc: 0, si: SAMPLE, pts: [], skip: false };
      pushSample(b);
      gt = 0; passed = false;
    },
    orbitUpdate() { if (rec) rec.skip = true; },
    update(S, dt) {
      if (S.mode !== 'flight' || !rec) return;
      gt += dt;
      if (!rec.skip) {
        rec.t += dt; rec.acc += dt;
        while (rec.acc >= rec.si) { rec.acc -= rec.si; pushSample(S.bomb); }
      }
      if (!passed && ghost && ghost.d > 10 && S.run && S.run.distance > ghost.d) {
        passed = true;
        const b = S.bomb;
        NO.Game.api.popup(b.x, b.y + 4, 'PASSED YOUR BEST!', '#9ff6ff', 1.3, true);
        for (let i = 0; i < 18; i++) {
          const an = (i / 18) * Math.PI * 2, sp = 8 + Math.random() * 6;
          S.particles.push({ k: 'spark', x: b.x, y: b.y + 0.5, vx: Math.cos(an) * sp + b.vx * 0.3, vy: Math.sin(an) * sp, life: 0, max: 0.6, size: 0.14, color: i % 2 ? '#9ff6ff' : YEL });
        }
      }
    },
    boom(S) {
      const b = S.bomb;
      crater = { x: b.x, t0: S.t };
      const st = store();
      if (rec && !rec.skip && S.run) {
        const dist = S.run.distance;
        pushSample(b);
        const old = st.g[S.env];
        if (!old || !(old.d >= dist)) {
          const T = Math.max(SAMPLE, (rec.pts.length / 2 - 1) * rec.si);
          st.g[S.env] = { d: r1(dist), T: Math.round(T * 100) / 100, p: resample(rec.pts, rec.si, T) };
        }
      }
      st.l[S.env] = r1(b.x);
      rec = null;
    },

    renderWorld(ctx, v, S) {
      if (prevLast != null && !(crater && Math.abs(crater.x - prevLast) < 2)) drawScorch(ctx, v, S, prevLast, 0.35, false, 0);
      if (crater && (S.mode === 'boom' || S.mode === 'results')) drawScorch(ctx, v, S, crater.x, 1, true, S.t - crater.t0);
      drawLandmarks(ctx, v, S);
      drawLastFlag(ctx, v, S);
      drawGhost(ctx, v, S);
    },
  });
})();
