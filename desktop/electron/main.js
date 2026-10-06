// Noctis Studio Desktop — processo principal.
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, safeStorage, Notification, protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./lib/store');
const log = require('./lib/logger');
const { createAuth } = require('./lib/auth');

app.setName('Noctis Studio');
if (process.env.NOCTIS_USER_DATA) app.setPath('userData', process.env.NOCTIS_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
// midia://f/<caminho> serve as imagens/vídeos gerados para a interface (sem expor file:// direto).
protocol.registerSchemesAsPrivileged([{ scheme: 'midia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }]);

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'build', 'icon.png');
let win = null;
let tray = null;
let quitting = false;

const ctx = {
  app,
  log,
  root: ROOT,
  win: () => win,
  send(evento, dados) {
    if (win && !win.isDestroyed()) win.webContents.send(evento, dados);
  },
  notify(title, body) {
    try { if (Notification.isSupported()) new Notification({ title, body, icon: ICON }).show(); } catch { /* sem notificação */ }
  },
};

// Todo handler devolve { ok, data } ou { ok:false, error } — a interface nunca vê exceção crua.
// Por padrão exige a conta Noctis conectada; `livre: true` libera (login, logs, janela).
function handle(canal, fn, { livre = false } = {}) {
  ipcMain.handle(canal, async (_e, ...args) => {
    try {
      if (!livre && !ctx.auth.isSignedIn()) throw Object.assign(new Error('Entre com sua conta Noctis para usar o app.'), { code: 'AUTH' });
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
    }
  });
}
ctx.handle = handle;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#0d0e12',
    title: 'Noctis Studio',
    icon: ICON,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d0e12', symbolColor: '#8b93a5', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.once('ready-to-show', () => win.show());
  const dev = process.env.NOCTIS_DEV_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(ROOT, 'dist', 'index.html'));

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !(dev && url.startsWith(dev))) { e.preventDefault(); shell.openExternal(url); }
  });

  win.on('close', (e) => {
    if (quitting) return;
    const acao = ctx.store.get().closeAction;
    if (acao === 'quit') return;
    e.preventDefault();
    if (acao === 'tray') { win.hide(); ensureTray(); return; }
    ctx.send('app:close-request', {});
  });
}

function ensureTray() {
  if (tray) return;
  const img = fs.existsSync(ICON) ? nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('Noctis Studio');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Noctis Studio', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { win.show(); win.focus(); });
}

function registerCore() {
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    dev: !app.isPackaged,
    userData: app.getPath('userData'),
  }), { livre: true });
  handle('app:close-choice', ({ action, remember }) => {
    if (remember) ctx.store.set({ closeAction: action });
    if (action === 'tray') { win.hide(); ensureTray(); }
    else if (action === 'quit') { quitting = true; app.quit(); }
    return true;
  }, { livre: true });

  handle('auth:state', () => ctx.auth.state(), { livre: true });
  handle('auth:signin', () => ctx.auth.signIn(), { livre: true });
  handle('auth:cancel', () => ctx.auth.cancel(), { livre: true });
  handle('auth:signout', () => ctx.auth.signOut(), { livre: true });
  handle('auth:refresh', () => ctx.auth.refresh({ force: true }), { livre: true });

  handle('settings:get', () => ctx.store.get(), { livre: true });
  handle('settings:defaults', () => ctx.store.defaults());
  handle('settings:set', (patch) => {
    const novo = ctx.store.set(patch || {});
    ctx.send('settings', novo);
    for (const fn of ctx.onSettings) fn(novo);
    return novo;
  });

  handle('logs:recent', (n) => log.recent(n), { livre: true });
  handle('logs:clear', () => { log.clear(); return true; }, { livre: true });
  handle('logs:export', async () => {
    const r = await dialog.showSaveDialog(win, {
      title: 'Exportar logs',
      defaultPath: path.join(app.getPath('documents'), `noctis-logs-${Date.now()}.txt`),
      filters: [{ name: 'Texto', extensions: ['txt'] }],
    });
    if (r.canceled || !r.filePath) return null;
    const dir = log.dir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort();
    const texto = files.map((f) => `===== ${f} =====\n${fs.readFileSync(path.join(dir, f), 'utf8')}`).join('\n');
    fs.writeFileSync(r.filePath, `Noctis Studio ${app.getVersion()} · ${process.platform}\n\n${texto}`);
    return r.filePath;
  }, { livre: true });

  handle('sys:pickFolder', async (opts = {}) => {
    const r = await dialog.showOpenDialog(win, { title: opts.title || 'Escolha a pasta', defaultPath: opts.defaultPath || undefined, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('sys:pickFile', async (opts = {}) => {
    const r = await dialog.showOpenDialog(win, { title: opts.title || 'Escolha o arquivo', defaultPath: opts.defaultPath || undefined, filters: opts.filters, properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'] });
    return r.canceled ? null : opts.multi ? r.filePaths : r.filePaths[0];
  });
  handle('sys:openPath', (p) => shell.openPath(p));
  handle('sys:reveal', (p) => { shell.showItemInFolder(p); return true; });
  handle('sys:openExternal', (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return true; }, { livre: true });
  handle('sys:openSite', (rota = '') => shell.openExternal(`${ctx.store.get().siteUrl}${rota}`), { livre: true });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(async () => {
  protocol.handle('midia', (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
    if (!p || !fs.existsSync(p)) return new Response('não encontrado', { status: 404 });
    return net.fetch(pathToFileURL(p).toString(), { headers: req.headers });
  });
  const userData = app.getPath('userData');
  log.init(path.join(userData, 'logs'));
  ctx.store = createStore(path.join(userData, 'config.json'), app.getPath('documents'));
  ctx.onSettings = [];
  ctx.dataDir = userData;
  log.subscribe((entry) => ctx.send('log', entry));
  log.info(`Noctis Studio ${app.getVersion()} iniciando`);

  ctx.auth = createAuth({
    file: path.join(userData, 'conta.bin'),
    safeStorage,
    openExternal: (u) => shell.openExternal(u),
    getSiteUrl: () => ctx.store.get().siteUrl,
    log,
    onChange: (s) => { ctx.send('auth', s); for (const fn of ctx.onAuth) fn(s); },
  });
  ctx.onAuth = [];

  registerCore();
  for (const mod of ['renomeador', 'audio-atlas', 'creator', 'srt', 'chat']) {
    try { require(`./ipc/${mod}`)(ctx); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes(`ipc/${mod}`)) log.error(`Módulo ${mod}: ${e.message}`); }
  }

  createWindow();
  if (!app.isPackaged && process.env.NOCTIS_DEV_NO_LOGIN === '1') ctx.auth.devBypass();
  else ctx.auth.init();
});
