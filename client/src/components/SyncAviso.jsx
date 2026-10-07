import { useEffect, useState } from 'react'

// Aviso discreto quando o salvamento na nuvem falha (antes falhava em silêncio e o item
// sumia no próximo carregamento). Some sozinho quando um envio dá certo.
export default function SyncAviso() {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    const fn = (e) => setMsg(e.detail?.estado === 'erro' ? e.detail.mensagem : null)
    window.addEventListener('noctis-sync', fn)
    return () => window.removeEventListener('noctis-sync', fn)
  }, [])
  if (!msg) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-slate-900/95 px-4 py-2.5 text-sm text-amber-200 shadow-2xl">
      {msg} Seus dados continuam guardados neste navegador.
    </div>
  )
}
