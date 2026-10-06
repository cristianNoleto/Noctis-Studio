// Agentes de IA de linha de comando que o chat do Noctis sabe usar.
//  • claude  — Claude Code: integração completa (streaming, ferramentas do Noctis via MCP,
//              pedidos de permissão respondidos na janela do app, retomada da conversa).
//  • codex   — OpenAI Codex CLI: modo básico (texto; sem as ferramentas do Noctis).
//  • gemini  — Gemini CLI: modo básico (texto; sem as ferramentas do Noctis).
// Nenhum texto do usuário vai como argumento de linha de comando: o prompt sempre vai pelo stdin.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WIN = process.platform === 'win32';

const AGENTES = {
  claude: {
    nome: 'Claude Code', completo: true, bin: 'claude',
    instalar: WIN ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"' : 'curl -fsSL https://claude.ai/install.sh | bash',
    entrar: 'claude auth login',
    site: 'https://docs.claude.com/pt/docs/claude-code/setup',
    modelos: ['', 'opus', 'sonnet', 'haiku', 'fable'],
    esforcos: ['', 'low', 'medium', 'high', 'xhigh', 'max'],
  },
  codex: {
    nome: 'Codex (OpenAI)', completo: false, bin: 'codex',
    instalar: 'npm install -g @openai/codex', entrar: 'codex login', site: 'https://github.com/openai/codex',
    modelos: [''], esforcos: [''],
  },
  gemini: {
    nome: 'Gemini CLI', completo: false, bin: 'gemini',
    instalar: 'npm install -g @google/gemini-cli', entrar: 'gemini', site: 'https://github.com/google-gemini/gemini-cli',
    modelos: ['', 'gemini-2.5-pro', 'gemini-2.5-flash'], esforcos: [''],
  },
};

const SEGURO = /^[\w.\-:[\]/]+$/;

// Onde o executável está (PATH + pastas comuns dos instaladores).
function localizar(bin, { env = process.env } = {}) {
  const casa = os.homedir();
  const extras = WIN
    ? [path.join(casa, '.local', 'bin', `${bin}.exe`), path.join(env.APPDATA || '', 'npm', `${bin}.cmd`), path.join(env.LOCALAPPDATA || '', 'Programs', bin, `${bin}.exe`)]
    : [path.join(casa, '.local', 'bin', bin), path.join(casa, '.claude', 'local', bin), '/usr/local/bin/' + bin, '/opt/homebrew/bin/' + bin];
  const exts = WIN ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
    for (const e of exts) {
      const p = path.join(dir, bin + e);
      try { if (fs.statSync(p).isFile()) return p; } catch { /* não está aqui */ }
    }
  }
  return extras.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

// spawn que funciona com .cmd no Windows (precisa de shell) sem abrir brecha: só argumentos
// fixos/validados passam pela linha de comando.
function iniciar(exe, args, opts = {}) {
  if (WIN && /\.(cmd|bat)$/i.test(exe)) {
    const q = (a) => (/^[\w.\-:=/\\]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);
    return spawn(`"${exe}" ${args.map(q).join(' ')}`, { ...opts, shell: true, windowsHide: true });
  }
  return spawn(exe, args, { ...opts, windowsHide: true });
}

function rodarCurto(exe, args, { timeout = 20000, env } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const p = iniciar(exe, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => { try { p.kill(); } catch { /* já saiu */ } }, timeout);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

function ambiente(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CLAUDECODE;
  return env;
}

async function info(id, { env = ambiente() } = {}) {
  const a = AGENTES[id];
  const caminho = localizar(a.bin, { env });
  const base = { id, nome: a.nome, completo: a.completo, modelos: a.modelos, esforcos: a.esforcos, site: a.site, instalado: !!caminho, caminho };
  if (!caminho) return base;
  const v = await rodarCurto(caminho, ['--version'], { env });
  const versao = (v.out || v.err).trim().split('\n')[0].slice(0, 80);
  let logado = null;
  if (id === 'claude') {
    const s = await rodarCurto(caminho, ['auth', 'status', '--json'], { env });
    try { const j = JSON.parse(s.out); logado = !!j.loggedIn; base.metodo = j.authMethod; } catch { logado = null; }
  } else if (id === 'codex') {
    const s = await rodarCurto(caminho, ['login', 'status'], { env });
    logado = s.code === 0 ? !/not logged in/i.test(s.out + s.err) : null;
  }
  return { ...base, versao, logado };
}

// Abre um terminal visível rodando o comando (instalar / entrar na conta). Só comandos fixos.
function abrirTerminal(comando) {
  if (WIN) {
    const p = spawn('cmd.exe', ['/d', '/s', '/c', `start "Noctis Studio" cmd /k ${comando}`], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore', windowsHide: false });
    p.unref();
    return true;
  }
  const terminais = process.platform === 'darwin'
    ? [['osascript', ['-e', `tell application "Terminal" to do script "${comando.replace(/"/g, '\\"')}"`]]]
    : [['x-terminal-emulator', ['-e', 'bash', '-lc', `${comando}; exec bash`]], ['gnome-terminal', ['--', 'bash', '-lc', `${comando}; exec bash`]]];
  for (const [bin, args] of terminais) {
    try { const p = spawn(bin, args, { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref(); return true; } catch { /* tenta o próximo */ }
  }
  return false;
}

// ---------------------------------------------------------------- Claude Code (stream-json)
// Converte as linhas do `claude -p --output-format stream-json` em eventos simples.
function leitorClaude(emitir) {
  let msgAtual = null;
  return function linha(txt) {
    let j;
    try { j = JSON.parse(txt); } catch { return; }
    if (j.parent_tool_use_id) return; // mensagens de subagentes: só o resultado final importa
    if (j.type === 'system' && j.subtype === 'init') {
      emitir({ tipo: 'sessao', sessao: j.session_id, modelo: j.model, mcp: (j.mcp_servers || []).map((m) => ({ nome: m.name, status: m.status })), permissao: j.permissionMode });
    } else if (j.type === 'stream_event' && j.event) {
      const ev = j.event;
      if (ev.type === 'message_start') msgAtual = ev.message?.id || null;
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') emitir({ tipo: 'texto', msg: msgAtual, bloco: ev.index, delta: ev.delta.text });
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta') emitir({ tipo: 'pensando', msg: msgAtual, bloco: ev.index, delta: ev.delta.thinking });
    } else if (j.type === 'assistant' && j.message) {
      const blocos = (j.message.content || []).map((c, i) => {
        if (c.type === 'text') return { bloco: i, tipo: 'texto', texto: c.text };
        if (c.type === 'thinking') return { bloco: i, tipo: 'pensando', texto: c.thinking };
        if (c.type === 'tool_use') return { bloco: i, tipo: 'ferramenta', id: c.id, nome: c.name, entrada: c.input };
        return null;
      }).filter(Boolean);
      emitir({ tipo: 'mensagem', msg: j.message.id, blocos });
    } else if (j.type === 'user' && j.message && Array.isArray(j.message.content)) {
      for (const c of j.message.content) {
        if (c.type !== 'tool_result') continue;
        const texto = Array.isArray(c.content) ? c.content.map((x) => (x.type === 'text' ? x.text : `[${x.type}]`)).join('\n') : String(c.content ?? '');
        emitir({ tipo: 'resultado', id: c.tool_use_id, erro: !!c.is_error, texto: texto.length > 4000 ? `${texto.slice(0, 4000)}…` : texto });
      }
    } else if (j.type === 'result') {
      emitir({ tipo: 'fim', sessao: j.session_id, custo: j.total_cost_usd, duracaoMs: j.duration_ms, turnos: j.num_turns, erro: !!j.is_error, motivo: j.subtype, texto: typeof j.result === 'string' ? j.result : '' });
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

/**
 * Roda um turno do agente. Retorna { parar, fim: Promise }.
 * opts: { agente, exe, texto, historico, cwd, sessao, modelo, esforco, permissao, mcpConfig, permitidas, onEvento, env }
 */
function rodarTurno(opts) {
  const { agente, exe, texto, cwd, onEvento } = opts;
  const env = opts.env || ambiente();
  let args;
  let entrada = texto;
  let saidaFinal = null;
  if (agente === 'claude') {
    args = argsClaude(opts);
  } else if (agente === 'codex') {
    saidaFinal = path.join(os.tmpdir(), `noctis-codex-${process.pid}-${Date.now()}.txt`);
    args = ['exec', '--skip-git-repo-check', '--color', 'never', '-o', saidaFinal];
    if (opts.modelo && SEGURO.test(opts.modelo)) args.push('-m', opts.modelo);
    entrada = comHistorico(opts.historico, texto);
  } else if (agente === 'gemini') {
    args = [];
    if (opts.modelo && SEGURO.test(opts.modelo)) args.push('-m', opts.modelo);
    entrada = comHistorico(opts.historico, texto);
  } else {
    throw new Error(`Agente desconhecido: ${agente}`);
  }

  const p = iniciar(exe, args, { cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
  let parado = false;
  let stderr = '';
  let viuFim = false;
  const emitir = (e) => { if (e.tipo === 'fim') viuFim = true; onEvento(e); };
  const leitor = agente === 'claude' ? leitorClaude(emitir) : null;
  let buf = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    if (!leitor) { emitir({ tipo: 'texto', msg: 'saida', bloco: 0, delta: d }); return; }
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) leitor(l); }
  });
  p.stderr.setEncoding('utf8');
  p.stderr.on('data', (d) => {
    stderr += d;
    if (stderr.length > 100000) stderr = stderr.slice(-50000);
    if (agente === 'codex') emitir({ tipo: 'atividade', texto: d });
  });
  p.stdin.on('error', () => {});
  p.stdin.end(entrada);

  const fim = new Promise((resolve) => {
    p.on('error', (e) => { emitir({ tipo: 'fim', erro: true, motivo: 'erro', texto: `Não consegui iniciar ${AGENTES[agente].nome}: ${e.message}` }); resolve(); });
    p.on('close', (code) => {
      if (leitor && buf.trim()) leitor(buf.trim());
      if (saidaFinal) {
        try { const t = fs.readFileSync(saidaFinal, 'utf8').trim(); if (t) emitir({ tipo: 'mensagem', msg: 'saida', blocos: [{ bloco: 0, tipo: 'texto', texto: t }] }); fs.unlinkSync(saidaFinal); } catch { /* sem arquivo */ }
      }
      if (!viuFim) {
        const erro = parado ? false : code !== 0;
        const ultimas = stderr.split('\n').map((s) => s.trim()).filter(Boolean).slice(-4).join('\n');
        emitir({ tipo: 'fim', erro, motivo: parado ? 'parado' : code === 0 ? 'success' : 'erro', texto: erro ? (ultimas || `O agente saiu com código ${code}.`) : '' });
      }
      resolve();
    });
  });

  return {
    parar() {
      parado = true;
      try {
        if (WIN && p.pid) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
        else p.kill('SIGTERM');
      } catch { /* já saiu */ }
    },
    fim,
  };
}

// Agentes "básicos" não lembram da conversa sozinhos: mandamos as últimas trocas junto.
function comHistorico(historico = [], texto) {
  const ult = historico.slice(-10);
  if (!ult.length) return texto;
  const linhas = ult.map((m) => `${m.papel === 'user' ? 'Usuário' : 'Assistente'}: ${String(m.texto || '').slice(0, 4000)}`);
  return `Conversa até agora:\n${linhas.join('\n\n')}\n\nNova mensagem do usuário:\n${texto}`;
}

module.exports = { AGENTES, localizar, info, abrirTerminal, rodarTurno, leitorClaude, argsClaude, comHistorico, ambiente };
