// Núcleo do chat de IA: conversas salvas em disco, um turno por vez por conversa, e a montagem
// da mensagem do assistente a partir dos eventos dos drivers (claude, codex, grok, agy).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const agentes = require('./agentes');
const { criarPonte } = require('./ponte');
const { criarFerramentas } = require('./ferramentas');
const { criarDriverClaude } = require('./drivers/claude');
const { criarDriverCodex } = require('./drivers/codex');
const { criarDriverAgy } = require('./drivers/agy');
const { criarDriverAcp } = require('./drivers/acp');

const novoId = () => crypto.randomBytes(8).toString('hex');
const EDITORAS = new Set(['Edit', 'Write', 'MultiEdit', 'fileChange', 'apply_patch', 'write_file', 'edit_file']);

function criarChat({ dir, ctx, mcpScript, execPath = process.execPath, envAgente }) {
  const pastaConv = path.join(dir, 'conversas');
  fs.mkdirSync(pastaConv, { recursive: true });
  const ferramentas = criarFerramentas(ctx);
  const execucoes = new Map(); // conversa → { driver, msg, avisar }
  const pedidos = new Map(); // pedidoId → ponte: { tipo:'ponte', conversa, resolve } | driver: { tipo:'driver', conversa, agente, requestId }

  const arquivo = (id) => path.join(pastaConv, `${String(id).replace(/[^\w-]/g, '')}.json`);
  const ler = (id) => { try { return JSON.parse(fs.readFileSync(arquivo(id), 'utf8')); } catch { return null; } };
  const gravar = (c) => { c.atualizado = Date.now(); const tmp = `${arquivo(c.id)}.tmp`; fs.writeFileSync(tmp, JSON.stringify(c)); fs.renameSync(tmp, arquivo(c.id)); return c; };

  // ---------------------------------------------------------------- drivers
  const onEvento = (conversa, ev) => tratarEvento(conversa, ev);
  const decidir = (conversa, ferramenta) => {
    const c = ler(conversa); if (!c) return 'negar';
    if (c.sempre?.includes(ferramenta)) return 'aprovar';
    const modo = ctx.store.get().chat?.permissionMode || '';
    if (modo === 'bypassPermissions') return 'aprovar';
    if (modo === 'acceptEdits' && EDITORAS.has(ferramenta)) return 'aprovar';
    return 'perguntar';
  };
  const julgar = async ({ conversaId, ferramenta }) => ({ decisao: decidir(conversaId, ferramenta) });
  const spawnCli = (id, args, opts) => agentes.spawnCli(id, args, { ...opts, env: envAgente });
  const deps = { onEvento, julgar, spawnCli, userDataDir: ctx.dataDir };
  const drivers = { claude: criarDriverClaude(), codex: criarDriverCodex(), grok: criarDriverAcp('grok', 'Grok'), agy: criarDriverAgy() };
  for (const d of Object.values(drivers)) d.initDriver(deps);
  const driverDe = (agente) => drivers[agentes.resolverId(agente)] || drivers.claude;

  function listar() {
    return fs.readdirSync(pastaConv).filter((f) => f.endsWith('.json')).map((f) => {
      try { const c = JSON.parse(fs.readFileSync(path.join(pastaConv, f), 'utf8')); return { id: c.id, titulo: c.titulo, agente: c.agente, atualizado: c.atualizado, mensagens: c.mensagens.length, rodando: execucoes.has(c.id) }; } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.atualizado - a.atualizado);
  }
  function criar({ agente, cwd } = {}) {
    const cfg = ctx.store.get();
    const ag = agentes.resolverId(agente || cfg.chat?.agent || 'claude');
    if (!agentes.AGENTES[ag]) throw new Error('Agente desconhecido.');
    return gravar({ id: novoId(), titulo: 'Nova conversa', agente: ag, sessao: null, cwd: cwd || cfg.projectsRoot, sempre: [], criado: Date.now(), mensagens: [] });
  }
  function obter(id) {
    const c = ler(id); if (!c) throw new Error('Conversa não encontrada.');
    return { ...c, rodando: execucoes.has(id), pendentes: [...pedidos.entries()].filter(([, p]) => p.conversa === id).map(([pid]) => pid) };
  }
  function atualizar(id, campos = {}) {
    const c = ler(id); if (!c) throw new Error('Conversa não encontrada.');
    if (typeof campos.titulo === 'string') c.titulo = campos.titulo.trim().slice(0, 120) || c.titulo;
    if (typeof campos.cwd === 'string' && campos.cwd) c.cwd = campos.cwd;
    if (campos.agente && agentes.AGENTES[agentes.resolverId(campos.agente)] && agentes.resolverId(campos.agente) !== c.agente) { c.agente = agentes.resolverId(campos.agente); c.sessao = null; }
    return gravar(c);
  }
  function excluir(id) { parar(id); try { fs.unlinkSync(arquivo(id)); } catch { /* já foi */ } return listar(); }

  // ---------------------------------------------------------------- permissões
  const ponte = criarPonte({
    catalogo: () => ({ instrucoes: ferramentas.instrucoes, ferramentas: ferramentas.definicoes() }),
    executar: (nome, args) => ferramentas.executar(nome, args),
    aprovar: aprovarPonte,
    log: ctx.log,
  });

  async function aprovarPonte(pedido, conversa) {
    const nome = String(pedido.tool_name || '');
    const entrada = pedido.input || {};
    const decisao = decidir(conversa, nome);
    const permitir = { behavior: 'allow', updatedInput: entrada };
    if (decisao === 'aprovar') return permitir;
    if (decisao === 'negar') return { behavior: 'deny', message: 'Negado pela política do Noctis Studio.' };
    const id = novoId();
    pedidos.set(id, { tipo: 'ponte', conversa });
    const espera = new Promise((resolve) => { pedidos.get(id).resolve = resolve; });
    anexarPermissao(conversa, nome, entrada, id);
    const r = await espera;
    pedidos.delete(id);
    marcarPermissao(conversa, id, r.permitir ? 'permitido' : 'negado');
    if (r.permitir) { if (r.sempre) adicionarSempre(conversa, nome); return permitir; }
    return { behavior: 'deny', message: r.motivo ? `O usuário recusou: ${r.motivo}` : 'O usuário recusou esta ação.' };
  }

  function responder(pedidoId, { permitir, sempre, motivo } = {}) {
    const p = pedidos.get(pedidoId); if (!p) return false;
    if (p.tipo === 'ponte') { p.resolve({ permitir: !!permitir, sempre: !!sempre, motivo }); return true; }
    // driver (codex/grok)
    pedidos.delete(pedidoId);
    if (permitir && sempre) { const b = acharPermissao(p.conversa, pedidoId); if (b) adicionarSempre(p.conversa, b.nome); }
    marcarPermissao(p.conversa, pedidoId, permitir ? 'permitido' : 'negado');
    return driverDe(p.agente).responderPermissao(p.conversa, p.requestId, permitir ? 'aprovar' : 'negar');
  }

  function adicionarSempre(conversa, nome) { const c = ler(conversa); if (c && !c.sempre.includes(nome)) { c.sempre.push(nome); gravar(c); } }

  // ---------------------------------------------------------------- MCP config
  async function configMcp(conversa) {
    const url = await ponte.abrir();
    const f = path.join(dir, `mcp-${conversa}.json`);
    const cfg = { mcpServers: { noctis: { type: 'stdio', command: execPath, args: [mcpScript], env: { ELECTRON_RUN_AS_NODE: '1', NOCTIS_PONTE: url, NOCTIS_TOKEN: ponte.token, NOCTIS_EXEC: conversa } } } };
    fs.writeFileSync(f, JSON.stringify(cfg), { mode: 0o600 });
    return f;
  }

  // ---------------------------------------------------------------- montagem da mensagem
  function anexarPermissao(conversa, nome, entrada, id) {
    const ex = execucoes.get(conversa); if (!ex) return;
    const alvo = [...ex.msg.blocos].reverse().find((x) => x.k === 'ferramenta' && x.nome === nome && x.resultado === undefined && !x.permissao);
    if (alvo) alvo.permissao = { id, estado: 'pendente' };
    else ex.msg.blocos.push({ k: 'permissao', id, nome, entrada, estado: 'pendente' });
    ctx.send('chat:event', { conversa, tipo: 'permissao', pedido: { id, ferramenta: nome, entrada } });
    ctx.notify?.('Noctis Studio — Chat IA', `O agente quer usar: ${nome}`);
    ex.avisar(true);
  }
  function marcarPermissao(conversa, id, estado) { const ex = execucoes.get(conversa); if (!ex) return; for (const b of ex.msg.blocos) { if (b.k === 'permissao' && b.id === id) b.estado = estado; if (b.permissao?.id === id) b.permissao.estado = estado; } ex.avisar(true); }
  function acharPermissao(conversa, id) { const ex = execucoes.get(conversa); if (!ex) return null; for (const b of ex.msg.blocos) { if (b.k === 'permissao' && b.id === id) return b; if (b.permissao?.id === id) return b; } return null; }

  function tratarEvento(conversa, ev) {
    const ex = execucoes.get(conversa); if (!ex) return;
    const { msg, avisar } = ex;
    const fecharCorrente = () => { if (ex.corrente) ex.corrente.finalizado = true; ex.corrente = null; };
    switch (ev.tipo) {
      case 'sessao': { msg.modelo = ev.modelo || msg.modelo; if (ev.sessionId) { const c = ler(conversa); if (c) { c.sessao = ev.sessionId; gravar(c); } } const n = (ev.mcp || []).find((m) => m.nome === 'noctis'); if (n && n.status !== 'connected') ctx.log.warn(`Chat IA: ferramentas do Noctis indisponíveis (${n.status})`); break; }
      case 'texto-delta': { if (!ex.corrente || ex.corrente.k !== 'texto' || ex.corrente.finalizado) { ex.corrente = { k: 'texto', texto: '' }; msg.blocos.push(ex.corrente); } ex.corrente.texto += ev.texto; avisar(); break; }
      case 'pensando-delta': { if (!ex.corrente || ex.corrente.k !== 'pensando' || ex.corrente.finalizado) { ex.corrente = { k: 'pensando', texto: '' }; msg.blocos.push(ex.corrente); } ex.corrente.texto += ev.texto; avisar(); break; }
      case 'texto-final': { if (ex.corrente && ex.corrente.k === 'texto' && !ex.corrente.finalizado) { ex.corrente.texto = ev.texto; ex.corrente.finalizado = true; } else if (ev.texto) msg.blocos.push({ k: 'texto', texto: ev.texto, finalizado: true }); ex.corrente = null; avisar(true); break; }
      case 'pensando-final': { if (ex.corrente && ex.corrente.k === 'pensando' && !ex.corrente.finalizado) { ex.corrente.texto = ev.texto; ex.corrente.finalizado = true; ex.corrente = null; } else if (ev.texto) msg.blocos.push({ k: 'pensando', texto: ev.texto, finalizado: true }); avisar(true); break; }
      case 'ferramenta-inicio': break; // o bloco é criado no evento 'ferramenta'
      case 'ferramenta': { fecharCorrente(); let b = ev.id ? msg.blocos.find((x) => x.k === 'ferramenta' && x.id === ev.id) : null; if (!b) { b = { k: 'ferramenta', id: ev.id, nome: ev.nome, entrada: ev.entrada || {} }; msg.blocos.push(b); } else if (ev.entrada) b.entrada = ev.entrada; ex.ultimaFerramenta = b; avisar(true); break; }
      case 'ferramenta-resultado': { const b = msg.blocos.find((x) => x.k === 'ferramenta' && x.id === ev.id); if (b) { b.resultado = ev.texto; b.erro = ev.erro; } avisar(true); break; }
      case 'ferramenta-fim': { const b = ex.ultimaFerramenta && ex.ultimaFerramenta.resultado === undefined ? ex.ultimaFerramenta : [...msg.blocos].reverse().find((x) => x.k === 'ferramenta' && x.nome === ev.nome && x.resultado === undefined); if (b && b.resultado === undefined) { b.resultado = ev.erro ? '(falhou)' : ''; b.erro = ev.erro; } avisar(true); break; }
      case 'ferramenta-negada': { const b = [...msg.blocos].reverse().find((x) => x.k === 'ferramenta' && x.nome === ev.nome && !x.permissao?.estado); if (b) { b.negada = true; b.motivo = ev.motivo; } else msg.blocos.push({ k: 'ferramenta', nome: ev.nome, negada: true, motivo: ev.motivo }); avisar(true); break; }
      case 'pedido-permissao': { const pid = `${conversa}:${ev.requestId}`; pedidos.set(pid, { tipo: 'driver', conversa, agente: ler(conversa)?.agente, requestId: ev.requestId }); anexarPermissao(conversa, ev.ferramenta, ev.entrada || {}, pid); break; }
      case 'permissao-cancelada': { const pid = `${conversa}:${ev.requestId}`; if (pedidos.delete(pid)) marcarPermissao(conversa, pid, 'cancelado'); break; }
      case 'silencio': break;
      case 'resume-falhou': break;
      case 'interrompido': if (!msg.fim) { msg.fim = { motivo: 'parado' }; avisar(true); } break;
      case 'resultado': { fecharCorrente(); msg.fim = { erro: ev.isError, motivo: ev.interrompido ? 'parado' : ev.isError ? 'erro' : 'ok', custo: ev.custoUsd, duracaoMs: ev.duracaoMs, turnos: ev.turnos, truncada: ev.truncada }; if (!msg.blocos.some((b) => b.k === 'texto' && b.texto.trim()) && ev.texto) msg.blocos.push({ k: 'texto', texto: ev.texto, finalizado: true }); if (ev.sessionId) { const c = ler(conversa); if (c) { c.sessao = ev.sessionId; gravar(c); } } finalizar(conversa); break; }
      case 'erro': { fecharCorrente(); msg.blocos.push({ k: 'erro', texto: ev.mensagem + (ev.detalhe ? `\n${String(ev.detalhe).slice(0, 400)}` : '') }); msg.fim = { erro: true, motivo: 'erro' }; finalizar(conversa); break; }
      default: break;
    }
  }

  function finalizar(conversa) {
    const ex = execucoes.get(conversa); if (!ex || ex.finalizado) return; ex.finalizado = true;
    execucoes.delete(conversa);
    for (const [pid, p] of pedidos) if (p.conversa === conversa) { if (p.tipo === 'ponte') p.resolve?.({ permitir: false }); pedidos.delete(pid); }
    if (ex.mcpConfig) { try { fs.unlinkSync(ex.mcpConfig); } catch { /* já foi */ } }
    const c = ler(conversa); if (c) { const i = c.mensagens.findIndex((m) => m.id === ex.msg.id); if (i >= 0) c.mensagens[i] = ex.msg; gravar(c); }
    if (ex.msg.fim?.erro) ctx.log.warn(`Chat IA: ${ex.msg.blocos.filter((b) => b.k === 'erro').map((b) => b.texto).join(' ').slice(0, 300)}`);
    if (ex.timer) clearTimeout(ex.timer);
    ctx.send('chat:event', { conversa, tipo: 'fim', msg: ex.msg });
  }

  // ---------------------------------------------------------------- envio
  async function enviar(conversa, texto) {
    texto = String(texto || '').trim();
    if (!texto) throw new Error('Escreva uma mensagem.');
    if (execucoes.has(conversa)) throw new Error('Espere a resposta atual terminar (ou pare).');
    const c = ler(conversa); if (!c) throw new Error('Conversa não encontrada.');
    const def = agentes.AGENTES[c.agente]; if (!def) throw new Error('Agente desconhecido.');
    const exe = agentes.localizar(def.bin, { env: envAgente || agentes.ambiente() });
    if (!exe) throw new Error(`${def.rotulo} não está instalado neste computador. Use o botão "Instalar" no chat.`);
    const cfgChat = ctx.store.get().chat || {};
    const perAg = (cfgChat.agentes && cfgChat.agentes[c.agente]) || {};
    const modelo = agentes.validarModelo(c.agente, perAg.model);
    const esforco = agentes.validarEsforco(c.agente, perAg.effort);

    c.mensagens.push({ id: novoId(), papel: 'user', texto, quando: Date.now() });
    if (c.titulo === 'Nova conversa') c.titulo = texto.replace(/\s+/g, ' ').slice(0, 60);
    const msg = { id: novoId(), papel: 'assistant', agente: c.agente, blocos: [], quando: Date.now(), fim: null };
    c.mensagens.push(msg); gravar(c);

    const ex = { driver: driverDe(c.agente), msg, corrente: null, ultimaFerramenta: null, finalizado: false, timer: null };
    const emitirMsg = () => { ex.timer = null; ctx.send('chat:event', { conversa, tipo: 'msg', msg }); };
    ex.avisar = (ja) => { if (ja) { if (ex.timer) clearTimeout(ex.timer); emitirMsg(); } else if (!ex.timer) ex.timer = setTimeout(emitirMsg, 60); };
    const avisar = ex.avisar;
    execucoes.set(conversa, ex);

    const mcpConfig = await configMcp(conversa); ex.mcpConfig = mcpConfig;
    ctx.send('chat:event', { conversa, tipo: 'inicio', msg });
    ctx.log.info(`Chat IA (${def.rotulo}): nova mensagem`);
    try {
      await ex.driver.enviarMensagem({
        conversaId: conversa, texto, cwd: c.cwd, model: modelo || '', effort: esforco || '',
        mcpConfigPath: mcpConfig, cliSessionId: c.sessao || null, preambuloSistema: ferramentas.instrucoes,
        permissao: c.agente === 'claude' ? cfgChat.permissionMode || '' : '',
        permitidas: c.agente === 'claude' && mcpConfig ? ferramentas.leitura().map((n) => `mcp__noctis__${n}`) : [],
      });
    } catch (e) { tratarEvento(conversa, { tipo: 'erro', mensagem: e.message }); }
    return { mensagem: msg.id };
  }

  function parar(conversa) {
    const ex = execucoes.get(conversa);
    if (ex) ex.driver.interromper(conversa);
    else { for (const d of Object.values(drivers)) if (d.turnoAtivo(conversa)) d.interromper(conversa); }
    return !!ex;
  }
  function encerrar() { for (const d of Object.values(drivers)) try { d.encerrarTudo(); } catch { /* ok */ } ponte.fechar(); }

  return { listar, criar, obter, atualizar, excluir, enviar, parar, responder, encerrar, ferramentas, ponte };
}

module.exports = { criarChat };
