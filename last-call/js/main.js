// Last Call: first-person bartending. Game loop, controls, pouring physics, customers, economy, HUD.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBar, buildEnvironment, makeBottle, makeItem, COUNTER_Y, COUNTER, MAT_SPOT, SHAKER_SPOT, SEATS, DOOR, TOP_Y, WORK_Z1 } from './bar.js';
import { INGREDIENTS, RECIPES, TIERS, UPGRADES, GARNISHES, GLASSES, Vessel, OZ, evaluate, makeGarnish, iceGeometry, MAT, ITEMS, GUEST_TYPES, CHATTER } from './drinks.js';
import { buildHand, POSES } from './hands.js';
import { buildPerson, handQuat } from './people.js';
import { loadModels, makeHuman, makeProp, propSource } from './models.js';
// walking routes: a walkway along the right wall and an aisle between the bar and the line
const WALK_X = 7.6, AISLE_Z = 1.6;
import { Sound, PLAYLIST } from './audio.js';

const $ = (id) => document.getElementById(id);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fmt = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
const oz = (ml) => (ml / OZ).toFixed(2);

// ------------------------------------------------------------------ save
const SAVE_KEY = 'lastcall-save-v1';
const fresh = () => ({ money: 0, tier: 0, upgrades: {}, served: 0, scoreSum: 0, night: 1, bestNight: 0 });
let S = fresh();
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) S = Object.assign(fresh(), JSON.parse(raw)); } catch { /* storage blocked */ }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* ignore */ } }
const has = (u) => !!S.upgrades[u];

// ------------------------------------------------------------------ renderer
// single-file build: textures/models are embedded in the page and served from memory
if (window.__vfsURL) THREE.DefaultLoadingManager.setURLModifier(window.__vfsURL);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120a1e);
scene.fog = new THREE.FogExp2(0x1a0b2a, 0.032); // club haze: the far end of the room sinks into colored air
scene.environment = buildEnvironment(renderer);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.02, 40);
camera.rotation.order = 'YXZ';
scene.add(camera);

// neon glow (bloom) at half resolution; switches itself off if the frame rate drops
const fx = new EffectComposer(renderer);
fx.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.6, 0.45, 0.86);
fx.addPass(bloom); fx.addPass(new OutputPass());
let glowOn = true, perfT = 0, perfN = 0, perfSum = 0;
const composer = {
  render: () => { if (glowOn) fx.render(); else renderer.render(scene, camera); },
  setSize: (w, h) => { fx.setSize(w, h); const d = glowOn === 'quarter' ? 4 : 2; bloom.setSize(w / d, h / d); },
};
// graphics quality: Auto walks down this ladder until the game runs smoothly, and back up when there's headroom
const LEVELS = [
  { glow: 'full', res: 1, crowd: 1, beams: 1 },
  { glow: 'quarter', res: 1, crowd: 1, beams: 1 },
  { glow: 'quarter', res: 0.85, crowd: 1, beams: 1 },
  { glow: 'quarter', res: 0.85, crowd: 0.7, beams: 0.5 },
  { glow: false, res: 0.72, crowd: 0.7, beams: 0.5 },
  { glow: false, res: 0.72, crowd: 0.5, beams: 0.5 },
  { glow: false, res: 0.6, crowd: 0.5, beams: 0.5 },
];
const QUALITY = { auto: null, high: 0, medium: 2, low: 5 };
let quality = 'auto'; try { quality = localStorage.getItem('lastcall-gfx') || 'auto'; } catch { /* ignore */ }
if (!(quality in QUALITY)) quality = 'auto';
const BASE_PR = Math.min(window.devicePixelRatio, 1);
let level = QUALITY[quality] ?? (window.innerWidth * window.innerHeight > 1700 * 950 ? 1 : 0), ceiling = 0, lastDrop = -99, perfClock = 0;
function applyLevel() {
  const L = LEVELS[level];
  glowOn = L.glow;
  renderer.setPixelRatio(BASE_PR * L.res); fx.setPixelRatio(BASE_PR * L.res); composer.setSize(window.innerWidth, window.innerHeight);
  // thin the crowd evenly (never the DJ), and drop half the big light beams
  humans.forEach((h, i) => { h.hidden = h !== dj && ((i * 0.6180339) % 1) >= L.crowd; h.root.visible = !h.hidden; });
  if (bar.club) { bar.club.beams.forEach((b, i) => { b.piv.visible = L.beams >= 1 || i % 2 === 0; }); if (bar.club.haze) bar.club.haze.forEach((h) => { h.visible = L.beams >= 1; }); }
}
function setQuality(q) { quality = q; try { localStorage.setItem('lastcall-gfx', q); } catch { /* ignore */ } level = QUALITY[q] ?? 1; ceiling = 0; applyLevel(); }
function watchPerf(dt) {
  if (dt > 0.2 || document.hidden) { perfT = 0; perfN = 0; perfSum = 0; return; } // ignore pauses from a hidden tab
  perfClock += dt;
  if (QUALITY[quality] !== null && QUALITY[quality] !== undefined) return;
  perfSum += dt; perfN++; perfT += dt;
  if (perfT < 2) return;
  const fps = perfN / perfSum; perfT = 0; perfN = 0; perfSum = 0;
  if (fps < 48 && level < LEVELS.length - 1) {
    // dropping right after a step up means that step was too much: don't try it again
    if (perfClock - lastDrop > 0 && perfClock - lastRaise < 5) ceiling = Math.max(ceiling, level);
    level++; lastDrop = perfClock; applyLevel();
  } else if (fps > 57 && level > ceiling && perfClock - lastDrop > 8) { level--; lastRaise = perfClock; applyLevel(); }
}
let lastRaise = -99;
function fitFov() { const a = window.innerWidth / window.innerHeight; camera.fov = Math.min(84, Math.max(68, 2 * Math.atan(Math.tan(52 * Math.PI / 180) / a) * 180 / Math.PI)); }
fitFov(); camera.updateProjectionMatrix();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; fitFov(); camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

const sound = new Sound();
// ---- CrazyGames SDK (only present in the CrazyGames build; everything here is a safe no-op elsewhere)
const CG = { sdk: null, playing: false };
async function cgInit() {
  const sdk = window.CrazyGames && window.CrazyGames.SDK; if (!sdk) return;
  try {
    await sdk.init(); if (sdk.environment === 'disabled') return;
    CG.sdk = sdk;
    const applyMute = () => sound.setMuted(!!sdk.game.settings.muteAudio);
    applyMute(); sdk.game.addSettingsChangeListener(applyMute);
    if (!modelsDone) sdk.game.loadingStart();
  } catch (e) { CG.sdk = null; CG.err = String(e); }
}
function cgCall(fn) { try { if (CG.sdk) CG.sdk.game[fn](); } catch { /* ignore */ } }
let modelsDone = false;
cgInit();
sound.onTrack = (title, announce) => { const el = $('trackName'); if (el) el.textContent = title; if (announce && running) toast('♪ ' + title); };

// ------------------------------------------------------------------ world
const bar = buildBar(scene, renderer);
const pickables = [];
function pickable(obj, pick) { obj.userData.pick = pick; pickables.push(obj); }

// bottles
const bottles = {}; // id -> {obj, home:{pos, rotY}, id}
{
  let rail = 0, mix = 0, shelf = 0;
  const shelfOrder = [];
  for (const id in INGREDIENTS) {
    const ing = INGREDIENTS[id];
    if (ing.spot === 'tap' || ing.spot === 'fridge') continue;
    const obj = makeBottle(id);
    let pos, rotY;
    if (ing.spot === 'rail' || ['grenadine', 'lime', 'syrup', 'bitters'].includes(id)) { pos = bar.railSlots[rail++]; rotY = Math.PI; }
    else if (ing.spot === 'mixer') { pos = bar.mixerSlots[mix++]; rotY = Math.PI; }
    else { shelfOrder.push(id); continue; }
    obj.position.copy(pos); obj.rotation.y = rotY + (Math.random() - 0.5) * 0.3;
    scene.add(obj);
    bottles[id] = { obj, id, home: { pos: pos.clone(), rotY: obj.rotation.y } };
    pickable(obj.userData.hit, { type: 'bottle', id });
  }
  // shelf: interactive bottles on the lowest back-bar ledge, front and centre
  const lowSlots = bar.shelfSlots.slice(0, 16);
  shelfOrder.forEach((id, i) => {
    const obj = makeBottle(id);
    const pos = lowSlots[3 + i].clone();
    obj.position.copy(pos); obj.rotation.y = (Math.random() - 0.5) * 0.3;
    scene.add(obj);
    bottles[id] = { obj, id, home: { pos: pos.clone(), rotY: obj.rotation.y } };
    pickable(obj.userData.hit, { type: 'bottle', id });
  });
  // decorative stock on the upper shelves
  const ids = Object.keys(INGREDIENTS).filter((k) => INGREDIENTS[k].bottle && !['oj', 'cranberry', 'lime', 'syrup', 'espresso', 'bitters', 'grenadine'].includes(k));
  bar.shelfSlots.slice(16).forEach((p, i) => {
    if (Math.random() < 0.12 || p.x > 2.0) return;
    const o = makeBottle(ids[(i * 7) % ids.length]);
    o.position.copy(p).add(V3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.04));
    o.rotation.y = (Math.random() - 0.5) * 0.5; o.remove(o.userData.hit);
    scene.add(o);
  });
  // a couple of decorative bottles flanking the low shelf
  [0, 1, 2, 15].forEach((k, i) => { const o = makeBottle(ids[(i * 5 + 3) % ids.length]); o.position.copy(lowSlots[k]); o.remove(o.userData.hit); scene.add(o); });
}

// ------------------------------------------------------------------ floating name labels
const labels = [];
function makeLabel(text, h = 0.03, color = '#ffffff') {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = 'bold 44px Manrope, Arial, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 36; c.width = w; c.height = 64;
  g.fillStyle = 'rgba(12,10,9,0.72)';
  g.beginPath(); g.roundRect(0, 4, w, 56, 26); g.fill();
  g.font = 'bold 44px Manrope, Arial, sans-serif'; g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, w / 2, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sp.scale.set(h * w / 64, h, 1); sp.renderOrder = 15; sp.raycast = () => {};
  labels.push(sp);
  return sp;
}
for (const id in bottles) {
  const o = bottles[id].obj;
  const lb = makeLabel(INGREDIENTS[id].name, INGREDIENTS[id].spot === 'shelf' ? 0.036 : 0.028);
  lb.position.y = o.userData.height + 0.045; o.add(lb); bottles[id].label = lb;
}
{
  const at = (obj, text, y, h, col) => { const lb = makeLabel(text, h, col); lb.position.y = y; obj.add(lb); return lb; };
  at(bar.stations.ice.group, 'Ice', 0.1, 0.03);
  bar.stations.garnish.forEach((g) => at(g.pile, GARNISHES[g.type].name, 0.08, 0.022));
  bar.stations.glasses.forEach((g) => at(g.holder, GLASSES[g.type].name, 0.21, 0.024));
  at(bar.stations.sink.hit, 'Sink (dump)', 0.11, 0.028);
  bar.stations.spoon.label = at(bar.stations.spoon.obj, 'Bar spoon', 0.3, 0.024);
  bar.stations.rag.label = at(bar.stations.rag.obj, 'Towel', 0.06, 0.024);
  at(bar.stations.register.hit, 'Shop', 0.25, 0.03, '#7ff5e4');
}

// stations
for (const tp of bar.taps) { pickable(tp.hit, { type: 'tap', id: tp.id }); const lb = makeLabel(INGREDIENTS[tp.id].name, 0.024); lb.position.y = 0.2; tp.piv.add(lb); }
pickable(bar.fridge.doorHit, { type: 'fridge' });
{ const lb = makeLabel('Fridge', 0.05, '#9fe8ff'); lb.position.set(0, 2.02, 0.3); bar.fridge.group.add(lb); }
for (const it of bar.fridge.items) { pickable(it.hit, { type: 'fitem', id: it.id }); const lb = makeLabel(ITEMS[it.id].short, 0.024); lb.position.set(0, 0.29, 0.14); it.grp.add(lb); }
pickable(bar.opener.hit, { type: 'opener' });
{ const lb = makeLabel('Bottle opener', 0.022); lb.position.y = 0.08; bar.opener.group.add(lb); }
pickable(bar.stations.ice.hit, { type: 'ice' });
const scoop = bar.stations.ice.scoop;
bar.stations.garnish.forEach((g) => pickable(g.hit, { type: 'garnish', g: g.type }));
// the spoon and rag are groups with no surface of their own: give each an invisible click box that moves with it
function groupHit(group, pad = 0.02) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group); const inv = group.matrixWorld.clone().invert();
  box.applyMatrix4(inv); const size = box.getSize(V3()), center = box.getCenter(V3());
  const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x + pad, size.y + pad, size.z + pad), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(center); group.add(hit); return hit;
}
pickable(groupHit(bar.stations.spoon.obj, 0.03), { type: 'spoon' });
pickable(groupHit(bar.stations.rag.obj, 0.02), { type: 'rag' });
pickable(bar.stations.sink.hit, { type: 'sink' });
bar.stations.glasses.forEach((g) => pickable(g.hit, { type: 'rack', glass: g.type }));
pickable(bar.stations.register.hit, { type: 'register' });

// shaker
const shaker = new Vessel('shaker');
shaker.group.position.copy(SHAKER_SPOT).setY(bar.matTopY);
scene.add(shaker.group);
pickable(shaker.mesh, { type: 'shaker' });
{ const lb = makeLabel('Shaker', 0.026); lb.position.y = 0.23; shaker.group.add(lb); shaker.label = lb; }

let glass = null; // the glass on the mat
const flying = []; // glasses sliding to customers etc.

// ------------------------------------------------------------------ hands
// floating white low-poly gloves (no arms)
const RH = buildHand({ side: 'right', skin: 0xeef0f4, forearm: false, scale: 1.12 });
const LH = buildHand({ side: 'left', skin: 0xeef0f4, forearm: false, scale: 1.12 });
scene.add(RH.root, LH.root);
RH.setPose(POSES.relaxed); LH.setPose(POSES.flat);

// ------------------------------------------------------------------ player
const player = { pos: V3(0, 1.65, -0.74), yaw: Math.PI, pitch: -0.56, bob: 0 };
// ---- stock: every bottle drains as you pour (spills and over-pours too). An empty one is
// reordered automatically, and the cost comes out of your till.
const isSpirit = (id) => INGREDIENTS[id].spot === 'rail' || INGREDIENTS[id].spot === 'shelf' && !INGREDIENTS[id].dense;
function bottleSize(id) { const g = INGREDIENTS[id]; return g.dense || g.flow < 0.7 ? 500 : isSpirit(id) ? 700 : 1000; }
function bottleCost(id) { const g = INGREDIENTS[id]; return g.dense || g.flow < 0.7 ? 6 : isSpirit(id) ? 18 + g.tier * 8 : 4 + g.tier * 1.5; }
const costPerMl = (id) => bottleCost(id) / bottleSize(id);
function stockOf(id) { S.stock = S.stock || {}; if (S.stock[id] === undefined) S.stock[id] = bottleSize(id) * (0.55 + Math.random() * 0.45); return S.stock[id]; }
function showStock(id) {
  const b = bottles[id]; const liq = b && b.obj.userData.liq; if (!liq) return;
  liq.scale.y = Math.max(0.02, stockOf(id) / bottleSize(id)); liq.visible = stockOf(id) > 1;
}
function useStock(id, ml) {
  if (!INGREDIENTS[id] || INGREDIENTS[id].spot === 'tap') return;
  S.stock[id] = stockOf(id) - ml;
  if (S.stock[id] <= 0) {
    const cost = bottleCost(id);
    S.money -= cost; S.stock[id] += bottleSize(id); if (NS) NS.restock += cost;
    toast(`${INGREDIENTS[id].name} ran dry. New bottle: -${fmt(cost)}`); sound.thud(0.1); updateHUD(); drawRegister();
  }
  showStock(id);
}
const kick = { pitch: 0, roll: 0 }; // tiny camera jolts so actions land
let slowT = 0; // brief slow motion after a perfect pour
let zoom = 1.1;
try { const z = parseFloat(localStorage.getItem('lastcall-zoom')); if (z) zoom = z; } catch { /* ignore */ }
const keys = {};
let locked = false, freeCursor = false;
const mouse = new THREE.Vector2(0, 0);
let mouseDown = false, rightDown = false;
let running = false, overlayOpen = false;

// held item
let held = null; // {kind:'bottle'|'scoop'|'shaker'|'spoon'|'rag'|'garnish', obj, id?, tilt, ...}
const raycaster = new THREE.Raycaster();
raycaster.far = 4.2;
let hover = null, aimPoint = null;

// pour fx
const streamMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.05, clearcoat: 1, depthWrite: false });
const stream = new THREE.Mesh(new THREE.BufferGeometry(), streamMat); stream.visible = false; stream.renderOrder = 7; scene.add(stream);
const drops = [];
const dropGeo = new THREE.SphereGeometry(0.0025, 6, 4);
const puddles = [];
const fallingIce = [];
const looseIce = [];
let pourSession = 0, pourSpill = 0, pourIng = null;

// customers
const customers = [];
let spawnTimer = 3;
let selectedTicket = null;
const ambient = [];

// ------------------------------------------------------------------ nights & streaks
const NIGHT_LEN = 240;
let nightT = NIGHT_LEN, lastCall = false, streak = 0;
let NS = null; // this night's stats
const nightGoal = () => 40 + S.night * 30;
// combo: perfect drinks build it, decent ones hold it, bad ones and walkouts break it
const comboMult = (n) => n >= 12 ? 2 : n >= 8 ? 1.75 : n >= 5 ? 1.5 : n >= 3 ? 1.25 : 1;
// each night: a money goal plus two random challenges, one star each
function pickGoals() {
  const n = S.night;
  const hasShake = RECIPES.some((r) => r.tier <= S.tier && r.method === 'shake');
  const pool = [
    { id: 'served', txt: `Serve ${6 + n} drinks`, need: 6 + n, val: () => NS.served },
    { id: 'perfect', txt: `${2 + Math.floor(n / 2)} perfect drinks`, need: 2 + Math.floor(n / 2), val: () => NS.perfect },
    { id: 'combo', txt: `Hit a ${3 + Math.min(5, Math.floor(n / 2))}x combo`, need: 3 + Math.min(5, Math.floor(n / 2)), val: () => NS.best },
    { id: 'nolost', txt: 'Nobody walks out', need: 1, val: () => NS.lost === 0 ? (NS.over && NS.served >= 3 ? 1 : 0) : -1 },
    { id: 'avg', txt: 'Average score 85+', need: 85, val: () => NS.served >= 3 ? Math.round(NS.scores / NS.served) : 0, live: true },
    { id: 'tips', txt: `${fmt(10 + 6 * n)} in tips`, need: 10 + 6 * n, val: () => NS.tips },
  ];
  if (hasShake) pool.push({ id: 'shaken', txt: `Serve ${2 + Math.floor(n / 3)} shaken drinks`, need: 2 + Math.floor(n / 3), val: () => NS.shaken });
  const picks = [];
  while (picks.length < 2) { const g = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; picks.push(g); }
  return [{ id: 'earn', txt: `Earn ${fmt(nightGoal())}`, need: nightGoal(), val: () => NS.earned }, ...picks];
}
const goalDone = (g) => g.val() >= g.need && !(g.id === 'avg' && !NS.over && false);
function newNightStats() { NS = { served: 0, earned: 0, tips: 0, perfect: 0, lost: 0, best: 0, scores: 0, shaken: 0, over: false, rush: false, restock: 0, waste: 0, wasteCost: 0 }; NS.goals = pickGoals(); NS.goalsHit = new Set(); }
newNightStats();
function endNight() {
  overlayOpen = true; releaseMouse();
  if (held) putBack();
  NS.over = true;
  const done = NS.goals.map(goalDone);
  const stars = done.filter(Boolean).length;
  const perStar = 10 + S.night * 6;
  const bonus = stars * perStar;
  for (const p of [...cashPiles]) { S.money += p.amount; removePickable(p.hit); scene.remove(p.group); } cashPiles.length = 0;
  for (const d of [...dirty]) { removePickable(d.hit); scene.remove(d.hit); scene.remove(d.obj); } dirty.length = 0;
  S.money += bonus;
  const avg = NS.served ? NS.scores / NS.served : 0;
  S.stars = (S.stars || 0) + stars; S.bestCombo = Math.max(S.bestCombo || 0, NS.best);
  const newBest = NS.earned > (S.bestNight || 0) && S.night > 1;
  S.bestNight = Math.max(S.bestNight || 0, NS.earned);
  S.night++; save();
  $('sumTitle').textContent = `Night ${S.night - 1} closed`;
  $('sumStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('sumRows').innerHTML = [
    ...NS.goals.map((g, i) => [(done[i] ? '★ ' : '☆ ') + g.txt, done[i] ? '+' + fmt(perStar) : 'missed']),
    ['Drinks served', NS.served], ['Perfect drinks', NS.perfect], ['Best combo', NS.best + 'x'], ['Walked out', NS.lost],
    ['Average score', NS.served ? Math.round(avg) + ' / 100' : '—'], ['Tips', fmt(NS.tips)],
    ['Spilled or over-poured', `${(NS.waste / OZ).toFixed(1)} oz (${fmt(NS.wasteCost)})`], ['New bottles bought', NS.restock ? '-' + fmt(NS.restock) : '—'], ['Earned tonight' + (newBest ? '  NEW BEST' : ''), fmt(NS.earned)],
  ].map(([a, b]) => `<div class="srow"><span>${a}</span><b>${b}</b></div>`).join('');
  $('sumNote').textContent = `Till: ${fmt(S.money)}. Spend it at the supplier before the next night.`;
  $('summary').hidden = false; sound.cheer();
}
function startNight() {
  $('summary').hidden = true; overlayOpen = false;
  nightT = NIGHT_LEN; lastCall = false; streak = 0; newNightStats(); spawnTimer = 3;
  for (const p of [...puddles]) { scene.remove(p.mesh); } puddles.length = 0;
  applyUnlocks(); requestLock(); toast(`Night ${S.night}. Goal: ${fmt(nightGoal())}`);
}
// confetti burst
const confettiGeo = new THREE.PlaneGeometry(0.018, 0.01);
function confetti(at) {
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.9, 0.6), side: THREE.DoubleSide, transparent: true }));
    m.position.copy(at); scene.add(m);
    drops.push({ mesh: m, vel: V3((Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6), life: 1.3 + Math.random() * 0.5, spin: true });
  }
}

// ------------------------------------------------------------------ unlock state → world
function applyUnlocks() {
  for (const id in bottles) { bottles[id].obj.visible = INGREDIENTS[id].tier <= S.tier; showStock(id); }
  bar.stations.garnish.forEach((g) => { g.pile.visible = GARNISHES[g.type].tier <= S.tier; });
  for (const tp of bar.taps) tp.piv.visible = INGREDIENTS[tp.id].tier <= S.tier;
  for (const it of bar.fridge.items) it.grp.visible = ITEMS[it.id].tier <= S.tier;
  const glassTier = { rocks: 0, highball: 0, pint: 0, shot: 0, mug: 1, coupe: 2, martini: 2, flute: 2 };
  bar.stations.glasses.forEach((g) => { g.holder.visible = glassTier[g.glass ?? g.type] <= S.tier; });
  shaker.group.visible = S.tier >= 2;
  bar.stations.spoon.obj.visible = S.tier >= 2;
  bar.tipJar.visible = has('tipjar');
  const stools = activeSeats().length;
  const order = SEAT_ORDER;
  bar.stools.forEach((s) => { s.visible = false; }); void order; void stools; // standing bar
  bar.peanuts.forEach((p, i) => { p.visible = has('peanuts') && bar.stools[i].visible; });
  bar.jukebox.visible = false;
  sound.setMusic(true, has('jukebox'));
  bar.decor.lights.visible = has('lights'); bar.decor.sofas.visible = has('sofas'); bar.decor.fire.visible = has('firepit'); bar.decor.led.visible = has('ledwall');
  bar.openSign.visible = has('neon'); bar.openLight.intensity = has('neon') ? 1.5 : 0;
  bar.updateChalk(S.tier);
  drawRegister();
}
const SEAT_ORDER = [2, 3, 1, 4, 0, 5];
function activeSeats() { const n = 3 + (has('stool3') ? 1 : 0) + (has('stool4') ? 1 : 0) + (has('stool5') ? 1 : 0); return SEAT_ORDER.slice(0, n); }
function isLocked(pick) {
  if (!pick) return false;
  if (pick.type === 'bottle' || pick.type === 'tap') return INGREDIENTS[pick.id].tier > S.tier;
  if (pick.type === 'fitem') return ITEMS[pick.id].tier > S.tier;
  if (pick.type === 'garnish') return GARNISHES[pick.g].tier > S.tier;
  if (pick.type === 'spoon' || pick.type === 'shaker') return S.tier < 2;
  if (pick.type === 'rack') return ({ mug: 1, coupe: 2, martini: 2, flute: 2 }[pick.glass] || 0) > S.tier;
  return false;
}

let regSig = '';
function drawRegister() {
  const c = selectedTicket && selectedTicket.state === 'waiting' ? selectedTicket : null;
  const step = c ? (nextStep(c.recipe, glass) || `Click ${c.p.name} to serve`) : '';
  const sig = S.money.toFixed(2) + '|' + (c ? c.p.name + c.recipe.id + step : '');
  if (sig === regSig) return; regSig = sig;
  const [cv, g] = bar.registerCanvas; const W = cv.width, H = cv.height;
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#5fe0d0'); grd.addColorStop(1, '#2fb8a8');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0b2b2a'; g.fillRect(0, 0, W, 54);
  g.fillStyle = '#7ff5e4'; g.font = 'bold 28px Manrope, Arial, sans-serif'; g.fillText('POS', 18, 37);
  g.textAlign = 'right'; g.fillText(fmt(S.money), W - 18, 37); g.textAlign = 'left';
  g.fillStyle = '#062221';
  if (c) {
    g.font = 'bold 34px Manrope, Arial, sans-serif'; g.fillText(c.recipe.name, 18, 98);
    g.font = '22px Manrope, Arial, sans-serif'; g.fillText(`for ${c.p.name} · ${c.recipe.item ? 'from the fridge' : GLASSES[c.recipe.glass].name}`, 18, 130);
    let y = 166;
    for (const [k, v] of Object.entries(c.recipe.parts)) { g.fillText(`${v} oz  ${INGREDIENTS[k].name}`, 28, y); y += 28; if (y > 250) break; }
    g.font = 'bold 22px Manrope, Arial, sans-serif';
    const words = step.split(' '); let line = '', yy = 284;
    for (const w of words) { if (g.measureText(line + w).width > W - 36) { g.fillText(line, 18, yy); line = ''; yy += 26; } line += w + ' '; }
    g.fillText(line, 18, yy);
  } else {
    g.font = 'bold 30px Manrope, Arial, sans-serif'; g.fillText('No open orders', 18, 110);
    g.font = '22px Manrope, Arial, sans-serif'; g.fillText('Tap here for the supplier', 18, 150);
  }
  bar.registerScreen.material.map.needsUpdate = true;
}
// ------------------------------------------------------------------ ambient guests at tables
function seatAmbient() {
  const spots = [[0, 0], [1, 1], [2, 0]];
  spots.forEach(([ti, k], i) => {
    const [tx, tz] = bar.tableSpots[ti];
    const a = k * Math.PI + 0.4;
    const px = tx + Math.cos(a) * 0.7, pz = tz + Math.sin(a) * 0.7;
    const p = buildPerson(900 + i * 31);
    p.root.position.set(px, 0, pz);
    p.root.rotation.y = Math.atan2(tx - px, tz - pz);
    p.st.mode = 'sit'; p.st.sitBlend = 1; p.st.sitHeight = 0.52;
    p.st.look.set(tx - (px - tx), 1.15, tz - (pz - tz));
    p.st.lookW = 0.7;
    scene.add(p.root);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 16), MAT.glass); cup.position.set(tx + (px - tx) * 0.45, 0.81, tz + (pz - tz) * 0.45); cup.renderOrder = 5; scene.add(cup);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.023, 0.06, 16), new THREE.MeshStandardMaterial({ color: [0xe2a024, 0xb5601a, 0x9a1030, 0xf0e6c0][i % 4], transparent: true, opacity: 0.8 })); liq.position.copy(cup.position).add(V3(0, -0.015, 0)); scene.add(liq);
    ambient.push({ p, t: Math.random() * 10 });
  });
}

// ------------------------------------------------------------------ the club: dancers, DJ, lights on the beat
const dancers = [];
let dj = null;
function spawnClubPeople() {
  const F = bar.club.floorC;
  // a packed floor: 14 dancers, each with their own move
  // fully animated dancers at the front of the floor; the rest of the club is the baked crowd
  const spotsD = [[-2.6, 5.0, 0], [-1.5, 4.9, 0], [-0.4, 5.1, 0], [0.7, 4.9, 0], [1.8, 5.0, 0], [-2.0, 6.1, 0], [-0.9, 6.0, 0], [0.2, 6.2, 0], [1.3, 6.0, 0], [2.4, 6.2, 0]];
  spotsD.forEach(([x, z, y], i) => {
    const p = buildPerson(4000 + i * 13, { lite: true });
    p.root.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    p.root.rotation.y = y > 0 ? Math.atan2(-0.3 - x, 7 - z) : (Math.random() - 0.5) * 1.6;
    p.st.mode = 'walk'; scene.add(p.root);
    dancers.push({ p, style: y > 0 ? [2, 0, 4, 7][i % 4] : i % 8, ph: Math.random() * 4, baseYaw: p.root.rotation.y, home: p.root.position.clone() });
  });
  // a couple of pairs face each other
  for (const [a, b] of [[1, 2], [7, 8]]) { const A = dancers[a], B = dancers[b]; A.baseYaw = Math.atan2(B.home.x - A.home.x, B.home.z - A.home.z); B.baseYaw = A.baseYaw + Math.PI; }
  void F;
  dj = buildPerson(31337);
  dj.root.position.set(-0.3, 0.72, 12.9); dj.root.rotation.y = Math.PI; scene.add(dj.root);
  const phones = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true }));
  phones.position.y = 0.02; phones.rotation.y = Math.PI / 2; dj.head.add(phones);
  for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), phones.material); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.1, -0.005, 0); dj.head.add(cup); }
}
// ------------------------------------------------------------------ the crowd
// ~150 people scattered across the club. Each is one merged mesh (cheap to draw) that bounces,
// sways and turns to the music. Several posed variants are baked from the full character model.
const crowd = [];
const crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
function bakePerson(seed, pose) {
  const p = buildPerson(seed, { lite: true });
  p.st.mode = 'stand'; p.st.lookW = 0;
  p.root.updateMatrixWorld(true);
  for (let k = 0; k < 12; k++) {
    const head = p.head.getWorldPosition(V3());
    if (pose === 'up' || pose === 'one' || pose === 'groove' || pose === 'sway') { p.st.mode = 'dance'; p.st.dance = { style: pose === 'one' ? 'point' : pose, ph: 0, energy: 0.9 }; p.st.beat = 0.15 + Math.random() * 0.7; }
    else if (pose === 'drink') { p.setArmTarget('right', { pos: head.clone().add(V3(-0.12, -0.32, 0.2)), pose: POSES.cupGlass }); p.setArmTarget('left', null); }
    else if (pose === 'talk') { p.setArmTarget('left', { pos: head.clone().add(V3(0.22, -0.38, 0.22)), pose: POSES.flat }); p.setArmTarget('right', { pos: head.clone().add(V3(-0.22, -0.4, 0.2)), pose: POSES.relaxed }); }
    p.update(0.08, k * 0.08);
  }
  p.setEmotion('happy'); for (let k = 0; k < 10; k++) p.update(0.08, 2 + k * 0.08);
  p.root.updateMatrixWorld(true);
  const parts = [];
  const c = new THREE.Color();
  p.root.traverse((o) => {
    if (!o.isMesh) return;
    let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) { vis = false; break; }
    if (!vis || (o.material && o.material.transparent && o.material.opacity < 0.5)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.matrixWorld);
    c.copy(o.material.color || new THREE.Color(0xffffff));
    const n = g.attributes.position.count; const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  });
  if (pose === 'drink') { const cup = new THREE.CylinderGeometry(0.032, 0.026, 0.1, 10).toNonIndexed(); const hw = p.arms.right.wrist.getWorldPosition(V3()); cup.translate(hw.x, hw.y + 0.02, hw.z + 0.06); const n = cup.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) col[i] = 0.85; cup.deleteAttribute('uv'); cup.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(cup); }
  const merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  return merged;
}
function spawnCrowd() {
  const poses = ['groove', 'up', 'drink', 'talk', 'sway', 'one', 'groove', 'talk'];
  const bakes = [];
  for (let i = 0; i < 42; i++) bakes.push({ geo: bakePerson(7000 + i * 17, poses[i % poses.length]), pose: poses[i % poses.length] });
  const placed = [];
  const free = (x, z, y) => placed.every((q) => q.y !== y || Math.hypot(q.x - x, q.z - z) > 0.6);
  const blocked = (x, z) =>
    (z < 2.9) || (x > 7.2) || // keep the bar front, the queue and the walkway to the door clear
    (z > 11.2 && x > -4.9 && x < 4.3) || // DJ stage
    bar.tableSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.3) || Math.hypot(x + 6.5, z - 11.5) < 1.7 ||
    (x > -3.8 && x < 3.2 && z < 6.6); // front of the floor belongs to the animated dancers
  const zones = [
    { n: 70, x0: -3.6, x1: 3.0, z0: 6.6, z1: 10.8, y: 0, face: 'dj' },   // packed dance floor
    { n: 26, x0: -9.2, x1: -4.2, z0: 3.0, z1: 14.2, y: 0, face: 'any' }, // left lounge
    { n: 22, x0: 3.6, x1: 7.0, z0: 3.4, z1: 14.2, y: 0, face: 'any' },   // right side
    { n: 10, x0: -9.4, x1: -8.2, z0: 2.4, z1: 13.0, y: 3.225, face: 'dj' }, // left balcony
    { n: 10, x0: 8.2, x1: 9.4, z0: 2.4, z1: 13.0, y: 3.225, face: 'dj' },   // right balcony
  ];
  let k = 0;
  for (const zn of zones) {
    let made = 0, tries = 0;
    while (made < zn.n && tries++ < zn.n * 40) {
      const x = zn.x0 + Math.random() * (zn.x1 - zn.x0), z = zn.z0 + Math.random() * (zn.z1 - zn.z0);
      if (zn.y === 0 && blocked(x, z)) continue;
      if (!free(x, z, zn.y)) continue;
      const b = bakes[k++ % bakes.length];
      const m = new THREE.Mesh(b.geo, crowdMat); m.position.set(x, zn.y, z);
      const yaw = zn.face === 'dj' ? Math.atan2(-0.3 - x, 13 - z) + (Math.random() - 0.5) * 0.8 : Math.random() * Math.PI * 2;
      m.rotation.y = yaw; m.castShadow = false; m.receiveShadow = false;
      scene.add(m); placed.push({ x, z, y: zn.y });
      const energy = b.pose === 'up' ? 0.8 : b.pose === 'groove' || b.pose === 'one' ? 0.6 : b.pose === 'sway' ? 0.45 : 0.25;
      crowd.push({ m, base: m.position.clone(), yaw, energy: energy * (zn.face === 'dj' ? 1 : 0.6), ph: Math.random() * 4, sway: 0.1 + Math.random() * 0.25, turn: Math.random() < 0.15 });
      made++;
    }
  }
}
function updateCrowd(beatT) {
  for (const c of crowd) {
    const bt = beatT + c.ph;
    const bounce = -Math.pow(0.5 + 0.5 * Math.cos(bt * Math.PI * 2), 1.6) * 0.035 * c.energy;
    c.m.position.y = c.base.y + bounce;
    c.m.rotation.y = c.yaw + Math.sin(bt * Math.PI * 0.25) * c.sway + (c.turn ? (bt % 8) / 8 * Math.PI * 2 : 0);
    c.m.rotation.z = Math.sin(bt * Math.PI) * 0.035 * c.energy;
    c.m.position.x = c.base.x + Math.sin(bt * Math.PI) * 0.03 * c.energy;
  }
}

const humans = []; // dancers, lounge and balcony people (real models)
function spawnModelPeople() {
  const placed = [];
  const free = (x, z, y) => placed.every((q) => q.y !== y || Math.hypot(q.x - x, q.z - z) > 0.95);
  const blocked = (x, z) => (z < 2.9) || (x > 7.0) || (x < -8.4) || (z > 11.2 && x > -4.9 && x < 4.3) ||
    bar.tableSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.0) || Math.hypot(x + 6.5, z - 11.5) < 1.7;
  const zones = [
    { n: 26, x0: -3.6, x1: 3.0, z0: 4.4, z1: 10.8, y: 0, mode: 'dance', fem: 0.55 },
    { n: 8, x0: -9.2, x1: -4.2, z0: 3.0, z1: 14.0, y: 0, mode: 'mix', fem: 0.5 },
    { n: 6, x0: 3.6, x1: 6.8, z0: 3.6, z1: 14.0, y: 0, mode: 'mix', fem: 0.5 },
    { n: 4, x0: -9.4, x1: -8.2, z0: 2.6, z1: 12.8, y: 3.225, mode: 'dance', fem: 0.5 },
    { n: 4, x0: 8.2, x1: 9.4, z0: 2.6, z1: 12.8, y: 3.225, mode: 'dance', fem: 0.5 },
  ];
  let seed = 9000;
  for (const zn of zones) {
    let made = 0, tries = 0;
    while (made < zn.n && tries++ < zn.n * 60) {
      const x = zn.x0 + Math.random() * (zn.x1 - zn.x0), z = zn.z0 + Math.random() * (zn.z1 - zn.z0);
      if (zn.y === 0 && blocked(x, z)) continue;
      if (!free(x, z, zn.y)) continue;
      const fem = Math.random() < zn.fem;
      const h = makeHuman(seed++, { fem });
      h.st.mode = zn.mode === 'mix' ? ['dance', 'talk', 'drink', 'stand'][Math.floor(Math.random() * 4)] : 'dance';
      h.root.position.set(x, zn.y, z);
      h.root.rotation.y = zn.mode === 'dance' ? Math.atan2(-0.3 - x, 13 - z) + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
      scene.add(h.root); humans.push(h); placed.push({ x, z, y: zn.y });
      made++;
    }
  }
  // real furniture (Poly Haven, CC0) replaces the hand-built tables and lamps
  for (const g of bar.tables || []) g.visible = false;
  bar.tableSpots.forEach(([x, z], i) => {
    const face = x < 0 ? 1 : -1; // turn the seating toward the room
    const tbl = makeProp('coffee_table_round_01', 0.8); tbl.position.set(x, 0, z); scene.add(tbl);
    const sofa = makeProp('sofa_02', 1.15); sofa.position.set(x - face * 1.25, 0, z); sofa.rotation.y = face * Math.PI / 2; scene.add(sofa);
    for (const dz of [-0.95, 0.95]) { const ch = makeProp('mid_century_lounge_chair', 0.85); ch.position.set(x + face * 1.1, 0, z + dz); ch.rotation.y = -face * Math.PI / 2 + (dz > 0 ? 0.5 : -0.5) * face; scene.add(ch); }
    const plant = makeProp('potted_plant_04', 1.6); plant.position.set(x + 0.2, 0.39, z - 0.1); scene.add(plant);
    const lamp = makeProp('modern_ceiling_lamp_01', 1.8); lamp.position.set(x, 3.0, z); scene.add(lamp);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 3.6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); cord.position.set(x, 5.2, z); scene.add(cord);
    void i;
  });
  for (const g of bar.pendants || []) g.visible = false;
  for (const x of [-1.6, -0.55, 0.55, 1.6]) {
    const lamp = makeProp('hanging_industrial_lamp', 1.0); lamp.position.set(x, 3.65, 0.22); scene.add(lamp);
    lamp.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.envMapIntensity = 0.25; } });
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 3.4, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); cord.position.set(x, 5.35, 0.22); scene.add(cord);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xb08a58, toneMapped: false })); bulb.position.set(x, 2.42, 0.22); scene.add(bulb);
  }
  // bar chairs under the balconies
  for (const sx of [-1, 1]) for (const z of [3.4, 4.4, 7.2, 8.2, 11.0]) {
    const ch = makeProp('bar_chair_round_01', 1.0); ch.position.set(sx * 9.2, 0, z); ch.rotation.y = -sx * Math.PI / 2 + (Math.random() - 0.5) * 0.6; scene.add(ch);
  }

  // the DJ on stage
  // moving-head stage lights hanging from the trusses, colored to the beat (CC0 model)
  bar.club.heads = [];
  for (const z of [2, 5, 8, 11]) for (const x of [-7, -3.6, 3.6, 7]) {
    const h = makeProp('club_movinghead', 1.15); h.rotation.x = Math.PI; h.position.set(x, 6.42, z);
    h.traverse((o) => { if (o.isMesh && o.material.name === 'Glow') { o.material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); bar.club.heads.push({ m: o.material, x, z }); } });
    scene.add(h);
  }
  // PA speaker stacks at the stage corners (CC0 model)
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const sp = makeProp('club_speaker', 1.7); sp.position.set(-0.3 + sx * 5.3, i * 1.22, 13.9); sp.rotation.y = Math.PI + sx * 0.25; scene.add(sp);
  }
  dj = makeHuman(31337, { fem: false }); dj.st.mode = 'dance';
  dj.root.position.set(-0.3, 0.6, 12.95); dj.root.rotation.y = Math.PI; scene.add(dj.root);
}
let humanTick = 0;
function updateHumans(dt) {
  humanTick++;
  for (let i = 0; i < humans.length; i++) {
    const h = humans[i];
    if (h.hidden) continue;
    // people far from you animate every other frame to save time
    const d2 = h.root.position.distanceToSquared(camera.position);
    const every = d2 > 144 ? 3 : d2 > 49 ? 2 : 1; // far people animate at a lower rate
    if ((i + humanTick) % every) continue;
    h.update(dt * every);
  }
}

function updateClub(dt, t) {
  const C = bar.club; const b = sound.beat(); const kick = Math.pow(1 - b.ph, 3);
  C.frames = bar.neonFrames;
  // floor tiles
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < C.floorC.NX; i++) for (let j = 0; j < C.floorC.NZ; j++) {
    const on = (i + j + b.n) % 3 === 0 || ((i * 7 + j * 3 + Math.floor(b.n / 2)) % 5 === 0);
    col.setHSL(((b.n >> 2) * 0.17 + i * 0.05 + j * 0.08) % 1, 0.9, on ? 0.18 + 0.32 * kick : 0.04);
    C.floor.setColorAt(n++, col);
  }
  C.floor.instanceColor.needsUpdate = true;
  C.ball.rotation.y += dt * 0.7;
  for (const bm of C.beams) { bm.piv.rotation.x = Math.sin(t * 0.7 + bm.ph) * 0.65; bm.piv.rotation.z = Math.cos(t * 0.53 + bm.ph * 2) * 0.65; bm.m.material.opacity = 0.05 + 0.13 * kick; }
  for (const sp of C.spots) { sp.m.position.x = C.floorC.x + Math.sin(t * 0.6 + sp.ph * 3) * 3.0; sp.m.position.z = C.floorC.z + Math.cos(t * 0.45 + sp.ph * 2) * 2.2; sp.m.material.opacity = 0.25 + 0.4 * kick; }
  const laserOn = (b.n % 16) >= 8;
  for (const l of C.lasers) { l.piv.visible = laserOn; l.piv.rotation.y = Math.sin(t * 0.9 + l.ph) * 0.7; l.piv.rotation.x = -0.12 + Math.sin(t * 1.4 + l.ph) * 0.1; }
  for (const cn of C.cones) cn.scale.y = 1 + 0.6 * kick;
  C.recL.rotation.y += dt * 3.5; C.recR.rotation.y += dt * 3.5;
  C.djStrip.material.color.setHSL((t * 0.1) % 1, 0.9, 0.55);
  bar.hemi.color.setHSL((t * 0.03) % 1, 0.55, 0.62); bar.hemi.intensity = 0.42 + 0.14 * kick;
  scene.fog.color.setHSL(((b.n >> 2) * 0.17 + 0.75) % 1, 0.55, 0.05 + 0.03 * kick);
  if (C.haze) C.haze.forEach((h, i) => { h.material.map.offset.x = t * (0.006 + i * 0.003); h.material.map.offset.y = t * 0.004 * (i % 2 ? -1 : 1); h.material.color.setHSL(((b.n >> 2) * 0.17 + i * 0.2) % 1, 0.7, 0.5); h.material.opacity = 0.05 + 0.03 * kick; });
  if (C.ceil) { if ((C.ceilTick = (C.ceilTick || 0) + 1) % 3 === 0) { for (let i = 0; i < C.ceil.count; i++) { const gx = i % C.ceilNX, gz = Math.floor(i / C.ceilNX); const wave = Math.sin(gx * 0.5 + gz * 0.35 - (b.n + b.ph) * 1.6); col.setHSL(((b.n >> 3) * 0.23 + gz * 0.03) % 1, 0.9, wave > 0.55 ? 0.25 + 0.35 * kick : 0.03); C.ceil.setColorAt(i, col); } C.ceil.instanceColor.needsUpdate = true; } }
  if (C.heads) C.heads.forEach((h, i) => h.m.color.setHSL(((b.n >> 1) * 0.13 + i * 0.07) % 1, 1, (b.n + i) % 4 === 0 ? 0.55 + 0.3 * kick : 0.25));
  if (C.wall && (C.wallTick = (C.wallTick || 0) + 1) % 2 === 0) C.drawWall(b, kick, t);
  bar.sun.color.setHSL((t * 0.03 + 0.5) % 1, 0.7, 0.6);
  // dancers move to the beat
  const beatT = b.n + b.ph;
  updateCrowd(beatT);
  updateHumans(dt);
  // dancers: natural full-body grooves; on the chorus the energetic ones throw their hands up
  const chorus = b.part >= 2;
  for (const d of dancers) {
    const p = d.p;
    if (!d.dance) d.dance = { ph: Math.random() * 0.25, energy: 0.6 + Math.random() * 0.4, style: 'groove' };
    if (b.n !== d.lastN && b.n % 16 === 0) { // pick a new move every 4 bars
      d.lastN = b.n;
      const calm = ['groove', 'sway', 'shoulders', 'groove', 'clap'];
      const hype = ['up', 'jump', 'point', 'up', 'groove', 'clap'];
      d.dance.style = (chorus && d.dance.energy > 0.7 ? hype : calm)[Math.floor(Math.random() * (chorus ? hype.length : calm.length))];
    }
    p.st.mode = 'dance'; p.st.dance = d.dance; p.st.beat = beatT;
    p.root.position.set(d.home.x, d.home.y, d.home.z);
    p.root.rotation.y = d.baseYaw + Math.sin((beatT + d.ph * 4) * Math.PI / 16) * 0.5;
    p.st.look.set(-0.3, 2.0, 12.6); p.st.lookW = 0.25;
    if (Math.random() < dt * 0.05) p.setEmotion(Math.random() < 0.7 ? 'happy' : 'neutral');
    p.update(dt, t);
  }
  for (const nf of C.frames || []) { nf.m.color.copy(nf.base).multiplyScalar(0.55 + 0.6 * kick); }
  if (bar.ledFront) bar.ledFront.material.color.setScalar(0.55 + 0.35 * kick);
  if (dj) {
    const head = dj.head.getWorldPosition(V3());
    const yaw = dj.root.rotation.y; const right = V3(-Math.cos(yaw), 0, Math.sin(yaw)); const fwd = V3(Math.sin(yaw), 0, Math.cos(yaw));
    dj.setArmTarget('left', { pos: V3(-0.3 + 0.45, 1.66, 12.5), pose: POSES.flat });
    const hype = (b.n % 16) >= 12;
    dj.setArmTarget('right', hype ? { pos: head.clone().addScaledVector(right, 0.15).add(V3(0, 0.25 + kick * 0.1, 0)), pose: POSES.fist } : { pos: V3(-0.3 - 0.45 + Math.sin(t * 6) * 0.04, 1.66, 12.5), pose: POSES.flat });
    dj.st.look.set(-0.3, 1.6 + kick * 0.15, 6); dj.st.lookW = 1;
    dj.root.position.y = dj.isModel ? 0.6 : 0.72 + kick * 0.02;
    void fwd;
    dj.update(dt, t);
  }
}

// ------------------------------------------------------------------ input
canvas.addEventListener('mousedown', (e) => {
  if (!running || overlayOpen) return;
  sound.init();
  if (!document.pointerLockElement && !userFreed) tryRealLock();
  if (!locked && !freeCursor) { requestLock(); freeCursor = true; mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; raycaster.setFromCamera(mouse, camera); }
  if (!locked) { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; }
  camera.updateMatrixWorld(true); computeHover();
  if (e.button === 0) { mouseDown = true; onPrimaryDown(); }
  if (e.button === 2) { rightDown = true; onSecondaryDown(); }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) { mouseDown = false; onPrimaryUp(); } if (e.button === 2) rightDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  lastCX = e.clientX; lastCY = e.clientY; cursorIn = true;
  if (locked) {
    if (overlayOpen || !$('paused').hidden) return;
    const mx = clamp(e.movementX, -160, 160), my = clamp(e.movementY, -160, 160); // spike guard
    player.yaw -= mx * 0.0022;
    player.pitch = clamp(player.pitch - my * 0.0022, -1.35, 0.9);
  } else {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    lastCX = e.clientX; lastCY = e.clientY;
    // no mouse capture available: right-click and drag to look around
    if (rightDown && running && !overlayOpen) {
      player.yaw -= e.movementX * 0.004;
      player.pitch = clamp(player.pitch - e.movementY * 0.004, -1.35, 0.9);
      dragLooked = true;
    }
  }
});
let dragLooked = false;
let lastCX = window.innerWidth / 2, lastCY = window.innerHeight / 2;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!running) return;
  if (e.code === 'KeyB') { toggleShop(); e.preventDefault(); }
  if (e.code === 'KeyR') { toggleBook(); e.preventDefault(); }
  if (e.code === 'KeyM') { sound.init(); sound.next(); }
  if (e.code === 'Escape' && overlayOpen) { closeOverlays(); return; }
  if (overlayOpen) return;
  if (e.code === 'KeyE') { toggleLock(); e.preventDefault(); }
  if (e.code === 'Escape' && softLock) { setSoftLock(false); freeCursor = true; }
  if (e.code === 'Escape' && !locked && $('paused').hidden) { $('paused').hidden = false; mouseDown = false; onPrimaryUp(); }
  if (e.code === 'KeyQ') putBack();
  if (/Digit[1-4]/.test(e.code)) { const w = waiting(); const i = +e.code.slice(5) - 1; if (w[i]) { selectedTicket = w[i]; renderTickets(true); } }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// E: lock the mouse to look around, press again to get a free cursor (look with right-drag)
function toggleLock() {
  if (locked) { userFreed = true; freeCursor = true; releaseMouse(); toast('Cursor free · E for mouse look'); }
  else { userFreed = false; $('paused').hidden = true; requestLock(); }
}
// Soft mouse look: when the browser won't lock the mouse (common inside embedded pages), hide the cursor and
// turn the view with plain mouse movement anyway (only while the mouse actually moves).
let softLock = false, cursorIn = false, userFreed = false;
document.addEventListener('mouseleave', () => { cursorIn = false; });
document.documentElement.addEventListener('mouseleave', () => { cursorIn = false; });
window.addEventListener('blur', () => { cursorIn = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) cursorIn = false; });
function setSoftLock(on) {
  softLock = on; locked = on || document.pointerLockElement === canvas;
  canvas.style.cursor = on ? 'none' : '';
  if (on) { freeCursor = false; $('paused').hidden = true; }
}
function tryRealLock() {
  try { const p = canvas.requestPointerLock({ unadjustedMovement: false }); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed here */ }
}
// when the page won't lock the mouse: keep a visible cursor to aim with; the screen edges turn the view
let cursorTipShown = false;
function cursorMode() {
  if (softLock) setSoftLock(false);
  freeCursor = true; $('paused').hidden = true;
  if (!cursorTipShown) { cursorTipShown = true; toast('Aim with the cursor · push it to the screen edge to turn'); }
}
function releaseMouse() { if (softLock) setSoftLock(false); if (document.pointerLockElement) document.exitPointerLock(); }
// back to the start menu mid-night: the night waits until you come back
let nightInProgress = false;
function goMenu() {
  if (held) putBack();
  running = false; nightInProgress = true; mouseDown = false; onPrimaryUp();
  freeCursor = true; releaseMouse();
  $('paused').hidden = true; $('hud').hidden = true; $('bubbles').style.display = 'none';
  $('start').hidden = false; fillStart();
}
function requestLock() {
  const fallback = () => { if (!locked && running && !overlayOpen) cursorMode(); };
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(fallback);
  } catch { fallback(); }
  setTimeout(fallback, 350);
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas && softLock) { softLock = false; canvas.style.cursor = ''; }
  locked = document.pointerLockElement === canvas || softLock;
  if (locked) { freeCursor = false; $('paused').hidden = true; }
  else if (running && !overlayOpen && !freeCursor) { $('paused').hidden = false; mouseDown = false; onPrimaryUp(); }
});
document.addEventListener('pointerlockerror', () => { if (running && !overlayOpen) cursorMode(); });
$('resumeBtn').onclick = () => { $('paused').hidden = true; requestLock(); };
$('menuBtn').onclick = () => goMenu();
$('paused').addEventListener('click', (e) => { if (e.target.id === 'paused') { $('paused').hidden = true; requestLock(); } });

// ------------------------------------------------------------------ interaction
function computeHover() {
  if (locked) raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  else raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  hover = null;
  for (const h of hits) {
    const pk = h.object.userData.pick;
    if (!pk) continue;
    if (held && pk.type === 'bottle' && held.id === pk.id) continue;
    if (held && pk.type === 'shaker' && held.kind === 'shaker') continue;
    if (pk.type === 'bottle' && !bottles[pk.id].obj.visible) continue;
    if ((pk.type === 'spoon' && held?.kind === 'spoon') || (pk.type === 'rag' && held?.kind === 'rag')) continue;
    if (pk.type === 'rack' && !bar.stations.glasses.find((g) => g.type === pk.glass).holder.visible) continue;
    if (pk.type === 'garnish' && !bar.stations.garnish.find((g) => g.type === pk.g).pile.visible) continue;
    if ((pk.type === 'shaker' || pk.type === 'spoon') && S.tier < 2) continue;
    if (pk.type === 'fitem' && !bar.fridge.isOpen) { hover = { type: 'fridge' }; break; }
    if (pk.type === 'tap' && !bar.taps.find((x) => x.id === pk.id).piv.visible) continue;
    if (pk.type === 'customer' && ['enter', 'leave', 'queue', 'standup'].includes(pk.c.state)) continue; // people walking past can't be served: click through them
    hover = pk; break;
  }
  // the rack is seen at an angle: pick the glass closest to the cursor on screen
  if (hover && hover.type === 'rack') {
    const cur = locked ? new THREE.Vector2(0, 0) : mouse;
    let best = null, bd = 1e9;
    for (const g of bar.stations.glasses) {
      if (!g.holder.visible) continue;
      const p = g.holder.getWorldPosition(V3()); p.y += 0.07; p.project(camera);
      const d = Math.hypot(p.x - cur.x, (p.y - cur.y) * 0.5);
      if (d < bd) { bd = d; best = g; }
    }
    if (best) hover = { type: 'rack', glass: best.type };
  }
  // while holding a pourable, the counter/glass are aim targets rather than things to click
  if (held && hover && ['glass', 'shaker', 'bottle', 'rack', 'garnish', 'spoon', 'rag', 'register'].includes(hover.type)) hover = null;
  aimPoint = hitCounter(raycaster.ray);
  if (aimPoint && camera.position.distanceTo(aimPoint) > 1.6) aimPoint = null;
  // aim assist: pointing roughly at a glass or the tin pours right into it
  {
    // check the whole line of sight through each glass, not just where it meets the counter
    const ray = raycaster.ray; let best = null, bd = 0.09;
    for (const v of vessels()) {
      const c = v.group.position;
      for (let k = 0; k <= 6; k++) {
        const y = c.y + (v.rimY + 0.12) * (k / 6);
        if (Math.abs(ray.direction.y) < 1e-4) continue;
        const tt = (y - ray.origin.y) / ray.direction.y; if (tt <= 0) continue;
        const px = ray.origin.x + ray.direction.x * tt, pz = ray.origin.z + ray.direction.z * tt;
        const d = Math.hypot(px - c.x, pz - c.z);
        if (d < bd) { bd = d; best = v; }
      }
    }
    if (best && camera.position.distanceTo(best.group.position) < 1.8) aimPoint = V3(best.group.position.x, bar.matTopY, best.group.position.z);
  }
}
function hitCounter(ray) {
  // ray vs counter top plane (and stations sit on it)
  const t = (bar.matTopY - ray.origin.y) / ray.direction.y;
  if (t <= 0 || t > 2.2) return null;
  const p = ray.origin.clone().addScaledVector(ray.direction, t);
  if (p.x < COUNTER.x0 + 0.02 || p.x > COUNTER.x1 - 0.02 || p.z < COUNTER.z0 + 0.01 || p.z > WORK_Z1 - 0.01) return null;
  return p;
}

function vessels() { const v = []; if (glass) v.push(glass); if (shaker.group.visible && held?.obj !== shaker.group) v.push(shaker); return v; }

function onPrimaryDown() {
  const h = hover;
  // serving takes priority, then collecting from the bar
  if (h && h.type === 'customer') { serve(h.c); return; }
  if (h && h.type === 'cash') { collectCash(h.pile); return; }
  if (h && h.type === 'dirty' && (!held || held.kind === 'item')) { clearDirty(h.d); return; }
  if (h && h.type === 'fridge') { setFridge(!bar.fridge.isOpen); return; }
  if (held) {
    if (held.kind === 'item') {
      if (h && h.type === 'opener' && ITEMS[held.item].open && !held.opened) { held.opened = true; if (held.obj.userData.cap) { const cp = held.obj.userData.cap; held.obj.remove(cp); } sound.clink(1.8); toast('Pop!'); return; }
      if (h && h.type === 'fitem') { putBack(); return onPrimaryDown(); }
      return;
    }
    if (h && h.type === 'sink' && (held.kind === 'shaker' || held.kind === 'scoop')) { dumpHeld(); return; }
    if (held.kind === 'scoop' && h && h.type === 'ice') { fillScoop(); return; }
    if (held.kind === 'garnish') { placeGarnish(); return; }
    if (held.kind === 'bottle' || held.kind === 'scoop' || held.kind === 'shaker') { pourSession = 0; pourSpill = 0; held.dinged = false; return; }
    return; // spoon / rag act while held down in update()
  }
  if (!h) return;
  if (isLocked(h)) { toast('Locked. Buy it at the register.'); sound.thud(0.08); return; }
  switch (h.type) {
    case 'bottle': grab('bottle', bottles[h.id].obj, { id: h.id }); break;
    case 'tap': if (!glass) { toast('Put a pint glass on the mat first'); } tapActive = h.id; break;
    case 'fitem': { if (!bar.fridge.isOpen) { setFridge(true); break; } const m = makeItem(h.id); const it = bar.fridge.items.find((x) => x.id === h.id); it.grp.getWorldPosition(m.position); m.position.y += 0.05; scene.add(m); grab('item', m, { item: h.id }); break; }
    case 'opener': toast('Grab a bottled lager from the fridge, then click here to open it'); break;
    case 'ice': grab('scoop', scoop); fillScoop(); break;
    case 'shaker': if (shaker.totalMl() <= 0 && shaker.iceCount() === 0) { toast('Build the drink in the tin first, then pick it up to shake'); } grab('shaker', shaker.group); break;
    case 'spoon': grab('spoon', bar.stations.spoon.obj); break;
    case 'rag': grab('rag', bar.stations.rag.obj); break;
    case 'garnish': { const m = makeGarnish(h.g); scene.add(m); grab('garnish', m, { g: h.g }); break; }
    case 'rack': newGlass(h.glass); break;
    case 'sink': if (glass) { dumpGlass(); } else toast('Nothing on the mat to dump'); break;
    case 'register': toggleShop(); break;
    case 'glass': toast(glass ? `${GLASSES[glass.type].name} · ${oz(glass.totalMl())} oz` : ''); break;
  }
}
function pourKind(id) {
  const g = INGREDIENTS[id];
  if (g.spot === 'tap' || g.foam) return 'beer';
  if (g.bubbles) return 'soda';
  if (g.dense || g.flow < 0.7) return 'syrup';
  if (g.spot === 'mixer') return 'juice';
  return 'spirit';
}
function onPrimaryUp() { tapActive = null; for (const tp of bar.taps) tp.dinged = false; gradePour(); }
// letting go of a pour is the skill moment: judge it right away
function gradePour() {
  if (!held || held.kind !== 'bottle' || pourSession < 0.1 * OZ) return;
  const r = selectedTicket?.recipe; const want = r?.parts?.[held.id];
  if (!want || !glass) return;
  const v = r.method === 'shake' && !glass.shaken ? shaker : glass;
  const have = (v.contents().get(held.id) || 0) / OZ;
  const diff = have - want, rel = Math.abs(diff) / want;
  const el = $('grade'); let cls, txt;
  if (rel <= 0.06 || Math.abs(diff) <= 0.08) { cls = 'perfect'; txt = 'PERFECT'; sound.perfect(); slowT = 0.3; kick.roll += (Math.random() < 0.5 ? -1 : 1) * 0.01; }
  else if (rel <= D().tol) { cls = 'good'; txt = 'GOOD'; sound.good(); }
  else if (diff < 0) { cls = 'under'; txt = D().showTarget ? `${diff.toFixed(2)} oz` : 'UNDER'; }
  else { const lost = diff * OZ * costPerMl(held.id); NS.waste += diff * OZ; NS.wasteCost += lost; cls = 'over'; txt = (D().showTarget ? `+${diff.toFixed(2)} oz` : 'TOO MUCH') + `  -${fmt(lost)}`; sound.sad(); }
  el.textContent = txt; el.className = cls; void el.offsetWidth; el.classList.add('go');
}
function onSecondaryDown() { dragLooked = false; if (!locked) return; if (!held) return; if (held.kind !== 'shaker') putBack(); }

function grab(kind, obj, extra = {}) {
  if (held) putBack();
  held = { kind, obj, tilt: 0, pos: obj.getWorldPosition(V3()), quat: obj.getWorldQuaternion(new THREE.Quaternion()), ...extra };
  // detach into world space
  scene.attach(obj);
  sound.thud(0.05); kick.pitch -= 0.008;
}
function putBack() {
  if (!held) return;
  const h = held; held = null;
  stream.visible = false; sound.pour(0);
  if (h.kind === 'garnish' || h.kind === 'item') { scene.remove(h.obj); return; }
  // animate home
  let home;
  if (h.kind === 'bottle') { const b = bottles[h.id]; home = { pos: b.home.pos, rotY: b.home.rotY }; }
  else if (h.kind === 'scoop') { home = { pos: bar.stations.ice.scoopHome.pos.clone(), rotY: -0.3 }; emptyScoop(); }
  else if (h.kind === 'shaker') { home = { pos: SHAKER_SPOT.clone().setY(bar.matTopY), rotY: 0 }; shaker.lid.visible = false; }
  else if (h.kind === 'spoon') { home = { pos: bar.stations.spoon.home.pos, rotY: 0, rotZ: 0.12 }; }
  else if (h.kind === 'rag') { home = { pos: bar.stations.rag.home.pos, rotY: 0.2 }; }
  returning.push({ obj: h.obj, from: h.obj.position.clone(), fromQ: h.obj.quaternion.clone(), to: home.pos.clone(), toQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, home.rotY, home.rotZ || 0)), t: 0 });
}
const returning = [];

function newGlass(type) {
  if (glass) { toast('The mat is taken. Serve that drink or dump it in the sink.'); return; }
  glass = new Vessel(type);
  glass.group.position.copy(MAT_SPOT).setY(bar.matTopY);
  glass.group.scale.setScalar(0.01);
  glass.appear = 0;
  scene.add(glass.group);
  pickable(glass.mesh, { type: 'glass' });
  sound.clink(0.8);
}
function removePickable(o) { const i = pickables.indexOf(o); if (i >= 0) pickables.splice(i, 1); }
function dumpGlass() {
  if (!glass) return;
  const g = glass; glass = null; removePickable(g.mesh);
  flying.push({ v: g, from: g.group.position.clone(), to: bar.stations.sink.pos.clone().add(V3(0, 0.03, 0)), t: 0, dur: 0.45, then: () => { scene.remove(g.group); sound.splash(); } });
}
function dumpHeld() {
  if (held.kind === 'shaker') { shaker.empty(); toast('Tin rinsed'); sound.splash(); }
  if (held.kind === 'scoop') { emptyScoop(); sound.clink(0.6); }
}

// scoop
function fillScoop() {
  const set = scoop.userData.iceSet;
  while (set.children.length < 6) {
    const c = new THREE.Mesh(iceGeometry(), MAT.ice); const i = set.children.length;
    c.position.set(-0.035 + (i % 3) * 0.025, 0.03 + Math.floor(i / 3) * 0.02, ((i % 2) - 0.5) * 0.022);
    c.rotation.set(Math.random(), Math.random(), Math.random()); c.renderOrder = 4; set.add(c);
  }
  sound.clink(0.7);
}
function emptyScoop() { const set = scoop.userData.iceSet; while (set.children.length) set.remove(set.children[0]); }

function placeGarnish() {
  const v = targetVessel(aimPoint || held.obj.position, 0.1);
  if (v && v === glass) {
    glass.setGarnish(held.g);
    scene.remove(held.obj); held = null;
    sound.clink(1.3);
  } else { scene.remove(held.obj); held = null; toast('Dropped it. Garnish goes on the glass on the mat.'); }
}
function targetVessel(p, extra = 0) {
  for (const v of vessels()) {
    const c = v.group.position;
    if (Math.hypot(p.x - c.x, p.z - c.z) < v.rimR + extra) return v;
  }
  return null;
}

// ------------------------------------------------------------------ puddles & spills
const puddleGeo = (() => { const g = new THREE.CircleGeometry(1, 28); const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)); const k = 1 + Math.sin(a * 3) * 0.12 + Math.sin(a * 7 + 1) * 0.07; p.setXY(i, p.getX(i) * k, p.getY(i) * k); } g.rotateX(-Math.PI / 2); return g; })();
function addSpill(p, ml, color) {
  if (p.y < COUNTER_Y - 0.1) return; // floor
  // ice well and sink drain away
  const iw = bar.stations.ice.group.position, sk = bar.stations.sink.pos;
  if (Math.abs(p.x - iw.x) < 0.17 && Math.abs(p.z - iw.z) < 0.13) return;
  if (Math.abs(p.x - sk.x) < 0.2 && Math.abs(p.z - sk.z) < 0.15) return;
  let pd = puddles.find((q) => Math.hypot(q.mesh.position.x - p.x, q.mesh.position.z - p.z) < q.r * 0.8 + 0.02);
  if (!pd) {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(puddleGeo, mat);
    mesh.position.set(p.x, COUNTER_Y + 0.0015 + puddles.length * 0.00005, p.z);
    mesh.rotation.y = Math.random() * 6;
    mesh.renderOrder = 2;
    scene.add(mesh);
    pd = { mesh, ml: 0, r: 0, color: new THREE.Color(color) };
    puddles.push(pd);
  }
  pd.color.lerp(new THREE.Color(color), ml / (pd.ml + ml + 0.01));
  pd.ml += ml;
  pd.r = Math.min(0.16, 0.012 + Math.sqrt(pd.ml) * 0.009);
  pd.mesh.scale.setScalar(pd.r);
  pd.mesh.material.color.copy(pd.color).lerp(new THREE.Color(0xffffff), 0.25);
}
function messLevel() { return puddles.reduce((a, p) => a + p.ml, 0); }

// ------------------------------------------------------------------ bar clean-up: empty glasses and cash left on the bar
const dirty = []; // {obj, seat, hit}
const cashPiles = []; // {group, amount, seat, label}
function addDirty(g, seat) {
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.11), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(g.group.position).add(V3(0, 0.08, 0)); scene.add(hit);
  g.group.rotation.set(0, 0, 0); g.group.position.y = TOP_Y;
  const d = { obj: g.group, seat, hit, isItem: g.isItem };
  pickable(hit, { type: 'dirty', d }); dirty.push(d);
}
function clearDirty(d) {
  removePickable(d.hit); scene.remove(d.hit); dirty.splice(dirty.indexOf(d), 1);
  flying.push({ v: { group: d.obj, update() {} }, from: d.obj.position.clone(), to: bar.stations.sink.pos.clone().add(V3(0, 0.03, 0)), t: 0, dur: 0.5, then: () => { scene.remove(d.obj); sound.clink(0.7); } });
}
const billM = new THREE.MeshStandardMaterial({ color: 0x7fae6a, roughness: 0.8 }), coinM = new THREE.MeshStandardMaterial({ color: 0xd9b34a, metalness: 0.9, roughness: 0.3 });
function addCash(amount, seat) {
  const s = SEATS[seat];
  let pile = cashPiles.find((c) => c.seat === seat);
  if (!pile) {
    const g = new THREE.Group(); g.position.set(s.x - 0.12, TOP_Y, COUNTER.z1 - 0.22); scene.add(g);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.003, 0.06), billM); b.position.y = 0.002 + i * 0.003; b.rotation.y = (Math.random() - 0.5) * 0.6; g.add(b); }
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.003, 10), coinM); c.position.set(0.05 + i * 0.012, 0.012 + i * 0.003, 0.03); g.add(c); }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.03; g.add(hit);
    pile = { group: g, amount: 0, seat, hit, label: null };
    pickable(hit, { type: 'cash', pile }); cashPiles.push(pile);
  }
  pile.amount += amount;
  if (pile.label) pile.group.remove(pile.label);
  pile.label = makeLabel(fmt(pile.amount), 0.03, '#8dff9f'); pile.label.position.y = 0.08; pile.group.add(pile.label);
  return pile;
}
// the money hops off the bar into your till by itself: a stream of coins flying to you
const flyers = [];
const flyCoinGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12);
function flyCash(pile, total) {
  const from = pile.group.position.clone().add(V3(0, 0.04, 0));
  const n = Math.min(14, 5 + Math.round(total / 4));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(flyCoinGeo, coinM); m.position.copy(from); scene.add(m);
    flyers.push({ m, from: from.clone().add(V3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.05)), t: -0.35 - i * 0.07, i, last: i === n - 1, pile, spin: 8 + Math.random() * 10 });
  }
}
function updateFlyers(dt) {
  for (let k = flyers.length - 1; k >= 0; k--) {
    const f = flyers[k]; f.t += dt * 1.6;
    if (f.t < 0) continue;
    const to = V3(0.15, -0.28, -0.35).applyQuaternion(camera.quaternion).add(camera.position);
    const e = Math.min(1, f.t);
    f.m.position.lerpVectors(f.from, to, e * e * (3 - 2 * e)); f.m.position.y += Math.sin(e * Math.PI) * 0.35;
    f.m.rotation.x += dt * f.spin; f.m.rotation.z += dt * f.spin * 0.6;
    if (f.t >= 1) {
      scene.remove(f.m); flyers.splice(k, 1); sound.clink(1.5 + f.i * 0.06);
      if (f.last && cashPiles.includes(f.pile)) collectCash(f.pile);
    }
  }
}
function collectCash(pile) {
  S.money += pile.amount; save();
  removePickable(pile.hit); cashPiles.splice(cashPiles.indexOf(pile), 1);
  const lbl = labels.indexOf(pile.label); if (lbl >= 0) labels.splice(lbl, 1);
  scene.remove(pile.group); sound.register(); updateHUD(); drawRegister();
}
let tapActive = null;
function setFridge(open) { bar.fridge.isOpen = open; sound.thud(0.08); }

// ------------------------------------------------------------------ customers
function waiting() { return customers.filter((c) => c.state === 'waiting'); }
const ORDER_TWISTS = true;
function pickItemOrder() {
  const pool = Object.keys(ITEMS).filter((k) => ITEMS[k].tier <= S.tier);
  const id = pool[Math.floor(Math.random() * pool.length)];
  return { id: 'item_' + id, item: id, name: ITEMS[id].name, price: ITEMS[id].price, tier: ITEMS[id].tier, parts: {}, glass: null };
}
// difficulty: how many guests, how hard the drinks, how exact you must pour, how much they tip
const DIFFS = [
  { name: 'EASY', desc: "Quiet night. Easy drinks, normal amounts, and nobody cares if you're a little off.", tol: 0.28, jitter: 0, custom: 0, spawn: 1.6, both: 0.05, pat: 1.6, tip: 0.8, maxParts: 2, showTarget: true, complex: 0 },
  { name: 'NORMAL', desc: "Regular crowd. Every now and then someone wants it their way.", tol: 0.2, jitter: 0.5, custom: 0.35, spawn: 1, both: 0.3, pat: 1, tip: 1, maxParts: 9, showTarget: true, complex: 0.5 },
  { name: 'HARD', desc: "It's getting busy. Most people want custom pours, and you've got to be close.", tol: 0.12, jitter: 0.8, custom: 0.8, spawn: 0.72, both: 0.45, pat: 0.8, tip: 1.4, maxParts: 9, showTarget: true, complex: 1.2 },
  { name: 'EXPERT', desc: "Wall to wall. Every order's custom, and the counter won't tell you when to stop.", tol: 0.07, jitter: 1.0, custom: 1, spawn: 0.55, both: 0.6, pat: 0.65, tip: 1.8, maxParts: 9, showTarget: false, complex: 2 },
];
const D = () => DIFFS[S.diff ?? 1] || DIFFS[1];
const q4 = (v) => Math.max(0.25, Math.round(v * 4) / 4);
// VIPs describe what they want; any recipe that fits counts
const RAIL = (id) => INGREDIENTS[id].spot === 'rail';
function makeVipOrder() {
  const pool = RECIPES.filter((r) => r.tier <= S.tier && Object.keys(r.parts).some(RAIL));
  const R0 = pool[Math.floor(Math.random() * pool.length)];
  const sp = Object.keys(R0.parts).find(RAIL);
  const fits = pool.filter((r) => r.parts[sp] !== undefined && r.glass === R0.glass && r.method === R0.method);
  const how = R0.method === 'shake' ? ', shaken' : R0.method === 'stir' ? ', stirred' : '';
  const line = `Make me something with ${INGREDIENTS[sp].name.toLowerCase()}${how}, in a ${GLASSES[R0.glass].name.toLowerCase()}. Surprise me.`;
  return { ...R0, parts: { ...R0.parts }, price: Math.round(R0.price * 2.5), vip: true, fits: fits.map((r) => r.id), vipLine: line,
    twist: `VIP: ${INGREDIENTS[sp].name.toLowerCase()}${how}, ${GLASSES[R0.glass].name.toLowerCase()}.` + (fits.length > 1 ? ` Any of: ${fits.map((r) => r.name).join(', ')}` : '') };
}
function usualOrder(reg, base) {
  const two = reg.loyalty >= 5 && Math.random() < 0.4;
  return { ...base, parts: { ...base.parts }, usual: true, count: two ? 2 : 1, twist: `Regular ${'♥'.repeat(reg.loyalty)}${'♡'.repeat(5 - reg.loyalty)} · their usual` };
}
function makeOrder() {
  if (S.served >= 3 && Math.random() < 0.25) return pickItemOrder();
  const base = pickRecipe();
  const o = { ...base, parts: { ...base.parts } };
  const spirits = Object.keys(o.parts).filter((k) => ['vodka', 'gin', 'rum', 'whiskey', 'tequila', 'darkrum'].includes(k));
  const roll = (S.diff ?? 1) === 0 ? 1 : Math.random(); // no twists on Easy
  if (roll < 0.16 && spirits.length === 1 && o.parts[spirits[0]] <= 1.5 && ['highball', 'rocks', 'mug'].includes(o.glass)) { o.parts[spirits[0]] *= 2; o.name = 'Double ' + o.name; o.price = Math.round(o.price * 1.5); o.twist = 'Double the ' + INGREDIENTS[spirits[0]].name.toLowerCase(); }
  else if (roll < 0.3 && o.ice) { o.ice = false; o.name += ', no ice'; o.twist = 'No ice!'; }
  else if (roll < 0.4 && !o.garnish && o.glass !== 'pint' && o.glass !== 'mug') { o.garnish = 'lime'; o.name += ' with lime'; o.twist = 'Add a lime wedge'; }
  if ((S.diff ?? 1) > 0 && Math.random() < 0.15) o.count = 2;
  // custom amounts: the guest wants it their way
  if (Math.random() < D().custom) {
    let changed = false;
    for (const k of Object.keys(o.parts)) {
      if (k === 'bitters' || INGREDIENTS[k].spot === 'tap') continue;
      const v = o.parts[k];
      const nv = q4(Math.min(v + 1, Math.max(v * 0.5, v * (1 + (Math.random() * 2 - 1) * 0.45 * D().jitter))));
      if (nv !== v) { o.parts[k] = nv; changed = true; }
    }
    if (changed) { o.custom = true; o.twist = (o.twist ? o.twist + ' · ' : '') + 'Custom amounts'; }
  }
  return o;
}
function pickRecipe() {
  let pool = RECIPES.filter((r) => r.tier <= S.tier && Object.keys(r.parts).length <= D().maxParts);
  if (!pool.length) pool = RECIPES.filter((r) => r.tier <= S.tier);
  const w = pool.map((r) => (1 + r.tier * 0.8 + (r.tier === S.tier ? 1.2 : 0)) * (1 + D().complex * (Object.keys(r.parts).length - 1) * 0.35 + (r.method !== 'build' ? D().complex * 0.4 : 0)));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
  return pool[0];
}
let seedCounter = Math.floor(Math.random() * 1000);
// a line of guests forms by the bar when every stool is taken
const QUEUE = [0, 1, 2, 3, 4, 5, 6].map((i) => V3(2.9 + i * 0.62, 0, 2.3));
function queueList() { return customers.filter((c) => c.state === 'queue'); }
function freeSeats() { return activeSeats().filter((i) => !customers.some((c) => c.seat === i && c.state !== 'leave') && !dirty.some((d) => d.seat === i)); }
function spawnCustomer() {
  const free = freeSeats();
  const queued = !free.length;
  if (queued && queueList().length >= QUEUE.length) return;
  const seat = queued ? null : free[Math.floor(Math.random() * free.length)];
  // one VIP shows up during rush hour from night 2; regulars come back now and then
  let forced = null, reg = null;
  if (S.night >= 2 && NS.rush && !NS.vipSent) { forced = GUEST_TYPES.find((g) => g.id === 'vip'); NS.vipSent = true; }
  else if ((S.regulars || []).length && Math.random() < 0.3) {
    const away = S.regulars.filter((r) => !customers.some((c) => c.reg === r) && RECIPES.some((x) => x.id === r.fav && x.tier <= S.tier));
    if (away.length) { reg = away[Math.floor(Math.random() * away.length)]; forced = GUEST_TYPES.find((g) => g.id === 'regular'); }
  }
  const p = reg ? makeHuman(reg.seed, { avatar: reg.avatar }) : makeHuman(seedCounter++);
  if (reg) p.name = reg.name;
  p.root.position.copy(DOOR);
  scene.add(p.root);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.15; p.root.add(hit);
  const tw = GUEST_TYPES.reduce((a, g) => a + g.w, 0); let x = Math.random() * tw; let gtype = GUEST_TYPES[0];
  for (const g of GUEST_TYPES) { x -= g.w; if (x <= 0) { gtype = g; break; } }
  if (forced) gtype = forced;
  const c = { p, seat, state: 'enter', recipe: null, patience: 1, maxPatience: 1, t: 0, hit, bubble: null, path: [], type: gtype, extraGlasses: [], chatT: 8 + Math.random() * 8, cashAmt: 0 };
  c.reg = reg; c.vip = gtype.id === 'vip';
  pickable(hit, { type: 'customer', c });
  // one at a time through the door
  c.hold = customers.filter((o) => o.hold > 0 || o.p.root.position.distanceTo(DOOR) < 1.2).length * 1.1;
  if (c.hold > 0) p.root.visible = false;
  if (queued) { c.state = 'queue'; c.qT = 0; c.qPat = 60 * D().pat * gtype.pat; c.qWay = [V3(WALK_X, 0, 13.2), V3(WALK_X, 0, 2.3)]; }
  else { const s = SEATS[seat]; c.path = [V3(WALK_X, 0, 13.2), V3(WALK_X, 0, AISLE_Z), V3(s.x, 0, AISLE_Z), V3(s.x, 0, s.z + 0.12)]; }
  p.st.mode = 'walk';
  customers.push(c);
}
function say(c, text, kind = '', dur = 3.2) {
  if (!c.bubble) { c.bubble = document.createElement('div'); c.bubble.className = 'bubble'; $('bubbles').appendChild(c.bubble); }
  c.bubble.textContent = text; c.bubble.className = 'bubble ' + kind; c.bubbleT = dur; c.bubble.hidden = false;
  c.p.say(); c.p.st.talkT = Math.min(2.2, 0.6 + text.length * 0.04);
}
const ORDER_LINES = ['Can I get a {d}?', 'A {d}, please.', "I'll have a {d}.", "{d}. I've had a long day.", 'One {d} when you get a sec.', 'Could you make me a {d}?', "What's good? Eh, just a {d}."];
// personal space: someone walking waits if another guest is right in front of them
function blockedAhead(c, dir) {
  const me = c.p.root.position;
  for (const o of customers) {
    if (o === c || o.hold > 0) continue;
    const op = o.p.root.position; const dx = op.x - me.x, dz = op.z - me.z; const dd = Math.hypot(dx, dz);
    if (dd < 0.3) { if (customers.indexOf(o) < customers.indexOf(c)) return true; continue; }
    const ahead = dx * dir.x + dz * dir.z, side = Math.abs(dx * -dir.z + dz * dir.x);
    if (ahead > 0.05 && ahead < 0.8 && side < 0.42) return true; // someone right in front: wait
  }
  return false;
}
// wait for someone in front, but never forever: after a moment, step around them (stops head-on standoffs)
function shouldWait(c, dir, dt) {
  if (c.passT > 0) { c.passT -= dt; return false; }
  if (!blockedAhead(c, dir)) { c.waitT = 0; return false; }
  c.waitT = (c.waitT || 0) + dt;
  if (c.waitT > 0.9 + (customers.indexOf(c) % 3) * 0.3) { c.waitT = 0; c.passT = 1.4; }
  return true;
}
function updateCustomer(c, dt, t) {
  const p = c.p;
  if (c.hold > 0) { c.hold -= dt; if (c.hold > 0) return; p.root.visible = true; }
  c.t += dt;
  if (c.state === 'queue' && lastCall) { c.state = 'leave'; c.path = [V3(WALK_X, 0, p.root.position.z), V3(WALK_X, 0, 13.2), DOOR.clone()]; p.st.mode = 'walk'; }
  if (c.state === 'queue') {
    const idx = queueList().indexOf(c);
    const spot = c.qWay && c.qWay.length ? c.qWay[0] : QUEUE[idx];
    const d = spot.clone().sub(p.root.position); d.y = 0; const dist = d.length();
    if (c.qWay && c.qWay.length && dist < 0.1) c.qWay.shift();
    if (dist > 0.06) {
      const dirN = d.clone().normalize();
      if (!shouldWait(c, dirN, dt)) { p.root.position.addScaledVector(dirN, Math.min(dist, (p.walkSpeed || 1.1) * dt)); p.st.mode = 'walk'; } else p.st.mode = 'stand';
      p.root.rotation.y += angDiff(Math.atan2(d.x, d.z), p.root.rotation.y) * Math.min(1, dt * 6);
    } else {
      p.st.mode = 'stand';
      p.root.rotation.y += angDiff(Math.atan2(-0.6 - p.root.position.x, -0.5 - p.root.position.z), p.root.rotation.y) * Math.min(1, dt * 3);
      p.st.look.copy(camera.position); p.st.lookW = 0.5;
      c.qT += dt; c.qPat -= dt;
      if (c.qPat < 14 && !c.qWarned) { c.qWarned = true; say(c, ['I\'m about to leave.', 'This line is not moving.', 'Last chance, bartender.'][Math.floor(Math.random() * 3)], 'angry', 2.5); p.setEmotion('angry'); sound.warn(); }
      if (c.qPat <= 0) {
        c.lost = true; NS.lost++; if (streak) bigPop('Combo broken'); streak = 0;
        say(c, 'Forget it. I\'m going somewhere else.', 'angry', 2.5);
        c.state = 'leave'; c.path = [V3(WALK_X, 0, p.root.position.z), V3(WALK_X, 0, 13.2), DOOR.clone()]; p.st.mode = 'walk';
        p.update(dt, t); return;
      }
      if (c.qT > 6 && Math.random() < dt * 0.05 && !(c.bubbleT > 0)) say(c, ['Long line tonight!', 'Come on, come on...', 'Worth the wait.', 'Is there a free seat yet?'][Math.floor(Math.random() * 4)], '', 2.5);
    }
    // front of the line takes the next free stool
    if (idx === 0) { const free = freeSeats(); if (free.length) { c.seat = free[0]; const s = SEATS[c.seat]; c.state = 'enter'; c.path = [V3(p.root.position.x, 0, AISLE_Z), V3(s.x, 0, AISLE_Z), V3(s.x, 0, s.z + 0.12)]; } }
    p.setArmTarget('left', null); p.setArmTarget('right', null);
    p.update(dt, t); return;
  }
  const s = SEATS[c.seat];
  const camPos = camera.position;
  if (c.state === 'enter' || c.state === 'leave') {
    const target = c.path[0];
    if (!target) {
      if (c.state === 'enter') { c.state = 'sitdown'; c.t = 0; p.st.mode = 'sit'; }
      else { removeCustomer(c); }
      return;
    }
    const d = target.clone().sub(p.root.position); d.y = 0;
    const dist = d.length();
    if (dist < 0.08) { c.path.shift(); return; }
    const speed = p.walkSpeed || 1.15;
    const dirN = d.clone().normalize();
    const wait = shouldWait(c, dirN, dt);
    if (!wait) {
      p.root.position.addScaledVector(dirN, Math.min(dist, speed * dt));
      if (c.passT > 0.7) { p.root.position.x += -dirN.z * dt * 0.5; p.root.position.z += dirN.x * dt * 0.5; }
    }
    const yaw = Math.atan2(d.x, d.z);
    p.root.rotation.y += angDiff(yaw, p.root.rotation.y) * Math.min(1, dt * 6);
    p.st.look.copy(p.root.position).add(V3(Math.sin(yaw) * 3, 1.5, Math.cos(yaw) * 3)); p.st.lookW = 0.4;
    p.st.mode = wait ? 'stand' : 'walk';
  } else if (c.state === 'sitdown') {
    p.st.mode = 'sit';
    p.root.position.lerp(V3(s.x, 0, s.z + 0.02), Math.min(1, dt * 4));
    p.root.rotation.y += angDiff(Math.PI, p.root.rotation.y) * Math.min(1, dt * 5);
    if (c.t > 1.1) {
      c.state = 'waiting'; c.t = 0;
      const usual = c.reg && RECIPES.find((x) => x.id === c.reg.fav && x.tier <= S.tier);
      c.recipe = c.vip ? makeVipOrder() : usual ? usualOrder(c.reg, usual) : makeOrder();
      c.remaining = c.recipe.count || 1;
      const parts = Object.keys(c.recipe.parts).length;
      c.maxPatience = (c.recipe.item ? 70 : (85 + parts * 12 + (c.recipe.method !== 'build' ? 20 : 0))) * (has('peanuts') ? 1.35 : 1) * (has('lights') ? 1.15 : 1) * c.type.pat * (c.remaining > 1 ? 1.4 : 1) * D().pat;
      c.patience = c.maxPatience;
      const what = c.remaining > 1 ? `two ${c.recipe.name}s` : c.recipe.name;
      const hello = c.type.hello ? c.type.hello[Math.floor(Math.random() * c.type.hello.length)] + ' ' : '';
      const how = c.recipe.custom ? ' Make it ' + Object.entries(c.recipe.parts).map(([k, v]) => `${v} oz ${INGREDIENTS[k].name.toLowerCase()}`).join(', ') + '.' : '';
      say(c, hello + ORDER_LINES[Math.floor(Math.random() * ORDER_LINES.length)].replace('{d}', what).replace('a two', 'two').replace('A two', 'Two').replace('One two', 'Two') + how, '', c.recipe.custom ? 8 : 5);
      if (c.recipe.vipLine) { say(c, hello + c.recipe.vipLine, '', 8); bigPop('VIP AT THE BAR'); sound.cheer(); }
      else if (c.recipe.usual) say(c, hello + (c.recipe.count > 1 ? 'The usual. And one for my friend here.' : 'The usual, please.'), 'happy', 5);
      if (!selectedTicket || selectedTicket.state !== 'waiting') selectedTicket = c;
      sound.clink(1.6);
      renderTickets(true);
    }
  } else if (c.state === 'waiting') {
    c.patience -= dt;
    const f = c.patience / c.maxPatience;
    p.setEmotion(f < 0.3 ? 'angry' : 'neutral');
    if (f < 0.3 && !c.warned) { c.warned = true; say(c, ['Hello? Still thirsty here.', 'Any time now...', 'Is my drink coming?'][Math.floor(Math.random() * 3)], 'angry'); }
    if (c.patience <= 0) {
      say(c, 'Forget it. I\'m out.', 'angry'); sound.sad();
      c.lost = true; NS.lost++; streak = 0;
      startLeave(c);
    }
  }
  if ((c.state === 'drinking' && !c.sipping) || (c.state === 'waiting' && c.patience / c.maxPatience > 0.45)) {
    c.chatT -= dt;
    if (c.chatT < 0 && !(c.bubbleT > 0)) { c.chatT = 10 + Math.random() * 10; say(c, Math.random() < 0.25 ? ['I love this song!', 'This DJ is amazing!', 'Turn it up!', 'Who wants to dance?'][Math.floor(Math.random() * 4)] : CHATTER[Math.floor(Math.random() * CHATTER.length)], '', 3); }
  }
  if (c.state === 'drinking') {
    if (p.isModel) p.st.mode = 'drink';
    // reaction, then sip a few times
    c.sipT -= dt;
    if (c.sipT < 0) { c.sipping = !c.sipping; c.sipT = c.sipping ? 1.8 : 2.4 + Math.random() * 2; if (!c.sipping) c.sips++; }
    if (c.sips >= 3 && !c.sipping) { startLeave(c); }
  } else if (c.state === 'standup') {
    if (c.t > 0.8) { c.state = 'leave'; c.path = [V3(s.x, 0, AISLE_Z), V3(WALK_X, 0, AISLE_Z), V3(WALK_X, 0, 13.2), DOOR.clone()]; }
  }

  // look at the bartender when ordering / waiting / reacting
  const engaged = c.state === 'waiting' || c.state === 'sitdown' || c.state === 'reacting' || (c.state === 'drinking' && !c.sipping);
  if (engaged) {
    p.st.look.lerp(camPos, Math.min(1, dt * 4));
    const dist = camPos.distanceTo(p.root.position);
    p.st.lookW += ((dist < 3.2 ? 1 : 0.5) - p.st.lookW) * Math.min(1, dt * 2);
  }

  // arms
  const seated = p.st.mode === 'sit' && c.state !== 'leave';
  const yaw = p.root.rotation.y;
  if (seated && c.state !== 'sitdown') {
    const fwd = V3(Math.sin(yaw), 0, Math.cos(yaw)); const right = V3(-Math.cos(yaw), 0, Math.sin(yaw));
    const base = V3(p.root.position.x, TOP_Y + 0.02, COUNTER.z1 - 0.06);
    const restL = base.clone().addScaledVector(right, -0.16).addScaledVector(fwd, -0.02);
    const restR = base.clone().addScaledVector(right, 0.14);
    p.setArmTarget('left', { pos: restL, quat: handQuat(yaw, 'rest', 'left'), pose: c.p.st.emotion === 'angry' ? POSES.flat : POSES.relaxed });
    if (c.glass && c.state === 'drinking') {
      const g = c.glass.group;
      const restG = c.glassRest;
      let target = restG.clone();
      let tiltG = 0;
      if (c.sipping && !p.isModel) {
        const head = p.head.getWorldPosition(V3());
        target = head.clone().addScaledVector(fwd, 0.13).add(V3(0, -0.06 - c.glass.rimY, 0));
        tiltG = 0.9;
      }
      c.gLift = c.gLift || 0; c.gLift += ((c.sipping ? 1 : 0) - c.gLift) * Math.min(1, dt * 3);
      g.position.lerpVectors(restG, target, smooth(0, 1, c.gLift));
      g.rotation.set(0, 0, 0);
      g.rotateOnWorldAxis(right.clone(), tiltG * smooth(0.5, 1, c.gLift));
      const gq = g.quaternion.clone();
      const rq = handQuat(yaw, 'hold', 'right').premultiply(gq);
      const wrist = g.position.clone().add(V3(0.005, c.glass.rimY * 0.42, 0).applyQuaternion(gq)).addScaledVector(right.clone().applyQuaternion(gq), 0.012 + c.glass.rimR + 0.012).addScaledVector(fwd.clone().applyQuaternion(gq), -0.05);
      p.setArmTarget('right', { pos: wrist, quat: rq, pose: POSES.cupGlass });
    } else p.setArmTarget('right', { pos: restR, quat: handQuat(yaw, 'rest', 'right'), pose: POSES.relaxed });
  } else { p.setArmTarget('left', null); p.setArmTarget('right', null); }

  p.update(dt, t);
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function startLeave(c) {
  c.state = 'standup'; c.t = 0; c.p.st.mode = 'stand';
  // put any glass in their hand back down on the bar before they go
  if (c.glass && c.glassRest) { c.glass.group.position.copy(c.glassRest); c.glass.group.rotation.set(0, 0, 0); }
  for (const g of [c.glass, ...c.extraGlasses]) if (g) addDirty(g, c.seat);
  c.glass = null; c.extraGlasses = [];
  if (selectedTicket === c) selectedTicket = null;
  renderTickets(true);
}
function removeCustomer(c) {
  scene.remove(c.p.root); removePickable(c.hit);
  if (c.bubble) c.bubble.remove();
  customers.splice(customers.indexOf(c), 1);
}

function serve(c) {
  if (c.state !== 'waiting') { toast(c.state === 'drinking' ? 'They already have a drink' : 'Let them sit down and order first'); return; }
  const s = SEATS[c.seat];
  const rest = V3(s.x + 0.13 - (c.remaining > 1 ? 0 : (c.recipe.count > 1 ? 0.1 : 0)), TOP_Y, COUNTER.z1 - 0.2);
  if (held && held.kind === 'item') {
    if (!c.recipe.item) { toast(`${c.p.name} ordered a ${c.recipe.name}, not a ${ITEMS[held.item].name}`); return; }
    const h = held; held = null;
    const fake = { group: h.obj, rimY: h.obj.userData.height || 0.13, rimR: 0.033, itemId: h.item, opened: !!h.opened, update() {}, isItem: true };
    c.state = 'served'; sound.thud(0.1);
    flying.push({ v: fake, from: h.obj.position.clone(), to: rest, t: 0, dur: 0.6, then: () => reactTo(c, fake, rest) });
    return;
  }
  if (c.recipe.item) { toast(`${c.p.name} wants a ${c.recipe.name} from the fridge`); return; }
  if (!glass || glass.totalMl() < 8) { toast('Make the drink on the mat first, then click the guest to serve'); return; }
  if (held && held.kind !== 'garnish') putBack();
  const g = glass; glass = null; removePickable(g.mesh);
  c.state = 'served';
  sound.thud(0.1);
  flying.push({ v: g, from: g.group.position.clone(), to: rest, t: 0, dur: 0.75, then: () => reactTo(c, g, rest) });
}
function reactTo(c, g, rest) {
  let score, notes;
  if (g.isItem) {
    const it = ITEMS[c.recipe.item];
    if (g.itemId !== c.recipe.item) { score = 15; notes = [`I asked for a ${it.name}.`]; }
    else if (it.open && !g.opened) { score = 55; notes = ["It's still capped. Got an opener?"]; }
    else { score = 100; notes = []; }
  } else if (c.recipe.vip) {
    // judge against whichever fitting recipe they made best
    let best = { score: -1, notes: [] };
    for (const id of c.recipe.fits) { const r = RECIPES.find((x) => x.id === id); const e = evaluate(g, r, D().tol); if (e.score > best.score) best = e; }
    ({ score, notes } = best);
  } else ({ score, notes } = evaluate(g, c.recipe, D().tol));
  if (c.type.picky && score < 85) { notes.unshift('Not up to my standards.'); score = Math.min(score, 60); }
  // first of a round: keep it on the bar and wait for the second
  if (c.remaining > 1 && score >= 40) {
    c.remaining--; c.extraGlasses.push(g);
    g.group.position.copy(rest).add(V3(-0.12, 0, 0));
    c.cashAmt += c.recipe.price * (0.55 + 0.45 * score / 100);
    say(c, score >= 90 ? 'Perfect! And the second one?' : 'Thanks! One more, please.', 'happy', 3.5);
    c.state = 'waiting'; c.patience = Math.max(c.patience, c.maxPatience * 0.6);
    sound.clink(1.2); renderTickets(true); return;
  }
  c.glass = g; c.glassRest = rest;
  const patienceF = clamp(c.patience / c.maxPatience, 0, 1);
  const mess = messLevel() > 45;
  let pay = 0, tip = 0;
  if (score >= 40) {
 pay = c.recipe.price * (0.3 + 0.7 * Math.pow(score / 100, 1.6));
    if (patienceF > 0.7) pay *= 1.15; // served fast
    tip = c.recipe.price * (0.04 + 0.32 * Math.pow(score / 100, 2)) * (0.55 + 0.45 * patienceF);
    tip *= c.type.tip * D().tip; pay *= 0.85 + 0.15 * D().tip; if (c.type.picky) tip *= score >= 90 ? 1.8 : 0.3;
    if (NS.rush) tip *= 1.4;
    if (has('tipjar')) tip *= 1.2; if (has('jukebox')) tip *= 1.1; if (has('neon')) tip *= 1.1; if (has('sofas')) tip *= 1.1; if (has('ledwall')) tip *= 1.15; if (mess) tip *= 0.5;
  }
  let newRegular = false;
  if (c.reg) {
    c.reg.visits++; c.reg.loyalty = clamp(c.reg.loyalty + (score >= 85 ? 1 : score < 65 ? -1 : 0), 0, 5);
    tip *= 1 + 0.15 * c.reg.loyalty;
  } else if (!c.vip && !g.isItem && score >= 85 && (S.regulars || []).length < 6 && Math.random() < 0.35) {
    S.regulars = S.regulars || [];
    S.regulars.push({ seed: c.p.seed, avatar: c.p.avatar, name: c.p.name, fav: c.recipe.id, visits: 1, loyalty: 1 });
    newRegular = true;
  }
  const before = comboMult(streak);
  if (score >= 90) { streak++; NS.perfect++; } else if (score < 75) streak = 0;
  NS.best = Math.max(NS.best, streak);
  const mult = comboMult(streak);
  pay *= mult; tip *= mult;
  if (c.recipe.method === 'shake' && score >= 40) NS.shaken++;
  const total = Math.round((pay + tip + c.cashAmt) * 100) / 100;
  kick.pitch += 0.012;
  S.served++; S.scoreSum += score; save();
  if (total > 0) flyCash(addCash(total, c.seat), total);
  NS.served++; NS.earned += total; NS.tips += tip; NS.scores += score;
  if (score >= 90) { const h = c.p.head.getWorldPosition(V3()).add(V3(0, 0.3, 0)); confetti(h); sound.cheer(); bigPop(mult > before ? `COMBO x${mult}!` : streak > 1 ? `PERFECT · ${streak} in a row` : 'PERFECT!'); }
  else if (score < 75 && before > 1) bigPop('Combo broken');
  const stars = '★'.repeat(Math.round(score / 20)) + '☆'.repeat(5 - Math.round(score / 20));
  let line, kind;
  if (score >= 90) { line = ['Perfect. Exactly right.', 'Now that is a drink.', 'Oh, that\'s lovely.', 'You know what you\'re doing.'][Math.floor(Math.random() * 4)]; kind = 'happy'; c.p.setEmotion('happy'); }
  else if (score >= 65) { line = notes[0] ? 'Not bad. ' + notes[0] : 'Pretty good, thanks.'; kind = 'happy'; c.p.setEmotion('happy'); }
  else if (score >= 40) { line = notes[0] || 'It\'s... drinkable.'; kind = ''; c.p.setEmotion('neutral'); }
  else { line = (notes[0] || 'This is wrong.') + " I'm not paying for that."; kind = 'angry'; c.p.setEmotion('angry'); }
  if (mess && score >= 40) line += ' Wipe the bar, would you?';
  if (newRegular) { line += " I'm coming back here."; toast(`${c.p.name} is a regular now`); }
  if (c.reg && score >= 85) line = ['You remembered!', 'Just how I like it.', 'This is why I keep coming back.'][Math.floor(Math.random() * 3)];
  if (c.vip) { if (score >= 85) { line = 'Now THAT is a drink. Keep the change.'; bigPop('VIP LOVED IT'); } else if (score < 60) line = 'I expected better. ' + (notes[0] || ''); }
  say(c, line, kind, 4.5);
  popup(c, total > 0 ? `+${fmt(total)}  ${stars}` : stars, total <= 0);
  if (total <= 0) sound.sad();
  c.state = score >= 40 ? 'drinking' : 'reacting';
  c.sipT = 1.8; c.sipping = false; c.sips = 0;
  if (score < 40) setTimeout(() => startLeave(c), 2600);
  if (selectedTicket === c) selectedTicket = null;
  renderTickets(true); updateHUD(); drawRegister();
}

// ------------------------------------------------------------------ HUD
let toastT = 0;
function toast(msg) { if (!msg) return; const el = $('toast'); el.textContent = msg; el.style.fontSize = msg.length > 40 ? '20px' : '30px'; el.classList.add('show'); toastT = 2.2; }
function popup(c, text, bad) {
  const el = document.createElement('div'); el.className = 'popup' + (bad ? ' bad' : ''); el.textContent = text; $('bubbles').appendChild(el);
  const start = performance.now();
  const anchor = () => c.p.head.getWorldPosition(V3()).add(V3(0, 0.45, 0));
  const tick = () => {
    const k = (performance.now() - start) / 2200;
    if (k > 1) { el.remove(); return; }
    const sp = anchor().add(V3(0, k * 0.25, 0)).project(camera);
    el.style.left = ((sp.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - sp.y) / 2 * window.innerHeight) + 'px';
    el.style.opacity = String(1 - Math.max(0, k - 0.7) / 0.3);
    el.hidden = sp.z > 1;
    requestAnimationFrame(tick);
  };
  tick();
}
function bigPop(text) { const el = $('bigpop'); el.textContent = text; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
function updateHUD() {
  const m = Math.max(0, nightT); const mm = Math.floor(m / 60), ss = Math.floor(m % 60);
  $('clock').textContent = lastCall ? 'Last call' : (NS.rush ? 'RUSH ' : '') + `${mm}:${String(ss).padStart(2, '0')}`;
  $('nightNo').textContent = S.night;
  const goal = nightGoal(); $('goalTxt').textContent = `${fmt(NS.earned)} / ${fmt(goal)}`;
  $('goalBar').style.width = Math.min(100, NS.earned / goal * 100) + '%';
  $('streak').hidden = streak < 2; $('streak').textContent = `Combo ${streak} · pay x${comboMult(streak)}`;
  const gh = NS.goals.map((g) => { const v = g.val(); const ok = v >= g.need; const fail = v < 0;
    if (ok && !NS.goalsHit.has(g.id) && g.id !== 'avg') { NS.goalsHit.add(g.id); if (running) { bigPop('★ ' + g.txt); sound.cheer(); } }
    const prog = g.id === 'nolost' ? (fail ? 'failed' : 'so far') : g.id === 'avg' ? (NS.served ? Math.round(NS.scores / NS.served) : '—') : g.id === 'earn' || g.id === 'tips' ? '' : `${Math.max(0, Math.min(v, g.need))}/${g.need}`;
    return `<div class="${ok ? 'ok' : fail ? 'fail' : ''}"><b>${ok ? '★' : '☆'}</b> ${g.txt}${prog ? ' <i>' + prog + '</i>' : ''}</div>`; }).join('');
  if (gh !== updateHUD.gh) { updateHUD.gh = gh; $('goals').innerHTML = gh; }
  $('money').textContent = fmt(S.money);
  $('served').textContent = S.served;
  $('rating').textContent = S.served ? (S.scoreSum / S.served / 20).toFixed(1) + ' ★' : '—';
  $('mess').hidden = messLevel() <= 45;
}

// ------------------------------------------------------------------ step-by-step guide
const WHERE = { rail: 'on the rail right in front of you', mixer: 'on the counter to your left', shelf: 'on the back shelf behind you' };
const heldName = () => !held ? '' : held.kind === 'bottle' ? INGREDIENTS[held.id].name : held.kind === 'scoop' ? 'ice scoop' : held.kind === 'shaker' ? 'shaker' : held.kind === 'spoon' ? 'bar spoon' : held.kind === 'rag' ? 'towel' : GARNISHES[held.g].name.toLowerCase();
// one rule for "enough": LET GO, the ding and the guide all agree (target t in the same unit as the amount)
const pourDoneAt = (t, unit = OZ) => t - Math.min(0.1 * unit, 0.06 * t);
function guideFor(c) {
  if (c && c.recipe.item) {
    const it = ITEMS[c.recipe.item];
    if (held && held.kind === 'item' && held.item === c.recipe.item) {
      if (it.open && !held.opened) return { text: 'Click the <b>bottle opener</b> on the bar to pop the cap', target: { type: 'opener' } };
      return { text: `Click <b>${c.p.name}</b> to hand over the ${it.name}`, target: { type: 'customer', c } };
    }
    if (held) return { text: `Press <b>Q</b> to put down the ${heldName()} first`, target: null };
    if (!bar.fridge.isOpen) return { text: 'Turn left and click the <b>fridge</b> at the end of the bar', target: { type: 'fridge' } };
    return { text: `Grab a <b>${it.name}</b> from the fridge`, target: { type: 'fitem', id: c.recipe.item } };
  }
  if (!c && (cashPiles.length || dirty.length) && !held) {
    if (cashPiles.length) return { text: `Collect the <b>${fmt(cashPiles[0].amount)}</b> left on the bar`, target: { type: 'cash', pile: cashPiles[0] } };
    return { text: 'Clear the <b>empty glass</b> off the bar so someone can sit there', target: { type: 'dirty', d: dirty[0] } };
  }
  if (!c && lastCall) return { text: 'Last call! The night ends when the last guests leave', target: null };
  if (!c) return { text: customers.length ? 'A guest is coming to the bar. Get ready!' : 'Waiting for the first guest to walk in…', target: null };
  const r = c.recipe, v = glass;
  const want = (kind, extra) => !held || (held.kind === kind && (!extra || Object.keys(extra).every((k) => held[k] === extra[k])));
  const putDown = () => ({ text: `Press <b>Q</b> to put down the ${heldName()} first`, target: null });
  // 1. right glass on the mat
  if (v && v.type !== r.glass) return held ? putDown() : { text: `That's the wrong glass for a ${r.name}. Click the <b>sink</b> to dump it`, target: { type: 'sink' } };
  if (!v) return held ? putDown() : { text: `Click the <b>${GLASSES[r.glass].name}</b> on the glass rack (to your right)`, target: { type: 'rack', glass: r.glass } };
  // shaken drinks: keep straining until the tin is (nearly) empty, even after the first drops hit the glass
  if (r.method === 'shake' && shaker.shaken && shaker.totalMl() > 6) {
    if (!want('shaker')) return putDown();
    if (!held) return { text: 'Click the <b>shaker tin</b> to pick it up', target: { type: 'shaker' } };
    return { text: `Look at the glass and <b>hold click</b> to pour the shaken drink in (${oz(shaker.totalMl())} oz left in the tin)`, target: { type: 'glass' }, pouring: true };
  }
  const vessel = r.method === 'shake' && !v.shaken ? shaker : v;
  const into = vessel === shaker ? 'the shaker tin' : 'the glass';
  const tgtVessel = vessel === shaker ? { type: 'shaker' } : { type: 'glass' };
  // 2. ice
  const needIce = (vessel === shaker) || r.ice;
  if (needIce && vessel.iceCount() < 3) {
    if (!want('scoop')) return putDown();
    if (!held) return { text: 'Click the <b>ice bin</b> to grab the ice scoop', target: { type: 'ice' } };
    if (!scoop.userData.iceSet.children.length) return { text: 'Scoop is empty. Click the <b>ice bin</b> to refill', target: { type: 'ice' } };
    return { text: `Look at ${into} and <b>hold click</b> to tip ice in (${vessel.iceCount()}/3)`, target: tgtVessel };
  }
  // 3. pour each part
  const cont = vessel.contents();
  for (const k in r.parts) {
    const t = r.parts[k] * OZ, a = cont.get(k) || 0;
    const stillPouring = held && held.kind === 'bottle' && held.id === k && held.tilt > 0.3;
    if (a < pourDoneAt(t) || (stillPouring && a < t * 1.6)) {
      if (INGREDIENTS[k].spot === 'tap') {
        if (held) return putDown();
        return { text: `<b>Hold click</b> on the <b>${INGREDIENTS[k].name}</b> tap: <span class="meter${(t - a) / OZ < 1.5 ? ' close' : ''}">${(a / OZ).toFixed(1)} / ${r.parts[k]} oz</span>`, target: { type: 'tap', id: k } };
      }
      if (!want('bottle', { id: k })) return putDown();
      if (!held) return { text: `Grab the <b>${INGREDIENTS[k].name}</b> ${WHERE[INGREDIENTS[k].spot === 'mixer' && ['grenadine', 'lime', 'syrup', 'bitters'].includes(k) ? 'rail' : INGREDIENTS[k].spot]}`, target: { type: 'bottle', id: k } };
      const done = a >= pourDoneAt(t), close = a >= pourDoneAt(t) - 0.3 * OZ, over = a > t * 1.2;
      return { text: `Look at ${into} and <b>hold click</b> to pour ${INGREDIENTS[k].name}: <span class="meter${close ? ' close' : ''}">${(a / OZ).toFixed(2)} / ${r.parts[k]} oz</span>${over ? ' <b class="letgo">TOO MUCH!</b>' : done ? ' <b class="letgo">LET GO!</b>' : ''}`, target: tgtVessel, pouring: true };
    }
  }
  // 4. method
  if (vessel === shaker) {
    if (shaker.shake < 1) {
      if (!want('shaker')) return putDown();
      if (!held) return { text: 'Click the <b>shaker tin</b> to pick it up', target: { type: 'shaker' } };
      return { text: `Hold <b>F</b> (or right click) to shake: ${Math.round(shaker.shake * 100)}%`, target: null };
    }
    if (!want('shaker')) return putDown();
    if (!held) return { text: 'Click the <b>shaker tin</b> to pick it up', target: { type: 'shaker' } };
    return { text: 'Look at the glass and <b>hold click</b> to pour the shaken drink in', target: { type: 'glass' }, pouring: true };
  }
  if (r.method === 'stir' && v.stir < 1) {
    if (!want('spoon')) return putDown();
    if (!held) return { text: 'Click the <b>bar spoon</b> (in the tin on your left)', target: { type: 'spoon' } };
    return { text: `Look at the glass and <b>hold click</b> to stir: ${Math.round(v.stir * 100)}%`, target: { type: 'glass' } };
  }
  // 5. garnish
  if (r.garnish && v.garnish !== r.garnish) {
    if (!want('garnish', { g: r.garnish })) return putDown();
    if (!held) return { text: `Click the <b>${GARNISHES[r.garnish].name}</b> in the garnish tray`, target: { type: 'garnish', g: r.garnish } };
    return { text: 'Look at the glass and <b>click</b> to drop it on', target: { type: 'glass' } };
  }
  // 6. serve
  return { text: `Drink's ready! Click <b>${c.p.name}</b> to serve it${c.remaining > 1 ? ' (1 of 2)' : c.recipe.count > 1 ? ' (2 of 2)' : ''}`, target: { type: 'customer', c } };
}
function nextStep(r, v) { void r; void v; const g = guideFor(selectedTicket); return g.text.replace(/<[^>]+>/g, ''); }

// 3D arrow pointing at the thing to use
const marker = new THREE.Group();
{
  const mm = new THREE.MeshBasicMaterial({ color: 0xffb02e, toneMapped: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 4), mm); cone.rotation.x = Math.PI; marker.add(cone);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.012), mm); stem.position.y = 0.045; marker.add(stem);
  marker.renderOrder = 20; marker.traverse((o) => { if (o.material) { o.material.depthTest = false; } o.renderOrder = 20; });
  marker.visible = false; scene.add(marker);
}
function targetPos(t) {
  const w = (o, dy) => o.getWorldPosition(V3()).add(V3(0, dy, 0));
  switch (t.type) {
    case 'rack': return w(bar.stations.glasses.find((g) => g.type === t.glass).holder, 0.26);
    case 'ice': return w(bar.stations.ice.group, 0.16);
    case 'bottle': return held?.id === t.id ? null : w(bottles[t.id].obj, bottles[t.id].obj.userData.height + 0.13);
    case 'shaker': return held?.kind === 'shaker' ? null : w(shaker.group, 0.3);
    case 'spoon': return held?.kind === 'spoon' ? null : w(bar.stations.spoon.obj, 0.36);
    case 'garnish': return w(bar.stations.garnish.find((g) => g.type === t.g).pile, 0.14);
    case 'glass': return glass && !(held && held.tilt > 0.2) ? w(glass.group, glass.rimY + 0.1) : null;
    case 'sink': return w(bar.stations.sink.hit, 0.2);
    case 'tap': return w(bar.taps.find((x) => x.id === t.id).piv, 0.28);
    case 'fridge': return w(bar.fridge.group, 2.15);
    case 'fitem': return bar.fridge.isOpen ? w(bar.fridge.items.find((x) => x.id === t.id).grp, 0.4) : null;
    case 'opener': return w(bar.opener.group, 0.14);
    case 'cash': return w(t.pile.group, 0.16);
    case 'dirty': return t.d.obj.getWorldPosition(V3()).add(V3(0, 0.3, 0));
    case 'customer': return t.c.p.head.getWorldPosition(V3()).add(V3(0, 0.38, 0));
  }
  return null;
}
let guideHtml = '';
function updateGuide(t) {
  const c = selectedTicket && selectedTicket.state === 'waiting' ? selectedTicket : null;
  const g = guideFor(c);
  let who = '';
  if (c) {
    const r = c.recipe; const others = waiting().length - 1;
    const parts = r.item ? 'from the fridge' : [...Object.entries(r.parts).map(([k, v]) => `${v} oz ${INGREDIENTS[k].name}`), GLASSES[r.glass].name.toLowerCase(), r.ice ? 'ice' : 'no ice', r.method === 'build' ? null : r.method === 'shake' ? 'shaken' : 'stirred', r.garnish ? GARNISHES[r.garnish].name.toLowerCase() : null].filter(Boolean).join(' · ');
    who = `<div class="who"><b>${c.p.name}</b>${c.type.label ? `<em class="gt">${c.type.label}</em>` : ''} wants <span class="drink">${r.count > 1 ? (c.remaining > 1 ? '2× ' : '1 more ') : ''}${r.name}</span>${others > 0 ? `<span class="more">+${others} waiting · keys 1-${Math.min(4, others + 1)}</span>` : ''}</div>`
      + `<div class="recipe-line">${parts}${r.twist ? ` · <b class="tw">${r.twist}</b>` : ''}</div><i class="pb"><b id="pbFill"></b></i>`;
  }
  const html = who + `<div class="stepl"><span class="tag">Next</span>${g.text}</div>`;
  if (html !== guideHtml) { guideHtml = html; $('next').innerHTML = html; }
  if (c) { const f = clamp(c.patience / c.maxPatience, 0, 1); const el = $('pbFill'); if (el) { el.style.width = (f * 100) + '%'; el.style.background = f < 0.3 ? '#ff6a5c' : f < 0.6 ? '#f2a541' : '#6fe3b3'; } }
  const p = g.target ? targetPos(g.target) : null;
  marker.visible = !!p;
  const ea = $('edgeArrow');
  if (p && running) {
    const v = p.clone().applyMatrix4(camera.matrixWorldInverse);
    const halfH = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    const ang = Math.atan2(v.x, -v.z);
    const vAng = Math.atan2(v.y, -v.z);
    const ndc = p.clone().project(camera);
    const off = v.z > 0 || Math.abs(ndc.x) > 0.97 || Math.abs(ndc.y) > 0.97;
    ea.hidden = !off;
    if (off) {
      const side = Math.abs(ang) > 2.6 ? 'behind' : Math.abs(ang) > halfH * 0.92 ? (ang > 0 ? 'right' : 'left') : (vAng > 0 ? 'up' : 'down');
      ea.className = 'edge ' + side;
      const lab = { right: 'Turn right', left: 'Turn left', up: 'Look up', down: 'Look down', behind: 'Turn around' }[side];
      const how = freeCursor && !locked ? ' (right-click + drag)' : '';
      const txt = `${side === 'left' ? '◀ ' : ''}${lab}${side === 'right' || side === 'behind' ? ' ▶' : ''}${how}`;
      if (ea.textContent !== txt) ea.textContent = txt;
    }
  } else ea.hidden = true;
  if (p) { marker.position.copy(p).add(V3(0, Math.sin(t * 5) * 0.015, 0)); marker.rotation.y = t * 2; }
}

let ticketSig = '';
function renderTickets(force) {
  const w = waiting();
  if (!selectedTicket || !w.includes(selectedTicket)) selectedTicket = w[0] || null;
  const sig = w.map((c) => c.seed).join(',') + '|' + (selectedTicket ? customers.indexOf(selectedTicket) : -1);
  const box = $('tickets');
  if (force || sig !== ticketSig) {
    ticketSig = sig;
    box.innerHTML = '';
    w.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'ticket' + (c === selectedTicket ? ' active' : ' compact');
      d.innerHTML = `<div class="t-head"><span>#${i + 1} · ${c.p.name}${c.type.label ? ` <em class="badge">${c.type.label}</em>` : ''}</span><span>${fmt(c.recipe.price)}</span></div><div class="t-drink">${c.recipe.count > 1 ? `${c.remaining > 1 ? '2×' : '1 more ×'} ` : ''}${c.recipe.name}</div>${c.recipe.twist ? `<div class="twist">${c.recipe.twist}</div>` : ''}${c.recipe.item ? '<div class="twist">From the fridge</div>' : ''}<div class="t-lines"></div><div class="t-meta"></div><div class="bar"><i></i></div>`;
      c.ticketEl = d;
      box.appendChild(d);
    });
  }
  for (const c of w) {
    const d = c.ticketEl; if (!d) continue;
    const f = clamp(c.patience / c.maxPatience, 0, 1);
    const bar_ = d.querySelector('.bar i'); bar_.style.width = (f * 100) + '%'; bar_.style.background = f < 0.3 ? '#b3261e' : f < 0.6 ? '#c98a16' : '#2e8b57';
    if (c === selectedTicket) {
      const r = c.recipe;
      const src = r.method === 'shake' && glass && !glass.shaken ? shaker : glass;
      const cont = src ? src.contents() : new Map();
      const lines = Object.entries(r.parts).map(([k, ozT]) => {
        const a = (cont.get(k) || 0) / OZ; const ok = Math.abs(a - ozT) <= Math.max(ozT * 0.2, 0.17); const over = a > ozT * 1.2 + 0.17;
        return `<div class="${ok ? 'ok' : over ? 'over' : ''}">${ok ? '✓' : '·'} ${ozT} oz ${INGREDIENTS[k].name}${a > 0.01 ? ` <small>(${a.toFixed(2)})</small>` : ''}</div>`;
      });
      const step = nextStep(r, glass);
      const meta = r.item ? 'Grab it from the fridge at the far left end of the bar' : [GLASSES[r.glass].name, r.ice ? 'over ice' : 'no ice', r.method === 'build' ? 'built' : r.method === 'shake' ? 'shaken' : 'stirred', r.garnish ? GARNISHES[r.garnish].name.toLowerCase() : null].filter(Boolean).join(' · ');
      const html = lines.join('') + `<div style="margin-top:4px"><b>Next:</b> ${step || `Click ${c.p.name} to serve`}</div>`;
      const ln = d.querySelector('.t-lines'); if (ln.innerHTML !== html) ln.innerHTML = html;
      const mt = d.querySelector('.t-meta'); const mh = meta + (r.note ? ' · ' + r.note : ''); if (mt.textContent !== mh) mt.textContent = mh;
    }
  }
}

function renderGlassPanel() {
  const el = $('glassPanel');
  const parts = [];
  const show = (v, title) => {
    const c = v.contents(); const tot = v.totalMl();
    let h = `<h4>${title}</h4><div class="cap"><i style="width:${clamp((tot + v.ice.length * 12) / v.capacityMl * 100, 0, 100)}%"></i></div>`;
    if (!c.size && !v.ice.length) h += '<div class="muted">Empty</div>';
    for (const [k, ml] of c) if (ml > 0.3) h += `<div class="row"><span>${INGREDIENTS[k].name}</span><span>${oz(ml)} oz</span></div>`;
    if (v.ice.length) h += `<div class="row muted"><span>Ice</span><span>${v.ice.length} cubes</span></div>`;
    const flags = [];
    if (v !== shaker) { flags.push(['Stirred', v.stir >= 1]); flags.push(['Shaken', v.shaken]); flags.push([v.garnish ? GARNISHES[v.garnish].name : 'No garnish', !!v.garnish]); }
    else flags.push(['Shaken', v.shake >= 1]);
    h += `<div class="flags">${flags.map(([n, on]) => `<span class="flag${on ? ' on' : ''}">${n}</span>`).join('')}</div>`;
    if (v.spilled > 1) h += `<div class="row" style="color:var(--bad)"><span>Spilled</span><span>${oz(v.spilled)} oz</span></div>`;
    return h;
  };
  if (glass) parts.push(show(glass, GLASSES[glass.type].name));
  if (S.tier >= 2 && (shaker.totalMl() > 0 || shaker.iceCount() > 0 || held?.kind === 'shaker')) parts.push(show(shaker, 'Shaker tin'));
  const html = parts.join('<div style="height:10px"></div>') || '<h4>The mat</h4><div class="muted">No glass yet. Grab one from the rack on your right.</div>';
  if (el.innerHTML !== html) el.innerHTML = html;
}

function hintText() {
  const h = hover;
  if (held && held.kind === 'item') {
    if (hover && hover.type === 'customer') return `<b>Click</b> to hand ${hover.c.p.name} the ${ITEMS[held.item].name}`;
    if (ITEMS[held.item].open && !held.opened) return 'Click the <b>bottle opener</b> to pop the cap · <b>Q</b> put back';
    return `Click a guest to hand it over · <b>Q</b> put back`;
  }
  if (held) {
    const name = held.kind === 'bottle' ? INGREDIENTS[held.id].name : held.kind;
    if (h && h.type === 'customer') return `<b>Click</b> to serve ${h.c.p.name}`;
    if ((held.kind === 'shaker' || held.kind === 'scoop') && h && h.type === 'sink') return `<b>Click</b> to empty the ${held.kind === 'shaker' ? 'tin' : 'scoop'}`;
    if (held.kind === 'scoop' && h && h.type === 'ice') return '<b>Click</b> to refill the scoop';
    if (held.kind === 'bottle') return `<b>Hold click</b> to pour ${name} · <b>Q</b> put back`;
    if (held.kind === 'scoop') return `<b>Hold click</b> to tip ice in · <b>Q</b> put back`;
    if (held.kind === 'shaker') return `<b>Hold F</b> to shake · <b>hold click</b> to strain into the glass · <b>Q</b> put back`;
    if (held.kind === 'spoon') return `<b>Hold click</b> over a glass to stir · <b>Q</b> put back`;
    if (held.kind === 'rag') return `<b>Hold click</b> to wipe spills · <b>Q</b> put back`;
    if (held.kind === 'garnish') return `<b>Click</b> over the glass to drop the ${GARNISHES[held.g].name.toLowerCase()} on`;
  }
  if (!h) return '';
  if (h.type === 'tap') return isLocked(h) ? 'Locked. Unlock it at the register (<b>B</b>)' : `<b>Hold click</b> to pour ${INGREDIENTS[h.id].name}`;
  if (h.type === 'fridge') return bar.fridge.isOpen ? '<b>Click</b> to close the fridge' : '<b>Click</b> to open the fridge';
  if (h.type === 'fitem') return isLocked(h) ? 'Locked. Unlock it at the register (<b>B</b>)' : `<b>Click</b> to grab a ${ITEMS[h.id].name}`;
  if (h.type === 'dirty') return '<b>Click</b> to clear the empty glass';
  if (h.type === 'cash') return `<b>Click</b> to collect ${fmt(h.pile.amount)}`;
  if (h.type === 'opener') return 'Bottle opener';
  if (isLocked(h)) return 'Locked. Unlock it at the register (<b>B</b>)';
  switch (h.type) {
    case 'bottle': return `<b>Click</b> to grab ${INGREDIENTS[h.id].brand} ${INGREDIENTS[h.id].name}`;
    case 'ice': return '<b>Click</b> to grab the ice scoop';
    case 'garnish': return `<b>Click</b> to take a ${GARNISHES[h.g].name.toLowerCase()}`;
    case 'spoon': return '<b>Click</b> to take the bar spoon';
    case 'rag': return '<b>Click</b> to take the bar towel';
    case 'sink': return glass ? '<b>Click</b> to dump the glass on the mat' : 'Sink';
    case 'rack': return `<b>Click</b> to put a ${GLASSES[h.glass].name.toLowerCase()} on the mat`;
    case 'register': return '<b>Click</b> to open the supplier';
    case 'shaker': return '<b>Click</b> to pick up the shaker tin';
    case 'glass': return 'Your glass. Pour into it, then click a guest to serve';
    case 'customer': return h.c.state === 'waiting' ? `<b>Click</b> to serve ${h.c.p.name} the drink on the mat` : h.c.p.name;
  }
  return '';
}

// ------------------------------------------------------------------ shop + book
let shopTab = 'drinks';
function toggleShop() { if (!$('shop').hidden) { closeOverlays(); return; } openOverlay('shop'); renderShop(); }
function toggleBook() { if (!$('book').hidden) { closeOverlays(); return; } openOverlay('book'); renderBook(); }
function openOverlay(id) {
  overlayOpen = true; $('shop').hidden = id !== 'shop'; $('book').hidden = id !== 'book';
  mouseDown = false; if (held) putBack();
  releaseMouse();
}
function closeOverlays() { $('shop').hidden = true; $('book').hidden = true; overlayOpen = false; $('paused').hidden = true; requestLock(); }
$('shopClose').onclick = closeOverlays; $('bookClose').onclick = closeOverlays;
$('tabDrinks').onclick = () => { shopTab = 'drinks'; renderShop(); };
$('tabUp').onclick = () => { shopTab = 'up'; renderShop(); };
const TIER_ACCENT = ['#7dff9a', '#ffb02e', '#26e0ff', '#ff4f6a', '#b06bff'];
function shopCard({ title, desc, chips = [], cost, owned, next, locked, accent, onBuy, lockText }) {
  const d = document.createElement('div'); d.className = 'item' + (owned ? ' owned' : '') + (next && !owned ? ' next' : '');
  d.style.setProperty('--accent', accent);
  const pct = cost ? Math.min(100, S.money / cost * 100) : 100;
  d.innerHTML = `${owned ? '<span class="badge2">Owned</span>' : next ? '<span class="badge2">Next up</span>' : ''}<h3>${title}</h3><p>${desc}</p>${chips.length ? `<div class="chipsrow">${chips.map((c) => `<span>${c}</span>`).join('')}</div>` : ''}${!owned && cost ? `<div class="afford"><i style="width:${pct}%"></i></div>` : ''}<div class="foot"><span class="price">${cost ? fmt(cost) : 'Free'}</span></div>`;
  const b = document.createElement('button'); b.className = 'btn';
  b.textContent = owned ? 'Owned' : locked ? lockText : S.money < cost ? `Need ${fmt(cost - S.money)}` : 'Buy';
  b.disabled = owned || locked || S.money < cost;
  b.onclick = onBuy; d.querySelector('.foot').appendChild(b);
  return d;
}
function renderShop() {
  $('shopMoney').textContent = fmt(S.money);
  $('tabDrinks').classList.toggle('on', shopTab === 'drinks'); $('tabUp').classList.toggle('on', shopTab === 'up');
  const grid = $('shopGrid'); grid.innerHTML = '';
  const buyDone = (name) => { save(); applyUnlocks(); renderShop(); updateHUD(); drawRegister(); sound.register(); confetti(camera.position.clone().add(V3(0, 0, 0.5))); toast(`${name}: done!`); };
  if (shopTab === 'drinks') {
    TIERS.forEach((t) => {
      const owned = t.tier <= S.tier; const next = t.tier === S.tier + 1;
      const chips = RECIPES.filter((r) => r.tier === t.tier).map((r) => r.name).concat(Object.values(ITEMS).filter((i) => i.tier === t.tier).map((i) => i.short));
      grid.appendChild(shopCard({ title: t.name, desc: t.blurb, chips, cost: t.cost, owned, next, locked: !next, lockText: 'Buy the one before', accent: TIER_ACCENT[t.tier],
        onBuy: () => { if (S.money >= t.cost && next) { S.money -= t.cost; S.tier = t.tier; buyDone(t.name); } } }));
    });
  } else {
    for (const [label, list] of [['Behind the bar', UPGRADES.filter((u) => !u.decor)], ['The club', UPGRADES.filter((u) => u.decor)]]) {
      const h = document.createElement('div'); h.className = 'secthead'; h.textContent = label; grid.appendChild(h);
      list.forEach((u) => {
        const needs = (u.id === 'stool4' && !has('stool3')) || (u.id === 'stool5' && !has('stool4'));
        grid.appendChild(shopCard({ title: u.name, desc: u.desc, cost: u.cost, owned: has(u.id), next: false, locked: needs, lockText: 'Needs third stool', accent: u.decor ? '#26e0ff' : '#ff4fd8',
          onBuy: () => { if (S.money >= u.cost) { S.money -= u.cost; S.upgrades[u.id] = true; buyDone(u.name); } } }));
      });
    }
  }
}
function renderBook() {
  const grid = $('bookGrid'); grid.innerHTML = '';
  RECIPES.forEach((r) => {
    const d = document.createElement('div'); d.className = 'recipe';
    const lockedR = r.tier > S.tier;
    d.style.opacity = lockedR ? 0.45 : 1;
    d.innerHTML = `<h3>${r.name} <small style="float:right">${fmt(r.price)}</small></h3><div class="meta">${GLASSES[r.glass].name} · ${r.ice ? 'ice' : 'no ice'} · ${r.method === 'build' ? 'built' : r.method === 'shake' ? 'shaken' : 'stirred'}${r.garnish ? ' · ' + GARNISHES[r.garnish].name.toLowerCase() : ''}${lockedR ? ' · locked' : ''}</div><ul>${Object.entries(r.parts).map(([k, v]) => `<li>${v} oz ${INGREDIENTS[k].name}</li>`).join('')}</ul>${r.note ? `<div class="meta" style="margin-top:6px">${r.note}</div>` : ''}`;
    grid.appendChild(d);
  });
}

// ------------------------------------------------------------------ held item update (pouring etc.)
const tmpQ = new THREE.Quaternion(), tmpV = V3();
const UP = V3(0, 1, 0);
const tiltCfg = {
  bottle: { start: 0.9, max: 2.1, up: 2.8, down: 3.2 },
  scoop: { start: 0.55, max: 1.5, up: 1.8, down: 3 },
  shaker: { start: 0.95, max: 2.1, up: 1.6, down: 2.6 },
};
function updateHeld(dt, t) {
  if (!held) { stream.visible = false; sound.pour(0); sound.shake(false); return; }
  const o = held.obj;
  const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, player.yaw);
  const right = V3(1, 0, 0).applyQuaternion(yawQ);
  const back = V3(0, 0, 1).applyQuaternion(yawQ);
  const camRel = (x, y, z) => V3(x, y, z).applyQuaternion(camera.quaternion).add(camera.position);
  const shaking = held.kind === 'shaker' && (keys.KeyF || (rightDown && locked));
  const cfg = tiltCfg[held.kind];
  if (cfg) {
    if (mouseDown && !shaking && !(hover && (hover.type === 'customer' || hover.type === 'sink' || (held.kind === 'scoop' && hover.type === 'ice')))) held.tilt = Math.min(cfg.max, held.tilt + cfg.up * dt);
    else held.tilt = Math.max(0, held.tilt - cfg.down * dt);
  }
  let targetPos, targetQ;
  const tremorAmp = (has('steady') ? 0.0012 : 0.0028);
  const tf = cfg ? clamp((held.tilt - cfg.start) / (cfg.max - cfg.start), 0, 1) : 0;
  const tremor = V3(Math.sin(t * 7.3) + Math.sin(t * 13.1 + 1) * 0.5, Math.sin(t * 9.7 + 2) * 0.4, Math.sin(t * 6.1 + 3) + Math.sin(t * 15.3) * 0.4).multiplyScalar(tremorAmp * (0.35 + tf * 1.2));

  if (shaking) {
    const ph = t * 16;
    targetPos = camRel(0.1, -0.12 + Math.sin(ph) * 0.05, -0.42 + Math.cos(ph) * 0.03);
    targetQ = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35 + Math.sin(ph) * 0.25, 0, 0.5)));
    shaker.lid.visible = true;
    if (shaker.iceCount() >= 2 && shaker.totalMl() > 5) {
      shaker.shake = Math.min(1, shaker.shake + dt / 2.2);
      if (shaker.shake >= 1 && !shaker.shaken) { shaker.shaken = true; shaker.mix(); toast('Shaken!'); }
      if (Math.random() < dt * 14) sound.clink(0.6 + Math.random() * 0.3);
    } else if (!held.warnedShake) { held.warnedShake = true; toast(shaker.iceCount() < 2 ? 'Put ice in the tin before shaking' : 'The tin is empty'); }
    sound.shake(true);
    held.tilt = 0;
  } else {
    sound.shake(false);
    if (held.kind === 'shaker') shaker.lid.visible = held.tilt < 0.3 && shaker.shake > 0 && shaker.shake < 1;
    const over = aimPoint && !(hover && hover.type === 'customer');
    if (over && (held.kind === 'bottle' || held.kind === 'scoop' || held.kind === 'shaker')) {
      const h = o.userData.height || (held.kind === 'shaker' ? 0.18 : 0.06);
      const k = smooth(0, cfg.start, held.tilt);
      const tilt = held.tilt;
      const rotQ = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), tilt));
      const spoutLocal = (o.userData.spout ? o.userData.spout.position.clone() : V3(0, h, 0));
      if (held.kind === 'shaker') spoutLocal.set(-0.045, 0.178, 0);
      const liftTop = bar.matTopY + 0.2 + (held.kind === 'scoop' ? 0 : 0.05);
      const tipH = held.kind === 'scoop' ? liftTop + 0.02 : Math.max(liftTop, bar.matTopY + 0.01 + spoutLocal.y * (1 - k) + 0.02);
      // lead the aim so the arcing stream lands where you look
      const fNow = clamp((tilt - cfg.start) / (cfg.max - cfg.start), 0, 1);
      const vh = held.kind === 'scoop' ? 0.055 : 0.06 + 0.16 * Math.pow(fNow, 1.25);
      const lead = vh * Math.sqrt(2 * Math.max(0.05, tipH - bar.matTopY - 0.08) / 9.8);
      const tip = aimPoint.clone().addScaledVector(right, (1 - k) * (held.kind === 'scoop' ? 0.06 : 0.11) + lead * k).setY(tipH).add(tremor);
      targetQ = rotQ;
      targetPos = tip.sub(spoutLocal.applyQuaternion(rotQ));
    } else if (held.kind === 'spoon' || held.kind === 'rag' || held.kind === 'garnish') {
      if (aimPoint) {
        const v = targetVessel(aimPoint, 0.04);
        if (held.kind === 'spoon') {
          if (v && mouseDown) {
            const ph = t * 9; const rr = v.rimR * 0.45;
            targetPos = v.group.position.clone().add(V3(Math.cos(ph) * rr, v.def.bottomY + 0.01, Math.sin(ph) * rr));
            targetQ = yawQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, ph, -0.12)));
            v.stir = Math.min(1, v.stir + dt / 1.6);
            if (v.stir >= 1 && !v.stirDone) { v.stirDone = true; v.mix(); toast('Stirred'); }
            if (Math.random() < dt * 4 && v.ice.length) sound.clink(1.1);
          } else {
            targetPos = aimPoint.clone().add(V3(0, (v ? v.rimY : 0) + 0.08, 0)); targetQ = yawQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.15)));
          }
        } else if (held.kind === 'rag') {
          const wipe = mouseDown;
          const ph = t * 10;
          targetPos = aimPoint.clone().add(V3(wipe ? Math.cos(ph) * 0.05 : 0, 0.002 + (wipe ? 0 : 0.03), wipe ? Math.sin(ph) * 0.04 : 0));
          targetQ = yawQ.clone();
          if (wipe) {
            for (let i = puddles.length - 1; i >= 0; i--) {
              const p = puddles[i];
              if (Math.hypot(p.mesh.position.x - aimPoint.x, p.mesh.position.z - aimPoint.z) < p.r + 0.09) {
                p.ml -= dt * 40; p.r = Math.min(0.16, 0.012 + Math.sqrt(Math.max(0, p.ml)) * 0.009); p.mesh.scale.setScalar(p.r);
                if (p.ml <= 0.5) { scene.remove(p.mesh); p.mesh.material.dispose(); puddles.splice(i, 1); }
              }
            }
          }
        } else {
          targetPos = aimPoint.clone().add(V3(0, (v ? v.rimY : 0) + 0.05, 0)); targetQ = yawQ.clone();
        }
      }
    }
    if (!targetPos) {
      // carry in front of you
      const carry = { bottle: [0.17, -0.22, -0.45], scoop: [0.16, -0.2, -0.4], shaker: [0.16, -0.24, -0.45], spoon: [0.14, -0.2, -0.4], rag: [0.16, -0.25, -0.45], garnish: [0.1, -0.13, -0.35], item: [0.16, -0.22, -0.42] }[held.kind];
      targetPos = camRel(...carry);
      targetQ = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), held.tilt * 0.6));
    }
  }
  const k = 1 - Math.exp(-dt * (shaking ? 30 : 16));
  o.position.lerp(targetPos, k);
  o.quaternion.slerp(targetQ, k);

  // ------- flow
  stream.visible = false;
  if (cfg && held.tilt > cfg.start && !shaking) {
    const f = Math.pow(tf, 1.25);
    o.updateMatrixWorld(true);
    const spoutW = held.kind === 'shaker' ? V3(-0.045, 0.178, 0).applyMatrix4(o.matrixWorld) : (o.userData.spout ? o.userData.spout.getWorldPosition(V3()) : o.position.clone());
    if (held.kind === 'scoop') {
      const set = scoop.userData.iceSet;
      held.iceAcc = (held.iceAcc || 0) + dt * (2 + f * 9);
      while (held.iceAcc > 1 && set.children.length) {
        held.iceAcc -= 1;
        const cube = set.children[set.children.length - 1];
        set.remove(cube); scene.add(cube);
        cube.position.copy(spoutW).add(V3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02));
        fallingIce.push({ mesh: cube, vel: right.clone().multiplyScalar(-0.04 - Math.random() * 0.03), spin: V3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
      }
      if (!set.children.length) held.iceAcc = 0;
    } else {
      let ingId, color, thick = 1;
      let flowMl;
      if (held.kind === 'bottle') {
        const ing = INGREDIENTS[held.id];
        ingId = held.id; color = ing.color; thick = ing.flow;
        flowMl = 40 * ing.flow * Math.max(0.25, f) * (has('pourers') ? 0.72 : 1) * (1 + Math.sin(t * 23) * 0.12);
      } else {
        const tot = shaker.totalMl();
        flowMl = tot > 0 ? Math.min(tot / dt, 52 * f) : 0;
        color = '#' + shaker.mixColor(shaker.contents()).color.getHexString();
      }
      if (flowMl > 0.01) {
        const ml = flowMl * dt;
        // stream path: parabola from spout
        const v0 = right.clone().multiplyScalar(-0.06 - f * 0.16);
        let tgt = null; let endY = bar.matTopY;
        const pts = [];
        const g = 9.8;
        let landed = null;
        for (let i = 0; i <= 40; i++) {
          const tt = i * 0.008;
          const p = spoutW.clone().addScaledVector(v0, tt); p.y -= 0.5 * g * tt * tt;
          pts.push(p);
          if (!tgt) for (const v of vessels()) {
            if (v === held.vessel) continue;
            const rimW = v.group.position.y + v.rimY;
            if (p.y <= rimW && p.y > rimW - 0.03) {
              const c = v.group.position;
              if (Math.hypot(p.x - c.x, p.z - c.z) < v.rimR - 0.004) { tgt = v; endY = v.group.position.y + Math.max(v.level, v.def.bottomY) + 0.002; }
            }
          }
          if (p.y <= endY) { landed = p; landed.y = endY; pts[pts.length - 1] = landed; break; }
        }
        if (!landed) landed = pts[pts.length - 1];
        const thickness = 0.0016 + Math.sqrt(f) * 0.0034 * Math.sqrt(thick);
        if (pts.length >= 2 && pts.every((q) => Number.isFinite(q.x + q.y + q.z)) && pts[0].distanceTo(pts[pts.length - 1]) > 0.002) {
          stream.geometry.dispose();
          stream.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(2, pts.length * 2), thickness, 8, false);
          streamMat.color.set(color);
          streamMat.opacity = held.kind === 'bottle' ? 0.35 + INGREDIENTS[ingId].alpha * 0.55 : 0.8;
          stream.visible = true;
        }
        let spilled = 0;
        if (tgt) {
          if (held.kind === 'bottle') spilled = tgt.addLiquid(ingId, ml);
          else {
            const parts = shaker.take(ml);
            for (const [id, m] of parts) spilled += tgt.addLiquid(id, m);
            if (shaker.shaken && tgt !== shaker) { tgt.shaken = true; tgt.mixedOnce = true; tgt.mix(); }
          }
          if (spilled > 0) { const c = tgt.group.position; addSpill(V3(c.x + (Math.random() - 0.5) * 0.04, 0, c.z + tgt.rimR + 0.01), spilled, color); }
          pourSession += ml - spilled; pourSpill += spilled;
          sound.pour(flowMl, thick, 'glass', held.kind === 'bottle' ? pourKind(ingId) : 'mix', tgt.level / tgt.rimY);
          const want = held.kind === 'bottle' && D().showTarget && selectedTicket?.recipe?.parts[ingId];
          if (want && !held.dinged && (tgt.contents().get(ingId) || 0) >= pourDoneAt(want * OZ)) { held.dinged = true; sound.ding(); }
        } else {
          if (held.kind === 'shaker') shaker.take(ml);
          addSpill(landed, ml, color);
          if (glass) glass.spilled += ml * 0.5; // the guest notices sticky bar
          pourSpill += ml; if (held.kind === 'bottle') { NS.waste += ml; NS.wasteCost += ml * costPerMl(ingId); }
          sound.pour(flowMl, thick, 'counter', held.kind === 'bottle' ? pourKind(ingId) : 'mix');
        }
        if (held.kind === 'bottle') useStock(ingId, ml);
        pourIng = held.kind === 'bottle' ? INGREDIENTS[ingId].name : 'Shaken mix';
        // droplets at impact
        if (Math.random() < 0.6) {
          const d = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
          d.position.copy(landed); scene.add(d);
          drops.push({ mesh: d, vel: V3((Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4), life: 0.35 });
        }
      } else sound.pour(0);
    }
  } else sound.pour(0);
}

function updateFallingIce(dt) {
  for (let i = fallingIce.length - 1; i >= 0; i--) {
    const f = fallingIce[i]; const m = f.mesh;
    f.vel.y -= 9.8 * dt;
    const prevY = m.position.y;
    m.position.addScaledVector(f.vel, dt);
    m.rotation.x += f.spin.x * dt; m.rotation.y += f.spin.y * dt;
    for (const v of vessels()) {
      const rimW = v.group.position.y + v.rimY;
      if (prevY > rimW && m.position.y <= rimW) {
        const c = v.group.position;
        const d = Math.hypot(m.position.x - c.x, m.position.z - c.z);
        if (d < v.rimR + 0.012) {
          if (v.ice.length < v.slots.length) {
            scene.remove(m); fallingIce.splice(i, 1);
            const sp = v.addIce();
            if (sp > 0) { addSpill(V3(c.x, 0, c.z + v.rimR), sp, '#' + v.mixColor(v.contents()).color.getHexString()); }
            sound.clink(v.totalMl() > 5 ? 0.7 : 1);
            if (v.totalMl() > 5 && Math.random() < 0.5) sound.splash();
            break;
          } else { f.vel.set((Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6); sound.clink(1.2); }
        } else if (d < v.rimR + 0.02) { f.vel.x = (m.position.x - c.x) * 12; f.vel.z = (m.position.z - c.z) * 12; f.vel.y = 0.3; sound.clink(1.4); }
      }
    }
    if (!fallingIce.includes(f)) continue;
    if (m.position.y <= bar.matTopY + 0.012) {
      m.position.y = bar.matTopY + 0.012;
      fallingIce.splice(i, 1);
      looseIce.push({ mesh: m, life: 7 });
      sound.clink(0.5);
      if (glass) glass.spilled += 2;
    }
  }
  for (let i = looseIce.length - 1; i >= 0; i--) {
    const l = looseIce[i]; l.life -= dt;
    l.mesh.scale.setScalar(Math.max(0.01, l.life / 7));
    if (l.life <= 0) { scene.remove(l.mesh); addSpill(l.mesh.position, 6, '#e8f4ff'); looseIce.splice(i, 1); }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.life -= dt; d.vel.y -= (d.spin ? 3 : 9.8) * dt; if (d.spin) { d.vel.multiplyScalar(0.985); d.mesh.rotation.x += dt * 9; d.mesh.rotation.y += dt * 7; d.mesh.material.opacity = Math.min(1, d.life * 2); } d.mesh.position.addScaledVector(d.vel, dt);
    if (d.life <= 0) { scene.remove(d.mesh); d.mesh.material.dispose(); drops.splice(i, 1); }
  }
}

// ------------------------------------------------------------------ draft tap + fridge door
function updateTapAndFridge(dt, t) {
  const f = bar.fridge; f.open += ((f.isOpen ? 1 : 0) - f.open) * Math.min(1, dt * 6);
  f.pivot.rotation.y = -1.5 * f.open;
  for (const tp of bar.taps) tp.piv.rotation.x += ((tapActive === tp.id ? 0.7 : 0) - tp.piv.rotation.x) * Math.min(1, dt * 10);
  if (!tapActive || !mouseDown || held) { if (tapActive && !mouseDown) tapActive = null; if (!held) { stream.visible = false; sound.pour(0); } return; }
  const tp = bar.taps.find((x) => x.id === tapActive);
  if (tp.piv.rotation.x < 0.35) return;
  const ing = INGREDIENTS[tapActive];
  const ml = 65 * dt;
  let endY = bar.matTopY;
  if (glass) {
    const sp = glass.addLiquid(tapActive, ml);
    if (sp > 0) addSpill(V3(glass.group.position.x, 0, glass.group.position.z + glass.rimR + 0.01), sp, ing.color);
    endY = glass.group.position.y + Math.max(glass.level, glass.def.bottomY);
    const want = D().showTarget && selectedTicket?.recipe?.parts?.[tapActive];
    if (want && !tp.dinged && (glass.contents().get(tapActive) || 0) >= pourDoneAt(want * OZ)) { tp.dinged = true; sound.ding(); }
  }
  const a = tp.spout.clone(), b = V3(tp.spout.x, endY, tp.spout.z);
  stream.geometry.dispose(); stream.geometry = new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 2, 0.0045, 8, false);
  streamMat.color.set(ing.color); streamMat.opacity = 0.85; stream.visible = true;
  sound.pour(40, 1.2, 'glass', 'beer', glass ? glass.level / glass.rimY : 0);
}

// ------------------------------------------------------------------ hands update
const handState = { r: { pos: V3(), q: new THREE.Quaternion(), init: false }, l: { pos: V3(), q: new THREE.Quaternion(), init: false } };
function gripFor(kind, obj) {
  // returns {pos (object-local wrist position), q (object-local), pose}
  const E = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
  if (kind === 'bottle') {
    const r = obj.userData.radius || 0.035, h = obj.userData.height || 0.3;
    return { pos: V3(r + 0.022, h * 0.38, 0.05), q: E(0.35, 0.25, -Math.PI / 2 + 0.15), pose: r > 0.04 ? POSES.gripWide : POSES.grip };
  }
  if (kind === 'shaker') return { pos: V3(0.064, 0.08, 0.052), q: E(0.3, 0.25, -Math.PI / 2 + 0.1), pose: POSES.gripWide };
  if (kind === 'scoop') return { pos: V3(0.13, 0.068, 0.05), q: E(0.15, 0, 0.1), pose: POSES.grip };
  if (kind === 'spoon') return { pos: V3(0.012, 0.29, 0.04), q: E(-1.25, 0, -0.5, 'YXZ'), pose: POSES.pinch };
  if (kind === 'rag') return { pos: V3(0.0, 0.034, 0.075), q: E(0.08, 0, 0), pose: POSES.flat };
  if (kind === 'item') { const r = obj.userData.radius || 0.033, h = obj.userData.height || 0.13; return { pos: V3(r + 0.022, h * 0.4, 0.05), q: E(0.35, 0.25, -Math.PI / 2 + 0.15), pose: POSES.grip }; }
  if (kind === 'garnish') return { pos: V3(0.02, 0.05, 0.085), q: E(-0.7, 0.2, 0.2), pose: POSES.pinch };
  return { pos: V3(), q: new THREE.Quaternion(), pose: POSES.relaxed };
}
function updateHands(dt, t) {
  const bob = Math.sin(player.bob * 2) * 0.006;
  // right
  let rp, rq, rpose;
  if (held) {
    const g = gripFor(held.kind, held.obj);
    held.obj.updateMatrixWorld(true);
    rp = g.pos.clone().applyMatrix4(held.obj.matrixWorld);
    rq = held.obj.getWorldQuaternion(new THREE.Quaternion()).multiply(g.q);
    rpose = g.pose;
  } else {
    rp = V3(0.27, -0.34 + bob + Math.sin(t * 1.3) * 0.003, -0.42).applyQuaternion(camera.quaternion).add(camera.position);
    rq = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0.25, 0.55)));
    rpose = hover && !isLocked(hover) ? POSES.point : POSES.relaxed;
  }
  // left: steady the glass while pouring into it, hold the tin lid while shaking, else rest
  let lp, lq, lpose = POSES.relaxed;
  const shaking = held && held.kind === 'shaker' && (keys.KeyF || (rightDown && locked));
  const pouringInto = held && (held.kind === 'bottle' || held.kind === 'shaker' || held.kind === 'scoop') && held.tilt > 0.4 && glass && aimPoint && Math.hypot(aimPoint.x - glass.group.position.x, aimPoint.z - glass.group.position.z) < 0.12;
  if (shaking) {
    held.obj.updateMatrixWorld(true);
    lp = V3(-0.02, 0.29, 0.05).applyMatrix4(held.obj.matrixWorld);
    lq = held.obj.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0, 0)));
    lpose = POSES.cupGlass;
  } else if (pouringInto) {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, player.yaw);
    const c = glass.group.position;
    lp = V3(-(glass.rimR + 0.03), Math.min(0.06, glass.rimY * 0.4), 0.05).applyQuaternion(yawQ).add(c);
    lq = yawQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.25, Math.PI / 2 - 0.15)));
    lpose = POSES.gripWide;
  } else {
    lp = V3(-0.28, -0.36 + bob, -0.44).applyQuaternion(camera.quaternion).add(camera.position);
    lq = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.2, -0.5)));
  }
  const kr = 1 - Math.exp(-dt * (held ? 28 : 14));
  const kl = 1 - Math.exp(-dt * 12);
  const R = handState.r, L = handState.l;
  if (!R.init) { R.pos.copy(rp); R.q.copy(rq); R.init = true; L.pos.copy(lp); L.q.copy(lq); L.init = true; }
  R.pos.lerp(rp, kr); R.q.slerp(rq, kr); L.pos.lerp(lp, kl); L.q.slerp(lq, kl);
  RH.root.position.copy(R.pos); RH.root.quaternion.copy(R.q);
  LH.root.position.copy(L.pos); LH.root.quaternion.copy(L.q);
  // forearms always reach back to an elbow below the camera, whatever the wrist is doing
  for (const [H, ex] of [[RH, 0.3], [LH, -0.3]]) {
    if (!H.forearm) continue;
    H.root.updateMatrixWorld(true);
    const wrist = H.root.getWorldPosition(V3());
    const elbow = V3(ex * 1.3, -0.72, 0.12).applyQuaternion(camera.quaternion).add(camera.position);
    const dir = elbow.sub(wrist).normalize();
    const inv = H.hand.matrixWorld.clone().invert();
    const local = dir.transformDirection(inv);
    H.forearm.quaternion.setFromUnitVectors(V3(0, 0, 1), local);
  }
  RH.setPose(rpose); LH.setPose(lpose);
  RH.update(dt, 14); LH.update(dt, 10);
}

// ------------------------------------------------------------------ main loop
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta(); watchPerf(rawDt);
  let dt = Math.min(0.05, rawDt);
  if (slowT > 0) { slowT -= dt; dt *= 0.35; }
  elapsed += dt;
  const t = elapsed;
  try { if (running && !overlayOpen) step(dt, t); else idleCamera(dt, t); } catch (e) { if (!frame.warned) { frame.warned = true; console.error(e); } }
  // ambient life always
  for (const a of ambient) {
    a.t += dt;
    if (Math.random() < dt * 0.15) a.p.say();
    a.p.update(dt, t);
  }
  // decor animation
  if (bar.decor.fire.visible) {
    for (const f of bar.decor.flames) { const k = 0.75 + Math.sin(t * 9 + f.ph) * 0.18 + Math.sin(t * 23 + f.ph * 2) * 0.1; f.m.scale.set(1, k, 1); f.m.position.y = 0.06 + 0.25 * k; f.m.rotation.y = t * 2 + f.ph; }
    bar.decor.fireGlow.material.opacity = 0.15 + Math.sin(t * 11) * 0.03;
  }
  if (bar.decor.led.visible) for (const tl of bar.decor.tiles) tl.m.material.color.setHSL((t * 0.06 + tl.i * 0.035 + tl.j * 0.05) % 1, 0.8, 0.2 + 0.07 * Math.sin(t * 2 + tl.i * 0.5));
  if (bar.decor.lights.visible) bar.decor.bulbs.material.color.setHSL(0.1, 0.9, 0.72 + Math.sin(t * 1.7) * 0.04);
  for (const c of bar.candles) { const f = 0.45 + Math.sin(t * 13 + c.light.position.x) * 0.06 + Math.sin(t * 29) * 0.04; c.light.intensity = f; c.flame.scale.y = 1.8 + Math.sin(t * 17 + c.light.position.z) * 0.3; }
  try { sound.tick(); updateClub(dt, t); } catch (e) { if (!frame.warnedClub) { frame.warnedClub = true; console.error(e); } }
  composer.render();
  const playingNow = running && !overlayOpen && $('paused').hidden && $('summary').hidden;
  if (playingNow !== CG.playing) { CG.playing = playingNow; cgCall(playingNow ? 'gameplayStart' : 'gameplayStop'); }
}
let introT = 0;
function idleCamera(dt, t) {
  if (!running) {
    introT += dt;
    camera.position.set(Math.sin(introT * 0.08) * 3.5, 3.4 + Math.sin(introT * 0.23) * 0.3, 1.2 + Math.cos(introT * 0.08) * 0.5);
    camera.lookAt(-0.3 + Math.sin(introT * 0.06) * 1.5, 1.4, 8.5);
    for (const c of customers) updateCustomer(c, dt, t);
  }
}
function step(dt, t) {
  // movement
  const sp = 1.9 * dt;
  const fwd = V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)); const rt = V3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const mv = V3();
  if (keys.KeyW || keys.ArrowUp) mv.add(fwd); if (keys.KeyS || keys.ArrowDown) mv.sub(fwd);
  if (keys.KeyD || keys.ArrowRight) mv.add(rt); if (keys.KeyA || keys.ArrowLeft) mv.sub(rt);
  if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(sp); player.pos.add(mv); player.bob += dt * 7; }
  if (!window.__lcFree) { player.pos.x = clamp(player.pos.x, -2.75, 2.75); player.pos.z = clamp(player.pos.z, -1.45, -0.6); }
  // soft look: the hidden cursor can run into the window edge, so the edge zone keeps turning you, but only
  // while the cursor is really inside the game (leaving the window or losing focus stops it at once)
  if (softLock && cursorIn && !window.__lcNoPan && !overlayOpen) {
    const zone = 0.07, fx = lastCX / innerWidth, fy = lastCY / innerHeight;
    const ex = fx < zone ? -(zone - fx) / zone : fx > 1 - zone ? (fx - 1 + zone) / zone : 0;
    const ey = fy < zone ? (zone - fy) / zone : fy > 1 - zone ? -(fy - 1 + zone) / zone : 0;
    player.yaw -= ex * dt * 2.4; player.pitch = clamp(player.pitch + ey * dt * 1.2, -1.35, 0.9);
  }
  // free-cursor fallback: edge pan
  if (freeCursor && !locked && cursorIn && !overlayOpen && !window.__lcNoPan) {
    const ex = !rightDown && Math.abs(mouse.x) > 0.86 ? (mouse.x - Math.sign(mouse.x) * 0.86) / 0.14 : 0;
    const ey = !rightDown && Math.abs(mouse.y) > 0.86 ? (mouse.y - Math.sign(mouse.y) * 0.86) / 0.14 : 0;
    player.yaw -= ex * dt * 1.9; player.pitch = clamp(player.pitch + ey * dt * 1.1, -1.35, 0.9);
  }
  camera.position.copy(player.pos).add(V3(0, Math.sin(player.bob * 2) * 0.012, 0));
  kick.pitch *= Math.exp(-dt * 9); kick.roll *= Math.exp(-dt * 9);
  camera.rotation.set(player.pitch + kick.pitch, player.yaw, kick.roll);
  // C zooms in, V zooms out
  if (keys.KeyC || keys.KeyV) { zoom = clamp(zoom * (keys.KeyC ? 1 + dt * 1.2 : 1 - dt * 1.2), 0.8, 2.4); try { localStorage.setItem('lastcall-zoom', zoom.toFixed(2)); } catch { /* ignore */ } }
  if (Math.abs(camera.zoom - zoom) > 0.001) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld(true);

  computeHover();

  for (const id in bottles) bottles[id].label.visible = held?.obj !== bottles[id].obj;
  shaker.label.visible = held?.kind !== 'shaker';
  for (const lb of labels) { const d = lb.getWorldPosition(tmpV).distanceTo(camera.position); lb.material.opacity = clamp((2.4 - d) / 0.6, 0, 1); }
  bar.stations.spoon.label.visible = held?.kind !== 'spoon';
  bar.stations.rag.label.visible = held?.kind !== 'rag';
  updateHeld(dt, t);
  updateTapAndFridge(dt, t);
  updateFallingIce(dt);
  updateHands(dt, t);
  if (glass) {
    if (glass.appear !== undefined && glass.appear < 1) { glass.appear = Math.min(1, glass.appear + dt * 5); glass.group.scale.setScalar(0.4 + 0.6 * smooth(0, 1, glass.appear)); }
    glass.update(dt);
  }
  shaker.update(dt);

  // returning items glide home
  for (let i = returning.length - 1; i >= 0; i--) {
    const r = returning[i]; r.t = Math.min(1, r.t + dt * 4);
    const k = smooth(0, 1, r.t);
    r.obj.position.lerpVectors(r.from, r.to, k); r.obj.position.y += Math.sin(k * Math.PI) * 0.06;
    r.obj.quaternion.slerpQuaternions(r.fromQ, r.toQ, k);
    if (r.t >= 1) returning.splice(i, 1);
  }
  // flying glasses
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i]; f.t = Math.min(1, f.t + dt / f.dur);
    const k = f.slide ? 1 - Math.pow(1 - f.t, 3) : smooth(0, 1, f.t);
    f.v.group.position.lerpVectors(f.from, f.to, k);
    if (!f.slide) f.v.group.position.y += Math.sin(k * Math.PI) * 0.12;
    f.v.update(dt);
    if (f.t >= 1) { flying.splice(i, 1); f.then && f.then(); }
  }
  for (const c of customers) { if (c.glass) c.glass.update(dt); }

  // customers
  nightT -= dt;
  if (nightT <= 0 && !lastCall) { lastCall = true; toast('Last call! Finish the open orders'); sound.register(); }
  if (lastCall && !customers.some((c) => c.state !== 'leave' && c.state !== 'standup') && !overlayOpen) { if (!customers.length || customers.every((c) => c.state === 'leave')) endNight(); }
  const into = NIGHT_LEN - nightT;
  const rushNow = into >= 110 && into < 170 && !lastCall;
  if (rushNow && !NS.rush) { bigPop('RUSH HOUR'); toast('Rush hour: more guests, tips x1.4'); sound.cheer(); spawnTimer = Math.min(spawnTimer, 1); }
  if (!rushNow && NS.rush) toast('Rush is over. Breathe.');
  NS.rush = rushNow;
  spawnTimer -= dt;
  if (spawnTimer <= 0 && !lastCall) {
    spawnCustomer();
    if (Math.random() < D().both) spawnCustomer();
    let base = (11 + Math.random() * 8) * D().spawn * Math.max(0.55, 1 - (S.night - 1) * 0.06);
    if (has('jukebox')) base *= 0.85; if (has('neon')) base *= 0.8; if (has('firepit')) base *= 0.85;
    spawnTimer = base * (into < 50 ? 1.4 : NS.rush ? 0.45 : 1);
  }
  for (const c of [...customers]) updateCustomer(c, dt, t);
  updateFlyers(dt);

  // bubbles follow heads
  for (const c of customers) {
    if (!c.bubble) continue;
    c.bubbleT -= dt;
    if (c.bubbleT <= 0) { c.bubble.hidden = true; continue; }
    const p = c.p.head.getWorldPosition(V3()).add(V3(0, 0.26, 0)).project(camera);
    c.bubble.hidden = p.z > 1 || Math.abs(p.x) > 1.1;
    c.bubble.style.left = ((p.x + 1) / 2 * window.innerWidth) + 'px';
    c.bubble.style.top = ((1 - p.y) / 2 * window.innerHeight) + 'px';
  }

  // HUD
  const hint = hintText(); if ($('hint').innerHTML !== hint) $('hint').innerHTML = hint;
  $('crosshair').classList.toggle('hot', !!hover && !isLocked(hover));
  $('crosshair').hidden = !locked;
  // pour counter by the cursor: what's in the glass vs what the guest asked for
  const pm = $('pourMeter');
  let pourId = null, pourV = null;
  if (held && held.kind === 'bottle' && (held.tilt > 0.2 || pourSession > 0)) { pourId = held.id; pourV = targetVessel(aimPoint || held.obj.position, 0.1) || glass; }
  else if (tapActive && glass) { pourId = tapActive; pourV = glass; }
  if (pourId && pourV) {
    const have = (pourV.contents().get(pourId) || 0) / OZ;
    const want = D().showTarget ? selectedTicket?.recipe?.parts?.[pourId] : null;
    const done = want && have >= pourDoneAt(want, 1), close = want && have >= pourDoneAt(want, 1) - 0.3, over = want && have > want * 1.2;
    const html = `<span class="amt${over ? ' over' : close ? ' close' : ''}">${have.toFixed(2)}${want ? ` / ${want}` : ''} oz</span><span class="ing">${INGREDIENTS[pourId].name}${over ? ' · TOO MUCH' : done ? ' · LET GO!' : ''}</span>`;
    if (pm.innerHTML !== html) pm.innerHTML = html;
    pm.style.left = (locked ? window.innerWidth / 2 : lastCX) + 28 + 'px'; pm.style.top = (locked ? window.innerHeight / 2 : lastCY) - 24 + 'px';
    if (held && !mouseDown && held.tilt < 0.05) { pourSession = 0; pourSpill = 0; }
  } else if (pm.innerHTML) pm.innerHTML = '';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  renderTickets(false);
  updateGuide(t);
  renderGlassPanel();
  drawRegister();
  updateHUD();
}

// ------------------------------------------------------------------ boot
applyUnlocks();
updateHUD();
$('startBtn').disabled = true; $('startBtn').querySelector('span').textContent = 'Opening up…';
applyLevel();
loadModels().then(() => { spawnModelPeople(); applyLevel(); $('startBtn').disabled = false; fillStart(); modelsDone = true; cgCall('loadingStop'); })
  .catch((e) => { console.error(e); seatAmbient(); spawnClubPeople(); spawnCrowd(); $('startBtn').disabled = false; fillStart(); });
function fillStart() {
  $('chipNight').textContent = S.night; $('chipTill').textContent = fmt(S.money);
  $('chipRating').textContent = S.served ? (S.scoreSum / S.served / 20).toFixed(1) + ' ★' : '—';
  $('startNight').textContent = `night ${S.night}`; if (!$('startBtn').disabled) $('startBtn').querySelector('span').textContent = nightInProgress ? 'Back to the bar' : 'Open the bar';
  if (nightInProgress) $('startNight').textContent = `night ${S.night} · paused`;
  $('resetBtn').hidden = !(S.served > 0 || S.money > 0);
}
function renderDiff() {
  const row = $('diffRow'); row.innerHTML = '';
  DIFFS.forEach((d, i) => {
    const b = document.createElement('button'); b.className = 'gm-dbtn' + ((S.diff ?? 1) === i ? ' on' : ''); b.textContent = d.name;
    b.onclick = () => { S.diff = i; save(); renderDiff(); };
    row.appendChild(b);
  });
  $('diffDesc').textContent = D().desc;
}
renderDiff();
fillStart();
function renderGfx() {
  const row = $('gfxRow'); row.innerHTML = '';
  for (const q of ['auto', 'high', 'medium', 'low']) {
    const b = document.createElement('button'); b.textContent = q.toUpperCase(); if (q === quality) b.className = 'on';
    b.onclick = () => { setQuality(q); renderGfx(); };
    row.appendChild(b);
  }
}
renderGfx();
$('howBtn').onclick = () => { $('howPanel').hidden = !$('howPanel').hidden; };
try { const v = localStorage.getItem('lastcall-vol'); if (v !== null) $('volSlider').value = v; } catch { /* ignore */ }
sound.vol = $('volSlider').value / 100;
// your own music: pick or drop audio files from your computer and they join the club playlist
// (the files stay on your computer; the game only plays them)
function addSongs(files) {
  const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name));
  if (!list.length) return;
  sound.init(); sound.setMusic(true, has('jukebox'));
  const first = PLAYLIST.length;
  for (const f of list) PLAYLIST.push({ title: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), file: URL.createObjectURL(f), own: true });
  sound.playTrack(first);
  toast(`${list.length} song${list.length > 1 ? 's' : ''} added to the playlist`);
}
$('addSongs').onclick = () => $('songFiles').click();
$('songFiles').onchange = (e) => { addSongs(e.target.files); e.target.value = ''; };
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('dropHint').hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropHint').hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; $('dropHint').hidden = true; addSongs(e.dataTransfer.files); });
$('nextTrack').onclick = () => { sound.init(); sound.setMusic(true, has('jukebox')); sound.next(); };
$('prevTrack').onclick = () => { sound.init(); sound.setMusic(true, has('jukebox')); sound.prev(); };
$('trackName').textContent = PLAYLIST[sound.track] ? PLAYLIST[sound.track].title : PLAYLIST[0].title;
$('volSlider').oninput = (e) => { sound.init(); sound.setVolume(e.target.value / 100); try { localStorage.setItem('lastcall-vol', e.target.value); } catch { /* ignore */ } };
$('nextNightBtn').onclick = startNight;
$('resetBtn').onclick = () => { S = fresh(); save(); applyUnlocks(); updateHUD(); fillStart(); $('loading').textContent = 'Clean slate.'; };
$('startBtn').onclick = () => {
  sound.init(); applyUnlocks();
  $('start').hidden = true; $('hud').hidden = false; $('bubbles').style.display = ''; running = true;
  requestLock();
  toast(nightInProgress ? 'Back behind the bar' : `Night ${S.night}. Goal: ${fmt(nightGoal())}`);
  nightInProgress = false;
};
frame();
// debug handle for development
// marketing captures (dev only): render the scene at an exact size, with glow, into the game canvas
function renderAt(w, h, fov) {
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); fx.setPixelRatio(1); fx.setSize(w, h); bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h; if (fov) camera.fov = fov; camera.updateProjectionMatrix();
  glowOn = 'full'; fx.render(); return renderer.domElement;
}
window.__lc = { probe: () => { camera.updateMatrixWorld(true); computeHover(); return hover; }, guideFor, targetPos, get hover() { return hover; }, get locked() { return locked; }, setLockedForTest: (v) => { locked = v; }, mouseDown: (d) => { mouseDown = d; if (d) { computeHover(); onPrimaryDown(); } else onPrimaryUp(); }, renderAt, CG, sound, propSource, gradePour, setPour: (v) => { pourSession = v; }, get ticket() { return selectedTicket; }, get NS() { return NS; }, renderer, get humans() { return humans; }, updateHumans, updateClub: (dt, t) => updateClub(dt, t), S, scene, camera, player, bar, bottles, customers, get glass() { return glass; }, shaker, RH, LH, spawnCustomer, newGlass, applyUnlocks, step: (n = 1) => { for (let i = 0; i < n; i++) step(1 / 60, elapsed += 1 / 60); composer.render(); }, setTier: (t) => { S.tier = t; applyUnlocks(); }, grab: (id) => grab('bottle', bottles[id].obj, { id }), setHeld: (v) => { held = v; }, get held() { return held; }, setMouse: (d) => { mouseDown = d; }, start: () => $("startBtn").onclick(), serve: (c) => serve(c), endNight: () => endNight(), setNightT: (v) => { nightT = v; }, click: (pk) => { hover = pk; onPrimaryDown(); }, dirty, cashPiles, makeOrder };
