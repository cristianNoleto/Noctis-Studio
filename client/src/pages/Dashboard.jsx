import { Link } from 'react-router-dom'
import {
  Tv,
  Clapperboard,
  CheckCircle,
  CalendarClock,
  Compass,
  TrendingUp,
  GitBranch,
  ArrowRight,
  Sparkles,
  MessageCircle,
  Users,
  Eye,
  Film,
  ExternalLink,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useDb } from '../lib/db'
import { formatCompact } from '../components/ui'
import { PrivacyScope, PageEye, Masked, useRestricted } from '../components/privacy'

const WHATSAPP_COMMUNITY_URL = import.meta.env.VITE_WHATSAPP_COMMUNITY_URL || ''
const DISCORD_URL = import.meta.env.VITE_DISCORD_URL || ''

const TAG_CLS = {
  NOVO: 'bg-green-500/15 text-green-400',
  MELHORIA: 'bg-cyan-500/15 text-cyan-400',
  ATUALIZAÇÃO: 'bg-amber-500/15 text-amber-400',
  ALERTA: 'bg-red-500/15 text-red-400', // canais monitorados explodindo/sumindo
}

function formatToday(lang) {
  const locale = lang === 'pt' ? 'pt-BR' : 'en-US'
  const text = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export default function Dashboard() {
  const { user } = useAuth()
  const { lang } = useI18n()
  const db = useDb()

  const channels = db.all('channels').filter((c) => !c.archived)
  const videos = db.all('videos')
  const transcriptions = db.all('transcriptions')
  // Novidades vêm do banco local — o admin gerencia em /admin
  const platformUpdates = [...db.all('platformUpdates')]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((u, i) => ({
      ...u,
      recent: i === 0,
      tagCls: TAG_CLS[u.tag] || TAG_CLS.NOVO,
      date: new Date(u.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
    }))

  const inProduction = videos.filter((v) => v.status === 'production').length
  const published = videos.filter((v) => v.status === 'published').length
  const scheduled = videos.filter((v) => v.status === 'scheduled').length
  const activeTranscriptions = transcriptions.filter((t) => !['done', 'error'].includes(t.status)).length

  const metrics = [
    {
      label: 'TOTAL CANAIS',
      value: channels.length,
      Icon: Tv,
      color: 'text-cyan-400 bg-cyan-500/10',
      sub: channels.length > 0 ? `▲ ${channels.length} ativo${channels.length > 1 ? 's' : ''}` : null,
      subCls: 'bg-green-500/10 text-green-400',
    },
    {
      label: 'EM PRODUÇÃO',
      value: inProduction,
      Icon: Clapperboard,
      color: 'text-amber-400 bg-amber-500/10',
      sub: activeTranscriptions > 0 ? `${activeTranscriptions} transcrição em andamento` : inProduction === 0 ? '▲ Tudo em dia' : null,
      subCls: 'bg-green-500/10 text-green-400',
    },
    { label: 'PUBLICADOS', value: published, Icon: CheckCircle, color: 'text-green-400 bg-green-500/10' },
    { label: 'AGENDADOS', value: scheduled, Icon: CalendarClock, color: 'text-sky-400 bg-sky-500/10' },
  ]

  const shortcuts = [
    { to: '/niche-finder', label: 'Niche Finder', sub: 'Canais que estão bombando', Icon: Compass },
    { to: '/videos-virais', label: 'Vídeos Virais', sub: 'Filtros avançados de busca', Icon: TrendingUp },
    { to: '/dobra-de-nicho', label: 'Dobra de Nicho', sub: 'Grafo de oportunidades por IA', Icon: GitBranch },
    { to: '/canais', label: 'Gestão de Canais', sub: 'Pipeline dos seus canais', Icon: Tv },
  ]

  return (
    <PrivacyScope page="dashboard">
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Saudação + olho do modo restrito desta página */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{formatToday(lang)}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">
            Olá, <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">{user?.name}</span> 👋
          </h1>
        </div>
        <PageEye />
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, sub, subCls, Icon, color }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold tracking-wider text-slate-500">{label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-2 text-4xl font-bold text-slate-100"><Masked mask="••">{value}</Masked></p>
            {sub && <span className={`mt-3 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${subCls}`}>{sub}</span>}
          </div>
        ))}
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map(({ to, label, sub, Icon, soon }) => (
          <Link
            key={to}
            to={to}
            className="group relative flex items-center gap-3.5 rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-cyan-500/50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
              <Icon size={21} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-100">{label}</p>
              <p className="truncate text-xs text-slate-500">{sub}</p>
            </div>
            {soon && (
              <span className="absolute right-3 top-3 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                EM BREVE
              </span>
            )}
            <ArrowRight size={15} className="ml-auto shrink-0 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-cyan-400" />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Novidades */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 xl:col-span-2">
          <div className="flex items-center justify-between border-b border-cyan-500/40 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold text-slate-100">
              <Sparkles size={16} className="text-cyan-400" />
              Novidades da Plataforma
            </h2>
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-bold text-green-400">
              <span className="online-dot h-1.5 w-1.5 rounded-full bg-green-400" />
              AO VIVO
            </span>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto p-4">
            {platformUpdates.map((u) => (
              <div
                key={u.id}
                className={`rounded-lg border p-4 ${u.recent ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-transparent'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 font-semibold text-slate-200">
                    {u.title}
                    {u.recent && (
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300">RECENTE</span>
                    )}
                  </p>
                  <span className="shrink-0 text-xs text-slate-500">📅 {u.date}</span>
                </div>
                <div className="mt-2 flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${u.tagCls}`}>{u.tag}</span>
                  <p className="text-sm leading-relaxed text-slate-400">{u.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita: Comunidade */}
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="border-b border-cyan-500/40 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-100">
                <Users size={16} className="text-cyan-400" />
                Comunidade
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">De creator para creator</p>
            </div>
            <div className="space-y-3 p-4">
              <CommunityRow
                href={WHATSAPP_COMMUNITY_URL}
                title="WhatsApp"
                sub="Grupo da comunidade"
                cls="border-green-500/30 bg-green-500/5 hover:bg-green-500/10"
                icon={<MessageCircle size={18} className="text-green-400" />}
              />
              <CommunityRow
                href={DISCORD_URL}
                title="Discord"
                sub="Chat em tempo real"
                cls="border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400" aria-hidden="true">
                    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resumo dos Canais */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-100">
          <Tv size={16} className="text-cyan-400" />
          Resumo dos Canais
        </h2>
        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
            <p className="text-sm text-slate-500">Nenhum canal cadastrado ainda.</p>
            <Link to="/canais" className="mt-3 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600">
              Criar meu primeiro canal
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {channels.map((ch) => {
              const chVideos = videos.filter((v) => v.channelId === ch.id)
              return (
                <Link
                  key={ch.id}
                  to={`/canais/${ch.id}`}
                  className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-cyan-500/50"
                >
                  <div className="flex items-center gap-3">
                    <ChannelAvatar channel={ch} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100"><Masked mask="•••••••">{ch.name}</Masked></p>
                      {ch.ytStatsUpdatedAt && (
                        <p className="text-[11px] text-slate-500">
                          Atualizado há {Math.max(1, Math.round((Date.now() - ch.ytStatsUpdatedAt) / 60000))}min
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 divide-x divide-slate-800 rounded-lg border border-slate-800 py-2 text-center">
                    <Stat icon={Users} label="SUBS" value={formatCompact(ch.ytSubscribers)} sensitive />
                    <Stat icon={Eye} label="VIEWS" value={formatCompact(ch.ytTotalViews)} sensitive />
                    <Stat icon={Film} label="VÍDEOS" value={chVideos.length} sensitive />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </PrivacyScope>
  )
}

// No modo restrito a foto/inicial NÃO é renderizada — entra um "?" no lugar
export function ChannelAvatar({ channel, size = 'h-10 w-10' }) {
  const restricted = useRestricted()
  if (restricted) {
    return (
      <span className={`${size} flex shrink-0 select-none items-center justify-center rounded-full border border-slate-700 bg-slate-800 font-bold text-slate-500`}>
        ?
      </span>
    )
  }
  return channel.avatarUrl ? (
    <img src={channel.avatarUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} referrerPolicy="no-referrer" />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 font-bold text-white`}>
      {channel.name?.charAt(0).toUpperCase()}
    </span>
  )
}

function Stat({ icon: Icon, label, value, sensitive }) {
  return (
    <div>
      <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-200">
        <Icon size={12} className="text-slate-500" />
        {sensitive ? <Masked mask="••">{value ?? 0}</Masked> : (value ?? 0)}
      </p>
      <p className="text-[10px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}

function CommunityRow({ href, title, sub, icon, cls }) {
  const inner = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        <p className="truncate text-xs text-slate-500">{sub}</p>
      </div>
      <ExternalLink size={14} className="shrink-0 text-slate-600" />
    </>
  )
  const base = `flex items-center gap-3 rounded-lg border p-3 transition-colors ${cls}`
  if (!href) return <div className={base}>{inner}</div>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
      {inner}
    </a>
  )
}
