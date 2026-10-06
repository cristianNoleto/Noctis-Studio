import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Plus, History, Settings2, Send, Square, Bot, Wrench, ChevronRight, Brain, TriangleAlert, Check, ShieldQuestion,
  FolderOpen, Download, LogIn, RefreshCw, ExternalLink, Trash2, Sparkles, TerminalSquare, FileText, Globe, Search,
} from 'lucide-react'
import { call, useEvent, useSettings, useToast } from '../lib/api'
import { btnGhost, btnPrimary, iconBtn, inputCls, Spinner } from './ui'

const PERMISSOES = [
  { v: '', t: 'Perguntar', s: 'pede sua aprovação antes de mexer em algo' },
  { v: 'acceptEdits', t: 'Aceitar edições', s: 'edita arquivos sem perguntar; comandos ainda perguntam' },
  { v: 'plan', t: 'Só planejar', s: 'analisa e propõe, não executa nada' },
  { v: 'bypassPermissions', t: 'Livre', s: 'faz tudo sem perguntar (cuidado)' },
]
const SUGESTOES = [
  'Como está a fila e o que foi gerado hoje?',
  'Crie um projeto "Canal Mistérios" e envie 3 prompts de cenas noturnas em 16:9',
  'Ache 5 músicas de suspense no Audio Atlas',
  'Quais jobs falharam no último projeto e por quê?',
]
const NOMES = {
  Bash: ['Terminal', TerminalSquare], PowerShell: ['Terminal', TerminalSquare], Read: ['Ler arquivo', FileText], Write: ['Criar arquivo', FileText],
  Edit: ['Editar arquivo', FileText], MultiEdit: ['Editar arquivo', FileText], Glob: ['Procurar arquivos', Search], Grep: ['Buscar no código', Search],
  WebFetch: ['Abrir página', Globe], WebSearch: ['Pesquisar na web', Globe], TodoWrite: ['Lista de tarefas', Check], Task: ['Subagente', Bot], Agent: ['Subagente', Bot],
}
const OCULTAS = new Set(['ToolSearch'])

function nomeFerramenta(n) {
  if (n.startsWith('mcp__noctis__')) return [`Noctis · ${n.slice(13).replace(/_/g, ' ')}`, Sparkles]
  if (n.startsWith('mcp__')) return [n.split('__').slice(1).join(' · '), Wrench]
  return NOMES[n] || [n, Wrench]
}
function resumoEntrada(e = {}) {
  const v = e.command || e.file_path || e.path || e.pattern || e.url || e.query || e.description || e.prompt || e.texto || e.busca || e.nome
  if (v) return String(v).split('\n')[0].slice(0, 120)
  const s = JSON.stringify(e)
  return s === '{}' ? '' : s.slice(0, 120)
}

// Markdown simples e seguro (sem HTML cru): blocos de código, títulos, listas, **negrito**, `código`, links.
function Inline({ texto }) {
  const partes = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  let i = 0
  let m
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
  const blocos = []
  const linhas = String(texto || '').split('\n')
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    if (l.startsWith('```')) {
      const cod = []
      i++
      while (i < linhas.length && !linhas[i].startsWith('```')) cod.push(linhas[i++])
      blocos.push(<pre key={i} className="my-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11.5px] leading-relaxed text-slate-300">{cod.join('\n')}</pre>)
    } else if (/^#{1,4}\s/.test(l)) {
      blocos.push(<p key={i} className="mb-1 mt-3 font-semibold text-slate-100"><Inline texto={l.replace(/^#+\s/, '')} /></p>)
    } else if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const itens = []
      while (i < linhas.length && /^\s*([-*]|\d+\.)\s/.test(linhas[i])) itens.push(linhas[i++])
      i--
      blocos.push(<ul key={i} className="my-1.5 space-y-1 pl-1">{itens.map((it, k) => { const num = it.match(/^\s*(\d+)\./); return <li key={k} className="flex gap-2"><span className="shrink-0 text-cyan-400">{num ? `${num[1]}.` : '•'}</span><span><Inline texto={it.replace(/^\s*([-*]|\d+\.)\s/, '')} /></span></li> })}</ul>)
    } else if (l.trim()) {
      blocos.push(<p key={i} className="my-1"><Inline texto={l} /></p>)
    }
  }
  return <div className="text-[13px] leading-relaxed text-slate-300">{blocos}</div>
}

function Ferramenta({ b, onPermissao }) {
  const [aberto, setAberto] = useState(false)
  const [rot, Icon] = nomeFerramenta(b.nome)
  const pendente = b.permissao?.estado === 'pendente'
  const status = b.resultado === undefined ? (pendente ? 'aguardando' : 'rodando') : b.erro ? 'erro' : 'ok'
  return (
    <div className={`my-1.5 rounded-xl border ${pendente ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-950/50'}`}>
      <button onClick={() => setAberto(!aberto)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Icon size={13} className={b.nome.startsWith('mcp__noctis__') ? 'text-cyan-400' : 'text-slate-400'} />
        <span className="text-[12px] font-semibold text-slate-200">{rot}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">{resumoEntrada(b.entrada)}</span>
        {status === 'rodando' && <Spinner size={12} />}
        {status === 'ok' && <Check size={13} className="text-emerald-400" />}
        {status === 'erro' && <TriangleAlert size={13} className="text-red-400" />}
        {b.permissao?.estado === 'negado' && <span className="text-[10px] font-semibold uppercase text-red-400">negado</span>}
        <ChevronRight size={13} className={`text-slate-600 transition-transform ${aberto ? 'rotate-90' : ''}`} />
      </button>
      {aberto && (
        <div className="space-y-2 border-t border-slate-800 px-3 py-2">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] text-slate-400">{JSON.stringify(b.entrada, null, 1)}</pre>
          {b.resultado !== undefined && <pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-2 font-mono text-[10.5px] ${b.erro ? 'text-red-300' : 'text-slate-400'}`}>{b.resultado || '(vazio)'}</pre>}
        </div>
      )}
      {pendente && <Permissao id={b.permissao.id} onPermissao={onPermissao} />}
    </div>
  )
}

function Permissao({ id, onPermissao, ferramenta, entrada }) {
  return (
    <div className="border-t border-amber-500/20 px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-amber-200"><ShieldQuestion size={13} /> {ferramenta ? <>Permitir <b className="font-semibold">{nomeFerramenta(ferramenta)[0]}</b>?</> : 'O agente quer usar isto. Permitir?'}</p>
      {entrada && <p className="mb-2 truncate font-mono text-[11px] text-slate-500">{resumoEntrada(entrada)}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button className="rounded-lg bg-cyan-500 px-3 py-1 text-[12px] font-semibold text-slate-950 hover:bg-cyan-400" onClick={() => onPermissao(id, { permitir: true })}>Permitir</button>
        <button className="rounded-lg border border-cyan-500/40 px-3 py-1 text-[12px] font-semibold text-cyan-300 hover:bg-cyan-500/10" onClick={() => onPermissao(id, { permitir: true, sempre: true })}>Sempre nesta conversa</button>
        <button className="rounded-lg border border-slate-700 px-3 py-1 text-[12px] font-semibold text-slate-300 hover:bg-slate-800" onClick={() => onPermissao(id, { permitir: false })}>Negar</button>
      </div>
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
          {b.k === 'permissao' && (b.estado === 'pendente' ? <div className="my-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5"><Permissao id={b.id} ferramenta={b.ferramenta} entrada={b.entrada} onPermissao={onPermissao} /></div> : null)}
          {b.k === 'atividade' && <pre className="my-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-2 font-mono text-[10.5px] text-slate-500">{b.texto.slice(-1500)}</pre>}
          {b.k === 'erro' && <div className="my-1.5 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-[12.5px] text-red-300"><TriangleAlert size={14} className="mt-0.5 shrink-0" /><span className="whitespace-pre-wrap">{b.texto}</span></div>}
        </Fragment>
      ))}
      {rodando && vazio && <div className="flex items-center gap-2 text-[12px] text-slate-500"><Spinner size={13} /> Pensando…</div>}
      {msg.fim && !msg.fim.erro && (msg.fim.custo || msg.fim.duracaoMs) ? (
        <p className="mt-1.5 font-mono text-[10px] text-slate-600">{msg.modelo ? `${msg.modelo} · ` : ''}{msg.fim.duracaoMs ? `${(msg.fim.duracaoMs / 1000).toFixed(1)}s` : ''}{msg.fim.custo ? ` · US$ ${msg.fim.custo.toFixed(3)}` : ''}</p>
      ) : null}
      {msg.fim?.motivo === 'parado' && <p className="mt-1 text-[11px] italic text-slate-500">Interrompido.</p>}
    </div>
  )
}

function Configurar({ agente, settings, save, conversa, onCwd }) {
  const c = settings?.chat || {}
  const set = (patch) => save({ chat: { ...c, ...patch } })
  return (
    <div className="space-y-4 border-b border-slate-800 bg-slate-950/60 p-4">
      {agente?.modelos?.length > 1 && (
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Modelo
          <select className={`${inputCls} mt-1.5 py-2 text-[13px] normal-case`} value={c.model || ''} onChange={(e) => set({ model: e.target.value })}>
            {agente.modelos.map((m) => <option key={m} value={m}>{m || 'Padrão do agente'}</option>)}
          </select>
        </label>
      )}
      {agente?.esforcos?.length > 1 && (
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Esforço
          <select className={`${inputCls} mt-1.5 py-2 text-[13px] normal-case`} value={c.effort || ''} onChange={(e) => set({ effort: e.target.value })}>
            {agente.esforcos.map((m) => <option key={m} value={m}>{{ '': 'Padrão', low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo' }[m]}</option>)}
          </select>
        </label>
      )}
      {agente?.completo && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Permissões</p>
          <div className="space-y-1.5">
            {PERMISSOES.map((p) => (
              <button key={p.v} onClick={() => set({ permissionMode: p.v })} className={`w-full rounded-lg border px-3 py-2 text-left ${(c.permissionMode || '') === p.v ? (p.v === 'bypassPermissions' ? 'border-red-500/50 bg-red-500/10' : 'border-cyan-500/50 bg-cyan-500/10') : 'border-slate-800 hover:border-slate-700'}`}>
                <p className="text-[12.5px] font-semibold text-slate-200">{p.t}</p><p className="text-[11px] text-slate-500">{p.s}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {conversa && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pasta de trabalho desta conversa</p>
          <button onClick={onCwd} className="flex w-full items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-slate-700">
            <FolderOpen size={14} className="shrink-0 text-cyan-400" /><span className="truncate font-mono text-[11px] text-slate-400">{conversa.cwd}</span>
          </button>
        </div>
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
  const fimRef = useRef(null)
  const agenteId = conv?.agente || settings?.chat?.agent || 'claude'
  const agente = useMemo(() => agentes?.find((a) => a.id === agenteId), [agentes, agenteId])

  const carregarAgentes = async (forcar) => { setVerificando(true); try { setAgentes(await call('chat:agents', forcar)) } catch (e) { toast(e.message, 'error') } finally { setVerificando(false) } }
  const carregarLista = async () => { const l = await call('chat:list'); setLista(l); return l }
  useEffect(() => {
    carregarAgentes(false)
    carregarLista().then((l) => {
      let ultima = null
      try { ultima = localStorage.getItem('noctis_chat') } catch { /* sem storage */ }
      const alvo = l.find((x) => x.id === ultima) || l[0]
      if (alvo) call('chat:get', alvo.id).then(setConv).catch(() => {})
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (conv?.id) try { localStorage.setItem('noctis_chat', conv.id) } catch { /* sem storage */ } }, [conv?.id])
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [conv?.mensagens?.length, conv?.mensagens?.at(-1)?.blocos?.length, conv?.rodando])

  useEvent('chat:event', (e) => {
    if (e.tipo === 'navegar') { go(e.tela); return }
    setConv((c) => {
      if (!c || c.id !== e.conversa) return c
      if (e.msg) {
        const msgs = c.mensagens.some((m) => m.id === e.msg.id) ? c.mensagens.map((m) => (m.id === e.msg.id ? e.msg : m)) : [...c.mensagens, e.msg]
        return { ...c, mensagens: msgs, rodando: e.tipo === 'fim' ? false : true }
      }
      return c
    })
    if (e.tipo === 'fim') carregarLista()
  })

  async function nova() {
    const c = await call('chat:new', { agente: settings?.chat?.agent || 'claude' })
    setConv({ ...c, rodando: false, pendentes: [] }); setVerLista(false); carregarLista()
  }
  async function enviar(t = texto) {
    t = t.trim()
    if (!t) return
    try {
      let c = conv
      if (!c) { c = await call('chat:new', { agente: agenteId }); c = { ...c, rodando: false, pendentes: [] } }
      setTexto('')
      setConv({ ...c, rodando: true, mensagens: [...c.mensagens, { id: `tmp-${Date.now()}`, papel: 'user', texto: t }] })
      await call('chat:send', c.id, t)
      setConv(await call('chat:get', c.id))
      carregarLista()
    } catch (e) { toast(e.message, 'error'); if (conv) setConv(await call('chat:get', conv.id)) }
  }
  const permissao = (id, r) => call('chat:permission', id, r).catch((e) => toast(e.message, 'error'))
  async function trocarAgente(id) {
    await save({ chat: { ...(settings?.chat || {}), agent: id, model: '', effort: '' } })
    if (conv && !conv.mensagens.length) setConv({ ...(await call('chat:update', conv.id, { agente: id })), rodando: false, pendentes: [] })
    else if (conv && conv.agente !== id) setConv(null)
  }
  async function trocarCwd() {
    const p = await call('sys:pickFolder', { title: 'Pasta onde o agente vai trabalhar', defaultPath: conv?.cwd })
    if (p && conv) setConv({ ...conv, ...(await call('chat:update', conv.id, { cwd: p })) })
  }

  const pronto = agente?.instalado && agente?.logado !== false
  return (
    <div className="flex h-full w-[440px] shrink-0 flex-col border-l border-slate-800 bg-[#101116]">
      <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2.5">
        <span className="mr-1 flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400"><Bot size={15} /></span>
        <select value={agenteId} onChange={(e) => trocarAgente(e.target.value)} className="min-w-0 flex-1 cursor-pointer truncate rounded-md bg-transparent py-1 text-[13.5px] font-semibold text-slate-100 focus:outline-none">
          {(agentes || [{ id: 'claude', nome: 'Claude Code' }]).map((a) => <option key={a.id} value={a.id} className="bg-slate-900">{a.nome}{a.completo === false ? ' (básico)' : ''}</option>)}
        </select>
        <button className={iconBtn} title="Conversas" onClick={() => { setVerLista(!verLista); setVerConfig(false); carregarLista() }}><History size={15} /></button>
        <button className={iconBtn} title="Nova conversa" onClick={nova}><Plus size={16} /></button>
        <button className={`${iconBtn} ${verConfig ? 'bg-slate-800 text-cyan-300' : ''}`} title="Ajustes do agente" onClick={() => { setVerConfig(!verConfig); setVerLista(false) }}><Settings2 size={15} /></button>
        <button className={iconBtn} title="Fechar" onClick={onClose}><X size={16} /></button>
      </div>

      {verConfig && <Configurar agente={agente} settings={settings} save={save} conversa={conv} onCwd={trocarCwd} />}

      {verLista ? (
        <div className="flex-1 overflow-y-auto p-2">
          {!lista.length && <p className="p-4 text-center text-[13px] text-slate-500">Nenhuma conversa ainda.</p>}
          {lista.map((c) => (
            <div key={c.id} className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 ${conv?.id === c.id ? 'bg-cyan-500/10' : 'hover:bg-slate-900'}`}>
              <button className="min-w-0 flex-1 text-left" onClick={async () => { setConv(await call('chat:get', c.id)); setVerLista(false) }}>
                <p className="truncate text-[13px] text-slate-200">{c.titulo}</p>
                <p className="text-[10.5px] text-slate-500">{(agentes?.find((a) => a.id === c.agente)?.nome) || c.agente} · {new Date(c.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{c.rodando ? ' · respondendo…' : ''}</p>
              </button>
              <button className="text-slate-600 opacity-0 hover:text-red-400 group-hover:opacity-100" title="Excluir conversa" onClick={async () => { setLista(await call('chat:delete', c.id)); if (conv?.id === c.id) setConv(null) }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {agentes && agente && !agente.instalado && (
            <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="mb-1 font-semibold text-slate-100">{agente.nome} não está instalado</p>
              <p className="mb-3 text-[12.5px] text-slate-400">Vou abrir um terminal com o instalador oficial. Quando terminar, clique em verificar.</p>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={() => call('chat:install', agente.id).catch((e) => toast(e.message, 'error'))}><Download size={14} /> Instalar</button>
                <button className={btnGhost} onClick={() => carregarAgentes(true)}>{verificando ? <Spinner size={13} /> : <RefreshCw size={13} />} Verificar</button>
                <button className={btnGhost} onClick={() => call('sys:openExternal', agente.site)}><ExternalLink size={13} /></button>
              </div>
            </div>
          )}
          {agente?.instalado && agente.logado === false && (
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="mb-1 font-semibold text-slate-100">Entre na sua conta do {agente.nome}</p>
              <p className="mb-3 text-[12.5px] text-slate-400">Vou abrir um terminal; siga o login no navegador. Usa a sua assinatura/conta do próprio agente.</p>
              <div className="flex gap-2">
                <button className={btnPrimary} onClick={() => call('chat:login', agente.id).catch((e) => toast(e.message, 'error'))}><LogIn size={14} /> Entrar</button>
                <button className={btnGhost} onClick={() => carregarAgentes(true)}>{verificando ? <Spinner size={13} /> : <RefreshCw size={13} />} Verificar</button>
              </div>
            </div>
          )}
          {agente && !agente.completo && agente.instalado && (
            <p className="mb-3 rounded-lg border border-slate-800 px-3 py-2 text-[11.5px] text-slate-500">Modo básico: responde por texto, mas não usa as ferramentas do Noctis. Para mexer em projetos, fila e arquivos use o Claude Code.</p>
          )}

          {(!conv || !conv.mensagens.length) && pronto && (
            <div className="mt-6 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400"><Sparkles size={22} /></span>
              <p className="font-semibold text-slate-100">Como posso ajudar?</p>
              <p className="mx-auto mb-5 mt-1 max-w-[300px] text-[12.5px] text-slate-500">{agente?.completo ? 'Eu vejo seus projetos, a fila, o Audio Atlas e o Renomeador, e peço sua permissão antes de mudar algo.' : 'Converse e peça ideias, roteiros e prompts.'}</p>
              <div className="space-y-2">
                {SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)} className="block w-full rounded-xl border border-slate-800 px-3 py-2 text-left text-[12.5px] text-slate-300 hover:border-cyan-500/40 hover:bg-cyan-500/5">{s}</button>)}
              </div>
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
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!conv?.rodando) enviar() } }}
            rows={Math.min(8, Math.max(2, texto.split('\n').length))}
            placeholder={pronto ? `Mensagem para o ${agente?.nome || 'agente'}…` : 'Configure o agente acima para começar'}
            disabled={!pronto}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <button onClick={trocarCwd} disabled={!conv} title={conv?.cwd} className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] text-slate-500 hover:bg-slate-900 hover:text-slate-300 disabled:opacity-40">
              <FolderOpen size={11} /><span className="max-w-[170px] truncate font-mono">{conv?.cwd ? conv.cwd.split(/[\\/]/).filter(Boolean).pop() : 'pasta'}</span>
            </button>
            {agente?.completo && <span className="truncate text-[10.5px] text-slate-600">{PERMISSOES.find((p) => p.v === (settings?.chat?.permissionMode || ''))?.t}</span>}
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
