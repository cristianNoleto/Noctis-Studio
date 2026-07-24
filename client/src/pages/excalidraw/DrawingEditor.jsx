import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { ArrowLeft, Loader2, Check, CloudUpload, Maximize2, Minimize2 } from 'lucide-react'
import { api } from '../../lib/api'
import { downloadText, updateFileContent, renameFile } from '../../lib/drive'
import { useI18n } from '../../i18n'

// Editor Excalidraw de um projeto. Carrega a cena do banco, renderiza o editor
// (mesmo motor do excalidraw.com) e faz AUTOSAVE com debounce — cada projeto
// salva na sua própria linha (tabela dedicada), fora do sync do workspace.
export default function DrawingEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [initial, setInitial] = useState(null) // dados iniciais da cena
  const [name, setName] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [error, setError] = useState('')
  const apiRef = useRef(null)
  const saveTimer = useRef(null)
  const lastSaved = useRef('')
  const rootRef = useRef(null)
  const [fs, setFs] = useState(false)
  const storageRef = useRef('db') // 'db' | 'drive'
  const driveFileRef = useRef(null) // id do scene.json no Drive
  const driveFolderRef = useRef(null) // id da pasta do projeto no Drive
  const latestRef = useRef(null) // último estado bom da cena (p/ salvar ao fechar)

  // Fullscreen imersivo do navegador (Esc sai). Botão liga/desliga.
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await rootRef.current?.requestFullscreen()
      else await document.exitFullscreen()
    } catch {
      /* navegador pode bloquear */
    }
  }
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { scene } = await api.excalidraw.get(id)
        if (!alive) return
        setName(scene.name || '')
        storageRef.current = scene.storage || 'db'
        driveFileRef.current = scene.driveSceneFileId || null
        driveFolderRef.current = scene.driveFolderId || null
        // Projeto no Drive: baixa o scene.json DIRETO do Drive (não passa pelo servidor).
        let data = scene.scene || {}
        if (scene.storage === 'drive' && scene.driveSceneFileId) {
          try {
            data = JSON.parse(await downloadText(scene.driveSceneFileId)) || {}
          } catch {
            data = {}
          }
        }
        if (!alive) return
        lastSaved.current = JSON.stringify(data.elements || [])
        setInitial({
          elements: data.elements || [],
          appState: { ...(data.appState || {}), collaborators: undefined },
          files: data.files || undefined,
          scrollToContent: true,
        })
      } catch (e) {
        if (e?.code === 'local_mode') { setInitial({ elements: [], scrollToContent: true }); return } // DEV: sem Supabase → canvas vazio
        setError(e?.code === 'not_found' ? t('drawings.notFound') : e?.message || 'Erro')
        setInitial(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id, t])

  // Gera uma miniatura pequena (PNG) da cena para a galeria — best-effort.
  async function makeThumbnail(elements, files) {
    if (!elements.length) return null
    try {
      const blob = await exportToBlob({
        elements,
        files: files || null,
        appState: { exportBackground: true, viewBackgroundColor: '#ffffff' },
        maxWidthOrHeight: 480,
        mimeType: 'image/jpeg',
        quality: 0.6,
      })
      return await new Promise((resolve) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => resolve(null)
        r.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }

  const doSave = useCallback(
    async (elements, appState, files) => {
      setStatus('saving')
      try {
        const thumbnail = await makeThumbnail(elements, files)
        const scene = { elements, appState: { viewBackgroundColor: appState?.viewBackgroundColor }, files }
        if (storageRef.current === 'drive' && driveFileRef.current) {
          // Grava a cena DIRETO no Drive (sem trafegar pelo servidor); só a
          // miniatura leve vai pro banco (para a galeria).
          await updateFileContent(driveFileRef.current, new Blob([JSON.stringify(scene)], { type: 'application/json' }), 'application/json')
          await api.excalidraw.save(id, thumbnail ? { thumbnail } : {})
        } else {
          await api.excalidraw.save(id, thumbnail ? { scene, thumbnail } : { scene })
        }
        lastSaved.current = JSON.stringify(elements)
        setStatus('saved')
        setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500)
      } catch {
        setStatus('idle')
      }
    },
    [id],
  )

  // onChange dispara MUITO; só salva se os elementos mudaram, com debounce.
  // Guarda SEMPRE o último estado bom num ref — é ele que salvamos ao fechar
  // (não o getSceneElements() do editor, que devolve VAZIO durante o desmonte e
  // sobrescrevia o projeto com uma cena vazia → abria vazio no reload).
  const onChange = useCallback(
    (elements, appState, files) => {
      latestRef.current = { elements, appState, files }
      const sig = JSON.stringify(elements)
      if (sig === lastSaved.current) return
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => doSave(elements, appState, files), 1200)
    },
    [doSave],
  )

  // Salva o pendente ao sair da página usando o ÚLTIMO estado bom guardado.
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current)
      const latest = latestRef.current
      if (latest && JSON.stringify(latest.elements) !== lastSaved.current) {
        doSave(latest.elements, latest.appState, latest.files)
      }
    }
  }, [doSave])

  // Renomear o projeto: atualiza o índice (banco) e, se for Drive, também
  // renomeia a PASTA do projeto no Drive. Debounce p/ não chamar a cada tecla.
  const nameTimer = useRef(null)
  function saveName(v) {
    setName(v)
    clearTimeout(nameTimer.current)
    nameTimer.current = setTimeout(async () => {
      const clean = v.trim() || t('drawings.untitled')
      try {
        await api.excalidraw.save(id, { name: clean })
        if (storageRef.current === 'drive' && driveFolderRef.current) await renameFile(driveFolderRef.current, clean)
      } catch {
        /* ignora */
      }
    }, 700)
  }

  if (initial === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
        <Loader2 size={26} className="animate-spin text-cyan-400" />
      </div>
    )
  }
  if (initial === false) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-center">
        <p className="text-sm text-slate-400">{error}</p>
        <button onClick={() => navigate('/desenhos')} className="mt-4 text-sm text-cyan-400 hover:underline">
          ← {t('drawings.backToGallery')}
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="flex h-screen w-screen flex-col bg-slate-950">
      {/* Barra flutuante compacta do editor (fora do canvas do Excalidraw) */}
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-1.5">
        <button onClick={() => navigate('/desenhos')} className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-slate-100" title={t('drawings.backToGallery')}>
          <ArrowLeft size={14} />
          {t('drawings.gallery')}
        </button>
        <input
          value={name}
          onChange={(e) => saveName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold text-slate-100 hover:border-slate-800 focus:border-cyan-500/50 focus:outline-none"
        />
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-500">
          {status === 'saving' ? (
            <>
              <CloudUpload size={13} className="text-cyan-400" /> {t('drawings.saving')}
            </>
          ) : status === 'saved' ? (
            <>
              <Check size={13} className="text-green-400" /> {t('drawings.saved')}
            </>
          ) : (
            t('drawings.autosaveHint')
          )}
        </span>
        <button onClick={toggleFullscreen} title={fs ? t('drawings.exitFullscreen') : t('drawings.fullscreen')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-100">
          {fs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* Canvas ocupa todo o resto */}
      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(a) => (apiRef.current = a)}
          initialData={initial}
          onChange={onChange}
          langCode="pt-BR"
        />
      </div>
    </div>
  )
}
