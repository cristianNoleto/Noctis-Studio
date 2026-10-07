// API local do Noctis Studio para qualquer IA (curl, scripts, navegador embutido do Claude).
//   • Só escuta em 127.0.0.1 (nunca na rede). Porta padrão 47821 (configurável). Se estiver
//     ocupada, NÃO troca sozinha: avisa na tela (estado.erro = 'porta-ocupada').
//   • Chave obrigatória no cabeçalho X-API-Key, exceto GET /, /api/health e /api/guide.
//   • Rejeita Host diferente de 127.0.0.1:<porta>/localhost:<porta> (DNS rebinding) e Origin de
//     outro site (CORS só para a própria origem — a página GET / pode usar fetch).
//   • Erros sempre { "error": { "code", "message" } }, sem stack.
const http = require('http');
const crypto = require('crypto');
const { FERRAMENTAS, NOMES, executar } = require('./ferramentas-ia');

const PORTA_PADRAO = 47821;
const MAX_CORPO = 64 * 1024;

const STATUS = {
  USAGE: 400, BAD_CATEGORY: 400, BAD_JSON: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403, FOLDER_NOT_ALLOWED: 403, NOT_SIGNED_IN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409, PREVIEW_STALE: 409, PREVIEW_EXPIRED: 409, HAS_CONFLICTS: 409, LOCKED: 409, NO_ROOT: 409,
  TOO_LARGE: 400,
  RATE_LIMITED: 429,
};

function chaveIgual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

const novaChave = () => crypto.randomBytes(32).toString('base64url');

function paginaInicial(porta, versao) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Noctis Studio · API local</title>
<style>body{font:15px/1.55 system-ui,sans-serif;background:#0d0e12;color:#d6dae3;max-width:760px;margin:40px auto;padding:0 16px}h1{font-size:22px;color:#fff}code,pre{background:#161922;border:1px solid #262a36;border-radius:8px;padding:2px 6px;color:#7fe7f5}pre{padding:12px;overflow:auto}a{color:#00e5ff}</style></head>
<body><h1>Noctis Studio — API local</h1>
<p>Versão ${versao}. Esta API só aceita conexões deste computador (<code>127.0.0.1:${porta}</code>).</p>
<p>Todas as rotas, exceto <code>/</code>, <code>/api/health</code> e <code>/api/guide</code>, exigem o cabeçalho <code>X-API-Key</code> (a chave fica em Noctis Studio &gt; Conectar IA).</p>
<p>Guia completo para IAs: <a href="/api/guide">/api/guide</a></p>
<pre>const r = await fetch('/api/categories', { headers: { 'X-API-Key': 'SUA_CHAVE' } });
console.log(await r.json());</pre>
</body></html>`;
}

function criarApiLocal({ nucleo, getConfig, versao = '0', guia = () => '', acessoOk = () => true, log = console }) {
  let servidor = null;
  let estado = { ativa: false, porta: null, erro: null };

  function responder(res, status, corpo, extra = {}) {
    const json = JSON.stringify(corpo);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(json);
  }
  function falhar(res, code, message, extra = {}) {
    const status = STATUS[code] || 500;
    responder(res, status, { error: { code: status === 500 && !code ? 'ERROR' : code || 'ERROR', message } }, extra);
  }

  function lerCorpo(req) {
    return new Promise((resolve, reject) => {
      let total = 0;
      const partes = [];
      req.on('data', (c) => {
        total += c.length;
        if (total > MAX_CORPO) { reject(Object.assign(new Error('Corpo da requisição grande demais (máx. 64 KB).'), { code: 'TOO_LARGE' })); req.destroy(); return; }
        partes.push(c);
      });
      req.on('end', () => {
        const txt = Buffer.concat(partes).toString('utf8').trim();
        if (!txt) return resolve({});
        try {
          const v = JSON.parse(txt);
          if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
          resolve(v);
        } catch { reject(Object.assign(new Error('Corpo inválido: envie um objeto JSON.'), { code: 'BAD_JSON' })); }
      });
      req.on('error', reject);
    });
  }

  // Rotas → ferramenta + de onde vêm os argumentos.
  const ROTAS = new Map(FERRAMENTAS.map((f) => [`${f.rota[0]} ${f.rota[1]}`, f.name]));
  const NUMERICOS = new Set(['limit']);
  function argsDaQuery(url) {
    const a = {};
    for (const [k, v] of url.searchParams) a[k] = NUMERICOS.has(k) && v !== '' ? Number(v) : v;
    return a;
  }

  async function tratar(req, res) {
    const porta = estado.porta;
    const origensOk = [`http://127.0.0.1:${porta}`, `http://localhost:${porta}`];
    const host = String(req.headers.host || '').toLowerCase();
    if (host !== `127.0.0.1:${porta}` && host !== `localhost:${porta}`) return falhar(res, 'FORBIDDEN', 'Host não permitido. Use http://127.0.0.1:' + porta);
    const origem = req.headers.origin;
    if (origem && !origensOk.includes(origem)) return falhar(res, 'FORBIDDEN', 'Origem não permitida: a API só aceita chamadas deste computador (ou da própria página em /).');
    const cors = origem ? { 'Access-Control-Allow-Origin': origem, Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, X-API-Key', 'Access-Control-Max-Age': '600' });
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${porta}`);
    const rota = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && rota === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'", ...cors });
      return res.end(paginaInicial(porta, versao));
    }
    if (req.method === 'GET' && rota === '/api/health') return responder(res, 200, { ok: true, app: 'noctis-studio', version: versao, port: porta }, cors);
    if (req.method === 'GET' && rota === '/api/guide') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store', ...cors });
      return res.end(guia());
    }

    if (!chaveIgual(req.headers['x-api-key'], getConfig().ia?.chave)) return falhar(res, 'UNAUTHORIZED', 'Chave ausente ou inválida. Envie o cabeçalho X-API-Key com a chave de Noctis Studio > Conectar IA.', cors);
    if (!acessoOk()) return falhar(res, 'NOT_SIGNED_IN', 'Entre na sua conta Noctis no app Noctis Studio para liberar as ferramentas.', cors);

    let nome = ROTAS.get(`${req.method} ${rota}`);
    const generica = rota.match(/^\/api\/tools\/([a-z_]+)$/);
    if (!nome && generica && req.method === 'POST' && NOMES.has(generica[1])) nome = generica[1];
    if (!nome) {
      const existe = [...ROTAS.keys()].some((k) => k.endsWith(` ${rota}`)) || !!generica;
      return falhar(res, existe ? 'USAGE' : 'NOT_FOUND', existe ? `Método ${req.method} não aceito em ${rota}.` : `Rota não encontrada: ${rota}. Veja /api/guide.`, cors);
    }
    const args = req.method === 'GET' ? argsDaQuery(url) : await lerCorpo(req);
    const out = await executar(nucleo, nome, args);
    return responder(res, 200, out, cors);
  }

  function iniciar(porta = getConfig().ia?.porta || PORTA_PADRAO) {
    return new Promise((resolve) => {
      parar();
      const s = http.createServer((req, res) => {
        tratar(req, res).catch((e) => {
          if (res.headersSent) { res.end(); return; }
          const code = e.code && (STATUS[e.code] || /^[A-Z_]+$/.test(e.code)) ? e.code : 'ERROR';
          const extra = code === 'RATE_LIMITED' ? { 'Retry-After': String(Math.max(1, Math.ceil(Number(e.retryAfter) || 10))) } : {};
          if (!STATUS[code]) log.warn?.(`API local: ${e.message}`);
          falhar(res, code, e.message || 'Erro interno.', extra);
        });
      });
      s.headersTimeout = 15000;
      s.requestTimeout = 10 * 60 * 1000; // download longo do Pixabay
      s.once('error', (e) => {
        estado = { ativa: false, porta, erro: e.code === 'EADDRINUSE' ? 'porta-ocupada' : e.message };
        log.warn?.(e.code === 'EADDRINUSE' ? `API local: a porta ${porta} já está em uso por outro programa. Escolha outra em Conectar IA.` : `API local: ${e.message}`);
        resolve(estado);
      });
      s.listen(porta, '127.0.0.1', () => {
        servidor = s;
        estado = { ativa: true, porta: s.address().port, erro: null };
        resolve(estado);
      });
    });
  }

  function parar() {
    if (servidor) { try { servidor.close(); servidor.closeAllConnections?.(); } catch { /* já fechada */ } }
    servidor = null;
    estado = { ...estado, ativa: false };
  }

  return { iniciar, parar, estado: () => ({ ...estado }) };
}

module.exports = { criarApiLocal, novaChave, PORTA_PADRAO, STATUS };
