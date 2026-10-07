// Migração dos apps antigos (idempotente, com backup, sem tocar nos originais) e
// mesclagem do claude_desktop_config.json (backup, troca "audio-atlas" por "noctis-studio").
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrar } = require('../electron/servicos/ia/migracao');
const claude = require('../electron/servicos/ia/claude-config');
const { createStore } = require('../electron/lib/store');
const lib = require('../electron/servicos/audio-atlas/library');

let TMP;
before(() => { TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-mig-')); });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const hashDir = (d) => fs.readdirSync(d, { recursive: true }).sort().map((f) => { const p = path.join(d, String(f)); return fs.statSync(p).isFile() ? `${f}:${fs.readFileSync(p, 'utf8')}` : String(f); }).join('|');

test('migração: importa pasta, favoritos, histórico e logs; segunda vez não duplica', () => {
  const appData = path.join(TMP, 'Roaming');
  const local = path.join(TMP, 'Local');
  const banco = path.join(TMP, 'Banco antigo');
  fs.mkdirSync(path.join(banco, 'Woosh'), { recursive: true });
  fs.writeFileSync(path.join(banco, 'Woosh', 'whoosh_433006.mp3'), 'x');
  fs.writeFileSync(path.join(banco, 'catalogo-pixabay.json'), JSON.stringify([{ id: '433006', title: 'Whoosh', localPath: path.join(banco, 'Woosh', 'whoosh_433006.mp3'), category: 'Woosh' }]));
  fs.mkdirSync(path.join(appData, 'Audio Atlas'), { recursive: true });
  fs.writeFileSync(path.join(appData, 'Audio Atlas', 'state.json'), JSON.stringify({ config: { root: banco, intervalMs: 2000 }, favorites: [{ id: 1 }, { id: 2 }], history: [{ query: 'dark', type: 'music', at: 5 }] }));
  const hist = path.join(local, 'Programs', 'Renomeador', 'historico');
  fs.mkdirSync(hist, { recursive: true });
  fs.writeFileSync(path.join(hist, '20240101-101010-000000.json'), JSON.stringify({ data: '2024-01-01T10:10:10', pasta: 'C:\\x', desfeito: true, arquivos: [{ de: 'a', para: 'b' }] }));
  const antesAA = hashDir(path.join(appData, 'Audio Atlas'));
  const antesRen = hashDir(hist);

  const dataDir = path.join(TMP, 'Noctis Studio');
  lib.init(path.join(dataDir, 'audio-atlas'));
  const store = createStore(path.join(dataDir, 'config.json'), path.join(TMP, 'Docs'));
  const opts = { dataDir, store, lib, historicoDir: path.join(dataDir, 'renomeador', 'historico'), appData, localAppData: local };
  const r = migrar(opts);
  assert.strictEqual(store.get().audioAtlas.root, banco);
  assert.strictEqual(store.get().audioAtlas.intervalMs, 2000);
  assert.strictEqual(r.audioAtlas.favoritos, 2);
  assert.strictEqual(r.audioAtlas.historico, 1);
  assert.strictEqual(r.renomeador.copiados, 1);
  assert.deepStrictEqual(r.bancoDeSons, { root: banco, disponivel: true, audios: 1, noCatalogo: 1 });
  assert.ok(r.podeDesinstalar && /desinstalar/.test(r.mensagem));
  assert.ok(fs.existsSync(r.audioAtlas.backup) && fs.existsSync(path.join(r.renomeador.backup, '20240101-101010-000000.json')));

  const r2 = migrar(opts);
  assert.strictEqual(r2.audioAtlas.favoritos, 0);
  assert.strictEqual(r2.audioAtlas.historico, 0);
  assert.strictEqual(r2.renomeador.copiados, 0);
  assert.strictEqual(r2.renomeador.jaExistiam, 1);
  assert.strictEqual(lib.getState().favorites.length, 2);
  assert.strictEqual(hashDir(path.join(appData, 'Audio Atlas')), antesAA, 'original do Audio Atlas intacto');
  assert.strictEqual(hashDir(hist), antesRen, 'original do Renomeador intacto');
});

test('migração: não troca a pasta que o Noctis Studio já tem; unidade desmontada só avisa', () => {
  const appData = path.join(TMP, 'R2');
  fs.mkdirSync(path.join(appData, 'Audio Atlas'), { recursive: true });
  fs.writeFileSync(path.join(appData, 'Audio Atlas', 'state.json'), JSON.stringify({ config: { root: 'G:\\Meu Drive\\Sounds' } }));
  const dataDir = path.join(TMP, 'NS2');
  lib.init(path.join(dataDir, 'audio-atlas'));
  const store = createStore(path.join(dataDir, 'config.json'), TMP);
  store.set({ audioAtlas: { root: path.join(TMP, 'minha pasta') } });
  const r = migrar({ dataDir, store, lib, historicoDir: path.join(dataDir, 'h'), appData, localAppData: path.join(TMP, 'L2'), unidadeExiste: () => false });
  assert.strictEqual(store.get().audioAtlas.root, path.join(TMP, 'minha pasta'));
  assert.strictEqual(r.audioAtlas.pasta, null);
  assert.strictEqual(r.bancoDeSons.disponivel, false);
  assert.ok(!fs.existsSync(path.join(TMP, 'minha pasta')), 'migração não cria pastas');
});

test('claude_desktop_config: bloco, comando, mescla com backup e troca do audio-atlas', () => {
  const bloco = claude.blocoMcp({ exe: 'C:\\Users\\Eu\\AppData\\Local\\Programs\\Noctis Studio\\Noctis Studio.exe', resourcesPath: 'C:\\Users\\Eu\\AppData\\Local\\Programs\\Noctis Studio\\resources', empacotado: true });
  assert.deepStrictEqual(bloco.env, { ELECTRON_RUN_AS_NODE: '1' });
  assert.match(bloco.args[0], /app\.asar\.unpacked[\\/]electron[\\/]servicos[\\/]ia[\\/]mcp\.js$/);
  const cmd = claude.comandoClaudeCode(bloco);
  assert.match(cmd, /^claude mcp add --transport stdio --scope user --env ELECTRON_RUN_AS_NODE=1 noctis-studio -- "C:\\Users.*Noctis Studio\.exe" ".*mcp\.js"$/);

  const arq = path.join(TMP, 'Claude', 'claude_desktop_config.json');
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, JSON.stringify({ globalShortcut: 'Ctrl+Space', mcpServers: { 'audio-atlas': { command: 'x' }, darkplanner: { command: 'dp' } } }));
  assert.deepStrictEqual(claude.situacao(arq, bloco), { arquivo: arq, existe: true, valido: true, erro: undefined, temNoctis: false, noctisAtualizado: false, temAudioAtlas: true });
  const r = claude.adicionar(arq, bloco);
  const novo = JSON.parse(fs.readFileSync(arq, 'utf8'));
  assert.deepStrictEqual(Object.keys(novo.mcpServers).sort(), ['darkplanner', 'noctis-studio']);
  assert.strictEqual(novo.globalShortcut, 'Ctrl+Space');
  assert.deepStrictEqual(novo.mcpServers.darkplanner, { command: 'dp' }, 'Dark Planner intocado');
  assert.ok(r.removeuAntigo && fs.existsSync(r.backup));
  assert.ok(JSON.parse(fs.readFileSync(r.backup, 'utf8')).mcpServers['audio-atlas']);
  assert.strictEqual(claude.situacao(arq, bloco).noctisAtualizado, true);

  fs.writeFileSync(arq, '{ quebrado');
  assert.throws(() => claude.adicionar(arq, bloco), (e) => e.code === 'CONFLICT');
  assert.strictEqual(fs.readFileSync(arq, 'utf8'), '{ quebrado');
  const vazio = path.join(TMP, 'novo', 'claude_desktop_config.json');
  assert.strictEqual(claude.adicionar(vazio, bloco).backup, null);
  assert.ok(JSON.parse(fs.readFileSync(vazio, 'utf8')).mcpServers['noctis-studio']);
});
