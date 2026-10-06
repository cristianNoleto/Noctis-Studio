import { useEffect, useMemo, useState } from 'react'
import { Globe, Sparkles, Zap, User, Settings, FolderOpen, Eye, EyeOff, TriangleAlert, Download, LogOut, RefreshCw } from 'lucide-react'
import { call, useSettings, useToast } from '../lib/api'
import { btnDanger, btnGhost, btnPrimary, Field, inputCls, Modal, Toggle } from '../components/ui'
import { avaliarRitmo } from '../lib/ritmo'

const TABS = [
  { key: 'geral', label: 'Geral', Icon: Globe },
  { key: 'reescrita', label: 'Reescrita IA', Icon: Sparkles },
  { key: 'avancado', label: 'Avançado', Icon: Zap },
  { key: 'conta', label: 'Conta', Icon: User },
]

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
function set(o, p, v) {
  const ks = p.split('.')
  const out = structuredClone(o)
  let cur = out
  ks.slice(0, -1).forEach((k) => { cur[k] = cur[k] || {}; cur = cur[k] })
  cur[ks.at(-1)] = v
  return out
}

export default function Configuracoes() {
  const { settings, save } = useSettings()
  const toast = useToast()
  const [tab, setTab] = useState('geral')
  const [draft, setDraft] = useState(null)
  const [showKeys, setShowKeys] = useState(false)
  const [riscoOpen, setRiscoOpen] = useState(false)
  const [info, setInfo] = useState(null)
  const [auth, setAuth] = useState(null)

  useEffect(() => { if (settings && !draft) setDraft(settings) }, [settings, draft])
  useEffect(() => { call('app:info').then(setInfo).catch(() => {}); call('auth:state').then(setAuth).catch(() => {}) }, [])

  const mudou = useMemo(() => {
    if (!draft || !settings) return []
    const campos = ['lang', 'projectsRoot', 'fileNamePattern', 'closeAction', 'rewrite.keys', 'rewrite.maxAttempts', 'rewrite.systemPrompt', 'rewrite.model',
      'dispatch.delay', 'dispatch.maxConcurrentPerAccount', 'dispatch.parallelAccounts', 'dispatch.dailyCapPerAccount', 'dispatch.headless']
    return campos.filter((c) => JSON.stringify(get(draft, c)) !== JSON.stringify(get(settings, c)))
  }, [draft, settings])

  if (!draft) return null
  const upd = (p, v) => setDraft((d) => set(d, p, v))
  const dot = (p) => mudou.includes(p) && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
  const ritmo = avaliarRitmo(draft.dispatch.delay)

  async function salvar() {
    if (!ritmo.valido) return toast(ritmo.erro, 'error')
    try {
      const keys = (Array.isArray(draft.rewrite.keys) ? draft.rewrite.keys : String(draft.rewrite.keys).split('\n')).map((k) => k.trim()).filter(Boolean)
      const novo = await save({ ...draft, rewrite: { ...draft.rewrite, keys, maxAttempts: Math.max(0, Math.min(10, Number(draft.rewrite.maxAttempts) || 0)) } })
      setDraft(novo)
      toast('Configurações salvas.', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  async function escolherPasta() {
    const p = await call('sys:pickFolder', { title: 'Pasta padrão dos projetos', defaultPath: draft.projectsRoot })
    if (p) upd('projectsRoot', p)
  }

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7 pb-28">
      <div className="flex gap-10">
        <div className="w-56 shrink-0">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-slate-300">
            <Settings size={12} className="text-cyan-400" /> CONFIG
          </span>
          <h1 className="mb-6 text-2xl font-bold tracking-tight">Configurações</h1>
          <div className="space-y-1">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? 'bg-slate-900 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
                <t.Icon size={16} className={tab === t.key ? 'text-cyan-400' : ''} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === 'geral' && (
            <>
              <Header title="Geral" sub="Preferências do aplicativo" />
              <Field label={<>Idioma{dot('lang')}</>}>
                <select className={inputCls} value={draft.lang} onChange={(e) => upd('lang', e.target.value)}>
                  <option value="pt">Português (Brasil)</option>
                </select>
              </Field>
              <Field label={<>Pasta padrão dos projetos{dot('projectsRoot')}</>} hint="Onde os projetos novos são salvos. Cada projeto cria uma subpasta aqui com o nome dele.">
                <div className="flex gap-2">
                  <input className={`${inputCls} font-mono text-[13px]`} value={draft.projectsRoot} onChange={(e) => upd('projectsRoot', e.target.value)} />
                  <button className={btnGhost} onClick={escolherPasta}>Procurar</button>
                  <button className={btnGhost} onClick={() => call('sys:openPath', draft.projectsRoot)}><FolderOpen size={15} /> Abrir</button>
                </div>
              </Field>
              <Field label={<>Nome dos arquivos{dot('fileNamePattern')}</>} hint="Variáveis: {order} {prompt} {type} {model} {ratio} {date} {time} {project}">
                <input className={`${inputCls} font-mono text-[13px]`} value={draft.fileNamePattern} onChange={(e) => upd('fileNamePattern', e.target.value)} />
              </Field>
              <Field label={<>Ao fechar a janela{dot('closeAction')}</>} hint="O que o botão X faz.">
                <select className={inputCls} value={draft.closeAction} onChange={(e) => upd('closeAction', e.target.value)}>
                  <option value="ask">Perguntar</option>
                  <option value="tray">Minimizar para a bandeja (segue gerando)</option>
                  <option value="quit">Fechar de vez</option>
                </select>
              </Field>
            </>
          )}

          {tab === 'reescrita' && (
            <>
              <Header title="Reescrita de Prompts" sub="Quando o Google recusa um prompt por política, o Gemini reescreve e o app tenta de novo." />
              <Field
                label={<>Chaves da API do Gemini{dot('rewrite.keys')}</>}
                hint={<>Crie grátis em <button className="text-cyan-400 underline" onClick={() => call('sys:openExternal', 'https://aistudio.google.com/apikey')}>aistudio.google.com/apikey</button>. Uma chave por linha: se uma der limite (429/503), o app passa para a próxima.</>}
                right={<button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300" onClick={() => setShowKeys(!showKeys)}>{showKeys ? <EyeOff size={13} /> : <Eye size={13} />}{showKeys ? 'Esconder' : 'Mostrar'}</button>}
              >
                {showKeys ? (
                  <textarea rows={4} className={`${inputCls} font-mono text-[12.5px]`} value={Array.isArray(draft.rewrite.keys) ? draft.rewrite.keys.join('\n') : draft.rewrite.keys} onChange={(e) => upd('rewrite.keys', e.target.value.split('\n'))} placeholder="AIza…" />
                ) : (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-400">
                    {(draft.rewrite.keys || []).filter((k) => String(k).trim()).length
                      ? (draft.rewrite.keys || []).filter((k) => String(k).trim()).map((k, i) => <div key={i}>{String(k).slice(0, 6)}••••••••••••{String(k).slice(-4)}</div>)
                      : <span className="text-slate-600">Nenhuma chave. Clique em Mostrar para colar.</span>}
                  </div>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={<>Tentativas máximas{dot('rewrite.maxAttempts')}</>} hint="Quantas vezes reescrever o mesmo prompt antes de desistir.">
                  <input type="number" min={0} max={10} className={inputCls} value={draft.rewrite.maxAttempts} onChange={(e) => upd('rewrite.maxAttempts', e.target.value)} />
                </Field>
                <Field label={<>Modelo{dot('rewrite.model')}</>} hint="Modelo do Gemini usado na reescrita.">
                  <input className={`${inputCls} font-mono text-[13px]`} value={draft.rewrite.model} onChange={(e) => upd('rewrite.model', e.target.value)} />
                </Field>
              </div>
              <Field label={<>Instrução da reescrita{dot('rewrite.systemPrompt')}</>} hint="O que o Gemini segue ao reescrever. Mexa com cuidado: vale para todas as reescritas.">
                <textarea rows={5} className={`${inputCls} font-mono text-[12.5px] leading-relaxed`} value={draft.rewrite.systemPrompt} onChange={(e) => upd('rewrite.systemPrompt', e.target.value)} />
              </Field>
            </>
          )}

          {tab === 'avancado' && (
            <>
              <Header title="Avançado" sub="Ritmo de envio para o Flow" />
              <Field
                label={<>Intervalo entre envios (segundos){dot('dispatch.delay')}</>}
                hint='Tempo de espera entre um envio e outro da MESMA conta. Fixo ("25") ou faixa ("20-30" = um valor entre 20 e 30 a cada envio).'
              >
                <input className={`${inputCls} font-mono`} value={draft.dispatch.delay} onChange={(e) => upd('dispatch.delay', e.target.value)} />
                <p className={`text-xs ${ritmo.valido ? ritmo.cor : 'text-red-400'}`}>{ritmo.valido ? ritmo.rotulo : ritmo.erro}</p>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={<>Gerações simultâneas por conta{dot('dispatch.maxConcurrentPerAccount')}</>} hint="Quantos pedidos cada conta pode ter gerando ao mesmo tempo.">
                  <input type="number" min={1} max={4} className={inputCls} value={draft.dispatch.maxConcurrentPerAccount} onChange={(e) => upd('dispatch.maxConcurrentPerAccount', Math.max(1, Math.min(4, Number(e.target.value) || 1)))} />
                </Field>
                <Field label={<>Limite diário por conta{dot('dispatch.dailyCapPerAccount')}</>} hint="Máximo de envios por conta por dia (0 = sem limite).">
                  <input type="number" min={0} className={inputCls} value={draft.dispatch.dailyCapPerAccount} onChange={(e) => upd('dispatch.dailyCapPerAccount', Math.max(0, Number(e.target.value) || 0))} />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-6 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Várias contas ao mesmo tempo{dot('dispatch.parallelAccounts')}</p>
                  <p className="text-xs text-slate-500">Desligado: uma conta envia por vez. Ligado: todas as contas ativas enviam juntas.</p>
                </div>
                <Toggle checked={draft.dispatch.parallelAccounts} onChange={(v) => (v ? setRiscoOpen(true) : upd('dispatch.parallelAccounts', false))} />
              </div>
              <div className="flex items-center justify-between gap-6 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Navegador do Flow escondido{dot('dispatch.headless')}</p>
                  <p className="text-xs text-slate-500">Desligado (recomendado): a janela do Chrome de cada conta fica visível enquanto gera.</p>
                </div>
                <Toggle checked={draft.dispatch.headless} onChange={(v) => upd('dispatch.headless', v)} />
              </div>
            </>
          )}

          {tab === 'conta' && (
            <>
              <Header title="Conta" sub="Sua conta Noctis Studio neste computador" />
              <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 font-bold text-slate-950">{(auth?.user?.email || '?')[0].toUpperCase()}</div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-100">{auth?.user?.email}</p>
                  <p className="text-xs text-slate-500">Plano {auth?.user?.plan === 'MASTER' ? 'Pro' : auth?.user?.plan}{auth?.offline ? ' · conferência offline' : ''}</p>
                </div>
                <button className={btnGhost} onClick={async () => { await call('auth:refresh'); setAuth(await call('auth:state')); toast('Conta conferida.', 'success') }}><RefreshCw size={14} /> Conferir agora</button>
              </div>
              <Row title="Logs de diagnóstico" sub="Junta os registros do app num arquivo para suporte." action={<button className={btnGhost} onClick={async () => { const p = await call('logs:export'); if (p) toast(`Salvo em ${p}`, 'success') }}><Download size={14} /> Exportar</button>} />
              <Row title="Desconectar" sub="Sai da conta Noctis neste computador." action={<button className={btnDanger} onClick={() => call('auth:signout')}><LogOut size={14} /> Sair da conta</button>} />
              {info && <p className="text-xs text-slate-600">Noctis Studio {info.version} · dados em <span className="font-mono">{info.userData}</span></p>}
            </>
          )}
        </div>
      </div>

      {mudou.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/95 px-5 py-3 shadow-2xl shadow-black/50 backdrop-blur">
          <span className="text-sm text-slate-300"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-cyan-400" />{mudou.length} alteração(ões)</span>
          <button className={btnGhost} onClick={() => setDraft(settings)}>Descartar</button>
          <button className={btnPrimary} onClick={salvar}>Salvar</button>
        </div>
      )}

      <Modal open={riscoOpen} onClose={() => setRiscoOpen(false)} width="max-w-lg">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><TriangleAlert size={22} /></div>
          <h3 className="mb-2 text-lg font-bold">Risco de cooldown</h3>
          <p className="text-sm leading-relaxed text-slate-400">
            Todas as suas contas vão enviar prompts <b className="text-amber-300">ao mesmo tempo</b>. O Google pode <b className="text-amber-300">pausar contas por um tempo</b> (cooldown). Se acontecer, aumente o intervalo entre envios ou desligue esta opção.
          </p>
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
            Conta em cooldown só volta quando o Google liberar, em geral depois de algumas horas. O app não tem como forçar essa volta.
          </div>
          <div className="mt-5 flex gap-2">
            <button className={`${btnGhost} flex-1`} onClick={() => setRiscoOpen(false)}>Cancelar</button>
            <button className={`${btnPrimary} flex-1`} onClick={() => { upd('dispatch.parallelAccounts', true); setRiscoOpen(false) }}>Ativar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Header({ title, sub }) {
  return <div><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="text-sm text-slate-500">{sub}</p></div>
}
function Row({ title, sub, action }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 pb-4">
      <div><p className="text-sm font-semibold text-slate-200">{title}</p><p className="text-xs text-slate-500">{sub}</p></div>
      {action}
    </div>
  )
}
