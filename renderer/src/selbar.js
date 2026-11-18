// The selection toolbar while the mouse is selecting text.
// - While the button is held over the text the toolbar is hidden and ignores the pointer, so dragging
//   past it (e.g. upwards over several lines) never hovers its colour button or stops the selection.
//   It appears where the mouse was let go.
// - After a downward multi-line drag it sits under the last selected line (next to the pointer, out of the
//   way of the text); after an upward drag, above the first line, as before.
// - The colour panel opens on hover only after the pointer rests on «آ» and no button is held.

import { closeMenu } from './ui.js';

const HOVER_DELAY = 250;
let below = null; // the toolbar element that should sit under its selection, until the next mouse/key action

/** client rect of the selection's last line */
function lastLineRect(view) {
  const { to } = view.state.selection;
  try { return view.coordsAtPos(to, -1); } catch { return null; }
}

function placeBelow(bar) {
  if (bar !== below || bar.dataset.show !== 'true') return;
  const view = bar._nvView;
  if (!view) return;
  const r = lastLineRect(view);
  if (!r) return;
  const box = bar.getBoundingClientRect();
  const want = r.bottom + 10;
  if (want + box.height > window.innerHeight - 8) return; // no room under it: keep the place it chose
  const cur = parseFloat(bar.style.top) || 0;
  const delta = want - box.top;
  if (Math.abs(delta) > 1) bar.style.top = cur + delta + 'px';
}

/**
 * @param {(el: Element) => {view: any, pane: Element} | null} find  the tab's editor view for an element
 * @param {(btn: Element) => void} openColor  opens the colour panel of a toolbar button
 */
export function installSelectionBar(find, openColor) {
  const root = document.documentElement;
  const watched = new WeakSet();

  const watch = (bar, view) => {
    bar._nvView = view;
    if (watched.has(bar)) return;
    watched.add(bar);
    // the toolbar repositions itself on scroll or layout changes; keep it under the selection then too
    new MutationObserver(() => placeBelow(bar)).observe(bar, { attributes: true, attributeFilter: ['style', 'data-show'] });
  };

  document.addEventListener('mousedown', (e) => {
    below = null;
    if (e.button !== 0) return;
    const pm = e.target.closest && e.target.closest('.milkdown .ProseMirror');
    if (!pm) return;
    root.classList.add('nv-selecting');
    // a colour panel left open from the previous selection goes away when a new one starts
    if (document.querySelector('.menu.color-panel')) closeMenu();
  }, true);

  window.addEventListener('mouseup', (e) => {
    if (!root.classList.contains('nv-selecting')) return;
    root.classList.remove('nv-selecting');
    const hit = find(e.target) || find(document.activeElement);
    if (!hit) return;
    const { view, pane } = hit;
    const sel = view.state.selection;
    if (sel.empty) return;
    const bar = pane.querySelector('.milkdown-toolbar');
    if (!bar) return;
    watch(bar, view);
    // a downward drag over more than one line: under the last line; otherwise the usual place above
    let multi = false;
    try { multi = view.coordsAtPos(sel.to, -1).top - view.coordsAtPos(sel.from, 1).top > 4; } catch { /* keep above */ }
    if (sel.head > sel.anchor && multi) {
      below = bar;
      // the toolbar updates a moment after the selection settles
      setTimeout(() => placeBelow(bar), 0);
      setTimeout(() => placeBelow(bar), 260);
    }
  }, true);

  window.addEventListener('blur', () => root.classList.remove('nv-selecting'));
  document.addEventListener('keydown', () => { below = null; }, true);

  // colour panel on hover: only after a short rest, and never while a button is held
  let hoverT = null;
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest && e.target.closest('[data-toolbar-item="nv-color"]');
    if (!b) return;
    clearTimeout(hoverT);
    if (e.buttons || root.classList.contains('nv-selecting')) return;
    hoverT = setTimeout(() => { if (b.matches(':hover')) openColor(b); }, HOVER_DELAY);
  });
  document.addEventListener('mouseout', (e) => {
    const b = e.target.closest && e.target.closest('[data-toolbar-item="nv-color"]');
    if (b && !b.contains(e.relatedTarget)) clearTimeout(hoverT);
  });
}
