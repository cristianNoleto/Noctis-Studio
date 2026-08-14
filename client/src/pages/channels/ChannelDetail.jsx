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
  Loader2,
  Mail,
  Compass,
} from 'lucide-react'
import { useDb } from '../../lib/db'
import { useAuth } from '../../auth/AuthContext'
import { api, apiErrorMessage } from '../../lib/api'
import { isPosted } from '../../lib/videoStatus'
import { useI18n } from '../../i18n'
import { ConfirmDialog, formatCompact } from '../../components/ui'
import { PrivacyScope, PageEye, Masked } from '../../components/privacy'
import { ChannelAvatar } from '../Dashboard'
import { EditChannelModal, CustomButtonsModal, ShareChannelModal, ChannelPromptsModal, ChannelReferencesModal } from './ChannelModals'
import VideosTable from './VideosTable'

const STATS_REFRESH_COOLDOWN_MS = 10 * 60 * 1000 // máx. 1x a cada 10 min (economia de cota)
const STATS_STALE_MS = 24 * 60 * 60 * 1000 // stats com +24h → atualiza sozinho ao abrir o canal


export default function ChannelDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = useDb()
  const { t } = useI18n()
  const { isFounder } = useAuth()
  const channel = db.get('channels', id)
  // Só o dono do workspace configura/exclui o canal. Colaborador (mesmo editor)
  // mexe apenas nos vídeos.
  const isOwner = db.access().self

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

  // Atualização SILENCIOSA das stats do YouTube ao abrir o canal: se os dados
  // estão com +24h (ou nunca foram buscados), dispara um refresh em 2º plano —
  // os números atuais já aparecem na hora e se atualizam quando chegam, sem
  // loading travando. Só no PRÓPRIO workspace (colaborador não grava canal) e
  // 1x por canal por montagem. O botão manual continua para forçar na hora.
  const autoRefreshedRef = useRef(null)
  useEffect(() => {
    if (!isOwner || !channel?.youtubeChannelId) return
    if (autoRefreshedRef.current === id) return
    const age = channel.ytStatsUpdatedAt ? Date.now() - channel.ytStatsUpdatedAt : Infinity
    if (age <= STATS_STALE_MS) return
    autoRefreshedRef.current = id
    refreshStats() // silencioso (best-effort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isOwner, channel?.youtubeChannelId])

  if (!channel) {
    return <p className="p-10 text-center text-slate-500">Canal não encontrado.</p>
  }

  const allChannels = db.all('channels').filter((c) => !c.archived)
  const chIndex = allChannels.findIndex((c) => c.id === id)
  const prevChannel = allChannels[chIndex - 1]
  const nextChannel = allChannels[chIndex + 1]

  const videos = db.all('videos').filter((v) => v.channelId === id)
  const posted = videos.filter(isPosted).length
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

  const statsAge = channel.ytStatsUpdatedAt ? Math.round((Date.now() - channel.ytStatsUpdatedAt) / 60000) : null // em minutos
  // Rótulo humano: agora / há X min / há X h / há X d.
  const statsAgoLabel =
    statsAge == null
      ? t('channels.detail.neverUpdated')
      : refreshing
        ? t('channels.detail.updatingNow')
        : statsAge < 1
          ? t('channels.detail.updatedNow')
          : statsAge < 60
            ? t('channels.detail.updatedAgo', { n: statsAge })
            : statsAge < 1440
              ? t('channels.detail.updatedAgoH', { n: Math.round(statsAge / 60) })
              : t('channels.detail.updatedAgoD', { n: Math.round(statsAge / 1440) })

  const menuItems = [
    { icon: Pencil, label: t('channels.detail.editChannel'), cls: 'text-sky-300', action: () => setModal('edit') },
    { icon: Link2, label: t('channels.detail.createShortcuts'), action: () => setModal('buttons') },
    { icon: Share2, label: t('channels.detail.share'), action: () => setModal('share') },
    ...(channel.youtubeChannelId ? [{ icon: Unlink, label: t('channels.detail.unlinkYoutube'), action: () => setModal('unlink') }] : []),
    channel.archived
      ? { icon: Archive, label: t('channels.detail.unarchive'), action: () => db.update('channels', id, { archived: false }) }
      : { icon: Archive, label: t('channels.detail.archive'), action: () => setModal('archive') },
    { icon: Trash2, label: t('channels.detail.deleteChannel'), cls: 'text-red-400', action: () => setModal('delete') },
  ]

  return (
    <PrivacyScope page="canais">
    <div className="mx-auto max-w-[1600px] space-y-4">
      {/* Navegação superior */}
      <div className="flex items-center justify-between">
        <Link to="/canais" className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300">
          <ArrowLeft size={15} />{t('channels.detail.back')}
        </Link>
        <div className="flex gap-1.5">
          <PageEye />
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
              <h1 className="truncate text-xl font-bold text-slate-100"><Masked mask="•••••••">{channel.name}</Masked></h1>
              {channel.youtubeChannelId ? (
                <a
                  href={`https://www.youtube.com/channel/${channel.youtubeChannelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('videos.openYoutube')}
                  className="flex shrink-0 items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-red-600"
                >
                  ▶ YouTube
                </a>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">▶ YouTube</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>🌐 {t(`common.langFull.${channel.language}`)}</span>
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

          {/* Menu 3 pontinhos — só o dono configura o canal */}
          {isOwner && (
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
          )}
        </div>
      </div>

      {/* Métricas + YouTube Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Film} label={t('channels.detail.metricTotal')} value={videos.length} color="text-cyan-400" />
        <MetricCard icon={CheckCircle} label={t('channels.detail.metricPosted')} value={posted} color="text-green-400" />
        <MetricCard icon={Clock} label={t('channels.detail.metricPending')} value={pending} color="text-amber-400" />

        <div className="card-hover overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="border-t-2 border-cyan-500/60" />
          <div className="p-4">
            <div className="flex items-start justify-between">
              <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-slate-500">
                <BarChart3 size={12} className="text-cyan-400" />
                {t('channels.detail.ytStats')}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-600">{statsAgoLabel}</span>
                <button
                  onClick={refreshStats}
                  disabled={!canRefresh || refreshing}
                  title={
                    !channel.youtubeChannelId
                      ? t('channels.detail.importToEnable')
                      : cooldownLeft > 0
                        ? t('channels.detail.wait', { n: Math.ceil(cooldownLeft / 60000) })
                        : t('channels.detail.refreshStats')
                  }
                  className="text-slate-500 transition-colors hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                </button>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 divide-x divide-slate-800 rounded-lg border border-slate-800 py-2 text-center">
              <YtStat icon={Users} value={formatCompact(channel.ytSubscribers)} label={t('channels.detail.ytSubs')} />
              <YtStat icon={Eye} value={formatCompact(channel.ytTotalViews)} label={t('channels.detail.ytViews')} />
              <YtStat icon={Film} value={channel.ytVideoCount ?? (videos.filter((v) => v.imported).length || '—')} label={t('channels.detail.ytVideos')} />
            </div>
            {statsError && <p className="mt-2 text-[10px] text-red-400">{statsError}</p>}
          </div>
        </div>
      </div>

      {/* Cards de controle central — config do canal, só para o dono */}
      {isOwner && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PromptsControlCard channelId={id} count={promptsCount} onManage={() => setModal('prompts')} />
          <ReferenceControlCard channelId={id} count={refsCount} onManage={() => setModal('references')} />
        </div>
      )}

      {/* Card de acesso à Validação — abre em página própria. EM TESTE: só o fundador. */}
      {isFounder && (
        <button
          onClick={() => navigate(`/canais/${id}/validacao`)}
          className="card-hover flex w-full items-center gap-3.5 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-left transition-colors hover:border-cyan-500/40"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <Compass size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-100">Validação do canal</p>
            <p className="truncate text-xs text-slate-500">Decida com critério e prazo: começar, seguir ou parar. Abre em tela própria.</p>
          </div>
          <span className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/5 px-3 py-1.5 text-xs font-medium text-cyan-300">Abrir →</span>
        </button>
      )}

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
        title={t('channels.detail.unlinkTitle')}
        message={t('channels.detail.unlinkMsg')}
        confirmLabel={t('channels.detail.unlinkConfirm')}
      />
      <ConfirmDialog
        open={modal === 'archive'}
        onClose={() => setModal(null)}
        onConfirm={() => {
          db.update('channels', id, { archived: true })
          navigate('/canais')
        }}
        title={t('channels.detail.archiveTitle')}
        message={t('channels.detail.archiveMsg', { name: channel.name })}
        confirmLabel={t('channels.detail.archiveConfirm')}
      />
      <ConfirmDialog
        open={modal === 'delete'}
        onClose={() => setModal(null)}
        onConfirm={deleteChannel}
        title={t('channels.detail.deleteTitle')}
        message={t('channels.detail.deleteMsg', { name: channel.name })}
      />
    </div>
    </PrivacyScope>
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
        <p className="mt-2 text-3xl font-bold text-slate-100"><Masked mask="••">{value}</Masked></p>
      </div>
    </div>
  )
}

function YtStat({ icon: Icon, value, label }) {
  return (
    <div>
      <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-100">
        <Icon size={11} className="text-slate-500" />
        <Masked mask="••">{value}</Masked>
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

// Card "Prompts do Canal" — mesmo padrão do bloco de referências: largura
// total, preview inline dos prompts salvos e botão Gerenciar.
function PromptsControlCard({ channelId, count, onManage }) {
  const db = useDb()
  const { t } = useI18n()
  const prompts = db.all('prompts').filter((p) => p.channelId === channelId)

  return (
    <div className="card-hover rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:col-span-2">
      <div className="flex items-center gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
          <MessageSquare size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100">{t('channels.detail.promptsTitle')}</p>
          <p className="truncate text-xs text-slate-500">{count > 0 ? t('channels.detail.promptsCount', { n: count }) : t('channels.detail.promptsEmpty')}</p>
        </div>
        <button
          onClick={onManage}
          className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/5 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"
        >
          ✏️ {t('channels.detail.manage')}
        </button>
      </div>
      {prompts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-3">
          {prompts.slice(0, 6).map((p) => (
            <span
              key={p.id}
              title={p.content}
              className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300"
            >
              <MessageSquare size={11} className="text-cyan-400" />
              <span className="max-w-[140px] truncate">{p.name}</span>
            </span>
          ))}
          {prompts.length > 6 && <span className="self-center text-[11px] text-slate-500">+{prompts.length - 6}</span>}
        </div>
      )}
    </div>
  )
}

// Card "Canais de Referência" com os mini-perfis dos canais (layout do print)
function ReferenceControlCard({ channelId, count, onManage }) {
  const db = useDb()
  const { t } = useI18n()
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
          <p className="text-sm font-semibold text-slate-100">{t('channels.detail.refsTitle')}</p>
          <p className="truncate text-xs text-slate-500">{count > 0 ? t('channels.detail.refsCount', { n: count }) : t('channels.detail.refsEmpty')}</p>
        </div>
        <button
          onClick={onManage}
          className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/15"
        >
          ✏️ {t('channels.detail.manage')}
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

