import { useSyncExternalStore } from 'react'

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

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state))
  version++
  subscribers.forEach((fn) => fn())
}

export const db = {
  init(email) {
    const key = `noctis_data_${email}`
    if (storageKey === key && state) return
    storageKey = key
    let saved = null
    try {
      saved = JSON.parse(localStorage.getItem(key))
    } catch {
      saved = null
    }
    state = seed(saved || {})
    persist()
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
    const record = { id: crypto.randomUUID(), createdAt: Date.now(), ...row }
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
