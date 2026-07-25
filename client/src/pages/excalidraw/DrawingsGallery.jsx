import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Loader2, PenTool, MoreVertical, Upload, Film } from 'lucide-react'
import { api } from '../../lib/api'
import { deleteFile, setDriveOwner } from '../../lib/drive'
import { createDrawing } from '../../lib/drawings'
import { useDb } from '../../lib/db'
import { useI18n } from '../../i18n'
import { btnPrimary, btnGhost, EmptyState, ConfirmDialog } from '../../components/ui'
import { AnchoredMenu } from '../../components/AnchoredMenu'
import { VisibilityControl, VisibilityBadge } from '../../components/ItemVisibility'
import { Eye } from 'lucide-react'

// Rótulo do vídeo com o número da gestão de canais: "Vídeo X — Título".
function videoLabel(v, t) {
  const prefix = v.videoNumber != null ? `${t('videos.videoNum', { n: v.videoNumber })} — ` : ''
  return `${prefix}${v.title || ''}`
}

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
  const db = useDb()
  const owner = db.activeWorkspace() // null = próprio; e-mail = workspace de outro
  const isOwnerSelf = !owner
  const canEdit = db.canEdit('drawings') // storyboards seguem o acesso a Desenhos
  const videos = db.all('videos') // p/ vincular storyboard a um vídeo
  const [scenes, setScenes] = useState(null) // null = carregando
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState(null)

  async function load() {
    try {
      setDriveOwner(owner) // Drive do dono quando em workspace de outro
      const { scenes } = await api.excalidraw.list(owner)
      setScenes(scenes)
    } catch (e) {
      setError(e?.message || 'Erro ao carregar')
      setScenes([])
    }
  }
  useEffect(() => {
    load()
    // Pré-carrega o pacote pesado do editor (~590 KB) em segundo plano, para que
    // clicar em um projeto abra na hora, sem esperar o download do chunk.
    import('./DrawingEditor').catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner])

  const fileRef = useRef(null)

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const scene = await createDrawing(t('drawings.untitled'), { owner })
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
      const scene = await createDrawing(name, { sceneData: data, owner })
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

  // Vincula/desvincula o storyboard a um vídeo (videoId=null desvincula).
  async function linkVideo(s, videoId) {
    await api.excalidraw.save(s.id, { videoId: videoId || null })
    load()
  }

  // Define quem vê o storyboard (só eu / workspace / e-mails específicos).
  async function setVisibility(s, visibility, emails) {
    await api.excalidraw.save(s.id, { visibility, allowedEmails: emails || [] })
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
        {canEdit && (
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
        )}
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
            canEdit ? (
              <button className={btnPrimary} onClick={create}>
                {t('drawings.new')}
              </button>
            ) : null
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {scenes.map((s) => (
            <SceneCard
              key={s.id}
              scene={s}
              videos={videos}
              onOpen={() => navigate(`/desenhos/${s.id}`)}
              isOwner={isOwnerSelf}
              canEdit={db.canEdit('drawings')}
              canDeleteScene={isOwnerSelf || (db.canEdit('drawings') && !!s.createdBy && s.createdBy === db.selfEmail())}
              onRename={() => rename(s)}
              onDelete={() => setToDelete(s)}
              onLinkVideo={(vid) => linkVideo(s, vid)}
              onSetVisibility={(vis, emails) => setVisibility(s, vis, emails)}
            />
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

function SceneCard({ scene: s, videos, isOwner, canEdit, canDeleteScene, onOpen, onRename, onDelete, onLinkVideo, onSetVisibility }) {
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mode, setMode] = useState(null) // null | 'link' | 'visibility'
  const btnRef = useRef(null)
  const linkedVideo = s.videoId ? videos.find((v) => v.id === s.videoId) : null
  const closeMenu = () => { setMenuOpen(false); setMode(null) }
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
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {linkedVideo && (
              <span className="flex min-w-0 items-center gap-1 truncate rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
                <Film size={10} className="shrink-0" />
                <span className="truncate">{videoLabel(linkedVideo, t)}</span>
              </span>
            )}
            <VisibilityBadge visibility={s.visibility} />
          </div>
        </div>
      </button>
      <button ref={btnRef} onClick={() => setMenuOpen((v) => !v)} className="absolute right-2 top-2 rounded-md bg-slate-900/80 p-1 text-slate-400 opacity-0 transition-opacity hover:text-slate-200 group-hover:opacity-100">
        <MoreVertical size={15} />
      </button>
      <AnchoredMenu open={menuOpen} anchorRef={btnRef} onClose={closeMenu} width={230}>
        {mode === 'link' ? (
          <div className="max-h-64 overflow-y-auto">
            <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('drawings.linkVideoTitle')}</p>
            {s.videoId && (
              <button onClick={() => { closeMenu(); onLinkVideo(null) }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                {t('drawings.unlinkVideo')}
              </button>
            )}
            {videos.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-slate-500">{t('drawings.noVideos')}</p>
            ) : (
              [...videos]
                .sort((a, b) => (a.videoNumber ?? 0) - (b.videoNumber ?? 0))
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => { closeMenu(); onLinkVideo(v.id) }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-slate-800 ${v.id === s.videoId ? 'text-cyan-300' : 'text-slate-300'}`}
                  >
                    <Film size={12} className="shrink-0" />
                    <span className="truncate">{videoLabel(v, t)}</span>
                  </button>
                ))
            )}
          </div>
        ) : mode === 'visibility' ? (
          <div className="p-1.5">
            <VisibilityControl
              value={s.visibility}
              emails={s.allowedEmails}
              onChange={(vis, emails) => { onSetVisibility(vis, emails); if (vis !== 'specific') closeMenu() }}
            />
          </div>
        ) : (
          <>
            {canEdit && (
              <button onClick={() => { setMenuOpen(false); onRename() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                <Pencil size={13} /> {t('drawings.rename')}
              </button>
            )}
            {/* Vincular a vídeo e visibilidade são SOMENTE do dono. */}
            {isOwner && (
              <>
                <button onClick={() => setMode('link')} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                  <Film size={13} /> {t('drawings.linkVideo')}
                </button>
                <button onClick={() => setMode('visibility')} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                  <Eye size={13} /> {t('drawings.visibility')}
                </button>
              </>
            )}
            {/* Apagar: o dono apaga qualquer um; o editor só o storyboard que ELE criou. */}
            {canDeleteScene && (
              <button onClick={() => { setMenuOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                <Trash2 size={13} /> {t('drawings.delete')}
              </button>
            )}
            {!canEdit && !isOwner && (
              <p className="px-2.5 py-1.5 text-xs text-slate-500">{t('drawings.viewOnly')}</p>
            )}
          </>
        )}
      </AnchoredMenu>
    </div>
  )
}
