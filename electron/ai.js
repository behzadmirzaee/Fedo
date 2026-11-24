// Fedora (the AI assistant): talks to the user's own AI service with the user's own key.
// Everything runs here, in the main process: the key never reaches the page, and requests use
// Electron's network stack, so the system proxy / VPN applies.
//
// Providers: Google Gemini (AI Studio key), Anthropic Claude (its own Messages API), and any
// OpenAI-compatible service given by its base URL (OpenAI, OpenRouter, DeepSeek, Groq, Mistral, xAI,
// regional services, a local Ollama …). Replies stream back to the page as they arrive.

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const ANTHROPIC = 'https://api.anthropic.com/v1';
const ANTHROPIC_HEADERS = (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' });
/** a local server (Ollama, LM Studio …) needs no key */
const isLocal = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(String(u || '').trim());
const TIMEOUT = 90000; // no data for this long → give up

// ---------- errors ----------
// kind: badkey | region | quota | busy | model | offline | timeout | blocked | nokey | http
function errorOf(status, bodyText) {
  let msg = '';
  let retry = null;
  try {
    const j = JSON.parse(bodyText);
    const e = Array.isArray(j) ? j[0] && j[0].error : j.error;
    if (e) {
      msg = String(e.message || e.status || '');
      for (const d of e.details || []) if (d && d.retryDelay) retry = parseInt(d.retryDelay, 10) || null;
    }
  } catch { msg = String(bodyText || '').slice(0, 300); }
  const low = msg.toLowerCase();
  // «retry in 14h47m11s» / «53202s»
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(msg);
  if (m && (m[1] || m[2] || m[3])) retry = Math.round((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0));
  let kind = 'http';
  let day = false;
  if (/location is not supported|not available in your (country|region)|unsupported_country|region/.test(low)) kind = 'region';
  else if (status === 401 || /api key not valid|api_key_invalid|invalid api key|incorrect api key|invalid_api_key|unauthorized|no auth credentials/.test(low)) kind = 'badkey';
  else if (status === 403 && /permission|denied|forbidden/.test(low)) kind = 'badkey';
  else if (status === 429 && /limit: 0\b/.test(low)) kind = 'notfree'; // not offered on the free tier at all
  else if (status === 429 || /quota|rate limit|resource_exhausted/.test(low)) { kind = 'quota'; day = /per day|perday|daily/.test(low) || (retry || 0) > 3600; }
  else if (status === 404 || /not found|is not supported for|does not exist|no endpoints found/.test(low)) kind = 'model';
  else if (status >= 500 || /overloaded|unavailable|high demand/.test(low)) kind = 'busy';
  return { kind, status, message: msg, retry, day };
}

// ---------- server-sent events ----------
async function* sse(res, signal) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const stopped = () => Object.assign(new Error('cancelled'), { ai: { kind: 'cancelled' } });
  try {
    for (;;) {
      if (signal && signal.aborted) throw stopped();
      let r;
      try { r = await reader.read(); } catch (e) {
        if (signal && signal.aborted) throw stopped();
        if (res.timedOut && res.timedOut()) throw Object.assign(new Error('timeout'), { ai: { kind: 'timeout' } });
        throw Object.assign(new Error('offline'), { ai: { kind: 'offline', message: String(e && e.message || e) } });
      }
      const { value, done } = r;
      if (done) break;
      if (res.alive) res.alive();
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
        const data = chunk.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
        if (data) yield data;
      }
    }
    const rest = buf.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (rest) yield rest;
  } finally {
    if (res.end) res.end();
    try { reader.releaseLock(); } catch {}
  }
}

// ---------- the client (no Electron here, so it can be tested with plain fetch) ----------
function createClient(fetchImpl) {
  const baseOf = (cfg) => String(cfg.baseUrl || '').trim().replace(/\/+$/, '');

  async function request(url, opts, signal) {
    const ac = new AbortController();
    const kill = () => ac.abort();
    if (signal) signal.addEventListener('abort', kill);
    let timer = setTimeout(kill, TIMEOUT);
    try {
      const res = await fetchImpl(url, { ...opts, signal: ac.signal });
      // the timer keeps watching the body: a stream that stops sending is given up after TIMEOUT
      clearTimeout(timer);
      timer = setTimeout(kill, TIMEOUT);
      let ended = false;
      res.alive = () => { if (ended) return; clearTimeout(timer); timer = setTimeout(kill, TIMEOUT); };
      res.end = () => { ended = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', kill); };
      res.timedOut = () => ac.signal.aborted && !(signal && signal.aborted);
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (signal && signal.aborted) throw Object.assign(new Error('cancelled'), { ai: { kind: 'cancelled' } });
      throw Object.assign(new Error('offline'), { ai: { kind: ac.signal.aborted ? 'timeout' : 'offline', message: String(e && e.message || e) } });
    }
  }

  async function fail(res) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error('http ' + res.status), { ai: errorOf(res.status, text) });
  }

  // --- model lists ---
  async function listModels(cfg, key) {
    if (cfg.provider === 'anthropic') {
      const res = await request(ANTHROPIC + '/models?limit=100', { headers: ANTHROPIC_HEADERS(key) });
      if (!res.ok) await fail(res);
      const j = await res.json().catch(() => ({}));
      const list = (j.data || []).map((m) => ({ id: String(m.id || ''), name: m.display_name || m.id })).filter((m) => m.id);
      return { models: list, noList: !list.length };
    }
    if (cfg.provider === 'oai') {
      const base = baseOf(cfg);
      if (!/^https?:\/\//i.test(base)) throw Object.assign(new Error('bad url'), { ai: { kind: 'url' } });
      const res = await request(base + '/models', { headers: { Authorization: 'Bearer ' + key } });
      if (!res.ok) {
        // some services have no model list, but the key may still be fine
        if (res.status === 404 || res.status === 405) return { models: [], noList: true };
        await fail(res);
      }
      const j = await res.json().catch(() => ({}));
      const list = (j.data || j.models || []).map((m) => ({
        id: String(m.id || m.name || ''),
        free: /:free$/.test(String(m.id || '')) || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0),
      })).filter((m) => m.id)
        // OpenAI's own list also has embeddings, images, speech …: only the text models
        .filter((m) => !/api\.openai\.com/i.test(base) || (/^(gpt|o\d|chatgpt)/i.test(m.id) && !/audio|realtime|tts|transcribe|image|search|embedding|instruct/i.test(m.id)));
      return { models: list, noList: !list.length };
    }
    const out = [];
    let token = '';
    for (let page = 0; page < 5; page++) {
      const res = await request(`${GEMINI}/models?pageSize=200${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, { headers: { 'x-goog-api-key': key } });
      if (!res.ok) await fail(res);
      const j = await res.json();
      for (const m of j.models || []) {
        const id = String(m.name || '').replace(/^models\//, '');
        if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
        if (/embedding|aqa|image|tts|imagen|veo|transcribe|live|audio|robotics|computer-use/i.test(id)) continue;
        out.push({ id, name: m.displayName || id });
      }
      token = j.nextPageToken;
      if (!token) break;
    }
    return { models: out, noList: false };
  }

  // --- one streamed reply ---
  // job: { system, messages: [{ role: 'user'|'model', text }], temperature }
  async function* stream(cfg, key, model, job, signal) {
    if (cfg.provider === 'anthropic') {
      // the turns must alternate user / assistant: neighbours of the same role are joined
      const messages = [];
      for (const m of job.messages) {
        const role = m.role === 'model' ? 'assistant' : 'user';
        const last = messages[messages.length - 1];
        if (last && last.role === role) last.content += '\n\n' + m.text; else messages.push({ role, content: m.text });
      }
      const body = { model, max_tokens: 8192, stream: true, messages, temperature: job.temperature ?? 0.4 };
      if (job.system) body.system = job.system;
      const res = await request(ANTHROPIC + '/messages', { method: 'POST', headers: ANTHROPIC_HEADERS(key), body: JSON.stringify(body) }, signal);
      if (!res.ok) await fail(res);
      for await (const data of sse(res, signal)) {
        let j;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.type === 'error') throw Object.assign(new Error('stream error'), { ai: errorOf(j.error && j.error.type === 'overloaded_error' ? 529 : 500, JSON.stringify(j)) });
        if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta' && j.delta.text) yield j.delta.text;
        if (j.type === 'message_stop') return;
      }
      return;
    }
    if (cfg.provider === 'oai') {
      const base = baseOf(cfg);
      if (!/^https?:\/\//i.test(base)) throw Object.assign(new Error('bad url'), { ai: { kind: 'url' } });
      const messages = [];
      if (job.system) messages.push({ role: 'system', content: job.system });
      for (const m of job.messages) messages.push({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text });
      const res = await request(base + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (key || 'local'),
          'HTTP-Referer': 'https://github.com/behzadmirzaee/Fedo',
          'X-Title': 'Fedo',
        },
        body: JSON.stringify({ model, messages, stream: true, temperature: job.temperature ?? 0.4 }),
      }, signal);
      if (!res.ok) await fail(res);
      for await (const data of sse(res, signal)) {
        if (data === '[DONE]') return;
        let j;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw Object.assign(new Error('stream error'), { ai: errorOf(Number(j.error.code) || 500, JSON.stringify(j)) });
        const c = j.choices && j.choices[0];
        const t = c && c.delta && c.delta.content;
        if (t) yield t;
      }
      return;
    }
    const body = {
      contents: job.messages.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
      generationConfig: { temperature: job.temperature ?? 0.4 },
      // the adjustable filters as open as Google allows (PROHIBITED_CONTENT itself cannot be turned off)
      safetySettings: ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT'].map((c) => ({ category: 'HARM_CATEGORY_' + c, threshold: 'BLOCK_NONE' })),
    };
    if (job.system) body.systemInstruction = { parts: [{ text: job.system }] };
    const res = await request(`${GEMINI}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    }, signal);
    if (!res.ok) await fail(res);
    let any = false;
    let blocked = null;
    for await (const data of sse(res, signal)) {
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw Object.assign(new Error('stream error'), { ai: errorOf(Number(j.error.code) || 500, JSON.stringify(j)) });
      if (j.promptFeedback && j.promptFeedback.blockReason) blocked = 'prompt:' + j.promptFeedback.blockReason;
      const cand = j.candidates && j.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const t = parts.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
      if (t) { any = true; yield t; }
      if (cand && cand.finishReason && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(cand.finishReason) && !any) blocked = cand.finishReason;
    }
    if (!any && blocked) throw Object.assign(new Error('blocked'), { ai: { kind: 'blocked', message: blocked, input: blocked.startsWith('prompt:') } });
  }

  // tries the main model, then the backup one when the main one is busy / missing (and nothing came yet)
  async function run(cfg, key, job, onDelta, signal) {
    // both models busy (a short spike at the provider): one more round after a short pause
    for (let round = 0; ; round++) {
      try { return await runOnce(cfg, key, job, onDelta, signal); } catch (e) {
        if (round >= 1 || signal.aborted || !(e.ai && e.ai.kind === 'busy') || e.partial) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  async function runOnce(cfg, key, job, onDelta, signal) {
    const main = [cfg.model, cfg.fallback].filter((m, i, a) => m && a.indexOf(m) === i);
    if (!main.length) throw Object.assign(new Error('no model'), { ai: { kind: 'nomodel' } });
    // lighter models of the same service, tried only when the chosen ones are busy
    const extra = (Array.isArray(cfg.extra) ? cfg.extra : []).filter((m) => m && !main.includes(m)).slice(0, 3);
    const models = [...main, ...extra];
    let lastErr = null;
    for (let i = 0; i < models.length; i++) {
      let got = '';
      try {
        for await (const d of stream(cfg, key, models[i], job, signal)) { got += d; onDelta(d); }
        return { text: got, model: models[i], fallback: i > 0 };
      } catch (e) {
        lastErr = e;
        const k = e.ai && e.ai.kind;
        if (got) e.partial = true;
        // quotas are per model, so another model usually still answers
        if (got || signal.aborted || !(k === 'busy' || k === 'model' || k === 'timeout' || k === 'quota' || k === 'notfree' || k === 'blocked') || i === models.length - 1) throw e;
        // the extra models are only for a busy service, never in place of a model the user picked that does not exist
        if (i + 1 >= main.length && k === 'model') throw e;
        // a blocked reply (not a blocked request) may pass with the backup model; the extra ones are not tried for it
        if (k === 'blocked' && (e.ai.input || i + 1 >= main.length)) throw e;
      }
    }
    throw lastErr;
  }

  // one tiny request per model (one output token): which models answer for this key right now
  // ok | busy (overloaded now) | day (today's free quota used up) | minute (per-minute limit) | gone (removed / not on the free tier)
  async function probe(cfg, key, id) {
    try {
      let res;
      if (cfg.provider === 'anthropic') {
        res = await request(ANTHROPIC + '/messages', { method: 'POST', headers: ANTHROPIC_HEADERS(key),
          body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }) }, AbortSignal.timeout(8000));
      } else if (cfg.provider === 'oai') {
        res = await request(baseOf(cfg) + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }) }, AbortSignal.timeout(8000));
      } else {
        res = await request(`${GEMINI}/models/${encodeURIComponent(id)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }) }, AbortSignal.timeout(8000));
      }
      if (res.ok) { res.body && res.body.cancel && res.body.cancel().catch(() => {}); return 'ok'; }
      const e = errorOf(res.status, await res.text().catch(() => ''));
      if (e.kind === 'busy' || e.kind === 'timeout') return 'busy';
      if (e.kind === 'quota') return e.day ? 'day' : 'minute';
      if (e.kind === 'badkey') return 'badkey';
      return 'gone';
    } catch (e) {
      const k = e.ai && e.ai.kind;
      return k === 'offline' ? 'offline' : 'busy';
    }
  }
  async function probeAll(cfg, key, ids, limit = 12) {
    const out = {};
    let i = 0;
    const worker = async () => { while (i < ids.length) { const id = ids[i++]; out[id] = await probe(cfg, key, id); } };
    await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
    return out;
  }

  return { listModels, run, errorOf, probeAll };
}

// ---------- Electron wiring ----------
function setup({ ipcMain, net, safeStorage, app, BrowserWindow }) {
  const client = createClient((url, opts) => net.fetch(url, opts));
  const keysFile = () => path.join(app.getPath('userData'), 'ai-keys.json');
  const marksDir = () => path.join(app.getPath('userData'), 'ai-marks');
  const keyFor = (p) => crypto.createHash('sha1').update(path.resolve(p).toLowerCase()).digest('hex').slice(0, 16);

  let keys = null;
  const loadKeys = () => {
    if (keys) return keys;
    try { keys = JSON.parse(fs.readFileSync(keysFile(), 'utf8')) || {}; } catch { keys = {}; }
    return keys;
  };
  // one key per service: Gemini, Claude, and each OpenAI-compatible address (by its host)
  const slotOf = (cfg) => {
    const c = typeof cfg === 'string' ? { provider: cfg } : cfg || {};
    if (c.provider === 'anthropic') return 'anthropic';
    if (c.provider !== 'oai') return 'gemini';
    let host = '';
    try { host = new URL(String(c.baseUrl || '').trim()).host.toLowerCase(); } catch {}
    return host ? 'oai:' + host : 'oai';
  };
  const getKey = (cfg) => {
    const slot = slotOf(cfg);
    const all = loadKeys();
    let k = all[slot];
    // the single OpenAI-compatible key of earlier versions: bound once to the first service it is used
    // with, so it is never sent to a second host
    if (!k && slot.startsWith('oai:') && all.oai && !Object.keys(all).some((x) => x.startsWith('oai:'))) {
      k = all.oai;
      all[slot] = k;
      delete all.oai;
      fsp.writeFile(keysFile(), JSON.stringify(all), 'utf8').catch(() => {});
    }
    if (!k) return cfg && cfg.provider === 'oai' && isLocal(cfg.baseUrl) ? 'local' : '';
    try {
      if (k.enc && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(k.v, 'base64'));
      if (!k.enc) return Buffer.from(k.v, 'base64').toString('utf8');
    } catch {}
    return '';
  };
  const mask = (s) => (s ? s.slice(0, 4) + '••••••••' + s.slice(-4) : '');
  const info = (cfg) => { const k = getKey(cfg); return { has: !!k, mask: k === 'local' ? '' : mask(k), local: k === 'local' }; };

  ipcMain.handle('ai:key-info', (_e, cfg) => info(cfg));
  ipcMain.handle('ai:key-set', async (_e, cfg, key) => {
    const provider = cfg;
    key = String(key || '').trim();
    const all = loadKeys();
    const slot = slotOf(cfg);
    if (!key) delete all[slot];
    else {
      const enc = safeStorage.isEncryptionAvailable();
      all[slot] = { enc, v: (enc ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8')).toString('base64') };
    }
    keys = all;
    await fsp.writeFile(keysFile(), JSON.stringify(all), 'utf8');
    return info(provider);
  });

  const plainErr = (e) => (e && e.ai) || { kind: 'offline', message: String(e && e.message || e) };

  ipcMain.handle('ai:models', async (_e, cfg, opts = {}) => {
    const key = getKey(cfg);
    if (!key) return { ok: false, error: { kind: 'nokey' } };
    let r;
    try { r = await client.listModels(cfg, key); } catch (e) { return { ok: false, error: plainErr(e) }; }
    // probing: every Gemini model, or for a long list (OpenRouter has hundreds) only the ones asked about
    if (opts.probe && r.models.length) {
      const ids = cfg.provider !== 'gemini' ? (opts.only || []).filter((id) => r.models.some((m) => m.id === id)) : r.models.map((m) => m.id);
      const st = await client.probeAll(cfg, key, ids);
      const vals = Object.values(st);
      if (vals.length && vals.every((x) => x === 'offline')) return { ok: false, error: { kind: 'offline' } };
      for (const m of r.models) if (st[m.id]) m.status = st[m.id];
      if (cfg.provider === 'gemini') r.models = r.models.filter((m) => m.status !== 'gone' && m.status !== 'badkey');
      r.probed = Date.now();
    }
    return { ok: true, ...r };
  });

  const jobs = new Map(); // id -> AbortController
  ipcMain.handle('ai:run', async (e, id, cfg, job) => {
    const key = getKey(cfg);
    const send = (msg) => { if (!e.sender.isDestroyed()) e.sender.send('ai-chunk', id, msg); };
    if (!key) { send({ error: { kind: 'nokey' } }); return; }
    const ac = new AbortController();
    jobs.set(id, ac);
    try {
      const r = await client.run(cfg, key, job, (d) => send({ delta: d }), ac.signal);
      if (ac.signal.aborted) { send({ cancelled: true }); return; }
      send({ done: true, text: r.text, model: r.model, fallback: r.fallback });
    } catch (err) {
      const pe = plainErr(err);
      send(pe.kind === 'cancelled' || ac.signal.aborted ? { cancelled: true } : { error: pe });
    } finally {
      jobs.delete(id);
    }
  });
  ipcMain.handle('ai:cancel', (_e, id) => { const ac = jobs.get(id); if (ac) ac.abort(); });

  // ---------- change markers, kept beside the file's version history ----------
  ipcMain.handle('ai:marks-load', async (_e, p) => {
    try { return JSON.parse(await fsp.readFile(path.join(marksDir(), keyFor(p) + '.json'), 'utf8')).marks || []; } catch { return []; }
  });
  ipcMain.handle('ai:marks-save', async (_e, p, marks) => {
    const file = path.join(marksDir(), keyFor(p) + '.json');
    if (!marks || !marks.length) { await fsp.unlink(file).catch(() => {}); return true; }
    await fsp.mkdir(marksDir(), { recursive: true });
    await fsp.writeFile(file, JSON.stringify({ path: p, marks }), 'utf8');
    return true;
  });
  // keep = true (Save As): the original file keeps its markers, the new one gets a copy
  ipcMain.handle('ai:marks-move', async (_e, from, to, keep) => {
    const a = path.join(marksDir(), keyFor(from) + '.json');
    const b = path.join(marksDir(), keyFor(to) + '.json');
    if (a === b) return;
    await (keep ? fsp.copyFile(a, b) : fsp.rename(a, b)).catch(() => {});
  });
}

module.exports = { setup, createClient, errorOf };
