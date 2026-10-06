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
  useEffect(() => {
    if (auth.status !== 'signed_in') return
    call('creator:queueStatus').then(setQueue).catch(() => {})
  }, [auth.status])

  const go = (p) => {
    setPage(p)
    try { localStorage.setItem('noctis_page', p) } catch { /* sem storage */ }
  }

  if (auth.status !== 'signed_in') return <Login auth={auth} />

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
