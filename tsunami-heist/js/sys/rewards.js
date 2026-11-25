// rewards system — see ../hooks.js for the bus API
// Retention rewards: daily login streak (7-day calendar), playtime gifts, Lucky Spin wheel,
// temporary luck / income boosts (bus.mod), GIFTS hud button (key G) with a notification dot.
export default function init(game, bus) {
  const { C, S, fx, sound } = game;
  const st = bus.state('rewards', { lastDay: '', streak: 0, shownDay: '', nextSpin: 0, adDay: '', adSpins: 0, luckT: 0, incT: 0, pending: [], spins: 0, best: 0 });
  if (!Array.isArray(st.pending)) st.pending = [];

  // ------------------------------------------------------------ tuning
  const LUCK_MUL = 2, INC_MUL = 1.5, BOOST_CAP = 20 * 60;     // boosts: x2 luck, x1.5 income, max 20 min stacked
  const SPIN_CD = 30 * 60e3, AD_SPINS_PER_DAY = 8;
  const GIFT_MIN = [2, 5, 10, 15, 25, 40];
  const GIFTS = [ // cash = seconds of (base) income
    { cash: 45 }, { cash: 75 }, { cash: 60, luck: 300 }, { cash: 150 }, { cash: 120, inc: 300 }, { cash: 360, luck: 300 },
  ];
  const DAYS = [
    { cash: 90 }, { luck: 600 }, { cash: 180 }, { inc: 600 }, { cash: 360 }, { luck: 900, inc: 900 }, { creature: 'daily' },
  ];
  const SEGS = [ // Lucky Spin segments (clockwise from the pointer)
    { k: 'cash', v: 60, w: 24, label: '$ SMALL', emo: '💵', col: '#2fc85a' },
    { k: 'luck', v: 300, w: 14, label: 'LUCK x2', emo: '🍀', col: '#5ee06a' },
    { k: 'cash', v: 150, w: 16, label: '$ BIG', emo: '💰', col: '#ffb02e' },
    { k: 'speed', v: 1, w: 9, label: 'SPEED +1', emo: '⚡', col: '#2fa6ff' },
    { k: 'cash', v: 30, w: 20, label: '$ TINY', emo: '🪙', col: '#8a5cff' },
    { k: 'inc', v: 300, w: 12, label: 'CASH x1.5', emo: '📈', col: '#ff4fa0' },
    { k: 'creature', v: 'spin', w: 4, label: 'CREATURE', emo: '🎁', col: '#c070ff' },
    { k: 'jackpot', v: 900, w: 1.5, label: 'JACKPOT', emo: '👑', col: '#ffd23f' },
  ];
  const CREATURE_ODDS = { daily: [[3, 65], [4, 28], [5, 7]], spin: [[2, 60], [3, 35], [4, 5]] };

  // ------------------------------------------------------------ helpers
  const $ = id => document.getElementById(id);
  const fmt = game.fmt;
  const now = () => Date.now();
  const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const today = () => dayKey(new Date());
  const yesterday = () => { const d = new Date(); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); };
  const mmss = s => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`; };
  const wm = () => C.WORLDS[C.WORLD].mult;
  function baseRate() { // player's income without temporary boosts
    let inc = 0; for (const ped of game.player.plot.pedestals) if (ped.creature) inc += game.income(ped.creature.id, ped.creature.mut, ped.creature.w);
    return inc * (1 + 0.5 * (S.rebirths || 0));
  }
  // cash = N seconds of income, with a world-scaled minimum so it's never useless for new players
  const cashFor = sec => Math.round(Math.max(baseRate() * sec, sec * 1.5 * wm() * (1 + 0.5 * (S.rebirths || 0))));
  const pickW = list => { let t = 0; for (const x of list) t += x[1]; let r = Math.random() * t; for (const x of list) if ((r -= x[1]) <= 0) return x[0]; return list[0][0]; };
  function rollCreature(kind) {
    const r = pickW(CREATURE_ODDS[kind]);
    const pool = C.BY_RARITY[r];
    const def = pool[Math.floor(Math.random() * pool.length)];
    return { id: def.id, mut: Math.random() < 0.1 ? 'gold' : '', w: C.WORLD };
  }
  const creatureName = c => game.displayName(c.id, c.mut, c.w);
  const rarityOf = c => C.RARITIES[C.CREATURE_BY_ID[c.id].r];

  // ------------------------------------------------------------ boosts (bus.mod)
  bus.mod('luck', () => st.luckT > 0 ? LUCK_MUL : 1);
  bus.mod('income', () => st.incT > 0 ? INC_MUL : 1);
  const addBoost = (key, sec) => { st[key] = Math.min(BOOST_CAP, Math.max(0, st[key]) + sec); };

  // ------------------------------------------------------------ styles + DOM
  const GIFT_SVG = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><g stroke="#141020" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
    <path d="M12 7.5C10.5 4 6.5 3.2 6 5.6c-.4 2 3 2 6 1.9zM12 7.5c1.5-3.5 5.5-4.3 6-1.9.4 2-3 2-6 1.9z" fill="#ffd23f"/>
    <rect x="3.5" y="7.5" width="17" height="4.2" rx="1" fill="#ff4fa0"/><path d="M5 11.7h14V21H5z" fill="#ff4f6a"/>
    <path d="M10.4 7.5h3.2V21h-3.2z" fill="#ffd23f"/></g></svg>`;
  const css = document.createElement('style');
  css.textContent = `
.btn.rwgift { background-color: #ff6a3d; position: relative; }
#btnGifts .rwDot, .rwTabs .rwDot { position: absolute; top: -7px; right: -7px; width: 18px; height: 18px; border-radius: 50%; background: #ff2a3a; border: 3px solid var(--ink);
  box-shadow: 0 0 0 0 rgba(255,42,58,.7); animation: rwPing 1.1s ease-out infinite; display: none; }
#btnGifts.has .rwDot, .rwTabs button.has .rwDot { display: block; }
#btnGifts.has { animation: rwWiggle 2.4s ease-in-out infinite; }
@keyframes rwPing { 0% { box-shadow: 0 0 0 0 rgba(255,42,58,.7); } 100% { box-shadow: 0 0 0 10px rgba(255,42,58,0); } }
@keyframes rwWiggle { 0%, 80%, 100% { transform: none; } 84% { transform: rotate(-6deg) scale(1.05); } 88% { transform: rotate(6deg) scale(1.05); } 92% { transform: rotate(-3deg); } }
#rwChips { display: inline-flex; gap: 5px; margin-left: 6px; vertical-align: middle; }
.rwChip { display: inline-block; padding: 1px 8px; border-radius: 9px; border: 2px solid var(--ink); color: #fff; font-size: 14px; white-space: nowrap; }
.rwChip.luck { background: linear-gradient(180deg, #7dff9a, #22b04a); } .rwChip.inc { background: linear-gradient(180deg, #ffd86a, #e08a00); }
#panelRewards { width: min(700px, 95vw); }
.rwTabs { display: flex; gap: 8px; justify-content: center; margin: 0 0 14px; }
.rwTabs button { position: relative; font-family: inherit; font-size: 19px; color: #fff; padding: 6px 16px; border-radius: 12px; border: 3px solid var(--ink);
  background: #3b3180; cursor: pointer; box-shadow: 0 3px 0 var(--ink); }
.rwTabs button.on { background: #ffb02e; }
#rwBoosts { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin: -6px 0 10px; font-size: 16px; }
#rwBoosts .rwChip { font-size: 16px; padding: 3px 12px; }
.rwCal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 14px; }
.rwDay { position: relative; border-radius: 14px; border: 3px solid rgba(20,16,32,.6); padding: 8px 4px 6px; text-align: center; min-width: 0;
  background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04)); }
.rwDay .dn { font-size: 14px; color: #c9c2ec; } .rwDay .de { font-size: 30px; line-height: 1.2; } .rwDay .dv { font-size: 13px; color: #fff; word-break: break-word; }
.rwDay.done { opacity: .55; } .rwDay.done::after { content: '✔'; position: absolute; right: 4px; top: 2px; color: var(--green); font-size: 18px; }
.rwDay.now { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(255,210,63,.35), 0 0 18px rgba(255,210,63,.5); animation: rwGlow 1s ease-in-out infinite alternate; }
.rwDay.big { background: linear-gradient(180deg, rgba(192,112,255,.45), rgba(120,40,200,.25)); }
@keyframes rwGlow { to { transform: translateY(-3px); } }
.rwCenter { text-align: center; } .rwCenter .btn { font-size: 24px; }
.rwNote { text-align: center; color: #c9c2ec; font-size: 16px; margin: 8px 0 0; }
.rwGifts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.rwGift { border-radius: 16px; border: 3px solid rgba(20,16,32,.6); padding: 10px 6px; text-align: center; background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04)); }
.rwGift .ge { font-size: 40px; line-height: 1.1; } .rwGift .gt { font-size: 15px; color: #c9c2ec; margin: 2px 0 6px; } .rwGift .btn { font-size: 16px; padding: 5px 12px; }
.rwGift.ready { border-color: var(--gold); } .rwGift.ready .ge { animation: rwShake .9s ease-in-out infinite; } .rwGift.claimed { opacity: .5; }
@keyframes rwShake { 0%, 60%, 100% { transform: none; } 70% { transform: rotate(-12deg) scale(1.1); } 80% { transform: rotate(12deg) scale(1.1); } 90% { transform: rotate(-6deg); } }
.rwWheelWrap { position: relative; width: min(300px, 64vw, 46vh); aspect-ratio: 1; margin: 6px auto 12px; }
.rwWheelWrap canvas { width: 100%; height: 100%; display: block; border-radius: 50%; box-shadow: 0 6px 0 var(--ink), 0 0 0 4px var(--ink); }
.rwPointer { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); width: 0; height: 0; z-index: 2;
  border-left: 16px solid transparent; border-right: 16px solid transparent; border-top: 30px solid #ff2a3a; filter: drop-shadow(0 3px 0 var(--ink)) drop-shadow(2px 0 0 var(--ink)) drop-shadow(-2px 0 0 var(--ink)); }
.rwHub { position: absolute; left: 50%; top: 50%; width: 22%; height: 22%; transform: translate(-50%, -50%); border-radius: 50%; border: 4px solid var(--ink);
  background: radial-gradient(circle at 35% 30%, #fff6c2, #ffb02e 70%); display: flex; align-items: center; justify-content: center; font-size: clamp(14px, 4vw, 22px); color: #fff; }
.rwBtns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.rwPend { margin-top: 12px; }
.rwCoin { position: fixed; z-index: 60; pointer-events: none; font-size: 26px; animation: rwCoin .9s cubic-bezier(.2,.7,.3,1) forwards; }
@keyframes rwCoin { 0% { transform: translate(-50%, -50%) scale(.4); opacity: 1; } 60% { opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.1) rotate(var(--rot)); opacity: 0; } }
@media (max-width: 760px), (max-height: 480px) {
  #btnGifts .lbl { display: none; } #btnGifts kbd { display: none; }
  .rwChip { font-size: 12px; padding: 0 6px; } #rwChips { gap: 3px; margin-left: 3px; }
  .rwCal { gap: 4px; } .rwDay { padding: 5px 2px 4px; border-radius: 10px; } .rwDay .de { font-size: 22px; } .rwDay .dv, .rwDay .dn { font-size: 11px; }
  .rwTabs button { font-size: 15px; padding: 4px 10px; } .rwCenter .btn { font-size: 18px; }
  .rwGift .ge { font-size: 30px; } .rwGift .gt { font-size: 12px; } .rwGifts { gap: 6px; } .rwNote { font-size: 13px; }
}`;
  document.head.appendChild(css);

  const panel = document.createElement('div');
  panel.id = 'panelRewards'; panel.className = 'panel hidden';
  panel.innerHTML = `<button class="btn grey small close">${game.icon('close')}</button>
  <h2>${GIFT_SVG} REWARDS</h2>
  <div id="rwBoosts"></div>
  <div class="rwTabs"><button data-tab="daily">DAILY<i class="rwDot"></i></button><button data-tab="gifts">GIFTS<i class="rwDot"></i></button><button data-tab="spin">LUCKY SPIN<i class="rwDot"></i></button></div>
  <div id="rwBody"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.close').onclick = () => game.closePanels();
  const tabBtns = [...panel.querySelectorAll('.rwTabs button')];
  for (const b of tabBtns) b.onclick = () => { tab = b.dataset.tab; render(); sound.tick?.(); };

  const hudBtn = bus.hudButton({ id: 'btnGifts', icon: GIFT_SVG, label: 'GIFTS', key: 'g', color: 'rwgift', onClick: () => toggle() });
  hudBtn.insertAdjacentHTML('beforeend', '<i class="rwDot"></i>');

  // boost chips next to the existing boostTag (top-left cash box)
  const chips = document.createElement('span'); chips.id = 'rwChips';
  { const bt = $('boostTag'); if (bt) bt.after(chips); else $('income')?.appendChild(chips); }

  let tab = 'daily', shownClaimable = null;
  const isOpen = () => !panel.classList.contains('hidden');
  function open(t) { if (t) tab = t; game.openPanel('panelRewards'); render(); }
  function toggle() { if (isOpen()) game.closePanels(); else open(bestTab()); }
  bus.on('key', k => { if (k === 'g') toggle(); });

  // ------------------------------------------------------------ claim state
  function daily() {
    const t = today();
    if (st.lastDay === t) return { done: st.streak || 7, claimable: false, next: (st.streak % 7) + 1 };
    if (st.lastDay === yesterday() && st.streak < 7) return { done: st.streak, claimable: true, next: st.streak + 1 };
    return { done: 0, claimable: true, next: 1, reset: !!st.lastDay && st.lastDay !== yesterday() && st.streak > 0 };
  }
  let sessionT = 0;
  const giftClaimed = GIFT_MIN.map(() => false);
  const giftAnnounced = GIFT_MIN.map(() => false);
  const giftReady = i => !giftClaimed[i] && sessionT >= GIFT_MIN[i] * 60;
  const spinFree = () => now() >= st.nextSpin;
  const adSpinsLeft = () => (st.adDay === today() ? AD_SPINS_PER_DAY - st.adSpins : AD_SPINS_PER_DAY);
  const pendingClaimable = () => st.pending.length > 0 && game.freeSlot(game.player.plot) >= 0;
  function bestTab() {
    if (daily().claimable || pendingClaimable()) return 'daily';
    if (GIFT_MIN.some((_, i) => giftReady(i))) return 'gifts';
    if (spinFree()) return 'spin';
    return tab;
  }

  // ------------------------------------------------------------ feedback
  function coinBurst(el, emo = '🪙', n = 14) {
    let x = innerWidth / 2, y = innerHeight / 2;
    if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); if (r.width) { x = r.left + r.width / 2; y = r.top + r.height / 2; } }
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div'); d.className = 'rwCoin'; d.textContent = i % 4 === 3 ? '✨' : emo;
      const a = Math.random() * Math.PI * 2, s = 70 + Math.random() * 130;
      d.style.left = x + 'px'; d.style.top = y + 'px';
      d.style.setProperty('--dx', Math.cos(a) * s + 'px'); d.style.setProperty('--dy', Math.sin(a) * s - 60 + 'px'); d.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      d.style.animationDelay = (Math.random() * 0.12) + 's';
      document.body.appendChild(d); setTimeout(() => d.remove(), 1200);
    }
  }
  function worldFx(color = 0xffd23f, big = false) {
    const p = game.player.pos;
    fx.coins(p, game.lowQ ? 10 : big ? 26 : 16); fx.sparkle(p, color, big ? 30 : 16);
    if (big) { fx.ring(p, color, 4, 0.5, true); game.juice?.flash?.(0.12, color); }
  }

  // grant a bundle {cash, luck, inc, speed, creature} — returns a short summary
  function grant(r, el, big = false) {
    const parts = [];
    if (r.cash) {
      const v = cashFor(r.cash); S.cash += v; S.total = (S.total || 0) + v; parts.push('+$' + fmt(v));
      game.float('+$' + fmt(v), game.player.pos, '#ffd23f'); sound.cash(true);
    }
    if (r.luck) { addBoost('luckT', r.luck); parts.push(`🍀 Luck x${LUCK_MUL} ${Math.round(r.luck / 60)} min`); }
    if (r.inc) { addBoost('incT', r.inc); parts.push(`📈 Cash x${INC_MUL} ${Math.round(r.inc / 60)} min`); }
    if (r.speed) {
      if (S.speedLv < C.SPEED_MAX_LV) { S.speedLv++; game.player.speedLv = S.speedLv; parts.push(`⚡ Speed Lv ${S.speedLv}`); }
      else { const v = cashFor(150); S.cash += v; parts.push('+$' + fmt(v)); }
    }
    if (r.luck || r.inc || r.speed) sound.buy();
    if (r.creature) parts.push(giveCreature(rollCreature(r.creature)));
    coinBurst(el, r.creature ? '⭐' : '🪙', big ? 22 : 14); worldFx(r.creature ? 0xc070ff : 0xffd23f, big);
    game.save();
    return parts.join(' · ');
  }

  function placeCreature(c, i) {
    const P = game.player.plot;
    game.setPed(P, i, c); game.pedToSave(i);
    const entry = S.index[c.id] || (S.index[c.id] = {}), key = c.mut || 'n', fresh = !entry[key]; entry[key] = 1;
    const col = new game.THREE.Color(rarityOf(c).color).getHex(), pos = P.pedestals[i].pos;
    fx.burst(pos, col, 40); fx.ring(pos, col, 3.5, 0.5, true); fx.pillar(pos, col, game.lowQ ? 18 : 32, 1);
    if (fresh) game.showNewCard(c.id, c.mut, c.w); else sound.newCreature?.(C.CREATURE_BY_ID[c.id].r);
    bus.emit('place', game.player, { ...c, gift: true }, i, fresh);
    game.save();
  }
  function giveCreature(c) {
    const i = game.freeSlot(game.player.plot);
    if (i >= 0) { placeCreature(c, i); game.toast(`🎁 ${creatureName(c)} placed in your base!`, 'gold'); return `🎁 ${creatureName(c)}`; }
    st.pending.push(c);
    game.toast(`🎁 Base full! ${creatureName(c)} is waiting in GIFTS`, 'gold');
    return `🎁 ${creatureName(c)} (pending — free a pedestal)`;
  }
  function claimPending(el) {
    let n = 0;
    while (st.pending.length) {
      const i = game.freeSlot(game.player.plot); if (i < 0) break;
      placeCreature(st.pending.shift(), i); n++;
    }
    if (n) { coinBurst(el, '⭐', 16); worldFx(0xc070ff, true); game.toast(`🎁 ${n} gift creature${n > 1 ? 's' : ''} placed!`, 'gold'); }
    else { sound.deny?.(); game.toast('Base full — sell a creature first', 'red'); }
    game.save(); render();
  }

  // ------------------------------------------------------------ render
  const rewardText = r => {
    if (r.creature) return { e: '🎁', v: 'Free EPIC+' };
    const out = [];
    if (r.cash) out.push('$' + fmt(cashFor(r.cash)));
    if (r.luck) out.push(`Luck x${LUCK_MUL}`);
    if (r.inc) out.push(`Cash x${INC_MUL}`);
    const e = r.luck && r.inc ? '🌟' : r.luck ? '🍀' : r.inc ? '📈' : r.cash >= 300 ? '💰' : '💵';
    return { e, v: out.join(' + ') + (r.luck || r.inc ? ` ${Math.round((r.luck || r.inc) / 60)}m` : '') };
  };
  function render() {
    for (const b of tabBtns) b.classList.toggle('on', b.dataset.tab === tab);
    const body = $('rwBody');
    if (tab === 'daily') {
      const d = daily(); shownClaimable = d.claimable;
      let h = '<div class="rwCal">';
      DAYS.forEach((r, i) => {
        const n = i + 1, t = rewardText(r);
        const cls = (n <= d.done ? ' done' : '') + (d.claimable && n === d.next ? ' now' : '') + (r.creature ? ' big' : '');
        h += `<div class="rwDay${cls}"><div class="dn">DAY ${n}</div><div class="de">${t.e}</div><div class="dv">${t.v}</div></div>`;
      });
      h += '</div><div class="rwCenter">';
      if (d.claimable) h += `<button class="btn gold" id="rwClaimDay">${game.icon('sparkle')} CLAIM DAY ${d.next}</button>`;
      else h += `<button class="btn grey" disabled>Come back tomorrow!</button><div class="rwNote">Next reward in <b data-rwt="midnight"></b> · Day ${d.next} ${d.next === 7 ? '= free EPIC+ creature!' : ''}</div>`;
      h += `<div class="rwNote">Log in every day — missing a day resets the streak.${d.reset ? ' <span style="color:#ff8a9a">Your streak was reset.</span>' : ''} Best streak: ${st.best || 0}</div></div>`;
      if (st.pending.length) h += `<div class="row rwPend"><div class="ic" style="--icbg:#c070ff">🎁</div><div class="tx"><b>${st.pending.length} creature${st.pending.length > 1 ? 's' : ''} waiting</b><span>${st.pending.map(creatureName).join(', ')}</span></div><button class="btn purple" id="rwPendBtn">PLACE</button></div>`;
      body.innerHTML = h;
      const cb = $('rwClaimDay'); if (cb) cb.onclick = () => claimDaily(cb);
      const pb = $('rwPendBtn'); if (pb) pb.onclick = () => claimPending(pb);
    } else if (tab === 'gifts') {
      let h = '<div class="psub">Free gifts for playing — they unlock the longer you stay this session!</div><div class="rwGifts">';
      GIFT_MIN.forEach((m, i) => {
        const t = rewardText(GIFTS[i]), ready = giftReady(i), done = giftClaimed[i];
        h += `<div class="rwGift${ready ? ' ready' : ''}${done ? ' claimed' : ''}"><div class="ge">${done ? '✅' : '🎁'}</div><div class="gt">${m} min · ${t.v}</div>`
          + (done ? '<button class="btn grey" disabled>CLAIMED</button>' : ready ? `<button class="btn gold" data-gift="${i}">CLAIM</button>` : `<button class="btn grey" disabled data-rwt="gift${i}"></button>`) + '</div>';
      });
      body.innerHTML = h + '</div>';
      body.querySelectorAll('[data-gift]').forEach(b => b.onclick = () => claimGift(+b.dataset.gift, b));
    } else {
      body.innerHTML = `<div class="rwWheelWrap"><div class="rwPointer"></div><canvas id="rwWheel" width="440" height="440"></canvas><div class="rwHub stroke">SPIN</div></div>
        <div class="rwBtns"><button class="btn gold" id="rwSpinFree"></button><button class="btn pink" id="rwSpinAd">${game.icon('play')} +1 SPIN (AD)</button></div>
        <div class="rwNote" id="rwSpinNote">1 free spin every 30 min · ${adSpinsLeft()} ad spins left today</div>`;
      drawWheel($('rwWheel'));
      $('rwWheel').style.transform = `rotate(${wheelDeg}deg)`;
      $('rwSpinFree').onclick = () => { if (!spinning && spinFree()) { st.nextSpin = now() + SPIN_CD; spin(); } };
      $('rwSpinAd').onclick = async () => {
        if (spinning || adSpinsLeft() <= 0) return;
        const ok = await game.rewardedAd(); if (!ok) return;
        if (st.adDay !== today()) { st.adDay = today(); st.adSpins = 0; }
        st.adSpins++; if (!isOpen()) open('spin'); else if (tab !== 'spin') { tab = 'spin'; render(); }
        spin();
      };
    }
    refresh(true);
  }

  // live text (timers / enabled states) without rebuilding the DOM
  function refresh(force) {
    const bs = $('rwBoosts');
    if (bs) {
      let h = '';
      if (st.luckT > 0) h += `<span class="rwChip luck">🍀 Luck x${LUCK_MUL} · ${mmss(st.luckT)}</span>`;
      if (st.incT > 0) h += `<span class="rwChip inc">📈 Cash x${INC_MUL} · ${mmss(st.incT)}</span>`;
      if (bs._h !== h) { bs.innerHTML = h; bs._h = h; }
    }
    if (!isOpen() && !force) return;
    for (const el of panel.querySelectorAll('[data-rwt]')) {
      const k = el.dataset.rwt;
      if (k === 'midnight') { const d = new Date(), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); el.textContent = mmss((m - d) / 1000); }
      else if (k.startsWith('gift')) {
        const i = +k.slice(4);
        if (giftReady(i)) { render(); return; }
        el.textContent = '🔒 ' + mmss(GIFT_MIN[i] * 60 - sessionT);
      }
    }
    if (tab === 'daily' && isOpen() && daily().claimable !== shownClaimable) { render(); return; } // day rolled over while open
    const fb = $('rwSpinFree'), ab = $('rwSpinAd');
    if (fb) {
      const free = spinFree();
      fb.disabled = spinning || !free; fb.className = 'btn ' + (free ? 'gold' : 'grey');
      fb.innerHTML = free ? `${game.icon('sparkle')} FREE SPIN!` : `Free spin in ${mmss((st.nextSpin - now()) / 1000)}`;
    }
    if (ab) { ab.disabled = spinning || adSpinsLeft() <= 0; }
    const note = $('rwSpinNote'); if (note && !spinning) note.textContent = winTxt ? 'You won: ' + winTxt : `1 free spin every 30 min · ${Math.max(0, adSpinsLeft())} ad spins left today`;
  }

  // ------------------------------------------------------------ claims
  function claimDaily(el) {
    const d = daily(); if (!d.claimable) return;
    st.streak = d.next; st.lastDay = today(); st.shownDay = today();
    st.best = Math.max(st.best || 0, st.streak);
    const r = DAYS[d.next - 1];
    const txt = grant(r, el, d.next >= 5);
    game.bigText(`DAY ${d.next}!`, txt);
    if (d.next === 7) game.toast('🔥 7-day streak complete! A new week starts tomorrow', 'gold');
    render();
  }
  function claimGift(i, el) {
    if (!giftReady(i)) return;
    giftClaimed[i] = true;
    const txt = grant(GIFTS[i], el, i >= 4);
    game.toast(`🎁 Gift: ${txt}`, 'gold');
    render();
  }

  // ------------------------------------------------------------ Lucky Spin wheel
  const SEG_A = Math.PI * 2 / SEGS.length;
  let wheelDeg = 0, spinning = false, winTxt = '';
  function drawWheel(cv) {
    const x = cv.getContext('2d'), R = cv.width / 2;
    x.clearRect(0, 0, cv.width, cv.height);
    SEGS.forEach((s, i) => {
      const a0 = -Math.PI / 2 + i * SEG_A, a1 = a0 + SEG_A;
      x.beginPath(); x.moveTo(R, R); x.arc(R, R, R - 4, a0, a1); x.closePath();
      const g = x.createRadialGradient(R, R, R * 0.15, R, R, R);
      g.addColorStop(0, '#fff'); g.addColorStop(0.25, s.col); g.addColorStop(1, s.col);
      x.fillStyle = g; x.fill(); x.lineWidth = 5; x.strokeStyle = '#141020'; x.stroke();
      x.save(); x.translate(R, R); x.rotate(a0 + SEG_A / 2);
      x.textAlign = 'right'; x.textBaseline = 'middle';
      x.font = '44px sans-serif'; x.fillText(s.emo, R - 18, 0);
      x.font = '26px "Lilita One", Arial Black, sans-serif'; x.lineWidth = 6; x.strokeStyle = '#141020'; x.fillStyle = '#fff';
      x.strokeText(s.label, R - 72, 0); x.fillText(s.label, R - 72, 0);
      x.restore();
    });
    x.beginPath(); x.arc(R, R, R - 3, 0, Math.PI * 2); x.lineWidth = 6; x.strokeStyle = '#141020'; x.stroke();
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; x.beginPath(); x.arc(R + Math.cos(a) * (R - 14), R + Math.sin(a) * (R - 14), 5, 0, Math.PI * 2); x.fillStyle = i % 2 ? '#fff6c2' : '#ffd23f'; x.fill(); }
  }
  function spin() {
    if (spinning) return;
    spinning = true; winTxt = ''; st.spins++; game.save();
    const k = pickW(SEGS.map((s, i) => [i, s.w]));
    const segDeg = 360 / SEGS.length;
    const target = -(k + 0.5) * segDeg + (Math.random() - 0.5) * segDeg * 0.7;
    const cur = ((wheelDeg % 360) + 360) % 360, want = ((target % 360) + 360) % 360;
    wheelDeg += 360 * 5 + ((want - cur + 360) % 360);
    const cv = $('rwWheel');
    if (cv) { cv.style.transition = 'transform 4.2s cubic-bezier(.12,.75,.12,1)'; void cv.offsetWidth; cv.style.transform = `rotate(${wheelDeg}deg)`; }
    refresh(true);
    // ticking sound as segments pass the pointer
    let lastSeg = -1;
    const tickLoop = () => {
      if (!spinning) return;
      const c = $('rwWheel');
      if (c) {
        const m = getComputedStyle(c).transform;
        if (m && m !== 'none') {
          const v = m.match(/matrix\(([^)]+)\)/); if (v) { const [a, b] = v[1].split(',').map(Number); const deg = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; const seg = Math.floor(((360 - deg) % 360) / segDeg); if (seg !== lastSeg) { lastSeg = seg; sound.tick?.(); } }
        }
      }
      requestAnimationFrame(tickLoop);
    };
    requestAnimationFrame(tickLoop);
    setTimeout(() => { spinning = false; spinResult(k); }, 4300);
  }
  function spinResult(k) {
    const s = SEGS[k], el = document.querySelector('.rwHub');
    let txt;
    if (s.k === 'cash') txt = grant({ cash: s.v }, el);
    else if (s.k === 'luck') txt = grant({ luck: s.v }, el);
    else if (s.k === 'inc') txt = grant({ inc: s.v }, el);
    else if (s.k === 'speed') txt = grant({ speed: 1 }, el);
    else if (s.k === 'creature') txt = grant({ creature: s.v }, el, true);
    else { txt = grant({ cash: s.v }, el, true); game.addShake?.(0.25); }
    game.bigText(s.k === 'jackpot' ? '👑 JACKPOT! 👑' : 'LUCKY SPIN!', txt);
    winTxt = txt;
    refresh(true);
  }

  // ------------------------------------------------------------ bots spin too (light touch: small cash, rare shout-outs)
  const botT = new Map();
  function botTick(dt) {
    for (const b of game.bots) {
      let t = botT.get(b); if (t === undefined) t = 120 + Math.random() * 300;
      t -= dt;
      if (t <= 0) {
        t = 360 + Math.random() * 420; // "humans" don't spin like clockwork
        let inc = 0; for (const ped of b.plot.pedestals) if (ped.creature) inc += game.income(ped.creature.id, ped.creature.mut, ped.creature.w);
        const jack = Math.random() < 0.03;
        b.cash = (b.cash || 0) + Math.max(30 * wm(), inc * (jack ? 300 : 40));
        if (jack && game.started) game.toast(`👑 ${b.name} hit the JACKPOT on the Lucky Spin!`, 'gold');
      }
      botT.set(b, t);
    }
  }

  // ------------------------------------------------------------ loop
  let autoT = -1, uiT = 0, chipT = 0;
  bus.on('start', () => { if (st.shownDay !== today() && daily().claimable) autoT = 1.2; });
  bus.on('tick', dt => {
    sessionT += dt;
    if (st.luckT > 0) st.luckT = Math.max(0, st.luckT - dt);
    if (st.incT > 0) st.incT = Math.max(0, st.incT - dt);
    botTick(dt);
    // daily popup: once per day after PLAY, never on top of the offline-earnings popup or another panel
    if (autoT > 0) {
      autoT -= dt;
      if (autoT <= 0) {
        const off = $('offline'), busy = (off && !off.classList.contains('hidden')) || [...document.querySelectorAll('.panel')].some(p => !p.classList.contains('hidden'));
        if (busy) autoT = 0.5;
        else { st.shownDay = today(); if (daily().claimable) { open('daily'); sound.newCreature?.(3); } }
      }
    }
    for (let i = 0; i < GIFT_MIN.length; i++) if (!giftAnnounced[i] && giftReady(i)) { giftAnnounced[i] = true; game.toast(`🎁 Playtime gift ready! Press G`, 'gold'); }
    chipT -= dt;
    if (chipT <= 0) {
      chipT = 0.25;
      let h = '';
      if (st.luckT > 0) h += `<span class="rwChip luck">🍀${LUCK_MUL}x ${mmss(st.luckT)}</span>`;
      if (st.incT > 0) h += `<span class="rwChip inc">📈${INC_MUL}x ${mmss(st.incT)}</span>`;
      if (chips._h !== h) { chips.innerHTML = h; chips._h = h; }
    }
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.5;
      const d = daily().claimable || pendingClaimable(), g = GIFT_MIN.some((_, i) => giftReady(i)), s = spinFree() && !spinning;
      hudBtn.classList.toggle('has', d || g || s);
      tabBtns[0].classList.toggle('has', d); tabBtns[1].classList.toggle('has', g); tabBtns[2].classList.toggle('has', s);
      refresh(false);
    }
  });

  // debug helpers for testing
  game.rewards = { st, open, daily, spin: () => { open('spin'); spin(); }, setSession: s => { sessionT = s; }, cashFor };
}
