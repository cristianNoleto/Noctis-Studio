import { Router } from 'express'
import { aiGenerateJson, AiError } from '../lib/gemini.js'

const router = Router()

function handleError(res, err) {
  if (err instanceof AiError) {
    const status = err.code === 'missing_gemini_key' ? 400 : err.code === 'ai_rate_limited' ? 429 : 502
    return res.status(status).json({ error: err.code, message: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
}

// POST /api/ai/seo-report  { title, description, tags }
router.post('/seo-report', async (req, res) => {
  try {
    const { title, description = '', tags = [] } = req.body || {}
    if (!title) return res.status(400).json({ error: 'missing_title' })

    const result = await aiGenerateJson(req, {
      system:
        'Você é um especialista em SEO e CTR do YouTube para canais dark (conteúdo narrado sem rosto). ' +
        'Responda SEMPRE em JSON válido, em português do Brasil.',
      prompt: `Analise o vídeo abaixo e devolva um relatório de SEO/CTR.

TÍTULO: ${title}
DESCRIÇÃO: ${description || '(vazia)'}
TAGS: ${tags.join(', ') || '(nenhuma)'}

Responda neste formato JSON exato:
{
  "score": <número inteiro 0-100 avaliando o potencial de SEO/CTR>,
  "strengths": ["<ponto forte 1>", "..."],
  "weaknesses": ["<ponto fraco 1>", "..."],
  "suggestions": {
    "title": "<sugestão de melhoria do título>",
    "thumbnail": "<sugestão de conceito de thumbnail>",
    "description": "<sugestão de melhoria da descrição>"
  }
}`,
    })
    result.score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 0)))
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// POST /api/ai/titles  { idea, niche, context } — títulos prontos para uma oportunidade da Dobra
router.post('/titles', async (req, res) => {
  try {
    const { idea, niche = '', context = '' } = req.body || {}
    if (!idea) return res.status(400).json({ error: 'missing_idea' })

    const result = await aiGenerateJson(req, {
      system:
        'Você é um especialista em títulos de alto CTR para canais dark do YouTube (conteúdo narrado, sem rosto). ' +
        'Responda SEMPRE em JSON válido, em português do Brasil.',
      prompt: `Gere 10 títulos prontos para publicar, com alto potencial de CTR, para a ideia de vídeo abaixo.
Use gatilhos comprovados (curiosidade, número, contraste, medo/urgência quando fizer sentido), sem clickbait mentiroso e com no máximo ~70 caracteres cada.

IDEIA: ${idea}
NICHO: ${niche || '(não informado)'}
CONTEXTO DO PADRÃO VENCEDOR: ${context || '(não informado)'}

Responda neste formato JSON exato:
{ "titles": ["<título 1>", "<título 2>", "... 10 títulos"] }`,
    })
    res.json({ titles: (result.titles || []).filter((t) => typeof t === 'string').slice(0, 10) })
  } catch (err) {
    handleError(res, err)
  }
})

// POST /api/ai/niche-doubling  { channel: {...}, topVideos: [...] }
// Engenharia reversa do padrão vencedor do canal semente e geração do grafo de
// oportunidades (Mar de Ideias, Dobra de Nicho, Adaptação de Mercado) com a
// mesma profundidade do relatório de referência.
router.post('/niche-doubling', async (req, res) => {
  try {
    const { channel, topVideos = [] } = req.body || {}
    if (!channel?.title) return res.status(400).json({ error: 'missing_channel' })

    // Outlier = quantas vezes o vídeo bate a mediana de views do canal.
    const views = topVideos.map((v) => Number(v.views) || 0).filter(Boolean).sort((a, b) => a - b)
    const median = views.length ? views[Math.floor(views.length / 2)] : 0
    const evidence = topVideos
      .map((v) => `- "${v.title}" — ${Number(v.views).toLocaleString('pt-BR')} views${median ? ` (${(v.views / median).toFixed(1)}x a mediana)` : ''}`)
      .join('\n')

    const result = await aiGenerateJson(req, {
      system:
        'Você é um estrategista sênior de canais dark do YouTube (conteúdo narrado, sem rosto), especialista em engenharia reversa de formatos vencedores e em replicá-los em novos nichos e mercados. ' +
        'Você é analítico, específico e cita evidências concretas dos dados. Responda SEMPRE em JSON válido, em português do Brasil. ' +
        'REGRA DE TÍTULOS: se o canal semente é em inglês (ou outro idioma), mantenha os "recommendedTitles" no MESMO idioma do canal (âncoras de SEO), exceto no bloco "market" (adaptação de mercado), onde os títulos vão no idioma/cultura do mercado-alvo. ' +
        'Os scores de sucesso e dificuldade são estimativas suas baseadas em padrões — não métricas garantidas.',
      prompt: `Faça a engenharia reversa do canal semente abaixo e gere a análise de "Dobra de Nicho".

CANAL SEMENTE: ${channel.title}
DESCRIÇÃO: ${channel.description || '(sem descrição)'}
PAÍS: ${channel.country || '(desconhecido)'}
INSCRITOS: ${channel.subscribers} · VIEWS TOTAIS: ${channel.views} · VÍDEOS: ${channel.videoCount}
TÓPICOS: ${(channel.topics || []).join(', ') || '(indisponível)'}
VÍDEOS DE MAIOR DESEMPENHO (outliers):
${evidence || '(indisponível)'}

Não seja genérico: derive o padrão a partir do que REALMENTE performou (os outliers acima), não da média do canal. Cada campo deve ser específico deste canal.

Responda neste formato JSON exato (sem comentários, sem markdown):
{
  "mainNiche": "<nicho principal, poucas palavras>",
  "subNiche": "<subnicho atual específico>",
  "audience": "<público-alvo em 1 frase, marque como hipótese; inclua a emoção/fascínio que move esse público>",
  "territory": "<o território/ângulo editorial que o canal ocupa>",
  "confidence": "<alta|média|baixa — sua confiança dado o volume de dados>",
  "winningPattern": {
    "description": "<1 frase densa: o padrão que faz os outliers vencerem>",
    "tags": ["<3 a 4 tags curtas do padrão>"],
    "commonTraits": ["<3 pontos: o que os vídeos vencedores têm em comum>"],
    "triggers": ["<3 gatilhos psicológicos de clique/retenção que o padrão explora>"],
    "titleFormulas": ["<3 fórmulas de título reutilizáveis, com [placeholders]>"],
    "winningFunction": {
      "promise": "<a promessa central que o vídeo entrega ao espectador>",
      "emotion": "<a emoção dominante que o conteúdo desperta>",
      "identity": "<a fantasia de identidade que o espectador assume ao assistir>"
    }
  },
  "howToApply": "<parágrafo prático de como o usuário aplica esse padrão no próprio canal>",
  "ideas": [
    {
      "kind": "<Microtema|Nova Visão|Subnicho>",
      "title": "<ideia de vídeo/série no MESMO público, aprofundando o nicho>",
      "subtitle": "<1 frase descrevendo a ideia e para quem>",
      "confidence": "<alta|média|baixa>",
      "successScore": <0-100>, "difficulty": "<Fácil|Média|Difícil>",
      "isTurnaround": <true só na ideia mais contraintuitiva, false nas demais>,
      "targetTheme": "<ideia de tema-alvo concreta para o primeiro vídeo>",
      "howToApply": "<como aplicar na prática, 2-3 frases>",
      "preserve": ["<3 elementos do formato vencedor que se PRESERVAM>"],
      "change": ["<2-3 elementos que MUDAM nesta ideia>"],
      "preserveVsChange": "<1 frase resumindo preserva vs muda>",
      "recommendedTitles": ["<5 a 6 títulos prontos de alto CTR>"],
      "equivalenceMap": [ { "from": "<título vencedor real do canal>", "to": "<título equivalente desta ideia>", "why": "<o mecanismo transposto>" } ],
      "breakAlerts": ["<1-2 riscos de quebrar o padrão ou a audiência>"]
    }
  ],
  "doubling": {
    "summary": "<1 frase: como transpor a fórmula para nichos totalmente diferentes>",
    "items": [
      {
        "kind": "Dobra",
        "title": "<nome do novo nicho-alvo>",
        "subtitle": "<1 frase: que canal seria e para quem>",
        "newNiche": "<nicho novo>", "subNicheNew": "<subnicho>", "audienceNew": "<público-alvo do novo nicho>",
        "confidence": "<alta|média|baixa>", "successScore": <0-100>, "difficulty": "<Fácil|Média|Difícil>",
        "targetTheme": "<ideia de tema-alvo concreta no novo nicho>",
        "howToApply": "<como criar esse canal reaproveitando a fórmula>",
        "preserve": ["<3 elementos que se preservam>"],
        "change": ["<2-3 elementos que mudam>"],
        "preserveVsChange": "<1 frase resumo>",
        "recommendedTitles": ["<5 a 6 títulos prontos>"],
        "equivalenceMap": [ { "from": "<título vencedor real>", "to": "<título no novo nicho>", "why": "<mecanismo>" } ],
        "breakAlerts": ["<1-2 riscos>"]
      }
    ]
  },
  "market": [
    {
      "kind": "Adaptação",
      "title": "<adaptar a fórmula para outro mercado/cultura>",
      "subtitle": "<1 frase>",
      "marketHypothesis": true,
      "confidence": "<alta|média|baixa>", "successScore": <0-100>, "difficulty": "<Fácil|Média|Difícil>",
      "targetTheme": "<tema-alvo localizado (não traduzido)>",
      "howToApply": "<como localizar de verdade, ancorando em referências culturais reais>",
      "preserve": ["<3 elementos que se preservam>"],
      "change": ["<2-3 elementos que mudam na localização>"],
      "preserveVsChange": "<1 frase resumo>",
      "recommendedTitles": ["<5 a 6 títulos no idioma/cultura do mercado-alvo>"],
      "equivalenceMap": [ { "from": "<título vencedor real>", "to": "<título localizado>", "why": "<mecanismo>" } ],
      "breakAlerts": ["<1-2 riscos da adaptação>"]
    }
  ]
}
Regras de contagem: "ideas" = 3 itens; "doubling.items" = 4 itens (nichos DIFERENTES entre si); "market" = 2 a 3 itens.`,
    })
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

export default router
