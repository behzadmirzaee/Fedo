// In-memory stand-in for the Electron bridge, used only when the UI runs in a normal browser (tests).
export function installShim() {
  const files = new Map();
  const hist = new Map();
  const drafts = new Map();
  let settings = {};
  let session = null;
  const listeners = {};
  const on = (n) => (fn) => { (listeners[n] = listeners[n] || []).push(fn); };
  const emit = (n, ...a) => (listeners[n] || []).forEach((f) => f(...a));
  let saveAnswer = '/docs/new.md';
  window.__nv = { files, hist, drafts, emit, setUpdate: (u) => { window.__upd = u; emit('update-state', u); }, setSaveAnswer: (p) => { saveAnswer = p; } };
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };
  window.api = {
    closeNow: async () => { window.__closed = true; },
    setTitle: async () => {}, devtools: async () => {}, fullscreen: async () => {}, zoom: async () => {},
    find: async () => {}, stopFind: async () => {}, onFound: on('found'),
    edit: async (op) => document.execCommand(op === 'pastePlain' ? 'paste' : op),
    pickImage: async () => ({ relative: 'assets/picked.png' }),
    openDialog: async () => [...files.keys()].slice(0, 1),
    openFolderDialog: async () => '/docs',
    saveDialog: async () => saveAnswer,
    readFile: async (p) => { if (!files.has(p)) throw new Error('missing'); return { content: files.get(p).content, mtime: files.get(p).mtime }; },
    writeFile: async (p, c) => { const mtime = Date.now(); files.set(p, { content: c, mtime }); return { mtime }; },
    stat: async (p) => (files.has(p) ? { exists: true, mtime: files.get(p).mtime } : { exists: false }),
    reveal: async () => {}, openExternal: async () => {}, openUrl: async (u) => { window.__opened = u; },
    draftSave: async (id, c) => { drafts.set(id, c); }, draftDelete: async (id) => { drafts.delete(id); },
    draftList: async () => [...drafts].map(([id, content]) => ({ id, content, mtime: 0 })),
    saveImage: async (_d, name) => ({ relative: 'assets/' + name }),
    tree: async (dir) => [...files.keys()].filter((p) => p.startsWith(dir)).map((p) => ({ type: 'file', name: p.split('/').pop(), path: p })),
    watch: async () => {}, unwatch: async () => {},
    pathForFile: (f) => '/dropped/' + f.name,
    historyList: async (p) => (hist.get(p) || []).map((v) => ({ ...v, content: undefined })).reverse(),
    historyAdd: async (p, content, kind, label) => {
      const list = hist.get(p) || [];
      const h = hash(content);
      const last = list[list.length - 1];
      if (last && last.hash === h) return { skipped: true, id: last.id };
      const id = 'v' + Math.random().toString(36).slice(2, 8);
      list.push({ id, time: Date.now(), kind, label: label || '', size: content.length, hash: h, content });
      hist.set(p, list);
      return { id };
    },
    historyRead: async (p, id) => hist.get(p).find((v) => v.id === id).content,
    historyLabel: async (p, id, label) => { hist.get(p).find((v) => v.id === id).label = label; },
    historyDelete: async (p, id) => { hist.set(p, hist.get(p).filter((v) => v.id !== id)); },
    historyMove: async (a, b) => { if (hist.has(a)) hist.set(b, hist.get(a).slice()); },
    getSettings: async () => settings, setSettings: async (s) => { settings = JSON.parse(JSON.stringify(s)); },
    getSession: async () => session, setSession: async (s) => { session = s; },
    customThemes: async () => [], openThemesFolder: async () => {},
    exportHTML: async (html, name, direct) => { window.__export = html; return direct || name; },
    exportPDF: async (html, name, _d, _l, direct) => { window.__export = html; return direct || name; },
    info: async () => ({ version: 'dev', documents: '/docs', desktop: '/desk' }),
    setSpellcheck: async () => {}, setLogo: async () => {},
    ready: async () => ({ files: [], role: 'main', payload: null, alwaysOnTop: false }),
    newWindow: async () => { window.__newWindow = (window.__newWindow || 0) + 1; },
    detach: async (payload, opts) => { window.__detached = { payload, opts }; return true; },
    toMain: async () => false, setOnTop: async (on) => !!on, winInfo: async () => ({ role: 'main', alwaysOnTop: false, count: 1 }),
    onReceiveTab: on('receive-tab'), onSetRole: on('set-role'),
    updateState: async () => window.__upd || { status: 'idle', current: '2.4.0', manual: false },
    updateCheck: async () => { emit('update-state', window.__upd = { ...(window.__upd || {}), status: 'none', current: '2.4.0', checkedAt: Date.now() }); },
    updateDownload: async () => {}, updateInstall: async () => { window.__installed = true; return true; }, updateOpenPage: async () => {},
    updateConfig: async () => true, onUpdateState: on('update-state'),
    onOpenPath: on('open-path'), onRequestClose: on('request-close'), onFileChanged: on('file-changed'),
  };
}
