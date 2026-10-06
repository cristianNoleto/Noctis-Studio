// Núcleo do chat de IA: conversas salvas em disco, um turno por vez por conversa, mensagens do
// assistente montadas a partir dos eventos do agente e pedidos de permissão respondidos na tela.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const agentes = require('./agentes');
const { criarPonte } = require('./ponte');
const { criarFerramentas } = require('./ferramentas');

const novoId = () => crypto.randomBytes(8).toString('hex');

function criarChat({ dir, ctx, mcpScript, execPath = process.execPath, envAgente, localizar = agentes.localizar }) {
  const pastaConv = path.join(dir, 'conversas');
  fs.mkdirSync(pastaConv, { recursive: true });
  const ferramentas = criarFerramentas(ctx);
  const execucoes = new Map(); // conversa → { parar, msg }
  const pedidos = new Map(); // pedidoId → { conversa, resolve, entrada, ferramenta }

  const arquivo = (id) => path.join(pastaConv, `${String(id).replace(/[^\w-]/g, '')}.json`);
  const ler = (id) => { try { return JSON.parse(fs.readFileSync(arquivo(id), 'utf8')); } catch { return null; } };
  const gravar = (c) => { c.atualizado = Date.now(); const tmp = `${arquivo(c.id)}.tmp`; fs.writeFileSync(tmp, JSON.stringify(c)); fs.renameSync(tmp, arquivo(c.id)); return c; };

  function listar() {
    return fs.readdirSync(pastaConv).filter((f) => f.endsWith('.json')).map((f) => {
      try { const c = JSON.parse(fs.readFileSync(path.join(pastaConv, f), 'utf8')); return { id: c.id, titulo: c.titulo, agente: c.agente, atualizado: c.atualizado, mensagens: c.mensagens.length, rodando: execucoes.has(c.id) }; } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.atualizado - a.atualizado);
  }

  function criar({ agente, cwd } = {}) {
    const cfg = ctx.store.get();
    const ag = agente || cfg.chat?.agent || 'claude';
    if (!agentes.AGENTES[ag]) throw new Error('Agente desconhecido.');
    return gravar({ id: novoId(), titulo: 'Nova conversa', agente: ag, sessao: null, cwd: cwd || cfg.projectsRoot, sempre: [], criado: Date.now(), mensagens: [] });
  }

  function obter(id) {
    const c = ler(id);
    if (!c) throw new Error('Conversa não encontrada.');
    return { ...c, rodando: execucoes.has(id), pendentes: [...pedidos.entries()].filter(([, p]) => p.conversa === id).map(([pid, p]) => ({ id: pid, ferramenta: p.ferramenta, entrada: p.entrada })) };
  }

  function atualizar(id, campos = {}) {
    const c = ler(id);
    if (!c) throw new Error('Conversa não encontrada.');
    if (typeof campos.titulo === 'string') c.titulo = campos.titulo.trim().slice(0, 120) || c.titulo;
    if (typeof campos.cwd === 'string' && campos.cwd) { c.cwd = campos.cwd; }
    if (campos.agente && agentes.AGENTES[campos.agente] && campos.agente !== c.agente) { c.agente = campos.agente; c.sessao = null; }
    return gravar(c);
  }

  function excluir(id) {
    parar(id);
    try { fs.unlinkSync(arquivo(id)); } catch { /* já não existe */ }
    return listar();
  }

  // ---------------------------------------------------------------- ponte + permissões
  async function aprovar(pedido, conversa) {
    const nome = String(pedido.tool_name || '');
    const entrada = pedido.input || {};
    const c = ler(conversa);
    const permitir = { behavior: 'allow', updatedInput: entrada };
    if (c && c.sempre.includes(nome)) return permitir;
    const id = novoId();
    const exec = execucoes.get(conversa);
    let alvo = null;
    if (exec) {
      alvo = [...exec.msg.blocos].reverse().find((x) => x.k === 'ferramenta' && x.nome === nome && x.resultado === undefined && !x.permissao);
      if (alvo) alvo.permissao = { id, estado: 'pendente' };
      else { alvo = { k: 'permissao', id, ferramenta: nome, entrada, estado: 'pendente' }; exec.msg.blocos.push(alvo); }
      exec.avisar(true);
    }
    ctx.send('chat:event', { conversa, tipo: 'permissao', pedido: { id, ferramenta: nome, entrada } });
    ctx.notify?.('Noctis Studio — Chat IA', `O agente quer usar: ${nome}`);
    const resposta = await new Promise((resolve) => pedidos.set(id, { conversa, resolve, entrada, ferramenta: nome }));
    pedidos.delete(id);
    if (alvo) { (alvo.permissao || alvo).estado = resposta.permitir ? 'permitido' : 'negado'; exec.avisar(true); }
    if (resposta.permitir) {
      if (resposta.sempre && c) { const atual = ler(conversa); if (atual && !atual.sempre.includes(nome)) { atual.sempre.push(nome); gravar(atual); } }
      return permitir;
    }
    return { behavior: 'deny', message: resposta.motivo ? `O usuário recusou: ${resposta.motivo}` : 'O usuário recusou esta ação.' };
  }

  function responder(pedidoId, { permitir, sempre, motivo } = {}) {
    const p = pedidos.get(pedidoId);
    if (!p) return false;
    p.resolve({ permitir: !!permitir, sempre: !!sempre, motivo });
    return true;
  }

  const ponte = criarPonte({
    catalogo: () => ({ instrucoes: ferramentas.instrucoes, ferramentas: ferramentas.definicoes() }),
    executar: (nome, args) => ferramentas.executar(nome, args),
    aprovar,
    log: ctx.log,
  });

  async function configMcp(conversa) {
    const url = await ponte.abrir();
    const f = path.join(dir, `mcp-${conversa}.json`);
    const cfg = { mcpServers: { noctis: { type: 'stdio', command: execPath, args: [mcpScript], env: { ELECTRON_RUN_AS_NODE: '1', NOCTIS_PONTE: url, NOCTIS_TOKEN: ponte.token, NOCTIS_EXEC: conversa } } } };
    fs.writeFileSync(f, JSON.stringify(cfg), { mode: 0o600 });
    return f;
  }

  // ---------------------------------------------------------------- turno
  async function enviar(conversa, texto) {
    texto = String(texto || '').trim();
    if (!texto) throw new Error('Escreva uma mensagem.');
    if (execucoes.has(conversa)) throw new Error('Espere a resposta atual terminar (ou pare).');
    const c = ler(conversa);
    if (!c) throw new Error('Conversa não encontrada.');
    const def = agentes.AGENTES[c.agente];
    const exe = localizar(def.bin, { env: envAgente || agentes.ambiente() });
    if (!exe) throw new Error(`${def.nome} não está instalado neste computador. Use o botão "Instalar" no chat.`);
    const cfg = ctx.store.get().chat || {};

    const historico = c.mensagens.map((m) => ({ papel: m.papel, texto: m.papel === 'user' ? m.texto : (m.blocos || []).filter((b) => b.k === 'texto').map((b) => b.texto).join('\n') }));
    c.mensagens.push({ id: novoId(), papel: 'user', texto, quando: Date.now() });
    if (c.titulo === 'Nova conversa') c.titulo = texto.replace(/\s+/g, ' ').slice(0, 60);
    const msg = { id: novoId(), papel: 'assistant', agente: c.agente, blocos: [], quando: Date.now(), fim: null };
    c.mensagens.push(msg);
    gravar(c);

    // Blocos de texto/pensamento por mensagem do modelo. O streaming chega por índice; a mensagem
    // completa pode vir quebrada (um evento por bloco), então casamos pelo tipo, em ordem.
    const porMsg = new Map(); // msgId → { porIndice: Map, lista: [] }
    const doMsg = (id) => { let m = porMsg.get(id); if (!m) { m = { porIndice: new Map(), lista: [] }; porMsg.set(id, m); } return m; };
    let timer = null;
    const emitirMsg = () => { timer = null; ctx.send('chat:event', { conversa, tipo: 'msg', msg }); };
    const avisar = (ja) => { if (ja) { if (timer) clearTimeout(timer); emitirMsg(); } else if (!timer) timer = setTimeout(emitirMsg, 60); };

    function onEvento(e) {
      if (e.tipo === 'sessao') {
        msg.modelo = e.modelo;
        if (e.sessao) { const atual = ler(conversa); if (atual) { atual.sessao = e.sessao; gravar(atual); } }
        const noctis = (e.mcp || []).find((m) => m.nome === 'noctis');
        if (noctis && noctis.status !== 'connected') ctx.log.warn(`Chat IA: ferramentas do Noctis indisponíveis (${noctis.status})`);
      } else if (e.tipo === 'texto' || e.tipo === 'pensando') {
        const m = doMsg(e.msg);
        let b = m.porIndice.get(e.bloco);
        if (!b) { b = { k: e.tipo, texto: '' }; m.porIndice.set(e.bloco, b); m.lista.push(b); msg.blocos.push(b); }
        b.texto += e.delta;
        avisar();
      } else if (e.tipo === 'mensagem') {
        const m = doMsg(e.msg);
        for (const bl of e.blocos) {
          if (bl.tipo === 'ferramenta') { if (!msg.blocos.some((x) => x.k === 'ferramenta' && x.id === bl.id)) msg.blocos.push({ k: 'ferramenta', id: bl.id, nome: bl.nome, entrada: bl.entrada }); continue; }
          let b = m.lista.find((x) => x.k === bl.tipo && !x.final);
          if (!b) { b = { k: bl.tipo, texto: '' }; m.lista.push(b); msg.blocos.push(b); }
          b.texto = bl.texto;
          b.final = true;
        }
        avisar(true);
      } else if (e.tipo === 'resultado') {
        const b = msg.blocos.find((x) => x.k === 'ferramenta' && x.id === e.id);
        if (b) { b.resultado = e.texto; b.erro = e.erro; }
        avisar(true);
      } else if (e.tipo === 'atividade') {
        let b = msg.blocos.find((x) => x.k === 'atividade');
        if (!b) { b = { k: 'atividade', texto: '' }; msg.blocos.unshift(b); }
        b.texto = (b.texto + e.texto).slice(-6000);
        avisar();
      } else if (e.tipo === 'fim') {
        msg.fim = { erro: e.erro, motivo: e.motivo, custo: e.custo, duracaoMs: e.duracaoMs, turnos: e.turnos };
        if (e.erro && e.texto) msg.blocos.push({ k: 'erro', texto: e.texto });
        else if (!msg.blocos.some((b) => b.k === 'texto' && b.texto.trim()) && e.texto) msg.blocos.push({ k: 'texto', texto: e.texto });
        if (e.sessao) { const atual = ler(conversa); if (atual) { atual.sessao = e.sessao; gravar(atual); } }
        avisar(true);
      }
    }

    let mcpConfig = null;
    if (c.agente === 'claude' && mcpScript) mcpConfig = await configMcp(conversa);
    const exec = { msg, avisar, parar: () => {} };
    execucoes.set(conversa, exec);
    ctx.send('chat:event', { conversa, tipo: 'inicio', msg });
    ctx.log.info(`Chat IA (${def.nome}): nova mensagem`);
    let turno;
    try {
      turno = agentes.rodarTurno({
        agente: c.agente, exe, texto, historico, cwd: c.cwd, sessao: c.sessao,
        modelo: cfg.model || '', esforco: c.agente === 'claude' ? cfg.effort || '' : '', permissao: cfg.permissionMode || '',
        mcpConfig, permitidas: mcpConfig ? ferramentas.leitura().map((n) => `mcp__noctis__${n}`) : [], onEvento, env: envAgente,
      });
    } catch (e) {
      execucoes.delete(conversa);
      throw e;
    }
    exec.parar = turno.parar;
    turno.fim.then(() => {
      execucoes.delete(conversa);
      for (const [pid, p] of pedidos) if (p.conversa === conversa) { p.resolve({ permitir: false }); pedidos.delete(pid); }
      if (mcpConfig) { try { fs.unlinkSync(mcpConfig); } catch { /* já apagado */ } }
      const atual = ler(conversa);
      if (atual) { const i = atual.mensagens.findIndex((m) => m.id === msg.id); if (i >= 0) atual.mensagens[i] = msg; gravar(atual); }
      if (msg.fim?.erro) ctx.log.warn(`Chat IA: ${msg.blocos.filter((b) => b.k === 'erro').map((b) => b.texto).join(' ').slice(0, 300)}`);
      ctx.send('chat:event', { conversa, tipo: 'fim', msg });
    });
    return { mensagem: msg.id };
  }

  function parar(conversa) {
    const e = execucoes.get(conversa);
    if (!e) return false;
    for (const [pid, p] of pedidos) if (p.conversa === conversa) { p.resolve({ permitir: false, motivo: 'conversa interrompida' }); pedidos.delete(pid); }
    e.parar();
    return true;
  }

  function encerrar() {
    for (const id of execucoes.keys()) parar(id);
    ponte.fechar();
  }

  return { listar, criar, obter, atualizar, excluir, enviar, parar, responder, encerrar, ferramentas, ponte, _configMcp: configMcp };
}

module.exports = { criarChat };
