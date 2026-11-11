// Find & replace that works on the document itself (never the UI), with exact character matching.
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration as CMDeco } from '@codemirror/view';

const MAX_MATCHES = 20000;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** spec: { text, matchCase, wholeWord } → RegExp or null */
export function buildRegex(spec) {
  if (!spec || !spec.text) return null;
  let src = escapeRe(spec.text);
  if (spec.wholeWord) src = `(?<![\\p{L}\\p{N}\\p{M}_‌])${src}(?![\\p{L}\\p{N}\\p{M}_‌])`;
  try { return new RegExp(src, 'gu' + (spec.matchCase ? '' : 'i')); } catch { return null; }
}

function scan(text, regex, base, out) {
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) && out.length < MAX_MATCHES) {
    if (!m[0].length) { regex.lastIndex++; continue; }
    out.push({ from: base + m.index, to: base + m.index + m[0].length });
  }
}

// ---------------------------------------------------------------- ProseMirror (live editing)
// Each textblock's text is rebuilt with one placeholder per non-text inline node, so string
// offsets map 1:1 to document positions.
function pmMatches(doc, regex) {
  const out = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return out.length < MAX_MATCHES;
    let text = '';
    node.forEach((ch) => { text += ch.isText ? ch.text : '￼'.repeat(ch.nodeSize); });
    scan(text, regex, pos + 1, out);
    return false;
  });
  return out;
}

const pmKey = new PluginKey('nv-search');
export const pmSearchPlugin = $prose(() => new Plugin({
  key: pmKey,
  state: {
    init: () => ({ regex: null, matches: [], current: -1 }),
    apply(tr, s, _old, state) {
      const meta = tr.getMeta(pmKey);
      let next = s;
      if (meta) next = { ...s, ...meta };
      if (next.regex && (tr.docChanged || (meta && 'regex' in meta))) {
        next = { ...next, matches: pmMatches(state.doc, next.regex) };
        if (next.current >= next.matches.length) next.current = next.matches.length - 1;
      }
      if (!next.regex && s.matches.length) next = { ...next, matches: [], current: -1 };
      return next;
    },
  },
  props: {
    decorations(state) {
      const s = pmKey.getState(state);
      if (!s.matches.length) return null;
      return DecorationSet.create(state.doc, s.matches.map((m, i) =>
        Decoration.inline(m.from, m.to, { class: i === s.current ? 'nv-find nv-find-cur' : 'nv-find' })));
    },
  },
}));

export function pmEngine(view) {
  const st = () => pmKey.getState(view.state);
  const setMeta = (meta, extra) => {
    let tr = view.state.tr.setMeta(pmKey, meta);
    if (extra) tr = extra(tr);
    view.dispatch(tr);
  };
  const select = (i) => {
    const m = st().matches[i];
    setMeta({ current: i }, m ? (tr) => tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView() : null);
    if (m) {
      // keep the hit comfortably inside the window, not glued to the edge
      requestAnimationFrame(() => {
        const dom = view.dom.querySelector('.nv-find-cur');
        if (dom) dom.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    }
  };
  return {
    setQuery(regex) {
      setMeta({ regex, current: -1 });
      const ms = st().matches;
      if (!ms.length) return;
      const from = view.state.selection.from;
      const i = ms.findIndex((m) => m.from >= from);
      select(i < 0 ? 0 : i);
    },
    clear() { if (st().regex) setMeta({ regex: null, current: -1 }); },
    info() { const s = st(); return { count: s.matches.length, current: s.current, capped: s.matches.length >= MAX_MATCHES }; },
    step(dir) {
      const s = st();
      if (!s.matches.length) return;
      const n = s.matches.length;
      select(s.current < 0 ? (dir > 0 ? 0 : n - 1) : (s.current + dir + n) % n);
    },
    replaceCurrent(rep) {
      const s = st();
      const m = s.matches[s.current];
      if (!m) return false;
      const tr = view.state.tr;
      if (rep) tr.insertText(rep, m.from, m.to); else tr.delete(m.from, m.to);
      view.dispatch(tr);
      const ms = st().matches;
      const after = m.from + rep.length;
      const i = ms.findIndex((x) => x.from >= after);
      if (ms.length) select(i < 0 ? 0 : i); else setMeta({ current: -1 });
      return true;
    },
    replaceAll(rep) {
      const ms = st().matches;
      if (!ms.length) return 0;
      const tr = view.state.tr;
      for (let i = ms.length - 1; i >= 0; i--) {
        if (rep) tr.insertText(rep, ms[i].from, ms[i].to); else tr.delete(ms[i].from, ms[i].to);
      }
      view.dispatch(tr);
      return ms.length;
    },
  };
}

/**
 * Preset clean-ups. Text inside code, inline code and links is never touched.
 * rule: { regex, replace(match, ctx) → string|null, when?(blockText) → bool }
 */
export function pmCollectEdits(view, rule) {
  const edits = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isTextblock) return true;
    let blockText = '';
    node.forEach((ch) => { if (ch.isText) blockText += ch.text; });
    if (rule.when && !rule.when(blockText)) return false;
    node.forEach((ch, offset) => {
      if (!ch.isText) return;
      if (ch.marks.some((mk) => /code|link/i.test(mk.type.name))) return;
      rule.regex.lastIndex = 0;
      let m;
      while ((m = rule.regex.exec(ch.text))) {
        if (!m[0].length) { rule.regex.lastIndex++; continue; }
        const rep = rule.replace(m, { text: ch.text, index: m.index });
        if (rep == null || rep === m[0]) continue;
        const from = pos + 1 + offset + m.index;
        edits.push({ from, to: from + m[0].length, text: rep });
      }
    });
    return false;
  });
  return edits;
}
export function pmApplyEdits(view, edits) {
  const tr = view.state.tr;
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    if (e.text) tr.insertText(e.text, e.from, e.to); else tr.delete(e.from, e.to);
  }
  view.dispatch(tr);
}

// ---------------------------------------------------------------- CodeMirror (source mode)
const setCm = StateEffect.define();
const cmField = StateField.define({
  create: () => ({ regex: null, matches: [], current: -1 }),
  update(s, tr) {
    let next = s;
    for (const e of tr.effects) if (e.is(setCm)) next = { ...next, ...e.value };
    if (next.regex && (tr.docChanged || tr.effects.some((e) => e.is(setCm) && 'regex' in e.value))) {
      const out = [];
      scan(tr.state.doc.toString(), next.regex, 0, out);
      next = { ...next, matches: out };
      if (next.current >= out.length) next.current = out.length - 1;
    }
    if (!next.regex && s.matches.length) next = { ...next, matches: [], current: -1 };
    return next;
  },
  provide: (f) => EditorView.decorations.from(f, (s) => {
    if (!s.matches.length) return CMDeco.none;
    return CMDeco.set(s.matches.map((m, i) => CMDeco.mark({ class: i === s.current ? 'nv-find nv-find-cur' : 'nv-find' }).range(m.from, m.to)));
  }),
});
export const cmSearchExtension = cmField;

export function cmEngine(view) {
  const st = () => view.state.field(cmField);
  const select = (i) => {
    const m = st().matches[i];
    view.dispatch({
      effects: [setCm.of({ current: i }), ...(m ? [EditorView.scrollIntoView(m.from, { y: 'center' })] : [])],
      selection: m ? { anchor: m.from, head: m.to } : undefined,
    });
  };
  return {
    setQuery(regex) {
      view.dispatch({ effects: setCm.of({ regex, current: -1 }) });
      const ms = st().matches;
      if (!ms.length) return;
      const from = view.state.selection.main.from;
      const i = ms.findIndex((m) => m.from >= from);
      select(i < 0 ? 0 : i);
    },
    clear() { if (st().regex) view.dispatch({ effects: setCm.of({ regex: null, current: -1 }) }); },
    info() { const s = st(); return { count: s.matches.length, current: s.current, capped: s.matches.length >= MAX_MATCHES }; },
    step(dir) {
      const s = st();
      if (!s.matches.length) return;
      const n = s.matches.length;
      select(s.current < 0 ? (dir > 0 ? 0 : n - 1) : (s.current + dir + n) % n);
    },
    replaceCurrent(rep) {
      const s = st();
      const m = s.matches[s.current];
      if (!m) return false;
      view.dispatch({ changes: { from: m.from, to: m.to, insert: rep } });
      const ms = st().matches;
      const after = m.from + rep.length;
      const i = ms.findIndex((x) => x.from >= after);
      if (ms.length) select(i < 0 ? 0 : i);
      return true;
    },
    replaceAll(rep) {
      const ms = st().matches;
      if (!ms.length) return 0;
      view.dispatch({ changes: ms.map((m) => ({ from: m.from, to: m.to, insert: rep })) });
      return ms.length;
    },
  };
}

// ---------------------------------------------------------------- preset actions
const PERSIAN_ONLY = /[پچژگیک]/; // پ چ ژ گ ی ک: the block is Persian, not Arabic
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_ONLY = /[\u0629\u0649\u0625\u0623\u064B-\u0650]/; // ة ى إ أ and Arabic vowel marks
// Persian if it has letters only Persian uses, or is right-to-left without Arabic-only letters
const isPersian = (t) => PERSIAN_ONLY.test(t) || (RTL.test(t) && !ARABIC_ONLY.test(t) && !/[\u064A\u0643]/.test(t));
export const PRESETS = [
  {
    id: 'heh-hamza', label: '«هٔ» و «ۀ» به «ه»', sample: 'خانهٔ ← خانه',
    rule: { regex: /هٔ|ۀ/g, replace: () => 'ه' },
  },
  {
    id: 'arabic-yk', label: '«ي» و «ك» عربی به «ی» و «ک» فارسی', sample: 'فقط در پاراگراف‌های فارسی، متن عربی دست نمی‌خورد',
    rule: { regex: /[يك]/g, replace: (m) => (m[0] === 'ي' ? 'ی' : 'ک'), when: (t) => PERSIAN_ONLY.test(t) },
  },
  {
    id: 'digits-fa', label: 'اعداد انگلیسی به فارسی', sample: 'فقط در پاراگراف‌های فارسی؛ G1 و آدرس‌ها دست نمی‌خورند',
    rule: {
      regex: /(?<![A-Za-z0-9_./:#@-])[0-9]+(?:[.,][0-9]+)*(?![A-Za-z0-9_/@-])/g,
      replace: (m) => m[0].replace(/[0-9]/g, (d) => FA_DIGITS[d]).replace(/\./g, '٫'),
      when: isPersian,
    },
  },
  {
    id: 'digits-en', label: 'اعداد فارسی به انگلیسی', sample: 'فقط در پاراگراف‌های تمام‌انگلیسی',
    rule: { regex: /[۰-۹٠-٩]+/g, replace: (m) => m[0].replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)), when: (t) => !RTL.test(t.replace(/[۰-۹٠-٩]/g, '')) },
  },
  {
    id: 'double-space', label: 'فاصله‌های پشت‌سرهم به یک فاصله', sample: 'دو یا چند فاصله ← یک فاصله',
    rule: { regex: / {2,}/g, replace: () => ' ' },
  },
  {
    id: 'space-before-punct', label: 'حذف فاصله‌ی قبل از نقطه و ویرگول', sample: 'سلام ، دنیا . ← سلام، دنیا.',
    rule: { regex: / +(?=[،؛.:!؟?])/g, replace: () => '', when: (t) => RTL.test(t) },
  },
  { id: 'find-emdash', label: 'پیدا کردن خط تیره‌ی بلند (em dash)', sample: 'برای جایگزینی دستی، با جستجو', find: '\u2014', name: 'خط تیره‌ی بلند' },
];
