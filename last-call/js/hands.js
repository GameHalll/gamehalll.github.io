// Detailed procedural hands: shaped palm, 3-jointed fingers with knuckles and nails, thumb,
// wrist, forearm, sleeve and an optional wristwatch. Posable per finger.
//
// Hand local frame: wrist at origin, fingers point along -Z, palm faces -Y, back of hand +Y.
// Right hand thumb sits on -X; left hand is mirrored (thumb on +X).
import * as THREE from 'three';

const FINGERS = [
  // name, x offset at knuckle, length scale, base angle (spread), radius
  { x: -0.0255, len: 0.95, spread: -0.06, r: 0.0089 }, // index
  { x: -0.0085, len: 1.05, spread: 0.0, r: 0.0092 }, // middle
  { x: 0.0085, len: 0.98, spread: 0.05, r: 0.0087 }, // ring
  { x: 0.0245, len: 0.78, spread: 0.13, r: 0.0077 }, // pinky
];
const SEG = [0.043, 0.027, 0.022];

export function flatMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true });
}
export function skinMaterial(color) {
  if (LOWPOLY) return flatMaterial(color);
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.52, metalness: 0,
    sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff8a70),
    clearcoat: 0.08, clearcoatRoughness: 0.6,
    specularIntensity: 0.45,
  });
}

export let LOWPOLY = true;
function capsule(r, len, mat, segs = 12) {
  const g = LOWPOLY ? new THREE.CapsuleGeometry(r, len, 2, 6) : new THREE.CapsuleGeometry(r, len, 6, segs);
  g.translate(0, -len / 2, 0); // hang from origin along -Y
  g.rotateX(Math.PI / 2); // now along -Z? rotateX(+90): (0,-1,0) -> (0,0,-1)
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function palmGeometry() {
  // Rounded, slightly cupped palm block built from a deformed sphere.
  const g = LOWPOLY ? new THREE.SphereGeometry(1, 9, 7) : new THREE.SphereGeometry(1, 40, 28);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // superellipsoid-ish squaring
    const sx = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.55);
    const sz = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.6);
    const sy = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.9);
    let x = sx * 0.041, y = sy * 0.0135, z = sz * 0.048;
    // taper towards the wrist (+z), wider at knuckles (-z)
    const t = (z + 0.048) / 0.096; // 0 at knuckles, 1 at wrist
    x *= 1 - t * 0.22;
    // thenar pad (thumb side, -x, palm side -y, wrist half)
    if (y < 0) {
      const pad = Math.exp(-(((x + 0.022) / 0.018) ** 2 + ((z - 0.018) / 0.026) ** 2));
      y -= pad * 0.008;
      const pad2 = Math.exp(-(((x - 0.024) / 0.016) ** 2 + ((z - 0.02) / 0.03) ** 2));
      y -= pad2 * 0.004;
      // cupped center
      y += Math.exp(-((x / 0.02) ** 2 + (z / 0.025) ** 2)) * 0.004;
    } else {
      // knuckle ridge & tendons on the back
      y += Math.exp(-(((z + 0.04) / 0.008) ** 2)) * 0.002;
      for (const f of FINGERS) y += Math.exp(-(((x - f.x) / 0.004) ** 2)) * 0.0011 * (1 - t);
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function nailGeometry(r) {
  const g = new THREE.SphereGeometry(r * 0.82, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32);
  g.scale(1, 0.35, 1.25);
  return g;
}

export function buildHand({ side = 'right', skin = 0xd9a07c, sleeve = 0x1d1d22, cuff = 0xe8e2d6, watch = false, scale = 1, forearm = true, sleeveLen = 0.17, smooth = false } = {}) {
  const mir = side === 'left' ? -1 : 1;
  const root = new THREE.Group();
  root.name = side + 'Hand';
  const skinMat = smooth ? new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }) : skinMaterial(skin);
  const nailMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(skin).lerp(new THREE.Color(0xffe0dc), 0.55), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const knuckleMat = skinMat;
  const hand = new THREE.Group();
  root.add(hand);
  hand.scale.set(mir * scale, scale, scale);

  // palm sits forward of the wrist
  const palm = new THREE.Mesh(palmGeometry(), skinMat);
  palm.position.set(0, 0, -0.047);
  palm.castShadow = true;
  hand.add(palm);

  // wrist
  const wristG = new THREE.CylinderGeometry(0.023, 0.026, 0.05, LOWPOLY ? 7 : 20, 1, true);
  wristG.rotateX(Math.PI / 2); wristG.scale(1.25, 0.72, 1);
  const wrist = new THREE.Mesh(wristG, skinMat);
  wrist.position.set(0, 0.001, 0.008);
  hand.add(wrist);
  const wristCap = new THREE.Mesh(new THREE.SphereGeometry(0.026, LOWPOLY ? 7 : 20, LOWPOLY ? 5 : 14), skinMat);
  wristCap.scale.set(1.2, 0.68, 0.9); wristCap.position.set(0, 0.001, -0.004);
  hand.add(wristCap);
  // ulnar bump
  const bump = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), skinMat);
  bump.position.set(0.026, 0.008, 0.014); hand.add(bump);

  const fingers = [];
  FINGERS.forEach((f, idx) => {
    const base = new THREE.Group();
    const kz = -0.094 + Math.abs(f.x) * 0.25 + (idx === 3 ? 0.006 : 0);
    base.position.set(f.x, 0.0005, kz);
    base.rotation.y = -f.spread;
    hand.add(base);
    // knuckle bump
    const kn = new THREE.Mesh(LOWPOLY ? new THREE.SphereGeometry(f.r * 1.25, 6, 4) : new THREE.SphereGeometry(f.r * 1.08, 14, 10), knuckleMat);
    kn.scale.set(1, 0.9, 1); base.add(kn);
    const joints = [];
    let parent = base;
    for (let s = 0; s < 3; s++) {
      const j = new THREE.Group();
      if (s > 0) j.position.z = -SEG[s - 1] * f.len;
      parent.add(j);
      const r = f.r * (1 - s * 0.1) * (LOWPOLY ? 1.22 : 1);
      const seg = capsule(r, SEG[s] * f.len, skinMat);
      seg.scale.set(1.05, 0.92, 1);
      j.add(seg);
      // joint crease bump on the back
      if (s > 0 && !LOWPOLY) { const jb = new THREE.Mesh(new THREE.SphereGeometry(r * 1.03, 12, 8), skinMat); jb.scale.set(1, 0.95, 0.9); j.add(jb); }
      if (s === 2 && !LOWPOLY) {
        const nail = new THREE.Mesh(nailGeometry(r), nailMat);
        nail.position.set(0, r * 0.72, -SEG[2] * f.len * 0.72);
        nail.rotation.x = -0.12;
        j.add(nail);
      }
      joints.push(j);
      parent = j;
    }
    fingers.push({ base, joints });
  });

  // thumb: metacarpal pivot near the wrist on the -X side
  const tBase = new THREE.Group();
  tBase.position.set(-0.026, -0.006, -0.03);
  hand.add(tBase);
  const tMeta = new THREE.Group(); tBase.add(tMeta);
  const metaSeg = capsule(0.0125, 0.036, skinMat);
  metaSeg.scale.set(1.15, 0.95, 1);
  tMeta.add(metaSeg);
  const tj1 = new THREE.Group(); tj1.position.z = -0.036; tMeta.add(tj1);
  tj1.add(capsule(0.0105, 0.03, skinMat));
  const tj2 = new THREE.Group(); tj2.position.z = -0.03; tj1.add(tj2);
  tj2.add(capsule(0.0097, 0.025, skinMat));
  if (!LOWPOLY) { const tnail = new THREE.Mesh(nailGeometry(0.0105), nailMat); tnail.position.set(0, 0.0082, -0.018); tnail.rotation.x = -0.1; tj2.add(tnail); }
  const thumb = { base: tBase, joints: [tMeta, tj1, tj2] };

  // forearm + sleeve (in hand-local space, extending back along +Z)
  let forearmMesh = null, sleeveMesh = null, fa = null;
  if (forearm) {
    fa = new THREE.Group();
    hand.add(fa);
    const prof = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.024 + t * 0.012 + Math.sin(t * Math.PI) * 0.004, t * 0.30)); }
    const faG = new THREE.LatheGeometry(prof, 24);
    faG.rotateX(Math.PI / 2); faG.scale(1.18, 0.86, 1);
    forearmMesh = new THREE.Mesh(faG, skinMat);
    forearmMesh.position.z = 0.02; forearmMesh.castShadow = true;
    fa.add(forearmMesh);
    // rolled sleeve
    const sl = new THREE.Group(); sl.position.z = 0.02 + sleeveLen; fa.add(sl);
    const slMat = new THREE.MeshPhysicalMaterial({ color: sleeve, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(sleeve).offsetHSL(0, 0, 0.25), sheenRoughness: 0.6 });
    const cuffMat = new THREE.MeshPhysicalMaterial({ color: cuff, roughness: 0.8, sheen: 0.8, sheenColor: 0xffffff });
    for (let k = 0; k < 3; k++) {
      const roll = new THREE.Mesh(new THREE.TorusGeometry(0.033 + k * 0.0012, 0.0065, 10, 28), k === 0 ? cuffMat : slMat);
      roll.scale.set(1.18, 0.9, 1); roll.position.z = k * 0.014; sl.add(roll);
    }
    const tube = new THREE.CylinderGeometry(0.037, 0.042, 0.3, 24, 1, true);
    tube.rotateX(Math.PI / 2); tube.translate(0, 0, 0.17); tube.scale(1.18, 0.9, 1);
    sleeveMesh = new THREE.Mesh(tube, slMat); sl.add(sleeveMesh);
    if (watch) {
      const steel = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, metalness: 1, roughness: 0.22 });
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0045, 8, 32), new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.6 }));
      strap.scale.set(1.15, 0.82, 2.2); strap.position.z = 0.038; fa.add(strap);
      const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.007, 32), steel);
      caseM.position.set(0, 0.0215, 0.038); fa.add(caseM);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.0115, 32), new THREE.MeshStandardMaterial({ color: 0x0d1a2b, roughness: 0.3, metalness: 0.2 }));
      face.rotation.x = -Math.PI / 2; face.position.set(0, 0.0252, 0.038); fa.add(face);
      const crystal = new THREE.Mesh(new THREE.SphereGeometry(0.012, 24, 8, 0, Math.PI * 2, 0, 0.5), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0, clearcoat: 1 }));
      crystal.position.set(0, 0.0145, 0.038); fa.add(crystal);
      for (let h = 0; h < 2; h++) {
        const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0005, h ? 0.009 : 0.006), steel);
        hand1.position.set(0, 0.0258, 0.038); hand1.rotation.y = h ? 1.1 : -2.2; hand1.translateZ(-(h ? 0.0045 : 0.003)); fa.add(hand1);
      }
    }
  }

  const pose = {
    curl: [[0.2, 0.25, 0.2], [0.22, 0.28, 0.2], [0.25, 0.3, 0.22], [0.3, 0.35, 0.25]],
    spread: [0, 0, 0, 0],
    thumb: [0.3, 0.2, 0.15], thumbYaw: 0.5, thumbRoll: 0.4,
  };
  const target = JSON.parse(JSON.stringify(pose));

  function apply() {
    fingers.forEach((f, i) => {
      f.base.rotation.y = -FINGERS[i].spread - pose.spread[i];
      f.joints.forEach((j, k) => { j.rotation.x = -pose.curl[i][k]; });
    });
    // thumb: base yaw swings across the palm, roll opposes, joints curl
    thumb.base.rotation.set(0, 0, 0);
    thumb.base.rotation.y = pose.thumbYaw;
    thumb.base.rotation.z = pose.thumbRoll;
    thumb.joints[0].rotation.x = -pose.thumb[0];
    thumb.joints[1].rotation.x = -pose.thumb[1];
    thumb.joints[2].rotation.x = -pose.thumb[2];
  }
  apply();

  function setPose(p) {
    if (p.curl) target.curl = p.curl.map((a) => a.slice());
    if (p.spread) target.spread = p.spread.slice();
    if (p.thumb) target.thumb = p.thumb.slice();
    if (p.thumbYaw !== undefined) target.thumbYaw = p.thumbYaw;
    if (p.thumbRoll !== undefined) target.thumbRoll = p.thumbRoll;
  }
  function update(dt, speed = 12) {
    const k = 1 - Math.exp(-speed * dt);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) pose.curl[i][j] += (target.curl[i][j] - pose.curl[i][j]) * k;
      pose.spread[i] += (target.spread[i] - pose.spread[i]) * k;
    }
    for (let j = 0; j < 3; j++) pose.thumb[j] += (target.thumb[j] - pose.thumb[j]) * k;
    pose.thumbYaw += (target.thumbYaw - pose.thumbYaw) * k;
    pose.thumbRoll += (target.thumbRoll - pose.thumbRoll) * k;
    apply();
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, hand, setPose, update, pose, fingers, thumb, skinMat, forearm: fa };
}

const c3 = (a, b, c) => [a, b, c];
export const POSES = {
  relaxed: { curl: [c3(0.25, 0.3, 0.2), c3(0.28, 0.35, 0.22), c3(0.32, 0.4, 0.25), c3(0.38, 0.45, 0.3)], spread: [0, 0, 0, 0.02], thumb: [0.15, 0.15, 0.1], thumbYaw: 0.45, thumbRoll: 0.35 },
  flat: { curl: [c3(0.05, 0.05, 0.03), c3(0.05, 0.05, 0.03), c3(0.06, 0.06, 0.04), c3(0.08, 0.06, 0.04)], spread: [-0.05, 0, 0.04, 0.1], thumb: [0.05, 0.05, 0.05], thumbYaw: 0.6, thumbRoll: 0.1 },
  grip: { curl: [c3(0.95, 1.05, 0.7), c3(1.0, 1.1, 0.7), c3(1.05, 1.1, 0.7), c3(1.15, 1.1, 0.7)], spread: [0, 0, 0, 0], thumb: [0.5, 0.35, 0.3], thumbYaw: 0.9, thumbRoll: 1.1 },
  gripWide: { curl: [c3(0.75, 0.8, 0.5), c3(0.8, 0.85, 0.5), c3(0.85, 0.85, 0.5), c3(0.95, 0.85, 0.5)], spread: [0, 0, 0, 0.02], thumb: [0.4, 0.25, 0.2], thumbYaw: 0.8, thumbRoll: 1.0 },
  pinch: { curl: [c3(0.55, 0.65, 0.35), c3(0.7, 0.9, 0.6), c3(0.95, 1.2, 0.8), c3(1.05, 1.25, 0.9)], spread: [0.02, 0, 0, 0], thumb: [0.55, 0.35, 0.25], thumbYaw: 0.95, thumbRoll: 1.05 },
  point: { curl: [c3(0.05, 0.05, 0.05), c3(1.3, 1.4, 0.9), c3(1.35, 1.4, 0.9), c3(1.4, 1.4, 0.9)], spread: [0, 0, 0, 0], thumb: [0.6, 0.5, 0.4], thumbYaw: 1.0, thumbRoll: 1.1 },
  fist: { curl: [c3(1.45, 1.6, 1.0), c3(1.5, 1.6, 1.0), c3(1.5, 1.6, 1.0), c3(1.5, 1.6, 1.0)], spread: [0, 0, 0, 0], thumb: [0.7, 0.6, 0.5], thumbYaw: 1.2, thumbRoll: 1.3 },
  cupGlass: { curl: [c3(0.6, 0.6, 0.4), c3(0.65, 0.65, 0.4), c3(0.7, 0.65, 0.4), c3(0.8, 0.6, 0.4)], spread: [0, 0, 0, 0.03], thumb: [0.35, 0.2, 0.15], thumbYaw: 0.75, thumbRoll: 0.9 },
};
