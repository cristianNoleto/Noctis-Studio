import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import pt from './pt'
import en from './en'

const dictionaries = { pt, en }

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('dp_lang') || 'pt')

  const changeLang = useCallback((next) => {
    setLang(next)
    localStorage.setItem('dp_lang', next)
    document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en'
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
