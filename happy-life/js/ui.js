'use strict';
// UI: screens, input, main loop, CrazyGames SDK, wiring the game to the network.
(() => {
const HL = window.HL, G = HL.game, Net = HL.net, W = HL.W, H = HL.H;
const $ = (id) => document.getElementById(id);

// ---------------- icons: our own SVG symbols (no emoji) ----------------
const IC = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.5 3.5 3.5 14.5 0 18M12 3c-3.5 3.5-3.5 14.5 0 18"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6M15.5 14.3c3 0 5.3 1.6 6 5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  inf: '<path d="M7 9c-3 0-4 1.5-4 3s1 3 4 3c4 0 6-6 10-6 3 0 4 1.5 4 3s-1 3-4 3c-4 0-6-6-10-6z"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', up: '<path d="M5 15l7-7 7 7"/>',
  dash: '<path d="M3 8h9M2 12h13M4 16h8"/><path d="M16 6l5 6-5 6"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3M9 9.5h.01M15 9.5h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  crown: '<path d="M3 8l4.5 4L12 6l4.5 6L21 8l-2 11H5z"/>',
};
const svg = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;
// world badges (filled, colorful)
const WORLD_SVG = {
  flower: '<circle cx="12" cy="6.5" r="4" fill="#ff8fb8"/><circle cx="17.5" cy="11" r="4" fill="#ff8fb8"/><circle cx="15" cy="17" r="4" fill="#ff8fb8"/><circle cx="9" cy="17" r="4" fill="#ff8fb8"/><circle cx="6.5" cy="11" r="4" fill="#ff8fb8"/><circle cx="12" cy="12" r="3.5" fill="#ffd43b"/>',
  candy: '<path d="M2 7l5 3v4l-5 3zM22 7l-5 3v4l5 3z" fill="#b197fc"/><circle cx="12" cy="12" r="5.5" fill="#ff6fa5"/><path d="M9 9l6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  flake: '<g stroke="#4dabf7" stroke-width="2.4" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/></g>',
  gear: '<path d="M10 2h4l.6 2.6 2.4 1 2.3-1.4 2.8 2.8-1.4 2.3 1 2.4L24 12v0l-2.3 2.3-1 2.4 1.4 2.3-2.8 2.8-2.3-1.4-2.4 1L14 22h-4l-.6-2.6-2.4-1-2.3 1.4-2.8-2.8 1.4-2.3-1-2.4L0 12l2.3-2.3 1-2.4-1.4-2.3 2.8-2.8 2.3 1.4 2.4-1z" fill="#9775fa"/><circle cx="12" cy="12" r="4" fill="#fff"/>',
  gem: '<path d="M6 3h12l4 6-10 13L2 9z" fill="#74c0fc"/><path d="M2 9h20M9 3l3 6 3-6M12 9v13" stroke="#fff" stroke-width="1.4" fill="none"/>',
  swirl: '<g stroke="#748ffc" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h16a3 3 0 1 1-3 3"/><path d="M3 18h7"/></g>',
  moon: '<path d="M15 2a10 10 0 1 0 7 15A8 8 0 0 1 15 2z" fill="#ffe066"/><circle cx="9" cy="10" r="1.6" fill="#f2c94c"/><circle cx="11" cy="16" r="1.2" fill="#f2c94c"/>',
  leaf: '<path d="M4 20C4 9 10 3 21 3c0 11-6 17-17 17z" fill="#40c057"/><path d="M4 20L15 9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  castle: '<path d="M3 21V8h3v2h2V8h3v3h2V8h3v2h2V8h3v13z" fill="#ff922b"/><path d="M10 21v-5a2 2 0 0 1 4 0v5z" fill="#fff"/>',
  rainbow: '<g fill="none" stroke-width="2.6"><path d="M2 19a10 10 0 0 1 20 0" stroke="#ff6b6b"/><path d="M5 19a7 7 0 0 1 14 0" stroke="#ffd43b"/><path d="M8 19a4 4 0 0 1 8 0" stroke="#4dabf7"/></g>',
};
const worldSvg = (name) => `<svg viewBox="0 0 24 24">${WORLD_SVG[name] || ''}</svg>`;
for (const el of document.querySelectorAll('[data-ic]')) el.insertAdjacentHTML('afterbegin', svg(el.dataset.ic));
const medalHTML = (m) => (m ? `<i class="md ${m[0]}"></i>` : '');

// ---------------- CrazyGames SDK (safe no-ops when missing) ----------------
const SDK = {
  sdk: null, playing: false,
  async init() { try { if (window.CrazyGames && window.CrazyGames.SDK) { await window.CrazyGames.SDK.init(); this.sdk = window.CrazyGames.SDK; } } catch (e) { this.sdk = null; } },
  call(fn) { try { if (this.sdk) fn(this.sdk); } catch (e) {} },
  gameplayStart() { if (this.playing) return; this.playing = true; this.call((s) => s.game.gameplayStart()); },
  gameplayStop() { if (!this.playing) return; this.playing = false; this.call((s) => s.game.gameplayStop()); },
  happytime() { this.call((s) => s.game.happytime && s.game.happytime()); },
  midgame(done) {
    if (!this.sdk) { done(); return; }
    let fin = false;
    const finish = () => { if (fin) return; fin = true; HL.audio.setAdMuted(false); done(); };
    try { this.sdk.ad.requestAd('midgame', { adStarted: () => HL.audio.setAdMuted(true), adFinished: finish, adError: finish }); } catch (e) { finish(); }
  },
};

// ---------------- stats / unlocks ----------------
const stats = Object.assign({ wins: 0, races: 0, soloBest: null }, HL.store.get('stats', {}));
const saveStats = () => HL.store.set('stats', stats);
const UNLOCKS = { 2: { need: 'Win 1 online race', ok: () => stats.wins >= 1 }, 4: { need: 'Win 3 online races', ok: () => stats.wins >= 3 },
  8: { need: 'Finish World 1 on the trail', ok: () => trail.best['1-5'] != null } };
const trail = Object.assign({ best: {} }, HL.store.get('trail2', {})); // v2 levels (50 stages)
const saveTrail = () => HL.store.set('trail2', trail);
const courseUnlocked = (i) => {
  const first = HL.COURSES.findIndex((c) => trail.best[c.id] == null);
  return first === -1 || i <= first;
};
const hatUnlocked = (i) => !UNLOCKS[i] || UNLOCKS[i].ok();

// ---------------- canvas / resize ----------------
const stage = $('stage'), canvas = $('game'), ctx = canvas.getContext('2d');
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cw = Math.floor(W * s), ch = Math.floor(H * s);
  stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
  stage.style.fontSize = Math.max(9, 15 * s) + 'px';
  canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------------- input ----------------
// keysP[0] = WASD side, keysP[1] = arrows side. Solo/online merge both into `keys`.
const keysP = [{ left: false, right: false, jump: false }, { left: false, right: false, jump: false }];
const keys = { left: false, right: false, jump: false };
const mergeKeys = () => { for (const k in keys) keys[k] = keysP[0][k] || keysP[1][k]; };
const KEYMAP = { KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'jump'], Space: [0, 'jump'], ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowUp: [1, 'jump'] };
const DASHKEYS = { ShiftLeft: 0, KeyS: 0, KeyK: 0, KeyX: 0, ShiftRight: 1, ArrowDown: 1, Slash: 1, Numpad0: 1 };
const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text';
const who = (side) => (mode === 'local' ? side : 0);
window.addEventListener('keydown', (e) => {
  HL.audio.init();
  if (typing()) { if (e.code === 'Enter' && document.activeElement.id === 'codeInput') $('btnJoin').click(); return; }
  const k = KEYMAP[e.code];
  if (k) { e.preventDefault(); if (k[1] === 'jump' && !e.repeat && G.active) G.jump(who(k[0])); keysP[k[0]][k[1]] = true; mergeKeys(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') { if (screen === null) openPause(); else if (screen === 'pause') closePause(); }
  else if (e.code in DASHKEYS && screen === null) { e.preventDefault(); if (!e.repeat) G.dash(who(DASHKEYS[e.code])); }
  else if (e.code === 'KeyR' && screen === null) G.respawn(0);
  else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && screen === null && mode === 'local') G.respawn(1);
  else if (/^Digit[1-4]$/.test(e.code) && screen === null && G.active && mode !== 'local') G.emote(+e.code.slice(5) - 1);
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) { keysP[k[0]][k[1]] = false; mergeKeys(); e.preventDefault(); } });
window.addEventListener('blur', () => { for (const s of keysP) s.left = s.right = s.jump = false; mergeKeys(); });
window.addEventListener('pointerdown', () => HL.audio.init());
const isTouch = 'ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
let touchEmote = 0;
$('btnDash').addEventListener('pointerdown', (e) => { e.preventDefault(); G.dash(); });
$('btnEmote').addEventListener('pointerdown', (e) => { e.preventDefault(); G.emote(touchEmote); touchEmote = (touchEmote + 1) % 4; });
for (const b of document.querySelectorAll('#touch button[data-k]')) {
  const k = b.dataset.k;
  const down = (e) => { e.preventDefault(); HL.audio.init(); keysP[0][k] = true; mergeKeys(); b.classList.add('on'); if (k === 'jump') G.jump(0); };
  const up = (e) => { e.preventDefault(); keysP[0][k] = false; mergeKeys(); b.classList.remove('on'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
}
document.addEventListener('touchmove', (e) => { if (!typing()) e.preventDefault(); }, { passive: false });

// ---------------- screens ----------------
let screen = 'title';      // id of the visible screen, or null while racing
let mode = null;           // 'solo' | 'online' | null
let returnTo = 'title';    // where custom/settings go back to
function show(id) {
  screen = id;
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  const racing = id === null;
  $('hud').classList.toggle('hidden', !racing);
  $('touch').classList.toggle('hidden', !(racing && isTouch));
  if (id === 'title') renderStatsLine();
}
let msgTimer = null;
function msg(text, ms = 2800) {
  const m = $('msg'); m.textContent = text; m.style.opacity = 1;
  clearTimeout(msgTimer); msgTimer = setTimeout(() => (m.style.opacity = 0), ms);
}
const click = (id, fn) => $(id).addEventListener('click', () => { HL.audio.init(); HL.sfx.ui(); fn(); });
function renderStatsLine() {
  const done = HL.COURSES.filter((c) => trail.best[c.id] != null).length;
  $('statsLine').textContent = `Online wins: ${stats.wins} · Trail: ${done}/${HL.COURSES.length} stages · ${HL.WORLDS.length} worlds`;
}

// ---------------- title / menu scene ----------------
const menuDummies = [0, 1, 2].map((i) => ({ x: [110, 200, 800][i], y: 0, vy: 0, t: i * 0.4, skin: i === 1 ? null : { color: (i * 3 + 2) % 9, hat: (i * 2 + 1) % 7, face: i % 5 } }));
let menuClock = 0;
function renderMenuScene(dt) {
  menuClock += dt;
  HL.drawSky(ctx, menuClock * 30, 0, menuClock);
  const gy = 470;
  ctx.fillStyle = '#c98a55'; ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = '#63c95a'; ctx.fillRect(0, gy, W, 12);
  ctx.fillStyle = '#7ddb72'; ctx.fillRect(0, gy, W, 5);
  for (const d of menuDummies) {
    d.t += dt;
    d.vy += 1800 * dt; d.y += d.vy * dt;
    if (d.y >= 0) { d.y = 0; d.vy = -620 - Math.random() * 200; }
    const skin = d.skin || HL.profile.skin;
    // trampoline
    HL.rrect(ctx, d.x - 8, gy - 8, 40, 7, 3, '#ff5d73', '#c92a42', 2);
    ctx.save(); ctx.translate(d.x + 12, gy - 8 - 36 + d.y + 18); ctx.rotate(Math.sin(d.t * 3) * 0.3); ctx.translate(-12, -18);
    HL.drawDummy(ctx, 0, 0, skin, { face: 1, air: d.y < -2 });
    ctx.restore();
  }
}

// ---------------- skin preview helpers ----------------
function drawPreview(cv, skin, scale) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  const w = Math.max(10, r.width), h = Math.max(10, r.height);
  cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const s = scale || Math.min(w / 30, h / 52);
  c.translate(w / 2, h / 2 + 4 * s); c.scale(s, s); c.translate(-12, -18);
  HL.drawDummy(c, 0, 0, skin, { face: 1 });
}

// ---------------- customize ----------------
function buildCustom() {
  const sk = HL.profile.skin;
  $('nameInput').value = HL.profile.name;
  const oc = $('optColor'); oc.innerHTML = '';
  HL.SKIN.colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (sk.color === i ? ' on' : ''); b.style.background = c.body; b.title = c.name;
    b.onclick = () => { sk.color = i; HL.sfx.click(); buildCustom(); };
    oc.appendChild(b);
  });
  const chips = (el, list, key, lockFn) => {
    el.innerHTML = '';
    list.forEach((name, i) => {
      const b = document.createElement('button');
      const locked = lockFn && !lockFn(i);
      b.className = 'chip' + (sk[key] === i ? ' on' : '');
      b.innerHTML = (locked ? svg('lock') : '') + HL.esc(name);
      if (locked) { b.disabled = true; b.title = UNLOCKS[i].need; }
      b.onclick = () => { sk[key] = i; HL.sfx.click(); buildCustom(); };
      el.appendChild(b);
    });
  };
  chips($('optHat'), HL.SKIN.hats, 'hat', hatUnlocked);
  chips($('optFace'), HL.SKIN.faces, 'face');
  requestAnimationFrame(() => drawPreview($('skinPreview'), sk));
}
function openCustom(from) { returnTo = from; show('custom'); buildCustom(); }
click('btnCustom', () => openCustom('title'));
click('btnLobbyCustom', () => openCustom('lobby'));
click('btnCustomDone', () => {
  HL.profile.name = HL.cleanName($('nameInput').value);
  HL.saveProfile();
  if (Net.code) Net.send({ t: 'profile', name: HL.profile.name, skin: HL.profile.skin });
  show(returnTo);
  if (returnTo === 'lobby') renderLobby(Net.players);
});

// ---------------- settings ----------------
$('volMusic').value = HL.settings.music; $('volSfx').value = HL.settings.sfx;
$('volMusic').addEventListener('input', (e) => { HL.settings.music = +e.target.value; HL.audio.applyVolumes(); HL.saveSettings(); });
$('volSfx').addEventListener('input', (e) => { HL.settings.sfx = +e.target.value; HL.audio.applyVolumes(); HL.saveSettings(); });
$('volSfx').addEventListener('change', () => HL.sfx.jump());
click('btnSettings', () => { returnTo = 'title'; show('settings'); });
click('btnPauseSettings', () => { returnTo = 'pause'; show('settings'); });
click('btnSettingsDone', () => show(returnTo));

// ---------------- solo / world trail ----------------
let soloCourse = '1-1';
function startSolo(course) {
  if (typeof course === 'string') soloCourse = course;
  mode = 'solo';
  const seed = soloCourse === 'endless' ? (Math.random() * 1e9) | 0 : 1;
  G.start({
    mode: 'solo', myId: 'me', course: soloCourse, seed, players: [{ id: 'me', name: HL.profile.name, skin: HL.profile.skin }],
    onGo: () => SDK.gameplayStart(),
    onBroke: (time) => {
      SDK.gameplayStop(); SDK.happytime();
      const prev = trail.best[soloCourse];
      const newBest = prev == null || time < prev;
      if (newBest) trail.best[soloCourse] = time;
      saveTrail();
      setTimeout(() => showResults({ solo: true, time, best: trail.best[soloCourse], newBest, cause: lastCause }), 1600);
    },
  });
  HL.music.play('race', raceVariant(soloCourse, seed));
  show(null);
}
let lastCause = '';
const raceVariant = (course, seed) => HL.RACE_VARIANTS[course === 'endless' ? seed % 5 : ((HL.COURSES.find((c) => c.id === course) || { world: 0 }).world)] || {};
// medals: target times scale with course length
const medalTimes = (id) => {
  const c = HL.COURSES.find((q) => q.id === id);
  if (!c) return null;
  if (!c._len) c._len = HL.buildCourse(id).finishX / HL.T;
  const gold = Math.round((c._len / 5.2 + 12) / 5) * 5;
  return { gold, silver: Math.round(gold * 1.6 / 5) * 5 };
};
const medal = (id, t) => { const m = medalTimes(id); if (!m || t == null) return ''; return t <= m.gold ? 'g' : t <= m.silver ? 's' : 'b'; };
const fmt = (t) => (t == null ? '' : t.toFixed(1) + 's');
let trailWorld = 0;
const worldUnlocked = (wi) => courseUnlocked(wi * HL.STAGES_PER_WORLD);
function openTrail() {
  const first = HL.COURSES.findIndex((c) => trail.best[c.id] == null);
  trailWorld = first === -1 ? HL.WORLDS.length - 1 : HL.COURSES[first].world;
  renderTrail();
  show('trail');
}
function renderTrail() {
  const tabs = $('worldTabs'); tabs.innerHTML = '';
  HL.WORLDS.forEach((w, wi) => {
    const b = document.createElement('button');
    b.className = 'wtab' + (wi === trailWorld ? ' on' : '');
    b.disabled = !worldUnlocked(wi); b.title = `World ${wi + 1}: ${w.name}`;
    b.innerHTML = b.disabled ? svg('lock') : worldSvg(w.icon);
    b.onclick = () => { HL.sfx.click(); trailWorld = wi; renderTrail(); };
    tabs.appendChild(b);
  });
  const w = HL.WORLDS[trailWorld], per = HL.STAGES_PER_WORLD;
  const done = w.stages.filter((_, si) => trail.best[HL.COURSES[trailWorld * per + si].id] != null).length;
  $('worldName').innerHTML = `${HL.esc(w.name)}<small>World ${trailWorld + 1} of ${HL.WORLDS.length} · ${done}/${per} broken</small>`;
  const row = $('stageRow'); row.innerHTML = '';
  w.stages.forEach((st, si) => {
    const idx = trailWorld * per + si, c = HL.COURSES[idx], b = document.createElement('button');
    const ok = courseUnlocked(idx), best = trail.best[c.id];
    b.className = 'stg' + (best != null ? ' done' : '');
    b.disabled = !ok;
    b.innerHTML = ok ? `${c.id}<span>${HL.esc(st[0])}</span><span>${best != null ? medalHTML(medal(c.id, best)) + fmt(best) : ''}</span>` : `${svg('lock')}<span>${c.id}</span>`;
    b.onclick = () => { HL.sfx.ui(); startSolo(c.id); };
    row.appendChild(b);
  });
  const total = HL.COURSES.filter((c) => trail.best[c.id] != null).length;
  $('trailNote').textContent = `${total}/${HL.COURSES.length} stages broken. Beat a stage to unlock the next one.`;
  $('wPrev').disabled = trailWorld === 0;
  $('wNext').disabled = trailWorld >= HL.WORLDS.length - 1 || !worldUnlocked(trailWorld + 1);
}
click('wPrev', () => { if (trailWorld > 0) { trailWorld--; renderTrail(); } });
click('wNext', () => { if (trailWorld < HL.WORLDS.length - 1 && worldUnlocked(trailWorld + 1)) { trailWorld++; renderTrail(); } });
click('btnSolo', openTrail);
click('btnTrailBack', () => show('title'));
click('btnSoloEndless', () => startSolo('endless'));

// ---------------- pause ----------------
function openPause() {
  show('pause');
  $('btnRestart').classList.toggle('hidden', mode !== 'solo' && mode !== 'local');
  $('pauseNote').textContent = mode === 'online' ? 'The race keeps going while this menu is open!' : '';
  if (mode === 'solo' || mode === 'local') SDK.gameplayStop();
}
function closePause() { show(null); if ((mode === 'solo' || mode === 'local') && G.getState() === 'race') SDK.gameplayStart(); }
click('btnPause', openPause);
click('btnResume', closePause);
click('btnRestart', () => { if (mode === 'solo') startSolo(soloCourse); else if (mode === 'local') startLocal(localCourse); });
click('btnQuit', () => {
  G.stop(); SDK.gameplayStop();
  if (mode === 'online') Net.leave(true);
  mode = null; HL.music.play('menu'); show('title');
});

// ---------------- results ----------------
function showResults(r) {
  SDK.gameplayStop();
  show('results');
  const btns = $('resButtons'); btns.innerHTML = '';
  const add = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => { HL.sfx.ui(); fn(); }; btns.appendChild(b); };
  $('resBestBox').classList.toggle('hidden', !r.solo);
  $('resTime').textContent = r.time.toFixed(1) + 's';
  $('resRank').textContent = '';
  if (r.solo) {
    $('resTitle').textContent = 'BROKEN!';
    let html = HL.esc(HL.courseTitle(soloCourse) + ': ' + (HL.CAUSES[r.cause] || 'Broken at last!') + (r.newBest ? ' New best time!' : ''));
    $('resBest').textContent = r.best.toFixed(1) + 's';
    const mt = medalTimes(soloCourse);
    if (mt) html += `<br>${medalHTML(medal(soloCourse, r.time))} Medals: ${medalHTML('g')}${mt.gold}s · ${medalHTML('s')}${mt.silver}s`;
    drawWinner(HL.profile.skin);
    const idx = HL.COURSES.findIndex((c) => c.id === soloCourse);
    const next = HL.COURSES[idx + 1];
    if (next) add('Next: ' + next.id, 'pink', () => SDK.midgame(() => startSolo(next.id)));
    else if (idx === HL.COURSES.length - 1) html += '<br>You finished every world!';
    $('resText').innerHTML = html;
    add('Again', next ? 'alt' : 'pink', () => SDK.midgame(() => startSolo(soloCourse)));
    add('Trail', 'alt', () => { G.stop(); mode = null; HL.music.play('menu'); openTrail(); });
    if (soloCourse !== 'endless') add('Ranks', 'alt', () => { G.stop(); mode = null; HL.music.play('menu'); openLeader(soloCourse); });
    if (r.newBest && soloCourse !== 'endless' && HL.lb.online()) {
      const c = soloCourse;
      $('resRank').textContent = 'Sending your time to the leaderboard...';
      HL.lb.submit(c, r.time).then((rank) => { if (screen === 'results' && soloCourse === c) $('resRank').textContent = rank ? `World rank #${rank} on ${c}!` : 'Could not reach the leaderboard.'; });
    }
  } else if (r.local) {
    const pi = r.id === 'p2' ? 1 : 0, players = G.locals();
    $('resTitle').textContent = `PLAYER ${pi + 1} WINS!`;
    const loser = players[1 - pi];
    $('resText').textContent = `${HL.courseTitle(localCourse)}: ${HL.CAUSES[r.cause] || 'Broken first!'}\n${loser ? loser.name + ' is still... safe. Ugh.' : ''}`;
    drawWinner(players[pi] ? players[pi].skin : HL.profile.skin);
    add('Rematch', 'pink', () => SDK.midgame(() => startLocal(localCourse)));
    add('New course', 'alt', () => SDK.midgame(() => startLocal('random')));
    add('Menu', 'alt', () => { G.stop(); mode = null; HL.music.play('menu'); openLocal(); });
  } else {
    const won = r.id === Net.myId;
    $('resTitle').textContent = won ? 'YOU WIN!' : `${r.name} wins!`;
    $('resText').textContent = won ? (HL.CAUSES[r.cause] || 'Broken first!') + ' Everyone else is still disgustingly safe.'
      : `${r.name} got broken first. You are still... safe.`;
    const rank = G.standings(r.id).map((q, i) => `${['1st', '2nd', '3rd'][i] || ''} ${q.name}${q.id === r.id ? ' (broken!)' : ` (${Math.round(q.pct)}%)`}`).join('   ');
    $('resText').textContent += '\n' + rank;
    const p = Net.players.find((q) => q.id === r.id);
    drawWinner(p ? p.skin : HL.profile.skin);
    if (Net.isHost) { add('Next race', 'pink', () => Net.startRace()); add('Lobby', 'alt', () => Net.backToLobby()); }
    else add('Waiting for host...', 'alt', () => {});
    add('Leave', 'alt', () => { G.stop(); Net.leave(true); mode = null; HL.music.play('menu'); show('title'); });
    if (!Net.isHost) btns.firstChild.disabled = true;
  }
}
function drawWinner(skin) { requestAnimationFrame(() => drawPreview($('winnerCanvas'), skin)); }

// ---------------- 2 players, same keyboard ----------------
let localSel = 'random', localCourse = '1-1';
const p2Skin = () => { if (!HL.profile.p2) HL.profile.p2 = { color: (HL.profile.skin.color + 3) % 9, hat: 1, face: 1 }; return HL.profile.p2; };
function fillCourseSelect(sel, extra) {
  if (sel.options.length) return;
  for (const v of [...extra, ...HL.COURSES.map((c) => c.id)]) { const o = document.createElement('option'); o.value = v; o.textContent = HL.courseTitle(v); sel.appendChild(o); }
}
function openLocal() {
  show('local');
  const sel = $('localCourse'); fillCourseSelect(sel, ['random', 'endless']); sel.value = localSel;
  $('p1Name').textContent = HL.profile.name;
  requestAnimationFrame(() => { drawPreview($('p1Prev'), HL.profile.skin); drawPreview($('p2Prev'), p2Skin()); });
}
function startLocal(sel) {
  const course = sel === 'random' ? HL.pick(HL.COURSES).id : sel;
  localCourse = course; mode = 'local';
  for (const s of keysP) s.left = s.right = s.jump = false; mergeKeys();
  const seed = course === 'endless' ? (Math.random() * 1e9) | 0 : 1;
  G.start({
    mode: 'local', myId: 'p1', locals: ['p1', 'p2'], course, seed,
    players: [{ id: 'p1', name: HL.profile.name, skin: HL.profile.skin }, { id: 'p2', name: 'Player 2', skin: p2Skin() }],
    onGo: () => SDK.gameplayStart(),
    onBroke: (time, cause, id) => { SDK.gameplayStop(); SDK.happytime(); setTimeout(() => { if (mode === 'local') showResults({ local: true, id, time, cause }); }, 1600); },
  });
  HL.music.play('race', raceVariant(course, seed));
  show(null);
}
click('btnLocal', openLocal);
click('btnLocalBack', () => show('title'));
click('btnLocalStart', () => { localSel = $('localCourse').value; startLocal(localSel); });
click('p2Color', () => { const s = p2Skin(); s.color = (s.color + 1) % HL.SKIN.colors.length; HL.saveProfile(); drawPreview($('p2Prev'), s); });
click('p2Hat', () => { const s = p2Skin(); do s.hat = (s.hat + 1) % HL.SKIN.hats.length; while (!hatUnlocked(s.hat)); HL.saveProfile(); drawPreview($('p2Prev'), s); });

// ---------------- leaderboard ----------------
let lbCourse = '1-1';
function openLeader(course) {
  if (course && course !== 'endless') lbCourse = course;
  show('leader');
  const sel = $('lbCourse');
  if (!sel.options.length) { fillCourseSelect(sel, []); sel.addEventListener('change', () => { lbCourse = sel.value; loadLeader(); }); }
  loadLeader();
}
function renderLeaderRows(rows) {
  const list = $('lbList'); list.innerHTML = '';
  rows.forEach((r, i) => {
    const li = document.createElement('li'); if (r.me) li.className = 'me';
    li.innerHTML = `<span class="rk">${i + 1}</span>${medalHTML(medal(lbCourse, r.t))}<span class="nm">${HL.esc(r.name)}${r.me ? ' (you)' : ''}</span><span class="tm">${r.t.toFixed(1)}s</span>`;
    list.appendChild(li);
  });
}
async function loadLeader() {
  const want = lbCourse; $('lbCourse').value = want;
  const note = $('lbNote'), mine = trail.best[want], mt = medalTimes(want);
  const medalLine = mt ? ` Gold: ${mt.gold}s, silver: ${mt.silver}s.` : '';
  if (!HL.lb.online()) {
    renderLeaderRows(mine != null ? [{ name: HL.profile.name, t: mine, me: true }] : []);
    note.textContent = 'World leaderboard is offline in this build. Showing your own best.' + medalLine;
    return;
  }
  $('lbList').innerHTML = ''; note.textContent = 'Loading...';
  try {
    const rows = await HL.lb.top(want, 10);
    if (want !== lbCourse || screen !== 'leader') return;
    renderLeaderRows(rows);
    const mineIn = rows.some((r) => r.me);
    note.textContent = (rows.length ? '' : 'No times yet. Be the first! ') + (!mineIn && mine != null ? `Your best: ${mine.toFixed(1)}s.` : '') + medalLine;
  } catch (e) { if (want === lbCourse) note.textContent = "Couldn't reach the leaderboard. Check your internet."; }
}
const stepCourse = (d) => { const i = HL.COURSES.findIndex((c) => c.id === lbCourse); lbCourse = HL.COURSES[(i + d + HL.COURSES.length) % HL.COURSES.length].id; loadLeader(); };
click('btnLeader', () => openLeader());
click('btnLeaderBack', () => show('title'));
click('lbPrev', () => stepCourse(-1));
click('lbNext', () => stepCourse(1));

// ---------------- online ----------------
click('btnOnline', () => { $('onlineStatus').textContent = ''; show('online'); });
click('btnOnlineBack', () => show('title'));
click('btnCreate', () => { $('onlineStatus').textContent = 'Creating room...'; Net.host(HL.profile); });
click('btnJoin', () => {
  const code = $('codeInput').value.trim().toUpperCase();
  $('onlineStatus').textContent = 'Joining ' + code + '...';
  Net.join(code, HL.profile);
});
$('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5); });
function inviteLink(code) {
  let link = null;
  SDK.call((s) => { if (s.environment === 'crazygames' && s.game.inviteLink) link = s.game.inviteLink({ room: code }); });
  if (typeof link !== 'string' || !link) link = location.origin + location.pathname + '?room=' + code;
  return link;
}
click('btnCopy', () => {
  const code = Net.code || '', text = inviteLink(code);
  try { navigator.clipboard.writeText(text).then(() => msg('Invite link copied! Friends join instantly.')).catch(() => msg('Code: ' + code)); } catch (e) { msg('Code: ' + code); }
});
function checkInvite() {
  let room = null;
  SDK.call((s) => { if (s.game.getInviteParam) room = s.game.getInviteParam('room'); });
  if (!room) { try { room = new URLSearchParams(location.search).get('room'); } catch (e) {} }
  room = String(room || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (room.length === 5) {
    show('online'); $('codeInput').value = room;
    $('onlineStatus').textContent = 'Joining ' + room + '...';
    msg('Joining your friend\'s room ' + room + '...');
    Net.join(room, HL.profile);
  }
}
click('btnStart', () => { if (Net.isHost) Net.startRace(); });
click('btnLeave', () => { Net.leave(true); show('title'); });

function renderLobby(players) {
  $('roomCode').textContent = Net.code || '-----';
  const el = $('slots'); el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const p = players[i];
    const d = document.createElement('div');
    d.className = 'slot' + (p ? ' filled' : '');
    if (p) {
      const cv = document.createElement('canvas');
      d.appendChild(cv);
      const b = document.createElement('b'); b.innerHTML = (p.host ? svg('crown') : '') + HL.esc(p.name); d.appendChild(b);
      if (p.id === Net.myId) { const y = document.createElement('span'); y.className = 'you'; y.textContent = 'YOU'; d.appendChild(y); }
      requestAnimationFrame(() => drawPreview(cv, p.skin));
    } else {
      d.innerHTML = '<span class="small">Waiting for<br>player...</span>';
    }
    el.appendChild(d);
  }
  $('btnStart').classList.toggle('hidden', !Net.isHost);
  const sel = $('courseSelect');
  if (!sel.options.length) {
    for (const v of ['random', 'endless', ...HL.COURSES.map((c) => c.id)]) { const o = document.createElement('option'); o.value = v; o.textContent = HL.courseTitle(v); sel.appendChild(o); }
    sel.addEventListener('change', () => Net.setCourse(sel.value));
  }
  sel.value = Net.course;
  sel.classList.toggle('hidden', !Net.isHost);
  $('courseText').classList.toggle('hidden', Net.isHost);
  $('courseText').textContent = HL.courseTitle(Net.course);
  $('lobbyHint').textContent = Net.isHost
    ? (players.length < 2 ? 'Send the code to your friends! (You can also start alone to test.)' : `${players.length}/3 players. Start when ready!`)
    : 'Waiting for the host to start the race...';
}

Net.on('room', () => { if (screen === 'online' || screen === 'lobby') { show('lobby'); renderLobby(Net.players); } });
Net.on('lobby', (players) => { if (screen === 'lobby' || screen === 'online') { show('lobby'); renderLobby(players); } });
Net.on('error', (text) => { msg(text, 4000); $('onlineStatus').textContent = text; if (screen === 'lobby') show('online'); });
Net.on('closed', (text) => {
  if (text) msg(text, 4000);
  if (mode === 'online') { G.stop(); mode = null; HL.music.play('menu'); }
  if (screen !== 'title') show('title');
});
Net.on('left', (id, name) => { if (G.active) G.removeGhost(id); if (name) msg(`${name} left the room`); });
Net.on('start', (players, course, seed) => {
  mode = 'online';
  stats.races++; saveStats();
  G.start({
    mode: 'online', myId: Net.myId, players, course, seed,
    onGo: () => SDK.gameplayStart(),
    onSend: (d) => Net.send(Object.assign({ t: 'pos' }, d)),
    onBroke: (time, cause) => { lastCause = cause; Net.send({ t: 'broke', time, cause }); },
  });
  HL.music.play('race', raceVariant(course, seed));
  show(null);
});
Net.on('pos', (id, d) => { if (G.active && id !== Net.myId) G.netPos(id, d); });
Net.on('result', (r) => {
  G.end();
  if (r.id !== Net.myId) { G.ghostBroke(r.id); HL.sfx.lose(); }
  else { stats.wins++; saveStats(); SDK.happytime(); }
  SDK.gameplayStop();
  setTimeout(() => { if (mode === 'online') showResults(r); }, 1700);
});
Net.on('toLobby', () => {
  G.stop(); mode = null; HL.music.play('menu');
  SDK.midgame(() => { if (Net.code) { show('lobby'); renderLobby(Net.players); } });
});

// solo: remember the cause for the results text
const origBroke = G.start;
G.start = (o) => {
  const ob = o.onBroke;
  o.onBroke = (time, cause, id) => { lastCause = cause; if (ob) ob(time, cause, id); };
  return origBroke(o);
};

const testMode = /[?&]test\b/.test(location.search);
document.addEventListener('visibilitychange', () => { if (document.hidden && !testMode && screen === null && (mode === 'solo' || mode === 'local')) openPause(); });

// ---------------- loop ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  const k = canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (G.active) {
    const k2 = mode === 'local' ? keysP : keys;
    const frozen = (screen === 'pause' || screen === 'settings') && mode !== 'online'; // solo + 2P really pause
    if (!frozen) { G.update(dt / 2, k2); G.update(dt / 2, k2); }
    G.render(ctx);
  } else {
    renderMenuScene(dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show('title');
HL.music.play('menu');
SDK.init().then(() => { SDK.call((s) => s.game.loadingStop && s.game.loadingStop()); checkInvite(); });

// testing hook
window.__hl = { G, Net, keys, keysP, startSolo, startLocal, openTrail, openLeader, trail, step(sec) { const k = mode === 'local' ? keysP : keys; for (let t = 0; t < sec; t += 1 / 120) G.update(1 / 120, k); G.render(ctx); }, get screen() { return screen; } };
})();
