// powerups system — see ../hooks.js for the bus API
// Glowing power-up orbs on the track: Speed Burst, Super Jump, Ghost, Magnet, Shield.
// Rendering: one InstancedMesh per core shape (5) + one shared fresnel shell + one ground ring + 5 icon billboards.
const TYPES = [
  { id: 'speed', name: 'SPEED BURST', desc: 'Run 35% faster for 6s', color: 0xffb21a, css: '#ffc23a', dur: 6, w: () => 30, base: 660,
    path: 'M13.5 1.5L4 13.5h6.2L9 22.5l10-12.6h-6.3z' },
  { id: 'jump', name: 'SUPER JUMP', desc: 'Jump way higher for 10s', color: 0x3dff7a, css: '#5dff86', dur: 10, w: () => 24, base: 523,
    path: 'M12 2l7.5 7.5h-4.6V15H9.1V9.5H4.5zM6 17.5h12V21H6z' },
  { id: 'ghost', name: 'GHOST', desc: 'Phase through hurdles, ignore slow ground for 5s', color: 0xb894ff, css: '#c8a8ff', dur: 5, w: z => 14 + z * 1.5, base: 440,
    path: 'M12 2.2c-4.1 0-7.3 3.2-7.3 7.3v12.3l2.45-1.9 2.4 1.9 2.45-1.9 2.45 1.9 2.4-1.9 2.45 1.9V9.5c0-4.1-3.2-7.3-7.3-7.3z' },
  { id: 'magnet', name: 'MAGNET', desc: 'Auto-grab creatures within 6m for 8s', color: 0xff3f6a, css: '#ff6a8a', dur: 8, w: z => 8 + z * 2.5, base: 392,
    path: 'M4 2.5h5v9a3 3 0 0 0 6 0v-9h5v9a8 8 0 0 1-16 0z' },
  { id: 'shield', name: 'SHIELD', desc: 'Survive the next wave, lava or fall', color: 0x3fc8ff, css: '#5fd6ff', dur: 60, w: z => 4 + z * 2.5, base: 587,
    path: 'M12 1.8l8.6 3.2v6.4c0 5.4-3.7 9.6-8.6 11.6-4.9-2-8.6-6.2-8.6-11.6V5z' },
];
const T = Object.fromEntries(TYPES.map((t, i) => [t.id, Object.assign(t, { i })]));
const SPEED_MUL = 1.35, JUMP_MUL = 1.45, MAGNET_R = 6, PICK_R = 1.7;
const svgIcon = (t, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${t.path}" fill="#fff" stroke="#141020" stroke-width="1.6" stroke-linejoin="round"/>${t.id === 'ghost' ? '<circle cx="9.3" cy="10" r="1.6" fill="#141020"/><circle cx="14.7" cy="10" r="1.6" fill="#141020"/>' : ''}${t.id === 'magnet' ? '<path d="M4 2.5h5v3H4zM15 2.5h5v3h-5z" fill="#cfd6e6"/>' : ''}</svg>`;

export default function init(game, bus) {
  const { THREE, C, scene, camera, fx, sound } = game;
  const st = bus.state('powerups', { seen: {}, taken: 0, saves: 0 });
  const rand = (a, b) => a + Math.random() * (b - a);
  const V3 = THREE.Vector3;

  // ------------------------------------------------------------------ materials / geometry (shared, never disposed)
  const fresnelMat = (opacity, color = 0xffffff) => new THREE.ShaderMaterial({
    uniforms: { uOp: { value: opacity }, uColor: { value: new THREE.Color(color) }, uT: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vY; uniform vec3 uColor;
      void main(){
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vN = normalize(mat3(m) * normal); vV = normalize(cameraPosition - wp.xyz); vY = position.y;
        vC = uColor;
        #ifdef USE_INSTANCING_COLOR
          vC *= instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vY; uniform float uOp; uniform float uT;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        f = pow(f, 2.2);
        float band = 0.5 + 0.5 * sin(vY * 9.0 - uT * 4.0);
        gl_FragColor = vec4(vC * (0.25 + 1.8 * f + 0.15 * band), (0.08 + 0.92 * f) * uOp);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const MAX = 64;
  const coreGeos = {
    speed: new THREE.OctahedronGeometry(0.42, 0),
    jump: new THREE.ConeGeometry(0.4, 0.8, 4),
    ghost: new THREE.CapsuleGeometry(0.27, 0.32, 4, 10),
    magnet: new THREE.TorusGeometry(0.33, 0.12, 8, 18, Math.PI * 1.25),
    shield: new THREE.IcosahedronGeometry(0.42, 1),
  };
  coreGeos.magnet.rotateZ(-1.125 * Math.PI);
  const cores = TYPES.map(t => {
    const m = new THREE.InstancedMesh(coreGeos[t.id], new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.1, flatShading: t.id !== 'ghost' }), MAX);
    m.count = 0; m.frustumCulled = false; m.visible = false; scene.add(m); return m;
  });
  const shellMat = fresnelMat(1);
  const shell = new THREE.InstancedMesh(new THREE.SphereGeometry(0.95, 20, 14), shellMat, MAX);
  shell.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  shell.count = 0; shell.frustumCulled = false; shell.visible = false; shell.renderOrder = 5; scene.add(shell);
  const ringGeo = new THREE.RingGeometry(0.75, 1.15, 36); ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), MAX);
  ring.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  ring.count = 0; ring.frustumCulled = false; ring.visible = false; scene.add(ring);
  // icon badges (canvas textures drawn from the same SVG paths as the HUD chips)
  const iconTex = t => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.fillStyle = t.css; x.fill(); x.lineWidth = 10; x.strokeStyle = '#141020'; x.stroke();
    x.save(); x.translate(64 - 40, 64 - 40); x.scale(80 / 24, 80 / 24);
    const p = new Path2D(t.path); x.fillStyle = '#fff'; x.fill(p); x.lineWidth = 1.6; x.lineJoin = 'round'; x.strokeStyle = '#141020'; x.stroke(p);
    if (t.id === 'ghost') { x.fillStyle = '#141020'; x.beginPath(); x.arc(9.3, 10, 1.6, 0, 7); x.arc(14.7, 10, 1.6, 0, 7); x.fill(); }
    if (t.id === 'magnet') { x.fillStyle = '#cfd6e6'; x.fillRect(4, 2.5, 5, 3); x.fillRect(15, 2.5, 5, 3); }
    x.restore();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  };
  const iconGeo = new THREE.PlaneGeometry(0.85, 0.85);
  const icons = TYPES.map(t => {
    const m = new THREE.InstancedMesh(iconGeo, new THREE.MeshBasicMaterial({ map: iconTex(t), transparent: true, alphaTest: 0.05, fog: false }), MAX);
    m.count = 0; m.frustumCulled = false; m.visible = false; m.renderOrder = 6; scene.add(m); return m;
  });

  // per-actor visuals: shield bubble + magnet radius ring
  const bubbleGeo = new THREE.SphereGeometry(1.75, 24, 16);
  const bubbleMat = fresnelMat(0.9, T.shield.color);
  const magRingGeo = new THREE.RingGeometry(MAGNET_R - 0.18, MAGNET_R, 64); magRingGeo.rotateX(-Math.PI / 2);
  const magRingMat = new THREE.MeshBasicMaterial({ color: T.magnet.color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const vis = new Map();
  const visOf = a => {
    let v = vis.get(a);
    if (!v) {
      const bubble = new THREE.Mesh(bubbleGeo, bubbleMat); bubble.visible = false; bubble.renderOrder = 7; scene.add(bubble);
      const mag = new THREE.Mesh(magRingGeo, magRingMat); mag.visible = false; scene.add(mag);
      v = { bubble, mag, ghosted: false, trailT: 0 }; vis.set(a, v);
    }
    return v;
  };

  // ------------------------------------------------------------------ orb placement
  let orbs = [];
  const pickType = zi => {
    let tot = 0; for (const t of TYPES) tot += t.w(zi);
    let r = Math.random() * tot;
    for (const t of TYPES) { r -= t.w(zi); if (r <= 0) return t; }
    return TYPES[0];
  };
  const hz = game.hz;
  const badSpot = (x, z) => {
    for (let dz = -3; dz <= 3; dz += 1) for (const dx of [-1.5, 0, 1.5]) if (game.lavaAt(x + dx, z + dz) || game.pitAt(x + dx, z + dz)) return true;
    if (hz.hurdles.some(h => z > h.minZ - 2.2 && z < h.maxZ + 2.2)) return true;
    if (game.pads.some(p => Math.hypot(p.pos.x - x, p.pos.z - z) < 4.5)) return true;
    if (orbs.some(o => Math.hypot(o.pos.x - x, o.pos.z - z) < 10)) return true;
    return false;
  };
  const findSpot = (zi, out) => {
    const Z = C.ZONES[zi];
    for (let k = 0; k < 40; k++) {
      const x = rand(-13, 13), z = rand(Z.z1 + 6, Z.z0 - 6);
      if (!badSpot(x, z)) { out.set(x, 0, z); return true; }
    }
    return false;
  };
  function build() {
    orbs = [];
    C.ZONES.forEach((Z, zi) => {
      const n = Math.max(2, Math.round(Z.len / 100 * (0.75 + zi * 0.11)));
      for (let k = 0; k < n; k++) {
        const pos = new V3();
        if (!findSpot(zi, pos)) continue;
        orbs.push({ pos, zi, type: pickType(zi), active: true, t: 0, seed: Math.random() * 10, spawnK: 1, decided: new Set() });
      }
    });
    patchHurdles();
  }
  function respawnOrb(o) {
    const old = o.pos.clone(); o.pos.set(1e5, 0, 1e5);
    if (!findSpot(o.zi, o.pos)) o.pos.copy(old);
    o.type = pickType(o.zi); o.active = true; o.spawnK = 0; o.decided.clear();
  }

  // ------------------------------------------------------------------ effects
  const fxOf = a => (a._pu ||= { speed: 0, jump: 0, ghost: 0, magnet: 0, shield: 0, grace: 0, wasGround: true });
  const active = (a, id) => a._pu && a._pu[id] > 0;
  const nearCam = (p, d = 60) => p.distanceToSquared(camera.position) < d * d;

  function sfxPickup(t) {
    if (!sound.ctx) return;
    const b = t.base;
    [1, 1.25, 1.5, 2].forEach((m, i) => sound.tone(b * m, 0.13, { type: 'triangle', vol: 0.11, delay: i * 0.045, rev: 0.25 }));
    sound.tone(b * 4, 0.3, { type: 'sine', vol: 0.06, delay: 0.18, rev: 0.4 });
    sound.hiss(0.18, { vol: 0.12, freq: 2500, sweep: 4000, q: 1 });
    if (t.id === 'shield') sound.tone(b / 2, 0.5, { type: 'sine', vol: 0.12, delay: 0.05, slide: 200, rev: 0.4 });
  }
  function sfxPop() {
    if (!sound.ctx) return;
    sound.hiss(0.12, { vol: 0.55, freq: 5000, type: 'highpass' });
    sound.tone(1400, 0.18, { type: 'sine', vol: 0.22, slide: -900 });
    sound.tone(880, 0.12, { type: 'triangle', vol: 0.14, delay: 0.1 }); sound.tone(1320, 0.3, { type: 'triangle', vol: 0.12, delay: 0.17, rev: 0.5 });
    sound.tone(1760, 0.4, { type: 'sine', vol: 0.07, delay: 0.24, rev: 0.6 });
  }
  function sfxEnd() { if (sound.ctx) { sound.tone(700, 0.12, { type: 'triangle', vol: 0.08, slide: -300 }); } }

  function give(a, t) {
    const f = fxOf(a);
    f[t.id] = Math.max(f[t.id], t.dur);
    if (t.id === 'ghost') setGhost(a, true);
    const isP = a === game.player;
    if (isP || nearCam(a.pos, 70)) {
      const p = a.pos.clone().setY(a.pos.y + 0.6);
      fx.sparkle(p, t.color, game.lowQ ? 14 : 28);
      fx.ring(p.clone().setY(a.pos.y + 1.4), t.color, 3.2, 0.4);
    }
    if (isP) {
      sfxPickup(t); game.float(t.name + '!', a.pos, t.css); game.juice.flash(0.12, t.color);
      st.taken++;
      if (!st.seen[t.id]) { st.seen[t.id] = 1; game.toast(`${t.name}: ${t.desc}`, ''); }
      bumpChip(t.id);
    } else if (nearCam(a.pos, 35)) game.float(t.name, a.pos, t.css);
  }

  // ---- shield: veto deaths, pop the bubble, rescue the actor
  bus.veto('kill', (a, reason) => {
    const f = a._pu; if (!f) return false;
    if (f.grace > 0) { rescue(a, reason, false); return true; }
    if (f.shield <= 0) return false;
    f.shield = 0; f.grace = 1.4;
    rescue(a, reason, true);
    return true;
  });
  function rescue(a, reason, popped) {
    if (reason === 'wave') {
      const LB = C.WAVE_LETHAL_BACK ?? 14;
      let fr = null; for (const w of game.W.fronts) if (!w.done && a.pos.z < w.z + 0.8 && a.pos.z > w.z - LB - 1) { fr = w; break; }
      if (fr) a.pos.z = Math.max(C.TRACK_END + 2, fr.z - LB - 2);
      const pit = hz.pits.find(p => a.pos.z > p.minZ - 1 && a.pos.z < p.maxZ + 1);
      if (pit) { if (pit.gap) a.pos.z = pit.maxZ + 1.5; else a.pos.x = pit.bridgeX; }
      a.vy = 7; a.onGround = false;
    } else if (reason === 'lava') {
      const hv = Math.hypot(a.vel.x, a.vel.z);
      const dz = hv > 2 ? Math.sign(a.vel.z || 1) : 1;
      a.vy = 14; a.onGround = false; a.kb.set(0, 0, dz * 9);
    } else if (reason === 'fall') {
      const pit = hz.pits.find(p => a.pos.z > p.minZ - 1.5 && a.pos.z < p.maxZ + 1.5);
      if (pit && pit.gap) a.pos.z = pit.maxZ + 1.5; else if (pit) a.pos.x = pit.bridgeX; else a.pos.z = Math.min(-1, a.pos.z + 6);
      a.pos.y = 0.2; a.vy = 13; a.onGround = false; a.vel.set(0, 0, 0); a.kb.set(0, 0, 0);
    } else { a.vy = 10; a.onGround = false; }
    if (!popped) return;
    const isP = a === game.player;
    if (isP) st.saves++;
    if (isP || nearCam(a.pos, 70)) {
      const p = a.pos.clone().setY(a.pos.y + 1.3);
      fx.ring(p, 0xffffff, 3.2, 0.3); fx.ring(p, T.shield.color, 5.5, 0.5);
      fx.burst(a.pos, T.shield.color, game.lowQ ? 30 : 60); fx.sparkle(p, 0xffffff, game.lowQ ? 12 : 24);
    }
    if (isP) {
      sfxPop(); game.addShake(0.35); game.juice.flash(0.3, T.shield.color);
      game.bigText('SHIELD SAVED YOU!', reason === 'wave' ? 'the wave washed right over your bubble' : reason === 'lava' ? 'bounced right off the lava' : 'bubbled back up from the abyss');
    } else if (nearCam(a.pos, 40)) game.float('SHIELD POP!', a.pos, T.shield.css);
  }
  bus.on('kill', a => { const f = a._pu; if (!f) return; for (const t of TYPES) f[t.id] = 0; f.grace = 0; setGhost(a, false); });

  // ---- speed burst + ghost vs slow zones; also marks which actor is moving (for ghost hurdle phasing)
  let ghostNow = false;
  bus.mod('speed', a => {
    ghostNow = false;
    const f = a && a._pu; if (!f) return 1;
    let m = 1;
    if (f.speed > 0 && a.pos.z <= 0) m *= SPEED_MUL;
    if (f.ghost > 0) {
      ghostNow = true;
      if (a.onGround && a.pos.y > -0.5) { const s = game.slowAt(a.pos.x, a.pos.z); if (s > 0 && s < 1) m /= s; }
    }
    return m;
  });
  // hurdle colliders report no height while a ghost actor is being moved -> walk straight through
  function patchHurdles() {
    for (const c of hz.hurdles) {
      if (c._puPatched) continue;
      let h = c.h;
      Object.defineProperty(c, 'h', { get() { return ghostNow ? -99 : h; }, set(v) { h = v; }, configurable: true, enumerable: true });
      c._puPatched = true;
    }
  }
  // ghost look: swap the character's materials for translucent clones (hold subtree untouched)
  const ghostMats = new Map();
  const ghostOf = m => {
    let g = ghostMats.get(m);
    if (!g) { g = m.clone(); g.transparent = true; g.opacity = 0.35 * (m.opacity ?? 1); g.depthWrite = false; if (g.emissive) { g.emissive = new THREE.Color(0x9a7cff); g.emissiveIntensity = 0.5; } g.userData = { ...m.userData, puGhostOf: m }; ghostMats.set(m, g); }
    return g;
  };
  function setGhost(a, on) {
    const v = visOf(a); if (v.ghosted === on) return; v.ghosted = on;
    const hold = a.obj.userData && a.obj.userData.hold;
    const walk = o => {
      if (o === hold) return;
      if (o.isMesh && o.material && !Array.isArray(o.material)) {
        if (on && !o.material.userData?.puGhostOf) o.material = ghostOf(o.material);
        else if (!on && o.material.userData?.puGhostOf) o.material = o.material.userData.puGhostOf;
      }
      for (const ch of o.children) walk(ch);
    };
    walk(a.obj);
  }

  // ---- bots: sometimes detour for an orb that's roughly on the way (after a human reaction delay)
  const detours = new Map();
  const origRoute = game.routeNext;
  game.routeNext = (a, tgt) => {
    if (a.isBot) {
      const d = detours.get(a);
      if (d && d.react <= 0 && d.orb.active && !a.ai.hide && a.pos.z < -0.5 && !a.swept && !a.dead) return d.orb.pos;
    }
    return origRoute(a, tgt);
  };
  function botThink(b, dt) {
    let d = detours.get(b);
    if (d) {
      d.react -= dt; d.left -= dt;
      if (!d.orb.active || d.left <= 0 || b.ai.hide || b.pos.distanceTo(d.orb.pos) > 16) detours.delete(b);
      return;
    }
    b._puThink = (b._puThink || 0) - dt; if (b._puThink > 0) return; b._puThink = rand(0.35, 0.6);
    if (b.pos.z > -2 || b.ai.hide || b.swept > 0 || b.dead > 0 || b.stun > 0) return;
    const mode = b.ai.mode; if (mode !== 'hunt' && mode !== 'return') return;
    for (const o of orbs) {
      if (!o.active || o.decided.has(b)) continue;
      const dist = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z);
      if (dist > 12) continue;
      let onWay;
      if (mode === 'hunt') { const t = b.ai.target; onWay = t && (dist + Math.hypot(t.pos.x - o.pos.x, t.pos.z - o.pos.z) < Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z) + 9); }
      else onWay = o.pos.z > b.pos.z - 3;
      o.decided.add(b);
      // shields are more tempting deep in the track; carrying makes bots less greedy
      const want = (onWay ? 0.38 : 0.08) * (b.carry ? 0.6 : 1) * (o.type.id === 'shield' ? 1.5 : 1) * (game.W.state === 'run' ? 0.5 : 1);
      if (Math.random() < want) { detours.set(b, { orb: o, react: rand(0.25, 0.75), left: 4.5 }); return; }
    }
  }

  // ------------------------------------------------------------------ HUD chips (bottom-centre, above #prompt)
  const css = document.createElement('style');
  css.textContent = `
#puChips { position: absolute; left: 50%; bottom: 128px; transform: translateX(-50%); display: flex; gap: 8px; pointer-events: none; z-index: 5; }
#puChips.hidden { display: none; }
.puChip { position: relative; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 35%, var(--c), rgba(20,16,32,.92) 75%); border: 3px solid #141020; box-shadow: 0 4px 0 #141020, inset 0 0 0 2px rgba(255,255,255,.14);
  animation: puIn .3s cubic-bezier(.2,1.6,.4,1); }
.puChip > svg.ring { position: absolute; inset: -3px; width: 48px; height: 48px; transform: rotate(-90deg); }
.puChip > svg.ring circle { fill: none; stroke: #fff; stroke-width: 3.2; stroke-linecap: round; }
.puChip .sec { position: absolute; right: -6px; bottom: -6px; font-size: 13px; line-height: 1; padding: 2px 4px; border-radius: 7px; background: #141020; color: #fff; }
.puChip.low { animation: puBlink .35s ease-in-out infinite alternate; }
.puChip.bump { animation: puBump .35s cubic-bezier(.2,1.8,.4,1); }
@keyframes puIn { from { transform: scale(.2); opacity: 0; } }
@keyframes puBump { 40% { transform: scale(1.3); } }
@keyframes puBlink { to { opacity: .35; } }
@media (max-width: 760px), (pointer: coarse) { .puChip { width: 36px; height: 36px; } .puChip > svg.ring { width: 36px; height: 36px; } .puChip .sec { font-size: 10px; } #puChips { gap: 5px; } }
`;
  document.head.appendChild(css);
  const host = document.getElementById('hud') || document.getElementById('prompt')?.parentElement || document.body;
  const chipBox = document.createElement('div'); chipBox.id = 'puChips'; chipBox.className = 'hidden'; host.appendChild(chipBox);
  const chips = {};
  const CIRC = 2 * Math.PI * 21;
  for (const t of TYPES) {
    const d = document.createElement('div'); d.className = 'puChip'; d.style.setProperty('--c', t.css); d.title = t.name;
    d.innerHTML = `<svg class="ring" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg>${svgIcon(t, game.isTouch ? 18 : 24)}<span class="sec"></span>`;
    chips[t.id] = { d, c: d.querySelector('circle'), s: d.querySelector('.sec'), on: false, low: false };
  }
  function bumpChip(id) { const c = chips[id]; if (!c || !c.on) return; c.d.classList.remove('bump'); void c.d.offsetWidth; c.d.classList.add('bump'); }
  let hudT = 0;
  function updateHud(dt) {
    hudT -= dt; if (hudT > 0) return; hudT = 0.1;
    const f = game.player._pu;
    let any = false;
    for (const t of TYPES) {
      const c = chips[t.id], left = f ? f[t.id] : 0, on = left > 0;
      if (on !== c.on) {
        c.on = on;
        if (on) { chipBox.appendChild(c.d); c.d.classList.remove('bump'); c.d.style.animation = 'none'; void c.d.offsetWidth; c.d.style.animation = ''; }
        else { c.d.remove(); if (game.started) sfxEnd(); }
      }
      if (!on) continue;
      any = true;
      c.c.setAttribute('stroke-dashoffset', String(CIRC * (1 - Math.min(1, left / t.dur))));
      c.s.textContent = Math.ceil(left) + 's';
      const low = left < 2 && t.id !== 'shield';
      if (low !== c.low) { c.low = low; c.d.classList.toggle('low', low); }
    }
    chipBox.classList.toggle('hidden', !any || !game.started);
    if (!any) return;
    // sit just above the prompt (and above carry info when it's showing)
    let top = innerHeight - 128;
    for (const id of ['prompt', 'carryInfo']) {
      const el = document.getElementById(id);
      if (!el || el.classList.contains('hidden') || !el.textContent.trim() || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect(); if (r.height > 0 && r.top < innerHeight) top = Math.min(top, r.top - 6);
    }
    if (game.isTouch || innerWidth < 760) top = Math.min(top, innerHeight - 280);
    chipBox.style.bottom = Math.round(innerHeight - top) + 'px';
  }

  // ------------------------------------------------------------------ per-frame
  const dummy = new THREE.Object3D(), col = new THREE.Color(), tmp = new V3();
  let time = 0;
  bus.on('tick', dt => {
    time += dt;
    shellMat.uniforms.uT.value = time; bubbleMat.uniforms.uT.value = time;
    const cz = camera.position.z;
    // ---- orbs: respawn timers + pickups
    for (const o of orbs) {
      if (!o.active) { o.t -= dt; if (o.t <= 0) respawnOrb(o); continue; }
      if (o.spawnK < 1) o.spawnK = Math.min(1, o.spawnK + dt * 2);
      for (const a of game.actors) {
        if (a.swept > 0 || a.dead > 0) continue;
        const dx = a.pos.x - o.pos.x, dz = a.pos.z - o.pos.z;
        if (dx * dx + dz * dz < PICK_R * PICK_R && a.pos.y < 3.2 && a.pos.y > -1) {
          o.active = false; o.t = rand(40, 70);
          give(a, o.type);
          if (a.isBot) { const d = detours.get(a); if (d && d.orb === o) detours.delete(a); }
          break;
        }
      }
    }
    // ---- actor effects
    for (const a of game.actors) {
      const f = a._pu;
      const v = vis.get(a);
      if (f) {
        const dead = a.swept > 0 || a.dead > 0;
        for (const t of TYPES) if (f[t.id] > 0) { f[t.id] -= dt; if (f[t.id] <= 0) { f[t.id] = 0; if (t.id === 'ghost') setGhost(a, false); } }
        if (f.grace > 0) f.grace -= dt;
        // super jump: boost the take-off impulse the frame the actor leaves the ground
        if (f.jump > 0 && f.wasGround && !a.onGround && a.vy > 9 && a.vy <= 12.01 && a.stun <= 0 && !dead) {
          let k = JUMP_MUL;
          if (a.isBot) { // bots only take the big jump when the landing looks safe
            const vy = a.vy * k, air = 2 * vy / 32;
            const lx = a.pos.x + a.vel.x * air, lz = a.pos.z + a.vel.z * air;
            if (game.lavaAt(lx, lz) || game.pitAt(lx, lz)) k = 1;
          }
          if (k > 1) {
            a.vy *= k;
            if (a === game.player) { if (sound.ctx) { sound.tone(330, 0.3, { type: 'triangle', vol: 0.12, slide: 900 }); sound.hiss(0.25, { vol: 0.12, freq: 900, sweep: 3000 }); } }
            if (nearCam(a.pos, 50)) { fx.ring(tmp.copy(a.pos).setY(0.15), T.jump.color, 2.6, 0.35, true); fx.sparkle(a.pos, T.jump.color, game.lowQ ? 6 : 12); }
          }
        }
        f.wasGround = a.onGround;
        // magnet: snap up nearby creatures when hands are free
        if (f.magnet > 0 && !a.carry && !dead && a.pos.z < -0.5 && a.stun <= 0) {
          for (const w of game.wilds) {
            const dx = w.pos.x - a.pos.x, dz = w.pos.z - a.pos.z;
            if (dx * dx + dz * dz > MAGNET_R * MAGNET_R) continue;
            const from = w.pos.clone();
            if (game.grabWild(a, w)) {
              if (nearCam(a.pos, 60)) {
                for (let i = 0; i < (game.lowQ ? 8 : 16); i++) { const k = i / 16; fx.glow.emit(from.x + (a.pos.x - from.x) * k, 1.2 + Math.sin(k * Math.PI), from.z + (a.pos.z - from.z) * k, 0, 1.5, 0, { color: T.magnet.color, size: 0.5, life: 0.4 + k * 0.3, drag: 2 }); }
                fx.ring(tmp.copy(a.pos).setY(1.3), T.magnet.color, 2.4, 0.3);
              }
              if (a === game.player) game.float('MAGNET!', a.pos, T.magnet.css);
              break;
            }
          }
        }
        // trails while active
        if (v && !dead && nearCam(a.pos, 55)) {
          v.trailT -= dt;
          if (v.trailT <= 0) {
            v.trailT = game.lowQ ? 0.09 : 0.045;
            if (f.speed > 0 && Math.hypot(a.vel.x, a.vel.z) > 3) fx.glow.emit(a.pos.x + rand(-0.4, 0.4), a.pos.y + rand(0.4, 2), a.pos.z + rand(-0.4, 0.4), -a.vel.x * 0.15, 0.3, -a.vel.z * 0.15, { color: T.speed.color, size: rand(0.25, 0.5), life: 0.35, drag: 2 });
            if (f.ghost > 0) fx.glow.emit(a.pos.x + rand(-0.6, 0.6), a.pos.y + rand(0.5, 2.4), a.pos.z + rand(-0.6, 0.6), 0, rand(0.5, 1.4), 0, { color: T.ghost.color, size: rand(0.3, 0.6), life: 0.6, drag: 1 });
            if (f.jump > 0 && Math.random() < 0.4) fx.glow.emit(a.pos.x + rand(-0.5, 0.5), a.pos.y + 0.15, a.pos.z + rand(-0.5, 0.5), 0, rand(1.5, 3), 0, { color: T.jump.color, size: 0.3, life: 0.5, drag: 1 });
          }
        }
      }
      if (f && v && v.ghosted && !(f.ghost > 0)) setGhost(a, false);
      const shielded = f && (f.shield > 0 || f.grace > 0.9);
      const magOn = f && f.magnet > 0 && a.pos.z < -0.5;
      if (shielded || magOn) {
        const vv = visOf(a), show = a.obj.visible && !(a.swept > 0) && Math.abs(a.pos.z - cz) < 120;
        vv.bubble.visible = show && shielded;
        if (vv.bubble.visible) { vv.bubble.position.set(a.pos.x, a.pos.y + 1.35, a.pos.z); vv.bubble.scale.setScalar(1 + Math.sin(time * 5) * 0.035); }
        vv.mag.visible = show && magOn && (a === game.player || Math.abs(a.pos.z - cz) < 60);
        if (vv.mag.visible) { vv.mag.position.set(a.pos.x, 0.12, a.pos.z); vv.mag.rotation.y = time * 1.5; }
      } else if (v) { v.bubble.visible = false; v.mag.visible = false; }
    }
    // ---- bots
    for (const b of game.bots) botThink(b, dt);
    // ---- instance rendering (near orbs only)
    const counts = [0, 0, 0, 0, 0]; let ns = 0;
    const camQ = camera.quaternion;
    for (const o of orbs) {
      if (!o.active || o.pos.z > cz + 40 || o.pos.z < cz - 170) continue;
      const ti = o.type.i, s = o.spawnK < 1 ? 1 - Math.pow(1 - o.spawnK, 3) : 1; const sc = s * 1.35;
      const y = 1.5 + Math.sin(time * 2.2 + o.seed) * 0.22;
      dummy.position.set(o.pos.x, y, o.pos.z);
      dummy.rotation.set(o.type.id === 'magnet' ? 0 : Math.sin(time + o.seed) * 0.3, time * 1.8 + o.seed, 0);
      dummy.scale.setScalar(sc); if (o.type.id === 'speed') dummy.scale.y = sc * 1.5;
      dummy.updateMatrix(); cores[ti].setMatrixAt(counts[ti], dummy.matrix);
      // icon badge above the orb, facing the camera
      dummy.position.set(o.pos.x, y + 1.85, o.pos.z); dummy.quaternion.copy(camQ); dummy.scale.setScalar(s * 1.15);
      dummy.updateMatrix(); icons[ti].setMatrixAt(counts[ti], dummy.matrix);
      counts[ti]++;
      dummy.position.set(o.pos.x, y, o.pos.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc * (1 + Math.sin(time * 4 + o.seed) * 0.06));
      dummy.updateMatrix(); shell.setMatrixAt(ns, dummy.matrix);
      col.setHex(o.type.color); shell.setColorAt(ns, col);
      dummy.position.set(o.pos.x, 0.08, o.pos.z); dummy.scale.setScalar(sc * (1.1 + ((time * 0.8 + o.seed) % 1) * 0.6));
      dummy.updateMatrix(); ring.setMatrixAt(ns, dummy.matrix); ring.setColorAt(ns, col);
      ns++;
      if (ns >= MAX) break;
    }
    for (let i = 0; i < TYPES.length; i++) {
      cores[i].count = icons[i].count = counts[i]; cores[i].visible = icons[i].visible = counts[i] > 0;
      if (counts[i]) { cores[i].instanceMatrix.needsUpdate = true; icons[i].instanceMatrix.needsUpdate = true; }
    }
    shell.count = ring.count = ns; shell.visible = ring.visible = ns > 0;
    if (ns) { shell.instanceMatrix.needsUpdate = ring.instanceMatrix.needsUpdate = true; shell.instanceColor.needsUpdate = ring.instanceColor.needsUpdate = true; }
    updateHud(dt);
  });

  bus.on('travel', () => { build(); detours.clear(); });
  bus.on('boot', () => { if (!orbs.length) build(); });
  bus.on('respawn', a => { if (a._pu) a._pu.wasGround = true; });
  build();

  // debug helper for testing in the console
  window.__pu = { give: (id = 'shield', a = game.player) => give(a, T[id]), orbs: () => orbs, types: T };
}
