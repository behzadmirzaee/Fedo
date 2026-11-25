// Neveshtar renderer: tabs, files, sidebar, themes, settings, shortcuts
import { insert } from '@milkdown/kit/utils';
import { openSearchPanel } from '@codemirror/search';
import {
  createEditor, setMarkdown, getView, headingsFromView, jumpTo,
  createSource, setForcedDir, sourceHeadings, setMermaidDark, getEditorHTML, dirOfText, headingBackspace,
} from './editor.js';
import { TextSelection, AllSelection } from '@milkdown/kit/prose/state';
import { createHistoryPanel } from './history.js';
import { openEditorMenu, handleTableKey } from './context.js';
import { typingOpts } from './typing.js';
import { applyColor, openColorPanel } from './context.js';
import { TEXT_COLORS, BG_COLORS } from './textcolor.js';
import { DEFAULT_PINS } from './emoji.js';
import MT_THEMES_RAW from './mt-themes.json';
import { themePalette, ensure, mix } from './contrast.js';
import { installSelectionBar } from './selbar.js';
import { installKeyboardLang } from './kbdlang.js';
import { openTranslate, closeTranslate, googleSearch, LANGS } from './translate.js';
import { initFedora, aiOn, openFedora, openTopFedora, closeFedora, marksPlugin, toolbarIcon, aiName, aiIconHTML, paintBrand, loadMarks, persistMarks,
  markCount, marksPanel, noteDocChange, noteChangeForName, nameChips, RENAME_AI_ICON, aiRenameOn, openDocFedora, reviewPlugin, outIcon, registerSlot, runSlot, settingsSection as fedoraSettings } from './fedora.js';
const LOGOS = Object.entries(import.meta.glob('../logos/*.png', { eager: true, query: '?url', import: 'default' }))
  .map(([k, url]) => ({ id: k.match(/(\w+)\.png$/)[1], url })).sort((a, b) => a.id.localeCompare(b.id))
  .map((l) => ({ ...l, fun: l.id.startsWith('m'), get name() { return l.id.startsWith('m') ? tr('logo.funName', { n: fa(Number(l.id.slice(1))) }) : tr('logo.name', { n: fa(Number(l.id)) }); } }));
import { buildRegex, pmEngine, cmEngine, pmCollectEdits, pmApplyEdits, PRESETS } from './search.js';
import { readOnlyComp } from './editor.js';
import { EditorState as CMState } from '@codemirror/state';
import { exportDocument } from './export.js';
import { t as tr, setLang, getLang, langDir, langLocale, UI_LANGS } from './i18n.js';
import { el, ICON, showMenu, closeMenu, modal, toast, saveToast, kbd, fa, basename, dirname, relTime } from './ui.js';

const api = window.api;
const $ = (s) => document.querySelector(s);

export const THEMES = [
  { id: 'light', get name() { return tr('theme.light'); } },
  { id: 'dark', get name() { return tr('theme.dark'); }, dark: true },
  { id: 'sepia', get name() { return tr('theme.sepia'); } },
  { id: 'nord', get name() { return tr('theme.nord'); }, dark: true },
  { id: 'garden', get name() { return tr('theme.garden'); } },
];
// 187 extra themes (from Monkeytype), offered behind «تم‌های بیشتر»; their id in settings is «mt:<id>»
// each theme's readable colours are worked out the first time they are needed, not at start-up;
// the gallery and settings preview show the colours the theme will really use
export const MORE_THEMES = MT_THEMES_RAW.map(([id, name, dark, bg, main, sub, subAlt, text, error]) => {
  let pal = null;
  const P = () => (pal ||= themePalette({ dark: !!dark, bg, main, sub, subAlt, text, error }));
  return {
    id: 'mt:' + id, name,
    get pal() { return P(); }, get dark() { return P().dark; }, get bg() { return P().bg; }, get main() { return P().accent; },
    get sub() { return P().muted; }, get subAlt() { return P().panel; }, get text() { return P().fg; }, get error() { return P().danger; },
  };
});
/** the app's colour variables from a theme's Monkeytype colours, every pair checked for contrast (contrast.js) */
function moreThemeCss(t) {
  const p = t.pal;
  const hl = Object.entries(p.hl).map(([k, c]) => `--hl-${k}: ${c};`).join(' ');
  return `:root {
  --bg: ${p.bg}; --fg: ${p.fg}; --muted: ${p.muted};
  --border: ${p.border}; --panel: ${p.panel}; --panel-2: ${p.panel2}; --hover: ${p.hover};
  --accent: ${p.accent}; --accent-fg: ${p.accentFg}; --link: ${p.link};
  --selection: ${p.selection}; --code-bg: ${p.panel}; --quote: ${p.quote}; --danger: ${p.danger};
  ${hl}
  color-scheme: ${p.dark ? 'dark' : 'light'};
}`;
}
export const FONTS = [
  { id: '', get name() { return tr('font.themeDefault'); } },
  { id: 'Vazirmatn', get name() { return tr('font.vazirmatn'); } },
  { id: 'Dana', get name() { return tr('font.dana'); }, optional: true },
  { id: 'IRANSansX', get name() { return tr('font.iransans'); }, optional: true },
  { id: 'IRANYekanX', get name() { return tr('font.iranyekan'); }, optional: true },
  { id: 'Noto Naskh Arabic', get name() { return tr('font.naskh'); } },
].filter((f) => !f.optional || (window.__nvFonts || []).includes(f.id));
const RECENT_MAX = 10;
let systemFonts = null;
/**
 * The Windows font list; asked once and shared, since the first query can take a while.
 * Chromium only answers it during a click or key press, so a refused (empty) answer is not kept:
 * the next call, from a click, asks again.
 */
function loadSystemFonts() {
  if (!systemFonts) {
    const p = (async () => {
      try {
        const list = await window.queryLocalFonts();
        return [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
      } catch { return []; }
    })();
    systemFonts = p;
    p.then((list) => { if (!list.length && systemFonts === p) systemFonts = null; });
  }
  return systemFonts;
}
const fontName = (id) => (FONTS.find((f) => f.id === id) || { name: id }).name;
const fontStack = (id, fallback) => `'${id.replace(/'/g, '')}', ${fallback}`;

// Fedo's own values for the document look; the user can keep their own defaults on top (settings.userDefaults)
const FEDO_DOC = { fontSize: 17, lineHeight: 1.95, pageWidth: 860 };
const DOC_KEYS = Object.keys(FEDO_DOC);
const docDefaults = () => ({ ...FEDO_DOC, ...(settings.userDefaults || {}) });
const DEFAULTS = {
  textFont: '', headFont: '', uiFont: '', zoom: 1, positions: {},
  theme: 'light', uiLang: 'fa', baseDir: 'rtl', dirMode: 'auto', fontSize: 17, pageWidth: 860, lineHeight: 1.95,
  autosave: false, snapshotMinutes: 5, restoreSession: true, recent: [],
  sidebar: true, sideView: 'files', folder: null, spellcheck: false, locked: [], logo: '08', verticalTabs: false,
  autoPair: true, pasteLink: true, plainAfterPaste: true, defaultExt: 'md',
  userDefaults: null,
  extColor: true, lastColor: { color: '#D93A3A', bg: null }, extImage: true,
  extTranslate: true, extGoogle: true, trTo: 'auto', trAlts: true, trAltClick: true, trRecent: [],
  updateAuto: true, updateDownload: false, updateInstallOnQuit: true,
  // Fedora (AI assistant)
  aiProvider: 'gemini', aiName: '', aiIcon: 0, aiIconCustom: null, aiPreview: true, aiMarks: true, aiLang: 'same', aiTabNames: true,
  aiNoticeOk: false, aiLevel: 'simple', aiExample: true, aiModelCache: {}, aiBaseUrl: '', aiOaiModel: '', aiOaiFallback: '', aiManual: false,
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
      el('button', { class: 'icon-btn', id: 'btn-menu', title: tr('toolbar.mainMenu'), html: ICON.menu, onclick: (e) => openMainMenu(e.currentTarget) })),
    el('button', { id: 'upd-pill', hidden: true, onclick: (e) => openUpdatePop(e.currentTarget) }),
    el('div', { class: 'cap tabstrip', id: 'tabstrip' },
      el('div', { id: 'tabs' }),
      el('button', { class: 'icon-btn', id: 'btn-newtab', title: tr('menu.file.newTab'), html: ICON.plus, onclick: () => newTab() })),
    el('div', { class: 'grow' }),
    el('div', { class: 'cap' },
      el('button', { class: 'icon-btn', id: 'btn-split', title: tr('toolbar.split'), 'aria-label': tr('toolbar.split'), 'aria-pressed': 'false', html: ICON_SPLIT, onclick: () => toggleSplit() }),
      el('button', { class: 'icon-btn', id: 'btn-pin', title: tr('toolbar.pin'), 'aria-label': tr('toolbar.pin'), 'aria-pressed': 'false', html: ICON.pin, onclick: () => togglePin() }),
      el('button', { class: 'icon-btn', id: 'btn-history', title: tr('toolbar.history'), html: ICON.history, onclick: () => historyPanel.toggle() }),
      el('button', { class: 'icon-btn', id: 'btn-find', title: tr('toolbar.find'), html: ICON.search, onclick: () => ($('#findbar').hidden ? openFind(false) : closeFind()) }),
      el('button', { class: 'icon-btn', id: 'btn-copyall', title: tr('toolbar.copyAll'), html: ICON.copy, onclick: () => copyWholeDoc() })),
    // the assistant for the whole document
    el('button', { class: 'fd-pill', id: 'btn-fedora', title: tr('toolbar.assistantTip'), onclick: (e) => openTopFedora(active(), e.currentTarget) },
      el('span', { class: 'ic', html: aiIconHTML(settings) }), el('span', { class: 'nm' }, aiName(settings))));

  const sidebar = el('div', { id: 'sidebar' },
    el('div', { class: 'side-tabs' },
      el('button', { 'data-v': 'files', onclick: () => setSideView('files') }, tr('sidebar.files')),
      el('button', { 'data-v': 'outline', onclick: () => setSideView('outline') }, tr('sidebar.outline')),
      el('button', { 'data-v': 'recent', onclick: () => setSideView('recent') }, tr('sidebar.recent'))),
    el('div', { class: 'side-body', id: 'side-body' }));

  const findbar = el('div', { id: 'findbar', hidden: true, dir: langDir(), role: 'search' },
    el('div', { class: 'r' },
      el('label', { class: 'fld ops' },
        el('span', { class: 'ic', html: ICON.search }),
        el('input', { id: 'find-q', placeholder: tr('find.placeholder'), 'aria-label': tr('find.placeholder'), dir: 'auto', spellcheck: 'false' }),
        el('span', { class: 'count', id: 'find-count' }),
        el('button', { class: 'fb-opt', id: 'find-case', dir: 'ltr', title: tr('find.matchCase'), 'aria-pressed': 'false', onclick: () => toggleFindOpt('matchCase') }, 'Aa'),
        el('button', { class: 'fb-opt', id: 'find-word', title: tr('find.wholeWordTip'), 'aria-pressed': 'false', onclick: () => toggleFindOpt('wholeWord') }, tr('find.wholeWord'))),
      el('button', { class: 'fb-btn', title: tr('find.prev'), html: ICON.chevUp, onclick: () => findStep(-1) }),
      el('button', { class: 'fb-btn', title: tr('find.next'), html: ICON.chevDown, onclick: () => findStep(1) }),
      el('button', { class: 'fb-btn', title: tr('find.close'), html: ICON.x, onclick: closeFind })),
    el('div', { class: 'r', id: 'replace-row' },
      el('label', { class: 'fld' },
        el('span', { class: 'ic', html: ICON.swap }),
        el('input', { id: 'find-r', placeholder: tr('find.replacePlaceholder'), 'aria-label': tr('find.replacePlaceholder'), dir: 'auto', spellcheck: 'false' })),
      el('button', { class: 'fb-act', title: tr('find.replaceOneTip'), onclick: replaceOne }, tr('find.replace')),
      el('button', { class: 'fb-act', title: tr('find.replaceAllTip'), onclick: replaceAllText }, tr('find.all')),
      el('button', { class: 'fb-act', id: 'find-presets', 'aria-expanded': 'false', onclick: (e) => openPresetMenu(e.currentTarget) }, el('span', {}, tr('find.presets')), el('span', { class: 'ic', html: ICON.chevDown }))));

  const editors = el('div', { id: 'editors' });
  const history = el('div', { id: 'history', hidden: true });
  const vtabs = el('div', { id: 'vtabs' },
    el('div', { id: 'vtabs-list', ondblclick: (e) => { if (e.target.id === 'vtabs-list') newTab(); } }),
    el('button', { class: 'vt-new', title: tr('menu.file.newTab'), onclick: () => newTab() }, el('span', { class: 'ic', html: ICON.plus }), el('span', {}, tr('menu.file.newTab'))));

  const status = el('div', { id: 'statusbar' },
    el('span', { class: 'chip', id: 'st-words' }),
    el('span', { class: 'chip', id: 'st-sel' }),
    el('button', { class: 'chip', id: 'st-lock', title: tr('status.safeModeTip'), onclick: () => { const t = active(); if (t) setLocked(t, !t.locked); } }),
    el('button', { class: 'chip on', id: 'st-mode', title: tr('status.backToLiveTip'), onclick: toggleSource }, el('span', { class: 'ic', html: ICON.code }), el('span', {}, tr('status.sourceCode'))),
    el('span', { class: 'chip ok', id: 'st-saved' }),
    el('span', { class: 'grow' }),
    el('div', { class: 'dirseg', id: 'st-dir', role: 'radiogroup', 'aria-label': tr('status.docDirLabel') },
      DIR_SEG.map(([v, labelKey, tipKey, icon]) => {
        const b = el('button', { class: 'sg', 'data-v': v, role: 'radio', 'aria-checked': 'false', 'aria-label': tr(tipKey), title: tr(tipKey),
          onclick: () => { const t = active(); if (t) setTabDir(t, v); } }, el('span', { class: 'ic', html: icon }), el('span', { class: 'sg-l' }, tr(labelKey)));
        b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the document
        return b;
      })),
    el('button', { class: 'chip', id: 'st-size', title: tr('status.sizeTip'), onclick: (e) => openSizePanel(e.currentTarget) }, el('span', { class: 'ic', html: ICON.textSize }), el('span', {}, tr('status.size'))),
    el('div', { class: 'zoomer', title: tr('status.zoomTip') },
      el('button', { title: tr('status.zoomIn'), html: ICON.plus, onclick: () => zoomBy(1) }),
      el('button', { id: 'st-zoom', title: tr('status.zoomOptions'), onclick: (e) => openZoomPanel(e.currentTarget.parentNode) }),
      el('button', { title: tr('status.zoomOut'), html: ICON.minus, onclick: () => zoomBy(-1) })));
  const sheet = el('div', { id: 'sheet' }, splitHead('a'), findbar, editors, el('div', { class: 'st-mini', 'data-side': 'a' }), status);
  // split view: the second document sits in its own sheet on the left, with a draggable line between
  const sheet2 = el('div', { id: 'sheet2', hidden: true }, splitHead('b'), el('div', { id: 'editors2' }), splitPicker(), el('div', { class: 'st-mini', 'data-side': 'b' }));
  const divider = el('div', { id: 'split-dv', hidden: true, role: 'separator', 'aria-orientation': 'vertical', 'aria-label': tr('split.dividerLabel'), title: tr('split.dividerTip') }, el('i'));
  setupDivider(divider);
  for (const [sh, side] of [[sheet, 'a'], [sheet2, 'b']]) {
    // working in one side makes it the active document
    sh.addEventListener('pointerdown', (e) => {
      if (!document.body.classList.contains('split-on') || !split || e.target.closest('.split-head')) return;
      const id = side === 'a' ? split.a : split.b;
      if (id != null && id !== activeId) activateTab(id, { keepFocus: true });
    }, true);
  }
  const main = el('div', { id: 'main' }, sidebar, el('div', { id: 'split-wrap' }, sheet, divider, sheet2), history, vtabs);

  app.append(topbar, main);
  historyPanel = createHistoryPanel(history, {
    getTab: active,
    getContent: () => (active() ? active().md : ''),
    restore: restoreVersion,
    ai: { count: (t) => (t && t.crepe ? markCount(t) : 0), icon: () => aiIconHTML(settings), name: () => aiName(settings), render: (t, repaint) => marksPanel(t, repaint) },
    snapshotNow: async () => {
      const t = active();
      if (!t || !t.path) { toast(tr('toast.saveDocFirst')); return false; }
      const label = await modal({ title: tr('history.manualTitle'), text: tr('history.manualPrompt'), input: '', buttons: [{ label: tr('common.cancel'), value: null }, { label: tr('common.save'), primary: true }] });
      if (label == null) return false;
      const r = await api.historyAdd(t.path, t.md, 'manual', label.trim());
      t.lastSnap = t.md; t.lastSnapTime = Date.now();
      toast(r.skipped ? tr('history.alreadySaved') : tr('history.versionSaved'));
      return true;
    },
  });
  history.addEventListener('toggle', () => { $('#btn-history').classList.toggle('open', !history.hidden); applySplit(); });
  // tabs, group chips and buttons have their own menus; everything else in the bar gets the strip menu
  const onStripMenu = (e) => {
    if (e.target.closest('.tab, .gchip, .group-chip, button, input, [data-gid]')) return;
    e.preventDefault();
    stripMenu(e.clientX, e.clientY);
  };
  topbar.addEventListener('contextmenu', onStripMenu);
  vtabs.addEventListener('contextmenu', onStripMenu);
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
  if (t.title) return t.title;
  return t.untitledN === 1 ? tr('doc.untitled') : tr('doc.untitledN', { n: fa(t.untitledN) });
}
/** each tab can have its own direction; without one it follows the setting */
const dirIcon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
// order in the DOM: forced right, automatic, forced left
const DIR_SEG = [
  ['rtl', 'dir.rtlShort', 'dir.rtlTip', dirIcon('M4 6h16M9 10h11M4 14h16M11 18h9')],
  ['auto', 'dir.auto', 'dir.autoTip', dirIcon('M4 6h9M11 10h9M4 14h9M11 18h9')],
  ['ltr', 'dir.ltrShort', 'dir.ltrTip', dirIcon('M4 6h16M4 10h11M4 14h16M4 18h9')],
];
function paintDirSeg(t) {
  const a = t ? tabAlign(t) : 'auto';
  document.querySelectorAll('#st-dir .sg').forEach((b) => { const on = b.dataset.v === a; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
}
// Three modes per tab: 'rtl' (every line starts on the right), 'auto' (by each line's text) and 'ltr'.
// A tab without its own choice follows the setting. Code blocks in a programming language always stay LTR.
const DIR_MODES = ['rtl', 'auto', 'ltr'];
const tabAlign = (t) => (DIR_MODES.includes(t.align) ? t.align : DIR_MODES.includes(settings.dirMode) ? settings.dirMode : 'auto');
/** base direction of the page: the forced side, or (automatic) the side empty lines start from */
const tabDir = (t) => { const a = tabAlign(t); return a === 'auto' ? langDir() : a; };
function applyTabDir(t) {
  const a = tabAlign(t), d = tabDir(t);
  for (const n of [t.wys, t.src]) {
    n.setAttribute('dir', d);
    if (a === 'auto') n.removeAttribute('data-align'); else n.setAttribute('data-align', a);
  }
  if (t.crepe) setForcedDir(t.crepe, a);
  if (t === active()) paintDirSeg(t);
}
function setTabDir(t, align) {
  t.align = DIR_MODES.includes(align) ? align : null;
  applyTabDir(t);
  saveTabMeta(t);
  saveSessionSoon();
}
/** title and direction of an unsaved document live next to its draft, so they come back after a restart */
function saveTabMeta(t) {
  if (t.path || !t.draftId) return;
  const meta = { ...(settings.draftMeta || {}) };
  if (t.title || t.align) meta[t.draftId] = { title: t.title || null, align: t.align || null };
  else delete meta[t.draftId];
  settings.draftMeta = meta; persistSettings();
}
function dropTabMeta(id) {
  if (!id || !settings.draftMeta || !settings.draftMeta[id]) return;
  const meta = { ...settings.draftMeta };
  delete meta[id];
  settings.draftMeta = meta; persistSettings();
}

async function newTab({ path = null, content = '', activate = true, mode = 'wysiwyg', mtime = 0, index, draftId, align = null, title = null, group = null } = {}) {
  const id = ++seq;
  const wys = el('div', { class: 'wysiwyg' });
  const src = el('div', { class: 'source' });
  const pane = el('div', { class: 'pane' }, wys, src);
  $('#editors').append(pane);
  const t = {
    id, path, pane, wys, src, mode: 'wysiwyg', md: content, baseline: content, diskContent: content,
    dirty: false, crepe: null, cm: null, mtime, untitledN: path ? 0 : untitledName(), align: DIR_MODES.includes(align) ? align : null, title: path ? null : title || null,
    lastSnap: content, lastSnapTime: Date.now(), saveTimer: null,
    draftId: path ? null : draftId || 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    // set before the tab is first drawn, so a group being restored is never seen empty (and dropped)
    groupId: group && groups.has(group) ? group : null,
  };
  applyTabDir(t);
  t.crepe = await createEditor(wys, content, editorHooks(t));
  applyTabDir(t);
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
        { label: tr('common.copy'), key: 'Ctrl+C', run: () => api.edit('copy') },
        { label: tr('context.copyPlain'), key: 'Ctrl+Shift+C', run: () => copyPlainText(t) },
        'sep',
        { label: tr('safeMode.turnOff'), key: 'F8', run: () => setLocked(t, false) },
      ], e.clientX, e.clientY);
      return;
    }
    const imgBlk = e.target.closest('.milkdown-image-block, .milkdown-image-inline');
    if (imgBlk && imgBlk.querySelector('img') && openImageMenu(t, imgBlk, e.clientX, e.clientY)) return;
    openEditorMenu(t.crepe, e.clientX, e.clientY, { insertImage: () => insertImageFromDisk(t), edit: (op) => api.edit(op), color: colorTools(t), emoji: emojiTools(), copyPlain: () => copyPlainText(t),
      ai: aiOn(settings) ? { icon: aiIconHTML(settings), name: aiName(settings), run: () => openFedora(t) } : null,
      translate: settings.extTranslate !== false ? { run: () => translateSelection(t) } : null });
  });
  // image editor: an «ویرایش» button on hover, and double-click, open it
  wys.addEventListener('mouseover', (e) => {
    const blk = e.target.closest && e.target.closest('.milkdown-image-block');
    if (blk) addImageEditButton(t, blk);
  });
  wys.addEventListener('dblclick', (e) => {
    const blk = e.target.closest && e.target.closest('.milkdown-image-block');
    if (!blk || !e.target.closest('img') || settings.extImage === false) return;
    const info = imageInfo(t, blk);
    if (info && info.kind === 'file') { e.preventDefault(); e.stopPropagation(); editImage(t, blk); }
  }, true);
  // translator: Alt + double-click on a word, or Alt + drag over a few words, translates at once
  let altDown = null;
  wys.addEventListener('mousedown', (e) => { altDown = e.button === 0 && e.altKey ? { x: e.clientX, y: e.clientY } : null; }, true);
  const altTranslateOn = () => settings.extTranslate !== false && settings.trAltClick !== false && t.mode === 'wysiwyg';
  wys.addEventListener('dblclick', (e) => {
    if (!e.altKey || !altTranslateOn() || (e.target.closest && e.target.closest('.milkdown-image-block, .cm-editor'))) return;
    setTimeout(() => translateSelection(t), 0);
  });
  wys.addEventListener('mouseup', (e) => {
    const d = altDown;
    altDown = null;
    if (!d || !e.altKey || !altTranslateOn() || e.detail > 1) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    setTimeout(() => { if (!getView(t.crepe).state.selection.empty) translateSelection(t); }, 0);
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
  if (path) loadMarks(t);
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
    // a click lands after the hover already opened the panel: reopen once the click's own mousedown has passed
    colorMenu: (anchor) => setTimeout(() => openColorPanel(t.crepe, anchor, colorTools(t)), 0),
    translate: (anchor) => translateSelection(t, anchor),
    googleSearch: () => searchSelection(t),
    ai: (anchor) => openFedora(t, anchor),
    aiIcon: () => toolbarIcon(),
    promptSlot: { register: registerSlot, run: (i) => runSlot(t, i) },
    aiName: () => aiName(settings),
    plugins: [marksPlugin, reviewPlugin],
  };
}
// code block «کپی» turns into «کپی شد» for two seconds, then back
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.milkdown-code-block .copy-button');
  if (!b) return;
  b.classList.add('nv-copied');
  clearTimeout(b._nvT);
  b._nvT = setTimeout(() => b.classList.remove('nv-copied'), 2000);
});
// Fedora, the AI assistant
initFedora({
  api,
  settings: () => settings,
  updateSettings: (patch) => updateSettings(patch),
  toast,
  openSettings: (id) => openSettings(id),
  showLocked: () => showLockedToast(),
  openHistoryAt: (t, id) => { if (t.id !== activeId) activateTab(t.id); historyPanel.showAt(id); },
  renderTabs: () => renderTabs(),
  marksChanged: (t) => { if (t && t.id === activeId && historyPanel.visible()) historyPanel.refreshAi(); },
  refreshViews: () => refreshAiViews(),
  tabOf: (node) => tabs.find((x) => x.pane.contains(node) && x.crepe),
  newTab: (opts) => newTab(opts),
  // a tab made from another one (assistant outputs): right after it, the two in one group
  newTabBeside: async (src, opts) => {
    if (!src.groupId || !groups.has(src.groupId)) {
      const g = { id: 'g' + Date.now().toString(36), name: '', color: nextColor(), collapsed: false };
      groups.set(g.id, g);
      src.groupId = g.id;
    }
    const t = await newTab({ ...opts, index: Math.max(0, tabs.indexOf(src)) + 1, group: src.groupId });
    normalizeGroups(); renderTabs(); saveSessionSoon();
    return t;
  },
  activate: (t) => { if (tabs.includes(t)) activateTab(t.id); else toast(tr('toast.sourceDocClosed'), 'info'); },
  tabTitle: (t) => tabTitle(t),
});
/** markers are decorations: a change of name, icon or the on/off switch draws them again */
function refreshAiViews() {
  for (const t of tabs) if (t.crepe) { const v = getView(t.crepe); v.dispatch(v.state.tr.setMeta('nv-ai-refresh', true).setMeta('addToHistory', false)); }
}
// the selection toolbar stays out of the way while dragging; its colour button opens its panel on hover too
installSelectionBar((node) => {
  const t = node && tabs.find((x) => x.pane.contains(node) && x.crepe);
  return t ? { view: getView(t.crepe), pane: t.pane } : null;
}, (b) => {
  if (settings.extColor === false) return;
  const t = tabs.find((x) => x.pane.contains(b));
  if (t && !t.locked) openColorPanel(t.crepe, b, colorTools(t));
});

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
    if ((await api.stat(abs)).exists) openPath(abs); else toast(tr('toast.fileNotFound', { name: basename(abs) }));
  } else api.openExternal(abs);
}
function showSelectionCount(text) {
  const n = $('#st-sel');
  if (!n) return;
  if (!text || !text.trim()) { n.textContent = ''; return; }
  const { words, chars } = countWords(text);
  n.textContent = tr('status.selection', { words: fa(words), chars: fa(chars) });
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
  noteDocChange(t);
  noteChangeForName(t);
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
  if (t.draftId) { api.draftDelete(t.draftId); dropTabMeta(t.draftId); }
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
const gColor = (id, key, c) => ({ id, get name() { return tr(key); }, c });
export const GROUP_COLORS = [
  gColor('blue', 'color.blue', '#0066DD'), gColor('green', 'color.green', '#1F9D48'),
  gColor('orange', 'color.orange', '#E8830C'), gColor('red', 'color.red', '#D93A3A'),
  gColor('purple', 'color.purple', '#8E5BD9'), gColor('pink', 'color.pink', '#E0457B'),
  gColor('cyan', 'color.cyan', '#0E9F8E'), gColor('yellow', 'color.yellow', '#B7791F'),
  gColor('grey', 'color.gray', '#6E6E78'),
];
const groups = new Map(); // id -> { id, name, color, collapsed }
const colorOf = (g) => (GROUP_COLORS.find((c) => c.id === g.color) || GROUP_COLORS[0]).c;
/** a group's name colour, made readable on the bar of the extra themes (the built-in ones are already) */
function groupText(g) {
  const c = colorOf(g);
  const th = String(settings.theme).startsWith('mt:') ? MORE_THEMES.find((x) => x.id === settings.theme) : null;
  if (!th) return c;
  const { bg, fg } = th.pal;
  return ensure(c, [bg, mix(fg, 8, bg), mix(fg, 13, bg), mix('#000000', 22, bg)], 4.5);
}
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
async function addToNewGroup(t) {
  const g = { id: 'g' + Date.now().toString(36), name: '', color: nextColor(), collapsed: false };
  groups.set(g.id, g);
  t.groupId = g.id;
  normalizeGroups(); renderTabs(); saveSessionSoon();
  groupMenuAt(g, true);
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
function groupMenu(g, x, y, isNew = false) {
  const members = tabs.filter((t) => t.groupId === g.id);
  const redraw = () => { renderTabs(); saveSessionSoon(); };
  showMenu([
    { field: { label: tr('group.nameLabel'), value: g.name || '', placeholder: tr('group.namePlaceholder'), focus: true, input: (v) => { g.name = v.trim(); redraw(); } } },
    { swatches: { label: tr('editor.toolbar.color'), value: g.color, items: GROUP_COLORS.map((c) => ({ id: c.id, name: c.name, color: c.c })), pick: (id) => { g.color = id; redraw(); } } },
    'sep',
    { icon: ICON.plusSquare, label: tr('group.newDoc'), run: async () => { const t = await newTab(); setGroup(t, g.id); } },
    isNew ? null : { icon: ICON.chevDown, label: g.collapsed ? tr('group.expand') : tr('group.collapse'), run: () => toggleGroup(g) },
    { icon: ICON.window, label: tr('group.moveToNewWindow'), run: () => detachTabs(members, false) },
    { icon: ICON.x, label: tr('group.ungroup'), run: () => { members.forEach((t) => { t.groupId = null; }); groups.delete(g.id); redraw(); } },
    { icon: ICON.trash, label: tr('group.closeAll'), danger: true, run: async () => { for (const t of members) if (!(await closeTab(t))) break; } },
  ], x, y);
}
/** open the group popover next to its chip (or the tab, for a group that was just made) */
function groupMenuAt(g, isNew) {
  requestAnimationFrame(() => {
    const node = document.querySelector(`[data-gid="${g.id}"]`) || document.querySelector('.tab.active');
    if (!node) return;
    const r = node.getBoundingClientRect();
    groupMenu(g, r.right, r.bottom + 8, isNew);
  });
}

// ---------- several tabs selected (Ctrl / Shift + click) ----------
const tabSel = new Set(); // tab ids; a selection counts from two tabs up
const selectedTabs = () => (tabSel.size > 1 ? tabs.filter((t) => tabSel.has(t.id)) : []);
function clearTabSel() { if (tabSel.size) { tabSel.clear(); renderTabs(); } }
function selectClick(t, e) {
  const a = active();
  if (e.shiftKey && a) {
    // everything between the active tab and this one; Ctrl+Shift adds the range to what was selected
    const i = tabs.indexOf(a), j = tabs.indexOf(t);
    if (!(e.ctrlKey || e.metaKey)) tabSel.clear();
    for (const x of tabs.slice(Math.min(i, j), Math.max(i, j) + 1)) tabSel.add(x.id);
  } else {
    if (!tabSel.size && a) tabSel.add(a.id);
    // the active tab stays selected: it is the document on screen
    if (tabSel.has(t.id) && t.id !== activeId) tabSel.delete(t.id); else tabSel.add(t.id);
  }
  if (tabSel.size < 2) tabSel.clear();
  renderTabs();
}
/** close several tabs; unsaved ones are asked about once, for all of them */
async function closeTabs(list) {
  const dirty = list.filter((t) => t.dirty);
  if (dirty.length) {
    const r = await modal({
      title: dirty.length === 1 ? tr('dialog.unsaved.saveOneTitle', { name: tabTitle(dirty[0]) }) : tr('dialog.unsaved.manyTitle', { n: fa(dirty.length) }),
      text: tr('dialog.unsaved.loseChanges'),
      buttons: [{ label: tr('common.dontSave'), value: 'discard', danger: true, aside: true }, { label: tr('common.cancel'), value: null }, { label: dirty.length > 1 ? tr('common.saveAll') : tr('common.save'), value: 'save', primary: true }],
    });
    if (!r) return false;
    if (r === 'save') for (const t of dirty) if (!(await save(t))) return false;
  }
  tabSel.clear();
  for (const t of list) if (!(await closeTab(t, { skipPrompt: true }))) return false;
  return true;
}
function multiTabMenu(list, x, y) {
  const n = list.length;
  const inGroup = list.some((t) => t.groupId);
  const allGroups = [...groups.values()];
  const each = (fn) => () => { for (const t of list) fn(t); normalizeGroups(); renderTabs(); saveSessionSoon(); };
  showMenu([
    { header: tr('tabs.selectedCount', { n: fa(n) }) },
    { icon: ICON.group, label: tr('tabs.addToNewGroup'), run: () => {
      const g = { id: 'g' + Date.now().toString(36), name: '', color: nextColor(), collapsed: false };
      groups.set(g.id, g);
      each((t) => { t.groupId = g.id; })();
      groupMenuAt(g, true);
    } },
    allGroups.length ? { icon: '', label: tr('tabs.addToGroup'), sub: allGroups.map((g) => ({ label: g.name || tr('group.unnamed'), icon: `<span class="gdot" style="--g:${colorOf(g)}"></span>`, run: each((t) => { t.groupId = g.id; }) })) } : null,
    inGroup ? { icon: '', label: tr('tabs.removeFromGroup'), run: each((t) => { t.groupId = null; }) } : null,
    'sep',
    { icon: ICON.direction, label: tr('dir.docDir'), sub: [
      { label: tr('dir.forceRtl'), run: () => list.forEach((t) => setTabDir(t, 'rtl')) },
      { label: tr('dir.auto'), tag: tr('dir.byText'), run: () => list.forEach((t) => setTabDir(t, 'auto')) },
      { label: tr('dir.forceLtr'), run: () => list.forEach((t) => setTabDir(t, 'ltr')) },
      'sep',
      { label: tr('dir.settingsDefault'), run: () => list.forEach((t) => setTabDir(t, null)) },
    ] },
    { icon: ICON.window, label: tr('tabs.moveToNewWindow'), disabled: n >= tabs.length, run: () => { tabSel.clear(); detachTabs(list, false); } },
    'sep',
    { icon: ICON.x, label: tr('tabs.closeN', { n: fa(n) }), key: 'Ctrl+W', run: () => closeTabs(list) },
    { icon: '', label: tr('tabs.closeOthers'), disabled: n >= tabs.length, run: () => closeTabs(tabs.filter((t) => !list.includes(t))) },
    'sep',
    { icon: '', label: tr('tabs.deselect'), key: 'Esc', run: clearTabSel },
  ], x, y);
}

function tabNode(t, vertical) {
  const g = t.groupId ? groups.get(t.groupId) : null;
  const close = el('button', { class: 't-close', title: tr('common.close'), html: `<span class="x">${ICON.x}</span>`, draggable: 'false' });
  close.addEventListener('pointerdown', (e) => e.stopPropagation());
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t); });
  const node = el('div', {
    class: 'tab' + (t.id === activeId ? ' active' : '') + (t.dirty ? ' dirty' : '') + (g ? ' grouped' : '') + (tabSel.size > 1 && tabSel.has(t.id) ? ' ms' : ''),
    title: t.path || tabTitle(t), 'data-id': t.id, style: g ? `--g:${colorOf(g)}` : null,
  }, t.locked ? el('span', { class: 't-lock', title: tr('safeMode.title'), html: ICON.lock }) : null,
    t.aiOut ? (t.aiOut.working ? el('span', { class: 't-ai busy', role: 'img', 'aria-label': tr('tabs.aiGenerating') }) : el('span', { class: 't-ai', html: outIcon(t.aiOut.kind, t.aiOut.icon) })) : null,
    el('span', { class: 't-title', dir: bidi(tabTitle(t)) }, tabTitle(t)),
    t.mode === 'source' ? el('span', { class: 't-ind' }, tr('tabs.sourceBadge')) : null, close);
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || node.classList.contains('renaming')) return;
    // Ctrl / Shift + click: build a selection of tabs, without switching documents
    if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); selectClick(t, e); return; }
    const inSel = tabSel.size > 1 && tabSel.has(t.id);
    if (!inSel && tabSel.size) { tabSel.clear(); renderTabs(); }
    const prevId = activeId;
    if (t.id !== activeId) activateTab(t.id);
    tabDragStart(e, t, node, vertical);
    dragState.prevId = prevId;
    // pressing a selected tab keeps the selection for a drag; a plain click (no drag) ends it
    if (inSel) dragState.collapse = true;
  });
  node.addEventListener('dblclick', (e) => { if (!e.target.closest('.t-close')) startRename(t); });
  node.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t); });
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (node.classList.contains('renaming')) return;
    if (tabSel.size > 1 && tabSel.has(t.id)) { multiTabMenu(selectedTabs(), e.clientX, e.clientY); return; }
    if (tabSel.size) { tabSel.clear(); renderTabs(); }
    tabMenu(t, e.clientX, e.clientY);
  });
  return node;
}

// ---------- renaming a tab: in place, like a file name in Explorer ----------
const tabNodeOf = (t) => document.querySelector(`${vertTabsOn() ? '#vtabs-list' : '#tabs'} .tab[data-id="${t.id}"]`);
function startRename(t) {
  if (!t) return;
  if (t.groupId && groups.get(t.groupId)?.collapsed) { groups.get(t.groupId).collapsed = false; renderTabs(); }
  const node = tabNodeOf(t);
  if (!node || node.classList.contains('renaming')) return;
  const ext = t.path ? (basename(t.path).match(/\.[^.]+$/) || [''])[0] : '';
  const current = t.path ? basename(t.path).slice(0, basename(t.path).length - ext.length) : (t.title || '');
  const inp = el('input', { class: 't-rename', type: 'text', dir: 'auto', spellcheck: 'false', 'aria-label': tr('tabs.renameLabel'), placeholder: t.path ? '' : tabTitle(t) });
  inp.value = current;
  node.classList.add('renaming');
  node.replaceChildren(inp);
  let done = false;
  let dropChips = () => {};
  const finish = (ok) => {
    if (done) return;
    done = true;
    dropChips();
    if (ok) commitRename(t, inp.value, ext); else renderTabs();
    focusEditor(t);
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
  for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) inp.addEventListener(ev, (e) => e.stopPropagation());
  requestAnimationFrame(() => {
    inp.focus(); inp.select();
    dropChips = nameChips(t, inp, (v) => { inp.value = v; finish(true); });
  });
}
async function commitRename(t, value, ext) {
  const name = cleanName(value || '');
  if (!t.path) {
    const next = name || null;
    if (next !== (t.title || null)) { t.title = next; saveTabMeta(t); }
    renderTabs(); updateTitle();
    return;
  }
  // a saved file: the file itself gets the new name (its extension stays unless one was typed)
  if (!name) { renderTabs(); return; }
  const newBase = /\.[a-z0-9]{1,8}$/i.test(name) ? name : name + ext;
  const old = t.path;
  if (newBase === basename(old)) { renderTabs(); return; }
  const sep = old.includes('\\') ? '\\' : '/';
  const target = dirname(old).replace(/[\\/]+$/, '') + sep + newBase;
  const r = await api.renameFile(old, target).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
  if (!r || !r.ok) {
    toast(r && r.exists ? tr('toast.fileExistsInFolder', { name: newBase }) : (r && r.error ? tr('toast.renameFailedErr', { err: r.error }) : tr('toast.renameFailed')), 'err');
    renderTabs();
    return;
  }
  api.unwatch(old);
  t.path = target;
  api.watch(target);
  api.historyMove(old, target).catch(() => {});
  api.aiMarksMove(old, target).catch(() => {});
  const pos = settings.positions && settings.positions[posKey(old)];
  if (pos) { settings.positions[posKey(target)] = pos; delete settings.positions[posKey(old)]; }
  settings.recent = (settings.recent || []).map((x) => (samePath(x.path, old) ? { ...x, path: target } : x));
  persistSettings();
  renderTabs(); updateTitle(); saveSessionSoon();
  if (settings.sidebar) renderTree(true);
  toast(tr('toast.fileRenamed'), 'ok');
}

// ---------- dragging tabs: reorder in the bar, tear off into a window, drop onto another window ----------
let dragState = null;
/** where a dragged tab would land among the tabs of this window, for a point in window coordinates */
function dropSlot(x, y) {
  const vertical = vertTabsOn();
  const nodes = [...document.querySelectorAll(vertical ? '#vtabs-list .tab' : '#tabs .tab')];
  if (!nodes.length) return { index: tabs.length };
  const rtl = getComputedStyle($(vertical ? '#vtabs-list' : '#tabs')).direction === 'rtl';
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    const before = vertical ? y < r.top + r.height / 2 : rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2;
    if (before) return { index: tabs.findIndex((t) => t.id === Number(n.dataset.id)), node: n, after: false };
  }
  const last = nodes[nodes.length - 1];
  return { index: tabs.findIndex((t) => t.id === Number(last.dataset.id)) + 1, node: last, after: true };
}
function clearDropMarks() {
  document.querySelectorAll('.tab.drag-over, .tab.drag-over-after, .tgroup.drag-over, .vgroup.drag-over').forEach((n) => n.classList.remove('drag-over', 'drag-over-after'));
}
function markSlot(slot) {
  clearDropMarks();
  if (slot && slot.node) slot.node.classList.add(slot.after ? 'drag-over-after' : 'drag-over');
}
/** the tab bar's area: leaving it (into the page, or out of the window) tears the tab off */
function outsideStrip(e) {
  if (e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight) return true;
  if (vertTabsOn()) {
    const r = $('#vtabs').getBoundingClientRect();
    return e.clientX < r.left - 8 || e.clientX > r.right + 8;
  }
  return e.clientY > $('#topbar').getBoundingClientRect().bottom + 6;
}
function tabDragStart(e, t, node, vertical) {
  dragState = { t, node, vertical, x0: e.clientX, y0: e.clientY, started: false, mode: 'reorder', pointerId: e.pointerId };
}
async function tearOff(e) {
  const ds = dragState;
  ds.mode = 'window';
  clearDropMarks();
  const list = ds.list || [ds.t];
  if (tabs.length > list.length) {
    // the tab (or the selected tabs) become their own window right away, and that window follows the pointer
    const vertical = vertTabsOn();
    windowDrag = true;
    tabSel.clear();
    await api.dragDetach(list.map(tabPayload), { x: e.screenX, y: e.screenY, vertical });
    for (const t of list) await closeTab(t, { skipPrompt: true, moved: true });
  } else {
    // the only tab: the whole window moves with it
    windowDrag = true;
    api.dragSelf({ x: e.clientX, y: e.clientY });
  }
}
// A window is following the pointer (this one, or one torn off from here). Whichever window gets the
// pointer events reports where the button went up; the main process moves the window in between.
let windowDrag = false;
function windowDragEvent(e) {
  if (!windowDrag || (dragState && dragState.started)) return;
  if (e.type === 'pointermove' && e.buttons) { api.dragMove(e.screenX, e.screenY); return; }
  windowDrag = false;
  api.dragEnd(e.screenX, e.screenY);
}
window.addEventListener('pointermove', windowDragEvent, true);
window.addEventListener('pointerup', windowDragEvent, true);
window.addEventListener('pointermove', (e) => {
  const ds = dragState;
  if (!ds || e.pointerId !== ds.pointerId) return;
  if (!ds.started) {
    if (Math.hypot(e.clientX - ds.x0, e.clientY - ds.y0) < 6) return;
    ds.started = true;
    // the pointer stays with this window even outside it, so a torn-off window can follow it
    try { $('#app').setPointerCapture(ds.pointerId); } catch {}
    ds.node = tabNodeOf(ds.t) || ds.node;
    // dragging one of the selected tabs moves all of them
    ds.list = tabSel.size > 1 && tabSel.has(ds.t.id) ? selectedTabs() : [ds.t];
    for (const x of ds.list) { const n = tabNodeOf(x); if (n) n.classList.add('dragging'); }
    ds.node.classList.add('dragging');
    document.body.classList.add('tab-dragging');
  }
  ds.sx = e.screenX; ds.sy = e.screenY;
  if (ds.mode === 'window') { api.dragMove(e.screenX, e.screenY); return; }
  if (ds.mode === 'tearing') return;
  ds.split = splitDropAt(e, ds);
  showSplitDrop(ds.split);
  ds.offStrip = false;
  if (ds.split) { clearDropMarks(); markJoin(null); return; }
  if (outsideStrip(e)) {
    // a tab that could open beside the current document tears off only once it leaves the window
    const inWin = e.clientX >= 0 && e.clientY >= 0 && e.clientX <= innerWidth && e.clientY <= innerHeight;
    if (canSplitDrag(ds) && inWin) { ds.offStrip = true; clearDropMarks(); markJoin(null); return; }
    ds.mode = 'tearing'; tearOff(e); return;
  }
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const chip = under?.closest('.tgroup, .vgroup');
  if (chip) { clearDropMarks(); chip.classList.add('drag-over'); ds.chip = chip; markJoin(chip.dataset.gid); return; }
  ds.chip = null;
  const slot = dropSlot(e.clientX, e.clientY);
  markSlot(slot);
  // the group it will end up in: the group of the tab under the pointer, anywhere on that tab;
  // over one of the moving tabs, groups stay as they are; between tabs, the tab it lands before decides
  const overNode = under?.closest('.tab');
  const over = overNode ? tabs.find((x) => x.id === Number(overNode.dataset.id)) : null;
  if (over && ds.list.includes(over)) ds.join = undefined;
  else if (over) ds.join = over.groupId || null;
  else {
    const anchor = slot.node && !slot.after ? tabs.find((x) => x.id === Number(slot.node.dataset.id)) : null;
    ds.join = anchor && !ds.list.includes(anchor) ? anchor.groupId || null : null;
  }
  markJoin(ds.join);
});
/** while dragging, the whole group the tab would join is tinted */
function markJoin(gid) {
  document.querySelectorAll('.g-join').forEach((n) => n.classList.remove('g-join'));
  if (!gid) return;
  document.querySelectorAll(`[data-gid="${gid}"]`).forEach((n) => n.classList.add('g-join'));
  for (const t of tabs) if (t.groupId === gid) { const n = tabNodeOf(t); if (n) n.classList.add('g-join'); }
}
async function endTabDrag(e) {
  const ds = dragState;
  if (!ds || e.pointerId !== ds.pointerId) return;
  dragState = null;
  try { $('#app').releasePointerCapture(e.pointerId); } catch {}
  document.body.classList.remove('tab-dragging');
  ds.node.classList.remove('dragging');
  document.querySelectorAll('.tab.dragging').forEach((n) => n.classList.remove('dragging'));
  clearDropMarks();
  markJoin(null);
  showSplitDrop(null);
  if (!ds.started) { if (ds.collapse) clearTabSel(); return; }
  if (ds.split && ds.mode === 'reorder') { const z = ds.split; openSplit(z.keep, ds.t, z.side); return; }
  if (ds.offStrip && ds.mode === 'reorder') return;
  if (ds.mode === 'window' || ds.mode === 'tearing') {
    // the pointer went to the torn-off window: that window reports the end of the drag
    if (e.type !== 'pointerup') return;
    windowDrag = false;
    api.dragEnd(e.screenX, e.screenY);
    return;
  }
  const list = ds.list || [ds.t];
  if (ds.chip) { for (const x of list) x.groupId = ds.chip.dataset.gid; normalizeGroups(); renderTabs(); saveSession(); return; }
  const slot = dropSlot(e.clientX, e.clientY);
  const anchor = slot.node ? tabs.find((x) => x.id === Number(slot.node.dataset.id)) : null;
  const rest = tabs.filter((x) => !list.includes(x));
  let at;
  if (!anchor) at = rest.length;
  else if (list.includes(anchor)) at = rest.filter((x) => tabs.indexOf(x) < tabs.indexOf(anchor)).length; // dropped on its own place
  else at = rest.indexOf(anchor) + (slot.after ? 1 : 0);
  rest.splice(at, 0, ...list);
  tabs.splice(0, tabs.length, ...rest);
  if (ds.join !== undefined) for (const x of list) x.groupId = ds.join;
  normalizeGroups();
  renderTabs();
  saveSession();
}
window.addEventListener('pointerup', endTabDrag);
window.addEventListener('pointercancel', endTabDrag);
// when the torn-off window takes the pointer over, this window just tidies up
document.addEventListener('lostpointercapture', (e) => { if (dragState && dragState.started && dragState.mode !== 'reorder') endTabDrag(e); }, true);
// another window's tab is being dragged over this one: show where it would land
function onDragHover(p) {
  const on = !!p;
  let inStrip = false;
  if (on) {
    if (vertTabsOn()) { const r = $('#vtabs').getBoundingClientRect(); inStrip = p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom; }
    else inStrip = p.y >= 0 && p.y <= $('#topbar').getBoundingClientRect().bottom;
  }
  document.body.classList.toggle('tab-drop', inStrip);
  if (inStrip) markSlot(dropSlot(p.x, p.y)); else clearDropMarks();
  return inStrip;
}
function groupChip(g, vertical) {
  const count = tabs.filter((t) => t.groupId === g.id).length;
  const chip = el('div', { class: (vertical ? 'vgroup' : 'tgroup') + (g.collapsed ? ' collapsed' : ''), style: `--g:${colorOf(g)};--gt:${groupText(g)}`, title: g.collapsed ? tr('group.expand') : tr('group.collapse'), 'data-gid': g.id },
    vertical ? el('span', { class: 'vg-chev', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg>' }) : null,
    el('span', { class: 'g-name', dir: bidi(g.name) }, g.name || (vertical ? tr('group.defaultName') : '')),
    (g.collapsed || vertical) ? el('span', { class: 'g-count' }, fa(count)) : null);
  chip.addEventListener('click', () => toggleGroup(g));
  chip.addEventListener('contextmenu', (e) => { e.preventDefault(); groupMenu(g, e.clientX, e.clientY); });
  return chip;
}
function renderTabs() {
  normalizeSplit();
  normalizeGroups();
  for (const id of [...tabSel]) if (!tabs.some((t) => t.id === id)) tabSel.delete(id);
  if (tabSel.size < 2) tabSel.clear();
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
    if (split && split.b != null && t.id === split.b) continue;
    if (split && split.b != null && t.id === split.a) { box.append(pairNode(vertical)); continue; }
    box.append(tabNode(t, vertical));
  }
  updateSplitBits();
  const act = box.querySelector('.tab.active');
  if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
$('#app') && document.addEventListener('wheel', (e) => {
  const box = $('#tabs');
  if (box && box.contains(e.target) && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft -= e.deltaY; e.preventDefault(); }
}, { passive: false });

function activateTab(id, { keepFocus = false } = {}) {
  closeTranslate();
  closeFedora();
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  if (t.groupId && groups.get(t.groupId)?.collapsed) { groups.get(t.groupId).collapsed = false; setTimeout(renderTabs, 0); }
  const prev = active();
  if (prev && prev !== t) rememberPos(prev);
  activeId = id;
  for (const x of tabs) x.pane.classList.toggle('active', x.id === id);
  applySplit();
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
  if (!keepFocus) focusEditor(t);
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

// ======================================================================
// split view: two documents side by side
// ======================================================================
const ICON_SPLIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M12 4.5v15"/></svg>';
const SEPARATE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="7.5" height="14" rx="2"/><rect x="13.5" y="5" width="7.5" height="14" rx="2"/></svg>';
const SWAP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>';
const SPLIT_MIN = 360, SPLIT_MIN_H = 240;
const DOTS_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>';
const STACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 12h18"/></svg>';
/** { a: the document on the right, b: the one on the left (null while choosing it), ratio: the right side's share } */
let split = null;
const tabById = (id) => tabs.find((t) => t.id === id);
const inSplit = (t) => !!split && !!t && split.b != null && (t.id === split.a || t.id === split.b);
const splitOn = () => document.body.classList.contains('split-on');
/** width the two sheets can share */
function splitRoom(vert = split && split.vert) {
  const wrap = $('#split-wrap');
  if (!wrap) return 0;
  return (vert ? wrap.clientHeight : wrap.clientWidth) - 20;
}
const roomForTwo = () => splitRoom() >= (split && split.vert ? SPLIT_MIN_H : SPLIT_MIN) * 2;
const noRoom = () => toast(tr('split.noRoom'), 'info');
/** the two documents of the pair stay next to each other in the tab bar, in the same group */
function normalizeSplit() {
  if (!split) return;
  const a = tabById(split.a), b = split.b != null ? tabById(split.b) : null;
  if (!a || (split.b != null && !b)) { split = null; return; }
  if (!b) return;
  b.groupId = a.groupId;
  const ia = tabs.indexOf(a), ib = tabs.indexOf(b);
  if (ib !== ia + 1) { tabs.splice(ib, 1); tabs.splice(tabs.indexOf(a) + 1, 0, b); }
}
function pairNode(vertical) {
  const a = tabById(split.a), b = tabById(split.b);
  const on = activeId === a.id || activeId === b.id;
  return el('div', { class: 'tab-pair' + (on ? ' on' : '') + (vertical ? ' v' : ''), title: tr('toolbar.split') },
    el('span', { class: 'tp-ic', html: ICON_SPLIT }), tabNode(a, vertical), tabNode(b, vertical));
}
/** open b beside a; side: where b goes ('left' by default, so the current document stays on the right) */
function openSplit(a, b, side = 'left') {
  if (!a || !b || a === b) return;
  if (!roomForTwo()) { noRoom(); return; }
  const ratio = split && split.b != null ? split.ratio : 0.5, vert = !!(split && split.vert);
  split = side === 'right' ? { a: b.id, b: a.id, ratio, vert } : { a: a.id, b: b.id, ratio, vert };
  renderTabs();
  activateTab(b.id);
  saveSessionSoon();
}
/** the second side asks which document to open */
function pickSplit() {
  const a = active();
  if (!a) return;
  if (!roomForTwo()) { noRoom(); return; }
  split = { a: a.id, b: null, ratio: split && split.b != null ? split.ratio : 0.5, vert: !!(split && split.vert) };
  applySplit();
  const first = $('#split-pick button');
  if (first) first.focus();
}
function endSplit(keepId = activeId) {
  if (!split) return;
  split = null;
  renderTabs();
  if (tabById(keepId)) activateTab(keepId); else applySplit();
  saveSessionSoon();
}
function toggleSplit() {
  if (split && (activeId === split.a || activeId === split.b)) endSplit(activeId);
  else pickSplit();
}
function swapSides() {
  if (!split || split.b == null) return;
  split = { a: split.b, b: split.a, ratio: 1 - split.ratio, vert: split.vert };
  renderTabs();
  applySplit();
  saveSessionSoon();
}
/** «بستن این طرف»: the document stays open as a normal tab; the other side fills the window */
function hideSide(t) {
  if (!inSplit(t)) return;
  const prev = { ...split };
  const other = t.id === split.a ? split.b : split.a;
  split = null;
  renderTabs();
  activateTab(other);
  saveSessionSoon();
  toast(tr('split.closedSideToast', { name: tabTitle(t) }), 5000, { label: tr('common.restore'), run: () => {
    if (!tabById(prev.a) || !tabById(prev.b)) return;
    if (!roomForTwo()) { noRoom(); return; }
    split = prev; renderTabs(); activateTab(t.id); saveSessionSoon();
  } });
}
function splitHead(side) {
  const tabOf = () => tabById(split ? (side === 'a' ? split.a : split.b) : null);
  const dots = el('button', { class: 'sh-b', type: 'button', title: tr('split.sideOptions'), 'aria-label': tr('split.sideOptions'), 'aria-haspopup': 'menu', html: DOTS_ICON });
  const x = el('button', { class: 'sh-b', type: 'button', title: tr('split.closeSide'), 'aria-label': tr('split.closeSide'), html: ICON.x });
  const head = el('div', { class: 'split-head', 'data-side': side, hidden: true },
    el('span', { class: 'sh-name' }), el('span', { class: 'sh-sep' }), dots, x);
  dots.addEventListener('click', () => {
    const t = tabOf();
    if (!t) return;
    if (t.id !== activeId) activateTab(t.id);
    const v = !!split.vert;
    const r = dots.getBoundingClientRect();
    dots.classList.add('on');
    showMenu([
      { icon: ICON.window, label: tr('split.openInNewWindow'), run: () => detachTabs([t], false) },
      { icon: SEPARATE_ICON, label: tr('split.separateTabs'), run: () => endSplit(t.id) },
      { icon: SWAP_ICON, label: v ? tr('split.swapVert') : tr('split.swapHoriz'), run: swapSides },
      { icon: v ? ICON_SPLIT : STACK_ICON, label: v ? tr('split.viewSideBySide') : tr('split.viewTopBottom'), run: () => setSplitVert(!v) },
    ], langDir() === 'rtl' ? r.right : r.left, r.bottom + 4, () => dots.classList.remove('on'));
  });
  x.addEventListener('click', () => { const t = tabOf(); if (t) hideSide(t); });
  return head;
}
function setSplitVert(v) {
  if (!split) return;
  const prev = split.vert;
  split.vert = v;
  if (!roomForTwo()) { split.vert = prev; noRoom(); return; }
  applySplit();
  requestAnimationFrame(checkNarrow);
  saveSessionSoon();
}
function splitPicker() {
  return el('div', { id: 'split-pick', hidden: true });
}
function paintPicker() {
  const box = $('#split-pick');
  const a = tabById(split.a);
  const others = tabs.filter((t) => t !== a);
  const chooseNew = async (make) => {
    const keep = split && split.a;
    const before = new Set(tabs);
    const t = await make();
    const got = t && t.id ? t : tabs.find((x) => !before.has(x)) || active();
    const ka = tabById(keep);
    if (ka && got && got !== ka) openSplit(ka, got);
  };
  box.innerHTML = '';
  box.append(
    el('b', {}, tr('split.pickTitle')),
    others.length ? el('span', { class: 'sp-sub' }, tr('split.fromOpenTabs')) : null,
    others.length ? el('div', { class: 'sp-list' }, others.slice(0, 8).map((t) => el('button', { type: 'button', onclick: () => openSplit(a, t) },
      el('span', { class: 'ic', html: ICON.file || ICON.doc || '' }), el('span', { class: 'sp-n', dir: bidi(tabTitle(t)) }, tabTitle(t))))) : null,
    el('div', { class: 'sp-acts' },
      el('button', { type: 'button', class: 'btn', onclick: () => chooseNew(() => newTab({ activate: false })) }, tr('menu.file.newTab')),
      el('button', { type: 'button', class: 'btn', onclick: () => chooseNew(async () => { await openDialog(); return null; }) }, tr('split.openFile')),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => endSplit(a.id) }, tr('common.cancel'))),
    el('span', { class: 'sp-hint' }, tr('split.dragHint')));
}
/** put each document in its sheet; idempotent, called whenever the active tab, the pair or the room changes */
function applySplit() {
  const sheet = $('#sheet'), sheet2 = $('#sheet2'), dv = $('#split-dv'), ed = $('#editors'), ed2 = $('#editors2');
  if (!sheet2) return;
  if (split) {
    const okA = tabById(split.a), okB = split.b == null || tabById(split.b);
    if (!okA || !okB || (split.b == null && activeId !== split.a)) split = null;
  }
  const pairOn = !!split && (activeId === split.a || activeId === split.b);
  const show = pairOn && roomForTwo();
  const A = split && tabById(split.a), B = split && split.b != null ? tabById(split.b) : null;
  const was = splitOn();
  document.body.classList.toggle('split-on', show);
  document.body.classList.toggle('split-vert', show && !!split.vert);
  sheet2.hidden = !show; dv.hidden = !show;
  for (const t of tabs) {
    const want = show && t === B ? ed2 : ed;
    if (t.pane.parentNode !== want) { const y = t.pane.scrollTop; want.append(t.pane); t.pane.scrollTop = y; }
    t.pane.classList.toggle('shown', show && (t === A || t === B));
  }
  const picking = show && !B;
  $('#split-pick').hidden = !picking;
  ed2.hidden = picking;
  if (picking) paintPicker();
  const actSheet = show && B && activeId === B.id ? sheet2 : sheet;
  sheet.classList.toggle('split-act', show && actSheet === sheet);
  sheet2.classList.toggle('split-act', show && actSheet === sheet2);
  // the find bar and the full status bar belong to the side being worked on
  const fb = $('#findbar'), sb = $('#statusbar');
  const edOf = actSheet === sheet ? ed : ed2;
  if (fb.parentNode !== actSheet) actSheet.insertBefore(fb, edOf);
  if (sb.parentNode !== actSheet) actSheet.append(sb);
  sheet.style.flex = show ? `${split.ratio} 1 0` : '';
  sheet2.style.flex = show ? `${1 - split.ratio} 1 0` : '';
  updateSplitBits();
  paintMiniBars();
  if (was !== show) requestAnimationFrame(checkNarrow);
}
function updateSplitBits() {
  const on = splitOn();
  const btn = $('#btn-split');
  if (btn) {
    const pairOn = !!split && (activeId === split.a || activeId === split.b);
    btn.classList.toggle('on', pairOn);
    btn.setAttribute('aria-pressed', String(pairOn));
    btn.title = pairOn ? tr('split.singleDoc') : tr('toolbar.split');
  }
  const pairOn = !!split && (activeId === split.a || activeId === split.b);
  for (const n of document.querySelectorAll('.tab-pair')) n.classList.toggle('on', pairOn);
  for (const h of document.querySelectorAll('.split-head')) {
    const t = on && split ? tabById(h.dataset.side === 'a' ? split.a : split.b) : null;
    h.hidden = !t;
    if (t) { const n = h.querySelector('.sh-name'); n.textContent = tabTitle(t); n.dir = bidi(tabTitle(t)); h.title = t.path || tabTitle(t); }
  }
}
/** the side not being worked on keeps a quiet status bar of its own */
function paintMiniBars() {
  for (const m of document.querySelectorAll('.st-mini')) {
    const side = m.dataset.side;
    const id = split ? (side === 'a' ? split.a : split.b) : null;
    const t = splitOn() ? tabById(id) : null;
    const show = !!t && t.id !== activeId;
    m.hidden = !show;
    if (!show) continue;
    const { words } = countWords(t.md);
    m.innerHTML = '';
    m.append(el('span', { class: 'chip' }, tr('status.words', { n: fa(words) })));
    if (t.locked) m.append(el('span', { class: 'chip', html: ICON.lock + `<span>${tr('safeMode.on')}</span>` }));
    if (t.dirty) m.append(el('span', { class: 'chip' }, tr('status.unsaved')));
  }
}
function setupDivider(dv) {
  dv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !split) return;
    e.preventDefault();
    dv.setPointerCapture(e.pointerId);
    dv.classList.add('drag');
    document.body.classList.add('split-resizing');
    const r1 = $('#sheet').getBoundingClientRect(), r2 = $('#sheet2').getBoundingClientRect();
    const vert = !!split.vert;
    const rightIsA = r1.left > r2.left;
    const L = Math.min(r1.left, r2.left), R = Math.max(r1.right, r2.right), T = Math.min(r1.top, r2.top), B = Math.max(r1.bottom, r2.bottom);
    const W = vert ? B - T : R - L;
    const lim = Math.min(0.5, (vert ? SPLIT_MIN_H : SPLIT_MIN) / W);
    const move = (ev) => {
      let ratio = vert ? (ev.clientY - T) / W : rightIsA ? (R - ev.clientX) / W : (ev.clientX - L) / W;
      ratio = Math.min(1 - lim, Math.max(lim, ratio));
      split.ratio = ratio;
      $('#sheet').style.flex = `${ratio} 1 0`;
      $('#sheet2').style.flex = `${1 - ratio} 1 0`;
    };
    const up = () => {
      dv.removeEventListener('pointermove', move); dv.removeEventListener('pointerup', up); dv.removeEventListener('pointercancel', up);
      dv.classList.remove('drag');
      document.body.classList.remove('split-resizing');
      checkNarrow();
      saveSessionSoon();
    };
    dv.addEventListener('pointermove', move); dv.addEventListener('pointerup', up); dv.addEventListener('pointercancel', up);
  });
  dv.addEventListener('dblclick', () => { if (!split) return; split.ratio = 0.5; applySplit(); checkNarrow(); saveSessionSoon(); });
}
/** a tab dragged onto the page: which half it would open in, beside the document that was open before */
function canSplitDrag(ds) {
  if (!ds.list || ds.list.length !== 1 || tabs.length < 2 || splitOn()) return false;
  const keep = tabById(ds.prevId);
  return !!keep && keep !== ds.t;
}
function splitDropAt(e, ds) {
  if (!canSplitDrag(ds)) return null;
  const keep = tabById(ds.prevId);
  const r = $('#sheet').getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  if (r.width < SPLIT_MIN) return null;
  const rtl = getComputedStyle($('#main')).direction === 'rtl';
  const leftHalf = e.clientX < r.left + r.width / 2;
  return { keep, side: leftHalf ? 'left' : 'right', rect: r, leftHalf, rtl };
}
function showSplitDrop(z) {
  let ov = $('#split-drop');
  if (!z) { if (ov) ov.remove(); return; }
  if (!ov) {
    ov = el('div', { id: 'split-drop' }, el('span', {}, el('span', { class: 'ic', html: ICON_SPLIT }), el('span', { class: 'sd-t' })));
    document.body.append(ov);
  }
  const r = z.rect, half = r.width / 2;
  Object.assign(ov.style, { top: r.top + 'px', height: r.height + 'px', width: half + 'px', left: (z.leftHalf ? r.left : r.left + half) + 'px' });
  ov.querySelector('.sd-t').textContent = z.leftHalf ? tr('split.dropLeft') : tr('split.dropRight');
}

async function closeTab(t, { skipPrompt = false, moved = false } = {}) {
  if (t.dirty && !skipPrompt) {
    activateTab(t.id);
    const r = await modal({
      title: tr('dialog.unsaved.saveOneTitle', { name: tabTitle(t) }),
      text: tr('dialog.unsaved.loseChanges'),
      buttons: [{ label: tr('common.dontSave'), value: 'discard', danger: true, aside: true }, { label: tr('common.cancel'), value: null }, { label: tr('common.save'), value: 'save', primary: true }],
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
  if (split && (split.a === t.id || split.b === t.id)) split = null;
  if (!tabs.length) {
    if (moved || closeTab.keepWindow) await newTab();
    else { await persistNow().catch(() => {}); await api.closeNow(); return true; }
  } else if (activeId === t.id) activateTab(tabs[Math.min(i, tabs.length - 1)].id);
  else { renderTabs(); applySplit(); }
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
  const cur = active();
  showMenu([
    { icon: ICON.plusSquare, label: tr('menu.file.newTab'), key: 'Ctrl+T', run: () => newTab() },
    inSplit(t) ? { icon: SEPARATE_ICON, label: tr('split.separateDocs'), run: () => endSplit(t.id) }
      : t !== cur && cur ? { icon: ICON_SPLIT, label: tr('split.openBesideActive'), key: 'Ctrl+\\', run: () => openSplit(cur, t) }
        : { icon: ICON_SPLIT, label: tr('split.openBesideOther'), key: 'Ctrl+\\', run: () => pickSplit() },
    'sep',
    { icon: aiRenameOn() ? RENAME_AI_ICON : ICON.edit, label: tr('tabs.rename'), key: 'F2', run: () => startRename(t) },
    { icon: ICON.direction, label: tr('dir.docDir'), sub: [
      { label: tr('dir.forceRtl'), checked: tabAlign(t) === 'rtl', run: () => setTabDir(t, 'rtl') },
      { label: tr('dir.auto'), tag: tr('dir.byText'), checked: tabAlign(t) === 'auto', run: () => setTabDir(t, 'auto') },
      { label: tr('dir.forceLtr'), checked: tabAlign(t) === 'ltr', run: () => setTabDir(t, 'ltr') },
      'sep',
      { label: tr('dir.settingsDefault'), disabled: !t.align, run: () => setTabDir(t, null) },
    ] },
    'sep',
    { icon: ICON.group, label: tr('tabs.addToNewGroup'), run: () => addToNewGroup(t) },
    others.length ? { icon: '', label: tr('tabs.addToGroup'), sub: others.map((g) => ({ label: g.name || tr('group.unnamed'), icon: `<span class="gdot" style="--g:${colorOf(g)}"></span>`, run: () => setGroup(t, g.id) })) } : null,
    t.groupId ? { icon: '', label: tr('tabs.removeFromGroup'), run: () => setGroup(t, null) } : null,
    t.groupId ? { icon: '', label: tr('group.edit'), run: () => groupMenuAt(groups.get(t.groupId)) } : null,
    'sep',
    { icon: ICON.window, label: tr('tabs.moveToNewWindow'), disabled: tabs.length < 2, run: () => detachTabs([t], false) },
    onTop() ? { icon: ICON.pinOff, label: tr('toolbar.unpin'), run: unpinWindow }
      : { icon: ICON.pin, label: tr('toolbar.pin'), run: () => pinTab(t) },
    winRole !== 'main' && !onTop() ? { icon: '', label: tr('tabs.returnToMain'), run: () => sendTabsToMain([t]) } : null,
    'sep',
    { icon: ICON.x, label: tr('common.close'), key: 'Ctrl+W', run: () => closeTab(t) },
    { icon: '', label: tr('tabs.closeOthers'), disabled: tabs.length < 2, run: async () => { for (const o of tabs.filter((o) => o !== t)) if (!(await closeTab(o))) break; } },
    { icon: '', label: tr('tabs.closeAfter'), disabled: idx === tabs.length - 1, run: async () => { for (const o of tabs.slice(idx + 1)) if (!(await closeTab(o))) break; } },
    { icon: '', label: tr('tabs.reopenClosed'), key: 'Ctrl+Shift+T', disabled: !closedStack.length, run: reopenClosed },
    'sep',
    vtabsSwitch(),
    'sep',
    { icon: ICON.folder, label: tr('file.showInFolder'), disabled: !t.path, run: () => api.reveal(t.path) },
    { icon: ICON.file, label: tr('file.copyFile'), disabled: !t.path, run: () => copyFileToClipboard(t) },
    { icon: ICON.copy, label: tr('file.copyPath'), disabled: !t.path, run: () => { navigator.clipboard.writeText(t.path); toast(tr('toast.pathCopied'), 'ok'); } },
    { icon: ICON.history, label: tr('toolbar.history'), key: 'Ctrl+Shift+H', disabled: !t.path, run: () => { activateTab(t.id); historyPanel.show(); } },
  ], x, y);
}

/** the saved file itself goes on the clipboard (paste it into a folder, a chat, an email) */
async function copyFileToClipboard(t) {
  if (!t.path) return;
  if (!(await api.copyFile(t.path))) { toast(tr('toast.copyFileFailed'), 'err'); return; }
  toast(t.dirty ? tr('toast.fileCopiedDirty') : tr('toast.fileCopied'), 'ok');
}

const vtabsSwitch = () => ({ icon: ICON.vtabs, label: tr('settings.look.verticalTabs'), switch: () => !!settings.verticalTabs, run: () => updateSettings({ verticalTabs: !settings.verticalTabs }) });
/** right-click on the empty part of the tab bar (top bar or vertical tab column) */
function stripMenu(x, y) {
  showMenu([
    { icon: ICON.plusSquare, label: tr('menu.file.newTab'), key: 'Ctrl+T', run: () => newTab() },
    { icon: '', label: tr('tabs.reopenClosed'), key: 'Ctrl+Shift+T', disabled: !closedStack.length, run: reopenClosed },
    'sep',
    vtabsSwitch(),
  ], x, y);
}

// ---------- emoji in the right-click menu: pinned ones on top, the last used ones remembered ----------
function emojiTools() {
  return {
    pins: () => settings.emojiPins || DEFAULT_PINS,
    recent: () => settings.emojiRecent || [],
    setPins: (list) => { settings.emojiPins = list; persistSettings(); },
    used: (e) => { settings.emojiRecent = [e, ...(settings.emojiRecent || []).filter((x) => x !== e)].slice(0, 16); persistSettings(); },
  };
}

// ---------- built-in extensions: translator and Google search ----------
function selectedText(t) {
  const v = getView(t.crepe);
  const { from, to, empty } = v.state.selection;
  return empty ? null : { v, from, to, text: v.state.doc.textBetween(from, to, '\n', ' ') };
}
function translateSelection(t, anchor = null) {
  if (!t || t.mode !== 'wysiwyg' || settings.extTranslate === false) return false;
  const s = selectedText(t);
  if (!s || !s.text.trim()) { toast(tr('toast.selectTextFirst'), 'info'); return true; }
  openTranslate({
    view: s.v, text: s.text, from: s.from, to: s.to, anchor, api, toast, settings, align: tabAlign(t),
    setSettings: (patch) => updateSettings(patch),
    guard: () => { if (t.locked) { showLockedToast(); return true; } return false; },
  });
  return true;
}
/**
 * Ctrl+Shift+C: the selection as bare text (no bold, links, colours or Markdown signs), so it pastes
 * into any app without formatting. Paragraphs are separated by an empty line, list items and table
 * cells by a single line, Shift+Enter breaks stay as line breaks. Works in safe mode too.
 */
function plainSelection(t) {
  const ae = document.activeElement;
  // inside a code block or the source view: the selected characters as they are
  if ((ae && ae.closest && ae.closest('.cm-editor') && t.wys.contains(ae)) || t.mode === 'source') {
    if (t.mode === 'source' && t.cm) {
      const { from, to } = t.cm.state.selection.main;
      return from === to ? '' : plainForClipboard(t.cm.state.doc.sliceString(from, to));
    }
    return String(window.getSelection() || '');
  }
  const v = getView(t.crepe);
  const { from, to, empty } = v.state.selection;
  if (empty) return '';
  const parts = [];
  v.state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isTextblock) return true;
    const a = Math.max(from, pos + 1) - pos - 1, b = Math.min(to, pos + node.nodeSize - 1) - pos - 1;
    if (b < a) return false;
    const text = node.textBetween(a, b, '\n', (leaf) => (/break/i.test(leaf.type.name) ? '\n' : ''));
    const tight = parent && /list_item|table_cell|table_header/.test(parent.type.name);
    parts.push({ text, tight });
    return false;
  });
  return parts.map((x, i) => (i ? (x.tight && parts[i - 1].tight ? '\n' : '\n\n') : '') + x.text).join('').replace(/\s+$/, '');
}
async function copyPlainText(t) {
  if (!t) return;
  const text = plainSelection(t);
  if (!text.trim()) { toast(tr('toast.selectTextFirst'), 'info'); return; }
  try { await navigator.clipboard.writeText(text); toast(tr('toast.copiedPlain'), 'ok'); }
  catch { toast(tr('toast.copyRetry'), 'err'); }
}
function searchSelection(t) {
  if (!t || settings.extGoogle === false) return;
  const s = selectedText(t);
  if (s) googleSearch(api, s.text);
}

// ---------- built-in extension: text colour ----------
function colorTools(t) {
  return {
    enabled: settings.extColor !== false,
    last: settings.lastColor || DEFAULTS.lastColor,
    guard: () => { if (t.locked) { showLockedToast(); return true; } return false; },
    remember: (c) => { if (c && (c.color || c.bg)) updateSettings({ lastColor: { color: c.color || null, bg: c.bg || null } }); },
  };
}
/** Alt+H: give the selection the last colour used */
function applyLastColor(t) {
  if (!t || t.mode !== 'wysiwyg' || settings.extColor === false) return false;
  if (t.locked) { showLockedToast(); return true; }
  const v = getView(t.crepe);
  if (v.state.selection.empty) { toast(tr('toast.selectTextFirst'), 'info'); return true; }
  const c = settings.lastColor || DEFAULTS.lastColor;
  applyColor(t.crepe, { color: c.color || null, bg: c.bg || null });
  return true;
}

// ---------- built-in extension: image editor ----------
// The editor itself (imgedit.js and its CSS) is loaded the first time it opens.
let imgEditMod = null;
const loadImgEditor = () => (imgEditMod ||= import('./imgedit.js'));
/** the image node behind a rendered image, its position, and what can be done with it */
function imageInfo(t, blk) {
  const v = getView(t.crepe);
  let pos = null, node = null;
  v.state.doc.descendants((n, p) => {
    if (node) return false;
    if (/image/.test(n.type.name) && v.nodeDOM(p) === blk) { pos = p; node = n; return false; }
  });
  if (!node) return null;
  const src = node.attrs.src || '';
  const ext = ((src.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  let kind = 'file', abs = null;
  if (/^https?:/i.test(src)) kind = 'web';
  else if (/^data:image\//i.test(src)) kind = 'data';
  else if (/^(blob:)/i.test(src) || !src) kind = 'none';
  else {
    let p = src;
    if (/^file:/i.test(p)) p = decodeURI(p.replace(/^file:\/\/\/?/i, '/')).replace(/^\/([a-zA-Z]:)/, '$1');
    else if (!/^[a-zA-Z]:[\\/]/.test(p) && !p.startsWith('/')) p = t.path ? dirname(t.path) + '/' + decodeURI(p) : null;
    abs = p;
    if (!abs) kind = 'none';
  }
  const anim = ext === 'gif' || ext === 'svg' || /^data:image\/(gif|svg)/i.test(src);
  return { pos, node, src, ext, kind, abs, anim };
}
function canEditImage(info) { return info && !info.anim && info.kind !== 'none'; }
function addImageEditButton(t, blk) {
  if (settings.extImage === false || t.locked || t.mode !== 'wysiwyg') return;
  const ops = blk.querySelector('.image-wrapper .operation');
  if (!ops || ops.querySelector('.fd-img-edit')) return;
  const info = imageInfo(t, blk);
  if (!info || info.kind !== 'file' || info.anim) return;
  const b = el('button', { class: 'fd-img-edit', type: 'button', title: tr('imgedit.title') }, el('span', { class: 'ic', html: ICON.edit }), tr('editor.code.edit'));
  b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); editImage(t, blk); });
  ops.append(b);
}
/** right-click on an image; false when the normal text menu should open instead */
function openImageMenu(t, blk, x, y) {
  const info = imageInfo(t, blk);
  if (!info) return false;
  const v = getView(t.crepe);
  const on = settings.extImage !== false;
  const items = [];
  if (on) {
    if (info.anim) items.push({ icon: ICON.edit, label: tr('imgedit.title'), tag: info.ext === 'svg' ? 'SVG' : tr('image.animatedGif'), disabled: true });
    else if (info.kind === 'web') items.push({ icon: ICON.download, label: tr('image.downloadAndEdit'), tag: tr('image.webImage'), run: () => editImage(t, blk) });
    else items.push({ icon: ICON.edit, label: tr('imgedit.title'), disabled: !canEditImage(info), run: () => editImage(t, blk) });
  }
  items.push(
    { icon: ICON.copy, label: tr('image.copy'), run: () => copyImage(blk) },
    { icon: ICON.folder, label: tr('file.showInFolder'), disabled: info.kind !== 'file', run: () => api.reveal(info.abs) },
    'sep',
    { icon: ICON.trash, label: tr('image.delete'), danger: true, run: () => {
      if (t.locked) { showLockedToast(); return; }
      const n = v.state.doc.nodeAt(info.pos);
      if (n) v.dispatch(v.state.tr.delete(info.pos, info.pos + n.nodeSize));
      v.focus();
    } },
  );
  showMenu(items, x, y);
  return true;
}
async function copyImage(blk) {
  try {
    const img = blk.querySelector('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast(tr('toast.imageCopied'), 'ok');
  } catch { toast(tr('toast.imageCopyFailed'), 'err'); }
}
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif' };
async function editImage(t, blk) {
  if (settings.extImage === false) return;
  if (t.locked) { showLockedToast(); return; }
  const info = imageInfo(t, blk);
  if (!canEditImage(info)) return;
  let bytes, ext = info.ext;
  try {
    if (info.kind === 'file') bytes = await api.readImage(info.abs);
    else if (info.kind === 'data') bytes = new Uint8Array(await (await fetch(info.src)).arrayBuffer());
    else {
      const r = await api.fetchImage(info.src);
      bytes = r.bytes;
      const m = (r.type.match(/image\/(png|jpe?g|webp|bmp|avif)/) || [])[1];
      if (m) ext = m === 'jpeg' ? 'jpg' : m;
    }
  } catch { toast(info.kind === 'web' ? tr('toast.imageDownloadFailed') : tr('toast.imageReadFailed'), 'err'); return; }
  if (info.kind === 'data') ext = ((info.src.match(/^data:image\/([a-z]+)/i) || [])[1] || 'png').replace('jpeg', 'jpg');
  if (!IMG_MIME[ext]) ext = 'png';
  const url = URL.createObjectURL(new Blob([bytes], { type: IMG_MIME[ext] }));
  let res;
  try {
    const { openImageEditor } = await loadImgEditor();
    res = await openImageEditor({
      src: url, ext, fonts: FONTS.filter((f) => f.id), emoji: emojiTools(),
      note: info.kind === 'file' ? tr('image.editNoteBeside') : tr('image.editNoteAssets'),
      colors: { get: () => settings.imgColors || [], set: (list) => updateSettings({ imgColors: list }) },
    });
  } catch { toast(tr('toast.imageEditorFailed'), 'err'); return; } finally { URL.revokeObjectURL(url); }
  if (!res) { getView(t.crepe).focus(); return; }
  let newSrc;
  try {
    if (info.kind === 'file') {
      const r = await api.saveEditedImage(info.abs, res.ext, res.bytes);
      newSrc = info.src.replace(/[^/\\]*$/, r.name.replace(/ /g, '%20'));
    } else {
      const base = (info.kind === 'web' ? basename(info.src.split(/[?#]/)[0]).replace(/\.[^.]+$/, '') : '') || 'image';
      const r = await api.saveImage(t.path, `${base}-edited.${res.ext}`, res.bytes);
      newSrc = r.relative || toFileURL(r.absolute);
    }
  } catch { toast(tr('toast.imageSaveFailed'), 'err'); return; }
  const setSrc = (from, to) => {
    const v = getView(t.crepe);
    let at = null;
    v.state.doc.descendants((n, p) => { if (at == null && /image/.test(n.type.name) && n.attrs.src === from) { at = p; return false; } });
    if (at == null) return false;
    const n = v.state.doc.nodeAt(at);
    v.dispatch(v.state.tr.setNodeMarkup(at, undefined, { ...n.attrs, src: to }));
    return true;
  };
  setSrc(info.src, newSrc);
  getView(t.crepe).focus();
  toast(info.kind === 'file' ? tr('toast.imageSavedOriginalKept') : tr('toast.imageSavedBesideDoc'), 6000,
    { label: tr('common.restore'), run: () => setSrc(newSrc, info.src) }, 'ok');
}

// ---------- copy the whole document ----------
async function copyWholeDoc() {
  const t = active();
  if (!t) return;
  const md = plainForClipboard(t.mode === 'source' && t.cm ? t.cm.state.doc.toString() : t.md);
  if (!md.trim()) { toast(tr('toast.docEmpty')); return; }
  try {
    const html = t.mode === 'source' ? null : htmlForClipboard(getEditorHTML(t.crepe));
    if (html && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([md], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    } else await navigator.clipboard.writeText(md);
  } catch {
    try { await navigator.clipboard.writeText(md); } catch { toast(tr('translate.copyFailed'), 'err'); return; }
  }
  const b = $('#btn-copyall');
  clearTimeout(copyWholeDoc.t);
  b.classList.add('done'); b.innerHTML = ICON.check; b.title = tr('common.copied');
  copyWholeDoc.t = setTimeout(() => { b.classList.remove('done'); b.innerHTML = ICON.copy; b.title = tr('toolbar.copyAll'); }, 2000);
  toast(tr('toast.wholeDocCopied'), 'ok');
}

// ---------- moving tabs between windows ----------
let winRole = 'main';
function tabPayload(t) {
  const content = t.mode === 'source' && t.cm ? t.cm.state.doc.toString() : t.md;
  const g = t.groupId ? groups.get(t.groupId) : null;
  return { path: t.path, content, dirty: t.dirty, mode: t.mode, locked: !!t.locked, group: g ? { name: g.name, color: g.color } : null, title: t.title || null, align: t.align || null };
}
async function detachTabs(list, alwaysOnTop, at) {
  if (!list.length) return;
  const ok = await api.detach(list.map(tabPayload), { alwaysOnTop, ...(at || {}) });
  if (!ok) return;
  for (const t of list) await closeTab(t, { skipPrompt: true, moved: true });
  if (winRole !== 'main' && tabs.length === 1 && !tabs[0].path && !tabs[0].md.trim()) api.closeNow();
}
/** this whole window was dropped onto another window's tab bar: hand every tab over and close */
async function mergeInto(m) {
  const list = [...tabs];
  const ok = await api.sendTo(m.target, list.map(tabPayload), m.at);
  if (!ok) { toast(tr('toast.targetWinNotFound')); return; }
  for (const t of list) { dropDraft(t); if (t.path) api.unwatch(t.path); }
  tabs.length = 0;
  await api.closeNow();
}
async function sendTabsToMain(list) {
  const ok = await api.toMain(list.map(tabPayload));
  if (!ok) { toast(tr('toast.mainWinNotFound')); return; }
  for (const t of list) await closeTab(t, { skipPrompt: true, moved: true });
  if (!tabs.length || (tabs.length === 1 && !tabs[0].path && !tabs[0].md.trim())) api.closeNow();
}
/** tabs handed over by another window; `at` (window coordinates) is where they were dropped on the tab bar */
async function receiveTabs(payloads, at) {
  const gmap = new Map();
  let slot = at ? dropSlot(at.x, at.y).index : null;
  clearDropMarks();
  document.body.classList.remove('tab-drop');
  for (const p of payloads || []) {
    let t;
    if (p.path) {
      t = await openPath(p.path);
      if (t && p.dirty && p.content !== t.md) setContent(t, p.content);
    } else {
      t = await newTab({ content: p.content, title: p.title, align: p.align });
      t.baseline = '';
      t.dirty = !!p.content.trim();
      contentChanged(t, t.md);
      saveTabMeta(t);
    }
    if (!t) continue;
    if (p.align && t.align !== p.align) { t.align = p.align; applyTabDir(t); }
    if (slot != null) {
      const i = tabs.indexOf(t);
      tabs.splice(i, 1);
      if (i < slot) slot--;
      tabs.splice(Math.min(slot, tabs.length), 0, t);
      slot++;
    }
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
// ---------- always on top ----------
const onTop = () => document.body.classList.contains('on-top');
function paintPin() {
  const b = $('#btn-pin');
  if (!b) return;
  const on = onTop();
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? tr('toolbar.unpin') : tr('toolbar.pin');
  b.setAttribute('aria-label', b.title);
}
async function setWindowOnTop(on) {
  const r = await api.setOnTop(on);
  document.body.classList.toggle('on-top', !!r);
  paintPin();
  return r;
}
/** a tab in a window that stays above the others: with one tab, this window itself; otherwise a small window of its own */
async function pinTab(t = active()) {
  if (!t) return;
  if (tabs.length > 1) await detachTabs([t], true);
  else if (await setWindowOnTop(true)) toast(tr('toast.alwaysOnTopOn'), 'ok');
}
/** undo «always on top»: the tabs go back to the main window; the main window itself just stops floating */
async function unpinWindow() {
  if (winRole !== 'main' && (await api.winInfo()).count > 1) { await sendTabsToMain([...tabs]); return; }
  await setWindowOnTop(false);
  toast(tr('toast.alwaysOnTopOff'));
}
function togglePin() { return onTop() ? unpinWindow() : pinTab(); }

// ======================================================================
// files
// ======================================================================
async function openPath(p, { activate = true, group = null } = {}) {
  const existing = tabs.find((t) => samePath(t.path, p));
  if (existing) { if (activate) activateTab(existing.id); return existing; }
  let file;
  try { file = await api.readFile(p); } catch (e) { toast(tr('toast.openFileFailed', { name: basename(p) })); return null; }
  // reuse a blank untitled tab instead of piling up tabs
  const cur = active();
  const reuse = cur && !cur.path && !cur.dirty && !cur.md.trim() ? cur : null;
  const t = await newTab({ path: p, content: file.content, mtime: file.mtime, activate, group, index: reuse ? tabs.indexOf(reuse) + 1 : undefined });
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
  if (t.title) return t.title.replace(/[\\/:*?"<>|#]+/g, '').trim().slice(0, 60) + '.md';
  const first = (t.md.match(/^#{1,6}\s+(.+)$/m) || t.md.match(/^\s*(\S.{0,60})/m) || [])[1] || tr('doc.untitled');
  return first.replace(/[\\/:*?"<>|#]+/g, '').trim().slice(0, 60) + '.md';
}
export const DEFAULT_NAME_PRESETS = ['note', 'prompt', 'report', 'meeting', 'idea'];
const SAVE_FORMATS = [
  { ext: 'md', label: 'Markdown', sub: '.md', tag: 'MD', color: '#0066DD' },
  { ext: 'txt', get label() { return tr('save.format.txt'); }, sub: '.txt', tag: 'TXT', color: '#6E6E78' },
  { ext: 'html', get label() { return tr('save.format.html'); }, sub: '.html', tag: 'HTML', color: '#D9730D' },
  { ext: 'pdf', label: 'PDF', sub: '.pdf', tag: 'PDF', color: '#D93A3A' },
];
/** a small white file sheet outlined in the format's colour, with the format written on it */
const fileGlyph = (f) => el('span', { class: 'fg', 'aria-hidden': 'true' },
  el('span', { html: `<svg class="ft" viewBox="0 0 30 36"><path d="M4 1.5h14.5l9 9V31a3.5 3.5 0 0 1-3.5 3.5H4A3.5 3.5 0 0 1 .5 31V5A3.5 3.5 0 0 1 4 1.5z" fill="#fff" stroke="${f.color}" stroke-width="1.3"/><path d="M18.5 1.5V7a3.5 3.5 0 0 0 3.5 3.5h5.5" fill="none" stroke="${f.color}" stroke-width="1.3"/></svg>` }),
  el('span', { class: 'tag', style: `color:${f.color}` }, f.tag));
/** Date + time with Latin digits (Jalali in Persian UI, Gregorian in English UI), safe for file names */
function timeStamp(d = new Date()) {
  const cal = getLang() === 'en' ? 'en-US-u-ca-gregory-nu-latn' : 'en-US-u-ca-persian-nu-latn';
  const parts = Object.fromEntries(new Intl.DateTimeFormat(cal, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}
const STAMP_RE = /[ _-]?\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;
const cleanName = (n) => n.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
let appInfo = null;

async function editNamePresets() {
  const ta = el('textarea', { class: 'np-edit', dir: 'auto', rows: 7, spellcheck: 'false' });
  ta.value = (settings.namePresets || DEFAULT_NAME_PRESETS).join('\n');
  const ok = await modal({ title: tr('save.presetsTitle'), text: tr('save.presetsText'), body: ta,
    buttons: [{ label: tr('common.resetDefault'), value: 'reset' }, { label: tr('common.cancel'), value: null }, { label: tr('common.save'), value: 'ok', primary: true }] });
  if (ok === 'reset') updateSettings({ namePresets: [...DEFAULT_NAME_PRESETS] });
  else if (ok === 'ok') updateSettings({ namePresets: ta.value.split('\n').map(cleanName).filter(Boolean).slice(0, 30) });
}

const SAVE_KINDS = new Set(['md', 'txt']);
const plural = (n, one, many) => (n === 1 ? one : `${fa(n)} ${many}`);
/**
 * Fedo's own save window: name, ready-made names, time stamp, folder and one or more formats.
 * Resolves to { path, ext, folder, copies: [path], exports: [{ kind, path }] } or null.
 * `path` is where the document itself now lives (Markdown or plain text); null when only exports were chosen.
 */
function saveModal(t, as) {
  return new Promise((resolve) => {
    if (!appInfo) appInfo = { documents: '' };
    let cur = t.path ? basename(t.path).replace(/\.[^.]+$/, '') : suggestedName(t).replace(/\.md$/, '');
    let stamp = STAMP_RE.test(cur);
    cur = cur.replace(STAMP_RE, '');
    const stampText = timeStamp();
    let folder = t.path ? dirname(t.path) : settings.lastSaveDir || appInfo.documents || '';
    const picked = new Set([t.path ? (/\.txt$/i.test(t.path) ? 'txt' : 'md') : (settings.defaultExt === 'txt' ? 'txt' : 'md')]);

    const inp = el('input', { type: 'text', class: 'sv-name', dir: 'auto', lang: 'en', spellcheck: 'false', 'aria-label': tr('save.fileName'), id: 'sv-name' });
    inp.value = cur === tr('doc.untitled') ? '' : cur;
    inp.placeholder = tr('save.fileNamePlaceholder');
    const tail = el('span', { class: 'sv-tail', dir: 'ltr' });
    const nameBox = el('label', { class: 'sv-field', for: 'sv-name' }, inp, tail);
    const chips = el('div', { class: 'sv-chips' });
    const names = el('div', { class: 'sv-names' });
    const stampBtn = el('button', { class: 'sv-chip sv-stamp', title: tr('save.stampTip'), 'aria-pressed': 'false',
      onclick: () => { stamp = !stamp; paint(); inp.focus(); } }, el('span', { class: 'ic', html: ICON.clock }), el('span', {}, tr('save.stamp')));
    const editBtn = el('button', { class: 'sv-chip icon sv-edit', title: tr('save.editPresets'), 'aria-label': tr('save.editPresets'), html: ICON.edit,
      onclick: async () => { ov.style.visibility = 'hidden'; await editNamePresets(); ov.style.visibility = ''; renderChips(); inp.focus(); } });
    chips.append(stampBtn, names, editBtn);
    let showAll = false;
    const renderChips = () => {
      names.innerHTML = '';
      const list = settings.namePresets || DEFAULT_NAME_PRESETS;
      const btns = list.map((n) => el('button', { class: 'sv-chip', dir: 'auto', onclick: () => { inp.value = n; inp.focus(); paint(); } }, n));
      names.append(...btns);
      if (showAll) return;
      requestAnimationFrame(() => {
        const rows = () => new Set(btns.filter((b) => !b.hidden).map((b) => b.offsetTop).concat(more.isConnected ? [more.offsetTop] : [])).size;
        const more = el('button', { class: 'sv-chip sv-more', onclick: () => { showAll = true; renderChips(); } });
        if (rows() <= 3) return;
        const tops = [...new Set(btns.map((b) => b.offsetTop))].sort((a, b) => a - b);
        btns.forEach((b) => { if (b.offsetTop > tops[2]) b.hidden = true; });
        names.append(more);
        const hiddenCount = () => btns.filter((b) => b.hidden).length;
        more.textContent = tr('save.moreNames', { n: fa(hiddenCount()) });
        for (let i = btns.length - 1; i >= 0 && rows() > 3; i--) {
          if (btns[i].hidden) continue;
          btns[i].hidden = true;
          more.textContent = tr('save.moreNames', { n: fa(hiddenCount()) });
        }
      });
    };
    renderChips();

    const folderTxt = el('span', { class: 'sv-path', dir: 'ltr', title: folder }, folder || tr('save.notSelected'));
    // Desktop and Documents one click away; the one the file goes to now is marked
    const QUICK = [
      { name: 'Desktop', path: appInfo.desktop, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 21h9M12 17v4M6.8 3h10.4C19.9 3 21.5 4.6 21.5 7.3v5.4c0 2.7-1.6 4.3-4.3 4.3H6.8C4.1 17 2.5 15.4 2.5 12.7V7.3C2.5 4.6 4.1 3 6.8 3z"/></svg>' },
      { name: 'Documents', path: appInfo.documents, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.7 16.2H8.5M15.7 12H8.5M11.3 7.9H8.5M15.9 2.75H8.1C5.3 2.75 3.75 4.4 3.75 7.2v9.6c0 2.9 1.55 4.45 4.35 4.45h7.8c2.8 0 4.35-1.55 4.35-4.45V7.2c0-2.8-1.55-4.45-4.35-4.45z"/></svg>' },
    ].filter((q) => q.path);
    const quickRow = el('div', { class: 'sv-quick', dir: 'ltr' });
    const setFolder = (d) => {
      folder = d; folderTxt.textContent = d; folderTxt.title = d;
      for (const b of quickRow.children) {
        const on = samePath(b.dataset.path, d);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      paint();
    };
    for (const q of QUICK) {
      quickRow.append(el('button', { class: 'sv-q', type: 'button', 'data-path': q.path, title: q.path, onclick: () => setFolder(q.path) },
        el('span', { class: 'qi', html: q.icon }), el('span', {}, q.name), el('span', { class: 'ck', html: ICON.check })));
    }
    for (const b of quickRow.children) { const on = samePath(b.dataset.path, folder); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    const folderRow = el('div', {}, el('div', { class: 'sv-folder', dir: 'ltr' }, el('span', { class: 'ic', html: ICON.folder }), folderTxt,
      el('button', { class: 'hb', onclick: async () => { const d = await api.openFolderDialog(); if (d) setFolder(d); } }, tr('save.changeFolder'))), quickRow);

    const fmts = el('div', { class: 'sv-formats', role: 'group', 'aria-label': tr('save.formatsLabel') });
    for (const f of SAVE_FORMATS) {
      fmts.append(el('button', { class: 'sv-fmt', role: 'checkbox', 'data-ext': f.ext, onclick: () => {
        if (picked.has(f.ext)) { if (picked.size > 1) picked.delete(f.ext); else { toast(tr('save.minOneFormat'), 'info'); return; } } else picked.add(f.ext);
        paint();
      }, title: f.sub }, el('span', { class: 'ck', html: ICON.check }), fileGlyph(f), el('span', { class: 'nm' }, f.label)));
    }
    const layout = { v: settings.pdfLayout || 'continuous' };
    const pdfSeg = el('div', { class: 'sg' });
    for (const [v, l, tip] of [['continuous', tr('pdf.continuous'), tr('pdf.continuousTip')], ['pages', tr('pdf.pages'), tr('pdf.pagesTip')]]) {
      pdfSeg.append(el('button', { 'data-v': v, title: tip, onclick: () => { layout.v = v; paint(); } }, l));
    }
    const pdfRow = el('div', { class: 'sv-pdf' }, el('span', {}, tr('save.pdfLayout')), pdfSeg);
    const outs = el('div', { class: 'sv-outs' });
    const summary = el('span', { class: 'sv-summary' });
    const okBtn = el('button', { class: 'btn primary' }, tr('common.save'));

    const fullName = () => { const n = cleanName(inp.value); return n ? n + (stamp ? '-' + stampText : '') : ''; };
    const order = () => SAVE_FORMATS.map((f) => f.ext).filter((x) => picked.has(x));
    function paint() {
      tail.textContent = stamp ? '-' + stampText : '';
      stampBtn.classList.toggle('on', stamp); stampBtn.setAttribute('aria-pressed', String(stamp));
      fmts.querySelectorAll('.sv-fmt').forEach((b) => { const on = picked.has(b.dataset.ext); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      pdfRow.hidden = !picked.has('pdf');
      pdfSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === layout.v));
      const name = fullName() || tr('save.fileNamePlaceholder');
      outs.replaceChildren(...order().map((x) => el('span', { class: 'sv-out', dir: 'ltr' }, el('b', {}, name), '.' + x)));
      const n = picked.size;
      const docKind = order().find((x) => SAVE_KINDS.has(x));
      okBtn.textContent = n > 1 ? tr('save.saveNFiles', { n: fa(n) }) : docKind ? tr('common.save') : tr('save.exportBtn');
      summary.textContent = !docKind ? tr('save.exportOnlySummary')
        : n > 1 ? tr('save.withMoreSummary', { fmt: docKind === 'md' ? 'Markdown' : tr('save.format.txt'), n: fa(n - 1) }) : '';
      summary.title = summary.textContent;
      okBtn.disabled = !cleanName(inp.value) || !folder;
    }
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const submit = () => {
      const name = fullName();
      if (!name || !folder) return;
      const sep = folder.includes('\\') ? '\\' : '/';
      const at = (x) => folder.replace(/[\\/]+$/, '') + sep + name + '.' + x;
      const list = order();
      const docKind = list.find((x) => SAVE_KINDS.has(x)) || null;
      if (picked.has('pdf')) updateSettings({ pdfLayout: layout.v });
      done({
        path: docKind ? at(docKind) : null, ext: docKind, folder,
        copies: list.filter((x) => SAVE_KINDS.has(x) && x !== docKind).map(at),
        exports: list.filter((x) => !SAVE_KINDS.has(x)).map((kind) => ({ kind, path: at(kind) })),
      });
    };
    okBtn.addEventListener('click', submit);
    inp.addEventListener('input', paint);
    const onKey = (e) => {
      if (ov.style.visibility === 'hidden') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && document.activeElement === inp) { e.preventDefault(); e.stopPropagation(); submit(); }
    };
    const lbl = (text, extra) => el('div', { class: 'sv-label' }, el('span', {}, text), extra || null);
    const box = el('div', { class: 'modal save-modal', dir: langDir(), role: 'dialog', 'aria-label': as ? tr('menu.file.saveAs') : tr('common.save') },
      el('div', { class: 'm-body' },
        el('h3', {}, as ? tr('menu.file.saveAs') : tr('save.docTitle')),
        el('div', { class: 'sv-block' }, lbl(tr('save.fileName')), nameBox, chips),
        el('div', { class: 'sv-block' }, lbl(tr('save.folder'), el('button', { class: 'sv-link', title: tr('save.nativeDialogTip'), onclick: () => done({ native: true }) }, tr('save.nativeDialog'))), folderRow),
        el('div', { class: 'sv-block' }, lbl(tr('save.format'), el('span', { class: 'sv-hint' }, tr('save.multiFormatHint'))), fmts, pdfRow, outs)),
      el('div', { class: 'row' }, summary, el('button', { class: 'btn', onclick: () => done(null) }, tr('common.cancel')), okBtn));
    const ov = el('div', { class: 'overlay' }, box);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(ov);
    paint();
    inp.focus(); inp.select();
  });
}
async function askSavePath(t, as) {
  for (;;) {
    const r = await saveModal(t, as);
    if (!r) return null;
    if (r.native) { const p = await api.saveDialog(suggestedName(t)); return p ? { path: p, ext: /\.txt$/i.test(p) ? 'txt' : 'md', copies: [], exports: [] } : null; }
    const all = [r.path, ...r.copies, ...r.exports.map((x) => x.path)].filter(Boolean);
    const taken = [];
    for (const p of all) {
      if (samePath(p, t.path)) continue;
      const ex = await api.stat(p).catch(() => ({ exists: false }));
      if (ex.exists) taken.push(basename(p));
    }
    if (taken.length) {
      const ok = await modal({
        title: taken.length === 1 ? tr('save.existsOne', { name: taken[0] }) : tr('save.existsMany', { n: fa(taken.length) }),
        text: (taken.length > 1 ? taken.map((x) => tr('common.quote', { text: x })).join(tr('common.listSep')) + '. ' : '') + tr('save.overwriteText'),
        buttons: [{ label: tr('save.chooseOtherName'), value: false }, { label: tr('save.overwrite'), value: true, danger: true }] });
      if (!ok) continue;
    }
    updateSettings({ lastSaveDir: r.folder });
    return r;
  }
}
/** build HTML / PDF files; one toast at the end */
async function exportTo(t, list) {
  if (!list.length) return [];
  if (t.mode === 'source') setMode(t, 'wysiwyg');
  const made = [];
  for (const { kind, path: p } of list) {
    try {
      const out = await exportDocument({ kind, layout: settings.pdfLayout || 'continuous', html: getEditorHTML(t.crepe), title: basename(p).replace(/\.[^.]+$/, ''), baseDir: tabDir(t), align: tabAlign(t), docPath: p, directPath: p });
      if (out) made.push(out);
    } catch (e) { toast(tr('toast.exportKindFailed', { kind: kind.toUpperCase(), err: e.message || e }), 6000, null, 'err'); }
  }
  return made;
}
/** the save card's buttons for one file on disk */
const fileActions = (p, { open = false } = {}) => [
  open ? { icon: ICON.file, label: tr('common.open'), run: () => api.openExternal(p) } : null,
  { icon: ICON.folder, label: tr('file.showInFolder'), primary: !open, run: () => api.reveal(p) },
  { icon: ICON.copy, label: tr('file.copyFile'), done: tr('common.copied'), run: async () => { const ok = await api.copyFile(p); if (!ok) toast(tr('toast.copyFileFailed'), 'err'); return ok; } },
].filter(Boolean);
const fmtOf = (p) => (p.match(/\.([^.\\/]+)$/) || [, ''])[1].toUpperCase();
const andList = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(tr('common.listSep')) + tr('common.listAnd') + xs[xs.length - 1]);
/** a document saved through the save window (first save, save as), with any extra formats made alongside */
function announceSave(docPath, others = [], failed = 0) {
  const parts = [];
  if (others.length) parts.push(tr('save.alongWith', { list: andList([...new Set(others.map(fmtOf))]) }));
  if (failed) parts.push(tr('save.failedCount', { n: fa(failed) }));
  saveToast({
    title: tr('toast.saved'),
    name: basename(docPath),
    folder: dirname(docPath),
    extra: parts.join(tr('common.semiSep')) || null,
    actions: fileActions(docPath),
  });
}
/** exports made without saving the document itself */
function announceFiles(files) {
  if (!files.length) return;
  const last = files[files.length - 1];
  const one = files.length === 1;
  saveToast({
    title: one ? tr('save.exportedOne') : tr('save.exportedMany', { n: fa(files.length) }),
    name: one ? basename(last) : andList(files.map(basename)),
    folder: dirname(last),
    actions: one ? fileActions(last, { open: true }) : fileActions(last).slice(0, 1),
  });
}

async function save(t = active(), as = false, silent = false) {
  if (!t) return false;
  let p = t.path;
  let extras = null;
  if (!p || as) {
    const r = await askSavePath(t, as);
    if (!r) return false;
    if (!r.path) { announceFiles(await exportTo(t, r.exports)); return false; }
    p = r.path;
    extras = r;
  }
  const oldPath = t.path;
  const content = t.mode === 'source' && t.cm ? t.cm.state.doc.toString() : t.md;
  try {
    const r = await api.writeFile(p, content);
    t.mtime = r.mtime;
  } catch (e) {
    toast(tr('toast.saveFailed', { err: e.message || e }), 5000, null, 'err');
    return false;
  }
  if (oldPath && !samePath(oldPath, p)) { await api.historyMove(oldPath, p); api.aiMarksMove(oldPath, p, true).catch(() => {}); api.unwatch(oldPath); }
  if (!samePath(oldPath, p)) api.watch(p);
  t.path = p;
  t.md = content;
  t.baseline = content;
  t.diskContent = content;
  t.dirty = false;
  dropDraft(t);
  t.aiNames = null;
  if (!oldPath && markCount(t)) persistMarks(t);
  await api.historyAdd(p, content, 'save');
  t.lastSnap = content;
  t.lastSnapTime = Date.now();
  addRecent(p);
  renderTabs();
  updateTitle();
  updateStatus(silent ? tr('settings.files.autosave') : tr('toast.saved'));
  if (t.id === activeId && historyPanel.visible()) historyPanel.refresh();
  saveSession();
  if (extras) {
    const files = [];
    for (const c of extras.copies || []) { try { await api.writeFile(c, content); files.push(c); } catch (e) { toast(tr('toast.createFileFailed', { name: basename(c) }), 5000, null, 'err'); } }
    files.push(...await exportTo(t, extras.exports || []));
    announceSave(p, files, (extras.copies || []).length + (extras.exports || []).length - files.length);
  }
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
      toast(tr('toast.externalUpdated', { name: basename(p) }));
    } else {
      const r = await modal({
        title: tr('dialog.external.title', { name: basename(p) }),
        text: tr('dialog.external.text'),
        buttons: [{ label: tr('dialog.external.keepMine'), value: false }, { label: tr('dialog.external.loadDisk'), value: true, primary: true }],
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
  body.append(el('div', { class: 'tree-root' }, el('span', {}, tr('sidebar.recentCount', { n: fa(list.length) })),
    list.length ? el('button', { class: 'btn', style: 'padding:2px 8px;font-size:11px', onclick: () => { updateSettings({ recent: [] }); } }, tr('common.clear')) : null));
  if (!list.length) { body.append(el('div', { class: 'side-empty' }, tr('sidebar.recentEmpty'))); return; }
  const cur = active();
  for (const r of items) {
    const it = el('div', { class: 'recent-item' + (r.exists ? '' : ' missing') + (cur && samePath(cur.path, r.path) ? ' current' : ''), title: r.path },
      el('span', { class: 'rn', dir: bidi(basename(r.path)) }, basename(r.path)),
      el('span', { class: 'rp' }, dirname(r.path)),
      el('span', { class: 'rt' }, r.exists ? (r.time ? relTime(r.time) : '') : tr('sidebar.fileMissing')));
    it.addEventListener('click', () => { if (r.exists) openPath(r.path); else toast(tr('toast.fileMovedOrDeleted')); });
    it.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu([
        { label: tr('common.open'), disabled: !r.exists, run: () => openPath(r.path) },
        { label: tr('file.showInFolder'), disabled: !r.exists, run: () => api.reveal(r.path) },
        { label: tr('sidebar.removeFromList'), run: () => updateSettings({ recent: settings.recent.filter((x) => !samePath(x.path, r.path)) }) },
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
// In a small window the sidebar steps aside by itself; the main menu still opens it by hand.
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
  checkNarrow();
}
function checkNarrow() {
  const ed = $('#editors');
  if (!ed) return;
  const ed2 = $('#editors2');
  const w = document.body.classList.contains('split-on') && ed2 ? Math.min(ed.clientWidth, ed2.clientWidth) : ed.clientWidth;
  document.body.classList.toggle('narrow-page', w < 760);
}
window.addEventListener('resize', () => { applyCompact(); applySplit(); });
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
  requestAnimationFrame(() => { applySplit(); checkNarrow(); });
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
    body.append(el('div', { class: 'side-empty' }, tr('sidebar.noFolder'), el('br'),
      el('button', { class: 'btn', onclick: () => openFolder() }, tr('sidebar.openFolder'))));
    return;
  }
  if (!treeCache || force) treeCache = await api.tree(settings.folder);
  body.innerHTML = '';
  body.append(el('div', { class: 'tree-root', title: settings.folder },
    el('span', {}, basename(settings.folder)),
    el('span', { class: 'tree-tools' },
      el('button', { class: 'icon-btn', title: tr('sidebar.refresh'), html: ICON.refresh, onclick: () => renderTree(true) }),
      el('button', { class: 'icon-btn', title: tr('sidebar.closeFolder'), html: ICON.x, onclick: () => { treeCache = null; updateSettings({ folder: null }); } }))));
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
  if (!treeCache.length) body.append(el('div', { class: 'side-empty' }, tr('sidebar.noMdFiles')));
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
  if (!items.length) { body.append(el('div', { class: 'side-empty' }, tr('sidebar.noOutline'))); return; }
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
  $('#st-words').textContent = tr('status.words', { n: fa(words) });
  $('#st-words').title = tr('status.wordsTip', { chars: fa(chars), mins: fa(Math.max(1, Math.round(words / 200))) });
  if (savedMsg) {
    const sv = $('#st-saved');
    sv.innerHTML = ICON.check;
    sv.append(el('span', {}, savedMsg));
    clearTimeout(updateStatus.t);
    updateStatus.t = setTimeout(() => { sv.textContent = ''; }, 2500);
  }
  $('#st-mode').hidden = t.mode !== 'source';
  $('#st-lock').innerHTML = (t.locked ? ICON.lock : ICON.unlock) + `<span>${t.locked ? tr('safeMode.on') : tr('safeMode.title')}</span>`;
  $('#st-lock').classList.toggle('on', !!t.locked);
  $('#st-zoom').textContent = tr('status.percent', { n: fa(Math.round((settings.zoom || 1) * 100)) });
  paintDirSeg(t);
  paintMiniBars();
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
  const more = !custom && String(id).startsWith('mt:') ? MORE_THEMES.find((x) => x.id === id) : null;
  if (custom || more) {
    if (!style) { style = el('style', { id: 'custom-theme' }); document.head.append(style); }
    style.textContent = custom ? custom.css : moreThemeCss(more);
    document.documentElement.dataset.theme = more && more.dark ? 'dark' : 'light';
    document.documentElement.dataset.custom = '1';
  } else {
    if (style) style.remove();
    delete document.documentElement.dataset.custom;
    document.documentElement.dataset.theme = THEMES.find((x) => x.id === id) ? id : 'light';
  }
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark');
  setMermaidDark(dark);
  if (tabs.length) renderTabs(); // group names take readable colours for the theme
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
  for (const t of tabs) applyTabDir(t);
  document.documentElement.setAttribute('spellcheck', settings.spellcheck ? 'true' : 'false');
  for (const t of tabs) applySpell(t);
  api.setSpellcheck(!!settings.spellcheck);
  api.setLogo(settings.logo);
  document.body.classList.toggle('no-ext-color', settings.extColor === false);
  document.body.classList.toggle('no-ext-image', settings.extImage === false);
  document.body.classList.toggle('no-ext-translate', settings.extTranslate === false);
  document.body.classList.toggle('no-ext-google', settings.extGoogle === false);
  if (settings.extTranslate === false) closeTranslate();
  const lc = settings.lastColor || DEFAULTS.lastColor;
  document.documentElement.style.setProperty('--nv-last-color', lc.bg || lc.color || '#D93A3A');
  if (api.updateConfig) api.updateConfig({ auto: settings.updateAuto !== false, download: !!settings.updateDownload, installOnQuit: settings.updateInstallOnQuit !== false });
  Object.assign(typingOpts, { autoPair: settings.autoPair !== false, pasteLink: settings.pasteLink !== false, plainAfterPaste: settings.plainAfterPaste !== false });
  applySidebar();
  updateStatus();
}
let persistT = null;
function persistSettings() { clearTimeout(persistT); persistT = setTimeout(() => api.setSettings(settings), 300); }
function updateSettings(patch) {
  Object.assign(settings, patch);
  applyAll();
  persistSettings();
  if (['aiName', 'aiIcon', 'aiIconCustom', 'aiChar', 'aiCharFace', 'aiCharFull', 'aiEnabled', 'aiShowName'].some((k) => k in patch)) { paintBrand(); renderTabs(); refreshAiViews(); }
  if ('aiMarks' in patch) refreshAiViews();
}
function toggleSetting(k) {
  updateSettings({ [k]: !settings[k] });
  const names = { spellcheck: 'menu.view.spellcheck' };
  if (names[k]) toast(tr(settings[k] ? 'toast.settingOn' : 'toast.settingOff', { name: tr(names[k]) }));
}

function fontItems(key) {
  return FONTS.map((f) => ({
    label: f.name, checked: settings[key] === f.id,
    style: f.id ? `font-family: '${f.id}'` : null,
    run: () => updateSettings({ [key]: f.id }),
  }));
}
// ---------- updates (GitHub Releases) ----------
let upd = { status: 'idle', current: '', manual: false };
const updListeners = new Set();
const faVer = (v) => String(v || '').split('.').map((n) => fa(Number(n) || 0)).join('.');
const updReady = () => upd.status === 'available' || upd.status === 'downloading' || upd.status === 'downloaded';
function onUpdateState(next, initial = false) {
  const prev = upd;
  upd = next;
  paintUpdatePill();
  updListeners.forEach((f) => f());
  if (initial || prev.status === next.status) return;
  if (next.status === 'available' && prev.status !== 'downloading') {
    toast(tr('update.versionReady', { v: faVer(next.version) }), 12000, [
      { label: next.manual ? tr('update.downloadPage') : tr('update.downloadInstall'), run: () => api.updateDownload() },
      { label: tr('common.later'), run: () => {} },
    ], 'info');
  } else if (next.status === 'downloaded') {
    toast(tr('update.versionDownloaded', { v: faVer(next.version) }), 15000, [{ label: tr('update.installRestart'), run: installUpdate }], 'ok');
  } else if (next.status === 'error' && prev.status === 'downloading') {
    toast(tr('update.downloadIncomplete'), 6000, [{ label: tr('common.retry'), run: () => api.updateDownload() }], 'err');
  }
}
// ---------- the update pill next to the menu: quiet, but it stays until the update is done ----------
const mb = (b) => new Intl.NumberFormat(langLocale(), { maximumFractionDigits: b >= 10485760 ? 0 : 1 }).format(b / 1048576);
function updEta() {
  if (!upd.speed || !upd.total) return '';
  const s = Math.max(1, Math.round((upd.total - upd.transferred) / upd.speed));
  return s < 60 ? tr('update.lessThanMin') : tr('update.aboutMins', { n: fa(Math.round(s / 60)) });
}
const ringSvg = (pct) => {
  const c = 2 * Math.PI * 8;
  return `<svg class="ring" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="2.5"/><circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 11 11)"/></svg>`;
};
function updPillState() {
  if (upd.status === 'available') return 'avail';
  if (upd.status === 'downloading') return 'down';
  if (upd.status === 'downloaded') return 'ready';
  if (upd.status === 'error' && upd.failedDownload && upd.version) return 'fail';
  return null;
}
function paintUpdatePill() {
  const b = $('#upd-pill');
  if (!b) return;
  const st = updPillState();
  b.hidden = !st;
  if (!st) return;
  b.className = 'upd-pill ' + st;
  const v = faVer(upd.version);
  if (st === 'avail') {
    b.innerHTML = `<span class="ic">${ICON.download}</span><span class="lb">${tr('settings.sec.update')}</span>`;
    b.title = tr('update.fedoReady', { v });
  } else if (st === 'down') {
    b.innerHTML = `${ringSvg(upd.percent || 0)}<span class="pc">${tr('status.percent', { n: fa(upd.percent || 0) })}</span>`;
    b.title = tr('update.downloadingFedo', { v });
  } else if (st === 'ready') {
    b.innerHTML = `<span class="ic">${ICON.check}</span><span class="lb">${tr('update.install')}</span>`;
    b.title = tr('update.fedoReadyToInstall', { v });
  } else {
    b.innerHTML = `<span class="ic">${ICON.refresh || ICON.download}</span><span class="lb">${tr('update.resumeDownload')}</span>`;
    b.title = tr('update.downloadFailedTitle');
  }
  b.setAttribute('aria-label', b.title);
}
/** the small panel under the pill; it follows the download live */
function openUpdatePop(anchor) {
  if (upd.manual && upd.status === 'available') { api.updateDownload(); return; }
  const panel = () => {
    const root = el('div', { class: 'upd-pop' });
    const paint = () => {
      if (!root.isConnected && root.dataset.done) { updListeners.delete(paint); return; }
      root.dataset.done = '1';
      root.innerHTML = '';
      const v = faVer(upd.version);
      const st = updPillState();
      if (st === 'avail') {
        root.append(el('b', {}, tr('update.versionReady', { v })),
          el('p', {}, tr('update.availBody')),
          el('div', { class: 'upd-acts' },
            el('button', { class: 'btn', onclick: () => api.updateOpenPage('notes') }, tr('update.releaseNotes')),
            el('button', { class: 'btn primary', onclick: () => api.updateDownload() }, tr('update.downloadInstall'))));
      } else if (st === 'down') {
        const total = upd.total ? tr('update.mbProgress', { cur: mb(upd.transferred || 0), total: mb(upd.total) }) : tr('update.preparing');
        const slow = upd.speed && upd.speed < 100 * 1024;
        root.append(el('div', { class: 'upd-h' }, el('b', {}, tr('update.downloadingFedo', { v })), el('span', { class: 'pc' }, tr('status.percent', { n: fa(upd.percent || 0) }))),
          el('div', { class: 'upd-track' }, el('div', { class: 'upd-fill', style: `width:${upd.percent || 0}%` })),
          el('div', { class: 'upd-meta' }, el('span', {}, total), el('span', {}, updEta())));
        if (upd.speed) root.append(el('div', { class: 'upd-meta' }, el('span', {}, tr('update.speed', { kbps: fa(Math.round(upd.speed / 1024)) }))));
        if (slow) root.append(el('p', { class: 'upd-note' }, tr('update.slowNet')));
      } else if (st === 'ready') {
        root.append(el('b', {}, tr('update.fedoReadyToInstall', { v })),
          el('p', {}, tr('update.readyBody')),
          el('div', { class: 'upd-acts' },
            el('button', { class: 'btn', onclick: () => closeMenu() }, tr('update.onQuit')),
            el('button', { class: 'btn primary', onclick: () => { closeMenu(); installUpdate(); } }, tr('update.installNow'))));
      } else if (st === 'fail') {
        root.append(el('b', {}, tr('update.downloadFailedTitle')),
          el('p', {}, tr('update.downloadFailedBody')),
          el('div', { class: 'upd-acts' }, el('button', { class: 'btn primary', onclick: () => api.updateDownload() }, tr('update.resume'))));
      } else { closeMenu(); }
    };
    updListeners.add(paint);
    paint();
    return root;
  };
  const r = anchor.getBoundingClientRect();
  showMenu([{ panel, className: 'upd-menu' }], langDir() === 'rtl' ? r.right : r.left, r.bottom + 8);
}

/** unsaved work is saved (or explicitly dropped) before the installer closes the app */
async function installUpdate() {
  const dirty = tabs.filter((t) => t.dirty);
  if (dirty.length) {
    const r = await modal({
      title: tr('update.saveBeforeInstallTitle'),
      text: tr('update.saveBeforeInstallText', { target: dirty.length === 1 ? tr('common.quote', { text: tabTitle(dirty[0]) }) : tr('update.nDocs', { n: fa(dirty.length) }) }),
      buttons: [{ label: tr('common.cancel'), value: null }, { label: tr('update.installWithoutSaving'), value: 'drop', danger: true, aside: true }, { label: tr('update.saveAndInstall'), value: 'save', primary: true }],
    });
    if (!r) return;
    if (r === 'save' && !(await saveAll())) return;
  }
  await persistNow();
  api.updateInstall();
}
function updateStatusLine() {
  // right after a check the time adds nothing; it shows once a minute has passed
  const ago = upd.checkedAt && Date.now() - upd.checkedAt >= 60000 ? relTime(upd.checkedAt) : '';
  switch (upd.status) {
    case 'checking': return ['muted', tr('update.checking')];
    case 'available': return ['new', tr('update.statusAvail', { v: faVer(upd.version) })];
    case 'downloading': return ['new', tr('update.statusDownloading', { v: faVer(upd.version), pct: fa(upd.percent || 0) })];
    case 'downloaded': return ['ok', tr('update.statusDownloaded', { v: faVer(upd.version) })];
    case 'none': return ['ok', ago ? tr('update.statusLatestAgo', { ago }) : tr('update.statusLatest')];
    case 'error': return ['err', tr('update.statusError')];
    default: return ['muted', tr('update.statusNever')];
  }
}

// ---------- built-in extensions (switched on and off in Settings) ----------
const TRANSLATE_SQ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5h9M7.5 3.5v2M5 5.5c.9 3.2 3.2 5.8 6.5 7.3M10 5.5c-.9 3.2-3.2 5.8-6.5 7.3M12.5 20.5l4-9l4 9M13.8 17.5h5.4"/></svg>';
const EXTENSIONS = [
  { key: 'extColor', get name() { return tr('ext.color.name'); }, builtin: true, icon: ICON.palette, color: '#D6407F',
    get hint() { return tr('ext.color.hint'); }, details: true },
  { key: 'extImage', get name() { return tr('ext.image.name'); }, builtin: true, icon: ICON.image, color: '#0E7AE6',
    get hint() { return tr('ext.image.hint'); } },
  { key: 'extTranslate', get name() { return tr('ext.translate.name'); }, builtin: true, icon: TRANSLATE_SQ, color: '#2F7BF6',
    get hint() { return tr('ext.translate.hint'); }, details: () => translatorDetails() },
  { key: 'extGoogle', get name() { return tr('ext.google.name'); }, builtin: true, icon: ICON.search, color: '#0E9F8E',
    get hint() { return tr('ext.google.hint'); } },
  { key: 'spellcheck', get name() { return tr('menu.view.spellcheck'); }, get tag() { return tr('ext.englishOnly'); }, icon: ICON.tickSquare, color: '#2FA84F', get hint() { return tr('ext.spellcheck.hint'); } },
];
function extRow(x, sw) {
  const on = () => (x.builtin ? settings[x.key] !== false : !!settings[x.key]);
  const toggleBtn = sw(on, () => updateSettings({ [x.key]: !on() }), x.name);
  const row = el('div', { class: 'ex', 'data-s': x.name + ' ' + x.hint + ' ' + tr('ext.searchTag') },
    el('span', { class: 'sq', style: `background:${x.color}`, html: x.icon }),
    el('span', { class: 'nm' }, el('b', {}, x.name, x.builtin ? el('span', { class: 'pill' }, tr('ext.builtin')) : null, x.tag ? el('span', { class: 'pill' }, x.tag) : null), el('small', {}, x.hint)));
  if (!x.details) { if (x.keyHint) row.append(kbd(x.keyHint)); row.append(toggleBtn); return row; }
  if (typeof x.details === 'function') return detailsWrap(x, row, toggleBtn, x.details(sw));
  const sw2 = (list, text) => el('span', { class: 'ex-sw' }, list.map((c) => el('span', { class: 'sw' + (text ? '' : ' bg'), title: c.name, style: text ? `color:${c.c}` : `background:${c.c}` }, text ? tr('color.glyph') : '')));
  const details = el('div', { class: 'xd', hidden: true },
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l' }, tr('color.text')), sw2(TEXT_COLORS, true)),
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l' }, tr('ext.color.bgShort')), sw2(BG_COLORS, false)),
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l' }, tr('color.last')), kbd('Alt+H'), el('span', { class: 'row-mut' }, tr('ext.color.lastHint'))));
  const more = el('button', { class: 'xb', 'aria-expanded': 'false', onclick: () => { details.hidden = !details.hidden; more.setAttribute('aria-expanded', String(!details.hidden)); more.classList.toggle('open', !details.hidden); } },
    tr('settings.title'), el('span', { class: 'ic', html: ICON.chevDown }));
  row.append(more, toggleBtn);
  return el('div', { class: 'ex-wrap', 'data-s': x.name + ' ' + x.hint + ' ' + tr('ext.searchTag') }, row, details);
}

function detailsWrap(x, row, toggleBtn, inner) {
  const details = el('div', { class: 'xd', hidden: true }, inner);
  const more = el('button', { class: 'xb', 'aria-expanded': 'false', onclick: () => { details.hidden = !details.hidden; more.setAttribute('aria-expanded', String(!details.hidden)); more.classList.toggle('open', !details.hidden); } },
    tr('settings.title'), el('span', { class: 'ic', html: ICON.chevDown }));
  row.append(more, toggleBtn);
  return el('div', { class: 'ex-wrap', 'data-s': x.name + ' ' + x.hint + ' ' + tr('ext.searchTag') }, row, details);
}
function translatorDetails() {
  const isEn = getLang() === 'en';
  const target = el('select', { class: 'set-select', 'aria-label': tr('translate.targetLang') },
    el('option', { value: 'auto' }, tr('ext.translate.autoPair')),
    el('optgroup', { label: tr('ext.translate.alwaysTo') }, LANGS.map((l) => el('option', { value: l[0] }, isEn ? l[2] : l[1]))));
  target.value = settings.trTo || 'auto';
  target.addEventListener('change', () => updateSettings({ trTo: target.value }));
  const alts = el('button', { class: 'tg big' + (settings.trAlts !== false ? ' on' : ''), role: 'switch', 'aria-checked': String(settings.trAlts !== false), 'aria-label': tr('ext.translate.alts') });
  alts.addEventListener('click', () => { const on = settings.trAlts === false; updateSettings({ trAlts: on }); alts.classList.toggle('on', on); alts.setAttribute('aria-checked', String(on)); });
  const altClick = el('button', { class: 'tg big' + (settings.trAltClick !== false ? ' on' : ''), role: 'switch', 'aria-checked': String(settings.trAltClick !== false), 'aria-label': tr('ext.translate.instant') });
  altClick.addEventListener('click', () => { const on = settings.trAltClick === false; updateSettings({ trAltClick: on }); altClick.classList.toggle('on', on); altClick.setAttribute('aria-checked', String(on)); });
  return [
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l w' }, tr('translate.targetLang')), target),
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l w' }, ''), el('span', { class: 'row-mut wrap' }, tr('ext.translate.targetHint'))),
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l w' }, tr('ext.translate.alts')), alts, el('span', { class: 'row-mut' }, tr('ext.translate.altsHint'))),
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l w' }, tr('ext.translate.instant')), altClick, el('span', { class: 'row-mut' }, tr('ext.translate.instantHint'))),
    el('div', { class: 'xd-r' }, el('span', { class: 'xd-l w' }, tr('ext.translate.shortcut')), kbd('Alt+T')),
  ];
}

// ---------- settings window: sections on the right, changes apply at once ----------
const THEME_SWATCH = { light: ['#ffffff', '#1d1d1f'], dark: ['#1e1f22', '#dcdde1'], sepia: ['#f7f1e3', '#3b2f22'], nord: ['#2e3440', '#e5e9f0'], garden: ['#fbfdf9', '#1d2a20'] };
const PAGE_WIDTHS = [[720, 'settings.font.narrow'], [860, 'settings.font.medium'], [1040, 'settings.font.wide']];
const AI_SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 4l1.6 4.4L16.5 10l-4.4 1.6L10.5 16l-1.6-4.4L4.5 10l4.4-1.6zM17.5 14.5l.8 2.2l2.2.8l-2.2.8l-.8 2.2l-.8-2.2l-2.2-.8l2.2-.8z"/></svg>';
const KEY_LIST = [
  [['menu.file.newTab', 'Ctrl+T'], ['menu.file.newWindow', 'Ctrl+N'], ['common.open', 'Ctrl+O'], ['menu.file.quickOpen', 'Ctrl+P'], ['sidebar.openFolder', 'Ctrl+Shift+O'], ['common.save', 'Ctrl+S'], ['menu.file.saveAs', 'Ctrl+Shift+S'], ['common.saveAll', 'Ctrl+Alt+S'],
    ['keys.closeTab', 'Ctrl+W'], ['tabs.reopenClosed', 'Ctrl+Shift+T'], ['keys.renameTab', 'F2'], ['keys.nextTab', 'Ctrl+Tab'], ['toolbar.history', 'Ctrl+Shift+H'], ['settings.title', 'Ctrl+,'], ['keys.fullscreen', 'F11']],
  [['keys.find', 'Ctrl+F'], ['find.replace', 'Ctrl+H'], ['context.copyPlain', 'Ctrl+Shift+C'], ['context.pastePlain', 'Ctrl+Shift+V'], ['editor.toolbar.strike', 'Alt+Shift+5'], ['keys.slashMenu', '/'], ['keys.openLink', 'Ctrl+Click'], ['status.sourceCode', 'Ctrl+/'], ['sidebar.title', 'Ctrl+Shift+L'],
    ['sidebar.outline', 'Ctrl+Shift+1'], ['keys.translateSel', 'Alt+T'], ['keys.instantTranslate', 'Alt+Double-click'], ['safeMode.title', 'F8'], ['keys.aiAssistant', 'Ctrl+J'], ['keys.aiWholeDoc', 'Ctrl+Shift+J'], ['status.zoomIn', 'Ctrl+='], ['status.zoomOut', 'Ctrl+-'], ['keys.actualSize', 'Ctrl+0']],
];
let settingsOpen = null;
async function openSettings(section = 'look') {
  if (typeof section !== 'string') section = 'look';
  if (settingsOpen) { settingsOpen(section); return; }
  // open at once: the Windows font list (slow the first time) and custom themes fill in when they arrive
  const sysP = loadSystemFonts();
  api.customThemes().then((list) => { if (JSON.stringify(list) !== JSON.stringify(customThemes)) { customThemes = list; paintThemes(); } }).catch(() => {});

  // --- small controls ---
  // a label may carry a small tag after it: 'غلط‌یابی املایی|فقط انگلیسی'
  const row = (label, hint, control, tall) => {
    const [text, tag] = String(label).split('|');
    return el('div', { class: 'row' + (hint || tall ? ' tw' : ''), 'data-s': text + ' ' + (tag || '') + ' ' + (hint || '') },
      el('span', {}, text, tag ? el('span', { class: 'pill' }, tag) : null, hint ? el('small', {}, hint) : null), control);
  };
  const sw = (get, set, label) => {
    const b = el('button', { class: 'tg big' + (get() ? ' on' : ''), role: 'switch', 'aria-checked': String(!!get()), 'aria-label': label });
    b.addEventListener('click', async () => { await set(!get()); const on = !!get(); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    return b;
  };
  const toggle = (key, label, hint, key2) => { const name = String(label).split('|')[0]; return row(label, hint, key2
    ? el('span', { class: 'row-end' }, kbd(key2), sw(() => settings[key], () => updateSettings({ [key]: !settings[key] }), name))
    : sw(() => settings[key] !== false && !!settings[key], () => updateSettings({ [key]: !settings[key] }), name)); };
  const seg = (opts, get, set) => {
    const box = el('div', { class: 'sg' });
    const paint = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(get())));
    for (const [v, l] of opts) box.append(el('button', { 'data-v': v, onclick: () => { set(v); paint(); } }, l));
    paint();
    return box;
  };
  const step = (get, change, fmt) => {
    const val = el('span', {}, fmt(get()));
    const go = (d) => () => { change(d); val.textContent = fmt(get()); paintPreview(); };
    return el('div', { class: 'st' }, el('button', { title: tr('common.more'), html: ICON.plus, onclick: go(1) }), val, el('button', { title: tr('common.less'), html: ICON.minus, onclick: go(-1) }));
  };
  const clampSet = (key, stepBy, min, max) => (d) => updateSettings({ [key]: Math.round(Math.min(max, Math.max(min, settings[key] + d * stepBy)) * 100) / 100 });
  const fontSel = (key, first) => {
    const own = [first || FONTS[0], ...FONTS.slice(1)];
    const sel = el('select', { class: 'set-select', 'aria-label': tr('imgedit.font') },
      el('optgroup', { label: tr('settings.font.appFonts') }, own.map((f) => el('option', { value: f.id, selected: f.id === settings[key] }, f.name))));
    // a Windows font that is already chosen shows right away; the full list follows
    if (settings[key] && !own.some((f) => f.id === settings[key])) sel.append(el('option', { value: settings[key], selected: true }, settings[key]));
    sysP.then((sys) => {
      if (!sys.length) return;
      const cur = sel.value;
      sel.querySelectorAll(':scope > option').forEach((o) => o.remove());
      sel.append(el('optgroup', { label: tr('settings.font.windowsFonts') }, sys.map((f) => el('option', { value: f }, f))));
      sel.value = cur;
    });
    sel.addEventListener('change', () => { updateSettings({ [key]: sel.value }); paintPreview(); });
    return sel;
  };
  const group = (...rows) => el('div', { class: 'grp' }, rows);
  // "my defaults": changing one also applies it now; a small note shows Fedo's own value when they differ
  const defHints = [];
  const paintDefs = () => {
    for (const f of defHints) f();
    resetFedo.hidden = !settings.userDefaults;
  };
  const setDefaults = (patch) => {
    const next = { ...docDefaults(), ...patch };
    const own = Object.fromEntries(DOC_KEYS.filter((k) => next[k] !== FEDO_DOC[k]).map((k) => [k, next[k]]));
    updateSettings({ ...patch, userDefaults: Object.keys(own).length ? own : null });
    paintDefs();
  };
  const setDef = (key, stepBy, min, max) => (d) => setDefaults({ [key]: Math.round(Math.min(max, Math.max(min, docDefaults()[key] + d * stepBy)) * 100) / 100 });
  const defRow = (text, control, key, fmt) => {
    const hint = el('small', {});
    const r = el('div', { class: 'row tw', 'data-s': text + ' ' + tr('ext.builtin') }, el('span', {}, text, hint), control);
    defHints.push(() => { const v = docDefaults()[key]; hint.textContent = v !== FEDO_DOC[key] ? tr('settings.font.appDefaultVal', { val: fmt(FEDO_DOC[key]) }) : ''; hint.hidden = v === FEDO_DOC[key]; });
    return r;
  };
  const resetFedo = el('button', { class: 'sv-link', onclick: () => { setDefaults({ ...FEDO_DOC }); built.set('font', secEl(SECTIONS.find((x) => x.id === 'font'))); show('font'); } }, tr('settings.font.resetToApp'));
  const label = (t) => el('div', { class: 'lbl' }, t);

  // --- sections ---
  const preview = el('div', { class: 'grp set-preview set-free' },
    el('div', { class: 'pv-h' }, tr('settings.font.sampleHeading')),
    el('div', { class: 'pv-t' }, tr('settings.font.sampleText')));
  function paintPreview() {
    const cs = getComputedStyle(document.documentElement);
    preview.querySelector('.pv-h').style.fontFamily = cs.getPropertyValue('--font-head');
    Object.assign(preview.querySelector('.pv-t').style, { fontFamily: cs.getPropertyValue('--font-text'), fontSize: settings.fontSize + 'px', lineHeight: settings.lineHeight });
  }
  const themeGrid = el('div', { class: 'th-grid set-free' });
  const paintThemes = () => {
    themeGrid.innerHTML = '';
    const tile = (th, sw2) => themeGrid.append(el('button', { class: 'th' + (settings.theme === th.id ? ' on' : ''), onclick: () => { updateSettings({ theme: th.id }); paintThemes(); } },
      el('span', { class: 'tp', style: sw2 ? `background:${sw2[0]};color:${sw2[1]}` : null }, el('i', { style: 'width:60%;opacity:.75' }), el('i', { style: 'width:90%' }), el('i', { style: 'width:75%' })),
      el('span', { class: 'th-n' }, th.name)));
    for (const th of THEMES) tile(th, THEME_SWATCH[th.id]);
    const more = MORE_THEMES.find((x) => x.id === settings.theme) || MORE_THEMES.find((x) => x.id === settings.lastMoreTheme);
    if (more) {
      themeGrid.append(el('button', { class: 'th' + (settings.theme === more.id ? ' on' : ''), title: more.name, onclick: () => { updateSettings({ theme: more.id }); paintThemes(); } },
        el('span', { class: 'tp', style: `background:${more.bg};color:${more.text}` }, el('i', { style: 'width:60%;opacity:.75' }), el('i', { style: 'width:90%' }), el('i', { style: 'width:75%' })),
        el('span', { class: 'th-n', dir: 'ltr' }, more.name)));
    }
    for (const th of customThemes) tile(th, null);
    themeGrid.append(el('button', { class: 'th more', title: tr('settings.look.moreThemesTip', { n: fa(MORE_THEMES.length) }), onclick: () => openThemeGallery(paintThemes) },
      el('span', { class: 'tp' }, ['#bd93f9', '#e2b714', '#ff7a90'].map((c) => el('span', { class: 'sw', style: `background:${c}` }))),
      el('span', { class: 'th-n' }, tr('gallery.title'))));
  };
  paintThemes();
  // two groups: the official icons and the fun ones
  const logoGrid = el('div', { class: 'set-free logo-groups' });
  const paintLogos = () => {
    logoGrid.innerHTML = '';
    for (const [label, fun] of [[tr('logo.official'), false], [tr('logo.parallelWorld'), true]]) {
      const grid = el('div', { class: 'ic-grid' });
      for (const l of LOGOS.filter((x) => x.fun === fun)) {
        const on = settings.logo === l.id;
        grid.append(el('button', { class: 'logo-tile' + (on ? ' on' : ''), 'aria-label': l.name, 'aria-pressed': String(on), onclick: () => { updateSettings({ logo: l.id, logoChosen: true }); paintLogos(); } },
          el('img', { src: l.url, alt: '' }), on ? el('span', { class: 'bd', html: ICON.check }) : null));
      }
      if (grid.childNodes.length) logoGrid.append(el('div', { class: 'lbl' }, label), grid);
    }
  };
  paintLogos();
  const recentInfo = el('span', { class: 'row-mut' });
  const paintRecent = () => { recentInfo.textContent = settings.recent.length ? tr('settings.files.recentCount', { n: fa(settings.recent.length) }) : tr('settings.files.recentEmpty'); };
  paintRecent();
  const lockNow = () => !!(active() && active().locked);

  const SECTIONS = [
    { id: 'look', name: tr('settings.sec.look'), icon: ICON.palette, color: '#2F7BF6', body: () => [
      label(tr('settings.look.theme')), themeGrid,
      label(tr('settings.look.language')), group(
        row(tr('settings.look.uiLang'), tr('settings.look.uiLangHint'), seg(
          Object.entries(UI_LANGS).map(([id, info]) => [id, info.name]),
          () => settings.uiLang || 'fa',
          async (v) => {
            if (v === (settings.uiLang || 'fa')) return;
            settings.uiLang = v;
            await persistNow();
            if (tabs.some((tab) => tab.dirty) || !settings.restoreSession) toast(tr('settings.look.uiLangRestart'), 6000, null, 'info');
            else location.reload();
          },
        ))),
      label(tr('settings.look.window')), group(
        toggle('verticalTabs', tr('settings.look.verticalTabs'), tr('settings.look.verticalTabsHint')),
        toggle('sidebar', tr('sidebar.title'), null, 'Ctrl+Shift+L')),
    ] },
    { id: 'write', name: tr('settings.sec.write'), icon: ICON.edit, color: '#E8830C', body: () => [
      label(tr('settings.write.typing')), group(
        toggle('autoPair', tr('settings.write.autoPair'), tr('settings.write.autoPairHint')),
        toggle('pasteLink', tr('settings.write.pasteLink'), tr('settings.write.pasteLinkHint')),
        toggle('plainAfterPaste', tr('settings.write.plainAfterPaste'), tr('settings.write.plainAfterPasteHint')),
        row(tr('settings.write.defaultDir'), tr('settings.write.defaultDirHint'), seg([['rtl', tr('dir.rtlShort')], ['auto', tr('dir.auto')], ['ltr', tr('dir.ltrShort')]], () => settings.dirMode || 'auto', (v) => updateSettings({ dirMode: v })))),
      label(tr('settings.write.tools')), group(
        toggle('spellcheck', tr('settings.write.spellcheckTag')),
        row(tr('safeMode.title'), tr('settings.write.safeModeHint'), el('span', { class: 'row-end' }, kbd('F8'),
          sw(lockNow, () => { const a = active(); if (a) setLocked(a, !a.locked, true); }, tr('safeMode.title'))))),
    ] },
    { id: 'ai', name: tr('settings.sec.ai'), icon: AI_SPARK, color: 'linear-gradient(135deg, #5B6CF0, #C04BD8 55%, #F0557A)', body: () => fedoraSettings({ row, group, label, sw, seg }) },
    { id: 'font', name: tr('settings.sec.font'), icon: ICON.textSize, color: '#8E5BD9', body: () => (defHints.length = 0, [
      group(
        row(tr('settings.font.text'), null, fontSel('textFont')),
        row(tr('settings.font.headings'), null, fontSel('headFont', { id: '', name: tr('font.sameAsText') })),
        row(tr('settings.font.ui'), null, fontSel('uiFont'))),
      el('div', { class: 'lbl lbl-act' }, el('span', {}, tr('settings.font.myDefaults')), resetFedo),
      group(
        defRow(tr('settings.font.textSize'), step(() => docDefaults().fontSize, setDef('fontSize', 1, 12, 32), (v) => fa(v)), 'fontSize', (v) => fa(v)),
        defRow(tr('settings.font.lineHeight'), step(() => docDefaults().lineHeight, setDef('lineHeight', 0.05, 1.2, 3), (v) => fa2(v)), 'lineHeight', (v) => fa2(v)),
        defRow(tr('settings.font.pageWidth'), seg(PAGE_WIDTHS.map(([v, k]) => [String(v), tr(k)]), () => docDefaults().pageWidth, (v) => setDefaults({ pageWidth: Number(v) })), 'pageWidth', (v) => { const w = PAGE_WIDTHS.find(([x]) => x === v); return w ? tr(w[1]) : fa(v); })),
      el('div', { class: 'lbl plain set-free' }, tr('settings.font.defaultsNote')),
      label(tr('settings.font.preview')), preview,
    ]) },
    { id: 'files', name: tr('settings.sec.files'), icon: ICON.save, color: '#2FA84F', body: () => [
      label(tr('common.save')), group(
        toggle('autosave', tr('settings.files.autosave'), tr('settings.files.autosaveHint')),
        row(tr('settings.files.defaultExt'), null, seg([['md', 'Markdown'], ['txt', tr('save.format.txt')]], () => settings.defaultExt || 'md', (v) => updateSettings({ defaultExt: v })))),
      label(tr('settings.files.startupHistory')), group(
        toggle('restoreSession', tr('settings.files.restoreSession')),
        row(tr('settings.files.autoSnapshot'), tr('settings.files.autoSnapshotHint'), step(() => settings.snapshotMinutes, clampSet('snapshotMinutes', 1, 1, 60), (v) => tr('settings.files.minutes', { n: fa(v) }))),
        row(tr('menu.file.recent'), null, el('span', { class: 'row-end' }, recentInfo,
          el('button', { class: 'set-select as-btn', onclick: () => { updateSettings({ recent: [] }); paintRecent(); toast(tr('toast.recentCleared'), 'ok'); } }, tr('settings.files.clearList'))))),
    ] },
    { id: 'keys', name: tr('settings.sec.keys'), icon: ICON.keyboard, color: '#6E6E78', body: () => [
      el('div', { class: 'keys-grid' }, KEY_LIST.map((col) => el('div', { class: 'grp' }, col.map(([l, k]) => el('div', { class: 'kr', 'data-s': tr(l) + ' ' + k }, el('span', {}, tr(l)), kbd(k)))))),
    ] },
    { id: 'ext', name: tr('settings.sec.ext'), icon: ICON.group, color: '#5B5BD6', body: () => [
      el('div', { class: 'lbl set-free plain' }, tr('settings.ext.note')),
      el('div', { class: 'grp' }, EXTENSIONS.map((x) => extRow(x, sw))),
    ] },
    { id: 'icon', name: tr('settings.sec.icon'), icon: ICON.image, color: '#E0457B', body: () => [
      el('div', { class: 'lbl set-free' }, tr('settings.icon.note')), logoGrid,
    ] },
    { id: 'update', name: tr('settings.sec.update'), icon: ICON.download, color: '#0E9F8E', body: () => {
      const card = el('div', { class: 'grp up-card set-free' });
      const paint = () => {
        const logo = (LOGOS.find((l) => l.id === settings.logo) || LOGOS[0] || {}).url;
        const [tone, line] = updateStatusLine();
        const acts = el('div', { class: 'up-acts' });
        const b = (label, run, primary) => acts.append(el('button', { class: 'hb' + (primary ? ' primary' : ''), onclick: run }, label));
        if (upd.status === 'available') { b(upd.manual ? tr('update.downloadPage') : tr('update.downloadInstall'), () => api.updateDownload(), true); b(tr('update.releaseNotes'), () => api.updateOpenPage('notes')); }
        else if (upd.status === 'downloaded') { b(tr('update.installRestart'), installUpdate, true); b(tr('update.releaseNotes'), () => api.updateOpenPage('notes')); }
        else if (upd.status === 'downloading') acts.append(el('span', { class: 'up-bar' }, el('i', { style: `width:${upd.percent || 0}%` })));
        else acts.append(el('button', { class: 'hb', disabled: upd.status === 'checking', onclick: () => api.updateCheck() }, upd.status === 'checking' ? tr('update.checking') : tr('update.checkAgain')));
        card.replaceChildren(
          logo ? el('img', { src: logo, alt: '' }) : null,
          el('div', { class: 'up-info' },
            el('b', {}, `Fedo ${faVer(upd.current || (appInfo && appInfo.version) || '')}`),
            el('span', { class: 'up-line ' + tone }, updReady() ? el('i', { class: 'dot' }) : null, line),
            upd.manual ? el('small', {}, tr('update.portableHint')) : null),
          acts);
      };
      paint();
      updListeners.add(paint);
      const auto = group(
        toggle('updateAuto', tr('update.autoCheck'), tr('update.autoCheckHint')),
        upd.manual ? null : toggle('updateDownload', tr('update.bgDownload'), tr('update.bgDownloadHint')),
        upd.manual ? null : toggle('updateInstallOnQuit', tr('update.installOnQuit'), tr('update.installOnQuitHint')));
      const link = (label, hint, text, which) => row(label, hint, el('button', { class: 'sv-link', onclick: () => api.updateOpenPage(which) }, text));
      return [card, label(tr('update.checkAndInstall')), auto, label('GitHub'), group(
        link(tr('update.allReleases'), null, tr('update.openInBrowser'), 'all'),
        link(tr('update.manualDownload'), tr('update.manualDownloadHint'), tr('update.downloadPage'), 'all')),
        el('p', { class: 'set-license set-free', dir: 'ltr' }, 'Licensed under ', el('b', {}, 'Doneshe'), ' technology.')];
    } },
  ];

  // --- shell ---
  const search = el('input', { type: 'text', placeholder: tr('settings.searchPlaceholder'), 'aria-label': tr('settings.searchPlaceholder'), spellcheck: 'false' });
  const nav = el('div', { class: 'set-nav' }, el('label', { class: 'set-search' }, el('span', { class: 'ic', html: ICON.search }), search));
  const content = el('div', { class: 'set-content' });
  const secEl = (sc) => el('section', { class: 'set-sec', 'data-title': sc.name }, el('h2', {}, sc.name), sc.body());
  const built = new Map(SECTIONS.map((sc) => [sc.id, secEl(sc)]));
  let current = SECTIONS.find((x) => x.id === section) ? section : 'look';
  const show = (id) => {
    current = id; search.value = '';
    nav.querySelectorAll('.nv').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    content.replaceChildren(built.get(id));
    for (const n of built.get(id).querySelectorAll('[data-sh]')) { n.hidden = false; delete n.dataset.sh; }
    content.scrollTop = 0;
    if (id === 'font') { paintPreview(); paintDefs(); }
  };
  for (const sc of SECTIONS) {
    nav.append(el('button', { class: 'nv', 'data-id': sc.id, title: sc.name, onclick: () => show(sc.id) },
      el('span', { class: 'sq', style: `background:${sc.color}`, html: sc.icon }), el('span', { class: 'nv-n' }, sc.name),
      sc.id === 'update' && updReady() ? el('span', { class: 'nv-dot', role: 'img', 'aria-label': tr('update.newReady') }) : null));
  }
  // search hides rows with a marker, so leaving the search restores only what it hid
  const hideS = (n, h) => { n.hidden = h; if (h) n.dataset.sh = '1'; else delete n.dataset.sh; };
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { show(current); return; }
    nav.querySelectorAll('.nv').forEach((b) => b.classList.remove('on'));
    let any = false;
    content.replaceChildren(...SECTIONS.map((sc) => {
      const node = built.get(sc.id);
      const whole = sc.name.toLowerCase().includes(q);
      let hit = whole;
      for (const r of node.querySelectorAll('[data-s]')) { const ok = whole || r.dataset.s.toLowerCase().includes(q); hideS(r, !ok); hit = hit || ok; }
      for (const g of node.querySelectorAll('.grp:not(.set-free)')) hideS(g, !g.querySelector('[data-s]:not([hidden])'));
      for (const f of node.querySelectorAll('.set-free')) hideS(f, !whole);
      for (const l of node.querySelectorAll('.lbl:not(.set-free)')) hideS(l, !l.nextElementSibling || l.nextElementSibling.hidden);
      hideS(node, !hit);
      any = any || hit;
      return node;
    }));
    if (!any) content.append(el('div', { class: 'set-none' }, tr('settings.noResults')));
    paintPreview();
  });
  const close = () => {
    ov.remove(); document.removeEventListener('keydown', onEsc, true); settingsOpen = null; updListeners.clear();
    for (const n of built.values()) { n.hidden = false; n.querySelectorAll('[data-sh]').forEach((x) => { x.hidden = false; delete x.dataset.sh; }); }
  };
  const onEsc = (e) => { if (e.key === 'Escape' && !document.querySelector('.menu, .fd-mpop')) { e.preventDefault(); e.stopPropagation(); close(); } };
  const box = el('div', { class: 'modal set-modal', dir: langDir(), role: 'dialog', 'aria-label': tr('settings.title') }, nav,
    el('div', { class: 'set-main' }, el('button', { class: 'set-close', title: tr('common.close'), html: ICON.x, onclick: close }), content));
  const ov = el('div', { class: 'overlay' }, box);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onEsc, true);
  document.body.append(ov);
  settingsOpen = show;
  show(current);
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
      { icon: ICON.plusSquare, label: tr('menu.file.newTab'), title: 'Ctrl+T', run: () => newTab() },
      { icon: ICON.folder, label: tr('common.open'), title: 'Ctrl+O', run: openDialog },
      { icon: ICON.save, label: tr('common.save'), title: 'Ctrl+S', run: () => save() },
      { icon: ICON.download, label: tr('menu.file.export'), title: tr('menu.file.exportTip'), run: () => save(active(), true) },
    ] },
    { icon: ICON.search, label: tr('menu.file.quickOpen'), key: 'Ctrl+P', run: openQuickOpen },
    { icon: ICON.folder, label: tr('menu.file.openFolder'), key: 'Ctrl+Shift+O', run: () => openFolder() },
    { icon: ICON.clock, label: tr('menu.file.recent'), disabled: !recent.length, sub: [
      ...recent.map((x) => ({ icon: ICON.file, label: basename(x.path), run: () => openPath(x.path) })),
      'sep',
      { icon: ICON.sidebar, label: tr('menu.file.showInSidebar'), run: () => updateSettings({ sidebar: true, sideView: 'recent' }) },
      { icon: ICON.trash, label: tr('settings.files.clearList'), run: () => updateSettings({ recent: [] }) },
    ] },
    { icon: ICON.save, label: tr('menu.file.saveAsDots'), key: 'Ctrl+Shift+S', run: () => save(active(), true) },
    { icon: ICON.copy, label: tr('common.saveAll'), key: 'Ctrl+Alt+S', run: saveAll },
    { icon: ICON.window, label: tr('menu.file.newWindow'), key: 'Ctrl+N', run: () => api.newWindow() },
    'sep',
    { icon: ICON.sidebar, label: tr('sidebar.title'), key: 'Ctrl+Shift+L', switch: () => settings.sidebar && !sidebarAutoHidden, run: toggleSidebar },
    vtabsSwitch(),
    { icon: ICON.code, label: tr('status.sourceCode'), key: 'Ctrl+/', switch: () => !!(active() && active().mode === 'source'), run: toggleSource },
    { icon: ICON.lock, label: tr('safeMode.title'), key: 'F8', switch: () => !!(active() && active().locked), run: () => { const a = active(); if (a) setLocked(a, !a.locked); } },
    { icon: ICON.tickSquare, label: tr('menu.view.spellcheck'), switch: () => !!settings.spellcheck, run: () => toggleSetting('spellcheck') },
    { icon: ICON.pin, label: tr('menu.view.alwaysOnTop'), switch: () => onTop(), run: () => setWindowOnTop(!onTop()) },
    { icon: ICON.zoom, label: tr('status.zoom'), stepper: { value: () => tr('status.percent', { n: fa(Math.round((settings.zoom || 1) * 100)) }), up: () => zoomBy(1), down: () => zoomBy(-1) } },
    'sep',
    { icon: ICON.palette, label: tr('settings.sec.look'), sub: [
      { header: tr('settings.look.theme') },
      ...THEMES.map((th) => ({ label: th.name, checked: settings.theme === th.id, run: () => updateSettings({ theme: th.id }) })),
      ...customThemes.map((th) => ({ label: th.name, checked: settings.theme === th.id, run: () => updateSettings({ theme: th.id }) })),
      ...MORE_THEMES.filter((th) => th.id === settings.theme).map((th) => ({ label: th.name, checked: true, run: () => {} })),
      'sep',
      { label: tr('menu.look.moreThemes'), run: () => openThemeGallery() },
      'sep',
      { label: tr('settings.font.text'), sub: [...fontItems('textFont'), ...fontNow('textFont')] },
      { label: tr('settings.font.headings'), sub: [{ label: tr('font.sameAsText'), checked: !settings.headFont, run: () => updateSettings({ headFont: '' }) }, ...fontItems('headFont').slice(1), ...fontNow('headFont')] },
      { label: tr('settings.font.ui'), sub: [...fontItems('uiFont'), ...fontNow('uiFont')] },
      'sep',
      { label: tr('menu.look.windowsFonts'), run: () => openSettings('font') },
      { label: tr('menu.look.appIcon'), run: () => openSettings('icon') },
      { label: tr('menu.look.openThemesFolder'), run: () => api.openThemesFolder() },
    ] },
    { icon: ICON.settings, label: tr('settings.title'), key: 'Ctrl+,', run: () => openSettings() },
    { icon: ICON.keyboard, label: tr('menu.shortcuts'), run: showShortcuts },
    { icon: ICON.download, label: tr('settings.sec.update'), badge: updReady() ? tr('update.versionReadyBadge', { v: faVer(upd.version) }) : null, run: () => openSettings('update') },
  ], langDir() === 'rtl' ? r.right : r.left, r.bottom + 8, () => anchor.classList.remove('open'));
}

const showShortcuts = () => openSettings('keys');

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
// the replace row is part of the bar; it only hides while the file is in safe mode (read-only)
function toggleReplaceRow() {
  const t = active();
  $('#replace-row').style.display = t && t.locked ? 'none' : '';
}
function toggleFindOpt(k) {
  findOpts[k] = !findOpts[k];
  for (const [id, on] of [['#find-case', findOpts.matchCase], ['#find-word', findOpts.wholeWord]]) { $(id).classList.toggle('on', on); $(id).setAttribute('aria-pressed', String(on)); }
  runFind();
}
function openFind(withReplace) {
  const t = active();
  const bar = $('#findbar');
  const wasOpen = !bar.hidden;
  bar.hidden = false;
  $('#btn-find').classList.add('open');
  toggleReplaceRow();
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
  $('#btn-find').classList.remove('open');
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
  box.textContent = count ? tr('find.countOf', { cur: fa(current + 1), total: fa(count), cap: capped ? '+' : '' }) : tr('editor.code.noResult');
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
  if (!n) { toast(tr('find.nothingFound')); return; }
  const r = $('#find-r').value;
  const ok = await modal({
    title: tr('find.foundN', { n: fa(n) }),
    text: r ? tr('find.replaceAllConfirm', { q, r }) : tr('find.deleteAllConfirm', { q }),
    buttons: [{ label: tr('common.cancel'), value: false }, { label: r ? tr('find.replaceAllBtn') : tr('find.deleteAllBtn'), value: true, primary: true }],
  });
  if (!ok) return;
  const done = e.replaceAll(r);
  updateFindCount();
  toast(tr('find.replacedToast', { n: fa(done) }));
}
// each ready-made action shows how many places it would touch, before anything is applied
function presetCount(t, p) {
  try {
    if (p.find) { const re = buildRegex({ text: p.find }); return re ? (t.md.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length : 0; }
    if (t.mode === 'source') return null;
    return pmCollectEdits(getView(t.crepe), p.rule).length;
  } catch { return null; }
}
function openPresetMenu(anchor) {
  const t = active();
  if (!t) return;
  const r = anchor.getBoundingClientRect();
  anchor.classList.add('on'); anchor.setAttribute('aria-expanded', 'true');
  showMenu([
    { header: tr('find.presetsHeader') },
    ...PRESETS.map((p) => {
      const n = presetCount(t, p);
      return { label: p.label, count: n == null ? null : n ? tr('find.nItems', { n: fa(n) }) : tr('find.notInText'), disabled: n === 0, run: () => runPreset(p) };
    }),
    { note: tr('find.presetsNote') },
  ], langDir() === 'rtl' ? r.right : r.left, r.bottom + 6, () => { anchor.classList.remove('on'); anchor.setAttribute('aria-expanded', 'false'); });
}
async function runPreset(p) {
  const t = active();
  if (!t) return;
  if (p.find) {
    $('#find-q').value = p.find;
    runFind();
    const n = engineFor(t).info().count;
    toast(n ? tr('find.foundNamed', { n: fa(n), name: p.name || p.find }) : tr('find.notFoundNamed', { name: p.name || p.find }));
    return;
  }
  if (guardLocked()) return;
  if (t.mode === 'source') { setMode(t, 'wysiwyg'); toast(tr('find.switchedToLive')); }
  const v = getView(t.crepe);
  const edits = pmCollectEdits(v, p.rule);
  if (!edits.length) { toast(tr('find.presetNone')); return; }
  const ok = await modal({
    title: tr('find.foundN', { n: fa(edits.length) }),
    text: tr('find.presetConfirm', { label: p.label, sample: p.sample }),
    buttons: [{ label: tr('common.cancel'), value: false }, { label: tr('find.applyAll'), value: true, primary: true }],
  });
  if (!ok) return;
  pmApplyEdits(v, edits);
  runFind();
  toast(tr('find.fixedToast', { n: fa(edits.length) }));
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
      ...[['continuous', tr('pdf.continuous'), tr('pdf.continuousDesc')], ['pages', tr('pdf.pages'), tr('pdf.pagesTip')]].map(([v, title, sub]) =>
        el('label', { class: 'pdf-opt' }, el('input', { type: 'radio', name: 'pdf-layout', value: v, checked: (settings.pdfLayout || 'continuous') === v }),
          el('span', {}, el('b', {}, title), el('small', {}, sub)))));
    const ok = await modal({ title: tr('pdf.exportTitle'), body: pick, buttons: [{ label: tr('common.cancel'), value: false }, { label: tr('pdf.createBtn'), value: true, primary: true }] });
    if (!ok) return;
    layout = pick.querySelector('input:checked').value;
    updateSettings({ pdfLayout: layout });
  }
  if (t.mode === 'source') setMode(t, 'wysiwyg');
  const name = (t.path ? basename(t.path) : suggestedName(t)).replace(/\.[^.]+$/, '');
  try {
    const out = await exportDocument({ kind, layout, html: getEditorHTML(t.crepe), title: name, baseDir: tabDir(t), align: tabAlign(t), docPath: t.path });
    if (out) toast(tr('toast.exportedName', { name: basename(out) }), 8000, [
      { label: tr('file.openFile'), run: () => api.openExternal(out) },
      { label: tr('file.showInFolder'), run: () => api.reveal(out) },
    ]);
  } catch (e) {
    toast(tr('toast.exportFailed', { err: e.message || e }));
  }
}

// ======================================================================
// zoom, text size, quick open
// ======================================================================
const fa2 = (v) => new Intl.NumberFormat(langLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
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
  const node = el('div', { class: 'size-panel', dir: langDir() });
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
      el('button', { class: 'sp-btn', title: tr('common.more'), html: ICON.plus, onclick: () => { change(1); show(); } }), val,
      el('button', { class: 'sp-btn', title: tr('common.less'), html: ICON.minus, onclick: () => { change(-1); show(); } })));
};
const resetButton = (run, text) => el('button', { class: 'btn sp-reset', onclick: run, html: `${RESET_ICON}<span>${text || tr('common.resetDefault')}</span>` });

function openSizePanel(anchor) {
  openPopover('size', anchor, (node) => {
    const num = (key, step, min, max) => (d) => updateSettings({ [key]: Math.round(Math.min(max, Math.max(min, settings[key] + d * step)) * 100) / 100 });
    node.append(
      stepper(tr('settings.font.textSize'), () => settings.fontSize, num('fontSize', 1, 12, 32), (v) => fa(v)),
      stepper(tr('settings.font.lineHeight'), () => settings.lineHeight, num('lineHeight', 0.05, 1.2, 3), (v) => fa2(v)),
      stepper(tr('settings.font.pageWidth'), () => settings.pageWidth, num('pageWidth', 40, 560, 1600), (v) => fa(v)),
      el('div', { class: 'sp-foot' },
        el('button', { class: 'btn sp-reset', title: tr('popover.saveAsDefaultTip'), onclick: () => {
          updateSettings({ userDefaults: Object.fromEntries(DOC_KEYS.map((k) => [k, settings[k]])) });
          closePopover(); toast(tr('toast.defaultSaved'), 'ok');
        } }, tr('popover.saveAsDefault')),
        resetButton(() => { updateSettings(docDefaults()); closePopover(); }, settings.userDefaults ? tr('popover.resetToMine') : null)));
  });
}
function openZoomPanel(anchor) {
  openPopover('zoom', anchor, (node) => {
    const presets = el('div', { class: 'zoom-presets' }, [0.75, 1, 1.25, 1.5, 2].map((z) =>
      el('button', { class: 'zp' + (Math.abs((settings.zoom || 1) - z) < 0.001 ? ' on' : ''), onclick: () => { setZoom(z); closePopover(); } }, tr('status.percent', { n: fa(z * 100) }))));
    node.append(
      stepper(tr('status.zoom'), () => settings.zoom || 1, (d) => zoomBy(d), (v) => tr('status.percent', { n: fa(Math.round(v * 100)) })),
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
/** file name with the letters that matched the query emphasised */
function markMatch(name, q) {
  const out = el('span', { class: 'qn', dir: bidi(name) });
  if (!q) { out.textContent = name; return out; }
  const low = name.toLowerCase();
  const at = low.indexOf(q);
  if (at >= 0) { out.append(name.slice(0, at), el('b', {}, name.slice(at, at + q.length)), name.slice(at + q.length)); return out; }
  let ti = 0;
  for (const ch of q) {
    const k = low.indexOf(ch, ti);
    if (k < 0) break;
    out.append(name.slice(ti, k), el('b', {}, name[k]));
    ti = k + 1;
  }
  out.append(name.slice(ti));
  return out;
}
async function openQuickOpen() {
  if (document.querySelector('.qo-overlay')) return;
  const items = new Map();
  const add = (p, group, extra = {}) => { if (p && !items.has(posKey(p))) items.set(posKey(p), { path: p, group, ...extra }); };
  tabs.forEach((t) => add(t.path, 0, { tabId: t.id }));
  settings.recent.forEach((r) => add(r.path, 1));
  if (settings.folder) {
    if (!treeCache) treeCache = await api.tree(settings.folder);
    const walk = (nodes) => nodes.forEach((n) => (n.type === 'dir' ? walk(n.children) : add(n.path, 2)));
    walk(treeCache);
  }
  const GROUPS = [tr('qo.openTabs'), tr('menu.file.recent'), tr('qo.inOpenFolder')];
  const all = [...items.values()];
  let sel = 0, shown = [];
  const input = el('input', { type: 'text', placeholder: tr('qo.placeholder'), 'aria-label': tr('save.fileName'), dir: 'auto', spellcheck: 'false' });
  const list = el('div', { class: 'qo-list' });
  const total = el('span', {});
  const hint = (keys, text) => el('span', { class: 'qo-hint' }, el('span', { class: 'kb', dir: 'ltr' }, keys.map((k) => el('kbd', {}, k))), text);
  const ov = el('div', { class: 'overlay qo-overlay' }, el('div', { class: 'qo', dir: langDir(), role: 'dialog', 'aria-label': tr('menu.file.quickOpen') },
    el('label', { class: 'qo-head' }, el('span', { class: 'ic', html: ICON.search }), input, kbd('Esc')),
    list,
    el('div', { class: 'qo-foot' }, hint(['↑', '↓'], tr('qo.move')), hint(['Enter'], tr('common.open')), el('span', { class: 'grow' }), total)));
  // Escape closes it even if the focus has slipped back to the editor
  const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const close = () => { ov.remove(); document.removeEventListener('keydown', onEsc, true); const t = active(); if (t) focusEditor(t); };
  const pick = (i) => { const it = shown[i]; close(); if (!it) return; if (it.tabId && tabs.some((t) => t.id === it.tabId)) activateTab(it.tabId); else openPath(it.path); };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = all.map((it) => ({ ...it, s: fuzzyScore(q, basename(it.path)) || fuzzyScore(q, it.path) * 0.5 }))
      .filter((it) => it.s > 0).sort((a, b) => a.group - b.group || (q ? b.s - a.s : 0)).slice(0, 50);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    total.textContent = shown.length ? tr('emoji.results', { count: fa(shown.length) }) : '';
    if (!shown.length) list.append(el('div', { class: 'qo-empty' }, all.length ? tr('qo.notFound') : tr('qo.empty')));
    let group = -1;
    shown.forEach((it, i) => {
      if (it.group !== group) { group = it.group; list.append(el('div', { class: 'qo-hd' }, GROUPS[group])); }
      const row = el('div', { class: 'qo-item' + (i === sel ? ' sel' : ''), role: 'option', 'aria-selected': String(i === sel) },
        el('span', { class: 'ic', html: ICON.file }),
        el('span', { class: 'nm' }, markMatch(basename(it.path), q), el('small', {}, dirname(it.path))),
        it.tabId ? el('span', { class: 'qo-kind' }, tr('qo.goToTab')) : null);
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
  });
  input.addEventListener('blur', () => setTimeout(() => { if (ov.isConnected) input.focus(); }, 0));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onEsc, true);
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
  if (!silent) toast(t.locked ? tr('safeMode.turnedOnToast') : tr('safeMode.turnedOffToast'));
  if (!t.locked && t.id === activeId) focusEditor(t);
}
let lockToastAt = 0;
function showLockedToast() {
  if (Date.now() - lockToastAt < 1800) return;
  lockToastAt = Date.now();
  toast(tr('safeMode.blockedToast'), 4000, { label: tr('safeMode.turnOff'), run: () => { const t = active(); if (t) setLocked(t, false); } });
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

/** all the extra themes: search, light / dark, and a preview of each in its own colours; a click applies it */
const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.8l2.5 5.1l5.6.8l-4 3.9l1 5.6L12 16.6l-5.1 2.6l1-5.6l-4-3.9l5.6-.8z"/></svg>';
// background colour groups, in kinship order: neutrals light to dark, then warm, then cool.
// Each has four stripes (dark to light) for its tile; white, grey and black are one flat colour.
const BG_FAMILIES = [
  ['white', 'color.white', ['#FFFFFF']], ['silver', 'color.silver', ['radial-gradient(circle at 35% 30%,#FAFAFA,#C9C9CC 70%,#B5B5B9)']], ['gray', 'color.gray', ['#A3A3A8']], ['black', 'color.black', ['#000000']],
  ['brown', 'color.brown', ['#5E4438', '#86716A', '#B3A6A0', '#D9D2CE']], ['red', 'color.red', ['#D2333A', '#E06A6F', '#ECA2A5', '#F6D2D3']],
  ['orange', 'color.orange', ['#F5800B', '#F8A04A', '#FBC28A', '#FDE0C3']], ['yellow', 'color.yellow', ['#F6BE2C', '#F9CF5E', '#FBDF94', '#FDEFC8']],
  ['green', 'color.green', ['#5B9A3B', '#7FB25F', '#A9CC90', '#D4E6C7']], ['blue', 'color.blue', ['#1F6FD1', '#4E92E3', '#8DB9EE', '#C9DEF7']],
  ['purple', 'color.purple', ['#7B2BA8', '#9E5CC4', '#C39BDC', '#E3CDEF']], ['pink', 'color.pink', ['#C71F5E', '#D85C8A', '#E79DB8', '#F4CEDC']],
];
/** background colour group, background lightness and text contrast of each gallery theme, worked out once */
let themeMeta = null;
function THEME_META() {
  if (themeMeta) return themeMeta;
  const rgb = (h) => { const n = parseInt(String(h).slice(1, 7), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = (h) => { const c = rgb(h).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const group = (h) => {
    const c = rgb(h), mx = Math.max(...c), mn = Math.min(...c), d = mx - mn, l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let H = 0;
    if (d) { H = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; H *= 60; if (H < 0) H += 360; }
    if (d < 0.045) return { fam: l > 0.9 ? 'white' : l > 0.7 ? 'silver' : l > 0.2 ? 'gray' : 'black', hue: 0 };
    if (H >= 10 && H < 50 && ((l < 0.5 && s < 0.65) || l < 0.3)) return { fam: 'brown', hue: H };
    return { fam: H < 15 || H >= 345 ? 'red' : H < 40 ? 'orange' : H < 65 ? 'yellow' : H < 178 ? 'green' : H < 250 ? 'blue' : H < 290 ? 'purple' : 'pink', hue: H };
  };
  themeMeta = new Map();
  for (const t of MORE_THEMES) {
    const a = lum(t.bg), b = lum(t.text), g = group(t.bg);
    themeMeta.set(t.id, { fam: g.fam, hue: g.hue, L: a, cr: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
  }
  return themeMeta;
}
/** «تم‌های بیشتر»: filters in a side panel, the themes beside it */
function openThemeGallery(onChange) {
  // filters and order start fresh every time the gallery opens; a picked colour lists light to dark
  const st = { mode: 'all', hue: 'all', hc: false, fav: false, sort: null };
  const favs = new Set(settings.themeFavs || []);
  const sortOf = () => st.sort || (st.hue !== 'all' ? 'light' : 'name');
  const SORTS = [['name', tr('gallery.sort.name')], ['light', tr('gallery.sort.light')], ['dark', tr('gallery.sort.dark')], ['color', tr('gallery.sort.color')], ['recent', tr('gallery.sort.recent')]];
  const meta = THEME_META();
  const q = el('input', { type: 'text', placeholder: tr('gallery.searchPlaceholder'), 'aria-label': tr('gallery.searchPlaceholder'), spellcheck: 'false', dir: 'auto' });
  const modeSeg = el('div', { class: 'tg-seg', role: 'radiogroup', 'aria-label': tr('gallery.modeLabel') });
  const allBtn = el('button', { class: 'tg-all', type: 'button' });
  const tiles = el('div', { class: 'tg-tiles', role: 'radiogroup', 'aria-label': tr('gallery.bgColor') });
  const feats = el('div', { class: 'tg-feats' });
  const clear = el('button', { class: 'tg-clear', type: 'button' }, tr('gallery.clearFilters'));
  const count = el('span', { class: 'tg-count' });
  const sortBtn = el('button', { class: 'tg-sort', type: 'button', 'aria-haspopup': 'menu' });
  const grid = el('div', { class: 'tg-grid' });
  const filtered = () => st.mode !== 'all' || st.hue !== 'all' || st.hc || st.fav;
  const pass = (t, skipHue, nq) => (st.mode === 'all' || (st.mode === 'dark') === t.dark) && (skipHue || st.hue === 'all' || meta.get(t.id).fam === st.hue)
    && (!st.hc || meta.get(t.id).cr >= 7) && (!st.fav || favs.has(t.id)) && (!nq || t.name.toLowerCase().includes(nq));
  const stripes = (list) => el('span', { class: 'cin' }, list.map((c) => el('i', { style: `background:${c}` })));
  const refresh = () => { paintSide(); paint(); };
  const paintSide = () => {
    const nq = q.value.trim().toLowerCase();
    modeSeg.innerHTML = '';
    for (const [k, label] of [['all', tr('gallery.modeAll')], ['light', tr('theme.light')], ['dark', tr('theme.dark')]]) {
      modeSeg.append(el('button', { class: st.mode === k ? 'on' : '', role: 'radio', 'aria-checked': String(st.mode === k), onclick: () => { st.mode = k; refresh(); } }, label));
    }
    const inAll = MORE_THEMES.filter((t) => pass(t, true, nq));
    allBtn.className = 'tg-all' + (st.hue === 'all' ? ' on' : '');
    allBtn.setAttribute('aria-pressed', String(st.hue === 'all'));
    allBtn.innerHTML = '';
    allBtn.append(stripes(['#e5484d', '#f2d33f', '#3fb26b', '#3e7bfa']), el('span', { class: 'grow' }, tr('gallery.allColors')), el('span', { class: 'n' }, fa(inAll.length)));
    tiles.innerHTML = '';
    for (const [k, nameKey, cols] of BG_FAMILIES) {
      const name = tr(nameKey);
      const n = inAll.filter((t) => meta.get(t.id).fam === k).length;
      tiles.append(el('button', { class: 'tg-tile' + (st.hue === k ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(st.hue === k), 'aria-label': tr('gallery.colorCountAria', { name, n: fa(n) }), title: name,
        onclick: () => { st.hue = k; st.sort = null; refresh(); } },
        el('span', { class: 'cbox' }, stripes(cols)), el('span', { class: 'cn' }, name), el('span', { class: 'n' }, fa(n))));
    }
    feats.innerHTML = '';
    const feat = (key, label, icon) => feats.append(el('button', { class: 'tg-feat', type: 'button', role: 'checkbox', 'aria-checked': String(!!st[key]),
      onclick: () => { st[key] = !st[key]; refresh(); } }, el('span', { class: 'cb' + (st[key] ? ' on' : '') }), el('span', { class: 'ic', html: icon }), el('span', { class: 'grow' }, label)));
    feat('hc', tr('gallery.highContrast'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>');
    feat('fav', tr('gallery.favoritesOnly'), STAR);
    clear.hidden = !filtered();
    sortBtn.innerHTML = '';
    sortBtn.append(el('span', { class: 'ic', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 5v14M4 16l3 3l3-3M14 7h6M14 12h4M14 17h2"/></svg>' }),
      el('span', { class: 'k' }, tr('gallery.sortBy')), el('span', {}, SORTS.find((x) => x[0] === sortOf())[1]), el('span', { class: 'ic chev', html: ICON.chevDown }));
  };
  allBtn.addEventListener('click', () => { st.hue = 'all'; st.sort = null; refresh(); });
  sortBtn.addEventListener('click', () => {
    const r = sortBtn.getBoundingClientRect();
    const m = showMenu(SORTS.map(([k, label]) => ({ label, checked: sortOf() === k, run: () => { st.sort = k; refresh(); } })), r.left, r.bottom + 6);
    m.style.zIndex = '2100'; // above the gallery's overlay
    m.style.minWidth = Math.max(200, r.width) + 'px';
    m.style.left = r.left + 'px'; m.style.right = 'auto'; m.style.top = r.bottom + 6 + 'px';
  });
  clear.addEventListener('click', () => { Object.assign(st, { mode: 'all', hue: 'all', hc: false, fav: false, sort: null }); q.value = ''; refresh(); });
  const paint = () => {
    const nq = q.value.trim().toLowerCase();
    const sort = sortOf();
    const recent = settings.themeRecent || [];
    const m = (t) => meta.get(t.id);
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      light: (a, b) => m(b).L - m(a).L,
      dark: (a, b) => m(a).L - m(b).L,
      color: (a, b) => BG_FAMILIES.findIndex((f) => f[0] === m(a).fam) - BG_FAMILIES.findIndex((f) => f[0] === m(b).fam) || m(b).L - m(a).L,
      recent: (a, b) => { const i = recent.indexOf(a.id), j = recent.indexOf(b.id); return (i < 0 ? 1e3 : i) - (j < 0 ? 1e3 : j) || a.name.localeCompare(b.name); },
    }[sort];
    const list = MORE_THEMES.filter((t) => pass(t, false, nq)).sort(by);
    count.textContent = filtered() || nq ? tr('gallery.countOf', { n: fa(list.length), total: fa(MORE_THEMES.length) }) : tr('gallery.count', { n: fa(list.length) });
    grid.innerHTML = '';
    if (!list.length) { grid.append(el('div', { class: 'tg-empty' }, tr('gallery.empty'))); return; }
    for (const t of list) {
      const on = settings.theme === t.id, fav = favs.has(t.id);
      const star = el('button', { class: 'tg-star' + (fav ? ' on' : ''), type: 'button', 'aria-pressed': String(fav), 'aria-label': fav ? tr('gallery.unfav') : tr('gallery.fav'), title: fav ? tr('gallery.unfav') : tr('gallery.fav'), html: STAR });
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        if (favs.has(t.id)) favs.delete(t.id); else favs.add(t.id);
        updateSettings({ themeFavs: [...favs] });
        paintSide(); paint();
      });
      grid.append(el('div', { class: 'tg-card' + (on ? ' on' : '') },
        el('button', { class: 'tg-pv', type: 'button', style: `background:${t.bg}`, title: t.name, 'aria-label': t.name, 'aria-pressed': String(on),
          onclick: () => { updateSettings({ theme: t.id, lastMoreTheme: t.id, themeRecent: [t.id, ...(settings.themeRecent || []).filter((x) => x !== t.id)].slice(0, 20) }); paint(); onChange && onChange(); } },
          el('i', { style: `width:55%;background:${t.text}` }), el('i', { style: `width:85%;background:${t.sub}` }), el('b', { style: `background:${t.main}` })),
        star,
        el('span', { class: 'tg-n', dir: 'ltr' }, t.name)));
    }
  };
  q.addEventListener('input', () => { paintSide(); paint(); });
  paintSide(); paint();
  // Escape: the sort menu first, then the gallery; Settings underneath stays open either way
  const close = () => { ov.remove(); window.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (document.querySelector('.menu')) closeMenu(); else close();
  };
  const lbl = (t) => el('span', { class: 'tg-lbl' }, t);
  const side = el('aside', { class: 'tg-side' },
    el('label', { class: 'tg-search' }, el('span', { class: 'ic', html: ICON.search }), q),
    el('div', { class: 'tg-sec' }, lbl(tr('gallery.mode')), modeSeg),
    el('div', { class: 'tg-sec' }, lbl(tr('gallery.bgColor')), allBtn, tiles),
    el('div', { class: 'tg-sec' }, lbl(tr('gallery.features')), feats),
    clear);
  const main = el('div', { class: 'tg-main' }, el('div', { class: 'tg-top' }, count, el('span', { class: 'grow' }), sortBtn), grid);
  const box = el('div', { class: 'modal theme-gallery', dir: langDir(), role: 'dialog', 'aria-label': tr('gallery.title') },
    el('div', { class: 'tg-head' }, el('h3', {}, tr('gallery.title')), el('span', { class: 'grow' }), el('button', { class: 'tg-x', title: tr('common.close'), 'aria-label': tr('common.close'), html: ICON.x, onclick: close })),
    el('div', { class: 'tg-body' }, side, main));
  const ov = el('div', { class: 'overlay' }, box);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  window.addEventListener('keydown', onKey, true);
  document.body.append(ov);
  q.focus();
  const cur = grid.querySelector('.tg-card.on');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

function openLogoPicker(firstRun = false) {
  const grid = el('div', { class: 'logo-grid' });
  const pick = (id) => {
    grid.querySelectorAll('.logo-opt').forEach((n) => n.classList.toggle('on', n.dataset.id === id));
    updateSettings({ logo: id });
  };
  for (const fun of [false, true]) {
    if (fun) grid.append(el('div', { class: 'logo-sep' }, tr('logo.parallelWorld')));
    for (const l of LOGOS.filter((x) => x.fun === fun)) {
      const b = el('button', { class: 'logo-opt' + (settings.logo === l.id ? ' on' : ''), 'data-id': l.id, 'aria-label': l.name }, el('img', { src: l.url, alt: '' }));
      b.addEventListener('click', () => pick(l.id));
      grid.append(b);
    }
  }
  modal({
    title: firstRun ? tr('logo.firstRunTitle') : tr('settings.sec.icon'),
    text: firstRun ? tr('logo.firstRunText') : tr('logo.pickerText'),
    body: grid,
    buttons: [{ label: firstRun ? tr('logo.start') : tr('common.close'), value: true, primary: true }],
  }).then(() => { if (!settings.logoChosen || !settings.memeLogosOffered) updateSettings({ logoChosen: true, memeLogosOffered: true }); });
}
/**
 * Once, for people who had Fedo before the fun icons arrived (version 2.7): offer them. A new install
 * sees every icon in its first-run picker instead, and later versions never show this again.
 */
function openMemeLogos() {
  let chosen = null;
  const current = LOGOS.find((l) => l.id === settings.logo) || LOGOS.find((l) => l.id === '08');
  const grid = el('div', { class: 'meme-grid' });
  const useBtn = el('button', { class: 'btn primary', disabled: true }, tr('logo.useThis'));
  for (const l of LOGOS.filter((x) => x.fun)) {
    const b = el('button', { class: 'meme-opt', 'aria-label': l.name, 'aria-pressed': 'false' }, el('img', { src: l.url, alt: '' }), el('span', { class: 'bd', html: ICON.check }));
    b.addEventListener('click', () => {
      chosen = l.id;
      grid.querySelectorAll('.meme-opt').forEach((n) => { const on = n === b; n.classList.toggle('on', on); n.setAttribute('aria-pressed', String(on)); });
      useBtn.disabled = false;
    });
    grid.append(b);
  }
  const close = (apply) => {
    ov.remove();
    document.removeEventListener('keydown', onKey, true);
    updateSettings(apply && chosen ? { logo: chosen, memeLogosOffered: true } : { memeLogosOffered: true });
    if (apply && chosen) toast(tr('logo.changedToast'), 'ok');
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
  useBtn.addEventListener('click', () => close(true));
  const box = el('div', { class: 'modal meme-modal', dir: langDir(), role: 'dialog', 'aria-label': tr('logo.funTitle') },
    el('div', { class: 'mm-body' },
      el('div', { class: 'mm-head' },
        el('div', { class: 'mm-t' }, el('h3', {}, tr('logo.funHeading')), el('p', {}, tr('logo.funSub'))),
        current ? el('div', { class: 'mm-cur' }, el('img', { src: current.url, alt: tr('logo.current') }), el('span', {}, tr('logo.current'))) : null),
      grid),
    el('div', { class: 'mm-foot' },
      el('span', { class: 'mm-hint' }, tr('logo.funHint')),
      el('button', { class: 'btn', onclick: () => close(false) }, tr('logo.keepCurrent')),
      useBtn));
  const ov = el('div', { class: 'overlay' }, box);
  document.addEventListener('keydown', onKey, true);
  document.body.append(ov);
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
  e.clipboardData.setData('text/html', htmlForClipboard(getEditorHTML(t.crepe)));
  toast(tr('toast.allTextCopied'), 'ok');
}, true);
/**
 * Markdown keeps an empty line typed with Enter as «<br />». That is right inside a .md file, but
 * pasted into Telegram or any chat it shows up as literal text: the copied plain text gets real line breaks.
 */
export function plainForClipboard(md) {
  // code blocks are copied exactly; everything else loses Markdown's escapes
  return String(md).split(/(^```[^\n]*\n[\s\S]*?^```[ \t]*$)/m).map((part, i) => (i % 2 ? part : plainText(part))).join('');
}
function plainText(md) {
  const BR = /^[ \t]*<br\s*\/?>[ \t]*$/i;
  const parts = md.split(/(\n{2,})/); // blocks, with the blank lines between them kept as they are
  let out = '';
  let sep = '';
  let extra = 0; // empty paragraphs between two blocks: one more blank line each
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) { sep = parts[i]; continue; }
    const block = parts[i];
    if (BR.test(block) || /^[ \t]*\\[ \t]*$/.test(block)) { extra++; continue; }
    if (out) out += sep + '\n'.repeat(extra);
    extra = 0;
    out += block
      .replace(/[ \t]*<br\s*\/?>[ \t]*/gi, '\n')
      // a line break inside a paragraph is written «\» at the end of the line (or alone on a line)
      .replace(/(^|[^\\])\\[ \t]*$/gm, '$1')
      // escaped punctuation: «\*» → «*», «\\» → «\»
      .replace(/\\([\\`*_{}\[\]()#+\-.!|<>~"'=:;,?@$%&^/])/g, '$1');
  }
  return out;
}
/**
 * An empty paragraph (an extra Enter) is copied as «<p></p>», which Telegram and many other apps drop:
 * give it a line break so the blank line survives the paste.
 */
export function htmlForClipboard(html) {
  return String(html).replace(/<p(\s[^>]*)?>\s*<\/p>/gi, (_m, attrs) => `<p${attrs || ''}><br></p>`);
}
for (const ev of ['copy', 'cut']) {
  document.addEventListener(ev, (e) => {
    if (!e.clipboardData || !e.target || !e.target.closest || !e.target.closest('.milkdown')) return;
    if (e.target.closest('.cm-editor')) return; // code blocks copy their own text as it is
    const text = e.clipboardData.getData('text/plain');
    const html = e.clipboardData.getData('text/html');
    // «<br />» for an empty line, «\» for a Shift+Enter line break and Markdown escapes: never paste them as text
    if (text && /<br\s*\/?>|\\/i.test(text)) e.clipboardData.setData('text/plain', plainForClipboard(text));
    if (html && /<p(\s[^>]*)?>\s*<\/p>/i.test(html)) e.clipboardData.setData('text/html', htmlForClipboard(html));
  });
}
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
/**
 * Every window keeps its own part of the session (the main process adds its place and size):
 * saved files by path, unsaved documents by their draft, each with its group.
 */
let restoring = false;
function saveSession() {
  if (restoring) return Promise.resolve();
  const list = tabs.filter((t) => t.path || t.draftId).map((t) => ({
    ...(t.path ? { path: t.path } : { draft: t.draftId }), mode: t.mode, group: t.groupId || null, align: t.align || null,
  }));
  const used = new Set(list.map((x) => x.group).filter(Boolean));
  const a = active();
  const keyOf = (id) => { const x = tabById(id); return x ? x.path || x.draftId || null : null; };
  const sp = split && split.b != null && keyOf(split.a) && keyOf(split.b) ? { a: keyOf(split.a), b: keyOf(split.b), ratio: split.ratio, vert: !!split.vert } : null;
  return api.setSession({
    tabs: list, active: a ? a.path || a.draftId || null : null, split: sp,
    groups: [...groups.values()].filter((g) => used.has(g.id)),
  });
}
/**
 * Bring back this window's tabs from the last session. `drafts` are the unsaved documents on disk;
 * the main window also takes those no window claims (left by a crash).
 */
async function restoreWindow(entry, drafts, claimed) {
  restoring = true;
  const byId = new Map(drafts.map((d) => [d.id, d]));
  const used = new Set();
  let restoredDrafts = 0;
  try {
    for (const g of entry.groups || []) groups.set(g.id, { ...g });
    for (const st of entry.tabs || []) {
      let t = null;
      if (st.path) {
        const ex = await api.stat(st.path);
        if (!ex.exists) continue;
        t = await openPath(st.path, { activate: false, group: st.group });
      } else if (st.draft && byId.has(st.draft) && !used.has(st.draft)) {
        const d = byId.get(st.draft);
        used.add(d.id);
        if (!d.content.trim()) { api.draftDelete(d.id); continue; }
        const meta = (settings.draftMeta || {})[d.id] || {};
        t = await newTab({ content: d.content, draftId: d.id, activate: false, align: meta.align, title: meta.title, group: st.group });
        t.baseline = ''; t.dirty = true; restoredDrafts++;
      }
      if (!t) continue;
      if (st.mode === 'source') setMode(t, 'source');
      if (st.align) { t.align = st.align; applyTabDir(t); }
    }
    // unsaved documents nobody claims (e.g. after a crash) come back in the main window, as before
    if (claimed) {
      for (const d of drafts) {
        if (used.has(d.id) || claimed.has(d.id)) continue;
        if (!d.content.trim()) { api.draftDelete(d.id); continue; }
        const meta = (settings.draftMeta || {})[d.id] || {};
        const t = await newTab({ content: d.content, draftId: d.id, activate: false, align: meta.align, title: meta.title });
        t.baseline = ''; t.dirty = true; restoredDrafts++;
      }
    }
  } finally {
    restoring = false;
  }
  if (entry.split) {
    const find = (k) => tabs.find((t) => samePath(t.path, k) || t.draftId === k);
    const a = find(entry.split.a), b = find(entry.split.b);
    if (a && b && a !== b) split = { a: a.id, b: b.id, ratio: Math.min(0.8, Math.max(0.2, Number(entry.split.ratio) || 0.5)), vert: !!entry.split.vert };
  }
  renderTabs();
  const a = tabs.find((t) => (entry.active && (samePath(t.path, entry.active) || t.draftId === entry.active)));
  if (a) activateTab(a.id);
  if (restoredDrafts) toast(tr('toast.draftsRestored', { n: fa(restoredDrafts) }));
  saveSession();
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
  if (e.key === 'Escape' && splitOn() && !$('#split-pick').hidden && !document.querySelector('.menu, .overlay')) { handled(); endSplit(); return; }
  if (e.key === 'Escape' && tabSel.size > 1 && !document.querySelector('.menu, .overlay')) { handled(); clearTabSel(); return; }
  if (e.key === 'F8') { handled(); if (t) setLocked(t, !t.locked); return; }
  if (ctrl && e.shiftKey && !e.altKey && code === 'KeyC' && t && !isTypingField()) { handled(); copyPlainText(t); return; }
  if (t && t.locked && isEditKey(e)) { handled(); showLockedToast(); return; }
  if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyA' && t && !isTypingField()) { handled(); selectAllDoc(t); return; }
  if (e.altKey && !ctrl && !e.shiftKey && code === 'KeyH' && t && t.mode === 'wysiwyg' && settings.extColor !== false) { handled(); applyLastColor(t); return; }
  if (e.altKey && !ctrl && !e.shiftKey && code === 'KeyT' && t && t.mode === 'wysiwyg' && settings.extTranslate !== false) { handled(); translateSelection(t); return; }
  if (ctrl && !e.shiftKey && !e.altKey && code === 'KeyJ' && t && !isTypingField()) { handled(); openFedora(t); return; }
  if (ctrl && e.shiftKey && !e.altKey && code === 'KeyJ' && t) { handled(); openDocFedora(t, $('#btn-fedora')); return; }
  if (e.key === 'F11') { handled(); api.fullscreen(); return; }
  if (e.key === 'F2' && !ctrl && !e.altKey && t && !isTypingField()) { handled(); startRename(t); return; }
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
  if (e.altKey && !e.shiftKey && /^Arrow(Left|Right|Up|Down)$/.test(code) && document.body.classList.contains('split-on') && split && split.b != null) {
    handled(); activateTab(code === 'ArrowLeft' || code === 'ArrowDown' ? split.b : split.a); return;
  }
  if (code === 'PageDown') { handled(); cycleTab(1); return; }
  if (code === 'PageUp') { handled(); cycleTab(-1); return; }
  switch (code) {
    case 'KeyN': handled(); api.newWindow(); break;
    case 'KeyO': handled(); e.shiftKey ? openFolder() : openDialog(); break;
    case 'KeyS': handled(); if (e.altKey) saveAll(); else save(t, e.shiftKey); break;
    case 'KeyW': handled(); if (tabSel.size > 1) closeTabs(selectedTabs()); else if (t) closeTab(t); break;
    case 'KeyT': handled(); if (e.shiftKey) reopenClosed(); else newTab(); break;
    case 'Slash': handled(); toggleSource(); break;
    case 'KeyH': handled(); if (e.shiftKey) historyPanel.toggle(); else openFind(true); break;
    case 'KeyF': handled(); openFind(false); break;
    case 'KeyL': if (e.shiftKey) { handled(); toggleSidebar(); } break;
    case 'Digit1': if (e.shiftKey) { handled(); updateSettings({ sidebar: true, sideView: 'outline' }); } break;
    case 'Digit3': if (e.shiftKey) { handled(); updateSettings({ sidebar: true, sideView: 'files' }); } break;
    case 'Comma': handled(); openSettings(); break;
    case 'Backslash': handled(); toggleSplit(); break;
    case 'Equal': case 'NumpadAdd': handled(); zoomBy(1); break;
    case 'Minus': case 'NumpadSubtract': handled(); zoomBy(-1); break;
    case 'Digit0': case 'Numpad0': if (!e.shiftKey && !e.altKey) { handled(); setZoom(1); } break;
    case 'KeyP': if (!e.shiftKey) { handled(); openQuickOpen(); } break;
    default: break;
  }
}

function setupDnD() {
  let hint = null;
  let inside = false; // a drag that started in this window (selected text, an image) is never a file to open
  const MD = /\.(md|markdown|mdown|mkd|txt)$/i;
  const isMd = (f) => MD.test(f.name);
  const types = (e) => (e.dataTransfer ? [...e.dataTransfer.types].map((x) => x.toLowerCase()) : []);
  const hasFiles = (e) => types(e).includes('files');
  // other apps (code editors, chat apps, browsers) often drag a file as a link or a path instead of a real file
  const LINKY = ['text/uri-list', 'codefiles', 'resourceurls', 'downloadurl'];
  const maybeLinked = (e) => !inside && types(e).some((x) => LINKY.includes(x));
  const removeHint = () => { if (hint) { hint.remove(); hint = null; } };
  document.addEventListener('dragstart', () => { inside = true; }, true);
  document.addEventListener('dragend', () => { inside = false; }, true);
  window.addEventListener('dragover', (e) => {
    const files = hasFiles(e) && [...e.dataTransfer.items].some((i) => i.kind === 'file' && !/^image\//.test(i.type));
    if (!files && !maybeLinked(e)) return;
    e.preventDefault();
    // a dragged link may be a web page rather than a file, so only real files get the hint
    if (files && !hint) { hint = el('div', { class: 'drop-hint' }, tr('dnd.dropHint')); document.body.append(hint); }
  }, true);
  window.addEventListener('dragleave', (e) => { if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight) removeHint(); });
  window.addEventListener('drop', async (e) => {
    removeHint();
    const wasInside = inside;
    inside = false;
    if (wasInside || !e.dataTransfer) return;
    let paths = hasFiles(e) ? [...e.dataTransfer.files].filter(isMd).map((f) => api.pathForFile(f)).filter(Boolean) : [];
    if (!paths.length) paths = linkedPaths(e.dataTransfer).filter((p) => MD.test(p));
    if (!paths.length) return;
    e.preventDefault(); e.stopPropagation();
    for (const p of paths) {
      const st = await api.stat(p).catch(() => null);
      if (st && st.exists) await openPath(p);
      else toast(tr('toast.fileNotFound', { name: basename(p) }), 'err');
    }
  }, true);
}
/** file paths hidden in a drag from another app: file:// links, VS Code-style lists, or a plain path */
function linkedPaths(dt) {
  const out = [];
  const add = (s) => {
    s = String(s || '').trim().replace(/^["']|["']$/g, '');
    if (!s || s.startsWith('#')) return;
    let p = null;
    if (/^file:/i.test(s)) {
      try {
        const u = new URL(s);
        p = decodeURIComponent(u.pathname);
        if (u.host) p = `//${u.host}${p}`; // network share
        else if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); // /C:/… → C:/…
      } catch { return; }
    } else if (/^[A-Za-z]:[\\/]/.test(s) || /^\\\\/.test(s) || s.startsWith('/')) p = s;
    if (!p) return;
    if (navigator.platform.startsWith('Win')) p = p.replace(/\//g, '\\');
    if (!out.includes(p)) out.push(p);
  };
  const get = (k) => { try { return dt.getData(k); } catch { return ''; } };
  for (const k of ['CodeFiles', 'ResourceURLs']) {
    const raw = get(k);
    if (!raw) continue;
    try { for (const x of JSON.parse(raw)) add(typeof x === 'string' ? x : x && (x.fsPath || x.path || x.uri || x.resource)); } catch { /* not JSON */ }
  }
  const dl = get('DownloadURL'); // mime:name:url
  if (dl) { const m = dl.match(/^[^:]*:[^:]*:(file:.*)$/i); if (m) add(m[1]); }
  get('text/uri-list').split(/\r?\n/).forEach(add);
  // a lone path as plain text (only when it is the whole text, so dragged prose is never mistaken for a file)
  const txt = get('text/plain').trim();
  if (!out.length && txt && !/\n/.test(txt)) add(txt);
  return out;
}

/**
 * Image blocks: the editor fixes an image's height once, when it loads, from the page width at that
 * moment. When the page gets narrower later (window, sidebar, split view, a tab opened in the
 * background) the picture was cropped. Keep the height in step with the real width instead.
 */
function setupImageFit() {
  const fit = (host) => {
    const img = host.querySelector(':scope > .image-wrapper img');
    if (!img || !img.naturalWidth || !img.isConnected) return;
    const cs = getComputedStyle(host);
    const hostW = host.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (hostW <= 0) return; // hidden tab: done when it shows
    const w = Math.min(img.naturalWidth, hostW);
    const origin = w * (img.naturalHeight / img.naturalWidth);
    const o = Number(img.dataset.origin);
    const h = Number(img.dataset.height);
    const ratio = o > 0 && h > 0 ? h / o : 1; // a height the user dragged by hand is kept as a ratio
    const next = origin * ratio;
    if (Math.abs((parseFloat(img.style.height) || 0) - next) < 0.5) return;
    img.dataset.origin = origin.toFixed(2);
    img.dataset.height = next.toFixed(2);
    img.style.height = `${next.toFixed(2)}px`;
  };
  const ro = new ResizeObserver((entries) => { for (const en of entries) fit(en.target); });
  document.addEventListener('load', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    const host = img.closest('.milkdown-image-block');
    if (!host || !img.closest('.image-wrapper')) return;
    ro.observe(host);
    requestAnimationFrame(() => fit(host)); // after the editor's own sizing on load
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
      title: dirty.length === 1 ? tr('dialog.unsaved.oneTitle', { name: tabTitle(dirty[0]) }) : tr('dialog.unsaved.manyTitle', { n: fa(dirty.length) }),
      text: tr('dialog.unsaved.quitText'),
      buttons: [{ label: tr('common.closeWithoutSaving'), value: 'discard', danger: true, aside: true }, { label: tr('common.cancel'), value: null }, { label: dirty.length > 1 ? tr('common.saveAll') : tr('common.save'), value: 'save', primary: true }],
    });
    if (!r) return;
    if (r === 'save' && !(await saveAll())) return;
  }
  for (const t of tabs) { rememberPos(t); dropDraft(t); }
  for (const t of tabs) if (t.path && t.md !== t.lastSnap) await api.historyAdd(t.path, t.md, 'auto').catch(() => {});
  await persistNow();
  await api.closeNow();
});
/** forget titles and directions of drafts that no longer exist */
function forgetMissingDraftMeta(drafts) {
  if (!settings.draftMeta) return;
  const keep = new Set(drafts.map((d) => d.id));
  const meta = Object.fromEntries(Object.entries(settings.draftMeta).filter(([id]) => keep.has(id)));
  if (Object.keys(meta).length !== Object.keys(settings.draftMeta).length) { settings.draftMeta = meta; persistSettings(); }
}
async function persistNow() { clearTimeout(persistT); await api.setSettings(settings); await saveSession(); }

export async function start() {
  settings = { ...DEFAULTS, ...(await api.getSettings()) };
  // the UI language is fixed for the window's lifetime, so it must be set before anything is drawn
  setLang(settings.uiLang);
  buildLayout();
  settings.recent = (settings.recent || []).map((r) => (typeof r === 'string' ? { path: r, time: 0 } : r)).slice(0, RECENT_MAX);
  customThemes = await api.customThemes();
  applyTheme();
  // the window is shown only now, once its theme is on (two frames: styles applied and painted)
  requestAnimationFrame(() => requestAnimationFrame(() => api.painted && api.painted()));
  document.addEventListener('keydown', onKey, true);
  installKeyboardLang(api);
  setupFindInputs();
  setupDnD();
  setupImageFit();
  setupPaste();

  const rd = await api.ready();
  const startupFiles = Array.isArray(rd) ? rd : rd.files;
  winRole = (rd && rd.role) || 'main';
  if (rd && rd.alwaysOnTop) { document.body.classList.add('on-top'); }
  paintPin();
  api.info().then((i) => { appInfo = i; }).catch(() => {});
  if (api.onUpdateState) { api.onUpdateState((u) => onUpdateState(u)); api.updateState().then((u) => onUpdateState(u, true)).catch(() => {}); }
  api.onReceiveTab((p, at) => receiveTabs(p, at));
  api.onDragHover((p) => onDragHover(p));
  api.onMergeInto((m) => mergeInto(m));
  api.onDragDone(() => { windowDrag = false; document.body.classList.remove('tab-drop'); clearDropMarks(); });
  if (rd && rd.dragging) windowDrag = true;
  api.onSetRole((r) => { winRole = r; saveSession(); });
  if (api.onStripMenu) api.onStripMenu((x, y) => stripMenu(x, y));
  const restore = rd && rd.payload && rd.payload.restore;
  if (restore) {
    // the main process hands each window its part of the last session
    const drafts = await api.draftList();
    await restoreWindow(restore, drafts, winRole === 'main' ? new Set(rd.payload.claimed || []) : null);
    if (winRole === 'main') forgetMissingDraftMeta(drafts);
    // a window whose files are all gone does not come back empty
    if (winRole !== 'main' && !tabs.length) { await api.closeNow(); return; }
  } else if (winRole !== 'main') {
    await receiveTabs(rd.payload || []);
  } else {
    // no session to restore (or restoring is off): unsaved documents still come back
    const drafts = await api.draftList();
    await restoreWindow({ tabs: [] }, drafts, new Set());
    forgetMissingDraftMeta(drafts);
  }
  for (const f of startupFiles || []) await openPath(f);
  applyCompact();
  booted = true;
  for (const f of earlyOpen.splice(0)) await openPath(f);
  if (!tabs.length) await newTab({ content: settings.welcomed ? '' : tr('welcome.doc') });
  else if (!activeId) activateTab(tabs[0].id);
  if (!settings.welcomed) { settings.welcomed = true; persistSettings(); }
  if (settings.logo && !LOGOS.some((l) => l.id === settings.logo)) updateSettings({ logo: '08' }); // an icon that was removed
  if (!settings.logoChosen && winRole === 'main') setTimeout(() => openLogoPicker(true), 400);
  else if (!settings.memeLogosOffered && winRole === 'main' && LOGOS.some((l) => l.fun)) setTimeout(() => openMemeLogos(), 900);
  applyAll();
  api.booted();
  // warm up what Settings needs, so its first opening is instant
  // (the font list needs a click or key press: ask with the first one, long before Settings opens)
  const warm = () => { document.removeEventListener('pointerdown', warm, true); document.removeEventListener('keydown', warm, true); loadSystemFonts(); };
  document.addEventListener('pointerdown', warm, true);
  document.addEventListener('keydown', warm, true);
}
