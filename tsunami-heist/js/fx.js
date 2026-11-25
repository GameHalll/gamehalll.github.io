import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { softDot } from './textures.js';

// ------------------------------------------------ post processing
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.3 }, uVig: { value: 0.32 }, uDanger: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: 0 }, uAberr: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uVig, uDanger, uTime, uSpeed, uAberr, uFlash; uniform vec3 uFlashCol; varying vec2 vUv;
    float h11(float n){ return fract(sin(n) * 43758.5453); }
    void main(){
      vec2 d0 = vUv - 0.5; float r0 = length(d0);
      vec4 c = texture2D(tDiffuse, vUv);
      // chromatic aberration (big hits) - pushes R/B apart towards the edges
      if (uAberr > 0.001) {
        vec2 o = d0 * uAberr * 0.035 * (0.3 + r0);
        c.r = texture2D(tDiffuse, vUv + o).r; c.b = texture2D(tDiffuse, vUv - o).b;
      }
      // speed: cheap radial blur on the periphery + streaky speed lines
      if (uSpeed > 0.001) {
        float m = smoothstep(0.18, 0.6, r0) * uSpeed;
        vec3 acc = c.rgb;
        for (int i = 1; i <= 3; i++) acc += texture2D(tDiffuse, vUv - d0 * float(i) * 0.018 * m).rgb;
        c.rgb = mix(c.rgb, acc * 0.25, min(1.0, m * 1.6));
        float a = atan(d0.y, d0.x) * 38.0, cell = floor(a);
        float seed = h11(cell + floor(uTime * 14.0) * 7.13);
        float line = step(0.82, seed) * smoothstep(0.5, 0.0, abs(fract(a) - 0.5) - 0.2);
        float reach = mix(0.28, 0.45, h11(cell * 3.1 + floor(uTime * 14.0)));
        c.rgb = mix(c.rgb, vec3(1.0), line * smoothstep(reach, reach + 0.25, r0) * uSpeed * 0.32);
      }
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb *= vec3(1.03, 1.0, 0.97);
      c.rgb = (c.rgb - 0.5) * 1.08 + 0.5;                    // contrast
      vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.2, length(d) * (1.0 + uVig));
      c.rgb *= mix(1.0, v, 0.6);
      float edge = smoothstep(0.25, 0.75, length(d));
      c.rgb = mix(c.rgb, vec3(1.0, 0.1, 0.18), uDanger * edge * (0.55 + 0.15 * sin(uTime * 12.0)));
      c.rgb += uFlashCol * uFlash * (0.35 + edge * 0.65);   // impact / reward flash
      gl_FragColor = c;
    }`,
};

export function makeComposer(renderer, scene, camera, { lowQuality }) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: lowQuality ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), lowQuality ? 0.3 : 0.42, 0.45, 1.35);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, bloom, grade, setSize(w, h) { composer.setSize(w, h); } };
}

// ------------------------------------------------ juice: hit-stop, aberration, screen flash, speed lines
// time-scale + post uniforms, driven from main.js (all decays use real time, so hit-stop never stalls them)
export function makeJuice(grade) {
  const U = grade.uniforms;
  let stop = 0, ab = 0, fl = 0, spd = 0;
  return {
    hitStop(t) { stop = Math.max(stop, t); },
    aberr(v) { ab = Math.max(ab, v); },
    flash(v, color = 0xffffff) { if (v >= fl) { fl = v; U.uFlashCol.value.set(color); } },
    // multiply the simulation dt by this; ~frozen during a hit-stop
    scale(dt) { if (stop > 0) { stop -= dt; return 0.05; } return 1; },
    get stopped() { return stop > 0; },
    update(dt, speed01 = 0) {
      ab *= Math.exp(-7 * dt); fl *= Math.exp(-9 * dt);
      spd += (speed01 - spd) * (1 - Math.exp(-4 * dt));
      U.uAberr.value = ab < 0.01 ? 0 : ab; U.uFlash.value = fl < 0.005 ? 0 : fl; U.uSpeed.value = spd < 0.01 ? 0 : spd;
    },
  };
}

// ------------------------------------------------ particles
// one Points object per blending mode; CPU-simulated, cheap and plenty for this game
class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max); this.size0 = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 400 } },
      vertexShader: `uniform float scale; attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, { color = 0xffffff, size = 1, life = 1, grav = 0, drag = 0, grow = 0 } = {}) {
    if (this.n >= this.max) return;
    const i = this.n++, c = _c.set(color);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = this.size0[i] = size; this.life[i] = this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.alpha[i] = 1;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.copy(--this.n, i); i--; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 12 + 0.2);
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - t));
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
  copy(from, to) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; this.col[to * 3 + k] = this.col[from * 3 + k]; }
    this.size[to] = this.size[from]; this.size0[to] = this.size0[from]; this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.grow[to] = this.grow[from]; this.alpha[to] = this.alpha[from];
  }
}
const _c = new THREE.Color();

export function makeParticles(scene) {
  const soft = new Particles(scene, 4000, false);
  const glow = new Particles(scene, 2500, true);
  const r = (a, b) => a + Math.random() * (b - a);
  // pooled expanding rings (impact shockwaves, landings); billboarded unless flat
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  const rings = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.visible = false; m.frustumCulled = false; m.renderOrder = 6; m.userData = { t: 0, life: 1, r: 1, flat: false };
    m.onBeforeRender = (_r, _s, cam) => { if (!m.userData.flat) m.quaternion.copy(cam.quaternion); };
    scene.add(m); rings.push(m);
  }
  let ringI = 0;
  const ring = (x, y, z, color, radius = 3, life = 0.35, flat = false) => {
    const m = rings[ringI++ % rings.length], u = m.userData;
    u.t = 0; u.life = life; u.r = radius; u.flat = flat; m.visible = true;
    m.position.set(x, y, z); m.material.color.set(color); m.scale.setScalar(0.01);
    if (flat) m.rotation.set(-Math.PI / 2, 0, 0);
  };
  const updRings = dt => {
    for (const m of rings) {
      if (!m.visible) continue;
      const u = m.userData; u.t += dt; const k = u.t / u.life;
      if (k >= 1) { m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      m.scale.setScalar(Math.max(0.01, u.r * e)); m.material.opacity = (1 - k) * (1 - k) * 0.9;
    }
  };
  const GOLD = [0xffd23f, 0xffe27a, 0xffb520];
  return {
    soft, glow,
    setScale(h) { soft.mat.uniforms.scale.value = glow.mat.uniforms.scale.value = h * 0.6; },
    update(dt) { soft.update(dt); glow.update(dt); updRings(dt); },
    ring(p, color = 0xffffff, radius = 3, life = 0.35, flat = false) { ring(p.x, p.y, p.z, color, radius, life, flat); },
    // footstep kick: a few grains thrown backwards, scaled by speed (sp ~0..1)
    kick(p, color, vx, vz, sp = 0.5, n = 2) { for (let i = 0; i < n; i++) soft.emit(p.x + r(-0.25, 0.25), 0.15, p.z + r(-0.25, 0.25), -vx * r(0.05, 0.15) + r(-0.8, 0.8), r(1, 2.5) + sp * 2, -vz * r(0.05, 0.15) + r(-0.8, 0.8), { color, size: r(0.3, 0.55) * (0.8 + sp * 0.6), life: r(0.3, 0.5), grav: 9, drag: 2.5, grow: 0.8 }); },
    // landing puff: a flat ring of dust spreading outward
    land(p, color = 0xe8d2a0, strength = 1, n = 12) {
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r(-0.2, 0.2), s = r(3, 6) * strength; soft.emit(p.x + Math.cos(a) * 0.4, 0.2, p.z + Math.sin(a) * 0.4, Math.cos(a) * s, r(0.3, 1.2), Math.sin(a) * s, { color, size: r(0.6, 1.0), life: r(0.35, 0.6), grav: -0.3, drag: 5, grow: 1.6 }); }
      if (strength > 0.9) ring(p.x, 0.12, p.z, color, 2.2 * strength, 0.3, true);
    },
    jumpPuff(p, color = 0xe8d2a0, n = 5) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; soft.emit(p.x, 0.15, p.z, Math.cos(a) * r(1.5, 3), r(0.2, 0.8), Math.sin(a) * r(1.5, 3), { color, size: r(0.45, 0.7), life: r(0.25, 0.4), drag: 5, grow: 1.2 }); } },
    // bat impact: shockwave ring + orbiting stars over the victim's head
    impact(p, color = 0xffe27a, strong = false) {
      ring(p.x, p.y + 2, p.z, 0xffffff, strong ? 3.6 : 2.6, 0.28);
      ring(p.x, p.y + 2, p.z, color, strong ? 5 : 3.6, 0.42);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; glow.emit(p.x + Math.cos(a) * 0.7, p.y + 3.2, p.z + Math.sin(a) * 0.7, -Math.sin(a) * 2.2, r(0.4, 1), Math.cos(a) * 2.2, { color: i % 2 ? 0xffe27a : 0xffffff, size: r(0.55, 0.8), life: r(0.6, 0.85), grav: 1.5, drag: 0.6 }); }
    },
    // rarity pillar: a column of light rising from the grab spot
    pillar(p, color, n = 30, h = 1) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, rr = r(0, 0.7); glow.emit(p.x + Math.cos(a) * rr, p.y + r(0, 1), p.z + Math.sin(a) * rr, Math.cos(a) * 0.4, r(8, 22) * h, Math.sin(a) * 0.4, { color: Math.random() < 0.2 ? 0xffffff : color, size: r(0.35, 0.8), life: r(0.6, 1.1), grav: 4, drag: 1.2 }); }
      ring(p.x, 0.15, p.z, color, 3.2, 0.5, true);
    },
    // coin fountain: gold arcs up and rains back down
    coins(p, n = 14) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = r(1, 3.2); glow.emit(p.x, p.y + 1.6, p.z, Math.cos(a) * s, r(7, 12), Math.sin(a) * s, { color: GOLD[i % 3], size: r(0.4, 0.65), life: r(0.8, 1.2), grav: 20, drag: 0.4 }); } },
    // wipeout: big white burst of water around the victim
    wipeout(p, n = 40) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = r(3, 9); soft.emit(p.x, p.y + 1, p.z, Math.cos(a) * s, r(5, 14), Math.sin(a) * s, { color: Math.random() < 0.65 ? 0xffffff : 0x9fdcff, size: r(0.9, 2), life: r(0.6, 1.1), grav: 20, drag: 0.8, grow: 0.8 }); }
      ring(p.x, p.y + 1.5, p.z, 0xbfeaff, 5, 0.45);
    },
    // lava burn: thick dark smoke rising plus a few embers
    smoke(p, n = 18) {
      for (let i = 0; i < n; i++) soft.emit(p.x + r(-0.6, 0.6), p.y + r(0.3, 2), p.z + r(-0.6, 0.6), r(-0.8, 0.8), r(2, 5), r(-0.8, 0.8), { color: Math.random() < 0.5 ? 0x2a2224 : 0x4a3c3a, size: r(1.4, 2.4), life: r(1, 1.8), grav: -0.6, drag: 1, grow: 2.2 });
      for (let i = 0; i < n * 0.6; i++) this.ember(p.x + r(-0.8, 0.8), p.y + r(0, 1.5), p.z + r(-0.8, 0.8));
    },
    // abyss fall: a spiral of motes sucked downward into the pit
    swirl(p, color = 0xc69bff, n = 28) {
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 4, rr = 1.6 + (i / n) * 1.6; glow.emit(p.x + Math.cos(a) * rr, p.y + 1.5, p.z + Math.sin(a) * rr, -Math.sin(a) * 4 - Math.cos(a) * 1.2, r(-2, 1), Math.cos(a) * 4 - Math.sin(a) * 1.2, { color: i % 3 ? color : 0x7ad8ff, size: r(0.3, 0.6), life: r(0.7, 1.2), grav: 7, drag: 0.8 }); }
      ring(p.x, p.y + 0.5, p.z, color, 3.5, 0.6, true);
    },
    dust(p, color = 0xe8d2a0) { soft.emit(p.x + r(-0.3, 0.3), 0.2, p.z + r(-0.3, 0.3), r(-1, 1), r(0.5, 1.5), r(-1, 1), { color, size: r(0.5, 0.9), life: r(0.4, 0.7), grav: -0.5, drag: 3, grow: 1.5 }); },
    splash(x, y, z, n = 30, spread = 6) { for (let i = 0; i < n; i++) soft.emit(x + r(-spread, spread), y, z + r(-1, 1), r(-4, 4), r(6, 16), r(0, 8), { color: Math.random() < 0.7 ? 0xffffff : 0xbfeaff, size: r(0.8, 2.2), life: r(0.7, 1.4), grav: 22, drag: 0.6, grow: 0.6 }); },
    spray(x, y, z, w) { for (let i = 0; i < 3; i++) soft.emit(x + r(-w, w), y + r(-1, 1), z + r(-0.5, 1), r(-1, 1), r(1, 5), r(2, 7), { color: 0xffffff, size: r(1.5, 3.5), life: r(0.6, 1.2), grav: 4, drag: 1.2, grow: 1.4 }); },
    hit(p, color = 0xffe27a) { for (let i = 0; i < 18; i++) glow.emit(p.x, p.y + 2, p.z, r(-8, 8), r(-2, 8), r(-8, 8), { color, size: r(0.25, 0.6), life: r(0.25, 0.5), grav: 10, drag: 2 }); soft.emit(p.x, p.y + 2, p.z, 0, 0, 0, { color: 0xffffff, size: 3.5, life: 0.18, grow: 1.5 }); },
    sparkle(p, color = 0xffe27a, n = 24) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; glow.emit(p.x, p.y + 1, p.z, Math.cos(a) * r(2, 6), r(2, 9), Math.sin(a) * r(2, 6), { color, size: r(0.3, 0.7), life: r(0.5, 1), grav: 8, drag: 1.5 }); } },
    ember(x, y, z) { glow.emit(x, y, z, r(-0.5, 0.5), r(1.5, 4), r(-0.5, 0.5), { color: Math.random() < 0.5 ? 0xff7a1a : 0xffc04a, size: r(0.2, 0.45), life: r(1, 2.2), grav: -0.4, drag: 0.5 }); },
    mote(x, y, z, color) { glow.emit(x, y, z, r(-0.3, 0.3), r(0.3, 1.2), r(-0.3, 0.3), { color, size: r(0.15, 0.35), life: r(1.5, 3), grav: -0.1, drag: 0.3 }); },
    snow(x, y, z) { soft.emit(x, y, z, r(-1, 1), r(-2, -1), r(-1, 1), { color: 0xffffff, size: r(0.2, 0.4), life: r(2, 4), drag: 0.2 }); },
    cash(p) { for (let i = 0; i < 10; i++) glow.emit(p.x, p.y + 1.5, p.z, r(-2, 2), r(4, 8), r(-2, 2), { color: 0x7dff9a, size: r(0.3, 0.6), life: r(0.5, 0.9), grav: 12, drag: 1 }); },
    burst(p, color, n = 60) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = r(-0.3, 1); glow.emit(p.x, p.y + 2, p.z, Math.cos(a) * r(4, 12), e * 10, Math.sin(a) * r(4, 12), { color, size: r(0.4, 0.9), life: r(0.6, 1.3), grav: 6, drag: 1.8 }); } },
  };
}
