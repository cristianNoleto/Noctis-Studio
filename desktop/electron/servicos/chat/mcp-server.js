#!/usr/bin/env node
// Servidor MCP "noctis" (stdio, JSON-RPC uma mensagem por linha).
// O agente de IA (Claude Code etc.) inicia este processo; ele só repassa as chamadas para a
// ponte local do app (127.0.0.1 + token aleatório), que executa com os dados do Noctis Studio.
// Arquivo autocontido de propósito: roda com o Node embutido do Electron (ELECTRON_RUN_AS_NODE).
'use strict';

const PONTE = process.env.NOCTIS_PONTE;
const TOKEN = process.env.NOCTIS_TOKEN;
const EXEC = process.env.NOCTIS_EXEC || '';
const VERSAO_PROTOCOLO = '2025-06-18';

function enviar(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`); }
function responder(id, result) { enviar({ jsonrpc: '2.0', id, result }); }
function falhar(id, code, message) { enviar({ jsonrpc: '2.0', id, error: { code, message } }); }

async function ponte(rota, corpo, { timeoutMs = 60000 } = {}) {
  if (!PONTE || !TOKEN) throw new Error('Noctis Studio não está aberto (ponte indisponível).');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${PONTE}${rota}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-noctis-exec': EXEC },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({ ok: false, error: `Resposta inválida da ponte (${r.status})` }));
    if (!j.ok) throw new Error(j.error || `Erro ${r.status}`);
    return j.data;
  } finally { clearTimeout(t); }
}

let catalogo = null;
async function carregarCatalogo() {
  if (!catalogo) catalogo = await ponte('/catalogo');
  return catalogo;
}

const APROVAR = {
  name: 'aprovar',
  description: 'Uso interno do Noctis Studio: pergunta ao usuário se uma ferramenta pode ser usada.',
  inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name'] },
};

async function tratar(msg) {
  const { id, method, params } = msg;
  const notificacao = id === undefined || id === null;
  try {
    if (method === 'initialize') {
      let instrucoes = '';
      try { instrucoes = (await carregarCatalogo()).instrucoes; } catch { /* sem app: segue sem instruções */ }
      return responder(id, {
        protocolVersion: params?.protocolVersion || VERSAO_PROTOCOLO,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'noctis', version: '1.0.0' },
        instructions: instrucoes,
      });
    }
    if (notificacao) return undefined; // notifications/initialized, cancelled…
    if (method === 'ping') return responder(id, {});
    if (method === 'tools/list') {
      const c = await carregarCatalogo();
      return responder(id, { tools: [...c.ferramentas, APROVAR] });
    }
    if (method === 'tools/call') {
      const nome = params?.name;
      const args = params?.arguments || {};
      if (nome === 'aprovar') {
        // Fica esperando o usuário responder na janela do app (até 15 min).
        const decisao = await ponte('/aprovar', args, { timeoutMs: 15 * 60 * 1000 });
        return responder(id, { content: [{ type: 'text', text: JSON.stringify(decisao) }] });
      }
      try {
        const data = await ponte('/ferramenta', { nome, args }, { timeoutMs: 10 * 60 * 1000 });
        const texto = typeof data === 'string' ? data : JSON.stringify(data, null, 1);
        return responder(id, { content: [{ type: 'text', text: texto.length > 60000 ? `${texto.slice(0, 60000)}\n…(cortado)` : texto }] });
      } catch (e) {
        return responder(id, { content: [{ type: 'text', text: `Erro: ${e.message}` }], isError: true });
      }
    }
    if (method === 'resources/list') return responder(id, { resources: [] });
    if (method === 'prompts/list') return responder(id, { prompts: [] });
    return falhar(id, -32601, `Método não suportado: ${method}`);
  } catch (e) {
    if (method === 'tools/call' && params?.name === 'aprovar') {
      return responder(id, { content: [{ type: 'text', text: JSON.stringify({ behavior: 'deny', message: `Sem resposta do Noctis Studio: ${e.message}` }) }] });
    }
    return notificacao ? undefined : falhar(id, -32603, e.message);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (pedaco) => {
  buffer += pedaco;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const linha = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!linha) continue;
    let msg;
    try { msg = JSON.parse(linha); } catch { falhar(null, -32700, 'JSON inválido'); continue; }
    if (Array.isArray(msg)) msg.forEach((m) => tratar(m));
    else tratar(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
