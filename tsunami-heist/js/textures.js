import * as THREE from 'three';

// ------------------------------------------------ tileable value noise
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const p = Array.from({ length: 256 }, (_, i) => i).sort(() => rnd() - 0.5);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => rnd());
  const fade = t => t * t * (3 - 2 * t);
  // period-wrapped 2D value noise
  return (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const w = v => ((v % per) + per) % per;
    const h = (a, b) => val[perm[(perm[w(a) & 255] + w(b)) & 255]];
    const u = fade(xf), v = fade(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const N1 = makeNoise(1), N2 = makeNoise(7);
export function fbm(x, y, per, oct = 4, n = N1) {
  let a = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { a += n(x * f, y * f, per * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return a / tot;
}

const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/**
 * Build a tileable surface. `fn(u, v)` (u, v in [0,1)) returns { h: height 0..1, c: [r,g,b], e?: [r,g,b] emissive, r?: roughness 0..1 }.
 */
export function surface(size, fn, { normalStrength = 2.5, repeat = [1, 1], emissive = false, rough = false } = {}) {
  const H = new Float32Array(size * size);
  const col = new Uint8ClampedArray(size * size * 4);
  const em = emissive ? new Uint8ClampedArray(size * size * 4) : null;
  const ro = rough ? new Uint8ClampedArray(size * size * 4) : null;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, o = fn(x / size, y / size);
    H[i] = o.h;
    col[i * 4] = o.c[0]; col[i * 4 + 1] = o.c[1]; col[i * 4 + 2] = o.c[2]; col[i * 4 + 3] = 255;
    if (em) { const e = o.e || [0, 0, 0]; em[i * 4] = e[0]; em[i * 4 + 1] = e[1]; em[i * 4 + 2] = e[2]; em[i * 4 + 3] = 255; }
    if (ro) { const r = (o.r ?? 0.8) * 255; ro[i * 4] = r; ro[i * 4 + 1] = r; ro[i * 4 + 2] = r; ro[i * 4 + 3] = 255; }
  }
  const nrm = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const g = (xx, yy) => H[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (g(x + 1, y) - g(x - 1, y)) * normalStrength, dy = (g(x, y + 1) - g(x, y - 1)) * normalStrength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    nrm[i] = (-dx / l * 0.5 + 0.5) * 255; nrm[i + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[i + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
  }
  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  return { map: tex(col, true), normalMap: tex(nrm, false), emissiveMap: em ? tex(em, true) : null, roughnessMap: ro ? tex(ro, false) : null };
}

// ------------------------------------------------ the library
const cache = {};
export function getSurface(name) {
  if (cache[name]) return cache[name];
  const S = 256;
  let s;
  switch (name) {
    case 'sand': s = surface(S, (u, v) => {
      const n = fbm(u * 8, v * 8, 8, 5), rip = Math.sin((v * 22 + fbm(u * 3, v * 3, 3, 3) * 6) * Math.PI * 2) * 0.5 + 0.5;
      const h = n * 0.6 + rip * 0.25 + (N2(u * 64, v * 64, 64) > 0.92 ? 0.3 : 0);
      return { h, c: lerpC(hex(0xd9b77a), hex(0xf7e2ae), Math.min(1, n * 1.2 + rip * 0.15)) };
    }, { normalStrength: 3 }); break;
    case 'wetsand': s = surface(S, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 5), p = fbm(u * 3 + 9, v * 3, 3, 3);
      const wet = p > 0.55 ? 1 : 0;
      return { h: n * 0.7 - wet * 0.2, c: lerpC(hex(0xb08d5a), hex(0xd6b47c), n) .map((c, k) => wet ? c * 0.78 : c), r: wet ? 0.15 : 0.85 };
    }, { rough: true }); break;
    case 'reef': s = surface(S, (u, v) => {
      const n = fbm(u * 8, v * 8, 8, 5), d = N2(u * 40, v * 40, 40);
      const c = d > 0.86 ? hex(0xff8fb0) : d < 0.1 ? hex(0x6fe0d0) : lerpC(hex(0xf0c9a8), hex(0xfbe3cc), n);
      return { h: n * 0.6 + (d > 0.86 ? 0.4 : 0), c };
    }); break;
    case 'jungle': s = surface(S, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 5), m = fbm(u * 8 + 3, v * 8, 8, 4);
      const moss = m > 0.52 ? Math.min(1, (m - 0.52) * 3) * 0.75 : 0;
      return { h: n * 0.8 + moss * 0.15, c: lerpC(lerpC(hex(0x6b4a2e), hex(0x8f6a42), n), lerpC(hex(0x3f7a2c), hex(0x5fa83a), n), moss) };
    }); break;
    case 'volcano': s = surface(S, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 5);
      const cr = Math.abs(fbm(u * 4, v * 4, 4, 4, N2) - 0.5); // ridged → cracks
      const crack = cr < 0.025 ? 1 - cr / 0.025 : 0;
      return { h: n * 0.8 - crack * 0.5, c: lerpC(lerpC(hex(0x1d1a1c), hex(0x3a3236), n), hex(0xff5a1a), crack), e: crack ? [255 * crack, 90 * crack, 20 * crack] : [0, 0, 0], r: 0.9 };
    }, { emissive: true, normalStrength: 4 }); break;
    case 'glacier': s = surface(S, (u, v) => {
      const n = fbm(u * 5, v * 5, 5, 5), cr = Math.abs(fbm(u * 3, v * 3, 3, 3, N2) - 0.5);
      const crack = cr < 0.02 ? 1 : 0;
      return { h: n * 0.4 - crack * 0.3, c: crack ? hex(0x7fb8e0) : lerpC(hex(0xcfe9fb), hex(0xffffff), n), r: 0.1 + n * 0.25 };
    }, { rough: true, normalStrength: 2 }); break;
    case 'abyss': s = surface(S, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 5), g = N2(u * 50, v * 50, 50);
      const glint = g > 0.94 ? (g - 0.94) / 0.06 : 0;
      return { h: n * 0.8 + glint * 0.3, c: lerpC(lerpC(hex(0x1c1430), hex(0x382a5c), n), hex(0xc69bff), glint), e: [180 * glint, 110 * glint, 255 * glint], r: 0.55 };
    }, { emissive: true, normalStrength: 3 }); break;
    case 'tiles': s = surface(S, (u, v) => {
      const tu = (u * 4) % 1, tv = (v * 4) % 1, gap = tu < 0.03 || tv < 0.03;
      const n = fbm(u * 10, v * 10, 10, 4), id = N2(Math.floor(u * 4) * 7.3, Math.floor(v * 4) * 3.1, 64);
      return { h: gap ? 0 : 0.6 + n * 0.2, c: gap ? hex(0x9c8a70) : lerpC(hex(0xe8dcc4), hex(0xf7eedd), id * 0.6 + n * 0.4) };
    }, { normalStrength: 3 }); break;
    case 'planks': s = surface(S, (u, v) => {
      const row = Math.floor(v * 8), tv = (v * 8) % 1, gap = tv < 0.06;
      const grain = fbm(u * 2 + row * 3.7, v * 40, 64, 3);
      return { h: gap ? 0 : 0.5 + grain * 0.2, c: gap ? hex(0x4a321e) : lerpC(hex(0x9a6a40), hex(0xc8935c), grain) };
    }, { normalStrength: 3 }); break;
    case 'rock': s = surface(S, (u, v) => {
      const n = fbm(u * 5, v * 5, 5, 6), st = Math.abs(Math.sin((v * 10 + n * 3) * Math.PI));
      return { h: n * 0.7 + st * 0.2, c: lerpC(hex(0x9a7656), hex(0xd2a87a), n * 0.8 + st * 0.2) };
    }, { normalStrength: 4 }); break;
    case 'grass': s = surface(S, (u, v) => {
      const n = fbm(u * 8, v * 8, 8, 5), b = N2(u * 90, v * 90, 90);
      return { h: n * 0.5 + b * 0.3, c: lerpC(hex(0x4d9a34), hex(0x8ad25a), n * 0.7 + b * 0.3) };
    }, { normalStrength: 2 }); break;
    default: throw new Error('no surface ' + name);
  }
  return (cache[name] = s);
}

// soft round sprite for particles
let _soft;
export function softDot() {
  if (_soft) return _soft;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (_soft = new THREE.CanvasTexture(c));
}
