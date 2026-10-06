// Chat IA: leitura do stream-json, servidor MCP + ponte, e um turno completo com um
// "Claude Code" falso (inclui pedido de permissão respondido pela "tela").
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { leitorClaude, argsClaude } = require('../electron/servicos/chat/drivers/claude');
const { criarChat } = require('../electron/servicos/chat/chat');

const MCP = path.join(__dirname, '..', 'electron', 'servicos', 'chat', 'mcp-server.js');

function ctxFalso() {
  const eventos = [];
  const chamadas = [];
  let pausada = false;
  const canais = {
    'creator:projects': () => [{ id: 1, name: 'Canal Dark', folder: '/x/canal', paused: 0, counts: { done: 3 } }],
    'creator:pause': () => { pausada = true; return { paused: true }; },
    'creator:queueStatus': () => ({ paused: pausada }),
  };
  return {
    eventos, chamadas,
    pausada: () => pausada,
    store: { get: () => ({ projectsRoot: os.tmpdir(), chat: { agent: 'claude', permissionMode: '', agentes: { claude: { model: 'sonnet', effort: 'low' } } } }) },
    log: { info() {}, warn() {}, error() {}, success() {} },
    send: (evento, dados) => eventos.push({ evento, ...dados }),
    invocar: async (canal, ...a) => { chamadas.push(canal); if (!canais[canal]) throw new Error(`sem ${canal}`); return canais[canal](...a); },
  };
}

test('leitor do stream-json do Claude Code (vocabulário comum)', () => {
  const ev = [];
  const l = leitorClaude((e) => ev.push(e));
  l({ type: 'system', subtype: 'init', session_id: 's1', model: 'opus', mcp_servers: [{ name: 'noctis', status: 'connected' }] });
  l({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm' } } });
  l({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'oi' } } });
  l({ type: 'stream_event', parent_tool_use_id: 'x', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'sub' } } });
  l({ type: 'assistant', message: { id: 'm', content: [{ type: 'text', text: 'oi' }, { type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }] } });
  l({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: 'a\nb' }] }] } });
  l({ type: 'result', subtype: 'success', is_error: false, session_id: 's1', total_cost_usd: 0.5, result: 'oi' });
  assert.deepStrictEqual(ev.map((e) => e.tipo), ['sessao', 'texto-delta', 'texto-final', 'ferramenta', 'ferramenta-resultado', 'resultado']);
  assert.strictEqual(ev[1].texto, 'oi'); // delta (o do subagente foi ignorado)
  assert.strictEqual(ev[3].nome, 'Bash');
  assert.strictEqual(ev[4].texto, 'a\nb');
  assert.strictEqual(ev[5].custoUsd, 0.5);
});

test('argumentos do Claude: nada de texto livre na linha de comando', () => {
  const a = argsClaude({ sessao: 'abc-123', modelo: 'opus', esforco: 'high', permissao: 'acceptEdits', mcpConfig: '/tmp/m.json', permitidas: ['mcp__noctis__resumo', 'mcp__noctis__ver_projeto'] });
  assert.ok(a.includes('--resume') && a.includes('abc-123'));
  assert.ok(a.includes('--permission-prompt-tool'));
  assert.strictEqual(a[a.indexOf('--allowedTools') + 1], 'mcp__noctis__resumo,mcp__noctis__ver_projeto');
  const ruim = argsClaude({ sessao: 'x; rm -rf /', modelo: 'opus & calc', esforco: 'turbo', permissao: 'default' });
  assert.ok(!ruim.includes('--resume') && !ruim.includes('--model') && !ruim.includes('--effort') && !ruim.includes('--permission-mode'));
});

test('turno completo com Claude falso: streaming, ferramentas do Noctis e permissão', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const falso = path.join(bin, 'claude');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'claude-falso.js'), falso);
  fs.chmodSync(falso, 0o755);
  const ctx = ctxFalso();
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const chat = criarChat({ dir: path.join(dir, 'dados'), ctx, mcpScript: MCP, envAgente: env });
  try {
    // 1) usuário nega a permissão
    const c = chat.criar({ agente: 'claude' });
    const respondeu = new Promise((resolve) => {
      const t = setInterval(() => {
        const p = ctx.eventos.find((e) => e.evento === 'chat:event' && e.pedido);
        if (p) { clearInterval(t); assert.strictEqual(p.pedido.ferramenta, 'mcp__noctis__pausar_fila'); chat.responder(p.pedido.id, { permitir: false }); resolve(); }
      }, 20);
    });
    await chat.enviar(c.id, 'pausa a fila pra mim');
    await respondeu;
    await esperar(() => ctx.eventos.some((e) => e.evento === 'chat:event' && e.conversa === c.id && e.tipo === 'fim'));
    let conv = chat.obter(c.id);
    assert.strictEqual(conv.titulo, 'pausa a fila pra mim');
    assert.strictEqual(conv.sessao, 'sessao-falsa-1');
    const resp = conv.mensagens[1];
    const textos = resp.blocos.filter((b) => b.k === 'texto').map((b) => b.texto).join(' | ');
    assert.match(textos, /Olá! Tenho \d+ ferramentas\./);
    assert.match(textos, /não pausei.*instruções: sim; prompt: pausa a fila pra mim/);
    const f1 = resp.blocos.find((b) => b.k === 'ferramenta' && b.id === 't1');
    assert.match(f1.resultado, /Canal Dark/);
    assert.strictEqual(resp.blocos.find((b) => b.k === 'ferramenta' && b.id === 't2').permissao.estado, 'negado');
    assert.strictEqual(ctx.pausada(), false);
    assert.strictEqual(resp.fim.custo, 0.0123);

    // 2) segunda mensagem: retoma a sessão; usuário permite "sempre"
    ctx.eventos.length = 0;
    const permitir = new Promise((resolve) => {
      const t = setInterval(() => {
        const p = ctx.eventos.find((e) => e.evento === 'chat:event' && e.pedido);
        if (p) { clearInterval(t); chat.responder(p.pedido.id, { permitir: true, sempre: true }); resolve(); }
      }, 20);
    });
    await chat.enviar(c.id, 'agora pode');
    await permitir;
    await esperar(() => ctx.eventos.some((e) => e.evento === 'chat:event' && e.tipo === 'fim'));
    conv = chat.obter(c.id);
    assert.strictEqual(ctx.pausada(), true);
    assert.deepStrictEqual(conv.sempre, ['mcp__noctis__pausar_fila']);
    assert.match(conv.mensagens[3].blocos.map((b) => b.texto || '').join(' '), /Fila pausada/);
    assert.strictEqual(conv.mensagens.length, 4);

    // 3) "sempre" lembrado: a 3ª vez não pergunta
    ctx.eventos.length = 0;
    await chat.enviar(c.id, 'de novo');
    await esperar(() => ctx.eventos.some((e) => e.evento === 'chat:event' && e.tipo === 'fim'));
    assert.ok(!ctx.eventos.some((e) => e.pedido));

    // 4) erro do agente aparece na conversa
    ctx.eventos.length = 0;
    await chat.enviar(c.id, 'ERRO por favor');
    await esperar(() => ctx.eventos.some((e) => e.evento === 'chat:event' && e.tipo === 'fim'));
    const ultima = chat.obter(c.id).mensagens.at(-1);
    assert.strictEqual(ultima.fim.erro, true);
    assert.match(ultima.blocos.find((b) => b.k === 'erro').texto, /login/);

    // 5) parar no meio
    ctx.eventos.length = 0;
    await chat.enviar(c.id, 'DEMORA');
    await assert.rejects(chat.enviar(c.id, 'outra'), /Espere/);
    assert.ok(chat.parar(c.id));
    await esperar(() => ctx.eventos.some((e) => e.evento === 'chat:event' && e.tipo === 'fim'));
    assert.strictEqual(chat.obter(c.id).mensagens.at(-1).fim.motivo, 'parado');
    assert.strictEqual(chat.listar().length, 1);
    assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'dados')).filter((f) => f.startsWith('mcp-')), []);
  } finally {
    chat.encerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ponte recusa quem não tem o token', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-'));
  const chat = criarChat({ dir, ctx: ctxFalso(), mcpScript: MCP });
  try {
    const url = await chat.ponte.abrir();
    const r = await fetch(`${url}/catalogo`, { headers: { authorization: 'Bearer errado' } });
    assert.strictEqual(r.status, 401);
    const ok = await fetch(`${url}/catalogo`, { headers: { authorization: `Bearer ${chat.ponte.token}` } }).then((x) => x.json());
    assert.ok(ok.data.ferramentas.some((f) => f.name === 'enviar_prompts'));
    assert.ok(url.startsWith('http://127.0.0.1:'));
  } finally { chat.encerrar(); fs.rmSync(dir, { recursive: true, force: true }); }
});

function esperar(cond, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const t = setInterval(() => { if (cond()) { clearInterval(t); resolve(); } else if (Date.now() - t0 > ms) { clearInterval(t); reject(new Error('tempo esgotado')); } }, 20);
  });
}
