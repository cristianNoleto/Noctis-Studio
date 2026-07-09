import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Tv, Search, Loader2, Users, Eye, Film } from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, EmptyState, formatCompact } from '../../components/ui'
import { ChannelAvatar } from '../Dashboard'

const LANGUAGES = [
  ['pt', 'Português'],
  ['en', 'Inglês'],
  ['es', 'Espanhol'],
  ['de', 'Alemão'],
  ['fr', 'Francês'],
  ['it', 'Italiano'],
  ['ja', 'Japonês'],
]

export default function ChannelsList() {
  const db = useDb()
  const [params, setParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const all = db.all('channels')
  const archivedCount = all.filter((c) => c.archived).length
  const channels = all.filter((c) => (showArchived ? c.archived : !c.archived))
  const videos = db.all('videos')

  // Atalho "+ Novo Canal" da sidebar abre o modal direto
  useEffect(() => {
    if (params.get('novo') === '1') {
      setCreateOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Gestão de Canais</h1>
          <p className="mt-1 text-sm text-slate-500">Opere todos os seus canais dark em um só lugar.</p>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                showArchived ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
              }`}
            >
              {showArchived ? '← Voltar aos ativos' : `Arquivados (${archivedCount})`}
            </button>
          )}
          <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Criar Canal
          </button>
        </div>
      </div>

      {showArchived && channels.length > 0 && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300/80">
          Canais arquivados — clique num canal e use o menu ⋮ para desarquivar (Editar Canal mantém tudo intacto).
        </p>
      )}

      {channels.length === 0 ? (
        <EmptyState
          icon={Tv}
          title="Nenhum canal cadastrado"
          description="Crie seu primeiro canal manualmente ou importe direto do YouTube pela URL/handle."
          action={
            <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
              Criar meu primeiro canal
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {channels.map((ch) => {
            const chVideos = videos.filter((v) => v.channelId === ch.id)
            const posted = chVideos.filter((v) => v.status === 'published').length
            const pending = chVideos.length - posted
            return (
              <Link
                key={ch.id}
                to={`/canais/${ch.id}`}
                className="group rounded-xl border border-slate-800 bg-slate-900/40 p-5 transition-colors hover:border-cyan-500/50"
              >
                <div className="flex items-center gap-3">
                  <ChannelAvatar channel={ch} size="h-12 w-12" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-100 group-hover:text-cyan-300">{ch.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">YouTube</span>
                      <span className="text-xs text-slate-500">{LANGUAGES.find(([c]) => c === ch.language)?.[1] || ch.language}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 divide-x divide-slate-800 rounded-lg border border-slate-800 py-2.5 text-center">
                  <MiniStat icon={Users} value={formatCompact(ch.ytSubscribers)} label="INSCRITOS" />
                  <MiniStat icon={Film} value={chVideos.length} label="VÍDEOS" />
                  <MiniStat icon={Eye} value={`${posted}/${posted + pending}`} label="POSTADOS" />
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <CreateChannelModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function MiniStat({ icon: Icon, value, label }) {
  return (
    <div>
      <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-200">
        <Icon size={12} className="text-slate-500" />
        {value}
      </p>
      <p className="text-[10px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}

export function CreateChannelModal({ open, onClose }) {
  const db = useDb()
  const [importQuery, setImportQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [imported, setImported] = useState(null)

  const [form, setForm] = useState({
    name: '',
    language: 'pt',
    contactEmail: '',
    defaultPostTime: '18:00',
    weeklyFrequency: 3,
    notes: '',
  })

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleImport() {
    if (!importQuery.trim()) return
    setImporting(true)
    setImportError('')
    try {
      const data = await api.youtube.lookupChannel(importQuery.trim())
      setImported(data)
      set('name', data.title)
    } catch (err) {
      setImportError(apiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  function handleCreate(e) {
    e.preventDefault()
    db.insert('channels', {
      name: form.name,
      language: form.language,
      contactEmail: form.contactEmail,
      defaultPostTime: form.defaultPostTime,
      weeklyFrequency: Number(form.weeklyFrequency) || null,
      notes: form.notes,
      avatarUrl: imported?.avatar || null,
      youtubeChannelId: imported?.id || null,
      ytSubscribers: imported?.subscribers ?? null,
      ytTotalViews: imported?.views ?? null,
      ytStatsUpdatedAt: imported ? Date.now() : null,
    })
    setForm({ name: '', language: 'pt', contactEmail: '', defaultPostTime: '18:00', weeklyFrequency: 3, notes: '' })
    setImported(null)
    setImportQuery('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Criar Novo Canal" wide>
      {/* Importação rápida */}
      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
        <p className="text-xs font-semibold tracking-wide text-cyan-300">IMPORTAR DE CANAL DO YOUTUBE</p>
        <div className="mt-2 flex gap-2">
          <input
            className={inputCls}
            placeholder="URL ou @handle do canal (ex: youtube.com/@canal)"
            value={importQuery}
            onChange={(e) => setImportQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleImport())}
          />
          <button type="button" className={`${btnPrimary} flex shrink-0 items-center gap-2`} onClick={handleImport} disabled={importing}>
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Buscar
          </button>
        </div>
        {importError && <p className="mt-2 text-xs text-red-400">{importError}</p>}
        {imported && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
            {imported.avatar && <img src={imported.avatar} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />}
            <div>
              <p className="text-sm font-semibold text-slate-100">{imported.title}</p>
              <p className="text-xs text-slate-500">
                {formatCompact(imported.subscribers)} inscritos · {formatCompact(imported.views)} views
              </p>
            </div>
            <span className="ml-auto rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-400">IMPORTADO</span>
          </div>
        )}
      </div>

      <form onSubmit={handleCreate} className="mt-5 space-y-4">
        <Field label="NOME DO CANAL">
          <input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="IDIOMA">
            <select className={inputCls} value={form.language} onChange={(e) => set('language', e.target.value)}>
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="E-MAIL DE CONTATO">
            <input className={inputCls} type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="HORÁRIO PADRÃO DE POSTAGEM">
            <input className={inputCls} type="time" value={form.defaultPostTime} onChange={(e) => set('defaultPostTime', e.target.value)} />
          </Field>
          <Field label="POSTS POR SEMANA">
            <input className={inputCls} type="number" min="1" max="30" value={form.weeklyFrequency} onChange={(e) => set('weeklyFrequency', e.target.value)} />
          </Field>
        </div>
        <Field label="ANOTAÇÕES">
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Criar Canal
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  )
}
