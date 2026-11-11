import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/noto-naskh-arabic/400.css';
import '@fontsource/noto-naskh-arabic/700.css';
import './fonts.css';
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
