// Driver do Codex (OpenAI): usa o `codex app-server` (JSON-RPC por linha), um servidor para todas
// as conversas, cada conversa é uma "thread". Baseado no protocolo do app-server do Codex.
const fs = require('fs');
const readline = require('readline');
const { matarArvore } = require('./comum');

const RECURSOS_OFF = ['multi_agent', 'apps', 'plugins', 'tool_search', 'in_app_browser', 'browser_use', 'computer_use', 'image_generation'];
const CONFIGS = ['web_search="disabled"', 'tools.view_image=false', 'project_root_markers=[]'];
const IDLE_MS = 10 * 60 * 1000;

function lerMcp(caminho) {
  if (!caminho) return null;
  try {
    const o = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    const a = o.mcpServers || o.mcp_servers || {};
    const t = {};
    for (const [k, s] of Object.entries(a)) {
      if (s?.url) t[k] = { url: s.url };
      else if (s?.command) t[k] = { command: s.command, ...(s.args ? { args: s.args } : {}), ...(s.env ? { env: s.env } : {}) };
    }
    return Object.keys(t).length ? t : null;
  } catch { return null; }
}

function nomeFerramenta(it) {
  switch (it?.type) {
    case 'commandExecution': return 'Bash';
    case 'fileChange': return 'Edit';
    case 'mcpToolCall': return `mcp__${it.server}__${it.tool}`;
    case 'webSearch': return 'WebSearch';
    default: return null;
  }
}
function entradaDoItem(it) {
  if (it?.type === 'commandExecution') return { command: it.command, cwd: it.cwd };
  if (it?.type === 'fileChange') return { file_path: it.changes?.[0]?.path };
  return it?.arguments || {};
}

function criarDriverCodex() {
  let deps = null;
  let servidor = null;
  let boot = null;
  let semStdio = false;
  const conversas = new Map(); // conversaId → estado

  const emitir = (c, e) => { try { deps.onEvento(c, e); } catch { /* ignora */ } };
  const escrever = (o) => { try { const s = servidor?.proc?.stdin; if (s && !s.destroyed) s.write(JSON.stringify(o) + '\n'); } catch { /* ignora */ } };
  const notificar = (method, params) => escrever({ jsonrpc: '2.0', method, params });
  const responder = (id, result) => escrever({ jsonrpc: '2.0', id, result });
  function chamar(method, params) {
    if (!servidor) return Promise.reject(new Error('app-server encerrado'));
    const id = ++servidor.rpcId;
    return new Promise((res, rej) => { servidor.pendentes.set(id, { res, rej }); escrever({ jsonrpc: '2.0', id, method, params }); });
  }

  function rearmarIdle() {
    if (!servidor) return;
    clearTimeout(servidor.idle);
    servidor.idle = setTimeout(() => { for (const c of conversas.values()) if (c.ocupado) return rearmarIdle(); derrubar('ocioso'); }, IDLE_MS);
    servidor.idle.unref?.();
  }

  function derrubar(motivo) {
    const s = servidor; if (!s) return;
    servidor = null; boot = null; clearTimeout(s.idle); s.rl?.close();
    for (const [, p] of s.pendentes) p.rej(new Error(`app-server encerrado (${motivo})`));
    s.pendentes.clear(); matarArvore(s.proc);
    for (const [cid, c] of conversas) {
      for (const [rid] of c.pendentesPerm) emitir(cid, { tipo: 'permissao-cancelada', requestId: rid, motivo });
      c.pendentesPerm.clear();
      if (c.ocupado) emitir(cid, { tipo: 'erro', mensagem: `O Codex encerrou (${motivo}).` });
      c.carregadaEm = null; c.ocupado = false; c.turnId = null;
    }
  }

  async function subir() {
    const args = semStdio ? ['app-server'] : ['app-server', '--stdio'];
    for (const r of RECURSOS_OFF) args.push('--disable', r);
    for (const c of CONFIGS) args.push('-c', c);
    const proc = deps.spawnCli('codex', args, {});
    const s = { proc, rl: null, rpcId: 0, pendentes: new Map(), idle: null, stderr: '' };
    servidor = s;
    s.rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
    s.rl.on('line', (l) => { if (servidor === s) tratarLinha(l); });
    proc.stderr?.on('data', (d) => { const r = d.toString(); s.stderr = (s.stderr + r).slice(-2000); if (/unexpected argument '--stdio'/.test(s.stderr)) semStdio = true; });
    proc.on('exit', (code) => { if (servidor === s) derrubar(`código ${code}`); });
    await chamar('initialize', { clientInfo: { name: 'noctis-studio', title: 'Noctis Studio', version: '1.0.0' }, capabilities: null });
    notificar('initialized', {});
    rearmarIdle();
    return s;
  }
  function garantir() {
    if (servidor) return Promise.resolve(servidor);
    if (!boot) boot = (async () => { try { return await subir(); } catch (e) { boot = null; throw e; } })();
    return boot;
  }

  function convDoThread(tid) { for (const [cid, c] of conversas) if (c.threadId === tid) return [cid, c]; return [null, null]; }

  function tratarLinha(linha) {
    let o; try { o = JSON.parse(linha); } catch { return; }
    if (o.id !== undefined && o.method) return tratarRequest(o);
    if (o.id !== undefined) { const p = servidor?.pendentes.get(o.id); if (!p) return; servidor.pendentes.delete(o.id); o.error ? p.rej(Object.assign(new Error(o.error.message || 'erro JSON-RPC'), { rpc: o.error })) : p.res(o.result); return; }
    if (o.method) tratarNotificacao(o.method, o.params || {});
  }

  function tratarNotificacao(method, p) {
    const [cid, c] = convDoThread(p.threadId);
    if (!c) return;
    switch (method) {
      case 'item/agentMessage/delta': emitir(cid, { tipo: 'texto-delta', texto: p.delta }); break;
      case 'item/started': { const n = nomeFerramenta(p.item); if (n) emitir(cid, { tipo: 'ferramenta-inicio', nome: n }); break; }
      case 'item/completed': {
        const it = p.item || {};
        if (it.type === 'agentMessage') { if (it.phase === 'final_answer' && it.text) c.deltas.push(it.text); break; }
        const n = nomeFerramenta(it); if (!n) break;
        if (it.status === 'declined') emitir(cid, { tipo: 'ferramenta-negada', nome: n, motivo: 'negado' });
        else emitir(cid, { tipo: 'ferramenta', nome: n, entrada: entradaDoItem(it) });
        emitir(cid, { tipo: 'ferramenta-fim', nome: n });
        break;
      }
      case 'turn/completed': {
        c.ocupado = false; c.turnId = null; rearmarIdle();
        const fin = (p.turn?.items || []).filter((i) => i.type === 'agentMessage' && i.phase === 'final_answer').map((i) => i.text).filter(Boolean);
        emitir(cid, { tipo: 'resultado', texto: fin.length ? fin.join('\n') : c.deltas.join(''), sessionId: c.threadId, isError: p.turn?.status === 'failed', ...(p.turn?.status === 'interrupted' ? { interrompido: true } : {}) });
        c.deltas = [];
        break;
      }
      case 'error': if (!p.willRetry) { c.ocupado = false; emitir(cid, { tipo: 'erro', mensagem: p.error?.message || 'erro no turno' }); } break;
      default: break;
    }
  }

  // Pedidos de aprovação vindos do servidor.
  async function tratarRequest(req) {
    const metodo = req.method;
    const p = req.params || {};
    const mapa = {
      'item/commandExecution/requestApproval': () => ['Bash', { command: p.command, cwd: p.cwd }, () => ({ decision: 'accept' }), () => ({ decision: 'decline' })],
      execCommandApproval: () => ['Bash', { command: (p.command || []).join(' '), cwd: p.cwd }, () => 'approved', () => ({ denied: { rejection: 'Negado no Noctis Studio' } })],
      'item/fileChange/requestApproval': () => ['Edit', { file_path: p.itemId }, () => ({ decision: 'accept' }), () => ({ decision: 'decline' })],
      applyPatchApproval: () => ['Edit', { fileChanges: p.fileChanges }, () => 'approved', () => ({ denied: { rejection: 'Negado no Noctis Studio' } })],
    };
    const m = mapa[metodo];
    if (!m) { responder(req.id, { decision: 'decline' }); return; }
    const [ferramenta, entrada, sim, nao] = m();
    const [cid, c] = convDoThread(p.threadId || p.conversationId);
    if (!c) { responder(req.id, nao()); return; }
    let r; try { r = await deps.julgar({ conversaId: cid, ferramenta, entrada }); } catch { r = { decisao: 'negar', motivo: 'falha ao julgar' }; }
    if (r.decisao === 'aprovar') { responder(req.id, sim()); emitir(cid, { tipo: 'ferramenta', nome: ferramenta, entrada }); return; }
    if (r.decisao === 'negar') { responder(req.id, nao()); emitir(cid, { tipo: 'ferramenta-negada', nome: ferramenta, motivo: r.motivo }); return; }
    c.pendentesPerm.set(req.id, { sim, nao, ferramenta, entrada });
    emitir(cid, { tipo: 'pedido-permissao', requestId: req.id, ferramenta, entrada });
  }

  async function prepararThread(c, o, resume) {
    const base = { cwd: o.cwd, model: o.model || undefined, approvalPolicy: 'on-request', sandbox: 'workspace-write', developerInstructions: o.preambuloSistema || undefined };
    const mcp = lerMcp(o.mcpConfigPath);
    if (mcp) base.config = { mcp_servers: mcp };
    let r = null;
    if (resume) { try { r = await chamar('thread/resume', { threadId: resume, ...base }); } catch { emitir(o.conversaId, { tipo: 'resume-falhou' }); } }
    if (!r) r = await chamar('thread/start', base);
    if (!r?.thread?.id) throw new Error('o Codex não devolveu um threadId');
    c.threadId = r.thread.id; c.carregadaEm = servidor;
    emitir(o.conversaId, { tipo: 'sessao', sessionId: c.threadId, modelo: r.model || o.model || null });
  }

  async function enviarMensagem(o) {
    if (!deps) throw new Error('driver não inicializado');
    await garantir();
    let c = conversas.get(o.conversaId);
    if (!c) { c = { threadId: null, turnId: null, ocupado: false, deltas: [], pendentesPerm: new Map(), carregadaEm: null }; conversas.set(o.conversaId, c); }
    if (c.ocupado) throw new Error('turno em andamento nesta conversa');
    c.ocupado = true; c.deltas = []; rearmarIdle();
    try {
      if (!c.threadId || c.carregadaEm !== servidor) await prepararThread(c, o, c.threadId || o.cliSessionId || null);
      const texto = o.contexto ? `${o.contexto}\n\n${o.texto}` : o.texto;
      const r = await chamar('turn/start', { threadId: c.threadId, input: [{ type: 'text', text: texto, text_elements: [] }], cwd: o.cwd || undefined, model: o.model || undefined, effort: o.effort || undefined });
      c.turnId = r?.turn?.id || null;
    } catch (e) { c.ocupado = false; emitir(o.conversaId, { tipo: 'erro', mensagem: e.message }); }
  }

  function responderPermissao(cid, rid, decisao) {
    const c = conversas.get(cid); if (!c) return false;
    const pend = c.pendentesPerm.get(rid); if (!pend) return false;
    c.pendentesPerm.delete(rid);
    if (decisao === 'aprovar') { responder(rid, pend.sim()); emitir(cid, { tipo: 'ferramenta', nome: pend.ferramenta, entrada: pend.entrada }); }
    else { responder(rid, pend.nao()); emitir(cid, { tipo: 'ferramenta-negada', nome: pend.ferramenta, motivo: 'negado pelo usuário' }); }
    return true;
  }

  function interromper(cid) {
    const c = conversas.get(cid); if (!c || !c.ocupado) return false;
    for (const [rid] of c.pendentesPerm) { responder(rid, { decision: 'cancel' }); emitir(cid, { tipo: 'permissao-cancelada', requestId: rid, motivo: 'interrompido' }); }
    c.pendentesPerm.clear();
    if (c.turnId && servidor) chamar('turn/interrupt', { threadId: c.threadId, turnId: c.turnId }).catch(() => {});
    c.ocupado = false; c.turnId = null; emitir(cid, { tipo: 'interrompido' });
    return true;
  }

  return {
    initDriver(d) { deps = d; },
    enviarMensagem, responderPermissao, interromper,
    turnoAtivo(cid) { return !!conversas.get(cid)?.ocupado; },
    encerrarTudo() { derrubar('app encerrando'); conversas.clear(); },
  };
}

module.exports = { criarDriverCodex };
