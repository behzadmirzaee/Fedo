// Neveshtar renderer: tabs, files, sidebar, themes, settings, shortcuts
import { insert } from '@milkdown/kit/utils';
import { openSearchPanel } from '@codemirror/search';
import {
  createEditor, setMarkdown, getView, headingsFromView, jumpTo, centerCaret,
  createSource, sourceHeadings, setMermaidDark, getEditorHTML, dirOfText, headingBackspace,
} from './editor.js';
import { TextSelection, AllSelection } from '@milkdown/kit/prose/state';
import { createHistoryPanel } from './history.js';
import { openEditorMenu, handleTableKey } from './context.js';
const LOGOS = Object.entries(import.meta.glob('../logos/*.png', { eager: true, query: '?url', import: 'default' }))
  .map(([k, url]) => ({ id: k.match(/(\w+)\.png$/)[1], url })).sort((a, b) => a.id.localeCompare(b.id));
import { buildRegex, pmEngine, cmEngine, pmCollectEdits, pmApplyEdits, PRESETS } from './search.js';
import { readOnlyComp } from './editor.js';
import { EditorState as CMState } from '@codemirror/state';
import { exportDocument } from './export.js';
import { el, ICON, showMenu, modal, toast, kbd, fa, basename, dirname, relTime } from './ui.js';

const api = window.api;
const $ = (s) => document.querySelector(s);

export const THEMES = [
  { id: 'light', name: 'روشن' },
  { id: 'dark', name: 'تیره', dark: true },
  { id: 'sepia', name: 'کاغذی' },
  { id: 'nord', name: 'نورد', dark: true },
  { id: 'garden', name: 'باغ' },
];
export const FONTS = [
  { id: '', name: 'پیش‌فرض تم' },
  { id: 'Vazirmatn', name: 'وزیرمتن' },
  { id: 'Dana', name: 'دانا', optional: true },
  { id: 'IRANSansX', name: 'ایران‌سنس X', optional: true },
  { id: 'IRANYekanX', name: 'ایران‌یکان X', optional: true },
  { id: 'Noto Naskh Arabic', name: 'نسخ' },
].filter((f) => !f.optional || (window.__nvFonts || []).includes(f.id));
const RECENT_MAX = 10;
let systemFonts = null;
async function loadSystemFonts() {
  if (systemFonts) return systemFonts;
  try {
    const list = await window.queryLocalFonts();
    systemFonts = [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
  } catch { systemFonts = []; }
  return systemFonts;
}
const fontName = (id) => (FONTS.find((f) => f.id === id) || { name: id }).name;
const fontStack = (id, fallback) => `'${id.replace(/'/g, '')}', ${fallback}`;

const DEFAULTS = {
  textFont: '', headFont: '', uiFont: '', zoom: 1, positions: {},
  theme: 'light', baseDir: 'rtl', fontSize: 17, pageWidth: 860, lineHeight: 1.95,
  autosave: false, snapshotMinutes: 5, restoreSession: true, recent: [],
  sidebar: true, sideView: 'files', folder: null, typewriter: false, spellcheck: false, locked: [], logo: '08', verticalTabs: false,
};

let settings = { ...DEFAULTS };
let customThemes = [];
const tabs = [];
let activeId = null;
let seq = 0;
const closedStack = [];
let historyPanel;

const bidi = (text) => dirOfText(text || '') || 'auto';
const active = () => tabs.find((t) => t.id === activeId);
const samePath = (a, b) => a && b && a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

// ======================================================================
// layout
// ======================================================================
function buildLayout() {
  const app = $('#app');
  app.innerHTML = '';
  const topbar = el('div', { id: 'topbar' },
    el('div', { class: 'cap' },
      el('button', { class: 'icon-btn', id: 'btn-menu', title: 'منوی اصلی', html: ICON.menu, onclick: (e) => openMainMenu(e.currentTarget) }),
      el('button', { class: 'icon-btn', id: 'btn-sidebar', title: 'نوار کناری (Ctrl+Shift+L)', html: ICON.sidebar, onclick: toggleSidebar })),
    el('div', { class: 'cap tabstrip', id: 'tabstrip' },
      el('div', { id: 'tabs' }),
      el('button', { class: 'icon-btn', id: 'btn-newtab', title: 'سند تازه (Ctrl+T)', html: ICON.plus, onclick: () => newTab() })),
    el('div', { class: 'grow' }),
    el('div', { class: 'cap' },
      el('button', { class: 'icon-btn', id: 'btn-history', title: 'تاریخچه‌ی نسخه‌ها (Ctrl+Shift+H)', html: ICON.history, onclick: () => historyPanel.toggle() }),
      el('button', { class: 'icon-btn', id: 'btn-find', title: 'جستجو و جایگزینی (Ctrl+F)', html: ICON.search, onclick: () => ($('#findbar').hidden ? openFind(false) : closeFind()) }),
      el('button', { class: 'icon-btn', id: 'btn-copyall', title: 'کپی کل سند', html: ICON.copy, onclick: () => copyWholeDoc() })));

  const sidebar = el('div', { id: 'sidebar' },
    el('div', { class: 'side-tabs' },
      el('button', { 'data-v': 'files', onclick: () => setSideView('files') }, 'فایل‌ها'),
      el('button', { 'data-v': 'outline', onclick: () => setSideView('outline') }, 'سرفصل‌ها'),
      el('button', { 'data-v': 'recent', onclick: () => setSideView('recent') }, 'اخیر')),
    el('div', { class: 'side-body', id: 'side-body' }));

  const chev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
  const findbar = el('div', { id: 'findbar', hidden: true, dir: 'rtl' },
    el('div', { class: 'r' },
      el('button', { class: 'icon-btn fb-toggle', id: 'find-toggle', title: 'نمایش جایگزینی (Ctrl+H)', html: chev, onclick: () => toggleReplaceRow() }),
      el('input', { id: 'find-q', placeholder: 'جستجو در متن', dir: 'auto', spellcheck: 'false' }),
      el('button', { class: 'fb-opt', id: 'find-case', title: 'حساس به حروف بزرگ و کوچک', onclick: () => toggleFindOpt('matchCase') }, 'Aa'),
      el('button', { class: 'fb-opt', id: 'find-word', title: 'فقط کلمه‌ی کامل', onclick: () => toggleFindOpt('wholeWord') }, 'کلمه'),
      el('span', { class: 'count', id: 'find-count' }),
      el('button', { class: 'icon-btn', title: 'قبلی (Shift+Enter)', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>', onclick: () => findStep(-1) }),
      el('button', { class: 'icon-btn', title: 'بعدی (Enter)', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>', onclick: () => findStep(1) }),
      el('button', { class: 'icon-btn', title: 'بستن (Esc)', html: ICON.x, onclick: closeFind })),
    el('div', { class: 'r', id: 'replace-row' },
      el('input', { id: 'find-r', placeholder: 'جایگزین با', dir: 'auto', spellcheck: 'false' }),
      el('button', { class: 'btn', title: 'جایگزینی همین مورد (Enter)', onclick: replaceOne }, 'جایگزینی'),
      el('button', { class: 'btn', title: 'جایگزینی همه (Ctrl+Alt+Enter)', onclick: replaceAllText }, 'همه')),
    el('div', { class: 'r fb-presets' },
      el('button', { class: 'btn fb-preset-btn', onclick: (e) => openPresetMenu(e.currentTarget) }, 'اقدام‌های آماده…')));

  const editors = el('div', { id: 'editors' }, findbar);
  const history = el('div', { id: 'history', hidden: true });
  const vtabs = el('div', { id: 'vtabs' },
    el('div', { id: 'vtabs-list', ondblclick: (e) => { if (e.target.id === 'vtabs-list') newTab(); } }),
    el('button', { class: 'vt-new', title: 'سند تازه (Ctrl+T)', onclick: () => newTab() }, el('span', { class: 'ic', html: ICON.plus }), el('span', {}, 'تب تازه')));

  const status = el('div', { id: 'statusbar' },
    el('span', { class: 'chip', id: 'st-words' }),
    el('span', { class: 'chip', id: 'st-sel' }),
    el('button', { class: 'chip', id: 'st-lock', title: 'حالت امن: فایل فقط خواندنی می‌شود (F8)', onclick: () => { const t = active(); if (t) setLocked(t, !t.locked); } }),
    el('button', { class: 'chip on', id: 'st-typewriter', title: 'حالت ماشین‌تحریر روشن است (F9). کلیک برای خاموش کردن', onclick: () => toggleSetting('typewriter') }, 'ماشین‌تحریر'),
    el('button', { class: 'chip on', id: 'st-mode', title: 'برگشت به ویرایش زنده (Ctrl+/)', onclick: toggleSource }, el('span', { class: 'ic', html: ICON.code }), el('span', {}, 'کد منبع')),
    el('span', { class: 'chip ok', id: 'st-saved' }),
    el('span', { class: 'grow' }),
    el('button', { class: 'chip', id: 'st-size', title: 'اندازه‌ی متن و فاصله‌ی خطوط', onclick: (e) => openSizePanel(e.currentTarget) }, el('span', { class: 'ic', html: ICON.textSize }), el('span', {}, 'اندازه')),
    el('div', { class: 'zoomer', title: 'زوم · میان‌بر: Ctrl و + یا Ctrl و −' },
      el('button', { title: 'بزرگ‌نمایی (Ctrl+=)', html: ICON.plus, onclick: () => zoomBy(1) }),
      el('button', { id: 'st-zoom', title: 'گزینه‌های زوم', onclick: (e) => openZoomPanel(e.currentTarget.parentNode) }),
      el('button', { title: 'کوچک‌نمایی (Ctrl+-)', html: ICON.minus, onclick: () => zoomBy(-1) })));
  const sheet = el('div', { id: 'sheet' }, editors, status);
  const main = el('div', { id: 'main' }, sidebar, sheet, history, vtabs);

  app.append(topbar, main);
  historyPanel = createHistoryPanel(history, {
    getTab: active,
    getContent: () => (active() ? active().md : ''),
    restore: restoreVersion,
    snapshotNow: async () => {
      const t = active();
      if (!t || !t.path) { toast('اول سند را ذخیره کنید'); return false; }
      const label = await modal({ title: 'ثبت نسخه‌ی دستی', text: 'یک نام کوتاه برای این نسخه (اختیاری):', input: '', buttons: [{ label: 'انصراف', value: null }, { label: 'ثبت', primary: true }] });
      if (label == null) return false;
      const r = await api.historyAdd(t.path, t.md, 'manual', label.trim());
      t.lastSnap = t.md; t.lastSnapTime = Date.now();
      toast(r.skipped ? 'این متن قبلاً ثبت شده بود' : 'نسخه ثبت شد');
      return true;
    },
  });
  history.addEventListener('toggle', () => $('#btn-history').classList.toggle('on', !history.hidden));
}

// ======================================================================
// tabs
// ======================================================================
function untitledName() {
  const used = new Set(tabs.filter((t) => !t.path).map((t) => t.untitledN));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}
function tabTitle(t) {
  if (t.path) return basename(t.path);
  return t.untitledN === 1 ? 'بدون عنوان' : `بدون عنوان ${fa(t.untitledN)}`;
}

async function newTab({ path = null, content = '', activate = true, mode = 'wysiwyg', mtime = 0, index, draftId } = {}) {
  const id = ++seq;
  const wys = el('div', { class: 'wysiwyg', dir: settings.baseDir });
  const src = el('div', { class: 'source', dir: settings.baseDir });
  const pane = el('div', { class: 'pane' }, wys, src);
  $('#editors').append(pane);
  const t = {
    id, path, pane, wys, src, mode: 'wysiwyg', md: content, baseline: content, diskContent: content,
    dirty: false, crepe: null, cm: null, mtime, untitledN: path ? 0 : untitledName(),
    lastSnap: content, lastSnapTime: Date.now(), saveTimer: null,
    draftId: path ? null : draftId || 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  };
  t.crepe = await createEditor(wys, content, editorHooks(t));
  applySpell(t);
  wys.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const v = getView(t.crepe);
    // right-click outside the current selection moves the caret there first (like Typora)
    const hit = v.posAtCoords({ left: e.clientX, top: e.clientY });
    const { from, to } = v.state.selection;
    if (hit && (hit.pos < from || hit.pos > to) && !e.target.closest('.cm-editor')) {
      try { v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(hit.pos)))); } catch {}
    }
    if (t.locked) {
      showMenu([
        { label: 'کپی', key: 'Ctrl+C', run: () => api.edit('copy') },
        'sep',
        { label: 'خاموش کردن حالت امن', key: 'F8', run: () => setLocked(t, false) },
      ], e.clientX, e.clientY);
      return;
    }
    openEditorMenu(t.crepe, e.clientX, e.clientY, { insertImage: () => insertImageFromDisk(t), edit: (op) => api.edit(op) });
  });
  // block paste / drop into a locked document
  for (const ev of ['paste', 'drop', 'cut']) {
    pane.addEventListener(ev, (e) => { if (t.locked) { e.preventDefault(); e.stopPropagation(); showLockedToast(); } }, true);
  }
  // clicking in the empty space under the last line puts the caret on a fresh line there
  wys.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const v = getView(t.crepe);
    const pmDom = v.dom;
    if (e.target !== pmDom && e.target !== wys && !e.target.classList.contains('milkdown')) return;
    const last = pmDom.lastElementChild;
    if (!last || e.clientY <= last.getBoundingClientRect().bottom) return;
    e.preventDefault();
    const { doc, schema } = v.state;
    const lastNode = doc.lastChild;
    let tr = v.state.tr;
    if (!(lastNode && lastNode.type.name === 'paragraph' && lastNode.content.size === 0)) {
      tr = tr.insert(doc.content.size, schema.nodes.paragraph.create());
    }
    tr = tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1)).setStoredMarks([]);
    v.dispatch(tr.scrollIntoView());
    v.focus();
  });
  wys.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || t.locked) return;
    if (e.target.closest && e.target.closest('.cm-editor')) return;
    if (headingBackspace(getView(t.crepe))) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  installClickScrollGuard(t);
  wys.addEventListener('keydown', () => { t.lastKeyAt = Date.now(); }, true);
  // Ctrl+click opens links
  wys.addEventListener('click', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const a = e.target.closest('a[href]');
    if (!a || a.closest('.cm-editor')) return;
    e.preventDefault(); e.stopPropagation();
    openLink(t, a.getAttribute('href'));
  }, true);
  t.md = t.crepe.getMarkdown();
  t.baseline = t.md;
  t.lastSnap = t.md;
  if (index != null) tabs.splice(index, 0, t); else tabs.push(t);
  renderTabs();
  if (mode === 'source') setMode(t, 'source');
  if (path) api.watch(path);
  if (activate) activateTab(t.id);
  return t;
}

function editorHooks(t) {
  return {
    onChange: (md) => { if (t.mode === 'wysiwyg') contentChanged(t, md); },
    onSelection: () => {
      if (t.id !== activeId) return;
      const v = getView(t.crepe);
      const { from, to, empty } = v.state.selection;
      showSelectionCount(empty ? '' : v.state.doc.textBetween(from, to, ' ', ' '));
    },
    resolveImage: (url) => resolveImage(t, url),
    uploadImage: (file) => uploadImage(t, file),
  };
}

function toFileURL(p) {
  const norm = p.replace(/\\/g, '/');
  return 'file://' + (norm.startsWith('/') ? '' : '/') + encodeURI(norm).replace(/#/g, '%23').replace(/\?/g, '%3F');
}
function resolveImage(t, url) {
  if (!url || /^(https?:|data:|blob:|file:)/i.test(url)) return url;
  if (/^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('/')) return toFileURL(url);
  if (t.path) return toFileURL(dirname(t.path) + '/' + decodeURI(url));
  return url;
}
async function openLink(t, href) {
  if (!href) return;
  if (/^(https?:|mailto:)/i.test(href)) return api.openUrl(href);
  if (/^www\./i.test(href)) return api.openUrl('https://' + href);
  if (href.startsWith('#')) {
    // jump to a heading inside the document
    const slug = decodeURIComponent(href.slice(1)).toLowerCase();
    const h = headingsFromView(t.crepe).find((x) => x.text.trim().toLowerCase().replace(/\s+/g, '-') === slug);
    if (h) jumpTo(t.crepe, h.pos);
    return;
  }
  const clean = decodeURI(href.split('#')[0]);
  const abs = /^[a-zA-Z]:[\\/]/.test(clean) || clean.startsWith('/') ? clean : t.path ? dirname(t.path) + '/' + clean : null;
  if (!abs) return;
  if (/\.(md|markdown|mdown|mkd|txt)$/i.test(abs)) {
    if ((await api.stat(abs)).exists) openPath(abs); else toast('فایل پیدا نشد: ' + basename(abs));
  } else api.openExternal(abs);
}
function showSelectionCount(text) {
  const n = $('#st-sel');
  if (!n) return;
  if (!text || !text.trim()) { n.textContent = ''; return; }
  const { words, chars } = countWords(text);
  n.textContent = `انتخاب: ${fa(words)} کلمه، ${fa(chars)} نویسه`;
}
async function insertImageFromDisk(t) {
  const r = await api.pickImage(t.path);
  if (!r) return;
  const src = r.relative || toFileURL(r.absolute);
  t.crepe.editor.action(insert(`![](${src.replace(/ /g, '%20')})`));
  getView(t.crepe).focus();
}
async function uploadImage(t, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = await api.saveImage(t.path, file.name || 'image.png', bytes);
  if (r.relative) return r.relative;
  return toFileURL(r.absolute);
}

function contentChanged(t, md) {
  t.md = md;
  if (settings.typewriter && t.id === activeId && t.mode === 'wysiwyg' && Date.now() - (t.lastKeyAt || 0) < 1500) centerCaret(t.crepe, t.pane);
  const wasDirty = t.dirty;
  t.dirty = t.md !== t.baseline;
  if (wasDirty !== t.dirty) { renderTabs(); updateTitle(); }
  if (t.id === activeId) { scheduleStatus(); scheduleOutline(); if (findOpen()) updateFindCount(); }
  if (!t.path) scheduleDraft(t);
  if (settings.autosave && t.path && t.dirty) {
    clearTimeout(t.saveTimer);
    t.saveTimer = setTimeout(() => save(t, false, true), 1500);
  }
}

function scheduleDraft(t) {
  clearTimeout(t.draftTimer);
  t.draftTimer = setTimeout(() => {
    if (t.path || !t.draftId) return;
    if (t.md.trim() && t.dirty) api.draftSave(t.draftId, t.md); else api.draftDelete(t.draftId);
  }, 800);
}
function dropDraft(t) {
  clearTimeout(t.draftTimer);
  if (t.draftId) api.draftDelete(t.draftId);
  t.draftId = null;
}

// ---------- caret & scroll memory per file ----------
const posKey = (p) => p.replace(/\\/g, '/').toLowerCase();
function rememberPos(t) {
  if (!t || !t.path) return;
  let sel = 0;
  try { sel = t.mode === 'source' && t.cm ? t.cm.state.selection.main.head : getView(t.crepe).state.selection.head; } catch {}
  const scroll = t.pane.classList.contains('active') ? t.pane.scrollTop : t.pendingScroll || 0;
  const positions = { ...settings.positions };
  delete positions[posKey(t.path)];
  positions[posKey(t.path)] = { sel, scroll, source: t.mode === 'source' };
  const keys = Object.keys(positions);
  for (const k of keys.slice(0, Math.max(0, keys.length - 100))) delete positions[k];
  settings.positions = positions;
  persistSettings();
}
function restorePos(t) {
  const p = t.path && settings.positions[posKey(t.path)];
  if (!p) return;
  try {
    const v = getView(t.crepe);
    const pos = Math.min(p.sel, v.state.doc.content.size);
    v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(pos))));
  } catch {}
  t.pendingScroll = p.scroll;
  if (t.pane.classList.contains('active')) applyPendingScroll(t);
}
function applyPendingScroll(t) {
  if (t.pendingScroll == null) return;
  const y = t.pendingScroll;
  t.pendingScroll = null;
  requestAnimationFrame(() => requestAnimationFrame(() => { t.pane.scrollTop = y; }));
}

// ---------- tab groups (Chrome-style) ----------
export const GROUP_COLORS = [
  { id: 'grey', name: 'خاکستری', c: '#80868b' }, { id: 'blue', name: 'آبی', c: '#1a73e8' },
  { id: 'red', name: 'قرمز', c: '#d93025' }, { id: 'yellow', name: 'زرد', c: '#f9ab00' },
  { id: 'green', name: 'سبز', c: '#188038' }, { id: 'pink', name: 'صورتی', c: '#d01884' },
  { id: 'purple', name: 'بنفش', c: '#a142f4' }, { id: 'cyan', name: 'فیروزه‌ای', c: '#007b83' },
  { id: 'orange', name: 'نارنجی', c: '#fa903e' },
];
const groups = new Map(); // id -> { id, name, color, collapsed }
const colorOf = (g) => (GROUP_COLORS.find((c) => c.id === g.color) || GROUP_COLORS[0]).c;
function nextColor() {
  const used = new Set([...groups.values()].map((g) => g.color));
  return (GROUP_COLORS.find((c) => !used.has(c.id)) || GROUP_COLORS[groups.size % GROUP_COLORS.length]).id;
}
/** keep the tabs of each group next to each other, in their current order */
function normalizeGroups() {
  const out = [];
  const seen = new Set();
  for (const t of tabs) {
    if (!t.groupId || !groups.has(t.groupId)) { t.groupId = null; out.push(t); continue; }
    if (seen.has(t.groupId)) continue;
    seen.add(t.groupId);
    out.push(...tabs.filter((x) => x.groupId === t.groupId));
  }
  tabs.splice(0, tabs.length, ...out);
  for (const id of [...groups.keys()]) if (!tabs.some((t) => t.groupId === id)) groups.delete(id);
}
async function editGroup(g, isNew = false) {
  let color = g.color;
  const swatches = el('div', { class: 'grp-colors' });
  const preview = el('span', { class: 'grp-preview' });
  const picked = el('span', { class: 'grp-picked' });
  const paint = () => {
    const c = GROUP_COLORS.find((x) => x.id === color) || GROUP_COLORS[0];
    swatches.querySelectorAll('.grp-sw').forEach((n) => { const on = n.dataset.id === color; n.classList.toggle('on', on); n.setAttribute('aria-pressed', on); });
    preview.style.setProperty('--g', c.c);
    picked.textContent = 'رنگ انتخاب‌شده: ' + c.name;
    const inp = document.querySelector('.modal input[type=text]');
    preview.textContent = (inp && inp.value.trim()) || 'نام گروه';
  };
  for (const c of GROUP_COLORS) {
    const b = el('button', { class: 'grp-sw', type: 'button', title: c.name, 'data-id': c.id, style: `--g:${c.c}`,
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' });
    b.addEventListener('click', () => { color = c.id; paint(); });
    swatches.append(b);
  }
  const body = el('div', { class: 'grp-body' },
    el('div', { class: 'grp-row' }, el('span', { class: 'grp-label' }, 'رنگ گروه'), picked),
    swatches,
    el('div', { class: 'grp-row' }, el('span', { class: 'grp-label' }, 'پیش‌نمایش'), preview));
  setTimeout(() => { paint(); const inp = document.querySelector('.modal input[type=text]'); if (inp) { inp.placeholder = 'مثلاً: کار، پروژه‌ی زارچی'; inp.addEventListener('input', paint); } }, 0);
  const name = await modal({ title: isNew ? 'گروه تازه' : 'ویرایش گروه', text: 'نام گروه (اختیاری)', input: g.name || '', body, bodyAfter: true,
    buttons: [{ label: 'انصراف', value: null }, { label: isNew ? 'ساخت گروه' : 'ذخیره', primary: true }] });
  if (name == null) return false;
  g.name = name.trim(); g.color = color;
  renderTabs(); saveSessionSoon();
  return true;
}
async function addToNewGroup(t) {
  const g = { id: 'g' + Date.now().toString(36), name: '', color: nextColor(), collapsed: false };
  groups.set(g.id, g);
  t.groupId = g.id;
  normalizeGroups(); renderTabs();
  if (!(await editGroup(g, true))) { t.groupId = null; groups.delete(g.id); normalizeGroups(); renderTabs(); }
}
function setGroup(t, gid) { t.groupId = gid; normalizeGroups(); renderTabs(); saveSessionSoon(); }
function toggleGroup(g) {
  g.collapsed = !g.collapsed;
  const a = active();
  if (g.collapsed && a && a.groupId === g.id) {
    const other = tabs.find((t) => t.groupId !== g.id && !(t.groupId && groups.get(t.groupId)?.collapsed));
    if (other) activateTab(other.id); else { newTab(); return; }
  }
  renderTabs(); saveSessionSoon();
}
function groupMenu(g, x, y) {
  const members = tabs.filter((t) => t.groupId === g.id);
  showMenu([
    { header: g.name || 'گروه بی‌نام' },
    { label: 'تغییر نام و رنگ…', run: () => editGroup(g) },
    { label: 'رنگ', sub: GROUP_COLORS.map((c) => ({ label: '● ' + c.name, style: `color:${c.c}`, checked: g.color === c.id, run: () => { g.color = c.id; renderTabs(); saveSessionSoon(); } })) },
    { label: g.collapsed ? 'باز کردن گروه' : 'جمع کردن گروه', run: () => toggleGroup(g) },
    { label: 'سند تازه در این گروه', run: async () => { const t = await newTab(); setGroup(t, g.id); } },
    'sep',
    { label: 'انتقال گروه به پنجره‌ی جدید', run: () => detachTabs(members, false) },
    { label: 'لغو گروه', run: () => { members.forEach((t) => { t.groupId = null; }); groups.delete(g.id); renderTabs(); saveSessionSoon(); } },
    { label: 'بستن همه‌ی تب‌های گروه', run: async () => { for (const t of members) if (!(await closeTab(t))) break; } },
  ], x, y);
}

function tabNode(t, vertical) {
  const g = t.groupId ? groups.get(t.groupId) : null;
  const close = el('button', { class: 't-close', title: 'بستن (Ctrl+W)', html: `<span class="x">${ICON.x}</span>`, draggable: 'false' });
  close.addEventListener('mousedown', (e) => e.stopPropagation());
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t); });
  const node = el('div', {
    class: 'tab' + (t.id === activeId ? ' active' : '') + (t.dirty ? ' dirty' : '') + (g ? ' grouped' : ''),
    title: t.path || tabTitle(t), draggable: 'true', 'data-id': t.id, style: g ? `--g:${colorOf(g)}` : null,
  }, t.locked ? el('span', { class: 't-lock', title: 'حالت امن', html: ICON.lock }) : null,
    el('span', { class: 't-title', dir: bidi(tabTitle(t)) }, tabTitle(t)),
    t.mode === 'source' ? el('span', { class: 't-ind' }, 'کد') : null, close);
  node.addEventListener('mousedown', (e) => { if (e.button === 0 && t.id !== activeId) activateTab(t.id); });
  node.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t); });
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(t, e.clientX, e.clientY); });
  node.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/nv-tab', String(t.id));
    e.dataTransfer.effectAllowed = 'move';
    dragState = { id: t.id, dropped: false };
  });
  // dropped outside the window → the tab becomes its own window (like Chrome)
  node.addEventListener('dragend', (e) => {
    const ds = dragState; dragState = null;
    if (!ds || ds.dropped) return;
    const out = e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight;
    if (out) detachTabs([t], false, { x: e.screenX, y: e.screenY });
  });
  node.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/nv-tab')) return;
    e.preventDefault();
    const r = node.getBoundingClientRect();
    const after = vertical ? e.clientY > r.top + r.height / 2 : (e.clientX < r.left + r.width / 2) === (getComputedStyle(node.parentNode).direction === 'rtl');
    node.classList.toggle('drag-over', !after);
    node.classList.toggle('drag-over-after', after);
  });
  node.addEventListener('dragleave', () => node.classList.remove('drag-over', 'drag-over-after'));
  node.addEventListener('drop', (e) => {
    const from = Number(e.dataTransfer.getData('text/nv-tab'));
    if (!from) return;
    e.preventDefault();
    if (dragState) dragState.dropped = true;
    const after = node.classList.contains('drag-over-after');
    node.classList.remove('drag-over', 'drag-over-after');
    if (from === t.id) return;
    const fi = tabs.findIndex((x) => x.id === from);
    const [moved] = tabs.splice(fi, 1);
    let ti = tabs.findIndex((x) => x.id === t.id);
    if (after) ti++;
    tabs.splice(ti, 0, moved);
    moved.groupId = t.groupId; // dropping onto a grouped tab joins its group
    normalizeGroups();
    renderTabs();
    saveSession();
  });
  return node;
}
let dragState = null;
function groupChip(g, vertical) {
  const count = tabs.filter((t) => t.groupId === g.id).length;
  const chip = el('div', { class: (vertical ? 'vgroup' : 'tgroup') + (g.collapsed ? ' collapsed' : ''), style: `--g:${colorOf(g)}`, title: g.collapsed ? 'باز کردن گروه' : 'جمع کردن گروه', 'data-gid': g.id },
    vertical ? el('span', { class: 'vg-chev', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg>' }) : null,
    el('span', { class: 'g-name', dir: bidi(g.name) }, g.name || (vertical ? 'گروه' : '')),
    (g.collapsed || vertical) ? el('span', { class: 'g-count' }, fa(count)) : null);
  chip.addEventListener('click', () => toggleGroup(g));
  chip.addEventListener('contextmenu', (e) => { e.preventDefault(); groupMenu(g, e.clientX, e.clientY); });
  chip.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/nv-tab')) { e.preventDefault(); chip.classList.add('drag-over'); } });
  chip.addEventListener('dragleave', () => chip.classList.remove('drag-over'));
  chip.addEventListener('drop', (e) => {
    const from = Number(e.dataTransfer.getData('text/nv-tab'));
    chip.classList.remove('drag-over');
    if (!from) return;
    e.preventDefault();
    if (dragState) dragState.dropped = true;
    const t = tabs.find((x) => x.id === from);
    if (t) setGroup(t, g.id);
  });
  return chip;
}
function renderTabs() {
  normalizeGroups();
  const vertical = vertTabsOn();
  const hbox = $('#tabs');
  const vbox = $('#vtabs-list');
  hbox.innerHTML = '';
  if (vbox) vbox.innerHTML = '';
  const box = vertical ? vbox : hbox;
  let lastGroup = null;
  for (const t of tabs) {
    const g = t.groupId ? groups.get(t.groupId) : null;
    if (g && g.id !== lastGroup) box.append(groupChip(g, vertical));
    lastGroup = g ? g.id : null;
    if (g && g.collapsed) continue;
    box.append(tabNode(t, vertical));
  }
  const act = box.querySelector('.tab.active');
  if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
$('#app') && document.addEventListener('wheel', (e) => {
  const box = $('#tabs');
  if (box && box.contains(e.target) && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft -= e.deltaY; e.preventDefault(); }
}, { passive: false });

function activateTab(id) {
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  if (t.groupId && groups.get(t.groupId)?.collapsed) { groups.get(t.groupId).collapsed = false; setTimeout(renderTabs, 0); }
  const prev = active();
  if (prev && prev !== t) rememberPos(prev);
  activeId = id;
  for (const x of tabs) x.pane.classList.toggle('active', x.id === id);
  // only flip classes here: rebuilding the tab bar mid-click would swallow clicks and drags
  const nodes = document.querySelectorAll('#tabs .tab, #vtabs-list .tab');
  if (nodes.length === tabs.length && !(t.groupId && groups.get(t.groupId)?.collapsed)) {
    nodes.forEach((n) => n.classList.toggle('active', Number(n.dataset.id) === id));
    const act = document.querySelector('#tabs .tab.active, #vtabs-list .tab.active');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else renderTabs();
  updateTitle();
  updateStatus();
  renderOutline();
  highlightTreeCurrent();
  if (historyPanel.visible()) historyPanel.refresh();
  applyPendingScroll(t);
  showSelectionCount('');
  if (findOpen()) runFind();
  focusEditor(t);
  saveSessionSoon();
}
function focusEditor(t) {
  requestAnimationFrame(() => {
    const y = t.pane.scrollTop;
    if (t.locked) return;
    if (t.mode === 'source' && t.cm) t.cm.focus();
    else { try { getView(t.crepe).focus(); } catch {} }
    // focusing puts the browser caret back and can scroll to it: keep the reader where they were
    if (t.pane.scrollTop !== y) t.pane.scrollTop = y;
    requestAnimationFrame(() => { if (t.pane.scrollTop !== y) t.pane.scrollTop = y; });
  });
}
function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  activateTab(tabs[(i + dir + tabs.length) % tabs.length].id);
}

async function closeTab(t, { skipPrompt = false, moved = false } = {}) {
  if (t.dirty && !skipPrompt) {
    activateTab(t.id);
    const r = await modal({
      title: `تغییرات «${tabTitle(t)}» ذخیره شود؟`,
      text: 'اگر ذخیره نکنید، تغییرات از دست می‌رود.',
      buttons: [{ label: 'ذخیره نکن', value: 'discard', danger: true }, { label: 'انصراف', value: null }, { label: 'ذخیره', value: 'save', primary: true }],
    });
    if (!r) return false;
    if (r === 'save' && !(await save(t))) return false;
  }
  rememberPos(t);
  dropDraft(t);
  // a last snapshot so nothing typed is ever lost
  if (t.path && t.md !== t.lastSnap) api.historyAdd(t.path, t.md, 'auto').catch(() => {});
  if (!moved && (t.path || t.md.trim())) closedStack.push({ path: t.path, content: t.path ? null : t.md, index: tabs.indexOf(t) });
  const i = tabs.indexOf(t);
  tabs.splice(i, 1);
  if (t.path) api.unwatch(t.path);
  clearTimeout(t.saveTimer);
  try { t.cm && t.cm.destroy(); await t.crepe.destroy(); } catch {}
  t.pane.remove();
  if (!tabs.length) {
    if (moved || closeTab.keepWindow) await newTab();
    else { await persistNow().catch(() => {}); await api.closeNow(); return true; }
  } else if (activeId === t.id) activateTab(tabs[Math.min(i, tabs.length - 1)].id);
  else renderTabs();
  saveSession();
  return true;
}
async function reopenClosed() {
  const c = closedStack.pop();
  if (!c) return;
  if (c.path) await openPath(c.path);
  else await newTab({ content: c.content, index: Math.min(c.index, tabs.length) });
}

function tabMenu(t, x, y) {
  const idx = tabs.indexOf(t);
  const others = [...groups.values()].filter((g) => g.id !== t.groupId);
  showMenu([
    { label: 'سند تازه', key: 'Ctrl+T', run: () => newTab() },
    'sep',
    { label: 'افزودن به گروه تازه', run: () => addToNewGroup(t) },
    others.length ? { label: 'افزودن به گروه', sub: others.map((g) => ({ label: '● ' + (g.name || 'گروه بی‌نام'), style: `color:${colorOf(g)}`, run: () => setGroup(t, g.id) })) } : null,
    t.groupId ? { label: 'خارج کردن از گروه', run: () => setGroup(t, null) } : null,
    'sep',
    { label: 'انتقال به پنجره‌ی جدید', run: () => detachTabs([t], false) },
    { label: 'پنجره‌ی همیشه‌رو (Always on Top)', run: () => detachTabs([t], true) },
    winRole !== 'main' ? { label: 'برگرداندن به پنجره‌ی اصلی', run: () => sendTabsToMain([t]) } : null,
    'sep',
    { label: 'بستن', key: 'Ctrl+W', run: () => closeTab(t) },
    { label: 'بستن بقیه‌ی تب‌ها', run: async () => { for (const o of tabs.filter((o) => o !== t)) if (!(await closeTab(o))) break; } },
    { label: 'بستن تب‌های بعدی', disabled: idx === tabs.length - 1, run: async () => { for (const o of tabs.slice(idx + 1)) if (!(await closeTab(o))) break; } },
    { label: 'بازکردن دوباره‌ی تب بسته‌شده', key: 'Ctrl+Shift+T', disabled: !closedStack.length, run: reopenClosed },
    'sep',
    { label: 'نمایش در پوشه', disabled: !t.path, run: () => api.reveal(t.path) },
    { label: 'کپی مسیر فایل', disabled: !t.path, run: () => { navigator.clipboard.writeText(t.path); toast('مسیر کپی شد', 'ok'); } },
    { label: 'تاریخچه‌ی نسخه‌ها', disabled: !t.path, run: () => { activateTab(t.id); historyPanel.show(); } },
  ], x, y);
}

// ---------- copy the whole document ----------
async function copyWholeDoc() {
  const t = active();
  if (!t) return;
  const md = t.mode === 'source' && t.cm ? t.cm.state.doc.toString() : t.md;
  if (!md.trim()) { toast('سند خالی است'); return; }
  try {
    const html = t.mode === 'source' ? null : getEditorHTML(t.crepe);
    if (html && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([md], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    } else await navigator.clipboard.writeText(md);
  } catch {
    try { await navigator.clipboard.writeText(md); } catch { toast('کپی ممکن نشد', 'err'); return; }
  }
  const b = $('#btn-copyall');
  clearTimeout(copyWholeDoc.t);
  b.classList.add('done'); b.innerHTML = ICON.check; b.title = 'کپی شد';
  copyWholeDoc.t = setTimeout(() => { b.classList.remove('done'); b.innerHTML = ICON.copy; b.title = 'کپی کل سند'; }, 2000);
  toast('کل سند کپی شد', 'ok');
}

// ---------- moving tabs between windows ----------
let winRole = 'main';
function tabPayload(t) {
  const content = t.mode === 'source' && t.cm ? t.cm.state.doc.toString() : t.md;
  const g = t.groupId ? groups.get(t.groupId) : null;
  return { path: t.path, content, dirty: t.dirty, mode: t.mode, locked: !!t.locked, group: g ? { name: g.name, color: g.color } : null };
}
async function detachTabs(list, alwaysOnTop, at) {
  if (!list.length) return;
  const ok = await api.detach(list.map(tabPayload), { alwaysOnTop, ...(at || {}) });
  if (!ok) return;
  for (const t of list) await closeTab(t, { skipPrompt: true, moved: true });
  if (winRole !== 'main' && tabs.length === 1 && !tabs[0].path && !tabs[0].md.trim()) api.closeNow();
}
async function sendTabsToMain(list) {
  const ok = await api.toMain(list.map(tabPayload));
  if (!ok) { toast('پنجره‌ی اصلی پیدا نشد'); return; }
  for (const t of list) await closeTab(t, { skipPrompt: true, moved: true });
  if (!tabs.length || (tabs.length === 1 && !tabs[0].path && !tabs[0].md.trim())) api.closeNow();
}
async function receiveTabs(payloads) {
  const gmap = new Map();
  for (const p of payloads || []) {
    let t;
    if (p.path) {
      t = await openPath(p.path);
      if (t && p.dirty && p.content !== t.md) setContent(t, p.content);
    } else {
      t = await newTab({ content: p.content });
      t.baseline = '';
      t.dirty = !!p.content.trim();
      contentChanged(t, t.md);
    }
    if (!t) continue;
    if (p.mode === 'source') setMode(t, 'source');
    if (p.locked) setLocked(t, true, true);
    if (p.group) {
      const key = p.group.name + '|' + p.group.color;
      if (!gmap.has(key)) { const ex = [...groups.values()].find((x) => x.name === p.group.name && x.color === p.group.color); if (ex) { gmap.set(key, ex.id); } }
      if (!gmap.has(key)) { const g = { id: 'g' + Date.now().toString(36) + gmap.size, name: p.group.name, color: p.group.color, collapsed: false }; groups.set(g.id, g); gmap.set(key, g.id); }
      t.groupId = gmap.get(key);
    }
  }
  renderTabs();
}
async function toggleOnTop() {
  const on = await api.setOnTop(!document.body.classList.contains('on-top'));
  document.body.classList.toggle('on-top', on);
  toast(on ? 'این پنجره همیشه روی بقیه می‌ماند' : 'همیشه‌رو خاموش شد');
}

// ======================================================================
// files
// ======================================================================
async function openPath(p, { activate = true } = {}) {
  const existing = tabs.find((t) => samePath(t.path, p));
  if (existing) { if (activate) activateTab(existing.id); return existing; }
  let file;
  try { file = await api.readFile(p); } catch (e) { toast('باز کردن فایل ممکن نشد: ' + basename(p)); return null; }
  // reuse a blank untitled tab instead of piling up tabs
  const cur = active();
  const reuse = cur && !cur.path && !cur.dirty && !cur.md.trim() ? cur : null;
  const t = await newTab({ path: p, content: file.content, mtime: file.mtime, activate, index: reuse ? tabs.indexOf(reuse) + 1 : undefined });
  t.diskContent = file.content;
  restorePos(t);
  if (settings.locked.includes(posKey(p))) setLocked(t, true, true);
  if (reuse) await closeTab(reuse, { skipPrompt: true });
  api.historyAdd(p, t.md, 'open').catch(() => {});
  addRecent(p);
  return t;
}
async function openDialog() {
  const files = await api.openDialog();
  for (const f of files) await openPath(f);
}
function suggestedName(t) {
  if (t.path) return t.path;
  const first = (t.md.match(/^#{1,6}\s+(.+)$/m) || t.md.match(/^\s*(\S.{0,60})/m) || [])[1] || 'بدون عنوان';
  return first.replace(/[\\/:*?"<>|#]+/g, '').trim().slice(0, 60) + '.md';
}
export const DEFAULT_NAME_PRESETS = ['note', 'prompt', 'report', 'meeting', 'idea'];
const SAVE_FORMATS = [
  { ext: 'md', label: 'Markdown', sub: '.md' },
  { ext: 'txt', label: 'متن ساده', sub: '.txt' },
  { ext: 'html', label: 'صفحه‌ی وب', sub: '.html' },
  { ext: 'pdf', label: 'PDF', sub: '.pdf' },
];
/** Jalali date + time with Latin digits, safe for file names: 1405-08-18_14-30 */
function timeStamp(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}
const STAMP_RE = /[ _-]?\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;
const cleanName = (n) => n.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
let appInfo = null;

async function editNamePresets() {
  const ta = el('textarea', { class: 'np-edit', dir: 'auto', rows: 7, spellcheck: 'false' });
  ta.value = (settings.namePresets || DEFAULT_NAME_PRESETS).join('\n');
  const ok = await modal({ title: 'نام‌های آماده', text: 'هر نام در یک خط. با کلیک روی هر کدام، همان نام در کادر می‌نشیند.', body: ta,
    buttons: [{ label: 'مقدار پیش‌فرض', value: 'reset' }, { label: 'انصراف', value: null }, { label: 'ذخیره', value: 'ok', primary: true }] });
  if (ok === 'reset') updateSettings({ namePresets: [...DEFAULT_NAME_PRESETS] });
  else if (ok === 'ok') updateSettings({ namePresets: ta.value.split('\n').map(cleanName).filter(Boolean).slice(0, 30) });
}

/** Fedo's own save window: name, ready-made names, time stamp, folder and format. Resolves to {path, ext} or null. */
function saveModal(t, as) {
  return new Promise((resolve) => {
    if (!appInfo) appInfo = { documents: '' };
    const cur = t.path ? basename(t.path).replace(/\.[^.]+$/, '') : suggestedName(t).replace(/\.md$/, '');
    let folder = t.path ? dirname(t.path) : settings.lastSaveDir || appInfo.documents || '';
    let ext = t.path && /\.txt$/i.test(t.path) ? 'txt' : 'md';
    const inp = el('input', { type: 'text', class: 'sv-name', dir: 'auto', lang: 'en', spellcheck: 'false' });
    inp.value = cur === 'بدون عنوان' ? '' : cur;
    inp.placeholder = 'File name';
    const extTag = el('span', { class: 'sv-ext', dir: 'ltr' }, '.' + ext);
    const chips = el('div', { class: 'sv-chips' });
    const renderChips = () => {
      chips.innerHTML = '';
      for (const n of settings.namePresets || DEFAULT_NAME_PRESETS) {
        chips.append(el('button', { class: 'sv-chip', dir: 'auto', onclick: () => { inp.value = n; inp.focus(); check(); } }, n));
      }
      chips.append(el('button', { class: 'sv-chip sv-time', title: 'تاریخ و ساعت به آخر نام اضافه می‌شود تا نام تکراری نشود', html: ICON.clock + '<span>زمان</span>',
        onclick: () => { const base = inp.value.trim().replace(STAMP_RE, ''); inp.value = (base ? base + ' ' : '') + timeStamp(); inp.focus(); check(); } }));
      chips.append(el('button', { class: 'sv-chip sv-edit', title: 'ویرایش نام‌های آماده', html: ICON.edit,
        onclick: async () => { ov.style.visibility = 'hidden'; await editNamePresets(); ov.style.visibility = ''; renderChips(); inp.focus(); } }));
    };
    renderChips();
    const folderTxt = el('span', { class: 'sv-folder-path', dir: 'ltr', title: folder }, folder || 'انتخاب نشده');
    const folderRow = el('div', { class: 'sv-folder' }, el('span', { class: 'sv-label' }, 'پوشه'), folderTxt,
      el('button', { class: 'btn', onclick: async () => { const d = await api.openFolderDialog(); if (d) { folder = d; folderTxt.textContent = d; folderTxt.title = d; check(); } } }, 'تغییر…'));
    const fmts = el('div', { class: 'sv-formats' });
    for (const f of SAVE_FORMATS) {
      fmts.append(el('button', { class: 'sv-fmt' + (f.ext === ext ? ' on' : ''), 'data-ext': f.ext,
        onclick: (e) => { ext = f.ext; fmts.querySelectorAll('.sv-fmt').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); extTag.textContent = '.' + ext; check(); } },
        el('b', {}, f.label), el('small', { dir: 'ltr' }, f.sub)));
    }
    const note = el('div', { class: 'sv-note' });
    const okBtn = el('button', { class: 'btn primary' }, 'ذخیره');
    const check = () => {
      const exportOnly = ext === 'html' || ext === 'pdf';
      okBtn.textContent = exportOnly ? 'ساخت خروجی' : 'ذخیره';
      note.textContent = exportOnly ? 'یک نسخه‌ی ' + (ext === 'pdf' ? 'PDF' : 'HTML') + ' ساخته می‌شود؛ خود سند همین‌جا باز می‌ماند.' : '';
      okBtn.disabled = !cleanName(inp.value) || !folder;
    };
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const submit = () => {
      const name = cleanName(inp.value);
      if (!name || !folder) return;
      const sep = folder.includes('\\') ? '\\' : '/';
      done({ path: folder.replace(/[\\/]+$/, '') + sep + name + '.' + ext, ext, folder });
    };
    okBtn.addEventListener('click', submit);
    inp.addEventListener('input', check);
    const onKey = (e) => {
      if (ov.style.visibility === 'hidden') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && document.activeElement === inp) { e.preventDefault(); e.stopPropagation(); submit(); }
    };
    const box = el('div', { class: 'modal save-modal', dir: 'rtl' },
      el('div', { class: 'm-body' },
        el('h3', {}, as ? 'ذخیره با نام تازه' : 'ذخیره‌ی سند'),
        el('div', { class: 'sv-name-row' }, inp, extTag),
        el('div', { class: 'sv-label' }, 'نام‌های آماده'), chips,
        folderRow,
        el('div', { class: 'sv-label' }, 'قالب'), fmts, note),
      el('div', { class: 'row' },
        el('button', { class: 'btn sv-native', title: 'پنجره‌ی ذخیره‌ی خود ویندوز', onclick: async () => { done({ native: true }); } }, 'پنجره‌ی ویندوز…'),
        el('span', { class: 'grow' }),
        el('button', { class: 'btn', onclick: () => done(null) }, 'انصراف'), okBtn));
    const ov = el('div', { class: 'overlay' }, box);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(ov);
    check();
    inp.focus(); inp.select();
  });
}
async function askSavePath(t, as) {
  for (;;) {
    const r = await saveModal(t, as);
    if (!r) return null;
    if (r.native) { const p = await api.saveDialog(suggestedName(t)); return p ? { path: p, ext: /\.txt$/i.test(p) ? 'txt' : 'md' } : null; }
    const ex = await api.stat(r.path).catch(() => ({ exists: false }));
    if (ex.exists && !samePath(r.path, t.path)) {
      const ok = await modal({ title: `«${basename(r.path)}» از قبل هست`, text: 'جایگزین شود؟ محتوای فعلی آن فایل از بین می‌رود.',
        buttons: [{ label: 'انتخاب نام دیگر', value: false }, { label: 'جایگزین کن', value: true, danger: true }] });
      if (!ok) continue;
    }
    updateSettings({ lastSaveDir: r.folder });
    return r;
  }
}
async function exportTo(t, kind, p) {
  if (t.mode === 'source') setMode(t, 'wysiwyg');
  try {
    const out = await exportDocument({ kind, layout: settings.pdfLayout || 'continuous', html: getEditorHTML(t.crepe), title: basename(p).replace(/\.[^.]+$/, ''), baseDir: settings.baseDir, docPath: p, directPath: p });
    if (out) toast('خروجی ساخته شد: ' + basename(out), 8000, [
      { label: 'باز کردن فایل', run: () => api.openExternal(out) },
      { label: 'نمایش در پوشه', run: () => api.reveal(out) },
    ]);
  } catch (e) { toast('ساخت خروجی ممکن نشد: ' + (e.message || e)); }
}

async function save(t = active(), as = false, silent = false) {
  if (!t) return false;
  let p = t.path;
  if (!p || as) {
    const r = await askSavePath(t, as);
    if (!r) return false;
    if (r.ext === 'html' || r.ext === 'pdf') { await exportTo(t, r.ext, r.path); return false; }
    p = r.path;
  }
  const oldPath = t.path;
  const content = t.mode === 'source' && t.cm ? t.cm.state.doc.toString() : t.md;
  try {
    const r = await api.writeFile(p, content);
    t.mtime = r.mtime;
  } catch (e) {
    toast('ذخیره ممکن نشد: ' + (e.message || e), 5000, null, 'err');
    return false;
  }
  if (oldPath && !samePath(oldPath, p)) { await api.historyMove(oldPath, p); api.unwatch(oldPath); }
  if (!samePath(oldPath, p)) api.watch(p);
  t.path = p;
  t.md = content;
  t.baseline = content;
  t.diskContent = content;
  t.dirty = false;
  dropDraft(t);
  await api.historyAdd(p, content, 'save');
  t.lastSnap = content;
  t.lastSnapTime = Date.now();
  addRecent(p);
  renderTabs();
  updateTitle();
  updateStatus(silent ? 'ذخیره‌ی خودکار' : 'ذخیره شد');
  if (t.id === activeId && historyPanel.visible()) historyPanel.refresh();
  saveSession();
  return true;
}
async function saveAll() {
  for (const t of tabs.filter((x) => x.dirty)) if (!(await save(t))) return false;
  return true;
}

function setContent(t, md, { asSaved = false } = {}) {
  if (t.mode === 'source' && t.cm) {
    t.cm.dispatch({ changes: { from: 0, to: t.cm.state.doc.length, insert: md } });
  } else {
    setMarkdown(t.crepe, md);
    t.md = t.crepe.getMarkdown();
  }
  if (asSaved) t.baseline = t.md;
  contentChanged(t, t.mode === 'source' ? md : t.md);
}

async function restoreVersion(text) {
  const t = active();
  if (t.path && t.md !== t.lastSnap) await api.historyAdd(t.path, t.md, 'restore');
  else if (t.path) await api.historyAdd(t.path, t.md, 'restore');
  setContent(t, text);
  t.lastSnap = t.md;
}

// external edits
async function onExternalChange(p) {
  for (const t of tabs.filter((x) => samePath(x.path, p))) {
    const st = await api.stat(p);
    if (!st.exists || st.mtime === t.mtime) continue;
    const { content, mtime } = await api.readFile(p);
    t.mtime = mtime;
    if (content === t.diskContent) continue;
    t.diskContent = content;
    if (!t.dirty) {
      if (t.md !== t.lastSnap) await api.historyAdd(p, t.md, 'auto');
      setContent(t, content, { asSaved: true });
      await api.historyAdd(p, t.md, 'external');
      t.lastSnap = t.md;
      toast(`«${basename(p)}» بیرون از برنامه تغییر کرد و به‌روز شد`);
    } else {
      const r = await modal({
        title: `«${basename(p)}» بیرون از برنامه تغییر کرد`,
        text: 'شما هم تغییرات ذخیره‌نشده دارید. نسخه‌ی روی دیسک را بارگذاری کنم؟ متن فعلی شما در تاریخچه می‌ماند.',
        buttons: [{ label: 'نگه داشتن متن من', value: false }, { label: 'بارگذاری از دیسک', value: true, primary: true }],
      });
      if (r) {
        await api.historyAdd(p, t.md, 'auto');
        setContent(t, content, { asSaved: true });
      }
    }
  }
}

function addRecent(p) {
  settings.recent = [{ path: p, time: Date.now() }, ...settings.recent.filter((x) => !samePath(x.path, p))].slice(0, RECENT_MAX);
  persistSettings();
  if (settings.sideView === 'recent') renderRecent();
}
async function renderRecent() {
  if (settings.sideView !== 'recent' || !settings.sidebar) return;
  const body = $('#side-body');
  const list = settings.recent;
  const items = await Promise.all(list.map(async (r) => ({ ...r, exists: (await api.stat(r.path)).exists })));
  if (settings.sideView !== 'recent') return;
  body.innerHTML = '';
  body.append(el('div', { class: 'tree-root' }, el('span', {}, `${fa(list.length)} فایل آخر`),
    list.length ? el('button', { class: 'btn', style: 'padding:2px 8px;font-size:11px', onclick: () => { updateSettings({ recent: [] }); } }, 'پاک کردن') : null));
  if (!list.length) { body.append(el('div', { class: 'side-empty' }, 'هنوز فایلی باز نکرده‌اید.')); return; }
  const cur = active();
  for (const r of items) {
    const it = el('div', { class: 'recent-item' + (r.exists ? '' : ' missing') + (cur && samePath(cur.path, r.path) ? ' current' : ''), title: r.path },
      el('span', { class: 'rn', dir: bidi(basename(r.path)) }, basename(r.path)),
      el('span', { class: 'rp' }, dirname(r.path)),
      el('span', { class: 'rt' }, r.exists ? (r.time ? relTime(r.time) : '') : 'فایل پیدا نشد'));
    it.addEventListener('click', () => { if (r.exists) openPath(r.path); else toast('این فایل جابه‌جا یا حذف شده'); });
    it.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu([
        { label: 'باز کردن', disabled: !r.exists, run: () => openPath(r.path) },
        { label: 'نمایش در پوشه', disabled: !r.exists, run: () => api.reveal(r.path) },
        { label: 'حذف از فهرست', run: () => updateSettings({ recent: settings.recent.filter((x) => !samePath(x.path, r.path)) }) },
      ], e.clientX, e.clientY);
    });
    body.append(it);
  }
}

// auto snapshots while writing
setInterval(() => {
  for (const t of tabs) {
    if (!t.path || t.md === t.lastSnap) continue;
    if (Date.now() - t.lastSnapTime < settings.snapshotMinutes * 60000) continue;
    api.historyAdd(t.path, t.md, 'auto').then(() => {
      t.lastSnap = t.md;
      t.lastSnapTime = Date.now();
      if (t.id === activeId && historyPanel.visible()) historyPanel.refresh();
    });
  }
}, 30000);

// ======================================================================
// source mode
// ======================================================================
function setMode(t, mode) {
  if (t.mode === mode) return;
  if (mode === 'source') {
    const md = t.md;
    if (!t.cm) t.cm = createSource(t.src, md, (text) => { if (t.mode === 'source') contentChanged(t, text); }, (sel) => { if (t.id === activeId) showSelectionCount(sel); });
    else t.cm.dispatch({ changes: { from: 0, to: t.cm.state.doc.length, insert: md } });
    t.cm.dispatch({ effects: readOnlyComp.reconfigure(CMState.readOnly.of(!!t.locked)) });
    applySpell(t);
    t.mode = 'source';
    t.pane.classList.add('source-mode');
  } else {
    const text = t.cm.state.doc.toString();
    t.mode = 'wysiwyg';
    t.pane.classList.remove('source-mode');
    if (text !== t.crepe.getMarkdown()) {
      const wasBaseline = text === t.baseline;
      setMarkdown(t.crepe, text);
      t.md = t.crepe.getMarkdown();
      if (wasBaseline) t.baseline = t.md;
      contentChanged(t, t.md);
    }
  }
  if (t.id === activeId) {
      renderTabs(); updateStatus(); renderOutline(); focusEditor(t);
    if (findOpen()) runFind();
  }
}
function toggleSource() {
  const t = active();
  if (t) setMode(t, t.mode === 'source' ? 'wysiwyg' : 'source');
}

// ======================================================================
// sidebar: files + outline
// ======================================================================
// In a small window the sidebar steps aside by itself; the button still opens it by hand.
let sidebarAutoHidden = false;
function toggleSidebar() {
  if (sidebarAutoHidden) { sidebarAutoHidden = false; applySidebar(); return; }
  if (document.body.classList.contains('compact') && settings.sidebar) { sidebarAutoHidden = true; applySidebar(); return; }
  updateSettings({ sidebar: !settings.sidebar });
}
const COMPACT_W = 980, NARROW_SIDEBAR_W = 900, VTABS_MIN_W = 760;
function applyCompact() {
  const compact = innerWidth < COMPACT_W;
  document.body.classList.toggle('compact', compact);
  if (document.body.classList.contains('vertical-tabs') !== vertTabsOn()) applySidebar();
  const small = innerWidth < NARROW_SIDEBAR_W;
  if (small !== applyCompact.small) {
    applyCompact.small = small;
    sidebarAutoHidden = small;
    applySidebar();
  }
  const ed = $('#editors');
  if (ed) document.body.classList.toggle('narrow-page', ed.clientWidth < 760);
}
window.addEventListener('resize', () => applyCompact());
document.addEventListener('mousedown', (e) => {
  const sb = $('#statusbar');
  if (sb && sb.classList.contains('open') && !e.target.closest('#st-extra, #st-more, .menu, .popover, .size-panel, .zoom-panel')) sb.classList.remove('open');
});
function setSideView(v) { updateSettings({ sideView: v }); }
const vertTabsOn = () => !!settings.verticalTabs && innerWidth >= VTABS_MIN_W;
function applySidebar() {
  const vert = vertTabsOn();
  if (document.body.classList.contains('vertical-tabs') !== vert) { document.body.classList.toggle('vertical-tabs', vert); renderTabs(); }
  const sideOn = settings.sidebar && !sidebarAutoHidden;
  $('#sidebar').hidden = !sideOn;
  $('#btn-sidebar').classList.toggle('on', sideOn);
  requestAnimationFrame(() => { const ed = $('#editors'); if (ed) document.body.classList.toggle('narrow-page', ed.clientWidth < 760); });
  document.querySelectorAll('.side-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.sideView));
  if (settings.sideView === 'files') renderTree();
  else if (settings.sideView === 'recent') renderRecent();
  else renderOutline();
}

let treeCache = null;
async function openFolder(dir) {
  if (!dir) dir = await api.openFolderDialog();
  if (!dir) return;
  treeCache = null;
  updateSettings({ folder: dir, sidebar: true, sideView: 'files' });
}
async function renderTree(force = false) {
  if (settings.sideView !== 'files' || !settings.sidebar) return;
  const body = $('#side-body');
  if (!settings.folder) {
    body.innerHTML = '';
    body.append(el('div', { class: 'side-empty' }, 'هنوز پوشه‌ای باز نشده.', el('br'),
      el('button', { class: 'btn', onclick: () => openFolder() }, 'باز کردن پوشه')));
    return;
  }
  if (!treeCache || force) treeCache = await api.tree(settings.folder);
  body.innerHTML = '';
  body.append(el('div', { class: 'tree-root', title: settings.folder },
    el('span', {}, basename(settings.folder)),
    el('span', { class: 'tree-tools' },
      el('button', { class: 'icon-btn', title: 'به‌روزرسانی', html: ICON.refresh, onclick: () => renderTree(true) }),
      el('button', { class: 'icon-btn', title: 'بستن پوشه', html: ICON.x, onclick: () => { treeCache = null; updateSettings({ folder: null }); } }))));
  const build = (nodes) => nodes.map((n) => {
    if (n.type === 'dir') {
      const head = el('div', { class: 'tree-item tree-dir', html: ICON.folder }, el('span', { dir: bidi(n.name) }, n.name));
      head.addEventListener('click', () => head.classList.toggle('collapsed'));
      return [head, el('div', { class: 'tree-children' }, build(n.children))];
    }
    const item = el('div', { class: 'tree-item', 'data-path': n.path, title: n.path, html: ICON.file }, el('span', { dir: bidi(n.name) }, n.name.replace(/\.(md|markdown|mdown|mkd)$/i, '')));
    item.addEventListener('click', () => openPath(n.path));
    return item;
  });
  if (!treeCache.length) body.append(el('div', { class: 'side-empty' }, 'فایل Markdown در این پوشه نیست.'));
  body.append(...build(treeCache).flat());
  highlightTreeCurrent();
}
function highlightTreeCurrent() {
  const t = active();
  document.querySelectorAll('.tree-item[data-path]').forEach((n) => n.classList.toggle('current', !!t && samePath(n.dataset.path, t.path)));
}

let outlineT = null;
function scheduleOutline() { clearTimeout(outlineT); outlineT = setTimeout(renderOutline, 350); }
function renderOutline() {
  if (settings.sideView !== 'outline' || !settings.sidebar) return;
  const body = $('#side-body');
  const t = active();
  body.innerHTML = '';
  if (!t) return;
  const items = t.mode === 'source' ? sourceHeadings(t.cm.state.doc.toString()) : headingsFromView(t.crepe);
  if (!items.length) { body.append(el('div', { class: 'side-empty' }, 'سرفصلی در این سند نیست. با # یک تیتر بسازید.')); return; }
  for (const h of items) {
    const it = el('div', { class: 'outline-item', 'data-l': h.level, dir: bidi(h.text) }, h.text || '…');
    it.addEventListener('click', () => {
      if (t.mode === 'source') {
        const line = t.cm.state.doc.line(h.line + 1);
        t.cm.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
        t.cm.focus();
      } else jumpTo(t.crepe, h.pos);
    });
    body.append(it);
  }
}

// ======================================================================
// status bar, title
// ======================================================================
let statusT = null;
function scheduleStatus() { clearTimeout(statusT); statusT = setTimeout(() => updateStatus(), 250); }
function countWords(md) {
  const text = md.replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\]\([^)]*\)/g, ' ').replace(/[#>*_`~|[\]\-]/g, ' ');
  const words = (text.match(/[\p{L}\p{N}‌'’]+/gu) || []).length;
  const chars = text.replace(/\s/g, '').length;
  return { words, chars };
}
function updateStatus(savedMsg) {
  const t = active();
  if (!t) return;
  const { words, chars } = countWords(t.md);
  $('#st-words').textContent = `${fa(words)} کلمه`;
  $('#st-words').title = `${fa(chars)} نویسه · حدود ${fa(Math.max(1, Math.round(words / 200)))} دقیقه مطالعه`;
  if (savedMsg) {
    const sv = $('#st-saved');
    sv.innerHTML = ICON.check;
    sv.append(el('span', {}, savedMsg));
    clearTimeout(updateStatus.t);
    updateStatus.t = setTimeout(() => { sv.textContent = ''; }, 2500);
  }
  $('#st-mode').hidden = t.mode !== 'source';
  $('#st-lock').innerHTML = (t.locked ? ICON.lock : ICON.unlock) + `<span>${t.locked ? 'حالت امن روشن است' : 'حالت امن'}</span>`;
  $('#st-lock').classList.toggle('on', !!t.locked);
  $('#st-typewriter').hidden = !settings.typewriter;
  $('#st-zoom').textContent = `${fa(Math.round((settings.zoom || 1) * 100))}٪`;
}
function updateTitle() {
  const t = active();
  const title = t ? `${t.dirty ? '• ' : ''}${tabTitle(t)} · Fedo` : 'Fedo';
  document.title = title;
  api.setTitle(title);
}

// ======================================================================
// themes & settings
// ======================================================================
function applyTheme() {
  const id = settings.theme;
  let style = $('#custom-theme');
  const custom = customThemes.find((x) => x.id === id);
  if (custom) {
    if (!style) { style = el('style', { id: 'custom-theme' }); document.head.append(style); }
    style.textContent = custom.css;
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.custom = '1';
  } else {
    if (style) style.remove();
    delete document.documentElement.dataset.custom;
    document.documentElement.dataset.theme = THEMES.find((x) => x.id === id) ? id : 'light';
  }
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark');
  setMermaidDark(dark);
  const root = document.documentElement.style;
  root.setProperty('--text-size', settings.fontSize + 'px');
  root.setProperty('--page-width', settings.pageWidth + 'px');
  root.setProperty('--line-height', settings.lineHeight);
  root.setProperty('--zoom', settings.zoom || 1);
  const SANS = "'Vazirmatn', 'Segoe UI', system-ui, sans-serif";
  for (const [key, v] of [['textFont', '--font-text'], ['headFont', '--font-head'], ['uiFont', '--font-ui']]) {
    if (settings[key]) root.setProperty(v, fontStack(settings[key], SANS));
    else root.removeProperty(v);
  }
  // headings follow the text font unless they were given their own
  if (settings.textFont && !settings.headFont) root.setProperty('--font-head', fontStack(settings.textFont, SANS));
  if (THEMES.find((x) => x.id === id) && id === 'sepia') root.setProperty('--text-size', settings.fontSize + 2 + 'px');
  syncTitleBar();
}
// the native caption buttons (− □ ✕) are drawn by Windows over the top bar: keep their colours in step with the theme
const toHex = (css) => {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000'; c.fillStyle = css;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
};
function syncTitleBar() {
  if (!api.setTitleBar) return;
  requestAnimationFrame(() => {
    try {
      const cs = getComputedStyle(document.body);
      api.setTitleBar({ color: toHex(cs.backgroundColor), symbolColor: toHex(cs.color) });
    } catch { /* cosmetic only */ }
  });
}
function applyAll() {
  applyTheme();
  for (const t of tabs) { t.wys.setAttribute('dir', settings.baseDir); t.src.setAttribute('dir', settings.baseDir); }
  document.documentElement.setAttribute('spellcheck', settings.spellcheck ? 'true' : 'false');
  for (const t of tabs) applySpell(t);
  api.setSpellcheck(!!settings.spellcheck);
  api.setLogo(settings.logo);
  applySidebar();
  updateStatus();
}
let persistT = null;
function persistSettings() { clearTimeout(persistT); persistT = setTimeout(() => api.setSettings(settings), 300); }
function updateSettings(patch) {
  Object.assign(settings, patch);
  applyAll();
  persistSettings();
}
function toggleSetting(k) {
  updateSettings({ [k]: !settings[k] });
  const names = { typewriter: 'حالت ماشین‌تحریر', spellcheck: 'غلط‌یابی املایی' };
  if (names[k]) toast(`${names[k]} ${settings[k] ? 'روشن' : 'خاموش'} شد`);
}

async function openThemeMenu(anchor) {
  customThemes = await api.customThemes();
  const r = anchor.getBoundingClientRect();
  showMenu([
    { header: 'تم‌های پیش‌فرض' },
    ...THEMES.map((th) => ({ label: th.name, checked: settings.theme === th.id, run: () => updateSettings({ theme: th.id }) })),
    ...(customThemes.length ? [{ header: 'تم‌های شما' }, ...customThemes.map((th) => ({ label: th.name, checked: settings.theme === th.id, run: () => updateSettings({ theme: th.id }) }))] : []),
    'sep',
    { label: 'باز کردن پوشه‌ی تم‌ها', run: () => api.openThemesFolder() },
  ], r.right, r.bottom + 4);
}

function fontItems(key) {
  return FONTS.map((f) => ({
    label: f.name, checked: settings[key] === f.id,
    style: f.id ? `font-family: '${f.id}'` : null,
    run: () => updateSettings({ [key]: f.id }),
  }));
}
function openFontMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  const custom = (key) => (settings[key] && !FONTS.find((f) => f.id === settings[key]) ? [{ label: settings[key], checked: true, style: `font-family: '${settings[key]}'`, run: () => {} }] : []);
  showMenu([
    { header: 'فونت متن' },
    ...fontItems('textFont'), ...custom('textFont'),
    'sep',
    { label: 'فونت تیترها', sub: [{ label: 'مثل متن', checked: !settings.headFont, run: () => updateSettings({ headFont: '' }) }, ...fontItems('headFont').slice(1), ...custom('headFont')] },
    { label: 'فونت منوها و رابط', sub: [...fontItems('uiFont'), ...custom('uiFont')] },
    { label: 'فونت‌های نصب‌شده روی ویندوز…', run: openSettings },
  ], r.right, r.top);
}

async function openSettings() {
  customThemes = await api.customThemes();
  const sys = await loadSystemFonts();
  const fontSel = (id, val, first) => el('select', { id },
    el('optgroup', { label: 'فونت‌های برنامه' }, [first || FONTS[0], ...FONTS.slice(1)].map((f) => el('option', { value: f.id, selected: f.id === val }, f.name))),
    sys.length ? el('optgroup', { label: 'فونت‌های ویندوز' }, sys.map((f) => el('option', { value: f, selected: f === val }, f))) : null);
  const sel = (id, opts, val) => el('select', { id }, opts.map(([v, l]) => el('option', { value: v, selected: String(v) === String(val) }, l)));
  const num = (id, val, min, max, step = 1) => el('input', { type: 'number', id, value: val, min, max, step });
  const chk = (id, val) => el('input', { type: 'checkbox', id, checked: val });
  const body = el('div', { class: 'settings' },
    el('label', {}, 'تم'), sel('s-theme', [...THEMES.map((t) => [t.id, t.name]), ...customThemes.map((t) => [t.id, t.name])], settings.theme),
    el('label', {}, 'فونت متن'), fontSel('s-tf', settings.textFont),
    el('label', {}, 'فونت تیترها'), fontSel('s-hf', settings.headFont, { id: '', name: 'مثل متن' }),
    el('label', {}, 'فونت رابط'), fontSel('s-uf', settings.uiFont),
    el('label', {}, 'جهت پیش‌فرض'), sel('s-dir', [['rtl', 'راست‌به‌چپ (فارسی)'], ['ltr', 'چپ‌به‌راست (انگلیسی)']], settings.baseDir),
    el('label', {}, 'اندازه‌ی متن'), num('s-size', settings.fontSize, 12, 28),
    el('label', {}, 'فاصله‌ی خطوط'), num('s-lh', settings.lineHeight, 1.3, 2.6, 0.05),
    el('label', {}, 'عرض صفحه'), num('s-width', settings.pageWidth, 560, 1600, 20),
    el('label', {}, 'ذخیره‌ی خودکار'), chk('s-autosave', settings.autosave),
    el('label', {}, 'ثبت نسخه هر'), el('span', {}, num('s-snap', settings.snapshotMinutes, 1, 60), ' دقیقه'),
    el('label', {}, 'بازکردن تب‌های قبلی'), chk('s-session', settings.restoreSession));
  const r = await modal({ title: 'تنظیمات', body, buttons: [{ label: 'انصراف', value: false }, { label: 'ذخیره', value: true, primary: true }] });
  if (!r) return;
  const v = (id) => body.querySelector('#' + id);
  updateSettings({
    theme: v('s-theme').value, baseDir: v('s-dir').value,
    textFont: v('s-tf').value, headFont: v('s-hf').value, uiFont: v('s-uf').value,
    fontSize: Number(v('s-size').value) || 17, lineHeight: Number(v('s-lh').value) || 1.95, pageWidth: Number(v('s-width').value) || 860,
    autosave: v('s-autosave').checked, snapshotMinutes: Math.max(1, Number(v('s-snap').value) || 5), restoreSession: v('s-session').checked,
  });
}

// ======================================================================
// main menu
// ======================================================================
function openMainMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  const recent = settings.recent;
  const fontNow = (key) => (settings[key] && !FONTS.find((f) => f.id === settings[key]) ? [{ label: settings[key], checked: true, style: `font-family: '${settings[key]}'`, run: () => {} }] : []);
  anchor.classList.add('open');
  showMenu([
    { tiles: [
      { icon: ICON.plusSquare, label: 'سند تازه', title: 'Ctrl+T', run: () => newTab() },
      { icon: ICON.folder, label: 'باز کردن', title: 'Ctrl+O', run: openDialog },
      { icon: ICON.save, label: 'ذخیره', title: 'Ctrl+S', run: () => save() },
      { icon: ICON.download, label: 'خروجی', title: 'ذخیره با قالب دیگر: HTML یا PDF', run: () => save(active(), true) },
    ] },
    { icon: ICON.search, label: 'باز کردن سریع', key: 'Ctrl+P', run: openQuickOpen },
    { icon: ICON.folder, label: 'باز کردن پوشه…', key: 'Ctrl+Shift+O', run: () => openFolder() },
    { icon: ICON.clock, label: 'فایل‌های اخیر', disabled: !recent.length, sub: [
      ...recent.map((x) => ({ icon: ICON.file, label: basename(x.path), run: () => openPath(x.path) })),
      'sep',
      { icon: ICON.sidebar, label: 'نمایش در نوار کناری', run: () => updateSettings({ sidebar: true, sideView: 'recent' }) },
      { icon: ICON.trash, label: 'پاک کردن فهرست', run: () => updateSettings({ recent: [] }) },
    ] },
    { icon: ICON.save, label: 'ذخیره با نام…', key: 'Ctrl+Shift+S', run: () => save(active(), true) },
    { icon: ICON.copy, label: 'ذخیره‌ی همه', key: 'Ctrl+Alt+S', run: saveAll },
    { icon: ICON.window, label: 'پنجره‌ی جدید', key: 'Ctrl+N', run: () => api.newWindow() },
    'sep',
    { icon: ICON.sidebar, label: 'نوار کناری', key: 'Ctrl+Shift+L', switch: () => settings.sidebar && !sidebarAutoHidden, run: toggleSidebar },
    { icon: ICON.vtabs, label: 'تب‌های عمودی', switch: () => !!settings.verticalTabs, run: () => updateSettings({ verticalTabs: !settings.verticalTabs }) },
    { icon: ICON.code, label: 'کد منبع', key: 'Ctrl+/', switch: () => !!(active() && active().mode === 'source'), run: toggleSource },
    { icon: ICON.lock, label: 'حالت امن', key: 'F8', switch: () => !!(active() && active().locked), run: () => { const a = active(); if (a) setLocked(a, !a.locked); } },
    { icon: ICON.keyboard, label: 'حالت ماشین‌تحریر', key: 'F9', switch: () => !!settings.typewriter, run: () => toggleSetting('typewriter') },
    { icon: ICON.tickSquare, label: 'غلط‌یابی املایی', switch: () => !!settings.spellcheck, run: () => toggleSetting('spellcheck') },
    { icon: ICON.pin, label: 'همیشه روی پنجره‌ها', switch: () => document.body.classList.contains('on-top'), run: toggleOnTop },
    { icon: ICON.zoom, label: 'بزرگ‌نمایی', stepper: { value: () => `${fa(Math.round((settings.zoom || 1) * 100))}٪`, up: () => zoomBy(1), down: () => zoomBy(-1) } },
    'sep',
    { icon: ICON.palette, label: 'ظاهر', sub: [
      { header: 'تم' },
      ...THEMES.map((th) => ({ label: th.name, checked: settings.theme === th.id, run: () => updateSettings({ theme: th.id }) })),
      ...customThemes.map((th) => ({ label: th.name, checked: settings.theme === th.id, run: () => updateSettings({ theme: th.id }) })),
      'sep',
      { label: 'فونت متن', sub: [...fontItems('textFont'), ...fontNow('textFont')] },
      { label: 'فونت تیترها', sub: [{ label: 'مثل متن', checked: !settings.headFont, run: () => updateSettings({ headFont: '' }) }, ...fontItems('headFont').slice(1), ...fontNow('headFont')] },
      { label: 'فونت منوها و رابط', sub: [...fontItems('uiFont'), ...fontNow('uiFont')] },
      'sep',
      { label: 'آیکن برنامه…', run: openLogoPicker },
      { label: 'باز کردن پوشه‌ی تم‌ها', run: () => api.openThemesFolder() },
    ] },
    { icon: ICON.settings, label: 'تنظیمات', key: 'Ctrl+,', run: openSettings },
    { icon: ICON.keyboard, label: 'میان‌برهای صفحه‌کلید', run: showShortcuts },
  ], r.right, r.bottom + 8, () => anchor.classList.remove('open'));
}

function showShortcuts() {
  const rows = [
    ['Ctrl+T', 'سند تازه (تب جدید)'], ['Ctrl+N', 'پنجره‌ی جدید'], ['Ctrl+O', 'باز کردن'], ['Ctrl+S', 'ذخیره'], ['Ctrl+W', 'بستن تب'],
    ['Ctrl+Tab', 'تب بعدی'], ['Ctrl+Shift+T', 'بازکردن دوباره‌ی تب'], ['Ctrl+1…9', 'رفتن به تب'],
    ['Ctrl+P', 'باز کردن سریع فایل'], ['Ctrl+کلیک', 'باز کردن لینک'], ['Ctrl+= / Ctrl+- / Ctrl+0', 'زوم'],
    ['Ctrl+/', 'ویرایش زنده / کد منبع'], ['Ctrl+Shift+H', 'تاریخچه‌ی نسخه‌ها'], ['Ctrl+Shift+L', 'نوار کناری'],
    ['Ctrl+F / Ctrl+H', 'جستجو و جایگزینی'], ['F8 / F9', 'حالت امن / ماشین‌تحریر'], ['F11', 'تمام‌صفحه'],
    ['/', 'منوی درج بلوک (داخل متن)'],
  ];
  const body = el('div', { class: 'keys-list' }, rows.map(([k, l]) => el('div', { class: 'kr' }, el('span', {}, l), el('span', { class: 'kb-group' }, k.split(' / ').map((x) => kbd(x))))));
  modal({ title: 'میان‌برهای صفحه‌کلید', body, buttons: [{ label: 'بستن', value: true, primary: true }] });
}

// ======================================================================
// find / replace
// ======================================================================
const findOpts = { matchCase: false, wholeWord: false };
let findEngineTab = null;
function engineFor(t) {
  if (!t) return null;
  return t.mode === 'source' && t.cm ? cmEngine(t.cm) : pmEngine(getView(t.crepe));
}
function findOpen() { return !$('#findbar').hidden; }
function toggleReplaceRow(force) {
  const row = $('#replace-row');
  const show = force != null ? force : row.style.display === 'none';
  row.style.display = show ? '' : 'none';
  $('#find-toggle').classList.toggle('open', show);
}
function toggleFindOpt(k) {
  findOpts[k] = !findOpts[k];
  $('#find-case').classList.toggle('on', findOpts.matchCase);
  $('#find-word').classList.toggle('on', findOpts.wholeWord);
  runFind();
}
function openFind(withReplace) {
  const t = active();
  const bar = $('#findbar');
  const wasOpen = !bar.hidden;
  bar.hidden = false;
  $('#btn-find').classList.add('on');
  if (withReplace || !wasOpen) toggleReplaceRow(!!withReplace || (wasOpen && $('#replace-row').style.display !== 'none'));
  const q = $('#find-q');
  let sel = '';
  if (t && t.mode === 'source' && t.cm) { const r = t.cm.state.selection.main; sel = t.cm.state.sliceDoc(r.from, r.to); }
  else if (t) { const v = getView(t.crepe); const { from, to } = v.state.selection; sel = v.state.doc.textBetween(from, to, ' '); }
  if (sel && sel.length < 100 && !sel.includes('\n')) q.value = sel;
  q.focus(); q.select();
  runFind();
}
function closeFind() {
  $('#findbar').hidden = true;
  $('#btn-find').classList.remove('on');
  for (const t of tabs) { try { engineFor(t).clear(); } catch {} }
  $('#find-count').textContent = '';
  const t = active();
  if (t) focusEditor(t);
}
function updateFindCount() {
  const t = active();
  const e = engineFor(t);
  const q = $('#find-q').value;
  const box = $('#find-count');
  if (!e || !q) { box.textContent = ''; box.classList.remove('none'); return; }
  const { count, current, capped } = e.info();
  box.textContent = count ? `${fa(current + 1)} از ${fa(count)}${capped ? '+' : ''}` : 'یافت نشد';
  box.classList.toggle('none', !count);
}
function runFind() {
  const t = active();
  if (!t || !findOpen()) return;
  if (findEngineTab && findEngineTab !== t) { try { engineFor(findEngineTab).clear(); } catch {} }
  findEngineTab = t;
  const regex = buildRegex({ text: $('#find-q').value, ...findOpts });
  const e = engineFor(t);
  if (regex) e.setQuery(regex); else e.clear();
  updateFindCount();
}
function findStep(dir) {
  const e = engineFor(active());
  if (!e) return;
  if (!e.info().count) runFind();
  e.step(dir);
  updateFindCount();
}
function guardLocked() {
  const t = active();
  if (t && t.locked) { showLockedToast(); return true; }
  return false;
}
function replaceOne() {
  if (guardLocked()) return;
  const e = engineFor(active());
  if (!e) return;
  if (!e.info().count) { runFind(); if (!e.info().count) return; }
  if (e.info().current < 0) { e.step(1); updateFindCount(); return; }
  e.replaceCurrent($('#find-r').value);
  updateFindCount();
}
async function replaceAllText() {
  if (guardLocked()) return;
  const e = engineFor(active());
  const q = $('#find-q').value;
  if (!e || !q) return;
  runFind();
  const n = e.info().count;
  if (!n) { toast('موردی پیدا نشد'); return; }
  const r = $('#find-r').value;
  const ok = await modal({
    title: `${fa(n)} مورد پیدا شد`,
    text: r ? `همه‌ی «${q}»ها با «${r}» جایگزین شوند؟` : `همه‌ی «${q}»ها حذف شوند؟`,
    buttons: [{ label: 'انصراف', value: false }, { label: r ? 'جایگزینی همه' : 'حذف همه', value: true, primary: true }],
  });
  if (!ok) return;
  const done = e.replaceAll(r);
  updateFindCount();
  toast(`${fa(done)} مورد جایگزین شد. برای برگرداندن Ctrl+Z`);
}
function openPresetMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  showMenu([
    { header: 'اقدام‌های آماده روی کل سند' },
    ...PRESETS.map((p) => ({ label: p.label, run: () => runPreset(p) })),
  ], r.right, r.bottom + 4);
}
async function runPreset(p) {
  const t = active();
  if (!t) return;
  if (p.find) {
    $('#find-q').value = p.find;
    runFind();
    const n = engineFor(t).info().count;
    toast(n ? `${fa(n)} مورد ${p.name || p.find} پیدا شد` : `${p.name || p.find} در متن نیست`);
    return;
  }
  if (guardLocked()) return;
  if (t.mode === 'source') { setMode(t, 'wysiwyg'); toast('برای اقدام‌های آماده، سند به حالت ویرایش زنده برگشت'); }
  const v = getView(t.crepe);
  const edits = pmCollectEdits(v, p.rule);
  if (!edits.length) { toast('موردی برای این اقدام پیدا نشد'); return; }
  const ok = await modal({
    title: `${fa(edits.length)} مورد پیدا شد`,
    text: `«${p.label}»: ${p.sample}. همه اعمال شوند؟`,
    buttons: [{ label: 'انصراف', value: false }, { label: 'اعمال همه', value: true, primary: true }],
  });
  if (!ok) return;
  pmApplyEdits(v, edits);
  runFind();
  toast(`${fa(edits.length)} مورد اصلاح شد. برای برگرداندن Ctrl+Z`);
}
function setupFindInputs() {
  const q = $('#find-q');
  const r = $('#find-r');
  let t = null;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(runFind, 120); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
  });
  r.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if ((e.ctrlKey || e.metaKey) && e.altKey) replaceAllText(); else replaceOne(); }
  });
}

// ======================================================================
// export
// ======================================================================
async function doExport(kind) {
  const t = active();
  if (!t) return;
  let layout = 'pages';
  if (kind === 'pdf') {
    const pick = el('div', { class: 'pdf-layouts' },
      ...[['continuous', 'یک صفحه‌ی پیوسته', 'عرض A4، ارتفاع به اندازه‌ی محتوا؛ بدون شکستن صفحه'], ['pages', 'صفحه‌بندی A4', 'مثل چاپ معمولی، چند صفحه']].map(([v, title, sub]) =>
        el('label', { class: 'pdf-opt' }, el('input', { type: 'radio', name: 'pdf-layout', value: v, checked: (settings.pdfLayout || 'continuous') === v }),
          el('span', {}, el('b', {}, title), el('small', {}, sub)))));
    const ok = await modal({ title: 'خروجی PDF', body: pick, buttons: [{ label: 'انصراف', value: false }, { label: 'ساخت PDF', value: true, primary: true }] });
    if (!ok) return;
    layout = pick.querySelector('input:checked').value;
    updateSettings({ pdfLayout: layout });
  }
  if (t.mode === 'source') setMode(t, 'wysiwyg');
  const name = (t.path ? basename(t.path) : suggestedName(t)).replace(/\.[^.]+$/, '');
  try {
    const out = await exportDocument({ kind, layout, html: getEditorHTML(t.crepe), title: name, baseDir: settings.baseDir, docPath: t.path });
    if (out) toast('خروجی ساخته شد: ' + basename(out), 8000, [
      { label: 'باز کردن فایل', run: () => api.openExternal(out) },
      { label: 'نمایش در پوشه', run: () => api.reveal(out) },
    ]);
  } catch (e) {
    toast('ساخت خروجی ممکن نشد: ' + (e.message || e));
  }
}

// ======================================================================
// zoom, text size, quick open
// ======================================================================
const fa2 = (v) => new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
function setZoom(z) {
  z = Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
  const t = active();
  // keep the same part of the document on screen while zooming
  const ratio = t ? t.pane.scrollTop / Math.max(1, t.pane.scrollHeight) : 0;
  updateSettings({ zoom: z });
  if (t) t.pane.scrollTop = ratio * t.pane.scrollHeight;
}
function zoomBy(dir) {
  const cur = settings.zoom || 1;
  const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.001) : [...ZOOMS].reverse().find((z) => z < cur - 0.001);
  if (next) setZoom(next);
}
document.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey) || !e.target.closest || !e.target.closest('#editors')) return;
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

const RESET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/></svg>';
let popover = null;
function closePopover() { if (popover) { popover.el.remove(); popover = null; } }
function openPopover(id, anchor, build) {
  if (popover && popover.id === id) { closePopover(); return; }
  closePopover();
  const node = el('div', { class: 'size-panel', dir: 'rtl' });
  build(node);
  document.body.append(node);
  const r = anchor.getBoundingClientRect();
  const w = node.getBoundingClientRect();
  node.style.left = Math.max(12, Math.min(r.right - w.width, innerWidth - w.width - 12)) + 'px';
  node.style.top = r.top - w.height - 8 + 'px';
  popover = { id, el: node };
  setTimeout(() => document.addEventListener('mousedown', function h(e) {
    if (popover && popover.el === node && !node.contains(e.target) && !anchor.contains(e.target)) closePopover();
    if (!popover || popover.el !== node) document.removeEventListener('mousedown', h, true);
  }, true), 0);
}
const stepper = (label, get, change, fmt) => {
  const val = el('span', { class: 'sp-val' });
  const show = () => { val.textContent = fmt(get()); };
  show();
  return el('div', { class: 'sp-row' }, el('span', { class: 'sp-label' }, label),
    el('span', { class: 'sp-step' },
      el('button', { class: 'sp-btn', title: 'بیشتر', html: ICON.plus, onclick: () => { change(1); show(); } }), val,
      el('button', { class: 'sp-btn', title: 'کمتر', html: ICON.minus, onclick: () => { change(-1); show(); } })));
};
const resetButton = (run) => el('button', { class: 'btn sp-reset', onclick: run, html: `${RESET_ICON}<span>مقدار پیش‌فرض</span>` });

function openSizePanel(anchor) {
  openPopover('size', anchor, (node) => {
    const num = (key, step, min, max) => (d) => updateSettings({ [key]: Math.round(Math.min(max, Math.max(min, settings[key] + d * step)) * 100) / 100 });
    node.append(
      stepper('اندازه‌ی متن', () => settings.fontSize, num('fontSize', 1, 12, 32), (v) => fa(v)),
      stepper('فاصله‌ی خطوط', () => settings.lineHeight, num('lineHeight', 0.05, 1.2, 3), (v) => fa2(v)),
      stepper('عرض صفحه', () => settings.pageWidth, num('pageWidth', 40, 560, 1600), (v) => fa(v)),
      el('div', { class: 'sp-foot' }, resetButton(() => {
        updateSettings({ fontSize: DEFAULTS.fontSize, lineHeight: DEFAULTS.lineHeight, pageWidth: DEFAULTS.pageWidth });
        closePopover();
      })));
  });
}
function openZoomPanel(anchor) {
  openPopover('zoom', anchor, (node) => {
    const presets = el('div', { class: 'zoom-presets' }, [0.75, 1, 1.25, 1.5, 2].map((z) =>
      el('button', { class: 'zp' + (Math.abs((settings.zoom || 1) - z) < 0.001 ? ' on' : ''), onclick: () => { setZoom(z); closePopover(); } }, `${fa(z * 100)}٪`)));
    node.append(
      stepper('زوم', () => settings.zoom || 1, (d) => zoomBy(d), (v) => `${fa(Math.round(v * 100))}٪`),
      presets,
      el('div', { class: 'sp-foot' }, resetButton(() => { setZoom(1); closePopover(); })));
  });
}

function fuzzyScore(q, text) {
  // every query letter must appear in order; contiguous runs and word starts score higher
  if (!q) return 1;
  text = text.toLowerCase();
  let ti = 0, score = 0, run = 0;
  for (const ch of q) {
    const i = text.indexOf(ch, ti);
    if (i < 0) return 0;
    run = i === ti ? run + 1 : 1;
    score += run * 2 + (i === 0 || /[\s\-_./\\]/.test(text[i - 1]) ? 3 : 0);
    ti = i + 1;
  }
  return score - text.length * 0.01;
}
async function openQuickOpen() {
  const items = new Map();
  const add = (p, kind) => { if (p && !items.has(posKey(p))) items.set(posKey(p), { path: p, kind }); };
  tabs.forEach((t) => add(t.path, 'تب باز'));
  settings.recent.forEach((r) => add(r.path, 'اخیر'));
  if (settings.folder) {
    if (!treeCache) treeCache = await api.tree(settings.folder);
    const walk = (nodes) => nodes.forEach((n) => (n.type === 'dir' ? walk(n.children) : add(n.path, basename(settings.folder))));
    walk(treeCache);
  }
  const all = [...items.values()];
  let sel = 0, shown = [];
  const input = el('input', { type: 'text', placeholder: 'اسم فایل را بنویسید…', dir: 'auto' });
  const list = el('div', { class: 'qo-list' });
  const ov = el('div', { class: 'overlay qo-overlay' }, el('div', { class: 'qo', dir: 'rtl' }, input, list));
  const close = () => { ov.remove(); const t = active(); if (t) focusEditor(t); };
  const pick = (i) => { const it = shown[i]; close(); if (it) openPath(it.path); };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = all.map((it) => ({ ...it, s: fuzzyScore(q, basename(it.path)) || fuzzyScore(q, it.path) * 0.5 }))
      .filter((it) => it.s > 0).sort((a, b) => (q ? b.s - a.s : 0)).slice(0, 50);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    if (!shown.length) list.append(el('div', { class: 'side-empty' }, all.length ? 'فایلی پیدا نشد.' : 'هنوز فایلی باز نشده. یک پوشه باز کنید تا فایل‌هایش اینجا بیایند.'));
    shown.forEach((it, i) => {
      const row = el('div', { class: 'qo-item' + (i === sel ? ' sel' : '') },
        el('span', { class: 'rn', dir: bidi(basename(it.path)) }, basename(it.path)), el('span', { class: 'qo-kind' }, it.kind), el('span', { class: 'rp' }, dirname(it.path)));
      row.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
      list.append(row);
    });
    const cur = list.querySelector('.sel');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.body.append(ov);
  render();
  input.focus();
}

// hold Ctrl to see that links are clickable
window.addEventListener('keydown', (e) => { if (e.key === 'Control' || e.key === 'Meta') document.body.classList.add('ctrl-down'); });
window.addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') document.body.classList.remove('ctrl-down'); });
window.addEventListener('blur', () => document.body.classList.remove('ctrl-down'));

// ======================================================================
// safe mode (read-only lock), spellcheck
// ======================================================================
function setLocked(t, on, silent = false) {
  t.locked = !!on;
  try { t.crepe.setReadonly(t.locked); } catch {}
  if (t.cm) t.cm.dispatch({ effects: readOnlyComp.reconfigure(CMState.readOnly.of(t.locked)) });
  t.pane.classList.toggle('locked', t.locked);
  if (t.path) {
    const k = posKey(t.path);
    const list = settings.locked.filter((x) => x !== k);
    if (t.locked) list.push(k);
    settings.locked = list.slice(-500);
    persistSettings();
  }
  renderTabs();
  if (t.id === activeId) updateStatus();
  if (!silent) toast(t.locked ? 'حالت امن روشن شد: این فایل فقط خواندنی است' : 'حالت امن خاموش شد: می‌توانید ویرایش کنید');
  if (!t.locked && t.id === activeId) focusEditor(t);
}
let lockToastAt = 0;
function showLockedToast() {
  if (Date.now() - lockToastAt < 1800) return;
  lockToastAt = Date.now();
  toast('این فایل در حالت امن است و ویرایش نمی‌شود.', 4000, { label: 'خاموش کردن حالت امن', run: () => { const t = active(); if (t) setLocked(t, false); } });
}
function isEditKey(e) {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') ) return false;
  if (document.querySelector('.overlay')) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl) return ['KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyB', 'KeyI', 'KeyK', 'Enter', 'Backspace', 'Delete'].includes(e.code) && !(e.shiftKey && e.code === 'KeyV' && false);
  if (e.altKey) return ['ArrowUp', 'ArrowDown'].includes(e.key);
  return e.key.length === 1 || ['Backspace', 'Delete', 'Enter', 'Tab'].includes(e.key);
}
function applySpell(t) {
  const v = settings.spellcheck ? 'true' : 'false';
  try { getView(t.crepe).dom.setAttribute('spellcheck', v); } catch {}
  if (t.cm) t.cm.contentDOM.setAttribute('spellcheck', v);
}

function openLogoPicker(firstRun = false) {
  const grid = el('div', { class: 'logo-grid' });
  const pick = (id) => {
    grid.querySelectorAll('.logo-opt').forEach((n) => n.classList.toggle('on', n.dataset.id === id));
    updateSettings({ logo: id });
  };
  for (const l of LOGOS) {
    const b = el('button', { class: 'logo-opt' + (settings.logo === l.id ? ' on' : ''), 'data-id': l.id, title: `آیکن ${fa(Number(l.id))}` }, el('img', { src: l.url, alt: `آیکن ${fa(Number(l.id))}` }));
    b.addEventListener('click', () => pick(l.id));
    grid.append(b);
  }
  modal({
    title: firstRun ? 'به Fedo خوش آمدید! یک آیکن انتخاب کنید' : 'آیکن برنامه',
    text: firstRun ? 'این آیکن روی پنجره و نوار وظیفه دیده می‌شود. بعداً هم از منو، «آیکن برنامه…» قابل تغییر است.' : 'آیکن پنجره و نوار وظیفه همان لحظه عوض می‌شود.',
    body: grid,
    buttons: [{ label: firstRun ? 'شروع' : 'بستن', value: true, primary: true }],
  }).then(() => { if (!settings.logoChosen) updateSettings({ logoChosen: true }); });
}

document.addEventListener('copy', (e) => {
  const t = active();
  if (!t || !t.locked || t.mode !== 'wysiwyg') return;
  const v = getView(t.crepe);
  const sel = window.getSelection();
  if (!sel.rangeCount || !v.dom.contains(sel.anchorNode)) return;
  // whole document selected → clean copy of the content (no editor buttons or labels)
  const all = sel.containsNode(v.dom.firstElementChild, true) && sel.containsNode(v.dom.lastElementChild, true);
  if (!all) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', v.state.doc.textBetween(0, v.state.doc.content.size, '\n\n', ' '));
  e.clipboardData.setData('text/html', getEditorHTML(t.crepe));
  toast('کل متن کپی شد', 'ok');
}, true);
function isTypingField() {
  const a = document.activeElement;
  return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) || !!document.querySelector('.overlay');
}
/** Ctrl+A: select the document only (never the whole window), also in safe mode */
function selectAllDoc(t) {
  if (t.mode === 'source' && t.cm) {
    t.cm.dispatch({ selection: { anchor: 0, head: t.cm.state.doc.length } });
    if (!t.locked) t.cm.focus();
    else { const s = window.getSelection(); s.removeAllRanges(); s.selectAllChildren(t.cm.contentDOM); }
    return;
  }
  const v = getView(t.crepe);
  if (!t.locked) {
    v.dispatch(v.state.tr.setSelection(new AllSelection(v.state.doc)));
    v.focus();
    return;
  }
  // read-only: select the rendered document so Ctrl+C copies just the content
  const s = window.getSelection();
  s.removeAllRanges();
  s.selectAllChildren(v.dom);
}

/**
 * A click inside the document must never move the page. Right after a click, any scroll that
 * did not come from the wheel, the keyboard or dragging (selection / scrollbar) is undone.
 */
function installClickScrollGuard(t) {
  const pane = t.pane;
  const g = { down: false, moved: false, y: 0, until: 0, x0: 0, y0: 0 };
  // a click anywhere else (scrollbar, sidebar, outline, menus) is a deliberate move: stop guarding
  window.addEventListener('mousedown', (e) => {
    if (e.target === pane || !t.wys.contains(e.target)) { g.until = 0; g.down = false; }
  }, true);
  pane.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target === pane) return; // the scrollbar belongs to the pane itself
    g.down = true; g.moved = false; g.y = pane.scrollTop; g.x0 = e.clientX; g.y0 = e.clientY;
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (g.down && !g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 4) g.moved = true;
  }, true);
  window.addEventListener('mouseup', () => {
    if (!g.down) return;
    g.down = false;
    g.y = pane.scrollTop;
    g.until = Date.now() + 700;
  }, true);
  const release = () => { g.until = 0; g.down = false; };
  pane.addEventListener('wheel', release, { passive: true });
  pane.addEventListener('keydown', release, true);
  window.addEventListener('keydown', (e) => { if (t.id === activeId) release(); }, true);
  pane.addEventListener('scroll', () => {
    if (g.down) { if (!g.moved && Math.abs(pane.scrollTop - g.y) > 1) pane.scrollTop = g.y; return; }
    if (Date.now() < g.until && Math.abs(pane.scrollTop - g.y) > 1) pane.scrollTop = g.y;
  });
}

// ======================================================================
// session
// ======================================================================
let sessionT = null;
function saveSessionSoon() { clearTimeout(sessionT); sessionT = setTimeout(saveSession, 800); }
function saveSession() {
  if (winRole !== 'main') return Promise.resolve();
  const list = tabs.filter((t) => t.path).map((t) => ({ path: t.path, mode: t.mode, group: t.groupId || null }));
  const used = new Set(list.map((x) => x.group).filter(Boolean));
  const a = active();
  return api.setSession({ tabs: list, active: a && a.path ? a.path : null, groups: [...groups.values()].filter((g) => used.has(g.id)) });
}

// ======================================================================
// keyboard, drag & drop, paste
// ======================================================================
function onKey(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const code = e.code;
  const t = active();
  const handled = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape' && !$('#findbar').hidden) { handled(); closeFind(); return; }
  if (e.key === 'F8') { handled(); if (t) setLocked(t, !t.locked); return; }
  if (t && t.locked && isEditKey(e)) { handled(); showLockedToast(); return; }
  if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyA' && t && !isTypingField()) { handled(); selectAllDoc(t); return; }
  if (e.key === 'F9') { handled(); toggleSetting('typewriter'); return; }
  if (e.key === 'F11') { handled(); api.fullscreen(); return; }
  if (e.key === 'F12' || (ctrl && e.shiftKey && code === 'KeyI')) { handled(); api.devtools(); return; }
  if (t && t.mode === 'wysiwyg' && t.wys.contains(document.activeElement) && !document.activeElement.closest('.cm-editor')) {
    if (handleTableKey(t.crepe, e)) { handled(); return; }
  }
  if (!ctrl) return;
  if (code === 'Tab') { handled(); cycleTab(e.shiftKey ? -1 : 1); return; }
  if (!e.shiftKey && !e.altKey && /^Digit[1-9]$/.test(code)) {
    handled();
    const n = Number(code.slice(5));
    const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
    if (target) activateTab(target.id);
    return;
  }
  if (code === 'PageDown') { handled(); cycleTab(1); return; }
  if (code === 'PageUp') { handled(); cycleTab(-1); return; }
  switch (code) {
    case 'KeyN': handled(); api.newWindow(); break;
    case 'KeyO': handled(); e.shiftKey ? openFolder() : openDialog(); break;
    case 'KeyS': handled(); if (e.altKey) saveAll(); else save(t, e.shiftKey); break;
    case 'KeyW': handled(); if (t) closeTab(t); break;
    case 'KeyT': handled(); if (e.shiftKey) reopenClosed(); else newTab(); break;
    case 'Slash': handled(); toggleSource(); break;
    case 'KeyH': handled(); if (e.shiftKey) historyPanel.toggle(); else openFind(true); break;
    case 'KeyF': handled(); openFind(false); break;
    case 'KeyL': if (e.shiftKey) { handled(); toggleSidebar(); } break;
    case 'Digit1': if (e.shiftKey) { handled(); updateSettings({ sidebar: true, sideView: 'outline' }); } break;
    case 'Digit3': if (e.shiftKey) { handled(); updateSettings({ sidebar: true, sideView: 'files' }); } break;
    case 'Comma': handled(); openSettings(); break;
    case 'Equal': case 'NumpadAdd': handled(); zoomBy(1); break;
    case 'Minus': case 'NumpadSubtract': handled(); zoomBy(-1); break;
    case 'Digit0': case 'Numpad0': if (!e.shiftKey && !e.altKey) { handled(); setZoom(1); } break;
    case 'KeyP': if (!e.shiftKey) { handled(); openQuickOpen(); } break;
    default: break;
  }
}

function setupDnD() {
  let hint = null;
  const isMd = (f) => /\.(md|markdown|mdown|mkd|txt)$/i.test(f.name);
  const hasFiles = (e) => e.dataTransfer && e.dataTransfer.types.includes('Files');
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    const items = [...e.dataTransfer.items];
    const md = items.some((i) => i.kind === 'file' && !/^image\//.test(i.type));
    if (md) {
      e.preventDefault();
      if (!hint) { hint = el('div', { class: 'drop-hint' }, 'رها کنید تا در تب جدید باز شود'); document.body.append(hint); }
    }
  }, true);
  window.addEventListener('dragleave', (e) => { if (hint && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) { hint.remove(); hint = null; } });
  window.addEventListener('drop', async (e) => {
    if (hint) { hint.remove(); hint = null; }
    if (!hasFiles(e)) return;
    const files = [...e.dataTransfer.files].filter(isMd);
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    for (const f of files) await openPath(api.pathForFile(f));
  }, true);
}

function setupPaste() {
  document.addEventListener('paste', async (e) => {
    const t = active();
    if (!t || t.mode !== 'wysiwyg' || !t.wys.contains(document.activeElement)) return;
    const files = [...(e.clipboardData.files || [])].filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    for (const f of files) {
      const src = await uploadImage(t, f);
      t.crepe.editor.action(insert(`![](${src.replace(/ /g, '%20')})`));
    }
  }, true);
}

// ======================================================================
// startup & shutdown
// ======================================================================
let booted = false;
const earlyOpen = [];
api.onOpenPath((p) => (booted ? openPath(p) : earlyOpen.push(p)));
api.onFileChanged((p) => onExternalChange(p));
api.onRequestClose(async () => {
  const dirty = tabs.filter((t) => t.dirty);
  if (dirty.length) {
    const r = await modal({
      title: dirty.length === 1 ? `«${tabTitle(dirty[0])}» ذخیره نشده` : `${fa(dirty.length)} سند ذخیره نشده`,
      text: 'قبل از بستن برنامه ذخیره شوند؟',
      buttons: [{ label: 'بستن بدون ذخیره', value: 'discard', danger: true }, { label: 'انصراف', value: null }, { label: dirty.length > 1 ? 'ذخیره‌ی همه' : 'ذخیره', value: 'save', primary: true }],
    });
    if (!r) return;
    if (r === 'save' && !(await saveAll())) return;
  }
  for (const t of tabs) { rememberPos(t); dropDraft(t); }
  for (const t of tabs) if (t.path && t.md !== t.lastSnap) await api.historyAdd(t.path, t.md, 'auto').catch(() => {});
  await persistNow();
  await api.closeNow();
});
async function persistNow() { clearTimeout(persistT); await api.setSettings(settings); await saveSession(); }

export async function start() {
  buildLayout();
  settings = { ...DEFAULTS, ...(await api.getSettings()) };
  settings.recent = (settings.recent || []).map((r) => (typeof r === 'string' ? { path: r, time: 0 } : r)).slice(0, RECENT_MAX);
  customThemes = await api.customThemes();
  applyTheme();
  document.addEventListener('keydown', onKey, true);
  setupFindInputs();
  setupDnD();
  setupPaste();

  const rd = await api.ready();
  const startupFiles = Array.isArray(rd) ? rd : rd.files;
  winRole = (rd && rd.role) || 'main';
  if (rd && rd.alwaysOnTop) { document.body.classList.add('on-top'); }
  api.info().then((i) => { appInfo = i; }).catch(() => {});
  api.onReceiveTab((p) => receiveTabs(p));
  api.onSetRole((r) => { winRole = r; saveSession(); });
  if (winRole !== 'main') {
    await receiveTabs(rd.payload || []);
  } else if (settings.restoreSession) {
    const s = await api.getSession();
    if (s && s.tabs) {
      for (const g of s.groups || []) groups.set(g.id, { ...g });
      for (const st of s.tabs) {
        const ex = await api.stat(st.path);
        if (ex.exists) await openPath(st.path, { activate: false }).then((t) => { if (!t) return; if (st.mode === 'source') setMode(t, 'source'); if (st.group && groups.has(st.group)) t.groupId = st.group; });
      }
      renderTabs();
      const a = tabs.find((t) => samePath(t.path, s.active));
      if (a) activateTab(a.id);
    }
  }
  const drafts = winRole === 'main' ? await api.draftList() : [];
  for (const d of drafts) {
    if (!d.content.trim()) { api.draftDelete(d.id); continue; }
    const t = await newTab({ content: d.content, draftId: d.id, activate: false });
    t.baseline = '';
    t.dirty = true;
  }
  if (drafts.length) { renderTabs(); toast(`${fa(drafts.length)} پیش‌نویس ذخیره‌نشده بازیابی شد`); }
  for (const f of startupFiles || []) await openPath(f);
  applyCompact();
  booted = true;
  for (const f of earlyOpen.splice(0)) await openPath(f);
  if (!tabs.length) await newTab({ content: settings.welcomed ? '' : WELCOME });
  else if (!activeId) activateTab(tabs[0].id);
  if (!settings.welcomed) { settings.welcomed = true; persistSettings(); }
  if (!settings.logoChosen && winRole === 'main') setTimeout(() => openLogoPicker(true), 400);
  applyAll();
}

const WELCOME = `# به Fedo خوش آمدید

این یک ویرایشگر Markdown است که هر چه می‌نویسید، همان‌جا شکل نهایی‌اش را می‌بینید.

## چند نکته‌ی سریع

- هر پاراگراف جهت خودش را از **اولین حرفش** می‌گیرد؛ فارسی راست‌به‌چپ، English left-to-right.
- برای درج تیتر، جدول، کد یا فرمول، در یک خط خالی \`/\` را بزنید.
- با \`Ctrl+/\` بین «ویرایش زنده» و «کد منبع» جابه‌جا شوید.
- هر فایلی که باز می‌کنید در **یک تب** همین پنجره باز می‌شود.
- از دکمه‌ی ساعت بالای صفحه به **تاریخچه‌ی نسخه‌ها** بروید و هر نسخه‌ی قبلی را ببینید یا برگردانید.

> نقل‌قول فارسی هم درست از سمت راست شروع می‌شود.

This paragraph is in English, so it flows left to right automatically.

| ستون اول | ستون دوم |
| --- | --- |
| فارسی | English |

$$
E = mc^2
$$
`;
