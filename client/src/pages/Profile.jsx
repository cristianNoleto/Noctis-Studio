import { useState, useEffect } from 'react'
import { User, Shield, KeyRound, SlidersHorizontal, Wrench, Eye, EyeOff, Check, Camera, DownloadCloud, UploadCloud, AlertTriangle, Loader2, X, Plug } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
import { api } from '../lib/api'
import { inputCls, btnPrimary, btnGhost, ConfirmDialog } from '../components/ui'
import { downloadFile } from '../lib/text'
import { Field } from './channels/ChannelsList'

// Abas do original: Perfil | Segurança | APIs | Preferências | Avançado
const TABS = [
  ['profile', 'Perfil', User],
  ['security', 'Segurança', Shield],
  ['apis', 'APIs', KeyRound],
  ['prefs', 'Preferências', SlidersHorizontal],
  ['advanced', 'Avançado', Wrench],
]

export default function Profile() {
  const [tab, setTab] = useState('profile')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Configurações</h1>
        <p className="mt-1 text-sm text-slate-500">Gerencie seu perfil, segurança e preferências</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
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
  if (!show) return null
  return (
    <span className="flex items-center gap-1 text-xs text-green-400">
      <Check size={13} />
      Salvo
    </span>
  )
}

// ---------------------------------------------------------------------------
function ProfileTab() {
  const { user, isAdmin } = useAuth()
  const db = useDb()
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
    <Card title="Perfil">
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
              👑 FUNDADOR
            </span>
          )}
          <p className="text-xs text-slate-500">Clique no ícone da câmera para adicionar sua foto</p>
          <p className="text-[10px] text-slate-600">
            Formatos: JPG, PNG, WebP • Tamanho máximo: 10MB
            <br />
            (Será comprimida automaticamente para ~300KB)
          </p>
          {avatarDataUrl && (
            <button type="button" onClick={() => db.setSetting('avatarDataUrl', null)} className="text-[11px] text-red-400 hover:underline">
              Remover foto
            </button>
          )}
        </div>
        <Field label="NOME">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="EMAIL">
          <input className={`${inputCls} opacity-60`} value={user?.email || ''} disabled />
          <p className="mt-1 text-[10px] text-slate-600">O email não pode ser alterado</p>
        </Field>
        <div className="flex items-center justify-end gap-3">
          <SavedFlash show={saved} />
          <button type="submit" className={btnPrimary}>
            Salvar Alterações
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
      setPwMsg({ ok: false, text: 'Modo local: a troca de senha real funciona no site publicado (Supabase).' })
      return
    }
    if (next.length < 6) return setPwMsg({ ok: false, text: 'A nova senha precisa de pelo menos 6 caracteres.' })
    if (next !== confirm) return setPwMsg({ ok: false, text: 'As senhas não coincidem.' })
    setBusy(true)
    try {
      await updatePassword(next)
      setPwMsg({ ok: true, text: 'Senha atualizada com sucesso.' })
      setNext('')
      setConfirm('')
    } catch (err) {
      setPwMsg({ ok: false, text: err?.message || 'Não foi possível atualizar a senha.' })
    } finally {
      setBusy(false)
    }
  }

  async function changeEmail(e) {
    e.preventDefault()
    if (isLocalMode) {
      setEmailMsg({ ok: false, text: 'Modo local: a troca de e-mail funciona no site publicado (Supabase).' })
      return
    }
    setBusy(true)
    try {
      await updateEmail(newEmail.trim())
      setEmailMsg({ ok: true, text: 'Enviamos links de confirmação — confira a caixa de entrada do e-mail atual E do novo para concluir a troca.' })
      setNewEmail('')
    } catch (err) {
      setEmailMsg({ ok: false, text: err?.message || 'Não foi possível iniciar a troca de e-mail.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleLinkGoogle() {
    if (isLocalMode) {
      setLinkMsg({ ok: false, text: 'Modo local: a vinculação com o Google funciona no site publicado (Supabase).' })
      return
    }
    setBusy(true)
    try {
      await linkGoogle() // redireciona para o Google e volta para /perfil
    } catch (err) {
      setLinkMsg({
        ok: false,
        text: err?.message?.includes('Manual linking')
          ? 'Ative "Manual linking" no painel do Supabase (Authentication) para permitir a vinculação.'
          : err?.message || 'Não foi possível vincular agora.',
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
      setLinkMsg({ ok: true, text: 'Conta Google desvinculada.' })
    } catch (err) {
      setLinkMsg({ ok: false, text: err?.message || 'Não foi possível desvincular.' })
    } finally {
      setBusy(false)
    }
  }

  const Msg = ({ msg }) => (msg ? <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-amber-400'}`}>{msg.text}</p> : null)

  return (
    <div className="space-y-4">
      {/* Contas conectadas: e-mail principal + Google (pode ter e-mail diferente) */}
      <Card
        title="Contas Conectadas"
        subtitle="Você pode entrar com e-mail/senha e também com o Google — mesmo que os e-mails sejam diferentes, é a MESMA conta. O e-mail principal (que recebe os avisos) continua sendo o cadastrado."
      >
        <div className="space-y-2.5">
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">@</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200">E-mail principal</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <span className="shrink-0 rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
              {isLocalMode || emailIdentity || !identities.length ? 'ATIVO' : 'VIA GOOGLE'}
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-800 p-3">
            <GoogleIcon />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200">Conta Google</p>
              <p className="truncate text-xs text-slate-500">{googleIdentity ? googleIdentity.email || 'vinculada' : 'Entre também com um clique, sem senha'}</p>
            </div>
            {googleIdentity ? (
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">VINCULADA</span>
                {identities.length > 1 && (
                  <button onClick={handleUnlinkGoogle} disabled={busy} className="text-xs text-red-400 hover:underline disabled:opacity-50">
                    Desvincular
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={busy}
                className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50"
              >
                Vincular Google
              </button>
            )}
          </div>
          <Msg msg={linkMsg} />
        </div>
      </Card>

      {/* Trocar e-mail principal */}
      <Card title="Alterar e-mail principal" subtitle="O e-mail principal é o que recebe os avisos da plataforma. A troca exige confirmação nos dois e-mails.">
        <form onSubmit={changeEmail} className="space-y-3">
          <Field label="NOVO E-MAIL">
            <input className={inputCls} type="email" required placeholder="novo@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </Field>
          <Msg msg={emailMsg} />
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={`${btnPrimary} disabled:opacity-50`}>
              Alterar e-mail
            </button>
          </div>
        </form>
      </Card>

      {/* Alterar senha */}
      <Card title="Alterar Senha">
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="NOVA SENHA">
            <input className={inputCls} type="password" minLength={6} required value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="CONFIRMAR NOVA SENHA">
            <input className={inputCls} type="password" minLength={6} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Msg msg={pwMsg} />
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={`${btnPrimary} disabled:opacity-50`}>
              Atualizar senha
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// Botão de teste reutilizável — persiste as chaves atuais e roda a validação.
function TestButton({ label = 'Testar', persist, run }) {
  const [state, setState] = useState('idle') // idle | loading | ok | fail
  const [msg, setMsg] = useState('')
  async function handle() {
    setState('loading')
    setMsg('')
    try {
      persist?.()
      const r = await run()
      if (r?.ok) {
        setState('ok')
        setMsg(r.message || 'OK')
      } else {
        setState('fail')
        setMsg(r?.message || 'Falhou')
      }
    } catch (e) {
      setState('fail')
      setMsg(e?.message || 'Falhou')
    }
  }
  return (
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
  )
}

// ---------------------------------------------------------------------------
function ApisTab() {
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
        <p className="text-xs text-slate-400">
          Suas chaves ficam salvas <b>somente neste dispositivo</b> e são enviadas ao servidor apenas no momento de cada chamada (BYOK).
        </p>
        <button onClick={() => setShow((v) => !v)} className="ml-3 shrink-0 text-slate-400 hover:text-slate-200" title={show ? 'Ocultar chaves' : 'Mostrar chaves'}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <Card
        title="YouTube Data API — Rotação de Cota"
        subtitle="Configure até 5 chaves. Quando uma atinge a cota diária (erro 403), o sistema troca automaticamente para a próxima, sem interromper suas buscas. A cota reseta à meia-noite (horário do Pacífico)."
      >
        <div className="space-y-3">
          {ytKeys.map((key, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">CHAVE {i + 1}</span>
              {keyInput(key, (e) => setYtKeys((ks) => ks.map((k, idx) => (idx === i ? e.target.value : k))), 'AIza...')}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-600">
          Crie chaves no Google Cloud Console → YouTube Data API v3. Mesmo com 5 chaves a cota é finita — as buscas são cacheadas no servidor pra economizar.
        </p>
        <div className="mt-3">
          <TestButton label="Testar YouTube" persist={persist} run={() => api.youtube.test()} />
        </div>
      </Card>

      <Card title="Inteligência Artificial — SEO/CTR e Dobra de Nicho" subtitle="Escolha o provedor. As duas opções têm plano gratuito — as chaves são suas (BYOK).">
        <div className="space-y-4">
          <Field label="PROVEDOR PRINCIPAL">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                ['gemini', 'Gemini (Google)', 'aistudio.google.com/apikey — recomendado'],
                ['groq', 'Groq (Llama 3.3 70B)', 'console.groq.com/keys — alternativa gratuita'],
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

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-300/80">
            ⚠️ <b>Modo Automático:</b> o sistema descobre quais modelos a sua chave pode usar e escolhe o <b>mais barato disponível</b>
            sozinho — se o Google aposentar um modelo (comum em contas novas), ele se adapta sem você mexer em nada. Se estourar a cota de um
            modelo, ele tenta o próximo e, por último, o Groq (se configurado).
          </div>

          <Field label="MODELO GEMINI">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGeminiModel('auto')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  geminiModel === 'auto' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                ⚡ Automático (mais barato)
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
                ↻ Recarregar
              </button>
            </div>
            {geminiModels.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Salve a chave e clique em <b>Recarregar</b> para listar os modelos. No modo <b>Automático</b> nem precisa escolher — o sistema decide.
              </p>
            )}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CHAVE DA API GEMINI (aistudio.google.com/apikey)">{keyInput(geminiKey, (e) => setGeminiKey(e.target.value), 'AIza...')}</Field>
            <Field label="CHAVE DA API GROQ (console.groq.com/keys)">{keyInput(groqKey, (e) => setGroqKey(e.target.value), 'gsk_...')}</Field>
          </div>
          <TestButton label="Testar IA" persist={persist} run={() => api.ai.test()} />
        </div>
      </Card>

      <Card title="Outras integrações (BYOK)">
        <div className="space-y-4">
          <div>
            <Field label="ASSEMBLYAI (transcrição de áudio)">{keyInput(assemblyKey, (e) => setAssemblyKey(e.target.value), 'Chave da AssemblyAI')}</Field>
            <div className="mt-2">
              <TestButton label="Testar AssemblyAI" persist={persist} run={() => api.transcription.test()} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="PEXELS (banco de mídia)">{keyInput(pexelsKey, (e) => setPexelsKey(e.target.value), 'Chave do Pexels')}</Field>
            <Field label="PIXABAY (banco de mídia)">{keyInput(pixabayKey, (e) => setPixabayKey(e.target.value), 'Chave do Pixabay')}</Field>
          </div>
          <TestButton label="Testar mídia (Pexels/Pixabay)" persist={persist} run={() => api.media.test()} />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <SavedFlash show={saved} />
        <button className={btnPrimary} onClick={save}>
          Salvar chaves
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function PrefsTab() {
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
    <Card title="Preferências">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Tema</p>
            <p className="text-xs text-slate-500">Vale para toda a interface — também dá para alternar pela lua/sol no topo.</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1 text-xs">
            <button onClick={() => setTheme('dark')} className={`rounded px-3 py-1.5 ${theme === 'dark' ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}>
              Escuro
            </button>
            <button onClick={() => setTheme('light')} className={`rounded px-3 py-1.5 ${theme === 'light' ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}>
              Claro
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Notificações por e-mail</p>
            <p className="text-xs text-slate-500">Novidades da plataforma e alertas dos seus canais.</p>
          </div>
          <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} className="h-5 w-5 rounded accent-cyan-500" />
        </label>
        <div className="flex items-center justify-end gap-3">
          <SavedFlash show={saved} />
          <button className={btnPrimary} onClick={save}>
            Salvar
          </button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba Avançado: backup completo dos dados locais + zona de perigo
function AdvancedTab() {
  const db = useDb()
  const [importError, setImportError] = useState('')
  const [importOk, setImportOk] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [wipeOpen, setWipeOpen] = useState(false)

  const counts = {
    canais: db.all('channels').length,
    vídeos: db.all('videos').length,
    prompts: db.all('prompts').length,
    referências: db.all('referenceChannels').length,
    análises: db.all('nicheAnalyses').length,
  }

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
        setImportError('Arquivo inválido — selecione um backup .json exportado pelo Noctis Studio.')
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
      setImportError('Não foi possível importar este backup.')
    } finally {
      setPendingImport(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Backup dos dados" subtitle="Tudo que está salvo neste dispositivo (canais, vídeos, roteiros, prompts, referências, quadro, análises e configurações).">
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(counts).map(([label, n]) => (
            <span key={label} className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400">
              <b className="text-slate-200">{n}</b> {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportBackup} className={`${btnPrimary} flex items-center gap-2`}>
            <DownloadCloud size={15} />
            Exportar backup (JSON)
          </button>
          <label className={`${btnGhost} flex cursor-pointer items-center gap-2`}>
            <UploadCloud size={15} />
            Importar backup
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        {importError && <p className="mt-3 text-xs text-red-400">{importError}</p>}
        {importOk && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-green-400">
            <Check size={13} />
            Backup importado com sucesso — os dados já estão no ar.
          </p>
        )}
        <p className="mt-3 text-[11px] text-slate-600">
          As chaves de API entram no backup. Guarde o arquivo em local seguro — quem tiver ele consegue usar suas chaves.
        </p>
      </Card>

      <Card title="Zona de perigo">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-red-400">
              <AlertTriangle size={14} />
              Apagar todos os dados locais
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Remove canais, vídeos, prompts e configurações deste dispositivo. Exporte um backup antes.</p>
          </div>
          <button onClick={() => setWipeOpen(true)} className="shrink-0 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10">
            Apagar tudo
          </button>
        </div>
      </Card>

      <ConfirmDialog
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
        title="Importar backup"
        message={`O backup de ${pendingImport?.exportedAt ? new Date(pendingImport.exportedAt).toLocaleString('pt-BR') : 'data desconhecida'} vai SUBSTITUIR todos os dados atuais deste dispositivo. Continuar?`}
        confirmLabel="Substituir dados"
      />
      <ConfirmDialog
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        onConfirm={() => db.wipeAll()}
        title="Apagar todos os dados"
        message="Isso remove TUDO que está salvo neste dispositivo e não pode ser desfeito. Tem certeza?"
        confirmLabel="Apagar tudo"
      />
    </div>
  )
}
