// IPC do Chat IA (Claude Code e outros agentes de linha de comando).
const fs = require('fs');
const path = require('path');
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

  ctx.handle('chat:agents', async (forcar) => {
    if (!forcar && cacheAgentes && Date.now() - cacheAgentes.em < 30000) return cacheAgentes.lista;
    const lista = await Promise.all(Object.keys(agentes.AGENTES).map((id) => agentes.info(id).catch((e) => ({ id, nome: agentes.AGENTES[id].nome, instalado: false, erro: e.message }))));
    cacheAgentes = { em: Date.now(), lista };
    return lista;
  });
  ctx.handle('chat:install', (id) => {
    const a = agentes.AGENTES[id];
    if (!a) throw new Error('Agente desconhecido.');
    cacheAgentes = null;
    ctx.log.info(`Chat IA: abrindo terminal para instalar ${a.nome}`);
    if (!agentes.abrirTerminal(a.instalar)) throw new Error(`Não consegui abrir o terminal. Rode manualmente: ${a.instalar}`);
    return a.instalar;
  });
  ctx.handle('chat:login', (id) => {
    const a = agentes.AGENTES[id];
    if (!a) throw new Error('Agente desconhecido.');
    cacheAgentes = null;
    if (!agentes.abrirTerminal(a.entrar)) throw new Error(`Não consegui abrir o terminal. Rode manualmente: ${a.entrar}`);
    return a.entrar;
  });
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
