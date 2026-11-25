import * as THREE from 'three';
import { MUT_BY_ID, RARITIES } from './config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EMOJI_RE, glyphFor, glyphImage, onGlyphLoad, hasEmoji } from './symbols.js';

// ---- label text with the game's own symbols instead of emojis
function labelSegs(text) {
  text = String(text);
  if (!hasEmoji(text)) return null;
  const out = []; let last = 0; EMOJI_RE.lastIndex = 0;
  for (let m; (m = EMOJI_RE.exec(text));) {
    if (!glyphFor(m[0])) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ e: m[0] }); last = m.index + m[0].length;
  }
  if (!out.length) return null;
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const GLYPH_W = 1.12;
function labelWidth(ctx, text, s) {
  const sg = labelSegs(text); if (!sg) return ctx.measureText(String(text)).width;
  let w = 0; for (const x of sg) w += typeof x === 'string' ? ctx.measureText(x).width : s * GLYPH_W; return w;
}
/** draws centred text (stroke + fill, fillStyle already set); returns true if a symbol image is still loading */
function labelText(ctx, text, cx, y, s) {
  const sg = labelSegs(text);
  if (!sg) { ctx.strokeText(String(text), cx, y); ctx.fillText(String(text), cx, y); return false; }
  const w = labelWidth(ctx, text, s); let x = cx - w / 2, pending = false;
  const align = ctx.textAlign; ctx.textAlign = 'left';
  for (const p of sg) {
    if (typeof p === 'string') { ctx.strokeText(p, x, y); ctx.fillText(p, x, y); x += ctx.measureText(p).width; continue; }
    const rec = glyphImage(p.e);
    if (rec && rec.ok) ctx.drawImage(rec.img, x + s * 0.04, y - s * 0.06, s * 1.04, s * 1.04);
    else if (rec) pending = true;
    else { ctx.fillText(p.e, x, y); } // symbol source not ready (shouldn't happen) → plain emoji
    x += s * GLYPH_W;
  }
  ctx.textAlign = align;
  return pending;
}

// ---------------------------------------------------------------- materials
export const ENV_I = 0.35;
const matCache = new Map();
// stylised PBR: soft roughness, optional emissive / metal. (name kept from the toon era)
export function toon(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.opacity || 1) + '|' + (opts.ei || 0) + '|' + (opts.metal ? 1 : 0) + '|' + (opts.rough ?? '');
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? (opts.metal ? 0.25 : 0.55), metalness: opts.metal ? 0.85 : 0.0, flatShading: !!opts.flat, envMapIntensity: opts.metal ? 1 : ENV_I });
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 0.6; }
  if (opts.opacity && opts.opacity < 1) { m.transparent = true; m.opacity = opts.opacity; m.depthWrite = false; }
  if (!opts.unique) matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- shared geometry
export const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  sphereLo: new THREE.SphereGeometry(1, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 12),
  coneLo: new THREE.ConeGeometry(1, 1, 6),
  tri: new THREE.CylinderGeometry(1, 1, 1, 3),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 20),
  halfSphere: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  ring: new THREE.TorusGeometry(1, 0.08, 6, 24),
};

export function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- labels
export function makeLabel(lines, { scale = 1, bg = null } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.renderOrder = 10;
  sprite.userData.draw = (ls) => {
    sprite.userData._lines = ls; let pending = false;
    const pad = 10, lh = ls.map(l => (l.size || 34) * 1.18);
    ctx.font = '900 34px "Lilita One", "Arial Black", sans-serif';
    let w = 0;
    for (const l of ls) { ctx.font = `900 ${l.size || 34}px "Lilita One", "Arial Black", sans-serif`; w = Math.max(w, labelWidth(ctx, l.text, l.size || 34)); }
    const nw = Math.ceil(w + pad * 2 + 8), nh = Math.ceil(lh.reduce((a, b) => a + b, 0) + pad * 2);
    if (nw !== canvas.width || nh !== canvas.height) { canvas.width = nw; canvas.height = nh; tex.dispose(); } // size change → reallocate GPU texture
    else ctx.clearRect(0, 0, nw, nh);
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 0, 0, canvas.width, canvas.height, 14); ctx.fill(); }
    let y = pad;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], s = l.size || 34;
      ctx.font = `900 ${s}px "Lilita One", "Arial Black", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(4, s * 0.2); ctx.strokeStyle = '#141020'; ctx.lineJoin = 'round';
      if (l.rainbow) {
        const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
        ['#ff4f4f', '#ffb02e', '#ffee4a', '#5ee06a', '#3fa8ff', '#c070ff'].forEach((c, k, a) => g.addColorStop(k / (a.length - 1), c));
        ctx.fillStyle = g;
      } else ctx.fillStyle = l.color || '#fff';
      if (labelText(ctx, l.text, canvas.width / 2, y + 2, s)) pending = true; // emojis → our own symbols
      y += lh[i];
    }
    // symbol images load async the first time → redraw once they're ready
    if (pending && !sprite.userData._waitGlyph) { sprite.userData._waitGlyph = true; onGlyphLoad(() => { sprite.userData._waitGlyph = false; sprite.userData.draw(sprite.userData._lines); }); }
    tex.needsUpdate = true;
    const k = 0.011 * scale;
    sprite.scale.set(canvas.width * k, canvas.height * k, 1);
  };
  sprite.userData.draw(lines);
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- characters
// every hat/hairstyle makeCharacter understands (null = short haircut)
export const HATS = ['cap', 'beanie', 'hair', 'crown', 'headphones', 'bandana', 'visor', 'helmet', 'mohawk', 'ponytail', 'sunhat', null];
const SKINS = [0xffd9b0, 0xf6c99c, 0xe8b183, 0xc98e5e, 0xa56a42, 0x7d4c2e, 0xffe4cc];
const HAIRS = [0x2b1a10, 0x4a2c17, 0x7a4a22, 0xc98b3a, 0xeacb72, 0x18181f, 0xb5462a, 0xcfcfd8, 0x7a45b8, 0x2f8fd0, 0xff6fa8];
const EYES = [0x4a2c18, 0x2a6fb0, 0x3f8a4a, 0x6a4a2a, 0x22222a, 0x7a5cc0];
const TOPS = ['tee', 'stripes', 'jersey', 'hoodie', 'tank', 'polo'];
const ACCENTS = [0xffffff, 0xffd23f, 0xff5a5a, 0x2fd0a0, 0xff8a2a, 0x23232e, 0x6ad1ff, 0xff7ad0];
const BOTTOMS = [0x34507e, 0x2a2a33, 0xc8b48a, 0x5d6470, 0xe6e6ec, 0x7a3f2a, 0x2f6b4a];
const SHOES = [0xf4f4f6, 0xe94040, 0x24242c, 0x3a7bff, 0xffc43a, 0x38c070, 0xff7a2a];
const PACKS = [0xff8a2a, 0x2fd0a0, 0x3a3f50, 0xffd23f, 0xe94060, 0x6a7cff];
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (...v) => { let h = 2166136261; for (const c of v.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
// a random (or seeded) look; pass it as makeCharacter(color, { outfit }) — any subset of keys works
export function randomOutfit(seed = Math.random() * 4294967296) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
  return {
    skin: pick(SKINS), hair: pick(HAIRS), eye: pick(EYES), top: pick(TOPS), accent: pick(ACCENTS),
    bottom: pick(BOTTOMS), shorts: r() < 0.7, shoe: pick(SHOES), sole: r() < 0.75 ? 0xf4f4f0 : 0xc99a5e,
    pack: r() < 0.35, packColor: pick(PACKS), wrist: r() < 0.5, shades: r() < 0.2, brow: r() < 0.5 ? -0.12 : 0.14, grin: r() < 0.3,
  };
}

// vertex-coloured material: all plain-coloured parts of one joint merge into a single draw call
const CHAR_VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, envMapIntensity: ENV_I });
let CG = null;
const charGeo = () => CG || (CG = {
  smile: new THREE.TorusGeometry(1, 0.28, 6, 12, Math.PI),
  arc: new THREE.TorusGeometry(1, 0.09, 6, 16, Math.PI),
});
const _inv = new THREE.Matrix4(), _m4 = new THREE.Matrix4();
// merge the direct mesh children of a joint group: plain materials → vertex colours, others grouped by material
function bakeJoint(grp, shadow = true) {
  grp.updateWorldMatrix(true, true);
  _inv.copy(grp.matrixWorld).invert();
  const vc = [], byMat = new Map(), gone = [];
  for (const o of grp.children) {
    if (!o.isMesh) continue;
    const m = o.material;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(_m4.multiplyMatrices(_inv, o.matrixWorld));
    gone.push(o);
    if (m.metalness < 0.5 && m.emissive.getHex() === 0 && !m.transparent) {
      const n = geo.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = m.color.r; c[i * 3 + 1] = m.color.g; c[i * 3 + 2] = m.color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); vc.push(geo);
    } else { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(geo); }
  }
  for (const o of gone) grp.remove(o);
  const out = [];
  const add = (geos, mat) => { const ms = new THREE.Mesh(mergeGeometries(geos), mat); ms.castShadow = shadow; ms.userData.baked = true; grp.add(ms); out.push(ms); };
  if (vc.length) add(vc, CHAR_VC);
  for (const [m, geos] of byMat) add(geos, m);
  return out[0] || null;
}

export function makeCharacter(color, { hat = null, skin = null, outfit = null } = {}) {
  const o = { ...randomOutfit(seedOf(color, hat)), ...(outfit || {}) };
  if (skin != null) o.skin = skin;
  const cg = charGeo();
  const g = new THREE.Group();
  const body = toon(color), dark = toon(shade(color, 0.6)), mid = toon(shade(color, 0.8));
  const sk = toon(o.skin), skD = toon(shade(o.skin, 0.86)), acc = toon(o.accent), white = toon(0xffffff), ink = toon(0x161320);
  const bot = toon(o.bottom), botD = toon(shade(o.bottom, 0.72)), hairM = toon(o.hair);
  const shoeM = toon(o.shoe), soleM = toon(o.sole);
  const blush = toon(new THREE.Color(o.skin).lerp(new THREE.Color(0xff6f7a), 0.4).getHex());
  const root = new THREE.Group(); g.add(root);            // pelvis: bob, lean, hip roll
  const upper = new THREE.Group(); upper.position.y = 0.9; root.add(upper); // chest: twists against the hips
  const top = o.top;

  // ---- torso & clothing (upper-local; torso ellipse ≈ 0.475 wide, 0.39 deep, y -0.24..0.96)
  upper.add(mesh(G.capsule, body, 0, 0.36, 0, 0.95, 0.6, 0.78));
  upper.add(mesh(G.cyl, bot, 0, 0.17, 0, 0.51, 0.1, 0.42));            // waistband
  upper.add(mesh(G.box, acc, 0, 0.17, 0.41, 0.09, 0.07, 0.03));        // buckle / drawcord tag
  const patch = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => { const m = mesh(geo, mat, x, y, z, sx, sy, sz); m.rotation.set(Math.PI / 2, ry, 0, 'YXZ'); upper.add(m); return m; };
  if (top === 'tee') {
    patch(G.cyl, acc, 0.17, 0.55, 0.365, 0.1, 0.02, 0.1, 0.4);
    patch(G.cyl, white, 0.175, 0.55, 0.38, 0.05, 0.02, 0.05, 0.4);
    patch(G.cyl, acc, 0, 0.42, -0.39, 0.2, 0.02, 0.2, Math.PI);
    patch(G.cyl, white, 0, 0.42, -0.405, 0.12, 0.02, 0.12, Math.PI);
  } else if (top === 'stripes') {
    for (const y of [0.32, 0.54]) upper.add(mesh(G.cyl, acc, 0, y, 0, 0.49, 0.07, 0.405));
  } else if (top === 'jersey') {
    upper.add(mesh(G.box, white, 0, 0.45, -0.37, 0.36, 0.34, 0.05));
    for (const x of [-0.06, 0.06]) upper.add(mesh(G.box, acc, x, 0.45, -0.4, 0.045, 0.24, 0.03));
    for (const x of [-0.42, 0.42]) upper.add(mesh(G.box, acc, x, 0.4, 0, 0.06, 0.5, 0.3));
  } else if (top === 'hoodie') {
    upper.add(mesh(G.box, mid, 0, 0.3, 0.37, 0.42, 0.18, 0.06));
    for (const x of [-0.08, 0.08]) upper.add(mesh(G.cyl, white, x, 0.6, 0.39, 0.015, 0.22, 0.015));
    if (!o.pack) upper.add(mesh(G.sphere, mid, 0, 0.76, -0.33, 0.38, 0.24, 0.22));
  } else if (top === 'tank') {
    upper.add(mesh(G.cyl, acc, 0, 0.46, 0, 0.49, 0.06, 0.405));
  } else if (top === 'polo') {
    for (const s of [-1, 1]) { const f = mesh(G.box, acc, s * 0.11, 0.76, 0.33, 0.14, 0.04, 0.1); f.rotation.z = s * 0.45; upper.add(f); }
    upper.add(mesh(G.box, white, 0, 0.62, 0.385, 0.06, 0.2, 0.02));
    for (const y of [0.66, 0.57]) upper.add(mesh(G.sphere, acc, 0, y, 0.4, 0.022));
  }
  if (o.pack) {
    const pk = toon(o.packColor), pkD = toon(shade(o.packColor, 0.65));
    upper.add(mesh(G.sphere, pk, 0, 0.42, -0.5, 0.34, 0.37, 0.2));
    upper.add(mesh(G.sphere, pkD, 0, 0.28, -0.66, 0.23, 0.15, 0.08));
    upper.add(mesh(G.box, white, 0, 0.6, -0.68, 0.22, 0.02, 0.03));
    for (const s of [-1, 1]) upper.add(mesh(G.box, pkD, s * 0.2, 0.5, 0.36, 0.07, 0.5, 0.04));
  }

  // ---- head
  const head = new THREE.Group(); head.position.set(0, 1.17, 0); upper.add(head);
  head.add(mesh(G.sphere, sk, 0, 0, 0, 0.55));
  const R = 0.55;
  // place a part on the face sphere by yaw/pitch, oriented along the surface normal
  const face = (par, geo, mat, yaw, pitch, out, sx, sy, sz, oy = 0) => {
    const r = R + out;
    const m = mesh(geo, mat, Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r - oy, Math.cos(yaw) * Math.cos(pitch) * r, sx, sy, sz);
    m.rotation.set(-pitch, yaw, 0, 'YXZ'); par.add(m); return m;
  };
  for (const s of [-1, 1]) {
    head.add(mesh(G.sphere, sk, s * 0.53, -0.02, -0.02, 0.08, 0.13, 0.09));   // ears
    head.add(mesh(G.sphere, skD, s * 0.585, -0.02, 0, 0.025, 0.08, 0.05));
    face(head, G.sphere, blush, s * 0.56, -0.2, -0.025, 0.085, 0.05, 0.03);  // cheeks
    const b = face(head, G.box, hairM, s * 0.33, 0.43, 0.0, 0.17, 0.04, 0.05); // brows
    b.rotation.z = s * o.brow;
  }
  face(head, G.sphere, skD, 0, -0.1, -0.01, 0.075, 0.065, 0.07);            // nose
  if (o.grin) face(head, G.sphere, toon(0x5a2030), 0, -0.32, -0.04, 0.11, 0.06, 0.05);
  else face(head, cg.smile, toon(0x5a2030), 0, -0.3, -0.02, 0.1, 0.1, 0.06).rotation.z = Math.PI;
  let eyes = null;
  if (o.shades && hat !== 'helmet') {
    const lens = toon(0x15151d);
    for (const s of [-1, 1]) {
      face(head, G.sphere, lens, s * 0.34, 0.1, 0.02, 0.165, 0.12, 0.05);
      face(head, G.box, white, s * 0.34 + 0.06, 0.16, 0.07, 0.04, 0.015, 0.01);
    }
    face(head, G.box, lens, 0, 0.13, 0.02, 0.12, 0.025, 0.03);
  } else {
    eyes = new THREE.Group(); eyes.position.y = 0.06; head.add(eyes);
    const iris = toon(o.eye);
    for (const s of [-1, 1]) {
      face(eyes, G.sphere, white, s * 0.34, 0.1, -0.04, 0.125, 0.15, 0.07, 0.06);
      face(eyes, G.sphere, iris, s * 0.34, 0.085, 0.005, 0.075, 0.095, 0.03, 0.06);
      face(eyes, G.sphere, ink, s * 0.34, 0.085, 0.02, 0.04, 0.055, 0.015, 0.06);
      face(eyes, G.sphere, white, s * 0.34 + 0.055, 0.15, 0.035, 0.024, 0.028, 0.01, 0.06);
    }
  }

  // ---- hair & hats
  const hairCap = (sx = 0.6, sy = 0.55) => { const m = mesh(G.halfSphere, hairM, 0, 0.04, -0.04, sx, sy, 0.62); m.rotation.x = -0.5; head.add(m); return m; };
  const bangs = () => { for (const yw of [-0.42, 0, 0.42]) face(head, G.sphere, hairM, yw, 0.62, -0.03, 0.17, 0.1, 0.12); };
  const backHair = () => head.add(mesh(G.sphere, hairM, 0, -0.04, -0.16, 0.5, 0.45, 0.45));
  let sway = null;
  if (hat === 'cap') {
    const d = mesh(G.halfSphere, body, 0, 0.16, -0.01, 0.6, 0.48, 0.61); d.rotation.x = -0.15; head.add(d);
    const brim = mesh(G.cyl, dark, 0, 0.21, 0.48, 0.33, 0.035, 0.3); brim.rotation.x = 0.15; head.add(brim);
    face(head, G.cyl, acc, 0, 0.62, 0.04, 0.1, 0.02, 0.1).rotateX(Math.PI / 2);
    head.add(mesh(G.sphere, acc, 0, 0.64, -0.08, 0.06));
    backHair();
  } else if (hat === 'beanie') {
    const bc = toon(o.accent === 0xffffff ? shade(color, 0.75) : o.accent);
    const d = mesh(G.halfSphere, mid, 0, 0.12, -0.02, 0.61, 0.6, 0.62); d.rotation.x = -0.2; head.add(d);
    const cuff = mesh(G.torus, bc, 0, 0.16, -0.01, 0.59, 0.59, 0.7); cuff.rotation.x = Math.PI / 2 - 0.2; head.add(cuff);
    head.add(mesh(G.sphere, bc, 0, 0.72, -0.14, 0.15));
    backHair();
  } else if (hat === 'hair') {
    hairCap(); bangs();
    for (const [x, z, rz, rx] of [[-0.2, 0.15, 0.5, 0.3], [0.05, 0.25, -0.2, 0.5], [0.22, 0.05, -0.6, 0.2], [-0.05, -0.15, 0.2, -0.4]]) {
      const t = mesh(G.cone, hairM, x, 0.55, z, 0.12, 0.28, 0.12); t.rotation.set(rx, 0, rz); head.add(t);
    }
  } else if (hat === 'crown') {
    hairCap(); bangs();
    const gold = toon(0xffcc33, { emissive: 0x664400, ei: 0.6, metal: true });
    head.add(mesh(G.cyl, gold, 0, 0.56, -0.02, 0.32, 0.13, 0.32));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + Math.PI / 2;
      head.add(mesh(G.cone, gold, Math.cos(a) * 0.27, 0.72, Math.sin(a) * 0.27 - 0.02, 0.07, 0.2, 0.07));
      head.add(mesh(G.sphere, gold, Math.cos(a) * 0.27, 0.84, Math.sin(a) * 0.27 - 0.02, 0.04));
    }
    head.add(mesh(G.sphere, toon(0xff2a55, { emissive: 0xff2a55, ei: 1.3 }), 0, 0.56, 0.31, 0.065));
    for (const s of [-1, 1]) head.add(mesh(G.sphere, toon(0x3aa0ff, { emissive: 0x3aa0ff, ei: 1.3 }), s * 0.23, 0.56, 0.22, 0.045));
  } else if (hat === 'headphones') {
    hairCap(); bangs();
    const hp = toon(0x23232c), glow = toon(o.accent === 0x23232e ? 0x6ad1ff : o.accent, { emissive: o.accent === 0x23232e ? 0x6ad1ff : o.accent, ei: 1.1 });
    head.add(mesh(cg.arc, hp, 0, 0.02, 0, 0.63, 0.63, 0.9));
    for (const s of [-1, 1]) {
      const c = mesh(G.cyl, hp, s * 0.59, -0.02, 0, 0.17, 0.13, 0.17); c.rotation.z = Math.PI / 2; head.add(c);
      const l = mesh(G.cyl, glow, s * 0.665, -0.02, 0, 0.12, 0.03, 0.12); l.rotation.z = Math.PI / 2; head.add(l);
    }
  } else if (hat === 'bandana') {
    hairCap(); backHair();
    const bd = toon(o.accent === 0xffffff ? 0xe94040 : o.accent);
    const band = mesh(G.cyl, bd, 0, 0.26, -0.01, 0.585, 0.14, 0.585); band.rotation.x = -0.25; head.add(band);
    for (const yw of [-0.6, -0.2, 0.2, 0.6]) face(head, G.sphere, white, yw, 0.6, 0.035, 0.028, 0.028, 0.015);
    head.add(mesh(G.sphere, bd, 0, 0.3, -0.6, 0.08));
    for (const s of [-1, 1]) { const t = mesh(G.box, bd, s * 0.07, 0.15, -0.64, 0.07, 0.24, 0.03); t.rotation.set(0.3, 0, s * 0.35); head.add(t); }
  } else if (hat === 'visor') {
    hairCap();
    for (const [x, z, rz, rx] of [[-0.18, 0.05, 0.45, -0.2], [0, 0.1, 0, -0.1], [0.18, 0.05, -0.45, -0.2], [-0.1, -0.2, 0.3, -0.6], [0.1, -0.2, -0.3, -0.6]]) {
      const t = mesh(G.cone, hairM, x, 0.56, z, 0.1, 0.3, 0.1); t.rotation.set(rx, 0, rz); head.add(t);
    }
    const vb = mesh(G.cyl, acc, 0, 0.24, 0, 0.585, 0.08, 0.585); vb.rotation.x = -0.15; head.add(vb);
    const brim = mesh(G.cyl, body, 0, 0.3, 0.5, 0.32, 0.03, 0.26); brim.rotation.x = 0.12; head.add(brim);
  } else if (hat === 'helmet') {
    const d = mesh(G.halfSphere, body, 0, 0.04, -0.02, 0.64, 0.62, 0.66); d.rotation.x = -0.15; head.add(d);
    const st = mesh(G.halfSphere, acc, 0, 0.04, -0.02, 0.15, 0.635, 0.675); st.rotation.x = -0.15; head.add(st);
    const rim = mesh(G.torus, dark, 0, 0.06, -0.02, 0.63, 0.65, 0.4); rim.rotation.x = Math.PI / 2 - 0.15; head.add(rim);
    const glass = toon(0x3ad0ff, { emissive: 0x0a5a80, ei: 0.6, metal: true });
    face(head, G.box, toon(0x23232c), 0, 0.5, 0.1, 0.62, 0.06, 0.05);
    for (const s of [-1, 1]) face(head, G.sphere, glass, s * 0.25, 0.5, 0.13, 0.13, 0.09, 0.06);
  } else if (hat === 'mohawk') {
    hairCap(0.575, 0.52);
    const mh = toon(o.accent === 0xffffff || o.accent === 0x23232e ? 0xff4f8a : o.accent);
    for (let i = 0; i < 6; i++) {
      const a = 0.6 + i * 0.32;
      const t = mesh(G.cone, mh, 0, Math.sin(a) * 0.66, Math.cos(a) * 0.66, 0.07, 0.28 - Math.abs(i - 2) * 0.02, 0.17);
      t.rotation.x = Math.PI / 2 - a; head.add(t);
    }
  } else if (hat === 'ponytail') {
    hairCap(); bangs();
    sway = new THREE.Group(); sway.position.set(0, 0.25, -0.52); head.add(sway);
    sway.add(mesh(G.sphere, acc, 0, 0, 0, 0.08));
    sway.add(mesh(G.sphere, hairM, 0, -0.13, -0.08, 0.13, 0.17, 0.13));
    sway.add(mesh(G.sphere, hairM, 0, -0.32, -0.12, 0.1, 0.15, 0.1));
    const tip = mesh(G.cone, hairM, 0, -0.48, -0.13, 0.075, 0.16, 0.075); tip.rotation.x = Math.PI; sway.add(tip);
  } else if (hat === 'sunhat') {
    hairCap(); backHair();
    const straw = toon(0xe8c98a), strawD = toon(0xc9a362);
    const brim = mesh(G.cyl, straw, 0, 0.32, 0, 0.98, 0.03, 0.98); brim.rotation.x = 0.08; head.add(brim);
    head.add(mesh(G.cyl, straw, 0, 0.48, -0.02, 0.43, 0.3, 0.43));
    head.add(mesh(G.halfSphere, straw, 0, 0.62, -0.02, 0.43, 0.12, 0.43));
    head.add(mesh(G.cyl, acc === white ? toon(0xe94040) : acc, 0, 0.41, -0.02, 0.44, 0.08, 0.44));
    head.add(mesh(G.cyl, strawD, 0, 0.335, 0, 0.99, 0.008, 0.99));
  } else {
    hairCap(); // short cut
    face(head, G.sphere, hairM, 0.2, 0.66, -0.02, 0.18, 0.09, 0.12);
  }

  // ---- limbs
  const sleeve = top === 'hoodie' ? 'long' : top === 'tank' ? 'none' : 'short';
  const leg = (x) => {
    const hip = new THREE.Group(); hip.position.set(x, 0.86, 0); root.add(hip);
    if (o.shorts) {
      hip.add(mesh(G.capsule, bot, 0, -0.13, 0, 0.37, 0.2, 0.37));
      hip.add(mesh(G.capsule, sk, 0, -0.3, 0, 0.28, 0.18, 0.28));
      hip.add(mesh(G.cyl, botD, 0, -0.31, 0, 0.19, 0.04, 0.19));
    } else {
      hip.add(mesh(G.capsule, bot, 0, -0.215, 0, 0.32, 0.285, 0.32));
      hip.add(mesh(G.box, botD, x > 0 ? 0.16 : -0.16, -0.2, 0, 0.02, 0.36, 0.06)); // side seam
    }
    const knee = new THREE.Group(); knee.position.set(0, -0.43, 0); hip.add(knee);
    knee.add(mesh(G.capsule, o.shorts ? sk : bot, 0, -0.215, 0, 0.29, 0.285, 0.29));
    if (o.shorts) knee.add(mesh(G.cyl, white, 0, -0.37, 0, 0.155, 0.1, 0.155)); // socks
    else knee.add(mesh(G.cyl, botD, 0, -0.36, 0, 0.16, 0.06, 0.16));           // cuff
    // sneaker: upper, sole, toe cap, laces, side stripes
    knee.add(mesh(G.sphere, shoeM, 0, -0.45, 0.09, 0.19, 0.12, 0.3));
    knee.add(mesh(G.cyl, soleM, 0, -0.555, 0.09, 0.205, 0.05, 0.32));
    knee.add(mesh(G.sphere, soleM, 0, -0.5, 0.3, 0.13, 0.075, 0.1));
    for (const z of [0.12, 0.2]) knee.add(mesh(G.box, white, 0, -0.345 - (z - 0.12) * 0.35, z, 0.11, 0.02, 0.025));
    const stripe = toon(o.shoe === 0xf4f4f6 ? o.accent === 0xffffff ? 0xe94040 : o.accent : 0xffffff);
    for (const s of [-1, 1]) knee.add(mesh(G.box, stripe, s * 0.185, -0.46, 0.06, 0.02, 0.045, 0.17));
    return [hip, knee];
  };
  const arm = (x) => {
    const sh = new THREE.Group(); sh.position.set(x, 0.7, 0); upper.add(sh);
    sh.add(mesh(G.capsule, sleeve === 'long' ? body : sk, 0, -0.2, 0, 0.26, 0.27, 0.26));
    if (sleeve === 'short') {
      sh.add(mesh(G.capsule, body, 0, -0.08, 0, 0.31, 0.16, 0.31));
      if (top === 'jersey' || top === 'polo') sh.add(mesh(G.cyl, acc, 0, -0.2, 0, 0.158, 0.035, 0.158));
    }
    const el = new THREE.Group(); el.position.set(0, -0.4, 0); sh.add(el);
    el.add(mesh(G.capsule, sleeve === 'long' ? body : sk, 0, -0.19, 0, 0.24, 0.26, 0.24));
    if (sleeve === 'long') el.add(mesh(G.cyl, mid, 0, -0.33, 0, 0.135, 0.07, 0.135));
    else if (o.wrist) el.add(mesh(G.cyl, acc, 0, -0.32, 0, 0.135, 0.08, 0.135));
    el.add(mesh(G.sphere, sk, 0, -0.43, 0, 0.17));
    el.add(mesh(G.sphere, sk, x > 0 ? -0.1 : 0.1, -0.38, 0.08, 0.065, 0.08, 0.065)); // thumb
    return [sh, el];
  };
  const [legL, kneeL] = leg(-0.24), [legR, kneeR] = leg(0.24);
  const [armL, elbowL] = arm(-0.62), [armR, elbowR] = arm(0.62);
  root.add(mesh(G.sphere, bot, 0, 0.86, 0, 0.42, 0.22, 0.34)); // pelvis

  // ---- bake: one or two draw calls per joint
  bakeJoint(root);
  const torso = bakeJoint(upper);
  bakeJoint(head);
  if (eyes) bakeJoint(eyes, false);
  if (sway) bakeJoint(sway);
  for (const j of [legL, kneeL, legR, kneeR, armL, elbowL, armR, elbowR]) bakeJoint(j);

  const hand = new THREE.Group(); hand.position.set(0, -0.43, 0); elbowR.add(hand);
  const hold = new THREE.Group(); hold.position.set(0, 3.0, 0); root.add(hold);
  g.userData = { root, upper, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, hold, hand, phase: 0, bat: null, sm: 0, eyes, blink: 1 + Math.random() * 3, sway, outfit: o };
  return g;
}

// ---------------------------------------------------------------- bats
const BAT_REST = 3.95; // with the arm raised this points the bat up over the shoulder
// barrel profile (radius, y) — handle end at y≈-0.4, cap at y≈-1.95
const BAT_PROFILE = [[0, -1.95], [0.12, -1.95], [0.165, -1.9], [0.172, -1.75], [0.16, -1.4], [0.12, -0.95], [0.085, -0.6], [0.07, -0.4], [0, -0.4]];
let BG = null;
const batGeo = () => BG || (BG = {
  barrel: new THREE.LatheGeometry(BAT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 18),
  oct: new THREE.OctahedronGeometry(1, 0),
});
const batR = (y) => { // barrel radius at height y
  for (let i = 2; i < BAT_PROFILE.length - 1; i++) {
    const [r1, y1] = BAT_PROFILE[i - 1], [r2, y2] = BAT_PROFILE[i];
    if (y >= y1 && y <= y2) return r1 + (r2 - r1) * (y - y1) / (y2 - y1);
  }
  return 0.07;
};
export function makeBat(def) {
  const g = new THREE.Group();
  if (!def || !def.color) return g;
  const bg = batGeo(), id = def.id;
  const band = (mat, y, h, out = 0.006) => { const r = batR(y) + out; g.add(mesh(G.cyl, mat, 0, y, 0, r, h, r)); };
  const radial = (geo, mat, a, y, out, sx, sy, sz, tilt = 0) => { // part sticking out of the barrel surface
    const r = batR(y) + out, m = mesh(geo, mat, Math.cos(a) * r, y, Math.sin(a) * r, sx, sy, sz);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), tilt, Math.sin(a)).normalize());
    g.add(m); return m;
  };
  const gripTape = (mat, ridge) => {
    g.add(mesh(G.cyl, mat, 0, -0.2, 0, 0.07, 0.45, 0.07));
    for (let i = 0; i < 6; i++) { const t = mesh(G.cyl, ridge, 0, -0.03 - i * 0.07, 0, 0.074, 0.018, 0.074); t.rotation.z = 0.22; g.add(t); }
  };
  if (id === 'wood') {
    const wood = toon(def.color, { rough: 0.75 }), grain = toon(shade(def.color, 0.72)), burn = toon(0x5a3418);
    g.add(mesh(bg.barrel, wood));
    for (const y of [-0.72, -1.02, -1.3, -1.55, -1.8]) band(grain, y, 0.014, 0.003);
    radial(G.sphere, burn, 0, -1.35, -0.004, 0.11, 0.02, 0.05);
    gripTape(toon(0x1d1d22, { rough: 0.95 }), toon(0x3a3a44, { rough: 0.95 }));
    g.add(mesh(G.sphere, wood, 0, 0.03, 0, 0.1, 0.06, 0.1));
    g.add(mesh(G.cyl, grain, 0, -1.952, 0, 0.12, 0.006, 0.12));
  } else if (id === 'nail') {
    const wood = toon(def.color, { rough: 0.85 }), grain = toon(shade(def.color, 0.65)), steel = toon(0xb8c0c8, { metal: true });
    g.add(mesh(bg.barrel, wood));
    for (const y of [-0.85, -1.4]) band(grain, y, 0.016, 0.003);
    band(toon(0xe8e0cc, { rough: 0.9 }), -0.66, 0.08, 0.008);               // duct-tape patch
    band(toon(0x9a9a9e, { rough: 0.6 }), -1.2, 0.1, 0.008);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996, y = -0.95 - (i / 15) * 0.9;
      radial(G.coneLo, steel, a, y, 0.07, 0.022, 0.17, 0.022, (i % 3 - 1) * 0.25);
      radial(G.cylLo, steel, a, y, -0.005, 0.03, 0.012, 0.03);           // nail head ring
    }
    for (const [y, rx] of [[-1.05, 0.35], [-1.65, -0.3]]) { const w = mesh(G.ring, toon(0x55585e, { metal: true }), 0, y, 0, batR(y) + 0.02, batR(y) + 0.02, 0.8); w.rotation.set(Math.PI / 2 + rx, 0, 0); g.add(w); }
    gripTape(toon(0x7a1f22, { rough: 0.9 }), toon(0x2a1a1a, { rough: 0.9 }));
    g.add(mesh(G.sphere, wood, 0, 0.03, 0, 0.1, 0.06, 0.1));
  } else if (id === 'metal') {
    const alu = toon(def.color, { metal: true, rough: 0.28 }), dk = toon(0x2a2d34, { rough: 0.5 }), red = toon(0xe0303a, { rough: 0.4 });
    g.add(mesh(bg.barrel, alu));
    band(dk, -0.45, 0.06); band(red, -0.62, 0.03); band(red, -1.12, 0.05); band(toon(0x2a6fd0, { rough: 0.4 }), -1.2, 0.03);
    band(dk, -1.93, 0.04, 0.0);
    g.add(mesh(G.cyl, dk, 0, -1.955, 0, 0.13, 0.02, 0.13));                  // rubber end cap
    gripTape(toon(0x1a1a20, { rough: 0.9 }), red);
    g.add(mesh(G.cyl, alu, 0, 0.03, 0, 0.11, 0.05, 0.11));
  } else if (id === 'gold') {
    const gold = toon(def.color, { metal: true, rough: 0.22, emissive: 0x553300, ei: 0.35 }), wg = toon(0xfff2c0, { metal: true, rough: 0.2 });
    g.add(mesh(bg.barrel, gold));
    band(wg, -0.6, 0.04); band(wg, -1.85, 0.04); band(wg, -1.3, 0.02);
    const gems = [0xff2a55, 0x3aa0ff, 0x3cff8a, 0xc060ff];
    for (let i = 0; i < 4; i++) {
      const c = gems[i], gm = toon(c, { emissive: c, ei: 1.4 });
      radial(bg.oct, gm, i * Math.PI / 2, -1.5, 0.01, 0.045, 0.07, 0.045);
      radial(bg.oct, gm, i * Math.PI / 2 + Math.PI / 4, -1.0, 0.005, 0.03, 0.05, 0.03);
    }
    gripTape(toon(0x5a2a8a, { rough: 0.95 }), wg);
    g.add(mesh(G.sphere, gold, 0, 0.03, 0, 0.11, 0.07, 0.11));
    g.add(mesh(bg.oct, toon(0xffffff, { emissive: 0xaaddff, ei: 1.6 }), 0, 0.11, 0, 0.05, 0.07, 0.05));
  } else if (id === 'plasma' || def.glow) {
    const frame = toon(0x2a2f3a, { metal: true, rough: 0.3 }), glow = toon(def.color, { emissive: def.color, ei: 2.2 });
    const core = toon(0xdffcff, { emissive: def.color, ei: 2.0, unique: true });
    const c = mesh(bg.barrel, core, 0, 0, 0, 0.82, 1, 0.82); c.castShadow = false; g.add(c);
    const tilt = Math.atan((0.172 - 0.085) / 1.15);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, r = batR(-1.2) + 0.012;
      const rib = mesh(G.box, frame, Math.cos(a) * r, -1.2, Math.sin(a) * r, 0.03, 1.25, 0.05);
      rib.rotation.set(0, -a, tilt, 'YXZ'); g.add(rib);
    }
    band(frame, -0.55, 0.08); band(frame, -1.87, 0.1);
    g.add(mesh(G.cyl, frame, 0, -0.2, 0, 0.072, 0.45, 0.072));
    for (let i = 0; i < 4; i++) g.add(mesh(G.cyl, glow, 0, -0.06 - i * 0.1, 0, 0.076, 0.015, 0.076));
    g.add(mesh(G.sphere, frame, 0, 0.03, 0, 0.1, 0.06, 0.1));
    const tip = mesh(G.sphere, glow, 0, -1.98, 0, 0.1); tip.castShadow = false; g.add(tip);
    const spin = new THREE.Group(); g.add(spin);
    for (const [y, rx, ry] of [[-0.85, 0.35, 0], [-1.3, -0.3, 1.2], [-1.72, 0.25, 2.4]]) {
      const r = batR(y) + 0.06, ring = mesh(G.ring, glow, 0, y, 0, r, r, 1.5);
      ring.rotation.set(Math.PI / 2 + rx, ry, 0, 'YXZ'); ring.castShadow = false; spin.add(ring);
    }
    bakeJoint(spin, false);
    g.userData.spin = spin; g.userData.pulse = core; g.userData.pulseBase = 2.0;
  } else { // unknown tier: generic bat in its colour
    const m = toon(def.color, { metal: !!def.metal, rough: def.metal ? 0.3 : 0.7 });
    g.add(mesh(bg.barrel, m));
    gripTape(toon(0x222222, { rough: 0.9 }), toon(0x444444, { rough: 0.9 }));
    g.add(mesh(G.sphere, m, 0, 0.03, 0, 0.1, 0.06, 0.1));
  }
  bakeJoint(g);
  g.rotation.x = BAT_REST; // resting on the shoulder
  return g;
}
export function setBat(ch, def) {
  const u = ch.userData;
  if (u.bat) { u.hand.remove(u.bat); u.bat.traverse(o => { if (o.userData.baked) o.geometry.dispose(); }); if (u.bat.userData.pulse) u.bat.userData.pulse.dispose(); }
  u.bat = makeBat(def); u.hand.add(u.bat);
}

// joint smoothing so poses blend instead of snapping
const toward = (o, axis, v, k) => { o.rotation[axis] += (v - o.rotation[axis]) * k; };

export function animateCharacter(ch, dt, speed, opts = {}) {
  const u = ch.userData;
  const k = 1 - Math.exp(-22 * dt), kSlow = 1 - Math.exp(-9 * dt);
  // run intensity eases in/out (no instant pose changes when starting/stopping)
  u.sm += (Math.min(1, speed / 16) - u.sm) * (1 - Math.exp(-8 * dt));
  const s = u.sm;
  // cadence from stride length: strides get longer at speed, cadence is capped like a real sprinter
  const stride = 1.5 + speed * 0.035;
  const cps = speed > 0.5 ? Math.min(4.6, speed / (2 * stride)) : 0;
  u.phase += dt * (cps > 0 ? cps * Math.PI * 2 : 1.4);
  const p = u.phase;
  const air = !!opts.air;

  // ---- legs: thigh swings, knee flexes most while the leg recovers forward, slight flex on landing
  [[u.legL, u.kneeL, 0], [u.legR, u.kneeR, Math.PI]].forEach(([hip, knee, off]) => {
    const sn = Math.sin(p + off), cs = Math.cos(p + off);
    let th = (-0.95 * sn - 0.12) * s, kn = (0.2 + 1.45 * Math.max(0, cs) + 0.25 * Math.max(0, -cs) * Math.max(0, sn)) * s + 0.04;
    if (air) { th = off ? 0.45 : -0.95; kn = off ? 1.0 : 1.35; }
    if (opts.stun > 0) { th = Math.sin(opts.stun * 20 + off) * 0.3; kn = 0.4; }
    toward(hip, 'x', th, k); toward(knee, 'x', kn, k);
    toward(hip, 'z', (off ? -1 : 1) * 0.03 * s, k);
  });

  // ---- arms: counter-swing to the legs, elbows bend more when the arm drives forward
  const armPose = (sh, el, off) => {
    const sn = Math.sin(p + off);
    const a = 0.85 * sn * s + (1 - s) * Math.sin(p * 0.5 + off) * 0.03;
    const e = -(0.18 + 1.05 * s + 0.45 * s * Math.max(0, -sn));
    toward(sh, 'x', a, k); toward(el, 'x', e, k); toward(sh, 'z', (off ? -1 : 1) * -(0.06 + 0.06 * s), k);
  };
  const hasBat = u.bat && u.bat.children.length;
  if (opts.carrying) {
    for (const [sh, el, sgn] of [[u.armL, u.elbowL, -1], [u.armR, u.elbowR, 1]]) { toward(sh, 'x', Math.PI * 0.9, k); toward(el, 'x', -0.45, k); toward(sh, 'z', sgn * 0.3, k); }
  } else if (opts.swing > 0) {
    const q = 1 - opts.swing, wind = Math.min(1, q / 0.3), fol = Math.max(0, (q - 0.3) / 0.7);
    const ease = 1 - Math.pow(1 - fol, 3);
    u.armR.rotation.x = -1.45; u.armR.rotation.z = 0.15; u.elbowR.rotation.x = -0.25 * (1 - ease);
    u.armL.rotation.x = -1.2; u.armL.rotation.z = -0.5; u.elbowL.rotation.x = -0.5;
    u.upper.rotation.y = 1.1 * wind - 2.2 * ease;
    u.root.rotation.y = 0.3 * wind - 0.5 * ease; // hips lead the swing a little
    if (u.bat) u.bat.rotation.x = 0.15 + 1.9 * (1 - ease) * wind;
  } else {
    armPose(u.armL, u.elbowL, Math.PI);   // left arm opposite to left leg
    armPose(u.armR, u.elbowR, 0);
    if (hasBat) { toward(u.armR, 'x', -1.05, k); toward(u.armR, 'z', 0.25, k); toward(u.elbowR, 'x', -0.35, k); }
  }
  if (!(opts.swing > 0)) {
    toward(u.root, 'y', 0, kSlow);
    toward(u.upper, 'y', 0.22 * s * Math.sin(p), k);          // shoulders rotate against the hips
    if (u.bat) u.bat.rotation.x += (BAT_REST - u.bat.rotation.x) * (1 - Math.exp(-10 * dt));
  }
  u.head.rotation.y = -u.upper.rotation.y * 0.75;               // head stays looking ahead
  u.head.rotation.x = -0.12 * s;

  // ---- whole body: forward lean, vertical bounce (high mid-flight, low at foot strike), hip roll
  const bob = speed > 0.5 ? (Math.abs(Math.sin(p)) * 0.17 - 0.07) * s : Math.sin(p) * 0.02;
  u.root.position.y += ((air ? 0.05 : bob) - u.root.position.y) * k;
  toward(u.root, 'x', 0.06 + 0.24 * s + (air ? -0.1 : 0), kSlow);
  const roll = opts.stun > 0 ? Math.sin(opts.stun * 30) * 0.25 : 0.045 * s * Math.sin(p);
  toward(u.root, 'z', roll, k);

  // ---- cosmetic only: blinking, ponytail sway, plasma bat fx
  if (u.eyes) {
    u.blink -= dt;
    if (u.blink < 0) u.blink = 1.8 + Math.random() * 3.5;
    u.eyes.scale.y = u.blink < 0.11 ? 0.12 : opts.stun > 0 ? 0.45 : 1;
  }
  if (u.sway) {
    toward(u.sway, 'x', (air ? 0.9 : 0.5 * s + Math.sin(p * 2) * 0.22 * s), kSlow);
    toward(u.sway, 'z', Math.sin(p) * 0.3 * s, kSlow);
  }
  const bd = u.bat && u.bat.userData;
  if (bd && bd.spin) {
    bd.spin.rotation.y += dt * 5;
    bd.pulse.emissiveIntensity = bd.pulseBase + Math.sin(performance.now() * 0.009) * 0.6;
  }
}

// ---------------------------------------------------------------- creatures
// Every body shape knows where its face is: eyeY / ex (eye height / half spacing) and surf(x, y) = z of the
// front surface at that point, so eyes, mouths, cheeks and accessories sit snugly on the body.
const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _dv = new THREE.Vector3();
const aim = (o, x, y, z, axis = _Y) => { o.quaternion.setFromUnitVectors(axis, _dv.set(x, y, z).normalize()); return o; };
const R = (o, x, y, z) => { o.rotation.set(x, y, z); return o; };
const ch = (p, o) => (p.add(o), o);
const P = (geo, ...a) => mesh(geo, null, ...a); // throw-away part, only used as input for fuse()
const ell = (cy, rx, ry, rz, cz = 0, cx = 0) => (x, y) => cz + rz * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2));
// point + outward normal on an ellipsoid E = [cy, rx, ry, rz]; a = angle around y (π/2 = front), v = -1..1 (bottom → top)
const onEll = (E, a, v) => { const r = Math.sqrt(Math.max(0, 1 - v * v)), x = E[1] * r * Math.cos(a), y = E[0] + E[2] * v, z = E[3] * r * Math.sin(a); return [x, y, z, x / E[1] ** 2, (y - E[0]) / E[2] ** 2, z / E[3] ** 2]; };
function roundBoxGeo(r, seg) {
  const geo = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg), p = geo.attributes.position, n = geo.attributes.normal, h = 0.5 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
    v.sub(c).normalize();
    n.setXYZ(i, v.x, v.y, v.z); p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
  }
  return geo;
}
const DROP_H = 1.75;
const dropR = y => 0.72 * Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, y / DROP_H)), 0.62));
const bananaX = y => 1.1 - Math.sqrt(Math.max(0, 1.21 - (y - 1.007) ** 2));
const cupR = y => 0.45 + 0.17 * y;
const capR = z => 0.45 * Math.sqrt(Math.max(0, 1 - (Math.max(0, Math.abs(z) - 0.425) / 0.425) ** 2));
const CRG = {
  arc: new THREE.TorusGeometry(1, 0.22, 6, 16, Math.PI),
  curl: new THREE.TorusGeometry(1, 0.36, 8, 18, Math.PI * 1.3),
  omega: new THREE.TorusGeometry(1, 0.2, 6, 18, Math.PI * 1.6),
  half: new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, Math.PI / 2, Math.PI),
  rbox: roundBoxGeo(0.22, 8),
  cap: new THREE.CapsuleGeometry(0.5, 1, 2, 7), // light capsule for small parts
  drop: new THREE.LatheGeometry(Array.from({ length: 24 }, (_, i) => new THREE.Vector2(dropR(i / 23 * DROP_H), i / 23 * DROP_H)), 20),
  prism: (() => { const p = new THREE.CylinderGeometry(1, 1, 1, 3).toNonIndexed(); p.computeVertexNormals(); return p; })(),
  banana: new THREE.TorusGeometry(1.1, 0.3, 10, 16, Math.PI * 4 / 9),
  cup: new THREE.CylinderGeometry(0.62, 0.45, 1.0, 16),
  pot: new THREE.CylinderGeometry(0.62, 0.48, 0.45, 14),
  facet: new THREE.IcosahedronGeometry(1, 1),
  gem: new THREE.OctahedronGeometry(1, 0),
};
// merge several same-material parts into one mesh (one draw call for an animated multi-part piece)
function fuse(mat, parts) {
  const geos = parts.map(p => {
    p.updateMatrix();
    const geo = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    return geo.applyMatrix4(p.matrix);
  });
  const o = new THREE.Mesh(mergeGeometries(geos), mat); o.castShadow = true; return o;
}
// move the children of helper groups up to g (keeping their world transform) so bakeStatic can merge them
function flatten(g, keep) {
  g.updateMatrixWorld(true);
  for (let i = 0; i < g.children.length; i++) {
    const o = g.children[i];
    if (o.isMesh || keep.has(o)) continue;
    while (o.children.length) g.attach(o.children[0]);
    g.remove(o); i = -1;
  }
}

const SHAPES = {
  blob: { make: (g, m) => g.add(mesh(G.sphere, m.c1, 0, 0.62, 0, 0.72, 0.62, 0.7)), ell: [0.62, 0.72, 0.62, 0.7], eyeY: 0.8, ex: 0.24, top: 1.24, w: 0.72, back: -0.7 },
  box: { make: (g, m) => g.add(mesh(CRG.rbox, m.c1, 0, 0.62, 0, 1.15, 0.95, 0.95)), surf: () => 0.475, eyeY: 0.8, ex: 0.24, top: 1.1, w: 0.575, back: -0.475 },
  cyl: {
    make: (g, m) => { g.add(mesh(G.cyl, m.c1, 0, 0.575, 0, 0.55, 1.05, 0.55)); g.add(mesh(G.halfSphere, m.c1, 0, 1.1, 0, 0.55, 0.3, 0.55)); },
    surf: x => Math.sqrt(Math.max(0, 0.3025 - x * x)), eyeY: 0.95, ex: 0.2, top: 1.4, w: 0.55, back: -0.55,
  },
  // soft teardrop (mop head / water spirit)
  cone: { make: (g, m) => g.add(mesh(CRG.drop, m.c1)), surf: (x, y) => Math.sqrt(Math.max(0, dropR(y) ** 2 - x * x)), eyeY: 0.85, ex: 0.22, top: 1.75, w: 0.68, back: -0.66 },
  egg: { make: (g, m) => g.add(mesh(G.sphere, m.c1, 0, 0.8, 0, 0.62, 0.8, 0.6)), ell: [0.8, 0.62, 0.8, 0.6], eyeY: 1.05, ex: 0.2, top: 1.6, w: 0.62, back: -0.6 },
  long: {
    make: (g, m) => { const b = mesh(G.capsule, m.c1, 0, 0.62, 0, 0.9, 0.85, 0.9); b.rotation.x = Math.PI / 2; g.add(b); },
    surf: ell(0.62, 0.45, 0.45, 0.425, 0.425), eyeY: 0.8, ex: 0.19, my: 0.56, top: 1.07, w: 0.45, back: -0.85, legZ: 0.45,
  },
  cup: {
    make: (g, m) => {
      g.add(mesh(CRG.cup, m.c1, 0, 0.5, 0));
      g.add(mesh(G.cyl, toon(0x6b3b1f), 0, 0.98, 0, 0.57, 0.05, 0.57));
      g.add(mesh(G.cyl, m.c2, 0, 0.25, 0, 0.5, 0.08, 0.5));
      const h = mesh(G.torus, m.c1, 0, 0.55, -0.6, 0.22); h.rotation.y = Math.PI / 2; g.add(h);
    }, surf: (x, y) => Math.sqrt(Math.max(0, cupR(y) ** 2 - x * x)), stalks: true, lid: 'c2', eyeY: 1.25, ex: 0.22, my: 0.55, top: 1.5, w: 0.6, back: -0.55,
  },
  burger: {
    make: (g, m) => {
      const bun = toon(0xe3a85a), lettuce = toon(0x5ccf4a);
      g.add(mesh(G.cyl, bun, 0, 0.17, 0, 0.7, 0.26, 0.7));
      g.add(mesh(G.cyl, toon(0x6b3a1e), 0, 0.4, 0, 0.78, 0.2, 0.78));
      g.add(mesh(G.box, toon(0xffd23f), 0, 0.53, 0, 1.4, 0.05, 1.4)).rotation.y = 0.4;
      g.add(mesh(G.cyl, lettuce, 0, 0.59, 0, 0.78, 0.05, 0.78));
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(mesh(G.sphereLo, lettuce, Math.cos(a) * 0.76, 0.58, Math.sin(a) * 0.76, 0.14, 0.05, 0.14)); }
      g.add(mesh(G.halfSphere, m.c1, 0, 0.62, 0, 0.74, 0.57, 0.74));
      const seed = toon(0xfff3d0);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + 0.3, rr = 0.12 + (i % 3) * 0.12, y = 0.62 + 0.57 * Math.sqrt(1 - (rr / 0.74) ** 2), x = Math.cos(a) * rr, z = Math.sin(a) * rr - 0.08;
        g.add(R(mesh(G.sphereLo, seed, x, y, z, 0.035, 0.022, 0.065), 0, a, 0));
      }
    }, surf: ell(0.62, 0.74, 0.57, 0.74), eyeY: 0.95, ex: 0.24, my: 0.77, top: 1.19, w: 0.74, back: -0.74,
  },
  banana: {
    make: (g, m) => {
      const b = mesh(CRG.banana, m.c1, 1.1, 1.007, 0); b.rotation.z = Math.PI * 7 / 9; g.add(b);
      g.add(mesh(G.sphere, m.c1, 0.257, 1.714, 0, 0.3)); g.add(mesh(G.sphere, m.c1, 0.257, 0.3, 0, 0.3));
      g.add(mesh(G.sphereLo, toon(0x5a3a1a), 0.43, 0.08, 0, 0.08));
      g.add(R(mesh(G.cylLo, toon(0x6b5a2a), 0.53, 2.04, 0, 0.07, 0.25, 0.07), 0, 0, -0.7));
    }, surf: (x, y) => Math.sqrt(Math.max(0, 0.09 - (x - bananaX(y)) ** 2)), eyeY: 1.15, ex: 0.12, es: 0.85, my: 0.94, top: 1.95, w: 0.3, back: -0.3, hx: 0.45, tilt: -0.7,
  },
  shell: {
    make: (g, m) => {
      g.add(mesh(G.sphere, m.c2, 0, 0.4, 0, 0.66, 0.22, 0.7));
      g.add(mesh(G.halfSphere, m.c1, 0, 0.42, 0, 0.72, 0.62, 0.72));
      g.add(R(mesh(G.torus, toon(0xe8d79a), 0, 0.43, 0, 0.73, 0.73, 0.45), Math.PI / 2, 0, 0));
      g.add(mesh(G.sphere, m.c2, 0, 0.5, 0.55, 0.2, 0.18, 0.25));
      g.add(mesh(G.sphere, m.c2, 0, 0.62, 0.8, 0.34));
      g.add(R(mesh(G.coneLo, m.c2, 0, 0.4, -0.78, 0.07, 0.22, 0.07), -Math.PI / 2, 0, 0));
    }, surf: ell(0.62, 0.34, 0.34, 0.34, 0.8), lid: 'c2', eyeY: 0.7, ex: 0.13, es: 0.9, my: 0.53, top: 1.05, w: 0.72, back: -0.72, hz: 0.8,
  },
  croissant: {
    make: (g, m) => {
      const ridge = toon(0xb8742a);
      for (let i = 0; i <= 6; i++) {
        const f = Math.PI * (0.95 + i / 6 * 1.1), r = 0.2 + 0.17 * Math.sin(Math.PI * i / 6);
        g.add(R(mesh(G.sphere, m.c1, Math.cos(f) * 0.62, 0.45, Math.sin(f) * 0.62, r * 1.5, r, r), 0, -f - Math.PI / 2, 0));
        if (i < 6) {
          const f2 = f + Math.PI * 1.1 / 12, r2 = (0.2 + 0.17 * Math.sin(Math.PI * (i + 0.5) / 6)) * 0.92;
          g.add(R(mesh(G.torus, ridge, Math.cos(f2) * 0.62, 0.45, Math.sin(f2) * 0.62, r2), 0, -f2, 0));
        }
      }
      g.add(mesh(G.sphere, m.c1, 0, 0.72, 0.45, 0.42));
    }, surf: ell(0.72, 0.42, 0.42, 0.42, 0.45), eyeY: 0.82, ex: 0.15, es: 0.95, my: 0.62, top: 1.14, w: 0.5, back: -0.98, hz: 0.45,
  },
  cheese: {
    make: (g, m) => g.add(R(mesh(CRG.prism, m.c1, 0, 0.6, 0, 0.95, 1.2, 0.95), 0, Math.PI, 0)),
    surf: () => 0.475, eyeY: 0.85, ex: 0.22, my: 0.6, top: 1.2, w: 0.82, back: -0.98,
  },
};

// eyes (with highlights), brows, mouth, cheeks + a hidden eyelid mesh that blinks
function buildFace(g, m, A, L, bits) {
  const add = o => (g.add(o), o);
  const es = A.es, ey = A.eyeY, style = L.eyes || 'round', lids = [];
  if (A.stalks) {
    for (const s of [-1, 1]) {
      const x = s * A.ex, y = ey + 0.1;
      add(mesh(G.cylLo, A.lidMat, x, ey - 0.15, 0.1, 0.05, 0.4, 0.05));
      add(mesh(G.sphere, m.w, x, y, 0.1, 0.15));
      add(mesh(G.sphere, m.k, x - s * 0.02, y - 0.01, 0.21, 0.075, 0.085, 0.05));
      add(mesh(G.sphereLo, m.w, x + 0.035, y + 0.04, 0.26, 0.03));
      lids.push([x, y, 0.11, 0.165, 0.165, 0.185]);
    }
  } else if (style === 'round' || style === 'sleepy' || style === 'glow') {
    for (const s of [-1, 1]) {
      const x = s * A.ex, z = A.surf(x, ey), px = x - s * 0.012 * es, py = ey - 0.015 * es;
      add(mesh(G.sphere, style === 'glow' ? m.glow : m.w, x, ey, z, 0.12 * es, 0.14 * es, 0.06));
      if (style === 'glow') add(mesh(G.sphere, m.k, px, py, z + 0.04, 0.025 * es, 0.09 * es, 0.035));
      else {
        if (L.iris) add(mesh(G.sphere, toon(L.iris), px, py, z + 0.03, 0.085 * es, 0.1 * es, 0.04));
        add(mesh(G.sphere, m.k, px, py, z + 0.045, (L.iris ? 0.048 : 0.072) * es, (L.iris ? 0.058 : 0.086) * es, 0.035));
      }
      add(mesh(G.sphereLo, m.w, x + 0.03 * es, ey + (style === 'sleepy' ? -0.03 : 0.045) * es, z + 0.075, 0.028 * es));
      add(mesh(G.sphereLo, m.w, x - 0.035 * es, ey - 0.055 * es, z + 0.07, 0.013 * es));
      if (style === 'sleepy') add(mesh(G.halfSphere, A.lidMat, x, ey - 0.005, z + 0.008, 0.14 * es, 0.16 * es, 0.115));
      lids.push([x, ey, z + 0.012, 0.14 * es, 0.16 * es, 0.105]);
    }
  } else if (style === 'happy') {
    for (const s of [-1, 1]) { const x = s * A.ex; add(mesh(CRG.arc, m.k, x, ey - 0.03, A.surf(x, ey) + 0.02, 0.08 * es, 0.08 * es, 0.05)); }
  } else if (style === 'pixel') {
    const px = toon(L.c1, { emissive: L.c1, ei: 0.9 }), z0 = A.surf(0, ey);
    add(mesh(CRG.rbox, m.k, 0, ey - 0.13, z0 - 0.005, 0.86, 0.6, 0.06));
    const eyes = fuse(px, [-1, 1].flatMap(s => [P(G.box, s * A.ex, ey, z0 + 0.03, 0.11 * es, 0.15 * es, 0.02), P(G.box, s * A.ex + 0.07 * es, ey + 0.05 * es, z0 + 0.03, 0.05 * es, 0.05 * es, 0.02)]));
    eyes.userData.blinkHide = Math.random() * 3; add(eyes);
  }
  // brows
  if (L.brow && style !== 'pixel') for (const s of [-1, 1]) {
    const x = s * A.ex, y = ey + (0.2 + (L.brow === 'cocky' && s > 0 ? 0.04 : 0)) * es, z = A.surf(x, y) + 0.02;
    if (L.brow === 'happy') add(mesh(CRG.arc, m.k, x, y - 0.02, z, 0.07 * es, 0.05 * es, 0.04));
    else {
      const d = L.brow === 'angry' ? s * 0.45 : L.brow === 'worried' ? -s * 0.35 : L.brow === 'cocky' ? (s > 0 ? -0.25 : -0.45) : 0;
      add(mesh(CRG.cap, m.k, x, y, z, 0.055, 0.075 * es, 0.045)).rotation.z = Math.PI / 2 + d;
    }
  }
  // mouth
  let my = A.my ?? ey - 0.14 * es - 0.1;
  if (bits.has('mustache')) my -= 0.05;
  A.my = my;
  const mz = A.msurf(0, my);
  const D = (w, h) => add(R(mesh(CRG.half, m.k, 0, my + 0.03, mz, w, 0.06, h), -Math.PI / 2, 0, 0));
  const arc = (x, sx, sy, rz = Math.PI) => add(R(mesh(CRG.arc, m.k, x, my + 0.04, mz + 0.01, sx, sy, 0.06), 0, 0, rz));
  switch (L.mouth || 'smile') {
    case 'smile': arc(0, 0.09, 0.08); break;
    case 'wide': arc(0, 0.17, 0.1); break;
    case 'smirk': arc(0.03, 0.08, 0.06, Math.PI + 0.3); break;
    case 'cat': arc(-0.045, 0.05, 0.05); arc(0.045, 0.05, 0.05); break;
    case 'tongue': arc(0, 0.09, 0.08); add(mesh(G.capsule, m.blush, 0.02, my - 0.07, mz + 0.03, 0.08, 0.06, 0.04)); break;
    case 'fangs': arc(0, 0.1, 0.08); for (const s of [-1, 1]) add(R(mesh(G.coneLo, m.w, s * 0.055, my, mz + 0.03, 0.025, 0.06, 0.025), 0, 0, Math.PI)); break;
    case 'open': D(0.1, 0.1); add(mesh(G.sphere, m.blush, 0, my - 0.03, mz + 0.03, 0.055, 0.035, 0.03)); break;
    case 'grin': D(0.15, 0.1); add(mesh(G.box, m.w, 0, my + 0.015, mz + 0.03, 0.24, 0.03, 0.02)); add(mesh(G.sphere, m.blush, 0, my - 0.045, mz + 0.03, 0.06, 0.025, 0.02)); break;
    case 'shark': D(0.22, 0.13); for (let i = -2; i <= 2; i++) add(R(mesh(G.coneLo, m.w, i * 0.08, my, mz + 0.035, 0.03, 0.07, 0.02), 0, 0, Math.PI)); break;
    case 'o': add(mesh(G.sphere, m.k, 0, my, mz + 0.01, 0.05, 0.065, 0.04)); break;
    case 'lips': add(mesh(G.torus, m.blush, 0, my, mz + 0.02, 0.055, 0.06, 0.1)); add(mesh(G.sphere, m.k, 0, my, mz + 0.005, 0.04, 0.045, 0.02)); break;
    case 'pixel': { const px = toon(L.c1, { emissive: L.c1, ei: 0.9 }); for (const [x, y] of [[-0.12, 0.04], [-0.06, 0], [0, 0], [0.06, 0], [0.12, 0.04]]) add(mesh(G.box, px, x, my + y, mz + 0.03, 0.06, 0.045, 0.02)); break; }
  }
  // cheeks
  if (L.blush !== false && style !== 'pixel') for (const s of [-1, 1]) {
    const x = s * (A.ex + 0.1 * es + 0.02), y = ey - 0.13 * es;
    add(mesh(G.sphereLo, m.blush, x, y, A.csurf(x, y) - 0.005, 0.08, 0.05, 0.035));
  }
  // blinking eyelids: one merged mesh, hidden except for a split second
  if (lids.length) {
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    const lid = new THREE.Mesh(mergeGeometries(lids.map(([x, y, z, sx, sy, sz]) => G.sphereLo.clone().applyMatrix4(mtx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))))), A.lidMat);
    lid.visible = false; lid.userData.blink = Math.random() * 3.8; g.add(lid);
  }
}

const ANIM_KEYS = ['spin', 'flap', 'bob', 'flick', 'twinkle', 'glitch', 'orbit', 'blink', 'blinkHide', 'wag', 'sway', 'hover', 'pulse', 'rise', 'flash'];
const isAnim = o => ANIM_KEYS.some(k => o.userData[k] !== undefined && o.userData[k] !== false);

export function makeCreature(def, mutId = '') {
  const g = new THREE.Group();
  const mut = MUT_BY_ID[mutId] || MUT_BY_ID[''];
  const L = def.look;
  const c1 = mut.color ?? L.c1;
  const m = {
    c1: toon(c1, mut.id ? { emissive: mut.color, ei: 0.25 } : {}),
    c2: toon(L.c2), w: toon(0xffffff), k: toon(0x161320), gold: toon(0xffcc33, { emissive: 0x886600, ei: 0.4 }),
    blush: toon(0xff7f9e), metal: toon(0xc8d0d8, { metal: true }), red: toon(0xd8232a),
    glow: toon(L.glow ?? 0xffe14a, { emissive: L.glow ?? 0xffe14a, ei: 0.9 }),
  };
  if (mut.id === 'rainbow') { m.c1 = toon(0xff66ff, { emissive: 0xff66ff, ei: 0.35, unique: true }); g.userData.rainbow = m.c1; }
  const S = SHAPES[L.body];
  const bits = new Set(L.bits);
  const A = { ...S, es: (S.es || 1) * (bits.has('bigeyes') ? 1.45 : 1), bw: S.w, hz: S.hz || 0, lidMat: S.lid === 'c2' ? m.c2 : m.c1 };
  if (bits.has('bigeyes')) A.ex *= 1.12;
  A.surf = S.surf || ell(...S.ell);
  A.msurf = A.csurf = A.surf;
  const add = o => (g.add(o), o);
  S.make(g, m);

  // anchor bits: they change where the face / head is, so they run before the face is built
  for (const b of bits) switch (b) {
    case 'neck': {
      add(R(mesh(G.cyl, m.c1, 0, 1.25, 0.5, 0.2, 0.75, 0.2), 0.25, 0, 0));
      add(mesh(G.sphere, m.c1, 0, 1.78, 0.62, 0.36, 0.32, 0.45));
      add(mesh(G.sphere, m.c1, 0, 1.68, 0.95, 0.2, 0.15, 0.2));
      add(mesh(G.sphere, m.k, 0, 1.73, 1.13, 0.06, 0.035, 0.03));
      Object.assign(A, { eyeY: 1.86, ex: 0.15, es: 0.9, my: 1.63, top: 2.1, w: 0.36, hz: 0.62 });
      A.surf = A.csurf = ell(1.78, 0.36, 0.32, 0.45, 0.62); A.msurf = ell(1.68, 0.2, 0.15, 0.2, 0.95);
      break;
    }
    case 'loaf': {
      add(mesh(G.halfSphere, m.c2, 0, 1.0, 0, 0.6, 0.3, 0.5));
      for (let i = -1; i <= 1; i++) { const x = i * 0.22; add(R(mesh(CRG.cap, m.c1, x, 1.0 + 0.3 * Math.sqrt(1 - (x / 0.6) ** 2) - 0.01, 0.02, 0.07, 0.17, 0.07), Math.PI / 2, 0, 0.5)); }
      A.top = 1.3; break;
    }
    case 'frogeyes': {
      for (const s of [-1, 1]) add(mesh(G.sphere, m.c1, s * 0.3, 1.08, 0.2, 0.21));
      A.msurf = A.csurf = A.surf; A.surf = (x, y) => ell(1.08, 0.21, 0.21, 0.21, 0.2, Math.sign(x) * 0.3)(x, y);
      Object.assign(A, { eyeY: 1.1, ex: 0.3, top: 1.3 }); break;
    }
    case 'snout': {
      const sy = A.eyeY - 0.2 * A.es - 0.03, z0 = A.surf(0, sy);
      add(mesh(G.sphere, toon(0xf6d7a8), 0, sy, z0 - 0.03, 0.2, 0.13, 0.11));
      add(mesh(G.sphere, m.k, 0, sy + 0.06, z0 + 0.06, 0.065, 0.045, 0.04));
      A.msurf = ell(sy, 0.2, 0.13, 0.11, z0 - 0.03); A.my = sy - 0.055; break;
    }
    case 'muzzle': {
      add(mesh(G.sphere, toon(0xffb3c6), 0, 0.5, 0.45, 0.36, 0.2, 0.13));
      for (const s of [-1, 1]) add(mesh(G.sphere, m.k, s * 0.12, 0.54, 0.57, 0.04, 0.05, 0.03));
      A.msurf = ell(0.5, 0.36, 0.2, 0.13, 0.45); A.my = 0.43; break;
    }
    case 'capysnout': {
      add(mesh(G.sphere, m.c1, 0, 0.6, 0.5, 0.36, 0.26, 0.28));
      add(mesh(G.sphere, m.c2, 0, 0.7, 0.75, 0.15, 0.07, 0.05));
      A.msurf = ell(0.6, 0.36, 0.26, 0.28, 0.5); Object.assign(A, { my: 0.55, eyeY: 0.92, ex: 0.27 }); break;
    }
    case 'mask': {
      const xc = bananaX(A.eyeY), ey0 = A.eyeY, orig = A.surf;
      add(mesh(G.cyl, m.c2, xc, ey0 + 0.01, 0, 0.32, 0.15, 0.32));
      A.surf = (x, y) => Math.abs(y - ey0) < 0.09 ? Math.sqrt(Math.max(0, 0.1024 - (x - xc) ** 2)) : orig(x, y); break;
    }
    case 'eyestalks': A.stalks = true; break;
  }

  buildFace(g, m, A, L, bits);

  const t = A.top, hz = A.hz, ey = A.eyeY, es = A.es, bw = A.bw, back = A.back;
  // a group sitting on top of the head (follows the banana's tilt etc.)
  const topper = (dy = 0) => { const p = new THREE.Group(); p.position.set(A.hx || 0, t + dy, hz); p.rotation.z = A.tilt || 0; g.add(p); return p; };
  const flag = (o, k, v, extra) => { o.userData[k] = v; if (extra) Object.assign(o.userData, extra); return o; };
  for (const b of bits) switch (b) {
    // ---- ears
    case 'ears': for (const s of [-1, 1]) {
      const x = s * A.w * 0.55;
      add(mesh(G.cone, m.c1, x, t - 0.02, hz, 0.15, 0.32, 0.12)).rotation.z = -s * 0.35;
      add(mesh(G.cone, m.blush, x + s * 0.01, t - 0.05, hz + 0.06, 0.08, 0.2, 0.05)).rotation.z = -s * 0.35;
    } break;
    case 'roundears': for (const s of [-1, 1]) { const x = s * A.w * 0.58; add(mesh(G.sphere, m.c1, x, t - 0.06, hz, 0.15, 0.15, 0.09)); add(mesh(G.sphere, m.blush, x, t - 0.07, hz + 0.05, 0.085, 0.085, 0.05)); } break;
    case 'floppyears': for (const s of [-1, 1]) add(mesh(G.capsule, m.c2, s * (bw + 0.05), t - 0.34, hz + 0.08, 0.2, 0.3, 0.1)).rotation.z = s * 0.3; break;
    case 'goblinears': for (const s of [-1, 1]) {
      add(mesh(G.cone, m.c1, s * (bw + 0.16), ey + 0.1, 0, 0.11, 0.42, 0.07)).rotation.z = -s * 1.2;
      add(mesh(G.cone, m.blush, s * (bw + 0.17), ey + 0.1, 0.035, 0.06, 0.3, 0.03)).rotation.z = -s * 1.2;
    } break;
    case 'longears': for (const s of [-1, 1]) {
      const e = flag(new THREE.Group(), 'sway', 0, { sa: 0.08 * s, sf: 2.5 }); e.position.set(s * 0.2, t - 0.08, 0); e.rotation.z = -s * 0.18;
      e.add(mesh(G.capsule, m.c1, 0, 0.38, 0, 0.17, 0.42, 0.11)); e.add(mesh(G.capsule, m.blush, 0, 0.4, 0.06, 0.09, 0.3, 0.05)); add(e);
      A.top = Math.max(A.top, t + 0.75);
    } break;
    // ---- legs, feet, tails
    case 'legs4': for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * bw * 0.52, z = sz * (A.legZ || 0.28);
      add(mesh(CRG.cap, m.c2, x, 0.17, z, 0.2, 0.17, 0.2));
      if (bits.has('hooves')) add(mesh(G.cylLo, m.k, x, 0.04, z, 0.11, 0.08, 0.11));
    } break;
    case 'legs2': for (const s of [-1, 1]) add(mesh(G.sphere, m.c2, s * 0.25, 0.07, 0.15, 0.16, 0.09, 0.22)); break;
    case 'feet': for (const s of [-1, 1]) add(mesh(G.sphere, toon(0xff9a1f), s * 0.22, 0.05, 0.28, 0.16, 0.06, 0.2)); break;
    case 'froglegs': for (const s of [-1, 1]) {
      add(mesh(G.sphere, m.c2, s * (bw - 0.12), 0.2, -0.2, 0.2, 0.18, 0.28));
      add(mesh(G.sphere, m.c2, s * (bw - 0.05), 0.04, 0.12, 0.15, 0.05, 0.22));
      add(mesh(G.sphere, m.c2, s * 0.28, 0.05, 0.45, 0.1, 0.05, 0.13));
    } break;
    case 'tail': {
      const p = flag(new THREE.Group(), 'wag', 0.5); p.position.set(0, 0.5, back + 0.08);
      ch(p, mesh(G.capsule, m.c1, 0, 0.13, -0.13, 0.13, 0.28, 0.13)).rotation.x = -0.8;
      ch(p, mesh(G.sphere, m.c2, 0, 0.32, -0.33, 0.1)); add(p); break;
    }
    case 'puff': add(mesh(G.sphere, m.c2, 0, 0.42, back, 0.17)); add(mesh(G.sphere, m.c2, 0.06, 0.5, back - 0.06, 0.12)); break;
    // ---- sock goblin
    case 'stripes': for (let i = 0; i < 3; i++) add(mesh(G.cyl, m.c2, 0, 0.15 + i * 0.2, 0, 0.565, 0.1, 0.565)); break;
    case 'cuff': add(mesh(G.torus, m.c2, 0, 1.1, 0, 0.56, 0.56, 0.6)).rotation.x = Math.PI / 2; break;
    case 'sockfoot': add(mesh(G.sphere, m.c1, 0, 0.16, 0.28, 0.46, 0.17, 0.5)); add(mesh(G.sphere, m.c2, 0, 0.17, 0.66, 0.3, 0.15, 0.17)); add(mesh(G.sphere, m.c2, 0, 0.2, -0.42, 0.3, 0.18, 0.16)); break;
    // ---- mop
    case 'hair': {
      const hm = toon(0xc9bfa2);
      for (const [y, n, len] of [[0.3, 14, 0.27], [0.72, 12, 0.22]]) for (let i = 0; i < n; i++) {
        const a = (i + (y > 0.5 ? 0.5 : 0)) / n * Math.PI * 2, r = dropR(y) + 0.03;
        if (y > 0.5 && Math.sin(a) > 0.75) continue;
        add(R(mesh(CRG.cap, hm, Math.cos(a) * r, y - 0.1, Math.sin(a) * r, 0.14, len, 0.14), -Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25));
      }
      break;
    }
    case 'bangs': {
      const hm = toon(0xc9bfa2);
      for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.13, y = ey + 0.27; add(R(mesh(CRG.cap, hm, x, y, Math.sqrt(Math.max(0, dropR(y) ** 2 - x * x)) + 0.02, 0.12, 0.16, 0.12), -0.35, 0, -x * 0.6)); }
      break;
    }
    case 'stick': add(mesh(G.cylLo, m.c2, 0, t + 0.15, 0, 0.07, 0.8, 0.07)); add(mesh(G.cylLo, m.metal, 0, t - 0.2, 0, 0.17, 0.14, 0.17)); A.top = t + 0.45; break;
    // ---- cactus cat
    case 'spikes': {
      const rib = toon(0x3c8f3a);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39; if (Math.sin(a) > 0.6) continue; add(mesh(CRG.cap, rib, Math.cos(a) * 0.53, 0.75, Math.sin(a) * 0.53, 0.09, 0.4, 0.06)).rotation.y = -a; }
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, y = 0.5 + (i % 5) * 0.2;
        if (Math.sin(a) > 0.45 && y < 1.2) continue;
        const r = (y > 1.1 ? 0.55 * Math.sqrt(Math.max(0, 1 - ((y - 1.1) / 0.3) ** 2)) : 0.55) + 0.04;
        add(aim(mesh(G.coneLo, m.w, Math.cos(a) * r, y, Math.sin(a) * r, 0.025, 0.12, 0.025), Math.cos(a), 0.4, Math.sin(a)));
      }
      break;
    }
    case 'pot': add(mesh(CRG.pot, m.c2, 0, 0.2, 0)); add(mesh(G.torus, m.c2, 0, 0.43, 0, 0.64, 0.64, 0.7)).rotation.x = Math.PI / 2; break;
    case 'flower': {
      const fx = 0.2, fy = t - 0.02, fz = 0.12;
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(mesh(G.sphereLo, m.blush, fx + Math.cos(a) * 0.08, fy, fz + Math.sin(a) * 0.08, 0.07, 0.035, 0.07)); }
      add(mesh(G.sphereLo, toon(0xffd23f), fx, fy + 0.02, fz, 0.05)); break;
    }
    case 'whiskers': for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const x = s * (A.ex + 0.16), y = A.my + 0.04 - i * 0.05;
      add(mesh(G.box, m.k, x, y, A.msurf(x, y) + 0.01, 0.2, 0.012, 0.012)).rotation.z = s * (i ? -0.15 : 0.15);
    } break;
    case 'nose': { const y = A.my + 0.1, z = A.msurf(0, y); add(mesh(G.sphere, m.k, 0, y, z + 0.02, 0.075, 0.055, 0.05)); add(mesh(G.sphereLo, m.w, 0.025, y + 0.02, z + 0.06, 0.018)); break; }
    case 'pinknose': { const y = A.my + 0.08; add(mesh(G.sphere, m.blush, 0, y, A.msurf(0, y) + 0.015, 0.05, 0.035, 0.035)); break; }
    case 'buckteeth': for (const s of [-1, 1]) add(mesh(G.box, m.w, s * 0.024, A.my - 0.07, A.msurf(0, A.my - 0.07) + 0.01, 0.042, 0.06, 0.02)); break;
    // ---- toaster
    case 'slots': for (const s of [-1, 1]) add(mesh(G.box, m.k, s * 0.18, t - 0.005, 0, 0.16, 0.03, 0.66)); break;
    case 'toast': {
      const tc = toon(0xd99a4a), tin = toon(0xf4cf8a);
      for (const s of [-1, 1]) { add(mesh(G.box, tc, s * 0.18, t + 0.17, -0.02, 0.11, 0.5, 0.6)); add(mesh(G.box, tin, s * 0.18, t + 0.15, -0.02, 0.12, 0.42, 0.5)); }
      add(mesh(G.box, toon(0xfff09a), 0.18, t + 0.43, -0.02, 0.13, 0.04, 0.16)); A.top = t + 0.45; break;
    }
    case 'lever': add(mesh(G.box, m.k, bw + 0.03, 0.75, 0.1, 0.05, 0.3, 0.06)); add(mesh(G.box, m.red, bw + 0.08, 0.85, 0.1, 0.1, 0.07, 0.14)); break;
    // ---- birds
    case 'belly': add(mesh(G.sphere, m.c2, 0, 0.55, 0.28, 0.46, 0.5, 0.36)); break;
    case 'beak': { const y = ey - 0.17 * es; add(mesh(G.cone, toon(L.bill ?? 0xff9a1f), 0, y, A.surf(0, y) + 0.09, 0.1, 0.24, 0.1)).rotation.x = Math.PI / 2; break; }
    case 'bill': {
      const bc = toon(L.bill ?? 0xff9a1f), y = ey - 0.2 * es, z = A.surf(0, y);
      add(mesh(G.sphere, bc, 0, y, z + 0.08, 0.2, 0.065, 0.17)); add(mesh(G.sphere, bc, 0, y - 0.07, z + 0.06, 0.15, 0.045, 0.13)); add(mesh(G.sphere, m.k, 0, y - 0.035, z + 0.04, 0.14, 0.03, 0.12)); break;
    }
    case 'pizzahat': {
      const p = topper(-0.04); p.rotation.x = 0.25;
      ch(p, mesh(CRG.prism, toon(0xffcf4a), 0, 0, 0.05, 0.5, 0.06, 0.5));
      ch(p, mesh(G.capsule, toon(0xd99a4a), 0, 0.01, -0.2, 0.09, 0.42, 0.09)).rotation.z = Math.PI / 2;
      for (const [x, z] of [[0, 0.22], [-0.12, -0.04], [0.13, -0.02]]) ch(p, mesh(G.cylLo, toon(0xd93a2a), x, 0.035, z, 0.07, 0.02, 0.07));
      A.top = t + 0.1; break;
    }
    case 'wings': for (const s of [-1, 1]) add(flag(R(mesh(G.sphere, m.c1, s * (bw + 0.02), 0.8, -0.02, 0.1, 0.32, 0.24), 0, 0, s * 0.35), 'sway', 0, { sa: 0.18 * s, sf: 5 })); break;
    case 'bigwings': for (const s of [-1, 1]) {
      const p = flag(new THREE.Group(), 'flap', s); p.position.set(s * (bw - 0.15), 1.0, -0.3);
      p.add(fuse(m.c2, [[0.5, 0.2, 0, 0.5, 0.2, 0.05, 0.35], [0.42, -0.05, -0.03, 0.42, 0.16, 0.045, 0.1], [0.32, -0.25, -0.05, 0.32, 0.12, 0.04, -0.2]].map(([x, y, z, sx, sy, sz, r]) => R(P(G.sphere, s * x, y, z, sx, sy, sz), 0, 0, s * r))));
      add(p);
    } break;
    case 'shades': case 'glasses': {
      const zc = A.surf(0, ey) + 0.075;
      for (const s of [-1, 1]) {
        const x = s * A.ex, z = Math.max(A.surf(x, ey) + 0.06, zc - 0.06);
        add(mesh(G.sphere, m.k, x, ey, z, 0.15 * es, 0.11 * es, 0.04));
        add(mesh(G.box, m.w, x + 0.05 * es, ey + 0.035 * es, z + 0.04, 0.06 * es, 0.014, 0.01)).rotation.z = 0.6;
        const ax = s * (A.ex + 0.15 * es); add(mesh(G.box, m.k, ax, ey + 0.04, A.surf(ax, ey) - 0.02, 0.03, 0.03, 0.25));
      }
      add(mesh(G.box, m.k, 0, ey + 0.05 * es, zc, A.ex * 2, 0.03, 0.03)); break;
    }
    case 'quiff': for (let i = 0; i < 3; i++) add(R(mesh(CRG.cap, m.c2, (i - 1) * 0.09, t - 0.02 + (i === 1 ? 0.04 : 0), 0.12, 0.13, 0.2, 0.13), 1.0, 0, (i - 1) * -0.3)); A.top = t + 0.1; break;
    case 'chain': add(mesh(G.torus, m.gold, 0, 0.62, 0.03, 0.6, 0.6, 0.25)).rotation.x = Math.PI / 2 + 0.3; add(mesh(G.cyl, m.gold, 0, 0.42, A.surf(0, 0.42) + 0.02, 0.09, 0.03, 0.09)).rotation.x = Math.PI / 2; break;
    case 'discoball': {
      add(mesh(G.cylLo, m.k, 0, t + 0.3, hz, 0.012, 0.6, 0.012));
      add(flag(mesh(CRG.facet, toon(0xe0e8ff, { metal: true, emissive: 0x8899ff, ei: 0.35 }), 0, t + 0.68, hz, 0.2), 'spin', 1.5, { hover: 0 }));
      A.top = t + 0.9; break;
    }
    case 'bubbles': for (let i = 0; i < 4; i++) add(flag(mesh(G.sphereLo, toon(0xbff4ff, { opacity: 0.5 }), Math.cos(i * 1.6 + 0.5) * 0.95, 0.6 + i * 0.3, Math.sin(i * 1.6 + 0.5) * 0.7, 0.08 + (i % 3) * 0.05), 'bob', i)); break;
    // ---- sharks & sneakers
    case 'fin': add(mesh(G.cone, m.c1, 0, t + 0.12, -0.15, 0.07, 0.45, 0.3)).rotation.x = -0.35; A.top = Math.max(A.top, t + 0.3); break;
    case 'sharktail': {
      const p = flag(new THREE.Group(), 'wag', 0.35); p.position.set(0, 0.66, back + 0.1);
      p.add(fuse(m.c1, [R(P(G.cone, 0, 0.14, -0.13, 0.05, 0.38, 0.18), -0.75, 0, 0), R(P(G.cone, 0, -0.12, -0.13, 0.045, 0.28, 0.14), -2.3, 0, 0)])); add(p); break;
    }
    case 'gills': for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(mesh(G.box, m.k, s * 0.452, 0.66, 0.12 + i * 0.09, 0.015, 0.16, 0.025)); break;
    case 'laces': for (let i = 0; i < 3; i++) for (const s of [-1, 1]) add(mesh(G.box, m.c2, 0, 1.065, 0.02 + i * 0.16, 0.42, 0.035, 0.05)).rotation.y = s * 0.35; break;
    case 'sole': add(mesh(CRG.rbox, m.c2, 0, 0.16, 0, 0.98, 0.2, 1.88)); add(mesh(CRG.rbox, m.k, 0, 0.05, 0, 0.96, 0.06, 1.84)); break;
    case 'swoosh': for (const s of [-1, 1]) add(mesh(G.box, m.red, s * 0.425, 0.45, -0.05, 0.02, 0.09, 0.6)).rotation.x = -0.25; break;
    // ---- cappucrab
    case 'claws': for (const s of [-1, 1]) {
      add(mesh(G.cylLo, m.c2, s * 0.68, 0.62, 0.1, 0.05, 0.32, 0.05)).rotation.z = -s * 1.1;
      const p = flag(new THREE.Group(), 'sway', s, { ax: 'x', sa: 0.2, sf: 4 }); p.position.set(s * 0.85, 0.74, 0.18);
      p.add(fuse(m.c2, [P(G.sphere, 0, 0, 0, 0.19, 0.15, 0.21), R(P(G.cone, 0, 0.12, 0.13, 0.08, 0.26, 0.07), 0.75, 0, 0), R(P(G.cone, 0, -0.05, 0.15, 0.06, 0.2, 0.06), 1.9, 0, 0)]));
      add(p);
    } break;
    case 'foam': add(mesh(G.cyl, m.w, 0, 1.0, 0, 0.56, 0.06, 0.56)); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add(mesh(G.sphereLo, m.w, Math.cos(a) * 0.55, 1.02, Math.sin(a) * 0.55, 0.09)); } break;
    case 'latteheart': { const lc = toon(0xc98b5a); for (const s of [-1, 1]) add(mesh(G.sphereLo, lc, s * 0.06, 1.035, 0.12, 0.075, 0.015, 0.075)); add(mesh(G.box, lc, 0, 1.035, 0.19, 0.105, 0.02, 0.105)).rotation.y = Math.PI / 4; break; }
    case 'steam': for (let i = 0; i < 3; i++) { const s = add(flag(mesh(G.sphereLo, toon(0xffffff, { opacity: 0.45 }), -0.18 + i * 0.18, 1.15, -0.25 + (i % 2) * 0.1, 0.1), 'rise', i / 3)); s.castShadow = false; } break;
    case 'crablegs': for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(mesh(CRG.cap, m.c2, s * 0.5, 0.1, -0.2 + i * 0.17, 0.06, 0.14, 0.06)).rotation.z = s * 1.0; break;
    case 'arms': for (const s of [-1, 1]) add(mesh(G.capsule, m.c1, s * (bw + 0.02), 0.5, 0.12, 0.16, 0.2, 0.16)).rotation.z = s * 0.9; break;
    // ---- ninja nugget
    case 'crumbs': {
      const cm = toon(0xc8862e);
      for (let i = 0; i < 18; i++) {
        const [x, y, z, nx, ny, nz] = onEll(S.ell, i * 2.4, -0.55 + (i * 0.37) % 1.4);
        if (z > 0.3 && y > 0.4 && y < 1.1) continue;
        add(aim(mesh(G.sphereLo, cm, x, y, z, 0.07, 0.035, 0.07), nx, ny, nz));
      }
      break;
    }
    case 'headband': {
      const y = ey + 0.26 * es, r = A.surf(0, y) + 0.02;
      add(mesh(G.cyl, m.red, 0, y, 0, r * 1.03, 0.11, r));
      add(mesh(G.box, m.metal, 0, y, r + 0.01, 0.22, 0.09, 0.03)); add(mesh(G.sphereLo, m.k, 0, y, r + 0.03, 0.03));
      for (const s of [-1, 1]) add(flag(R(mesh(G.box, m.red, s * 0.1, y - 0.12, -r - 0.05, 0.07, 0.28, 0.03), -0.4, 0, s * 0.5), 'sway', s, { sa: 0.25, sf: 6 }));
      break;
    }
    case 'sword': {
      const p = new THREE.Group(); p.position.set(0.05, 0.8, back - 0.04); p.rotation.z = 0.65; g.add(p);
      ch(p, mesh(G.box, m.metal, 0, 0.4, 0, 0.07, 0.95, 0.03)); ch(p, mesh(G.box, m.gold, 0, -0.1, 0, 0.22, 0.05, 0.1)); ch(p, mesh(G.cylLo, m.c2, 0, -0.32, 0, 0.045, 0.4, 0.045));
      A.top = Math.max(A.top, 1.5); break;
    }
    // ---- lava llama
    case 'flames': for (let i = 0; i < 3; i++) add(flag(mesh(G.cone, toon(i === 1 ? 0xffe23a : 0xff6a1a, { emissive: i === 1 ? 0xffaa00 : 0xff3300, ei: 0.8 }), (i - 1) * 0.12, t + 0.15 + (i === 1 ? 0.06 : 0), hz, 0.1, 0.35, 0.1), 'flick', i)); break;
    case 'lavaspots': {
      const lava = toon(0xffc23a, { emissive: 0xff6a00, ei: 1 });
      for (const [x, z] of [[0.2, -0.2], [-0.22, 0.12], [0.06, -0.58], [-0.3, -0.62], [0.33, 0.25], [-0.36, -0.2]]) {
        const r = capR(z), y = 0.62 + Math.sqrt(Math.max(0, r * r - x * x));
        add(aim(mesh(G.sphereLo, m.c2, x, y, z, 0.13, 0.04, 0.11), x, y - 0.62, 0));
        add(aim(mesh(G.sphereLo, lava, x, y + 0.01, z, 0.065, 0.045, 0.05), x, y - 0.62, 0));
      }
      break;
    }
    // ---- banana bandit
    case 'mask': { const xc = bananaX(ey); for (const s of [-1, 1]) add(flag(R(mesh(G.box, m.c2, xc + s * 0.06, ey - 0.02, -0.34, 0.06, 0.07, 0.22), 0.3, s * 0.5, 0), 'sway', s, { ax: 'x', sa: 0.2, sf: 5 })); break; }
    case 'hat': { const p = topper(-0.03); ch(p, mesh(G.cyl, m.c2, 0, 0, 0, 0.42, 0.04, 0.42)); ch(p, mesh(G.cyl, m.c2, 0, 0.16, 0, 0.25, 0.3, 0.25)); ch(p, mesh(G.cyl, m.red, 0, 0.06, 0, 0.26, 0.07, 0.26)); A.top = t + 0.3; break; }
    case 'sack': {
      const sk = toon(0xc9a466);
      add(mesh(G.sphere, sk, 0.62, 0.32, 0.12, 0.3, 0.32, 0.28)); add(mesh(G.cylLo, sk, 0.62, 0.66, 0.12, 0.1, 0.12, 0.1));
      add(mesh(G.torus, m.red, 0.62, 0.62, 0.12, 0.11, 0.11, 0.2)).rotation.x = Math.PI / 2;
      add(mesh(G.cyl, toon(0x3fa84a), 0.62, 0.34, 0.39, 0.12, 0.02, 0.12)).rotation.x = Math.PI / 2; add(mesh(G.box, m.w, 0.62, 0.34, 0.41, 0.025, 0.16, 0.01));
      break;
    }
    // ---- turbo turtle
    case 'rockets': {
      const fl = toon(0xff8a1a, { emissive: 0xff5500, ei: 0.9 });
      for (const s of [-1, 1]) {
        add(mesh(G.cylLo, m.metal, s * 0.34, 0.62, -0.72, 0.13, 0.5, 0.13)).rotation.x = Math.PI / 2;
        add(mesh(G.cylLo, m.red, s * 0.34, 0.62, -0.62, 0.14, 0.08, 0.14)).rotation.x = Math.PI / 2;
        add(flag(R(mesh(G.cone, fl, s * 0.34, 0.62, -1.1, 0.1, 0.35, 0.1), -Math.PI / 2, 0, 0), 'flick', s + 1));
      }
      break;
    }
    case 'plates': {
      const pc = toon(0x2f7a3a), E = [0.42, 0.72, 0.62, 0.72], pts = [[0, 1, 0.22]];
      for (let i = 0; i < 6; i++) pts.push([i / 6 * Math.PI * 2 + 0.3, 0.55, 0.17]);
      for (let i = 0; i < 9; i++) pts.push([i / 9 * Math.PI * 2, 0.15, 0.13]);
      for (const [a, v, s] of pts) { const [x, y, z, nx, ny, nz] = onEll(E, a, v); add(aim(mesh(G.cylLo, pc, x, y, z, s, 0.03, s), nx, ny, nz)); }
      break;
    }
    case 'goggles': {
      const strap = toon(0x5a3a22), gy = ey + 0.15;
      add(mesh(G.torus, strap, 0, gy, hz, 0.26, 0.26, 0.3)).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const x = s * 0.12, z = A.surf(x, gy);
        add(mesh(G.torus, strap, x, gy + 0.01, z + 0.02, 0.085)).rotation.x = -0.5;
        add(mesh(G.sphere, toon(0x8fe3ff, { emissive: 0x2a7f9a, ei: 0.5 }), x, gy + 0.01, z + 0.02, 0.075, 0.075, 0.03)).rotation.x = -0.5;
      }
      break;
    }
    // ---- royalty
    case 'crown': {
      const p = topper(-0.08);
      ch(p, mesh(G.cyl, m.gold, 0, 0.08, 0, 0.27, 0.16, 0.27));
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + Math.PI / 2; ch(p, mesh(G.coneLo, m.gold, Math.cos(a) * 0.23, 0.26, Math.sin(a) * 0.23, 0.065, 0.2, 0.065)); ch(p, mesh(G.sphereLo, m.gold, Math.cos(a) * 0.23, 0.37, Math.sin(a) * 0.23, 0.035)); }
      ch(p, mesh(G.sphere, toon(0xff2d55, { emissive: 0xaa0022, ei: 0.6 }), 0, 0.09, 0.27, 0.055, 0.055, 0.03));
      for (const s of [-1, 1]) ch(p, mesh(G.sphere, toon(0x3fa8ff, { emissive: 0x1050aa, ei: 0.6 }), s * 0.26, 0.09, 0.07, 0.03, 0.045, 0.045));
      A.top = Math.max(A.top, t + 0.35); break;
    }
    case 'cape': {
      const cz = back - 0.06;
      add(mesh(G.box, toon(0xc0142a), 0, 0.62, cz, bw * 1.5, 1.0, 0.04)).rotation.x = 0.15;
      add(mesh(G.box, m.gold, 0, 1.1, cz + 0.04, bw * 1.55, 0.07, 0.07)); add(mesh(G.box, m.gold, 0, 0.13, cz - 0.08, bw * 1.5, 0.05, 0.05));
      break;
    }
    case 'mustache': {
      const y = A.my + 0.085;
      for (const s of [-1, 1]) {
        add(mesh(CRG.cap, m.k, s * 0.1, y, A.msurf(s * 0.1, y) + 0.03, 0.075, 0.12, 0.075)).rotation.z = -s * 1.3;
        add(mesh(G.sphereLo, m.k, s * 0.21, y + 0.045, A.msurf(s * 0.21, y + 0.045) + 0.02, 0.045));
      }
      break;
    }
    case 'scepter': {
      const p = new THREE.Group(); p.position.set(0.85, 0.7, 0.25); p.rotation.z = -0.2; g.add(p);
      ch(p, mesh(G.cylLo, m.gold, 0, 0, 0, 0.04, 0.9, 0.04)); ch(p, mesh(G.torus, m.gold, 0, 0.42, 0, 0.07, 0.07, 0.1)).rotation.x = Math.PI / 2;
      flag(ch(p, mesh(G.sphere, toon(0xff2d55, { emissive: 0xff0033, ei: 0.7 }), 0, 0.53, 0, 0.1)), 'pulse', 0);
      break;
    }
    case 'tophat': {
      const p = topper(-0.04); p.rotation.z += 0.12;
      ch(p, mesh(G.cyl, m.k, 0, 0, 0, 0.45, 0.05, 0.45)); ch(p, mesh(G.cyl, m.k, 0, 0.3, 0, 0.28, 0.58, 0.28)); ch(p, mesh(G.cyl, m.red, 0, 0.1, 0, 0.29, 0.09, 0.29));
      A.top = t + 0.6; break;
    }
    case 'monocle': {
      const x = A.ex, z = A.surf(x, ey) + 0.08;
      add(mesh(G.torus, m.gold, x, ey, z, 0.16 * es, 0.17 * es, 0.15));
      add(mesh(G.sphere, toon(0xdff6ff, { opacity: 0.35 }), x, ey, z, 0.15 * es, 0.16 * es, 0.02)).castShadow = false;
      add(mesh(G.cylLo, m.gold, x + 0.12, ey - 0.28, z - 0.06, 0.01, 0.4, 0.01)).rotation.z = 0.35;
      break;
    }
    case 'bowtie': { const y = 0.32, z = A.surf(0, y); for (const s of [-1, 1]) add(mesh(G.cone, m.red, s * 0.09, y, z + 0.02, 0.08, 0.15, 0.06)).rotation.z = s * Math.PI / 2; add(mesh(G.sphereLo, m.red, 0, y, z + 0.04, 0.05)); break; }
    // ---- space shark
    case 'helmet': {
      add(mesh(G.sphere, toon(0xbfefff, { opacity: 0.3 }), 0, 0.72, 0.5, 0.56)).castShadow = false;
      add(mesh(G.torus, m.metal, 0, 0.72, 0.05, 0.5, 0.5, 0.6));
      add(mesh(G.cylLo, m.metal, 0.2, 1.3, 0.5, 0.02, 0.25, 0.02));
      add(flag(mesh(G.sphereLo, toon(0xff3a3a, { emissive: 0xff0000, ei: 1 }), 0.2, 1.44, 0.5, 0.05), 'pulse', 0));
      A.top = Math.max(A.top, 1.5); break;
    }
    case 'jetpack': {
      const fl = toon(0xff8a1a, { emissive: 0xff5500, ei: 0.9 });
      for (const s of [-1, 1]) {
        add(mesh(G.cylLo, m.metal, s * 0.2, 1.1, -0.5, 0.12, 0.5, 0.12)).rotation.x = Math.PI / 2;
        add(mesh(G.sphereLo, m.red, s * 0.2, 1.1, -0.25, 0.12));
        add(flag(R(mesh(G.cone, fl, s * 0.2, 1.1, -0.93, 0.09, 0.35, 0.09), -Math.PI / 2, 0, 0), 'flick', s + 1));
      }
      break;
    }
    // ---- dragonfruit dragon
    case 'bracts': for (let i = 0; i < 14; i++) {
      const v = -0.6 + (i % 5) * 0.32, [x, y, z, nx, ny, nz] = onEll(S.ell, i * 2.4 + 0.4, v);
      if (z > 0.25 && v > -0.45 && v < 0.75) continue;
      const n = new THREE.Vector3(nx, ny, nz).normalize(), dx = n.x * 0.6, dy = n.y * 0.6 + 0.8, dz = n.z * 0.6;
      add(aim(mesh(G.cone, m.c2, x + dx * 0.08, y + dy * 0.08, z + dz * 0.08, 0.11, 0.3, 0.035), dx, dy, dz));
    } break;
    case 'horns': for (const s of [-1, 1]) { const x = s * Math.min(0.25, A.w * 0.4); add(mesh(G.cone, toon(0xf2e6c8), x, t + 0.06, hz, 0.08, 0.32, 0.08)).rotation.z = -s * 0.45; A.top = Math.max(A.top, t + 0.2); } break;
    // ---- thunder moo
    case 'spots': for (const [x, y, z, sx, sy, sz] of [[0.58, 0.75, -0.15, 0.04, 0.17, 0.22], [-0.58, 0.5, 0.15, 0.04, 0.13, 0.16], [0.58, 0.4, 0.25, 0.04, 0.1, 0.1], [-0.58, 0.85, -0.25, 0.04, 0.12, 0.14], [0.22, 1.1, -0.2, 0.2, 0.03, 0.15], [-0.25, 1.1, 0.12, 0.13, 0.03, 0.11], [-0.2, 0.6, -0.48, 0.2, 0.17, 0.03]]) add(mesh(G.sphereLo, m.c2, x, y, z, sx, sy, sz)); break;
    case 'bell': add(mesh(G.box, m.red, 0, 0.3, 0.46, 0.5, 0.06, 0.04)); add(mesh(G.sphere, m.gold, 0, 0.2, 0.5, 0.09, 0.1, 0.09)); add(mesh(G.sphereLo, m.k, 0, 0.12, 0.52, 0.03)); break;
    case 'cloud': {
      const p = flag(new THREE.Group(), 'hover', 0); p.position.set(0, t + 0.7, 0); add(p);
      p.add(fuse(toon(0x8a93a8), [[-0.32, 0, 0, 0.22], [-0.1, 0.1, 0, 0.27], [0.15, 0.06, 0.02, 0.25], [0.36, -0.02, 0, 0.19], [0, -0.08, 0.06, 0.2]].map(([x, y, z, r]) => P(G.sphereLo, x, y, z, r))));
      p.add(flag(fuse(toon(0xffe23a, { emissive: 0xffcc00, ei: 1 }), [R(P(G.box, 0.03, -0.25, 0, 0.07, 0.24, 0.05), 0, 0, 0.5), R(P(G.box, 0.02, -0.42, 0, 0.07, 0.2, 0.05), 0, 0, -0.6), R(P(G.box, 0.03, -0.57, 0, 0.06, 0.18, 0.05), 0, 0, 0.5)]), 'flash', 0));
      A.top = t + 0.95; break;
    }
    // ---- cosmic capybara
    case 'stars': for (let i = 0; i < 6; i++) add(flag(mesh(CRG.gem, toon(0xfff27a, { emissive: 0xffee55, ei: 1 }), Math.cos(i * 1.05) * (bw + 0.06), 0.4 + (i % 4) * 0.22, Math.sin(i * 1.05) * (bw + 0.04), 0.05), 'twinkle', i)); break;
    case 'halo': {
      const p = topper(0.3 + (bits.has('crown') ? 0.25 : 0) + (bits.has('orange') ? 0.18 : 0));
      flag(ch(p, mesh(G.torus, toon(0xffee66, { emissive: 0xffcc00, ei: 1 }), 0, 0, 0, 0.3, 0.3, 0.3)), 'hover', 1).rotation.x = Math.PI / 2;
      A.top = Math.max(A.top, t + 0.45); break;
    }
    case 'orange': add(mesh(G.sphere, toon(0xff9a2a), 0, t + 0.1, hz, 0.17, 0.15, 0.17)); add(mesh(G.sphereLo, toon(0x4fae4a), 0.06, t + 0.26, hz, 0.08, 0.025, 0.045)).rotation.z = 0.4; A.top = Math.max(A.top, t + 0.3); break;
    case 'planetring': {
      const rm = toon(0xc9a8ff, { emissive: 0x8a5ad8, ei: 0.8 }), rr = bw + 0.3;
      const pr = add(flag(fuse(rm, [R(P(G.ring, 0, 0, 0, rr), Math.PI / 2, 0, 0), P(G.sphereLo, rr, 0, 0, 0.08), P(G.sphereLo, -rr, 0, 0, 0.06)]), 'spin', 0.6));
      pr.position.y = 0.7; pr.rotation.x = 0.35; pr.castShadow = false; break;
    }
    // ---- pharaoh fish
    case 'pharaoh': {
      const blue = toon(0x1d4fa8);
      add(mesh(G.sphere, m.c2, 0, 1.15, -0.16, 0.66, 0.52, 0.62));
      for (const [y, rx, rz] of [[1.25, 0.65, 0.61], [1.42, 0.57, 0.53], [1.02, 0.66, 0.62]]) add(mesh(G.torus, blue, 0, y, -0.16, rx, rz, 0.25)).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        add(mesh(G.box, m.c2, s * 0.6, 0.82, 0.1, 0.12, 0.5, 0.22)).rotation.z = s * 0.08;
        for (let j = 0; j < 2; j++) add(mesh(G.box, blue, s * 0.6, 0.72 + j * 0.17, 0.1, 0.13, 0.05, 0.23)).rotation.z = s * 0.08;
        const lx = s * (A.ex + 0.13); add(mesh(G.box, m.k, lx, ey, A.surf(lx, ey) + 0.01, 0.1, 0.022, 0.02)).rotation.z = s * 0.25;
      }
      add(mesh(G.capsule, m.gold, 0, 1.42, 0.43, 0.06, 0.1, 0.05)); add(mesh(G.sphere, m.gold, 0, 1.52, 0.44, 0.06, 0.05, 0.04));
      A.top = 1.7; break;
    }
    case 'collar': add(mesh(G.torus, m.gold, 0, 0.48, 0, 0.6, 0.6, 0.35)).rotation.x = Math.PI / 2; add(mesh(G.torus, toon(0x1d4fa8), 0, 0.4, 0, 0.62, 0.62, 0.3)).rotation.x = Math.PI / 2; break;
    case 'fins': for (const s of [-1, 1]) add(flag(R(mesh(G.cone, m.c2, s * (bw - 0.02), 0.62, 0, 0.12, 0.35, 0.2), 0, 0, -s * 1.4), 'sway', 0, { sa: 0.25 * s, sf: 4 })); break;
    case 'tailfin': {
      const p = flag(new THREE.Group(), 'wag', 0.4); p.position.set(0, 0.7, back + 0.05);
      p.add(fuse(m.c2, [R(P(G.cone, 0, 0.14, -0.13, 0.05, 0.38, 0.2), -0.75, 0, 0), R(P(G.cone, 0, -0.14, -0.13, 0.05, 0.38, 0.2), -2.4, 0, 0)])); add(p); break;
    }
    // ---- tsunami spirit
    case 'wavecurl': {
      add(mesh(CRG.curl, m.c2, 0, 1.55, 0.25, 0.3, 0.3, 0.3)).rotation.y = Math.PI / 2;
      for (const [x, y, z, r] of [[0, 1.3, 0.45, 0.09], [0.12, 1.36, 0.42, 0.06], [-0.12, 1.34, 0.42, 0.06], [0, 1.6, -0.08, 0.1]]) add(mesh(G.sphereLo, m.w, x, y, z, r));
      A.top = 1.95; break;
    }
    case 'swirl': {
      const parts = [];
      for (let i = 0; i < 12; i++) { const a = i * 0.75, y = 0.12 + i * 0.075, r = dropR(y) + 0.07; parts.push(P(G.sphereLo, Math.cos(a) * r, y, Math.sin(a) * r, 0.06 + (i % 3) * 0.025)); }
      add(flag(fuse(m.w, parts), 'spin', 1.6)); break;
    }
    // ---- giga chick
    case 'muscles': for (const s of [-1, 1]) {
      add(mesh(G.sphere, m.c1, s * 0.66, 0.78, 0.05, 0.2));
      add(mesh(G.capsule, m.c1, s * 0.8, 0.92, 0.08, 0.2, 0.2, 0.2)).rotation.z = -s * 0.5;
      add(mesh(G.sphere, m.c1, s * 0.86, 1.08, 0.12, 0.24, 0.2, 0.2));
      add(mesh(G.sphere, m.c1, s * 0.8, 1.3, 0.12, 0.13));
    } break;
    case 'comb': for (let i = 0; i < 3; i++) add(mesh(G.sphere, toon(0xe8392a), 0, t - 0.02 + (i === 1 ? 0.08 : 0), -0.1 + i * 0.1, 0.06, 0.1, 0.07)); A.top = Math.max(A.top, t + 0.15); break;
    case 'abs': { const ac = toon(0xf0d850); for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const x = s * 0.075, y = 0.32 + i * 0.13; add(mesh(G.sphere, ac, x, y, A.surf(x, y) - 0.01, 0.065, 0.05, 0.04)); } break; }
    // ---- the big cheese
    case 'holes': {
      for (const [x, y, r] of [[-0.6, 0.95, 0.09], [0.6, 1.0, 0.08], [-0.55, 0.3, 0.12], [0.5, 0.28, 0.1], [0.05, 0.16, 0.07]]) add(mesh(G.cylLo, m.c2, x, y, 0.475, r, 0.03, r)).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) for (const [u, y, r] of [[0.35, 0.4, 0.12], [0.65, 0.85, 0.09]]) add(aim(mesh(G.cylLo, m.c2, s * 0.82 * (1 - u), y, 0.475 - 1.425 * u, r, 0.03, r), s * 0.867, 0, -0.499));
      for (const [x, z, r] of [[-0.3, -0.25, 0.08], [0.35, 0.3, 0.08]]) add(mesh(G.cylLo, m.c2, x, 1.2, z, r, 0.03, r));
      break;
    }
    // ---- GL1TCH
    case 'glitch': for (let i = 0; i < 6; i++) add(flag(mesh(G.box, toon(i % 2 ? 0xff00d4 : 0x00e5ff, { emissive: i % 2 ? 0xff00d4 : 0x00e5ff, ei: 0.7 }), (Math.random() - 0.5) * 1.3, 0.3 + Math.random() * 0.9, (Math.random() - 0.5) * 1.1, 0.15 + Math.random() * 0.2, 0.08, 0.15), 'glitch', i)); break;
    case 'antenna': {
      add(mesh(G.cylLo, m.k, 0, t + 0.25, hz, 0.03, 0.5, 0.03)); add(mesh(G.cyl, m.k, 0, t + 0.02, hz, 0.1, 0.05, 0.1));
      add(flag(mesh(G.sphereLo, toon(L.c2, { emissive: L.c2, ei: 1 }), 0, t + 0.54, hz, 0.09), 'pulse', 0)); A.top = t + 0.6; break;
    }
    // ---- omega duck
    case 'omega': {
      const y = 0.62, z = A.surf(0, y) + 0.02;
      add(mesh(CRG.omega, m.gold, 0, y, z, 0.11, 0.11, 0.11)).rotation.z = -0.3 * Math.PI;
      for (const s of [-1, 1]) add(mesh(G.box, m.gold, s * 0.085, y - 0.095, z, 0.07, 0.025, 0.03));
      break;
    }
    // ---- pebble frog
    case 'moss': for (const [a, v] of [[-1.2, 0.5], [-2.2, 0.2], [2.7, 0.6], [0.3, -0.1], [3.6, -0.3], [-0.6, 0.85], [1.9, -0.45]]) { const [x, y, z, nx, ny, nz] = onEll(S.ell, a, v); add(aim(mesh(G.sphereLo, m.c2, x, y, z, 0.16, 0.13, 0.04), nx, ny, nz, _Z)); } break;
  }
  // rarity flair: Legendary+ stand on a glowing ring, Mythic+ get orbiting gems, Secret gems shimmer through all colours
  if (def.r >= 4) {
    const Rr = RARITIES[def.r];
    const ring = add(mesh(G.ring, toon(Rr.glow, { emissive: Rr.glow, ei: 1 }), 0, 0.03, 0, bw + 0.3)); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
    if (def.r >= 5) {
      const n = def.r >= 6 ? 5 : 3, gm = def.r >= 6 ? toon(0xffffff, { emissive: 0xff66ff, ei: 0.8, unique: true }) : toon(Rr.glow, { emissive: Rr.glow, ei: 1 });
      const parts = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; parts.push(P(CRG.gem, Math.cos(a) * (bw + 0.45), 0.5 + (i % 2) * 0.45, Math.sin(a) * (bw + 0.45), 0.07, 0.12, 0.07)); }
      const gems = add(flag(fuse(gm, parts), 'spin', 0.7, { hover: 0 })); gems.castShadow = false;
      if (def.r >= 6) g.userData.shimmer = gm;
    }
  }
  // mutation sparkle
  if (mut.id) {
    for (let i = 0; i < 4; i++) {
      const s = mesh(G.sphereLo, toon(mut.color, { emissive: mut.color, ei: 1 }), 0, 0, 0, 0.07);
      s.castShadow = false; s.userData.orbit = i; g.add(s);
    }
  }
  g.userData.anim = [];
  g.traverse(o => { if (o !== g && isAnim(o)) g.userData.anim.push(o); });
  const keep = new Set(g.userData.anim);
  flatten(g, keep);
  bakeStatic(g, keep);
  // everything sits in an inner group that gently breathes (squash & stretch from the feet)
  const sc = def.r >= 6 ? 1.3 : def.r === 5 ? 1.15 : 1;
  const inner = new THREE.Group(); while (g.children.length) inner.add(g.children[0]); inner.scale.setScalar(sc); g.add(inner);
  inner.userData.breathe = def.r >= 4 ? 0.035 : 0.022; inner.userData.sc = sc; g.userData.anim.push(inner);
  g.userData.top = A.top * sc;
  return g;
}

// merge every non-animated part into one mesh per material (≈15 draw calls → ≈4)
function bakeStatic(g, keep) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), mtx = new THREE.Matrix4();
  const byMat = new Map(), gone = [];
  for (const o of g.children) {
    if (!o.isMesh || keep.has(o)) continue;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(mtx.multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo); gone.push(o);
  }
  for (const o of gone) g.remove(o);
  for (const [m, geos] of byMat) { const merged = mergeGeometries(geos); if (!merged) continue; const ms = new THREE.Mesh(merged, m); ms.castShadow = true; g.add(ms); }
}

// light, cheap per-frame animation for a creature
export function animateCreature(g, t, seed = 0) {
  const u = g.userData;
  for (const o of u.anim) {
    const d = o.userData;
    const b = d.base || (d.base = { y: o.position.y, rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, s: o.scale.x });
    if (d.spin) o.rotation.y = t * d.spin;
    if (d.flap) o.rotation.z = -d.flap * (0.45 + Math.sin(t * 8 + seed) * 0.35);
    if (d.bob !== undefined) o.position.y = 0.6 + d.bob * 0.3 + Math.sin(t * 2 + d.bob) * 0.15;
    if (d.flick !== undefined) o.scale.y = 0.35 * (0.8 + Math.sin(t * 15 + d.flick * 2) * 0.25);
    if (d.twinkle !== undefined) o.scale.setScalar(0.05 * (0.6 + Math.abs(Math.sin(t * 3 + d.twinkle))));
    if (d.glitch !== undefined && Math.random() < 0.06) o.position.x = (Math.random() - 0.5) * 1.3;
    if (d.orbit !== undefined) { const a = t * 2 + d.orbit * Math.PI / 2; o.position.set(Math.cos(a) * 0.95, 0.5 + Math.sin(t * 3 + d.orbit) * 0.4, Math.sin(a) * 0.95); }
    if (d.blink !== undefined) { const p = (t + d.blink + seed) % 3.8; o.visible = p < 0.13 || (d.blink > 1.9 && p > 0.3 && p < 0.42); }
    if (d.blinkHide !== undefined) o.visible = (t + d.blinkHide + seed) % 3.8 >= 0.13;
    if (d.wag !== undefined) o.rotation.y = b.ry + Math.sin(t * 8 + seed) * d.wag;
    if (d.sway !== undefined) { const ax = d.ax || 'z'; o.rotation[ax] = (ax === 'x' ? b.rx : b.rz) + Math.sin(t * (d.sf || 3) + seed + d.sway) * (d.sa || 0.15); }
    if (d.hover !== undefined) o.position.y = b.y + Math.sin(t * 2.2 + seed + d.hover) * 0.06;
    if (d.pulse !== undefined) o.scale.setScalar(b.s * (1 + Math.sin(t * 6 + seed + d.pulse) * 0.18));
    if (d.rise !== undefined) { const p = (t * 0.55 + d.rise + seed) % 1; o.position.y = b.y + p * 0.55; o.scale.setScalar(b.s * (1 - p * 0.7)); }
    if (d.flash !== undefined) o.visible = (t * 1.3 + seed) % 2.2 > 0.35 && Math.sin(t * 40) > -0.6;
    if (d.breathe) { const k = Math.sin(t * (d.breathe > 0.03 ? 3 : 2.2) + seed) * d.breathe; o.scale.set(d.sc * (1 - k * 0.5), d.sc * (1 + k), d.sc * (1 - k * 0.5)); }
  }
  if (u.rainbow) u.rainbow.color.setHSL((t * 0.25 + seed) % 1, 0.85, 0.6), u.rainbow.emissive.copy(u.rainbow.color);
  if (u.shimmer) u.shimmer.emissive.setHSL((t * 0.3 + seed) % 1, 1, 0.55);
}

export function rarityLine(def) {
  const R = RARITIES[def.r];
  return { text: R.name.toUpperCase(), color: R.color, size: 26, rainbow: !!R.rainbow };
}
