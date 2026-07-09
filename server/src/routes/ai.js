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

// POST /api/ai/niche-doubling  { channel: {...}, topVideos: [...] }
router.post('/niche-doubling', async (req, res) => {
  try {
    const { channel, topVideos = [] } = req.body || {}
    if (!channel?.title) return res.status(400).json({ error: 'missing_channel' })

    const result = await aiGenerateJson(req, {
      system:
        'Você é um estrategista de canais dark do YouTube, especialista em replicar formatos vencedores em novos nichos. ' +
        'Responda SEMPRE em JSON válido, em português do Brasil. Os scores são estimativas suas baseadas em padrões, não métricas garantidas.',
      prompt: `Analise o canal semente abaixo e gere a análise de "Dobra de Nicho" em 4 blocos.

CANAL SEMENTE: ${channel.title}
DESCRIÇÃO: ${channel.description || '(sem descrição)'}
INSCRITOS: ${channel.subscribers}
VÍDEOS DE MAIOR SUCESSO:
${topVideos.map((v) => `- "${v.title}" (${v.views} views)`).join('\n') || '(indisponível)'}

Responda neste formato JSON exato:
{
  "mainNiche": "<nicho principal do canal em poucas palavras>",
  "audience": "<descrição do público-alvo em 1 frase (hipótese)>",
  "confidence": "<alta|média|baixa — sua confiança na análise dado o volume de dados>",
  "winningPattern": {
    "description": "<1 frase descrevendo o padrão que faz os vídeos performarem>",
    "tags": ["<3 a 4 tags curtas do padrão>"]
  },
  "howToApply": "<parágrafo prático: como o usuário aplica esse padrão no canal dele>",
  "ideas": [
    { "title": "<ideia de vídeo no MESMO nicho>", "successScore": <0-100>, "difficulty": "<Fácil|Média|Difícil>",
      "isTurnaround": <true apenas na ideia mais contraintuitiva/inovadora, false nas demais>,
      "howToApply": "<como aplicar na prática, 2-3 frases>",
      "preserveVsChange": "<o que preservar do formato e o que muda>",
      "recommendedTitles": ["<até 5 variações de título>"] }
  ],
  "doubling": {
    "summary": "<1 frase: como transpor o formato para outros nichos>",
    "items": [ <mesmo formato dos itens de ideas, 4 itens — cada um em um nicho DIFERENTE> ]
  },
  "market": [ <mesmo formato dos itens de ideas, 2-3 itens — adaptação/tradução para outros mercados/idiomas> ]
}
Blocos "ideas" com 3 itens.`,
    })
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

export default router
