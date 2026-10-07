// Local side: settings, sound-bank folders, downloads, catalog (JSON + CSV), favorites, history.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { suggest } = require('./categorize');
const { travaSync } = require('../ia/trava');

// No Noctis Studio a pasta raiz vem das Configurações do app (nada fixo no código).
const DEFAULT_ROOT = '';
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aiff?|aac)$/i;
const LICENSE = 'Pixabay Content License';
const CATALOG = 'catalogo-pixabay.json';

let stateFile = null;
let state = null;

function init(userDataDir) {
  stateFile = path.join(userDataDir, 'state.json');
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = {}; }
  state.config = { root: DEFAULT_ROOT, lang: 'pt', intervalMs: 1500, ...(state.config || {}) };
  state.favorites = state.favorites || [];
  state.history = state.history || [];
  return state;
}

function save() {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

const getState = () => state;
function setConfig(patch) { Object.assign(state.config, patch); save(); return state.config; }

function addHistory(entry) {
  state.history = [entry, ...state.history.filter(h => !(h.query === entry.query && h.type === entry.type))].slice(0, 50);
  save();
  return state.history;
}

function toggleFavorite(item) {
  const i = state.favorites.findIndex(f => f.id === item.id);
  if (i >= 0) state.favorites.splice(i, 1); else state.favorites.unshift(item);
  save();
  return state.favorites;
}

// ---- catalog ----
const rootDir = () => state.config.root;
const catalogPath = () => path.join(rootDir(), CATALOG);

function readCatalog() {
  try { return JSON.parse(fs.readFileSync(catalogPath(), 'utf8')); } catch { return []; }
}

function csvCell(v) {
  const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLS = ['id', 'title', 'author', 'type', 'category', 'tags', 'duration', 'pageUrl', 'localPath', 'downloadedAt', 'license'];

function writeCatalog(entries) {
  fs.writeFileSync(catalogPath(), JSON.stringify(entries, null, 2));
  const csv = [COLS.join(','), ...entries.map(e => COLS.map(c => csvCell(e[c])).join(','))].join('\r\n');
  // BOM so Excel opens accents correctly.
  fs.writeFileSync(catalogPath().replace(/\.json$/, '.csv'), '\ufeff' + csv);
}

// Files saved before this app often carry the Pixabay id in the name
// ("486234__user__whoosh.mp3", "simple-whoosh-02-433006.mp3"); count those as downloaded too.
const ID_IN_NAME = /(?:^|[_-])(\d{5,7})(?=__|[_\-.])/;
function localIdFiles() {
  const files = [];
  walk(rootDir(), 0, files);
  const map = new Map();
  for (const p of files) { const m = path.basename(p).match(ID_IN_NAME); if (m) map.set(m[1], p); }
  return map;
}

function findDownloaded(id) {
  const e = readCatalog().find(x => String(x.id) === String(id));
  if (e && fs.existsSync(e.localPath)) return e;
  const p = localIdFiles().get(String(id));
  return p ? { id: String(id), localPath: p, category: path.relative(rootDir(), path.dirname(p)) } : null;
}

const downloadedIds = () => new Set([...readCatalog().map(e => String(e.id)), ...localIdFiles().keys()]);

// ---- folders / categories ----
function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name).sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}

const categories = () => subdirs(rootDir());

// Returns { name, isNew }: an existing folder that truly fits, or a sensible new one (see categorize.js).
function suggestCategory(item) {
  const cats = categories();
  const base = cats.find(c => c.toLowerCase() === 'background music');
  return suggest(item, cats, base ? subdirs(path.join(rootDir(), base)) : []);
}

// ---- download ----
function cleanTitle(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Audio';
}

// Allows one level of nesting ("background music\suspense"); no "..", no illegal characters.
function safeCategory(c) {
  const parts = String(c || '').split(/[\\/]+/)
    .map(p => p.trim().replace(/[<>:"|?*]/g, '').replace(/\.+$/, '').trim()).filter(Boolean);
  if (!parts.length || parts.length > 2) throw Object.assign(new Error('Categoria inválida (use "pasta" ou "pasta\\subpasta").'), { code: 'BAD_CATEGORY' });
  return parts.join(path.sep);
}

function friendlyFsError(e) {
  if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) return Object.assign(new Error('Arquivo ou pasta bloqueado (aberto em outro programa ou sem permissão): ' + (e.path || '')), { code: 'LOCKED' });
  if (e.code === 'ENOENT') return Object.assign(new Error('Pasta raiz não encontrada. Verifique as Configurações (o Google Drive está montado?).'), { code: 'NO_ROOT' });
  return e;
}

// `fetchFn` lets the caller run the HTTP part through the polite throttle.
async function download(item, category, { userAgent, onProgress, throttle = fn => fn() } = {}) {
  if (!rootDir()) throw Object.assign(new Error('Escolha a pasta do banco de sons na aba Configurações do Audio Atlas.'), { code: 'NO_ROOT' });
  const existing = findDownloaded(item.id);
  if (existing) return { duplicate: true, path: existing.localPath, entry: existing };
  if (!fs.existsSync(rootDir())) throw friendlyFsError({ code: 'ENOENT' });

  const cat = safeCategory(category);
  const dir = path.join(rootDir(), cat);
  const file = path.join(dir, `${cleanTitle(item.title)}_${item.id}.mp3`);
  const tmp = file + '.part';
  const newFolder = !fs.existsSync(dir);
  try {
    fs.mkdirSync(dir, { recursive: true });
    await throttle(async () => {
      let res;
      try {
        res = await fetch(item.src, { headers: { 'User-Agent': userAgent || 'AudioAtlas/1.0', Referer: 'https://pixabay.com/' }, signal: AbortSignal.timeout(120000) });
      } catch (e) { throw Object.assign(new Error('Falha de rede ao baixar: ' + e.message), { code: 'NETWORK' }); }
      if (!res.ok) throw Object.assign(new Error(`O CDN do Pixabay respondeu ${res.status}.`), { code: 'HTTP' });
      const total = Number(res.headers.get('content-length')) || 0;
      const out = fs.createWriteStream(tmp);
      let got = 0;
      try {
        for await (const chunk of res.body) {
          got += chunk.length;
          if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
          if (onProgress && total) onProgress(got / total);
        }
      } finally { await new Promise(r => out.end(r)); }
    });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw friendlyFsError(e);
  }

  const entry = {
    id: String(item.id), title: item.title, author: item.author, type: item.type, category: cat,
    tags: item.tags || [], duration: item.duration, pageUrl: item.pageUrl, localPath: file,
    downloadedAt: new Date().toISOString(), license: LICENSE,
  };
  // Leitura + escrita do catálogo sob trava: o app e o MCP podem baixar ao mesmo tempo.
  try {
    travaSync(catalogPath(), () => {
      const catalog = readCatalog().filter(e => String(e.id) !== entry.id);
      catalog.push(entry);
      writeCatalog(catalog);
    });
  } catch (e) { throw e.code === 'LOCKED' ? e : friendlyFsError(e); }
  return { duplicate: false, path: file, entry, newFolder };
}

// ---- local library (catalog + files already in the folders) ----
function walk(dir, depth, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of entries) {
    const p = path.join(dir, d.name);
    if (d.isDirectory() && depth < 4) walk(p, depth + 1, out);
    else if (d.isFile() && AUDIO_EXT.test(d.name)) out.push(p);
  }
}

function library(query = '') {
  const root = rootDir();
  const byPath = new Map(readCatalog().map(e => [path.resolve(e.localPath).toLowerCase(), e]));
  const files = [];
  walk(root, 0, files);
  const q = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = files.map(p => {
    const e = byPath.get(path.resolve(p).toLowerCase());
    const rel = path.relative(root, p);
    const category = rel.includes(path.sep) ? rel.split(path.sep)[0] : '';
    return {
      id: e ? e.id : null, title: e ? e.title : path.basename(p).replace(/\.[^.]+$/, ''),
      author: e ? e.author : '', type: e ? e.type : 'local', category, tags: e ? e.tags : [],
      duration: e ? e.duration : 0, pageUrl: e ? e.pageUrl : null, localPath: p,
      fileUrl: pathToFileURL(p).href, fromPixabay: !!e,
    };
  });
  if (!q.length) return items;
  return items.filter(i => {
    const hay = [i.title, i.category, i.author, path.basename(i.localPath), ...(i.tags || [])].join(' ').toLowerCase();
    return q.every(w => hay.includes(w));
  });
}

module.exports = {
  init, getState, setConfig, addHistory, toggleFavorite, categories, suggestCategory,
  download, library, readCatalog, downloadedIds, findDownloaded, cleanTitle, DEFAULT_ROOT,
};

// Self-check: node src/library.js
if (require.main === module) {
  const assert = require('assert');
  assert.strictEqual(cleanTitle('Épico: Whoosh / Dark (v2)!'), 'Epico_Whoosh_Dark_v2');
  assert.strictEqual(csvCell('a,b'), '"a,b"');
  assert.strictEqual('486234__user__whoosh.mp3'.match(ID_IN_NAME)[1], '486234');
  assert.strictEqual('simple-whoosh-02-433006.mp3'.match(ID_IN_NAME)[1], '433006');
  assert.strictEqual('track_2024_01.mp3'.match(ID_IN_NAME), null);
  assert.strictEqual(csvCell(['x', 'y']), '"x; y"');
  assert.throws(() => safeCategory('  ..  '));
  assert.throws(() => safeCategory('a/b/c'));
  assert.strictEqual(safeCategory('background music/suspense'), path.join('background music', 'suspense'));
  assert.strictEqual(safeCategory('..\\..\\Windows'), 'Windows'); // can't climb out of the root
  console.log('library ok');
}
