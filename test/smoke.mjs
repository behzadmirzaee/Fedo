// Fedo smoke test: starts the app, tries the basics and takes screenshots of every main screen.
// Runs on the macOS machines of GitHub Actions (see .github/workflows/mac.yml), so the Mac build can be
// checked without owning a Mac. Also runs on Windows / Linux from source: `node test/smoke.mjs`.
//
//   FEDO_EXE=path/to/Fedo.app/Contents/MacOS/Fedo   test a packaged app (default: run from source)
//   SHOTS=folder                                     where the screenshots go (default: shots)
//
// Exit code 1 if any check fails or the page logs an error.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SHOTS = path.resolve(process.env.SHOTS || 'shots');
const EXE = process.env.FEDO_EXE || null;
const MAC = process.platform === 'darwin';
const MOD = MAC ? 'Meta' : 'Control';
fs.mkdirSync(SHOTS, { recursive: true });

const userData = MAC ? path.join(os.homedir(), 'Library', 'Application Support', 'Fedo')
  : process.platform === 'win32' ? path.join(process.env.APPDATA, 'Fedo') : path.join(os.homedir(), '.config', 'Fedo');

const results = [];
const errors = [];
function check(name, ok, info = '') {
  info = String(info).replace(/\s+/g, ' ').trim().slice(0, 120);
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`);
}
const step = async (name, fn) => {
  try { await fn(); } catch (e) { check(name, false, e.message.split('\n')[0]); }
};

async function launch(args = []) {
  const app = await electron.launch(EXE ? { executablePath: EXE, args } : { args: ['.', ...args] });
  const win = await app.firstWindow();
  win.on('pageerror', (e) => errors.push('page error: ' + e.message));
  win.on('console', (m) => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await win.waitForSelector('#topbar', { timeout: 30000 });
  await win.waitForTimeout(1500);
  return { app, win };
}
const shot = (win, name) => win.screenshot({ path: path.join(SHOTS, name + '.png') });
const editorText = (win) => win.evaluate(() => {
  const all = [...document.querySelectorAll('.milkdown .ProseMirror')].filter((n) => n.offsetParent);
  return all.length ? all[all.length - 1].innerText : '';
});
const focusEditor = async (win) => {
  const eds = win.locator('.milkdown .ProseMirror:visible');
  await eds.last().click({ position: { x: 40, y: 20 } });
};
const pageHasCtrl = (win) => win.evaluate(() => {
  const texts = [document.body.innerText, ...[...document.querySelectorAll('[title],[aria-label],[placeholder]')]
    .map((n) => [n.title, n.getAttribute('aria-label'), n.getAttribute('placeholder')].join(' '))];
  return texts.some((t) => /\bCtrl\b/.test(t || ''));
});

// =====================================================================
// run 1: a fresh install
// =====================================================================
fs.rmSync(userData, { recursive: true, force: true });
{
  const { app, win } = await launch();

  await step('first-run icon picker', async () => {
    await win.waitForSelector('.overlay', { timeout: 5000 });
    await shot(win, '01-first-run-icon-picker');
    await win.getByRole('button', { name: 'شروع' }).click();
    await win.waitForTimeout(400);
    check('first-run icon picker', true);
  });

  await step('window layout', async () => {
    const info = await win.evaluate(() => ({
      mac: document.documentElement.classList.contains('mac'),
      pad: getComputedStyle(document.querySelector('#topbar')).paddingLeft,
    }));
    if (MAC) {
      check('page knows it is on a Mac', info.mac);
      check('top bar leaves room for ● ● ●', info.pad === '84px', info.pad);
    }
    const menu = await app.evaluate(({ Menu }) => {
      const m = Menu.getApplicationMenu();
      return m ? m.items.map((i) => i.role || i.label) : null;
    });
    if (MAC) check('macOS menu bar exists (⌘C, ⌘V, ⌘Q need it)', menu && menu.length >= 3, JSON.stringify(menu));
    await shot(win, '02-empty-window');
  });

  await step('typing Persian and English', async () => {
    // the first start shows the welcome document: write in a new tab
    await win.keyboard.press(`${MOD}+t`);
    await win.waitForTimeout(800);
    await focusEditor(win);
    await win.keyboard.insertText('سلام دنیا. این یک آزمایش است.');
    await win.keyboard.press('Enter');
    await win.keyboard.type('Hello from the smoke test');
    await win.waitForTimeout(300);
    const t = await editorText(win);
    check('typing Persian and English', t.includes('سلام دنیا') && t.includes('Hello from the smoke test'), t.slice(0, 80));
    const dirs = await win.evaluate(() => [...document.querySelectorAll('.milkdown .ProseMirror:not([hidden]) p')].filter((p) => p.offsetParent).map((p) => getComputedStyle(p).direction + ':' + p.innerText.slice(0, 6)));
    check('Persian line right to left, English line left to right', dirs.some((d) => d.startsWith('rtl:سلام')) && dirs.some((d) => d.startsWith('ltr:Hello')), dirs.join(' | '));
    await shot(win, '03-typing');
  });

  await step('undo', async () => {
    await win.keyboard.type(' WORDTOUNDO');
    await win.waitForTimeout(600);
    await win.keyboard.press(`${MOD}+z`);
    await win.waitForTimeout(300);
    const t = await editorText(win);
    check('undo (⌘Z / Ctrl+Z)', !t.includes('WORDTOUNDO') && t.includes('Hello'), t.slice(-40));
  });

  await step('copy', async () => {
    await app.evaluate(({ clipboard }) => clipboard.writeText(''));
    await win.keyboard.press(`${MOD}+a`);
    await win.keyboard.press(`${MOD}+c`);
    await win.waitForTimeout(400);
    const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
    check('copy (⌘C / Ctrl+C)', clip.includes('سلام دنیا') && clip.includes('Hello'), clip.slice(0, 60));
  });

  await step('paste into a new tab', async () => {
    await win.keyboard.press(`${MOD}+t`);
    await win.waitForTimeout(800);
    await focusEditor(win);
    await win.keyboard.press(`${MOD}+v`);
    await win.waitForTimeout(500);
    const t = await editorText(win);
    check('new tab + paste (⌘T, ⌘V)', t.includes('سلام دنیا') && t.includes('Hello'), t.slice(0, 60));
    await shot(win, '04-pasted-in-new-tab');
  });

  await step('paste into a text field', async () => {
    await win.keyboard.press(`${MOD}+f`);
    await win.waitForSelector('#find-q', { state: 'visible', timeout: 3000 });
    await win.locator('#find-q').click();
    await app.evaluate(({ clipboard }) => clipboard.writeText('آزمون'));
    await win.keyboard.press(`${MOD}+v`);
    await win.waitForTimeout(300);
    const v = await win.locator('#find-q').inputValue();
    check('paste in a field (search box)', v === 'آزمون', v);
    await shot(win, '05-find');
    await win.keyboard.press('Escape');
  });

  if (MAC) await step('⌥⌘F opens replace', async () => {
    await focusEditor(win);
    await win.keyboard.press('Meta+Alt+f');
    await win.waitForTimeout(400);
    const vis = await win.locator('#find-r').isVisible();
    check('⌥⌘F opens find & replace', vis);
    await shot(win, '06-replace');
    await win.keyboard.press('Escape');
  });

  await step('main menu', async () => {
    await win.locator('#btn-menu').click();
    await win.waitForTimeout(400);
    await shot(win, '07-main-menu');
    if (MAC) {
      const keys = await win.evaluate(() => [...document.querySelectorAll('.menu .kb')].map((k) => k.innerText.replace(/\s+/g, '')));
      check('menu shortcuts shown the Mac way', keys.length > 0 && keys.every((k) => !/Ctrl|Alt/.test(k)), keys.slice(0, 8).join(' '));
    }
    await win.keyboard.press('Escape');
  });

  await step('settings', async () => {
    await win.keyboard.press(`${MOD}+Comma`);
    await win.waitForTimeout(800);
    await shot(win, '08-settings');
    await win.locator('.set-nav').getByText('میان‌برها').click();
    await win.waitForTimeout(400);
    await shot(win, '09-settings-shortcuts');
    if (MAC) check('no «Ctrl» left anywhere in Settings', !(await pageHasCtrl(win)));
    await win.locator('.set-nav').getByText('آیکن برنامه').click();
    await win.waitForTimeout(300);
    await shot(win, '10-settings-icon');
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);
  });

  await step('save window', async () => {
    await focusEditor(win);
    await win.keyboard.press(`${MOD}+s`);
    await win.waitForTimeout(800);
    await shot(win, '11-save');
    const quick = await win.evaluate(() => document.body.innerText.includes('Desktop') && document.body.innerText.includes('Documents'));
    check('save window shows Desktop and Documents', quick);
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);
  });

  await step('right-click on the top bar', async () => {
    const box = await win.locator('#topbar .grow').boundingBox();
    await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await win.waitForTimeout(400);
    const open = await win.locator('.menu').count();
    check('right-click on empty top bar opens Fedo menu', open > 0);
    await shot(win, '12-topbar-right-click');
    await win.keyboard.press('Escape');
  });

  if (MAC) await step('full screen', async () => {
    await focusEditor(win);
    await win.keyboard.press('Control+Meta+f');
    await win.waitForTimeout(2500);
    const fs1 = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
    check('⌃⌘F enters full screen', fs1);
    await shot(win, '13-full-screen');
    await win.keyboard.press('Control+Meta+f');
    await win.waitForTimeout(2500);
  });

  if (MAC) await step('Dock behaviour', async () => {
    // close every window the way a user would: the app must stay alive, then come back from the Dock
    await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.close(); });
    await win.waitForTimeout(800).catch(() => {});
    // unsaved tabs ask first: answer «ذخیره نکن» in every window that asks
    for (const w of app.windows()) {
      const b = w.getByRole('button', { name: /ذخیره نکن|بستن بدون ذخیره/ });
      if (await b.count().catch(() => 0)) await b.first().click().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1500));
    const n = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    check('closing the last window keeps Fedo in the Dock', n === 0, `${n} windows`);
    const back = app.waitForEvent('window', { timeout: 10000 });
    await app.evaluate(({ app }) => app.emit('activate'));
    const w2 = await back;
    await w2.waitForSelector('#topbar', { timeout: 15000 });
    await w2.waitForTimeout(1200);
    check('clicking the Dock icon brings a window back', true);
    await shot(w2, '14-back-from-dock');
  });

  // quit without the «save changes?» questions
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
}

// =====================================================================
// run 2: vertical tabs, dark theme, a file whose Persian name macOS stores decomposed
// =====================================================================
fs.rmSync(userData, { recursive: true, force: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ logoChosen: true, memeLogosOffered: true, verticalTabs: true, theme: 'dark' }));
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fedo-'));
  const file = path.join(dir, 'آزمون آینده.md'.normalize('NFD'));
  fs.writeFileSync(file, '# آزمون آینده\n\nاین فایل با نام فارسی باز شده است.\n\n- مورد اول\n- مورد دوم\n\n```js\nconsole.log("hi");\n```\n');
  const { app, win } = await launch([file]);
  await step('file from the command line', async () => {
    await win.waitForTimeout(800);
    const t = await editorText(win);
    check('file with a Persian name opens', t.includes('این فایل با نام فارسی'), t.slice(0, 50));
    await shot(win, '20-vertical-tabs-dark');
  });
  await step('vertical tabs', async () => {
    const on = await win.evaluate(() => getComputedStyle(document.querySelector('#vtabs')).display !== 'none');
    check('vertical tabs on the left', on);
  });
  // quit without the «save changes?» questions
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
}

// =====================================================================
const bad = results.filter((r) => !r.ok);
const report = [
  `# Fedo smoke test · ${process.platform} ${process.arch}`, '',
  ...results.map((r) => `- ${r.ok ? '✅' : '❌'} ${r.name}${r.info ? ` · \`${r.info.replace(/`/g, "'")}\`` : ''}`),
  '', errors.length ? `## Errors in the page (${errors.length})\n\n` + errors.map((e) => '- `' + e.replace(/`/g, "'").slice(0, 300) + '`').join('\n') : 'No errors in the page.',
].join('\n');
fs.writeFileSync(path.join(SHOTS, 'report.md'), report + '\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
console.log('\n' + report);
process.exit(bad.length || errors.length ? 1 : 0);
