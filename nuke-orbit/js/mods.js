/* =========================================================================
   NUKE ORBIT — mods.js
   Tiny event bus so feature modules in js/mods/*.js can plug into the game
   without editing the core files.

   A mod:  NO.Mods.register({ id: 'boost', launch(S, b) {...}, physics(S, dt, b) {...}, ... })

   Events (all receive the live state S = NO.Game.state as first arg unless noted):
     reset(S)                 scene reset (menu, before aim)
     aim(S)                   new run starts, S.run fresh (S.run.modCoins, S.run.modRows exist)
     launch(S, b)             bomb just released (b = S.bomb, velocities set)
     physics(S, dt, b)        every 1/240 s physics substep in flight (air AND rolling; check b.rolling)
     bounce(S, impact, b)     ground bounce, after restitution applied (may change b.vx / b.vy)
     chunk(S, x0, len, apex)  a new stretch of world [x0, x0+len] was generated ahead (spawn stuff here)
     update(S, dt, rawDt)     once per frame, every mode (dt includes FAST time scale)
     orbitUpdate(S, dt)       once per frame while in orbit view
     tap(S, ev) / tapEnd(S)   pointer / Space pressed / released during flight or orbit
     boom(S)                  bomb stopped and exploded
     results(S, r)            before the results screen; r is the results object
     resultsShown(r)          after the results DOM is filled (inject DOM here)
     menu()                   main menu rendered
     mode(mode)               UI mode changed (menu|aim|launch|flight|orbit|boom)
   Render events (ctx is the main 2D context, v = camera view helpers sx(), sy(), ppm, W, H):
     renderBack(ctx, v, S)    after sky/background, before coins (world space helpers, inside shake)
     renderWorld(ctx, v, S)   after coins + ground props + launch site, behind the bomb
     renderFront(ctx, v, S)   in front of bomb + particles + popups
     renderHUD(ctx, S, W, H)  screen space, after vignette (not shown in orbit view)
     renderOrbit(ctx, S, g)   orbit view overlay; g = { R, cx, cy, r } planet geometry
   Coins earned by mods: NO.Game.api.addCoins(n, label) -> shown in the HUD + results "Bonus" row.
     Call it DURING the run (latest in boom); coins added in results/resultsShown are not counted.
   Other api helpers: NO.Game.api.{S, ctx, canvas, W, H, PPM, view(), popup(x,y,text,color,scale,bold), gravity(), orbitGeom(), orbitPos(p)}
   Headless test: NO.UI.action('play'); NO.Game.triggerLaunch(); NO.Game.debugStep(40);
   Per-mod persistent data: NO.Mods.store(id) -> object saved with the game.
   ========================================================================= */
'use strict';

NO.Mods = (function () {
  const list = [];
  function register(m) { list.push(m); return m; }
  function emit(ev, a, b, c, d) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i], f = m[ev];
      if (typeof f === 'function') {
        try { f.call(m, a, b, c, d); } catch (e) { console.error('[mod ' + (m.id || '?') + '] ' + ev, e); }
      }
    }
  }
  function store(id) {
    const d = NO.Save.data;
    if (!d.mods || typeof d.mods !== 'object') d.mods = {};
    if (!d.mods[id] || typeof d.mods[id] !== 'object') d.mods[id] = {};
    return d.mods[id];
  }
  return { register, emit, store, list };
})();
