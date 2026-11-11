// Typing helpers: auto-pairing, wrap-selection, paste behaviour, LTR islands inside RTL text
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { toggleMark } from '@milkdown/kit/prose/commands';
import { keymap } from '@milkdown/kit/prose/keymap';

const PAIRS = { '"': '"', "'": "'", '(': ')', '[': ']', '{': '}', '«': '»', '“': '”' };
const CLOSERS = new Set(Object.values(PAIRS));
const SYMMETRIC = new Set(['"', "'"]);
const WORD = /[\p{L}\p{N}_]/u;
// typing one of these with text selected wraps it in a style instead of replacing it
const WRAP_MARKS = { '*': 'strong', _: 'emphasis', '~': 'strike_through', '`': 'inlineCode' };

function inCode(state) {
  const $f = state.selection.$from;
  if ($f.parent.type.spec.code) return true;
  const ic = state.schema.marks.inlineCode;
  return !!(ic && ic.isInSet(state.storedMarks || $f.marks()));
}
const charBefore = (state, pos) => (pos > state.selection.$from.start() ? state.doc.textBetween(pos - 1, pos, '\0', '\0') : '');
const charAfter = (state, pos) => (pos < state.selection.$from.end() ? state.doc.textBetween(pos, pos + 1, '\0', '\0') : '');

export const autoPair = $prose(() => new Plugin({
  key: new PluginKey('nv-autopair'),
  props: {
    handleTextInput(view, from, to, text) {
      const { state } = view;
      if (view.composing || text.length !== 1 || inCode(state)) return false;
      const sel = state.selection;

      // wrap a selection in a style: * bold, _ italic, ~ strikethrough, ` code
      if (!sel.empty && WRAP_MARKS[text]) {
        const mark = state.schema.marks[WRAP_MARKS[text]];
        if (mark) return toggleMark(mark)(state, view.dispatch);
      }
      // wrap a selection in a pair: (text) "text" «text»
      if (!sel.empty && PAIRS[text]) {
        const tr = state.tr.insertText(PAIRS[text], to).insertText(text, from);
        tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1));
        view.dispatch(tr);
        return true;
      }
      if (!sel.empty) return false;

      const next = charAfter(state, from);
      // typing a closer that is already there just steps over it
      if (CLOSERS.has(text) && next === text) {
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)));
        return true;
      }
      if (!PAIRS[text]) return false;
      const prev = charBefore(state, from);
      // don't pair before a word, and don't pair quotes right after a letter (don't, "word")
      if (next && WORD.test(next)) return false;
      if (SYMMETRIC.has(text) && prev && WORD.test(prev)) return false;
      const tr = state.tr.insertText(text + PAIRS[text], from, to);
      tr.setSelection(TextSelection.create(tr.doc, from + 1));
      view.dispatch(tr);
      return true;
    },
  },
}));

// Backspace between an empty pair removes both halves
export const pairBackspace = $prose(() => keymap({
  Backspace: (state, dispatch) => {
    const sel = state.selection;
    if (!sel.empty || inCode(state)) return false;
    const prev = charBefore(state, sel.from);
    const next = charAfter(state, sel.from);
    if (!prev || PAIRS[prev] !== next) return false;
    if (dispatch) dispatch(state.tr.delete(sel.from - 1, sel.from + 1));
    return true;
  },
}));

// After a paste, typing continues in plain style (Ctrl+B etc. turn styles back on)
const URL_RE = /^(https?:\/\/|mailto:|www\.)\S+$/i;
let justPasted = false;
export const pasteBehaviour = $prose(() => new Plugin({
  key: new PluginKey('nv-paste'),
  props: {
    // DOM handlers run before the editor's own paste handling, so this sees every paste
    handleDOMEvents: {
      paste(view, event) {
        // pasting a link onto selected text turns that text into a link
        const text = ((event.clipboardData && event.clipboardData.getData('text/plain')) || '').trim();
        const { state } = view;
        const link = state.schema.marks.link;
        if (link && !state.selection.empty && URL_RE.test(text) && !inCode(state)) {
          event.preventDefault();
          const href = /^www\./i.test(text) ? 'https://' + text : text;
          const { from, to } = state.selection;
          view.dispatch(state.tr.addMark(from, to, link.create({ href })).setSelection(TextSelection.create(state.doc, to)).setStoredMarks([]));
          return true;
        }
        justPasted = true;
        setTimeout(() => { justPasted = false; }, 0);
        return false;
      },
    },
  },
  appendTransaction(trs, _old, state) {
    if (!justPasted || !trs.some((tr) => tr.docChanged)) return null;
    justPasted = false;
    if (!state.selection.empty) return null;
    return state.tr.setStoredMarks([]);
  },
}));

// ---------- LTR islands: URLs, e-mails and paths keep their own order inside Persian lines ----------
const ISLAND_RE = /<(?:https?:|mailto:)[^>\s]+>|(?:https?:\/\/|www\.)[^\s؀-ۿ«»"]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/(?=[\s؀-ۿ«»"),.:;!?]|$)|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g;
// English text inside «…» or "…": isolate the whole phrase so its own ? or ! stays at its end
const QUOTE_RE = /[«"“]([^«»"“”\n]{2,300})[»"”]/g;
const TRAIL = /[.,:;!?)»"']+$/;
const islandCache = new WeakMap();
function islandsOf(node) {
  if (islandCache.has(node)) return islandCache.get(node);
  const out = [];
  let offset = 0;
  node.forEach((child) => {
    if (child.isText && !child.marks.some((m) => m.type.name === 'inlineCode' || m.type.name === 'link')) {
      ISLAND_RE.lastIndex = 0;
      let m;
      while ((m = ISLAND_RE.exec(child.text))) {
        let s = m[0];
        if (!s.startsWith('<')) s = s.replace(TRAIL, '');
        if (s.length > 1) out.push([offset + m.index, offset + m.index + s.length]);
      }
      QUOTE_RE.lastIndex = 0;
      while ((m = QUOTE_RE.exec(child.text))) {
        const inner = m[1];
        if (/[\u0600-\u06FF]/.test(inner) || !/^[\s(\[]*[A-Za-z0-9]/.test(inner)) continue;
        const a = offset + m.index + 1, b = a + inner.length;
        if (!out.some(([x, y]) => x < b && a < y)) out.push([a, b]);
      }
    }
    offset += child.nodeSize;
  });
  islandCache.set(node, out);
  return out;
}
const islandKey = new PluginKey('nv-ltr-islands');
function buildIslands(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isTextblock) return true;
    for (const [a, b] of islandsOf(node)) decos.push(Decoration.inline(pos + 1 + a, pos + 1 + b, { class: 'nv-ltr', dir: 'ltr' }));
    return false;
  });
  return DecorationSet.create(doc, decos);
}
export const ltrIslands = $prose(() => new Plugin({
  key: islandKey,
  state: {
    init: (_, s) => buildIslands(s.doc),
    apply: (tr, old) => (tr.docChanged ? buildIslands(tr.doc) : old),
  },
  props: { decorations: (s) => islandKey.getState(s) },
}));
