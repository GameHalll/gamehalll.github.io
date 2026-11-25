// ---------------------------------------------------------------- layout
export const TRACK_HALF = 18;          // track spans x in [-18, 18]
export const TRACK_START = 0;          // plaza ends / track begins at z = 0
export const ZONE_START = -60;         // first creature zone begins here
// ---------------------------------------------------------------- worlds
// Every world is the same 7-stage journey, but longer, faster, denser — and worth far more money.
export const WORLDS = [
  { name: 'Sunny Shores', emoji: '☀️', mult: 1, cost: 0, lenMul: 1.0, waveMul: 1.0, gap: 7, haz: 1.0, look: 'day', botLv: 1, color: '#ffd23f' },
  { name: 'Golden Hour', emoji: '🌅', mult: 6, cost: 150000, lenMul: 1.12, waveMul: 1.12, gap: 6.5, haz: 1.15, look: 'sunset', botLv: 8, color: '#ff9a4a' },
  { name: 'Neon Night', emoji: '🌃', mult: 40, cost: 25e6, lenMul: 1.24, waveMul: 1.24, gap: 6, haz: 1.3, look: 'night', botLv: 15, color: '#5ad8ff' },
  { name: 'Storm Coast', emoji: '⛈️', mult: 300, cost: 5e9, lenMul: 1.36, waveMul: 1.36, gap: 5.5, haz: 1.45, look: 'storm', botLv: 22, color: '#a8b8c8' },
  { name: 'Cosmic Shore', emoji: '🪐', mult: 2500, cost: 1e12, lenMul: 1.5, waveMul: 1.5, gap: 5, haz: 1.6, look: 'cosmic', botLv: 29, color: '#c070ff' },
];
const STAGES = [
  { biome: 'beach', title: 'Golden Beach' },
  { biome: 'tidepools', title: 'Tide Pools' },
  { biome: 'reef', title: 'Coral Flats' },
  { biome: 'jungle', title: 'Jungle Ruins' },
  { biome: 'volcano', title: 'Lava Fields' },
  { biome: 'glacier', title: 'Frozen Shelf' },
  { biome: 'abyss', title: 'Crystal Abyss' },
];
export const STAGE_BASE_LEN = 150, STAGE_GROWTH = 1.33;   // every stage ~33% longer than the one before
export const SHELTER_BASE_GAP = 50, SHELTER_GROWTH = 1.3;  // safe spots ~30% further apart every stage
export const ZONE_COUNT = STAGES.length;
// live bindings: importers always see the current world's layout
export let WORLD = 0, ZONES = [], TRACK_LEN = 0, TRACK_END = 0, WAVE_SPAWN_Z = 0, SHELTER_ZS = [], GAPS = [];
// ---- speed gaps: from stage 3 on, a chasm right behind the zone gate. A launch ramp throws you over it, but only
// if your speed level is high enough — slower runners (and their bots) fall short. Same rule both ways.
export const GAP_FIRST_ZONE = 2, GAP_VY = 13, GAP_AIR = 2 * GAP_VY / 32;   // launch vy, gravity 32 → 0.81s in the air
export const gapReqLv = (zi, w) => 5 * (zi - 1) + 2 * w;                    // world 0: Lv 5, 10, 15, 20, 25
export function setWorld(w) {
  WORLD = w;
  const W = WORLDS[w];
  let z = ZONE_START;
  ZONES = STAGES.map((st, i) => {
    const len = Math.round(STAGE_BASE_LEN * Math.pow(STAGE_GROWTH, i) * W.lenMul);
    const Z = { ...st, len, z0: z, z1: z - len, shelterGap: Math.round(SHELTER_BASE_GAP * Math.pow(SHELTER_GROWTH, i) * (1 + 0.08 * w)) };
    z -= len; return Z;
  });
  TRACK_LEN = z; TRACK_END = z - 20; WAVE_SPAWN_Z = TRACK_END - 30;
  GAPS = [];
  ZONES.forEach((Z, i) => {
    if (i < GAP_FIRST_ZONE) return;
    const req = gapReqLv(i, w), len = Math.round(speedOf(req) * GAP_AIR * 0.97 * 10) / 10;
    const z0 = Z.z0 - 12; Z.gap = { zone: i, req, len, z0, z1: z0 - len };
    GAPS.push(Z.gap);
  });
  SHELTER_ZS = [-40];
  for (const Z of ZONES) {
    let s = Z.z0 - Z.shelterGap * 0.55;
    if (Z.gap) s = Math.min(s, Z.gap.z1 - 22); // first safe spot of the zone sits behind its chasm
    for (; s > Z.z1 + 14; s -= Z.shelterGap) SHELTER_ZS.push(Math.round(s));
  }
}
export const gapAt = z => GAPS.find(G => z < G.z0 && z > G.z1) || null;
export const zoneAt = z => { for (let i = 0; i < ZONES.length; i++) if (z <= ZONES[i].z0 && z > ZONES[i].z1) return i; return z > ZONE_START ? -1 : ZONES.length - 1; };
export const SHELTER_LEN = 12;         // along z
export const SHELTER_DEPTH = 8;        // into the wall
export const PLAZA_DEPTH = 82;
export const PLAZA_HALF = 76;

export const PLOT_W = 26, PLOT_D = 24;
// six plots, three on each side of the plaza; door faces the centre
export const PLOTS = [
  { cx: -50, cz: 15, side: -1 }, { cx: -50, cz: 41, side: -1 }, { cx: -50, cz: 67, side: -1 },
  { cx: 50, cz: 15, side: 1 }, { cx: 50, cz: 41, side: 1 }, { cx: 50, cz: 67, side: 1 },
];
export const PLAYER_PLOT = 1;

// ---------------------------------------------------------------- rarities
export const RARITIES = [
  { name: 'Common', color: '#c9d3da', glow: 0x9aa7b0 },
  { name: 'Uncommon', color: '#5ee06a', glow: 0x3ccf4c },
  { name: 'Rare', color: '#3fa8ff', glow: 0x2a8cff },
  { name: 'Epic', color: '#c070ff', glow: 0xa040ff },
  { name: 'Legendary', color: '#ffb02e', glow: 0xffa000 },
  { name: 'Mythic', color: '#ff3f6c', glow: 0xff2050 },
  { name: 'Secret', color: '#ffffff', glow: 0xffffff, rainbow: true },
];

export const MUTATIONS = [
  { id: '', name: '', mult: 1, chance: 0 },
  { id: 'gold', name: 'Gold', mult: 3, chance: 0.07, color: 0xffcc33 },
  { id: 'diamond', name: 'Diamond', mult: 6, chance: 0.025, color: 0x7fe8ff },
  { id: 'rainbow', name: 'Rainbow', mult: 12, chance: 0.008, color: 0xff66ff },
];
export const MUT_BY_ID = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));

// ---------------------------------------------------------------- creatures
// look: body shape + palette + bits. All original characters built from primitives.
export const CREATURES = [
  // Common
  { id: 'breadpup', name: 'Bread Pup', r: 0, inc: 1, look: { body: 'box', c1: 0xe7b06a, c2: 0xb5763a, bits: ['loaf', 'floppyears', 'nose', 'legs4', 'tail'], mouth: 'tongue', brow: 'happy' } },
  { id: 'sockgob', name: 'Sock Goblin', r: 0, inc: 1, look: { body: 'cyl', c1: 0xf4f4f4, c2: 0xe8453c, bits: ['stripes', 'cuff', 'goblinears', 'sockfoot'], mouth: 'fangs', brow: 'cocky', iris: 0x5ea85b } },
  { id: 'pebfrog', name: 'Pebble Frog', r: 0, inc: 2, look: { body: 'blob', c1: 0x8a9ba3, c2: 0x5ea85b, bits: ['frogeyes', 'bigeyes', 'moss', 'froglegs'], mouth: 'wide' } },
  { id: 'mopsy', name: 'Mopsy Mop', r: 0, inc: 2, look: { body: 'cone', c1: 0xd9d0b8, c2: 0x7a5a3a, bits: ['hair', 'bangs', 'stick'], mouth: 'o', eyes: 'sleepy' } },
  // Uncommon
  { id: 'cactcat', name: 'Cactus Cat', r: 1, inc: 5, look: { body: 'cyl', c1: 0x4fae4a, c2: 0xd8623c, bits: ['ears', 'spikes', 'pot', 'tail', 'flower', 'whiskers', 'pinknose'], mouth: 'cat' } },
  { id: 'toastoad', name: 'Toaster Toad', r: 1, inc: 6, look: { body: 'box', c1: 0xbfc6cc, c2: 0xd9a35a, bits: ['bigeyes', 'slots', 'toast', 'lever', 'froglegs'], mouth: 'wide', iris: 0xff9a1f } },
  { id: 'pizpeng', name: 'Pizza Penguin', r: 1, inc: 7, look: { body: 'egg', c1: 0x222833, c2: 0xffffff, bits: ['belly', 'beak', 'pizzahat', 'wings', 'feet'], mouth: 'none' } },
  { id: 'bubbun', name: 'Bubble Bun', r: 1, inc: 8, look: { body: 'blob', c1: 0xffb6d9, c2: 0xffffff, bits: ['longears', 'bubbles', 'legs2', 'pinknose', 'buckteeth', 'puff'], mouth: 'smile', iris: 0xd0407a } },
  // Rare
  { id: 'discduck', name: 'Disco Duck', r: 2, inc: 20, look: { body: 'egg', c1: 0xffe14a, c2: 0xff8a1f, bits: ['bill', 'shades', 'discoball', 'wings', 'quiff', 'chain', 'feet'], eyes: 'none', mouth: 'none', brow: 'cocky' } },
  { id: 'sharksnk', name: 'Sharky Sneaker', r: 2, inc: 24, look: { body: 'long', c1: 0x5b7fa3, c2: 0xffffff, bits: ['sole', 'fin', 'laces', 'gills', 'sharktail', 'swoosh'], mouth: 'shark', brow: 'angry' } },
  { id: 'cappucrab', name: 'Cappucrab', r: 2, inc: 27, look: { body: 'cup', c1: 0xffffff, c2: 0xe2553e, bits: ['claws', 'foam', 'latteheart', 'steam', 'crablegs'], mouth: 'open' } },
  { id: 'burgbear', name: 'Burger Bear', r: 2, inc: 30, look: { body: 'burger', c1: 0xe3a85a, c2: 0x7a4a24, bits: ['snout', 'roundears', 'legs2'], mouth: 'smile' } },
  // Epic
  { id: 'ninjnug', name: 'Ninja Nugget', r: 3, inc: 80, look: { body: 'blob', c1: 0xe0a245, c2: 0x1d1d26, bits: ['crumbs', 'headband', 'sword', 'legs2', 'arms'], mouth: 'smirk', brow: 'angry' } },
  { id: 'lavalama', name: 'Lava Llama', r: 3, inc: 95, look: { body: 'long', c1: 0xff6a2a, c2: 0x3a2020, bits: ['neck', 'ears', 'legs4', 'flames', 'lavaspots', 'tail'], mouth: 'smirk', eyes: 'sleepy' } },
  { id: 'banband', name: 'Banana Bandit', r: 3, inc: 110, look: { body: 'banana', c1: 0xffe03a, c2: 0x222222, bits: ['mask', 'hat', 'sack'], mouth: 'grin', brow: 'cocky' } },
  { id: 'turbturt', name: 'Turbo Turtle', r: 3, inc: 125, look: { body: 'shell', c1: 0x3f9a4c, c2: 0x9adf6a, bits: ['plates', 'rockets', 'legs4', 'goggles'], mouth: 'open' } },
  // Legendary
  { id: 'kingcroi', name: 'King Croissant', r: 4, inc: 350, look: { body: 'croissant', c1: 0xe0a04a, c2: 0xffd84a, bits: ['crown', 'cape', 'mustache', 'scepter'], mouth: 'smile', brow: 'cocky' } },
  { id: 'spaceshk', name: 'Space Shark', r: 4, inc: 420, look: { body: 'long', c1: 0x8fa6c4, c2: 0xffffff, bits: ['fin', 'sharktail', 'helmet', 'jetpack', 'gills'], mouth: 'shark', brow: 'cocky' } },
  { id: 'dragfrt', name: 'Dragonfruit Dragon', r: 4, inc: 480, look: { body: 'egg', c1: 0xff3f8f, c2: 0x7fe05a, bits: ['bracts', 'bigwings', 'horns', 'tail', 'arms'], mouth: 'fangs', brow: 'angry', iris: 0x3fae3a } },
  { id: 'thundmoo', name: 'Thunder Moo', r: 4, inc: 540, look: { body: 'box', c1: 0xffffff, c2: 0x2a2a2a, bits: ['muzzle', 'spots', 'horns', 'legs4', 'hooves', 'bell', 'cloud'], mouth: 'smile', brow: 'angry' } },
  // Mythic
  { id: 'coscapy', name: 'Cosmic Capybara', r: 5, inc: 1500, look: { body: 'blob', c1: 0x8a5ad8, c2: 0x2b1b55, bits: ['capysnout', 'roundears', 'stars', 'halo', 'legs4', 'orange', 'planetring'], mouth: 'smile', eyes: 'sleepy' } },
  { id: 'pharfish', name: 'Pharaoh Fish', r: 5, inc: 1750, look: { body: 'egg', c1: 0x2a6cd8, c2: 0xffcc33, bits: ['pharaoh', 'fins', 'tailfin', 'collar'], mouth: 'lips', iris: 0x1a2a6a } },
  { id: 'tsuspir', name: 'Tsunami Spirit', r: 5, inc: 2000, look: { body: 'cone', c1: 0x3fd0ff, c2: 0xffffff, bits: ['bigeyes', 'wavecurl', 'swirl', 'bubbles'], mouth: 'open', iris: 0x1a6cff } },
  { id: 'gigachick', name: 'Giga Chick', r: 5, inc: 2300, look: { body: 'egg', c1: 0xfff27a, c2: 0xff8a1f, bits: ['beak', 'muscles', 'shades', 'feet', 'comb', 'abs'], eyes: 'none', mouth: 'none', brow: 'angry' } },
  // Secret
  { id: 'bigcheese', name: 'The Big Cheese', r: 6, inc: 8000, look: { body: 'cheese', c1: 0xffd23f, c2: 0xd9a020, bits: ['holes', 'crown', 'cape', 'mustache', 'monocle'], mouth: 'grin', brow: 'cocky' } },
  { id: 'lordbub', name: 'Lord Bubbles', r: 6, inc: 10000, look: { body: 'blob', c1: 0x9ef0ff, c2: 0xffffff, bits: ['tophat', 'monocle', 'mustache', 'bowtie', 'bubbles'], mouth: 'smile', brow: 'cocky', eyes: 'sleepy' } },
  { id: 'glitch', name: 'GL1TCH', r: 6, inc: 12500, look: { body: 'box', c1: 0x00ff9c, c2: 0xff00d4, bits: ['glitch', 'bigeyes', 'antenna', 'legs2'], eyes: 'pixel', mouth: 'pixel', blush: false } },
  { id: 'omegaduck', name: 'Omega Duck', r: 6, inc: 15000, look: { body: 'egg', c1: 0x3b2a6e, c2: 0xffd23f, bits: ['bill', 'halo', 'bigwings', 'crown', 'stars', 'omega', 'feet'], eyes: 'glow', glow: 0xffe14a, bill: 0xffd23f, mouth: 'none', brow: 'angry' } },
];
export const CREATURE_BY_ID = Object.fromEntries(CREATURES.map(c => [c.id, c]));
export const BY_RARITY = RARITIES.map((_, r) => CREATURES.filter(c => c.r === r));

// ---------------------------------------------------------------- economy
export const SPEED_BASE = 15;
export const SPEED_PER_LV = 1.0;
export const SPEED_MAX_LV = 40;
export const speedOf = lv => SPEED_BASE + lv * SPEED_PER_LV;
export const speedCost = lv => Math.round(20 * Math.pow(1.62, lv));
export const SLOTS_START = 5, SLOTS_MAX = 12;
export const slotCost = n => Math.round(250 * Math.pow(3.4, n - SLOTS_START));
export const LOCK_TIME = 40, LOCK_COOLDOWN = 50;
// lock-length upgrade: +10s per level, deliberately expensive
export const LOCK_MAX_LV = 8;
export const lockTimeOf = lv => LOCK_TIME + 10 * Math.min(lv || 0, LOCK_MAX_LV);
export const lockCost = lv => Math.round(25000 * Math.pow(7, lv));
export const CARRY_SLOW = [0.92, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58]; // rarer = heavier
export const carryMul = c => c ? CARRY_SLOW[CREATURE_BY_ID[c.id].r] : 1;

// rebirth: needs a lot of cash, resets cash/speed/pedestals, keeps index, +50% income each
export const rebirthCost = n => Math.round(250000 * Math.pow(6, n));

// ---------------------------------------------------------------- waves
// id: key for js/sys/waves.js (icons, tells, effects). minLv / minWorld: unlocked once EITHER is reached.
// easy: weight shrinks in deeper worlds; hard: weight grows with the world index. tall: mesh height, back: lethal zone behind the front.
export const WAVE_TYPES = [
  { id: 'slow', name: 'Slow', speed: 24, weight: 3, color: 0x58c8ff, easy: true },
  { id: 'normal', name: 'Normal', speed: 34, weight: 5, color: 0x2aa4ff, easy: true },
  { id: 'fast', name: 'Fast', speed: 48, weight: 3, color: 0x1a6cff },
  { id: 'mega', name: 'MEGA', speed: 66, weight: 1, color: 0x7a3cff, mega: true, minLv: 3, tall: 2.0, hard: 1 },
  { id: 'double', name: 'Double', speed: 38, weight: 2, color: 0x1a8cff, double: true, minLv: 3 },
  { id: 'surge', name: 'Surge', speed: 36, weight: 2, color: 0x12b5c4, surge: true, minLv: 4, minWorld: 1, hard: 1 },
  { id: 'riptide', name: 'Riptide', speed: 34, weight: 2, color: 0x1a9a8a, riptide: true, minLv: 5, minWorld: 1, hard: 1 },
  { id: 'shark', name: 'Shark', speed: 38, weight: 2, color: 0x2a5f8c, sharks: true, minLv: 6, minWorld: 1, hard: 1 },
  { id: 'tidal', name: 'Tidal', speed: 21, weight: 1.5, color: 0x0c3a8a, tall: 2.7, back: 30, minLv: 8, minWorld: 1, hard: 1 },
  { id: 'storm', name: 'Storm', speed: 34, weight: 1.5, color: 0x3c4a66, storm: true, minLv: 14, minWorld: 2, hard: 2 },
];
export const WAVE_LETHAL_BACK = 14; // how far behind the wave front is still deadly
export const WAVE_GAP = 5;       // seconds between a wave breaking and the next warning
export const WAVE_WARN = 4;      // warning countdown
// waves are fastest far out at sea and slow down towards the beach
// waves scale with the track length (a longer world doesn't buy you more warning time) and are fastest far out at sea
export const waveSpeedMul = z => (1 + 1.0 * Math.min(1, Math.max(0, z / TRACK_LEN))) * WORLDS[WORLD].waveMul * (-TRACK_LEN / 1100);

export const BOT_NAMES = ['xXSharkXx', 'NoobMaster', 'Lili_2012', 'BigBrain_K', 'Pr0Stealer', 'surferdude', 'Kiki', 'MrToast', 'ZoomZoom', 'capy_fan'];
export const PLOT_COLORS = [0xff5a5a, 0x3fa8ff, 0x5ee06a, 0xffb02e, 0xc070ff, 0xff7ad9];

// ---------------------------------------------------------------- bats
export const BATS = [
  { id: 'fists', name: 'Fists', cost: 0, range: 2.4, knock: 11, cd: 0.6, stun: 0.55 },
  { id: 'wood', name: 'Wooden Bat', cost: 250, range: 3.2, knock: 17, cd: 0.65, stun: 0.8, color: 0xb07a44 },
  { id: 'nail', name: 'Nail Bat', cost: 6000, range: 3.5, knock: 21, cd: 0.6, stun: 0.9, color: 0x8a5a30, nails: true },
  { id: 'metal', name: 'Metal Bat', cost: 120000, range: 3.8, knock: 25, cd: 0.55, stun: 1.0, color: 0xc8d0d8, metal: true },
  { id: 'gold', name: 'Golden Bat', cost: 3500000, range: 4.1, knock: 30, cd: 0.5, stun: 1.1, color: 0xffc83a, metal: true },
  { id: 'plasma', name: 'Plasma Bat', cost: 90000000, range: 4.6, knock: 36, cd: 0.45, stun: 1.2, color: 0x5af0ff, glow: true },
];

setWorld(0); // last: needs speedOf above
