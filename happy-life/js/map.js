'use strict';
// Courses are chained "segments". 10 worlds x 5 stages + an endless random course.
// The ground height changes between segments (b.oy = row offset), so courses don't all look flat.
// Tile codes: 0 air, 1 ground, 2 cloud (one-way, crumbles), 3 conveyor ←, 4 conveyor →, 5 plank (one-way),
//             6 metal, 7 ice (slippery), 8 jelly (bouncy), 9 blink block A, 10 blink block B
(() => {
const HL = window.HL, T = HL.T, ROWS = 26;

// ---------------- themes ----------------
// deco: background scenery, tile: ground pattern, sun: sun | moon | earth | none
HL.THEMES = {
  meadow: { sky: ['#7cc8ff', '#e3f6ff'], dirt: '#c98a55', dot: '#b3733f', grass: '#63c95a', grassHi: '#7ddb72', hills: ['#c3efbd', '#a8e3a0'], sun: 'sun', flowers: true, deco: 'trees', tile: 'dots' },
  candy: { sky: ['#ffb3d9', '#fff0f8'], dirt: '#d9a3f5', dot: '#c084e8', grass: '#ff8fc8', grassHi: '#ffb3dc', hills: ['#ffd1ea', '#ffc0e0'], sun: 'sun', flowers: true, deco: 'lollipops', tile: 'stripes' },
  frost: { sky: ['#9ad1ff', '#f1f9ff'], dirt: '#8fa9c7', dot: '#7891ad', grass: '#f8fbff', grassHi: '#ffffff', hills: ['#dbeeff', '#c6e2fb'], sun: 'sun', snow: true, deco: 'pines', tile: 'dots' },
  factory: { sky: ['#5b4b8a', '#c9a7e8'], dirt: '#7c6f8f', dot: '#6a5d7d', grass: '#a3a1c4', grassHi: '#c1bfe0', hills: ['#8e7bb8', '#7a68a6'], sun: 'moon', stars: true, deco: 'chimneys', tile: 'bricks' },
  cave: { sky: ['#1f1638', '#3b2a63'], dirt: '#4a3b6b', dot: '#3a2d57', grass: '#7b6cff', grassHi: '#a99cff', hills: ['#2e2250', '#382a60'], sun: 'none', deco: 'crystals', tile: 'gems', glow: true },
  storm: { sky: ['#5c6f8a', '#b7c4d6'], dirt: '#7d8597', dot: '#697185', grass: '#8fbf8a', grassHi: '#a9d4a4', hills: ['#8d9ab0', '#7b889e'], sun: 'none', rain: true, deco: 'windmills', tile: 'dots' },
  moon: { sky: ['#0d1030', '#2c2f6b'], dirt: '#b9bccb', dot: '#9a9db0', grass: '#d9dbe6', grassHi: '#eef0f7', hills: ['#55597e', '#6a6e94'], sun: 'earth', stars: true, deco: 'domes', tile: 'craters' },
  jungle: { sky: ['#6fd3b0', '#e6fff4'], dirt: '#8a5a3c', dot: '#734830', grass: '#2fb344', grassHi: '#52cc63', hills: ['#9be3b4', '#7fd69d'], sun: 'sun', flowers: true, deco: 'palms', tile: 'dots' },
  sunset: { sky: ['#ff8a5c', '#ffe3a3'], dirt: '#b86b4b', dot: '#9e5a3d', grass: '#f6b93b', grassHi: '#ffd166', hills: ['#ffb38a', '#f59a6e'], sun: 'sun', flowers: true, deco: 'castles', tile: 'bricks' },
  rainbow: { sky: ['#a5d8ff', '#fff9db'], dirt: '#f783ac', dot: '#e8649a', grass: '#69db7c', grassHi: '#8ce99a', hills: ['#d0bfff', '#b197fc'], sun: 'sun', deco: 'rainbow', tile: 'stripes', flowers: true },
};

// icon: drawn by HL.worldIcon (ui), never emoji
HL.WORLDS = [
  { name: 'Happy Meadows', theme: 'meadow', d: 0, icon: 'flower', stages: [
    ['Hello, Safety', ['cloud', 'pillow', 'angel']],
    ['Boing Boing', ['bounce', 'cloud', 'crusher', 'angel']],
    ['Crush Hour', ['cloud', 'shaft', 'crusher', 'fanwall', 'angel']],
    ['Big Shot', ['cannon', 'cloud', 'timed', 'angel']],
    ['The Original', ['cloud', 'pillow', 'dashblock', 'tower', 'crusher', 'angel']]] },
  { name: 'Candy Clouds', theme: 'candy', d: 1, icon: 'candy', stages: [
    ['Jelly Belly', ['jelly', 'dashblock', 'timed', 'angel']],
    ['Gumdrop Gun', ['jelly', 'cannon', 'pillow', 'angel']],
    ['Sugar Rush', ['jelly', 'shaft', 'fanwall', 'bounce', 'angel']],
    ['Blinky Pops', ['blink', 'jelly', 'anvil', 'timed', 'angel']],
    ['Sweet Tooth', ['cloud', 'jelly', 'shaft', 'timed', 'dashblock', 'tower', 'angel']]] },
  { name: 'Frosty Peaks', theme: 'frost', d: 1, icon: 'flake', stages: [
    ['Slip N Safe', ['ice', 'shaft', 'crusher', 'angel']],
    ['Cold Feet', ['ice', 'dashblock', 'cloud', 'pillow', 'angel']],
    ['Snow Gusts', ['wind', 'ice', 'timed', 'angel']],
    ['Brain Freeze', ['ice', 'blink', 'shaft', 'anvil', 'angel']],
    ['Avalanche Avenue', ['ice', 'shaft', 'fanwall', 'crusher', 'wind', 'dashblock', 'tower', 'angel']]] },
  { name: 'Toy Factory', theme: 'factory', d: 2, icon: 'gear', stages: [
    ['Assembly Line', ['conveyor', 'dashblock', 'crusher', 'angel']],
    ['Quality Control', ['conveyor', 'shaft', 'tower', 'timed', 'angel']],
    ['Punch Clock', ['gloves', 'conveyor', 'anvil', 'angel']],
    ['Toy Cannon', ['conveyor', 'cannon', 'blink', 'crusher', 'angel']],
    ['Overtime', ['conveyor', 'shaft', 'pillow', 'gloves', 'crusher', 'dashblock', 'tower', 'angel']]] },
  { name: 'Crystal Caves', theme: 'cave', d: 2, icon: 'gem', stages: [
    ['Glow Steps', ['blink', 'pillow', 'angel']],
    ['Echo Chamber', ['blink', 'shaft', 'crusher', 'bounce', 'angel']],
    ['Deep Dive', ['jelly', 'blink', 'timed', 'dashblock', 'angel']],
    ['Gem Mine', ['conveyor', 'blink', 'gloves', 'anvil', 'angel']],
    ['Crystal Core', ['blink', 'shaft', 'blink', 'cannon', 'tower', 'angel']]] },
  { name: 'Windy Heights', theme: 'storm', d: 2, icon: 'swirl', stages: [
    ['Breezy', ['wind', 'cloud', 'crusher', 'angel']],
    ['Kite Flight', ['fanwall', 'wind', 'timed', 'angel']],
    ['Thunder Punch', ['gloves', 'wind', 'dashblock', 'angel']],
    ['Storm Chaser', ['wind', 'bounce', 'shaft', 'anvil', 'angel']],
    ['Eye of the Storm', ['wind', 'cloud', 'gloves', 'fanwall', 'wind', 'cannon', 'angel']]] },
  { name: 'Moon Base', theme: 'moon', d: 3, icon: 'moon', stages: [
    ['One Small Step', ['moon', 'cloud', 'angel']],
    ['Moon Shot', ['moon', 'cannon', 'timed', 'angel']],
    ['Crater Hop', ['bounce', 'moon', 'blink', 'angel']],
    ['Zero G', ['moon', 'shaft', 'moon', 'dashblock', 'angel']],
    ['Dark Side', ['blink', 'moon', 'gloves', 'cannon', 'moon', 'tower', 'angel']]] },
  { name: 'Jungle Gym', theme: 'jungle', d: 3, icon: 'leaf', stages: [
    ['Vine Swing', ['gloves', 'jelly', 'angel']],
    ['Coconut Drop', ['anvil', 'bounce', 'crusher', 'angel']],
    ['Monkey Business', ['shaft', 'gloves', 'wind', 'timed', 'angel']],
    ['Temple Run', ['conveyor', 'anvil', 'blink', 'dashblock', 'angel']],
    ['Lost Temple', ['jelly', 'gloves', 'shaft', 'anvil', 'cannon', 'pillow', 'angel']]] },
  { name: 'Sunset Kingdom', theme: 'sunset', d: 3, icon: 'castle', stages: [
    ['Royal Welcome', ['jelly', 'shaft', 'ice', 'timed', 'angel']],
    ['Castle Climb', ['conveyor', 'shaft', 'cloud', 'tower', 'angel']],
    ['Knight Fight', ['gloves', 'blink', 'crusher', 'dashblock', 'angel']],
    ['Royal Cannon', ['cannon', 'wind', 'ice', 'anvil', 'angel']],
    ['Happy Ending?', ['cloud', 'shaft', 'ice', 'jelly', 'dashblock', 'conveyor', 'pillow', 'crusher', 'tower', 'timed', 'angel']]] },
  { name: 'Rainbow Finale', theme: 'rainbow', d: 4, icon: 'rainbow', stages: [
    ['Over the Rainbow', ['blink', 'jelly', 'gloves', 'angel']],
    ['Prism Panic', ['wind', 'blink', 'cannon', 'timed', 'angel']],
    ['Color Crush', ['bounce', 'conveyor', 'crusher', 'anvil', 'angel']],
    ['Spectrum', ['moon', 'ice', 'gloves', 'shaft', 'dashblock', 'angel']],
    ['Happy Life', ['cloud', 'blink', 'wind', 'gloves', 'moon', 'shaft', 'cannon', 'anvil', 'tower', 'timed', 'angel']]] },
];
HL.STAGES_PER_WORLD = 5;
HL.COURSES = [];
HL.WORLDS.forEach((w, wi) => w.stages.forEach((s, si) => HL.COURSES.push({ id: `${wi + 1}-${si + 1}`, world: wi, stage: si, name: s[0], segs: s[1] })));
HL.courseTitle = (id) => {
  if (id === 'endless') return 'Endless';
  if (id === 'random') return 'Random';
  const c = HL.COURSES.find((q) => q.id === id);
  return c ? `${c.id} ${c.name}` : id;
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------- builder ----------------
// All row numbers given to b.* helpers are "design rows" (ground = 18); b.oy shifts them up/down.
function makeBuilder(theme, seed) {
  const g = Array.from({ length: ROWS }, () => []);
  const m = {
    rows: ROWS, g, theme: HL.THEMES[theme] || HL.THEMES.meadow, themeName: theme,
    spikes: [], levers: [], fans: [], movers: [], checkpoints: [], rescues: [], saws: [], crushers: [], tramps: [],
    signs: [], zones: [], spawns: [], timers: [], dblocks: [], angel: null,
    cannons: [], targets: [], gloves: [], anvils: [], winds: [], gravs: [], scans: [], blink: { period: 1.7 },
  };
  const b = { m, x: 0, rnd: rng(seed), n: 0, oy: 0 };
  const Y = (r) => r + b.oy;
  b.py = (r) => Y(r) * T;
  const ensure = (c) => { for (const row of g) while (row.length <= c) row.push(0); };
  b.raw = (x0, y0, x1, y1, v = 1) => { ensure(x1); for (let y = Math.max(0, y0); y <= Math.min(ROWS - 1, y1); y++) for (let x = x0; x <= x1; x++) g[y][x] = v; };
  b.fill = (x0, y0, x1, y1, v = 1) => b.raw(x0, Y(y0), x1, Y(y1), v);
  b.ground = (x0, x1, top = 18) => b.raw(x0, Y(top), x1, ROWS - 1, 1);
  b.pit = (x0, x1) => { b.fill(x0, 21, x1, 21); b.raw(x0, Y(22), x1, ROWS - 1, 1); m.rescues.push({ x: x0 * T, y: b.py(19), w: (x1 - x0 + 1) * T, h: 3 * T }); };
  b.spikes = (x0, x1, r, power, dir) => { for (let c = x0; c <= x1; c++) m.spikes.push({ c, r: Y(r), power, pillow: 0, hold: 0, dir }); };
  b.sign = (c, r, text) => m.signs.push({ x: c * T + 20, y: (Y(r) + 1) * T, text });
  b.cp = (c, r = 17) => m.checkpoints.push({ x: c * T + 8, y: (Y(r) + 1) * T - 36, fx: c * T, fy: Y(r) * T, i: m.checkpoints.length, up: false });
  b.zone = (c, name, tip) => m.zones.push({ x: c * T, name, tip });
  b.tramp = (c, r) => m.tramps.push({ x: c * T, y: Y(r) * T + 24, w: T, squash: 0 });
  b.mover = (c0, r0, c1, r1, w, speed) => m.movers.push({ x: c0 * T, y: Y(r0) * T, ax: c0 * T, ay: Y(r0) * T, bx: c1 * T, by: Y(r1) * T, w: w * T, h: 14, speed, dir: 1, dx: 0, dy: 0 });
  b.key = (p) => p + (b.n++);
  // connector between segments: sometimes step up or drop down
  b.link = (allowStep = true) => {
    b.ground(b.x, b.x + 1);
    if (allowStep) {
      const r = b.rnd();
      let ny = b.oy;
      if (r < 0.32) ny -= 1 + (b.rnd() < 0.5 ? 1 : 0);
      else if (r < 0.66) ny += 1 + (b.rnd() < 0.5 ? 1 : 0);
      b.oy = Math.max(-3, Math.min(3, ny));
    }
    b.ground(b.x + 2, b.x + 4);
    b.x += 5;
  };
  return b;
}

// ---------------- segments (each starts and ends on the ground row 18 + oy) ----------------
const SEG = {};

SEG.start = (b) => {
  const x = b.x;
  b.ground(x, x + 15);
  for (let i = 0; i < 3; i++) b.m.spawns.push({ x: (x + 2 + i) * T + 8, y: b.py(18) - 36 });
  b.cp(x + 2);
  b.sign(x + 8, 17, 'Totally Safe Spikes');
  b.spikes(x + 10, x + 12, 17, 'always');
  b.x += 16;
};

// platforms over a rescue pit. kind: cloud | ice | jelly
function hop(b, d, kind) {
  const x = b.x, r = b.rnd, W = 24 + Math.min(d, 3) * 5;
  const names = { cloud: ['Cloud Hop', 'Clouds crumble. Keep moving!'], ice: ['Ice Hop', 'Ice is slippery. Stop early!'], jelly: ['Jelly Jumps', 'Jelly bounces you. Steer carefully!'] };
  b.zone(x - 2, names[kind][0], names[kind][1]);
  b.cp(x - 3);
  b.pit(x, x + W - 1);
  const tile = kind === 'cloud' ? 2 : kind === 'ice' ? 7 : 8;
  let cx = x + 2, row = 16, lastMover = true; // never start with a mover, never two movers in a row
  for (;;) {
    if (kind === 'cloud' && !lastMover && cx < x + W - 10 && r() < 0.22 + d * 0.08) {
      b.mover(cx, row, cx + 4, row, 2, 100 + Math.min(d, 3) * 25);
      cx += 8 + (r() < 0.5 ? 0 : 1);
      lastMover = true;
      continue;
    }
    lastMover = false;
    const w = kind === 'jelly' ? 1 : d >= 2 && r() < 0.45 + d * 0.06 ? 1 : 2;
    b.fill(cx, row, cx + w - 1, row, tile);
    if (cx + w - 1 >= x + W - 3) break;
    const maxGap = kind === 'jelly' ? 4 : d >= 1 ? 4 : 3; // 4-tile gaps need a dash
    let gap = 2 + Math.floor(r() * (maxGap - 1));
    const prevRow = row;
    row = kind === 'jelly' ? 16 : Math.max(12, Math.min(16, row + (r() < 0.5 ? -1 : 1) * (r() < 0.5 ? 1 : 2)));
    if (prevRow - row >= 2) gap = Math.min(gap, 3); // big step up: a dash makes this one
    cx += w + gap;
    if (cx > x + W - 3) cx = x + W - 3;
  }
  b.ground(x + W, x + W + 3);
  b.x = x + W + 4;
}
SEG.cloud = (b, d) => hop(b, d, 'cloud');
SEG.ice = (b, d) => hop(b, d, 'ice');
SEG.jelly = (b, d) => hop(b, d, 'jelly');

// conveyor platforms over a rescue pit
SEG.conveyor = (b, d) => {
  const x = b.x, W = 26 + Math.min(d, 3) * 4;
  b.zone(x - 2, 'Conveyor Chaos', 'Belts push you around. Fight back!');
  b.cp(x - 3);
  b.pit(x, x + W - 1);
  let cx = x + 2, i = 0;
  for (;;) {
    const len = 3 + (i % 2), row = 16 - (i % 2) - (d >= 3 && i % 3 === 2 ? 1 : 0);
    b.fill(cx, row, cx + len - 1, row, i % 2 ? 4 : 3);
    if (cx + len - 1 >= x + W - 4) break;
    cx += len + 2 + (d >= 2 && i % 2 ? 1 : 0); i++;
    if (cx > x + W - 4) cx = x + W - 4;
  }
  b.ground(x + W, x + W + 3);
  b.x = x + W + 4;
};

// spike pit with pillows powered from a fan/conveyor tower (win spot)
SEG.pillow = (b, d) => {
  const x = b.x, key = b.key('p');
  b.zone(x, 'Pillow Factory', 'The Pillow Pit is powered from the top of the factory...');
  b.ground(x, x + 39); b.cp(x + 1);
  b.fill(x + 13, 18, x + 25, 19, 0);
  b.spikes(x + 13, x + 25, 19, key);
  b.sign(x + 10, 17, 'Pillow Pit');
  b.m.fans.push({ x: (x + 27) * T, y: b.py(6), w: 2 * T, h: 12 * T });
  b.fill(x + 30, 9, x + 31, 9, 3);
  if (d >= 2) b.fill(x + 34, 9, x + 35, 9, 3); else b.fill(x + 33, 9, x + 35, 9, 3);
  b.fill(x + 36, 7, x + 39, 7, 6);
  b.m.levers.push({ x: (x + 38) * T, y: b.py(6), power: key, on: true, touching: false });
  b.x = x + 40;
};

// pillows on a schedule (win spot)
SEG.timed = (b, d) => {
  const x = b.x, key = b.key('t');
  b.zone(x, 'Nap Time Pillows', 'The pillows take tiny naps. Drop in while they sleep!');
  b.ground(x, x + 23); b.cp(x + 1);
  b.fill(x + 7, 18, x + 16, 19, 0);
  b.spikes(x + 7, x + 16, 19, key);
  b.m.timers.push({ key, on: Math.max(1.1, 2.4 - d * 0.3), off: Math.max(0.3, 0.5 - d * 0.06), t: 1.5, x: (x + 5) * T + 20, y: b.py(18) });
  b.x = x + 24;
};

// tower climb + saw mill high road (win spot)
SEG.tower = (b, d) => {
  const x = b.x;
  b.zone(x, 'The Tower', 'Only way forward is UP.');
  b.ground(x, x + 24); b.cp(x + 1);
  b.fill(x + 22, 6, x + 24, 17, 6);
  b.fill(x + 3, 15, x + 5, 15, 5);
  b.fill(x + 7, 12, x + 9, 12, 5);
  b.mover(x + 11, 12, x + 11, 7, 2, 85 + Math.min(d, 3) * 15);
  b.fill(x + 15, 9, x + 16, 9, 2);
  b.fill(x + 19, 6, x + 21, 6, 5);
  b.cp(x + 23, 5);
  b.zone(x + 25, 'Saw Mill', 'Safety cages close when you get close. Be FAST.');
  b.fill(x + 25, 6, x + 59, 6, 6);
  for (const h of [32, 40, 48, 56]) b.fill(x + h, 6, x + h + 1, 6, 0);
  b.tramp(x + 38, 5); b.tramp(x + 54, 5);
  b.ground(x + 25, x + 63);
  for (const [a0, a1] of [[30, 35], [38, 43], [46, 51], [53, 58]]) {
    const a = (x + a0) * T, c = (x + a1) * T;
    b.m.saws.push({ minX: a, maxX: c, x: (a + c) / 2, y: b.py(18) - 26, r: 26, speed: 70 + ((a0 * 7) % 40) + d * 15, dir: a0 % 2 ? 1 : -1, rot: 0, cage: 0, away: 9, msg: false });
  }
  b.x = x + 64;
};

// crusher alley (win spot)
SEG.crusher = (b, d) => {
  const x = b.x;
  b.zone(x, 'Crusher Alley', 'Floor sensors stop the crushers. Floor sensors...');
  b.ground(x, x + 31); b.cp(x);
  b.fill(x + 2, -6, x + 30, 9, 6);
  b.sign(x + 2, 17, 'Floor sensors keep you safe!');
  [5, 11, 17, 23].forEach((o, i) => b.m.crushers.push({ x: (x + o) * T, w: 2 * T, top: b.py(10), bottom: b.py(18), y: b.py(10), h: 44, state: 'up', t: 1 + i * 0.7, wait: Math.max(0.5, 1.4 + i * 0.25 - d * 0.25) }));
  b.x = x + 32;
};

// fans lift you over two walls
SEG.fanwall = (b, d) => {
  const x = b.x, dd = Math.min(d, 2);
  b.zone(x, 'Windy Walls', 'Ride the wind over the walls!');
  b.ground(x, x + 27); b.cp(x + 1);
  b.fill(x + 8, 9, x + 10, 17, 6);
  b.m.fans.push({ x: (x + 5) * T, y: b.py(5), w: 2 * T, h: 13 * T });
  b.fill(x + 13, 13, x + 14, 13, 2);
  b.fill(x + 19, 6 - Math.min(dd, 1), x + 21, 17, 6);
  b.m.fans.push({ x: (x + 16) * T, y: b.py(3 - dd), w: 2 * T, h: (15 + dd) * T });
  b.x = x + 28;
};

// angel's garden (final win spot)
SEG.angel = (b, d) => {
  const x = b.x;
  b.zone(x, "Angel's Garden", 'The angel gets tired. Hit those spikes fast!');
  b.ground(x, x + 38); b.cp(x + 6);
  b.fill(x + 9, 18, x + 29, 19, 0);
  b.spikes(x + 9, x + 29, 19, null);
  b.sign(x + 3, 17, "Angel's Garden: guarded 24/7");
  b.m.angel = { x0: x * T, cp: b.m.checkpoints.length - 1, hearts: 5 + d, max: 5 + d, regen: Math.max(1.2, 1.6 - d * 0.1), t: 0, count: 0 };
  b.m.finishX = (x + 9) * T;
  b.x = x + 39;
};

// wall-jump shaft (parkour)
SEG.shaft = (b, d) => {
  const x = b.x;
  b.zone(x, 'Wall Jump Shaft', 'Jump between the walls to climb. Hold toward a wall to slide.');
  b.ground(x, x + 21); b.cp(x + 1);
  b.sign(x + 2, 17, 'Wall jump: jump while touching a wall');
  b.fill(x + 6, 6, x + 7, 15, 6);                 // left wall (walk in underneath)
  // right wall; at d2+ it sits 1 tile further, so the top jump needs a dash
  b.fill(x + 11 + (d >= 2 ? 1 : 0), 4, x + 12 + (d >= 2 ? 1 : 0), 17, 6);
  if (d >= 1) b.spikes(x + 8, x + 10, 17, 'always');
  b.x = x + 22;
};

// moving spike blocks guarded by bumpers. Dash into them to win.
SEG.dashblock = (b, d) => {
  const x = b.x, dd = Math.min(d, 3);
  b.zone(x, 'Bumper Blocks', 'Bumpers bounce slow dummies. Fast ones... (dash!)');
  b.ground(x, x + 23); b.cp(x + 1);
  b.sign(x + 3, 17, 'Bumpers stop anything slower than a dash');
  [[9, 0], [15, 1.7], [20, 3.1]].slice(0, 2 + (d >= 1 ? 1 : 0)).forEach(([o, ph]) =>
    b.m.dblocks.push({ x: (x + o) * T, w: T, h: 100, y0: b.py(13) - 10, y: b.py(13), amp: 60 + dd * 25, speed: 1.6 + dd * 0.5, ph, t: 0 }));
  b.x = x + 24;
};

// ---------------- new segments ----------------

// blocks that take turns being solid, over a rescue pit
SEG.blink = (b, d) => {
  const x = b.x, r = b.rnd, W = 22 + Math.min(d, 3) * 3;
  b.zone(x - 2, 'Blink Blocks', 'Pink and blue blocks take turns. Jump on the beat!');
  b.cp(x - 3);
  b.pit(x, x + W - 1);
  b.m.blink.period = Math.max(1.05, 1.7 - d * 0.14);
  let cx = x + 1, row = 16, k = 0, end = x;
  while (cx < x + W - 3) {
    const w = d >= 2 ? 2 : 3;
    b.fill(cx, row, cx + w - 1, row, k % 2 ? 10 : 9);
    end = cx + w - 1; k++;
    cx += w + 1 + Math.floor(r() * 2);
    row = Math.max(13, Math.min(16, row + Math.floor(r() * 3) - 1));
  }
  b.ground(Math.min(x + W, end + 3), x + W + 3); // last hop is never wider than 2 tiles
  b.x = x + W + 4;
};

// human cannon over a big pit: fly over the pillar, or hit its spiky bullseye (win spot)
SEG.cannon = (b, d) => {
  const x = b.x, dd = Math.min(d, 4);
  b.zone(x, 'Human Cannon', 'Press JUMP to fire. Hit the bullseye... if you can.');
  b.ground(x, x + 6); b.cp(x + 1);
  b.sign(x + 1, 17, 'Jump to fire!');
  b.m.cannons.push({ x: (x + 4) * T + 20, y: b.py(18) - 24, a: -0.9, a0: -1.35, a1: -0.32, dir: 1, speed: 1.15 + dd * 0.22, power: 1400 });
  b.pit(x + 7, x + 21);
  b.fill(x + 18, 12, x + 19, 21, 6);
  b.m.targets.push({ x: (x + 18) * T, y: b.py(12), h: 5 * T, sh: 120 + dd * 10, sy: 0, dir: 1, speed: 70 + dd * 22 });
  b.ground(x + 22, x + 33);
  b.x = x + 34;
};

// low gravity + ceiling spikes. Pillows cover all of them except one moving gap (win spot)
SEG.moon = (b, d) => {
  const x = b.x, L = 32, key = b.key('m');
  b.zone(x, 'Moon Bounce', 'Low gravity! The ceiling pillows have one moving gap...');
  b.ground(x, x + L - 1); b.cp(x + 1);
  b.m.gravs.push({ x: (x + 2) * T, w: (L - 3) * T, g: 0.42 });
  for (const c of [9, 17, 24]) { b.fill(c + x, 18, c + x + 2, 20, 0); b.pit(x + c, x + c + 2); }
  b.fill(x + 4, -6, x + L - 5, 9, 6);
  b.spikes(x + 5, x + L - 6, 10, key, 'down');
  b.m.scans.push({ key, pos: x + 5, min: x + 5, max: x + L - 6, speed: 1.3 + Math.min(d, 4) * 0.3, dir: 1, half: 0.85 });
  b.sign(x + 2, 17, 'Low gravity ahead');
  b.x = x + L;
};

// swinging boxing gloves over a pit
SEG.gloves = (b, d) => {
  const x = b.x, n = 4 + (d >= 2 ? 1 : 0), dd = Math.min(d, 4);
  b.zone(x - 2, 'Punch Bridge', 'Boxing gloves knock you off. Time your hops!');
  b.cp(x - 3);
  const W = 2 + n * 5;
  b.pit(x, x + W - 1);
  for (let i = 0; i < n; i++) {
    const cx = x + 2 + i * 5;
    b.fill(cx, 16, cx + 1, 16, 6);
    // glove swings over the gap after this platform: safe to stand, dangerous to jump at the wrong time
    b.m.gloves.push({ px: (cx + 3.5) * T, py: b.py(9), len: 216, amp: 0.45, speed: 2 + dd * 0.28, ph: i * 1.9 + (d % 2), a: 0, va: 0, r: 22 });
  }
  b.ground(x + W, x + W + 3);
  b.x = x + W + 4;
};

// anvils drop on a timer. Umbrellas save walkers; sprinters (or dashers) get hit (win spot)
SEG.anvil = (b, d) => {
  const x = b.x, dd = Math.min(d, 4);
  b.zone(x, 'Anvil Delivery', 'Umbrellas pop up for slow walkers. Sprinters get the package!');
  b.ground(x, x + 33); b.cp(x + 1);
  b.sign(x + 4, 17, 'Umbrellas for walkers only');
  [12, 19, 26].forEach((o, i) => b.m.anvils.push({ x: (x + o) * T + 20, w: 52, h: 40, ground: b.py(18), y: -999, vy: 0, vx: 0, state: 'wait', t: 1 + i * 0.7, wait: Math.max(0.8, 1.7 - dd * 0.15) }));
  b.x = x + 34;
};

// periodic gusts push you back over a pit
SEG.wind = (b, d) => {
  const x = b.x, r = b.rnd, W = 26 + Math.min(d, 3) * 2;
  b.zone(x - 2, 'Gusty Gap', 'When the flags flap, hold on tight!');
  b.cp(x - 3);
  b.pit(x, x + W - 1);
  let cx = x + 2, row = 16, end = x;
  while (cx < x + W - 4) {
    const w = d >= 3 ? 1 + (r() < 0.5 ? 1 : 0) : 2;
    b.fill(cx, row, cx + w - 1, row, 5);
    end = cx + w - 1;
    cx += w + 2 + (r() < 0.5 ? 1 : 0);
    row = Math.max(13, Math.min(16, row + Math.floor(r() * 3) - 1));
  }
  b.ground(Math.min(x + W, end + 3), x + W + 3);
  b.m.winds.push({ x: (x - 2) * T, w: (W + 4) * T, dir: -1, str: 170 + Math.min(d, 3) * 20, on: false, t: 1.4, onT: 1.3, offT: 1.5 });
  b.x = x + W + 4;
};

// trampoline towers over a pit
SEG.bounce = (b, d) => {
  const x = b.x, r = b.rnd, n = 4 + Math.min(d, 2);
  b.zone(x - 2, 'Boing Towers', 'Trampolines launch you high. Steer your landing!');
  b.cp(x - 3);
  let cx = x + 2;
  const cols = [];
  for (let i = 0; i < n; i++) { cols.push(cx); cx += 4 + (r() < 0.5 ? 1 : 0); }
  const W = cx - x + 1;
  b.pit(x, x + W - 1);
  cols.forEach((c, i) => {
    const top = i === 0 ? 16 : 13 + Math.floor(r() * 4);
    b.fill(c, top, c, 21, 6);
    b.tramp(c, top - 1);
  });
  b.ground(x + W, x + W + 3);
  b.x = x + W + 4;
};

function finish(b) {
  const m = b.m;
  m.cols = m.g[0].length; m.w = m.cols * T; m.h = ROWS * T;
  if (!m.finishX) m.finishX = m.w;
  return m;
}

const POOL = ['cloud', 'ice', 'jelly', 'conveyor', 'pillow', 'timed', 'tower', 'crusher', 'fanwall', 'shaft', 'dashblock', 'blink', 'cannon', 'moon', 'gloves', 'anvil', 'wind', 'bounce'];
HL.buildCourse = (id, seed = 1) => {
  if (id === 'endless') {
    const themes = Object.keys(HL.THEMES);
    const b = makeBuilder(themes[seed % themes.length], seed);
    SEG.start(b);
    let last = '', i = 0;
    while (b.x < 3400) {
      let s; do s = POOL[Math.floor(b.rnd() * POOL.length)]; while (s === last);
      last = s;
      SEG[s](b, Math.min(4, Math.floor(i / 3)));
      b.link(); i++;
    }
    b.ground(b.x, b.x + 6); b.sign(b.x + 2, 17, 'You reached the end of forever?!'); b.x += 7;
    const m = finish(b);
    m.title = 'Endless';
    return m;
  }
  const c = HL.COURSES.find((q) => q.id === id) || HL.COURSES[0];
  const w = HL.WORLDS[c.world];
  let s0 = 7; for (const ch of c.id) s0 = s0 * 31 + ch.charCodeAt(0);
  const b = makeBuilder(w.theme, s0);
  const d = Math.min(4, w.d + (c.stage >= 3 ? 1 : 0));
  SEG.start(b);
  c.segs.forEach((s, i) => {
    SEG[s](b, d);
    const next = c.segs[i + 1];
    if (next) b.link(c.stage > 0 || c.world > 0);
  });
  const m = finish(b);
  m.title = `${c.id} ${c.name}`;
  return m;
};
})();
