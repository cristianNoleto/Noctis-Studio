import { useCallback, useEffect, useState } from 'react'
import { Users, Plus, Star, Trash2, RefreshCw, Crown, User, TriangleAlert, Clock, ExternalLink, ScanSearch, LogIn, Zap } from 'lucide-react'
import { call, useEvent, useSettings, useToast } from '../lib/api'
import { btnDanger, btnGhost, btnPrimary, Card, EmptyState, Modal, PageHeader, Segmented, Spinner, Toggle } from '../components/ui'
import { IMAGE_MODELS, VIDEO_MODELS } from '../lib/media'

const DIST = [
  { value: 'sequential', label: 'Sequencial' },
  { value: 'parallel', label: 'Paralelo' },
  { value: 'auto', label: 'Automático' },
  { value: 'manual', label: 'Manual' },
]
const DIST_TXT = {
  sequential: 'Uma conta de cada vez: quando ela não pode gerar (pausa, cota, limite do dia), a próxima assume.',
  parallel: 'Todas as contas ativas enviam ao mesmo tempo, cada uma no seu ritmo.',
  auto: 'Uma por vez; todas juntas só quando a fila passa de 20 pedidos.',
  manual: 'Cada projeto usa a conta escolhida ao criar o projeto.',
}
const nomeModelo = (m) => [...IMAGE_MODELS, ...VIDEO_MODELS].find((x) => x.value === m)?.label || m || '—'

function restante(ts) {
  const s = Math.max(0, Math.round((ts - Date.now()) / 1000))
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}min`
  if (s >= 60) return `${Math.round(s / 60)} min`
  return `${s} s`
}

function CardConta({ c, onChange, toast }) {
  const [aba, setAba] = useState('dia')
  const [revelar, setRevelar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [remover, setRemover] = useState(false)
  const stats = c.stats?.[aba] || []
  const total = stats.reduce((a, s) => a + s.n, 0)
  const ultra = /ultra/i.test(c.plan || '')
  const faz = async (fn, ok) => { setOcupado(true); try { await fn(); if (ok) toast(ok, 'success') } catch (e) { toast(e.message, 'error') } finally { setOcupado(false); onChange() } }
  const statusUI = {
    active: { t: 'Ativa', cor: 'text-emerald-400', dot: 'bg-emerald-400' },
    cooldown: { t: 'Em pausa', cor: 'text-amber-400', dot: 'bg-amber-400' },
    quota: { t: 'Sem cota', cor: 'text-amber-400', dot: 'bg-amber-400' },
    reconnect: { t: 'Reconectar', cor: 'text-red-400', dot: 'bg-red-400' },
  }[c.enabled ? c.status : 'off'] || { t: 'Desligada', cor: 'text-slate-500', dot: 'bg-slate-600' }

  return (
    <Card className={`p-4 ${ultra ? 'border-amber-500/40' : ''} ${!c.enabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ultra ? 'border border-amber-500/40 bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>{ultra ? <Crown size={18} /> : <User size={18} />}</div>
        <div className="min-w-0 flex-1">
          <button className="truncate text-sm font-semibold text-slate-100" onClick={() => setRevelar(!revelar)} title="Clique para revelar">{revelar ? c.id : `${c.masked}@${c.id.split('@')[1] || ''}`}</button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-bold uppercase ${ultra ? 'text-amber-400' : 'text-slate-400'}`}>{c.plan || 'free'}</span>
            {['image', 'video'].map((t) => {
              const on = c.allowed_types.includes(t)
              return (
                <button key={t} title={on ? 'Clique para desligar este tipo' : 'Clique para ligar este tipo'} onClick={() => faz(() => call('accounts:update', c.id, { allowed_types: on ? c.allowed_types.filter((x) => x !== t) : [...c.allowed_types, t] }))}
                  className={`rounded border px-1.5 text-[10px] font-bold uppercase ${on ? (t === 'image' ? 'border-sky-500/40 text-sky-300' : 'border-violet-500/40 text-violet-300') : 'border-slate-700 text-slate-600 line-through'}`}>
                  {t === 'image' ? 'Imagem' : 'Vídeo'}
                </button>
              )
            })}
          </div>
        </div>
        <button title={c.is_default ? 'Conta padrão' : 'Tornar padrão'} onClick={() => faz(() => call('accounts:setDefault', c.id))} className={c.is_default ? 'text-amber-400' : 'text-slate-600 hover:text-amber-300'}><Star size={16} fill={c.is_default ? 'currentColor' : 'none'} /></button>
        <Toggle checked={c.enabled} onChange={(v) => faz(() => call('accounts:update', c.id, { enabled: v }))} />
        <button title="Remover conta" onClick={() => setRemover(true)} className="text-slate-600 hover:text-red-400"><Trash2 size={15} /></button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[['Créditos', c.credits ?? '—', 'text-slate-100'], ['Hoje', c.usedToday, 'text-cyan-300'], [aba === 'dia' ? 'Dia' : aba === 'mes' ? 'Mês' : 'Total', total, 'text-emerald-400']].map(([k, v, cor]) => (
          <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{k}</p><p className={`text-lg font-bold tabular-nums ${cor}`}>{v}</p></div>
        ))}
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Status</p><p className={`flex items-center gap-1.5 text-sm font-semibold ${statusUI.cor}`}><span className={`h-1.5 w-1.5 rounded-full ${statusUI.dot}`} />{statusUI.t}</p></div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {[['dia', 'Dia'], ['mes', 'Mês'], ['total', 'Total']].map(([k, l]) => <button key={k} onClick={() => setAba(k)} className={`rounded-lg py-1.5 text-xs font-semibold ${aba === k ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{l}</button>)}
      </div>
      {stats.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {stats.map((s) => <div key={`${s.kind}${s.model}`} className="flex items-center justify-between rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-200"><span className="truncate">{nomeModelo(s.model)}</span><b>{s.n}</b></div>)}
        </div>
      )}
      {(c.status === 'cooldown' || c.status === 'quota') && c.cooldown_until && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          <Clock size={13} /> <span className="flex-1">{c.status === 'quota' ? 'Sem cota/créditos' : 'Pausa pedida pelo Google'} — volta em {restante(c.cooldown_until)}.</span>
          <button className="font-semibold underline" onClick={() => faz(() => call('accounts:clearCooldown', c.id), 'Pausa liberada.')}>Forçar volta</button>
        </div>
      )}
      {c.status === 'reconnect' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          <TriangleAlert size={13} /> <span className="flex-1">O Google pediu para entrar de novo nesta conta.</span>
          <button className="font-semibold underline" disabled={ocupado} onClick={() => { toast('Entre na conta no Chrome que vai abrir; ele fecha sozinho quando o login for detectado.', 'info'); faz(() => call('accounts:reconnect', c.id), 'Conta reconectada.') }}>Reconectar</button>
        </div>
      )}
      <div className="mt-3 flex items-center gap-1.5">
        <button className={`${btnGhost} px-2.5 py-1 text-xs`} disabled={ocupado} onClick={() => faz(async () => { const ok = await call('accounts:check', c.id); if (!ok) throw new Error('A conta não está logada no Flow. Use Reconectar.') }, 'Conta logada e pronta.')}>{ocupado ? <Spinner size={12} /> : <RefreshCw size={12} />} Conferir</button>
        <button className={`${btnGhost} px-2.5 py-1 text-xs`} onClick={() => faz(() => call('accounts:open', c.id))}><ExternalLink size={12} /> Abrir Flow</button>
        <button className={`${btnGhost} px-2.5 py-1 text-xs`} title="Salva print e mapa da tela do Flow para ajustar o app" onClick={() => faz(() => call('accounts:diagnose', c.id), 'Diagnóstico salvo (pasta aberta).')}><ScanSearch size={12} /> Diagnóstico</button>
        <span className="ml-auto text-[10px] text-slate-600">{c.last_used ? `Último uso: ${new Date(c.last_used).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      </div>
      <Modal open={remover} onClose={() => setRemover(false)} title="Remover conta" width="max-w-md"
        footer={<><button className={btnGhost} onClick={() => setRemover(false)}>Cancelar</button><button className={btnDanger} onClick={() => { setRemover(false); faz(() => call('accounts:remove', c.id), 'Conta removida.') }}>Remover</button></>}>
        <p className="text-sm text-slate-400">Tirar {c.id} do app? O perfil do Chrome desta conta é apagado; os projetos que usavam ela passam a usar a conta padrão.</p>
      </Modal>
    </Card>
  )
}

export default function Contas() {
  const toast = useToast()
  const { settings, save } = useSettings()
  const [contas, setContas] = useState(null)
  const [conectando, setConectando] = useState(false)
  const [risco, setRisco] = useState(false)
  const carregar = useCallback(() => call('accounts:list').then(setContas).catch((e) => toast(e.message, 'error')), [toast])
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t) }, [carregar])
  useEvent('accounts:update', carregar)
  useEvent('creator:update', carregar)

  const dist = settings?.dispatch?.distribution || 'sequential'
  const mudarDist = (v) => (v === 'parallel' ? setRisco(true) : save({ dispatch: { distribution: v } }))
  async function conectar() {
    setConectando(true)
    try {
      const c = await call('accounts:connect', 'flow')
      toast(`Conta ${c.id} conectada.`, 'success')
      carregar()
    } catch (e) { toast(e.message, 'error') } finally { setConectando(false) }
  }
  const flow = (contas || []).filter((c) => c.provider === 'flow')

  return (
    <div className="mx-auto max-w-[1500px] px-8 py-7">
      <PageHeader icon={Users} kicker="Sistema" title="Contas" subtitle="Suas contas Google e como os pedidos se distribuem entre elas." />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-bold">Contas Google</h2>
        <span className="text-xs text-slate-500">Distribuição:</span>
        <Segmented value={dist} onChange={mudarDist} options={DIST} />
        <div className="flex-1" />
        <button className={btnPrimary} disabled={conectando} onClick={conectar}>{conectando ? <Spinner size={15} /> : <Plus size={15} />}{conectando ? 'Aguardando login no Chrome…' : 'Adicionar conta'}</button>
      </div>
      <p className="mb-5 text-sm text-slate-500">{DIST_TXT[dist]}</p>
      {conectando && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">
          <LogIn size={16} className="shrink-0" />
          <span className="flex-1">Uma janela do Chrome abriu no Flow. Entre na sua conta Google por lá (se o Flow pedir, clique em "Entrar"). Quando o login for detectado, o Chrome <b>fecha sozinho</b> e a conta aparece aqui — pode levar até 30 s.</span>
          <button className="shrink-0 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold hover:bg-cyan-500/10" onClick={() => call('accounts:loginDone').catch(() => {})}>Já entrei</button>
        </div>
      )}
      {contas && flow.length === 0 && (
        <EmptyState icon={Users} title="Nenhuma conta conectada" description="As contas Google são quem gera suas imagens e vídeos no Flow. Clique em Adicionar conta: abre o Chrome e você entra normalmente." />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4">
        {flow.map((c) => <CardConta key={c.id} c={c} onChange={carregar} toast={toast} />)}
      </div>

      <div className="mt-10 border-t border-slate-800 pt-6">
        <div className="flex items-center gap-3"><Zap size={18} className="text-cyan-400" /><h2 className="text-lg font-bold">Contas Grok</h2><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">EM BREVE</span></div>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">O motor do Grok entra numa próxima versão, com o mesmo modelo das contas Google: você loga uma vez numa janela do Chrome e o app reusa a sessão.</p>
      </div>

      <Modal open={risco} onClose={() => setRisco(false)} width="max-w-lg">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><TriangleAlert size={22} /></div>
          <h3 className="mb-2 text-lg font-bold">Risco de cooldown</h3>
          <p className="text-sm leading-relaxed text-slate-400">Todas as suas contas vão enviar prompts <b className="text-amber-300">ao mesmo tempo</b>. O Google pode <b className="text-amber-300">pausar contas por um tempo</b> (cooldown). Se acontecer, aumente o intervalo entre envios ou volte para Sequencial.</p>
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">Conta em pausa só volta quando o Google liberar, em geral depois de algumas horas. O pedido espera a mesma conta — o app não passa para outra.</div>
          <div className="mt-5 flex gap-2">
            <button className={`${btnGhost} flex-1`} onClick={() => setRisco(false)}>Cancelar</button>
            <button className={`${btnPrimary} flex-1`} onClick={() => { save({ dispatch: { distribution: 'parallel' } }); setRisco(false) }}>Ativar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
