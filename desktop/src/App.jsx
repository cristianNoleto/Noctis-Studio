import { lazy, Suspense, useEffect, useState } from 'react'
import { call, SettingsProvider, ToastProvider, useEvent } from './lib/api'
import Shell from './components/Shell'
import Login from './pages/Login'
import { Modal, btnGhost, btnPrimary, Spinner } from './components/ui'

const PAGES = {
  dashboard: lazy(() => import('./pages/Dashboard')),
  projetos: lazy(() => import('./pages/Projetos')),
  creator: lazy(() => import('./pages/Creator')),
  srt: lazy(() => import('./pages/Sincronizador')),
  narracao: lazy(() => import('./pages/Narracao')),
  'audio-atlas': lazy(() => import('./pages/AudioAtlas')),
  renomeador: lazy(() => import('./pages/Renomeador')),
  contas: lazy(() => import('./pages/Contas')),
  logs: lazy(() => import('./pages/Logs')),
  config: lazy(() => import('./pages/Configuracoes')),
}
const ChatPanel = lazy(() => import('./components/ChatPanel'))

function CloseDialog() {
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  useEvent('app:close-request', () => setOpen(true))
  const choose = (action) => { setOpen(false); call('app:close-choice', { action, remember }) }
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Fechar o Noctis Studio?" width="max-w-md">
      <p className="text-sm leading-relaxed text-slate-400">
        Minimizar para a bandeja mantém a fila gerando em segundo plano. Fechar de vez para tudo que estiver em andamento.
      </p>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-400">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-cyan-500" />
        Lembrar minha escolha (dá pra mudar em Configurações)
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={() => choose('quit')}>Fechar de vez</button>
        <button className={btnPrimary} onClick={() => choose('tray')}>Minimizar para a bandeja</button>
      </div>
    </Modal>
  )
}

// Aviso global da atualização com o app aberto: contagem e reinício automático.
function AvisoAtualizacao() {
  const [a, setA] = useState(null)
  const [resta, setResta] = useState(0)
  useEvent('app:update', (e) => {
    if (e.estado === 'reiniciando') { setA(e); setResta(e.segundos || 30) }
    else if (e.estado === 'aguardando-fila') setA(e)
  })
  useEffect(() => {
    if (!a || a.estado !== 'reiniciando') return undefined
    const t = setInterval(() => setResta((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(t)
  }, [a])
  if (!a) return null
  return (
    <div className="fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-cyan-500/30 bg-slate-900/95 px-5 py-3 shadow-2xl shadow-black/60 backdrop-blur">
      <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
      <p className="text-sm text-slate-200">
        {a.estado === 'aguardando-fila'
          ? <>Atualização <b className="text-cyan-300">{a.version}</b> pronta — o app reinicia assim que a geração em andamento terminar.</>
          : <>Atualização <b className="text-cyan-300">{a.version}</b> baixada. Reiniciando para instalar em <b className="text-cyan-300">{resta}s</b>…</>}
      </p>
      <button className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400" onClick={() => call('app:update-install')}>Atualizar agora</button>
    </div>
  )
}

function Inner() {
  const [auth, setAuth] = useState({ status: 'checking' })
  const [page, setPage] = useState(() => {
    try { return localStorage.getItem('noctis_page') || 'dashboard' } catch { return 'dashboard' }
  })
  const [queue, setQueue] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => { call('auth:state').then(setAuth).catch(() => setAuth({ status: 'signed_out' })) }, [])
  useEvent('auth', setAuth)
  useEvent('creator:update', (d) => { if (d && d.queue) setQueue(d.queue) })
  useEvent('app:navigate', (d) => { if (d?.chat) setChatOpen(true); else if (d?.page) go(d.page) })
  useEffect(() => {
    if (auth.status !== 'signed_in') return
    call('creator:queueStatus').then(setQueue).catch(() => {})
  }, [auth.status])

  const go = (p) => {
    setPage(p)
    try { localStorage.setItem('noctis_page', p) } catch { /* sem storage */ }
  }

  if (auth.status !== 'signed_in') return <><Login auth={auth} /><AvisoAtualizacao /></>

  const [base, ...rest] = page.split('/')
  const Page = PAGES[base] || PAGES.dashboard
  return (
    <Shell page={page} go={go} user={auth.user} queue={queue} onChat={() => setChatOpen(true)} chatOpen={chatOpen}>
      <div className="flex h-full">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner size={26} /></div>}>
            <Page go={go} param={rest.join('/')} key={page} />
          </Suspense>
        </div>
        {chatOpen && (
          <Suspense fallback={null}>
            <ChatPanel onClose={() => setChatOpen(false)} go={go} />
          </Suspense>
        )}
      </div>
      <CloseDialog />
      <AvisoAtualizacao />
    </Shell>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <Inner />
      </SettingsProvider>
    </ToastProvider>
  )
}
