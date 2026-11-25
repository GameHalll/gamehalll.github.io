// Tsunami Heist's own symbol set: replaces every emoji in the game (HUD, panels, toasts, chat, 3D labels)
// with chunky hand-made SVG glyphs, so the game looks the same on every device and has its own identity.
// Same style as icons.js: 24x24, thick ink outline, bright flat fills.
const INK = '#141020';
const g = (body, sw = 1.8) => `<g stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
const face = (fill, inner) => g(`<circle cx="12" cy="12" r="9.4" fill="${fill}"/>${inner}`);
const eye = (x, y = 10.2, r = 1.35) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/>`;

export const GLYPHS = {
  // ---- core game things
  fire: () => g(`<path d="M12 2.5c1 3.4 5.8 5.6 5.8 11a5.8 5.8 0 0 1-11.6 0c0-2.6 1.3-4.3 2.6-5.4.2 1.7 1 2.8 2.1 3.2C10.3 8.8 11 5.4 12 2.5z" fill="#ff7a1a"/><path d="M12 11.5c1.3 1.5 2.9 2.6 2.9 4.6a2.9 2.9 0 0 1-5.8 0c0-1.7 1.3-2.9 2.9-4.6z" fill="#ffd23f" stroke-width="1.3"/>`),
  gift: () => g(`<rect x="3.5" y="9" width="17" height="4" rx="1" fill="#ff4f6a"/><rect x="5" y="13" width="14" height="8.5" rx="1" fill="#ff7a8f"/><path d="M12 9v12.5" stroke="#ffd23f" stroke-width="3"/><path d="M12 9v12.5" fill="none"/><path d="M12 9c-1.6-3.8-6.2-4.6-6.2-2.1C5.8 8.6 9 9 12 9zM12 9c1.6-3.8 6.2-4.6 6.2-2.1 0 1.7-3.2 2.1-6.2 2.1z" fill="#ffd23f"/>`),
  clover: () => g(`<path d="M12 12c1 3.4 2.4 6.4 5 9.2" fill="none" stroke-width="2.4"/>
    <path d="M12 11.5C9 11.8 5.6 10.6 5.4 7.6 5.2 5.3 7.6 4 9.6 5 8.8 3 10.2 1.8 12 2.4c1.8-.6 3.2.6 2.4 2.6 2-1 4.4.3 4.2 2.6-.2 3-3.6 4.2-6.6 3.9z" fill="#3fd46a"/>
    <path d="M11.5 12c.3 3-.9 6.4-3.9 6.6-2.3.2-3.6-2.2-2.6-4.2-2 .8-3.2-.6-2.6-2.4-.6-1.8.6-3.2 2.6-2.4C4 7.6 5.3 7 7.6 7.4 10.6 7.6 11.8 9 11.5 12z" fill="#3fd46a"/>
    <path d="M12.5 12c-.3 3 .9 6.4 3.9 6.6 2.3.2 3.6-2.2 2.6-4.2 2 .8 3.2-.6 2.6-2.4.6-1.8-.6-3.2-2.6-2.4 1-2-.3-2.6-2.6-2.2-3 .2-4.2 1.6-3.9 4.6z" fill="#5ee06a"/>
    <path d="M9 6.8c.8-.8 1.8-1 2.6-.6" fill="none" stroke="#c8ffd4" stroke-width="1.4"/>`),
  flask: () => g(`<path d="M9.5 3h5M10 3v6.2L4.6 18.4c-.8 1.4.2 3.1 1.8 3.1h11.2c1.6 0 2.6-1.7 1.8-3.1L14 9.2V3" fill="#e9f7ff"/><path d="M7.2 14h9.6l2.4 4.4c.8 1.4-.2 3.1-1.8 3.1H6.6c-1.6 0-2.6-1.7-1.8-3.1z" fill="#c070ff"/><circle cx="10.5" cy="17.5" r="1" fill="#fff" stroke="none"/><circle cx="13.6" cy="16" r=".7" fill="#fff" stroke="none"/>`),
  trophy: () => g(`<path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z" fill="#ffd23f"/><path d="M7 5.5H4c0 3 1.2 4.5 3.4 4.8M17 5.5h3c0 3-1.2 4.5-3.4 4.8" fill="none" stroke-width="2"/><path d="M10.5 13.5h3l.6 3.5H9.9zM8 17h8v4H8z" fill="#ffb02e"/><path d="M9.5 5.5v3" stroke="#fff4b0" stroke-width="1.5" fill="none"/>`),
  medalGold: () => g(`<path d="M7 2.5h4l2 6.5-4 1zM17 2.5h-4l-2 6.5 4 1z" fill="#ff4f6a"/><circle cx="12" cy="15" r="6.5" fill="#ffd23f"/><path d="M12 11.8v6.4M10.6 13.2 12 11.8" fill="none" stroke-width="2"/>`),
  medalSilver: () => g(`<path d="M7 2.5h4l2 6.5-4 1zM17 2.5h-4l-2 6.5 4 1z" fill="#3fa8ff"/><circle cx="12" cy="15" r="6.5" fill="#d6dde6"/><path d="M9.8 13.2c.4-1.6 4.4-1.6 4.4.3 0 1.8-4.4 2.6-4.4 4.7h4.4" fill="none" stroke-width="1.8"/>`),
  medalBronze: () => g(`<path d="M7 2.5h4l2 6.5-4 1zM17 2.5h-4l-2 6.5 4 1z" fill="#5ee06a"/><circle cx="12" cy="15" r="6.5" fill="#e0904a"/><path d="M9.8 12.4h4.3l-2.2 2.4c2.5-.3 3 3.5.2 3.5-1 0-1.8-.4-2.3-1" fill="none" stroke-width="1.8"/>`),
  chart: () => g(`<rect x="3" y="3" width="18" height="18" rx="3" fill="#fff"/><path d="m5.5 16.5 4.5-5 3 3 5.5-6.5" fill="none" stroke="#2fc85a" stroke-width="2.6"/><path d="M15.5 8h3v3" fill="none" stroke="#2fc85a" stroke-width="2.6"/>`),
  crown: () => g(`<path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 19H5z" fill="#ffd23f"/><path d="M5 16h14" fill="none"/><circle cx="12" cy="12.8" r="1.4" fill="#ff4f6a"/><circle cx="3" cy="8.5" r="1.2" fill="#ffd23f"/><circle cx="21" cy="8.5" r="1.2" fill="#ffd23f"/><circle cx="12" cy="4.6" r="1.2" fill="#ffd23f"/>`),
  star: () => g(`<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="#ffd23f"/><path d="m9.8 8.8-2 .3" stroke="#fff6c2" stroke-width="1.4" fill="none"/>`),
  swirl: () => g(`<path d="M12 12.5c0-1 .9-1.6 1.8-1.4 1.5.3 2 2.2 1.1 3.5-1.4 2-4.5 2-6.1 0-2.2-2.7-.9-6.8 2.3-7.7 3.9-1.1 7.6 1.6 7.7 5.6.1 4.4-3.6 7.9-8.2 7.5" fill="none" stroke-width="4.2"/><path d="M12 12.5c0-1 .9-1.6 1.8-1.4 1.5.3 2 2.2 1.1 3.5-1.4 2-4.5 2-6.1 0-2.2-2.7-.9-6.8 2.3-7.7 3.9-1.1 7.6 1.6 7.7 5.6.1 4.4-3.6 7.9-8.2 7.5" fill="none" stroke="#8a6cff" stroke-width="2"/>`),
  mask: () => g(`<path d="M2.8 8.5c3-1.6 6.1-1.3 9.2.6 3.1-1.9 6.2-2.2 9.2-.6-.2 4.6-2.2 7.6-5.3 7.6-1.8 0-2.9-1-3.9-2.4-1 1.4-2.1 2.4-3.9 2.4-3.1 0-5.1-3-5.3-7.6z" fill="#8a6cff"/><path d="M6 10.6c.9-.6 2-.6 3 0M15 10.6c.9-.6 2-.6 3 0" fill="none" stroke-width="2.2"/>`),
  banana: () => g(`<path d="M3.5 5.5c-.4 9 6 15.6 16.4 14.4 1.2-.1 1.6-1.5.6-2.2-1.4-1-3.2-1-5.2-1.8C10.4 14 8 9.4 8.4 5.2 8.5 4 7.4 3.2 6.2 3.4L4.8 3.7c-.8.2-1.3.9-1.3 1.8z" fill="#ffe14a"/><path d="M5.6 3.5 5 1.8" fill="none" stroke-width="2.4"/><path d="M5.8 7.6c.4 5 3.6 9 8.8 10.4" fill="none" stroke="#e0b020" stroke-width="1.5"/>`),
  bell: () => g(`<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 2H4.2z" fill="#ffd23f"/><path d="M10 20.5a2 2 0 0 0 4 0" fill="none" stroke-width="2"/><circle cx="12" cy="3.6" r="1.3" fill="#ffd23f"/><path d="M8.8 9.5c.3-1 1-1.6 2-1.9" fill="none" stroke="#fff6c2" stroke-width="1.4"/>`),
  siren: () => g(`<path d="M6 19.5V13a6 6 0 0 1 12 0v6.5z" fill="#ff3f5c"/><rect x="4" y="19" width="16" height="2.8" rx="1" fill="#d6d9e4"/><path d="M9 13a3 3 0 0 1 3-3" fill="none" stroke="#ffc2cb" stroke-width="1.6"/><path d="M12 2.5v2.4M4.2 6.2l1.7 1.7M19.8 6.2l-1.7 1.7" fill="none" stroke="#ff3f5c" stroke-width="2.2"/>`),
  drop: () => g(`<path d="M12 2.8C9.5 7 6 10.5 6 14.6a6 6 0 0 0 12 0c0-4.1-3.5-7.6-6-11.8z" fill="#2fa6ff"/><path d="M9.2 14.6a2.8 2.8 0 0 0 2.4 2.8" fill="none" stroke="#bfe8ff" stroke-width="1.6"/>`),
  bubbles: () => g(`<circle cx="9" cy="14" r="6" fill="#bfe8ff"/><circle cx="17" cy="7" r="3.5" fill="#bfe8ff"/><circle cx="18.5" cy="16.5" r="2.3" fill="#bfe8ff"/><path d="M6.4 12.2a3 3 0 0 1 2.2-1.9" fill="none" stroke="#fff" stroke-width="1.5"/>`),
  barrel: () => g(`<path d="M6 3.5h12c1.6 2.6 1.6 14.4 0 17H6c-1.6-2.6-1.6-14.4 0-17z" fill="#c0703a"/><path d="M4.9 8h14.2M4.9 16h14.2" fill="none" stroke-width="2.2"/><path d="M8.5 5.5c-.6 3.6-.6 9.4 0 13" fill="none" stroke="#e7a26a" stroke-width="1.4"/>`),
  rock: () => g(`<path d="M3 18.5 5.5 9l5-4.5 6 1.5 4 6 .5 6.5z" fill="#8a8fa3"/><path d="m10.5 4.5 1.5 6-6.5-1.5M12 10.5l4.5 1.5" fill="none" stroke-width="1.4"/>`),
  pad: () => g(`<ellipse cx="12" cy="16" rx="9" ry="4" fill="#3fd46a"/><path d="M12 13V4M8.5 7.5 12 4l3.5 3.5" fill="none" stroke-width="2.6"/><path d="M12 13V4M8.5 7.5 12 4l3.5 3.5" fill="none" stroke="#bfffcf" stroke-width="1.1"/>`),
  heartBreak: () => g(`<path d="M12 20.5C6 16.6 2.8 13.2 2.8 9a4.6 4.6 0 0 1 8.4-2.6L10 10l3 2-1.6 3 2.4-3-2.8-2 1-3.6A4.6 4.6 0 0 1 21.2 9c0 4.2-3.2 7.6-9.2 11.5z" fill="#ff4f6a"/>`),
  heart: () => g(`<path d="M12 20.5C6 16.6 2.8 13.2 2.8 9a4.6 4.6 0 0 1 9.2-1.8A4.6 4.6 0 0 1 21.2 9c0 4.2-3.2 7.6-9.2 11.5z" fill="#ff4f6a"/><path d="M6.4 8.2a2 2 0 0 1 1.6-1.6" fill="none" stroke="#ffc2cb" stroke-width="1.5"/>`),
  meteor: () => g(`<path d="M3 3l7.5 5.5M5.5 2.5l6.5 7M2.5 6l6.5 5" fill="none" stroke="#ff9a2a" stroke-width="2.2"/><circle cx="15" cy="15" r="6.2" fill="#ff7a1a"/><circle cx="13.5" cy="13.5" r="1.4" fill="#c04a10"/><circle cx="17" cy="17" r="1" fill="#c04a10"/>`),
  shark: () => g(`<path d="M2.5 20c3-1.2 5-4.2 6-8.5L10.5 4c3.5 2.6 6.4 7.4 7.5 12.5L21.5 20z" fill="#8aa6c8"/><path d="M2.5 20h19" fill="none" stroke="#2fa6ff" stroke-width="2.4"/><path d="M11.2 7.5c1.6 2 2.7 4.3 3.2 6.8" fill="none" stroke="#d6e4f5" stroke-width="1.4"/>`),
  island: () => g(`<path d="M2.5 20c4-4 15-4 19 0z" fill="#ffd27a"/><path d="M12 18.5c0-4 .6-8 2-11" fill="none" stroke="#a86a3a" stroke-width="2.4"/><path d="M14 7.5c-2.6-1.8-6.4-1.4-8 1.2 2.4-.4 5-.2 8-1.2zM14 7.5c2.4-2.2 5.6-2 7.2.2-2.4-.3-4.6.2-7.2-.2zM14 7.5c.4-2.6-1.4-4.6-3.6-4.8 1.4 1.4 2.4 2.8 3.6 4.8z" fill="#3fd46a"/>`),
  stop: () => g(`<circle cx="12" cy="12" r="9.4" fill="#ff3f5c"/><circle cx="12" cy="12" r="5.8" fill="#fff"/><path d="m7.8 7.8 8.4 8.4" fill="none" stroke="#ff3f5c" stroke-width="3"/>`),
  hourglass: () => g(`<path d="M6 2.8h12M6 21.2h12" fill="none" stroke-width="2.4"/><path d="M7.2 2.8h9.6c0 4.4-4.8 6.2-4.8 9.2 0-3-4.8-4.8-4.8-9.2zM7.2 21.2h9.6c0-4.4-4.8-6.2-4.8-9.2 0 3-4.8 4.8-4.8 9.2z" fill="#e9f7ff"/><path d="M9 6.5h6l-3 3.5zM8.4 20.2c.6-2 2.2-3 3.6-3.6 1.4.6 3 1.6 3.6 3.6z" fill="#ffd23f" stroke-width="1.2"/>`),
  arrowUp: () => g(`<path d="M12 2.8 3.5 11.5h5.3v9.7h6.4v-9.7h5.3z" fill="#5dff86"/>`),
  fast: () => g(`<path d="M2.5 5v14l9-7zM12 5v14l9.5-7z" fill="#2fa6ff"/>`),
  crab: () => g(`<ellipse cx="12" cy="14" rx="7" ry="5" fill="#ff5a4a"/><path d="M5.5 11.5 3 7.5M18.5 11.5 21 7.5M6 17.5l-3 2M18 17.5l3 2" fill="none" stroke-width="2"/><path d="M3 7.5c-1.4-1.4-.4-3.8 1.6-3.6L4.4 6zM21 7.5c1.4-1.4.4-3.8-1.6-3.6L19.6 6z" fill="#ff5a4a"/>${eye(10, 12.4, 1.1)}${eye(14, 12.4, 1.1)}`),
  log: () => g(`<rect x="2.5" y="8" width="16" height="8" rx="4" fill="#b0703a"/><ellipse cx="18.5" cy="12" rx="3" ry="4" fill="#f0c890"/><ellipse cx="18.5" cy="12" rx="1.2" ry="1.7" fill="none" stroke-width="1.2"/>`),
  plus: () => g(`<path d="M12 4v16M4 12h16" fill="none" stroke-width="5"/><path d="M12 4v16M4 12h16" fill="none" stroke="#5dff86" stroke-width="2.6"/>`),
  hundred: () => g(`<path d="M3 19h18" fill="none" stroke="#ff3f5c" stroke-width="2.4"/><path d="M4.5 7.5 6.5 6v10M10.5 11a2.2 5 0 1 0 4.4 0 2.2 5 0 1 0-4.4 0zM16.5 11a2.2 5 0 1 0 4.4 0 2.2 5 0 1 0-4.4 0z" fill="none" stroke="#ff3f5c" stroke-width="2.2"/>`),
  diamond: () => g(`<path d="M6.5 3.5h11l4.5 6-10 11.5L2 9.5z" fill="#5ad8ff"/><path d="M2 9.5h20M9.5 3.5 7.6 9.5 12 21l4.4-11.5-1.9-6" fill="none" stroke-width="1.2" opacity=".6"/><path d="M7 5.5 5 8.5" stroke="#fff" stroke-width="1.6" fill="none"/>`),
  rainbow: () => g(`<path d="M2.5 19a9.5 9.5 0 0 1 19 0" fill="none" stroke-width="7"/><path d="M3.6 19a8.4 8.4 0 0 1 16.8 0" fill="none" stroke="#ff4f4f" stroke-width="2"/><path d="M5.6 19a6.4 6.4 0 0 1 12.8 0" fill="none" stroke="#ffd23f" stroke-width="2"/><path d="M7.6 19a4.4 4.4 0 0 1 8.8 0" fill="none" stroke="#3fa8ff" stroke-width="2"/>`),
  boom: () => g(`<path d="m12 1.8 2.2 5.4 5.5-2.4-2.4 5.5 5.4 2.2-5.4 2.2 2.4 5.5-5.5-2.4-2.2 5.4-2.2-5.4-5.5 2.4 2.4-5.5L1.8 12.5l5.4-2.2-2.4-5.5 5.5 2.4z" fill="#ff7a1a"/><path d="m12 7.5 1.2 3 3-1.3-1.3 3 3 1.2-3 1.3 1.3 3-3-1.3-1.2 3-1.2-3-3 1.3 1.3-3-3-1.2 3-1.3-1.3-3 3 1.3z" fill="#ffd23f" stroke-width="1"/>`),
  hat: () => g(`<path d="M6 15.5c0-6 2.4-10.5 6-10.5s6 4.5 6 10.5z" fill="#2fa6ff"/><path d="M2.5 16.5c3-1.6 16-1.6 19 0-3 2.4-16 2.4-19 0z" fill="#1a7fd0"/><path d="M8.6 9.5c.4-1.6 1.2-2.8 2.4-3.4" fill="none" stroke="#9fd8ff" stroke-width="1.5"/>`),
  shirt: () => g(`<path d="M8.5 3.5 3 6.5l2 4.5 2.5-1v10.5h9V10l2.5 1 2-4.5-5.5-3c-.4 1.6-1.8 2.6-3.5 2.6S8.9 5.1 8.5 3.5z" fill="#ff4fa0"/>`),
  paw: () => g(`<ellipse cx="12" cy="15.8" rx="4.6" ry="4" fill="#ffb02e"/><ellipse cx="6" cy="10.5" rx="2" ry="2.5" fill="#ffb02e"/><ellipse cx="9.5" cy="6.5" rx="2" ry="2.6" fill="#ffb02e"/><ellipse cx="14.5" cy="6.5" rx="2" ry="2.6" fill="#ffb02e"/><ellipse cx="18" cy="10.5" rx="2" ry="2.5" fill="#ffb02e"/>`),
  music: () => g(`<path d="M9 18V5.5l11-2.5v12.5" fill="none" stroke-width="2.4"/><ellipse cx="6.5" cy="18" rx="3" ry="2.4" fill="#c070ff"/><ellipse cx="17.5" cy="15.5" rx="3" ry="2.4" fill="#c070ff"/>`),
  compass: () => g(`<circle cx="12" cy="12" r="9.4" fill="#fff"/><path d="m12 4.5 2.4 7.5H9.6z" fill="#ff4f6a"/><path d="m12 19.5-2.4-7.5h4.8z" fill="#c9d3da"/><circle cx="12" cy="12" r="1.2" fill="${INK}" stroke="none"/>`),
  question: () => g(`<circle cx="12" cy="12" r="9.4" fill="#8a6cff"/><path d="M9.3 9.4c.2-1.6 1.4-2.6 2.9-2.6 1.6 0 2.8 1 2.8 2.4 0 2.2-3 2.4-3 4.6" fill="none" stroke="#fff" stroke-width="2.4"/><circle cx="12" cy="17.2" r="1.4" fill="#fff" stroke="none"/>`),
  hammer: () => g(`<path d="m11.5 9.5-7.8 7.8a1.6 1.6 0 0 0 2.3 2.3l7.8-7.8" fill="#c0703a"/><path d="m9.5 6 4-3.5 2.5.5 5 5-3.5 4-1.5-1.5-1 1-5-5 1-1z" fill="#8a8fa3"/>`),
  pan: () => g(`<circle cx="10" cy="12" r="7" fill="#4a4f60"/><path d="m16.5 12 6-1" fill="none" stroke-width="3"/><ellipse cx="10" cy="12" rx="3.2" ry="2.8" fill="#fff"/><circle cx="10" cy="12" r="1.4" fill="#ffd23f" stroke="none"/>`),
  hole: () => g(`<ellipse cx="12" cy="14" rx="9.5" ry="5" fill="#2a2440"/><ellipse cx="12" cy="15" rx="6" ry="2.6" fill="#0c0a14" stroke="none"/><path d="M3.5 12.5c2-2.6 15-2.6 17 0" fill="none" stroke="#6a6080" stroke-width="1.2"/>`),
  brick: () => g(`<rect x="2.5" y="5" width="19" height="14" rx="1.5" fill="#e0603a"/><path d="M2.5 12h19M9 5v7M15 12v7" fill="none" stroke-width="1.6"/>`),
  fish: () => g(`<path d="M3 12c3-5 9.5-6.5 14-2.5l4-3v11l-4-3C12.5 18.5 6 17 3 12z" fill="#2fa6ff"/>${eye(7.5, 11)}`),
  tag: () => g(`<path d="M3 4v7.2l9.3 9.3c.6.6 1.5.6 2.1 0l6.1-6.1c.6-.6.6-1.5 0-2.1L11.2 3H4a1 1 0 0 0-1 1z" fill="#ffd23f"/><circle cx="7.5" cy="7.5" r="1.6" fill="#fff"/>`),
  cart: () => g(`<path d="M2.5 4h3l2.5 11h10.5L21 7.5H7" fill="#e9f7ff"/><circle cx="9.5" cy="19" r="1.8" fill="#8a8fa3"/><circle cx="17" cy="19" r="1.8" fill="#8a8fa3"/>`),
  eyes: () => g(`<ellipse cx="8" cy="12" rx="4.2" ry="5.6" fill="#fff"/><ellipse cx="16" cy="12" rx="4.2" ry="5.6" fill="#fff"/>${eye(9.2, 13, 2)}${eye(17.2, 13, 2)}`),
  hands: () => g(`<path d="M2.5 14.5c3.4-1.2 6 .2 9.5 2.4 3.5-2.2 6.1-3.6 9.5-2.4v4.6c-3.6-.6-6.2.6-9.5 2.4-3.3-1.8-5.9-3-9.5-2.4z" fill="#ffc890"/><circle cx="12" cy="8" r="4" fill="#ffd23f"/><path d="M12 6v4" fill="none" stroke="#a86a00" stroke-width="1.6"/>`),
  bread: () => g(`<path d="M3.5 15c-1-4 2-8.5 8.5-8.5s9.5 4.5 8.5 8.5c-.5 2-3.5 3-8.5 3s-8-1-8.5-3z" fill="#f0a84a"/><path d="M8.5 9l1.5 7M12 8.5V17M15.5 9 14 16" fill="none" stroke="#c0702a" stroke-width="1.6"/>`),
  chick: () => g(`<circle cx="12" cy="13.5" r="7.5" fill="#ffe14a"/><path d="m18.8 12.5 3 1-3 1.2z" fill="#ff9a2a"/>${eye(15.5, 11.5)}<path d="M7 14c1.4 1.6 3.4 1.8 5 .6" fill="none" stroke-width="1.6"/><path d="M11 6c.2-1.4 1.6-2.4 2.6-1.6" fill="none" stroke-width="1.6"/>`),
  sock: () => g(`<path d="M8 2.5h7v9.5l3.6 3.4c1.6 1.6 1 4.8-1.6 5.4-1.6.4-3-.2-4.2-1.4L8.4 15.2A1.6 1.6 0 0 1 8 14z" fill="#5ee06a"/><path d="M8 6h7M8 8.5h7" fill="none" stroke="#fff" stroke-width="1.6"/>`),
  cactus: () => g(`<path d="M9.5 21.5V5.5a2.5 2.5 0 0 1 5 0v16zM9.5 13H7a2 2 0 0 1-2-2V8.5h2.5V11h2M14.5 15h2.5a2 2 0 0 0 2-2V10h-2.5v3h-2" fill="#3fd46a"/><path d="M6.5 21.5h11" fill="none" stroke-width="2.2"/>`),
  planet: () => g(`<circle cx="12" cy="12" r="5.8" fill="#ff9ae6"/><ellipse cx="12" cy="12" rx="10" ry="3.2" fill="none" stroke-width="2.6" transform="rotate(-20 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="3.2" fill="none" stroke="#ffd23f" stroke-width="1.2" transform="rotate(-20 12 12)"/>`),
  sun: () => g(`<circle cx="12" cy="12" r="4.8" fill="#ffe14a"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" fill="none" stroke="#ff9a2a" stroke-width="2.4"/>`),
  sunset: () => g(`<path d="M5 15a7 7 0 0 1 14 0z" fill="#ffb02e"/><path d="M2.5 15h19M5 18.5h14M8 21.5h8" fill="none" stroke="#ff6a4a" stroke-width="2"/><path d="M12 4v2.5M5.2 7.2 6.8 8.8M18.8 7.2l-1.6 1.6" fill="none" stroke-width="2"/>`),
  moon: () => g(`<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5 7 7 0 0 1-5-13.5z" fill="#d8f4ff"/><path d="m18 5.5.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#ff4fd8" stroke-width="1"/>`),
  storm: () => g(`<path d="M6.5 15.5a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1 3.6 3.6 0 0 1 .7 7.1L17 15.5z" fill="#c9d3da"/><path d="M12.5 12.5 9.5 17h3l-1.5 4.5 4.5-6h-3l1.5-3z" fill="#ffd23f"/>`),
  rain: () => g(`<path d="M6.5 14.5a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1 3.6 3.6 0 0 1 .7 7.1L17 14.5z" fill="#c9d3da"/><path d="m8 17.5-1 3M12.5 17.5l-1 3M17 17.5l-1 3" fill="none" stroke="#2fa6ff" stroke-width="2.2"/>`),
  galaxy: () => g(`<circle cx="12" cy="12" r="9.4" fill="#2a1a5a"/><path d="M12 12c0-1.4 1.6-2 2.8-1.2 2 1.4.8 4.6-1.8 5-3.6.6-6-3-4.6-6.2 1.8-4 7.6-4.4 10-.8" fill="none" stroke="#c070ff" stroke-width="2"/><circle cx="7" cy="7.5" r=".9" fill="#fff" stroke="none"/><circle cx="17" cy="16.5" r=".9" fill="#fff" stroke="none"/>`),
  // ---- faces (bot chat)
  faceCry: () => face('#ffd23f', `<path d="M6.8 9.8c.8-.8 2-.8 2.8 0M14.4 9.8c.8-.8 2-.8 2.8 0" fill="none" stroke-width="1.6"/><path d="M7.2 11.5v7M16.8 11.5v7" fill="none" stroke="#2fa6ff" stroke-width="2.4"/><path d="M9.2 16.8c1.6-1.6 4-1.6 5.6 0" fill="none" stroke-width="1.8"/>`),
  faceLaugh: () => face('#ffd23f', `<path d="M6.8 10.2c.6-1.2 2.2-1.2 2.8 0M14.4 10.2c.6-1.2 2.2-1.2 2.8 0" fill="none" stroke-width="1.6"/><path d="M6.8 13h10.4a5.2 5.2 0 0 1-10.4 0z" fill="#fff"/><path d="M5.2 12.5c-.6 1.2-.6 2.4.4 3M18.8 12.5c.6 1.2.6 2.4-.4 3" fill="none" stroke="#2fa6ff" stroke-width="1.8"/>`),
  faceSweat: () => face('#ffd23f', `${eye(9)}${eye(15)}<path d="M8 14.2c2.4 2 5.6 2 8 0" fill="none" stroke-width="1.8"/><path d="M18.5 5.5c-.8 1.4-1.4 2.2-1.4 3a1.4 1.4 0 0 0 2.8 0c0-.8-.6-1.6-1.4-3z" fill="#5ad8ff" stroke-width="1.2"/>`),
  faceDevil: () => g(`<path d="M5 6.5 3.5 2.5l4 2.4M19 6.5l1.5-4-4 2.4" fill="#c070ff"/><circle cx="12" cy="13" r="8.8" fill="#c070ff"/><path d="M7.4 10.6l3 1M16.6 10.6l-3 1" fill="none" stroke-width="1.8"/><path d="M7.6 14.8c2.6 2.8 6.2 2.8 8.8 0" fill="none" stroke-width="1.8"/>`),
  faceCool: () => face('#ffd23f', `<path d="M4.5 9h15l-1 3.4c-.3 1-1.2 1.6-2.2 1.6h-1.6c-1 0-1.8-.6-2-1.6L12 11l-.7 1.4c-.3 1-1.1 1.6-2.1 1.6H7.7c-1 0-1.9-.6-2.2-1.6z" fill="${INK}"/><path d="M8.5 16.5c2 1.2 4.6 1.2 7-.6" fill="none" stroke-width="1.8"/>`),
  faceAngry: () => face('#ff6a4a', `<path d="M6.8 8.4l3 1.4M17.2 8.4l-3 1.4" fill="none" stroke-width="1.8"/>${eye(8.8, 11.2)}${eye(15.2, 11.2)}<path d="M8.4 17c2-1.6 5.2-1.6 7.2 0" fill="none" stroke-width="1.8"/>`),
  faceShock: () => face('#ffd23f', `<circle cx="9" cy="10" r="1.8" fill="#fff"/><circle cx="15" cy="10" r="1.8" fill="#fff"/>${eye(9, 10, 0.9)}${eye(15, 10, 0.9)}<ellipse cx="12" cy="16" rx="1.8" ry="2.2" fill="${INK}"/>`),
  faceSmile: () => face('#ffd23f', `${eye(9)}${eye(15)}<path d="M7.6 13.8c2.6 2.8 6.2 2.8 8.8 0" fill="none" stroke-width="1.8"/>`),
  faceAngel: () => g(`<ellipse cx="12" cy="3.6" rx="5.5" ry="1.6" fill="none" stroke="#ffd23f" stroke-width="2"/>`) + face('#ffd23f', `<path d="M7 11c.6-1 2.2-1 2.8 0M14.2 11c.6-1 2.2-1 2.8 0" fill="none" stroke-width="1.6"/><path d="M8 14.4c2.4 2.4 5.6 2.4 8 0" fill="none" stroke-width="1.8"/>`),
  faceParty: () => face('#ffd23f', `${eye(9)}${eye(15)}<path d="M7.6 13.8c2.6 2.8 6.2 2.8 8.8 0" fill="none" stroke-width="1.8"/>`) + g(`<path d="M13 3.5 19 1l-1 6.5z" fill="#ff4fa0"/>`),
  faceRoll: () => face('#ffd23f', `<circle cx="9" cy="10" r="1.9" fill="#fff"/><circle cx="15" cy="10" r="1.9" fill="#fff"/>${eye(9.5, 8.9, 0.9)}${eye(15.5, 8.9, 0.9)}<path d="M8.8 16h6.4" fill="none" stroke-width="1.8"/>`),
  faceMelt: () => g(`<path d="M2.6 12a9.4 9.4 0 0 1 18.8 0c0 3-1.6 4-1.6 6 0 1.6 1.6 2 1.6 3.5H5.5c-1.6 0-2.9-1.3-2.9-2.9z" fill="#ffd23f"/>${eye(9, 11)}${eye(15, 11)}<path d="M8.2 15.5c2.6 1.6 5 1.6 7.6 0" fill="none" stroke-width="1.8"/>`),
  faceMoney: () => face('#ffd23f', `<path d="M7.6 8.4v4.4M6.4 9.4c.4-.6 2.4-.6 2.4.6 0 1-2.4.8-2.4 2 0 .8 2 1 2.4.2M16.4 8.4v4.4M15.2 9.4c.4-.6 2.4-.6 2.4.6 0 1-2.4.8-2.4 2 0 .8 2 1 2.4.2" fill="none" stroke="#2fc85a" stroke-width="1.4"/><path d="M8 15c2.4 2.6 5.6 2.6 8 0z" fill="#fff"/>`),
};

// every emoji used anywhere in the game → glyph name (from GLYPHS here or the base set in icons.js)
const MAP = {
  '🔥': 'fire', '🎁': 'gift', '🍀': 'clover', '🧪': 'flask', '🏆': 'trophy', '🥇': 'medalGold', '🏅': 'medalGold', '🥈': 'medalSilver', '🥉': 'medalBronze',
  '📈': 'chart', '👑': 'crown', '⭐': 'star', '🌟': 'star', '★': 'star', '💫': 'star', '🌀': 'swirl', '🎭': 'mask', '🦝': 'mask', '🕵': 'mask',
  '🍌': 'banana', '🔔': 'bell', '🚨': 'siren', '💦': 'drop', '🤿': 'drop', '🫧': 'bubbles', '🛢': 'barrel', '🪨': 'rock', '🟢': 'pad',
  '💔': 'heartBreak', '❤': 'heart', '📚': 'book', '☄': 'meteor', '🦈': 'shark', '🏝': 'island', '🚫': 'stop', '⏳': 'hourglass', '⏱': 'hourglass',
  '⬆': 'arrowUp', '⏩': 'fast', '🦀': 'crab', '🪵': 'log', '✚': 'plus', '✔': 'check', '💯': 'hundred', '💎': 'diamond', '💠': 'diamond',
  '🌈': 'rainbow', '💥': 'boom', '🧢': 'hat', '👒': 'hat', '⛑': 'hat', '🧙': 'hat', '🎀': 'hat', '🚁': 'hat', '👕': 'shirt', '💇': 'shirt', '🧶': 'shirt',
  '🐾': 'paw', '🦔': 'paw', '🦙': 'paw', '🎧': 'music', '🧭': 'compass', '❔': 'question', '❓': 'question', '🔨': 'hammer', '🍳': 'pan',
  '🕳': 'hole', '🧱': 'brick', '🐟': 'fish', '🏷': 'tag', '🛒': 'cart', '♻': 'rebirth', '🪃': 'rebirth', '🎯': 'target', '🛡': 'shield',
  '🤲': 'hands', '🏄': 'wave', '🥐': 'bread', '🐤': 'chick', '🧦': 'sock', '🌵': 'cactus', '🪐': 'planet', '🌌': 'galaxy',
  '☀': 'sun', '🌅': 'sunset', '🌃': 'moon', '⛈': 'storm', '🌧': 'rain', '🏴': 'skull', '☠': 'skull', '🕶': 'faceCool',
  '😭': 'faceCry', '😂': 'faceLaugh', '😅': 'faceSweat', '😈': 'faceDevil', '😎': 'faceCool', '😡': 'faceAngry', '😤': 'faceAngry',
  '😳': 'faceShock', '👀': 'eyes', '🙂': 'faceSmile', '😇': 'faceAngel', '🥳': 'faceParty', '🙄': 'faceRoll', '🫠': 'faceMelt', '🤑': 'faceMoney',
  '🪙': 'coin', '💵': 'cash', '💸': 'cash', '💰': 'coin', '🌊': 'wave', '🔒': 'lock', '🔓': 'unlock', '✨': 'sparkle', '⚡': 'bolt', '💀': 'skull',
  '🖱': 'mouse', '✅': 'check', '🔊': 'soundOn', '🔇': 'soundOff', '🏏': 'bat', '👟': 'speed', '🏠': 'house', '⚠': 'warn', '🏃': 'run',
  '📖': 'book', '🌍': 'globe', '🔁': 'rebirth', '🏛': 'pedestal', '➿': 'rebirth', '▶': 'play', '🎲': 'question',
};
export const glyphFor = e => MAP[e.replace(/️/g, '')] || null;

// matches emoji (incl. variation selector / ZWJ sequences) plus the few dingbats the game uses
export const EMOJI_RE = /(?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)|[★✚✔➿⬆▶]️?/gu;
const HAS_EMOJI = /[←-⯿\u{1F000}-\u{1FAFF}]/u;
export const hasEmoji = s => HAS_EMOJI.test(s);

// ---- canvas support (3D name tags / labels): glyph → cached <img> from an SVG data URL
let svgOf = null; // set by icons.js (needs its base glyph set too)
export function _setSvgSource(fn) { svgOf = fn; }
const imgCache = new Map(); const waiters = new Set();
export function glyphImage(e) {
  const name = glyphFor(e); if (!name || !svgOf) return null;
  let rec = imgCache.get(name);
  if (!rec) {
    const svg = svgOf(name); if (!svg) return null;
    const img = new Image(64, 64);
    rec = { img, ok: false };
    img.onload = () => { rec.ok = true; const w = [...waiters]; waiters.clear(); for (const f of w) f(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" '));
    imgCache.set(name, rec);
  }
  return rec;
}
/** call fn once the next pending glyph image finishes loading (labels redraw themselves) */
export const onGlyphLoad = fn => waiters.add(fn);
