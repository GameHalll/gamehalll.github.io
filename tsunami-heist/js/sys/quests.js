// quests system — always gives the player a clear next goal.
// 3 active quests (a 5-step onboarding chain first), 3 daily quests that reset every real day,
// rewards scaled to the player's current income, sometimes a short temporary boost.
// UI: compact tracker on the left (below #lockInfo), full panel on [Q] / QUESTS button.
export default function init(game, bus) {
  const { C, S, fx, sound } = game;
  const player = game.player;
  const st = bus.state('quests', { onb: 0, active: [], daily: null, best: {}, boosts: {}, rerollAt: 0, done: 0, seq: 1 });
  st.boosts ||= {}; st.best ||= {}; st.active ||= [];

  // ------------------------------------------------------------ helpers
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rarOf = id => C.CREATURE_BY_ID[id]?.r ?? 0;
  const fmt = n => game.fmt(n);
  const icon = n => game.icon(n);
  const world = () => C.WORLD;
  const bestZone = () => st.best[world()] ?? -1;
  const pedCount = () => player.plot.pedestals.reduce((n, p) => n + (p.creature ? 1 : 0), 0);
  function incomePerSec() {
    let inc = 0;
    for (const ped of player.plot.pedestals) if (ped.creature) inc += game.income(ped.creature.id, ped.creature.mut, ped.creature.w);
    return inc * game.incMult();
  }
  // floor for every reward so an empty base or world 5 never gets a useless amount
  const minCash = () => Math.round(40 * C.WORLDS[world()].mult * (1 + 0.5 * S.speedLv));
  const rewardOf = q => Math.max(Math.round(minCash() * (q.daily ? 6 : q.onb ? 1 : 1.5)), Math.round(incomePerSec() * q.secs));
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // ------------------------------------------------------------ boosts (temporary, via bus.mod)
  const BOOSTS = {
    luck: { name: 'Luck x1.5', short: 'LUCK', mul: 1.5, dur: 120, ic: 'sparkle', col: '#5dff86' },
    income: { name: 'Cash x1.25', short: 'CASH', mul: 1.25, dur: 90, ic: 'coin', col: '#ffd23f' },
    speed: { name: 'Speed +12%', short: 'SPEED', mul: 1.12, dur: 60, ic: 'speed', col: '#5ad8ff' },
  };
  const boostOn = k => (st.boosts[k] || 0) > Date.now();
  bus.mod('luck', () => boostOn('luck') ? BOOSTS.luck.mul : 1);
  bus.mod('income', () => boostOn('income') ? BOOSTS.income.mul : 1);
  bus.mod('speed', a => a === player && boostOn('speed') ? BOOSTS.speed.mul : 1);

  // ------------------------------------------------------------ quest types
  const R = C.RARITIES;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const T = {
    grab: { ic: 'sparkle', bg: '#3ccf4c', txt: q => q.r > 0 ? `Grab ${plural(q.n, `<span style="color:${R[q.r].color}">${R[q.r].name}+</span> creature`)}` : `Grab ${plural(q.n, 'creature')}`, hint: 'Run down the track and press [E] next to a creature.' },
    place: { ic: 'house', bg: '#2fa6ff', txt: q => q.n === 1 ? 'Bring a creature home' : `Bring ${q.n} creatures home`, hint: 'Carry it back up the track into your base — it lands on a pedestal by itself.' },
    zone: { ic: 'run', bg: '#ff9a4a', txt: q => `Reach <span style="color:${R[q.z].color}">${C.ZONES[q.z].title}</span>`, hint: q => `Zone ${q.z + 1} of the track. Speed upgrades get you deeper before the waves hit.` },
    steal: { ic: 'key', bg: '#ff4fa0', txt: q => q.n === 1 ? 'Steal a creature from a bot' : `Steal ${q.n} creatures`, hint: 'Walk into another base, press [E] on a pedestal and run it home.' },
    mutant: { ic: 'sparkle', bg: '#c070ff', txt: q => q.n === 1 ? 'Bring home a mutated creature' : `Bring home ${q.n} mutated creatures`, hint: 'Gold, Diamond or Rainbow creatures — grab or steal one.' },
    survive: { ic: 'shield', bg: '#2a8cff', txt: q => `Survive ${plural(q.n, 'wave')} in a safe spot`, hint: 'Be out on the track and hide in a side shelter until the wave passes.' },
    cash: { ic: 'coin', bg: '#ffb02e', txt: q => q.onb ? 'Collect cash from a pedestal' : `Collect $${fmt(q.n)} from pedestals`, hint: 'Step on your pedestals to collect what they earned.', money: true },
    lock: { ic: 'lock', bg: '#ff5a6e', txt: q => q.n === 1 ? 'Lock your base' : `Lock your base ${q.n} times`, hint: 'Step on the lock button in your base.' },
    hit: { ic: 'bat', bg: '#ffb02e', txt: q => `Hit thieves ${plural(q.n, 'time')}`, hint: 'Defend your base: hit bots inside it with [F].' },
    sell: { ic: 'cash', bg: '#2fc85a', txt: q => q.n === 1 ? 'Sell a creature' : `Sell ${q.n} creatures`, hint: 'Stand next to one of your pedestals and press [X].' },
    buy: { ic: 'bolt', bg: '#8a5cff', txt: q => `Buy ${plural(q.n, 'shop upgrade')}`, hint: 'Open the shop with [B].' },
    speed: { ic: 'speed', bg: '#2fa6ff', txt: () => 'Buy a Speed upgrade', hint: 'Press [B] for the shop — speed lets you reach rarer zones.' },
  };
  const newQ = (t, n, secs, extra = {}) => ({ id: st.seq++, t, n, p: 0, secs: Math.round(secs), ...extra });

  const ONB = [
    () => newQ('grab', 1, 60, { onb: 1, r: 0 }),
    () => newQ('place', 1, 60, { onb: 2 }),
    () => newQ('cash', 1, 60, { onb: 3 }),
    () => newQ('speed', 1, 60, { onb: 4 }),
    () => newQ('steal', 1, 120, { onb: 5, boost: 'luck' }),
  ];

  // a random quest whose targets scale with world, speed level and the deepest zone reached here
  function rollQuest(daily, exclude) {
    const b = Math.max(0, bestZone()), lv = S.speedLv, peds = pedCount(), inc = incomePerSec();
    const D = daily ? 1 : 0;
    const pool = [
      ['grab', 4], ['steal', 2], ['survive', 3], ['buy', daily ? 0 : 1.5],
      ['zone', bestZone() < C.ZONE_COUNT - 1 && !daily ? 2.5 : 0],
      ['mutant', lv >= 2 ? 1.5 : 0.5], ['cash', peds > 0 && inc > 0 ? 2.5 : 0],
      ['lock', daily ? 0 : 1.5], ['hit', peds >= 2 ? 1.5 : 0], ['sell', peds >= 4 && !daily ? 1 : 0],
    ].filter(([t, w]) => w > 0 && !exclude.includes(t));
    let tot = 0; for (const [, w] of pool) tot += w;
    let x = Math.random() * tot, t = pool[0][0];
    for (const [k, w] of pool) { x -= w; if (x <= 0) { t = k; break; } }
    const secsMul = daily ? rnd(3.2, 4.2) : 1;
    switch (t) {
      case 'grab': {
        const rr = Math.min(C.ZONE_COUNT - 1, Math.max(0, b - (D ? 1 : ri(1, 2))));
        return newQ(t, D ? ri(8, 12) : ri(2, 4) + (b >= 4 ? 1 : 0), (60 + rr * 18) * secsMul * rnd(0.9, 1.15), { r: rr });
      }
      case 'zone': { const z = Math.min(C.ZONE_COUNT - 1, Math.max(1, bestZone() + 1)); return newQ(t, 1, (70 + z * 20) * rnd(0.9, 1.2), { z }); }
      case 'steal': return newQ(t, D ? ri(3, 4) : ri(1, 2), (110 * secsMul) * rnd(0.9, 1.15));
      case 'mutant': return newQ(t, D ? 2 : 1, 150 * secsMul * rnd(0.9, 1.1));
      case 'survive': return newQ(t, D ? ri(6, 8) : ri(2, 3), 80 * secsMul * rnd(0.9, 1.15));
      case 'cash': { const s = D ? ri(500, 700) : ri(70, 140); return newQ(t, Math.max(minCash() * (D ? 5 : 1), Math.round(inc * s / 10) * 10), (D ? 380 : 60 + s * 0.4) * rnd(0.9, 1.1)); }
      case 'lock': return newQ(t, 1, 50 * rnd(0.9, 1.2));
      case 'hit': return newQ(t, D ? ri(8, 12) : ri(3, 5), 90 * secsMul * rnd(0.9, 1.15));
      case 'sell': return newQ(t, 1, 45 * rnd(0.9, 1.2));
      default: return newQ('buy', ri(2, 3), 60 * rnd(0.9, 1.2));
    }
  }
  function finishRoll(q) {
    q.secs = q.daily ? Math.round(Math.min(600, Math.max(360, q.secs * 1.3))) : Math.min(240, Math.max(60, q.secs));
    if (!q.daily && !q.onb && Math.random() < 0.25) q.boost = pick(Object.keys(BOOSTS));
    return q;
  }
  function rollActive(exclude = []) { return finishRoll(rollQuest(false, [...exclude, ...st.active.filter(q => !q.done).map(q => q.t)])); }
  function rollDaily() {
    const list = [];
    for (let i = 0; i < 3; i++) { const q = rollQuest(true, list.map(q => q.t)); q.daily = 1; list.push(finishRoll(q)); }
    list[ri(0, 2)].boost = pick(Object.keys(BOOSTS));
    st.daily = { key: todayKey(), list };
  }

  // existing players skip the onboarding chain
  if (st.onb < ONB.length && (S.speedLv >= 3 || S.steals > 0 || S.rebirths > 0 || S.maxWorld > 0)) { st.onb = ONB.length; st.active = []; }
  function ensureQuests() {
    // completed quests left over from a reload: advance / replace them now
    const od = st.active.find(q => q.onb && q.done); if (od) { st.onb = Math.max(st.onb, od.onb); st.active = []; }
    st.active = st.active.filter(q => !q.done);
    if (st.onb < ONB.length) {
      if (!st.active.length || !st.active[0].onb) st.active = [ONB[st.onb]()];
      return;
    }
    st.active = st.active.filter(q => !q.onb);
    while (st.active.length < 3) st.active.push(rollActive());
    if (!st.daily || st.daily.key !== todayKey()) rollDaily();
  }
  ensureQuests();

  // ------------------------------------------------------------ progress
  const allQuests = () => st.daily && st.onb >= ONB.length ? [...st.active, ...st.daily.list] : st.active;
  function bump(t, amt = 1, test) {
    for (const q of allQuests()) {
      if (q.done || q.t !== t || (test && !test(q))) continue;
      q.p = Math.min(q.n, q.p + amt);
      dirty = true;
      if (q.p >= q.n) complete(q);
    }
  }
  bus.on('grab', (a, w) => { if (a === player) bump('grab', 1, q => rarOf(w.id) >= (q.r || 0)); });
  bus.on('place', (a, c) => {
    if (a !== player || !c) return;
    bump('place');
    if (c.from) bump('steal');
    if (c.mut) bump('mutant');
  });
  bus.on('collect', (a, v) => { if (a === player) bump('cash', v, q => !q.onb || v > 0); });
  bus.on('buy', row => { bump('buy'); if (/^Speed/.test(row?.t || '')) bump('speed'); });
  bus.on('lock', P => { if (P === player.plot) bump('lock'); });
  bus.on('hit', (att, vic) => { if (att === player && vic && vic.isBot) bump('hit'); });
  bus.on('sell', () => bump('sell'));
  function zoneReached(zi) {
    if (zi < 0) return;
    if (zi > bestZone()) st.best[world()] = zi;
    bump('zone', 1, q => zi >= q.z);
  }
  bus.on('zone', (a, zi) => { if (a === player) zoneReached(zi); });
  // survive: be in a shelter on the track at some point during the wave and still be out there alive when it ends
  let hid = false;
  bus.on('waveStart', () => { hid = false; });
  bus.on('kill', a => { if (a === player) hid = false; });
  bus.on('waveEnd', () => {
    if (hid && player.pos.z < 0 && !player.dead && !(player.swept > 0)) bump('survive');
    hid = false;
  });
  bus.on('travel', () => { dirty = true; });

  // ------------------------------------------------------------ completion
  const pending = []; // { q, t } completed quests that get replaced after a short beat
  function complete(q) {
    q.done = 1; st.done++;
    const amt = rewardOf(q);
    S.cash += amt;
    let bmsg = '';
    if (q.boost) {
      const B = BOOSTS[q.boost];
      st.boosts[q.boost] = Math.max(Date.now(), st.boosts[q.boost] || 0) + B.dur * 1000;
      bmsg = ` + ${B.name} ${B.dur >= 120 ? B.dur / 60 + ' min' : B.dur + 's'}`;
    }
    const label = q.daily ? 'DAILY QUEST COMPLETE!' : q.onb ? `TUTORIAL ${q.onb}/5 DONE!` : 'QUEST COMPLETE!';
    game.toast(`${label} +$${fmt(amt)}${bmsg}`, 'gold');
    if (q.daily) game.bigText('DAILY DONE!', `+$${fmt(amt)}`);
    else if (q.onb === ONB.length) game.bigText('TUTORIAL DONE!', 'Quests unlocked — press Q');
    celebrate(q, amt);
    dirty = true; popRow = q.id; popAmt = amt;
    if (q.onb) { // the tutorial moves on at once so the next step can't miss an event during the delay
      st.onb = Math.max(st.onb, q.onb); st.active = []; ensureQuests();
      popRow = newRow = st.active[0]?.id || 0;
    } else if (!q.daily) pending.push({ q, t: 1.6 });
    game.save?.();
  }
  function chime(big) {
    try {
      const notes = big ? [523, 659, 784, 1047, 1319] : [659, 784, 1047];
      notes.forEach((f, i) => sound.tone(f, 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.075, rev: 0.35 }));
      sound.tone(notes[notes.length - 1] * 2, 0.5, { type: 'sine', vol: 0.05, delay: notes.length * 0.075, rev: 0.5 });
      sound.cash(true);
    } catch (e) { /* audio not ready */ }
  }
  function celebrate(q, amt) {
    chime(!!q.daily || q.onb === ONB.length);
    const p = player.pos, col = q.daily ? 0xc070ff : 0xffd23f;
    try {
      fx.burst(p, col, game.lowQ ? 24 : 50);
      fx.ring(p, col, 4, 0.55, true);
      fx.coins(p, game.lowQ ? 8 : 16);
      if (q.daily) fx.pillar(p, col, game.lowQ ? 16 : 30, 1);
    } catch (e) { /* fx optional */ }
    game.float('+$' + fmt(amt), p, '#ffd23f');
    game.juice?.flash?.(0.12, col);
  }
  function processPending(dt) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const e = pending[i]; e.t -= dt; if (e.t > 0) continue;
      pending.splice(i, 1);
      const idx = st.active.indexOf(e.q);
      if (e.q.onb) {
        st.onb = Math.max(st.onb, e.q.onb);
        st.active = [];
        ensureQuests();
      } else if (idx >= 0) {
        st.active.splice(idx, 1);
        st.active.splice(idx, 0, rollActive([e.q.t]));
      }
      dirty = true; newRow = st.active[idx >= 0 ? idx : 0]?.id;
    }
  }

  // ------------------------------------------------------------ UI
  const css = document.createElement('style');
  css.textContent = `
#qTrack { position: absolute; left: 16px; top: 190px; width: 238px; display: flex; flex-direction: column; gap: 5px; pointer-events: auto; cursor: pointer; }
#qTrack .qh { font-size: 14px; color: var(--gold); display: flex; align-items: center; gap: 5px; letter-spacing: .5px; }
#qTrack .qh kbd { font-size: 11px; padding: 1px 5px; }
#qTrack .qr { position: relative; padding: 4px 8px 5px; border-radius: 11px; border: 2px solid rgba(20,16,32,.75);
  background: linear-gradient(180deg, rgba(48,38,100,.82), rgba(20,16,32,.74)); box-shadow: 0 3px 0 rgba(20,16,32,.7); transition: transform .15s; }
#qTrack .qr.dn { border-color: var(--green); background: linear-gradient(180deg, rgba(30,120,60,.9), rgba(16,60,30,.85)); animation: qPop .45s cubic-bezier(.2,1.8,.4,1); }
#qTrack .qr.nw { animation: qIn .4s cubic-bezier(.2,1.5,.4,1); }
#qTrack .qr.dl { border-color: rgba(192,112,255,.7); }
#qTrack .qt { display: flex; align-items: center; gap: 6px; font-size: 14px; line-height: 1.15; }
#qTrack .qt .ico { font-size: 1.05em; }
#qTrack .qt .x { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#qTrack .qt .n { font-size: 12px; color: #c9c2ec; white-space: nowrap; }
#qTrack .qb { height: 6px; margin-top: 4px; border-radius: 4px; background: rgba(0,0,0,.45); overflow: hidden; }
#qTrack .qb i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #ffb02e, #ffe14a); transition: width .3s; }
#qTrack .qr.dn .qb i { background: var(--green); }
#qTrack .qr.dl .qb i { background: linear-gradient(90deg, #8a5cff, #e07aff); }
#qTrack .qf { font-size: 12px; color: #c9c2ec; display: flex; gap: 8px; flex-wrap: wrap; }
#qTrack .qf .bo { color: #5dff86; }
#qTrack .qpop { position: absolute; right: 6px; top: -4px; font-size: 18px; color: var(--gold); pointer-events: none; animation: qRise 1.3s ease-out forwards; }
@keyframes qPop { 0% { transform: scale(1); } 40% { transform: scale(1.09); } 100% { transform: scale(1); } }
@keyframes qIn { from { transform: translateX(-30px); opacity: 0; } }
@keyframes qRise { 0% { transform: translateY(0) scale(.6); opacity: 0; } 15% { transform: translateY(-6px) scale(1.25); opacity: 1; } 100% { transform: translateY(-34px) scale(1); opacity: 0; } }
#panelQuests .qsec { font-size: 20px; color: var(--gold); margin: 6px 2px 8px; display: flex; align-items: center; gap: 8px; }
#panelQuests .qsec small { font-size: 14px; color: #c9c2ec; margin-left: auto; }
#panelQuests .row.dn { border-color: var(--green); }
#panelQuests .row.dl:not(.dn) { border-color: rgba(192,112,255,.55); }
#panelQuests .qpb { height: 10px; border-radius: 6px; border: 2px solid var(--ink); background: #241d4d; overflow: hidden; margin-top: 5px; max-width: 320px; }
#panelQuests .qpb i { display: block; height: 100%; background: linear-gradient(90deg, #ffb02e, #ffe14a); }
#panelQuests .row.dn .qpb i { background: var(--green); }
#panelQuests .row.dl .qpb i { background: linear-gradient(90deg, #8a5cff, #e07aff); }
#panelQuests .rw { flex: none; text-align: right; font-size: 18px; color: var(--gold); min-width: 86px; }
#panelQuests .rw small { display: block; font-size: 12px; color: #5dff86; }
#panelQuests .rw .btn { margin-top: 4px; font-size: 13px; padding: 3px 8px; }
#panelQuests .qboosts { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin: -4px 0 10px; font-size: 15px; }
#panelQuests .qboosts span { padding: 2px 10px; border-radius: 9px; border: 2px solid var(--ink); background: rgba(0,0,0,.3); }
@media (max-width: 760px) {
  #qTrack { top: 178px; left: 10px; width: 168px; gap: 3px; }
  #qTrack .qr { padding: 2px 6px 3px; border-radius: 8px; } #qTrack .qt { font-size: 11px; gap: 4px; } #qTrack .qt .n { font-size: 10px; }
  #qTrack .qb { height: 4px; margin-top: 2px; } #qTrack .qh { font-size: 11px; } #qTrack .qf { font-size: 10px; }
  #btnQuests .lbl { display: none; }
  #panelQuests .rw { min-width: 64px; font-size: 15px; }
}
@media (max-height: 480px) {
  #qTrack { top: 124px; left: 10px; width: 156px; gap: 2px; }
  #qTrack .qr { padding: 2px 6px 3px; border-radius: 8px; } #qTrack .qt { font-size: 10px; gap: 4px; } #qTrack .qt .n { font-size: 9px; }
  #qTrack .qb { height: 3px; margin-top: 2px; } #qTrack .qh { display: none; } #qTrack .qf { font-size: 9px; }
  #btnQuests .lbl { display: none; }
}`;
  document.head.appendChild(css);

  const track = document.createElement('div');
  track.id = 'qTrack'; track.className = 'stroke';
  (document.getElementById('hud') || document.body).appendChild(track);
  track.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });

  const panel = document.createElement('div');
  panel.id = 'panelQuests'; panel.className = 'panel hidden';
  panel.innerHTML = `<button class="btn grey small close">${icon('close')}</button><h2>${icon('target')} QUESTS</h2><div id="qBody"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.close').addEventListener('click', () => game.closePanels());
  const body = panel.querySelector('#qBody');
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-reroll]'); if (!b) return;
    reroll(+b.dataset.reroll);
  });

  function togglePanel() {
    if (panel.classList.contains('hidden')) { game.openPanel('panelQuests'); renderPanel(); }
    else game.closePanels();
  }
  bus.hudButton({ id: 'btnQuests', icon: icon('target'), label: 'QUESTS', key: 'q', color: 'purple', onClick: togglePanel });
  bus.on('key', k => { if (k === 'q') togglePanel(); });

  const REROLL_CD = 180;
  function reroll(id) {
    if (Date.now() < st.rerollAt) { try { sound.deny(); } catch (e) { } return; }
    const i = st.active.findIndex(q => q.id === id && !q.done && !q.onb); if (i < 0) return;
    const old = st.active[i];
    st.active[i] = rollActive([old.t]);
    st.rerollAt = Date.now() + REROLL_CD * 1000;
    try { sound.buy(); } catch (e) { }
    newRow = st.active[i].id; dirty = true; renderPanel(); game.save?.();
  }

  const qText = q => T[q.t].txt(q);
  const qHint = q => { const h = T[q.t].hint; return typeof h === 'function' ? h(q) : h; };
  const qProg = q => T[q.t].money && !q.onb ? `$${fmt(q.p)}/$${fmt(q.n)}` : `${Math.floor(q.p)}/${q.n}`;
  const pct = q => Math.min(100, q.p / q.n * 100);
  const fmtT = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}h ${m}m` : m ? `${m}:${String(ss).padStart(2, '0')}` : `${ss}s`; };
  const msToMidnight = () => { const d = new Date(), n = new Date(d); n.setHours(24, 0, 0, 0); return n - d; };
  function boostsHtml() {
    const now = Date.now(), out = [];
    for (const k in BOOSTS) if ((st.boosts[k] || 0) > now) out.push(`<span class="bo" style="color:${BOOSTS[k].col}">${icon(BOOSTS[k].ic)} ${BOOSTS[k].short} ${fmtT((st.boosts[k] - now) / 1000)}</span>`);
    return out.join('');
  }

  let dirty = true, popRow = 0, popAmt = 0, newRow = 0, lastHtml = '';
  function renderTracker() {
    const onb = st.onb < ONB.length;
    let h = `<div class="qh">${icon('target')} ${onb ? `TUTORIAL ${st.onb + 1}/5` : 'QUESTS'} <kbd>Q</kbd></div>`;
    for (const q of st.active) {
      h += `<div class="qr${q.done ? ' dn' : ''}${q.id === newRow ? ' nw' : ''}" data-id="${q.id}"><div class="qt">${icon(q.done ? 'check' : T[q.t].ic)}<span class="x">${qText(q)}</span><span class="n">${q.done ? 'DONE' : qProg(q)}</span></div><div class="qb"><i style="width:${pct(q)}%"></i></div></div>`;
    }
    if (onb && st.active[0] && !st.active[0].done) h += `<div class="qf">${qHint(st.active[0])}</div>`;
    const foot = [];
    if (!onb && st.daily) { const dn = st.daily.list.filter(q => q.done).length; foot.push(`<span style="color:#e07aff">DAILY ${dn}/3</span>`); }
    const bh = boostsHtml(); if (bh) foot.push(bh);
    if (foot.length && !onb) h += `<div class="qf">${foot.join('')}</div>`;
    else if (bh) h += `<div class="qf">${bh}</div>`;
    if (h !== lastHtml) {
      lastHtml = h; track.innerHTML = h;
      if (popRow) {
        const row = track.querySelector(`[data-id="${popRow}"]`);
        if (row) { const s = document.createElement('div'); s.className = 'qpop'; s.textContent = '+$' + fmt(popAmt); row.appendChild(s); }
        popRow = 0;
      }
      newRow = 0;
    }
  }
  function rowHtml(q, canReroll) {
    const B = q.boost ? BOOSTS[q.boost] : null;
    const right = q.done ? `<div class="rw" style="color:var(--green)">${icon('check')} DONE</div>`
      : `<div class="rw">$${fmt(rewardOf(q))}${B ? `<small>+ ${B.name}</small>` : ''}${canReroll ? `<button class="btn grey small" data-reroll="${q.id}" ${Date.now() < st.rerollAt ? 'disabled' : ''}>${Date.now() < st.rerollAt ? fmtT((st.rerollAt - Date.now()) / 1000) : 'REROLL'}</button>` : ''}</div>`;
    return `<div class="row${q.done ? ' dn' : ''}${q.daily ? ' dl' : ''}"><div class="ic" style="--icbg:${T[q.t].bg}">${icon(q.done ? 'check' : T[q.t].ic)}</div><div class="tx"><b>${qText(q)}</b><span>${qHint(q)} · ${q.done ? 'complete' : qProg(q)}</span><div class="qpb"><i style="width:${pct(q)}%"></i></div></div>${right}</div>`;
  }
  let lastPanel = '';
  function renderPanel() {
    if (panel.classList.contains('hidden')) return;
    const onb = st.onb < ONB.length;
    let h = '';
    const bh = boostsHtml(); if (bh) h += `<div class="qboosts">${bh}</div>`;
    h += `<div class="qsec">${icon('target')} ${onb ? `Tutorial ${st.onb + 1}/5` : 'Quests'}<small>${onb ? 'learn the loop, then quests unlock' : 'a new one rolls when you finish one'}</small></div>`;
    for (const q of st.active) h += rowHtml(q, !onb && !q.done);
    if (!onb && st.daily) {
      h += `<div class="qsec" style="color:#e07aff">${icon('sparkle')} Daily quests<small>new in ${fmtT(msToMidnight() / 1000)}</small></div>`;
      for (const q of st.daily.list) h += rowHtml(q, false);
    } else h += `<div class="psub" style="margin-top:8px">Finish the tutorial to unlock random and daily quests.</div>`;
    h += `<div class="psub" style="margin-top:6px">Rewards grow with your income · ${st.done} quests completed</div>`;
    if (h !== lastPanel) { lastPanel = h; body.innerHTML = h; }
  }

  // ------------------------------------------------------------ tick
  let uiT = 0, chkT = 0;
  bus.on('tick', dt => {
    if (game.W.state === 'run' && game.inShelter(player)) hid = true;
    if (pending.length) processPending(dt);
    chkT -= dt;
    if (chkT <= 0) {
      chkT = 1;
      if (st.onb >= ONB.length && (!st.daily || st.daily.key !== todayKey())) { rollDaily(); dirty = true; game.toast('New daily quests! Press Q', 'gold'); }
      if (player.pos.z <= C.ZONE_START) zoneReached(C.zoneAt(player.pos.z));
    }
    uiT -= dt;
    if (uiT <= 0 || dirty) { uiT = 0.25; dirty = false; renderTracker(); }
  });
  // the panel pauses the sim, so refresh it on a timer (reroll cooldown, daily reset countdown)
  setInterval(() => { if (!panel.classList.contains('hidden')) renderPanel(); }, 500);
  bus.on('start', () => { dirty = true; renderTracker(); });
  renderTracker();
}
