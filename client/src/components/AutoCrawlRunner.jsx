import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { initAutoCrawl } from '../lib/autoCrawl'

// Runner global (montado no Layout): se o fundador deixou a busca automática
// ligada, retoma-a no boot e a mantém rodando em segundo plano em qualquer
// página, enquanto o site estiver aberto. Não renderiza nada.
export default function AutoCrawlRunner() {
  const { isFounder } = useAuth()
  useEffect(() => {
    if (isFounder) initAutoCrawl()
  }, [isFounder])
  return null
}
