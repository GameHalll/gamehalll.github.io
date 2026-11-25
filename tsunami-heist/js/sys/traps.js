// traps system — base-defense traps (see ../hooks.js for the bus API)
// Banana Peel / Alarm Bell / Sticky Goo / Spring Trap / Decoy Pedestal.
// Bought in the shop, auto-placed in the player's base; bot bases get traps scaled with the bot's progress.
// Only intruders (actors standing in a base that isn't theirs) trigger traps. Bots notice traps with
// human-like imperfect awareness (late, sometimes not at all) and route around the ones they spotted.
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function init(game, bus) {
  const { THREE, C, G } = game;
  const V3 = THREE.Vector3;
  const st = bus.state('traps', { owned: {} });
  st.owned ||= {};

  // ------------------------------------------------------------------ trap catalogue
  const T = {
    banana: { name: 'Banana Peel', emo: '🍌', color: 0xffe14a, bg: '#e0b400', r: 0.95, cap: 2, T: 90, min: 300, grow: 1.8, rearm: 30,
      desc: 'Thieves slip: 1.2s stun + they drop your creature · re-arms in 30s' },
    alarm: { name: 'Alarm Bell', emo: '🔔', color: 0xff3f5c, bg: '#e8323c', r: 0, cap: 1, T: 120, min: 500, grow: 1, rearm: 0,
      desc: 'Rings when someone enters your base · intruders -30% speed for 4s' },
    goo: { name: 'Sticky Goo', emo: '🟢', color: 0x7dff4a, bg: '#3fae3a', r: 1.55, cap: 2, T: 150, min: 900, grow: 1.8, rearm: 0,
      desc: 'Big slow (-65%) while a thief stands in it · always active' },
    spring: { name: 'Spring Trap', emo: '🌀', color: 0xff9a2a, bg: '#ff7a1a', r: 0.9, cap: 1, T: 300, min: 2500, grow: 1, rearm: 25,
      desc: 'Launches the thief out to the plaza, they drop your creature · re-arms in 25s' },
    decoy: { name: 'Decoy Pedestal', emo: '🎭', color: 0xc070ff, bg: '#8a4ad8', r: 1.7, cap: 1, T: 200, min: 1500, grow: 1, rearm: 40,
      desc: 'A fake creature that goes POOF when stolen · wastes the thief\'s time' },
  };
  const ORDER = ['banana', 'alarm', 'goo', 'spring', 'decoy'];
  const BASE_CAP = 6;
  // plot-local slots (lx toward the door, lz along the base). Door at lx=13, pedestals at lx -2.5 / -8.5.
  const FLOOR = [[8.2, 0], [4.0, -2.7], [4.0, 2.7], [-5.5, 0], [0.8, -5.6], [0.8, 5.6], [-5.5, -5.6], [-5.5, 5.6]];
  const ALARM_SLOT = [11.4, -7.0], DECOY_SLOT = [4.6, -9.6];

  // ------------------------------------------------------------------ models (merged, vertex coloured, shared)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3(), _c = new THREE.Color();
  function merge(parts) {
    const pos = [], nor = [], col = [];
    for (const [geo, color, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0] of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
      g.applyMatrix4(_m);
      const P = g.attributes.position.array, N = g.attributes.normal.array; _c.set(color);
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
      for (let i = 0; i < P.length / 3; i++) col.push(_c.r, _c.g, _c.b);
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
  const dimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, color: 0x5a5a66 });
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 36); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 28); discGeo.rotateX(-Math.PI / 2);
  const glowMats = {}, dimGlow = new THREE.MeshBasicMaterial({ color: 0x777788, transparent: true, opacity: 0.18, depthWrite: false });
  const fillMats = {};
  for (const k of ORDER) {
    glowMats[k] = new THREE.MeshBasicMaterial({ color: T[k].color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    fillMats[k] = new THREE.MeshBasicMaterial({ color: T[k].color, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  const GEO = {};
  {
    const Y = 0xffd83a, Yd = 0xe8b820, B = 0x6a4a20;
    const peel = [[G.sphereLo, 0xfff2a8, 0, 0.13, 0, 0.36, 0.2, 0.36], [G.cylLo, 0x7a5a2a, 0, 0.36, 0, 0.07, 0.22, 0.07]];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3 + 0.3;
      peel.push([G.sphereLo, k % 2 ? Yd : Y, Math.sin(a) * 0.58, 0.09, Math.cos(a) * 0.58, 0.3, 0.08, 0.66, 0.12, a, 0]);
      peel.push([G.sphereLo, B, Math.sin(a) * 1.17, 0.08, Math.cos(a) * 1.17, 0.1, 0.06, 0.1]);
    }
    GEO.banana = merge(peel);
    GEO.alarmPost = merge([
      [G.cylLo, 0x3a3f4c, 0, 0.08, 0, 0.5, 0.16, 0.5], [G.cylLo, 0x9aa2b0, 0, 1.25, 0, 0.09, 2.4, 0.09],
      [G.box, 0x9aa2b0, 0, 2.42, 0.25, 0.12, 0.12, 0.62], [G.box, 0xffffff, 0, 1.35, 0.1, 0.06, 0.5, 0.5],
      [G.box, 0xe8323c, 0, 1.35, 0.13, 0.07, 0.36, 0.36],
    ]);
    GEO.bell = merge([
      [G.cone, 0xe8323c, 0, -0.32, 0, 0.42, 0.55, 0.42], [G.sphereLo, 0xe8323c, 0, -0.06, 0, 0.22],
      [G.torus, 0xffc83a, 0, -0.6, 0, 0.42, 0.42, 0.5, Math.PI / 2], [G.sphereLo, 0xffc83a, 0, -0.72, 0, 0.12],
      [G.sphereLo, 0xffe9a0, 0, 0.12, 0, 0.09],
    ]);
    const goo = [[G.cyl, 0x48c22a, 0, 0.04, 0, 1.5, 0.05, 1.5]];
    const bl = [[0.5, 0.3, 0.55], [-0.6, -0.4, 0.5], [0.1, -0.8, 0.42], [-0.3, 0.75, 0.4], [0.9, -0.5, 0.33], [-1.0, 0.3, 0.3]];
    for (const [x, z, r] of bl) goo.push([G.sphereLo, 0x6ae83a, x, 0.06, z, r, r * 0.3, r]);
    for (const [x, z, r] of [[0.3, -0.2, 0.12], [-0.5, 0.2, 0.09], [0.7, 0.6, 0.1], [-0.2, -0.6, 0.08]]) goo.push([G.sphereLo, 0xd8ffb0, x, 0.16, z, r]);
    GEO.goo = merge(goo);
    GEO.springBase = merge([
      [G.box, 0x3a3f4c, 0, 0.08, 0, 1.4, 0.16, 1.4], [G.box, 0xffc83a, 0, 0.17, 0.62, 1.3, 0.02, 0.12], [G.box, 0xffc83a, 0, 0.17, -0.62, 1.3, 0.02, 0.12],
      ...[[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]].map(([x, z]) => [G.cylLo, 0xb8c0cc, x, 0.18, z, 0.07, 0.06, 0.07]),
    ]);
    const sp = [];
    for (let i = 0; i < 4; i++) sp.push([G.torus, 0xd0d8e0, 0, 0.26 + i * 0.17, 0, 0.36, 0.36, 0.5, Math.PI / 2]);
    sp.push([G.cyl, 0xff5a3a, 0, 0.92, 0, 0.62, 0.12, 0.62], [G.box, 0xffe14a, 0, 0.99, -0.12, 0.5, 0.02, 0.1, 0, 0, 0], [G.box, 0xffe14a, -0.14, 0.99, 0.08, 0.08, 0.02, 0.36, 0, 0.6, 0], [G.box, 0xffe14a, 0.14, 0.99, 0.08, 0.08, 0.02, 0.36, 0, -0.6, 0]);
    GEO.springTop = merge(sp);
  }

  // ------------------------------------------------------------------ trap instances
  const traps = new Map(); // plot -> [trap]
  const plotTraps = P => traps.get(P) || [];
  const worldPos = (P, lx, lz) => new V3(P.cx + P.dir * lx, 0, P.cz + lz);
  const noShadow = m => { m.castShadow = false; m.receiveShadow = false; return m; };
  function makeTrap(P, type, slot) {
    const D = T[type], pos = worldPos(P, slot[0], slot[1]);
    const grp = new THREE.Group(); grp.position.copy(pos); P.group.add(grp);
    const t = { P, type, D, slot, key: type + '@' + slot.join(','), pos, group: grp, armed: true, cd: 0, body: [], mov: null, ring: null, fill: null, anim: 0, seed: Math.random() * 10 };
    const add = (geo, y = 0) => { const m = noShadow(new THREE.Mesh(geo, bodyMat)); m.position.y = y; grp.add(m); t.body.push(m); return m; };
    const showRing = !(type === 'decoy' && P !== game.player.plot) && type !== 'alarm';
    if (showRing) {
      const rr = Math.max(0.9, D.r + 0.25);
      t.ring = noShadow(new THREE.Mesh(ringGeo, glowMats[type])); t.ring.scale.setScalar(rr); t.ring.position.y = 0.05; grp.add(t.ring);
      t.fill = noShadow(new THREE.Mesh(discGeo, fillMats[type])); t.fill.scale.setScalar(rr); t.fill.position.y = 0.04; grp.add(t.fill);
    }
    if (type === 'banana') { add(GEO.banana, 0.02).scale.setScalar(1.2); grp.rotation.y = Math.random() * 6.28; }
    else if (type === 'goo') { add(GEO.goo, 0.01); grp.rotation.y = Math.random() * 6.28; }
    else if (type === 'spring') { add(GEO.springBase); t.mov = add(GEO.springTop); }
    else if (type === 'alarm') {
      add(GEO.alarmPost); t.mov = add(GEO.bell, 2.42); t.mov.position.z = 0.5;
      grp.rotation.y = P.dir > 0 ? -Math.PI / 2 : Math.PI / 2; // sign faces the door
      t.ring = noShadow(new THREE.Mesh(ringGeo, glowMats.alarm)); t.ring.scale.setScalar(0.75); t.ring.position.y = 0.05; grp.add(t.ring);
    } else if (type === 'decoy') buildDecoy(t);
    return t;
  }
  // decoy: a clone of the real pedestal look + a tempting creature + the same label as a real one
  function buildDecoy(t) {
    const src = t.P.pedestals[0].group;
    for (let i = 0; i < 3 && i < src.children.length; i++) { const c = src.children[i]; if (c.isMesh) { const m = new THREE.Mesh(c.geometry, c.material); m.position.copy(c.position); m.rotation.copy(c.rotation); m.scale.copy(c.scale); t.group.add(m); t.body.push(m); } }
    dressDecoy(t);
  }
  function decoyPick(P) {
    let best = 0;
    for (const ped of P.pedestals) if (ped.creature) best = Math.max(best, C.CREATURE_BY_ID[ped.creature.id].r);
    const r = clamp(best + (Math.random() < 0.5 ? 1 : 0), 0, 5);
    const list = C.BY_RARITY[r];
    return { id: list[Math.floor(Math.random() * list.length)].id, mut: Math.random() < 0.25 ? 'gold' : '' };
  }
  function dressDecoy(t) {
    if (t.cmesh) { t.group.remove(t.cmesh); t.cmesh = null; }
    if (t.label) { t.group.remove(t.label); t.label.material.map?.dispose(); t.label.material.dispose(); t.label = null; }
    const pk = decoyPick(t.P); t.fake = pk;
    const def = C.CREATURE_BY_ID[pk.id], R = C.RARITIES[def.r];
    const m = game.makeCreature(def, pk.mut); m.position.y = 0.88; m.scale.setScalar(1.25); m.rotation.y = t.P.pedestals[0].faceYaw;
    m.traverse(o => { o.castShadow = false; });
    t.group.add(m); t.cmesh = m;
    const mine = t.P === game.player.plot;
    const lines = [{ text: game.displayName(pk.id, pk.mut, C.WORLD), color: R.color, size: 32, rainbow: R.rainbow }, { text: '$' + game.fmt(game.income(pk.id, pk.mut, C.WORLD)) + '/s', color: '#7dff9a', size: 28 }];
    if (mine) lines.push({ text: '🎭 DECOY', color: '#d8a8ff', size: 26 });
    const lab = game.makeLabel(lines, { scale: 1.05 }); lab.position.y = m.userData.top * 1.25 + 2.8; t.group.add(lab); t.label = lab;
  }
  function removeTrap(t) {
    t.P.group.remove(t.group);
    if (t.label) { t.label.material.map?.dispose(); t.label.material.dispose(); }
  }
  function setArmed(t, on) {
    t.armed = on;
    for (const m of t.body) if (m.material === bodyMat || m.material === dimMat) m.material = on ? bodyMat : dimMat;
    if (t.ring) t.ring.material = on ? glowMats[t.type] : dimGlow;
    if (t.fill) t.fill.visible = on;
    if (t.type === 'decoy') { if (t.cmesh) t.cmesh.visible = on; if (t.label) t.label.visible = on; }
  }

  // which traps a plot should have (ordered list of types) → slots
  function layout(P, types) {
    const out = []; let f = 0;
    for (const ty of types) {
      if (ty === 'alarm') out.push([ty, ALARM_SLOT]);
      else if (ty === 'decoy') out.push([ty, DECOY_SLOT]);
      else if (f < FLOOR.length) out.push([ty, FLOOR[f++]]);
    }
    return out;
  }
  function applyTypes(P, types) {
    const want = layout(P, types), have = plotTraps(P), next = [];
    const keyOf = (ty, s) => ty + '@' + s.join(',');
    for (const [ty, s] of want) {
      const k = keyOf(ty, s), ex = have.find(t => t.key === k);
      next.push(ex || makeTrap(P, ty, s));
    }
    for (const t of have) if (!next.includes(t)) removeTrap(t);
    traps.set(P, next);
  }
  function playerTypes() {
    // interleave so floor slots near the door get a mix (banana first, then goo, then 2nd banana …)
    const o = st.owned, out = [];
    const want = { banana: o.banana | 0, alarm: o.alarm | 0, goo: o.goo | 0, spring: o.spring | 0, decoy: o.decoy | 0 };
    const seq = ['alarm', 'banana', 'goo', 'spring', 'decoy', 'banana', 'goo'];
    for (const ty of seq) if (want[ty] > 0) { out.push(ty); want[ty]--; }
    return out.slice(0, BASE_CAP);
  }
  const placePlayer = () => applyTypes(game.player.plot, playerTypes());
  // bots: the further ahead of this world's baseline, the more traps
  const botSeq = new Map();
  function botTypes(b) {
    if (!botSeq.has(b)) {
      const s = Math.random() < 0.5 ? ['alarm', 'banana', 'goo', 'decoy', 'banana', 'spring', 'goo'] : ['banana', 'alarm', 'decoy', 'goo', 'spring', 'banana', 'goo'];
      botSeq.set(b, s);
    }
    const rel = Math.max(0, b.speedLv - C.WORLDS[C.WORLD].botLv);
    const n = clamp(Math.floor((rel + 1.5) / 2.5), 0, BASE_CAP);
    return botSeq.get(b).slice(0, n);
  }
  function placeBots() { for (const b of game.bots) applyTypes(b.plot, botTypes(b)); }

  // ------------------------------------------------------------------ shop
  const owned = ty => st.owned[ty] | 0;
  const totalOwned = () => ORDER.reduce((s, k) => s + owned(k), 0);
  function playerIncome() {
    let inc = 0;
    for (const ped of game.player.plot.pedestals) if (ped.creature) inc += game.income(ped.creature.id, ped.creature.mut, ped.creature.w);
    return inc * game.incMult();
  }
  function priceOf(ty) {
    const D = T[ty], wm = C.WORLDS[C.WORLD].mult;
    return Math.round(Math.max(D.min * wm, playerIncome() * D.T) * Math.pow(D.grow, owned(ty)));
  }
  bus.shopRows.push(() => ORDER.map(ty => {
    const D = T[ty], n = owned(ty), full = n >= D.cap || totalOwned() >= BASE_CAP;
    const row = {
      id: 'trap_' + ty, ic: `<span style="font-size:30px;line-height:1">${D.emo}</span>`, bg: D.bg,
      t: `${D.name}  ${n}/${D.cap}${n >= D.cap ? ' (MAX)' : ''}`,
      s: full && n < D.cap ? `Base trap limit reached (${BASE_CAP})` : `Trap · ${D.desc}`,
      cost: null,
      buy: () => { st.owned[ty] = owned(ty) + 1; placePlayer(); game.toast(`${D.emo} ${D.name} placed in your base!`, 'gold'); },
    };
    if (!full) row.cost = Math.round(priceOf(ty) * bus.mul('price', row));
    return row;
  }));

  // ------------------------------------------------------------------ fx + sound helpers
  const near = (pos, d) => pos.distanceToSquared(game.camera.position) < d * d;
  const mine = P => P === game.player.plot;
  function bellSound(loud) {
    const s = game.sound; if (!s.ctx) return;
    const v = loud ? 1 : 0.4;
    for (let i = 0; i < 5; i++) {
      s.tone(1318, 0.5, { type: 'sine', vol: 0.16 * v, delay: i * 0.17, rev: 0.4 });
      s.tone(2637, 0.3, { type: 'sine', vol: 0.06 * v, delay: i * 0.17 });
      s.tone(3520, 0.18, { type: 'triangle', vol: 0.03 * v, delay: i * 0.17 + 0.01 });
      s.hiss(0.03, { vol: 0.12 * v, freq: 5000, q: 2, delay: i * 0.17 });
    }
  }
  function slipSound(loud) {
    const s = game.sound; if (!s.ctx) return; const v = loud ? 1 : 0.4;
    s.hiss(0.25, { vol: 0.25 * v, freq: 900, sweep: 2600, q: 1.5 });
    s.tone(700, 0.35, { type: 'triangle', vol: 0.14 * v, slide: -520 });
    s.tone(120, 0.2, { type: 'sine', vol: 0.3 * v, delay: 0.3, slide: -60 });
  }
  function boingSound(loud) {
    const s = game.sound; if (!s.ctx) return; const v = loud ? 1 : 0.4;
    s.tone(140, 0.5, { type: 'sine', vol: 0.3 * v, slide: 520 });
    for (let i = 0; i < 4; i++) s.tone(300 + i * 40, 0.12, { type: 'triangle', vol: 0.08 * v, delay: 0.05 + i * 0.07, slide: 200 });
  }
  function poofSound(loud) {
    const s = game.sound; if (!s.ctx) return; const v = loud ? 1 : 0.4;
    s.hiss(0.4, { vol: 0.35 * v, freq: 600, sweep: 3000, q: 0.6 });
    s.tone(880, 0.12, { type: 'square', vol: 0.06 * v, lp: 3000, delay: 0.05 });
    s.tone(660, 0.25, { type: 'triangle', vol: 0.1 * v, delay: 0.12, slide: -300 });
  }
  const CONF = [0xff4f6a, 0xffe14a, 0x5ee06a, 0x3fa8ff, 0xc070ff];
  const ownerName = P => mine(P) ? 'your' : (P.owner?.name || 'their') + "'s";
  const who = a => a === game.player ? 'You' : a.name;

  // ------------------------------------------------------------------ trap effects
  // stolen-from-this-base creature goes back on its pedestal (dropCarry with a non-'hit' reason does that)
  function dropBack(a, P) {
    if (a.carry && a.carry.from && a.carry.from.plot === P) return game.dropCarry(a, 'trap');
    return null;
  }
  function learn(a, t) { if (a.isBot) (a._tpKnown ||= new Set()).add(t); }
  function giveUp(a, p) { if (a.isBot && !a.carry && a.ai.mode === 'steal' && Math.random() < p) { a.ai.mode = 'return'; a.ai.victim = null; } }

  function fireBanana(t, a) {
    setArmed(t, false); t.cd = t.D.rearm; t.anim = 0.4;
    const lost = dropBack(a, t.P);
    const sp = Math.hypot(a.vel.x, a.vel.z) || 1;
    a.kb.set(a.vel.x / sp * 7, 0, a.vel.z / sp * 7); a.vel.set(0, 0, 0);
    a.vy = 6.5; a.onGround = false; a.stun = Math.max(a.stun, 1.2); a.hitImmune = Math.max(a.hitImmune, 0.2);
    const seen = near(t.pos, 45), loud = a === game.player || mine(t.P);
    if (seen) { game.fx.sparkle(t.pos, 0xffe14a, 22); game.fx.ring(t.pos, 0xffe14a, 2.4, 0.4, true); game.float('SLIP!', a.pos, '#ffe14a'); }
    if (seen || loud) slipSound(loud);
    if (a === game.player) { game.addShake(0.35); game.toast(`🍌 You slipped on ${ownerName(t.P)} Banana Peel!` + (lost ? ' The creature went back.' : ''), 'red'); }
    else if (mine(t.P)) game.toast(`🍌 ${a.name} slipped on your Banana Peel!` + (lost ? ` ${game.displayName(lost.id, lost.mut, lost.w)} is safe!` : ''), 'gold');
    learn(a, t); giveUp(a, 0.5);
    bus.emit('trap', t.type, a, t.P, !!lost);
  }
  function fireSpring(t, a) {
    setArmed(t, false); t.cd = t.D.rearm; t.anim = 1;
    const lost = dropBack(a, t.P);
    const P = t.P;
    const x1 = clamp(P.cx + P.dir * rand(25, 31), -C.PLAZA_HALF + 3, C.PLAZA_HALF - 3);
    const z1 = clamp(P.cz + rand(-6, 6), 5, C.PLAZA_DEPTH - 5);
    a._tpFly = { t: 0, dur: 1.05, x0: a.pos.x, z0: a.pos.z, x1, z1, h: 8 };
    a.vel.set(0, 0, 0); a.kb.set(0, 0, 0); a.stun = Math.max(a.stun, 1.6);
    const seen = near(t.pos, 50), loud = a === game.player || mine(P);
    if (seen) { game.fx.burst(t.pos, 0xff9a2a, 30); game.fx.ring(t.pos, 0xffffff, 2.6, 0.3, true); game.float('BOING!', a.pos, '#ff9a2a'); }
    if (seen || loud) boingSound(loud);
    if (a === game.player) { game.addShake(0.45); game.toast(`🌀 ${P.owner.name}'s Spring Trap launched you out!` + (lost ? ' You dropped the creature.' : ''), 'red'); }
    else if (mine(P)) game.toast(`🌀 Your Spring Trap launched ${a.name} out of your base!` + (lost ? ` ${game.displayName(lost.id, lost.mut, lost.w)} is safe!` : ''), 'gold');
    learn(a, t);
    if (a.isBot && !a.carry) { a.ai.mode = Math.random() < 0.65 ? 'return' : a.ai.mode; }
    bus.emit('trap', t.type, a, P, !!lost);
  }
  function fireAlarm(t, a) {
    t.anim = 2.2; t.flash = 3;
    a._tpAlarmT = 4;
    const P = t.P, loud = mine(P) || a === game.player;
    if (loud || near(t.pos, 40)) bellSound(loud);
    if (mine(P)) {
      game.flashHit(); game.juice.flash(0.25, 0xff2a3a);
      game.toast(`🔔 ALARM! ${a.name} broke into your base!`, 'red');
    } else {
      if (a === game.player) game.toast(`🔔 You tripped ${P.owner.name}'s Alarm Bell!`, 'red');
      // the alarm alerts the bot owner (they still react with their normal human delay / chance)
      const o = P.owner;
      if (o && o.isBot && !o.ai.theft && !o.carry) o.ai.theft = { by: a, t: 0 };
    }
    if (near(t.pos, 45)) game.fx.ring(t.mov ? t.mov.getWorldPosition(_p) : t.pos, 0xff3f5c, 3, 0.45);
    bus.emit('trap', t.type, a, P, false);
  }
  function poofDecoy(t, a) {
    setArmed(t, false); t.cd = t.D.rearm;
    const P = t.P, p = _p.copy(t.pos); p.y = 1;
    if (near(t.pos, 60)) {
      for (const c of CONF) game.fx.burst(p, c, game.lowQ ? 8 : 16);
      game.fx.smoke(p, game.lowQ ? 8 : 14); game.fx.ring(p, 0xc070ff, 3, 0.4);
      game.float('DECOY!', t.pos, '#d8a8ff');
    }
    const loud = a === game.player || mine(P);
    if (loud || near(t.pos, 40)) poofSound(loud);
    a.stun = Math.max(a.stun, 0.9);
    if (a === game.player) { game.addShake(0.2); game.toast(`🎭 POOF! It was a DECOY — ${P.owner.name} fooled you!`, 'red'); }
    else if (mine(P)) game.toast(`🎭 ${a.name} fell for your Decoy!`, 'gold');
    learn(a, t);
    if (a.isBot) { a._tpFooled = null; giveUp(a, 0.4); }
    bus.emit('trap', t.type, a, P, false);
  }

  // player stealing the decoy in a bot base looks exactly like a real steal prompt
  bus.interactions.push(p => {
    const pl = game.player; if (pl.carry) return null;
    for (const [P, list] of traps) {
      if (P === pl.plot || !P.contains(p.x, p.z)) continue;
      for (const t of list) {
        if (t.type !== 'decoy' || !t.armed) continue;
        if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 2.6) {
          if (P.locked) return { text: '🔒 Base is locked' };
          return { text: `<b>[E]</b> Steal ${game.displayName(t.fake.id, t.fake.mut, C.WORLD)}`, act: () => poofDecoy(t, pl) };
        }
      }
    }
    return null;
  });

  // ------------------------------------------------------------------ speed modifier (goo + alarm)
  bus.mod('speed', a => a._tpMul ?? 1);

  // ------------------------------------------------------------------ bot awareness: route around noticed traps, fall for decoys
  const origRoute = game.routeNext;
  game.routeNext = (a, tgt) => {
    let wp = origRoute(a, tgt);
    if (!a.isBot || !a._tpIn) return wp;
    const P = a._tpIn, list = plotTraps(P);
    // fooled by a decoy: go for it instead of the real pedestal
    if (a._tpFooled && a._tpFooled.armed && a._tpFooled.P === P && a.ai.mode === 'steal' && !a.carry) wp = a._tpFooled.pos;
    const seen = a._tpSeen; if (!seen) return wp;
    const px = a.pos.x, pz = a.pos.z;
    for (const t of list) {
      if (!t.D.r || t.type === 'decoy' || !t.armed || !seen.get(t)) continue;
      const dx = wp.x - px, dz = wp.z - pz, L2 = dx * dx + dz * dz; if (L2 < 0.01) continue;
      const u = clamp(((t.pos.x - px) * dx + (t.pos.z - pz) * dz) / L2, 0, 1);
      const cx = px + dx * u, cz = pz + dz * u;
      let vx = cx - t.pos.x, vz = cz - t.pos.z; const d = Math.hypot(vx, vz), R = t.D.r + 0.95;
      if (d >= R || u <= 0) continue;
      if (d < 0.05) { const l = Math.sqrt(L2); vx = -dz / l; vz = dx / l; } else { vx /= d; vz /= d; }
      let ox = t.pos.x + vx * (t.D.r + 1.7), oz = t.pos.z + vz * (t.D.r + 1.7);
      if (!P.contains(ox, oz)) { ox = t.pos.x - vx * (t.D.r + 1.7); oz = t.pos.z - vz * (t.D.r + 1.7); }
      return new V3(ox, 0, oz);
    }
    return wp;
  };

  // ------------------------------------------------------------------ main update
  let clockT = 0, botCheckT = 0, cullT = 0;
  function onEnter(a, P) {
    a._tpSeen = new Map(); a._tpFooled = null;
    for (const t of plotTraps(P)) {
      if (t.type === 'alarm' && t.armed && (t.cool?.get(a) ?? -99) < clockT) { (t.cool ||= new Map()).set(a, clockT + 6); fireAlarm(t, a); }
    }
    if (a.isBot && a.ai.mode === 'steal') {
      const dec = plotTraps(P).find(t => t.type === 'decoy' && t.armed);
      const known = a._tpKnown?.has(dec);
      if (dec && Math.random() < (known ? 0.12 : 0.5)) a._tpFooled = dec;
    }
  }
  function updateActor(a, dt) {
    a._tpMul = 1;
    if (a._tpAlarmT > 0) { a._tpAlarmT -= dt; a._tpMul *= 0.7; }
    // spring flight (scripted arc so walls don't block it)
    const F = a._tpFly;
    if (F) {
      if (a.swept > 0 || a.dead > 0) a._tpFly = null;
      else {
        F.t += dt; const f = Math.min(1, F.t / F.dur);
        a.pos.x = F.x0 + (F.x1 - F.x0) * f; a.pos.z = F.z0 + (F.z1 - F.z0) * f; a.pos.y = F.h * 4 * f * (1 - f) + 0.01;
        a.vel.set(0, 0, 0); a.kb.set(0, 0, 0); a.vy = 0; a.onGround = false; a.stun = Math.max(a.stun, 0.3);
        a.obj.rotation.x = f < 1 ? f * Math.PI * 2 : 0;
        if (f >= 1) { a._tpFly = null; a.pos.y = 0; a.onGround = true; a.obj.rotation.x = 0; a.stun = Math.max(a.stun, 0.5); if (near(a.pos, 50)) game.fx.land(a.pos, 0xe8dcc4, 1.3, game.lowQ ? 8 : 14); }
      }
    }
    if (a.swept > 0 || a.dead > 0) { a._tpIn = null; return; }
    // which foreign base is the actor in?
    let inP = null;
    if (!a._tpFly) for (const P of game.plots) if (P !== a.plot && P.contains(a.pos.x, a.pos.z)) { inP = P; break; }
    if (inP !== a._tpIn) { a._tpIn = inP; if (inP) onEnter(a, inP); }
    if (!inP) return;
    const list = plotTraps(inP), grounded = a.onGround && a.pos.y < 0.4;
    for (const t of list) {
      if (!t.D.r || t.type === 'decoy') {
        if (t.type === 'decoy' && t.armed && a.isBot && a._tpFooled === t && Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) < 1.9) poofDecoy(t, a);
        continue;
      }
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      // bots spot traps late and imperfectly (once per visit, when ~7m away)
      if (a.isBot && a._tpSeen && !a._tpSeen.has(t) && d2 < 49) {
        const known = a._tpKnown?.has(t);
        const p = known ? 0.85 : t.type === 'goo' ? 0.6 - a.personality.sloppy * 0.5 : 0.5 - a.personality.sloppy * 0.6;
        a._tpSeen.set(t, Math.random() < p);
      }
      if (t.type === 'goo') { if (d2 < t.D.r * t.D.r) { a._tpMul *= 0.35; if (Math.random() < dt * 6 && near(a.pos, 30)) game.fx.dust(a.pos, 0x7dff4a); } continue; }
      if (!t.armed || !grounded || d2 > t.D.r * t.D.r) continue;
      if (t.type === 'banana' && a.stun <= 0) fireBanana(t, a);
      else if (t.type === 'spring') fireSpring(t, a);
    }
  }
  function animate(dt) {
    const time = game.clock.elapsedTime;
    const pulse = 0.62 + Math.sin(time * 3) * 0.2;
    for (const k of ORDER) glowMats[k].opacity = pulse;
    for (const list of traps.values()) for (const t of list) {
      if (t.cd > 0) {
        t.cd -= dt;
        if (t.cd <= 0) {
          t.cd = 0; setArmed(t, true);
          if (t.type === 'decoy') dressDecoy(t);
          if (near(t.pos, 40)) game.fx.ring(t.pos, t.D.color, 1.8, 0.35, true);
          if (mine(t.P) && near(t.pos, 30)) game.float(`${t.D.emo} re-armed`, t.pos, '#fff');
        }
      }
      if (!t.group.visible) continue;
      if (t.type === 'alarm') {
        if (t.anim > 0) { t.anim -= dt; t.mov.rotation.x = Math.sin(time * 28) * 0.45 * Math.min(1, t.anim); }
        else t.mov.rotation.x = 0;
        if (t.ring) t.ring.material = t.anim > 0 ? (Math.sin(time * 20) > 0 ? glowMats.alarm : dimGlow) : glowMats.alarm;
      } else if (t.type === 'spring') {
        const s = t.anim > 0 ? 1 + Math.sin((1 - t.anim) * 18) * 0.5 * t.anim : t.armed ? 1 : 0.45;
        if (t.anim > 0) t.anim = Math.max(0, t.anim - dt * 1.4);
        t.mov.scale.y = s;
      } else if (t.type === 'banana') {
        if (t.anim > 0) { t.anim -= dt; t.group.position.y = Math.sin(t.anim / 0.4 * Math.PI) * 0.4; } else t.group.position.y = 0;
      } else if (t.type === 'decoy' && t.cmesh && t.cmesh.visible) game.animateCreature(t.cmesh, time, t.seed);
    }
  }
  function cull() {
    const cp = game.camera.position;
    for (const list of traps.values()) for (const t of list) {
      const d = Math.hypot(t.pos.x - cp.x, t.pos.z - cp.z);
      t.group.visible = d < 85;
      if (t.label) t.label.visible = t.armed && d < 60;
    }
  }

  bus.on('tick', dt => {
    clockT += dt;
    for (const a of game.actors) updateActor(a, dt);
    animate(dt);
    cullT -= dt; if (cullT <= 0) { cullT = 0.25; cull(); }
    botCheckT -= dt; if (botCheckT <= 0) { botCheckT = 5; placeBots(); }
  });
  bus.on('travel', () => {
    for (const a of game.actors) { a._tpFly = null; a._tpIn = null; a._tpMul = 1; a._tpAlarmT = 0; a._tpKnown = null; }
    for (const list of traps.values()) for (const t of list) { t.cd = 0; setArmed(t, true); if (t.type === 'decoy') dressDecoy(t); }
    placeBots();
  });
  bus.on('respawn', a => { a._tpFly = null; a.obj.rotation.x = 0; });
  bus.on('start', () => { placeBots(); for (const list of traps.values()) for (const t of list) if (t.type === 'decoy') dressDecoy(t); });

  placePlayer();
  placeBots();

  // debug handle for testing
  game._traps = { traps, T, st, placePlayer, placeBots, fireBanana, fireSpring, poofDecoy, priceOf };
}
