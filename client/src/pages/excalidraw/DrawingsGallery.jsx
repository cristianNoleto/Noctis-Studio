import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Loader2, PenTool, MoreVertical } from 'lucide-react'
import { useRef } from 'react'
import { api } from '../../lib/api'
import { useI18n } from '../../i18n'
import { btnPrimary, EmptyState, ConfirmDialog } from '../../components/ui'
import { AnchoredMenu } from '../../components/AnchoredMenu'

// Galeria dos projetos de desenho (Excalidraw). Leve: só metadados; o editor
// (pacote grande) é carregado sob demanda ao abrir um projeto.
export default function DrawingsGallery() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [scenes, setScenes] = useState(null) // null = carregando
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState(null)

  async function load() {
    try {
      const { scenes } = await api.excalidraw.list()
      setScenes(scenes)
    } catch (e) {
      setError(e?.message || 'Erro ao carregar')
      setScenes([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const { scene } = await api.excalidraw.create(t('drawings.untitled'))
      navigate(`/desenhos/${scene.id}`)
    } catch (e) {
      setError(e?.message || 'Erro ao criar')
    } finally {
      setCreating(false)
    }
  }

  async function rename(s) {
    const name = window.prompt(t('drawings.renamePrompt'), s.name)
    if (name == null) return
    await api.excalidraw.save(s.id, { name: name.trim() || t('drawings.untitled') })
    load()
  }

  async function remove(s) {
    await api.excalidraw.remove(s.id)
    setToDelete(null)
    load()
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <PenTool size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{t('drawings.title')}</h1>
            <p className="text-sm text-slate-500">{t('drawings.subtitle')}</p>
          </div>
        </div>
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={create} disabled={creating}>
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {t('drawings.new')}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

      {scenes === null ? (
        <div className="flex justify-center py-20">
          <Loader2 size={26} className="animate-spin text-cyan-400" />
        </div>
      ) : scenes.length === 0 ? (
        <EmptyState
          icon={PenTool}
          title={t('drawings.emptyTitle')}
          description={t('drawings.emptyDesc')}
          action={
            <button className={btnPrimary} onClick={create}>
              {t('drawings.new')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {scenes.map((s) => (
            <SceneCard key={s.id} scene={s} onOpen={() => navigate(`/desenhos/${s.id}`)} onRename={() => rename(s)} onDelete={() => setToDelete(s)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => remove(toDelete)}
        title={t('drawings.deleteTitle')}
        message={t('drawings.deleteMsg', { name: toDelete?.name })}
      />
    </div>
  )
}

function SceneCard({ scene: s, onOpen, onRename, onDelete }) {
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef(null)
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 transition-colors hover:border-slate-700">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex aspect-video items-center justify-center border-b border-slate-800 bg-slate-950">
          {s.thumbnail ? (
            <img src={s.thumbnail} alt="" className="h-full w-full object-contain" />
          ) : (
            <PenTool size={28} className="text-slate-700" />
          )}
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-semibold text-slate-100">{s.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{new Date(s.updatedAt).toLocaleDateString('pt-BR')}</p>
        </div>
      </button>
      <button ref={btnRef} onClick={() => setMenuOpen((v) => !v)} className="absolute right-2 top-2 rounded-md bg-slate-900/80 p-1 text-slate-400 opacity-0 transition-opacity hover:text-slate-200 group-hover:opacity-100">
        <MoreVertical size={15} />
      </button>
      <AnchoredMenu open={menuOpen} anchorRef={btnRef} onClose={() => setMenuOpen(false)} width={160}>
        <button onClick={() => { setMenuOpen(false); onRename() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          <Pencil size={13} /> {t('drawings.rename')}
        </button>
        <button onClick={() => { setMenuOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
          <Trash2 size={13} /> {t('drawings.delete')}
        </button>
      </AnchoredMenu>
    </div>
  )
}
