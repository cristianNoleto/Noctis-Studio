import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Tv, Search, Loader2, Users, Eye, Film } from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { importChannelVideos } from '../../lib/importVideos'
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
  const [search, setSearch] = useState('')
  const all = db.all('channels')
  const archivedCount = all.filter((c) => c.archived).length
  const term = search.trim().toLowerCase()
  const channels = all
    .filter((c) => (showArchived ? c.archived : !c.archived))
    .filter((c) => !term || (c.name || '').toLowerCase().includes(term))
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

      {/* Busca por nome — útil quando há muitos canais */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className={`${inputCls} !pl-9`}
          placeholder="Buscar canal pelo nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showArchived && channels.length > 0 && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300/80">
          Canais arquivados — clique num canal e use o menu ⋮ para desarquivar (Editar Canal mantém tudo intacto).
        </p>
      )}

      {channels.length === 0 ? (
        term ? (
          <EmptyState icon={Search} title="Nenhum canal encontrado" description={`Nenhum canal com "${search}" no nome.`} />
        ) : (
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
        )
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
                className="group card-hover rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-cyan-500/50"
              >
                <div className="flex items-center gap-3">
                  <ChannelAvatar channel={ch} size="h-12 w-12" />
                  <div className="min-w-0">
                    <p className="sensitive truncate font-semibold text-slate-100 group-hover:text-cyan-300">{ch.name}</p>
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
      <p className="sensitive flex items-center justify-center gap-1 text-sm font-bold text-slate-200">
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
  const [creating, setCreating] = useState(false)
  const [creatingMsg, setCreatingMsg] = useState('')

  const [form, setForm] = useState({
    name: '',
    language: 'pt',
    contactEmail: '',
    postTimes: ['19:00'],
    frequency: '',
    postedBaseline: 0,
    notes: '',
  })

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function setTime(i, value) {
    set('postTimes', form.postTimes.map((t, idx) => (idx === i ? value : t)))
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

  async function handleCreate(e) {
    e.preventDefault()
    if (creating) return
    const postTimes = form.postTimes.filter(Boolean)
    const channel = db.insert('channels', {
      name: form.name,
      language: form.language,
      contactEmail: form.contactEmail,
      defaultPostTime: postTimes[0] || null,
      postTimes,
      frequency: form.frequency,
      postedBaseline: Number(form.postedBaseline) || 0,
      notes: form.notes,
      avatarUrl: imported?.avatar || null,
      youtubeChannelId: imported?.id || null,
      ytSubscribers: imported?.subscribers ?? null,
      ytTotalViews: imported?.views ?? null,
      ytVideoCount: imported?.videoCount ?? null,
      ytStatsUpdatedAt: imported ? Date.now() : null,
    })

    // Canal ativo importado do YouTube → já traz todos os vídeos publicados
    // (thumb, título, data, link, tag Agendado/Publicado e etapas concluídas).
    if (imported?.id && imported.videoCount > 0) {
      setCreating(true)
      try {
        await importChannelVideos(channel.id, imported.id, setCreatingMsg)
      } catch {
        // sem cota/offline: o botão "Importar do YouTube" dentro do canal refaz depois
      }
      setCreating(false)
      setCreatingMsg('')
    }

    setForm({ name: '', language: 'pt', contactEmail: '', postTimes: ['19:00'], frequency: '', postedBaseline: 0, notes: '' })
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
        {/* Horários ilimitados — grid 3 colunas com rolagem, igual ao original */}
        <Field label="HORÁRIO DE POSTAGEM">
          <div className="max-h-[120px] overflow-y-auto pt-1">
            <div className="grid grid-cols-3 gap-2">
              {form.postTimes.map((time, i) => (
                <div key={i} className="relative">
                  <input
                    className={`${inputCls} !h-10 ${form.postTimes.length > 1 ? '!pr-7' : ''}`}
                    type="time"
                    value={time}
                    onChange={(e) => setTime(i, e.target.value)}
                  />
                  {form.postTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => set('postTimes', form.postTimes.filter((_, idx) => idx !== i))}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-red-400"
                      title="Remover horário"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => set('postTimes', [...form.postTimes, '12:00'])}
                title="Adicionar horário"
                className="flex h-10 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 transition-colors hover:bg-cyan-500/20"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="FREQUÊNCIA DE POSTAGEM">
            <input className={inputCls} placeholder="3x por semana..." value={form.frequency} onChange={(e) => set('frequency', e.target.value)} />
          </Field>
          <Field label="VÍDEOS JÁ POSTADOS">
            <input className={inputCls} type="number" min="0" placeholder="0" value={form.postedBaseline} onChange={(e) => set('postedBaseline', e.target.value)} />
          </Field>
        </div>
        <Field label="ANOTAÇÕES">
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {creating && (
          <p className="flex items-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
            <Loader2 size={13} className="animate-spin" />
            {creatingMsg || 'Importando vídeos publicados do YouTube...'}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary} disabled={creating}>
            {creating ? 'Criando...' : 'Criar Canal'}
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
