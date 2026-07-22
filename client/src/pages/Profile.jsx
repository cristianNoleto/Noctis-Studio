import { useState, useEffect } from 'react'
import { User, Shield, ShieldCheck, KeyRound, SlidersHorizontal, Wrench, Eye, EyeOff, Check, Camera, DownloadCloud, UploadCloud, AlertTriangle, Loader2, X, Plug, Cloud } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
import { api } from '../lib/api'
import { inputCls, btnPrimary, btnGhost, ConfirmDialog } from '../components/ui'
import { downloadFile } from '../lib/text'
import { pushUserSettings } from '../lib/userSettings'
import { Field } from './channels/ChannelsList'
import { useI18n } from '../i18n'

// Abas do original: Perfil | Segurança | APIs | Preferências | Avançado
const TABS = [
  ['profile', User],
  ['security', Shield],
  ['apis', KeyRound],
  ['prefs', SlidersHorizontal],
  ['advanced', Wrench],
]

export default function Profile() {
  const { t } = useI18n()
  const [tab, setTab] = useState('profile')

  return (
    <div className="mx-auto max-w-[1040px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('profile.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('profile.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([key, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Icon size={15} />
            {t(`profile.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'apis' && <ApisTab />}
      {tab === 'prefs' && <PrefsTab />}
      {tab === 'advanced' && <AdvancedTab />}
    </div>
  )
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      {title && <h2 className="font-semibold text-slate-100">{title}</h2>}
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className={title ? 'mt-5' : ''}>{children}</div>
    </div>
  )
}

function SavedFlash({ show }) {
  const { t } = useI18n()
  if (!show) return null
  return (
    <span className="flex items-center gap-1 text-xs text-green-400">
      <Check size={13} />
      {t('profile.saved')}
    </span>
  )
}

// ---------------------------------------------------------------------------
function ProfileTab() {
  const { user, isAdmin } = useAuth()
  const db = useDb()
  const { t } = useI18n()
  const [name, setName] = useState(db.getSetting('displayName', user?.name || ''))
  const [saved, setSaved] = useState(false)
  const avatarDataUrl = db.getSetting('avatarDataUrl')

  function save(e) {
    e.preventDefault()
    db.setSetting('displayName', name)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Redimensiona para 128px e salva como dataURL no dispositivo
  function handlePhoto(file) {
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 256
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      const min = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size)
      db.setSetting('avatarDataUrl', canvas.toDataURL('image/jpeg', 0.85))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <Card title={t('profile.prof.cardTitle')}>
      <form onSubmit={save} className="space-y-4">
        {/* Avatar com ícone de câmera, como no original */}
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <label className="group relative cursor-pointer">
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt="" className="h-20 w-20 rounded-full border border-slate-700 object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-2xl font-bold text-slate-950">
                {(name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition-colors group-hover:border-cyan-500/60 group-hover:text-cyan-400">
              <Camera size={13} />
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
          </label>
          {isAdmin && (
            <span className="rounded border border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-red-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">
              {t('profile.prof.founder')}
            </span>
          )}
          <p className="text-xs text-slate-500">{t('profile.prof.photoHint')}</p>
          <p className="text-[10px] text-slate-600">
            {t('profile.prof.formats')}
            <br />
            {t('profile.prof.compressNote')}
          </p>
          {avatarDataUrl && (
            <button type="button" onClick={() => db.setSetting('avatarDataUrl', null)} className="text-[11px] text-red-400 hover:underline">
              {t('profile.prof.removePhoto')}
            </button>
          )}
        </div>
        <Field label={t('profile.prof.name')}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('profile.prof.email')}>
          <input className={`${inputCls} opacity-60`} value={user?.email || ''} disabled />
          <p className="mt-1 text-[10px] text-slate-600">{t('profile.prof.emailLocked')}</p>
        </Field>
        <div className="flex items-center justify-end gap-3">
          <SavedFlash show={saved} />
          <button type="submit" className={btnPrimary}>
            {t('profile.prof.save')}
          </button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.16 7.16 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  )
}

function SecurityTab() {
  const { t } = useI18n()
  const { user, isLocalMode, updatePassword, updateEmail, linkGoogle, unlinkIdentity, refreshUser } = useAuth()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwMsg, setPwMsg] = useState(null) // { ok, text }
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState(null)
  const [linkMsg, setLinkMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const identities = user?.identities || []
  const googleIdentity = identities.find((i) => i.provider === 'google')
  const emailIdentity = identities.find((i) => i.provider === 'email')

  async function changePassword(e) {
    e.preventDefault()
    if (isLocalMode) {
      setPwMsg({ ok: false, text: t('profile.sec.localPw') })
      return
    }
    if (next.length < 6) return setPwMsg({ ok: false, text: t('profile.sec.pwMin') })
    if (next !== confirm) return setPwMsg({ ok: false, text: t('profile.sec.pwMismatch') })
    setBusy(true)
    try {
      await updatePassword(next)
      setPwMsg({ ok: true, text: t('profile.sec.pwOk') })
      setNext('')
      setConfirm('')
    } catch (err) {
      setPwMsg({ ok: false, text: err?.message || t('profile.sec.pwFail') })
    } finally {
      setBusy(false)
    }
  }

  async function changeEmail(e) {
    e.preventDefault()
    if (isLocalMode) {
      setEmailMsg({ ok: false, text: t('profile.sec.localEmail') })
      return
    }
    setBusy(true)
    try {
      await updateEmail(newEmail.trim())
      setEmailMsg({ ok: true, text: t('profile.sec.emailOk') })
      setNewEmail('')
    } catch (err) {
      setEmailMsg({ ok: false, text: err?.message || t('profile.sec.emailFail') })
    } finally {
      setBusy(false)
    }
  }

  async function handleLinkGoogle() {
    if (isLocalMode) {
      setLinkMsg({ ok: false, text: t('profile.sec.localLink') })
      return
    }
    setBusy(true)
    try {
      await linkGoogle() // redireciona para o Google e volta para /perfil
    } catch (err) {
      setLinkMsg({
        ok: false,
        text: err?.message?.includes('Manual linking')
          ? t('profile.sec.linkManual')
          : err?.message || t('profile.sec.linkFail'),
      })
      setBusy(false)
    }
  }

  async function handleUnlinkGoogle() {
    setBusy(true)
    setLinkMsg(null)
    try {
      await unlinkIdentity(googleIdentity.raw)
      await refreshUser()
      setLinkMsg({ ok: true, text: t('profile.sec.unlinkOk') })
    } catch (err) {
      setLinkMsg({ ok: false, text: err?.message || t('profile.sec.unlinkFail') })
    } finally {
      setBusy(false)
    }
  }

  const Msg = ({ msg }) => (msg ? <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-amber-400'}`}>{msg.text}</p> : null)

  return (
    <div className="space-y-4">
      {/* Contas conectadas: e-mail principal + Google (pode ter e-mail diferente) */}
      <Card
        title={t('profile.sec.connectedTitle')}
        subtitle={t('profile.sec.connectedSub')}
      >
        <div className="space-y-2.5">
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">@</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200">{t('profile.sec.mainEmail')}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <span className="shrink-0 rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
              {isLocalMode || emailIdentity || !identities.length ? t('profile.sec.active') : t('profile.sec.viaGoogle')}
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-800 p-3">
            <GoogleIcon />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200">{t('profile.sec.googleAccount')}</p>
              <p className="truncate text-xs text-slate-500">{googleIdentity ? googleIdentity.email || t('profile.sec.googleLinkedFallback') : t('profile.sec.googleHint')}</p>
            </div>
            {googleIdentity ? (
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">{t('profile.sec.linked')}</span>
                {identities.length > 1 && (
                  <button onClick={handleUnlinkGoogle} disabled={busy} className="text-xs text-red-400 hover:underline disabled:opacity-50">
                    {t('profile.sec.unlink')}
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={busy}
                className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50"
              >
                {t('profile.sec.linkGoogle')}
              </button>
            )}
          </div>
          <Msg msg={linkMsg} />
        </div>
      </Card>

      {/* Trocar e-mail principal */}
      <Card title={t('profile.sec.changeEmailTitle')} subtitle={t('profile.sec.changeEmailSub')}>
        <form onSubmit={changeEmail} className="space-y-3">
          <Field label={t('profile.sec.newEmail')}>
            <input className={inputCls} type="email" required placeholder={t('profile.sec.newEmailPlaceholder')} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </Field>
          <Msg msg={emailMsg} />
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={`${btnPrimary} disabled:opacity-50`}>
              {t('profile.sec.changeEmailBtn')}
            </button>
          </div>
        </form>
      </Card>

      {/* Alterar senha */}
      <Card title={t('profile.sec.changePwTitle')}>
        <form onSubmit={changePassword} className="space-y-4">
          <Field label={t('profile.sec.newPw')}>
            <input className={inputCls} type="password" minLength={6} required value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label={t('profile.sec.confirmPw')}>
            <input className={inputCls} type="password" minLength={6} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Msg msg={pwMsg} />
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={`${btnPrimary} disabled:opacity-50`}>
              {t('profile.sec.updatePwBtn')}
            </button>
          </div>
        </form>
      </Card>

      {/* Verificação em duas etapas (2FA) */}
      <TwoFactorCard isLocalMode={isLocalMode} />
    </div>
  )
}

// Card de 2FA — app autenticador (TOTP, nativo do Supabase, grátis).
function TwoFactorCard({ isLocalMode }) {
  const { t } = useI18n()
  const { mfa } = useAuth()
  const [factors, setFactors] = useState([])
  const [enrolling, setEnrolling] = useState(null) // { id, qr, secret }
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)

  async function load() {
    try {
      setFactors(await mfa.factors())
    } catch {
      /* ignora */
    }
  }
  useEffect(() => {
    if (!isLocalMode) load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = factors.find((f) => f.status === 'verified')

  async function startEnroll() {
    setMsg(null)
    setBusy(true)
    try {
      const d = await mfa.enroll()
      setEnrolling({ id: d.id, qr: d.totp.qr_code, secret: d.totp.secret })
      setCode('')
    } catch (e) {
      setMsg({ ok: false, text: e?.message || t('profile.twofa.startFail') })
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnroll(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await mfa.activate(enrolling.id, code.trim())
      setEnrolling(null)
      setMsg({ ok: true, text: t('profile.twofa.activatedOk') })
      await load()
    } catch {
      setMsg({ ok: false, text: t('profile.twofa.invalidCode') })
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setMsg(null)
    try {
      await mfa.disable(active.id)
      setMsg({ ok: true, text: t('profile.twofa.disabledOk') })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: e?.message || t('profile.twofa.disableFail') })
    } finally {
      setBusy(false)
    }
  }

  const Msg = ({ msg }) => (msg ? <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-amber-400'}`}>{msg.text}</p> : null)

  return (
    <Card title={t('profile.twofa.title')} subtitle={t('profile.twofa.sub')}>
      {isLocalMode ? (
        <p className="text-xs text-amber-400">{t('profile.twofa.local')}</p>
      ) : active ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5">
            <ShieldCheck size={16} className="text-green-400" />
            <p className="flex-1 text-sm text-green-300">{t('profile.twofa.activeMsg')}</p>
          </div>
          <Msg msg={msg} />
          <button onClick={() => setConfirmOff(true)} disabled={busy} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50">
            {t('profile.twofa.disableBtn')}
          </button>
        </div>
      ) : enrolling ? (
        <form onSubmit={confirmEnroll} className="space-y-3">
          <p className="text-xs text-slate-400">{t('profile.twofa.enrollSteps')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <img src={enrolling.qr} alt="QR code 2FA" className="h-40 w-40 rounded-lg border border-slate-800 bg-white p-1" />
            <div className="text-xs text-slate-500">
              <p className="mb-1 font-semibold text-slate-400">{t('profile.twofa.manualCode')}</p>
              <code className="break-all rounded bg-slate-950 px-2 py-1 text-[11px] text-cyan-300">{enrolling.secret}</code>
            </div>
          </div>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={`${inputCls} max-w-[180px] text-center text-lg font-bold tracking-[0.3em]`}
          />
          <Msg msg={msg} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || code.length < 6} className={`${btnPrimary} disabled:opacity-50`}>
              {t('profile.twofa.activateBtn')}
            </button>
            <button type="button" onClick={() => { setEnrolling(null); setMsg(null) }} className={btnGhost}>
              {t('profile.twofa.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <Msg msg={msg} />
          <button onClick={startEnroll} disabled={busy} className={`${btnPrimary} flex items-center gap-2 disabled:opacity-50`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
            {t('profile.twofa.startBtn')}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={disable}
        title={t('profile.twofa.confirmTitle')}
        message={t('profile.twofa.confirmMsg')}
        confirmLabel={t('profile.twofa.confirmLabel')}
      />
    </Card>
  )
}

// Botão de teste reutilizável — persiste as chaves atuais e roda a validação.
// Se o resultado trouxer `details` (ex.: cada chave do YouTube), mostra um a um.
function TestButton({ label, persist, run }) {
  const { t } = useI18n()
  const [state, setState] = useState('idle') // idle | loading | ok | fail
  const [msg, setMsg] = useState('')
  const [details, setDetails] = useState(null)
  async function handle() {
    setState('loading')
    setMsg('')
    setDetails(null)
    try {
      persist?.()
      const r = await run()
      setDetails(Array.isArray(r?.details) ? r.details : null)
      if (r?.ok) {
        setState('ok')
        setMsg(r.message || t('profile.apis.ok'))
      } else {
        setState('fail')
        setMsg(r?.message || t('profile.apis.failed'))
      }
    } catch (e) {
      setState('fail')
      setMsg(e?.message || t('profile.apis.failed'))
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handle}
          disabled={state === 'loading'}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
        >
          {state === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
          {label}
        </button>
        {state === 'ok' && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-400">
            <Check size={13} />
            {msg}
          </span>
        )}
        {state === 'fail' && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-400">
            <X size={13} />
            {msg}
          </span>
        )}
      </div>
      {details && details.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {details.map((d, i) => (
            <span
              key={i}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                d.ok ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              {d.ok ? <Check size={11} /> : <X size={11} />}
              {d.label}
              {d.message && d.message !== 'OK' ? ` — ${d.message}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ApisTab() {
  const { t } = useI18n()
  const db = useDb()
  const [ytKeys, setYtKeys] = useState(() => {
    const saved = db.getSetting('ytKeys', [])
    return Array.from({ length: 5 }, (_, i) => saved[i] || '')
  })
  const [geminiKey, setGeminiKey] = useState(db.getSetting('geminiKey', ''))
  const [geminiModel, setGeminiModel] = useState(db.getSetting('geminiModel', 'auto'))
  const [aiProvider, setAiProvider] = useState(db.getSetting('aiProvider', 'gemini'))
  const [groqKey, setGroqKey] = useState(db.getSetting('groqKey', ''))
  const [assemblyKey, setAssemblyKey] = useState(db.getSetting('assemblyKey', ''))
  const [pexelsKey, setPexelsKey] = useState(db.getSetting('pexelsKey', ''))
  const [pixabayKey, setPixabayKey] = useState(db.getSetting('pixabayKey', ''))
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)
  const [geminiModels, setGeminiModels] = useState([])

  // Persiste as chaves atuais (usado ao salvar E antes de cada teste)
  function persist() {
    db.setSetting('ytKeys', ytKeys.map((k) => k.trim()))
    db.setSetting('geminiKey', geminiKey.trim())
    db.setSetting('geminiModel', geminiModel)
    db.setSetting('aiProvider', aiProvider)
    db.setSetting('groqKey', groqKey.trim())
    db.setSetting('assemblyKey', assemblyKey.trim())
    db.setSetting('pexelsKey', pexelsKey.trim())
    db.setSetting('pixabayKey', pixabayKey.trim())
  }

  function save() {
    persist()
    // Sobe as chaves para o servidor (persistem entre navegadores). Silencioso.
    pushUserSettings().catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Carrega os modelos Gemini disponíveis para a chave (alimenta o seletor).
  async function loadModels() {
    if (!geminiKey.trim()) return setGeminiModels([])
    persist()
    try {
      const { models } = await api.ai.geminiModels()
      setGeminiModels(models || [])
    } catch {
      setGeminiModels([])
    }
  }
  useEffect(() => {
    loadModels()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const keyInput = (value, onChange, placeholder) => (
    <div className="relative">
      <input
        className={`${inputCls} pr-10 font-mono text-xs`}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
        <p className="text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: t('profile.apis.byokNote') }} />
        <button onClick={() => setShow((v) => !v)} className="ml-3 shrink-0 text-slate-400 hover:text-slate-200" title={show ? t('profile.apis.hideKeys') : t('profile.apis.showKeys')}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <Card
        title={t('profile.apis.ytTitle')}
        subtitle={t('profile.apis.ytSub')}
      >
        <div className="space-y-3">
          {ytKeys.map((key, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">{t('profile.apis.key')} {i + 1}</span>
              {keyInput(key, (e) => setYtKeys((ks) => ks.map((k, idx) => (idx === i ? e.target.value : k))), 'AIza...')}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-600">
          {t('profile.apis.ytFooter')}
        </p>
        <div className="mt-3">
          <TestButton label={t('profile.apis.testYoutube')} persist={persist} run={() => api.youtube.test()} />
        </div>
      </Card>

      <Card title={t('profile.apis.aiTitle')} subtitle={t('profile.apis.aiSub')}>
        <div className="space-y-4">
          <Field label={t('profile.apis.mainProvider')}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                ['gemini', t('profile.apis.geminiName'), t('profile.apis.geminiHint')],
                ['groq', t('profile.apis.groqName'), t('profile.apis.groqHint')],
              ].map(([value, name, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAiProvider(value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    aiProvider === value ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-200">{name}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>
                </button>
              ))}
            </div>
          </Field>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-300/80" dangerouslySetInnerHTML={{ __html: t('profile.apis.autoNote') }} />

          <Field label={t('profile.apis.geminiModel')}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGeminiModel('auto')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  geminiModel === 'auto' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                {t('profile.apis.autoModel')}
              </button>
              {geminiModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGeminiModel(m)}
                  className={`rounded-lg border px-3 py-2 font-mono text-xs transition-colors ${
                    geminiModel === m ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {m}
                </button>
              ))}
              <button type="button" onClick={loadModels} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400 hover:border-slate-700">
                {t('profile.apis.reload')}
              </button>
            </div>
            {geminiModels.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-500" dangerouslySetInnerHTML={{ __html: t('profile.apis.modelsHint') }} />
            )}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('profile.apis.geminiKey')}>{keyInput(geminiKey, (e) => setGeminiKey(e.target.value), 'AIza...')}</Field>
            <Field label={t('profile.apis.groqKey')}>{keyInput(groqKey, (e) => setGroqKey(e.target.value), 'gsk_...')}</Field>
          </div>
          <TestButton label={t('profile.apis.testAi')} persist={persist} run={() => api.ai.test()} />
        </div>
      </Card>

      <Card title={t('profile.apis.othersTitle')}>
        <div className="space-y-4">
          <div>
            <Field label={t('profile.apis.assemblyLabel')}>{keyInput(assemblyKey, (e) => setAssemblyKey(e.target.value), t('profile.apis.assemblyPlaceholder'))}</Field>
            <div className="mt-2">
              <TestButton label={t('profile.apis.testAssembly')} persist={persist} run={() => api.transcription.test()} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('profile.apis.pexelsLabel')}>{keyInput(pexelsKey, (e) => setPexelsKey(e.target.value), t('profile.apis.pexelsPlaceholder'))}</Field>
            <Field label={t('profile.apis.pixabayLabel')}>{keyInput(pixabayKey, (e) => setPixabayKey(e.target.value), t('profile.apis.pixabayPlaceholder'))}</Field>
          </div>
          <TestButton label={t('profile.apis.testMedia')} persist={persist} run={() => api.media.test()} />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <SavedFlash show={saved} />
        <button className={btnPrimary} onClick={save}>
          {t('profile.apis.saveKeys')}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function PrefsTab() {
  const { t } = useI18n()
  const db = useDb()
  const [theme, setThemeState] = useState(document.documentElement.dataset.theme || 'dark')
  const [emailNotif, setEmailNotif] = useState(db.getSetting('emailNotifications', true))
  const [saved, setSaved] = useState(false)

  // Sincroniza com o botão de lua/sol do header (mesmo storage)
  function setTheme(next) {
    setThemeState(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('noctis_theme', next)
  }

  function save() {
    db.setSetting('emailNotifications', emailNotif)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card title={t('profile.prefs.title')}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">{t('profile.prefs.theme')}</p>
            <p className="text-xs text-slate-500">{t('profile.prefs.themeHint')}</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1 text-xs">
            <button onClick={() => setTheme('dark')} className={`rounded px-3 py-1.5 ${theme === 'dark' ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}>
              {t('profile.prefs.dark')}
            </button>
            <button onClick={() => setTheme('light')} className={`rounded px-3 py-1.5 ${theme === 'light' ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}>
              {t('profile.prefs.light')}
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">{t('profile.prefs.emailNotif')}</p>
            <p className="text-xs text-slate-500">{t('profile.prefs.emailNotifHint')}</p>
          </div>
          <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} className="h-5 w-5 rounded accent-cyan-500" />
        </label>
        <div className="flex items-center justify-end gap-3">
          <SavedFlash show={saved} />
          <button className={btnPrimary} onClick={save}>
            {t('profile.prefs.save')}
          </button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba Avançado: backup completo dos dados locais + zona de perigo
function AdvancedTab() {
  const { t } = useI18n()
  const db = useDb()
  const [importError, setImportError] = useState('')
  const [importOk, setImportOk] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateSummary, setMigrateSummary] = useState(null)
  const [migrateError, setMigrateError] = useState('')
  const { cloud, cloudActive } = db.cloudStatus()

  async function migrateNow() {
    setMigrating(true)
    setMigrateError('')
    setMigrateSummary(null)
    try {
      const r = await db.migrateToCloud()
      setMigrateSummary(r.summary || {})
    } catch (e) {
      setMigrateError(e?.message || 'Erro ao migrar.')
    } finally {
      setMigrating(false)
    }
  }

  const counts = [
    ['countChannels', db.all('channels').length],
    ['countVideos', db.all('videos').length],
    ['countPrompts', db.all('prompts').length],
    ['countReferences', db.all('referenceChannels').length],
    ['countAnalyses', db.all('nicheAnalyses').length],
  ]

  function exportBackup() {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`noctis-backup-${stamp}.json`, JSON.stringify(db.exportAll(), null, 2))
  }

  function handleImportFile(file) {
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result)
        if (payload?.app !== 'noctis-studio' || !payload?.data) throw new Error('invalid')
        setPendingImport(payload) // confirma antes de sobrescrever
      } catch {
        setImportError(t('profile.adv.invalidFile'))
      }
    }
    reader.readAsText(file)
  }

  function confirmImport() {
    try {
      db.importAll(pendingImport)
      setImportOk(true)
      setTimeout(() => setImportOk(false), 3000)
    } catch {
      setImportError(t('profile.adv.importFail'))
    } finally {
      setPendingImport(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card title={t('profile.adv.backupTitle')} subtitle={t('profile.adv.backupSub')}>
        <div className="mb-4 flex flex-wrap gap-2">
          {counts.map(([key, n]) => (
            <span key={key} className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400">
              <b className="text-slate-200">{n}</b> {t(`profile.adv.${key}`)}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportBackup} className={`${btnPrimary} flex items-center gap-2`}>
            <DownloadCloud size={15} />
            {t('profile.adv.exportBtn')}
          </button>
          <label className={`${btnGhost} flex cursor-pointer items-center gap-2`}>
            <UploadCloud size={15} />
            {t('profile.adv.importBtn')}
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        {importError && <p className="mt-3 text-xs text-red-400">{importError}</p>}
        {importOk && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-green-400">
            <Check size={13} />
            {t('profile.adv.importOk')}
          </p>
        )}
        <p className="mt-3 text-[11px] text-slate-600">
          {t('profile.adv.keysNote')}
        </p>
      </Card>

      <Card title={t('profile.adv.cloudTitle')} subtitle={t('profile.adv.cloudSub')}>
        {!cloud ? (
          <p className="text-xs text-slate-500">{t('profile.adv.cloudLocalOnly')}</p>
        ) : (
          <>
            <div className="mb-3">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cloudActive ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-400'}`}>
                {cloudActive ? t('profile.adv.cloudOn') : t('profile.adv.cloudOff')}
              </span>
            </div>
            <button onClick={migrateNow} disabled={migrating} className={`${btnPrimary} flex items-center gap-2 disabled:opacity-50`}>
              {migrating ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}
              {t('profile.adv.cloudBtn')}
            </button>
            {migrateError && <p className="mt-3 text-xs text-red-400">{migrateError}</p>}
            {migrateSummary && (
              <div className="mt-3 rounded-lg border border-green-500/25 bg-green-500/5 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-400">
                  <Check size={13} />
                  {t('profile.adv.cloudDone')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(migrateSummary).map(([k, v]) => (
                    <span key={k} className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10.5px] text-slate-400">
                      {k}: <b className={typeof v === 'number' ? 'text-slate-200' : 'text-red-400'}>{String(v)}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{t('profile.adv.cloudNote')}</p>
          </>
        )}
      </Card>

      <Card title={t('profile.adv.dangerTitle')}>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-red-400">
              <AlertTriangle size={14} />
              {t('profile.adv.wipeTitle')}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{t('profile.adv.wipeSub')}</p>
          </div>
          <button onClick={() => setWipeOpen(true)} className="shrink-0 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10">
            {t('profile.adv.wipeBtn')}
          </button>
        </div>
      </Card>

      <ConfirmDialog
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
        title={t('profile.adv.importConfirmTitle')}
        message={t('profile.adv.importConfirmMsg', { date: pendingImport?.exportedAt ? new Date(pendingImport.exportedAt).toLocaleString('pt-BR') : t('profile.adv.unknownDate') })}
        confirmLabel={t('profile.adv.replaceData')}
      />
      <ConfirmDialog
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        onConfirm={() => db.wipeAll()}
        title={t('profile.adv.wipeConfirmTitle')}
        message={t('profile.adv.wipeConfirmMsg')}
        confirmLabel={t('profile.adv.wipeBtn')}
      />
    </div>
  )
}
