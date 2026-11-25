// achievements system — lifetime stats, tiered badges, permanent income bonus, titles above name tags.
// See ../hooks.js for the bus API. Panel: key J / AWARDS button.
export default function init(game, bus) {
  const { C, S, player, bots, actors, W, fmt, sound, fx } = game;
  const $ = id => document.getElementById(id);
  const st = bus.state('achievements', { s: {}, done: {}, title: '', titleTier: 0, lost: [], unseen: 0 });
  const D = { grabs: 0, grabR: [0, 0, 0, 0, 0, 0, 0], rainbow: 0, steals: 0, stealsLeg: 0, stealSecret: 0, victims: {}, stoleBack: 0,
    hits: 0, thiefBonks: 0, locks: 0, robbed: 0, dWave: 0, dLava: 0, dFall: 0, waveStreak: 0, wipeRun: 0, safeRun: 0, bestSafeRun: 0,
    waves: 0, mega: 0, close: 0, dist: 0, time: 0, earned: 0, sells: 0, buys: 0, payday: 0, deepest: {}, secretHit: 0, heartbreak: 0 };
  const s = st.s;
  for (const k in D) if (s[k] === undefined) s[k] = JSON.parse(JSON.stringify(D[k]));
  s.steals = Math.max(s.steals, S.steals || 0);
  s.earned = Math.max(s.earned, S.total || 0);

  // ------------------------------------------------------------------ helpers
  const rar = id => C.CREATURE_BY_ID[id]?.r ?? 0;
  const discovered = () => C.CREATURES.filter(c => S.index[c.id]).length;
  const mutsFound = () => { let n = 0; for (const k in S.index) for (const m in S.index[k]) if (m !== 'n') n++; return n; };
  const ips = () => { let t = 0; for (const p of player.plot.pedestals) if (p.creature) t += game.income(p.creature.id, p.creature.mut, p.creature.w); return t * game.incMult(); };
  const deepest = () => { let m = -1; for (const w in s.deepest) m = Math.max(m, s.deepest[w]); return m + 1; };
  const abyssWorlds = () => Object.values(s.deepest).filter(z => z >= C.ZONE_COUNT - 1).length;
  const filled = () => { let n = 0; for (let i = 0; i < S.slots; i++) if (player.plot.pedestals[i].creature) n++; return n; };
  const nCre = C.CREATURES.length;

  // ------------------------------------------------------------------ definitions
  // t: thresholds (1-3 tiers) · ti: titles per tier (null = none) · secret: hidden until unlocked
  const CATS = [
    { id: 'col', name: 'Collector', ic: '📚', color: '#a07aff' }, { id: 'run', name: 'Runner', ic: '🏃', color: '#2fa6ff' },
    { id: 'thf', name: 'Thief', ic: '😈', color: '#ff4fa0' }, { id: 'def', name: 'Defender', ic: '🛡️', color: '#2fc85a' },
    { id: 'srv', name: 'Survivor', ic: '🌊', color: '#5ad8ff' }, { id: 'tyc', name: 'Tycoon', ic: '💰', color: '#ffd23f' },
    { id: 'exp', name: 'Explorer', ic: '🧭', color: '#ff9a4a' },
  ];
  const A = [
    // Collector
    { id: 'index', cat: 'col', ic: '📖', name: 'Creature Scholar', d: 'Discover # different creatures', t: [8, 20, nCre], v: discovered, ti: [null, null, 'Zookeeper'] },
    { id: 'muts', cat: 'col', ic: '✨', name: 'Shiny Hunter', d: 'Discover # mutated creatures', t: [1, 12, 40], v: mutsFound, ti: [null, null, 'Shiny Hunter'] },
    { id: 'leg', cat: 'col', ic: '🌟', name: 'Legend Grabber', d: 'Grab # Legendary+ creatures', t: [1, 10, 50], v: () => s.grabR[4] + s.grabR[5] + s.grabR[6] },
    { id: 'myth', cat: 'col', ic: '🔥', name: 'Myth Buster', d: 'Grab a Mythic creature', t: [1], v: () => s.grabR[5] + s.grabR[6], ti: ['Myth Hunter'] },
    { id: 'secret', cat: 'col', ic: '❔', name: 'Top Secret', d: 'Grab a Secret creature', t: [1], v: () => s.grabR[6], ti: ['Secret Keeper'] },
    { id: 'rainbow', cat: 'col', ic: '🌈', name: 'Taste the Rainbow', d: 'Grab a Rainbow mutation', t: [1], v: () => s.rainbow, ti: ['Rainbow Chaser'] },
    { id: 'full', cat: 'col', ic: '🏛️', name: 'Full House', d: `Fill all ${C.SLOTS_MAX} pedestals`, t: [C.SLOTS_MAX], v: () => S.slots >= C.SLOTS_MAX ? filled() : Math.min(filled(), C.SLOTS_MAX - 1) },
    // Runner
    { id: 'grabs', cat: 'run', ic: '🤲', name: 'Grabby Hands', d: 'Grab # creatures', t: [10, 150, 1000], v: () => s.grabs, ti: [null, 'Grabby', null] },
    { id: 'waves', cat: 'run', ic: '🏄', name: 'Wave Dodger', d: 'Survive # waves out on the track', t: [5, 50, 250], v: () => s.waves, ti: [null, null, 'Wave Rider'] },
    { id: 'mega', cat: 'run', ic: '🌀', name: 'Mega Survivor', d: 'Survive # MEGA waves out on the track', t: [1, 5, 25], v: () => s.mega, ti: [null, 'Tsunami Surfer', null] },
    { id: 'close', cat: 'run', ic: '😅', name: 'Photo Finish', d: 'Dive into a shelter a split second before the wave hits (# times)', t: [1, 10, 50], v: () => s.close, ti: [null, null, 'Close Call'] },
    { id: 'dist', cat: 'run', ic: '👟', name: 'Marathon', d: 'Run # m on the track', t: [2000, 20000, 100000], v: () => s.dist, ti: [null, null, 'Marathoner'] },
    { id: 'speed', cat: 'run', ic: '⚡', name: 'Need for Speed', d: 'Reach speed level #', t: [5, 20, C.SPEED_MAX_LV], v: () => S.speedLv, ti: [null, null, 'Speed Demon'] },
    { id: 'time', cat: 'run', ic: '⏱️', name: 'Beach Bum', d: 'Play for # minutes', t: [15, 60, 300], v: () => s.time / 60, ti: [null, null, 'Beach Bum'] },
    // Thief
    { id: 'steals', cat: 'thf', ic: '🦝', name: 'Sticky Fingers', d: 'Steal # creatures', t: [1, 25, 250], v: () => s.steals, ti: ['Pickpocket', null, 'Master Thief'] },
    { id: 'stealLeg', cat: 'thf', ic: '💎', name: 'Grand Heist', d: 'Steal # Legendary+ creatures', t: [1, 10, 40], v: () => s.stealsLeg, ti: [null, 'Heist Boss', null] },
    { id: 'victims', cat: 'thf', ic: '🎯', name: 'Equal Opportunity', d: 'Steal from # different rivals', t: [3, 5, 10], v: () => Object.keys(s.victims).length, ti: [null, null, 'Public Enemy'] },
    { id: 'stealSecret', cat: 'thf', ic: '🕵️', name: 'Inside Job', d: 'Steal a Secret creature', t: [1], v: () => s.stealSecret, secret: true, ti: ['Phantom'] },
    { id: 'stoleBack', cat: 'thf', ic: '🪃', name: 'Boomerang', d: 'Steal back a creature that was stolen from you', t: [1], v: () => s.stoleBack, secret: true, ti: ['Boomerang'] },
    // Defender
    { id: 'hits', cat: 'def', ic: '🏏', name: 'Bonk Squad', d: 'Land # hits', t: [10, 150, 1000], v: () => s.hits, ti: [null, null, 'Bonk Lord'] },
    { id: 'thiefBonk', cat: 'def', ic: '🚨', name: 'Not Today!', d: 'Bonk # thieves carrying your creature', t: [1, 10, 50], v: () => s.thiefBonks, ti: [null, 'Guardian', 'Sheriff'] },
    { id: 'locks', cat: 'def', ic: '🔒', name: 'Lockdown', d: 'Lock your base # times', t: [1, 25, 100], v: () => s.locks, ti: [null, null, 'Locksmith'] },
    { id: 'bat', cat: 'def', ic: '🔨', name: 'Heavy Hitter', d: 'Own the best bat', t: [1], v: () => (S.bat >= C.BATS.length - 1 ? 1 : 0), ti: ['Heavy Hitter'] },
    { id: 'robbed', cat: 'def', ic: '😭', name: 'Welcome to the Neighborhood', d: 'Get robbed # times', t: [1, 10, 50], v: () => s.robbed, ti: [null, null, 'Easy Target'] },
    // Survivor
    { id: 'dWave', cat: 'srv', ic: '💦', name: 'Soggy', d: 'Get wiped out by # waves', t: [10, 100, 500], v: () => s.dWave, ti: [null, 'Soggy', 'Fish Food'] },
    { id: 'dLava', cat: 'srv', ic: '🍳', name: 'Well Done', d: 'Get burned in lava # times', t: [1, 10, 50], v: () => s.dLava, ti: [null, 'Well Done', null] },
    { id: 'dFall', cat: 'srv', ic: '🕳️', name: 'Gravity Fan', d: 'Fall into the abyss # times', t: [1, 10, 50], v: () => s.dFall, ti: [null, 'Gravity Fan', null] },
    { id: 'safeRun', cat: 'srv', ic: '🧱', name: 'Unsinkable', d: 'Survive # waves in a row out on the track', t: [5, 15, 40], v: () => s.bestSafeRun, ti: [null, null, 'Unsinkable'] },
    { id: 'wipe3', cat: 'srv', ic: '🐟', name: 'Slow Learner', d: 'Get wiped out by 3 waves in a row', t: [1], v: () => (s.wipeRun >= 3 ? 1 : 0), secret: true, ti: ['Slow Learner'] },
    { id: 'secretHit', cat: 'srv', ic: '🫠', name: 'Butterfingers', d: 'Get smacked while carrying a Secret creature', t: [1], v: () => s.secretHit, secret: true, ti: ['Butterfingers'] },
    { id: 'heartbreak', cat: 'srv', ic: '💔', name: 'Heartbreak', d: 'Lose a Mythic+ creature to a wave', t: [1], v: () => s.heartbreak, secret: true, ti: ['Heartbroken'] },
    // Tycoon
    { id: 'earned', cat: 'tyc', ic: '💵', name: 'Money Bags', d: 'Earn $# in total', t: [1e4, 1e8, 1e12], v: () => s.earned, cash: true, ti: [null, null, 'Tycoon'] },
    { id: 'ips', cat: 'tyc', ic: '📈', name: 'Cash Machine', d: 'Reach $#/s income', t: [100, 1e5, 1e9], v: ips, cash: true, ti: [null, 'Big Shot', 'Mogul'] },
    { id: 'sells', cat: 'tyc', ic: '🏷️', name: 'Flipper', d: 'Sell # creatures', t: [1, 25, 100], v: () => s.sells, ti: [null, null, 'Flipper'] },
    { id: 'buys', cat: 'tyc', ic: '🛒', name: 'Big Spender', d: 'Buy # upgrades in the shop', t: [10, 50, 200], v: () => s.buys, ti: [null, null, 'Big Spender'] },
    { id: 'reb', cat: 'tyc', ic: '♻️', name: 'Born Again', d: 'Rebirth # times', t: [1, 3, 8], v: () => S.rebirths, ti: ['Reborn', null, 'Phoenix'] },
    { id: 'payday', cat: 'tyc', ic: '🤑', name: 'Payday', d: 'Collect 5+ minutes of income at once # times', t: [1, 10, 50], v: () => s.payday },
    // Explorer
    { id: 'worlds', cat: 'exp', ic: '🌍', name: 'Globetrotter', d: 'Unlock # worlds', t: [2, 3, C.WORLDS.length], v: () => (S.maxWorld || 0) + 1, ti: [null, null, 'Cosmonaut'] },
    { id: 'deep', cat: 'exp', ic: '🤿', name: 'Deep Diver', d: 'Reach zone # of a track', t: [3, 5, C.ZONE_COUNT], v: deepest, ti: [null, null, 'Abyss Walker'] },
    { id: 'abyss', cat: 'exp', ic: '💠', name: 'Abyss Collector', d: 'Reach the Crystal Abyss in # worlds', t: [1, 3, C.WORLDS.length], v: abyssWorlds, ti: [null, null, 'Deep Legend'] },
    { id: 'cosmic', cat: 'exp', ic: '🪐', name: 'Edge of Space', d: 'Reach the Crystal Abyss of Cosmic Shore', t: [1], v: () => ((s.deepest[C.WORLDS.length - 1] ?? -1) >= C.ZONE_COUNT - 1 ? 1 : 0), secret: true, ti: ['Star Walker'] },
  ];
  const TIERS = [{ n: 'Bronze', c: '#e8955a' }, { n: 'Silver', c: '#d6e2ec' }, { n: 'Gold', c: '#ffd23f' }];
  const tierOf = (a, k) => a.t.length === 1 ? { n: '', c: '#ffd23f' } : TIERS[k];
  const totalTiers = A.reduce((n, a) => n + a.t.length, 0);
  const doneCount = () => A.reduce((n, a) => n + (st.done[a.id] || 0), 0);
  const bonus = () => Math.min(0.25, doneCount() * 0.005);
  bus.mod('income', () => 1 + bonus());
  const SING = { creatures: 'creature', waves: 'wave', times: 'time', thieves: 'thief', hits: 'hit', worlds: 'world', 'upgrades': 'upgrade' };
  const desc = (a, k) => { let d = a.d.replace('#', fmt(a.t[k])); if (a.t[k] === 1) d = d.replace(/\b(creatures|waves|times|thieves|hits|worlds|upgrades)\b/, w => SING[w]); return d; };

  // titles: every tier with ti[k] → a selectable title
  const titleList = () => {
    const out = [];
    for (const a of A) a.ti?.forEach((t, k) => { if (t && (st.done[a.id] || 0) > k) out.push({ t, c: tierOf(a, k).c }); });
    if (doneCount() > 0) out.unshift({ t: 'Rookie', c: '#c9d3da' });
    return out;
  };
  const TITLE_COLOR = {}; for (const a of A) a.ti?.forEach((t, k) => { if (t) TITLE_COLOR[t] = tierOf(a, k).c; }); TITLE_COLOR.Rookie = '#c9d3da';

  // ------------------------------------------------------------------ name tag titles
  function wrapTag(a) {
    const ud = a.tag?.userData; if (!ud || !ud.draw || ud.draw._ach) return;
    const raw = ud.draw;
    if (!ud._achLines) ud._achLines = [{ text: a === player ? 'YOU' : a.name, color: a === player ? '#5dff86' : '#fff', size: 30 }];
    const f = ls => { ud._achLines = ls; raw(ud._achTitle ? [{ text: '« ' + ud._achTitle + ' »', color: TITLE_COLOR[ud._achTitle] || '#ffd23f', size: 21 }, ...ls] : ls); };
    f._ach = true; ud.draw = f;
  }
  function setTitle(a, t) {
    wrapTag(a); const ud = a.tag.userData;
    a.title = t || ''; // read by the social scoreboard
    if (ud._achTitle === t) return;
    ud._achTitle = t || ''; ud.draw(ud._achLines);
  }
  const BOT_TITLES = [
    ['Rookie', 'Rookie', 'Grabby', 'Pickpocket', 'Soggy', 'Butterfingers', 'Gravity Fan', 'Well Done', 'Easy Target', 'Slow Learner'],
    ['Grabby', 'Pickpocket', 'Guardian', 'Heist Boss', 'Tsunami Surfer', 'Big Shot', 'Shiny Hunter', 'Reborn', 'Locksmith', 'Flipper'],
    ['Master Thief', 'Bonk Lord', 'Wave Rider', 'Speed Demon', 'Myth Hunter', 'Public Enemy', 'Unsinkable', 'Mogul', 'Abyss Walker', 'Sheriff'],
  ];
  function rollBotTitles() {
    for (const b of bots) {
      if (Math.random() < 0.3) { setTitle(b, ''); continue; }
      const lvl = (b.speedLv || 0) + C.WORLD * 3;
      const pool = BOT_TITLES[lvl < 6 ? (Math.random() < 0.7 ? 0 : 1) : lvl < 18 ? (Math.random() < 0.6 ? 1 : Math.random() < 0.5 ? 0 : 2) : (Math.random() < 0.6 ? 2 : 1)];
      setTitle(b, pool[Math.floor(Math.random() * pool.length)]);
    }
  }
  function applyPlayerTitle() { if (st.title && !titleList().some(x => x.t === st.title)) st.title = ''; setTitle(player, st.title); }

  // ------------------------------------------------------------------ UI: styles
  const css = document.createElement('style');
  css.textContent = `
#btnAch { background-color: #ff8a2e; position: relative; }
#btnAch .achDot { position: absolute; top: -7px; left: -7px; min-width: 22px; height: 22px; border-radius: 11px; background: #ff3f5c; border: 2px solid var(--ink); font-size: 13px; line-height: 18px; text-align: center; padding: 0 4px; }
#panelAch { width: min(780px, 95vw); }
#achSum { display: flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap; margin: -4px 0 10px; font-size: 17px; color: #c9c2ec; }
#achSum .progress { width: min(320px, 70vw); margin: 0; }
#achSum b { color: #7dff9a; font-weight: 400; }
#achTitles { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 0 0 10px; align-items: center; font-size: 15px; color: #c9c2ec; }
.achChip { font-family: inherit; font-size: 14px; color: #fff; border: 2px solid rgba(20,16,32,.7); border-radius: 999px; padding: 3px 10px; background: rgba(255,255,255,.08); cursor: pointer; }
.achChip.on { background: #8a5cff; border-color: var(--gold); box-shadow: 0 0 0 2px rgba(255,210,63,.3); }
#achTabs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 10px; }
#achTabs .achChip { font-size: 15px; padding: 4px 12px; }
#achGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.achB { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 14px; border: 3px solid rgba(20,16,32,.6);
  background: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.04)); box-shadow: inset 0 2px 0 rgba(255,255,255,.1), 0 3px 0 rgba(20,16,32,.45); }
.achB.max { border-color: rgba(255,210,63,.7); background: linear-gradient(180deg, rgba(255,210,63,.22), rgba(255,210,63,.05)); }
.achB .achI { font-size: 28px; width: 46px; height: 46px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 12px;
  border: 3px solid var(--ink); background: var(--tc, #555); box-shadow: inset 0 -3px 0 rgba(0,0,0,.2), inset 0 2px 0 rgba(255,255,255,.3); }
.achB.locked .achI { filter: grayscale(1) brightness(.6); }
.achB.locked .achT b { color: #a9a3c9; }
.achB .achT { flex: 1; min-width: 0; }
.achB .achT b { font-weight: 400; font-size: 17px; display: flex; align-items: center; gap: 6px; line-height: 1.1; }
.achB .achT span { display: block; font-size: 13px; color: #c9c2ec; line-height: 1.2; margin: 1px 0 4px; }
.achB .achT .achPips { display: inline-flex; margin: 0 0 0 auto; flex: none; gap: 3px; margin-left: auto; }
.achB .achT .achPips i { display: block; flex: none; width: 11px; height: 11px; border-radius: 50%; border: 2px solid rgba(20,16,32,.7); background: rgba(255,255,255,.14); }
.achBar { position: relative; height: 13px; border-radius: 7px; border: 2px solid var(--ink); background: #241d4d; overflow: hidden; }
.achBar > b { display: block; height: 100%; background: linear-gradient(180deg, #8dffaa, #2fc85a); }
.achBar > em { position: absolute; inset: 0; font-style: normal; font-size: 10px; line-height: 10px; text-align: center; text-shadow: 0 1px 0 var(--ink); }
.achB .achTi { font-size: 12px; color: var(--gold); }
#achPop { position: fixed; z-index: 15; top: 14px; right: 180px; width: 290px; pointer-events: none; display: flex; gap: 10px; align-items: center;
  padding: 10px 14px 10px 10px; border-radius: 18px; border: 4px solid var(--ink); overflow: visible;
  background: radial-gradient(120% 90% at 20% 0%, #5a46b8 0%, #2a2160 60%, #1d1838 100%);
  box-shadow: 0 7px 0 var(--ink), 0 14px 30px rgba(0,0,0,.35), inset 0 0 0 3px rgba(255,255,255,.12);
  transform: translateX(130%) rotate(4deg); opacity: 0; transition: transform .45s cubic-bezier(.2,1.5,.4,1), opacity .25s; }
#achPop.show { transform: none; opacity: 1; }
#achPop .pi { font-size: 34px; width: 58px; height: 58px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 14px;
  border: 3px solid var(--ink); background: var(--tc); box-shadow: inset 0 -4px 0 rgba(0,0,0,.2), inset 0 2px 0 rgba(255,255,255,.35); animation: achWob .6s ease-out; }
#achPop .pt { flex: 1; min-width: 0; line-height: 1.15; }
#achPop .p1 { font-size: 13px; color: var(--gold); letter-spacing: .5px; }
#achPop .p2 { font-size: 20px; } #achPop .p3 { font-size: 13px; color: #7dff9a; } #achPop .p4 { font-size: 13px; color: #ffd23f; }
#achPop .spk { position: absolute; width: 10px; height: 10px; pointer-events: none; background: var(--sc, #ffd23f);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); animation: achSpk 1s ease-out forwards; }
@keyframes achSpk { 0% { transform: translate(0,0) scale(.2) rotate(0); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1.3) rotate(160deg); opacity: 0; } }
@keyframes achWob { 0% { transform: scale(.3) rotate(-30deg); } 60% { transform: scale(1.2) rotate(8deg); } 100% { transform: none; } }
@media (max-width: 760px), (max-height: 480px) {
  #btnAch .lbl { display: none; }
  #achPop { width: 220px; padding: 6px 10px 6px 6px; gap: 7px; border-width: 3px; }
  #achPop .pi { width: 40px; height: 40px; font-size: 22px; } #achPop .p2 { font-size: 16px; } #achPop .p1, #achPop .p3, #achPop .p4 { font-size: 11px; }
  #achGrid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px; }
  .achB { padding: 6px 8px; gap: 7px; } .achB .achI { width: 36px; height: 36px; font-size: 20px; } .achB .achT b { font-size: 14px; } .achB .achT span { font-size: 11px; }
  #achSum { font-size: 14px; } .achChip { font-size: 12px; }
}`;
  document.head.appendChild(css);

  // ------------------------------------------------------------------ UI: panel
  const panel = document.createElement('div');
  panel.id = 'panelAch'; panel.className = 'panel hidden';
  panel.innerHTML = `<button class="btn grey small close">${game.icon('close')}</button>
<h2>🏆 AWARDS</h2><div id="achSum"></div><div id="achTitles"></div><div id="achTabs"></div><div id="achGrid"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.close').onclick = () => game.closePanels();
  let tab = 'all';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    const n = doneCount();
    $('achSum').innerHTML = `<div class="progress"><b style="width:${(n / totalTiers * 100).toFixed(1)}%"></b></div><span>${n} / ${totalTiers} unlocked (${Math.floor(n / totalTiers * 100)}%) · income bonus <b>+${(bonus() * 100).toFixed(1)}%</b>${bonus() >= 0.25 ? ' (max)' : ''}</span>`;
    const tl = titleList();
    $('achTitles').innerHTML = 'Title: ' + [{ t: '', c: '#fff' }, ...tl].map(x => `<button class="achChip${st.title === x.t ? ' on' : ''}" data-t="${esc(x.t)}" style="color:${x.c}">${x.t ? esc(x.t) : 'None'}</button>`).join('')
      + (tl.length ? '' : ' <span style="opacity:.7">— earn awards to unlock titles</span>');
    $('achTitles').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st.title = b.dataset.t; applyPlayerTitle(); sound.place(); render(); });
    $('achTabs').innerHTML = [{ id: 'all', name: 'All', ic: '🏆' }, ...CATS].map(c => {
      const cs = A.filter(a => c.id === 'all' || a.cat === c.id), d = cs.reduce((k, a) => k + (st.done[a.id] || 0), 0), t = cs.reduce((k, a) => k + a.t.length, 0);
      return `<button class="achChip${tab === c.id ? ' on' : ''}" data-c="${c.id}">${c.ic} ${c.name} <span style="opacity:.75">${d}/${t}</span></button>`;
    }).join('');
    $('achTabs').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { tab = b.dataset.c; render(); });
    $('achGrid').innerHTML = A.filter(a => tab === 'all' || a.cat === tab).map(a => {
      const k = st.done[a.id] || 0, max = k >= a.t.length, cat = CATS.find(c => c.id === a.cat);
      const hidden = a.secret && !k;
      const v = Math.max(0, a.v() || 0), goal = a.t[Math.min(k, a.t.length - 1)];
      const pct = max ? 100 : Math.min(100, v / goal * 100);
      const pips = a.t.length > 1 ? `<span class="achPips">${a.t.map((_, i) => `<i style="${i < k ? `background:${TIERS[i].c}` : ''}"></i>`).join('')}</span>` : (k ? `<span class="achPips"><i style="background:#ffd23f"></i></span>` : '');
      const nextTi = !max && a.ti?.[k] ? `<span class="achTi">Title: ${esc(a.ti[k])}</span>` : '';
      const txt = hidden ? 'Secret award — keep playing…' : max ? (a.t.length > 1 ? desc(a, a.t.length - 1) + ' ✔' : a.d + ' ✔') : desc(a, k);
      const bar = hidden || max ? (max ? `<div class="achBar"><b style="width:100%"></b><em>COMPLETE</em></div>` : '') : `<div class="achBar"><b style="width:${pct.toFixed(1)}%"></b><em>${a.cash ? '$' : ''}${fmt(Math.min(v, goal))} / ${a.cash ? '$' : ''}${fmt(goal)}</em></div>`;
      return `<div class="achB${k ? '' : ' locked'}${max ? ' max' : ''}" style="--tc:${cat.color}"><div class="achI">${hidden ? '❓' : a.ic}</div><div class="achT"><b>${hidden ? '???' : esc(a.name)}${pips}</b><span>${txt}</span>${bar}${hidden ? '' : nextTi}</div></div>`;
    }).join('');
    st.unseen = 0; updDot();
  }
  function open() { render(); game.openPanel('panelAch'); }
  const btn = bus.hudButton({ id: 'btnAch', icon: '<span style="font-size:1.15em;line-height:1">🏆</span>', label: 'AWARDS', key: 'j', color: 'gold', onClick: () => (panel.classList.contains('hidden') ? open() : game.closePanels()) });
  const dot = document.createElement('span'); dot.className = 'achDot stroke'; btn.appendChild(dot);
  function updDot() { dot.textContent = st.unseen; dot.style.display = st.unseen > 0 ? '' : 'none'; }
  updDot();
  bus.on('key', k => { if (k === 'j') { if (panel.classList.contains('hidden')) open(); else game.closePanels(); } });

  // ------------------------------------------------------------------ UI: unlock popup
  const pop = document.createElement('div'); pop.id = 'achPop'; document.body.appendChild(pop);
  const queue = []; let popT = 0, popBusy = false;
  function placePop() {
    const rb = $('rightBtns')?.getBoundingClientRect();
    const right = rb && rb.width ? Math.max(8, innerWidth - rb.left + 10) : 180;
    pop.style.right = right + 'px';
    const w = pop.offsetWidth || 290, left = innerWidth - right - w;
    const ww = $('waveWrap')?.getBoundingClientRect();
    let top = 14;
    if (ww && ww.width && left < ww.right + 8 && ww.bottom > 0) top = ww.bottom + 8;
    pop.style.top = top + 'px';
  }
  function fanfare(k) {
    if (!sound.ctx) return;
    const b = [523, 587, 659, 784][k] || 523;
    [1, 1.26, 1.5, 2].forEach((m, i) => { sound.tone(b * m, 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.075, rev: 0.3 }); sound.tone(b * m * 2, 0.08, { type: 'sine', vol: 0.04, delay: i * 0.075 + 0.02 }); });
    sound.tone(b * 2, 0.8, { type: 'sine', vol: 0.1, delay: 0.32, rev: 0.6 }); sound.tone(b * 2.52, 0.7, { type: 'triangle', vol: 0.05, delay: 0.36, rev: 0.6 });
    sound.hiss(0.6, { vol: 0.06, freq: 9000, type: 'highpass', delay: 0.3, rev: 0.5 });
  }
  function showNext() {
    const it = queue.shift(); if (!it) { popBusy = false; return; }
    popBusy = true;
    const { a, k } = it, T = tierOf(a, k), cat = CATS.find(c => c.id === a.cat), ti = a.ti?.[k];
    pop.style.setProperty('--tc', T.c);
    pop.innerHTML = `<div class="pi">${a.ic}</div><div class="pt stroke"><div class="p1">🏆 ${a.secret ? 'SECRET ' : ''}AWARD UNLOCKED${T.n ? ' · ' + T.n.toUpperCase() : ''}</div><div class="p2" style="color:${T.c}">${esc(a.name)}</div><div class="p3">${esc(desc(a, k))} · +0.5% income${bonus() >= 0.25 ? ' (max)' : ''}</div>${ti ? `<div class="p4">New title: «${esc(ti)}» — press J</div>` : ''}</div>`;
    for (let i = 0; i < 14; i++) {
      const sp = document.createElement('i'); sp.className = 'spk';
      const ang = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
      sp.style.cssText = `left:${30 + Math.random() * 30}px;top:${28 + Math.random() * 10}px;--dx:${Math.cos(ang) * d}px;--dy:${Math.sin(ang) * d}px;--sc:${i % 3 ? T.c : '#fff'};animation-delay:${Math.random() * 0.25}s`;
      pop.appendChild(sp);
    }
    placePop();
    pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
    fanfare(a.t.length === 1 ? 3 : k);
    if (fx && player.obj.visible) { fx.sparkle(player.pos, parseInt(T.c.slice(1), 16), game.lowQ ? 16 : 30); fx.ring?.(player.pos, parseInt(T.c.slice(1), 16), 3, 0.5, true); }
    popT = 3.6;
  }
  addEventListener('resize', () => { if (popBusy) placePop(); });

  // ------------------------------------------------------------------ unlock check
  function check(silent) {
    let got = 0;
    for (const a of A) {
      let k = st.done[a.id] || 0; if (k >= a.t.length) continue;
      let v; try { v = a.v(); } catch { continue; }
      while (k < a.t.length && v >= a.t[k]) {
        k++; got++;
        if (!silent) { queue.push({ a, k: k - 1 }); st.unseen++; }
      }
      st.done[a.id] = k;
    }
    if (got) { updDot(); if (!silent && !popBusy) showNext(); }
    return got;
  }
  const pre = doneCount();
  const silentGot = check(true);
  bus.on('start', () => {
    const n = doneCount();
    if (silentGot > 0 && pre === 0 && n > 0) game.toast(`🏆 You already earned ${n} awards (+${(bonus() * 100).toFixed(1)}% income) — press J`, 'gold');
    applyPlayerTitle(); rollBotTitles();
  });

  // ------------------------------------------------------------------ stat tracking
  bus.on('grab', (a, w) => {
    if (a !== player) return;
    s.grabs++; s.grabR[rar(w.id)]++; if (w.mut === 'rainbow') s.rainbow++;
  });
  bus.on('steal', (a, plot) => { if (a !== player && plot === player.plot) { /* counted on place */ } });
  bus.on('place', (a, c) => {
    if (!c || !c.from) return;
    const key = c.id + '|' + (c.mut || '') + '|' + (c.w || 0);
    if (a === player) {
      s.steals++;
      const r = rar(c.id); if (r >= 4) s.stealsLeg++; if (r >= 6) s.stealSecret++;
      const owner = c.from.plot?.owner; if (owner?.name) s.victims[owner.name] = 1;
      const li = st.lost.findIndex(l => l.k === key && l.o === owner?.name);
      if (li >= 0) { s.stoleBack++; st.lost.splice(li, 1); }
    } else if (c.from.plot === player.plot) {
      s.robbed++;
      st.lost.push({ k: key, o: a.name }); if (st.lost.length > 20) st.lost.shift();
    }
  });
  bus.on('hit', (att, vic, lost) => {
    if (att === player) {
      s.hits++;
      if (lost && lost.from && lost.from.plot === player.plot) s.thiefBonks++;
    }
    if (vic === player && lost && rar(lost.id) >= 6) s.secretHit++;
  });
  bus.on('lock', P => { if (P === player.plot) s.locks++; });
  let waveOut = false, waveDied = false;
  bus.on('kill', (a, reason, c) => {
    if (a !== player) return;
    if (reason === 'wave') {
      s.dWave++; if (!waveDied) s.wipeRun++; s.safeRun = 0; waveDied = true;
      if (c && rar(c.id) >= 5) s.heartbreak++;
    } else if (reason === 'lava') s.dLava++;
    else if (reason === 'fall') s.dFall++;
  });
  bus.on('waveStart', () => { waveDied = false; waveOut = player.pos.z < C.ZONE_START && !(player.swept > 0 || player.dead > 0); });
  bus.on('waveEnd', () => {
    if (waveOut && !waveDied) {
      s.waves++; if (W.type?.mega) s.mega++;
      s.wipeRun = 0; s.safeRun++; s.bestSafeRun = Math.max(s.bestSafeRun, s.safeRun);
    }
    waveOut = false; waveDied = false;
  });
  bus.on('sell', (i, price) => { s.sells++; s.earned += price || 0; });
  bus.on('collect', (a, v) => {
    if (a !== player) return;
    s.earned += v || 0;
    const r = ips(); if (r > 0 && v >= r * 300) s.payday++;
  });
  bus.on('buy', () => { s.buys++; });
  bus.on('zone', (a, zi) => { if (a === player && zi >= 0) { const w = C.WORLD; if ((s.deepest[w] ?? -1) < zi) s.deepest[w] = zi; } });
  bus.on('travel', () => { rollBotTitles(); lastX = player.pos.x; lastZ = player.pos.z; });

  // ------------------------------------------------------------------ tick
  let lastX = player.pos.x, lastZ = player.pos.z, shelterT = -9, wasShelter = false, clock = 0, chkT = 0, tagT = 0;
  const prevF = new WeakMap();
  bus.on('tick', dt => {
    clock += dt; s.time += dt;
    const alive = !(player.swept > 0 || player.dead > 0);
    // distance run on the track
    const dx = player.pos.x - lastX, dz = player.pos.z - lastZ; lastX = player.pos.x; lastZ = player.pos.z;
    if (alive && player.pos.z < 0) { const d = Math.hypot(dx, dz); if (d < 4) s.dist += d; }
    // wave bookkeeping
    if (W.state === 'run' && alive && player.pos.z < C.ZONE_START) waveOut = true;
    const inSh = alive && game.inShelter(player);
    if (inSh && !wasShelter) shelterT = clock;
    wasShelter = inSh;
    if (W.state === 'run') for (const f of W.fronts) {
      if (f.done) continue;
      const pz = prevF.get(f);
      if (pz !== undefined && inSh && pz < player.pos.z && f.z >= player.pos.z && clock - shelterT < 0.9) s.close++;
      prevF.set(f, f.z);
    }
    // popup timer
    if (popBusy) { popT -= dt; if (popT <= 0) { pop.classList.remove('show'); popBusy = false; if (queue.length) setTimeout(() => { if (!popBusy) showNext(); }, 450); } }
    // tag height: keep the title line from sinking into the head
    tagT -= dt;
    if (tagT <= 0) {
      tagT = 1;
      for (const a of actors) { if (!a.tag.userData.draw?._ach) { const t = a.tag.userData._achTitle; wrapTag(a); if (t) a.tag.userData.draw(a.tag.userData._achLines); } }
    }
    for (const a of actors) {
      const y = a.tag.position.y, base = a.thief ? 3.9 : 3.6, want = base + (a.tag.userData._achTitle ? 0.26 : 0);
      if (Math.abs(y - want) > 0.01 && (Math.abs(y - base) < 0.01 || Math.abs(y - base - 0.26) < 0.01 || Math.abs(y - (a.thief ? 3.6 : 3.9) - 0.26) < 0.01)) a.tag.position.y = want;
    }
    chkT -= dt; if (chkT <= 0) { chkT = 0.5; check(false); }
  });

  // dev / other systems
  game.achievements = { stats: s, state: st, list: A, bonus, check, open, setTitle };
}
