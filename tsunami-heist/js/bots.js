import * as THREE from 'three';
import * as C from './config.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
let lastStealFromPlayer = -30;
let clockT = 0;

export function initBot(b) {
  b.ai = {
    mode: 'idle', t: rand(1, 4), target: null, ped: -1, victim: null, hide: null, stuckT: 0, lastPos: new V3(), unstick: 0, unstickDir: new V3(),
    theft: null, hitBy: null, react: 0, chase: null, chaseT: 0, chaseMax: 8, swingWait: -1, aimErr: 0, wander: null, rolledWave: -1, mistake: false,
  };
  b.personality = { brave: Math.random() < 0.4, aggro: rand(0.3, 1), sloppy: rand(0.15, 0.45) };
}

// seconds until any wave front reaches z (Infinity when none can)
function timeToWave(g, z) {
  const W = g.W;
  if (z > -0.5) return Infinity;
  const tFrom = (from, delay, spBase) => {
    if (z <= from) return Infinity;
    const sp = spBase * (C.waveSpeedMul(from) + C.waveSpeedMul(z)) / 2;
    return delay + (z - from) / sp;
  };
  if (W.state === 'run') {
    let t = Infinity;
    for (const f of W.fronts) if (!f.done) t = Math.min(t, tFrom(f.z, 0, W.type.speed));
    if (W.pending > 0) t = Math.min(t, tFrom(C.WAVE_SPAWN_Z, W.pending, W.type.speed));
    return t;
  }
  return tFrom(C.WAVE_SPAWN_Z, W.state === 'warn' ? W.t : W.t + C.WAVE_WARN, W.state === 'gap' ? 34 : W.type.speed);
}
function wavePassed(g, z) {
  const W = g.W;
  if (W.state === 'gap') return true;
  if (W.state === 'warn' || W.pending > 0) return false;
  return W.fronts.every(f => f.done || f.z > z + C.WAVE_LETHAL_BACK + 4);
}

const botSpeed = b => C.speedOf(b.pos.z <= 0 ? b.speedLv : 0) * C.carryMul(b.carry);

function chooseShelter(g, b, tWave) {
  const sp = botSpeed(b);
  let best = null, bestScore = Infinity;
  for (const s of g.world.shelters) {
    const d = Math.hypot(s.x - b.pos.x, s.zc - b.pos.z);
    if (d / sp > tWave - 0.4 || g.gapBlocks(b, b.pos.z, s.zc)) continue;
    const score = d - (s.zc > b.pos.z ? 8 : 0);
    if (score < bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// how deep a bot dares to go depends on its speed relative to this world's baseline
// …and never past a speed chasm it can't jump (bots know the ramp rule: speed level vs. the sign)
function maxZoneFor(b) {
  const rel = b.speedLv - C.WORLDS[C.WORLD].botLv;
  let z = Math.max(0, Math.min(C.ZONE_COUNT - 1, Math.floor(rel / 3) + 1));
  for (const G of C.GAPS) if (b.speedLv < G.req) { z = Math.min(z, G.zone - 1); break; }
  return z;
}
function pickHuntTarget(g, b) {
  const maxZone = maxZoneFor(b);
  const zone = Math.max(0, maxZone - Math.floor(Math.random() * 3));
  const Z = C.ZONES[zone];
  let cands = g.wilds.filter(w => w.pos.z < Z.z0 && w.pos.z > Z.z1);
  if (!cands.length) cands = g.wilds.filter(w => w.pos.z > C.ZONES[maxZone].z1);
  if (!cands.length) return null;
  cands.sort(() => Math.random() - 0.5);
  cands = cands.slice(0, 3).sort((a, c) => (b.pos.distanceTo(a.pos) - b.pos.distanceTo(c.pos)));
  return cands[0];
}

function pickStealTarget(g, b) {
  const opts = [];
  for (const P of g.plots) {
    if (P === b.plot || P.locked) continue;
    const isPlayer = P === g.player.plot;
    if (isPlayer) {
      const owned = P.pedestals.filter(p => p.creature).length;
      if (owned < 1 || clockT - lastStealFromPlayer < 15) continue;
    }
    P.pedestals.forEach((ped, i) => {
      if (!ped.creature || !ped.group.visible) return;
      const val = C.CREATURE_BY_ID[ped.creature.id].inc * C.MUT_BY_ID[ped.creature.mut || ''].mult;
      // the player is everyone's favourite target, even more while he's out on the track
      const away = isPlayer && !P.contains(g.player.pos.x, g.player.pos.z);
      opts.push({ P, i, w: Math.sqrt(val) * (isPlayer ? (away ? 6 : 3) : 1) });
    });
  }
  if (!opts.length) return null;
  // weighted pick (not always the single richest pedestal on the server)
  let r = Math.random() * opts.reduce((s, o) => s + o.w, 0);
  for (const o of opts) if ((r -= o.w) <= 0) return o;
  return opts[opts.length - 1];
}

function startChase(b, who, max) { const ai = b.ai; ai.mode = 'chase'; ai.chase = who; ai.chaseT = 0; ai.chaseMax = max; ai.swingWait = -1; }

export function updateBot(g, b, dt) {
  clockT += dt / g.bots.length;
  const ai = b.ai;
  if (b.swept > 0 || b.dead > 0) return;
  const atHome = b.plot.contains(b.pos.x, b.pos.z);
  b.speedScale = 1;
  let faceYaw = null;

  // ---- shopping at home
  if (atHome) {
    const cap = Math.min(C.SPEED_MAX_LV, g.player.speedLv + 6);
    if (b.speedLv < cap && b.cash >= C.speedCost(b.speedLv)) { b.cash -= C.speedCost(b.speedLv); b.speedLv++; }
    const nb = C.BATS[b.batIdx + 1];
    if (nb && b.batIdx < Math.min(4, g.S.bat + 1) && b.cash >= nb.cost * 0.7) { b.cash -= nb.cost * 0.7; g.equipBat(b, b.batIdx + 1); }
    if (b.carry) g.placeCarry(b) || dumpWorst(g, b);
  }

  // ---- noticing things (with human-ish delay and imperfect awareness)
  if (ai.theft && !ai.theft.decided) {
    const th = ai.theft; th.decided = true;
    const d = b.pos.distanceTo(th.by.pos);
    const p = b.carry ? 0 : d < 20 ? 0.95 : d < 45 ? 0.7 : 0.25;
    if (Math.random() < p) { th.react = rand(0.45, 1.1); th.go = true; } else ai.theft = null;
  }
  if (ai.theft && ai.theft.go) {
    ai.theft.react -= dt;
    if (ai.theft.react <= 0) { if (!b.carry && ai.mode !== 'chase') startChase(b, ai.theft.by, rand(10, 17)); ai.theft = null; }
  }
  if (ai.hitBy && !ai.hitBy.decided) {
    ai.hitBy.decided = true; ai.hitBy.react = rand(0.4, 1.0);
    if (b.carry || Math.random() > 0.35 + b.personality.aggro * 0.4) ai.hitBy = null;
  }
  if (ai.hitBy) { ai.hitBy.react -= dt; if (ai.hitBy.react <= 0) { ai.hitBy = null; } }

  // ---- wave safety (overrides everything on the track)
  const onTrack = b.pos.z < -0.5;
  let goal = null;
  if (onTrack) {
    const tW = timeToWave(g, b.pos.z);
    const W = g.W, waveKey = W.id + (W.state === 'run' ? 0 : 1);
    if (ai.hide) {
      if (wavePassed(g, b.pos.z)) ai.hide = null;
      else goal = new V3(ai.hide.x + Math.sign(ai.hide.x) * 1.5, 0, ai.hide.zc);
    } else {
      const tHome = (-b.pos.z) / botSpeed(b) + 0.6;
      if (tW < tHome + 2.5 && tW < 16) {
        if (ai.rolledWave !== waveKey) { ai.rolledWave = waveKey; ai.mistake = Math.random() < 0.04; }
        if (!ai.mistake) {
          const s = chooseShelter(g, b, tW);
          const tS = s ? Math.hypot(s.x - b.pos.x, s.zc - b.pos.z) / botSpeed(b) : Infinity;
          if (s && (tS < tHome || tHome > tW - 0.3)) { ai.hide = s; goal = new V3(s.x + Math.sign(s.x) * 1.5, 0, s.zc); }
          else if (tHome < tW + 0.5) goal = new V3(Math.max(-12, Math.min(12, b.pos.x)), 0, 4);
        }
      }
    }
  } else ai.hide = null;

  if (!goal) switch (ai.mode) {
    case 'idle': {
      ai.t -= dt;
      b.speedScale = 0.4;
      if (!atHome) { goal = b.plot.center; b.speedScale = 0.7; break; }
      if (!ai.wander || b.pos.distanceTo(ai.wander) < 1.5) { ai.wander = b.plot.pedestals[Math.floor(Math.random() * 8)].pos.clone().add(new V3(rand(2, 3) * b.plot.dir, 0, rand(-1, 1))); ai.pause = rand(0.3, 2); }
      if (ai.pause > 0) { ai.pause -= dt; break; }
      goal = ai.wander;
      if (ai.t <= 0) {
        if (!b.plot.locked && b.plot.lockCd <= 0 && Math.random() < 0.45 && b.plot.pedestals.some(p => p.creature)) g.lockPlot(b.plot);
        const W = g.W;
        if (W.state === 'warn' && !b.personality.brave) { ai.t = rand(0.5, 1.5); break; }
        if (W.state === 'gap' && W.t < 3 && !b.personality.brave) { ai.t = rand(0.5, 1.5); break; }
        const st = Math.random() < 0.55 * (0.5 + b.personality.aggro) ? pickStealTarget(g, b) : null;
        if (st) { ai.mode = 'steal'; ai.victim = st.P; ai.ped = st.i; }
        else { const w = pickHuntTarget(g, b); if (w) { ai.mode = 'hunt'; ai.target = w; } else ai.t = rand(1, 3); }
      }
      break;
    }
    case 'hunt': {
      const w = ai.target;
      if (b.carry) { ai.mode = 'return'; break; }
      if (!w || !g.wilds.includes(w)) { const n = pickHuntTarget(g, b); if (n && Math.random() < 0.6) ai.target = n; else ai.mode = 'return'; break; }
      if (b.pos.z > -1.5 && g.W.state !== 'gap' && timeToWave(g, -3) < 9) { goal = new V3(Math.max(-12, Math.min(12, b.pos.x)), 0, 4); break; }
      goal = w.pos; b.speedScale = 0.95;
      if (Math.hypot(w.pos.x - b.pos.x, w.pos.z - b.pos.z) < 2.2) { if (g.grabWild(b, w)) ai.mode = 'return'; }
      break;
    }
    case 'return': {
      if (atHome) { ai.mode = 'idle'; ai.t = rand(2, 6); break; }
      const i = g.freeSlot(b.plot);
      goal = i >= 0 ? b.plot.pedestals[i].pos : b.plot.center;
      b.speedScale = b.carry ? 1 : 0.7;
      break;
    }
    case 'steal': {
      const P = ai.victim, ped = P && P.pedestals[ai.ped];
      if (b.carry) { ai.mode = 'return'; break; }
      if (!ped || !ped.creature || P.locked) { ai.mode = 'return'; break; }
      // chicken out if the owner is standing right there
      const owner = P.owner;
      if (owner && owner !== b && P.contains(owner.pos.x, owner.pos.z) && owner.pos.distanceTo(ped.pos) < 10 && Math.random() < dt * 2) { ai.mode = 'return'; break; }
      goal = ped.pos;
      const d = Math.hypot(ped.pos.x - b.pos.x, ped.pos.z - b.pos.z);
      b.speedScale = d < 8 ? 0.6 : 0.85; // sneak up
      if (d < 2.0) {
        if (P === g.player.plot) lastStealFromPlayer = clockT;
        g.steal(b, P, ai.ped); ai.mode = 'return';
      }
      break;
    }
    case 'chase': {
      const a = ai.chase; ai.chaseT += dt;
      if (!a || a.swept > 0 || a.dead > 0 || b.carry || ai.chaseT > ai.chaseMax || b.pos.distanceTo(a.pos) > 60 || !(a.carry && a.carry.from && a.carry.from.plot === b.plot)
        || g.gapBlocks(b, b.pos.z, a.pos.z)) { // he jumped a chasm we can't → let him go
        ai.mode = 'return'; ai.chase = null;
        // pick up what the thief dropped, if it's lying nearby
        const drop = g.wilds.filter(w => !w.pad && w.pos.distanceTo(b.pos) < 10)[0];
        if (drop) { ai.mode = 'hunt'; ai.target = drop; }
        break;
      }
      goal = a.pos;
      // a real chase: the owner is only a bit faster than the (slowed-down) thief, so a head start / juking can get you away
      const thiefSp = C.speedOf(a.pos.z <= 0 ? a.speedLv : 0) * C.carryMul(a.carry);
      b.speedScale = Math.min(1, thiefSp * (1.12 + 0.08 * b.personality.aggro) / Math.max(1, botSpeed(b)));
      const d = b.pos.distanceTo(a.pos);
      if (d < b.bat.range * 0.85) {
        if (ai.swingWait < 0) { ai.swingWait = rand(0.18, 0.5); ai.aimErr = rand(-1, 1) * b.personality.sloppy; }
        faceYaw = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z) + ai.aimErr;
        ai.swingWait -= dt;
        if (ai.swingWait <= 0 && b.swingCd <= 0) { b.yaw = faceYaw; g.swing(b); ai.swingWait = -1; }
        goal = null; // stop and wind up instead of running into them
      } else ai.swingWait = -1;
      break;
    }
  }

  // opportunistic: we run into the guy carrying OUR creature (e.g. out on the track) → go after him
  if (!b.carry && ai.mode !== 'chase' && b.swingCd <= 0) {
    for (const a of g.actors) {
      if (a === b || !(a.carry && a.carry.from && a.carry.from.plot === b.plot) || a.swept > 0 || a.dead > 0) continue;
      const d = b.pos.distanceTo(a.pos);
      if (d < 14 && Math.random() < dt * (d < 5 ? 1.5 : 0.5) * (0.6 + b.personality.aggro)) { startChase(b, a, rand(6, 12)); break; }
    }
  }

  // ---- steer
  let dx = 0, dz = 0, jump = false;
  if (goal) {
    const wp = g.routeNext(b, goal);
    dx = wp.x - b.pos.x; dz = wp.z - b.pos.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.6) { dx = dz = 0; } else { const s = Math.min(1, l / 1.5); dx = dx / l * s; dz = dz / l * s; }
    // plan jumps over hurdles / lava / pits, slowing down so the landing is safe
    const plan = g.needJump(b, dx, dz);
    if (plan) { jump = plan.jump; b.speedScale = Math.min(b.speedScale, plan.cap / Math.max(1, C.speedOf(b.speedLv) * C.carryMul(b.carry))); }
    // speed chasm ahead: run straight at the ramp if we're fast enough, otherwise never step off the edge
    if (b.pos.z < -1 && Math.abs(dz) > 0.05) {
      const Gn = C.GAPS.find(G => dz < 0 ? b.pos.z > G.z0 && b.pos.z - G.z0 < 14 : b.pos.z < G.z1 && G.z1 - b.pos.z < 14);
      if (Gn) {
        if (g.canClearGap(b, Gn)) { dz = Math.sign(dz); dx *= 0.25; b.speedScale = Math.max(b.speedScale, 0.9); jump = false; }
        else { dz = 0; if (ai.mode === 'hunt' || ai.mode === 'chase') { ai.mode = 'return'; ai.chase = null; } }
      }
    }
  }
  ai.stuckT += dt;
  if (ai.stuckT > 0.8) {
    const moved = ai.lastPos.distanceTo(b.pos);
    if (moved < 0.4 * b.speedScale && (dx || dz) && b.stun <= 0) { ai.unstick = 0.6; ai.unstickDir.set(-dz + rand(-0.5, 0.5), 0, dx + rand(-0.5, 0.5)).normalize(); if (Math.random() < 0.5) ai.unstickDir.negate(); jump = true; }
    ai.lastPos.copy(b.pos); ai.stuckT = 0;
  }
  if (ai.unstick > 0) { ai.unstick -= dt; dx = ai.unstickDir.x; dz = ai.unstickDir.z; }
  g.moveActor(b, dx, dz, dt, jump, faceYaw);
}

function dumpWorst(g, b) {
  let worst = -1, wv = Infinity;
  b.plot.pedestals.forEach((p, i) => { if (i < 8 && p.creature) { const v = C.CREATURE_BY_ID[p.creature.id].inc; if (v < wv) { wv = v; worst = i; } } });
  if (worst < 0 || !b.carry) return;
  const incoming = C.CREATURE_BY_ID[b.carry.id].inc;
  if (incoming <= wv) { b.cash += incoming * 25; g.clearCarry(b); return; }
  b.cash += wv * 25;
  const ped = b.plot.pedestals[worst];
  ped.creature = null; if (ped.mesh) { ped.group.remove(ped.mesh); ped.mesh = null; } if (ped.label) { ped.group.remove(ped.label); ped.label = null; }
  g.placeCarry(b);
}
