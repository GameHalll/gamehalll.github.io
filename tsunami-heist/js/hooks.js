// Tiny plugin bus so gameplay systems in js/sys/*.js can hook into the game without editing main.js.
//
// Events (bus.on(name, fn)):
//   boot()                         after save is loaded, before play
//   start()                        player pressed PLAY
//   tick(dt)                       every simulation step while playing (after core update)
//   key(k)                         keydown while playing (lower-case key)
//   grab(actor, wild)              actor picked up a wild creature
//   steal(actor, plot, pedIdx, creature)
//   place(actor, carry, pedIdx, fresh)   creature placed on own pedestal (carry.from set → it was stolen)
//   sell(pedIdx, price, creature)
//   collect(actor, amount)         player collected stored cash from a pedestal
//   hit(attacker, victim, lostCarry)
//   kill(actor, reason, lostCarry) reason: wave | lava | fall
//   respawn(actor)
//   waveWarn(type) / waveStart(type) / waveEnd()
//   lock(plot)
//   buy(row)                       a shop row was bought
//   travel(worldIdx)               track rebuilt for a world
//   zone(actor, zoneIdx)           player entered a deeper/new zone (-1 = plaza)
//
// Modifiers (bus.mod(name, fn) — fn returns a multiplier, all are multiplied together):
//   income()          global income multiplier (player only)
//   speed(actor)      movement speed multiplier
//   luck()            mutation chance multiplier for new wild spawns
//   wave()            wave speed multiplier
//   price(row)        shop price multiplier
//
// Vetoes (bus.veto(name, fn) — return true to cancel):
//   kill(actor, reason)   e.g. a shield power-up
//
// Extension points:
//   bus.shopRows.push(() => [row, ...])   row = { ic, bg, t, s, cost|null, buy() }
//   bus.interactions.push(p => ({ text, act() } | null))   E-key interactions near the player
//   bus.hudButton({ id, icon, label, key, color, onClick })  adds a button to the right-hand column
//   bus.state(name, defaults)   persistent per-system save object (lives in S.mods[name])
export const bus = {
  _ev: {}, _mod: {}, _veto: {},
  shopRows: [], interactions: [],
  on(n, f) { (this._ev[n] ||= []).push(f); return f; },
  emit(n, ...a) { const l = this._ev[n]; if (l) for (const f of l) { try { f(...a); } catch (e) { console.error(`[hook ${n}]`, e); } } },
  mod(n, f) { (this._mod[n] ||= []).push(f); return f; },
  mul(n, ...a) { const l = this._mod[n]; if (!l) return 1; let m = 1; for (const f of l) { try { const v = f(...a); if (Number.isFinite(v)) m *= v; } catch (e) { console.error(`[mod ${n}]`, e); } } return m; },
  veto(n, f) { (this._veto[n] ||= []).push(f); return f; },
  vetoed(n, ...a) { const l = this._veto[n]; if (!l) return false; for (const f of l) { try { if (f(...a)) return true; } catch (e) { console.error(`[veto ${n}]`, e); } } return false; },
  _S: null,
  state(name, defaults = {}) { const m = (this._S.mods ||= {}); m[name] = Object.assign({}, defaults, m[name] || {}); return m[name]; },
  _btnHost: null,
  hudButton({ id, icon = '', label, key = '', color = 'blue', onClick }) {
    const host = this._btnHost || document.getElementById('rightBtns');
    const b = document.createElement('button');
    b.id = id; b.className = `btn ${color}`;
    b.innerHTML = `${icon}<span class="lbl">${label}</span>${key ? `<kbd>${key.toUpperCase()}</kbd>` : ''}`;
    b.onclick = e => { e.stopPropagation(); onClick(); };
    host.insertBefore(b, document.getElementById('btnSound'));
    return b;
  },
};
