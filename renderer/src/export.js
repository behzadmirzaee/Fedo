// Export the current document as standalone HTML or PDF
import katex from 'katex';
import katexCSS from 'katex/dist/katex.min.css?inline';
import { dirOfText } from './editor.js';

const AUTO = 'p,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote,table,td,th,figcaption';

async function fontFaces() {
  // embed only the fonts this document actually uses, so the file looks the same anywhere
  const cs = getComputedStyle(document.documentElement);
  const used = (cs.getPropertyValue('--font-text') + ',' + cs.getPropertyValue('--font-head')).toLowerCase();
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const fam = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase();
      if (!used.includes(fam)) continue;
      const w = r.style.getPropertyValue('font-weight').trim();
      if (!/^(400|700|normal|bold)$/.test(w) && !/\s/.test(w)) continue;
      const m = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(r.style.getPropertyValue('src'));
      if (!m) continue;
      try {
        const url = new URL(m[1], sheet.href || location.href).href;
        const buf = await (await fetch(url)).arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const css = r.cssText.replace(/url\([^)]*\)\s*format\(["']?woff2["']?\)|url\([^)]*\)/, `url(data:font/woff2;base64,${btoa(bin)}) format("woff2")`);
        out.push(css.replace(/,\s*url\([^)]*\.woff[^2][^)]*\)[^;,]*/g, ''));
      } catch {}
    }
  }
  return out.join('\n');
}

function themeVars() {
  const cs = getComputedStyle(document.documentElement);
  const names = ['--bg', '--fg', '--muted', '--border', '--panel', '--code-bg', '--quote', '--link', '--accent', '--font-text', '--font-head', '--font-code', '--text-size', '--line-height', '--page-width'];
  return names.map((n) => `${n}: ${cs.getPropertyValue(n).trim()};`).join(' ');
}

const BASE_CSS = `
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font-text); font-size: var(--text-size); line-height: var(--line-height); }
article { max-width: var(--page-width); margin: 0 auto; padding: 48px 40px; }
[dir] { text-align: start; }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-head); line-height: 1.5; margin: 1.4em 0 0.5em; }
h1 { font-size: 2em; } h2 { font-size: 1.55em; } h3 { font-size: 1.3em; }
a { color: var(--link); }
img { max-width: 100%; }
blockquote { margin: 1em 0; padding-inline-start: 20px; border-inline-start: 4px solid var(--quote); color: var(--muted); }
code { font-family: var(--font-code); background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em; unicode-bidi: isolate; direction: ltr; }
pre { direction: ltr; text-align: left; background: var(--code-bg); padding: 14px 16px; border-radius: 8px; overflow: auto; }
pre code { background: none; padding: 0; }
pre[dir='rtl'] { direction: rtl; text-align: right; }
pre[dir='rtl'] code { direction: rtl; unicode-bidi: plaintext; }
pre.nv-text, pre.nv-wrap { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; overflow: visible; }
@media print { pre { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; overflow: visible; } }
table { border-collapse: collapse; margin: 1em 0; }
td, th { border: 1px solid var(--border); padding: 6px 12px; }
th { background: var(--panel); }
hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
li[data-checked] { list-style: none; }
.nv-color.has-bg { border-radius: 3px; padding-block: 1px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
li[data-checked]::before { content: '☐'; margin-inline-end: 6px; }
li[data-checked='true']::before { content: '☑'; }
.katex-display { direction: ltr; }
.mermaid svg { max-width: 100%; }
@media print { body { background: #fff; } article { padding: 0; } html.continuous article { padding: 40px 48px; max-width: none; } html.continuous body { margin: 0; } }
html.continuous article { max-width: none; padding: 40px 48px; }
html.continuous { overflow: hidden; }
`;

async function renderMermaidBlocks(doc) {
  const blocks = [...doc.querySelectorAll('pre[data-language="mermaid"], pre code.language-mermaid')].map((n) => n.closest('pre'));
  if (!blocks.length) return;
  const mermaid = (await import('mermaid')).default;
  let i = 0;
  for (const pre of blocks) {
    try {
      const { svg } = await mermaid.render('nv-exp-' + ++i, pre.textContent);
      const div = doc.createElement('div');
      div.className = 'mermaid';
      div.innerHTML = svg;
      pre.replaceWith(div);
    } catch {}
  }
}

function renderMath(doc) {
  doc.querySelectorAll('[data-type="math_inline"], [data-type="math_block"], span.math, div.math').forEach((n) => {
    const block = n.getAttribute('data-type') === 'math_block' || n.tagName === 'DIV';
    const tex = n.getAttribute('data-value') || n.textContent;
    try {
      const wrap = doc.createElement(block ? 'div' : 'span');
      wrap.innerHTML = katex.renderToString(tex, { displayMode: block, throwOnError: false });
      n.replaceWith(wrap);
    } catch {}
  });
  // math code blocks (```latex) are stored as code blocks in Crepe
  doc.querySelectorAll('pre[data-language="latex"], pre[data-language="LaTeX"]').forEach((pre) => {
    const div = doc.createElement('div');
    div.innerHTML = katex.renderToString(pre.textContent, { displayMode: true, throwOnError: false });
    pre.replaceWith(div);
  });
}

export async function exportDocument({ kind, layout, html, title, baseDir, docPath, directPath }) {
  const doc = new DOMParser().parseFromString(`<article>${html}</article>`, 'text/html');
  doc.querySelectorAll(AUTO).forEach((n) => {
    const c = n.cloneNode(true);
    c.querySelectorAll('code, pre').forEach((x) => x.remove());
    const d = dirOfText(c.textContent);
    if (d) n.setAttribute('dir', d);
  });
  // code blocks: real code stays LTR; plain-text blocks follow their text. Nothing scrolls on paper.
  doc.querySelectorAll('pre').forEach((n) => {
    const lang = (n.getAttribute('data-language') || '').toLowerCase();
    const plain = ['', 'text', 'txt', 'plain', 'plaintext'].includes(lang);
    const txt = n.textContent;
    const fa = (txt.match(/[\u0600-\u06FF]/g) || []).length, en = (txt.match(/[A-Za-z]/g) || []).length;
    n.setAttribute('dir', plain && fa > en ? 'rtl' : 'ltr');
    if (plain) n.classList.add('nv-text');
    if (kind === 'pdf') n.classList.add('nv-wrap');
  });
  renderMath(doc);
  await renderMermaidBlocks(doc);
  const fonts = await fontFaces();
  const page = `<!doctype html>
<html lang="fa" dir="${baseDir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title>
<style>${fonts}</style>
<style>${katexCSS.replace(/url\([^)]*\)\s*format\(["']?(woff|truetype)["']?\),?/g, '')}</style>
<style>:root { ${themeVars()} } ${BASE_CSS}</style>
</head>
<body>${doc.body.innerHTML}</body>
</html>`;
  const dir = docPath ? docPath.replace(/[\\/][^\\/]*$/, '') : null;
  if (kind === 'html') return window.api.exportHTML(page, (dir ? dir + '/' : '') + title + '.html', directPath);
  return window.api.exportPDF(page, (dir ? dir + '/' : '') + title + '.pdf', dir, layout, directPath);
}
