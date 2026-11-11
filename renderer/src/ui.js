// small UI helpers: icons, menus, modals, toasts
const s = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON = {
  menu: s('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  x: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  sidebar: s('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  history: s('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>'),
  code: s('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>'),
  palette: s('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  file: s('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  folder: s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  chevron: s('<path d="M9 6l6 6-6 6"/>'),
  refresh: s('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  lock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  pin: s('<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v5"/>'),
  vtabs: s('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M5 8h2M5 11h2M5 14h2"/>'),
  clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  unlock: s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
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
export function closeMenu() {
  while (openMenus.length) openMenus.pop().remove();
  if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler, true); outsideHandler = null; }
}
function closeFrom(level) { while (openMenus.length > level) openMenus.pop().remove(); }

/**
 * items: {label, key, run, checked, disabled, sub:[...]} | 'sep' | {header} | {grid:[{html,title,run,active}]}
 * x,y is the anchor's right/top edge (menus open toward the left, as in an RTL app)
 */
function buildMenu(items, level) {
  const m = el('div', { class: 'menu', dir: 'rtl' });
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { m.append(el('div', { class: 'sep' })); continue; }
    if (it.header) { m.append(el('div', { class: 'mh' }, it.header)); continue; }
    if (it.grid) {
      const g = el('div', { class: 'mgrid' });
      for (const b of it.grid) {
        const btn = el('button', { class: 'mg' + (b.active ? ' on' : '') + (b.mirror ? ' mirror' : ''), title: b.title, html: b.html });
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => { closeMenu(); b.run(); });
        if (b.disabled) btn.disabled = true;
        g.append(btn);
      }
      g.addEventListener('mouseenter', () => aim(level, () => closeFrom(level + 1), g));
      m.append(g);
      continue;
    }
    const mi = el('div', { class: 'mi' + (it.checked ? ' checked' : '') + (it.sub ? ' has-sub' : '') },
      el('span', { style: it.style || null }, it.label), it.key ? el('span', { class: 'k' }, it.key) : null, it.sub ? el('span', { class: 'arrow', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>' }) : null);
    mi.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor selection
    if (it.disabled) mi.classList.add('disabled');
    else if (it.sub) {
      const open = () => {
        clearTimeout(aimTimer);
        if (mi.classList.contains('open')) return;
        closeFrom(level + 1);
        m.querySelectorAll('.mi.open').forEach((n) => n.classList.remove('open'));
        mi.classList.add('open');
        const sub = buildMenu(it.sub, level + 1);
        const r = mi.getBoundingClientRect();
        place(sub, r.left + 4, r.top - 6, r.right - 4);
      };
      mi.addEventListener('mouseenter', () => aim(level, open, mi));
      mi.addEventListener('click', open);
    } else {
      mi.addEventListener('mouseenter', () => aim(level, () => { closeFrom(level + 1); m.querySelectorAll('.mi.open').forEach((n) => n.classList.remove('open')); }, mi));
      mi.addEventListener('mouseleave', () => clearTimeout(aimTimer));
      mi.addEventListener('click', () => { closeMenu(); it.run(); });
    }
    m.append(mi);
  }
  // reaching the submenu cancels any pending switch in the parent menu
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
export function showMenu(items, x, y) {
  closeMenu();
  const m = buildMenu(items, 0);
  place(m, x, y);
  setTimeout(() => {
    outsideHandler = (e) => { if (!openMenus.some((n) => n.contains(e.target))) closeMenu(); };
    document.addEventListener('mousedown', outsideHandler, true);
  }, 0);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenus.length) { e.stopPropagation(); closeMenu(); } }, true);

/** buttons: [{label, value, primary, danger}] → resolves with value (Escape → null) */
export function modal({ title, text, buttons, input, body, bodyAfter }) {
  return new Promise((resolve) => {
    const inp = input != null ? el('input', { type: 'text', value: input, dir: 'auto' }) : null;
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const row = el('div', { class: 'row' }, buttons.map((b) =>
      el('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), onclick: () => done(inp && b.primary ? inp.value : b.value) }, b.label)));
    const box = el('div', { class: 'modal', dir: 'rtl' }, el('h3', {}, title), text ? el('p', {}, text) : null, bodyAfter ? inp : (body || null), bodyAfter ? (body || null) : inp, row);
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
/** action: { label, run } shows a button inside the toast */
export function toast(msg, ms = 2200, action = null) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = el('div', { class: 'toast', dir: 'rtl' }, el('span', {}, msg));
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
