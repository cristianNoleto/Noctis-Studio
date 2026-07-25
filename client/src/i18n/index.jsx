import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import pt from './pt'
import en from './en'
import es from './es'

const dictionaries = { pt, en, es }

// Idiomas disponíveis (usado pelo seletor de idioma).
export const LANGUAGES = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

const I18nContext = createContext(null)

// Detecta o idioma inicial pelo navegador (sem geo-IP, respeitando privacidade):
//   fala português → pt · fala espanhol → es · qualquer outro → inglês.
// Assim o site já abre no idioma da pessoa e distribui melhor pelo mundo.
export function detectLang() {
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
  for (const l of prefs) {
    const code = String(l).toLowerCase()
    if (code.startsWith('pt')) return 'pt'
    if (code.startsWith('es')) return 'es'
    if (code.startsWith('en')) return 'en'
  }
  return 'en' // não fala pt/es/en → inglês como padrão global
}

const HTML_LANG = { pt: 'pt-BR', en: 'en', es: 'es' }

export function I18nProvider({ children }) {
  // Sem preferência salva → detecta pelo navegador (a escolha manual persiste).
  const [lang, setLang] = useState(() => localStorage.getItem('dp_lang') || detectLang())

  // Reflete o idioma atual no <html lang> (inclusive o detectado na 1ª visita).
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang] || 'pt-BR'
  }, [lang])

  const changeLang = useCallback((next) => {
    setLang(next)
    localStorage.setItem('dp_lang', next)
  }, [])

  const t = useCallback(
    (key, vars) => {
      let text = key.split('.').reduce((acc, part) => acc?.[part], dictionaries[lang])
      if (text == null) {
        text = key.split('.').reduce((acc, part) => acc?.[part], dictionaries.pt) ?? key
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, v)
        }
      }
      return text
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang: changeLang, t }), [lang, changeLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n deve ser usado dentro de <I18nProvider>')
  return ctx
}
