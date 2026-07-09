import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Bell, ChevronRight, LogOut, Moon, Settings } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useI18n } from '../../i18n'

const planStyles = {
  MASTER: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PRO: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  FREE: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
}

export default function Header() {
  const { user, signOut } = useAuth()
  const { t, lang, setLang } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const basePath = '/' + (location.pathname.split('/')[1] || '')
  const crumb = t(`header.breadcrumb.${basePath === '/' ? '/' : basePath}`)
  const [group, page] = Array.isArray(crumb) ? crumb : ['', crumb]
  const plan = user?.plan || 'FREE'
  const initial = (user?.name || '?').charAt(0).toUpperCase()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/70 bg-slate-950 px-6">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-500">{group}</span>
        <ChevronRight size={14} className="text-slate-600" />
        <span className="font-semibold text-slate-200">{page}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
          title={lang === 'pt' ? 'Switch to English' : 'Mudar para Português'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-sm transition-colors hover:border-slate-700"
        >
          {lang === 'pt' ? '🇧🇷' : '🇺🇸'}
        </button>
        <button
          title="Notificações"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
        >
          <Bell size={16} />
        </button>
        <button
          title="Tema escuro"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
        >
          <Moon size={16} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-full border border-slate-800 bg-slate-900 py-1.5 pl-3.5 pr-1.5 transition-colors hover:border-slate-700"
          >
            <span className="max-w-[180px] truncate text-sm text-slate-200">{user?.name}</span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${planStyles[plan] || planStyles.FREE}`}
            >
              {plan}
            </span>
            <div className="relative">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 text-xs font-bold text-white">
                {initial}
              </div>
              <span className="online-dot absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400" />
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-52 rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-xl">
              <div className="border-b border-slate-800 px-3 py-2">
                <p className="truncate text-sm font-medium text-slate-200">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <Link
                to="/perfil"
                onClick={() => setMenuOpen(false)}
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                <Settings size={15} />
                {t('nav.profile')}
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-slate-800"
              >
                <LogOut size={15} />
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
