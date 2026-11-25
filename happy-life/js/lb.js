'use strict';
// Online leaderboard (best time per course) on a Firebase Realtime Database via its REST API.
// Turn it on: paste your database URL below (see README "Online leaderboard"). Empty = local-only mode.
(() => {
const HL = window.HL;
const DB_URL = ''; // e.g. 'https://happy-life-12345-default-rtdb.firebaseio.com'

const base = DB_URL.replace(/\/+$/, '');
let pid = HL.store.get('pid', null);
if (!pid) { pid = 'p' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); HL.store.set('pid', pid); }
const key = (course) => String(course).replace(/[^\w-]/g, '_');
const withTimeout = (p, ms = 6000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const cache = {}; // course -> { at, rows }

HL.lb = {
  online: () => !!base,
  myId: () => pid,
  // submit a time (only call with a personal best). Resolves to the player's rank (1-based) or null.
  async submit(course, time) {
    if (!base || course === 'endless') return null;
    const t = Math.round(time * 10) / 10;
    const body = { n: HL.cleanName(HL.profile.name), t, c: HL.profile.skin.color | 0, h: HL.profile.skin.hat | 0 };
    try {
      await withTimeout(fetch(`${base}/lb/${key(course)}/${pid}.json`, { method: 'PUT', body: JSON.stringify(body) }));
      delete cache[course];
      return await this.rank(course, t);
    } catch (e) { return null; }
  },
  async top(course, n = 10) {
    if (!base) return null;
    const c = cache[course];
    if (c && Date.now() - c.at < 20000) return c.rows;
    const q = `orderBy=${encodeURIComponent('"t"')}&limitToFirst=${n}`;
    const res = await withTimeout(fetch(`${base}/lb/${key(course)}.json?${q}`));
    if (!res.ok) throw new Error('http ' + res.status);
    const data = (await res.json()) || {};
    const rows = Object.entries(data).map(([id, v]) => ({ id, name: HL.cleanName(v.n), t: +v.t, skin: { color: v.c | 0, hat: v.h | 0, face: 1 }, me: id === pid }))
      .filter((r) => isFinite(r.t)).sort((a, b) => a.t - b.t);
    cache[course] = { at: Date.now(), rows };
    return rows;
  },
  async rank(course, t) {
    if (!base) return null;
    try {
      const q = `orderBy=${encodeURIComponent('"t"')}&endAt=${t - 0.05}&limitToFirst=500`;
      const res = await withTimeout(fetch(`${base}/lb/${key(course)}.json?${q}`));
      const data = (await res.json()) || {};
      return Object.keys(data).filter((k) => k !== pid).length + 1;
    } catch (e) { return null; }
  },
};
})();
