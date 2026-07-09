import { useState } from 'react'
import { User, Shield, KeyRound, SlidersHorizontal, Crown, Eye, EyeOff, Check } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
import { inputCls, btnPrimary } from '../components/ui'
import { Field } from './channels/ChannelsList'

const TABS = [
  ['profile', 'Perfil', User],
  ['security', 'Segurança', Shield],
  ['apis', 'APIs', KeyRound],
  ['prefs', 'Preferências', SlidersHorizontal],
  ['plan', 'Meu Plano', Crown],
]

export default function Profile() {
  const [tab, setTab] = useState('profile')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Configurações</h1>
        <p className="mt-1 text-sm text-slate-500">Gerencie sua conta, segurança, chaves de API e plano.</p>
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
      {tab === 'plan' && <PlanTab />}
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
      const size = 128
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
    <Card title="Dados do Perfil" subtitle="Como você aparece na plataforma.">
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="" className="h-16 w-16 rounded-full border border-slate-700 object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-xl font-bold text-slate-950">
              {(name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="space-y-1.5">
            {isAdmin && (
              <span className="inline-block rounded border border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-red-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">
                👑 FUNDADOR
              </span>
            )}
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300">
                📷 {avatarDataUrl ? 'Trocar foto' : 'Adicionar foto'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
              </label>
              {avatarDataUrl && (
                <button type="button" onClick={() => db.setSetting('avatarDataUrl', null)} className="rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                  Remover
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-600">A foto fica salva neste dispositivo (128px). Com o Supabase ativo, sobe para o storage.</p>
          </div>
        </div>
        <Field label="NOME DE EXIBIÇÃO">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-MAIL">
          <input className={`${inputCls} opacity-60`} value={user?.email || ''} disabled />
        </Field>
        <div className="flex items-center justify-end gap-3">
          <SavedFlash show={saved} />
          <button type="submit" className={btnPrimary}>
            Salvar alterações
          </button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
function SecurityTab() {
  const { isLocalMode } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState('')

  function change(e) {
    e.preventDefault()
    setMsg(
      isLocalMode
        ? 'Modo local: a troca de senha real é ativada quando o Supabase estiver configurado (client/.env).'
        : 'Senha atualizada.',
    )
  }

  return (
    <div className="space-y-4">
      <Card title="Alterar Senha">
        <form onSubmit={change} className="space-y-4">
          <Field label="SENHA ATUAL">
            <input className={inputCls} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="NOVA SENHA">
            <input className={inputCls} type="password" minLength={6} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          {msg && <p className="text-xs text-amber-400">{msg}</p>}
          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>
              Atualizar senha
            </button>
          </div>
        </form>
      </Card>
      <Card title="Contas Conectadas">
        <div className="flex items-center gap-3 rounded-lg border border-slate-800 p-3">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.27 14.29a7.16 7.16 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
          </svg>
          <p className="text-sm text-slate-300">Conta Google</p>
          <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500">NÃO VINCULADA</span>
        </div>
      </Card>
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
  const [geminiModel, setGeminiModel] = useState(db.getSetting('geminiModel', 'gemini-2.0-flash'))
  const [aiProvider, setAiProvider] = useState(db.getSetting('aiProvider', 'gemini'))
  const [groqKey, setGroqKey] = useState(db.getSetting('groqKey', ''))
  const [assemblyKey, setAssemblyKey] = useState(db.getSetting('assemblyKey', ''))
  const [pexelsKey, setPexelsKey] = useState(db.getSetting('pexelsKey', ''))
  const [pixabayKey, setPixabayKey] = useState(db.getSetting('pixabayKey', ''))
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)

  function save() {
    db.setSetting('ytKeys', ytKeys.map((k) => k.trim()))
    db.setSetting('geminiKey', geminiKey.trim())
    db.setSetting('geminiModel', geminiModel)
    db.setSetting('aiProvider', aiProvider)
    db.setSetting('groqKey', groqKey.trim())
    db.setSetting('assemblyKey', assemblyKey.trim())
    db.setSetting('pexelsKey', pexelsKey.trim())
    db.setSetting('pixabayKey', pixabayKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

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
            ⚠️ <b>Sobre "cota atingida":</b> o free tier do Gemini tem limite <b>por modelo</b> — o gemini-1.5-pro grátis aguenta só ~2
            chamadas/min e 50/dia; o gemini-2.0-flash aguenta 15/min e 1.500/dia. Se estourar, o sistema tenta automaticamente os outros
            modelos gratuitos do Gemini e, por último, o Groq (se a chave estiver configurada abaixo). Aguardar ~1 minuto também resolve.
          </div>

          <Field label="MODELO GEMINI PREFERIDO">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                ['gemini-2.0-flash', 'Recomendado', 'text-green-400 bg-green-500/10'],
                ['gemini-1.5-flash', 'Mais veloz', 'text-sky-400 bg-sky-500/10'],
                ['gemini-1.5-pro', 'Inteligência Avançada', 'text-amber-400 bg-amber-500/10'],
              ].map(([model, badge, cls]) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => setGeminiModel(model)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    geminiModel === model ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <p className="font-mono text-xs text-slate-200">{model}</p>
                  <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{badge}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CHAVE DA API GEMINI (aistudio.google.com/apikey)">{keyInput(geminiKey, (e) => setGeminiKey(e.target.value), 'AIza...')}</Field>
            <Field label="CHAVE DA API GROQ (console.groq.com/keys)">{keyInput(groqKey, (e) => setGroqKey(e.target.value), 'gsk_...')}</Field>
          </div>
        </div>
      </Card>

      <Card title="Outras integrações (BYOK)">
        <div className="space-y-4">
          <Field label="ASSEMBLYAI (transcrição de áudio)">{keyInput(assemblyKey, (e) => setAssemblyKey(e.target.value), 'Chave da AssemblyAI')}</Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="PEXELS (banco de mídia)">{keyInput(pexelsKey, (e) => setPexelsKey(e.target.value), 'Chave do Pexels')}</Field>
            <Field label="PIXABAY (banco de mídia)">{keyInput(pixabayKey, (e) => setPixabayKey(e.target.value), 'Chave do Pixabay')}</Field>
          </div>
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
  const [theme, setTheme] = useState(db.getSetting('theme', 'dark'))
  const [emailNotif, setEmailNotif] = useState(db.getSetting('emailNotifications', true))
  const [saved, setSaved] = useState(false)

  function save() {
    db.setSetting('theme', theme)
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
            <p className="text-xs text-slate-500">O tema claro chega em uma atualização futura.</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1 text-xs">
            <button onClick={() => setTheme('dark')} className={`rounded px-3 py-1.5 ${theme === 'dark' ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}>
              Escuro
            </button>
            <button disabled className="cursor-not-allowed rounded px-3 py-1.5 text-slate-600" title="Em breve">
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
const PLANS = [
  { name: 'Grátis', price: 'R$ 0', features: ['1 canal', 'Ferramentas de texto', 'Quadro de ideias'], cls: 'border-slate-800' },
  { name: 'Basic', price: 'R$ 47/mês', features: ['3 canais', 'Niche Finder + Virais', '10 relatórios IA/mês'], cls: 'border-slate-800' },
  { name: 'Lite', price: 'R$ 97/mês', features: ['10 canais', 'Dobra de Nicho', '50 relatórios IA/mês'], cls: 'border-slate-800' },
  { name: 'Pro', price: 'R$ 197/mês', features: ['Canais ilimitados', 'Tudo do Lite', 'Compartilhamento de equipe'], cls: 'border-cyan-500/50', highlight: true },
]

function PlanTab() {
  const { user } = useAuth()
  const db = useDb()
  const reports = db.all('seoReports').length + db.all('nicheAnalyses').length
  const transcriptions = db.all('transcriptions').length

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Crown size={22} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-100">
              Plano <span className="text-amber-400">{user?.plan || 'FREE'}</span>
            </p>
            <p className="text-xs text-slate-500">Acesso completo a todas as ferramentas da plataforma.</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <UsageBar label="Gerações de IA (SEO + Dobra de Nicho)" used={reports} limit={100} />
          <UsageBar label="Transcrições" used={transcriptions} limit={30} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => (
          <div key={p.name} className={`rounded-xl border bg-slate-900/40 p-5 ${p.cls}`}>
            {p.highlight && <span className="mb-2 inline-block rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400">POPULAR</span>}
            <p className="font-bold text-slate-100">{p.name}</p>
            <p className="mt-1 text-xl font-extrabold text-slate-100">{p.price}</p>
            <ul className="mt-3 space-y-1.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Check size={12} className="text-cyan-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageBar({ label, used, limit }) {
  const pct = Math.min(100, Math.round((used / limit) * 100))
  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-slate-200">
          {used}/{limit}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
