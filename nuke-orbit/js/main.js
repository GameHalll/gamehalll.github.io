/* =========================================================================
   NUKE ORBIT — main.js
   Boot + keyboard controls.
   ========================================================================= */
'use strict';

(function () {
  NO.Save.load();
  NO.UI.init();
  NO.Game.boot();

  window.addEventListener('keydown', (e) => {
    const S = NO.Game.state;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      NO.Audio.init();
      if (S.mode === 'aim') NO.Game.triggerLaunch();
      else if (S.mode === 'flight' || S.mode === 'orbit') NO.Game.tapDown(null);
      else if (S.mode === 'results' && NO.UI.current === 'results') NO.UI.action('retry');
      else if (S.mode === 'menu' && NO.UI.current === 'menu') NO.UI.action('play');
    } else if (e.code === 'KeyF' && S.mode === 'flight') {
      NO.Game.setFast(true); document.getElementById('btnFast').classList.add('active');
    } else if (e.code === 'Escape') {
      if (S.mode === 'aim') NO.UI.action('menu');
      else if (NO.UI.current && NO.UI.current !== 'menu' && NO.UI.current !== 'results') NO.UI.action('back');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') NO.Game.tapUp();
    if (e.code === 'KeyF') { NO.Game.setFast(false); document.getElementById('btnFast').classList.remove('active'); }
  });
})();
