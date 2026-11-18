// The empty-line placeholder follows the current keyboard language: Persian text from the right with a
// Persian keyboard, English text from the left with an English one. So a bilingual writer sees which
// layout is on before typing the first word. Sets `kbd-fa` / `kbd-en` on <html>; style.css does the rest.
//
// Where the language comes from:
// - on Windows, the main process hears every switch (Alt+Shift, Win+Space, the taskbar button) from
//   Windows itself and sends it here (`onKbdLang`);
// - at start on Windows, the main process asks Windows for the window's layout; elsewhere, the layout
//   Chromium reports (on macOS asked again every second, since macOS sends nothing on a switch);
// - a typed letter, which tells the language for certain.

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

function setLang(lang) {
  const root = document.documentElement;
  if (!lang || root.classList.contains('kbd-' + lang)) return;
  root.classList.toggle('kbd-fa', lang === 'fa');
  root.classList.toggle('kbd-en', lang === 'en');
}

export function installKeyboardLang(api) {
  let heard = false; // once Windows has told us, the start-up guess must not overwrite it
  if (api && api.onKbdLang) api.onKbdLang((lang) => { heard = true; setLang(lang); });
  // on Windows Chromium's answer is the layout the app started with, not the one in use: Windows itself
  // tells us (see electron/main.js), so it is asked only elsewhere
  if (!/Windows/.test(navigator.userAgent) && navigator.keyboard && navigator.keyboard.getLayoutMap) {
    const ask = () => navigator.keyboard.getLayoutMap().then((map) => {
      if (heard) return;
      const k = map.get('KeyA') || '';
      setLang(RTL.test(k) ? 'fa' : LATIN.test(k) ? 'en' : null);
    }).catch(() => {});
    ask();
    // macOS tells the page nothing when the input source changes (⌃Space, the 🌐 key, the menu bar):
    // ask again when the window comes forward, and every second while it is in front
    if (/Mac/.test(navigator.platform || navigator.userAgent)) {
      window.addEventListener('focus', ask);
      setInterval(() => { if (document.hasFocus()) ask(); }, 1000);
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (RTL.test(e.key)) setLang('fa'); else if (LATIN.test(e.key)) setLang('en');
    }
  }, true);
}
