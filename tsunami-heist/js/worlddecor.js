// Per-world themed scenery (sailboats, lanterns, neon, wrecks, asteroids ...).
// Everything is instanced / merged: a handful of draw calls per world. No colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as CFG from './config.js';

// ---------------------------------------------------------------- templates (never added to the scene)
const T = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  sph: new THREE.SphereGeometry(1, 12, 8),
  sphLo: new THREE.SphereGeometry(1, 7, 5),
  dode: new THREE.DodecahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  plane: new THREE.PlaneGeometry(1, 1),
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const compose = (x, y, z, sx, sy, sz, rx, ry, rz) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rnd() * (b - a);
const pick = a => a[(rnd() * a.length) | 0];
let anims = [];

// a coloured, transformed, non-indexed copy of a template
function part(geo, color, p = [0, 0, 0], s = 1, r = [0, 0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const S = typeof s === 'number' ? [s, s, s] : s;
  g.applyMatrix4(compose(p[0], p[1], p[2], S[0], S[1], S[2], r[0], r[1], r[2]));
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function merge(parts) { const g = mergeGeometries(parts); for (const p of parts) p.dispose(); return g; }
function triGeo(pts, depth = 0.08) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2); return g;
}

// ---------------------------------------------------------------- materials (flagged so buildTrack disposes them)
function std(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, flatShading: o.flat ?? true, vertexColors: o.vc ?? true, fog: o.fog ?? true });
  if (o.em != null) { m.emissive.set(o.em); m.emissiveIntensity = o.ei ?? 1; }
  m.userData.track = true; return m;
}
function glow(color, k = 3, o = {}) {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(k), fog: o.fog ?? true, vertexColors: o.vc ?? false,
    transparent: !!o.add || o.opacity != null, opacity: o.opacity ?? 1, depthWrite: !o.add,
    blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: o.side ?? THREE.FrontSide,
  });
  m.userData.track = true; return m;
}

// ---------------------------------------------------------------- instancing
function setInst(im, i, o) {
  im.setMatrixAt(i, compose(o.x || 0, o.y || 0, o.z || 0, o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1, o.rx || 0, o.ry || 0, o.rz || 0));
}
function inst(root, geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  const colored = list.some(o => o.c != null);
  list.forEach((o, i) => { setInst(im, i, o); if (colored) im.setColorAt(i, _c.set(o.c ?? 0xffffff)); });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  if (list.length) im.computeBoundingSphere();
  im.castShadow = im.receiveShadow = false;
  root.add(im); return im;
}
// per-frame transform for a few dozen instances; skips ones far from the camera
const _q2 = {};
function animate(im, list, fn, range = 750) {
  im.frustumCulled = false;
  anims.push((t, camZ) => {
    let dirty = false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.always && Math.abs(o.z - camZ) > range) continue;
      for (const k in _q2) delete _q2[k];
      Object.assign(_q2, o); fn(o, t, _q2); setInst(im, i, _q2); dirty = true;
    }
    if (dirty) im.instanceMatrix.needsUpdate = true;
  });
}
function farGroup(root) {
  const g = new THREE.Group(); root.add(g);
  anims.push((t, camZ) => { g.position.z = Math.min(camZ, 0); });
  return g;
}

// ---------------------------------------------------------------- layout helpers
let Z0 = -60, ZE = -3000, LEN = 2940;
const zs = (n, j = 0.8) => Array.from({ length: n }, (_, i) => Z0 - (i + 0.5 + (rnd() - 0.5) * j) * LEN / n);
const side = () => (rnd() < 0.5 ? -1 : 1);
const SEA_Y = -3, END_SEA_Y = -0.8;

// ---------------------------------------------------------------- shared prefabs
function palmGeo() {
  const P = []; let x = 0, y = 0;
  for (let i = 0; i < 5; i++) { const lean = 0.06 + i * 0.05; P.push(part(T.cyl6, 0x9a7048, [x, y + 1.2, 0], [0.32 - i * 0.03, 2.5, 0.32 - i * 0.03], [0, 0, -lean])); x += Math.sin(lean) * 2.4; y += 2.35; }
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2;
    P.push(part(T.box, 0x3f9a3a, [x + Math.cos(a) * 1.7, y - 0.35, -Math.sin(a) * 1.7], [3.6, 0.1, 0.9], [0, a, -0.4]));
  }
  P.push(part(T.sphLo, 0x6a4a2a, [x, y - 0.3, 0], 0.45));
  return merge(P);
}
function lighthouseGeo(c1, c2, rock) {
  const P = [part(T.dode, rock, [0, 0, 0], [15, 6, 12])];
  for (let i = 0; i < 6; i++) { const r = 3.2 - i * 0.14; P.push(part(T.cyl, i % 2 ? c2 : c1, [0, 5 + i * 4, 0], [r, 4, r])); }
  P.push(part(T.cyl, 0x2a2a2a, [0, 27.3, 0], [3.3, 0.6, 3.3]));
  P.push(part(T.cyl, 0x2a2a2a, [0, 29.8, 0], [2.3, 0.3, 2.3]));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; P.push(part(T.box, 0x2a2a2a, [Math.cos(a) * 2.1, 28.6, Math.sin(a) * 2.1], [0.25, 2.4, 0.25])); }
  P.push(part(T.cone, c2 === 0xffffff ? c1 : 0x3a3a3a, [0, 31.4, 0], [2.6, 2.8, 2.6]));
  return merge(P);
}

// ================================================================ 0 Sunny Shores
function sunny(root) {
  // sailboats
  const hull = 0xffffff, sailG = (() => {
    const P = [
      part(T.box, hull, [0, 0.7, 0.4], [2.4, 1.4, 7]),
      part(T.cone4, hull, [0, 0.7, -4.0], [1.7, 2.2, 1.0], [-Math.PI / 2, Math.PI / 4, 0]),
      part(T.box, 0x2a6cd8, [0, 1.15, 0.4], [2.5, 0.25, 7.05]),
      part(T.box, 0xc8955a, [0, 1.45, 0.6], [2.2, 0.1, 6]),
      part(T.cyl, 0x8a6a4a, [0, 7.3, 0], [0.12, 12, 0.12]),
    ];
    const main = triGeo([[0, 0], [0, 10], [-4.8, 0]]); main.rotateY(Math.PI / 2); main.translate(0, 2.2, 0.15);
    const jib = triGeo([[0, 0], [0, 9.2], [3.6, 0]]); jib.rotateY(Math.PI / 2); jib.translate(0, 2.0, -0.15);
    P.push(part(main, 0xffffff), part(jib, 0xff5a4a)); main.dispose(); jib.dispose();
    return merge(P);
  })();
  const boats = [];
  for (const z of zs(26)) { const s = side(); boats.push({ x: s * rr(55, 190), y: SEA_Y, z, ry: rr(0, 6.3), s: rr(1, 1.5), ph: rr(0, 6), c: pick([0xffffff, 0xfff0e0, 0xe6f2ff, 0xffe6ee]) }); }
  for (let i = 0; i < 7; i++) boats.push({ x: rr(-170, 170), y: END_SEA_Y, z: ZE - rr(90, 420), ry: rr(0, 6.3), s: rr(1.1, 1.6), ph: rr(0, 6), c: 0xffffff });
  const bm = inst(root, sailG, std(0xffffff, { rough: 0.6 }), boats);
  animate(bm, boats, (o, t, q) => { q.y = o.y + Math.sin(t * 1.1 + o.ph) * 0.25; q.rz = Math.sin(t * 0.8 + o.ph) * 0.07; q.rx = Math.sin(t * 0.6 + o.ph) * 0.04; });

  // lighthouses (+ warm lamp)
  const lh = [];
  for (let z = Z0 - rr(200, 400); z > ZE; z -= rr(800, 1100)) lh.push({ x: side() * rr(120, 170), y: SEA_Y, z, ry: rr(0, 6) });
  lh.push({ x: 140, y: END_SEA_Y - 1, z: ZE - 440, ry: 0 });
  inst(root, lighthouseGeo(0xe8322e, 0xffffff, 0x7a7266), std(0xffffff, { rough: 0.6 }), lh);
  inst(root, new THREE.SphereGeometry(1.5, 10, 8), glow(0xffe8a0, 3), lh.map(o => ({ ...o, y: o.y + 28.6 })));

  // gull flocks circling high over the track and the sea
  const gullG = merge([
    part(T.sphLo, 0xffffff, [0, 0, 0], [0.35, 0.3, 0.9]),
    part(T.sphLo, 0xffffff, [0, 0.15, -0.8], 0.25),
    part(T.cone, 0xffa020, [0, 0.12, -1.1], [0.08, 0.3, 0.08], [-Math.PI / 2, 0, 0]),
    part(T.box, 0xf4f4f4, [-1.1, 0.25, 0], [2.2, 0.06, 0.6], [0, 0, 0.3]),
    part(T.box, 0xf4f4f4, [1.1, 0.25, 0], [2.2, 0.06, 0.6], [0, 0, -0.3]),
    part(T.box, 0x30343a, [-2.25, 0.6, 0.05], [0.4, 0.07, 0.5], [0, 0, 0.3]),
    part(T.box, 0x30343a, [2.25, 0.6, 0.05], [0.4, 0.07, 0.5], [0, 0, -0.3]),
  ]);
  const gulls = [];
  for (const z of zs(13)) {
    const cx = rr(-70, 70), cy = rr(20, 38), dir = side(), sp = rr(0.25, 0.45) * dir;
    for (let k = 0; k < 6; k++) gulls.push({ cx, cy, cz: z, z, R: rr(6, 15), ph: rr(0, 6.3), sp, dir, s: 1.6 });
  }
  const gm = inst(root, gullG, std(0xffffff, { rough: 0.8 }), gulls);
  animate(gm, gulls, (o, t, q) => {
    const a = o.ph + t * o.sp;
    q.x = o.cx + Math.cos(a) * o.R; q.z = o.cz + Math.sin(a) * o.R; q.y = o.cy + Math.sin(t * 1.3 + o.ph) * 1.2;
    const dx = -Math.sin(a) * o.dir, dz = Math.cos(a) * o.dir;
    q.ry = Math.atan2(-dx, -dz); q.rz = 0.3 * o.dir; q.sy = o.s * (1 + 0.6 * Math.sin(t * 8 + o.ph * 3));
  });

  // far shore: a sandy coast with beach huts + palms past the track end, and dune islands off the sides
  const hutG = merge([
    part(T.cyl6, 0x8a6a4a, [-1.6, 0.8, -1.6], [0.15, 1.6, 0.15]), part(T.cyl6, 0x8a6a4a, [1.6, 0.8, -1.6], [0.15, 1.6, 0.15]),
    part(T.cyl6, 0x8a6a4a, [-1.6, 0.8, 1.6], [0.15, 1.6, 0.15]), part(T.cyl6, 0x8a6a4a, [1.6, 0.8, 1.6], [0.15, 1.6, 0.15]),
    part(T.box, 0xffffff, [0, 3.3, 0], [4, 3.4, 4]),
    part(T.box, 0xffffff, [0, 3.3, 2.02], [4.05, 0.5, 0.05]),
    part(T.box, 0x5a4030, [0, 2.9, 2.04], [1.2, 2.2, 0.06]),
    part(T.cone4, 0xd8d8d8, [0, 6.2, 0], [3.6, 2.4, 3.6], [0, Math.PI / 4, 0]),
  ]);
  const shoreZ = ZE - 360, huts = [], palms = [], isles = [];
  isles.push({ x: 0, y: -2, z: shoreZ, sx: 520, sy: 7, sz: 60 });
  for (let x = -240; x <= 240; x += rr(22, 34)) huts.push({ x, y: 1.4, z: shoreZ + rr(-8, 8), ry: rr(-0.3, 0.3), s: rr(1.2, 1.6), c: pick([0xff9aa2, 0xffd17a, 0x8fd3ff, 0xa8f0a0, 0xd4a5ff, 0xffffff]) });
  for (let x = -250; x <= 250; x += rr(14, 26)) palms.push({ x, y: 1.4, z: shoreZ + rr(-22, 18), ry: rr(0, 6.3), s: rr(1.4, 2) });
  for (const z of zs(9)) {
    const s = side(), x = s * rr(110, 170);
    isles.push({ x, y: -2, z, sx: rr(26, 40), sy: rr(5, 7), sz: rr(18, 28), ry: rr(0, 6) });
    for (let k = 0; k < 3; k++) huts.push({ x: x + rr(-9, 9), y: 2.6, z: z + rr(-6, 6), ry: s > 0 ? Math.PI / 2 : -Math.PI / 2, s: 1.4, c: pick([0xff9aa2, 0xffd17a, 0x8fd3ff, 0xa8f0a0]) });
    for (let k = 0; k < 3; k++) palms.push({ x: x + rr(-12, 12), y: 2.4, z: z + rr(-9, 9), ry: rr(0, 6.3), s: rr(1.4, 1.9) });
  }
  inst(root, merge([part(T.dode, 0xf0dca0)]), std(0xffffff, { rough: 0.95 }), isles);
  inst(root, hutG, std(0xffffff, { rough: 0.6 }), huts);
  inst(root, palmGeo(), std(0xffffff), palms);
}

// ================================================================ 1 Golden Hour
function golden(root) {
  // lantern strings slung between posts on the two cliff tops
  const posts = [], lanterns = [], rope = [];
  const X = 24, TOP = 17.5, SAG = 3.6, N = 8;
  const yAt = x => TOP - SAG * (1 - (x / X) ** 2);
  for (let z = Z0 - 10; z > ZE + 10; z -= rr(38, 50)) {
    posts.push({ x: -X, y: 13, z, sx: 0.22, sy: 9, sz: 0.22 }, { x: X, y: 13, z, sx: 0.22, sy: 9, sz: 0.22 });
    for (let i = 0; i < 16; i++) { const a = -X + i * 3, b = a + 3; rope.push(a, yAt(a), z, b, yAt(b), z); }
    const col = pick([[0xff5a3a, 0xffb040], [0xffd060, 0xff7ab0], [0xff8a30, 0xfff0a0]]);
    for (let i = 1; i <= N; i++) { const x = -X + i * (2 * X / (N + 1)); lanterns.push({ x, y: yAt(x) - 1.1, z, ph: rr(0, 6), c: col[i % 2] }); }
  }
  inst(root, merge([part(T.cyl6, 0x3a2418)]), std(0xffffff), posts);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
  const rl = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x2a1810 })); rl.material.userData.track = true; root.add(rl);
  const lanternG = merge([
    part(T.sph, 0xffffff, [0, 0, 0], [0.62, 0.8, 0.62]),
    part(T.cyl, 0x40200c, [0, 0.78, 0], [0.32, 0.14, 0.32]),
    part(T.cyl, 0x40200c, [0, -0.78, 0], [0.32, 0.14, 0.32]),
    part(T.cyl, 0x2a1810, [0, 1.05, 0], [0.03, 0.5, 0.03]),
    part(T.box, 0xffc070, [0, -1.05, 0], [0.08, 0.4, 0.08]),
  ]);
  inst(root, lanternG, glow(0xffffff, 2.6, { vc: true }), lanterns);

  // silhouetted palms on rocky islets in the sea, and along the shore past the track end
  const palms = [], rocks = [];
  for (const z of zs(16)) {
    const s = side(), x = s * rr(48, 140);
    rocks.push({ x, y: -2.2, z, sx: rr(9, 16), sy: rr(3, 5), sz: rr(8, 14), ry: rr(0, 6), c: 0x2a1a22 });
    const n = 1 + ((rnd() * 3) | 0);
    for (let k = 0; k < n; k++) palms.push({ x: x + rr(-4, 4), y: 1, z: z + rr(-4, 4), ry: rr(0, 6.3), s: rr(1.6, 2.4), c: 0x1a0d14 });
  }
  const shoreZ = ZE - 330;
  rocks.push({ x: 0, y: -2.5, z: shoreZ, sx: 500, sy: 6, sz: 50, c: 0x2a1a22 });
  for (let x = -240; x <= 240; x += rr(12, 24)) palms.push({ x, y: 1.5, z: shoreZ + rr(-18, 14), ry: rr(0, 6.3), s: rr(1.8, 2.8), c: 0x1a0d14 });
  inst(root, merge([part(T.dode, 0xffffff)]), std(0xffffff, { rough: 0.9 }), rocks);
  inst(root, palmGeo(), std(0xffffff, { rough: 0.9 }), palms);

  // hot-air balloons drifting high above
  const envG = (() => {
    const env = part(T.sph, 0xffffff, [0, 0, 0], [6, 7, 6]);
    const p = env.attributes.position, c = env.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const band = Math.floor((Math.atan2(p.getX(i), p.getZ(i)) + Math.PI) / (Math.PI / 4)) % 2;
      const v = band ? 1 : 0.55; c.setXYZ(i, 1, v, v * 0.8 + 0.2);
    }
    return merge([
      env,
      part(T.cone, 0xffffff, [0, -7.2, 0], [3.4, 3.2, 3.4], [Math.PI, 0, 0]),
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => part(T.box, 0x3a2a1a, [a * 1.1, -9.6, b * 1.1], [0.05, 2.6, 0.05])),
      part(T.box, 0x6a4020, [0, -11.4, 0], [1.8, 1.3, 1.8]),
      part(T.cyl, 0xffc040, [0, -9.2, 0], [0.35, 0.6, 0.35]),
    ]);
  })();
  const balloons = [];
  for (const z of zs(16)) {
    let x = rr(-170, 170); if (Math.abs(x) < 26) x = Math.sign(x || 1) * 26;
    balloons.push({ x, y: rr(38, 90), z, s: rr(0.9, 1.4), ph: rr(0, 6), ry: rr(0, 6), c: pick([0xff4a3a, 0xffc040, 0x3ab0ff, 0x9a5aff, 0x50d070, 0xff70b0]) });
  }
  const bl = inst(root, envG, std(0xffffff, { rough: 0.5, flat: false }), balloons);
  animate(bl, balloons, (o, t, q) => { q.y = o.y + Math.sin(t * 0.35 + o.ph) * 2.2; q.ry = o.ry + t * 0.05; q.x = o.x + Math.sin(t * 0.07 + o.ph) * 6; });
}

// ================================================================ 2 Neon Night
function neonCanvas() {
  const words = [['TSUNAMI', '#ff3fd0'], ['HEIST', '#3fe8ff'], ['RUN!', '#ffe03f'], ['SURF CLUB', '#5dff86'], ['NO WAVES', '#ff5a5a'], ['OPEN 24/7', '#b070ff'], ['SAFE →', '#3fffb0'], ['NEON BAY', '#ff9a3f']];
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d');
  words.forEach(([w, col], i) => {
    const cx = (i % 2) * 512 + 256, cy = ((i / 2) | 0) * 128 + 64;
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.strokeRect(cx - 240, cy - 54, 480, 108);
    ctx.font = 'bold 64px Arial Black, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 22; ctx.fillText(w, cx, cy + 3);
    ctx.lineWidth = 2; ctx.strokeText(w, cx, cy + 3);
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, n: words.length };
}
function neon(root) {
  const strips = [];
  const CYAN = 0x30e0ff, PINK = 0xff30d0, PURP = 0x9a4aff;
  for (const s of [-1, 1]) {
    for (let z = Z0; z > ZE; z -= 16) {
      strips.push({ x: s * 18.5, y: 9.3, z: z - 7, sx: 0.2, sy: 0.2, sz: 14, c: s < 0 ? CYAN : PINK });
      strips.push({ x: s * 31.6, y: 9.0, z: z - 7, sx: 0.2, sy: 0.2, sz: 14, c: PURP });
    }
    // vertical bars on the inner cliff face (kept clear of shelter mouths)
    for (let z = Z0 - 20; z > ZE; z -= 48) {
      if (CFG.SHELTER_ZS.some(sz => Math.abs(sz - z) < 10)) continue;
      strips.push({ x: s * 18.15, y: 4.6, z, sx: 0.18, sy: 8.6, sz: 0.18, c: s < 0 ? PINK : CYAN });
    }
  }
  inst(root, merge([part(T.box, 0xffffff)]), glow(0xffffff, 4), strips);

  // arrow signs on posts along the cliff tops (pointing "onward")
  const arrowG = (() => {
    const head = triGeo([[-1.5, 0], [1.5, 0], [0, 1.7]], 0.22);
    const g = merge([part(T.box, 0xffffff, [0, 0, 0], [0.7, 3, 0.22]), part(head, 0xffffff, [0, 1.5, 0]), part(head, 0xffffff, [0, -0.6, 0], [0.7, 0.6, 1])]);
    head.dispose(); return g;
  })();
  const arrows = [], posts = [], signs = [];
  let k = 0;
  for (let z = Z0 - 30; z > ZE; z -= rr(55, 85), k++) {
    const s = k % 2 ? 1 : -1, x = s * rr(21, 27), ry = -s * 0.45;
    posts.push({ x, y: 11, z, sx: 0.25, sy: 5, sz: 0.25 });
    if (k % 3 === 2) signs.push({ x, y: 15.2, z, ry, w: (rnd() * 8) | 0 });
    else arrows.push({ x, y: 15, z, ry, c: pick([0xffe03f, 0x5dff86, 0x3fe8ff]) });
  }
  inst(root, arrowG, glow(0xffffff, 3.2), arrows);
  inst(root, merge([part(T.box, 0x1a1a28)]), std(0xffffff, { rough: 0.4, metal: 0.6 }), posts);
  if (signs.length) {
    const { tex } = neonCanvas();
    const planes = signs.map(o => {
      const g = part(T.plane, 0xffffff, [o.x, o.y, o.z], [12, 3, 1], [0, o.ry, 0]);
      const uv = g.attributes.uv, col = o.w % 2, row = (o.w / 2) | 0;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 2, 1 - (row + 1) / 4 + uv.getY(i) / 4);
      return g;
    });
    const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    m.userData.track = true;
    const sm = new THREE.Mesh(merge(planes), m); root.add(sm);
  }

  // glowing buoys bobbing in the sea
  const buoys = [];
  for (const z of zs(64)) { const s = side(); buoys.push({ x: s * rr(38, 120), y: SEA_Y, z, ph: rr(0, 6), c: pick([0x30ff70, 0xff3040, 0x30e0ff, 0xffd030]) }); }
  for (let i = 0; i < 14; i++) buoys.push({ x: rr(-120, 120), y: END_SEA_Y, z: ZE - rr(60, 380), ph: rr(0, 6), c: pick([0x30ff70, 0xff3040]) });
  const bodyG = merge([part(T.cyl, 0xd02030, [0, 0.4, 0], [1.1, 1.2, 1.1]), part(T.cyl, 0xffffff, [0, 1.15, 0], [0.9, 0.3, 0.9]), part(T.cone, 0xd02030, [0, 2.0, 0], [0.7, 1.4, 0.7]), part(T.cyl, 0x222222, [0, 2.9, 0], [0.08, 0.6, 0.08])]);
  const bb = inst(root, bodyG, std(0xffffff, { rough: 0.5 }), buoys);
  const lights = buoys.map(o => ({ ...o, s: 0.45 }));
  const bl = inst(root, new THREE.SphereGeometry(1, 8, 6), glow(0xffffff, 4), lights);
  const bob = (o, t, q) => { q.y = o.y + Math.sin(t * 1.4 + o.ph) * 0.35; q.rz = Math.sin(t * 1.1 + o.ph) * 0.12; };
  animate(bb, buoys, bob);
  animate(bl, lights, (o, t, q) => { bob(o, t, q); q.y += 3.3; const p = 0.6 + 0.4 * Math.sin(t * 3 + o.ph * 2); q.s = q.sx = q.sy = q.sz = 0.45 * (0.6 + 0.5 * p); q.rz = 0; });

  // distant city skyline on an arc ahead (follows the camera, unfogged)
  const far = farGroup(root);
  const blds = [], wins = [], tops = [];
  const R = 1350, up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  for (let th = -1.25; th <= 1.25; th += rr(0.018, 0.03)) {
    const h = rr(40, 230) * (1 - Math.abs(th) * 0.35), w = rr(22, 44), d = rr(20, 40), r = R + rr(-80, 120);
    const bx = Math.sin(th) * r, bz = -Math.cos(th) * r, ry = -th;
    blds.push({ x: bx, y: h / 2 - 5, z: bz, sx: w, sy: h, sz: d, ry, c: pick([0x0c1230, 0x10183a, 0x141030]) });
    const nw = 4 + ((rnd() * 10) | 0);
    for (let i = 0; i < nw; i++) {
      v.set(rr(-w / 2 + 3, w / 2 - 3), rr(4, h - 8), d / 2 + 0.3).applyAxisAngle(up, ry);
      wins.push({ x: bx + v.x, y: v.y - 5, z: bz + v.z, sx: 2.6, sy: 3.4, s: 1, ry, c: pick([0xffd878, 0xffd878, 0x60e8ff, 0xff60d0]) });
    }
    if (h > 150) tops.push({ x: bx, y: h - 5 + 6, z: bz, s: 1.6, c: 0xff2020 });
    else if (rnd() < 0.25) { v.set(0, 0, d / 2 + 0.4).applyAxisAngle(up, ry); tops.push({ x: bx + v.x, y: h - 5 - 3, z: bz + v.z, sx: w * 0.8, sy: 1.2, sz: 0.4, ry, c: pick([CYAN, PINK, PURP]) }); }
  }
  inst(far, merge([part(T.box, 0xffffff)]), std(0xffffff, { fog: false, em: 0x070a20, ei: 1, rough: 0.9 }), blds);
  inst(far, merge([part(T.plane, 0xffffff)]), glow(0xffffff, 2.2, { fog: false }), wins);
  inst(far, merge([part(T.box, 0xffffff)]), glow(0xffffff, 3.5, { fog: false }), tops);
}

// ================================================================ 3 Storm Coast
function storm(root) {
  // shipwrecks half sunk in the sea
  const WOOD = 0x3a2a1c, DARK = 0x221810;
  const wreckG = merge([
    part(T.box, WOOD, [0, 0, 0], [4, 3, 11]),
    part(T.cone4, WOOD, [0, 0, -6.8], [2.8, 3, 1.5], [-Math.PI / 2, Math.PI / 4, 0]),
    part(T.box, DARK, [0, 1.6, 0.5], [3.6, 0.2, 9]),
    ...[-3, -1, 1, 3].map(z => part(T.box, DARK, [rr(-1.6, 1.6), 2.6, z + 6], [0.3, rr(1.5, 3), 0.3], [rr(-0.4, 0.4), 0, rr(-0.5, 0.5)])),
    part(T.box, WOOD, [0.3, -0.6, 9.2], [3.6, 2.4, 3.5], [0.3, 0.2, 0.4]),
    part(T.cyl, DARK, [0.4, 5.5, -1.5], [0.25, 8, 0.25], [0.15, 0, 0.35]),
    part(T.box, 0x8a8a7a, [1.4, 7.5, -1.6], [0.08, 3, 2.6], [0, 0, 0.3]),
    part(T.cyl, DARK, [0, 3.5, 4], [0.2, 3.5, 0.2], [-0.2, 0, -0.6]),
  ]);
  const wrecks = [];
  for (const z of zs(16)) wrecks.push({ x: side() * rr(42, 140), y: SEA_Y - 0.6, z, ry: rr(0, 6.3), rx: rr(-0.25, 0.25), rz: rr(-0.4, 0.4), s: rr(1, 1.6) });
  for (let i = 0; i < 4; i++) wrecks.push({ x: rr(-110, 110), y: END_SEA_Y - 1, z: ZE - rr(80, 350), ry: rr(0, 6.3), rz: rr(-0.4, 0.4), s: rr(1.2, 1.8) });
  inst(root, wreckG, std(0xffffff, { rough: 0.95 }), wrecks);

  // lighthouses with sweeping beams
  const lh = [];
  for (let z = Z0 - rr(120, 300); z > ZE; z -= rr(520, 700)) lh.push({ x: side() * rr(70, 110), y: SEA_Y, z, ph: rr(0, 6) });
  lh.push({ x: -70, y: END_SEA_Y - 1, z: ZE - 260, ph: 1 });
  inst(root, lighthouseGeo(0xe8e8e8, 0x9aa4ac, 0x3a3c40), std(0xffffff, { rough: 0.7 }), lh);
  inst(root, new THREE.SphereGeometry(1.6, 10, 8), glow(0xfff2c0, 4), lh.map(o => ({ ...o, y: o.y + 28.6 })));
  const beamG = new THREE.ConeGeometry(9, 170, 14, 1, true); beamG.translate(0, -85, 0); beamG.rotateZ(Math.PI / 2);
  const beams = [];
  for (const o of lh) for (const k of [0, Math.PI]) beams.push({ x: o.x, y: o.y + 28.6, z: o.z, ph: o.ph + k, rz: -0.06, always: true });
  const bm = inst(root, beamG, glow(0xfff0c0, 1, { add: true, opacity: 0.2, side: THREE.DoubleSide }), beams);
  animate(bm, beams, (o, t, q) => { q.ry = t * 0.9 + o.ph; }, 1e9);

  // low, heavy storm clouds (flash with lightning)
  const clouds = [];
  for (const z of zs(Math.round(LEN / 26))) clouds.push({ x: rr(-170, 170), y: rr(30, 50), z, sx: rr(18, 42), sy: rr(5, 10), sz: rr(14, 30), ry: rr(0, 6.3), c: pick([0x3a3f48, 0x30343c, 0x464b55]) });
  for (let i = 0; i < 20; i++) clouds.push({ x: rr(-260, 260), y: rr(30, 55), z: ZE - rr(40, 500), sx: rr(30, 60), sy: rr(6, 12), sz: rr(20, 40), ry: rr(0, 6), c: 0x3a3f48 });
  const cm = std(0xffffff, { rough: 1, em: 0xcfe0ff, ei: 0 });
  inst(root, merge([part(T.dode, 0xffffff)]), cm, clouds);
  let next = 3, start = -10;
  anims.push(t => {
    if (t > next) { start = t; next = t + 4 + Math.random() * 8; }
    const d = t - start;
    cm.emissiveIntensity = d < 0.5 ? (d < 0.08 || (d > 0.16 && d < 0.26) ? 0.9 : 0.15 * (1 - d * 2)) : 0;
  });

  // broken piers jutting out from the cliffs, and two off the beach past the end
  const posts = [], planks = [];
  const pier = (x0, z0, dx, dz, n) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + dx * i * 3, z = z0 + dz * i * 3, broken = i > n * 0.5 && rnd() < 0.5;
      const perp = dx ? [0, 1.6] : [1.6, 0];
      for (const sgn of [-1, 1]) if (rnd() > 0.15) posts.push({ x: x + perp[0] * sgn, y: -2.5 + (broken ? -1 : 0), z: z + perp[1] * sgn, sx: 0.28, sy: 8, sz: 0.28, rx: broken ? rr(-0.3, 0.3) : 0, rz: broken ? rr(-0.3, 0.3) : 0 });
      if (rnd() < (broken ? 0.35 : 0.85)) planks.push({ x, y: 1.5 + (broken ? rr(-2.5, -0.5) : 0), z, sx: dx ? 3 : 4, sy: 0.25, sz: dx ? 4 : 3, rx: broken ? rr(-0.4, 0.4) : 0, rz: broken ? rr(-0.5, 0.5) : rr(-0.04, 0.04) });
    }
  };
  for (const z of zs(9)) { const s = side(); pier(s * 33, z, s, 0, 10 + ((rnd() * 8) | 0)); }
  pier(-26, ZE - 42, 0, -1, 16); pier(27, ZE - 42, 0, -1, 12);
  inst(root, merge([part(T.cyl6, 0x2e241c)]), std(0xffffff, { rough: 1 }), posts);
  inst(root, merge([part(T.box, 0x4a3a2a)]), std(0xffffff, { rough: 1 }), planks);
}

// ================================================================ 4 Cosmic Shore
function cosmic(root) {
  // floating asteroids
  const rocks = [];
  for (const z of zs(Math.round(LEN / 38))) {
    const x = rr(-220, 220), y = Math.abs(x) < 40 ? rr(36, 110) : rr(22, 110);
    rocks.push({ x, y, z, s: rr(2, 9), sy: 0, ph: rr(0, 6), sp: rr(0.05, 0.3), c: pick([0x6a5a80, 0x7a6a90, 0x54486a, 0x8a70a0]) });
  }
  for (const o of rocks) { o.sx = o.s * rr(0.8, 1.3); o.sy = o.s * rr(0.7, 1.1); o.sz = o.s; }
  const am = inst(root, merge([part(T.dode, 0xffffff)]), std(0xffffff, { rough: 0.9 }), rocks);
  animate(am, rocks, (o, t, q) => { q.rx = t * o.sp + o.ph; q.ry = t * o.sp * 0.7; q.y = o.y + Math.sin(t * 0.3 + o.ph) * 1.5; });

  // floating rock islands with glowing meadows
  const islandG = merge([
    part(T.cone, 0x5a4a70, [0, -7, 0], [10, 14, 10], [Math.PI, 0, 0]),
    part(T.dode, 0x4a3c60, [2, -3, 1], [7, 4, 6]),
    part(T.cyl, 0x40ffb0, [0, 0.2, 0], [10.2, 0.6, 10.2]),
    part(T.oct, 0xa0f0ff, [3, 3.5, -2], [1.2, 3.6, 1.2]),
    part(T.oct, 0xffa0ff, [-4, 2.5, 3], [0.9, 2.6, 0.9], [0.3, 0, 0.2]),
    part(T.cone, 0x30d090, [-2, 2, -4], [1.8, 4, 1.8]),
  ]);
  const isl = [];
  for (const z of zs(12)) isl.push({ x: side() * rr(50, 180), y: rr(45, 95), z, s: rr(0.8, 1.6), ry: rr(0, 6), ph: rr(0, 6) });
  const im = inst(root, islandG, std(0xffffff, { rough: 0.8, em: 0x103020, ei: 0.6 }), isl);
  animate(im, isl, (o, t, q) => { q.y = o.y + Math.sin(t * 0.4 + o.ph) * 2.5; q.ry = o.ry + t * 0.03; });

  // crystal spires: clusters in the sea and on the outer cliff rim
  const cyan = [], mag = [];
  const cluster = (x, y, z, sc) => {
    const n = 3 + ((rnd() * 3) | 0), arr = rnd() < 0.5 ? cyan : mag;
    for (let k = 0; k < n; k++) { const h = sc * rr(0.5, 1); arr.push({ x: x + rr(-2, 2) * sc * 0.15, y: y + h * 0.4, z: z + rr(-2, 2) * sc * 0.15, sx: h * 0.18, sy: h, sz: h * 0.18, rx: rr(-0.35, 0.35), rz: rr(-0.35, 0.35), ry: rr(0, 6), c: pick([0xffffff, 0xd0d8ff, 0xe8d0ff]) }); }
  };
  for (const z of zs(26)) cluster(side() * rr(36, 130), SEA_Y, z, rr(14, 32));
  for (const z of zs(40)) cluster(side() * rr(28, 31), 8.6, z, rr(4, 8));
  const octG = merge([part(T.oct, 0xffffff)]);
  inst(root, octG, std(0x60e8ff, { rough: 0.15, metal: 0.2, em: 0x30c8ff, ei: 2.2 }), cyan);
  inst(root, octG.clone(), std(0xff70f0, { rough: 0.15, metal: 0.2, em: 0xd040ff, ei: 2.2 }), mag);

  // glowing alien flora on the cliff tops
  const stalks = [], caps = [];
  for (const s of [-1, 1]) for (let z = Z0 - 2; z > ZE; z -= rr(7, 15)) {
    const x = s * rr(19.5, 31.5), h = rr(1, 3.2), c = pick([0x40ffd0, 0xff60e0, 0xb0ff40, 0x60a0ff]);
    if (rnd() < 0.65) { stalks.push({ x, y: 8.6 + h / 2, z, sx: 0.14, sy: h, sz: 0.14, rz: rr(-0.2, 0.2) }); caps.push({ x, y: 8.6 + h, z, sx: rr(0.7, 1.3), sy: 0.45, sz: rr(0.7, 1.3), c }); }
    else for (let k = 0; k < 3; k++) caps.push({ x: x + rr(-0.8, 0.8), y: 8.8 + rr(0, 0.6), z: z + rr(-0.8, 0.8), s: rr(0.25, 0.5), c });
  }
  inst(root, merge([part(T.cyl6, 0xd0c0ff)]), std(0xffffff, { rough: 0.6 }), stalks);
  inst(root, merge([part(T.sph, 0xffffff)]), glow(0xffffff, 2.6), caps);

  // a second moon (and a tiny third) on the horizon
  const far = farGroup(root);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 16), std(0x7fe0d0, { fog: false, flat: false, vc: false, em: 0x2a6a70, ei: 0.7, rough: 1 }));
  moon.position.set(650, 520, -2300); far.add(moon);
  const spots = [];
  for (let i = 0; i < 12; i++) { const a = rr(-1.2, 1.2), b = rr(-1, 1); spots.push({ x: 650 + Math.sin(a) * 100 * Math.cos(b) - 30, y: 520 + Math.sin(b) * 100, z: -2300 + 75, s: rr(6, 18), sz: 2, c: 0xffffff }); }
  inst(far, merge([part(T.sphLo, 0x4a9a98)]), std(0xffffff, { fog: false, em: 0x204848, ei: 0.6 }), spots);
  const moonlet = new THREE.Mesh(new THREE.SphereGeometry(28, 20, 12), std(0xfff0d0, { fog: false, flat: false, vc: false, em: 0x605040, ei: 0.8 }));
  moonlet.position.set(-320, 640, -2050); far.add(moonlet);
}

// ================================================================ API
export function decorateWorld(root, w) {
  anims = [];
  seed = 4242 + w * 977;
  Z0 = CFG.ZONES.length ? CFG.ZONES[0].z0 : -60; ZE = CFG.TRACK_END; LEN = Math.max(100, Z0 - ZE);
  const g = new THREE.Group(); g.name = 'worldDecor'; root.add(g);
  try { [sunny, golden, neon, storm, cosmic][w]?.(g); }
  catch (e) { console.warn('worldDecor failed', e); }
}
export function updateWorldDecor(t, camZ = 0) {
  if (!Number.isFinite(camZ)) camZ = 0;
  for (let i = 0; i < anims.length; i++) anims[i](t, camZ);
}
