// Built-in extension: a small image editor (crop, draw, text, emoji, shapes), modelled on Telegram Desktop's.
// This module (and its CSS) is loaded only the first time an image is opened for editing, so it costs nothing
// at start-up. Everything happens on a canvas in the renderer: the original image is never written over;
// the caller gets the edited bytes back and decides where they go.
import './imgedit.css';
import { el, ICON, modal, fa } from './ui.js';
import { emojiPanel } from './emoji.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  crop: svg('<path d="M6.5 2.5v13.5a1.5 1.5 0 0 0 1.5 1.5h13.5M2.5 6.5H16a1.5 1.5 0 0 1 1.5 1.5v13.5"/>'),
  draw: svg('<path d="M3.5 17.5c2.2-3.6 4.4-5.4 6.5-5.4 2.6 0 2.4 4.4 5 4.4 1.9 0 3.6-2.5 5.5-7.5M3.5 9.5C5.3 6.6 7 5 8.6 5c1.5 0 1.8 1.6 1.1 3.2"/>'),
  text: svg('<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>'),
  emoji: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2M9 9.5h.01M15 9.5h.01"/>'),
  shape: svg('<rect x="3.5" y="3.5" width="10" height="10" rx="2"/><circle cx="15" cy="15" r="5.5"/>'),
  undo: svg('<path d="M15 6.5l3.5 3.5L15 13.5M18.5 10H9.5a5 5 0 0 0 0 10h3"/>'),
  redo: svg('<path d="M9 6.5L5.5 10L9 13.5M5.5 10h9a5 5 0 0 1 0 10h-3"/>'),
  rotate: svg('<rect x="3.5" y="10" width="10.5" height="10.5" rx="2"/><path d="M9 5.5h5.5a5 5 0 0 1 5 5v4.5M17 12.5l2.5 2.5L22 12.5"/>'),
  flip: svg('<path d="M12 3v18M9 7L4 17h5V7zM15 7l5 10h-5V7z"/>'),
  pen: svg('<path d="M14.5 5.5l4 4M4 20l1-4.5L15.8 4.7a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19 4 20z"/>'),
  arrow: svg('<path d="M5 19L19 5M10 5h9v9"/>'),
  marker: svg('<path d="M9 15l-4 4h6l2-2M9 15l7.5-9.5a2 2 0 0 1 2.9-.3l.4.4a2 2 0 0 1-.1 2.9L13 15.9M9 15l4 1"/>'),
  blur: svg('<path d="M12 3.5c3.5 4.2 6 7.6 6 10.5a6 6 0 0 1-12 0c0-2.9 2.5-6.3 6-10.5z" stroke-dasharray="2.5 2.5"/>'),
  eraser: svg('<path d="M8.5 19.5h11M4.8 14.6l8.8-8.8a2 2 0 0 1 2.8 0l2.8 2.8a2 2 0 0 1 0 2.8L12 18.6a3 3 0 0 1-4.2 0l-3-3a.7.7 0 0 1 0-1zM9 10.5l5.5 5.5"/>'),
  rect: svg('<rect x="4" y="6" width="16" height="12" rx="2.5"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>'),
  line: svg('<path d="M5 19L19 5"/>'),
  bubble: svg('<path d="M6 4.5h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5v-3.5H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/>'),
};

const COLORS = [
  ['#1D1D1F', 'مشکی'], ['#FFFFFF', 'سفید'], ['#FF3B30', 'قرمز'], ['#FF9500', 'نارنجی'], ['#FFCC00', 'زرد'],
  ['#34C759', 'سبز'], ['#32ADE6', 'آبی روشن'], ['#0066DD', 'آبی'], ['#AF52DE', 'بنفش'],
];
// stroke width on screen, px: a free slider that snaps to these four stops
const SIZES = [3, 6, 10, 16];
const SNAP = 0.045;
const TOOLS = { pen: 'قلم', arrow: 'فلش', marker: 'ماژیک', blur: 'محو کردن', eraser: 'پاک‌کن' };
const SHAPES = { rect: 'مستطیل', ellipse: 'بیضی', line: 'خط', bubble: 'حباب گفت‌وگو' };
const MODES = { crop: 'برش', draw: 'رسم', text: 'متن', emoji: 'اموجی', shape: 'شکل' };
const RATIOS = [['free', 'آزاد', 0], ['orig', 'اصلی', -1], ['1:1', '۱:۱', 1], ['4:3', '۴:۳', 4 / 3], ['16:9', '۱۶:۹', 16 / 9]];
const TIPS = {
  crop: 'گوشه‌ها را بکشید؛ برش تا «ذخیره» قطعی نمی‌شود',
  draw: 'روی تصویر بکشید؛ Shift برای خط صاف',
  text: 'روی تصویر کلیک کنید و بنویسید؛ با کشیدن جابه‌جا کنید',
  emoji: 'اموجی را انتخاب کنید، بعد با گوشه بزرگ و کوچک کنید',
  shape: 'روی تصویر بکشید تا شکل ساخته شود',
};
const MAX_SIDE = 6000; // larger images are scaled down to keep memory in check
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const norm = (a, b) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) });

/**
 * Open the editor over the window.
 * opts: { src (a URL the image can be drawn from without tainting the canvas), ext, fonts: [{id, name}],
 *         emoji: { pins(), recent(), setPins(list), used(e) } }
 * Resolves with { bytes: Uint8Array, ext } after «ذخیره», or null when cancelled.
 */
export async function openImageEditor(opts) {
  const img = new Image();
  img.decoding = 'async';
  img.src = opts.src;
  await img.decode();
  return new Promise((resolve) => new Editor(img, opts, resolve));
}

class Editor {
  constructor(img, opts, resolve) {
    this.opts = opts;
    this.resolve = resolve;
    // the source, scaled down when huge
    let src = img;
    const big = Math.max(img.naturalWidth, img.naturalHeight);
    if (big > MAX_SIDE) {
      const k = MAX_SIDE / big;
      src = document.createElement('canvas');
      src.width = Math.round(img.naturalWidth * k); src.height = Math.round(img.naturalHeight * k);
      src.getContext('2d').drawImage(img, 0, 0, src.width, src.height);
    }
    this.src = src;
    this.sw = src.width || src.naturalWidth; this.sh = src.height || src.naturalHeight;
    this.rot = 0; this.flip = false;
    this.buildBase();
    this.crop = { x: 0, y: 0, w: this.W, h: this.H };
    this.objs = [];
    this.mode = 'draw'; this.tool = 'pen'; this.color = '#FF3B30'; this.size = 1 / 3; this.blurAmt = 5; this.ratio = 'free';
    this.customs = ((opts.colors && opts.colors.get()) || []).slice(-4);
    this.tstyle = 'fill'; this.font = (opts.fonts && opts.fonts[0] && opts.fonts[0].id) || 'Vazirmatn';
    this.shapeKind = 'rect'; this.shapeFill = false;
    this.sel = null; this.drag = null; this.textEdit = null;
    this.hist = [this.snap()]; this.hi = 0;
    this.build();
    this.setMode('draw');
    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey, true);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.stageBox);
    document.fonts.load(`700 32px "${this.font}"`).then(() => this.paint()).catch(() => {});
  }

  // ---------- image transforms ----------
  buildBase() {
    const r = this.rot, w = this.sw, h = this.sh;
    const W = r % 2 ? h : w, H = r % 2 ? w : h;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.translate(W / 2, H / 2);
    x.rotate((r * Math.PI) / 2);
    x.scale(this.flip ? -1 : 1, 1);
    x.drawImage(this.src, -w / 2, -h / 2);
    this.base = c; this.W = W; this.H = H; this.blurCv = null;
  }
  /** the whole image blurred at one strength (1..10), kept per strength */
  blurred(amt = 5) {
    this.blurCv ||= {};
    if (this.blurCv[amt]) return this.blurCv[amt];
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const x = c.getContext('2d');
    x.filter = `blur(${Math.max(2, Math.round((Math.max(this.W, this.H) / 70) * (amt / 5)))}px)`;
    x.drawImage(this.base, 0, 0);
    return (this.blurCv[amt] = c);
  }
  /** move every point of the drawing and the crop along with a rotation or flip of the image */
  mapAll(f) {
    const mp = (p) => f(p[0], p[1]);
    for (const o of this.objs) {
      if (o.pts) o.pts = o.pts.map(mp);
      if (o.a) { o.a = mp(o.a); o.b = mp(o.b); }
      if (o.x != null) [o.x, o.y] = f(o.x, o.y);
    }
    const c = this.crop, r = norm(f(c.x, c.y), f(c.x + c.w, c.y + c.h));
    this.crop = r;
  }
  rotateCW() {
    const H = this.H;
    this.mapAll((x, y) => [H - y, x]);
    this.rot = (this.rot + 1) % 4;
    this.buildBase();
    if (this.ratio === 'orig') { this.setRatio('orig'); return; }
    if (this.ratioVal() && this.ratioVal() !== 1) this.ratio = 'free';
    this.commit();
    this.renderRows();
  }
  flipH() {
    const W = this.W;
    this.mapAll((x, y) => [W - x, y]);
    this.rot = (4 - this.rot) % 4; this.flip = !this.flip;
    this.buildBase();
    this.commit();
  }
  ratioVal() { const k = (RATIOS.find((r) => r[0] === this.ratio) || RATIOS[0])[2]; return k === -1 ? this.W / this.H : k; }
  setRatio(id) {
    this.ratio = id;
    const k = this.ratioVal();
    if (id === 'orig') {
      // «اصلی»: the whole image, as it was
      this.crop = { x: 0, y: 0, w: this.W, h: this.H };
      this.commit();
    } else if (k) {
      // the largest box of that shape that fits, centred on the current crop
      const c = this.crop;
      let w = Math.min(this.W, c.w), h = w / k;
      if (h > this.H) { h = this.H; w = h * k; }
      if (h > c.h && c.h * k <= this.W) { h = Math.max(c.h, Math.min(h, this.H)); w = h * k; }
      if (w > this.W) { w = this.W; h = w / k; }
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      this.crop = { x: clamp(cx - w / 2, 0, this.W - w), y: clamp(cy - h / 2, 0, this.H - h), w, h };
      this.commit();
    }
    this.renderRows();
    this.layout();
  }

  // ---------- history ----------
  snap() { return JSON.stringify({ rot: this.rot, flip: this.flip, crop: this.crop, objs: this.objs.map(({ _box, _editing, ...o }) => o) }); }
  commit() {
    const s = this.snap();
    if (s === this.hist[this.hi]) { this.paint(); return; }
    this.hist = this.hist.slice(0, this.hi + 1);
    this.hist.push(s);
    this.hi++;
    this.afterChange();
  }
  restore(s) {
    const d = JSON.parse(s);
    const rebuild = d.rot !== this.rot || d.flip !== this.flip;
    this.rot = d.rot; this.flip = d.flip; this.crop = d.crop; this.objs = d.objs;
    if (rebuild) this.buildBase();
    this.sel = null;
  }
  undo() { if (this.textEdit) this.endText(); if (this.hi > 0) { this.hi--; this.restore(this.hist[this.hi]); this.afterChange(true); } }
  redo() { if (this.hi < this.hist.length - 1) { this.hi++; this.restore(this.hist[this.hi]); this.afterChange(true); } }
  afterChange(relayout) {
    this.undoBtn.classList.toggle('off', this.hi === 0);
    this.redoBtn.classList.toggle('off', this.hi >= this.hist.length - 1);
    this.undoBtn.setAttribute('aria-disabled', String(this.hi === 0));
    this.redoBtn.setAttribute('aria-disabled', String(this.hi >= this.hist.length - 1));
    if (relayout !== false) this.layout(); else this.paint();
  }

  // ---------- UI ----------
  build() {
    const top = (document.getElementById('topbar') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom;
    const hint = el('div', { class: 'ie-hint', 'aria-hidden': 'true' },
      ...[['Esc', 'انصراف'], ['Ctrl+Enter', 'ذخیره'], ['Ctrl+Z', 'برگرداندن'], ['Ctrl+Y', 'دوباره']].map(([k, l]) => el('span', {}, el('span', { class: 'ie-k' }, k), l)));
    this.cv = el('canvas', { class: 'ie-cv', 'aria-label': 'تصویر در حال ویرایش', role: 'img' });
    this.tip = el('div', { class: 'ie-tip' });
    this.stageBox = el('div', { class: 'ie-stage' }, this.cv);
    this.rows = el('div', { class: 'ie-rows' });
    const mk = (cls, icon, label, title, key, run) => {
      const b = el('button', { class: 'ie-md ' + cls, type: 'button', 'aria-label': key ? `${label} (${key})` : label },
        el('span', { class: 'ic', html: icon }), el('span', { class: 'lb' }, label));
      if (title) b.append(el('span', { class: 'ie-tt' }, title, key ? el('span', { class: 'k' }, key) : null));
      b.addEventListener('click', run);
      return b;
    };
    this.undoBtn = mk('ie-ur off', I.undo, 'برگرداندن', 'برگرداندن آخرین تغییر', 'Ctrl+Z', () => this.undo());
    this.redoBtn = mk('ie-ur off', I.redo, 'دوباره', 'انجام دوباره‌ی چیزی که برگرداندید', 'Ctrl+Y', () => this.redo());
    this.modeBtns = {};
    const modes = el('div', { class: 'ie-modes' }, Object.entries(MODES).map(([id, label]) => (this.modeBtns[id] = mk('', I[id], label, null, null, () => this.setMode(id)))));
    const bar = el('div', { class: 'ie-bar' },
      el('div', { class: 'ie-urs' }, this.undoBtn, this.redoBtn),
      el('span', { class: 'ie-sep' }),
      modes);
    this.sheet = el('div', { class: 'ie-sheet' }, this.rows, bar);
    // cancel and save sit in their own box under the controls
    const acts = el('div', { class: 'ie-acts' },
      el('button', { class: 'ie-bt', type: 'button', onclick: () => this.cancel() }, 'انصراف'),
      el('span', { class: 'ie-note' }, this.opts.note || ''),
      el('button', { class: 'ie-bt pr', type: 'button', onclick: () => this.save() }, 'ذخیره'));
    this.dock = el('div', { class: 'ie-dock', dir: 'rtl' }, this.sheet, acts);
    this.colorInput = el('input', { type: 'color', class: 'ie-ci', tabindex: '-1', 'aria-hidden': 'true' });
    this.colorInput.addEventListener('input', () => this.pickColor(this.colorInput.value.toUpperCase(), true));
    this.colorInput.addEventListener('change', () => this.addCustom(this.colorInput.value.toUpperCase()));
    this.root = el('div', { class: 'ie-root', dir: 'rtl', role: 'dialog', 'aria-label': 'ویرایش تصویر', style: `top:${top}px` }, hint, this.stageBox, this.tip, this.dock, this.colorInput);
    document.body.append(this.root);
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    this.cv.addEventListener('pointerup', (e) => this.up(e));
    this.cv.addEventListener('pointercancel', (e) => this.up(e));
    this.cv.addEventListener('dblclick', (e) => this.dbl(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('pointerdown', (e) => { if (this.textEdit && !this.textEdit.box.contains(e.target) && e.target !== this.cv) this.endText(); });
    requestAnimationFrame(() => this.root.classList.add('in'));
  }

  setMode(m) {
    if (this.textEdit) this.endText();
    this.mode = m;
    this.sel = null;
    for (const [id, b] of Object.entries(this.modeBtns)) { b.classList.toggle('on', id === m); b.setAttribute('aria-pressed', String(id === m)); }
    this.tip.textContent = TIPS[m];
    this.closePop();
    this.renderRows();
    this.layout();
  }

  swatches() {
    const row = el('div', { class: 'ie-row c' });
    for (const [hex, name] of COLORS) {
      const b = el('button', { class: 'ie-sw' + (this.color === hex ? ' on' : ''), type: 'button', 'aria-label': name, title: name }, el('b', { style: `background:${hex}` }));
      b.addEventListener('click', () => this.pickColor(hex));
      row.append(b);
    }
    // up to four colours of your own, then the colour wheel that adds one
    if (this.customs.length) row.append(el('span', { class: 'ie-csep' }));
    for (const hex of this.customs) {
      const b = el('button', { class: 'ie-sw' + (this.color === hex ? ' on' : ''), type: 'button', 'aria-label': 'رنگ دلخواه ' + hex, title: hex }, el('b', { style: `background:${hex}` }));
      b.addEventListener('click', () => this.pickColor(hex));
      row.append(b);
    }
    const cb = el('button', { class: 'ie-sw cust', type: 'button', 'aria-label': 'افزودن رنگ دلخواه', title: 'افزودن رنگ دلخواه' }, el('b'));
    cb.addEventListener('click', () => { this.colorInput.value = this.color.length === 7 ? this.color : '#FF3B30'; this.colorInput.click(); });
    row.append(cb);
    return row;
  }
  seg(list, cur, pick) {
    return el('div', { class: 'ie-seg' }, list.map(([id, label]) => {
      const b = el('button', { type: 'button', class: id === cur ? 'on' : '', 'aria-pressed': String(id === cur) }, label);
      b.addEventListener('click', () => pick(id));
      return b;
    }));
  }
  ib(icon, label, on, run, named) {
    const b = el('button', { class: 'ie-ib' + (on ? ' on' : '') + (on && named ? ' named' : ''), type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(!!on) },
      el('span', { class: 'ic', html: icon }), on && named ? el('span', {}, label) : null);
    b.addEventListener('click', run);
    return b;
  }
  renderRows() {
    const r = this.rows;
    r.innerHTML = '';
    const lbl = (t) => el('span', { class: 'ie-lbl' }, t);
    const grow = () => el('span', { class: 'grow' });
    if (this.mode === 'crop') {
      const reset = el('button', { class: 'ie-lnk', type: 'button' }, 'بازنشانی');
      reset.addEventListener('click', () => this.resetAll());
      r.append(el('div', { class: 'ie-row' },
        this.ib(I.rotate, 'چرخش ۹۰ درجه', false, () => this.rotateCW()),
        this.ib(I.flip, 'برگرداندن افقی', false, () => this.flipH()),
        el('span', { class: 'ie-sep' }), lbl('نسبت'),
        this.seg(RATIOS.map((x) => [x[0], x[1]]), this.ratio, (id) => this.setRatio(id)),
        grow(), reset));
    } else if (this.mode === 'draw') {
      if (this.tool === 'blur') {
        const amt = el('input', { type: 'range', min: '1', max: '10', step: '1', class: 'ie-range', 'aria-label': 'میزان محو', dir: 'rtl' });
        amt.value = String(this.blurAmt);
        amt.addEventListener('input', () => { this.blurAmt = Number(amt.value); });
        r.append(el('div', { class: 'ie-row c' }, lbl('میزان محو'), lbl('کم'), amt, lbl('زیاد')));
      } else if (this.tool !== 'eraser') r.append(this.swatches());
      r.append(el('div', { class: 'ie-row' },
        ...Object.entries(TOOLS).map(([id, label]) => this.ib(I[id], label, this.tool === id, () => { this.tool = id; this.renderRows(); this.layout(); }, true)),
        grow(), this.sizeSlider()));
    } else if (this.mode === 'text') {
      r.append(this.swatches());
      const fonts = (this.opts.fonts || []).map((f) => [f.id, f.name]);
      r.append(el('div', { class: 'ie-row' },
        lbl('زمینه'), this.seg([['none', 'بدون'], ['fill', 'پر'], ['soft', 'نیمه‌شفاف']], this.tstyle, (id) => { this.tstyle = id; this.applyToSel({ bg: id }); this.renderRows(); }),
        fonts.length > 1 ? el('span', { class: 'ie-sep' }) : null, fonts.length > 1 ? lbl('فونت') : null,
        fonts.length > 1 ? this.seg(fonts, this.font, (id) => { this.font = id; document.fonts.load(`700 32px "${id}"`).finally(() => this.paint()); this.applyToSel({ font: id }); this.renderRows(); }) : null));
    } else if (this.mode === 'emoji') {
      const search = el('button', { class: 'ie-search', type: 'button' }, el('span', { class: 'ic', html: ICON.search }), el('span', {}, 'جستجوی اموجی'));
      search.addEventListener('click', () => this.openEmojiPop(search));
      const pins = (this.opts.emoji ? this.opts.emoji.pins() : []).slice(0, 12);
      r.append(el('div', { class: 'ie-row' }, search, el('span', { class: 'ie-sep' }),
        el('div', { class: 'ie-emos' }, pins.map((e) => {
          const b = el('button', { class: 'ie-emo', type: 'button', 'aria-label': e }, e);
          b.addEventListener('click', () => this.addEmoji(e));
          return b;
        }))));
    } else if (this.mode === 'shape') {
      r.append(this.swatches());
      r.append(el('div', { class: 'ie-row' },
        ...Object.entries(SHAPES).map(([id, label]) => this.ib(I[id], label, this.shapeKind === id, () => { this.shapeKind = id; this.renderRows(); }, true)),
        el('span', { class: 'ie-sep' }),
        this.seg([['0', 'توخالی'], ['1', 'توپر']], this.shapeFill ? '1' : '0', (id) => { this.shapeFill = id === '1'; this.applyToSel({ fill: this.shapeFill }); this.renderRows(); })));
    }
  }
  pickColor(hex, live) {
    this.color = hex;
    this.applyToSel({ color: hex });
    if (this.textEdit) { this.textEdit.o.color = hex; this.styleTextBox(); }
    if (!live) this.renderRows();
  }
  /** a colour from the wheel joins the row; the fifth one pushes out the oldest */
  addCustom(hex) {
    if (!COLORS.some((c) => c[0] === hex)) {
      this.customs = this.customs.filter((c) => c !== hex).concat([hex]).slice(-4);
      if (this.opts.colors) this.opts.colors.set(this.customs);
    }
    this.pickColor(hex);
  }
  /** the tapered thickness slider: free, but it snaps to the four stops */
  sizeSlider() {
    const wrap = el('div', { class: 'ie-wedge', title: 'ضخامت' });
    wrap.innerHTML = '<svg viewBox="0 0 190 34" aria-hidden="true"><path d="M15 5 L183 14 A3 3 0 0 1 183 20 L15 29 A12 12 0 0 1 15 5Z"/>'
      + [183, 127, 71, 15].map((x) => `<circle cx="${x}" cy="17" r="1.6"/>`).join('') + '</svg>';
    const thumb = el('span', { class: 'th' });
    const inp = el('input', { type: 'range', min: '0', max: '1000', step: '1', 'aria-label': 'ضخامت', dir: 'rtl' });
    inp.value = String(Math.round(this.size * 1000));
    const place = () => {
      const px = this.sizePx(), d = 8 + (px - 3) * 1.15;
      thumb.style.right = 7 + this.size * 168 + 'px';
      thumb.style.width = thumb.style.height = d + 'px';
    };
    inp.addEventListener('input', () => {
      let t = inp.value / 1000;
      for (let i = 0; i < SIZES.length; i++) { const stop = i / (SIZES.length - 1); if (Math.abs(t - stop) < SNAP) t = stop; }
      this.size = t;
      place();
    });
    place();
    wrap.append(thumb, inp);
    return wrap;
  }
  /** a style picked while a text or shape is selected applies to it */
  applyToSel(patch) {
    const o = this.sel || (this.textEdit && this.textEdit.o);
    if (!o) return;
    let hit = false;
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'bg' || k === 'font') { if (o.type !== 'text') continue; }
      if (k === 'fill' && o.type !== 'shape') continue;
      if (k === 'color' && o.type === 'emoji') continue;
      o[k] = v; hit = true;
    }
    if (!hit) return;
    if (this.textEdit) this.styleTextBox(); else this.commit();
  }
  resetAll() {
    this.rot = 0; this.flip = false; this.buildBase();
    this.objs = []; this.crop = { x: 0, y: 0, w: this.W, h: this.H }; this.ratio = 'free';
    this.commit(); this.renderRows();
  }

  // ---------- emoji ----------
  openEmojiPop(anchor) {
    this.closePop();
    const em = this.opts.emoji;
    const pop = el('div', { class: 'menu emoji-menu ie-pop' }, emojiPanel({
      pins: em ? em.pins() : [], recent: em ? em.recent() : [], setPins: (l) => { if (em) em.setPins(l); this.renderRows(); },
      insert: (e) => { this.closePop(); this.addEmoji(e); },
    }));
    this.root.append(pop);
    const a = anchor.getBoundingClientRect(), top = this.root.getBoundingClientRect().top;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, a.right - pop.offsetWidth)) + 'px';
    pop.style.top = Math.max(8, a.top - top - pop.offsetHeight - 10) + 'px';
    this.pop = pop;
    this.popOff = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) this.closePop(); };
    setTimeout(() => document.addEventListener('pointerdown', this.popOff, true), 0);
  }
  closePop() {
    if (!this.pop) return;
    this.pop.remove(); this.pop = null;
    document.removeEventListener('pointerdown', this.popOff, true);
  }
  addEmoji(e) {
    const R = this.view();
    const size = Math.min(R.w, R.h) * 0.2;
    const o = { type: 'emoji', ch: e, x: R.x + R.w / 2, y: R.y + R.h / 2, size };
    this.objs.push(o);
    this.sel = o;
    if (this.opts.emoji) this.opts.emoji.used(e);
    this.commit();
  }

  // ---------- geometry ----------
  view() { return this.mode === 'crop' ? { x: 0, y: 0, w: this.W, h: this.H } : this.crop; }
  layout() {
    if (!this.root.isConnected) return;
    const R = this.view();
    const bw = this.stageBox.clientWidth - 48, bh = this.stageBox.clientHeight - 24;
    if (bw <= 0 || bh <= 0) return;
    this.k = Math.min(bw / R.w, bh / R.h, 2);
    const cw = Math.max(1, Math.round(R.w * this.k)), ch = Math.max(1, Math.round(R.h * this.k));
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.cv.style.width = cw + 'px'; this.cv.style.height = ch + 'px';
    this.cv.width = Math.round(cw * dpr); this.cv.height = Math.round(ch * dpr);
    if (this.textEdit) this.placeTextBox();
    this.paint();
  }
  toBase(e) {
    const r = this.cv.getBoundingClientRect(), R = this.view();
    return [R.x + (e.clientX - r.left) / this.k, R.y + (e.clientY - r.top) / this.k];
  }
  toScreen(x, y) { const R = this.view(); return [(x - R.x) * this.k, (y - R.y) * this.k]; }
  sizePx(t = this.size) {
    const f = clamp(t, 0, 1) * (SIZES.length - 1), i = Math.min(SIZES.length - 2, Math.floor(f));
    return SIZES[i] + (SIZES[i + 1] - SIZES[i]) * (f - i);
  }
  strokeW() { return this.sizePx() / this.k; }

  // ---------- drawing ----------
  paint() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }
  draw() {
    const c = this.cv, x = c.getContext('2d'), R = this.view(), s = this.k * this.dpr;
    if (!s) return;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.setTransform(s, 0, 0, s, -R.x * s, -R.y * s);
    this.renderScene(x, c.width, c.height, s);
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.mode === 'crop') this.drawCropUI(x);
    if (this.sel) this.drawSelUI(x, this.sel);
  }
  /** the image and every object, in image coordinates (ctx is already transformed) */
  renderScene(x, cw, ch, s) {
    x.imageSmoothingQuality = 'high';
    x.drawImage(this.base, 0, 0);
    for (const o of this.objs) if (!o._editing) this.drawObj(x, o, cw, ch, s);
  }
  drawObj(x, o, cw, ch, s) {
    x.save();
    if (o.type === 'stroke') {
      if (o.tool === 'blur') { this.drawBlur(x, o, cw, ch); x.restore(); return; }
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = o.color; x.lineWidth = o.w;
      if (o.tool === 'marker') x.globalAlpha = 0.45;
      this.path(x, o.pts);
      x.stroke();
    } else if (o.type === 'arrow') {
      const [a, b] = [o.a, o.b];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const hl = Math.max(o.w * 3.2, 10 / (s || 1));
      x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = o.color; x.lineWidth = o.w;
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]);
      x.moveTo(b[0] - hl * Math.cos(ang - 0.5), b[1] - hl * Math.sin(ang - 0.5)); x.lineTo(b[0], b[1]);
      x.lineTo(b[0] - hl * Math.cos(ang + 0.5), b[1] - hl * Math.sin(ang + 0.5));
      x.stroke();
    } else if (o.type === 'shape') {
      const r = norm(o.a, o.b);
      x.strokeStyle = o.color; x.fillStyle = o.color; x.lineWidth = o.w; x.lineJoin = 'round'; x.lineCap = 'round';
      x.beginPath();
      if (o.kind === 'rect') x.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.08);
      else if (o.kind === 'ellipse') x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      else if (o.kind === 'line') { x.moveTo(o.a[0], o.a[1]); x.lineTo(o.b[0], o.b[1]); }
      else if (o.kind === 'bubble') this.bubble(x, r);
      if (o.fill && o.kind !== 'line') x.fill(); else x.stroke();
    } else if (o.type === 'text') {
      this.drawText(x, o);
    } else if (o.type === 'emoji') {
      x.font = `${o.size}px ${EMOJI_FONT}`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(o.ch, o.x, o.y + o.size * 0.06);
      o._box = { x: o.x - o.size * 0.6, y: o.y - o.size * 0.6, w: o.size * 1.2, h: o.size * 1.2 };
    }
    x.restore();
  }
  path(x, pts) {
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) { x.lineTo(pts[0][0] + 0.01, pts[0][1]); return; }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      x.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1];
    x.lineTo(l[0], l[1]);
  }
  bubble(x, r) {
    const tailH = r.h * 0.22, bh = r.h - tailH, rad = Math.min(r.w, bh) * 0.18;
    const tx = r.x + r.w * 0.28;
    x.moveTo(r.x + rad, r.y);
    x.lineTo(r.x + r.w - rad, r.y); x.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + rad);
    x.lineTo(r.x + r.w, r.y + bh - rad); x.quadraticCurveTo(r.x + r.w, r.y + bh, r.x + r.w - rad, r.y + bh);
    x.lineTo(tx + r.w * 0.14, r.y + bh); x.lineTo(tx - r.w * 0.04, r.y + r.h); x.lineTo(tx, r.y + bh);
    x.lineTo(r.x + rad, r.y + bh); x.quadraticCurveTo(r.x, r.y + bh, r.x, r.y + bh - rad);
    x.lineTo(r.x, r.y + rad); x.quadraticCurveTo(r.x, r.y, r.x + rad, r.y);
    x.closePath();
  }
  /** blur: a stroke that shows the blurred image underneath, drawn through a mask on a scratch canvas */
  drawBlur(x, o, cw, ch) {
    const t = (this.scratch ||= document.createElement('canvas'));
    if (t.width !== cw || t.height !== ch) { t.width = cw; t.height = ch; }
    const tx = t.getContext('2d');
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.clearRect(0, 0, cw, ch);
    tx.setTransform(x.getTransform());
    tx.lineCap = 'round'; tx.lineJoin = 'round'; tx.lineWidth = o.w; tx.strokeStyle = '#000';
    this.path(tx, o.pts);
    tx.stroke();
    tx.globalCompositeOperation = 'source-in';
    tx.drawImage(this.blurred(o.amt || 5), 0, 0);
    tx.globalCompositeOperation = 'source-over';
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(t, 0, 0);
    x.restore();
  }
  textStyle(o) {
    const dark = lum(o.color) < 0.55;
    if (o.bg === 'fill') return { fg: dark ? '#FFFFFF' : '#1D1D1F', bg: o.color };
    if (o.bg === 'soft') return { fg: o.color, bg: dark ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.55)' };
    return { fg: o.color, bg: null, shadow: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)' };
  }
  drawText(x, o) {
    const lines = String(o.text).split('\n');
    const lh = o.size * 1.4, pad = o.size * 0.38;
    x.font = `700 ${o.size}px "${o.font}", Vazirmatn, sans-serif`;
    x.direction = RTL_RE.test(o.text) ? 'rtl' : 'ltr';
    const w = Math.max(...lines.map((l) => x.measureText(l || ' ').width));
    const h = lines.length * lh;
    const st = this.textStyle(o);
    const box = { x: o.x - w / 2 - pad, y: o.y - h / 2 - pad * 0.6, w: w + pad * 2, h: h + pad * 1.2 };
    o._box = box;
    if (st.bg) { x.fillStyle = st.bg; x.beginPath(); x.roundRect(box.x, box.y, box.w, box.h, o.size * 0.32); x.fill(); }
    x.fillStyle = st.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (st.shadow) { x.shadowColor = st.shadow; x.shadowBlur = o.size * 0.18; }
    lines.forEach((l, i) => x.fillText(l, o.x, o.y - h / 2 + lh * (i + 0.5) + o.size * 0.04));
  }
  drawCropUI(x) {
    let [x0, y0] = this.toScreen(this.crop.x, this.crop.y);
    let [x1, y1] = this.toScreen(this.crop.x + this.crop.w, this.crop.y + this.crop.h);
    const W = this.cv.width / this.dpr, H = this.cv.height / this.dpr;
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(0, 0, W, y0); x.fillRect(0, y1, W, H - y1); x.fillRect(0, y0, x0, y1 - y0); x.fillRect(x1, y0, W - x1, y1 - y0);
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1;
    x.beginPath();
    for (const f of [1 / 3, 2 / 3]) {
      x.moveTo(x0 + (x1 - x0) * f, y0); x.lineTo(x0 + (x1 - x0) * f, y1);
      x.moveTo(x0, y0 + (y1 - y0) * f); x.lineTo(x1, y0 + (y1 - y0) * f);
    }
    x.stroke();
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 1.5; x.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const c = Math.min(22, (x1 - x0) / 3, (y1 - y0) / 3);
    x.lineWidth = 4; x.lineCap = 'square';
    x0 += 2; y0 += 2; x1 -= 2; y1 -= 2;
    x.beginPath();
    x.moveTo(x0, y0 + c); x.lineTo(x0, y0); x.lineTo(x0 + c, y0);
    x.moveTo(x1 - c, y0); x.lineTo(x1, y0); x.lineTo(x1, y0 + c);
    x.moveTo(x1, y1 - c); x.lineTo(x1, y1); x.lineTo(x1 - c, y1);
    x.moveTo(x0 + c, y1); x.lineTo(x0, y1); x.lineTo(x0, y1 - c);
    x.stroke();
  }
  selBox(o) {
    const b = o.type === 'shape' ? (() => { const r = norm(o.a, o.b), m = o.w; return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 }; })() : o._box;
    if (!b) return null;
    const [x0, y0] = this.toScreen(b.x, b.y), [x1, y1] = this.toScreen(b.x + b.w, b.y + b.h);
    return { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 6 };
  }
  drawSelUI(x, o) {
    const b = this.selBox(o);
    if (!b) return;
    x.save();
    x.setLineDash([5, 4]); x.strokeStyle = '#FFFFFF'; x.lineWidth = 1.5;
    x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 3;
    x.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    x.setLineDash([]);
    // delete (top-left) and resize (bottom-right)
    x.fillStyle = '#FFFFFF';
    x.beginPath(); x.arc(b.x0, b.y0, 10, 0, Math.PI * 2); x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = '#1D1D1F'; x.lineWidth = 1.7;
    x.beginPath(); x.moveTo(b.x0 - 4, b.y0 - 4); x.lineTo(b.x0 + 4, b.y0 + 4); x.moveTo(b.x0 + 4, b.y0 - 4); x.lineTo(b.x0 - 4, b.y0 + 4); x.stroke();
    x.fillStyle = '#FFFFFF'; x.strokeStyle = '#0066DD'; x.lineWidth = 2;
    x.beginPath(); x.arc(b.x1, b.y1, 7, 0, Math.PI * 2); x.fill(); x.stroke();
    x.restore();
  }

  // ---------- pointer ----------
  screenPt(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  hitObj(p) {
    for (let i = this.objs.length - 1; i >= 0; i--) {
      const o = this.objs[i];
      if (o.type === 'text' || o.type === 'emoji') { const b = o._box; if (b && p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h) return o; }
      if (o.type === 'shape') {
        // hollow shapes are grabbed from anywhere inside, like filled ones; lines from close by
        const r = norm(o.a, o.b), tol = Math.max(o.w, 10 / this.k);
        if (o.kind === 'line') { if (segDist(p, o.a, o.b) <= Math.max(o.w, 14 / this.k)) return o; }
        else if (p[0] >= r.x - tol && p[0] <= r.x + r.w + tol && p[1] >= r.y - tol && p[1] <= r.y + r.h + tol) return o;
      }
    }
    return null;
  }
  cropHandle(sp) {
    const [x0, y0] = this.toScreen(this.crop.x, this.crop.y);
    const [x1, y1] = this.toScreen(this.crop.x + this.crop.w, this.crop.y + this.crop.h);
    const T = 14;
    const nl = Math.abs(sp[0] - x0) < T, nr = Math.abs(sp[0] - x1) < T, nt = Math.abs(sp[1] - y0) < T, nb = Math.abs(sp[1] - y1) < T;
    const inX = sp[0] > x0 - T && sp[0] < x1 + T, inY = sp[1] > y0 - T && sp[1] < y1 + T;
    let h = '';
    if (nt && inX) h += 'n'; else if (nb && inX) h += 's';
    if (nl && inY) h += 'w'; else if (nr && inY) h += 'e';
    if (h) return h;
    if (sp[0] > x0 && sp[0] < x1 && sp[1] > y0 && sp[1] < y1) return 'move';
    return null;
  }
  down(e) {
    if (e.button !== 0) return;
    this.closePop();
    const p = this.toBase(e), sp = this.screenPt(e);
    this.cv.setPointerCapture(e.pointerId);
    const m = this.mode;
    if (m === 'crop') {
      const h = this.cropHandle(sp);
      if (h) this.drag = { kind: 'crop', h, p0: p, c0: { ...this.crop } };
      return;
    }
    if (m === 'draw') {
      if (this.tool === 'eraser') { this.drag = { kind: 'erase', removed: 0 }; this.erase(p); return; }
      if (this.tool === 'arrow') { const o = { type: 'arrow', color: this.color, w: this.strokeW(), a: p, b: p }; this.objs.push(o); this.drag = { kind: 'new', o }; return; }
      const w = this.tool === 'marker' ? this.strokeW() * 3 : this.tool === 'blur' ? Math.max(this.strokeW() * 4, 18 / this.k) : this.strokeW();
      const o = { type: 'stroke', tool: this.tool, color: this.color, w, pts: [p] };
      if (this.tool === 'blur') o.amt = this.blurAmt;
      this.objs.push(o);
      this.drag = { kind: 'new', o, shift: e.shiftKey };
      this.paint();
      return;
    }
    // text, emoji, shape: select, move, resize, delete
    if (this.textEdit) { this.endText(); return; }
    if (this.sel) {
      const b = this.selBox(this.sel);
      if (b && Math.hypot(sp[0] - b.x0, sp[1] - b.y0) <= 12) { this.objs = this.objs.filter((o) => o !== this.sel); this.sel = null; this.commit(); return; }
      if (b && Math.hypot(sp[0] - b.x1, sp[1] - b.y1) <= 12) { this.drag = { kind: 'resize', o: this.sel, p0: p, o0: JSON.parse(JSON.stringify(this.sel)) }; return; }
    }
    const hit = this.hitObj(p);
    if (hit) {
      this.sel = hit;
      if (hit.type === 'text') { this.tstyle = hit.bg; this.font = hit.font; }
      if (hit.color) this.color = hit.color;
      if (hit.type === 'shape') { this.shapeFill = !!hit.fill; }
      this.renderRows();
      this.drag = { kind: 'move', o: hit, p0: p, o0: JSON.parse(JSON.stringify(hit)) };
      this.paint();
      return;
    }
    if (this.sel) { this.sel = null; this.paint(); return; }
    if (m === 'text') { this.startText(p); return; }
    if (m === 'shape') {
      const o = { type: 'shape', kind: this.shapeKind, color: this.color, w: this.strokeW() * 1.3, fill: this.shapeFill, a: p, b: p };
      this.objs.push(o);
      this.drag = { kind: 'new', o };
    }
  }
  move(e) {
    const d = this.drag;
    if (!d) { this.hover(e); return; }
    const p = this.toBase(e);
    if (d.kind === 'crop') this.dragCrop(d, p);
    else if (d.kind === 'erase') this.erase(p);
    else if (d.kind === 'new') {
      const o = d.o;
      if (o.type === 'stroke') {
        if (e.shiftKey) o.pts = [o.pts[0], p];
        else { const l = o.pts[o.pts.length - 1]; if (dist(l, p) * this.k >= 1.5) o.pts.push(p); }
      } else {
        let b = p;
        if (e.shiftKey && o.type === 'shape' && o.kind !== 'line') { const s = Math.max(Math.abs(p[0] - o.a[0]), Math.abs(p[1] - o.a[1])); b = [o.a[0] + Math.sign(p[0] - o.a[0]) * s, o.a[1] + Math.sign(p[1] - o.a[1]) * s]; }
        o.b = b;
      }
    } else if (d.kind === 'move') {
      const dx = p[0] - d.p0[0], dy = p[1] - d.p0[1], o = d.o, o0 = d.o0;
      if (o.a) { o.a = [o0.a[0] + dx, o0.a[1] + dy]; o.b = [o0.b[0] + dx, o0.b[1] + dy]; } else { o.x = o0.x + dx; o.y = o0.y + dy; }
      d.moved = true;
    } else if (d.kind === 'resize') {
      const o = d.o, o0 = d.o0;
      if (o.type === 'shape') { o.b = [o0.b[0] + p[0] - d.p0[0], o0.b[1] + p[1] - d.p0[1]]; }
      else {
        const r0 = Math.max(1, dist([o0.x, o0.y], d.p0)), r1 = dist([o0.x, o0.y], p);
        o.size = clamp(o0.size * (r1 / r0), 8 / this.k, Math.max(this.W, this.H));
      }
      d.moved = true;
    }
    this.paint();
  }
  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    try { this.cv.releasePointerCapture(e.pointerId); } catch {}
    if (d.kind === 'new') {
      const o = d.o;
      const tiny = o.type === 'stroke' ? false : dist(o.a, o.b) * this.k < 6;
      if (tiny) { this.objs = this.objs.filter((x) => x !== o); this.paint(); return; }
      if (o.type === 'shape') this.sel = o;
      this.commit();
    } else if (d.kind === 'erase') { if (d.removed) this.commit(); }
    else if (d.kind === 'crop') { this.commit(); }
    else if (d.moved) this.commit();
  }
  dbl(e) {
    if (this.mode !== 'text' && this.mode !== 'emoji' && this.mode !== 'shape') return;
    const o = this.hitObj(this.toBase(e));
    if (o && o.type === 'text') { if (this.mode !== 'text') this.setMode('text'); this.startText(null, o); }
  }
  hover(e) {
    const m = this.mode;
    let cur = 'default';
    if (m === 'crop') {
      const h = this.cropHandle(this.screenPt(e));
      cur = !h ? 'default' : h === 'move' ? 'move' : ({ n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' }[h] + '-resize');
    } else if (m === 'draw') cur = 'crosshair';
    else {
      const sp = this.screenPt(e), b = this.sel && this.selBox(this.sel);
      if (b && Math.hypot(sp[0] - b.x0, sp[1] - b.y0) <= 12) cur = 'pointer';
      else if (b && Math.hypot(sp[0] - b.x1, sp[1] - b.y1) <= 12) cur = 'nwse-resize';
      else if (this.hitObj(this.toBase(e))) cur = 'move';
      else cur = m === 'text' ? 'text' : m === 'shape' ? 'crosshair' : 'default';
    }
    this.cv.style.cursor = cur;
  }
  erase(p) {
    const r = Math.max(this.strokeW() * 2, 10 / this.k);
    const before = this.objs.length;
    this.objs = this.objs.filter((o) => {
      if (o.type === 'stroke') {
        if (o.pts.length === 1) return dist(o.pts[0], p) > r + o.w / 2;
        for (let i = 1; i < o.pts.length; i++) if (segDist(p, o.pts[i - 1], o.pts[i]) <= r + o.w / 2) return false;
        return true;
      }
      if (o.type === 'arrow') return segDist(p, o.a, o.b) > r + o.w / 2;
      return true;
    });
    if (this.objs.length !== before) { this.drag.removed += before - this.objs.length; this.paint(); }
  }
  dragCrop(d, p) {
    const c0 = d.c0, dx = p[0] - d.p0[0], dy = p[1] - d.p0[1];
    const minS = 24 / this.k, W = this.W, H = this.H, k = this.ratioVal();
    if (d.h === 'move') {
      this.crop = { ...c0, x: clamp(c0.x + dx, 0, W - c0.w), y: clamp(c0.y + dy, 0, H - c0.h) };
      return;
    }
    let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.w, y1 = c0.y + c0.h;
    if (d.h.includes('w')) x0 = clamp(x0 + dx, 0, x1 - minS);
    if (d.h.includes('e')) x1 = clamp(x1 + dx, x0 + minS, W);
    if (d.h.includes('n')) y0 = clamp(y0 + dy, 0, y1 - minS);
    if (d.h.includes('s')) y1 = clamp(y1 + dy, y0 + minS, H);
    if (k) {
      // keep the ratio: the dragged side leads, the other follows from the opposite corner
      let w = x1 - x0, h = y1 - y0;
      if (d.h === 'n' || d.h === 's') w = h * k; else if (d.h === 'e' || d.h === 'w') h = w / k;
      else if (w / h > k) w = h * k; else h = w / k;
      const ax = d.h.includes('w') ? c0.x + c0.w : d.h.includes('e') ? c0.x : c0.x + c0.w / 2;
      const ay = d.h.includes('n') ? c0.y + c0.h : d.h.includes('s') ? c0.y : c0.y + c0.h / 2;
      const maxW = d.h.includes('w') ? ax : d.h.includes('e') ? W - ax : Math.min(ax, W - ax) * 2;
      const maxH = d.h.includes('n') ? ay : d.h.includes('s') ? H - ay : Math.min(ay, H - ay) * 2;
      const f = Math.min(1, maxW / w, maxH / h);
      w *= f; h *= f;
      x0 = d.h.includes('w') ? ax - w : d.h.includes('e') ? ax : ax - w / 2;
      y0 = d.h.includes('n') ? ay - h : d.h.includes('s') ? ay : ay - h / 2;
      x1 = x0 + w; y1 = y0 + h;
    }
    this.crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---------- text editing (an editable box over the canvas) ----------
  startText(p, existing) {
    const o = existing || { type: 'text', text: '', x: p[0], y: p[1], size: 30 / this.k, color: this.color, bg: this.tstyle, font: this.font };
    if (!existing) this.objs.push(o);
    o._editing = true;
    this.sel = null;
    const box = el('div', { class: 'ie-tb', contenteditable: 'plaintext-only', spellcheck: 'false', dir: 'auto', role: 'textbox', 'aria-label': 'متن روی تصویر' });
    box.textContent = o.text;
    box.addEventListener('input', () => { o.text = box.innerText.replace(/\n$/, ''); this.placeTextBox(); });
    this.root.append(box);
    this.textEdit = { o, box, isNew: !existing, before: existing ? JSON.stringify(o) : null };
    this.styleTextBox();
    this.placeTextBox();
    this.paint();
    requestAnimationFrame(() => {
      box.focus();
      const r = document.createRange(); r.selectNodeContents(box); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  }
  styleTextBox() {
    const te = this.textEdit;
    if (!te) return;
    const o = te.o, st = this.textStyle(o), b = te.box;
    b.style.font = `700 ${o.size * this.k}px "${o.font}", Vazirmatn, sans-serif`;
    b.style.color = st.fg;
    b.style.background = st.bg || 'transparent';
    b.style.textShadow = st.shadow ? `0 0 ${o.size * this.k * 0.18}px ${st.shadow}` : 'none';
    b.style.borderRadius = o.size * this.k * 0.32 + 'px';
    b.style.padding = `${o.size * this.k * 0.23}px ${o.size * this.k * 0.38}px`;
    b.style.lineHeight = '1.4';
    this.placeTextBox();
    this.paint();
  }
  placeTextBox() {
    const te = this.textEdit;
    if (!te) return;
    const r = this.cv.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    const [sx, sy] = this.toScreen(te.o.x, te.o.y);
    te.box.style.left = r.left - rr.left + sx + 'px';
    te.box.style.top = r.top - rr.top + sy + 'px';
  }
  endText() {
    const te = this.textEdit;
    if (!te) return;
    this.textEdit = null;
    const o = te.o;
    o.text = te.box.innerText.replace(/\n+$/, '');
    delete o._editing;
    te.box.remove();
    if (!o.text.trim()) { this.objs = this.objs.filter((x) => x !== o); this.sel = null; }
    else this.sel = o;
    this.commit();
  }

  // ---------- keys, cancel, save ----------
  onKey(e) {
    if (document.querySelector('.overlay')) return; // a dialog above the editor handles its own keys
    const inPop = this.pop && this.pop.contains(e.target);
    const ctrl = e.ctrlKey || e.metaKey;
    if (inPop) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.closePop(); }
      else if (ctrl) e.stopImmediatePropagation();
      return;
    }
    if (this.textEdit) {
      e.stopImmediatePropagation();
      if (e.key === 'Escape' || (ctrl && e.key === 'Enter')) { e.preventDefault(); this.endText(); }
      return;
    }
    e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { e.preventDefault(); if (this.sel) { this.sel = null; this.paint(); } else this.cancel(); }
    else if (ctrl && e.key === 'Enter') { e.preventDefault(); this.save(); }
    else if (ctrl && (e.code === 'KeyZ') && !e.shiftKey) { e.preventDefault(); this.undo(); }
    else if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); this.redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.objs = this.objs.filter((o) => o !== this.sel); this.sel = null; this.commit(); }
    else if (e.key === 'Enter' && this.sel && this.sel.type === 'text') { e.preventDefault(); this.startText(null, this.sel); }
    else if (ctrl && k !== 'control') e.preventDefault(); // app shortcuts stay off while editing
  }
  async cancel() {
    if (this.textEdit) this.endText();
    if (this.hi > 0) {
      const r = await modal({
        title: 'تغییرات تصویر دور ریخته شود؟',
        text: `${fa(this.hi)} تغییر روی این تصویر هنوز ذخیره نشده.`,
        buttons: [{ label: 'بستن بدون ذخیره', value: 'discard', danger: true, aside: true }, { label: 'ادامه‌ی ویرایش', value: null, primary: true }],
      });
      if (r !== 'discard') return;
    }
    this.close(null);
  }
  async save() {
    if (this.textEdit) this.endText();
    if (this.hi === 0) { this.close(null); return; }
    const c = this.crop;
    const w = Math.max(1, Math.round(c.w)), h = Math.max(1, Math.round(c.h));
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const x = out.getContext('2d');
    const ext = (this.opts.ext || 'png').toLowerCase();
    const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    if (type === 'image/jpeg') { x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h); }
    x.setTransform(1, 0, 0, 1, -c.x, -c.y);
    this.renderScene(x, w, h, 1);
    const blob = await new Promise((r) => out.toBlob(r, type, 0.92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    this.close({ bytes, ext: type === 'image/png' && !['png'].includes(ext) ? 'png' : ext });
  }
  close(result) {
    window.removeEventListener('keydown', this.onKey, true);
    this.closePop();
    this.ro.disconnect();
    this.root.remove();
    this.resolve(result);
  }
}
