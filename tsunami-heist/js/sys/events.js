// events system — random "server events" that make a session feel alive (see ../hooks.js for the bus API)
// Every ~3–5 min of play (first one after ~90 s) one event runs for 45–90 s, announced 10 s ahead.
// UI: a pill banner under the wave bar / zone name; big announcement via game.bigText; subtle screen tint + particles.
// Other systems may listen to bus.on('eventSoon'|'eventStart'|'eventEnd', id). Debug: game.events.start('meteor').
const EVENTS = [
  { id: 'rain', name: 'Creature Rain', emo: '🌧️', color: '#5ad8ff', tint: '90,170,255', dur: [55, 75],
    desc: 'Rare creatures are falling onto the track!', sub: 'rare creatures fall from the sky — go grab them!' },
  { id: 'gold', name: 'Golden Tide', emo: '✨', color: '#ffd23f', tint: '255,196,40', dur: [50, 70],
    desc: 'Mutation luck x3 — Gold, Diamond & Rainbow!', sub: 'mutation luck x3 on every new creature' },
  { id: 'calm', name: 'Calm Seas', emo: '🏝️', color: '#5dffd0', tint: '60,230,200', dur: [60, 90],
    desc: 'Waves move 30% slower', sub: 'waves are 30% slower — go deeper!' },
  { id: 'rush', name: 'Rush Hour', emo: '💰', color: '#7dff9a', tint: '80,255,140', dur: [45, 60],
    desc: 'All income x2!', sub: 'your creatures earn double' },
  { id: 'meteor', name: 'Meteor Shower', emo: '☄️', color: '#ff7a3a', tint: '255,80,30', dur: [45, 65],
    desc: 'Dodge the red circles — craters drop rare creatures', sub: 'dodge the red circles · every crater leaves a rare creature' },
  { id: 'frenzy', name: 'Frenzy', emo: '⚡', color: '#d08aff', tint: '170,90,255', dur: [45, 60],
    desc: 'Waves come faster — every grab pays a bonus!', sub: 'waves come back-to-back · every grab pays cash' },
];
const BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));
const FIRST_DELAY = 90, GAP_MIN = 180, GAP_MAX = 300, ANNOUNCE = 10;
const METEOR_R = 5.5, METEOR_FALL = 1.0, METEOR_WARN = 2.4, RAIN_FALL = 1.1, RAIN_H = 38;

export default function init(game, bus) {
  const { THREE, C, fx, sound, scene } = game;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const st = bus.state('events', { seen: 0, last: '' });

  // ------------------------------------------------------------ state
  const E = { phase: 'idle', t: FIRST_DELAY, ev: null, dur: 0, last: st.last || '' };
  const mine = new Set();          // wilds spawned by events (meteor craters / rain)
  const falls = [];                // rain creatures still falling: { w, t, ly }
  const later = [];                // delayed reactions: { t, fn }
  let spawnT = 0, fxT = 0, botT = 0;
  const active = id => E.phase === 'on' && E.ev && E.ev.id === id;

  // ------------------------------------------------------------ modifiers
  bus.mod('luck', () => active('gold') ? 3 : 1);
  bus.mod('wave', () => active('calm') ? 0.7 : 1);
  // x2, but only x1.5 on top of an active 2x-cash ad boost so stacked boosts stay sane
  bus.mod('income', () => active('rush') ? (Date.now() < (game.S.boostUntil || 0) ? 1.5 : 2) : 1);

  // ------------------------------------------------------------ UI
  const css = document.createElement('style');
  css.textContent = `
#evBanner { display: flex; width: fit-content; max-width: 100%; margin: 6px auto 0; align-items: center; gap: 8px; padding: 4px 14px 6px 5px; position: relative; overflow: hidden;
  border-radius: 999px; border: 3px solid var(--ink); background: linear-gradient(180deg, rgba(48,38,100,.95), rgba(20,16,32,.9));
  box-shadow: 0 4px 0 var(--ink), inset 0 0 0 2px rgba(255,255,255,.1), 0 0 18px var(--ecg); text-align: left; animation: evIn .35s cubic-bezier(.2,1.5,.4,1); }
#evBanner .eIc { flex: none; width: 36px; height: 36px; border-radius: 50%; border: 3px solid var(--ink); background: radial-gradient(circle at 35% 30%, #fff8, var(--ec) 60%);
  display: flex; align-items: center; justify-content: center; font-size: 20px; text-shadow: none; }
#evBanner .eTx { min-width: 0; line-height: 1.05; }
#evBanner .eTx b { display: block; font-size: 18px; color: var(--ec); font-weight: normal; white-space: nowrap; }
#evBanner .eTx span { display: block; font-size: 13px; color: #e4ecff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#evBanner .eT { flex: none; font-size: 20px; margin-left: 4px; min-width: 42px; text-align: right; }
#evBanner .eBar { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--ec); transition: width .25s linear; }
#evBanner.soon { animation: evIn .35s cubic-bezier(.2,1.5,.4,1), evPulse .8s ease-in-out infinite alternate; }
#evBanner.soon .eT { color: #ffd23f; }
@keyframes evIn { from { transform: translateY(-10px) scale(.85); opacity: 0; } }
@keyframes evPulse { to { box-shadow: 0 4px 0 var(--ink), inset 0 0 0 2px rgba(255,255,255,.1), 0 0 28px var(--ec); } }
#evTint { position: fixed; inset: 0; pointer-events: none; z-index: 4; opacity: 0; transition: opacity 2s ease; }
body.evOn #toasts { top: 162px; }
@media (max-width: 760px) { #evBanner { margin-left: -26px; padding: 3px 10px 5px 4px; gap: 6px; } #evBanner .eTx span { display: none; } #evBanner .eTx b { font-size: 15px; }
  #evBanner .eIc { width: 28px; height: 28px; font-size: 15px; } #evBanner .eT { font-size: 16px; } body.evOn #toasts { top: 196px; } }
@media (max-height: 480px) { #evBanner .eTx span { display: none; } body.evOn #toasts { top: 150px; } }`;
  document.head.appendChild(css);
  const tint = document.createElement('div'); tint.id = 'evTint';
  document.body.insertBefore(tint, document.getElementById('hud'));
  let banner = null, lastShown = '';
  function showBanner() {
    if (!banner) {
      banner = document.createElement('div'); banner.id = 'evBanner'; banner.className = 'stroke';
      banner.innerHTML = '<div class="eIc"></div><div class="eTx"><b></b><span></span></div><div class="eT"></div><div class="eBar"></div>';
      (document.getElementById('waveWrap') || document.getElementById('hud')).appendChild(banner);
    }
    const ev = E.ev;
    banner.style.setProperty('--ec', ev.color); banner.style.setProperty('--ecg', ev.color + '66');
    banner.classList.toggle('soon', E.phase === 'soon');
    banner.querySelector('.eIc').textContent = ev.emo;
    banner.querySelector('b').textContent = E.phase === 'soon' ? `${ev.name.toUpperCase()} INCOMING` : ev.name.toUpperCase();
    banner.querySelector('span').textContent = E.phase === 'soon' ? ev.desc : ev.desc;
    document.body.classList.add('evOn');
    lastShown = '';
  }
  function hideBanner() { if (banner) { banner.remove(); banner = null; } document.body.classList.remove('evOn'); }
  function updateBanner() {
    if (!banner) return;
    const s = Math.max(0, Math.ceil(E.t));
    const txt = E.phase === 'soon' ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (txt !== lastShown) {
      lastShown = txt; banner.querySelector('.eT').textContent = txt;
      banner.querySelector('.eBar').style.width = (E.phase === 'soon' ? (1 - E.t / ANNOUNCE) : E.t / E.dur) * 100 + '%';
    }
  }
  function setTint(ev) {
    if (!ev) { tint.style.opacity = 0; return; }
    tint.style.background = `radial-gradient(ellipse at 50% 45%, rgba(${ev.tint},0) 45%, rgba(${ev.tint},.28) 100%), rgba(${ev.tint},.06)`;
    tint.style.opacity = 1;
  }

  // ------------------------------------------------------------ sfx (procedural, via the game's synth)
  const sfx = {
    soon() { sound.tone(784, 0.14, { type: 'triangle', vol: 0.1 }); sound.tone(1046, 0.22, { type: 'triangle', vol: 0.1, delay: 0.14, rev: 0.3 }); },
    whistle() { sound.tone(1500, 0.9, { type: 'sine', vol: 0.05, slide: -1100 }); sound.hiss(0.9, { vol: 0.05, freq: 2400, sweep: -1800 }); },
    boom(v = 1) { sound.hiss(0.9, { vol: 0.55 * v, freq: 500, q: 0.3, sweep: -380, type: 'lowpass', rev: 0.3 }); sound.tone(70, 0.6, { type: 'sine', vol: 0.45 * v, slide: -35 }); sound.hiss(0.12, { vol: 0.25 * v, freq: 2500, type: 'highpass' }); },
    plop(v = 1) { sound.tone(240, 0.14, { type: 'sine', vol: 0.3 * v, slide: -120 }); sound.hiss(0.08, { vol: 0.12 * v, freq: 1200 }); },
  };

  // ------------------------------------------------------------ helpers
  const P = () => game.player;
  const onTrackZ = z => z < -4;
  function zoneRarity(z) { const zi = C.zoneAt(z); return zi < 0 ? 0 : C.ZONES[zi].rarity ?? zi; }
  function creatureOf(r) { r = clamp(r, 0, 6); while (r > 0 && !C.BY_RARITY[r].length) r--; return pick(C.BY_RARITY[r]).id; }
  function safeSpot(z) {
    for (let k = 0; k < 8; k++) {
      const x = rand(-(C.TRACK_HALF - 2.5), C.TRACK_HALF - 2.5), zz = z + rand(-6, 6);
      if (zz > -6 || zz < C.TRACK_LEN + 6) continue;
      if (game.lavaAt(x, zz) || game.pitAt(x, zz)) continue;
      if (game.hz.hurdles && game.hz.hurdles.some(h => x > h.minX - 1 && x < h.maxX + 1 && zz > h.minZ - 1 && zz < h.maxZ + 1)) continue;
      return new THREE.Vector3(x, 0, zz);
    }
    return null;
  }
  // a z on the track: mostly around where people actually are, sometimes anywhere
  function trackZ() {
    const r = Math.random(), p = P();
    const lo = C.TRACK_LEN + 10, hi = -12;
    if (r < 0.5 && p.pos.z < -2) return clamp(p.pos.z + rand(-90, 45), lo, hi);
    if (r < 0.75) { const b = pick(game.bots); if (b && b.pos.z < -2) return clamp(b.pos.z + rand(-60, 30), lo, hi); }
    const zi = Math.min(C.ZONES.length - 1, Math.floor(Math.pow(Math.random(), 1.6) * C.ZONES.length)); // shallow zones more often
    const Z = C.ZONES[zi]; return rand(Z.z1 + 5, Math.min(hi, Z.z0 - 2));
  }
  const nearCam = (p, d = 70) => p.distanceTo(game.camera.position) < d;
  function incomePerSec() { let s = 0; for (const p of game.S.peds) if (p) s += game.income(p.id, p.mut, p.w); return s * game.incMult(); }
  function pruneMine() { for (const w of mine) if (!game.wilds.includes(w)) mine.delete(w); }
  function spawnEventWild(r, pos, ttl) {
    const w = game.spawnWild(creatureOf(r), game.rollMut(1.5), pos, null, ttl);
    w.evt = true; mine.add(w); return w;
  }

  // ------------------------------------------------------------ Creature Rain
  function rainDrop() {
    pruneMine();
    let n = 0; for (const w of mine) if (w.evt === true) n++;
    if (n >= 16) return;
    const pos = safeSpot(trackZ()); if (!pos) return;
    const W = game.W;
    if (W.state === 'run' && W.fronts.some(f => !f.done && pos.z > f.z - C.WAVE_LETHAL_BACK - 4 && pos.z < f.z + 10)) return; // not into the wave itself
    let r = zoneRarity(pos.z) + 1 + (Math.random() < 0.25 ? 1 : 0);
    const w = spawnEventWild(r, pos, rand(40, 55));
    falls.push({ w, t: RAIN_FALL, ly: w.label.position.y });
    w.mesh.position.y = RAIN_H; w.label.position.y += RAIN_H;
    if (nearCam(pos, 110)) fx.ring(pos, C.RARITIES[C.CREATURE_BY_ID[w.id].r].glow, 2.2, RAIN_FALL, true);
  }
  function updateFalls(dt) {
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i], w = f.w;
      if (!game.wilds.includes(w)) { falls.splice(i, 1); continue; }
      f.t -= dt;
      if (f.t > 0) {
        const k = f.t / RAIN_FALL, h = RAIN_H * k * k;
        w.mesh.position.y = h; w.mesh.rotation.y += dt * 9; w.label.position.y = f.ly + h;
        if (!game.lowQ && Math.random() < 0.6 && nearCam(w.pos, 140)) fx.mote(w.pos.x, h + 1, w.pos.z, C.RARITIES[C.CREATURE_BY_ID[w.id].r].glow);
      } else {
        w.label.position.y = f.ly; falls.splice(i, 1);
        if (nearCam(w.pos, 120)) {
          const col = C.RARITIES[C.CREATURE_BY_ID[w.id].r].glow;
          fx.land(w.pos, 0xe8d2a0, 1.4, game.lowQ ? 8 : 16); fx.ring(w.pos, col, 4, 0.45, true); fx.sparkle(w.pos, col, game.lowQ ? 8 : 16);
          const d = w.pos.distanceTo(P().pos);
          if (d < 40) { sfx.plop(1 - d / 45); if (d < 14) game.addShake(0.15); }
        }
      }
    }
  }

  // ------------------------------------------------------------ Meteor Shower (pooled meshes, shared geometry)
  const ringGeo = new THREE.RingGeometry(0.86, 1, 40), discGeo = new THREE.CircleGeometry(1, 40);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0), glowGeo = new THREE.IcosahedronGeometry(1, 1);
  const rockMat = game.toon ? game.toon(0x5a2a1a, { emissive: 0xff5a1a, ei: 1.6 }) : new THREE.MeshBasicMaterial({ color: 0xff5a1a });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const meteors = [];
  for (let i = 0; i < 7; i++) {
    const ringM = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const fillM = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringM), fill = new THREE.Mesh(discGeo, fillM);
    ring.rotation.x = fill.rotation.x = -Math.PI / 2; ring.renderOrder = fill.renderOrder = 2;
    const rock = new THREE.Group(); rock.add(new THREE.Mesh(rockGeo, rockMat)); const gl = new THREE.Mesh(glowGeo, glowMat); gl.scale.setScalar(1.7); rock.add(gl);
    const craterM = new THREE.MeshBasicMaterial({ color: 0x241a16, transparent: true, opacity: 0.75, depthWrite: false });
    const crater = new THREE.Mesh(discGeo, craterM); crater.rotation.x = -Math.PI / 2; crater.renderOrder = 1;
    ring.visible = fill.visible = rock.visible = crater.visible = false;
    scene.add(ring, fill, rock, crater);
    meteors.push({ on: false, t: 0, pos: new THREE.Vector3(), from: new THREE.Vector3(), ring, fill, rock, crater, craterT: 0, whistled: false });
  }
  function launchMeteor() {
    const m = meteors.find(m => !m.on); if (!m) return;
    // aim: often near someone on the track (with spread, so it's dodgeable), otherwise random
    let z, x;
    const onTrack = game.actors.filter(a => a.pos.z < -8 && a.swept <= 0 && a.dead <= 0 && !game.inShelter(a));
    if (onTrack.length && Math.random() < 0.55) {
      const a = Math.random() < 0.45 && onTrack.includes(P()) ? P() : pick(onTrack);
      z = a.pos.z + a.vel.z * rand(0.3, 1.2) + rand(-6, 6); x = a.pos.x + rand(-5, 5);
    } else { z = trackZ(); x = rand(-C.TRACK_HALF + 2, C.TRACK_HALF - 2); }
    z = clamp(z, C.TRACK_LEN + 8, -12); x = clamp(x, -C.TRACK_HALF + 2, C.TRACK_HALF - 2);
    m.on = true; m.t = METEOR_WARN; m.whistled = false; m.pos.set(x, 0, z);
    m.from.set(x + rand(-22, 22), 70, z - rand(25, 45));
    m.ring.position.set(x, 0.09, z); m.fill.position.set(x, 0.08, z);
    m.ring.scale.setScalar(METEOR_R); m.fill.scale.setScalar(0.01);
    m.ring.visible = m.fill.visible = true; m.rock.visible = false;
    // bots inside the circle notice it (or not) after a human-ish delay and sidestep
    for (const b of game.bots) {
      if (b.swept > 0 || b.dead > 0 || b.pos.z > -1) continue;
      if (Math.hypot(b.pos.x - x, b.pos.z - z) > METEOR_R + 2) continue;
      if (Math.random() > 0.72) continue;
      later.push({ t: rand(0.35, 1.1), fn: () => {
        if (!m.on) return;
        const dx = b.pos.x - m.pos.x, dz = b.pos.z - m.pos.z, d = Math.hypot(dx, dz);
        if (d > METEOR_R + 1) return;
        const ai = b.ai; ai.unstick = rand(0.6, 0.9);
        if (d < 0.3) ai.unstickDir.set(Math.random() - 0.5, 0, 0.5); else ai.unstickDir.set(dx / d + rand(-0.4, 0.4), 0, dz / d + rand(-0.4, 0.4));
        ai.unstickDir.normalize();
      } });
    }
  }
  function impactMeteor(m) {
    const p = m.pos;
    m.ring.visible = m.fill.visible = m.rock.visible = false; m.on = false;
    m.crater.position.set(p.x, 0.07, p.z); m.crater.scale.setScalar(METEOR_R * 0.6); m.crater.material.opacity = 0.75; m.crater.visible = true; m.craterT = 9;
    const pd = p.distanceTo(P().pos);
    if (nearCam(p, 150)) {
      fx.impact(p, 0xff7a1a, true); fx.burst(p, 0xff6a1a, game.lowQ ? 25 : 55); fx.smoke(p, game.lowQ ? 8 : 16);
      fx.ring(p, 0xff5a1a, METEOR_R * 1.4, 0.5, true); fx.land(p, 0x8a6a50, 2, game.lowQ ? 10 : 22);
      game.juice.flash(clamp(0.5 - pd / 120, 0, 0.4), 0xff8a3a);
    }
    if (pd < 90) { sfx.boom(clamp(1.1 - pd / 90, 0.15, 1)); game.addShake(clamp(0.9 - pd / 50, 0, 0.7)); }
    // knock everyone in the blast radius; carriers drop what they hold
    for (const a of game.actors) {
      if (a.swept > 0 || a.dead > 0 || a.pos.z > -0.5 || game.inShelter(a)) continue;
      const dx = a.pos.x - p.x, dz = a.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > METEOR_R) continue;
      const nx = d > 0.2 ? dx / d : Math.random() - 0.5, nz = d > 0.2 ? dz / d : 0.5, k = 26 * (1 - d / METEOR_R * 0.4);
      a.kb.set(nx * k, 0, nz * k); a.vy = 11; a.onGround = false; a.stun = Math.max(a.stun, 1.1); a.hitImmune = Math.max(a.hitImmune, 1.4);
      let dropped = null;
      if (a.carry) { const n0 = game.wilds.length; game.dropCarry(a, 'hit'); if (game.wilds.length > n0) dropped = game.wilds[game.wilds.length - 1]; }
      if (a === P()) {
        game.flashHit(); game.juice.aberr(0.7); game.addShake(0.8);
        game.float(dropped ? 'METEOR! DROPPED IT!' : 'METEOR!', a.pos, '#ff8a3a');
      } else if (a.isBot && dropped && Math.random() < 0.65) {
        later.push({ t: rand(0.9, 1.8), fn: () => { if (!a.carry && a.swept <= 0 && a.dead <= 0 && game.wilds.includes(dropped)) { a.ai.mode = 'hunt'; a.ai.target = dropped; } } });
      }
    }
    // the crater leaves a rare creature behind
    pruneMine();
    let n = 0; for (const w of mine) if (w.evt === 'm') n++;
    if (n < 10 && !game.lavaAt(p.x, p.z) && !game.pitAt(p.x, p.z)) {
      const r = Math.max(2, zoneRarity(p.z) + 1 + (Math.random() < 0.2 ? 1 : 0));
      const w = spawnEventWild(r, p, rand(40, 55)); w.evt = 'm';
      if (nearCam(p, 120)) fx.pillar ? fx.pillar(p, C.RARITIES[C.CREATURE_BY_ID[w.id].r].glow, 20) : null;
    }
  }
  function updateMeteors(dt) {
    for (const m of meteors) {
      if (m.craterT > 0) { m.craterT -= dt; m.crater.material.opacity = 0.75 * clamp(m.craterT / 3, 0, 1); if (m.craterT <= 0) m.crater.visible = false; if (Math.random() < dt * 3 && !game.lowQ) fx.ember(m.crater.position.x + rand(-2, 2), 0.3, m.crater.position.z + rand(-2, 2)); }
      if (!m.on) continue;
      m.t -= dt;
      const k = 1 - m.t / METEOR_WARN, pulse = 0.55 + 0.45 * Math.sin(k * k * 40);
      m.ring.material.opacity = 0.5 + 0.5 * pulse; m.fill.material.opacity = 0.18 + 0.22 * k;
      m.fill.scale.setScalar(Math.max(0.01, METEOR_R * k));
      if (m.t < METEOR_FALL) {
        if (!m.whistled) { m.whistled = true; m.rock.visible = true; if (m.pos.distanceTo(P().pos) < 70) sfx.whistle(); }
        const f = 1 - m.t / METEOR_FALL;
        m.rock.position.lerpVectors(m.from, m.pos, f); m.rock.rotation.x += dt * 7; m.rock.rotation.z += dt * 5;
        m.rock.scale.setScalar(1.6);
        if (nearCam(m.rock.position, 160)) { fx.ember(m.rock.position.x, m.rock.position.y, m.rock.position.z); if (!game.lowQ) fx.smoke(m.rock.position, 1); }
      }
      if (m.t <= 0) impactMeteor(m);
    }
  }
  function clearMeteors() { for (const m of meteors) { m.on = false; m.craterT = 0; m.ring.visible = m.fill.visible = m.rock.visible = m.crater.visible = false; } }

  // ------------------------------------------------------------ Golden Tide: re-roll unmutated pad creatures once
  function goldenSweep() {
    for (const pad of game.pads) {
      const w = pad.item; if (!w || w.mut || Math.random() < 0.5) continue;
      const mut = game.rollMut(); if (!mut) continue;
      const id = w.id, pos = pad.pos.clone();
      game.removeWild(w); game.spawnWild(id, mut, pos, pad);
      if (nearCam(pos, 120)) fx.sparkle(pos, 0xffd23f, 24);
    }
  }

  // ------------------------------------------------------------ Frenzy: cash per grab
  bus.on('grab', (a, w) => {
    if (!active('frenzy')) return;
    const wm = C.WORLDS[C.WORLD].mult;
    const bonus = Math.round(Math.max(incomePerSec() * 5, game.income(w.id, w.mut, w.w) * 15, 40 * wm));
    if (a === P()) {
      game.S.cash += bonus; sound.cash(true); fx.coins(a.pos, game.lowQ ? 8 : 16);
      game.float(`+$${game.fmt(bonus)} FRENZY!`, a.pos, '#d08aff');
    } else if (a.isBot) a.cash = (a.cash || 0) + bonus * 0.5;
  });

  // ------------------------------------------------------------ bots
  const maxZoneFor = b => { let z = clamp(Math.floor((b.speedLv - C.WORLDS[C.WORLD].botLv) / 3) + 1, 0, C.ZONES.length - 1); for (const G of C.GAPS) if (b.speedLv < G.req) { z = Math.min(z, G.zone - 1); break; } return z; };
  function botsReact(dt) {
    botT -= dt; if (botT > 0) return; botT = rand(1.5, 3);
    const W = game.W;
    for (const b of game.bots) {
      if (Math.random() > 0.4) continue;                      // not everyone notices at once
      const ai = b.ai;
      if (b.carry || b.swept > 0 || b.dead > 0 || ai.hide || (ai.mode !== 'idle' && ai.mode !== 'hunt')) continue;
      if (!b.personality.brave && (W.state === 'warn' || (W.state === 'gap' && W.t < 3))) continue;
      if (ai.mode === 'hunt' && ai.target && ai.target.evt) continue;
      const deep = C.ZONES[maxZoneFor(b)].z1;
      let best = null, bd = Infinity;
      for (const w of mine) {
        if (!game.wilds.includes(w) || w.pos.z < deep || falls.some(f => f.w === w)) continue;
        if (game.bots.some(o => o !== b && o.ai.target === w && o.ai.mode === 'hunt')) continue;
        const d = b.pos.distanceTo(w.pos) * rand(0.8, 1.25);   // imperfect judgement
        if (d < bd) { bd = d; best = w; }
      }
      if (!best) continue;
      const tgt = best;
      later.push({ t: rand(0.6, 2.2), fn: () => { if (!b.carry && !b.ai.hide && (b.ai.mode === 'idle' || b.ai.mode === 'hunt') && game.wilds.includes(tgt)) { b.ai.mode = 'hunt'; b.ai.target = tgt; } } });
    }
  }
  function nudgeIdleBots() {
    for (const b of game.bots) later.push({ t: rand(1.5, 6), fn: () => { if (b.ai.mode === 'idle' && !b.carry && Math.random() < 0.8) b.ai.t = Math.min(b.ai.t, rand(0.2, 1.2)); } });
  }

  // ------------------------------------------------------------ flow
  function pickEvent() {
    const pool = EVENTS.filter(e => e.id !== E.last && !(e.id === 'meteor' && C.WORLD === 0 && (game.S.speedLv || 0) < 2));
    return pick(pool);
  }
  function announce(ev) {
    E.ev = ev; E.phase = 'soon'; E.t = ANNOUNCE;
    showBanner(); updateBanner(); sfx.soon();
    game.toast(`${ev.emo} ${ev.name} starts in ${ANNOUNCE}s!`, '');
    bus.emit('eventSoon', ev.id);
  }
  function begin() {
    const ev = E.ev;
    E.phase = 'on'; E.dur = E.t = Math.round(rand(ev.dur[0], ev.dur[1]));
    E.last = st.last = ev.id; st.seen = (st.seen || 0) + 1;
    showBanner(); updateBanner(); setTint(ev);
    game.bigText(`${ev.emo} ${ev.name.toUpperCase()}!`, game.isTouch || innerWidth < 760 ? '' : ev.sub);
    game.juice.flash(0.35, new THREE.Color(ev.color).getHex());
    if (ev.id === 'meteor') sound.thunder(); else sound.newCreature(ev.id === 'gold' || ev.id === 'rain' ? 5 : 3);
    spawnT = ev.id === 'meteor' ? 1.5 : 0.5;
    if (ev.id === 'gold') goldenSweep();
    if (ev.id === 'rain' || ev.id === 'meteor' || ev.id === 'gold') nudgeIdleBots();
    bus.emit('eventStart', ev.id);
  }
  function end(silent = false) {
    const ev = E.ev;
    E.phase = 'idle'; E.t = rand(GAP_MIN, GAP_MAX); E.ev = null;
    hideBanner(); setTint(null);
    if (ev && !silent) game.toast(`${ev.emo} ${ev.name} is over`, '');
    if (ev) bus.emit('eventEnd', ev.id);
  }

  bus.on('tick', dt => {
    // delayed reactions
    for (let i = later.length - 1; i >= 0; i--) { const l = later[i]; l.t -= dt; if (l.t <= 0) { later.splice(i, 1); try { l.fn(); } catch (e) { console.error('[sys events]', e); } } }
    updateFalls(dt); updateMeteors(dt);

    E.t -= dt;
    if (E.phase === 'idle') { if (E.t <= 0) announce(pickEvent()); return; }
    if (E.phase === 'soon') { updateBanner(); if (E.t <= 0) begin(); return; }
    updateBanner();
    const id = E.ev.id, p = P().pos, lq = game.lowQ;

    if (id === 'rain') { spawnT -= dt; if (spawnT <= 0) { spawnT = rand(1.1, 2.2); rainDrop(); } }
    else if (id === 'meteor') { spawnT -= dt; if (spawnT <= 0) { spawnT = rand(1.4, 3.0); launchMeteor(); if (Math.random() < 0.25) launchMeteor(); } }
    else if (id === 'frenzy') { const W = game.W; if (W.state === 'gap' && W.t > 1.5) W.t = 1.5; }
    if (id === 'rain' || id === 'meteor') botsReact(dt);

    // ambient world effect around the player
    fxT -= dt;
    if (fxT <= 0) {
      fxT = lq ? 0.12 : 0.06;
      const x = p.x + rand(-18, 18), z = p.z + rand(-22, 10);
      if (id === 'rain') fx.snow(x, rand(10, 16), z);
      else if (id === 'gold') { fx.mote(x, rand(0.5, 4), z, Math.random() < 0.7 ? 0xffd23f : 0xfff2a0); if (Math.random() < 0.08) { const w = pick(game.wilds); if (w && w.mut && nearCam(w.pos, 90)) fx.sparkle(w.pos, 0xffd23f, 10); } }
      else if (id === 'calm') { if (Math.random() < 0.5) fx.mote(x, rand(0.3, 2.5), z, 0x9affea); }
      else if (id === 'rush') { if (Math.random() < 0.5) fx.mote(x, rand(0.5, 3), z, 0x7dff9a); if (Math.random() < 0.06) { const ped = pick(game.plots[C.PLAYER_PLOT].pedestals.filter(q => q.creature)); if (ped && nearCam(ped.pos, 80)) fx.coins(ped.pos, 6); } }
      else if (id === 'meteor') { if (Math.random() < 0.5) fx.ember(x, rand(0.5, 6), z); }
      else if (id === 'frenzy') { if (Math.random() < 0.6) fx.mote(x, rand(0.5, 4), z, Math.random() < 0.5 ? 0xd08aff : 0xff8af0); }
    }
    if (E.t <= 0) end();
  });

  bus.on('travel', () => {
    // main.js already removed every wild; drop our references and visuals, keep the event itself running
    mine.clear(); falls.length = 0; clearMeteors();
    for (let i = later.length - 1; i >= 0; i--) later.splice(i, 1);
  });

  // debug / API for other systems
  game.events = {
    get current() { return E.phase === 'on' ? E.ev.id : null; },
    get phase() { return E.phase; },
    get timeLeft() { return E.t; },
    list: EVENTS.map(e => e.id),
    start(id) { const ev = BY_ID[id] || pickEvent(); if (E.phase === 'on') end(true); E.ev = ev; E.t = 0; E.phase = 'soon'; showBanner(); begin(); },
    announce(id) { if (E.phase === 'on') end(true); announce(BY_ID[id] || pickEvent()); },
    end() { if (E.phase !== 'idle') end(); },
    skip(sec) { if (E.phase === 'idle') E.t = Math.min(E.t, sec); },
  };
}
