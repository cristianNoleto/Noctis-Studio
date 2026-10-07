import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../auth/AuthContext'
import { db } from '../../lib/db'
import { planRank, COLLAB_MIN_PLAN } from '../../lib/plans'
import { UpgradeLock } from '../PlanGate'
import WorkspaceInviteBanner from '../WorkspaceInviteBanner'
import BackToTop from '../BackToTop'
import AutoCrawlRunner from '../AutoCrawlRunner'
import SyncAviso from '../SyncAviso'

export default function Layout() {
  const { user, isFounder, isLocalMode } = useAuth()
  // Menu lateral vira gaveta (drawer) no celular; no desktop fica fixo.
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  // Fecha a gaveta ao navegar e trava o scroll do body enquanto ela está aberta.
  useEffect(() => setNavOpen(false), [location.pathname])
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [navOpen])
  // Inicializa o banco do usuário; em produção (Supabase) o banco é a fonte da
  // verdade e o localStorage vira cache.
  db.init(user.email, { cloud: !isLocalMode })

  // Colaborador em workspace de outro precisa de plano mínimo (Basic) para usar
  // QUALQUER página — não só as pesadas. Bloqueia globalmente com upsell.
  const inSharedWs = !!db.activeWorkspace()
  const needsPlan = inSharedWs && !isFounder && planRank(user?.plan) < planRank(COLLAB_MIN_PLAN)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <AutoCrawlRunner />
      <SyncAviso />
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {/* Fundo escuro atrás da gaveta (só no celular, quando aberta) */}
      {navOpen && (
        <button
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenu={() => setNavOpen(true)} />
        <main id="main-scroll" className="relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 xl:px-10 2xl:px-14">
          {!needsPlan && <WorkspaceInviteBanner />}
          {needsPlan ? <UpgradeLock feature="collabWorkspace" min={COLLAB_MIN_PLAN} plan={user?.plan} /> : <Outlet />}
          <BackToTop scrollTargetId="main-scroll" />
        </main>
      </div>
    </div>
  )
}
