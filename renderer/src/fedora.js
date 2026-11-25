// Fedora: the AI assistant (name and icon can be changed by the user).
// - menu on the selection toolbar (and Ctrl+J): clean up, tone, shorter, longer, explain, or a free instruction
// - every change is shown as a word diff first (accept / reject / refine), unless the user turned that off
// - an accepted change is one undo step, a version «هوش مصنوعی» in the history, and a small marker beside
//   the text that stays after the file is closed (kept beside the version history, not in the file)
// - questions get an answer card (copy, insert below, follow-up questions) instead of a diff
// - an untitled tab with enough text gets name suggestions, offered when it is renamed
import { diffArrays } from 'diff';

/** word diff that works for Persian too (the library's word rule only knows Latin letters):
 *  words and the spaces between them are compared as whole tokens */
function wordDiff(a, b) {
  const tok = (s) => String(s).split(/(\s+)/).filter((x) => x !== '');
  const ta = tok(a); const tb = tok(b);
  if (ta.length + tb.length > 4000) return null;
  const parts = diffArrays(ta, tb, { maxEditLength: Math.max(60, Math.round((ta.length + tb.length) * 0.6)), timeout: 150 });
  if (!parts) return null;
  // mostly different (a translation, a full rewrite): word marks would only be noise
  const changed = parts.filter((p) => p.added || p.removed).reduce((n, p) => n + p.value.length, 0);
  if (changed > (ta.length + tb.length) * 0.85) return null;
  const out = [];
  for (const p of parts) {
    const value = p.value.join('');
    const last = out[out.length - 1];
    if (last && !!last.added === !!p.added && !!last.removed === !!p.removed) last.value += value;
    else out.push({ value, added: !!p.added, removed: !!p.removed });
  }
  // a removed word directly followed by its replacement reads better with the shared space outside
  return out;
}
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { closeHistory } from '@milkdown/kit/prose/history';
import { Slice } from '@milkdown/kit/prose/model';
import { el, ICON, modal, fa, relTime } from './ui.js';
import { getView, markdownOf, markdownOfNode, markdownOfDoc, parseMarkdown, dirOfText, setMarkdown } from './editor.js';
import { LANGS } from './translate.js';
import { t as tr, getLang, langDir, langLocale } from './i18n.js';
import GEMINI_LOGO from './ai-logos/gemini-color.svg?raw';
import CLAUDE_LOGO from './ai-logos/claude-color.svg?raw';
import OPENAI_LOGO from './ai-logos/openai.svg?raw';
import FEDORA_FACE from './chars/fedora-face.webp?url';
import FEDORA_FULL from './chars/fedora-full.webp?url';
// characters from games, films and series (Mikasa, 2B): bundled with the app, the folder is in the repository
const PERSONAL = import.meta.glob('./chars/personal/*.webp', { eager: true, query: '?url', import: 'default' });

// ---------- name and icon ----------
const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
export const AI_ICONS = [
  ['ai.icon.magicStar', 'M10.5 4l1.6 4.4L16.5 10l-4.4 1.6L10.5 16l-1.6-4.4L4.5 10l4.4-1.6zM17.5 14.5l.8 2.2l2.2.8l-2.2.8l-.8 2.2l-.8-2.2l-2.2-.8l2.2-.8z'],
  ['ai.icon.star', 'M12 3.5l2.6 5.3l5.9.9l-4.25 4.1l1 5.8L12 16.9l-5.25 2.7l1-5.8L3.5 9.7l5.9-.9z'],
  ['ai.icon.bulb', 'M9.5 18.5h5M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2v.5h5V16c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z'],
  ['ai.icon.feather', 'M5 19L15.5 8.5M19.5 4.5C13 4.5 7 9 7 17h4c5.5 0 8.5-6 8.5-12.5zM8.5 15.5h5'],
  ['ai.icon.moon', 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  ['ai.icon.robot', 'M12 4v3M7 7h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM9.5 12.5h.01M14.5 12.5h.01M9.5 16h5'],
  ['ai.icon.chat', 'M8 10.5h.01M12 10.5h.01M16 10.5h.01M4 7.5C4 5 5.5 4 8 4h8c2.5 0 4 1 4 3.5v5C20 15 18.5 16 16 16h-2.5L9 20v-4H8c-2.5 0-4-1-4-3.5z'],
  ['ai.icon.heart', 'M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z'],
];
const I = {
  clean: S('M5 19l9-9M14 4l1 2.5L17.5 7.5L15 8.5L14 11L13 8.5L10.5 7.5L13 6.5zM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6z'),
  tone: S('M8 17h8M4 7.5C4 5 5.5 4 8 4h8c2.5 0 4 1 4 3.5v5C20 15 18.5 16 16 16h-2.5L9 20v-4H8c-2.5 0-4-1-4-3.5z'),
  shorter: S('M4 8h16M4 12h10M4 16h6'),
  longer: S('M4 6h16M4 10h16M4 14h16M4 18h10'),
  explain: S('M12 17v.01M12 13.5c0-2 2.5-2 2.5-4a2.5 2.5 0 0 0-5 0M21.25 12a9.25 9.25 0 1 1-18.5 0a9.25 9.25 0 0 1 18.5 0z'),
  send: S('M15.83 8.17L10.11 13.96L3.6 9.89C2.67 9.3 2.86 7.89 3.92 7.58L19.37 3.05C20.34 2.77 21.23 3.67 20.95 4.64L16.37 20.09C16.06 21.14 14.65 21.33 14.07 20.4L10.11 13.96'),
  translate: S('M3 5.5h9M7.5 3.5v2M5 5.5c.9 3.2 3.2 5.8 6.5 7.3M10 5.5c-.9 3.2-3.2 5.8-6.5 7.3M12.5 20.5l4-9l4 9M13.8 17.5h5.4'),
  sub: S('M15.5 5l-7 7l7 7'),
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/></svg>',
  undo: S('M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11'),
  below: S('M12 5v11M7.5 11.5L12 16l4.5-4.5M5 20h14'),
  ext: S('M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10'),
};

let C = null; // the app's context, set by initFedora
const set = () => C.settings();
// ---------- the assistant's character: a face for small places, a full figure for big moments ----------
const pc = (n) => PERSONAL['./chars/personal/' + n + '.webp'];
export const CHARS = [
  { id: 'fedora', get name() { return tr('ai.defaultName'); }, face: FEDORA_FACE, full: FEDORA_FULL },
  pc('mikasa-face') ? { id: 'mikasa', get name() { return tr('ai.char.mikasa'); }, face: pc('mikasa-face'), full: pc('mikasa-full') || pc('mikasa-face') } : null,
  pc('2b-face') ? { id: '2b', name: '2B', face: pc('2b-face'), full: pc('2b-full') || pc('2b-face') } : null,
].filter(Boolean);
/** the chosen character; { id: 'plain' } is the simple icon (earlier versions: a picked or uploaded icon) */
export function charOf(st = set()) {
  let id = st.aiChar;
  if (!id) id = st.aiIconCustom ? 'own' : (st.aiIcon | 0) ? 'plain' : 'fedora';
  if (id === 'plain') return { id: 'plain' };
  if (id === 'own') {
    const face = st.aiCharFace || st.aiIconCustom;
    return face ? { id: 'own', name: '', face, full: st.aiCharFull || face, own: true } : { id: 'plain' };
  }
  return CHARS.find((c) => c.id === id) || CHARS[0];
}
export const aiName = (st = set()) => String(st.aiName || '').trim() || charOf(st).name || (charOf(st).own ? tr('ai.assistantGeneric') : tr('ai.defaultName'));
const imgHTML = (src, cls) => `<img class="${cls}" src="${src}" alt="" draggable="false">`;
/** the full figure (or the face when there is none, or the plain icon) */
export function fullHTML(st = set(), cls = '') {
  const c = charOf(st);
  return c.face ? imgHTML(c.full || c.face, 'fd-face ' + cls) : `<span class="fd-plainfig ${cls}">${aiIconHTML(st)}</span>`;
}
export function aiIconHTML(st = set()) {
  const ch = charOf(st);
  if (ch.face) return imgHTML(ch.face, 'fd-face');
  const d = (AI_ICONS[st.aiIcon | 0] || AI_ICONS[0])[1];
  return S(d);
}
/** the toolbar button: icon + name; the name is painted again when it changes */
export const toolbarIcon = () => `<span class="fd-tbi">${aiIconHTML()}</span>`;
export function paintBrand() {
  // the whole assistant can be switched off; its name beside the face is optional
  document.body.classList.toggle('no-ai', !aiOn());
  document.body.classList.toggle('ai-noname', set().aiShowName === false);
  document.querySelectorAll('.fd-tbi').forEach((n) => { n.innerHTML = aiIconHTML(); });
  document.querySelectorAll('.fd-tbn, #btn-fedora .nm').forEach((n) => { n.textContent = aiName(); });
  document.querySelectorAll('#btn-fedora .ic').forEach((n) => { n.innerHTML = aiIconHTML(); });
  document.querySelectorAll('.fd-work-tx').forEach((n) => { if (n.dataset.kind) n.textContent = workText(n.dataset.kind); });
  document.querySelectorAll('.fd-workfig').forEach((n) => { n.innerHTML = fullHTML(set(), 'fd-bob'); });
  document.querySelectorAll('[data-toolbar-item="nv-ai"]').forEach((n) => { n.setAttribute('aria-label', aiName()); n.title = `${aiName()} (Ctrl+J)`; });
}
// ---------- "{name} is ...ing": one shape for every job that is running ----------
const WORK_KEY = { rewrite: 'ai.working.rewrite', summary: 'ai.working.summary', translate: 'ai.working.translate', explain: 'ai.working.explain', think: 'ai.working.think', prompt: 'ai.working.prompt' };
export const workText = (kind) => tr(WORK_KEY[kind] || WORK_KEY.think, { name: aiName() });
const dots = () => el('span', { class: 'fd-dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'));
/** the full figure, bobbing, inside a pulsing ring */
const workFig = (size = 44) => el('span', { class: 'fd-wring', style: `width:${size}px;height:${size}px` }, el('span', { class: 'fd-workfig', html: fullHTML(set(), 'fd-bob') }));
const workLine = (kind) => [el('span', { class: 'fd-work-tx', 'data-kind': kind }, workText(kind)), dots()];
/** the floating «in progress» bar at the bottom centre of a tab; returns a function that removes it */
function startWork(t, kind, stop) {
  if (!t || !t.pane) return () => {};
  const bar = el('div', { class: 'fd-workbar', role: 'status', 'aria-live': 'polite' }, workFig(44), ...workLine(kind),
    el('button', { class: 'fd-btn sm', onclick: () => stop && stop() }, tr('common.stop')));
  floatBox(t).append(bar);
  return () => bar.remove();
}
/** the short model name for the chat header */
const modelShort = () => {
  const m = String(cfgOf().model || '').replace(/^models\//, '');
  return m.replace(/^gemini-/, 'Gemini ').replace(/-latest$/, '').replace(/-/g, ' ').replace(/\b(\w)/g, (x) => x.toUpperCase());
};
/** the head of a chat card: face, name and what it is doing; a click opens the quick character switch */
function charHead(sub, onSwitched) {
  const b = el('button', { class: 'fd-chd', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': tr('ai.char.switchLabel') },
    el('span', { class: 'fc', html: aiIconHTML() }),
    el('span', { class: 'tx' }, el('b', {}, aiName()), el('small', {}, [sub, modelShort()].filter(Boolean).join(' · '))),
    CHARS.length + (charOf().own ? 1 : 0) > 1 ? el('span', { class: 'cv', html: ICON.chevDown }) : null);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (CHARS.length + (charOf().own ? 1 : 0) < 2) return;
    const old = b.parentNode.querySelector('.fd-chmenu');
    if (old) { old.remove(); b.setAttribute('aria-expanded', 'false'); return; }
    const st = set();
    const list = [...CHARS];
    if (st.aiCharFace || st.aiIconCustom) list.push({ id: 'own', name: (st.aiChar === 'own' && st.aiName) || tr('ai.char.own'), face: st.aiCharFace || st.aiIconCustom });
    const curId = charOf().id;
    const menu = el('div', { class: 'fd-chmenu', role: 'menu', 'aria-label': tr('ai.char.title') },
      list.map((c) => el('button', { class: 'mi' + (c.id === curId ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(c.id === curId),
        onclick: () => { pickChar(c.id); menu.remove(); onSwitched && onSwitched(); } },
        el('span', { class: 'fc', html: imgHTML(c.face, 'fd-face') }), el('span', { class: 't' }, c.name), c.id === curId ? el('span', { class: 'ck', html: ICON.check }) : null)),
      el('div', { class: 'sep' }),
      el('div', { class: 'ft' }, el('span', {}, tr('ai.char.onlyLookChanges')), el('button', { class: 'fd-link', onclick: () => { closeFedora(); openCharSettings(); } }, tr('ai.char.manage'))));
    b.after(menu);
    b.setAttribute('aria-expanded', 'true');
    const off = (ev) => { if (!menu.contains(ev.target) && ev.target !== b) { menu.remove(); b.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', off, true); } };
    document.addEventListener('mousedown', off, true);
  });
  return b;
}
/** choosing a character also takes its name (the name stays editable in the settings) */
export function pickChar(id) {
  const c = CHARS.find((x) => x.id === id);
  const st = set();
  const patch = { aiChar: id };
  if (c) patch.aiName = c.name;
  else if (id === 'own') patch.aiName = st.aiCharName || '';
  else if (id === 'plain') patch.aiName = tr('ai.defaultName');
  C.updateSettings(patch);
  paintBrand();
}
function openCharSettings() {
  wantSub = 'id';
  C.openSettings('ai');
  setTimeout(() => { const w = document.querySelector('.fd-set'); if (w && w._show && wantSub) w._show('id'); wantSub = null; }, 30);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- service config ----------
const OPENAI_URL = 'https://api.openai.com/v1';
export const GEMINI_DEFAULT = { model: 'gemini-flash-latest', fallback: 'gemini-flash-lite-latest' };
export function cfgOf(st = set()) {
  const oai = st.aiProvider === 'oai';
  if (st.aiProvider === 'anthropic') {
    return { provider: 'anthropic', baseUrl: '', model: String(st.aiClaudeModel || '').trim(), fallback: String(st.aiClaudeFallback || '').trim(), extra: [] };
  }
  // OpenAI itself: the OpenAI-compatible path with its own address, key and models
  if (st.aiProvider === 'openai') {
    return { provider: 'oai', baseUrl: OPENAI_URL, model: String(st.aiOpenaiModel || '').trim(), fallback: String(st.aiOpenaiFallback || '').trim(), extra: [] };
  }
  return {
    provider: oai ? 'oai' : 'gemini',
    baseUrl: oai ? String(st.aiBaseUrl || '').trim() : '',
    model: oai ? String(st.aiOaiModel || '').trim() : (st.aiModel || GEMINI_DEFAULT.model),
    fallback: oai ? String(st.aiOaiFallback || '').trim() : (st.aiFallback === '' ? '' : (st.aiFallback || GEMINI_DEFAULT.fallback)),
    // when both are busy, Gemini's lighter models usually still answer
    extra: oai ? [] : ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  };
}

// ---------- running a job ----------
let jobSeq = 0;
const live = new Map(); // id -> { onDelta, resolve }
let listening = false;
/**
 * Streams one reply. onDelta(text so far). Resolves { text, model, fallback } or rejects with { kind, ... }.
 * Returns { promise, cancel }.
 */
/** an image address in a reply that was not in what was sent becomes a plain link: the picture would be
 *  fetched from that server the moment it is shown, and the address could carry text from the document */
function safeImages(text, sent) {
  const ok = (u) => !/^(https?:)?\/\//i.test(u) || sent.includes(u);
  const imgWord = tr('editor.slash.image');
  return String(text)
    .replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?([^)]*)\)/g, (m, alt, u) => (ok(u) ? m : `[${alt || imgWord}](${u})`))
    .replace(/<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/gi, (m, u) => (ok(u) ? m : `[${imgWord}](${u})`));
}

export function runJob(job, onDelta) {
  const sent = [job.system || '', ...(job.messages || []).map((m) => m.text || '')].join('\n');
  if (onDelta) { const raw = onDelta; onDelta = (txt) => raw(safeImages(txt, sent)); }
  if (!listening) {
    listening = true;
    C.api.onAiChunk((id, msg) => {
      const j = live.get(id);
      if (!j) return;
      if (msg.delta) { j.text += msg.delta; j.onDelta && j.onDelta(j.text); return; }
      live.delete(id);
      if (msg.done) j.resolve({ text: safeImages(msg.text || '', j.sent), model: msg.model, fallback: msg.fallback });
      else if (msg.cancelled) j.reject({ kind: 'cancelled' });
      else j.reject(msg.error || { kind: 'offline' });
    });
  }
  const id = 'j' + Date.now().toString(36) + (++jobSeq);
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  live.set(id, { text: '', sent, onDelta, resolve, reject });
  if (!cfgOf().model) { live.delete(id); setTimeout(() => reject({ kind: 'nomodel' }), 0); return { promise, cancel: () => {} }; }
  C.api.aiRun(id, cfgOf(), job).catch((e) => { live.delete(id); reject({ kind: 'offline', message: String(e) }); });
  return { promise, cancel: () => C.api.aiCancel(id) };
}

/** localized text for an error; actions: [{ label, run }] */
function errorText(e, retry) {
  const st = set();
  const gem = cfgOf(st).provider === 'gemini';
  const goSet = { label: tr('settings.title'), run: () => C.openSettings('ai') };
  const retryAct = { label: tr('common.tryAgain'), run: retry };
  const changeProv = { label: tr('ai.err.changeProvider'), run: () => C.openSettings('ai') };
  switch (e && e.kind) {
    case 'nokey': return [tr('ai.err.nokeyTitle'), tr('ai.err.nokeyText'), [goSet]];
    case 'badkey': return [tr('ai.err.badkeyTitle'), gem ? tr('ai.err.badkeyGemini') : tr('ai.err.badkeyOther'), [goSet]];
    case 'region': return [gem ? tr('ai.err.regionGemini') : tr('ai.err.regionOther'), tr('ai.err.regionText'), [retryAct, changeProv]];
    case 'quota': return e.day
      ? [tr('ai.err.quotaDayTitle'), tr('ai.err.quotaDayText'), [goSet]]
      : [tr('ai.err.quotaMinTitle'), e.retry ? tr('ai.err.quotaMinRetry', { n: fa(e.retry) }) : tr('ai.err.quotaMinText'), [retryAct]];
    case 'notfree': return [tr('ai.err.notfreeTitle'), tr('ai.err.notfreeText'), [goSet]];
    case 'busy': return [tr('ai.err.busyTitle'), tr('ai.err.busyText'), [retryAct]];
    case 'nomodel': return [tr('ai.err.nomodelTitle'), tr('ai.err.nomodelText'), [goSet]];
    case 'model': return [tr('ai.err.modelTitle'), tr('ai.err.modelText'), [goSet]];
    case 'blocked': return e.input
      ? [gem ? tr('ai.err.blockedInGemini') : tr('ai.err.blockedInOther'), tr('ai.err.blockedInText'), [retryAct, changeProv]]
      : [tr('ai.err.blockedOutTitle'), tr('ai.err.blockedOutText'), [retryAct]];
    case 'url': return [tr('ai.err.urlTitle'), tr('ai.err.urlText'), [goSet]];
    case 'timeout': return [tr('ai.err.timeoutTitle'), tr('ai.err.timeoutText'), [retryAct]];
    default: return [tr('ai.err.offlineTitle'), tr('translate.connErrHint'), [retryAct]];
  }
}

// ---------- prompts ----------
const TONES = [
  ['formal', 'ai.tone.formal', 'ai.tone.formalDesc', 'formal (as in official letters and reports)'],
  ['admin', 'ai.tone.admin', 'ai.tone.adminDesc', 'administrative, as used in official organisational correspondence'],
  ['friendly', 'ai.tone.friendly', 'ai.tone.friendlyDesc', 'warm, friendly and casual'],
  ['polite', 'ai.tone.polite', 'ai.tone.politeDesc', 'polite and concise, like a short work message'],
  ['academic', 'ai.tone.academic', 'ai.tone.academicDesc', 'academic and precise'],
];
const LEVELS = [['simple', 'ai.level.simple'], ['medium', 'ai.level.medium'], ['expert', 'ai.level.expert']];
const LEVEL_EN = { simple: 'simple: everyday words, no jargon, as if to a curious teenager', medium: 'medium: clear, with the key terms briefly explained', expert: 'expert: precise terminology for a specialist reader' };

function langRule() {
  const l = set().aiLang || 'same';
  return l === 'fa' ? 'Write the answer in Persian.' : l === 'en' ? 'Write the answer in English.' : 'Write the answer in the same language as the user’s text.';
}
function editSystem() {
  return [
    `You are «${aiName()}», a writing assistant inside Fedo, a Markdown editor.`,
    'You get a piece of a Markdown document and an instruction.',
    'Reply with ONLY the new Markdown that replaces the piece: no explanation, no preface, no quotes, no code fences around it.',
    'Keep the language of the text (Persian stays Persian) unless the instruction asks for another language.',
    'Keep the Markdown formatting (bold, italic, links, lists, headings, inline code, tables) and everything the instruction does not touch.',
    'For Persian use standard orthography: half-spaces (ZWNJ) where they belong, Persian punctuation, Persian quotation marks only if the text already uses them.',
  ].join('\n');
}
function answerSystem(level, example) {
  return [
    `You are «${aiName()}», an assistant inside Fedo, a Markdown editor. The user selected part of a document.`,
    langRule(),
    'Use light Markdown: short paragraphs, bullet lists when they help, **bold** for key terms. No tables, no headings except the example heading below.',
    level ? `Explanation level: ${LEVEL_EN[level]}.` : '',
    example ? 'End with a line that is exactly "### مثال" (or "### Example" in English), followed by one short, concrete, everyday example.' : '',
    'Be concise. Do not repeat the question.',
  ].filter(Boolean).join('\n');
}
const FREE_SYSTEM_TAIL = [
  'The user gives a free instruction about the selected text.',
  'If it asks to change the text (rewrite, fix, translate, format, shorten, …) reply with a first line that is exactly [[EDIT]] and then ONLY the new Markdown.',
  'If it is a question or asks for information or an explanation, reply with a first line that is exactly [[ANSWER]] and then the answer in light Markdown.',
].join('\n');

const ACTIONS = {
  clean: { kind: 'rewrite', get label() { return tr('ai.action.clean'); }, instr: 'Fix typos, spelling, spacing, punctuation and half-spaces only. Keep every word, number and digit style exactly as written (do not turn words into digits or the other way round), and do not change the tone or meaning.' },
  shorter: { kind: 'rewrite', get label() { return tr('ai.action.shorter'); }, instr: 'Make it clearly shorter (about half) while keeping the key points and facts.' },
  longer: { kind: 'rewrite', get label() { return tr('ai.action.longer'); }, instr: 'Expand it with a little more detail and smoother flow, without inventing facts.' },
};
const toneAction = (t) => ({ kind: 'rewrite', label: tr('ai.tone.actionLabel', { tone: tr(t[1]) }), instr: `Rewrite it in a ${t[3]} tone. Keep the meaning and every fact.` });

// ---------- the document side ----------
/** the range to work on: the selection, widened to whole blocks when it crosses blocks */
function rangeOf(view) {
  const { from, to, empty } = view.state.selection;
  if (empty) return null;
  const doc = view.state.doc;
  const $a = doc.resolve(from);
  const $b = doc.resolve(to);
  if ($a.parent === $b.parent && $a.parent.isTextblock) {
    if ($a.parent.type.spec.code) return { code: true };
    return { from, to, inline: true };
  }
  const a = $a.depth >= 1 ? $a.before(1) : from;
  const b = $b.depth >= 1 ? $b.after(1) : to;
  return { from: a, to: b, inline: false };
}
const plainOfDoc = (doc) => doc.textBetween(0, doc.content.size, '\n', ' ').replace(/\n{3,}/g, '\n\n').trim();
const plainOfMd = (t, md) => { try { return plainOfDoc(parseMarkdown(t.crepe, md)); } catch { return md; } };
const cleanReply = (s) => {
  let x = String(s || '').replace(/^\s*\[\[(EDIT|ANSWER)\]\]\s*\n?/, '');
  // a reply wrapped in a code fence by mistake
  const m = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(x);
  if (m) x = m[1];
  return x.trim();
};

/** replace the range with Markdown; returns the new { from, to } */
function replaceRange(t, r, md, tr0) {
  const view = getView(t.crepe);
  const { state } = view;
  const doc = parseMarkdown(t.crepe, md);
  const tr = tr0 || state.tr;
  const P = state.schema.nodes.paragraph;
  let from = r.from;
  let to;
  if (r.inline && doc.childCount === 1 && doc.firstChild.type === P) {
    tr.replaceWith(r.from, r.to, doc.firstChild.content);
    to = r.from + doc.firstChild.content.size;
  } else if (r.inline) {
    // one sentence became several paragraphs: split the paragraph around it, the text before and after stays
    const n = tr.steps.length;
    tr.replace(r.from, r.to, new Slice(doc.content, 1, 1));
    to = tr.mapping.slice(n).map(r.to, 1);
  } else {
    tr.replaceWith(r.from, r.to, doc.content);
    to = r.from + doc.content.size;
  }
  return { tr, from, to };
}

// ---------- change markers ----------
const markKey = new PluginKey('nv-ai-marks');
export const marksPlugin = $prose(() => new Plugin({
  key: markKey,
  state: {
    init: () => ({ marks: [], focus: null, parked: [], sel: null }),
    apply(tr, prev) {
      const meta = tr.getMeta(markKey);
      let marks = prev.marks;
      let focus = prev.focus;
      let parked = prev.parked || [];
      let sel = prev.sel;
      if (sel && tr.docChanged) { const a = tr.mapping.map(sel.from, 1); const b = tr.mapping.map(sel.to, -1); sel = b > a ? { from: a, to: b } : null; }
      if (tr.docChanged && (marks.length || parked.length)) {
        const mapIt = (m) => ({ ...m, from: tr.mapping.map(m.from, 1), to: tr.mapping.map(m.to, -1) });
        const textAt = (m) => { try { return tr.doc.textBetween(m.from, m.to, '\n', ' ').trim(); } catch { return null; } };
        // undo puts the old text back: the marker steps aside, and comes back on redo
        const live = [];
        const park = [];
        for (const m of marks.map(mapIt)) {
          const txt = m.to > m.from ? textAt(m) : '';
          if ((txt === String(m.beforeText || '').trim() && txt !== String(m.afterText || '').trim()) || m.to <= m.from) park.push(m);
          else live.push(m);
        }
        // only an undo / redo brings a parked marker back, found again by its text
        const isHist = !!tr.getMeta('history$');
        for (const m of parked) {
          const r = isHist ? locate(tr.doc, m) : null;
          if (r) live.push({ ...m, ...r });
          else park.push(mapIt(m));
        }
        marks = live;
        parked = park.slice(-20);
      }
      if (meta) {
        if (meta.add) marks = [...marks, meta.add];
        if (meta.remove) marks = marks.filter((m) => m.id !== meta.remove);
        if (meta.set) { marks = meta.set; parked = []; }
        if ('focus' in meta) focus = meta.focus;
        if ('sel' in meta) sel = meta.sel;
      }
      if (focus && !marks.some((m) => m.id === focus)) focus = null;
      return marks === prev.marks && focus === prev.focus && parked === prev.parked && sel === prev.sel ? prev : { marks, focus, parked, sel };
    },
  },
  props: {
    decorations(state) {
      const { marks: all, focus, sel } = markKey.getState(state);
      const doc = state.doc;
      const decos = [];
      if (sel && sel.to <= doc.content.size) decos.push(Decoration.inline(sel.from, sel.to, { class: 'fd-selhl' }));
      const marks = set().aiMarks === false ? [] : all;
      if (!marks.length) return decos.length ? DecorationSet.create(doc, decos) : null;
      const byBlock = new Map();
      for (const m of marks) {
        if (m.from > doc.content.size) continue;
        const $p = doc.resolve(Math.min(m.from, doc.content.size));
        // a mark over whole blocks starts on the boundary before its first block
        let at = $p.depth >= 1 ? $p.before(1) : Math.min(m.from, doc.content.size);
        // inside the block's first line of text, so the marker lines up with the text, not the margin
        const top = doc.nodeAt(at);
        if (top && top.isTextblock) at += 1;
        else if (top) { let inner = null; top.descendants((n, pos) => { if (inner === null && n.isTextblock) inner = at + 1 + pos + 1; return inner === null; }); if (inner !== null) at = inner; }
        if (!byBlock.has(at)) byBlock.set(at, []);
        byBlock.get(at).push(m);
      }
      for (const [at, list] of byBlock) {
        const ids = list.map((m) => m.id).join(',');
        // the text block holding the marker becomes its positioning box, so the marker sits just outside the text
        const $in = doc.resolve(at);
        if ($in.parent.isTextblock && $in.depth >= 1) decos.push(Decoration.node($in.before(), $in.after(), { class: 'fd-rel' }));
        decos.push(Decoration.widget(at, () => {
          const b = el('button', { class: 'fd-mk', contenteditable: 'false', title: tr('ai.marks.countTip', { n: fa(list.length), name: aiName() }), 'aria-label': tr('ai.marks.countAria', { n: fa(list.length), name: aiName() }), 'data-ids': ids, html: aiIconHTML() });
          if (list.length > 1) b.append(el('span', { class: 'n' }, fa(list.length)));
          return el('span', { class: 'fd-gut', contenteditable: 'false' }, b);
        }, { side: -1, key: 'fd' + at + ':' + ids + ':' + set().aiIcon + charOf().id + (charOf().face || '').length + aiName(), ignoreSelection: true, stopEvent: () => true }));
      }
      const f = marks.find((m) => m.id === focus);
      if (f) decos.push(Decoration.inline(f.from, f.to, { class: 'fd-hl' }));
      return DecorationSet.create(doc, decos);
    },
  },
}));
const marksOf = (t) => (t && t.crepe ? (markKey.getState(getView(t.crepe).state) || { marks: [] }).marks : []);
const focusMark = (t, id) => { const v = getView(t.crepe); v.dispatch(v.state.tr.setMeta(markKey, { focus: id })); };
const currentText = (t, m) => { try { return getView(t.crepe).state.doc.textBetween(m.from, m.to, '\n', ' ').trim(); } catch { return ''; } };
const editedSince = (t, m) => currentText(t, m) !== String(m.afterText || '').trim();

/** what is stored for a file (positions are found again by text when it opens) */
const storable = (m) => ({ id: m.id, time: m.time, cmd: m.cmd, scope: m.scope, inline: m.inline, beforeMd: m.beforeMd, afterMd: m.afterMd, beforeText: m.beforeText, afterText: m.afterText, hist: m.hist || null });
export function persistMarks(t) {
  if (!t || !t.path) return;
  C.api.aiMarksSave(t.path, marksOf(t).map(storable)).catch(() => {});
}
/** opening a file: put its markers back where their text still is; drop the ones whose text is gone */
export async function loadMarks(t) {
  if (!t || !t.path || !t.crepe) return;
  const list = await C.api.aiMarksLoad(t.path).catch(() => []);
  if (!list || !list.length) return;
  const view = getView(t.crepe);
  const doc = view.state.doc;
  const found = [];
  for (const m of list) {
    const r = locate(doc, m);
    if (r) found.push({ ...m, ...r });
  }
  view.dispatch(view.state.tr.setMeta(markKey, { set: found }).setMeta('addToHistory', false));
  if (found.length !== list.length) persistMarks(t);
  C.marksChanged(t);
}
function locate(doc, m) {
  const text = String(m.afterText || '').trim();
  if (!text) return null;
  if (m.inline) {
    let hit = null;
    doc.descendants((node, pos) => {
      if (hit || !node.isTextblock) return !hit;
      const s = node.textContent;
      const i = s.indexOf(text);
      if (i < 0) return false;
      // text offset → document position inside this block
      let off = 0; let a = null; let b = null;
      node.forEach((child, cpos) => {
        const len = child.isText ? child.text.length : (child.textContent || '').length;
        if (a === null && i < off + len) a = pos + 1 + cpos + (i - off);
        if (b === null && i + text.length <= off + len) b = pos + 1 + cpos + (i + text.length - off);
        off += len;
      });
      if (a !== null && b !== null) hit = { from: a, to: b };
      return false;
    });
    return hit;
  }
  const first = text.split('\n')[0].trim();
  const nBlocks = Math.max(1, String(m.afterMd || '').split(/\n\s*\n/).filter((x) => x.trim()).length);
  let start = null; let idx = -1;
  doc.forEach((node, pos, i) => { if (start === null && node.textContent.trim().startsWith(first)) { start = pos; idx = i; } });
  if (start === null) return null;
  let end = start;
  for (let i = idx; i < Math.min(doc.childCount, idx + nBlocks); i++) end += doc.child(i).nodeSize;
  return { from: start, to: end };
}

// ---------- shared card bits ----------
let openCard = null; // { close() }
export function closeFedora() { if (openCard) { const c = openCard; openCard = null; c.close(); } }
export const fedoraOpen = () => !!openCard;

function placeUnder(box, view, from, to) {
  let r;
  try {
    const a = view.coordsAtPos(from);
    const b = view.coordsAtPos(to, -1);
    r = { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), right: Math.max(a.right, b.right, a.left) };
  } catch { return; }
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  let top = r.bottom + 10;
  if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 58);
  const right = Math.min(Math.max(10, innerWidth - r.right - 8), innerWidth - w - 10);
  box.style.top = top + 'px';
  box.style.right = right + 'px';
}
/** a card that follows the selection and closes on outside click / Esc */
function card(cls, label, t, range, onEsc) {
  closeFedora();
  const view = getView(t.crepe);
  if (!range.doc) { try { view.dispatch(view.state.tr.setMeta(markKey, { sel: { from: range.from, to: range.to } }).setMeta('addToHistory', false)); } catch {} }
  const box = el('div', { class: 'fd-card ' + cls, dir: langDir(), role: 'dialog', 'aria-label': label });
  document.body.append(box);
  document.body.classList.add('fd-open');
  // a card for the whole document hangs under its button; one for a selection follows the text
  const place = () => {
    if (!range.anchor) { placeUnder(box, view, range.from, range.to); return; }
    const r = range.anchor.getBoundingClientRect();
    const w = box.offsetWidth;
    box.style.top = r.bottom + 6 + 'px';
    box.style.left = Math.max(10, Math.min(r.left, innerWidth - w - 10)) + 'px';
    box.style.right = 'auto';
  };
  const onDown = (e) => {
    if (box.contains(e.target) || e.target.closest('.overlay, .toast')) return;
    if (e.target.closest('[data-toolbar-item="nv-ai"], #btn-fedora')) return;
    closeFedora();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (onEsc && onEsc() === false) return;
    closeFedora(); view.focus();
  };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
  const self = {
    box, place, view,
    onClose: null,
    close: () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      if (self.onClose) self.onClose();
      box.remove();
      try { if (!openCard || openCard.view !== view) view.dispatch(view.state.tr.setMeta(markKey, { sel: null }).setMeta('addToHistory', false)); } catch {}
      if (!openCard) document.body.classList.remove('fd-open');
      document.querySelectorAll('[data-toolbar-item="nv-ai"].open, #btn-fedora.open').forEach((n) => n.classList.remove('open'));
    },
  };
  openCard = self;
  return self;
}
const brandHead = (extra) => el('div', { class: 'fd-head' }, el('b', { class: 'fd-brand' }, el('span', { class: 'ic', html: aiIconHTML() }), el('span', { class: 'nm' }, aiName())), extra || null);
const errBox = (e, retry) => {
  const [title, text, acts] = errorText(e, retry);
  const detail = e && e.message && /model|http|blocked|notfree/.test(e.kind || '') ? String(e.message).replace(/^prompt:/, '').slice(0, 180) : '';
  return el('div', { class: 'fd-err', role: 'alert' }, el('span', { class: 'ic', html: ICON.warn }),
    el('span', { class: 'tx' }, el('b', {}, title), el('small', {}, text), detail ? el('code', { class: 'fd-detail', dir: 'ltr' }, detail) : null,
      acts.length ? el('span', { class: 'fd-err-acts' }, acts.map((a) => el('button', { class: 'fd-btn', onclick: a.run }, a.label))) : null));
};
const kb = (...keys) => el('span', { class: 'fd-kb' }, keys.map((k) => el('kbd', {}, k)));

// ---------- the first time: what is sent, and to whom ----------
async function noticeOk() {
  const st = set();
  if (st.aiNoticeOk) return true;
  const gem = cfgOf(st).provider === 'gemini';
  const ok = await modal({
    title: tr('ai.notice.title', { name: aiName() }),
    text: tr('ai.notice.prefix') + ' ' + (gem ? tr('ai.notice.gemini') : tr('ai.notice.other')),
    buttons: [{ label: tr('common.cancel'), value: false }, { label: tr('ai.notice.ok'), value: true, primary: true }],
  });
  if (ok) C.updateSettings({ aiNoticeOk: true });
  return !!ok;
}

// ---------- the menu (selection toolbar / Ctrl+J) ----------
export const aiOn = (st = set()) => st.aiEnabled !== false;
function scopeSeg(t, which, anchor) {
  const v = getView(t.crepe);
  const r = rangeOf(v);
  const hasSel = !!(r && !r.code);
  const words = hasSel ? v.state.doc.textBetween(r.from, r.to, ' ', ' ').split(/\s+/).filter(Boolean).length : 0;
  const btn = (k, label, extra, dis) => el('button', { class: (k === which ? 'on' : '') + (dis ? ' dis' : ''), role: 'radio', 'aria-checked': String(k === which), 'aria-disabled': dis ? 'true' : null,
    onclick: () => {
      if (dis || k === which) return;
      const a = anchor || document.getElementById('btn-fedora');
      closeFedora();
      if (k === 'sel') openFedora(t, a, { atButton: true }); else openDocFedora(t, a);
    } }, label, extra || null);
  return [
    el('div', { class: 'fd-scope', role: 'radiogroup', 'aria-label': tr('ai.scope.aria', { name: aiName() }) },
      btn('sel', tr('ai.scope.selection'), hasSel ? el('small', {}, tr('status.words', { n: fa(words) })) : null, !hasSel),
      btn('doc', tr('ai.scope.wholeDoc'))),
    hasSel ? null : el('div', { class: 'fd-scope-hint' }, tr('ai.scope.hint')),
  ];
}
/** the button at the top of the window: the selected text when there is one, otherwise the whole document */
export function openTopFedora(t, anchor) {
  if (!t || !t.crepe || !aiOn()) return;
  if (openCard && openCard.anchor === anchor) { closeFedora(); return; }
  const r = t.mode !== 'source' ? rangeOf(getView(t.crepe)) : null;
  if (r && !r.code) openFedora(t, anchor, { atButton: true }); else openDocFedora(t, anchor);
}
export async function openFedora(t, anchor = null, opts = {}) {
  if (!t || !t.crepe || !aiOn()) return;
  if (openCard && openCard.anchor && openCard.anchor === anchor && !opts.atButton) { closeFedora(); return; }
  if (t.mode === 'source') { C.toast(tr('ai.toast.noSource', { name: aiName() }), 'info'); return; }
  const view = getView(t.crepe);
  const range = rangeOf(view);
  if (!range) { C.toast(tr('toast.selectTextFirst'), 'info'); return; }
  if (range.code) { C.toast(tr('ai.toast.noCode', { name: aiName() }), 'info'); return; }
  const info = await C.api.aiKeyInfo(cfgOf()).catch(() => ({ has: false }));
  // opened from the top button, the menu sits under it; the work itself still happens at the selection
  const c = card('fd-menu', aiName(), t, opts.atButton && anchor ? { ...range, anchor } : range);
  c.anchor = anchor;
  if (anchor) anchor.classList.add('open');

  if (!info.has) {
    const gem = cfgOf().provider === 'gemini';
    c.box.classList.add('fd-nokey');
    c.box.append(
      el('div', { class: 'fd-nk-h' }, el('span', { class: 'ic', html: aiIconHTML() }), el('b', {}, tr('ai.nokey.title', { name: aiName() }))),
      el('p', {}, tr('ai.nokey.body')),
      el('div', { class: 'fd-foot end' },
        gem ? el('button', { class: 'fd-btn', onclick: () => C.api.openUrl('https://aistudio.google.com/apikey') }, tr('ai.getFreeKey')) : null,
        el('button', { class: 'fd-btn primary', onclick: () => { closeFedora(); C.openSettings('ai'); } }, tr('ai.goToSettings'))));
    c.place();
    return;
  }

  const input = el('input', { type: 'text', placeholder: tr('ai.menu.selPlaceholder'), 'aria-label': tr('ai.menu.selAria'), spellcheck: 'false' });
  const send = el('button', { class: 'fd-send', 'aria-label': tr('ai.send'), title: tr('ai.send'), html: I.send });
  const ask = el('label', { class: 'fd-ask' }, el('span', { class: 'ic', html: aiIconHTML() }), input, send);
  const go = (fn) => () => { fn(); };
  let sub = null;
  const closeSub = () => { if (sub) { sub.remove(); sub = null; } c.box.querySelectorAll('.fd-mi.on').forEach((n) => n.classList.remove('on')); };
  let hoverT = null;
  const item = (icon, label, run, hint, hasSub) => {
    const b = el('button', { class: 'fd-mi', role: 'menuitem', 'aria-haspopup': hasSub ? 'menu' : null }, el('span', { class: 'ic', html: icon }), el('span', { class: 't' }, label), hint ? el('small', {}, hint) : null, hasSub ? el('span', { class: 'ch', html: I.sub }) : null);
    b.addEventListener('click', () => run(b, true));
    // submenus open on hover too, after a short rest (passing over the item on the way does nothing)
    b.addEventListener('mouseenter', () => {
      clearTimeout(hoverT);
      if (!hasSub) { hoverT = setTimeout(closeSub, 120); return; }
      if (sub && sub._from === b) return;
      hoverT = setTimeout(() => { if (b.matches(':hover')) run(b, false); }, 160);
    });
    b.addEventListener('mouseleave', () => clearTimeout(hoverT));
    return b;
  };
  const openSub = (b, build, toggle) => {
    if (sub && sub._from === b) { if (toggle && sub._click) closeSub(); else if (toggle) sub._click = true; return; }
    closeSub();
    b.classList.add('on');
    sub = el('div', { class: 'fd-sub', role: 'menu' }, build());
    sub._from = b;
    sub._click = !!toggle;
    sub.addEventListener('mouseenter', () => clearTimeout(hoverT));
    c.box.append(sub);
    const br = b.getBoundingClientRect();
    const cr = c.box.getBoundingClientRect();
    sub.style.top = br.top - cr.top - 6 + 'px';
    // in RTL submenus open to the left; in LTR to the right (flip if no room)
    if (langDir() === 'ltr') {
      if (cr.right + sub.offsetWidth + 6 > innerWidth - 8) sub.style.right = 'calc(100% + 6px)';
      else sub.style.left = 'calc(100% + 6px)';
    } else if (cr.left - sub.offsetWidth - 6 < 8) sub.style.left = 'calc(100% + 6px)';
    else sub.style.right = 'calc(100% + 6px)';
  };
  const st = set();
  const doEdit = (a) => { closeFedora(); runEdit(t, range, a); };
  // translate: into Persian, or into English when the text already is Persian
  const selText = view.state.doc.textBetween(range.from, range.to, ' ', ' ');
  const toFa = !/[\u0600-\u06FF]/.test(selText);
  const trAction = { kind: 'translate', label: toFa ? tr('ai.action.translateToFa') : tr('ai.action.translateToEn'), instr: `Translate it into ${toFa ? 'Persian (natural, fluent Persian with correct half-spaces)' : 'English (natural, fluent English)'}. Keep the Markdown formatting. Reply with only the translation.` };
  const explainSub = (b, toggle) => openSub(b, () => {
      let level = st.aiLevel || 'simple';
      let example = st.aiExample !== false;
      const seg = el('div', { class: 'fd-lv', role: 'radiogroup', 'aria-label': tr('ai.explain.level') });
      const paint = () => seg.querySelectorAll('button').forEach((x) => { const on = x.dataset.v === level; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
      for (const [v, lk] of LEVELS) seg.append(el('button', { 'data-v': v, role: 'radio', onclick: () => { level = v; paint(); } }, tr(lk)));
      paint();
      const ck = el('button', { class: 'fd-ck' + (example ? ' on' : ''), role: 'checkbox', 'aria-checked': String(example) }, el('span', { class: 'bx', html: ICON.check }), tr('ai.explain.withExample'));
      ck.addEventListener('click', () => { example = !example; ck.classList.toggle('on', example); ck.setAttribute('aria-checked', String(example)); });
      const goBtn = el('button', { class: 'fd-btn primary wide' }, tr('ai.action.explain'));
      goBtn.addEventListener('click', () => {
        C.updateSettings({ aiLevel: level, aiExample: example });
        closeFedora();
        runAnswer(t, range, { kind: 'explain', level, example });
      });
      return [el('div', { class: 'fd-mh' }, tr('ai.explain.level')), seg, ck, el('div', { class: 'fd-hint' }, tr('ai.explain.rememberHint')), goBtn];
    }, toggle);
  const builtItems = [
    builtOn('translate') ? item(I.translate, trAction.label, go(() => doEdit(trAction))) : null,
    builtOn('explain') ? item(I.explain, tr('ai.action.explain'), explainSub, null, true) : null,
    builtOn('clean') ? item(I.clean, tr('ai.action.clean'), go(() => doEdit(ACTIONS.clean)), tr('ai.action.cleanHint')) : null,
    builtOn('tone') ? item(I.tone, tr('ai.action.changeTone'), (b, toggle) => openSub(b, () => TONES.map((x) => {
      const r = el('button', { class: 'fd-mi', role: 'menuitem' }, el('span', { class: 't' }, tr(x[1])), el('small', {}, tr(x[2])));
      r.addEventListener('click', () => doEdit(toneAction(x)));
      return r;
    }), toggle), null, true) : null,
    builtOn('length') ? item(I.shorter, tr('ai.action.makeShorter'), go(() => doEdit(ACTIONS.shorter))) : null,
    builtOn('length') ? item(I.longer, tr('ai.action.makeLonger'), go(() => doEdit(ACTIONS.longer))) : null,
  ].filter(Boolean);
  const mine = prompts().filter(forSel);
  c.box.append(...[
    ...scopeSeg(t, 'sel', anchor),
    ask,
    builtItems.length ? el('div', { class: 'fd-mh' }, tr('ai.quickActions')) : null,
    ...builtItems,
    mine.length && builtItems.length ? el('div', { class: 'fd-sep' }) : null,
    mine.length ? el('div', { class: 'fd-mh' }, tr('ai.myPrompts')) : null,
    ...mine.map((p) => promptItem(p, () => { closeFedora(); runPrompt(t, range, p); }, closeSub, () => clearTimeout(hoverT))),
    el('div', { class: 'fd-foot' }, el('span', { class: 'fd-k' }, kb('Ctrl', 'J'), tr('ai.onSelection')),
      el('button', { class: 'fd-link', onclick: () => { closeFedora(); openPromptSettings(); } }, tr('ai.managePrompts'))),
  ].filter(Boolean));
  const free = () => {
    const q = input.value.trim();
    if (!q) return;
    closeFedora();
    runFree(t, range, q);
  };
  send.addEventListener('click', (e) => { e.preventDefault(); free(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); free(); } });
  input.addEventListener('input', () => send.classList.toggle('on', !!input.value.trim()));
  c.place();
  requestAnimationFrame(() => input.focus());
}

// ---------- edits: diff preview, accept / reject / refine ----------
function selectionMd(t, range) { return markdownOf(t.crepe, range.from, range.to); }
const editJob = (beforeMd, instr) => ({ system: editSystem(), messages: [{ role: 'user', text: `Instruction: ${instr}\n\nText:\n${beforeMd}` }], temperature: 0.3 });

async function runEdit(t, range, action, preset = null) {
  if (!(await noticeOk())) return;
  const view = getView(t.crepe);
  const doc0 = view.state.doc;
  const beforeMd = selectionMd(t, range);
  const beforeText = view.state.doc.textBetween(range.from, range.to, '\n', ' ').trim();
  // the conversation: every result is a turn; follow-up instructions sit between them, like a chat
  const versions = preset ? [{ ...preset, instr: null }] : []; // { cmd, md, text, instr }
  let job = null;
  let cur = versions.length - 1;
  let mode = 'new'; // 'new' | 'diff'
  let stream = '';
  let pendingInstr = null;
  let state = preset ? 'ready' : 'loading';
  let err = null;
  let convo = null;
  let lastInstr = '';
  const diffCache = new Map();

  const c = card('fd-diff', tr('ai.diff.title'), t, range, () => { if (job && state === 'loading') { job.cancel(); return false; } return true; });
  const head = el('div', { class: 'fd-head' });
  const body = el('div', { class: 'fd-body fd-thread' });
  const foot = el('div', { class: 'fd-foot' });
  c.box.append(head, body, foot);
  const fu = el('input', { type: 'text', placeholder: tr('ai.diff.refinePlaceholder'), 'aria-label': tr('ai.diff.refineAria'), spellcheck: 'false' });
  fu.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); refine(fu.value.trim()); } });

  const stillThere = () => {
    const d = getView(t.crepe).state.doc;
    if (d === doc0) return true;
    try { return d.textBetween(range.from, range.to, '\n', ' ').trim() === beforeText; } catch { return false; }
  };
  const resultNode = (v, i) => {
    const on = i === cur;
    const box = el('div', { class: 'fd-res' + (on ? ' on' : ''), dir: dirOfText(v.text) || 'auto', title: on ? '' : tr('ai.diff.pickVersion') });
    if (on && mode === 'diff') {
      if (!diffCache.has(i)) diffCache.set(i, beforeText === v.text ? 'same' : wordDiff(beforeText, v.text));
      const parts = diffCache.get(i);
      if (parts === 'same') box.append(el('span', { class: 'fd-same' }, tr('ai.diff.noChanges')));
      else if (!parts) box.append(el('div', { class: 'fd-note' }, tr('ai.diff.mostlyChanged')), document.createTextNode(v.text));
      else for (const p of parts) box.append(p.added ? el('ins', {}, p.value) : p.removed ? el('del', {}, p.value) : document.createTextNode(p.value));
    } else box.append(v.text);
    if (!on) box.addEventListener('click', () => { cur = i; paint(); });
    return box;
  };
  const youNode = (q) => el('div', { class: 'fd-you' }, el('span', { dir: 'auto' }, q));
  let streamNode = null;
  const paint = () => {
    const first = versions[0];
    head.replaceChildren(charHead((first && first.cmd) || action.label, paint), el('span', { class: 'sp' }));
    if (state === 'ready') {
      const seg = el('div', { class: 'fd-vw', role: 'radiogroup', 'aria-label': tr('ai.diff.viewAria') });
      for (const [k, l] of [['new', tr('ai.diff.result')], ['diff', tr('ai.diff.changes')]]) seg.append(el('button', { class: mode === k ? 'on' : '', role: 'radio', 'aria-checked': String(mode === k), onclick: () => { mode = k; paint(); } }, l));
      head.append(seg);
    }
    body.replaceChildren();
    versions.forEach((v, i) => { if (v.instr) body.append(youNode(v.instr)); body.append(resultNode(v, i)); });
    streamNode = null;
    if (state === 'loading') {
      if (pendingInstr) body.append(youNode(pendingInstr));
      streamNode = el('div', { class: 'fd-res stream', dir: 'auto' }, el('span', { class: 'tx' }, cleanReply(stream)), el('span', { class: 'fd-cur' }));
      body.append(streamNode);
    }
    if (state === 'err') body.append(errBox(err, () => (pendingInstr ? refine(pendingInstr) : start())));
    foot.replaceChildren();
    if (state === 'loading') {
      foot.append(el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: () => job && job.cancel() }, el('span', { class: 'ic', html: I.stop }), tr('common.stop'), kb('Esc')));
    } else if (state === 'err' && !versions.length) {
      foot.append(el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: closeFedora }, tr('common.close')));
    } else {
      fu.value = '';
      foot.append(
        el('label', { class: 'fd-fu' }, el('span', { class: 'ic', html: aiIconHTML() }), fu),
        el('button', { class: 'fd-btn ghost', title: tr('ai.diff.rewrite'), 'aria-label': tr('ai.diff.rewrite'), onclick: () => (versions.length > 1 ? refine(lastInstr || 'Write a different version.') : start()) }, el('span', { class: 'ic', html: ICON.refresh })),
        el('button', { class: 'fd-btn', onclick: () => { closeFedora(); getView(t.crepe).focus(); } }, tr('common.reject'), kb('Esc')),
        el('button', { class: 'fd-btn primary', onclick: accept }, tr('common.accept'), kb('Enter')));
    }
    c.place();
    body.scrollTop = body.scrollHeight;
  };
  // while streaming only the last bubble changes, at most once per frame
  let raf = 0;
  const paintStream = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (state !== 'loading' || !streamNode) return;
      streamNode.firstChild.textContent = cleanReply(stream);
      body.scrollTop = body.scrollHeight;
      c.place();
    });
  };
  const onEnter = (e) => {
    if (e.key !== 'Enter' || state !== 'ready' || document.activeElement === fu) return;
    if (!c.box.isConnected) { document.removeEventListener('keydown', onEnter, true); return; }
    e.preventDefault(); e.stopPropagation(); accept();
  };
  document.addEventListener('keydown', onEnter, true);
  c.onClose = () => { document.removeEventListener('keydown', onEnter, true); if (job && state === 'loading') job.cancel(); focusMark(t, null); };

  const finish = (r, cmd) => {
    const md = cleanReply(r.text);
    if (!md) { state = 'err'; err = { kind: 'blocked' }; paint(); return; }
    convo.push({ role: 'model', text: md });
    versions.push({ cmd, md, text: plainOfMd(t, md), instr: pendingInstr });
    pendingInstr = null;
    cur = versions.length - 1;
    state = 'ready';
    if (r.fallback) C.toast(tr('ai.toast.fallbackBusy', { model: r.model }), 'info');
    paint();
    if (set().aiPreview === false) accept();
  };
  const go = (cmd) => {
    state = 'loading'; stream = ''; err = null; paint();
    const endWork = startWork(t, action.kind || 'think', () => job && job.cancel());
    job = runJob({ system: action.system || editSystem(), messages: convo, temperature: 0.3 }, (x) => { stream = x; paintStream(); });
    job.promise.finally(endWork);
    job.promise.then((r) => finish(r, cmd)).catch((e) => {
      if (e && e.kind === 'cancelled') {
        if (pendingInstr) { convo.pop(); pendingInstr = null; }
        if (versions.length) { state = 'ready'; paint(); } else closeFedora();
        return;
      }
      state = 'err'; err = e; paint();
    });
  };
  const start = () => { convo = action.userText ? [{ role: 'user', text: action.userText }] : editJob(beforeMd, action.instr).messages; go(action.label); };
  const refine = (instr) => {
    if (!instr) return;
    if (pendingInstr) convo.pop(); // retrying a failed follow-up
    lastInstr = instr;
    pendingInstr = instr;
    // the follow-up works on the version the user is looking at
    const base = versions[cur];
    if (base && convo[convo.length - 1] && convo[convo.length - 1].text !== base.md) convo.push({ role: 'user', text: 'Use this version as the starting point.' }, { role: 'model', text: base.md });
    convo.push({ role: 'user', text: `Revise your last version: ${instr}\nReply with ONLY the new Markdown.` });
    go(versions[0] ? versions[0].cmd : action.label);
  };

  const accept = async () => {
    const v = versions[cur];
    if (!v) return;
    if (t.locked) { C.showLocked(); return; }
    if (!stillThere()) { C.toast(tr('translate.selectionChanged'), 'warn'); return; }
    closeFedora();
    const cmd = v.instr ? `${versions[0].cmd} · ${v.instr.length > 24 ? v.instr.slice(0, 24) + '…' : v.instr}` : v.cmd;
    await applyChange(t, range, { cmd, beforeMd, beforeText, afterMd: v.md });
  };

  if (preset) { convo = [...editJob(beforeMd, action.instr).messages, { role: 'model', text: preset.md }]; paint(); }
  else start();
}

/** apply a change: one undo step, a history version, a marker */
async function applyChange(t, range, { cmd, beforeMd, beforeText, afterMd }) {
  let hist = null;
  if (t.path) {
    const r = await C.api.historyAdd(t.path, t.crepe.getMarkdown(), 'auto').catch(() => null);
    hist = r && r.id;
  }
  const view = getView(t.crepe);
  const { tr, from, to } = replaceRange(t, range, afterMd);
  const afterText = tr.doc.textBetween(from, to, '\n', ' ').trim();
  const mark = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), time: Date.now(), cmd, scope: tr('ai.scope.shortSel'),
    inline: !!range.inline && tr.doc.resolve(from).parent.isTextblock, from, to, beforeMd, afterMd, beforeText, afterText, hist };
  closeHistory(tr);
  view.dispatch(tr.setMeta(markKey, { add: mark }).scrollIntoView());
  view.dispatch(closeHistory(view.state.tr));
  view.focus();
  persistMarks(t);
  C.marksChanged(t);
  if (t.path) C.api.historyAdd(t.path, t.crepe.getMarkdown(), 'ai', cmd).catch(() => {});
}

// ---------- answers ----------
function mdLite(md) {
  // a small Markdown → DOM for answers: paragraphs, lists, bold, italic, inline code, «### مثال» as a box
  const root = el('div', { class: 'fd-ans' });
  let target = root;
  const inline = (s, node) => {
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
    let last = 0; let m;
    while ((m = re.exec(s))) {
      if (m.index > last) node.append(document.createTextNode(s.slice(last, m.index)));
      const x = m[0];
      node.append(x.startsWith('**') ? el('b', {}, x.slice(2, -2)) : x.startsWith('`') ? el('code', { dir: 'ltr' }, x.slice(1, -1)) : el('i', {}, x.slice(1, -1)));
      last = m.index + x.length;
    }
    if (last < s.length) node.append(document.createTextNode(s.slice(last)));
    return node;
  };
  for (const block of String(md).split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(lines[0]);
    if (h && /^(مثال|example)/i.test(h[1].trim())) {
      target = el('div', { class: 'fd-ex' }, el('b', {}, h[1].trim()));
      root.append(target);
      lines.shift();
      if (!lines.length) continue;
    } else if (h) { target.append(inline(h[1], el('p', { class: 'fd-h', dir: 'auto' }))); lines.shift(); if (!lines.length) continue; }
    if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      const ul = el(/^\s*\d/.test(lines[0]) ? 'ol' : 'ul', { dir: 'auto' });
      for (const l of lines) ul.append(inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), el('li')));
      target.append(ul);
    } else target.append(inline(lines.join('\n'), el('p', { dir: 'auto' })));
  }
  // the same direction rule as the document: any Persian letter → right to left
  root.querySelectorAll('p, ul, ol').forEach((n) => { n.dir = dirOfText(n.textContent) || 'auto'; });
  return root;
}

async function runAnswer(t, range, { kind, level, example, question, answer, system, userText, name }) {
  if (!(await noticeOk())) return;
  const text = kind === 'prompt' ? '' : selectionMd(t, range);
  const levelName = tr((LEVELS.find((x) => x[0] === level) || LEVELS[0])[1]);
  const label = kind === 'prompt' ? name : kind === 'explain' ? (example ? tr('ai.explain.labelWithEx', { level: levelName }) : tr('ai.explain.label', { level: levelName })) : tr('common.quote', { text: question.length > 40 ? question.slice(0, 40) + '…' : question });
  const convo = [{ role: 'user', text: kind === 'prompt' ? userText : kind === 'explain' ? `Explain this text:\n\n${text}` : `Question about the text below: ${question}\n\nText:\n${text}` }];
  const turns = []; // { q, a }
  let state = 'loading'; let err = null; let job = null; let stream = '';
  const workKind = kind === 'explain' ? 'explain' : kind === 'prompt' ? 'prompt' : 'think';
  const firstQ = kind === 'question' || kind === 'free-answer' ? (question || label) : kind === 'explain' ? tr('ai.explain.firstQ', { level: example ? tr('ai.explain.levelWithEx', { level: levelName }) : levelName }) : label;
  const c = card('fd-answer', tr('ai.answer.title', { name: aiName() }), t, range, () => { if (job && state === 'loading') { job.cancel(); return false; } return true; });
  c.onClose = () => { if (job && state === 'loading') job.cancel(); };
  const head = el('div', { class: 'fd-head' });
  const body = el('div', { class: 'fd-body' });
  const foot = el('div', { class: 'fd-foot' });
  c.box.append(head, body, foot);
  const fu = el('input', { type: 'text', placeholder: tr('ai.answer.followPlaceholder'), 'aria-label': tr('ai.answer.followAria'), spellcheck: 'false' });
  fu.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); follow(fu.value.trim()); } });
  const lastAnswer = () => (turns.length ? turns[turns.length - 1].a : '');
  const copyBtn = () => {
    const b = el('button', { class: 'fd-btn' }, el('span', { class: 'ic', html: ICON.copy }), el('span', { class: 'l' }, tr('common.copy')));
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(lastAnswer()); } catch { C.toast(tr('translate.copyFailed'), 'err'); return; }
      b.classList.add('ok'); b.querySelector('.ic').innerHTML = ICON.check; b.querySelector('.l').textContent = tr('common.copied');
      setTimeout(() => { if (!b.isConnected) return; b.classList.remove('ok'); b.querySelector('.ic').innerHTML = ICON.copy; b.querySelector('.l').textContent = tr('common.copy'); }, 1600);
    });
    return b;
  };
  const insertBelow = () => {
    if (t.locked) { C.showLocked(); return; }
    const v = getView(t.crepe);
    const { state: s } = v;
    const $to = s.doc.resolve(Math.min(range.to, s.doc.content.size));
    const at = $to.depth >= 1 ? $to.after(1) : s.doc.content.size;
    const d = parseMarkdown(t.crepe, lastAnswer().replace(/^#{1,6}\s+(مثال|example)\s*$/gim, '**$1**'));
    const tr = s.tr.insert(at, d.content);
    closeHistory(tr);
    v.dispatch(tr.scrollIntoView());
    v.dispatch(closeHistory(v.state.tr));
    closeFedora();
    v.focus();
  };
  const paint = () => {
    head.replaceChildren(charHead(label.replace(/^«|»$/g, ''), paint), el('span', { class: 'sp' }),
      el('button', { class: 'fd-x', 'aria-label': tr('common.close'), title: tr('common.close'), html: ICON.x, onclick: closeFedora }));
    body.replaceChildren();
    body.classList.add('fd-chat');
    // the user on the right, the character on the left with its face at the edge of the bubble
    const you = (q) => el('div', { class: 'fd-msg me' }, el('div', { class: 'bub', dir: 'auto' }, q));
    const ai = (content, working) => el('div', { class: 'fd-msg ai' }, el('div', { class: 'bub' }, content),
      working ? el('span', { class: 'fd-wring sm' }, el('span', { class: 'fc fd-bob', html: aiIconHTML() })) : el('span', { class: 'fc', html: aiIconHTML() }));
    body.append(you(firstQ));
    turns.forEach((x, i) => {
      if (i > 0) body.append(you(x.q));
      body.append(ai(mdLite(x.a)));
    });
    if (state === 'loading') {
      if (pendingQ) body.append(you(pendingQ));
      if (stream) { const live = mdLite(stream); live.append(el('span', { class: 'fd-cur' })); body.append(ai(live, true)); }
      else body.append(ai(el('span', { class: 'fd-wait' }, el('span', { class: 'fd-work-tx', 'data-kind': workKind }, workText(workKind)), dots()), true));
    }
    if (state === 'err') body.append(errBox(err, retry));
    foot.replaceChildren();
    if (state === 'loading') foot.append(el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: () => job && job.cancel() }, el('span', { class: 'ic', html: I.stop }), tr('common.stop'), kb('Esc')));
    else {
      fu.value = '';
      foot.append(el('label', { class: 'fd-fu' }, el('span', { class: 'ic', html: aiIconHTML() }), fu));
      if (turns.length) foot.append(copyBtn(), el('button', { class: 'fd-btn' + (kind === 'prompt' ? ' primary' : ''), onclick: insertBelow }, el('span', { class: 'ic', html: I.below }), range.doc ? tr('ai.answer.insertEnd') : tr('ai.answer.insertBelow')));
    }
    c.place();
    body.scrollTop = body.scrollHeight;
  };
  let pendingQ = null;
  const go = () => {
    state = 'loading'; stream = ''; paint();
    let raf = 0;
    const endWork = startWork(t, workKind, () => job && job.cancel());
    job = runJob({ system: system || answerSystem(level, example), messages: convo, temperature: 0.5 }, (s) => {
      stream = cleanReply(s);
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (state === 'loading') paint(); });
    });
    job.promise.finally(endWork);
    job.promise.then((r) => {
      const a = cleanReply(r.text);
      convo.push({ role: 'model', text: a });
      turns.push({ q: pendingQ || '', a });
      pendingQ = null;
      state = 'done'; paint();
      if (r.fallback) C.toast(tr('ai.toast.fallbackBusy', { model: r.model }), 'info');
      requestAnimationFrame(() => fu.focus());
    }).catch((e) => {
      if (e && e.kind === 'cancelled') {
        if (stream) { convo.push({ role: 'model', text: stream }); turns.push({ q: pendingQ || '', a: stream }); }
        else if (pendingQ) convo.pop();
        pendingQ = null;
        if (!turns.length) { closeFedora(); return; }
        state = 'done'; paint(); return;
      }
      state = 'err'; err = e; paint();
    });
  };
  const retry = () => go();
  const follow = (q) => { if (!q) return; pendingQ = q; convo.push({ role: 'user', text: q }); go(); };
  if (kind === 'free-answer') {
    // the free instruction already produced an answer
    turns.push({ q: '', a: answer });
    convo.push({ role: 'model', text: answer });
    state = 'done'; paint();
    return;
  }
  go();
}

// ---------- a free instruction: an edit or an answer, decided by the reply ----------
async function runFree(t, range, q) {
  if (!(await noticeOk())) return;
  const beforeMd = selectionMd(t, range);
  const sys = editSystem() + '\n\n' + FREE_SYSTEM_TAIL + '\n' + langRule().replace('the answer', 'any answer');
  const c = card('fd-diff', aiName(), t, range);
  let job = null;
  c.onClose = () => job && job.cancel();
  const short = q.length > 30 ? q.slice(0, 30) + '…' : q;
  const paintWait = (s) => {
    c.box.replaceChildren(brandHead(el('span', { class: 'fd-q' }, `«${short}»`)),
      el('div', { class: 'fd-body' }, el('div', { class: 'fd-txt stream', dir: 'auto' }, cleanReply(s || ''), el('span', { class: 'fd-cur' }))),
      el('div', { class: 'fd-foot' }, el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: () => job && job.cancel() }, el('span', { class: 'ic', html: I.stop }), tr('common.stop'), kb('Esc'))));
    c.place();
  };
  paintWait('');
  const go = () => {
    paintWait('');
    let raf = 0; let last = '';
    job = runJob({ system: sys, messages: [{ role: 'user', text: `Instruction: ${q}\n\nText:\n${beforeMd}` }], temperature: 0.4 }, (s) => {
      last = s;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (openCard === c) paintWait(last); });
    });
    job.promise.finally(startWork(t, 'think', () => job && job.cancel()));
    job.promise.then((r) => {
      const raw = String(r.text || '');
      const isAnswer = /^\s*\[\[ANSWER\]\]/.test(raw);
      const out = cleanReply(raw);
      c.onClose = null;
      if (isAnswer) { runAnswer(t, range, { kind: 'free-answer', question: q, answer: out }); return; }
      runEdit(t, range, { label: `«${short}»`, instr: q }, { cmd: `«${short}»`, md: out, text: plainOfMd(t, out) });
    }).catch((e) => {
      if (e && e.kind === 'cancelled') { closeFedora(); return; }
      c.box.replaceChildren(brandHead(el('span', { class: 'fd-q' }, `«${short}»`)), el('div', { class: 'fd-body' }, errBox(e, go)),
        el('div', { class: 'fd-foot' }, el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: closeFedora }, tr('common.close'))));
      c.place();
    });
  };
  go();
}

// ---------- markers: popover, list, detail ----------
let popEl = null;
function closePop() { if (popEl) { const p = popEl; popEl = null; p._cleanup(); } }
function pop(cls, label, anchorRect, build, side = 'left') {
  closePop();
  const box = el('div', { class: 'fd-pop ' + cls, dir: langDir(), role: 'dialog', 'aria-label': label });
  document.body.append(box);
  const paint = () => { box.replaceChildren(...build(paint)); position(); };
  const position = () => {
    const w = box.offsetWidth; const h = box.offsetHeight;
    if (side === 'up') {
      box.style.left = Math.max(10, Math.min(anchorRect.left, innerWidth - w - 10)) + 'px';
      box.style.top = Math.max(10, anchorRect.top - h - 8) + 'px';
    } else {
      let left = anchorRect.left - w - 8;
      if (left < 10) left = Math.min(anchorRect.right + 8, innerWidth - w - 10);
      box.style.left = left + 'px';
      box.style.top = Math.max(10, Math.min(anchorRect.top - 6, innerHeight - h - 10)) + 'px';
    }
  };
  const onDown = (e) => { if (!box.contains(e.target) && !e.target.closest('.fd-mk, .overlay')) closePop(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); } };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  box._cleanup = () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); box.remove(); if (box._onClose) box._onClose(); };
  popEl = box;
  paint();
  return box;
}

function markRow(t, m, { onDetail, full }) {
  const edited = editedSince(t, m);
  const ex = m.beforeText && m.beforeText.length > 60 ? m.beforeText.slice(0, 60) + '…' : (m.beforeText || '');
  return el('div', { class: 'fd-it', onmouseenter: () => focusMark(t, m.id) },
    el('div', { class: 'ir' }, el('b', {}, m.cmd), el('span', { class: 'sc' }, m.scope || tr('ai.scope.shortSel')), el('span', { class: 'tm' }, relTime(m.time))),
    el('div', { class: 'ex', dir: 'auto' }, ex),
    el('div', { class: 'acts' },
      full ? el('button', { class: 'fd-btn ghost sm', onclick: () => showInText(t, m) }, el('span', { class: 'ic', html: ICON.search }), tr('ai.marks.showInText')) : null,
      el('button', { class: 'fd-btn ghost sm', onclick: () => onDetail(m) }, tr('ai.marks.beforeAfter')),
      edited ? null : el('button', { class: 'fd-btn sm', onclick: () => revert(t, m) }, el('span', { class: 'ic', html: I.undo }), tr('common.restore'))));
}
function showInText(t, m) {
  const v = getView(t.crepe);
  try {
    const dom = v.domAtPos(m.from);
    const n = dom.node.nodeType === 1 ? dom.node : dom.node.parentElement;
    n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {}
  focusMark(t, m.id);
}
function detail(t, m, back, inPanel = false) {
  const edited = editedSince(t, m);
  const dd = el('div', { class: 'fd-txt diff sm', dir: dirOfText(m.afterText || '') || 'auto' });
  const parts = wordDiff(m.beforeText || '', m.afterText || '') || [{ value: m.beforeText || '', removed: true }, { value: '\n' }, { value: m.afterText || '', added: true }];
  for (const p of parts) dd.append(p.added ? el('ins', {}, p.value) : p.removed ? el('del', {}, p.value) : document.createTextNode(p.value));
  return [
    el('div', { class: 'fd-ph' }, back ? el('button', { class: 'fd-x', 'aria-label': tr('common.back'), html: S('M8.5 5l7 7l-7 7'), onclick: back }) : null,
      el('b', {}, m.cmd), el('small', {}, relTime(m.time)), el('span', { class: 'sp' }), inPanel ? null : el('button', { class: 'fd-x', 'aria-label': tr('common.close'), html: ICON.x, onclick: closePop })),
    el('div', { class: 'fd-it' }, dd,
      edited ? el('div', { class: 'fd-warn' }, el('span', { class: 'ic', html: ICON.warn }), el('span', {}, tr('ai.marks.editedWarn'))) : null,
      el('div', { class: 'acts' },
        el('button', { class: 'fd-btn sm', disabled: edited, 'aria-disabled': String(edited), onclick: () => revert(t, m) }, el('span', { class: 'ic', html: I.undo }), tr('ai.marks.revertThis')),
        m.hist && t.path ? el('button', { class: 'fd-btn sm', onclick: () => { closePop(); C.openHistoryAt(t, m.hist); } }, el('span', { class: 'ic', html: ICON.history }), tr('ai.marks.versionBefore')) : null)),
  ];
}
function revert(t, m) {
  if (t.locked) { C.showLocked(); return; }
  if (editedSince(t, m)) { C.toast(tr('ai.marks.editedToast'), 'warn'); return; }
  const view = getView(t.crepe);
  const { tr: tx } = replaceRange(t, { from: m.from, to: m.to, inline: m.inline }, m.beforeMd || m.beforeText);
  closeHistory(tx);
  view.dispatch(tx.setMeta(markKey, { remove: m.id }).scrollIntoView());
  view.dispatch(closeHistory(view.state.tr));
  closePop();
  persistMarks(t);
  C.marksChanged(t);
  C.toast(tr('ai.marks.revertedToast'), 'ok');
}
function openBlockPop(t, btn) {
  const ids = (btn.dataset.ids || '').split(',');
  const list = () => marksOf(t).filter((m) => ids.includes(m.id)).sort((a, b) => b.time - a.time);
  if (!list().length) return;
  let showing = null;
  btn.classList.add('on');
  const box = pop('fd-blockpop', tr('ai.marks.blockPopAria', { name: aiName() }), btn.getBoundingClientRect(), (repaint) => {
    if (showing) return detail(t, showing, () => { showing = null; repaint(); });
    const l = list();
    return [el('div', { class: 'fd-ph' }, el('b', {}, tr('ai.marks.blockCount', { n: fa(l.length) })), el('span', { class: 'sp' }), el('button', { class: 'fd-x', 'aria-label': tr('common.close'), html: ICON.x, onclick: closePop })),
      ...l.map((m) => markRow(t, m, { onDetail: (x) => { showing = x; repaint(); } }))];
  });
  focusMark(t, ids[0]);
  box._onClose = () => { btn.classList.remove('on'); if (t.crepe) focusMark(t, null); };
}
/** the assistant's changes in this file, inside the version history panel */
let panelShowing = null;
export function marksPanel(t, repaint) {
  if (!t || !t.crepe) return [el('div', { class: 'h-empty' }, tr('ai.marks.noDoc'))];
  const l = [...marksOf(t)].sort((a, b) => b.time - a.time);
  if (panelShowing && !l.some((m) => m.id === panelShowing)) panelShowing = null;
  if (panelShowing) return [el('div', { class: 'fd-pop fd-inpanel' }, detail(t, l.find((m) => m.id === panelShowing), () => { panelShowing = null; repaint(); }, true))];
  if (!l.length) {
    return [el('div', { class: 'h-empty' }, tr('ai.marks.empty', { name: aiName() }))];
  }
  return [
    el('div', { class: 'h-aihead' }, el('span', {}, t.path ? tr('ai.marks.persistSaved', { n: fa(l.length) }) : tr('ai.marks.persistUnsaved', { n: fa(l.length) })),
      el('button', { class: 'hb', onclick: () => clearMarks(t) }, tr('ai.marks.clear'))),
    el('div', { class: 'fd-pop fd-inpanel h-ailist' }, l.map((m) => markRow(t, m, { full: true, onDetail: (x) => { panelShowing = x.id; repaint(); } }))),
  ];
}
function clearMarks(t) {
  const v = getView(t.crepe);
  v.dispatch(v.state.tr.setMeta(markKey, { set: [] }).setMeta('addToHistory', false));
  closePop();
  persistMarks(t);
  C.marksChanged(t);
}
export const markCount = (t) => marksOf(t).length;
/** a mark whose text was deleted disappears; keep the stored list and the status chip in step */
export function noteDocChange(t) {
  if (!t || !t.crepe) return;
  const n = marksOf(t).length;
  if (n !== t._fdCount) { t._fdCount = n; persistMarks(t); C.marksChanged(t); }
}

// ---------- tab name suggestions: only when asked, from the rename field ----------
export const RENAME_AI_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5h4l9-9-4-4-9 9z"/><path d="M11 9l4 4"/><path d="M18.5 2.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>';
export const aiRenameOn = () => aiOn() && set().aiTabNames !== false;
export function noteChangeForName() { /* suggestions are made on request now */ }
async function suggestNames(t) {
  const md = t.crepe ? t.crepe.getMarkdown() : String(t.md || '');
  if (md.split(/\s+/).filter(Boolean).length < 3) throw { kind: 'short' };
  const r = await runJob({
    system: 'You name documents. Reply with exactly three short file names (2 to 5 words each) for the document, one per line, in the language of the document. No numbering, no quotes, no file extension, no punctuation at the end.',
    messages: [{ role: 'user', text: md.slice(0, 4000) }], temperature: 0.6,
  }).promise;
  return String(r.text || '').split('\n').map((x) => x.replace(/^[\s\-*•\d.)«"]+|[»".]+$/g, '').trim()).filter((x) => x && x.length <= 60).slice(0, 3);
}
/** under the rename field: a button that asks for name ideas; returns a cleanup */
export function nameChips(t, input, pick) {
  if (!aiRenameOn()) return () => {};
  let alive = true;
  const btn = el('button', { class: 'fd-namebtn' }, el('span', { class: 'ic', html: aiIconHTML() }), tr('ai.rename.suggestWith', { name: aiName() }));
  const cs = el('div', { class: 'cs' });
  const box = el('div', { class: 'fd-names', dir: langDir() }, btn, cs);
  const place = () => {
    const r = input.getBoundingClientRect();
    const w = box.offsetWidth;
    box.style.top = r.bottom + 8 + 'px';
    box.style.left = Math.max(10, Math.min(langDir() === 'rtl' ? r.right - w : r.left, innerWidth - w - 10)) + 'px';
  };
  const show = (names) => {
    cs.replaceChildren(...names.map((n) => {
      const b = el('button', { class: 'fd-chip', role: 'option', dir: 'auto' }, n);
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); pick(n); });
      return b;
    }));
    place();
  };
  btn.addEventListener('mousedown', async (e) => {
    // keep the field focused (leaving it would end the rename)
    e.preventDefault(); e.stopPropagation();
    if (btn.disabled) return;
    const info = await C.api.aiKeyInfo(cfgOf()).catch(() => ({ has: false }));
    if (!info.has) { cs.replaceChildren(el('span', { class: 'fd-nmsg' }, tr('ai.rename.needKey'))); place(); return; }
    if (!(await noticeOk())) { input.focus(); return; }
    input.focus();
    btn.disabled = true;
    btn.replaceChildren(el('span', { class: 'fd-spin' }), tr('ai.rename.suggesting'));
    try {
      const names = await suggestNames(t);
      if (!alive) return;
      btn.remove();
      show(names.length ? names : []);
      if (!names.length) cs.replaceChildren(el('span', { class: 'fd-nmsg' }, tr('ai.rename.none')));
    } catch (err) {
      if (!alive) return;
      btn.disabled = false;
      btn.replaceChildren(el('span', { class: 'ic', html: aiIconHTML() }), tr('common.tryAgain'));
      cs.replaceChildren(el('span', { class: 'fd-nmsg' }, err && err.kind === 'short' ? tr('ai.rename.emptyDoc') : errorText(err, () => {})[0]));
      place();
    }
  });
  for (const ev of ['pointerdown', 'click', 'dblclick']) box.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(box);
  place();
  return () => { alive = false; box.remove(); };
}

// ---------- model picker: a searchable list in the app's own style ----------
const MODEL_TAG = { ok: ['ai.model.tag.ok', 'ok'], minute: ['ai.model.tag.minute', 'warn'], busy: ['ai.model.tag.busy', 'warn'], day: ['ai.model.tag.day', 'bad'], gone: ['ai.model.tag.gone', 'bad'] };
function modelPicker({ label, value, list, none, onPick }) {
  const tested = list.some((m) => m.status);
  const cur = list.find((m) => m.id === value);
  // in the list every tested model gets its tag, «فعال» too; on the button only a problem is worth showing
  const tagOf = (m, all) => (m && m.status && MODEL_TAG[m.status] && (all || m.status !== 'ok') ? el('span', { class: 'fd-mt ' + MODEL_TAG[m.status][1] }, tr(MODEL_TAG[m.status][0])) : null);
  const btn = el('button', { class: 'fd-mp', 'aria-haspopup': 'listbox', 'aria-label': label },
    el('span', { class: 'nm', dir: value ? 'ltr' : langDir() }, value || none || tr('ai.model.choose')), tagOf(cur), el('span', { class: 'cv', html: ICON.chevDown }));
  btn.addEventListener('click', () => {
    if (document.querySelector('.fd-mpop')) { document.querySelector('.fd-mpop')._close(); return; }
    const q = el('input', { type: 'text', placeholder: tr('ai.model.searchPh', { count: fa(list.length) }), 'aria-label': tr('ai.model.searchLabel'), spellcheck: 'false' });
    const rows = el('div', { class: 'fd-mlist', role: 'listbox', 'aria-label': label });
    const manual = el('button', { class: 'fd-mman' }, el('span', { class: 'ic', html: ICON.edit }), tr('ai.model.manualBtn'));
    const box = el('div', { class: 'fd-mpop', dir: langDir() }, el('label', { class: 'fd-ms' }, el('span', { class: 'ic', html: ICON.search }), q), rows, manual);
    document.body.append(box);
    let items = []; let focus = -1;
    const pick = (v) => { close(); onPick(v); };
    const row = (m) => {
      const on = m.id === value;
      // tags first, on the right; the model id after them
      const b = el('button', { class: 'fd-mr' + (on ? ' on' : ''), role: 'option', 'aria-selected': String(on) },
        el('span', { class: 'ck', html: ICON.check }), tagOf(m, true),
        m.free ? el('span', { class: 'fd-mt ok' }, tr('ai.model.free')) : null, el('span', { class: 'id', dir: 'ltr' }, m.id));
      b.addEventListener('click', () => pick(m.id));
      b.addEventListener('mousemove', () => setFocus(items.indexOf(b)));
      items.push(b);
      return b;
    };
    const setFocus = (i) => { if (!items.length) return; focus = (i + items.length) % items.length; items.forEach((x, k) => x.classList.toggle('focus', k === focus)); items[focus].scrollIntoView({ block: 'nearest' }); };
    const paint = () => {
      const f = q.value.trim().toLowerCase();
      items = []; rows.replaceChildren();
      const hit = list.filter((m) => !f || m.id.toLowerCase().includes(f));
      if (none && !f) {
        const b = el('button', { class: 'fd-mr' + (!value ? ' on' : ''), role: 'option' }, el('span', { class: 'ck', html: ICON.check }), el('span', { class: 'id' }, none));
        b.addEventListener('click', () => pick(''));
        items.push(b); rows.append(b);
      }
      const group = (title, arr) => { if (!arr.length) return; rows.append(el('div', { class: 'fd-mh' }, title)); arr.forEach((m) => rows.append(row(m))); };
      if (tested) {
        group(tr('ai.model.groupActive'), hit.filter((m) => m.status === 'ok' || m.status === 'minute'));
        group(tr('ai.model.groupInactive'), hit.filter((m) => !(m.status === 'ok' || m.status === 'minute')));
      } else group(list.length ? tr('ai.model.groupAll') : '', hit);
      if (!hit.length) rows.append(el('div', { class: 'fd-mempty' }, f ? tr('ai.model.notFound', { query: q.value.trim() }) : tr('ai.model.noList')));
      focus = -1;
    };
    const toManual = () => {
      const inp = el('input', { type: 'text', class: 'ltr', value: value || '', placeholder: tr('ai.model.manualPh'), 'aria-label': tr('ai.model.manualLabel'), spellcheck: 'false' });
      const ok = el('button', { class: 'fd-btn primary sm' }, tr('common.confirm'));
      const done = () => { const v = inp.value.trim(); if (v) pick(v); };
      ok.addEventListener('click', done);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      manual.replaceWith(el('div', { class: 'fd-mmi' }, inp, ok));
      inp.focus();
    };
    manual.addEventListener('click', toManual);
    q.addEventListener('input', paint);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(focus + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(focus - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (focus >= 0) items[focus].click(); else if (q.value.trim() && !items.length) pick(q.value.trim()); }
    });
    const onDown = (e) => { if (!box.contains(e.target) && !btn.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const close = () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); box.remove(); btn.classList.remove('open'); };
    box._close = close;
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    btn.classList.add('open');
    paint();
    // under the button, its left edges lined up (the button sits at the row's left end)
    const r = btn.getBoundingClientRect();
    const w = Math.max(320, r.width);
    box.style.width = w + 'px';
    box.style.left = Math.max(10, Math.min(r.left, innerWidth - w - 10)) + 'px';
    const below = innerHeight - r.bottom - 12;
    if (below < 260 && r.top > below) { box.style.bottom = innerHeight - r.top + 6 + 'px'; box.style.maxHeight = Math.min(420, r.top - 16) + 'px'; }
    else { box.style.top = r.bottom + 6 + 'px'; box.style.maxHeight = Math.min(420, below) + 'px'; }
    const i = items.findIndex((x) => x.classList.contains('on'));
    if (i >= 0) items[i].scrollIntoView({ block: 'nearest' });
    q.focus();
  });
  return btn;
}

// ---------- settings section ----------
export function settingsSection(h) {
  const { row, group, label, sw, seg } = h;
  const st = set();
  const wrap = el('div', { class: 'fd-set' });
  let sub = 'conn';
  const tabs = el('div', { class: 'fd-subtabs', role: 'tablist', 'aria-label': tr('settings.ai.tabsLabel') });
  const pane = el('div', {});
  const SUBS = [['conn', tr('settings.ai.tab.conn')], ['id', tr('settings.ai.tab.char')], ['rules', tr('settings.ai.tab.rules')], ['prompts', tr('settings.ai.tab.prompts')]];
  const show = (k) => {
    sub = k;
    tabs.replaceChildren(...SUBS.map(([v, l]) => el('button', { class: v === sub ? 'on' : '', role: 'tab', 'aria-selected': String(v === sub), onclick: () => show(v) }, l)));
    pane.replaceChildren(...(k === 'conn' ? conn() : k === 'id' ? ident() : k === 'prompts' ? promptsPane(pane, h) : rules()).filter(Boolean));
  };

  // --- connection ---
  function conn() {
    const s = set();
    const oai = s.aiProvider === 'oai';
    const claude = s.aiProvider === 'anthropic';
    const openai = s.aiProvider === 'openai';
    const gem = !oai && !claude && !openai;
    const prov = (v, title, hint, icon, ltr) => {
      const on = (s.aiProvider || 'gemini') === v;
      const b = el('button', { class: 'fd-pc' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) },
        el('span', { class: 'pic', html: icon }), el('span', { class: 'pt' }, el('b', ltr ? { dir: 'ltr' } : {}, title), el('small', {}, hint)), el('span', { class: 'rd' }));
      b.addEventListener('click', () => { C.updateSettings({ aiProvider: v }); show('conn'); });
      return b;
    };
    const GEM = GEMINI_LOGO;
    const OPN = OPENAI_LOGO;
    const OAI = S('M8 7.5L3.5 12L8 16.5M16 7.5L20.5 12L16 16.5M13.5 5l-3 14');
    const CLA = CLAUDE_LOGO;
    const provider = cfgOf().provider;
    // ready-made addresses of well-known OpenAI-compatible services (the address field stays editable)
    const PRESETS = [
      ['OpenRouter', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/keys'],
      ['DeepSeek', 'https://api.deepseek.com/v1', 'https://platform.deepseek.com/api_keys'],
      ['Groq', 'https://api.groq.com/openai/v1', 'https://console.groq.com/keys'],
      ['Mistral', 'https://api.mistral.ai/v1', 'https://console.mistral.ai/api-keys'],
      ['xAI', 'https://api.x.ai/v1', 'https://console.x.ai'],
      ['Together', 'https://api.together.xyz/v1', 'https://api.together.ai/settings/api-keys'],
      ['AvalAI', 'https://api.avalai.ir/v1', 'https://avalai.ir'],
      ['Ollama', 'http://localhost:11434/v1', null],
    ];
    const preset = oai ? PRESETS.find((x) => x[1] === String(s.aiBaseUrl || '').replace(/\/+$/, '')) : null;
    const keyUrl = gem ? 'https://aistudio.google.com/apikey' : claude ? 'https://console.anthropic.com/settings/keys' : openai ? 'https://platform.openai.com/api-keys' : preset ? preset[2] : null;
    const isLocal = oai && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(String(s.aiBaseUrl || ''));
    // key
    const status = el('span', { class: 'fd-stt' });
    const setStatus = (tone, text) => { status.className = 'fd-stt ' + tone; status.replaceChildren(el('i'), el('span', {}, text)); };
    const keyBox = el('div', { class: 'fd-keybox' });
    const checkBtn = el('button', { class: 'set-select as-btn' }, tr('settings.ai.checkConn'));
    const modelWrap = el('span', { class: 'fd-mwrap' });
    const fbWrap = el('span', { class: 'fd-mwrap' });
    const testBtn = el('button', { class: 'sv-link' }, tr('settings.ai.testModels'));
    const modelNote = el('div', { class: 'fd-mnote', hidden: true });
    let models = (s.aiModelCache && s.aiModelCache[provider + '|' + cfgOf(s).baseUrl]) || null;
    const keyMain = oai ? 'aiOaiModel' : claude ? 'aiClaudeModel' : openai ? 'aiOpenaiModel' : 'aiModel';
    const keyFb = oai ? 'aiOaiFallback' : claude ? 'aiClaudeFallback' : openai ? 'aiOpenaiFallback' : 'aiFallback';
    const curMain = () => cfgOf().model;
    const curFb = () => cfgOf().fallback;
    const listNow = () => (models && models.length ? models : (!gem ? [] : [{ id: 'gemini-flash-latest' }, { id: 'gemini-flash-lite-latest' }, { id: 'gemini-3.5-flash-lite' }]));
    const claudeHint = el('div', { class: 'lbl plain set-free', hidden: !!curMain() }, tr('settings.ai.claudeHint'));
    const paintModels = () => {
      claudeHint.hidden = !!curMain();
      const list = listNow();
      modelWrap.replaceChildren(modelPicker({ label: tr('settings.ai.mainModel'), value: curMain(), list, none: null, onPick: (v) => { C.updateSettings({ [keyMain]: v }); paintModels(); } }));
      fbWrap.replaceChildren(modelPicker({ label: tr('settings.ai.fallbackModel'), value: curFb(), list, none: tr('settings.ai.noFallback'), onPick: (v) => { C.updateSettings({ [keyFb]: v }); paintModels(); } }));
      paintNote(list);
    };
    // the chosen model does not answer now: say so, and offer one that does
    const paintNote = (list) => {
      const st = (id) => (list.find((m) => m.id === id) || {}).status;
      const bad = ['day', 'busy', 'gone'].includes(st(curMain())) ? curMain() : null;
      const good = list.find((m) => m.status === 'ok');
      modelNote.hidden = !bad;
      if (!bad) return;
      const why = { day: tr('settings.ai.modelWhy.day'), busy: tr('settings.ai.modelWhy.busy'), gone: tr('settings.ai.modelWhy.gone') }[st(bad)];
      modelNote.replaceChildren(el('span', { class: 'ic', html: ICON.warn }), el('span', {}, tr('settings.ai.modelBad', { why })),
        good ? el('button', { class: 'sv-link', onclick: () => { C.updateSettings({ [keyMain]: good.id }); paintModels(); } }, tr('settings.ai.useModel') + ' ', el('span', { dir: 'ltr' }, good.id)) : null);
    };
    const check = async (probe = false) => {
      setStatus('wait', probe ? tr('settings.ai.status.testing') : tr('settings.ai.status.checking'));
      checkBtn.disabled = true; testBtn.disabled = true;
      const cfg = cfgOf();
      const r = await C.api.aiModels(cfg, { probe, only: [cfg.model, cfg.fallback].filter(Boolean) }).catch((e) => ({ ok: false, error: { kind: 'offline', message: String(e) } }));
      checkBtn.disabled = false; testBtn.disabled = false;
      checkBtn.textContent = tr('settings.ai.checkAgain');
      if (r.ok) {
        // a plain refresh keeps the last test's results (and leaves out what that test found missing)
        const prev = !probe && models && models.some((m) => m.status) ? new Map(models.map((m) => [m.id, m])) : null;
        if (prev && !oai) { r.models = r.models.filter((m) => prev.has(m.id)).map((m) => ({ ...m, status: prev.get(m.id).status })); r.probed = set().aiProbedAt; }
        models = r.models;
        const cache = { ...(set().aiModelCache || {}) };
        cache[provider + '|' + cfgOf().baseUrl] = models;
        C.updateSettings({ aiModelCache: cache });
        if (r.probed && probe) C.updateSettings({ aiProbedAt: r.probed });
        if (oai && !cfgOf().model && models.length) C.updateSettings({ aiOaiModel: (models.find((m) => /flash|mini|free/i.test(m.id)) || models[0]).id });
        if (claude && !cfgOf().model && models.length) C.updateSettings({ aiClaudeModel: (models.find((m) => /haiku/i.test(m.id)) || models[0]).id });
        if (openai && !cfgOf().model && models.length) C.updateSettings({ aiOpenaiModel: (models.find((m) => /mini/i.test(m.id) && !/nano/i.test(m.id)) || models[0]).id });
        const live = models.filter((m) => m.status === 'ok' || m.status === 'minute').length;
        setStatus('ok', r.noList ? tr('settings.ai.status.connectedNoList') : r.probed && gem ? tr('settings.ai.status.connectedActive', { live: fa(live), total: fa(models.length) }) : tr('settings.ai.status.connectedModels', { count: fa(models.length) }));
        paintModels();
      } else {
        const [title] = errorText(r.error, check);
        setStatus('err', title);
      }
    };
    checkBtn.addEventListener('click', () => check(false));
    testBtn.addEventListener('click', () => check(true));
    const paintKey = async () => {
      const info = await C.api.aiKeyInfo(cfgOf()).catch(() => ({ has: false }));
      keyBox.replaceChildren();
      if (info.has && info.local) {
        keyBox.append(el('span', { class: 'fd-mask' }, tr('settings.ai.localNoKey')));
        if (!status.textContent) { setStatus('', tr('settings.ai.status.noKeyNeeded')); check(false); }
      } else if (info.has) {
        keyBox.append(el('span', { class: 'fd-mask', dir: 'ltr' }, info.mask),
          el('button', { class: 'fd-link', onclick: () => editKey() }, tr('settings.ai.changeKey')),
          el('button', { class: 'fd-link danger', onclick: async () => { await C.api.aiKeySet(cfgOf(), ''); setStatus('', tr('settings.ai.status.noKey')); paintKey(); } }, tr('common.delete')));
        if (!status.textContent) {
          setStatus('', tr('settings.ai.status.keySaved'));
          // a fresh test at most twice a day (each tested model costs one tiny request of its quota)
          const cached = models && models.length && models.some((m) => m.status);
          const old = !(set().aiProbedAt && Date.now() - set().aiProbedAt < 12 * 3600e3);
          if (!oai || s.aiBaseUrl) check(gem && (!cached || old));
        }
      } else {
        editKey();
        setStatus('', tr('settings.ai.status.noKey'));
      }
    };
    const editKey = () => {
      const inp = el('input', { type: 'password', class: 'fd-in ltr', placeholder: tr('settings.ai.pasteKey'), 'aria-label': tr('settings.ai.apiKey'), spellcheck: 'false', autocomplete: 'off' });
      const save = el('button', { class: 'set-select as-btn primary' }, tr('common.save'));
      const doSave = async () => {
        const v = inp.value.trim();
        if (!v) return;
        await C.api.aiKeySet(cfgOf(), v);
        await paintKey();
        check();
      };
      save.addEventListener('click', doSave);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
      keyBox.replaceChildren(inp, save);
      requestAnimationFrame(() => inp.focus());
    };
    paintKey();
    paintModels();
    const base = el('input', { type: 'text', class: 'fd-in ltr wide', value: s.aiBaseUrl || '', placeholder: tr('settings.ai.baseUrlPh'), 'aria-label': tr('settings.ai.baseUrl'), spellcheck: 'false' });
    // another address is another service: its own key and models
    const setBase = (u) => { C.updateSettings({ aiBaseUrl: u, aiOaiModel: '', aiOaiFallback: '' }); show('conn'); };
    base.addEventListener('change', () => setBase(base.value.trim().replace(/\/+$/, '')));
    const chips = el('div', { class: 'fd-presets', role: 'radiogroup', 'aria-label': tr('settings.ai.presets') },
      PRESETS.map(([n, u]) => el('button', { class: 'fd-preset' + (preset && preset[1] === u ? ' on' : ''), role: 'radio', 'aria-checked': String(!!preset && preset[1] === u), dir: 'ltr', onclick: () => setBase(u) }, n)));
    return [
      label(tr('settings.ai.provider')),
      el('div', { class: 'fd-pv set-free', role: 'radiogroup', 'aria-label': tr('settings.ai.provider') },
        prov('gemini', 'Gemini', tr('settings.ai.provider.geminiHint'), GEM, true),
        prov('anthropic', 'Claude', tr('settings.ai.provider.claudeHint'), CLA, true),
        prov('openai', 'OpenAI', tr('settings.ai.provider.openaiHint'), OPN, true),
        prov('oai', tr('settings.ai.provider.other'), tr('settings.ai.provider.otherHint'), OAI)),
      oai ? el('div', { class: 'lbl' }, tr('settings.ai.presets')) : null,
      oai ? el('div', { class: 'set-free fd-presetw' }, chips) : null,
      label(tr('settings.ai.tab.conn')),
      group(
        oai ? row(tr('settings.ai.baseUrl'), tr('settings.ai.baseUrlHint'), base) : null,
        row(tr('settings.ai.apiKey'), isLocal ? tr('settings.ai.apiKeyLocalHint') : tr('settings.ai.apiKeyHint'), keyBox),
        el('div', { class: 'row', 'data-s': tr('settings.ai.checkConn') }, status, el('span', { class: 'row-end' },
          keyUrl ? el('button', { class: 'sv-link', onclick: () => C.api.openUrl(keyUrl) }, gem ? tr('ai.noKey.getFree') : tr('settings.ai.getKey')) : null,
          checkBtn))),
      el('div', { class: 'lbl lbl-act' }, el('span', {}, tr('settings.ai.model')), testBtn),
      claude ? claudeHint : null,
      group(
        row(tr('settings.ai.mainModel'), null, modelWrap),
        row(tr('settings.ai.fallbackModel'), tr('settings.ai.fallbackHint'), fbWrap),
        modelNote),
      el('div', { class: 'lbl plain set-free' }, isLocal ? tr('settings.ai.privacy.local') : oai
        ? tr('settings.ai.privacy.oai')
        : claude ? tr('settings.ai.privacy.claude', { name: aiName() })
        : openai ? tr('settings.ai.privacy.openai', { name: aiName() })
        : tr('settings.ai.privacy.gemini', { name: aiName() })),
    ];
  }

  // --- name and icon ---
  function ident() {
    const s = set();
    const cur = charOf(s).id;
    const isOwn = (s.aiChar || '') === 'own' || (cur === 'own');
    const again = () => show('id');
    // tiles: the characters, the plain icons, and the user's own
    const tile = (id, name, pic, extra = '') => {
      const on = id === (isOwn ? 'own' : cur);
      return el('button', { class: 'fd-ch' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on), onclick: () => { pickChar(id); again(); } },
        el('span', { class: 'pic' + extra, html: pic }, on ? el('span', { class: 'ok', html: ICON.check }) : null), el('b', {}, name));
    };
    const ownFace = s.aiCharFace || s.aiIconCustom;
    const tiles = el('div', { class: 'fd-chg', role: 'radiogroup', 'aria-label': tr('settings.ai.char.label') },
      CHARS.map((c) => tile(c.id, c.name, imgHTML(c.full, ''))),
      tile('plain', tr('settings.ai.char.none'), S((AI_ICONS[s.aiIcon | 0] || AI_ICONS[0])[1])),
      tile('own', tr('settings.ai.char.own'), ownFace ? imgHTML(s.aiCharFull || ownFace, '') : S('M12 5v14M5 12h14'), ownFace ? '' : ' up'));
    // the user's own character: a face (needed) and a full figure (optional), made small on the way in
    const shrink = (file, size) => new Promise((res, rej) => {
      if (file.size > 10 * 1024 * 1024) { rej(new Error('big')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w0 = img.naturalWidth || size; const h0 = img.naturalHeight || size;
        const k = Math.min(1, size / Math.max(w0, h0));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res(cv.toDataURL('image/webp', 0.88));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad')); };
      img.src = url;
    });
    const slot = (key, title, hint, size, optional) => {
      const file = el('input', { type: 'file', accept: 'image/png,image/webp,image/svg+xml,image/jpeg', hidden: true });
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        try {
          const data = await shrink(f, size);
          const patch = { [key]: data, aiChar: 'own' };
          if (key === 'aiCharFace' && s.aiIconCustom) patch.aiIconCustom = null;
          C.updateSettings(patch); paintBrand(); again();
        } catch (e) { C.toast(e.message === 'big' ? tr('settings.ai.char.imgTooBig') : tr('settings.ai.char.imgBad'), 'warn'); }
      });
      const has = !!set()[key] || (key === 'aiCharFace' && !!s.aiIconCustom);
      const src = set()[key] || (key === 'aiCharFace' ? s.aiIconCustom : null);
      return el('div', { class: 'fd-slot' },
        el('span', { class: 'drop' + (has ? ' has' : ''), html: has ? imgHTML(src, '') : S('M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14') }),
        el('span', { class: 'tx' }, el('b', {}, title), el('small', {}, hint)),
        has && optional ? el('button', { class: 'sv-link danger', onclick: () => { C.updateSettings({ [key]: null }); paintBrand(); again(); } }, tr('common.delete')) : null,
        el('button', { class: 'set-select as-btn', onclick: () => file.click() }, has ? tr('settings.ai.char.replace') : tr('settings.ai.char.chooseFile')), file);
    };
    const nameIn = el('input', { type: 'text', class: 'fd-in', value: s.aiName || '', placeholder: isOwn ? tr('settings.ai.char.nameOwnPh') : tr('settings.ai.char.namePh'), 'aria-label': tr('settings.ai.char.nameLabel'), maxlength: '24', spellcheck: 'false' });
    const prev = el('div', { class: 'fd-prv2' });
    const paintPrev = () => {
      const ic = aiIconHTML(); const nm = aiName();
      prev.replaceChildren(
        el('span', { class: 'fd-pv-tb', title: tr('settings.ai.char.prevToolbar'), html: ic }),
        el('span', { class: 'fd-pv-pill', title: tr('settings.ai.char.prevTopBtn') }, el('span', {}, nm), el('span', { class: 'fc', html: ic })),
        el('span', { class: 'fd-pv-bub', title: tr('settings.ai.char.prevChat') }, el('span', { class: 't' }, tr('settings.ai.char.prevSample')), el('span', { class: 'fc', html: ic })),
        el('span', { class: 'fd-pv-wk', title: tr('settings.ai.char.prevWorking') }, workFig(32), el('span', { class: 'fd-work-tx', 'data-kind': 'rewrite' }, workText('rewrite')), dots()));
    };
    nameIn.addEventListener('input', () => {
      const v = nameIn.value.trim();
      C.updateSettings(isOwn ? { aiName: v, aiCharName: v } : { aiName: v });
      paintBrand(); paintPrev();
    });
    paintPrev();
    const plainGrid = cur === 'plain' && !isOwn ? el('div', { class: 'grp set-free' }, el('div', { class: 'fd-icg', role: 'radiogroup', 'aria-label': tr('settings.ai.char.iconLabel') },
      AI_ICONS.map(([n, d], i) => {
        const on = (s.aiIcon | 0) === i;
        return el('button', { class: 'fd-icp' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on), 'aria-label': tr(n), title: tr(n), html: S(d), onclick: () => { C.updateSettings({ aiIcon: i, aiChar: 'plain' }); paintBrand(); again(); } });
      }))) : null;
    return [
      label(tr('settings.ai.char.label')),
      el('div', { class: 'grp set-free' }, tiles),
      isOwn ? el('div', { class: 'grp set-free fd-slots' },
        slot('aiCharFace', tr('settings.ai.char.face'), tr('settings.ai.char.faceHint'), 256, false),
        slot('aiCharFull', tr('settings.ai.char.full'), tr('settings.ai.char.fullHint'), 384, true)) : null,
      plainGrid ? label(tr('settings.ai.char.icon')) : null,
      plainGrid,
      label(tr('settings.ai.char.nameSec')),
      group(row(tr('settings.ai.char.nameLabel'), tr('settings.ai.char.nameHint'), nameIn),
        row(tr('settings.ai.char.showName'), tr('settings.ai.char.showNameHint'), h.sw(() => set().aiShowName !== false, () => { C.updateSettings({ aiShowName: set().aiShowName === false }); paintBrand(); }, tr('settings.ai.char.showName')))),
      label(tr('settings.ai.char.preview')),
      el('div', { class: 'grp set-free' }, prev),
      isOwn ? el('div', { class: 'lbl plain set-free' }, tr('settings.ai.char.ownNote'))
        : el('div', { class: 'lbl plain set-free' }, tr('settings.ai.char.note')),
    ].filter(Boolean);
  }


  // --- behaviour ---
  function rules() {
    return [
      label(tr('settings.ai.rules.editSec')),
      group(
        row(tr('settings.ai.rules.preview'), tr('settings.ai.rules.previewHint'), sw(() => set().aiPreview !== false, () => C.updateSettings({ aiPreview: set().aiPreview === false }), tr('settings.ai.rules.preview'))),
        row(tr('settings.ai.rules.marks'), tr('settings.ai.rules.marksHint'), sw(() => set().aiMarks !== false, () => { C.updateSettings({ aiMarks: set().aiMarks === false }); C.refreshViews(); }, tr('settings.ai.rules.marks')))),
      label(tr('settings.ai.rules.replySec')),
      group(row(tr('settings.ai.rules.lang'), null, seg([['same', tr('settings.ai.rules.langSame')], ['fa', 'فارسی'], ['en', 'English']], () => set().aiLang || 'same', (v) => C.updateSettings({ aiLang: v })))),
      label(tr('settings.ai.rules.tabsSec')),
      group(
        row(tr('settings.ai.rules.tabNames'), tr('settings.ai.rules.tabNamesHint'), sw(() => set().aiTabNames !== false, () => C.updateSettings({ aiTabNames: set().aiTabNames === false }), tr('settings.ai.rules.tabNames'))),
        row(tr('settings.ai.rules.openName', { name: aiName() }), tr('settings.ai.rules.onSelection'), kb('Ctrl', 'J'))),
    ];
  }

  const body = el('div', { class: 'fd-setbody', hidden: !aiOn() }, tabs, pane);
  const master = group(row(tr('settings.section.ai'), tr('settings.ai.masterHint'), sw(() => aiOn(), () => {
    C.updateSettings({ aiEnabled: !aiOn() });
    if (!aiOn()) closeFedora();
    paintBrand();
    body.hidden = !aiOn();
  }, tr('settings.section.ai'))));
  wrap.append(master, body);
  wrap._show = show;
  show(wantSub || 'conn');
  wantSub = null;
  return [wrap];
}

// =====================================================================
// Phase 2: the whole document (button in the top bar, Ctrl+Shift+J)
// =====================================================================
const SUM_LEN = [['short', 'ai.sum.len.short'], ['medium', 'ai.sum.len.medium'], ['long', 'ai.sum.len.long']];
const SUM_FMT = [['para', 'ai.sum.fmt.para'], ['bullets', 'ai.sum.fmt.bullets']];
const SKIP_BLOCK = new Set(['code_block', 'math_block', 'math_display', 'html', 'hr', 'horizontal_rule', 'image-block', 'image_block', 'table']);
const docTitle = (t) => (C.tabTitle ? C.tabTitle(t) : tr('ai.doc.defaultTitle')).replace(/\.(md|markdown|txt)$/i, '');
const segRow = (opts, get, setv, label) => {
  const box = el('div', { class: 'fd-lv', role: 'radiogroup', 'aria-label': label });
  const paint = () => box.querySelectorAll('button').forEach((x) => { const on = x.dataset.v === get(); x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  for (const [v, l] of opts) box.append(el('button', { 'data-v': v, role: 'radio', onclick: () => { setv(v); paint(); } }, l));
  paint();
  return box;
};

export async function openDocFedora(t, anchor) {
  if (!t || !t.crepe || !aiOn()) return;
  if (openCard && openCard.anchor === anchor) { closeFedora(); return; }
  if (t.mode === 'source') { C.toast(tr('ai.toast.noSource', { name: aiName() }), 'info'); return; }
  const view = getView(t.crepe);
  const range = { from: 0, to: view.state.doc.content.size, doc: true, anchor };
  const info = await C.api.aiKeyInfo(cfgOf()).catch(() => ({ has: false }));
  const c = card('fd-menu fd-docmenu', tr('ai.doc.menuLabel', { name: aiName() }), t, range);
  c.anchor = anchor;
  anchor.classList.add('open');
  if (!info.has) {
    const gem = cfgOf().provider === 'gemini';
    c.box.classList.add('fd-nokey');
    c.box.append(
      el('div', { class: 'fd-nk-h' }, el('span', { class: 'ic', html: aiIconHTML() }), el('b', {}, tr('ai.noKey.title', { name: aiName() }))),
      el('p', {}, tr('ai.noKey.body')),
      el('div', { class: 'fd-foot end' },
        gem ? el('button', { class: 'fd-btn', onclick: () => C.api.openUrl('https://aistudio.google.com/apikey') }, tr('ai.noKey.getFree')) : null,
        el('button', { class: 'fd-btn primary', onclick: () => { closeFedora(); C.openSettings('ai'); } }, tr('ai.noKey.openSettings'))));
    c.place();
    return;
  }
  const st = set();
  const input = el('input', { type: 'text', placeholder: tr('ai.doc.askPh'), 'aria-label': tr('ai.doc.askLabel'), spellcheck: 'false' });
  const send = el('button', { class: 'fd-send', 'aria-label': tr('ai.send'), title: tr('ai.send'), html: I.send });
  let sub = null; let hoverT = null;
  const closeSub = () => { if (sub) { sub.remove(); sub = null; } c.box.querySelectorAll('.fd-mi.on').forEach((n) => n.classList.remove('on')); };
  const openSub = (b, build, toggle) => {
    if (sub && sub._from === b) { if (toggle && sub._click) closeSub(); else if (toggle) sub._click = true; return; }
    closeSub();
    b.classList.add('on');
    sub = el('div', { class: 'fd-sub', role: 'menu' }, build());
    sub._from = b;
    sub._click = !!toggle;
    sub.addEventListener('mouseenter', () => clearTimeout(hoverT));
    c.box.append(sub);
    const br = b.getBoundingClientRect(); const cr = c.box.getBoundingClientRect();
    sub.style.top = Math.max(0, Math.min(br.top - cr.top - 6, innerHeight - cr.top - sub.offsetHeight - 10)) + 'px';
    if (langDir() === 'ltr') {
      if (cr.right + sub.offsetWidth + 6 > innerWidth - 8) sub.style.right = 'calc(100% + 6px)';
      else sub.style.left = 'calc(100% + 6px)';
    } else if (cr.left - sub.offsetWidth - 6 < 8) sub.style.left = 'calc(100% + 6px)';
    else sub.style.right = 'calc(100% + 6px)';
    const f = sub.querySelector('input'); if (f) f.focus();
  };
  const item = (icon, label, run, hasSub) => {
    const b = el('button', { class: 'fd-mi', role: 'menuitem', 'aria-haspopup': hasSub ? 'menu' : null }, el('span', { class: 'ic', html: icon }), el('span', { class: 't' }, label), hasSub ? el('span', { class: 'ch', html: I.sub }) : null);
    b.addEventListener('click', () => run(b, true));
    b.addEventListener('mouseenter', () => {
      clearTimeout(hoverT);
      if (!hasSub) { hoverT = setTimeout(closeSub, 120); return; }
      if (sub && sub._from === b) return;
      hoverT = setTimeout(() => { if (b.matches(':hover')) run(b, false); }, 160);
    });
    b.addEventListener('mouseleave', () => clearTimeout(hoverT));
    return b;
  };
  const go = (fn) => () => { closeFedora(); fn(); };
  const toneSub = (b, tg) => openSub(b, () => [...TONES.map((x) => {
    const r = el('button', { class: 'fd-mi', role: 'menuitem' }, el('span', { class: 't' }, tr(x[1])), el('small', {}, tr(x[2])));
    r.addEventListener('click', go(() => runReview(t, toneAction(x))));
    return r;
  }), el('div', { class: 'fd-hint' }, tr('ai.doc.toneHint'))], tg);
  const sumSub = (b, tg) => openSub(b, () => {
    let len = st.aiSumLen || 'medium'; let fmt = st.aiSumFmt || 'bullets';
    const goBtn = el('button', { class: 'fd-btn primary wide' }, tr('ai.sum.run'));
    goBtn.addEventListener('click', go(() => { C.updateSettings({ aiSumLen: len, aiSumFmt: fmt }); runOutput(t, 'summary', { len, fmt }); }));
    return [el('div', { class: 'fd-mh' }, tr('ai.sum.length')), segRow(SUM_LEN.map(([v, lk]) => [v, tr(lk)]), () => len, (v) => { len = v; }, tr('ai.sum.lengthLabel')),
      el('div', { class: 'fd-mh' }, tr('ai.sum.format')), segRow(SUM_FMT.map(([v, lk]) => [v, tr(lk)]), () => fmt, (v) => { fmt = v; }, tr('ai.sum.formatLabel')),
      el('div', { class: 'fd-hint' }, tr('ai.sum.hint')), goBtn];
  }, tg);
  const explSub = (b, tg) => openSub(b, () => {
    let level = st.aiLevel || 'simple'; let example = st.aiExample !== false;
    const ck = el('button', { class: 'fd-ck' + (example ? ' on' : ''), role: 'checkbox', 'aria-checked': String(example) }, el('span', { class: 'bx', html: ICON.check }), tr('ai.explain.withExample'));
    ck.addEventListener('click', () => { example = !example; ck.classList.toggle('on', example); ck.setAttribute('aria-checked', String(example)); });
    const goBtn = el('button', { class: 'fd-btn primary wide' }, tr('ai.doc.explainRun'));
    goBtn.addEventListener('click', go(() => { C.updateSettings({ aiLevel: level, aiExample: example }); runOutput(t, 'explain', { level, example }); }));
    return [el('div', { class: 'fd-mh' }, tr('ai.explain.level')), segRow(LEVELS.map(([v, lk]) => [v, tr(lk)]), () => level, (v) => { level = v; }, tr('ai.explain.level')), ck, goBtn];
  }, tg);
  const trSub = (b, tg) => openSub(b, () => {
    const q = el('input', { type: 'text', placeholder: tr('translate.searchPh'), 'aria-label': tr('translate.searchLabel'), spellcheck: 'false' });
    const list = el('div', { class: 'fd-langs', role: 'listbox' });
    let rows = []; let focus = -1;
    const pick = (code) => { C.updateSettings({ aiTrRecent: [code, ...(set().aiTrRecent || []).filter((x) => x !== code)].slice(0, 3) }); closeFedora(); runOutput(t, 'translate', { lang: code }); };
    const isEn = getLang() === 'en';
    const row = (l) => { const r = el('button', { class: 'fd-lr', role: 'option' }, el('span', { class: 'n' }, isEn ? l[2] : l[1]), el('span', { class: 'en', dir: isEn ? 'rtl' : 'ltr' }, isEn ? l[1] : l[2])); r.addEventListener('click', () => pick(l[0])); r.addEventListener('mousemove', () => setF(rows.indexOf(r))); rows.push(r); return r; };
    const setF = (i) => { if (!rows.length) return; focus = (i + rows.length) % rows.length; rows.forEach((x, k) => x.classList.toggle('focus', k === focus)); rows[focus].scrollIntoView({ block: 'nearest' }); };
    const paint = () => {
      const f = q.value.trim(); const fl = f.toLowerCase();
      rows = []; list.replaceChildren(); focus = -1;
      if (!f) {
        const rec = [...new Set([...(set().aiTrRecent || []), 'en', 'fa', 'ar'])].map((cd) => LANGS.find((l) => l[0] === cd)).filter(Boolean).slice(0, 3);
        list.append(el('div', { class: 'fd-mh' }, tr('ai.tr.recent')), ...rec.map(row), el('div', { class: 'fd-mh' }, tr('ai.tr.allLangs')), ...LANGS.filter((l) => !rec.includes(l)).map(row));
      } else {
        const hit = LANGS.filter((l) => l[1].includes(f) || l[2].toLowerCase().includes(fl));
        list.append(...hit.map(row));
        if (!hit.length) list.append(el('div', { class: 'fd-mempty' }, tr('ai.tr.notFound', { query: f })));
        if (hit.length) setF(0);
      }
    };
    q.addEventListener('input', paint);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setF(focus + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); setF(focus - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (focus >= 0) rows[focus].click(); }
    });
    paint();
    return [el('label', { class: 'fd-ms' }, el('span', { class: 'ic', html: ICON.search }), q), list,
      el('div', { class: 'fd-hint ok' }, tr('ai.tr.hint'))];
  }, tg);
  const change = [
    builtOn('clean') ? item(I.clean, tr('ai.doc.clean'), go(() => runReview(t, ACTIONS.clean))) : null,
    builtOn('tone') ? item(I.tone, tr('ai.doc.tone'), toneSub, true) : null,
  ].filter(Boolean);
  const outs = [
    builtOn('summary') ? item(S('M4 6h16M4 10h10M4 14h16M4 18h7'), tr('ai.doc.summary'), sumSub, true) : null,
    builtOn('explain') ? item(I.explain, tr('ai.doc.explain'), explSub, true) : null,
    builtOn('dev') ? item(S('M8 7.5L3.5 12L8 16.5M16 7.5L20.5 12L16 16.5M13.5 5l-3 14'), tr('ai.doc.dev'), go(() => runOutput(t, 'dev', {}))) : null,
    builtOn('translate') ? item(I.translate, tr('ai.doc.translate'), trSub, true) : null,
  ].filter(Boolean);
  const mine = prompts().filter(forDoc);
  const blocks = [];
  if (change.length) blocks.push([el('div', { class: 'fd-mh' }, tr('ai.doc.secEdit'), el('em', {}, tr('ai.doc.secEditSub'))), ...change]);
  if (outs.length) blocks.push([el('div', { class: 'fd-mh' }, tr('ai.doc.secNewTab'), el('em', {}, tr('ai.doc.secNewTabSub'))), ...outs]);
  if (mine.length) blocks.push([el('div', { class: 'fd-mh' }, tr('ai.myPrompts')), ...mine.map((p) => promptItem(p, go(() => runPrompt(t, range, p)), closeSub, () => clearTimeout(hoverT)))]);
  c.box.append(
    ...scopeSeg(t, 'doc', anchor).filter(Boolean),
    el('label', { class: 'fd-ask' }, el('span', { class: 'ic', html: aiIconHTML() }), input, send),
    ...blocks.flatMap((b, i) => (i ? [el('div', { class: 'fd-sep' }), ...b] : b)),
    el('div', { class: 'fd-foot' }, el('span', { class: 'fd-k' }, kb('Ctrl', 'Shift', 'J'), tr('ai.doc.shortcut')),
      el('button', { class: 'fd-link', onclick: () => { closeFedora(); openPromptSettings(); } }, tr('ai.managePrompts'))));
  const free = () => { const q = input.value.trim(); if (!q) return; closeFedora(); runDocFree(t, anchor, q); };
  send.addEventListener('click', (e) => { e.preventDefault(); free(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); free(); } });
  input.addEventListener('input', () => send.classList.toggle('on', !!input.value.trim()));
  c.place();
  requestAnimationFrame(() => input.focus());
}

// ---------- reviewing suggestions for the whole document, block by block ----------
const reviewKey = new PluginKey('nv-ai-review');
export const reviewPlugin = $prose(() => new Plugin({
  key: reviewKey,
  state: {
    init: () => ({ items: [], cur: null, groups: [] }),
    apply(tr, prev) {
      const meta = tr.getMeta(reviewKey);
      let { items, cur, groups } = prev;
      if (tr.docChanged) {
        const mp = (x) => ({ ...x, from: tr.mapping.map(x.from, 1), to: tr.mapping.map(x.to, -1) });
        items = items.map(mp).filter((x) => x.to > x.from);
        groups = groups.map(mp);
      }
      if (meta) {
        if (meta.items) items = meta.items;
        if (meta.add) items = [...items, ...meta.add];
        if (meta.remove) items = items.filter((x) => !meta.remove.includes(x.id));
        if (meta.groups) groups = meta.groups;
        if ('cur' in meta) cur = meta.cur;
      }
      if (cur && !items.some((x) => x.id === cur)) cur = null;
      return items === prev.items && cur === prev.cur && groups === prev.groups ? prev : { items, cur, groups };
    },
  },
  props: {
    decorations(state) {
      const { items, cur } = reviewKey.getState(state);
      if (!items.length) return null;
      const doc = state.doc;
      const decos = [];
      for (const it of items) {
        if (it.to > doc.content.size) continue;
        doc.nodesBetween(it.from, it.to, (node, pos) => {
          if (pos >= it.from && pos + node.nodeSize <= it.to && node.isBlock) { decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'fd-sug-old' + (it.id === cur ? ' cur' : '') })); return false; }
          return true;
        });
        decos.push(Decoration.widget(it.to, () => sugWidget(it), { side: 1, key: 'sug' + it.id + (it.id === cur ? 'c' : ''), ignoreSelection: true, stopEvent: () => true }));
      }
      return DecorationSet.create(doc, decos);
    },
  },
}));
const reviewOf = (t) => (t && t.crepe ? reviewKey.getState(getView(t.crepe).state) : { items: [], cur: null, groups: [] });
const sugView = new Map(); // suggestion id -> 'final' | 'diff' (the final text first)
function sugWidget(it) {
  const box = el('div', { class: 'fd-sug' + (it.cur ? ' cur' : ''), contenteditable: 'false', 'data-sug': it.id });
  const view = sugView.get(it.id) || 'final';
  // the final text, as it will read
  const fin = el('div', { class: 'fd-sug-fin', dir: dirOfText(it.newText) || 'auto' }, mdLite(it.newMd || it.newText));
  // the changes, line by line, each with the same direction rule as the document (any Persian letter → right to left)
  const diff = el('div', { class: 'fd-sug-txt', dir: dirOfText(it.newText) || 'auto' });
  const parts = wordDiff(it.oldText, it.newText) || [{ value: it.newText }];
  const lines = [[]];
  for (const p of parts) String(p.value).split('\n').forEach((seg, i) => { if (i) lines.push([]); if (seg) lines[lines.length - 1].push({ ...p, value: seg }); });
  for (const ln of lines) {
    const own = ln.filter((p) => !p.removed).map((p) => p.value).join('') || ln.map((p) => p.value).join('');
    const row = el('div', { class: 'ln', dir: dirOfText(own) || 'auto' });
    if (!ln.length) row.append(el('br'));
    for (const p of ln) row.append(p.added ? el('ins', {}, p.value) : p.removed ? el('del', {}, p.value) : document.createTextNode(p.value));
    diff.append(row);
  }
  fin.hidden = view !== 'final'; diff.hidden = view !== 'diff';
  const tab = (k, l) => el('button', { class: 'fd-sug-v' + (view === k ? ' on' : ''), role: 'tab', 'aria-selected': String(view === k), 'data-view': k, 'data-id': it.id }, l);
  box.append(
    el('div', { class: 'fd-sug-h' }, el('span', { class: 'ic', html: aiIconHTML() }), el('span', {}, tr('ai.review.suggestion')),
      el('span', { class: 'fd-sug-tabs', role: 'tablist' }, tab('final', tr('ai.review.tabResult')), tab('diff', tr('ai.review.tabChanges'))),
      el('span', { class: 'sp' }),
      el('button', { class: 'fd-sug-b no', 'data-act': 'no', 'data-id': it.id, title: tr('ai.review.rejectTitle'), 'aria-label': tr('common.reject') }, el('span', { class: 'ic', html: ICON.x }), tr('common.reject')),
      el('button', { class: 'fd-sug-b', 'data-act': 'tab', 'data-id': it.id, title: tr('ai.review.untouched') }, el('span', { class: 'ic', html: ICON.file || ICON.plus }), tr('ai.review.inNewDoc')),
      el('button', { class: 'fd-sug-b ok', 'data-act': 'ok', 'data-id': it.id }, el('span', { class: 'ic', html: ICON.check }), tr('ai.review.applyHere'))),
    fin, diff);
  return box;
}
/** the document as it would be with these suggestions applied (the document itself is not touched) */
function docWith(t, ids) {
  const view = getView(t.crepe);
  let tr = view.state.tr;
  const list = reviewOf(t).items.filter((x) => ids.includes(x.id)).sort((a, b) => b.from - a.from);
  for (const it of list) tr = replaceRange(t, { from: it.from, to: it.to, inline: false }, it.newMd, tr).tr;
  return markdownOfDoc(t.crepe, tr.doc);
}
async function toNewDoc(t, ids, rv) {
  const md = docWith(t, ids);
  rejectItems(t, ids);
  const n = await C.newTabBeside(t, { content: md, title: `${rv.cmd}: ${docTitle(t)}` });
  if (n) C.toast(tr('ai.review.openedNewDoc'), 'ok');
  return n;
}

/** one transaction: the given suggestions applied from the end backwards (earlier positions stay valid) */
function acceptItems(t, ids, rv) {
  const view = getView(t.crepe);
  const { items } = reviewOf(t);
  const list = items.filter((x) => ids.includes(x.id)).sort((a, b) => b.from - a.from);
  if (!list.length) return 0;
  if (t.locked) { C.showLocked(); return 0; }
  let tx = view.state.tr;
  const marks = [];
  const done = [];
  for (const it of list) {
    let cur;
    try { cur = tx.doc.textBetween(it.from, it.to, '\n', ' ').trim(); } catch { continue; }
    // the user changed this part meanwhile: the suggestion no longer fits
    if (cur !== it.oldText) { done.push(it.id); continue; }
    const r = replaceRange(t, { from: it.from, to: it.to, inline: false }, it.newMd, tx);
    tx = r.tr;
    marks.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), time: Date.now(), cmd: rv.cmd, scope: tr('ai.scope.doc'), inline: false,
      from: r.from, to: r.to, beforeMd: it.oldMd, afterMd: it.newMd, beforeText: it.oldText, afterText: r.tr.doc.textBetween(r.from, r.to, '\n', ' ').trim(), hist: rv.hist });
    done.push(it.id);
  }
  const mapped = marks;
  closeHistory(tx);
  tx.setMeta(reviewKey, { remove: done });
  view.dispatch(tx.scrollIntoView());
  view.dispatch(closeHistory(view.state.tr));
  // positions: each replacement happened at a lower position than the ones before it, so the earlier
  // markers moved by the later edits; find them again by their text
  const doc = getView(t.crepe).state.doc;
  const placed = mapped.map((m) => ({ ...m, ...(locate(doc, m) || { from: m.from, to: m.to }) })).filter((m) => m.to <= doc.content.size);
  if (placed.length) view.dispatch(view.state.tr.setMeta(markKey, { set: [...marksOf(t), ...placed] }).setMeta('addToHistory', false));
  rv.accepted += placed.length;
  persistMarks(t);
  C.marksChanged(t);
  return placed.length;
}
function rejectItems(t, ids) {
  const view = getView(t.crepe);
  view.dispatch(view.state.tr.setMeta(reviewKey, { remove: ids }).setMeta('addToHistory', false));
}

/** the floating stack at the bottom centre of a tab (review bar, output bar, their errors) */
function floatBox(t) {
  let f = t.pane.querySelector(':scope > .fd-float');
  if (!f) { f = el('div', { class: 'fd-float' }, el('div', { class: 'fd-float-in' })); }
  t.pane.append(f); // always the last child, so it sticks to the bottom of the view
  return f.firstChild;
}
let reviewRun = new WeakMap(); // tab -> { bar, cmd, hist, accepted, total, busy, cancel, paint }
function reviewBar(t, rv) {
  const bar = el('div', { class: 'fd-review', dir: langDir(), role: 'toolbar', 'aria-label': tr('ai.review.barLabel', { name: aiName() }) });
  floatBox(t).append(bar);
  const focusItem = (dir) => {
    const { items, cur } = reviewOf(t);
    if (!items.length) return;
    const sorted = [...items].sort((a, b) => a.from - b.from);
    let i = sorted.findIndex((x) => x.id === cur);
    i = i < 0 ? 0 : (i + dir + sorted.length) % sorted.length;
    const it = sorted[i];
    const v = getView(t.crepe);
    v.dispatch(v.state.tr.setMeta(reviewKey, { cur: it.id }).setMeta('addToHistory', false));
    const node = t.pane.querySelector(`[data-sug="${it.id}"]`);
    if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    rv.paint();
  };
  rv.paint = () => {
    const { items, cur } = reviewOf(t);
    const sorted = [...items].sort((a, b) => a.from - b.from);
    const idx = sorted.findIndex((x) => x.id === cur);
    const finished = !rv.busy && !items.length;
    bar.replaceChildren(...[
      rv.busy ? workFig(36) : el('b', { class: 'fd-brand' }, el('span', { class: 'ic', html: aiIconHTML() }), el('span', { class: 'nm' }, rv.cmd)),
      rv.busy ? el('span', { class: 'fd-wk' }, ...workLine(rv.kind || 'rewrite'), rv.total > 1 ? el('small', {}, tr('ai.partOf', { done: fa(rv.done + 1), total: fa(rv.total) })) : null) : null,
      rv.busy && !items.length ? null : el('span', { class: 'cnt' }, finished ? (rv.accepted ? tr('ai.review.doneApplied', { count: fa(rv.accepted) }) : (rv.found ? tr('ai.review.done') : tr('ai.review.noSuggestions'))) : rv.accepted ? tr('ai.review.countAccepted', { count: fa(items.length), accepted: fa(rv.accepted) }) : tr('ai.review.count', { count: fa(items.length) })),
      items.length ? el('div', { class: 'fd-nav' },
        el('button', { 'aria-label': tr('ai.review.prev'), title: tr('ai.review.prev'), html: ICON.chevUp, onclick: () => focusItem(-1) }),
        el('span', {}, idx >= 0 ? tr('ai.indexOf', { current: fa(idx + 1), total: fa(items.length) }) : fa(items.length)),
        el('button', { 'aria-label': tr('ai.review.next'), title: tr('ai.review.next'), html: ICON.chevDown, onclick: () => focusItem(1) })) : null,
      el('span', { class: 'sp' }),
      items.length ? el('button', { class: 'fd-btn ghost sm', onclick: () => { rejectItems(t, items.map((x) => x.id)); rv.paint(); maybeEnd(); } }, tr('ai.review.rejectAll')) : null,
      items.length && !rv.busy ? el('button', { class: 'fd-btn sm', title: tr('ai.review.untouched'), onclick: () => { toNewDoc(t, items.map((x) => x.id), rv).then(() => { rv.paint(); maybeEnd(); }); } }, rv.accepted ? tr('ai.review.restNewDoc') : tr('ai.review.allNewDoc')) : null,
      items.length ? el('button', { class: 'fd-btn primary sm', onclick: () => { acceptItems(t, items.map((x) => x.id), rv); rv.paint(); maybeEnd(); } }, rv.accepted ? tr('ai.review.applyRest') : tr('ai.review.applyAll')) : null,
      rv.busy ? el('button', { class: 'fd-btn sm', onclick: () => rv.cancel && rv.cancel() }, el('span', { class: 'ic', html: I.stop }), tr('common.stop')) : null,
      el('button', { class: 'fd-x', 'aria-label': tr('ai.review.close'), title: tr('ai.review.close'), html: ICON.x, onclick: () => endReview(t) })].filter(Boolean));
  };
  const maybeEnd = () => {
    const { items } = reviewOf(t);
    if (!rv.busy && !items.length) { finishHistory(t, rv); setTimeout(() => { if (reviewRun.get(t) === rv && !reviewOf(t).items.length) endReview(t); }, 2500); }
  };
  rv.maybeEnd = maybeEnd;
  rv.bar = bar;
  rv.paint();
}
function finishHistory(t, rv) {
  if (rv.histDone || !rv.accepted || !t.path) return;
  rv.histDone = true;
  C.api.historyAdd(t.path, t.crepe.getMarkdown(), 'ai', rv.cmd).catch(() => {});
}
function endReview(t) {
  const rv = reviewRun.get(t);
  if (!rv) return;
  if (rv.busy && rv.cancel) rv.cancel();
  rv.busy = false;
  finishHistory(t, rv);
  if (t.crepe) { const v = getView(t.crepe); v.dispatch(v.state.tr.setMeta(reviewKey, { items: [], groups: [], cur: null }).setMeta('addToHistory', false)); }
  rv.bar.remove();
  reviewRun.delete(t);
}

/** the document's text blocks, in groups small enough for one request each */
function blockGroups(doc, max = 2600) {
  const groups = [];
  let g = null;
  doc.forEach((node, pos) => {
    const skip = SKIP_BLOCK.has(node.type.name) || !node.textContent.trim();
    if (skip) { g = null; return; }
    const len = node.textContent.length;
    if (!g || g.len + len > max) { g = { from: pos, to: pos + node.nodeSize, len: 0 }; groups.push(g); }
    g.to = pos + node.nodeSize; g.len += len;
  });
  return groups;
}
const blocksIn = (doc, from, to) => { const out = []; doc.forEach((node, pos) => { if (pos >= from && pos + node.nodeSize <= to) out.push({ node, pos }); }); return out; };

async function runReview(t, action, presetMd = null) {
  if (!(await noticeOk())) return;
  if (reviewRun.get(t)) endReview(t);
  const view = getView(t.crepe);
  const doc = view.state.doc;
  const groups = presetMd != null ? [{ from: 0, to: doc.content.size }] : blockGroups(doc);
  if (!groups.length) { C.toast(tr('ai.review.noText'), 'info'); return; }
  let hist = null;
  if (t.path) { const r = await C.api.historyAdd(t.path, t.crepe.getMarkdown(), 'auto').catch(() => null); hist = r && r.id; }
  const ids = groups.map((_g, i) => 'g' + i);
  view.dispatch(view.state.tr.setMeta(reviewKey, { items: [], groups: groups.map((g, i) => ({ id: ids[i], from: g.from, to: g.to })), cur: null }).setMeta('addToHistory', false));
  const rv = { cmd: action.label, kind: action.kind || 'rewrite', hist, accepted: 0, total: groups.length, done: 0, busy: true, found: 0, cancel: null };
  reviewRun.set(t, rv);
  reviewBar(t, rv);
  let stopped = false;
  rv.cancel = () => { stopped = true; if (rv.job) rv.job.cancel(); };
  const sys = editSystem() + '\nThe text is several blocks (paragraphs, headings, list items) separated by blank lines. Keep exactly the same blocks in the same order, one for one, separated by blank lines.';
  for (let i = 0; i < groups.length && !stopped; i++) {
    const g = reviewOf(t).groups.find((x) => x.id === ids[i]);
    if (!g || g.to <= g.from) { rv.done++; continue; }
    const md = markdownOf(t.crepe, g.from, g.to);
    let out;
    if (presetMd != null) out = presetMd;
    else {
      rv.job = runJob({ system: sys, messages: [{ role: 'user', text: `Instruction: ${action.instr}\n\nText:\n${md}` }], temperature: 0.3 });
      try { out = cleanReply((await rv.job.promise).text); } catch (e) {
        if (e && e.kind === 'cancelled') break;
        rv.busy = false; rv.paint();
        const [title, text] = errorText(e, () => {});
        C.toast(`${title}. ${text}`, 'err');
        break;
      }
    }
    // pair the old blocks with the new ones; a different count becomes one suggestion for the whole part
    const cur = reviewOf(t).groups.find((x) => x.id === ids[i]);
    const d = getView(t.crepe).state.doc;
    const olds = blocksIn(d, cur.from, cur.to);
    let parsed;
    try { parsed = parseMarkdown(t.crepe, out); } catch { parsed = null; }
    const add = [];
    const mk = (from, to, newMd, oldMd) => {
      const oldText = d.textBetween(from, to, '\n', ' ').trim();
      const newText = plainOfMd(t, newMd);
      if (oldText.replace(/\s+/g, ' ') === newText.replace(/\s+/g, ' ')) return;
      add.push({ id: 's' + Math.random().toString(36).slice(2, 9), from, to, newMd, oldMd, oldText, newText });
    };
    if (parsed && parsed.childCount === olds.length) {
      olds.forEach((o, k) => {
        const newNode = parsed.child(k);
        let one; try { one = markdownOfNode(t.crepe, newNode); } catch { one = newNode.textContent; }
        mk(o.pos, o.pos + o.node.nodeSize, one, markdownOf(t.crepe, o.pos, o.pos + o.node.nodeSize));
      });
    } else if (out.trim()) mk(cur.from, cur.to, out, md);
    rv.found += add.length;
    if (add.length) {
      const v = getView(t.crepe);
      const first = !reviewOf(t).items.length;
      v.dispatch(v.state.tr.setMeta(reviewKey, first ? { add, cur: add[0].id } : { add }).setMeta('addToHistory', false));
      if (first) requestAnimationFrame(() => { const n = t.pane.querySelector(`[data-sug="${add[0].id}"]`); if (n) n.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    }
    rv.done++;
    rv.paint();
  }
  rv.busy = false;
  if (reviewRun.get(t) === rv) { rv.paint(); rv.maybeEnd(); }
}
// a click on a suggestion's buttons inside the document
function onSugClick(e) {
  const v = e.target.closest && e.target.closest('.fd-sug-v');
  if (v) {
    e.preventDefault(); e.stopPropagation();
    const box = v.closest('.fd-sug');
    sugView.set(v.dataset.id, v.dataset.view);
    box.querySelectorAll('.fd-sug-v').forEach((x) => { const on = x === v; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
    box.querySelector('.fd-sug-fin').hidden = v.dataset.view !== 'final';
    box.querySelector('.fd-sug-txt').hidden = v.dataset.view !== 'diff';
    return;
  }
  const b = e.target.closest && e.target.closest('.fd-sug-b');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const t = C.tabOf(b);
  const rv = t && reviewRun.get(t);
  if (!rv) return;
  if (b.dataset.act === 'ok') acceptItems(t, [b.dataset.id], rv);
  else if (b.dataset.act === 'tab') { toNewDoc(t, [b.dataset.id], rv).then(() => { rv.paint(); rv.maybeEnd(); }); }
  else rejectItems(t, [b.dataset.id]);
  // the next suggestion becomes the current one
  const { items } = reviewOf(t);
  if (items.length) { const v = getView(t.crepe); v.dispatch(v.state.tr.setMeta(reviewKey, { cur: [...items].sort((x, y) => x.from - y.from)[0].id }).setMeta('addToHistory', false)); }
  rv.paint(); rv.maybeEnd();
}

// ---------- a free instruction for the whole document ----------
async function runDocFree(t, anchor, q) {
  if (!(await noticeOk())) return;
  const view = getView(t.crepe);
  const md = t.crepe.getMarkdown();
  if (md.length > 60000) { C.toast(tr('ai.doc.tooLongFree'), 'warn'); return; }
  const range = { from: 0, to: view.state.doc.content.size, doc: true, anchor };
  const c = card('fd-diff', aiName(), t, range);
  const short = q.length > 30 ? q.slice(0, 30) + '…' : q;
  let job = null;
  c.onClose = () => job && job.cancel();
  const paintWait = () => {
    c.box.replaceChildren(brandHead(el('span', { class: 'fd-q' }, `«${short}»`)),
      el('div', { class: 'fd-body' }, el('div', { class: 'fd-txt' }, el('span', { class: 'fd-busy' }, el('span', { class: 'fd-spin' }), tr('ai.doc.thinking')))),
      el('div', { class: 'fd-foot' }, el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: () => job && job.cancel() }, el('span', { class: 'ic', html: I.stop }), tr('common.stop'), kb('Esc'))));
    c.place();
  };
  paintWait();
  const sys = editSystem() + '\n\n' + FREE_SYSTEM_TAIL + '\n' + langRule().replace('the answer', 'any answer') + '\nFor [[EDIT]] return the whole document.';
  job = runJob({ system: sys, messages: [{ role: 'user', text: `Instruction: ${q}\n\nText:\n${md}` }], temperature: 0.4 });
  job.promise.finally(startWork(t, 'think', () => job && job.cancel()));
  job.promise.then((r) => {
    const raw = String(r.text || '');
    const out = cleanReply(raw);
    c.onClose = null;
    if (/^\s*\[\[ANSWER\]\]/.test(raw)) { runAnswer(t, range, { kind: 'free-answer', question: q, answer: out }); return; }
    closeFedora();
    runReview(t, { label: `«${short}»`, instr: q }, out);
  }).catch((e) => {
    if (e && e.kind === 'cancelled') { closeFedora(); return; }
    c.box.replaceChildren(brandHead(el('span', { class: 'fd-q' }, `«${short}»`)), el('div', { class: 'fd-body' }, errBox(e, () => { closeFedora(); runDocFree(t, anchor, q); })),
      el('div', { class: 'fd-foot' }, el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: closeFedora }, tr('common.close'))));
    c.place();
  });
}

// ---------- outputs in a new tab: summary, explanation, developer document, translation ----------
const OUT_ICON = {
  summary: 'M4 6h16M4 10h10M4 14h16M4 18h7',
  explain: 'M12 17v.01M12 13.5c0-2 2.5-2 2.5-4a2.5 2.5 0 0 0-5 0M21.25 12a9.25 9.25 0 1 1-18.5 0a9.25 9.25 0 0 1 18.5 0z',
  dev: 'M8 7.5L3.5 12L8 16.5M16 7.5L20.5 12L16 16.5M13.5 5l-3 14',
  translate: 'M3 5.5h9M7.5 3.5v2M5 5.5c.9 3.2 3.2 5.8 6.5 7.3M10 5.5c-.9 3.2-3.2 5.8-6.5 7.3M12.5 20.5l4-9l4 9M13.8 17.5h5.4',
};
export const outIcon = (kind, icon) => S(kind === 'prompt' ? pIcon(icon) : OUT_ICON[kind] || OUT_ICON.summary);
const langName = (code) => { const l = LANGS.find((x) => x[0] === code); return l ? (getLang() === 'en' ? l[2] : l[1]) : code; };
const langEn = (code) => { const l = LANGS.find((x) => x[0] === code); return l ? l[2] : code; };
const MAX_DOC = 120000;

function outPrompt(kind, o, title) {
  const lang = langRule().replace('the answer', 'it');
  if (kind === 'summary') {
    const len = { short: 'short: 3 to 5 sentences in total', medium: 'medium: about one fifth of the document', long: 'detailed: follow the document’s own headings, with a short summary under each' }[o.len || 'medium'];
    const fmt = o.fmt === 'para' ? 'Write it as paragraphs.' : 'Write it as bullet points (one idea per bullet).';
    return { system: `You summarize documents. Write the summary as Markdown in the document’s language. Start with a level-1 heading «خلاصه: ${title}» (in English documents: "Summary: ${title}"). Length: ${len}. ${fmt} Keep facts, numbers and names exactly; add nothing that is not in the document. Reply with only the summary.`, label: tr('ai.out.summaryOf', { len: tr((SUM_LEN.find((x) => x[0] === (o.len || 'medium')) || SUM_LEN[1])[1]) }) };
  }
  if (kind === 'explain') {
    return { system: `You explain documents to a reader. ${lang} Explanation level: ${LEVEL_EN[o.level || 'simple']}. Write Markdown with short sections. Start with a level-1 heading «توضیح: ${title}» (in English: "Explanation: ${title}"). Go through the main ideas in the document’s order, in plain words.${o.example ? ' After each main idea add a short concrete example under a "### مثال" heading ("### Example" in English).' : ''} Do not invent facts. Reply with only the explanation.`, label: tr('ai.out.explainOf', { level: tr((LEVELS.find((x) => x[0] === (o.level || 'simple')) || LEVELS[0])[1]) }) };
  }
  if (kind === 'dev') {
    return { system: `You turn documents into developer-ready specifications. Write Markdown in the document’s language with these sections (translate the headings into the document’s language): # ${title}: سند فنی; ## هدف; ## کاربران و سناریوها; ## User Stories (“به‌عنوان … می‌خواهم … تا …”); ## معیارهای پذیرش (a checklist, “- [ ] …”); ## حالت‌های مرزی و خطاها; ## داده‌ها و رابط‌ها (only if they can be inferred); ## پرسش‌های باز. Use only what the document says; mark every assumption with “(فرض)”. Reply with only the document.`, label: tr('ai.doc.dev') };
  }
  return { system: `You translate Markdown documents into ${langEn(o.lang)}. Keep the Markdown exactly: headings, lists, tables, links, images and inline code stay in place; code blocks stay unchanged. Translate naturally and fluently${o.lang === 'fa' ? ', with correct Persian half-spaces' : ''}. Reply with only the translation.`, label: tr('ai.out.translateTo', { lang: langName(o.lang) }) };
}

async function runOutput(src, kind, o) {
  if (!(await noticeOk())) return;
  const title = docTitle(src);
  let md = kind === 'prompt' ? o.input : src.crepe.getMarkdown();
  if (!md.trim()) { C.toast(tr('ai.out.emptyDoc'), 'info'); return; }
  const cut = md.length > MAX_DOC;
  if (cut && kind !== 'translate' && kind !== 'prompt') md = md.slice(0, MAX_DOC);
  const { system, label } = kind === 'prompt' ? o : outPrompt(kind, o, title);
  const tabName = (kind === 'prompt' ? o.label : { summary: tr('ai.out.tab.summary'), explain: tr('ai.out.tab.explain'), dev: tr('ai.out.tab.dev'), translate: tr('ai.out.tab.translate') }[kind]) + ': ' + title;
  const t = await C.newTabBeside(src, { title: tabName });
  if (!t) return;
  t.aiOut = { kind, icon: o.icon, working: true };
  C.renderTabs();
  // the line above the document: where it came from, progress, stop / make again. Not part of the text.
  const bar = el('div', { class: 'fd-srcbar', dir: langDir() });
  floatBox(t).append(bar);
  const srcLink = el('button', { class: 'fd-link', onclick: () => C.activate(src) }, docTitle(src));
  let job = null; let stopped = false;
  const paintBar = (s) => {
    const wk = { summary: 'summary', explain: 'explain', translate: 'translate', prompt: 'prompt' }[kind] || 'rewrite';
    bar.replaceChildren(...[s.working ? workFig(36) : el('span', { class: 'ic', html: aiIconHTML() }),
      s.working ? el('span', { class: 'fd-wk' }, ...workLine(wk)) : el('span', { class: 'tx' }, label, tr('ai.out.from'), srcLink, cut && kind !== 'translate' && kind !== 'prompt' ? tr('ai.out.firstPartOnly') : ''),
      s.total > 1 ? el('span', { class: 'fd-prog' }, el('span', { class: 'pg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(s.total), 'aria-valuenow': String(s.done) }, el('i', { style: `width:${Math.round((s.done / s.total) * 100)}%` })), tr('ai.partOf', { done: fa(Math.min(s.done + 1, s.total)), total: fa(s.total) })) : null,
      el('span', { class: 'sp' }),
      s.working ? el('button', { class: 'fd-btn sm', onclick: () => { stopped = true; if (job) job.cancel(); } }, el('span', { class: 'ic', html: I.stop }), tr('common.stop')) : s.err ? null : el('button', { class: 'fd-btn sm', onclick: () => { runOutputInto(); } }, el('span', { class: 'ic', html: ICON.refresh }), tr('ai.out.regenerate')),
      el('button', { class: 'fd-x', 'aria-label': tr('ai.out.closeBar'), title: s.working ? tr('ai.out.stopAndClose') : tr('common.close'), html: ICON.x, onclick: () => {
        if (s.working) { stopped = true; if (job) job.cancel(); }
        bar.remove(); t.pane.querySelectorAll('.fd-srcerr').forEach((n) => n.remove());
      } })].filter(Boolean));
    if (s.err) {
      const [et, ex] = errorText(s.err, () => {});
      bar.before(el('div', { class: 'fd-srcerr', role: 'alert' }, el('span', { class: 'ic', html: ICON.warn }), el('span', { class: 'tx' }, el('b', {}, et), ' ', s.partial ? tr('ai.out.partialDone', { done: fa(s.done), total: fa(s.total) }) : ex),
        s.partial ? el('button', { class: 'fd-btn sm', onclick: (ev) => { ev.currentTarget.parentNode.remove(); } }, tr('ai.out.keepPartial')) : null,
        el('button', { class: 'fd-btn primary sm', onclick: (ev) => { ev.currentTarget.parentNode.remove(); s.resume(); } }, s.partial ? tr('ai.out.resumeFrom', { part: fa(s.done + 1) }) : tr('common.tryAgain'))));
    }
  };
  let shown = ''; let timer = 0;
  const show = (text, now) => {
    shown = text;
    if (now) { clearTimeout(timer); timer = 0; setMarkdown(t.crepe, text); return; }
    if (timer) return;
    timer = setTimeout(() => { timer = 0; setMarkdown(t.crepe, shown); }, 280);
  };
  const end = () => { t.aiOut = { kind, icon: o.icon, working: false }; C.renderTabs(); };
  const runOutputInto = async () => {
    stopped = false;
    t.pane.querySelectorAll('.fd-srcerr').forEach((n) => n.remove());
    if (kind !== 'translate') {
      const s = { working: true, total: 1, done: 0 };
      t.aiOut.working = true; C.renderTabs();
      paintBar(s); floatBox(t).append(bar);
      job = runJob({ system, messages: [{ role: 'user', text: md }], temperature: 0.4 }, (x) => show(cleanReply(x)));
      try {
        const r = await job.promise;
        show(cleanReply(r.text), true);
        s.working = false; paintBar(s); end();
        if (r.fallback) C.toast(tr('ai.toast.fallbackUsed', { model: r.model }), 'info');
      } catch (e) {
        s.working = false;
        if (!(e && e.kind === 'cancelled')) { s.err = e; s.resume = runOutputInto; }
        paintBar(s); end();
      }
      return;
    }
    // translation: part by part, so a long document never hits the reply limit and a cut keeps what is done
    const parts = chunksOf(src, md);
    const outParts = [];
    const s = { working: true, total: parts.length, done: 0 };
    const step = async (from) => {
      s.working = true; s.err = null; t.aiOut.working = true; C.renderTabs();
      t.pane.querySelectorAll('.fd-srcerr').forEach((n) => n.remove());
      for (let i = from; i < parts.length && !stopped; i++) {
        s.done = i; paintBar(s);
        job = runJob({ system, messages: [{ role: 'user', text: parts[i] }], temperature: 0.3 }, (x) => show([...outParts.slice(0, i), cleanReply(x)].join('\n\n')));
        try {
          const r = await job.promise;
          outParts[i] = cleanReply(r.text);
          show(outParts.slice(0, i + 1).join('\n\n'), true);
        } catch (e) {
          show(outParts.slice(0, i).join('\n\n'), true);
          s.working = false;
          if (!(e && e.kind === 'cancelled')) { s.err = e; s.partial = i > 0; s.done = i; s.resume = () => step(i); }
          paintBar(s); end();
          return;
        }
      }
      s.done = parts.length; s.working = false; paintBar(s); end();
    };
    await step(0);
  };
  await runOutputInto();
}
/** a document cut at block boundaries into parts of up to ~3500 characters */
function chunksOf(t, md) {
  const doc = getView(t.crepe).state.doc;
  const parts = [];
  let cur = null;
  doc.forEach((node, pos) => {
    const len = node.textContent.length + 20;
    if (!cur || cur.len + len > 3500) { cur = { from: pos, to: pos + node.nodeSize, len: 0 }; parts.push(cur); }
    cur.to = pos + node.nodeSize; cur.len += len;
  });
  const out = parts.map((p) => markdownOf(t.crepe, p.from, p.to)).filter((x) => x.trim());
  return out.length ? out : [md];
}

// =====================================================================
// Phase 3: my prompts and skills
// A prompt is a saved instruction; with examples or reference files it becomes a skill.
// =====================================================================
const P_ICONS = {
  spark: 'M10.5 4l1.6 4.4L16.5 10l-4.4 1.6L10.5 16l-1.6-4.4L4.5 10l4.4-1.6zM17.5 14.5l.8 2.2l2.2.8l-2.2.8l-.8 2.2l-.8-2.2l-2.2-.8l2.2-.8z',
  mail: 'M17.9 8.85L13.46 12.46C12.62 13.12 11.44 13.12 10.6 12.46L6.12 8.85M16.91 21C19.95 21.01 22 18.51 22 15.44V8.57C22 5.5 19.95 3 16.91 3H7.09C4.05 3 2 5.5 2 8.57V15.44C2 18.51 4.05 21.01 7.09 21H16.91Z',
  doc: 'M14.74 2.76H8.08C6.02 2.75 4.33 4.39 4.28 6.45V17.2C4.24 19.31 5.92 21.06 8.03 21.1H16.04C18.12 21.02 19.77 19.29 19.76 17.2V8.04L14.74 2.76ZM14.47 2.75V5.66C14.47 7.08 15.62 8.23 17.04 8.24H19.79M14.29 15.36H8.89M12.24 11.61H8.89',
  list: 'M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01',
  seo: 'M20.76 11.77a8.99 8.99 0 1 1-17.98 0a8.99 8.99 0 0 1 17.98 0zM18.02 18.49L21.54 22',
  chat: 'M8 10.5h.01M12 10.5h.01M16 10.5h.01M4 7.5C4 5 5.5 4 8 4h8c2.5 0 4 1 4 3.5v5C20 15 18.5 16 16 16h-2.5L9 20v-4H8c-2.5 0-4-1-4-3.5z',
  code: 'M8 7.5L3.5 12L8 16.5M16 7.5L20.5 12L16 16.5M13.5 5l-3 14',
  pen: 'M5 19L15.5 8.5M19.5 4.5C13 4.5 7 9 7 17h4c5.5 0 8.5-6 8.5-12.5zM8.5 15.5h5',
  bulb: 'M9.5 18.5h5M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2v.5h5V16c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z',
};
const pIcon = (k) => P_ICONS[k] || P_ICONS.spark;
const TOKENS = [['selection', 'ai.token.selection'], ['document', 'ai.token.document'], ['filename', 'ai.token.filename']];
const BUILT = [['translate', 'ai.built.translate'], ['explain', 'ai.built.explain'], ['clean', 'ai.built.clean'], ['tone', 'ai.built.tone'], ['length', 'ai.built.length'], ['summary', 'ai.built.summary'], ['dev', 'ai.built.dev']];
const OUTPUTS = [['replace', 'ai.output.replace'], ['below', 'ai.output.below'], ['tab', 'ai.output.tab']];
const MAX_FILE = 200 * 1024;
const MAX_BAR = 3;
const builtOn = (k) => !(set().aiBuiltOff || {})[k];
const prompts = () => (Array.isArray(set().aiPrompts) ? set().aiPrompts : []);
const isSkill = (p) => !!((p.examples && p.examples.length) || (p.files && p.files.length));
const usesSel = (p) => /\{\{selection\}\}/.test(p.text || '');
const usesDoc = (p) => /\{\{document\}\}/.test(p.text || '');
/** on selected text: prompts that use the selection, or name neither the selection nor the document */
const forSel = (p) => p.on !== false && (usesSel(p) || !usesDoc(p));
/** on the whole document: prompts that do not need a selection */
const forDoc = (p) => p.on !== false && !usesSel(p);
const tokenLabel = (k) => { const f = TOKENS.find((x) => x[0] === k); return f ? tr(f[1]) : k; };
const descOf = (p) => p.desc || String(p.text || '').replace(/\{\{(\w+)\}\}/g, (_m, k) => tokenLabel(k)).replace(/\s+/g, ' ').trim().slice(0, 70);
const words = (s) => fa(String(s || '').trim().split(/\s+/).filter(Boolean).length);
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const savePrompts = (list) => { C.updateSettings({ aiPrompts: list }); paintSlots(); };

let wantSub = null;
function openPromptSettings() {
  wantSub = 'prompts';
  C.openSettings('ai');
  // the section may already be built: switch its tab
  setTimeout(() => { const w = document.querySelector('.fd-set'); if (w && w._show && wantSub) { w._show('prompts'); } wantSub = null; }, 30);
}

function promptItem(p, run, closeSub, keep) {
  const b = el('button', { class: 'fd-mi', role: 'menuitem', title: descOf(p) }, el('span', { class: 'ic', html: S(pIcon(p.icon)) }), el('span', { class: 't' }, p.name), isSkill(p) ? el('span', { class: 'fd-tag sk' }, tr('ai.skill')) : null);
  b.addEventListener('click', run);
  b.addEventListener('mouseenter', () => { keep(); setTimeout(closeSub, 120); });
  return b;
}

// ---------- running a prompt ----------
function skillContext(p) {
  const out = [];
  if (p.files && p.files.length) {
    out.push('Reference files from the user. Follow their structure, headings and conventions:');
    for (const f of p.files) out.push(`<file name="${f.name}">\n${f.text}\n</file>`);
  }
  if (p.examples && p.examples.length) {
    out.push('Examples of an input and the output the user expects. Match their structure, length and tone; never copy their facts:');
    p.examples.forEach((x, i) => out.push(`<example n="${i + 1}">\n<input>\n${x.input}\n</input>\n<output>\n${x.output}\n</output>\n</example>`));
  }
  return out.length ? '\n\n' + out.join('\n') : '';
}
function promptUser(p, t, selMd) {
  const docMd = usesDoc(p) || selMd == null ? t.crepe.getMarkdown().slice(0, MAX_DOC) : null;
  const text = String(p.text || '')
    .replace(/\{\{selection\}\}/g, selMd != null ? '[SELECTION]' : '[DOCUMENT]')
    .replace(/\{\{document\}\}/g, '[DOCUMENT]')
    .replace(/\{\{filename\}\}/g, `«${docTitle(t)}»`);
  const parts = [`Instruction: ${text}`];
  if (selMd != null) parts.push(`[SELECTION]:\n${selMd}`);
  if (docMd != null) parts.push(`[DOCUMENT]:\n${docMd}`);
  return parts.join('\n\n');
}
async function runPrompt(t, range, p) {
  const docMode = !range || range.doc;
  const selMd = docMode ? null : selectionMd(t, range);
  const user = promptUser(p, t, selMd);
  const ctx = skillContext(p);
  const plainSys = [`You are «${aiName()}», an assistant inside Fedo, a Markdown editor. Follow the user’s saved instruction.`,
    langRule().replace('the answer', 'the result').replace('the user’s text', 'the text it works on'),
    'Reply with ONLY the result as Markdown: no preface, no explanation, no code fences around it.'].join('\n') + ctx;
  if (p.output === 'tab') { runOutput(t, 'prompt', { system: plainSys, label: p.name, input: user, icon: p.icon }); return; }
  const r = docMode ? { from: 0, to: getView(t.crepe).state.doc.content.size, doc: true, anchor: range && range.anchor } : range;
  if (p.output === 'below') { runAnswer(t, r, { kind: 'prompt', name: p.name, system: plainSys, userText: user }); return; }
  const editSys = editSystem() + `\nThe instruction talks about ${docMode ? '[DOCUMENT]' : '[SELECTION]'}: reply with only the new Markdown that replaces it.` + ctx;
  if (!docMode) { runEdit(t, range, { label: p.name, instr: p.name, system: editSys, userText: user, kind: 'prompt' }); return; }
  runDocPrompt(t, r, p, editSys, user);
}
async function runDocPrompt(t, range, p, system, user) {
  if (!(await noticeOk())) return;
  const c = card('fd-diff', aiName(), t, range);
  let job = null;
  c.onClose = () => job && job.cancel();
  c.box.replaceChildren(brandHead(el('span', { class: 'fd-q' }, p.name)),
    el('div', { class: 'fd-body' }, el('div', { class: 'fd-txt' }, el('span', { class: 'fd-busy' }, el('span', { class: 'fd-spin' }), tr('ai.doc.writing')))),
    el('div', { class: 'fd-foot' }, el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: () => job && job.cancel() }, el('span', { class: 'ic', html: I.stop }), tr('common.stop'), kb('Esc'))));
  c.place();
  job = runJob({ system, messages: [{ role: 'user', text: user }], temperature: 0.4 });
  job.promise.finally(startWork(t, 'prompt', () => job && job.cancel()));
  job.promise.then((r) => {
    c.onClose = null;
    closeFedora();
    runReview(t, { label: p.name, instr: p.name }, cleanReply(r.text));
  }).catch((e) => {
    if (e && e.kind === 'cancelled') { closeFedora(); return; }
    c.box.replaceChildren(brandHead(el('span', { class: 'fd-q' }, p.name)), el('div', { class: 'fd-body' }, errBox(e, () => { closeFedora(); runDocPrompt(t, range, p, system, user); })),
      el('div', { class: 'fd-foot' }, el('span', { class: 'sp' }), el('button', { class: 'fd-btn', onclick: closeFedora }, tr('common.close'))));
    c.place();
  });
}

// ---------- prompts in the selection toolbar (up to three slots, filled from the settings) ----------
const slotItems = []; // [index] -> [toolbar item data of every editor]
const barPrompts = () => prompts().filter((p) => p.inBar && forSel(p)).slice(0, MAX_BAR);
export function registerSlot(i, data) { (slotItems[i] = slotItems[i] || []).push(data); paintSlots(); }
export function paintSlots() {
  const list = barPrompts();
  slotItems.forEach((arr, i) => {
    const p = list[i];
    for (const d of arr || []) { d.icon = `<span class="fd-tbi pr">${S(pIcon(p ? p.icon : 'spark'))}</span>`; d.label = p ? p.name : ''; }
  });
  let st = document.getElementById('fd-slots');
  if (!st) { st = document.createElement('style'); st.id = 'fd-slots'; document.head.append(st); }
  const hide = [];
  for (let i = list.length; i < MAX_BAR; i++) hide.push(`.milkdown-toolbar [data-toolbar-item="nv-p${i}"]`);
  st.textContent = hide.length ? hide.join(',') + '{display:none!important}' : '';
}
export async function runSlot(t, i) {
  if (!aiOn()) return;
  const p = barPrompts()[i];
  if (!p || !t || !t.crepe) return;
  const range = rangeOf(getView(t.crepe));
  if (!range) return;
  if (range.code) { C.toast(tr('ai.toast.noCode', { name: aiName() }), 'info'); return; }
  const info = await C.api.aiKeyInfo(cfgOf()).catch(() => ({ has: false }));
  if (!info.has) { openFedora(t); return; }
  runPrompt(t, range, p);
}

// ---------- skill files: export and import ----------
const FENCE = '````';
function skillToMd(p) {
  const head = ['---', `name: ${p.name}`, p.desc ? `description: ${p.desc}` : null, `icon: ${p.icon || 'spark'}`, `output: ${p.output || 'replace'}`, `toolbar: ${p.inBar ? 'true' : 'false'}`, 'fedo-skill: 1', '---', ''].filter((x) => x !== null);
  const body = [String(p.text || '').trim(), ''];
  for (const x of p.examples || []) body.push(`## Example: ${x.title || ''}`.trim(), '### Input', x.input.trim(), '### Output', x.output.trim(), '');
  for (const f of p.files || []) body.push(`## Reference: ${f.name}`, FENCE, f.text.replace(/\n$/, ''), FENCE, '');
  return head.join('\n') + body.join('\n');
}
function skillFromMd(md, fileName) {
  const text = String(md).replace(/\r\n/g, '\n');
  const p = { id: newId(), name: '', desc: '', icon: 'spark', output: 'replace', inBar: false, on: true, text: '', examples: [], files: [] };
  let rest = text;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    rest = text.slice(fm[0].length);
    for (const line of fm[1].split('\n')) {
      const m = /^([\w-]+):\s*(.*)$/.exec(line);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (m[1] === 'name') p.name = v;
      else if (m[1] === 'description') p.desc = v;
      else if (m[1] === 'icon' && P_ICONS[v]) p.icon = v;
      else if (m[1] === 'output' && OUTPUTS.some((o) => o[0] === v)) p.output = v;
      else if (m[1] === 'toolbar') p.inBar = v === 'true';
    }
  }
  // sections: «## Example: …» and «## Reference: …»; everything before them is the instruction
  const re = /^## (Example|Reference):[^\S\n]*(.*)$/gm;
  const cuts = [];
  let m;
  while ((m = re.exec(rest))) cuts.push({ kind: m[1], title: m[2].trim(), at: m.index, body: m.index + m[0].length });
  p.text = (cuts.length ? rest.slice(0, cuts[0].at) : rest).trim();
  cuts.forEach((c, i) => {
    const chunk = rest.slice(c.body, i + 1 < cuts.length ? cuts[i + 1].at : rest.length).replace(/^\n+|\n+$/g, '');
    if (c.kind === 'Example') {
      const ex = /^### Input\n([\s\S]*?)\n### Output\n([\s\S]*)$/.exec(chunk);
      if (ex) p.examples.push({ title: c.title, input: ex[1].trim(), output: ex[2].trim() });
    } else {
      const f = /^(`{3,})[^\n]*\n([\s\S]*?)\n\1\s*$/.exec(chunk);
      p.files.push({ name: c.title || 'reference.md', text: f ? f[2] : chunk });
    }
  });
  if (!p.name) p.name = String(fileName || tr('ai.skill')).replace(/^.*[\\/]/, '').replace(/\.(md|markdown|txt)$/i, '');
  return p;
}

// ---------- settings: prompts & skills ----------
function promptsPane(pane, h) {
  const { row, group, label, sw, seg } = h;
  const back = () => pane.replaceChildren(...promptsPane(pane, h));
  const list = () => {
    const ps = prompts();
    const rows = ps.map((p) => {
      const edit = el('button', { class: 'fd-ib', title: tr('ai.prompt.edit'), 'aria-label': tr('ai.prompt.editName', { name: p.name }), html: ICON.edit || S('M13.5 6.5l4 4M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z'), onclick: () => pane.replaceChildren(...promptForm(pane, h, p)) });
      return el('div', { class: 'row fd-prow' + (p.on === false ? ' off' : ''), 'data-s': p.name + ' ' + descOf(p) + ' ' + tr('ai.prompt') + ' ' + tr('ai.skill') },
        el('span', { class: 'fd-pic', html: S(pIcon(p.icon)) }),
        el('span', { class: 'fd-pt' }, el('span', { class: 'n' }, el('b', {}, p.name), el('span', { class: 'fd-tag' + (isSkill(p) ? ' sk' : '') }, isSkill(p) ? tr('ai.skill') : tr('ai.prompt'))), el('small', {}, descOf(p))),
        edit,
        sw(() => p.on !== false, () => { savePrompts(prompts().map((x) => (x.id === p.id ? { ...x, on: x.on === false } : x))); back(); }, p.name));
    });
    return rows.length ? group(...rows) : el('div', { class: 'grp set-free fd-pempty' },
      el('span', { class: 'ic', html: S(P_ICONS.spark) }),
      el('b', {}, tr('ai.prompts.emptyTitle')),
      el('small', {}, tr('ai.prompts.emptyBody', { name: aiName() })));
  };
  const importBtn = el('button', { class: 'set-select as-btn' }, tr('ai.prompts.importSkill'));
  importBtn.addEventListener('click', async () => {
    const files = await C.api.openDialog().catch(() => []);
    if (!files || !files.length) return;
    try {
      const r = await C.api.readFile(files[0]);
      pane.replaceChildren(...importView(pane, h, skillFromMd(r.content, files[0])));
    } catch { C.toast(tr('ai.prompts.readErr'), 'err'); }
  });
  return [
    el('div', { class: 'lbl lbl-act' }, el('span', {}, tr('ai.prompts.myList')),
      el('span', { class: 'row-end' }, el('button', { class: 'set-select as-btn primary', onclick: () => pane.replaceChildren(...promptForm(pane, h, null)) }, tr('ai.prompts.new')), importBtn)),
    list(),
    label(tr('ai.prompts.quickActions')),
    group(...BUILT.map(([k, nk]) => { const n = tr(nk); return row(n, null, sw(() => builtOn(k), () => C.updateSettings({ aiBuiltOff: { ...(set().aiBuiltOff || {}), [k]: builtOn(k) } }), n)); })),
    el('div', { class: 'lbl plain set-free' }, tr('ai.prompts.footerNote', { name: aiName() })),
  ];
}

/** the instruction box: text with chips for selection, document, and filename */
function instrBox(text) {
  const box = el('div', { class: 'fd-instr', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': tr('ai.prompt.instruction'), dir: 'auto', spellcheck: 'false', 'data-ph': tr('ai.prompt.instrPh') });
  const chip = (k) => el('span', { class: 'fd-tok', contenteditable: 'false', 'data-tok': k }, tokenLabel(k));
  const fill = (s) => {
    box.replaceChildren();
    String(s || '').split(/(\{\{\w+\}\})/).forEach((part) => {
      const m = /^\{\{(\w+)\}\}$/.exec(part);
      if (m && TOKENS.some((x) => x[0] === m[1])) box.append(chip(m[1]));
      else if (part) part.split('\n').forEach((ln, i) => { if (i) box.append(el('br')); if (ln) box.append(document.createTextNode(ln)); });
    });
    paintEmpty();
  };
  const read = () => {
    let out = '';
    const walk = (n) => n.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.dataset && c.dataset.tok) out += `{{${c.dataset.tok}}}`;
      else if (c.nodeName === 'BR') out += '\n';
      else { if (c.nodeName === 'DIV' && out && !out.endsWith('\n')) out += '\n'; walk(c); }
    });
    walk(box);
    return out.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  };
  const paintEmpty = () => box.classList.toggle('empty', !box.textContent.trim() && !box.querySelector('.fd-tok'));
  const insert = (k) => {
    box.focus();
    const sel = getSelection();
    let r = sel.rangeCount && box.contains(sel.getRangeAt(0).startContainer) ? sel.getRangeAt(0) : null;
    if (!r) { r = document.createRange(); r.selectNodeContents(box); r.collapse(false); }
    r.deleteContents();
    const c = chip(k); const sp = document.createTextNode(' ');
    r.insertNode(sp); r.insertNode(c);
    r.setStartAfter(sp); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    paintEmpty();
  };
  box.addEventListener('input', paintEmpty);
  box.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); } e.stopPropagation(); });
  fill(text);
  return { box, read, insert };
}

function promptForm(pane, h, orig) {
  const { row, group, label, sw, seg } = h;
  const p = orig ? JSON.parse(JSON.stringify(orig)) : { id: newId(), name: '', desc: '', icon: 'spark', output: 'replace', inBar: false, on: true, text: '', examples: [], files: [] };
  const back = () => pane.replaceChildren(...promptsPane(pane, h));
  const again = () => { p.text = ib.read(); p.name = nameIn.value.trim(); p.desc = descIn.value.trim(); pane.replaceChildren(...promptForm(pane, h, p)); };
  const nameIn = el('input', { type: 'text', class: 'fd-in wide', value: p.name, placeholder: tr('ai.prompt.namePh'), 'aria-label': tr('ai.prompt.name'), maxlength: '40', spellcheck: 'false' });
  const descIn = el('input', { type: 'text', class: 'fd-in wide', value: p.desc || '', placeholder: tr('ai.prompt.optional'), 'aria-label': tr('ai.prompt.desc'), maxlength: '90', spellcheck: 'false' });
  const icons = el('div', { class: 'fd-picons', role: 'radiogroup', 'aria-label': tr('settings.ai.char.icon') });
  const paintIcons = () => icons.replaceChildren(...Object.keys(P_ICONS).map((k) => el('button', { class: 'fd-icp sm' + (p.icon === k ? ' on' : ''), role: 'radio', 'aria-checked': String(p.icon === k), 'aria-label': k, html: S(P_ICONS[k]), onclick: () => { p.icon = k; paintIcons(); } })));
  paintIcons();
  const ib = instrBox(p.text);
  const skillOpen = isSkill(p) || p._skill;
  // examples and reference files
  const exRows = (p.examples || []).map((x, i) => el('div', { class: 'row fd-xrow' },
    el('span', { class: 'fd-pt' }, el('b', {}, tr('ai.example.num', { n: fa(i + 1) }) + (x.title ? ' · ' + x.title : '')), el('small', {}, tr('ai.example.counts', { input: words(x.input), output: words(x.output) }))),
    el('button', { class: 'fd-ib', title: tr('ai.prompt.edit'), 'aria-label': tr('ai.example.edit'), html: S('M13.5 6.5l4 4M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z'), onclick: () => { p.text = ib.read(); p.name = nameIn.value; p.desc = descIn.value; pane.replaceChildren(...exampleForm(pane, h, p, i)); } }),
    el('button', { class: 'fd-ib danger', title: tr('common.delete'), 'aria-label': tr('ai.example.delete'), html: ICON.trash || ICON.x, onclick: () => { p.examples.splice(i, 1); again(); } })));
  const fileRows = (p.files || []).map((f, i) => el('div', { class: 'row fd-xrow' },
    el('span', { class: 'fd-pic', html: S(P_ICONS.doc) }),
    el('span', { class: 'fd-pt' }, el('b', { dir: 'ltr' }, f.name), el('small', {}, tr('ai.refFile.meta', { kb: (f.text.length / 1024).toLocaleString(langLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }))),
    el('button', { class: 'fd-ib danger', title: tr('common.delete'), 'aria-label': tr('ai.refFile.delete'), html: ICON.trash || ICON.x, onclick: () => { p.files.splice(i, 1); again(); } })));
  const addFile = async () => {
    const files = await C.api.openDialog().catch(() => []);
    if (!files || !files.length) return;
    for (const path of files) {
      try {
        const r = await C.api.readFile(path);
        if (r.content.length > MAX_FILE) { C.toast(tr('ai.refFile.tooBig'), 'warn'); continue; }
        p.files.push({ name: path.replace(/^.*[\\/]/, ''), text: r.content });
      } catch { C.toast(tr('ai.prompts.readErr'), 'err'); }
    }
    again();
  };
  const skillPart = skillOpen ? [
    el('div', { class: 'lbl lbl-act' }, el('span', {}, tr('ai.example.section')), el('button', { class: 'sv-link', onclick: () => { p.text = ib.read(); p.name = nameIn.value; p.desc = descIn.value; pane.replaceChildren(...exampleForm(pane, h, p, -1)); } }, tr('ai.example.new'))),
    exRows.length ? group(...exRows) : el('div', { class: 'lbl plain set-free' }, tr('ai.example.emptyHint', { name: aiName() })),
    el('div', { class: 'lbl lbl-act' }, el('span', {}, tr('ai.refFile.section')), el('button', { class: 'sv-link', onclick: () => { p.text = ib.read(); p.name = nameIn.value; p.desc = descIn.value; addFile(); } }, tr('ai.refFile.add'))),
    fileRows.length ? group(...fileRows) : el('div', { class: 'lbl plain set-free' }, tr('ai.refFile.emptyHint')),
    el('div', { class: 'lbl plain set-free' }, tr('ai.skill.sentNote')),
  ] : [];
  const save = () => {
    p.name = nameIn.value.trim(); p.desc = descIn.value.trim(); p.text = ib.read();
    if (!p.name) { C.toast(tr('ai.prompt.errNoName'), 'warn'); nameIn.focus(); return; }
    if (!p.text) { C.toast(tr('ai.prompt.errNoText'), 'warn'); ib.box.focus(); return; }
    delete p._skill;
    const list = prompts();
    const i = list.findIndex((x) => x.id === p.id);
    if (p.inBar && barPrompts().filter((x) => x.id !== p.id).length >= MAX_BAR) { C.toast(tr('ai.prompt.errMaxBar', { max: fa(MAX_BAR) }), 'warn'); return; }
    savePrompts(i >= 0 ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]);
    back();
  };
  const del = async () => {
    const ok = await modal({ title: tr('ai.prompt.delTitle', { name: orig.name }), text: tr('ai.prompt.delBody'), buttons: [{ label: tr('common.cancel'), value: false }, { label: tr('common.delete'), value: true, primary: true, danger: true }] });
    if (!ok) return;
    savePrompts(prompts().filter((x) => x.id !== orig.id));
    back();
  };
  const exportMd = async () => {
    p.name = nameIn.value.trim() || tr('ai.skill'); p.desc = descIn.value.trim(); p.text = ib.read();
    const path = await C.api.saveDialog(p.name + '.md').catch(() => null);
    if (!path) return;
    await C.api.writeFile(path, skillToMd(p));
    C.toast(tr('ai.skill.exported'), 'ok');
  };
  const out = seg(OUTPUTS.map(([k, lk]) => [k, tr(lk)]), () => p.output || 'replace', (v) => { p.output = v; });
  return [
    el('div', { class: 'fd-fhead' }, el('button', { class: 'fd-ib', title: tr('ai.back'), 'aria-label': tr('ai.back'), html: S('M9 5l7 7l-7 7'), onclick: back }), el('b', {}, orig ? orig.name || tr('ai.prompt') : tr('ai.prompts.new')), isSkill(p) ? el('span', { class: 'fd-tag sk' }, tr('ai.skill')) : null),
    group(row(tr('ai.prompt.name'), null, nameIn), row(tr('ai.prompt.desc'), tr('ai.prompt.descHint'), descIn), row(tr('settings.ai.char.icon'), null, icons)),
    el('div', { class: 'lbl lbl-act' }, el('span', {}, tr('ai.prompt.instruction')), el('span', { class: 'fd-ins' }, tr('ai.prompt.insert'), ...TOKENS.map(([k, nk]) => el('button', { class: 'fd-tok btn', onmousedown: (e) => e.preventDefault(), onclick: () => ib.insert(k) }, tr(nk))))),
    el('div', { class: 'grp set-free fd-instrw' }, ib.box),
    group(
      row(tr('ai.prompt.output'), tr('ai.prompt.outputHint'), out),
      skillOpen ? null : row(tr('ai.prompt.addSkillRow'), tr('ai.prompt.addSkillHint'), el('button', { class: 'set-select as-btn', onclick: () => { p.text = ib.read(); p.name = nameIn.value; p.desc = descIn.value; p._skill = true; pane.replaceChildren(...promptForm(pane, h, p)); } }, tr('ai.prompt.addBtn'))),
      row(tr('ai.prompt.inBar'), tr('ai.prompt.inBarHint', { max: fa(MAX_BAR), name: aiName() }), sw(() => !!p.inBar, () => { p.inBar = !p.inBar; }, tr('ai.prompt.inBar')))),
    ...skillPart,
    el('div', { class: 'fd-factions' },
      orig && prompts().some((x) => x.id === orig.id) ? el('button', { class: 'sv-link danger', onclick: del }, tr('common.delete')) : null,
      el('button', { class: 'sv-link', onclick: exportMd }, tr('ai.skill.exportBtn')),
      el('span', { class: 'sp' }),
      el('button', { class: 'set-select as-btn', onclick: back }, tr('common.cancel')),
      el('button', { class: 'set-select as-btn primary', onclick: save }, tr('common.save'))),
  ];
}

function exampleForm(pane, h, p, i) {
  const { row, label, group } = h;
  const x = i >= 0 ? p.examples[i] : { title: '', input: '', output: '' };
  const title = el('input', { type: 'text', class: 'fd-in wide', value: x.title || '', placeholder: tr('ai.example.titlePh'), 'aria-label': tr('ai.example.titleLabel'), maxlength: '40', spellcheck: 'false' });
  const ta = (v, ph, al) => el('textarea', { class: 'fd-ta', dir: 'auto', placeholder: ph, 'aria-label': al, spellcheck: 'false' }, v || '');
  const inp = ta(x.input, tr('ai.example.inputPh', { name: aiName() }), tr('ai.example.input'));
  const outp = ta(x.output, tr('ai.example.outputPh'), tr('ai.example.output'));
  const back = () => pane.replaceChildren(...promptForm(pane, h, p));
  const save = () => {
    if (!inp.value.trim() || !outp.value.trim()) { C.toast(tr('ai.example.errBoth'), 'warn'); return; }
    const nx = { title: title.value.trim(), input: inp.value.trim(), output: outp.value.trim() };
    if (i >= 0) p.examples[i] = nx; else p.examples.push(nx);
    back();
  };
  return [
    el('div', { class: 'fd-fhead' }, el('button', { class: 'fd-ib', title: tr('ai.back'), 'aria-label': tr('ai.back'), html: S('M9 5l7 7l-7 7'), onclick: back }), el('b', {}, i >= 0 ? tr('ai.example.num', { n: fa(i + 1) }) : tr('ai.example.new')), el('span', { class: 'fd-tag' }, p.name || tr('ai.prompt'))),
    group(row(tr('ai.example.title'), null, title)),
    label(tr('ai.example.input')), el('div', { class: 'grp set-free' }, inp),
    label(tr('ai.example.output')), el('div', { class: 'grp set-free' }, outp),
    el('div', { class: 'fd-factions' }, el('span', { class: 'sp' }),
      el('button', { class: 'set-select as-btn', onclick: back }, tr('common.cancel')),
      el('button', { class: 'set-select as-btn primary', onclick: save }, tr('ai.example.save'))),
  ];
}

function importView(pane, h, p) {
  const { label } = h;
  const back = () => pane.replaceChildren(...promptsPane(pane, h));
  const outKey = (OUTPUTS.find((o) => o[0] === p.output) || OUTPUTS[0])[1];
  const chips = [tr('ai.import.outputChip', { output: tr(outKey) }),
    p.examples.length ? tr('ai.import.examplesChip', { count: fa(p.examples.length) }) : null, p.files.length ? tr('ai.import.filesChip', { count: fa(p.files.length) }) : null, p.inBar ? tr('ai.import.inBarChip') : null].filter(Boolean);
  const big = p.files.some((f) => f.text.length > MAX_FILE);
  const add = () => {
    if (!p.text) { C.toast(tr('ai.import.errNoInstr'), 'warn'); return; }
    if (p.inBar && barPrompts().length >= MAX_BAR) p.inBar = false;
    savePrompts([...prompts(), p]);
    C.toast(tr('ai.import.added', { name: p.name }), 'ok');
    back();
  };
  const preview = String(p.text).replace(/\{\{(\w+)\}\}/g, (_m, k) => `«${tokenLabel(k)}»`);
  return [
    el('div', { class: 'fd-fhead' }, el('button', { class: 'fd-ib', title: tr('ai.back'), 'aria-label': tr('ai.back'), html: S('M9 5l7 7l-7 7'), onclick: back }), el('b', {}, tr('ai.prompts.importSkill'))),
    el('div', { class: 'grp set-free fd-imp' },
      el('div', { class: 'fd-imph' }, el('span', { class: 'fd-pic', html: S(pIcon(p.icon)) }), el('span', { class: 'fd-pt' }, el('b', {}, p.name), p.desc ? el('small', {}, p.desc) : null)),
      el('div', { class: 'fd-chips' }, chips.map((c) => el('span', { class: 'fd-ichip' }, c))),
      el('pre', { class: 'fd-src', dir: 'auto' }, preview),
      // everything that is sent with the instruction is shown in full, so nothing hidden comes in with it
      ...p.examples.map((x, i) => el('pre', { class: 'fd-src', dir: 'auto' }, tr('ai.import.exampleBlock', { n: fa(i + 1), title: x.title ? ': ' + x.title : '', input: x.input, output: x.output }))),
      ...p.files.map((f) => el('pre', { class: 'fd-src', dir: 'auto' }, tr('ai.import.fileBlock', { name: f.name || '', text: f.text }))),
      el('div', { class: 'fd-warn' }, el('span', { class: 'ic', html: ICON.warn }), el('span', {}, tr('ai.import.warn')))),
    big ? el('div', { class: 'lbl plain set-free' }, tr('ai.import.bigFileNote')) : null,
    el('div', { class: 'fd-factions' }, el('span', { class: 'sp' }),
      el('button', { class: 'set-select as-btn', onclick: back }, tr('common.cancel')),
      el('button', { class: 'set-select as-btn primary', onclick: add }, tr('ai.import.addBtn'))),
  ].filter(Boolean);
}

// ---------- setup ----------
/**
 * ctx: { api, settings(), updateSettings(patch), toast(msg, kind), openSettings(id), showLocked(),
 *        openHistoryAt(t, id), renderTabs(), marksChanged(t), refreshViews() }
 */
export function initFedora(ctx) {
  C = { ...ctx, toast: (m, k, a) => ctx.toast(m, k === 'info' || k === 'ok' || k === 'warn' || k === 'err' ? 3200 : 2200, a || null, k) };
  document.addEventListener('mousedown', onSugClick, true);
  setTimeout(paintBrand, 0); // the top button was drawn before the settings were known
  // test hook (only in the browser test harness)
  if (window.__nv) window.__fd = { marks: (n) => marksOf(ctx.tabOf(n)).map((m) => ({ from: m.from, to: m.to, cmd: m.cmd, a: (m.afterText || '').slice(0, 30) })) };
  // a click on a marker beside the text
  document.addEventListener('mousedown', (e) => {
    const b = e.target.closest && e.target.closest('.fd-mk');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const t = ctx.tabOf(b);
    if (t) openBlockPop(t, b);
  }, true);
}
