// Núcleo das ferramentas para IAs: áudio (Pixabay SIMULADO, pastas temporárias) e renomeador.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { criarNucleo } = require('../electron/servicos/ia/nucleo');
const { FERRAMENTAS, paraMcp, executar } = require('../electron/servicos/ia/ferramentas-ia');
const { merge } = require('../electron/lib/store');
const lib = require('../electron/servicos/audio-atlas/library');
const ren = require('../electron/servicos/renomeador');

let TMP;
let servidor;
let porta;
let buscas;

function configMemoria(inicial = {}) {
  let data = merge({ audioAtlas: { root: '', intervalMs: 1500 }, ia: { pastasRenomear: [] } }, inicial);
  return { get: () => data, set: (p) => { data = merge(data, p); return data; } };
}

function pixabayFalso() {
  const item = (id, title, extra = {}) => ({ id: String(id), title, author: 'autor', type: 'music', tags: ['dark', 'ambient'], duration: 95, pageUrl: `https://pixabay.com/music/x-${id}/`, genre: 'ambient', contentId: false, src: `http://127.0.0.1:${porta}/${id}.mp3`, ...extra });
  return {
    search: async ({ query, page }) => { buscas.push({ query, page }); return { items: Array.from({ length: 20 }, (_, i) => item(100000 + (page - 1) * 20 + i, `${query} ${i}`)), pages: 3 }; },
    getItem: async (id) => item(id, 'Dark Ambient Tension'),
    userAgent: () => 'teste',
    polite: (fn) => fn(),
  };
}

function nucleo(cfg, extra = {}) {
  return criarNucleo({
    lib, pixabay: pixabayFalso(), translate: async (q) => ({ english: q === 'suspense escuro' ? 'dark suspense' : q, translated: q === 'suspense escuro' }),
    ren, config: cfg, dataDir: path.join(TMP, 'dados'), documentsDir: path.join(TMP, 'Documentos'), ...extra,
  });
}

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-ia-'));
  lib.init(path.join(TMP, 'dados', 'audio-atlas'));
  ren.setHistorico(path.join(TMP, 'dados', 'renomeador', 'historico'));
  servidor = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); res.end(Buffer.alloc(2048, 7)); });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  porta = servidor.address().port;
});
after(() => { servidor.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('definições: as 4 de áudio iguais ao Audio Atlas e anotações de leitura', () => {
  const nomes = paraMcp().map((t) => t.name);
  for (const n of ['search_audio', 'download_audio', 'list_categories', 'search_library', 'list_rename_folders', 'preview_rename', 'apply_rename', 'undo_rename']) assert.ok(nomes.includes(n), n);
  const s = FERRAMENTAS.find((t) => t.name === 'search_audio');
  assert.deepStrictEqual(s.inputSchema.required, ['query', 'type']);
  assert.deepStrictEqual(s.inputSchema.properties.limit, { type: 'integer', minimum: 1, maximum: 60, default: 20 });
  assert.deepStrictEqual(s.inputSchema.properties.duration.enum, ['short', 'medium', 'long']);
  assert.deepStrictEqual(s.inputSchema.properties.order.enum, ['relevance', 'latest']);
  for (const n of ['search_audio', 'list_categories', 'search_library', 'list_rename_folders', 'preview_rename']) assert.strictEqual(FERRAMENTAS.find((t) => t.name === n).annotations.readOnlyHint, true, n);
  for (const n of ['apply_rename', 'download_audio']) assert.strictEqual(FERRAMENTAS.find((t) => t.name === n).annotations.readOnlyHint, false, n);
  assert.ok(paraMcp().every((t) => !('rota' in t)));
});

test('sem pasta escolhida: cria em Documentos e avisa onde e por quê', () => {
  const cfg = configMemoria();
  const r = nucleo(cfg).list_categories();
  const esperado = path.join(TMP, 'Documentos', 'Noctis Studio', 'Banco de sons');
  assert.strictEqual(r.root, esperado);
  assert.ok(fs.existsSync(esperado));
  assert.match(r.notice, /criei/);
  assert.strictEqual(cfg.get().audioAtlas.root, esperado);
  assert.strictEqual(nucleo(cfg).list_categories().notice, undefined); // segunda vez: sem aviso
});

test('pasta escolhida numa unidade desmontada (G:) → erro claro, não cria em outro lugar', () => {
  const cfg = configMemoria({ audioAtlas: { root: 'G:\\Meu Drive\\Sounds' } });
  const n = nucleo(cfg, { unidadeExiste: () => false });
  // Em Linux o caminho "G:\..." não tem unidade; simulamos a raiz da unidade ausente.
  const raizAbs = path.join(TMP, 'unidade-G', 'Sounds');
  cfg.set({ audioAtlas: { root: raizAbs } });
  assert.throws(() => n.list_categories(), (e) => e.code === 'NO_ROOT' && /não está disponível/.test(e.message));
  assert.ok(!fs.existsSync(raizAbs));
  assert.ok(!fs.existsSync(path.join(TMP, 'Documentos', 'Noctis Studio', 'Banco de sons', 'Sounds')));
});

test('search_audio: saída igual ao CLI antigo, várias páginas, limite ajustado', async () => {
  buscas = [];
  const cfg = configMemoria({ audioAtlas: { root: path.join(TMP, 'banco') } });
  fs.mkdirSync(path.join(TMP, 'banco'), { recursive: true });
  const r = await nucleo(cfg).search_audio({ query: 'suspense escuro', type: 'music', limit: 45 });
  assert.deepStrictEqual(Object.keys(r), ['query', 'searchedAs', 'translated', 'type', 'results']);
  assert.strictEqual(r.searchedAs, 'dark suspense');
  assert.strictEqual(r.translated, true);
  assert.strictEqual(r.results.length, 45);
  assert.strictEqual(buscas.length, 3);
  assert.deepStrictEqual(Object.keys(r.results[0]), ['id', 'title', 'author', 'duration', 'tags', 'pageUrl', 'genre', 'contentId', 'downloaded']);
  const r2 = await nucleo(cfg).search_audio({ query: 'x', type: 'sfx', limit: 999 });
  assert.strictEqual(r2.results.length, 60);
  await assert.rejects(nucleo(cfg).search_audio({ query: 'x', type: 'video' }), (e) => e.code === 'USAGE');
  await assert.rejects(nucleo(cfg).search_audio({ query: 'x', type: 'music', duration: 'enorme' }), (e) => e.code === 'USAGE');
});

test('download_audio: categoria automática, duplicado e search_library', async () => {
  const banco = path.join(TMP, 'banco2');
  fs.mkdirSync(path.join(banco, 'Woosh'), { recursive: true });
  const cfg = configMemoria({ audioAtlas: { root: banco } });
  const n = nucleo(cfg);
  const r = await n.download_audio({ id: '382724', type: 'music' });
  assert.deepStrictEqual(Object.keys(r), ['ok', 'duplicate', 'id', 'title', 'category', 'newFolder', 'path']);
  assert.ok(r.ok && !r.duplicate && fs.existsSync(r.path) && r.path.startsWith(banco));
  const d = await n.download_audio({ id: '382724', type: 'music' });
  assert.deepStrictEqual(d, { ok: true, duplicate: true, id: '382724', path: r.path, category: r.category });
  const f = await n.download_audio({ id: '400001', type: 'sfx', category: 'Woosh' });
  assert.strictEqual(f.category, 'Woosh');
  const cat = JSON.parse(fs.readFileSync(path.join(banco, 'catalogo-pixabay.json'), 'utf8'));
  assert.strictEqual(cat.length, 2);
  const lib_ = n.search_library({ query: 'tension' });
  assert.strictEqual(lib_.count, 2);
  assert.ok(lib_.results.every((x) => !('fileUrl' in x)));
  assert.deepStrictEqual(n.list_categories().categories.sort(), [r.category.split(path.sep)[0], 'Woosh'].sort());
  await assert.rejects(n.download_audio({ id: 'abc', type: 'music' }), (e) => e.code === 'USAGE');
  await assert.rejects(n.download_audio({ id: '1234567', type: 'music', category: '../../fora/x/y' }), (e) => e.code === 'BAD_CATEGORY');
});

test('set_sound_folder: cria, troca e mantém a anterior', () => {
  const cfg = configMemoria({ audioAtlas: { root: path.join(TMP, 'banco2') } });
  const nova = path.join(TMP, 'outro', 'Banco');
  const r = nucleo(cfg).set_sound_folder({ path: nova });
  assert.ok(r.ok && r.created && fs.existsSync(nova));
  assert.strictEqual(cfg.get().audioAtlas.root, nova);
  assert.ok(fs.existsSync(path.join(TMP, 'banco2', 'catalogo-pixabay.json')));
  assert.throws(() => nucleo(cfg).set_sound_folder({ path: 'relativo/pasta' }), (e) => e.code === 'USAGE');
  assert.throws(() => nucleo(cfg).set_sound_folder({ path: [TMP, 'a', '..', 'b'].join(path.sep) }), (e) => e.code === 'USAGE');
});

test('renomeador: só pastas liberadas, prévia → aplicar → desfazer', async () => {
  const liberada = path.join(TMP, 'liberada');
  const fora = path.join(TMP, 'fora');
  fs.mkdirSync(path.join(liberada, 'sub'), { recursive: true });
  fs.mkdirSync(fora, { recursive: true });
  for (const f of ['cena final 1.mp4', 'cena final 2.mp4', 'nota.txt']) fs.writeFileSync(path.join(liberada, f), f);
  fs.writeFileSync(path.join(fora, 'x final.mp4'), '');
  const cfg = configMemoria({ ia: { pastasRenomear: [liberada] } });
  const n = nucleo(cfg);

  assert.deepStrictEqual(n.list_rename_folders().folders, [{ path: liberada, exists: true }]);
  assert.throws(() => n.preview_rename({ folder: fora, actions: [{ tipo: 'remover', termo: 'final' }] }), (e) => e.code === 'FOLDER_NOT_ALLOWED');
  assert.throws(() => n.preview_rename({ folder: [liberada, '..', 'fora'].join(path.sep), actions: [{ tipo: 'limpar' }] }), (e) => e.code === 'FOLDER_NOT_ALLOWED');
  if (process.platform !== 'win32') {
    fs.symlinkSync(fora, path.join(liberada, 'atalho'));
    assert.throws(() => n.preview_rename({ folder: path.join(liberada, 'atalho'), actions: [{ tipo: 'limpar' }] }), (e) => e.code === 'FOLDER_NOT_ALLOWED');
    fs.unlinkSync(path.join(liberada, 'atalho'));
  }
  assert.throws(() => n.preview_rename({ folder: liberada, actions: [{ tipo: 'prefixo', texto: '../x' }] }), (e) => e.code === 'USAGE');
  assert.throws(() => n.preview_rename({ folder: liberada, actions: [{ tipo: 'apagar' }] }), (e) => e.code === 'USAGE');

  const p = n.preview_rename({ folder: liberada, actions: [{ tipo: 'remover', termo: 'final' }], extensions: 'mp4' });
  assert.deepStrictEqual(p.changes, [{ de: 'cena final 1.mp4', para: 'cena 1.mp4' }, { de: 'cena final 2.mp4', para: 'cena 2.mp4' }]);
  assert.ok(fs.existsSync(path.join(liberada, 'cena final 1.mp4')), 'prévia não altera nada');

  const a = n.apply_rename({ previewId: p.previewId });
  assert.strictEqual(a.renamed, 2);
  assert.ok(fs.existsSync(path.join(liberada, 'cena 1.mp4')));
  assert.throws(() => n.apply_rename({ previewId: p.previewId }), (e) => e.code === 'NOT_FOUND'); // uso único

  const u = n.undo_rename({ operationId: a.operationId });
  assert.strictEqual(u.restored, 2);
  assert.ok(fs.existsSync(path.join(liberada, 'cena final 1.mp4')));
  assert.throws(() => n.undo_rename({ operationId: a.operationId }), (e) => e.code === 'NOT_FOUND' || e.code === 'CONFLICT');
});

test('renomeador: recusa prévia com conflito, alterada ou expirada; nunca sobrescreve', () => {
  const pasta = path.join(TMP, 'liberada2');
  fs.mkdirSync(pasta, { recursive: true });
  for (const f of ['a final.txt', 'a.txt', 'b final.txt']) fs.writeFileSync(path.join(pasta, f), f);
  let relogio = Date.now();
  const cfg = configMemoria({ ia: { pastasRenomear: [pasta] } });
  const n = nucleo(cfg, { agora: () => relogio });

  const c = n.preview_rename({ folder: pasta, actions: [{ tipo: 'remover', termo: 'final' }] });
  assert.ok(c.conflicts.some((x) => x.de === 'a final.txt' && x.para === 'a.txt'));
  assert.throws(() => n.apply_rename({ previewId: c.previewId }), (e) => e.code === 'HAS_CONFLICTS');
  assert.strictEqual(fs.readFileSync(path.join(pasta, 'a.txt'), 'utf8'), 'a.txt');

  fs.unlinkSync(path.join(pasta, 'a.txt')); // teste não usa o app para apagar: só prepara o cenário
  const p = n.preview_rename({ folder: pasta, actions: [{ tipo: 'sufixo', texto: '_v2' }] });
  fs.writeFileSync(path.join(pasta, 'novo.txt'), '');
  assert.throws(() => n.apply_rename({ previewId: p.previewId }), (e) => e.code === 'PREVIEW_STALE');

  const q = n.preview_rename({ folder: pasta, actions: [{ tipo: 'sufixo', texto: '_v2' }] });
  relogio += 31 * 60 * 1000;
  assert.throws(() => n.apply_rename({ previewId: q.previewId }), (e) => e.code === 'PREVIEW_EXPIRED');
  assert.throws(() => n.apply_rename({ previewId: '../../etc' }), (e) => e.code === 'USAGE');
});

test('executar: despacha pelo nome e recusa desconhecida', async () => {
  const cfg = configMemoria({ ia: { pastasRenomear: [] } });
  const r = await executar(nucleo(cfg), 'list_rename_folders', {});
  assert.match(r.notice, /Nenhuma pasta liberada/);
  await assert.rejects(executar(nucleo(cfg), 'delete_everything', {}), (e) => e.code === 'NOT_FOUND');
});
