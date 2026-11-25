// Landmark / signage / hazard visuals for the track (stage gates, shelters, distance markers,
// lava rims, pendulum logs, crabs, abyss bridges). Visual only: no colliders or hazard data here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_HALF, SHELTER_LEN, SHELTER_DEPTH } from './config.js';
import { G, makeLabel, ENV_I } from './models.js';

const X = TRACK_HALF;
const PI = Math.PI;
let ls = 1;
const lr = () => (ls = (ls * 16807) % 2147483647) / 2147483647;
const lrr = (a, b) => a + lr() * (b - a);

// ------------------------------------------------ geometry helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function colorize(g, color, mul = 1) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r * mul; a[i * 3 + 1] = c.g * mul; a[i * 3 + 2] = c.b * mul; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function prep(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function part(geo, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, mul = 1) {
  const g = prep(geo);
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); g.applyMatrix4(_m);
  return colorize(g, color, mul);
}
// cylinder (or any y-axis geo) stretched between two points
function segPart(a, b, r, color, geo = G.cylLo, mul = 1) {
  const g = prep(geo);
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _d.length(); _d.normalize();
  _q.setFromUnitVectors(_up, _d); _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); _s.set(r, len, r); _m.compose(_p, _q, _s); g.applyMatrix4(_m);
  return colorize(g, color, mul);
}
function trackMat(m) { m.userData.track = true; return m; }
const GLOW_MUL = 2.2;
class Kit {
  constructor() { this.solid = []; this.glow = []; this.ice = []; this.add = []; this.metal = []; }
  s(...a) { this.solid.push(part(...a)); return this; }
  g(geo, color, x, y, z, sx, sy, sz, rx, ry, rz) { this.glow.push(part(geo, color, x, y, z, sx, sy, sz, rx, ry, rz, GLOW_MUL)); return this; }
  i(...a) { this.ice.push(part(...a)); return this; }
  m(...a) { this.metal.push(part(...a)); return this; }
  seg(a, b, r, color, bucket = 'solid', geo) { this[bucket].push(segPart(a, b, r, color, geo, bucket === 'glow' ? GLOW_MUL : 1)); return this; }
  geos() {
    const o = {};
    for (const k of ['solid', 'glow', 'ice', 'add', 'metal']) if (this[k].length) o[k] = mergeGeometries(this[k]);
    return o;
  }
  build(group, opts = {}) {
    const geos = this.geos(), M = kitMats(opts), out = {};
    for (const k in geos) {
      const m = new THREE.Mesh(geos[k], M[k]);
      m.castShadow = k === 'solid' || k === 'metal' || k === 'ice'; m.receiveShadow = k === 'solid';
      if (k === 'add') m.renderOrder = 5;
      group.add(m); out[k] = m;
    }
    return out;
  }
}
function kitMats({ rough = 0.75, flat = true, addOpacity = 0.35 } = {}) {
  return {
    solid: trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, flatShading: flat, envMapIntensity: ENV_I })),
    glow: trackMat(new THREE.MeshBasicMaterial({ vertexColors: true })),
    ice: trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.86, envMapIntensity: 1.2 })),
    add: trackMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: addOpacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })),
    metal: trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85, envMapIntensity: 1 })),
  };
}
function gradY(g, c0, c1, y0, y1, mul = 1) {
  const a = g.attributes.color.array, p = g.attributes.position.array, A = new THREE.Color(c0), B = new THREE.Color(c1), t = new THREE.Color();
  for (let i = 0; i < p.length / 3; i++) { t.copy(A).lerp(B, Math.min(1, Math.max(0, (p[i * 3 + 1] - y0) / (y1 - y0)))); a[i * 3] = t.r * mul; a[i * 3 + 1] = t.g * mul; a[i * 3 + 2] = t.b * mul; }
  return g;
}
function instancedMats(scene, geo, mat, mats, { shadow = false } = {}) {
  if (!mats.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = shadow; im.receiveShadow = shadow; im.computeBoundingSphere();
  scene.add(im); return im;
}
const mtx = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz)); };

function starfish(k, x, y, z, col, sc = 1) {
  for (let j = 0; j < 5; j++) { const a = j * PI * 2 / 5; k.s(G.box, col, x - Math.sin(a) * 0.45 * sc, y + Math.cos(a) * 0.45 * sc, z, 0.34 * sc, 0.95 * sc, 0.16 * sc, 0, 0, a); }
  k.s(G.sphereLo, col, x, y, z, 0.3 * sc, 0.3 * sc, 0.12 * sc);
}

// ------------------------------------------------ glyph texture (temple gate)
function glyphTexture(w, h, cols, rows) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = Math.max(4, w / cols * 0.08); x.lineCap = 'round';
  const cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const cx = (i + 0.5) * cw, cy = (j + 0.5) * ch, r = Math.min(cw, ch) * 0.32, t = Math.floor(lr() * 7);
    x.beginPath();
    if (t === 0) { x.arc(cx, cy, r, 0, PI * 2); x.moveTo(cx + r * 0.25, cy); x.arc(cx, cy, r * 0.25, 0, PI * 2); }
    else if (t === 1) { for (let a = 0; a < PI * 5; a += 0.2) { const rr = r * a / (PI * 5); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } }
    else if (t === 2) { x.ellipse(cx, cy, r, r * 0.5, 0, 0, PI * 2); x.moveTo(cx + r * 0.2, cy); x.arc(cx, cy, r * 0.2, 0, PI * 2); }
    else if (t === 3) { x.moveTo(cx - r, cy + r * 0.5); for (let k = 0; k < 5; k++) x.lineTo(cx - r + (k + 1) * r * 0.4, cy + (k % 2 ? r * 0.5 : -r * 0.5)); }
    else if (t === 4) { x.rect(cx - r, cy - r, r * 2, r * 2); x.moveTo(cx - r, cy); x.lineTo(cx + r, cy); x.moveTo(cx, cy - r); x.lineTo(cx, cy + r); }
    else if (t === 5) { x.moveTo(cx, cy - r); x.lineTo(cx + r, cy + r); x.lineTo(cx - r, cy + r); x.closePath(); x.moveTo(cx, cy + r * 0.1); x.arc(cx, cy + r * 0.3, r * 0.15, 0, PI * 2); }
    else { for (let k = 0; k < 3; k++) { x.moveTo(cx - r, cy - r * 0.6 + k * r * 0.6); x.quadraticCurveTo(cx, cy - r + k * r * 0.6, cx + r, cy - r * 0.6 + k * r * 0.6); } }
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------ stage gates
const GATE_THEMES = {
  beach(k, rc) {
    const sand = 0xe8c98e, sandD = 0xd4b078, sandL = 0xf2dcae;
    for (const s of [-1, 1]) {
      const tx = s * (X + 1.2);
      k.s(G.cyl, sand, tx, 6.5, 0, 2.6, 13, 2.6);
      for (const y of [3.5, 8.5]) k.s(G.cyl, sandD, tx, y, 0, 2.75, 0.45, 2.75);
      k.s(G.cyl, sandL, tx, 13.2, 0, 3.0, 0.5, 3.0);
      for (let a = 0; a < 10; a++) { const an = a / 10 * PI * 2; k.s(G.box, sand, tx + Math.cos(an) * 2.6, 14.0, Math.sin(an) * 2.6, 0.9, 1.1, 0.9, 0, -an, 0); }
      k.s(G.cyl, sand, tx, 15.0, 0, 1.3, 3.2, 1.3);
      k.s(G.cone, sandD, tx, 17.6, 0, 1.7, 2.2, 1.7);
      k.s(G.cylLo, 0x6b4a2a, tx, 19.6, 0, 0.07, 2.4, 0.07);
      k.g(G.box, rc, tx - s * 0.75, 20.2, 0, 1.4, 0.9, 0.06);
      for (const y of [6, 10.8]) k.s(G.box, 0x4a3018, tx - s * 0.9, y, 2.3, 0.7, 1.3, 0.5);
      for (let j = 0; j < 4; j++) k.s(G.cone, [0xffb6a0, 0xfff0e0, 0xffd0b0][j % 3], tx - s * lrr(1.2, 2.4), 0.2, lrr(1.6, 3), 0.35, 0.4, 0.35);
      k.s(G.cyl, s > 0 ? 0xe84a3a : 0x3a8ae8, s * (X - 1.1), 0.55, 3, 0.55, 1.1, 0.45);
      k.s(G.torus, 0xdddddd, s * (X - 1.1), 1.2, 3, 0.45, 0.45, 0.45, 0, 0, 0.5);
      starfish(k, tx - s * 1.6, 5.2, 2.0, 0xff8a5a, 0.9);
    }
    k.s(G.box, sand, 0, 12.4, 0, 2 * X, 2.2, 2.4);
    k.s(G.box, sandD, 0, 11.2, 0, 2 * X - 1, 0.3, 2.6);
    for (let x = -15; x <= 15.1; x += 2.5) k.s(G.box, sandL, x, 14.0, 0.5, 1.1, 1.0, 1.1);
    for (const x of [-9, 9]) starfish(k, x, 12.4, 1.25, 0xff8a5a);
    for (const x of [-4, 4]) k.s(G.sphere, 0xffc4b0, x, 12.3, 1.2, 0.8, 0.6, 0.25);
    return { top: 14.6, board: 0x8a6440 };
  },
  tidepools(k, rc) {
    const dw = 0x9e8e7a, dw2 = 0x7f6e5c, rope = 0xcdb488;
    for (const s of [-1, 1]) {
      k.seg([s * (X + 0.8), -0.5, 1.3], [s * (X - 0.1), 13.2, 0.2], 0.65, dw);
      k.seg([s * (X + 1.4), -0.5, -1.2], [s * (X + 0.2), 13.0, 0.4], 0.55, dw2);
      for (const y of [11.4, 12.2]) k.s(G.torus, rope, s * (X + 0.05), y, 0.3, 1.0, 1.0, 1.0, PI / 2, 0, 0);
      starfish(k, s * (X - 0.6), 6.5, 1.0, 0xff7a4a, 0.8);
      k.seg([s * (X + 0.2), 8, 0.6], [s * (X - 0.8), 9.4, 1.1], 0.18, dw2);
    }
    k.seg([-X - 2.5, 12.6, 0.2], [X + 2.5, 12.9, 0.2], 0.75, dw);
    k.seg([-X - 1, 11.3, 0.9], [X + 1, 11.1, 0.9], 0.4, dw2);
    const floats = [0xe8452c, 0xf4f4f4, 0xffc93a];
    let f = 0;
    for (let x = -15; x < 15; x += 5) {
      const a = [x, 11.1, 1.25], m = [x + 2.5, 9.5, 1.35], b = [x + 5, 11.1, 1.25];
      k.seg(a, m, 0.07, rope).seg(m, b, 0.07, rope);
      k.s(G.sphere, floats[f++ % 3], m[0], m[1] - 0.35, m[2], 0.48);
      k.s(G.cylLo, 0xffffff, m[0], m[1] - 0.35, m[2], 0.5, 0.14, 0.5);
    }
    for (let j = 0; j < 12; j++) { const len = lrr(1.2, 3.2), x = lrr(-15, 15); k.s(G.box, j % 2 ? 0x3f8a46 : 0x5aa84a, x, 11.0 - len / 2, 1.0, 0.2, len, 0.05, 0, 0, lrr(-0.15, 0.15)); }
    // lantern hanging at the centre in rarity colour
    k.seg([0, 11.1, 1.0], [0, 10.0, 1.0], 0.05, rope);
    k.g(G.sphere, rc, 0, 9.6, 1.0, 0.45);
    return { top: 13.6, board: 0x6e5e4c };
  },
  reef(k, rc) {
    const R = X - 0.2;
    k.s(new THREE.TorusGeometry(R, 1.5, 8, 40, PI), 0xff7a8a, 0, 0, 0, 1, 0.74, 1.2);
    const pal = [0xff9a5a, 0xb070ff, 0xffd04a, 0x5ad8c8, 0xff5a7a, 0xf0a0ff];
    for (let j = 0; j < 46; j++) {
      const a = lr() * PI, r = R + lrr(-0.6, 1.3);
      k.s(G.sphereLo, pal[j % pal.length], Math.cos(a) * r, Math.sin(a) * r * 0.74, lrr(-1.1, 1.1), lrr(0.45, 1.05));
    }
    for (let j = 0; j < 14; j++) {
      const a = lrr(0.35, PI - 0.35), b = [Math.cos(a) * (R + 1.1), Math.sin(a) * (R + 1.1) * 0.74, lrr(-0.6, 0.6)];
      const col = pal[j % pal.length], t = [b[0] + Math.cos(a) * 0.8 + lrr(-0.4, 0.4), b[1] + lrr(1.1, 2), b[2] + lrr(-0.4, 0.4)];
      k.seg(b, t, 0.2, col);
      for (const d of [-1, 1]) { const t2 = [t[0] + d * lrr(0.4, 0.8), t[1] + lrr(0.6, 1.2), t[2]]; k.seg(t, t2, 0.13, col); k.g(G.sphereLo, 0x7affea, t2[0], t2[1], t2[2], 0.16); }
    }
    for (const s of [-1, 1]) {
      k.s(G.halfSphere, 0xe8a070, s * (X + 0.6), 0, 1.8, 2.2, 1.6, 2.0);
      for (let j = 0; j < 5; j++) { const h = lrr(1.4, 3.4); k.s(G.cyl, 0x9a5ae0, s * (X - 0.3 + lrr(-0.4, 1.2)), h / 2, -1.6 + lrr(-0.8, 0.8), 0.32, h, 0.32); }
      k.s(G.sphere, 0xd04aa0, s * (X - 0.4), 5.2, -1.4, 1.9, 1.9, 0.1, 0, s * 0.3, 0);
      for (let j = 0; j < 6; j++) k.g(G.sphereLo, 0x7affea, s * (X - 0.6) + lrr(-0.6, 0.6), lrr(1, 9), lrr(-1.2, 1.4), 0.14);
    }
    return { top: 14.8, board: 0x1f5a78 };
  },
  jungle(k, rc, group) {
    const st = [0x8a8670, 0x7a7662, 0x938e76];
    for (const s of [-1, 1]) {
      const px = s * (X + 0.4);
      for (let j = 0; j < 6; j++) k.s(G.box, st[j % 3], px + lrr(-0.12, 0.12), 1.05 + j * 2.1, lrr(-0.1, 0.1), 2.8, 2.08, 3.2, 0, lrr(-0.05, 0.05), 0);
      k.s(G.box, 0x6e6a56, px, 13.0, 0, 3.6, 0.8, 3.8);
      k.s(G.box, 0x6a6652, s * (X - 1.0), 6.4, 0, 0.3, 9.0, 2.2); // glyph backing plate (inner face)
      // torch
      k.s(G.box, 0x4a3a2a, s * (X - 1.4), 7.2, 1.2, 0.3, 0.8, 0.3);
      k.s(G.cylLo, 0x3a2a1a, s * (X - 1.6), 7.8, 1.2, 0.35, 0.4, 0.35);
      k.g(G.cone, 0xff9a30, s * (X - 1.6), 8.5, 1.2, 0.3, 0.9, 0.3);
      k.g(G.cone, 0xffe070, s * (X - 1.6), 8.35, 1.2, 0.16, 0.55, 0.16);
      for (let j = 0; j < 4; j++) k.s(G.box, 0x3f8a34, px + lrr(-1, 1), 2.1 * lrr(1, 6), 1.62, lrr(0.6, 1.4), 0.25, 0.12);
    }
    k.s(G.box, 0x8f8a72, 0, 14.6, 0, 2 * X + 4, 2.4, 3.4);
    k.s(G.box, 0x7a7662, 0, 16.4, 0, 30, 1.2, 3.0);
    k.s(G.box, 0x8f8a72, 0, 17.6, 0, 18, 1.2, 2.6);
    for (let x = -X; x <= X + 0.1; x += 3) k.s(G.box, 0x3f8a34, x + lrr(-0.5, 0.5), 15.85, lrr(-1, 1), lrr(1, 2.2), 0.25, lrr(0.6, 1.2));
    for (let j = 0; j < 16; j++) {
      let p = [lrr(-X + 1, X - 1), 13.4, 1.75]; const n = Math.floor(lrr(3, 7));
      for (let q = 0; q < n; q++) {
        const np = [p[0] + lrr(-0.3, 0.3), p[1] - 0.75, p[2] + 0.02]; k.seg(p, np, 0.07, 0x2f6a24);
        if (q % 2) k.s(G.sphereLo, 0x3f9a34, np[0] + 0.18, np[1], np[2] + 0.05, 0.32, 0.12, 0.24, 0, 0, 0.5);
        p = np;
      }
    }
    // glowing carved glyphs (rarity colour) on the lintel front + both pillar inner faces
    const glowCol = new THREE.Color(rc).multiplyScalar(1.6);
    const lt = glyphTexture(1024, 64, 16, 1), pt = glyphTexture(64, 384, 1, 6);
    const lm = trackMat(new THREE.MeshBasicMaterial({ map: lt, color: glowCol, transparent: true, depthWrite: false }));
    const pm = trackMat(new THREE.MeshBasicMaterial({ map: pt, color: glowCol, transparent: true, depthWrite: false }));
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(30, 1.9), lm); lp.position.set(0, 14.6, 1.72); group.add(lp);
    for (const s of [-1, 1]) { const pp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 8.4), pm); pp.rotation.y = -s * PI / 2; pp.position.set(s * (X - 1.17), 6.4, 0); group.add(pp); }
    return { top: 18.2, board: 0x5e5a48 };
  },
  volcano(k) {
    const ob = [0x1c1619, 0x241c20, 0x30262a], lava = 0xff5a10;
    for (const s of [-1, 1]) {
      const px = s * (X + 0.4);
      k.s(G.box, ob[0], px, 7, 0, 2.8, 14, 2.8, 0, 0.2, 0);
      for (let j = 0; j < 5; j++) k.s(G.coneLo, ob[j % 3], px + lrr(-1, 1), lrr(2, 9), lrr(-1.3, 1.3), lrr(0.8, 1.4), lrr(4, 8), lrr(0.8, 1.4), 0, lrr(0, 3), lrr(-0.4, 0.4));
      for (let j = 0; j < 3; j++) k.s(G.coneLo, ob[1], px + s * j * 0.4, 15 + j * 0.6, lrr(-0.8, 0.8), 0.7, 3.2 - j * 0.6, 0.7, 0, 0, -s * (0.35 + j * 0.25));
      // lava crack on inner face
      let p = [s * (X - 1.0), 0.6, lrr(-0.6, 0.6)];
      for (let y = 2.2; y < 13.4; y += lrr(1.1, 1.8)) { const np = [s * (X - 1.0), y, lrr(-1, 1)]; k.seg(p, np, 0.1, lava, 'glow'); p = np; }
      p = [px - s * 0.4, 0.8, 1.42];
      for (let y = 2.4; y < 13.4; y += lrr(1.2, 2)) { const np = [px + lrr(-0.9, 0.5) * s, y, 1.42]; k.seg(p, np, 0.09, lava, 'glow'); p = np; }
      k.g(G.sphere, 0xff4a0a, s * (X - 1.3), 0.03, 1.6, 1.6, 0.06, 1.4);
    }
    for (let x = -16; x <= 16.1; x += 3.6) k.s(G.box, ob[Math.floor(lr() * 3)], x, 13 + lrr(-0.3, 0.3), 0, 4.2, lrr(2, 2.8), 2.6, 0, lrr(-0.1, 0.1), lrr(-0.12, 0.12));
    for (let j = 0; j < 12; j++) k.s(G.coneLo, ob[j % 3], lrr(-16, 16), 15, lrr(-0.8, 0.8), lrr(0.4, 0.8), lrr(1.2, 3), lrr(0.4, 0.8), 0, 0, lrr(-0.3, 0.3));
    let p = [-16, 13, 1.35];
    while (p[0] < 16) { const np = [p[0] + lrr(0.8, 1.7), 13 + lrr(-0.7, 0.7), 1.38]; k.seg(p, np, 0.09, lava, 'glow'); p = np; }
    for (let j = 0; j < 10; j++) { const l = lrr(0.5, 1.4); k.g(G.coneLo, 0xff7a20, lrr(-15, 15), 11.7 - l / 2, lrr(-0.8, 0.8), 0.14, l, 0.14, PI, 0, 0); }
    return { top: 14.6, board: 0x1a1418 };
  },
  glacier(k) {
    const R = X - 0.2, sy = 0.76;
    k.i(new THREE.TorusGeometry(R, 1.7, 6, 30, PI), 0xbfe6ff, 0, 0, 0, 1, sy, 1.1);
    for (let a = 0.22; a < PI - 0.2; a += 0.11) k.s(G.sphereLo, 0xf6fbff, Math.cos(a) * (R + 1.2), Math.sin(a) * (R + 1.2) * sy + 0.3, lrr(-0.2, 0.2), 1.4, 0.55, 1.4, 0, 0, a - PI / 2);
    for (let a = 0.35; a < PI - 0.35; a += 0.06) {
      if (Math.sin(a) < 0.5) continue;
      const r = R - 1.3, L = lrr(0.8, 2.8), yy = Math.sin(a) * r * sy;
      k.i(G.coneLo, 0xdff4ff, Math.cos(a) * r, yy - L / 2, lrr(-0.9, 0.9), lrr(0.18, 0.32), L, lrr(0.18, 0.32), PI, 0, 0);
    }
    for (const s of [-1, 1]) {
      for (let j = 0; j < 6; j++) k.i(G.coneLo, j % 2 ? 0xa8daff : 0xd6f0ff, s * (X - 0.6 + lrr(-0.6, 1.4)), 0, lrr(-2, 2), lrr(0.4, 0.8), lrr(2, 5), lrr(0.4, 0.8), lrr(-0.2, 0.2), 0, lrr(-0.3, 0.3));
      k.s(G.halfSphere, 0xffffff, s * (X - 0.2), 0, 0.6, 2.6, 0.8, 2.4);
      for (let j = 0; j < 3; j++) { const y = 3 + j * 3; k.g(G.box, 0x9ae4ff, s * (X - 1.4), y, 1.4, 0.1, 1.2, 0.1); k.g(G.box, 0x9ae4ff, s * (X - 1.4), y, 1.4, 0.1, 1.2, 0.1, 0, 0, PI / 3); k.g(G.box, 0x9ae4ff, s * (X - 1.4), y, 1.4, 0.1, 1.2, 0.1, 0, 0, -PI / 3); }
    }
    return { top: 15.0, board: 0x2e5a7a };
  },
  abyss(k) {
    const R = X - 0.2, sy = 0.76, oct = new THREE.OctahedronGeometry(1, 0);
    k.s(new THREE.TorusGeometry(R, 1.3, 4, 26, PI), 0x4a2e98, 0, 0, 0, 1, sy, 1.1);
    k.g(new THREE.TorusGeometry(R - 1.1, 0.22, 5, 48, PI), 0xc69bff, 0, 0, 0.3, 1, sy, 1);
    const band = colorize(prep(new THREE.RingGeometry(R - 3.6, R - 1.2, 48, 1, 0, PI)), 0x7a3aff);
    band.applyMatrix4(new THREE.Matrix4().makeScale(1, sy, 1));
    k.add.push(band);
    for (let j = 0; j < 26; j++) {
      const a = lrr(0.05, PI - 0.05), r = R + 1.0, c = new THREE.Color().setHSL(j / 26, 0.85, 0.62), L = lrr(1.2, 2.6);
      const x = Math.cos(a) * (r + L * 0.5), y = Math.sin(a) * (r + L * 0.5) * sy;
      (j % 3 ? k.s : k.g).call(k, oct, c, x, y, lrr(-0.7, 0.7), lrr(0.35, 0.6), L, lrr(0.35, 0.6), 0, 0, a - PI / 2);
    }
    for (const s of [-1, 1]) for (let j = 0; j < 5; j++) {
      const c = new THREE.Color().setHSL(lr(), 0.8, 0.6), h = lrr(2, 5);
      k.s(oct, c, s * (X - 0.3 + lrr(-0.5, 1.5)), h * 0.6, lrr(-2, 2), lrr(0.6, 1.1), h, lrr(0.6, 1.1), lrr(-0.2, 0.2), 0, lrr(-0.35, 0.35));
    }
    for (let j = 0; j < 7; j++) k.g(oct, new THREE.Color().setHSL(j / 7, 0.9, 0.6), lrr(-12, 12), lrr(16.5, 20), lrr(-2, 2), 0.35, 0.9, 0.35, 0, lr() * 3, 0);
    return { top: 14.8, board: 0x22183e };
  },
};

export function buildGate(biome, title, R, idx = 0) {
  ls = 1000 + idx * 7717;
  const group = new THREE.Group(), k = new Kit();
  const rc = R.glow ?? new THREE.Color(R.color).getHex();
  const theme = GATE_THEMES[biome] || GATE_THEMES.beach;
  const info = theme(k, rc, group);
  // big readable sign board above the gate, framed in the rarity colour
  const lab = makeLabel([{ text: title.toUpperCase(), color: '#fff', size: 52 }, { text: R.name.toUpperCase() + ' ZONE', color: R.color, size: 66, rainbow: R.rainbow }], { scale: 1.75 });
  const w = lab.scale.x + 1.6, h = lab.scale.y + 1.0, y = info.top + 1.2 + h / 2;
  k.s(G.box, info.board, 0, y, 0, w, h, 0.5);
  k.g(G.box, rc, 0, y, -0.12, w + 0.55, h + 0.55, 0.3);
  for (const s of [-1, 1]) {
    k.m(G.cylLo, 0x444450, s * (w / 2 - 1), info.top + 0.5, 0, 0.09, 1.6, 0.09);
    k.g(G.sphereLo, rc, s * (w / 2 + 0.25), y + h / 2 + 0.25, 0.1, 0.35);
  }
  lab.position.set(0, y, 0.45); group.add(lab);
  k.build(group, { rough: biome === 'glacier' ? 0.4 : 0.75 });
  return group;
}

// ------------------------------------------------ shelters (instanced; local +x = into the cliff)
export function buildShelterVisuals(scene, list, cliffH) {
  if (!list.length) return;
  const k = new Kit(), half = SHELTER_LEN / 2, cx = SHELTER_DEPTH / 2, H = cliffH;
  // tiki posts + carved heads with glowing eyes
  for (const dz of [-1, 1]) {
    const z = dz * (half - 0.45);
    k.s(G.cylLo, 0x7a4e2a, 0.2, 3.0, z, 0.35, 6.0, 0.35);
    k.s(G.box, 0x8a5a30, 0.2, 5.9, z, 0.95, 1.4, 0.95);
    k.s(G.box, 0x5a3418, -0.3, 5.45, z, 0.1, 0.3, 0.55);
    k.g(G.box, 0x5dff86, -0.3, 6.15, z - 0.22, 0.08, 0.16, 0.16);
    k.g(G.box, 0x5dff86, -0.3, 6.15, z + 0.22, 0.08, 0.16, 0.16);
  }
  k.s(G.box, 0xc8a060, 0.2, 6.75, 0, 0.5, 0.5, SHELTER_LEN + 0.4);
  // striped awning sloping out over the track edge
  const n = 6;
  for (let j = 0; j < n; j++) k.s(G.box, j % 2 ? 0xf4f4e8 : 0x2fcf5f, -1.0, 6.35, -half + (j + 0.5) * SHELTER_LEN / n, 2.7, 0.1, SHELTER_LEN / n, 0, 0, 0.32);
  for (let j = 0; j < n * 2; j++) k.s(G.cone, j % 2 ? 0xf4f4e8 : 0x2fcf5f, -2.3, 5.75, -half + (j + 0.5) * SHELTER_LEN / (n * 2), 0.4, 0.4, 0.4, PI, 0, 0);
  // lit floor: edge strip + big cross
  k.g(G.box, 0x5dff86, 0.15, 0.04, 0, 0.25, 0.05, SHELTER_LEN - 1);
  k.g(G.box, 0x5dff86, cx, 0.045, 0, 1.0, 0.04, 3.2);
  k.g(G.box, 0x5dff86, cx, 0.045, 0, 3.2, 0.04, 1.0);
  // cliff-top beacon: rock base, pole, glowing flag with white cross, orb
  k.s(G.box, 0x6a6a70, cx, H + 0.1, 0, 1.4, 0.9, 1.4);
  k.m(G.cylLo, 0xcccccc, cx, H + 3.2, 0, 0.14, 6.4, 0.14);
  k.g(G.box, 0x3cff6a, cx, H + 5.3, -1.3, 0.06, 1.6, 2.4);
  for (const ox of [-0.05, 0.05]) { k.g(G.box, 0xffffff, cx + ox, H + 5.3, -1.3, 0.04, 1.1, 0.32); k.g(G.box, 0xffffff, cx + ox, H + 5.3, -1.3, 0.04, 0.32, 1.1); }
  k.g(G.sphere, 0x7affa0, cx, H + 6.7, 0, 0.55);
  // additive light beam + soft floor glow
  const beam = colorize(prep(new THREE.CylinderGeometry(0.9, 0.5, 40, 10, 6, true)), 0);
  beam.translate(cx, H + 6.7 + 20, 0); gradY(beam, 0x3cff7a, 0x000000, H + 6.7, H + 46.7);
  const floor = colorize(prep(new THREE.PlaneGeometry(SHELTER_DEPTH - 1, SHELTER_LEN - 1).rotateX(-PI / 2)), 0x1c8a40);
  floor.translate(cx, 0.03, 0);
  k.add.push(beam, floor);
  const geos = k.geos(), M = kitMats({ addOpacity: 0.4 });
  const mats = list.map(({ s, zc }) => mtx(s * X, 0, zc, s > 0 ? 0 : PI));
  for (const key in geos) {
    const im = instancedMats(scene, geos[key], M[key], mats, { shadow: key === 'solid' });
    if (key === 'add') im.renderOrder = 5;
  }
}

// ------------------------------------------------ distance markers (one atlas, two draw calls)
export function buildDistanceMarkers(scene, trackEnd, cliffH, avoidZs = []) {
  const list = [];
  for (let d = 100; -d > trackEnd + 6; d += 100) {
    let z = -d;
    if (avoidZs.some(az => Math.abs(az - z) < 4)) z -= 5;
    list.push({ d, z });
  }
  if (!list.length) return;
  const cols = 4, rows = Math.ceil(list.length / cols), cw = 256, ch = 96;
  const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * rows;
  const x = c.getContext('2d');
  list.forEach((m, i) => {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
    x.fillStyle = '#ffc93a'; x.fillRect(ox, oy, cw, ch);
    x.fillStyle = '#16306a'; x.fillRect(ox + 7, oy + 7, cw - 14, ch - 14);
    x.font = '900 58px "Lilita One", "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff'; x.fillText(m.d + ' m', ox + cw / 2, oy + ch / 2 + 3);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const faces = [], mats = [], k = new Kit(), BW = 3.6, BH = 1.35, by = cliffH + 2.6;
  k.s(G.cylLo, 0x5a5a62, 0, cliffH + 1.0, -0.15, 0.16, 3.0, 0.16);
  k.s(G.box, 0x22222a, 0, by, -0.12, BW + 0.2, BH + 0.2, 0.2);
  for (const m of list) for (const s of [-1, 1]) {
    const px = s * (X + 1.4);
    mats.push(mtx(px, 0, m.z));
    const i = list.indexOf(m), u0 = (i % cols) / cols, v1 = 1 - Math.floor(i / cols) / rows, u1 = u0 + 1 / cols, v0 = v1 - 1 / rows;
    const f = new THREE.PlaneGeometry(BW, BH), uv = f.attributes.uv;
    for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) ? u1 : u0, uv.getY(q) ? v1 : v0);
    f.translate(px, by, m.z + 0.0); faces.push(f);
  }
  const geos = k.geos(), M = kitMats();
  instancedMats(scene, geos.solid, M.solid, mats, { shadow: true });
  const fm = new THREE.Mesh(mergeGeometries(faces), trackMat(new THREE.MeshBasicMaterial({ map: tex })));
  scene.add(fm);
}

// ------------------------------------------------ lava rims: dark crust, glowing inner edge, ember rocks
export function buildLavaRims(scene, lavaList) {
  if (!lavaList.length) return;
  const rims = [], strips = [], rocks = [], embers = [];
  for (const l of lavaList) for (const s of [-1, 1]) {
    const ze = s > 0 ? l.maxZ : l.minZ;
    rims.push(mtx(0, 0.13, ze + s * 0.2, 0, TRACK_HALF * 2, 0.26, 0.5));
    strips.push(mtx(0, 0.09, ze - s * 0.12, 0, TRACK_HALF * 2, 0.05, 0.3));
    for (let x = -X + 0.6; x < X; x += lrr(1.2, 2.2)) {
      const sc = lrr(0.28, 0.55);
      (lr() < 0.25 ? embers : rocks).push(mtx(x, 0.12, ze + s * lrr(0.1, 0.5), lr() * 6, sc * 1.3, sc * 0.8, sc));
    }
  }
  const dark = trackMat(new THREE.MeshStandardMaterial({ color: 0x241a1a, roughness: 0.9, flatShading: true, emissive: 0x5a1200, emissiveIntensity: 0.5 }));
  const glow = trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(2.2) }));
  const ember = trackMat(new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.6, flatShading: true, emissive: 0xff4a10, emissiveIntensity: 1.4 }));
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  instancedMats(scene, new THREE.BoxGeometry(1, 1, 1), dark, rims, { shadow: true });
  instancedMats(scene, new THREE.BoxGeometry(1, 1, 1), glow, strips);
  instancedMats(scene, rockGeo, dark, rocks, { shadow: true });
  instancedMats(scene, rockGeo.clone(), ember, embers);
}

// ------------------------------------------------ pendulum parts (shared per build)
export function makePendulumKit(len) {
  const wood = new Kit(), metal = new Kit();
  // chain of alternating links down to the log
  const link = new THREE.TorusGeometry(0.2, 0.055, 5, 10);
  const top = -0.2, bot = -len + 0.95, nL = Math.max(4, Math.round((top - bot) / 0.34));
  for (let j = 0; j < nL; j++) { const y = top - (j + 0.5) * (top - bot) / nL; metal.m(link, 0x8a8a94, 0, y, 0, 1, 1.5, 1, 0, j % 2 ? PI / 2 : 0, 0); }
  metal.m(G.torus, 0x6a6a74, 0, -len + 0.95, 0, 0.35, 0.35, 0.35, 0, 0, 0);
  // log along z with bark bands, end caps, iron bands and radial spikes
  wood.s(G.cyl, 0x6b4a2a, 0, -len, 0, 0.9, 3.2, 0.9, PI / 2, 0, 0);
  for (const z of [-1.5, 1.5]) wood.s(G.cyl, 0x4a3018, 0, -len, z, 0.93, 0.18, 0.93, PI / 2, 0, 0);
  for (const z of [-1.62, 1.62]) wood.s(G.cyl, 0xc09a68, 0, -len, z, 0.82, 0.04, 0.82, PI / 2, 0, 0);
  for (const z of [-0.6, 0.6]) metal.m(G.cyl, 0x6a6a74, 0, -len, z, 0.96, 0.22, 0.96, PI / 2, 0, 0);
  for (const z of [-1.1, 0, 1.1]) for (let j = 0; j < 8; j++) {
    const a = j / 8 * PI * 2 + (z ? 0 : PI / 8);
    if (Math.sin(a) > 0.85) continue; // keep the chain mount clear
    metal.m(G.coneLo, 0xc8c8d0, Math.cos(a) * 1.2, -len + Math.sin(a) * 1.2, z, 0.18, 0.7, 0.18, 0, 0, a - PI / 2);
  }
  const wg = wood.geos().solid, mg = metal.geos().metal, M = kitMats({ rough: 0.85 });
  return {
    wood: wg, metal: mg, woodMat: M.solid, metalMat: M.metal,
    support: (scene, z, y) => {
      const sm = trackMat(new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.85, flatShading: true }));
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sm); p.scale.set(1.0, y - 8.6, 1.0); p.position.set(s * (X + 1.2), (y + 8.6) / 2, z); p.castShadow = true; scene.add(p);
      }
    },
  };
}

// ------------------------------------------------ crab (one merged mesh, jointed legs & claws, faces +z)
export function makeCrabGeo() {
  const k = new Kit(), red = 0xe8452c, redD = 0xc0301e, orange = 0xf07a50, belly = 0xf6c9a0;
  k.s(G.sphere, red, 0, 0.95, 0, 1.3, 0.55, 1.0);
  k.s(G.sphere, 0xf26a3a, 0, 1.22, -0.05, 1.0, 0.36, 0.75);
  k.s(G.sphere, belly, 0, 0.74, 0.05, 1.18, 0.32, 0.9);
  for (const [x, z] of [[-0.5, -0.2], [0.45, -0.35], [0.1, 0.3], [-0.2, -0.55]]) k.s(G.sphereLo, 0xa82a1a, x, 1.4, z, 0.16, 0.08, 0.16);
  for (const s of [-1, 1]) {
    k.seg([s * 0.3, 1.2, 0.55], [s * 0.38, 1.85, 0.62], 0.07, red);
    k.s(G.sphere, 0xffffff, s * 0.38, 1.95, 0.65, 0.18);
    k.s(G.sphere, 0x111111, s * 0.38, 1.98, 0.8, 0.085);
    // claw arm: shoulder → elbow → wrist, then palm + two pincers (open)
    const sh = [s * 1.1, 1.0, 0.45], el = [s * 1.8, 1.35, 0.8], wr = [s * 1.85, 1.35, 1.55];
    k.s(G.sphereLo, redD, ...sh, 0.26).seg(sh, el, 0.2, red).s(G.sphereLo, redD, ...el, 0.24).seg(el, wr, 0.19, red).s(G.sphereLo, redD, ...wr, 0.22);
    const sc = s > 0 ? 1.15 : 1.0;
    k.s(G.sphere, redD, s * 1.85, 1.35, 2.0, 0.5 * sc, 0.42 * sc, 0.62 * sc);
    k.s(G.cone, orange, s * 1.85, 1.2, 2.75 * sc, 0.24 * sc, 1.0 * sc, 0.2 * sc, PI / 2 - 0.15, 0, 0);
    k.s(G.cone, orange, s * 1.85, 1.68, 2.6 * sc, 0.17 * sc, 0.85 * sc, 0.15 * sc, PI / 2 + 0.55, 0, 0);
    k.s(G.sphereLo, 0x3a1a10, s * 1.85, 1.16, 3.24 * sc, 0.07);
    for (let j = 0; j < 4; j++) {
      const zz = -0.6 + j * 0.32, hip = [s * 0.95, 0.85, zz], knee = [s * 1.75, 1.3, zz * 1.25], foot = [s * 2.3, 0.02, zz * 1.4];
      k.seg(hip, knee, 0.09, red).s(G.sphereLo, redD, ...knee, 0.11).seg(knee, foot, 0.07, orange);
    }
  }
  return { geo: k.geos().solid, mat: kitMats({ rough: 0.45, flat: false }).solid };
}

// ------------------------------------------------ abyss bridges: planks, rope rails, glowing edges + pit crystals
export function buildBridgeVisuals(scene, pits) {
  if (!pits.length) return;
  const k = new Kit(), crystals = [];
  for (const h of pits) {
    const bx = h.bridgeX, hw = h.bridgeW / 2, z0 = h.minZ - 0.1, z1 = h.maxZ + 0.1, len = z1 - z0;
    for (let z = z0 + 0.3; z < z1 - 0.1; z += 0.62) k.s(G.box, (Math.round(z * 3) % 2) ? 0x5a3a2a : 0x6a4632, bx, 0.04, z, h.bridgeW - 0.1, 0.08, 0.5, 0, lrr(-0.03, 0.03), 0);
    for (const s of [-1, 1]) {
      const ex = bx + s * (hw - 0.1);
      for (const z of [z0, z1]) { k.s(G.cylLo, 0x3a2a4a, ex, 0.75, z, 0.13, 1.6, 0.13); k.g(new THREE.OctahedronGeometry(1, 0), 0xc69bff, ex, 1.75, z, 0.2, 0.34, 0.2); }
      for (const y of [1.4, 0.8]) { const m = [ex, y - 0.3, (z0 + z1) / 2]; k.seg([ex, y, z0], m, 0.05, 0xcdb488).seg(m, [ex, y, z1], 0.05, 0xcdb488); }
      for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.0) k.seg([ex, 1.4 - 0.3 * Math.sin(PI * (z - z0) / len), z], [ex, 0.08, z], 0.025, 0xcdb488);
      k.g(G.box, 0xa070ff, bx + s * hw, 0.06, (z0 + z1) / 2, 0.12, 0.1, len);
    }
    for (const ze of [h.minZ, h.maxZ]) for (let j = 0; j < 7; j++) {
      const x = lrr(-X + 1, X - 1); if (Math.abs(x - bx) < hw + 0.5) continue;
      const L = lrr(0.8, 2.2); crystals.push(mtx(x, -0.4 - L / 2, ze + (ze === h.minZ ? 0.35 : -0.35), lr() * 3, lrr(0.25, 0.45), L, lrr(0.25, 0.45), PI, 0));
    }
  }
  k.build(scene);
  instancedMats(scene, new THREE.OctahedronGeometry(1, 0), trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb07aff).multiplyScalar(1.8) })), crystals);
}
