import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../auth/AuthContext'
import { db } from '../../lib/db'
import { planRank, COLLAB_MIN_PLAN } from '../../lib/plans'
import { UpgradeLock } from '../PlanGate'

export default function Layout() {
  const { user, isFounder, isLocalMode } = useAuth()
  // Inicializa o banco do usuário; em produção (Supabase) o banco é a fonte da
  // verdade e o localStorage vira cache.
  db.init(user.email, { cloud: !isLocalMode })

  // Colaborador em workspace de outro precisa de plano mínimo (Basic) para usar
  // QUALQUER página — não só as pesadas. Bloqueia globalmente com upsell.
  const inSharedWs = !!db.activeWorkspace()
  const needsPlan = inSharedWs && !isFounder && planRank(user?.plan) < planRank(COLLAB_MIN_PLAN)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 xl:px-10 2xl:px-14">
          {needsPlan ? <UpgradeLock feature="collabWorkspace" min={COLLAB_MIN_PLAN} plan={user?.plan} /> : <Outlet />}
        </main>
      </div>
    </div>
  )
}
