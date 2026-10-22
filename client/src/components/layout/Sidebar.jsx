import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Tv,
  Sparkles,
  Heart,
  Image,
  Clapperboard,
  Mic,
  AudioLines,
  FileText,
  Scissors,
  Combine,
  Kanban,
  PenTool,
  Compass,
  GitBranch,
  TrendingUp,
  ShieldAlert,
  GraduationCap,
  MessagesSquare,
  BookOpen,
  ChevronDown,
  Monitor,
} from 'lucide-react'
import Logo from '../Logo'
import { useI18n } from '../../i18n'
import { useDb } from '../../lib/db'
import { Masked } from '../privacy'

const groups = [
  { key: 'overview', items: [{ to: '/', label: 'dashboard', Icon: LayoutDashboard }] },
  { key: 'channels', items: [{ to: '/canais', label: 'channels', Icon: Tv }] },
  {
    key: 'library',
    items: [
      { to: '/prompts', label: 'prompts', Icon: Sparkles },
      { to: '/referencias', label: 'references', Icon: Heart },
      { to: '/videos-imagens', label: 'mediaBank', Icon: Image },
      { to: '/estudio', label: 'studio', Icon: Clapperboard },
    ],
  },
  {
    key: 'tools',
    items: [
      { to: '/transcricao', label: 'transcription', Icon: Mic },
      { to: '/narracao', label: 'narration', Icon: AudioLines },
      { to: '/remocao-silencio', label: 'silenceRemover', Icon: Scissors },
      { to: '/combinar-audios', label: 'audioCombiner', Icon: Combine },
      { to: '/ferramentas-texto', label: 'textTools', Icon: FileText },
      { to: '/quadro-ideias', label: 'ideaBoard', Icon: Kanban },
      { to: '/desenhos', label: 'drawings', Icon: PenTool },
      { to: '/app-desktop', label: 'desktopApp', Icon: Monitor, badge: 'APP' },
    ],
  },
  {
    key: 'trends',
    items: [
      { to: '/niche-finder', label: 'nicheFinder', Icon: Compass },
      { to: '/dobra-de-nicho', label: 'nicheDoubling', Icon: GitBranch },
      { to: '/videos-virais', label: 'viralVideos', Icon: TrendingUp },
      { to: '/canais-removidos', label: 'removedChannels', Icon: ShieldAlert },
    ],
  },
  { key: 'academy', items: [{ to: '/academia', label: 'academy', Icon: GraduationCap }] },
  {
    key: 'support',
    items: [
      { to: '/suporte', label: 'community', Icon: MessagesSquare },
    ],
  },
]

export default function Sidebar({ open = false, onClose }) {
  const { t } = useI18n()
  const db = useDb()
  const myChannels = db.all('channels').filter((c) => !c.archived)
  // Seções fechadas persistem entre sessões (todas abertas por padrão)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('noctis_nav_collapsed') || '{}')
    } catch {
      return {}
    }
  })

  function toggleGroup(key) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('noctis_nav_collapsed', JSON.stringify(next))
      return next
    })
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-slate-800/70 bg-slate-950 transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-56 lg:max-w-none lg:translate-x-0 ${
        open ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full'
      }`}
    >
      {/* Logo/nome clicável → volta ao dashboard */}
      <Link to="/" className="flex h-16 shrink-0 items-center border-b border-slate-800/70 px-4 transition-opacity hover:opacity-80 lg:h-12" title={t('nav.backToDashboard')}>
        <Logo />
      </Link>

      {/* Clicar em qualquer link fecha a gaveta no celular */}
      <nav onClick={(e) => { if (e.target.closest('a')) onClose?.() }} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {groups.map((group) => {
          const isOpen = !collapsed[group.key]
          return (
            <div key={group.key}>
              {/* Cabeçalho da seção: expande/minimiza — seta ↓ aberta, → fechada */}
              <button
                onClick={() => toggleGroup(group.key)}
                className="group/section flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-400/70 transition-colors hover:text-cyan-300 lg:py-0.5 lg:text-[10px]"
              >
                {t(`nav.groups.${group.key}`)}
                <ChevronDown
                  size={13}
                  className={`text-slate-600 transition-all duration-200 group-hover/section:scale-125 group-hover/section:text-cyan-400 ${
                    isOpen ? 'rotate-0' : '-rotate-90'
                  }`}
                />
              </button>
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
              >
                <ul className="mt-0.5 space-y-px overflow-hidden">
                  {group.items.map(({ to, label, Icon, badge }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={to === '/'}
                        tabIndex={isOpen ? 0 : -1}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium tracking-tight transition-colors lg:gap-2 lg:py-1 lg:text-[12px] ${
                            isActive
                              ? 'border-l-2 border-cyan-500 bg-cyan-500/10 text-cyan-300'
                              : 'border-l-2 border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                          }`
                        }
                      >
                        <Icon size={15} />
                        {t(`nav.${label}`)}
                        {badge && (
                          <span className="ml-auto rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                            {badge}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  ))}
                  {/* Lista de canais do usuário (como no layout original) */}
                  {group.key === 'channels' && (
                    <>
                      {myChannels.map((ch) => (
                        <li key={ch.id}>
                          <NavLink
                            to={`/canais/${ch.id}`}
                            tabIndex={isOpen ? 0 : -1}
                            className={({ isActive }) =>
                              `flex items-center gap-2 rounded-lg py-2 pl-8 pr-2.5 text-[13px] transition-colors lg:py-1 lg:text-[11px] ${
                                isActive ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
                              }`
                            }
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                            <span className="truncate"><Masked mask="•••••••">{ch.name}</Masked></span>
                          </NavLink>
                        </li>
                      ))}
                      <li>
                        <NavLink
                          to="/canais?novo=1"
                          tabIndex={isOpen ? 0 : -1}
                          className="flex items-center gap-2 rounded-lg py-2 pl-8 pr-2.5 text-[13px] text-slate-600 transition-colors hover:text-cyan-400 lg:py-1 lg:text-[11px]"
                        >
                          {t('nav.newChannel')}
                        </NavLink>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          )
        })}
      </nav>
      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-slate-800/70 px-4 py-2 text-[10px] text-slate-600">
        <Link to="/privacidade" className="hover:text-cyan-400">{t('auth.privacy')}</Link>
        <span>·</span>
        <Link to="/termos" className="hover:text-cyan-400">{t('auth.terms')}</Link>
      </div>
    </aside>
  )
}
