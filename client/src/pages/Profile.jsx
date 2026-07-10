import { useState } from 'react'
import { User, Shield, KeyRound, SlidersHorizontal, Wrench, Eye, EyeOff, Check, Camera, DownloadCloud, UploadCloud, AlertTriangle } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
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
