/* =========================================================================
   NUKE ORBIT mod: boost — "Thruster boosts"
   Hold tap / Space during flight to fire the nuke's tail thrusters:
   thrust along the flight direction + a little lift, burning fuel.
   The tank refills partly on every ground bounce. New upgrade: THRUSTER FUEL.
   In orbit, holding the thrusters simply makes the laps go by faster.
   ========================================================================= */
'use strict';

(function () {
  const G = () => NO.Game.api;
  const MAXLV = () => NO.CONFIG.MAX_UPGRADE_LEVEL;

  /* ------------------------------ tuning -------------------------------- */
  // Thrust scales with the (upgrade-based) launch speed so the tool stays relevant at every level.
  const CFG = {
    THRUST_K: 0.12,       // forward accel = THRUST_K * clamp(speed, 0.35 v0, v0) (m/s^2)
    LIFT_G: 0.18,         // upward accel while boosting = LIFT_G * gravity (when falling)
    LIFT_UP: 0.3,         // ...scaled by this while still climbing
    SPEED_CAP: 1.0,       // forward thrust fades out as speed nears SPEED_CAP * launch speed
    CAP_SOFT: 0.3,        // ...over the last 30% of that
    REFILL: 0.25,         // fraction of the tank refilled per real ground bounce
    REFILL_DECAY: 0.7,    // each later refill is 30% smaller (bounded total: ~0.83 tank)
    REFILL_MIN_IMPACT: 6, // m/s impact needed for a refill
    ORBIT_RATE: 0.55,     // extra laps-per-lap-time while boosting in orbit (pure speed-up)
    TANK0: 0.5,           // tank (seconds of burn) at level 0
    TANK_LV: 0.012,       // + per THRUSTER FUEL level
    HINT_FLIGHTS: 3,      // show "HOLD to boost!" during the first N flights (until used)
  };
  // tank size in seconds of burn
  const tankFor = (lv) => CFG.TANK0 + CFG.TANK_LV * lv;

  /* ---------------------------- the upgrade ----------------------------- */
  if (!NO.UPGRADES.some((u) => u.id === 'fuel')) {
    NO.UPGRADES.push({
      id: 'fuel', name: 'THRUSTER FUEL', icon: NO.ico('fire'), base: 20, growth: 1.255,
      desc: 'Bigger thruster tank. HOLD during flight to boost!',
      stat: (lv) => Math.round(tankFor(lv) / tankFor(0) * 100) + '% tank',
    });
  }
  // the save was loaded before mods? make sure level 0 exists either way
  try { if (NO.Save && NO.Save.data && NO.Save.data.up && !(NO.Save.data.up.fuel >= 0)) NO.Save.data.up.fuel = 0; } catch (e) { /* ignore */ }
  const fuelLv = () => Math.max(0, Math.min(MAXLV(), (NO.Save.data.up && NO.Save.data.up.fuel) | 0));

  /* ------------------------------- state -------------------------------- */
  const st = {
    fuel: 0, tank: 0.38, held: false, firing: false, a: 0, // a = visual intensity 0..1
    gaugeA: 0, emptyFlash: 0, refillFlash: 0, partT: 0, hintOn: false, hintT: 0, usedThisRun: false,
    used: 0, burnedRun: 0,
  };
  function newRun() {
    st.tank = tankFor(fuelLv());
    st.fuel = st.tank; st.held = false; st.firing = false; st.a = 0;
    st.emptyFlash = 0; st.refillFlash = 0; st.hintOn = false; st.hintT = 0; st.lap = -1; st.refills = 0; st.usedThisRun = false; st.burnedRun = 0;
    audioStop();
  }

  /* ------------------------------- audio -------------------------------- */
  // Own tiny graph (NO.Audio does not expose its context). Created on a user gesture (tap).
  let actx = null, noiseBuf = null, snd = null;
  const muted = () => !!(NO.Save.data && NO.Save.data.muted);
  function audioInit() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const n = actx.sampleRate * 1;
      noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
    } catch (e) { actx = null; }
  }
  function audioStart() {
    if (!actx || muted() || snd) return;
    try {
      const t = actx.currentTime;
      const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
      const osc = actx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 62;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      const og = actx.createGain(); og.gain.value = 0.35;
      const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.06);
      src.connect(bp); bp.connect(g);
      osc.connect(lp); lp.connect(og); og.connect(g);
      g.connect(actx.destination);
      src.start(t); osc.start(t);
      snd = { src, osc, g, bp };
      // ignition chirp
      blip(240, 520, 0.09, 'triangle', 0.06);
    } catch (e) { snd = null; }
  }
  function audioStop() {
    if (!snd || !actx) { snd = null; return; }
    const s = snd; snd = null;
    try {
      const t = actx.currentTime;
      s.g.gain.cancelScheduledValues(t); s.g.gain.setValueAtTime(Math.max(0.0001, s.g.gain.value), t);
      s.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.src.stop(t + 0.15); s.osc.stop(t + 0.15);
    } catch (e) { /* ignore */ }
  }
  function blip(f0, f1, dur, type, vol) {
    if (!actx || muted()) return;
    try {
      const t = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  /* --------------------------- DOM: shop card --------------------------- */
  function injectStyle() {
    if (document.getElementById('boost-style')) return;
    const s = document.createElement('style'); s.id = 'boost-style';
    s.textContent = `
.ucard.boost-card { --c: #f7a531; --cd: #c4730f; --cl: #ffc96b; }
.upg.boost-upg .pips i.on { background: #f7a531; }
`;
    document.head.appendChild(s);
  }
  const fmtShort = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : String(n);
  function fuelUpg() { return NO.UPGRADES.find((u) => u.id === 'fuel'); }
  function cardHTML(lv, big) {
    const u = fuelUpg(), max = lv >= MAXLV(), cost = max ? 0 : NO.upgradeCost(u, lv);
    const can = !max && NO.Save.data.coins >= cost;
    const sub = lv === 0 ? 'Hold to boost mid-air' : `Tank ${Math.round(tankFor(lv) / tankFor(0) * 100)}% bigger`;
    return `<button class="ucard u-fuel boost-card${can ? ' can' : ''}${max ? ' max' : ''}${big ? ' big' : ''}" data-boost-upg="1">
      <span class="uc-icon">${u.icon}</span>
      <span class="uc-body"><span class="uc-title">${u.name}</span><span class="uc-sub">${sub}</span></span>
      <span class="uc-price">${max ? 'MAX' : `<i class="coin"></i>${fmtShort(cost)}`}</span>
      <span class="uc-lv">${lv}</span></button>`;
  }
  function shake(btn) { btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); }
  function buy() {
    const d = NO.Save.data, u = fuelUpg(), lv = fuelLv();
    if (lv >= MAXLV()) return false;
    const cost = NO.upgradeCost(u, lv);
    if (d.coins < cost) { NO.Audio.error && NO.Audio.error(); NO.UI.toast && NO.UI.toast('Not enough coins!'); return false; }
    d.coins -= cost; d.up.fuel = lv + 1;
    NO.Save.save(); NO.Game.refreshEnv && NO.Game.refreshEnv();
    NO.Audio.buy && NO.Audio.buy();
    document.querySelectorAll('.coins-now').forEach((el) => (el.textContent = Math.floor(d.coins).toLocaleString('en-US')));
    const ht = document.getElementById('hudTotal'); if (ht) ht.textContent = Math.floor(d.coins).toLocaleString('en-US');
    if (NO.Game.state.mode === 'aim') st.tank = st.fuel = tankFor(fuelLv());
    refreshCards();
    return true;
  }
  function refreshCan(root) {
    const d = NO.Save.data;
    root.querySelectorAll('.ucard[data-upg]').forEach((c) => {
      const u = NO.UPGRADES.find((x) => x.id === c.dataset.upg); if (!u) return;
      const lv = d.up[u.id]; c.classList.toggle('can', lv < MAXLV() && d.coins >= NO.upgradeCost(u, lv));
    });
  }
  function aimCard(box) {
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(fuelLv(), false);
    const btn = wrap.firstElementChild;
    btn.addEventListener('click', (e) => { e.stopPropagation(); btn.blur(); if (!buy()) shake(btn); });
    box.appendChild(btn);
  }
  function shopCard(grid) {
    const lv = fuelLv(), u = fuelUpg(), max = lv >= MAXLV();
    const el = document.createElement('div');
    el.className = 'upg u-fuel boost-upg';
    el.innerHTML = cardHTML(lv, true) + `
      <div class="upg-desc">${u.desc}</div>
      <div class="pips">${Array.from({ length: 30 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
      <div class="upg-stat">LEVEL ${lv}/${MAXLV()} · ${u.stat(lv)}${max ? '' : ' → ' + u.stat(lv + 1)}</div>`;
    el.querySelector('.ucard').addEventListener('click', (e) => { const b = e.currentTarget; if (!buy()) shake(b); });
    grid.appendChild(el);
  }
  let busy = false;
  function refreshCards() {
    busy = true;
    try {
      const box = document.getElementById('upgCards');
      if (box && box.children.length) {
        const old = box.querySelector('.boost-card'); if (old) old.remove();
        aimCard(box); refreshCan(box);
      }
      const grid = document.getElementById('shopGrid');
      if (grid && grid.children.length) {
        const old = grid.querySelector('.boost-upg'); const next = old && old.nextSibling;
        if (old) old.remove();
        shopCard(grid);
        if (next) grid.insertBefore(grid.lastChild, next);
        refreshCan(grid);
      }
    } finally { busy = false; }
  }
  function watchDOM() {
    const box = document.getElementById('upgCards'), grid = document.getElementById('shopGrid');
    const mo = new MutationObserver(() => {
      if (busy) return;
      busy = true;
      try {
        if (box && box.children.length && !box.querySelector('.boost-card')) aimCard(box);
        if (grid && grid.children.length && !grid.querySelector('.boost-upg')) shopCard(grid);
      } finally { busy = false; }
    });
    if (box) mo.observe(box, { childList: true });
    if (grid) mo.observe(grid, { childList: true });
    // a render may already have happened
    if (box && box.children.length && !box.querySelector('.boost-card')) aimCard(box);
  }
  function domReady() { injectStyle(); watchDOM(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', domReady); else domReady();

  /* --------------------------- input + physics -------------------------- */
  function canFire(S) {
    const b = S.bomb;
    return st.held && st.fuel > 0 && S.mode === 'flight' && b && !b.rolling && !b.stopped && S.run;
  }

  /* ------------------------------- particles ---------------------------- */
  function tail(b) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const dx = b.vx / sp, dy = b.vy / sp;
    return { x: b.x - dx * 1.02, y: b.y - dy * 1.02, dx, dy };
  }
  function emit(S, dt) {
    st.partT -= dt;
    if (st.partT > 0) return;
    st.partT = 1 / 50;
    const b = S.bomb, T = tail(b), P = S.particles;
    if (P.length > 820) return;
    const bx = b.vx * 0.35, by = b.vy * 0.35;
    const back = 7 + Math.random() * 5;
    const cols = ['#fff3b0', '#ffd23f', '#ff9a1f', '#f2541b'];
    P.push({ k: 'glow', x: T.x - T.dx * 0.4, y: T.y - T.dy * 0.4, vx: bx - T.dx * back + (Math.random() - 0.5) * 3, vy: by - T.dy * back + (Math.random() - 0.5) * 3,
      life: 0, max: 0.2 + Math.random() * 0.12, size: 0.22 + Math.random() * 0.22, color: cols[1 + (Math.random() * 3 | 0)] });
    if (Math.random() < 0.7) {
      const a = Math.atan2(-T.dy, -T.dx) + (Math.random() - 0.5) * 0.9, sp = 8 + Math.random() * 12;
      P.push({ k: 'spark', x: T.x, y: T.y, vx: bx + Math.cos(a) * sp, vy: by + Math.sin(a) * sp, life: 0, max: 0.25 + Math.random() * 0.25, size: 0.07 + Math.random() * 0.07, color: cols[Math.random() * 3 | 0] });
    }
    if (Math.random() < 0.35) {
      P.push({ k: 'smoke', x: T.x - T.dx * 1.2, y: T.y - T.dy * 1.2, vx: b.vx * 0.1, vy: b.vy * 0.1 + 0.8, life: 0, max: 0.6 + Math.random() * 0.4, size: 0.3 + Math.random() * 0.25, color: 'rgba(120,110,140,0.55)' });
    }
  }

  /* ------------------------------ drawing ------------------------------- */
  const INK = '#1f1b4d';
  function flamePath(ctx, len, w) {
    ctx.beginPath();
    ctx.moveTo(0, -w);
    ctx.bezierCurveTo(-len * 0.35, -w * 1.15, -len * 0.75, -w * 0.55, -len, 0);
    ctx.bezierCurveTo(-len * 0.75, w * 0.55, -len * 0.35, w * 1.15, 0, w);
    ctx.closePath();
  }
  function drawFlame(ctx, v, S) {
    if (st.a < 0.02 || !S.bomb) return;
    const b = S.bomb;
    if (S.mode !== 'flight') return;
    const L = 1.75 * v.ppm, s = L / 100;
    const x = v.sx(b.x), y = v.sy(b.y);
    if (x < -200 || x > v.W + 200 || y < -200 || y > v.H + 200) return;
    const t = S.t, k = st.a;
    const fl = 0.85 + 0.15 * Math.sin(t * 61) + 0.1 * Math.sin(t * 37 + 1);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle); ctx.scale(s, s);
    ctx.translate(-57, 0);
    ctx.lineJoin = 'round';
    // soft heat glow
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(-30 * k, 0, 0, -30 * k, 0, 70 * k + 1);
    gr.addColorStop(0, 'rgba(255,190,60,0.55)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(-30 * k, 0, 70 * k + 1, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // layered cartoon flame, ink outline on the outer layer
    const w = 17 * (0.55 + 0.45 * k);
    flamePath(ctx, 115 * k * fl, w); ctx.fillStyle = '#e8475b'; ctx.fill(); ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke();
    flamePath(ctx, 86 * k * fl, w * 0.72); ctx.fillStyle = '#ff9a1f'; ctx.fill();
    flamePath(ctx, 56 * k * (0.9 + 0.1 * Math.sin(t * 83)), w * 0.5); ctx.fillStyle = '#ffd23f'; ctx.fill();
    flamePath(ctx, 24 * k, w * 0.28); ctx.fillStyle = '#fffbe6'; ctx.fill();
    // nozzle ring
    ctx.beginPath(); ctx.ellipse(2, 0, 5, 11, 0, 0, Math.PI * 2); ctx.fillStyle = '#5a5f78'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawGauge(ctx, S, W, H, orbit) {
    if (st.gaugeA < 0.02) return;
    const w = orbit ? Math.min(170, W * 0.34) : Math.min(240, W * 0.52), h = 20;
    const x = orbit ? 38 : (W - w) / 2, y = orbit ? H - 40 - h : H - 90 - h;
    const mid = x + w / 2;
    const f = st.tank > 0 ? Math.max(0, Math.min(1, st.fuel / st.tank)) : 0;
    const pop = 1 + st.refillFlash * 0.08 + (st.firing ? 0.03 * Math.sin(S.t * 50) : 0);
    ctx.save();
    ctx.globalAlpha = st.gaugeA;
    ctx.translate(mid, y + h / 2); ctx.scale(pop, pop); ctx.translate(-mid, -(y + h / 2));
    // drop shadow + frame
    rr(ctx, x, y + 4, w, h, h / 2); ctx.fillStyle = 'rgba(20,16,60,.28)'; ctx.fill();
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    // fill
    if (f > 0) {
      ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip();
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#e8475b'); g.addColorStop(0.45, '#f7a531'); g.addColorStop(1, '#ffd23f');
      ctx.fillStyle = g; ctx.fillRect(x, y, w * f, h);
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x, y + 3, w * f, 4);
      if (st.refillFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${st.refillFlash * 0.7})`; ctx.fillRect(x, y, w * f, h); }
      ctx.restore();
    }
    rr(ctx, x, y, w, h, h / 2); ctx.lineWidth = 3.5; ctx.strokeStyle = st.emptyFlash > 0 && Math.sin(S.t * 30) > 0 ? '#e8475b' : INK; ctx.stroke();
    // icon badge
    const cx = x - 4, cy = y + h / 2, R = 17;
    ctx.beginPath(); ctx.arc(cx, cy + 3, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,16,60,.28)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = st.firing ? '#ffd23f' : '#f7a531'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    { const im = NO.icoImg('fire'); if (im.complete && im.naturalWidth) ctx.drawImage(im, cx - 11, cy - 11, 22, 22); }
    // label
    ctx.font = '700 13px Fredoka, "Arial Rounded MT Bold", Nunito, sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.fillStyle = '#fff';
    const label = f <= 0 ? (st.emptyFlash > 0 ? 'EMPTY!' : orbit ? 'REFILL EACH LAP' : 'REFILL ON BOUNCE') : 'THRUSTERS';
    ctx.strokeText(label, mid, y + h / 2 + 1); ctx.fillText(label, mid, y + h / 2 + 1);
    ctx.restore();
  }
  function drawHint(ctx, S, W, H) {
    if (!st.hintOn || st.hintT < 0) return;
    const t = st.hintT;
    const a = Math.min(1, t / 0.25) * Math.min(1, Math.max(0, (3.4 - t) / 0.4));
    if (a <= 0) return;
    const y = H - 90 - 20 - 34;
    const sc = 1 + 0.07 * Math.sin(S.t * 8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, y); ctx.scale(sc, sc);
    ctx.font = '700 30px Fredoka, "Arial Rounded MT Bold", Nunito, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = INK;
    const txt = 'HOLD to boost!';
    ctx.fillStyle = 'rgba(20,16,60,.35)'; ctx.fillText(txt, 0, 4);
    ctx.strokeText(txt, 0, 0); ctx.fillStyle = '#ffd23f'; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  /* ------------------------------- the mod ------------------------------ */
  const store = () => NO.Mods.store('boost');

  NO.Mods.register({
    id: 'boost',
    cfg: CFG, st, tankFor,

    reset() { newRun(); st.gaugeA = 0; },
    aim() { newRun(); },
    launch() {
      newRun();
      const s = store();
      s.flights = (s.flights | 0) + 1;
      if ((s.flights | 0) <= CFG.HINT_FLIGHTS && !(s.used > 0)) { st.hintOn = true; st.hintT = -0.7; } // shows after 0.7 s
    },
    tap(S) {
      audioInit();
      st.held = true;
      if (S.mode === 'flight' && st.fuel <= 0) { st.emptyFlash = 0.6; blip(180, 90, 0.12, 'square', 0.03); }
    },
    tapEnd() { st.held = false; },

    physics(S, dt, b) {
      if (!st.held || st.fuel <= 0 || b.rolling || S.mode !== 'flight') return;
      const g = G().gravity();
      const v0 = S.phys.v0;
      const sp = Math.hypot(b.vx, b.vy);
      const cap = CFG.SPEED_CAP * Math.max(v0 * 0.45, (S.run && S.run.launchSpeed) || v0);
      let fw = (cap - sp) / (CFG.CAP_SOFT * cap);
      fw = fw > 1 ? 1 : fw < 0 ? 0 : fw;
      // thrust follows the current speed (clamped 0.35..1 x v0): strong at launch pace, gentle when slow
      const acc = CFG.THRUST_K * Math.min(v0, Math.max(sp, 0.35 * v0)) * fw;
      if (sp > 0.5) { b.vx += (b.vx / sp) * acc * dt; b.vy += (b.vy / sp) * acc * dt; }
      else b.vx += acc * dt;
      b.vy += CFG.LIFT_G * g * (b.vy < 0 ? 1 : CFG.LIFT_UP) * dt; // hover-ish: lift mostly on the way down
      st.fuel -= dt; st.burnedRun += dt;
      if (st.fuel <= 0) { st.fuel = 0; st.emptyFlash = 0.6; }
    },

    bounce(S, impact) {
      if (impact < CFG.REFILL_MIN_IMPACT || st.fuel >= st.tank) return;
      // diminishing refills (x REFILL_DECAY each time) so total extra fuel is bounded -> the run always ends
      st.fuel = Math.min(st.tank, st.fuel + st.tank * CFG.REFILL * Math.pow(CFG.REFILL_DECAY, st.refills));
      st.refills++;
      st.refillFlash = 1;
      if (st.gaugeA > 0.3) blip(660, 990, 0.08, 'sine', 0.035);
    },

    orbitUpdate(S, dt) {
      const O = S.orbit;
      if (!O) return;
      if (O.laps !== st.lap) { // a fresh lap tops the tank up a little
        if (st.lap >= 0 && O.laps > st.lap && st.fuel < st.tank) { st.fuel = Math.min(st.tank, st.fuel + st.tank * CFG.REFILL); st.refillFlash = 1; } // orbit laps are capped, so this is bounded
        st.lap = O.laps;
      }
      if (!st.held || st.fuel <= 0 || O.phase !== 'loop') return;
      // speed-up only: laps are still decided by orbit speed, so total distance is unchanged
      const lap = Math.max(1.7, Math.min(3.4, 3.4 - (O.speed - NO.CONFIG.ORBIT_VX) / 45));
      const next = O.laps + 1 - 0.002;
      O.prog = Math.min(next, O.prog + CFG.ORBIT_RATE * dt / lap);
      st.fuel = Math.max(0, st.fuel - dt);
    },

    update(S, dt, rawDt) {
      const fl = S.mode === 'flight' || S.mode === 'orbit';
      const firing = fl && st.held && st.fuel > 0 && (S.mode === 'orbit' ? (S.orbit && S.orbit.phase === 'loop') : (S.bomb && !S.bomb.rolling));
      if (firing && !st.firing) { audioStart(); if (!st.usedThisRun) { st.usedThisRun = true; const s = store(); s.used = (s.used | 0) + 1; } if (st.hintOn) st.hintT = Math.max(st.hintT, 3.0); }
      if (!firing && st.firing) audioStop();
      if (snd && muted()) audioStop();
      st.firing = firing;
      st.a += ((firing ? 1 : 0) - st.a) * Math.min(1, rawDt * (firing ? 22 : 12));
      st.gaugeA += ((fl ? 1 : 0) - st.gaugeA) * Math.min(1, rawDt * 6);
      st.emptyFlash = Math.max(0, st.emptyFlash - rawDt);
      st.refillFlash = Math.max(0, st.refillFlash - rawDt * 2.5);
      if (st.hintOn) {
        if (S.mode !== 'flight') st.hintOn = false;
        else { st.hintT += rawDt; if (st.hintT > 3.4) st.hintOn = false; }
      }
      if (firing && S.mode === 'flight') emit(S, dt);
      if (snd && actx) { try { snd.bp.frequency.setTargetAtTime(560 + 380 * Math.random(), actx.currentTime, 0.03); } catch (e) { /* ignore */ } }
    },

    boom() { st.held = false; audioStop(); },
    mode(m) { if (m !== 'flight' && m !== 'orbit') audioStop(); },

    renderFront(ctx, v, S) { drawFlame(ctx, v, S); },
    renderHUD(ctx, S, W, H) { drawGauge(ctx, S, W, H); drawHint(ctx, S, W, H); },
    renderOrbit(ctx, S, g) {
      const W = G().W, H = G().H;
      drawGauge(ctx, S, W, H, true);
      if (st.firing && S.orbit) {
        // little exhaust puff behind the orbiting bomb
        const p = G().orbitPos(S.orbit.prog), a = p.a + Math.PI / 2;
        const bx = p.x - Math.cos(a) * 18, by = p.y - Math.sin(a) * 18;
        ctx.save();
        const fl = 0.8 + 0.2 * Math.sin(S.t * 60);
        ctx.translate(bx, by); ctx.rotate(a); ctx.scale(0.22 * fl, 0.22);
        flamePath(ctx, 80, 14); ctx.fillStyle = '#e8475b'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
        flamePath(ctx, 55, 9); ctx.fillStyle = '#ffd23f'; ctx.fill();
        ctx.restore();
      }
    },
  });
})();
