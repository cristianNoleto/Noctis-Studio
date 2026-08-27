import { useEffect, useState } from 'react'
import { AlertTriangle, Search, Plus, Calendar, Eye, Film, Users, RadioTower, Loader2 } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { api, apiErrorMessage } from '../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, formatCompact } from '../components/ui'
import { PrivacyScope, PageEye, Masked, useRestricted } from '../components/privacy'
import { Field } from './channels/ChannelsList'

// Base curada — "hall da fama" de canais que sumiram. Não existe API que
// liste isso: os casos são cadastrados manualmente e, no futuro, alimentados
// pela detecção automática dos canais monitorados. A página já abre populada.
export default function RemovedChannels() {
  const db = useDb()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState('')
  const [checkError, setCheckError] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  const all = [...db.all('removedChannels')].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt))

  // Base global: canais do Niche Finder que o cron diário marcou como removidos.
  // Trazem nome + foto de perfil preservados de quando estavam no ar.
  const [baseRemoved, setBaseRemoved] = useState([])
  useEffect(() => {
    let alive = true
    api.channels
      .removed()
      .then(({ channels }) => alive && setBaseRemoved(channels || []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  // Junta locais + base (dedup por canal do YouTube; local tem prioridade).
  const merged = (() => {
    const seen = new Set(all.map((c) => c.youtubeChannelId).filter(Boolean))
    const extra = baseRemoved
      .filter((c) => c.youtubeChannelId && !seen.has(c.youtubeChannelId))
      .map((c) => ({ ...c, id: `base_${c.youtubeChannelId}`, autoDetected: true, fromBase: true }))
    return [...all, ...extra].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt))
  })()

  // -------------------------------------------------------------------------
  // Detecção automática: verifica todos os canais que o sistema conhece
  // (seus canais, referências e favoritos do Niche Finder) contra a API.
  // - Quem SUMIU do YouTube entra automaticamente nesta base.
  // - Quem EXPLODIU (crescimento anormal de inscritos/views desde o último
  //   registro) vira alerta no sino do header, e a baseline é atualizada.
  // -------------------------------------------------------------------------
  async function checkMonitored() {
    if (checking) return
    setChecking(true)
    setCheckError('')
    try {
      // Coleta tudo que o sistema monitora, com os dados em cache p/ comparar
      const monitored = new Map()
      for (const c of db.all('channels')) {
        if (c.youtubeChannelId) {
          monitored.set(c.youtubeChannelId, { name: c.name, subs: c.ytSubscribers, views: c.ytTotalViews, videos: c.ytVideoCount, src: 'channel', recId: c.id })
        }
      }
      for (const r of db.all('referenceChannels')) {
        const id = r.youtubeChannelId || r.cachedStats?.id
        if (id && !monitored.has(id)) {
          monitored.set(id, { name: r.cachedStats?.title || r.youtubeUrl, subs: r.cachedStats?.subscribers, views: r.cachedStats?.views, videos: r.cachedStats?.videoCount, niche: r.niche, src: 'ref', recId: r.id })
        }
      }
      for (const f of db.getSetting('nicheFavorites', [])) {
        if (f.id && !monitored.has(f.id)) {
          monitored.set(f.id, { name: f.title, subs: f.subscribers, views: f.views, videos: f.videoCount, niche: f.topics?.[0], src: 'fav' })
        }
      }
      // Base acumulada do Niche Finder: todo canal já pesquisado também é monitorado.
      for (const c of db.getSetting('nicheFinderCache')?.results || []) {
        if (c.id && !monitored.has(c.id)) {
          monitored.set(c.id, { name: c.title, subs: c.subscribers, views: c.views, videos: c.videoCount, niche: c.topics?.[0], src: 'niche' })
        }
      }

      const ids = [...monitored.keys()]
      if (!ids.length) {
        setCheckMsg(t('removed.nothingToCheck'))
        setTimeout(() => setCheckMsg(''), 5000)
        setChecking(false)
        return
      }

      const found = new Map() // id → { subscribers, views }
      for (let i = 0; i < ids.length; i += 50) {
        setCheckMsg(t('removed.checkProgress', { done: Math.min(i + 50, ids.length), total: ids.length }))
        const { found: page } = await api.youtube.checkChannels(ids.slice(i, i + 50))
        page.forEach((c) => found.set(c.id, c))
      }

      // ------- Removidos -------
      const alreadyListed = new Set(all.map((c) => c.youtubeChannelId).filter(Boolean))
      let detected = 0
      for (const id of ids) {
        if (found.has(id) || alreadyListed.has(id)) continue
        const info = monitored.get(id)
        detected++
        db.insert('removedChannels', {
          youtubeChannelId: id,
          name: info.name || t('removed.unknownChannel'),
          niche: info.niche || 'Other',
          subs: info.subs || 0,
          videos: info.videos || null,
          removedAt: new Date().toISOString().slice(0, 10),
          verified: true,
          autoDetected: true,
        })
      }

      // ------- Explosões: +30% de inscritos OU +50% de views desde a baseline -------
      const recentAlerts = new Set(
        db.all('platformUpdates').filter((u) => u.tag === 'ALERTA' && Date.now() - u.createdAt < 7 * 86_400_000).map((u) => u.channelId),
      )
      let exploded = 0
      const favorites = db.getSetting('nicheFavorites', [])
      let favoritesChanged = false
      for (const [id, now] of found) {
        const info = monitored.get(id)
        const oldSubs = Number(info.subs) || 0
        const oldViews = Number(info.views) || 0
        const subsGrowth = oldSubs >= 100 ? (now.subscribers - oldSubs) / oldSubs : 0
        const viewsGrowth = oldViews >= 10_000 ? (now.views - oldViews) / oldViews : 0
        if ((subsGrowth >= 0.3 || viewsGrowth >= 0.5) && !recentAlerts.has(id)) {
          exploded++
          const pct = Math.round(Math.max(subsGrowth, viewsGrowth) * 100)
          db.insert('platformUpdates', {
            tag: 'ALERTA',
            channelId: id,
            title: t('removed.alertTitle', { name: info.name }),
            description: t('removed.alertDesc', {
              pct,
              oldSubs: formatCompact(oldSubs),
              newSubs: formatCompact(now.subscribers),
              oldViews: formatCompact(oldViews),
              newViews: formatCompact(now.views),
            }),
          })
        }
        // Atualiza a baseline p/ a próxima verificação comparar certo
        if (info.src === 'channel') {
          db.update('channels', info.recId, { ytSubscribers: now.subscribers, ytTotalViews: now.views, ytStatsUpdatedAt: Date.now() })
        } else if (info.src === 'ref') {
          const ref = db.get('referenceChannels', info.recId)
          if (ref) db.update('referenceChannels', info.recId, { cachedStats: { ...(ref.cachedStats || {}), subscribers: now.subscribers, views: now.views } })
        } else if (info.src === 'fav') {
          const idx = favorites.findIndex((f) => f.id === id)
          if (idx >= 0) {
            favorites[idx] = { ...favorites[idx], subscribers: now.subscribers, views: now.views }
            favoritesChanged = true
          }
        }
      }
      if (favoritesChanged) db.setSetting('nicheFavorites', [...favorites])

      const parts = []
      if (detected > 0) parts.push(t('removed.detectedMsg', { n: detected }))
      if (exploded > 0) parts.push(t('removed.explodedMsg', { n: exploded }))
      setCheckMsg(parts.length ? parts.join(' · ') : t('removed.allActive', { n: ids.length }))
      setTimeout(() => setCheckMsg(''), 8000)
    } catch (err) {
      setCheckError(apiErrorMessage(err))
    } finally {
      setChecking(false)
    }
  }
  const channels = query.trim()
    ? merged.filter((c) => `${c.name} ${c.niche}`.toLowerCase().includes(query.trim().toLowerCase()))
    : merged

  // Paginação como no original: 50/100 por página
  const totalPages = Math.max(1, Math.ceil(channels.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * perPage
  const visible = channels.slice(pageStart, pageStart + perPage)

  function goTo(p) {
    setPage(Math.min(Math.max(1, p), totalPages))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <PrivacyScope page="canais-removidos">
    <div className="mx-auto max-w-[1600px] space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{t('removed.title')}</h1>
            <p className="text-sm text-slate-500">{t('removed.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300">
            {t('removed.count', { n: merged.length })}
          </span>
          <button
            onClick={checkMonitored}
            disabled={checking}
            title={t('removed.checkTitle')}
            className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`}
          >
            {checking ? <Loader2 size={13} className="animate-spin" /> : <RadioTower size={13} />}
            {checking ? t('removed.checking') : t('removed.checkBtn')}
          </button>
          <button className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setAddOpen(true)}>
            <Plus size={13} />
            {t('removed.registerCase')}
          </button>
          <PageEye />
        </div>
      </div>

      {checkMsg && <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5 text-xs text-cyan-300">{checkMsg}</p>}
      {checkError && <p className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{checkError}</p>}

      {/* Aviso */}
      <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
        <AlertTriangle size={16} className="shrink-0 text-red-400" />
        <p className="text-sm text-slate-300">
          <b className="text-red-400">{t('removed.warningLabel')}</b> {t('removed.warningText')}
        </p>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className={`${inputCls} !pl-9`}
          placeholder={t('removed.search')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {visible.map((c) => (
          <RemovedCard key={c.id} channel={c} />
        ))}
      </div>

      {channels.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{t('removed.noneFound')}</p>}

      {/* Paginação (padrão do original: Mostrando X a Y de Z / 50-100 por página) */}
      {channels.length > 0 && (
        <div className="flex flex-col items-center gap-4 border-t border-slate-800 pt-6">
          <p className="text-sm text-slate-500">
            {t('removed.showing', { from: pageStart + 1, to: Math.min(pageStart + perPage, channels.length), total: channels.length })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">{t('removed.perPage')}</span>
              <select
                className={`${inputCls} !h-9 !w-20 !py-1`}
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value))
                  setPage(1)
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <PageBtn onClick={() => goTo(1)} disabled={safePage === 1} label={t('removed.first')} />
              <PageBtn onClick={() => goTo(safePage - 1)} disabled={safePage === 1} label={t('removed.prev')} />
              <span className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white">
                {safePage} / {totalPages}
              </span>
              <PageBtn onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages} label={t('removed.next')} />
              <PageBtn onClick={() => goTo(totalPages)} disabled={safePage === totalPages} label={t('removed.last')} />
            </div>
          </div>
        </div>
      )}

      <AddRemovedModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
    </PrivacyScope>
  )
}

function PageBtn({ onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )
}

function RemovedCard({ channel: c }) {
  // Modo restrito: nome/números não entram no DOM
  const restricted = useRestricted()
  const { t } = useI18n()
  return (
    <div className="card-hover overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="border-t-2 border-cyan-500/50" />
      <div className="p-3.5">
        {/* Cabeçalho */}
        <div className="flex items-start gap-2.5">
          <RemovedAvatar avatar={c.avatar} name={c.name} restricted={restricted} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-100"><Masked mask="•••••••">{c.name}</Masked></p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
              <Calendar size={9} />
              {new Date(c.removedAt + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              {c.verified && (
                <span className="ml-1 rounded bg-green-500/10 px-1 font-bold text-green-500" title={t('removed.monetizedTitle')}>
                  $
                </span>
              )}
            </p>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-red-400">{t('removed.removedBadge')}</span>
            {c.autoDetected && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold text-amber-400">{t('removed.auto')}</span>}
          </span>
        </div>

        {/* Thumbnail apagada (canal não existe mais) */}
        <div className="relative mt-3 flex aspect-video items-center justify-center rounded-lg border border-slate-800 bg-slate-950">
          <div className="flex gap-1">
            <span className="h-1 w-6 rounded-full bg-slate-700" />
            <span className="h-1 w-1 rounded-full bg-slate-800" />
            <span className="h-1 w-1 rounded-full bg-slate-800" />
          </div>
          <span className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] text-slate-600">
            <Eye size={10} />0
          </span>
        </div>

        {/* Stats */}
        <div className="mt-3 grid grid-cols-3 divide-x divide-slate-800 py-1 text-center">
          <RemovedStat icon={Eye} value={<Masked mask="••">0</Masked>} label={t('removed.statViews')} />
          <RemovedStat icon={Film} value={<Masked mask="••">{c.videos ?? '—'}</Masked>} label={t('removed.statVideos')} />
          <RemovedStat icon={Users} value={<Masked mask="••">{formatCompact(c.subs)}</Masked>} label={t('removed.statSubs')} />
        </div>

        {/* Nicho */}
        <div className="mt-2 border-t border-slate-800 pt-2.5">
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">{c.niche || 'Other'}</span>
        </div>
      </div>
    </div>
  )
}

// Avatar do canal removido: mostra a foto preservada; se a foto quebrou (a URL
// do YouTube morre quando o canal sai do ar) ou não há foto, cai na inicial.
function RemovedAvatar({ avatar, name, restricted }) {
  const [broken, setBroken] = useState(false)
  const letter = (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-slate-400">
      {restricted ? '?' : (name || '?').charAt(0).toUpperCase()}
    </div>
  )
  if (restricted || !avatar || broken) return letter
  return (
    <img
      src={avatar}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-9 w-9 shrink-0 rounded-full object-cover"
    />
  )
}

function RemovedStat({ icon: Icon, value, label }) {
  return (
    <div>
      <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-200">
        <Icon size={11} className="text-slate-600" />
        {value}
      </p>
      <p className="text-[9px] text-slate-600">{label}</p>
    </div>
  )
}

function AddRemovedModal({ open, onClose }) {
  const db = useDb()
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', niche: '', subs: '', videos: '', removedAt: '', verified: false })

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save(e) {
    e.preventDefault()
    db.insert('removedChannels', {
      name: form.name,
      niche: form.niche,
      subs: Number(form.subs) || 0,
      videos: Number(form.videos) || null,
      removedAt: form.removedAt || new Date().toISOString().slice(0, 10),
      verified: form.verified,
    })
    setForm({ name: '', niche: '', subs: '', videos: '', removedAt: '', verified: false })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('removed.modalTitle')}>
      <form onSubmit={save} className="space-y-4">
        <Field label={t('removed.name')}>
          <input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('removed.niche')}>
            <input className={inputCls} value={form.niche} onChange={(e) => set('niche', e.target.value)} placeholder={t('removed.nichePlaceholder')} />
          </Field>
          <Field label={t('removed.subsApprox')}>
            <input className={inputCls} type="number" value={form.subs} onChange={(e) => set('subs', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('removed.videosQty')}>
            <input className={inputCls} type="number" value={form.videos} onChange={(e) => set('videos', e.target.value)} />
          </Field>
          <Field label={t('removed.removedDate')}>
            <input className={inputCls} type="date" value={form.removedAt} onChange={(e) => set('removedAt', e.target.value)} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} className="h-4 w-4 rounded accent-cyan-500" />
          {t('removed.wasMonetized')}
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary}>
            {t('removed.register')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
