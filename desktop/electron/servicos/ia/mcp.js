// Servidor MCP "noctis-studio" (stdio, JSON-RPC 2.0 uma mensagem por linha).
// Roda como Node puro: "Noctis Studio.exe" com ELECTRON_RUN_AS_NODE=1 e este script — sem janela,
// sem trava de instância única, funciona com o app aberto ou fechado:
//   • app aberto e API local respondendo → repassa para a API (mesmo estado da tela);
//   • app fechado → ferramentas de pasta/arquivo rodam aqui mesmo; as do Pixabay abrem o
//     Noctis Studio em modo sem janela (--noctis-ia), que fecha sozinho ao terminar.
// stdout é SÓ do protocolo: qualquer log vai para stderr (o Claude grava em
// %APPDATA%\Claude\logs\mcp-server-noctis-studio.log).
for (const k of ['log', 'info', 'warn', 'debug']) console[k] = (...a) => process.stderr.write(`${a.map(String).join(' ')}\n`);

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');
const { paraMcp, PIXABAY, NOMES, executar } = require('./ferramentas-ia');
const amb = require('./ambiente');

const DATA = amb.dataDirPadrao();
const VERSAO = (() => {
  for (const p of [path.join(__dirname, '..', '..', '..', 'package.json'), path.join(__dirname.replace('app.asar.unpacked', 'app.asar'), '..', '..', '..', 'package.json')]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')).version; } catch { /* próximo */ }
  }
  return '0';
})();

const INSTRUCOES = [
  'Noctis Studio: banco de sons (Pixabay) e renomeação de arquivos no computador do usuário.',
  'Áudio: use search_library antes de baixar; prefira resultados com contentId=false (sem reivindicação no YouTube); deixe download_audio escolher a categoria; use o caminho absoluto devolvido.',
  'Se uma resposta trouxer "notice", repita o aviso ao usuário (ex.: pasta criada e onde).',
  'Nunca apague nem mova pastas do banco de sons. set_sound_folder só quando o usuário pedir.',
  'Renomear: preview_rename → mostre a lista {de, para} ao usuário → só depois de ele aprovar, apply_rename. Guarde o operationId para undo_rename.',
].join('\n');

// ------------------------------------------------------------------ via API local (app aberto)
function pedirApi(porta, metodo, rota, { chave, corpo, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo));
    const req = http.request({
      host: '127.0.0.1', port: porta, path: rota, method: metodo, timeout: timeoutMs,
      headers: { Host: `127.0.0.1:${porta}`, ...(chave ? { 'X-API-Key': chave } : {}), ...(dados ? { 'Content-Type': 'application/json', 'Content-Length': dados.length } : {}) },
    }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(txt) }); } catch { reject(new Error('Resposta inválida da API local.')); } });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('A API local não respondeu a tempo.'), { code: 'TIMEOUT' })));
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

async function apiDisponivel() {
  const cfg = amb.configDeArquivo(DATA).get();
  const porta = Number(cfg.ia?.porta) || 47821;
  const chave = cfg.ia?.chave;
  if (!chave) return null;
  try {
    const r = await pedirApi(porta, 'GET', '/api/health', { timeoutMs: 800 });
    return r.status === 200 && r.json?.app === 'noctis-studio' ? { porta, chave } : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ sem o app aberto
let nucleoLocal = null;
function nucleo() {
  if (nucleoLocal) return nucleoLocal;
  const { criarNucleo } = require('./nucleo');
  const lib = require('../audio-atlas/library');
  const ren = require('../renomeador');
  const arq = amb.arquivos(DATA);
  lib.init(arq.estadoAA);
  ren.setHistorico(arq.historico);
  nucleoLocal = criarNucleo({
    lib, ren, translate: async (q) => ({ english: q, translated: false }),
    pixabay: () => { throw Object.assign(new Error('Pixabay só pelo modo sem janela.'), { code: 'ERROR' }); },
    config: amb.configDeArquivo(DATA), dataDir: DATA, documentsDir: amb.documentosPadrao(DATA),
  });
  return nucleoLocal;
}

// Abre o Noctis Studio sem janela só para esta chamada (o Pixabay precisa do Chromium do app).
function semJanela(nome, args) {
  return new Promise((resolve, reject) => {
    const dir = path.join(os.tmpdir(), `noctis-ia-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(dir, { recursive: true });
    const req = path.join(dir, 'pedido.json');
    const res = path.join(dir, 'resposta.json');
    fs.writeFileSync(req, JSON.stringify({ nome, args }));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const pre = env.NOCTIS_DEV_APP ? [env.NOCTIS_DEV_APP] : []; // dev: electron.exe <pasta do app>
    const p = spawn(process.execPath, [...pre, '--noctis-ia', req, res], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let erroTxt = '';
    p.stderr.on('data', (d) => { erroTxt = (erroTxt + d).slice(-2000); });
    const limite = setTimeout(() => { try { p.kill(); } catch { /* já saiu */ } }, 10 * 60 * 1000);
    p.on('error', (e) => { clearTimeout(limite); reject(e); });
    p.on('close', () => {
      clearTimeout(limite);
      let r = null;
      try { r = JSON.parse(fs.readFileSync(res, 'utf8')); } catch { /* sem resposta */ }
      fs.rmSync(dir, { recursive: true, force: true });
      if (!r) return reject(Object.assign(new Error(`O Noctis Studio (modo sem janela) não respondeu.${erroTxt ? ` ${erroTxt.trim().split('\n').pop()}` : ''}`), { code: 'ERROR' }));
      if (r.ok) resolve(r.result); else reject(Object.assign(new Error(r.error?.message || 'Erro'), { code: r.error?.code || 'ERROR', retryAfter: r.error?.retryAfter }));
    });
  });
}

async function chamar(nome, args) {
  if (!NOMES.has(nome)) throw Object.assign(new Error(`Ferramenta desconhecida: ${nome}`), { rpcCode: -32602 });
  amb.exigirAcesso(DATA);
  const api = await apiDisponivel();
  if (api) {
    const r = await pedirApi(api.porta, 'POST', `/api/tools/${nome}`, { chave: api.chave, corpo: args || {}, timeoutMs: 11 * 60 * 1000 });
    if (r.status === 200) return r.json;
    throw Object.assign(new Error(r.json?.error?.message || `API local respondeu ${r.status}`), { code: r.json?.error?.code || 'ERROR' });
  }
  if (PIXABAY.has(nome)) return semJanela(nome, args || {});
  return executar(nucleo(), nome, args || {});
}

// ------------------------------------------------------------------ protocolo
async function tratar({ method, params = {} }) {
  if (method === 'initialize') {
    return { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'noctis-studio', title: 'Noctis Studio', version: VERSAO }, instructions: INSTRUCOES };
  }
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: paraMcp() };
  if (method === 'tools/call') {
    try {
      const out = await chamar(params.name, params.arguments || {});
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    } catch (e) {
      if (e.rpcCode) throw e;
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message, code: e.code || 'ERROR', ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) }) }] };
    }
  }
  throw Object.assign(new Error(`Método não suportado: ${method}`), { rpcCode: -32601 });
}

function servir(entrada = process.stdin, saida = process.stdout) {
  return new Promise((resolve) => {
    const enviar = (msg) => saida.write(`${JSON.stringify(msg)}\n`);
    let fila = Promise.resolve();
    const rl = readline.createInterface({ input: entrada });
    rl.on('close', () => fila.then(resolve));
    rl.on('line', (linha) => {
      let msg;
      try { msg = JSON.parse(linha); } catch { enviar({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }); return; }
      if (msg.id === undefined || msg.id === null) return; // notificações (initialized, cancelled)
      fila = fila.then(() => tratar(msg))
        .then((result) => enviar({ jsonrpc: '2.0', id: msg.id, result }))
        .catch((e) => enviar({ jsonrpc: '2.0', id: msg.id, error: { code: e.rpcCode || -32603, message: e.message } }));
    });
  });
}

if (require.main === module) servir().then(() => process.exit(0));

module.exports = { servir, tratar, chamar };
