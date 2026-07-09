import { useState } from 'react'
import { AlertTriangle, Search, Plus, Calendar, Eye, Film, Users, RadioTower, Loader2 } from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, formatCompact } from '../components/ui'
import { Field } from './channels/ChannelsList'

// Base curada — "hall da fama" de canais que sumiram. Não existe API que
// liste isso: os casos são cadastrados manualmente e, no futuro, alimentados
// pela detecção automática dos canais monitorados. A página já abre populada.
export default function RemovedChannels() {
  const db = useDb()
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState('')
  const [checkError, setCheckError] = useState('')

  const all = [...db.all('removedChannels')].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt))

  // -------------------------------------------------------------------------
  // Detecção automática: verifica todos os canais que o sistema conhece
  // (seus canais, referências e favoritos do Niche Finder) contra a API.
  // Quem sumiu do YouTube entra automaticamente nesta base — assim ela
  // cresce sozinha a cada verificação.
  // -------------------------------------------------------------------------
  async function checkMonitored() {
    if (checking) return
    setChecking(true)
    setCheckError('')
    try {
      // Coleta tudo que o sistema monitora, com os dados em cache p/ registrar
      const monitored = new Map()
      for (const c of db.all('channels')) {
        if (c.youtubeChannelId) monitored.set(c.youtubeChannelId, { name: c.name, subs: c.ytSubscribers, videos: c.ytVideoCount })
      }
      for (const r of db.all('referenceChannels')) {
        const id = r.youtubeChannelId || r.cachedStats?.id
        if (id) monitored.set(id, { name: r.cachedStats?.title || r.youtubeUrl, subs: r.cachedStats?.subscribers, videos: r.cachedStats?.videoCount, niche: r.niche })
      }
      for (const f of db.getSetting('nicheFavorites', [])) {
        if (f.id) monitored.set(f.id, { name: f.title, subs: f.subscribers, videos: f.videoCount, niche: f.topics?.[0] })
      }

      const ids = [...monitored.keys()]
      if (!ids.length) {
        setCheckMsg('Nada para verificar ainda — adicione canais, referências ou favoritos primeiro.')
        setTimeout(() => setCheckMsg(''), 5000)
        setChecking(false)
        return
      }

      const found = new Set()
      for (let i = 0; i < ids.length; i += 50) {
        setCheckMsg(`Verificando ${Math.min(i + 50, ids.length)}/${ids.length} canais monitorados...`)
        const { found: page } = await api.youtube.checkChannels(ids.slice(i, i + 50))
        page.forEach((id) => found.add(id))
      }

      const alreadyListed = new Set(all.map((c) => c.youtubeChannelId).filter(Boolean))
      let detected = 0
      for (const id of ids) {
        if (found.has(id) || alreadyListed.has(id)) continue
        const info = monitored.get(id)
        detected++
        db.insert('removedChannels', {
          youtubeChannelId: id,
          name: info.name || 'Canal desconhecido',
          niche: info.niche || 'Other',
          subs: info.subs || 0,
          videos: info.videos || null,
          removedAt: new Date().toISOString().slice(0, 10),
          verified: true,
          autoDetected: true,
        })
      }
      setCheckMsg(
        detected > 0
          ? `⚠️ ${detected} canal${detected > 1 ? 'is' : ''} monitorado${detected > 1 ? 's' : ''} sumiu do YouTube e entrou na base automaticamente.`
          : `✓ Todos os ${ids.length} canais monitorados continuam ativos no YouTube.`,
      )
      setTimeout(() => setCheckMsg(''), 8000)
    } catch (err) {
      setCheckError(apiErrorMessage(err))
    } finally {
      setChecking(false)
    }
  }
  const channels = query.trim()
    ? all.filter((c) => `${c.name} ${c.niche}`.toLowerCase().includes(query.trim().toLowerCase()))
    : all

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Canais Removidos</h1>
            <p className="text-sm text-slate-500">Canais que foram removidos ou encerrados no YouTube</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300">
            {all.length} canais removidos
          </span>
          <button
            onClick={checkMonitored}
            disabled={checking}
            title="Confere se os canais que você acompanha (canais, referências e favoritos) ainda existem no YouTube"
            className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`}
          >
            {checking ? <Loader2 size={13} className="animate-spin" /> : <RadioTower size={13} />}
            {checking ? 'Verificando...' : 'Verificar monitorados'}
          </button>
          <button className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setAddOpen(true)}>
            <Plus size={13} />
            Registrar caso
          </button>
        </div>
      </div>

      {checkMsg && <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5 text-xs text-cyan-300">{checkMsg}</p>}
      {checkError && <p className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{checkError}</p>}

      {/* Aviso */}
      <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
        <AlertTriangle size={16} className="shrink-0 text-red-400" />
        <p className="text-sm text-slate-300">
          <b className="text-red-400">Atenção:</b> estes canais foram identificados como removidos, encerrados ou indisponíveis no YouTube.
        </p>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className={`${inputCls} !pl-9`} placeholder="Buscar canais removidos..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {channels.map((c) => (
          <RemovedCard key={c.id} channel={c} />
        ))}
      </div>

      {channels.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Nenhum canal encontrado com esse termo.</p>}

      <AddRemovedModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function RemovedCard({ channel: c }) {
  return (
    <div className="card-hover overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="border-t-2 border-cyan-500/50" />
      {/* modo privado: o card inteiro fica embaçado */}
      <div className="sensitive p-3.5">
        {/* Cabeçalho */}
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-slate-400">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-100">{c.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
              <Calendar size={9} />
              {new Date(c.removedAt + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              {c.verified && <span className="ml-1 text-green-500">$ $</span>}
            </p>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-red-400">REMOVIDO</span>
            {c.autoDetected && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold text-amber-400">AUTO</span>}
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
          <RemovedStat icon={Eye} value="0" label="visualizações" />
          <RemovedStat icon={Film} value={c.videos ?? '—'} label="vídeos" />
          <RemovedStat icon={Users} value={formatCompact(c.subs)} label="inscritos" />
        </div>

        {/* Nicho */}
        <div className="mt-2 border-t border-slate-800 pt-2.5">
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">{c.niche || 'Other'}</span>
        </div>
      </div>
    </div>
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
    <Modal open={open} onClose={onClose} title="Registrar canal removido">
      <form onSubmit={save} className="space-y-4">
        <Field label="NOME DO CANAL">
          <input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="NICHO">
            <input className={inputCls} value={form.niche} onChange={(e) => set('niche', e.target.value)} placeholder="Ex: True Crime" />
          </Field>
          <Field label="INSCRITOS (APROX.)">
            <input className={inputCls} type="number" value={form.subs} onChange={(e) => set('subs', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="QTD. DE VÍDEOS">
            <input className={inputCls} type="number" value={form.videos} onChange={(e) => set('videos', e.target.value)} />
          </Field>
          <Field label="DATA DA REMOÇÃO">
            <input className={inputCls} type="date" value={form.removedAt} onChange={(e) => set('removedAt', e.target.value)} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} className="h-4 w-4 rounded accent-cyan-500" />
          Canal era monetizado ($)
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Registrar
          </button>
        </div>
      </form>
    </Modal>
  )
}
