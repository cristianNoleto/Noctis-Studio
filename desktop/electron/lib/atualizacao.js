// Atualização automática do app (electron-updater + feed gated pelo site) e o popup de novidades
// na tela inicial. O feed /api/desktop/update exige a conta Noctis (mandamos o token no header),
// então só quem tem acesso atualiza — igual ao download.
//
// Fluxo: ao abrir e a cada 30 min (app empacotado), confere a versão; se houver nova, baixa em
// segundo plano e, com o app aberto, avisa e reinicia sozinho depois de 30 s para instalar —
// se houver geração em andamento na fila, espera ela terminar. Guardamos as notas da versão para
// mostrar "O que mudou" na próxima abertura.

// Notas da release podem vir como string ou lista [{version, note}].
function notasTexto(info) {
  const r = info?.releaseNotes;
  if (!r) return '';
  if (typeof r === 'string') return r.replace(/<[^>]+>/g, '').trim().slice(0, 4000);
  if (Array.isArray(r)) return r.map((x) => (typeof x === 'string' ? x : x?.note || '')).join('\n\n').replace(/<[^>]+>/g, '').trim().slice(0, 4000);
  return '';
}

// O que mostrar no popup de novidades ao abrir (função pura, fácil de testar).
// Só mostra quando a versão mudou E temos as notas daquela versão (não aparece na 1ª instalação).
function calcularNovidades({ versaoAtual, lastVersion, pending }) {
  if (!lastVersion || lastVersion === versaoAtual) return null;
  if (pending && pending.version === versaoAtual && pending.notes) return { version: versaoAtual, notes: pending.notes };
  return null;
}

function criarAtualizador({ ctx, autoUpdater, app, isPackaged, intervaloMs = 30 * 60 * 1000, esperaMs = 30 * 1000, filaOcupada = async () => false }) {
  const log = ctx.log;
  let token = null;
  const estado = { baixada: null, novidades: null, checando: false, versaoApp: app.getVersion(), instalarEm: null };
  let timerInstalar = null;
  let timerChecar = null;
  const aoMudar = [];
  const avisarMudanca = () => { for (const fn of aoMudar) { try { fn(); } catch { /* ignora */ } } };

  // Novidades desta abertura (pure), depois zera o marcador para não repetir.
  const up = ctx.store.get().update || {};
  estado.novidades = calcularNovidades({ versaoAtual: estado.versaoApp, lastVersion: up.lastVersion, pending: up.pending });
  ctx.store.set({ update: { lastVersion: estado.versaoApp, pending: estado.novidades ? null : up.pending || null } });

  function aplicarToken() { if (token) autoUpdater.requestHeaders = { Authorization: `Bearer ${token}` }; }
  function definirToken(t) { token = t || null; aplicarToken(); }

  function ligarEventos() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: (m) => log.info(`Atualização: ${m}`), warn: (m) => log.warn(`Atualização: ${m}`), error: (m) => log.warn(`Atualização: ${m}`), debug: () => {} };
    autoUpdater.on('checking-for-update', () => { estado.checando = true; });
    autoUpdater.on('update-not-available', () => { estado.checando = false; });
    autoUpdater.on('update-available', (info) => { log.info(`Atualização ${info?.version} disponível; baixando…`); });
    autoUpdater.on('download-progress', (p) => { ctx.send('app:update', { estado: 'baixando', percent: Math.round(p?.percent || 0) }); });
    autoUpdater.on('update-downloaded', (info) => {
      estado.checando = false;
      const notes = notasTexto(info);
      estado.baixada = { version: info?.version, notes };
      ctx.store.set({ update: { lastVersion: estado.versaoApp, pending: { version: info?.version, notes } } });
      log.success(`Atualização ${info?.version} baixada (será instalada ao fechar).`);
      ctx.send('app:update', { estado: 'baixada', version: info?.version, notes });
      ctx.notify?.('Noctis Studio', `Atualização ${info?.version} pronta. O app vai reiniciar em ${Math.round(esperaMs / 1000)} s para instalar.`);
      agendarInstalacao(esperaMs);
      avisarMudanca();
    });
    autoUpdater.on('error', (e) => { estado.checando = false; log.warn(`Atualização: ${e?.message || e}`); });
  }

  // Com o app aberto: contagem regressiva e reinício automático (espera a fila, se estiver gerando).
  function agendarInstalacao(ms) {
    clearTimeout(timerInstalar);
    estado.instalarEm = Date.now() + ms;
    ctx.send('app:update', { estado: 'reiniciando', version: estado.baixada?.version, segundos: Math.round(ms / 1000) });
    timerInstalar = setTimeout(tentarInstalar, ms);
    timerInstalar.unref?.();
  }
  async function tentarInstalar() {
    let ocupada = false;
    try { ocupada = await filaOcupada(); } catch { ocupada = false; }
    if (ocupada) {
      log.info('Atualização: esperando a geração em andamento terminar para reiniciar.');
      ctx.send('app:update', { estado: 'aguardando-fila', version: estado.baixada?.version });
      clearTimeout(timerInstalar);
      timerInstalar = setTimeout(tentarInstalar, 60 * 1000);
      timerInstalar.unref?.();
      return;
    }
    instalar();
  }
  function instalar() {
    try {
      log.info(`Atualização: reiniciando para instalar a ${estado.baixada?.version || 'nova versão'}…`);
      autoUpdater.quitAndInstall(true, true); // silencioso + abre de novo depois de instalar
      return true;
    } catch (e) { log.warn(`Atualização: ${e?.message || e}`); return false; }
  }

  async function checar() {
    if (!isPackaged) { log.info('Atualização: pulada em desenvolvimento.'); return null; }
    if (!token) { log.info('Atualização: aguardando login para checar.'); return null; }
    aplicarToken();
    try { return await autoUpdater.checkForUpdates(); } catch (e) { log.warn(`Atualização: ${e?.message || e}`); return null; }
  }

  return {
    init() {
      if (!isPackaged) return;
      ligarEventos();
      timerChecar = setInterval(() => { checar(); }, intervaloMs);
      timerChecar.unref?.();
    },
    aoMudar: (fn) => aoMudar.push(fn),
    info: () => ({ baixada: estado.baixada, versao: estado.versaoApp, instalarEm: estado.instalarEm }),
    checar,
    definirToken,
    instalar,
    // novidades só uma vez por abertura (o popup consome).
    estado() { const n = estado.novidades; estado.novidades = null; return { baixada: estado.baixada, novidades: n, versao: estado.versaoApp }; },
  };
}

module.exports = { notasTexto, calcularNovidades, criarAtualizador };
