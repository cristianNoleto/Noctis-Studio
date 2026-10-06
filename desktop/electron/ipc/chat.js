// IPC do Chat IA (Claude Code, Codex, Grok e Antigravity).
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const agentes = require('../servicos/chat/agentes');
const { criarChat } = require('../servicos/chat/chat');

// O servidor MCP roda com o Node do Electron; fora do .asar no app instalado.
function caminhoMcp() {
  const p = path.join(__dirname, '..', 'servicos', 'chat', 'mcp-server.js');
  const fora = p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  return fs.existsSync(fora) ? fora : p;
}

module.exports = function registrar(ctx) {
  const chat = criarChat({ dir: path.join(ctx.dataDir, 'chat'), ctx, mcpScript: caminhoMcp() });
  let cacheAgentes = null;
  const cacheModelos = new Map();

  ctx.handle('chat:agents', async (forcar) => {
    if (!forcar && cacheAgentes && Date.now() - cacheAgentes.em < 30000) return cacheAgentes.lista;
    const lista = await Promise.all(Object.keys(agentes.AGENTES).map((id) => agentes.info(id).catch((e) => ({ id, nome: agentes.AGENTES[id].rotulo, instalado: false, erro: e.message }))));
    cacheAgentes = { em: Date.now(), lista };
    return lista;
  });
  ctx.handle('chat:models', async (id, forcar) => {
    const k = agentes.resolverId(id);
    const c = cacheModelos.get(k);
    if (!forcar && c && Date.now() - c.em < 60 * 60 * 1000) return c.dados;
    const dados = await agentes.modelos(k).catch(() => ({ modelos: [], esforcos: [], falhou: true }));
    cacheModelos.set(k, { em: Date.now(), dados });
    return dados;
  });
  ctx.handle('chat:command', (id) => agentes.comandoInstalacao(id));
  ctx.handle('chat:install', async (id) => {
    cacheAgentes = null;
    ctx.log.info(`Chat IA: instalando ${agentes.AGENTES[agentes.resolverId(id)]?.rotulo || id}`);
    const r = await agentes.instalar(id, { onLinha: (linha) => ctx.send('chat:event', { tipo: 'instalar', agente: agentes.resolverId(id), linha }) });
    ctx.send('chat:event', { tipo: 'instalar', agente: agentes.resolverId(id), fim: true, ok: r.ok, erro: r.erro });
    if (!r.ok && r.erro) throw new Error(r.erro);
    ctx.log.success(`Chat IA: ${agentes.AGENTES[agentes.resolverId(id)]?.rotulo} instalado`);
    return r;
  });
  ctx.handle('chat:installCancel', (id) => agentes.cancelarInstalacao(id));
  ctx.handle('chat:login', (id) => {
    cacheAgentes = null;
    const ag = agentes.resolverId(id);
    agentes.iniciarLogin(id, {
      onEvento: (e) => ctx.send('chat:event', { tipo: 'login', agente: ag, ...e }),
      abrirLink: (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); },
    });
    return true;
  });
  ctx.handle('chat:loginInput', (id, texto) => agentes.enviarLoginInput(id, texto));
  ctx.handle('chat:loginCancel', (id) => agentes.cancelarLogin(id));

  ctx.handle('chat:list', () => chat.listar());
  ctx.handle('chat:new', (opts) => chat.criar(opts));
  ctx.handle('chat:get', (id) => chat.obter(id));
  ctx.handle('chat:update', (id, campos) => chat.atualizar(id, campos));
  ctx.handle('chat:delete', (id) => chat.excluir(id));
  ctx.handle('chat:send', (id, texto) => chat.enviar(id, texto));
  ctx.handle('chat:stop', (id) => chat.parar(id));
  ctx.handle('chat:permission', (pedido, resposta) => chat.responder(pedido, resposta));
  ctx.handle('chat:tools', () => chat.ferramentas.definicoes().map((f) => ({ nome: f.name, descricao: f.description })));

  ctx.app.on('before-quit', () => chat.encerrar());
};
