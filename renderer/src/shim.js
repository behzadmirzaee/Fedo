// In-memory stand-in for the Electron bridge, used only when the UI runs in a normal browser (tests).
export function installShim() {
  const files = new Map();
  const hist = new Map();
  const drafts = new Map();
  const STORE_KEY = 'fedo-dev-settings';
  const loadStored = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
  };
  let settings = window.__nvSettings ? { ...window.__nvSettings } : loadStored();
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
    getSettings: async () => settings, setSettings: async (s) => {
      settings = JSON.parse(JSON.stringify(s));
      if (!window.__nvSettings) { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }
    },
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
    // AI: a fake service. window.__ai = { key, reply(job) → text | { error }, delay } steers it in tests
    aiKeyInfo: async () => { const k = (window.__ai || {}).key; return { has: !!k, mask: k ? k.slice(0, 4) + '••••••••' + k.slice(-4) : '' }; },
    aiKeySet: async (_p, k) => { window.__ai = { ...(window.__ai || {}), key: k }; return window.api.aiKeyInfo(); },
    aiModels: async () => ((window.__ai || {}).key ? { ok: true, models: [{ id: 'gemini-flash-latest' }, { id: 'gemini-flash-lite-latest' }], noList: false } : { ok: false, error: { kind: 'nokey' } }),
    aiRun: async (id, cfg, job) => {
      const ai = window.__ai || {};
      window.__aiJobs = [...(window.__aiJobs || []), { cfg, job }];
      const r = ai.reply ? ai.reply(job) : 'OK';
      if (r && r.error) { setTimeout(() => emit('ai-chunk', id, { error: r.error }), 10); return; }
      const parts = String(r).match(/[\s\S]{1,12}/g) || [''];
      let i = 0;
      const tick = () => {
        if (window.__aiCancel === id) { emit('ai-chunk', id, { cancelled: true }); return; }
        if (i < parts.length) { emit('ai-chunk', id, { delta: parts[i++] }); setTimeout(tick, ai.delay || 5); }
        else emit('ai-chunk', id, { done: true, text: String(r), model: cfg.model, fallback: !!ai.fallback });
      };
      setTimeout(tick, ai.delay || 5);
    },
    aiCancel: async (id) => { window.__aiCancel = id; },
    onAiChunk: on('ai-chunk'),
    aiMarksLoad: async (p) => (window.__marks || {})[p] || [],
    aiMarksSave: async (p, m) => { window.__marks = { ...(window.__marks || {}), [p]: m }; },
    aiMarksMove: async (a, b, keep) => { const m = window.__marks || {}; if (m[a]) { m[b] = m[a]; if (!keep) delete m[a]; } },
  };
  // anything newer than this stand-in: listeners register, other calls resolve to nothing
  window.api = new Proxy(window.api, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && /^on[A-Z]/.test(k) ? on(k) : async () => undefined) });
}
