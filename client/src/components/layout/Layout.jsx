import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../auth/AuthContext'
import { db } from '../../lib/db'

export default function Layout() {
  const { user, isLocalMode } = useAuth()
  // Inicializa o banco do usuário; em produção (Supabase) o banco é a fonte da
  // verdade e o localStorage vira cache.
  db.init(user.email, { cloud: !isLocalMode })

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 xl:px-10 2xl:px-14">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
