// small UI helpers: icons, menus, modals, toasts
// Icons: Iconly "Light" outlines (24px grid, 1.5 stroke); a few simple glyphs are drawn by hand.
const s = (d, cls) => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const p = (d, cls) => s(`<path d="${d}"/>`, cls);
const LOCK_BODY = 'M15.68 21.25H8.04C5.95 21.25 4.25 19.55 4.25 17.46V13.17C4.25 11.07 5.95 9.38 8.04 9.38H15.68C17.78 9.38 19.48 11.07 19.48 13.17V17.46C19.48 19.55 17.78 21.25 15.68 21.25ZM11.86 14.2V16.42';
export const ICON = {
  menu: p('M3 6.5C3 3.87 3.03 3 6.5 3C9.97 3 10 3.87 10 6.5C10 9.13 10.01 10 6.5 10C2.99 10 3 9.13 3 6.5ZM14 6.5C14 3.87 14.03 3 17.5 3C20.97 3 21 3.87 21 6.5C21 9.13 21.01 10 17.5 10C13.99 10 14 9.13 14 6.5ZM3 17.5C3 14.87 3.03 14 6.5 14C9.97 14 10 14.87 10 17.5C10 20.13 10.01 21 6.5 21C2.99 21 3 20.13 3 17.5ZM14 17.5C14 14.87 14.03 14 17.5 14C20.97 14 21 14.87 21 17.5C21 20.13 21.01 21 17.5 21C13.99 21 14 20.13 14 17.5Z'),
  plus: p('M12 6v12M6 12h12'),
  minus: p('M6 12h12'),
  plusSquare: p('M12 8.33v7.32M15.67 11.99H8.33M16.69 2H7.31C4.05 2 2 4.31 2 7.59V16.41C2 19.69 4.04 22 7.31 22H16.69C19.96 22 22 19.69 22 16.41V7.59C22 4.31 19.96 2 16.69 2Z'),
  x: p('M6.5 6.5l11 11M17.5 6.5l-11 11'),
  check: p('M5.5 12.5l4.5 4.5l8.5-9.5'),
  // the sidebar sits on the right (RTL start): a panel drawn on the right, mirroring the vertical-tabs icon
  sidebar: s('<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M15 3v18M17.5 8h1M17.5 11.5h1M17.5 15h1"/>'),
  history: p('M21.25 12a9.25 9.25 0 1 1-18.5 0a9.25 9.25 0 0 1 18.5 0zM15.43 14.94l-3.77-2.25V7.85'),
  clock: p('M21.25 12a9.25 9.25 0 1 1-18.5 0a9.25 9.25 0 0 1 18.5 0zM15.43 14.94l-3.77-2.25V7.85'),
  code: p('M7.78 3H16.22C19.17 3 21 5.08 21 8.03V15.97C21 18.92 19.17 21 16.22 21H7.78C4.84 21 3 18.92 3 15.97V8.03C3 5.08 4.84 3 7.78 3ZM9.94 9.35L7.29 12L9.94 14.65M14.06 9.35L16.71 12L14.06 14.65'),
  palette: s('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  file: p('M15.72 16.22H8.5M15.72 12.04H8.5M11.25 7.86H8.5M15.91 2.75H8.22C5.46 2.77 3.75 4.59 3.75 7.36V16.55C3.75 19.34 5.47 21.16 8.26 21.16H15.95C18.71 21.14 20.42 19.32 20.42 16.55V7.36C20.42 4.57 18.69 2.75 15.91 2.75Z'),
  folder: p('M21.42 15.73C21.42 19.31 19.31 21.42 15.73 21.42H7.95C4.36 21.42 2.25 19.31 2.25 15.73V7.93C2.25 4.36 3.56 2.25 7.14 2.25H9.14C9.86 2.25 10.54 2.59 10.97 3.16L11.88 4.38C12.31 4.95 12.99 5.29 13.71 5.29H16.54C20.12 5.29 21.45 7.12 21.45 10.77L21.42 15.73ZM7.48 14.46H16.22'),
  chevron: p('M15.5 5L8.5 12L15.5 19'),
  chevDown: p('M19 8.5L12 15.5L5 8.5'),
  chevUp: p('M5 15.5L12 8.5L19 15.5'),
  cut: p('M8.5 7.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0zM8.5 16.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0zM8 9l12 8M8 15l12-8'),
  paste: p('M9 4.5h6a1 1 0 0 1 1 1v1.5H8V5.5a1 1 0 0 1 1-1zM8 6H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1'),
  pastePlain: p('M9 4.5h6a1 1 0 0 1 1 1v1.5H8V5.5a1 1 0 0 1 1-1zM8 6H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1M9 12.5h6M9 16h4'),
  bold: p('M7.29 5H11.8C13.63 5 15.26 6.34 15.44 8.16C15.64 10.24 14 12 11.95 12H7.29V5ZM7.29 12H13.06C14.89 12 16.52 13.34 16.69 15.16C16.89 17.24 15.25 19 13.21 19H7.29V12Z'),
  italic: p('M13 19H7M17 5H11M10 19L14 5'),
  link: p('M9.63 6.79H8.21C5.34 6.79 3 9.13 3 12C3 14.86 5.34 17.21 8.21 17.21H9.63M14.37 6.79H15.79C18.66 6.79 21 9.13 21 12C21 14.86 18.66 17.21 15.79 17.21H14.37M8.5 12h7'),
  quote: p('M12.31 19.52C13.28 18.82 14 17.78 14.31 16.63C14.53 15.82 14.54 14.89 14.05 14.21C13.59 13.55 12.7 13.23 11.93 13.45C10.51 13.84 10.05 15.63 11.01 16.71C11.37 17.12 11.9 17.37 12.45 17.39M18.85 19.52C19.82 18.82 20.54 17.78 20.86 16.63C21.08 15.82 21.08 14.89 20.6 14.21C20.14 13.55 19.24 13.23 18.47 13.45C17.06 13.84 16.6 15.63 17.55 16.71C17.92 17.12 18.45 17.37 19 17.39M7.91 18.31H3M20.45 9.09H3M7.91 13.71H3M20.45 4.49H3'),
  ol: p('M16 16C16 14.9 16.9 14 18 14C19.1 14 20 14.9 20 16C20 16.48 19.79 17.21 19.05 17.88C18.31 18.54 16.31 20 16.31 20H20M18 10V4L16.15 5.49M4 6H12.67M4 12H12.67M4 18H12.67'),
  ul: p('M4 18H16M4 12H16M4 6H16M20 6h.01M20 12h.01M20 18h.01'),
  strike: p('M8.11 15.5C8.11 17.43 9.85 19 12 19C14.15 19 15.89 17.43 15.89 15.5C15.89 13.42 14.39 12.62 12.72 12M8.41 9.2C8.35 8.97 8.32 8.74 8.32 8.5C8.32 6.57 9.85 5 12 5C13.65 5 14.94 5.93 15.44 7.23M5.88 12H18.12'),
  table: p('M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM4 9.5h16M4 14.5h16M12 4v16'),
  formula: p('M17 5H8l5 7l-5 7h9'),
  diagram: p('M6 4h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 15h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zM7.5 9v5.5a3 3 0 0 0 3 3H14'),
  hr: p('M4 12h16'),
  alignL: p('M4 6h16M4 12h10M4 18h13'),
  alignC: p('M4 6h16M7 12h10M5.5 18h13'),
  alignR: p('M4 6h16M10 12h10M7 18h13'),
  group: p('M3 6.5C3 3.87 3.03 3 6.5 3C9.97 3 10 3.87 10 6.5C10 9.13 10.01 10 6.5 10C2.99 10 3 9.13 3 6.5ZM14 6.5C14 3.87 14.03 3 17.5 3C20.97 3 21 3.87 21 6.5C21 9.13 21.01 10 17.5 10C13.99 10 14 9.13 14 6.5ZM3 17.5C3 14.87 3.03 14 6.5 14C9.97 14 10 14.87 10 17.5C10 20.13 10.01 21 6.5 21C2.99 21 3 20.13 3 17.5ZM14 17.5C14 14.87 14.03 14 17.5 14C20.97 14 21 14.87 21 17.5C21 20.13 21.01 21 17.5 21C13.99 21 14 20.13 14 17.5Z'),
  swap: p('M16.84 20.16V6.55M20.92 16.07L16.84 20.16L12.76 16.07M6.91 3.83V17.45M2.83 7.93L6.91 3.83L10.99 7.93'),
  refresh: s('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  search: p('M20.76 11.77a8.99 8.99 0 1 1-17.98 0a8.99 8.99 0 0 1 17.98 0zM18.02 18.49L21.54 22'),
  zoom: p('M20.76 11.77a8.99 8.99 0 1 1-17.98 0a8.99 8.99 0 0 1 17.98 0zM18.02 18.49L21.54 22M8.5 11.77h6.5M11.77 8.5v6.5'),
  lock: p('M16.42 9.45V7.3C16.42 4.79 14.39 2.75 11.87 2.75C9.36 2.74 7.31 4.77 7.3 7.28V9.45M' + LOCK_BODY.slice(1)),
  unlock: p('M16.1 5.6C15.4 3.93 13.77 2.75 11.87 2.75C9.36 2.74 7.31 4.77 7.3 7.28V9.45M' + LOCK_BODY.slice(1)),
  copy: p('M14.96 5.47C14.73 4 13.67 3 12.06 3H6.87C5.06 3 3.92 4.29 3.92 6.1V12.8C3.92 14.45 4.87 15.67 6.41 15.86M17.14 8.11H11.94C10.13 8.11 8.99 9.39 8.99 11.21V17.9C8.99 19.72 10.12 21 11.94 21H17.13C18.95 21 20.08 19.72 20.08 17.9V11.21C20.08 9.39 18.95 8.11 17.14 8.11Z'),
  save: p('M15.85 3.74C15.39 3.27 14.76 3 14.11 3H7.78C4.84 3 3 5.08 3 8.03V15.97C3 18.92 4.83 21 7.78 21H16.22C19.17 21 21 18.92 21 15.97V10.08C21 9.46 20.76 8.86 20.33 8.4L15.85 3.74ZM13.9 8.1H8.37M17.02 20.94V16.27C17.02 14.63 15.99 13.96 14.35 13.96H9.65C8 13.96 6.98 14.63 6.98 16.27V20.94'),
  download: p('M16.76 8.13H17.69C19.72 8.13 21.37 9.78 21.37 11.81V16.7C21.37 18.73 19.73 20.37 17.7 20.37H6.56C4.52 20.37 2.87 18.72 2.87 16.69V11.8C2.87 9.77 4.52 8.13 6.55 8.13H7.49M12.12 3.4V15.44M15.03 12.51L12.12 15.44L9.2 12.51'),
  keyboard: p('M16.23 20.25H7.76C4.82 20.25 2.99 18.61 3 15.59V8.42C3 5.4 4.82 3.75 7.77 3.75H16.23C19.17 3.75 21 5.43 21 8.5V15.59C21 18.61 19.17 20.25 16.23 20.25ZM14.45 16.14H9.55M12 11.98h.01M12 8.59h.01M7.55 11.98h.01M7.55 8.59h.01M16.45 11.98h.01M16.45 8.59h.01'),
  tickSquare: p('M16.33 2.75H7.67C4.64 2.75 2.75 4.89 2.75 7.92V16.08C2.75 19.11 4.64 21.25 7.67 21.25H16.33C19.36 21.25 21.25 19.11 21.25 16.08V7.92C21.25 4.89 19.36 2.75 16.33 2.75ZM8.44 12L10.81 14.37L15.56 9.63'),
  textSize: p('M9.54 3.86V17.15M6.66 17.15H12.55M18.97 11L21 13.03M18.97 11L16.94 13.03M18.97 11V20.14M18.97 20.14L16.94 18.11M18.97 20.14L21 18.11M3 6.2V3.86H16.21V6.2'),
  settings: s('<g transform="translate(2.5 1.5)"><path d="M18.31 6.12L17.68 5.04C17.16 4.13 15.99 3.81 15.08 4.34C14.64 4.6 14.12 4.67 13.63 4.54C13.14 4.41 12.72 4.1 12.47 3.66C12.3 3.38 12.21 3.07 12.21 2.75C12.23 2.23 12.03 1.73 11.67 1.36C11.31 .99 10.81 .78 10.3 .78H9.04C8.54 .78 8.05 .98 7.69 1.34C7.34 1.7 7.14 2.18 7.14 2.69C7.12 3.74 6.27 4.58 5.23 4.58C4.9 4.57 4.59 4.48 4.31 4.32C3.4 3.8 2.23 4.11 1.7 5.03L1.03 6.12C.51 7.04 .82 8.2 1.73 8.73C2.32 9.07 2.69 9.71 2.69 10.39C2.69 11.07 2.32 11.7 1.73 12.05C.82 12.57 .51 13.74 1.03 14.65L1.67 15.73C1.91 16.18 2.33 16.51 2.82 16.65C3.31 16.79 3.83 16.72 4.27 16.48C4.71 16.22 5.23 16.15 5.72 16.28C6.21 16.41 6.62 16.73 6.87 17.17C7.04 17.45 7.13 17.76 7.13 18.09C7.13 19.14 7.99 20 9.04 20H10.3C11.35 20 12.21 19.15 12.21 18.1C12.21 17.59 12.41 17.1 12.77 16.74C13.13 16.38 13.62 16.18 14.12 16.18C14.45 16.19 14.76 16.28 15.04 16.44C15.95 16.97 17.12 16.65 17.65 15.74L18.31 14.65C18.56 14.21 18.63 13.69 18.5 13.2C18.37 12.71 18.05 12.29 17.61 12.04C17.17 11.78 16.85 11.37 16.72 10.88C16.59 10.39 16.66 9.87 16.92 9.43C17.08 9.14 17.32 8.9 17.61 8.73C18.52 8.2 18.83 7.04 18.31 6.13V6.12Z"/><circle cx="9.68" cy="10.39" r="2.64"/></g>'),
  trash: p('M19.32 9.47C19.32 9.47 18.78 16.2 18.47 19.04C18.32 20.4 17.48 21.19 16.11 21.21C13.5 21.26 10.89 21.26 8.28 21.21C6.96 21.18 6.14 20.38 5.99 19.05C5.67 16.19 5.13 9.47 5.13 9.47M20.71 6.24H3.75M17.44 6.24C16.66 6.24 15.98 5.68 15.83 4.92L15.58 3.7C15.43 3.14 14.92 2.75 14.35 2.75H10.11C9.53 2.75 9.03 3.14 8.88 3.7L8.63 4.92C8.48 5.68 7.8 6.24 7.02 6.24'),
  pin: s('<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v5"/>'),
  vtabs: s('<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M9 3v18M5.5 8h1M5.5 11.5h1M5.5 15h1"/>'),
  window: s('<rect x="3" y="4" width="18" height="16" rx="4.5"/><path d="M3 9h18"/>'),
  fullscreen: p('M9 3.5H7.5C5.3 3.5 3.5 5.3 3.5 7.5V9M15 3.5h1.5c2.2 0 4 1.8 4 4V9M9 20.5H7.5c-2.2 0-4-1.8-4-4V15M15 20.5h1.5c2.2 0 4-1.8 4-4V15'),
  image: s('<rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5"/><circle cx="8.6" cy="8.8" r="1.8"/><path d="M3.2 16.6l3.4-3.3c.8-.8 2-.8 2.8 0l1.5 1.5 3.5-3.6c.8-.8 2.1-.8 2.9 0l3.5 3.6"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  info: s('<circle cx="12" cy="12" r="9.25"/><path d="M12 11v5.5M12 7.6h.01"/>'),
  warn: s('<path d="M12 3.6L2.9 19.4h18.2z"/><path d="M12 10v4.4M12 17h.01"/>'),
};

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

const openMenus = [];
// "Menu aim": if a submenu is open and the pointer is heading toward it, wait before switching,
// so crossing another item on the way (e.g. «جدول» on the way to the «پاراگراف» submenu) does nothing.
let aimTimer = null;
let lastPts = [];
document.addEventListener('mousemove', (e) => { lastPts.push([e.clientX, e.clientY, performance.now()]); if (lastPts.length > 8) lastPts.shift(); }, true);
function headingToSub(level) {
  const sub = openMenus[level + 1];
  if (!sub || lastPts.length < 2) return false;
  // direction from the recent movement only (last ~120 ms), never from an old resting point
  const now = lastPts[lastPts.length - 1][2];
  if (performance.now() - now > 90) return false; // pointer has stopped: the user chose this item
  const recent = lastPts.filter((p) => now - p[2] <= 120);
  const pts = recent.length >= 2 ? recent : lastPts.slice(-2);
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  const r = sub.getBoundingClientRect();
  const subLeft = r.right < x1; // submenu sits to the left (RTL)
  const towardX = subLeft ? x1 < x0 : x1 > x0;
  const edge = subLeft ? r.right : r.left;
  const dx = Math.abs(edge - x1) || 1;
  // inside the triangle from the pointer to the submenu's near corners
  const slopeTop = (r.top - y1) / dx, slopeBottom = (r.bottom - y1) / dx;
  const mv = Math.abs(x1 - x0) || 1;
  const slope = (y1 - y0) / mv;
  return towardX && slope >= slopeTop - 0.1 && slope <= slopeBottom + 0.1;
}
function aim(level, fn, item) {
  clearTimeout(aimTimer);
  if (headingToSub(level)) {
    // only act if the pointer actually stayed on this item
    const stillHere = () => !item || item.matches(':hover');
    aimTimer = setTimeout(() => {
      if (!stillHere()) return;
      if (!headingToSub(level)) fn(); else aimTimer = setTimeout(() => { if (stillHere()) fn(); }, 350);
    }, 250);
  } else fn();
}
let outsideHandler = null;
let onMenuClose = null;
export const menuOpen = () => openMenus.length > 0;
export function closeMenu() {
  while (openMenus.length) openMenus.pop().remove();
  if (onMenuClose) { const f = onMenuClose; onMenuClose = null; f(); }
  if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler, true); outsideHandler = null; }
}
function closeFrom(level) { while (openMenus.length > level) openMenus.pop().remove(); }

/** 'Ctrl+Shift+O' → quiet key chips */
export function kbd(key) {
  const parts = String(key).split(/\s*\+\s*(?=\S)/).filter(Boolean);
  return el('span', { class: 'kb', dir: 'ltr' }, parts.map((k) => el('kbd', {}, k)));
}
/**
 * items: 'sep' | {header} | {label, icon, key, run, checked, disabled, danger, badge, sub:[...], style}
 *   | {label, icon, key, switch: () => bool, run}        a switch row: toggles in place, the menu stays open
 *   | {label, icon, stepper: {value: () => text, up, down}}  inline + value − (plus on the right)
 *   | {tiles: [{icon, label, run, title}]}                quick-action tiles
 *   | {grid: [{html, title, run, active, mirror, disabled}]}
 * x,y is the anchor's right/top edge (menus open toward the left, as in an RTL app)
 */
function buildMenu(items, level, detached = false) {
  const m = el('div', { class: 'menu', dir: 'rtl' });
  if (items.some((it) => it && it.icon)) m.classList.add('has-icons');
  const closeSubs = (node) => aim(level, () => { closeFrom(level + 1); m.querySelectorAll('.mi.open').forEach((n) => n.classList.remove('open')); }, node);
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { m.append(el('div', { class: 'sep' })); continue; }
    if (it.header) { m.append(el('div', { class: 'mh' }, it.header)); continue; }
    if (it.note) { m.append(el('div', { class: 'mnote' }, it.note)); continue; }
    if (it.tiles) {
      const g = el('div', { class: 'mtiles', style: `--n:${it.tiles.length}` });
      for (const b of it.tiles) {
        const btn = el('button', { class: 'mt', title: b.title || null, disabled: !!b.disabled }, el('span', { class: 'ic', html: b.icon }), el('span', {}, b.label));
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => { closeMenu(); b.run(); });
        g.append(btn);
      }
      g.addEventListener('mouseenter', () => closeSubs(g));
      m.append(g);
      continue;
    }
    if (it.columns) {
      // side-by-side lists under small headers (e.g. table rows | columns)
      const wrap = el('div', { class: 'mcols' });
      for (const col of it.columns) {
        const c = el('div', { class: 'mcol' }, el('div', { class: 'mh' }, col.header));
        const sub = buildMenu(col.items, level, true);
        c.append(...sub.childNodes);
        wrap.append(c);
      }
      m.append(wrap);
      continue;
    }
    if (it.field) {
      const f = it.field;
      const inp = el('input', { type: 'text', value: f.value || '', placeholder: f.placeholder || '', dir: 'auto', 'aria-label': f.label, spellcheck: 'false' });
      inp.addEventListener('input', () => f.input(inp.value));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeMenu(); } });
      m.append(el('label', { class: 'mfield' }, el('span', { class: 'mh' }, f.label), inp));
      if (f.focus) setTimeout(() => { inp.focus(); inp.select(); }, 0);
      continue;
    }
    if (it.swatches) {
      const w = it.swatches;
      const row = el('div', { class: 'mswatches', role: 'group', 'aria-label': w.label });
      const paint = (id) => row.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      if (w.glyph) row.classList.add('glyphs');
      for (const c of w.items) {
        const b = el('button', { 'data-id': c.id, title: c.name, 'aria-label': c.name, class: c.none ? 'none' : null,
          style: w.glyph === 'text' ? `color:${c.color || 'var(--fg)'}` : `--sw:${c.color || 'transparent'}`, html: c.none ? ICON.x : null }, w.glyph && !c.none ? 'آ' : null);
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => { if (w.close) closeMenu(); w.pick(c.id); if (!w.close) paint(c.id); });
        row.append(b);
      }
      paint(w.value);
      m.append(el('div', { class: 'mh' }, w.label), row);
      continue;
    }
    if (it.grid) {
      const g = el('div', { class: 'mgrid' });
      for (const b of it.grid) {
        const btn = el('button', { class: 'mg' + (b.active ? ' on' : '') + (b.mirror ? ' mirror' : ''), title: b.title, html: b.html });
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => { closeMenu(); b.run(); });
        if (b.disabled) btn.disabled = true;
        g.append(btn);
      }
      g.addEventListener('mouseenter', () => closeSubs(g));
      m.append(g);
      continue;
    }
    const mi = el('div', { class: 'mi' + (it.checked ? ' checked' : '') + (it.sub ? ' has-sub' : '') + (it.danger ? ' danger' : '') },
      m.classList.contains('has-icons') ? el('span', { class: 'ic', html: it.icon || '' }) : null,
      el('span', { class: 'lb', style: it.style || null }, it.label),
      it.badge ? el('span', { class: 'badge' }, it.badge) : null,
      it.count ? el('span', { class: 'ct' }, it.count) : null,
      it.key ? kbd(it.key) : null,
      it.checked ? el('span', { class: 'tick', html: ICON.check }) : null,
      it.sub ? el('span', { class: 'arrow', html: ICON.chevron }) : null);
    mi.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor selection
    if (it.disabled) mi.classList.add('disabled');
    else if (it.segment) {
      mi.classList.add('static');
      const sg = el('span', { class: 'mseg', role: 'group', 'aria-label': it.label });
      for (const b of it.segment) {
        const btn = el('button', { class: b.on ? 'on' : '', title: b.title, 'aria-label': b.title, html: b.html });
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); b.run(); });
        sg.append(btn);
      }
      mi.append(sg);
      mi.addEventListener('mouseenter', () => closeSubs(mi));
    } else if (it.stepper) {
      const val = el('span', { class: 'sv' }, it.stepper.value());
      const step = (fn) => (e) => { e.stopPropagation(); fn(); val.textContent = it.stepper.value(); };
      mi.classList.add('static');
      mi.append(el('span', { class: 'mstep' },
        el('button', { title: 'بیشتر', html: ICON.plus, onclick: step(it.stepper.up) }), val,
        el('button', { title: 'کمتر', html: ICON.minus, onclick: step(it.stepper.down) })));
      mi.addEventListener('mouseenter', () => closeSubs(mi));
    } else if (it.switch) {
      const sw = el('span', { class: 'tg' + (it.switch() ? ' on' : ''), role: 'switch', 'aria-checked': String(!!it.switch()) });
      mi.append(sw);
      mi.addEventListener('mouseenter', () => closeSubs(mi));
      mi.addEventListener('click', async () => {
        await it.run();
        const on = !!it.switch();
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-checked', String(on));
      });
    } else if (it.sub) {
      const open = () => {
        clearTimeout(aimTimer);
        if (mi.classList.contains('open')) return;
        closeFrom(level + 1);
        m.querySelectorAll('.mi.open').forEach((n) => n.classList.remove('open'));
        mi.classList.add('open');
        const sub = buildMenu(it.sub, level + 1);
        const r = mi.getBoundingClientRect();
        place(sub, r.left - 6, r.top - 9, r.right + 6);
      };
      mi.addEventListener('mouseenter', () => aim(level, open, mi));
      mi.addEventListener('click', open);
    } else {
      mi.addEventListener('mouseenter', () => closeSubs(mi));
      mi.addEventListener('mouseleave', () => clearTimeout(aimTimer));
      mi.addEventListener('click', () => { closeMenu(); it.run(); });
    }
    m.append(mi);
  }
  // reaching the submenu cancels any pending switch in the parent menu
  if (detached) return m;
  m.addEventListener('mouseenter', () => clearTimeout(aimTimer));
  document.body.append(m);
  openMenus.push(m);
  return m;
}
/** place menu so its right edge sits at x (or flip to the other side of `altX` if there is no room) */
function place(m, x, y, altX) {
  const r = m.getBoundingClientRect();
  let left = x - r.width;
  if (left < 14) left = altX != null ? Math.min(altX, window.innerWidth - r.width - 14) : 14;
  left = Math.min(Math.max(14, left), window.innerWidth - r.width - 14);
  m.style.left = left + 'px';
  m.style.top = Math.max(10, Math.min(y, window.innerHeight - r.height - 10)) + 'px';
}
export function showMenu(items, x, y, onClose = null) {
  closeMenu();
  onMenuClose = onClose;
  const m = buildMenu(items, 0);
  place(m, x, y);
  setTimeout(() => {
    outsideHandler = (e) => { if (!openMenus.some((n) => n.contains(e.target))) closeMenu(); };
    document.addEventListener('mousedown', outsideHandler, true);
  }, 0);
  return m;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenus.length) { e.stopPropagation(); closeMenu(); } }, true);

/** buttons: [{label, value, primary, danger}] → resolves with value (Escape → null) */
export function modal({ title, text, buttons, input, body, bodyAfter }) {
  return new Promise((resolve) => {
    const inp = input != null ? el('input', { type: 'text', value: input, dir: 'auto' }) : null;
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const row = el('div', { class: 'row' }, buttons.map((b) =>
      el('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), onclick: () => done(inp && b.primary ? inp.value : b.value) }, b.label)));
    const box = el('div', { class: 'modal', dir: 'rtl' },
      el('div', { class: 'm-body' }, el('h3', {}, title), text ? el('p', {}, text) : null, bodyAfter ? inp : (body || null), bodyAfter ? (body || null) : inp), row);
    const ov = el('div', { class: 'overlay' }, box);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && (inp || !body)) { e.preventDefault(); e.stopPropagation(); const p = buttons.find((b) => b.primary); if (p) done(inp ? inp.value : p.value); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
    document.body.append(ov);
    (inp || row.querySelector('.primary') || row.lastChild).focus();
    if (inp) inp.select();
  });
}

let toastT = null;
const TOAST_ICON = { ok: ICON.check, info: ICON.info, warn: ICON.warn, err: ICON.warn };
/**
 * action: { label, run } (or a list) shows pill buttons inside the toast.
 * kind: 'ok' | 'info' | 'warn' | 'err' adds a small coloured icon.
 */
export function toast(msg, ms = 2200, action = null, kind = null) {
  if (typeof ms === 'string') { kind = ms; ms = 2200; }
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el('div', { class: 'toast' + (kind ? ' k-' + kind : ''), dir: 'rtl', role: 'status' },
    kind && TOAST_ICON[kind] ? el('span', { class: 'ti', html: TOAST_ICON[kind] }) : null, el('span', { class: 'tm' }, msg));
  const actions = !action ? [] : Array.isArray(action) ? action : [action];
  if (actions.length) t.classList.add('has-action');
  for (const a of actions) t.append(el('button', { class: 'toast-btn', onclick: () => { t.remove(); a.run(); } }, a.label));
  document.body.append(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), ms);
}

const faNum = new Intl.NumberFormat('fa-IR');
export const fa = (n) => faNum.format(n);
export const faTime = (t) => new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(t);
/** «امروز» / «دیروز» / full date */
export function faDayRel(t) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const days = Math.round((d0 - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  return days === 0 ? 'امروز' : days === 1 ? 'دیروز' : faDay(t);
}
export const faClock = (t) => new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(t);
export const faDay = (t) => new Intl.DateTimeFormat('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(t);
export const basename = (p) => p.split(/[\\/]/).pop();
export const dirname = (p) => p.replace(/[\\/][^\\/]*$/, '');
export function relTime(t) {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'همین الان';
  if (d < 3600) return `${fa(Math.floor(d / 60))} دقیقه پیش`;
  if (d < 86400) return `${fa(Math.floor(d / 3600))} ساعت پیش`;
  return faDay(t);
}
