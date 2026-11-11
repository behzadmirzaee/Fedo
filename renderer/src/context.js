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
import { showMenu, modal, toast } from './ui.js';

const ic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  bold: ic('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
  italic: ic('<path d="M14 5h-4M14 19h-4M14 5l-4 14"/>'),
  code: ic('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>'),
  link: ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  strike: ic('<path d="M4 12h16M16 7a4 3 0 0 0-8 0c0 4 8 2 8 6a4 3 0 0 1-8 0"/>'),
  quote: ic('<path d="M7 7h4v4c0 3-2 5-4 6M13 7h4v4c0 3-2 5-4 6"/>'),
  ol: ic('<path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 15h2l-2 3h2"/>'),
  ul: ic('<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/>'),
  task: ic('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'),
  cut: ic('<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 16L18 4M16 16L6 4"/>'),
  copy: ic('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  paste: ic('<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h6"/>'),
  del: ic('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
  aL: ic('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  aC: ic('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  aR: ic('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
};

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
    deleteRow: () => { const t = info(); if (t && t.row > 0) pm(crepe, deleteRow)(); else toast('سطر عنوان جدول حذف نمی‌شود'); },
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
    copyTable: async () => { await navigator.clipboard.writeText(tableMarkdown(crepe)); toast('جدول به‌صورت Markdown کپی شد'); },
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
  const href = await modal({ title: 'افزودن پیوند', text: 'آدرس پیوند:', input: 'https://', buttons: [{ label: 'انصراف', value: null }, { label: 'افزودن', primary: true }] });
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

export function openEditorMenu(crepe, x, y, { insertImage, edit }) {
  const v = view(crepe);
  const st = v.state;
  const inTable = isInTable(st);
  const hasSel = !st.selection.empty;
  const T = tableCommands(crepe);
  const t = inTable ? T.info() : null;

  const tableSub = inTable ? [
    { label: 'افزودن سطر بالا', disabled: t && t.row === 0, run: T.addRowAbove },
    { label: 'افزودن سطر پایین', key: 'Ctrl+Enter', run: T.addRowBelow },
    { label: 'افزودن ستون قبل', run: T.addColBefore },
    { label: 'افزودن ستون بعد', run: T.addColAfter },
    'sep',
    { label: 'انتقال سطر به بالا', key: 'Alt+↑', disabled: !t || t.row <= 1, run: T.moveRowUp },
    { label: 'انتقال سطر به پایین', key: 'Alt+↓', disabled: !t || t.row === 0 || t.row >= t.rows - 1, run: T.moveRowDown },
    { label: 'انتقال ستون به قبل', key: 'Alt+→', disabled: !t || t.col === 0, run: T.moveColPrev },
    { label: 'انتقال ستون به بعد', key: 'Alt+←', disabled: !t || t.col >= t.cols - 1, run: T.moveColNext },
    'sep',
    { label: 'تراز ستون: چپ', run: T.align('left') },
    { label: 'تراز ستون: وسط', run: T.align('center') },
    { label: 'تراز ستون: راست', run: T.align('right') },
    'sep',
    { label: 'حذف سطر', key: 'Ctrl+Shift+⌫', disabled: t && t.row === 0, run: T.deleteRow },
    { label: 'حذف ستون', run: T.deleteCol },
    'sep',
    { label: 'کپی جدول (Markdown)', run: T.copyTable },
    { label: 'حذف جدول', run: T.deleteTable },
  ] : [
    { label: 'درج جدول ۳ × ۳', run: run(crepe, insertTableCommand, { row: 3, col: 3 }) },
    { label: 'درج جدول ۴ × ۲', run: run(crepe, insertTableCommand, { row: 4, col: 2 }) },
  ];

  showMenu([
    { grid: [
      { html: I.cut, title: 'برش', disabled: !hasSel, run: () => edit('cut') },
      { html: I.copy, title: 'کپی', disabled: !hasSel, run: () => edit('copy') },
      { html: I.paste, title: 'چسباندن', run: () => edit('paste') },
      { html: I.del, title: 'حذف', disabled: !hasSel, run: () => { v.dispatch(v.state.tr.deleteSelection()); v.focus(); } },
    ] },
    { label: 'چسباندن به‌صورت متن ساده', key: 'Ctrl+Shift+V', run: () => edit('pastePlain') },
    'sep',
    { grid: [
      { html: I.bold, title: 'پررنگ (Ctrl+B)', active: markActive(st, 'strong'), run: run(crepe, toggleStrongCommand) },
      { html: I.italic, title: 'کج (Ctrl+I)', active: markActive(st, 'emphasis'), run: run(crepe, toggleEmphasisCommand) },
      { html: I.code, title: 'کد درون‌خطی', active: markActive(st, 'inlineCode'), run: run(crepe, toggleInlineCodeCommand) },
      { html: I.link, title: 'پیوند', active: markActive(st, 'link'), run: () => askLink(crepe) },
      { html: I.quote, title: 'نقل‌قول', run: run(crepe, wrapInBlockquoteCommand) },
      { html: I.ol, title: 'فهرست شماره‌دار', mirror: true, run: run(crepe, wrapInOrderedListCommand) },
      { html: I.ul, title: 'فهرست نقطه‌ای', mirror: true, run: run(crepe, wrapInBulletListCommand) },
      { html: I.task, title: 'فهرست کارها', run: () => makeTaskList(crepe) },
    ] },
    'sep',
    { label: 'خط‌خورده', key: 'Alt+Shift+5', run: run(crepe, toggleStrikethroughCommand) },
    { label: 'پاراگراف', sub: [
      { label: 'متن ساده', key: 'Ctrl+Alt+0', run: run(crepe, turnIntoTextCommand) },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `تیتر ${'۱۲۳۴۵۶'[n - 1]}`, key: `Ctrl+Alt+${n}`, run: run(crepe, wrapInHeadingCommand, n) })),
    ] },
    { label: 'جدول', sub: tableSub },
    { label: 'درج', sub: [
      { label: 'تصویر…', run: insertImage },
      { label: 'جدول', run: run(crepe, insertTableCommand, { row: 3, col: 3 }) },
      { label: 'بلوک کد', run: run(crepe, createCodeBlockCommand) },
      { label: 'فرمول ریاضی', run: () => { crepe.editor.action(callCommand(createCodeBlockCommand.key, 'LaTeX')); view(crepe).focus(); } },
      { label: 'نمودار (mermaid)', run: () => { crepe.editor.action(callCommand(createCodeBlockCommand.key, 'mermaid')); view(crepe).focus(); } },
      { label: 'خط جداکننده', run: run(crepe, insertHrCommand) },
    ] },
  ], x, y);
}
