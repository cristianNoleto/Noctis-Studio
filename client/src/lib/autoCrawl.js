// ---------------------------------------------------------------------------
// Descoberta automática de canais (EXCLUSIVO do fundador) — enche a base global
// niche_channels. Antes o loop vivia dentro da aba Admin > Descoberta e PARAVA
// ao sair da página. Agora vive aqui, num singleton fora do React: roda em
// segundo plano enquanto o site estiver aberto em QUALQUER página, controlado
// pelo toggle (setting autoCrawlOn). Continua client-driven (usa as chaves BYOK
// do fundador no navegador; a Vercel é serverless e não roda loop persistente).
// Os itens do log são guardados como DADOS (kind/term/n/text) e traduzidos na UI.
// ---------------------------------------------------------------------------
import { db } from './db'
import { api, apiErrorMessage } from './api'

const CRAWL_TERMS = [
  'histórias de terror', 'curiosidades', 'fatos históricos', 'motivação', 'mistérios', 'contos de guerra',
  'histórias bíblicas', 'frases de sabedoria', 'documentário', 'crimes reais', 'filosofia estoica', 'histórias reais',
  'lendas urbanas', 'casos assustadores', 'reflexão', 'histórias de vingança', 'ciência espacial', 'universo',
  'psicologia', 'desenvolvimento pessoal', 'dinheiro e finanças', 'histórias de sucesso', 'mitologia', 'egito antigo',
  'segunda guerra mundial', 'histórias do além', 'contos sombrios', 'meditação', 'sabedoria antiga', 'estoicismo',
  'true crime', 'scary stories', 'horror stories', 'creepypasta', 'space facts', 'history documentary',
  'motivation', 'stoic philosophy', 'bible stories', 'mystery', 'unsolved mysteries', 'ancient history',
  'psychology facts', 'science facts', 'sleep stories', 'reddit stories', 'money mindset', 'success stories',
  'ancient civilizations', 'greek mythology', 'dark history', 'war stories', 'true horror', 'paranormal',
  'facts', 'motivational speech', 'life lessons', 'philosophy', 'universe documentary', 'deep sleep',
  'terror', 'suspense', 'assombração', 'sobrenatural', 'histórias sombrias', 'contos de fadas sombrios',
]

function crawlDailyCount() {
  const d = db.getSetting('autoCrawlDaily')
  return d && d.date === new Date().toDateString() ? d.count || 0 : 0
}
export function hasCrawlKeys() {
  return (db.getSetting('ytKeys', []) || []).some(Boolean)
}

let state = {
  running: false,
  current: '',
  sessionAdded: 0,
  usedToday: crawlDailyCount(),
  cap: db.getSetting('autoCrawlCap', 300),
  error: '',
  log: [],
  stats: { total: 0, thisWeek: 0 },
}
const listeners = new Set()
let loopActive = false // guarda contra dois loops simultâneos
let termIdx = Math.floor(Math.random() * CRAWL_TERMS.length)

function set(patch) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}
export function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export function getState() {
  return state
}

function pushLog(entry) {
  const log = [{ id: Date.now() + Math.random(), ...entry }, ...state.log].slice(0, 40)
  set({ log })
}

async function refreshStats() {
  try {
    set({ stats: await api.channels.stats() })
  } catch {
    /* ignora */
  }
}
export const refreshCrawlStats = refreshStats

function bumpDaily() {
  const next = state.usedToday + 1
  db.setSetting('autoCrawlDaily', { date: new Date().toDateString(), count: next })
  set({ usedToday: next })
}

async function loop() {
  if (loopActive) return
  loopActive = true
  while (state.running) {
    if (state.usedToday >= state.cap) {
      pushLog({ kind: 'stop', capReached: state.cap })
      stopCrawl()
      break
    }
    const term = CRAWL_TERMS[termIdx % CRAWL_TERMS.length]
    termIdx += 1
    set({ current: term })
    try {
      const { results } = await api.youtube.searchChannels({ q: term })
      const n = results?.length || 0
      if (n) await api.channels.upsert(results)
      set({ sessionAdded: state.sessionAdded + n })
      bumpDaily()
      pushLog({ kind: 'ok', term, n })
      refreshStats()
    } catch (err) {
      pushLog({ kind: 'err', term, text: `"${term}" — ${apiErrorMessage(err)}` })
      if (err?.code === 'all_keys_exhausted' || err?.code === 'missing_yt_keys') {
        set({ error: apiErrorMessage(err) })
        stopCrawl()
        break
      }
    }
    await new Promise((r) => setTimeout(r, 4500))
  }
  loopActive = false
}

// Liga a busca. silent=true não zera o contador da sessão (retomada automática).
export function startCrawl(silent) {
  if (state.running) return
  if (!hasCrawlKeys()) return
  db.setSetting('autoCrawlOn', true)
  set({ running: true, error: '', ...(silent ? {} : { sessionAdded: 0 }) })
  refreshStats()
  loop()
}
export function stopCrawl() {
  db.setSetting('autoCrawlOn', false)
  set({ running: false, current: '' })
}
export function setCrawlCap(v) {
  const cap = Math.max(10, Math.min(2000, Number(v) || 10))
  db.setSetting('autoCrawlCap', cap)
  set({ cap })
}
// Retoma a busca no boot do app se o fundador a deixou ligada (roda em qualquer
// página). Chamado pelo runner global montado no Layout.
export function initAutoCrawl() {
  refreshStats()
  if (db.getSetting('autoCrawlOn', false) && hasCrawlKeys()) startCrawl(true)
}
