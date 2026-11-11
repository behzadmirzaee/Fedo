import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/noto-naskh-arabic/400.css';
import '@fontsource/noto-naskh-arabic/700.css';
import '@milkdown/crepe/theme/common/style.css';
import './themes.css';
import './style.css';

import vazAr400 from '@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2?url';
import vazAr700 from '@fontsource/vazirmatn/files/vazirmatn-arabic-700-normal.woff2?url';

// Monospace fonts draw Persian letters disconnected. "NvArabic" covers only Persian/Arabic
// characters and sits first in the code font stack, so code stays monospace and Persian stays readable.
const AR_RANGE = 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F';
for (const [url, weight] of [[vazAr400, '400'], [vazAr700, '700']]) {
  const f = new FontFace('NvArabic', `url(${url})`, { weight, unicodeRange: AR_RANGE });
  document.fonts.add(f);
  f.load().catch(() => {});
}

// Optional licensed fonts: any of these files placed in renderer/fonts/ is bundled and offered in the
// font picker. They are not part of the public repository, so the app must work without them.
const OPTIONAL_FONTS = { DanaVF: 'Dana', IRANSansXVF: 'IRANSansX', IRANYekanXVF: 'IRANYekanX' };
const localFonts = import.meta.glob('../fonts/*.woff2', { eager: true, query: '?url', import: 'default' });
window.__nvFonts = [];
for (const [path, url] of Object.entries(localFonts)) {
  const family = OPTIONAL_FONTS[path.split('/').pop().replace(/\.woff2$/, '')];
  if (!family) continue;
  const f = new FontFace(family, `url(${url})`, { weight: '100 900', display: 'swap' });
  document.fonts.add(f);
  f.load().catch(() => {});
  window.__nvFonts.push(family);
}

async function boot() {
  if (!window.api) {
    // running in a plain browser (development / tests): use an in-memory backend
    const { installShim } = await import('./shim.js');
    installShim();
  }
  const { start } = await import('./app.js');
  await start();
  window.__nvReady = true;
}
boot();
