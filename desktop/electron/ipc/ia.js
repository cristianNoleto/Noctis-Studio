// "Conectar IA": API local (127.0.0.1) + MCP noctis-studio + guia + migração dos apps antigos.
// O núcleo é o MESMO usado pelo MCP e pelos testes (servicos/ia/nucleo.js).
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { dialog, shell } = require('electron');
const lib = require('../servicos/audio-atlas/library');
const pixabay = require('../servicos/audio-atlas/pixabay');
const { translate } = require('../servicos/audio-atlas/translate');
const ren = require('../servicos/renomeador');
const { criarNucleo } = require('../servicos/ia/nucleo');
const { criarApiLocal, novaChave, PORTA_PADRAO } = require('../servicos/ia/api-local');
const amb = require('../servicos/ia/ambiente');
const claude = require('../servicos/ia/claude-config');
const { migrar } = require('../servicos/ia/migracao');
const { FERRAMENTAS } = require('../servicos/ia/ferramentas-ia');

const ESCRITA = new Set(['download_audio', 'set_sound_folder', 'apply_rename', 'undo_rename']);

module.exports = function registrar(ctx) {
  const { app } = ctx;
  const dataDir = ctx.dataDir;
  const versao = app.getVersion();

  // Chave criada na primeira vez (32 bytes aleatórios), porta padrão 47821.
  const cfgIa = () => ctx.store.get().ia || {};
  if (!cfgIa().chave) ctx.store.set({ ia: { chave: novaChave() } });
  if (!cfgIa().porta) ctx.store.set({ ia: { porta: PORTA_PADRAO } });

  amb.ligarLimitador(pixabay, dataDir);

  const nucleoBase = criarNucleo({
    lib, pixabay, translate, ren, config: ctx.store, dataDir, documentsDir: app.getPath('documents'),
  });
  // Mesmo núcleo, com registro nos Logs do que muda arquivos/pastas.
  const nucleo = Object.fromEntries(FERRAMENTAS.map(({ name }) => [name, async (args) => {
    try {
      const r = await nucleoBase[name](args);
      if (ESCRITA.has(name)) ctx.log.info(`IA (${name}): ${resumo(name, r)}`);
      if (r?.notice) ctx.log.info(`IA: ${r.notice}`);
      if (name === 'set_sound_folder' || r?.notice) ctx.send('settings', ctx.store.get());
      return r;
    } catch (e) {
      ctx.log.warn(`IA (${name}): ${e.message}`);
      throw e;
    }
  }]));
  function resumo(name, r) {
    if (name === 'download_audio') return r.duplicate ? `já estava baixado → ${r.path}` : `baixado → ${r.path}`;
    if (name === 'set_sound_folder') return `pasta do banco de sons → ${r.root}`;
    if (name === 'apply_rename') return `${r.renamed} arquivo(s) renomeado(s) em ${r.folder} (operação ${r.operationId})`;
    if (name === 'undo_rename') return `operação ${r.operationId} desfeita (${r.restored} arquivo(s))`;
    return 'ok';
  }

  // ---------------------------------------------------------------- guia
  const caminhoGuia = () => (app.isPackaged ? path.join(process.resourcesPath, 'NOCTIS-STUDIO-PARA-IAS.md') : path.join(ctx.root, '..', 'NOCTIS-STUDIO-PARA-IAS.md'));
  const lerGuia = () => { try { return fs.readFileSync(caminhoGuia(), 'utf8'); } catch { return '# Noctis Studio para IAs\n\nGuia não encontrado nesta instalação.'; } };

  // ---------------------------------------------------------------- API local
  const api = criarApiLocal({ nucleo, getConfig: () => ctx.store.get(), versao, guia: lerGuia, acessoOk: () => ctx.auth.isSignedIn(), log: ctx.log });
  let estadoApi = api.estado();
  const iniciarApi = async () => { estadoApi = await api.iniciar(Number(cfgIa().porta) || PORTA_PADRAO); if (estadoApi.ativa) ctx.log.info(`API local para IAs em http://127.0.0.1:${estadoApi.porta}`); ctx.send('ia:estado', estadoApi); return estadoApi; };
  iniciarApi();
  app.on('before-quit', () => api.parar());

  // ---------------------------------------------------------------- acesso (MCP com o app fechado)
  const marcarAcesso = (s) => {
    try {
      if (s?.status === 'signed_in') amb.gravarAcesso(dataDir, { email: s.user?.email || '', documentsDir: app.getPath('documents'), exe: process.execPath, versao });
      else if (s?.status === 'signed_out' && !/conex|internet/i.test(s.error || '')) amb.apagarAcesso(dataDir); // sem internet: mantém até vencer
    } catch (e) { ctx.log.warn(`Acesso das IAs: ${e.message}`); }
  };
  ctx.onAuth.push(marcarAcesso);

  // ---------------------------------------------------------------- iniciar com o Windows
  const aplicarInicio = (ligado) => {
    if (!app.isPackaged) return;
    try { app.setLoginItemSettings({ openAtLogin: !!ligado, args: ['--bandeja'] }); } catch (e) { ctx.log.warn(`Iniciar com o Windows: ${e.message}`); }
  };
  aplicarInicio(cfgIa().iniciarComWindows);

  // ---------------------------------------------------------------- migração (idempotente)
  let ultimaMigracao = null;
  const rodarMigracao = () => {
    try {
      ultimaMigracao = migrar({ dataDir, store: ctx.store, lib, historicoDir: ren.historico() || path.join(dataDir, 'renomeador', 'historico') });
      if (ultimaMigracao.audioAtlas?.pasta) ctx.log.info(`Migração: pasta do banco de sons do Audio Atlas → ${ultimaMigracao.audioAtlas.pasta}`);
      if (ultimaMigracao.renomeador?.copiados) ctx.log.info(`Migração: ${ultimaMigracao.renomeador.copiados} operação(ões) do Renomeador antigo importada(s)`);
      if (ultimaMigracao.audioAtlas?.pasta) { lib.setConfig({ root: ultimaMigracao.audioAtlas.pasta }); ctx.send('settings', ctx.store.get()); }
    } catch (e) { ultimaMigracao = { erro: e.message }; ctx.log.warn(`Migração dos apps antigos: ${e.message}`); }
    return ultimaMigracao;
  };
  rodarMigracao();

  // ---------------------------------------------------------------- conexão com o Claude
  const bloco = () => claude.blocoMcp({ exe: process.execPath, resourcesPath: process.resourcesPath, raiz: ctx.root, empacotado: app.isPackaged });
  const arquivoClaude = () => claude.escolherArquivo();

  function estado() {
    const c = cfgIa();
    const b = bloco();
    return {
      api: estadoApi, porta: Number(c.porta) || PORTA_PADRAO, chave: c.chave,
      pastasRenomear: c.pastasRenomear || [], iniciarComWindows: !!c.iniciarComWindows,
      raizSons: ctx.store.get().audioAtlas?.root || '',
      mcp: { bloco: b, json: claude.jsonDesktop(b), comandoClaudeCode: claude.comandoClaudeCode(b) },
      claude: claude.situacao(arquivoClaude(), b),
      logMcp: path.join(process.env.APPDATA || '', 'Claude', 'logs', 'mcp-server-noctis-studio.log'),
      guia: caminhoGuia(),
      migracao: ultimaMigracao,
    };
  }

  function pedirLocal(rota, chave) {
    const porta = estadoApi.porta;
    return new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: porta, path: rota, timeout: 5000, headers: { Host: `127.0.0.1:${porta}`, ...(chave ? { 'X-API-Key': chave } : {}) } }, (res) => {
        let t = '';
        res.on('data', (c) => { t += c; });
        res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { /* */ } resolve({ status: res.statusCode, json: j }); });
      });
      req.on('timeout', () => req.destroy(new Error('sem resposta')));
      req.on('error', (e) => resolve({ status: 0, erro: e.message }));
      req.end();
    });
  }

  // Abre o MCP como o Claude abriria: initialize + tools/list.
  function testarMcp() {
    return new Promise((resolve) => {
      const b = bloco();
      const p = spawn(b.command, b.args, { env: { ...process.env, ...b.env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let buf = '';
      const respostas = {};
      const fim = (r) => { clearTimeout(t); try { p.kill(); } catch { /* */ } resolve(r); };
      const t = setTimeout(() => fim({ ok: false, erro: 'O MCP não respondeu em 15 s.' }), 15000);
      p.on('error', (e) => fim({ ok: false, erro: e.message }));
      p.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const linha = buf.slice(0, i); buf = buf.slice(i + 1);
          try { const m = JSON.parse(linha); respostas[m.id] = m; } catch { return fim({ ok: false, erro: `Saída inválida no stdout do MCP: ${linha.slice(0, 120)}` }); }
          if (respostas[2]) {
            const tools = respostas[2].result?.tools || [];
            fim({ ok: !!respostas[1]?.result && tools.length > 0, servidor: respostas[1]?.result?.serverInfo, ferramentas: tools.map((x) => x.name) });
          }
        }
      });
      const env = (m) => p.stdin.write(`${JSON.stringify(m)}\n`);
      env({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'noctis-teste', version: '1' } } });
      env({ jsonrpc: '2.0', method: 'notifications/initialized' });
      env({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    });
  }

  const h = ctx.handle;
  h('ia:estado', () => estado());
  h('ia:salvar', async (patch = {}) => {
    const atual = cfgIa();
    const novo = {};
    if (patch.porta !== undefined) {
      const porta = Number(patch.porta);
      if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) throw new Error('Porta inválida (use um número entre 1024 e 65535).');
      novo.porta = porta;
    }
    if (patch.iniciarComWindows !== undefined) novo.iniciarComWindows = !!patch.iniciarComWindows;
    ctx.store.set({ ia: novo });
    if (novo.iniciarComWindows !== undefined) aplicarInicio(novo.iniciarComWindows);
    if (novo.porta !== undefined && (novo.porta !== Number(atual.porta) || !estadoApi.ativa)) await iniciarApi();
    return estado();
  });
  h('ia:reiniciarApi', async () => { await iniciarApi(); return estado(); });
  h('ia:regenerarChave', () => { ctx.store.set({ ia: { chave: novaChave() } }); ctx.log.info('API local: chave regenerada (a antiga deixou de valer).'); return estado(); });
  h('ia:adicionarPasta', async () => {
    const r = await dialog.showOpenDialog(ctx.win(), { title: 'Liberar pasta para IAs renomearem arquivos', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return estado();
    const lista = [...new Set([...(cfgIa().pastasRenomear || []), r.filePaths[0]])];
    ctx.store.set({ ia: { pastasRenomear: lista } });
    ctx.log.info(`IA: pasta liberada para renomear → ${r.filePaths[0]}`);
    return estado();
  });
  h('ia:removerPasta', (p) => { ctx.store.set({ ia: { pastasRenomear: (cfgIa().pastasRenomear || []).filter((x) => x !== p) } }); return estado(); });
  h('ia:escolherPastaSons', async () => {
    const r = await dialog.showOpenDialog(ctx.win(), { title: 'Pasta do banco de sons', defaultPath: ctx.store.get().audioAtlas?.root || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return estado();
    ctx.store.set({ audioAtlas: { root: r.filePaths[0] } });
    for (const fn of ctx.onSettings) fn(ctx.store.get());
    ctx.send('settings', ctx.store.get());
    return estado();
  });
  h('ia:claudeAdicionar', () => {
    const r = claude.adicionar(arquivoClaude(), bloco());
    ctx.log.success(`Claude Desktop: "noctis-studio" adicionado em ${r.arquivo}${r.removeuAntigo ? ' (entrada antiga "audio-atlas" removida)' : ''}${r.backup ? `; backup em ${r.backup}` : ''}`);
    return { ...r, estado: estado() };
  });
  h('ia:testar', async () => {
    const chave = cfgIa().chave;
    const saude = await pedirLocal('/api/health');
    const categorias = saude.status === 200 ? await pedirLocal('/api/categories', chave) : null;
    const mcp = await testarMcp();
    const c = claude.situacao(arquivoClaude(), bloco());
    return {
      api: { ok: saude.status === 200, porta: estadoApi.porta, erro: saude.erro || (estadoApi.erro === 'porta-ocupada' ? `A porta ${estadoApi.porta} está ocupada por outro programa.` : estadoApi.erro) },
      categorias: categorias ? { ok: categorias.status === 200, status: categorias.status, root: categorias.json?.root, total: categorias.json?.categories?.length, erro: categorias.json?.error?.message } : null,
      mcp,
      claude: c,
      avisos: [
        ...(c.temAudioAtlas ? ['O arquivo do Claude Desktop ainda tem o "audio-atlas" antigo: troque pelo "noctis-studio" (botão "Adicionar automaticamente").'] : []),
        ...(!c.temNoctis ? ['O Claude Desktop ainda não tem o "noctis-studio" configurado.'] : []),
        ...(c.temNoctis && !c.noctisAtualizado ? ['O "noctis-studio" do Claude aponta para outro caminho: clique em "Adicionar automaticamente" para atualizar.'] : []),
      ],
    };
  });
  h('ia:exportarGuia', async ({ incluirChave } = {}) => {
    const r = await dialog.showSaveDialog(ctx.win(), { title: 'Exportar guia para IAs', defaultPath: path.join(app.getPath('documents'), 'NOCTIS-STUDIO-PARA-IAS.md'), filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (r.canceled || !r.filePath) return null;
    let txt = lerGuia();
    const porta = estadoApi.porta || cfgIa().porta;
    const conexao = [`## Sua conexão (gerado pelo Noctis Studio ${versao})`, '', `- API local: \`http://127.0.0.1:${porta}\``,
      incluirChave ? `- Chave (X-API-Key): \`${cfgIa().chave}\` — guarde em segredo; regenere em Configurações > IAs se vazar.` : '- Chave (X-API-Key): copie em Noctis Studio > Configurações > IAs (não incluída neste arquivo).',
      `- MCP (Claude Desktop):`, '', '```json', claude.jsonDesktop(bloco()), '```', ''].join('\n');
    txt = txt.replace(/\n## /, `\n${conexao}\n## `);
    fs.writeFileSync(r.filePath, txt);
    return r.filePath;
  });
  h('ia:migrar', () => rodarMigracao());
  h('ia:abrirNavegador', (rota = '/') => { if (estadoApi.ativa && ['/', '/api/guide'].includes(rota)) shell.openExternal(`http://127.0.0.1:${estadoApi.porta}${rota}`); return true; });
  h('ia:abrirConfigClaude', () => { const a = arquivoClaude(); if (fs.existsSync(a)) shell.showItemInFolder(a); else shell.openPath(path.dirname(a)); return true; });
  h('ia:abrirLogMcp', () => { const p = estado().logMcp; if (fs.existsSync(p)) shell.showItemInFolder(p); else shell.openPath(path.dirname(p)); return true; });
};
