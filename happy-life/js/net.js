'use strict';
// Multiplayer rooms over WebRTC (PeerJS). The host's browser is the room; others join with a 5-letter code.
// Star topology: clients talk only to the host, the host relays to everyone.
(() => {
const HL = window.HL;
const PREFIX = 'happylife-room-';
const MAX_PLAYERS = 3;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const Net = HL.net = {
  peer: null, isHost: false, code: null, myId: null,
  conns: new Map(),       // host: id -> conn ; client: 'host' -> conn
  players: [],            // [{id, name, skin, host}]
  racing: false,
  course: 'random',       // host's pick: course id, 'random' or 'endless'
  handlers: {},           // event name -> fn
  on(ev, fn) { this.handlers[ev] = fn; },
  emit(ev, ...a) { const f = this.handlers[ev]; if (f) f(...a); },

  available() { return typeof window.Peer === 'function'; },

  genCode() { let s = ''; for (let i = 0; i < 5; i++) s += LETTERS[(Math.random() * LETTERS.length) | 0]; return s; },

  host(profile, attempt = 0) {
    this.leave(true);
    if (!this.available()) { this.emit('error', 'Multiplayer library failed to load. Check your internet connection.'); return; }
    this.isHost = true;
    this.code = this.genCode();
    const peer = this.peer = new window.Peer(PREFIX + this.code.toLowerCase(), { debug: 0 });
    peer.on('open', (id) => {
      this.myId = id;
      this.players = [{ id, name: profile.name, skin: profile.skin, host: true }];
      this.emit('room', this.code);
      this.emit('lobby', this.players);
    });
    peer.on('connection', (conn) => this.acceptConn(conn));
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && attempt < 4) { this.host(profile, attempt + 1); return; }
      this.emit('error', this.describe(e));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  },

  acceptConn(conn) {
    conn.on('open', () => {
      if (this.players.length >= MAX_PLAYERS || this.racing) {
        conn.send({ t: 'reject', reason: this.racing ? 'A race is already running in that room.' : 'That room is full (max 3 players).' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      this.conns.set(conn.peer, conn);
    });
    conn.on('data', (d) => this.hostReceive(conn.peer, d));
    conn.on('close', () => this.dropPlayer(conn.peer));
    conn.on('error', () => this.dropPlayer(conn.peer));
  },

  dropPlayer(id) {
    if (!this.conns.has(id) && !this.players.some((p) => p.id === id)) return;
    this.conns.delete(id);
    const p = this.players.find((q) => q.id === id);
    this.players = this.players.filter((q) => q.id !== id);
    this.broadcast({ t: 'lobby', players: this.players, course: this.course });
    this.broadcast({ t: 'left', id });
    this.emit('left', id, p && p.name);
    this.emit('lobby', this.players);
  },

  hostReceive(id, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello' || d.t === 'profile') {
      if (!this.conns.has(id)) return;
      const name = HL.cleanName(d.name), skin = this.cleanSkin(d.skin);
      const ex = this.players.find((p) => p.id === id);
      if (ex) { ex.name = name; ex.skin = skin; } else this.players.push({ id, name, skin, host: false });
      this.broadcast({ t: 'lobby', players: this.players, course: this.course });
      this.emit('lobby', this.players);
    } else if (d.t === 'pos') {
      d.id = id;
      this.broadcast(d, id);
      this.emit('pos', id, d);
    } else if (d.t === 'broke') {
      this.resolveBroke(id, d.time, d.cause);
    }
  },

  // host decides the winner: first "broke" message received wins
  resolveBroke(id, time, cause) {
    if (!this.racing) return;
    this.racing = false;
    const p = this.players.find((q) => q.id === id);
    const msg = { t: 'result', id, name: p ? p.name : '?', time: +time || 0, cause: String(cause || '') };
    this.broadcast(msg);
    this.emit('result', msg);
  },

  cleanSkin(s) {
    s = s || {};
    const n = (v, max) => HL.clamp((v | 0), 0, max - 1);
    return { color: n(s.color, HL.SKIN.colors.length), hat: n(s.hat, HL.SKIN.hats.length), face: n(s.face, HL.SKIN.faces.length) };
  },

  join(code, profile) {
    this.leave(true);
    if (!this.available()) { this.emit('error', 'Multiplayer library failed to load. Check your internet connection.'); return; }
    code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 5) { this.emit('error', 'Room codes have 5 letters.'); return; }
    this.isHost = false; this.code = code;
    const peer = this.peer = new window.Peer({ debug: 0 });
    let opened = false;
    const timeout = setTimeout(() => { if (!opened) this.emit('error', 'Could not reach that room. Check the code and try again.'); }, 12000);
    peer.on('open', (id) => {
      this.myId = id;
      const conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true });
      this.conns.set('host', conn);
      conn.on('open', () => { opened = true; clearTimeout(timeout); conn.send({ t: 'hello', name: profile.name, skin: profile.skin }); });
      conn.on('data', (d) => this.clientReceive(d));
      conn.on('close', () => { if (this.peer === peer) { this.emit('closed', 'The host left the room.'); this.leave(true); } });
    });
    peer.on('error', (e) => { clearTimeout(timeout); this.emit('error', this.describe(e)); });
  },

  clientReceive(d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'reject') { this.emit('error', d.reason); this.leave(true); }
    else if (d.t === 'lobby') { this.players = d.players; if (d.course) this.course = d.course; this.emit('lobby', this.players); this.emit('room', this.code); }
    else if (d.t === 'start') { this.racing = true; this.emit('start', this.players, String(d.course), d.seed | 0); }
    else if (d.t === 'pos') this.emit('pos', d.id, d);
    else if (d.t === 'result') { this.racing = false; this.emit('result', d); }
    else if (d.t === 'left') this.emit('left', d.id);
    else if (d.t === 'toLobby') this.emit('toLobby');
  },

  // ---- API used by the game/UI ----
  send(d) {
    if (this.isHost) {
      if (d.t === 'pos') { d.id = this.myId; this.broadcast(d); }
      else if (d.t === 'broke') this.resolveBroke(this.myId, d.time, d.cause);
      else if (d.t === 'profile') {
        const me = this.players.find((p) => p.id === this.myId);
        if (me) { me.name = HL.cleanName(d.name); me.skin = this.cleanSkin(d.skin); }
        this.broadcast({ t: 'lobby', players: this.players, course: this.course }); this.emit('lobby', this.players);
      }
    } else {
      const c = this.conns.get('host');
      if (c && c.open) c.send(d);
    }
  },
  broadcast(d, exceptId) {
    for (const [id, c] of this.conns) if (id !== exceptId && c.open) { try { c.send(d); } catch (e) {} }
  },
  setCourse(c) {
    if (!this.isHost) return;
    this.course = c;
    this.broadcast({ t: 'lobby', players: this.players, course: c });
    this.emit('lobby', this.players);
  },
  startRace() {
    if (!this.isHost) return;
    this.racing = true;
    let course = this.course;
    if (course === 'random') course = HL.COURSES[(Math.random() * HL.COURSES.length) | 0].id;
    const seed = (Math.random() * 1e9) | 0;
    this.broadcast({ t: 'start', course, seed });
    this.emit('start', this.players, course, seed);
  },
  backToLobby() {
    if (!this.isHost) return;
    this.racing = false;
    this.broadcast({ t: 'toLobby' });
    this.emit('toLobby');
  },
  leave(silent) {
    for (const c of this.conns.values()) { try { c.close(); } catch (e) {} }
    this.conns.clear();
    if (this.peer) { const p = this.peer; this.peer = null; try { p.destroy(); } catch (e) {} }
    this.players = []; this.racing = false; this.code = null; this.isHost = false; this.course = 'random';
    if (!silent) this.emit('closed', null);
  },
  describe(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Room not found. Check the code.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Could not connect to the multiplayer server. Try again.';
    if (t === 'browser-incompatible') return 'Your browser does not support online play.';
    return 'Connection problem' + (t ? ` (${t})` : '') + '.';
  },
};
})();
