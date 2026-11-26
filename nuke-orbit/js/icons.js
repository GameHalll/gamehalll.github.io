/* =========================================================================
   NUKE ORBIT — icons.js
   Our own flat cartoon icon set (inline SVG) used instead of emoji, so the
   game looks the same on every device.
     NO.ico('rocket')      -> '<svg class="ico">…</svg>' for innerHTML
     NO.icoImg('fire')     -> cached Image for canvas drawImage
   Glyph-style icons (play, fast, menu, reset, retry) use currentColor so they
   take the button's text colour.
   ========================================================================= */
'use strict';

window.NO = window.NO || {};

(function () {
  const O = '#1f1b4d';
  const s = `stroke="${O}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`;
  const star = (cx, cy, r, f) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2);
    }
    return `<path d="${d}Z" fill="${f}" ${s}/>`;
  };
  const teeth = Array.from({ length: 8 }, (_, i) => `<rect x="10.2" y="1.6" width="3.6" height="5" rx="1" transform="rotate(${i * 45} 12 12)" fill="#c9ced8" ${s}/>`).join('');

  const I = {
    gear: `${teeth}<circle cx="12" cy="12" r="7.2" fill="#c9ced8" ${s}/><circle cx="12" cy="12" r="2.8" fill="${O}"/>`,
    pilot: `<path d="M5 22c0-4 3-6.5 7-6.5s7 2.5 7 6.5z" fill="#3f7be0" ${s}/><circle cx="12" cy="10.5" r="5.3" fill="#ffcf9e" ${s}/>
      <path d="M6.4 9.6C6.6 5.6 9 3.4 12 3.4s5.4 2.2 5.6 6.2z" fill="#6b4f3a" ${s}/><rect x="6.6" y="8" width="10.8" height="3.4" rx="1.7" fill="#7df9ff" ${s}/>`,
    bomb: `<path d="M15.5 7.5c1.5-2.3 3.5-3 5-2.2" fill="none" ${s}/><rect x="12.6" y="6.2" width="4.4" height="3.6" rx="1" transform="rotate(40 14.8 8)" fill="#5d5769" ${s}/>
      <circle cx="10.5" cy="14" r="7.5" fill="#3a365a" ${s}/><circle cx="7.8" cy="11.4" r="2" fill="#fff" opacity=".35"/>${star(20.6, 4.6, 3, '#ffd23f')}`,
    globe: `<circle cx="12" cy="12" r="9.5" fill="#4fb7ff" ${s}/><path d="M6 7.5c2 0 3 1.5 2.5 3S10 13 9 15s-2.5 1.5-3.5 0M14 4.5c0 2 2 2 3 3.5s-.5 3 1 4 2.5 0 2.5 0M13 15c1.5-.5 3 .5 3 2s-1 2.5-2.5 3" fill="#5fd36a" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/>`,
    sound: `<path d="M3.5 9h4l5-4.5v15L7.5 15h-4z" fill="#ffd23f" ${s}/><path d="M15.5 9c1.4 1.6 1.4 4.4 0 6M18 6.5c2.8 3 2.8 8 0 11" fill="none" ${s}/>`,
    mute: `<path d="M3.5 9h4l5-4.5v15L7.5 15h-4z" fill="#c9ced8" ${s}/><path d="M15.5 9l5 6M20.5 9l-5 6" fill="none" stroke="#e8475b" stroke-width="2.4" stroke-linecap="round"/>`,
    music: `<path d="M9 18V6l11-2.5v12" fill="none" ${s}/><path d="M9 7.5l11-2.5" fill="none" stroke="${O}" stroke-width="3"/>
      <ellipse cx="6.5" cy="18" rx="3.2" ry="2.6" fill="#b56bff" ${s}/><ellipse cx="17.5" cy="15.5" rx="3.2" ry="2.6" fill="#b56bff" ${s}/>`,
    play: `<path d="M7 4.5v15c0 .8.9 1.3 1.6.8l11-7.5a1 1 0 000-1.6l-11-7.5C7.9 3.2 7 3.7 7 4.5z" fill="currentColor"/>`,
    fast: `<path d="M3 6v12l8-6zM12 6v12l8-6z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
    menu: `<path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
    reset: `<path d="M5.5 12a6.5 6.5 0 106.5-6.5H8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M9.5 2l-4 3.5 4 3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    retry: `<path d="M18.5 12A6.5 6.5 0 1112 5.5h4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M14.5 2l4 3.5-4 3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    planet: `<path d="M2.5 15.5C1 18 3 19 7.5 17.5" fill="none" ${s}/><circle cx="12" cy="12" r="7.5" fill="#ffd23f" ${s}/><circle cx="9.5" cy="9.5" r="2" fill="#fff" opacity=".45"/>
      <path d="M4.5 16.2c3.6-.6 8-2.4 11.5-4.8S21.6 7 21.4 6c-.3-1.4-3-.8-5 .2" fill="none" ${s}/>`,
    star: star(12, 12.6, 10, '#ffd23f'),
    gem: `<path d="M6 3.5h12l4 5.5-10 12.5L2 9z" fill="#7df9ff" ${s}/><path d="M2 9h20M8.5 3.5L7 9l5 12.5L17 9l-1.5-5.5" fill="none" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>`,
    bulb: `<path d="M12 2.5a7 7 0 00-4 12.8V17h8v-1.7a7 7 0 00-4-12.8z" fill="#ffe066" ${s}/><rect x="8.5" y="17" width="7" height="4" rx="1.5" fill="#c9ced8" ${s}/><path d="M9.5 6.5a3.5 3.5 0 012.5-1" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
    lock: `<path d="M7.5 10.5V8a4.5 4.5 0 019 0v2.5" fill="none" stroke="${O}" stroke-width="2.6"/><path d="M7.5 10.5V8a4.5 4.5 0 019 0v2.5" fill="none" stroke="#c9ced8" stroke-width="1.2"/>
      <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="#ffd23f" ${s}/><circle cx="12" cy="15" r="1.6" fill="${O}"/><path d="M12 15.5v3" stroke="${O}" stroke-width="1.8" stroke-linecap="round"/>`,
    rocket: `<path d="M8.5 15.5c-2 1-3 3.5-3 6 2.5 0 5-1 6-3" fill="#ff9a1f" ${s}/><path d="M9 15l-3-1 2.5-4 3 .5M15 9l1 3-4 2.5-.5-3" fill="#e8475b" ${s}/>
      <path d="M9 15c0-6 4.5-11 12-12.5C19.5 10 15 14.5 9 15z" fill="#fff" ${s}/><circle cx="15.5" cy="8.5" r="2" fill="#4fb7ff" ${s}/>`,
    ball: `<circle cx="12" cy="12" r="9.5" fill="#ff8a2f" ${s}/><path d="M2.5 12h19M12 2.5v19M5.5 5c3 3 3 11 0 14M18.5 5c-3 3-3 11 0 14" fill="none" stroke="${O}" stroke-width="1.4"/>`,
    wind: `<path d="M3 8.5h11a3 3 0 10-3-3M3 13h15.5a3 3 0 11-3 3M3 17.5h7" fill="none" stroke="${O}" stroke-width="4.2" stroke-linecap="round"/><path d="M3 8.5h11a3 3 0 10-3-3M3 13h15.5a3 3 0 11-3 3M3 17.5h7" fill="none" stroke="#9fe7ff" stroke-width="1.8" stroke-linecap="round"/>`,
    fire: `<path d="M12 22c-4.5 0-7.5-3-7.5-7 0-4.5 4-6.5 4-11 3 1.5 5 4 5.5 6.5 1-1 1.3-2.5 1.2-3.5 2.5 2 4.3 5 4.3 8 0 4-3 7-7.5 7z" fill="#e8475b" ${s}/>
      <path d="M12 21c-2.4 0-4-1.6-4-3.8 0-2.6 2.4-3.6 2.6-6.2 2.4 1.4 5.4 3.4 5.4 6.2 0 2.2-1.6 3.8-4 3.8z" fill="#ff9a1f"/><path d="M12 20.5c-1.2 0-2-.8-2-2 0-1.4 1.2-2 1.6-3.2 1.2.8 2.4 1.8 2.4 3.2 0 1.2-.8 2-2 2z" fill="#ffe066"/>`,
    target: `<circle cx="12" cy="12" r="9.5" fill="#e8475b" ${s}/><circle cx="12" cy="12" r="6.3" fill="#fff" stroke="${O}" stroke-width="1.2"/><circle cx="12" cy="12" r="3.2" fill="#e8475b" stroke="${O}" stroke-width="1.2"/>`,
    gift: `<rect x="3" y="9" width="18" height="12.5" rx="1.5" fill="#e8475b" ${s}/><rect x="2" y="6.5" width="20" height="4.5" rx="1.2" fill="#ff6b7d" ${s}/><path d="M12 6.5v15" stroke="#ffd23f" stroke-width="3.4"/>
      <path d="M12 6.5C10 2.5 6 3 7 5.5S12 6.5 12 6.5zM12 6.5c2-4 6-3.5 5-1S12 6.5 12 6.5z" fill="#ffd23f" ${s}/>`,
    check: `<circle cx="12" cy="12" r="9.5" fill="#5fd36a" ${s}/><path d="M7 12.5l3.3 3.3L17.2 8.5" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    ruler: `<rect x="1.5" y="7.5" width="21" height="9" rx="1.5" fill="#ffd23f" ${s}/><path d="M5.5 7.5v3.5M9.5 7.5v2.3M13.5 7.5v3.5M17.5 7.5v2.3" stroke="${O}" stroke-width="1.5" stroke-linecap="round"/>`,
    balloon: `<path d="M12 16.5c-.5 2 1.5 3-.5 5.5" fill="none" stroke="${O}" stroke-width="1.4" stroke-linecap="round"/><path d="M12 16.5c-4 0-6.5-3.5-6.5-7.3a6.5 6.5 0 0113 0c0 3.8-2.5 7.3-6.5 7.3z" fill="#e8475b" ${s}/>
      <path d="M10.5 16.3l1.5 1.4 1.5-1.4z" fill="#e8475b" ${s}/><path d="M8.5 7.5a3.5 3.5 0 012.5-2.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    road: `<path d="M8.5 2.5h7l5.5 19h-18z" fill="#5d5769" ${s}/><path d="M12 4v3M12 10v3.5M12 17v3" stroke="#ffd23f" stroke-width="2" stroke-linecap="round"/>`,
    coin: `<circle cx="12" cy="12" r="9.5" fill="#ffd23f" ${s}/><circle cx="12" cy="12" r="6" fill="none" stroke="#e0a91a" stroke-width="1.8"/><path d="M12 8.5v7" stroke="#e0a91a" stroke-width="2.2" stroke-linecap="round"/>`,
  };

  NO.ICONS = I;
  NO.ico = function (name, cls) {
    const body = I[name];
    if (!body) return '';
    return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  };
  const imgs = {};
  NO.icoImg = function (name) {
    if (imgs[name]) return imgs[name];
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" color="#ffffff">${I[name] || ''}</svg>`);
    return (imgs[name] = img);
  };

  // base styling for inline icons (kept here so every page/mod gets it)
  const st = document.createElement('style');
  st.textContent = '.ico{width:1.15em;height:1.15em;vertical-align:-0.2em;display:inline-block;flex:none;overflow:visible}' +
    '.btn .ico{margin-right:.32em}.uc-icon .ico,.missions-ico .ico,.missions-tico .ico{width:1.6em;height:1.6em;vertical-align:middle;margin:0}' +
    '.lock .ico{width:1.4em;height:1.4em}';
  document.head.appendChild(st);
  // swap <i data-ico="name"> placeholders in the static HTML
  const hydrate = () => document.querySelectorAll('i[data-ico]').forEach((el) => { el.outerHTML = NO.ico(el.dataset.ico); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate); else hydrate();
})();
