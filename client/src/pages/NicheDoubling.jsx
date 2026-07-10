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

function timeAgo(ts) {
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days < 1) return 'hoje'
  if (days < 7) return `há ${days}d`
  return `há ${Math.floor(days / 7)} sem`
}

export default function NicheDoubling() {
  const db = useDb()
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function analyze(input, { force = false } = {}) {
    setLoading(true)
    setError('')
    try {
      setStage('Buscando canal semente...')
      const channel = await api.youtube.lookupChannel(input)

      const cached = db.all('nicheAnalyses').find((h) => h.sourceChannelId === channel.id)
      if (cached && !force) {
        setCurrentId(cached.id)
        setLoading(false)
        return
      }

      setStage('Coletando vídeos de maior desempenho...')
      const { results: topVideos } = await api.youtube.topVideos(channel.id)

      setStage('Gerando análise com IA (Gemini)...')
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

    const itemCard = (i, idx, color) => `
      <div class="item" style="border-left-color:${color}">
        <div class="item-head">
          <span class="num" style="background:${color}1f;color:${color}">${idx}</span>
          <h3>${esc(i.title)}</h3>
          <span class="score">Sucesso ~${esc(i.successScore)}%</span>
          <span class="diff">${esc(i.difficulty)}</span>
        </div>
        <p class="lbl">Como aplicar</p><p>${esc(i.howToApply)}</p>
        <p class="lbl">O que preservar / o que muda</p><p>${esc(i.preserveVsChange)}</p>
        ${(i.recommendedTitles || []).length ? `<p class="lbl">Títulos recomendados</p><ul>${i.recommendedTitles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
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
  .score, .diff { font-size: 10px; font-weight: 700; border-radius: 99px; padding: 2px 8px; background: #1e293b; color: #cbd5e1; }
  .item p { font-size: 11.5px; color: #a9b4c4; line-height: 1.55; margin-top: 3px; }
  .item ul { margin: 4px 0 0 16px; } .item li { font-size: 11.5px; color: #cbd5e1; margin-top: 2px; }
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
      <p><b>Público:</b> ${esc(r.audience || '—')}</p>
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

  ${r.winningPattern ? `<div class="pattern"><p class="lbl" style="margin-top:0">PADRÃO VENCEDOR</p><p class="desc">${esc(r.winningPattern.description)}</p><div class="chips">${(r.winningPattern.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>` : ''}
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
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) analyze(query.trim())
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={`${inputCls} !pl-9`} placeholder="URL ou @handle do canal semente" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="submit" className={`${btnPrimary} flex shrink-0 items-center gap-2`} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <GitBranch size={15} />}
            Analisar
          </button>
        </form>

        {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

        {loading && (
          <div className="flex flex-col items-center py-16">
            <Loader2 size={28} className="animate-spin text-cyan-400" />
            <p className="mt-3 text-sm text-slate-500">{stage}</p>
          </div>
        )}

        {!loading && history.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500">ANÁLISES SALVAS</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 transition-colors hover:border-cyan-500/40">
                  <button onClick={() => setCurrentId(h.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {h.channel?.avatar && <RestrictedThumb src={h.channel.avatar} className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100"><Masked mask="•••••••">{h.channel?.title}</Masked></p>
                      <p className="text-[11px] text-slate-500">
                        <Masked mask="••">{formatCompact(h.channel?.subscribers)}</Masked> inscritos · {timeAgo(h.createdAt)}
                      </p>
                    </div>
                  </button>
                  <button onClick={() => db.remove('nicheAnalyses', h.id)} className="text-slate-600 hover:text-red-400" title="Excluir análise">
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
            <p className="mt-4 font-semibold text-slate-200">Cole a URL de um canal que está bombando</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              A IA disseca o padrão vencedor do canal e monta o grafo de oportunidades. Requer chaves do YouTube + Gemini em Perfil → APIs.
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
  const confidence = (r.confidence || 'alta').toLowerCase()
  const confidenceCls =
    confidence === 'alta' ? 'border-green-500/40 bg-green-500/10 text-green-400' : confidence === 'média' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-red-500/40 bg-red-500/10 text-red-400'

  return (
    <PrivacyScope page="dobra-de-nicho">
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader />

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
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${confidenceCls}`}>Confiança {confidence}</span>
            </div>
            <p className="mt-1 text-xs">
              <span className="font-semibold text-cyan-400">Nicho principal:</span>{' '}
              <span className="text-slate-300">{r.mainNiche || '—'}</span>
            </p>
            <p className="mt-0.5 max-w-3xl text-xs text-slate-500">
              <span className="font-semibold text-slate-400">Público:</span> {r.audience || '—'}
            </p>
            <p className="mt-1 text-[10px] text-slate-600">🕒 Atualizado {timeAgo(current.createdAt)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <HeaderBtn onClick={() => setCurrentId(null)} icon={<ArrowLeft size={13} />} label="Voltar" />
            <HeaderBtn onClick={() => setCurrentId(null)} icon={<Plus size={13} />} label="Analisar outro canal" />
            <HeaderBtn onClick={exportTxt} icon={<FileDown size={13} />} label="Baixar TXT" />
            <HeaderBtn onClick={() => window.print()} icon={<Printer size={13} />} label="Baixar PDF" />
            <HeaderBtn onClick={() => setCurrentId(null)} icon={<History size={13} />} title="Histórico" />
            <HeaderBtn onClick={() => analyze(current.sourceChannelId, { force: true })} icon={<RefreshCw size={13} />} label="Reanalisar" />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-6">
          <HeaderStat value={<Masked mask="••">{formatCompact(current.channel?.subscribers)}</Masked>} label="INSCRITOS" />
          <HeaderStat value={<Masked mask="••">{formatCompact(current.channel?.views)}</Masked>} label="VIEWS TOTAIS" />
          <HeaderStat value={<Masked mask="••">{current.channel?.videoCount ?? '—'}</Masked>} label="PUBLICADOS" />
          <HeaderStat value={current.topVideos?.length ?? '—'} label="ANALISADOS" />
          <HeaderStat value={outliers.count} label="OUTLIERS" />
          <HeaderStat value={outliers.biggest ? `${outliers.biggest}x` : '—'} label="MAIOR OUTLIER" />
        </div>

        {/* Padrão vencedor */}
        {r.winningPattern && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-[10px] font-bold tracking-wider text-cyan-400">PADRÃO VENCEDOR</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-100">{r.winningPattern.description}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(r.winningPattern.tags || []).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[10px] text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Como aplicar na prática (retrátil) */}
      {r.howToApply && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <button onClick={() => setApplyOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-sm font-semibold text-slate-200 hover:bg-slate-900/60">
            <Lightbulb size={15} className="text-amber-400" />
            Como aplicar na prática
            <ChevronDown size={15} className={`ml-auto text-slate-500 transition-transform ${applyOpen ? 'rotate-180' : ''}`} />
          </button>
          {applyOpen && <p className="border-t border-slate-800 px-5 py-4 text-sm leading-relaxed text-slate-400">{r.howToApply}</p>}
        </div>
      )}

      {/* Grafo */}
      <OpportunityGraph analysis={current} result={r} onSelect={setDetail} />

      <p className="text-center text-[11px] text-slate-600">
        ⚠️ Scores de sucesso e dificuldade são <b>estimativas geradas por IA</b> a partir de padrões — não métricas garantidas.
      </p>

      <DetailDrawer detail={detail} onClose={() => setDetail(null)} />

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

function PageHeader() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
          <GitBranch size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dobra de Nicho</h1>
          <p className="text-sm text-slate-500">O grafo de oportunidades do canal: subnichos, novas visões, dobras e adaptações a partir do que realmente performou.</p>
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

// ---------------------------------------------------------------------------
// Grafo de oportunidades (layout do print: canal ao centro, MAR DE IDEIAS em
// volta, ADAPTAÇÃO acima à direita, DOBRA à direita abrindo em nós numerados)
// ---------------------------------------------------------------------------
const TEAL = '#2dd4bf'
const GREEN = '#4ade80'
const AMBER = '#f59e0b'

function OpportunityGraph({ analysis, result: r, onSelect }) {
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
        kind: 'MAR DE IDEIAS',
        color: TEAL,
        badge: item.isTurnaround || (i === 0 && !r.ideas.some((x) => x.isTurnaround)) ? 'VIRADA' : null,
        pos: ideaPos[i] || ideaPos[0],
        item,
        block: 'Mar de Ideias',
        linkFrom: center,
      })
    })

    if (r.market[0]) {
      list.push({
        id: 'market-0',
        kind: 'ADAPTAÇÃO DE MERCADO',
        color: GREEN,
        pos: { x: 640, y: 170 },
        item: r.market[0],
        block: 'Adaptação de Mercado',
        linkFrom: center,
      })
    }

    const dobra = { x: 830, y: 320 }
    if (r.doubling.items.length > 0) {
      list.push({
        id: 'dobra',
        kind: 'DOBRA',
        color: AMBER,
        pos: dobra,
        text: r.doubling.summary || r.doubling.items[0]?.title,
        item: r.doubling.items[0],
        block: 'Dobra de Nicho',
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
          block: 'Dobra de Nicho',
          linkFrom: dobra,
        })
      })
    }

    return { list, center }
  }, [r])

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
            <p className="mt-1 text-[9px] font-bold tracking-wider text-cyan-400">CANAL</p>
            <p className="max-w-[100px] truncate px-1 text-center text-[11px] font-bold text-slate-100"><Masked mask="•••••">{analysis.channel?.title}</Masked></p>
          </div>
        </motion.div>

        {/* Nós */}
        {nodes.list.map((n, idx) => (
          <motion.button
            key={n.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08 * idx }}
            onClick={() => onSelect({ blockLabel: n.block, color: n.color, item: n.item })}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
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
                  className={`flex items-center justify-center rounded-full border-2 bg-slate-950 text-center transition-shadow hover:shadow-[0_0_25px_rgba(255,255,255,0.1)] ${
                    n.numbered ? 'h-16 w-16' : n.big ? 'h-24 w-24' : 'h-[5.5rem] w-[5.5rem]'
                  }`}
                  style={{ borderColor: n.color }}
                >
                  <span className={`px-2 font-bold leading-tight ${n.numbered ? 'text-xl' : 'text-[9px] tracking-wider'}`} style={{ color: n.color }}>
                    {n.kind}
                  </span>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 w-44 text-center text-[11px] font-semibold leading-snug text-slate-200">
                {n.text || n.item?.title}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
      <p className="border-t border-slate-800 px-4 py-2.5 text-center text-[11px] text-slate-600">
        Clique em qualquer nó para ver o plano completo (como aplicar, o que preservar, títulos recomendados)
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
function DetailDrawer({ detail, onClose }) {
  const [tab, setTab] = useState('apply')
  useEffect(() => setTab('apply'), [detail])
  if (!detail?.item) return null
  const { blockLabel, color, item } = detail

  const difficultyCls =
    { Fácil: 'bg-green-500/15 text-green-400', Média: 'bg-amber-500/15 text-amber-400', Difícil: 'bg-red-500/15 text-red-400' }[item.difficulty] ||
    'bg-slate-800 text-slate-400'

  return (
    <Drawer open onClose={onClose} title={item.title}>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}22`, color }}>
            {blockLabel}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-200">
            <Star size={11} style={{ color }} />
            Sucesso estimado: {item.successScore}%
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${difficultyCls}`}>Palavra-chave: {item.difficulty}</span>
        </div>

        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/80">
          Estimativas geradas por IA a partir de padrões do canal semente — valide antes de investir na produção.
        </p>

        <div className="flex gap-1 border-b border-slate-800">
          {[
            ['apply', 'Como aplicar na prática'],
            ['preserve', 'O que preservar / O que muda'],
            ['titles', 'Títulos Recomendados'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                tab === key ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'apply' && <p className="text-sm leading-relaxed text-slate-300">{item.howToApply}</p>}
        {tab === 'preserve' && <p className="text-sm leading-relaxed text-slate-300">{item.preserveVsChange}</p>}
        {tab === 'titles' && (
          <ul className="space-y-2">
            {(item.recommendedTitles || []).map((t, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm text-slate-200">
                <span className="text-[10px] font-bold text-slate-600">{i + 1}</span>
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  )
}
