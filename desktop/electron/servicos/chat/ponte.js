// Ponte local entre o servidor MCP "noctis" (processo filho do agente de IA) e o app.
// Só escuta em 127.0.0.1, porta aleatória, e exige um token aleatório gerado a cada abertura.
const http = require('http');
const crypto = require('crypto');

function criarPonte({ catalogo, executar, aprovar, log }) {
  const token = crypto.randomBytes(32).toString('hex');
  const esperado = Buffer.from(`Bearer ${token}`);
  let servidor = null;
  let url = null;

  const autorizado = (req) => {
    const h = Buffer.from(String(req.headers.authorization || ''));
    return h.length === esperado.length && crypto.timingSafeEqual(h, esperado);
  };
  const json = (res, status, corpo) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(corpo)); };
  const lerCorpo = (req) => new Promise((resolve, reject) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { s += d; if (s.length > 5e6) { reject(new Error('Corpo grande demais')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });

  async function atender(req, res) {
    if (!autorizado(req)) return json(res, 401, { ok: false, error: 'Não autorizado' });
    const exec = String(req.headers['x-noctis-exec'] || '');
    try {
      if (req.method === 'GET' && req.url === '/catalogo') return json(res, 200, { ok: true, data: catalogo() });
      if (req.method === 'POST' && req.url === '/ferramenta') {
        const { nome, args } = await lerCorpo(req);
        return json(res, 200, { ok: true, data: await executar(nome, args, exec) });
      }
      if (req.method === 'POST' && req.url === '/aprovar') {
        const pedido = await lerCorpo(req);
        return json(res, 200, { ok: true, data: await aprovar(pedido, exec) });
      }
      return json(res, 404, { ok: false, error: 'Rota desconhecida' });
    } catch (e) {
      if (log) log.warn(`Chat IA (ferramenta): ${e.message}`);
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  return {
    token,
    url: () => url,
    async abrir() {
      if (servidor) return url;
      servidor = http.createServer((req, res) => { atender(req, res); });
      servidor.requestTimeout = 0; // /aprovar pode esperar o usuário
      servidor.headersTimeout = 30000;
      await new Promise((resolve, reject) => { servidor.once('error', reject); servidor.listen(0, '127.0.0.1', resolve); });
      url = `http://127.0.0.1:${servidor.address().port}`;
      return url;
    },
    fechar() { if (servidor) servidor.close(); servidor = null; url = null; },
  };
}

module.exports = { criarPonte };
