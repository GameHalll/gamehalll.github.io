/* =========================================================================
   NUKE ORBIT mod: missions — 3 rotating missions + daily login streak.
   - Missions scale with the player's records (stored in NO.Mods.store('missions')).
   - Single-run goals are tracked live during flight; a toast pops when one completes.
   - Rewards are claimed in the main menu or on the results screen and are paid
     straight into NO.Save.data.coins (they are not part of a run).
   ========================================================================= */
'use strict';

(function () {
  const ID = 'missions';
  const SLOTS = 3;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* "nice" round numbers for targets */
  function nice(v) {
    if (v < 20) return Math.max(1, Math.round(v));
    if (v < 100) return Math.round(v / 5) * 5;
    if (v < 500) return Math.round(v / 10) * 10;
    if (v < 2000) return Math.round(v / 50) * 50;
    if (v < 10000) return Math.round(v / 100) * 100;
    return Math.round(v / 500) * 500;
  }

  /* ----------------------------- persistent data ----------------------------- */
  function st() {
    const s = NO.Mods.store(ID);
    if (!Array.isArray(s.list)) s.list = [];
    if (!s.pb || typeof s.pb !== 'object') s.pb = {};
    if (!s.daily || typeof s.daily !== 'object') s.daily = { last: '', streak: 0 };
    if (!(s.done >= 0)) s.done = 0;
    if (!(s.seq >= 0)) s.seq = 0;
    return s;
  }
  function data() { return NO.Save.data; }

  /* rough coins one run pays at the player's level (for reward scaling) */
  function runCoins() {
    const best = data().best || 0;
    const env = NO.byId(NO.ENVIRONMENTS, data().env);
    return Math.max(15, (best * 0.55 + 12) * Math.min(env.mult, 1.6));
  }

  /* personal records used to scale difficulty (fall back to estimates from best) */
  function ref() {
    const s = st(), best = data().best || 0;
    const v0 = NO.physicsFor(data().up).v0 * 3.6;
    return {
      dist: Math.max(18, best),
      alt: Math.max(4, s.pb.alt || best * 0.06),
      bounces: Math.max(2, s.pb.bounces || Math.round(2 + data().up.bounce * 0.3)),
      collected: Math.max(6, s.pb.collected || best * 0.05),
      speed: Math.max(v0, s.pb.speed || 0),
      v0,
    };
  }

  /* ------------------------------ mission types ------------------------------ */
  // live: progress read from the current run every frame (single-run goals)
  const TYPES = {
    dist:    { icon: NO.ico('ruler'), live: true,  text: (m) => `Reach ${fmt(m.target)} m in one run`,
               gen: (R, f) => nice(Math.max(20, R.dist * f)), val: (S) => S.run.distance },
    alt:     { icon: NO.ico('balloon'), live: true,  text: (m) => `Fly ${fmt(m.target)} m high`,
               gen: (R, f) => nice(Math.max(4, R.alt * f)), val: (S) => S.run.maxAlt },
    bounce:  { icon: NO.ico('ball'), live: true,  text: (m) => `Bounce ${m.target} times in one run`,
               gen: (R, f) => clamp(Math.round(R.bounces * f + (f > 1 ? 1 : 0)), 2, 40), val: (S) => S.bomb.bounces },
    collect: { icon: NO.ico('coin'), live: true,  text: (m) => `Grab ${fmt(m.target)} coins in one run`,
               gen: (R, f) => nice(Math.max(6, R.collected * f)), val: (S) => S.run.collected },
    speed:   { icon: NO.ico('wind'), live: true,  text: (m) => `Hit ${fmt(m.target)} km/h`,
               gen: (R, f) => nice(R.v0 * clamp(0.7 + f * 0.3, 0.8, 1.04)), val: (S) => S.run.topSpeed * 3.6 },
    perfect: { icon: NO.ico('target'), live: false, text: (m) => `Land ${m.target} PERFECT launches`,
               gen: (R, f) => clamp(Math.round(1 + f * 2.2), 2, 4) },
    combo:   { icon: NO.ico('fire'), live: false, text: (m) => `${m.target} PERFECT launches in a row`,
               gen: (R, f) => (f > 0.95 ? 3 : 2) },
    world:   { icon: NO.ico('globe'), live: false, text: (m) => `Launch ${m.target}x in ${envName(m.env)}`,
               gen: (R, f) => (f > 0.95 ? 3 : 2) },
    total:   { icon: NO.ico('road'), live: false, text: (m) => `Travel ${fmt(m.target)} m in total`,
               gen: (R, f) => nice(Math.max(80, R.dist * (1.6 + f * 2))) },
    orbit:   { icon: NO.ico('planet'), live: true,  text: () => 'Break into ORBIT',
               gen: () => 1, val: (S) => (S.mode === 'orbit' || S.run.orbitLaps > 0 ? 1 : 0) },
  };
  function envName(id) { return NO.byId(NO.ENVIRONMENTS, id).name.replace('Green ', ''); }
  const TIERS = [
    { f: [0.55, 0.72], pay: 1.0 },
    { f: [0.78, 0.92], pay: 1.6 },
    { f: [0.97, 1.12], pay: 2.5 },
  ];

  function available() {
    const d = data();
    const types = ['dist', 'alt', 'bounce', 'collect', 'speed', 'perfect', 'combo', 'total'];
    if (NO.ENVIRONMENTS.some((e) => e.id !== 'country' && d.best >= e.unlock)) types.push('world');
    // orbit only once the player is getting close to orbit speed at the apex
    if ((st().pb.apexVx || 0) >= NO.CONFIG.ORBIT_VX * 0.8 || d.best >= 3000) types.push('orbit');
    return types;
  }

  function makeMission(exclude) {
    const R = ref();
    let pool = available().filter((t) => !exclude.includes(t));
    if (!pool.length) pool = available();
    const type = pool[Math.floor(Math.random() * pool.length)];
    const tier = type === 'orbit' ? 2 : Math.random() < 0.45 ? 0 : Math.random() < 0.7 ? 1 : 2;
    const T = TIERS[tier], f = rnd(T.f[0], T.f[1]);
    const m = { id: ++st().seq, type, tier, target: TYPES[type].gen(R, f), prog: 0, done: false };
    if (type === 'world') {
      const d = data();
      const worlds = NO.ENVIRONMENTS.filter((e) => d.best >= e.unlock && e.id !== d.env);
      m.env = (worlds.length ? worlds[Math.floor(Math.random() * worlds.length)] : NO.byId(NO.ENVIRONMENTS, d.env)).id;
    }
    m.reward = Math.max(10, nice(runCoins() * T.pay * (type === 'orbit' ? 1.5 : 1)));
    return m;
  }

  function ensure() {
    const s = st();
    s.list = s.list.filter((m) => m && TYPES[m.type]);
    while (s.list.length < SLOTS) s.list.push(makeMission(s.list.map((m) => m.type)));
    return s.list;
  }

  /* ------------------------------- progress ---------------------------------- */
  let runActive = false, startProg = {};
  function complete(m) {
    if (m.done) return;
    m.done = true; m.prog = m.target;
    st().done++;
    pop('MISSION COMPLETE!', TYPES[m.type].text(m), m.reward);
    try { NO.Audio.milestone(); } catch (e) { /* audio optional */ }
    NO.Save.save();
  }
  function setProg(m, v) {
    if (m.done) return;
    m.prog = Math.max(m.prog, Math.min(m.target, v));
    if (v >= m.target) complete(m);
  }

  /* ------------------------------ daily streak ------------------------------- */
  function dayKey(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  function today() { return dayKey(new Date()); }
  function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
  function dailyState() {
    const dl = st().daily;
    const can = dl.last !== today();
    const keep = dl.last === yesterday() || dl.last === today();
    const streak = can ? (keep ? dl.streak + 1 : 1) : dl.streak;
    const day = ((streak - 1) % 7) + 1;
    const reward = Math.max(15, nice(runCoins() * (0.5 + 0.25 * (day - 1)) * (day === 7 ? 1.5 : 1)));
    return { can, streak, day, reward };
  }
  function claimDaily(btn) {
    const ds = dailyState();
    if (!ds.can) return;
    const dl = st().daily;
    dl.streak = ds.streak; dl.last = today();
    payout(ds.reward, btn);
    renderMenu();
  }

  /* --------------------------------- payout ---------------------------------- */
  function payout(n, fromEl) {
    const d = data();
    d.coins += n;
    NO.Save.save();
    try { NO.Audio.buy(); } catch (e) { /* audio optional */ }
    floatText('+' + fmt(n), fromEl);
    // refresh visible coin counters without re-rendering foreign screens
    const mc = $('menuCoins'); if (mc) mc.innerHTML = '<i class="coin"></i>' + fmt(d.coins);
    const rc = $('resCoins'); if (rc) rc.textContent = fmt(d.coins);
    document.querySelectorAll('.coins-now').forEach((el) => (el.textContent = fmt(d.coins)));
    const badge = $('shopBadge');
    if (badge) {
      const can = NO.UPGRADES.some((u) => d.up[u.id] < NO.CONFIG.MAX_UPGRADE_LEVEL && d.coins >= NO.upgradeCost(u, d.up[u.id]));
      badge.classList.toggle('hidden', !can);
    }
  }
  function claim(id, btn, where) {
    const s = st();
    const i = s.list.findIndex((m) => m.id === id);
    if (i < 0 || !s.list[i].done) return;
    const m = s.list[i];
    payout(m.reward, btn);
    s.list.splice(i, 1);
    s.list.splice(i, 0, makeMission(s.list.map((x) => x.type).concat(m.type)));
    NO.Save.save();
    if (where === 'results') renderResults(); else renderMenu();
  }

  /* ----------------------------------- DOM ----------------------------------- */
  function injectStyle() {
    if ($('missions-style')) return;
    const css = `
#missions-menu { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.missions-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.missions-title { font-family: var(--font-display); font-weight: 700; color: #fff; font-size: 17px; letter-spacing: 1px; text-shadow: 0 2px 0 var(--drop); }
.missions-title small { font-family: var(--font-body); font-weight: 900; font-size: 11px; opacity: .8; margin-left: 6px; letter-spacing: 1px; }
.missions-daily { font-family: var(--font-display); font-weight: 700; font-size: 14px; border: none; border-radius: 999px; padding: 5px 12px;
  background: rgba(255,255,255,.95); color: var(--ink); box-shadow: 0 3px 0 var(--drop); cursor: default; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.missions-daily.can { background: var(--yellow); box-shadow: 0 4px 0 #d18f12; cursor: pointer; animation: missions-wiggle 1.6s ease-in-out infinite; }
.missions-daily.can:active { transform: translateY(3px); box-shadow: 0 1px 0 #d18f12; animation: none; }
.missions-daily .missions-pips { display: inline-flex; gap: 2px; }
.missions-daily .missions-pips i { width: 6px; height: 6px; border-radius: 50%; background: rgba(31,27,77,.18); }
.missions-daily .missions-pips i.on { background: var(--red); }
@keyframes missions-wiggle { 0%, 70%, 100% { transform: none; } 78% { transform: rotate(-4deg) scale(1.06); } 86% { transform: rotate(4deg) scale(1.06); } 94% { transform: rotate(-2deg); } }
.missions-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.missions-card { position: relative; background: rgba(255,255,255,.95); border-radius: 14px; box-shadow: 0 4px 0 var(--drop); padding: 7px 9px 8px;
  display: flex; flex-direction: column; gap: 4px; text-align: left; min-width: 0; }
.missions-card .missions-top { display: flex; gap: 6px; align-items: flex-start; }
.missions-card .missions-ico { font-size: 18px; line-height: 1; filter: drop-shadow(0 2px 0 rgba(0,0,0,.15)); }
.missions-card .missions-txt { font-weight: 900; font-size: 12.5px; line-height: 1.15; flex: 1; min-width: 0; padding-right: 18px; }
.missions-bar { height: 8px; border-radius: 999px; background: rgba(31,27,77,.12); overflow: hidden; }
.missions-bar i { display: block; height: 100%; border-radius: 999px; background: var(--blue); transition: width .6s cubic-bezier(.2,.9,.3,1.2); }
.missions-card.t1 .missions-bar i { background: var(--orange); }
.missions-card.t2 .missions-bar i { background: var(--red); }
.missions-meta { display: flex; justify-content: space-between; align-items: center; font-weight: 900; font-size: 11px; gap: 4px; }
.missions-meta span { opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.missions-meta b { font-family: var(--font-display); font-weight: 700; font-size: 13px; white-space: nowrap; }
.missions-stars { position: absolute; top: -7px; right: 8px; font-size: 10px; letter-spacing: -1px; background: var(--ink); color: var(--yellow); border-radius: 999px; padding: 1px 6px; }
.missions-card.done { background: #e5f8e5; box-shadow: 0 4px 0 #3a9a3a; }
.missions-claim { flex: 1; font-family: var(--font-display); font-weight: 700; font-size: 14px; border: none; border-radius: 10px; padding: 4px 8px; cursor: pointer;
  background: var(--green); color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,.2); box-shadow: 0 3px 0 #3a9a3a; animation: missions-pulse 1s ease-in-out infinite; white-space: nowrap; }
.missions-claim:active { transform: translateY(3px); box-shadow: 0 0 0 #3a9a3a; animation: none; }
/* results section */
#missions-res { margin-top: 12px; text-align: left; }
#missions-res .missions-rhead { font-family: var(--font-display); font-weight: 700; font-size: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
#missions-res .missions-rhead small { font-family: var(--font-body); font-weight: 900; font-size: 11px; opacity: .55; letter-spacing: 1px; }
#missions-res .missions-row { gap: 8px; }
#missions-res .missions-card { background: var(--panel2); box-shadow: none; }
#missions-res .missions-card.done { background: #e5f8e5; box-shadow: inset 0 0 0 3px var(--green); }
#missions-res .missions-card.fresh { animation: missions-pop .5s ease; }
.missions-delta { color: #2e8f2e; }
@keyframes missions-pulse { 50% { transform: scale(1.06); filter: brightness(1.08); } }
@keyframes missions-pop { 0% { transform: scale(.85); } 60% { transform: scale(1.06); } 100% { transform: none; } }
/* in-run toast */
#missions-toast { position: fixed; left: 50%; bottom: calc(max(16px, env(safe-area-inset-bottom)) + 150px); z-index: 16; pointer-events: none;
  transform: translateX(-50%); display: flex; align-items: center; gap: 10px; background: #fff; color: var(--ink); border-radius: 18px;
  padding: 8px 16px 8px 10px; box-shadow: 0 5px 0 #3a9a3a, 0 10px 0 var(--drop); max-width: calc(100vw - 32px); animation: missions-toastIn 2.8s ease forwards; }
#missions-toast .missions-tico { font-size: 28px; width: 42px; height: 42px; border-radius: 12px; background: var(--green); display: grid; place-items: center; flex: none; }
#missions-toast b { display: block; font-family: var(--font-display); font-weight: 700; font-size: 17px; color: #2e8f2e; letter-spacing: .5px; }
#missions-toast span { display: block; font-weight: 900; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#missions-toast em { font-style: normal; font-family: var(--font-display); font-weight: 700; font-size: 16px; background: var(--yellow); border-radius: 999px; padding: 2px 10px; box-shadow: 0 2px 0 #d18f12; white-space: nowrap; flex: none; }
@keyframes missions-toastIn {
  0% { transform: translateX(-50%) translateY(40px) scale(.7); opacity: 0; }
  10% { transform: translateX(-50%) translateY(-6px) scale(1.05); opacity: 1; }
  16% { transform: translateX(-50%) scale(1); }
  85% { transform: translateX(-50%) scale(1); opacity: 1; }
  100% { transform: translateX(-50%) translateY(20px) scale(.9); opacity: 0; } }
.missions-float { position: fixed; z-index: 60; pointer-events: none; font-family: var(--font-display); font-weight: 700; font-size: 24px; color: var(--yellow);
  text-shadow: 0 3px 0 #d18f12, 0 5px 0 var(--drop); transform: translate(-50%, -50%); animation: missions-float 1s ease-out forwards; }
@keyframes missions-float { to { transform: translate(-50%, -160%) scale(1.3); opacity: 0; } }
@media (max-width: 520px) {
  .missions-row { gap: 6px; }
  .missions-card { padding: 6px 7px 7px; }
  .missions-card .missions-ico { font-size: 15px; }
  .missions-card .missions-txt { font-size: 11px; }
  .missions-meta b { font-size: 12px; }
  .missions-claim { font-size: 12px; padding: 3px 6px; }
}
@media (max-height: 780px) {
  #missions-menu { gap: 5px; margin-top: -8px; }
  .missions-title, .missions-daily { font-size: 14px; }
  .missions-daily { padding: 3px 10px; }
  .missions-card { padding: 5px 8px 6px; gap: 3px; }
  .missions-bar { height: 7px; }
}`;
    const el = document.createElement('style');
    el.id = 'missions-style'; el.textContent = css;
    document.head.appendChild(el);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function short(n) {
    if (n >= 100000) return Math.round(n / 1000) + 'k';
    if (n >= 1000) return (Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'k';
    return fmt(n);
  }
  function progLabel(m) {
    if (m.type === 'orbit') return m.done ? 'Done!' : 'Not yet';
    return short(Math.floor(m.prog)) + ' / ' + short(m.target);
  }
  function cardHTML(m, where) {
    const T = TYPES[m.type], pct = Math.round(Math.min(1, m.prog / m.target) * 100);
    let delta = '';
    if (where === 'results' && startProg[m.id] != null && m.prog > startProg[m.id] && !T.live) {
      delta = ' <span class="missions-delta">+' + short(m.prog - startProg[m.id]) + '</span>';
    }
    const fresh = where === 'results' && m.done && startProg[m.id] != null && startProg[m.id] < m.target ? ' fresh' : '';
    return `<div class="missions-card t${m.tier}${m.done ? ' done' : ''}${fresh}">
      <div class="missions-stars">${'★'.repeat(m.tier + 1)}</div>
      <div class="missions-top"><div class="missions-ico">${T.icon}</div><div class="missions-txt">${esc(T.text(m))}</div></div>
      <div class="missions-bar"><i style="width:${pct}%"></i></div>
      <div class="missions-meta">${m.done
        ? `<button class="missions-claim" data-mid="${m.id}">CLAIM <i class="coin"></i>${fmt(m.reward)}</button>`
        : `<span>${progLabel(m)}${delta}</span><b><i class="coin"></i>${fmt(m.reward)}</b>`}</div>
    </div>`;
  }
  function bindClaims(root, where) {
    root.querySelectorAll('.missions-claim').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); b.blur(); claim(+b.dataset.mid, b, where);
    }));
  }

  function renderMenu() {
    const wrap = document.querySelector('#screen-menu .menu-wrap');
    if (!wrap) return;
    let box = $('missions-menu');
    if (!box) {
      box = document.createElement('div'); box.id = 'missions-menu';
      const grid = wrap.querySelector('.menu-grid');
      if (grid && grid.nextSibling) wrap.insertBefore(box, grid.nextSibling); else wrap.appendChild(box);
    }
    const list = ensure(), ds = dailyState();
    const ready = list.filter((m) => m.done).length;
    let pips = '';
    for (let i = 1; i <= 7; i++) pips += `<i class="${i <= (ds.can ? ds.day - 1 : ds.day) ? 'on' : ''}"></i>`;
    const daily = ds.can
      ? `<button class="missions-daily can" id="missions-dailyBtn">${NO.ico('gift')} DAY ${ds.day} · <i class="coin"></i>${fmt(ds.reward)}</button>`
      : `<div class="missions-daily" title="Come back tomorrow for the next daily bonus">${NO.ico('fire')} ${ds.streak}-day streak <span class="missions-pips">${pips}</span></div>`;
    box.innerHTML = `<div class="missions-head"><div class="missions-title">MISSIONS${ready ? `<small>${ready} READY!</small>` : ''}</div>${daily}</div>
      <div class="missions-row">${list.map((m) => cardHTML(m, 'menu')).join('')}</div>`;
    bindClaims(box, 'menu');
    const db = $('missions-dailyBtn');
    if (db) db.addEventListener('click', (e) => { e.stopPropagation(); db.blur(); claimDaily(db); });
  }

  function renderResults() {
    const panel = document.querySelector('#screen-results .panel.results');
    if (!panel) return;
    let box = $('missions-res');
    if (!box) {
      box = document.createElement('div'); box.id = 'missions-res';
      const row = panel.querySelector('.btn-row');
      if (row) panel.insertBefore(box, row.nextSibling); else panel.appendChild(box);  // below the buttons so LAUNCH AGAIN stays visible
    }
    const list = ensure();
    box.innerHTML = `<div class="missions-rhead"><span>${NO.ico('target')} MISSIONS</span><small>${st().done} COMPLETED</small></div>
      <div class="missions-row">${list.map((m) => cardHTML(m, 'results')).join('')}</div>`;
    bindClaims(box, 'results');
  }

  function pop(title, text, reward) {
    const old = $('missions-toast'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'missions-toast';
    el.innerHTML = `<div class="missions-tico">${NO.ico('check')}</div><div style="min-width:0"><b>${esc(title)}</b><span>${esc(text)}</span></div><em><i class="coin"></i>${fmt(reward)}</em>`;
    document.body.appendChild(el);
    clearTimeout(pop._t); pop._t = setTimeout(() => el.remove(), 2900);
  }
  function floatText(txt, fromEl) {
    const el = document.createElement('div'); el.className = 'missions-float'; el.textContent = txt;
    let x = innerWidth / 2, y = innerHeight / 2;
    if (fromEl && fromEl.getBoundingClientRect) { const r = fromEl.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /* -------------------------------- the mod ---------------------------------- */
  NO.Mods.register({
    id: ID,
    menu() { injectStyle(); renderMenu(); },
    aim() {
      injectStyle();
      runActive = true;
      startProg = {};
      ensure().forEach((m) => (startProg[m.id] = m.prog));
    },
    launch(S) {
      const s = st();
      // streak of consecutive PERFECT launches
      s.perfRow = S.perfect ? (s.perfRow || 0) + 1 : 0;
      for (const m of ensure()) {
        if (m.done) continue;
        if (m.type === 'perfect' && S.perfect) setProg(m, m.prog + 1);
        else if (m.type === 'combo') { m.prog = Math.min(m.target, s.perfRow); if (s.perfRow >= m.target) complete(m); }
        else if (m.type === 'world' && S.env === m.env) setProg(m, m.prog + 1);
      }
    },
    update(S) {
      if (!runActive || !S.run || (S.mode !== 'flight' && S.mode !== 'orbit')) return;
      const list = st().list;
      for (let i = 0; i < list.length; i++) {
        const m = list[i], T = TYPES[m.type];
        if (!m || m.done || !T || !T.live) continue;
        const v = T.val(S);
        if (v > m.prog) { m.prog = Math.min(m.target, v); if (v >= m.target) complete(m); }
      }
    },
    results(S, r) {
      runActive = false;
      const s = st(), pb = s.pb;
      pb.alt = Math.max(pb.alt || 0, r.maxAlt || 0);
      pb.bounces = Math.max(pb.bounces || 0, r.bounces || 0);
      pb.collected = Math.max(pb.collected || 0, r.collected || 0);
      pb.speed = Math.max(pb.speed || 0, (r.topSpeed || 0) * 3.6);
      pb.apexVx = Math.max(pb.apexVx || 0, r.apexVx || 0);
      for (const m of ensure()) {
        if (m.done) continue;
        if (m.type === 'total') setProg(m, m.prog + (r.distance || 0));
        else if (m.type === 'dist') setProg(m, r.distance || 0);
        else if (m.type === 'alt') setProg(m, r.maxAlt || 0);
        else if (m.type === 'bounce') setProg(m, r.bounces || 0);
        else if (m.type === 'collect') setProg(m, r.collected || 0);
        else if (m.type === 'speed') setProg(m, (r.topSpeed || 0) * 3.6);
        else if (m.type === 'orbit') setProg(m, r.orbitLaps > 0 ? 1 : 0);
      }
      NO.Save.save();
    },
    resultsShown() { injectStyle(); renderResults(); },
    mode(mode) {
      if (mode === 'menu') runActive = false;
      if (mode !== 'flight' && mode !== 'orbit' && mode !== 'boom' && mode !== 'launch') {
        const t = $('missions-toast'); if (t && mode === 'menu') t.remove();
      }
    },
  });

  // debug/testing hook
  NO.Missions = { state: st, reroll() { st().list = []; ensure(); NO.Save.save(); }, dailyState, render: renderMenu };
})();
