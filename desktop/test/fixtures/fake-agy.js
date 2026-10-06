#!/usr/bin/env node
// "agy" de mentira: fala o stream-json do Antigravity (um turno com texto, uma ferramenta e fim).
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('agy 0.0-fake'); process.exit(0); }
if (a[0] === 'models') { console.log('gemini-3-pro\tGemini 3 Pro'); console.log('gemini-3-pro-high\tGemini 3 Pro (high)'); process.exit(0); }
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const linha = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!linha.trim()) continue;
    const msg = JSON.parse(linha);
    const texto = msg.message?.content || '';
    out({ event: 'init', conversation_id: 'conv-agy-1' });
    out({ event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'Vou ' } });
    out({ event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'listar.' } });
    out({ event: 'step_update', step_update: { step_type: 'tool', step_index: 0, state: 'RUNNING', tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'noctis', ToolName: 'listar_projetos', Arguments: '{}' } } } });
    out({ event: 'step_update', step_update: { step_type: 'tool', step_index: 0, state: 'DONE', tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'noctis', ToolName: 'listar_projetos', Arguments: '{}' } } } });
    out({ event: 'result', result: { status: 'SUCCESS', response: `feito (recebi: ${texto.slice(0, 40)})`, conversation_id: 'conv-agy-1', num_turns: 1 } });
  }
});
