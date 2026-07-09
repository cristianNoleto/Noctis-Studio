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
  boardColumns: [],
  boardCards: [],
  checklistItems: [],
  referenceFolders: [],
  referenceChannels: [],
  promptCategories: [],
  prompts: [],
  transcriptions: [],
  nicheAnalyses: [],
  removedChannels: [],
  settings: {},
})

function seed(base) {
  const s = { ...emptyState(), ...base }
  if (s.boardColumns.length === 0) {
    s.boardColumns = [
      { id: crypto.randomUUID(), title: 'Ideias', color: '#22d3ee', position: 0 },
      { id: crypto.randomUUID(), title: 'Em Roteirização', color: '#f59e0b', position: 1 },
      { id: crypto.randomUUID(), title: 'Aprovados', color: '#22c55e', position: 2 },
      { id: crypto.randomUUID(), title: 'Publicados', color: '#38bdf8', position: 3 },
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
      { id: crypto.randomUUID(), name: 'Mistérios do Abismo', niche: 'Mistério/Terror', subs: 412000, removedAt: '2026-03-14', verified: true },
      { id: crypto.randomUUID(), name: 'War Files BR', niche: 'Guerra/História', subs: 890000, removedAt: '2026-01-28', verified: true },
      { id: crypto.randomUUID(), name: 'Dark Finanças', niche: 'Finanças', subs: 156000, removedAt: '2025-11-02', verified: false },
      { id: crypto.randomUUID(), name: 'Contos Sombrios', niche: 'Storytelling', subs: 2300000, removedAt: '2025-09-19', verified: true },
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
