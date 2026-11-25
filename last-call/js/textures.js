// Procedural canvas textures: wood, brick, planks, rubber mat, labels, neon, chalkboard, city.
import * as THREE from 'three';

let rng = mulberry(1337);
export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = () => rng();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Smooth value noise for grain.
function makeNoise1D(seed) {
  const r = mulberry(seed); const pts = Array.from({ length: 512 }, () => r());
  return (x) => { const i = Math.floor(x), f = x - i; const a = pts[((i % 512) + 512) % 512], b = pts[(((i + 1) % 512) + 512) % 512]; const s = f * f * (3 - 2 * f); return a + (b - a) * s; };
}

export function woodTexture({ base = [70, 38, 22], dark = [38, 18, 10], w = 1024, h = 1024, seed = 3, planks = 0 } = {}) {
  const [c, g] = canvas(w, h);
  const n1 = makeNoise1D(seed), n2 = makeNoise1D(seed + 7);
  const img = g.createImageData(w, h);
  const plankH = planks ? h / planks : h;
  for (let y = 0; y < h; y++) {
    const p = Math.floor(y / plankH);
    const off = p * 137.3;
    const tone = planks ? (n2(p * 3.1) - 0.5) * 0.35 : 0;
    for (let x = 0; x < w; x++) {
      const yy = (y % plankH);
      const warp = n1((x + off) * 0.003) * 9 + n2((x + off) * 0.02) * 1.5;
      let v = Math.sin((yy + warp) * 0.42 + n1((x + off) * 0.008) * 4) * 0.5 + 0.5;
      v = Math.pow(v, 3);
      const band = n1(yy * 0.05 + p * 9.1) * 0.35;
      const fine = n2((x + off) * 0.9 + yy * 2.3) * 0.14;
      let t = Math.min(1, Math.max(0, v * 0.32 + band + fine + tone + 0.12));
      if (planks && (yy < 2 || yy > plankH - 2)) t = 1.25;
      const i = (y * w + x) * 4;
      img.data[i] = base[0] + (dark[0] - base[0]) * t;
      img.data[i + 1] = base[1] + (dark[1] - base[1]) * t;
      img.data[i + 2] = base[2] + (dark[2] - base[2]) * t;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (planks) { // plank end joints
    g.fillStyle = 'rgba(0,0,0,0.6)';
    for (let p = 0; p < planks; p++) { const x = (p * 397) % w; g.fillRect(x, p * plankH, 2, plankH); }
  }
  return c;
}

export function brickTexture() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#3b302b'; g.fillRect(0, 0, 1024, 1024);
  const bw = 128, bh = 52, m = 6;
  for (let row = 0; row < 1024 / bh; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < 1024 / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const r = 120 + R() * 50, gg = 52 + R() * 26, b = 38 + R() * 20;
      g.fillStyle = `rgb(${r|0},${gg|0},${b|0})`;
      g.fillRect(x + m / 2, y + m / 2, bw - m, bh - m);
      for (let k = 0; k < 60; k++) { // speckle
        g.fillStyle = `rgba(${R() < 0.5 ? '20,10,8' : '200,150,120'},${R() * 0.25})`;
        g.fillRect(x + m / 2 + R() * (bw - m), y + m / 2 + R() * (bh - m), 2 + R() * 4, 2 + R() * 3);
      }
      const grd = g.createLinearGradient(0, y, 0, y + bh);
      grd.addColorStop(0, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = grd; g.fillRect(x + m / 2, y + m / 2, bw - m, bh - m);
    }
  }
  return c;
}

export function heightFromColor(src, invert = false) {
  const [c, g] = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    let v = (d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11);
    if (invert) v = 255 - v;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  return c;
}

export function rubberMatTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#121212'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = '#050505';
    g.beginPath(); g.arc(16 + x * 32, 16 + y * 32, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2; g.stroke();
  }
  return c;
}

export function steelTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},0.03)`;
    g.fillRect(0, R() * 512, 512, 1);
  }
  return c;
}

export function fabricTexture(color) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.05})`; g.fillRect(0, y, 256, 1); }
  for (let x = 0; x < 256; x += 2) { g.fillStyle = `rgba(255,255,255,${0.02 + R() * 0.03})`; g.fillRect(x, 0, 1, 256); }
  return c;
}

export function skinDetailTexture() {
  // subtle pores / blotches used as bump + slight color variation
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 100 + R() * 70;
    g.fillStyle = `rgba(${v|0},${v|0},${v|0},0.35)`;
    g.beginPath(); g.arc(R() * 512, R() * 512, 0.6 + R() * 1.4, 0, 7); g.fill();
  }
  return tex(c, { srgb: false, repeat: [3, 3] });
}

export function labelTexture({ name, sub, bg, fg, accent, style = 0 }) {
  const [c, g] = canvas(512, 256);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  // paper grain
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.05})`; g.fillRect(R() * 512, R() * 256, 2, 2); }
  g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(14, 14, 484, 228);
  g.lineWidth = 2; g.strokeRect(24, 24, 464, 208);
  g.fillStyle = fg; g.textAlign = 'center';
  if (style === 1) { g.fillStyle = accent; g.beginPath(); g.arc(256, 80, 34, 0, 7); g.fill(); g.fillStyle = fg; }
  g.font = `${style === 2 ? 'italic ' : ''}bold ${name.length > 10 ? 50 : 62}px Georgia, serif`;
  g.fillText(name.toUpperCase(), 256, style === 1 ? 168 : 128);
  g.font = '24px Georgia, serif'; g.fillStyle = accent;
  g.fillText(sub, 256, style === 1 ? 210 : 180);
  g.font = '16px Georgia, serif'; g.fillStyle = fg; g.globalAlpha = 0.7;
  g.fillText('EST. 1921 · 70cl', 256, 220);
  return tex(c, { repeat: [1, 1] });
}

export function neonTexture(text, color, w = 1024, h = 256, font = 'italic 150px "Limelight", Georgia, serif') {
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = font;
  g.shadowColor = color; g.shadowBlur = 30; g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  g.shadowBlur = 8; g.fillStyle = '#fff';
  g.lineWidth = 3; g.strokeStyle = '#fff';
  g.fillText(text, w / 2, h / 2);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function chalkboardCanvas(lines) {
  const [c, g] = canvas(768, 1024);
  const grd = g.createLinearGradient(0, 0, 768, 1024);
  grd.addColorStop(0, '#1e2622'); grd.addColorStop(1, '#141a17');
  g.fillStyle = grd; g.fillRect(0, 0, 768, 1024);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.035})`; g.beginPath(); g.ellipse(R() * 768, R() * 1024, 30 + R() * 60, 6 + R() * 10, R() * 3, 0, 7); g.fill(); }
  g.fillStyle = '#f4efe2'; g.textAlign = 'center';
  g.font = 'italic bold 64px Georgia, serif'; g.fillText('Tonight', 384, 110);
  g.strokeStyle = 'rgba(244,239,226,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(200, 140); g.lineTo(568, 140); g.stroke();
  g.textAlign = 'left'; g.font = '34px Georgia, serif';
  let y = 210;
  for (const [n, p] of lines.slice(0, 18)) {
    g.fillStyle = '#f4efe2'; g.fillText(n, 70, y);
    g.textAlign = 'right'; g.fillStyle = '#f2c66d'; g.fillText('$' + p, 700, y); g.textAlign = 'left';
    y += 46;
  }
  return c;
}

export function cityTexture() {
  const [c, g] = canvas(1024, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#0b0f24'); grd.addColorStop(0.6, '#1b1531'); grd.addColorStop(1, '#2a1a2a');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 40; i++) {
    const bw = 40 + R() * 90, bh = 120 + R() * 300, x = R() * 1024;
    g.fillStyle = `rgb(${10 + R() * 12},${10 + R() * 12},${18 + R() * 16})`;
    g.fillRect(x, 512 - bh, bw, bh);
    for (let wy = 512 - bh + 10; wy < 500; wy += 14) for (let wx = x + 6; wx < x + bw - 6; wx += 11) {
      if (R() < 0.35) { g.fillStyle = R() < 0.8 ? `rgba(255,${190 + R() * 50},${110 + R() * 60},0.85)` : 'rgba(150,200,255,0.8)'; g.fillRect(wx, wy, 5, 7); }
    }
  }
  // rain streaks on the glass
  for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(200,210,255,${R() * 0.12})`; g.lineWidth = 1; const x = R() * 1024, y = R() * 512; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 20 + R() * 30); g.stroke(); }
  return tex(c);
}

export function citrusTexture(rind, flesh) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = rind; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
  g.fillStyle = '#f7f3dc'; g.beginPath(); g.arc(128, 128, 114, 0, 7); g.fill();
  g.fillStyle = flesh;
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2 + 0.04, a1 = ((i + 1) / 10) * Math.PI * 2 - 0.04;
    g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 106, a0, a1); g.closePath(); g.fill();
  }
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.25})`; const a = R() * 7, r = 20 + R() * 85; g.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2, 5); }
  g.fillStyle = '#f7f3dc'; g.beginPath(); g.arc(128, 128, 10, 0, 7); g.fill();
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function frameArtTexture(seed) {
  const r = mulberry(seed);
  const [c, g] = canvas(256, 320);
  const hues = [[30, 60], [200, 40], [340, 50], [140, 30]];
  const [h, s] = hues[Math.floor(r() * hues.length)];
  g.fillStyle = `hsl(${h},${s}%,18%)`; g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `hsla(${h + r() * 60 - 30},${s + 20}%,${30 + r() * 40}%,0.8)`;
    g.beginPath(); g.arc(r() * 256, r() * 320, 20 + r() * 80, 0, 7); g.fill();
  }
  g.fillStyle = `hsla(${h},20%,90%,0.85)`; g.font = 'italic 26px Georgia, serif'; g.textAlign = 'center';
  g.fillText(['Midnight', 'Old Port', 'Copper', 'Nocturne'][Math.floor(r() * 4)], 128, 290);
  return tex(c);
}

export { tex, canvas };

export function marbleTexture(seed = 21) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#d9dadc'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2500; i++) { const v = 200 + r() * 40; g.fillStyle = `rgba(${v|0},${v|0},${(v + 4)|0},0.25)`; g.beginPath(); g.arc(r() * 1024, r() * 1024, 4 + r() * 30, 0, 7); g.fill(); }
  // veins
  for (let k = 0; k < 18; k++) {
    let x = r() * 1024, y = r() * 1024, a = r() * Math.PI * 2;
    const w = 0.6 + r() * 2.2, dark = 90 + r() * 70;
    g.strokeStyle = `rgba(${dark|0},${dark|0},${(dark + 8)|0},${0.25 + r() * 0.4})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 120; s++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}

export function concreteTexture() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#4a4b4e'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 6000; i++) { const v = 50 + R() * 50; g.fillStyle = `rgba(${v|0},${v|0},${(v + 3)|0},0.18)`; g.beginPath(); g.arc(R() * 1024, R() * 1024, 2 + R() * 20, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(20,20,22,0.6)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i * 256); g.lineTo(1024, i * 256); g.stroke(); }
  return c;
}

export function skylineTexture(seed = 5) {
  const r = mulberry(seed);
  const [c, g] = canvas(2048, 1024);
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, '#1d3a6e'); grd.addColorStop(0.45, '#4f6fa8'); grd.addColorStop(0.72, '#c88f9a'); grd.addColorStop(0.85, '#f2b77a'); grd.addColorStop(1, '#f6c98e');
  g.fillStyle = grd; g.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`; g.beginPath(); g.ellipse(r() * 2048, 150 + r() * 300, 200 + r() * 300, 20 + r() * 30, 0, 0, 7); g.fill(); }
  const layer = (n, hMin, hMax, tone, lit) => {
    for (let i = 0; i < n; i++) {
      const bw = 50 + r() * 140, bh = hMin + r() * (hMax - hMin), x = r() * 2048;
      g.fillStyle = tone(); g.fillRect(x, 1024 - bh, bw, bh);
      if (r() < 0.3) { g.fillRect(x + bw * 0.4, 1024 - bh - 40, 4, 40); }
      for (let wy = 1024 - bh + 12; wy < 1010; wy += 16) for (let wx = x + 6; wx < x + bw - 6; wx += 12) {
        if (r() < lit) { g.fillStyle = r() < 0.75 ? `rgba(255,${210 + r() * 40},${150 + r() * 60},0.9)` : 'rgba(170,215,255,0.85)'; g.fillRect(wx, wy, 6, 9); }
      }
    }
  };
  layer(40, 200, 420, () => `rgb(${70 + r() * 20},${78 + r() * 20},${105 + r() * 25})`, 0.15);
  layer(30, 300, 700, () => `rgb(${30 + r() * 20},${38 + r() * 20},${60 + r() * 25})`, 0.35);
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
