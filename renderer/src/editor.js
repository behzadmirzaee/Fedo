// Editor wrapper: WYSIWYG (Milkdown Crepe) + source mode (CodeMirror)
import { Crepe } from '@milkdown/crepe';
import { autoPair, pairBackspace, pasteBehaviour, ltrIslands } from './typing.js';
import { pmSearchPlugin, cmSearchExtension } from './search.js';
import { tableCellSchema, tableHeaderSchema } from '@milkdown/kit/preset/gfm';
import { textColorPlugins } from './textcolor.js';

// Table cells with no alignment follow their text direction (right for Persian) instead of
// being forced to "left"; an alignment picked by the user is kept and written to the file.
const naturalAlign = (schema) => schema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, alignment: { default: null } },
    parseDOM: (base.parseDOM || []).map((rule) => ({
      ...rule,
      getAttrs: (dom) => ({ ...(rule.getAttrs ? rule.getAttrs(dom) : {}), alignment: dom.style.textAlign || null }),
    })),
    toDOM: (node) => {
      const out = base.toDOM(node);
      if (!node.attrs.alignment && out && out[1] && out[1].style) {
        const attrs = { ...out[1] };
        attrs.style = attrs.style.replace(/text-align:\s*\w+;?\s*/i, '').trim() || undefined;
        if (!attrs.style) delete attrs.style;
        return [out[0], attrs, ...out.slice(2)];
      }
      return out;
    },
  };
});
import { $prose, replaceAll, getHTML } from '@milkdown/kit/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { closeHistory } from '@milkdown/kit/prose/history';

import { EditorView, keymap, drawSelection, highlightActiveLine, ViewPlugin, Decoration as CMDecoration } from '@codemirror/view';
import { EditorState, Compartment, Transaction } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Code blocks follow the app theme (colors come from CSS variables, so every theme works)
const codeTheme = EditorView.theme({
  '&': { color: 'var(--fg)', backgroundColor: 'transparent' },
  '.cm-content': { caretColor: 'var(--fg)', fontFamily: 'var(--font-code)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--fg) 5%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-placeholder': { color: 'var(--muted)' },
});
const codeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: 'var(--hl-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--hl-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--hl-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--hl-func)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--hl-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--hl-prop)' },
  { tag: [t.heading], color: 'var(--hl-keyword)', fontWeight: 'bold' },
  { tag: [t.link, t.url], color: 'var(--link)', textDecoration: 'underline' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
]);
export const codeBlockTheme = [codeTheme, syntaxHighlighting(codeHighlight)];

// ---------- RTL: every block takes its direction from its first letter (code is ignored) ----------
// Blocks with no letters yet (an empty line) inherit the document's base direction.
const DIR_BLOCKS = new Set([
  'paragraph', 'heading', 'blockquote', 'bullet_list', 'ordered_list', 'list_item',
  'table', 'table_row', 'table_cell', 'table_header', 'table_header_row',
]);
export const PLAIN_LANGS = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'plain text']);
const LTR_ONLY = new Set(['code_block', 'math_block', 'html', 'math_display']);
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LETTER_RE = /\p{L}/u;

// Any Persian/Arabic letter makes the block right-to-left; only all-Latin text is left-to-right.
export function dirOfText(text) {
  if (RTL_RE.test(text)) return 'rtl';
  return LETTER_RE.test(text) ? 'ltr' : null;
}
const dirCache = new WeakMap(); // ProseMirror nodes are immutable, so caching by identity is safe
function dirOfNode(node) {
  if (dirCache.has(node)) return dirCache.get(node);
  let d = null;
  if (LTR_ONLY.has(node.type.name)) d = null;
  else if (node.isTextblock) {
    let text = '';
    node.forEach((child) => {
      if (!child.isText) return;
      if (child.marks.some((m) => m.type.name === 'inlineCode' || m.type.name === 'code_inline')) return;
      text += child.text;
    });
    d = dirOfText(text);
  } else {
    // a list or table is right-to-left as soon as any part of it is
    node.forEach((child) => {
      if (d === 'rtl') return;
      const c = dirOfNode(child);
      if (c) d = c;
    });
  }
  dirCache.set(node, d);
  return d;
}

// Undo goes back one typed word at a time: starting a new word closes the current history group.
const wordUndo = $prose(() => new Plugin({
  props: {
    handleTextInput(view, from, _to, text) {
      if (!text || /^\s/.test(text)) return false;
      const $p = view.state.doc.resolve(from);
      const before = $p.parent.textBetween(Math.max(0, $p.parentOffset - 1), $p.parentOffset, undefined, '\ufffc');
      if (before === '' || /\s/.test(before)) view.dispatch(closeHistory(view.state.tr));
      return false;
    },
  },
}));
const dirKey = new PluginKey('nv-dir');
const dirPlugin = $prose(() => new Plugin({
  key: dirKey,
  state: {
    init: (_, state) => buildDirDecos(state.doc),
    apply: (tr, old) => (tr.docChanged ? buildDirDecos(tr.doc) : old),
  },
  props: { decorations: (state) => dirKey.getState(state) },
}));
function buildDirDecos(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    const t = node.type.name;
    if (LTR_ONLY.has(t)) {
      // plain-text blocks (no language) wrap and follow their text; real code keeps LTR + scrolling
      const plain = t === 'code_block' && PLAIN_LANGS.has(String(node.attrs.language || '').toLowerCase());
      decos.push(Decoration.node(pos, pos + node.nodeSize, plain ? { dir: 'ltr', class: 'nv-code-text' } : { dir: 'ltr' }));
      return false;
    }
    if (DIR_BLOCKS.has(t)) {
      const d = dirOfNode(node);
      const attrs = d ? { dir: d } : {};
      // a short paragraph that is entirely bold works as a sub-heading: give it heading spacing
      if (t === 'paragraph' && node.childCount && node.textContent.trim().length && node.textContent.length < 140) {
        let allBold = true;
        node.forEach((ch) => { if (!ch.isText || !ch.marks.some((m) => m.type.name === 'strong')) { if (!(ch.isText && !ch.text.trim())) allBold = false; } });
        if (allBold) attrs.class = 'nv-pseudo-h';
      }
      if (attrs.dir || attrs.class) decos.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    }
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decos);
}

// ---------- a click never scrolls the page by itself ----------
let lastPointer = 0;
const noPointerScroll = $prose(() => new Plugin({
  key: new PluginKey('nv-no-pointer-scroll'),
  props: {
    handleDOMEvents: { mousedown: () => { lastPointer = Date.now(); return false; } },
    // ProseMirror scrolls the caret into view after a selection change; skip that when the
    // change came from the mouse (the user already sees where they clicked)
    handleScrollToSelection: () => Date.now() - lastPointer < 600,
  },
}));

// ---------- Backspace at the start of a heading ----------
// default: lowers the level (h2 → h1 gets bigger), then turns it into text. Instead:
// empty line above → remove that line; otherwise → heading becomes normal text in one step.
export function headingBackspace(view) {
  const { state } = view;
  const sel = state.selection;
  if (!sel.empty) return false;
  const $f = sel.$from;
  if ($f.parent.type.name !== 'heading' || $f.parentOffset !== 0) return false;
  const start = $f.before();
  const $start = state.doc.resolve(start);
  const prev = $start.nodeBefore;
  if (prev && prev.type.name === 'paragraph' && prev.content.size === 0) {
    view.dispatch(state.tr.delete(start - prev.nodeSize, start).scrollIntoView());
    return true;
  }
  if (!prev) return true; // first line of the document: nothing above to move into
  view.dispatch(state.tr.setBlockType(start, start + $f.parent.nodeSize, state.schema.nodes.paragraph));
  return true;
}

// ---------- focus mode: mark the top-level block that holds the caret ----------
const focusKey = new PluginKey('nv-focus');
const focusPlugin = $prose(() => new Plugin({
  key: focusKey,
  props: {
    decorations(state) {
      const $pos = state.selection.$head;
      if ($pos.depth < 1) return null;
      const start = $pos.before(1);
      const node = state.doc.nodeAt(start);
      if (!node) return null;
      return DecorationSet.create(state.doc, [Decoration.node(start, start + node.nodeSize, { class: 'nv-current' })]);
    },
  },
}));

// ---------- mermaid preview (loaded lazily) ----------
let mermaidP = null;
let mermaidDark = false;
let mermaidSeq = 0;
export function setMermaidDark(d) {
  mermaidDark = d;
  if (mermaidP) mermaidP.then((m) => m.initialize({ startOnLoad: false, theme: d ? 'dark' : 'default', securityLevel: 'strict' }));
}
function renderMermaid(content, apply) {
  if (!mermaidP) {
    mermaidP = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, theme: mermaidDark ? 'dark' : 'default', securityLevel: 'strict' });
      return m.default;
    });
  }
  mermaidP
    .then((m) => m.render('nv-mmd-' + ++mermaidSeq, content))
    .then(({ svg }) => apply(svg))
    .catch((e) => apply(`<pre class="nv-mmd-err">${String(e.message || e).replace(/</g, '&lt;')}</pre>`));
}

const FA = {
  placeholder: 'بنویسید… برای درج بلوک، / را بزنید',
  textGroup: {
    label: 'متن', text: { label: 'متن ساده' }, h1: { label: 'تیتر ۱' }, h2: { label: 'تیتر ۲' }, h3: { label: 'تیتر ۳' },
    h4: { label: 'تیتر ۴' }, h5: { label: 'تیتر ۵' }, h6: { label: 'تیتر ۶' }, quote: { label: 'نقل‌قول' }, divider: { label: 'خط جداکننده' },
  },
  listGroup: { label: 'فهرست', bulletList: { label: 'فهرست نقطه‌ای' }, orderedList: { label: 'فهرست شماره‌دار' }, taskList: { label: 'فهرست کارها' } },
  advancedGroup: { label: 'پیشرفته', image: { label: 'تصویر' }, codeBlock: { label: 'بلوک کد' }, table: { label: 'جدول' }, math: { label: 'فرمول ریاضی' } },
};

/**
 * Create one editor for one tab.
 * hooks: { onChange(md), onSelection(), resolveImage(url), uploadImage(file) }
 */
export async function createEditor(root, markdownText, hooks) {
  const crepe = new Crepe({
    root,
    defaultValue: markdownText,
    features: { [Crepe.Feature.AI]: false, [Crepe.Feature.TopBar]: false },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: FA.placeholder, mode: 'block' },
      // the virtual cursor assumes left-to-right text and breaks arrow keys in Persian
      [Crepe.Feature.Cursor]: { virtual: false },
      [Crepe.Feature.BlockEdit]: {
        textGroup: FA.textGroup, listGroup: FA.listGroup, advancedGroup: FA.advancedGroup,
        // the drag handle sits on the start side of the block: right for Persian, left for English
        blockHandle: {
          getPlacement: ({ active, blockDom }) => {
            const el = active.el;
            const side = getComputedStyle(el).direction === 'rtl' ? 'right' : 'left';
            if (active.node.type.name === 'heading') return side;
            const st = getComputedStyle(el);
            const h = el.getBoundingClientRect().height - (parseInt(st.paddingTop, 10) || 0) - (parseInt(st.paddingBottom, 10) || 0);
            let n = 0;
            active.node.descendants((x) => { n += x.childCount; });
            return n > 2 || blockDom.getBoundingClientRect().height < h ? side + '-start' : side;
          },
        },
      },
      [Crepe.Feature.ImageBlock]: {
        onUpload: hooks.uploadImage,
        inlineOnUpload: hooks.uploadImage,
        blockOnUpload: hooks.uploadImage,
        proxyDomURL: hooks.resolveImage,
        inlineUploadButton: 'بارگذاری',
        inlineUploadPlaceholderText: 'یا آدرس تصویر را بچسبانید',
        inlineConfirmButton: 'تأیید',
        blockUploadButton: 'بارگذاری فایل',
        blockUploadPlaceholderText: 'یا آدرس تصویر را بچسبانید',
        blockCaptionPlaceholderText: 'توضیح تصویر',
        blockConfirmButton: 'تأیید',
      },
      [Crepe.Feature.CodeMirror]: {
        theme: codeBlockExtras,
        searchPlaceholder: 'جستجوی زبان',
        noResultText: 'یافت نشد',
        copyText: 'کپی',
        previewToggleText: (only) => (only ? 'ویرایش' : 'پنهان کردن'),
        previewLabel: 'پیش‌نمایش',
        renderPreview: (language, content, apply) => {
          if ((language || '').toLowerCase() !== 'mermaid' || !content.trim()) return null;
          renderMermaid(content, apply);
          return undefined;
        },
      },
      [Crepe.Feature.Latex]: { katexOptions: { throwOnError: false } },
    },
  });
  crepe.editor.use(wordUndo).use(dirPlugin).use(focusPlugin).use(autoPair).use(pairBackspace).use(pasteBehaviour).use(ltrIslands).use(pmSearchPlugin).use(noPointerScroll)
    .use(naturalAlign(tableCellSchema)).use(naturalAlign(tableHeaderSchema)).use(textColorPlugins);
  crepe.on((api) => {
    api.markdownUpdated((_ctx, md) => hooks.onChange(md));
    api.selectionUpdated(() => hooks.onSelection && hooks.onSelection());
  });
  await crepe.create();
  return crepe;
}

export function getView(crepe) {
  return crepe.editor.ctx.get(editorViewCtx);
}

export function setMarkdown(crepe, md) {
  crepe.editor.action(replaceAll(md, true));
}

export function getEditorHTML(crepe) {
  return crepe.editor.action(getHTML());
}

export function headingsFromView(crepe) {
  const view = getView(crepe);
  const out = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') out.push({ level: node.attrs.level, text: node.textContent, pos });
    return node.type.name !== 'heading';
  });
  return out;
}

export function jumpTo(crepe, pos) {
  const view = getView(crepe);
  const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  const dom = view.nodeDOM(pos);
  if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** keep the caret line vertically centered (typewriter mode) */
export function centerCaret(crepe, scroller) {
  const view = getView(crepe);
  try {
    const c = view.coordsAtPos(view.state.selection.head);
    const r = scroller.getBoundingClientRect();
    const target = r.top + r.height / 2;
    if (Math.abs(c.top - target) > 4) scroller.scrollBy({ top: c.top - target });
  } catch {}
}

// ---------- source mode ----------
export const readOnlyComp = new Compartment();
const lineDirs = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view) {
    const out = [];
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        const d = dirOfText(line.text.replace(/`[^`]*`/g, ''));
        if (d) out.push(CMDecoration.line({ attributes: { dir: d } }).range(line.from));
        pos = line.to + 1;
      }
    }
    return CMDecoration.set(out);
  }
}, { decorations: (v) => v.decorations });
// Code blocks: a line is right-to-left when Persian letters outnumber Latin ones (a Persian prompt
// with a few English words reads RTL; real code with a Persian comment stays LTR).
const FA_LETTER = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const EN_LETTER = /[A-Za-z]/g;
const majorityDir = (text) => {
  const fa = (text.match(FA_LETTER) || []).length;
  const en = (text.match(EN_LETTER) || []).length;
  if (!fa && !en) return null;
  return fa > en ? 'rtl' : 'ltr';
};
const codeLineDirs = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view) {
    const out = [];
    const block = majorityDir(view.state.doc.toString()) || 'ltr';
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        const d = majorityDir(line.text) || block;
        if (d === 'rtl' || block === 'rtl') out.push(CMDecoration.line({ attributes: { dir: d, class: 'nv-line-' + d } }).range(line.from));
        pos = line.to + 1;
      }
    }
    return CMDecoration.set(out);
  }
}, { decorations: (v) => v.decorations });
export const codeBlockExtras = [codeBlockTheme, EditorView.perLineTextDirection.of(true), codeLineDirs];

export function createSource(parent, md, onChange, onSelect) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: md,
      extensions: [
        history(),
        EditorState.transactionExtender.of((tr) => {
          if (!tr.isUserEvent('input.type') || !tr.docChanged) return null;
          let boundary = false;
          tr.changes.iterChanges((fromA, _toA, _fromB, _toB, ins) => {
            const txt = ins.toString();
            if (!txt || /^\s/.test(txt)) return;
            const prev = fromA > 0 ? tr.startState.doc.sliceString(fromA - 1, fromA) : '';
            if (prev === '' || /\s/.test(prev)) boundary = true;
          });
          return boundary ? { annotations: isolateHistory.of('before') } : null;
        }),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        EditorView.perLineTextDirection.of(true),
        markdown(),
        codeBlockTheme,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
          if (u.selectionSet && onSelect) { const r = u.state.selection.main; onSelect(r.empty ? '' : u.state.sliceDoc(r.from, r.to)); }
        }),
        EditorView.contentAttributes.of({ spellcheck: 'true' }),
        lineDirs,
        cmSearchExtension,
        readOnlyComp.of(EditorState.readOnly.of(false)),
      ],
    }),
  });
  return view;
}
export function sourceHeadings(md) {
  const out = [];
  let inCode = false;
  md.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    const m = !inCode && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], line: i });
  });
  return out;
}
