// Conexão com o Claude: monta o bloco "noctis-studio" do claude_desktop_config.json e o comando
// do Claude Code, e (só quando o usuário clica em "Adicionar automaticamente") mescla o bloco no
// arquivo do Claude Desktop com backup, trocando a entrada antiga "audio-atlas".
const fs = require('fs');
const os = require('os');
const path = require('path');

const NOME = 'noctis-studio';
const ANTIGO = 'audio-atlas';

// O MCP roda o próprio Noctis Studio.exe em modo Node (ELECTRON_RUN_AS_NODE=1) com o script
// mcp.js, que fica FORA do app.asar (asarUnpack) para qualquer cliente conseguir carregar.
function blocoMcp({ exe, resourcesPath, raiz, empacotado }) {
  const script = empacotado
    ? path.join(resourcesPath, 'app.asar.unpacked', 'electron', 'servicos', 'ia', 'mcp.js')
    : path.join(raiz, 'electron', 'servicos', 'ia', 'mcp.js');
  return { command: exe, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

const aspas = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
function comandoClaudeCode(bloco) {
  return `claude mcp add --transport stdio --scope user --env ELECTRON_RUN_AS_NODE=1 ${NOME} -- ${aspas(bloco.command)} ${bloco.args.map(aspas).join(' ')}`;
}

function jsonDesktop(bloco) {
  return JSON.stringify({ mcpServers: { [NOME]: bloco } }, null, 2);
}

// Onde o Claude Desktop guarda a configuração (instalador normal ou versão da Microsoft Store).
function caminhosConfig({ appData = process.env.APPDATA, localAppData = process.env.LOCALAPPDATA } = {}) {
  const home = os.homedir();
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
  if (process.platform !== 'win32') return [path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude', 'claude_desktop_config.json')];
  const lista = [path.join(appData || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')];
  const pacotes = path.join(localAppData || path.join(home, 'AppData', 'Local'), 'Packages');
  try {
    for (const d of fs.readdirSync(pacotes)) {
      if (/^Claude_/i.test(d)) lista.push(path.join(pacotes, d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    }
  } catch { /* sem Store */ }
  return lista;
}

function escolherArquivo(opts) {
  const lista = caminhosConfig(opts);
  return lista.find((p) => fs.existsSync(p)) || lista.find((p) => fs.existsSync(path.dirname(p))) || lista[0];
}

function lerConfig(arquivo) {
  if (!fs.existsSync(arquivo)) return { arquivo, existe: false, valido: true, dados: {} };
  const txt = fs.readFileSync(arquivo, 'utf8');
  if (!txt.trim()) return { arquivo, existe: true, valido: true, dados: {} };
  try {
    const dados = JSON.parse(txt);
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('não é um objeto');
    return { arquivo, existe: true, valido: true, dados };
  } catch (e) {
    return { arquivo, existe: true, valido: false, erro: e.message, dados: null };
  }
}

function situacao(arquivo, bloco) {
  const c = lerConfig(arquivo);
  const s = c.dados?.mcpServers || {};
  const atual = s[NOME];
  return {
    arquivo, existe: c.existe, valido: c.valido, erro: c.erro,
    temNoctis: !!atual,
    noctisAtualizado: !!atual && JSON.stringify(atual) === JSON.stringify(bloco),
    temAudioAtlas: !!s[ANTIGO],
  };
}

// Mescla sem mexer em mais nada do arquivo. Backup antes; arquivo inválido → não toca.
function adicionar(arquivo, bloco, agora = new Date()) {
  const c = lerConfig(arquivo);
  if (!c.valido) throw Object.assign(new Error(`O arquivo do Claude está com JSON inválido (${c.erro}). Corrija ou cole o bloco manualmente: não vou sobrescrever.`), { code: 'CONFLICT' });
  let backup = null;
  if (c.existe) {
    const carimbo = agora.toISOString().replace(/[:.]/g, '-');
    backup = arquivo.replace(/\.json$/i, `.backup-${carimbo}.json`);
    fs.copyFileSync(arquivo, backup);
  }
  const dados = c.dados;
  const servidores = { ...(dados.mcpServers || {}) };
  const removeuAntigo = !!servidores[ANTIGO];
  delete servidores[ANTIGO];
  servidores[NOME] = bloco;
  const novo = { ...dados, mcpServers: servidores };
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(`${arquivo}.tmp`, JSON.stringify(novo, null, 2));
  fs.renameSync(`${arquivo}.tmp`, arquivo);
  return { arquivo, backup, removeuAntigo };
}

module.exports = { NOME, ANTIGO, blocoMcp, comandoClaudeCode, jsonDesktop, caminhosConfig, escolherArquivo, lerConfig, situacao, adicionar };
