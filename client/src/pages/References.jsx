import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderPlus, Plus, Trash2, Heart, ExternalLink, Loader2 } from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, EmptyState, ConfirmDialog, formatCompact } from '../components/ui'
import { Field } from './channels/ChannelsList'

export default function References() {
  const db = useDb()
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [addTo, setAddTo] = useState(null) // folder para adicionar canal
  const [deleteFolder, setDeleteFolder] = useState(null)
  const [openFolders, setOpenFolders] = useState({})

  const folders = db.all('referenceFolders')
  const refs = db.all('referenceChannels')

  function toggle(id) {
    setOpenFolders((s) => ({ ...s, [id]: !(s[id] ?? true) }))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Referências</h1>
          <p className="mt-1 text-sm text-slate-500">Organize canais benchmark do YouTube em pastas por tema.</p>
        </div>
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setNewFolderOpen(true)}>
          <FolderPlus size={16} />
          Nova Pasta
        </button>
      </div>

      {folders.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nenhuma pasta criada"
          description='Crie pastas por tema — ex: "Curiosidades Sobre Guerra", "Sociedades Ocultas" — e salve canais de referência dentro delas.'
          action={
            <button className={btnPrimary} onClick={() => setNewFolderOpen(true)}>
              Criar primeira pasta
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {folders.map((folder) => {
            const channels = refs.filter((r) => r.folderId === folder.id)
            const open = openFolders[folder.id] ?? true
            return (
              <div key={folder.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                <button onClick={() => toggle(folder.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-900/60">
                  {open ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                  <p className="font-semibold text-slate-100">{folder.name}</p>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{channels.length}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteFolder(folder)
                    }}
                    className="ml-auto cursor-pointer text-slate-600 hover:text-red-400"
                    title="Excluir pasta"
                  >
                    <Trash2 size={15} />
                  </span>
                </button>

                {open && (
                  <div className="border-t border-slate-800 p-4">
                    {channels.length === 0 && <p className="pb-3 text-center text-sm text-slate-600">Pasta vazia.</p>}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {channels.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                          {r.cachedStats?.avatar ? (
                            <img src={r.cachedStats.avatar} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-400">YT</div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-200">{r.cachedStats?.title || r.youtubeUrl}</p>
                            <p className="truncate text-[11px] text-slate-500">
                              {r.niche && <span className="mr-2 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">{r.niche}</span>}
                              {r.cachedStats ? `${formatCompact(r.cachedStats.subscribers)} inscritos` : 'sem dados do YouTube'}
                            </p>
                          </div>
                          <a
                            href={r.youtubeUrl.startsWith('http') ? r.youtubeUrl : `https://youtube.com/${r.youtubeUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-600 hover:text-cyan-400"
                            title="Abrir no YouTube"
                          >
                            <ExternalLink size={14} />
                          </a>
                          <button onClick={() => db.remove('referenceChannels', r.id)} className="text-slate-600 hover:text-red-400" title="Remover">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setAddTo(folder)}
                      className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500 hover:border-cyan-500/40 hover:text-cyan-400"
                    >
                      <Plus size={13} />
                      Adicionar canal de referência
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} />
      <AddReferenceModal open={addTo !== null} onClose={() => setAddTo(null)} folder={addTo} />
      <ConfirmDialog
        open={deleteFolder !== null}
        onClose={() => setDeleteFolder(null)}
        onConfirm={() => {
          db.removeWhere('referenceChannels', (r) => r.folderId === deleteFolder.id)
          db.remove('referenceFolders', deleteFolder.id)
        }}
        title="Excluir pasta"
        message={`Excluir "${deleteFolder?.name}" remove também os canais salvos dentro dela.`}
      />
    </div>
  )
}

function NewFolderModal({ open, onClose }) {
  const db = useDb()
  const [name, setName] = useState('')
  const [channelId, setChannelId] = useState('')
  const channels = db.all('channels')

  function create(e) {
    e.preventDefault()
    if (!name.trim()) return
    db.insert('referenceFolders', { name: name.trim(), channelId: channelId || null })
    setName('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Pasta de Referências">
      <form onSubmit={create} className="space-y-4">
        <Field label="NOME DA PASTA">
          <input className={inputCls} autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder='Ex: "Curiosidades Sobre Guerra"' />
        </Field>
        <Field label="VINCULAR A QUAL CANAL OPERACIONAL (opcional)">
          <select className={inputCls} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">Nenhum</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Criar Pasta
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function AddReferenceModal({ open, onClose, folder, presetUrl }) {
  const db = useDb()
  const [url, setUrl] = useState(presetUrl || '')
  const [niche, setNiche] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function add(e) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError('')
    let cached = null
    try {
      cached = await api.youtube.lookupChannel(url.trim())
    } catch (err) {
      if (err.code === 'channel_not_found') {
        setError(apiErrorMessage(err))
        setLoading(false)
        return
      }
      // Sem chave configurada ainda dá pra salvar só a URL.
    }
    db.insert('referenceChannels', {
      folderId: folder.id,
      channelId: folder.channelId || null,
      youtubeUrl: url.trim(),
      youtubeChannelId: cached?.id || null,
      cachedStats: cached || null,
      niche: niche.trim(),
      notes: notes.trim(),
    })
    setUrl('')
    setNiche('')
    setNotes('')
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Adicionar canal — ${folder?.name || ''}`}>
      <form onSubmit={add} className="space-y-4">
        <Field label="URL DO CANAL DO YOUTUBE">
          <input className={inputCls} required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="youtube.com/@canal" />
        </Field>
        <Field label="NICHO/CATEGORIA">
          <input className={inputCls} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Ex: Mistério" />
        </Field>
        <Field label="NOTAS">
          <textarea className={`${inputCls} min-h-16 resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={`${btnPrimary} flex items-center gap-2`} disabled={loading}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            Adicionar
          </button>
        </div>
      </form>
    </Modal>
  )
}
