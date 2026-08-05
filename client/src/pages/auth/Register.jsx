import { useRef, useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import AuthShell from './AuthShell'
import GoogleButton from './GoogleButton'
import Captcha, { captchaEnabled } from '../../auth/Captcha'
import { useAuth } from '../../auth/AuthContext'
import { useI18n } from '../../i18n'

export default function Register() {
  const { t } = useI18n()
  const { signUp, signInWithGoogle, user, loading } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const captchaRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('auth.errors.passwordMismatch'))
      return
    }
    if (!acceptedTerms) {
      setError(t('auth.errors.termsRequired'))
      return
    }
    setSubmitting(true)
    try {
      const res = await signUp(name, email, password, captchaToken)
      // Confirmação de e-mail ligada? Mostra a tela de aviso em vez de cair na
      // landing (o usuário ainda não tem sessão até clicar no link do e-mail).
      if (res?.needsConfirmation) setAwaitingConfirm(true)
      else navigate('/')
    } catch {
      setError(t('auth.errors.generic'))
      captchaRef.current?.resetCaptcha?.()
      setCaptchaToken('')
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

  const inputClass =
    'w-full rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500'

  // Já logado? Vai direto pro app (evita re-disparar o OAuth do Google).
  if (!loading && user) return <Navigate to="/" replace />

  // Conta criada, aguardando o usuário confirmar o e-mail.
  if (awaitingConfirm) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
            <MailCheck size={28} />
          </div>
          <h2 className="text-2xl font-bold text-slate-100">{t('auth.confirmTitle')}</h2>
          <p className="mt-3 text-sm text-slate-400">{t('auth.confirmDesc', { email })}</p>
          <p className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-500">{t('auth.confirmSpam')}</p>
          <Link to="/login" className="mt-6 text-sm font-medium text-cyan-400 hover:text-cyan-300">
            {t('auth.confirmBackToLogin')}
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h2 className="text-2xl font-bold text-slate-100">{t('auth.registerTitle')}</h2>
      <p className="mt-1 text-sm text-slate-400">{t('auth.registerSubtitle')}</p>

      <GoogleButton onClick={handleGoogle} label={t('auth.continueWithGoogle')} />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-xs font-medium text-slate-500">{t('auth.or')}</span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-400">
            {t('auth.name')}
          </label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

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
            className={inputClass}
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-10`}
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

        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-400">
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-500"
          />
          {t('auth.acceptTerms')}
        </label>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

        <Captcha ref={captchaRef} onToken={setCaptchaToken} />

        <button
          type="submit"
          disabled={submitting || (captchaEnabled && !captchaToken)}
          className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60"
        >
          {submitting ? t('common.loading') : t('auth.signUp')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthShell>
  )
}
