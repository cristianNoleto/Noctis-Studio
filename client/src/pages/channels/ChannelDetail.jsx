import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Pencil,
  Share2,
  Trash2,
  Settings,
  RefreshCw,
  ExternalLink,
  Film,
  CheckCircle,
  Clock,
  Users,
  Eye,
  Sparkles,
  Heart,
  AudioLines,
  Loader2,
} from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { btnGhost, ConfirmDialog, formatCompact } from '../../components/ui'
import { ChannelAvatar } from '../Dashboard'
import { EditChannelModal, CustomButtonsModal, ShareChannelModal, ChannelPromptsModal, ChannelReferencesModal } from './ChannelModals'
import VideosTable from './VideosTable'

const STATS_REFRESH_COOLDOWN_MS = 10 * 60 * 1000 // máx. 1x a cada 10 min (economia de cota)

export default function ChannelDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = useDb()
  const channel = db.get('channels', id)

  const [modal, setModal] = useState(null) // edit | buttons | share | prompts | references | delete
  const [refreshing, setRefreshing] = useState(false)
  const [statsError, setStatsError] = useState('')

  if (!channel) {
    return <p className="p-10 text-center text-slate-500">Canal não encontrado.</p>
  }

  const videos = db.all('videos').filter((v) => v.channelId === id)
  const posted = videos.filter((v) => v.status === 'published').length
  const pending = videos.length - posted
  const buttons = db
    .all('channelButtons')
    .filter((b) => b.channelId === id)
    .sort((a, b) => a.position - b.position)
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header do canal */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <ChannelAvatar channel={channel} size="h-14 w-14" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold text-slate-100">{channel.name}</h1>
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">YouTube</span>
            </div>
            {channel.notes && <p className="mt-0.5 max-w-xl truncate text-xs text-slate-500">{channel.notes}</p>}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <IconBtn title="Editar canal" onClick={() => setModal('edit')}>
              <Pencil size={15} />
            </IconBtn>
            <IconBtn title="Compartilhar canal" onClick={() => setModal('share')}>
              <Share2 size={15} />
            </IconBtn>
            <IconBtn title="Excluir canal" danger onClick={() => setModal('delete')}>
              <Trash2 size={15} />
            </IconBtn>
          </div>
        </div>

        {/* Botões customizados */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          {buttons.map((b) => (
            <a
              key={b.id}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
            >
              {b.label}
              <ExternalLink size={11} className="text-slate-600" />
            </a>
          ))}
          {buttons.length === 0 && <span className="text-xs text-slate-600">Nenhum atalho configurado ainda.</span>}
          <button
            onClick={() => setModal('buttons')}
            title="Configurar botões personalizados"
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
          >
            <Settings size={12} />
            Configurar
          </button>
        </div>
      </div>

      {/* Métricas operacionais + YouTube Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Film} label="TOTAL DE VÍDEOS" value={videos.length} color="text-cyan-400 bg-cyan-500/10" />
        <MetricCard icon={CheckCircle} label="POSTADOS" value={posted} color="text-green-400 bg-green-500/10" />
        <MetricCard icon={Clock} label="PENDENTES" value={pending} color="text-amber-400 bg-amber-500/10" />

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold tracking-wider text-slate-500">YOUTUBE STATS</p>
            <button
              onClick={refreshStats}
              disabled={!canRefresh || refreshing}
              title={
                !channel.youtubeChannelId
                  ? 'Importe o canal do YouTube para habilitar'
                  : cooldownLeft > 0
                    ? `Aguarde ${Math.ceil(cooldownLeft / 60000)}min para atualizar de novo`
                    : 'Atualizar estatísticas'
              }
              className="text-slate-500 transition-colors hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-5">
            <div>
              <p className="flex items-center gap-1.5 text-lg font-bold text-slate-100">
                <Users size={14} className="text-slate-500" />
                {formatCompact(channel.ytSubscribers)}
              </p>
              <p className="text-[10px] font-semibold tracking-wider text-slate-600">INSCRITOS</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-lg font-bold text-slate-100">
                <Eye size={14} className="text-slate-500" />
                {formatCompact(channel.ytTotalViews)}
              </p>
              <p className="text-[10px] font-semibold tracking-wider text-slate-600">VIEWS TOTAIS</p>
            </div>
          </div>
          {statsError && <p className="mt-2 text-[11px] text-red-400">{statsError}</p>}
        </div>
      </div>

      {/* Cards de controle central */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ControlCard
          icon={Sparkles}
          title="Prompts do Canal"
          desc={`${promptsCount} prompt${promptsCount === 1 ? '' : 's'} vinculado${promptsCount === 1 ? '' : 's'}`}
          actionLabel="Gerenciar"
          onAction={() => setModal('prompts')}
        />
        <ControlCard
          icon={Heart}
          title="Canais de Referência"
          desc={`${refsCount} canal${refsCount === 1 ? '' : 'is'} benchmark`}
          actionLabel="Gerenciar"
          onAction={() => setModal('references')}
        />
        <ControlCard icon={AudioLines} title="Narrador" desc="Vozes por IA para este canal" actionLabel="Em breve" disabled />
      </div>

      {/* Tabela Títulos & Vídeos */}
      <VideosTable channelId={id} />

      {/* Modais */}
      <EditChannelModal open={modal === 'edit'} onClose={() => setModal(null)} channel={channel} />
      <CustomButtonsModal open={modal === 'buttons'} onClose={() => setModal(null)} channelId={id} />
      <ShareChannelModal open={modal === 'share'} onClose={() => setModal(null)} channelId={id} />
      <ChannelPromptsModal open={modal === 'prompts'} onClose={() => setModal(null)} channelId={id} />
      <ChannelReferencesModal open={modal === 'references'} onClose={() => setModal(null)} channelId={id} />
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

function IconBtn({ children, title, onClick, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 transition-colors ${
        danger ? 'text-red-400 hover:border-red-500/50 hover:bg-red-500/10' : 'text-slate-400 hover:border-slate-700 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold tracking-wider text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
          <Icon size={17} />
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-100">{value}</p>
    </div>
  )
}

function ControlCard({ icon: Icon, title, desc, actionLabel, onAction, disabled }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-100">{title}</p>
        <p className="truncate text-xs text-slate-500">{desc}</p>
      </div>
      <button className={`${btnGhost} shrink-0 !px-3 !py-1.5 text-xs`} onClick={onAction} disabled={disabled}>
        {actionLabel}
      </button>
    </div>
  )
}
