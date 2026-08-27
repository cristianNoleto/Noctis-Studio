import { useEffect, useState } from 'react'

// True quando a tela é de celular/tablet estreito (abaixo do breakpoint lg do
// Tailwind = 1024px). Usa matchMedia e reage a resize/rotação.
export function useIsMobile(maxWidth = 1023.98) {
  const query = `(max-width: ${maxWidth}px)`
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    if (!window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}
