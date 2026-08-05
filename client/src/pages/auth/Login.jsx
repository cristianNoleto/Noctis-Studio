import { useRef, useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff, X } from 'lucide-react'
import AuthShell from './AuthShell'
import GoogleButton from './GoogleButton'
import Captcha, { captchaEnabled } from '../../auth/Captcha'
import { useAuth } from '../../auth/AuthContext'
import { useI18n } from '../../i18n'

export default function Login() {
  const { t } = useI18n()
  const { signIn, signInWithGoogle, resetPassword, mfa, user, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const captchaRef = useRef(null)
  // Desafio 2FA (quando a conta tem app autenticador ativo)
  const [mfaFactorId, setMfaFactorId] = useState(null)
  const [mfaCode, setMfaCode] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password, captchaToken)
      // A conta exige 2FA? (aal1 → aal2)
      const aal = await mfa.aal()
      if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const factors = await mfa.factors()
        const verified = factors.find((f) => f.status === 'verified') || factors[0]
        if (verified) {
          setMfaFactorId(verified.id)
          setSubmitting(false)
          return
        }
      }
      navigate('/')
    } catch (err) {
      setError(t(err.message === 'invalid_credentials' ? 'auth.errors.invalidCredentials' : 'auth.errors.generic'))
      // Token do hCaptcha é de uso único: zera para a próxima tentativa.
      captchaRef.current?.resetCaptcha?.()
      setCaptchaToken('')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMfaVerify(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await mfa.verifyLogin(mfaFactorId, mfaCode.trim())
      navigate('/')
    } catch {
      setError(t('auth.errors.invalid2fa'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogle() {
    setError('')
    // Mostra o spinner e deixa o próprio redirect levar ao Google — NÃO navega
    // para '/', que renderizaria a landing por um instante (o flash).
    setRedirecting(true)
    try {
      await signInWithGoogle()
    } catch {
      setRedirecting(false)
      setError(t('auth.errors.generic'))
    }
  }

  // Tela de verificação em duas etapas (após senha correta)
  if (mfaFactorId) {
    return (
      <AuthShell>
        <h2 className="text-2xl font-bold text-slate-100">{t('auth.twoFactorTitle')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('auth.twoFactorSubtitle')}</p>
        <form onSubmit={handleMfaVerify} className="mt-6 space-y-4">
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-center text-2xl font-bold tracking-[0.4em] text-slate-100 placeholder:text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting || mfaCode.length < 6}
            className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60"
          >
            {submitting ? t('common.loading') : t('auth.verify')}
          </button>
          <button type="button" onClick={() => { setMfaFactorId(null); setMfaCode(''); setError('') }} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">
            {t('common.back')}
          </button>
        </form>
      </AuthShell>
    )
  }

  // Redirecionando para o Google: spinner em tela cheia (sem piscar a landing).
  if (redirecting) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
      </div>
    )
  }

  // Já logado? Não mostrar a tela de login (evita disparar um OAuth redundante
  // ao clicar no Google de novo, que "volta pro Google"). Vai direto pro app.
  if (!loading && user) return <Navigate to="/" replace />

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

        <Captcha ref={captchaRef} onToken={setCaptchaToken} />

        <button
          type="submit"
          disabled={submitting || (captchaEnabled && !captchaToken)}
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
      <p className="mt-2 flex justify-center gap-3 text-[11px] text-slate-600">
        <Link to="/privacidade" className="hover:text-cyan-400">{t('auth.privacy')}</Link>
        <span>·</span>
        <Link to="/termos" className="hover:text-cyan-400">{t('auth.terms')}</Link>
      </p>

      {recoveryOpen && <RecoveryModal onClose={() => setRecoveryOpen(false)} resetPassword={resetPassword} />}
    </AuthShell>
  )
}

function RecoveryModal({ onClose, resetPassword }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const captchaRef = useRef(null)

  async function handleSend(e) {
    e.preventDefault()
    try {
      await resetPassword(email, captchaToken)
      setSent(true)
    } catch {
      captchaRef.current?.resetCaptcha?.()
      setCaptchaToken('')
    }
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
            <Captcha ref={captchaRef} onToken={setCaptchaToken} />
            <button
              type="submit"
              disabled={captchaEnabled && !captchaToken}
              className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-60"
            >
              {t('auth.recoverySend')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
