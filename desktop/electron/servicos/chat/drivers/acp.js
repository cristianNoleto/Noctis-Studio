// Driver genérico ACP (Agent Client Protocol) — usado pelo Grok CLI (`grok agent stdio`).
// Um processo por combinação de modelo+esforço, cada conversa é uma "session".
const fs = require('fs');
const readline = require('readline');
const { matarArvore, resumirEntrada } = require('./comum');

const IDLE_MS = 10 * 60 * 1000;
const HANDSHAKE_MS = 20000;
const MAX_RESP = 200000;

function mcpServers(caminho) {
  if (!caminho) return [];
  let o; try { o = JSON.parse(fs.readFileSync(caminho, 'utf8')); } catch { return []; }
  const envPares = (e) => Object.entries(e || {}).map(([name, value]) => ({ name, value: String(value) }));
  const out = [];
  for (const [name, s] of Object.entries(o?.mcpServers || {})) {
    if (s?.url) out.push({ type: 'http', name, url: s.url, headers: envPares(s.headers) });
    else if (s?.command) out.push({ name, command: s.command, args: Array.isArray(s.args) ? s.args : [], env: envPares(s.env) });
  }
  return out;
}
function nomeFerramenta(e = {}) { return e._meta?.['x.ai/toolName'] || e.toolName || e.title || e.kind || 'ferramenta'; }
function escolherOpcao(opts = [], aprovar) {
  const pref = aprovar ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always'];
  for (const k of pref) { const o = opts.find((x) => x?.kind === k); if (o) return o; }
  const re = aprovar ? /\b(allow|approve|accept|permit)/i : /\b(reject|deny|decline|refus)/i;
  return opts.find((o) => re.test(`${o?.kind || ''} ${o?.optionId || ''} ${o?.name || ''}`)) || null;
}

function criarDriverAcp(bin, rotulo) {
  let deps = null;
  const conexoes = new Map(); // chave model|effort → conexão
  const estados = new Map(); // conversaId → estado

  const emitir = (c, e) => { try { deps.onEvento(c, e); } catch { /* ignora */ } };
  const escrever = (cx, o) => { try { if (cx.proc?.stdin && !cx.proc.stdin.destroyed) cx.proc.stdin.write(JSON.stringify(o) + '\n'); } catch { /* ignora */ } };
  const notificar = (cx, method, params) => escrever(cx, { jsonrpc: '2.0', method, params });
  const responder = (cx, id, result) => escrever(cx, { jsonrpc: '2.0', id, result });
  function chamar(cx, method, params) {
    const id = ++cx.proxId;
    return new Promise((res, rej) => { cx.pendentes.set(id, { res, rej, method }); escrever(cx, { jsonrpc: '2.0', id, method, params }); });
  }

  function fecharConexao(cx, motivo) {
    if (!cx || cx.fechada) return;
    cx.fechada = true; clearTimeout(cx.idle); if (conexoes.get(cx.chave) === cx) conexoes.delete(cx.chave);
    for (const [, p] of cx.pendentes) p.rej(new Error(`conexão ACP encerrada (${motivo})`));
    cx.pendentes.clear();
    for (const sid of [...cx.sessoes.values()]) if (estados.get(sid)?.conexao === cx) soltarSessao(sid, motivo);
    matarArvore(cx.proc);
  }
  function rearmarIdle(cx) {
    clearTimeout(cx.idle);
    if (cx.fechada || [...cx.sessoes.values()].some((sid) => estados.get(sid)?.ocupado)) return;
    cx.idle = setTimeout(() => fecharConexao(cx, 'ociosa'), IDLE_MS); cx.idle.unref?.();
  }

  async function abrir(chave, { model, effort }) {
    const args = ['agent']; if (model) args.push('-m', model); if (effort) args.push('--reasoning-effort', effort); args.push('stdio');
    const proc = deps.spawnCli(bin, args, {});
    const cx = { chave, proc, proxId: 0, idle: null, fechada: false, capacidades: {}, stderr: '', pendentes: new Map(), sessoes: new Map() };
    readline.createInterface({ input: proc.stdout, crlfDelay: Infinity }).on('line', (l) => tratarLinha(cx, l));
    proc.stderr?.on('data', (d) => { cx.stderr = (cx.stderr + d.toString()).slice(-2000); });
    proc.on('exit', (code) => { if (!cx.fechada) fecharConexao(cx, `processo saiu (código ${code}) ${cx.stderr}`.trim()); });
    const init = await Promise.race([
      chamar(cx, 'initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('handshake ACP não respondeu em 20s')), HANDSHAKE_MS)),
    ]).catch((e) => { fecharConexao(cx, 'handshake falhou'); throw e; });
    cx.capacidades = init?.agentCapabilities || {}; conexoes.set(chave, cx); rearmarIdle(cx);
    return cx;
  }
  async function conexaoDe(chave, opts) { const cx = conexoes.get(chave); return cx && !cx.fechada && cx.proc.exitCode === null ? cx : abrir(chave, opts); }

  function tratarLinha(cx, linha) {
    let o; try { o = JSON.parse(linha); } catch { return; }
    if (o.id != null && o.method === undefined) { const p = cx.pendentes.get(o.id); if (!p) return; cx.pendentes.delete(o.id); o.error ? p.rej(Object.assign(new Error(`${p.method} → ${o.error.message || 'erro ACP'}`), { acp: o.error })) : p.res(o.result); return; }
    if (o.id != null && o.method) return tratarRequest(cx, o);
    if (o.method === 'session/update') atualizar(cx, o.params || {});
  }

  function atualizar(cx, p) {
    const sid = cx.sessoes.get(p.sessionId); if (!sid) return;
    const st = estados.get(sid); if (!st) return;
    armarSilencio(sid, st);
    const u = p.update || {};
    if (u.sessionUpdate === 'agent_message_chunk') { const t = u.content?.text || ''; if (!t) return; if (st.texto.length >= MAX_RESP) { st.truncada = true; return; } st.texto += t; emitir(sid, { tipo: 'texto-delta', texto: t }); }
    else if (u.sessionUpdate === 'agent_thought_chunk') { const t = u.content?.text || ''; if (t) emitir(sid, { tipo: 'pensando-delta', texto: t }); }
    else if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') {
      const novo = u.sessionUpdate === 'tool_call';
      const nome = novo ? nomeFerramenta(u) : st.ferramentas.get(u.toolCallId) || nomeFerramenta(u);
      if (novo) { st.ferramentas.set(u.toolCallId, nome); emitir(sid, { tipo: 'ferramenta-inicio', nome }); emitir(sid, { tipo: 'ferramenta', nome, entrada: u.rawInput || u.input || {} }); }
      if (u.status === 'completed' || u.status === 'failed') { st.ferramentas.delete(u.toolCallId); emitir(sid, { tipo: 'ferramenta-fim', nome, erro: u.status === 'failed' }); }
    }
  }

  async function tratarRequest(cx, req) {
    if (req.method !== 'session/request_permission') { escrever(cx, { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `método ${req.method} não suportado` } }); return; }
    const p = req.params || {};
    const sid = cx.sessoes.get(p.sessionId); const st = sid ? estados.get(sid) : null;
    const opts = p.options || [];
    if (!st) { responder(cx, req.id, { outcome: { outcome: 'cancelled' } }); return; }
    const ferramenta = nomeFerramenta(p.toolCall || {});
    const entrada = p.toolCall?.rawInput || p.toolCall?.input || {};
    let r; try { r = await deps.julgar({ conversaId: sid, ferramenta, entrada }); } catch (e) { r = { decisao: 'negar', motivo: `falha ao julgar: ${e?.message}` }; }
    if (r.decisao === 'aprovar' || r.decisao === 'negar') {
      const ok = r.decisao === 'aprovar'; const op = escolherOpcao(opts, ok);
      responder(cx, req.id, op ? { outcome: { outcome: 'selected', optionId: op.optionId } } : { outcome: { outcome: 'cancelled' } });
      emitir(sid, ok ? { tipo: 'ferramenta', nome: ferramenta, entrada } : { tipo: 'ferramenta-negada', nome: ferramenta, motivo: r.motivo });
      return;
    }
    st.pendentes.set(String(req.id), { id: req.id, cx, options: opts, ferramenta, entrada });
    emitir(sid, { tipo: 'pedido-permissao', requestId: req.id, ferramenta, entrada });
  }

  function armarSilencio(sid, st) { clearTimeout(st.silencio); if (st.ocupado) { st.silencio = setTimeout(() => emitir(sid, { tipo: 'silencio', desdeMs: 180000 }), 180000); st.silencio.unref?.(); } }
  function limpar(st, sid, motivo) {
    st.ocupado = false; clearTimeout(st.silencio);
    for (const [k, pend] of st.pendentes) { responder(pend.cx, pend.id, { outcome: { outcome: 'cancelled' } }); emitir(sid, { tipo: 'permissao-cancelada', requestId: pend.id, motivo }); st.pendentes.delete(k); }
    st.ferramentas.clear(); if (st.conexao) rearmarIdle(st.conexao);
  }
  function soltarSessao(sid, motivo) {
    const st = estados.get(sid); if (!st) return;
    const ocupado = st.ocupado; limpar(st, sid, motivo); st.conexao?.sessoes.delete(st.sessionId); st.conexao = null; st.sessionId = null;
    if (ocupado) emitir(sid, { tipo: 'erro', mensagem: `O ${rotulo} caiu: ${motivo}` });
  }
  function estadoDe(sid) { let st = estados.get(sid); if (!st) { st = { conexao: null, sessionId: null, chave: null, ocupado: false, texto: '', truncada: false, silencio: null, pendentes: new Map(), ferramentas: new Map() }; estados.set(sid, st); } return st; }

  async function garantirSessao(cx, sid, st, o, mcp) {
    if (st.conexao === cx && st.sessionId) return st.sessionId;
    if (o.cliSessionId && cx.capacidades.loadSession !== false) {
      try { await chamar(cx, 'session/load', { sessionId: o.cliSessionId, cwd: o.cwd, mcpServers: mcp }); st.sessionId = o.cliSessionId; st.conexao = cx; cx.sessoes.set(st.sessionId, sid); return st.sessionId; }
      catch { emitir(sid, { tipo: 'resume-falhou' }); }
    }
    const r = await chamar(cx, 'session/new', { cwd: o.cwd, mcpServers: mcp, ...(o.preambuloSistema ? { _meta: { rules: o.preambuloSistema } } : {}) });
    if (!r?.sessionId) throw new Error('session/new não devolveu sessionId');
    st.sessionId = r.sessionId; st.conexao = cx; cx.sessoes.set(st.sessionId, sid);
    emitir(sid, { tipo: 'sessao', sessionId: st.sessionId, modelo: o.model || null });
    return st.sessionId;
  }

  async function enviarMensagem(o) {
    if (!deps) throw new Error('driver não inicializado');
    const sid = o.conversaId; const st = estadoDe(sid);
    if (st.ocupado) throw new Error('turno em andamento nesta conversa');
    const chave = `${o.model || ''}|${o.effort || ''}`;
    if (st.chave && st.chave !== chave) soltarSessao(sid, 'modelo/esforço mudou');
    st.chave = chave;
    try {
      const cx = await conexaoDe(chave, { model: o.model, effort: o.effort });
      const mcp = mcpServers(o.mcpConfigPath);
      const sessionId = await garantirSessao(cx, sid, st, o, mcp);
      const partes = []; if (o.contexto) partes.push(o.contexto); partes.push(o.texto);
      st.ocupado = true; st.texto = ''; st.truncada = false; clearTimeout(cx.idle); armarSilencio(sid, st);
      chamar(cx, 'session/prompt', { sessionId, prompt: [{ type: 'text', text: partes.join('\n\n') }] })
        .then((r) => { const stop = r?.stopReason || 'end_turn'; limpar(st, sid, 'turno terminou'); emitir(sid, { tipo: 'resultado', texto: st.texto, sessionId, isError: stop === 'refusal', truncada: st.truncada }); })
        .catch((e) => { limpar(st, sid, 'turno falhou'); if (/unknown session id/i.test(e?.message || '')) { st.conexao?.sessoes.delete(st.sessionId); st.sessionId = null; emitir(sid, { tipo: 'resume-falhou' }); } emitir(sid, { tipo: 'erro', mensagem: e?.message || 'falha no turno' }); });
    } catch (e) { st.ocupado = false; emitir(sid, { tipo: 'erro', mensagem: e?.message || 'não consegui iniciar o agente' }); }
  }

  function responderPermissao(sid, rid, decisao) {
    const st = estados.get(sid); if (!st) return false;
    const pend = st.pendentes.get(String(rid)); if (!pend) return false;
    st.pendentes.delete(String(rid));
    const ok = decisao === 'aprovar'; const op = escolherOpcao(pend.options, ok);
    responder(pend.cx, pend.id, op ? { outcome: { outcome: 'selected', optionId: op.optionId } } : { outcome: { outcome: 'cancelled' } });
    emitir(sid, ok ? { tipo: 'ferramenta', nome: pend.ferramenta, entrada: pend.entrada } : { tipo: 'ferramenta-negada', nome: pend.ferramenta, motivo: 'negado pelo usuário' });
    return true;
  }
  function interromper(sid) {
    const st = estados.get(sid); if (!st || !st.conexao || !st.sessionId) return false;
    const ocupado = st.ocupado; if (ocupado) notificar(st.conexao, 'session/cancel', { sessionId: st.sessionId });
    limpar(st, sid, 'interrompido pelo usuário'); if (ocupado) emitir(sid, { tipo: 'interrompido' });
    return ocupado;
  }

  return {
    initDriver(d) { deps = d; },
    enviarMensagem, responderPermissao, interromper,
    turnoAtivo(sid) { return !!estados.get(sid)?.ocupado; },
    encerrarTudo() { for (const cx of [...conexoes.values()]) fecharConexao(cx, 'app encerrando'); for (const st of estados.values()) clearTimeout(st.silencio); estados.clear(); },
  };
}

module.exports = { criarDriverAcp };
