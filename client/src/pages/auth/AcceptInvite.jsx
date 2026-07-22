import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Check } from 'lucide-react'
import AuthShell from './AuthShell'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../i18n'

// Tela de aceite do convite: o link do e-mail cria a sessão (Supabase detecta o
// token na URL) e aqui a pessoa define a senha da conta.
export default function AcceptInvite() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [status, setStatus] = useState('checking') // checking | ready | invalid
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setStatus('invalid')
      return
    }
    let done = false
    const apply = (session) => {
      if (done || !session) return
      done = true
      setEmail(session.user?.email || '')
      setStatus('ready')
    }
    supabase.auth.getSession().then(({ data }) => apply(data?.session))
    // O token do convite é processado de forma assíncrona ao carregar a página.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session))
    // Se em alguns segundos não houver sessão, o link é inválido/expirado.
    const timer = setTimeout(() => setStatus((s) => (s === 'checking' ? 'invalid' : s)), 4000)
    return () => {
      sub?.subscription?.unsubscribe?.()
      clearTimeout(timer)
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError(t('auth.invite.tooShort'))
    if (password !== confirm) return setError(t('auth.invite.mismatch'))
    setSubmitting(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
      setTimeout(() => navigate('/'), 1200)
    } catch {
      setError(t('auth.invite.fail'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500'

  return (
    <AuthShell>
      {status === 'checking' && (
        <div className="flex flex-col items-center py-10">
          <Loader2 size={26} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-400">{t('auth.invite.checking')}</p>
        </div>
      )}

      {status === 'invalid' && (
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100">{t('auth.invite.invalidTitle')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('auth.invite.invalidDesc')}</p>
          <Link to="/login" className="mt-6 inline-block rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
            {t('auth.invite.goLogin')}
          </Link>
        </div>
      )}

      {status === 'ready' && (
        <>
          <h1 className="text-2xl font-bold text-slate-100">{t('auth.invite.title')}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{t('auth.invite.subtitle')}</p>
          {email && <p className="mt-2 text-xs text-cyan-300">{email}</p>}

          {done ? (
            <div className="mt-8 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              <Check size={16} />
              {t('auth.invite.done')}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">{t('auth.invite.password')}</label>
                <div className="relative">
                  <input
                    className={`${inputCls} pr-10`}
                    type={show ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">{t('auth.invite.confirm')}</label>
                <input className={inputCls} type={show ? 'text' : 'password'} required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                {submitting && <Loader2 size={15} className="animate-spin" />}
                {t('auth.invite.submit')}
              </button>
            </form>
          )}
        </>
      )}
    </AuthShell>
  )
}
