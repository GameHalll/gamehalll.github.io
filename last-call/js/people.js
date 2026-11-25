// Low-poly people: faceted octagonal body parts with real proportions (shaped torso with
// chest, waist and hips; neck; jawed head; deltoids, elbows, knees), flat-shaded clothing,
// simple painted-style faces, hair, hats and outfits. Built facing +Z.
import * as THREE from 'three';
import { buildHand, POSES } from './hands.js';
import { mulberry } from './textures.js';

const SKIN = [0xf3cfb3, 0xe9b894, 0xd9a07c, 0xc68a64, 0xa86b4a, 0x8a5538, 0x6b3f28, 0x52301e];
const HAIR = [0x1c1410, 0x2e1d13, 0x45291a, 0x6b4426, 0x9a6a3a, 0xd2a55a, 0xe8c98e, 0x8a3418, 0x9a9a9a, 0x101010];
const SHIRT = [0x2f5d8a, 0x8a2f3a, 0x3d6b45, 0x444a52, 0xe4ddd0, 0x6b4a2e, 0x2b6f86, 0x9a7a2a, 0x5a3a72, 0xb8582a, 0x1d1f24, 0x9aa7b0];
const PANTS = [0x2b3a55, 0x3b5b7a, 0x2b2b2b, 0x4a3a2a, 0x8a7a5a, 0x3a4a3a, 0x5a6a7a];
export const NAMES = ['Maya', 'Theo', 'Priya', 'Jonah', 'Lena', 'Marcus', 'Aiko', 'Diego', 'Nora', 'Sam', 'Ines', 'Kofi', 'Ruth', 'Felix', 'Zara', 'Omar', 'Hana', 'Leo', 'Imani', 'Jules', 'Sofia', 'Ravi', 'Greta', 'Malik', 'Elif', 'Tomas', 'Yara', 'Ben', 'Mei', 'Oscar', 'Ada', 'Nico'];

const lerp = (a, b, t) => a + (b - a) * t;
const C8 = 1; // smooth round cross-sections

// Octagonal prism through rings [y, width, depth] (bottom to top), with a flat face forward.
function prism(rings) {
  const pts = [new THREE.Vector2(0.0001, rings[0][0])];
  for (const [y] of rings) pts.push(new THREE.Vector2(1, y));
  pts.push(new THREE.Vector2(0.0001, rings[rings.length - 1][0]));
  const g = new THREE.LatheGeometry(pts, 18, Math.PI / 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    let w = rings[0][1], d = rings[0][2];
    for (let k = 1; k < rings.length; k++) {
      if (y <= rings[k][0] + 1e-6) { const t = (y - rings[k - 1][0]) / Math.max(1e-6, rings[k][0] - rings[k - 1][0]); w = lerp(rings[k - 1][1], rings[k][1], t); d = lerp(rings[k - 1][2], rings[k][2], t); break; }
      w = rings[k][1]; d = rings[k][2];
    }
    p.setX(i, p.getX(i) * w / 2 / C8); p.setZ(i, p.getZ(i) * d / 2 / C8);
  }
  g.computeVertexNormals();
  return g;
}
const scaleRings = (rings, s, sy = 0) => rings.map(([y, w, d]) => [y + sy, w * s, d * s]);
const mat = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
function mesh(geo, m, parent, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

export function buildPerson(seed, opts = {}) {
  const lite = !!opts.lite;
  const r = mulberry(Math.imul(seed + 1, 2654435761) ^ 0x5bd1e995); r(); r();
  const pick = (a) => a[Math.floor(r() * a.length)];
  const fem = r() < 0.5 ? 1 : 0;
  const skin = pick(SKIN);
  const hairColor = r() < 0.1 ? 0x9a9a9a : pick(HAIR);
  const hairStyle = pick(fem ? ['long', 'bun', 'ponytail', 'bob', 'long', 'curly'] : ['short', 'short', 'quiff', 'buzz', 'curly', 'bald', 'short']);
  const top = pick(['shirt', 'tee', 'vest', 'puffer', 'jacket', 'hoodie', 'sweater', 'tee', 'shirt']);
  const shirtC = pick(SHIRT), outerC = pick([0xc0392b, 0x2e86de, 0x27ae60, 0x8e44ad, 0xd35400, 0x34495e, 0x16a085, 0x7f5539]);
  const vestC = top === 'vest' ? 0xf2cf1d : outerC;
  const pantsC = pick(PANTS);
  const shoeC = pick([0x1d1d1d, 0x3a2416, 0xeeeeee, 0x7a4a2a, 0x2a3a5a]);
  const beard = !fem && r() < 0.4 ? pick(['full', 'full', 'moustache', 'stubble']) : null;
  const glasses = r() < 0.2;
  const hatType = r() < 0.3 ? pick(['hardhat', 'cap', 'beanie', 'cap']) : null;
  const hatC = hatType === 'hardhat' ? pick([0xf2c418, 0xf0f0f0, 0xe67e22, 0xd63031]) : pick([0x2d3436, 0xc0392b, 0x2e86de, 0x27ae60, 0xf1c40f, 0x8e44ad]);
  const W = 0.94 + r() * 0.14;
  const height = (fem ? 0.95 : 1.0) * (0.96 + r() * 0.07);
  const name = NAMES[Math.floor(r() * NAMES.length)];
  const earrings = fem && r() < 0.6;

  const skinM = new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xff9a80), sheenRoughness: 0.6 }), shirtM = mat(shirtC), outerM = mat(vestC, 0.75), pantsM = mat(pantsC, 0.9);
  const hairM = mat(hairColor, 0.8), darkM = mat(0x1b1412, 0.9), shoeM = mat(shoeC, 0.6), soleM = mat(0x111111, 0.9);
  const skinDark = mat(shade(skin, 0.82), 0.8);
  const hasOuter = top === 'vest' || top === 'puffer' || top === 'jacket';
  const sleeveM = top === 'puffer' || top === 'jacket' || top === 'hoodie' || top === 'sweater' ? outerM : shirtM;

  const root = new THREE.Group(); root.name = 'person-' + name;
  const body = new THREE.Group(); body.scale.setScalar(height); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  const hipW = fem ? 1.06 : 1;

  // pelvis + belt
  mesh(prism([[-0.11, 0.27 * W * hipW, 0.18], [-0.02, 0.32 * W * hipW, 0.2], [0.07, 0.3 * W, 0.19]]), pantsM, hips);
  if (top !== 'hoodie' && top !== 'sweater') mesh(prism([[0.04, 0.315 * W, 0.2], [0.075, 0.315 * W, 0.2]]), mat(0x2a1a10, 0.6), hips);

  // ---- torso: waist, ribcage, chest, shoulder slope
  const spine = new THREE.Group(); spine.position.y = 0.06; hips.add(spine);
  const chest = new THREE.Group(); spine.add(chest);
  const torsoR = fem
    ? [[0, 0.28, 0.185], [0.1, 0.25, 0.17], [0.22, 0.3, 0.2], [0.33, 0.33, 0.205], [0.4, 0.34, 0.19], [0.45, 0.24, 0.15], [0.475, 0.12, 0.11]]
    : [[0, 0.29, 0.19], [0.1, 0.29, 0.185], [0.22, 0.33, 0.2], [0.33, 0.38, 0.21], [0.4, 0.39, 0.2], [0.45, 0.27, 0.16], [0.48, 0.13, 0.12]];
  const tR = torsoR.map(([y, w, d]) => [y, w * W, d]);
  mesh(prism(tR), top === 'hoodie' || top === 'sweater' ? outerM : shirtM, chest);
  if (top === 'shirt' || hasOuter) {
    for (const sx of [-1, 1]) { const c = mesh(box(0.06, 0.035, 0.012), shirtM, chest, sx * 0.035, 0.462, 0.062); c.rotation.set(-0.6, sx * 0.4, sx * 0.5); }
    if (top === 'shirt') {
      mesh(box(0.012, 0.36, 0.006), mat(shade(shirtC, 0.8)), chest, 0, 0.25, 0.101);
      mesh(box(0.07, 0.06, 0.006), mat(shade(shirtC, 0.88)), chest, 0.08, 0.33, 0.104);
    }
  }
  if (top === 'tee') mesh(prism([[0.44, 0.17, 0.13], [0.47, 0.15, 0.125]]), mat(shade(shirtC, 0.85)), chest);
  if (top === 'sweater') {
    mesh(prism([[0.44, 0.18, 0.135], [0.48, 0.16, 0.13]]), mat(shade(vestC, 0.8)), chest);
    mesh(prism([[-0.01, 0.3 * W, 0.2], [0.05, 0.3 * W, 0.195]]), mat(shade(vestC, 0.8)), chest);
  }
  if (hasOuter) {
    const k = top === 'puffer' ? 1.09 : 1.05;
    mesh(prism(scaleRings(tR.slice(0, -1), k, -0.02)), outerM, chest);
    const frontZ = tR[3][2] / 2 * k;
    mesh(box(top === 'puffer' ? 0.05 : 0.09, 0.34, 0.01), shirtM, chest, 0, 0.25, frontZ + 0.002);
    if (top === 'vest') {
      const band = mat(0xd5d9dc, 0.35);
      for (const y of [0.1, 0.24]) mesh(prism([[y, tR[2][1] * k * 1.025, tR[2][2] * k * 1.025], [y + 0.035, tR[2][1] * k * 1.025, tR[2][2] * k * 1.025]]), band, chest);
      for (const sx of [-1, 1]) { const s = mesh(box(0.035, 0.18, 0.01), band, chest, sx * 0.1, 0.36, frontZ + 0.004); s.rotation.z = sx * 0.12; }
    }
    if (top === 'puffer') {
      const seam = mat(shade(vestC, 0.72), 0.8);
      [[0.06, 1], [0.15, 2], [0.24, 2], [0.33, 3]].forEach(([y, i]) => mesh(prism([[y, tR[i][1] * k * 1.02, tR[i][2] * k * 1.02], [y + 0.012, tR[i][1] * k * 1.02, tR[i][2] * k * 1.02]]), seam, chest));
      mesh(prism([[0.42, 0.2, 0.15], [0.49, 0.19, 0.145]]), outerM, chest);
    }
    if (top === 'jacket') for (const sx of [-1, 1]) { const l = mesh(box(0.05, 0.16, 0.012), outerM, chest, sx * 0.055, 0.38, frontZ + 0.006); l.rotation.set(-0.15, 0, sx * 0.35); }
  }
  if (top === 'hoodie') {
    mesh(prism([[0.4, 0.22, 0.1], [0.5, 0.24, 0.12], [0.56, 0.18, 0.09]]), outerM, chest, 0, 0, -0.07);
    mesh(box(0.18, 0.08, 0.012), mat(shade(vestC, 0.85)), chest, 0, 0.1, 0.098);
    for (const sx of [-1, 1]) mesh(box(0.006, 0.1, 0.006), mat(0xeeeeee), chest, sx * 0.03, 0.39, 0.1);
  }

  // ---- neck & head
  const neck = new THREE.Group(); neck.position.y = 0.455; chest.add(neck);
  mesh(prism([[-0.02, 0.112, 0.11], [0.04, 0.1, 0.1], [0.09, 0.094, 0.098]]), skinM, neck);
  const head = new THREE.Group(); head.position.set(0, 0.19, 0.012); neck.add(head);
  const jaw = fem ? 0.135 : 0.15;
  mesh(prism([[-0.126, 0.07, 0.08], [-0.118, 0.1, 0.12], [-0.085, jaw * 0.92, 0.16], [-0.045, jaw * 1.05, 0.183], [0.0, 0.158, 0.193], [0.045, 0.162, 0.198], [0.085, 0.154, 0.19], [0.112, 0.134, 0.17], [0.13, 0.1, 0.13], [0.141, 0.045, 0.06]]), skinM, head);
  const faceZ = 0.1;
  // facial structure: brow ridge, cheekbones, chin, all in skin so they blend into the head
  { const br = mesh(new THREE.SphereGeometry(0.05, 20, 12), skinM, head, 0, 0.041, 0.066); br.scale.set(1.45, 0.28, 0.45);
    for (const sx of [-1, 1]) { const ck = mesh(new THREE.SphereGeometry(0.024, 16, 10), skinM, head, sx * 0.044, -0.012, 0.058); ck.scale.set(1, 0.7, 0.7); }
    const ch = mesh(new THREE.SphereGeometry(0.024, 16, 10), skinM, head, 0, -0.1, 0.056); ch.scale.set(fem ? 0.95 : 1.15, 0.78, 0.82);
    if (!fem) { const jw = mesh(new THREE.SphereGeometry(0.06, 18, 10), skinM, head, 0, -0.085, 0.02); jw.scale.set(1.25, 0.55, 1.05); } }
  // eyes: white, iris, pupil, a highlight, and eyelids that blink
  const eyes = [];
  const whiteM = new THREE.MeshStandardMaterial({ color: 0xf2eee8, roughness: 0.25 });
  const irisM = mat(pick([0x5b3a1e, 0x3a2414, 0x4e7a3a, 0x3e6fa0, 0x6a5228, 0x2a1a10]), 0.4);
  const lashM = mat(0x1a1210, 0.9);
  for (const sx of [-1, 1]) {
    const socket = new THREE.Group(); socket.position.set(sx * 0.035, 0.016, 0.079); head.add(socket);
    const ball = new THREE.Group(); socket.add(ball);
    mesh(new THREE.SphereGeometry(0.0118, 18, 12), whiteM, ball);
    mesh(new THREE.CircleGeometry(0.0058, 20), irisM, ball, 0, 0, 0.0117);
    mesh(new THREE.CircleGeometry(0.0026, 14), darkM, ball, 0, 0, 0.0119);
    mesh(new THREE.SphereGeometry(0.0012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), ball, sx * 0.0025, 0.0028, 0.0118);
    const upper = new THREE.Group(); socket.add(upper);
    mesh(new THREE.SphereGeometry(0.0128, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), skinM, upper);
    const lash = mesh(new THREE.TorusGeometry(0.0128, fem ? 0.0011 : 0.0007, 4, 20, Math.PI), lashM, upper); lash.rotation.x = Math.PI / 2; lash.rotation.z = Math.PI;
    upper.rotation.x = -0.5;
    const lower = new THREE.Group(); socket.add(lower);
    mesh(new THREE.SphereGeometry(0.0124, 18, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skinM, lower); lower.rotation.x = 0.85;
    eyes.push({ socket, ball, upper, lower });
  }
  // brows: thin arches
  const browM = mat(shade(hairColor, 0.8));
  const brows = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.036, 0.05, 0.089); piv.userData.y0 = 0.05; head.add(piv);
    const bg = new THREE.CapsuleGeometry(fem ? 0.0024 : 0.0036, 0.026, 3, 8); bg.rotateZ(Math.PI / 2);
    const b = mesh(bg, browM, piv); b.rotation.z = sx * 0.12; b.rotation.y = -sx * 0.25; b.scale.z = 0.55;
    brows.push(piv);
  }
  // nose: bridge, rounded tip, nostril wings
  const nose = new THREE.Group(); nose.position.set(0, 0, 0); head.add(nose);
  { const nb = mesh(new THREE.CapsuleGeometry(0.0078, 0.034, 4, 10), skinM, nose, 0, 0.004, 0.094); nb.rotation.x = -0.32;
    const tip = mesh(new THREE.SphereGeometry(0.0115, 14, 10), skinM, nose, 0, -0.021, 0.106); tip.scale.set(1, 0.85, 0.9);
    for (const sx of [-1, 1]) { const al = mesh(new THREE.SphereGeometry(0.0085, 12, 8), skinM, nose, sx * 0.0115, -0.025, 0.097); al.scale.set(0.85, 0.75, 1); mesh(new THREE.SphereGeometry(0.0028, 8, 6), mat(0x2a1410), nose, sx * 0.0058, -0.031, 0.103).scale.set(1.2, 0.55, 1); } }
  // mouth: shaped lips over a dark mouth line
  const lipM = new THREE.MeshStandardMaterial({ color: new THREE.Color(skin).lerp(new THREE.Color(fem ? 0xb03a4a : 0xa85a50), fem ? 0.5 : 0.32), roughness: 0.4 });
  const mouthZ = beard === 'full' ? 0.104 : 0.088;
  const mouth = new THREE.Group(); mouth.position.set(0, -0.057, mouthZ); head.add(mouth);
  const halves = [];
  for (const sx of [-1, 1]) {
    const up = new THREE.Group(); mouth.add(up); const ul = mesh(new THREE.SphereGeometry(0.012, 14, 8), lipM, up, sx * 0.008, 0.0035, 0); ul.scale.set(1.1, 0.33, 0.5);
    const lo = new THREE.Group(); mouth.add(lo); const ll = mesh(new THREE.SphereGeometry(0.011, 14, 8), lipM, lo, sx * 0.0072, -0.0045, -0.0005); ll.scale.set(1.1, 0.45, 0.55);
    halves.push({ up, lo, sx });
  }
  const mouthGap = mesh(new THREE.BoxGeometry(0.034, 0.0022, 0.004), mat(0x3a0e0c), mouth, 0, -0.0005, 0.002);
  const teeth = mesh(new THREE.BoxGeometry(0.024, 0.005, 0.004), mat(0xf2eee2, 0.4), mouth, 0, -0.001, 0.0005); teeth.visible = false;
  for (const sx of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.026, 12, 8), skinM, head, sx * 0.088, 0, -0.01); e.scale.set(0.45, 1, 0.75); e.rotation.y = sx * 0.2;
    if (earrings) mesh(box(0.008, 0.012, 0.008), mat(0xe8c66a, 0.3), head, sx * 0.093, -0.032, -0.006);
  }

  // hair
  const hairGroup = new THREE.Group(); head.add(hairGroup);
  let cap = null;
  if (hairStyle !== 'bald') {
    const k = hairStyle === 'buzz' ? 0.97 : hairStyle === 'curly' ? 1.14 : 1;
    cap = mesh(prism(scaleRings([[0.06, 0.182, 0.212], [0.1, 0.178, 0.208], [0.13, 0.145, 0.175], [0.148, 0.08, 0.1]], k, hairStyle === 'quiff' ? 0.005 : 0)), hairM, hairGroup);
    mesh(prism([[-0.07, 0.17 * k, 0.12], [0.07, 0.184 * k, 0.15]]), hairM, hairGroup, 0, 0, -0.04);
    for (const sx of [-1, 1]) { const sb2 = mesh(new THREE.SphereGeometry(0.03, 12, 8), hairM, hairGroup, sx * 0.08, 0.05, 0.03); sb2.scale.set(0.35, 1.2, 0.9); }
    if (hairStyle === 'quiff') { const q = mesh(box(0.13, 0.05, 0.08), hairM, hairGroup, 0, 0.15, 0.06); q.rotation.x = -0.35; }
    if (hairStyle === 'long' || hairStyle === 'bob') {
      const len = hairStyle === 'long' ? 0.3 : 0.12;
      mesh(prism([[-len, 0.21, 0.08], [0.05, 0.19, 0.1]]), hairM, hairGroup, 0, 0, -0.07);
      for (const sx of [-1, 1]) { const lk = mesh(new THREE.CapsuleGeometry(0.03, len * 0.8 + 0.04, 4, 10), hairM, hairGroup, sx * 0.09, 0.03 - len * 0.4, 0); lk.scale.set(0.75, 1, 1.3); }
    }
    if (hairStyle === 'bun') mesh(new THREE.SphereGeometry(0.05, 12, 10), hairM, hairGroup, 0, 0.13, -0.09);
    if (hairStyle === 'ponytail') { const p = mesh(prism([[-0.22, 0.03, 0.03], [-0.05, 0.07, 0.06], [0.02, 0.06, 0.05]]), hairM, hairGroup, 0, 0.06, -0.12); p.rotation.x = 0.25; }
    if (hairStyle === 'curly') for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2; mesh(new THREE.SphereGeometry(0.035 + r() * 0.02, 10, 8), hairM, hairGroup, Math.cos(a) * 0.09, 0.11 + r() * 0.04, Math.sin(a) * 0.09 - 0.02); }
  }
  if (beard === 'full' || beard === 'stubble') {
    const bm = beard === 'stubble' ? mat(new THREE.Color(hairColor).lerp(new THREE.Color(skin), 0.45).getHex()) : hairM;
    mesh(prism(scaleRings([[-0.132, 0.1, 0.1], [-0.1, 0.13, 0.15], [-0.06, jaw, 0.18], [-0.02, 0.172, 0.19], [0.0, 0.17, 0.12]], beard === 'stubble' ? 1.015 : 1.07)), bm, head, 0, 0, beard === 'full' ? 0.004 : 0);
  }
  if (beard === 'full' || beard === 'moustache') mesh(box(0.06, 0.014, 0.012), hairM, head, 0, -0.044, mouthZ + 0.003);
  if (glasses) {
    const fm = mat(r() < 0.5 ? 0x111111 : 0xb08d57, 0.4);
    for (const sx of [-1, 1]) {
      const fr = new THREE.Group(); fr.position.set(sx * 0.038, 0.018, faceZ + 0.008); head.add(fr);
      mesh(box(0.04, 0.005, 0.005), fm, fr, 0, 0.014, 0); mesh(box(0.04, 0.005, 0.005), fm, fr, 0, -0.014, 0);
      mesh(box(0.005, 0.03, 0.005), fm, fr, -0.019, 0, 0); mesh(box(0.005, 0.03, 0.005), fm, fr, 0.019, 0, 0);
      mesh(box(0.004, 0.004, 0.1), fm, head, sx * 0.088, 0.03, 0.055);
    }
    mesh(box(0.016, 0.005, 0.005), fm, head, 0, 0.026, faceZ + 0.008);
  }
  // hat (built once). The hair cap is hidden underneath so the two never fight for the same pixels.
  if (hatType) {
    const hm = mat(hatC, hatType === 'hardhat' ? 0.4 : 0.85);
    if (cap) cap.visible = false;
    mesh(prism(hatType === 'beanie'
      ? [[0.04, 0.19, 0.22], [0.11, 0.185, 0.215], [0.16, 0.13, 0.16], [0.175, 0.06, 0.08]]
      : [[0.06, 0.192, 0.222], [0.11, 0.185, 0.215], [0.155, 0.13, 0.16], [0.168, 0.06, 0.08]]), hm, head);
    if (hatType === 'hardhat') { mesh(prism([[0.058, 0.25, 0.28], [0.068, 0.25, 0.28]]), hm, head); mesh(box(0.035, 0.03, 0.2), hm, head, 0, 0.162, 0); }
    if (hatType === 'cap') { const v = mesh(box(0.15, 0.01, 0.09), hm, head, 0, 0.065, 0.14); v.rotation.x = -0.12; mesh(box(0.014, 0.014, 0.014), hm, head, 0, 0.172, 0); }
    if (hatType === 'beanie') mesh(prism([[0.04, 0.2, 0.23], [0.08, 0.2, 0.23]]), mat(shade(hatC, 0.8)), head);
  }

  // ---- arms: deltoid, upper arm, elbow, forearm, cuff, wrist, hand
  const arms = {};
  const short = top === 'tee';
  const L1 = 0.285, L2 = 0.255;
  const armM = top === 'vest' ? shirtM : sleeveM;
  for (const [side, sx] of [['right', -1], ['left', 1]]) {
    const shoulder = new THREE.Group(); shoulder.position.set(sx * 0.195 * W, 0.4, -0.005); chest.add(shoulder);
    const delt = mesh(new THREE.SphereGeometry(0.066, 14, 10), top === 'puffer' || top === 'jacket' ? outerM : armM, shoulder); delt.scale.set(1, 0.85, 0.9);
    const upper = new THREE.Group(); shoulder.add(upper);
    mesh(prism([[-L1, 0.085, 0.085], [-L1 * 0.5, 0.098, 0.095], [0, 0.115, 0.105]]), short ? skinM : armM, upper);
    if (short) mesh(prism([[-0.13, 0.12, 0.115], [0.02, 0.125, 0.115]]), shirtM, upper);
    const fore = new THREE.Group(); fore.position.y = -L1; upper.add(fore);
    mesh(new THREE.SphereGeometry(0.046, 12, 8), short ? skinM : armM, fore);
    mesh(prism([[-L2 + 0.01, 0.062, 0.055], [-L2 * 0.45, 0.082, 0.072], [0, 0.088, 0.08]]), short ? skinM : armM, fore);
    if (!short) mesh(prism([[-L2, 0.07, 0.064], [-L2 + 0.035, 0.07, 0.064]]), mat(shade(armM.color.getHex(), 0.8)), fore);
    mesh(prism([[-L2 - 0.02, 0.05, 0.045], [-L2 + 0.01, 0.055, 0.048]]), skinM, fore);
    const wrist = new THREE.Group(); wrist.position.y = -L2; fore.add(wrist);
    const h = lite ? (() => {
      // cheap mitten hand for background dancers
      const root = new THREE.Group(); const m = mat(skin, 0.7);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), m); palm.position.z = -0.05; root.add(palm);
      const th = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.05), m); th.position.set(-sx * 0.04, -0.005, -0.04); th.rotation.y = sx * 0.5; root.add(th);
      return { root, setPose() {}, update() {}, fingers: [] };
    })() : buildHand({ side, skin, forearm: false, scale: fem ? 1.0 : 1.08, smooth: true });
    wrist.add(h.root); h.root.rotation.set(-Math.PI / 2, 0, 0); h.setPose(POSES.relaxed);
    arms[side] = { shoulder, upper, fore, wrist, hand: h, L1, L2, sx, target: null, blend: 0 };
  }

  // ---- legs: thigh, knee, shin, ankle, shoe
  const legs = {};
  const cuffs = r() < 0.35;
  for (const [side, sx] of [['right', -1], ['left', 1]]) {
    const thigh = new THREE.Group(); thigh.position.set(sx * 0.085 * W, -0.04, 0); hips.add(thigh);
    mesh(prism([[-0.44, 0.11, 0.11], [-0.22, 0.135, 0.135], [0.02, 0.16, 0.16]]), pantsM, thigh);
    const shin = new THREE.Group(); shin.position.y = -0.44; thigh.add(shin);
    mesh(new THREE.SphereGeometry(0.06, 12, 8), pantsM, shin);
    mesh(prism([[-0.42, 0.09, 0.09], [-0.22, 0.11, 0.11], [0, 0.112, 0.112]]), pantsM, shin);
    if (cuffs) mesh(prism([[-0.42, 0.106, 0.106], [-0.38, 0.106, 0.106]]), mat(shade(pantsC, 1.25)), shin);
    const foot = new THREE.Group(); foot.position.y = -0.43; shin.add(foot);
    mesh(prism([[-0.07, 0.1, 0.1], [0, 0.09, 0.09]]), shoeM, foot);
    mesh(prism([[-0.07, 0.1, 0.13], [-0.02, 0.095, 0.12]]), shoeM, foot, 0, 0, 0.07);
    mesh(box(0.105, 0.018, 0.25), soleM, foot, 0, -0.072, 0.045);
    legs[side] = { thigh, shin, foot, sx };
  }

  // ---------------------------------------------------------------- animation
  const st = {
    mode: 'stand', sitBlend: 0, walkPhase: r() * 6, walkSpeed: 0,
    look: new THREE.Vector3(0, 1.6, -2), lookW: 0,
    blinkT: 1 + r() * 3, blink: 0, talk: 0, talkT: 0,
    emotion: 'neutral', emo: { brow: 0, smile: 0 }, breathe: r() * 6,
  };
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
  const DOWN = new THREE.Vector3(0, -1, 0);
  function aim(bone, worldDir) {
    bone.parent.getWorldQuaternion(tmpQ).invert();
    bone.quaternion.setFromUnitVectors(DOWN, worldDir.clone().applyQuaternion(tmpQ).normalize());
  }
  function solveArm(arm, targetW, poleW) {
    const s = arm.upper.getWorldPosition(new THREE.Vector3());
    const L1w = arm.L1 * height, L2w = arm.L2 * height;
    const d = targetW.clone().sub(s);
    const dist = Math.min(Math.max(d.length(), 0.05), L1w + L2w - 0.002);
    const dir = d.normalize();
    const a = (L1w * L1w - L2w * L2w + dist * dist) / (2 * dist);
    const hh = Math.sqrt(Math.max(0, L1w * L1w - a * a));
    const pv = poleW.clone().sub(s); pv.addScaledVector(dir, -pv.dot(dir)).normalize();
    const elbow = s.clone().addScaledVector(dir, a).addScaledVector(pv, hh);
    aim(arm.upper, elbow.clone().sub(s)); arm.upper.updateMatrixWorld(true);
    aim(arm.fore, s.clone().addScaledVector(dir, dist).sub(elbow)); arm.fore.updateMatrixWorld(true);
  }
  // natural club dancing: knees dip on the beat, weight steps side to side, hips sway,
  // the torso counter-rotates, the head nods, and the arms move loosely (or go up on the chorus)
  function applyDance(t) {
    const D = st.dance || { style: 'groove', ph: 0, energy: 0.8 };
    const b = (st.beat ?? t * 2) + D.ph, E = D.energy, TAU = Math.PI * 2;
    const dip = Math.pow(0.5 + 0.5 * Math.cos(b * TAU), 1.6);
    const step = Math.sin(b * Math.PI);
    const slow = Math.sin(b * Math.PI * 0.5);
    const jump = D.style === 'jump' ? Math.max(0, Math.sin(b * TAU)) * 0.07 : 0;
    hips.position.set(0.045 * step * E, 0.95 - 0.045 * dip * E + jump, 0);
    hips.rotation.set(0, 0.14 * slow * E, -0.05 * step * E);
    for (const side of ['right', 'left']) {
      const L = legs[side]; const w = side === 'right' ? -step : step; const lift = Math.max(0, w);
      L.thigh.rotation.set(-0.16 * dip * E - 0.14 * lift * E, 0, -hips.position.x * 1.1 + 0.05 * step * E);
      L.shin.rotation.set(0.34 * dip * E + 0.3 * lift * E, 0, 0);
      L.foot.rotation.set(-0.18 * dip * E - 0.15 * lift * E, 0, 0);
    }
    spine.rotation.set(0.05 + 0.04 * dip * E, -hips.rotation.y * 1.5, 0.09 * step * E);
    neck.rotation.x = 0.13 * dip * E;
    for (const side of ['right', 'left']) {
      const A = arms[side]; const sx = A.sx; const o = side === 'right' ? 0 : Math.PI;
      const sw = Math.sin(b * Math.PI + o), sw2 = Math.sin(b * TAU + o);
      let ux, uz, fx, pose = POSES.relaxed;
      const style = D.style === 'point' && side === 'left' ? 'groove' : D.style;
      switch (style) {
        case 'up': case 'jump': ux = -2.7 + 0.15 * dip + 0.12 * sw; uz = sx * (0.32 + 0.1 * sw); fx = -0.35 - 0.35 * dip; pose = sw > 0 ? POSES.flat : POSES.relaxed; break;
        case 'point': ux = -2.25 + 0.25 * dip; uz = sx * 0.12; fx = -0.15 - 0.2 * dip; pose = POSES.point; break;
        case 'sway': ux = -0.2 - 0.25 * sw * E; uz = sx * (0.14 + 0.06 * sw2); fx = -0.55 - 0.25 * sw; break;
        case 'clap': { const c = Math.pow(0.5 + 0.5 * Math.cos(b * TAU), 3); ux = -1.45; uz = sx * (0.02 + 0.4 * (1 - c)); fx = -1.0 - 0.2 * c; pose = POSES.flat; break; }
        case 'shoulders': ux = -0.35 - 0.1 * sw; uz = sx * 0.22; fx = -1.55 - 0.15 * sw2; pose = POSES.fist; A.shoulder.position.y = 0.4 + 0.022 * Math.max(0, sw); break;
        default: ux = -0.5 - 0.3 * sw * E; uz = sx * (0.2 + 0.06 * dip); fx = -1.35 - 0.3 * sw2 * E; pose = POSES.relaxed;
      }
      if (style !== 'shoulders') A.shoulder.position.y = 0.4;
      A.upper.rotation.set(ux, 0, uz); A.fore.rotation.set(fx, 0, 0);
      A.hand.root.rotation.set(-Math.PI / 2, -A.sx * Math.PI / 2, 0, 'YXZ');
      A.hand.setPose(pose);
    }
  }
  function setHandWorldQuat(arm, qW) { arm.wrist.getWorldQuaternion(tmpQ2).invert(); arm.hand.root.quaternion.copy(tmpQ2.multiply(qW)); }

  return {
    root, name, seed, fem, arms, legs, head, neck, chest, hips, eyes, brows, halves, mouthGap, teeth, st, height,
    setEmotion(e) { st.emotion = e; },
    say() { st.talkT = 1.6; },
    setArmTarget(side, t) { arms[side].target = t; },
    update(dt, t) {
      st.breathe += dt;
      st.sitBlend += ((st.mode === 'sit' ? 1 : 0) - st.sitBlend) * Math.min(1, dt * 3);
      const sb = st.sitBlend;
      st.walkSpeed += ((st.mode === 'walk' ? 1 : 0) - st.walkSpeed) * Math.min(1, dt * 6);
      if (st.mode === 'walk') st.walkPhase += dt * 7.2;
      const ws = st.walkSpeed * (1 - sb), ph = st.walkPhase;
      const dancing = st.mode === 'dance';
      if (dancing) applyDance(t);
      else {
      hips.position.x = 0; hips.rotation.set(0, 0, 0);
      hips.position.y = lerp(0.95 + Math.abs(Math.cos(ph)) * 0.02 * ws, (st.sitHeight || 0.86), sb);
      hips.position.z = lerp(0, -0.02, sb);
      for (const side of ['right', 'left']) {
        const L = legs[side]; const o = side === 'right' ? 0 : Math.PI;
        const swing = Math.sin(ph + o) * 0.42 * ws;
        L.thigh.rotation.x = lerp(swing, -1.45, sb);
        L.thigh.rotation.z = lerp(0, -L.sx * 0.08, sb);
        L.shin.rotation.x = lerp(Math.max(0, Math.sin(ph + o - 1.2)) * 0.7 * ws, 1.65, sb);
        L.foot.rotation.x = lerp(-Math.max(0, Math.sin(ph + o)) * 0.2 * ws, -0.2, sb);
      }
      spine.rotation.x = lerp(0.04 * ws, 0.12, sb) + Math.sin(st.breathe * 1.6) * 0.008;
      spine.rotation.y = Math.sin(ph) * 0.06 * ws; spine.rotation.z = 0;
      }
      chest.scale.set(1, 1 + Math.sin(st.breathe * 1.6) * 0.005, 1 + Math.sin(st.breathe * 1.6) * 0.01);
      root.updateMatrixWorld(true);

      // head look
      const hl = root.worldToLocal(head.getWorldPosition(tmpV).clone());
      const ll = root.worldToLocal(st.look.clone());
      const dx = ll.x - hl.x, dy = ll.y - hl.y, dz = ll.z - hl.z;
      const yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(dx, dz))), pitch = Math.max(-0.5, Math.min(0.45, Math.atan2(dy, Math.hypot(dx, dz))));
      const idleYaw = Math.sin(t * 0.37 + seed) * 0.25 + Math.sin(t * 0.13 + seed * 2) * 0.2;
      const fy = lerp(idleYaw, yaw, st.lookW), fp = lerp(Math.sin(t * 0.21 + seed) * 0.08, pitch, st.lookW);
      neck.rotation.y += (fy * 0.35 - neck.rotation.y) * Math.min(1, dt * 5);
      head.rotation.y += (fy * 0.65 - head.rotation.y) * Math.min(1, dt * 5);
      head.rotation.x += (-fp * 0.8 - spine.rotation.x * 0.5 - head.rotation.x) * Math.min(1, dt * 5);

      // blink
      st.blinkT -= dt;
      if (st.blinkT < 0) { st.blink = 1; st.blinkT = 2 + r() * 4; }
      st.blink = Math.max(0, st.blink - dt * 7);
      const bl = Math.sin(Math.min(1, st.blink) * Math.PI);
      const lidOpen = st.emotion === 'angry' ? -0.25 : st.emotion === 'happy' ? -0.4 : -0.5;
      for (const e of eyes) { e.upper.rotation.x = lerp(lidOpen, 0.62, bl); e.ball.rotation.y = Math.max(-0.4, Math.min(0.4, (yaw - fy) * 0.6 * st.lookW)); e.ball.rotation.x = Math.max(-0.25, Math.min(0.25, -(pitch - fp) * 0.5 * st.lookW)); }

      // expression
      const goalBrow = { neutral: 0, happy: 0.15, angry: -0.35, sad: 0.3 }[st.emotion] || 0;
      const goalSmile = { neutral: 0.02, happy: 0.35, angry: -0.2, sad: -0.25 }[st.emotion] || 0;
      st.emo.brow += (goalBrow - st.emo.brow) * Math.min(1, dt * 4);
      st.emo.smile += (goalSmile - st.emo.smile) * Math.min(1, dt * 4);
      brows.forEach((b, i) => { const sx = i === 0 ? -1 : 1; b.rotation.z = -sx * st.emo.brow * 0.8; b.position.y = b.userData.y0 + (st.emotion === 'angry' ? -0.004 : st.emo.brow > 0 ? 0.004 : 0); });
      st.talkT = Math.max(0, st.talkT - dt);
      const talking = st.talkT > 0 ? Math.max(0, Math.sin(t * 17) * 0.5 + Math.sin(t * 9.3) * 0.5) : 0;
      st.talk += (talking - st.talk) * Math.min(1, dt * 18);
      for (const hlf of halves) {
        hlf.up.rotation.z = hlf.sx * st.emo.smile * 0.5;
        hlf.lo.rotation.z = hlf.sx * st.emo.smile * 0.6;
        hlf.lo.position.y = -st.talk * 0.008;
      }
      mouthGap.scale.y = 1 + st.talk * 4 + Math.max(0, st.emo.smile - 0.2) * 3;
      teeth.visible = st.emo.smile > 0.25;

      // arms
      if (dancing) { for (const side of ['right', 'left']) arms[side].hand.update(dt, 8); }
      else for (const side of ['right', 'left']) {
        const A = arms[side]; const tgt = A.target;
        A.blend += ((tgt ? 1 : 0) - A.blend) * Math.min(1, dt * 5);
        const armSwing = Math.sin(ph + (side === 'right' ? Math.PI : 0)) * 0.35 * ws;
        A.upper.rotation.set(armSwing, 0, -A.sx * 0.1 * (1 - sb));
        A.fore.rotation.set(-0.15 - Math.max(0, armSwing) * 0.4, 0, 0);
        A.hand.root.rotation.set(-Math.PI / 2, -A.sx * Math.PI / 2, 0, 'YXZ');
        if (tgt && A.blend > 0.01) {
          root.updateMatrixWorld(true);
          const qU0 = A.upper.quaternion.clone(), qF0 = A.fore.quaternion.clone(), qH0 = A.hand.root.quaternion.clone();
          const sw = A.upper.getWorldPosition(new THREE.Vector3());
          solveArm(A, tgt.pos, sw.clone().add(new THREE.Vector3(A.sx * 0.5, -0.6, -0.4).applyQuaternion(root.quaternion)));
          if (tgt.quat) setHandWorldQuat(A, tgt.quat);
          const b = A.blend;
          A.upper.quaternion.copy(qU0.slerp(A.upper.quaternion, b));
          A.fore.quaternion.copy(qF0.slerp(A.fore.quaternion, b));
          A.hand.root.quaternion.copy(qH0.slerp(A.hand.root.quaternion, b));
          if (tgt.pose) A.hand.setPose(tgt.pose);
        } else A.hand.setPose(POSES.relaxed);
        A.hand.update(dt, 8);
      }
      if (st.emotion === 'angry' && arms.left.target) arms.left.hand.fingers.forEach((fi, i) => { fi.joints[0].rotation.x = -0.1 - Math.max(0, Math.sin(t * 12 - i * 0.9)) * 0.5; });
    },
  };
}

// world-space hand orientation helpers (person faces direction given by yaw)
export function handQuat(yaw, kind, side) {
  const q = new THREE.Quaternion();
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  if (kind === 'rest') q.setFromEuler(new THREE.Euler(0, Math.PI + (side === 'right' ? -0.35 : 0.35), 0, 'YXZ'));
  else if (kind === 'hold') {
    const a = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const b = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side === 'right' ? Math.PI / 2 : -Math.PI / 2);
    q.copy(b).multiply(a).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side === 'right' ? 0.5 : -0.5));
  }
  return q.premultiply(yawQ);
}
