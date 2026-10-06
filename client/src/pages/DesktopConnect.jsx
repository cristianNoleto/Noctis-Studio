import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Monitor, Link2, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { btnGhost, btnPrimary } from '../components/ui'

// Conecta o Noctis Studio Desktop a esta conta. O programa abre esta página com
// ?porta=<porta local>&estado=<aleatório>. Ao confirmar, o servidor gera uma
// credencial de uso único e o navegador volta para o programa
// (http://127.0.0.1:<porta>/callback), que abre a sessão PRÓPRIA dele.
export const AFTER_LOGIN_KEY = 'noctis_after_login'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export default function DesktopConnect() {
  const { t } = useI18n()
  const { user, loading, getAccessToken } = useAuth()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const porta = Number(params.get('porta'))
  const estado = params.get('estado') || ''
  const valid = Number.isInteger(porta) && porta >= 1024 && porta <= 65535 && /^[a-f0-9]{16,128}$/i.test(estado)

  if (loading) return null
  if (!user) {
    // Volta pra cá depois do login (senha ou Google).
    try { sessionStorage.setItem(AFTER_LOGIN_KEY, `${window.location.pathname}${window.location.search}`) } catch { /* sem storage */ }
    return <Navigate to="/login" replace />
  }

  async function connect() {
    setBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/desktop/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`)
      const q = new URLSearchParams({ estado, token_hash: data.token_hash, url: supabaseUrl, key: supabaseKey })
      window.location.href = `http://127.0.0.1:${porta}/callback?${q}`
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-6 flex max-w-md flex-col items-center rounded-2xl border border-cyan-500/20 bg-slate-900/50 p-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-400">
        <Monitor size={28} />
      </div>
      <h1 className="text-xl font-bold text-slate-100">{t('desktopApp.connect.title')}</h1>
      {valid ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('desktopApp.connect.body')}</p>
          <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-200">{user.email}</p>
          <div className="mt-5 flex w-full gap-2">
            <button onClick={() => window.close()} className={`${btnGhost} flex-1`}>{t('desktopApp.connect.cancel')}</button>
            <button onClick={connect} disabled={busy} className={`${btnPrimary} inline-flex flex-1 items-center justify-center gap-2`}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
              {t('desktopApp.connect.confirm')}
            </button>
          </div>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          <p className="mt-5 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck size={12} /> {t('desktopApp.connect.safe')}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-400">{t('desktopApp.connect.invalid')}</p>
      )}
    </div>
  )
}
