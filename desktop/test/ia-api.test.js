// API local: só 127.0.0.1, X-API-Key, Host/Origin, erros em JSON, 429 com Retry-After.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { criarApiLocal, novaChave } = require('../electron/servicos/ia/api-local');

const CHAVE = novaChave();
let api;
let porta;
const chamadas = [];

const erro = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const nucleo = {
  search_audio: async (a) => { chamadas.push(['search_audio', a]); if (a.query === 'lotado') throw erro('RATE_LIMITED', 'Fila do Pixabay cheia.', { retryAfter: 12 }); return { query: a.query, searchedAs: a.query, translated: false, type: a.type, results: [] }; },
  download_audio: async (a) => { chamadas.push(['download_audio', a]); return { ok: true, duplicate: false, id: a.id, title: 't', category: 'Woosh', newFolder: false, path: 'C:\\x.mp3' }; },
  list_categories: () => ({ root: '/banco', categories: ['Woosh'] }),
  search_library: (a) => ({ query: a.query, count: 0, results: [] }),
  set_sound_folder: () => ({ ok: true }),
  list_rename_folders: () => ({ folders: [] }),
  preview_rename: () => { throw erro('FOLDER_NOT_ALLOWED', 'Pasta não liberada.'); },
  apply_rename: () => { throw erro('PREVIEW_EXPIRED', 'Expirou.'); },
  undo_rename: () => { throw new Error('quebrou por dentro'); },
};

function pedir(caminho, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method, headers: { Host: `127.0.0.1:${porta}`, ...headers } }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch { /* html/markdown */ } resolve({ status: res.statusCode, headers: res.headers, txt, json }); });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
const comChave = (h = {}) => ({ 'X-API-Key': CHAVE, ...h });

before(async () => {
  api = criarApiLocal({ nucleo, getConfig: () => ({ ia: { chave: CHAVE } }), versao: '9.9.9', guia: () => '# Guia', log: { warn() {} } });
  const e = await api.iniciar(0);
  assert.ok(e.ativa);
  porta = api.estado().porta;
});
after(() => api.parar());

test('rotas livres: /, /api/health, /api/guide', async () => {
  const h = await pedir('/api/health');
  assert.strictEqual(h.status, 200);
  assert.deepStrictEqual(h.json, { ok: true, app: 'noctis-studio', version: '9.9.9', port: porta });
  const g = await pedir('/api/guide');
  assert.strictEqual(g.txt, '# Guia');
  const p = await pedir('/');
  assert.match(p.headers['content-type'], /text\/html/);
  assert.ok(!p.txt.includes(CHAVE));
});

test('chave obrigatória e comparada exatamente', async () => {
  const sem = await pedir('/api/categories');
  assert.strictEqual(sem.status, 401);
  assert.strictEqual(sem.json.error.code, 'UNAUTHORIZED');
  assert.strictEqual((await pedir('/api/categories', { headers: { 'X-API-Key': CHAVE.slice(0, -1) + 'x' } })).status, 401);
  const ok = await pedir('/api/categories', { headers: comChave() });
  assert.deepStrictEqual(ok.json, { root: '/banco', categories: ['Woosh'] });
});

test('Host e Origin de fora são recusados', async () => {
  assert.strictEqual((await pedir('/api/health', { headers: { Host: 'evil.com' } })).status, 403);
  assert.strictEqual((await pedir('/api/health', { headers: { Host: `127.0.0.1:${porta + 1}` } })).status, 403);
  const o = await pedir('/api/categories', { headers: comChave({ Origin: 'https://evil.com' }) });
  assert.strictEqual(o.status, 403);
  assert.strictEqual(o.json.error.code, 'FORBIDDEN');
  const mesma = await pedir('/api/categories', { headers: comChave({ Origin: `http://127.0.0.1:${porta}` }) });
  assert.strictEqual(mesma.status, 200);
  assert.strictEqual(mesma.headers['access-control-allow-origin'], `http://127.0.0.1:${porta}`);
  assert.strictEqual((await pedir('/api/health', { headers: { Host: `localhost:${porta}` } })).status, 200);
});

test('busca por query string e download por POST JSON', async () => {
  const r = await pedir('/api/audio/search?query=dark%20ambient&type=sfx&limit=5&duration=short', { headers: comChave() });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(chamadas.at(-1), ['search_audio', { query: 'dark ambient', type: 'sfx', limit: 5, duration: 'short' }]);
  const d = await pedir('/api/audio/download', { method: 'POST', headers: comChave({ 'Content-Type': 'application/json' }), body: { id: '382724', type: 'music' } });
  assert.strictEqual(d.json.path, 'C:\\x.mp3');
  const g = await pedir('/api/tools/list_categories', { method: 'POST', headers: comChave(), body: {} });
  assert.strictEqual(g.status, 200);
});

test('erros: JSON padrão, status certo, sem stack', async () => {
  const casos = [
    [await pedir('/api/rename/preview', { method: 'POST', headers: comChave(), body: { folder: 'C:\\' } }), 403, 'FOLDER_NOT_ALLOWED'],
    [await pedir('/api/rename/apply', { method: 'POST', headers: comChave(), body: { previewId: 'x' } }), 409, 'PREVIEW_EXPIRED'],
    [await pedir('/api/rename/undo', { method: 'POST', headers: comChave(), body: {} }), 500, 'ERROR'],
    [await pedir('/api/nada', { headers: comChave() }), 404, 'NOT_FOUND'],
    [await pedir('/api/audio/download', { headers: comChave() }), 400, 'USAGE'],
    [await pedir('/api/audio/download', { method: 'POST', headers: comChave(), body: '{quebrado' }), 400, 'BAD_JSON'],
  ];
  for (const [r, status, code] of casos) {
    assert.strictEqual(r.status, status, code);
    assert.deepStrictEqual(Object.keys(r.json), ['error']);
    assert.strictEqual(r.json.error.code, code);
    assert.ok(!/at .*\.js/.test(r.txt), 'sem stack');
  }
});

test('429 com Retry-After', async () => {
  const r = await pedir('/api/audio/search?query=lotado&type=music', { headers: comChave() });
  assert.strictEqual(r.status, 429);
  assert.strictEqual(r.headers['retry-after'], '12');
  assert.strictEqual(r.json.error.code, 'RATE_LIMITED');
});

test('porta ocupada: avisa e não troca', async () => {
  const outra = criarApiLocal({ nucleo, getConfig: () => ({ ia: { chave: CHAVE } }), log: { warn() {} } });
  const e = await outra.iniciar(porta);
  assert.deepStrictEqual(e, { ativa: false, porta, erro: 'porta-ocupada' });
});
