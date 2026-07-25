import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search,
  Loader2,
  GitBranch,
  ArrowLeft,
  Plus,
  FileDown,
  Printer,
  History,
  RefreshCw,
  Lightbulb,
  ChevronDown,
  Trash2,
  Star,
} from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, btnPrimary, btnGhost, Drawer, formatCompact } from '../components/ui'
import { PrivacyScope, PageEye, Masked, RestrictedThumb } from '../components/privacy'
import { downloadFile } from '../lib/text'
import { useI18n } from '../i18n'
import { useAiLimit } from '../lib/useAiLimit'
import { AiLimitBanner } from '../components/PlanGate'

// Normaliza análises antigas (schema v1: dna/doubling em array) para o formato atual.
function normalizeResult(result) {
  if (!result) return null
  const r = { ...result }
  if (Array.isArray(r.doubling)) r.doubling = { summary: '', items: r.doubling }
  if (!r.winningPattern && r.dna?.length) {
    r.winningPattern = { description: r.dna[0].title, tags: r.dna.slice(0, 4).map((d) => d.title) }
  }
  r.ideas = r.ideas || []
  r.market = r.market || []
  r.doubling = r.doubling || { summary: '', items: [] }
  return r
}

function computeOutliers(topVideos = []) {
  const views = topVideos.map((v) => v.views).filter((v) => v > 0).sort((a, b) => a - b)
  if (views.length < 3) return { count: 0, biggest: null }
  const median = views[Math.floor(views.length / 2)]
  if (!median) return { count: 0, biggest: null }
  return {
    count: views.filter((v) => v >= median * 3).length,
    biggest: +(Math.max(...views) / median).toFixed(2),
  }
}

function timeAgo(ts, t) {
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days < 1) return t('doubling.today')
  if (days < 7) return t('doubling.daysAgo', { n: days })
  return t('doubling.weeksAgo', { n: Math.floor(days / 7) })
}

export default function NicheDoubling() {
  const db = useDb()
  const { t } = useI18n()
  const aiLimit = useAiLimit()
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [currentId, setCurrentId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [applyOpen, setApplyOpen] = useState(false)

  const history = [...db.all('nicheAnalyses')].sort((a, b) => b.createdAt - a.createdAt)
  const current = currentId ? db.get('nicheAnalyses', currentId) : null

  useEffect(() => {
    const ch = params.get('channel')
    if (ch && !current && !loading) analyze(ch)
    // Sem canal na URL: abre na tela de histórico de análises (não na última).
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function analyze(input, { force = false } = {}) {
    setLoading(true)
    setError('')
    try {
      setStage(t('doubling.stageSeed'))
      const channel = await api.youtube.lookupChannel(input)

      const cached = db.all('nicheAnalyses').find((h) => h.sourceChannelId === channel.id)
      // Só bloqueia o limite quando VAI chamar a IA (análise em cache não conta).
      if ((!cached || force) && !aiLimit.ok) {
        setError(t('plans.aiLimit.reached', { used: aiLimit.used, limit: aiLimit.limit }))
        setLoading(false)
        return
      }
      if (cached && !force) {
        setCurrentId(cached.id)
        setLoading(false)
        return
      }

      setStage(t('doubling.stageTop'))
      const { results: topVideos } = await api.youtube.topVideos(channel.id)

      setStage(t('doubling.stageAi'))
      const result = await api.ai.nicheDoubling({ channel, topVideos })

      if (cached) db.remove('nicheAnalyses', cached.id)
      const saved = db.insert('nicheAnalyses', { sourceChannelId: channel.id, channel, topVideos, result })
      setCurrentId(saved.id)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
      setStage('')
    }
  }

  function exportTxt() {
    const r = normalizeResult(current.result)
    const item = (i, idx) =>
      `${idx != null ? `${idx}. ` : '- '}${i.title} (sucesso ~${i.successScore}% · ${i.difficulty})\n  Como aplicar: ${i.howToApply}\n  Preservar/mudar: ${i.preserveVsChange}\n  Títulos: ${(i.recommendedTitles || []).join(' | ')}`
    const txt = [
      `DOBRA DE NICHO — ${current.channel.title}`,
      `Nicho principal: ${r.mainNiche || '-'}`,
      `Público: ${r.audience || '-'}`,
      `Padrão vencedor: ${r.winningPattern?.description || '-'} [${(r.winningPattern?.tags || []).join(', ')}]`,
      `Como aplicar na prática: ${r.howToApply || '-'}`,
      '',
      '== MAR DE IDEIAS ==',
      ...r.ideas.map((i) => item(i)),
      '',
      `== DOBRA DE NICHO == ${r.doubling.summary || ''}`,
      ...r.doubling.items.map((i, idx) => item(i, idx + 1)),
      '',
      '== ADAPTAÇÃO DE MERCADO ==',
      ...r.market.map((i) => item(i)),
      '',
      '⚠️ Scores são estimativas geradas por IA, não métricas garantidas.',
    ].join('\n')
    downloadFile(`dobra-de-nicho-${current.channel.title}.txt`, txt)
  }

  // PDF padronizado com a marca Noctis Studio (baseado no relatório do original):
  // abre uma janela com o relatório diagramado e dispara a impressão em PDF.
  function exportPdf() {
    const r = normalizeResult(current.result)
    const ch = current.channel
    const out = computeOutliers(current.topVideos)
    const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const today = new Date().toLocaleDateString('pt-BR')

    const bullets = (arr, c) =>
      (arr || []).length ? `<ul class="bl">${arr.map((t) => `<li style="--d:${c}">${esc(t)}</li>`).join('')}</ul>` : ''

    const itemCard = (i, idx, color) => `
      <div class="item" style="border-left-color:${color}">
        <div class="item-head">
          <span class="num" style="background:${color}1f;color:${color}">${idx}</span>
          <h3>${esc(i.title)}</h3>
          ${i.confidence ? `<span class="conf">Confiança ${esc(i.confidence)}</span>` : ''}
          <span class="score">Sucesso ~${esc(i.successScore)}%</span>
          ${i.difficulty ? `<span class="diff">${esc(i.difficulty)}</span>` : ''}
        </div>
        ${i.subtitle ? `<p class="sub">${esc(i.subtitle)}</p>` : ''}
        ${i.newNiche || i.subNicheNew || i.audienceNew ? `<div class="box">${i.newNiche ? `<p><b>Nicho novo:</b> ${esc(i.newNiche)}</p>` : ''}${i.subNicheNew ? `<p><b>Subnicho:</b> ${esc(i.subNicheNew)}</p>` : ''}${i.audienceNew ? `<p><b>Público-alvo:</b> ${esc(i.audienceNew)}</p>` : ''}</div>` : ''}
        ${i.targetTheme ? `<p class="lbl">Ideia de tema-alvo</p><p>${esc(i.targetTheme)}</p>` : ''}
        ${i.howToApply ? `<p class="lbl">Como aplicar</p><p>${esc(i.howToApply)}</p>` : ''}
        ${(i.recommendedTitles || []).length ? `<p class="lbl">Títulos prontos</p><ul>${i.recommendedTitles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${(i.preserve || []).length || (i.change || []).length
          ? `<div class="cols"><div><p class="lbl" style="color:#4ade80">O que preserva</p>${bullets(i.preserve, '#4ade80')}</div><div><p class="lbl" style="color:#f59e0b">O que muda</p>${bullets(i.change, '#f59e0b')}</div></div>`
          : i.preserveVsChange ? `<p class="lbl">O que preservar / o que muda</p><p>${esc(i.preserveVsChange)}</p>` : ''}
        ${(i.equivalenceMap || []).length ? `<p class="lbl">Mapa de equivalência</p>${i.equivalenceMap.map((e) => `<div class="eq"><p class="eqf">${esc(e.from)}</p>${e.why ? `<p class="eqw">↓ ${esc(e.why)}</p>` : ''}<p class="eqt">${esc(e.to)}</p></div>`).join('')}` : ''}
        ${(i.breakAlerts || []).length ? `<p class="lbl" style="color:#f87171">Alertas de quebra</p>${bullets(i.breakAlerts, '#f87171')}` : ''}
      </div>`

    const section = (title, color, items) =>
      items.length
        ? `<div class="section"><h2 style="color:${color}"><span class="dot" style="background:${color}"></span>${title}</h2>${items
            .map((i, idx) => itemCard(i, idx + 1, color))
            .join('')}</div>`
        : ''

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dobra de Nicho — ${esc(ch.title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d0e12; color: #e2e8f0; padding: 0; }
  .page { max-width: 800px; margin: 0 auto; padding: 36px 40px; }
  .brand { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #00f2fe; padding-bottom: 18px; }
  .mark { width: 42px; height: 42px; border-radius: 11px; background: linear-gradient(135deg, #00f2fe, #00b8cc); display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .brand h1 { font-size: 20px; color: #f1f5f9; } .brand h1 b { color: #00f2fe; }
  .brand .meta { margin-left: auto; text-align: right; font-size: 11px; color: #64748b; }
  .channel { display: flex; gap: 16px; align-items: center; margin-top: 24px; background: #16171d; border: 1px solid #1e293b; border-radius: 14px; padding: 18px; }
  .channel img { width: 62px; height: 62px; border-radius: 50%; border: 2px solid #00f2fe55; }
  .channel h2 { font-size: 22px; color: #f8fafc; }
  .channel p { font-size: 12px; color: #94a3b8; margin-top: 3px; }
  .tag { display: inline-block; font-size: 10px; font-weight: 700; color: #00f2fe; border: 1px solid #00f2fe44; background: #00f2fe12; border-radius: 99px; padding: 2px 9px; margin-top: 6px; }
  .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 14px; }
  .stat { background: #16171d; border: 1px solid #1e293b; border-radius: 10px; padding: 10px; text-align: center; }
  .stat b { display: block; font-size: 16px; color: #f8fafc; }
  .stat span { font-size: 8.5px; letter-spacing: 1px; color: #64748b; font-weight: 700; }
  .pattern { margin-top: 14px; background: #16171d; border: 1px solid #00f2fe33; border-radius: 12px; padding: 14px 16px; }
  .pattern .lbl, .lbl { font-size: 9.5px; letter-spacing: 1.4px; font-weight: 700; color: #00f2fe; margin-top: 10px; }
  .pattern p.desc { font-size: 13px; color: #e2e8f0; margin-top: 5px; }
  .chips { margin-top: 8px; } .chips span { display: inline-block; font-size: 10px; color: #94a3b8; border: 1px solid #334155; border-radius: 99px; padding: 2px 9px; margin: 2px 3px 0 0; }
  .section { margin-top: 26px; page-break-inside: avoid; }
  .section h2 { font-size: 15px; display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .item { background: #16171d; border: 1px solid #1e293b; border-left: 3px solid; border-radius: 10px; padding: 13px 15px; margin-bottom: 10px; page-break-inside: avoid; }
  .item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .item h3 { font-size: 13.5px; color: #f1f5f9; flex: 1; }
  .num { font-size: 11px; font-weight: 800; border-radius: 99px; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; }
  .score, .diff, .conf { font-size: 10px; font-weight: 700; border-radius: 99px; padding: 2px 8px; background: #1e293b; color: #cbd5e1; }
  .conf { background: #0f2b22; color: #4ade80; }
  .item p { font-size: 11.5px; color: #a9b4c4; line-height: 1.55; margin-top: 3px; }
  .item p.sub { color: #94a3b8; margin-top: 4px; }
  .item ul { margin: 4px 0 0 16px; } .item li { font-size: 11.5px; color: #cbd5e1; margin-top: 2px; }
  .box { background: #0d0e12; border: 1px solid #1e293b; border-radius: 8px; padding: 8px 11px; margin-top: 8px; }
  .box p { font-size: 11px; color: #cbd5e1; margin-top: 2px; } .box b { color: #00f2fe; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  ul.bl { list-style: none; margin: 4px 0 0 0; padding: 0; }
  ul.bl li { position: relative; padding-left: 13px; font-size: 11px; color: #cbd5e1; margin-top: 4px; }
  ul.bl li::before { content: ''; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; border-radius: 50%; background: var(--d); }
  .eq { background: #0d0e12; border: 1px solid #1e293b; border-radius: 8px; padding: 8px 11px; margin-top: 6px; }
  .eq .eqf { font-size: 11px; color: #94a3b8; } .eq .eqw { font-size: 10px; color: #00f2fe; margin-top: 2px; } .eq .eqt { font-size: 12px; font-weight: 600; color: #f1f5f9; margin-top: 2px; }
  .dna { margin-top: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .dna h4 { font-size: 9.5px; letter-spacing: 1px; margin-bottom: 5px; }
  .fn { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
  .fn div { background: #16171d; border: 1px solid #1e293b; border-radius: 9px; padding: 10px 12px; }
  .fn h5 { font-size: 8.5px; letter-spacing: 1px; color: #00f2fe; } .fn p { font-size: 11px; color: #e2e8f0; margin-top: 3px; }
  .foot { margin-top: 28px; border-top: 1px solid #1e293b; padding-top: 12px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 10mm; background: #0d0e12; }
  }
</style></head><body><div class="page">
  <div class="brand">
    <div class="mark">🌙</div>
    <h1>Noctis <b>Studio</b><div style="font-size:11px;font-weight:400;color:#94a3b8">Relatório de Dobra de Nicho</div></h1>
    <div class="meta">Gerado em ${today}<br/>noctis.studio</div>
  </div>

  <div class="channel">
    ${ch.avatar ? `<img src="${esc(ch.avatar)}" referrerpolicy="no-referrer"/>` : ''}
    <div>
      <h2>${esc(ch.title)}</h2>
      <p><b style="color:#00f2fe">Nicho principal:</b> ${esc(r.mainNiche || '—')}</p>
      ${r.subNiche ? `<p><b style="color:#00f2fe">Subnicho:</b> ${esc(r.subNiche)}</p>` : ''}
      <p><b>Público:</b> ${esc(r.audience || '—')}</p>
      ${r.territory ? `<p><b>Território:</b> ${esc(r.territory)}</p>` : ''}
      <span class="tag">Confiança ${esc((r.confidence || 'alta').toUpperCase())}</span>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><b>${formatCompact(ch.subscribers)}</b><span>INSCRITOS</span></div>
    <div class="stat"><b>${formatCompact(ch.views)}</b><span>VIEWS TOTAIS</span></div>
    <div class="stat"><b>${ch.videoCount ?? '—'}</b><span>PUBLICADOS</span></div>
    <div class="stat"><b>${current.topVideos?.length ?? '—'}</b><span>ANALISADOS</span></div>
    <div class="stat"><b>${out.count}</b><span>OUTLIERS</span></div>
    <div class="stat"><b>${out.biggest ? `${out.biggest}x` : '—'}</b><span>MAIOR OUTLIER</span></div>
  </div>

  ${r.winningPattern ? `<div class="pattern"><p class="lbl" style="margin-top:0">PADRÃO VENCEDOR</p><p class="desc">${esc(r.winningPattern.description)}</p><div class="chips">${(r.winningPattern.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    ${(r.winningPattern.commonTraits?.length || r.winningPattern.triggers?.length || r.winningPattern.titleFormulas?.length)
      ? `<div class="dna">
          <div><h4 style="color:#22d3ee">O QUE OS VENCEDORES TÊM EM COMUM</h4>${bullets(r.winningPattern.commonTraits, '#22d3ee')}</div>
          <div><h4 style="color:#f59e0b">GATILHOS VENCEDORES</h4>${bullets(r.winningPattern.triggers, '#f59e0b')}</div>
          <div><h4 style="color:#4ade80">FÓRMULAS DE TÍTULO</h4>${bullets(r.winningPattern.titleFormulas, '#4ade80')}</div>
        </div>` : ''}
    ${r.winningPattern.winningFunction
      ? `<div class="fn"><div><h5>PROMESSA</h5><p>${esc(r.winningPattern.winningFunction.promise || '—')}</p></div><div><h5>EMOÇÃO DOMINANTE</h5><p>${esc(r.winningPattern.winningFunction.emotion || '—')}</p></div><div><h5>FANTASIA DE IDENTIDADE</h5><p>${esc(r.winningPattern.winningFunction.identity || '—')}</p></div></div>` : ''}
  </div>` : ''}
  ${r.howToApply ? `<div class="pattern"><p class="lbl" style="margin-top:0">COMO APLICAR NA PRÁTICA</p><p class="desc">${esc(r.howToApply)}</p></div>` : ''}

  ${section('MAR DE IDEIAS', '#2dd4bf', r.ideas)}
  ${section(`DOBRA DE NICHO${r.doubling.summary ? ` — ${esc(r.doubling.summary)}` : ''}`, '#f59e0b', r.doubling.items)}
  ${section('ADAPTAÇÃO DE MERCADO', '#4ade80', r.market)}

  <div class="foot">
    <span>⚠️ Scores são estimativas geradas por IA — não métricas garantidas.</span>
    <span>Noctis Studio · Dobra de Nicho · ${esc(ch.title)}</span>
  </div>
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 400))</script>
</body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  // ------------------------------------------------------------------
  // Vista de busca + histórico
  // ------------------------------------------------------------------
  if (!current) {
    return (
      <PrivacyScope page="dobra-de-nicho">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <PageHeader t={t} />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) analyze(query.trim())
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={`${inputCls} !pl-9`} placeholder={t('doubling.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="submit" className={`${btnPrimary} flex shrink-0 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`} disabled={loading || !aiLimit.ok}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <GitBranch size={15} />}
            {t('doubling.analyze')}
          </button>
        </form>
        <AiLimitBanner />

        {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

        {loading && (
          <div className="flex flex-col items-center py-16">
            <Loader2 size={28} className="animate-spin text-cyan-400" />
            <p className="mt-3 text-sm text-slate-500">{stage}</p>
          </div>
        )}

        {!loading && history.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500">{t('doubling.savedAnalyses')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 transition-colors hover:border-cyan-500/40">
                  <button onClick={() => setCurrentId(h.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {h.channel?.avatar && <RestrictedThumb src={h.channel.avatar} className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100"><Masked mask="•••••••">{h.channel?.title}</Masked></p>
                      <p className="text-[11px] text-slate-500">
                        <Masked mask="••">{formatCompact(h.channel?.subscribers)}</Masked> {t('doubling.subscribers')} · {timeAgo(h.createdAt, t)}
                      </p>
                    </div>
                  </button>
                  <button onClick={() => db.remove('nicheAnalyses', h.id)} className="text-slate-600 hover:text-red-400" title={t('doubling.deleteAnalysis')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
            <GitBranch size={30} className="mx-auto text-cyan-400" />
            <p className="mt-4 font-semibold text-slate-200">{t('doubling.emptyTitle')}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {t('doubling.emptyDesc')}
            </p>
          </div>
        )}
      </div>
      </PrivacyScope>
    )
  }

  // ------------------------------------------------------------------
  // Vista da análise
  // ------------------------------------------------------------------
  const r = normalizeResult(current.result)
  const outliers = computeOutliers(current.topVideos)
  // Análises geradas antes do novo esquema não têm os campos ricos (gatilhos,
  // preserva/muda em lista, etc.) — sinalizamos para o usuário reanalisar.
  const isOldFormat = !(r.winningPattern?.triggers?.length || r.ideas?.[0]?.preserve?.length)
  const confidence = (r.confidence || 'alta').toLowerCase()
  const confidenceCls =
    confidence === 'alta' ? 'border-green-500/40 bg-green-500/10 text-green-400' : confidence === 'média' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-red-500/40 bg-red-500/10 text-red-400'

  return (
    <PrivacyScope page="dobra-de-nicho">
    <div className="mx-auto max-w-[1600px] space-y-4">
      <PageHeader t={t} />

      {/* Cabeçalho da análise */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <RestrictedThumb
            src={current.channel?.avatar}
            className="h-14 w-14 rounded-full border border-slate-700"
            referrerPolicy="no-referrer"
            fallback={
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-xl font-bold text-slate-300">
                {current.channel?.title?.charAt(0)}
              </div>
            }
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100"><Masked mask="•••••••">{current.channel?.title}</Masked></h2>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                {(current.channel?.country || 'PT-BR').toUpperCase()}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${confidenceCls}`}>{t('doubling.confidence')} {confidence}</span>
            </div>
            <p className="mt-1 text-xs">
              <span className="font-semibold text-cyan-400">{t('doubling.mainNiche')}</span>{' '}
              <span className="text-slate-300">{r.mainNiche || '—'}</span>
            </p>
            {r.subNiche && (
              <p className="mt-0.5 text-xs">
                <span className="font-semibold text-cyan-400">{t('doubling.subNiche')}</span> <span className="text-slate-300">{r.subNiche}</span>
              </p>
            )}
            <p className="mt-0.5 max-w-[920px] text-xs text-slate-500">
              <span className="font-semibold text-slate-400">{t('doubling.audience')}</span> {r.audience || '—'}
            </p>
            {r.territory && (
              <p className="mt-0.5 max-w-[920px] text-xs text-slate-500">
                <span className="font-semibold text-slate-400">{t('doubling.territory')}</span> {r.territory}
              </p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
              🕒 {t('doubling.updated')} {timeAgo(current.createdAt, t)}
              {isOldFormat && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-400">
                  {t('doubling.oldFormat')}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <HeaderBtn onClick={() => setCurrentId(null)} icon={<ArrowLeft size={13} />} label={t('doubling.back')} />
            <HeaderBtn onClick={() => setCurrentId(null)} icon={<Plus size={13} />} label={t('doubling.analyzeOther')} />
            <HeaderBtn onClick={exportTxt} icon={<FileDown size={13} />} label={t('doubling.downloadTxt')} />
            <HeaderBtn onClick={exportPdf} icon={<Printer size={13} />} label={t('doubling.downloadPdf')} />
            <HeaderBtn onClick={() => setCurrentId(null)} icon={<History size={13} />} title={t('doubling.history')} />
            <HeaderBtn onClick={() => analyze(current.sourceChannelId, { force: true })} icon={<RefreshCw size={13} />} label={t('doubling.reanalyze')} />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-6">
          <HeaderStat value={<Masked mask="••">{formatCompact(current.channel?.subscribers)}</Masked>} label={t('doubling.statSubs')} />
          <HeaderStat value={<Masked mask="••">{formatCompact(current.channel?.views)}</Masked>} label={t('doubling.statViews')} />
          <HeaderStat value={<Masked mask="••">{current.channel?.videoCount ?? '—'}</Masked>} label={t('doubling.statPublished')} />
          <HeaderStat value={current.topVideos?.length ?? '—'} label={t('doubling.statAnalyzed')} />
          <HeaderStat value={outliers.count} label={t('doubling.statOutliers')} />
          <HeaderStat value={outliers.biggest ? `${outliers.biggest}x` : '—'} label={t('doubling.statBiggest')} />
        </div>

        {/* Padrão vencedor + DNA detalhado */}
        {r.winningPattern && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-[10px] font-bold tracking-wider text-cyan-400">{t('doubling.winningPattern')}</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-100">{r.winningPattern.description}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(r.winningPattern.tags || []).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[10px] text-slate-400">
                  {tag}
                </span>
              ))}
            </div>

            {(r.winningPattern.commonTraits?.length || r.winningPattern.triggers?.length || r.winningPattern.titleFormulas?.length || r.winningPattern.winningFunction) && (
              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 md:grid-cols-3">
                <DnaList title={t('doubling.commonTraits')} items={r.winningPattern.commonTraits} dot="#22d3ee" />
                <DnaList title={t('doubling.triggers')} items={r.winningPattern.triggers} dot="#f59e0b" />
                <DnaList title={t('doubling.titleFormulas')} items={r.winningPattern.titleFormulas} dot="#4ade80" mono />
              </div>
            )}

            {r.winningPattern.winningFunction && (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-3">
                <DnaFn label={t('doubling.promise')} value={r.winningPattern.winningFunction.promise} />
                <DnaFn label={t('doubling.emotion')} value={r.winningPattern.winningFunction.emotion} />
                <DnaFn label={t('doubling.identity')} value={r.winningPattern.winningFunction.identity} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Como aplicar na prática (retrátil) */}
      {r.howToApply && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <button onClick={() => setApplyOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-sm font-semibold text-slate-200 hover:bg-slate-900/60">
            <Lightbulb size={15} className="text-amber-400" />
            {t('doubling.howToApplyTitle')}
            <ChevronDown size={15} className={`ml-auto text-slate-500 transition-transform ${applyOpen ? 'rotate-180' : ''}`} />
          </button>
          {applyOpen && <p className="border-t border-slate-800 px-5 py-4 text-sm leading-relaxed text-slate-400">{r.howToApply}</p>}
        </div>
      )}

      {/* Grafo */}
      <OpportunityGraph analysis={current} result={r} onSelect={setDetail} t={t} />

      <p className="text-center text-[11px] text-slate-600">
        {t('doubling.scoresDisclaimer')}
      </p>

      <DetailDrawer detail={detail} onClose={() => setDetail(null)} niche={r.mainNiche} pattern={r.winningPattern?.description} t={t} />

      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-400">{stage}</p>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
    </div>
    </PrivacyScope>
  )
}

function PageHeader({ t }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
          <GitBranch size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('doubling.title')}</h1>
          <p className="text-sm text-slate-500">{t('doubling.subtitle')}</p>
        </div>
      </div>
      <PageEye />
    </div>
  )
}

function HeaderBtn({ onClick, icon, label, title }) {
  return (
    <button onClick={onClick} title={title || label} className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-slate-700">
      {icon}
      {label}
    </button>
  )
}

function HeaderStat({ value, label }) {
  return (
    <div>
      <p className="text-lg font-bold text-slate-100">{value}</p>
      <p className="text-[9px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}

function DnaList({ title, items, dot, mono }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: dot }}>{title}</p>
      <div className="space-y-1.5">
        {items.map((t, i) => (
          <div key={i} className={`relative pl-3.5 text-[12px] leading-snug text-slate-300 ${mono ? 'font-mono text-[11px]' : ''}`}>
            <span className="absolute left-0 top-[6px] h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}

function DnaFn({ label, value }) {
  if (!value) return null
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-400">{label}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-slate-200">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grafo de oportunidades (layout do print: canal ao centro, MAR DE IDEIAS em
// volta, ADAPTAÇÃO acima à direita, DOBRA à direita abrindo em nós numerados)
// ---------------------------------------------------------------------------
const TEAL = '#2dd4bf'
const GREEN = '#4ade80'
const AMBER = '#f59e0b'

function OpportunityGraph({ analysis, result: r, onSelect, t }) {
  const W = 1180
  const H = 640

  const nodes = useMemo(() => {
    const list = []
    const center = { x: 470, y: 320 }

    const ideaPos = [
      { x: 250, y: 170 },
      { x: 250, y: 470 },
      { x: 620, y: 480 },
    ]
    r.ideas.slice(0, 3).forEach((item, i) => {
      list.push({
        id: `idea-${i}`,
        kind: t('doubling.blockIdeas').toUpperCase(),
        color: TEAL,
        badge: item.isTurnaround || (i === 0 && !r.ideas.some((x) => x.isTurnaround)) ? t('doubling.badgeTurn') : null,
        pos: ideaPos[i] || ideaPos[0],
        item,
        block: t('doubling.blockIdeas'),
        linkFrom: center,
      })
    })

    if (r.market[0]) {
      list.push({
        id: 'market-0',
        kind: t('doubling.blockMarket').toUpperCase(),
        color: GREEN,
        pos: { x: 640, y: 170 },
        item: r.market[0],
        block: t('doubling.blockMarket'),
        linkFrom: center,
      })
    }

    const dobra = { x: 830, y: 320 }
    if (r.doubling.items.length > 0) {
      list.push({
        id: 'dobra',
        kind: t('doubling.blockDoubling').toUpperCase(),
        color: AMBER,
        pos: dobra,
        text: r.doubling.summary || r.doubling.items[0]?.title,
        item: r.doubling.items[0],
        block: t('doubling.blockDoubling'),
        linkFrom: center,
        big: true,
      })
      r.doubling.items.slice(0, 4).forEach((item, i) => {
        list.push({
          id: `dobra-${i}`,
          kind: `${i + 1}`,
          numbered: true,
          color: AMBER,
          pos: { x: 1060, y: 120 + i * 135 },
          item,
          block: t('doubling.blockDoubling'),
          linkFrom: dobra,
        })
      })
    }

    return { list, center }
  }, [r, t])

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/30">
      <div className="relative mx-auto" style={{ width: W, height: H }}>
        {/* Linhas */}
        <svg width={W} height={H} className="absolute inset-0">
          {nodes.list.map((n) => (
            <motion.line
              key={n.id}
              x1={n.linkFrom.x}
              y1={n.linkFrom.y}
              x2={n.pos.x}
              y2={n.pos.y}
              stroke={n.color}
              strokeWidth="1.2"
              strokeDasharray="5 6"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.45 }}
              transition={{ duration: 0.7 }}
            />
          ))}
        </svg>

        {/* Nó central */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: nodes.center.x, top: nodes.center.y }}
        >
          <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border-2 border-cyan-400 bg-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.25)]">
            <RestrictedThumb
              src={analysis.channel?.avatar}
              className="h-12 w-12 rounded-full"
              referrerPolicy="no-referrer"
              fallback={
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 font-bold text-slate-200">
                  {analysis.channel?.title?.charAt(0)}
                </div>
              }
            />
            <p className="mt-1 text-[9px] font-bold tracking-wider text-cyan-400">{t('doubling.graphCenterChannel')}</p>
            <p className="max-w-[100px] truncate px-1 text-center text-[11px] font-bold text-slate-100"><Masked mask="•••••">{analysis.channel?.title}</Masked></p>
          </div>
        </motion.div>

        {/* Nós */}
        {nodes.list.map((n, idx) => {
          // O nó central "Dobra" é um rótulo do grupo — não abre nada (os alvos
          // reais são os nós numerados 1..4 que saem dele).
          const clickable = n.id !== 'dobra'
          return (
            <motion.button
              key={n.id}
              disabled={!clickable}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08 * idx }}
              onClick={clickable ? () => onSelect({ blockLabel: n.block, color: n.color, item: n.item }) : undefined}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 ${clickable ? '' : 'cursor-default'}`}
              style={{ left: n.pos.x, top: n.pos.y }}
            >
              <div className="flex flex-col items-center">
                <div className="relative">
                  {n.badge && (
                    <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-red-500 px-2 py-0.5 text-[8px] font-bold text-white">
                      {n.badge}
                    </span>
                  )}
                  <div
                    className={`flex items-center justify-center rounded-full border-2 bg-slate-950 text-center transition-shadow ${
                      clickable ? 'hover:shadow-[0_0_25px_rgba(255,255,255,0.1)]' : ''
                    } ${n.numbered ? 'h-16 w-16' : n.big ? 'h-24 w-24' : 'h-[5.5rem] w-[5.5rem]'}`}
                    style={{ borderColor: n.color }}
                  >
                    <span className={`px-2 font-bold leading-tight ${n.numbered ? 'text-xl' : 'text-[9px] tracking-wider'}`} style={{ color: n.color }}>
                      {n.kind}
                    </span>
                  </div>
                </div>
                <p
                  className={`mt-2 text-center text-[11px] font-semibold leading-snug text-slate-200 ${
                    n.id === 'dobra' ? 'w-56' : 'line-clamp-2 w-44'
                  }`}
                >
                  {n.text || n.item?.title}
                </p>
              </div>
            </motion.button>
          )
        })}
      </div>
      <p className="border-t border-slate-800 px-4 py-2.5 text-center text-[11px] text-slate-600">
        {t('doubling.graphHint')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Painel de detalhes rico (paridade com o relatório original): tema-alvo, como
// aplicar, títulos prontos, o que preserva/muda, mapa de equivalência e alertas.
function DetailDrawer({ detail, onClose, niche, pattern, t }) {
  const [extraTitles, setExtraTitles] = useState([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [copiedIdx, setCopiedIdx] = useState(null)
  useEffect(() => {
    setExtraTitles([])
    setGenError('')
  }, [detail])
  if (!detail?.item) return null
  const { blockLabel, color, item } = detail

  async function generateTitles() {
    setGenerating(true)
    setGenError('')
    try {
      const { titles } = await api.ai.titles({ idea: item.title, niche, context: pattern })
      const known = new Set([...(item.recommendedTitles || []), ...extraTitles])
      setExtraTitles((prev) => [...prev, ...titles.filter((t) => !known.has(t))])
    } catch (err) {
      setGenError(apiErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  async function copyTitle(text, idx) {
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1200)
  }

  const allTitles = [...(item.recommendedTitles || []), ...extraTitles]
  // Compat: análises antigas só têm a frase preserveVsChange (sem arrays).
  const preserve = item.preserve || []
  const change = item.change || []
  const equivalence = item.equivalenceMap || []
  const breakAlerts = item.breakAlerts || []
  const confidence = (item.confidence || '').toLowerCase()

  const difficultyCls =
    { Fácil: 'bg-green-500/15 text-green-400', Média: 'bg-amber-500/15 text-amber-400', Difícil: 'bg-red-500/15 text-red-400' }[item.difficulty] ||
    'bg-slate-800 text-slate-400'
  const confidenceCls =
    confidence === 'alta' ? 'bg-green-500/15 text-green-400' : confidence === 'média' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'

  const Bullets = ({ items, dot }) => (
    <div className="space-y-1.5">
      {items.map((t, i) => (
        <div key={i} className="relative pl-4 text-[13px] leading-snug text-slate-300">
          <span className="absolute left-0 top-[7px] h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
          {t}
        </div>
      ))}
    </div>
  )
  const SectionTitle = ({ children, c = '#94a3b8' }) => (
    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: c }}>
      {children}
    </p>
  )

  return (
    <Drawer open onClose={onClose} title={item.title}>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}22`, color }}>
            {item.kind ? `${blockLabel} · ${item.kind}` : blockLabel}
          </span>
          {confidence && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${confidenceCls}`}>{t('doubling.confidence')} {confidence}</span>}
          <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-200">
            <Star size={11} style={{ color }} />
            {t('doubling.successScore', { n: item.successScore })}
          </span>
          {item.difficulty && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${difficultyCls}`}>{item.difficulty}</span>}
        </div>

        {item.subtitle && <p className="text-sm leading-relaxed text-slate-400">{item.subtitle}</p>}

        {item.marketHypothesis && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-300">
            {t('doubling.marketHypothesis')}
          </p>
        )}

        {/* Nicho novo (blocos de Dobra) */}
        {(item.newNiche || item.subNicheNew || item.audienceNew) && (
          <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-3.5 text-[13px]">
            {item.newNiche && <p className="text-slate-300"><span className="text-[10px] font-bold uppercase text-cyan-400">{t('doubling.newNiche')} </span>{item.newNiche}</p>}
            {item.subNicheNew && <p className="text-slate-300"><span className="text-[10px] font-bold uppercase text-cyan-400">{t('doubling.subNicheNew')} </span>{item.subNicheNew}</p>}
            {item.audienceNew && <p className="text-slate-300"><span className="text-[10px] font-bold uppercase text-cyan-400">{t('doubling.audienceNew')} </span>{item.audienceNew}</p>}
          </div>
        )}

        {/* Ideia de tema-alvo */}
        {item.targetTheme && (
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] p-3.5">
            <SectionTitle c="#22d3ee">{t('doubling.targetTheme')}</SectionTitle>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{item.targetTheme}</p>
          </div>
        )}

        {/* Como aplicar */}
        {item.howToApply && (
          <div className="flex gap-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] p-3.5">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-cyan-400" />
            <div>
              <SectionTitle c="#22d3ee">{t('doubling.howToApplyTitle')}</SectionTitle>
              <p className="mt-1 text-sm leading-relaxed text-slate-200">{item.howToApply}</p>
            </div>
          </div>
        )}

        {/* Títulos prontos */}
        <div className="space-y-2.5">
          <SectionTitle>{t('doubling.readyTitles')}</SectionTitle>
          <ul className="space-y-2">
            {allTitles.map((ttl, i) => (
              <li key={i} className="group flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm text-slate-200">
                <span className="shrink-0 text-[10px] font-bold text-slate-600">{i + 1}</span>
                <span className="min-w-0 flex-1">{ttl}</span>
                <button
                  onClick={() => copyTitle(ttl, i)}
                  title={t('doubling.copyTitle')}
                  className={`shrink-0 text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 ${
                    copiedIdx === i ? 'text-green-400 !opacity-100' : 'text-slate-500 hover:text-cyan-300'
                  }`}
                >
                  {copiedIdx === i ? t('doubling.copied') : t('doubling.copy')}
                </button>
              </li>
            ))}
          </ul>
          {genError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{genError}</p>}
          <button
            onClick={generateTitles}
            disabled={generating}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 py-2.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
            {generating ? t('doubling.generating') : t('doubling.generateMore')}
          </button>
        </div>

        {/* O que preserva / O que muda */}
        {(preserve.length > 0 || change.length > 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {preserve.length > 0 && (
              <div className="space-y-2">
                <SectionTitle c="#4ade80">{t('doubling.whatPreserve')}</SectionTitle>
                <Bullets items={preserve} dot="#4ade80" />
              </div>
            )}
            {change.length > 0 && (
              <div className="space-y-2">
                <SectionTitle c="#f59e0b">{t('doubling.whatChanges')}</SectionTitle>
                <Bullets items={change} dot="#f59e0b" />
              </div>
            )}
          </div>
        )}
        {preserve.length === 0 && change.length === 0 && item.preserveVsChange && (
          <div className="space-y-2">
            <SectionTitle>{t('doubling.preserveVsChange')}</SectionTitle>
            <p className="text-sm leading-relaxed text-slate-300">{item.preserveVsChange}</p>
          </div>
        )}

        {/* Mapa de equivalência */}
        {equivalence.length > 0 && (
          <div className="space-y-2.5">
            <SectionTitle>{t('doubling.equivalenceMap')}</SectionTitle>
            {equivalence.map((e, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="text-[12.5px] text-slate-500">{e.from}</p>
                {e.why && <p className="my-1 text-[11px] text-cyan-400">↓ {e.why}</p>}
                <p className="text-sm font-semibold text-slate-100">{e.to}</p>
              </div>
            ))}
          </div>
        )}

        {/* Alertas de quebra */}
        {breakAlerts.length > 0 && (
          <div className="space-y-2">
            <SectionTitle c="#f87171">{t('doubling.breakAlerts')}</SectionTitle>
            <Bullets items={breakAlerts} dot="#f87171" />
          </div>
        )}

        <p className="border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-600">
          {t('doubling.drawerDisclaimer')}
        </p>
      </div>
    </Drawer>
  )
}
