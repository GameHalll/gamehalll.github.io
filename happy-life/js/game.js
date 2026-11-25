'use strict';
// Game engine: physics, safety systems, cameras, local players (1 or 2 split-screen), online "ghosts", rendering.
(() => {
const HL = window.HL, T = HL.T, W = HL.W, H = HL.H;
const { clamp, rnd, pick, overlap, circle, rrect } = HL;
const GRAV = 1800, MOVE = 235, ACCEL = 2600, JUMP = 720, MAXFALL = 1300, IMPACT = 1000, TRAMP = 1100, BELT = 150;
const SPLIT_ZOOM = 0.62, HUD_ZOOM = 0.72;
const FONT = (s, w = 700) => `${w} ${s}px Fredoka, "Trebuchet MS", sans-serif`;

const AIRBAG_MSGS = ['Airbag deployed! Safety first!', 'Boing! Airbag saved you!', "Soft landing! You're welcome!"];
const PILLOW_MSGS = ['Pillow time!', 'Ouchie-proof pillows!', 'No pokey for you!'];
const ANGEL_MSGS = [
  'Oopsie! Your Guardian Angel saved you!', 'Again?! Please be careful!', 'Sweetie, those are SPIKES.',
  "I'm... getting... tired...", 'Why do you keep doing this?!', 'I need a vacation...', 'Fine. FINE.',
];
HL.CAUSES = {
  spikes: 'Spiked it!', dash: 'Dashed right through the bumper!', crusher: 'Flat as a pancake!', saw: 'Too fast for the safety cage!',
  anvil: 'Special delivery!', cannon: 'Bullseye!', ceiling: 'Hit the roof!',
};

const G = HL.game = { active: false };
const NOKEYS = { left: false, right: false, jump: false };
let map, locals, me, ghosts, signals, state, time, countdown, lastCount, particles, parts, airbagFx, fx;
let shake, bonk, opts, sendT, clock = 0, clouds, saves, squish = [], blinkT, blinkA, ignoreBlink = false;
let cam = { x: 0, y: 0 }, VW = W, VH = H, viewer = null;

function mkPlayer(id, prof, sp, li) {
  return {
    id, li, name: prof.name, skin: prof.skin, x: sp.x, y: sp.y, w: 24, h: 36, vx: 0, vy: 0, onGround: false, face: 1,
    coyote: 0, jumpBuf: 0, jumping: false, frozen: 0, teleportTo: null, walk: 0, hidden: false, cp: 0, belt: 0, onMover: null,
    cam: { x: 0, y: sp.y - H * 0.6 }, toast: null, banner: null, curZone: -1, msgCool: 0, vw: W, vh: H,
  };
}

G.start = (o) => {
  opts = o;
  map = HL.buildCourse(o.course || '1-1', o.seed || 1);
  signals = { always: true };
  for (const sp of map.spikes) {
    if (sp.power && sp.power !== 'always') signals[sp.power] = true;
    const sc = sp.power && map.scans.find((q) => q.key === sp.power);
    if (sc) sp.scan = sc;
  }
  const ids = o.locals || [o.myId];
  locals = ids.map((id, li) => {
    const idx = o.players.findIndex((p) => p.id === id);
    const sp = map.spawns[(idx < 0 ? li : idx) % map.spawns.length];
    const prof = o.players[idx] || { name: HL.profile.name, skin: HL.profile.skin };
    const p = mkPlayer(id, prof, sp, li);
    if (ids.length > 1) { p.vw = W / SPLIT_ZOOM; p.vh = H / 2 / SPLIT_ZOOM; }
    p.cam = { x: 0, y: p.y - p.vh * 0.6 };
    return p;
  });
  me = locals[0];
  ghosts = new Map();
  o.players.forEach((p, i) => {
    if (ids.includes(p.id)) return;
    const s = map.spawns[i % map.spawns.length];
    ghosts.set(p.id, { id: p.id, name: p.name, skin: p.skin, x: s.x, y: s.y, tx: s.x, ty: s.y, face: 1, air: false, walk: 0, moving: false, hidden: false });
  });
  state = 'countdown'; countdown = 3.5; lastCount = 4; time = 0;
  particles = []; parts = []; airbagFx = []; fx = []; shake = 0; bonk = null;
  sendT = 0; clouds = new Map(); saves = 0; blinkT = 0; blinkA = true;
  for (const a of map.anvils) a.y = a.ground - 600;
  G.active = true;
};
G.stop = () => { G.active = false; };
G.getState = () => state;
G.getTime = () => time;
G.getSaves = () => saves;
G.me = () => locals && locals[0];
G.locals = () => locals;
const lp = (i) => (locals && locals[i | 0]) || null;
G.say = (t, d) => { const p = me; me = locals[0]; say(t, d); me = p; };
G.jump = (i) => { const p = lp(i); if (p) p.jumpBuf = 0.13; };
G.dash = (i) => { const p = lp(i); if (p) p.dashBuf = 0.12; };
G.EMOTE_COUNT = 4;
G.emote = (e, i) => { const p = lp(i); if (p && !p.hidden) p.emote = { i: e, t: 2.2 }; };
G.respawn = (i) => {
  const p = lp(i);
  if (!p || state !== 'race' || p.frozen > 0 || p.hidden) return;
  me = p; p.inCannon = null;
  rescueTo(map.checkpoints[p.cp], 0.35, 'bird'); say('Back to your checkpoint', 1.4);
  me = locals[0];
};

// ---------------- network hooks ----------------
G.netPos = (id, d) => {
  const g = ghosts && ghosts.get(id);
  if (!g) return;
  g.tx = d.x; g.ty = d.y; g.face = d.f; g.air = !!d.a; g.moving = !!d.m; g.sprint = !!d.s; g.e = d.e == null ? -1 : d.e;
  if (Math.abs(g.tx - g.x) > 300 || Math.abs(g.ty - g.y) > 300) { g.x = g.tx; g.y = g.ty; }
};
G.removeGhost = (id) => { if (ghosts) ghosts.delete(id); };
G.ghostBroke = (id) => {
  const g = ghosts && ghosts.get(id);
  if (!g || g.hidden) return;
  g.hidden = true; explode(g.x + 12, g.y + 18, g.skin);
};
G.standings = (winnerId) => {
  const all = [...locals.map((p) => ({ id: p.id, name: p.name, x: p.x })), ...[...ghosts.values()].map((g) => ({ id: g.id, name: g.name, x: g.x }))];
  for (const q of all) q.pct = HL.clamp((q.x / map.finishX) * 100, 0, 100);
  return all.sort((a, b) => (a.id === winnerId ? -1 : b.id === winnerId ? 1 : b.x - a.x));
};
G.end = () => { if (state === 'race' || state === 'countdown') state = 'over'; };

// ---------------- helpers ----------------
function say(text, dur = 2.2) { me.toast = { text, t: 0, dur }; }
function sayCool(text) { if (me.msgCool <= 0) { say(text); me.msgCool = 2.5; } }
function puff(x, y, n = 8, color = '#ffffff') {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: rnd(-90, 90), vy: rnd(-90, 10), life: rnd(0.35, 0.6), max: 0.6, size: rnd(4, 8), color, grav: -60, shape: 'circle' });
}
const tile = (c, r) => (r < 0 || c < 0 || c >= map.cols ? 0 : r >= map.rows ? 1 : map.g[r][c]);
function solid(c, r) {
  if (c < 0 || c >= map.cols) return true;
  if (r < 0) return false;
  if (r >= map.rows) return true;
  const v = map.g[r][c];
  if (v === 9) return blinkA && !ignoreBlink;
  if (v === 10) return !blinkA && !ignoreBlink;
  return v === 1 || v === 3 || v === 4 || v === 6 || v === 7 || v === 8;
}
function oneWay(c, r) {
  const v = tile(c, r);
  if (v === 5) return true;
  if (v === 2) { const s = clouds.get(r * map.cols + c); return !(s && s.phase === 'gone'); }
  return false;
}
function touchCloud(c, r) {
  let a = c, b = c;
  while (tile(a - 1, r) === 2) a--;
  while (tile(b + 1, r) === 2) b++;
  for (let x = a; x <= b; x++) {
    const k = r * map.cols + x;
    if (!clouds.has(k)) clouds.set(k, { phase: 'shake', t: 0.35 });
  }
}
function overlapsBlink(p) {
  const c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + p.w - 0.01) / T), r0 = Math.floor(p.y / T), r1 = Math.floor((p.y + p.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const v = tile(c, r); if ((v === 9 && blinkA) || (v === 10 && !blinkA)) return true; }
  return false;
}
const gravAt = (p) => { for (const z of map.gravs) if (p.x + 12 > z.x && p.x + 12 < z.x + z.w) return z.g; return 1; };
const windAt = (p) => { let v = 0; for (const w of map.winds) if (w.on && p.x + 12 > w.x && p.x + 12 < w.x + w.w) v += w.dir * w.str; return v; };

// ---------------- player ----------------
function updatePlayer(dt, keys) {
  const p = me;
  if (p.frozen > 0) {
    p.frozen -= dt;
    if (p.frozen <= 0 && p.teleportTo) {
      p.x = p.teleportTo.x; p.y = p.teleportTo.y; p.vx = p.vy = 0; p.teleportTo = null; p.launched = false;
      puff(p.x + 12, p.y + 18, 12, '#fff6c8');
    }
    return;
  }
  const canMove = state === 'race';
  // inside a cannon: wait for jump
  if (p.inCannon) {
    const c = p.inCannon;
    p.x = c.x - 12; p.y = c.y - 18; p.vx = p.vy = 0; p.jumpBuf -= dt;
    if (canMove && p.jumpBuf > 0) {
      p.jumpBuf = 0; p.inCannon = null; p.cannonCool = 0.6;
      p.x = c.x + Math.cos(c.a) * 44 - 12; p.y = c.y + Math.sin(c.a) * 44 - 18;
      p.vx = Math.cos(c.a) * c.power; p.vy = Math.sin(c.a) * c.power; p.launched = true; p.jumping = false; p.face = 1; p.onGround = false; p.coyote = 0; p.onMover = null;
      HL.sfx.thud(); HL.sfx.dash(); shake = Math.max(shake, 6);
      for (let i = 0; i < 10; i++) puff(c.x + Math.cos(c.a) * 50, c.y + Math.sin(c.a) * 50, 1, '#ddd');
    }
    return;
  }
  p.cannonCool = Math.max(0, (p.cannonCool || 0) - dt);
  ignoreBlink = overlapsBlink(p);
  const gm = gravAt(p);
  const dir = canMove ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0;
  const wallSide = (side) => {
    const x = side > 0 ? p.x + p.w + 1 : p.x - 1, c = Math.floor(x / T);
    return solid(c, Math.floor((p.y + 6) / T)) || solid(c, Math.floor((p.y + p.h - 6) / T));
  };
  p.wall = p.onGround ? 0 : wallSide(1) ? 1 : wallSide(-1) ? -1 : 0;
  if (p.wall) { p.wallCoyote = 0.12; p.wallDir = p.wall; } else p.wallCoyote = (p.wallCoyote || 0) - dt;
  if (p.onGround || p.wall) { p.canDash = true; p.launched = false; }
  p.lock = Math.max(0, (p.lock || 0) - dt);
  p.dashBuf = (p.dashBuf || 0) - dt;

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vy = 0;
    if (Math.random() < 0.6) particles.push({ x: p.x + 12, y: p.y + 18 + rnd(-10, 10), vx: -p.vx * 0.2, vy: 0, life: 0.25, max: 0.25, size: 4, color: HL.skinColor(p.skin).body, grav: 0, shape: 'circle' });
  } else {
    const onIce = p.onGround && p.gt === 7;
    if (p.onGround) {
      if (dir && Math.sign(p.vx) === dir && Math.abs(p.vx) >= MOVE * 0.9) p.runT = (p.runT || 0) + dt;
      else if (!dir || Math.sign(p.vx) !== dir) p.runT = 0;
    }
    const boost = HL.clamp(((p.runT || 0) - 0.35) / 0.45, 0, 1);
    p.sprint = boost > 0.6 && Math.abs(p.vx) > MOVE;
    const target = dir * (MOVE + 115 * boost);
    let acc = onIce ? ACCEL * 0.16 : p.onGround ? ACCEL : ACCEL * 0.75;
    if (p.lock > 0) acc *= 0.2;
    if (p.launched) { acc *= 0.07; if (Math.abs(p.vx) <= MOVE) p.launched = false; }
    if (Math.abs(p.vx) > MOVE && !p.onGround && Math.sign(p.vx) === dir) acc *= 0.15; // keep dash momentum a bit
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);
  }
  if (dir && p.lock <= 0 && !p.launched) p.face = dir;

  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  p.jumpBuf -= dt;
  if (canMove && p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = -JUMP; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.jumping = true; p.onMover = null; p.dashT = 0; HL.sfx.jump();
  } else if (canMove && p.jumpBuf > 0 && p.wallCoyote > 0) {
    p.vy = -680; p.vx = -p.wallDir * 330; p.lock = 0.16; p.face = -p.wallDir; p.jumpBuf = 0; p.wallCoyote = 0;
    p.jumping = true; p.dashT = 0; HL.sfx.jump(); puff(p.x + 12 + p.wallDir * 12, p.y + 18, 4);
  }
  if (canMove && p.dashBuf > 0 && p.canDash && !(p.dashT > 0)) {
    p.dashT = 0.16; p.canDash = false; p.dashBuf = 0; p.jumping = false; p.launched = false;
    p.vx = (dir || p.face) * 580; p.vy = 0; HL.sfx.dash(); shake = Math.max(shake, 2);
  }
  if (!(p.dashT > 0)) {
    if (p.jumping && !keys.jump && p.vy < -250) p.vy += GRAV * gm * dt * 1.4;
    p.vy = Math.min(gm < 1 ? MAXFALL * 0.55 : MAXFALL, p.vy + GRAV * gm * dt);
    if (p.wall && dir === p.wall && p.vy > 140) { p.vy = 140; if (Math.random() < 0.3) puff(p.x + 12 + p.wall * 12, p.y + 30, 1, '#eee'); }
  }

  for (const f of map.fans) {
    if (overlap(p, f.x, f.y, f.w, f.h)) {
      p.vy -= 3500 * dt; if (p.vy < -430) p.vy = -430; p.jumping = false; p.onGround = false;
    }
  }

  const wind = windAt(p);
  const mx = (p.vx + (p.onGround ? p.belt : 0) + wind) * dt;
  p.x += mx;
  resolveX(mx);
  const prevBottom = p.y + p.h;
  p.y += p.vy * dt;

  for (const t of map.tramps) {
    if (p.vy >= 0 && p.x + p.w > t.x + 4 && p.x < t.x + t.w - 4 && p.y + p.h >= t.y && prevBottom <= t.y + 12) {
      p.y = t.y - p.h; p.vy = -TRAMP; p.jumping = false; p.onGround = false; t.squash = 1; HL.sfx.boing();
    }
  }
  resolveY(prevBottom);
  if (!p.onGround && p.vy >= 0) {
    for (const m of map.movers) {
      if (p.x + p.w > m.x + 2 && p.x < m.x + m.w - 2 && prevBottom <= m.y + 3 + Math.max(0, m.dy) && p.y + p.h >= m.y) {
        p.y = m.y - p.h; land(p.vy); p.onMover = m; break;
      }
    }
  }
  if (wind && Math.random() < 0.3) particles.push({ x: p.x + 12 + rnd(-20, 40), y: p.y + rnd(0, 36), vx: wind * 2, vy: 0, life: 0.2, max: 0.2, size: 1.5, color: 'rgba(255,255,255,.8)', grav: 0, shape: 'line', len: 18 });
  if (p.onGround && Math.abs(p.vx) > 10) p.walk += dt * (p.sprint ? 24 : 14);
  if (p.sprint && p.onGround && Math.random() < 0.5) puff(p.x + 12 - p.face * 10, p.y + p.h - 2, 1, '#f1e3c8');
  if (p.sprint && Math.random() < 0.35) particles.push({ x: p.x + 12 - p.face * rnd(14, 30), y: p.y + rnd(4, 32), vx: -p.face * 260, vy: 0, life: 0.18, max: 0.18, size: 2, color: 'rgba(255,255,255,.9)', grav: 0, shape: 'line', len: rnd(14, 26) });
  ignoreBlink = false;
}

function resolveX(mx) {
  const p = me;
  const top = Math.floor(p.y / T), bot = Math.floor((p.y + p.h - 0.01) / T);
  if (mx > 0) {
    const c = Math.floor((p.x + p.w) / T);
    for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = c * T - p.w - 0.01; p.vx = Math.min(0, p.vx); break; }
  } else if (mx < 0) {
    const c = Math.floor(p.x / T);
    for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = (c + 1) * T + 0.01; p.vx = Math.max(0, p.vx); break; }
  }
}

function resolveY(prevBottom) {
  const p = me;
  p.onGround = false; p.onMover = null; p.belt = 0; p.gt = 0;
  const l = Math.floor(p.x / T), rr = Math.floor((p.x + p.w - 0.01) / T);
  if (p.vy > 0) {
    const r = Math.floor((p.y + p.h) / T);
    for (let c = l; c <= rr; c++) {
      if (solid(c, r) || (oneWay(c, r) && prevBottom <= r * T + 1)) {
        p.y = r * T - p.h;
        let jelly = false;
        for (let k = l; k <= rr; k++) { const v = tile(k, r); if (v === 8) jelly = true; if (v === 7) p.gt = 7; }
        if (jelly && p.vy > 120) { p.vy = -950; p.jumping = false; p.launched = false; HL.sfx.boing(); squish.push({ c: Math.floor((p.x + 12) / T), r, t: 0 }); return; }
        land(p.vy);
        for (let k = l; k <= rr; k++) {
          const v = tile(k, r);
          if (v === 3) p.belt = -BELT; else if (v === 4) p.belt = BELT;
          if (v === 2) touchCloud(k, r);
        }
        return;
      }
    }
  } else if (p.vy < 0) {
    const r = Math.floor(p.y / T);
    for (let c = l; c <= rr; c++) if (solid(c, r)) { p.y = (r + 1) * T; p.vy = 0; return; }
  }
}

function land(v) {
  const p = me;
  p.vy = 0; p.onGround = true; p.jumping = false; p.launched = false;
  if (v > IMPACT) {
    saves++;
    airbagFx.push({ x: p.x + 12, y: p.y + p.h, t: 0 });
    p.vy = -260; p.onGround = false;
    HL.sfx.airbag(); sayCool(pick(AIRBAG_MSGS));
  } else if (v > 600) puff(p.x + 12, p.y + p.h, 5, '#f1e3c8');
}

function rescueTo(pos, frozen, kind) {
  me.frozen = frozen; me.teleportTo = { x: pos.x, y: pos.y }; me.vx = me.vy = 0; me.launched = false; saves++;
  fx.push({ kind, x: me.x + 12, y: me.y, t: 0 });
}

function hazard(cause) {
  if (state !== 'race' || me.frozen > 0) return;
  const a = map.angel;
  if (a && me.x >= a.x0 && a.hearts > 0) {
    a.hearts--; a.t = 0; a.count++;
    rescueTo(map.checkpoints[a.cp], 0.7, 'angel');
    HL.sfx.angel();
    say(ANGEL_MSGS[Math.min(a.count, ANGEL_MSGS.length) - 1]);
    return;
  }
  breakMe(cause);
}

function explode(cx, cy, skin) {
  const mk = (kind, ox, oy, w, h) => parts.push({ kind, skin, x: cx + ox, y: cy + oy, w, h, vx: rnd(-260, 260), vy: rnd(-650, -320), rot: 0, vr: rnd(-14, 14) });
  mk('head', 0, -11, 17, 17); mk('torso', 0, 2, 16, 15);
  mk('arm', -9, 0, 5, 12); mk('arm', 9, 0, 5, 12); mk('leg', -3, 13, 5, 12); mk('leg', 3, 13, 5, 12);
  for (let i = 0; i < 14; i++) {
    particles.push({ x: cx, y: cy, vx: rnd(-320, 320), vy: rnd(-520, -120), life: rnd(0.8, 1.4), max: 1.4, size: rnd(3, 5),
      color: pick(['#9aa5ad', '#c9d1d6', '#6c757d']), grav: GRAV * 0.8, shape: 'square', rot: rnd(0, 6) });
  }
  for (let i = 0; i < 22; i++) {
    const a = rnd(0, Math.PI * 2), sp = rnd(120, 380);
    particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.5, 0.9), max: 0.9, size: rnd(5, 9),
      color: pick(['#ffd43b', '#ff8fb8', '#74c0fc', '#8ce99a']), grav: 200, shape: 'star', rot: rnd(0, 6) });
  }
  bonk = { x: cx, y: cy - 40, t: 0 };
  shake = 18;
  HL.sfx.bonk();
}

function breakMe(cause) {
  if (state !== 'race') return;
  state = 'broken';
  me.hidden = true; me.inCannon = null;
  me.toast = null;
  explode(me.x + 12, me.y + 18, me.skin);
  if (opts.onBroke) opts.onBroke(time, cause, me.id);
}

// ---------------- world (once per frame) ----------------
function worldTick(dt) {
  for (const m of map.movers) {
    const tx = m.dir > 0 ? m.bx : m.ax, ty = m.dir > 0 ? m.by : m.ay;
    const ox = m.x, oy = m.y;
    if (HL.moveToward(m, tx, ty, m.speed, dt)) m.dir *= -1;
    m.dx = m.x - ox; m.dy = m.y - oy;
  }
  for (const p of locals) if (p.onMover && p.frozen <= 0) { p.x += p.onMover.dx; p.y += p.onMover.dy; }

  for (const [k, s] of clouds) {
    s.t -= dt;
    if (s.t <= 0) {
      if (s.phase === 'shake') { s.phase = 'gone'; s.t = 2.6; const r = Math.floor(k / map.cols), c = k % map.cols; puff(c * T + 20, r * T + 10, 6); }
      else clouds.delete(k);
    }
  }
  // blink blocks
  blinkT += dt;
  const per = map.blink.period, nb = Math.floor(blinkT / per) % 2 === 0;
  if (nb !== blinkA) { blinkA = nb; if (nearAny(map.blinkX)) HL.sfx.click(); }

  for (const t of map.tramps) t.squash = Math.max(0, t.squash - dt * 4);
  for (const q of squish) q.t += dt;
  squish = squish.filter((q) => q.t < 0.3);
  for (const tm of map.timers) {
    tm.t -= dt;
    if (tm.t <= 0) { signals[tm.key] = !signals[tm.key]; tm.t = signals[tm.key] ? tm.on * rnd(0.55, 1.5) : tm.off; }
  }
  for (const s of map.scans) {
    s.pos += s.dir * s.speed * dt;
    if (s.pos > s.max) { s.pos = s.max; s.dir = -1; }
    if (s.pos < s.min) { s.pos = s.min; s.dir = 1; }
  }
  // pillows (players set hold/occ in interact)
  for (const s of map.spikes) {
    s.hold -= dt;
    const powered = spikePowered(s);
    const target = (powered || s.occ) && s.hold > 0 ? 1 : 0;
    s.pillow = clamp(s.pillow + clamp(target - s.pillow, -dt * 4, dt * 8), 0, 1);
    s.occ = false;
  }
  for (const s of map.saws) {
    s.x += s.dir * s.speed * dt;
    if (s.x > s.maxX) { s.x = s.maxX; s.dir = -1; }
    if (s.x < s.minX) { s.x = s.minX; s.dir = 1; }
    s.rot += dt * 14;
    s.away += dt;
    const target = s.away < 1 ? 1 : 0;
    s.cage = clamp(s.cage + clamp(target - s.cage, -dt * 1.5, dt * 5), 0, 1);
    if (s.cage < 0.2) s.msg = false;
  }
  for (const c of map.crushers) {
    c.t -= dt; c.beep = Math.max(0, (c.beep || 0) - dt);
    if (c.state === 'up') { c.y = c.top; if (c.t <= 0) { c.state = 'warn'; c.t = 0.3; } }
    else if (c.state === 'warn') { if (c.t <= 0) c.state = 'down'; }
    else if (c.state === 'down') {
      c.y += 1400 * dt;
      if (c.y + c.h >= c.bottom) {
        c.y = c.bottom - c.h; c.state = 'hold'; c.t = 0.45;
        if (nearAny(c.x)) { HL.sfx.thud(); shake = Math.max(shake, 5); }
      }
    } else if (c.state === 'hold') { if (c.t <= 0) c.state = 'rise'; }
    else if (c.state === 'rise') { c.y -= 260 * dt; if (c.y <= c.top) { c.y = c.top; c.state = 'up'; c.t = c.wait; } }
  }
  for (const k of map.dblocks) { k.t += dt; k.y = k.y0 + Math.sin(k.t * k.speed + k.ph) * k.amp; k.flash = Math.max(0, (k.flash || 0) - dt); }
  for (const c of map.cannons) {
    c.a += c.dir * c.speed * dt;
    if (c.a > c.a1) { c.a = c.a1; c.dir = -1; }
    if (c.a < c.a0) { c.a = c.a0; c.dir = 1; }
  }
  for (const t of map.targets) {
    t.sy += t.dir * t.speed * dt;
    if (t.sy > t.h - t.sh) { t.sy = t.h - t.sh; t.dir = -1; }
    if (t.sy < 0) { t.sy = 0; t.dir = 1; }
    t.flash = Math.max(0, (t.flash || 0) - dt);
  }
  for (const g of map.gloves) {
    const a = Math.sin(clock * g.speed + g.ph) * g.amp;
    g.va = (a - g.a) / Math.max(dt, 1e-4); g.a = a;
    g.gx = g.px + Math.sin(a) * g.len; g.gy = g.py + Math.cos(a) * g.len;
  }
  for (const a of map.anvils) {
    a.t -= dt;
    if (a.state === 'wait') { a.y = a.ground - 600; if (a.t <= 0) { a.state = 'warn'; a.t = 0.75; } }
    else if (a.state === 'warn') { if (a.t <= 0) { a.state = 'fall'; a.vy = 300; } }
    else if (a.state === 'fall') {
      a.vy += 2200 * dt; a.y += a.vy * dt;
      if (a.y + a.h >= a.ground) { a.y = a.ground - a.h; a.state = 'land'; a.t = 0.5; if (nearAny(a.x)) { HL.sfx.thud(); shake = Math.max(shake, 4); } }
    } else if (a.state === 'land') { if (a.t <= 0) { puff(a.x, a.y + 20, 8, '#ddd'); a.state = 'wait'; a.t = a.wait * rnd(0.7, 1.35); } }
    else if (a.state === 'bounce') {
      a.vy += 2200 * dt; a.y += a.vy * dt; a.x2 = (a.x2 || 0) + a.vx * dt;
      if (a.t <= 0) { a.state = 'wait'; a.x2 = 0; a.t = a.wait * rnd(0.7, 1.35); }
    }
  }
  for (const w of map.winds) {
    w.t -= dt;
    if (w.t <= 0) { w.on = !w.on; w.t = w.on ? w.onT * rnd(0.8, 1.25) : w.offT * rnd(0.75, 1.3); }
  }
  const a = map.angel;
  if (a && a.hearts < a.max) { a.t += dt; if (a.t >= a.regen) { a.hearts++; a.t = 0; } }
}
const nearAny = (x) => x == null || locals.some((p) => Math.abs(p.x - x) < p.vw);
function spikePowered(s) {
  if (s.scan) return Math.abs(s.c - s.scan.pos) > s.scan.half;
  return !!(s.power && signals[s.power]);
}

// ---------------- what the current player touches ----------------
function interact(dt) {
  const p = me, racing = state === 'race' && p.frozen <= 0;
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;

  for (const c of map.checkpoints) {
    if (c.i > p.cp && overlap(p, c.fx - 10, c.fy - 80, 60, 130)) {
      p.cp = c.i; c.up = true; HL.sfx.checkpoint(); say('Checkpoint!', 1.4);
    }
  }
  let z = 0;
  for (let i = 0; i < map.zones.length; i++) if (pcx >= map.zones[i].x) z = i;
  if (z !== p.curZone) { p.curZone = z; if (state !== 'countdown') p.banner = { t: 0, title: map.zones[z].name, sub: map.zones[z].tip }; }

  if (racing) {
    for (const r of map.rescues) {
      if (overlap(p, r.x, r.y, r.w, r.h)) {
        rescueTo(map.checkpoints[p.cp], 1.0, 'bird');
        HL.sfx.tweet(); say(pick(["Don't worry, I've got you!", 'Safe and sound!', 'Rescue bird to the rescue!']));
        return;
      }
    }
    if (p.y > map.h + 80) { rescueTo(map.checkpoints[p.cp], 0.3, 'bird'); return; }
  }

  for (const l of map.levers) {
    const t = racing && overlap(p, l.x + 8, l.y + 4, 24, 36);
    if (t && !l['touch' + p.li] && l.on) { l.on = false; signals[l.power] = false; HL.sfx.click(); say('Pillow power OFF... Now hurry to the Pillow Pit!', 3); }
    l['touch' + p.li] = t;
  }

  for (const s of map.spikes) {
    const sx = s.c * T, sy = s.r * T;
    if (Math.abs(sx - p.x) > 200) continue;
    const powered = spikePowered(s);
    if (powered) {
      const near = s.scan || (Math.abs(pcx - (sx + 20)) < 110 && Math.abs(pcy - (sy + 20)) < 130);
      if (near && racing) {
        if (!s.scan && s.pillow < 0.05 && s.hold <= 0 && p.msgCool <= 0) { saves++; sayCool(pick(PILLOW_MSGS)); HL.sfx.poof(); }
        s.hold = 0.8;
      }
    }
    if (s.dir === 'down') {
      if (s.pillow <= 0.55 && overlap(p, sx + 5, sy, 30, 22)) hazard('ceiling');
      else if (s.pillow > 0.55 && overlap(p, sx, sy, T, 26) && p.vy < 0) { p.vy = 120; if (!s.scan) saves++; }
      continue;
    }
    if (s.pillow > 0.3 && overlap(p, sx - 2, sy + 4, T + 4, T)) { s.occ = true; s.hold = Math.max(s.hold, 0.25); }
    if (s.pillow <= 0.55 && overlap(p, sx + 5, sy + 18, 30, 22)) hazard('spikes');
  }

  for (const s of map.saws) {
    const d = Math.hypot(pcx - s.x, pcy - s.y);
    if (d < 240 && racing) s.away = 0;
    if (s.cage > 0.9 && !s.msg && d < 300) { s.msg = true; sayCool('Safety cage engaged!'); HL.sfx.clang(); }
    const nx = clamp(s.x, p.x, p.x + p.w), ny = clamp(s.y, p.y, p.y + p.h);
    if (Math.hypot(nx - s.x, ny - s.y) < s.r && s.cage <= 0.9) hazard('saw');
  }

  for (const c of map.crushers) {
    const under = p.x + p.w > c.x + 2 && p.x < c.x + c.w - 2;
    if (under && racing && p.onGround && (c.state === 'warn' || c.state === 'down')) {
      c.state = 'rise'; c.beep = 0.6; HL.sfx.beep(); saves++; sayCool('Floor sensor: dummy detected!');
    }
    if (under && p.y < c.y + c.h && p.y + p.h > c.y) {
      if (c.state === 'down') hazard('crusher');
      else if (state === 'race') {
        if (p.x + 12 < c.x + c.w / 2) p.x = c.x - p.w - 0.1; else p.x = c.x + c.w + 0.1;
        p.vx = 0;
      }
    }
  }

  for (const k of map.dblocks) {
    if (p.frozen > 0) break;
    const face = HL.overlap(p, k.x - 10, k.y + 4, 12, k.h - 8);
    if (face) {
      const core = HL.overlap(p, k.x - 10, k.y + 30, 12, k.h - 60);
      if (core && p.vx > 430 && racing) { hazard('dash'); }
      else if (racing) {
        p.vx = -340; p.vy = -280; p.dashT = 0; p.lock = 0.2; k.flash = 0.3; saves++;
        HL.sfx.boing(); sayCool(pick(['Boing! Safety bumper!', 'Too slow to get hurt!', 'Bumpers save lives!']));
      }
    } else if (HL.overlap(p, k.x, k.y, k.w, k.h)) {
      if (p.y + p.h - k.y < 16 && p.vy >= 0) { p.y = k.y - p.h; p.vy = 0; p.onGround = true; p.jumping = false; }
      else if (p.y > k.y + k.h - 16) { p.y = k.y + k.h; p.vy = Math.max(0, p.vy); }
      else { p.x = p.x + 12 < k.x + k.w / 2 ? k.x - p.w - 0.1 : k.x + k.w + 0.1; p.vx = 0; }
    }
  }

  // cannons: walk in to load
  for (const c of map.cannons) {
    if (racing && !p.inCannon && !(p.cannonCool > 0) && overlap(p, c.x - 26, c.y - 30, 52, 54)) {
      p.inCannon = c; p.vx = p.vy = 0; p.launched = false; HL.sfx.click();
      say('Press JUMP to fire!', 1.6);
    }
  }
  // bullseye pillar: spikes on its face, a padded shield slides over them
  for (const t of map.targets) {
    if (p.frozen > 0 || !racing) break;
    if (!overlap(p, t.x - 6, t.y, 8, t.h)) continue;
    const cy = p.y + p.h / 2, sy0 = t.y + t.sy, sy1 = sy0 + t.sh;
    if (cy > sy0 - 6 && cy < sy1 + 6) {
      p.vx = -380; p.vy = -200; p.launched = true; t.flash = 0.3; saves++;
      HL.sfx.boing(); sayCool(pick(['Padded shield! Safety first!', 'Missed the bullseye. Phew!']));
    } else if (Math.abs(p.vx) > 200 || p.launched) hazard('cannon');
  }
  // gloves knock you away
  for (const g of map.gloves) {
    if (p.frozen > 0 || !racing || g.gx == null) continue;
    const nx = clamp(g.gx, p.x, p.x + p.w), ny = clamp(g.gy, p.y, p.y + p.h);
    if (Math.hypot(nx - g.gx, ny - g.gy) < g.r && !(p.punchT > 0)) {
      const dir = Math.abs(g.va) > 0.2 ? Math.sign(g.va) : p.x + 12 < g.gx ? -1 : 1;
      p.vx = dir * 520; p.vy = -330; p.launched = true; p.dashT = 0; p.onGround = false; p.punchT = 0.4; p.jumping = false;
      HL.sfx.boing(); shake = Math.max(shake, 4); saves++;
      sayCool(pick(['Pow! Safety punch!', 'Boxing glove says: go home!', 'Knocked to safety!']));
    }
  }
  p.punchT = Math.max(0, (p.punchT || 0) - dt);
  // anvils: umbrellas pop for slow walkers, sprinters get hit
  for (const a of map.anvils) {
    if (a.state !== 'fall' || p.frozen > 0 || !racing) continue;
    const bot = a.y + a.h;
    if (p.x + p.w > a.x - a.w / 2 && p.x < a.x + a.w / 2 && bot > p.y - 130 && a.y < p.y + p.h) {
      const fast = Math.abs(p.vx) >= 300 || p.dashT > 0;
      if (fast) hazard('anvil');
      else {
        a.state = 'bounce'; a.vy = -520; a.vx = (p.x + 12 < a.x ? 1 : -1) * 260; a.t = 0.9; saves++;
        fx.push({ kind: 'umbrella', x: p.x + 12, y: p.y - 6, t: 0, pid: p.id });
        HL.sfx.boing(); sayCool(pick(['Umbrella deployed!', 'Walkers are protected!', 'Too slow for the anvil!']));
      }
    }
  }
}

function updateCam(dt, p, snap) {
  const tx = clamp(p.x + 12 - p.vw / 2 + p.face * 70 * (p.vw / W), 0, Math.max(0, map.w - p.vw));
  const ty = clamp(p.y - p.vh * 0.58, -280, map.h - p.vh);
  const k = snap ? 1 : 1 - Math.exp(-dt * 6);
  p.cam.x += (tx - p.cam.x) * k; p.cam.y += (ty - p.cam.y) * k;
}

function updateParts(dt) {
  for (const q of parts) {
    q.vy += GRAV * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    const hs = Math.max(q.w, q.h) / 2;
    if (q.vy > 0 && solid(Math.floor(q.x / T), Math.floor((q.y + hs) / T))) {
      q.y = Math.floor((q.y + hs) / T) * T - hs;
      q.vy *= -0.38; q.vx *= 0.7; q.vr *= 0.6;
      if (Math.abs(q.vy) < 40) q.vy = 0;
    }
    if (solid(Math.floor((q.x + Math.sign(q.vx) * hs) / T), Math.floor(q.y / T))) q.vx *= -0.5;
  }
}

G.update = (dt, keysIn) => {
  if (!G.active) return;
  const keyList = Array.isArray(keysIn) ? keysIn : [keysIn];
  clock += dt;
  if (map.blinkX === undefined) { let bx = null; for (let c = 0; c < map.cols && bx == null; c++) for (let r = 0; r < map.rows; r++) if (map.g[r][c] >= 9) { bx = c * T; break; } map.blinkX = bx == null ? -1e9 : bx; }
  shake = Math.max(0, shake - dt * 40);
  for (const q of particles) { q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; if (q.rot != null) q.rot += dt * 6; }
  particles = particles.filter((q) => q.life > 0);
  for (const a of airbagFx) a.t += dt;
  airbagFx = airbagFx.filter((a) => a.t < 0.9);
  for (const f of fx) f.t += dt;
  fx = fx.filter((f) => f.t < 1.2);
  if (bonk) bonk.t += dt;
  for (const p of locals) {
    if (p.toast) { p.toast.t += dt; if (p.toast.t > p.toast.dur) p.toast = null; }
    if (p.banner) { p.banner.t += dt; if (p.banner.t > 2.6) p.banner = null; }
    p.msgCool -= dt;
    if (p.emote) { p.emote.t -= dt; if (p.emote.t <= 0) p.emote = null; }
  }

  if (state === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount && n <= 3) { lastCount = n; if (n > 0) HL.sfx.count(); }
    if (countdown <= 0) {
      state = 'race'; HL.sfx.go();
      for (const p of locals) p.banner = { t: 0, title: 'GO! ' + map.title, sub: 'Be the first to get broken. Everything here wants you safe.' };
      if (opts.onGo) opts.onGo();
    }
  }
  if (state === 'race') time += dt;
  worldTick(dt);
  for (let i = 0; i < locals.length; i++) {
    me = locals[i];
    if (me.hidden) continue;
    if (state !== 'broken' && state !== 'over') updatePlayer(dt, keyList[i] || keyList[0] || NOKEYS);
    if (!me.inCannon) interact(dt);
  }
  me = locals[0];
  updateParts(dt);

  for (const g of ghosts.values()) {
    const k = 1 - Math.exp(-dt * 14);
    g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k;
    if (g.moving && !g.air) g.walk += dt * (g.sprint ? 24 : 14);
  }
  for (const p of locals) updateCam(dt, p, !p.camInit);
  for (const p of locals) p.camInit = true;

  sendT -= dt;
  if (sendT <= 0 && opts.onSend) {
    sendT = 1 / 15;
    opts.onSend({ x: Math.round(me.x), y: Math.round(me.y), f: me.face, a: me.onGround ? 0 : 1, m: Math.abs(me.vx) > 10 ? 1 : 0, s: me.sprint ? 1 : 0, e: me.emote ? me.emote.i : -1 });
  }
};

// ================================================================
//  RENDERING
// ================================================================
function star(ctx, x, y, r, rot, fill) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
HL.star = star;

// background scenery for each theme (parallax)
function drawDeco(ctx, th, camX, camY, t, vw, vh) {
  const kind = th.deco;
  if (!kind) return;
  const par = 0.45, gap = 260, base = vh - 16 - (camY - 370) * 0.25;
  const off = ((camX * par) % gap + gap) % gap;
  for (let i = -1, x = -off - gap; x < vw + gap; x += gap, i++) {
    const idx = Math.floor((camX * par) / gap) + i + 1, h = HL.hash(idx, 77);
    const cx = x + gap / 2 + (h - 0.5) * 80, y = base - h * 30;
    ctx.save(); ctx.translate(cx, y);
    if (kind === 'trees') {
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(-6, -60, 12, 60);
      circle(ctx, 0, -78, 34, '#7bd389'); circle(ctx, -22, -62, 22, '#6cc77b'); circle(ctx, 22, -62, 22, '#6cc77b');
    } else if (kind === 'lollipops') {
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -90, 6, 90);
      circle(ctx, 0, -104, 26, ['#ff8fb8', '#b197fc', '#74c0fc'][Math.abs(idx) % 3]);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -104, 14, t + idx, t + idx + 4.2); ctx.stroke();
    } else if (kind === 'pines') {
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-34 + k * 7, -k * 30); ctx.lineTo(0, -60 - k * 30); ctx.lineTo(34 - k * 7, -k * 30); ctx.fillStyle = '#7fb3d5'; ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-10, -110); ctx.lineTo(0, -120); ctx.lineTo(10, -110); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (kind === 'chimneys') {
      ctx.fillStyle = '#6c5c99'; ctx.fillRect(-40, -70, 80, 70); ctx.fillRect(10, -130, 20, 60);
      for (let k = 0; k < 3; k++) circle(ctx, 20 + Math.sin(t + k) * 6, -140 - ((t * 30 + k * 25) % 75), 8 + k * 3, 'rgba(255,255,255,.35)');
      ctx.save(); ctx.translate(-14, -40); ctx.rotate(t * 0.8 + idx);
      for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillStyle = '#8e7bb8'; ctx.fillRect(-4, 12, 8, 9); }
      circle(ctx, 0, 0, 14, '#8e7bb8'); circle(ctx, 0, 0, 5, '#6c5c99'); ctx.restore();
    } else if (kind === 'crystals') {
      for (const [dx, hh, col] of [[-18, 70, '#9775fa'], [4, 100, '#74c0fc'], [24, 60, '#f783ac']]) {
        ctx.beginPath(); ctx.moveTo(dx - 12, 0); ctx.lineTo(dx - 10, -hh * 0.75); ctx.lineTo(dx, -hh); ctx.lineTo(dx + 10, -hh * 0.75); ctx.lineTo(dx + 12, 0);
        ctx.fillStyle = col; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2 + dx + idx); ctx.fill(); ctx.globalAlpha = 1;
      }
    } else if (kind === 'windmills') {
      ctx.fillStyle = '#9aa6bd'; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-5, -110); ctx.lineTo(5, -110); ctx.lineTo(12, 0); ctx.fill();
      ctx.save(); ctx.translate(0, -110); ctx.rotate(t * 2.5 + idx);
      for (let k = 0; k < 3; k++) { ctx.rotate((Math.PI * 2) / 3); ctx.fillStyle = '#e9ecef'; ctx.fillRect(-4, 0, 8, 56); }
      ctx.restore(); circle(ctx, 0, -110, 6, '#adb5bd');
    } else if (kind === 'domes') {
      ctx.beginPath(); ctx.arc(0, 0, 50, Math.PI, 0); ctx.fillStyle = 'rgba(165,216,255,.35)'; ctx.fill(); ctx.strokeStyle = '#a5d8ff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#868e96'; ctx.fillRect(56, -90, 4, 90); circle(ctx, 58, -92, 5, Math.sin(t * 4 + idx) > 0 ? '#ff6b6b' : '#ffa8a8');
    } else if (kind === 'palms') {
      ctx.strokeStyle = '#a0784f'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -60, -6, -120); ctx.stroke();
      ctx.fillStyle = '#37b24d';
      for (let k = 0; k < 5; k++) { ctx.save(); ctx.translate(-6, -120); ctx.rotate(-2.6 + k * 0.9 + Math.sin(t * 1.5 + k) * 0.05); ctx.beginPath(); ctx.ellipse(28, 0, 30, 8, 0, 0, 7); ctx.fill(); ctx.restore(); }
    } else if (kind === 'castles') {
      ctx.fillStyle = '#e8956b';
      ctx.fillRect(-30, -90, 60, 90); ctx.fillRect(-44, -120, 22, 120); ctx.fillRect(22, -120, 22, 120);
      for (const dx of [-44, -30, 22, 36]) ctx.fillRect(dx, -130, 8, 10);
      ctx.beginPath(); ctx.moveTo(-50, -120); ctx.lineTo(-33, -150); ctx.lineTo(-16, -120); ctx.moveTo(16, -120); ctx.lineTo(33, -150); ctx.lineTo(50, -120); ctx.fillStyle = '#c2557f'; ctx.fill();
      ctx.fillStyle = '#9e5a3d'; ctx.beginPath(); ctx.arc(0, -20, 12, Math.PI, 0); ctx.fillRect(-12, -20, 24, 20); ctx.fill();
    }
    ctx.restore();
  }
  if (kind === 'rainbow') {
    const rx = vw * 0.55 - camX * 0.03, ry = vh * 0.95 - camY * 0.05;
    ['#ff8787', '#ffc078', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc'].forEach((c, k) => {
      ctx.strokeStyle = c; ctx.globalAlpha = 0.55; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(rx, ry, 360 - k * 16, Math.PI, 0); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
}

HL.drawSky = (ctx, camX = 0, camY = 0, t = clock, th = HL.THEMES.meadow, vw = W, vh = H) => {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  if (th.stars) for (let i = 0; i < 50; i++) circle(ctx, (HL.hash(i, 3) * vw * 1.3 - camX * 0.02 + vw * 2) % vw, HL.hash(i, 9) * vh * 0.6, 1 + HL.hash(i, 5) * 1.5, `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 2 + i)})`);
  const sx = vw - 80;
  if (th.sun === 'moon') {
    circle(ctx, sx, 70, 34, '#fff9db'); circle(ctx, sx - 14, 60, 6, '#f1e6b8'); circle(ctx, sx + 12, 84, 4, '#f1e6b8');
  } else if (th.sun === 'earth') {
    circle(ctx, sx, 80, 40, '#4dabf7'); ctx.fillStyle = '#51cf66';
    ctx.beginPath(); ctx.ellipse(sx - 12, 70, 14, 10, 0.5, 0, 7); ctx.ellipse(sx + 16, 92, 12, 8, -0.4, 0, 7); ctx.fill();
    circle(ctx, sx, 80, 40, null, 'rgba(255,255,255,.6)', 3);
  } else if (th.sun === 'sun') {
    ctx.save(); ctx.translate(sx, 70); ctx.rotate(t * 0.25);
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); rrect(ctx, 42, -5, 18, 10, 5, '#ffe680'); }
    ctx.restore();
    circle(ctx, sx, 70, 38, '#ffd43b');
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(sx - 14, 66, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx + 14, 66, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, 76, 12, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    circle(ctx, sx - 22, 80, 5, 'rgba(255,120,150,.5)'); circle(ctx, sx + 22, 80, 5, 'rgba(255,120,150,.5)');
  }
  if (th.deco !== 'crystals') for (let i = 0; i < 6; i++) {
    const span = vw + 300;
    const x = ((((i * 260 + t * (8 + (i % 3) * 4) - camX * 0.08) % span) + span) % span) - 150, y = 40 + ((i * 53) % 140) - camY * 0.05;
    ctx.fillStyle = th.rain ? 'rgba(120,130,150,.85)' : th.stars ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.moveTo(x + 54, y - 10); ctx.arc(x + 26, y - 10, 28, 0, 7);
    ctx.moveTo(x + 76, y); ctx.arc(x + 54, y, 22, 0, 7); ctx.rect(x, y, 54, 22); ctx.fill();
  }
  if (th.deco === 'crystals') { // stalactites
    ctx.fillStyle = '#2a1f48';
    for (let i = 0; i < 14; i++) {
      const span = vw + 200, x = ((((i * 97 - camX * 0.15) % span) + span) % span) - 100, h = 30 + HL.hash(i, 21) * 70;
      ctx.beginPath(); ctx.moveTo(x - 18, 0); ctx.lineTo(x, h - camY * 0.05); ctx.lineTo(x + 18, 0); ctx.fill();
    }
  }
  const hy = vh - 60 - camY * 0.15 + 120;
  for (const [par, col, rad, gap] of [[0.2, th.hills[0], 300, 520], [0.35, th.hills[1], 220, 380]]) {
    ctx.fillStyle = col; ctx.beginPath();
    const off = ((camX * par) % gap + gap) % gap;
    for (let x = -off - gap; x < vw + gap; x += gap) ctx.ellipse(x + gap / 2, hy + (par > 0.3 ? 40 : 0), rad, rad * 0.5, 0, 0, 7);
    ctx.fill();
  }
  drawDeco(ctx, th, camX, camY, t, vw, vh);
  if (th.snow) for (let i = 0; i < 50; i++) {
    const x = ((HL.hash(i, 1) * vw + t * 20 * (0.5 + HL.hash(i, 2)) + Math.sin(t + i) * 10 - camX * 0.3) % vw + vw) % vw;
    const y = ((HL.hash(i, 4) * vh + t * 40 * (0.5 + HL.hash(i, 6)) - camY * 0.3) % vh + vh) % vh;
    circle(ctx, x, y, 1.5 + HL.hash(i, 7) * 2, 'rgba(255,255,255,.85)');
  }
  if (th.rain) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const x = ((HL.hash(i, 1) * vw - t * 120 - camX * 0.4) % vw + vw) % vw;
      const y = ((HL.hash(i, 4) * vh + t * 700) % vh + vh) % vh;
      ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14);
    }
    ctx.stroke();
  }
  if (th.glow) for (let i = 0; i < 24; i++) {
    const x = ((HL.hash(i, 31) * vw * 1.5 - camX * 0.25) % vw + vw) % vw, y = (HL.hash(i, 32) * vh + Math.sin(t + i) * 12);
    circle(ctx, x, y, 2 + HL.hash(i, 33) * 2, `rgba(190,170,255,${0.3 + 0.3 * Math.sin(t * 3 + i)})`);
  }
};

function drawGroundTile(ctx, x, y, c, r, th) {
  const top = r === 0 || map.g[r - 1][c] !== 1;
  ctx.fillStyle = th.dirt; ctx.fillRect(x, y, T + 0.5, T + 0.5);
  if (th.tile === 'bricks') {
    ctx.strokeStyle = th.dot; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x, y + 20); ctx.lineTo(x + T, y + 20); ctx.moveTo(x, y + T); ctx.lineTo(x + T, y + T);
    const o = r % 2 ? 0 : 20; ctx.moveTo(x + o + 10, y); ctx.lineTo(x + o + 10, y + 20); ctx.moveTo(x + 30 - o, y + 20); ctx.lineTo(x + 30 - o, y + T); ctx.stroke();
  } else if (th.tile === 'stripes') {
    ctx.fillStyle = th.dot; ctx.beginPath();
    for (let k = -1; k < 3; k++) { ctx.moveTo(x + k * 20, y + T); ctx.lineTo(x + k * 20 + 10, y + T); ctx.lineTo(x + k * 20 + 30 + 10, y); ctx.lineTo(x + k * 20 + 30, y); }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, T + 0.5, T + 0.5); ctx.clip();
    ctx.globalAlpha = 0.5; ctx.fillStyle = th.dot;
    for (let k = -1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 20, y + T); ctx.lineTo(x + k * 20 + 10, y + T); ctx.lineTo(x + k * 20 + 50, y); ctx.lineTo(x + k * 20 + 40, y); ctx.fill(); }
    ctx.restore();
  } else if (th.tile === 'gems') {
    const h = HL.hash(c, r);
    if (h < 0.35) { const gx = x + 8 + h * 60, gy = y + 14 + HL.hash(r, c) * 16; ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 5, gy); ctx.lineTo(gx, gy + 6); ctx.lineTo(gx - 5, gy); ctx.fillStyle = h < 0.12 ? '#f783ac' : h < 0.24 ? '#74c0fc' : '#b197fc'; ctx.fill(); }
    for (let i = 0; i < 2; i++) circle(ctx, x + 6 + HL.hash(c * 7 + i, r * 3) * 28, y + 12 + HL.hash(c * 5, r * 11 + i) * 24, 2.5, th.dot);
  } else if (th.tile === 'craters') {
    const h = HL.hash(c, r);
    circle(ctx, x + 12 + h * 16, y + 18 + HL.hash(r, c) * 12, 5 + h * 4, th.dot);
    circle(ctx, x + 30 - h * 10, y + 32, 3, th.dot);
  } else {
    for (let i = 0; i < 3; i++) circle(ctx, x + 6 + HL.hash(c * 7 + i, r * 3) * 28, y + 12 + HL.hash(c * 5, r * 11 + i) * 24, 2.5, th.dot);
  }
  if (top) {
    ctx.fillStyle = th.grass; ctx.fillRect(x, y, T + 0.5, 10);
    for (let i = 0; i < 4; i++) circle(ctx, x + 5 + i * 10, y + 10, 5, th.grass);
    ctx.fillStyle = th.grassHi; ctx.fillRect(x, y, T + 0.5, 4);
    const h = HL.hash(c, r);
    if (th.flowers && h < 0.25 && (r === 0 || map.g[r - 1][c] === 0)) {
      const fx2 = x + 8 + h * 90, col = h < 0.08 ? '#ff8fb8' : h < 0.16 ? '#fff' : '#ffd43b';
      ctx.strokeStyle = '#3f9a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx2, y); ctx.lineTo(fx2, y - 7); ctx.stroke();
      for (let k = 0; k < 5; k++) circle(ctx, fx2 + Math.cos(k * 1.26) * 3.5, y - 9 + Math.sin(k * 1.26) * 3.5, 2.6, col);
      circle(ctx, fx2, y - 9, 2, '#f59f00');
    }
  }
}

function drawTiles(ctx) {
  const c0 = Math.max(0, Math.floor(cam.x / T) - 1), c1 = Math.min(map.cols - 1, Math.ceil((cam.x + VW) / T) + 1);
  const r0 = Math.max(0, Math.floor(cam.y / T) - 1), r1 = Math.min(map.rows - 1, Math.ceil((cam.y + VH) / T) + 1);
  const th = map.theme;
  const per = map.blink.period, warnB = (blinkT % per) > per - 0.35;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const v = map.g[r][c];
    if (!v) continue;
    const x = c * T, y = r * T;
    if (v === 1) drawGroundTile(ctx, x, y, c, r, th);
    else if (v === 6) {
      ctx.fillStyle = '#adb5bd'; ctx.fillRect(x, y, T + 0.5, T + 0.5);
      ctx.strokeStyle = '#868e96'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
      for (const [a, b] of [[6, 6], [34, 6], [6, 34], [34, 34]]) circle(ctx, x + a, y + b, 1.8, '#6c757d');
    } else if (v === 2) {
      const s = clouds.get(r * map.cols + c);
      if (s && s.phase === 'gone') { ctx.globalAlpha = 0.15 + 0.15 * (1 - s.t / 2.6); }
      const sx = s && s.phase === 'shake' ? rnd(-2, 2) : 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + 12 + sx, y + 10, 11, 0, 7); ctx.arc(x + 28 + sx, y + 8, 13, 0, 7); ctx.fill();
      rrect(ctx, x + sx, y + 6, T, 14, 7, '#fff', '#d0ebff', 2);
      ctx.globalAlpha = 1;
    } else if (v === 3 || v === 4) {
      rrect(ctx, x, y, T, 16, 4, '#495057', '#212529', 2);
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2.5;
      const off = (((clock * BELT * (v === 4 ? 1 : -1)) % 20) + 20) % 20;
      for (let k = -1; k < 3; k++) {
        const px = x + k * 20 + off;
        if (px < x + 2 || px > x + T - 8) continue;
        ctx.beginPath();
        if (v === 4) { ctx.moveTo(px, y + 4); ctx.lineTo(px + 5, y + 8); ctx.lineTo(px, y + 12); }
        else { ctx.moveTo(px + 5, y + 4); ctx.lineTo(px, y + 8); ctx.lineTo(px + 5, y + 12); }
        ctx.stroke();
      }
    } else if (v === 7) {
      rrect(ctx, x, y, T + 0.5, T, 4, '#d0ebff', '#74c0fc', 2);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 8); ctx.lineTo(x + 16, y + 8); ctx.moveTo(x + 8, y + 14); ctx.lineTo(x + 12, y + 14); ctx.stroke();
    } else if (v === 8) {
      const sq = squish.find((q) => q.c === c && q.r === r);
      const k = sq ? Math.sin((sq.t / 0.3) * Math.PI) * 6 : Math.sin(clock * 4 + c) * 1.5;
      rrect(ctx, x + 1 - k / 2, y + 2 + k, T - 2 + k, T - 4 - k, 12, 'rgba(255,107,170,.85)', '#d6336c', 2);
      circle(ctx, x + 12, y + 12 + k, 4, 'rgba(255,255,255,.6)');
    } else if (v === 5) {
      rrect(ctx, x, y, T + 0.5, 12, 3, '#d9a066', '#9c6b3a', 2);
    } else if (v === 9 || v === 10) {
      const on = v === 9 ? blinkA : !blinkA, col = v === 9 ? ['#ff8fb8', '#d6336c'] : ['#74c0fc', '#1c7ed6'];
      if (on) {
        const flick = warnB && Math.sin(clock * 40) > 0;
        rrect(ctx, x + 1, y + 1, T - 2, T - 2, 7, flick ? '#fff' : col[0], col[1], 2.5);
        circle(ctx, x + 20, y + 20, 6, 'rgba(255,255,255,.55)');
      } else {
        ctx.setLineDash([5, 5]); rrect(ctx, x + 3, y + 3, T - 6, T - 6, 7, null, col[1], 2); ctx.setLineDash([]);
      }
    }
  }
}

function drawSigns(ctx) {
  ctx.font = FONT(12, 600);
  for (const s of map.signs) {
    if (s.x < cam.x - 300 || s.x > cam.x + VW + 300) continue;
    const w = ctx.measureText(s.text).width + 16;
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(s.x - 2, s.y - 30, 4, 30);
    rrect(ctx, s.x - w / 2, s.y - 52, w, 24, 6, '#fff8e1', '#a1887f', 2);
    ctx.fillStyle = '#5d4037'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.text, s.x, s.y - 39.5); ctx.textBaseline = 'alphabetic';
  }
  for (const c of map.checkpoints) {
    if (c.i === 0) continue;
    const x = c.fx + 20, y = c.fy + T, reached = viewer.cp >= c.i;
    ctx.fillStyle = '#868e96'; ctx.fillRect(x - 2, y - 62, 4, 62);
    ctx.beginPath(); ctx.moveTo(x + 2, y - 62); ctx.lineTo(x + 26, y - 54 + Math.sin(clock * 5) * 2); ctx.lineTo(x + 2, y - 46);
    ctx.fillStyle = reached ? '#51cf66' : '#ff6b6b'; ctx.fill();
  }
}

// nap lamp symbols (drawn, no emoji)
function drawLampFace(ctx, x, y, mode) {
  if (mode === 'sleep') {
    ctx.fillStyle = '#5f3dc4'; ctx.font = FONT(13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('z', x - 6, y + 4); ctx.font = FONT(10); ctx.fillText('z', x + 2, y - 1); ctx.font = FONT(8); ctx.fillText('z', x + 8, y - 6);
    ctx.textBaseline = 'alphabetic';
  } else {
    rrect(ctx, x - 12, y - 6, 24, 13, 6, mode === 'sleepy' ? '#ffd8a8' : '#ffc2da', '#e87fa9', 1.6);
    circle(ctx, x - 4, y, 1.3, '#c2557f'); circle(ctx, x + 4, y, 1.3, '#c2557f');
  }
}

function drawSpikes(ctx) {
  for (const l of map.levers) {
    const pil = map.spikes.filter((s) => s.power === l.power);
    const s = pil[pil.length - 1];
    if (s) {
      ctx.setLineDash([7, 6]); ctx.lineWidth = 3;
      ctx.strokeStyle = signals[l.power] ? '#fab005' : 'rgba(90,90,90,.45)';
      ctx.beginPath(); ctx.moveTo(l.x + 20, l.y + 38); ctx.lineTo(l.x + 20, s.r * T - 120);
      ctx.lineTo(s.c * T + 20, s.r * T - 120); ctx.lineTo(s.c * T + 20, s.r * T + 20); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  for (const tm of map.timers) {
    const on = signals[tm.key];
    ctx.fillStyle = '#868e96'; ctx.fillRect(tm.x - 2, tm.y - 56, 4, 56);
    rrect(ctx, tm.x - 18, tm.y - 86, 36, 32, 8, '#fff', '#5f3dc4', 2);
    const sleepy = on && tm.t < 0.6;
    drawLampFace(ctx, tm.x, tm.y - 70, !on ? 'sleep' : sleepy && Math.sin(clock * 25) > 0 ? 'sleepy' : 'awake');
    circle(ctx, tm.x, tm.y - 46, 5, on ? '#51cf66' : (Math.sin(clock * 30) > 0 ? '#fa5252' : '#ffa8a8'));
  }
  for (const s of map.scans) { // the moving gap: a red lamp on the ceiling
    const x = s.pos * T + 20, row = map.spikes.find((q) => q.scan === s || q.power === s.key);
    if (!row) continue;
    const y = row.r * T;
    circle(ctx, x, y - 4, 7, Math.sin(clock * 20) > 0 ? '#fa5252' : '#ffa8a8', '#5c5f66', 2);
  }
  for (const s of map.spikes) {
    const x = s.c * T, y = s.r * T;
    if (x < cam.x - T || x > cam.x + VW) continue;
    ctx.fillStyle = '#e3e9ec'; ctx.strokeStyle = '#7d8b93'; ctx.lineWidth = 2;
    const down = s.dir === 'down';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      if (down) { ctx.moveTo(x + 1 + i * 13, y); ctx.lineTo(x + 7.5 + i * 13, y + 24); ctx.lineTo(x + 14 + i * 13, y); }
      else { ctx.moveTo(x + 1 + i * 13, y + T); ctx.lineTo(x + 7.5 + i * 13, y + 16); ctx.lineTo(x + 14 + i * 13, y + T); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (s.pillow > 0.01) {
      const h = 30 * s.pillow;
      rrect(ctx, x - 1, down ? y : y + T - h, T + 2, h, 10, '#ffc2da', '#e87fa9', 2);
      if (s.pillow > 0.8) {
        const fy = down ? y + 16 : y + T - 18;
        circle(ctx, x + 14, fy, 1.8, '#c2557f'); circle(ctx, x + 26, fy, 1.8, '#c2557f');
        ctx.strokeStyle = '#c2557f'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x + 20, fy + 2, 4, 0.2, Math.PI - 0.2); ctx.stroke();
      }
    }
  }
}

function drawProps(ctx) {
  const inView = (x, pad = 200) => x > cam.x - pad && x < cam.x + VW + pad;
  for (const f of map.fans) {
    const bx = f.x, by = f.y + f.h;
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const lx = bx + 8 + ((i * 11) % (f.w - 16)), ly = by - (((clock * 380 + i * 97) % f.h));
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 22); ctx.stroke();
    }
    rrect(ctx, bx, by - 14, f.w, 14, 4, '#748ffc', '#4263eb', 2);
    ctx.save(); ctx.translate(bx + f.w / 2, by - 14); ctx.scale(1, 0.3); ctx.rotate(clock * 20);
    for (let k = 0; k < 3; k++) { ctx.rotate((Math.PI * 2) / 3); ctx.fillStyle = '#dbe4ff'; ctx.beginPath(); ctx.ellipse(16, 0, 16, 6, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  for (const t of map.tramps) {
    const sq = t.squash * 5;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(t.x + 6, t.y + 4); ctx.lineTo(t.x + 3, t.y + 16); ctx.moveTo(t.x + 34, t.y + 4); ctx.lineTo(t.x + 37, t.y + 16); ctx.stroke();
    rrect(ctx, t.x + 1, t.y - 2 + sq, 38, 7, 3, '#ff5d73', '#c92a42', 2);
  }
  for (const m of map.movers) {
    rrect(ctx, m.x, m.y, m.w, m.h, 5, '#ffe066', '#e67700', 2);
    ctx.fillStyle = '#e67700';
    for (let k = 8; k < m.w - 4; k += 16) ctx.fillRect(m.x + k, m.y + 5, 6, 4);
  }
  for (const l of map.levers) {
    rrect(ctx, l.x + 9, l.y + 30, 22, 10, 3, '#8d6e63', '#5d4037', 2);
    const ang = l.on ? -0.6 : 0.6;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(l.x + 20, l.y + 32); ctx.lineTo(l.x + 20 + Math.sin(ang) * 22, l.y + 32 - Math.cos(ang) * 22); ctx.stroke();
    circle(ctx, l.x + 20 + Math.sin(ang) * 22, l.y + 32 - Math.cos(ang) * 22, 5, '#ff6b6b', '#c92a2a', 2);
    circle(ctx, l.x + 27, l.y + 35, 2.5, l.on ? '#51cf66' : '#fa5252');
  }
  for (const s of map.saws) {
    if (!inView(s.x)) continue;
    const g = s.y + s.r;
    ctx.fillStyle = '#495057'; ctx.fillRect(s.minX - 30, g - 4, s.maxX - s.minX + 60, 4);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.beginPath();
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, r = i % 2 ? s.r - 6 : s.r; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = '#dee2e6'; ctx.fill(); ctx.strokeStyle = '#868e96'; ctx.lineWidth = 2; ctx.stroke();
    circle(ctx, 0, 0, 7, '#868e96', '#495057');
    ctx.restore();
    if (s.cage > 0.01) {
      const x0 = s.minX - 36, x1 = s.maxX + 36, top = g - 70 * s.cage;
      ctx.strokeStyle = '#5c7cfa'; ctx.lineWidth = 4;
      for (let x = x0; x <= x1; x += 15) { ctx.beginPath(); ctx.moveTo(x, g); ctx.lineTo(x, top); ctx.stroke(); }
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0 - 2, top); ctx.lineTo(x1 + 2, top); ctx.stroke();
    }
  }
  for (const c of map.crushers) {
    if (!inView(c.x)) continue;
    const jx = c.state === 'warn' ? rnd(-2.5, 2.5) : 0;
    ctx.fillStyle = '#868e96'; ctx.fillRect(c.x + c.w / 2 - 8 + jx, c.top - 4, 16, c.y - c.top + 4);
    rrect(ctx, c.x + jx, c.y, c.w, c.h, 6, '#5c5f66', '#2b2d31', 3);
    ctx.fillStyle = '#ffd43b';
    for (let k = 0; k < c.w; k += 16) ctx.fillRect(c.x + jx + k + 2, c.y + c.h - 9, 8, 6);
    const lamp = c.beep > 0 ? '#51cf66' : c.state === 'warn' || c.state === 'down' ? '#fa5252' : '#ffe066';
    circle(ctx, c.x + c.w / 2 + jx, c.y + 14, 6, lamp, '#2b2d31', 2);
    ctx.fillStyle = c.beep > 0 ? 'rgba(81,207,102,.35)' : 'rgba(250,82,82,.18)';
    ctx.fillRect(c.x, c.bottom - 8, c.w, 6);
  }
  // wind flags
  for (const w of map.winds) {
    for (const fx0 of [w.x + 20, w.x + w.w - 20]) {
      if (!inView(fx0)) continue;
      const gy = map.spawns[0] ? groundBelow(fx0) : 0;
      ctx.fillStyle = '#868e96'; ctx.fillRect(fx0 - 2, gy - 80, 4, 80);
      const flap = w.on ? Math.sin(clock * 30) * 6 : w.t < 0.5 ? Math.sin(clock * 18) * 4 : 0, len = w.on ? 34 : 22;
      ctx.beginPath(); ctx.moveTo(fx0, gy - 80); ctx.lineTo(fx0 + w.dir * len, gy - 72 + flap); ctx.lineTo(fx0, gy - 62);
      ctx.fillStyle = w.on ? '#fa5252' : w.t < 0.5 ? '#ffa94d' : '#ffe066'; ctx.fill();
    }
    if (w.on && inView(w.x, w.w)) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        const span = w.w, lx = w.x + ((((HL.hash(i, 5) * span) + w.dir * clock * 500) % span) + span) % span;
        const ly = cam.y + HL.hash(i, 6) * VH;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - w.dir * 30, ly); ctx.stroke();
      }
    }
  }
  // low gravity zones: floating sparkles
  for (const z of map.gravs) {
    if (z.x > cam.x + VW || z.x + z.w < cam.x) continue;
    for (let i = 0; i < 26; i++) {
      const sx = z.x + HL.hash(i, 41) * z.w, sy = cam.y + ((HL.hash(i, 42) * VH - clock * 18 * (0.5 + HL.hash(i, 43))) % VH + VH) % VH;
      star(ctx, sx, sy, 3, clock + i, 'rgba(208,191,255,.7)');
    }
  }
  // gloves
  for (const g of map.gloves) {
    if (!inView(g.px) || g.gx == null) continue;
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(g.px, g.py); ctx.lineTo(g.gx, g.gy); ctx.stroke();
    rrect(ctx, g.px - 14, g.py - 10, 28, 12, 4, '#868e96', '#495057', 2);
    ctx.save(); ctx.translate(g.gx, g.gy); ctx.rotate(-g.a);
    circle(ctx, 0, 4, g.r, '#fa5252', '#c92a2a', 3);
    ctx.beginPath(); ctx.ellipse(g.va > 0 ? -14 : 14, -2, 7, 10, 0, 0, 7); ctx.fillStyle = '#ff6b6b'; ctx.fill(); ctx.strokeStyle = '#c92a2a'; ctx.lineWidth = 2; ctx.stroke();
    rrect(ctx, -12, -24, 24, 10, 3, '#fff', '#adb5bd', 2);
    ctx.restore();
  }
  // anvils
  for (const a of map.anvils) {
    if (!inView(a.x)) continue;
    if (a.state === 'warn' || a.state === 'fall') {
      const k = a.state === 'warn' ? 1 - a.t / 0.75 : 1;
      ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.2 * k})`; ctx.beginPath(); ctx.ellipse(a.x, a.ground - 2, 14 + 18 * k, 5, 0, 0, 7); ctx.fill();
      if (a.state === 'warn' && Math.sin(clock * 20) > 0) { ctx.fillStyle = '#fa5252'; ctx.font = FONT(18); ctx.textAlign = 'center'; ctx.fillText('!', a.x, a.ground - 14); }
    }
    if (a.state === 'fall' || a.state === 'land' || a.state === 'bounce') drawAnvil(ctx, a.x + (a.x2 || 0), a.y, a.w, a.h);
  }
  // cannons + bullseye
  for (const t of map.targets) {
    if (!inView(t.x)) continue;
    for (let k = 0; k < 3; k++) circle(ctx, t.x + 6, t.y + t.h / 2, 46 - k * 15, k % 2 ? '#fff' : '#fa5252');
    for (let yy = t.y; yy < t.y + t.h - 6; yy += 13) {
      ctx.beginPath(); ctx.moveTo(t.x, yy); ctx.lineTo(t.x - 12, yy + 6.5); ctx.lineTo(t.x, yy + 13); ctx.closePath();
      ctx.fillStyle = '#e3e9ec'; ctx.fill(); ctx.strokeStyle = '#7d8b93'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const fl = t.flash > 0 ? 4 : 0;
    rrect(ctx, t.x - 20 - fl, t.y + t.sy, 18 + fl, t.sh, 9, '#ffc2da', '#e87fa9', 2.5);
    ctx.fillStyle = '#e87fa9'; ctx.fillRect(t.x - 14, t.y + t.sy + t.sh / 2 - 2, 8, 4);
  }
  for (const c of map.cannons) {
    if (!inView(c.x)) continue;
    const loaded = locals.find((p) => p.inCannon === c);
    // aim dots
    if (loaded) for (let k = 1; k <= 4; k++) circle(ctx, c.x + Math.cos(c.a) * (40 + k * 22), c.y + Math.sin(c.a) * (40 + k * 22), 3, 'rgba(255,255,255,.85)');
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    rrect(ctx, -10, -15, 60, 30, 8, '#5c5f66', '#2b2d31', 3);
    rrect(ctx, 44, -18, 10, 36, 4, '#495057', '#2b2d31', 2);
    ctx.fillStyle = '#ffd43b'; ctx.fillRect(10, -15, 8, 30);
    ctx.restore();
    if (loaded) { ctx.save(); ctx.translate(c.x + Math.cos(c.a) * 52, c.y + Math.sin(c.a) * 52); HL.drawHead(ctx, 0, 0, 1, loaded.skin, false); ctx.restore(); }
    circle(ctx, c.x - 10, c.y + 12, 13, '#8d6e63', '#5d4037', 3); circle(ctx, c.x - 10, c.y + 12, 4, '#5d4037');
    circle(ctx, c.x + 12, c.y + 12, 13, '#8d6e63', '#5d4037', 3); circle(ctx, c.x + 12, c.y + 12, 4, '#5d4037');
  }
}
function groundBelow(x) {
  const c = Math.floor(x / T);
  for (let r = 0; r < map.rows; r++) if (map.g[r][c] === 1) return r * T;
  return map.h;
}
function drawAnvil(ctx, x, y, w, h) {
  ctx.fillStyle = '#495057'; ctx.strokeStyle = '#212529'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2 - 6, y + 12); ctx.lineTo(x + 10, y + 16);
  ctx.lineTo(x + 14, y + h); ctx.lineTo(x - 14, y + h); ctx.lineTo(x - 10, y + 16); ctx.lineTo(x - w / 2 + 2, y + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = FONT(10); ctx.textAlign = 'center'; ctx.fillText('1T', x, y + 10);
}

function drawBlocks(ctx) {
  for (const k of map.dblocks) {
    if (k.x < cam.x - 200 || k.x > cam.x + VW + 200) continue;
    ctx.strokeStyle = '#868e96'; ctx.lineWidth = 3; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(k.x + k.w / 2, k.y0 - k.amp - 40); ctx.lineTo(k.x + k.w / 2, k.y0 + k.amp + k.h); ctx.stroke(); ctx.setLineDash([]);
    rrect(ctx, k.x, k.y, k.w, k.h, 6, '#6c757d', '#343a40', 2);
    for (let yy = k.y + 30; yy < k.y + k.h - 36; yy += 13) {
      ctx.beginPath(); ctx.moveTo(k.x, yy); ctx.lineTo(k.x - 12, yy + 7); ctx.lineTo(k.x, yy + 14); ctx.closePath();
      ctx.fillStyle = '#e3e9ec'; ctx.fill(); ctx.strokeStyle = '#7d8b93'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const sq = k.flash > 0 ? 6 * (k.flash / 0.3) : 0;
    rrect(ctx, k.x - 16 + sq, k.y + 4, 12 - sq * 0.5, k.h - 8, 6, 'rgba(255,143,184,.55)', '#e64980', 2);
    ctx.fillStyle = '#fff'; ctx.font = FONT(10); ctx.textAlign = 'center';
    ctx.save(); ctx.translate(k.x - 10 + sq, k.y + k.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('BUMPER', 0, 4); ctx.restore();
  }
}

function drawFx(ctx) {
  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    if (q.shape === 'star') star(ctx, q.x, q.y, q.size, q.rot, q.color);
    else if (q.shape === 'square') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size); ctx.restore(); }
    else if (q.shape === 'line') { ctx.strokeStyle = q.color; ctx.lineWidth = q.size; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + Math.sign(q.vx) * q.len, q.y); ctx.stroke(); }
    else circle(ctx, q.x, q.y, q.size, q.color);
  }
  ctx.globalAlpha = 1;
  for (const a of airbagFx) {
    const s = a.t < 0.12 ? a.t / 0.12 : a.t < 0.5 ? 1 : 1 - (a.t - 0.5) / 0.4;
    ctx.globalAlpha = clamp(s, 0, 1);
    ctx.beginPath(); ctx.ellipse(a.x, a.y - 14 * s, 44 * s + 4, 22 * s + 2, 0, 0, 7);
    ctx.fillStyle = '#e7f5ff'; ctx.fill(); ctx.strokeStyle = '#74c0fc'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const f of fx) {
    const t = f.t;
    ctx.globalAlpha = t > 0.8 ? Math.max(0, 1 - (t - 0.8) * 3) : 1;
    if (f.kind === 'angel') {
      const x = f.x, y = f.y - 40 + Math.min(t, 0.4) * 50 - Math.max(0, t - 0.6) * 300;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(x - 14, y + 8, 12, 7, -0.5 + Math.sin(clock * 20) * 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 14, y + 8, 12, 7, 0.5 - Math.sin(clock * 20) * 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 9, y + 26); ctx.lineTo(x, y + 6); ctx.lineTo(x + 9, y + 26); ctx.closePath(); ctx.fill();
      circle(ctx, x, y, 7, '#ffe8cc', '#e8b88a', 1.5);
      ctx.strokeStyle = '#fcc419'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y - 11, 8, 3, 0, 0, 7); ctx.stroke();
    } else if (f.kind === 'umbrella') {
      const p = locals.find((q) => q.id === f.pid);
      const x = p ? p.x + 12 : f.x, y = (p ? p.y : f.y) - 8, s = Math.min(1, t * 8);
      ctx.strokeStyle = '#5c5f66'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22 * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 22 * s, 30 * s, Math.PI, 0);
      ctx.fillStyle = '#4dabf7'; ctx.fill(); ctx.strokeStyle = '#1c7ed6'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - 22 * s); ctx.arc(x, y - 22 * s, 30 * s, Math.PI * 1.35, Math.PI * 1.65); ctx.fill();
    } else {
      const x = f.x + Math.sin(t * 8) * 6, y = f.y - 20 - Math.max(0, t - 0.3) * 260;
      ctx.save(); ctx.translate(x, y);
      circle(ctx, 0, 0, 14, '#4dabf7', '#1c7ed6', 2); circle(ctx, 3, 4, 8, '#d0ebff');
      ctx.save(); ctx.rotate(Math.sin(clock * 30) * 0.9); ctx.beginPath(); ctx.ellipse(-8, -4, 11, 6, -0.4, 0, 7); ctx.fillStyle = '#339af0'; ctx.fill(); ctx.restore();
      circle(ctx, 6, -4, 3, '#fff'); circle(ctx, 7, -4, 1.6, '#222');
      ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(20, 1); ctx.lineTo(12, 4); ctx.fillStyle = '#fd7e14'; ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function drawParts(ctx) {
  for (const q of parts) {
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
    const col = HL.skinColor(q.skin);
    if (q.kind === 'head') HL.drawHead(ctx, 0, 0, 1, q.skin, true);
    else if (q.kind === 'torso') { rrect(ctx, -8, -7.5, 16, 15, 4, col.body, '#3d3a2a', 2); HL.marker(ctx, 0, 0, 3.6); }
    else rrect(ctx, -q.w / 2, -q.h / 2, q.w, q.h, 2.5, col.limb, '#3d3a2a', 1.6);
    ctx.restore();
  }
}

function nameTag(ctx, x, y, name, mine) {
  ctx.font = FONT(11, 700);
  const w = ctx.measureText(name).width + 12;
  rrect(ctx, x - w / 2, y - 16, w, 15, 7.5, mine ? 'rgba(255,111,165,.9)' : 'rgba(58,46,92,.75)');
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, x, y - 8); ctx.textBaseline = 'alphabetic';
}

function bubble(ctx, x, y, i) {
  if (i == null || i < 0 || i >= G.EMOTE_COUNT) return;
  rrect(ctx, x - 17, y - 52, 34, 30, 10, '#fff', '#d0bfff', 2);
  ctx.beginPath(); ctx.moveTo(x - 5, y - 23); ctx.lineTo(x, y - 16); ctx.lineTo(x + 5, y - 23); ctx.fillStyle = '#fff'; ctx.fill();
  HL.drawEmote(ctx, i, x, y - 37, 11);
}

function pill(ctx, x, y, text, size = 15, align = 'left', bg = 'rgba(255,255,255,.88)', fg = '#3a2e5c', iconW = 0) {
  ctx.font = FONT(size, 700);
  const w = ctx.measureText(text).width + size * 1.4 + iconW, h = size * 1.9;
  const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  rrect(ctx, bx, y, w, h, h / 2, bg);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + iconW + (w - iconW) / 2, y + h / 2 + 1); ctx.textBaseline = 'alphabetic';
  return w;
}

function drawClockIcon(ctx, x, y, r) {
  circle(ctx, x, y, r, '#fff', '#3a2e5c', 2);
  ctx.strokeStyle = '#3a2e5c'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.6); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.5, y); ctx.stroke();
}
function drawAngelIcon(ctx, x, y) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x - 8, y + 2, 7, 4, -0.5, 0, 7); ctx.ellipse(x + 8, y + 2, 7, 4, 0.5, 0, 7); ctx.fill(); ctx.stroke();
  circle(ctx, x, y + 1, 5, '#ffe8cc', '#e8b88a', 1.2);
  ctx.strokeStyle = '#fcc419'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 7, 5.5, 2, 0, 0, 7); ctx.stroke();
}

function drawBonk(ctx, p, w, h, zoom) {
  if (!bonk) return;
  const sx = (bonk.x - p.cam.x) * zoom, sy = (bonk.y - p.cam.y) * zoom;
  const s = Math.min(1, bonk.t * 6) * (1 + Math.max(0, 0.3 - bonk.t));
  ctx.save(); ctx.translate(clamp(sx, 120, w - 120), clamp(sy, 90, h - 60)); ctx.scale(s, s); ctx.rotate(-0.12);
  ctx.font = FONT(64); ctx.textAlign = 'center'; ctx.lineWidth = 10; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
  ctx.strokeText('BONK!', 0, 0); ctx.fillStyle = '#ff6fa5'; ctx.fillText('BONK!', 0, 0);
  ctx.restore();
}

// HUD for one view. w/h = HUD space size, zoom = world -> HUD scale (for the BONK position)
function drawHUD(ctx, p, w, h, zoom, label) {
  if (G.noHud) { drawBonk(ctx, p, w, h, zoom); return; }
  let x = 10;
  if (label) x += pill(ctx, x, 10, label, 15, 'left', p.li ? 'rgba(77,171,247,.95)' : 'rgba(255,111,165,.95)', '#fff') + 8;
  const tw = pill(ctx, x, 10, `${time.toFixed(1)}s`, 15, 'left', undefined, undefined, 18);
  drawClockIcon(ctx, x + 16, 10 + 14.5, 7);
  x += tw + 8;
  if (p.curZone >= 0) x += pill(ctx, x, 10, map.zones[p.curZone].name) + 8;
  const a = map.angel;
  if (a && p.x >= a.x0 - VW) {
    const hw = 30 + a.max * 17;
    rrect(ctx, x, 10, hw, 28.5, 14, 'rgba(255,255,255,.88)');
    drawAngelIcon(ctx, x + 16, 24);
    for (let i = 0; i < a.max; i++) HL.drawHeart(ctx, x + 36 + i * 17, 25, 7, i < a.hearts ? '#ff6b9a' : '#fff', i < a.hearts ? '#d6336c' : '#ced4da');
  }
  // race progress bar
  const bw = Math.min(300, w * 0.32), bx = w / 2 - bw / 2, by = 52;
  rrect(ctx, bx - 8, by - 8, bw + 16, 16, 8, 'rgba(255,255,255,.75)');
  for (const z of map.zones) { const zx = bx + bw * clamp(z.x / map.finishX, 0, 1); ctx.fillStyle = 'rgba(58,46,92,.25)'; ctx.fillRect(zx - 1, by - 5, 2, 10); }
  star(ctx, bx + bw + 14, by, 10, clock, '#ff6fa5'); star(ctx, bx + bw + 14, by, 5, -clock, '#ffd43b');
  const dot = (px, skin, mine) => {
    const dx = bx + bw * clamp(px / map.finishX, 0, 1);
    circle(ctx, dx, by, mine ? 7 : 5.5, HL.skinColor(skin).body, mine ? '#ff6fa5' : '#3a2e5c', mine ? 3 : 2);
  };
  for (const g of ghosts.values()) dot(g.x, g.skin, false);
  for (const q of locals) if (q !== p) dot(q.x, q.skin, false);
  dot(p.x, p.skin, true);

  if (state === 'countdown') {
    const n = Math.ceil(countdown);
    if (n <= 3) {
      const s = 1 + (n - countdown) * 0.6;
      ctx.save(); ctx.translate(w / 2, h / 2 - 30); ctx.scale(s, s);
      ctx.font = FONT(96); ctx.textAlign = 'center'; ctx.lineWidth = 12; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
      ctx.strokeText(n, 0, 30); ctx.fillStyle = '#ff6fa5'; ctx.fillText(n, 0, 30);
      ctx.restore();
    } else {
      pill(ctx, w / 2, h / 2 - 60, 'Get ready...', 26, 'center', 'rgba(255,255,255,.92)', '#c2255c');
    }
  }
  if (p.banner) {
    const t = p.banner.t, al = t < 0.25 ? t / 0.25 : t > 2.0 ? Math.max(0, 1 - (t - 2.0) / 0.6) : 1;
    ctx.globalAlpha = al;
    const by2 = Math.min(120, h * 0.3);
    rrect(ctx, w / 2 - 300, by2, 600, 86, 22, 'rgba(255,255,255,.93)');
    ctx.textAlign = 'center'; ctx.fillStyle = '#ff6fa5'; ctx.font = FONT(32);
    ctx.fillText(p.banner.title, w / 2, by2 + 42);
    ctx.fillStyle = '#3a2e5c'; ctx.font = FONT(17, 600); ctx.fillText(p.banner.sub, w / 2, by2 + 70);
    ctx.globalAlpha = 1;
  }
  if (p.toast && !p.banner) {
    const t = p.toast.t, al = t < 0.15 ? t / 0.15 : t > p.toast.dur - 0.3 ? Math.max(0, (p.toast.dur - t) / 0.3) : 1;
    ctx.globalAlpha = al;
    pill(ctx, w / 2, 76, p.toast.text, 18, 'center', 'rgba(255,255,255,.95)', '#c2255c');
    ctx.globalAlpha = 1;
  }
  drawBonk(ctx, p, w, h, zoom);
}

function renderWorld(ctx, p) {
  viewer = p; cam = p.cam; VW = p.vw; VH = p.vh;
  HL.drawSky(ctx, cam.x, cam.y, clock, map.theme, VW, VH);
  ctx.save();
  let ox = -Math.round(cam.x), oy = -Math.round(cam.y);
  if (shake > 0) { ox += rnd(-shake, shake) * 0.5; oy += rnd(-shake, shake) * 0.5; }
  ctx.translate(ox, oy);
  drawTiles(ctx);
  drawSigns(ctx);
  drawSpikes(ctx);
  drawProps(ctx);
  drawBlocks(ctx);
  const tags = opts.players.length > 1;
  for (const g of ghosts.values()) {
    if (g.hidden) continue;
    ctx.globalAlpha = 0.85;
    HL.drawDummy(ctx, g.x, g.y, g.skin, { face: g.face, air: g.air, moving: g.moving, walk: g.walk, sprint: g.sprint });
    ctx.globalAlpha = 1;
    nameTag(ctx, g.x + 12, g.y - 12, g.name, false);
    bubble(ctx, g.x + 12, g.y - 14, g.e);
  }
  for (const q of [...locals].sort((a) => (a === p ? 1 : -1))) {
    const blink = q.teleportTo && q.frozen > 0 && q.frozen < 0.25;
    if (q.hidden || blink || q.inCannon) continue;
    HL.drawDummy(ctx, q.x, q.y, q.skin, { face: q.face, air: !q.onGround, moving: q.onGround && Math.abs(q.vx) > 10, walk: q.walk, carried: q.frozen > 0, sprint: q.sprint, dash: q.dashT > 0 });
    if (tags) nameTag(ctx, q.x + 12, q.y - 12, q.name, q === p);
    if (q.emote) bubble(ctx, q.x + 12, q.y - 14, q.emote.i);
  }
  drawParts(ctx);
  drawFx(ctx);
  ctx.restore();
}

G.render = (ctx) => {
  if (!G.active) return;
  if (locals.length === 1) {
    renderWorld(ctx, locals[0]);
    drawHUD(ctx, locals[0], W, H, 1);
  } else {
    const hh = H / 2;
    locals.forEach((p, i) => {
      ctx.save(); ctx.beginPath(); ctx.rect(0, i * hh, W, hh); ctx.clip(); ctx.translate(0, i * hh);
      ctx.save(); ctx.scale(SPLIT_ZOOM, SPLIT_ZOOM); renderWorld(ctx, p); ctx.restore();
      ctx.scale(HUD_ZOOM, HUD_ZOOM); drawHUD(ctx, p, W / HUD_ZOOM, hh / HUD_ZOOM, SPLIT_ZOOM / HUD_ZOOM, p.li ? 'P2' : 'P1');
      ctx.restore();
    });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, hh - 2, W, 4);
  }
  viewer = locals[0]; cam = locals[0].cam; VW = locals[0].vw; VH = locals[0].vh;
};

// debug/testing helpers
G._debug = () => ({ map, me: locals[0], locals, ghosts, signals, get cam() { return locals[0].cam; }, get state() { return state; }, set state(v) { state = v; }, get countdown() { return countdown; }, set countdown(v) { countdown = v; }, get blinkA() { return blinkA; } });
})();
