import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../auth/AuthContext'
import { db } from '../../lib/db'

export default function Layout() {
  const { user } = useAuth()
  // Inicializa o banco local do usuário antes de renderizar qualquer página.
  db.init(user.email)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
