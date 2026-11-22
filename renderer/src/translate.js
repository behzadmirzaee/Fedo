// Built-in extensions "translator" and "Google search" for the selection toolbar.
// The translator card opens under the selection on request only (button or Alt+T); its main job is to show
// the meaning, so the language pickers and the actions (copy, replace, insert below) stay quiet.
import { el, ICON } from './ui.js';

export const GOOGLE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0C14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
export const TRANSLATE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5h9M7.5 3.5v2M5 5.5c.9 3.2 3.2 5.8 6.5 7.3M10 5.5c-.9 3.2-3.2 5.8-6.5 7.3M12.5 20.5l4-9l4 9M13.8 17.5h5.4"/></svg>';
const I = {
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>',
  replace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h11l-3-3M20 17H9l3 3"/></svg>',
  below: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v10M7 11l5 5l5-5M5 20h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/></svg>',
};

/** Google language codes, Persian name, English name (searchable either way) */
export const LANGS = [
  ['fa', 'فارسی', 'Persian'], ['en', 'انگلیسی', 'English'], ['ar', 'عربی', 'Arabic'], ['tr', 'ترکی استانبولی', 'Turkish'],
  ['de', 'آلمانی', 'German'], ['fr', 'فرانسوی', 'French'], ['es', 'اسپانیایی', 'Spanish'], ['ru', 'روسی', 'Russian'],
  ['it', 'ایتالیایی', 'Italian'], ['zh-CN', 'چینی', 'Chinese'], ['ja', 'ژاپنی', 'Japanese'], ['ko', 'کره‌ای', 'Korean'],
  ['pt', 'پرتغالی', 'Portuguese'], ['nl', 'هلندی', 'Dutch'], ['sv', 'سوئدی', 'Swedish'], ['no', 'نروژی', 'Norwegian'],
  ['da', 'دانمارکی', 'Danish'], ['fi', 'فنلاندی', 'Finnish'], ['pl', 'لهستانی', 'Polish'], ['uk', 'اوکراینی', 'Ukrainian'],
  ['el', 'یونانی', 'Greek'], ['cs', 'چکی', 'Czech'], ['hu', 'مجاری', 'Hungarian'], ['ro', 'رومانیایی', 'Romanian'],
  ['he', 'عبری', 'Hebrew'], ['hi', 'هندی', 'Hindi'], ['ur', 'اردو', 'Urdu'], ['ps', 'پشتو', 'Pashto'],
  ['ckb', 'کردی سورانی', 'Kurdish (Sorani)'], ['ku', 'کردی کرمانجی', 'Kurdish (Kurmanji)'], ['az', 'آذربایجانی', 'Azerbaijani'],
  ['hy', 'ارمنی', 'Armenian'], ['ka', 'گرجی', 'Georgian'], ['tg', 'تاجیکی', 'Tajik'], ['uz', 'ازبکی', 'Uzbek'], ['kk', 'قزاقی', 'Kazakh'],
  ['id', 'اندونزیایی', 'Indonesian'], ['ms', 'مالایی', 'Malay'], ['th', 'تایلندی', 'Thai'], ['vi', 'ویتنامی', 'Vietnamese'],
  ['bn', 'بنگالی', 'Bengali'], ['ta', 'تامیلی', 'Tamil'],
];
const NAME = Object.fromEntries(LANGS.map((l) => [l[0], l[1]]));
export const langName = (code) => NAME[code] || NAME[String(code).split('-')[0]] || code;
const PERSIAN = /[؀-ۿ]/;
const MAX = 5000;

/** up to four words with capitalised Latin words → the same in lower case; anything else → null.
 *  ALL-CAPS words (NASA, CO2) and mixed ones (iPhone) stay as they are. */
export function lowerShort(text) {
  const words = text.trim().split(/\s+/);
  if (words.length > 4) return null;
  const low = text.replace(/\b([A-Z])([a-z]+)\b/g, (_m, a, b) => a.toLowerCase() + b);
  return low !== text ? low : null;
}

let card = null;

export function closeTranslate() {
  if (!card) return;
  const c = card;
  card = null;
  c.cleanup();
}
export const translateOpen = () => !!card;

/**
 * opts: { view, text, from, to (selection range), settings, setSettings(patch), api, toast, guard() → true when
 *         editing is not allowed, anchor (toolbar button, for toggling) }
 */
export function openTranslate(opts) {
  if (card && card.anchor && card.anchor === opts.anchor) { closeTranslate(); return; }
  closeTranslate();
  const { view, settings, setSettings, api, toast } = opts;
  const text = String(opts.text || '').trim();
  if (!text) return;
  const doc0 = view.state.doc;
  const range = { from: opts.from, to: opts.to };
  const isWord = !/\s/.test(text) && text.length <= 40;
  const st = {
    sl: 'auto',
    tl: settings.trTo && settings.trTo !== 'auto' ? settings.trTo : (PERSIAN.test(text) ? 'en' : 'fa'),
    detected: null,
    result: null, // { text, alts }
    state: 'loading', // loading | done | err
    menu: '', // '' | 'from' | 'to'
    seq: 0,
  };

  // ---- the card ----
  const fromBtn = el('button', { class: 'tr-lg', 'aria-haspopup': 'listbox' });
  const toBtn = el('button', { class: 'tr-lg', 'aria-haspopup': 'listbox' });
  const swapBtn = el('button', { class: 'tr-ic', title: 'جابه‌جایی زبان‌ها', 'aria-label': 'جابه‌جایی زبان‌ها', html: I.swap });
  const closeBtn = el('button', { class: 'tr-ic', title: 'بستن (Esc)', 'aria-label': 'بستن', html: ICON.x });
  const head = el('div', { class: 'tr-head' }, el('div', { class: 'tr-langs' }, fromBtn, swapBtn, toBtn), closeBtn);
  const src = el('div', { class: 'tr-src', dir: 'auto' }, text.length > 400 ? text.slice(0, 400) + '…' : text);
  const body = el('div', { class: 'tr-body' });
  const gt = el('button', { class: 'tr-gt', title: 'باز کردن در Google Translate' }, el('span', {}, 'Google Translate'), el('span', { class: 'ic', html: I.ext }));
  const acts = el('span', { class: 'tr-acts' });
  const foot = el('div', { class: 'tr-foot' }, gt, el('span', { class: 'sp' }), acts);
  const box = el('div', { class: 'tr-card', dir: 'rtl', role: 'dialog', 'aria-label': 'ترجمه' }, head, src, body, foot);
  document.body.append(box);

  const qa = (icon, label, run) => {
    const b = el('button', { class: 'tr-qa' }, el('span', { class: 'ic', html: icon }), el('span', { class: 'lb' }, label));
    b.addEventListener('click', () => run(b));
    return b;
  };

  const paintHead = () => {
    const auto = st.sl === 'auto';
    fromBtn.replaceChildren(...[el('span', { class: 'nm' }, auto ? (st.detected ? langName(st.detected) : 'تشخیص خودکار') : langName(st.sl)),
      auto && st.detected ? el('small', {}, 'خودکار') : null, el('span', { class: 'cv', html: ICON.chevDown })].filter(Boolean));
    toBtn.replaceChildren(el('span', { class: 'nm' }, langName(st.tl)), el('span', { class: 'cv', html: ICON.chevDown }));
    fromBtn.classList.toggle('on', st.menu === 'from');
    toBtn.classList.toggle('on', st.menu === 'to');
    fromBtn.setAttribute('aria-expanded', String(st.menu === 'from'));
    toBtn.setAttribute('aria-expanded', String(st.menu === 'to'));
  };
  const paintBody = () => {
    body.replaceChildren();
    acts.replaceChildren();
    if (st.state === 'loading') {
      body.append(el('div', { class: 'tr-sk' }, el('i', { style: 'width:92%' }), el('i', { style: 'width:64%' })));
      return;
    }
    if (st.state === 'err') {
      body.append(el('div', { class: 'tr-err' }, el('span', { class: 'ic', html: ICON.warn }),
        el('span', {}, el('b', {}, 'به Google Translate وصل نشد'), el('small', {}, st.err || 'اینترنت یا فیلترشکن را بررسی کنید.'))));
      acts.append(qa(ICON.refresh, 'تلاش دوباره', run));
      return;
    }
    const r = st.result;
    body.append(el('div', { class: 'tr-out', dir: 'auto' }, r.text));
    // only when there is something to show: no lonely «معنی‌های دیگر» label
    const alts = settings.trAlts !== false ? (r.alts || []).filter((a) => a && a !== r.text).slice(0, 6) : [];
    const chips = alts.map((a) => el('button', { class: 'tr-chip', title: 'کپی', onclick: (e) => copyText(a, e.currentTarget, a) }, a));
    if (r.asName && r.asName !== r.text && !alts.includes(r.asName)) {
      chips.push(el('button', { class: 'tr-chip', title: 'کپی', onclick: (e) => copyText(r.asName, e.currentTarget, r.asName) }, r.asName, el('span', { class: 'nt' }, 'به‌عنوان نام')));
    }
    if (chips.length) body.append(el('div', { class: 'tr-alts' }, el('span', { class: 'h' }, 'معنی‌های دیگر'), chips));
    acts.append(
      qa(ICON.copy, 'کپی', (b) => copyText(r.text, b)),
      qa(I.replace, 'جایگزین کن', () => replace(r.text)),
      qa(I.below, 'درج زیر پاراگراف', () => insertBelow(r.text)),
    );
  };
  const copyText = async (s, b, label) => {
    try { await navigator.clipboard.writeText(s); } catch { toast('کپی ممکن نشد', 'err'); return; }
    if (!b) return;
    const old = [...b.childNodes];
    b.classList.add('ok');
    b.replaceChildren(el('span', { class: 'ic', html: ICON.check }), el('span', { class: 'lb' }, label ? label : 'کپی شد'));
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.classList.remove('ok'); b.replaceChildren(...old); }, 1500);
  };
  const stillThere = () => {
    const d = view.state.doc;
    if (d === doc0) return true;
    try { return d.textBetween(range.from, range.to, ' ', ' ').trim() === text; } catch { return false; }
  };
  const replace = (s) => {
    if (opts.guard && opts.guard()) return;
    if (!stillThere()) { toast('متن انتخاب‌شده عوض شده است', 'warn'); return; }
    const tr = view.state.tr.insertText(s, range.from, range.to);
    view.dispatch(tr.scrollIntoView());
    closeTranslate();
    view.focus();
  };
  const insertBelow = (s) => {
    if (opts.guard && opts.guard()) return;
    if (!stillThere()) { toast('متن انتخاب‌شده عوض شده است', 'warn'); return; }
    const { state } = view;
    const $to = state.doc.resolve(Math.min(range.to, state.doc.content.size));
    const at = $to.depth >= 1 ? $to.after(1) : state.doc.content.size;
    const para = state.schema.nodes.paragraph.create(null, state.schema.text(s));
    view.dispatch(state.tr.insert(at, para).scrollIntoView());
    closeTranslate();
    view.focus();
  };

  // ---- the language menu ----
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } st.menu = ''; paintHead(); };
  const openMenu = (which) => {
    if (st.menu === which) { closeMenu(); return; }
    closeMenu();
    st.menu = which;
    paintHead();
    const cur = which === 'from' ? st.sl : st.tl;
    const input = el('input', { type: 'text', placeholder: 'جستجوی زبان، فارسی یا English', 'aria-label': 'جستجوی زبان', spellcheck: 'false' });
    const clr = el('button', { class: 'tr-lx', 'aria-label': 'پاک کردن جستجو', html: ICON.x, hidden: true });
    const list = el('div', { class: 'tr-ll', role: 'listbox' });
    menu = el('div', { class: 'tr-menu', role: 'dialog', 'aria-label': which === 'from' ? 'زبان متن' : 'ترجمه به' },
      el('label', { class: 'tr-ls' }, el('span', { class: 'ic', html: ICON.search }), input, clr),
      list,
      el('div', { class: 'tr-lf' }, el('span', { class: 'kb' }, el('kbd', {}, '↑'), el('kbd', {}, '↓')), 'حرکت', el('span', { class: 'kb' }, el('kbd', {}, 'Enter')), 'انتخاب', el('span', { class: 'kb' }, el('kbd', {}, 'Esc')), 'بستن'));
    menu.style[which === 'from' ? 'right' : 'left'] = '8px';
    box.append(menu);
    let rows = [];
    let focus = -1;
    const pick = (code) => {
      if (which === 'from') st.sl = code;
      else {
        st.tl = code;
        setSettings({ trRecent: [code, ...(settings.trRecent || []).filter((c) => c !== code)].slice(0, 3) });
      }
      closeMenu();
      run();
    };
    const row = (code, fa, en, icon, note) => {
      const b = el('button', { class: 'tr-lr' + (code === cur ? ' on' : ''), role: 'option', 'aria-selected': String(code === cur) },
        icon ? el('span', { class: 'ai', html: icon }) : null,
        el('span', { class: 'nm' }, fa, note ? el('small', {}, note) : null),
        en ? el('span', { class: 'en' }, en) : null,
        el('span', { class: 'ck', html: ICON.check }));
      b.addEventListener('click', () => pick(code));
      b.addEventListener('mousemove', () => setFocus(rows.indexOf(b)));
      rows.push(b);
      return b;
    };
    const setFocus = (i) => {
      if (!rows.length) return;
      focus = (i + rows.length) % rows.length;
      rows.forEach((r, k) => r.classList.toggle('focus', k === focus));
      rows[focus].scrollIntoView({ block: 'nearest' });
    };
    const paint = () => {
      const q = input.value.trim();
      const ql = q.toLowerCase();
      clr.hidden = !q;
      rows = [];
      list.replaceChildren();
      if (!q) {
        if (which === 'from') {
          list.append(row('auto', 'تشخیص خودکار', '', I.auto, st.detected ? 'الان: ' + langName(st.detected) : ''), el('div', { class: 'tr-sep' }));
        }
        const recent = [...new Set([...(settings.trRecent || []), 'fa', 'en', 'ar'])].filter((c) => NAME[c]).slice(0, 3);
        list.append(el('div', { class: 'tr-lh' }, 'اخیر'));
        for (const c of recent) { const l = LANGS.find((x) => x[0] === c); list.append(row(l[0], l[1], l[2])); }
        list.append(el('div', { class: 'tr-lh' }, 'همه‌ی زبان‌ها'));
        for (const l of LANGS) if (!recent.includes(l[0])) list.append(row(l[0], l[1], l[2]));
      } else {
        const hits = LANGS.filter((l) => l[1].includes(q) || l[2].toLowerCase().includes(ql) || l[0].toLowerCase() === ql);
        for (const l of hits) list.append(row(l[0], l[1], l[2]));
        if (!hits.length) list.append(el('div', { class: 'tr-le' }, `زبانی با «${q}» پیدا نشد`));
      }
      focus = -1;
      if (q && rows.length) setFocus(0);
      else { const i = rows.findIndex((r) => r.classList.contains('on')); if (i >= 0) { focus = i; rows[i].scrollIntoView({ block: 'nearest' }); } }
    };
    input.addEventListener('input', paint);
    clr.addEventListener('click', (e) => { e.preventDefault(); input.value = ''; paint(); input.focus(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(focus + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(focus - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (focus >= 0 && rows[focus]) rows[focus].click(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    });
    paint();
    input.focus();
  };

  // ---- translating ----
  const run = async () => {
    const my = ++st.seq;
    st.state = 'loading';
    paintHead(); paintBody(); place();
    let r;
    let asName = null;
    try {
      // Google's free endpoint reads a capitalised word as a name («Seismic» → «سیسمونی»): short selections go
      // in lower case, and the capitalised reading, when it differs, is offered as «به‌عنوان نام»
      const low = lowerShort(text);
      if (low) {
        const [a, b] = await Promise.all([api.translate(low, st.sl, st.tl), api.translate(text, st.sl, st.tl).catch(() => null)]);
        r = a;
        if (b && b.ok && a && a.ok && b.text.trim() !== a.text.trim()) asName = b.text.trim();
      } else r = await api.translate(text.slice(0, MAX), st.sl, st.tl);
    } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
    if (my !== st.seq || card !== self) return;
    if (r && r.ok) {
      st.state = 'done';
      st.result = { text: r.text, alts: r.alts || [], asName };
      if (st.sl === 'auto' && r.src) {
        st.detected = r.src;
        // auto target: a Persian text that came back as itself goes to English instead
        if (r.src === st.tl && (!settings.trTo || settings.trTo === 'auto')) { st.tl = r.src === 'fa' ? 'en' : 'fa'; run(); return; }
      }
    } else {
      st.state = 'err';
      st.err = r && r.offline ? 'اینترنت یا فیلترشکن را بررسی کنید.' : null;
    }
    paintHead(); paintBody(); place();
  };

  // ---- placing: under the selection, else above it ----
  const place = () => {
    let r = null;
    try {
      const a = view.coordsAtPos(range.from);
      const b = view.coordsAtPos(range.to, -1);
      r = { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), right: Math.max(a.right, b.right, a.left) };
    } catch { return; }
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let top = r.bottom + 10;
    if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 58); // above, clear of the toolbar
    const right = Math.min(Math.max(10, innerWidth - r.right - 8), innerWidth - w - 10);
    box.style.top = top + 'px';
    box.style.right = right + 'px';
  };

  swapBtn.addEventListener('click', () => {
    const from = st.sl === 'auto' ? (st.detected || (PERSIAN.test(text) ? 'fa' : 'en')) : st.sl;
    st.sl = st.tl; st.tl = from;
    closeMenu(); run();
  });
  fromBtn.addEventListener('click', () => openMenu('from'));
  toBtn.addEventListener('click', () => openMenu('to'));
  closeBtn.addEventListener('click', () => closeTranslate());
  gt.addEventListener('click', () => {
    const sl = st.sl === 'auto' ? 'auto' : st.sl;
    api.openUrl(`https://translate.google.com/?sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(st.tl)}&text=${encodeURIComponent(text.slice(0, MAX))}&op=translate`);
  });

  const onDown = (e) => {
    if (box.contains(e.target)) return;
    if (opts.anchor && opts.anchor.contains(e.target)) return; // the toolbar button toggles it
    closeTranslate();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (menu) closeMenu(); else { closeTranslate(); view.focus(); }
  };
  const onResize = () => place();
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  const onScroll = () => place();
  document.addEventListener('scroll', onScroll, true);

  const self = {
    anchor: opts.anchor || null,
    cleanup: () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, true);
      if (opts.anchor) opts.anchor.classList.remove('open');
      box.remove();
    },
  };
  card = self;
  if (opts.anchor) opts.anchor.classList.add('open');
  paintHead(); paintBody(); place();
  run();
}

/** the selected text searched on Google in the default browser */
export function googleSearch(api, text) {
  const q = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (q) api.openUrl('https://www.google.com/search?q=' + encodeURIComponent(q));
}
