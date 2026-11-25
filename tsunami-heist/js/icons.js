// Inline SVG icon set for the Tsunami Heist HUD. No external assets.
// icon(name) -> '<svg class="ico">…</svg>' string. Chunky ink outlines + bright fills (toy / Roblox look).
import { GLYPHS, glyphFor, EMOJI_RE, hasEmoji, _setSvgSource } from './symbols.js';
const INK = '#141020';
const g = (body, sw = 1.8) => `<g stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
let uid = 0;

const P = {
  coin: () => g(`<circle cx="12" cy="12" r="9.2" fill="#ffd23f"/><circle cx="12" cy="12" r="6.4" fill="#ffe680" stroke="#e0a000" stroke-width="1.4"/>
    <path d="M14.4 9.6c-.4-.9-1.3-1.4-2.4-1.4-1.3 0-2.3.7-2.3 1.7 0 2.4 4.9 1.3 4.9 3.9 0 1.1-1.1 1.9-2.6 1.9-1.1 0-2.1-.5-2.6-1.4M12 6.9v1.3M12 15.8v1.3" fill="none" stroke="#a86a00" stroke-width="1.7"/>`),
  wave: () => g(`<path d="M2.5 20.5v-3.2c.8-6.6 5.4-11.6 11.4-11.6 3.6 0 6.1 2 6.1 4.6 0 2.1-1.6 3.5-3.5 3.5-1.6 0-2.7-1-2.7-2.3 0-.9.5-1.5 1.1-1.8-3.4-.2-5.9 2.4-6.6 6.2 1.3-1.1 2.6-1.1 3.8 0 1.6 1.4 3.4 1.4 5 0 1.6-1.4 3.4-1.4 5 0v4.6z" fill="#2fa6ff"/>
    <path d="M6 15.5c.8-3.6 3.3-6 6.9-6.3" fill="none" stroke="#bfe8ff" stroke-width="1.5"/>`),
  bolt: () => g(`<path d="M13.6 2 4.5 13.6h6.2L9.6 22l9.6-12.2h-6.3z" fill="#ffd23f"/><path d="M12.4 5.6 8 11.5" stroke="#fff6c2" stroke-width="1.4" fill="none"/>`),
  book: () => g(`<path d="M4 19.5V5a2 2 0 0 1 2-2h13.5v14.5H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13.5v-4" fill="#a07aff"/>
    <path d="M6 21.5a2 2 0 0 1 0-4h13.5v4z" fill="#fff"/><path d="M9.5 7.5h6M9.5 10.5h4" stroke="#e6dcff" fill="none"/>`),
  globe: () => g(`<circle cx="12" cy="12" r="9.4" fill="#2fa6ff"/>
    <path d="M6.3 5.2c2.2.1 3.6 1.4 3 3-.6 1.6 1.6 1.9 2.4 3.1.7 1.1-.4 2.6-1.4 3.4-.9.8-.8 2.7-.3 4.4A9.4 9.4 0 0 1 6.3 5.2zM14.6 3c.2 1.5 1.6 2.5 3.4 2.2 1.1-.2 2.3.6 2.9 1.9.5 1.5.6 2.6-.4 3.6-.9 1-.6 2.6-1.8 3.2-1.4.7-2.6-.5-2.6-2-.1-1.5-2-2-2.3-3.5-.3-1.3.6-2.3.2-3.5-.2-.8-.4-1.5.6-1.9z" fill="#5ee06a"/>`),
  lock: () => g(`<path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7" fill="none" stroke-width="2.6"/><path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7" fill="none" stroke="#c9d3da" stroke-width="1"/>
    <rect x="4.5" y="10" width="15" height="11.5" rx="3" fill="#ffd23f"/><path d="M12 14.2v3" stroke-width="2.4"/>`),
  unlock: () => g(`<path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 8.7-1.7" fill="none" stroke-width="2.6"/><path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 8.7-1.7" fill="none" stroke="#c9d3da" stroke-width="1"/>
    <rect x="4.5" y="10" width="15" height="11.5" rx="3" fill="#5dff86"/><path d="M12 14.2v3" stroke-width="2.4"/>`),
  bat: () => g(`<path d="M6.2 16.4 15.8 4.6c1-1.3 3-1.5 4.1-.4 1.1 1.1 1 3-.3 4.1L7.6 17.8z" fill="#d99a5b"/><path d="M15.6 6.2 9.4 13.8" stroke="#f6cf9e" stroke-width="1.3" fill="none"/>
    <path d="m7.6 17.8-1.4-1.4-2.5 2.4.2 1.4 1.4.2z" fill="#ff4f6a"/><circle cx="3.6" cy="20.4" r="1.6" fill="#ff4f6a"/>`),
  speed: () => g(`<path d="M3 16.5v-5c0-.8.6-1.4 1.4-1.4h2.7l2.3-3.8c.4-.6 1.1-.8 1.7-.4l1.2.8 1.5 3.7 5.3 1.7c1.3.4 2.2 1.6 2.2 3v1.4z" fill="#ff4f6a"/>
    <path d="M3 16.5h18.4v1.8c0 .7-.5 1.2-1.2 1.2H4.2c-.7 0-1.2-.5-1.2-1.2z" fill="#fff"/><path d="M10 10.5l1.6 1M8.8 12.3l1.6 1" stroke="#fff" stroke-width="1.3" fill="none"/>
    <path d="M1 7.5h4M2 4.5h4" stroke="#7fd4ff" stroke-width="1.6" fill="none"/>`),
  skull: () => g(`<path d="M12 2.8a8 8 0 0 0-8 8c0 2.6 1.2 4.5 3 5.6v3.3c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-3.3c1.8-1.1 3-3 3-5.6a8 8 0 0 0-8-8z" fill="#fff"/>
    <circle cx="8.8" cy="11.4" r="2.1" fill="${INK}"/><circle cx="15.2" cy="11.4" r="2.1" fill="${INK}"/><path d="M12 14.3l-1 1.8h2zM10 20.7v-2M14 20.7v-2" fill="${INK}"/>`),
  house: () => g(`<path d="M5 10.5h14v10.5H5z" fill="#fff3d6"/><path d="M2 11.5 12 3.2l10 8.3-1.6 1.6L12 6.2l-8.4 6.9z" fill="#ff4f6a"/>
    <rect x="10" y="14.5" width="4" height="6.5" rx="1" fill="#2fa6ff"/>`),
  pedestal: () => g(`<path d="M5 6.5h14l-1.5 3h-11z" fill="#c7b8ff"/><path d="M7.5 9.5h9v8h-9z" fill="#e8e1ff"/><path d="M4.5 17.5h15v3.5h-15z" fill="#a07aff"/>
    <circle cx="12" cy="3.6" r="2" fill="#ffd23f"/><path d="M10.5 11.5v4M13.5 11.5v4" stroke="#c7b8ff" fill="none"/>`),
  rebirth: () => g(`<path d="M19.5 9.5A8 8 0 0 0 5.2 7.2M4.5 14.5a8 8 0 0 0 14.3 2.3" fill="none" stroke-width="3.6"/>
    <path d="M19.5 9.5A8 8 0 0 0 5.2 7.2M4.5 14.5a8 8 0 0 0 14.3 2.3" fill="none" stroke="#c070ff" stroke-width="1.8"/>
    <path d="M20.6 3.8v6.1h-6.1zM3.4 20.2v-6.1h6.1z" fill="#c070ff"/>`),
  cash: () => g(`<rect x="2" y="6" width="18" height="11" rx="2" fill="#3fc86a" transform="rotate(-8 11 11.5)"/><rect x="4" y="8" width="18" height="11" rx="2" fill="#5dff86"/>
    <circle cx="13" cy="13.5" r="3" fill="#2fc85a"/><path d="M6.5 10.5v.1M19.5 16.5v.1" stroke-width="2.4"/>`),
  play: () => g(`<path d="M7 4.2v15.6c0 .8.9 1.3 1.6.8l11.6-7.8c.6-.4.6-1.2 0-1.6L8.6 3.4C7.9 2.9 7 3.4 7 4.2z" fill="#fff"/>`),
  mouse: () => g(`<rect x="6" y="2.5" width="12" height="19" rx="6" fill="#fff"/><path d="M12 2.5v7M6 9.5h12" fill="none"/><path d="M12 5v2.5" stroke="#2fa6ff" stroke-width="2.4"/>`),
  sparkle: () => g(`<path d="M12 2.5c.8 4.6 2.9 6.7 7.5 7.5-4.6.8-6.7 2.9-7.5 7.5-.8-4.6-2.9-6.7-7.5-7.5 4.6-.8 6.7-2.9 7.5-7.5z" fill="#ffd23f"/><path d="M19 16.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z" fill="#fff"/>`, 1.5),
  check: () => g(`<circle cx="12" cy="12" r="9.5" fill="#2fc85a"/><path d="m7.4 12.4 3.1 3.1 6.2-6.6" fill="none" stroke="#fff" stroke-width="2.8"/>`),
  shield: () => g(`<path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z" fill="#2fc85a"/><path d="m8.3 12 2.6 2.6 4.8-5.1" fill="none" stroke="#fff" stroke-width="2.6"/>`),
  warn: () => g(`<path d="M10.3 3.6 2.4 18c-.8 1.4.2 3 1.8 3h15.6c1.6 0 2.6-1.6 1.8-3L13.7 3.6c-.8-1.4-2.6-1.4-3.4 0z" fill="#ffd23f"/><path d="M12 8.5v5.5" stroke-width="2.6"/><circle cx="12" cy="17.4" r="1.4" fill="${INK}" stroke="none"/>`),
  run: () => g(`<circle cx="15" cy="4.6" r="2.4" fill="#ffd23f"/><path d="m6 12 3-3.5 5 .5 2.5 4 3.5.5M13 9.5l-2.5 5 3.5 3-1 4.5M10.5 14.5l-2.5 3.5-4.5-.5" fill="none" stroke-width="4"/>
    <path d="m6 12 3-3.5 5 .5 2.5 4 3.5.5M13 9.5l-2.5 5 3.5 3-1 4.5M10.5 14.5l-2.5 3.5-4.5-.5" fill="none" stroke="#ffd23f" stroke-width="2"/>`),
  soundOn: () => g(`<path d="M3.5 9h3.5l5-4.5v15L7 15H3.5z" fill="#fff"/><path d="M15.5 8.5c1.6 1.8 1.6 5.2 0 7M18.5 5.5c3.3 3.5 3.3 9.5 0 13" fill="none" stroke-width="2.2"/>`),
  soundOff: () => g(`<path d="M3.5 9h3.5l5-4.5v15L7 15H3.5z" fill="#fff"/><path d="m15.5 9 5.5 6M21 9l-5.5 6" fill="none" stroke="#ff3f5c" stroke-width="2.6"/>`),
  close: () => g(`<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="#fff" stroke-width="3.2"/>`),
  heavy: () => g(`<path d="M6.5 8.5h11l3 12.5h-17z" fill="#8a8fa3"/><circle cx="12" cy="6" r="3" fill="none" stroke-width="2.4"/><path d="M9.5 15h5" stroke="#d6d9e4" fill="none"/>`),
  target: () => g(`<circle cx="12" cy="12" r="9" fill="#ff4f6a"/><circle cx="12" cy="12" r="5.5" fill="#fff"/><circle cx="12" cy="12" r="2.2" fill="#ff4f6a"/>`),
  key: () => g(`<circle cx="7.5" cy="12" r="4.5" fill="#ffd23f"/><path d="M12 12h9.5v3M18.5 12v2.5" fill="none" stroke-width="2.4"/><circle cx="7.5" cy="12" r="1.5" fill="${INK}"/>`),
  boost: () => g(`<path d="M12 2.5 3 7v10l9 4.5 9-4.5V7z" fill="#ff4fa0"/><path d="M8.4 10.2c.1-1.1 1-1.8 2-1.8s1.9.7 1.9 1.7c0 1.7-3.9 2.8-3.9 5h4M13.8 9.2l3.6 5.8M17.4 9.2l-3.6 5.8" fill="none" stroke="#fff" stroke-width="1.7"/>`),
};

/** icon(name) -> inline SVG string (sized 1em by CSS class .ico). Unknown names return ''. */
export function icon(name, cls = '') {
  const f = P[name]; if (!f) return '';
  return `<svg class="ico ico-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${f()}</svg>`;
}

/** Faceted rarity gem. color = css color; rainbow = true for the Secret tier. */
export function gem(color = '#3fa8ff', rainbow = false, cls = '') {
  let fill = color, defs = '';
  if (rainbow) {
    const id = 'gemR' + (++uid);
    defs = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4f4f"/><stop offset=".3" stop-color="#ffee4a"/><stop offset=".55" stop-color="#5ee06a"/><stop offset=".8" stop-color="#3fa8ff"/><stop offset="1" stop-color="#c070ff"/></linearGradient></defs>`;
    fill = `url(#${id})`;
  }
  return `<svg class="ico gem${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${defs}${g(`<path d="M6.5 3.5h11l4.5 6-10 11.5L2 9.5z" fill="${fill}"/>
    <path d="M2 9.5h20M9.5 3.5 7.6 9.5 12 21l4.4-11.5-1.9-6" fill="none" stroke-width="1.2" opacity=".55"/><path d="M7 5.5 5 8.5" stroke="#fff" stroke-width="1.6" opacity=".8" fill="none"/>`)}</svg>`;
}
/** gem for a RARITIES entry */
export const rarityGem = (R, cls = '') => gem(R.color, !!R.rainbow, cls);

// ---- world badges (keyed by WORLDS[i].look)
const WB = {
  day: `<circle cx="12" cy="12" r="4.6" fill="#ffe14a"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6" stroke-width="2.2"/>`,
  sunset: `<path d="M5 15a7 7 0 0 1 14 0z" fill="#ffd23f"/><path d="M2.5 15h19M5 18.5h14M8 21.5h8" stroke-width="2"/><path d="M12 4v2.5M5.2 7.2 6.8 8.8M18.8 7.2l-1.6 1.6" stroke-width="2"/>`,
  night: `<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5 7 7 0 0 1-5-13.5z" fill="#d8f4ff"/><path d="m18 5.5.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#ff4fd8" stroke-width="1"/>`,
  storm: `<path d="M6.5 15.5a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1 3.6 3.6 0 0 1 .7 7.1L17 15.5z" fill="#e2e8f0"/><path d="M12.5 12.5 9.5 17h3l-1.5 4.5 4.5-6h-3l1.5-3z" fill="#ffd23f"/>`,
  cosmic: `<circle cx="12" cy="12" r="5.6" fill="#ff9ae6"/><ellipse cx="12" cy="12" rx="10" ry="3.2" fill="none" stroke-width="2.6" transform="rotate(-20 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="3.2" fill="none" stroke="#ffd23f" stroke-width="1.2" transform="rotate(-20 12 12)"/>`,
};
/** round badge for a WORLDS entry: colored disc + themed glyph */
export function worldBadge(Wd, cls = '') {
  const id = 'wb' + (++uid), col = Wd.color || '#2fa6ff';
  const glyph = WB[Wd.look] || WB.day;
  return `<svg class="wbadge${cls ? ' ' + cls : ''}" viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity=".75"/></radialGradient></defs>
    <circle cx="24" cy="24" r="21" fill="${col}" stroke="${INK}" stroke-width="3"/><circle cx="24" cy="24" r="21" fill="url(#${id})"/>
    <g transform="translate(9 9) scale(1.25)" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" fill="none">${glyph}</g></svg>`;
}

// ---- emoji -> our own symbols, everywhere (see symbols.js)
Object.assign(P, GLYPHS);
_setSvgSource(name => icon(name));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** replace emojis in an HTML string with SVG symbols */
export function iconize(html) {
  const out = String(html);
  if (!hasEmoji(out)) return out;
  return out.replace(EMOJI_RE, m => { const n = glyphFor(m); return n ? icon(n) : m; });
}
/** plain text -> escaped HTML with icons */
export const iconText = text => iconize(esc(text));

// ---- static markup hydration: <i data-icon="coin"></i> becomes the SVG.
function hydrate(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon); });
}
// ---- live replacement: any emoji that ends up in the page's text (toasts, chat, panels, buttons…) is swapped
// for its symbol as soon as it's inserted, so every system automatically uses the game's own symbol set.
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CANVAS', 'svg', 'SVG']);
const tpl = typeof document !== 'undefined' ? document.createElement('template') : null;
function fixText(node) {
  const t = node.data; if (!t || !hasEmoji(t)) return;
  const par = node.parentNode; if (!par || SKIP.has(par.nodeName) || (par.closest && par.closest('svg'))) return;
  let last = 0, out = null; EMOJI_RE.lastIndex = 0;
  for (let m; (m = EMOJI_RE.exec(t));) {
    const n = glyphFor(m[0]); if (!n) continue;
    out ||= document.createDocumentFragment();
    if (m.index > last) out.append(t.slice(last, m.index));
    tpl.innerHTML = icon(n, 'sym'); out.append(tpl.content);
    last = m.index + m[0].length;
  }
  if (!out) return;
  if (last < t.length) out.append(t.slice(last));
  par.replaceChild(out, node);
}
function scan(root) {
  if (root.nodeType === 3) return fixText(root);
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
  while (w.nextNode()) list.push(w.currentNode);
  for (const n of list) fixText(n);
}
if (typeof document !== 'undefined') {
  const boot = () => {
    hydrate(); scan(document.body);
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') fixText(m.target); else for (const n of m.addedNodes) scan(n); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}
