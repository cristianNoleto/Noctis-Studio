// Ferramentas do Noctis Studio oferecidas ao agente de IA (via servidor MCP "noctis").
// Cada ferramenta chama os mesmos handlers da interface (ctx.invocar), então valem as mesmas
// regras: precisa estar logado na conta Noctis, a fila respeita o ritmo configurado etc.
//
// `leitura: true` = só consulta; o chat libera sem pedir confirmação. As demais passam pela
// aprovação do usuário (a não ser que ele escolha um modo de permissão mais solto).

const INSTRUCOES = `Você está dentro do Noctis Studio (app desktop), conversando com o dono do app em português do Brasil.
O Noctis Studio gera imagens e vídeos no Google Flow em fila (projetos → jobs), baixa músicas/efeitos do Pixabay (Audio Atlas),
renomeia arquivos em lote (Renomeador) e sincroniza mídias com o SRT da narração.
Use as ferramentas "noctis" para ver e mexer nesses dados. Regras:
- Prompts vão um por linha em enviar_prompts. Tags no início da linha: [i] imagem (padrão), [v] vídeo, [iv] imagem e depois animar;
  proporção [16:9] [9:16] [1:1] [4:3] [3:4]; modelo de imagem [nano_pro] [nano_2] [nano_lite]; vídeo [fast] [quality] [lite];
  resolução [2k] [4k] [1080p]; duração [4s] [6s] [8s]; personagens do projeto por [Nome]; "[i] cena [v] movimento" faz o par imagem→vídeo.
- Nunca invente ids: liste antes (listar_projetos, ver_projeto).
- A fila respeita os intervalos e limites por conta definidos pelo usuário; não tente contornar cooldown nem trocar de conta para fugir de limite.
- Ações que mexem em arquivos (renomeador_aplicar) só depois de mostrar a prévia e o usuário concordar.
- Responda curto e direto.`;

const corta = (s, n = 160) => (s && String(s).length > n ? `${String(s).slice(0, n)}…` : s || '');

function criarFerramentas(ctx) {
  const ultimaBusca = new Map(); // id → item do Pixabay (para audio_baixar)
  const inv = (canal, ...a) => ctx.invocar(canal, ...a);
  const resumoJob = (j) => ({ id: j.id, seq: j.seq, tipo: j.kind, status: j.status, prompt: corta(j.prompt), erro: j.error ? corta(j.error, 120) : undefined, arquivos: (j.files || []).length || undefined });

  const lista = [
    {
      name: 'resumo', leitura: true,
      description: 'Painel do Noctis: fila, gerados hoje, contas ativas, o que está gerando agora e os últimos jobs.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        const d = await inv('creator:dashboard');
        return { fila: d.queue, geradosHoje: d.doneToday, reescritosIA: d.rewrites, contas: d.accounts, gerandoAgora: (d.generating || []).map(resumoJob), recentes: (d.recent || []).map(resumoJob) };
      },
    },
    {
      name: 'listar_projetos', leitura: true,
      description: 'Lista os projetos (id, nome, pasta e contagem de jobs por status).',
      inputSchema: { type: 'object', properties: {} },
      run: async () => (await inv('creator:projects')).map((p) => ({ id: p.id, nome: p.name, pasta: p.folder, pausado: !!p.paused, contagem: p.counts })),
    },
    {
      name: 'ver_projeto', leitura: true,
      description: 'Detalhes de um projeto: contagem, personagens e jobs (até 300, mais recentes por último). Filtre por status se quiser.',
      inputSchema: { type: 'object', properties: { projeto: { type: 'number', description: 'id do projeto' }, status: { type: 'string', enum: ['pending', 'processing', 'downloading', 'done', 'failed', 'deleted'] } }, required: ['projeto'] },
      run: async ({ projeto, status }) => {
        const p = await inv('creator:project', Number(projeto));
        const jobs = p.jobs.filter((j) => (status ? j.status === status : j.status !== 'deleted'));
        return { id: p.id, nome: p.name, pasta: p.folder, pausado: !!p.paused, contagem: p.counts, personagens: p.characters, totalJobs: jobs.length, jobs: jobs.slice(-300).map(resumoJob) };
      },
    },
    {
      name: 'criar_projeto',
      description: 'Cria um projeto novo (pasta própria dentro da pasta de projetos do app, ou a pasta informada).',
      inputSchema: { type: 'object', properties: { nome: { type: 'string' }, pasta: { type: 'string', description: 'opcional: caminho completo da pasta' } }, required: ['nome'] },
      run: async ({ nome, pasta }) => { const p = await inv('creator:createProject', { name: nome, folder: pasta }); return { id: p.id, nome: p.name, pasta: p.folder }; },
    },
    {
      name: 'enviar_prompts',
      description: 'Coloca prompts na fila de um projeto (um por linha, com as tags do Noctis). Retorna quantos jobs foram criados.',
      inputSchema: { type: 'object', properties: { projeto: { type: 'number' }, texto: { type: 'string', description: 'um prompt por linha' } }, required: ['projeto', 'texto'] },
      run: async ({ projeto, texto }) => {
        const r = await inv('creator:submit', { projectId: Number(projeto), texto: String(texto || '') });
        return { prompts: r.linhas, jobsCriados: r.jobs };
      },
    },
    {
      name: 'fila_status', leitura: true,
      description: 'Estado da fila de geração (pausada, pendentes, processando).',
      inputSchema: { type: 'object', properties: {} },
      run: () => inv('creator:queueStatus'),
    },
    {
      name: 'pausar_fila',
      description: 'Pausa a fila de geração (o que está em andamento termina).',
      inputSchema: { type: 'object', properties: {} },
      run: () => inv('creator:pause'),
    },
    {
      name: 'retomar_fila',
      description: 'Retoma a fila de geração.',
      inputSchema: { type: 'object', properties: {} },
      run: () => inv('creator:resume'),
    },
    {
      name: 'reenviar_falhas',
      description: 'Coloca de volta na fila todos os jobs com falha de um projeto.',
      inputSchema: { type: 'object', properties: { projeto: { type: 'number' } }, required: ['projeto'] },
      run: async ({ projeto }) => ({ reenviados: await inv('creator:retryFailed', Number(projeto)) }),
    },
    {
      name: 'acao_job',
      description: 'Ação em um job: retry (tentar de novo), cancel, favorite, editPrompt (troca o prompt e reenvia; informe prompt), animate (cria vídeo a partir da imagem).',
      inputSchema: { type: 'object', properties: { job: { type: 'string' }, acao: { type: 'string', enum: ['retry', 'cancel', 'favorite', 'editPrompt', 'animate'] }, prompt: { type: 'string' } }, required: ['job', 'acao'] },
      run: async ({ job, acao, prompt }) => { await inv('creator:jobAction', job, acao, acao === 'editPrompt' || acao === 'animate' ? { prompt } : undefined); return { ok: true }; },
    },
    {
      name: 'listar_contas', leitura: true,
      description: 'Contas Google/Flow conectadas (e-mail mascarado), status, uso de hoje e cooldown.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => (await inv('accounts:list')).map((c) => ({ conta: c.masked, provedor: c.provider, status: c.status, ativa: !!c.enabled, padrao: !!c.is_default, usoHoje: c.usedToday, cooldownAte: c.cooldown_until || undefined })),
    },
    {
      name: 'audio_buscar', leitura: true,
      description: 'Busca músicas ou efeitos sonoros no Pixabay (aceita português, é traduzido). Guarde o id para baixar.',
      inputSchema: { type: 'object', properties: { busca: { type: 'string' }, tipo: { type: 'string', enum: ['music', 'sfx'], default: 'music' }, pagina: { type: 'number', default: 1 } }, required: ['busca'] },
      run: async ({ busca, tipo = 'music', pagina = 1 }) => {
        const r = await inv('aa:search', { query: busca, type: tipo, page: Number(pagina) || 1 });
        for (const it of r.items || []) ultimaBusca.set(String(it.id), it);
        return { buscaEmIngles: r.translation?.english, total: r.total, itens: (r.items || []).slice(0, 25).map((it) => ({ id: it.id, titulo: it.title, duracao: it.duration, autor: it.author, tags: corta((it.tags || []).join(', '), 80), jaBaixado: (r.downloaded || []).map(String).includes(String(it.id)) })) };
      },
    },
    {
      name: 'audio_baixar',
      description: 'Baixa um áudio de uma busca recente (audio_buscar) para a biblioteca do Audio Atlas. Categoria opcional (senão o app sugere).',
      inputSchema: { type: 'object', properties: { id: { type: ['string', 'number'] }, categoria: { type: 'string' } }, required: ['id'] },
      run: async ({ id, categoria }) => {
        const item = ultimaBusca.get(String(id));
        if (!item) throw new Error('Esse id não está na última busca. Rode audio_buscar antes.');
        const cat = categoria || (await inv('aa:suggestCategory', item));
        const r = await inv('aa:download', item, cat);
        return { arquivo: r.path, categoria: cat, jaExistia: !!r.duplicate };
      },
    },
    {
      name: 'renomeador_analisar', leitura: true,
      description: 'Analisa os nomes dos arquivos de uma pasta: termos repetidos, prefixos/sufixos comuns e quantos nomes estão "sujos".',
      inputSchema: { type: 'object', properties: { pasta: { type: 'string' }, subpastas: { type: 'boolean' }, extensoes: { type: 'string', description: 'ex.: mp4,png (vazio = todas)' } }, required: ['pasta'] },
      run: async (a) => { const r = await inv('ren:analisar', a); return { total: r.total, sujos: r.sujos, itens: (r.itens || []).slice(0, 40) }; },
    },
    {
      name: 'renomeador_previa', leitura: true,
      description: 'Prévia de renomeação (não mexe em nada). acoes em ordem, cada uma: {tipo:"substituir",modo:"termo|prefixo|sufixo",termo,novo} | {tipo:"remover",modo,termo} | {tipo:"prefixo",texto} | {tipo:"sufixo",texto} | {tipo:"numerar",formato:"{nome}_###",inicio:1} | {tipo:"caixa",modo:"min|mai|tit"} | {tipo:"limpar"}.',
      inputSchema: { type: 'object', properties: { pasta: { type: 'string' }, subpastas: { type: 'boolean' }, extensoes: { type: 'string' }, acoes: { type: 'array', items: { type: 'object' } } }, required: ['pasta', 'acoes'] },
      run: async (a) => {
        const linhas = await inv('ren:previa', a);
        const mudam = linhas.filter((l) => l.status !== 'igual');
        return { total: linhas.length, mudam: mudam.length, conflitos: linhas.filter((l) => l.status === 'conflito').length, exemplos: mudam.slice(0, 30).map((l) => ({ de: l.rel, para: l.novo, status: l.status, motivo: l.motivo || undefined })) };
      },
    },
    {
      name: 'renomeador_aplicar',
      description: 'Aplica a renomeação (mesmos parâmetros da prévia). Pode ser desfeita no app (Renomeador → Desfazer).',
      inputSchema: { type: 'object', properties: { pasta: { type: 'string' }, subpastas: { type: 'boolean' }, extensoes: { type: 'string' }, acoes: { type: 'array', items: { type: 'object' } } }, required: ['pasta', 'acoes'] },
      run: async (a) => ({ renomeados: await inv('ren:aplicar', a) }),
    },
    {
      name: 'srt_previa', leitura: true,
      description: 'Prévia do Sincronizador SRT: para cada bloco da narração, qual arquivo numerado entra e o que acontece (cortar, acelerar, desacelerar, imagem, erro). Usa os ajustes salvos na tela.',
      inputSchema: { type: 'object', properties: { srt: { type: 'string' }, pasta: { type: 'string' }, pastaExtra: { type: 'string' } }, required: ['srt', 'pasta'] },
      run: async ({ srt, pasta, pastaExtra }) => {
        const cfg = ctx.store.get().srt || {};
        const r = await inv('srt:preview', { srt, principal: pasta, extra: pastaExtra || '', audio: cfg.ultimo?.audio || '', cfg: { ...cfg, ultimo: undefined } });
        return { resumo: r.resumo, resolucao: r.resolucao, blocos: r.plano.slice(0, 120).map((p) => ({ n: p.num, duracao: Number(p.duracao.toFixed(2)), arquivo: p.arquivo ? p.arquivo.split(/[\\/]/).pop() : null, acao: p.acao, motivo: p.motivo })) };
      },
    },
    {
      name: 'abrir_tela', leitura: true,
      description: 'Abre uma tela do app para o usuário ver: dashboard, projetos, creator/<id do projeto>, srt, audio-atlas, renomeador, contas, logs, config.',
      inputSchema: { type: 'object', properties: { tela: { type: 'string' } }, required: ['tela'] },
      run: ({ tela }) => { ctx.send('chat:event', { tipo: 'navegar', tela: String(tela) }); return { ok: true }; },
    },
  ];

  const porNome = new Map(lista.map((f) => [f.name, f]));
  return {
    instrucoes: INSTRUCOES,
    definicoes: () => lista.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    leitura: () => lista.filter((f) => f.leitura).map((f) => f.name),
    async executar(nome, args) {
      const f = porNome.get(nome);
      if (!f) throw new Error(`Ferramenta desconhecida: ${nome}`);
      return f.run(args || {});
    },
  };
}

module.exports = { criarFerramentas, INSTRUCOES };
