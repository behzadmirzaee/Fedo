// UI language: Persian (default, source of truth) and English.
//
// - Keys are dot-namespaced by area: menu.file.newTab, settings.ai.provider, toast.saved
// - A key missing from the active language falls back to Persian, then to the key itself
// - Placeholders are named, never concatenated: t('ai.working.rewrite', { name })
// - Keyboard shortcuts never go inside strings (they are drawn as key chips)
// - English terms follow docs/i18n-glossary.md
import fa from './i18n/fa.js';
import en from './i18n/en.js';

export const DEFAULT_LANG = 'fa';
/** UI languages; `name` is the language's own name (shown as-is in the language selector) */
export const UI_LANGS = Object.freeze({
  fa: Object.freeze({ name: 'فارسی', dir: 'rtl', locale: 'fa-IR', dict: Object.freeze(fa) }),
  en: Object.freeze({ name: 'English', dir: 'ltr', locale: 'en-US', dict: Object.freeze(en) }),
});

let current = DEFAULT_LANG;
const warned = new Set();
const DEV = !!import.meta.env?.DEV;

export const getLang = () => current;
export const langDir = (lang = current) => (UI_LANGS[lang] || UI_LANGS[DEFAULT_LANG]).dir;
export const langLocale = (lang = current) => (UI_LANGS[lang] || UI_LANGS[DEFAULT_LANG]).locale;

/** Set the UI language and mirror it on <html lang dir>. Unknown values fall back to Persian. */
export function setLang(lang) {
  current = Object.hasOwn(UI_LANGS, lang) ? lang : DEFAULT_LANG;
  const root = globalThis.document?.documentElement;
  if (root) {
    root.lang = current;
    root.dir = UI_LANGS[current].dir;
  }
  return current;
}

/** The UI string for `key` in the current language, with {placeholders} filled from `vars`. */
export function t(key, vars) {
  const own = UI_LANGS[current].dict;
  let str;
  if (Object.hasOwn(own, key)) str = own[key];
  else if (Object.hasOwn(fa, key)) str = fa[key];
  else {
    if (DEV && !warned.has(key)) { warned.add(key); console.warn(`[i18n] missing key: ${key}`); }
    return key;
  }
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) && vars[k] != null ? String(vars[k]) : m));
}
