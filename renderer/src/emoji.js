// Emoji picker for the editor's right-click menu: search, pinned emoji on top, recent, then every emoji by group.
// The full list (emoji-data.json) comes from emojibase (English names and tags, Emoji 15 and older, which Windows
// can draw); it is loaded the first time the picker opens.
import { el, ICON, toast } from './ui.js';

const s = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const SMILE_ICON = s('<circle cx="12" cy="12" r="9.25"/><path d="M8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2M9 9.5h.01M15 9.5h.01"/>');

/** the emoji pinned by default, with their Persian names */
export const DEFAULT_PINS = ['🔹', '🔷', '🔸', '🔶', '✅', '❌', '✍️', '✏️', '📌', '📅', '💡', '⚠️', '❗', '❓', '👈', '👉', '👇', '👆', '✨', '⭐', '🔥', '🎯'];
const FA_NAMES = {
  '🔹': 'لوزی آبی کوچک', '🔷': 'لوزی آبی بزرگ', '🔸': 'لوزی نارنجی کوچک', '🔶': 'لوزی نارنجی بزرگ',
  '✅': 'تیک سبز', '❌': 'ضربدر قرمز', '✍️': 'دست در حال نوشتن', '✏️': 'مداد', '📌': 'پین', '📅': 'تقویم ساده',
  '💡': 'لامپ ایده', '⚠️': 'هشدار', '❗': 'علامت تعجب', '❓': 'علامت سوال', '👈': 'اشاره به چپ', '👉': 'اشاره به راست',
  '👇': 'اشاره به پایین', '👆': 'اشاره به بالا', '✨': 'درخشش', '⭐': 'ستاره', '🔥': 'آتش', '🎯': 'هدف',
  '✔️': 'تیک', '☑️': 'کادر تیک‌خورده', '❤️': 'قلب قرمز', '💙': 'قلب آبی', '💚': 'قلب سبز', '👍': 'لایک موافق',
  '👎': 'مخالف', '👏': 'دست زدن تشویق', '🙏': 'لطفاً ممنون دعا', '😀': 'خنده', '😄': 'خنده', '😂': 'خنده اشک',
  '😊': 'لبخند', '🙂': 'لبخند', '😉': 'چشمک', '😍': 'عاشق', '🤔': 'فکر', '😎': 'عینک باحال', '😢': 'گریه ناراحت',
  '😮': 'تعجب', '😴': 'خواب', '🥳': 'جشن تولد', '🎉': 'جشن تبریک', '🎁': 'هدیه', '🚀': 'موشک', '📘': 'کتاب',
  '📖': 'کتاب باز', '📝': 'یادداشت', '📎': 'گیره', '🔗': 'پیوند لینک', '📞': 'تلفن', '✉️': 'نامه ایمیل',
  '📧': 'ایمیل', '⏰': 'ساعت زنگ‌دار', '⌛': 'ساعت شنی', '🕒': 'ساعت', '🗓️': 'تقویم', '📊': 'نمودار', '📈': 'نمودار رشد',
  '📉': 'نمودار افت', '💰': 'پول', '💵': 'پول', '🏠': 'خانه', '🔒': 'قفل', '🔓': 'قفل باز', '🔑': 'کلید',
  '🔍': 'جستجو ذره‌بین', '⚙️': 'تنظیمات چرخ‌دنده', '🛠️': 'ابزار', '⛔': 'ممنوع', '🚫': 'ممنوع',
  '🟢': 'دایره سبز', '🔴': 'دایره قرمز', '🟡': 'دایره زرد', '🔵': 'دایره آبی', '⚪': 'دایره سفید', '⚫': 'دایره سیاه',
  '➡️': 'فلش راست', '⬅️': 'فلش چپ', '⬆️': 'فلش بالا', '⬇️': 'فلش پایین', '🔁': 'تکرار', '♻️': 'بازیافت',
  '1️⃣': 'یک', '2️⃣': 'دو', '3️⃣': 'سه', '🆕': 'جدید', '🆗': 'باشه', '💯': 'صد', '☕': 'قهوه چای', '🍎': 'سیب',
  '🌱': 'گیاه جوانه', '🌸': 'گل', '🌹': 'گل رز', '☀️': 'خورشید آفتاب', '🌙': 'ماه شب', '☁️': 'ابر', '🌧️': 'باران',
  '❄️': 'برف', '⚡': 'برق', '🌍': 'زمین جهان', '🇮🇷': 'ایران پرچم', '🎵': 'موسیقی', '📷': 'دوربین عکس', '🎬': 'فیلم',
  '💻': 'لپ‌تاپ کامپیوتر', '📱': 'موبایل', '🖊️': 'خودکار', '🧠': 'مغز', '👀': 'چشم نگاه', '💬': 'گفتگو پیام',
  '🗣️': 'صحبت', '🤝': 'دست دادن', '💪': 'قدرت بازو', '🏆': 'جام برنده', '🥇': 'مدال اول', '🎓': 'فارغ‌التحصیلی',
};
const GROUPS = [
  { name: 'شکلک‌ها', icon: SMILE_ICON },
  { name: 'آدم‌ها و دست‌ها', icon: s('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5v-4a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7c-2.5 0-4-1.2-5.5-3.5L4 14a1.6 1.6 0 0 1 2.6-1.8L8 14"/>') },
  { name: 'طبیعت', icon: s('<path d="M5 19c0-8 5-13 14-14c-1 9-6 14-14 14zM5 19l7-7"/>') },
  { name: 'خوراکی', icon: s('<path d="M5 9h12v5a6 6 0 0 1-12 0zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5"/>') },
  { name: 'اشیا، سفر و فعالیت', icon: s('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>') },
  { name: 'نمادها', icon: s('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>') },
  { name: 'پرچم‌ها', icon: s('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>') },
];

let DATA = null; // [[emoji, english name, group, tags]]
let byEmoji = null;
async function loadData() {
  if (!DATA) {
    DATA = (await import('./emoji-data.json')).default;
    byEmoji = new Map(DATA.map((x) => [x[0], x]));
  }
  return DATA;
}
const strip = (e) => e.replace(/️/g, '');
const enName = (e) => (byEmoji && (byEmoji.get(e) || byEmoji.get(strip(e))) || [])[1] || '';
const faName = (e) => FA_NAMES[e] || FA_NAMES[strip(e)] || '';
// Persian search ignores ZWNJ, Arabic ي/ك and spacing
const norm = (t) => String(t || '').toLowerCase().replace(/[‌\s]+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();

/**
 * The picker panel.
 * opts: { pins: [emoji], recent: [emoji], insert(emoji), setPins(list), close() }
 */
export function emojiPanel(opts) {
  const root = el('div', { class: 'emoji-panel', dir: 'rtl' });
  const input = el('input', { type: 'text', placeholder: 'جستجوی اموجی، فارسی یا English', 'aria-label': 'جستجوی اموجی', spellcheck: 'false', dir: 'auto' });
  const clear = el('button', { class: 'ep-clear', title: 'پاک کردن', 'aria-label': 'پاک کردن جستجو', html: ICON.x, hidden: true });
  const search = el('label', { class: 'ep-search' }, el('span', { class: 'ic', html: ICON.search }), input, clear);
  const body = el('div', { class: 'ep-body' });
  const prevE = el('span', { class: 'ep-pe' });
  const prevFa = el('b', {});
  const prevEn = el('small', { dir: 'ltr' });
  const foot = el('div', { class: 'ep-foot' }, prevE, el('span', { class: 'ep-pn' }, prevFa, prevEn));
  root.append(search, body, foot);
  let pins = [...opts.pins];

  const preview = (e) => {
    prevE.textContent = e || '';
    prevFa.textContent = e ? faName(e) || enName(e) : '';
    prevEn.textContent = e && faName(e) ? enName(e) : '';
    foot.classList.toggle('empty', !e);
  };
  const pick = (e) => { opts.insert(e); };
  const cell = (e) => {
    const b = el('button', { class: 'eb', title: faName(e) || enName(e), 'aria-label': faName(e) || enName(e) || e }, e);
    b.addEventListener('mousedown', (ev) => ev.preventDefault());
    b.addEventListener('mouseenter', () => preview(e));
    b.addEventListener('focus', () => preview(e));
    b.addEventListener('click', () => pick(e));
    // right-click: pin or unpin
    b.addEventListener('contextmenu', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const on = pins.includes(e);
      pins = on ? pins.filter((x) => x !== e) : [...pins, e];
      opts.setPins(pins);
      toast(on ? 'از پین‌شده‌ها برداشته شد' : 'به پین‌شده‌ها اضافه شد', 'ok');
      paint();
    });
    return b;
  };
  const grid = (list) => el('div', { class: 'ep-grid' }, list.map(cell));
  const head = (text, icon) => el('div', { class: 'mh ep-h' }, icon ? el('span', { class: 'ic', html: icon }) : null, text);

  let sections = [];
  function paintBrowse() {
    body.innerHTML = '';
    body.append(head('پین‌شده', ICON.pin), pins.length ? grid(pins) : el('div', { class: 'ep-note' }, 'با راست‌کلیک روی هر اموجی، آن را این‌جا پین کنید.'));
    body.append(el('div', { class: 'sep' }));
    const cats = el('div', { class: 'ep-cats', role: 'tablist', 'aria-label': 'دسته‌ها' });
    body.append(cats);
    const list = el('div', { class: 'ep-list' });
    body.append(list);
    sections = [];
    const addSection = (name, icon, emojis) => {
      if (!emojis.length) return;
      const sec = el('div', { class: 'ep-sec' }, head(name), grid(emojis));
      list.append(sec);
      const tab = el('button', { class: 'ep-cat', role: 'tab', title: name, 'aria-label': name, html: icon });
      tab.addEventListener('mousedown', (ev) => ev.preventDefault());
      tab.addEventListener('click', () => { list.scrollTop = sec.offsetTop; });
      cats.append(tab);
      sections.push({ sec, tab });
    };
    addSection('اخیر', ICON.clock, opts.recent || []);
    if (!DATA) { list.append(el('div', { class: 'ep-note' }, 'در حال بارگذاری…')); }
    else GROUPS.forEach((g, i) => addSection(g.name, g.icon, DATA.filter((x) => x[2] === i).map((x) => x[0])));
    const spy = () => {
      const y = list.scrollTop + 8;
      let cur = sections[0];
      for (const s2 of sections) if (s2.sec.offsetTop <= y) cur = s2;
      sections.forEach((s2) => s2.tab.classList.toggle('on', s2 === cur));
    };
    list.addEventListener('scroll', spy);
    spy();
  }
  function paintSearch(q) {
    body.innerHTML = '';
    const nq = norm(q);
    const seen = new Set();
    const hits = [];
    const consider = (e, en, tags) => {
      if (seen.has(e)) return;
      const fa = norm(faName(e));
      const score = fa.startsWith(nq) ? 0 : fa.includes(nq) ? 1 : norm(en).startsWith(nq) ? 2 : norm(en).includes(nq) ? 3 : norm(tags).includes(nq) ? 4 : -1;
      if (score < 0) return;
      seen.add(e);
      hits.push({ e, score, pinned: pins.includes(e) });
    };
    for (const e of pins) consider(e, enName(e), '');
    for (const e of Object.keys(FA_NAMES)) consider(e, enName(e), '');
    for (const x of DATA || []) consider(x[0], x[1], x[3]);
    hits.sort((a, b) => a.score - b.score || (b.pinned - a.pinned));
    if (!hits.length) { body.append(el('div', { class: 'ep-empty' }, 'اموجی‌ای با این نام پیدا نشد')); preview(null); return; }
    body.append(head(`${hits.length > 99 ? '+۹۹' : String(hits.length).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])} نتیجه`));
    const rows = el('div', { class: 'ep-rows' });
    for (const h of hits.slice(0, 60)) {
      const r = el('button', { class: 'ep-row' }, el('span', { class: 'ep-re' }, h.e), el('span', { class: 'ep-rn', dir: 'auto' }, faName(h.e) || enName(h.e)), h.pinned ? el('small', {}, 'پین‌شده') : null);
      r.addEventListener('mousedown', (ev) => ev.preventDefault());
      r.addEventListener('mouseenter', () => { rows.querySelectorAll('.ep-row.hv').forEach((n) => n.classList.remove('hv')); r.classList.add('hv'); preview(h.e); });
      r.addEventListener('click', () => pick(h.e));
      rows.append(r);
    }
    rows.firstChild.classList.add('hv');
    preview(hits[0].e);
    body.append(rows);
  }
  function paint() {
    const q = input.value.trim();
    clear.hidden = !q;
    if (q) paintSearch(q); else paintBrowse();
  }
  input.addEventListener('input', paint);
  clear.addEventListener('mousedown', (ev) => ev.preventDefault());
  clear.addEventListener('click', () => { input.value = ''; paint(); input.focus(); });
  // keyboard: arrows move between emoji (the grid runs right to left), Enter inserts
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') return; // the menu closes itself
    ev.stopPropagation();
    const rowsMode = !!body.querySelector('.ep-rows');
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const target = rowsMode ? body.querySelector('.ep-row.hv') : document.activeElement.closest && document.activeElement.closest('.eb');
      if (target) target.click();
      return;
    }
    if (rowsMode && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      ev.preventDefault();
      const all = [...body.querySelectorAll('.ep-row')];
      const i = all.findIndex((n) => n.classList.contains('hv'));
      const n = all[Math.max(0, Math.min(all.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
      all.forEach((x) => x.classList.toggle('hv', x === n));
      n.scrollIntoView({ block: 'nearest' });
      preview(n.firstChild.textContent);
      return;
    }
    if (rowsMode || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    const cells = [...body.querySelectorAll('.eb')];
    const i = cells.indexOf(document.activeElement);
    if (i < 0) { if (ev.key === 'ArrowDown' && cells[0]) { ev.preventDefault(); cells[0].focus(); } return; }
    ev.preventDefault();
    const step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 8, ArrowUp: -8 }[ev.key];
    if (i + step < 0) { input.focus(); return; }
    const n = cells[Math.min(cells.length - 1, i + step)];
    n.focus();
    n.scrollIntoView({ block: 'nearest' });
  });
  paint();
  preview(null);
  if (!DATA) loadData().then(() => { if (root.isConnected) paint(); });
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
  return root;
}
