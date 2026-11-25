// social system — see ../hooks.js for the bus API
// Makes the 5 bots feel like players in a live server: live leaderboard (bottom-right, Tab = full scoreboard),
// a rate-limited chat feed (bottom-left) with speech bubbles over bots' heads, kill-feed style system lines,
// and grudges (a bot the player robbed may come for revenge once).
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- chat lines
// {c} = creature name, {n} = other actor's name. Words in ALL CAPS stay caps, the rest may get lower-cased.
const L = {
  hello: ['hi', 'yo', 'hello', 'hey guys', 'sup', 'hii', 'yooo', 'hello everyone', 'wsg', 'hi again lol'],
  helloReply: ['hi', 'yo', 'hey', 'sup', 'heyy', 'o/'],
  robbed: ['NOOO my {c} 😭', 'who took my stuff', 'hey!! my {c}', 'BRO my {c}', 'give it back 😡', 'wait who stole my {c}', 'NOO not the {c}', 'are u serious', 'my base is getting robbed 😭', 'stop stealing pls'],
  robbedByPlayer: ['ok thats it', 'u r so dead 😤', 'give my {c} back NOW', 'revenge is coming', 'u really took my {c}?? ok', 'watch ur base 😈', 'blue guy stole my {c} 😭', 'im coming for ur base', 'not cool man', 'bro i worked hard for that'],
  robbedByBot: ['{n} give it back', '{n} bro why', 'stop it {n} 😡', '{n} i see u', 'really {n}?'],
  thiefTaunt: ['thx for the {c} lol', 'finders keepers', 'ur base was open 😂', 'yoink', 'ty for the free {c}', 'lock ur base next time lol', 'easy steal'],
  caughtThief: ['not today 😤', 'nice try lol', 'got u', 'NOPE', 'drop it lol', 'i see u 👀', 'thats mine', 'BONK'],
  caughtByPlayer: ['ok ok sorry', 'nooo i almost had it', 'bruh', 'how did u see me', 'ugh', 'i was so close 😭', 'lag'],
  smacked: ['ow', 'bruh', 'why 😭', 'hey', 'stop hitting me', 'lol ok'],
  wipedOut: ['bruh the wave 💀', 'lag!!', 'i was so close', 'NOOO', 'that wave was so fast', 'bro', 'rip me', 'whyyy', 'i hate waves', 'ok that was my fault'],
  wipedWithLoot: ['NOOO my {c} 😭', 'lost my {c} to the wave 💀', 'i had a {c}!!', 'WHY now', 'noooo i almost made it with the {c}'],
  lava: ['ouch lava', 'burned lol', 'who put lava there 😭'],
  fell: ['i fell 💀', 'missed the jump lol', 'bro the gap'],
  rareGrab: ['LETS GOOO', 'got a {c}!!', 'YESSS', 'omg {c}', 'finally a {c}', 'W', 'look what i got 😎', 'dont steal my {c} pls'],
  playerRare: ['how did u get that', 'omg a {c}', 'W', 'nice {c}', 'can i have it lol', 'thats so lucky', 'gimme 😭'],
  playerWiped: ['rip', 'lol', 'rip 💀', 'f', 'unlucky', 'oof'],
  playerWipedLoot: ['rip ur {c}', 'nooo the {c} lol', 'F for the {c}', 'thats rough'],
  mega: ['MEGA WAVE RUN', 'omg mega', 'MEGA', 'run run run', 'hide hide', 'everyone hide!!', 'not the mega 😭', 'GET BACK'],
  waveSurvive: ['made it lol', 'that was close', 'ez', 'phew'],
  playerTop: ['how is ur income so high 😳', 'blue guy is carrying lol', 'whats ur secret', 'ur rich bro', 'how r u #1 already'],
  botTop: ['im #1 😎', 'top 1 lets go', 'ez #1', 'look at the leaderboard 😎'],
  lostTop: ['who passed me??', 'nooo not #2', 'ok who is stealing my spot'],
  locked: ['scared? lol', 'locked again 😂', 'ur lock wont last forever', 'lock goes off soon 👀'],
  revenge: ['revenge time 😈', 'ur turn', 'payback', 'coming for u'],
  newWorld: ['new world lets go', 'whoa this map', 'gl', 'this place looks cool'],
  gg: ['gg', 'gg lol', 'ggs', 'gg wp'],
  ambient: ['anyone got a rainbow?', 'lol', 'brb', 'back', 'how do u get diamond ones', 'my base is so empty', 'who wants to team', '1 more mega and im done', 'this wave timing is crazy', 'how far did u guys get', 'any1 seen a secret?', 'my speed is so bad', 'whats the best creature', 'pls dont steal my stuff', 'need more pedestals', 'zone 5 is impossible', 'lol', 'ok i need money', 'my bat is trash', 'bruh', 'im so close to rebirth', 'this game is addictive', 'whos stealing everything lol'],
  ambientReply: ['same', 'lol', 'nah', 'fr', 'true', 'idk', 'ya', 'no', 'lmao', 'same lol', 'ikr'],
  sorry: ['sry', 'oops', 'my bad'],
};
// extra lines per personality kind
const KIND = {
  salty: { robbed: ['ARE U SERIOUS', 'im reporting u', 'this game is rigged'], wipedOut: ['this game is rigged', 'trash game', 'unfair'], ambient: ['everyone here is so bad', 'stop stealing from me'] },
  hype: { rareGrab: ['LETS GOOOOO 🔥🔥', 'GG EZ', 'IM RICH'], mega: ['MEGA LETS GO 😂', 'i love mega waves'], ambient: ['this is so fun', 'who wants to race lol', 'zone 7 or nothing'] },
  chill: { robbed: ['aw man', 'ok fair', 'rip my {c}'], wipedOut: ['oops', 'lol rip', 'happens'], ambient: ['vibing', 'nice weather lol', 'just chilling', 'gg everyone'] },
};
const EMO = { salty: ['😡', '💀', '🙄'], hype: ['🔥', '😎', '🤑', '💯'], chill: ['😂', '🙂', '😅'], normal: ['😭', '😂', '💀', '👀'] };

export default function init(game, bus) {
  const { C, player, bots, actors } = game;
  const S = game.S;
  const st = bus.state('social', { chat: true });

  // ---------------------------------------------------------------- per-bot chat style
  const info = new Map(); // actor -> { steals, lastSay, kind, style, grudge }
  for (const a of actors) info.set(a, { steals: 0, lastSay: -99, kind: 'normal', style: null, grudge: null, prevRank: -1, arrow: 0, arrowT: -99 });
  for (const b of bots) {
    const P = b.personality || { brave: Math.random() < 0.4, aggro: rand(0.3, 1), sloppy: rand(0.15, 0.45) };
    const I = info.get(b);
    I.kind = P.aggro > 0.8 ? 'salty' : P.brave ? 'hype' : P.aggro < 0.5 ? 'chill' : 'normal';
    I.style = {
      typo: 0.05 + P.sloppy * 0.3,
      lower: Math.random() < 0.8,
      emoji: I.kind === 'hype' ? 0.35 : I.kind === 'chill' ? 0.15 : 0.22,
      talk: rand(0.6, 1.2) * (I.kind === 'chill' ? 0.8 : 1),
      stretch: Math.random() < 0.4,  // "nooooo"
      noPunct: Math.random() < 0.7,
    };
  }
  const css = a => '#' + (a.color >>> 0).toString(16).padStart(6, '0');
  const crName = (id, mut) => { const d = C.CREATURE_BY_ID[id], m = C.MUT_BY_ID[mut || ''] || C.MUT_BY_ID['']; return (m.name ? m.name + ' ' : '') + d.name; };
  const shortName = (id, mut) => { const n = C.CREATURE_BY_ID[id].name, r = Math.random(); if (r < 0.35) return n.split(' ').pop(); return (mut && r < 0.6 ? C.MUT_BY_ID[mut].name + ' ' : '') + n; };

  // ---------------------------------------------------------------- humanize text
  function typo(word) {
    const i = 1 + Math.floor(Math.random() * (word.length - 2)), r = Math.random();
    if (r < 0.4) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2); // swap
    if (r < 0.7) return word.slice(0, i) + word.slice(i + 1);                          // drop
    return word.slice(0, i) + word[i] + word.slice(i);                                 // double
  }
  function humanize(b, tpl, vars = {}) {
    const I = info.get(b), s = I.style;
    let t = tpl.replace('{c}', vars.c ? (s.lower && Math.random() < 0.7 ? vars.c.toLowerCase() : vars.c) : 'stuff').replace('{n}', vars.n || '');
    if (s.lower) t = t.split(' ').map(w => /^[A-Z]{2,}[!?]*$/.test(w) ? w : w.toLowerCase()).join(' ');
    if (s.stretch && Math.random() < 0.3) t = t.replace(/\b(no+|so|bro|why)\b/i, w => w + w.slice(-1).repeat(2 + Math.floor(Math.random() * 3)));
    if (s.noPunct) t = t.replace(/([a-z])[.,]$/i, '$1');
    if (!/\p{Extended_Pictographic}/u.test(t) && Math.random() < s.emoji) t += ' ' + pick(EMO[I.kind]);
    let fix = null;
    if (Math.random() < s.typo) {
      const words = t.split(' '), idx = words.map((w, i) => /^[a-z]{4,}$/i.test(w) ? i : -1).filter(i => i >= 0);
      if (idx.length) { const k = pick(idx), orig = words[k]; words[k] = typo(orig); if (words[k] !== orig) { t = words.join(' '); if (Math.random() < 0.45) fix = '*' + orig.toLowerCase(); } }
    }
    return { t: t.slice(0, 60), fix };
  }
  const lines = (b, key) => { const k = KIND[info.get(b).kind]?.[key]; return k && Math.random() < 0.4 ? k : L[key]; };

  // ---------------------------------------------------------------- DOM
  const style = document.createElement('style');
  style.textContent = `
#socChat { position: fixed; left: 14px; bottom: 14px; width: min(340px, 30vw); z-index: 6; pointer-events: none; display: flex; flex-direction: column; gap: 3px; font-size: 15px; line-height: 1.2; }
#socChat .cl { background: rgba(20,16,32,.55); border-radius: 10px; padding: 3px 9px 4px; color: #fff; transition: opacity 1.2s; word-break: break-word; text-shadow: 0 1px 0 #141020, 1px 0 0 #141020, -1px 0 0 #141020, 0 -1px 0 #141020; animation: socIn .25s ease-out; }
#socChat .cl b { font-weight: 400; }
#socChat .cl.sys { background: linear-gradient(90deg, rgba(90,52,0,.78), rgba(60,30,90,.55)); color: #ffe9a6; }
#socChat .cl.fade { opacity: 0; }
@keyframes socIn { from { transform: translateX(-14px); opacity: 0; } to { transform: none; opacity: 1; } }
#socLb { position: fixed; right: 14px; bottom: 14px; width: 214px; z-index: 6; pointer-events: auto; cursor: pointer; background: rgba(29,24,56,.78); border: 3px solid #141020; border-radius: 14px; padding: 5px 7px 6px; box-shadow: 0 4px 0 rgba(20,16,32,.6); font-size: 14px; }
#socLb .lh { display: flex; justify-content: space-between; color: #ffd23f; font-size: 13px; padding: 0 3px 3px; }
#socLb .lh kbd { font-size: 10px; padding: 1px 4px; }
#socLb .lr { display: flex; align-items: center; gap: 4px; padding: 1px 4px; border-radius: 7px; }
#socLb .lr.me { background: rgba(93,255,134,.2); box-shadow: inset 0 0 0 2px rgba(93,255,134,.55); }
#socLb .rk { width: 16px; color: #c9c2ec; } #socLb .ar { width: 11px; font-size: 10px; } #socLb .ar.up { color: #5dff86; } #socLb .ar.dn { color: #ff4f6a; }
#socLb .nm { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } #socLb .ic { color: #7dff9a; font-size: 13px; }
#socBoard { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 19; min-width: min(640px, 94vw); max-width: 94vw; background: linear-gradient(180deg, #2b2358, #1d1838); border: 4px solid #141020; border-radius: 22px; padding: 14px 18px 16px; box-shadow: 0 8px 0 rgba(20,16,32,.7); pointer-events: none; }
#socBoard h2 { margin: 0 0 10px; text-align: center; color: #ffd23f; font-weight: 400; font-size: 30px; }
#socBoard table { width: 100%; border-collapse: separate; border-spacing: 0 4px; font-size: 17px; }
#socBoard th { font-weight: 400; color: #c9c2ec; font-size: 13px; text-align: left; padding: 0 8px; }
#socBoard td { background: rgba(255,255,255,.07); padding: 6px 8px; white-space: nowrap; }
#socBoard td:first-child { border-radius: 10px 0 0 10px; } #socBoard td:last-child { border-radius: 0 10px 10px 0; }
#socBoard tr.me td { background: rgba(93,255,134,.18); }
#socBoard .tt { font-size: 12px; color: #ffb02e; margin-left: 6px; }
#socBoard .best { max-width: 210px; overflow: hidden; text-overflow: ellipsis; }
#socBoard .foot { text-align: center; color: #9a92c8; font-size: 13px; margin-top: 6px; }
.touch #socChat { left: 10px; bottom: 182px; width: min(250px, 44vw); font-size: 12px; }
.touch #socChat .cl { padding: 2px 7px 3px; }
.touch #socLb { right: 8px; bottom: 228px; width: 150px; font-size: 11px; padding: 3px 5px 4px; border-width: 2px; }
.touch #socLb .lh { font-size: 10px; } .touch #socLb .ic { font-size: 10px; } .touch #socLb .rk { width: 12px; }
.touch #socLb .lr.far { display: none; }
.touch #socBoard { pointer-events: auto; } .touch #socBoard table { font-size: 12px; } .touch #socBoard h2 { font-size: 22px; }
.touch #socBoard .best { max-width: 120px; }
@media (max-width: 760px) { #socChat { width: min(250px, 50vw); font-size: 12px; } #socBoard .hideS { display: none; } }
@media (max-height: 480px) {
  .touch #socChat { bottom: 130px; width: min(300px, 40vw); font-size: 11px; } .touch #socChat .cl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .touch #socChat .cl:nth-last-child(n+3) { display: none; }
  .touch #socLb { right: auto; left: 140px; bottom: 12px; width: auto; }
  .touch #socLb .lr:not(.me) { display: none; } .touch #socLb .lh { display: none; }
}
@media (max-height: 380px) { #socChat .cl:nth-last-child(n+3) { display: none; } }
`;
  document.head.appendChild(style);
  if (game.isTouch) document.body.classList.add('touch');
  const chatEl = document.createElement('div'); chatEl.id = 'socChat'; chatEl.className = 'hidden';
  const lbEl = document.createElement('div'); lbEl.id = 'socLb'; lbEl.className = 'stroke hidden';
  const boardEl = document.createElement('div'); boardEl.id = 'socBoard'; boardEl.className = 'stroke hidden';
  document.body.append(chatEl, lbEl, boardEl);
  const showBoard = on => { boardEl.classList.toggle('hidden', !on); if (on) renderBoard(); };
  lbEl.addEventListener('pointerdown', e => { e.stopPropagation(); showBoard(boardEl.classList.contains('hidden')); });
  boardEl.addEventListener('pointerdown', e => { e.stopPropagation(); showBoard(false); });
  addEventListener('keydown', e => { if (e.key === 'Tab' && game.started) { e.preventDefault(); showBoard(true); } });
  addEventListener('keyup', e => { if (e.key === 'Tab') showBoard(false); });
  addEventListener('blur', () => showBoard(false));

  // ---------------------------------------------------------------- chat log
  let now = 0;
  const logLines = [];
  function addLine(html, sys = false) {
    if (!st.chat) return;
    const d = document.createElement('div'); d.className = 'cl' + (sys ? ' sys' : ''); d.innerHTML = html;
    chatEl.appendChild(d); logLines.push({ d, t: now });
    while (logLines.length > 5) logLines.shift().d.remove();
  }
  function fadeLines() {
    for (let i = logLines.length - 1; i >= 0; i--) {
      const l = logLines[i], age = now - l.t;
      if (age > 16) { l.d.remove(); logLines.splice(i, 1); } else if (age > 14 && !l.d.classList.contains('fade')) l.d.classList.add('fade');
    }
  }

  // ---------------------------------------------------------------- speech bubbles
  const bubbles = [];
  function bubble(b, text) {
    const old = bubbles.find(x => x.b === b); if (old) killBubble(old);
    const s = game.makeLabel([{ text: text.length > 30 ? text.slice(0, 29) + '…' : text, color: '#fff', size: 30 }], { scale: 1.05, bg: 'rgba(20,16,32,0.75)' });
    s.position.y = b.thief ? 4.75 : 4.45; b.obj.add(s);
    bubbles.push({ b, s, t: 3.2 });
  }
  function killBubble(x) { x.b.obj.remove(x.s); x.s.material.map.dispose(); x.s.material.dispose(); bubbles.splice(bubbles.indexOf(x), 1); }
  function updBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const x = bubbles[i]; x.t -= dt;
      if (x.t <= 0) { killBubble(x); continue; }
      x.s.material.opacity = Math.min(1, x.t / 0.5);
      x.s.visible = x.b.tag.visible && x.b.pos.distanceTo(game.camera.position) < 70;
    }
  }

  // ---------------------------------------------------------------- message scheduler (strong rate limiting)
  const pending = []; // { b, key, vars, due, exp, prio, then }
  let nextSay = 6, lastAny = 0;
  const catCd = {};
  // say(): queue a bot line. prio 3 = involves the player directly, 2 = notable event, 1 = flavour, 0 = ambient
  function say(b, key, vars = {}, { prio = 1, delay = [1, 6], ttl = 9, cat = null, cd = 20, chance = 1, then = null } = {}) {
    if (!b || !b.isBot || !game.started) return false;
    if (Math.random() > chance * (prio >= 3 ? 1 : info.get(b).style.talk)) return false;
    if (cat) { if (now < (catCd[cat] || 0)) return false; catCd[cat] = now + cd; }
    if (pending.some(p => p.b === b && p.prio >= prio)) return false;
    const due = now + rand(delay[0], delay[1]);
    pending.push({ b, key, vars, due, exp: due + (prio >= 3 ? Math.max(ttl, 14) : ttl), prio, then });
    if (pending.length > 6) { pending.sort((x, y) => y.prio - x.prio || x.due - y.due); pending.length = 6; }
    return true;
  }
  function emit(p) {
    const b = p.b, I = info.get(b);
    const tpl = typeof p.key === 'string' ? pick(lines(b, p.key)) : pick(p.key);
    const { t, fix } = humanize(b, tpl, p.vars);
    addLine(`<b style="color:${css(b)}">${esc(b.name)}:</b> ${esc(t)}`);
    bubble(b, t);
    I.lastSay = now; lastAny = now;
    if (fix) pending.push({ b, key: [fix], vars: {}, due: now + rand(1.2, 2.5), exp: now + 6, prio: 9, fix: true });
    if (p.then) p.then();
  }
  function pump() {
    if (!pending.length) return;
    let best = -1;
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (now > p.exp) { pending.splice(i, 1); if (best > i) best--; continue; }
      if (p.due > now) continue;
      if (p.fix) { pending.splice(i, 1); emitFix(p); return; }
      if (best < 0 || p.prio > pending[best].prio) best = i;
    }
    if (best < 0 || now < nextSay) return;
    const p = pending[best];
    if (now - info.get(p.b).lastSay < (p.prio >= 3 ? 5 : 14)) return;
    pending.splice(best, 1);
    emit(p);
    nextSay = now + rand(8, 15) * (p.prio >= 3 ? 0.75 : 1);
  }
  function emitFix(p) { addLine(`<b style="color:${css(p.b)}">${esc(p.b.name)}:</b> ${esc(p.key[0])}`); bubble(p.b, p.key[0]); }

  // kill-feed style system lines (own, lighter limit)
  const feedQ = []; let nextFeed = 0;
  function feed(text) { feedQ.push({ text, exp: now + 6 }); if (feedQ.length > 3) feedQ.shift(); }
  function pumpFeed() {
    if (!feedQ.length || now < nextFeed) return;
    const f = feedQ.shift(); if (now > f.exp) return;
    addLine(esc(f.text), true); nextFeed = now + 2.2;
  }
  const featName = (id, mut) => { const m = C.MUT_BY_ID[mut || '']; return (m && m.name ? m.name.toUpperCase() + ' ' : '') + C.CREATURE_BY_ID[id].name; };
  const notable = c => c && (C.CREATURE_BY_ID[c.id].r >= 3 || !!c.mut);
  const otherBot = (...not) => { const l = bots.filter(b => !not.includes(b) && !(b.swept > 0) && !(b.dead > 0)); return l.length ? pick(l) : null; };

  // ---------------------------------------------------------------- reactions to real events
  bus.on('start', () => {
    now = 0; nextSay = 2;
    const a = otherBot(); say(a, 'hello', {}, { prio: 2, delay: [2, 5], ttl: 10 });
    if (Math.random() < 0.7) { const b2 = otherBot(a); say(b2, Math.random() < 0.5 ? 'helloReply' : 'hello', {}, { prio: 1, delay: [9, 14], ttl: 12 }); }
  });

  bus.on('steal', (thief, plot, i, c) => {
    const victim = plot.owner, cn = shortName(c.id, c.mut);
    if (thief === player || victim === player || notable(c)) feed(`⚡ ${thief.name} stole ${/^[AEIOU]/i.test(featName(c.id, c.mut)) ? 'an' : 'a'} ${featName(c.id, c.mut)} from ${victim.name}`);
    if (victim.isBot) {
      if (thief === player) {
        say(victim, Math.random() < 0.6 ? 'robbedByPlayer' : 'robbed', { c: cn }, { prio: 3, delay: [1, 3.5], chance: 0.9 });
        const I = info.get(victim), g = I.grudge;
        I.grudge = { until: now + rand(70, 120), tries: 1, after: now + rand(18, 35), n: (g ? g.n : 0) + 1 };
      } else {
        const v = C.CREATURE_BY_ID[c.id].r >= 2 || c.mut;
        say(victim, Math.random() < 0.35 ? 'robbedByBot' : 'robbed', { c: cn, n: thief.name }, { prio: v ? 2 : 1, chance: v ? 0.75 : 0.35 });
      }
    } else if (thief.isBot) {
      say(thief, 'thiefTaunt', { c: cn }, { prio: 2, delay: [3, 7], chance: info.get(thief).kind === 'chill' ? 0.2 : 0.5, cat: 'taunt', cd: 40 });
    }
  });

  bus.on('place', (a, c) => { const I = info.get(a); if (I && c && c.from) I.steals++; });

  bus.on('hit', (att, vic, lost) => {
    if (!lost) { if (vic.isBot && att === player) say(vic, 'smacked', {}, { prio: 1, chance: 0.25, cat: 'smack', cd: 30 }); return; }
    if (lost.from) {
      const owner = lost.from.plot.owner;
      if (att === owner && att.isBot) say(att, 'caughtThief', {}, { prio: vic === player ? 3 : 1, delay: [0.6, 2.5], chance: vic === player ? 0.85 : 0.4 });
      if (vic.isBot && att === player) say(vic, 'caughtByPlayer', {}, { prio: 3, delay: [1, 3], chance: 0.7 });
      if (vic === player || att === player || notable(lost)) feed(`🏏 ${att.name} smacked ${vic.name} — ${featName(lost.id, lost.mut)} dropped`);
    } else if (vic.isBot) say(vic, 'smacked', {}, { prio: att === player ? 2 : 1, chance: 0.4, cat: 'smack', cd: 25 });
  });

  bus.on('kill', (a, reason, c) => {
    const hasLoot = c && (C.CREATURE_BY_ID[c.id].r >= 2 || c.mut);
    if (a.isBot) {
      if (reason === 'wave') {
        if (hasLoot) say(a, 'wipedWithLoot', { c: shortName(c.id, c.mut) }, { prio: 2, delay: [1.5, 4], chance: 0.7 });
        else say(a, 'wipedOut', {}, { prio: 1, delay: [1.5, 5], chance: 0.35, cat: 'wipe', cd: 25 });
      } else say(a, reason === 'lava' ? 'lava' : 'fell', {}, { prio: 1, chance: 0.4, cat: 'hz', cd: 30 });
      if (c && notable(c)) feed(`${reason === 'wave' ? '🌊' : reason === 'lava' ? '🔥' : '💫'} ${a.name} lost ${featName(c.id, c.mut)} to ${reason === 'wave' ? 'the wave' : reason === 'lava' ? 'lava' : 'the abyss'}`);
    } else if (a === player) {
      if (c && notable(c)) { feed(`🌊 You lost ${featName(c.id, c.mut)} to the ${reason === 'wave' ? 'wave' : reason}`); say(otherBot(), 'playerWipedLoot', { c: shortName(c.id, c.mut) }, { prio: 1, delay: [2, 6], chance: 0.45, cat: 'pw', cd: 40 }); }
      else say(otherBot(), 'playerWiped', {}, { prio: 0, delay: [2, 6], chance: 0.15, cat: 'pw', cd: 60 });
    }
  });

  bus.on('grab', (a, w) => {
    const r = C.CREATURE_BY_ID[w.id].r, big = r >= 4 || w.mut === 'diamond' || w.mut === 'rainbow';
    if (big) feed(`✨ ${a.name} grabbed ${/^[AEIOU]/i.test(featName(w.id, w.mut)) ? 'an' : 'a'} ${featName(w.id, w.mut)}`);
    if (a.isBot && (big || (r >= 3 && w.mut))) say(a, 'rareGrab', { c: shortName(w.id, w.mut) }, { prio: 2, delay: [0.5, 2.5], chance: 0.8 });
    else if (a.isBot && (r >= 3 || w.mut)) say(a, 'rareGrab', { c: shortName(w.id, w.mut) }, { prio: 1, chance: 0.3, cat: 'grab', cd: 30 });
    else if (a === player && big) say(otherBot(), 'playerRare', { c: shortName(w.id, w.mut) }, { prio: 2, delay: [2, 5], chance: 0.6 });
  });

  let survived = null;
  bus.on('waveWarn', type => {
    if (type && type.mega) { feed('🌊 MEGA WAVE incoming!'); say(otherBot(), 'mega', {}, { prio: 2, delay: [0.5, 2], ttl: 5, chance: 0.9 }); survived = 'mega'; }
  });
  bus.on('waveEnd', () => {
    if (survived === 'mega') { const ok = bots.filter(b => b.pos.z < -20 && !(b.swept > 0) && !(b.dead > 0)); if (ok.length) say(pick(ok), 'waveSurvive', {}, { prio: 1, chance: 0.5 }); }
    survived = null;
  });
  bus.on('lock', P => { if (P === player.plot) { const g = bots.find(b => info.get(b).grudge && info.get(b).grudge.until > now); say(g || otherBot(), 'locked', {}, { prio: 1, chance: g ? 0.7 : 0.2, cat: 'lock', cd: 90 }); } });
  bus.on('travel', () => { if (game.started) say(otherBot(), 'newWorld', {}, { prio: 1, delay: [3, 7], chance: 0.6, cat: 'travel', cd: 30 }); });

  // ---------------------------------------------------------------- leaderboard
  const incOf = a => {
    let s = 0; for (const p of a.plot.pedestals) if (p.creature && p.group.visible !== false) s += game.income(p.creature.id, p.creature.mut, p.creature.w);
    return a === player ? s * game.incMult() : s;
  };
  const bestOf = a => {
    let best = null, bv = 0;
    for (const p of a.plot.pedestals) if (p.creature && p.group.visible !== false) { const v = game.income(p.creature.id, p.creature.mut, p.creature.w); if (v > bv) { bv = v; best = p.creature; } }
    return best;
  };
  const titleOf = a => {
    try {
      const t = a.title || (a === player ? (game.playerTitle?.() || S.mods?.cosmetics?.title || S.mods?.achievements?.title) : game.titleOf?.(a));
      return typeof t === 'string' ? t : t && t.name ? t.name : '';
    } catch { return ''; }
  };
  let ranked = [], topWho = null, topSince = 0;
  function rank() {
    const list = actors.map(a => ({ a, inc: incOf(a) })).sort((x, y) => y.inc - x.inc);
    list.forEach((r, i) => {
      const I = info.get(r.a);
      if (I.prevRank >= 0 && I.prevRank !== i) { I.arrow = i < I.prevRank ? 1 : -1; I.arrowT = now; }
      I.prevRank = i;
    });
    ranked = list;
    // leaderboard drama
    const top = list[0].a;
    if (top !== topWho) {
      const prev = topWho; topWho = top;
      if (prev && now > 25 && now - topSince > 20) {
        if (top === player) say(otherBot(), 'playerTop', {}, { prio: 1, chance: 0.6, cat: 'top', cd: 120 });
        else if (top.isBot) say(top, 'botTop', {}, { prio: 1, chance: 0.5, cat: 'top', cd: 120 });
        if (prev.isBot && prev !== top) say(prev, 'lostTop', {}, { prio: 1, delay: [3, 7], chance: 0.4, cat: 'lost', cd: 90 });
      }
      topSince = now;
    }
  }
  function renderLb() {
    const pi = ranked.findIndex(r => r.a === player);
    lbEl.innerHTML = `<div class="lh"><span>🏆 SERVER</span>${game.isTouch ? '' : '<kbd>TAB</kbd>'}</div>` + ranked.map((r, i) => {
      const I = info.get(r.a), ar = now - I.arrowT < 6 ? I.arrow : 0;
      const far = Math.abs(i - pi) > 1 && i > 1;
      return `<div class="lr${r.a === player ? ' me' : ''}${far ? ' far' : ''}"><span class="rk">${i + 1}</span><span class="ar ${ar > 0 ? 'up' : ar < 0 ? 'dn' : ''}">${ar > 0 ? '▲' : ar < 0 ? '▼' : ''}</span><span class="nm" style="color:${r.a === player ? '#5dff86' : css(r.a)}">${esc(r.a === player ? 'You' : r.a.name)}</span><span class="ic">$${game.fmt(r.inc)}/s</span></div>`;
    }).join('');
  }
  function renderBoard() {
    if (!ranked.length) rank();
    boardEl.innerHTML = `<h2>🏆 Server Scoreboard</h2><table><tr><th>#</th><th>Player</th><th>Income</th><th class="hideS">Steals</th><th>Best creature</th></tr>` + ranked.map((r, i) => {
      const a = r.a, I = info.get(a), b = bestOf(a), t = titleOf(a);
      const bc = b ? `<span style="color:${C.RARITIES[C.CREATURE_BY_ID[b.id].r].color}">${esc(game.displayName(b.id, b.mut, b.w))}</span>` : '<span style="color:#9a92c8">—</span>';
      return `<tr class="${a === player ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><span style="color:${a === player ? '#5dff86' : css(a)}">${esc(a === player ? 'You' : a.name)}</span>${t ? `<span class="tt">${esc(t)}</span>` : ''}</td><td style="color:#7dff9a">$${game.fmt(r.inc)}/s</td><td class="hideS">${I.steals}</td><td class="best">${bc}</td></tr>`;
    }).join('') + `</table><div class="foot">${game.isTouch ? 'tap to close' : 'hold TAB'}</div>`;
  }

  // ---------------------------------------------------------------- grudges → a revenge attempt on the player's base
  let lastRevenge = -99;
  function grudges(dt) {
    const P = player.plot;
    if (P.locked || now - lastRevenge < 45) return;
    if (bots.some(b => b.ai && b.ai.mode === 'steal' && b.ai.victim === P)) return;
    for (const b of bots) {
      const g = info.get(b).grudge, ai = b.ai;
      if (!g || g.tries <= 0 || now < g.after) continue;
      if (now > g.until) { info.get(b).grudge = null; continue; }
      if (!ai || ai.mode !== 'idle' || b.carry || b.swept > 0 || b.dead > 0 || !b.plot.contains(b.pos.x, b.pos.z)) continue;
      if (Math.random() > dt * 0.25) continue;
      // best visible creature in the player's base
      let best = -1, bv = 0;
      P.pedestals.forEach((p, i) => { if (p.creature && p.group.visible) { const v = game.income(p.creature.id, p.creature.mut, p.creature.w); if (v > bv) { bv = v; best = i; } } });
      g.tries--;
      if (best < 0 || Math.random() < 0.3) continue; // sometimes they just let it go
      ai.mode = 'steal'; ai.victim = P; ai.ped = best; lastRevenge = now;
      say(b, 'revenge', {}, { prio: 2, delay: [0.5, 2], chance: 0.8 });
      break;
    }
  }

  // ---------------------------------------------------------------- tick
  let lbT = 0, ambT = rand(35, 60), ggT = rand(240, 420);
  bus.on('tick', dt => {
    now += dt;
    if (chatEl.classList.contains('hidden')) { chatEl.classList.remove('hidden'); lbEl.classList.remove('hidden'); }
    pump(); pumpFeed(); updBubbles(dt);
    lbT -= dt;
    if (lbT <= 0) {
      lbT = 1; rank(); renderLb(); fadeLines(); grudges(1);
      if (!boardEl.classList.contains('hidden')) renderBoard();
    }
    // ambient chatter when the server is quiet
    ambT -= dt;
    if (ambT <= 0) {
      ambT = rand(30, 70);
      if (now - lastAny > 18 && !pending.length) {
        const a = otherBot();
        if (say(a, 'ambient', {}, { prio: 0, delay: [0, 2] }) && Math.random() < 0.35) {
          const b2 = otherBot(a); if (b2) say(b2, 'ambientReply', {}, { prio: 0, delay: [10, 16], ttl: 8 });
        }
      }
    }
    ggT -= dt;
    if (ggT <= 0) { ggT = rand(300, 600); say(otherBot(), 'gg', {}, { prio: 0, chance: 0.4 }); }
  });

  // tiny debug/API surface for other systems (e.g. an event system announcing something in chat)
  game.social = {
    say: (b, text, prio = 1) => say(b, [text], {}, { prio, delay: [0.5, 2] }),
    system: text => feed(text),
    rankOf: a => ranked.findIndex(r => r.a === a),
    _dbg: () => ({ now, nextSay, pending: pending.map(p => [p.b.name, p.key, p.prio, +(p.due - now).toFixed(1)]), grudges: bots.map(b => [b.name, info.get(b).grudge, b.ai.mode]) }),
  };
}
