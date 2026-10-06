import { useCallback, useEffect, useState } from 'react'
import { Clock, Loader2, CircleCheck, Coins, RefreshCw, Pause, Play, Images, Music, FolderPen, Film, Users } from 'lucide-react'
import { call, useEvent } from '../lib/api'
import { mediaUrl, isVideo } from '../lib/media'
import { Mark } from '../components/Logo'
import { btnGhost, Card, EmptyState } from '../components/ui'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export default function Dashboard({ go }) {
  const [d, setD] = useState(null)
  const [auth, setAuth] = useState(null)
  const carregar = useCallback(() => call('creator:dashboard').then(setD).catch(() => {}), [])
  useEffect(() => { carregar(); call('auth:state').then(setAuth).catch(() => {}) }, [carregar])
  useEvent('creator:update', carregar)

  const pills = d ? [
    [Clock, d.queue.pending, 'Na fila', 'text-amber-400'],
    [Loader2, d.queue.processing, 'Gerando', 'text-cyan-400'],
    [CircleCheck, d.doneToday, 'Gerados hoje', 'text-emerald-400'],
    [Coins, d.credits, 'Créditos', 'text-violet-300'],
    [RefreshCw, d.rewrites, 'Reescritos', 'text-orange-400'],
  ] : []

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-8 py-7">
      <Card className="relative overflow-hidden px-8 py-10 text-center">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[380px] w-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,242,254,0.10),transparent_65%)]" />
        <div className="relative">
          <div className="mb-4 flex justify-center"><Mark className="h-16 w-16 drop-shadow-[0_0_24px_rgba(0,242,254,0.35)]" /></div>
          <h1 className="text-2xl font-bold tracking-tight">{saudacao()}, {auth?.user?.name?.split(' ')[0] || 'criador'}</h1>
          <p className="mt-1 text-sm text-slate-500">Aqui está o resumo da sua produção.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {pills.map(([Icon, n, rot, cor]) => (
              <div key={rot} className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm">
                <Icon size={15} className={cor} /><b className="tabular-nums text-slate-100">{n ?? 0}</b><span className="text-xs text-slate-500">{rot}</span>
              </div>
            ))}
            {d && (
              <button className={`${btnGhost} rounded-full`} onClick={async () => { await call(d.queue.paused ? 'creator:resume' : 'creator:pause'); carregar() }}>
                {d.queue.paused ? <Play size={14} /> : <Pause size={14} />}{d.queue.paused ? 'Retomar fila' : 'Pausar fila'}
              </button>
            )}
          </div>
        </div>
      </Card>

      {d && d.generating.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Gerando agora</p>
          <div className="space-y-1.5">
            {d.generating.map((j) => (
              <div key={j.id} className="flex items-center gap-3 rounded-lg bg-slate-950/50 px-3 py-2 text-sm">
                <Loader2 size={14} className="animate-spin text-cyan-400" />
                <span className="text-xs font-bold text-cyan-300">#{j.seq}</span>
                <span className="truncate text-slate-300">{j.prompt}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-500">{j.project_name} · {j.account_id ? `${j.account_id.slice(0, 4)}***` : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Últimas gerações</p>
        {!d || d.recent.length === 0 ? (
          <EmptyState icon={Images} title="Nada gerado ainda" description="Conecte uma conta Google em Contas, crie um projeto e mande os prompts." />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
            {d.recent.map((j) => {
              const f = j.files[0]
              return (
                <button key={j.id} onClick={() => go(`creator/${j.project_id}`)} className="card-hover aspect-video overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                  {isVideo(f) ? <video src={mediaUrl(f)} muted className="h-full w-full object-cover" /> : <img src={mediaUrl(f)} className="h-full w-full object-cover" alt="" />}
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[[Images, 'Meus Projetos', 'projetos'], [Film, 'Sincronizador SRT', 'srt'], [Music, 'Audio Atlas', 'audio-atlas'], [FolderPen, 'Renomeador', 'renomeador'], [Users, 'Contas', 'contas']].map(([Icon, rot, p]) => (
          <button key={p} onClick={() => go(p)} className="card-hover flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3.5 text-left text-sm font-semibold text-slate-200 hover:border-cyan-500/30">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400"><Icon size={17} /></span>{rot}
          </button>
        ))}
      </div>
    </div>
  )
}
