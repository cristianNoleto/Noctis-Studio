#!/usr/bin/env node
// "grok" de mentira: fala o ACP (initialize, session/new, session/prompt) e manda um
// session/request_permission no meio do turno.
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('grok 0.0-fake'); process.exit(0); }
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let promptId = null;
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue;
    const m = JSON.parse(l);
    if (m.method === 'initialize') out({ jsonrpc: '2.0', id: m.id, result: { agentCapabilities: {}, _meta: { modelState: { currentModelId: 'grok-4', availableModels: [{ modelId: 'grok-4', name: 'Grok 4', _meta: { reasoningEfforts: [{ value: 'low' }, { value: 'high' }] } }] } } } });
    else if (m.method === 'session/new') {
      out({ jsonrpc: '2.0', id: m.id, result: { sessionId: 'sess-1' } });
    } else if (m.method === 'session/prompt') {
      out({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess-1', update: { sessionUpdate: 'agent_message_chunk', content: { text: 'Pensando e ' } } } });
      out({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess-1', update: { sessionUpdate: 'agent_message_chunk', content: { text: 'agindo.' } } } });
      out({ jsonrpc: '2.0', id: 900, method: 'session/request_permission', params: { sessionId: 'sess-1', options: [{ kind: 'allow_once', optionId: 'a1' }, { kind: 'reject_once', optionId: 'r1' }], toolCall: { toolName: 'Bash', rawInput: { command: 'echo oi' } } } });
      promptId = m.id;
    } else if (m.id === 900) {
      const ok = m.result?.outcome?.outcome === 'selected' && m.result.outcome.optionId === 'a1';
      out({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess-1', update: { sessionUpdate: 'agent_message_chunk', content: { text: ok ? ' feito.' : ' neguei.' } } } });
      out({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'end_turn' } });
    }
  }
});
