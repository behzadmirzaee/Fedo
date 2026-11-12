// Built-in extension "text colour": a mark kept in the Markdown file as inline HTML,
//   <span style="color:#D93A3A;background:#FFF3B0">text</span>
// so the colour survives saving, shows in any Markdown viewer that renders HTML, and reaches HTML/PDF export.
// The mark is always part of the schema: turning the extension off only hides the colours and the tools,
// it never strips the spans from a file.
import { $markSchema, $remark, $command } from '@milkdown/kit/utils';

export const TEXT_COLORS = [
  { c: '#D93A3A', name: 'قرمز' }, { c: '#D9730D', name: 'نارنجی' }, { c: '#B7791F', name: 'زرد تیره' }, { c: '#2F9E5A', name: 'سبز' },
  { c: '#2F6FDD', name: 'آبی' }, { c: '#8E5BD9', name: 'بنفش' }, { c: '#D6407F', name: 'صورتی' }, { c: '#6E6E78', name: 'خاکستری' },
];
export const BG_COLORS = [
  { c: '#FFF3B0', name: 'زرد' }, { c: '#FFE6CC', name: 'نارنجی' }, { c: '#D6F5DF', name: 'سبز' },
  { c: '#DCEBFF', name: 'آبی' }, { c: '#FDE1EC', name: 'صورتی' }, { c: '#ECECF0', name: 'خاکستری' },
];

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const OPEN = /^<span\s+style\s*=\s*(["'])([^"']*)\1\s*>$/i;
const CLOSE = /^<\/span\s*>$/i;
const SPAN_ANY = /^<span[\s>]/i;

/** "color:#abc; background:#fff" → { color, bg } or null when the style holds anything else */
export function parseStyle(style) {
  let color = null, bg = null;
  for (const part of style.split(';')) {
    if (!part.trim()) continue;
    const m = part.match(/^\s*(color|background|background-color)\s*:\s*(#[0-9a-f]{3,6})\s*$/i);
    if (!m || !HEX.test(m[2])) return null;
    if (m[1].toLowerCase() === 'color') color = m[2].toUpperCase(); else bg = m[2].toUpperCase();
  }
  return color || bg ? { color, bg } : null;
}
export const styleOf = ({ color, bg }) => [color && `color:${color}`, bg && `background:${bg}`].filter(Boolean).join(';');

// ---- Markdown → tree: merge <span style="…"> … </span> (separate inline-HTML nodes) into one node ----
function mergeSpans(node) {
  if (!node.children) return;
  for (const c of node.children) mergeSpans(c);
  const kids = node.children;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (k.type !== 'html') continue;
    const m = String(k.value).match(OPEN);
    const attrs = m && parseStyle(m[2]);
    if (!attrs) continue;
    let depth = 0, end = -1;
    for (let j = i + 1; j < kids.length; j++) {
      const v = kids[j].type === 'html' ? String(kids[j].value) : '';
      if (SPAN_ANY.test(v)) depth++;
      else if (CLOSE.test(v)) { if (!depth) { end = j; break; } depth--; }
    }
    if (end < 0) continue;
    const inner = kids.slice(i + 1, end);
    const merged = { type: 'textColor', color: attrs.color, bg: attrs.bg, children: inner };
    mergeSpans(merged);
    kids.splice(i, end - i + 1, merged);
  }
}

// ---- tree → Markdown: write the node back as a span ----
function textColorHandler(node, _parent, state, info) {
  const tracker = state.createTracker(info);
  const open = `<span style="${styleOf(node)}">`;
  let value = tracker.move(open);
  value += tracker.move(state.containerPhrasing(node, { before: value, after: '<', ...tracker.current() }));
  value += tracker.move('</span>');
  return value;
}

export const textColorRemark = $remark('nvTextColor', () => function nvTextColor() {
  const data = this.data();
  (data.toMarkdownExtensions || (data.toMarkdownExtensions = [])).push({ handlers: { textColor: textColorHandler } });
  return (tree) => { mergeSpans(tree); };
});

export const textColorSchema = $markSchema('textColor', () => ({
  attrs: { color: { default: null }, bg: { default: null } },
  inclusive: false,
  parseDOM: [{
    tag: 'span[style]',
    getAttrs: (dom) => {
      const c = dom.style.color, b = dom.style.backgroundColor;
      if (!c && !b) return false;
      const hex = (v) => {
        if (!v) return null;
        if (v.startsWith('#')) return v.toUpperCase();
        const m = v.match(/\d+/g);
        return m && m.length >= 3 ? '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
      };
      // only colours from Fedo's own spans; pasted web pages keep their text but not their styling
      if (!dom.hasAttribute('data-nv-color')) return false;
      return { color: hex(c), bg: hex(b) };
    },
  }],
  // data-c / data-bg let dark themes show each palette colour's dark twin (the browser rewrites the style text)
  toDOM: (mark) => ['span', { 'data-nv-color': '', class: 'nv-color' + (mark.attrs.bg ? ' has-bg' : ''), 'data-c': mark.attrs.color || undefined, 'data-bg': mark.attrs.bg || undefined, style: styleOf(mark.attrs) }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'textColor',
    runner: (state, node, markType) => {
      state.openMark(markType, { color: node.color || null, bg: node.bg || null });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textColor',
    runner: (state, mark) => { state.withMark(mark, 'textColor', undefined, { color: mark.attrs.color, bg: mark.attrs.bg }); },
  },
}));

/**
 * Set or clear colours on the selection. attrs: { color?, bg? }; a key set to null removes that part,
 * a missing key keeps what is already there. { clear: true } removes both.
 */
export const setTextColorCommand = $command('NvSetTextColor', (ctx) => (attrs = {}) => (state, dispatch) => {
  const type = textColorSchema.type(ctx);
  const { from, to, empty } = state.selection;
  if (empty) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  // walk the selection so every run keeps the half (text or background) that is not being changed
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const a = Math.max(from, pos), b = Math.min(to, pos + node.nodeSize);
    const cur = type.isInSet(node.marks);
    const next = attrs.clear ? { color: null, bg: null } : {
      color: 'color' in attrs ? attrs.color : cur ? cur.attrs.color : null,
      bg: 'bg' in attrs ? attrs.bg : cur ? cur.attrs.bg : null,
    };
    tr.removeMark(a, b, type);
    if (next.color || next.bg) tr.addMark(a, b, type.create(next));
  });
  dispatch(tr.scrollIntoView());
  return true;
});

/** colours on the selection (first text run), for the menu */
export function colorAt(state) {
  const { from, to } = state.selection;
  let found = null;
  state.doc.nodesBetween(from, Math.max(to, from + 1), (node) => {
    if (found || !node.isText) return;
    const m = node.marks.find((x) => x.type.name === 'textColor');
    found = m ? { color: m.attrs.color, bg: m.attrs.bg } : { color: null, bg: null };
  });
  return found || { color: null, bg: null };
}

export const textColorPlugins = [textColorRemark, textColorSchema, setTextColorCommand].flat();
