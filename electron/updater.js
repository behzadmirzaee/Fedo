// Updates from GitHub Releases (no server of our own).
// The installed app (NSIS) checks the latest release, downloads it and installs it.
// The portable zip build cannot replace itself, so it only checks and points to the download page.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const OWNER = 'behzadmirzaee';
const REPO = 'Fedo';
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases`;
const EVERY = 6 * 60 * 60 * 1000;

let updater = null;
let timer = null;
let config = { auto: true, download: false, installOnQuit: true };
const state = { status: 'idle', current: app.getVersion(), version: null, percent: 0, checkedAt: 0, error: null, manual: false, url: RELEASES };

const installed = () => {
  if (!app.isPackaged || process.platform !== 'win32') return false;
  try { return fs.readdirSync(path.dirname(process.execPath)).some((f) => /^Uninstall .*\.exe$/i.test(f)); } catch { return false; }
};
function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('update-state', { ...state });
}
function set(patch) { Object.assign(state, patch); broadcast(); }

const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

// portable build (or a dev run): ask the GitHub API for the latest release, nothing more
async function checkByApi() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Fedo' } });
  if (res.status === 404) return set({ status: 'none', checkedAt: Date.now() });
  if (!res.ok) throw new Error('GitHub ' + res.status);
  const r = await res.json();
  const v = String(r.tag_name || '').replace(/^v/, '');
  if (v && newer(v, state.current)) set({ status: 'available', version: v, url: r.html_url || RELEASES, checkedAt: Date.now() });
  else set({ status: 'none', checkedAt: Date.now() });
}

function setupUpdater() {
  if (updater || !installed()) return;
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = config.download;
  updater.autoInstallOnAppQuit = config.installOnQuit;
  updater.allowPrerelease = false;
  updater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  updater.on('update-available', (i) => set({ status: state.status === 'downloading' ? 'downloading' : 'available', version: i.version, checkedAt: Date.now(), url: `${RELEASES}/tag/v${i.version}` }));
  updater.on('update-not-available', () => set({ status: 'none', checkedAt: Date.now() }));
  updater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (i) => set({ status: 'downloaded', version: i.version, percent: 100 }));
  updater.on('error', (e) => set({ status: 'error', error: String((e && e.message) || e).split('\n')[0].slice(0, 200), checkedAt: Date.now() }));
}

async function check() {
  if (['checking', 'downloading'].includes(state.status)) return state;
  set({ status: 'checking', error: null, manual: !installed() });
  try {
    if (installed()) { setupUpdater(); await updater.checkForUpdates(); }
    else await checkByApi();
  } catch (e) {
    set({ status: 'error', error: String((e && e.message) || e).split('\n')[0].slice(0, 200), checkedAt: Date.now() });
  }
  return state;
}

function schedule() {
  clearInterval(timer);
  timer = null;
  if (!config.auto || !app.isPackaged) return;
  timer = setInterval(check, EVERY);
}

ipcMain.handle('update:state', () => ({ ...state, manual: !installed() }));
ipcMain.handle('update:check', () => check());
ipcMain.handle('update:download', async () => {
  if (!installed()) { shell.openExternal(state.url || RELEASES); return state; }
  setupUpdater();
  if (state.status !== 'available' && state.status !== 'error') return state;
  set({ status: 'downloading', percent: 0, error: null });
  try { await updater.downloadUpdate(); } catch (e) { set({ status: 'error', error: String((e && e.message) || e).split('\n')[0] }); }
  return state;
});
// the renderer has already saved or confirmed unsaved work before asking for this
ipcMain.handle('update:install', () => {
  if (!updater || state.status !== 'downloaded') return false;
  for (const w of BrowserWindow.getAllWindows()) w.removeAllListeners('close');
  setImmediate(() => updater.quitAndInstall(false, true));
  return true;
});
ipcMain.handle('update:open-page', (_e, which) => shell.openExternal(which === 'notes' && state.version ? `${RELEASES}/tag/v${state.version}` : RELEASES));
ipcMain.handle('update:config', (_e, c) => {
  const first = !config._set;
  config = { ...config, ...c, _set: true };
  if (updater) { updater.autoDownload = !!config.download; updater.autoInstallOnAppQuit = !!config.installOnQuit; }
  schedule();
  // first check shortly after start, so it never slows the window down
  if (first && config.auto && app.isPackaged) setTimeout(check, 8000);
  return true;
});

module.exports = { RELEASES };
