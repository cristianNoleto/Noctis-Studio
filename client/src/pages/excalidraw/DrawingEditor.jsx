import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Excalidraw, exportToBlob, MainMenu, WelcomeScreen, languages, defaultLang } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { ArrowLeft, Loader2, Check, CloudUpload, Maximize2, Minimize2 } from 'lucide-react'
import { api } from '../../lib/api'
import { downloadText, updateFileContent, renameFile } from '../../lib/drive'
import { optimizeDataUrl, dataUrlBytes } from '../../lib/imageOptimize'
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
  // Idioma do quadro (UI do Excalidraw + textos da tela de boas-vindas). Começa
  // no idioma do site quando existir na lista do Excalidraw.
  const [langCode, setLangCode] = useState(() => {
    const site = { pt: 'pt-BR', en: 'en', es: 'es-ES' }[localStorage.getItem('lang')] || 'pt-BR'
    return languages.some((l) => l.code === site) ? site : defaultLang.code
  })
  // Lista de idiomas do Excalidraw sem os locales de teste (__test__…).
  const langOptions = languages.filter((l) => !l.code.startsWith('__'))
  const storageRef = useRef('db') // 'db' | 'drive'
  const driveFileRef = useRef(null) // id do scene.json no Drive
  const driveFolderRef = useRef(null) // id da pasta do projeto no Drive
  const latestRef = useRef(null) // último estado bom da cena (p/ salvar ao fechar)
  const savingRef = useRef(false) // há um doSave em andamento
  const dirtyRef = useRef(false) // há mudança pendente ainda não salva
  const [leaving, setLeaving] = useState(false) // overlay ao sair enquanto salva
  const seenFiles = useRef(new Set()) // ids de imagens já avaliadas p/ otimização
  const [optimizing, setOptimizing] = useState(null) // { done, total } ou null

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
        // Imagens já presentes no projeto não são reotimizadas (evita retrabalho).
        Object.keys(data.files || {}).forEach((k) => seenFiles.current.add(k))
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
      savingRef.current = true
      setStatus('saving')
      try {
        const thumbnail = await makeThumbnail(elements, files)
        const scene = { elements, appState: { viewBackgroundColor: appState?.viewBackgroundColor }, files }
        const json = JSON.stringify(scene)
        const sizeBytes = new Blob([json]).size // tamanho do projeto (p/ mostrar em MB)
        if (storageRef.current === 'drive' && driveFileRef.current) {
          // Grava a cena DIRETO no Drive (sem trafegar pelo servidor); só a
          // miniatura leve + o tamanho vão pro banco (para a galeria).
          await updateFileContent(driveFileRef.current, new Blob([json], { type: 'application/json' }), 'application/json')
          await api.excalidraw.save(id, { sizeBytes, ...(thumbnail ? { thumbnail } : {}) })
        } else {
          await api.excalidraw.save(id, { scene, sizeBytes, ...(thumbnail ? { thumbnail } : {}) })
        }
        lastSaved.current = JSON.stringify(elements)
        dirtyRef.current = false
        setStatus('saved')
        setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500)
      } catch {
        setStatus('idle')
      } finally {
        savingRef.current = false
      }
    },
    [id],
  )

  // Otimiza imagens recém-adicionadas (colar/soltar): reamostra + recomprime
  // mantendo o MESMO fileId. Roda em fila, com progresso, para projetos com
  // muitas imagens não travarem a UI nem estourarem o tamanho do arquivo.
  const optimizeNewImages = useCallback(async (files) => {
    if (!files) return
    const pending = []
    for (const [fid, f] of Object.entries(files)) {
      if (seenFiles.current.has(fid)) continue
      seenFiles.current.add(fid)
      if (f?.dataURL && String(f.mimeType || '').startsWith('image/') && dataUrlBytes(f.dataURL) >= 180 * 1024) {
        pending.push({ fid, f })
      }
    }
    if (!pending.length) return
    setOptimizing({ done: 0, total: pending.length })
    let done = 0
    for (const { fid, f } of pending) {
      try {
        const opt = await optimizeDataUrl(f.dataURL, f.mimeType)
        if (opt && apiRef.current) {
          apiRef.current.addFiles([{ id: fid, dataURL: opt.dataURL, mimeType: opt.mimeType, created: f.created || Date.now(), lastRetrieved: Date.now() }])
        }
      } catch {
        /* mantém a imagem original se falhar */
      }
      done += 1
      setOptimizing({ done, total: pending.length })
    }
    setOptimizing(null)
  }, [])

  // onChange dispara MUITO; só salva se os elementos mudaram, com debounce.
  // Guarda SEMPRE o último estado bom num ref — é ele que salvamos ao fechar
  // (não o getSceneElements() do editor, que devolve VAZIO durante o desmonte e
  // sobrescrevia o projeto com uma cena vazia → abria vazio no reload).
  const onChange = useCallback(
    (elements, appState, files) => {
      latestRef.current = { elements, appState, files }
      optimizeNewImages(files)
      const sig = JSON.stringify(elements)
      if (sig === lastSaved.current) return
      dirtyRef.current = true
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => doSave(elements, appState, files), 1200)
    },
    [doSave, optimizeNewImages],
  )

  // Sair com segurança: se há mudança pendente ou um save em andamento, mostra
  // o overlay "salvando", garante que a última cena foi gravada e SÓ ENTÃO
  // navega. Assim o usuário nunca sai antes de tudo estar salvo.
  const goBack = useCallback(async () => {
    const latest = latestRef.current
    const pending = dirtyRef.current || savingRef.current
    if (!pending) {
      navigate('/desenhos')
      return
    }
    setLeaving(true)
    clearTimeout(saveTimer.current)
    try {
      if (latest && JSON.stringify(latest.elements) !== lastSaved.current) {
        await doSave(latest.elements, latest.appState, latest.files)
      }
      // Se um save já estava rodando, espera ele terminar.
      while (savingRef.current) await new Promise((r) => setTimeout(r, 120))
    } catch {
      /* segue mesmo assim: o unmount flush ainda tenta salvar */
    }
    navigate('/desenhos')
  }, [doSave, navigate])

  // Bloqueia fechar/atualizar a aba do navegador enquanto há algo por salvar.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirtyRef.current || savingRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

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
        <button onClick={goBack} disabled={leaving} className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-slate-100 disabled:opacity-50" title={t('drawings.backToGallery')}>
          <ArrowLeft size={14} />
          {t('drawings.gallery')}
        </button>
        <input
          value={name}
          onChange={(e) => saveName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold text-slate-100 hover:border-slate-800 focus:border-cyan-500/50 focus:outline-none"
        />
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-500">
          {optimizing ? (
            <>
              <Loader2 size={13} className="animate-spin text-cyan-400" /> {t('drawings.optimizing', { done: optimizing.done, total: optimizing.total })}
            </>
          ) : status === 'saving' ? (
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
        <select
          value={langCode}
          onChange={(e) => setLangCode(e.target.value)}
          title={t('drawings.language')}
          className="h-8 max-w-[150px] cursor-pointer rounded-lg border border-slate-800 bg-slate-950 px-2 text-xs text-slate-300 hover:border-slate-700 focus:border-cyan-500/50 focus:outline-none"
        >
          {langOptions.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
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
          langCode={langCode}
        >
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.CommandPalette />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
          <WelcomeScreen>
            <WelcomeScreen.Hints.MenuHint />
            <WelcomeScreen.Hints.ToolbarHint />
            <WelcomeScreen.Hints.HelpHint />
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Logo>Noctis Studio</WelcomeScreen.Center.Logo>
              <WelcomeScreen.Center.Heading>{t('drawings.welcomeHeading')}</WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu>
                <WelcomeScreen.Center.MenuItemLoadScene />
                <WelcomeScreen.Center.MenuItemHelp />
              </WelcomeScreen.Center.Menu>
            </WelcomeScreen.Center>
          </WelcomeScreen>
        </Excalidraw>
      </div>

      {/* Overlay ao sair: garante ao usuário que estamos salvando antes de fechar */}
      {leaving && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 px-8 py-7 text-center shadow-2xl">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <Loader2 size={40} className="animate-spin text-cyan-400" />
              <CloudUpload size={18} className="absolute text-cyan-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">{t('drawings.leavingSaving')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('drawings.leavingHint')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
