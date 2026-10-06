// Pixabay access. Pixabay sits behind a Cloudflare JS check that blocks curl/fetch,
// so pages load in a hidden Chromium window (a normal browser visit) and we read the
// page's own bootstrap JSON. CDN MP3s (cdn.pixabay.com) download fine with plain fetch.
const { BrowserWindow, session } = require('electron');
const { parseBootstrap } = require('./parser');

const UA_SUFFIX = 'AudioAtlas/1.0 (personal use)';
const BASE = 'https://pixabay.com';
const DURATIONS = { short: '0-2', medium: '2-60', long: '60-3600' };

let win = null;
let lastRequest = 0;
let queue = Promise.resolve();
let intervalMs = 1500;

const setInterval_ = ms => { intervalMs = Math.max(500, Number(ms) || 1500); };
// SAF_DEBUG=<file> logs each step; handy when Pixabay changes something.
const dbg = m => { if (process.env.SAF_DEBUG) require('fs').appendFileSync(process.env.SAF_DEBUG, `${new Date().toISOString()} ${m}\n`); };
const sleep = ms =>new Promise(r => setTimeout(r, ms));

function userAgent() {
  const ua = session.defaultSession.getUserAgent().replace(/\s(Electron|audio-atlas|Audio Atlas)\/\S+/gi, '');
  return `${ua} ${UA_SUFFIX}`;
}

function getWin() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { images: false, backgroundThrottling: false } });
  win.webContents.setUserAgent(userAgent());
  win.webContents.setAudioMuted(true);
  return win;
}

// Serializes every Pixabay hit and keeps the polite gap between them.
function polite(fn) {
  const run = queue.then(async () => {
    const wait = lastRequest + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    try { return await fn(); } finally { lastRequest = Date.now(); }
  });
  queue = run.catch(() => {});
  return run;
}

function err(code, message) { const e = new Error(message); e.code = code; return e; }

async function loadPage(url) {
  dbg('load ' + url);
  const w = getWin();
  try {
    await w.loadURL(url);
  } catch (e) {
    // ERR_ABORTED happens on in-page redirects; anything else is network.
    if (!/ERR_ABORTED/.test(e.message)) throw err('NETWORK', 'Sem conexão com o Pixabay: ' + e.message);
  }
  for (let i = 0; i < 25; i++) {
    const title = await w.webContents.executeJavaScript('document.title').catch(() => '');
    dbg('title ' + title);
    if (!/just a moment|um momento|attention required/i.test(title)) return w;
    await sleep(1000);
  }
  throw err('BLOCKED', 'O Pixabay pediu verificação anti-robô. Abra pixabay.com no navegador e tente de novo mais tarde.');
}

async function bootstrapOf(w) {
  const text = await w.webContents.executeJavaScript(
    'window.__BOOTSTRAP_URL__ ? fetch(window.__BOOTSTRAP_URL__).then(r => r.text()) : null'
  ).catch(() => null);
  if (!text) throw err('PARSE', 'Formato da página do Pixabay mudou (sem __BOOTSTRAP_URL__). Atualize src/parser.js.');
  try { return JSON.parse(text); } catch { throw err('PARSE', 'JSON do Pixabay inválido.'); }
}

// Waveform JSON is same-origin on pixabay.com (the site itself loads these for every row);
// fetched in one batch from inside the open page. Failure just means a placeholder waveform.
async function attachWaveforms(w, items) {
  const paths = items.map(i => i.waveformUrl);
  const js = `Promise.all(${JSON.stringify(paths)}.map(p => p ? fetch(p).then(r => r.ok ? r.json() : null).catch(() => null) : null))`;
  const all = await w.webContents.executeJavaScript(js).catch(() => []);
  items.forEach((it, i) => { it.wave = waveOf(all[i]); });
}

// Pixabay serves the waveform as an SVG path string ("0 15L40 15L41 11..."); return it with its bounds.
function waveOf(d) {
  if (typeof d !== 'string' || !/^[\d.\sL-]+$/.test(d)) return null;
  const nums = d.split(/[\sL]+/).map(Number);
  let w = 0; let h = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) { w = Math.max(w, nums[i]); h = Math.max(h, nums[i + 1]); }
  return w && h ? { d: 'M' + d + 'Z', w, h } : null;
}

function searchUrl({ type = 'music', query = '', page = 1, order = 'relevance', duration = '' }) {
  const kind = type === 'sfx' ? 'sound-effects' : 'music';
  const q = query.trim() ? encodeURIComponent(query.trim()) + '/' : '';
  const params = new URLSearchParams();
  if (order === 'latest') params.set('order', 'latest');
  if (DURATIONS[duration]) params.set('duration', DURATIONS[duration]);
  if (page > 1) params.set('pagi', page);
  const qs = params.toString();
  return `${BASE}/${kind}/search/${q}${qs ? '?' + qs : ''}`;
}

async function search(opts, { waveforms = true } = {}) {
  return polite(async () => {
    const w = await loadPage(searchUrl(opts));
    dbg('loaded');
    const result = parseBootstrap(await bootstrapOf(w), opts.type);
    dbg('parsed ' + result.items.length);
    if (waveforms) await attachWaveforms(w, result.items);
    return result;
  });
}

// Single item by id: Pixabay redirects /<kind>/id-<id>/ to the item page, whose bootstrap holds it.
async function getItem(id, type = 'music') {
  const kind = type === 'sfx' ? 'sound-effects' : 'music';
  return polite(async () => {
    const w = await loadPage(`${BASE}/${kind}/id-${id}/`);
    const { items } = parseBootstrap(await bootstrapOf(w), type);
    const item = items.find(i => String(i.id) === String(id));
    if (!item) throw err('NOT_FOUND', `ID ${id} não encontrado no Pixabay (${type}).`);
    return item;
  });
}

module.exports = { search, getItem, polite, userAgent, setInterval: setInterval_, searchUrl, err };
