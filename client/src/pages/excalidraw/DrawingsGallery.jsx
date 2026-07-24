import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Loader2, PenTool, MoreVertical, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import { ensureProjectsFolder, createFolder, uploadJson, deleteFile } from '../../lib/drive'
import { useI18n } from '../../i18n'
import { btnPrimary, btnGhost, EmptyState, ConfirmDialog } from '../../components/ui'
import { AnchoredMenu } from '../../components/AnchoredMenu'

// Formata bytes em KB/MB/GB para mostrar o tamanho do projeto.
function formatSize(bytes) {
  if (!bytes) return null
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

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

  const fileRef = useRef(null)

  // Cria um projeto (vazio ou com uma cena importada). Drive conectado → grava a
  // pasta + scene.json direto no Drive (dentro de "Noctis Studio- Site/Excalidraw-projects").
  async function createProject(name, sceneData) {
    const data = sceneData || { elements: [], appState: {}, files: {} }
    let payload = { name, scene: data }
    try {
      const st = await api.drive.status()
      if (st.connected) {
        const projects = await ensureProjectsFolder()
        const folderId = await createFolder(name, projects)
        const driveSceneFileId = await uploadJson({ name: 'scene.json', data, parentId: folderId })
        payload = { name, storage: 'drive', driveFolderId: folderId, driveSceneFileId }
      }
    } catch {
      /* Drive indisponível → cai no banco (payload já tem scene) */
    }
    const { scene } = await api.excalidraw.create(payload)
    return scene
  }

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const scene = await createProject(t('drawings.untitled'))
      navigate(`/desenhos/${scene.id}`)
    } catch (e) {
      setError(e?.message || 'Erro ao criar')
    } finally {
      setCreating(false)
    }
  }

  // Importa um arquivo .excalidraw (JSON) e cria um projeto a partir dele.
  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCreating(true)
    setError('')
    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed.elements)) throw new Error('invalid')
      const data = { elements: parsed.elements, appState: { viewBackgroundColor: parsed.appState?.viewBackgroundColor }, files: parsed.files || {} }
      const name = file.name.replace(/\.excalidraw$/i, '').slice(0, 120) || t('drawings.untitled')
      const scene = await createProject(name, data)
      navigate(`/desenhos/${scene.id}`)
    } catch {
      setError(t('drawings.importError'))
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
    // Projeto no Drive: apaga a pasta do projeto no Drive antes de remover o índice.
    if (s.storage === 'drive' && s.driveFolderId) {
      try {
        await deleteFile(s.driveFolderId)
      } catch {
        /* segue e remove o índice mesmo assim */
      }
    }
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
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".excalidraw,application/json" hidden onChange={importFile} />
          <button className={`${btnGhost} flex items-center gap-2 text-sm`} onClick={() => fileRef.current?.click()} disabled={creating}>
            <Upload size={15} />
            {t('drawings.import')}
          </button>
          <button className={`${btnPrimary} flex items-center gap-2`} onClick={create} disabled={creating}>
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('drawings.new')}
          </button>
        </div>
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
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>{new Date(s.updatedAt).toLocaleDateString('pt-BR')}</span>
            {formatSize(s.sizeBytes) && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-slate-400">{formatSize(s.sizeBytes)}</span>
              </>
            )}
          </p>
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
