// Servidor MCP noctis-studio como o Claude o abre: processo separado, stdio, JSON-RPC por linha.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { criarApiLocal } = require('../electron/servicos/ia/api-local');
const amb = require('../electron/servicos/ia/ambiente');

const SCRIPT = path.join(__dirname, '..', 'electron', 'servicos', 'ia', 'mcp.js');
let TMP;
let DATA;

function abrirMcp() {
  const p = spawn(process.execPath, [SCRIPT], { env: { ...process.env, NOCTIS_STUDIO_DATA: DATA }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const linhas = [];
  const espera = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      linhas.push(l);
      const m = JSON.parse(l); // stdout só pode ter JSON-RPC
      espera.get(m.id)?.(m);
    }
  });
  let id = 0;
  const pedir = (method, params) => new Promise((resolve) => { id++; espera.set(id, resolve); p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  const chamar = async (name, args = {}) => {
    const r = await pedir('tools/call', { name, arguments: args });
    return { erro: !!r.result.isError, dados: JSON.parse(r.result.content[0].text) };
  };
  return { p, pedir, chamar, linhas, fechar: () => new Promise((r) => { p.on('close', r); p.stdin.end(); }) };
}

const gravarConfig = (obj) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(obj)); };

before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-mcp-'));
  DATA = path.join(TMP, 'Noctis Studio');
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('initialize + tools/list: nomes, esquemas e instruções', async () => {
  const m = abrirMcp();
  const init = await m.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.strictEqual(init.result.serverInfo.name, 'noctis-studio');
  assert.ok(init.result.capabilities.tools);
  assert.match(init.result.instructions, /search_library/);
  m.p.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  const l = await m.pedir('tools/list');
  const nomes = l.result.tools.map((t) => t.name);
  assert.deepStrictEqual(nomes.slice(0, 4), ['search_audio', 'download_audio', 'search_library', 'list_categories']);
  assert.ok(l.result.tools.every((t) => t.inputSchema && t.description && t.annotations));
  const desconhecido = await m.pedir('tools/call', { name: 'rm_rf', arguments: {} });
  assert.strictEqual(desconhecido.error.code, -32602);
  await m.fechar();
  assert.ok(m.linhas.every((x) => x.startsWith('{"jsonrpc":"2.0"')));
});

test('sem login no app: recusa com NOT_SIGNED_IN', async () => {
  gravarConfig({});
  const m = abrirMcp();
  const r = await m.chamar('list_categories');
  assert.ok(r.erro);
  assert.deepStrictEqual(Object.keys(r.dados), ['ok', 'error', 'code']);
  assert.strictEqual(r.dados.code, 'NOT_SIGNED_IN');
  await m.fechar();
});

test('app fechado: cria a pasta padrão em Documentos e avisa; renomeia com prévia', async () => {
  const docs = path.join(TMP, 'Documentos');
  const liberada = path.join(TMP, 'videos');
  fs.mkdirSync(liberada, { recursive: true });
  fs.writeFileSync(path.join(liberada, 'take FINAL.mp4'), '');
  gravarConfig({ ia: { porta: 1, chave: 'x'.repeat(43), pastasRenomear: [liberada] } }); // porta 1: API "fechada"
  amb.gravarAcesso(DATA, { email: 't@t', documentsDir: docs });
  const m = abrirMcp();
  const c = await m.chamar('list_categories');
  assert.ok(!c.erro, JSON.stringify(c.dados));
  assert.strictEqual(c.dados.root, path.join(docs, 'Noctis Studio', 'Banco de sons'));
  assert.match(c.dados.notice, /criei/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8')).audioAtlas.root, c.dados.root);

  const p = await m.chamar('preview_rename', { folder: liberada, actions: [{ tipo: 'caixa', modo: 'min' }] });
  assert.deepStrictEqual(p.dados.changes, [{ de: 'take FINAL.mp4', para: 'take final.mp4' }]);
  const a = await m.chamar('apply_rename', { previewId: p.dados.previewId });
  assert.strictEqual(a.dados.renamed, 1);
  assert.ok(fs.existsSync(path.join(liberada, 'take final.mp4')));
  const u = await m.chamar('undo_rename', { operationId: a.dados.operationId });
  assert.strictEqual(u.dados.restored, 1);
  const fora = await m.chamar('preview_rename', { folder: TMP, actions: [{ tipo: 'limpar' }] });
  assert.strictEqual(fora.dados.code, 'FOLDER_NOT_ALLOWED');

  // Pixabay com o app fechado precisa do Noctis Studio.exe; aqui (node) falha com erro claro, sem derrubar o MCP.
  const s = await m.chamar('search_audio', { query: 'x', type: 'music' });
  assert.ok(s.erro);
  assert.strictEqual(s.dados.code, 'ERROR');
  assert.ok((await m.pedir('ping')).result);
  await m.fechar();
});

test('app aberto: repassa para a API local com a chave', async () => {
  const chave = 'k'.repeat(43);
  const recebidos = [];
  const nucleo = new Proxy({}, { get: (_t, nome) => async (args) => { recebidos.push([nome, args]); return { via: 'api', nome }; } });
  const api = criarApiLocal({ nucleo, getConfig: () => ({ ia: { chave } }), log: { warn() {} } });
  const e = await api.iniciar(0);
  gravarConfig({ ia: { porta: e.porta, chave } });
  amb.gravarAcesso(DATA, { email: 't@t' });
  const m = abrirMcp();
  const r = await m.chamar('search_audio', { query: 'dark', type: 'sfx', limit: 3 });
  assert.deepStrictEqual(r.dados, { via: 'api', nome: 'search_audio' });
  assert.deepStrictEqual(recebidos, [['search_audio', { query: 'dark', type: 'sfx', limit: 3 }]]);
  gravarConfig({ ia: { porta: e.porta, chave: 'errada'.repeat(8) } });
  const neg = await m.chamar('list_categories');
  assert.strictEqual(neg.dados.code, 'UNAUTHORIZED');
  await m.fechar();
  api.parar();
});
