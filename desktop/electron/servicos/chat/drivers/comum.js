// Peças compartilhadas pelos drivers de IA (Codex, Grok, Antigravity).
// Vocabulário de eventos que todos emitem (o chat.js monta a mensagem a partir deles):
//   sessao | texto-delta | pensando-delta | ferramenta-inicio | ferramenta |
//   ferramenta-resultado | ferramenta-negada | ferramenta-fim | pedido-permissao |
//   permissao-cancelada | resultado | erro | silencio | resume-falhou | interrompido
const readline = require('readline');
const { spawn } = require('child_process');

const WIN = process.platform === 'win32';

function matarArvore(proc) {
  if (!proc || proc.killed) return;
  try {
    if (WIN && proc.pid) spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
    else proc.kill('SIGTERM');
  } catch { /* já saiu */ }
}

// Lê linhas NDJSON da saída de um processo e chama fn(obj) para cada JSON válido.
function lerLinhas(stream, fn) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  rl.on('line', (linha) => {
    const t = linha.trim();
    if (!t) return;
    let obj;
    try { obj = JSON.parse(t); } catch { return; }
    fn(obj);
  });
  return rl;
}

// Resumo curto da entrada de uma ferramenta, para a UI.
function resumirEntrada(e = {}) {
  if (!e || typeof e !== 'object') return '';
  const campos = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'CommandLine', 'Command', 'TargetFile', 'AbsolutePath', 'description', 'prompt', 'nome'];
  for (const c of campos) if (e[c] != null) return String(e[c]).split('\n')[0].slice(0, 120);
  const k = Object.keys(e)[0];
  return k ? `${k}: ${String(e[k]).slice(0, 80)}` : '';
}

module.exports = { WIN, matarArvore, lerLinhas, resumirEntrada };
