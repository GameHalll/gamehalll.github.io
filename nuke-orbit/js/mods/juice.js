/* =========================================================================
   NUKE ORBIT mod: juice
   Game feel only (no physics / balance changes):
     - launch hit-stop + perfect-launch slow-mo (time scale borrowed & restored,
       yields instantly to the FAST button), impact rings, flash, camera kick
     - aim: perfect-zone halo / notch / sparkles under the power meter,
       sweet-spot tick sound, charge ring + wind-up streaks on the bomb
     - flight: wind streaks + motion-blur ghosts, bounce impact frames,
       "HANG TIME" apex callout, mini speedometer with top-speed marker
     - results: DOM confetti on a new record
   ========================================================================= */
'use strict';

(function () {
  const A = NO.Art, C = NO.CONFIG;
  const { clamp, lerp, easeOut, easeIn } = A;
  const FONT = '"Fredoka", "Arial Rounded MT Bold", sans-serif';
  const TAU = Math.PI * 2;
  const GOLD = '#ffd23f';

  /* ------------------------------ audio -------------------------------- */
  // Own tiny synth (NO.Audio keeps its context private). Created on a user gesture.
  let actx = null, out = null;
  function audioInit() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      out = actx.createGain(); out.gain.value = 0.5; out.connect(actx.destination);
    } catch (e) { actx = null; }
  }
  function blip(freq, dur, type, vol, slideTo, delay) {
    if (!actx || NO.Save.data.muted) return;
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const sfx = {
    tick: () => { blip(1760, 0.05, 'triangle', 0.07); blip(2637, 0.08, 'sine', 0.04, null, 0.03); },
    thump: () => blip(110, 0.28, 'sine', 0.32, 42),
    hang: () => { blip(523, 0.5, 'sine', 0.05, 784); blip(1046, 0.4, 'triangle', 0.025, 1568, 0.08); },
  };

  /* ------------------------- borrowed time scale ------------------------- */
  // We remember the scale we found (1 normal, 3 FAST), write base*factor while an
  // effect runs, and give up immediately if anyone else writes S.timeScale.
  const ts = { active: false, base: 1, own: 1, t: 0, segs: null };
  function tsStart(S, segs) {
    if (!(ts.active && S.timeScale === ts.own)) ts.base = S.timeScale;
    ts.active = true; ts.t = 0; ts.segs = segs;
    ts.own = S.timeScale = ts.base * segs[0].f(0);
  }
  function tsTick(S, rawDt) {
    if (!ts.active) return;
    if (S.timeScale !== ts.own) { ts.active = false; return; }   // FAST / reset took over
    ts.t += rawDt;
    let t = ts.t;
    for (const s of ts.segs) {
      if (t < s.d) { ts.own = S.timeScale = ts.base * s.f(t / s.d); return; }
      t -= s.d;
    }
    S.timeScale = ts.base; ts.active = false;
  }
  function tsCancel(S) {
    if (ts.active && S && S.timeScale === ts.own) S.timeScale = ts.base;
    ts.active = false;
  }
  const freeze = (d) => ({ d, f: () => 0 });

  /* ------------------------------- state ------------------------------- */
  const fx = [];             // world-space effects {k, x, y, t, max, s}
  let hang = null;           // apex callout
  let prevPower = 0, prevVy = 0, apexCount = 0;
  const gauge = { max: 200, shown: 0, top: 0, pulse: 0 };

  /* ------------------------------ events ------------------------------- */
  NO.Mods.register({
    id: 'juice',

    reset(S) { tsCancel(S); fx.length = 0; hang = null; },
    aim(S) { audioInit(); prevPower = S.power; apexCount = 0; gauge.shown = 0; gauge.top = 0; },

    launch(S, b) {
      audioInit();
      const perfect = !!S.perfect;
      fx.push({ k: 'launch', x: b.x, y: b.y, t: 0, max: perfect ? 0.75 : 0.5, s: perfect ? 1 : 0.6 });
      S.cam.shake = Math.max(S.cam.shake, perfect ? 1.0 : 0.65);
      S.flash = Math.max(S.flash, perfect ? 0.32 : 0.12);
      if (perfect) {
        tsStart(S, [freeze(0.085), { d: 0.55, f: (u) => lerp(0.28, 1, easeIn(u)) }]);
        sfx.thump();
      } else {
        tsStart(S, [freeze(0.05)]);
      }
      const kmh = (S.run.launchSpeed || 30) * 3.6;
      gauge.max = Math.max(150, Math.ceil(kmh * 1.15 / 50) * 50);
      gauge.shown = 0; gauge.top = 0;
      prevVy = b.vy;
    },

    bounce(S, impact, b) {
      const s = clamp(impact / 60, 0, 1);
      if (s < 0.3) return;
      if (fx.length < 40) fx.push({ k: 'hit', x: b.x, y: 0.15, t: 0, max: 0.2, s, rot: Math.random() });
      if (s > 0.55 && !ts.active) tsStart(S, [freeze(0.03 + s * 0.02)]);
    },

    update(S, dt, rawDt) {
      tsTick(S, rawDt);
      for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += rawDt; if (fx[i].t >= fx[i].max) fx.splice(i, 1); }
      if (hang) { hang.t += rawDt; if (hang.t > 1.7) hang = null; }

      if (S.mode === 'aim') {
        const thr = C.PERFECT_THRESHOLD;
        if (prevPower < thr && S.power >= thr) sfx.tick();
        prevPower = S.power;
      }

      if (S.mode === 'flight' && S.bomb) {
        const b = S.bomb;
        const sp = Math.hypot(b.vx, b.vy) * 3.6;
        gauge.shown = lerp(gauge.shown, sp, 1 - Math.exp(-10 * rawDt));
        gauge.top = Math.max(gauge.top, sp);
        gauge.pulse += rawDt;
        // apex moment
        if (!b.rolling && prevVy > 0 && b.vy <= 0) {
          const alt = b.y - C.BOMB_RADIUS;
          if ((apexCount === 0 && alt >= 25) || alt >= 45) {
            hang = { t: 0, alt, big: alt >= 70 };
            sfx.hang();
            if (alt >= 70 && !ts.active && S.timeScale === 1) tsStart(S, [{ d: 0.6, f: (u) => 1 - 0.45 * Math.sin(Math.PI * u) }]);
          }
          apexCount++;
        }
        prevVy = b.rolling ? 0 : b.vy;
      }
    },

    mode(mode) {
      if (mode !== 'flight' && mode !== 'orbit') hang = null;
      if (mode === 'boom' || mode === 'menu') tsCancel(NO.Game.state);
    },

    renderWorld(ctx, v, S) {
      if (S.mode !== 'flight' || !S.bomb) return;
      const b = S.bomb;
      if (b.rolling) return;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 55) return;
      // motion-blur ghosts behind the bomb
      const k = clamp((sp - 55) / 160, 0, 1);
      const len = 1.75 * v.ppm, ux = b.vx / sp, uy = b.vy / sp;
      const step = Math.min(0.6 * len, sp * 0.012 * v.ppm);
      const skin = NO.Save.data.bomb;
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = (0.22 * k) / i;
        A.drawBomb(ctx, skin, v.sx(b.x - ux * step * i / v.ppm), v.sy(b.y - uy * step * i / v.ppm), len, b.angle, S.t, b.squash);
      }
      ctx.globalAlpha = 1;
    },

    renderFront(ctx, v, S) {
      const b = S.bomb;
      if (!b) return;
      const bx = v.sx(b.x), by = v.sy(b.y), br = 0.6 * v.ppm;

      // aim: charge ring around the bomb
      if (S.mode === 'aim') {
        const p = S.power, perf = p >= C.PERFECT_THRESHOLD;
        const pulse = 0.5 + 0.5 * Math.sin(S.t * (perf ? 22 : 8));
        ctx.save();
        ctx.lineWidth = 2 + p * 3;
        ctx.strokeStyle = perf ? `rgba(255,225,77,${0.6 + pulse * 0.4})` : `rgba(255,255,255,${0.15 + p * 0.45})`;
        const rr = br * (1.25 + (1 - p) * 0.9 + (perf ? pulse * 0.15 : 0));
        ctx.beginPath(); ctx.arc(bx, by, rr, 0, TAU); ctx.stroke();
        if (perf) {
          ctx.fillStyle = '#fff6c0';
          for (let i = 0; i < 4; i++) {
            const a = S.t * 3 + i * TAU / 4, r = rr + 6;
            A.star(ctx, bx + Math.cos(a) * r, by + Math.sin(a) * r, 5 + pulse * 3, 2);
          }
        }
        ctx.restore();
      }

      // launch wind-up: streaks converging on the bomb, glint before release
      if (S.mode === 'launch') {
        const u = clamp(S.launchP / 0.55, 0, 1), k = easeIn(u);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = S.perfect ? `rgba(255,225,77,${0.25 + k * 0.6})` : `rgba(255,255,255,${0.2 + k * 0.5})`;
        ctx.lineWidth = 2 + k * 2;
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8 + 0.3;
          const r1 = br * (1.4 + (1 - k) * 2.6), r2 = r1 + br * (0.5 + k * 0.8);
          ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1); ctx.lineTo(bx + Math.cos(a) * r2, by + Math.sin(a) * r2); ctx.stroke();
        }
        if (u > 0.75) {
          ctx.fillStyle = '#fff';
          const g = (u - 0.75) / 0.25;
          A.star(ctx, bx + br * 0.4, by - br * 0.4, br * (0.4 + g * 0.8), br * 0.12);
        }
        ctx.restore();
      }

      // wind streaks while flying fast
      if (S.mode === 'flight' && !b.rolling) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 32) {
          const k = clamp((sp - 32) / 140, 0, 1);
          const ux = b.vx / sp, uy = -b.vy / sp;           // screen-space direction (y down)
          const nx = -uy, ny = ux;
          ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 2;
          for (let i = 0; i < 6; i++) {
            const off = (i - 2.5) * br * 0.55;
            const ph = (S.t * (5 + i) + i * 0.37) % 1;
            const L = br * (1.5 + k * 5) * (0.6 + 0.4 * Math.sin(i * 7.1 + S.t * 9));
            const back = br * (1.1 + ph * 1.4);
            const x0 = bx - ux * back + nx * off, y0 = by - uy * back + ny * off;
            ctx.strokeStyle = `rgba(255,255,255,${(0.12 + 0.4 * k) * (1 - ph)})`;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - ux * L, y0 - uy * L); ctx.stroke();
          }
          ctx.restore();
        }
      }

      // world-space effects
      for (const e of fx) {
        const f = e.t / e.max, x = v.sx(e.x), y = v.sy(e.y);
        if (e.k === 'launch') {
          ctx.save();
          const r = (0.6 + easeOut(f) * (2.4 + e.s * 2.2)) * v.ppm;
          ctx.globalAlpha = 1 - f;
          ctx.strokeStyle = e.s >= 1 ? GOLD : '#fff'; ctx.lineWidth = 3 + 7 * (1 - f) * e.s;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
          if (e.s >= 1) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 + 3 * (1 - f);
            ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.stroke();
            // sun-burst rays
            ctx.fillStyle = `rgba(255,236,140,${0.55 * (1 - f)})`;
            for (let i = 0; i < 12; i++) {
              const a = i * TAU / 12 + f * 0.4, w = 0.09;
              ctx.beginPath(); ctx.moveTo(x, y);
              ctx.lineTo(x + Math.cos(a - w) * r * 1.5, y + Math.sin(a - w) * r * 1.5);
              ctx.lineTo(x + Math.cos(a + w) * r * 1.5, y + Math.sin(a + w) * r * 1.5);
              ctx.closePath(); ctx.fill();
            }
          }
          if (f < 0.18) { ctx.globalAlpha = 1 - f / 0.18; ctx.fillStyle = '#fff'; A.circle(ctx, x, y, br * 1.6); ctx.fill(); }
          ctx.restore();
        } else if (e.k === 'hit') {
          // comic impact frame: white burst + spikes for a few frames
          ctx.save();
          const r = br * (1.3 + e.s * 1.6) * (0.7 + 0.5 * easeOut(f));
          ctx.globalAlpha = f < 0.5 ? 1 : (1 - f) * 2;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          for (let i = 0; i < 18; i++) {
            const a = Math.PI + (i / 17) * Math.PI + (e.rot - 0.5) * 0.2;
            const rad = i % 2 ? r * 0.55 : r * (1.1 + ((i * 7 + e.rot * 10) % 3) * 0.15);
            ctx.lineTo(x + Math.cos(a) * rad * 1.5, y + Math.sin(a) * rad);
          }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = GOLD;
          ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, r * 0.3, 0, Math.PI, TAU); ctx.fill();
          ctx.restore();
        }
      }
    },

    renderHUD(ctx, S, W, H) {
      if (S.mode === 'aim') drawMeterExtras(ctx, S, W, H);
      if (S.mode === 'flight') { drawSpeedo(ctx, S, W, H); drawHang(ctx, W, H); }
    },

    resultsShown(r) {
      if (r && r.isRecord) confetti(r.prevBest > 0 ? 150 : 90);
    },
  });

  /* ------------------------- aim meter extras -------------------------- */
  // Same geometry as the core fan gauge; drawn just beneath it so it never hides it.
  const FAN_A0 = -0.08, FAN_A1 = 1.45;
  function drawMeterExtras(ctx, S, W, H) {
    const v = NO.Game.api.view(), b = S.bomb;
    const cx = v.sx(b.x) + 0.2 * v.ppm, cy = v.sy(b.y);
    const R = Math.min(Math.max(3.2 * v.ppm, 110), H * 0.38);
    const ang = (p) => -(FAN_A0 + (FAN_A1 - FAN_A0) * p);
    const thr = C.PERFECT_THRESHOLD, p = S.power, perf = p >= thr;
    const near = clamp((p - (thr - 0.25)) / 0.25, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(S.t * (perf ? 20 : 6));
    const a0 = ang(thr), a1 = ang(1);
    ctx.save();
    // glowing halo hugging the perfect wedge
    const inner = R + 5, w = 7 + near * 6 + (perf ? 6 * pulse : 0);
    ctx.shadowColor = GOLD; ctx.shadowBlur = perf ? 26 : 10 + near * 10;
    ctx.fillStyle = `rgba(255,214,64,${0.35 + near * 0.3 + (perf ? 0.35 * pulse : 0)})`;
    ctx.beginPath(); ctx.arc(cx, cy, inner + w, a0 + 0.02, a1 - 0.02, true); ctx.arc(cx, cy, inner, a1 - 0.02, a0 + 0.02, false); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // whole-rim pulse when the needle sits in the sweet spot
    if (perf) {
      ctx.strokeStyle = `rgba(255,240,170,${0.45 + 0.4 * pulse})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, cy, R + 12 + pulse * 4, ang(0), a1, true); ctx.stroke();
    }
    // notch marking where the sweet spot starts
    const nr = R + 14;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(a0);
    ctx.fillStyle = perf ? '#fff' : GOLD;
    ctx.beginPath(); ctx.moveTo(nr - 4, 0); ctx.lineTo(nr + 12, -8); ctx.lineTo(nr + 12, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // sparkles around the wedge
    if (perf || near > 0.6) {
      ctx.save();
      ctx.fillStyle = perf ? '#fffbe0' : 'rgba(255,240,180,.7)';
      for (let i = 0; i < 5; i++) {
        const ph = (S.t * 1.3 + i * 0.21) % 1;
        const a = lerp(a0, a1, (i + 0.5) / 5);
        const r = R + 20 + ph * 12;
        const s = (perf ? 6 : 3.5) * Math.sin(ph * Math.PI);
        A.star(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, s * 0.35);
      }
      ctx.restore();
    }
  }

  /* --------------------------- speedometer ----------------------------- */
  function drawSpeedo(ctx, S, W, H) {
    const r = clamp(Math.min(W, H) * 0.085, 40, 66);
    const cx = 18 + r + 6, cy = H - 18 - r * 0.95;
    const A0 = Math.PI * 0.85, A1 = Math.PI * 2.15;          // sweep over the top
    const frac = clamp(gauge.shown / gauge.max, 0, 1.04);
    const red = 0.82;
    const hot = frac > red;
    const ang = (f) => A0 + (A1 - A0) * clamp(f, 0, 1.04);
    ctx.save();
    // backdrop
    ctx.fillStyle = 'rgba(20,14,60,.42)';
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, Math.PI * 0.78, Math.PI * 2.22); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'round';
    // track
    ctx.lineWidth = r * 0.16; ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(cx, cy, r, A0, A1); ctx.stroke();
    // redline zone
    ctx.strokeStyle = hot ? `rgba(255,70,90,${0.55 + 0.45 * Math.sin(gauge.pulse * 18)})` : 'rgba(232,71,91,.55)';
    ctx.beginPath(); ctx.arc(cx, cy, r, ang(red), A1); ctx.stroke();
    // fill
    const g = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    g.addColorStop(0, '#5fd36a'); g.addColorStop(0.55, '#f9d23c'); g.addColorStop(1, '#ff5a3c');
    ctx.strokeStyle = g;
    if (frac > 0.005) { ctx.beginPath(); ctx.arc(cx, cy, r, A0, ang(Math.min(frac, 1))); ctx.stroke(); }
    // ticks
    ctx.lineCap = 'butt'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.6)';
    for (let i = 0; i <= 8; i++) {
      const a = ang(i / 8), r1 = r - r * 0.2, r2 = r - r * (i % 2 ? 0.28 : 0.36);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
    }
    // top-speed marker
    const ta = ang(gauge.top / gauge.max);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ta) * (r + r * 0.1), cy + Math.sin(ta) * (r + r * 0.1));
    ctx.lineTo(cx + Math.cos(ta - 0.09) * (r + r * 0.32), cy + Math.sin(ta - 0.09) * (r + r * 0.32));
    ctx.lineTo(cx + Math.cos(ta + 0.09) * (r + r * 0.32), cy + Math.sin(ta + 0.09) * (r + r * 0.32));
    ctx.closePath(); ctx.fill();
    // needle (jitters when pegged in the red)
    const jit = hot ? Math.sin(gauge.pulse * 60) * 0.025 * (frac - red) / (1 - red) : 0;
    const na = ang(frac) + jit;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(na) * r * 0.12, cy - Math.sin(na) * r * 0.12); ctx.lineTo(cx + Math.cos(na) * r * 0.82, cy + Math.sin(na) * r * 0.82); ctx.stroke();
    ctx.fillStyle = hot ? '#ff5a6e' : '#fff'; A.circle(ctx, cx, cy, r * 0.1); ctx.fill();
    // readout
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const big = Math.round(r * 0.42);
    ctx.font = `700 ${big}px ${FONT}`;
    const txt = Math.round(gauge.shown).toLocaleString('en-US');
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillText(txt, cx, cy + r * 0.42 + 2);
    ctx.fillStyle = hot ? '#ffd0d6' : '#fff'; ctx.fillText(txt, cx, cy + r * 0.42);
    ctx.font = `700 ${Math.round(r * 0.2)}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('KM/H', cx, cy + r * 0.74);
    ctx.restore();
  }

  /* ---------------------------- hang time ------------------------------ */
  function drawHang(ctx, W, H) {
    if (!hang) return;
    const t = hang.t, f = t / 1.7;
    const pop = t < 0.18 ? easeOut(t / 0.18) * 1.15 : 1.15 - Math.min(0.15, (t - 0.18) * 0.6);
    const alpha = f > 0.75 ? (1 - f) / 0.25 : 1;
    const size = clamp(Math.min(W, H) * 0.065, 26, 52) * pop;
    const x = W / 2, y = H * 0.58 - t * 10;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(-0.05);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px ${FONT}`;
    const label = hang.big ? 'HUGE HANG TIME!' : 'HANG TIME!';
    ctx.fillStyle = 'rgba(20,16,60,.4)'; ctx.fillText(label, 0, size * 0.1);
    ctx.fillStyle = '#7df9ff'; ctx.fillText(label, 0, 0);
    ctx.font = `700 ${size * 0.48}px ${FONT}`;
    const sub = '▲ ' + Math.round(hang.alt).toLocaleString('en-US') + ' m up';
    ctx.fillStyle = 'rgba(20,16,60,.4)'; ctx.fillText(sub, 0, size * 0.82 + 2);
    ctx.fillStyle = '#fff'; ctx.fillText(sub, 0, size * 0.8);
    ctx.restore();
  }

  /* ----------------------------- confetti ------------------------------ */
  let styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    const st = document.createElement('style');
    st.id = 'juice-style';
    st.textContent =
      '.juice-confetti{position:fixed;inset:0;z-index:60;pointer-events:none;overflow:hidden}' +
      '.juice-confetti i{position:absolute;top:-24px;display:block;border-radius:2px;will-change:transform;' +
      'animation:juice-fall var(--d) cubic-bezier(.25,.6,.45,1) var(--dl) forwards}' +
      '.juice-confetti i.juice-c{border-radius:50%}' +
      '@keyframes juice-fall{0%{transform:translate3d(0,0,0) rotate(0deg) rotateY(0deg);opacity:1}' +
      '85%{opacity:1}100%{transform:translate3d(var(--dx),110vh,0) rotate(var(--r)) rotateY(720deg);opacity:0}}' +
      '.juice-confetti i.juice-b{top:auto;bottom:-20px;animation-name:juice-pop;animation-timing-function:cubic-bezier(.15,.7,.3,1)}' +
      '@keyframes juice-pop{0%{transform:translate3d(0,0,0) rotate(0);opacity:1}' +
      '55%{transform:translate3d(calc(var(--dx)*.8),var(--up),0) rotate(calc(var(--r)*.6));opacity:1}' +
      '100%{transform:translate3d(var(--dx),calc(var(--up)*.4 + 30vh),0) rotate(var(--r));opacity:0}}' +
      '@media (prefers-reduced-motion: reduce){.juice-confetti{display:none}}';
    document.head.appendChild(st);
  }
  function confetti(n) {
    injectStyle();
    const old = document.querySelector('.juice-confetti');
    if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'juice-confetti';
    const cols = ['#ffd23f', '#e8475b', '#5fd36a', '#3fb6f0', '#ff8a3c', '#ffffff', '#b27dff'];
    let html = '';
    for (let i = 0; i < n; i++) {
      const burst = i < n * 0.35;                       // cannon pops from the bottom corners
      const left = burst ? (i % 2 ? 4 + Math.random() * 8 : 88 + Math.random() * 8) : Math.random() * 100;
      const dx = burst ? (i % 2 ? 1 : -1) * (10 + Math.random() * 30) + 'vw' : (Math.random() * 30 - 15) + 'vw';
      const w = 7 + Math.random() * 6, h = Math.random() < 0.3 ? w : w * (1.4 + Math.random() * 0.6);
      const d = burst ? 1.6 + Math.random() * 0.8 : 2.4 + Math.random() * 1.8;
      const dl = burst ? Math.random() * 0.15 : Math.random() * 0.9;
      html += '<i class="' + (burst ? 'juice-b ' : '') + (h === w ? 'juice-c' : '') + '" style="left:' + left.toFixed(1) + '%;width:' + w.toFixed(1) +
        'px;height:' + h.toFixed(1) + 'px;background:' + cols[i % cols.length] + ';--dx:' + dx + ';--r:' + Math.round(Math.random() * 900 - 450) +
        'deg;--up:' + (-(55 + Math.random() * 35)).toFixed(0) + 'vh;--d:' + d.toFixed(2) + 's;--dl:' + dl.toFixed(2) + 's"></i>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 5200);
  }
})();
