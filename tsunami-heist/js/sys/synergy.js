// synergy system — see ../hooks.js for the bus API
// Makes WHICH creatures you own matter:
//  • Perks: every Legendary+ creature on your pedestals grants one passive perk (distinct species only, each type capped).
//  • Collection sets: 3+ distinct species of a themed set on your pedestals → set bonus income; the full set → more.
//  • Delivery streak: each creature brought home without dying raises a streak that boosts the delivery cash bonus.
//  • Total permanent income from this system is capped at +25%.

// ---------------------------------------------------------------- data
const PERK_TYPES = {
  income: { label: v => `+${pct(v)} income`, emo: '💰', cap: 0.12 },
  speed: { label: v => `+${pct(v)} track speed`, emo: '👟', cap: 0.12 },
  luck: { label: v => `+${pct(v)} mutation luck`, emo: '🍀', cap: 0.25 },
  wave: { label: v => `waves ${pct(v)} slower`, emo: '🌊', cap: 0.09 },
  steal: { label: v => `+${pct(v)} heist bounty`, emo: '😈', cap: 0.30 },
  lock: { label: v => `-${pct(v)} lock cooldown`, emo: '🔒', cap: 0.30 },
};
const PERK_BASE = { income: 0.05, speed: 0.04, luck: 0.08, wave: 0.03, steal: 0.10, lock: 0.10 };
// fixed per creature id (deterministic); rarity scales the value: Legendary x1, Mythic x1.5, Secret x2
const PERK_OF = {
  kingcroi: 'income', spaceshk: 'speed', dragfrt: 'luck', thundmoo: 'wave',
  coscapy: 'lock', pharfish: 'steal', tsuspir: 'wave', gigachick: 'speed',
  bigcheese: 'income', lordbub: 'luck', glitch: 'steal', omegaduck: 'speed',
};
const SETS = [
  { id: 'bakery', name: 'Bakery Bunch', emo: '🥐', color: '#ffb84a', ids: ['breadpup', 'burgbear', 'ninjnug', 'kingcroi', 'bigcheese'] },
  { id: 'sea', name: 'Deep Blue', emo: '🦈', color: '#3fc8ff', ids: ['sharksnk', 'cappucrab', 'spaceshk', 'pharfish', 'tsuspir', 'lordbub'] },
  { id: 'birds', name: 'Feathered Crew', emo: '🐤', color: '#ffe14a', ids: ['pizpeng', 'discduck', 'gigachick', 'omegaduck'] },
  { id: 'junk', name: 'Junk Drawer', emo: '🧦', color: '#d9ccff', ids: ['sockgob', 'mopsy', 'toastoad', 'glitch'] },
  { id: 'jungle', name: 'Jungle Fruit', emo: '🌵', color: '#7dff9a', ids: ['pebfrog', 'cactcat', 'banband', 'dragfrt'] },
  { id: 'herd', name: 'Wild Herd', emo: '🦙', color: '#ff8a5a', ids: ['bubbun', 'lavalama', 'turbturt', 'thundmoo', 'coscapy'] },
];
const SET_PART = 0.06, SET_FULL = 0.12;     // income bonus for 3+ / complete set
const INCOME_CAP = 0.25;                     // whole system, permanent
const LUMP_SECS = 10;                        // delivery bonus = N seconds of that creature's income
const STREAK_STEP = 0.05, STREAK_MAX = 1.5;  // x1.0 → x1.5 at streak 11
const BOUNTY_SECS = 240;                     // heist bounty = stealPct × 240s of the creature's income
const MILESTONES = [5, 10, 20, 30, 50];

const pct = v => Math.round(v * 100) + '%';
const SET_OF = {};
for (const s of SETS) for (const id of s.ids) SET_OF[id] = s;

export default function init(game, bus) {
  const { C } = game;
  const st = bus.state('synergy', { streak: 0, best: 0 });
  const perkVal = id => {
    const t = PERK_OF[id], c = C.CREATURE_BY_ID[id];
    if (!t || !c || c.r < 4) return 0;
    return PERK_BASE[t] * (c.r >= 6 ? 2 : c.r === 5 ? 1.5 : 1);
  };

  // ------------------------------------------------------------ aggregate state (recomputed a few times per second)
  const agg = { perks: {}, perkList: [], sets: [], setInc: 0, perkInc: 0, inc: 0, key: '' };
  for (const k in PERK_TYPES) agg.perks[k] = 0;
  let primed = false;
  const prevSetLv = {};
  function recompute() {
    const P = game.player.plot, owned = new Set();
    for (let i = 0; i < P.pedestals.length; i++) { const cr = P.pedestals[i].creature; if (cr) owned.add(cr.id); }
    const key = [...owned].sort().join(',');
    if (key === agg.key && primed) return;
    agg.key = key;
    for (const k in PERK_TYPES) agg.perks[k] = 0;
    agg.perkList.length = 0;
    for (const id of owned) {
      const v = perkVal(id); if (!v) continue;
      const t = PERK_OF[id];
      agg.perks[t] += v;
      agg.perkList.push({ id, t, v });
    }
    for (const k in PERK_TYPES) agg.perks[k] = Math.min(PERK_TYPES[k].cap, agg.perks[k]);
    agg.perkList.sort((a, b) => C.CREATURE_BY_ID[b.id].r - C.CREATURE_BY_ID[a.id].r);
    agg.sets.length = 0; agg.setInc = 0;
    const gained = [], lost = [];
    for (const s of SETS) {
      const n = s.ids.reduce((m, id) => m + (owned.has(id) ? 1 : 0), 0);
      const lv = n >= s.ids.length ? 2 : n >= 3 ? 1 : 0;
      const bonus = lv === 2 ? SET_FULL : lv === 1 ? SET_PART : 0;
      agg.setInc += bonus;
      agg.sets.push({ s, n, lv, bonus });
      const pl = prevSetLv[s.id] ?? lv;
      if (primed && lv > pl) gained.push({ s, lv, bonus, n });
      else if (primed && lv < pl) lost.push({ s, lv });
      prevSetLv[s.id] = lv;
    }
    agg.perkInc = agg.perks.income;
    agg.inc = Math.min(INCOME_CAP, agg.perkInc + agg.setInc);
    primed = true;
    for (const g of gained) celebrate(g.lv === 2 ? 'SET COMPLETE!' : 'SET BONUS!', `${g.s.emo} ${g.s.name} · +${pct(g.bonus)} income${agg.perkInc + agg.setInc > INCOME_CAP ? ' (capped)' : ''}`, g.s.color, true);
    for (const l of lost) game.toast(`💔 ${l.s.name} set bonus ${l.lv ? 'reduced' : 'lost'}`, 'red');
    cardDirty = true;
  }

  // ------------------------------------------------------------ modifiers
  bus.mod('income', () => 1 + agg.inc);
  bus.mod('speed', a => (a === game.player && a.pos.z <= 0 ? 1 + agg.perks.speed : 1));
  bus.mod('luck', () => 1 + agg.perks.luck);
  bus.mod('wave', () => 1 - agg.perks.wave);
  bus.on('lock', P => {
    if (P !== game.player.plot || !agg.perks.lock) return;
    P.lockCd = (P.locked || 0) + C.LOCK_COOLDOWN * (1 - agg.perks.lock);
  });

  // ------------------------------------------------------------ delivery streak + place bonuses
  const streakMult = () => Math.min(STREAK_MAX, 1 + Math.max(0, st.streak - 1) * STREAK_STEP);
  bus.on('place', (a, c, i, fresh) => {
    if (a !== game.player) return;
    st.streak++; st.best = Math.max(st.best, st.streak);
    const ped = a.plot.pedestals[i], pos = ped ? ped.pos : a.pos;
    const ips = game.income(c.id, c.mut, c.w) * game.incMult();
    const m = streakMult();
    let lump = Math.max(5 * C.WORLDS[C.WORLD].mult, ips * LUMP_SECS * m);
    let bounty = 0;
    if (c.from && agg.perks.steal > 0) bounty = ips * BOUNTY_SECS * agg.perks.steal;
    const total = Math.floor(lump + bounty);
    game.S.cash += total; game.S.total = (game.S.total || 0) + total;
    setTimeout(() => {
      game.float(`+$${game.fmt(total)} ${bounty ? 'HEIST ' : ''}DELIVERY${m > 1 ? ' x' + m.toFixed(2) : ''}`, pos.clone().setY(pos.y + 1.2), bounty ? '#ff9ad5' : '#ffd23f');
    }, 350);
    if (MILESTONES.includes(st.streak)) {
      celebrate(`🔥 STREAK ${st.streak}!`, `Delivery bonus x${m.toFixed(2)} — don't die!`, '#ff8a2a', false);
    }
    // perk mention
    const pv = perkVal(c.id);
    if (pv) {
      const t = PERK_OF[c.id];
      let dup = 0; for (const p of a.plot.pedestals) if (p.creature && p.creature.id === c.id) dup++;
      game.toast(`✨ ${C.CREATURE_BY_ID[c.id].name} perk: ${PERK_TYPES[t].label(pv)}${dup > 1 ? ' (already active)' : ''}`, 'gold');
    }
    const s = SET_OF[c.id];
    if (s && !pv) {
      let n = 0; const P = a.plot; const seen = new Set();
      for (const p of P.pedestals) if (p.creature && s.ids.includes(p.creature.id)) seen.add(p.creature.id);
      n = seen.size;
      if (n === 2) game.toast(`${s.emo} ${s.name} 2/${s.ids.length} — one more for a SET BONUS!`);
    }
    recompute();
    updateChip(true);
  });
  bus.on('kill', a => {
    if (a !== game.player || st.streak <= 0) return;
    if (st.streak >= 3) game.toast(`🔥 Delivery streak lost (${st.streak})`, 'red');
    st.streak = 0; updateChip(true);
  });

  // ------------------------------------------------------------ UI
  const css = document.createElement('style');
  css.textContent = `
#synStreak { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; padding: 0 8px 0 5px; border-radius: 9px; border: 2px solid var(--ink, #141020);
  background: linear-gradient(180deg, #ffb03a, #ff5a1f); color: #fff; font-size: 15px; line-height: 20px; vertical-align: 2px; box-shadow: 0 2px 0 rgba(20,16,32,.45); }
#synStreak.hot { background: linear-gradient(180deg, #ff6a3a, #e8155a); }
#synStreak.max { background: linear-gradient(180deg, #ffe14a, #ff3fa0); }
#synStreak.bump { animation: synBump .45s cubic-bezier(.2,1.8,.4,1); }
#synStreak .fl { display: inline-block; animation: synFlick .5s ease-in-out infinite alternate; }
@keyframes synFlick { to { transform: scale(1.18) rotate(-6deg); } }
@keyframes synBump { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }
#synCard { position: absolute; left: 16px; top: 196px; width: 236px; padding: 8px 10px 9px; border-radius: 14px; pointer-events: none;
  border: 3px solid rgba(255,255,255,.16); background: linear-gradient(180deg, rgba(36,28,78,.78), rgba(20,16,40,.62)); box-shadow: 0 4px 0 rgba(20,16,32,.35);
  font-size: 14px; line-height: 1.32; transition: opacity .25s, transform .25s; }
#synCard.off { opacity: 0; transform: translateX(-14px); }
#synCard h4 { margin: 0 0 3px; font-size: 16px; font-weight: normal; color: #ffd23f; letter-spacing: .5px; display: flex; justify-content: space-between; }
#synCard h4 span { color: #7dff9a; }
#synCard .r { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#synCard .dim { color: #b8acd9; }
#synCard .sep { height: 2px; margin: 4px 0; background: rgba(255,255,255,.12); border-radius: 1px; }
#synCel { position: absolute; left: 50%; top: 24%; transform: translateX(-50%); text-align: center; pointer-events: none; z-index: 6; }
#synCel .t { font-size: 58px; line-height: 1; animation: synPop .5s cubic-bezier(.2,1.8,.4,1); }
#synCel .s { font-size: 22px; color: #fff; margin-top: 4px; }
#synCel.out { opacity: 0; transition: opacity .4s; }
@keyframes synPop { 0% { transform: scale(.2) rotate(-8deg); opacity: 0; } 60% { transform: scale(1.15) rotate(2deg); opacity: 1; } 100% { transform: scale(1); } }
@media (max-width: 760px) { #synCard { top: 186px; width: 190px; font-size: 11px; padding: 5px 7px; } #synCard h4 { font-size: 13px; } #synCel .t { font-size: 38px; } #synCel .s { font-size: 15px; } #synStreak { font-size: 12px; line-height: 16px; } }
@media (max-height: 480px) { #synCard { top: 128px; width: 180px; font-size: 11px; padding: 4px 7px; max-height: 44vh; overflow: hidden; } #synCard h4 { font-size: 13px; } #synCel .t { font-size: 34px; } }
`;
  document.head.appendChild(css);
  const hud = document.getElementById('hud');
  const chip = document.createElement('span');
  chip.id = 'synStreak'; chip.className = 'hidden';
  (document.getElementById('income') || document.getElementById('cashBox') || hud).appendChild(chip);
  const card = document.createElement('div');
  card.id = 'synCard'; card.className = 'stroke off';
  hud.appendChild(card);
  const cel = document.createElement('div');
  cel.id = 'synCel'; cel.className = 'stroke hidden';
  hud.appendChild(cel);

  let chipH = '';
  function updateChip(bump) {
    const show = st.streak >= 2;
    chip.classList.toggle('hidden', !show);
    if (!show) { chipH = ''; return; }
    const m = streakMult();
    const h = `<span class="fl">🔥</span>${st.streak} · x${m.toFixed(2)}`;
    if (h !== chipH) { chipH = h; chip.innerHTML = h; }
    chip.classList.toggle('max', m >= STREAK_MAX);
    chip.classList.toggle('hot', m < STREAK_MAX && st.streak >= 5);
    chip.title = 'Delivery streak — bring creatures home without dying';
    if (bump) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
  }

  const celQ = [];
  let celT = 0;
  function celebrate(t, s, color, big) {
    celQ.push({ t, s, color, big });
    if (celQ.length > 3) celQ.shift();
  }
  function showCel(e) {
    cel.innerHTML = `<div class="t" style="color:${e.color}">${e.t}</div><div class="s">${e.s}</div>`;
    cel.classList.remove('hidden', 'out');
    celT = 2.2;
    try {
      const p = game.player.pos;
      const col = new game.THREE.Color(e.color).getHex();
      game.fx.burst(p, col, game.lowQ ? 20 : 40);
      game.fx.ring(p, col, 4, 0.6, true);
      if (e.big) { game.fx.pillar(p, col, game.lowQ ? 16 : 30, 1); game.juice?.flash?.(0.15, col); }
      game.sound.newCreature ? game.sound.newCreature() : game.sound.buy();
    } catch { }
  }

  let cardDirty = true, cardShown = false, cardH = '';
  function renderCard() {
    const rows = [];
    const inc = agg.perkInc + agg.setInc;
    rows.push(`<h4>BONUSES <span>+${pct(agg.inc)}${inc > INCOME_CAP ? ' MAX' : ''}</span></h4>`);
    if (agg.perkList.length) {
      const seen = {};
      for (const p of agg.perkList) {
        const c = C.CREATURE_BY_ID[p.id], R = C.RARITIES[c.r];
        const capped = (seen[p.t] = (seen[p.t] || 0) + p.v) > PERK_TYPES[p.t].cap + 1e-6;
        rows.push(`<div class="r${capped ? ' dim' : ''}">${PERK_TYPES[p.t].emo} <span style="color:${R.rainbow ? '#fff' : R.color}">${c.name}</span> ${PERK_TYPES[p.t].label(p.v)}${capped ? ' (cap)' : ''}</div>`);
      }
    } else rows.push(`<div class="r dim">✨ Legendary+ creatures give perks</div>`);
    rows.push('<div class="sep"></div>');
    const shown = agg.sets.filter(x => x.n >= 1).sort((a, b) => b.lv - a.lv || b.n - a.n).slice(0, game.isTouch ? 3 : 4);
    if (shown.length) for (const x of shown) {
      rows.push(`<div class="r${x.lv ? '' : ' dim'}">${x.s.emo} <span style="color:${x.lv ? x.s.color : 'inherit'}">${x.s.name}</span> ${x.n}/${x.s.ids.length}${x.lv ? ` <span style="color:#7dff9a">+${pct(x.bonus)}</span>` : x.n === 2 ? ' · 1 more!' : ''}</div>`);
    }
    else rows.push(`<div class="r dim">📚 Own 3 of a set for bonus income</div>`);
    if (st.streak >= 1) rows.push(`<div class="sep"></div><div class="r">🔥 Streak ${st.streak} · delivery x${streakMult().toFixed(2)}</div>`);
    const h = rows.join('');
    if (h !== cardH) { cardH = h; card.innerHTML = h; }
  }

  let recT = 0, uiT = 0;
  bus.on('start', () => { recompute(); updateChip(false); });
  bus.on('boot', () => { recompute(); });
  bus.on('travel', () => { cardDirty = true; });
  bus.on('tick', dt => {
    recT -= dt;
    if (recT <= 0) { recT = 0.5; recompute(); }
    if (celT > 0) {
      celT -= dt;
      if (celT <= 0.4 && !cel.classList.contains('out')) cel.classList.add('out');
      if (celT <= 0) cel.classList.add('hidden');
    } else if (celQ.length) showCel(celQ.shift());
    uiT -= dt; if (uiT > 0) return; uiT = 0.25;
    const P = game.player.plot, p = game.player.pos;
    const inBase = P.contains(p.x, p.z) && !(game.player.dead > 0) && !(game.player.swept > 0);
    if (inBase !== cardShown) {
      cardShown = inBase; card.classList.toggle('off', !inBase); if (inBase) cardDirty = true;
      // shares the left slot with the quest tracker: inside your base the bonuses card replaces it
      const qt = document.getElementById('qTrack'); if (qt) { qt.style.transition = 'opacity .25s'; qt.style.opacity = inBase ? '0' : ''; qt.style.pointerEvents = inBase ? 'none' : ''; }
    }
    if (inBase && cardDirty) { cardDirty = false; renderCard(); }
    if (st.streak >= 1 && cardShown) renderCard();
    updateChip(false);
  });

  // debug/inspection for other systems
  game.synergy = { agg, st, SETS, PERK_OF, perkVal, streakMult };
}
