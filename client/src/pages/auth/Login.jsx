import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, X } from 'lucide-react'
import AuthShell from './AuthShell'
import GoogleButton from './GoogleButton'
import { useAuth } from '../../auth/AuthContext'
import { useI18n } from '../../i18n'

export default function Login() {
  const { t } = useI18n()
  const { signIn, signInWithGoogle, resetPassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(t(err.message === 'invalid_credentials' ? 'auth.errors.invalidCredentials' : 'auth.errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogle() {
    setError('')
    try {
      await signInWithGoogle()
      navigate('/')
    } catch {
      setError(t('auth.errors.generic'))
    }
  }

  return (
    <AuthShell>
      <h2 className="text-2xl font-bold text-slate-100">{t('auth.loginTitle')}</h2>
      <p className="mt-1 text-sm text-slate-400">{t('auth.loginSubtitle')}</p>

      <GoogleButton onClick={handleGoogle} label={t('auth.continueWithGoogle')} />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-xs font-medium text-slate-500">{t('auth.or')}</span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-400">
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-400">
            {t('auth.password')}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-slate-400">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-500"
            />
            {t('auth.rememberMe')}
          </label>
          <button
            type="button"
            onClick={() => setRecoveryOpen(true)}
            className="font-medium text-cyan-400 hover:text-cyan-300"
          >
            {t('auth.forgotPassword')}
          </button>
        </div>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60"
        >
          {submitting ? t('common.loading') : t('auth.signIn')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-medium text-cyan-400 hover:text-cyan-300">
          {t('auth.createAccount')}
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-slate-600">{t('auth.legal')}</p>

      {recoveryOpen && <RecoveryModal onClose={() => setRecoveryOpen(false)} resetPassword={resetPassword} />}
    </AuthShell>
  )
}

function RecoveryModal({ onClose, resetPassword }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSend(e) {
    e.preventDefault()
    await resetPassword(email)
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-100">{t('auth.recoveryTitle')}</h3>
          <button onClick={onClose} aria-label={t('common.close')} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>
        {sent ? (
          <p className="text-sm text-green-400">{t('auth.recoverySent')}</p>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <p className="text-sm text-slate-400">{t('auth.recoveryDesc')}</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600"
            >
              {t('auth.recoverySend')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
