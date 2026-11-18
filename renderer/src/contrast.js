// Readable colours for the Monkeytype themes.
// Their colours were made for a typing test (e.g. «sub» is the dim, not-yet-typed text), so used as
// editor colours some pairs are too faint. Every pair the app actually draws is checked here against
// WCAG contrast and, when short, only the lightness of the foreground is nudged until it passes,
// so each theme keeps its own hue and character.

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (a) => '#' + a.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');

export const lum = (hex) => {
  const v = hexRgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
/** a pct% of colour a mixed into b, like CSS color-mix(in srgb, a pct%, b) */
export const mix = (a, pct, b) => {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A.map((x, i) => x * pct / 100 + B[i] * (1 - pct / 100)));
};
export const contrast = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** black or white, whichever reads better on c */
export const onColor = (c) => (contrast('#141414', c) >= contrast('#ffffff', c) ? '#141414' : '#ffffff');

/**
 * fg moved the least distance towards black or white (`pole`, else whichever helps more) so that
 * it reaches `min` against every colour in `bgs`. Returned unchanged when it already passes.
 */
export function ensure(fg, bgs, min, pole) {
  const worst = (c) => Math.min(...bgs.map((b) => contrast(c, b)));
  if (worst(fg) >= min) return fg;
  pole = pole || (worst('#000000') >= worst('#ffffff') ? '#000000' : '#ffffff');
  if (worst(pole) < min) return pole; // cannot pass: the strongest available
  let lo = 0, hi = 100;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (worst(mix(pole, mid, fg)) >= min) hi = mid; else lo = mid;
  }
  return mix(pole, hi, fg);
}

// syntax colours of the built-in light and dark themes, re-checked against each theme's code background
const HL_LIGHT = { keyword: '#cf222e', string: '#0a3069', number: '#0550ae', comment: '#6e7781', func: '#8250df', type: '#953800', prop: '#0550ae' };
const HL_DARK = { keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', comment: '#8b949e', func: '#d2a8ff', type: '#ffa657', prop: '#79c0ff' };

/** the app's colours for one Monkeytype theme, every text/background pair readable */
const FG_MIN = 5.5; // body text: comfortably above WCAG AA (4.5)
export function themePalette(t) {
  // light text on a dark page or dark text on a light one: every foreground moves the same way,
  // away from the page, so a theme with cream text keeps cream text
  let lightText = lum(t.text) >= lum(t.bg);
  let up = lightText ? '#ffffff' : '#000000', down = lightText ? '#000000' : '#ffffff';
  let fg = ensure(t.text, [t.bg], FG_MIN, up);
  let bg = t.bg;
  if (contrast(fg, bg) < FG_MIN) {
    // a mid-tone page that no shade of the text reaches: the page steps away a little, but if that
    // would change it too much (a bright yellow or pastel page) the text flips side instead
    const stepped = ensure(t.bg, [fg], FG_MIN, down);
    if (contrast(stepped, t.bg) <= 1.3) bg = stepped;
    else { lightText = !lightText; [up, down] = [down, up]; }
    fg = ensure(t.text, [bg], FG_MIN, up);
  }
  const ens = (c, bgs, min) => ensure(c, bgs, min, up);
  // panels and code blocks use subAlt when the text stays readable on it, else a tint of the page
  let panel = t.subAlt;
  if (contrast(fg, panel) < 4.5 || contrast(panel, bg) < 1.04) panel = mix(fg, 7, bg);
  if (contrast(fg, panel) < 4.5) panel = mix(fg, 4, bg);
  const muted = ens(ens(mix(t.sub, 70, t.text), [bg], 4.5), [panel], 3);
  let accent = ens(ens(t.main, [bg], 4.5), [panel], 3);
  // the colour of text on accent buttons; a hair of extra contrast for the few accents just short of it
  const accentFg = onColor(accent);
  if (contrast(accentFg, accent) < 4.5) accent = ensure(accent, [accentFg], 4.5);
  const link = accent;
  const danger = ens(t.error, [bg, panel], 4.5);
  const quote = ens(t.sub, [bg], 2);
  // selection tint: as strong as possible while the text on it stays readable
  let selection = mix(accent, 30, bg);
  for (const pct of [24, 18, 12, 8, 5, 3]) {
    if (contrast(fg, selection) >= 4.5) break;
    selection = mix(accent, pct, bg);
  }
  const hl = Object.fromEntries(Object.entries(lightText ? HL_DARK : HL_LIGHT).map(([k, c]) => [k, ens(c, [panel], 4.5)]));
  return {
    dark: lightText, bg, fg, muted, panel, accent, link, danger, quote, selection, hl, accentFg,
    border: mix(fg, 14, bg), panel2: mix(fg, 8, bg), hover: mix(fg, 10, bg),
  };
}
