// Configurações do app num JSON em userData. Leitura com padrões; gravação atômica.
const fs = require('fs');
const path = require('path');

const DEFAULT_REWRITE_PROMPT =
  'Reescreva o seguinte prompt de geracao de imagem/video para evitar violacoes de politica de conteudo, ' +
  'mantendo a mesma intencao visual. Nao remova ou edite nenhum conteudo dentro de colchetes []. ' +
  'Retorne APENAS o prompt reescrito, nada mais.';

function defaults(documentsDir) {
  return {
    lang: 'pt',
    theme: 'dark',
    siteUrl: 'https://noctis-studio.online',
    projectsRoot: path.join(documentsDir, 'Noctis Studio'),
    fileNamePattern: '{order}_{prompt}',
    closeAction: 'ask', // ask | tray | quit
    rewrite: { keys: [], maxAttempts: 3, systemPrompt: DEFAULT_REWRITE_PROMPT, model: 'gemini-2.5-flash' },
    dispatch: {
      delay: '20-30', // segundos entre envios da MESMA conta: fixo ("20") ou faixa ("20-30")
      maxConcurrentPerAccount: 1,
      distribution: 'sequential', // sequential | parallel | auto | manual
      dailyCapPerAccount: 0, // 0 = sem teto
      cooldownBaseSeconds: 60,
      headless: false,
    },
    audioAtlas: { root: '', intervalMs: 1500 },
    renomeador: { lastFolder: '' },
    srt: { cutMode: 'center', speedUp: true, minTarget: 7.5, slowDown: true, maxTarget: 11 },
    chat: { agent: 'claude', permissionMode: '', agentes: {} },
    autoUpdate: true,
    update: { lastVersion: '', pending: null },
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null ? merge(base[k], v) : v;
  }
  return out;
}

function createStore(file, documentsDir) {
  let data = defaults(documentsDir);
  try { data = merge(data, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* primeira vez */ }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    get: () => data,
    set(patch) { data = merge(data, patch); save(); return data; },
    defaults: () => defaults(documentsDir),
  };
}

module.exports = { createStore, DEFAULT_REWRITE_PROMPT, merge };
