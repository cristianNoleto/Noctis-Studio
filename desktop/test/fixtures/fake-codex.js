#!/usr/bin/env node
// "codex" de mentira: fala o app-server JSON-RPC (initialize, thread/start, turn/start) e manda
// um pedido de aprovação de comando (execCommandApproval) no meio do turno.
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('codex 0.0-fake'); process.exit(0); }
if (a[0] === 'login' && a[1] === 'status') { console.log('Logged in using ChatGPT'); process.exit(0); }
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue;
    const m = JSON.parse(l);
    if (m.method === 'initialize') out({ jsonrpc: '2.0', id: m.id, result: { ok: true } });
    else if (m.method === 'model/list') out({ jsonrpc: '2.0', id: m.id, result: { data: [{ id: 'gpt-5-codex', displayName: 'GPT-5 Codex', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] }] } });
    else if (m.method === 'thread/start' || m.method === 'thread/resume') out({ jsonrpc: '2.0', id: m.id, result: { thread: { id: 'th-1' }, model: 'gpt-5-codex' } });
    else if (m.method === 'turn/start') {
      out({ jsonrpc: '2.0', id: m.id, result: { turn: { id: 'turn-1' } } });
      out({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'th-1', delta: 'Rodando ls… ' } });
      // pede aprovação de um comando
      out({ jsonrpc: '2.0', id: 500, method: 'execCommandApproval', params: { threadId: 'th-1', command: ['ls', '-la'], cwd: '/tmp' } });
    } else if (m.id === 500) {
      const aprovado = m.result === 'approved';
      out({ jsonrpc: '2.0', method: 'item/completed', params: { threadId: 'th-1', item: { type: 'commandExecution', command: 'ls -la', cwd: '/tmp', status: aprovado ? 'completed' : 'declined' } } });
      out({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'th-1', turn: { status: 'completed', items: [{ type: 'agentMessage', phase: 'final_answer', text: aprovado ? 'Listado.' : 'Ok, não rodei.' }] } } });
    }
  }
});
