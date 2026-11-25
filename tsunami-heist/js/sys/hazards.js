// hazards system — extra track mechanics that make runs varied and skill-based:
//   Jump pads (launch up + along your heading), Currents (water strips pushing along z),
//   Geysers (bubble 1.2 s, then erupt: launch + knock creatures loose),
//   Rolling barrels / boulders (cross the track on a timer, telegraphed lane + rumble),
//   Crumbling tiles (deep zones: shake, fall away for a few seconds, respawn).
// Layout is deterministic per world+zone (seeded RNG) and scales with zone index and WORLDS[w].haz.
// Everything affects player and bots (applied in tick); bots get human-ish jump timing via a moveActor wrapper.
export default function init(game, bus) {
  const { THREE, C, world } = game;
  const st = bus.state('hazards', { seen: {} });
  const TH = C.TRACK_HALF;
  const PITCH = 3.6, TILE = 3.48;          // crumbling tile grid
  const PAD_VY = 17, PAD_PUSH = 13, PAD_R = 1.65;
  const BUBBLE = 1.2, ERUPT = 1.0;
  const FALLEN = 3.2, RISE = 0.6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------ shared materials / textures (never disposed: not flagged userData.track)
  const canvasTex = (w, h, draw) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const curTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = 'rgba(28,150,235,0.62)'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(170,235,255,0.55)'; x.lineWidth = 3;
    for (let i = 0; i < 4; i++) { x.beginPath(); for (let y = 0; y <= h; y += 8) x.lineTo(16 + i * 32 + Math.sin(y / h * Math.PI * 4 + i) * 5, y); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 10; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(28, 84); x.lineTo(64, 46); x.lineTo(100, 84); x.stroke(); // chevron pointing to +v
  });
  const stripeTex = canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff9a2a';
    for (let i = -2; i < 4; i++) { x.beginPath(); x.moveTo(i * 32, h); x.lineTo(i * 32 + 16, h); x.lineTo(i * 32 + 16 + h, 0); x.lineTo(i * 32 + h, 0); x.fill(); }
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, 4); x.fillRect(0, h - 4, w, 4);
  });
  const crackTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const g = 170 + Math.random() * 70 | 0; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    x.strokeStyle = '#3a3a3a'; x.lineWidth = 2.5;
    for (let k = 0; k < 5; k++) { x.beginPath(); let px = w / 2 + rand(-10, 10), py = h / 2 + rand(-10, 10); x.moveTo(px, py); const a = rand(0, 6.28); for (let s = 0; s < 6; s++) { px += Math.cos(a + rand(-0.7, 0.7)) * 13; py += Math.sin(a + rand(-0.7, 0.7)) * 13; x.lineTo(px, py); } x.stroke(); }
    x.strokeStyle = '#555'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  });
  const M = {
    padBase: new THREE.MeshStandardMaterial({ color: 0x3c4250, roughness: 0.35, metalness: 0.6 }),
    padTop: new THREE.MeshBasicMaterial({ color: 0x6dff5a }),
    arrow: new THREE.MeshBasicMaterial({ color: 0x9dff7a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    current: new THREE.MeshBasicMaterial({ map: curTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    pool: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    column: new THREE.MeshStandardMaterial({ color: 0xdff6ff, emissive: 0x4ab8ff, emissiveIntensity: 0.35, transparent: true, opacity: 0.78, depthWrite: false, roughness: 0.2 }),
    barrel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    boulder: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }),
    strip: new THREE.MeshBasicMaterial({ map: stripeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    tile: new THREE.MeshStandardMaterial({ map: crackTex, roughness: 0.85 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x07030e }),
  };
  curTex.repeat.set(1, 1);

  // ------------------------------------------------ helpers
  let seed = 1;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rr = (a, b) => a + rnd() * (b - a);
  const dummy = new THREE.Object3D();
  const setM = (m, i, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
  };
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  const BIOME = {
    rim: { beach: 0x9a8a72, tidepools: 0x7e7468, reef: 0xe58a7a, jungle: 0x5a6a48, volcano: 0x2e2426, glacier: 0xcfe8f5, abyss: 0x5a4a88 },
    pool: { volcano: 0xff6a2a, abyss: 0x8a5aff },
    boulder: { volcano: 0x3a2e2c, glacier: 0xf2f8ff, abyss: 0x7a5ab8, jungle: 0x7a7268 },
    tile: { volcano: 0xc09a84, glacier: 0xcfeeff, abyss: 0xc8b4f0 },
  };
  const near = (x, z, d) => { const c = game.camera.position; return (c.x - x) ** 2 + (c.z - z) ** 2 < d * d; };
  const playerNear = (x, z, d) => { const p = game.player.pos; return p.z < 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < d * d; };
  const snd = game.sound;

  // ------------------------------------------------ layout
  let L = null, T = 0;
  const AS = new Map(); // actor -> per-actor hazard state
  const S = a => { let s = AS.get(a); if (!s) AS.set(a, s = { padT: 0, padDir: 0, padCd: 0, cd: 0, key: null, jumpAt: -1, holeKey: null }); return s; };

  function plan(w) {
    const Wd = C.WORLDS[w], H = Wd.haz, hz = game.hz;
    const out = { w, pads: [], currents: [], geysers: [], lanes: [], patches: [], tiles: [] };
    const occ = [];
    const pillars = world.colliders.filter(c => c.pillar);
    const SL = C.SHELTER_LEN;
    const zFree = (za, zb, xa = -TH, xb = TH, soft = false) => {
      if (zb > C.ZONE_START - 8 || za < C.TRACK_END + 16) return false;
      for (const zc of C.SHELTER_ZS) if (za < zc + SL / 2 + 9 && zb > zc - SL / 2 - 9) return false; // never block shelters / their entrance
      for (const Z of C.ZONES) if (za < Z.z0 + 9 && zb > Z.z0 - 9) return false;                  // nor zone gates
      const ov = (a0, a1, m) => za < a1 + m && zb > a0 - m;
      for (const h of hz.hurdles) if (!soft && ov(h.minZ, h.maxZ, 3)) return false;
      for (const h of hz.lava) if (ov(h.minZ, h.maxZ, 3)) return false;
      for (const h of hz.pits) if (ov(h.minZ, h.maxZ, 3)) return false;
      if (!soft) for (const p of hz.pendulums) if (ov(p.z, p.z, 3.5)) return false;
      if (!soft) for (const c of hz.crabs) if (ov(c.z, c.z, 3.5)) return false;
      for (const o of occ) if (ov(o[0], o[1], soft ? 2 : 4)) return false;
      for (const s of hz.slow) if (ov(s.minZ, s.maxZ, 1) && xa < s.maxX + 1 && xb > s.minX - 1) return false;
      for (const c of pillars) if (ov(c.minZ, c.maxZ, 1.5) && xa < c.maxX + 1.5 && xb > c.minX - 1.5) return false;
      for (const p of game.pads) if (ov(p.z, p.z, 3) && xa < p.x + 3 && xb > p.x - 3) return false;
      return true;
    };
    const badGround = (x, z) => game.lavaAt(x, z) || !!game.pitAt(x, z);
    const landingOk = (x, z) => { for (const s of [-1, 1]) for (let d = 12; d <= 32; d += 1) if (badGround(x, z + s * d)) return false; return true; };

    const place = (k, z, d, Z, gentle) => {
      const zi = Z.i;
      if (k === 'pad') {
        const x = rr(-12, 12);
        if (!zFree(z - 2, z + 2, x - 2, x + 2) || !landingOk(x, z)) return false;
        out.pads.push({ x, z, sq: 0, bob: rr(0, 6) }); occ.push([z - 2, z + 2]); return true;
      }
      if (k === 'current') {
        const len = Math.min(26, rr(10, 14 + d * 1.2)), wid = Math.min(20, rr(8, 11 + d * 0.8));
        const x = rr(-TH + wid / 2 + 1, TH - wid / 2 - 1);
        if (!zFree(z - len / 2, z + len / 2, x - wid / 2, x + wid / 2, true)) return false;
        // keep currents away from lava / pits so bots braking for a jump can't be held in place
        for (let zz = z - len / 2 - 14; zz < z + len / 2 + 14; zz += 1) if (badGround(x, zz)) return false;
        out.currents.push({ minX: x - wid / 2, maxX: x + wid / 2, minZ: z - len / 2, maxZ: z + len / 2, dir: rnd() < 0.5 ? 1 : -1, push: gentle ? 4.5 : 5 + Math.min(2.5, d * 0.25) });
        occ.push([z - len / 2, z + len / 2]); return true;
      }
      if (k === 'geyser') {
        const n = gentle ? 1 : d >= 4 ? (rnd() < 0.5 ? 2 : 3) : d >= 2 ? (rnd() < 0.5 ? 1 : 2) : 1;
        const slots = [-13, -7.5, -2, 3.5, 9, 13].sort(() => rnd() - 0.5).slice(0, n).map(x => x + rr(-1, 1));
        const xa = Math.min(...slots), xb = Math.max(...slots);
        if (!zFree(z - 2.5, z + 2.5, xa - 2.5, xb + 2.5)) return false;
        const P = clamp(rr(4.2, 6.2) - d * 0.18, 2.9, 7) + (gentle ? 1.5 : 0);
        const ph0 = rr(0, P);
        slots.forEach((x, k2) => out.geysers.push({ x, z: z + rr(-1, 1), P, ph: ph0 + k2 * (P / n) * rr(0.6, 1), st: 0, ringT: 0, biome: Z.biome }));
        occ.push([z - 2.5, z + 2.5]); return true;
      }
      if (k === 'lane') {
        const twin = d >= 5 && rnd() < 0.35;
        const za = twin ? z - 5.4 : z - 1.8;
        if (!zFree(za, z + 1.8)) return false;
        const kind = ['volcano', 'glacier', 'abyss', 'tidepools'].includes(Z.biome) ? 'boulder' : 'barrel';
        const mk = (lz, dir, ph) => {
          const speed = Math.min(27, 12 + d * 1.3 + rr(0, 3)), warn = Math.max(0.95, 1.35 - d * 0.04);
          const tr = (2 * TH + 3) / speed;
          const P = warn + tr + Math.max(1.2, rr(2.5, 5) - d * 0.2);
          out.lanes.push({ z: lz, dir, speed, warn, tr, P, ph: ph ?? rr(0, P), kind, biome: Z.biome, st: 0, x: 0, R: kind === 'barrel' ? 0.9 : 1.0 });
        };
        const dir = rnd() < 0.5 ? 1 : -1;
        mk(z, dir);
        if (twin) mk(z - 3.6, -dir);
        occ.push([za, z + 1.8]); return true;
      }
      if (k === 'tiles') {
        const rows = 1 + (rnd() < Math.min(0.7, d * 0.08) ? 1 : 0) + (d >= 8 && rnd() < 0.3 ? 1 : 0);
        const cols = Math.min(7, 3 + Math.floor(rr(0, 2 + d * 0.3)));   // ≤ 7 tiles: always ≥ 10 m of solid ground beside a patch
        const wdt = cols * PITCH, dep = rows * PITCH;
        const x0 = rr(-TH + 0.4, TH - 0.4 - wdt), z0 = z - dep / 2;
        if (!zFree(z0, z0 + dep, x0, x0 + wdt)) return false;
        const shake = Math.max(0.45, 0.75 - d * 0.03);
        out.patches.push({ x0, z0, x1: x0 + wdt, z1: z0 + dep, cols, rows, base: out.tiles.length, shake, biome: Z.biome });
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.tiles.push({ x: x0 + (c + 0.5) * PITCH, z: z0 + (r + 0.5) * PITCH, s: 0, t: 0, cyc: 0, shake, biome: Z.biome });
        occ.push([z0, z0 + dep]); return true;
      }
      return false;
    };

    C.ZONES.forEach((Z0, zi) => {
      const Z = { ...Z0, i: zi };
      seed = (12345 + w * 7919 + zi * 104729 + 0x51ed) | 0;
      const d = zi + w * 0.9;
      const gentle = w === 0 && zi <= 1;
      const water = ['beach', 'tidepools', 'reef', 'jungle', 'glacier'].includes(Z.biome);
      const types = [];
      const wt = (k, v) => { if (v > 0) types.push([k, v]); };
      wt('pad', 2);
      wt('current', water ? (zi <= 2 ? 2.4 : 1.6) : 0);
      wt('geyser', w === 0 && zi === 0 ? 0 : 1.3 + d * 0.08);
      wt('lane', d >= 2 ? 1.6 + d * 0.12 : 0);
      const tileFrom = w === 0 ? 5 : w === 1 ? 4 : 3;
      wt('tiles', zi >= tileFrom ? 2.2 + (zi - tileFrom) * 0.4 : 0);
      const tot = types.reduce((s, t) => s + t[1], 0);
      const pick = () => { let r = rnd() * tot; for (const t of types) { r -= t[1]; if (r <= 0) return t[0]; } return types[0][0]; };
      const spacing = Math.max(24, 58 - zi * 5 - w * 2.5) / H;
      const maxN = gentle ? (zi === 0 ? 2 : 3) : 999;
      let n = 0;
      for (let z = Z.z0 - 14 - rr(0, spacing * 0.5); z > Z.z1 + 10 && n < maxN; z -= rr(spacing * 0.7, spacing * 1.3)) {
        const k = pick();
        for (const dz of [0, -3, 3, -6, 6, -10, 10]) {
          const zz = z + dz; if (zz > Z.z0 - 8 || zz < Z.z1 + 8) continue;
          if (place(k, zz, d, Z, gentle)) { n++; break; }
        }
      }
    });
    return out;
  }

  // ------------------------------------------------ meshes (fresh geometries per build, inside world.trackRoot)
  function buildMeshes(lay) {
    const g = new THREE.Group(); g.name = 'hazards';
    const insts = [];
    const inst = (geo, mat, n, cast = false) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
      g.add(m); insts.push(m); return m;
    };
    const hidden = (m, n) => { for (let i = 0; i < n; i++) setM(m, i, 0, -50, 0, 0); };
    const R = {};
    // jump pads
    const nP = lay.pads.length;
    if (nP) {
      R.padBase = inst(new THREE.CylinderGeometry(1.75, 1.95, 0.2, 22).translate(0, 0.1, 0), M.padBase, nP, true);
      R.padTop = inst(new THREE.CylinderGeometry(1.35, 1.35, 0.1, 22).translate(0, 0.05, 0), M.padTop, nP);
      R.arrow = inst(new THREE.ConeGeometry(0.6, 0.85, 4).rotateY(Math.PI / 4), M.arrow, nP * 2);
      lay.pads.forEach((p, i) => { setM(R.padBase, i, p.x, 0, p.z); setM(R.padTop, i, p.x, 0.2, p.z); });
      hidden(R.arrow, nP * 2);
    }
    // currents: one merged quad mesh, uv in world metres (4 m per chevron), v flipped by direction
    if (lay.currents.length) {
      const pos = [], uv = [], idx = [];
      for (const c of lay.currents) {
        const b = pos.length / 3, s = c.dir;
        const pts = [[c.minX, c.minZ], [c.maxX, c.minZ], [c.maxX, c.maxZ], [c.minX, c.maxZ]];
        for (const [x, z] of pts) { pos.push(x, 0.07, z); uv.push(x / 4, s * z / 4); }
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, M.current); m.receiveShadow = false; m.renderOrder = 1; g.add(m); R.current = m;
    }
    // geysers
    const nG = lay.geysers.length;
    if (nG) {
      R.rim = inst(new THREE.TorusGeometry(1.45, 0.45, 6, 14).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.08, 0), M.rim, nG, true);
      R.pool = inst(new THREE.CircleGeometry(1.35, 18).rotateX(-Math.PI / 2).translate(0, 0.09, 0), M.pool, nG);
      R.column = inst(new THREE.CylinderGeometry(0.7, 1.05, 1, 14, 1, true).translate(0, 0.5, 0), M.column, nG);
      lay.geysers.forEach((q, i) => {
        setM(R.rim, i, q.x, 0, q.z, 1, 1, 1, 0, i, 0); R.rim.setColorAt(i, tmpC.setHex(BIOME.rim[q.biome] ?? 0x8a7d70));
        setM(R.pool, i, q.x, 0, q.z); R.pool.setColorAt(i, tmpC.setHex(BIOME.pool[q.biome] ?? 0x2a7ac0));
        q.pool = BIOME.pool[q.biome] ?? 0x2a7ac0;
      });
      hidden(R.column, nG);
    }
    // rolling barrels / boulders + their lane markers
    const lanes = lay.lanes;
    if (lanes.length) {
      R.strip = inst(new THREE.PlaneGeometry(TH * 2, 2.6).rotateX(-Math.PI / 2).translate(0, 0.06, 0), M.strip, lanes.length);
      { const uv = R.strip.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 12); }
      lanes.forEach((l, i) => { setM(R.strip, i, 0, 0, l.z); R.strip.setColorAt(i, tmpC.setRGB(0.15, 0.15, 0.15)); });
      const nb = lanes.filter(l => l.kind === 'barrel').length, nr = lanes.length - nb;
      if (nb) {
        const geo = new THREE.CylinderGeometry(0.9, 0.9, 2.0, 16, 10).rotateX(Math.PI / 2);
        const p = geo.attributes.position, col = [];
        for (let i = 0; i < p.count; i++) { const z = Math.abs(p.getZ(i)), r = Math.hypot(p.getX(i), p.getY(i)); const band = (z > 0.5 && z < 0.7) || (z > 0.92 && r > 0.6); const c = band ? [0.28, 0.29, 0.31] : z > 0.99 ? [0.45, 0.28, 0.15] : [0.62, 0.36, 0.18]; col.push(...c); }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        R.barrel = inst(geo, M.barrel, nb, true); hidden(R.barrel, nb);
      }
      if (nr) { R.boulder = inst(new THREE.IcosahedronGeometry(1.0, 1).scale(1.05, 0.95, 1), M.boulder, nr, true); hidden(R.boulder, nr); }
      let bi = 0, ri = 0;
      for (const l of lanes) {
        if (l.kind === 'barrel') l.mi = bi++;
        else { l.mi = ri++; R.boulder.setColorAt(l.mi, tmpC.setHex(BIOME.boulder[l.biome] ?? 0x8a8070)); }
      }
    }
    // crumbling tiles + the holes they leave
    const nT = lay.tiles.length;
    if (nT) {
      R.tile = inst(new THREE.BoxGeometry(TILE, 0.3, TILE), M.tile, nT, false);
      R.hole = inst(new THREE.PlaneGeometry(PITCH + 0.05, PITCH + 0.05).rotateX(-Math.PI / 2), M.hole, nT);
      lay.tiles.forEach((t, i) => { t.col = BIOME.tile[t.biome] ?? 0xc8b48a; setM(R.tile, i, t.x, -0.06, t.z); R.tile.setColorAt(i, tmpC.setHex(t.col)); });
      hidden(R.hole, nT);
    }
    for (const m of insts) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    lay.R = R; lay.insts = insts; lay.group = g; lay.active = new Set();
    world.trackRoot.add(g);
  }

  function build() {
    if (L) { for (const m of L.insts) m.dispose(); if (L.group.parent) { L.group.parent.remove(L.group); L.group.traverse(o => o.geometry?.dispose()); } }
    L = plan(C.WORLD);
    buildMeshes(L);
    AS.clear();
  }
  bus.on('boot', () => { if (!L || L.w !== C.WORLD || L.group.parent !== world.trackRoot) build(); });
  bus.on('travel', () => build());

  // ------------------------------------------------ effects on actors
  const knock = (a, kx, kz, vy, stun, msg) => {
    const s = S(a);
    a.kb.set(kx, 0, kz); a.vy = vy; a.onGround = false; a.pos.y = Math.max(a.pos.y, 0.05); a.stun = Math.max(a.stun, stun); s.cd = 1.1;
    const lost = game.dropCarry(a, 'hit');
    if (a === game.player) {
      game.addShake(0.45); game.fx.hit(a.pos, 0xffffff);
      if (lost) game.toast(`${msg} You dropped ${game.displayName(lost.id, lost.mut, lost.w)}`, 'red');
    }
    return lost;
  };
  function padLaunch(a, p) {
    const s = S(a);
    const dir = Math.abs(a.vel.z) > 2 ? Math.sign(a.vel.z) : 0;
    a.vy = PAD_VY; a.onGround = false; a.pos.y = Math.max(a.pos.y, 0.05);
    s.padT = 1.3; s.padDir = dir; s.padCd = 0.6; p.sq = 1;
    if (near(p.x, p.z, 60)) { game.fx.ring({ x: p.x, y: 0.3, z: p.z }, 0x8aff6a, 3.2, 0.4, true); game.fx.jumpPuff(a.pos, 0xb8ffa0, game.lowQ ? 3 : 6); }
    if (a === game.player) { snd.jump(); snd.whoosh(); snd.tone(330, 0.25, { type: 'triangle', vol: 0.12, slide: 500 }); game.addShake(0.12); }
    else if (playerNear(p.x, p.z, 25)) snd.whoosh();
  }

  function actorEffects(a, dt) {
    const s = S(a);
    s.cd = Math.max(0, s.cd - dt); s.padCd = Math.max(0, s.padCd - dt);
    if (a.swept > 0 || a.dead > 0) { s.padT = 0; return; }
    const x = a.pos.x, z = a.pos.z, y = a.pos.y;
    // jump-pad flight: carried forward along the launch heading until touchdown
    if (s.padT > 0) {
      s.padT -= dt;
      if (a.onGround && s.padT < 1.2) s.padT = 0;
      else if (s.padDir) a.pos.z = Math.min(-1.2, a.pos.z + s.padDir * PAD_PUSH * dt);
    }
    if (z > -1) return;
    const grounded = a.onGround && y > -0.1;
    // pads
    if (s.padCd <= 0 && y < 0.5) for (const p of L.pads) { if (Math.abs(p.z - z) < PAD_R && (p.x - x) ** 2 + (p.z - z) ** 2 < PAD_R * PAD_R) { padLaunch(a, p); break; } }
    // currents
    if (grounded) for (const c of L.currents) if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) { a.pos.z += c.dir * c.push * dt; break; }
    // geysers
    if (s.cd <= 0) for (const q of L.geysers) {
      if (q.st !== 2 || q.tl > ERUPT * 0.75 || Math.abs(q.z - z) > 1.9) continue;
      if ((q.x - x) ** 2 + (q.z - z) ** 2 < 1.9 * 1.9 && y < 6) {
        knock(a, rand(-3, 3), rand(-3, 3), 20, 0.45, '💦 Geyser!');
        if (a === game.player) { snd.hiss(0.6, { vol: 0.3, freq: 2500, type: 'highpass' }); snd.bonk(false); }
        break;
      }
    }
    // rolling barrels / boulders
    if (s.cd <= 0) for (const l of L.lanes) {
      if (l.st !== 2 || Math.abs(l.z - z) > 1.55 || Math.abs(l.x - x) > l.R + 0.5 || y > l.R * 1.6) continue;
      knock(a, l.dir * 19, Math.sign(z - l.z || 1) * 5, 7.5, 0.85, l.kind === 'barrel' ? '🛢️ Flattened by a barrel!' : '🪨 Boulder hit!');
      if (a === game.player) snd.bonk(false);
      break;
    }
    // crumbling tiles
    if (grounded || (y <= 0.05 && y > -0.6)) for (const P of L.patches) {
      if (x < P.x0 || x > P.x1 || z < P.z0 || z > P.z1) continue;
      const c = Math.min(P.cols - 1, Math.floor((x - P.x0) / PITCH)), r = Math.min(P.rows - 1, Math.floor((z - P.z0) / PITCH));
      const ti = P.base + r * P.cols + c, t = L.tiles[ti];
      if (t.s === 0 && grounded) {
        t.s = 1; t.t = 0; L.active.add(ti);
        if (playerNear(t.x, t.z, 30)) { snd.hiss(0.25, { vol: 0.18, freq: 900, q: 1.5 }); snd.tone(120, 0.2, { type: 'square', vol: 0.06, lp: 400 }); }
      } else if (t.s >= 2 && Math.abs(x - t.x) < PITCH / 2 - 0.3 && Math.abs(z - t.z) < PITCH / 2 - 0.3) {
        a.pos.y = -0.65; a.onGround = false; a.vy = Math.min(a.vy, -3); // through the hole -> moveActor lets them fall -> 'fall' kill
      }
      break;
    }
  }

  // ------------------------------------------------ bots: human-ish reactions to barrels and holes
  const holeAt = (x, z) => {
    for (const P of L.patches) {
      if (x < P.x0 || x > P.x1 || z < P.z0 || z > P.z1) continue;
      const c = Math.min(P.cols - 1, Math.floor((x - P.x0) / PITCH)), r = Math.min(P.rows - 1, Math.floor((z - P.z0) / PITCH));
      const ti = P.base + r * P.cols + c, t = L.tiles[ti];
      return t.s >= 2 || (t.s === 1 && t.t > t.shake - 0.3) ? ti * 1000 + t.cyc : -1;
    }
    return -1;
  };
  function botJump(b, dx, dz) {
    const s = S(b), sl = b.personality?.sloppy ?? 0.3;
    const skill = clamp(0.82 - sl * 0.7 + Math.min(0.12, b.speedLv * 0.003), 0.4, 0.85);
    // barrels: time the jump so the barrel passes under the apex (or flub it)
    for (let i = 0; i < L.lanes.length; i++) {
      const l = L.lanes[i];
      if (l.st === 0 || Math.abs(l.z - b.pos.z) > 8) continue;
      const xs = -l.dir * (TH - 1.1);
      const tb = l.st === 1 ? (l.warn - l.tl) + (b.pos.x - xs) * l.dir / l.speed : (b.pos.x - l.x) * l.dir / l.speed;
      if (tb < 0 || tb > 1.1) continue;
      if (Math.abs(b.pos.z - l.z) > 1.7 + Math.abs(b.vel.z) * tb) continue;
      const key = i * 1e5 + Math.floor((T + l.ph) / l.P);
      if (s.key !== key) {
        s.key = key;
        const r = Math.random();
        s.jumpAt = r < skill ? 0.32 + rand(-0.06, 0.06) : r < skill + (1 - skill) * 0.4 ? -1 : Math.random() < 0.5 ? rand(0.6, 0.85) : rand(0.05, 0.12);
      }
      if (s.jumpAt > 0 && tb <= s.jumpAt) { s.jumpAt = -1; return true; }
      return false;
    }
    // holes / about-to-fall tiles straight ahead
    const l = Math.hypot(dx, dz); if (l < 0.2 || !L.patches.length) return false;
    const ux = dx / l, uz = dz / l, sp = Math.hypot(b.vel.x, b.vel.z);
    const reach = 0.7 + sp * 0.045 + 0.4;
    for (let d = 0.4; d <= reach; d += 0.4) {
      const k = holeAt(b.pos.x + ux * d, b.pos.z + uz * d);
      if (k < 0) continue;
      if (s.holeKey !== k) { s.holeKey = k; s.holeJump = Math.random() < skill + 0.1; }
      return d > reach - 0.8 && s.holeJump;
    }
    return false;
  }
  const origMove = game.moveActor;
  game.moveActor = function (a, dx, dz, dt, jump, faceYaw) {
    if (L && a.isBot && !jump && a.onGround && a.pos.z < -1 && (dx || dz)) { try { jump = botJump(a, dx, dz); } catch (e) { console.error('[sys hazards] bot', e); } }
    return origMove.call(this, a, dx, dz, dt, jump, faceYaw);
  };

  // ------------------------------------------------ per-frame hazard simulation + visuals
  function update(dt) {
    const R = L.R, cz = game.camera.position.z, fx = game.fx, lowQ = game.lowQ;
    const vis = z => Math.abs(z - cz) < 190;
    // pads: bobbing arrows + squash on launch
    if (R.padTop) {
      let topDirty = false;
      L.pads.forEach((p, i) => {
        const v = vis(p.z);
        if (p.sq > 0) { p.sq = Math.max(0, p.sq - dt * 3); setM(R.padTop, i, p.x, 0.2 - p.sq * 0.12, p.z, 1 + p.sq * 0.15, 1, 1 + p.sq * 0.15); topDirty = true; }
        for (let k = 0; k < 2; k++) {
          const y = 1.4 + k * 0.75 + ((T * 1.6 + p.bob + k * 0.5) % 1) * 0.5;
          if (v) setM(R.arrow, i * 2 + k, p.x, y, p.z, 1, 0.8, 1); else setM(R.arrow, i * 2 + k, 0, -50, 0, 0);
        }
      });
      R.arrow.instanceMatrix.needsUpdate = true; if (topDirty) R.padTop.instanceMatrix.needsUpdate = true;
    }
    // currents: scrolling chevrons, a little foam
    if (R.current) {
      curTex.offset.y -= dt * 1.6;
      if (!lowQ) for (const c of L.currents) if (Math.abs((c.minZ + c.maxZ) / 2 - cz) < 70 && Math.random() < dt * 4) fx.dust({ x: rand(c.minX, c.maxX), y: 0, z: rand(c.minZ, c.maxZ) }, 0xd8f4ff);
    }
    // geysers
    if (R.column) {
      let colDirty = false;
      L.geysers.forEach((q, i) => {
        const tl = (T + q.ph) % q.P; q.tl = tl;
        const ns = tl < ERUPT ? 2 : tl > q.P - BUBBLE ? 1 : 0;
        const v = vis(q.z), close = v && near(q.x, q.z, 75);
        const prev = q.st;
        if (ns !== prev) {
          if (ns === 1 && close) { fx.ring({ x: q.x, y: 0.2, z: q.z }, 0xffffff, 2.4, 0.5, true); if (playerNear(q.x, q.z, 30)) snd.hiss(BUBBLE, { vol: 0.14, freq: 320, q: 3, sweep: 500, attack: 0.3 }); }
          if (ns === 2 && close) {
            fx.pillar({ x: q.x, y: 0.3, z: q.z }, q.biome === 'volcano' ? 0xffb07a : 0xbfeaff, lowQ ? 10 : 22, 0.9);
            if (playerNear(q.x, q.z, 35)) { const f = 1 - Math.hypot(game.player.pos.x - q.x, game.player.pos.z - q.z) / 40; snd.hiss(1.0, { vol: 0.35 * f, freq: 1400, q: 0.5, sweep: -900 }); snd.tone(90, 0.5, { type: 'sine', vol: 0.25 * f, slide: -40 }); }
          }
          q.st = ns;
        }
        if (q.colShown && (ns !== 2 || !v)) { setM(R.column, i, 0, -50, 0, 0); q.colShown = false; colDirty = true; }
        if (!v) return;
        // telegraph: pool flashes white while bubbling
        if (ns === 1) {
          const k = (tl - (q.P - BUBBLE)) / BUBBLE;
          tmpC.setHex(q.pool).lerp(tmpC2.setHex(0xffffff), (0.35 + 0.65 * Math.abs(Math.sin(T * (8 + k * 14)))) * (0.4 + 0.6 * k));
          R.pool.setColorAt(i, tmpC); R.pool.instanceColor.needsUpdate = true;
          if (close && Math.random() < dt * (lowQ ? 6 : 14)) fx.dust({ x: q.x + rand(-1, 1), y: 0, z: q.z + rand(-1, 1) }, 0xffffff);
          if (close && (q.ringT -= dt) < 0) { q.ringT = 0.35; fx.ring({ x: q.x, y: 0.15, z: q.z }, 0xff5a4a, 2.2, 0.3, true); }
        } else if (ns !== prev || ns === 2) { R.pool.setColorAt(i, tmpC.setHex(ns === 2 ? 0xffffff : q.pool)); R.pool.instanceColor.needsUpdate = true; }
        if (ns === 2) {
          const u = tl / ERUPT, h = u < 0.12 ? u / 0.12 * 9 : u < 0.7 ? 9 + Math.sin(T * 30 + i) * 0.4 : 9 * (1 - (u - 0.7) / 0.3);
          const wv = 1 + Math.sin(T * 25 + i) * 0.08;
          setM(R.column, i, q.x, 0, q.z, wv, Math.max(0.01, h), wv); q.colShown = true; colDirty = true;
          if (close && Math.random() < dt * 20) fx.dust({ x: q.x + rand(-0.8, 0.8), y: h * 0.8, z: q.z + rand(-0.8, 0.8) }, 0xffffff);
        }
      });
      if (colDirty) R.column.instanceMatrix.needsUpdate = true;
    }
    // rolling barrels / boulders
    if (R.strip) {
      let bDirty = false, rDirty = false;
      for (let i = 0; i < L.lanes.length; i++) {
        const l = L.lanes[i];
        const tl = (T + l.ph) % l.P; l.tl = tl;
        const ns = tl < l.warn ? 1 : tl < l.warn + l.tr ? 2 : 0;
        const edge = TH - 1.1;
        if (ns === 1) l.x = -l.dir * (TH + 1.6 - Math.min(1, tl / (l.warn * 0.4)) * 2.7);
        else if (ns === 2) l.x = -l.dir * edge + l.dir * l.speed * (tl - l.warn);
        const v = vis(l.z);
        if (ns !== l.st) {
          if (ns === 1 && playerNear(0, l.z, 45)) { const f = clamp(1 - Math.abs(game.player.pos.z - l.z) / 50, 0.2, 1); snd.tone(46, l.warn + 0.4, { type: 'sawtooth', vol: 0.16 * f, lp: 170, attack: 0.15 }); snd.hiss(l.warn + 0.3, { vol: 0.22 * f, freq: 160, type: 'lowpass', attack: 0.2 }); }
          if (ns === 2 && playerNear(l.x, l.z, 40)) snd.tone(70, 0.3, { type: 'sine', vol: 0.2, slide: -20 });
          l.st = ns;
        }
        if (!v) { if (l.shown) { setM(l.kind === 'barrel' ? R.barrel : R.boulder, l.mi, 0, -50, 0, 0); l.shown = false; if (l.kind === 'barrel') bDirty = true; else rDirty = true; } continue; }
        // lane marker: faint always, pulsing during the warning
        const k = ns === 1 ? 0.45 + 0.55 * Math.abs(Math.sin(T * 11)) : ns === 2 ? 0.55 : 0.13;
        R.strip.setColorAt(i, tmpC.setRGB(k, k, k));
        const m = l.kind === 'barrel' ? R.barrel : R.boulder;
        if (ns === 0 || Math.abs(l.x) > TH + 2.5) { if (l.shown) { setM(m, l.mi, 0, -50, 0, 0); l.shown = false; } }
        else {
          const wob = ns === 1 ? Math.sin(T * 40) * 0.06 : 0;
          if (l.kind === 'barrel') setM(m, l.mi, l.x, 0.9 + Math.abs(wob), l.z, 1, 1, 1, 0, 0, -l.x / 0.9 + wob);
          else setM(m, l.mi, l.x, 1.0 + Math.abs(wob), l.z, 1, 1, 1, l.x * 0.3, 0, -l.x / 1.0 + wob);
          l.shown = true;
          if (ns === 2 && near(l.x, l.z, 60) && Math.random() < dt * 18) fx.kick({ x: l.x, y: 0, z: l.z + rand(-0.8, 0.8) }, l.biome === 'glacier' ? 0xffffff : 0xd8c49a, l.dir * l.speed, 0, 0.6, 1);
        }
        if (l.kind === 'barrel') bDirty = true; else rDirty = true;
      }
      R.strip.instanceColor.needsUpdate = true;
      if (bDirty && R.barrel) R.barrel.instanceMatrix.needsUpdate = true;
      if (rDirty && R.boulder) R.boulder.instanceMatrix.needsUpdate = true;
    }
    // crumbling tiles
    if (R.tile && L.active.size) {
      for (const ti of L.active) {
        const t = L.tiles[ti]; t.t += dt;
        if (t.s === 1) {
          if (t.t >= t.shake) {
            t.s = 2; t.t = 0; t.cyc++;
            setM(R.hole, ti, t.x, 0.035, t.z); R.hole.instanceMatrix.needsUpdate = true;
            if (near(t.x, t.z, 60)) { fx.ring({ x: t.x, y: 0.1, z: t.z }, 0x2a1a4a, 2.6, 0.4, true); for (let k = 0; k < (game.lowQ ? 2 : 5); k++) fx.dust({ x: t.x + rand(-1.6, 1.6), y: 0, z: t.z + rand(-1.6, 1.6) }, t.col); }
            if (playerNear(t.x, t.z, 30)) { snd.hiss(0.5, { vol: 0.28, freq: 500, sweep: -350, type: 'lowpass' }); snd.tone(80, 0.4, { type: 'sine', vol: 0.22, slide: -40 }); }
          } else {
            const k = t.t / t.shake;
            setM(R.tile, ti, t.x + rand(-1, 1) * 0.07 * k, -0.06 + rand(0, 0.04), t.z + rand(-1, 1) * 0.07 * k, 1, 1, 1, rand(-1, 1) * 0.03 * k, 0, rand(-1, 1) * 0.03 * k);
            tmpC.setHex(t.col).lerp(tmpC2.setHex(0xff4a2a), (0.3 + 0.7 * k) * (0.5 + 0.5 * Math.sin(t.t * 30)));
            R.tile.setColorAt(ti, tmpC); R.tile.instanceColor.needsUpdate = true;
          }
        }
        if (t.s === 2) {
          if (t.t < 0.9) setM(R.tile, ti, t.x, -0.06 - 12 * t.t * t.t, t.z, 1, 1, 1, t.t * 0.5, 0, t.t * 0.3);
          else setM(R.tile, ti, 0, -50, 0, 0);
          if (t.t >= FALLEN) { t.s = 3; t.t = 0; R.tile.setColorAt(ti, tmpC.setHex(t.col)); R.tile.instanceColor.needsUpdate = true; }
        }
        if (t.s === 3) {
          const k = Math.min(1, t.t / RISE);
          setM(R.tile, ti, t.x, -2.5 + 2.44 * k, t.z);
          if (k >= 1) { t.s = 0; L.active.delete(ti); setM(R.hole, ti, 0, -50, 0, 0); R.hole.instanceMatrix.needsUpdate = true; }
        }
        R.tile.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ------------------------------------------------ one-time tips the first time the player meets each mechanic
  const TIPS = {
    pad: ['pads', '🟢 Jump pad! Run over it to launch forward — great for skipping lava & pits', 'gold'],
    current: ['currents', '🌊 Currents push you along the arrows — ride them or fight them', ''],
    geyser: ['geysers', '💦 Geyser! When it bubbles, step away — the blast knocks creatures loose', 'red'],
    lane: ['lanes', '🛢️ Rolling barrels! Watch the flashing lane and JUMP over them', 'red'],
    tiles: ['patches', '⚠️ Crumbling floor! Cracked tiles collapse moments after you step on them', 'red'],
  };
  let tipT = 0;
  function tips(dt) {
    if ((tipT -= dt) > 0) return; tipT = 0.5;
    const p = game.player.pos; if (p.z > -1) return;
    for (const k in TIPS) {
      if (st.seen[k]) continue;
      const [list, text, cls] = TIPS[k];
      const hit = L[list].some(o => { const zz = o.z ?? (o.minZ !== undefined ? (o.minZ + o.maxZ) / 2 : (o.z0 + o.z1) / 2); return zz < p.z + 2 && zz > p.z - 24; });
      if (hit) { st.seen[k] = 1; game.toast(text, cls); break; }
    }
  }

  bus.on('tick', dt => {
    if (!L) return;
    T += dt;
    update(dt);
    for (const a of game.actors) actorEffects(a, dt);
    tips(dt);
  });
  bus.on('respawn', a => { const s = AS.get(a); if (s) { s.padT = 0; s.cd = 0.5; } });

  // tiny debug handle (read-only use)
  game.hazardsLayout = () => L;
  game.hazardsInfo = () => L && { pads: L.pads.length, currents: L.currents.length, geysers: L.geysers.length, lanes: L.lanes.length, tiles: L.tiles.length, patches: L.patches.length };
}
