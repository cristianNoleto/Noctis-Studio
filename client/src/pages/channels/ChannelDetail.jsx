import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Pencil,
  Link2,
  Share2,
  Unlink,
  Archive,
  Trash2,
  RefreshCw,
  ExternalLink,
  Film,
  CheckCircle,
  Clock,
  BarChart3,
  Users,
  Eye,
  MessageSquare,
  Bookmark,
  Mic,
  Loader2,
  Mail,
} from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { ConfirmDialog, formatCompact } from '../../components/ui'
import { ChannelAvatar } from '../Dashboard'
import { EditChannelModal, CustomButtonsModal, ShareChannelModal, ChannelPromptsModal, ChannelReferencesModal } from './ChannelModals'
import VideosTable from './VideosTable'

const STATS_REFRESH_COOLDOWN_MS = 10 * 60 * 1000 // máx. 1x a cada 10 min (economia de cota)

const LANG_LABEL = { pt: 'Português', en: 'Inglês', es: 'Espanhol', de: 'Alemão', fr: 'Francês', it: 'Italiano', ja: 'Japonês' }

export default function ChannelDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = useDb()
  const channel = db.get('channels', id)

  const [modal, setModal] = useState(null) // edit | buttons | share | prompts | references | delete | unlink | archive
  const [menuOpen, setMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [statsError, setStatsError] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (!channel) {
    return <p className="p-10 text-center text-slate-500">Canal não encontrado.</p>
  }

  const allChannels = db.all('channels').filter((c) => !c.archived)
  const chIndex = allChannels.findIndex((c) => c.id === id)
  const prevChannel = allChannels[chIndex - 1]
  const nextChannel = allChannels[chIndex + 1]

  const videos = db.all('videos').filter((v) => v.channelId === id)
  const posted = videos.filter((v) => ['published', 'scheduled'].includes(v.status)).length
  const pending = videos.length - posted
  const buttons = db.all('channelButtons').filter((b) => b.channelId === id).sort((a, b) => a.position - b.position)
  const promptsCount = db.all('prompts').filter((p) => p.channelId === id).length
  const refsCount = db.all('referenceChannels').filter((r) => r.channelId === id).length

  const cooldownLeft = channel.ytStatsUpdatedAt ? STATS_REFRESH_COOLDOWN_MS - (Date.now() - channel.ytStatsUpdatedAt) : 0
  const canRefresh = channel.youtubeChannelId && cooldownLeft <= 0

  async function refreshStats() {
    if (!canRefresh || refreshing) return
    setRefreshing(true)
    setStatsError('')
    try {
      const data = await api.youtube.channelStats(channel.youtubeChannelId)
      db.update('channels', id, {
        ytSubscribers: data.subscribers,
        ytTotalViews: data.views,
        ytVideoCount: data.videoCount,
        ytStatsUpdatedAt: Date.now(),
      })
    } catch (err) {
      setStatsError(apiErrorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }

  function deleteChannel() {
    db.removeWhere('videos', (v) => v.channelId === id)
    db.removeWhere('channelButtons', (b) => b.channelId === id)
    db.removeWhere('channelMembers', (m) => m.channelId === id)
    db.remove('channels', id)
    navigate('/canais')
  }

  const statsAge = channel.ytStatsUpdatedAt ? Math.round((Date.now() - channel.ytStatsUpdatedAt) / 60000) : null

  const menuItems = [
    { icon: Pencil, label: 'Editar Canal', cls: 'text-sky-300', action: () => setModal('edit') },
    { icon: Link2, label: 'Criar Atalhos', action: () => setModal('buttons') },
    { icon: Share2, label: 'Compartilhar', action: () => setModal('share') },
    ...(channel.youtubeChannelId ? [{ icon: Unlink, label: 'Desvincular YouTube', action: () => setModal('unlink') }] : []),
    channel.archived
      ? { icon: Archive, label: 'Desarquivar Canal', action: () => db.update('channels', id, { archived: false }) }
      : { icon: Archive, label: 'Arquivar Canal', action: () => setModal('archive') },
    { icon: Trash2, label: 'Excluir Canal', cls: 'text-red-400', action: () => setModal('delete') },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Navegação superior */}
      <div className="flex items-center justify-between">
        <Link to="/canais" className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300">
          <ArrowLeft size={15} />← Voltar para Canais
        </Link>
        <div className="flex gap-1.5">
          <NavArrow disabled={!prevChannel} onClick={() => prevChannel && navigate(`/canais/${prevChannel.id}`)}>
            <ChevronLeft size={15} />
          </NavArrow>
          <NavArrow disabled={!nextChannel} onClick={() => nextChannel && navigate(`/canais/${nextChannel.id}`)}>
            <ChevronRight size={15} />
          </NavArrow>
        </div>
      </div>

      {/* Header do canal */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="border-t-2 border-cyan-500/60" />
        <div className="flex items-center gap-4 p-5">
          <ChannelAvatar channel={channel} size="h-14 w-14" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="sensitive truncate text-xl font-bold text-slate-100">{channel.name}</h1>
              <span className="flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">▶ YouTube</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>🌐 {LANG_LABEL[channel.language] || channel.language}</span>
              {(channel.postTimes?.length ? channel.postTimes : [channel.defaultPostTime]).filter(Boolean).map((t) => (
                <span key={t} className="flex items-center gap-1">
                  <Clock size={11} />
                  {t}
                </span>
              ))}
              {channel.contactEmail && (
                <span className="flex items-center gap-1">
                  <Mail size={11} />
                  {channel.contactEmail}
                </span>
              )}
              {(channel.frequency || channel.weeklyFrequency) && (
                <span className="flex items-center gap-1 text-green-400/80">
                  📅 {channel.frequency || `${channel.weeklyFrequency}x por semana`}
                </span>
              )}
            </div>
            {channel.notes && <p className="mt-1.5 max-w-2xl truncate text-xs text-slate-600">📄 {channel.notes}</p>}
          </div>

          {/* Atalhos personalizados (com favicon do site) */}
          <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
            {buttons.map((b) => (
              <a
                key={b.id}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:-translate-y-0.5 hover:border-cyan-500/50 hover:text-cyan-300"
              >
                <ShortcutFavicon url={b.url} />
                {b.label}
              </a>
            ))}
          </div>

          {/* Menu 3 pontinhos */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-xl">
                {menuItems.map(({ icon: Icon, label, cls, action }) => (
                  <button
                    key={label}
                    onClick={() => {
                      setMenuOpen(false)
                      action()
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-slate-800 ${cls || 'text-slate-300'}`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Métricas + YouTube Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Film} label="TOTAL DE VÍDEOS" value={videos.length} color="text-cyan-400" />
        <MetricCard icon={CheckCircle} label="POSTADOS" value={posted} color="text-green-400" />
        <MetricCard icon={Clock} label="PENDENTES" value={pending} color="text-amber-400" />

        <div className="card-hover overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="border-t-2 border-cyan-500/60" />
          <div className="p-4">
            <div className="flex items-start justify-between">
              <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-slate-500">
                <BarChart3 size={12} className="text-cyan-400" />
                YOUTUBE STATS
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-600">
                  {statsAge == null ? 'nunca atualizado' : statsAge < 1 ? 'Atualizado agora' : `Atualizado há ${statsAge}min`}
                </span>
                <button
                  onClick={refreshStats}
                  disabled={!canRefresh || refreshing}
                  title={
                    !channel.youtubeChannelId
                      ? 'Importe o canal do YouTube para habilitar'
                      : cooldownLeft > 0
                        ? `Aguarde ${Math.ceil(cooldownLeft / 60000)}min`
                        : 'Atualizar estatísticas'
                  }
                  className="text-slate-500 transition-colors hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                </button>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 divide-x divide-slate-800 rounded-lg border border-slate-800 py-2 text-center">
              <YtStat icon={Users} value={formatCompact(channel.ytSubscribers)} label="Inscritos" />
              <YtStat icon={Eye} value={formatCompact(channel.ytTotalViews)} label="Views" />
              <YtStat icon={Film} value={channel.ytVideoCount ?? (videos.filter((v) => v.imported).length || '—')} label="Vídeos" />
            </div>
            {statsError && <p className="mt-2 text-[10px] text-red-400">{statsError}</p>}
          </div>
        </div>
      </div>

      {/* Cards de controle central */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <ControlCard
          icon={MessageSquare}
          title="Prompts do Canal"
          desc={promptsCount > 0 ? `${promptsCount} prompt${promptsCount === 1 ? '' : 's'} salvo${promptsCount === 1 ? '' : 's'}` : '0 prompts salvos'}
          actionLabel="Gerenciar"
          onAction={() => setModal('prompts')}
        />
        <ReferenceControlCard channelId={id} count={refsCount} onManage={() => setModal('references')} />
        <ControlCard icon={Mic} title="Narrador" desc="Não configurado" actionLabel="Configurar" disabled title2="Em breve (fase TTS)" />
      </div>

      {/* Títulos & Vídeos */}
      <VideosTable channelId={id} channel={channel} />

      {/* Modais */}
      <EditChannelModal open={modal === 'edit'} onClose={() => setModal(null)} channel={channel} />
      <CustomButtonsModal open={modal === 'buttons'} onClose={() => setModal(null)} channelId={id} />
      <ShareChannelModal open={modal === 'share'} onClose={() => setModal(null)} channelId={id} />
      <ChannelPromptsModal open={modal === 'prompts'} onClose={() => setModal(null)} channelId={id} />
      <ChannelReferencesModal open={modal === 'references'} onClose={() => setModal(null)} channelId={id} />
      <ConfirmDialog
        open={modal === 'unlink'}
        onClose={() => setModal(null)}
        onConfirm={() =>
          db.update('channels', id, { youtubeChannelId: null, ytSubscribers: null, ytTotalViews: null, ytVideoCount: null, ytStatsUpdatedAt: null })
        }
        title="Desvincular YouTube"
        message="O canal continua no sistema, mas perde a conexão com o YouTube (stats e importação de vídeos). Os vídeos já importados são mantidos."
        confirmLabel="Desvincular"
      />
      <ConfirmDialog
        open={modal === 'archive'}
        onClose={() => setModal(null)}
        onConfirm={() => {
          db.update('channels', id, { archived: true })
          navigate('/canais')
        }}
        title="Arquivar canal"
        message={`"${channel.name}" sai da lista principal, mas nada é apagado — você pode desarquivar em Gestão de Canais.`}
        confirmLabel="Arquivar"
      />
      <ConfirmDialog
        open={modal === 'delete'}
        onClose={() => setModal(null)}
        onConfirm={deleteChannel}
        title="Excluir canal"
        message={`Excluir "${channel.name}" apaga também todos os vídeos, roteiros e configurações vinculados. Essa ação não pode ser desfeita.`}
      />
    </div>
  )
}

function NavArrow({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card-hover overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="border-t-2 border-cyan-500/60" />
      <div className="p-4">
        <p className={`flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-slate-500`}>
          <Icon size={12} className={color} />
          {label}
        </p>
        <p className="sensitive mt-2 text-3xl font-bold text-slate-100">{value}</p>
      </div>
    </div>
  )
}

function YtStat({ icon: Icon, value, label }) {
  return (
    <div>
      <p className="sensitive flex items-center justify-center gap-1 text-sm font-bold text-slate-100">
        <Icon size={11} className="text-slate-500" />
        {value}
      </p>
      <p className="text-[9px] text-slate-600">{label}</p>
    </div>
  )
}

function ShortcutFavicon({ url }) {
  let domain = ''
  try {
    domain = new URL(url).hostname
  } catch {
    return null
  }
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" className="h-4 w-4 rounded-sm" loading="lazy" />
}

// Card "Canais de Referência" com os mini-perfis dos canais (layout do print)
function ReferenceControlCard({ channelId, count, onManage }) {
  const db = useDb()
  const refs = db
    .all('referenceChannels')
    .filter((r) => r.channelId === channelId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return (
    <div className="card-hover rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:col-span-2">
      <div className="flex items-center gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
          <Bookmark size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100">Canais de Referência</p>
          <p className="truncate text-xs text-slate-500">{count > 0 ? `${count} ${count === 1 ? 'canal' : 'canais'}` : 'Nenhuma referência vinculada'}</p>
        </div>
        <button
          onClick={onManage}
          className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/15"
        >
          ✏️ Gerenciar
        </button>
      </div>
      {refs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {refs.slice(0, 6).map((r) => (
            <a
              key={r.id}
              href={r.youtubeUrl.startsWith('http') ? r.youtubeUrl : `https://youtube.com/${r.youtubeUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 py-1 pl-1 pr-2.5 text-[11px] text-slate-300 transition-all hover:-translate-y-0.5 hover:border-cyan-500/40"
            >
              {r.cachedStats?.avatar ? (
                <img src={r.cachedStats.avatar} alt="" className="h-5 w-5 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-slate-400">
                  {(r.cachedStats?.title || 'Y').charAt(0)}
                </span>
              )}
              <span className="max-w-32 truncate font-medium">{r.cachedStats?.title || r.youtubeUrl.replace(/https?:\/\/(www\.)?youtube\.com\//, '')}</span>
            </a>
          ))}
          {refs.length > 6 && <span className="self-center text-[10px] text-slate-600">+{refs.length - 6}</span>}
        </div>
      )}
    </div>
  )
}

function ControlCard({ icon: Icon, title, desc, actionLabel, onAction, disabled, title2 }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="truncate text-xs text-slate-500">{desc}</p>
      </div>
      <button
        onClick={onAction}
        disabled={disabled}
        title={title2}
        className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ✏️ {actionLabel}
      </button>
    </div>
  )
}
