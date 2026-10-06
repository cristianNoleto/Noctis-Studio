// Atualização automática: notas da release, regra do popup de novidades e o evento de "baixada".
const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { notasTexto, calcularNovidades, criarAtualizador } = require('../electron/lib/atualizacao');

test('notasTexto: string, lista e remoção de HTML', () => {
  assert.strictEqual(notasTexto({ releaseNotes: 'Linha <b>um</b>' }), 'Linha um');
  assert.strictEqual(notasTexto({ releaseNotes: [{ note: 'a' }, { note: 'b' }] }), 'a\n\nb');
  assert.strictEqual(notasTexto({}), '');
});

test('calcularNovidades: só mostra quando a versão mudou e temos as notas', () => {
  assert.strictEqual(calcularNovidades({ versaoAtual: '1.0.0', lastVersion: '', pending: null }), null); // primeira instalação
  assert.strictEqual(calcularNovidades({ versaoAtual: '1.0.0', lastVersion: '1.0.0', pending: null }), null); // mesma versão
  assert.strictEqual(calcularNovidades({ versaoAtual: '1.1.0', lastVersion: '1.0.0', pending: { version: '0.9', notes: 'x' } }), null); // pending de outra versão
  assert.deepStrictEqual(calcularNovidades({ versaoAtual: '1.1.0', lastVersion: '1.0.0', pending: { version: '1.1.0', notes: 'novo' } }), { version: '1.1.0', notes: 'novo' });
});

function ctxFalso(updateInicial) {
  let store = { autoUpdate: true, update: updateInicial || { lastVersion: '', pending: null } };
  const eventos = [];
  return {
    eventos, verStore: () => store,
    store: { get: () => store, set: (patch) => { store = { ...store, ...patch }; return store; } },
    log: { info() {}, warn() {}, success() {} },
    send: (ev, d) => eventos.push({ ev, ...d }),
    notify() {},
  };
}

test('atualizador: update-downloaded guarda as notas e avisa a tela; novidades aparecem só uma vez', () => {
  // Abertura 1: baixa a 2.0.0 (app ainda é 1.0.0) → guarda pending.
  const au = new EventEmitter();
  const ctx = ctxFalso({ lastVersion: '1.0.0', pending: null });
  const up = criarAtualizador({ ctx, autoUpdater: au, app: { getVersion: () => '1.0.0' }, isPackaged: true });
  up.init();
  au.emit('update-downloaded', { version: '2.0.0', releaseNotes: 'Agora com Codex e Grok.' });
  assert.deepStrictEqual(ctx.verStore().update.pending, { version: '2.0.0', notes: 'Agora com Codex e Grok.' });
  assert.ok(ctx.eventos.some((e) => e.ev === 'app:update' && e.estado === 'baixada' && e.version === '2.0.0'));
  assert.strictEqual(up.estado().baixada.version, '2.0.0');

  // Abertura 2: já na 2.0.0, com o pending guardado → popup de novidades (uma vez só).
  const ctx2 = ctxFalso({ lastVersion: '1.0.0', pending: { version: '2.0.0', notes: 'Agora com Codex e Grok.' } });
  const up2 = criarAtualizador({ ctx: ctx2, autoUpdater: new EventEmitter(), app: { getVersion: () => '2.0.0' }, isPackaged: true });
  const e1 = up2.estado();
  assert.deepStrictEqual(e1.novidades, { version: '2.0.0', notes: 'Agora com Codex e Grok.' });
  assert.strictEqual(up2.estado().novidades, null); // não repete
  assert.strictEqual(ctx2.verStore().update.lastVersion, '2.0.0');
  assert.strictEqual(ctx2.verStore().update.pending, null);
});

test('atualizador: em desenvolvimento não faz nada', async () => {
  const ctx = ctxFalso();
  const up = criarAtualizador({ ctx, autoUpdater: new EventEmitter(), app: { getVersion: () => '1.0.0' }, isPackaged: false });
  up.init();
  assert.strictEqual(await up.checar(), null);
});
