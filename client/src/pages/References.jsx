import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Search, Bookmark, MoreVertical, Pencil, ExternalLink, Trash2, Loader2 } from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, EmptyState } from '../components/ui'
import { Field } from './channels/ChannelsList'

// Agrupamento por NICHO (como no layout de referência): cada nicho vira um
// accordion; referências sem nicho caem em "Sem Nicho".
export default function References() {
  const db = useDb()
  const [modal, setModal] = useState(null) // 'new' | referência (edição)
  const [channelFilter, setChannelFilter] = useState('')
  const [nicheFilter, setNicheFilter] = useState('')
  const [query, setQuery] = useState('')
  const [closedGroups, setClosedGroups] = useState({})

  const refs = db.all('referenceChannels')
  const channels = db.all('channels')

  const channelName = (id) => (id ? channels.find((c) => c.id === id)?.name || 'Canal' : 'Global')

  let filtered = refs
  if (channelFilter === 'global') filtered = filtered.filter((r) => !r.channelId)
  else if (channelFilter) filtered = filtered.filter((r) => r.channelId === channelFilter)
  if (nicheFilter) filtered = filtered.filter((r) => (r.niche || 'Sem Nicho') === nicheFilter)
  if (query.trim()) {
    const t = query.trim().toLowerCase()
    filtered = filtered.filter((r) => `${r.cachedStats?.title || ''} ${r.youtubeUrl} ${r.notes || ''}`.toLowerCase().includes(t))
  }

  const niches = [...new Set(refs.map((r) => r.niche?.trim() || 'Sem Nicho'))].sort((a, b) => (a === 'Sem Nicho') - (b === 'Sem Nicho'))
  const groups = niches
    .map((niche) => ({ niche, items: filtered.filter((r) => (r.niche?.trim() || 'Sem Nicho') === niche) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Bookmark size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Referências de Canais</h1>
            <p className="text-sm text-slate-500">Canais que você acompanha para inspiração, análise e modelagem de títulos por nicho</p>
          </div>
        </div>
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setModal('new')}>
          <Plus size={16} />
          Novo Canal →
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select className={`${inputCls} !w-52`} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
          <option value="">Todas as Referências</option>
          <option value="global">Globais</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={`${inputCls} !w-48`} value={nicheFilter} onChange={(e) => setNicheFilter(e.target.value)}>
          <option value="">Todos os Nichos</option>
          {niches.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={`${inputCls} !pl-9`} placeholder="Buscar canais..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {refs.length === 0 && (
        <EmptyState
          icon={Bookmark}
          title="Nenhum canal de referência"
          description="Cole a URL de um canal do YouTube — nome e foto são extraídos automaticamente e o canal entra no nicho que você definir."
          action={
            <button className={btnPrimary} onClick={() => setModal('new')}>
              Adicionar primeiro canal
            </button>
          }
        />
      )}

      {/* Grupos por nicho */}
      {groups.map(({ niche, items }) => {
        const open = !closedGroups[niche]
        return (
          <div key={niche} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="border-t-2 border-cyan-500/50" />
            <button
              onClick={() => setClosedGroups((s) => ({ ...s, [niche]: open }))}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-900/60"
            >
              {open ? <ChevronDown size={16} className="text-cyan-400" /> : <ChevronRight size={16} className="text-slate-500" />}
              <div>
                <p className="font-semibold text-slate-100">{niche}</p>
                <p className="text-[11px] text-slate-500">
                  {items.length} {items.length === 1 ? 'canal' : 'canais'}
                </p>
              </div>
              <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-[11px] font-bold text-cyan-300">
                {items.length}
              </span>
            </button>

            {open && (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((r) => (
                  <ReferenceCard key={r.id} reference={r} linkedName={channelName(r.channelId)} onEdit={() => setModal(r)} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      <ReferenceModal
        open={modal !== null}
        onClose={() => setModal(null)}
        reference={modal === 'new' ? null : modal}
        channels={channels}
        niches={niches.filter((n) => n !== 'Sem Nicho')}
      />
    </div>
  )
}

function ReferenceCard({ reference: r, linkedName, onEdit }) {
  const db = useDb()
  const [menuOpen, setMenuOpen] = useState(false)
  const url = r.youtubeUrl.startsWith('http') ? r.youtubeUrl : `https://youtube.com/${r.youtubeUrl}`

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-3.5">
      <div className="flex items-center gap-3">
        {r.cachedStats?.avatar ? (
          <img src={r.cachedStats.avatar} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-400">
            {(r.cachedStats?.title || r.youtubeUrl).replace(/https?:\/\/|www\.|youtube\.com\/@?/g, '').charAt(0).toUpperCase()}
          </div>
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">{r.cachedStats?.title || r.youtubeUrl}</p>
        <button onClick={() => setMenuOpen((v) => !v)} className="text-slate-600 hover:text-slate-300">
          <MoreVertical size={15} />
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-3 top-11 z-20 w-44 rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
          <MenuItem icon={Pencil} label="Editar" onClick={() => { setMenuOpen(false); onEdit() }} />
          <MenuItem icon={ExternalLink} label="Abrir no YouTube" onClick={() => window.open(url, '_blank')} />
          <MenuItem icon={Trash2} label="Excluir" danger onClick={() => db.remove('referenceChannels', r.id)} />
        </div>
      )}

      <span className="mt-2.5 inline-block rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-300">
        Vinculado: {linkedName}
      </span>

      {r.notes && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{r.notes}</p>}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-300 hover:bg-slate-800'}`}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Modal Adicionar/Editar Canal de Referência (layout do print)
// ---------------------------------------------------------------------------
export function ReferenceModal({ open, onClose, reference, channels, niches = [], presetUrl }) {
  const db = useDb()
  const [url, setUrl] = useState('')
  const [channelId, setChannelId] = useState('')
  const [niche, setNiche] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setUrl(reference?.youtubeUrl || presetUrl || '')
      setChannelId(reference?.channelId || '')
      setNiche(reference?.niche || '')
      setNotes(reference?.notes || '')
      setError('')
    }
  }, [open, reference, presetUrl])

  async function save(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    let cached = reference?.cachedStats || null
    if (!reference || reference.youtubeUrl !== url.trim()) {
      try {
        cached = await api.youtube.lookupChannel(url.trim())
      } catch (err) {
        if (err.code === 'channel_not_found') {
          setError(apiErrorMessage(err))
          setLoading(false)
          return
        }
        // sem chave configurada ainda dá pra salvar a URL crua
      }
    }
    const payload = {
      youtubeUrl: url.trim(),
      youtubeChannelId: cached?.id || reference?.youtubeChannelId || null,
      cachedStats: cached,
      channelId: channelId || null,
      niche: niche.trim(),
      notes: notes.trim(),
    }
    if (reference) db.update('referenceChannels', reference.id, payload)
    else db.insert('referenceChannels', payload)
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={reference ? 'Editar Canal de Referência' : 'Adicionar Canal de Referência'}>
      <p className="-mt-3 mb-5 text-xs text-slate-500">Cole a URL do Canal do YouTube. O nome e foto serão extraídos automaticamente.</p>
      <form onSubmit={save} className="space-y-4">
        <div>
          <Field label="URL DO CANAL DO YOUTUBE *">
            <input className={`${inputCls} font-mono text-xs`} required placeholder="https://www.youtube.com/@nomecanal" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <p className="mt-1 text-[10px] text-slate-600">Exemplo: https://www.youtube.com/@parabolasdoprofeta</p>
        </div>

        <div>
          <Field label="VINCULAR AO CANAL (OPCIONAL)">
            <select className={inputCls} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Global</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-1 text-[10px] text-slate-600">Deixe "Global" para referências compartilhadas entre todos os canais</p>
        </div>

        <div>
          <Field label="NICHO/CATEGORIA *">
            <input
              className={inputCls}
              required
              list="niche-suggestions"
              placeholder="Digite o nicho (ex: Religioso, Tecnologia, Educação...)"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
            <datalist id="niche-suggestions">
              {niches.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <p className="mt-1 text-[10px] text-slate-600">Comece a digitar para ver sugestões ou crie um novo nicho</p>
        </div>

        <Field label="NOTAS (OPCIONAL)">
          <textarea className={`${inputCls} min-h-20 resize-y`} placeholder="Adicione observações sobre este canal..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={`${btnPrimary} flex items-center gap-2`} disabled={loading}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            Salvar Canal →
          </button>
        </div>
      </form>
    </Modal>
  )
}
