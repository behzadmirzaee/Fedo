// Version history panel
import { diffLines } from 'diff';
import { el, ICON, fa, faTime, faDay, faDayRel, faClock, modal, toast, relTime } from './ui.js';
import { dirOfText } from './editor.js';

const KIND = { save: 'ذخیره', auto: 'ذخیره‌ی خودکار', open: 'باز کردن فایل', restore: 'قبل از بازگردانی', manual: 'نسخه‌ی دستی', external: 'تغییر بیرونی' };

export function createHistoryPanel(root, { getTab, getContent, restore, snapshotNow }) {
  let versions = [];
  let selected = null;
  let compare = 'current'; // 'current' | 'prev'
  let cache = new Map();

  const list = el('div', { class: 'h-list' });
  const diffBox = el('div', { class: 'h-diff' });
  const segCur = el('button', { class: 'on', onclick: () => setCompare('current') }, 'تفاوت با متن فعلی');
  const segPrev = el('button', { onclick: () => setCompare('prev') }, 'تفاوت با نسخه‌ی قبلی');
  const btnRestore = el('button', { class: 'hb primary', onclick: doRestore }, 'بازگردانی');
  const btnLabel = el('button', { class: 'hb', onclick: doLabel }, 'نام‌گذاری');
  const btnCopy = el('button', { class: 'hb', onclick: doCopy }, 'کپی');
  const btnDel = el('button', { class: 'hb danger', onclick: doDelete }, 'حذف');
  const seg = el('div', { class: 'seg' }, segCur, segPrev);
  const actions = el('div', { class: 'h-actions' }, btnRestore, btnLabel, btnCopy, el('span', { class: 'grow' }), btnDel);
  const detail = el('div', { class: 'h-detail' }, seg, diffBox, actions);
  root.append(
    el('div', { class: 'h-head' }, el('span', { class: 'grow' }, 'تاریخچه‌ی نسخه‌ها'),
      el('button', { class: 'hb', onclick: async () => { const r = await snapshotNow(); if (r) refresh(); } }, 'ثبت نسخه'),
      el('button', { class: 'icon-btn', title: 'بستن', html: ICON.x, onclick: () => hide() })),
    list, detail);

  function visible() { return !root.hidden; }
  function hide() { root.hidden = true; root.dispatchEvent(new Event('toggle')); }
  async function show() { root.hidden = false; root.dispatchEvent(new Event('toggle')); await refresh(); }

  async function read(id) {
    const tab = getTab();
    if (!cache.has(id)) cache.set(id, await window.api.historyRead(tab.path, id));
    return cache.get(id);
  }

  async function refresh() {
    if (!visible()) return;
    const tab = getTab();
    list.innerHTML = '';
    diffBox.innerHTML = '';
    cache = new Map();
    detail.style.display = 'none';
    if (!tab || !tab.path) {
      list.append(el('div', { class: 'h-empty' }, 'تاریخچه برای فایل‌های ذخیره‌شده نگه داشته می‌شود. اول این سند را ذخیره کنید (Ctrl+S).'));
      return;
    }
    versions = await window.api.historyList(tab.path);
    if (!versions.length) {
      list.append(el('div', { class: 'h-empty' }, 'هنوز نسخه‌ای ثبت نشده. با هر ذخیره، و هر چند دقیقه یک بار هنگام نوشتن، یک نسخه ثبت می‌شود.'));
      return;
    }
    let day = '';
    versions.forEach((v, i) => {
      const d = faDayRel(v.time);
      if (d !== day) { day = d; list.append(el('div', { class: 'h-day' }, d)); }
      const prev = versions[i + 1];
      const delta = prev ? v.size - prev.size : v.size;
      const item = el('button', { class: 'h-item' + (selected === v.id ? ' sel' : ''), 'data-id': v.id, title: `${faDay(v.time)}، ${faTime(v.time)} · ${fa(v.size)} نویسه`, onclick: () => select(v.id) },
        el('span', { class: 'h-time' }, faClock(v.time)),
        el('span', { class: 'h-kind' }, KIND[v.kind] || v.kind),
        el('span', { class: 'h-label', dir: dirOfText(v.label || '') || 'auto' }, v.label || ''),
        el('span', { class: 'h-delta ' + (delta > 0 ? 'plus' : delta < 0 ? 'minus' : 'zero'), dir: 'ltr' }, delta > 0 ? `+${fa(delta)}` : delta < 0 ? `−${fa(-delta)}` : fa(0)));
      list.append(item);
    });
    if (!selected || !versions.find((v) => v.id === selected)) selected = versions[0].id;
    select(selected);
  }

  async function select(id) {
    selected = id;
    list.querySelectorAll('.h-item').forEach((n) => n.classList.toggle('sel', n.dataset.id === id));
    detail.style.display = '';
    const idx = versions.findIndex((v) => v.id === id);
    const text = await read(id);
    let base;
    if (compare === 'current') base = getContent();
    else base = versions[idx + 1] ? await read(versions[idx + 1].id) : '';
    // show what changes FROM this version TO the comparison target
    renderDiff(compare === 'current' ? text : base, compare === 'current' ? base : text);
  }

  function renderDiff(oldText, newText) {
    diffBox.innerHTML = '';
    const parts = diffLines(oldText, newText);
    if (parts.every((p) => !p.added && !p.removed)) {
      diffBox.append(el('div', { class: 'h-empty' }, compare === 'current' ? 'این نسخه با متن فعلی یکسان است.' : 'تفاوتی با نسخه‌ی قبلی ندارد.'));
      return;
    }
    const CTX = 3;
    const line = (cls, mark, text) => el('div', { class: 'ln ' + cls },
      el('span', { class: 'mk' }, mark),
      el('span', { class: 'tx', dir: dirOfText(text) || 'auto' }, text));
    parts.forEach((p, i) => {
      const lines = p.value.replace(/\n$/, '').split('\n');
      if (p.added || p.removed) {
        lines.forEach((l) => diffBox.append(line(p.added ? 'ins' : 'del', p.added ? '+' : '−', l)));
        return;
      }
      const first = i === 0, last = i === parts.length - 1;
      if (lines.length <= CTX * 2 + 1) {
        lines.forEach((l) => diffBox.append(line('ctx', '', l)));
        return;
      }
      const head = first ? [] : lines.slice(0, CTX);
      const tail = last ? [] : lines.slice(-CTX);
      head.forEach((l) => diffBox.append(line('ctx', '', l)));
      diffBox.append(el('div', { class: 'gap' }, `⋯ ${fa(lines.length - head.length - tail.length)} خط بدون تغییر`));
      tail.forEach((l) => diffBox.append(line('ctx', '', l)));
    });
  }

  function setCompare(c) {
    compare = c;
    segCur.classList.toggle('on', c === 'current');
    segPrev.classList.toggle('on', c === 'prev');
    if (selected) select(selected);
  }

  async function doRestore() {
    const v = versions.find((x) => x.id === selected);
    if (!v) return;
    const ok = await modal({
      title: 'بازگردانی این نسخه؟',
      text: `متن فعلی با نسخه‌ی ${faTime(v.time)} جایگزین می‌شود. قبل از آن، متن فعلی هم به‌عنوان یک نسخه ثبت می‌شود تا چیزی از دست نرود.`,
      buttons: [{ label: 'انصراف', value: false }, { label: 'بازگردانی', value: true, primary: true }],
    });
    if (!ok) return;
    await restore(await read(v.id));
    toast('نسخه بازگردانی شد. برای ماندگاری، ذخیره کنید.');
    refresh();
  }
  async function doLabel() {
    const v = versions.find((x) => x.id === selected);
    if (!v) return;
    const name = await modal({ title: 'نام این نسخه', input: v.label || '', buttons: [{ label: 'انصراف', value: null }, { label: 'ثبت', primary: true }] });
    if (name == null) return;
    await window.api.historyLabel(getTab().path, v.id, name.trim());
    refresh();
  }
  async function doCopy() {
    await navigator.clipboard.writeText(await read(selected));
    toast('متن این نسخه کپی شد', 'ok');
  }
  async function doDelete() {
    const ok = await modal({ title: 'حذف این نسخه؟', text: 'این کار برگشت‌پذیر نیست.', buttons: [{ label: 'انصراف', value: false }, { label: 'حذف', value: true, danger: true }] });
    if (!ok) return;
    await window.api.historyDelete(getTab().path, selected);
    selected = null;
    refresh();
  }

  return { show, hide, visible, refresh, toggle: () => (visible() ? hide() : show()) };
}
