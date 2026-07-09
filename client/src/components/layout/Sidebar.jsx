import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Tv,
  Sparkles,
  Heart,
  Image,
  Mic,
  AudioLines,
  Monitor,
  FileText,
  Kanban,
  Compass,
  GitBranch,
  TrendingUp,
  ShieldAlert,
  GraduationCap,
  MessagesSquare,
  BookOpen,
} from 'lucide-react'
import Logo from '../Logo'
import { useI18n } from '../../i18n'

const groups = [
  { key: 'overview', items: [{ to: '/', label: 'dashboard', Icon: LayoutDashboard }] },
  { key: 'channels', items: [{ to: '/canais', label: 'channels', Icon: Tv }] },
  {
    key: 'library',
    items: [
      { to: '/prompts', label: 'prompts', Icon: Sparkles },
      { to: '/referencias', label: 'references', Icon: Heart },
      { to: '/videos-imagens', label: 'mediaBank', Icon: Image },
    ],
  },
  {
    key: 'tools',
    items: [
      { to: '/text-to-speech', label: 'tts', Icon: AudioLines },
      { to: '/transcricao', label: 'transcription', Icon: Mic },
      { to: '/app', label: 'app', Icon: Monitor, badge: 'NOVO' },
      { to: '/ferramentas-texto', label: 'textTools', Icon: FileText },
      { to: '/quadro-ideias', label: 'ideaBoard', Icon: Kanban },
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
      { to: '/api-docs', label: 'apiDocs', Icon: BookOpen },
    ],
  },
]

export default function Sidebar() {
  const { t } = useI18n()

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800/70 bg-slate-950">
      <div className="flex h-16 items-center border-b border-slate-800/70 px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-400/70">
              {t(`nav.groups.${group.key}`)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, Icon, badge }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-l-2 border-cyan-500 bg-cyan-500/10 text-cyan-300'
                          : 'border-l-2 border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`
                    }
                  >
                    <Icon size={17} />
                    {t(`nav.${label}`)}
                    {badge && (
                      <span className="ml-auto rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
