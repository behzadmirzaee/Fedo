import { TRANSLATE_ICON } from './translate.js';
// Right-click menu for the editor, with full table tools (Typora-style)
import { callCommand, insert } from '@milkdown/kit/utils';
import { editorViewCtx, serializerCtx, schemaCtx } from '@milkdown/kit/core';
import {
  toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, toggleLinkCommand,
  wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInOrderedListCommand, insertHrCommand,
  createCodeBlockCommand, turnIntoTextCommand, wrapInHeadingCommand,
} from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand, insertTableCommand, setAlignCommand, selectColCommand } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/kit/prose/state';
import {
  isInTable, selectedRect, addRowBefore, addRowAfter, addColumnBefore, addColumnAfter,
  deleteRow, deleteColumn, deleteTable, moveTableRow, moveTableColumn,
} from '@milkdown/kit/prose/tables';
import { showMenu, closeMenu, menuOpen, modal, toast, ICON, el, fa } from './ui.js';
import { emojiPanel, SMILE_ICON } from './emoji.js';
import { TEXT_COLORS, BG_COLORS, setTextColorCommand, colorAt, styleOf } from './textcolor.js';
import { t as tr } from './i18n.js';

const I = { ...ICON, del: ICON.trash, task: ICON.tickSquare, aL: ICON.alignL, aC: ICON.alignC, aR: ICON.alignR };

function ctxOf(crepe) {
  return crepe.editor.ctx;
}
function view(crepe) { return ctxOf(crepe).get(editorViewCtx); }
const run = (crepe, cmd, payload) => () => { crepe.editor.action(callCommand(cmd.key, payload)); view(crepe).focus(); };
const pm = (crepe, command) => () => { const v = view(crepe); command(v.state, v.dispatch); v.focus(); };

function markActive(state, name) {
  const type = state.schema.marks[name];
  if (!type) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/** markdown of the table that holds the selection */
function tableMarkdown(crepe) {
  const v = view(crepe);
  const $pos = v.state.selection.$from;
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'table') {
      const schema = ctxOf(crepe).get(schemaCtx);
      const doc = schema.topNodeType.create(null, [node]);
      return ctxOf(crepe).get(serializerCtx)(doc);
    }
  }
  return '';
}

function tableInfo(state) {
  try {
    const r = selectedRect(state);
    return { row: r.top, col: r.left, rows: r.map.height, cols: r.map.width, rtl: false };
  } catch { return null; }
}

export function tableCommands(crepe) {
  const v = () => view(crepe);
  const info = () => tableInfo(v().state);
  const moveRow = (d) => () => {
    const t = info(); if (!t) return;
    const to = t.row + d;
    if (to < 1 || to >= t.rows || t.row === 0) return; // the header row stays on top
    pm(crepe, moveTableRow({ from: t.row, to }))();
  };
  const moveCol = (d) => () => {
    const t = info(); if (!t) return;
    const to = t.col + d;
    if (to < 0 || to >= t.cols) return;
    pm(crepe, moveTableColumn({ from: t.col, to }))();
  };
  return {
    addRowAbove: () => { const t = info(); if (t && t.row > 0) pm(crepe, addRowBefore)(); },
    addRowBelow: pm(crepe, addRowAfter),
    addColBefore: pm(crepe, addColumnBefore),
    addColAfter: pm(crepe, addColumnAfter),
    moveRowUp: moveRow(-1),
    moveRowDown: moveRow(1),
    moveColPrev: moveCol(-1),
    moveColNext: moveCol(1),
    deleteRow: () => { const t = info(); if (t && t.row > 0) pm(crepe, deleteRow)(); else toast(tr('context.table.cantDeleteHeader')); },
    deleteCol: () => { const t = info(); if (t && t.cols > 1) pm(crepe, deleteColumn)(); else pm(crepe, deleteTable)(); },
    deleteTable: pm(crepe, deleteTable),
    // alignment belongs to a whole column in Markdown, so select the column first
    align: (a) => () => {
      const t = info(); if (!t) return;
      const keep = v().state.selection.from;
      crepe.editor.action(callCommand(selectColCommand.key, { index: t.col }));
      crepe.editor.action(callCommand(setAlignCommand.key, a));
      const st = v().state;
      v().dispatch(st.tr.setSelection(TextSelection.near(st.doc.resolve(Math.min(keep, st.doc.content.size)))));
      v().focus();
    },
    copyTable: async () => { await navigator.clipboard.writeText(tableMarkdown(crepe)); toast(tr('context.table.copiedToast'), 'ok'); },
    alignment: () => { const $f = v().state.selection.$from; for (let d = $f.depth; d > 0; d--) { const n = $f.node(d); if (/cell|header/.test(n.type.name)) return n.attrs.alignment || null; } return null; },
    info,
  };
}

/** keyboard shortcuts inside a table; returns true when handled */
export function handleTableKey(crepe, e) {
  const v = view(crepe);
  if (!isInTable(v.state)) return false;
  const T = tableCommands(crepe);
  const ctrl = e.ctrlKey || e.metaKey;
  // visual direction of the table decides what "left"/"right" means for columns
  const cell = v.domAtPos(v.state.selection.from).node;
  const el = cell.nodeType === 1 ? cell : cell.parentElement;
  const tbl = el && el.closest('table');
  const rtl = tbl && getComputedStyle(tbl).direction === 'rtl';
  if (ctrl && !e.shiftKey && e.key === 'Enter') { T.addRowBelow(); return true; }
  if (ctrl && e.shiftKey && e.key === 'Backspace') { T.deleteRow(); return true; }
  if (e.altKey && !ctrl) {
    if (e.key === 'ArrowUp') { T.moveRowUp(); return true; }
    if (e.key === 'ArrowDown') { T.moveRowDown(); return true; }
    if (e.key === 'ArrowLeft') { (rtl ? T.moveColNext : T.moveColPrev)(); return true; }
    if (e.key === 'ArrowRight') { (rtl ? T.moveColPrev : T.moveColNext)(); return true; }
  }
  return false;
}

async function askLink(crepe) {
  const href = await modal({ title: tr('context.link.title'), text: tr('context.link.url'), input: 'https://', buttons: [{ label: tr('common.cancel'), value: null }, { label: tr('common.add'), primary: true }] });
  if (!href) return;
  const v = view(crepe);
  if (v.state.selection.empty) {
    crepe.editor.action(insert(`[${href}](${href})`, true));
  } else {
    crepe.editor.action(callCommand(toggleLinkCommand.key, { href }));
  }
  v.focus();
}

function makeTaskList(crepe) {
  const v = view(crepe);
  const inList = () => {
    const $f = view(crepe).state.selection.$from;
    for (let d = $f.depth; d > 0; d--) if ($f.node(d).type.name === 'list_item') return d;
    return 0;
  };
  if (!inList()) crepe.editor.action(callCommand(wrapInBulletListCommand.key));
  const st = view(crepe).state;
  const d = inList();
  if (!d) return;
  const pos = st.selection.$from.before(d);
  const node = st.doc.nodeAt(pos);
  view(crepe).dispatch(st.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: node.attrs.checked == null ? false : null }));
  v.focus();
}

/** swatch shown before a colour item: glyph in the text colour on the background colour */
export const colorChip = (c) => `<span class="cchip" style="${styleOf({ color: c.color || 'currentColor', bg: c.bg })}">${tr('color.glyph')}</span>`;
export function applyColor(crepe, attrs) {
  crepe.editor.action(callCommand(setTextColorCommand.key, attrs));
  view(crepe).focus();
}
async function askCustomColor(crepe, cur, remember) {
  const row = (label, value) => {
    const on = el('input', { type: 'checkbox', checked: !!value });
    const pick = el('input', { type: 'color', value: value || '#D93A3A' });
    pick.addEventListener('input', () => { on.checked = true; });
    return { on, pick, node: el('label', { class: 'cc-row' }, on, el('span', {}, label), pick) };
  };
  const tc = row(tr('color.text'), cur.color), bg = row(tr('color.bg'), cur.bg);
  const ok = await modal({ title: tr('color.customTitle'), body: el('div', { class: 'cc-body' }, tc.node, bg.node),
    buttons: [{ label: tr('common.cancel'), value: false }, { label: tr('common.apply'), value: true, primary: true }] });
  if (!ok) return;
  const attrs = { color: tc.on.checked ? tc.pick.value.toUpperCase() : null, bg: bg.on.checked ? bg.pick.value.toUpperCase() : null };
  applyColor(crepe, attrs);
  remember(attrs);
}
/** the colour choices, all on one level: both palettes, last colour, custom, remove */
function colorItems(crepe, st, color) {
  const cur = colorAt(st);
  const set = (attrs) => { if (color.guard()) return; applyColor(crepe, attrs); color.remember({ ...cur, ...attrs }); };
  return [
    { swatches: { label: tr('color.text'), glyph: 'text', close: true, value: cur.color || 'none',
      items: [{ id: 'none', name: tr('color.none'), none: true }, ...TEXT_COLORS.map((c) => ({ id: c.c, name: c.name, color: c.c }))],
      pick: (id) => set({ color: id === 'none' ? null : id }) } },
    { swatches: { label: tr('color.bg'), glyph: 'bg', close: true, value: cur.bg || 'none',
      items: [{ id: 'none', name: tr('color.noBg'), none: true }, ...BG_COLORS.map((c) => ({ id: c.c, name: c.name, color: c.c }))],
      pick: (id) => set({ bg: id === 'none' ? null : id }) } },
    'sep',
    { icon: colorChip(color.last), label: tr('color.last'), key: 'Alt+H', run: () => set({ color: color.last.color || null, bg: color.last.bg || null }) },
    { icon: I.palette, label: tr('color.custom'), run: () => { if (!color.guard()) askCustomColor(crepe, cur, color.remember); } },
    { icon: I.x, label: tr('color.remove'), disabled: !cur.color && !cur.bg, run: () => { if (!color.guard()) applyColor(crepe, { clear: true }); } },
  ];
}
/**
 * The colour panel of the selection toolbar: opens on hover (or click) over «آ», above the toolbar so the
 * selected text stays visible, and closes when the pointer leaves both the button and the panel.
 */
let colorPanel = null;
export function openColorPanel(crepe, anchor, color) {
  if (!anchor || !color.enabled) return;
  if (colorPanel && colorPanel.anchor === anchor && menuOpen()) { clearTimeout(colorPanel.t); return; }
  const st = view(crepe).state;
  if (st.selection.empty) return;
  const r = anchor.getBoundingClientRect();
  anchor.classList.add('open');
  const m = showMenu(colorItems(crepe, st, color), r.right + 8, r.bottom + 8, () => { anchor.classList.remove('open'); colorPanel = null; });
  m.classList.add('color-panel');
  const h = m.getBoundingClientRect().height;
  const bar = anchor.closest('.milkdown-toolbar');
  const top = (bar ? bar.getBoundingClientRect().top : r.top) - h - 6;
  if (top >= 10) m.style.top = top + 'px';
  const p = { anchor, t: null };
  colorPanel = p;
  const later = () => { clearTimeout(p.t); p.t = setTimeout(() => { if (colorPanel === p && !document.querySelector('.overlay')) closeMenu(); }, 350); };
  const stay = () => clearTimeout(p.t);
  for (const n of [anchor, m]) { n.addEventListener('mouseleave', later); n.addEventListener('mouseenter', stay); }
}

export function openEditorMenu(crepe, x, y, { insertImage, edit, color, emoji, copyPlain, ai, translate }) {
  const v = view(crepe);
  const st = v.state;
  const inTable = isInTable(st);
  const hasSel = !st.selection.empty;
  const T = tableCommands(crepe);
  const t = inTable ? T.info() : null;

  const cur = inTable ? T.alignment() : null;
  const tableSub = inTable ? [
    { columns: [
      { header: tr('context.table.row'), items: [
        { label: tr('context.table.addAbove'), disabled: t && t.row === 0, run: T.addRowAbove },
        { label: tr('context.table.addBelow'), key: 'Ctrl+Enter', run: T.addRowBelow },
        { label: tr('context.table.moveUp'), key: 'Alt+↑', disabled: !t || t.row <= 1, run: T.moveRowUp },
        { label: tr('context.table.moveDown'), key: 'Alt+↓', disabled: !t || t.row === 0 || t.row >= t.rows - 1, run: T.moveRowDown },
        { label: tr('context.table.deleteRow'), key: 'Ctrl+Shift+⌫', danger: true, disabled: t && t.row === 0, run: T.deleteRow },
      ] },
      { header: tr('context.table.col'), items: [
        { label: tr('context.table.addBefore'), run: T.addColBefore },
        { label: tr('context.table.addAfter'), run: T.addColAfter },
        { label: tr('context.table.moveBefore'), key: 'Alt+→', disabled: !t || t.col === 0, run: T.moveColPrev },
        { label: tr('context.table.moveAfter'), key: 'Alt+←', disabled: !t || t.col >= t.cols - 1, run: T.moveColNext },
        { label: tr('context.table.deleteCol'), danger: true, run: T.deleteCol },
      ] },
    ] },
    'sep',
    { icon: I.aR, label: tr('context.table.alignCol'), segment: [
      { html: I.aL, title: tr('context.table.alignLeft'), on: cur === 'left', run: T.align('left') },
      { html: I.aC, title: tr('context.table.alignCenter'), on: cur === 'center', run: T.align('center') },
      { html: I.aR, title: tr('context.table.alignRight'), on: cur === 'right', run: T.align('right') },
    ] },
    'sep',
    { icon: I.copy, label: tr('context.table.copyMarkdown'), run: T.copyTable },
    { icon: I.del, label: tr('context.table.deleteTable'), danger: true, run: T.deleteTable },
  ] : [
    { icon: I.table, label: tr('context.table.insertSize', { r: fa(3), c: fa(3) }), run: run(crepe, insertTableCommand, { row: 3, col: 3 }) },
    { icon: I.table, label: tr('context.table.insertSize', { r: fa(4), c: fa(2) }), run: run(crepe, insertTableCommand, { row: 4, col: 2 }) },
  ];

  showMenu([
    { tiles: [
      { icon: I.cut, label: tr('common.cut'), title: 'Ctrl+X', disabled: !hasSel, run: () => edit('cut') },
      { icon: I.copy, label: tr('common.copy'), title: 'Ctrl+C', disabled: !hasSel, run: () => edit('copy') },
      { icon: I.paste, label: tr('common.paste'), title: 'Ctrl+V', run: () => edit('paste') },
      { icon: I.del, label: tr('common.delete'), title: 'Delete', disabled: !hasSel, run: () => { v.dispatch(v.state.tr.deleteSelection()); v.focus(); } },
    ] },
    { icon: I.copyPlain, label: tr('context.copyPlain'), key: 'Ctrl+Shift+C', disabled: !hasSel || !copyPlain, run: () => copyPlain() },
    { icon: I.pastePlain, label: tr('context.pastePlain'), key: 'Ctrl+Shift+V', run: () => edit('pastePlain') },
    'sep',
    // the assistant and Google Translate, on the selected text
    ai ? { icon: `<span class="ctx-ai">${ai.icon}</span>`, label: ai.name, key: 'Ctrl+J', disabled: !hasSel, run: ai.run } : null,
    translate ? { icon: TRANSLATE_ICON, label: tr('context.googleTranslate'), key: 'Alt+T', disabled: !hasSel, run: translate.run } : null,
    ai || translate ? 'sep' : null,
    { grid: [
      { html: I.bold, title: tr('editor.toolbar.bold'), active: markActive(st, 'strong'), run: run(crepe, toggleStrongCommand) },
      { html: I.italic, title: tr('editor.toolbar.italic'), active: markActive(st, 'emphasis'), run: run(crepe, toggleEmphasisCommand) },
      { html: I.code, title: tr('editor.toolbar.code'), active: markActive(st, 'inlineCode'), run: run(crepe, toggleInlineCodeCommand) },
      { html: I.link, title: tr('editor.toolbar.link'), active: markActive(st, 'link'), run: () => askLink(crepe) },
      { html: I.quote, title: tr('editor.slash.quote'), run: run(crepe, wrapInBlockquoteCommand) },
      { html: I.ol, title: tr('editor.slash.orderedList'), run: run(crepe, wrapInOrderedListCommand) },
      { html: I.ul, title: tr('editor.slash.bulletList'), run: run(crepe, wrapInBulletListCommand) },
      { html: I.task, title: tr('editor.slash.taskList'), run: () => makeTaskList(crepe) },
    ] },
    'sep',
    emoji ? { icon: SMILE_ICON, label: tr('context.emoji'), sub: [{ className: 'emoji-menu', panel: () => emojiPanel({
      pins: emoji.pins(), recent: emoji.recent(), setPins: emoji.setPins,
      insert: (e) => {
        closeMenu();
        const v2 = view(crepe);
        const { to } = v2.state.selection;
        v2.dispatch(v2.state.tr.insertText(e, to).scrollIntoView());
        v2.focus();
        emoji.used(e);
      },
    }) }] } : null,
    color && color.enabled ? { icon: colorChip((() => { const c = colorAt(st); return c.color || c.bg ? c : { color: '#D93A3A' }; })()), label: tr('editor.toolbar.color'), disabled: !hasSel, sub: colorItems(crepe, st, color) } : null,
    { icon: I.strike, label: tr('editor.toolbar.strike'), key: 'Alt+Shift+5', checked: markActive(st, 'strike_through'), run: run(crepe, toggleStrikethroughCommand) },
    { icon: I.textSize, label: tr('context.paragraph'), sub: [
      { label: tr('editor.slash.plainText'), key: 'Ctrl+Alt+0', run: run(crepe, turnIntoTextCommand) },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: tr('editor.heading', { n: fa(n) }), key: `Ctrl+Alt+${n}`, run: run(crepe, wrapInHeadingCommand, n) })),
    ] },
    { icon: I.table, label: tr('editor.slash.table'), sub: tableSub },
    { icon: I.plusSquare, label: tr('context.insert'), sub: [
      { icon: I.image, label: tr('context.insertImage'), run: insertImage },
      { icon: I.table, label: tr('editor.slash.table'), run: run(crepe, insertTableCommand, { row: 3, col: 3 }) },
      { icon: I.code, label: tr('editor.slash.codeBlock'), run: run(crepe, createCodeBlockCommand) },
      { icon: I.formula, label: tr('editor.slash.math'), run: () => { crepe.editor.action(callCommand(createCodeBlockCommand.key, 'LaTeX')); view(crepe).focus(); } },
      { icon: I.diagram, label: tr('context.insertMermaid'), run: () => { crepe.editor.action(callCommand(createCodeBlockCommand.key, 'mermaid')); view(crepe).focus(); } },
      { icon: I.hr, label: tr('editor.slash.divider'), run: run(crepe, insertHrCommand) },
    ] },
  ], x, y);
}
