// ---------------------------------------------------------------------------
// Modo restrito (privacidade) — À PROVA DE DEVTOOLS.
//
// A versão antiga só aplicava blur via CSS: os números reais continuavam no
// HTML e bastava remover a classe no inspetor para revelar tudo. Agora, com o
// modo restrito ativo, os valores reais NEM SÃO RENDERIZADOS no DOM: textos
// viram "•••" e thumbnails/avatares viram um bloco com "?". Não existe CSS
// para remover — o dado simplesmente não está na página.
//
// Dois níveis:
//  - Global: o olho do header (vale para o site inteiro, persiste).
//  - Por página: o olho no canto superior direito de cada página sensível
//    (<PageEye/>) restringe SÓ aquela página, sem mexer no modo global.
// ---------------------------------------------------------------------------
import { createContext, useContext, useSyncExternalStore } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useI18n } from '../i18n'

const GLOBAL_KEY = 'noctis_privacy'
const PAGES_KEY = 'noctis_privacy_pages'

function readPages() {
  try {
    return JSON.parse(localStorage.getItem(PAGES_KEY) || '{}')
  } catch {
    return {}
  }
}

let state = { global: localStorage.getItem(GLOBAL_KEY) === '1', pages: readPages() }
const listeners = new Set()

function setState(next) {
  state = next
  // data-privacy segue existindo p/ o blur CSS (camada extra no modo global)
  document.documentElement.dataset.privacy = state.global ? '1' : '0'
  localStorage.setItem(GLOBAL_KEY, state.global ? '1' : '0')
  localStorage.setItem(PAGES_KEY, JSON.stringify(state.pages))
  listeners.forEach((l) => l())
}

export function togglePrivacyGlobal() {
  setState({ ...state, global: !state.global })
}

export function togglePrivacyPage(page) {
  setState({ ...state, pages: { ...state.pages, [page]: !state.pages[page] } })
}

function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function usePrivacy() {
  return useSyncExternalStore(subscribe, () => state)
}

// Escopo por página: envolva a raiz da página em <PrivacyScope page="...">
const ScopeCtx = createContext(null)

export function PrivacyScope({ page, children }) {
  return <ScopeCtx.Provider value={page}>{children}</ScopeCtx.Provider>
}

// true quando o modo restrito vale aqui (global OU somente desta página)
export function useRestricted() {
  const page = useContext(ScopeCtx)
  const { global, pages } = usePrivacy()
  return global || (page ? !!pages[page] : false)
}

// Olho da página (canto superior direito): restringe SÓ esta página
export function PageEye() {
  const page = useContext(ScopeCtx)
  const { global, pages } = usePrivacy()
  const { t } = useI18n()
  if (!page) return null
  const active = !!pages[page]
  const on = active || global
  return (
    <button
      onClick={() => togglePrivacyPage(page)}
      title={global ? t('privacy.globalActive') : active ? t('privacy.pageActive') : t('privacy.pageEnable')}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        on
          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
          : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
      }`}
    >
      {on ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  )
}

// Texto sensível: com modo restrito ativo o valor real NÃO entra no DOM
export function Masked({ children, mask = '•••••' }) {
  const restricted = useRestricted()
  if (!restricted) return children ?? null
  return <span className="select-none text-slate-500">{mask}</span>
}

// Thumbnail/imagem sensível: com modo restrito vira um bloco com "?" —
// a imagem não é nem carregada. `fallback` cobre o caso sem src.
export function RestrictedThumb({ src, alt = '', className = '', fallback = null, qClass = 'text-xl', ...imgProps }) {
  const restricted = useRestricted()
  if (restricted) {
    return (
      <div className={`flex items-center justify-center bg-slate-800/80 text-slate-500 ${className}`} title="Conteúdo restrito">
        <span className={`select-none font-bold ${qClass}`}>?</span>
      </div>
    )
  }
  if (!src) return fallback
  return <img src={src} alt={alt} className={className} {...imgProps} />
}
