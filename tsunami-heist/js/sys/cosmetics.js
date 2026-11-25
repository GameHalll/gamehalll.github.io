// cosmetics system — see ../hooks.js for the bus API
// A locker of purely visual items (cash sink, zero gameplay advantage):
//   outfits (colour sets + premium animated patterns), hats (models.js HATS + a few add-ons),
//   trails (particles / glowing ribbons while running) and pets (tiny creatures that hop after you).
// Key C or the STYLE button opens the panel. Bots wear random cosmetics that match their wealth.
import { makeCharacter, setBat, animateCharacter } from '../models.js';

export default function init(game, bus) {
  const { THREE, C, S, scene, camera, fx, G, toon } = game;
  const player = game.player, bots = game.bots;
  const lowQ = !!game.lowQ;
  const V3 = THREE.Vector3;

  // ------------------------------------------------------------------ catalog
  // w = world index that unlocks the item (S.maxWorld must reach it); price in $ (each world's economy).
  const OUTFITS = [
    { id: 'classic', name: 'Beach Blue', price: 0 },
    { id: 'lifeguard', name: 'Lifeguard', price: 500, shirt: 0xe94040, bottom: 0xffd23f, top: 'tank', accent: 0xffffff, shorts: true },
    { id: 'lime', name: 'Lime Hoodie', price: 1500, shirt: 0x7ad83a, bottom: 0x2a2a33, top: 'hoodie', accent: 0xffffff, shorts: false },
    { id: 'sunset', name: 'Sunset Stripes', price: 6000, shirt: 0xff8a2a, bottom: 0x34507e, top: 'stripes', accent: 0xffd23f },
    { id: 'mint', name: 'Mint Polo', price: 20000, shirt: 0x5fe0b8, bottom: 0xe6e6ec, top: 'polo', accent: 0x23232e, shorts: true },
    { id: 'midnight', name: 'Midnight Jersey', price: 70000, shirt: 0x2a2a38, bottom: 0x23232e, top: 'jersey', accent: 0xff4fa0, shorts: false },
    { id: 'bubblegum', name: 'Bubblegum', price: 250000, shirt: 0xff7ad0, bottom: 0x6ad1ff, top: 'tee', accent: 0xffffff, shorts: true },
    { id: 'gold', name: 'Solid Gold', w: 1, price: 4e6, pat: 1, top: 'polo', accent: 0x23232e, css: 'linear-gradient(135deg,#fff3a8,#ffc21a 45%,#a86a00)' },
    { id: 'neon', name: 'Neon Pulse', w: 2, price: 6e8, pat: 2, top: 'jersey', accent: 0x23232e, css: 'repeating-linear-gradient(0deg,#101020 0 7px,#25ffe0 7px 9px,#101020 9px 16px,#ff3fd0 16px 18px)' },
    { id: 'prism', name: 'Prism', w: 3, price: 3e11, pat: 3, top: 'hoodie', accent: 0xffffff, css: 'linear-gradient(180deg,#ff4f6a,#ffb02e,#ffe14a,#5dff86,#2fa6ff,#a050ff)' },
    { id: 'galaxy', name: 'Galaxy', w: 4, price: 5e13, pat: 4, top: 'hoodie', accent: 0x23232e, css: 'radial-gradient(circle at 30% 30%,#fff 0 1.5px,transparent 2px),radial-gradient(circle at 70% 60%,#fff 0 1px,transparent 1.5px),radial-gradient(circle at 45% 80%,#e0c0ff 0 1px,transparent 1.5px),radial-gradient(circle at 50% 40%,#6a2aa8,#1a0a40 70%)' },
  ];
  const HATS = [
    { id: 'cap', name: 'Beach Cap', price: 0, base: 'cap', ic: '🧢' },
    { id: 'hair', name: 'Spiky Hair', price: 0, base: 'hair', ic: '💇' },
    { id: 'short', name: 'Short Cut', price: 0, base: null, ic: '🙂' },
    { id: 'beanie', name: 'Beanie', price: 300, base: 'beanie', ic: '🧶' },
    { id: 'ponytail', name: 'Ponytail', price: 900, base: 'ponytail', ic: '🎀' },
    { id: 'bandana', name: 'Bandana', price: 2000, base: 'bandana', ic: '🏴‍☠️' },
    { id: 'visor', name: 'Sun Visor', price: 5000, base: 'visor', ic: '🕶️' },
    { id: 'sunhat', name: 'Straw Hat', price: 12000, base: 'sunhat', ic: '👒' },
    { id: 'mohawk', name: 'Mohawk', price: 30000, base: 'mohawk', ic: '🦔' },
    { id: 'headphones', name: 'Headphones', price: 80000, base: 'headphones', ic: '🎧' },
    { id: 'party', name: 'Party Cone', price: 250000, base: 'hair', add: 'party', ic: '🥳' },
    { id: 'helmet', name: 'Racing Helmet', w: 1, price: 1.2e6, base: 'helmet', ic: '⛑️' },
    { id: 'horns', name: 'Devil Horns', w: 1, price: 8e6, base: 'hair', add: 'horns', ic: '😈' },
    { id: 'propeller', name: 'Propeller Cap', w: 2, price: 1.2e8, base: 'cap', add: 'prop', ic: '🚁' },
    { id: 'crown', name: 'Royal Crown', w: 2, price: 1.5e9, base: 'crown', ic: '👑' },
    { id: 'halo', name: 'Halo', w: 3, price: 6e10, base: 'hair', add: 'halo', ic: '😇' },
    { id: 'wizard', name: 'Wizard Hat', w: 3, price: 6e11, base: null, add: 'wizard', ic: '🧙' },
    { id: 'cosmic', name: 'Cosmic Crown', w: 4, price: 2e14, base: 'crown', add: 'orbit', ic: '🪐' },
  ];
  const GOLDS = [0xffd23f, 0xffe27a, 0xffb520];
  const TRAILS = [
    { id: 'none', name: 'No Trail', price: 0, ic: '🚫' },
    { id: 'bubbles', name: 'Bubbles', price: 400, ic: '🫧', css: '#9ef0ff', p: { pool: 'soft', colors: [0xbff4ff, 0xe8fdff, 0x8fdcff], size: [0.22, 0.48], life: [0.8, 1.3], vy: [1, 2.2], grav: -1.4, drag: 1.4, rate: 12, grow: 0.3 } },
    { id: 'sparkles', name: 'Sparkles', price: 2500, ic: '✨', css: '#fff2a0', p: { pool: 'glow', colors: [0xfff2a0, 0xffffff, 0xffe14a], size: [0.16, 0.34], life: [0.4, 0.8], vy: [0.4, 1.8], grav: 0.4, drag: 2, rate: 22 } },
    { id: 'fire', name: 'Fire', price: 18000, ic: '🔥', css: '#ff7a1a', p: { pool: 'glow', colors: [0xff5a1a, 0xff9a30, 0xffd060], size: [0.32, 0.58], life: [0.3, 0.55], vy: [1.8, 3.6], grav: -2, drag: 2.5, rate: 30, grow: -0.5 } },
    { id: 'coins', name: 'Coin Shower', price: 120000, ic: '🪙', css: '#ffd23f', p: { pool: 'glow', colors: GOLDS, size: [0.28, 0.44], life: [0.6, 0.9], vy: [3, 6], grav: 16, drag: 0.5, rate: 10 } },
    { id: 'neon', name: 'Neon Ribbon', w: 1, price: 2.5e6, ic: '💠', css: 'linear-gradient(90deg,#25ffe0,#ff3fd0)', r: { mode: 0, c1: 0x25ffe0, c2: 0xff3fd0 } },
    { id: 'rainbow', name: 'Rainbow', w: 2, price: 4e8, ic: '🌈', css: 'linear-gradient(90deg,#ff4f6a,#ffe14a,#5dff86,#2fa6ff,#a050ff)', r: { mode: 1 }, p: { pool: 'glow', colors: [0xffffff], size: [0.12, 0.24], life: [0.3, 0.6], vy: [0.2, 1], grav: 0, drag: 2, rate: 8 } },
    { id: 'storm', name: 'Storm Bolt', w: 3, price: 1.5e11, ic: '⚡', css: 'linear-gradient(90deg,#ffffff,#7ad0ff)', r: { mode: 3, c1: 0xffffff, c2: 0x5ab8ff }, p: { pool: 'glow', colors: [0xbfe8ff, 0xffffff], size: [0.14, 0.3], life: [0.15, 0.3], vy: [-1, 1], grav: 0, drag: 4, rate: 14 } },
    { id: 'stardust', name: 'Stardust', w: 3, price: 9e11, ic: '🌌', css: 'linear-gradient(90deg,#c070ff,#3a1a80)', r: { mode: 2, c1: 0xd080ff, c2: 0x3020a0 }, p: { pool: 'glow', colors: [0xffffff, 0xe0b0ff, 0x9ad0ff], size: [0.14, 0.3], life: [0.6, 1.1], vy: [0.1, 0.8], grav: -0.2, drag: 1.5, rate: 16 } },
    { id: 'midas', name: 'Midas Wake', w: 4, price: 4e13, ic: '💰', css: 'linear-gradient(90deg,#fff3a8,#ffb520)', r: { mode: 0, c1: 0xfff0a0, c2: 0xff9a10 }, p: { pool: 'glow', colors: GOLDS, size: [0.26, 0.42], life: [0.6, 0.9], vy: [3, 6], grav: 16, drag: 0.5, rate: 12 } },
    { id: 'supernova', name: 'Supernova', w: 4, price: 8e14, ic: '☄️', css: 'linear-gradient(90deg,#ff3fd0,#ffe14a,#25ffe0)', r: { mode: 1 }, p: { pool: 'glow', colors: [0xff5a1a, 0xffd060, 0xff3fd0, 0x25ffe0], size: [0.3, 0.55], life: [0.35, 0.6], vy: [1.5, 3.5], grav: -1.5, drag: 2.2, rate: 30, grow: -0.4 } },
  ];
  const PETS = [
    { id: 'none', name: 'No Pet', price: 0 },
    { id: 'breadpup', price: 1500 }, { id: 'pebfrog', price: 9000 }, { id: 'bubbun', price: 60000 }, { id: 'discduck', price: 300000 },
    { id: 'pizpeng', w: 1, price: 2e6 }, { id: 'turbturt', w: 1, price: 1.5e7 },
    { id: 'lavalama', w: 2, price: 3e8 }, { id: 'spaceshk', w: 2, price: 2.5e9 },
    { id: 'coscapy', w: 3, price: 1e11 }, { id: 'gigachick', w: 3, price: 9e11 },
    { id: 'glitch', w: 4, price: 3e13 }, { id: 'omegaduck', w: 4, price: 1e15 },
  ].filter(p => p.id === 'none' || C.CREATURE_BY_ID[p.id]);
  for (const p of PETS) if (p.id !== 'none') p.name = C.CREATURE_BY_ID[p.id].name;
  const SKINS = [0xffd9b0, 0xf6c99c, 0xe8b183, 0xc98e5e, 0xa56a42, 0x7d4c2e];
  const CAT = { outfit: OUTFITS, hat: HATS, trail: TRAILS, pet: PETS };
  const BY = {}; for (const k in CAT) BY[k] = Object.fromEntries(CAT[k].map(i => [i.id, i]));
  const DEF_EQ = { outfit: 'classic', hat: 'cap', trail: 'none', pet: 'none', skin: -1 };

  const st = bus.state('cosmetics', { owned: [], eq: { ...DEF_EQ } });
  st.eq = { ...DEF_EQ, ...(st.eq || {}) };
  if (!Array.isArray(st.owned)) st.owned = [];
  for (const k in CAT) if (!BY[k][st.eq[k]]) st.eq[k] = DEF_EQ[k];
  const owns = (cat, it) => it.price === 0 || st.owned.includes(cat + ':' + it.id);
  const unlocked = it => (it.w || 0) <= (S.maxWorld || 0);

  // ------------------------------------------------------------------ premium pattern materials
  // Patterned outfits use two "key" colours for shirt/pants; a shader swaps every fragment whose vertex
  // colour points the same direction (any shade of it) for the pattern. One material per pattern, shared.
  const KEY_A = 0xff00ff, KEY_B = 0x00ffff;
  const PU = { uPatTime: { value: 0 }, uKeyA: { value: new V3(1, 0, 1).normalize() }, uKeyB: { value: new V3(0, 1, 1).normalize() } };
  const patMats = {};
  const patMat = mode => patMats[mode] || (patMats[mode] = (() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, envMapIntensity: 0.35 });
    m.defines = { PAT_MODE: mode };
    m.customProgramCacheKey = () => 'cosPat' + mode;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, PU);
      sh.vertexShader = 'varying vec3 vPatP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPatP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform float uPatTime; uniform vec3 uKeyA, uKeyB; varying vec3 vPatP;
float patHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 patHue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
` + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
  float patL = length(vColor.rgb);
  vec3 patN = vColor.rgb / max(patL, 1e-4);
  float patMB = smoothstep(0.996, 0.9995, dot(patN, uKeyB));
  float patM = max(smoothstep(0.996, 0.9995, dot(patN, uKeyA)), patMB);
  float patSh = patL / 1.41421;
  vec3 patC = vec3(0.0), patEm = vec3(0.0);
  #if PAT_MODE == 1
    patC = mix(vec3(1.0, 0.62, 0.1), vec3(0.62, 0.36, 0.05), patMB) * (0.35 + 0.65 * patSh);
    patEm = vec3(0.12, 0.07, 0.0) * patM;
  #elif PAT_MODE == 2
    float patLn = smoothstep(0.38, 0.47, abs(fract(vPatP.y * 2.6 - uPatTime * 0.6) - 0.5));
    vec3 patNe = mix(vec3(0.1, 1.0, 0.88), vec3(1.0, 0.25, 0.85), 0.5 + 0.5 * sin(uPatTime * 1.7 + vPatP.y * 1.3));
    patC = vec3(0.025, 0.025, 0.05) * (0.4 + 0.6 * patSh);
    patEm = patNe * (patLn * 2.2 + 0.12 + 0.08 * sin(uPatTime * 6.0)) * patM;
  #elif PAT_MODE == 3
    patC = patHue(fract(vPatP.y * 0.55 - uPatTime * 0.35 + patMB * 0.33)) * (0.45 + 0.55 * patSh);
    patEm = patC * 0.3 * patM;
  #elif PAT_MODE == 4
    vec2 patS = gl_FragCoord.xy;
    float patNb = 0.5 + 0.5 * sin(patS.x * 0.009 + uPatTime * 0.25) * sin(patS.y * 0.012 - uPatTime * 0.18);
    patC = mix(vec3(0.03, 0.015, 0.1), vec3(0.3, 0.06, 0.42), patNb) * (0.5 + 0.5 * patSh);
    vec2 patCell = floor(patS / 3.0);
    float patStar = step(0.993, patHash(patCell)) * (0.45 + 0.55 * sin(uPatTime * 3.0 + patHash(patCell + 7.0) * 6.283));
    patEm = (vec3(0.18, 0.05, 0.4) * patNb * 0.7 + vec3(1.0, 0.95, 1.0) * patStar * 3.0) * patM;
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, patC, patM);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  #if PAT_MODE == 1
    roughnessFactor = mix(roughnessFactor, 0.22, patM);
  #elif PAT_MODE == 4
    roughnessFactor = mix(roughnessFactor, 0.3, patM);
  #endif`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  #if PAT_MODE == 1
    metalnessFactor = mix(metalnessFactor, 1.0, patM);
  #endif`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += patEm;');
    };
    return m;
  })());

  // ------------------------------------------------------------------ hat add-ons (extra parts on the head)
  const animAddons = new Set();
  function makeAddon(kind) {
    const g = new THREE.Group(); g.userData.cosAddon = kind;
    const M = (geo, mat, x, y, z, sx, sy = sx, sz = sx) => { const m = game.mesh(geo, mat, x, y, z, sx, sy, sz); g.add(m); return m; };
    if (kind === 'party') {
      const c = M(G.cone, toon(0xff4fa0), 0.06, 0.82, -0.02, 0.24, 0.6, 0.24); c.rotation.z = -0.18;
      const b = M(G.cylLo, toon(0xffe14a), 0.03, 0.64, -0.02, 0.21, 0.07, 0.21); b.rotation.z = -0.18;
      M(G.sphere, toon(0x6ad1ff), 0.12, 1.12, -0.02, 0.085);
    } else if (kind === 'horns') {
      const hm = toon(0xe0202e, { emissive: 0x801010, ei: 0.5 });
      for (const s of [-1, 1]) { const h = M(G.cone, hm, s * 0.27, 0.58, 0.08, 0.085, 0.3, 0.085); h.rotation.z = -s * 0.45; h.rotation.x = 0.15; }
    } else if (kind === 'prop') {
      M(G.cylLo, toon(0x666a7a), 0, 0.68, -0.02, 0.025, 0.14, 0.025);
      const rot = new THREE.Group(); rot.position.set(0, 0.76, -0.02); g.add(rot);
      const bm = toon(0xffe14a), rm = toon(0xff4f6a);
      for (let i = 0; i < 3; i++) { const b = game.mesh(G.box, i ? bm : rm, 0, 0, 0, 0.62, 0.02, 0.09); b.rotation.y = i * Math.PI / 3 * 2; rot.add(b); b.position.set(Math.cos(i * 2.094) * 0.28, 0, -Math.sin(i * 2.094) * 0.28); }
      rot.add(game.mesh(G.sphere, rm, 0, 0.02, 0, 0.06));
      g.userData.spin = rot; animAddons.add(g);
    } else if (kind === 'halo') {
      const h = M(G.ring, toon(0xfff4b0, { emissive: 0xffd860, ei: 1.6 }), 0, 1.0, -0.04, 0.42); h.rotation.x = Math.PI / 2 - 0.12; h.castShadow = false;
      g.userData.bob = h; animAddons.add(g);
    } else if (kind === 'wizard') {
      const pm = toon(0x4a2a9a), sm = toon(0xffe14a, { emissive: 0xffc020, ei: 1.1 });
      M(G.cylLo, pm, 0, 0.3, -0.02, 0.85, 0.03, 0.85);
      const c = M(G.cone, pm, 0.05, 0.82, -0.06, 0.5, 1.0, 0.5); c.rotation.x = -0.12; c.rotation.z = -0.1;
      M(G.cylLo, toon(0xffb02e), 0, 0.38, -0.02, 0.5, 0.08, 0.5);
      for (const [x, y, z] of [[0.18, 0.7, 0.4], [-0.2, 0.95, 0.24], [0.1, 1.12, 0.12]]) M(G.sphere, sm, x, y, z, 0.05);
    } else if (kind === 'orbit') {
      const rot = new THREE.Group(); rot.position.set(0, 0.95, -0.02); g.add(rot);
      const cols = [0xff3fd0, 0x25ffe0, 0xffe14a];
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const s = game.mesh(G.sphere, toon(cols[i], { emissive: cols[i], ei: 1.5 }), Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0.07); s.castShadow = false; rot.add(s); }
      g.userData.spin = rot; g.userData.tilt = true; animAddons.add(g);
    }
    return g;
  }
  function animateAddons(t, dt) {
    for (const g of animAddons) {
      if (!g.parent) { animAddons.delete(g); continue; }
      const u = g.userData;
      if (u.spin) { u.spin.rotation.y += dt * (u.tilt ? 2.2 : 16); if (u.tilt) u.spin.rotation.z = Math.sin(t * 0.9) * 0.25; }
      if (u.bob) u.bob.position.y = 1.0 + Math.sin(t * 2.4) * 0.04;
    }
  }

  // ------------------------------------------------------------------ look → character
  const baseOutfit = { ...(player.obj.userData.outfit || {}) };
  function lookOf(eq) {
    const o = BY.outfit[eq.outfit] || OUTFITS[0], h = BY.hat[eq.hat] || HATS[0];
    const outfit = { ...baseOutfit };
    let color = player.color;
    if (o.pat) { color = KEY_A; outfit.bottom = KEY_B; outfit.top = o.top; outfit.accent = o.accent; outfit.shorts = false; }
    else { if (o.shirt) color = o.shirt; for (const k of ['bottom', 'top', 'accent', 'shorts']) if (o[k] !== undefined) outfit[k] = o[k]; }
    if (eq.skin >= 0 && SKINS[eq.skin] != null) outfit.skin = SKINS[eq.skin];
    return { color, hat: h.base, outfit, pat: o.pat || 0, add: h.add || null, key: [eq.outfit, eq.hat, eq.skin].join('|') };
  }
  function buildChar(look) {
    const ch = makeCharacter(look.color, { hat: look.hat, outfit: look.outfit });
    if (look.pat) { const pm = patMat(look.pat); ch.traverse(o => { if (o.isMesh && o.material && o.material.vertexColors && !o.material.isShaderMaterial) o.material = pm; }); }
    if (look.add) ch.userData.head.add(makeAddon(look.add));
    ch.traverse(o => { o.userData.cosOwn = true; });
    return ch;
  }
  const disposeBaked = o => o.traverse(c => { if (c.userData && c.userData.baked && c.geometry) c.geometry.dispose(); if (c.userData && c.userData.pulse && c.userData.pulse.dispose) c.userData.pulse.dispose(); });
  // tag the original player body so foreign attachments (other systems) can be told apart and kept
  {
    const u = player.obj.userData, skip = new Set([u.bat, ...u.hold.children]);
    const mark = o => { if (skip.has(o)) return; o.userData.cosOwn = true; for (const c of o.children) mark(c); };
    mark(u.root);
  }
  // swap the player's body in place (a.pos is obj.position, so the Object3D itself must survive)
  function applyPlayerLook() {
    const look = lookOf(st.eq);
    if (player._cosKey === look.key) return;
    player._cosKey = look.key;
    const obj = player.obj, u = obj.userData;
    const nc = buildChar(look), nu = nc.userData;
    const bat = u.bat;
    // carry, foreign attachments
    for (const k of Object.keys(u)) {
      const oj = u[k], nj = nu[k];
      if (!oj || !oj.isObject3D || !nj || !nj.isObject3D || oj === bat) continue;
      for (const c of [...oj.children]) if (!c.userData.cosOwn && c !== bat) nj.add(c);
    }
    if (bat) u.hand.remove(bat);
    obj.remove(u.root); disposeBaked(u.root); if (bat) disposeBaked(bat);
    nc.remove(nu.root); obj.add(nu.root);
    const keep = { phase: u.phase, sm: u.sm, blink: u.blink };
    for (const k of Object.keys(nu)) u[k] = nu[k];
    Object.assign(u, keep); u.bat = null;
    setBat(obj, player.bat);
    bus.emit('cosmetics', player, look);
  }

  // ------------------------------------------------------------------ ribbons
  const RN = 24, RIB_LIFE = 0.5;
  let ribIdx = null;
  const ribbonIndex = () => ribIdx || (ribIdx = (() => { const a = []; for (let i = 0; i < RN - 1; i++) { const b = i * 2; a.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } return a; })());
  const RIB_VS = `attribute float aT; attribute float aS; uniform float uTime, uMode; varying float vT, vS;
    void main(){ vT = aT; vS = aS; vec3 p = position;
      if (uMode > 2.5) { float k = clamp(aT, 0.0, 1.0) * 0.9; p.x += sin(aT * 53.0 + uTime * 41.0) * 0.35 * k; p.z += cos(aT * 47.0 + uTime * 37.0) * 0.35 * k; p.y += sin(aT * 31.0 + uTime * 29.0) * 0.25 * k; }
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
  const RIB_FS = `uniform float uTime, uMode; uniform vec3 uC1, uC2; varying float vT, vS;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 hue(float x){ return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
    void main(){
      float t = clamp(vT, 0.0, 1.0);
      float a = pow(1.0 - t, 1.5) * sin(vS * 3.14159);
      vec3 c;
      if (uMode > 0.5 && uMode < 1.5) c = hue(fract(vS * 0.9 + t * 0.6 - uTime * 0.7)) * 1.2;
      else if (uMode > 1.5 && uMode < 2.5) { c = mix(uC1, uC2, t); float s = step(0.93, h(floor(vec2(t * 40.0 + uTime * 3.0, vS * 6.0)))); c += vec3(s) * 1.6; }
      else c = mix(uC1, uC2, t) * (0.9 + 0.2 * sin(uTime * 18.0 + t * 25.0));
      if (uMode > 2.5) a *= 0.6 + 0.4 * step(0.4, h(vec2(floor(uTime * 24.0), 1.0)));
      gl_FragColor = vec4(c * 1.25, a * 0.85);
      if (gl_FragColor.a < 0.004) discard;
    }`;
  class Ribbon {
    constructor(parent) {
      this.pos = new Float32Array(RN * 6); this.age = new Float32Array(RN * 2); const side = new Float32Array(RN * 2);
      for (let i = 0; i < RN; i++) side[i * 2 + 1] = 1;
      this.px = new Float32Array(RN); this.py = new Float32Array(RN); this.pz = new Float32Array(RN); this.pt = new Float32Array(RN); this.n = 0;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aT', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aS', new THREE.BufferAttribute(side, 1));
      g.setIndex(ribbonIndex());
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() } }, vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false;
      parent.add(this.mesh);
      this.h0 = 0.55; this.h1 = 1.5;
    }
    set(r) { this.mat.uniforms.uMode.value = r.mode; this.mat.uniforms.uC1.value.set(r.c1 ?? 0xffffff); this.mat.uniforms.uC2.value.set(r.c2 ?? 0xffffff); }
    feed(x, y, z, t) {
      if (this.n > 0) { const dx = x - this.px[0], dz = z - this.pz[0]; if (dx * dx + dz * dz > 36) this.n = 0; }
      if (this.n === 0) { this.px[0] = x; this.py[0] = y; this.pz[0] = z; this.pt[0] = t; this.n = 1; }
      const dx = x - (this.n > 1 ? this.px[1] : this.px[0]), dy = y - (this.n > 1 ? this.py[1] : this.py[0]), dz = z - (this.n > 1 ? this.pz[1] : this.pz[0]);
      if (this.n < 2 || dx * dx + dy * dy + dz * dz > 0.12) {
        const m = Math.min(this.n, RN - 1);
        for (let i = m; i > 0; i--) { this.px[i] = this.px[i - 1]; this.py[i] = this.py[i - 1]; this.pz[i] = this.pz[i - 1]; this.pt[i] = this.pt[i - 1]; }
        this.n = Math.min(this.n + 1, RN);
      }
      this.px[0] = x; this.py[0] = y; this.pz[0] = z; this.pt[0] = t;
    }
    update(t) {
      const P = this.pos, A = this.age, n = Math.max(1, this.n), mid = (this.h0 + this.h1) / 2, half = (this.h1 - this.h0) / 2;
      for (let i = 0; i < RN; i++) {
        const j = Math.min(i, n - 1), age = i < this.n ? Math.min(1, (t - this.pt[j]) / RIB_LIFE) : 1, hh = half * (1 - age * 0.55);
        const o = i * 6;
        P[o] = P[o + 3] = this.px[j]; P[o + 2] = P[o + 5] = this.pz[j];
        P[o + 1] = this.py[j] + mid - hh; P[o + 4] = this.py[j] + mid + hh;
        A[i * 2] = A[i * 2 + 1] = age;
      }
      this.mat.uniforms.uTime.value = t;
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aT.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ pets (pooled per creature id)
  const petPool = new Map();
  function makePet(id) {
    const g = game.makeCreature(C.CREATURE_BY_ID[id], '');
    const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new V3());
    const sc = 0.95 / Math.max(0.5, Math.max(sz.y, sz.x * 0.8));
    const holder = new THREE.Group(); holder.add(g); g.scale.setScalar(sc); g.position.y = -box.min.y * sc;
    holder.userData = { id, inner: g, seed: Math.random() * 10 };
    return holder;
  }
  function getPet(id) { const l = petPool.get(id); const p = (l && l.pop()) || makePet(id); scene.add(p); p.visible = false; return p; }
  function releasePet(p) { if (!p) return; scene.remove(p); const id = p.userData.id; if (!petPool.has(id)) petPool.set(id, []); petPool.get(id).push(p); }

  // ------------------------------------------------------------------ per-actor runtime
  const RT = new Map(); // actor → { trail, pet, ribbon, petObj, acc, ... }
  const rt = a => { let r = RT.get(a); if (!r) { r = { trail: null, pet: null, ribbon: null, petObj: null, acc: 0, side: Math.random() < 0.5 ? -1 : 1, px: 0, py: 0, pz: 0, gy: 0, yaw: 0, hop: 0, snap: true, idleT: 2 + Math.random() * 4, spin: 0, addon: null }; RT.set(a, r); } return r; };
  function setTrail(a, id) {
    const r = rt(a), it = BY.trail[id];
    r.trail = it && it.id !== 'none' ? it : null;
    if (r.trail && r.trail.r) { if (!r.ribbon) r.ribbon = new Ribbon(scene); r.ribbon.set(r.trail.r); r.ribbon.n = 0; }
    else if (r.ribbon) r.ribbon.mesh.visible = false;
  }
  function setPet(a, id) {
    const r = rt(a);
    const want = id && id !== 'none' ? id : null;
    if (r.pet === want) return;
    releasePet(r.petObj); r.petObj = null; r.pet = want;
    if (want) { r.petObj = getPet(want); r.snap = true; }
  }
  function setBotAddon(a, kind) {
    const r = rt(a);
    if (r.addon) { r.addon.parent?.remove(r.addon); r.addon = null; }
    if (kind) { r.addon = makeAddon(kind); a.obj.userData.head.add(r.addon); }
  }
  function applyPlayer() { applyPlayerLook(); setTrail(player, st.eq.trail); setPet(player, st.eq.pet); }

  // ------------------------------------------------------------------ bots: wear what their wealth affords
  const botWealth = b => { let s = 0; for (const p of b.plot.pedestals) if (p.creature) s += game.income(p.creature.id, p.creature.mut, p.creature.w); return s; };
  const pickAffordable = (list, budget) => { const ok = list.filter(i => i.price > 0 && (i.w || 0) <= C.WORLD && i.price <= budget); return ok.length ? ok[Math.max(0, ok.length - 1 - Math.floor(Math.random() * Math.min(3, ok.length)))] : null; };
  function dressBot(b, first) {
    const budget = Math.max(800, botWealth(b) * (300 + Math.random() * 900)) * (0.4 + Math.random());
    const r = rt(b);
    if (first || Math.random() < 0.5) { const t = Math.random() < 0.65 ? pickAffordable(TRAILS, budget) : null; setTrail(b, t ? t.id : 'none'); }
    if (first || Math.random() < 0.4) { const p = Math.random() < 0.45 ? pickAffordable(PETS, budget * 1.5) : null; setPet(b, p ? p.id : 'none'); }
    if (first && !r.addon && Math.random() < 0.18) setBotAddon(b, 'halo'); // floats above any hat, never clips
  }
  let botT = 30 + Math.random() * 30;

  // ------------------------------------------------------------------ simulation
  let T = 0;
  const _f = new V3();
  const rnd = (a, b) => a + Math.random() * (b - a);
  function emitTrail(a, r, sp, dt) {
    const p = r.trail.p, pool = fx[p.pool];
    if (!pool) return;
    r.acc += p.rate * dt * Math.min(1, sp / 12) * (a === player ? 1 : lowQ ? 0.3 : 0.6);
    if (r.acc > 6) r.acc = 6;
    const ix = sp > 0.1 ? a.vel.x / sp : 0, iz = sp > 0.1 ? a.vel.z / sp : 0;
    while (r.acc >= 1) {
      r.acc -= 1;
      const c = p.colors[(Math.random() * p.colors.length) | 0];
      pool.emit(a.pos.x - ix * 0.5 + rnd(-0.35, 0.35), a.pos.y + rnd(0.3, 1.6), a.pos.z - iz * 0.5 + rnd(-0.35, 0.35),
        -ix * rnd(0.5, 1.5) + rnd(-0.6, 0.6), rnd(p.vy[0], p.vy[1]), -iz * rnd(0.5, 1.5) + rnd(-0.6, 0.6),
        { color: c, size: rnd(p.size[0], p.size[1]), life: rnd(p.life[0], p.life[1]), grav: p.grav, drag: p.drag, grow: p.grow || 0 });
    }
  }
  function updatePet(a, r, dt, t) {
    const g = r.petObj, u = g.userData;
    const yaw = a.yaw || 0, fx_ = Math.sin(yaw), fz = Math.cos(yaw);
    const tx = a.pos.x - fx_ * 1.7 + fz * 1.15 * r.side, tz = a.pos.z - fz * 1.7 - fx_ * 1.15 * r.side;
    if (a.onGround || r.snap) r.gy = Math.max(a.pos.y, a.pos.y > -0.5 ? a.pos.y : r.gy);
    let dx = tx - r.px, dz = tz - r.pz;
    if (r.snap || dx * dx + dz * dz > 196) { r.px = tx; r.pz = tz; r.py = r.gy; r.snap = false; dx = dz = 0; }
    const d = Math.hypot(dx, dz);
    const k = 1 - Math.exp(-dt * (d > 4 ? 5 : 3.2));
    const ox = r.px, oz = r.pz;
    r.px += dx * k; r.pz += dz * k;
    const mvx = r.px - ox, mvz = r.pz - oz, msp = Math.hypot(mvx, mvz) / Math.max(dt, 1e-4);
    r.py += (r.gy - r.py) * (1 - Math.exp(-dt * 8));
    let targetYaw;
    if (msp > 0.8) { r.hop += dt * (7 + Math.min(msp, 30) * 0.35); targetYaw = Math.atan2(mvx, mvz); r.idleT = Math.max(r.idleT, 1.5); }
    else {
      r.hop = r.hop % Math.PI; if (r.hop > 0.05) r.hop = Math.min(Math.PI, r.hop + dt * 8); if (r.hop >= Math.PI - 0.01) r.hop = 0;
      targetYaw = Math.atan2(camera.position.x - r.px, camera.position.z - r.pz);
      r.idleT -= dt; if (r.idleT <= 0) { r.idleT = 3 + Math.random() * 5; r.spin = 1; r.hop = 0.06; }
    }
    if (r.spin > 0) { r.spin = Math.max(0, r.spin - dt * 1.6); }
    let dy = targetYaw - r.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    r.yaw += dy * (1 - Math.exp(-dt * 9));
    const hopY = Math.abs(Math.sin(r.hop)) * (msp > 0.8 ? 0.42 : 0.55);
    g.position.set(r.px, r.py + hopY + Math.sin(t * 2.2 + u.seed) * 0.03, r.pz);
    g.rotation.y = r.yaw + (1 - r.spin) * 0 + (r.spin > 0 ? (1 - r.spin) * Math.PI * 2 : 0);
    const sq = msp > 0.8 ? 1 + Math.cos(r.hop * 2) * 0.08 : 1;
    u.inner.scale.y = u.inner.scale.x * sq;
    game.animateCreature(u.inner, t, u.seed);
  }
  bus.on('tick', dt => {
    T += dt; PU.uPatTime.value = T;
    animateAddons(T, dt);
    const cx = camera.position.x, cz = camera.position.z;
    let nearBotsFx = 0;
    RT.forEach((r, a) => {
      const alive = a.obj.visible && !(a.dead > 0) && !(a.swept > 0);
      const d2 = (a.pos.x - cx) ** 2 + (a.pos.z - cz) ** 2;
      const isP = a === player;
      const near = isP || d2 < (lowQ ? 40 * 40 : 60 * 60);
      // trail
      if (r.trail) {
        const sp = Math.hypot(a.vel.x, a.vel.z);
        const fxOk = near && alive && (isP || nearBotsFx < (lowQ ? 1 : 3));
        if (fxOk && !isP) nearBotsFx++;
        if (r.ribbon) {
          r.ribbon.mesh.visible = fxOk;
          if (fxOk) { r.ribbon.feed(a.pos.x, a.pos.y, a.pos.z, T); r.ribbon.update(T); } else r.ribbon.n = 0;
        }
        if (r.trail.p && fxOk && sp > 3) emitTrail(a, r, sp, dt);
      }
      // pet
      if (r.petObj) {
        const show = alive && (isP || d2 < (lowQ ? 35 * 35 : 70 * 70));
        r.petObj.visible = show;
        if (show) updatePet(a, r, dt, T); else r.snap = true;
      }
    });
    botT -= dt;
    if (botT <= 0) { botT = 45 + Math.random() * 75; const b = bots[Math.floor(Math.random() * bots.length)]; if (b) dressBot(b, false); }
  });
  bus.on('travel', () => { for (const [, r] of RT) { if (r.ribbon) r.ribbon.n = 0; r.snap = true; } for (const b of bots) dressBot(b, false); });
  bus.on('respawn', a => { const r = RT.get(a); if (r) { r.snap = true; if (r.ribbon) r.ribbon.n = 0; } });
  bus.on('start', () => { for (const b of bots) dressBot(b, true); });

  // ------------------------------------------------------------------ UI
  const css = document.createElement('style');
  css.textContent = `
#panelCos { width: min(800px, 96vw); }
#panelCos .cosTabs { display: flex; gap: 8px; justify-content: center; margin: -4px 0 12px; flex-wrap: wrap; }
#panelCos .cosTabs .btn { font-size: 17px; padding: 6px 14px; }
#panelCos .cosBody { display: flex; gap: 14px; align-items: flex-start; }
#panelCos .cosPrev { flex: none; width: 210px; text-align: center; position: sticky; top: 0; }
#panelCos .cosPrev canvas { width: 210px; height: 248px; display: block; border-radius: 18px; border: 3px solid var(--ink);
  background: radial-gradient(circle at 50% 40%, #5a4ac0, #2a2160 70%); box-shadow: inset 0 0 0 2px rgba(255,255,255,.12), 0 3px 0 var(--ink); }
#panelCos .cosInfo { margin-top: 8px; }
#panelCos .cosName { font-size: 22px; line-height: 1.1; }
#panelCos .cosSub { font-size: 14px; color: #c9c2ec; margin: 2px 0 8px; min-height: 17px; }
#panelCos #cosAct { width: 100%; justify-content: center; font-size: 19px; }
#panelCos .cosGrid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 9px; min-width: 0; }
#panelCos .cosSkins { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; justify-content: center; font-size: 15px; color: #c9c2ec; flex-wrap: wrap; }
#panelCos .cosSkins i { width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--ink); cursor: pointer; display: inline-block; }
#panelCos .cosSkins i.on { outline: 3px solid #fff; }
.cosCard { position: relative; border-radius: 14px; padding: 7px 5px 6px; text-align: center; border: 3px solid rgba(20,16,32,.6); cursor: pointer;
  background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04)); box-shadow: 0 3px 0 rgba(20,16,32,.45); transition: transform .1s; }
.cosCard:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.25); }
.cosCard.sel { border-color: #fff; }
.cosCard.eq { border-color: var(--green); box-shadow: 0 0 0 2px rgba(93,255,134,.25), 0 3px 0 rgba(20,16,32,.45); }
.cosCard.lockd { opacity: .55; }
.cosCard .sw { width: 60px; height: 60px; margin: 0 auto 4px; border-radius: 50%; border: 3px solid var(--ink); display: flex; align-items: center; justify-content: center;
  font-size: 32px; background: #3b3180; overflow: hidden; box-shadow: inset 0 -4px 0 rgba(0,0,0,.2); }
.cosCard .sw img { width: 116%; height: 116%; object-fit: contain; }
.cosCard .nm { font-size: 15px; line-height: 1.05; min-height: 32px; display: flex; align-items: center; justify-content: center; }
.cosCard .pr { font-size: 14px; color: var(--gold); }
.cosCard .pr.own { color: var(--green); } .cosCard .pr.lk { color: #c9c2ec; }
.cosCard .tagEq { position: absolute; top: 4px; right: 5px; font-size: 11px; background: var(--green); color: var(--ink); border-radius: 6px; padding: 1px 4px; }
@media (max-width: 760px) {
  #btnStyle .lbl { display: none; }
  #panelCos .cosBody { flex-direction: column; align-items: stretch; gap: 8px; }
  #panelCos .cosPrev { width: auto; position: static; display: flex; gap: 10px; align-items: center; text-align: left; }
  #panelCos .cosPrev canvas { width: 104px; height: 123px; flex: none; }
  #panelCos .cosInfo { flex: 1; margin: 0; } #panelCos .cosName { font-size: 18px; } #panelCos .cosSub { font-size: 12px; }
  #panelCos #cosAct { font-size: 15px; }
  #panelCos .cosTabs .btn { font-size: 14px; padding: 5px 9px; }
  #panelCos .cosGrid { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 7px; }
  .cosCard .sw { width: 44px; height: 44px; font-size: 22px; } .cosCard .nm { font-size: 12px; min-height: 26px; } .cosCard .pr { font-size: 12px; }
}`;
  document.head.appendChild(css);
  const panel = document.createElement('div');
  panel.id = 'panelCos'; panel.className = 'panel hidden';
  panel.innerHTML = `<button class="btn grey small close">${game.icon('close')}</button>
    <h2>${game.icon('sparkle')} STYLE LOCKER</h2>
    <div class="cosTabs"></div>
    <div class="cosBody"><div class="cosPrev"><canvas width="420" height="496"></canvas><div class="cosInfo"><div class="cosName stroke"></div><div class="cosSub"></div><button class="btn green" id="cosAct"></button></div></div><div class="cosGrid"></div></div>`;
  document.body.appendChild(panel);
  const $q = s => panel.querySelector(s);
  $q('.close').onclick = () => game.closePanels();
  const TABS = [['outfit', 'OUTFITS', '👕'], ['hat', 'HATS', '🧢'], ['trail', 'TRAILS', '✨'], ['pet', 'PETS', '🐾']];
  let tab = 'outfit';
  const sel = { outfit: null, hat: null, trail: null, pet: null };
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const isOpen = () => !panel.classList.contains('hidden');

  function swatch(cat, it) {
    if (cat === 'outfit') {
      if (it.css) return `<div class="sw" style="background:${it.css}"></div>`;
      const sh = hex(it.shirt ?? player.color), bt = hex(it.bottom ?? baseOutfit.bottom ?? 0x34507e);
      return `<div class="sw" style="background:linear-gradient(180deg,${sh} 0 58%,${bt} 58%)"></div>`;
    }
    if (cat === 'pet') return it.id === 'none' ? `<div class="sw">🚫</div>` : `<div class="sw" style="background:radial-gradient(circle at 40% 30%,#6a5ad8,#2a2160)"><img src="${petThumb(it.id)}"></div>`;
    if (cat === 'trail') return `<div class="sw" style="background:${it.css ? (it.css.includes('gradient') ? it.css : `radial-gradient(circle,${it.css}88,#2a2160 75%)`) : '#3b3180'}">${it.ic}</div>`;
    return `<div class="sw">${it.ic}</div>`;
  }
  function priceTag(cat, it) {
    if (!unlocked(it)) return `<div class="pr lk">🔒 ${C.WORLDS[it.w].emoji} World ${it.w + 1}</div>`;
    if (owns(cat, it)) return `<div class="pr own">${it.price ? 'OWNED' : 'FREE'}</div>`;
    return `<div class="pr">$${game.fmt(it.price)}</div>`;
  }
  function render() {
    $q('.cosTabs').innerHTML = TABS.map(([k, l, e]) => `<button class="btn ${k === tab ? 'pink' : 'grey'}" data-tab="${k}">${e} ${l}</button>`).join('');
    for (const b of $q('.cosTabs').children) b.onclick = () => { tab = b.dataset.tab; render(); };
    const list = CAT[tab];
    if (!sel[tab]) sel[tab] = st.eq[tab];
    let html = '';
    if (tab === 'outfit') html += `<div class="cosSkins">Skin tone: <i class="${st.eq.skin < 0 ? 'on' : ''}" data-skin="-1" style="background:${hex(baseOutfit.skin ?? 0xffd9b0)}" title="Default"></i>${SKINS.map((s, i) => `<i class="${st.eq.skin === i ? 'on' : ''}" data-skin="${i}" style="background:${hex(s)}"></i>`).join('')}</div>`;
    html += list.map(it => `<div class="cosCard${st.eq[tab] === it.id ? ' eq' : ''}${sel[tab] === it.id ? ' sel' : ''}${unlocked(it) ? '' : ' lockd'}" data-id="${it.id}">${st.eq[tab] === it.id ? '<span class="tagEq">ON</span>' : ''}${swatch(tab, it)}<div class="nm">${it.name}</div>${priceTag(tab, it)}</div>`).join('');
    const grid = $q('.cosGrid'); grid.innerHTML = html;
    for (const el of grid.querySelectorAll('.cosCard')) el.onclick = () => clickItem(el.dataset.id);
    for (const el of grid.querySelectorAll('[data-skin]')) el.onclick = () => { st.eq.skin = +el.dataset.skin; applyPlayer(); game.save(); render(); };
    renderInfo();
    previewDirty = true;
  }
  function renderInfo() {
    const it = BY[tab][sel[tab]] || CAT[tab][0], b = $q('#cosAct');
    $q('.cosName').textContent = it.name;
    const kind = { outfit: 'Outfit', hat: 'Hat', trail: 'Trail', pet: 'Pet' }[tab];
    $q('.cosSub').textContent = it.pat ? 'Premium animated ' + kind.toLowerCase() : tab === 'trail' && it.id !== 'none' ? (it.r ? 'Glowing ribbon' : 'Particles') + ' while running' : tab === 'pet' && it.id !== 'none' ? 'Follows you everywhere' : 'Cosmetic ' + kind.toLowerCase() + ' · just for style';
    b.disabled = false; b.className = 'btn green';
    if (!unlocked(it)) { b.textContent = `🔒 Reach ${C.WORLDS[it.w].name}`; b.disabled = true; b.className = 'btn grey'; }
    else if (st.eq[tab] === it.id) { b.textContent = '✔ EQUIPPED'; b.disabled = true; b.className = 'btn grey'; }
    else if (owns(tab, it)) { b.textContent = 'EQUIP'; b.className = 'btn purple'; }
    else { b.innerHTML = `${game.icon('coin')} $${game.fmt(it.price)}`; b.className = 'btn gold'; if (S.cash < it.price) b.disabled = true; }
    b.onclick = () => act(it);
  }
  function equip(cat, id) { st.eq[cat] = id; applyPlayer(); game.save(); }
  function clickItem(id) {
    const it = BY[tab][id]; sel[tab] = id;
    if (unlocked(it) && owns(tab, it) && st.eq[tab] !== id) { equip(tab, id); game.sound.place?.(); }
    render();
  }
  function act(it) {
    if (!unlocked(it)) return;
    if (owns(tab, it)) { equip(tab, it.id); render(); return; }
    if (S.cash < it.price) { game.sound.deny?.(); return; }
    S.cash -= it.price; st.owned.push(tab + ':' + it.id);
    game.sound.buy(); equip(tab, it.id);
    game.toast(`✨ ${it.name} unlocked!`, 'gold');
    bus.emit('cosmetic', tab, it.id, it.price);
    render();
  }
  // keep the BUY button in sync with cash while open
  let infoT = 0;
  bus.on('tick', dt => { if (!isOpen()) return; infoT -= dt; if (infoT <= 0) { infoT = 0.5; renderInfo(); } });

  function toggle() {
    if (isOpen()) { game.closePanels(); return; }
    game.openPanel('panelCos'); render(); startPreview();
  }
  bus.hudButton({ id: 'btnStyle', icon: game.icon('sparkle'), label: 'STYLE', key: 'c', color: 'pink', onClick: toggle });
  bus.on('key', k => { if (k === 'c') toggle(); });

  // ------------------------------------------------------------------ 3D preview (own small renderer, only runs while open)
  let pr = null, pScene, pCam, pChar = null, pCharKey = '', pPet = null, pPetId = null, pRib = null, previewDirty = true, raf = 0, pT = 0, pLast = 0;
  const pPets = new Map();
  function initPreview() {
    if (pr) return true;
    try {
      pr = new THREE.WebGLRenderer({ canvas: $q('canvas'), alpha: true, antialias: true, preserveDrawingBuffer: false });
    } catch (e) { pr = null; return false; }
    pr.setPixelRatio(1); pr.setSize(420, 496, false);
    pr.outputColorSpace = THREE.SRGBColorSpace; pr.toneMapping = THREE.ACESFilmicToneMapping; pr.toneMappingExposure = 0.95;
    pScene = new THREE.Scene();
    pScene.add(new THREE.HemisphereLight(0xffffff, 0x8a7ab0, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(3, 5, 6); pScene.add(d);
    const d2 = new THREE.DirectionalLight(0xa0c0ff, 1.0); d2.position.set(-4, 2, -3); pScene.add(d2);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0x3b3180, roughness: 0.7 })); disc.position.y = -0.06; pScene.add(disc);
    pCam = new THREE.PerspectiveCamera(32, 420 / 496, 0.1, 50);
    pCam.position.set(0, 2.1, 7.4); pCam.lookAt(0, 1.3, 0);
    pRib = new Ribbon(pScene); pRib.h0 = 0.2; pRib.h1 = 0.9;
    return true;
  }
  const petThumbs = new Map();
  function petThumb(id) {
    if (petThumbs.has(id)) return petThumbs.get(id);
    if (!initPreview()) return '';
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x998866, 1.4)); const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(2, 4, 5); sc.add(d);
    const m = game.makeCreature(C.CREATURE_BY_ID[id], ''); sc.add(m);
    const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new V3()), s = b.getSize(new V3()), r = Math.max(s.x, s.y, s.z);
    const cam = new THREE.PerspectiveCamera(34, 420 / 496, 0.1, 50); cam.position.set(c.x + r * 0.9, c.y + r * 0.5, c.z + r * 2.1); cam.lookAt(c);
    pr.render(sc, cam);
    const url = pr.domElement.toDataURL(); petThumbs.set(id, url); previewDirty = true;
    return url;
  }
  function previewEq() { const e = { ...st.eq }; if (sel[tab]) e[tab] = sel[tab]; return e; }
  function syncPreview() {
    const e = previewEq(), look = lookOf(e);
    if (look.key + '|' + look.pat !== pCharKey) {
      if (pChar) { pScene.remove(pChar); disposeBaked(pChar); }
      pChar = buildChar(look); pCharKey = look.key + '|' + look.pat; pScene.add(pChar);
      setBat(pChar, player.bat);
    }
    const pid = e.pet !== 'none' ? e.pet : null;
    if (pid !== pPetId) {
      if (pPet) pScene.remove(pPet);
      pPet = null; pPetId = pid;
      if (pid) { pPet = pPets.get(pid) || makePet(pid); pPets.set(pid, pPet); pPet.position.set(1.25, 0, 0.5); pScene.add(pPet); }
    }
    const tr = BY.trail[e.trail];
    if (tr && tr.id !== 'none') {
      const r = tr.r || { mode: 0, c1: tr.p.colors[0], c2: tr.p.colors[tr.p.colors.length - 1] };
      pRib.set(r); pRib.mesh.visible = true; pRib.trailId = tr.id;
    } else { pRib.mesh.visible = false; pRib.n = 0; }
    previewDirty = false;
  }
  function startPreview() {
    if (!initPreview()) return;
    if (raf) return;
    pLast = performance.now();
    const loop = () => {
      if (!isOpen()) { raf = 0; return; }
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - pLast) / 1000); pLast = now; pT += dt;
      if (previewDirty) syncPreview();
      if (pChar) { pChar.rotation.y = Math.sin(pT * 0.6) * 0.9; animateCharacter(pChar, dt, 0, {}); }
      if (pPet) { pPet.position.y = Math.abs(Math.sin(pT * 3)) * 0.3; pPet.rotation.y = -0.4 + Math.sin(pT * 0.8) * 0.5; game.animateCreature(pPet.userData.inner, pT, pPet.userData.seed); }
      if (pRib.mesh.visible) { const a = pT * 2.6; pRib.feed(Math.cos(a) * 1.55, 0.25 + Math.sin(pT * 3.1) * 0.25, Math.sin(a) * 1.55, pT); pRib.update(pT); }
      animateAddons(pT, dt);
      pr.render(pScene, pCam);
    };
    loop();
  }

  // ------------------------------------------------------------------ boot
  try { applyPlayer(); } catch (e) { console.error('[sys cosmetics] apply', e); }
  game.cosmetics = { equip, state: st, catalog: CAT, applyPlayer };
}
