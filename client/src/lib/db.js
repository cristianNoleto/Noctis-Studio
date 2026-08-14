import { useSyncExternalStore } from 'react'
import { api } from './api'

// ---------------------------------------------------------------------------
// Camada de dados local (localStorage) — modo local do Noctis Studio.
// Estrutura pensada para espelhar o schema SQL do Supabase: quando o backend
// real for plugado, cada coleção vira uma tabela e este módulo é trocado por
// chamadas à API mantendo a mesma interface.
// ---------------------------------------------------------------------------

let storageKey = null
let state = null
let version = 0
const subscribers = new Set()

// ---- Sincronização com o banco (Supabase, produção) --------------------------
// cloud: Supabase disponível. cloudActive: workspace já migrado → o banco é a
// fonte da verdade e cada save faz write-through. Coleções gerenciadas no banco:
let cloud = false
let cloudActive = false
let pushTimer = null
let selfEmail = null // e-mail do usuário logado
let activeOwner = null // dono do workspace ativo (null = próprio)
// Permissão no workspace ativo. No próprio, tudo 'edit'. Em workspace de outro
// dono, começa conservador ('view') e é atualizado pelo snapshot do servidor.
let activeAccess = { self: true, videos: 'edit', skills: 'edit', references: 'edit', board: 'edit', drawings: 'edit', channelAccess: null }
const MANAGED = [
  'channels', 'channelButtons', 'videos', 'scripts', 'seoReports', 'boardSpaces', 'boardColumns',
  'boardCards', 'checklistItems', 'referenceFolders', 'referenceChannels', 'promptCategories',
  'prompts', 'transcriptions', 'nicheAnalyses',
]
// Coleções com exclusão explícita/persistente no servidor (o migrate é upsert-only).
// O servidor valida a autoria: colaborador só apaga o que ele mesmo criou.
const CLOUD_DELETABLE = new Set([
  'channels', 'videos', 'referenceFolders', 'referenceChannels',
  'boardSpaces', 'boardColumns', 'boardCards', 'prompts', 'promptCategories',
])

const emptyState = () => ({
  channels: [],
  channelButtons: [],
  channelMembers: [],
  videos: [],
  scripts: [],
  seoReports: [],
  boardSpaces: [],
  boardColumns: [],
  boardCards: [],
  checklistItems: [],
  savedViralVideos: [],
  referenceFolders: [],
  referenceChannels: [],
  promptCategories: [],
  prompts: [],
  transcriptions: [],
  nicheAnalyses: [],
  removedChannels: [],
  platformUpdates: [],
  academyContent: [],
  settings: {},
})

function seed(base) {
  const s = { ...emptyState(), ...base }
  if (s.boardColumns.length === 0) {
    s.boardColumns = [
      { id: crypto.randomUUID(), title: 'Ideias', color: '#00f2fe', position: 0 },
      { id: crypto.randomUUID(), title: 'Em Roteirização', color: '#f59e0b', position: 1 },
      { id: crypto.randomUUID(), title: 'Aprovados', color: '#22c55e', position: 2 },
      { id: crypto.randomUUID(), title: 'Publicados', color: '#00b8cc', position: 3 },
    ]
  }
  if (s.promptCategories.length === 0) {
    s.promptCategories = [
      { id: crypto.randomUUID(), name: 'Áudio', position: 0 },
      { id: crypto.randomUUID(), name: 'Agente - Storyboarder', position: 1 },
      { id: crypto.randomUUID(), name: 'Replicador de Títulos', position: 2 },
      { id: crypto.randomUUID(), name: 'Validador de Títulos', position: 3 },
    ]
  }
  if (s.removedChannels.length === 0) {
    s.removedChannels = [
      { id: crypto.randomUUID(), name: 'Mistérios do Abismo', niche: 'True Crime', subs: 412000, videos: 113, removedAt: '2026-06-14', verified: true },
      { id: crypto.randomUUID(), name: 'War Files BR', niche: 'Military', subs: 890000, videos: 82, removedAt: '2026-05-28', verified: true },
      { id: crypto.randomUUID(), name: 'Dark Finanças', niche: 'Personal Finance', subs: 156000, videos: 31, removedAt: '2026-04-02', verified: false },
      { id: crypto.randomUUID(), name: 'Contos Sombrios', niche: 'Relationships', subs: 2300000, videos: 54, removedAt: '2026-02-19', verified: true },
      { id: crypto.randomUUID(), name: 'Bio Health Lab', niche: 'Self-Improvement', subs: 70300, videos: 19, removedAt: '2026-01-21', verified: false },
    ]
  }
  if (s.platformUpdates.length === 0) {
    const base = Date.now()
    s.platformUpdates = [
      {
        id: crypto.randomUUID(),
        tag: 'NOVO',
        title: 'Noctis Studio no ar',
        description:
          'Primeira versão da plataforma: gestão de canais completa, editor de roteiro com tempo de narração, quadro de ideias, biblioteca de prompts e referências.',
        createdAt: base - 2 * 86_400_000,
      },
      {
        id: crypto.randomUUID(),
        tag: 'NOVO',
        title: 'Tendências com dados reais',
        description:
          'Niche Finder, Vídeos Virais e Dobra de Nicho conectados à YouTube Data API com rotação automática de até 5 chaves e análises geradas por IA.',
        createdAt: base - 86_400_000,
      },
      {
        id: crypto.randomUUID(),
        tag: 'MELHORIA',
        title: 'Modo privado e tema claro',
        description: 'Use o olho no topo para esconder nomes e números (gravações de tela) e a lua para alternar o tema.',
        createdAt: base,
      },
    ]
  }
  if (s.academyContent.length === 0) {
    s.academyContent = [
      { id: crypto.randomUUID(), title: 'Primeiros passos no Noctis Studio', description: 'Tour completo pela plataforma: canais, pipeline de vídeos e roteiros.', embedUrl: '', position: 0 },
      { id: crypto.randomUUID(), title: 'Como usar tags e prompts recomendados', description: 'Monte sua biblioteca de prompts e vincule aos canais.', embedUrl: '', position: 1 },
      { id: crypto.randomUUID(), title: 'Dobra de nicho na prática', description: 'Do canal semente ao grafo: replicando formatos vencedores.', embedUrl: '', position: 2 },
      { id: crypto.randomUUID(), title: 'Rotação de chaves da YouTube API', description: 'Configure 5 chaves e nunca mais pare por cota estourada.', embedUrl: '', position: 3 },
    ]
  }
  return s
}

// Escreve só no cache local + notifia a UI (sem tocar no servidor).
function writeLocal() {
  localStorage.setItem(storageKey, JSON.stringify(state))
  version++
  subscribers.forEach((fn) => fn())
}

// Após migrado, cada mutação sobe o estado para o banco (debounce).
// Se estiver num workspace de outro dono (colaborador), grava lá (owner).
let pushPending = false // há mutação aguardando o debounce
let pushing = false // há um migrate em VOO agora
let pushDirty = false // mudou algo enquanto um migrate estava em voo

// Envia o estado ATUAL, SERIALIZADO: nunca há dois migrates concorrentes.
// Isso evita gravações fora de ordem (um push antigo chegando depois do novo e
// revertendo o valor). Se algo mudar durante o envio, reenvia ao terminar.
async function doPush(keepalive = false) {
  if (pushing) { pushDirty = true; return }
  pushing = true
  pushPending = false
  const owner = activeOwner || undefined
  try {
    await api.workspace.migrate(state, owner, keepalive)
  } catch {
    pushDirty = true // falhou → tenta de novo
  } finally {
    pushing = false
    if (pushDirty) { pushDirty = false; doPush() }
  }
}

function schedulePush() {
  clearTimeout(pushTimer)
  pushPending = true
  pushTimer = setTimeout(() => doPush(), 2500)
}

// Descarrega IMEDIATAMENTE (keepalive, p/ sobreviver ao refresh/fechamento).
// Sem isso, mutação + F5 rápido perdia a alteração (o push do debounce nunca
// disparava e o reload sobrescrevia o local com o snapshot do servidor).
function flushPush() {
  if (!pushPending && !pushing) return
  clearTimeout(pushTimer)
  doPush(true)
}
if (typeof window !== 'undefined') {
  // pagehide cobre refresh/navegação; visibilitychange(hidden) cobre troca de aba/app.
  window.addEventListener('pagehide', flushPush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPush()
  })
}

function persist() {
  writeLocal()
  if (cloud && cloudActive) schedulePush()
}

// Puxa o snapshot do workspace ativo; se já migrado, adota como fonte da verdade.
async function pullSnapshot() {
  const owner = activeOwner || undefined
  try {
    const { migrated, snapshot, access } = await api.workspace.snapshot(owner)
    if (owner !== (activeOwner || undefined)) return // trocou de workspace no meio
    if (access) {
      activeAccess = { self: !!access.self, videos: access.videos, skills: access.skills, references: access.references, board: access.board, drawings: access.drawings || 'none', channelAccess: access.channelAccess || null }
    }
    if (migrated && snapshot) {
      // Workspace de OUTRO dono (colaborador): o snapshot é a fonte da verdade
      // ABSOLUTA — inclusive coleções vazias (ex.: itens filtrados por
      // visibilidade "só eu" devem SUMIR do colaborador). No PRÓPRIO workspace
      // mantemos a trava anti-perda: snapshot vazio nunca apaga o local.
      const foreign = !!activeOwner
      for (const k of MANAGED) {
        if (Array.isArray(snapshot[k]) && (foreign || snapshot[k].length)) state[k] = snapshot[k]
      }
      cloudActive = true
      writeLocal()
    }
  } catch {
    /* sem conexão → segue no cache local */
  }
}

// Chave de cache: próprio workspace vs. de um colaborador (dono diferente).
function wsStorageKey() {
  return activeOwner ? `noctis_ws_${activeOwner}` : `noctis_data_${selfEmail}`
}

// Carrega o estado do workspace ativo (cache local) e puxa o snapshot.
function loadWorkspace() {
  storageKey = wsStorageKey()
  cloudActive = false
  clearTimeout(pushTimer)
  pushPending = false
  pushDirty = false
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(storageKey))
  } catch {
    saved = null
  }
  // Permissão conservadora até o snapshot confirmar (evita editar sem direito).
  activeAccess = activeOwner
    ? { self: false, videos: 'view', skills: 'view', references: 'view', board: 'view', drawings: 'view', channelAccess: null }
    : { self: true, videos: 'edit', skills: 'edit', references: 'edit', board: 'edit', drawings: 'edit', channelAccess: null }
  // Workspace de outro dono NÃO semeia coleções globais (o colaborador só
  // recebe vídeos/referências via snapshot).
  state = activeOwner ? { ...emptyState(), ...(saved || {}) } : seed(saved || {})
  writeLocal()
  if (cloud) pullSnapshot()
}

export const db = {
  init(email, opts = {}) {
    const first = selfEmail !== email
    selfEmail = email
    cloud = !!opts.cloud
    if (!first && state) return // já inicializado para este usuário
    try {
      activeOwner = localStorage.getItem(`noctis_active_ws_${email}`) || null
    } catch {
      activeOwner = null
    }
    if (activeOwner === email) activeOwner = null
    loadWorkspace()
  },
  // Estado da nuvem para a UI (botão de migração em Configurações).
  cloudStatus() {
    return { cloud, cloudActive }
  },
  // Workspace ativo (null = próprio) — usado pelo seletor de workspace.
  activeWorkspace() {
    return activeOwner
  },
  // Permissão no workspace ativo.
  access() {
    return activeAccess
  },
  // Pode editar a área ('videos' | 'skills' | 'references')? Dono sempre pode.
  // Para 'videos' com escopo por canal, o nível é POR CANAL: passe o channelId.
  canEdit(area, channelId) {
    if (activeAccess.self) return true
    if (area === 'videos' && activeAccess.channelAccess) {
      // Com escopo por canal, só edita os canais marcados como 'edit'. Sem
      // channelId (chamada genérica), permite se houver edição em algum canal.
      if (channelId) return activeAccess.channelAccess[channelId] === 'edit'
      return Object.values(activeAccess.channelAccess).includes('edit')
    }
    return activeAccess[area] === 'edit'
  },
  // Pode EXCLUIR este item? Precisa poder editar a área; o dono apaga qualquer
  // coisa; um colaborador editor só apaga o que ELE criou (createdBy = e-mail
  // dele). Itens sem createdBy (criados pelo dono ou antes do acesso) → só o dono.
  canDelete(area, record) {
    if (!this.canEdit(area, record?.channelId)) return false
    if (activeAccess.self) return true
    return !!record && !!record.createdBy && record.createdBy === selfEmail
  },
  // E-mail do usuário logado (autor das criações no workspace ativo).
  selfEmail() {
    return selfEmail
  },
  // Troca o workspace ativo (próprio ou de um dono que me deu acesso).
  switchWorkspace(owner) {
    const next = owner && owner !== selfEmail ? owner : null
    if (next === activeOwner) return
    flushPush() // sobe a mudança pendente do workspace ATUAL antes de trocar de dono
    activeOwner = next
    try {
      if (next) localStorage.setItem(`noctis_active_ws_${selfEmail}`, next)
      else localStorage.removeItem(`noctis_active_ws_${selfEmail}`)
    } catch {
      /* ignora */
    }
    loadWorkspace()
  },
  // Sobe TODO o estado local para o banco (botão "Migrar para a nuvem").
  async migrateToCloud() {
    const result = await api.workspace.migrate(state, activeOwner || undefined)
    cloudActive = true
    return result // { ok, owner, summary }
  },
  ready() {
    return state !== null
  },
  all(col) {
    return state?.[col] ?? []
  },
  get(col, id) {
    return this.all(col).find((r) => r.id === id) || null
  },
  insert(col, row) {
    // createdBy = quem está criando (o e-mail do workspace ativo). É a base da
    // exclusão por autor: no workspace de outro dono, um colaborador editor só
    // apaga o que ELE criou. Itens antigos sem createdBy = do dono.
    const record = { id: crypto.randomUUID(), createdAt: Date.now(), createdBy: selfEmail || undefined, ...row }
    state[col] = [...this.all(col), record]
    persist()
    return record
  },
  update(col, id, patch) {
    state[col] = this.all(col).map((r) => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r))
    persist()
    return this.get(col, id)
  },
  remove(col, id) {
    state[col] = this.all(col).filter((r) => r.id !== id)
    persist()
    // Exclusão PERSISTENTE no servidor (o migrate só faz upsert, nunca apaga).
    // O servidor valida a autoria. Filhos (roteiros, cards, refs…) caem por
    // CASCADE, então basta apagar a linha-pai. Fire-and-forget.
    if (cloud && cloudActive && CLOUD_DELETABLE.has(col)) {
      api.workspace.remove(col, id, activeOwner || undefined).catch(() => {})
    }
  },
  removeWhere(col, predicate) {
    state[col] = this.all(col).filter((r) => !predicate(r))
    persist()
  },
  getSetting(key, fallback = null) {
    return state?.settings?.[key] ?? fallback
  },
  setSetting(key, value) {
    state.settings = { ...state.settings, [key]: value }
    persist()
  },
  // ------ Backup (Configurações → Avançado) ------
  exportAll() {
    return { app: 'noctis-studio', version: 1, exportedAt: new Date().toISOString(), data: state }
  },
  importAll(payload) {
    if (!payload || payload.app !== 'noctis-studio' || !payload.data || typeof payload.data !== 'object') {
      throw new Error('invalid_backup')
    }
    // só aceita coleções conhecidas — ignora chaves estranhas do arquivo
    const clean = emptyState()
    for (const key of Object.keys(clean)) {
      if (key === 'settings') clean.settings = { ...(payload.data.settings || {}) }
      else if (Array.isArray(payload.data[key])) clean[key] = payload.data[key]
    }
    state = clean
    persist()
  },
  wipeAll() {
    state = seed({})
    persist()
  },
}

function subscribe(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

// Hook reativo: re-renderiza o componente a cada mutação do banco local.
export function useDb() {
  useSyncExternalStore(subscribe, () => version)
  return db
}
