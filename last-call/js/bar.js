// The room: bar counter, workstation, back bar with lit shelves, bottles, lamps, tables,
// windows, neon, chalkboard. Returns handles for interactive stations.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { ITEMS } from './drinks.js';
import { INGREDIENTS, GLASSES, glassGeometry, MAT, mats, Vessel, makeGarnish, iceGeometry, RECIPES } from './drinks.js';

export const COUNTER_Y = 1.0;
export const COUNTER = { x0: -3.0, x1: 3.0, z0: -0.42, z1: 0.8 };
export const MAT_SPOT = new THREE.Vector3(0, COUNTER_Y, -0.1);
export const SHAKER_SPOT = new THREE.Vector3(0.19, COUNTER_Y, -0.1);
export const FRONT_Z = 0.52;
export const TOP_Y = 1.12;
export const WORK_Z1 = 0.26;
export const SEATS = [-2.0, -1.2, -0.4, 0.4, 1.2, 2.0].map((x) => new THREE.Vector3(x, 0, 1.1));
export const DOOR = new THREE.Vector3(8.0, 0, 14.2);

const shadowAll = (o, cast = true, recv = true) => o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } });

let _frameM2 = null; const frameM2 = () => _frameM2 || (_frameM2 = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.7, roughness: 0.35 }));
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function cyl(rt, rb, h, mat, seg = 24, parent) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

export function buildMaterials(renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const woodC = T.woodTexture({ base: [96, 52, 28], dark: [40, 18, 9], seed: 5 });
  const woodMap = T.tex(woodC, { repeat: [4, 1.2], aniso });
  const woodBump = T.tex(T.heightFromColor(woodC, true), { srgb: false, repeat: [4, 1.2], aniso });
  const floorC = T.woodTexture({ base: [88, 58, 36], dark: [36, 22, 14], seed: 11, planks: 8 });
  const floorMap = T.tex(floorC, { repeat: [5, 6], aniso });
  floorMap.rotation = Math.PI / 2;
  const floorBump = T.tex(T.heightFromColor(floorC, true), { srgb: false, repeat: [5, 6], aniso }); floorBump.rotation = Math.PI / 2;
  const brickC = T.brickTexture();
  const brickMap = T.tex(brickC, { repeat: [4, 2], aniso });
  const brickBump = T.tex(T.heightFromColor(brickC), { srgb: false, repeat: [4, 2], aniso });
  const panelC = T.woodTexture({ base: [60, 30, 18], dark: [24, 10, 6], seed: 9 });
  const panelMap = T.tex(panelC, { repeat: [1, 2], aniso }); panelMap.rotation = Math.PI / 2;
  const mat = T.tex(T.rubberMatTexture(), { repeat: [2, 1], aniso });
  const steelMap = T.tex(T.steelTexture(), { repeat: [1, 1], aniso, srgb: true });
  const marbleMap = T.tex(T.marbleTexture(), { repeat: [3, 0.6], aniso });
  const concMap = T.tex(T.concreteTexture(), { repeat: [4, 4], aniso });
  return {
    marble: new THREE.MeshPhysicalMaterial({ map: marbleMap, color: 0xc8c9cc, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.5 }),
    workSteel: new THREE.MeshStandardMaterial({ map: steelMap, color: 0xb9bec2, metalness: 0.9, roughness: 0.34, envMapIntensity: 1 }),
    concrete: new THREE.MeshStandardMaterial({ map: concMap, color: 0x6a6070, roughness: 0.22, metalness: 0.25, envMapIntensity: 0.9 }),
    slate: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6 }),
    barTop: new THREE.MeshPhysicalMaterial({ map: woodMap, bumpMap: woodBump, bumpScale: 0.6, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ map: panelMap, roughness: 0.6, envMapIntensity: 0.4 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x2a160d, map: panelMap, roughness: 0.55, envMapIntensity: 0.4 }),
    floor: new THREE.MeshStandardMaterial({ map: floorMap, bumpMap: floorBump, bumpScale: 0.8, roughness: 0.55, envMapIntensity: 0.35 }),
    brick: new THREE.MeshStandardMaterial({ map: brickMap, bumpMap: brickBump, bumpScale: 2.5, roughness: 0.92, envMapIntensity: 0.25 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x17110f, roughness: 0.95 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a35a, metalness: 1, roughness: 0.25 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e6e6, metalness: 1, roughness: 0.12 }),
    steel: new THREE.MeshStandardMaterial({ map: steelMap, color: 0xcfd3d6, metalness: 1, roughness: 0.3 }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ map: mat, roughness: 0.85 }),
    leather: new THREE.MeshPhysicalMaterial({ color: 0x5a1414, roughness: 0.45, sheen: 0.4, sheenColor: 0xff8a7a, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0x1b1612, metalness: 1, roughness: 0.08, envMapIntensity: 0.9 }),
    towel: new THREE.MeshPhysicalMaterial({ color: 0xe9e2d3, roughness: 0.95, sheen: 1, sheenColor: 0xffffff }),
    shelfGlass: new THREE.MeshPhysicalMaterial({ color: 0xbfe6e0, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, depthWrite: false }),
  };
}

// Warm, dim environment for reflections (bar lights glinting off glass and metal).
export function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), new THREE.MeshBasicMaterial({ color: 0x120a1c, side: THREE.BackSide }));
  env.add(room);
  const lamp = (x, y, z, w, h, c, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  lamp(0, 2.4, 0, 3, 0.6, 0xffc58a, 6);
  lamp(-2, 2.4, 1, 0.5, 0.5, 0xffb070, 10);
  lamp(2, 2.4, -1, 0.5, 0.5, 0xffb070, 10);
  lamp(0, 1, -4.9, 6, 0.4, 0xffa060, 3);
  lamp(4.9, 1.2, 0, 0.3, 1.5, 0xff4f8b, 3);
  lamp(-4.9, 1.5, 2, 2, 1, 0x6d8cff, 1.2);
  // club colors so chrome, glass and the glossy floor pick up magenta / cyan / violet
  lamp(-4.9, 3.5, -2, 3, 0.25, 0xff2bd6, 5); lamp(4.9, 3.5, 2, 3, 0.25, 0x26e0ff, 5);
  lamp(0, 4.9, 2, 4, 0.3, 0x8a3bff, 4); lamp(2, 0.3, 4.9, 3, 0.2, 0xff2b6a, 4); lamp(-2, 0.3, 4.9, 3, 0.2, 0x2bd0ff, 4);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.02);
  pm.dispose();
  return rt.texture;
}

// ------------------------------------------------------------------ bottles
const BOTTLE_SHAPES = {
  tall:    [[0.034, 0], [0.037, 0.006], [0.037, 0.22], [0.032, 0.25], [0.016, 0.275], [0.0135, 0.285], [0.0135, 0.32], [0.015, 0.322], [0.015, 0.33]],
  gin:     [[0.042, 0], [0.045, 0.006], [0.045, 0.19], [0.04, 0.205], [0.02, 0.222], [0.0135, 0.23], [0.0135, 0.28], [0.015, 0.282], [0.015, 0.29]],
  round:   [[0.036, 0], [0.04, 0.008], [0.04, 0.17], [0.036, 0.2], [0.022, 0.222], [0.014, 0.232], [0.0135, 0.275], [0.015, 0.277], [0.015, 0.285]],
  whiskey: [[0.044, 0], [0.047, 0.006], [0.047, 0.165], [0.043, 0.18], [0.02, 0.195], [0.0135, 0.205], [0.0135, 0.25], [0.016, 0.252], [0.016, 0.26]],
  tequila: [[0.034, 0], [0.038, 0.01], [0.042, 0.1], [0.04, 0.19], [0.03, 0.212], [0.015, 0.226], [0.0135, 0.27], [0.015, 0.272], [0.015, 0.28]],
  soda:    [[0.027, 0], [0.03, 0.006], [0.03, 0.11], [0.026, 0.135], [0.0135, 0.18], [0.0115, 0.2], [0.0125, 0.202], [0.0125, 0.208]],
  longneck:[[0.029, 0], [0.031, 0.006], [0.031, 0.125], [0.027, 0.15], [0.0135, 0.19], [0.0115, 0.23], [0.0128, 0.232], [0.0128, 0.238]],
  juice:   [[0.04, 0], [0.043, 0.006], [0.043, 0.17], [0.038, 0.19], [0.02, 0.21], [0.018, 0.22]],
  syrup:   [[0.03, 0], [0.033, 0.006], [0.033, 0.18], [0.026, 0.205], [0.012, 0.225], [0.011, 0.25], [0.012, 0.252]],
  squeeze: [[0.03, 0], [0.032, 0.006], [0.032, 0.13], [0.03, 0.145], [0.016, 0.155]],
  bitters: [[0.022, 0], [0.025, 0.004], [0.025, 0.095], [0.02, 0.108], [0.009, 0.118], [0.008, 0.135]],
  carafe:  [[0.036, 0], [0.038, 0.004], [0.034, 0.06], [0.03, 0.09], [0.033, 0.11], [0.036, 0.118]],
};

const labelCache = {};
export function makeBottle(id) {
  const ing = INGREDIENTS[id];
  const b = ing.bottle;
  const shape = BOTTLE_SHAPES[b.shape];
  const g = new THREE.Group();
  g.userData.ingredient = id;
  const pts = shape.map(([r, y]) => new THREE.Vector2(r, y));
  pts.unshift(new THREE.Vector2(0.0001, 0));
  const isPlastic = b.shape === 'squeeze' || b.shape === 'juice';
  const isMetal = b.shape === 'carafe';
  const glassMat = isMetal ? MAT.steel || new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 1, roughness: 0.2 }) : new THREE.MeshStandardMaterial({
    color: new THREE.Color(b.glass), roughness: isPlastic ? 0.35 : 0.08, metalness: 0.1, transparent: true,
    opacity: isPlastic ? 0.82 : 0.32 + b.tint * 0.55, envMapIntensity: 1.6, depthWrite: false,
  });
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), glassMat);
  shell.renderOrder = 6;
  shell.castShadow = true;
  g.add(shell);
  // liquid inside (visible through clear glass)
  const top = shape[shape.length - 1][1];
  if (!isMetal) {
    const fill = b.shape === 'soda' || b.shape === 'longneck' ? 0.78 : 0.62;
    const lp = [new THREE.Vector2(0.0001, 0.006)];
    for (const [r, y] of shape) { if (y > top * fill) break; if (y < 0.006) continue; lp.push(new THREE.Vector2(r * 0.9, y)); }
    const ly = top * fill; const lr = rAtShape(shape, ly) * 0.9;
    lp.push(new THREE.Vector2(lr, ly), new THREE.Vector2(0.0001, ly));
    const liq = new THREE.Mesh(new THREE.LatheGeometry(lp, 32), new THREE.MeshStandardMaterial({ color: new THREE.Color(ing.color), transparent: true, opacity: 0.25 + ing.alpha * 0.7, roughness: 0.1, depthWrite: false, emissive: new THREE.Color(ing.color).multiplyScalar(0.08) }));
    liq.renderOrder = 4;
    g.add(liq); g.userData.liq = liq;
  }
  // label
  if (b.label) {
    const key = id;
    if (!labelCache[key]) labelCache[key] = T.labelTexture({ name: ing.brand, sub: ing.name, ...b.label });
    const bodyR = shape[2][0];
    const ly0 = shape[2][1] + 0.02, ly1 = Math.min(shape[3][1] - 0.01, ly0 + bodyR * 2.0);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(bodyR + 0.0008, bodyR + 0.0008, ly1 - ly0, 40, 1, true, -Math.PI * 0.55 + Math.PI, Math.PI * 1.1),
      new THREE.MeshStandardMaterial({ map: labelCache[key], roughness: 0.5 }));
    lab.position.y = (ly0 + ly1) / 2; lab.rotation.y = Math.PI; // label faces +z
    g.add(lab);
    // neck foil band for spirits
    if (b.cap === 'pourer') {
      const ny = shape[shape.length - 3][1];
      const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.0142, 0.0142, 0.035, 20, 1, true), new THREE.MeshStandardMaterial({ color: new THREE.Color(b.label.accent), metalness: 0.7, roughness: 0.35 }));
      foil.position.y = top - 0.025; g.add(foil);
      void ny;
    }
  }
  // cap / pourer
  const spout = new THREE.Object3D();
  const steel = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.2 });
  if (b.cap === 'pourer') {
    const collar = cyl(0.0152, 0.0152, 0.012, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }), 20, g); collar.position.y = top + 0.004;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0042, 0.06, 12), steel);
    tube.position.set(-0.012, top + 0.035, 0); tube.rotation.z = 0.55; g.add(tube);
    spout.position.set(-0.028, top + 0.058, 0);
  } else if (b.cap === 'cap') {
    const c = cyl(0.0135, 0.0135, 0.008, new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.9, roughness: 0.35 }), 18, g); c.position.y = top + 0.003; g.userData.cap = c;
    spout.position.set(0, top + 0.008, 0);
  } else if (b.cap === 'squeeze') {
    const c = cyl(0.014, 0.017, 0.016, new THREE.MeshStandardMaterial({ color: 0xc6262b, roughness: 0.5 }), 18, g); c.position.y = top + 0.008;
    const n = cyl(0.002, 0.009, 0.04, new THREE.MeshStandardMaterial({ color: 0xc6262b, roughness: 0.5 }), 14, g); n.position.y = top + 0.036;
    spout.position.set(0, top + 0.056, 0);
  } else if (b.cap === 'dasher') {
    const c = cyl(0.009, 0.009, 0.02, new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.5 }), 16, g); c.position.y = top + 0.01;
    spout.position.set(0, top + 0.02, 0);
  } else {
    // carafe: handle + spout lip
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 20, Math.PI), steel); h.position.set(0.04, 0.06, 0); h.rotation.z = -Math.PI / 2; g.add(h);
    spout.position.set(-0.038, top, 0);
    const lip = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.02, 12, 1, true), steel); lip.position.set(-0.036, top - 0.004, 0); lip.rotation.z = Math.PI / 2 - 0.4; g.add(lip);
  }
  g.add(spout);
  g.userData.spout = spout;
  g.userData.height = top;
  g.userData.radius = shape[2][0];
  shadowAll(g, true, true);
  shell.receiveShadow = false;
  // hitbox
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(shape[2][0] + 0.01, shape[2][0] + 0.01, top + 0.04, 10), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (top + 0.04) / 2; g.add(hit);
  g.userData.hit = hit;
  return g;
}
function rAtShape(shape, y) {
  for (let i = 1; i < shape.length; i++) if (y <= shape[i][1]) { const t = (y - shape[i - 1][1]) / Math.max(1e-6, shape[i][1] - shape[i - 1][1]); return shape[i - 1][0] + (shape[i][0] - shape[i - 1][0]) * t; }
  return shape[shape.length - 1][0];
}

export function makeScoop(M) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x9da3a8, metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide }));
  bowl.rotation.z = Math.PI / 2; bowl.rotation.y = 0; bowl.position.set(0, 0.045, 0);
  // orient: bowl opening faces up, axis along x
  bowl.rotation.set(0, 0, Math.PI / 2);
  bowl.rotateY(Math.PI / 2);
  g.add(bowl);
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24, 0, Math.PI), bowl.material);
  back.position.set(0.065, 0.045, 0); back.rotation.set(Math.PI, Math.PI / 2, 0); g.add(back);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
  handle.rotation.z = Math.PI / 2; handle.position.set(0.12, 0.045, 0); g.add(handle);
  // ice inside the scoop
  const iceSet = new THREE.Group(); g.add(iceSet);
  g.userData.iceSet = iceSet;
  const lip = new THREE.Object3D(); lip.position.set(-0.07, 0.05, 0); g.add(lip);
  g.userData.spout = lip;
  shadowAll(g);
  void M;
  return g;
}

export function makeSpoon() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 1, roughness: 0.18 });
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 30 }, (_, i) => new THREE.Vector3(Math.sin(i * 1.3) * 0.0012, i * 0.009, Math.cos(i * 1.3) * 0.0012)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 120, 0.0022, 6), steel));
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.009, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  bowl.scale.set(1, 0.4, 1.5); bowl.rotation.x = Math.PI / 2; bowl.position.y = -0.004; g.add(bowl);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), steel); knob.position.y = 0.265; g.add(knob);
  shadowAll(g);
  return g;
}

export function makeRag(M) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.2, 0.025, 0.12, 20, 2, 12);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + Math.sin(x * 60) * 0.003 + Math.cos(z * 80 + x * 20) * 0.002); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, M.towel); m.position.y = 0.0125; g.add(m);
  // blue stripes
  for (const z of [-0.045, 0.045]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.202, 0.026, 0.008), new THREE.MeshStandardMaterial({ color: 0x2b4a8a, roughness: 0.9 })); s.position.set(0, 0.0125, z); g.add(s); }
  shadowAll(g);
  return g;
}

// ------------------------------------------------------------------ room
export function buildBar(scene, renderer) {
  mats();
  const M = buildMaterials(renderer);
  const out = { M, stations: {}, shelfSlots: [], railSlots: [], mixerSlots: [], lights: [], candles: [], neonMats: [], interact: [] };
  const root = new THREE.Group(); scene.add(root);

  // a big, tall club: 20 m wide, 17 m deep, 7 m to the ceiling
  const RW = 10, RZ0 = -2.25, RZ1 = 15, RH = 7;
  out.room = { RW, RZ0, RZ1, RH };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RZ1 - RZ0), M.concrete);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (RZ0 + RZ1) / 2); floor.receiveShadow = true; root.add(floor);
  // dark brick (Poly Haven, CC0) so grazing club light shows texture instead of flat paint
  const tl = new THREE.TextureLoader();
  const bt = (f, srgb) => { const t = tl.load('tex/' + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 2.6); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const wallM = new THREE.MeshStandardMaterial({ map: bt('brick_diff.jpg', true), normalMap: bt('brick_nor.jpg'), roughnessMap: bt('brick_rough.jpg'), color: 0x8a7a92, roughness: 0.85, metalness: 0, normalScale: new THREE.Vector2(1.2, 1.2) });
  const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RH), M.slate); wallBack.position.set(0, RH / 2, RZ0); root.add(wallBack);
  const sky = T.skylineTexture();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.6, roughness: 0.4 });
  const neonEdge = (len, col) => new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
  // side and front walls: solid wall with a high window band, neon trim at floor and ceiling, light columns
  const wall = (w, x, z, ry, off) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    const pnl = new THREE.Mesh(new THREE.PlaneGeometry(w, RH), wallM); pnl.position.set(0, RH / 2, 0); g.add(pnl);
    const tx = sky.clone(); tx.needsUpdate = true; tx.repeat.set(w / 14, 0.6); tx.offset.set(off, 0.38);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), new THREE.MeshBasicMaterial({ map: tx, fog: false, color: 0x5a5a7a })); band.position.set(0, 5.0, 0.02); g.add(band);
    for (let i = 0; i <= Math.round(w / 2); i++) box(0.1, 2.3, 0.1, frameMat, -w / 2 + i * (w / Math.round(w / 2)), 5.0, 0.06, g);
    const b1 = neonEdge(w, 0xff2bd6); b1.position.set(0, 0.06, 0.05); g.add(b1);
    const b2 = neonEdge(w, 0x26e0ff); b2.position.set(0, 3.8, 0.05); g.add(b2);
    const b3 = neonEdge(w, 0xff2bd6); b3.position.set(0, RH - 0.05, 0.05); g.add(b3);
    for (let i = 1; i < Math.round(w / 3); i++) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.6, 0.05), new THREE.MeshBasicMaterial({ color: 0xffc46a, toneMapped: false })); col.position.set(-w / 2 + i * (w / Math.round(w / 3)), 1.9, 0.06); g.add(col); }
  };
  wall(RZ1 - RZ0, -RW, (RZ0 + RZ1) / 2, Math.PI / 2, 0.1);
  wall(RZ1 - RZ0, RW, (RZ0 + RZ1) / 2, -Math.PI / 2, 0.55);
  wall(RW * 2, 0, RZ1, Math.PI, 0.3);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RZ1 - RZ0), new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, RH, (RZ0 + RZ1) / 2); root.add(ceil);
  // lighting trusses across the ceiling
  for (const z of [2, 5, 8, 11]) { box(RW * 2, 0.22, 0.22, frameMat, 0, RH - 0.5, z, root); box(RW * 2, 0.04, 0.04, frameMat, 0, RH - 0.66, z, root); }
  // balconies along both side walls with glass rails and neon
  out.balconies = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); root.add(g);
    const x = sx * (RW - 1.3);
    box(2.6, 0.25, 11.5, M.darkWood, x, 3.1, 7.6, g);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 11.5), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.18, depthWrite: false })); rail.position.set(x - sx * 1.28, 3.72, 7.6); g.add(rail);
    const top = neonEdge(11.5, 0xff2bd6); top.rotation.y = Math.PI / 2; top.position.set(x - sx * 1.28, 4.22, 7.6); g.add(top);
    const under = neonEdge(11.5, 0x26e0ff); under.rotation.y = Math.PI / 2; under.position.set(x - sx * 1.28, 2.96, 7.6); g.add(under);
    for (const z of [2.2, 5.8, 9.4, 13.0]) { const post = cyl(0.12, 0.12, 2.98, frameMat, 8, g); post.position.set(x - sx * 1.1, 1.49, z); }
    out.balconies.push({ x, sx });
  }

  // ---------------- counter
  const ctr = new THREE.Group(); root.add(ctr);
  const work = new THREE.Mesh(new RoundedBoxGeometry(COUNTER.x1 - COUNTER.x0, 0.05, WORK_Z1 - COUNTER.z0, 3, 0.01), M.workSteel);
  work.position.set(0, COUNTER_Y - 0.025, (COUNTER.z0 + WORK_Z1) / 2); work.receiveShadow = true; ctr.add(work);
  box(COUNTER.x1 - COUNTER.x0, TOP_Y - COUNTER_Y, 0.04, M.workSteel, 0, (TOP_Y + COUNTER_Y) / 2 - 0.02, WORK_Z1 + 0.02, ctr);
  const top = new THREE.Mesh(new RoundedBoxGeometry(COUNTER.x1 - COUNTER.x0 + 0.06, 0.05, COUNTER.z1 - WORK_Z1 + 0.04, 4, 0.02), M.marble);
  top.position.set(0, TOP_Y - 0.025, (WORK_Z1 + COUNTER.z1) / 2); top.receiveShadow = true; top.castShadow = true; ctr.add(top);
  out.counterTop = top;
  const nose = cyl(0.03, 0.03, COUNTER.x1 - COUNTER.x0 + 0.06, M.marble, 24, ctr); nose.rotation.z = Math.PI / 2; nose.position.set(0, TOP_Y - 0.03, COUNTER.z1);
  const led = new THREE.Mesh(new THREE.BoxGeometry(COUNTER.x1 - COUNTER.x0, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false })); led.position.set(0, TOP_Y - 0.06, COUNTER.z1 - 0.03); ctr.add(led);
  const railTray = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.03, 0.12, 2, 0.008), M.workSteel); railTray.position.set(0, 0.845, COUNTER.z0 - 0.07); ctr.add(railTray);
  box(2.0, 0.07, 0.01, M.workSteel, 0, 0.87, COUNTER.z0 - 0.13, ctr);
  // front panel with raised paneling
  box(COUNTER.x1 - COUNTER.x0, TOP_Y - 0.06, 0.06, M.wood, 0, (TOP_Y - 0.06) / 2, FRONT_Z - 0.03, ctr);
  // corbels under the overhang
  for (let i = 0; i < 9; i++) { const cb = rbox(0.05, 0.12, COUNTER.z1 - FRONT_Z - 0.03, 0.01, M.darkWood, COUNTER.x0 + 0.45 + i * 0.64, TOP_Y - 0.11, (FRONT_Z + COUNTER.z1) / 2 - 0.01, ctr); void cb; }
  for (let i = 0; i < 10; i++) {
    const x = COUNTER.x0 + 0.3 + i * 0.6;
    rbox(0.5, 0.62, 0.03, 0.01, M.darkWood, x, 0.5, FRONT_Z + 0.01, ctr);
    rbox(0.42, 0.54, 0.02, 0.008, M.wood, x, 0.5, FRONT_Z + 0.025, ctr);
  }
  box(COUNTER.x1 - COUNTER.x0, 0.08, 0.1, M.darkWood, 0, 0.04, FRONT_Z + 0.02, ctr); // kick plate
  // brass foot rail + brackets
  const rail = cyl(0.025, 0.025, COUNTER.x1 - COUNTER.x0 - 0.2, M.brass, 20, ctr); rail.rotation.z = Math.PI / 2; rail.position.set(0, 0.22, FRONT_Z + 0.16);
  for (let i = 0; i < 7; i++) { const x = COUNTER.x0 + 0.3 + i * 0.9; const br = cyl(0.01, 0.01, 0.2, M.brass, 10, ctr); br.rotation.x = Math.PI / 2; br.position.set(x, 0.22, FRONT_Z + 0.07); }
  // under-bar cabinetry on the bartender side
  box(COUNTER.x1 - COUNTER.x0, COUNTER_Y - 0.05, 0.05, M.darkWood, 0, (COUNTER_Y - 0.05) / 2, COUNTER.z0 + 0.03, ctr);
  for (let i = 0; i < 8; i++) { const x = COUNTER.x0 + 0.375 + i * 0.75; rbox(0.7, 0.75, 0.02, 0.01, M.wood, x, 0.45, COUNTER.z0 + 0.0, ctr); const h = cyl(0.006, 0.006, 0.12, M.brass, 8, ctr); h.position.set(x + 0.28, 0.65, COUNTER.z0 - 0.02); }
  // rubber bar mats
  const mat1 = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.008, 0.3, 2, 0.003), M.rubber); mat1.position.set(0.08, COUNTER_Y + 0.004, -0.1); mat1.receiveShadow = true; ctr.add(mat1);
  out.matTopY = COUNTER_Y + 0.008;

  // ---------------- LED dot panel on the bar front (faces the room)
  {
    const [dc, dg] = T.canvas(1024, 160);
    dg.fillStyle = '#05030a'; dg.fillRect(0, 0, 1024, 160);
    for (let y = 8; y < 160; y += 14) for (let x = 8; x < 1024; x += 14) {
      const w = 0.5 + 0.5 * Math.sin(x * 0.012 + y * 0.03);
      if (Math.random() < 0.25 + w * 0.5) { dg.fillStyle = `hsl(${290 + w * 70}, 95%, ${45 + Math.random() * 25}%)`; dg.beginPath(); dg.arc(x, y, 3.2, 0, 7); dg.fill(); }
    }
    const tx = T.tex(dc);
    const ledFront = new THREE.Mesh(new THREE.PlaneGeometry(COUNTER.x1 - COUNTER.x0, 0.88), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false, color: 0xbfbfbf }));
    ledFront.position.set(0, 0.52, FRONT_Z + 0.04); ctr.add(ledFront); out.ledFront = ledFront;
  }
  // ---------------- ice well
  const ice = new THREE.Group(); ice.position.set(-0.42, COUNTER_Y, -0.13); ctr.add(ice);
  const wellRim = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.02, 0.26, 2, 0.006), M.steel); wellRim.position.y = 0.008; ice.add(wellRim);
  const wellIn = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.22), new THREE.MeshStandardMaterial({ color: 0x8c949a, metalness: 1, roughness: 0.35 })); wellIn.position.y = 0.014; ice.add(wellIn);
  const iceMat = MAT.ice || null;
  const iceInst = new THREE.InstancedMesh(iceGeometry(), new THREE.MeshPhysicalMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.7, roughness: 0.2, clearcoat: 1, envMapIntensity: 0.6 }), 120);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 120; i++) { dummy.position.set((Math.random() - 0.5) * 0.27, 0.022 + Math.random() * 0.02, (Math.random() - 0.5) * 0.19); dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); dummy.updateMatrix(); iceInst.setMatrixAt(i, dummy.matrix); }
  ice.add(iceInst);
  void iceMat;
  const iceHit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.26), new THREE.MeshBasicMaterial({ visible: false })); iceHit.position.y = 0.03; ice.add(iceHit);
  // scoop resting in the well
  const scoop = makeScoop(M);
  scoop.position.set(-0.36, COUNTER_Y + 0.035, -0.06); scoop.rotation.y = -0.3; ctr.add(scoop);
  out.stations.ice = { group: ice, hit: iceHit, scoop, scoopHome: { pos: scoop.position.clone(), rot: scoop.rotation.clone(), parent: ctr } };

  // ---------------- garnish tray
  const tray = new THREE.Group(); tray.position.set(0.52, COUNTER_Y, -0.3); ctr.add(tray);
  const trayBase = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.04, 0.11, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.5 })); trayBase.position.y = 0.02; tray.add(trayBase);
  const garnishTypes = ['lime', 'orange', 'cherry', 'olive', 'mint'];
  out.stations.garnish = [];
  garnishTypes.forEach((t, i) => {
    const x = -0.168 + i * 0.084;
    const insert = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.03, 0.095), new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.4 })); insert.position.set(x, 0.028, 0); tray.add(insert);
    const pile = new THREE.Group(); pile.position.set(x, 0.044, 0); tray.add(pile);
    for (let k = 0; k < 4; k++) { const gm = makeGarnish(t); gm.scale.setScalar(0.85); gm.position.set((k % 2 - 0.5) * 0.03, 0, (Math.floor(k / 2) - 0.5) * 0.04); gm.rotation.set(t === 'olive' ? Math.PI / 2 : 0, k * 1.7, t === 'olive' ? 0.2 : 0); if (t === 'olive') gm.position.y = 0.006; pile.add(gm); }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(x, 0.04, 0); tray.add(hit);
    out.stations.garnish.push({ type: t, hit, pile });
  });

  // ---------------- spoon in a rinse tin + rag + sink
  const tin = cyl(0.03, 0.028, 0.11, M.steel, 20, ctr); tin.position.set(0.86, COUNTER_Y + 0.055, -0.3);
  const spoon = makeSpoon(); spoon.position.set(0.86, COUNTER_Y + 0.015, -0.3); spoon.rotation.z = 0.12; ctr.add(spoon);
  out.stations.spoon = { obj: spoon, home: { pos: spoon.position.clone(), rot: spoon.rotation.clone() } };
  const rag = makeRag(M); rag.position.set(-0.85, COUNTER_Y, -0.3); rag.rotation.y = 0.2; ctr.add(rag);
  out.stations.rag = { obj: rag, home: { pos: rag.position.clone(), rot: rag.rotation.clone() } };
  const sink = new THREE.Group(); sink.position.set(-2.05, COUNTER_Y, -0.16); ctr.add(sink);
  const sinkRim = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.02, 0.3, 2, 0.008), M.steel); sinkRim.position.y = 0.008; sink.add(sinkRim);
  const sinkIn = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.005, 0.26), new THREE.MeshStandardMaterial({ color: 0x5d6368, metalness: 1, roughness: 0.4 })); sinkIn.position.y = 0.019; sink.add(sinkIn);
  const drain = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), new THREE.MeshStandardMaterial({ color: 0x111, metalness: 1, roughness: 0.5 })); drain.rotation.x = -Math.PI / 2; drain.position.y = 0.022; sink.add(drain);
  const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.009, 10, 24, Math.PI), M.chrome); faucet.position.set(0, 0.09, -0.15); sink.add(faucet);
  const fpost = cyl(0.012, 0.014, 0.1, M.chrome, 12, sink); fpost.position.set(0.08, 0.05, -0.15);
  const sinkHit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), new THREE.MeshBasicMaterial({ visible: false })); sinkHit.position.y = 0.05; sink.add(sinkHit);
  out.stations.sink = { hit: sinkHit, pos: new THREE.Vector3(-2.05, COUNTER_Y, -0.16) };

  // ---------------- glass rack (stack of each type)
  const rack = new THREE.Group(); rack.position.set(-1.27, COUNTER_Y, -0.1); ctr.add(rack);
  const rackBase = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.02, 0.26, 2, 0.006), new THREE.MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.7 })); rackBase.position.y = 0.01; rack.add(rackBase);
  out.stations.glasses = [];
  ['flute', 'martini', 'coupe', 'mug', 'pint', 'highball', 'rocks', 'shot'].forEach((type, i) => {
    const x = -0.56 + i * 0.16;
    const holder = new THREE.Group(); holder.position.set(x, 0.02, 0); rack.add(holder);
    const vis = [];
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(glassGeometry(type), type === 'mug' ? new THREE.MeshStandardMaterial({ color: 0xc8744a, metalness: 1, roughness: 0.28 }) : MAT.glass);
      m.position.set(0, 0, (k - 0.5) * 0.11);
      m.renderOrder = 5; holder.add(m); vis.push(m);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.18), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.08, 0); holder.add(hit);
    out.stations.glasses.push({ type, hit, holder, vis });
  });

  // ---------------- register + tip jar
  const reg = new THREE.Group(); reg.position.set(-2.6, COUNTER_Y, 0.0); reg.rotation.y = 1.95; ctr.add(reg);
  rbox(0.34, 0.1, 0.3, 0.015, new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.4, metalness: 0.3 }), 0, 0.05, 0, reg);
  const screen = rbox(0.4, 0.27, 0.02, 0.008, new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.3 }), 0, 0.2, -0.08, reg); screen.rotation.x = -0.3; screen.position.y = 0.25;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.37, 0.24), new THREE.MeshBasicMaterial({ color: 0x3dd6a3 }));
  glow.position.set(0, 0.25, -0.064); glow.rotation.x = -0.3; reg.add(glow);
  out.registerScreen = glow;
  const regC = T.canvas(512, 330); out.registerCanvas = regC;
  glow.material = new THREE.MeshBasicMaterial({ map: T.tex(regC[0]), toneMapped: false });
  const stand = cyl(0.015, 0.02, 0.1, M.blackMetal, 10, reg); stand.position.set(0, 0.12, -0.1);
  const regHit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.32), new THREE.MeshBasicMaterial({ visible: false })); regHit.position.y = 0.15; reg.add(regHit);
  out.stations.register = { hit: regHit };

  const jar = new THREE.Group(); jar.position.set(1.9, COUNTER_Y, 0.55); jar.visible = false; ctr.add(jar);
  const jarG = new THREE.Mesh(glassGeometry('pint'), MAT.glass); jarG.scale.set(1.3, 1.1, 1.3); jarG.renderOrder = 5; jar.add(jarG);
  for (let i = 0; i < 9; i++) { const bill = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.025), new THREE.MeshStandardMaterial({ color: 0x86a86a, roughness: 0.8 })); bill.position.set((Math.random() - 0.5) * 0.04, 0.02 + i * 0.008, (Math.random() - 0.5) * 0.04); bill.rotation.set(Math.random(), Math.random() * 3, Math.random()); jar.add(bill); }
  const jarLabel = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0xf4ecdc })); jarLabel.position.y = 0.09; jar.add(jarLabel);
  out.tipJar = jar;
  out.peanuts = SEATS.map((s) => {
    const g = new THREE.Group(); g.position.set(s.x + 0.22, COUNTER_Y, 0.58); g.visible = false; ctr.add(g);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9b89a, roughness: 0.4, side: THREE.DoubleSide })); bowl.position.y = 0.045; bowl.scale.y = 0.7; g.add(bowl);
    const nutM = new THREE.MeshStandardMaterial({ color: 0xb8803e, roughness: 0.7 });
    for (let i = 0; i < 18; i++) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), nutM); n.scale.set(1, 0.8, 1.4); n.position.set((Math.random() - 0.5) * 0.05, 0.03 + Math.random() * 0.01, (Math.random() - 0.5) * 0.05); g.add(n); }
    return g;
  });

  // ---------------- rail + mixer bottle slots
  out.railSlots = [0.07, -0.07, 0.21, -0.21, 0.35, -0.35, 0.49, -0.49, 0.63, -0.63].map((x) => new THREE.Vector3(x, 0.86, COUNTER.z0 - 0.07));
  out.mixerSlots = [];
  for (let i = 0; i < 14; i++) out.mixerSlots.push(new THREE.Vector3(1.05 + (i % 7) * 0.19, COUNTER_Y, i < 7 ? -0.3 : -0.06));

  // ---------------- stools
  out.stools = SEATS.map((s, i) => {
    const g = new THREE.Group(); g.position.set(s.x, 0, s.z); root.add(g);
    const base = cyl(0.2, 0.22, 0.03, M.chrome, 32, g); base.position.y = 0.015;
    const post = cyl(0.03, 0.035, 0.72, M.chrome, 16, g); post.position.y = 0.38;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 10, 36), M.chrome); ring.rotation.x = Math.PI / 2; ring.position.y = 0.32; g.add(ring);
    for (let k = 0; k < 3; k++) { const sp = cyl(0.008, 0.008, 0.17, M.chrome, 8, g); sp.rotation.z = Math.PI / 2; sp.rotation.y = k * 2.09; sp.position.set(Math.cos(k * 2.09) * -0.085, 0.32, Math.sin(k * 2.09) * 0.085); }
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.07, 32), M.leather); seat.position.y = 0.76; g.add(seat);
    const cush = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.leather); cush.scale.y = 0.18; cush.position.y = 0.795; g.add(cush);
    const piping = new THREE.Mesh(new THREE.TorusGeometry(0.198, 0.006, 8, 40), M.brass); piping.rotation.x = Math.PI / 2; piping.position.y = 0.795; g.add(piping);
    shadowAll(g);
    g.visible = i === 2 || i === 3 || i === 1;
    return g;
  });

  // ---------------- pendant lamps over the bar
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1a3a2f, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffb062, emissiveIntensity: 6 });
  [-1.6, -0.55, 0.55, 1.6].forEach((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 2.25, 0.22); root.add(g); (out.pendants = out.pendants || []).push(g);
    const cord = cyl(0.004, 0.004, 4.7, M.blackMetal, 6, g); cord.position.y = 2.4;
    const shade = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.02, 0.12), new THREE.Vector2(0.05, 0.1), new THREE.Vector2(0.12, 0.02), new THREE.Vector2(0.17, -0.06)], 32), shadeMat); g.add(shade);
    const inner = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.019, 0.119), new THREE.Vector2(0.049, 0.099), new THREE.Vector2(0.119, 0.019), new THREE.Vector2(0.169, -0.061)], 32), new THREE.MeshStandardMaterial({ color: 0xf6e7c8, emissive: 0x6a4a20, emissiveIntensity: 0.6, side: THREE.BackSide })); g.add(inner);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), bulbMat); bulb.scale.y = 1.3; bulb.position.y = -0.01; g.add(bulb);
    const sp = new THREE.SpotLight(0xffe2c0, 2.2, 0, 0.85, 0.7, 1.6);
    sp.position.set(x, 2.2, 0.22); sp.target.position.set(x, 0, 0.15);
    if (false) { sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0004; sp.shadow.normalBias = 0.02; sp.shadow.radius = 4; }
    out.lights.push(sp);
  });

  // ---------------- back bar
  const bb = new THREE.Group(); bb.position.set(0, 0, -2.0); root.add(bb);
  box(6.0, 0.95, 0.5, M.darkWood, 0, 0.475, 0, bb);
  for (let i = 0; i < 8; i++) rbox(0.68, 0.7, 0.02, 0.01, M.wood, -2.62 + i * 0.75, 0.45, 0.26, bb);
  const bbTop = rbox(6.1, 0.04, 0.56, 0.01, M.barTop, 0, 0.97, 0.02, bb);
  void bbTop;
  // mirror + backlight panel
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.7), M.mirror); mirror.position.set(0, 1.85, -0.19); bb.add(mirror);
  // backlit wall behind the bottles: purple-to-pink glow, like a club back bar
  {
    const [bc, bg] = T.canvas(512, 256);
    const grd = bg.createLinearGradient(0, 256, 0, 0); grd.addColorStop(0, '#ff2bd6'); grd.addColorStop(0.5, '#7a2bff'); grd.addColorStop(1, '#1b0a4a');
    bg.fillStyle = grd; bg.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 40; i++) { bg.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; bg.fillRect(Math.random() * 512, 0, 2, 256); }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.68), new THREE.MeshBasicMaterial({ map: T.tex(bc), color: 0x9a8aa8, toneMapped: false }));
    back.position.set(0, 1.86, -0.18); bb.add(back); out.backGlow = back;
  }
  const glowPanel = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false }));
  // uprights
  for (const x of [-2.9, -1.45, 0, 1.45, 2.9]) {
    rbox(0.08, 1.75, 0.3, 0.01, M.darkWood, x, 1.85, -0.05, bb);
    // golden light tubes on each upright
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xffc46a, toneMapped: false })); tube.position.set(x, 1.85, 0.11); bb.add(tube);
  }
  rbox(6.0, 0.14, 0.4, 0.01, M.darkWood, 0, 2.76, -0.02, bb); // crown
  const shelfYs = [1.32, 1.72];
  const stripCols = [0xff2bd6, 0x26e0ff, 0xff2bd6];
  [...shelfYs, 2.12].forEach((y, si) => {
    const sh = new THREE.Mesh(new RoundedBoxGeometry(5.7, 0.02, 0.26, 2, 0.006), M.shelfGlass); sh.position.set(0, y, 0); sh.renderOrder = 2; bb.add(sh);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: stripCols[si], toneMapped: false })); strip.position.set(0, y - 0.018, 0.12); bb.add(strip);
    const brk = box(5.7, 0.012, 0.012, M.brass, 0, y + 0.006, 0.13, bb); void brk;
  });
  const glowLow = glowPanel.clone(); glowLow.position.set(0, 1.0, -0.17); bb.add(glowLow);
  // top shelf: a full row of bottles as one instanced mesh (cheap) in club colours
  {
    const pts = [[0, 0], [0.032, 0], [0.034, 0.005], [0.034, 0.17], [0.014, 0.22], [0.012, 0.27], [0.0001, 0.27]].map(([r, y]) => new THREE.Vector2(r, y));
    const inst = new THREE.InstancedMesh(new THREE.LatheGeometry(pts, 8), new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.1, emissive: 0x220a30 }), 30);
    const d = new THREE.Object3D(); const cols = [0x7a3b12, 0x2e6b3a, 0xd9e6ee, 0x8a1020, 0x3a1a6a, 0xc79a2a, 0x1a4a7a];
    for (let i = 0; i < 30; i++) { d.position.set(-2.75 + i * 0.19 + (Math.random() - 0.5) * 0.03, 2.13, (Math.random() - 0.5) * 0.06 - 2.0); d.scale.setScalar(0.85 + Math.random() * 0.3); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); inst.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
    root.add(inst);
  }
  // shelf lights
  for (const x of [-2, 0, 2]) { const pl = new THREE.PointLight(0xffa860, 1.1, 2.6, 2); pl.position.set(x, 1.55, -1.92); void pl; }
  // shelf slots (world)
  out.shelfSlots = [];
  for (const y of [COUNTER_Y - 0.03, ...shelfYs.map((s) => s + 0.01)]) {
    const z = y < 1.2 ? -1.86 : -2.0;
    for (let i = 0; i < 16; i++) { const x = -2.6 + i * 0.345; out.shelfSlots.push(new THREE.Vector3(x, y, z)); }
  }

  // neon sign
  const neonMat = new THREE.MeshBasicMaterial({ map: T.neonTexture('Last Call', '#ff4f8b'), transparent: true, toneMapped: false, color: 0xffffff });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), neonMat); neon.position.set(0, 4.6, -2.2); root.add(neon);
  out.neonMats.push(neonMat);
  const nl = new THREE.PointLight(0xff4f8b, 2.2, 4, 2); nl.position.set(0, 2.8, -1.9); root.add(nl);
  const neonBack = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.68, 0.02, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.3, transparent: true, opacity: 0.6 })); neonBack.position.set(0, 4.6, -2.215); neonBack.scale.set(2.3, 2.1, 1); root.add(neonBack);

  // ---------------- chalkboard menu (right wall near the bar)
  const chalk = T.canvas(768, 1024);
  out.chalk = chalk;
  const chalkMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), chalkMat); board.position.set(9.96, 1.8, 0.4); board.rotation.y = -Math.PI / 2; root.add(board);
  const frame = rbox(0.06, 1.3, 1.0, 0.01, M.darkWood, 9.98, 1.8, 0.4, root); void frame;
  out.chalkMat = chalkMat;
  out.updateChalk = (unlockedTiers) => {
    const lines = RECIPES.filter((r) => r.tier <= unlockedTiers).map((r) => [r.name, r.price]);
    const c = T.chalkboardCanvas(lines);
    if (chalkMat.map) chalkMat.map.dispose();
    chalkMat.map = T.tex(c); chalkMat.needsUpdate = true;
  };

  // ---------------- windows on the front wall with the city outside
  const city = T.cityTexture();
  // window neon (upgrade)
  const openMat = new THREE.MeshBasicMaterial({ map: T.neonTexture('OPEN', '#45d4ff', 512, 256, 'bold 170px "Manrope", Arial, sans-serif'), transparent: true, toneMapped: false });
  const openSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), openMat); openSign.position.set(-4, 5.0, 14.9); openSign.rotation.y = Math.PI; openSign.visible = false; root.add(openSign);
  out.openSign = openSign;
  const openLight = new THREE.PointLight(0x45d4ff, 0, 3.5, 2); openLight.position.set(-3.2, 1.9, 6.1); out.openLight = openLight;
  // door
  const door = new THREE.Group(); door.position.set(8.0, 0, 14.95); root.add(door);
  rbox(1.0, 2.2, 0.06, 0.01, M.darkWood, 0, 1.1, 0, door);
  const dwin = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshBasicMaterial({ map: city, color: 0x6a6a80 })); dwin.position.set(0, 1.5, -0.035); dwin.rotation.y = Math.PI; door.add(dwin);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), M.brass); knob.position.set(-0.38, 1.0, -0.06); door.add(knob);
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.14), new THREE.MeshBasicMaterial({ color: 0x2bd96b, toneMapped: false })); exitSign.position.set(8.0, 2.45, 14.9); exitSign.rotation.y = Math.PI; root.add(exitSign);

  // ---------------- tables with candles
  const tableSpots = [[-6.8, 3.2], [6.0, 9.5], [-6.8, 8.0]];
  out.tableSpots = tableSpots;
  out.tables = [];
  for (const [x, z] of tableSpots) {
    const t = new THREE.Group(); t.position.set(x, 0, z); root.add(t); out.tables.push(t);
    const ttop = cyl(0.42, 0.42, 0.04, M.barTop, 40, t); ttop.position.y = 0.74;
    const tp = cyl(0.04, 0.05, 0.72, M.blackMetal, 12, t); tp.position.y = 0.37;
    const tb = cyl(0.25, 0.28, 0.03, M.blackMetal, 24, t); tb.position.y = 0.015;
    // chairs
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI + 0.4;
      const ch = new THREE.Group(); ch.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7); ch.rotation.y = -a - Math.PI / 2; t.add(ch);
      rbox(0.42, 0.05, 0.42, 0.01, M.wood, 0, 0.46, 0, ch);
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const l = cyl(0.018, 0.015, 0.46, M.darkWood, 8, ch); l.position.set(lx, 0.23, lz); }
      rbox(0.42, 0.42, 0.04, 0.01, M.wood, 0, 0.72, -0.2, ch);
    }
    // candle in a glass
    const cg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xc2401a, transparent: true, opacity: 0.55, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })); cg.position.y = 0.8; t.add(cg);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false })); flame.scale.y = 2; flame.position.y = 0.81; t.add(flame);
    const pl = new THREE.PointLight(0xff8a3a, 0.5, 2.2, 2); pl.position.set(x, 0.92, z);
    out.candles.push({ light: pl, flame });
    shadowAll(t);
  }

  // ---------------- jukebox (upgrade)
  const jb = new THREE.Group(); jb.position.set(-5.2, 0, 1.4); jb.rotation.y = Math.PI / 2; jb.visible = false; root.add(jb);
  rbox(0.8, 1.2, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0x5a1d0e, roughness: 0.3, metalness: 0.2 }), 0, 0.6, 0, jb);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 12, 30, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false })); arch.position.set(0, 1.2, 0.2); jb.add(arch);
  const jbGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), new THREE.MeshBasicMaterial({ color: 0xff5ab0, toneMapped: false, transparent: true, opacity: 0.7 })); jbGlass.position.set(0, 0.85, 0.252); jb.add(jbGlass);
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), new THREE.MeshBasicMaterial({ color: [0x45d4ff, 0xffd040, 0x7cff6a][i % 3], toneMapped: false })); t.position.set(-0.25 + i * 0.1, 0.35, 0.255); jb.add(t); }
  const jl = new THREE.PointLight(0xff7a40, 0, 3, 2); jl.position.set(-4.9, 1.0, 1.4);
  out.jukebox = jb; out.jukeLight = jl;

  // potted plants by the windows
  for (const x of [-4.6, 2.2]) {
    const p = new THREE.Group(); p.position.set(x, 0, 6.1); root.add(p);
    const pot = cyl(0.18, 0.14, 0.35, new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.8 }), 20, p); pot.position.y = 0.175;
    const leafM = new THREE.MeshStandardMaterial({ color: 0x24502a, roughness: 0.6, side: THREE.DoubleSide });
    for (let k = 0; k < 22; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), leafM); leaf.scale.set(0.35, 0.05, 1);
      const a = k * 2.4, h = 0.45 + (k % 5) * 0.13;
      leaf.position.set(Math.cos(a) * 0.15, h, Math.sin(a) * 0.15); leaf.rotation.set(0.6, -a, 0.2); p.add(leaf);
    }
  }

  // ---------------- draft beer tower: spouts hang right over the glass on the mat
  {
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.15 });
    const tw = new THREE.Group(); root.add(tw);
    const col = cyl(0.028, 0.034, 0.36, chrome, 12, tw); col.position.set(0, COUNTER_Y + 0.18, 0.2);
    const arm = cyl(0.02, 0.02, 0.32, chrome, 10, tw); arm.rotation.x = Math.PI / 2; arm.position.set(0, COUNTER_Y + 0.36, 0.05);
    const capT = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), chrome); capT.position.set(0, COUNTER_Y + 0.36, 0.2); tw.add(capT);
    out.taps = [];
    [['draft', 0.022, 0xe0a52a, 'Lager'], ['stout', -0.022, 0x1b1b1b, 'Stout']].forEach(([id, x, col2]) => {
      const sp = cyl(0.006, 0.008, 0.05, chrome, 8, tw); sp.position.set(x, COUNTER_Y + 0.33, -0.1);
      const piv = new THREE.Group(); piv.position.set(x, COUNTER_Y + 0.375, -0.05); tw.add(piv);
      const knob = cyl(0.012, 0.016, 0.12, new THREE.MeshStandardMaterial({ color: col2, roughness: 0.4, flatShading: true }), 6, piv); knob.position.y = 0.06;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), knob.material); ball.position.y = 0.125; piv.add(ball);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.17, 0.05), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.07; piv.add(hit);
      out.taps.push({ id, piv, hit, spout: new THREE.Vector3(x, COUNTER_Y + 0.3, -0.1) });
    });
  }
  // ---------------- bottle opener on the splash guard
  {
    const op = new THREE.Group(); op.position.set(0.36, COUNTER_Y + 0.07, WORK_Z1 + 0.0); root.add(op);
    rbox(0.05, 0.08, 0.012, 0.004, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.3 }), 0, 0, 0, op);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.014), new THREE.MeshBasicMaterial({ color: 0x111111 })); slot.position.y = 0.012; op.add(slot);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.06), new THREE.MeshBasicMaterial({ visible: false })); op.add(hit);
    out.opener = { group: op, hit };
  }
  // ---------------- upright glass-door fridge at the right end of the back bar
  {
    const fr = new THREE.Group(); fr.position.set(3.5, 0, -1.15); fr.rotation.y = -Math.PI / 2; root.add(fr);
    const bodyM = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.4, flatShading: true });
    const w = 0.72, h = 1.9, d = 0.6;
    box(w, 0.06, d, bodyM, 0, h - 0.03, 0, fr); box(w, 0.12, d, bodyM, 0, 0.06, 0, fr);
    box(0.04, h, d, bodyM, -w / 2 + 0.02, h / 2, 0, fr); box(0.04, h, d, bodyM, w / 2 - 0.02, h / 2, 0, fr);
    box(w, h, 0.03, bodyM, 0, h / 2, -d / 2 + 0.015, fr);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.25), new THREE.MeshBasicMaterial({ color: 0xdff4ff, toneMapped: false })); glow.position.set(0, h / 2, -d / 2 + 0.035); fr.add(glow);
    const signC = T.canvas(256, 64); signC[1].fillStyle = '#0b2b44'; signC[1].fillRect(0, 0, 256, 64); signC[1].fillStyle = '#9fe8ff'; signC[1].font = 'bold 40px Arial'; signC[1].textAlign = 'center'; signC[1].fillText('ICE COLD', 128, 46);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, 0.1), new THREE.MeshBasicMaterial({ map: T.tex(signC[0]), toneMapped: false })); sign.position.set(0, h - 0.1, d / 2 + 0.002); fr.add(sign);
    const shelfM = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.7, roughness: 0.4 });
    const shelfYs = [0.42, 0.78, 1.14, 1.5];
    for (const y of shelfYs) box(w - 0.08, 0.012, d - 0.08, shelfM, 0, y, 0.01, fr);
    // door hinged on the left
    const pivot = new THREE.Group(); pivot.position.set(-w / 2, 0, d / 2); fr.add(pivot);
    const doorM = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false });
    const door = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, h - 0.14, 0.02), doorM); door.position.set(w / 2, h / 2 + 0.02, 0.01); door.renderOrder = 6; pivot.add(door);
    const frameM = bodyM;
    box(0.04, h - 0.14, 0.03, frameM, 0.02, h / 2 + 0.02, 0.012, pivot); box(0.04, h - 0.14, 0.03, frameM, w - 0.03, h / 2 + 0.02, 0.012, pivot);
    box(w - 0.02, 0.04, 0.03, frameM, w / 2, 0.15, 0.012, pivot); box(w - 0.02, 0.04, 0.03, frameM, w / 2, h - 0.1, 0.012, pivot);
    const handle = cyl(0.01, 0.01, 0.5, new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 }), 8, pivot); handle.position.set(w - 0.07, 1.0, 0.05);
    const doorHit = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.14, 0.06), new THREE.MeshBasicMaterial({ visible: false })); doorHit.position.copy(door.position); pivot.add(doorHit);
    // stock: each item gets a spot on a shelf
    const ids = Object.keys(ITEMS);

    out.fridge = { group: fr, pivot, doorHit, items: [], open: 0, isOpen: false };
    ids.forEach((id, i) => {
      const y = [1.5, 1.14, 0.78][Math.floor(i / 3)];
      const grp = new THREE.Group(); grp.position.set(((i % 3) - 1) * 0.215, y + 0.006, 0.02); fr.add(grp);
      for (let k = 0; k < 3; k++) { const m = makeItem(id); m.position.set(0, 0, 0.14 - k * 0.11); grp.add(m); }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.45), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.13; grp.add(hit);
      out.fridge.items.push({ id, grp, hit });
    });
  }

  // ---------------- NIGHT CLUB: light-up dance floor, DJ booth, disco ball, moving beams
  const club = {}; out.club = club;
  {
    const NX = 14, NZ = 10, S = 0.48;
    const fl = new THREE.InstancedMesh(new THREE.BoxGeometry(S - 0.02, 0.03, S - 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NX * NZ);
    const dd = new THREE.Object3D(); let n = 0;
    club.floorC = { x: -0.3, z: 7.0, NX, NZ, S };
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { dd.position.set(-0.3 + (i - (NX - 1) / 2) * S, 0.016, 7.0 + (j - (NZ - 1) / 2) * S); dd.updateMatrix(); fl.setMatrixAt(n, dd.matrix); fl.setColorAt(n, new THREE.Color(0x222222)); n++; }
    root.add(fl); club.floor = fl;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(NX * S + 0.12, 0.025, NZ * S + 0.12), new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.8, roughness: 0.3 })); edge.position.set(-0.3, 0.0125, 7.0); root.add(edge);
    // DJ booth against the front windows
    // raised DJ stage
    { const stM = new THREE.MeshStandardMaterial({ color: 0x0e0c14, roughness: 0.4, metalness: 0.4 }); box(9, 0.6, 3.4, stM, -0.3, 0.3, 13.1, root);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(9, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x26e0ff, toneMapped: false })); lip.position.set(-0.3, 0.6, 11.4); root.add(lip);
      for (const k of [0, 1, 2]) { const st = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.3), stM); st.position.set(-0.3, 0.1 + k * 0.2, 11.25 - (2 - k) * 0.3); root.add(st); } }
    const dj = new THREE.Group(); dj.position.set(-0.3, 0.6, 12.4); dj.rotation.y = Math.PI; root.add(dj); club.dj = dj;
    const blackM = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.5, flatShading: true });
    rbox(1.8, 0.22, 0.25, 0.02, blackM, 0, 0.11, 0.2, dj);
    rbox(1.8, 1.0, 0.6, 0.03, blackM, 0, 0.5, -0.05, dj);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.12), new THREE.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false })); strip.position.set(0, 0.62, 0.252); dj.add(strip); club.djStrip = strip;
    const djSignC = T.canvas(512, 128); djSignC[1].clearRect(0, 0, 512, 128); djSignC[1].font = 'bold 96px Arial'; djSignC[1].textAlign = 'center'; djSignC[1].fillStyle = '#26e0ff'; djSignC[1].shadowColor = '#26e0ff'; djSignC[1].shadowBlur = 20; djSignC[1].fillText('D J', 256, 96);
    const djSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: T.tex(djSignC[0]), transparent: true, toneMapped: false })); djSign.position.set(0, 0.36, 0.26); dj.add(djSign);
    for (const x of [-0.45, 0.45]) {
      const deck = cyl(0.16, 0.16, 0.03, new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.4 }), 16, dj); deck.position.set(x, 1.015, -0.05);
      const rec = cyl(0.13, 0.13, 0.008, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 }), 16, dj); rec.position.set(x, 1.035, -0.05); club['rec' + (x < 0 ? 'L' : 'R')] = rec;
      const lbl = cyl(0.04, 0.04, 0.01, new THREE.MeshBasicMaterial({ color: x < 0 ? 0xff2bd6 : 0x26e0ff }), 10, dj); lbl.position.set(x, 1.04, -0.05);
    }
    rbox(0.3, 0.05, 0.25, 0.01, new THREE.MeshStandardMaterial({ color: 0x33333a, metalness: 0.6 }), 0, 1.025, -0.05, dj);
    // speaker stacks
    club.cones = [];
    for (const x of [-1.35, 1.35]) {
      const sp = new THREE.Group(); sp.position.set(x, 0, 0); dj.add(sp);
      rbox(0.6, 1.6, 0.55, 0.02, blackM, 0, 0.8, 0, sp);
      for (const [y, r] of [[0.45, 0.22], [1.05, 0.22], [1.45, 0.09]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 16), new THREE.MeshStandardMaterial({ color: 0x555560, metalness: 0.8 })); ring.position.set(0, y, 0.28); sp.add(ring);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.95, 0.08, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d1d22, side: THREE.DoubleSide })); cone.rotation.x = -Math.PI / 2; cone.position.set(0, y, 0.26); sp.add(cone); club.cones.push(cone);
      }
    }
    // disco ball
    const ballM = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.08, flatShading: true });
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), ballM); ball.position.set(-0.3, 5.3, 7.0); root.add(ball); club.ball = ball;
    const wire = cyl(0.008, 0.008, 1.2, new THREE.MeshBasicMaterial({ color: 0x111111 }), 4, root); wire.position.set(-0.3, 6.4, 7.0);
    // sweeping light beams (additive cones) from rigs over the floor
    club.beams = [];
    // gradient textures made once: beam falloff and a soft round glow
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 128; const gx = gc.getContext('2d');
    const lg = gx.createLinearGradient(0, 0, 0, 128); lg.addColorStop(0, '#fff'); lg.addColorStop(0.35, '#888'); lg.addColorStop(1, '#000'); gx.fillStyle = lg; gx.fillRect(0, 0, 4, 128);
    const beamFade = new THREE.CanvasTexture(gc);
    const dc = document.createElement('canvas'); dc.width = dc.height = 64; const dx = dc.getContext('2d');
    const rg = dx.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); dx.fillStyle = rg; dx.fillRect(0, 0, 64, 64);
    const softDot = new THREE.CanvasTexture(dc);
    const beamCols = [0xff2bd6, 0x26e0ff, 0x8a3bff, 0x2bff88, 0xffd02b, 0xff2b4a];
    for (let i = 0; i < 6; i++) {
      const piv = new THREE.Group(); piv.position.set(-4.3 + i * 1.6, 6.3, i % 2 ? 5 : 8); root.add(piv);
      const g = new THREE.ConeGeometry(1.0, 6.4, 16, 1, true); g.translate(0, -3.2, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: beamCols[i], alphaMap: beamFade, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      const lens = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: beamCols[i], blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.9 })); lens.scale.setScalar(0.7); lens.position.y = -0.1; piv.add(lens);
      piv.add(m);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8), blackM); piv.add(head);
      club.beams.push({ piv, m, ph: i * 1.3, col: beamCols[i] });
    }
    // dancing light spots on the floor
    club.spots = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: softDot, color: beamCols[i % 6], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      sp.rotation.x = -Math.PI / 2; sp.position.y = 0.04; root.add(sp); club.spots.push({ m: sp, ph: i * 0.77 });
    }
    // lasers over the crowd
    // drifting smoke layers over the dance floor (scrolled + tinted to the beat in updateClub)
    const sc = document.createElement('canvas'); sc.width = sc.height = 256; const sx = sc.getContext('2d');
    sx.fillStyle = '#000'; sx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 20 + Math.random() * 60; for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { const g2 = sx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); g2.addColorStop(0, 'rgba(255,255,255,0.22)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); sx.fillStyle = g2; sx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } }
    club.haze = [1.7, 3.1, 4.6].map((y, i) => {
      const tx = new THREE.CanvasTexture(sc); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(2 + i, 1.5 + i * 0.5);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(-0.3, y, 7.6); m.renderOrder = 8; root.add(m); return m;
    });
    // LED grid across the ceiling: one instanced mesh, rippling with the music
    {
      const NX = 20, NZ = 15, geo = new THREE.BoxGeometry(0.18, 0.03, 0.18);
      const ceil = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NX * NZ);
      const mm = new THREE.Matrix4(); let k = 0;
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { mm.makeTranslation(-9.5 + i * 1.0, 6.96, -0.5 + j * 1.05); ceil.setMatrixAt(k, mm); ceil.setColorAt(k++, new THREE.Color(0x101010)); }
      root.add(ceil); club.ceil = ceil; club.ceilNX = NX;
    }
    // LED video wall behind the DJ, drawn to a small canvas in time with the beat
    {
      const vc = document.createElement('canvas'); vc.width = 256; vc.height = 112; const v = vc.getContext('2d');
      const vt = new THREE.CanvasTexture(vc); vt.colorSpace = THREE.SRGBColorSpace; vt.minFilter = THREE.LinearFilter;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.15), new THREE.MeshBasicMaterial({ map: vt, toneMapped: false, fog: false }));
      screen.position.set(-0.3, 2.75, 14.88); screen.rotation.y = Math.PI; root.add(screen);
      box(7.5, 0.12, 0.12, frameM2(), -0.3, 4.38, 14.85, root); box(7.5, 0.12, 0.12, frameM2(), -0.3, 1.12, 14.85, root);
      club.wall = screen;
      club.drawWall = (b, kick, t) => {
        const W = 256, H = 112, mode = Math.floor(b.n / 32) % 3, hue = ((b.n >> 2) * 61) % 360;
        v.fillStyle = '#05030a'; v.fillRect(0, 0, W, H);
        if (mode === 0) { // tunnel of rings rushing outward
          for (let i = 8; i >= 0; i--) { const r = ((i + b.ph) / 8) ** 2 * 170; v.strokeStyle = `hsl(${(hue + i * 25) % 360},95%,${45 + 20 * kick}%)`; v.lineWidth = 3 + i; v.strokeRect(W / 2 - r, H / 2 - r * 0.55, r * 2, r * 1.1); }
        } else if (mode === 1) { // equalizer
          for (let i = 0; i < 32; i++) { const h = (0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + t * 3 + Math.sin(i * 1.3 + t)))) * H * (0.5 + 0.5 * kick); v.fillStyle = `hsl(${(hue + i * 6) % 360},95%,55%)`; v.fillRect(i * 8 + 1, H - h, 6, h); }
        } else { // club name pulsing
          v.fillStyle = `hsl(${hue},90%,${12 + 10 * kick}%)`; v.fillRect(0, 0, W, H);
          v.font = 'bold 44px Impact, sans-serif'; v.textAlign = 'center'; v.textBaseline = 'middle';
          v.shadowColor = `hsl(${(hue + 180) % 360},100%,60%)`; v.shadowBlur = 12 + 20 * kick; v.fillStyle = '#fff'; v.fillText('LAST CALL', W / 2, H / 2); v.shadowBlur = 0;
        }
        // LED pixel grid
        v.fillStyle = 'rgba(0,0,0,0.45)'; for (let x = 0; x < W; x += 4) v.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 4) v.fillRect(0, y, W, 1);
        vt.needsUpdate = true;
      };
    }
    // line-array speaker stacks flown from the front truss either side of the stage
    {
      const cab = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6, metalness: 0.3 });
      const grille = new THREE.MeshStandardMaterial({ color: 0x18181e, roughness: 0.9, metalness: 0.1 });
      for (const sx2 of [-1, 1]) {
        const g = new THREE.Group(); g.position.set(-0.3 + sx2 * 4.4, 6.35, 12.2); root.add(g);
        for (let i = 0; i < 6; i++) {
          const c = box(1.1, 0.34, 0.6, cab, 0, -i * 0.36, 0, g); c.rotation.x = -i * 0.05;
          const f = box(1.0, 0.26, 0.02, grille, 0, -i * 0.36, -0.31, g); f.rotation.x = -i * 0.05;
        }
        box(0.03, 0.6, 0.03, frameM2(), -0.4, 0.4, 0, g); box(0.03, 0.6, 0.03, frameM2(), 0.4, 0.4, 0, g);
      }
    }
    club.lasers = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 16), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2bff88 : 0xff2b4a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, toneMapped: false }));
      const piv = new THREE.Group(); piv.position.set(-0.3, 3.4, 12.4); piv.add(l); l.position.z = -8; root.add(piv); club.lasers.push({ piv, ph: i * 0.8 });
    }
  }

  // ---------------- geometric neon frames on the ceiling
  out.neonFrames = [];
  const neonFrame = (cx, cz, sizes, color, rot, y = 3.05) => {
    const g = new THREE.Group(); g.position.set(cx, y, cz); g.rotation.y = rot; root.add(g);
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    sizes.forEach((sz, k) => {
      const sq = new THREE.Group(); sq.rotation.y = k * 0.35; sq.position.y = -k * (y > 4 ? 0.35 : 0.12); g.add(sq);
      for (let e = 0; e < 4; e++) { const b = new THREE.Mesh(new THREE.BoxGeometry(sz, 0.018, 0.018), m); const a = e * Math.PI / 2; b.position.set(Math.sin(a) * sz / 2, 0, Math.cos(a) * sz / 2); b.rotation.y = a; sq.add(b); }
    });
    out.neonFrames.push({ g, m, base: new THREE.Color(color) });
  };
  neonFrame(-1.6, 0.25, [1.3, 0.95, 0.6], 0xffc46a, 0.3);
  neonFrame(1.6, 0.25, [1.3, 0.95, 0.6], 0xffc46a, -0.3);
  neonFrame(-0.3, 7.0, [6.0, 4.6, 3.2], 0xff2bd6, 0, 6.0);
  // pink neon wall writing
  {
    const nm = new THREE.MeshBasicMaterial({ map: T.neonTexture('cocktails', '#ff4fd8', 1024, 256, 'italic bold 140px "Limelight", Georgia, serif'), transparent: true, toneMapped: false });
    const n = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), nm); n.position.set(-9.95, 2.4, 4.5); n.scale.setScalar(1.6); n.rotation.y = Math.PI / 2; root.add(n);
  }

  // ---------------- room decor (always on): low-poly trees in planters by the windows
  {
    const potM = new THREE.MeshStandardMaterial({ color: 0x2d2f33, roughness: 0.7, flatShading: true });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x2f7a46, roughness: 0.8, flatShading: true });
    const leafM2 = new THREE.MeshStandardMaterial({ color: 0x3f9a55, roughness: 0.8, flatShading: true });
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.9, flatShading: true });
    for (const [x, z, sc] of [[-9.3, -1.5, 1.2], [9.3, -1.5, 1.3], [-9.3, 14.3, 1.4], [9.3, 14.3, 1.1], [-4.5, 14.4, 1.2]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(sc); root.add(g);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 6), potM); pot.position.y = 0.25; g.add(pot);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.9, 5), trunkM); tr.position.y = 0.9; g.add(tr);
      for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.42 - k * 0.1, 0.7, 6), k % 2 ? leafM2 : leafM); c.position.y = 1.2 + k * 0.38; c.rotation.y = k; g.add(c); }
    }
  }
  // ---------------- buyable decor
  out.decor = {};
  {
    // string lights: catenary wires with bulbs (one instanced draw call)
    const g = new THREE.Group(); g.visible = false; root.add(g); out.decor.lights = g;
    const wireM = new THREE.LineBasicMaterial({ color: 0x111111 });
    const pts = [];
    const runs = [[-5.4, 1.2, 5.4, 1.2], [-5.4, 2.8, 5.4, 2.8], [-5.4, 4.4, 5.4, 4.4], [-5.4, 6.0, 5.4, 6.0], [-4.5, 1.0, -4.5, 6.2], [0, 1.0, 0, 6.2], [4.5, 1.0, 4.5, 6.2]];
    for (const [x0, z0, x1, z1] of runs) {
      const line = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; const p = new THREE.Vector3(x0 + (x1 - x0) * t, 3.15 - Math.sin(t * Math.PI) * 0.45, z0 + (z1 - z0) * t); line.push(p); if (i % 2 === 1) pts.push(p); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wireM));
    }
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false }), pts.length);
    const d = new THREE.Object3D();
    pts.forEach((p, i) => { d.position.copy(p).add(new THREE.Vector3(0, -0.05, 0)); d.updateMatrix(); bulbs.setMatrixAt(i, d.matrix); bulbs.setColorAt(i, new THREE.Color(0xffd28a)); });
    g.add(bulbs); out.decor.bulbs = bulbs;
  }
  {
    // lounge sofas by the right-hand windows
    const g = new THREE.Group(); g.visible = false; root.add(g); out.decor.sofas = g;
    const vel = new THREE.MeshStandardMaterial({ color: 0x1f6f78, roughness: 0.9, flatShading: true });
    const cush = new THREE.MeshStandardMaterial({ color: 0xe8b04a, roughness: 0.9, flatShading: true });
    const legM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.6, flatShading: true });
    for (const z of [2.8, 5.8]) {
      const s = new THREE.Group(); s.position.set(9.4, 0, z); s.rotation.y = -Math.PI / 2; g.add(s);
      rbox(1.9, 0.38, 0.8, 0.06, vel, 0, 0.3, 0, s); rbox(1.9, 0.5, 0.2, 0.06, vel, 0, 0.62, -0.32, s);
      rbox(0.2, 0.32, 0.8, 0.06, vel, -0.95, 0.55, 0, s); rbox(0.2, 0.32, 0.8, 0.06, vel, 0.95, 0.55, 0, s);
      for (const x of [-0.5, 0.5]) { const c = rbox(0.4, 0.34, 0.12, 0.05, cush, x, 0.68, -0.18, s); c.rotation.x = -0.25; }
      for (const [x, zz] of [[-0.85, -0.3], [0.85, -0.3], [-0.85, 0.3], [0.85, 0.3]]) { const l = cyl(0.025, 0.02, 0.12, legM, 6, s); l.position.set(x, 0.06, zz); }
      const tbl = new THREE.Group(); tbl.position.set(8.45, 0, z); g.add(tbl);
      rbox(0.9, 0.05, 0.55, 0.02, wood, 0, 0.42, 0, tbl);
      for (const [x, zz] of [[-0.38, -0.22], [0.38, -0.22], [-0.38, 0.22], [0.38, 0.22]]) { const l = cyl(0.02, 0.02, 0.4, legM, 5, tbl); l.position.set(x, 0.2, zz); }
      const vase = cyl(0.05, 0.035, 0.16, new THREE.MeshStandardMaterial({ color: 0xd9e3e8, roughness: 0.3, flatShading: true }), 6, tbl); vase.position.set(0.15, 0.53, 0);
    }
  }
  {
    // fire pit with animated low-poly flames
    const g = new THREE.Group(); g.visible = false; g.position.set(-6.5, 0, 11.5); root.add(g); out.decor.fire = g;
    const stone = new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), stone); r.position.set(Math.cos(a) * 0.42, 0.1, Math.sin(a) * 0.42); r.rotation.set(i, i * 2, 0); r.scale.set(1.2, 0.8, 1); g.add(r); }
    const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 9), new THREE.MeshBasicMaterial({ color: 0x3a1206 })); coal.position.y = 0.06; g.add(coal);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01; g.add(glow);
    const flames = [];
    const cols = [0xff4a12, 0xff8a1f, 0xffc23a];
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.1 - (i % 3) * 0.02, 0.5, 5), new THREE.MeshBasicMaterial({ color: cols[i % 3], toneMapped: false, transparent: true, opacity: 0.9 }));
      const a = i * 2.3; f.position.set(Math.cos(a) * 0.14 * (i % 3), 0.3, Math.sin(a) * 0.14 * (i % 3)); g.add(f); flames.push({ m: f, ph: i * 1.7 });
    }
    out.decor.flames = flames; out.decor.fireGlow = glow;
    // bench seats around it
    const benchM = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.7, flatShading: true });
    for (const a of [0.6, 2.4, 4.2]) { const b = rbox(0.9, 0.08, 0.32, 0.02, benchM, Math.cos(a) * 1.15, 0.42, Math.sin(a) * 1.15, g); b.rotation.y = -a + Math.PI / 2; const leg = rbox(0.7, 0.4, 0.1, 0.01, benchM, Math.cos(a) * 1.15, 0.2, Math.sin(a) * 1.15, g); leg.rotation.y = -a + Math.PI / 2; }
  }
  {
    // colour-cycling LED wall behind the bottles
    const g = new THREE.Group(); g.visible = false; root.add(g); out.decor.led = g;
    const tiles = [];
    for (let i = 0; i < 14; i++) for (let j = 0; j < 4; j++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.31), new THREE.MeshBasicMaterial({ color: 0xff00aa, toneMapped: false }));
      m.position.set(-2.6 + i * 0.4, 1.12 + j * 0.33, -2.17); g.add(m); tiles.push({ m, i, j });
    }
    out.decor.tiles = tiles;
  }

  // ambient light
  const hemi = new THREE.HemisphereLight(0x9a8cff, 0x0a0610, 0.45); root.add(hemi); out.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xc07aff, 0.6); out.sun = sun; sun.position.set(-4, 5, 6); root.add(sun);
  for (const [x, z] of [[-3, 1.5], [0, 1.5], [3, 1.5], [-2, 4.5], [2, 4.5], [0, -1.2]]) { void x; void z; }
  const front = new THREE.DirectionalLight(0xfff0e0, 0.7); front.position.set(1, 4, -3); front.target.position.set(0, 1, 1.5); root.add(front, front.target);
  // soft key light from behind the bartender onto the guests' faces
  const key = new THREE.SpotLight(0xffe6d0, 4, 0, 0.75, 0.9, 1.4); key.position.set(0, 2.6, -1.6); key.target.position.set(0, 1.3, 1.2); root.add(key, key.target);
  const fill = new THREE.PointLight(0xffa868, 1.4, 6, 2); fill.position.set(0, 2.4, -1.0);
  const roomFill = new THREE.PointLight(0xff9a60, 2.0, 9, 2); roomFill.position.set(0, 2.8, 3.5);

  root.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && o.receiveShadow === undefined) o.receiveShadow = true; });
  out.root = root;
  return out;
}

export { Vessel };

// cans and bottles you grab from the fridge
const itemLabelCache = {};
export function makeItem(id) {
  const it = ITEMS[id];
  if (it.bottle) { const b = makeBottle('beer'); b.remove(b.userData.hit); b.userData.item = id; return b; }
  const g = new THREE.Group(); g.userData.item = id;
  if (!itemLabelCache[id]) {
    const [c, x] = T.canvas(256, 128);
    x.fillStyle = it.color; x.fillRect(0, 0, 256, 128);
    x.fillStyle = it.band; x.fillRect(0, 76, 256, 14);
    x.fillStyle = it.band; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.fillText(it.short.toUpperCase(), 128, 58);
    itemLabelCache[id] = T.tex(c);
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.11, 12), [new THREE.MeshStandardMaterial({ map: itemLabelCache[id], roughness: 0.35, metalness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 1, roughness: 0.25 }), new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 1, roughness: 0.25 })]);
  body.position.y = 0.062; g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.033, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 1, roughness: 0.25 })); top.position.y = 0.123; g.add(top);
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.027, 0.008, 12), top.material); bot.position.y = 0.004; g.add(bot);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.022), top.material); tab.position.set(0, 0.13, 0.008); g.add(tab);
  g.userData.radius = 0.033; g.userData.height = 0.13;
  return g;
}
