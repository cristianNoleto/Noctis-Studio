#!/usr/bin/env node
// "Claude Code" de mentira para os testes: fala o mesmo stream-json do real e usa o servidor
// MCP do --mcp-config (lista as ferramentas, pede permissão via mcp__noctis__aprovar e chama
// uma ferramenta de leitura e outra de escrita).
const { spawn } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'falso' })); process.exit(0); }
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

let prompt = '';
process.stdin.on('data', (d) => { prompt += d; });
process.stdin.on('end', async () => {
  const sessao = val('--resume') || 'sessao-falsa-1';
  out({ type: 'system', subtype: 'init', session_id: sessao, model: val('--model') || 'falso', mcp_servers: [{ name: 'noctis', status: 'connected' }], permissionMode: val('--permission-mode') || 'default' });
  if (prompt.includes('ERRO')) { process.stderr.write('Invalid API key · Please run /login\n'); process.exit(1); }
  if (prompt.includes('DEMORA')) { await new Promise((r) => setTimeout(r, 30000)); }

  const cfg = JSON.parse(fs.readFileSync(val('--mcp-config'), 'utf8')).mcpServers.noctis;
  const mcp = spawn(cfg.command, cfg.args, { env: { ...process.env, ...cfg.env }, stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const espera = new Map();
  let n = 0;
  mcp.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); espera.get(m.id)?.(m); }
  });
  const rpc = (method, params) => new Promise((r) => { const id = ++n; espera.set(id, r); mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'falso', version: '1' } });
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const lista = await rpc('tools/list', {});
  const nomes = lista.result.tools.map((t) => t.name);

  const ev = (event) => out({ type: 'stream_event', event, parent_tool_use_id: null });
  ev({ type: 'message_start', message: { id: 'm1' } });
  ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Olá! ' } });
  ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: `Tenho ${nomes.length} ferramentas.` } });
  out({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: `Olá! Tenho ${nomes.length} ferramentas.` }, { type: 'tool_use', id: 't1', name: 'mcp__noctis__listar_projetos', input: {} }] }, parent_tool_use_id: null });
  const r1 = await rpc('tools/call', { name: 'listar_projetos', arguments: {} });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: r1.result.content }] }, parent_tool_use_id: null });

  // Ferramenta que exige permissão: o "Claude" pergunta antes.
  out({ type: 'assistant', message: { id: 'm2', content: [{ type: 'tool_use', id: 't2', name: 'mcp__noctis__pausar_fila', input: {} }] }, parent_tool_use_id: null });
  const perm = await rpc('tools/call', { name: 'aprovar', arguments: { tool_name: 'mcp__noctis__pausar_fila', input: {}, tool_use_id: 't2' } });
  const decisao = JSON.parse(perm.result.content[0].text);
  let txt;
  if (decisao.behavior === 'allow') {
    const r2 = await rpc('tools/call', { name: 'pausar_fila', arguments: {} });
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: r2.result.content }] }, parent_tool_use_id: null });
    txt = 'Fila pausada.';
  } else {
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: decisao.message }] }, parent_tool_use_id: null });
    txt = 'Tudo bem, não pausei.';
  }
  out({ type: 'assistant', message: { id: 'm3', content: [{ type: 'text', text: `${txt} (instruções: ${init.result.instructions ? 'sim' : 'não'}; prompt: ${prompt.trim()})` }] }, parent_tool_use_id: null });
  out({ type: 'result', subtype: 'success', is_error: false, session_id: sessao, total_cost_usd: 0.0123, duration_ms: 1500, num_turns: 3, result: txt });
  mcp.stdin.end();
  process.exit(0);
});
