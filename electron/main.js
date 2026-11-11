// Fedo: main process
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

const isDev = !!process.env.VITE_DEV_URL;

// The app used to be called Neveshtar: carry its settings, history and drafts over once.
app.setName('Fedo');
try {
  const newDir = path.join(app.getPath('appData'), 'Fedo');
  const oldDir = path.join(app.getPath('appData'), 'Neveshtar');
  const explicit = process.argv.some((a) => a.startsWith('--user-data-dir'));
  if (!explicit) {
    app.setPath('userData', newDir);
    if (fs.existsSync(oldDir) && !fs.existsSync(path.join(newDir, 'settings.json'))) {
      fs.mkdirSync(newDir, { recursive: true });
      for (const f of ['settings.json', 'session.json', 'history', 'drafts', 'themes', 'images']) {
        const src = path.join(oldDir, f);
        if (fs.existsSync(src)) fs.cpSync(src, path.join(newDir, f), { recursive: true });
      }
    }
  }
} catch {}
const LOGOS_DIR = path.join(__dirname, '..', 'build', 'logos');
const logoPath = (id) => {
  const p = path.join(LOGOS_DIR, `${String(id || '08').replace(/[^\w-]/g, '')}.png`);
  return fs.existsSync(p) ? p : path.join(__dirname, '..', 'build', 'icon.png');
};
// ---------- windows ----------
// Every window is a full Fedo window (its own tabs). One of them is the "main" window: it gets
// files opened from Windows and is the one whose tabs are restored next time.
const windows = new Map(); // id -> { win, ready, pending, payload, role, forceClose }
let mainId = null;
let lastFocusedId = null;
const W = (e) => BrowserWindow.fromWebContents(e.sender);
const stateOf = (w) => (w ? windows.get(w.id) : null);
function targetWindow() {
  const pick = windows.get(lastFocusedId) || windows.get(mainId) || [...windows.values()][0];
  return pick ? pick.win : null;
}

// ---------- single instance: every file opens as a tab in an existing window ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    const files = filesFromArgv(argv, cwd);
    const w = targetWindow();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
      files.forEach((f) => sendOpen(f, w));
    }
  });
}

function filesFromArgv(argv, cwd = process.cwd()) {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((a) => !a.startsWith('-'))
    .map((a) => path.resolve(cwd, a))
    .filter((p) => {
      try { return fs.statSync(p).isFile(); } catch { return false; }
    });
}

// ---------- paths ----------
const userDir = () => app.getPath('userData');
const historyRoot = () => path.join(userDir(), 'history');
const themesDir = () => path.join(userDir(), 'themes');
const settingsFile = () => path.join(userDir(), 'settings.json');
const sessionFile = () => path.join(userDir(), 'session.json');
const keyFor = (p) => crypto.createHash('sha1').update(path.resolve(p).toLowerCase()).digest('hex').slice(0, 16);

async function readJSON(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJSON(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.' + Math.random().toString(36).slice(2, 7) + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

// ---------- window ----------
const TITLEBAR_H = 52;
/** opts: { payload, alwaysOnTop, x, y, width, height } */
function createWindow(opts = {}) {
  const role = mainId == null ? 'main' : 'extra';
  const win = new BrowserWindow({
    width: opts.width || (role === 'main' ? 1280 : 900),
    height: opts.height || (role === 'main' ? 820 : 680),
    x: opts.x, y: opts.y,
    minWidth: 420,
    minHeight: 320,
    title: 'Fedo',
    backgroundColor: '#ECECF0',
    autoHideMenuBar: true,
    // Windows: no native title bar. The app's top bar is the title bar, and Windows draws its own
    // caption buttons (− □ ✕, with snap layouts) over its right end.
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#ECECF0', symbolColor: '#1D1D1F', height: TITLEBAR_H } } : {}),
    alwaysOnTop: !!opts.alwaysOnTop,
    icon: logoPath(readLogoSync()),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  const st = { win, ready: false, pending: [], payload: opts.payload || null, role, forceClose: false };
  windows.set(win.id, st);
  if (role === 'main') mainId = win.id;
  lastFocusedId = win.id;
  win.on('focus', () => { lastFocusedId = win.id; });
  if (opts.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');

  Menu.setApplicationMenu(null);
  const ses = win.webContents.session;
  ses.setSpellCheckerLanguages(['en-US']);
  ses.setSpellCheckerEnabled(false);
  // allow reading the list of installed fonts (font picker) and the clipboard
  const ALLOWED = new Set(['local-fonts', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => ALLOWED.has(perm));

  if (isDev) win.loadURL(process.env.VITE_DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // links open in the browser, never in a new app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.on('found-in-page', (_e, r) => win.webContents.send('found', { active: r.activeMatchOrdinal, total: r.matches }));

  win.on('close', (e) => {
    if (st.forceClose) return;
    e.preventDefault();
    win.webContents.send('request-close');
  });
  win.on('closed', () => {
    windows.delete(win.id);
    if (mainId === win.id) {
      // another window takes over as the main one
      const next = [...windows.values()][0];
      mainId = next ? next.win.id : null;
      if (next) { next.role = 'main'; next.win.webContents.send('set-role', 'main'); }
    }
    if (lastFocusedId === win.id) lastFocusedId = mainId;
  });
  win.webContents.on('did-start-loading', () => { st.ready = false; });
  return win;
}

// files are queued until the renderer says it is ready, so none get lost at startup
let startupTaken = false;
function sendOpen(p, w = targetWindow()) {
  if (!w) { pendingFirst.push(p); return; }
  const st = stateOf(w);
  if (st && st.ready) w.webContents.send('open-path', p);
  else if (st) st.pending.push(p);
}
const pendingFirst = [];
ipcMain.handle('app:ready', (e) => {
  const w = W(e);
  const st = stateOf(w);
  if (!st) return { files: [], role: 'main' };
  st.ready = true;
  let files = [];
  if (st.role === 'main' && !startupTaken) { files = [...filesFromArgv(process.argv), ...pendingFirst.splice(0)]; startupTaken = true; }
  files.push(...st.pending.splice(0));
  const payload = st.payload; st.payload = null;
  return { files, role: st.role, payload, alwaysOnTop: w.isAlwaysOnTop() };
});

// macOS "open with"
app.on('open-file', (e, p) => {
  e.preventDefault();
  sendOpen(p);
});

app.whenReady().then(async () => {
  await fsp.mkdir(themesDir(), { recursive: true });
  require('./updater');
  createWindow();
});
app.on('window-all-closed', () => app.quit());

// ---------- IPC: windows ----------
ipcMain.handle('win:close-now', (e) => { const w = W(e); const st = stateOf(w); if (st) st.forceClose = true; w && w.close(); });
function readLogoSync() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).logo || '08'; } catch { return '08'; }
}
ipcMain.handle('app:set-spellcheck', (e, on) => { const w = W(e); if (w) w.webContents.session.setSpellCheckerEnabled(!!on); });
ipcMain.handle('app:set-logo', (_e, id) => {
  const { nativeImage } = require('electron');
  const img = nativeImage.createFromPath(logoPath(id));
  for (const st of windows.values()) st.win.setIcon(img);
});
ipcMain.handle('win:set-titlebar', (e, o) => {
  const w = W(e);
  if (!w || process.platform !== 'win32' || !o) return;
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null);
  const color = hex(o.color), symbolColor = hex(o.symbolColor);
  if (!color || !symbolColor) return;
  try { w.setTitleBarOverlay({ color, symbolColor, height: TITLEBAR_H }); w.setBackgroundColor(color); } catch { /* window without an overlay */ }
});
ipcMain.handle('win:set-title', (e, t) => { const w = W(e); if (w) w.setTitle(t); });
ipcMain.handle('win:devtools', (e) => { const w = W(e); w && w.webContents.toggleDevTools(); });
ipcMain.handle('win:fullscreen', (e) => { const w = W(e); w && w.setFullScreen(!w.isFullScreen()); });
ipcMain.handle('win:find', (e, text, opts) => { const w = W(e); if (w && text) w.webContents.findInPage(text, opts || {}); });
ipcMain.handle('win:edit', (e, op) => {
  const w = W(e);
  if (!w) return;
  const wc = w.webContents;
  ({ cut: () => wc.cut(), copy: () => wc.copy(), paste: () => wc.paste(), pastePlain: () => wc.pasteAndMatchStyle() })[op]?.();
});
ipcMain.handle('win:new', () => { createWindow(); });
// move a tab into its own window (optionally always on top), placed where the tab was dropped
ipcMain.handle('win:detach', (e, payload, opts = {}) => {
  const src = W(e);
  const { screen } = require('electron');
  const pt = opts.x != null ? { x: Math.round(opts.x), y: Math.round(opts.y) } : screen.getCursorScreenPoint();
  const width = opts.alwaysOnTop ? 640 : 900;
  const height = opts.alwaysOnTop ? 520 : 680;
  const area = screen.getDisplayNearestPoint(pt).workArea;
  const x = Math.min(Math.max(area.x, pt.x - Math.round(width / 2)), area.x + area.width - width);
  const y = Math.min(Math.max(area.y, pt.y - 20), area.y + area.height - height);
  createWindow({ payload, alwaysOnTop: !!opts.alwaysOnTop, x, y, width, height });
  return true;
});
// send a tab back to the main window
ipcMain.handle('win:to-main', (e, payload) => {
  const main = windows.get(mainId);
  const src = W(e);
  if (!main || (src && main.win.id === src.id)) return false;
  main.win.webContents.send('receive-tab', payload);
  main.win.focus();
  return true;
});
ipcMain.handle('win:set-on-top', (e, on) => { const w = W(e); if (!w) return false; w.setAlwaysOnTop(!!on, 'floating'); return w.isAlwaysOnTop(); });
ipcMain.handle('win:info', (e) => { const w = W(e); const st = stateOf(w); return { role: st ? st.role : 'main', alwaysOnTop: w ? w.isAlwaysOnTop() : false, count: windows.size }; });
ipcMain.handle('file:pick-image', async (e, docPath) => {
  const r = await dialog.showOpenDialog(W(e), { properties: ['openFile'], filters: [{ name: 'تصویر', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }] });
  if (r.canceled) return null;
  const src = r.filePaths[0];
  if (!docPath) return { absolute: src };
  const docDir = path.dirname(docPath);
  const rel = path.relative(docDir, src);
  // images already near the document are referenced in place; others are copied into ./assets
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return { relative: rel.split(path.sep).join('/') };
  const dir = path.join(docDir, 'assets');
  await fsp.mkdir(dir, { recursive: true });
  let name = path.basename(src);
  if (fs.existsSync(path.join(dir, name))) name = `${path.basename(name, path.extname(name))}-${Date.now()}${path.extname(name)}`;
  await fsp.copyFile(src, path.join(dir, name));
  return { relative: `assets/${name}` };
});
ipcMain.handle('win:stop-find', (e) => { const w = W(e); w && w.webContents.stopFindInPage('keepSelection'); });
ipcMain.handle('win:zoom', (e, delta) => {
  const w = W(e);
  if (!w) return;
  const wc = w.webContents;
  wc.setZoomLevel(delta === 0 ? 0 : wc.getZoomLevel() + delta);
});

// ---------- IPC: files ----------
const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
  { name: 'همه‌ی فایل‌ها', extensions: ['*'] },
];

ipcMain.handle('file:open-dialog', async (e) => {
  const r = await dialog.showOpenDialog(W(e), { properties: ['openFile', 'multiSelections'], filters: MD_FILTERS });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('file:open-folder-dialog', async (e) => {
  const r = await dialog.showOpenDialog(W(e), { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('file:save-dialog', async (e, suggested) => {
  const r = await dialog.showSaveDialog(W(e), { defaultPath: suggested || 'بدون عنوان.md', filters: MD_FILTERS });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('file:read', async (_e, p) => {
  const content = await fsp.readFile(p, 'utf8');
  const st = await fsp.stat(p);
  return { content, mtime: st.mtimeMs };
});
ipcMain.handle('file:write', async (_e, p, content) => {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content, 'utf8');
  const st = await fsp.stat(p);
  return { mtime: st.mtimeMs };
});
ipcMain.handle('file:stat', async (_e, p) => {
  try { const st = await fsp.stat(p); return { mtime: st.mtimeMs, exists: true }; } catch { return { exists: false }; }
});
ipcMain.handle('shell:open-url', (_e, url) => { if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url); });
// drafts of untitled documents, so nothing is lost if the app closes unexpectedly
const draftsDir = () => path.join(userDir(), 'drafts');
ipcMain.handle('drafts:save', async (_e, id, content) => {
  await fsp.mkdir(draftsDir(), { recursive: true });
  await fsp.writeFile(path.join(draftsDir(), id.replace(/[^\w-]/g, '') + '.md'), content, 'utf8');
});
ipcMain.handle('drafts:delete', (_e, id) => fsp.unlink(path.join(draftsDir(), id.replace(/[^\w-]/g, '') + '.md')).catch(() => {}));
ipcMain.handle('drafts:list', async () => {
  const out = [];
  try {
    for (const f of await fsp.readdir(draftsDir())) {
      if (!f.endsWith('.md')) continue;
      const p = path.join(draftsDir(), f);
      out.push({ id: f.slice(0, -3), content: await fsp.readFile(p, 'utf8'), mtime: (await fsp.stat(p)).mtimeMs });
    }
  } catch {}
  return out.sort((a, b) => a.mtime - b.mtime);
});
ipcMain.handle('file:reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('file:open-external', (_e, p) => shell.openPath(p));

// pasted / dropped images are saved next to the document in ./assets
ipcMain.handle('file:save-image', async (_e, docPath, name, bytes) => {
  const ext = (path.extname(name) || '.png').toLowerCase();
  const base = path.basename(name, path.extname(name)).replace(/[^\w؀-ۿ-]+/g, '-').slice(0, 40) || 'image';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${base}-${stamp}${ext}`;
  if (docPath) {
    const dir = path.join(path.dirname(docPath), 'assets');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, fileName), Buffer.from(bytes));
    return { relative: `assets/${fileName}` };
  }
  const dir = path.join(userDir(), 'images');
  await fsp.mkdir(dir, { recursive: true });
  const abs = path.join(dir, fileName);
  await fsp.writeFile(abs, Buffer.from(bytes));
  return { absolute: abs };
});

// folder tree (markdown files only, sensible depth)
const SKIP = new Set(['node_modules', '.git', '.svn', '.hg', '.idea', '.vscode', '__pycache__']);
async function walk(dir, depth) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth <= 0) continue;
      const children = await walk(full, depth - 1);
      if (children.length) out.push({ type: 'dir', name: e.name, path: full, children });
    } else if (/\.(md|markdown|mdown|mkd|txt)$/i.test(e.name)) {
      out.push({ type: 'file', name: e.name, path: full });
    }
  }
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'fa') : a.type === 'dir' ? -1 : 1));
  return out;
}
ipcMain.handle('file:tree', async (_e, dir) => walk(dir, 6));

// external change watching
const watchers = new Map(); // path -> { w, users: Set<webContents id> }
ipcMain.handle('file:watch', (e, p) => {
  const cur = watchers.get(p);
  if (cur) { cur.users.add(e.sender.id); return; }
  try {
    let t = null;
    const w = fs.watch(p, () => {
      clearTimeout(t);
      t = setTimeout(() => { for (const st of windows.values()) if (!st.win.isDestroyed()) st.win.webContents.send('file-changed', p); }, 300);
    });
    watchers.set(p, { w, users: new Set([e.sender.id]) });
  } catch {}
});
ipcMain.handle('file:unwatch', (e, p) => {
  const cur = watchers.get(p);
  if (!cur) return;
  cur.users.delete(e.sender.id);
  if (!cur.users.size) { cur.w.close(); watchers.delete(p); }
});

// ---------- IPC: version history ----------
// layout: userData/history/<key>/index.json + <id>.md
const MAX_VERSIONS = 300;
async function histIndex(p) {
  const dir = path.join(historyRoot(), keyFor(p));
  const idx = await readJSON(path.join(dir, 'index.json'), { path: p, versions: [] });
  return { dir, idx };
}
ipcMain.handle('history:list', async (_e, p) => {
  const { idx } = await histIndex(p);
  return idx.versions.slice().reverse();
});
ipcMain.handle('history:add', async (_e, p, content, kind, label) => {
  const { dir, idx } = await histIndex(p);
  const hash = crypto.createHash('sha1').update(content).digest('hex');
  const last = idx.versions[idx.versions.length - 1];
  if (last && last.hash === hash) {
    if (label && !last.label) { last.label = label; await writeJSON(path.join(dir, 'index.json'), idx); }
    return { skipped: true, id: last.id };
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, id + '.md'), content, 'utf8');
  idx.path = p;
  idx.versions.push({ id, time: Date.now(), kind, label: label || '', size: content.length, hash });
  // prune oldest unlabeled versions
  while (idx.versions.length > MAX_VERSIONS) {
    const i = idx.versions.findIndex((v) => !v.label);
    if (i < 0) break;
    const [old] = idx.versions.splice(i, 1);
    fsp.unlink(path.join(dir, old.id + '.md')).catch(() => {});
  }
  await writeJSON(path.join(dir, 'index.json'), idx);
  return { id };
});
ipcMain.handle('history:read', async (_e, p, id) => {
  const { dir } = await histIndex(p);
  return fsp.readFile(path.join(dir, id + '.md'), 'utf8');
});
ipcMain.handle('history:label', async (_e, p, id, label) => {
  const { dir, idx } = await histIndex(p);
  const v = idx.versions.find((x) => x.id === id);
  if (v) { v.label = label; await writeJSON(path.join(dir, 'index.json'), idx); }
});
ipcMain.handle('history:delete', async (_e, p, id) => {
  const { dir, idx } = await histIndex(p);
  idx.versions = idx.versions.filter((x) => x.id !== id);
  await writeJSON(path.join(dir, 'index.json'), idx);
  fsp.unlink(path.join(dir, id + '.md')).catch(() => {});
});
// keep history when a file is renamed via "save as"
ipcMain.handle('history:move', async (_e, from, to) => {
  const a = path.join(historyRoot(), keyFor(from));
  const b = path.join(historyRoot(), keyFor(to));
  if (!fs.existsSync(a) || fs.existsSync(b)) return;
  await fsp.cp(a, b, { recursive: true });
  const idx = await readJSON(path.join(b, 'index.json'), null);
  if (idx) { idx.path = to; await writeJSON(path.join(b, 'index.json'), idx); }
});

// ---------- IPC: settings, session, themes ----------
ipcMain.handle('settings:get', () => readJSON(settingsFile(), {}));
ipcMain.handle('settings:set', (_e, s) => writeJSON(settingsFile(), s));
ipcMain.handle('session:get', () => readJSON(sessionFile(), null));
ipcMain.handle('session:set', (_e, s) => writeJSON(sessionFile(), s));
ipcMain.handle('themes:custom', async () => {
  const out = [];
  try {
    for (const f of await fsp.readdir(themesDir())) {
      if (f.endsWith('.css')) out.push({ id: 'custom:' + f, name: path.basename(f, '.css'), css: await fsp.readFile(path.join(themesDir(), f), 'utf8') });
    }
  } catch {}
  return out;
});
ipcMain.handle('themes:open-folder', () => shell.openPath(themesDir()));

// ---------- IPC: export ----------
ipcMain.handle('export:html', async (e, html, suggested, directPath) => {
  const r = directPath ? { canceled: false, filePath: directPath } : await dialog.showSaveDialog(W(e), { defaultPath: suggested, filters: [{ name: 'HTML', extensions: ['html'] }] });
  if (r.canceled) return null;
  await fsp.writeFile(r.filePath, html, 'utf8');
  return r.filePath;
});
ipcMain.handle('export:pdf', async (e, html, suggested, baseDir, layout, directPath) => {
  const r = directPath ? { canceled: false, filePath: directPath } : await dialog.showSaveDialog(W(e), { defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return null;
  const tmp = path.join(baseDir || app.getPath('temp'), `.fedo-print-${Date.now()}.html`);
  await fsp.writeFile(tmp, html, 'utf8');
  // A4 width at 96 dpi, so the layout we measure is exactly the layout that gets printed
  const A4_W_IN = 8.27;
  const pw = new BrowserWindow({ show: false, width: Math.round(A4_W_IN * 96), height: 1100, useContentSize: true, webPreferences: { offscreen: true } });
  try {
    await pw.loadFile(tmp);
    await pw.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    await new Promise((res) => setTimeout(res, 300));
    let opts = { printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } };
    if (layout === 'continuous') {
      // one long page: A4 wide, as tall as the content (PDF pages can't exceed 200 inches)
      await pw.webContents.executeJavaScript("document.documentElement.classList.add('continuous')");
      // measure with print styles and no scrollbar, i.e. the exact layout the PDF will use
      const dbg = pw.webContents.debugger;
      try { dbg.attach('1.3'); await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' }); } catch {}
      await new Promise((res) => setTimeout(res, 150));
      const px = await pw.webContents.executeJavaScript(`(() => {
        const d = document.documentElement, b = document.body;
        const last = b.lastElementChild ? b.lastElementChild.getBoundingClientRect().bottom + window.scrollY : 0;
        return Math.ceil(Math.max(d.scrollHeight, b.scrollHeight, last));
      })()`);
      try { dbg.detach(); } catch {}
      let h = Math.min(200, Math.max(2, (px + 24) / 96));
      opts = { printBackground: true, pageSize: { width: A4_W_IN, height: h }, margins: { marginType: 'none' }, preferCSSPageSize: false };
      // print, and if anything spilled onto a second page, grow the page a little and print again
      let pdf;
      for (let i = 0; i < 8; i++) {
        pdf = await pw.webContents.printToPDF(opts);
        const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
        if (pages <= 1 || h >= 200) break;
        h = Math.min(200, h * (1 + 0.06 * Math.min(pages - 1, 5)) + 0.25);
        opts.pageSize = { width: A4_W_IN, height: h };
      }
      await fsp.writeFile(r.filePath, pdf);
      return r.filePath;
    }
    const pdf = await pw.webContents.printToPDF(opts);
    await fsp.writeFile(r.filePath, pdf);
  } finally {
    pw.destroy();
    fsp.unlink(tmp).catch(() => {});
  }
  return r.filePath;
});

ipcMain.handle('app:info', () => ({ version: app.getVersion(), userData: userDir(), platform: process.platform, documents: app.getPath('documents'), desktop: app.getPath('desktop') }));
