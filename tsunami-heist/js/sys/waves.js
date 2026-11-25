// waves system — see ../hooks.js for the bus API
// Makes every wave type readable and gives rewards for nerve:
//  * per-type tells: Surge pulses (crest foams before each lunge), Riptide current, leaping sharks,
//    towering Tidal Wall with a long deadly backwash, Storm Wave lightning strikes (1 s warning circle).
//  * HUD badge with the wave's icon, name and a one-line tip; a big intro the first time a type shows up.
//  * CLOSE CALL! (wave passes right next to you while you hide) and Deep Survivor (survived a wave far out).
const INK = '#141020';
const svg = body => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><g stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const WAVE_P = 'M2.5 20.5v-3.2c.8-6.6 5.4-11.6 11.4-11.6 3.6 0 6.1 2 6.1 4.6 0 2.1-1.6 3.5-3.5 3.5-1.6 0-2.7-1-2.7-2.3 0-.9.5-1.5 1.1-1.8-3.4-.2-5.9 2.4-6.6 6.2 1.3-1.1 2.6-1.1 3.8 0 1.6 1.4 3.4 1.4 5 0 1.6-1.4 3.4-1.4 5 0v4.6z';
const ICONS = {
  wave: c => svg(`<path d="${WAVE_P}" fill="${c}"/>`),
  double: () => svg(`<path d="${WAVE_P}" fill="#7fc8ff" transform="translate(-2 -2) scale(.85)"/><path d="${WAVE_P}" fill="#2fa6ff" transform="translate(5 3.5) scale(.8)"/>`),
  mega: () => svg(`<path d="${WAVE_P}" fill="#9a5cff"/><path d="M15 2.5l1 2.2 2.3.3-1.7 1.6.5 2.3-2.1-1.2-2 1.2.4-2.3L11.7 5l2.3-.3z" fill="#ffd23f"/>`),
  surge: () => svg(`<path d="M2.5 7.5 9 12l-6.5 4.5zM10 7.5l6.5 4.5-6.5 4.5z" fill="#2fe0e8"/><path d="M17.5 6.5h3v11h-3z" fill="#fff"/>`),
  riptide: () => svg(`<path d="M12 3.5a8.5 8.5 0 1 1-8.3 10.3" fill="none" stroke-width="3.6"/><path d="M12 3.5a8.5 8.5 0 1 1-8.3 10.3" fill="none" stroke="#3fe0c8" stroke-width="1.8"/><path d="M12 8a4 4 0 1 1-3.9 4.8" fill="none" stroke="#3fe0c8" stroke-width="2"/><path d="m1.5 11.5 2.2 3.6 3.4-2.6z" fill="#3fe0c8"/>`),
  shark: () => svg(`<path d="M2 19.5c3-1.4 5.5-1.4 8 0s5 1.4 8 0c1.3-.6 2.6-.9 4-.9" fill="none" stroke="#2fa6ff" stroke-width="2.4"/><path d="M5.5 17 13.5 3.5c.3 4.6 1.7 9 5.5 13.5z" fill="#8fa6c4"/><path d="M13.3 6.5c.4 3.4 1.6 6.6 3.8 10" fill="none" stroke="#fff" stroke-width="1.2"/>`),
  tidal: () => svg(`<path d="M3 21.5V12c0-6 3.6-9.5 8.6-9.5 4.2 0 6.6 2.4 6.6 5 0 2-1.4 3.4-3.2 3.4-1.4 0-2.4-.9-2.4-2.1 0-.8.4-1.3.9-1.6-3.2.1-5.3 3-5.3 7.3 1.4-1.2 2.8-1.2 4.2 0s3.4 1.2 4.8 0 3.4-1.2 4.8 0v7z" fill="#1d5fd0"/><path d="M5.5 9.5c.8-3 2.8-4.8 5.6-5" fill="none" stroke="#fff" stroke-width="1.3"/>`),
  storm: () => svg(`<path d="M6.5 13.5a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1 3.6 3.6 0 0 1 .7 7.1L17 13.5z" fill="#8a96b0"/><path d="M12.5 10.5 9.5 15.5h3l-1.5 6 5-7.5h-3l1.5-3.5z" fill="#ffd23f"/>`),
};
const META = {
  slow: { title: 'Slow Wave', tip: 'take your time — but do hide', ic: () => ICONS.wave('#7fd4ff') },
  normal: { title: 'Wave', tip: 'find a safe spot or run home', ic: () => ICONS.wave('#2fa6ff') },
  fast: { title: 'Fast Wave', tip: 'quick! nearest safe spot', ic: () => ICONS.wave('#1a6cff') },
  mega: { title: 'MEGA Wave', tip: 'huge and very fast', ic: ICONS.mega, intro: true },
  double: { title: 'Double Wave', tip: 'two fronts — stay hidden after the first', ic: ICONS.double, intro: true },
  surge: { title: 'Surge', tip: 'lunges in bursts — foaming crest = burst coming', ic: ICONS.surge, intro: true, toast: '⏩ SURGE — it lunges when the crest foams!' },
  riptide: { title: 'Riptide', tip: 'the current drags you out to sea — head home early', ic: ICONS.riptide, intro: true },
  shark: { title: 'Shark Wave', tip: 'sharks leap ahead of the crest', ic: ICONS.shark, intro: true, toast: '🦈 SHARK WAVE incoming!' },
  tidal: { title: 'Tidal Wall', tip: 'slow but towering — its backwash stays deadly', ic: ICONS.tidal, intro: true, toast: '🌊 TIDAL WALL — stay hidden until it is far past!' },
  storm: { title: 'Storm Wave', tip: 'lightning strikes the track — dodge the circles', ic: ICONS.storm, intro: true, toast: '⛈️ STORM WAVE — dodge the lightning!' },
};
const metaOf = t => META[t?.id] || META.normal;

let waves_lastStruckToast = 0;
export default function init(game, bus) {
  const { THREE, C, W, fx, sound, player, actors } = game;
  const st = bus.state('waves', { seen: {}, closeCalls: 0, deepSurvives: 0 });
  const rand = (a, b) => a + Math.random() * (b - a);
  const lowQ = game.lowQ;

  // ------------------------------------------------------------ HUD badge
  const css = document.createElement('style');
  css.textContent = `
#waveType { display: none; margin: 4px auto 0; width: max-content; max-width: 92vw; align-items: center; gap: 6px; padding: 3px 12px 3px 6px; border-radius: 14px;
  background: rgba(20,16,32,.55); border: 2px solid rgba(20,16,32,.75); font-size: 17px; line-height: 1.1; }
#waveType.on { display: flex; }
#waveType .ico { width: 1.5em; height: 1.5em; flex: none; }
#waveType b { font-weight: normal; letter-spacing: .5px; }
#waveType span { font-size: 13px; opacity: .85; }
#waveType.hot { animation: wvHot .45s infinite alternate; }
@keyframes wvHot { to { transform: scale(1.06); } }
@media (pointer: coarse), (max-width: 700px) { #waveType { font-size: 13px; margin-left: -26px; } #waveType span { display: none; } }`;
  document.head.appendChild(css);
  const badge = document.createElement('div'); badge.id = 'waveType';
  const wtEl = document.getElementById('waveText');
  wtEl?.parentNode?.insertBefore(badge, wtEl.nextSibling);
  let badgeKey = '';
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  function updateBadge() {
    if (W.state === 'gap') { if (badgeKey) { badge.className = ''; badgeKey = ''; } return; }
    const m = metaOf(W.type);
    const hot = (W.type.surge && surgePre > 0.2) || (W.type.storm && W.state === 'run');
    const key = W.type.id + W.state + hot;
    if (key === badgeKey) return; badgeKey = key;
    const col = new THREE.Color(W.type.color).lerp(new THREE.Color(0xffffff), 0.45).getHex();
    badge.innerHTML = `${m.ic()}<b style="color:${hex(col)}">${m.title.toUpperCase()}</b><span>· ${m.tip}</span>`;
    badge.className = 'on' + (hot ? ' hot' : '');
  }

  // ------------------------------------------------------------ rewards
  const playerIncome = () => {
    let inc = 0; for (const ped of player.plot.pedestals) if (ped.creature) inc += game.income(ped.creature.id, ped.creature.mut, ped.creature.w);
    return inc * game.incMult();
  };
  const worldMult = () => C.WORLDS[C.WORLD].mult;
  function pay(amount, text, color) {
    amount = Math.round(amount);
    game.S.cash += amount;
    game.float(`${text} +$${game.fmt(amount)}`, player.pos, color);
    fx.coins(player.pos, lowQ ? 8 : 14);
    sound.cash(false);
    return amount;
  }
  // per-player bookkeeping
  let wasIn = false, entryGap = Infinity, diedThisWave = false, deepZone = -1, ccThisWave = 0;
  bus.on('kill', a => { if (a === player && W.state !== 'gap') diedThisWave = true; });
  bus.on('waveWarn', t => {
    diedThisWave = false; deepZone = -1; ccThisWave = 0;
    const m = metaOf(t);
    if (m.intro && !st.seen[t.id]) { st.seen[t.id] = 1; game.bigText(`NEW: ${m.title.toUpperCase()}!`, m.tip); }
    if (t.storm) sound.thunder();
    else if (t.tidal || t.id === 'tidal') setTimeout(() => sound.alarm(), 1300);
    else if (t.riptide || t.surge) setTimeout(() => sound.whoosh(), 1300);
    // bots roll their patience for this wave (most wait out a long backwash, a few get impatient)
    for (const b of game.bots) b._wvPatient = Math.random() > 0.12 + (b.personality?.sloppy || 0.3) * 0.2;
  });
  bus.on('waveStart', t => {
    const m = metaOf(t);
    if (m.toast && player.pos.z < 30) game.toast(m.toast, 'red');
    riptideT = t.riptide ? 6 : 0;
    stormT = rand(0.8, 1.5);
  });
  bus.on('waveEnd', () => {
    if (!diedThisWave && deepZone >= 2 && player.swept <= 0) {
      const secs = 1.5 + deepZone; // zone 2: 3.5 s of income … abyss: 7.5 s
      const amt = pay(Math.max(playerIncome() * secs, 40 * worldMult() * deepZone), 'DEEP SURVIVOR!', '#7dff9a');
      st.deepSurvives++;
      game.toast(`🏅 Deep Survivor — ${C.ZONES[deepZone].title}: +$${game.fmt(amt)}`, 'gold');
    }
    deepZone = -1;
  });

  // ------------------------------------------------------------ Surge: stop-and-go pulses
  const CYCLE = 3.4, BURST = 1.2, PRE = 0.8;
  let surgePre = 0; // 0..1 how close the nearest front is to its next lunge (for HUD/sfx)
  const surgeEnv = f => { const p = f._sg % CYCLE; return p < BURST ? Math.sin(Math.PI * p / BURST) : 0; };
  const surgePreOf = f => { const p = f._sg % CYCLE; return p > CYCLE - PRE ? (p - (CYCLE - PRE)) / PRE : 0; };
  bus.mod('wave', f => {
    if (!f || !W.type.surge) return 1;
    if (f._sg === undefined) f._sg = BURST + Math.random() * (CYCLE - BURST - PRE);
    return 0.45 + 2.1 * surgeEnv(f); // average ≈ 0.92 of the nominal speed
  });
  bus.mod('waveH', f => {
    if (!f || f._sg === undefined || !W.type.surge) return 1;
    return 1 + 0.2 * surgePreOf(f) + 0.12 * surgeEnv(f) - 0.06;
  });

  // ------------------------------------------------------------ Riptide: current pulls seaward
  let riptideT = 0;
  const riptideOn = () => W.type.riptide && (W.state === 'warn' || (W.state === 'run' && riptideT > 0));
  bus.mod('speed', a => {
    if (a.pos.z > -0.5) return 1;
    // bots wait out a long backwash (Tidal Wall) instead of stepping back into it
    if (a.isBot && a._wvPatient && W.state === 'run' && game.inShelter(a)) {
      const back = W.type.back || C.WAVE_LETHAL_BACK;
      if (back > C.WAVE_LETHAL_BACK) for (const f of W.fronts) if (!f.done && f.z > a.pos.z - 2 && f.z - back < a.pos.z + 5) return 0.02;
    }
    if (!riptideOn() || game.inShelter(a)) return 1;
    return a.vel.z > 0.5 ? 0.86 : a.vel.z < -0.5 ? 1.06 : 1;
  });

  // ------------------------------------------------------------ Shark Wave: sharks leap ahead of the crest
  const sharkG = {
    body: new THREE.SphereGeometry(1, 12, 8), fin: new THREE.ConeGeometry(0.5, 1.3, 4), tail: new THREE.ConeGeometry(0.75, 1.3, 4),
  };
  const sharkM = { body: game.toon(0x6f86a6), belly: game.toon(0xeef2f6), eye: game.toon(0x141020) };
  const sharks = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(sharkG.body, sharkM.body); body.scale.set(0.85, 0.8, 2.4); g.add(body);
    const belly = new THREE.Mesh(sharkG.body, sharkM.belly); belly.scale.set(0.72, 0.5, 2.1); belly.position.y = -0.35; g.add(belly);
    const fin = new THREE.Mesh(sharkG.fin, sharkM.body); fin.position.set(0, 1.1, -0.2); fin.rotation.x = -0.35; fin.scale.set(0.3, 1, 1); g.add(fin);
    const tail = new THREE.Mesh(sharkG.tail, sharkM.body); tail.position.set(0, 0.2, -2.6); tail.rotation.x = -Math.PI / 2; tail.scale.set(0.25, 1, 1.2); g.add(tail);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(sharkG.body, sharkM.eye); e.scale.setScalar(0.12); e.position.set(s * 0.6, 0.2, 1.6); g.add(e); }
    g.visible = false; game.scene.add(g);
    sharks.push({ g, t: 0, dur: 1, x: 0, off0: 0, off1: 0, h: 5, front: null, cd: 0 });
  }
  function updateSharks(dt) {
    const camZ = game.camera.position.z;
    const f = W.state === 'run' && W.type.sharks ? W.fronts.find(fr => !fr.done) : null;
    for (const s of sharks) {
      if (s.front) {
        s.t += dt; const k = s.t / s.dur;
        if (k >= 1 || s.front.done) {
          s.g.visible = false;
          if (!s.front.done && Math.abs(s.g.position.z - camZ) < 140) fx.splash(s.g.position.x, 0.5, s.g.position.z, lowQ ? 6 : 12, 1.2);
          s.front = null; s.cd = rand(0.2, 1.2); continue;
        }
        const z = s.front.z + s.off0 + (s.off1 - s.off0) * k, y = 4 * s.h * k * (1 - k) + 0.3;
        s.g.position.set(s.x, y, z);
        s.g.rotation.set(-(1 - 2 * k) * 0.9, 0, Math.sin(s.t * 9) * 0.12);
      } else if (f) {
        s.cd -= dt;
        if (s.cd <= 0 && Math.abs(f.z - camZ) < 220) {
          s.front = f; s.t = 0; s.dur = rand(0.9, 1.3); s.h = rand(3.5, 7);
          s.x = rand(-C.TRACK_HALF + 2, C.TRACK_HALF - 2); s.off0 = rand(1, 3); s.off1 = s.off0 + rand(10, 18);
          s.g.visible = true;
          if (Math.abs(f.z - camZ) < 140) fx.splash(s.x, 0.5, f.z + s.off0, lowQ ? 4 : 8, 1);
        }
      }
    }
  }

  // ------------------------------------------------------------ Storm Wave: telegraphed lightning
  const R = 3.4, WARN_T = 1.0;
  const ringGeo = new THREE.RingGeometry(0.86, 1, 40), discGeo = new THREE.CircleGeometry(1, 32);
  const boltGeo = new THREE.CylinderGeometry(0.22, 0.55, 1, 6, 1, true); boltGeo.translate(0, 0.5, 0);
  const strikes = [];
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    ring.rotation.x = disc.rotation.x = -Math.PI / 2; ring.renderOrder = disc.renderOrder = 5;
    const bolt = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xeaf4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    ring.visible = disc.visible = bolt.visible = false;
    game.scene.add(ring, disc, bolt);
    strikes.push({ ring, disc, bolt, t: -1, x: 0, z: 0, flash: 0, dodges: [] });
  }
  let stormT = 0, thunderCd = 0;
  const flashEl = document.getElementById('flash');
  function onTrack(a) { return a.pos.z < -4 && !(a.swept > 0) && !(a.dead > 0) && !game.inShelter(a); }
  function spawnStrike() {
    const s = strikes.find(k => k.t < 0 && k.flash <= 0); if (!s) return;
    let x, z;
    const cands = actors.filter(onTrack);
    if (cands.length && Math.random() < 0.65) {
      const a = cands.includes(player) && Math.random() < 0.4 ? player : cands[(Math.random() * cands.length) | 0];
      const r = rand(0, 4), ang = rand(0, Math.PI * 2);
      x = a.pos.x + a.vel.x * 0.5 + Math.cos(ang) * r; z = a.pos.z + a.vel.z * 0.5 + Math.sin(ang) * r;
    } else {
      const lead = W.z > -Infinity ? W.z : C.TRACK_LEN;
      z = player.pos.z < -4 && Math.random() < 0.6 ? player.pos.z + rand(-50, 30) : rand(Math.max(lead, C.TRACK_LEN), -6);
      x = rand(-C.TRACK_HALF, C.TRACK_HALF);
    }
    s.x = Math.max(-C.TRACK_HALF + 1.5, Math.min(C.TRACK_HALF - 1.5, x)); s.z = Math.min(-5, z);
    s.t = WARN_T; s.dodges.length = 0;
    s.ring.position.set(s.x, 0.22, s.z); s.disc.position.set(s.x, 0.2, s.z);
    s.ring.visible = s.disc.visible = true;
    // bots notice the circle with a human delay — some don't
    for (const b of game.bots) {
      if (!onTrack(b)) continue;
      const d = Math.hypot(b.pos.x - s.x, b.pos.z - s.z);
      if (d < R + 2 && Math.random() < 0.75 - (b.personality?.sloppy || 0.3) * 0.5) s.dodges.push({ b, t: rand(0.25, 0.7) });
    }
  }
  function strike(s) {
    s.ring.visible = s.disc.visible = false;
    s.bolt.visible = true; s.flash = 0.2;
    s.bolt.position.set(s.x, 0, s.z); s.bolt.scale.set(1, 70, 1); s.bolt.rotation.y = Math.random() * 6;
    const near = Math.abs(s.z - game.camera.position.z) < 160;
    const p = s.bolt.position;
    if (near) {
      fx.burst(p, 0xfff2a0, lowQ ? 20 : 40); fx.ring(p, 0xffffff, 5, 0.35, true); fx.ring(p, 0x9fd8ff, 7, 0.5, true);
      fx.smoke && fx.smoke(p, lowQ ? 4 : 8);
    }
    const dp = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
    if (dp < 70 && thunderCd <= 0) { sound.thunder(); thunderCd = 0.6; }
    if (dp < 40) { game.addShake(0.5 * (1 - dp / 40)); if (flashEl && !game.inShelter(player)) { flashEl.style.background = '#eaf4ff'; flashEl.style.transition = 'none'; flashEl.style.opacity = 0.35 * (1 - dp / 40); requestAnimationFrame(() => { flashEl.style.transition = 'opacity .4s'; flashEl.style.opacity = 0; }); } }
    for (const a of actors) {
      if (!onTrack(a) || a.pos.y > 2.5) continue;
      const dx = a.pos.x - s.x, dz = a.pos.z - s.z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      const nx = d > 0.1 ? dx / d : Math.random() - 0.5, nz = d > 0.1 ? dz / d : Math.random() - 0.5;
      a.kb.set(nx * 18, 0, nz * 18); a.vy = 9; a.onGround = false; a.stun = 0.8;
      const lost = game.dropCarry(a, 'hit');
      fx.hit(a.pos, 0xfff2a0);
      if (a === player) {
        game.flashHit(); sound.bonk(true);
        // don't stack the same toast when several strikes land in a row
        const now = performance.now();
        if (lost || now - (waves_lastStruckToast || 0) > 4000) { waves_lastStruckToast = now; game.toast(lost ? '⚡ Struck by lightning — you dropped it! Grab it back!' : '⚡ Struck by lightning!', 'red'); }
      }
    }
  }
  function updateStorm(dt) {
    thunderCd -= dt;
    if (W.state === 'run' && W.type.storm) {
      stormT -= dt;
      if (stormT <= 0) { spawnStrike(); stormT = rand(0.45, 0.95) / (1 + 0.1 * C.WORLD); }
    }
    for (const s of strikes) {
      if (s.flash > 0) { s.flash -= dt; s.bolt.material.opacity = Math.max(0, s.flash / 0.2); if (s.flash <= 0) s.bolt.visible = false; }
      if (s.t < 0) continue;
      s.t -= dt;
      const k = 1 - s.t / WARN_T;
      s.ring.scale.setScalar(R * (0.4 + 0.6 * Math.min(1, k * 1.6)));
      s.disc.scale.setScalar(R * k);
      s.ring.material.opacity = 0.55 + 0.45 * Math.sin(k * 30);
      s.disc.material.opacity = 0.15 + 0.3 * k;
      for (const d of s.dodges) {
        if (d.t <= 0) continue; d.t -= dt;
        if (d.t <= 0 && onTrack(d.b)) {
          let ax = d.b.pos.x - s.x; if (Math.abs(ax) < 0.3) ax = Math.random() < 0.5 ? -1 : 1;
          d.b.kb.x += Math.sign(ax) * 11; d.b.kb.z += Math.sign(d.b.pos.z - s.z || 1) * 3;
        }
      }
      if (s.t <= 0) { s.t = -1; strike(s); }
    }
  }
  function clearStorm() { for (const s of strikes) { s.t = -1; s.flash = 0; s.ring.visible = s.disc.visible = s.bolt.visible = false; } }

  // ------------------------------------------------------------ main tick
  const pz = new WeakMap(); // front -> z last tick (to detect the crest passing an actor)
  bus.on('tick', dt => {
    if (riptideT > 0 && W.state === 'run') riptideT -= dt;
    // surge phases + foaming crest tell
    surgePre = 0;
    if (W.state === 'run' && W.type.surge) {
      const camZ = game.camera.position.z;
      for (const f of W.fronts) {
        if (f.done || f._sg === undefined) continue;
        const before = f._sg % CYCLE; f._sg += dt; const after = f._sg % CYCLE;
        const pre = surgePreOf(f); surgePre = Math.max(surgePre, pre);
        if (Math.abs(f.z - camZ) < 200 && pre > 0) {
          const sc = (W.type.tall || 1.45) * (0.35 + 0.65 * f.grow);
          for (let k = 0; k < (lowQ ? 3 : 8) * pre; k++) fx.spray(rand(-C.TRACK_HALF, C.TRACK_HALF), 12.5 * sc + rand(0, 2.5), f.z + 1, 0.8);
        }
        if (after < before && Math.abs(f.z - player.pos.z) < 120) sound.whoosh(); // lunge starts
      }
    }
    // riptide current: streaks of foam flowing out to sea, and a gentle drag on everyone on the open track
    if (riptideOn()) {
      for (const a of actors) if (a.pos.z < -0.5 && !(a.swept > 0) && !(a.dead > 0) && !game.inShelter(a) && a.onGround) a.pos.z -= 0.9 * dt;
      if (player.pos.z < 0) for (let k = 0; k < (lowQ ? 1 : 3); k++)
        fx.soft.emit(player.pos.x + rand(-16, 16), 0.12, player.pos.z + rand(-25, 20), 0, 0, -rand(5, 9), { color: 0xc8fff4, size: rand(0.4, 0.8), life: rand(0.6, 1.1), drag: 0.2, grow: 0.6 });
    }
    updateSharks(dt);
    updateStorm(dt);

    // ---- close calls + deep survival (player)
    const inS = game.inShelter(player);
    if (inS && !wasIn) {
      entryGap = Infinity;
      if (W.state === 'run') for (const f of W.fronts) if (!f.done && f.z < player.pos.z) entryGap = Math.min(entryGap, player.pos.z - f.z);
    }
    wasIn = inS;
    if (W.state === 'run') for (const f of W.fronts) {
      const prev = pz.get(f); pz.set(f, f.z);
      if (prev === undefined || f.done || !inS || player.swept > 0 || player.dead > 0) continue;
      if (prev < player.pos.z && f.z >= player.pos.z) {
        const zi = C.zoneAt(player.pos.z);
        if (zi >= 0) deepZone = Math.max(deepZone, zi);
        const mouth = Math.abs(player.pos.x) < C.TRACK_HALF + 3.2;
        if (mouth || entryGap < 35) {
          ccThisWave++; st.closeCalls++;
          const bonus = Math.max(playerIncome() * (2 + 0.5 * Math.max(0, zi)), 25 * worldMult() * (1 + Math.max(0, zi)));
          pay(bonus * (ccThisWave > 1 ? 1.5 : 1), ccThisWave > 1 ? 'CLOSE CALL x2!' : 'CLOSE CALL!', '#ffd23f');
          game.addShake(0.35); sound.safe();
        }
      }
    }
    updateBadge();
  });
  bus.on('travel', () => { clearStorm(); for (const s of sharks) { s.front = null; s.g.visible = false; } riptideT = 0; });
}
