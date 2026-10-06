import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Chamada ao processo principal. Fora do Electron (ex.: `vite` no navegador) não há ponte.
export function call(canal, ...args) {
  if (!window.noctis) return Promise.reject(new Error('Abra pelo app Noctis Studio.'))
  return window.noctis.invoke(canal, ...args)
}

export function useEvent(evento, fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!window.noctis) return undefined
    return window.noctis.on(evento, (d) => ref.current(d))
  }, [evento])
}

// Configurações compartilhadas por todas as telas (atualizam ao salvar).
const SettingsCtx = createContext(null)
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null)
  useEffect(() => { call('settings:get').then(setSettings).catch(() => {}) }, [])
  useEvent('settings', setSettings)
  const save = useCallback(async (patch) => {
    const novo = await call('settings:set', patch)
    setSettings(novo)
    return novo
  }, [])
  return <SettingsCtx.Provider value={{ settings, save }}>{children}</SettingsCtx.Provider>
}
export const useSettings = () => useContext(SettingsCtx)

// Avisos rápidos no canto da tela.
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [list, setList] = useState([])
  const push = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setList((l) => [...l, { id, message, kind }])
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 6500 : 3800)
  }, [])
  const color = { info: 'border-slate-700', success: 'border-emerald-500/40', error: 'border-red-500/50', warn: 'border-amber-500/40' }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {list.map((t) => (
          <div key={t.id} className={`fade-up pointer-events-auto max-w-lg rounded-xl border ${color[t.kind] || color.info} bg-slate-900/95 px-4 py-2.5 text-sm text-slate-200 shadow-2xl shadow-black/50 backdrop-blur`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export const fmtTime = (s) => {
  s = Math.round(Number(s) || 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
