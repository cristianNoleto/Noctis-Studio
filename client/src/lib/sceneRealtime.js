import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { dataUrlBytes } from './imageOptimize'

// ---------------------------------------------------------------------------
// Colaboração AO VIVO do Excalidraw via Supabase Realtime (Broadcast + Presence).
// É uma CAMADA por cima do editor: se o Realtime falhar/estiver fora, o editor
// segue funcionando igual (carregar do banco/Drive + autosave). A persistência
// NÃO muda — isto só transporta as mudanças em tempo real entre quem está com o
// MESMO storyboard aberto.
//
// Conflito: cada elemento do Excalidraw tem `version`; na mesclagem vence o de
// maior version (mesmo modelo que o Excalidraw usa). Deleção viaja como o
// elemento com isDeleted=true e version maior — a mesclagem preserva.
// ---------------------------------------------------------------------------

const INLINE_FILE_MAX = 180 * 1024 // imagens até ~180 KB vão inline no tempo real
const PAYLOAD_MAX = 240 * 1024 // teto por mensagem do Realtime (~256 KB)

// Mescla os elementos remotos nos locais: por id, vence a maior `version`.
function reconcile(local, remote) {
  const byId = new Map((local || []).map((e) => [e.id, e]))
  for (const r of remote || []) {
    const l = byId.get(r.id)
    if (!l || (r.version || 0) >= (l.version || 0)) byId.set(r.id, r)
  }
  return [...byId.values()]
}

// Hook: entra na "sala" do storyboard, aplica o que chega e devolve broadcast().
//   sceneId  — id do storyboard (a sala é excalidraw:<sceneId>)
//   apiRef   — ref da API imperativa do Excalidraw (updateScene/addFiles/getSceneElements)
//   selfName — nome exibido na presença
//   enabled  — liga só quando faz sentido (produção, cena carregada)
// Retorna { peers, broadcast, applyingRef }.
export function useSceneRealtime({ sceneId, apiRef, selfName, enabled }) {
  const [peers, setPeers] = useState(1)
  const [connected, setConnected] = useState(false)
  const channelRef = useRef(null)
  const subscribedRef = useRef(false) // só envia depois de SUBSCRIBED (senão é descartado)
  const applyingRef = useRef(false) // true enquanto aplicamos algo remoto (não re-broadcasta)
  const pendingRef = useRef(null)
  const timerRef = useRef(null)
  const knownRef = useRef(new Map()) // id -> última version já enviada/aplicada (base do DELTA)

  // Só os elementos cuja version subiu desde a última vez (o que REALMENTE mudou).
  function diffChanged(elements) {
    const changed = []
    for (const e of elements || []) {
      if ((knownRef.current.get(e.id) ?? -1) < (e.version || 0)) changed.push(e)
    }
    return changed
  }
  function markKnown(list) {
    for (const e of list || []) knownRef.current.set(e.id, e.version || 0)
  }

  useEffect(() => {
    if (!enabled || !supabase || !sceneId) return
    let channel
    subscribedRef.current = false
    knownRef.current = new Map() // baseline recomeça a cada sala
    try {
      channel = supabase.channel(`excalidraw:${sceneId}`, {
        config: { broadcast: { self: false }, presence: { key: crypto.randomUUID() } },
      })
      channel.on('broadcast', { event: 'scene' }, ({ payload }) => {
        console.log('[realtime] rx', { els: payload?.elements?.length, files: payload?.files?.length })
        applyRemote(payload)
      })
      channel.on('presence', { event: 'sync' }, () => {
        try {
          setPeers(Math.max(1, Object.keys(channel.presenceState() || {}).length))
        } catch {
          /* ignora */
        }
      })
      channel.subscribe((status, err) => {
        console.log('[realtime] status', status, err || '')
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true
          setConnected(true)
          channel.track({ name: selfName || 'Alguém', at: Date.now() }).catch(() => {})
          // BASELINE: marca a cena atual como "já conhecida" — assim só transmitimos
          // o que MUDAR daqui pra frente (delta). O estado inicial o outro já tem do
          // banco/Drive ao abrir. NÃO enviamos a cena inteira (evita flood/estouro).
          try {
            const a = apiRef.current
            if (a) markKnown(a.getSceneElements())
          } catch {
            /* ignora */
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribedRef.current = false
          setConnected(false)
        }
      })
      channelRef.current = channel
    } catch (e) {
      console.log('[realtime] erro ao criar canal', e)
      /* Realtime indisponível → editor segue normal, sem tempo real */
    }
    return () => {
      clearTimeout(timerRef.current)
      subscribedRef.current = false
      setConnected(false)
      try {
        if (channel) supabase.removeChannel(channel)
      } catch {
        /* ignora */
      }
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, enabled])

  function applyRemote(payload) {
    const a = apiRef.current
    if (!a || !payload) return
    try {
      applyingRef.current = true
      if (Array.isArray(payload.files) && payload.files.length) {
        a.addFiles(payload.files.map((f) => ({ ...f, lastRetrieved: Date.now() })))
      }
      if (Array.isArray(payload.elements)) {
        a.updateScene({ elements: reconcile(a.getSceneElements(), payload.elements) })
        // Marca o que chegou como conhecido → o onChange disparado pelo updateScene
        // NÃO vê "mudança nova" e não re-transmite (quebra o eco na raiz).
        markKnown(payload.elements)
      }
    } catch {
      /* ignora */
    } finally {
      setTimeout(() => {
        applyingRef.current = false
      }, 0)
    }
  }

  // Envia SÓ o que mudou (delta), em blocos que cabem no limite da mensagem.
  function sendNow(elements, files) {
    const ch = channelRef.current
    if (!ch || !subscribedRef.current) return
    const changed = diffChanged(elements)
    if (!changed.length) return // nada novo → não envia (idle não gera tráfego)
    markKnown(changed)
    // Arquivos pequenos referenciados pelos elementos que mudaram (imagens novas).
    const filesById = {}
    if (files) {
      const refIds = new Set(changed.filter((e) => e.fileId && !e.isDeleted).map((e) => e.fileId))
      for (const id of refIds) {
        const f = files[id]
        if (f?.dataURL && dataUrlBytes(f.dataURL) < INLINE_FILE_MAX) filesById[id] = { id, dataURL: f.dataURL, mimeType: f.mimeType, created: f.created }
      }
    }
    // Quebra em blocos (~120 elementos ou até caber no teto) para não estourar.
    const CHUNK = 120
    for (let i = 0; i < changed.length; i += CHUNK) {
      const slice = changed.slice(i, i + CHUNK)
      const payload = { elements: slice }
      const fs = slice.map((e) => filesById[e.fileId]).filter(Boolean)
      if (fs.length && JSON.stringify({ elements: slice, files: fs }).length <= PAYLOAD_MAX) payload.files = fs
      try {
        ch.send({ type: 'broadcast', event: 'scene', payload })
      } catch (e) {
        console.log('[realtime] tx erro', e)
      }
    }
    console.log('[realtime] tx delta', { changed: changed.length })
  }

  // Throttle com "trailing": manda no máx. a cada 150 ms, mas sempre envia o
  // ÚLTIMO estado (não perde a última alteração).
  function broadcast(elements, files) {
    if (!channelRef.current) return
    pendingRef.current = { elements, files }
    if (timerRef.current) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const p = pendingRef.current
      pendingRef.current = null
      if (p) sendNow(p.elements, p.files)
    }, 150)
  }

  return { peers, connected, broadcast, applyingRef }
}
