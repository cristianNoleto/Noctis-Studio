// Driver do Claude Code: um processo por turno (`claude -p --output-format stream-json`).
// A permissão do Claude é respondida pela ferramenta MCP mcp__noctis__aprovar (pela ponte),
// então este driver não usa o canal de permissão genérico.
const { matarArvore, lerLinhas } = require('./comum');

const SEGURO = /^[\w.\-:[\]/]+$/;

// Converte as linhas do stream-json em eventos do vocabulário comum.
function leitorClaude(emitir) {
  let msgAtual = null;
  return function linha(j) {
    if (j.parent_tool_use_id) return; // subagentes: só o resultado final importa
    if (j.type === 'system' && j.subtype === 'init') {
      emitir({ tipo: 'sessao', sessionId: j.session_id, modelo: j.model, mcp: (j.mcp_servers || []).map((m) => ({ nome: m.name, status: m.status })), permissao: j.permissionMode });
    } else if (j.type === 'stream_event' && j.event) {
      const ev = j.event;
      if (ev.type === 'message_start') msgAtual = ev.message?.id || null;
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') emitir({ tipo: 'texto-delta', texto: ev.delta.text });
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta') emitir({ tipo: 'pensando-delta', texto: ev.delta.thinking });
    } else if (j.type === 'assistant' && j.message) {
      for (const c of j.message.content || []) {
        if (c.type === 'tool_use') emitir({ tipo: 'ferramenta', id: c.id, nome: c.name, entrada: c.input });
        else if (c.type === 'text') emitir({ tipo: 'texto-final', msg: j.message.id, texto: c.text });
        else if (c.type === 'thinking') emitir({ tipo: 'pensando-final', msg: j.message.id, texto: c.thinking });
      }
    } else if (j.type === 'user' && j.message && Array.isArray(j.message.content)) {
      for (const c of j.message.content) {
        if (c.type !== 'tool_result') continue;
        const texto = Array.isArray(c.content) ? c.content.map((x) => (x.type === 'text' ? x.text : `[${x.type}]`)).join('\n') : String(c.content ?? '');
        emitir({ tipo: 'ferramenta-resultado', id: c.tool_use_id, erro: !!c.is_error, texto: texto.length > 4000 ? `${texto.slice(0, 4000)}…` : texto });
      }
    } else if (j.type === 'result') {
      emitir({ tipo: 'resultado', sessionId: j.session_id, custoUsd: j.total_cost_usd, duracaoMs: j.duration_ms, turnos: j.num_turns, isError: !!j.is_error, motivo: j.subtype, texto: typeof j.result === 'string' ? j.result : '' });
    }
  };
}

function argsClaude({ sessao, modelo, esforco, permissao, mcpConfig, permitidas = [] }) {
  const a = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (mcpConfig) a.push('--mcp-config', mcpConfig, '--permission-prompt-tool', 'mcp__noctis__aprovar');
  if (modelo && SEGURO.test(modelo)) a.push('--model', modelo);
  if (esforco && /^(low|medium|high|xhigh|max)$/.test(esforco)) a.push('--effort', esforco);
  if (permissao && /^(acceptEdits|bypassPermissions|plan)$/.test(permissao)) a.push('--permission-mode', permissao);
  if (sessao && /^[\w-]+$/.test(sessao)) a.push('--resume', sessao);
  if (permitidas.length) a.push('--allowedTools', permitidas.filter((t) => SEGURO.test(t)).join(','));
  return a;
}

function criarDriverClaude() {
  let deps = null;
  const ativos = new Map(); // conversaId → proc

  async function enviarMensagem(o) {
    const { conversaId } = o;
    if (ativos.has(conversaId)) throw new Error('turno em andamento nesta conversa');
    const emitir = (e) => { try { deps.onEvento(conversaId, e); } catch { /* ignora */ } };
    const args = argsClaude({ sessao: o.cliSessionId, modelo: o.model, esforco: o.effort, permissao: o.permissao, mcpConfig: o.mcpConfigPath, permitidas: o.permitidas || [] });
    const proc = deps.spawnCli('claude', args, { cwd: o.cwd });
    ativos.set(conversaId, proc);
    let parado = false;
    let viuResultado = false;
    let stderr = '';
    // O turno termina (logicamente) no evento 'resultado'; liberamos a conversa já aqui, para a
    // próxima mensagem poder começar mesmo que o processo leve um instante a mais para encerrar.
    const leitor = leitorClaude((e) => { if (e.tipo === 'resultado') { viuResultado = true; ativos.delete(conversaId); } emitir(e); });
    lerLinhas(proc.stdout, leitor);
    proc.stderr?.setEncoding('utf8');
    proc.stderr?.on('data', (d) => { stderr = (stderr + d).slice(-8000); });
    proc.stdin.on('error', () => {});
    proc.stdin.end(o.texto);
    proc.on('error', (e) => { emitir({ tipo: 'erro', mensagem: `Não consegui iniciar o Claude Code: ${e.message}` }); });
    proc.on('close', (code) => {
      if (ativos.get(conversaId) === proc) ativos.delete(conversaId);
      if (!viuResultado) {
        if (parado) emitir({ tipo: 'resultado', texto: '', isError: false, interrompido: true, motivo: 'parado' });
        else emitir({ tipo: 'erro', mensagem: stderr.split('\n').filter(Boolean).slice(-4).join('\n') || `O Claude Code saiu com código ${code}.` });
      }
    });
    proc._pararNoctis = () => { parado = true; matarArvore(proc); };
  }

  return {
    initDriver(d) { deps = d; },
    enviarMensagem,
    responderPermissao() { return false; }, // via ponte MCP
    interromper(conversaId) { const p = ativos.get(conversaId); if (!p) return false; p._pararNoctis(); return true; },
    turnoAtivo(conversaId) { return ativos.has(conversaId); },
    encerrarTudo() { for (const p of ativos.values()) matarArvore(p); ativos.clear(); },
  };
}

module.exports = { criarDriverClaude, leitorClaude, argsClaude };
