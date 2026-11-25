// Realistic people: 20 different rigged adults from Microsoft's Rocketbox avatar library (MIT
// license) with motion-captured dance, walk, idle, talk and drink animations. All avatars share
// one skeleton, so every animation works on every person. Also loads Poly Haven (CC0) furniture.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { NAMES } from './people.js';

const F = (id) => ({ id, fem: true }), Mm = (id) => ({ id, fem: false });
const AVATARS = [
  F('Female_Party_01'), F('Female_Party_02'), F('Female_Adult_01'), F('Female_Adult_02'), F('Female_Adult_03'),
  F('Female_Adult_05'), F('Female_Adult_07'), F('Female_Adult_09'), F('Female_Adult_12'), F('Female_Adult_14'),
  Mm('Male_Adult_01'), Mm('Male_Adult_02'), Mm('Male_Adult_04'), Mm('Male_Adult_05'), Mm('Male_Adult_07'),
  Mm('Male_Adult_08'), Mm('Male_Adult_10'), Mm('Male_Adult_11'), Mm('Male_Adult_14'), Mm('Male_Adult_17'),
];
const NO_OPACITY = new Set(['Male_Adult_11', 'Male_Adult_14', 'Male_Adult_17']);
const ANIMS = ['f_dancing_neutral', 'm_dancing_cool', 'm_idle_neutral_01', 'm_gestic_talk_neutral_01', 'm_drink_idle', 'f_walk_neutral_01', 'm_walk_neutral_01', 'f_walk_cool_01', 'm_walk_cool_01'];
const PROPS = ['bar_chair_round_01', 'sofa_02', 'mid_century_lounge_chair', 'coffee_table_round_01', 'potted_plant_04', 'hanging_industrial_lamp', 'modern_ceiling_lamp_01', 'club_speaker', 'club_movinghead'];
const CLIPS = {}, SPEED = {}, PROP = {};
let ready = false;

// standalone builds (e.g. CrazyGames) ship raw .fbx/.glb files; the online version packs them as JS strings
const RAW = typeof window !== 'undefined' && window.LC_BUILD;
async function loadBin(rawUrl, jsPath) {
  if (RAW) { const r = await fetch(rawUrl); if (r.ok) return r.arrayBuffer(); }
  const { default: b64 } = await import(jsPath); return b64ToBuffer(b64);
}
function b64ToBuffer(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }

function clipFromJSON(j) {
  const times = new Float32Array(j.frames); for (let i = 0; i < j.frames; i++) times[i] = Math.min(j.duration, i / j.fps);
  const tracks = j.tracks.map((t) => t.type === 'quaternion'
    ? new THREE.QuaternionKeyframeTrack(t.name, times, t.values)
    : new THREE.VectorKeyframeTrack(t.name, times, t.values));
  return new THREE.AnimationClip(j.name, j.duration, tracks);
}

const texLoader = new THREE.TextureLoader();
function tex(url, srgb = true) { const t = texLoader.load(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export async function loadModels() {
  const anims = await Promise.all(ANIMS.map((n) => fetch(`rb/anim_${n}.json`).then((r) => r.json())));
  anims.forEach((j) => { CLIPS[j.name] = clipFromJSON(j); if (j.speed) SPEED[j.name] = j.speed; });
  const loader = new FBXLoader();
  await Promise.all(AVATARS.map(async (a) => {
    const obj = loader.parse(await loadBin(`rb/bin/${a.id}.fbx`, `./rb/${a.id}.js`), '');
    // the FBX files carry their own ambient light; with dozens of people that blows out the club
    const extras = []; obj.traverse((o) => { if (o.isLight || o.isCamera) extras.push(o); }); extras.forEach((o) => o.parent && o.parent.remove(o));
    const dir = `rb/${a.id}/`;
    const body = tex(dir + 'body.jpg'), head = tex(dir + 'head.jpg'), headN = tex(dir + 'head_n.jpg', false);
    const opacity = NO_OPACITY.has(a.id) ? null : tex(dir + 'opacity.png');
    const skin = new THREE.MeshStandardMaterial({ map: head, normalMap: headN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.55, metalness: 0 });
    const cloth = new THREE.MeshStandardMaterial({ map: body, roughness: 0.75, metalness: 0 });
    const hair = opacity ? new THREE.MeshStandardMaterial({ map: opacity, alphaTest: 0.4, roughness: 0.6, side: THREE.DoubleSide }) : null;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
        const n = (m.name || '').toLowerCase();
        if (n.includes('head')) return skin;
        if (n.includes('opacity')) return hair || new THREE.MeshBasicMaterial({ visible: false });
        return cloth;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
      o.castShadow = false; o.receiveShadow = false;
      // animated bodies move away from their bind pose, so give culling a generous sphere around the person
      if (o.isSkinnedMesh) { o.geometry.computeBoundingSphere(); o.frustumCulled = true; }
    });
    a.src = obj;
  }));
  // furniture
  const gl = new GLTFLoader();
  await Promise.all(PROPS.map(async (n) => {
    const g = await gl.parseAsync(await loadBin(`props/${n}.glb`, `./props/${n}.js`), '');
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    PROP[n] = g.scene;
  }));
  ready = true;
}
export const modelsReady = () => ready;
export const propSource = (name) => PROP[name];
export function makeProp(name, scale = 1) { const o = PROP[name].clone(true); o.scale.setScalar(scale); return o; }

const UP = new THREE.Vector3(0, 1, 0);
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3();
let avatarTurn = 0;

export function makeHuman(seed, opts = {}) {
  let s = Math.imul(seed + 7, 2654435761) >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = opts.fem === undefined ? AVATARS : AVATARS.filter((a) => a.fem === opts.fem);
  // cycle through the cast so the same face doesn't show up twice in a row
  const pick = pool[(avatarTurn++ * 7 + Math.floor(r() * 3)) % pool.length];
  const av = (opts.avatar && AVATARS.find((a) => a.id === opts.avatar)) || pick; // regulars keep their face
  const model = cloneSkinned(av.src);
  const root = new THREE.Group(); root.add(model);
  model.traverse((o) => { if (o.isSkinnedMesh) { o.boundingSphere = o.geometry.boundingSphere.clone(); o.boundingSphere.radius *= 1.6; } });
  const scale = 0.01 * (0.96 + r() * 0.07); // centimetres → metres, a little height variety
  model.scale.setScalar(scale);
  let head = null, neck = null;
  model.traverse((o) => { if (o.isBone && o.name === 'Bip01_Head') head = o; if (o.isBone && o.name === 'Bip01_Neck') neck = o; });

  const mixer = new THREE.AnimationMixer(model);
  const danceClip = av.fem ? (r() < 0.75 ? CLIPS.f_dancing_neutral : CLIPS.m_dancing_cool) : (r() < 0.75 ? CLIPS.m_dancing_cool : CLIPS.f_dancing_neutral);
  const walkName = av.fem ? (r() < 0.5 ? 'f_walk_neutral_01' : 'f_walk_cool_01') : (r() < 0.5 ? 'm_walk_neutral_01' : 'm_walk_cool_01');
  const act = {
    dance: mixer.clipAction(danceClip), idle: mixer.clipAction(CLIPS.m_idle_neutral_01),
    talk: mixer.clipAction(CLIPS.m_gestic_talk_neutral_01), drink: mixer.clipAction(CLIPS.m_drink_idle),
    walk: mixer.clipAction(CLIPS[walkName]),
  };
  const baseDance = 0.92 + r() * 0.16;
  for (const [k, a] of Object.entries(act)) { a.play(); a.time = r() * a.getClip().duration; a.setEffectiveWeight(0); a.timeScale = k === 'dance' ? baseDance : k === 'walk' ? 1 : 0.9 + r() * 0.2; }
  const w = { dance: 0, idle: 1, talk: 0, drink: 0, walk: 0 }; act.idle.setEffectiveWeight(1);
  const st = { mode: opts.mode || 'stand', look: new THREE.Vector3(0, 1.6, -2), lookW: 0, talkT: 0, emotion: 'neutral', sitHeight: 0 };
  let chat = r() < 0.35;
  const walkSpeed = (SPEED[walkName] || 1) * scale * 100; // metres per second at this body size

  return {
    root, name: NAMES[Math.floor(r() * NAMES.length)], seed, fem: av.fem, isModel: true, st, avatar: av.id, walkSpeed,
    head: head || root,
    arms: { left: { hand: { fingers: [] } }, right: { hand: { fingers: [] } } },
    setEmotion(e) { st.emotion = e; },
    say() { st.talkT = 2.5; },
    setArmTarget() {},
    setChat(on) { chat = on; },
    update(dt) {
      let want = 'idle';
      if (st.mode === 'walk') want = 'walk';
      else if (st.mode === 'dance') want = 'dance';
      else if (st.mode === 'drink') want = 'drink';
      else if (st.mode === 'talk' || st.talkT > 0 || chat) want = 'talk';
      st.talkT = Math.max(0, st.talkT - dt);
      for (const k of ['dance', 'idle', 'talk', 'drink', 'walk']) { w[k] += ((k === want ? 1 : 0) - w[k]) * Math.min(1, dt * 6); act[k].setEffectiveWeight(w[k]); }
      mixer.update(dt);
      // turn the head toward what they're looking at (world-space yaw, so bone axes don't matter)
      if (head && st.lookW > 0.01 && want !== 'walk') {
        root.updateMatrixWorld(true);
        head.getWorldPosition(va); vb.copy(st.look).sub(va);
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
        let yaw = Math.atan2(vb.x, vb.z) - Math.atan2(fwd.x, fwd.z);
        while (yaw > Math.PI) yaw -= Math.PI * 2; while (yaw < -Math.PI) yaw += Math.PI * 2;
        yaw = Math.max(-1.0, Math.min(1.0, yaw)) * st.lookW;
        for (const [bone, part] of [[neck, 0.35], [head, 0.65]]) {
          if (!bone) continue;
          bone.getWorldQuaternion(qa); bone.parent.getWorldQuaternion(qb);
          qc.setFromAxisAngle(UP, yaw * part).multiply(qa);
          bone.quaternion.copy(qb.invert().multiply(qc));
          bone.updateMatrixWorld(true);
        }
      }
    },
  };
}
