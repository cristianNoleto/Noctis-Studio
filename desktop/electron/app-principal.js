// Noctis Studio Desktop — processo principal do app (janela, bandeja, módulos, API local para IAs).
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
// Aberto pelo Windows ao iniciar ("Iniciar com o Windows"): fica só na bandeja.
const naBandeja = process.argv.includes('--bandeja');

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
  ctx.handlers[canal] = { fn, livre };
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
ctx.handlers = {};
// Mesmos handlers da interface, chamados por dentro (ex.: ferramentas do chat de IA).
ctx.invocar = async (canal, ...args) => {
  const h = ctx.handlers[canal];
  if (!h) throw new Error(`Canal desconhecido: ${canal}`);
  if (!h.livre && !ctx.auth.isSignedIn()) throw new Error('Entre com sua conta Noctis para usar o app.');
  return h.fn(...args);
};

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
  win.once('ready-to-show', () => { if (!naBandeja) win.show(); });
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

// Ícone na bandeja do Windows: aparece sempre que o app está aberto, com atalhos e o estado da fila.
const TELAS = [['Início', 'dashboard'], ['Meus Projetos', 'projetos'], ['Sincronizador SRT', 'srt'], ['Audio Atlas', 'audio-atlas'], ['Renomeador', 'renomeador'], ['Conectar IA', 'conectar-ia'], ['Contas', 'contas'], ['Logs', 'logs'], ['Configurações', 'config']];
function mostrarJanela() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function irPara(dados) { mostrarJanela(); ctx.send('app:navigate', dados); }

async function montarBandeja() {
  if (!tray) return;
  const logado = ctx.auth?.isSignedIn?.();
  let fila = null;
  if (logado && ctx.handlers['creator:queueStatus']) { try { fila = await ctx.handlers['creator:queueStatus'].fn(); } catch { fila = null; } }
  const up = ctx.atualizador?.info?.() || {};
  const textoFila = !fila ? null : fila.processing > 0 ? `Fila: gerando (${fila.pending + fila.processing} na fila)` : fila.paused ? `Fila: pausada (${fila.pending} na fila)` : `Fila: parada (${fila.pending} na fila)`;
  tray.setToolTip(`Noctis Studio ${app.getVersion()}${textoFila ? `\n${textoFila}` : ''}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Noctis Studio v${app.getVersion()}`, enabled: false },
    ...(textoFila ? [{ label: textoFila, enabled: false }] : []),
    { type: 'separator' },
    { label: 'Abrir Noctis Studio', click: mostrarJanela },
    { label: 'Ir para', enabled: !!logado, submenu: TELAS.map(([label, page]) => ({ label, click: () => irPara({ page }) })) },
    { label: 'Chat IA', enabled: !!logado, click: () => irPara({ chat: true }) },
    ...(logado && fila ? [fila.paused
      ? { label: 'Retomar fila', click: async () => { await ctx.invocar('creator:resume').catch(() => {}); montarBandeja(); } }
      : { label: 'Pausar fila', click: async () => { await ctx.invocar('creator:pause').catch(() => {}); montarBandeja(); } }] : []),
    { type: 'separator' },
    up.baixada
      ? { label: `Reiniciar e atualizar para ${up.baixada.version}`, click: () => ctx.atualizador.instalar() }
      : { label: 'Verificar atualizações', enabled: !!ctx.atualizador && app.isPackaged, click: () => ctx.atualizador.checar() },
    { label: 'Abrir pasta de logs', click: () => shell.openPath(path.join(app.getPath('userData'), 'logs')) },
    { type: 'separator' },
    { label: 'Sair do Noctis Studio', click: () => { quitting = true; app.quit(); } },
  ]));
}

function ensureTray() {
  if (tray) return;
  const caminho = process.platform === 'win32' && fs.existsSync(ICON.replace(/\.png$/, '.ico')) ? ICON.replace(/\.png$/, '.ico') : ICON;
  const img = fs.existsSync(caminho) ? nativeImage.createFromPath(caminho).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.on('click', mostrarJanela);
  tray.on('double-click', mostrarJanela);
  montarBandeja();
  setInterval(montarBandeja, 15000).unref?.();
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
  handle('auth:signout', (opts) => ctx.auth.signOut(opts || {}), { livre: true });
  handle('auth:signinPassword', (dados) => ctx.auth.signInPassword(dados || {}), { livre: true });
  handle('auth:signinSaved', () => ctx.auth.entrarSalvo(), { livre: true });
  handle('auth:forgetPassword', () => ctx.auth.esquecerSenha(), { livre: true });
  handle('auth:refresh', () => ctx.auth.refresh({ force: true }), { livre: true });

  handle('settings:get', () => ctx.store.get(), { livre: true });
  handle('settings:defaults', () => ctx.store.defaults());
  handle('settings:set', (patch) => {
    // "ia" (porta, chave, pastas liberadas) só muda pela tela Conectar IA (canais ia:*).
    const { ia: _ia, ...resto } = patch || {};
    const novo = ctx.store.set(resto);
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
    credFile: path.join(userData, 'conta-senha.bin'),
    safeStorage,
    openExternal: (u) => shell.openExternal(u),
    getSiteUrl: () => ctx.store.get().siteUrl,
    log,
    onChange: (s) => { ctx.send('auth', s); for (const fn of ctx.onAuth) fn(s); },
  });
  ctx.onAuth = [];

  // Atualização automática: baixa em segundo plano e instala ao fechar; popup de novidades na Início.
  let atualizador = null;
  try {
    const { autoUpdater } = require('electron-updater');
    const { criarAtualizador } = require('./lib/atualizacao');
    atualizador = criarAtualizador({
      ctx, autoUpdater, app, isPackaged: app.isPackaged,
      filaOcupada: async () => { const h = ctx.handlers['creator:queueStatus']; if (!h) return false; const f = await h.fn(); return (f?.processing || 0) > 0; },
    });
    ctx.atualizador = atualizador;
    atualizador.aoMudar(() => montarBandeja());
    atualizador.init();
    ctx.onAuth.push((s) => {
      if (s.status === 'signed_in') {
        atualizador.definirToken(ctx.auth.accessToken());
        if (ctx.store.get().autoUpdate !== false) atualizador.checar();
      }
    });
  } catch (e) { log.warn(`Atualização indisponível: ${e.message}`); }
  handle('app:update-state', () => (atualizador ? atualizador.estado() : { baixada: null, novidades: null, versao: app.getVersion() }), { livre: true });
  handle('app:update-install', () => (atualizador ? atualizador.instalar() : false), { livre: true });
  handle('app:update-check', async () => { if (atualizador) await atualizador.checar(); return true; }, { livre: true });

  registerCore();
  for (const mod of ['renomeador', 'audio-atlas', 'creator', 'srt', 'chat', 'ia']) {
    try { require(`./ipc/${mod}`)(ctx); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes(`ipc/${mod}`)) log.error(`Módulo ${mod}: ${e.message}`); }
  }

  createWindow();
  ensureTray();
  ctx.onAuth.push(() => montarBandeja());
  if (!app.isPackaged && process.env.NOCTIS_DEV_NO_LOGIN === '1') ctx.auth.devBypass();
  else ctx.auth.init();
});
