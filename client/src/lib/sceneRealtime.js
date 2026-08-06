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
const CURSOR_MS = 45 // throttle do cursor (~22 fps)
const CURSOR_TTL_MS = 8000 // some o cursor de quem parou de enviar

// Paleta de cores para os cursores dos colaboradores (escolhida pelo id da sessão).
const CURSOR_COLORS = ['#00b8d9', '#36b37e', '#ff5630', '#6554c0', '#ffab00', '#e91e8c', '#0065ff', '#57d9a3']
function colorFor(key) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const c = CURSOR_COLORS[h % CURSOR_COLORS.length]
  return { background: c, stroke: c }
}

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
export function useSceneRealtime({ sceneId, apiRef, selfName, enabled, onFileRef, canEdit = true }) {
  const [peers, setPeers] = useState(1)
  const [editors, setEditors] = useState(canEdit ? 1 : 0) // quantos podem EDITAR agora
  const [viewers, setViewers] = useState(canEdit ? 0 : 1) // quantos estão só VENDO
  const [connected, setConnected] = useState(false)
  const onFileRefRef = useRef(onFileRef)
  onFileRefRef.current = onFileRef
  const canEditRef = useRef(canEdit)
  canEditRef.current = canEdit
  const channelRef = useRef(null)
  const subscribedRef = useRef(false) // só envia depois de SUBSCRIBED (senão é descartado)
  const applyingRef = useRef(false) // true enquanto aplicamos algo remoto (não re-broadcasta)
  const pendingRef = useRef(null)
  const timerRef = useRef(null)
  const knownRef = useRef(new Map()) // id -> última version já enviada/aplicada (base do DELTA)
  const myKeyRef = useRef(null)
  if (!myKeyRef.current) myKeyRef.current = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  const myColorRef = useRef(colorFor(myKeyRef.current))
  const collabRef = useRef(new Map()) // key -> { at, collaborator } (cursores dos outros)
  const lastPointerRef = useRef(0)

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
        config: { broadcast: { self: false }, presence: { key: myKeyRef.current } },
      })
      channel.on('broadcast', { event: 'scene' }, ({ payload }) => applyRemote(payload))
      channel.on('broadcast', { event: 'pointer' }, ({ payload }) => applyPointer(payload))
      // Referência de imagem grande: o outro busca do Drive (não passa pelo Realtime).
      channel.on('broadcast', { event: 'fileref' }, ({ payload }) => {
        if (payload?.fid && payload?.driveFileId) onFileRefRef.current?.(payload.fid, payload.driveFileId, payload.mimeType)
      })
      channel.on('presence', { event: 'sync' }, () => {
        try {
          const state = channel.presenceState() || {}
          setPeers(Math.max(1, Object.keys(state).length))
          // Conta quantos EDITAM e quantos só VÊEM (papel vem no track de cada um).
          let ed = 0
          let vw = 0
          for (const metas of Object.values(state)) {
            const role = metas?.[0]?.role
            if (role === 'view') vw++
            else ed++
          }
          setEditors(ed)
          setViewers(vw)
          // Remove cursores de quem saiu da sala.
          for (const key of [...collabRef.current.keys()]) {
            if (!state[key]) collabRef.current.delete(key)
          }
          pushCollaborators()
        } catch {
          /* ignora */
        }
      })
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true
          setConnected(true)
          channel.track({ name: selfName || 'Alguém', at: Date.now(), role: canEditRef.current ? 'edit' : 'view' }).catch(() => {})
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
    } catch {
      /* Realtime indisponível → editor segue normal, sem tempo real */
    }
    // Some o cursor de quem parou de mexer (sem sair da sala).
    const prune = setInterval(() => {
      const now = Date.now()
      let changed = false
      for (const [key, v] of collabRef.current) {
        if (now - v.at > CURSOR_TTL_MS) {
          collabRef.current.delete(key)
          changed = true
        }
      }
      if (changed) pushCollaborators()
    }, 3000)
    return () => {
      clearTimeout(timerRef.current)
      clearInterval(prune)
      subscribedRef.current = false
      setConnected(false)
      collabRef.current.clear()
      try {
        pushCollaborators() // limpa os cursores no canvas ao sair
      } catch {
        /* ignora */
      }
      try {
        if (channel) supabase.removeChannel(channel)
      } catch {
        /* ignora */
      }
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, enabled])

  // Aplica o cursor recebido de outro colaborador (o Excalidraw desenha nativamente).
  function applyPointer(p) {
    if (!p || !p.key) return
    collabRef.current.set(p.key, {
      at: Date.now(),
      collaborator: {
        username: p.name || 'Alguém',
        pointer: { x: p.x, y: p.y },
        button: p.button === 'down' ? 'down' : 'up',
        color: p.color,
        selectedElementIds: p.sel || {},
      },
    })
    pushCollaborators()
  }

  // Empurra o mapa de colaboradores para o Excalidraw (ele renderiza os cursores).
  function pushCollaborators() {
    const a = apiRef.current
    if (!a?.updateScene) return
    const m = new Map()
    for (const [k, v] of collabRef.current) m.set(k, v.collaborator)
    try {
      a.updateScene({ collaborators: m })
    } catch {
      /* ignora */
    }
  }

  // Transmite a posição do MEU cursor (chamado pelo onPointerUpdate do Excalidraw).
  function onPointerUpdate(x, y, button, sel) {
    const ch = channelRef.current
    if (!ch || !subscribedRef.current) return
    const now = Date.now()
    if (now - lastPointerRef.current < CURSOR_MS) return
    lastPointerRef.current = now
    try {
      ch.send({
        type: 'broadcast',
        event: 'pointer',
        payload: { key: myKeyRef.current, name: selfName || 'Alguém', color: myColorRef.current, x, y, button, sel },
      })
    } catch {
      /* ignora */
    }
  }

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
      } catch {
        /* ignora */
      }
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

  // Avisa os outros que uma imagem grande foi para o Drive (eles buscam de lá).
  function broadcastFile(fid, driveFileId, mimeType) {
    const ch = channelRef.current
    if (!ch || !subscribedRef.current || !fid || !driveFileId) return
    try {
      ch.send({ type: 'broadcast', event: 'fileref', payload: { fid, driveFileId, mimeType } })
    } catch {
      /* ignora */
    }
  }

  return { peers, editors, viewers, connected, broadcast, onPointerUpdate, broadcastFile, applyingRef }
}
