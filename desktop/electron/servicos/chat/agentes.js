// Agentes de IA de linha de comando que o chat do Noctis sabe usar — todos com integração
// completa (ferramentas do Noctis via MCP e permissões na tela, quando o CLI expõe o canal):
//   claude → Claude Code      (stream-json, um processo por turno)
//   codex  → Codex (OpenAI)    (app-server JSON-RPC)
//   grok   → Grok CLI (xAI)    (ACP stdio)
//   agy    → Antigravity (Google) (stream-json; sem canal de permissão — veja o driver)
// Instalar e entrar na conta acontecem dentro do app, sem abrir terminal: a saída do instalador
// e do login é transmitida para a janela, e o link de login é aberto no navegador automaticamente.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

const AGENTES = {
  claude: {
    bin: 'claude', rotulo: 'Claude Code', completo: true, permissao: true,
    extras: () => [path.join(os.homedir(), '.local', 'bin', WIN ? 'claude.exe' : 'claude'), path.join(os.homedir(), '.claude', 'local', 'claude')],
    instalar: { win: 'irm https://claude.ai/install.ps1 | iex', mac: 'curl -fsSL https://claude.ai/install.sh | bash', doc: 'https://code.claude.com/docs/en/setup' },
    login: { args: ['auth', 'login'], urlRe: /https?:\/\/[^\s"'<>]*(?:claude\.com|claude\.ai|anthropic\.com)[^\s"'<>]*/i, pedeCodigo: /paste\s+code\s+here|paste\s+the\s+(?:full\s+redirect\s+url|authorization\s+code)/i },
    modelos: ['fable', 'opus', 'sonnet', 'haiku'], esforcos: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  codex: {
    bin: 'codex', rotulo: 'Codex', completo: true, permissao: true,
    extras: () => { const h = os.homedir(), b = WIN ? 'codex.exe' : 'codex', cx = process.env.CODEX_HOME || path.join(h, '.codex'); const t = [path.join(cx, 'bin', b), path.join(cx, 'packages', 'standalone', 'current', 'bin', b)]; if (WIN) t.unshift(path.join(process.env.LOCALAPPDATA || path.join(h, 'AppData', 'Local'), 'Programs', 'OpenAI', 'Codex', 'bin', b)); return t; },
    instalar: { win: 'irm https://chatgpt.com/codex/install.ps1 | iex', mac: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh', doc: 'https://developers.openai.com/codex/cli' },
    login: { args: ['login', '--device-auth'], urlRe: /https?:\/\/[^\s"'<>]*(?:openai\.com|chatgpt\.com|localhost|127\.0\.0\.1)[^\s"'<>]*/i },
  },
  grok: {
    bin: 'grok', rotulo: 'Grok', completo: true, permissao: true,
    extras: () => [path.join(os.homedir(), '.grok', 'bin', WIN ? 'grok.exe' : 'grok')],
    instalar: { win: 'irm https://x.ai/cli/install.ps1 | iex', mac: 'curl -fsSL https://x.ai/cli/install.sh | bash', doc: 'https://x.ai/cli' },
    login: { args: ['login', '--device-auth'], urlRe: /https?:\/\/[^\s"'<>]*(?:accounts\.x\.ai|x\.ai)[^\s"'<>]*/i },
    esforcos: ['low', 'medium', 'high'],
  },
  agy: {
    bin: 'agy', rotulo: 'Antigravity', completo: true, permissao: false,
    extras: () => [path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'agy', 'bin', WIN ? 'agy.exe' : 'agy')],
    instalar: { win: 'irm https://antigravity.google/cli/install.ps1 | iex', mac: 'curl -fsSL https://antigravity.google/cli/install.sh | bash', doc: 'https://antigravity.google/docs/cli/install/' },
    login: { args: [], urlRe: /https?:\/\/[^\s"'<>]*(?:accounts\.google\.com|antigravity\.google)[^\s"'<>]*/i, pedeCodigo: /paste\s+the\s+authorization\s+code/i, menu: { resposta: '1\n', confirma: /select\s+login\s+method/i } },
    esforcos: ['low', 'medium', 'high'],
  },
};
const ALIASES = { antigravity: 'agy' };
const SEGURO = /^[\w.\-:[\]/]+$/;

function resolverId(id) { return ALIASES[id] || id; }
function ambiente(extra = {}) { const env = { ...process.env, ...extra }; delete env.ELECTRON_RUN_AS_NODE; delete env.CLAUDECODE; delete env.CLAUDE_CODE_SIMPLE; return env; }

function localizar(bin, { env = ambiente() } = {}) {
  const exts = WIN ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
    for (const e of exts) { const p = path.join(dir, bin + e); try { if (fs.statSync(p).isFile()) return p; } catch { /* não aqui */ } }
  }
  const def = Object.values(AGENTES).find((a) => a.bin === bin);
  for (const p of def?.extras?.() || []) { try { if (fs.statSync(p).isFile()) return p; } catch { /* não aqui */ } }
  return null;
}

// spawn que funciona com .cmd no Windows (precisa de shell) sem abrir brecha: argumentos validados.
function iniciar(exe, args, opts = {}) {
  if (WIN && /\.(cmd|bat)$/i.test(exe)) {
    const q = (a) => (/^[\w.\-:=/\\]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);
    return spawn(`"${exe}" ${args.map(q).join(' ')}`, { ...opts, shell: true, windowsHide: true });
  }
  return spawn(exe, args, { ...opts, windowsHide: true });
}

function spawnCli(id, args, { cwd, env } = {}) {
  id = resolverId(id);
  const def = AGENTES[id]; if (!def) throw new Error(`Agente desconhecido: ${id}`);
  const e = env || ambiente();
  const exe = localizar(def.bin, { env: e }); if (!exe) throw new Error(`${def.rotulo} não está instalado.`);
  return iniciar(exe, args, { cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(), env: e, stdio: ['pipe', 'pipe', 'pipe'] });
}

function rodarCurto(exe, args, { timeout = 20000, env, stdin } = {}) {
  return new Promise((resolve) => {
    let out = ''; let err = '';
    const p = iniciar(exe, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const t = setTimeout(() => { try { p.kill(); } catch { /* já saiu */ } }, timeout);
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
    if (stdin != null) { try { p.stdin.end(stdin); } catch { /* ignora */ } } else try { p.stdin.end(); } catch { /* ignora */ }
  });
}

// ---------------------------------------------------------------- estado (instalado/logado)
async function sondarLogin(id, exe, env) {
  if (id === 'claude') {
    const r = await rodarCurto(exe, ['auth', 'status', '--json'], { env });
    const s = `${r.out}\n${r.err}`; const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { const j = JSON.parse(s.slice(a, b + 1)); return typeof j.loggedIn === 'boolean' ? { logado: j.loggedIn, metodo: j.authMethod || null } : null; } catch { return null; }
  }
  if (id === 'codex') { const r = await rodarCurto(exe, ['login', 'status'], { env }); const s = `${r.out} ${r.err}`.toLowerCase(); if (/not logged in|no credential|logged out/.test(s)) return { logado: false }; if (r.code === 0 && /\blogged in\b/.test(s)) return { logado: true, porApiKey: /api key/.test(s) }; return null; }
  if (id === 'grok') { try { const f = process.env.GROK_AUTH_PATH?.trim() || path.join(process.env.GROK_HOME?.trim() || path.join(os.homedir(), '.grok'), 'auth.json'); if (!fs.existsSync(f)) return { logado: false }; const o = JSON.parse(fs.readFileSync(f, 'utf8')); return { logado: Object.entries(o || {}).some(([k, v]) => (/^https:\/\/(?:auth\.x\.ai|accounts\.x\.ai)/.test(k) || k === 'xai::api_key') && typeof v?.key === 'string' && v.key.trim()) }; } catch { return null; } }
  if (id === 'agy') { const r = await rodarCurto(exe, ['models'], { env }); const s = `${r.out} ${r.err}`; if (/please\s+sign\s+in/i.test(s)) return { logado: false }; return r.code === 0 && r.out.trim() ? { logado: true } : null; }
  return null;
}

async function info(id) {
  id = resolverId(id);
  const def = AGENTES[id]; if (!def) throw new Error(`Agente desconhecido: ${id}`);
  const env = ambiente();
  const caminho = localizar(def.bin, { env });
  const base = { id, nome: def.rotulo, completo: def.completo, permissao: def.permissao, esforcos: def.esforcos || null, modelosEstaticos: def.modelos || null, doc: def.instalar.doc, instalado: !!caminho, caminho };
  if (!caminho) return base;
  const v = await rodarCurto(caminho, ['--version'], { env });
  const versao = (v.out || v.err).trim().split('\n')[0].slice(0, 80);
  let logado = null; try { const s = await sondarLogin(id, caminho, env); logado = s ? s.logado : null; base.metodo = s?.metodo || null; } catch { logado = null; }
  return { ...base, versao, logado };
}

// ---------------------------------------------------------------- descoberta de modelos
function sondaJsonRpc(id, args, inicial, aoReceber, { timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    let feito = false; const fim = (v) => { if (!feito) { feito = true; clearTimeout(t); try { p.kill(); } catch { /* ok */ } resolve(v); } };
    let p; try { p = spawnCli(id, args); } catch { return resolve(null); }
    const env = {}; let buf = '';
    const escrever = (o) => { try { p.stdin.write(JSON.stringify(o) + '\n'); } catch { /* ok */ } };
    const t = setTimeout(() => fim(null), timeout);
    p.on('error', () => fim(null)); p.on('exit', () => fim(null));
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; let o; try { o = JSON.parse(l); } catch { continue; } aoReceber(o, escrever, (_e, val) => fim(val)); } });
    escrever(inicial);
  });
}

function modelosDoTexto(txt) {
  const mapa = new Map(); const ordem = [];
  for (const linha of String(txt).split(/\r?\n/)) {
    const m = linha.match(/^\s*([a-z0-9][a-z0-9.-]+)(?:\t+|\s{2,})(\S.*)$/i); if (!m) continue;
    const id = m[1]; const rot = m[2].trim() || id; const ef = id.match(/-(low|medium|high)$/);
    const base = ef ? id.slice(0, -ef[0].length) : id; const rotulo = ef ? rot.replace(/\s*\((?:high|medium|low)\)\s*$/i, '').trim() : rot;
    if (!mapa.has(base)) { mapa.set(base, { id: base, rotulo, esforcos: [] }); ordem.push(base); }
    if (ef) mapa.get(base).esforcos.push(ef[1]);
  }
  return ordem.map((b) => mapa.get(b));
}

async function modelos(id) {
  id = resolverId(id);
  if (id === 'claude') return { modelos: AGENTES.claude.modelos.map((m) => ({ id: m, rotulo: m, esforcos: AGENTES.claude.esforcos })), esforcos: AGENTES.claude.esforcos };
  if (id === 'codex') {
    const data = await sondaJsonRpc('codex', ['app-server'], { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'noctis-studio', version: '1.0.0' }, capabilities: null } }, (o, escrever, done) => {
      if (o.id === 1) { escrever({ jsonrpc: '2.0', method: 'initialized', params: {} }); escrever({ jsonrpc: '2.0', id: 2, method: 'model/list', params: {} }); }
      else if (o.id === 2) done(null, Array.isArray(o.result?.data) ? o.result.data : []);
    });
    if (!Array.isArray(data)) return { modelos: [], esforcos: [], falhou: true };
    const ms = data.filter((t) => t && t.id && !t.hidden).map((t) => ({ id: t.id, rotulo: t.displayName || t.id, padrao: !!t.isDefault, esforcos: (t.supportedReasoningEfforts || []).map((r) => r?.reasoningEffort).filter(Boolean) }));
    return { modelos: ms, esforcos: [...new Set(ms.flatMap((m) => m.esforcos))] };
  }
  if (id === 'grok') {
    const st = await sondaJsonRpc('grok', ['agent', 'stdio'], { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } } } }, (o, _e, done) => { if (o.id === 1) done(null, o.result?._meta?.modelState || null); });
    const av = Array.isArray(st?.availableModels) ? st.availableModels : null;
    if (!av) return { modelos: [], esforcos: AGENTES.grok.esforcos, falhou: true };
    const ms = av.filter((s) => s?.modelId).map((s) => ({ id: s.modelId, rotulo: s.name || s.modelId, padrao: s.modelId === st.currentModelId, esforcos: (s._meta?.reasoningEfforts || []).map((e) => e?.value).filter(Boolean) }));
    return { modelos: ms, esforcos: [...new Set(ms.flatMap((m) => m.esforcos))].length ? [...new Set(ms.flatMap((m) => m.esforcos))] : AGENTES.grok.esforcos };
  }
  if (id === 'agy') { const r = await rodarCurto(localizar('agy') || 'agy', ['models'], { env: ambiente() }); return r.code === 0 && r.out.trim() ? { modelos: modelosDoTexto(r.out), esforcos: AGENTES.agy.esforcos } : { modelos: [], esforcos: AGENTES.agy.esforcos, falhou: true }; }
  return { modelos: [], esforcos: [] };
}

function validarModelo(id, m) { id = resolverId(id); if (!m) return ''; if (id === 'claude') return AGENTES.claude.modelos.includes(m) ? m : ''; return typeof m === 'string' && m.length <= 80 && SEGURO.test(m) ? m : ''; }
function validarEsforco(id, e) { id = resolverId(id); if (!e) return ''; const lista = AGENTES[id]?.esforcos || AGENTES.claude.esforcos; return lista.includes(e) ? e : ''; }

// ---------------------------------------------------------------- instalar (sem terminal)
const instalacoes = new Map();
function comandoInstalacao(id) { const def = AGENTES[resolverId(id)]; if (!def) return null; return MAC ? def.instalar.mac : def.instalar.win; }

function instalar(id, { onLinha } = {}) {
  id = resolverId(id);
  const def = AGENTES[id]; if (!def) return Promise.reject(new Error('Agente desconhecido.'));
  if (!WIN && !MAC) return Promise.reject(new Error('Instalação automática só no Windows e no macOS. Veja a documentação para instalar manualmente.'));
  if (instalacoes.has(id)) return Promise.reject(new Error('Já existe uma instalação em andamento.'));
  const comando = comandoInstalacao(id);
  const [exe, args] = WIN
    ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comando]]
    : ['/bin/bash', ['-lc', comando]];
  const env = ambiente(def.instalar.env || {});
  return new Promise((resolve) => {
    const p = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    instalacoes.set(id, p);
    const linha = (d) => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) try { onLinha?.(l.trimEnd()); } catch { /* ignora */ } };
    p.stdout.on('data', linha); p.stderr.on('data', linha);
    const timer = setTimeout(() => { try { p.kill(); } catch { /* ok */ } }, 8 * 60 * 1000);
    p.on('error', (e) => { clearTimeout(timer); instalacoes.delete(id); resolve({ ok: false, erro: e.message }); });
    p.on('close', (code) => { clearTimeout(timer); instalacoes.delete(id); const achou = !!localizar(def.bin, { env: ambiente() }); resolve({ ok: achou, code, erro: achou ? null : `O instalador terminou (código ${code}), mas não encontrei o ${def.rotulo}. Veja a documentação.` }); });
  });
}
function cancelarInstalacao(id) { const p = instalacoes.get(resolverId(id)); if (!p) return false; try { p.kill(); } catch { /* ok */ } return true; }

// ---------------------------------------------------------------- login (sem terminal)
// Escudo de navegador: enquanto o login roda, "abrir navegador" vira no-op, e nós abrimos o link
// capturado na janela do sistema (evita link aberto duas vezes e garante que ele apareça).
function criarEscudo() {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-login-'));
    const stubs = WIN ? ['rundll32', 'explorer'] : MAC ? ['open'] : ['xdg-open'];
    for (const s of stubs) { if (WIN) fs.writeFileSync(path.join(dir, `${s}.cmd`), '@echo off\r\nexit /b 0\r\n'); else { const f = path.join(dir, s); fs.writeFileSync(f, '#!/bin/sh\nexit 0\n'); fs.chmodSync(f, 0o755); } }
    return dir;
  } catch { return null; }
}

const logins = new Map();
function iniciarLogin(id, { onEvento, abrirLink }) {
  id = resolverId(id);
  const def = AGENTES[id]; if (!def) throw new Error('Agente desconhecido.');
  if (logins.has(id)) { cancelarLogin(id); }
  const escudo = criarEscudo();
  const env = ambiente(); if (escudo) env.PATH = `${escudo}${path.delimiter}${env.PATH || ''}`;
  const exe = localizar(def.bin, { env }); if (!exe) throw new Error(`${def.rotulo} não está instalado.`);
  const emitir = (e) => { try { onEvento(e); } catch { /* ignora */ } };
  const p = iniciar(exe, def.login.args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const reg = { proc: p, escudo, abriu: false, menuRespondido: false };
  logins.set(id, reg);
  let buf = '';
  const olhar = (txt) => {
    buf = (buf + txt).slice(-8000);
    for (const l of String(txt).split(/\r?\n/)) if (l.trim()) emitir({ tipo: 'linha', texto: l.trimEnd() });
    if (def.login.menu && !reg.menuRespondido && def.login.menu.confirma.test(buf)) { reg.menuRespondido = true; try { p.stdin.write(def.login.menu.resposta); } catch { /* ok */ } }
    const u = buf.match(def.login.urlRe); if (u && !reg.abriu) { reg.abriu = true; emitir({ tipo: 'url', url: u[0] }); try { abrirLink(u[0]); } catch { /* ok */ } }
    if (def.login.pedeCodigo && def.login.pedeCodigo.test(buf)) emitir({ tipo: 'pedeCodigo' });
  };
  p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
  p.stdout.on('data', olhar); p.stderr.on('data', olhar);
  p.on('error', (e) => { logins.delete(id); limparEscudo(escudo); emitir({ tipo: 'fim', ok: false, erro: e.message }); });
  p.on('close', async (code) => {
    logins.delete(id); limparEscudo(escudo);
    let logado = null; try { const s = await sondarLogin(id, localizar(def.bin) || def.bin, ambiente()); logado = s?.logado ?? null; } catch { /* ok */ }
    emitir({ tipo: 'fim', ok: logado === true || (logado === null && code === 0), code, logado });
  });
  return true;
}
function enviarLoginInput(id, texto) { const r = logins.get(resolverId(id)); if (!r) return false; try { r.proc.stdin.write(String(texto).replace(/\r?\n?$/, '') + '\n'); return true; } catch { return false; } }
function cancelarLogin(id) { const r = logins.get(resolverId(id)); if (!r) return false; try { r.proc.kill(); } catch { /* ok */ } limparEscudo(r.escudo); logins.delete(resolverId(id)); return true; }
function limparEscudo(dir) { if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } }

module.exports = {
  AGENTES, resolverId, ambiente, localizar, spawnCli, info, modelos, validarModelo, validarEsforco,
  instalar, cancelarInstalacao, comandoInstalacao, iniciarLogin, enviarLoginInput, cancelarLogin,
};
