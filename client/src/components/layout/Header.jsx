import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Bell, ChevronRight, Eye, EyeOff, HelpCircle, LogOut, Moon, Settings, ShieldCheck, Sun, Sparkles } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useI18n } from '../../i18n'
import { useDb } from '../../lib/db'
import { usePrivacy, togglePrivacyGlobal } from '../privacy'

const planStyles = {
  // FUNDADOR = criador do sistema (admin) — acima de qualquer plano
  FUNDADOR: 'border-amber-500/50 bg-gradient-to-r from-amber-500/25 to-red-500/15 text-amber-300',
  MASTER: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PRO: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  FREE: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
}

function useClickOutside(onClose) {
  const ref = useRef(null)
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  return ref
}

export default function Header() {
  const { user, signOut, isAdmin } = useAuth()
  const { t, lang, setLang } = useI18n()
  const db = useDb()
  const location = useLocation()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const { global: privacy } = usePrivacy()
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'dark')
  const menuRef = useClickOutside(() => setMenuOpen(false))
  const notifRef = useClickOutside(() => setNotifOpen(false))

  const basePath = '/' + (location.pathname.split('/')[1] || '')
  const crumb = t(`header.breadcrumb.${basePath === '/' ? '/' : basePath}`)
  const [group, page] = Array.isArray(crumb) ? crumb : ['', crumb]
  // O criador do sistema exibe FUNDADOR no lugar do plano
  const plan = isAdmin ? 'FUNDADOR' : user?.plan || 'FREE'
  const displayName = db.getSetting('displayName') || user?.name
  const avatarDataUrl = db.getSetting('avatarDataUrl')
  const initial = (displayName || '?').charAt(0).toUpperCase()

  // Notificações = novidades da plataforma ainda não lidas
  const updates = [...db.all('platformUpdates')].sort((a, b) => b.createdAt - a.createdAt)
  const readTs = Number(localStorage.getItem('noctis_notif_read') || 0)
  const unread = updates.filter((u) => u.createdAt > readTs).length

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('noctis_theme', next)
  }

  function openNotifications() {
    setNotifOpen((v) => !v)
    localStorage.setItem('noctis_notif_read', String(Date.now()))
  }

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const iconBtn =
    'flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200'

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/70 bg-slate-950 px-6">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-500">{group}</span>
        <ChevronRight size={14} className="text-slate-600" />
        <span className="font-semibold text-slate-200">{page}</span>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Modo restrito global */}
        <button
          onClick={togglePrivacyGlobal}
          title={privacy ? 'Modo restrito ATIVO — clique para mostrar os dados' : 'Modo restrito: esconde nomes de canais, títulos, números e thumbnails no site inteiro'}
          className={`${iconBtn} ${privacy ? '!border-cyan-500/50 !bg-cyan-500/10 !text-cyan-400' : ''}`}
        >
          {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>

        {/* Idioma (bandeira em imagem — emoji de bandeira não renderiza no Windows) */}
        <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')} title={lang === 'pt' ? 'Switch to English' : 'Mudar para Português'} className={iconBtn}>
          <img src={`https://flagcdn.com/w40/${lang === 'pt' ? 'br' : 'us'}.png`} alt={lang === 'pt' ? 'Brasil' : 'EUA'} className="h-4 w-6 rounded-[3px] object-cover" />
        </button>

        {/* Notificações */}
        <div className="relative" ref={notifRef}>
          <button onClick={openNotifications} title="Notificações" className={`${iconBtn} relative`}>
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
                <Sparkles size={14} className="text-cyan-400" />
                <p className="text-sm font-semibold text-slate-100">Notificações</p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {updates.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">Nenhuma notificação por enquanto.</p>}
                {updates.map((u) => (
                  <div key={u.id} className="rounded-lg px-3 py-2.5 hover:bg-slate-800/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-200">{u.title}</p>
                      <span className="shrink-0 text-[9px] text-slate-600">{new Date(u.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{u.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tema claro/escuro */}
        <button onClick={toggleTheme} title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'} className={iconBtn}>
          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* Perfil */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-full border border-slate-800 bg-slate-900 py-1.5 pl-3.5 pr-1.5 transition-colors hover:border-slate-700"
          >
            <span className="max-w-[180px] truncate text-sm text-slate-200">{displayName}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${planStyles[plan] || planStyles.FREE}`}>
              {plan === 'FUNDADOR' ? '👑 FUNDADOR' : plan}
            </span>
            <div className="relative">
              {avatarDataUrl ? (
                <img src={avatarDataUrl} alt="" className="h-7 w-7 rounded-full border border-slate-700 object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-xs font-bold text-slate-950">
                  {initial}
                </div>
              )}
              <span className="online-dot absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400" />
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-xl">
              <div className="border-b border-slate-800 px-3 py-2">
                <p className="truncate text-sm font-medium text-slate-200">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <Link to="/perfil" onClick={() => setMenuOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                <Settings size={15} />
                {t('nav.profile')}
              </Link>
              <Link to="/ajuda" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                <HelpCircle size={15} />
                Central de Ajuda
              </Link>
              {isAdmin && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-400 hover:bg-slate-800">
                  <ShieldCheck size={15} />
                  Administração
                </Link>
              )}
              <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-slate-800">
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
