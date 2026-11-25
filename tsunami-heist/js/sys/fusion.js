// fusion system — see ../hooks.js for the bus API
// A Fusion Machine on the back-left of the plaza: put 3 identical creatures in (same species + mutation + world),
// get 1 back with the next mutation tier ('' → gold → diamond → rainbow). Costs ~120 s of the result's income.
// 5% "lucky fusion" skips a tier. Bots occasionally walk over and use it too (their base gets an upgraded creature).
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MX = -19, MZ = 75.5, SC = 1.4; // free spot between the palms at the back-left of the plaza (no bot traffic)
const FRONT_Z = MZ - 3.9 * SC;           // where you stand to use it
const TIERS = ['', 'gold', 'diamond', 'rainbow'];
const COST_SECONDS = 120, LUCKY = 0.05;
const T_SUCK = 1.5, T_BANG = 3.1, T_POP = 4.7, T_LAND = 5.8; // animation timeline (s)

export default function init(game, bus) {
  const { THREE, C, S, fx, juice, sound, G, toon } = game;
  const V3 = THREE.Vector3;
  const st = bus.state('fusion', { fusions: 0, lucky: 0, hinted: {} });
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nextMut = m => { const i = TIERS.indexOf(m || ''); return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null; };
  const mutColor = m => (C.MUT_BY_ID[m || '']?.color) ?? 0x5af0ff;

  // ================================================================ machine model
  const root = new THREE.Group(); root.position.set(MX, 0, MZ); root.scale.setScalar(SC);
  const W = (x, y, z) => new V3(MX + x * SC, y * SC, MZ + z * SC); root.name = 'fusionMachine';
  const parts = new Map(); // material -> [geometry]
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3();
  function prep(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }
  function part(mat, geo, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, q = null) {
    const g = prep(geo);
    _m4.compose(_p.set(x, y, z), q || _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(g);
  }
  function flush(parent, shadow = true) {
    for (const [mat, list] of parts) {
      const m = new THREE.Mesh(mergeGeometries(list), mat); list.forEach(g => g.dispose());
      m.castShadow = shadow && !mat.transparent && !mat.isMeshBasicMaterial; m.receiveShadow = true; parent.add(m);
    }
    parts.clear();
  }
  const oct = new THREE.CylinderGeometry(1, 1, 1, 8);
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
  const funnelGeo = new THREE.CylinderGeometry(1, 0.32, 1, 18, 1, true);
  const dark = toon(0x2e3350, { metal: true, rough: 0.35 });
  const steel = toon(0x9aa3c8, { metal: true, rough: 0.3 });
  const gold = toon(0xffc83a, { metal: true, rough: 0.28 });
  const purple = new THREE.MeshStandardMaterial({ color: 0x7a4cff, roughness: 0.4, side: THREE.DoubleSide });
  const glowA = new THREE.MeshBasicMaterial({ color: 0x5af0ff, toneMapped: false });
  const glowB = new THREE.MeshBasicMaterial({ color: 0xff5ad8, toneMapped: false });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x5dff86, toneMapped: false });
  const glass = new THREE.MeshStandardMaterial({ color: 0xc8f6ff, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const liquidMat = new THREE.MeshStandardMaterial({ color: 0x3cf0ff, emissive: 0x1aa8d8, emissiveIntensity: 1.0, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.1 });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffb0f0, emissive: 0xff3fd0, emissiveIntensity: 1.6, flatShading: true, roughness: 0.3 });
  const floorMat = new THREE.MeshBasicMaterial({ color: 0xff5ad8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  // plinth
  part(dark, oct, 0, 0.22, 0, 3.0, 0.44, 3.0, 0, Math.PI / 8);
  part(steel, oct, 0, 0.5, 0, 2.55, 0.16, 2.55, 0, Math.PI / 8);
  part(gold, G.ring, 0, 0.46, 0, 2.98, 2.98, 1.4, Math.PI / 2);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(glowA, G.sphereLo, Math.sin(a) * 2.75, 0.3, Math.cos(a) * 2.75, 0.13); }
  // tube collars, dome, antenna
  part(gold, G.cyl, 0, 0.78, 0, 1.32, 0.3, 1.32);
  part(dark, G.cyl, 0, 0.98, 0, 1.18, 0.12, 1.18);
  part(gold, G.cyl, 0, 3.86, 0, 1.32, 0.3, 1.32);
  part(purple, G.halfSphere, 0, 4.0, 0, 1.25, 0.9, 1.25);
  part(gold, G.ring, 0, 4.02, 0, 1.25, 1.25, 1.6, Math.PI / 2);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(glowB, G.sphereLo, Math.sin(a) * 0.95, 4.45, Math.cos(a) * 0.95, 0.12); }
  part(steel, G.cylLo, 0, 5.15, 0, 0.07, 1.1, 0.07);
  part(gold, G.torus, 0, 5.05, 0, 0.35, 0.35, 0.35, Math.PI / 2);
  part(glowB, G.sphere, 0, 5.8, 0, 0.24);
  // three input hoppers with pipes into the tube (back, front-left, front-right)
  const hoppers = [];
  const up = new V3(0, 1, 0), dir = new V3();
  for (const a of [0, Math.PI * 2 / 3, -Math.PI * 2 / 3]) {
    const hx = Math.sin(a) * 2.4, hz = Math.cos(a) * 2.4;
    part(steel, G.cyl, hx, 1.7, hz, 0.2, 3.4, 0.2);
    part(gold, G.cyl, hx, 0.62, hz, 0.34, 0.24, 0.34);
    part(purple, funnelGeo, hx, 3.95, hz, 0.85, 1.0, 0.85);
    part(glowA, G.ring, hx, 4.45, hz, 0.85, 0.85, 1.6, Math.PI / 2);
    const p0 = new V3(hx, 3.45, hz), p1 = new V3(Math.sin(a) * 1.1, 2.95, Math.cos(a) * 1.1);
    dir.subVectors(p1, p0); const len = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    part(steel, G.cyl, mid.x, mid.y, mid.z, 0.17, len, 0.17, 0, 0, 0, q);
    part(gold, G.sphereLo, p0.x, p0.y, p0.z, 0.24); part(gold, G.sphereLo, p1.x, p1.y, p1.z, 0.24);
    hoppers.push({ top: W(hx, 6.0, hz), funnel: W(hx, 4.1, hz), wall: W(p1.x, p1.y, p1.z) });
  }
  // exhaust stacks
  const stacks = [];
  for (const s of [-1, 1]) {
    const x = Math.sin(s * Math.PI / 3) * 2.2, z = Math.cos(s * Math.PI / 3) * 2.2;
    part(steel, G.cyl, x, 1.7, z, 0.26, 3.4, 0.26); part(gold, G.cyl, x, 3.45, z, 0.33, 0.18, 0.33); part(dark, G.cyl, x, 3.56, z, 0.22, 0.05, 0.22);
    stacks.push(W(x, 3.6, z));
  }
  // control console facing the plaza
  part(dark, G.box, 0, 0.72, -2.4, 1.7, 1.1, 0.75);
  part(steel, G.box, 0, 1.38, -2.5, 1.75, 0.14, 0.9, -0.5);
  part(screenMat, G.box, 0, 1.44, -2.53, 1.15, 0.03, 0.55, -0.5);
  [0xff4f6a, 0xffd23f, 0x5dff86].forEach((c, i) => part(new THREE.MeshBasicMaterial({ color: c, toneMapped: false }), G.sphereLo, -0.5 + i * 0.5, 0.8, -2.79, 0.1));
  part(gold, G.box, 0, 0.2, -2.4, 1.8, 0.1, 0.85);
  flush(root);

  const tube = new THREE.Mesh(tubeGeo, glass); tube.position.y = 2.42; tube.scale.set(1.1, 2.88, 1.1); tube.renderOrder = 3; root.add(tube);
  const liquid = new THREE.Mesh(G.cyl, liquidMat); liquid.renderOrder = 2; root.add(liquid);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), coreMat); core.position.y = 2.35; root.add(core);
  const coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color: 0xff5ad8, wireframe: true, transparent: true, opacity: 0.6, toneMapped: false }));
  coreShell.position.y = 2.35; root.add(coreShell);
  const rings = [];
  for (const [y, tilt, c] of [[1.55, 0.28, glowA], [3.2, -0.22, glowB]]) {
    const tiltG = new THREE.Group(); tiltG.position.y = y; tiltG.rotation.z = tilt; root.add(tiltG);
    const spinG = new THREE.Group(); tiltG.add(spinG);
    part(gold, G.torus, 0, 0, 0, 1.6, 1.6, 1.3, Math.PI / 2);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; part(c, G.sphereLo, Math.sin(a) * 1.6, 0, Math.cos(a) * 1.6, 0.17); }
    flush(spinG, false);
    rings.push(spinG);
  }
  const floorRing = new THREE.Mesh(new THREE.RingGeometry(3.25, 3.75, 48), floorMat);
  floorRing.rotation.x = -Math.PI / 2; floorRing.position.y = 0.06; root.add(floorRing);
  const sign = game.makeLabel([{ text: '🧪 FUSION MACHINE', color: '#ff7ae0', size: 54 }, { text: '3 identical → 1 better creature', color: '#fff', size: 26 }], { scale: 1.35 });
  sign.position.y = 7.6; root.add(sign);
  game.scene.add(root);
  root.traverse(o => { const m = o.material; if (m && m.isMeshStandardMaterial && m.metalness < 0.5) m.envMapIntensity = 0.35; });

  // collider (world.colliders is truncated back to the static plaza set on every world change → re-add)
  const col = { minX: MX - 3.0 * SC, maxX: MX + 3.0 * SC, minZ: MZ - 2.9 * SC, maxZ: MZ + 3.0 * SC, fusion: true };
  const ensureCollider = () => { if (!game.world.colliders.includes(col)) game.world.colliders.push(col); };
  ensureCollider();

  // ================================================================ thumbnails (own tiny renderer, cached)
  const thumbs = new Map(); let tR = null, tScene, tCam;
  function thumb(id, mut = '') {
    const key = id + '|' + mut; if (thumbs.has(key)) return thumbs.get(key);
    try {
      if (!tR) {
        tR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); tR.setSize(112, 112);
        tR.outputColorSpace = THREE.SRGBColorSpace; tR.toneMapping = THREE.ACESFilmicToneMapping;
        tScene = new THREE.Scene(); tScene.environment = game.scene.environment;
        tScene.add(new THREE.HemisphereLight(0xffffff, 0x998866, 1.2)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 5); tScene.add(d);
        tCam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      }
      const m = game.makeCreature(C.CREATURE_BY_ID[id], mut); tScene.add(m);
      const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new V3()), s = b.getSize(new V3()), r = Math.max(s.x, s.y, s.z);
      tCam.position.set(c.x + r * 0.9, c.y + r * 0.55, c.z + r * 2.0); tCam.lookAt(c);
      tR.render(tScene, tCam);
      const url = tR.domElement.toDataURL(); tScene.remove(m); thumbs.set(key, url); return url;
    } catch (e) { return ''; }
  }

  // ================================================================ data helpers
  const myPlot = () => game.player.plot;
  function groups() {
    const P = myPlot(), m = new Map();
    for (let i = 0; i < S.slots; i++) {
      const ped = P.pedestals[i], c = ped.creature;
      if (!c || !ped.group.visible) continue; // hidden = a fusion result still in flight
      const k = c.id + '|' + (c.mut || '') + '|' + (c.w || 0);
      let g = m.get(k); if (!g) m.set(k, g = { key: k, id: c.id, mut: c.mut || '', w: c.w || 0, idx: [] });
      g.idx.push(i);
    }
    return [...m.values()];
  }
  const fuseCost = (id, mut, w) => Math.max(25, Math.ceil(game.income(id, mut, w) * (1 + 0.5 * S.rebirths) * COST_SECONDS));
  const fusable = g => g.idx.length >= 3 && nextMut(g.mut) !== null;

  // ================================================================ panel UI
  const css = document.createElement('style');
  css.textContent = `
#panelFusion h2 { color: #ff8ae6; }
#panelFusion .fuTiers { display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap; margin: -4px 0 14px; font-size: 16px; }
#panelFusion .fuTiers span { padding: 3px 10px; border-radius: 10px; border: 2px solid rgba(20,16,32,.6); background: rgba(255,255,255,.08); }
#panelFusion .fuTiers i { color: #c9c2ec; font-style: normal; }
#panelFusion .row .ic { padding: 0; overflow: hidden; }
#panelFusion .row .ic img { width: 100%; height: 100%; object-fit: cover; }
#panelFusion .row.can { border-color: rgba(255,138,230,.55); box-shadow: 0 0 0 2px rgba(255,90,216,.2), 0 3px 0 rgba(20,16,32,.45); }
#panelFusion .pips { display: inline-flex; gap: 3px; margin-left: 8px; vertical-align: middle; }
#panelFusion .pips i { width: 11px; height: 11px; border-radius: 50%; background: rgba(255,255,255,.18); border: 2px solid rgba(20,16,32,.6); }
#panelFusion .pips i.on { background: #ff8ae6; }
#panelFusion .arrow { color: #ff8ae6; }
#panelFusion .empty { text-align: center; color: #c9c2ec; padding: 18px 8px; }
@media (max-width: 760px) { #panelFusion .row .tx b { font-size: 17px; } #panelFusion .row .tx span { font-size: 13px; } #panelFusion .row .ic { width: 44px; height: 44px; } #panelFusion .fuTiers { font-size: 13px; } }`;
  document.head.appendChild(css);
  const panel = document.createElement('div');
  panel.id = 'panelFusion'; panel.className = 'panel hidden';
  panel.innerHTML = `<button class="btn grey small close">${game.icon('close')}</button>
<h2>${game.icon('sparkle')} FUSION</h2>
<div class="psub">Put in <b>3 identical</b> creatures, get <b>1</b> with a better mutation — frees 2 pedestals!<br>${Math.round(LUCKY * 100)}% chance of a <b style="color:#ffd23f">LUCKY FUSION</b> that skips a tier.</div>
<div class="fuTiers"><span>Normal</span><i>→</i><span style="color:#ffcc33">● Gold x3</span><i>→</i><span style="color:#7fe8ff">◆ Diamond x6</span><i>→</i><span style="color:#ff66ff">★ Rainbow x12</span></div>
<div id="fuRows"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.close').onclick = () => game.closePanels();

  function render() {
    const gs = groups().sort((a, b) => (fusable(b) - fusable(a)) || (game.income(b.id, b.mut, b.w) - game.income(a.id, a.mut, a.w)));
    const box = document.getElementById('fuRows');
    if (!gs.length) { box.innerHTML = `<div class="empty">Your base is empty — bring creatures home first!</div>`; return; }
    box.innerHTML = gs.map(g => {
      const def = C.CREATURE_BY_ID[g.id], R = C.RARITIES[def.r], nx = nextMut(g.mut), n = g.idx.length;
      const name = game.displayName(g.id, g.mut, g.w);
      let sub, btn;
      if (nx === null) { sub = `${game.icon('sparkle')} Already the best mutation`; btn = `<button class="btn grey" disabled>MAX</button>`; }
      else {
        const cost = fuseCost(g.id, nx, g.w), inc = game.income(g.id, nx, g.w);
        sub = `<span class="arrow">→</span> <b style="display:inline;font-size:inherit;color:#${new THREE.Color(mutColor(nx)).getHexString()}">${game.displayName(g.id, nx, g.w)}</b> · $${game.fmt(inc)}/s`;
        btn = n >= 3 ? `<button class="btn ${S.cash >= cost ? 'pink' : 'grey'}" data-k="${g.key}">FUSE ${game.icon('coin')}${game.fmt(cost)}</button>`
          : `<button class="btn grey" disabled>${n}/3</button>`;
      }
      const pips = `<span class="pips">${[0, 1, 2].map(k => `<i class="${k < Math.min(3, n) ? 'on' : ''}"></i>`).join('')}</span>`;
      return `<div class="row${n >= 3 && nx !== null ? ' can' : ''}"><div class="ic" style="--icbg:${R.color}"><img src="${thumb(g.id, g.mut)}"></div><div class="tx"><b style="color:${R.color}">${name} <span style="display:inline;font-size:.8em;color:#fff">x${n}</span>${pips}</b><span>${sub}</span></div>${btn}</div>`;
    }).join('');
    box.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => fuse(b.dataset.k));
  }
  function open() {
    if (A) { game.toast('🧪 The machine is busy — wait a moment!'); return; }
    render(); game.openPanel('panelFusion');
  }
  bus.interactions.push(p => {
    const d = Math.hypot(p.x - MX, p.z - MZ);
    if (d > 7.2) return null;
    return A ? { text: '🧪 Fusing…' } : { text: '<b>[E]</b> Fusion Machine', act: open };
  });

  // ================================================================ the fusion itself
  let A = null; // running player animation
  function fuse(key) {
    if (A) return;
    const g = groups().find(x => x.key === key);
    if (!g || !fusable(g)) { sound.deny(); render(); return; }
    const nx = nextMut(g.mut), cost = fuseCost(g.id, nx, g.w);
    if (S.cash < cost) { sound.deny(); game.toast('Not enough cash!', 'red'); return; }
    S.cash -= cost;
    let res = nx, lucky = false;
    if (Math.random() < LUCKY && nextMut(nx) !== null) { res = nextMut(nx); lucky = true; }
    const P = myPlot(), use = g.idx.slice(0, 3);
    let stored = 0;
    for (const i of use) { stored += P.pedestals[i].stored || 0; game.setPed(P, i, null); game.pedToSave(i); }
    if (stored >= 1) { S.cash += Math.floor(stored); S.total += Math.floor(stored); }
    const dest = Math.min(...use);
    game.setPed(P, dest, { id: g.id, mut: res, w: g.w }); game.pedToSave(dest);
    P.pedestals[dest].group.visible = false; // revealed when the result lands
    const entry = S.index[g.id] || (S.index[g.id] = {}), ik = res || 'n', fresh = !entry[ik];
    entry[ik] = 1;
    st.fusions++; if (lucky) st.lucky++;
    game.save();
    bus.emit('fuse', game.player, { id: g.id, mut: res, w: g.w }, lucky);
    game.closePanels();
    // start the show
    const inputs = hoppers.map((h, k) => {
      const m = game.makeCreature(C.CREATURE_BY_ID[g.id], g.mut); m.position.copy(h.top); m.scale.setScalar(0.01); game.scene.add(m);
      return { m, h, done: false, k };
    });
    A = { t: 0, id: g.id, from: g.mut, res, w: g.w, lucky, fresh, dest, inputs, out: null, banged: false, popped: false, flying: false, hum: false };
    coreMat.emissive.setHex(mutColor(res)); coreShell.material.color.setHex(mutColor(res));
    sound.buy();
  }

  const _a = new V3(), _b = new V3(), _c = new V3(), _core = W(0, 2.35, 0);
  const ease = k => k * k * (3 - 2 * k);
  const backOut = k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
  const nearPlayer = (r = 60) => Math.hypot(game.player.pos.x - MX, game.player.pos.z - MZ) < r;
  function runAnim(dt) {
    const t = (A.t += dt), et = game.clock.elapsedTime;
    // 1) suck in: pop above each hopper, drop into the funnel, slide down the pipe into the core
    for (const s of A.inputs) {
      if (s.done) continue;
      const k = (t - s.k * 0.2) / 1.15;
      if (k < 0) continue;
      const m = s.m;
      if (k < 0.25) { const u = k / 0.25; m.position.copy(s.h.top); m.position.y += 0.6 * Math.sin(u * Math.PI); m.scale.setScalar(0.9 * backOut(u)); }
      else if (k < 0.5) { const u = ease((k - 0.25) / 0.25); m.position.lerpVectors(s.h.top, s.h.funnel, u); m.scale.setScalar(0.9 - 0.4 * u); }
      else if (k < 0.75) { const u = (k - 0.5) / 0.25; m.position.lerpVectors(s.h.funnel, s.h.wall, u); m.scale.setScalar(0.5 - 0.15 * u); }
      else if (k < 1) { const u = (k - 0.75) / 0.25; m.position.lerpVectors(s.h.wall, _core, u); m.scale.setScalar(0.35 * (1 - u) + 0.01); }
      else { s.done = true; game.scene.remove(m); fx.sparkle(_core, mutColor(A.from) ?? 0xffffff, 14); if (nearPlayer()) sound.tone(500 + s.k * 160, 0.12, { type: 'triangle', vol: 0.12, slide: 400 }); continue; }
      m.rotation.y += dt * 10; game.animateCreature(m, et, s.k);
      if (Math.random() < 0.5) fx.glow.emit(m.position.x, m.position.y, m.position.z, rand(-1, 1), rand(-0.5, 1), rand(-1, 1), { color: 0xff8ae6, size: rand(0.2, 0.4), life: 0.4, drag: 2 });
    }
    // 2) spin up
    if (t > T_SUCK && !A.hum) {
      A.hum = true;
      if (nearPlayer()) {
        sound.tone(90, T_BANG - T_SUCK + 0.1, { type: 'sawtooth', vol: 0.12, slide: 520, lp: 1600, attack: 0.3 });
        sound.tone(180, T_BANG - T_SUCK + 0.1, { type: 'square', vol: 0.05, slide: 1100, lp: 2400, attack: 0.4 });
        sound.hiss(T_BANG - T_SUCK, { vol: 0.12, freq: 400, sweep: 3600, attack: 0.5 });
      }
    }
    // 3) bang
    if (t > T_BANG && !A.banged) {
      A.banged = true;
      const col = mutColor(A.res), top = _a.set(MX, 2.4 * SC, MZ);
      fx.burst(top, col, game.lowQ ? 40 : 80); fx.burst(top, 0xffffff, game.lowQ ? 15 : 30);
      fx.ring(_b.set(MX, 0.3, MZ), col, 6, 0.6, true); fx.ring(_b.set(MX, 2.4 * SC, MZ), 0xffffff, 5, 0.35);
      fx.smoke(_b.set(MX, 3.5 * SC, MZ), game.lowQ ? 8 : 16);
      if (nearPlayer(45)) { juice.flash(A.lucky ? 0.6 : 0.4, col); game.addShake(0.35); juice.aberr(0.5); }
      if (nearPlayer()) { sound.bonk(true); sound.tone(70, 0.6, { type: 'sine', vol: 0.4, slide: -30 }); sound.hiss(0.5, { vol: 0.35, freq: 900, sweep: -600 }); }
      // the result pops out of the top
      const m = game.makeCreature(C.CREATURE_BY_ID[A.id], A.res); m.position.set(MX, 3.2 * SC, MZ); m.scale.setScalar(0.01); game.scene.add(m); A.out = m;
      if (A.lucky) { game.bigText('🍀 LUCKY FUSION! 🍀', `Skipped a tier → ${game.displayName(A.id, A.res, A.w)}`); sound.newCreature(5); }
      game.float(game.displayName(A.id, A.res, A.w) + '!', _b.set(MX, 6.5, MZ), '#' + new THREE.Color(col).getHexString());
    }
    const m = A.out;
    if (m && t < T_POP) {
      const u = clamp((t - T_BANG) / 0.6, 0, 1);
      m.position.set(MX, 3.2 * SC + 4 * backOut(u), MZ); m.scale.setScalar(Math.max(0.01, 1.5 * backOut(u)));
      m.rotation.y += dt * 4; game.animateCreature(m, et, 1);
      if (Math.random() < 0.6) fx.glow.emit(MX + rand(-1, 1), m.position.y + rand(0, 2), MZ + rand(-1, 1), 0, rand(1, 3), 0, { color: Math.random() < 0.5 ? 0xffffff : mutColor(A.res), size: rand(0.2, 0.5), life: 0.7, drag: 1 });
    }
    // 4) fly home onto the pedestal
    if (m && t >= T_POP) {
      const ped = myPlot().pedestals[A.dest];
      if (!A.flying) { A.flying = true; A.from3 = m.position.clone(); if (nearPlayer()) sound.whoosh(); }
      const u = clamp((t - T_POP) / (T_LAND - T_POP), 0, 1), e = ease(u);
      _c.copy(ped.pos); _c.y = (ped.pos.y || 0) + 0.88;
      m.position.lerpVectors(A.from3, _c, e); m.position.y += Math.sin(u * Math.PI) * 12;
      m.scale.setScalar(1.5 - 0.25 * e); m.rotation.y += dt * 8; game.animateCreature(m, et, 1);
      for (let i = 0; i < (game.lowQ ? 1 : 3); i++) fx.glow.emit(m.position.x, m.position.y + 0.8, m.position.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), { color: i ? mutColor(A.res) : 0xffffff, size: rand(0.3, 0.6), life: 0.6, drag: 1.5 });
      if (u >= 1) land();
    }
  }
  function land() {
    const P = myPlot(), ped = P.pedestals[A.dest];
    game.scene.remove(A.out);
    ped.group.visible = A.dest < S.slots;
    const col = mutColor(A.res), rc = new THREE.Color(C.RARITIES[C.CREATURE_BY_ID[A.id].r].color).getHex();
    fx.burst(ped.pos, col, game.lowQ ? 30 : 60); fx.ring(ped.pos, col, 4, 0.5, true); fx.pillar(ped.pos, rc, game.lowQ ? 16 : 30, 1);
    sound.place();
    if (A.fresh) game.showNewCard(A.id, A.res, A.w);
    else game.float('+$' + game.fmt(game.income(A.id, A.res, A.w) * game.incMult()) + '/s', ped.pos, '#7dff9a');
    game.toast(`🧪 Fused into ${game.displayName(A.id, A.res, A.w)}!`, 'gold');
    coreMat.emissive.setHex(0xff3fd0); coreShell.material.color.setHex(0xff5ad8);
    A = null; hintT = 0;
  }
  function abortAnim() {
    if (!A) return;
    for (const s of A.inputs) game.scene.remove(s.m);
    if (A.out) game.scene.remove(A.out);
    const ped = myPlot().pedestals[A.dest]; ped.group.visible = A.dest < S.slots;
    A = null;
  }

  // ================================================================ bots use the machine too
  // A visiting bot is an idle bot whose route target is redirected to the machine (bots.js stays untouched).
  const origRoute = game.routeNext;
  game.routeNext = (a, tgt) => (a.isBot && a.ai.fuseGoal && a.ai.mode === 'idle') ? origRoute(a, a.ai.fuseGoal) : origRoute(a, tgt);
  let visit = null, visitT = rand(35, 70);
  function endVisit(ok) {
    const b = visit.b;
    delete b.ai.fuseGoal;
    if (b.ai.mode === 'idle') b.ai.t = rand(0.5, 2);
    if (ok) {
      // upgrade one of their creatures (mostly cheap ones; rainbow is very rare)
      const cands = [];
      b.plot.pedestals.forEach((p, i) => { if (i < 8 && p.creature && p.group.visible) { const nx = nextMut(p.creature.mut); if (nx && !(nx === 'rainbow' && Math.random() < 0.7)) cands.push(i); } });
      if (cands.length) {
        cands.sort((x, y) => TIERS.indexOf(b.plot.pedestals[x].creature.mut || '') - TIERS.indexOf(b.plot.pedestals[y].creature.mut || ''));
        const i = cands[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * cands.length)], c = b.plot.pedestals[i].creature, nx = nextMut(c.mut);
        game.setPed(b.plot, i, { id: c.id, mut: nx, w: c.w });
        const pp = b.plot.pedestals[i].pos;
        if (game.camera.position.distanceTo(pp) < 90) { fx.burst(pp, mutColor(nx), 30); fx.ring(pp, mutColor(nx), 3, 0.4, true); }
        if (nearPlayer(70)) game.toast(`🧪 ${b.name} fused a ${game.displayName(c.id, nx, c.w)}!`);
      }
    }
    visit = null; visitT = rand(70, 150);
  }
  function updateVisit(dt) {
    if (!visit) {
      if (A || (visitT -= dt) > 0) return;
      const cands = game.bots.filter(b => b.ai.mode === 'idle' && !b.carry && b.swept <= 0 && b.dead <= 0 && b.plot.contains(b.pos.x, b.pos.z)
        && b.plot.pedestals.some((p, i) => i < 8 && p.creature && nextMut(p.creature.mut)));
      if (!cands.length) { visitT = rand(0.5, 1.5); return; }
      const b = cands[Math.floor(Math.random() * cands.length)];
      visit = { b, phase: 'walk', t: 0, use: rand(3, 5), stand: new V3(MX + rand(-1.6, 1.6), 0, FRONT_Z - rand(0, 0.8)) };
      b.ai.fuseGoal = visit.stand; b.ai.t = 999; b.ai.pause = rand(0.4, 1.6); // a short "hmm, let's go fuse" moment
      return;
    }
    const b = visit.b; visit.t += dt;
    if (b.ai.mode !== 'idle' || b.swept > 0 || b.dead > 0 || b.carry) { endVisit(false); return; }
    if (visit.phase === 'walk') {
      if (visit.t > 40) { endVisit(false); return; }
      if (Math.hypot(b.pos.x - visit.stand.x, b.pos.z - visit.stand.z) < 1.3) { visit.phase = 'use'; visit.t = 0; }
    } else {
      b.yaw += (Math.atan2(MX - b.pos.x, MZ - b.pos.z) - b.yaw) * Math.min(1, dt * 6); b.obj.rotation.y = b.yaw;
      if (visit.t > visit.use) {
        _a.set(MX, 2.4 * SC, MZ);
        if (game.camera.position.distanceTo(_a) < 120) { fx.burst(_a, 0xff8ae6, game.lowQ ? 20 : 40); fx.ring(_b.set(MX, 0.3, MZ), 0xff8ae6, 5, 0.5, true); }
        if (nearPlayer(40)) { sound.bonk(true); sound.tone(80, 0.4, { type: 'sine', vol: 0.25, slide: -30 }); }
        endVisit(true);
      }
    }
  }

  // ================================================================ hints: tell the player once when a fusion becomes possible
  let hintT = 3, readyN = -1;
  function updateHints(dt) {
    if ((hintT -= dt) > 0) return; hintT = 2;
    const gs = groups().filter(fusable);
    if (gs.length !== readyN) {
      readyN = gs.length;
      sign.userData.draw(readyN
        ? [{ text: '🧪 FUSION MACHINE', color: '#ff7ae0', size: 54 }, { text: `✨ ${readyN} FUSION${readyN > 1 ? 'S' : ''} READY ✨`, color: '#5dff86', size: 32 }]
        : [{ text: '🧪 FUSION MACHINE', color: '#ff7ae0', size: 54 }, { text: '3 identical → 1 better creature', color: '#fff', size: 26 }]);
    }
    for (const g of gs) if (!st.hinted[g.key]) {
      st.hinted[g.key] = 1;
      game.toast(`🧪 You have 3× ${game.displayName(g.id, g.mut, g.w)} — fuse them at the Fusion Machine!`, 'gold');
      break;
    }
  }

  // ================================================================ idle animation
  let spin = 0, bubbleAcc = 0, steamAcc = 0;
  function animateMachine(dt) {
    const camD = Math.hypot(game.camera.position.x - MX, game.camera.position.z - MZ);
    root.visible = game.camera.position.z > -140 && camD < 260;
    if (!root.visible) return;
    const t = game.clock.elapsedTime;
    let want = 0;
    if (A) want = A.t < T_SUCK ? 0.25 : A.t < T_BANG ? clamp((A.t - T_SUCK) / (T_BANG - T_SUCK), 0.25, 1) : Math.max(0, 1 - (A.t - T_BANG) * 0.7);
    else if (visit && visit.phase === 'use') want = clamp(visit.t / visit.use, 0.2, 0.75);
    spin += (want - spin) * Math.min(1, dt * 4);
    const sp = 0.6 + spin * 14;
    rings[0].rotation.y += dt * sp; rings[1].rotation.y -= dt * sp * 1.3;
    core.rotation.y += dt * (0.8 + spin * 10); core.rotation.x += dt * (0.5 + spin * 6);
    core.position.y = 2.35 + Math.sin(t * 2) * 0.12;
    const pulse = 1 + Math.sin(t * (3 + spin * 20)) * (0.06 + spin * 0.12);
    core.scale.setScalar(pulse * (1 + spin * 0.35));
    coreShell.position.y = core.position.y; coreShell.rotation.y -= dt * (0.4 + spin * 6); coreShell.rotation.z += dt * 0.3;
    coreShell.scale.setScalar(1 + spin * 0.3 + Math.sin(t * 5) * 0.05);
    coreMat.emissiveIntensity = 1.6 + spin * 5;
    const lv = 1.9 + Math.sin(t * 1.3) * 0.12 + spin * 0.6;
    liquid.scale.set(1.0, lv, 1.0); liquid.position.y = 1.05 + lv / 2;
    liquidMat.emissiveIntensity = 1 + spin * 3;
    const ready = readyN > 0 && !A;
    floorMat.color.setHex(ready ? 0x5dff86 : 0xff5ad8);
    floorMat.opacity = 0.3 + Math.sin(t * (ready ? 5 : 2)) * 0.15 + spin * 0.4;
    floorRing.scale.setScalar(1 + spin * 0.15 + (ready ? Math.sin(t * 5) * 0.04 : 0));
    root.position.x = MX + (spin > 0.3 ? Math.sin(t * 61) * 0.05 * spin : 0); root.position.z = MZ + (spin > 0.3 ? Math.cos(t * 53) * 0.05 * spin : 0);
    if (camD > 75) return;
    // bubbles rising in the tube + steam from the stacks
    bubbleAcc += dt * (5 + spin * 45);
    while (bubbleAcc >= 1) {
      bubbleAcc--;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.8;
      fx.glow.emit(MX + Math.cos(a) * r * SC, 1.1 * SC, MZ + Math.sin(a) * r * SC, 0, rand(1.6, 3.2) * (1 + spin * 1.5), 0, { color: Math.random() < 0.6 ? 0xbff8ff : 0xff8ae6, size: rand(0.12, 0.28), life: rand(0.8, 1.2) / (1 + spin), drag: 0.2 });
    }
    steamAcc += dt * (1.2 + spin * 10);
    while (steamAcc >= 1) {
      steamAcc--;
      const s = stacks[Math.random() < 0.5 ? 0 : 1];
      fx.soft.emit(s.x, s.y, s.z, rand(-0.3, 0.3), rand(1.5, 3) * (1 + spin), rand(-0.3, 0.3), { color: 0xeef4ff, size: rand(0.4, 0.7), life: rand(0.8, 1.3), drag: 0.8, grow: 1.6 });
    }
  }

  // ================================================================ hooks
  bus.on('tick', dt => {
    if (A) runAnim(dt);
    updateVisit(dt);
    updateHints(dt);
    animateMachine(dt);
  });
  bus.on('travel', () => {
    ensureCollider();
    abortAnim();
    if (visit) endVisit(false);
    readyN = -1; hintT = 0.5;
  });
  // debugging handle
  window.__fusion = { groups, fuse, get anim() { return A; }, get visit() { return visit; }, forceVisit() { visitT = 0; }, st };
}
