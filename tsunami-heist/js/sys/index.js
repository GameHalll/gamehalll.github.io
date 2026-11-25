// Gameplay systems. Each module default-exports init(game, bus). A broken module is logged and skipped.
export const SYSTEMS = ['quests', 'events', 'powerups', 'traps', 'fusion', 'achievements', 'social', 'rewards', 'cosmetics', 'hazards', 'waves', 'synergy'];
export async function loadSystems(game, bus) {
  for (const n of SYSTEMS) {
    try { const m = await import(`./${n}.js`); await m.default?.(game, bus); }
    catch (e) { console.error(`[sys ${n}] failed to load`, e); }
  }
}
