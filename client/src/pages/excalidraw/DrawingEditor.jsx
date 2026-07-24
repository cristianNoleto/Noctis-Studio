import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Excalidraw, exportToBlob, MainMenu, WelcomeScreen, languages, defaultLang, useI18n as useExcalidrawI18n } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { ArrowLeft, Loader2, Check, CloudUpload, Maximize2, Minimize2 } from 'lucide-react'
import { api } from '../../lib/api'
import { downloadText, updateFileContent, renameFile, uploadFile, downloadBlob, setDriveOwner } from '../../lib/drive'
import { optimizeDataUrl, dataUrlBytes, dataUrlToBlob, blobToDataUrl } from '../../lib/imageOptimize'
import { useDb } from '../../lib/db'
import { useI18n } from '../../i18n'

// Tela de boas-vindas (placeholder do quadro vazio) TRADUZIDA pelo idioma do
// quadro. Os componentes de hint/help do Excalidraw usam o `t` estático do
// módulo e NÃO re-renderizam ao trocar idioma (bug do pacote). Aqui usamos o
// useI18n reativo dele só para obter o langCode atual (que muda DEPOIS do
// locale carregar) e remontar tudo via key — assim os textos estáticos pegam
// o idioma novo. Precisa ser renderizado DENTRO do <Excalidraw>.
function BoardWelcome() {
  const { t: tx, langCode } = useExcalidrawI18n()
  return (
    <WelcomeScreen key={langCode}>
      <WelcomeScreen.Hints.MenuHint />
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo>Noctis Studio</WelcomeScreen.Center.Logo>
        <WelcomeScreen.Center.Heading>{tx('welcomeScreen.defaults.center_heading')}</WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItemLoadScene />
          <WelcomeScreen.Center.MenuItemHelp />
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  )
}

// Editor Excalidraw de um projeto. Carrega a cena do banco, renderiza o editor
// (mesmo motor do excalidraw.com) e faz AUTOSAVE com debounce — cada projeto
// salva na sua própria linha (tabela dedicada), fora do sync do workspace.
export default function DrawingEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = useDb()
  const canEditScene = db.canEdit('references') // editor pode salvar; viewer não
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
  // Idioma efetivamente aplicado no Excalidraw. É DEBOUNCED em relação ao
  // seletor: o setLanguage do Excalidraw é assíncrono e trocas rápidas seguidas
  // criam uma corrida (vence a que carrega por último, não a última escolhida).
  // Aplicando só a escolha final evitamos esse "off-by-one".
  const [appliedLang, setAppliedLang] = useState(langCode)
  useEffect(() => {
    const t = setTimeout(() => setAppliedLang(langCode), 250)
    return () => clearTimeout(t)
  }, [langCode])
  const storageRef = useRef('db') // 'db' | 'drive'
  const driveFileRef = useRef(null) // id do scene.json no Drive
  const driveFolderRef = useRef(null) // id da pasta do projeto no Drive
  const latestRef = useRef(null) // último estado bom da cena (p/ salvar ao fechar)
  const savingRef = useRef(false) // há um doSave em andamento
  const dirtyRef = useRef(false) // há mudança pendente ainda não salva
  const [leaving, setLeaving] = useState(false) // overlay ao sair enquanto salva
  const seenFiles = useRef(new Set()) // ids de imagens já avaliadas p/ otimização
  const [optimizing, setOptimizing] = useState(null) // { done, total } ou null
  // Manifesto das imagens já subidas ao Drive como arquivos SEPARADOS:
  // fileId (do Excalidraw) → { driveFileId, mimeType }. Assim o scene.json fica
  // leve (só a "planta") e as imagens carregam sob demanda.
  const uploadedRef = useRef({})
  const [loadingImages, setLoadingImages] = useState(null) // { done, total } ao abrir
  const pendingSaveRef = useRef(false) // pedido de novo save enquanto um já roda
  const pendingLazyRef = useRef(null) // manifesto de imagens a carregar sob demanda
  const lazyStartedRef = useRef(false) // garante que o lazy-load roda uma vez só
  const [apiReady, setApiReady] = useState(false) // Excalidraw API pronta (p/ addFiles)

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
    setDriveOwner(db.activeWorkspace()) // Drive do dono quando em workspace de outro
    // Reseta o estado por-projeto (caso o componente seja reaproveitado ao trocar de id).
    uploadedRef.current = {}
    seenFiles.current = new Set()
    pendingLazyRef.current = null
    lazyStartedRef.current = false
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
        // Imagens já presentes (embutidas OU no manifesto) não são reotimizadas.
        Object.keys(data.files || {}).forEach((k) => seenFiles.current.add(k))
        // Formato novo: as imagens ficam como arquivos SEPARADOS no Drive; o
        // scene.json só traz o manifesto (fileMeta). Popula o manifesto local e
        // agenda o carregamento sob demanda (após o editor montar).
        const fileMeta = data.fileMeta || {}
        for (const [fid, m] of Object.entries(fileMeta)) {
          uploadedRef.current[fid] = { driveFileId: m.driveFileId, mimeType: m.mimeType, created: m.created, bytes: m.bytes || 0 }
          seenFiles.current.add(fid)
        }
        pendingLazyRef.current = Object.keys(fileMeta).length ? fileMeta : null
        lastSaved.current = JSON.stringify(data.elements || [])
        setInitial({
          elements: data.elements || [],
          appState: { ...(data.appState || {}), collaborators: undefined },
          files: data.files || undefined, // imagens embutidas (formato antigo / fallback)
          scrollToContent: true,
        })
        maybeLazyLoad()
      } catch (e) {
        if (e?.code === 'local_mode') { setInitial({ elements: [], scrollToContent: true }); return } // DEV: sem Supabase → canvas vazio
        setError(e?.code === 'not_found' ? t('drawings.notFound') : e?.message || 'Erro')
        setInitial(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t])

  // Carrega SOB DEMANDA as imagens que estão como arquivos separados no Drive:
  // o quadro abre na hora (só a planta) e as imagens entram uma a uma, com
  // progresso — é isso que torna viável abrir projetos de centenas de MB.
  async function lazyLoadImages(meta) {
    const entries = Object.entries(meta)
    if (!entries.length) return
    setLoadingImages({ done: 0, total: entries.length })
    let done = 0
    for (const [fid, m] of entries) {
      try {
        const blob = await downloadBlob(m.driveFileId)
        const dataURL = await blobToDataUrl(blob)
        apiRef.current?.addFiles([{ id: fid, dataURL, mimeType: m.mimeType || blob.type, created: m.created || Date.now(), lastRetrieved: Date.now() }])
      } catch {
        /* imagem indisponível → segue as demais */
      }
      done += 1
      setLoadingImages({ done, total: entries.length })
    }
    setLoadingImages(null)
  }

  // Dispara o lazy-load só quando a API do Excalidraw já existe (addFiles) e há
  // manifesto pendente; roda uma única vez.
  function maybeLazyLoad() {
    if (lazyStartedRef.current || !pendingLazyRef.current || !apiRef.current) return
    lazyStartedRef.current = true
    const meta = pendingLazyRef.current
    pendingLazyRef.current = null
    lazyLoadImages(meta)
  }
  useEffect(() => {
    if (apiReady) maybeLazyLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady])

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
      // Serializa: se já há um save rodando (upload de imagens pode demorar),
      // marca para rodar de novo no fim, evitando corridas/uploads duplicados.
      if (savingRef.current) {
        pendingSaveRef.current = true
        return
      }
      savingRef.current = true
      setStatus('saving')
      try {
        const thumbnail = await makeThumbnail(elements, files)
        if (storageRef.current === 'drive' && driveFileRef.current) {
          const sizeBytes = await saveToDrive(elements, appState, files)
          await api.excalidraw.save(id, { sizeBytes, ...(thumbnail ? { thumbnail } : {}) })
        } else {
          const scene = { elements, appState: { viewBackgroundColor: appState?.viewBackgroundColor }, files }
          const sizeBytes = new Blob([JSON.stringify(scene)]).size
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
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false
          const l = latestRef.current
          if (l) doSave(l.elements, l.appState, l.files)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  // Salva um projeto do Drive no MODELO NOVO: imagens como arquivos separados +
  // scene.json enxuto (só elementos + manifesto). Sobe só imagens ainda não
  // enviadas; as que falharem ficam embutidas como fallback (sem perda) e são
  // retentadas no próximo save. Devolve o tamanho total aproximado (bytes).
  async function saveToDrive(elements, appState, files) {
    const referenced = new Set((elements || []).filter((e) => e.fileId && !e.isDeleted).map((e) => e.fileId))
    const embedFallback = {} // imagens ainda não subidas → embutidas p/ não perder
    let imagesBytes = 0
    for (const [fid, f] of Object.entries(files || {})) {
      if (!referenced.has(fid) || !f?.dataURL) continue // ignora órfãs
      if (uploadedRef.current[fid]) {
        imagesBytes += uploadedRef.current[fid].bytes || 0
        continue
      }
      try {
        const blob = await dataUrlToBlob(f.dataURL)
        const driveFileId = await uploadFile({ name: `img_${fid}`, mimeType: f.mimeType, blob, parentId: driveFolderRef.current })
        uploadedRef.current[fid] = { driveFileId, mimeType: f.mimeType, created: f.created, bytes: blob.size }
        imagesBytes += blob.size
      } catch {
        embedFallback[fid] = f // falhou → mantém embutida; tenta de novo depois
        imagesBytes += dataUrlBytes(f.dataURL)
      }
    }
    // Manifesto só das imagens ainda referenciadas e já no Drive.
    const fileMeta = {}
    for (const fid of referenced) {
      const m = uploadedRef.current[fid]
      if (m) fileMeta[fid] = { driveFileId: m.driveFileId, mimeType: m.mimeType, created: m.created, bytes: m.bytes }
    }
    const slim = {
      elements,
      appState: { viewBackgroundColor: appState?.viewBackgroundColor },
      fileMeta,
      files: Object.keys(embedFallback).length ? embedFallback : undefined,
    }
    const slimJson = JSON.stringify(slim)
    await updateFileContent(driveFileRef.current, new Blob([slimJson], { type: 'application/json' }), 'application/json')
    return new Blob([slimJson]).size + imagesBytes
  }

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
      if (!canEditScene) return // viewer: não salva nem otimiza
      optimizeNewImages(files)
      const sig = JSON.stringify(elements)
      if (sig === lastSaved.current) return
      dirtyRef.current = true
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => doSave(elements, appState, files), 1200)
    },
    [doSave, optimizeNewImages, canEditScene],
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
          readOnly={!canEditScene}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold text-slate-100 hover:border-slate-800 focus:border-cyan-500/50 focus:outline-none read-only:hover:border-transparent"
        />
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-500">
          {loadingImages ? (
            <>
              <Loader2 size={13} className="animate-spin text-cyan-400" /> {t('drawings.loadingImages', { done: loadingImages.done, total: loadingImages.total })}
            </>
          ) : optimizing ? (
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
        <button onClick={toggleFullscreen} title={fs ? t('drawings.exitFullscreen') : t('drawings.fullscreen')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-100">
          {fs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* Canvas ocupa todo o resto */}
      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(a) => {
            apiRef.current = a
            if (!apiReady) setApiReady(true)
            maybeLazyLoad()
          }}
          initialData={initial}
          onChange={onChange}
          langCode={appliedLang}
          viewModeEnabled={!canEditScene}
        >
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.ItemCustom>
              {/* stopPropagation p/ o dropdown nativo não fechar o menu do Excalidraw */}
              <label
                className="flex w-full items-center gap-2 text-sm"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span aria-hidden>🌐</span>
                <select
                  value={langCode}
                  onChange={(e) => setLangCode(e.target.value)}
                  aria-label={t('drawings.language')}
                  className="min-w-0 flex-1 cursor-pointer rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm"
                >
                  {langOptions.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            </MainMenu.ItemCustom>
          </MainMenu>
          <BoardWelcome />
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
