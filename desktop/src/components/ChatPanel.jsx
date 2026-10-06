import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Plus, History, Settings2, Send, Square, Bot, Wrench, ChevronRight, ChevronDown, Brain, TriangleAlert, Check, ShieldQuestion,
  FolderOpen, Download, LogIn, RefreshCw, ExternalLink, Trash2, Sparkles, TerminalSquare, FileText, Globe, Search, Copy, Folder, Cpu, Gauge, Rocket, Zap,
} from 'lucide-react'
import { call, useEvent, useSettings, useToast } from '../lib/api'
import { btnGhost, btnPrimary, iconBtn, Modal, Spinner } from './ui'

const PERMISSOES = [
  { v: '', t: 'Perguntar', s: 'pede sua aprovação antes de mexer em algo' },
  { v: 'acceptEdits', t: 'Aceitar edições', s: 'edita arquivos sem perguntar; comandos ainda perguntam' },
  { v: 'plan', t: 'Só planejar', s: 'analisa e propõe, não executa (só Claude Code)' },
  { v: 'bypassPermissions', t: 'Livre', s: 'faz tudo sem perguntar (cuidado)' },
]
const ESF_ROTULO = { '': 'Auto', low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo' }
const SUGESTOES = [
  'Como está a fila e o que foi gerado hoje?',
  'Crie um projeto "Canal Mistérios" e envie 3 prompts de cenas noturnas em 16:9',
  'Ache 5 músicas de suspense no Audio Atlas',
  'Quais jobs falharam no último projeto e por quê?',
]
const NOMES = {
  Bash: ['Terminal', TerminalSquare], PowerShell: ['Terminal', TerminalSquare], Read: ['Ler arquivo', FileText], Write: ['Criar arquivo', FileText],
  Edit: ['Editar arquivo', FileText], MultiEdit: ['Editar arquivo', FileText], fileChange: ['Editar arquivo', FileText], Glob: ['Procurar arquivos', Search], Grep: ['Buscar no código', Search],
  WebFetch: ['Abrir página', Globe], WebSearch: ['Pesquisar na web', Globe], Task: ['Subagente', Bot], webSearch: ['Pesquisar na web', Globe],
}
const OCULTAS = new Set(['ToolSearch'])

function nomeFerramenta(n) {
  if (!n) return ['ferramenta', Wrench]
  if (n.startsWith('mcp__noctis__')) return [`Noctis · ${n.slice(13).replace(/_/g, ' ')}`, Sparkles]
  if (n.startsWith('mcp__')) return [n.split('__').slice(1).join(' · '), Wrench]
  return NOMES[n] || [n, Wrench]
}
function resumoEntrada(e = {}) {
  if (!e || typeof e !== 'object') return ''
  const v = e.command || e.file_path || e.path || e.pattern || e.url || e.query || e.description || e.prompt || e.texto || e.busca || e.nome
  if (v) return String(v).split('\n')[0].slice(0, 120)
  const s = JSON.stringify(e)
  return s === '{}' ? '' : s.slice(0, 120)
}

function Menu({ aberto, onClose, children, largura = 'min-w-[200px]' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', fora), 0)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto, onClose])
  if (!aberto) return null
  return <div ref={ref} className={`absolute bottom-full z-30 mb-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl shadow-black/60 ${largura}`}>{children}</div>
}
function Pill({ Icon, children, onClick, aberto, titulo }) {
  return (
    <button onClick={onClick} title={titulo} className={`flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${aberto ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}>
      {Icon && <Icon size={11} className="shrink-0" />}<span className="max-w-[120px] truncate">{children}</span><ChevronDown size={10} className="shrink-0 opacity-60" />
    </button>
  )
}
function Opcao({ ativo, children, onClick }) {
  return <button onClick={onClick} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-[12.5px] ${ativo ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800'}`}>{children}{ativo && <Check size={13} className="shrink-0 text-cyan-400" />}</button>
}

// ------------------------------------------------------------- markdown simples e seguro
function Inline({ texto }) {
  const partes = []; const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g; let i = 0; let m
  while ((m = re.exec(texto))) {
    if (m.index > i) partes.push(texto.slice(i, m.index))
    const t = m[0]
    if (t.startsWith('**')) partes.push(<strong key={m.index} className="font-semibold text-slate-100">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) partes.push(<code key={m.index} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-cyan-200">{t.slice(1, -1)}</code>)
    else { const rot = t.slice(1, t.indexOf('](')); partes.push(<button key={m.index} onClick={() => call('sys:openExternal', m[2])} className="text-cyan-300 underline decoration-cyan-500/40 hover:text-cyan-200">{rot}</button>) }
    i = m.index + t.length
  }
  if (i < texto.length) partes.push(texto.slice(i))
  return partes
}
function Markdown({ texto }) {
  const blocos = []; const linhas = String(texto || '').split('\n')
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    if (l.startsWith('```')) { const cod = []; i++; while (i < linhas.length && !linhas[i].startsWith('```')) cod.push(linhas[i++]); blocos.push(<pre key={i} className="my-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11.5px] leading-relaxed text-slate-300">{cod.join('\n')}</pre>) }
    else if (/^#{1,4}\s/.test(l)) blocos.push(<p key={i} className="mb-1 mt-3 font-semibold text-slate-100"><Inline texto={l.replace(/^#+\s/, '')} /></p>)
    else if (/^\s*([-*]|\d+\.)\s/.test(l)) { const itens = []; while (i < linhas.length && /^\s*([-*]|\d+\.)\s/.test(linhas[i])) itens.push(linhas[i++]); i--; blocos.push(<ul key={i} className="my-1.5 space-y-1 pl-1">{itens.map((it, k) => { const num = it.match(/^\s*(\d+)\./); return <li key={k} className="flex gap-2"><span className="shrink-0 text-cyan-400">{num ? `${num[1]}.` : '•'}</span><span><Inline texto={it.replace(/^\s*([-*]|\d+\.)\s/, '')} /></span></li> })}</ul>) }
    else if (l.trim()) blocos.push(<p key={i} className="my-1"><Inline texto={l} /></p>)
  }
  return <div className="text-[13px] leading-relaxed text-slate-300">{blocos}</div>
}

function Permissao({ id, onPermissao, ferramenta, entrada }) {
  return (
    <div className="border-t border-amber-500/20 px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-amber-200"><ShieldQuestion size={13} /> {ferramenta ? <>Permitir <b className="font-semibold">{nomeFerramenta(ferramenta)[0]}</b>?</> : 'Permitir esta ação?'}</p>
      {entrada && resumoEntrada(entrada) && <p className="mb-2 truncate font-mono text-[11px] text-slate-500">{resumoEntrada(entrada)}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button className="rounded-lg bg-cyan-500 px-3 py-1 text-[12px] font-semibold text-slate-950 hover:bg-cyan-400" onClick={() => onPermissao(id, { permitir: true })}>Permitir</button>
        <button className="rounded-lg border border-cyan-500/40 px-3 py-1 text-[12px] font-semibold text-cyan-300 hover:bg-cyan-500/10" onClick={() => onPermissao(id, { permitir: true, sempre: true })}>Sempre nesta conversa</button>
        <button className="rounded-lg border border-slate-700 px-3 py-1 text-[12px] font-semibold text-slate-300 hover:bg-slate-800" onClick={() => onPermissao(id, { permitir: false })}>Negar</button>
      </div>
    </div>
  )
}

function Ferramenta({ b, onPermissao }) {
  const [aberto, setAberto] = useState(false)
  const [rot, Icon] = nomeFerramenta(b.nome)
  const pendente = b.permissao?.estado === 'pendente'
  const noctis = b.nome?.startsWith('mcp__noctis__')
  return (
    <div className={`my-1.5 rounded-xl border ${pendente ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-950/50'}`}>
      <button onClick={() => setAberto(!aberto)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Icon size={13} className={noctis ? 'text-cyan-400' : 'text-slate-400'} />
        <span className="text-[12px] font-semibold text-slate-200">{rot}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">{resumoEntrada(b.entrada)}</span>
        {b.negada ? <span className="text-[10px] font-semibold uppercase text-red-400">negado</span>
          : b.permissao?.estado === 'negado' ? <span className="text-[10px] font-semibold uppercase text-red-400">negado</span>
          : b.resultado === undefined ? (pendente ? null : <Spinner size={12} />)
          : b.erro ? <TriangleAlert size={13} className="text-red-400" /> : <Check size={13} className="text-emerald-400" />}
        <ChevronRight size={13} className={`text-slate-600 transition-transform ${aberto ? 'rotate-90' : ''}`} />
      </button>
      {aberto && (
        <div className="space-y-2 border-t border-slate-800 px-3 py-2">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] text-slate-400">{JSON.stringify(b.entrada || {}, null, 1)}</pre>
          {b.resultado !== undefined && b.resultado !== '' && <pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-2 font-mono text-[10.5px] ${b.erro ? 'text-red-300' : 'text-slate-400'}`}>{b.resultado}</pre>}
          {b.motivo && <p className="text-[11px] text-red-300">{b.motivo}</p>}
        </div>
      )}
      {pendente && <Permissao id={b.permissao.id} onPermissao={onPermissao} />}
    </div>
  )
}

function Pensando({ texto }) {
  const [aberto, setAberto] = useState(false)
  if (!texto?.trim()) return null
  return (
    <div className="my-1">
      <button onClick={() => setAberto(!aberto)} className="flex items-center gap-1.5 text-[11.5px] italic text-slate-500 hover:text-slate-300"><Brain size={12} /> Raciocínio <ChevronRight size={11} className={aberto ? 'rotate-90' : ''} /></button>
      {aberto && <p className="mt-1 whitespace-pre-wrap border-l-2 border-slate-800 pl-3 text-[12px] italic text-slate-500">{texto}</p>}
    </div>
  )
}

function Resposta({ msg, rodando, onPermissao }) {
  const blocos = msg.blocos || []
  const vazio = !blocos.some((b) => (b.k === 'texto' && b.texto.trim()) || b.k === 'ferramenta' || b.k === 'erro' || b.k === 'permissao')
  return (
    <div className="mb-4">
      {blocos.map((b, i) => (
        <Fragment key={i}>
          {b.k === 'texto' && <Markdown texto={b.texto} />}
          {b.k === 'pensando' && <Pensando texto={b.texto} />}
          {b.k === 'ferramenta' && !OCULTAS.has(b.nome) && <Ferramenta b={b} onPermissao={onPermissao} />}
          {b.k === 'permissao' && b.estado === 'pendente' && <div className="my-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5"><Permissao id={b.id} ferramenta={b.nome} entrada={b.entrada} onPermissao={onPermissao} /></div>}
          {b.k === 'erro' && <div className="my-1.5 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-[12.5px] text-red-300"><TriangleAlert size={14} className="mt-0.5 shrink-0" /><span className="whitespace-pre-wrap">{b.texto}</span></div>}
        </Fragment>
      ))}
      {rodando && vazio && <div className="flex items-center gap-2 text-[12px] text-slate-500"><Spinner size={13} /> Pensando…</div>}
      {msg.fim && !msg.fim.erro && (msg.fim.custo || msg.fim.duracaoMs) ? (
        <p className="mt-1.5 font-mono text-[10px] text-slate-600">{msg.modelo ? `${msg.modelo} · ` : ''}{msg.fim.duracaoMs ? `${(msg.fim.duracaoMs / 1000).toFixed(1)}s` : ''}{msg.fim.custo ? ` · US$ ${msg.fim.custo.toFixed(3)}` : ''}{msg.fim.truncada ? ' · resposta cortada' : ''}</p>
      ) : null}
      {msg.fim?.motivo === 'parado' && <p className="mt-1 text-[11px] italic text-slate-500">Interrompido.</p>}
    </div>
  )
}

// ------------------------------------------------------------- cartões de instalar / entrar
const ICONE_AGENTE = { claude: Bot, codex: TerminalSquare, agy: Rocket, grok: Zap }

function ProgressoInstalacao({ agente, inst }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="mb-2 flex items-center justify-between text-[12px] text-slate-300"><span className="flex items-center gap-2"><Spinner size={12} /> Instalando… isso pode levar alguns minutos.</span><button className="text-slate-500 hover:text-slate-200" onClick={() => call('chat:installCancel', agente.id)}>Cancelar</button></div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-1/3 animate-pulse bg-cyan-400" /></div>
      <p className="mt-2 truncate font-mono text-[10.5px] text-slate-500">{inst.linhas.at(-1) || 'Baixando o instalador…'}</p>
    </div>
  )
}

function CartaoInstalar({ agente, inst, onInstalar, onPronto, onAbrirAgentes, toast }) {
  const [verComando, setVerComando] = useState(false)
  const [comando, setComando] = useState('')
  const mostrarComando = async () => { if (!comando) setComando(await call('chat:command', agente.id).catch(() => '')); setVerComando(!verComando) }
  return (
    <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="mb-1 flex items-center gap-2 font-semibold text-slate-100"><Download size={15} className="text-cyan-400" /> {agente.nome} não está instalado</p>
      <p className="mb-3 text-[12.5px] text-slate-400">O app instala pra você, sem terminal. Leva alguns minutos e não precisa de Node instalado.</p>
      <div className="mb-3">{inst ? <ProgressoInstalacao agente={agente} inst={inst} /> : <button className={btnPrimary} onClick={() => onInstalar(agente.id)}><Download size={14} /> Instalar</button>}</div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
        <button className="flex items-center gap-1 hover:text-slate-200" onClick={onPronto}><RefreshCw size={12} /> Procurar de novo</button>
        <button className="flex items-center gap-1 hover:text-slate-200" onClick={onAbrirAgentes}><Settings2 size={12} /> Abrir Agentes de IA</button>
        <button className="flex items-center gap-1 hover:text-slate-200" onClick={mostrarComando}><TerminalSquare size={12} /> {verComando ? 'ocultar comando' : 'ver comando'}</button>
        <button className="flex items-center gap-1 hover:text-slate-200" onClick={() => call('sys:openExternal', agente.doc)}><ExternalLink size={12} /> Documentação</button>
      </div>
      {verComando && comando && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">{comando}</code>
          <button className="text-slate-500 hover:text-cyan-300" onClick={() => { navigator.clipboard?.writeText(comando); toast('Comando copiado.') }}><Copy size={13} /></button>
        </div>
      )}
    </div>
  )
}

function AgentesModal({ open, onClose, agentes, inst, onInstalar, onEntrar, onVerificar, verificando }) {
  return (
    <Modal open={open} onClose={onClose} title="Agentes de IA" width="max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-slate-400">Os CLIs de agente que você usa no chat. Instale e conecte — tudo sem terminal.</p>
        <button className={`${btnGhost} shrink-0 whitespace-nowrap`} onClick={onVerificar}>{verificando ? <Spinner size={13} /> : <RefreshCw size={13} />} Verificar novamente</button>
      </div>
      <div className="divide-y divide-slate-800 rounded-xl border border-slate-800">
        {(agentes || []).map((a) => {
          const Icon = ICONE_AGENTE[a.id] || Bot
          const i = inst[a.id]
          return (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300"><Icon size={15} /></span>
                <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-100">{a.nome}{a.versao && <span className="ml-2 font-mono text-[10.5px] font-normal text-slate-500">{a.versao}</span>}</p>
                {!a.instalado && !i && <button className={`${btnGhost} border-cyan-500/40 px-3 py-1.5 text-cyan-300`} onClick={() => onInstalar(a.id)}><Download size={13} /> Instalar</button>}
                {a.instalado && a.logado === false && <button className={`${btnGhost} border-amber-500/40 px-3 py-1.5 text-amber-300`} onClick={() => onEntrar(a.id)}><LogIn size={13} /> Entrar</button>}
                <button className={`${btnGhost} px-3 py-1.5`} onClick={() => call('sys:openExternal', a.doc)}><ExternalLink size={13} /> Docs</button>
                <span className={`w-24 text-right text-[11.5px] font-semibold ${a.instalado ? (a.logado === false ? 'text-amber-300' : 'text-emerald-400') : 'text-slate-500'}`}>{i ? 'Instalando…' : !a.instalado ? 'Não instalado' : a.logado === false ? 'Sem login' : 'Pronto'}</span>
              </div>
              {i && <div className="mt-2"><ProgressoInstalacao agente={a} inst={i} /></div>}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function CartaoLogin({ agente, onPronto, toast }) {
  const [log, setLog] = useState(null)
  const [codigo, setCodigo] = useState('')
  useEvent('chat:event', (e) => {
    if (e.tipo !== 'login' || e.agente !== agente.id) return
    if (e.fim) { setLog(null); if (e.ok) onPronto(); else toast('Não consegui confirmar o login. Tente de novo.', 'warn'); return }
    setLog((s) => {
      const n = { ...(s || { linhas: [] }) }
      if (e.linha) n.linhas = [...n.linhas, e.linha].slice(-5)
      if (e.url) n.url = e.url
      if (e.pedeCodigo) n.pedeCodigo = true
      return n
    })
  })
  const entrar = () => { setLog({ linhas: [] }); call('chat:login', agente.id).catch((err) => { toast(err.message, 'error'); setLog(null) }) }
  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="mb-1 font-semibold text-slate-100">Entre na sua conta do {agente.nome}</p>
      <p className="mb-3 text-[12.5px] text-slate-400">Sem terminal: eu abro o link de login no seu navegador. Usa a sua própria conta/assinatura do {agente.nome}.</p>
      {log ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="mb-1 flex items-center gap-2 text-[12px] text-slate-300"><Spinner size={12} /> Aguardando o login no navegador…</div>
            {log.url && <button className="truncate text-[11px] text-cyan-300 underline" onClick={() => call('sys:openExternal', log.url)}>{log.url}</button>}
            {log.linhas.map((l, i) => <p key={i} className="truncate font-mono text-[10.5px] text-slate-500">{l}</p>)}
          </div>
          {log.pedeCodigo && (
            <div className="flex gap-2">
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Cole o código aqui" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[12px] text-slate-100 focus:border-cyan-500 focus:outline-none" />
              <button className={btnPrimary} onClick={() => { call('chat:loginInput', agente.id, codigo); setCodigo('') }}>Enviar</button>
            </div>
          )}
          <button className="text-[12px] text-slate-500 hover:text-slate-200" onClick={() => { call('chat:loginCancel', agente.id); setLog(null) }}>Cancelar</button>
        </div>
      ) : (
        <button className={btnPrimary} onClick={entrar}><LogIn size={14} /> Entrar</button>
      )}
    </div>
  )
}

export default function ChatPanel({ onClose, go }) {
  const toast = useToast()
  const { settings, save } = useSettings()
  const [agentes, setAgentes] = useState(null)
  const [lista, setLista] = useState([])
  const [conv, setConv] = useState(null)
  const [verLista, setVerLista] = useState(false)
  const [verConfig, setVerConfig] = useState(false)
  const [texto, setTexto] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [modelosAg, setModelosAg] = useState({}) // agentId → {modelos, esforcos}
  const [menu, setMenu] = useState(null) // 'agente'|'modelo'|'esforco'|'pasta'
  const [inst, setInst] = useState({}) // agente → { linhas } enquanto instala
  const [verAgentes, setVerAgentes] = useState(false)
  const fimRef = useRef(null)
  const agenteId = conv?.agente || settings?.chat?.agent || 'claude'
  const agente = useMemo(() => agentes?.find((a) => a.id === agenteId), [agentes, agenteId])
  const perAg = settings?.chat?.agentes?.[agenteId] || {}
  const infoModelos = modelosAg[agenteId]

  const carregarAgentes = async (forcar) => { setVerificando(true); try { setAgentes(await call('chat:agents', forcar)) } catch (e) { toast(e.message, 'error') } finally { setVerificando(false) } }
  const carregarLista = async () => { const l = await call('chat:list'); setLista(l); return l }
  const carregarModelos = async (id, forcar) => { try { const m = await call('chat:models', id, forcar); setModelosAg((s) => ({ ...s, [id]: m })) } catch { /* sem modelos */ } }

  useEffect(() => {
    carregarAgentes(false)
    carregarLista().then((l) => {
      let ultima = null; try { ultima = localStorage.getItem('noctis_chat') } catch { /* sem storage */ }
      const alvo = l.find((x) => x.id === ultima) || l[0]
      if (alvo) call('chat:get', alvo.id).then(setConv).catch(() => {})
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (agenteId && agente?.instalado && !modelosAg[agenteId]) carregarModelos(agenteId) }, [agenteId, agente?.instalado]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (conv?.id) try { localStorage.setItem('noctis_chat', conv.id) } catch { /* sem storage */ } }, [conv?.id])
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [conv?.mensagens?.length, conv?.mensagens?.at(-1)?.blocos?.length, conv?.rodando])

  useEvent('chat:event', (e) => {
    if (e.tipo === 'navegar') { go(e.tela); return }
    if (e.tipo === 'instalar') {
      if (e.fim) { setInst((m) => { const n = { ...m }; delete n[e.agente]; return n }); if (e.ok) { toast('Instalado! Agora entre na sua conta.', 'success'); carregarAgentes(true) } else if (e.erro) toast(e.erro, 'error') }
      else setInst((m) => ({ ...m, [e.agente]: { linhas: [...(m[e.agente]?.linhas || []), e.linha].slice(-6) } }))
      return
    }
    if (!e.conversa) return
    setConv((c) => {
      if (!c || c.id !== e.conversa) return c
      if (e.msg) { const msgs = c.mensagens.some((m) => m.id === e.msg.id) ? c.mensagens.map((m) => (m.id === e.msg.id ? e.msg : m)) : [...c.mensagens, e.msg]; return { ...c, mensagens: msgs, rodando: e.tipo !== 'fim' } }
      return c
    })
    if (e.tipo === 'fim') carregarLista()
  })

  const instalar = (id) => { setInst((m) => ({ ...m, [id]: { linhas: [] } })); call('chat:install', id).catch((err) => { toast(err.message, 'error'); setInst((m) => { const n = { ...m }; delete n[id]; return n }) }) }
  const entrar = async (id) => { setVerAgentes(false); if (id !== agenteId) await trocarAgente(id); call('chat:login', id).catch((err) => toast(err.message, 'error')) }
  const nenhumInstalado = agentes && !agentes.some((a) => a.instalado)

  async function nova() { const c = await call('chat:new', { agente: settings?.chat?.agent || 'claude' }); setConv({ ...c, rodando: false }); setVerLista(false); carregarLista() }
  async function enviar(t = texto) {
    t = t.trim(); if (!t) return
    try {
      let c = conv
      if (!c) { c = await call('chat:new', { agente: agenteId }); c = { ...c, rodando: false } }
      setTexto('')
      setConv({ ...c, rodando: true, mensagens: [...c.mensagens, { id: `tmp-${Date.now()}`, papel: 'user', texto: t }] })
      await call('chat:send', c.id, t)
      setConv(await call('chat:get', c.id)); carregarLista()
    } catch (e) { toast(e.message, 'error'); if (conv) setConv(await call('chat:get', conv.id)) }
  }
  const permissao = (id, r) => call('chat:permission', id, r).catch((e) => toast(e.message, 'error'))
  async function trocarAgente(id) {
    setMenu(null)
    await save({ chat: { ...(settings?.chat || {}), agent: id } })
    if (!modelosAg[id]) carregarModelos(id)
    if (conv && !conv.mensagens.length) setConv({ ...(await call('chat:update', conv.id, { agente: id })), rodando: false })
    else if (conv && conv.agente !== id) setConv(null)
  }
  const setPerAg = (patch) => save({ chat: { ...(settings?.chat || {}), agentes: { ...(settings?.chat?.agentes || {}), [agenteId]: { ...perAg, ...patch } } } })
  async function escolherPasta() {
    setMenu(null)
    const p = await call('sys:pickFolder', { title: 'Pasta onde o agente vai trabalhar', defaultPath: conv?.cwd })
    if (p && conv) { setConv({ ...conv, ...(await call('chat:update', conv.id, { cwd: p })) }); lembrarPasta(p) }
  }
  const lembrarPasta = (p) => { try { const r = JSON.parse(localStorage.getItem('noctis_chat_pastas') || '[]').filter((x) => x !== p); localStorage.setItem('noctis_chat_pastas', JSON.stringify([p, ...r].slice(0, 5))) } catch { /* sem storage */ } }
  const pastasRecentes = () => { try { return JSON.parse(localStorage.getItem('noctis_chat_pastas') || '[]') } catch { return [] } }
  async function usarPasta(p) { setMenu(null); if (conv) setConv({ ...conv, ...(await call('chat:update', conv.id, { cwd: p })) }) }

  const esforcos = infoModelos?.esforcos?.length ? ['', ...infoModelos.esforcos] : agente?.esforcos?.length ? ['', ...agente.esforcos] : ['', 'low', 'medium', 'high']
  const modelos = infoModelos?.modelos || (agente?.modelosEstaticos || []).map((m) => ({ id: m, rotulo: m }))
  const pronto = agente?.instalado && agente?.logado !== false
  const nomePasta = (conv?.cwd || '').split(/[\\/]/).filter(Boolean).pop() || 'Nenhuma pasta'

  return (
    <div className="flex h-full w-[440px] shrink-0 flex-col border-l border-slate-800 bg-[#101116]">
      <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2.5">
        <span className="mr-1 flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400"><Bot size={15} /></span>
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-100">{conv?.titulo || 'Nova conversa'}</p>
        <button className={iconBtn} title="Conversas" onClick={() => { setVerLista(!verLista); setVerConfig(false); carregarLista() }}><History size={15} /></button>
        <button className={iconBtn} title="Nova conversa" onClick={nova}><Plus size={16} /></button>
        <button className={`${iconBtn} ${verConfig ? 'bg-slate-800 text-cyan-300' : ''}`} title="Permissões" onClick={() => { setVerConfig(!verConfig); setVerLista(false) }}><Settings2 size={15} /></button>
        <button className={iconBtn} title="Fechar" onClick={onClose}><X size={16} /></button>
      </div>

      <AgentesModal open={verAgentes} onClose={() => setVerAgentes(false)} agentes={agentes} inst={inst} onInstalar={instalar} onEntrar={entrar} onVerificar={() => carregarAgentes(true)} verificando={verificando} />
      {verConfig && (
        <div className="space-y-1.5 border-b border-slate-800 bg-slate-950/60 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Permissões {agente && !agente.permissao && <span className="text-slate-600">(o {agente.nome} não pergunta antes)</span>}</p>
          {PERMISSOES.map((p) => (
            <button key={p.v} onClick={() => save({ chat: { ...(settings?.chat || {}), permissionMode: p.v } })} className={`w-full rounded-lg border px-3 py-2 text-left ${(settings?.chat?.permissionMode || '') === p.v ? (p.v === 'bypassPermissions' ? 'border-red-500/50 bg-red-500/10' : 'border-cyan-500/50 bg-cyan-500/10') : 'border-slate-800 hover:border-slate-700'}`}>
              <p className="text-[12.5px] font-semibold text-slate-200">{p.t}</p><p className="text-[11px] text-slate-500">{p.s}</p>
            </button>
          ))}
        </div>
      )}

      {verLista ? (
        <div className="flex-1 overflow-y-auto p-2">
          {!lista.length && <p className="p-4 text-center text-[13px] text-slate-500">Nenhuma conversa ainda.</p>}
          {lista.map((c) => (
            <div key={c.id} className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 ${conv?.id === c.id ? 'bg-cyan-500/10' : 'hover:bg-slate-900'}`}>
              <button className="min-w-0 flex-1 text-left" onClick={async () => { setConv(await call('chat:get', c.id)); setVerLista(false) }}>
                <p className="truncate text-[13px] text-slate-200">{c.titulo}</p>
                <p className="text-[10.5px] text-slate-500">{(agentes?.find((a) => a.id === c.agente)?.nome) || c.agente} · {new Date(c.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{c.rodando ? ' · respondendo…' : ''}</p>
              </button>
              <button className="text-slate-600 opacity-0 hover:text-red-400 group-hover:opacity-100" title="Excluir" onClick={async () => { setLista(await call('chat:delete', c.id)); if (conv?.id === c.id) setConv(null) }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {nenhumInstalado && (
            <div className="mb-6 mt-4 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400"><Bot size={22} /></span>
              <p className="font-semibold text-slate-100">Conecte seu primeiro agente</p>
              <p className="mx-auto mb-4 mt-1 max-w-[320px] text-[12.5px] text-slate-500">Nenhum CLI de agente está pronto nesta máquina. Instale ou conecte um — dá pra fazer tudo por aqui, sem terminal.</p>
              <button className={btnPrimary} onClick={() => setVerAgentes(true)}><Sparkles size={14} /> Abrir Agentes de IA</button>
            </div>
          )}
          {agentes && agente && !agente.instalado && <CartaoInstalar agente={agente} inst={inst[agente.id]} onInstalar={instalar} toast={toast} onPronto={() => carregarAgentes(true)} onAbrirAgentes={() => setVerAgentes(true)} />}
          {agente?.instalado && agente.logado === false && <CartaoLogin agente={agente} toast={toast} onPronto={() => carregarAgentes(true)} />}

          {(!conv || !conv.mensagens.length) && pronto && (
            <div className="mt-6 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400"><Sparkles size={22} /></span>
              <p className="font-semibold text-slate-100">Como posso ajudar?</p>
              <p className="mx-auto mb-5 mt-1 max-w-[300px] text-[12.5px] text-slate-500">Eu vejo seus projetos, a fila, o Audio Atlas e o Renomeador, e peço sua permissão antes de mudar algo.</p>
              <div className="space-y-2">{SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)} className="block w-full rounded-xl border border-slate-800 px-3 py-2 text-left text-[12.5px] text-slate-300 hover:border-cyan-500/40 hover:bg-cyan-500/5">{s}</button>)}</div>
            </div>
          )}

          {conv?.mensagens.map((m, i) => (m.papel === 'user' ? (
            <div key={m.id} className="mb-4 flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-cyan-500/15 px-3.5 py-2 text-[13px] text-cyan-50">{m.texto}</p></div>
          ) : (
            <Resposta key={m.id} msg={m} rodando={conv.rodando && i === conv.mensagens.length - 1} onPermissao={permissao} />
          )))}
          {conv?.rodando && conv.mensagens.at(-1)?.papel === 'user' && <div className="flex items-center gap-2 text-[12px] text-slate-500"><Spinner size={13} /> Iniciando {agente?.nome}…</div>}
          <div ref={fimRef} />
        </div>
      )}

      <div className="border-t border-slate-800 p-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 focus-within:border-cyan-500/60">
          <textarea
            value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!conv?.rodando) enviar() } }}
            rows={Math.min(8, Math.max(2, texto.split('\n').length))}
            placeholder={pronto ? `Peça algo ao agente… (Enter envia · Shift+Enter quebra linha)` : 'Configure o agente abaixo para começar'}
            disabled={!pronto}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <div className="relative"><Pill Icon={Folder} aberto={menu === 'pasta'} titulo={conv?.cwd} onClick={() => setMenu(menu === 'pasta' ? null : 'pasta')}>{nomePasta}</Pill>
              <Menu aberto={menu === 'pasta'} onClose={() => setMenu(null)} largura="min-w-[240px]">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pasta de trabalho</p>
                {pastasRecentes().map((p) => <Opcao key={p} ativo={conv?.cwd === p} onClick={() => usarPasta(p)}><span className="truncate font-mono text-[11px]">{p.split(/[\\/]/).filter(Boolean).pop()}</span></Opcao>)}
                <Opcao onClick={escolherPasta}><span className="flex items-center gap-2"><FolderOpen size={13} /> Escolher outra pasta…</span></Opcao>
              </Menu>
            </div>
            <div className="relative"><Pill Icon={Bot} aberto={menu === 'agente'} onClick={() => setMenu(menu === 'agente' ? null : 'agente')}>{agente?.nome || 'Claude Code'}</Pill>
              <Menu aberto={menu === 'agente'} onClose={() => setMenu(null)} largura="min-w-[330px]">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Agente</p>
                {(agentes || []).map((a) => (
                  <div key={a.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${a.id === agenteId ? 'bg-cyan-500/10' : 'hover:bg-slate-800'}`}>
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] text-slate-200" onClick={() => trocarAgente(a.id)}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.instalado ? (a.logado === false ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-slate-600'}`} />
                      <span className="truncate">{a.nome}</span>
                      {!a.instalado && <span className="shrink-0 text-[10px] italic text-slate-500">não instalado</span>}
                      {a.instalado && a.logado === false && <span className="shrink-0 text-[10px] italic text-amber-400/80">sem login</span>}
                    </button>
                    {(!a.instalado || a.logado === false) && <button className="shrink-0 text-[11px] text-cyan-300 underline decoration-cyan-500/40 hover:text-cyan-200" onClick={() => { setMenu(null); setVerAgentes(true) }}>Configurar</button>}
                    {a.id === agenteId && <Check size={13} className="shrink-0 text-cyan-400" />}
                  </div>
                ))}
              </Menu>
            </div>
            {modelos.length > 0 && (
              <div className="relative"><Pill Icon={Cpu} aberto={menu === 'modelo'} onClick={() => setMenu(menu === 'modelo' ? null : 'modelo')}>{perAg.model || 'auto'}</Pill>
                <Menu aberto={menu === 'modelo'} onClose={() => setMenu(null)}>
                  <Opcao ativo={!perAg.model} onClick={() => { setPerAg({ model: '' }); setMenu(null) }}>auto</Opcao>
                  {modelos.map((m) => <Opcao key={m.id} ativo={perAg.model === m.id} onClick={() => { setPerAg({ model: m.id }); setMenu(null) }}><span className="truncate">{m.rotulo || m.id}</span></Opcao>)}
                </Menu>
              </div>
            )}
            <div className="relative"><Pill Icon={Gauge} aberto={menu === 'esforco'} onClick={() => setMenu(menu === 'esforco' ? null : 'esforco')}>{ESF_ROTULO[perAg.effort || ''] || perAg.effort}</Pill>
              <Menu aberto={menu === 'esforco'} onClose={() => setMenu(null)}>
                {esforcos.map((ef) => <Opcao key={ef || 'auto'} ativo={(perAg.effort || '') === ef} onClick={() => { setPerAg({ effort: ef }); setMenu(null) }}>{ESF_ROTULO[ef] || ef}</Opcao>)}
              </Menu>
            </div>
            <div className="flex-1" />
            {conv?.rodando ? (
              <button onClick={() => call('chat:stop', conv.id)} title="Parar" className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"><Square size={13} /></button>
            ) : (
              <button onClick={() => enviar()} disabled={!texto.trim() || !pronto} title="Enviar (Enter)" className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-30"><Send size={14} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
