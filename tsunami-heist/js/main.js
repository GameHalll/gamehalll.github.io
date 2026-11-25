import * as THREE from 'three';
import * as C from './config.js';
import { makeCharacter, animateCharacter, makeCreature, animateCreature, makeLabel, rarityLine, toon, mesh, G, setBat, HATS } from './models.js';
import { buildWorld, makeWave, BIOMES } from './world.js';
import { Sound } from './audio.js';
import { initBot, updateBot } from './bots.js';
import { icon, rarityGem, worldBadge, iconText, iconize } from './icons.js';
import { makeComposer, makeParticles, makeJuice } from './fx.js';
import { bus } from './hooks.js';
import { loadSystems } from './sys/index.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
export function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const e = Math.min(SUF.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, e);
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUF[e];
}
let started = false;
const clock = new THREE.Clock();
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowQ = isTouch;

// ================================================================ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowQ ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfeaff, 110, 560);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 6000);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xd8b88a, 0.35);
scene.add(hemi);
const sunL = new THREE.DirectionalLight(0xfff0d8, 2.0);
sunL.castShadow = true;
sunL.shadow.mapSize.set(lowQ ? 1024 : 2048, lowQ ? 1024 : 2048);
Object.assign(sunL.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 });
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
scene.add(sunL, sunL.target);

const sound = new Sound();
const post = makeComposer(renderer, scene, camera, { lowQuality: lowQ });
const fx = makeParticles(scene);
const juice = makeJuice(post.grade);
fx.setScale(innerHeight);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); fx.setScale(innerHeight);
});

// ================================================================ CrazyGames SDK (safe no-op when absent)
const CG = { sdk: null };
async function cgInit() {
  const sdk = window.CrazyGames && window.CrazyGames.SDK; if (!sdk) return;
  try {
    await sdk.init(); if (sdk.environment === 'disabled') return;
    CG.sdk = sdk;
    const applyMute = () => sound.setMuted(!!sdk.game.settings.muteAudio || !S.sound);
    sdk.game.addSettingsChangeListener(applyMute); CG.applyMute = applyMute;
    sdk.game.loadingStart();
  } catch (e) { CG.sdk = null; }
}
const cg = (fn, ...a) => { try { if (CG.sdk) CG.sdk.game[fn](...a); } catch { } };
let playing = false;
function setPlaying(v) { if (v === playing) return; playing = v; cg(v ? 'gameplayStart' : 'gameplayStop'); }
function rewardedAd() {
  return new Promise(res => {
    if (!CG.sdk) { toast('(ad skipped in dev)', ''); return res(true); }
    sound.setMuted(true);
    try {
      CG.sdk.ad.requestAd('rewarded', {
        adStarted: () => { },
        adFinished: () => { restoreMute(); res(true); },
        adError: () => { restoreMute(); toast('No ad available right now', 'red'); res(false); },
      });
    } catch { restoreMute(); res(false); }
  });
}
function midgameAd() { if (!CG.sdk) return; sound.setMuted(true); try { CG.sdk.ad.requestAd('midgame', { adFinished: restoreMute, adError: restoreMute }); } catch { restoreMute(); } }
function restoreMute() { if (CG.applyMute) CG.applyMute(); else sound.setMuted(!S.sound); }

// ================================================================ save
const SAVE_KEY = 'tsunamiHeist_v2';
const S = { cash: 0, speedLv: 0, slots: C.SLOTS_START, rebirths: 0, bat: 0, peds: Array(C.SLOTS_MAX).fill(null), index: {}, total: 0, last: Date.now(), boostUntil: 0, lockLv: 0, sound: true, tut: 0, steals: 0, sens: 1, world: 0, maxWorld: 0 };
function storage() { try { return CG.sdk ? CG.sdk.data : localStorage; } catch { return null; } }
function load() {
  try { const raw = storage()?.getItem(SAVE_KEY); if (raw) Object.assign(S, JSON.parse(raw)); } catch { }
  S.peds = Array.from({ length: C.SLOTS_MAX }, (_, i) => S.peds[i] || null);
}
function save() { S.last = Date.now(); try { storage()?.setItem(SAVE_KEY, JSON.stringify(S)); } catch { } }
setInterval(() => { if (started) save(); }, 5000);
addEventListener('visibilitychange', () => { if (document.hidden && started) save(); });

// ================================================================ world
const world = buildWorld(scene, renderer);
const plots = world.plots;
// static world pieces with their z-extent, for distance culling along the long track
let statics = [];
const persistentStatics = scene.children.filter(o => o !== world.trackRoot && !o.isInstancedMesh && (o.isMesh || o.isGroup || o.isSprite) && !plots.some(P => P.group === o));
function rebuildStatics() {
  statics = [...persistentStatics, ...world.trackRoot.children.filter(o => !o.isInstancedMesh)].map(o => {
    const b = new THREE.Box3().setFromObject(o);
    return { o, z0: b.min.z, z1: b.max.z };
  }).filter(s => isFinite(s.z0) && s.z1 - s.z0 < 400);
}
rebuildStatics();
function tameEnv(root) { root.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (m.isMeshStandardMaterial && m.metalness < 0.5) m.envMapIntensity = 0.35; }); }
const hz = world.hz;
sunL.position.copy(world.sunDir).multiplyScalar(120);
tameEnv(scene);
const lightDir = world.sunDir.clone();
let look = { fog: null, fogAmt: 0 };
const waveMeshes = [makeWave(scene, world.sunDir), makeWave(scene, world.sunDir)];

const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x5dff86, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
const arrow = new THREE.Group();
{ const m = toon(0x5dff86, { emissive: 0x22aa44, ei: 1.2 }); const c = mesh(G.cone, m, 0, 0, 0.6, 0.45, 1.0, 0.45); c.rotation.x = Math.PI / 2; arrow.add(c); arrow.add(mesh(G.box, m, 0, 0, -0.2, 0.3, 0.2, 0.9)); }
scene.add(arrow); arrow.visible = false;

// ================================================================ creatures on pedestals
function income(id, mut, w = 0) { return C.CREATURE_BY_ID[id].inc * (C.MUT_BY_ID[mut || ''] || C.MUT_BY_ID['']).mult * C.WORLDS[w || 0].mult; }
// system bonuses (achievements, sets, events, quest/reward boosts) are capped together so they can't snowball
const SYS_INCOME_CAP = 2.75;
function incMult() { return (1 + 0.5 * S.rebirths) * (Date.now() < S.boostUntil ? 2 : 1) * Math.min(SYS_INCOME_CAP, bus.mul('income')); }
function displayName(id, mut, w = 0) { const m = C.MUT_BY_ID[mut || '']; return (w ? C.WORLDS[w].emoji + ' ' : '') + (m.name ? m.name + ' ' : '') + C.CREATURE_BY_ID[id].name; }

function setPed(plot, i, data) {
  const ped = plot.pedestals[i];
  if (ped.mesh) { ped.group.remove(ped.mesh); ped.mesh = null; }
  if (ped.label) { ped.group.remove(ped.label); ped.label = null; }
  ped.creature = data ? { id: data.id, mut: data.mut || '', w: data.w || 0 } : null;
  ped.stored = data?.stored || 0;
  ped.ring.material.opacity = 0;
  if (!data) return;
  const def = C.CREATURE_BY_ID[data.id];
  const m = makeCreature(def, data.mut); m.position.y = 0.88; m.scale.setScalar(1.25); m.rotation.y = ped.faceYaw; ped.group.add(m); ped.mesh = m;
  if (plot !== plots[C.PLAYER_PLOT]) m.traverse(o => { o.castShadow = false; }); // other bases: no shadow pass for their creatures
  const lab = makeLabel(pedLines(ped), { scale: 1.05 }); lab.position.y = m.userData.top * 1.25 + 2.8; ped.group.add(lab); ped.label = lab; ped.lastDrawn = -1;
  const R = C.RARITIES[def.r]; ped.ring.material.color.set(R.glow);
}
function pedLines(ped) {
  const def = C.CREATURE_BY_ID[ped.creature.id], R = C.RARITIES[def.r];
  const L = [{ text: displayName(ped.creature.id, ped.creature.mut, ped.creature.w), color: R.color, size: 32, rainbow: R.rainbow }, { text: '$' + fmt(income(ped.creature.id, ped.creature.mut, ped.creature.w)) + '/s', color: '#7dff9a', size: 28 }];
  if (ped.showStored) L.push({ text: '$' + fmt(ped.stored), color: '#ffd23f', size: 34 });
  return L;
}
function syncPlayerPeds() {
  const P = plots[C.PLAYER_PLOT];
  P.pedestals.forEach((ped, i) => { ped.showStored = true; ped.group.visible = i < S.slots; setPed(P, i, S.peds[i]); });
}
function pedToSave(i) { const ped = plots[C.PLAYER_PLOT].pedestals[i]; S.peds[i] = ped.creature ? { id: ped.creature.id, mut: ped.creature.mut, w: ped.creature.w || 0, stored: ped.stored } : null; }

// ================================================================ actors
const actors = [];
function makeActor({ name, color, plot, isBot, hat }) {
  const obj = makeCharacter(color, { hat }); scene.add(obj);
  const tag = makeLabel([{ text: name, color: '#fff', size: 30 }], { scale: 0.85 }); tag.position.y = 3.6; obj.add(tag);
  const a = { name, color, plot, isBot, obj, tag, pos: obj.position, vy: 0, onGround: true, yaw: 0, kb: new V3(), vel: new V3(), speedLv: 0, carry: null, stun: 0, swingCd: 0, swingAnim: 0, pendingHit: 0, hitImmune: 0, hazardCd: 0, swept: 0, dead: 0, cash: 0, ai: {}, thief: false, bat: C.BATS[0], batIdx: 0, speedScale: 1, dustT: 0 };
  plot.owner = a; actors.push(a);
  obj.position.copy(plot.doorIn);
  return a;
}
function equipBat(a, idx) { a.batIdx = idx; a.bat = C.BATS[idx]; setBat(a.obj, a.bat); }
function setThiefTag(a, on) {
  if (a.thief === on) return; a.thief = on;
  const base = a === player ? [{ text: 'YOU', color: '#5dff86', size: 30 }] : [{ text: a.name, color: '#fff', size: 30 }];
  a.tag.userData.draw(on ? [{ text: '🚨 THIEF', color: '#ff4f6a', size: 26 }, ...base] : base);
  a.tag.position.y = on ? 3.9 : 3.6;
}

const player = makeActor({ name: 'You', color: 0x2fa6ff, plot: plots[C.PLAYER_PLOT], isBot: false, hat: 'cap' });
const playerLight = new THREE.PointLight(0xfff0dd, 0, 22, 1.6); playerLight.position.set(0, 4.5, 2); player.obj.add(playerLight);
player.tag.userData.draw([{ text: 'YOU', color: '#5dff86', size: 30 }]);
const bots = [];
{
  const names = [...C.BOT_NAMES].sort(() => Math.random() - 0.5);
  const hats = HATS.filter(h => h !== 'cap').sort(() => Math.random() - 0.5);
  let k = 0;
  plots.forEach((P, i) => {
    if (i === C.PLAYER_PLOT) return;
    const b = makeActor({ name: names[k], color: C.PLOT_COLORS[i], plot: P, isBot: true, hat: hats[k % hats.length] });
    b.speedLv = 1 + Math.floor(Math.random() * 4);
    equipBat(b, Math.random() < 0.6 ? 1 : 0);
    initBot(b); bots.push(b); k++;
  });
}
function seedBotPlots() {
  for (const b of bots) {
    for (let i = 0; i < 8; i++) setPed(b.plot, i, null);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.random() < 0.15 ? 2 : Math.random() < 0.5 ? 1 : 0;
      setPed(b.plot, i, { id: pick(C.BY_RARITY[r]).id, mut: Math.random() < 0.08 ? 'gold' : '', w: C.WORLD });
    }
    b.speedLv = C.WORLDS[C.WORLD].botLv + Math.floor(Math.random() * 4);
    b.plot.pedestals.forEach((p, i) => p.group.visible = i < 8);
  }
  plots.forEach((P, i) => P.signLab.userData.draw(i === C.PLAYER_PLOT ? [{ text: '⭐ YOUR BASE ⭐', color: '#5dff86', size: 46 }] : [{ text: P.owner.name + "'s base", color: '#fff', size: 40 }]));
  const P = plots[C.PLAYER_PLOT];
  beacon.position.set(P.cx, 30, P.cz); scene.add(beacon);
}

// ================================================================ wild creatures
const wilds = [];
let pads = [];
const discGeo = new THREE.RingGeometry(1.2, 1.8, 28);
function initPads() {
  for (const p of pads) scene.remove(p.disc);
  pads = world.pads.map(p => {
    const pos = new V3(p.x, 0, p.z);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: C.RARITIES[p.zone].glow, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.rotation.x = -Math.PI / 2; disc.position.copy(pos); disc.position.y = 0.06; scene.add(disc);
    return { zone: p.zone, pos, item: null, respawn: 0, disc };
  });
}
initPads();
function rollMut(bonus = 1) {
  bonus *= Math.min(4, bus.mul('luck')); // luck sources stack, cap so mutations stay special
  const r = Math.random();
  if (r < 0.008 * bonus) return 'rainbow';
  if (r < 0.033 * bonus) return 'diamond';
  if (r < 0.103 * bonus) return 'gold';
  return '';
}
const beamGeo = new THREE.CylinderGeometry(0.5, 0.9, 40, 12, 1, true);
function spawnWild(id, mut, pos, pad = null, ttl = 0, wv = C.WORLD) {
  const def = C.CREATURE_BY_ID[id], R = C.RARITIES[def.r];
  const m = makeCreature(def, mut); m.position.copy(pos); m.scale.setScalar(1.45); scene.add(m);
  const lab = makeLabel([{ text: displayName(id, mut, wv), color: R.color, size: 32, rainbow: R.rainbow }, rarityLine(def), { text: '$' + fmt(income(id, mut, wv)) + '/s', color: '#7dff9a', size: 26 }], { scale: 0.8 });
  lab.position.set(pos.x, m.userData.top * 1.45 + 1.9, pos.z); scene.add(lab);
  let beam = null;
  if (def.r >= 3 || mut) {
    beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: mut ? C.MUT_BY_ID[mut].color : R.glow, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.set(pos.x, 20, pos.z); scene.add(beam);
  }
  const w = { id, mut, w: wv, pos: pos.clone(), mesh: m, label: lab, beam, pad, ttl, seed: Math.random() * 10 };
  if (pad) pad.item = w;
  wilds.push(w);
  return w;
}
function removeWild(w) {
  scene.remove(w.mesh, w.label); if (w.beam) scene.remove(w.beam);
  const i = wilds.indexOf(w); if (i >= 0) wilds.splice(i, 1);
  if (w.pad) { w.pad.item = null; w.pad.respawn = rand(14, 28); }
}
function fillPad(pad) {
  let r = pad.zone;
  if (r < 6 && Math.random() < 0.04) r++;
  spawnWild(pick(C.BY_RARITY[r]).id, rollMut(), pad.pos, pad);
}
function refillPads(all) { for (const p of pads) if (!p.item && (all || p.respawn <= 0)) fillPad(p); }

// ================================================================ carrying, placing, stealing
function giveCarry(a, id, mut, from = null, wv = C.WORLD) {
  const m = makeCreature(C.CREATURE_BY_ID[id], mut); m.scale.setScalar(0.85);
  a.obj.userData.hold.add(m);
  a.carry = { id, mut, w: wv, from, mesh: m };
  if (from) setThiefTag(a, true);
}
function clearCarry(a) {
  if (!a.carry) return null;
  a.obj.userData.hold.remove(a.carry.mesh);
  const c = a.carry; a.carry = null; setThiefTag(a, false);
  return c;
}
function freeSlot(plot) {
  const n = plot === plots[C.PLAYER_PLOT] ? S.slots : 8;
  for (let i = 0; i < n; i++) if (!plot.pedestals[i].creature) return i;
  return -1;
}
function dropCarry(a, reason) {
  const c = clearCarry(a); if (!c) return;
  if (c.from) {
    const P = c.from.plot;
    const i = P.pedestals[c.from.ped].creature ? freeSlot(P) : c.from.ped;
    if (i >= 0 && reason !== 'hit') { setPed(P, i, { id: c.id, mut: c.mut, w: c.w }); if (P === plots[C.PLAYER_PLOT]) { pedToSave(i); toast(`✅ ${displayName(c.id, c.mut, c.w)} is back in your base!`, 'gold'); } }
    else if (reason === 'hit') spawnWild(c.id, c.mut, a.pos.clone().setY(0), null, 25, c.w);
    return c;
  }
  if (reason === 'hit') spawnWild(c.id, c.mut, a.pos.clone().setY(0).add(new V3(rand(-1, 1), 0, rand(-1, 1))), null, 25, c.w);
  return c;
}
function grabWild(a, w) {
  if (a.carry || !wilds.includes(w)) return false;
  removeWild(w);
  giveCarry(a, w.id, w.mut, null, w.w);
  if (a === player) {
    const r = C.CREATURE_BY_ID[w.id].r;
    const rc = new THREE.Color(C.RARITIES[r].color).getHex();
    sound.grab(r); fx.sparkle(w.pos, rc, 20 + r * 8);
    if (r >= 2) { fx.pillar(w.pos, rc, Math.min(lowQ ? 24 : 50, 12 + r * 7), 0.8 + r * 0.12); if (r >= 4) { juice.flash(0.18, rc); shake = Math.max(shake, 0.15); } }
    float('GRABBED!', a.pos, '#fff');
    if (S.tut === 0) S.tut = 1;
  }
  bus.emit('grab', a, w);
  return true;
}
function steal(a, plot, i) {
  const ped = plot.pedestals[i];
  if (a.carry || !ped.creature || plot.locked) return false;
  const { id, mut, w: cw } = ped.creature;
  if (plot === plots[C.PLAYER_PLOT]) {
    const stored = ped.stored; setPed(plot, i, null); pedToSave(i);
    if (stored > 0) S.cash += stored;
    toast(`🚨 ${a.name} is stealing your ${displayName(id, mut, cw)}!`, 'red'); sound.alarm();
  } else {
    setPed(plot, i, null);
    if (plot.owner && plot.owner.isBot) plot.owner.ai.theft = { by: a, t: 0 };
  }
  giveCarry(a, id, mut, { plot, ped: i }, cw);
  if (a === player) { sound.grab(C.CREATURE_BY_ID[id].r); toast(`😈 Stealing ${displayName(id, mut, cw)} — run home!`, 'gold'); }
  bus.emit('steal', a, plot, i, { id, mut, w: cw });
  return true;
}
function placeCarry(a) {
  const P = a.plot, i = freeSlot(P);
  if (i < 0 || !a.carry) return false;
  const c = clearCarry(a);
  setPed(P, i, { id: c.id, mut: c.mut, w: c.w });
  if (a === player) {
    pedToSave(i); sound.place();
    const pr_ = C.CREATURE_BY_ID[c.id].r, pc = new THREE.Color(C.RARITIES[pr_].color).getHex();
    fx.burst(P.pedestals[i].pos, pc, 40); fx.ring(P.pedestals[i].pos, pc, 3.5, 0.5, true);
    if (pr_ >= 3) fx.pillar(P.pedestals[i].pos, pc, lowQ ? 18 : 32, 1);
    const key = c.mut || 'n', entry = S.index[c.id] || (S.index[c.id] = {});
    const fresh = !entry[key];
    entry[key] = 1;
    if (c.from) { S.steals++; toast(`💰 Stolen ${displayName(c.id, c.mut, c.w)} from ${c.from.plot.owner.name}!`, 'gold'); }
    if (fresh) showNewCard(c.id, c.mut, c.w);
    else float('+$' + fmt(income(c.id, c.mut, c.w) * incMult()) + '/s', P.pedestals[i].pos, '#7dff9a');
    if (C.CREATURE_BY_ID[c.id].r >= 4) cg('happytime');
    if (S.tut === 1) S.tut = 2;
    bus.emit('place', a, c, i, fresh);
    save();
  } else bus.emit('place', a, c, i, false);
  return true;
}
function sell(i) {
  const P = plots[C.PLAYER_PLOT], ped = P.pedestals[i];
  if (!ped.creature) return;
  const price = Math.floor(income(ped.creature.id, ped.creature.mut, ped.creature.w) * 25);
  S.cash += price + ped.stored;
  float('+$' + fmt(price + ped.stored), ped.pos, '#ffd23f'); fx.cash(ped.pos); fx.coins(ped.pos, lowQ ? 10 : 18);
  toast(`Sold ${displayName(ped.creature.id, ped.creature.mut, ped.creature.w)} for $${fmt(price)}`);
  bus.emit('sell', i, price, { ...ped.creature });
  setPed(P, i, null); pedToSave(i); sound.cash(true); save();
}

// ================================================================ hazards
const inRect = (r, x, z) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
const iceAt = z => hz.ice.some(r => z <= r.z0 && z > r.z1);
function pitAt(x, z) { for (const p of hz.pits) if (z > p.minZ && z < p.maxZ && Math.abs(x - p.bridgeX) > p.bridgeW / 2 + 0.2) return p; return null; }
function slowAt(x, z) { for (const s of hz.slow) if (inRect(s, x, z)) return s.mul; return 1; }
function lavaAt(x, z) { return hz.lava.some(l => inRect(l, x, z)); }
// does an actor heading (dx,dz) need to jump soon? (bots)
function needJump(a, dx, dz) {
  // plan for bots: { jump: take off now?, cap: max speed that gives a safe landing }
  if (a.pos.z > -1) return null;
  const l = Math.hypot(dx, dz); if (l < 0.2) return null;
  const ux = dx / l, uz = dz / l;
  const sp = Math.hypot(a.vel.x, a.vel.z);
  const bad = (x, z) => { if (lavaAt(x, z)) return true; const p = pitAt(x, z); return !!p && !p.gap; };
  const blocked = (x, z) => hz.hurdles.some(h => x > h.minX - 0.5 && x < h.maxX + 0.5 && z > h.minZ - 0.4 && z < h.maxZ + 0.4);
  let hd = -1, kind = '';
  for (let d = 0.3; d <= 14; d += 0.3) { const x = a.pos.x + ux * d, z = a.pos.z + uz * d; if (bad(x, z)) { hd = d; kind = 'bad'; break; } if (blocked(x, z)) { hd = d; kind = 'wall'; break; } }
  if (hd < 0) return null;
  const trig = v => 0.6 + v * 0.045;
  const safeAt = v => { // take off `trig` before the hazard, land ~0.75s later; sample the whole landing window
    const t0 = Math.max(0, hd - trig(v));
    for (let d = t0 + v * 0.62; d <= t0 + v * 0.85 + 1; d += 0.5) if (bad(a.pos.x + ux * d, a.pos.z + uz * d)) return false;
    return true;
  };
  let cap = 6;
  if (kind === 'bad') { for (let v = Math.max(sp, 8); v >= 6; v -= 1) if (safeAt(v)) { cap = v; break; } }
  else cap = 99;
  return { jump: a.onGround && hd <= trig(sp), cap };
}
function hazardHits(a, dt) {
  a.hazardCd = Math.max(0, a.hazardCd - dt);
  if (a.pos.z > -1 || a.hazardCd > 0) return;
  for (const p of hz.pendulums) {
    if (Math.abs(a.pos.z - p.z) > 2.2) continue;
    for (const v of p.pivots) {
      const lx = v.px + Math.sin(v.angle) * p.len, ly = p.pivotY - Math.cos(v.angle) * p.len;
      if (Math.abs(a.pos.x - lx) < 1.4 && a.pos.y < ly + 0.9 && a.pos.y + 2.6 > ly - 0.9) {
        const vel = Math.cos(clock.elapsedTime * p.speed + p.phase + v.off);
        a.kb.set(Math.sign(vel || 1) * 24, 0, rand(-4, 4)); a.vy = 9; a.onGround = false; a.stun = 1.0; a.hazardCd = 1.2;
        const lost = dropCarry(a, 'hit');
        if (a === player) { shake = 0.5; sound.bonk(false); fx.hit(a.pos, 0xffffff); if (lost) toast(`🪵 Log smash! You dropped ${displayName(lost.id, lost.mut, lost.w)}`, 'red'); }
        return;
      }
    }
  }
  for (const c of hz.crabs) {
    if (Math.abs(a.pos.z - c.z) < 2 && Math.abs(a.pos.x - c.x) < 2.3 && a.pos.y < 1.4) {
      a.kb.set(c.dir * 16, 0, rand(-6, 6)); a.vy = 6; a.onGround = false; a.stun = 0.6; a.hazardCd = 1;
      if (a === player) { shake = 0.3; sound.bonk(false); fx.hit(a.pos, 0xff6a4a); toast('🦀 Pinched!', 'red'); }
      return;
    }
  }
}

// ================================================================ movement + collisions
const RAD = 0.75;
function region(p) {
  for (const P of plots) if (P.contains(p.x, p.z)) return { t: 'plot', p: P };
  if (p.z < -0.5) return { t: Math.abs(p.x) > C.TRACK_HALF ? 'shelter' : 'track' };
  return { t: 'plaza' };
}
function inShelter(a) { return a.pos.z < -0.5 && Math.abs(a.pos.x) > C.TRACK_HALF + 0.3; }
function collide(a) {
  const p = a.pos;
  for (const c of world.colliders) {
    if (c.gate && (!c.active || c.plot === a.plot.idx)) continue;
    if (c.h !== undefined && p.y > c.h - 0.05) continue;
    if (p.x < c.minX - RAD || p.x > c.maxX + RAD || p.z < c.minZ - RAD || p.z > c.maxZ + RAD) continue;
    const nx = clamp(p.x, c.minX, c.maxX), nz = clamp(p.z, c.minZ, c.maxZ);
    let dx = p.x - nx, dz = p.z - nz; const d2 = dx * dx + dz * dz;
    if (d2 >= RAD * RAD) continue;
    if (d2 < 1e-6) {
      const opts = [[c.minX - RAD - p.x, 0], [c.maxX + RAD - p.x, 0], [0, c.minZ - RAD - p.z], [0, c.maxZ + RAD - p.z]];
      opts.sort((u, v) => Math.abs(u[0] + u[1]) - Math.abs(v[0] + v[1]));
      p.x += opts[0][0]; p.z += opts[0][1];
    } else { const d = Math.sqrt(d2); p.x = nx + dx / d * RAD; p.z = nz + dz / d * RAD; }
  }
}
// ---- speed chasms: crossing a lip throws you over. Your speed LEVEL decides (not carry or the moment's speed):
// high enough → you always make it, too low → you always fall short.
function canClearGap(a, G) { return C.speedOf(a.speedLv) * bus.mul('speed', a) >= C.speedOf(G.req) - 0.01; }
function gapBlocks(a, z0, z1) { // is there a chasm between z0 and z1 this actor can't jump?
  const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
  return C.GAPS.some(G => G.z0 > lo && G.z1 < hi && !canClearGap(a, G));
}
function gapLaunch(a, pz) {
  if (a.gapFly > 0 || a.pos.y > 2.6 || a.pos.z > -1) return;
  const G = C.gapAt(a.pos.z); if (!G || C.gapAt(pz)) return;
  const vz = Math.abs(a.vel.z); if (vz < 3) return; // walking off the edge: just fall
  const dir = a.pos.z < pz ? -1 : 1, ok = canClearGap(a, G);
  a.vy = C.GAP_VY; a.onGround = false; a.gapFly = C.GAP_AIR + 0.4; a.vel.x *= 0.3;
  a.vel.z = dir * (ok ? Math.max(vz, C.speedOf(G.req) + 0.5) : Math.min(vz, G.len / C.GAP_AIR * 0.8));
  if (a.pos.distanceToSquared(camera.position) < 3600) fx.jumpPuff(a.pos, dustColor(a), lowQ ? 4 : 8);
  if (a === player) {
    sound.jump(); shake = Math.max(shake, 0.15);
    if (!ok) toast(`⚡ Too slow! You need Speed Lv ${G.req} for this jump`, 'red');
  }
  bus.emit('gapJump', a, G, ok);
}
// player: warn before a chasm you can't clear + colour the signs (green = you make it)
let gapWarned = null;
function updateGaps() {
  for (const G of C.GAPS) {
    const ok = canClearGap(player, G);
    if (G._ok !== ok && G.signs) {
      G._ok = ok;
      for (const sg of G.signs) sg.userData.draw([{ text: `⚡ SPEED LV ${G.req}`, color: ok ? '#5dff86' : '#ff5a6e', size: 56 }, { text: ok ? 'JUMP!' : 'TOO SLOW', color: '#fff', size: 30 }]);
    }
    const d = player.pos.z - G.z0;
    if (!ok && d > 0 && d < 45 && player.vel.z < -4 && gapWarned !== G) { gapWarned = G; toast(`⚡ Speed Lv ${G.req} needed to jump the chasm ahead! Upgrade speed in the shop [B]`, 'red'); }
  }
  if (player.pos.z > -1) gapWarned = null;
}
// ---- closed houses: the walls + roof of the base you're in (or the camera is in) fade out
function updateShells(dt) {
  for (const P of plots) {
    if (!P.shell) continue;
    const lx = (player.pos.x - P.cx) * P.dir, lz = player.pos.z - P.cz;
    const inside = P.contains(player.pos.x, player.pos.z) || (lx > 10 && lx < C.PLOT_W / 2 + 4 && Math.abs(lz) < 6)
      || (Math.abs(camera.position.x - P.cx) < C.PLOT_W / 2 + 2 && Math.abs(camera.position.z - P.cz) < C.PLOT_D / 2 + 2 && camera.position.y < 11.5);
    const tgt = inside ? 0 : 1, op = P.shellOp ?? 1;
    const n = op + (tgt - op) * (1 - Math.exp(-10 * dt)), v = Math.abs(n - tgt) < 0.01 ? tgt : n;
    if (v === op) continue;
    P.shellOp = v; P.shell.visible = v > 0.01;
    const m = P.shellMat, tr = v < 0.99;
    if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
    m.opacity = v;
  }
}
function dustColor(a) { const b = world.biomeAt(a.pos.z); return b === 'glacier' ? 0xffffff : b === 'volcano' ? 0x6a5a58 : b === 'abyss' ? 0x9a7ad8 : a.pos.z > 0 ? 0xe8dcc4 : 0xe8d2a0; }
function moveActor(a, dx, dz, dt, jump, faceYaw = null) {
  if (a.swept > 0 || a.dead > 0) return;
  const ctl = a.stun > 0 ? 0 : 1;
  const ground = a.onGround && a.pos.y > -0.5;
  // speed upgrades only count out on the track; the plaza is walked at base speed
  const sp = C.speedOf(a.pos.z <= 0 ? a.speedLv : 0) * C.carryMul(a.carry) * (ground ? slowAt(a.pos.x, a.pos.z) : 1) * (a.speedScale ?? 1) * bus.mul('speed', a);
  const tx = dx * sp * ctl, tz = dz * sp * ctl;
  const slip = ground && iceAt(a.pos.z);
  const k = 1 - Math.exp(-(ground ? (slip ? 2.2 : 14) : 4) * dt);
  if (a.gapFly > 0) { a.gapFly -= dt; a.vel.x += (tx * 0.3 - a.vel.x) * k * 0.5; } // ramp flight: momentum is locked, a bit of side steering
  else { a.vel.x += (tx - a.vel.x) * k; a.vel.z += (tz - a.vel.z) * k; }
  if (jump && a.onGround && ctl && a.pos.y > -0.3) { a.vy = 12; a.onGround = false; if (a === player) sound.jump(); if (a.pos.distanceToSquared(camera.position) < 3600) fx.jumpPuff(a.pos, dustColor(a), lowQ ? 3 : 5); }
  a.vy -= 32 * dt;
  const pz = a.pos.z;
  a.pos.x += (a.vel.x + a.kb.x) * dt; a.pos.z += (a.vel.z + a.kb.z) * dt; a.pos.y += a.vy * dt;
  gapLaunch(a, pz);
  const wasAir = !a.onGround, vyLand = a.vy;
  if (a.pos.y <= 0) {
    const overPit = !!pitAt(a.pos.x, a.pos.z);
    if (!overPit && a.pos.y > -0.6) {
      a.pos.y = 0; a.vy = 0; a.onGround = true; a.gapFly = 0;
      // landing puff, bigger for harder landings
      if (wasAir && vyLand < -6 && a.pos.distanceToSquared(camera.position) < 3600) {
        const st = clamp(-vyLand / 16, 0.5, 1.4);
        fx.land(a.pos, dustColor(a), st, lowQ ? 6 : 12);
        if (a === player && st > 1) shake = Math.max(shake, 0.12);
      }
    }
    else a.onGround = false; // falling into the abyss
  }
  if (a.pos.y < -3) { kill(a, 'fall'); return; }
  a.kb.multiplyScalar(Math.exp(-5 * dt));
  collide(a);
  if (a.onGround && a.pos.y > -0.1 && lavaAt(a.pos.x, a.pos.z)) { kill(a, 'lava'); return; }
  hazardHits(a, dt);
  const hs = Math.hypot(a.vel.x, a.vel.z);
  const want = faceYaw !== null ? faceYaw : hs > 0.8 ? Math.atan2(a.vel.x, a.vel.z) : null;
  if (want !== null) { let d = want - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); a.yaw += d * (1 - Math.exp(-16 * dt)); }
  a.obj.rotation.y = a.yaw;
  a.stun = Math.max(0, a.stun - dt); a.swingCd = Math.max(0, a.swingCd - dt); a.swingAnim = Math.max(0, a.swingAnim - dt / 0.38); a.hitImmune = Math.max(0, a.hitImmune - dt);
  if (a.pendingHit > 0) { a.pendingHit -= dt; if (a.pendingHit <= 0) resolveHit(a); }
  animateCharacter(a.obj, dt, hs, { carrying: !!a.carry, swing: a.swingAnim, stun: a.stun, air: !a.onGround });
  // running dust
  if (ground && hs > 6 && a.pos.distanceToSquared(camera.position) < 3600) {
    a.dustT -= dt;
    if (a.dustT <= 0) {
      const sp01 = clamp((hs - 6) / 40, 0, 1), col = dustColor(a);
      a.dustT = 0.075 - sp01 * 0.03; fx.dust(a.pos, col);
      if (!lowQ || a === player) fx.kick(a.pos, col, a.vel.x, a.vel.z, sp01, a === player && !lowQ ? 2 : 1);
    }
  }
}
function routeNext(a, tgt) {
  const p = a.pos, rf = region(p), rt = region(tgt);
  if (rf.t === 'plot' && rt.t === 'plot' && rt.p === rf.p) return tgt;
  if (rf.t === 'plot') { const P = rf.p; return Math.abs(p.z - P.cz) > 3 ? P.doorIn : P.doorOut; }
  if (rf.t === 'shelter') {
    if (rt.t === 'shelter' && Math.abs(tgt.z - p.z) < 6 && Math.sign(tgt.x) === Math.sign(p.x)) return tgt;
    return new V3(Math.sign(p.x) * 12, 0, p.z);
  }
  if (rf.t === 'track') {
    if (rt.t === 'track') return tgt;
    if (rt.t === 'shelter') return Math.abs(p.z - tgt.z) > 3 ? new V3(Math.sign(tgt.x) * 13, 0, tgt.z) : tgt;
    if (p.z < -1) return new V3(clamp(p.x, -13, 13), 0, 2);
  }
  if (rt.t === 'plot') {
    const P = rt.p, lx = (p.x - P.cx) * P.dir;
    if (Math.abs(p.z - P.cz) < 3.5 && lx > 7 && lx < 22) return P.doorIn;
    return P.doorOut;
  }
  if (rt.t === 'track' || rt.t === 'shelter') { if (p.z > -0.5) return new V3(clamp(p.x, -12, 12), 0, -2); return tgt; }
  return tgt;
}
// ---- bats
// bats only work against someone carrying a creature stolen from YOUR base — but then anywhere (chase them down!)
const isThiefOf = (o, a) => o !== a && !!o.carry?.from && o.carry.from.plot === a.plot && !(o.swept > 0) && !(o.dead > 0);
const canSwingAt = a => actors.some(o => isThiefOf(o, a));
let noSwingMsgT = 0;
function swing(a) {
  if (a.swingCd > 0 || a.stun > 0 || a.swept > 0 || a.dead > 0) return false;
  if (!canSwingAt(a)) {
    if (a === player && performance.now() > noSwingMsgT) { noSwingMsgT = performance.now() + 2500; toast('🚫 You can only hit someone who is stealing from you'); }
    return false;
  }
  a.swingCd = a.bat.cd; a.swingAnim = 1; a.pendingHit = 0.13;
  if (a === player || a.pos.distanceTo(player.pos) < 25) sound.whoosh();
  return true;
}
function resolveHit(a) {
  const B = a.bat, fx_ = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  for (const o of actors) {
    if (o === a || o.swept > 0 || o.dead > 0 || o.hitImmune > 0 || !isThiefOf(o, a)) continue;
    const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > B.range || Math.abs(o.pos.y - a.pos.y) > 2.5) continue;
    if (d > 1.3 && (dx * fx_ + dz * fz) / d < 0.35) continue;
    const nx = d > 0.01 ? dx / d : fx_, nz = d > 0.01 ? dz / d : fz;
    o.kb.set(nx * B.knock, 0, nz * B.knock); o.vy = 6 + B.knock * 0.12; o.onGround = false; o.stun = B.stun; o.hitImmune = B.stun + 0.5;
    const lost = dropCarry(o, 'hit');
    fx.hit(o.pos, B.glow ? 0x5af0ff : 0xffe27a);
    const strong = B.knock >= 21, seen = a === player || o === player || o.pos.distanceToSquared(camera.position) < 2500;
    if (seen) fx.impact(o.pos, B.glow ? 0x5af0ff : 0xffe27a, strong);
    if (a === player || o === player) { juice.hitStop(strong ? 0.09 : 0.06); juice.aberr(o === player ? 1 : strong ? 0.7 : 0.45); }
    if (o === player) { shake = 0.45; flashHit(); if (lost) toast(`💥 ${a.name} smacked you! You dropped ${displayName(lost.id, lost.mut, lost.w)}`, 'red'); }
    if (a === player) { float(B.id === 'fists' ? 'POW!' : 'BONK!', o.pos, '#ff6a8a'); shake = Math.max(shake, 0.18); if (lost) toast(`💥 ${o.name} dropped ${displayName(lost.id, lost.mut, lost.w)}!`, 'gold'); }
    if (o.isBot) o.ai.hitBy = { by: a, t: 0 };
    bus.emit('hit', a, o, lost);
    if (a === player || o === player || a.pos.distanceTo(player.pos) < 30) sound.bonk(!!B.metal || !!B.glow);
  }
}

// ================================================================ wave
const W = { state: 'gap', t: 8, z: C.WAVE_SPAWN_Z, type: C.WAVE_TYPES[1], grow: 0, id: 0, lastTick: 0, fronts: [], pending: 0 };
// harder types unlock with speed level OR world; deeper worlds shift the mix towards the nasty ones
function pickWave() {
  const lv = S.speedLv, wi = C.WORLD, stormy = C.WORLDS[wi].look === 'storm';
  const pool = C.WAVE_TYPES.filter(w => (w.minLv == null || lv >= w.minLv || wi >= (w.minWorld ?? 99)));
  const wt = w => w.weight * (w.easy ? Math.max(0.35, 1 - 0.18 * wi) : 1) * (w.hard ? 1 + 0.3 * w.hard * wi : 1) * (w.storm && stormy ? 2 : 1) * (w === W.type && (w.hard || w.double) ? 0.25 : 1);
  let tot = pool.reduce((s, w) => s + wt(w), 0), r = Math.random() * tot;
  for (const w of pool) { r -= wt(w); if (r <= 0) return w; }
  return pool[0];
}
function kill(a, reason) {
  if (a.swept > 0 || a.dead > 0) return;
  if (bus.vetoed('kill', a, reason)) return;
  const c = dropCarry(a, reason);
  bus.emit('kill', a, reason, c);
  const near = a === player || a.pos.distanceToSquared(camera.position) < 6400;
  if (reason === 'wave') { a.swept = 1.6; a.vy = 0; if (near) fx.wipeout(a.pos, lowQ ? 20 : 40); }
  else { a.dead = 1.1; if (reason === 'lava') { a.obj.visible = false; for (let i = 0; i < 4; i++) fx.burst(a.pos, i % 2 ? 0xff5a1a : 0xffc04a, 25); if (near) fx.smoke(a.pos, lowQ ? 10 : 18); } else if (reason === 'fall' && near) fx.swirl(a.pos, 0xc69bff, lowQ ? 16 : 28); }
  if (a === player) { juice.aberr(reason === 'fall' ? 1.4 : 0.9); }
  if (a === player) {
    const f = $('flash'); f.style.background = reason === 'lava' ? '#ff5a1a' : reason === 'fall' ? '#3a1a6a' : '#2a8cff';
    f.style.transition = 'none'; f.style.opacity = 0.75;
    requestAnimationFrame(() => { f.style.transition = 'opacity 1.2s'; f.style.opacity = 0; });
    shake = 0.8;
    if (reason === 'wave') sound.splash(); else if (reason === 'lava') sound.burn(); else sound.fall();
    bigText(reason === 'wave' ? 'WIPED OUT!' : reason === 'lava' ? 'BURNED!' : 'FELL INTO THE ABYSS!', c ? `You lost ${displayName(c.id, c.mut, c.w)}` : '');
    if (c && !c.from && C.CREATURE_BY_ID[c.id].r >= 2) offerKeep(c);
  }
}
function respawn(a) {
  bus.emit('respawn', a);
  a.obj.rotation.x = 0; a.obj.visible = true; a.pos.copy(a.plot.doorIn); a.pos.y = 0; a.vy = 0; a.onGround = true;
  a.vel.set(0, 0, 0); a.kb.set(0, 0, 0); a.stun = 0; if (a.isBot) a.ai.mode = 'idle';
}
function startFront() {
  const i = W.fronts.length;
  W.fronts.push({ z: C.WAVE_SPAWN_Z, grow: 0, mesh: waveMeshes[i] });
  waveMeshes[i].group.visible = true; waveMeshes[i].setColor(W.type.color);
}
function updateWave(dt) {
  if (W.state === 'gap') {
    W.t -= dt;
    if (W.t <= 0) { W.state = 'warn'; W.t = C.WAVE_WARN; W.type = pickWave(); W.lastTick = Math.ceil(W.t); sound.siren(); bus.emit('waveWarn', W.type); }
  } else if (W.state === 'warn') {
    W.t -= dt;
    if (Math.ceil(W.t) !== W.lastTick) { W.lastTick = Math.ceil(W.t); if (player.pos.z < 0) sound.tick(); }
    if (W.t <= 0) {
      W.state = 'run'; W.id++; W.fronts = []; startFront();
      W.pending = W.type.double ? 3.2 : 0;
      bus.emit('waveStart', W.type);
      if (W.type.mega) toast('🌊 MEGA WAVE! 🌊', 'red');
      if (W.type.double) toast('🌊🌊 DOUBLE WAVE — stay hidden! 🌊🌊', 'red');
    }
  } else if (W.state === 'run') {
    if (W.pending > 0) { W.pending -= dt; if (W.pending <= 0) startFront(); }
    for (const f of W.fronts) {
      if (f.done) continue;
      f.z += W.type.speed * C.waveSpeedMul(f.z) * bus.mul('wave', f) * dt; f.grow = Math.min(1, f.grow + dt * 0.6);
      f.mesh.group.position.set(0, 0, f.z);
      const sc = (0.35 + 0.65 * f.grow) * (W.type.tall || 1.45) * bus.mul('waveH', f); // waveH: per-front height (sys/waves.js)
      f.mesh.update(clock.elapsedTime, sc);
      const back = W.type.back || C.WAVE_LETHAL_BACK;
      for (const a of actors) {
        if (a.swept > 0 || a.dead > 0 || a.pos.z > -0.5 || inShelter(a)) continue;
        if (a.pos.z < f.z + 0.8 && a.pos.z > f.z - back) kill(a, 'wave');
      }
      for (let i = wilds.length - 1; i >= 0; i--) { const w = wilds[i]; if (!w.pad && w.pos.z < f.z) removeWild(w); }
      // spray along the crest when visible
      if (Math.abs(f.z - camera.position.z) < 240) for (let k = 0; k < (lowQ ? 2 : 5); k++) fx.spray(rand(-C.TRACK_HALF, C.TRACK_HALF), 12.5 * sc + rand(-1, 1), f.z + 1.5, 0.5);
      if (Math.abs(f.z - camera.position.z) < 160 && Math.random() < 0.6) fx.splash(rand(-C.TRACK_HALF, C.TRACK_HALF), 0.5, f.z + 2, 2, 1);
      if (f.z >= -2) {
        f.done = true; f.mesh.group.visible = false;
        if (player.pos.z < 80) sound.splash();
        for (let k = 0; k < 6; k++) fx.splash(rand(-15, 15), 1, -1, 18, 3);
        refillPads(true);
      }
    }
    W.z = Math.max(...W.fronts.filter(f => !f.done).map(f => f.z), -Infinity);
    if (W.fronts.every(f => f.done) && W.pending <= 0) { W.state = 'gap'; W.t = C.WORLDS[C.WORLD].gap; W.z = C.WAVE_SPAWN_Z; bus.emit('waveEnd'); }
  }
  let near = 0;
  for (const f of W.fronts) if (!f.done) near = Math.max(near, clamp(1 - Math.abs(player.pos.z - f.z) / 260, 0, 1));
  sound.setRumble(near * near);
  sound.setIntensity(W.state === 'warn' ? 0.65 : W.state === 'run' && player.pos.z < 0 && !inShelter(player) ? 0.6 + near * 0.4 : W.state === 'run' ? 0.35 : 0);
}

// ================================================================ input (pointer lock on desktop)
const keys = new Set();
const pressed = new Set();
addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase(); keys.add(k); pressed.add(k);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
  if (k === 'b' && started) togglePanel('panelShop');
  if (k === 'i' && started) togglePanel('panelIndex');
  if (k === 'm' && started) togglePanel('panelWorlds');
  if (started) bus.emit('key', k);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
const cam = { yaw: 0, pitch: 0.32, dist: 13 };
const locked = () => document.pointerLockElement === canvas;
// Pointer lock: if it has never worked in this browser/frame we fall back to drag-to-look.
// Once it HAS worked, a refusal is only Chrome's ~1s cooldown after ESC → keep the overlay and let the player click again.
let lockFailed = false, wasLocked = false, lockTry = 0, lastUnlock = 0;
function showOverlay(msg) {
  if (isTouch || !started || anyPanelOpen()) return;
  $('lockOverlay').querySelector('div').innerHTML = msg;
  $('lockOverlay').classList.remove('hidden');
}
const OVERLAY_MSG = '🖱️ CLICK TO PLAY<small>mouse is locked while playing · ESC to free it · or press L</small>';
function lockFallback() {
  if (wasLocked) { showOverlay('🖱️ CLICK AGAIN<small>the browser needs a second after ESC</small>'); return; }
  if (lockFailed) return;
  lockFailed = true;
  $('lockOverlay').classList.add('hidden'); $('crosshair').classList.add('hidden');
  toast('🖱️ Mouse lock not available here — hold the right mouse button and drag to look (L to retry)');
}
function requestLock() {
  if (isTouch || !started || locked()) return;
  const id = ++lockTry;
  const fail = () => { if (id === lockTry && !locked()) lockFallback(); };
  const go = () => {
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = canvas.requestPointerLock(); if (q && q.catch) q.catch(fail); } catch { fail(); } });
    } catch { try { canvas.requestPointerLock(); } catch { fail(); } }
    setTimeout(fail, 700);
  };
  go();
}
document.addEventListener('pointerlockerror', () => lockFallback());
document.addEventListener('pointerlockchange', () => {
  if (locked()) { wasLocked = true; lockFailed = false; $('lockOverlay').classList.add('hidden'); }
  else { lastUnlock = performance.now(); if (wasLocked) showOverlay(OVERLAY_MSG); }
  $('crosshair').classList.toggle('hidden', !locked());
});
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'l' && started && !locked() && !anyPanelOpen()) { lockFailed = false; requestLock(); } });
let rmb = false, dragMoved = 0;
document.addEventListener('mousemove', e => {
  const s = 0.0024 * (S.sens || 1);
  if (locked()) { cam.yaw -= e.movementX * s; cam.pitch = clamp(cam.pitch + e.movementY * s, -0.25, 1.15); return; }
  if ((lockFailed || rmb) && (rmb || e.buttons & 1) && !isTouch) {
    cam.yaw -= e.movementX * s * 1.6; cam.pitch = clamp(cam.pitch + e.movementY * s * 1.6, -0.25, 1.15);
    dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
  }
});
canvas.addEventListener('mousedown', e => {
  sound.init();
  if (e.button === 2) { rmb = true; return; }
  if (locked()) { if (e.button === 0) pressed.add('f'); return; }
  if (lockFailed) { dragMoved = 0; return; }
  requestLock();
});
addEventListener('mouseup', e => {
  if (e.button === 2) rmb = false;
  if (e.button === 0 && lockFailed && !locked() && e.target === canvas && dragMoved < 6) pressed.add('f');
});
$('lockOverlay').addEventListener('click', () => { sound.init(); lockFailed = false; requestLock(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { cam.dist = clamp(cam.dist + e.deltaY * 0.01, 6, 24); }, { passive: true });
// touch: drag on the canvas to look
let drag = null;
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; sound.init(); });
canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.004, -0.2, 1.15); drag.x = e.clientX; drag.y = e.clientY; });
canvas.addEventListener('pointerup', () => { drag = null; });
const joy = { x: 0, y: 0, id: null };
{
  const el = $('joy'), knob = $('joyKnob');
  const upd = e => {
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = dy; knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
  };
  el.addEventListener('pointerdown', e => { joy.id = e.pointerId; el.setPointerCapture(e.pointerId); upd(e); sound.init(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === joy.id) upd(e); });
  const end = e => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  const hold = (id, key) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pressed.add(key); keys.add(key); }); b.addEventListener('pointerup', () => keys.delete(key)); b.addEventListener('pointerleave', () => keys.delete(key)); };
  hold('mJump', ' '); hold('mAct', 'e'); hold('mSlap', 'f'); hold('mSell', 'x');
}

// ================================================================ UI helpers
function toast(msg, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; const hasEmo = /[\u{1F300}-\u{1FAFF}☀-➿]/u.test(msg);
  d.innerHTML = (hasEmo ? '' : cls === 'gold' ? icon('coin') : cls === 'red' ? icon('warn') : '') + `<span>${iconText(msg)}</span>`;
  const box = $('toasts'); box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), 3200);
}
let bigT = 0;
function bigText(t, sub = '') { const c = $('center'); c.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); c.classList.remove('hidden', 'pop'); void c.offsetWidth; c.classList.add('pop'); bigT = 1.8; }
function flashHit() { const f = $('flash'); f.style.background = '#ff2a3a'; f.style.transition = 'none'; f.style.opacity = 0.35; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; }); }
const floats = [];
function float(text, pos, color = '#fff') {
  const d = document.createElement('div'); d.className = 'float'; d.textContent = text; d.style.color = color;
  $('floats').appendChild(d); floats.push({ d, p: pos.clone().setY(pos.y + 3), life: 1.2 });
}
const _v = new V3();
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; f.p.y += dt * 2.2;
    if (f.life <= 0) { f.d.remove(); floats.splice(i, 1); continue; }
    _v.copy(f.p).project(camera);
    if (_v.z > 1) { f.d.style.display = 'none'; continue; }
    f.d.style.display = ''; f.d.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; f.d.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px';
    f.d.style.opacity = Math.min(1, f.life * 2);
  }
}
const thumbs = new Map();
let thumbR = null, thumbScene, thumbCam;
function thumb(id, mut = '') {
  const key = id + '|' + mut; if (thumbs.has(key)) return thumbs.get(key);
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); thumbR.setSize(180, 180); thumbR.outputColorSpace = THREE.SRGBColorSpace;
    thumbR.toneMapping = THREE.ACESFilmicToneMapping;
    thumbScene = new THREE.Scene(); thumbScene.environment = scene.environment;
    thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x998866, 1.2)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 5); thumbScene.add(d);
    thumbCam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  }
  const m = makeCreature(C.CREATURE_BY_ID[id], mut); thumbScene.add(m);
  const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new V3()), s = b.getSize(new V3());
  const r = Math.max(s.x, s.y, s.z);
  thumbCam.position.set(c.x + r * 0.9, c.y + r * 0.55, c.z + r * 2.0); thumbCam.lookAt(c);
  thumbR.render(thumbScene, thumbCam);
  const url = thumbR.domElement.toDataURL(); thumbScene.remove(m); thumbs.set(key, url); return url;
}
let cardT = 0;
function showNewCard(id, mut, wv = 0) {
  const def = C.CREATURE_BY_ID[id], R = C.RARITIES[def.r];
  let el = $('newCard'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'newCard'; el.className = 'stroke'; el.style.setProperty('--rc', R.color);
  el.innerHTML = `<div class="t1">${icon('sparkle')} NEW CREATURE! ${icon('sparkle')}</div><div class="art"><img src="${thumb(id, mut)}"></div><div class="t2" style="color:${R.color}">${displayName(id, mut, wv)}</div><div class="t3">${rarityGem(R)}<span style="color:${R.color}">${R.name}</span> · <span class="inc">$${fmt(income(id, mut, wv))}/s</span></div>`;
  $('hud').appendChild(el); cardT = 2.6; sound.newCreature(def.r);
}

// ---- panels
function anyPanelOpen() { return [...document.querySelectorAll('.panel')].some(p => !p.classList.contains('hidden')); }
function openPanel(id) {
  for (const p of document.querySelectorAll('.panel')) p.classList.add('hidden');
  $(id).classList.remove('hidden'); setPlaying(false);
  if (locked()) document.exitPointerLock();
  $('lockOverlay').classList.add('hidden');
  if (id === 'panelShop') renderShop(); if (id === 'panelIndex') renderIndex(); if (id === 'panelWorlds') renderWorlds();
}
function closePanels() { for (const p of document.querySelectorAll('.panel')) p.classList.add('hidden'); if (started) { setPlaying(true); requestLock(); } }
function togglePanel(id) { if (!$(id).classList.contains('hidden')) closePanels(); else openPanel(id); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
$('btnShop').onclick = () => openPanel('panelShop');
$('btnIndex').onclick = () => openPanel('panelIndex');
$('btnWorlds').onclick = () => openPanel('panelWorlds');
$('btnSound').onclick = () => { S.sound = !S.sound; restoreMute(); $('btnSound').textContent = S.sound ? '🔊' : '🔇'; };
$('btnBoost').onclick = async () => { if (await rewardedAd()) { S.boostUntil = Math.max(Date.now(), S.boostUntil) + 5 * 60e3; toast('💸 2x CASH for 5 minutes!', 'gold'); sound.buy(); save(); } };
function renderShop() {
  const rows = [];
  const sp = S.speedLv, maxed = sp >= C.SPEED_MAX_LV;
  rows.push({ ic: icon('speed'), bg: '#2fa6ff', t: `Speed  Lv ${sp}${maxed ? ' (MAX)' : ' → ' + (sp + 1)}`, s: `${C.speedOf(sp).toFixed(1)} → ${C.speedOf(sp + 1).toFixed(1)} m/s on the track · faster = deeper zones`, cost: maxed ? null : C.speedCost(sp), buy: () => { S.speedLv++; if (S.tut === 3) S.tut = 4; player.speedLv = S.speedLv; } });
  const nb = C.BATS[S.bat + 1];
  rows.push({ ic: icon('bat'), bg: '#ffb02e', t: nb ? `${nb.name}` : `${C.BATS[S.bat].name} (MAX)`, s: nb ? `Now: ${C.BATS[S.bat].name} · reach ${nb.range}m · knockback ${nb.knock}` : 'Best bat in the game', cost: nb ? nb.cost : null, buy: () => { S.bat++; equipBat(player, S.bat); } });
  const ll = S.lockLv || 0, lmax = ll >= C.LOCK_MAX_LV;
  rows.push({ ic: icon('lock'), bg: '#ff5a6e', t: `Base Lock  Lv ${ll}${lmax ? ' (MAX)' : ' → ' + (ll + 1)}`, s: lmax ? `Your base stays locked ${fmtTime(C.lockTimeOf(ll))}` : `Lock lasts ${fmtTime(C.lockTimeOf(ll))} → ${fmtTime(C.lockTimeOf(ll + 1))}`, cost: lmax ? null : C.lockCost(ll), buy: () => { S.lockLv = ll + 1; } });
  const sl = S.slots, smax = sl >= C.SLOTS_MAX;
  rows.push({ ic: icon('pedestal'), bg: '#8a5cff', t: `Pedestals  ${sl}${smax ? ' (MAX)' : ' → ' + (sl + 1)}`, s: 'Room for more creatures in your base', cost: smax ? null : C.slotCost(sl), buy: () => { S.slots++; syncPlayerPeds(); } });
  for (const f of bus.shopRows) { try { rows.push(...(f() || [])); } catch (e) { console.error('[shopRow]', e); } }
  const rc = C.rebirthCost(S.rebirths);
  rows.push({ ic: icon('rebirth'), bg: '#ff4fa0', t: `Rebirth  (${S.rebirths} → ${S.rebirths + 1})`, s: `+50% income forever. Resets cash & speed, keeps creatures + bat.`, cost: rc, buy: () => { S.rebirths++; S.cash = 0; S.speedLv = 0; player.speedLv = 0; bigText('REBIRTH!', `Income x${(1 + 0.5 * S.rebirths).toFixed(1)}`); setTimeout(midgameAd, 1500); } });
  $('shopRows').innerHTML = rows.map((r, i) => `<div class="row"><div class="ic" style="--icbg:${r.bg}">${r.ic}</div><div class="tx"><b>${r.t}</b><span>${r.s}</span></div>${r.cost === null ? '<button class="btn grey" disabled>MAX</button>' : `<button class="btn ${S.cash >= r.cost ? 'green' : 'grey'}" data-i="${i}">${icon('coin')}${fmt(r.cost)}</button>`}</div>`).join('')
    + `<div class="row"><div class="ic" style="--icbg:#ff4fa0">${icon('boost')}</div><div class="tx"><b>2x Cash · 5 min</b><span>Watch a short ad</span></div><button class="btn pink" id="shopBoost">${icon('play')} FREE</button></div>`
    + `<div class="row"><div class="ic" style="--icbg:#666a7a">${icon('mouse')}</div><div class="tx"><b>Mouse sensitivity</b><span>${(S.sens || 1).toFixed(1)}x</span></div><button class="btn grey small" id="sensDn">−</button><button class="btn grey small" id="sensUp">+</button></div>`;
  $('shopRows').querySelectorAll('button[data-i]').forEach(b => b.onclick = () => {
    const r = rows[+b.dataset.i];
    if (S.cash < r.cost) { sound.deny(); return; }
    S.cash -= r.cost; r.buy(); sound.buy(); bus.emit('buy', r); save(); renderShop();
  });
  $('shopBoost').onclick = () => $('btnBoost').onclick();
  $('sensDn').onclick = () => { S.sens = Math.max(0.3, (S.sens || 1) - 0.1); renderShop(); };
  $('sensUp').onclick = () => { S.sens = Math.min(3, (S.sens || 1) + 0.1); renderShop(); };
}
let idxTab = -1;
function renderIndex() {
  const found = C.CREATURES.filter(c => S.index[c.id]).length;
  $('idxCount').innerHTML = `<div class="progress"><b style="width:${(found / C.CREATURES.length * 100).toFixed(1)}%"></b></div>${found} / ${C.CREATURES.length} discovered · mutations: <span style="color:#ffcc33">●</span> gold <span style="color:#7fe8ff">◆</span> diamond <span style="color:#ff66ff">★</span> rainbow`;
  $('idxTabs').innerHTML = [`<button class="btn small ${idxTab < 0 ? 'gold' : 'grey'}" data-t="-1">All</button>`, ...C.RARITIES.map((R, i) => `<button class="btn small ${idxTab === i ? 'gold' : 'grey'}" data-t="${i}" style="${idxTab === i ? '' : `color:${R.color}`}">${rarityGem(R)}${R.name}</button>`)].join('');
  $('idxTabs').querySelectorAll('button').forEach(b => b.onclick = () => { idxTab = +b.dataset.t; renderIndex(); });
  const list = C.CREATURES.filter(c => idxTab < 0 || c.r === idxTab);
  $('idxGrid').innerHTML = list.map(c => {
    const e = S.index[c.id], R = C.RARITIES[c.r];
    const muts = e ? `<span style="color:${e.gold ? '#ffcc33' : '#555'}">●</span><span style="color:${e.diamond ? '#7fe8ff' : '#555'}">◆</span><span style="color:${e.rainbow ? '#ff66ff' : '#555'}">★</span>` : '';
    return `<div class="card ${e ? '' : 'locked'}" style="border-color:${e ? R.color : 'transparent'};--rc:${R.color}"><div class="art">${e ? `<span class="gemTag">${rarityGem(R)}</span>` : ''}<img src="${thumb(c.id)}"></div><div class="n">${e ? c.name : '???'}</div><div class="r" style="color:${R.color}">${R.name} · $${fmt(c.inc)}/s</div><div class="muts">${muts}</div></div>`;
  }).join('');
}
let adOfferT = 0, adOfferC = null;
function offerKeep(c) {
  adOfferC = c; adOfferT = 6;
  $('adText').innerHTML = `Watch an ad to keep <b style="color:${C.RARITIES[C.CREATURE_BY_ID[c.id].r].color}">${displayName(c.id, c.mut, c.w)}</b> (press <b>K</b>)`;
  $('adOffer').classList.remove('hidden');
}
async function acceptKeep() {
  const c = adOfferC; adOfferT = 0; adOfferC = null; $('adOffer').classList.add('hidden'); if (!c) return;
  if (locked()) document.exitPointerLock();
  if (await rewardedAd()) {
    const i = freeSlot(player.plot);
    if (i >= 0) { const prev = player.carry; player.carry = null; giveCarry(player, c.id, c.mut, null, c.w); placeCarry(player); player.carry = prev; toast(`✅ ${displayName(c.id, c.mut, c.w)} saved to your base!`, 'gold'); }
    else toast('Base is full! Sell something first.', 'red');
  }
  requestLock();
}
$('adNo').onclick = () => { adOfferT = 0; $('adOffer').classList.add('hidden'); };
$('adYes').onclick = acceptKeep;

// ================================================================ player logic
let interaction = null;
let shake = 0;
const tutText = ['Run down the track ⬆ and grab a creature [E]!', 'Bring it home 🏠 before the wave hits!', 'Step on the pedestal to collect 💰', 'Press [B] for the shop: speed reaches rarer zones, bats win fights'];
function updatePlayer(dt) {
  if (player.swept > 0 || player.dead > 0) return;
  let ix = 0, iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iz += 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  ix += joy.x; iz += joy.y;
  const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const dx = ix * cy + iz * sy, dz = -ix * sy + iz * cy;
  // desktop: the character faces where the camera looks (shift-lock style) so bat swings aim at the crosshair
  const face = isTouch || !locked() ? null : cam.yaw + Math.PI;
  moveActor(player, dx, dz, dt, pressed.has(' '), face);
  if (isTouch && l > 0.2 && !drag) {
    const want = Math.atan2(-dx, -dz); let d = want - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 2.2) cam.yaw += d * dt * 0.8;
  }
  if (pressed.has('f')) swing(player);
  if (pressed.has('k') && adOfferT > 0) acceptKeep();

  const P = player.plot, p = player.pos;
  let baseFull = false;
  if (P.contains(p.x, p.z)) {
    if (player.carry) { if (!placeCarry(player)) baseFull = true; }
    for (const ped of P.pedestals) {
      if (!ped.creature || ped.stored < 1) continue;
      if (Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z) < 1.7) {
        const v = Math.floor(ped.stored); S.cash += v; S.total += v; ped.stored -= v;
        float('+$' + fmt(v), ped.pos, '#ffd23f'); sound.cash(v > 100); fx.cash(ped.pos); fx.coins(ped.pos, Math.min(lowQ ? 10 : 18, 4 + Math.floor(Math.log10(v + 1) * 3)));
        if (S.tut === 2) S.tut = 3;
        bus.emit('collect', player, v);
      }
    }
    if (Math.hypot(P.lockPos.x - p.x, P.lockPos.z - p.z) < 1.8 && !P.locked && P.lockCd <= 0) lockPlot(P);
  }
  interaction = null;
  let best = 3.2;
  if (!player.carry) {
    for (const w of wilds) { const d = Math.hypot(w.pos.x - p.x, w.pos.z - p.z); if (d < best) { best = d; interaction = { kind: 'grab', w, text: `<b>[E]</b> Grab ${displayName(w.id, w.mut, w.w)}` }; } }
    for (const Q of plots) {
      if (Q === P || !Q.contains(p.x, p.z)) continue;
      for (let i = 0; i < Q.pedestals.length; i++) {
        const ped = Q.pedestals[i]; if (!ped.creature) continue;
        const d = Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z);
        if (d < 2.6 && d < best) { best = d; interaction = Q.locked ? { text: '🔒 Base is locked' } : { kind: 'steal', Q, i, text: `<b>[E]</b> Steal ${displayName(ped.creature.id, ped.creature.mut, ped.creature.w)}` }; }
      }
    }
  }
  if (P.contains(p.x, p.z)) for (let i = 0; i < S.slots; i++) {
    const ped = P.pedestals[i]; if (!ped.creature) continue;
    if (Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z) < 1.9) interaction = { kind: 'sell', i, text: `<b>[X]</b> Sell ${displayName(ped.creature.id, ped.creature.mut, ped.creature.w)} for $${fmt(income(ped.creature.id, ped.creature.mut, ped.creature.w) * 25)}` };
  }
  const shopPos = world.decor.find(d => d.shop).shop.userData.shopPos;
  if (!interaction && Math.hypot(shopPos.x - p.x, shopPos.z - p.z) < 4) interaction = { kind: 'shop', text: '<b>[E]</b> Open Shop' };
  if (!interaction) for (const f of bus.interactions) { let r = null; try { r = f(p); } catch (e) { console.error('[interaction]', e); } if (r) { interaction = { kind: 'mod', ...r }; break; } }
  if (!interaction && baseFull) interaction = { text: '<b>Base full!</b> Sell a creature [X] or buy pedestals' };
  if (pressed.has('e') && interaction) {
    if (interaction.kind === 'grab') grabWild(player, interaction.w);
    else if (interaction.kind === 'steal') steal(player, interaction.Q, interaction.i);
    else if (interaction.kind === 'shop') openPanel('panelShop');
    else if (interaction.kind === 'mod' && interaction.act) interaction.act();
  }
  if (pressed.has('x') && interaction?.kind === 'sell') sell(interaction.i);
}
// lock length: the player's comes from the shop upgrade, bots scale with their progress
function lockTimeFor(P) { return C.lockTimeOf(P === player.plot ? S.lockLv : Math.floor((P.owner?.speedLv || 0) / 6)); }
function fmtTime(s) { s = Math.ceil(s); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + 's'; }
function lockPlot(P) {
  const T = lockTimeFor(P);
  P.locked = T; P.lockMax = T; P.lockCd = T + C.LOCK_COOLDOWN;
  P.gateCol.active = true;
  bus.emit('lock', P);
  if (P === player.plot) { sound.buy(); toast('🔒 Base locked for ' + fmtTime(T)); }
  for (const a of actors) if (a.plot !== P && P.contains(a.pos.x, a.pos.z)) a.pos.copy(P.doorOut);
}
// big countdown over every base's gate + status over the lock button (redrawn only when the text changes)
function drawLockLabels(P, ready) {
  if (!P.lockTimer) {
    // dark plate so the sky bloom doesn't wash the numbers out
    P.lockTimer = makeLabel([{ text: '', size: 60 }], { scale: 2.0, bg: 'rgba(20,16,32,0.82)' });
    P.lockTimer.material.fog = false; P.lockTimer.renderOrder = 12;
    P.lockTimer.position.copy(P.gate.position).setY(12.4); P.group.add(P.lockTimer);
  }
  const big = P.locked > 0 ? '🔒 ' + fmtTime(P.locked) : '';
  P.lockTimer.visible = !!big;
  if (big && P.lockTimer._t !== big) {
    P.lockTimer._t = big;
    const pct = P.locked / (P.lockMax || P.locked), col = pct > 0.5 ? '#ff5a6e' : pct > 0.2 ? '#ffb02e' : '#ffe14a';
    P.lockTimer.userData.draw([{ text: big, color: col, size: 64 }, { text: 'LOCKED', color: '#fff', size: 30 }]);
  }
  const small = P.locked > 0 ? '🔒 ' + fmtTime(P.locked) : ready ? '🔒 LOCK · ' + fmtTime(lockTimeFor(P)) : '⏳ ' + fmtTime(P.lockCd);
  if (P.lockLab._t !== small) {
    P.lockLab._t = small;
    P.lockLab.userData.draw([{ text: small, color: P.locked > 0 ? '#ff5a6e' : ready ? '#5dff86' : '#b8b8c8', size: 36 }]);
  }
}
function updatePlots(dt) {
  const mult = incMult();
  for (const P of plots) {
    if (P.locked > 0) { P.locked -= dt; if (P.locked <= 0) { P.locked = 0; P.gateCol.active = false; if (P === player.plot) toast('🔓 Your base is unlocked!', 'red'); } }
    P.lockCd = Math.max(0, (P.lockCd || 0) - dt);
    P.gateMat.opacity = P.locked > 0 ? 0.55 + Math.sin(clock.elapsedTime * 8) * 0.2 : 0;
    const ready = !P.locked && P.lockCd <= 0;
    P.lockTop.material.color.set(ready ? 0x5dff86 : P.locked ? 0xff3f5c : 0x888899);
    P.lockTop.material.emissive.set(ready ? 0x22aa44 : P.locked ? 0xaa1122 : 0x222222);
    drawLockLabels(P, ready);
    const isMe = P === player.plot;
    for (const ped of P.pedestals) {
      if (!ped.creature) continue;
      const inc = income(ped.creature.id, ped.creature.mut, ped.creature.w);
      if (isMe) {
        ped.stored += inc * mult * dt;
        const shown = Math.floor(ped.stored);
        if (shown !== ped.lastDrawn && (clock.elapsedTime - (ped.drawT || 0) > 0.3)) { ped.lastDrawn = shown; ped.drawT = clock.elapsedTime; ped.label.userData.draw(pedLines(ped)); }
        ped.ring.material.opacity = ped.stored >= 1 ? 0.6 + Math.sin(clock.elapsedTime * 5) * 0.3 : 0;
      } else if (P.owner) P.owner.cash += inc * (1 + 0.3 * (P.owner.speedLv / 6)) * dt;
      if (ped.mesh) animateCreature(ped.mesh, clock.elapsedTime, ped.idx);
    }
  }
}

// ================================================================ HUD
const strip = $('strip');
function rebuildStrip() {
  strip.querySelectorAll('.z').forEach(z => z.remove());
  const first = strip.querySelector('.dot');
  C.RARITIES.forEach((R, i) => { const z = document.createElement('div'); z.className = 'z'; z.style.flex = String(C.ZONES[i].len); z.style.background = R.rainbow ? 'linear-gradient(90deg,#ff4f4f,#ffee4a,#5ee06a,#3fa8ff,#c070ff)' : R.color; strip.insertBefore(z, first); });
}
rebuildStrip();
const dots = actors.map(a => { const d = document.createElement('div'); d.className = 'dot' + (a === player ? ' me' : ''); d.style.background = a === player ? '#fff' : '#' + new THREE.Color(a.color).getHexString(); strip.appendChild(d); return d; });
const stripPct = z => clamp((z - C.ZONE_START) / (C.TRACK_LEN - C.ZONE_START), 0, 1) * 100;
let hudT = 0;
function updateHud(dt) {
  hudT -= dt; updateFloats(dt);
  if (bigT > 0) { bigT -= dt; if (bigT <= 0) $('center').classList.add('hidden'); }
  if (cardT > 0) { cardT -= dt; if (cardT <= 0) $('newCard')?.remove(); }
  if (adOfferT > 0) { adOfferT -= dt; $('adTimer').style.width = (adOfferT / 6 * 100) + '%'; if (adOfferT <= 0) $('adOffer').classList.add('hidden'); }
  actors.forEach((a, i) => { dots[i].style.left = (a.pos.z >= C.ZONE_START ? (a.pos.z > 0 ? -2 : 0) : stripPct(a.pos.z)) + '%'; dots[i].style.opacity = a.pos.z > 0 ? 0.35 : 1; });
  const wm = $('waveMark');
  if (W.state === 'run' && W.z > -Infinity) { wm.classList.remove('hidden'); wm.style.left = Math.max(0, stripPct(W.z)) + '%'; } else wm.classList.add('hidden');
  let danger = 0;
  if (W.state === 'run' && player.pos.z < 0 && !inShelter(player) && player.swept <= 0)
    for (const f of W.fronts) if (!f.done && f.z < player.pos.z) danger = Math.max(danger, clamp(1 - (player.pos.z - f.z) / 150, 0, 1));
  post.grade.uniforms.uDanger.value += (danger - post.grade.uniforms.uDanger.value) * Math.min(1, dt * 6);
  if (hudT > 0) return; hudT = 0.1;
  { const cashEl = $('cash'), tgt = S.cash, cur = cashEl._shown ?? tgt;
    const nv = Math.abs(tgt - cur) < 1 ? tgt : cur + (tgt - cur) * 0.35;
    if (tgt > cur + 0.5 && !cashEl.classList.contains('bump')) { cashEl.classList.add('bump'); setTimeout(() => cashEl.classList.remove('bump'), 320); }
    cashEl._shown = nv; cashEl.textContent = '$' + fmt(nv); }
  let inc = 0; for (const ped of player.plot.pedestals) if (ped.creature) inc += income(ped.creature.id, ped.creature.mut, ped.creature.w);
  $('income').firstChild.textContent = `+$${fmt(inc * incMult())}/s `;
  const boost = Date.now() < S.boostUntil;
  $('boostTag').classList.toggle('hidden', !boost);
  if (boost) $('boostTag').textContent = '2x ' + Math.ceil((S.boostUntil - Date.now()) / 1000) + 's';
  $('rebTag').classList.toggle('hidden', !S.rebirths); $('rebTag').innerHTML = `${icon('rebirth')} Rebirth ${S.rebirths} · x${(1 + 0.5 * S.rebirths).toFixed(1)}`;
  const wt = $('waveText');
  let wtx;
  if (W.state === 'gap') { wt.className = ''; wtx = `${icon('wave')} Next wave in ${Math.ceil(W.t + C.WAVE_WARN)}s`; }
  else if (W.state === 'warn') { wt.className = 'warn'; wtx = `${icon('warn')} ${W.type.name.toUpperCase()} WAVE IN ${Math.ceil(W.t)} ${icon('warn')}`; }
  else { wt.className = 'run'; wtx = inShelter(player) ? `${icon('shield')} You are SAFE — wait it out!` : player.pos.z > 0 ? `${icon('wave')} ${W.type.name} wave incoming` : `${icon('run')} HIDE IN A SAFE SPOT OR RUN HOME!`; }
  if (wt._h !== wtx) { wt._h = wtx; wt.innerHTML = wtx; }
  const zi = C.zoneAt(player.pos.z);
  $('zoneName').textContent = player.pos.z > 0 ? 'Beach Plaza' : zi < 0 ? 'Track Start' : `${C.ZONES[zi].title} · ${C.RARITIES[zi].name}`;
  $('zoneName').style.color = zi < 0 ? '#fff' : C.RARITIES[zi].color;
  const P = player.plot;
  const lih = (P.locked > 0 ? `<span class="on">${icon('lock')} Locked ${fmtTime(P.locked)}</span>` : P.lockCd > 0 ? `${icon('unlock')} Lock ready in ${fmtTime(P.lockCd)}` : `<span class="ok">${icon('unlock')} Lock ready</span> (step on the button)`) + `<br>${icon('bat')} ${player.bat.name}`;
  if ($('lockInfo')._h !== lih) { $('lockInfo')._h = lih; $('lockInfo').innerHTML = lih; }
  const pr = $('prompt');
  if (interaction?.text) { pr.innerHTML = interaction.text; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
  $('mAct').textContent = interaction?.kind === 'steal' ? 'STEAL' : interaction?.kind === 'shop' ? 'SHOP' : 'GRAB';
  $('mSlap').textContent = player.batIdx ? 'SWING' : 'PUNCH';
  $('mSell').classList.toggle('hidden', interaction?.kind !== 'sell');
  const ci = $('carryInfo');
  if (player.carry) { const R = C.RARITIES[C.CREATURE_BY_ID[player.carry.id].r]; ci.innerHTML = `Carrying <span style="color:${R.color}">${displayName(player.carry.id, player.carry.mut, player.carry.w)}</span> <span style="color:#ff8a8a">(heavy: -${Math.round((1 - C.carryMul(player.carry)) * 100)}% speed)</span><br>bring it home! ${icon('house')}`; }
  else if (S.tut < 4) ci.innerHTML = `<span style="color:#ffd23f">TIP:</span> ${iconize(tutText[S.tut])}`;
  else ci.textContent = '';
}

// ================================================================ camera + atmosphere
const camTarget = new V3();
const fogCol = new THREE.Color(0xcfeaff), _fc = new THREE.Color(), _ft = new THREE.Color();
function updateCamera(dt) {
  camTarget.lerp(new V3(player.pos.x, player.pos.y + 2.4, player.pos.z), 1 - Math.exp(-14 * dt));
  const cp = Math.cos(cam.pitch);
  // over-the-shoulder offset on desktop
  const side = isTouch ? 0 : 1.3, rx = Math.cos(cam.yaw) * side, rz = -Math.sin(cam.yaw) * side;
  camera.position.set(camTarget.x + Math.sin(cam.yaw) * cp * cam.dist + rx, camTarget.y + Math.sin(cam.pitch) * cam.dist, camTarget.z + Math.cos(cam.yaw) * cp * cam.dist + rz);
  let roll = 0;
  if (shake > 0) {
    // smooth layered-sine shake with eased falloff instead of white noise
    shake = Math.max(0, shake - dt); const t = performance.now() * 0.001, amp = Math.pow(Math.min(shake, 1), 1.4) * 0.75;
    camera.position.x += (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 83.1 + 1.7) * 0.4) * amp;
    camera.position.y += (Math.sin(t * 53.9 + 0.6) * 0.6 + Math.sin(t * 91.7 + 2.9) * 0.4) * amp;
    roll = Math.sin(t * 39.7 + 4.1) * amp * 0.035;
  }
  if (camera.position.z < -0.5 && camera.position.y < 9.5) camera.position.x = clamp(camera.position.x, -C.TRACK_HALF + 1.2, C.TRACK_HALF - 1.2);
  else { camera.position.x = clamp(camera.position.x, -C.PLAZA_HALF + 1, C.PLAZA_HALF - 1); camera.position.z = Math.min(camera.position.z, C.PLAZA_DEPTH - 1); }
  camera.position.y = Math.max(camera.position.y, player.pos.y < -0.5 ? player.pos.y + 1 : 1.0);
  camera.lookAt(camTarget.x + rx, camTarget.y, camTarget.z + rz);
  if (roll) camera.rotateZ(roll);
  // speed feel: FOV widens and speed lines fade in when sprinting fast on foot
  const hsp = (player.swept > 0 || player.dead > 0) ? 0 : Math.hypot(player.vel.x, player.vel.z), sp01 = clamp((hsp - 22) / 40, 0, 1);
  const fovT = 60 + sp01 * 12;
  if (Math.abs(camera.fov - fovT) > 0.02) { camera.fov += (fovT - camera.fov) * (1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix(); }
  juice.update(dt, sp01 * (lowQ ? 0.6 : 1));
  sunL.position.set(player.pos.x + lightDir.x * 120, lightDir.y * 120, player.pos.z + lightDir.z * 120);
  sunL.target.position.set(player.pos.x, 0, player.pos.z);
  // biome fog
  const b = player.pos.z > -5 ? 'beach' : world.biomeAt(player.pos.z);
  _fc.set(BIOMES[b].fog); if (look.fog !== null && look.fog !== undefined) _fc.lerp(_ft.set(look.fog), look.fogAmt); fogCol.lerp(_fc, 1 - Math.exp(-1.5 * dt)); scene.fog.color.copy(fogCol);
  const far = b === 'abyss' ? 300 : b === 'volcano' ? 380 : 560;
  scene.fog.far += (far - scene.fog.far) * (1 - Math.exp(-1.5 * dt)); scene.fog.near = scene.fog.far * 0.2;
}
// ambient particles per biome
let lightningT = 8, flashT = 0;
function ambientFx(dt) {
  const p = player.pos, b = world.biomeAt(p.z);
  if (look.rain) {
    for (let i = 0; i < (lowQ ? 6 : 16); i++) fx.soft.emit(p.x + rand(-40, 40), rand(10, 30), p.z + rand(-50, 25), -3, -45, 0, { color: 0xd8e6ff, size: 0.32, life: 0.7, drag: 0 });
    lightningT -= dt;
    if (lightningT <= 0) { lightningT = rand(6, 15); flashT = 0.35; sound.thunder(); }
  }
  if (flashT > 0) { flashT -= dt; hemi.intensity = look.hemi[2] + (Math.random() < 0.5 ? 2.5 : 0.3) * (flashT / 0.35); if (flashT <= 0) hemi.intensity = look.hemi[2]; }
  if (p.z > -5) return;
  const n = lowQ ? 1 : 3;
  for (let i = 0; i < n; i++) {
    const x = rand(-C.TRACK_HALF, C.TRACK_HALF), z = p.z + rand(-60, 20);
    if (b === 'volcano') fx.ember(x, rand(0, 3), z);
    else if (b === 'glacier') fx.snow(x, rand(8, 16), z);
    else if (b === 'abyss') fx.mote(x, rand(0.5, 6), z, Math.random() < 0.5 ? 0xc69bff : 0x7ad8ff);
    else if (b === 'jungle' && Math.random() < 0.3) fx.mote(x, rand(1, 5), z, 0xd8ff7a);
  }
  for (const l of hz.lava) if (Math.abs(l.minZ - p.z) < 80 && Math.random() < 0.5) fx.ember(rand(-C.TRACK_HALF, C.TRACK_HALF), 0.3, rand(l.minZ, l.maxZ));
}

// ================================================================ worlds
function applyLook() {
  const L = world.setLook(C.WORLDS[C.WORLD].look);
  look = L;
  sunL.color.set(L.sun); sunL.intensity = L.sunI;
  playerLight.intensity = { night: 60, storm: 25, cosmic: 30, sunset: 8 }[C.WORLDS[C.WORLD].look] || 0;
  // bright HDR day skies bloomed over the whole horizon and washed out signs/labels; dark worlds keep the low threshold for neon glow
  post.bloom.threshold = { day: 2.6, sunset: 2.2 }[C.WORLDS[C.WORLD].look] || 1.35;
  hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
  renderer.toneMappingExposure = L.exposure;
  lightDir.copy(L.lightDir);
  for (const wm of waveMeshes) wm.mat.uniforms.uSun.value.copy(world.sunDir);
}
function travel(w, { silent = false } = {}) {
  for (const a of actors) {
    clearCarry(a); a.swept = 0; a.dead = 0; a.obj.visible = true; a.obj.rotation.x = 0;
    a.pos.copy(a.plot.doorIn); a.pos.y = 0; a.vel.set(0, 0, 0); a.kb.set(0, 0, 0); a.stun = 0;
    if (a.isBot) { a.ai.mode = 'idle'; a.ai.t = rand(1, 4); a.ai.hide = null; a.ai.target = null; }
  }
  while (wilds.length) removeWild(wilds[0]);
  for (const f of W.fronts) f.mesh.group.visible = false;
  W.fronts = []; W.pending = 0; W.state = 'gap'; W.t = 6;
  C.setWorld(w); sound.setWorld(w); S.world = w; S.maxWorld = Math.max(S.maxWorld || 0, w);
  world.buildTrack(w);
  tameEnv(world.trackRoot);
  initPads(); rebuildStatics(); rebuildStrip(); applyLook();
  seedBotPlots(); refillPads(true);
  syncPlayerPeds();
  bus.emit('travel', w);
  if (!silent) { bigText(`${C.WORLDS[w].emoji} ${C.WORLDS[w].name.toUpperCase()}`, `creatures here earn x${fmt(C.WORLDS[w].mult)} · the track is ${Math.round(-C.TRACK_LEN)}m long`); sound.newCreature(4); }
  save();
}
function renderWorlds() {
  $('worldRows').innerHTML = C.WORLDS.map((Wd, i) => {
    const unlocked = i <= (S.maxWorld || 0), here = i === C.WORLD, next = i === (S.maxWorld || 0) + 1;
    let btn;
    if (here) btn = `<button class="btn grey" disabled>${icon('house')} HERE</button>`;
    else if (unlocked) btn = `<button class="btn green" data-go="${i}">TRAVEL</button>`;
    else if (next) btn = `<button class="btn ${S.cash >= Wd.cost ? 'gold' : 'grey'}" data-buy="${i}">${icon('unlock')} ${icon('coin')}${fmt(Wd.cost)}</button>`;
    else btn = `<button class="btn grey" disabled>${icon('lock')} LOCKED</button>`;
    const len = [0, 1, 2, 3, 4, 5, 6].reduce((t, k) => t + Math.round(C.STAGE_BASE_LEN * Math.pow(C.STAGE_GROWTH, k) * Wd.lenMul), 0);
    return `<div class="row${here ? ' here' : ''}${!unlocked && !next ? ' lockedRow' : ''}"><div class="ic wb">${worldBadge(Wd)}</div><div class="tx"><b style="color:${Wd.color}">${Wd.name}</b><span>${icon('coin')} creatures earn <b style="color:#7dff9a;display:inline;font-size:inherit">x${fmt(Wd.mult)}</b> · ${len}m track · waves x${Wd.waveMul.toFixed(2)}</span></div>${btn}</div>`;
  }).join('');
  $('worldRows').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { closePanels(); travel(+b.dataset.go); });
  $('worldRows').querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    const i = +b.dataset.buy, Wd = C.WORLDS[i];
    if (S.cash < Wd.cost) { sound.deny(); return; }
    S.cash -= Wd.cost; S.maxWorld = i; sound.buy(); closePanels(); travel(i);
  });
}

// ================================================================ main loop
const game = {
  cam, actors, player, bots, wilds, plots, W, world, hz, moveActor, routeNext, swing, grabWild, steal, placeCarry, clearCarry, giveCarry, freeSlot, lockPlot, inShelter, region, needJump, canClearGap, gapBlocks, equipBat, sound, toast, S,
  // extra API for js/sys/* systems (see hooks.js)
  THREE, C, scene, camera, renderer, clock, fx, juice, post, isTouch, lowQ,
  get pads() { return pads; }, get started() { return started; }, get interaction() { return interaction; },
  income, incMult, displayName, rollMut, spawnWild, removeWild, setPed, pedToSave, syncPlayerPeds, sell, kill, respawn, dropCarry,
  float, bigText, flashHit, showNewCard, openPanel, closePanels, togglePanel, renderShop, save, fmt, icon, rarityGem, makeLabel, makeCreature, animateCreature, toon, mesh, G,
  slowAt, pitAt, lavaAt, travel, keys, rewardedAd, addShake(v) { shake = Math.max(shake, v); },
};
let lastZone = -1;
function update(dt) {
  const t = clock.elapsedTime;
  if (!started) return;
  updateWave(dt);
  updatePlayer(dt);
  for (const b of bots) updateBot(game, b, dt);
  updatePlots(dt);
  updateShells(dt);
  updateGaps();
  for (const a of actors) {
    if (a.swept > 0) {
      a.swept -= dt;
      const lead = W.fronts.filter(f => !f.done).map(f => f.z).reduce((m, z) => Math.max(m, z), a.pos.z - 2);
      a.pos.z = Math.min(-1, Math.max(a.pos.z, lead + 2)); a.pos.y = 4 + Math.sin(a.swept * 4) * 1.5; a.obj.rotation.x += dt * 9;
      animateCharacter(a.obj, dt, 0, { stun: 1 });
      if (a.swept <= 0) respawn(a);
    } else if (a.dead > 0) {
      a.dead -= dt;
      if (a.pos.y < 0) { a.vy -= 32 * dt; a.pos.y += a.vy * dt; a.obj.rotation.x += dt * 4; }
      if (a.dead <= 0) respawn(a);
    }
  }
  for (const p of pads) if (!p.item) { p.respawn -= dt; if (p.respawn <= 0) fillPad(p); }
  for (let i = wilds.length - 1; i >= 0; i--) {
    const w = wilds[i];
    w.mesh.rotation.y = t * 0.8 + w.seed; w.mesh.position.y = Math.abs(Math.sin(t * 2 + w.seed)) * 0.25;
    animateCreature(w.mesh, t, w.seed);
    if (w.ttl) { w.ttl -= dt; if (w.ttl <= 0) removeWild(w); }
  }
  arrow.visible = !!player.carry && !player.plot.contains(player.pos.x, player.pos.z);
  if (arrow.visible) {
    const tgt = routeNext(player, player.plot.center);
    arrow.position.set(player.pos.x, player.pos.y + 5.6, player.pos.z);
    arrow.rotation.y = Math.atan2(tgt.x - player.pos.x, tgt.z - player.pos.z);
  }
  beacon.material.opacity = 0.14 + Math.sin(t * 2) * 0.05;
  for (const a of actors) a.tag.visible = a.pos.distanceTo(camera.position) < 90;
  ambientFx(dt);
  fx.update(dt);
  { const zi = player.pos.z > C.ZONE_START ? -1 : C.zoneAt(player.pos.z); if (zi !== lastZone) { lastZone = zi; bus.emit('zone', player, zi); } }
  bus.emit('tick', dt);
  updateHud(dt);
  pressed.clear();
}
// ---- performance: distance culling + adaptive resolution
let cullT = 0, perfT = 0, perfFrames = 0, pr = renderer.getPixelRatio();
const PR_MAX = pr, PR_MIN = Math.min(1, pr);
function cull(dt) {
  cullT -= dt; if (cullT > 0) return; cullT = 0.2;
  const cz = camera.position.z;
  const near = z => z < cz + 40 && z > cz - 190;
  for (const w of wilds) { const v = near(w.pos.z); w.mesh.visible = v; w.label.visible = v && Math.abs(w.pos.z - cz) < 110; if (w.beam) w.beam.visible = w.pos.z < cz + 40 && w.pos.z > cz - 420; }
  for (const p of pads) p.disc.visible = near(p.pos.z);
  const farZ = cz - scene.fog.far - 20;
  for (const st of statics) st.o.visible = st.z0 < cz + 50 && st.z1 > farZ;
  const plazaVis = cz > -140;
  for (const P of plots) {
    P.group.visible = plazaVis;
    if (!plazaVis) continue;
    // far-away pedestals: hide the creature + label (bases are big and detailed)
    const cx = camera.position.x, czz = camera.position.z;
    for (const ped of P.pedestals) if (ped.mesh) { const d = Math.hypot(ped.pos.x - cx, ped.pos.z - czz); ped.mesh.visible = d < 75; if (ped.label) ped.label.visible = d < 60; }
  }
  for (const c of hz.crabs) c.mesh.visible = near(c.z);
  for (const p of hz.pendulums) for (const v of p.pivots) v.pg.visible = near(p.z);
}
function adaptRes(dt) {
  perfT += dt; perfFrames++;
  if (perfT < 2) return;
  const fps = perfFrames / perfT; perfT = 0; perfFrames = 0;
  let next = pr;
  if (fps < 48 && pr > PR_MIN) next = Math.max(PR_MIN, pr - 0.25);
  else if (fps > 58 && pr < PR_MAX) next = Math.min(PR_MAX, pr + 0.25);
  if (next !== pr) { pr = next; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); }
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  cull(dt); adaptRes(dt);
  world.update(clock.elapsedTime, dt, player.pos.z);
  update(dt * juice.scale(dt)); // hit-stop briefly freezes the simulation on bat hits
  if (!started) { cam.yaw += dt * 0.08; } // slow orbit behind the title screen
  updateCamera(dt);
  post.grade.uniforms.uTime.value = clock.elapsedTime;
  if (window.__noPost) renderer.render(scene, camera); else post.composer.render(dt);
}
window.__cull = () => { cullT = 0; cull(0.01); };
window.__sim = (sec, step = 1 / 30) => { for (let i = 0; i < sec / step; i++) { clock.elapsedTime += step; world.update(clock.elapsedTime, step, player.pos.z); update(step); } };

// ================================================================ boot
async function boot() {
  await cgInit();
  load();
  player.speedLv = S.speedLv; equipBat(player, S.bat);
  bus._S = S;
  await loadSystems(game, bus);
  if (S.world) travel(S.world, { silent: true }); else applyLook();
  syncPlayerPeds(); seedBotPlots(); refillPads(true);
  $('btnSound').textContent = S.sound ? '🔊' : '🔇';
  const away = Math.min(3 * 3600, (Date.now() - S.last) / 1000);
  let inc = 0; for (const p of S.peds) if (p) inc += income(p.id, p.mut, p.w);
  const off = Math.floor(inc * away * 0.5 * (1 + 0.5 * S.rebirths));
  if (off > 0 && away > 60) {
    $('offlineText').textContent = `Your creatures earned $${fmt(off)} while you were away!`;
    $('offline').classList.remove('hidden');
    $('offlineOk').onclick = () => { S.cash += off; $('offline').classList.add('hidden'); sound.cash(true); save(); requestLock(); };
    $('offlineAd').onclick = async () => { $('offline').classList.add('hidden'); const ok = await rewardedAd(); S.cash += off * (ok ? 3 : 1); sound.cash(true); save(); requestLock(); };
  }
  cg('loadingStop');
  $('loading').classList.add('hidden');
  $('play').disabled = false;
  $('play').onclick = () => {
    sound.init(); restoreMute();
    $('start').classList.add('hidden'); $('hud').classList.remove('hidden');
    if (isTouch) $('mobile').classList.remove('hidden');
    started = true; setPlaying(true); clock.getDelta();
    bus.emit('start');
    cam.yaw = 0; cam.pitch = 0.32;
    requestLock();
  };
  bus.emit('boot');
  frame();
}
boot();
window.__game = game;
if (location.hostname === "localhost") window.__dbg = { renderer, post, scene, camera, sunL };
