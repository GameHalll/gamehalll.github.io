import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as CFG from './config.js';
import {
  TRACK_HALF, ZONE_START, SHELTER_LEN, SHELTER_DEPTH,
  PLAZA_DEPTH, PLAZA_HALF, PLOTS, PLOT_W, PLOT_D, RARITIES, SLOTS_MAX, PLOT_COLORS, WORLDS,
} from './config.js';
import { toon, mesh, G, makeLabel } from './models.js';
import { getSurface, fbm } from './textures.js';
import { buildGate, buildShelterVisuals, buildDistanceMarkers, buildLavaRims, makePendulumKit, makeCrabGeo, buildBridgeVisuals } from './landmarks.js';
import { decorateWorld, updateWorldDecor } from './worlddecor.js';

const WALL_T = 14;
const CLIFF_H = 9;

// seeded rng so the track is the same every session
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + rnd() * (b - a);

export const BIOMES = {
  beach: { rock: [0xc99a64, 0xe0b98a], top: 0x6fc24a, fog: 0xcfeaff },
  tidepools: { rock: [0x8c7b6a, 0xa89480], top: 0x5aa84a, fog: 0xc7e3f2 },
  reef: { rock: [0xd98f86, 0xf0b4a0], top: 0x58c7a0, fog: 0xc0ecf0 },
  jungle: { rock: [0x5b5240, 0x786a4e], top: 0x2f8a2a, fog: 0xb8dcc0 },
  volcano: { rock: [0x2a2224, 0x3d3134], top: 0x4a3a36, fog: 0x8a5040 },
  glacier: { rock: [0x9fc6e6, 0xd6ecfb], top: 0xffffff, fog: 0xdaf0ff },
  abyss: { rock: [0x2c2048, 0x483470], top: 0x6a4aa8, fog: 0x3a2c66 },
};

function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
const vcMatSmooth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

// ------------------------------------------------ prefab geometries
function palmGeo() {
  const parts = [];
  const h = 8, segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = i / segs, g = new THREE.CylinderGeometry(0.32 - t * 0.1, 0.38 - t * 0.1, h / segs + 0.05, 7);
    g.translate(Math.sin(t * 1.4) * 1.2, t * h + h / segs / 2, 0);
    parts.push(tint(g, i % 2 ? 0x8a6038 : 0xa47444));
  }
  const top = new THREE.Vector3(Math.sin(1.4) * 1.2, h, 0);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, leaf = new THREE.ConeGeometry(0.9, 5, 4, 1);
    leaf.scale(1, 1, 0.18); leaf.rotateZ(-Math.PI / 2 - 0.5 - (i % 2) * 0.25); leaf.translate(2.3, -0.5, 0); leaf.rotateY(a);
    leaf.translate(top.x, top.y, top.z);
    parts.push(tint(leaf, i % 2 ? 0x2f9a3a : 0x46b848));
  }
  for (let i = 0; i < 3; i++) { const c = new THREE.SphereGeometry(0.35, 6, 5); c.translate(top.x + Math.cos(i * 2) * 0.4, top.y - 0.4, Math.sin(i * 2) * 0.4); parts.push(tint(c, 0x6a4420)); }
  return mergeGeometries(parts);
}
function rockGeo(r = 1, detail = 1, squash = 0.7, col = 0x8a7a6a) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.75 + fbm(x * 0.9 + 10, z * 0.9 + y * 0.7, 64, 3) * 0.55;
    p.setXYZ(i, x * n, Math.max(-0.2 * r, y * n * squash) + 0.3 * r, z * n);
  }
  g.computeVertexNormals();
  return tint(g, col);
}
function coralGeo() {
  const parts = [], cols = [0xff6f91, 0xffa94d, 0xb06bff, 0x4fd6c0];
  const col = cols[Math.floor(rnd() * cols.length)];
  const branch = (x, y, z, ax, az, len, r, d) => {
    const g = new THREE.CylinderGeometry(r * 0.7, r, len, 6); g.translate(0, len / 2, 0); g.rotateX(ax); g.rotateZ(az); g.translate(x, y, z);
    parts.push(tint(g, col));
    const tip = new THREE.Vector3(0, len, 0).applyEuler(new THREE.Euler(ax, 0, az)).add(new THREE.Vector3(x, y, z));
    const s = new THREE.SphereGeometry(r * 0.9, 6, 5); s.translate(tip.x, tip.y, tip.z); parts.push(tint(s, col));
    if (d > 0) for (let i = 0; i < 2; i++) branch(tip.x, tip.y, tip.z, ax + rr(-0.6, 0.6), az + rr(-0.7, 0.7), len * 0.7, r * 0.7, d - 1);
  };
  branch(0, 0, 0, 0, 0, 1.2, 0.22, 2);
  return mergeGeometries(parts);
}
function treeGeo() {
  const parts = [];
  const t = new THREE.CylinderGeometry(0.4, 0.6, 7, 7); t.translate(0, 3.5, 0); parts.push(tint(t, 0x5a3e24));
  for (let i = 0; i < 5; i++) { const s = new THREE.IcosahedronGeometry(rr(2, 3), 1); s.translate(rr(-1.5, 1.5), 7 + rr(-0.5, 1.5), rr(-1.5, 1.5)); parts.push(tint(s, [0x2f7a2a, 0x3f9a34, 0x256a24][i % 3])); }
  return mergeGeometries(parts);
}
function crystalGeo(col = 0xb07aff) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const h = rr(1.5, 4), g = new THREE.ConeGeometry(rr(0.3, 0.6), h, 5); g.translate(0, h / 2, 0);
    g.rotateZ(rr(-0.5, 0.5)); g.rotateX(rr(-0.5, 0.5)); g.translate(rr(-0.6, 0.6), 0, rr(-0.6, 0.6));
    parts.push(tint(g, col));
  }
  return mergeGeometries(parts);
}
function spikeGeo() {
  const parts = [];
  for (let i = 0; i < 4; i++) { const h = rr(1.4, 2.8), g = new THREE.ConeGeometry(rr(0.35, 0.6), h, 5); g.translate(rr(-0.8, 0.8), h / 2, rr(-0.5, 0.5)); parts.push(tint(g, i % 2 ? 0xbfe6ff : 0xe6f6ff)); }
  return mergeGeometries(parts);
}
function fernGeo(col = 0x3f9a34) {
  const parts = [];
  for (let i = 0; i < 6; i++) { const g = new THREE.ConeGeometry(0.4, 2.2, 3); g.scale(1, 1, 0.2); g.translate(0, 1.1, 0); g.rotateZ(0.7); g.rotateY(i / 6 * Math.PI * 2); parts.push(tint(g, col)); }
  return mergeGeometries(parts);
}

// ------------------------------------------------ biome props (decor-only rng so the hazard rng sequence stays untouched)
let dseed = 4242;
const drnd = () => (dseed = (dseed * 16807) % 2147483647) / 2147483647;
const dr = (a, b) => a + drnd() * (b - a);
const dpick = a => a[Math.floor(drnd() * a.length)];
const vcGloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.25, flatShading: true });
const vcEmber = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, emissive: 0xff4a10, emissiveIntensity: 1.3 });
const vcGlowCyan = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, flatShading: true, emissive: 0x1a9aff, emissiveIntensity: 0.9 });
const vcGlowPink = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, flatShading: true, emissive: 0x9a2ac8, emissiveIntensity: 0.55 });
const TAU = Math.PI * 2;
const dC = (r0, r1, h, n = 6) => new THREE.CylinderGeometry(r0, r1, h, n);
const dS = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
const dB = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const dK = (r, h, n = 5) => new THREE.ConeGeometry(r, h, n);
const dome = (r, w = 8, h = 4) => new THREE.SphereGeometry(r, w, h, 0, TAU, 0, Math.PI / 2);
const dM = parts => mergeGeometries(parts);

function starfishGeo(col = 0xff7a4a) {
  const p = [tint(dC(0.2, 0.22, 0.1, 5).translate(0, 0.05, 0), col)];
  for (let i = 0; i < 5; i++) p.push(tint(dK(0.14, 0.62, 4).rotateZ(-Math.PI / 2).scale(1, 0.45, 1).translate(0.45, 0.05, 0).rotateY(i / 5 * TAU), col));
  return dM(p);
}
function towelGeo(a, b) {
  const p = [];
  for (let i = 0; i < 4; i++) p.push(tint(dB(0.45, 0.04, 2.4).translate(-0.675 + i * 0.45, 0.02, 0), i % 2 ? b : a));
  return dM(p);
}
function bucketGeo() {
  return dM([
    tint(dC(0.34, 0.25, 0.5, 9).translate(0, 0.25, 0), 0xff4a4a), tint(dC(0.37, 0.37, 0.05, 9).translate(0, 0.5, 0), 0xffd23f),
    tint(new THREE.TorusGeometry(0.32, 0.025, 3, 8, Math.PI).translate(0, 0.5, 0), 0xffd23f),
    tint(dC(0.035, 0.035, 0.8, 4).rotateZ(0.5).translate(0.6, 0.35, 0.1), 0x3a7aff), tint(dB(0.24, 0.3, 0.04).rotateZ(0.5).translate(0.8, 0.05, 0.1), 0x3a7aff),
    tint(dS(0.42).scale(1, 0.45, 1).translate(0.85, 0, 0.1), 0xe2c48a),
  ]);
}
function driftwoodGeo() {
  return dM([
    tint(dC(0.16, 0.24, 3.2).rotateZ(Math.PI / 2).translate(0, 0.18, 0), 0xb3a08a),
    tint(dC(0.06, 0.11, 1.3, 5).rotateZ(1.0).translate(0.7, 0.55, 0.15), 0xa8957e),
    tint(dC(0.05, 0.08, 0.7, 5).rotateX(0.9).translate(-0.8, 0.35, 0.25), 0x9a8a74),
  ]);
}
function gullGeo() {
  const p = [
    tint(dS(0.35).scale(1.4, 0.9, 0.8).translate(0, 0.62, 0), 0xffffff), tint(dS(0.2).translate(0.45, 0.88, 0), 0xffffff),
    tint(dK(0.06, 0.25, 4).rotateZ(-Math.PI / 2).translate(0.7, 0.85, 0), 0xffc020),
    tint(dK(0.16, 0.4, 4).rotateZ(Math.PI / 2).translate(-0.6, 0.66, 0), 0x8a929c),
  ];
  for (const s of [-1, 1]) {
    p.push(tint(dB(0.7, 0.1, 0.22).rotateX(s * 0.3).translate(-0.08, 0.7, s * 0.27), 0x9aa2ac));
    p.push(tint(dC(0.025, 0.025, 0.36, 4).translate(0, 0.18, s * 0.1), 0xff9a30));
    p.push(tint(dS(0.035, 4, 3).translate(0.55, 0.93, s * 0.13), 0x111111));
  }
  return dM(p);
}
function grassTuftGeo(a = 0x8ab84a, b = 0x6a9a3a) {
  const p = [];
  for (let i = 0; i < 9; i++) { const h = dr(0.6, 1.1); p.push(tint(dK(0.06, h, 3).translate(0, h / 2, 0).rotateZ(dr(0.15, 0.45)).rotateY(i / 9 * TAU + dr(0, 0.5)), i % 2 ? a : b)); }
  return dM(p);
}
function umbrellaGeo(a, b) {
  const p = [tint(dC(0.05, 0.05, 2.8, 5).translate(0, 1.4, 0), 0xffffff)];
  for (let i = 0; i < 8; i++) p.push(tint(new THREE.ConeGeometry(1.8, 0.7, 2, 1, false, i * Math.PI / 4, Math.PI / 4).translate(0, 2.9, 0), i % 2 ? a : b));
  return dM(p).rotateZ(0.12);
}
function seaweedGeo() {
  const p = [];
  for (let j = 0; j < 4; j++) {
    const ox = dr(-0.4, 0.4), oz = dr(-0.4, 0.4), n = 3 + Math.floor(drnd() * 3);
    for (let k = 0; k < n; k++) p.push(tint(dC(0.05, 0.09, 0.55, 4).scale(2, 1, 0.35).rotateY(j).translate(ox + Math.sin(k * 1.3 + j) * 0.15, k * 0.5 + 0.27, oz), j % 2 ? 0x3a7a2a : 0x6a7a24));
  }
  return dM(p);
}
function anemoneGeo(body, tent) {
  const p = [tint(dC(0.32, 0.42, 0.45, 8).translate(0, 0.22, 0), body)];
  for (let i = 0; i < 12; i++) p.push(tint(dK(0.05, 0.45, 4).translate(0, 0.22, 0).rotateX(0.5 + (i % 2) * 0.3).translate(0, 0.42, 0.18).rotateY(i / 12 * TAU), tent));
  return dM(p);
}
function musselGeo() {
  const p = [];
  for (let i = 0; i < 8; i++) p.push(tint(dS(0.16, 5, 4).scale(1.6, 0.6, 0.8).rotateY(dr(0, 6.3)).rotateZ(dr(-0.3, 0.5)).translate(dr(-0.5, 0.5), 0.08 + dr(0, 0.1), dr(-0.5, 0.5)), i % 2 ? 0x1c2234 : 0x2c3450));
  for (let i = 0; i < 4; i++) p.push(tint(dK(0.08, 0.12, 5).translate(dr(-0.6, 0.6), 0.06, dr(-0.6, 0.6)), 0xd8d0c0));
  return dM(p);
}
function poolRockGeo() {
  const p = [tint(dC(1.0, 1.0, 0.05, 12).translate(0, 0.03, 0), 0x2f86b0), starfishGeo(0xff5a8a).scale(0.5, 0.5, 0.5).translate(0.3, 0.02, 0.2)];
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + dr(0, 0.4); p.push(tint(new THREE.IcosahedronGeometry(dr(0.35, 0.6), 0).scale(1, 0.6, 1).translate(Math.cos(a) * 1.2, 0.15, Math.sin(a) * 1.2), [0x7a6e62, 0x8c7f70, 0x6a5f55][i % 3])); }
  return dM(p);
}
function seaFanGeo(col, rib) {
  const p = [tint(dC(0.06, 0.09, 0.5, 5).translate(0, 0.25, 0), rib), tint(dome(1.1, 10, 5).scale(1, 1.05, 0.07).translate(0, 0.45, 0), col)];
  for (let i = 0; i < 5; i++) p.push(tint(dC(0.03, 0.04, 1.1, 4).translate(0, 0.55, 0).rotateZ(-0.9 + i * 0.45).translate(0, 0.45, 0), rib));
  return dM(p);
}
function tubeCoralGeo() {
  const p = [];
  for (let i = 0; i < 7; i++) {
    const r = dr(0.12, 0.22), h = dr(0.6, 1.6), x = dr(-0.5, 0.5), z = dr(-0.5, 0.5);
    p.push(tint(dC(r, r * 1.15, h, 7).translate(x, h / 2, z), [0xffa63a, 0xff7a3a, 0xffc84a][i % 3]), tint(dC(r * 0.72, r * 0.72, 0.03, 7).translate(x, h + 0.005, z), 0x5a1a10));
  }
  return dM(p);
}
function brainCoralGeo() {
  const g = dome(1, 14, 8), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 1 + 0.07 * Math.sin(x * 10 + Math.sin(z * 6) * 2); pos.setXYZ(i, x * k, y * 0.65 * k, z * k); }
  g.computeVertexNormals();
  return tint(g, 0xe8909a);
}
function conchGeo() {
  return dM([
    tint(dK(0.28, 0.9, 8).rotateZ(Math.PI / 2).translate(-0.15, 0.24, 0), 0xf2d2b0), tint(dS(0.3, 8, 6).scale(1, 0.85, 0.9).translate(0.3, 0.24, 0), 0xf2d2b0),
    tint(dK(0.06, 0.14, 4).translate(0.2, 0.52, 0), 0xe0b890), tint(dK(0.06, 0.14, 4).translate(0.4, 0.5, 0.05), 0xe0b890),
    tint(dS(0.18, 6, 4).scale(0.5, 1, 1).translate(0.55, 0.22, 0.08), 0xff9aa8),
  ]);
}
function bigLeafGeo() {
  const p = [];
  for (let i = 0; i < 5; i++) {
    const col = [0x2a8a3a, 0x3aa84a, 0x1f7a30][i % 3];
    p.push(tint(dS(0.8, 6, 4).scale(0.6, 1.8, 0.08).translate(0, 1.6, 0).rotateX(-dr(0.7, 1.1)).rotateY(i / 5 * TAU + dr(0, 0.6)), col));
    p.push(tint(dC(0.04, 0.05, 1.2, 4).translate(0, 0.6, 0).rotateX(-0.5).rotateY(i / 5 * TAU), 0x3a6a24));
  }
  return dM(p);
}
function vineGeo(col = 0x2f7a2a, leaf = 0x46a83a) {
  const p = [tint(dC(0.07, 0.07, 3, 4).rotateZ(Math.PI / 2).translate(1.5, 0.05, 0), col)];
  for (let j = 0; j < 3; j++) {
    const z = dr(-1.2, 1.2), len = dr(3, 6.5), n = 5, sl = len / n;
    for (let k = 0; k < n; k++) {
      const x = Math.sin(k * 1.7 + j) * 0.12;
      p.push(tint(dC(0.05, 0.06, sl, 4).translate(x, -(k + 0.5) * sl, z), col));
      p.push(tint(dS(0.2, 4, 3).scale(1, 0.5, 0.25).rotateZ(k % 2 ? 0.6 : -0.6).translate(x + (k % 2 ? 0.15 : -0.15), -(k + 0.3) * sl, z), leaf));
    }
  }
  return dM(p);
}
function icicleGeo() {
  const p = [tint(dB(3, 0.25, 3).translate(1.5, 0.05, 0), 0xf4faff)];
  for (let j = 0; j < 9; j++) { const len = dr(0.8, 3.2); p.push(tint(dK(dr(0.12, 0.25), len, 5).rotateX(Math.PI).translate(dr(-0.1, 0.2), -len / 2, dr(-1.3, 1.3)), j % 2 ? 0xd6f0ff : 0xbfe6ff)); }
  return dM(p);
}
function mushroomGeo(cap, stem, dot) {
  const p = [];
  [[1, 0, 0], [0.7, 0.45, 0.3], [0.5, -0.3, 0.4]].forEach(([sc, px, pz]) => {
    p.push(tint(dC(0.1 * sc, 0.14 * sc, 0.6 * sc).translate(px, 0.3 * sc, pz), stem));
    p.push(tint(dome(0.38 * sc).scale(1, 0.7, 1).translate(px, 0.55 * sc, pz), cap));
    p.push(tint(dC(0.37 * sc, 0.37 * sc, 0.02, 8).translate(px, 0.55 * sc, pz), stem));
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; p.push(tint(dS(0.05 * sc, 4, 3).translate(px + Math.sin(0.6) * Math.cos(a) * 0.38 * sc, 0.55 * sc + Math.cos(0.6) * 0.38 * sc * 0.7, pz + Math.sin(0.6) * Math.sin(a) * 0.38 * sc), dot)); }
  });
  return dM(p);
}
function stoneHeadGeo() {
  const st = 0x7d7766, dk = 0x3a3630, p = [
    tint(dB(1.6, 0.3, 1.4).translate(0, 0.15, 0), 0x6a6456), tint(dB(1.3, 2.2, 1.1).translate(0, 1.4, 0), st),
    tint(dB(1.4, 0.28, 0.35).translate(0, 2.05, 0.55), st), tint(dB(0.32, 0.8, 0.35).translate(0, 1.45, 0.65), st),
    tint(dB(0.6, 0.08, 0.05).translate(0, 0.85, 0.56), dk), tint(dB(1.35, 0.15, 1.15).translate(0, 2.55, 0), 0x4f7f3a),
  ];
  for (const s of [-1, 1]) p.push(tint(dB(0.3, 0.18, 0.06).translate(s * 0.3, 1.82, 0.56), dk), tint(dB(0.15, 0.8, 0.3).translate(s * 0.72, 1.5, 0), st));
  return dM(p);
}
function ruinGeo() {
  return dM([
    tint(dB(3, 0.3, 2).translate(0, 0.15, 0), 0x7a7262), tint(dC(0.4, 0.45, 2.4, 8).translate(-0.8, 1.5, 0), 0x8a8270),
    tint(dC(0.42, 0.42, 0.1, 8).translate(-0.8, 2.75, 0), 0x4f7f3a), tint(dC(0.4, 0.45, 1.1, 8).translate(0.9, 0.85, 0.3), 0x8a8270),
    tint(dC(0.4, 0.4, 0.8, 8).rotateZ(Math.PI / 2).translate(0.3, 0.7, -0.6), 0x847c6a), tint(dB(0.7, 0.5, 0.6).rotateY(0.4).translate(-1.6, 0.25, 0.9), 0x6e6858),
  ]);
}
function ventGeo() {
  const p = [tint(dC(0.55, 1.5, 1.1, 9).translate(0, 0.55, 0), 0x3a2e2c)];
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; p.push(tint(new THREE.IcosahedronGeometry(0.3, 0).translate(Math.cos(a) * 1.5, 0.1, Math.sin(a) * 1.5), 0x2a2224)); }
  [[0.1, 2.0, 0.55, 0x6c6466], [0.35, 3.0, 0.75, 0x7e7678], [0.2, 4.2, 1.0, 0x8e888a], [0.6, 5.6, 1.25, 0x9e9a9c]].forEach(([x, y, r, c]) => p.push(tint(dS(r).translate(x, y, 0), c)));
  return dM(p);
}
function obsidianGeo() {
  const p = [];
  for (let i = 0; i < 5; i++) { const h = dr(0.8, 2.2); p.push(tint(dK(dr(0.2, 0.4), h, 4).translate(0, h / 2, 0).rotateZ(dr(-0.4, 0.4)).rotateX(dr(-0.4, 0.4)).translate(dr(-0.6, 0.6), 0, dr(-0.6, 0.6)), i % 2 ? 0x15121a : 0x221c2a)); }
  return dM(p);
}
function charredTreeGeo() {
  const p = [tint(dC(0.22, 0.42, 5).translate(0, 2.5, 0), 0x1e1816)];
  for (let i = 0; i < 5; i++) { const l = dr(1.2, 2.2); p.push(tint(dC(0.05, 0.12, l, 4).translate(0, l / 2, 0).rotateZ(dr(0.6, 1.1)).rotateY(i * 1.3 + dr(0, 0.5)).translate(0, dr(2.6, 4.6), 0), 0x2a201c)); }
  return dM(p);
}
function emberGeo() {
  const p = [];
  for (let i = 0; i < 6; i++) p.push(tint(new THREE.IcosahedronGeometry(dr(0.1, 0.22), 0).scale(1, 0.5, 1).translate(dr(-0.8, 0.8), 0.05, dr(-0.8, 0.8)), [0xff6a1a, 0xffa03a, 0xd8401a][i % 3]));
  return dM(p);
}
function pebblesGeo(a, b) {
  const p = [];
  for (let i = 0; i < 7; i++) p.push(tint(new THREE.IcosahedronGeometry(dr(0.08, 0.18), 0).scale(1, 0.6, 1).translate(dr(-0.8, 0.8), 0.04, dr(-0.8, 0.8)), i % 2 ? a : b));
  return dM(p);
}
function snowMoundGeo() {
  return dM([tint(dS(1.4, 10, 6).scale(1, 0.38, 0.9), 0xf2f8ff), tint(dS(0.9, 8, 5).scale(1, 0.4, 1).translate(1.1, 0, 0.4), 0xe6f0fa)]);
}
function frozenTreeGeo() {
  const p = [tint(dC(0.18, 0.28, 1.4).translate(0, 0.7, 0), 0x5a4a40)];
  for (let i = 0; i < 4; i++) { const r = 1.6 - i * 0.32, y = 1.4 + i * 0.95; p.push(tint(dK(r, 1.6, 7).translate(0, y, 0), 0x2f6a5a), tint(dK(r * 0.7, 0.8, 7).translate(0, y + 0.45, 0), 0xf4faff)); }
  return dM(p);
}
function penguinGeo() {
  const d = 0x1e2230, p = [
    tint(dS(0.5, 8, 6).scale(0.85, 1.25, 0.75).translate(0, 0.75, 0), d), tint(dS(0.42, 8, 6).scale(0.75, 1.1, 0.5).translate(0, 0.7, 0.2), 0xf4f4f0),
    tint(dS(0.32, 8, 6).translate(0, 1.55, 0), d), tint(dK(0.07, 0.25).rotateX(Math.PI / 2).translate(0, 1.52, 0.34), 0xffa020),
  ];
  for (const s of [-1, 1]) p.push(tint(dS(0.05, 4, 3).translate(s * 0.12, 1.62, 0.27), 0xffffff), tint(dB(0.08, 0.55, 0.22).rotateZ(s * 0.25).translate(s * 0.42, 0.85, 0), d), tint(dB(0.18, 0.06, 0.25).translate(s * 0.13, 0.03, 0.12), 0xffa020));
  return dM([dM(p).translate(0, 0.3, 0), tint(dB(1.0, 0.3, 0.9).translate(0, 0.15, 0), 0xbfe6ff)]);
}
function iceShardGeo() {
  const p = [];
  for (let i = 0; i < 5; i++) p.push(tint(dK(dr(0.08, 0.16), dr(0.4, 0.9), 4).rotateZ(Math.PI / 2 - dr(0, 0.3)).rotateY(dr(0, 6.3)).translate(dr(-0.7, 0.7), 0.06, dr(-0.7, 0.7)), i % 2 ? 0xcfeeff : 0xa8dcff));
  return dM(p);
}
function iceCrystalGeo() {
  const p = [];
  for (let i = 0; i < 6; i++) { const h = dr(1.5, 4); p.push(tint(dK(dr(0.3, 0.7), h, 6).translate(0, h / 2, 0).rotateZ(dr(-0.45, 0.45)).rotateX(dr(-0.45, 0.45)).translate(dr(-0.8, 0.8), 0, dr(-0.8, 0.8)), i % 2 ? 0xa8dcff : 0xd6f2ff)); }
  return dM(p);
}
function snowPatchGeo() {
  return dM([tint(dC(1, 1.1, 0.06, 9).scale(1, 1, 0.7).translate(0, 0.03, 0), 0xf6fbff), tint(dC(0.6, 0.65, 0.06, 8).translate(0.9, 0.03, 0.5), 0xeef6ff)]);
}
function floatCrystalGeo() {
  const p = [];
  for (let i = 0; i < 4; i++) {
    const r = dr(0.25, 0.5), h = dr(0.8, 1.8), col = [0x6ae8ff, 0x9a7aff, 0x5ad0ff][i % 3];
    const g = dM([tint(dK(r, h).translate(0, h / 2, 0), col), tint(dK(r, h * 0.6).rotateX(Math.PI).translate(0, -h * 0.3, 0), col)]);
    p.push(g.rotateZ(dr(-0.5, 0.5)).rotateX(dr(-0.5, 0.5)).translate(dr(-0.8, 0.8), dr(-0.4, 0.6), dr(-0.8, 0.8)));
  }
  return dM(p);
}
function alienPlantGeo() {
  const p = [];
  [[0, 0, 1], [0.7, 0.4, 0.65]].forEach(([ox, oz, sc]) => {
    let x = ox, y = 0;
    for (let k = 0; k < 4; k++) { const nx = x + 0.12 * Math.sin(k + ox); p.push(tint(dC(0.06 * sc, 0.1 * sc, 0.7 * sc, 5).translate(nx, y + 0.35 * sc, oz), 0x3a2a6a)); x = nx; y += 0.7 * sc; }
    p.push(tint(dS(0.32 * sc, 8, 6).translate(x, y + 0.15 * sc, oz), 0xff5ad8));
    for (let i = 0; i < 3; i++) p.push(tint(dS(0.5 * sc, 6, 4).scale(0.25, 1, 0.08).translate(0, 0.5 * sc, 0).rotateZ(0.8).rotateY(i * 2.1).translate(ox, 0, oz), 0x2ac8a8));
  });
  return dM(p);
}
function crystalShardGeo() {
  const p = [];
  for (let i = 0; i < 5; i++) { const h = dr(0.25, 0.6); p.push(tint(dK(dr(0.06, 0.12), h, 4).translate(0, h / 2, 0).rotateZ(dr(-0.6, 0.6)).translate(dr(-0.7, 0.7), 0, dr(-0.7, 0.7)), i % 2 ? 0xc69bff : 0x7ae0ff)); }
  return dM(p);
}
function sporeOrbGeo() {
  const p = [];
  for (let i = 0; i < 3; i++) p.push(tint(new THREE.IcosahedronGeometry(dr(0.12, 0.25), 1).translate(dr(-1, 1), dr(-0.6, 0.6), dr(-1, 1)), i % 2 ? 0x8affff : 0xff8aff));
  return dM(p);
}
function footprintsGeo() {
  const p = [];
  for (let i = 0; i < 8; i++) p.push(tint(dC(0.14, 0.14, 0.02, 7).scale(1, 1, 1.6).translate(i % 2 ? 0.22 : -0.22, 0.012, -i * 0.7 + 2.4), 0xc79c62));
  return dM(p);
}
function leafLitterGeo() {
  const p = [];
  for (let i = 0; i < 8; i++) p.push(tint(dS(0.22, 5, 3).scale(0.6, 0.12, 1.2).rotateY(dr(0, 6.3)).translate(dr(-1, 1), 0.02, dr(-1, 1)), [0x8a6a2a, 0x6a8a2a, 0xa8742a, 0x4a7a2a][i % 4]));
  return dM(p);
}
// [geometry, material, instanced() opts] for every biome prop key
function decorG2() {
  const flat = { shadow: false };
  return {
    gull: [gullGeo(), vcMat], driftwood: [driftwoodGeo(), vcMat], grassTuft: [grassTuftGeo(), vcMat, flat], grassJungle: [grassTuftGeo(0x2f8a2a, 0x46a83a), vcMat, flat],
    umbrellaA: [umbrellaGeo(0xff4f7a, 0xffffff), vcMat], umbrellaB: [umbrellaGeo(0x3aa8ff, 0xffe04a), vcMat],
    towelA: [towelGeo(0xff4a4a, 0xffffff), vcMat, flat], towelB: [towelGeo(0x3a7aff, 0xffd23f), vcMat, flat], bucket: [bucketGeo(), vcMat],
    starfish: [starfishGeo(), vcMat, flat], starfishPink: [starfishGeo(0xff5a8a), vcMat, flat], footprints: [footprintsGeo(), vcMat, flat],
    seaweed: [seaweedGeo(), vcMat], anemonePink: [anemoneGeo(0xc04a7a, 0xff6fa8), vcMatSmooth], anemoneGreen: [anemoneGeo(0x3a9a6a, 0x7aff9a), vcMatSmooth],
    mussel: [musselGeo(), vcMat, flat], poolRock: [poolRockGeo(), vcMat], pebbles: [pebblesGeo(0x8a7d70, 0xa89a88), vcMat, flat],
    seaFanA: [seaFanGeo(0xa04ad8, 0x5a2a6a), vcMat], seaFanB: [seaFanGeo(0xff8a3a, 0x8a3a1a), vcMat], tubeCoral: [tubeCoralGeo(), vcMatSmooth],
    brainCoral: [brainCoralGeo(), vcMatSmooth], conch: [conchGeo(), vcMatSmooth],
    bigLeaf: [bigLeafGeo(), vcMat], vine: [vineGeo(), vcMat], kelpDrape: [vineGeo(0x4a5a1a, 0x6a7a24), vcMat], mushRed: [mushroomGeo(0xe8322a, 0xf4ead8, 0xffffff), vcMatSmooth],
    stoneHead: [stoneHeadGeo(), vcMat], ruin: [ruinGeo(), vcMat], leafLitter: [leafLitterGeo(), vcMat, flat],
    vent: [ventGeo(), vcMat], ventGlow: [tint(dC(0.5, 0.5, 0.06, 9).translate(0, 1.1, 0), 0xff7a1a), vcEmber, flat], obsidian: [obsidianGeo(), vcGloss],
    charredTree: [charredTreeGeo(), vcMat], ember: [emberGeo(), vcEmber, flat], ashPebbles: [pebblesGeo(0x2a2224, 0x4a3e3c), vcMat, flat],
    snowMound: [snowMoundGeo(), vcMatSmooth], frozenTree: [frozenTreeGeo(), vcMat], penguin: [penguinGeo(), vcMatSmooth], icicle: [icicleGeo(), vcGloss],
    iceShard: [iceShardGeo(), vcGloss, flat], iceCrystal: [iceCrystalGeo(), vcGloss], snowPatch: [snowPatchGeo(), vcMatSmooth, flat],
    floatCrystal: [floatCrystalGeo(), vcGlowCyan], alienPlant: [alienPlantGeo(), vcGlowPink], glowMush: [mushroomGeo(0x5affe0, 0xd0f0ff, 0xffffff), vcGlowCyan],
    crystalShard: [crystalShardGeo(), vcGlowCyan, flat], sporeOrb: [sporeOrbGeo(), vcGlowCyan, flat],
  };
}
// per-key placement: [scaleMin, scaleMax, liftMin, liftMax, faceTrack]
const DSPEC = {
  shell: [0.4, 0.7], fern: [0.8, 1.3], boulder: [0.6, 1.0], seaFanA: [1, 1.8], seaFanB: [1, 1.8], stoneHead: [1.1, 1.7, 0, 0, 1], penguin: [0.8, 1.2, 0, 0, 1],
  glowMush: [1.2, 2], alienPlant: [1, 1.8], floatCrystal: [0.6, 1.1, 1.5, 4], sporeOrb: [0.6, 1.2, 2.5, 6], iceCrystal: [0.6, 1.1], umbrellaA: [0.9, 1.1], umbrellaB: [0.9, 1.1],
};
const TOP_DECOR = {
  beach: ['gull', 'gull', 'driftwood', 'grassTuft', 'grassTuft', 'umbrellaA', 'umbrellaB'],
  tidepools: ['poolRock', 'gull', 'seaweed', 'mussel', 'grassTuft', 'boulder'],
  reef: ['seaFanA', 'seaFanB', 'tubeCoral', 'brainCoral', 'conch', 'seaweed'],
  jungle: ['bigLeaf', 'bigLeaf', 'mushRed', 'stoneHead', 'ruin', 'fern', 'grassJungle'],
  volcano: ['charredTree', 'charredTree', 'vent', 'obsidian', 'obsidian', 'ember'],
  glacier: ['snowMound', 'snowMound', 'frozenTree', 'frozenTree', 'penguin', 'iceCrystal'],
  abyss: ['alienPlant', 'alienPlant', 'glowMush', 'floatCrystal', 'crystalShard'],
};
const EDGE_DECOR = {
  beach: ['towelA', 'towelB', 'bucket', 'driftwood', 'starfish', 'gull', 'umbrellaA', 'umbrellaB'],
  tidepools: ['seaweed', 'anemonePink', 'anemoneGreen', 'mussel', 'poolRock'],
  reef: ['seaFanA', 'seaFanB', 'tubeCoral', 'brainCoral', 'conch', 'anemonePink'],
  jungle: ['bigLeaf', 'mushRed', 'ruin', 'grassJungle', 'stoneHead'],
  volcano: ['obsidian', 'vent', 'ember', 'charredTree'],
  glacier: ['snowMound', 'iceCrystal', 'penguin', 'iceShard'],
  abyss: ['floatCrystal', 'sporeOrb'], // floating only: abyss floor has pits
};
const LANE_DECOR = {
  beach: ['starfish', 'footprints', 'shell', 'footprints'], tidepools: ['pebbles', 'starfish', 'pebbles'], reef: ['shell', 'starfishPink', 'shell'],
  jungle: ['leafLitter', 'leafLitter', 'pebbles'], volcano: ['ember', 'ashPebbles'], glacier: ['iceShard', 'snowPatch'], abyss: ['sporeOrb'],
};
const DRAPE = { jungle: 'vine', glacier: 'icicle', tidepools: 'kelpDrape' };
function placeDecor(add, key, x, y, z, side) {
  const sp = DSPEC[key] || [0.8, 1.25];
  const o = { x, y: y + (sp[3] ? dr(sp[2], sp[3]) : 0), z, ry: sp[4] ? -side * Math.PI / 2 + dr(-0.5, 0.5) : dr(0, 6.3), s: dr(sp[0], sp[1]) };
  add(key, o);
  if (key === 'vent') add('ventGlow', o);
}

function instanced(scene, geo, mat, list, { shadow = true } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  list.forEach((t, i) => { e.set(0, t.ry || 0, 0); q.setFromEuler(e); s.setScalar(t.s || 1); if (t.sy) s.y = t.sy; p.set(t.x, t.y || 0, t.z); m.compose(p, q, s); im.setMatrixAt(i, m); });
  im.castShadow = shadow; im.receiveShadow = true;
  scene.add(im); return im;
}

// ------------------------------------------------ rugged, vertex-coloured rock block
function cliffBlock(x0, x1, z0, z1, h, biome, innerX) {
  const B = BIOMES[biome];
  const w = x1 - x0, d = z1 - z0;
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.round(w / 2)), 6, Math.max(2, Math.round(d / 2.2)));
  g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm(z * 0.08 + x * 0.05 + 50, y * 0.12, 256, 4), n2 = fbm(z * 0.25 + 9, y * 0.3 + x * 0.1, 256, 2);
    if (y > 0.01) {
      if (innerX !== undefined && Math.abs(x - innerX) < 0.01) x += Math.sign(innerX) * (n * 2.4 + n2 * 0.6 - 0.6);
      y += y > h - 0.01 ? (n - 0.5) * 3 : (n2 - 0.5) * 0.8;
    }
    p.setXYZ(i, x, Math.max(0, y), z);
  }
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const pos = ng.attributes.position, cols = new Float32Array(pos.count * 3);
  const a = new THREE.Color(B.rock[0]), b = new THREE.Color(B.rock[1]), top = new THREE.Color(B.top), c = new THREE.Color();
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), e1 = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    v0.fromBufferAttribute(pos, i); v1.fromBufferAttribute(pos, i + 1); v2.fromBufferAttribute(pos, i + 2);
    e1.subVectors(v0, v1); nn.subVectors(v2, v1).cross(e1).normalize();
    const cy = (v0.y + v1.y + v2.y) / 3;
    if (Math.abs(nn.y) > 0.6 && cy > h * 0.6) c.copy(top).multiplyScalar(0.88 + rnd() * 0.22);
    else { const band = Math.sin(cy * 1.3 + fbm(v0.z * 0.1 + 3, 1, 256, 2) * 4) * 0.5 + 0.5; c.copy(a).lerp(b, band * 0.7 + rnd() * 0.3); }
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return ng;
}

// ------------------------------------------------ water shaders
const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
// shared water GLSL: value noise + fbm (vertex & fragment)
const WATER_NOISE = `
  float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(wHash(i), wHash(i+vec2(1.0,0.0)), f.x), mix(wHash(i+vec2(0.0,1.0)), wHash(i+vec2(1.0,1.0)), f.x), f.y); }
  float wFbm(vec2 p){ return wNoise(p)*0.55 + wNoise(p*2.03+7.1)*0.3 + wNoise(p*4.01-3.7)*0.15; }
`;
// scene light level derived from the fog colour (day ~1, storm ~0.6, night ~0.35) so the
// unlit water shaders never blow out in dark worlds. Must follow <fog_pars_fragment>.
const WATER_LIGHT = `
  vec3 wFogC(){
  #ifdef USE_FOG
    return fogColor;
  #else
    return vec3(0.75, 0.88, 1.0);
  #endif
  }
  float wLight(){ float l = dot(wFogC(), vec3(0.299, 0.587, 0.114)); return clamp(0.25 + 0.85*sqrt(max(l, 0.0)), 0.3, 1.0); }
`;
function oceanMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...fogUniforms(), uTime: { value: 0 }, uSun: { value: sunDir }, uDeep: { value: new THREE.Color(0x0a4fa8) }, uShallow: { value: new THREE.Color(0x2fc4e8) }, uSky: { value: new THREE.Color(0xbfe6ff) } },
    vertexShader: `uniform float uTime; varying vec3 vW; varying vec3 vN; varying float vH;
      #include <fog_pars_vertex>
      float hgt(vec2 p){ return sin(p.x*0.05+uTime*0.9)*0.9 + sin(p.y*0.07+uTime*1.3)*0.7 + sin((p.x+p.y)*0.13+uTime*2.1)*0.3 + sin((p.x-p.y)*0.21+uTime*2.7)*0.15; }
      void main(){
        vec4 w = modelMatrix * vec4(position,1.0);
        float h = hgt(w.xz); w.y += h; vH = h;
        float e = 0.5; vec3 n = normalize(vec3(-(hgt(w.xz+vec2(e,0.))-h)/e, 1.0, -(hgt(w.xz+vec2(0.,e))-h)/e));
        vW = w.xyz; vN = n;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uSun, uDeep, uShallow, uSky; uniform float uTime; varying vec3 vW; varying vec3 vN; varying float vH;
      #include <fog_pars_fragment>
      ${WATER_NOISE}
      ${WATER_LIGHT}
      void main(){
        float t = uTime; float L = wLight();
        vec3 S = normalize(uSun);
        vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
        float detail = 1.0 - smoothstep(120.0, 650.0, dist);
        // two scrolling ripple layers perturb the swell normal
        vec2 q = vW.xz*0.16 + vec2(t*0.35, t*0.22);
        float r0 = wNoise(q), rx = wNoise(q+vec2(0.15,0.0)), rz = wNoise(q+vec2(0.0,0.15));
        vec2 q2 = vW.xz*0.47 + vec2(-t*0.6, t*0.45);
        float s0 = wNoise(q2), sx = wNoise(q2+vec2(0.15,0.0)), sz = wNoise(q2+vec2(0.0,0.15));
        vec3 N = normalize(vN + detail*vec3((r0-rx)*1.3 + (s0-sx)*0.7, 0.0, (r0-rz)*1.3 + (s0-sz)*0.7));
        float fres = 0.03 + 0.97*pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // depth colour: deep troughs, lighter turquoise on swell faces
        float shallow = clamp(0.3 + vH*0.22 + (r0-0.5)*0.35, 0.0, 1.0);
        vec3 water = mix(uDeep*0.55, uShallow*0.9, shallow*0.75);
        water += uShallow * 0.35 * smoothstep(0.4, 1.8, vH) * pow(max(dot(V, -S), 0.0), 2.0);
        vec3 sky = mix(uSky, wFogC(), 0.55);
        vec3 col = mix(water, sky, clamp(fres, 0.0, 1.0)*0.8) * L;
        vec3 R = reflect(-S, N); float rd = max(dot(R, V), 0.0);
        col += vec3(1.0, 0.95, 0.82) * pow(rd, 220.0) * 2.0 * L;
        // sparkle: sparse flickering glints near the sun path
        vec2 gp = vW.xz*0.6; vec2 cell = floor(gp);
        float rnd = wHash(cell + floor(t*5.0 + wHash(cell)*5.0)*vec2(17.0, 31.0));
        float glint = step(0.992, rnd) * smoothstep(0.3, 0.0, length(fract(gp)-0.5)) * pow(rd, 10.0) * detail;
        col += vec3(1.0, 0.97, 0.9) * glint * 1.8 * L;
        // foam: whitecaps on swell crests + long wind streaks
        float fn = wFbm(vW.xz*vec2(0.045, 0.11) + vec2(t*0.08, -t*0.15));
        float caps = smoothstep(1.25, 2.0, vH + fn*0.9);
        float streak = smoothstep(0.64, 0.8, wNoise(vec2(vW.x*0.022 + fn*0.7, vW.z*0.23 + t*0.12))) * 0.4 * detail;
        float foam = clamp(caps + streak, 0.0, 1.0) * (0.55 + 0.45*fn);
        col = mix(col, vec3(0.92, 0.96, 1.0) * max(L, 0.45) * 0.95, foam*0.75);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

export function buildWorld(scene, renderer) {
  seed = 12345;
  const colliders = [];
  const box = (minX, maxX, minZ, maxZ, extra = {}) => { const c = { minX, maxX, minZ, maxZ, ...extra }; colliders.push(c); return c; };
  const shelters = [];
  const anim = [];
  const hz = { hurdles: [], slow: [], lava: [], pits: [], pendulums: [], crabs: [], ice: [] };
  const pads = [];

  // ------------------------------------------------ sky, sun, environment
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.3, fog: false });
  const sky = new Sky(); sky.scale.setScalar(4500);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(200));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(1000);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = su[k].value;
    s2.material.uniforms.sunPosition.value.copy(sunDir); envScene.add(s2);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
  }
  {
    const puffs = [];
    for (let i = 0; i < 40; i++) {
      const cx = rr(-900, 900), cz = rr(-2600, 400), cy = rr(160, 280), n = 4 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) puffs.push({ x: cx + k * rr(14, 22) - n * 9, y: cy + rr(-5, 8), z: cz + rr(-12, 12), s: rr(14, 26), sy: rr(9, 14) });
    }
    const cm = cloudMat;
    instanced(scene, new THREE.IcosahedronGeometry(1, 2), cm, puffs, { shadow: false });
  }

  // ------------------------------------------------ plaza
  const tiles = getSurface('tiles');
  const tileMat = new THREE.MeshStandardMaterial({ map: tiles.map, normalMap: tiles.normalMap, roughness: 0.7 });
  tileMat.map.repeat.set(PLAZA_HALF / 5, PLAZA_DEPTH / 5); tileMat.normalMap.repeat.copy(tileMat.map.repeat);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA_HALF * 2 + 40, PLAZA_DEPTH + 30), tileMat);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0, PLAZA_DEPTH / 2 + 5); plaza.receiveShadow = true; scene.add(plaza);
  box(-PLAZA_HALF - 30, -PLAZA_HALF, -10, PLAZA_DEPTH + 30);
  box(PLAZA_HALF, PLAZA_HALF + 30, -10, PLAZA_DEPTH + 30);
  box(-PLAZA_HALF - 30, PLAZA_HALF + 30, PLAZA_DEPTH, PLAZA_DEPTH + 30);
  box(-PLAZA_HALF, -TRACK_HALF, -WALL_T, 0);
  box(TRACK_HALF, PLAZA_HALF, -WALL_T, 0);
  {
    const bushes = [];
    for (let x = -PLAZA_HALF; x <= PLAZA_HALF; x += 3.2) bushes.push({ x, y: 1, z: PLAZA_DEPTH + 1.5, s: rr(1.6, 2.2) });
    for (let z = 2; z <= PLAZA_DEPTH; z += 3.2) for (const sx of [-1, 1]) bushes.push({ x: sx * (PLAZA_HALF + 1.5), y: 1, z, s: rr(1.6, 2.2) });
    instanced(scene, tint(new THREE.IcosahedronGeometry(1, 1), 0x3f9a3a), vcMat, bushes);
    const flowers = bushes.filter(() => rnd() < 0.5).map(b => ({ x: b.x + rr(-1, 1), y: b.y + b.s * 0.8, z: b.z + rr(-1, 1), s: 0.25 }));
    instanced(scene, tint(new THREE.IcosahedronGeometry(1, 0), 0xff7ab0), vcMat, flowers, { shadow: false });
  }
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -PLAZA_HALF : TRACK_HALF, x1 = s < 0 ? -TRACK_HALF : PLAZA_HALF;
    const m = new THREE.Mesh(cliffBlock(x0, x1, -WALL_T, 0, CLIFF_H * 0.7, 'beach'), vcMat);
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  {
    const y = 10, gm = toon(0x1f8fff, { rough: 0.35 }), wood = toon(0xb07a44, { rough: 0.8 });
    for (const s of [-1, 1]) { scene.add(mesh(G.cyl, wood, s * (TRACK_HALF + 0.5), y / 2, 0, 1.1, y, 1.1)); scene.add(mesh(G.sphere, gm, s * (TRACK_HALF + 0.5), y + 0.4, 0, 1.4)); }
    scene.add(mesh(G.box, gm, 0, y, 0, TRACK_HALF * 2 + 3, 2.2, 1.6));
    const lab = makeLabel([{ text: '🌊 TSUNAMI TRACK 🌊', color: '#fff', size: 60 }], { scale: 1.6 }); lab.position.set(0, y + 3, 0); scene.add(lab);
    const safe = makeLabel([{ text: 'SAFE ZONE ↓', color: '#6dff7a', size: 40 }], { scale: 1.1 }); safe.position.set(0, y - 2.6, 0.9); scene.add(safe);
  }
  const palmG = palmGeo();
  const plazaPalms = [[-26, 6], [26, 6], [-26, 78], [26, 78], [-70, 2], [70, 2], [-70, 80], [70, 80], [0, 80], [-14, 70], [14, 12]];
  instanced(scene, palmG, vcMat, plazaPalms.map(([x, z]) => ({ x, z, ry: rr(0, 6.3), s: rr(0.9, 1.15) })));
  for (const [x, z] of plazaPalms) box(x - 0.6, x + 0.6, z - 0.6, z + 0.6);
  const umb = (x, z, c) => {
    scene.add(mesh(G.cylLo, toon(0xffffff), x, 2, z, 0.1, 4, 0.1));
    const u = new THREE.Mesh(new THREE.ConeGeometry(3, 1.1, 10, 1, true), toon(c, { rough: 0.8 })); u.position.set(x, 4.3, z); u.castShadow = true; scene.add(u);
    for (const s of [-1, 1]) { const l = mesh(G.box, toon(0xffffff), x + s * 1.6, 0.45, z + 2.2, 0.9, 0.15, 2.4); l.rotation.x = -0.15; scene.add(l); }
  };
  umb(-12, 50, 0xff5a5a); umb(12, 30, 0x3fa8ff); umb(-10, 22, 0xffd23f); umb(10, 62, 0x5ee06a);
  {
    const bulbs = [];
    for (const s of [-1, 1]) for (let z = 4; z < PLAZA_DEPTH; z += 12) {
      scene.add(mesh(G.cylLo, toon(0x553a24), s * 33, 3, z, 0.12, 6, 0.12));
      for (let k = 0; k < 6; k++) bulbs.push({ x: s * 33, y: 5.8 - Math.sin(k / 6 * Math.PI) * 0.8, z: z + k * 2, s: 0.18 });
    }
    const colors = [0xffd23f, 0xff6a8a, 0x5ee0ff, 0x9dff6a];
    colors.forEach((c, i) => instanced(scene, new THREE.SphereGeometry(1, 8, 6), toon(c, { emissive: c, ei: 2.2 }), bulbs.filter((_, k) => k % 4 === i), { shadow: false }));
  }
  {
    const k = new THREE.Group(); k.position.set(0, 0, 42);
    const wood = toon(0xc08a54, { rough: 0.8 });
    k.add(mesh(G.box, wood, 0, 1.4, 0, 7, 2.8, 4.5));
    k.add(mesh(G.box, toon(0xf6efe0), 0, 2.95, 0, 7.3, 0.25, 4.8));
    for (let i = 0; i < 8; i++) { const a = mesh(G.box, toon(i % 2 ? 0xffffff : 0xff4f7a), -3.5 + i * 0.95 + 0.47, 3.6, 2.9, 0.95, 0.12, 2); a.rotation.x = 0.45; k.add(a); }
    k.add(mesh(G.box, toon(0x3a2a1a), 0, 4.4, -1.4, 7.4, 1.6, 0.3));
    const lab = makeLabel([{ text: '⚡ SHOP ⚡', color: '#ffd23f', size: 54 }, { text: 'speed · bats · base', color: '#fff', size: 26 }]); lab.position.set(0, 9.9, 0); k.add(lab);
    scene.add(k); box(-3.5, 3.5, 39.75, 44.25);
    k.userData.shopPos = new THREE.Vector3(0, 0, 46.5);
    anim.push({ shop: k });
  }

  // ---- premium beach-hub dressing: boardwalks, fountain, arch, lamps, lifeguard tower, racks, volleyball
  // (static props are merged into a few meshes; own rng so the seeded track layout is unchanged)
  {
    let ds = 4242; const drnd = () => (ds = (ds * 16807) % 2147483647) / 2147483647;
    const D = [], W = [], GL = [], WAT = [];
    const white = 0xfbf7ee, gold = 0xf0b832, stoneC = 0xe6dac2, iron = 0x2a3340, woodC = 0xb07a44, blue = 0x1f8fff;
    const PLANK = [0xc79a62, 0xbb8d56, 0xd1a56c, 0xc29359, 0xb5864f];
    const FLOW = [0xff5a7a, 0xffd23f, 0xff8a3f, 0xc070ff, 0xffffff, 0x5ec8ff];
    // boardwalks (axis aligned; planks run across the walking direction)
    const walk = (x0, z0, x1, z1, w) => {
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const n = Math.max(1, Math.round(len / 0.62)), step = len / n;
      const ax = Math.min(x0, x1), az = Math.min(z0, z1);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * step, c = PLANK[Math.floor(drnd() * PLANK.length)];
        if (alongX) dpart(W, G.box, c, ax + t, 0.05, z0, step - 0.07, 0.1, w);
        else dpart(W, G.box, c, x0, 0.05, az + t, w, 0.1, step - 0.07);
      }
      for (const s of [-1, 1]) {
        if (alongX) dpart(W, G.box, 0x7a5532, (x0 + x1) / 2, 0.07, z0 + s * (w / 2 + 0.1), len, 0.14, 0.2);
        else dpart(W, G.box, 0x7a5532, x0 + s * (w / 2 + 0.1), 0.07, (z0 + z1) / 2, 0.2, 0.14, len);
      }
    };
    walk(-23.6, 3.5, 23.6, 3.5, 4);                       // promenade along the track entrance
    for (const s of [-1, 1]) {
      walk(s * 22, 5.7, s * 22, 68.6, 3.2);               // spine past the three bases
      for (const P of PLOTS) if (P.side === s) walk(s * 23.8, P.cz, s * 36.2, P.cz, 3.2); // branch to each door
    }
    walk(0, 5.7, 0, 13.2, 3.2);
    walk(0, 26.8, 0, 36.8, 3.2);
    walk(-7, 43, 7, 43, 12);                              // shop deck
    // benches & flower beds
    const bench = (x, z, ry) => {
      for (const lz of [-0.2, 0, 0.2]) dloc(D, G.box, woodC, x, z, ry, 0, 0.55, lz, 2.4, 0.08, 0.17);
      for (const y of [0.92, 1.16]) dloc(D, G.box, woodC, x, z, ry, 0, y, -0.36, 2.4, 0.15, 0.06);
      for (const lx of [-1.05, 1.05]) {
        dloc(D, G.box, iron, x, z, ry, lx, 0.27, 0, 0.1, 0.54, 0.6);
        dloc(D, G.box, iron, x, z, ry, lx, 0.85, -0.38, 0.1, 0.66, 0.08);
        dloc(D, G.box, iron, x, z, ry, lx, 0.74, 0.02, 0.1, 0.06, 0.56);
      }
    };
    const bed = (x, z, ry, w) => {
      dloc(D, G.box, 0xe8dcc4, x, z, ry, 0, 0.25, 0, w, 0.5, 1.3);
      dloc(D, G.box, gold, x, z, ry, 0, 0.52, 0, w + 0.08, 0.05, 1.38);
      dloc(D, G.box, 0x5a3a24, x, z, ry, 0, 0.54, 0, w - 0.2, 0.05, 1.1);
      const nb = Math.max(1, Math.round(w / 1.3));
      for (let i = 0; i < nb; i++) dloc(D, G.sphereLo, 0x3f9a3a, x, z, ry, -w / 2 + (i + 0.5) * w / nb, 0.78, 0, 0.55, 0.42, 0.45);
      for (let i = 0; i < w * 4; i++) dloc(D, DG.ico, FLOW[Math.floor(drnd() * FLOW.length)], x, z, ry, (drnd() - 0.5) * (w - 0.4), 0.95 + drnd() * 0.3, (drnd() - 0.5) * 0.9, 0.13);
    };
    // central fountain with a golden wave statue
    const FZ = 20;
    {
      dpart(W, DG.disc, 0xd9c9a8, 0, 0.04, FZ, 6.8, 0.08, 6.8);
      dpart(W, DG.disc, 0xefe5ce, 0, 0.05, FZ, 6.2, 0.1, 6.2);
      dpart(W, new THREE.TorusGeometry(5, 0.14, 4, 48), 0x3fa8ff, 0, 0.1, FZ, 1, 1, 0.4, Math.PI / 2);
      dpart(D, DG.disc, 0xf3ede0, 0, 0.45, FZ, 3.6, 0.9, 3.6);
      dpart(D, new THREE.TorusGeometry(3.55, 0.2, 6, 40), white, 0, 0.9, FZ, 1, 1, 1, Math.PI / 2);
      dpart(D, new THREE.TorusGeometry(3.63, 0.07, 6, 40), gold, 0, 0.35, FZ, 1, 1, 1, Math.PI / 2);
      dpart(WAT, DG.disc, 0xffffff, 0, 0.78, FZ, 3.35, 0.05, 3.35);
      dpart(D, DG.cyl16, white, 0, 1.75, FZ, 0.5, 1.9, 0.5);
      dpart(D, new THREE.TorusGeometry(0.55, 0.07, 6, 20), gold, 0, 1.3, FZ, 1, 1, 1, Math.PI / 2);
      dpart(D, new THREE.CylinderGeometry(1.8, 0.55, 0.55, 24), white, 0, 2.85, FZ);
      dpart(D, new THREE.TorusGeometry(1.78, 0.1, 6, 28), gold, 0, 3.12, FZ, 1, 1, 1, Math.PI / 2);
      dpart(WAT, DG.disc, 0xffffff, 0, 3.08, FZ, 1.62, 0.05, 1.62);
      dpart(D, DG.cyl16, white, 0, 3.6, FZ, 0.25, 1.0, 0.25);
      dpart(D, new THREE.TorusGeometry(0.85, 0.2, 8, 24, Math.PI * 1.4), gold, 0, 4.7, FZ, 1, 1, 1, 0, 0, -0.5);
      dpart(D, new THREE.TorusGeometry(0.85, 0.2, 8, 24, Math.PI * 1.4), gold, 0, 4.7, FZ, 1, 1, 1, 0, Math.PI / 2, -0.5);
      dpart(GL, G.sphere, 0xfff3e0, 0, 4.7, FZ, 0.45);
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x3cc8ff, roughness: 0.06, metalness: 0.1, emissive: 0x0a5a80, emissiveIntensity: 0.45, transparent: true, opacity: 0.88 });
      dflush(scene, WAT, waterMat, false);
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
      const c2 = cv.getContext('2d');
      c2.fillStyle = 'rgba(255,255,255,0.3)'; c2.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 46; i++) { c2.fillStyle = `rgba(255,255,255,${0.4 + drnd() * 0.6})`; c2.fillRect(drnd() * 64, drnd() * 128, 1 + drnd() * 3, 10 + drnd() * 40); }
      const ft = new THREE.CanvasTexture(cv); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(5, 1); ft.colorSpace = THREE.SRGBColorSpace;
      const fallMat = new THREE.MeshStandardMaterial({ color: 0xc8f2ff, map: ft, emissive: 0x2a90c0, emissiveIntensity: 0.5, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, roughness: 0.1 });
      const fall = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 3.0, 2.3, 28, 1, true), fallMat);
      fall.position.set(0, 1.95, FZ); fall.onBeforeRender = () => { ft.offset.y = (performance.now() * 0.0008) % 1; };
      scene.add(fall);
      box(-3.8, 3.8, FZ - 3.8, FZ + 3.8);
      for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) bench(Math.sin(a) * 5.4, FZ + Math.cos(a) * 5.4, a + Math.PI);
      for (const s of [-1, 1]) bed(s * 5.9, FZ, Math.PI / 2, 3);
    }
    // the big "TSUNAMI HEIST" arch over the centre walk
    {
      const AZ = 10;
      for (const s of [-1, 1]) {
        const x = s * 7;
        dpart(D, G.box, stoneC, x, 0.35, AZ, 1.9, 0.7, 1.9);
        dpart(D, G.box, gold, x, 0.72, AZ, 1.7, 0.08, 1.7);
        for (let i = 0; i < 6; i++) dpart(D, DG.cyl16, i % 2 ? white : blue, x, 1.2 + i * 0.85, AZ, 0.62, 0.86, 0.62);
        dpart(D, G.box, gold, x, 6.0, AZ, 1.5, 0.3, 1.5);
        dpart(D, DG.cyl16, gold, x, 7.35, AZ, 0.35, 0.3, 0.35);
        dpart(GL, G.sphere, 0x7fe8ff, x, 7.85, AZ, 0.45);
        box(x - 0.95, x + 0.95, AZ - 0.95, AZ + 0.95);
        bed(s * 9.7, AZ, 0, 2.6);
      }
      dpart(D, G.box, blue, 0, 6.65, AZ, 15.6, 1.1, 1.1);
      for (const y of [6.1, 7.2]) dpart(D, G.box, white, 0, y, AZ, 15.7, 0.1, 1.2);
      for (let x = -7; x <= 7.01; x += 1.4) dpart(D, G.halfSphere, white, x, 7.22, AZ, 0.6, 0.42, 0.55);
      const lab = makeLabel([{ text: 'TSUNAMI HEIST', rainbow: true, size: 72 }, { text: '🏝️ BEACH HUB 🏝️', color: '#fff', size: 30 }], { scale: 1.3 });
      lab.position.set(0, 9.3, AZ); scene.add(lab);
    }
    // lamp posts with glowing heads (instanced)
    {
      const pts = [];
      for (const s of [-1, 1]) {
        for (const z of [10, 22, 34, 47, 59]) pts.push({ x: s * 24.6, z });
        pts.push({ x: s * 12.5, z: 6.4 }, { x: s * 18, z: 6.4 }, { x: s * 2.6, z: 31.5 }, { x: s * 7.6, z: 37.6 }, { x: s * 7.6, z: 48.6 });
      }
      const L = [];
      dpart(L, DG.cyl8, iron, 0, 0.25, 0, 0.22, 0.5, 0.22);
      dpart(L, DG.cyl8, iron, 0, 2.2, 0, 0.08, 4.0, 0.08);
      dpart(L, DG.cyl8, gold, 0, 4.08, 0, 0.18, 0.12, 0.18);
      dpart(L, DG.pyr, iron, 0, 4.85, 0, 0.32, 0.32, 0.32);
      dpart(L, G.sphereLo, gold, 0, 5.08, 0, 0.08);
      const postGeo = mergeGeometries(L); L.forEach(g => g.dispose());
      instanced(scene, postGeo, decoMat, pts);
      instanced(scene, new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }), pts.map(p => ({ x: p.x, z: p.z, y: 4.42, s: 0.3 })), { shadow: false });
    }
    // shop upgrade: posts, thatched roof, scalloped valance + bulbs, crates, barrels, surfboards, menu board
    {
      const SZ = 42;
      for (const x of [-3.65, 3.65]) for (const z of [SZ - 2.4, SZ + 2.4]) dpart(D, DG.cyl8, 0x8a5a30, x, 2.6, z, 0.16, 5.2, 0.16);
      dpart(D, G.box, 0xc89b50, 0, 5.2, SZ, 9.4, 0.22, 6.8);
      dpart(D, DG.pyr, 0xd9b26a, 0, 6.2, SZ, 4.6, 2.0, 3.4);
      dpart(D, DG.pyr, 0xe6c27a, 0, 7.05, SZ, 1.6, 0.8, 1.2);
      dpart(D, G.sphereLo, gold, 0, 7.55, SZ, 0.25);
      dpart(D, DG.cyl8, white, 0, 8.3, SZ, 0.05, 1.5, 0.05);
      dpart(D, G.box, 0xff4f7a, 0, 8.75, SZ + 0.55, 0.04, 0.55, 1.0);
      for (let i = 0; i < 9; i++) {
        const x = -3.6 + i * 0.9;
        dpart(D, DG.scallopZ, i % 2 ? white : 0xff4f7a, x, 3.12, SZ + 3.82, 0.45, 0.45, 0.05);
        dpart(GL, G.sphereLo, [0xffd23f, 0x5ee0ff, 0xff6a8a][i % 3], x + 0.45, 2.92, SZ + 3.84, 0.1);
      }
      for (const [x, y, z, s, r] of [[4.3, 0.45, SZ + 1.2, 0.9, 0], [4.3, 0.45, SZ - 0.1, 0.9, 0.2], [4.3, 1.3, SZ + 0.6, 0.8, 0.5]]) {
        dpart(D, G.box, 0xa8743e, x, y, z, s, s, s, 0, r);
        dpart(D, G.box, 0x7a5532, x, y, z, s + 0.04, 0.1, s + 0.04, 0, r);
      }
      for (const z of [SZ + 1.3, SZ + 0.1]) {
        dpart(D, DG.cyl16, 0x8a5a30, -4.25, 0.5, z, 0.45, 1.0, 0.45);
        for (const y of [0.2, 0.8]) dpart(D, DG.cyl16, iron, -4.25, y, z, 0.47, 0.06, 0.47);
      }
      dpart(D, G.box, 0x3fa8ff, -4.25, 0.32, SZ - 1.2, 0.8, 0.64, 1.0);
      dpart(D, G.box, white, -4.25, 0.68, SZ - 1.2, 0.84, 0.1, 1.04);
      box(3.5, 4.85, SZ - 0.65, SZ + 1.75); box(-4.8, -3.5, SZ - 1.75, SZ + 1.8);
      [0xff5a5a, 0xffd23f, 0x3fa8ff].forEach((c, i) => {
        dpart(D, DG.board, c, 1.2 + i * 0.85, 1.25, SZ - 2.55, 0.38, 1.2, 0.07, 0.15);
        dpart(D, G.box, white, 1.2 + i * 0.85, 1.25, SZ - 2.6, 0.05, 2.0, 0.02, 0.15);
      });
      dpart(D, G.box, 0x23302a, -5.3, 0.75, SZ + 3.45, 1.0, 1.4, 0.06, -0.2);
      dpart(D, G.box, 0x23302a, -5.3, 0.75, SZ + 3.85, 1.0, 1.4, 0.06, 0.2);
      dpart(D, G.box, 0xffd23f, -5.3, 1.0, SZ + 3.97, 0.6, 0.08, 0.02, 0.2);
      dpart(D, G.box, white, -5.3, 0.75, SZ + 3.95, 0.7, 0.05, 0.02, 0.2);
      for (const s of [-1, 1]) bed(s * 8.5, SZ, Math.PI / 2, 4);
    }
    // lifeguard tower
    {
      const X = 17, Z = 76, red = 0xe8413a;
      for (const a of [-1, 1]) for (const b of [-1, 1]) dpart(D, DG.cyl8, white, X + a * 1.25, 1.85, Z + b * 1.25, 0.14, 3.7, 0.14);
      for (const b of [-1, 1]) dpart(D, G.box, white, X, 1.7, Z + b * 1.25, 2.9, 0.12, 0.12, 0, 0, 0.95);
      for (const a of [-1, 1]) dpart(D, G.box, white, X + a * 1.25, 1.7, Z, 0.12, 0.12, 2.9, 0.95);
      dpart(D, G.box, woodC, X, 3.8, Z, 3.4, 0.2, 3.4);
      dpart(D, G.box, red, X, 4.85, Z + 0.4, 2.6, 1.9, 1.8);
      dpart(D, G.box, white, X, 4.85, Z + 0.4, 2.65, 0.35, 1.85);
      dpart(D, G.box, 0x223040, X, 5.25, Z - 0.52, 1.9, 0.55, 0.05);
      dpart(D, G.box, white, X, 4.4, Z - 1.6, 3.3, 0.1, 0.1);
      for (const a of [-1.6, 1.6]) { dpart(D, G.box, white, X + a, 4.4, Z, 0.1, 0.1, 3.3); dpart(D, DG.cyl8, white, X + a, 4.15, Z - 1.6, 0.05, 0.6, 0.05); }
      dpart(D, DG.pyr, red, X, 6.25, Z + 0.3, 1.75, 0.8, 1.45);
      dpart(D, DG.cyl8, white, X, 7.4, Z + 0.3, 0.05, 1.6, 0.05);
      dpart(D, G.box, red, X, 7.9, Z + 0.85, 0.04, 0.55, 1.0);
      dpart(D, G.torus, 0xff7a2a, X + 1.35, 4.8, Z + 0.4, 0.45, 0.45, 0.45, 0, Math.PI / 2);
      for (const a of [-0.55, 0.55]) dpart(D, G.box, woodC, X + a, 1.9, Z - 2.25, 0.1, 3.96, 0.1, 0.28);
      for (let k = 0; k < 6; k++) { const t = (k + 0.5) / 6; dpart(D, G.box, woodC, X, 3.8 * t, Z - 2.8 + 1.1 * t, 1.1, 0.07, 0.12); }
      box(X - 1.6, X + 1.6, Z - 1.6, Z + 1.6);
    }
    // surfboard racks
    {
      const BOARDS = [0xff5a5a, 0x3fa8ff, 0xffd23f, 0x5ee06a, 0xff7ad9, 0xffffff, 0x2fd0c0];
      const rack = (x, z, ry, ci) => {
        for (const lx of [-1.9, 1.9]) {
          for (const lz of [-0.35, 0.35]) dloc(D, G.box, woodC, x, z, ry, lx, 0.8, lz, 0.14, 1.6, 0.14);
          dloc(D, G.box, woodC, x, z, ry, lx, 1.55, 0, 0.14, 0.12, 0.84);
        }
        for (const lz of [-0.35, 0.35]) dloc(D, G.box, woodC, x, z, ry, 0, 0.5, lz, 3.9, 0.1, 0.1);
        for (let i = 0; i < 5; i++) {
          const lx = -1.5 + i * 0.75, c = BOARDS[(ci + i) % BOARDS.length];
          dloc(D, DG.board, c, x, z, ry, lx, 1.35, 0, 0.07, 1.25, 0.36, 0, 0.1);
          dloc(D, G.box, white, x, z, ry, lx, 1.35, 0, 0.08, 2.1, 0.04, 0, 0.1);
        }
      };
      rack(-28, 28, Math.PI / 2, 0); box(-28.6, -27.4, 25.9, 30.1);
      rack(28, 28, Math.PI / 2, 2); box(27.4, 28.6, 25.9, 30.1);
      rack(9, 77, 0, 4); box(6.9, 11.1, 76.4, 77.6);
    }
    // beach volleyball court
    {
      const VZ = 64;
      dpart(W, G.box, 0xf3dca2, 0, 0.03, VZ, 12.6, 0.06, 16.6);
      for (const s of [-1, 1]) { dpart(W, G.box, white, s * 6, 0.07, VZ, 0.12, 0.02, 15.2); dpart(W, G.box, white, 0, 0.07, VZ + s * 7.6, 12.1, 0.02, 0.12); }
      dpart(W, G.box, white, 0, 0.07, VZ, 12, 0.02, 0.1);
      for (const s of [-1, 1]) {
        dpart(D, DG.cyl8, white, s * 6.3, 1.4, VZ, 0.1, 2.8, 0.1);
        for (const y of [0.6, 1.4, 2.2]) dpart(D, DG.cyl8, 0xe8413a, s * 6.3, y, VZ, 0.11, 0.25, 0.11);
      }
      dpart(D, G.box, white, 0, 2.58, VZ, 12.6, 0.12, 0.06);
      dpart(D, G.box, white, 0, 1.55, VZ, 12.6, 0.05, 0.05);
      const net = mesh(G.box, toon(0x1a2230, { opacity: 0.5 }), 0, 2.05, VZ, 12.6, 1.0, 0.03); net.castShadow = false; scene.add(net);
      dpart(D, G.sphere, 0xffe14a, 2.6, 0.36, VZ - 4.5, 0.36);
      box(-6.45, 6.45, VZ - 0.15, VZ + 0.15);
    }
    // more benches & flower beds around the hub
    for (const s of [-1, 1]) {
      bench(s * 19.4, 28, s * Math.PI / 2); bench(s * 19.4, 54, s * Math.PI / 2);
      bed(s * 29, 2.4, 0, 5); bed(s * 32, 79, 0, 5);
    }
    dflush(scene, W, decoMat, false);
    dflush(scene, D, decoMat);
    dflush(scene, GL, decoGlowMat, false);
  }

  // ------------------------------------------------ the track (rebuilt for every world)
  const plots = PLOTS.map((P, idx) => buildPlot(scene, P, idx, box));
  const baseColliders = colliders.length;
  const oceanMat = oceanMaterial(sunDir);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(5000, 2500, 160, 80), oceanMat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.8, -3000); scene.add(ocean);
  const sideOceans = [-1, 1].map(s => {
    const o2 = new THREE.Mesh(new THREE.PlaneGeometry(2000, 5200, 40, 120), oceanMat);
    o2.rotation.x = -Math.PI / 2; o2.position.set(s * (TRACK_HALF + WALL_T + 1000), -3, -1500); scene.add(o2); return o2;
  });
  const lavaMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...fogUniforms(), uTime: { value: 0 } },
    vertexShader: 'varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: `uniform float uTime; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 p = vW.xz*0.35; float a = n(p + vec2(uTime*0.4, uTime*0.15)) * 0.6 + n(p*2.3 - uTime*0.3) * 0.4;
        vec3 col = mix(vec3(1.2,0.25,0.02), vec3(2.6,1.3,0.25), smoothstep(0.45,0.8,a)); col = mix(vec3(0.25,0.05,0.02), col, smoothstep(0.2,0.45,a));
        gl_FragColor = vec4(col,1.);
        #include <fog_fragment>
      }`,
  });
  const trackRoot = new THREE.Group(); scene.add(trackRoot);
  const biomeAt = z => { for (const Z of CFG.ZONES) if (z <= Z.z0 + 0.01 && z > Z.z1 - 0.01) return Z.biome; return z > ZONE_START ? 'beach' : CFG.ZONES[CFG.ZONES.length - 1].biome; };
  const zones = [];
  function buildTrack(w) {
    // tear down the previous world's track
    trackRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.userData && o.material.userData.track) { for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap']) o.material[k]?.dispose(); o.material.dispose(); } });
    trackRoot.clear();
    colliders.length = baseColliders;
    shelters.length = 0; zones.length = 0; pads.length = 0;
    for (const k in hz) hz[k].length = 0;
    seed = 12345 + w * 7919;
    const scene = trackRoot;
    // ------------------------------------------------ track floor per biome
    const startSand = getSurface('sand');
    {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_HALF * 2 + 0.2, -ZONE_START + 2), new THREE.MeshStandardMaterial({ map: startSand.map, normalMap: startSand.normalMap, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.01, ZONE_START / 2); m.receiveShadow = true; scene.add(m);
    }
    const floorMats = {};
    const floorMat = (biome, len) => {
      const surf = getSurface({ beach: 'sand', tidepools: 'wetsand' }[biome] || biome);
      const m = new THREE.MeshStandardMaterial({ map: surf.map.clone(), normalMap: surf.normalMap.clone(), roughness: 0.9 }); m.userData.track = true;
      if (surf.roughnessMap) { m.roughnessMap = surf.roughnessMap.clone(); m.roughness = 1; }
      if (surf.emissiveMap) { m.emissiveMap = surf.emissiveMap.clone(); m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 1.6; }
      if (biome === 'glacier') { m.roughness = 0.6; m.metalness = 0.1; }
      for (const t of [m.map, m.normalMap, m.emissiveMap, m.roughnessMap]) if (t) { t.repeat.set(TRACK_HALF * 2 / 9, len / 9); t.needsUpdate = true; }
      return m;
    };
    const floorPiece = (mat, z0, z1) => {
      if (z0 - z1 < 0.05) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_HALF * 2 + 0.2, z0 - z1), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.012, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
    };
    CFG.ZONES.forEach((Z, i) => {
      const B = BIOMES[Z.biome], R = RARITIES[i];
      const mat = floorMat(Z.biome, Z.len); floorMats[Z.biome] = mat;
      if (Z.gap) {
        hz.pits.push({ minZ: Z.gap.z1, maxZ: Z.gap.z0, bridgeX: 0, bridgeW: -1, gap: Z.gap });
        buildGapVisuals(scene, Z.gap, Z.biome);
      }
      if (Z.biome !== 'abyss') { if (Z.gap) { floorPiece(mat, Z.z0, Z.gap.z0); floorPiece(mat, Z.gap.z1, Z.z1); } else floorPiece(mat, Z.z0, Z.z1); }
      const col = new THREE.Color(R.color).getHex();
      const gate = new THREE.Group(); gate.position.z = Z.z0;
      gate.add(buildGate(Z.biome, Z.title, R, i)); // themed landmark arch + big rarity sign
      const glowLine = mesh(G.box, toon(col, { emissive: col, ei: 2.5 }), 0, 0.04, 0, TRACK_HALF * 2, 0.06, 0.5); glowLine.castShadow = false; gate.add(glowLine);
      scene.add(gate);
      zones.push({ i, z0: Z.z0, z1: Z.z1, biome: Z.biome, color: col, fog: B.fog });
    });

    // ------------------------------------------------ cliffs with shelters
    const zoneBounds = CFG.ZONES.map(Z => Z.z0);
    const shelterVis = [];
    for (const s of [-1, 1]) {
      let zPrev = 0;
      const ivals = [];
      for (const zc of CFG.SHELTER_ZS) { ivals.push([zc + SHELTER_LEN / 2, zPrev]); zPrev = zc - SHELTER_LEN / 2; }
      ivals.push([CFG.TRACK_END - 10, zPrev]);
      const x0 = s > 0 ? TRACK_HALF : -TRACK_HALF - WALL_T, x1 = x0 + WALL_T;
      for (const [za, zb] of ivals) {
        box(x0, x1, za, zb);
        const splits = [zb, ...zoneBounds.filter(z => z < zb && z > za), za];
        for (let k = 0; k < splits.length - 1; k++) {
          const z1 = splits[k], z0 = splits[k + 1];
          if (z1 - z0 < 0.5) continue;
          const m = new THREE.Mesh(cliffBlock(x0, x1, z0, z1, CLIFF_H, biomeAt((z0 + z1) / 2), s * TRACK_HALF), vcMat);
          m.castShadow = m.receiveShadow = true; scene.add(m);
        }
      }
      for (const zc of CFG.SHELTER_ZS) {
        const biome = biomeAt(zc);
        const bx0 = s > 0 ? TRACK_HALF + SHELTER_DEPTH : -TRACK_HALF - WALL_T, bx1 = bx0 + WALL_T - SHELTER_DEPTH;
        box(bx0, bx1, zc - SHELTER_LEN / 2, zc + SHELTER_LEN / 2);
        const bm = new THREE.Mesh(cliffBlock(bx0, bx1, zc - SHELTER_LEN / 2, zc + SHELTER_LEN / 2, CLIFF_H, biome), vcMat); bm.castShadow = bm.receiveShadow = true; scene.add(bm);
        const rx0 = s > 0 ? TRACK_HALF - 0.5 : -TRACK_HALF - SHELTER_DEPTH - 0.5, rx1 = rx0 + SHELTER_DEPTH + 1;
        const roofG = cliffBlock(rx0, rx1, zc - SHELTER_LEN / 2 - 0.3, zc + SHELTER_LEN / 2 + 0.3, 2.6, biome); roofG.translate(0, CLIFF_H - 2.4, 0);
        const roof = new THREE.Mesh(roofG, vcMat); roof.castShadow = true; scene.add(roof);
        const pad = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 32), new THREE.MeshBasicMaterial({ color: 0x47ff7a, transparent: true, opacity: 0.55, depthWrite: false }));
        pad.rotation.x = -Math.PI / 2; pad.position.set(s * (TRACK_HALF + SHELTER_DEPTH / 2), 0.05, zc); scene.add(pad);
        for (const dz of [-1, 1]) { const l = mesh(G.sphere, toon(0x5dff86, { emissive: 0x5dff86, ei: 3 }), s * (TRACK_HALF + 0.6), 5.4, zc + dz * (SHELTER_LEN / 2 - 0.6), 0.32); l.castShadow = false; scene.add(l); }
        const lab = makeLabel([{ text: '✚ SAFE', color: '#5dff86', size: 44 }], { scale: 1.2 }); lab.position.set(s * TRACK_HALF, CLIFF_H + 2.4, zc); scene.add(lab);
        shelterVis.push({ s, zc });
        shelters.push({ side: s, zc, z0: zc - SHELTER_LEN / 2, z1: zc + SHELTER_LEN / 2, x: s * (TRACK_HALF + SHELTER_DEPTH / 2), pad });
      }
    }
    buildShelterVisuals(scene, shelterVis, CLIFF_H); // instanced tiki mouth, awning, lit floor, beacon + light beam
    buildDistanceMarkers(scene, CFG.TRACK_END, CLIFF_H, [...zoneBounds, ...CFG.SHELTER_ZS]);
    const nearShelter = (z, m = 9) => CFG.SHELTER_ZS.some(zc => Math.abs(z - zc) < SHELTER_LEN / 2 + m);
    const nearGap = (z, m = 3) => CFG.GAPS.some(G => z < G.z0 + 9 + m && z > G.z1 - m); // chasm + its launch ramp

    // ------------------------------------------------ biome dressing + hazards
    const decor = {};
    const add = (k, o) => (decor[k] = decor[k] || []).push(o);
    const cliffTop = s => s * (TRACK_HALF + rr(2, WALL_T - 2));
    const hurdle = (geoKey, z, xa, xb, h) => {
      if (xb - xa < 0.5) return;
      const c = { minX: xa, maxX: xb, minZ: z - 0.75, maxZ: z + 0.75, h };
      hz.hurdles.push(c); colliders.push(c);
      for (let x = xa + 0.8; x < xb; x += 1.6) add(geoKey, { x, z: z + rr(-0.15, 0.15), y: 0, s: rr(0.9, 1.1) * (h / 1.2), ry: rr(0, 6) });
    };
    const hurdleRow = (z, geoKey, h = 1.15) => {
      const gap = rr(-12, 12), gw = rr(2.6, 4.2);
      if (rnd() < 0.5) { hurdle(geoKey, z, -TRACK_HALF, gap - gw / 2, h); hurdle(geoKey, z, gap + gw / 2, TRACK_HALF, h); }
      else hurdle(geoKey, z, -TRACK_HALF, TRACK_HALF, h);
    };
    CFG.ZONES.forEach((Z, zi) => {
      const { z0, z1, biome } = Z;
      const L = z0 - z1;
      for (let z = z0 - 4; z > z1; z -= rr(12, 22)) for (const s of [-1, 1]) {
        const x = cliffTop(s);
        if (biome === 'beach' || biome === 'tidepools') add('palm', { x, y: CLIFF_H - 0.3, z, ry: rr(0, 6.3), s: rr(0.8, 1.1) });
        else if (biome === 'reef') add(rnd() < 0.5 ? 'coralTop' : 'palm', { x, y: CLIFF_H - 0.3, z, ry: rr(0, 6.3), s: rr(1.5, 2.2) });
        else if (biome === 'jungle') add('tree', { x, y: CLIFF_H - 0.5, z, ry: rr(0, 6.3), s: rr(1, 1.5) });
        else if (biome === 'volcano') add('basalt', { x, y: CLIFF_H - 0.5, z, ry: rr(0, 6.3), s: rr(1.5, 3), sy: rr(2, 4) });
        else if (biome === 'glacier') add('spikeTop', { x, y: CLIFF_H - 0.3, z, ry: rr(0, 6.3), s: rr(1.4, 2.4) });
        else if (biome === 'abyss') add('crystalTop', { x, y: CLIFF_H - 0.3, z, ry: rr(0, 6.3), s: rr(1.4, 2.6) });
        // extra cliff-top props + drapes over the lip (decor rng only)
        if (z === z0 - 4 && s === -1) dseed = 4242 + w * 977 + zi * 131;
        for (let k = 0, n = 2 + Math.floor(drnd() * 3); k < n; k++) placeDecor(add, dpick(TOP_DECOR[biome]), s * (TRACK_HALF + dr(2.5, WALL_T - 1.5)), CLIFF_H - 0.35, z + dr(-9, 9), s);
        const dk = DRAPE[biome], dz = z + dr(-6, 6);
        if (dk && drnd() < 0.85 && !nearShelter(dz, 3)) add(dk, { x: s * (TRACK_HALF - 0.7), y: CLIFF_H - 0.1, z: dz, ry: s > 0 ? 0 : Math.PI, s: dr(0.9, 1.2) });
      }
      for (let z = z0 - 3; z > z1; z -= rr(5, 10)) {
        if (nearShelter(z, 2) || nearGap(z)) continue;
        const s = rnd() < 0.5 ? -1 : 1, x = s * (TRACK_HALF - rr(0.6, 1.4));
        const k = { beach: 'shell', tidepools: 'pebble', reef: 'coral', jungle: 'fern', volcano: 'lavarock', glacier: 'spike', abyss: 'crystal' }[biome];
        add(k, { x, z, ry: rr(0, 6.3), s: rr(0.6, 1.1) });
        // extra edge props + small flat ground details in the lanes (decor rng only)
        if (drnd() < 0.75) { const s2 = drnd() < 0.5 ? -1 : 1; placeDecor(add, dpick(EDGE_DECOR[biome]), s2 * (TRACK_HALF - dr(1, 3.8)), 0, z + dr(-2.5, 2.5), s2); }
        for (let j = 0, n = 1 + Math.floor(drnd() * 2); j < n; j++) { const lx = dr(-13, 13); placeDecor(add, dpick(LANE_DECOR[biome]), lx, 0, z + dr(-3, 3), lx < 0 ? -1 : 1); }
      }
      const freeZ = step0 => { const step = step0 / WORLDS[w].haz; const out = []; for (let z = z0 - 18; z > z1 + 10; z -= rr(step * 0.75, step * 1.25)) if (!nearShelter(z, 3) && !nearGap(z, 14)) out.push(z); return out; };
      const pitsHere = Z.gap ? hz.pits.filter(p => p.gap === Z.gap) : [];
      if (biome === 'beach') {
        for (const z of freeZ(30)) hurdleRow(z, 'castle', 1.0);
      } else if (biome === 'tidepools') {
        for (const z of freeZ(20)) {
          if (rnd() < 0.55) hurdleRow(z, 'boulder', 1.2);
          else { const x = rr(-11, 11), w = rr(6, 10), d = rr(6, 12); hz.slow.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, mul: 0.6, kind: 'puddle' }); }
        }
      } else if (biome === 'reef') {
        for (const z of freeZ(17)) {
          if (rnd() < 0.4) hurdleRow(z, 'coralLow', 1.2);
          else { const n = rnd() < 0.5 ? 2 : 1; for (let k = 0; k < n; k++) hz.crabs.push({ z: z + k * 5, x: rr(-12, 12), dir: rnd() < 0.5 ? -1 : 1, speed: rr(7, 13), range: rr(11, 15), mesh: null }); }
        }
      } else if (biome === 'jungle') {
        for (const z of freeZ(19)) {
          if (rnd() < 0.45) hurdleRow(z, 'log', 1.25);
          else hz.pendulums.push({ z, phase: rr(0, 6.3), speed: rr(1.3, 2), amp: 1.15, len: 8, pivotY: 10.5 });
        }
      } else if (biome === 'volcano') {
        for (const z of freeZ(16)) {
          if (rnd() < 0.65) { const d = rr(2.4, 3.6); hz.lava.push({ minX: -TRACK_HALF, maxX: TRACK_HALF, minZ: z - d / 2, maxZ: z + d / 2 }); }
          else hurdleRow(z, 'lavarockLow', 1.3);
        }
      } else if (biome === 'glacier') {
        hz.ice.push({ z0, z1 });
        for (const z of freeZ(17)) {
          if (rnd() < 0.55) hurdleRow(z, 'spikeLow', 1.3);
          else { const x = rr(-10, 10), w = rr(8, 14), d = rr(5, 9); hz.slow.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, mul: 0.55, kind: 'snow' }); }
        }
      } else if (biome === 'abyss') {
        for (const z of freeZ(17)) {
          if (rnd() < 0.6) { const d = rr(3.5, 5.5), bx = rr(-12, 12), bw = rr(2.6, 3.8); const p = { minZ: z - d / 2, maxZ: z + d / 2, bridgeX: bx, bridgeW: bw }; hz.pits.push(p); pitsHere.push(p); }
          else for (let k = 0; k < 3; k++) { const x = rr(-14, 14), zz = z + rr(-6, 6); add('pillar', { x, z: zz, ry: rr(0, 6), s: rr(1, 1.4) }); box(x - 1.1, x + 1.1, zz - 1.1, zz + 1.1, { pillar: true }); }
        }
        let top = z0;
        for (const h of pitsHere.sort((a, b) => b.maxZ - a.maxZ)) {
          floorPiece(floorMats.abyss, top, h.maxZ);
          if (h.gap) { top = h.minZ; continue; } // speed chasm: no bridge
          const bridge = new THREE.Mesh(new THREE.BoxGeometry(h.bridgeW, 0.5, h.maxZ - h.minZ + 0.2), toon(0x8a6ad8, { emissive: 0x6a3ad8, ei: 0.6, flat: true }));
          bridge.position.set(h.bridgeX, -0.24, (h.minZ + h.maxZ) / 2); bridge.receiveShadow = true; scene.add(bridge);
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_HALF * 2, h.maxZ - h.minZ), new THREE.MeshBasicMaterial({ color: 0x1a0a33, fog: false }));
          glow.rotation.x = -Math.PI / 2; glow.position.set(0, -14, (h.minZ + h.maxZ) / 2); scene.add(glow);
          for (const s of [-1, 1]) { const e = mesh(G.box, toon(0xc69bff, { emissive: 0x9a5aff, ei: 0.7 }), 0, 0.03, s > 0 ? h.maxZ : h.minZ, TRACK_HALF * 2, 0.06, 0.12); e.castShadow = false; scene.add(e); }
          top = h.minZ;
        }
        buildBridgeVisuals(scene, pitsHere.filter(p => !p.gap)); // planks, rope rails, glowing edges, hanging pit crystals
        floorPiece(floorMats.abyss, top, z1);
      }
      const n = Math.round(L / 24);
      for (let k = 0; k < n; k++) {
        for (let tries = 0; tries < 30; tries++) {
          const x = rr(-13, 13), z = rr(z1 + 8, z0 - 8);
          const near = (h, m) => z > h.minZ - m && z < h.maxZ + m;
          const bad = hz.hurdles.some(h => near(h, 2.5)) || hz.lava.some(h => near(h, 2.5)) || hz.pits.some(h => near(h, 2.5)) || pads.some(p => Math.hypot(p.x - x, p.z - z) < 6)
            || hz.slow.some(h => x > h.minX && x < h.maxX && near(h, 0)) || colliders.some(c => c.pillar && Math.abs((c.minX + c.maxX) / 2 - x) < 3 && Math.abs((c.minZ + c.maxZ) / 2 - z) < 3);
          if (!bad) { pads.push({ zone: zi, x, z }); break; }
        }
      }
    });

    const G2 = {
      palm: [palmG, vcMat], tree: [treeGeo(), vcMat], coral: [coralGeo(), vcMatSmooth], coralTop: [coralGeo(), vcMatSmooth],
      shell: [tint(new THREE.ConeGeometry(0.5, 0.4, 7), 0xffd6c0), vcMat], pebble: [rockGeo(0.8, 1, 0.6, 0x8a7d70), vcMat],
      fern: [fernGeo(), vcMat], lavarock: [rockGeo(1, 1, 0.8, 0x2a2224), vcMat], spike: [spikeGeo(), toon(0xe6f6ff, { rough: 0.15 })],
      crystal: [crystalGeo(0xb07aff), toon(0xd0b0ff, { emissive: 0x8a4aff, ei: 1.2, rough: 0.2 })],
      crystalTop: [crystalGeo(0x7a5aff), toon(0xb0a0ff, { emissive: 0x6a3aff, ei: 1.0, rough: 0.2 })],
      spikeTop: [spikeGeo(), toon(0xe6f6ff, { rough: 0.15 })],
      basalt: [tint(new THREE.CylinderGeometry(0.6, 0.7, 1, 6), 0x2c2628), vcMat],
      castle: [mergeGeometries([tint(new THREE.CylinderGeometry(0.75, 0.85, 1, 8).translate(0, 0.5, 0), 0xe8c98e), tint(new THREE.ConeGeometry(0.55, 0.7, 8).translate(0, 1.35, 0), 0xd9b77a)]), vcMat],
      boulder: [rockGeo(0.95, 1, 0.75, 0x7e7468), vcMat],
      coralLow: [coralGeo(), vcMatSmooth],
      log: [tint(new THREE.CylinderGeometry(0.6, 0.6, 1.7, 9).rotateZ(Math.PI / 2).translate(0, 0.6, 0), 0x6b4a2a), vcMat],
      lavarockLow: [rockGeo(0.95, 1, 0.8, 0x302628), vcMat],
      spikeLow: [spikeGeo(), toon(0xe6f6ff, { rough: 0.15 })],
      pillar: [crystalGeo(0xc69bff).scale(1.6, 2.2, 1.6), toon(0xd8b8ff, { emissive: 0x9a5aff, ei: 1.5, rough: 0.2 })],
      ...decorG2(),
    };
    for (const k in decor) { const [geo, mat, opt] = G2[k]; instanced(scene, geo, mat, decor[k], opt); }
    for (const s of hz.slow) {
      if (s.kind === 'puddle') {
        const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: 0x3a8ab8, roughness: 0.04, metalness: 0.5, transparent: true, opacity: 0.85 }));
        m.rotation.x = -Math.PI / 2; m.scale.set((s.maxX - s.minX) / 2, (s.maxZ - s.minZ) / 2, 1); m.position.set((s.minX + s.maxX) / 2, 0.05, (s.minZ + s.maxZ) / 2); m.receiveShadow = true; scene.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xffffff, { rough: 0.9 })); m.scale.set((s.maxX - s.minX) / 2, 0.6, (s.maxZ - s.minZ) / 2);
        m.position.set((s.minX + s.maxX) / 2, 0, (s.minZ + s.maxZ) / 2); m.receiveShadow = true; scene.add(m);
      }
    }
    for (const l of hz.lava) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l.maxX - l.minX, l.maxZ - l.minZ), lavaMat);
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.06, (l.minZ + l.maxZ) / 2); scene.add(m);
    }
    buildLavaRims(scene, hz.lava);
    const pk = hz.pendulums.length ? makePendulumKit(hz.pendulums[0].len) : null;
    for (const p of hz.pendulums) {
      scene.add(mesh(G.box, toon(0x5a3e24, { flat: true }), 0, p.pivotY + 0.4, p.z, TRACK_HALF * 2 + 2, 0.8, 0.8));
      pk.support(scene, p.z, p.pivotY);
      p.pivots = [-8, 8].map((px, k) => {
        const pg = new THREE.Group(); pg.position.set(px, p.pivotY, p.z); scene.add(pg);
        const sameLen = p.len === hz.pendulums[0].len;
        const kit = sameLen ? pk : makePendulumKit(p.len);
        const wood = new THREE.Mesh(kit.wood, kit.woodMat), metal = new THREE.Mesh(kit.metal, kit.metalMat); // spiked log + chain
        wood.castShadow = metal.castShadow = true; pg.add(wood, metal);
        return { pg, px, off: k * Math.PI, angle: 0 };
      });
    }
    const crabKit = hz.crabs.length ? makeCrabGeo() : null;
    for (const c of hz.crabs) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(crabKit.geo, crabKit.mat); body.castShadow = true; g.add(body); // jointed legs + open pincers, one draw call
      g.position.set(c.x, 0, c.z); g.scale.setScalar(1.1); scene.add(g); c.mesh = g;
    }

    {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_HALF * 2 + 40, 30), new THREE.MeshStandardMaterial({ map: startSand.map, normalMap: startSand.normalMap, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.005, CFG.TRACK_END - 5); m.receiveShadow = true; scene.add(m);
      box(-60, 60, CFG.TRACK_END - 40, CFG.TRACK_END);
    }
    ocean.position.z = CFG.TRACK_END - 1260;
    for (const o2 of sideOceans) { o2.position.z = CFG.TRACK_END / 2; }

    decorateWorld(trackRoot, w);
  }


  // ------------------------------------------------ per-world looks
  const stars = (() => {
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection(); if (v.y < 0.02) v.y = Math.abs(v.y) + 0.02; v.normalize().multiplyScalar(2400); pos.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
    p.visible = false; scene.add(p); return p;
  })();
  const cosmicSky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y), mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y), f.z); }
      void main(){ float y = vP.y;
        vec3 c = mix(vec3(0.55,0.25,0.75), vec3(0.06,0.03,0.2), smoothstep(-0.05, 0.6, y));
        float neb = n(vP*3.0)*0.6 + n(vP*7.0)*0.4;
        c += vec3(0.9,0.3,0.8) * smoothstep(0.55, 0.9, neb) * 0.35 * (1.0 - smoothstep(0.0, 0.8, y));
        c += vec3(0.2,0.8,0.9) * smoothstep(0.6, 0.95, n(vP*4.0+5.0)) * 0.25;
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  cosmicSky.visible = false; scene.add(cosmicSky);
  const planet = new THREE.Group();
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(260, 48, 24), new THREE.MeshBasicMaterial({ color: 0xff8ad8, fog: false })));
  { const r = new THREE.Mesh(new THREE.RingGeometry(330, 470, 64), new THREE.MeshBasicMaterial({ color: 0xffd0f0, side: THREE.DoubleSide, transparent: true, opacity: 0.55, fog: false })); r.rotation.x = 1.2; planet.add(r); }
  planet.position.set(-900, 700, -2600); planet.visible = false; scene.add(planet);
  const LOOKS = {
    day: { phi: 58, theta: 200, turb: 4, ray: 1.6, mie: 0.004, sun: 0xfff0d8, sunI: 2.0, hemi: [0xcfe8ff, 0xd8b88a, 0.35], exposure: 0.8, fog: null, fogAmt: 0, cloud: [0xffffff, 0.3] },
    sunset: { phi: 85, theta: 215, turb: 9, ray: 3.2, mie: 0.012, sun: 0xffa060, sunI: 1.9, hemi: [0xffb890, 0x6a4450, 0.45], exposure: 0.85, fog: 0xf0905a, fogAmt: 0.55, cloud: [0xffc0a0, 0.25] },
    night: { phi: 96, theta: 200, turb: 2, ray: 0.6, mie: 0.003, sun: 0x9ab8ff, sunI: 0.8, hemi: [0x40508a, 0x141428, 0.55], exposure: 1.1, fog: 0x0b1430, fogAmt: 0.85, stars: true, lightPhi: 50, cloud: [0x30406a, 0.05] },
    storm: { phi: 62, theta: 200, turb: 20, ray: 0.35, mie: 0.06, sun: 0xb8c4d0, sunI: 1.0, hemi: [0x8090a4, 0x3a3a40, 0.6], exposure: 0.9, fog: 0x56606c, fogAmt: 0.75, cloud: [0x5a6068, 0.05], rain: true },
    cosmic: { custom: true, sun: 0xe0c0ff, sunI: 1.6, hemi: [0xa080ff, 0x301848, 0.55], exposure: 0.95, fog: 0x3a2a6a, fogAmt: 0.7, stars: true, lightPhi: 45, cloud: [0xb080ff, 0.2] },
  };
  function setLook(name) {
    const L = LOOKS[name];
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(L.phi ?? 60), THREE.MathUtils.degToRad(L.theta ?? 200));
    sky.visible = !L.custom; cosmicSky.visible = !!L.custom; stars.visible = !!L.stars; planet.visible = !!L.custom;
    if (!L.custom) { su.turbidity.value = L.turb; su.rayleigh.value = L.ray; su.mieCoefficient.value = L.mie; su.sunPosition.value.copy(dir); }
    sunDir.copy(dir); if (sunDir.y < 0.25) sunDir.y = Math.max(sunDir.y, 0.05);
    cloudMat.color.set(L.cloud[0]); cloudMat.emissive.set(L.cloud[0]); cloudMat.emissiveIntensity = L.cloud[1];
    // reflections follow the sky
    const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    if (L.custom) env.add(cosmicSky.clone());
    else { const s2 = new Sky(); s2.scale.setScalar(1000); for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = su[k].value; s2.material.uniforms.sunPosition.value.copy(dir); env.add(s2); }
    if (scene.environment) scene.environment.dispose();
    scene.environment = pm.fromScene(env, 0.02).texture; pm.dispose();
    const lightDir = L.lightPhi ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(L.lightPhi), THREE.MathUtils.degToRad(210)) : dir.clone();
    return { ...L, lightDir };
  }

  buildTrack(CFG.WORLD);
  return {
    setLook, stars,
    colliders, shelters, zones, plots, decor: anim, hz, pads, sunDir, biomeAt, lavaMat, buildTrack, trackRoot, sky, oceanMat,
    update(t, dt, camZ) {
      oceanMat.uniforms.uTime.value = t; lavaMat.uniforms.uTime.value = t;
      updateWorldDecor(t, camZ);
      for (const p of hz.pendulums) for (const v of p.pivots) { v.angle = Math.sin(t * p.speed + p.phase + v.off) * p.amp; v.pg.rotation.z = v.angle; }
      for (const c of hz.crabs) {
        c.x += c.dir * c.speed * dt;
        if (Math.abs(c.x) > c.range) { c.x = Math.sign(c.x) * c.range; c.dir *= -1; }
        if (Math.abs(c.z - camZ) < 300) { c.mesh.position.x = c.x; c.mesh.position.y = Math.abs(Math.sin(t * 14)) * 0.12; c.mesh.rotation.z = Math.sin(t * 14) * 0.06; }
      }
    },
  };
}

// ------------------------------------------------ merged decor helpers (plaza + bases)
// Static props are baked into a few vertex-coloured merged meshes to keep draw calls low.
const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _de = new THREE.Euler(), _dv = new THREE.Vector3(), _ds = new THREE.Vector3();
const decoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, envMapIntensity: 0.5 });
const decoGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
function dpart(list, geo, color, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const g = tint(geo, color);
  _de.set(rx, ry, rz); _dq.setFromEuler(_de); _ds.set(sx, sy, sz); _dv.set(x, y, z);
  g.applyMatrix4(_dm.compose(_dv, _dq, _ds)); list.push(g); return g;
}
// part placed in a local frame (origin ox,oz, yaw ry)
function dloc(list, geo, color, ox, oz, ry, lx, y, lz, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return dpart(list, geo, color, ox + lx * c + lz * s, y, oz - lx * s + lz * c, sx, sy, sz, rx, ry, rz);
}
function dflush(parent, list, mat, shadow = true) {
  if (!list.length) return null;
  const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m);
  for (const g of list) g.dispose(); list.length = 0; return m;
}
const DG = {
  cyl16: new THREE.CylinderGeometry(1, 1, 1, 16), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  pyr: new THREE.ConeGeometry(Math.SQRT2, 1, 4).rotateY(Math.PI / 4), // square base, half-side 1
  board: new THREE.SphereGeometry(1, 10, 8), ico: new THREE.IcosahedronGeometry(1, 0),
  scallopX: new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI).rotateZ(-Math.PI / 2), // half-disc hanging down, thin along x
};
DG.scallopZ = DG.scallopX.clone().rotateY(Math.PI / 2);
DG.disc = new THREE.CylinderGeometry(1, 1, 1, 32);
let pedGeoCache = null;
function pedestalGeo() {
  if (pedGeoCache) return pedGeoCache;
  const L = [], gold = 0xf0b832;
  dpart(L, new THREE.CylinderGeometry(1.5, 1.58, 0.16, 8), gold, 0, 0.08, 0);
  dpart(L, new THREE.CylinderGeometry(1.2, 1.35, 0.6, 20), 0xf6f2ea, 0, 0.45, 0);
  dpart(L, new THREE.TorusGeometry(1.34, 0.06, 6, 28), gold, 0, 0.22, 0, 1, 1, 1, Math.PI / 2);
  dpart(L, DG.cyl16, gold, 0, 0.78, 0, 1.24, 0.06, 1.24);
  pedGeoCache = mergeGeometries(L); L.forEach(g => g.dispose());
  return pedGeoCache;
}
const pedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35, envMapIntensity: 0.9 });
const BASE_NAMES = ['CORAL', 'AZURE', 'LAGOON', 'SUNSET', 'ORCHID', 'FLAMINGO'];

// ------------------------------------------------ speed chasm: dark drop, glowing lips, launch ramps + "LV X" signs both ways
const GAP_ROCK = { reef: 0x6a4a5a, jungle: 0x4a3a2a, volcano: 0x2a2224, glacier: 0x8aa8c0, abyss: 0x3a2a5a };
function buildGapVisuals(scene, gp, biome) {
  const { z0, z1, len } = gp, W = CFG.TRACK_HALF * 2, D = 18, zc = (z0 + z1) / 2;
  const rock = toon(GAP_ROCK[biome] || 0x4a3a3a, { rough: 0.9 });
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, len + 2), new THREE.MeshBasicMaterial({ color: 0x07040d, fog: false }));
  deep.material.userData.track = true; deep.rotation.x = -Math.PI / 2; deep.position.set(0, -D, zc); scene.add(deep);
  for (const z of [z0 + 0.15, z1 - 0.15]) { const m = mesh(G.box, rock, 0, -D / 2 - 0.02, z, W + 0.4, D, 0.3); m.castShadow = false; scene.add(m); }
  for (const x of [-CFG.TRACK_HALF - 0.15, CFG.TRACK_HALF + 0.15]) { const m = mesh(G.box, rock, x, -D / 2, zc, 0.3, D, len + 0.6); m.castShadow = false; scene.add(m); }
  const lipM = toon(0xffd23f, { emissive: 0xffb000, ei: 1.6 }), chevM = toon(0xfff2a8, { emissive: 0xffd23f, ei: 2.2 });
  for (const [z, dir] of [[z0, -1], [z1, 1]]) { // dir: direction you jump in
    const lip = mesh(G.box, lipM, 0, 0.08, z - dir * 0.3, W, 0.16, 0.6); lip.castShadow = false; scene.add(lip);
    // launch strip: chevrons pointing over the chasm
    for (let k = 0; k < 3; k++) {
      const cz = z - dir * (2.2 + k * 2.4);
      for (const sx of [-1, 1]) for (const x0 of [-9, 0, 9]) {
        const c = mesh(G.box, chevM, x0 + sx * 1.1, 0.05, cz + dir * 0.6, 2.6, 0.05, 0.42);
        c.rotation.y = sx * dir * 0.62; c.castShadow = false; scene.add(c);
      }
    }
    // gateway over the ramp with the requirement sign
    const az = z - dir * 6;
    for (const x of [-CFG.TRACK_HALF + 1.2, CFG.TRACK_HALF - 1.2]) scene.add(mesh(G.box, toon(0x2a2a3a, { metal: true }), x, 5, az, 0.7, 10, 0.7));
    const bar = mesh(G.box, lipM, 0, 10, az, W - 1.6, 0.6, 0.6); bar.castShadow = false; scene.add(bar);
    const sign = makeLabel([{ text: `⚡ SPEED LV ${gp.req}`, color: '#ffe14a', size: 56 }, { text: 'JUMP', color: '#fff', size: 30 }], { scale: 2.3, bg: 'rgba(20,16,32,0.85)' });
    sign.material.fog = false; sign.position.set(0, 12.3, az); scene.add(sign);
    (gp.signs ||= []).push(sign);
  }
}

function buildPlot(scene, P, idx, box) {
  const { cx, cz, side } = P;
  const dir = -side;
  const hw = PLOT_W / 2, hd = PLOT_D / 2;
  const L = (lx, lz) => new THREE.Vector3(cx + dir * lx, 0, cz + lz);
  const color = PLOT_COLORS[idx];
  const g = new THREE.Group(); scene.add(g);
  const planks = getSurface('planks');
  const fm = new THREE.MeshStandardMaterial({ map: planks.map.clone(), normalMap: planks.normalMap.clone(), roughness: 0.75, color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.75) });
  fm.map.repeat.set(3, 3); fm.normalMap.repeat.set(3, 3); fm.map.needsUpdate = fm.normalMap.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(PLOT_W, 0.3, PLOT_D), fm);
  floor.position.set(cx, 0.0, cz); floor.receiveShadow = true; g.add(floor);
  const wallM = toon(color, { rough: 0.45 }), trimM = toon(0xffffff, { rough: 0.4 }), stone = toon(0xd8d0c0, { rough: 0.8 });
  const wall = (lx0, lx1, lz0, lz1) => {
    const a = L(lx0, lz0), b = L(lx1, lz1);
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
    box(minX, maxX, minZ, maxZ);
    const m = mesh(G.box, wallM, (minX + maxX) / 2, 1.3, (minZ + maxZ) / 2, maxX - minX, 2.2, maxZ - minZ); m.receiveShadow = true; g.add(m);
    g.add(mesh(G.box, stone, (minX + maxX) / 2, 0.15, (minZ + maxZ) / 2, maxX - minX + 0.3, 0.3, maxZ - minZ + 0.3));
    g.add(mesh(G.box, trimM, (minX + maxX) / 2, 2.5, (minZ + maxZ) / 2, maxX - minX + 0.2, 0.25, maxZ - minZ + 0.2));
  };
  wall(-hw - 1, -hw, -hd - 1, hd + 1);
  wall(-hw, hw + 1, -hd - 1, -hd);
  wall(-hw, hw + 1, hd, hd + 1);
  wall(hw, hw + 1, -hd, -5);
  wall(hw, hw + 1, 5, hd);
  for (const [lx, lz] of [[hw + 0.5, -5], [hw + 0.5, 5], [-hw - 0.5, -hd - 0.5], [-hw - 0.5, hd + 0.5], [hw + 0.5, -hd - 0.5], [hw + 0.5, hd + 0.5]]) {
    const p = L(lx, lz); g.add(mesh(G.box, trimM, p.x, 1.6, p.z, 1.3, 3.2, 1.3));
    const lamp = mesh(G.sphere, toon(color, { emissive: color, ei: 1.8 }), p.x, 3.6, p.z, 0.4); lamp.castShadow = false; g.add(lamp);
  }
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), gateMat);
  gate.position.copy(L(hw + 0.5, 0)); gate.position.y = 2; gate.rotation.y = Math.PI / 2; g.add(gate);
  const gp = L(hw, -5), gq = L(hw + 1, 5);
  const gateCol = box(Math.min(gp.x, gq.x), Math.max(gp.x, gq.x), -5 + cz, 5 + cz, { plot: idx, gate: true, active: false });
  const pedestals = [];
  const pedTop = toon(color, { rough: 0.35 }), rimM = toon(color, { emissive: color, ei: 2.2 });
  for (let row = 0; row < 2; row++) for (let k = 0; k < SLOTS_MAX / 2; k++) {
    const lz = -9 + k * 3.6, lx = row === 0 ? -8.5 : -2.5;
    const p = L(lx, lz);
    const pg = new THREE.Group(); pg.position.copy(p); g.add(pg);
    const base = mesh(pedestalGeo(), pedMat, 0, 0, 0); base.receiveShadow = true; pg.add(base);
    const rim = mesh(G.ring, rimM, 0, 0.87, 0, 1.17); rim.rotation.x = Math.PI / 2; rim.castShadow = false; pg.add(rim);
    const top = mesh(G.cyl, pedTop, 0, 0.84, 0, 1.12, 0.08, 1.12); pg.add(top);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.65, 32), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; pg.add(ring);
    pedestals.push({ idx: pedestals.length, pos: p.clone(), group: pg, ring, top, creature: null, mesh: null, label: null, stored: 0, faceYaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2 });
  }
  const lockPos = L(9.5, 8.5);
  const lockBtn = new THREE.Group(); lockBtn.position.copy(lockPos); g.add(lockBtn);
  lockBtn.add(mesh(G.cyl, toon(0x333344, { metal: true }), 0, 0.25, 0, 1.3, 0.3, 1.3));
  const lockTop = mesh(G.cyl, toon(0x5dff86, { emissive: 0x22aa44, ei: 1, unique: true }), 0, 0.48, 0, 1.0, 0.2, 1.0); lockBtn.add(lockTop);
  const lockLab = makeLabel([{ text: '🔒 LOCK', color: '#5dff86', size: 36 }], { scale: 0.8 }); lockLab.position.set(0, 2.2, 0); lockBtn.add(lockLab);
  const sign = new THREE.Group(); sign.position.copy(L(hw + 3, -8)); g.add(sign);
  sign.add(mesh(G.cylLo, toon(0xffffff), 0, 2.5, 0, 0.15, 5, 0.15));
  const signLab = makeLabel([{ text: '...', color: '#fff', size: 44 }], { scale: 1.2 }); signLab.position.set(0, 6.1, 0); sign.add(signLab);
  // ---- premium dressing (merged: 1 lit mesh + 1 glow mesh per base)
  {
    const D = [], GL = [], white = 0xfbf7ee, gold = 0xf0b832, cloth = color;
    const dark = new THREE.Color(color).multiplyScalar(0.55).getHex();
    const at = (geo, c, lx, y, lz, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, list = D) => dpart(list, geo, c, cx + dir * lx, y, cz + lz, sx, sy, sz, rx, ry, rz);
    // pergola over the back row: open slats keep the pedestals readable from above
    const px0 = -11.7, px1 = -5.4, pz = 11.2, ph = 5.2;
    for (const lx of [px0, px1]) for (const lz of [-pz, pz]) {
      at(DG.cyl8, white, lx, ph / 2, lz, 0.2, ph, 0.2);
      at(DG.cyl8, gold, lx, 0.3, lz, 0.32, 0.3, 0.32);
      at(G.sphereLo, gold, lx, ph + 0.4, lz, 0.24);
    }
    for (const lx of [px0, px1]) at(G.box, white, lx, ph, 0, 0.32, 0.32, pz * 2 + 0.8);
    for (let lz = -pz + 0.4; lz <= pz - 0.3; lz += 1.25) at(G.box, cloth, (px0 + px1) / 2, ph + 0.26, lz, px1 - px0 + 1.4, 0.16, 0.42);
    for (let lz = -pz + 0.7, i = 0; lz <= pz - 0.5; lz += 1.4, i++) {
      at(DG.scallopX, i % 2 ? white : cloth, px1, ph - 0.16, lz, 0.06, 0.68, 0.68);
      at(G.sphereLo, 0xffe6a8, px1, ph - 0.95, lz + 0.7, 0.12, 0.12, 0.12, 0, 0, 0, GL);
    }
    // carpet runner from the door to the pedestals
    at(G.box, gold, (hw - 0.4 - 0.6) / 2, 0.16, 0, hw - 0.4 + 0.6, 0.03, 2.6);
    at(G.box, dark, (hw - 0.4 - 0.6) / 2, 0.17, 0, hw - 0.4 + 0.4, 0.03, 2.2);
    // base flags on the back wall
    for (const lz of [-8, 8]) {
      at(DG.cyl8, white, -hw - 0.5, 10.5, lz, 0.09, 7, 0.09);
      at(G.sphereLo, gold, -hw - 0.5, 14.1, lz, 0.2);
      let fx = -hw - 0.5, fz = lz;
      for (const [len, a] of [[1.2, 0.2], [1.1, -0.2]]) {
        const dx = Math.sin(a) * len, dz = Math.cos(a) * len;
        at(G.box, cloth, fx + dx / 2, 13.2, fz + dz / 2, 0.05, 1.3, len + 0.02, 0, a * dir);
        at(G.box, white, fx + dx / 2, 13.2, fz + dz / 2, 0.07, 0.22, len + 0.02, 0, a * dir);
        fx += dx; fz += dz;
      }
    }
    // door arch with nameplate
    at(G.box, white, hw + 0.5, 4.35, 0, 0.7, 0.5, 11.3);
    for (const y of [4.08, 4.62]) at(G.box, gold, hw + 0.5, y, 0, 0.76, 0.07, 11.36);
    at(DG.pyr, cloth, hw + 0.5, 5.15, 0, 0.6, 1.0, 0.6);
    at(G.sphereLo, gold, hw + 0.5, 5.8, 0, 0.22);
    const hex = '#' + new THREE.Color(color).getHexString();
    const plate = makeLabel([{ text: `${BASE_NAMES[idx % BASE_NAMES.length]} BASE`, color: '#fff', size: 30 }], { scale: 0.75, bg: hex });
    plate.position.copy(L(hw + 1.1, 0)); plate.position.y = 4.35; g.add(plate);
    // welcome mat + door planters
    at(G.box, white, hw + 2.7, 0.13, 0, 2.6, 0.04, 5.4);
    at(G.box, cloth, hw + 2.7, 0.15, 0, 2.2, 0.04, 5.0);
    at(G.box, white, hw + 2.7, 0.17, 0, 0.22, 0.02, 4.2);
    for (const lz of [-6.7, 6.7]) {
      at(G.box, white, hw + 1.8, 0.35, lz, 1.2, 0.7, 1.6);
      at(G.box, gold, hw + 1.8, 0.72, lz, 1.3, 0.06, 1.7);
      at(G.sphereLo, 0x3f9a3a, hw + 1.8, 1.05, lz, 0.6, 0.45, 0.75);
      for (let k = 0; k < 4; k++) at(DG.ico, k % 2 ? cloth : 0xfff2a8, hw + 1.8 + (k % 2 ? 0.25 : -0.25), 1.4, lz + (k - 1.5) * 0.35, 0.16);
    }
    dflush(g, D, decoMat);
    dflush(g, GL, decoGlowMat, false);
  }
  // ---- closed house: tall walls, lintel over the door, a roof and a strip curtain → nobody can peek inside.
  // Own material per base so main.js can fade it out for whoever is inside (updateShells).
  const SH = 9, S = [], white = 0xfbf7ee, dark = new THREE.Color(color).multiplyScalar(0.6).getHex();
  const sp = (lx0, lx1, lz0, lz1, y0, y1, c = color) => {
    const a = L(lx0, lz0), b = L(lx1, lz1);
    dpart(S, G.box, c, (a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2, Math.abs(b.x - a.x), y1 - y0, Math.abs(b.z - a.z));
  };
  for (const [a, b, c, d] of [[-hw - 1, -hw, -hd - 1, hd + 1], [-hw, hw + 1, -hd - 1, -hd], [-hw, hw + 1, hd, hd + 1], [hw, hw + 1, -hd, -5], [hw, hw + 1, 5, hd]]) {
    sp(a, b, c, d, 2.62, SH);
    sp(a - 0.1, b + 0.1, c - 0.1, d + 0.1, 5.6, 5.85, white);          // belt trim
  }
  sp(hw, hw + 1, -5, 5, 4.62, SH);                                       // lintel over the door
  sp(-hw - 1.3, hw + 1.3, -hd - 1.3, hd + 1.3, SH, SH + 0.45, white);    // roof slab with overhang
  sp(-hw - 0.4, hw + 0.4, -hd - 0.4, hd + 0.4, SH + 0.45, SH + 1.1, dark); // raised roof
  sp(-hw + 2, hw - 2, -hd + 2, hd - 2, SH + 1.1, SH + 1.6, color);
  for (let lz = -4.75, i = 0; lz < 4.8; lz += 0.6, i++) sp(hw + 0.42, hw + 0.58, lz, lz + 0.56, 0.25, 4.1, i % 2 ? white : dark); // door curtain
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, envMapIntensity: 0.5 });
  const shell = dflush(g, S, shellMat, false);
  return {
    idx, cx, cz, dir, color, group: g, pedestals, gate, gateMat, gateCol, lockPos, lockTop, lockLab, signLab, shell, shellMat,
    doorIn: L(hw - 3, 0), doorOut: L(hw + 5, 0), center: L(0, 0),
    contains(x, z) { return Math.abs(x - cx) < hw && Math.abs(z - cz) < hd; },
  };
}

// ------------------------------------------------ the wave
// cross-section of the tsunami in (z, y): front faces +z, the face is concave and the lip
// curls forward ~4 units over it, then the long back slope trails behind.  Closed loop.
const WAVE_PROFILE = [
  [0.8, -0.2], [0.5, 2.5], [-0.4, 5.5], [-1.1, 8.4], [-0.9, 10.6], // concave face
  [0.2, 12.0], [1.7, 12.2], [2.7, 11.3], [3.0, 10.2], // barrel roof -> lip tip
  [3.5, 11.0], [3.9, 12.6], [3.2, 14.6], [1.4, 15.8], [-1.0, 16.2], // outer lip -> crest
  [-3.6, 15.2], [-6.5, 12.6], [-10, 8.6], [-14, 5.0], [-19, 2.4], [-25, 0.8], [-30, -0.2], // back slope
  [-20, -0.4], [-10, -0.4], [-2, -0.4], // bottom
];
const WAVE_TIP = '3.0, 10.2';
function waveGeometry(W) {
  const curve = new THREE.CatmullRomCurve3(WAVE_PROFILE.map(([z, y]) => new THREE.Vector3(z, y, 0)), true, 'centripetal');
  const prof = curve.getPoints(168); // closed: last point == first (seam at the toe)
  const NP = prof.length, NX = 110, half = W / 2 + 0.9; // ends tuck ~1 unit into the cliffs
  const pos = new Float32Array(NP * (NX + 1) * 3), edge = new Float32Array(NP * (NX + 1));
  const capLen = 1.8, ancZ = -8, ancY = 1.0;
  for (let i = 0; i <= NX; i++) {
    const x = -half + (2 * half * i) / NX, d = half - Math.abs(x);
    const tt = THREE.MathUtils.smoothstep(d, 0, 7);
    const hs = 0.68 + 0.32 * tt, lag = -1.6 * (1 - tt) * (1 - tt); // ends roll lower and trail back
    const cap = 0.08 + 0.92 * Math.sin(Math.min(d / capLen, 1) * Math.PI / 2); // rounded end cap
    const e = 1 - THREE.MathUtils.smoothstep(d, 0, 6);
    for (let j = 0; j < NP; j++) {
      const k = i * NP + j, p = prof[j];
      const z = p.x + lag, y = Math.max(p.y, -0.4) * hs;
      pos[k * 3] = x; pos[k * 3 + 1] = ancY + (y - ancY) * cap; pos[k * 3 + 2] = ancZ + (z - ancZ) * cap;
      edge[k] = e;
    }
  }
  const idx = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NP - 1; j++) {
    const a = i * NP + j, b = (i + 1) * NP + j, c = b + 1, d = a + 1;
    idx.push(a, b, d, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geo.setIndex(idx); geo.computeVertexNormals();
  // make sure normals point outward (crest top must face up)
  let top = 0; for (let j = 1; j < NP; j++) if (prof[j].y > prof[top].y) top = j;
  if (geo.attributes.normal.getY((NX >> 1) * NP + top) < 0) {
    for (let n = 0; n < idx.length; n += 3) { const t0 = idx[n]; idx[n] = idx[n + 2]; idx[n + 2] = t0; }
    geo.setIndex(idx); geo.computeVertexNormals();
  }
  geo.computeBoundingSphere(); geo.boundingSphere.radius += 30; // vertex scaling/wobble
  return geo;
}
// churning whitewater skirt + shadow on the ground ahead of the face
function waveSkirtMaterial() {
  return new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false,
    uniforms: { ...fogUniforms(), uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      ${WATER_NOISE}
      ${WATER_LIGHT}
      void main(){
        float t = uTime; float L = wLight();
        float ahead = (1.0 - vUv.y) * 18.0 - 2.0; // distance in front of the wave toe
        float n1 = wFbm(vec2(vW.x*0.35 + t*0.4, ahead*0.45 - t*2.2));
        float n2 = wNoise(vec2(vW.x*1.3 - t*0.9, ahead*1.4 - t*4.0));
        float churn = smoothstep(3.8, 0.3, ahead + (n1-0.5)*3.5);
        float bubbles = smoothstep(0.72, 0.85, n2*0.6 + n1*0.5) * smoothstep(9.0, 2.0, ahead);
        float foam = clamp(churn*(0.7 + 0.3*n2) + bubbles*0.6, 0.0, 1.0);
        float side = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
        float shade = 0.32 * smoothstep(16.0, 3.0, ahead);
        vec3 col = mix(vec3(0.02, 0.12, 0.25), vec3(0.93, 0.97, 1.0) * max(L, 0.55), foam);
        gl_FragColor = vec4(col, max(shade, foam*0.95) * side);
        #include <fog_fragment>
      }`,
  });
}
export function makeWave(scene, sunDir) {
  const W = TRACK_HALF * 2 + 0.6;
  const geo = waveGeometry(W);
  const mat = new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), uTime: { value: 0 }, uSun: { value: sunDir }, uDeep: { value: new THREE.Color(0x0a4fb8) }, uScaleY: { value: 1 } },
    vertexShader: `uniform float uTime, uScaleY; attribute float aEdge;
      varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying float vEdge;
      #include <fog_pars_vertex>
      ${WATER_NOISE}
      void main(){
        vec3 p = position; vL = position; vLN = normal; vEdge = aEdge;
        float t = uTime;
        float lip = smoothstep(8.5, 13.0, p.y) * smoothstep(-3.0, 2.0, p.z) * (1.0 - aEdge*0.6);
        float crest = smoothstep(7.0, 16.0, p.y);
        // the lip surges and pulls back unevenly along the crest
        float wob = sin(p.x*0.35 + t*3.0)*0.45 + sin(p.x*0.93 - t*4.3)*0.22 + (wNoise(vec2(p.x*0.4, t*1.5)) - 0.5)*0.9;
        p.z += (wob + sin(t*1.2 + p.x*0.15)*0.5) * lip;
        p.y += (sin(p.x*0.5 + t*2.0)*0.35 + (wNoise(vec2(p.x*0.6 - t*2.0, 3.0)) - 0.5)*0.6) * crest;
        // churning whitewater at the toe
        float base = smoothstep(3.5, 0.4, p.y) * smoothstep(0.1, 0.6, normal.z);
        p += normal * (wNoise(vec2(p.x*0.7 + t*1.3, p.y*0.6 - t*2.6)) - 0.45) * 1.1 * base;
        p.y *= uScaleY;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
        vec3 n = normal; n.y /= max(uScaleY, 0.2); vN = normalize(mat3(modelMatrix) * n);
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uSun, uDeep; uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying float vEdge;
      #include <fog_pars_fragment>
      ${WATER_NOISE}
      ${WATER_LIGHT}
      void main(){
        float t = uTime; float L = wLight();
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vW); vec3 S = normalize(uSun);
        float h = clamp(vL.y / 16.0, 0.0, 1.1);
        float front = smoothstep(-4.0, 0.5, vL.z);
        float thin = smoothstep(0.5, 0.82, h) * smoothstep(-5.0, 0.5, vL.z);
        float under = smoothstep(0.15, -0.5, vLN.y) * smoothstep(0.3, 0.6, h);
        float barrel = smoothstep(5.0, 10.0, vL.y) * (1.0 - smoothstep(11.5, 12.6, vL.y)) * smoothstep(0.0, 0.5, vLN.z) * (1.0 - smoothstep(1.0, 2.2, vL.z));
        // body colour: near-black base -> deep -> turquoise crest
        vec3 abyss = uDeep * vec3(0.3, 0.42, 0.58);
        vec3 turq = mix(vec3(0.07, 0.76, 0.8), uDeep*1.5 + vec3(0.04, 0.2, 0.2), 0.3);
        vec3 col = mix(abyss, uDeep, smoothstep(0.0, 0.42, h));
        col = mix(col, turq, smoothstep(0.35, 0.9, h) * (0.45 + 0.55*front));
        col *= 1.0 - 0.45*max(under, barrel);
        col *= 0.6 + 0.4*max(dot(N, S), 0.0);
        // light shining through the thin curl
        float back = pow(max(dot(V, -S), 0.0), 2.0);
        col += vec3(0.1, 0.85, 0.7) * thin * (0.3 + 0.85*back) * 0.55;
        // water dragged up the face
        float st = wNoise(vec2(vW.x*0.9, vL.y*0.14 - t*1.4));
        col += vec3(0.08, 0.22, 0.28) * smoothstep(0.55, 0.9, st) * front * (1.0 - thin);
        float fres = pow(1.0 - abs(dot(N, V)), 4.0);
        col = mix(col, mix(vec3(0.7, 0.88, 1.0), wFogC(), 0.5), fres*0.5);
        col *= L;
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflect(-S, N), V), 0.0), 80.0) * 1.2 * L;
        // layered whitewater
        vec2 fp = vec2(vW.x, vL.y + vL.z*0.35);
        float f1 = wFbm(fp*vec2(0.35, 0.5) + vec2(0.0, -t*1.6));
        float f2 = wNoise(fp*vec2(1.6, 2.0) + vec2(t*0.7, -t*3.5));
        float fn = f1*0.65 + f2*0.35;
        float crestF = smoothstep(0.8, 0.97, h + (fn - 0.5)*0.35) * (1.0 - under*0.7);
        float tipF = smoothstep(1.9, 0.2, length(vL.zy - vec2(${WAVE_TIP})) + (fn - 0.5)*1.6);
        float lace = (1.0 - smoothstep(0.0, 0.07, abs(wFbm(vec2(vW.x*0.18, vL.z*0.25 + t*0.6)) - 0.5))) * smoothstep(-1.0, -6.0, vL.z) * smoothstep(0.05, 0.3, h) * 0.7;
        float skirt = smoothstep(0.2, 0.02, h + (fn - 0.5)*0.12);
        float edgeF = smoothstep(0.55, 1.0, vEdge + (fn - 0.5)*0.5);
        float foam = max(max(crestF, tipF), max(max(lace, skirt), edgeF));
        foam = clamp(foam * (0.78 + 0.22*smoothstep(0.3, 0.7, f2)), 0.0, 1.0);
        vec3 foamC = vec3(0.93, 0.97, 1.0) * (0.72 + 0.28*max(dot(N, S), 0.0));
        foamC = mix(foamC, foamC*vec3(0.72, 0.86, 0.95), max(under, barrel*0.6)) * max(L, 0.6);
        col = mix(col, foamC, foam);
        col += vec3(0.08, 0.4, 0.55) * (1.0 - L) * (thin*0.3 + foam*0.15); // faint glow so it reads at night
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const body = new THREE.Mesh(geo, mat);
  const g = new THREE.Group(); g.add(body); scene.add(g);
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0x2aa8e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6 });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, 70), sheetMat);
  sheet.rotation.x = -Math.PI / 2; sheet.position.set(0, 0.2, -58); g.add(sheet);
  const skirtMat = waveSkirtMaterial();
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(W, 18), skirtMat);
  shade.rotation.x = -Math.PI / 2; shade.position.set(0, 0.07, 7); g.add(shade);
  g.visible = false;
  return {
    group: g, mat, width: W,
    setColor(hex) { mat.uniforms.uDeep.value.set(hex).multiplyScalar(0.55); sheetMat.color.set(hex).lerp(new THREE.Color(0x2fc4e8), 0.5); },
    update(t, scaleY = 1) { mat.uniforms.uTime.value = t; mat.uniforms.uScaleY.value = scaleY; skirtMat.uniforms.uTime.value = t; },
  };
}
