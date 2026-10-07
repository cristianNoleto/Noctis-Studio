// Definição ÚNICA das ferramentas para IAs: o servidor MCP lista daqui, a API local valida daqui,
// o guia e os testes conferem daqui. As 4 de áudio têm nome, parâmetros e descrição IDÊNTICOS ao
// MCP "audio-atlas" antigo, para os prompts/skills que já existiam continuarem funcionando.
const TYPE = { type: 'string', enum: ['music', 'sfx'], description: 'music = trilhas/músicas; sfx = efeitos sonoros' };
const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const ACAO = {
  type: 'object',
  description: 'Uma ação, aplicada em ordem ao nome do arquivo SEM a extensão (a extensão nunca muda).',
  properties: {
    tipo: { type: 'string', enum: ['substituir', 'remover', 'prefixo', 'sufixo', 'numerar', 'caixa', 'limpar'], description: 'substituir: troca "termo" por "novo"; remover: tira "termo"; prefixo/sufixo: adiciona "texto" no começo/fim; numerar: usa "formato" com # para o número (ex.: "Cena_###" ou "{nome}_##") a partir de "inicio"; caixa: "modo" min | mai | tit; limpar: remove espaços repetidos, separadores nas pontas e caracteres inválidos.' },
    termo: { type: 'string', description: 'substituir/remover: o termo procurado.' },
    novo: { type: 'string', description: 'substituir: o texto que entra no lugar (pode ser vazio).' },
    modo: { type: 'string', description: 'substituir/remover: "termo" (palavra inteira, padrão), "prefixo" ou "sufixo". caixa: "min", "mai" ou "tit".' },
    texto: { type: 'string', description: 'prefixo/sufixo: o texto a adicionar.' },
    formato: { type: 'string', description: 'numerar: modelo com # (ex.: "Cena_###"); {nome} = nome atual.' },
    inicio: { type: 'integer', description: 'numerar: primeiro número (padrão 0).' },
  },
  required: ['tipo'],
};

const FERRAMENTAS = [
  {
    name: 'search_audio',
    description: 'Busca músicas ou efeitos sonoros no Pixabay. Aceita termos em PT/ES/EN (traduz sozinho). Retorna id, título, duração (s), tags, gênero, se já foi baixado e contentId (true = música registrada no Content ID do YouTube, pode gerar reivindicação; prefira contentId false para o canal). Ouça/escolha pelo título e tags, depois use download_audio com o id.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Ex.: "dark ambient", "whoosh", "bolha", "suspense"' },
        type: TYPE,
        limit: { type: 'integer', minimum: 1, maximum: 60, default: 20 },
        duration: { type: 'string', enum: ['short', 'medium', 'long'], description: 'short < 2s, medium 2–60s, long > 60s' },
        order: { type: 'string', enum: ['relevance', 'latest'] },
      },
      required: ['query', 'type'],
    },
    annotations: { title: 'Buscar áudio no Pixabay', ...SO_LEITURA, openWorldHint: true },
    rota: ['GET', '/api/audio/search'],
  },
  {
    name: 'download_audio',
    description: 'Baixa um áudio do Pixabay pelo id para o banco de sons local e registra no catálogo. Retorna o caminho absoluto do MP3 (use esse caminho para importar no projeto, ex.: draft do CapCut). Se já tiver sido baixado, não baixa de novo e devolve o caminho existente. Sem category, o app escolhe sozinho: usa uma pasta existente que combine de verdade ou cria uma pasta nova com nome que faz sentido (música vai para "background music\\<gênero>"). Só passe category se quiser forçar uma pasta específica.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, type: TYPE, category: { type: 'string', description: 'Opcional. Pasta ("Woosh") ou pasta\\subpasta. Deixe vazio para a escolha automática.' } },
      required: ['id', 'type'],
    },
    annotations: { title: 'Baixar áudio para o banco de sons', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    rota: ['POST', '/api/audio/download'],
  },
  {
    name: 'search_library',
    description: 'Procura no banco de sons local (arquivos já baixados e os que já estavam nas pastas). Retorna caminho absoluto, pasta/categoria e tags. Use antes de baixar algo novo.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    annotations: { title: 'Procurar no banco de sons local', ...SO_LEITURA },
    rota: ['GET', '/api/library/search'],
  },
  {
    name: 'list_categories',
    description: 'Lista a pasta raiz do banco de sons e as subpastas (categorias) disponíveis.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Listar categorias do banco de sons', ...SO_LEITURA },
    rota: ['GET', '/api/categories'],
  },
  {
    name: 'set_sound_folder',
    description: 'Troca a pasta do banco de sons do Noctis Studio (cria a pasta se não existir). Use SOMENTE quando o usuário pedir para usar outra pasta, ou quando não houver pasta e ele escolher uma. Nada é movido nem apagado: a pasta anterior fica intacta. Sempre diga ao usuário qual pasta passou a ser usada e por quê.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Caminho absoluto da pasta (ex.: "D:\\Sons\\Banco de sons").' } }, required: ['path'] },
    annotations: { title: 'Escolher a pasta do banco de sons', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    rota: ['POST', '/api/sound-folder'],
  },
  {
    name: 'list_rename_folders',
    description: 'Lista as pastas que o usuário liberou para IAs renomearem arquivos ("Pastas liberadas para IAs" no Noctis Studio). Só é possível renomear dentro delas (e nas subpastas).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Listar pastas liberadas para renomear', ...SO_LEITURA },
    rota: ['GET', '/api/rename/folders'],
  },
  {
    name: 'preview_rename',
    description: 'Gera a PRÉVIA de uma renomeação em massa (não altera nada). Retorna a lista {de, para}, os conflitos e um previewId válido por 30 minutos. Mostre a lista ao usuário e só chame apply_rename depois que ele aprovar. Nunca muda a extensão, nunca move arquivos entre pastas.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Caminho absoluto de uma pasta liberada (ou subpasta dela).' },
        actions: { type: 'array', minItems: 1, maxItems: 20, items: ACAO, description: 'Ações aplicadas em ordem. Ex.: [{"tipo":"remover","termo":"final"},{"tipo":"numerar","formato":"Cena_###","inicio":1}]' },
        recursive: { type: 'boolean', default: false, description: 'Incluir subpastas (cada arquivo continua na própria pasta).' },
        extensions: { type: 'string', description: 'Opcional. Só estas extensões, ex.: "mp3, wav".' },
      },
      required: ['folder', 'actions'],
    },
    annotations: { title: 'Prévia de renomeação (não altera nada)', ...SO_LEITURA },
    rota: ['POST', '/api/rename/preview'],
  },
  {
    name: 'apply_rename',
    description: 'Aplica uma prévia gerada por preview_rename, SÓ depois que o usuário aprovou a lista. Recusa prévias expiradas, com conflitos ou se os arquivos mudaram desde a prévia. Nunca sobrescreve nem apaga. Retorna o operationId para desfazer.',
    inputSchema: { type: 'object', properties: { previewId: { type: 'string' } }, required: ['previewId'] },
    annotations: { title: 'Aplicar renomeação aprovada', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    rota: ['POST', '/api/rename/apply'],
  },
  {
    name: 'undo_rename',
    description: 'Desfaz uma renomeação aplicada (volta os nomes antigos). Só a operação mais recente ainda não desfeita pode ser desfeita.',
    inputSchema: { type: 'object', properties: { operationId: { type: 'string' } }, required: ['operationId'] },
    annotations: { title: 'Desfazer renomeação', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    rota: ['POST', '/api/rename/undo'],
  },
];

const NOMES = new Set(FERRAMENTAS.map((f) => f.name));
const PIXABAY = new Set(['search_audio', 'download_audio']); // precisam da janela oculta (Electron)

// Lista no formato do MCP (tools/list).
const paraMcp = () => FERRAMENTAS.map(({ rota, ...t }) => t);

async function executar(nucleo, nome, args) {
  if (!NOMES.has(nome)) throw Object.assign(new Error(`Ferramenta desconhecida: ${nome}`), { code: 'NOT_FOUND' });
  return nucleo[nome](args && typeof args === 'object' ? args : {});
}

module.exports = { FERRAMENTAS, NOMES, PIXABAY, paraMcp, executar };
