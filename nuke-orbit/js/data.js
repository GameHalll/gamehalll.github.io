/* =========================================================================
   NUKE ORBIT — data.js
   All tunable game data: physics, upgrades, skins, environments, economy.
   ========================================================================= */
'use strict';

window.NO = window.NO || {};

NO.CONFIG = {
  GRAVITY: 50,               // m/s^2 (arcade-scaled)
  LAUNCH_ANGLE: 40 * Math.PI / 180,
  BOMB_RADIUS: 0.55,         // metres (collision radius)
  TEE_OFFSET: 1.35,          // bomb rest position in front of character (m)
  MIN_BOUNCE_VY: 4,          // below this vertical speed the bomb starts rolling
  STOP_SPEED: 0.35,
  COINS_PER_METER: 0.5,
  COIN_VALUE: 2,
  GEM_VALUE: 25,
  PERFECT_THRESHOLD: 0.94,
  PERFECT_MULT: 1.08,
  MAX_UPGRADE_LEVEL: 30,
  SAVE_KEY: 'nukeOrbit.save.v1',
  // ORBIT: if the bomb is still this fast (horizontal m/s) at the top of its arc, it reaches orbit
  ORBIT_VX: 165,
  ORBIT_LAP: 1500,           // metres credited per lap around the planet
  ORBIT_MAX_LAPS: 6,
  ORBIT_LAP_BONUS: 150,      // coins per lap (x lap number)
};

/* ---------- Upgrades: 3 categories x 30 levels, exponential pricing ---------- */
NO.UPGRADES = [
  {
    id: 'launch', name: 'LAUNCH POWER', icon: NO.ico('rocket'), base: 12, growth: 1.255,
    desc: 'Bigger initial launch velocity. Every launch hits harder.',
    stat: (lv) => Math.round(NO.physicsFor({ launch: lv, bounce: 0, speed: 0 }).v0 * 3.6) + ' km/h launch',
  },
  {
    id: 'bounce', name: 'BOUNCE', icon: NO.ico('ball'), base: 15, growth: 1.255,
    desc: 'Springier landings. Keep bouncing long after impact.',
    stat: (lv) => Math.round(NO.physicsFor({ launch: 0, bounce: lv, speed: 0 }).restitution * 100) + '% rebound',
  },
  {
    id: 'speed', name: 'SPEED', icon: NO.ico('wind'), base: 18, growth: 1.255,
    desc: 'Aerodynamic casing. Lose horizontal speed much slower.',
    stat: (lv) => Math.round((1 - NO.physicsFor({ launch: 0, bounce: 0, speed: lv }).drag / 0.07) * 100) + '% less drag',
  },
];

NO.upgradeCost = function (upg, level) {
  return Math.round(upg.base * Math.pow(upg.growth, level));
};

/* Physics values derived from upgrade levels. Skins never touch this. */
NO.physicsFor = function (up) {
  const L = up.launch, B = up.bounce, S = up.speed;
  return {
    v0: 1.39 * (22 + 4.2 * L + 0.1 * L * L),          // launch speed (m/s)
    restitution: 0.40 + 0.0145 * B,                    // vertical energy kept per bounce
    keepX: 0.78 + 0.004 * B + 0.0025 * S,              // horizontal speed kept per bounce
    drag: 0.07 * (1 - 0.026 * S),                      // linear air drag
    rollFriction: 13.5 * (1 - 0.022 * S),              // constant rolling decel
    rollDrag: 0.14 * (1 - 0.022 * S),                  // speed-proportional rolling decel
  };
};

/* ---------- Characters (cosmetic only) ---------- */
NO.CHARACTERS = [
  { id: 'kim',       name: 'Kim Jong Boom',   tag: 'Supreme Leader of Lobbing', price: 0,     style: 'mallet', shout: 'BEHOLD!!' },
  { id: 'general',   name: 'General Kaboom',  tag: '47 medals, 0 explanations',  price: 0,     style: 'kick',   shout: 'FOR GLORY!' },
  { id: 'donny',     name: 'Big Donny',       tag: 'The best launches. Huge.',   price: 600,   style: 'golf',   shout: 'TREMENDOUS!' },
  { id: 'president', name: 'President Qadir', tag: 'Fictional head of state',    price: 1800,  style: 'cricket',shout: 'SIXER!!' },
  { id: 'scientist', name: 'Dr. Fizzwick',    tag: 'Peer review is for cowards', price: 5000,  style: 'ray',    shout: 'MWAHAHA!' },
  { id: 'alien',     name: 'Zorp',            tag: 'Just visiting. Probably.',   price: 15000, style: 'beam',   shout: 'ZORP ZORP!' },
];

/* ---------- Bomb skins (cosmetic only) ---------- */
NO.BOMBS = [
  { id: 'classic',   name: 'Classic Nuke',    tag: 'A timeless menace',          price: 0 },
  { id: 'christmas', name: 'Christmas Bomb',  tag: 'Ho ho ho-ly moly',           price: 400 },
  { id: 'golden',    name: 'Golden Bomb',     tag: 'Solid gold. Solid boom.',    price: 3000 },
  { id: 'neon',      name: 'Neon Bomb',       tag: 'Synthwave apocalypse',       price: 7500 },
  { id: 'rainbow',   name: 'Rainbow Bomb',    tag: 'Tastes like the end times',  price: 12000 },
  { id: 'alienbomb', name: 'Alien Bomb',      tag: 'Not from around here',       price: 25000 },
];

/* ---------- Environments: unlocked by best distance ---------- */
NO.ENVIRONMENTS = [
  { id: 'country', name: 'Green Countryside', unlock: 0,    mult: 1.0, gravity: 1.0 },
  { id: 'desert',  name: 'Desert',            unlock: 250,  mult: 1.3, gravity: 1.0 },
  { id: 'snow',    name: 'Snowy Mountains',   unlock: 700,  mult: 1.6, gravity: 1.0 },
  { id: 'city',    name: 'City Skyline',      unlock: 1600, mult: 2.0, gravity: 1.0 },
  { id: 'ocean',   name: 'Ocean',             unlock: 3500, mult: 2.5, gravity: 1.0 },
  { id: 'space',   name: 'Outer Space',       unlock: 6000, mult: 3.0, gravity: 0.85 },
];

/* ---------- Distance milestones (bonus every time you pass one) ---------- */
NO.MILESTONES = [25, 50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6500, 8000, 10000, 12500, 15000, 20000, 30000];
NO.milestoneBonus = (m) => Math.round(10 + m * 0.15);

NO.byId = (list, id) => list.find((x) => x.id === id) || list[0];
