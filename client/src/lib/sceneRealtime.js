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
  const channelRef = useRef(null)
  const applyingRef = useRef(false) // true enquanto aplicamos algo remoto (não re-broadcasta)
  const pendingRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!enabled || !supabase || !sceneId) return
    let channel
    try {
      channel = supabase.channel(`excalidraw:${sceneId}`, {
        config: { broadcast: { self: false }, presence: { key: crypto.randomUUID() } },
      })
      channel.on('broadcast', { event: 'scene' }, ({ payload }) => applyRemote(payload))
      channel.on('presence', { event: 'sync' }, () => {
        try {
          setPeers(Math.max(1, Object.keys(channel.presenceState() || {}).length))
        } catch {
          /* ignora */
        }
      })
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') channel.track({ name: selfName || 'Alguém', at: Date.now() }).catch(() => {})
      })
      channelRef.current = channel
    } catch {
      /* Realtime indisponível → editor segue normal, sem tempo real */
    }
    return () => {
      clearTimeout(timerRef.current)
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
      }
    } catch {
      /* ignora */
    } finally {
      // Libera no próximo tick: o onChange disparado pelo updateScene acima NÃO
      // deve re-broadcastar (senão vira eco infinito).
      setTimeout(() => {
        applyingRef.current = false
      }, 0)
    }
  }

  function sendNow(elements, files) {
    const ch = channelRef.current
    if (!ch) return
    try {
      const payload = { elements }
      if (files) {
        const referenced = new Set((elements || []).filter((e) => e.fileId && !e.isDeleted).map((e) => e.fileId))
        const small = []
        for (const [id, f] of Object.entries(files)) {
          if (referenced.has(id) && f?.dataURL && dataUrlBytes(f.dataURL) < INLINE_FILE_MAX) {
            small.push({ id, dataURL: f.dataURL, mimeType: f.mimeType, created: f.created })
          }
        }
        if (small.length) payload.files = small
      }
      // Se estourar o teto da mensagem, manda só os elementos (as imagens grandes
      // aparecem pro outro no reload, via Drive) — não perde nem trava.
      if (JSON.stringify(payload).length > PAYLOAD_MAX) delete payload.files
      ch.send({ type: 'broadcast', event: 'scene', payload })
    } catch {
      /* ignora */
    }
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

  return { peers, broadcast, applyingRef }
}
