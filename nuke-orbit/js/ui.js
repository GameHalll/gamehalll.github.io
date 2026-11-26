/* =========================================================================
   NUKE ORBIT — ui.js
   DOM menus, HUD, shop, skin & world selection, results screen.
   ========================================================================= */
'use strict';

NO.UI = (function () {
  const $ = (id) => document.getElementById(id);
  const screens = ['menu', 'results', 'shop', 'chars', 'bombs', 'worlds', 'confirm'];
  let current = 'menu';
  const stack = [];
  let previewCards = [];   // {canvas, kind, id}
  let frameCount = 0;

  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const fmtShort = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : fmt(n);
  const fmtDist = (m) => (m >= 10000 ? (m / 1000).toFixed(2) + ' km' : fmt(m) + ' m');
  const data = () => NO.Save.data;

  /* ---------------------------- navigation ----------------------------- */
  function show(name, push = true) {
    if (push && current !== name && current) stack.push(current);
    current = name;
    screens.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
    previewCards = [];
    if (name === 'menu') renderMenu();
    if (name === 'shop') renderShop();
    if (name === 'chars') renderSkins('chars');
    if (name === 'bombs') renderSkins('bombs');
    if (name === 'worlds') renderWorlds();
    refreshCoins();
  }
  function hideAll() { screens.forEach((s) => $('screen-' + s).classList.add('hidden')); current = null; stack.length = 0; previewCards = []; }
  function back() {
    const prev = stack.pop();
    if (prev) show(prev, false); else NO.Game.toMenu();
  }

  /* ------------------------------ actions ------------------------------ */
  function action(a) {
    NO.Audio.init(); NO.Audio.click();
    switch (a) {
      case 'play': case 'retry': hideAll(); NO.Game.startAim(); break;
      case 'menu': NO.Game.toMenu(); break;
      case 'shop': show('shop'); break;
      case 'chars': show('chars'); break;
      case 'bombs': show('bombs'); break;
      case 'worlds': show('worlds'); break;
      case 'back': back(); break;
      case 'reset': show('confirm'); break;
      case 'confirmReset': NO.Save.reset(); NO.Game.refreshEnv(); stack.length = 0; NO.Game.toMenu(); toast('Progress reset. Fresh start!'); break;
    }
  }

  function onMode(mode) {
    const hud = $('hud');
    NO.Mods.emit('mode', mode);
    if (mode === 'menu') {
      hud.classList.add('hidden');
      stack.length = 0; show('menu', false);
      return;
    }
    hud.classList.remove('hidden');
    $('aimHint').classList.toggle('hidden', mode !== 'aim');
    $('upgCards').classList.toggle('hidden', mode !== 'aim');
    document.querySelector('.hud-left').classList.toggle('hidden', mode === 'aim');
    if (mode === 'aim') renderAimCards();
    $('btnHome').classList.toggle('hidden', mode !== 'aim');
    $('btnFast').classList.toggle('hidden', mode !== 'flight' && mode !== 'orbit');
    if (mode === 'aim') $('btnFast').classList.remove('active');
    if (mode === 'aim') { $('hudPower').textContent = '–'; $('hudBest').textContent = fmt(data().best); }
    if (mode === 'flight' && !NO.Game.state.orbit) $('hudPower').textContent = Math.round(NO.Game.state.lockedPower * 100) + '%' + (NO.Game.state.perfect ? ' ★' : '');
  }

  /* -------------------------------- HUD -------------------------------- */
  const last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  function hud(S) {
    if (S.mode === 'menu' || !S.run) return;
    const b = S.bomb;
    setText('hudDist', fmt(S.run.distance));
    setText('hudCoins', fmt(S.mode === 'aim' ? data().coins : S.run.collected + S.run.milestoneCoins + (S.run.modCoins || 0)));
    if (S.mode === 'orbit') { setText('hudSpeed', fmt(S.orbit.speed * 3.6)); setText('hudAlt', 'ORBIT'); return; }
    setText('hudSpeed', fmt(Math.hypot(b.vx, b.vy) * 3.6));
    setText('hudAlt', fmt(Math.max(0, b.y - NO.CONFIG.BOMB_RADIUS)));
  }
  function coinTarget() {
    const r = $('hudCoinChip').getBoundingClientRect();
    return { x: r.left + 22, y: r.top + r.height / 2 };
  }
  function bumpCoins() {
    const c = $('hudCoinChip'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }
  function banner(title, sub) {
    const b = $('banner');
    b.querySelector('.banner-title').textContent = title;
    b.querySelector('.banner-sub').textContent = sub;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(banner._t); banner._t = setTimeout(() => b.classList.add('hidden'), 1800);
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  function refreshCoins() {
    document.querySelectorAll('.coins-now').forEach((el) => (el.textContent = fmt(data().coins)));
  }

  /* ------------------------------- menu -------------------------------- */
  function affordableUpgrades() {
    const d = data();
    return NO.UPGRADES.filter((u) => d.up[u.id] < NO.CONFIG.MAX_UPGRADE_LEVEL && d.coins >= NO.upgradeCost(u, d.up[u.id])).length;
  }
  function renderMenu() {
    const d = data();
    $('menuBest').textContent = fmtDist(d.best);
    $('menuCoins').innerHTML = '<i class="coin"></i>' + fmt(d.coins);
    $('menuWorld').textContent = NO.byId(NO.ENVIRONMENTS, d.env).name.replace('Green ', '');
    $('shopBadge').classList.toggle('hidden', affordableUpgrades() === 0);
    $('btnMute').innerHTML = d.muted ? NO.ico('mute') + 'SOUND OFF' : NO.ico('sound') + 'SOUND ON';
    NO.Mods.emit('menu');
  }

  /* -------------------------- upgrade cards ---------------------------- */
  const UPG_ORDER = ['launch', 'speed', 'bounce'];
  function upgSubtitle(id, lv) {
    const P = (l) => NO.physicsFor({ launch: id === 'launch' ? l : 0, bounce: id === 'bounce' ? l : 0, speed: id === 'speed' ? l : 0 });
    if (id === 'launch') return `Bomb is ${Math.round(P(lv).v0 / P(0).v0 * 100)}% stronger`;
    if (id === 'bounce') return `Bounces ${Math.round(P(lv).restitution / P(0).restitution * 100)}% higher`;
    return `Air drag cut by ${Math.round((1 - P(lv).drag / P(0).drag) * 100)}%`;
  }
  function cardHTML(u, lv, big) {
    const max = lv >= NO.CONFIG.MAX_UPGRADE_LEVEL;
    const cost = max ? 0 : NO.upgradeCost(u, lv);
    const can = !max && data().coins >= cost;
    return `<button class="ucard u-${u.id}${can ? ' can' : ''}${max ? ' max' : ''}${big ? ' big' : ''}" data-upg="${u.id}">
      <span class="uc-icon">${u.icon}</span>
      <span class="uc-body"><span class="uc-title">${u.name}</span><span class="uc-sub">${upgSubtitle(u.id, lv)}</span></span>
      <span class="uc-price">${max ? 'MAX' : `<i class="coin"></i>${fmtShort(cost)}`}</span>
      <span class="uc-lv">${lv}</span></button>`;
  }
  function renderAimCards() {
    const box = $('upgCards');
    box.innerHTML = UPG_ORDER.map((id) => cardHTML(NO.byId(NO.UPGRADES, id), data().up[id], false)).join('');
    box.querySelectorAll('.ucard').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); b.blur();
      if (buyUpgrade(NO.byId(NO.UPGRADES, b.dataset.upg))) renderAimCards();
      else { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
    }));
  }

  /* ------------------------------- shop -------------------------------- */
  function renderShop() {
    const d = data();
    const grid = $('shopGrid');
    grid.innerHTML = '';
    UPG_ORDER.forEach((id) => {
      const u = NO.byId(NO.UPGRADES, id), lv = d.up[id];
      const max = lv >= NO.CONFIG.MAX_UPGRADE_LEVEL;
      const el = document.createElement('div');
      el.className = 'upg u-' + id;
      el.innerHTML = cardHTML(u, lv, true) + `
        <div class="upg-desc">${u.desc}</div>
        <div class="pips">${Array.from({ length: 30 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <div class="upg-stat">LEVEL ${lv}/${NO.CONFIG.MAX_UPGRADE_LEVEL} · ${u.stat(lv)}${max ? '' : ' → ' + u.stat(lv + 1)}</div>`;
      el.querySelector('.ucard').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (!buyUpgrade(u)) { btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); }
      });
      grid.appendChild(el);
    });
    refreshCoins();
  }
  function buyUpgrade(u) {
    const d = data();
    const lv = d.up[u.id];
    if (lv >= NO.CONFIG.MAX_UPGRADE_LEVEL) return false;
    const cost = NO.upgradeCost(u, lv);
    if (d.coins < cost) { NO.Audio.error(); toast('Not enough coins!'); return false; }
    d.coins -= cost; d.up[u.id] = lv + 1;
    NO.Save.save(); NO.Game.refreshEnv();
    NO.Audio.buy();
    if (current === 'shop') renderShop();
    $('hudTotal') && ($('hudTotal').textContent = fmt(d.coins));
    return true;
  }

  /* ----------------------- characters & bombs -------------------------- */
  function renderSkins(kind) {
    const d = data();
    const list = kind === 'chars' ? NO.CHARACTERS : NO.BOMBS;
    const owned = kind === 'chars' ? d.chars : d.bombs;
    const sel = kind === 'chars' ? d.char : d.bomb;
    const grid = $(kind === 'chars' ? 'charGrid' : 'bombGrid');
    grid.innerHTML = '';
    list.forEach((item) => {
      const has = owned.includes(item.id);
      const isSel = sel === item.id;
      const el = document.createElement('div');
      el.className = 'card' + (isSel ? ' selected' : '') + (has ? '' : ' locked');
      const btnLabel = isSel ? NO.ico('check') + 'SELECTED' : has ? 'SELECT' : `<i class="coin"></i>${fmt(item.price)}`;
      const can = has || d.coins >= item.price;
      el.innerHTML = `<canvas></canvas>${has ? '' : '<div class="lock">' + NO.ico('lock') + '</div>'}
        <div class="card-name">${item.name}</div><div class="card-tag">${item.tag}</div>
        <button class="btn ${!has && can ? 'can' : ''}" ${isSel || !can ? 'disabled' : ''}>${btnLabel}</button>`;
      el.querySelector('button').addEventListener('click', () => pickSkin(kind, item));
      grid.appendChild(el);
      previewCards.push({ canvas: el.querySelector('canvas'), kind, id: item.id, selected: isSel });
    });
    sizePreviews();
    refreshCoins();
  }
  function pickSkin(kind, item) {
    const d = data();
    const owned = kind === 'chars' ? d.chars : d.bombs;
    if (!owned.includes(item.id)) {
      if (d.coins < item.price) { NO.Audio.error(); toast('Not enough coins!'); return; }
      d.coins -= item.price; owned.push(item.id); NO.Audio.buy(); toast(item.name + ' unlocked!');
    } else NO.Audio.click();
    if (kind === 'chars') d.char = item.id; else d.bomb = item.id;
    NO.Save.save();
    renderSkins(kind);
  }

  /* ------------------------------- worlds ------------------------------ */
  function renderWorlds() {
    const d = data();
    $('worldsBest').textContent = fmtDist(d.best);
    const grid = $('worldGrid');
    grid.innerHTML = '';
    NO.ENVIRONMENTS.forEach((e) => {
      const open = d.best >= e.unlock;
      const isSel = d.env === e.id;
      const el = document.createElement('div');
      el.className = 'card' + (isSel ? ' selected' : '') + (open ? '' : ' locked');
      const best = d.bestByEnv[e.id] ? 'Best here: ' + fmtDist(d.bestByEnv[e.id]) : open ? 'Not launched here yet' : `Reach ${fmtDist(e.unlock)} to unlock`;
      el.innerHTML = `<canvas></canvas><div class="mult">x${e.mult} COINS</div>${open ? '' : '<div class="lock">' + NO.ico('lock') + '</div>'}
        <div class="card-name">${e.name}</div><div class="card-tag">${best}${e.gravity < 1 ? ' · Low gravity!' : ''}</div>
        <button class="btn" ${isSel || !open ? 'disabled' : ''}>${isSel ? NO.ico('check') + 'SELECTED' : open ? 'SELECT' : NO.ico('lock') + ' ' + fmtDist(e.unlock)}</button>`;
      el.querySelector('button').addEventListener('click', () => {
        d.env = e.id; NO.Save.save(); NO.Game.refreshEnv(); NO.Audio.click(); renderWorlds();
      });
      grid.appendChild(el);
      previewCards.push({ canvas: el.querySelector('canvas'), kind: 'world', id: e.id, selected: isSel });
    });
    sizePreviews();
  }

  function sizePreviews() {
    requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      previewCards.forEach((p) => {
        const r = p.canvas.getBoundingClientRect();
        p.canvas.width = Math.max(10, Math.round(r.width * dpr));
        p.canvas.height = Math.max(10, Math.round(r.height * dpr));
        p.dpr = dpr; p.drawn = false;
      });
    });
  }

  function drawPreview(p, t) {
    const c = p.canvas, g = c.getContext('2d');
    const w = c.width, h = c.height;
    if (p.kind === 'world') {
      if (p.drawn && frameCount % 4) return;
      NO.Game.drawEnvThumb(c, p.id);
      p.drawn = true;
      return;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    // little ground strip
    g.fillStyle = 'rgba(92,192,74,.9)'; g.fillRect(0, h * 0.86, w, h * 0.14);
    if (p.kind === 'chars') {
      const cycle = (t % 2.6) / 1.2;
      const prog = p.selected && cycle <= 1 ? cycle : null;
      NO.Art.drawCharacter(g, p.id, w * 0.42, h * 0.88, h / 160, t, prog);
    } else {
      NO.Art.drawBomb(g, p.id, w * 0.5, h * 0.48 + Math.sin(t * 2) * h * 0.03, w * 0.72, Math.sin(t * 1.5) * 0.15 - 0.1, t, 0);
    }
  }

  /* ------------------------------ results ------------------------------ */
  const TITLES = ['KA-BOOM!', 'NUKED IT!', 'WELL, THAT HAPPENED', 'OOPS, ALL CRATERS', 'GLOWING REVIEW!', 'FALLOUT BOY!', 'SPLENDID BOOM!'];
  function showResults(r) {
    hideAll();
    $('hud').classList.add('hidden');
    $('resTitle').textContent = TITLES[Math.floor(Math.random() * TITLES.length)];
    $('resRecord').classList.toggle('hidden', !r.isRecord);
    $('resSub').textContent = `Top speed ${fmt(r.topSpeed * 3.6)} km/h · Max altitude ${fmt(r.maxAlt)} m · ${r.bounces} bounces${r.perfect ? ' · PERFECT launch!' : ''}`;
    $('resDistCoins').textContent = '+' + fmt(r.distCoins);
    $('resCollected').innerHTML = '+' + fmt(r.collected) + (r.gems ? ` (${r.gems} ${NO.ico('gem')})` : '');
    $('resMs').textContent = '+' + fmt(r.milestoneCoins);
    $('resOrbitRow').classList.toggle('hidden', !r.orbitLaps);
    $('resOrbit').textContent = '+' + fmt(r.orbitCoins) + ' (' + r.orbitLaps + ' lap' + (r.orbitLaps > 1 ? 's' : '') + ')';
    $('resOrbitHint').innerHTML = r.orbitLaps ? NO.ico('planet') + ' You reached ORBIT!' :
      `${NO.ico('planet')} Orbit needs <b>${fmt(NO.CONFIG.ORBIT_VX * 3.6)} km/h</b> at the top of the arc · you had ${fmt(r.apexVx * 3.6)} km/h`;
    $('resModRow').classList.toggle('hidden', !r.modCoins);
    $('resMod').textContent = '+' + fmt(r.modCoins || 0);
    $('resModLabel').innerHTML = NO.ico('star') + ' ' + ((r.modRows && r.modRows.length) ? r.modRows.map((x) => x.label).join(' · ') : 'Bonus');
    $('resMult').textContent = 'x' + r.mult;
    $('resBest').textContent = fmtDist(r.best);
    $('resCoins').textContent = fmt(data().coins);
    // count-up animations
    countUp($('resDist'), r.distance, 1.0, (v) => fmt(v));
    countUp($('resTotal'), r.total, 1.2, (v) => '+' + fmt(v));
    const u = $('resUnlock');
    if (r.newWorlds.length) { u.classList.remove('hidden'); u.innerHTML = NO.ico('globe') + ' NEW WORLD UNLOCKED: ' + r.newWorlds.map((e) => e.name.toUpperCase()).join(', ') + '!'; }
    else u.classList.add('hidden');
    const n = affordableUpgrades();
    const nextEnv = NO.ENVIRONMENTS.find((e) => data().best < e.unlock);
    $('resHint').innerHTML = n ? `${NO.ico('bulb')} You can afford ${n} upgrade${n > 1 ? 's' : ''}!` : nextEnv ? `Next world: ${nextEnv.name} at ${fmtDist(nextEnv.unlock)}` : 'All worlds unlocked. Absolute legend.';
    current = 'results'; stack.length = 0;
    $('screen-results').classList.remove('hidden');
  }
  function countUp(el, target, dur, f) {
    const start = performance.now();
    function step(now) {
      const k = Math.min(1, (now - start) / 1000 / dur);
      el.textContent = f(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ------------------------------- tick -------------------------------- */
  function tick(dt, t) {
    frameCount++;
    for (const p of previewCards) if (p.canvas.width > 10) drawPreview(p, t);
  }

  /* ------------------------------- init -------------------------------- */
  function init() {
    document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); action(b.dataset.action); }));
    $('btnMute').addEventListener('click', () => {
      const d = data(); d.muted = !d.muted; NO.Save.save(); renderMenu(); NO.Audio.init(); NO.Audio.click();
    });
    const fast = $('btnFast');
    fast.addEventListener('click', () => {
      const on = !fast.classList.contains('active');
      fast.classList.toggle('active', on); NO.Game.setFast(on); fast.blur();
    });
    window.addEventListener('resize', () => { if (previewCards.length) sizePreviews(); });
  }

  return { init, show, back, action, onMode, hud, coinTarget, bumpCoins, banner, toast, showResults, tick, get current() { return current; } };
})();
