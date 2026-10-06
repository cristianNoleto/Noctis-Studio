// Drivers das outras IAs (Codex, Grok, Antigravity) com CLIs de mentira que falam o protocolo
// de verdade de cada um. Confere o fluxo: sessão → streaming → ferramenta/permissão → resultado.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const { criarDriverCodex } = require('../electron/servicos/chat/drivers/codex');
const { criarDriverAcp } = require('../electron/servicos/chat/drivers/acp');
const { criarDriverAgy } = require('../electron/servicos/chat/drivers/agy');

function arnês(driver, fixture) {
  const eventos = [];
  const deps = {
    onEvento: (_c, e) => eventos.push(e),
    julgar: async () => ({ decisao: 'perguntar' }),
    spawnCli: (_id, args) => spawn(process.execPath, [path.join(__dirname, 'fixtures', fixture), ...args], { stdio: ['pipe', 'pipe', 'pipe'] }),
    userDataDir: '/tmp',
  };
  driver.initDriver(deps);
  return { eventos, driver };
}
const esperar = (cond, ms = 8000) => new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { if (cond()) { clearInterval(t); res(); } else if (Date.now() - t0 > ms) { clearInterval(t); rej(new Error('tempo esgotado')); } }, 15); });
const tipos = (ev) => ev.map((e) => e.tipo);

test('driver Codex: thread, streaming, aprovação e resultado', { timeout: 15000 }, async () => {
  const d = criarDriverCodex();
  const { eventos } = arnês(d, 'fake-codex.js');
  try {
    await d.enviarMensagem({ conversaId: 'c1', texto: 'liste', cwd: '/tmp', mcpConfigPath: null });
    await esperar(() => eventos.some((e) => e.tipo === 'pedido-permissao'));
    const ped = eventos.find((e) => e.tipo === 'pedido-permissao');
    assert.strictEqual(ped.ferramenta, 'Bash');
    d.responderPermissao('c1', ped.requestId, 'aprovar');
    await esperar(() => eventos.some((e) => e.tipo === 'resultado'));
    const r = eventos.find((e) => e.tipo === 'resultado');
    assert.match(r.texto, /Listado/);
    assert.ok(tipos(eventos).includes('sessao') && tipos(eventos).includes('texto-delta'));
    assert.strictEqual(eventos.find((e) => e.tipo === 'sessao').sessionId, 'th-1');
  } finally { d.encerrarTudo(); }
});

test('driver Codex: negar a aprovação', { timeout: 15000 }, async () => {
  const d = criarDriverCodex();
  const { eventos } = arnês(d, 'fake-codex.js');
  try {
    await d.enviarMensagem({ conversaId: 'c1', texto: 'liste', cwd: '/tmp' });
    await esperar(() => eventos.some((e) => e.tipo === 'pedido-permissao'));
    d.responderPermissao('c1', eventos.find((e) => e.tipo === 'pedido-permissao').requestId, 'negar');
    await esperar(() => eventos.some((e) => e.tipo === 'resultado'));
    assert.match(eventos.find((e) => e.tipo === 'resultado').texto, /não rodei/);
    assert.ok(eventos.some((e) => e.tipo === 'ferramenta-negada'));
  } finally { d.encerrarTudo(); }
});

test('driver Grok (ACP): sessão, streaming, permissão e fim', { timeout: 15000 }, async () => {
  const d = criarDriverAcp('grok', 'Grok');
  const { eventos } = arnês(d, 'fake-grok.js');
  try {
    await d.enviarMensagem({ conversaId: 'g1', texto: 'faça', cwd: '/tmp' });
    await esperar(() => eventos.some((e) => e.tipo === 'pedido-permissao'));
    const ped = eventos.find((e) => e.tipo === 'pedido-permissao');
    assert.strictEqual(ped.ferramenta, 'Bash');
    d.responderPermissao('g1', ped.requestId, 'aprovar');
    await esperar(() => eventos.some((e) => e.tipo === 'resultado'));
    const r = eventos.find((e) => e.tipo === 'resultado');
    assert.match(r.texto, /feito/);
    assert.strictEqual(eventos.find((e) => e.tipo === 'sessao').sessionId, 'sess-1');
  } finally { d.encerrarTudo(); }
});

test('driver Antigravity (agy): streaming, ferramenta MCP e resultado', { timeout: 15000 }, async () => {
  const d = criarDriverAgy();
  const { eventos } = arnês(d, 'fake-agy.js');
  try {
    await d.enviarMensagem({ conversaId: 'a1', texto: 'vai', cwd: '/tmp', mcpConfigPath: null });
    await esperar(() => eventos.some((e) => e.tipo === 'resultado'));
    const r = eventos.find((e) => e.tipo === 'resultado');
    assert.match(r.texto, /feito/);
    assert.strictEqual(eventos.find((e) => e.tipo === 'sessao').sessionId, 'conv-agy-1');
    const f = eventos.find((e) => e.tipo === 'ferramenta');
    assert.strictEqual(f.nome, 'mcp__noctis__listar_projetos');
    const texto = eventos.filter((e) => e.tipo === 'texto-delta').map((e) => e.texto).join('');
    assert.strictEqual(texto, 'Vou listar.');
  } finally { d.encerrarTudo(); }
});
