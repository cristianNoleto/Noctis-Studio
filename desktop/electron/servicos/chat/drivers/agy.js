// Driver do Antigravity (CLI `agy`): stream-json, um processo por conversa.
// O agy não expõe canal de permissão em stream-json: ele já roda pulando os prompts e, se uma
// ferramenta proibida aparecer, nós derrubamos o processo (verificação pós-fato, como no DP).
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { matarArvore } = require('./comum');

const MCP_CONFIG = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
const WATCHDOG_MS = 60000;
const EFFORTS = new Set(['low', 'medium', 'high']);

function normEffort(e) { if (!e) return null; const o = String(e).toLowerCase(); return EFFORTS.has(o) ? o : (o === 'xhigh' || o === 'max' || o === 'ultra') ? 'high' : null; }
function modeloTemEffort(m) { return !!m && /-(low|medium|high|thinking)$/i.test(String(m)); }

// Mescla o servidor MCP "noctis" no mcp_config.json global do agy (ele só lê de lá).
function mesclarMcp(caminho) {
  let nosso; try { nosso = JSON.parse(fs.readFileSync(caminho, 'utf8')); } catch { return; }
  const servers = nosso?.mcpServers; if (!servers || typeof servers !== 'object') return;
  let atual = { mcpServers: {} };
  try { atual = JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8')); atual.mcpServers = atual.mcpServers || {}; } catch { /* primeira vez */ }
  let mudou = false;
  for (const [k, v] of Object.entries(servers)) if (JSON.stringify(atual.mcpServers[k]) !== JSON.stringify(v)) { atual.mcpServers[k] = v; mudou = true; }
  if (!mudou) return;
  try { fs.mkdirSync(path.dirname(MCP_CONFIG), { recursive: true }); const tmp = `${MCP_CONFIG}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(atual, null, 2)); fs.renameSync(tmp, MCP_CONFIG); } catch { /* sem config */ }
}

function nomeFerramenta(info, params) {
  const r = info.tool_name || info.tool_info?.name || 'ferramenta';
  if (!/^call_mcp_tool$/i.test(r)) return r;
  const tool = params.ToolName || params.toolName || params.tool_name || params.name;
  return tool ? `mcp__${params.ServerName || params.serverName || 'noctis'}__${tool}` : r;
}

function criarDriverAgy() {
  let deps = null;
  const sessoes = new Map();
  const emitir = (c, e) => { try { deps.onEvento(c, e); } catch { /* ignora */ } };

  function derrubar(cid, motivo) { const s = sessoes.get(cid); if (s) { sessoes.delete(cid); clearTimeout(s.watchdog); s.motivo = motivo; matarArvore(s.proc); } }
  function armar(cid, s) { clearTimeout(s.watchdog); s.watchdog = setTimeout(() => emitir(cid, { tipo: 'silencio', desdeMs: WATCHDOG_MS }), WATCHDOG_MS); s.watchdog.unref?.(); }

  async function auditar(cid, s, nome, entrada) {
    let r; try { r = await deps.julgar({ conversaId: cid, ferramenta: nome, entrada }); } catch { return; }
    if (r?.decisao === 'negar' && sessoes.get(cid) === s) {
      emitir(cid, { tipo: 'ferramenta-negada', nome, motivo: `${r.motivo || 'ferramenta proibida'} (o Antigravity não pergunta antes; a ação foi interrompida depois)` });
      derrubar(cid, 'ferramenta proibida'); emitir(cid, { tipo: 'interrompido' });
    }
  }

  function tratarStep(cid, s, step) {
    const t = step.step_type;
    if (t === 'agent_response') { if (step.text_delta) emitir(cid, { tipo: 'texto-delta', texto: step.text_delta }); return; }
    if (t !== 'tool') return;
    const params = step.tool_info?.parameters || {};
    const nome = nomeFerramenta(step, params);
    let entrada = /^call_mcp_tool$/i.test(step.tool_name || '') ? (params.Arguments ?? params.arguments ?? params.args ?? null) : params;
    if (typeof entrada === 'string') { try { entrada = JSON.parse(entrada); } catch { entrada = { texto: entrada }; } }
    if (!entrada || typeof entrada !== 'object') entrada = {};
    if (step.state === 'DONE') {
      if (!s.abertas.has(step.step_index)) { emitir(cid, { tipo: 'ferramenta-inicio', nome }); emitir(cid, { tipo: 'ferramenta', nome, entrada }); }
      s.abertas.delete(step.step_index); emitir(cid, { tipo: 'ferramenta-fim', nome }); return;
    }
    if (s.abertas.has(step.step_index)) return;
    s.abertas.add(step.step_index); emitir(cid, { tipo: 'ferramenta-inicio', nome }); emitir(cid, { tipo: 'ferramenta', nome, entrada }); auditar(cid, s, nome, entrada);
  }

  function tratarResult(cid, s, r) {
    s.ocupado = false; clearTimeout(s.watchdog);
    const erro = r.status !== 'SUCCESS';
    if (r.conversation_id) s.sessionId = r.conversation_id;
    if (erro && !r.response && !r.num_turns) { emitir(cid, { tipo: 'erro', mensagem: r.error || 'o Antigravity recusou a requisição' }); return; }
    emitir(cid, { tipo: 'resultado', texto: r.response ?? '', sessionId: r.conversation_id || s.sessionId || null, isError: erro, usage: r.usage || null });
  }

  function tratarLinha(cid, s, linha) {
    let t; try { t = JSON.parse(linha); } catch { return; }
    armar(cid, s);
    if (t.event === 'init') { const id = t.conversation_id || null; if (s.resumeSolicitado && id && id !== s.resumeSolicitado) emitir(cid, { tipo: 'resume-falhou' }); s.resumeSolicitado = null; s.sessionId = id; emitir(cid, { tipo: 'sessao', sessionId: id, modelo: s.modelo || null }); }
    else if (t.event === 'step_update' && t.step_update) tratarStep(cid, s, t.step_update);
    else if (t.event === 'result' && t.result) tratarResult(cid, s, t.result);
  }

  function montarArgs(o, s) {
    const a = ['--input-format', 'stream-json', '--output-format', 'stream-json'];
    if (o.model) a.push('--model', o.model);
    const ef = modeloTemEffort(o.model) ? null : normEffort(o.effort); if (ef) a.push('--effort', ef);
    if (o.cwd) a.push('--add-dir', o.cwd);
    a.push('--dangerously-skip-permissions');
    if (o.cliSessionId) { a.push('--conversation', o.cliSessionId); s.resumeSolicitado = o.cliSessionId; }
    return a;
  }

  async function enviarMensagem(o) {
    if (!deps) throw new Error('driver não inicializado');
    const cid = o.conversaId;
    let s = sessoes.get(cid);
    if (s && s.proc.exitCode !== null) { derrubar(cid, 'processo morto'); s = null; }
    if (!s) {
      if (o.mcpConfigPath) mesclarMcp(o.mcpConfigPath);
      s = { proc: null, ocupado: false, watchdog: null, sessionId: o.cliSessionId || null, resumeSolicitado: null, modelo: o.model || null, abertas: new Set(), preambulo: o.cliSessionId ? null : o.preambuloSistema || null };
      s.proc = deps.spawnCli('agy', montarArgs(o, s), { cwd: o.cwd });
      sessoes.set(cid, s);
      readline.createInterface({ input: s.proc.stdout, crlfDelay: Infinity }).on('line', (l) => tratarLinha(cid, s, l));
      let err = ''; s.proc.stderr?.on('data', (d) => { err = (err + d.toString()).slice(-2000); });
      s.proc.on('exit', (code) => { if (sessoes.get(cid) === s) { clearTimeout(s.watchdog); sessoes.delete(cid); if (s.ocupado) { s.ocupado = false; emitir(cid, { tipo: 'erro', mensagem: `O Antigravity saiu (código ${code}).`, detalhe: err }); } } });
    }
    if (s.ocupado) throw new Error('turno em andamento nesta conversa');
    s.ocupado = true; s.abertas.clear(); armar(cid, s);
    const partes = []; if (s.preambulo) { partes.push(s.preambulo); s.preambulo = null; } if (o.contexto) partes.push(o.contexto); partes.push(o.texto);
    try { s.proc.stdin.write(JSON.stringify({ event: 'user', message: { role: 'user', content: partes.join('\n\n') } }) + '\n'); }
    catch (e) { s.ocupado = false; derrubar(cid, 'stdin morto'); emitir(cid, { tipo: 'erro', mensagem: `não consegui falar com o Antigravity: ${e?.message}` }); }
  }

  return {
    initDriver(d) { deps = d; },
    enviarMensagem,
    responderPermissao() { return false; },
    interromper(cid) { const tinha = sessoes.has(cid); derrubar(cid, 'interrompido pelo usuário'); if (tinha) emitir(cid, { tipo: 'interrompido' }); return tinha; },
    turnoAtivo(cid) { return !!sessoes.get(cid)?.ocupado; },
    encerrarTudo() { for (const cid of [...sessoes.keys()]) derrubar(cid, 'app encerrando'); },
  };
}

module.exports = { criarDriverAgy };
