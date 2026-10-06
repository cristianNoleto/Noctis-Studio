import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderPen, FolderOpen, Undo2, Search, X, Lightbulb, ChevronDown, Check, TriangleAlert } from 'lucide-react'
import { call, useSettings, useToast } from '../lib/api'
import { btnGhost, btnPrimary, Card, EmptyState, inputCls, Modal, PageHeader, Toggle } from '../components/ui'

const MAIS = [
  { key: 'numerar', label: 'Numerar em sequência…' },
  { key: 'comeco', label: 'Adicionar texto no começo…' },
  { key: 'fim', label: 'Adicionar texto no fim…' },
  { key: 'min', label: 'tudo minúsculo' },
  { key: 'mai', label: 'TUDO MAIÚSCULO' },
  { key: 'tit', label: 'Primeira Letra Maiúscula' },
  { key: 'limpar', label: 'Limpar nomes' },
]

function descrever(a) {
  if (a.tipo === 'substituir') return `Substituir ${a.modo} "${a.termo}" por "${a.novo}"`
  if (a.tipo === 'remover') return `Remover ${a.modo} "${a.termo}"`
  if (a.tipo === 'prefixo' || a.tipo === 'sufixo') return `Adicionar ${a.tipo} "${a.texto}"`
  if (a.tipo === 'numerar') return `Numerar "${a.formato}" a partir de ${a.inicio}`
  if (a.tipo === 'caixa') return { min: 'Converter para minúsculas', mai: 'Converter para MAIÚSCULAS', tit: 'Converter para Título' }[a.modo]
  return 'Limpar espaços, separadores e caracteres inválidos'
}

// Pergunta de texto (Trocar, Numerar, Adicionar texto).
function Pergunta({ pedido, onClose }) {
  const [v, setV] = useState('')
  useEffect(() => { setV(pedido?.inicial || '') }, [pedido])
  if (!pedido) return null
  return (
    <Modal open title={pedido.titulo} onClose={() => onClose(null)} width="max-w-md"
      footer={<><button className={btnGhost} onClick={() => onClose(null)}>Cancelar</button><button className={btnPrimary} onClick={() => onClose(v)}>OK</button></>}>
      <p className="mb-3 whitespace-pre-line text-sm text-slate-400">{pedido.texto}</p>
      <input autoFocus className={inputCls} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onClose(v) }} />
    </Modal>
  )
}

export default function Renomeador() {
  const toast = useToast()
  const { settings } = useSettings()
  const [pasta, setPasta] = useState(null)
  const [sub, setSub] = useState(false)
  const [exts, setExts] = useState('')
  const [analise, setAnalise] = useState(null)
  const [acoes, setAcoes] = useState([])
  const [linhas, setLinhas] = useState([])
  const [busca, setBusca] = useState('')
  const [soMuda, setSoMuda] = useState(true)
  const [pedido, setPedido] = useState(null)
  const [maisOpen, setMaisOpen] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [ultimo, setUltimo] = useState(null)
  const resolver = useRef(null)

  const perguntar = (titulo, texto, inicial = '') => new Promise((res) => { resolver.current = res; setPedido({ titulo, texto, inicial }) })
  const responder = (v) => { setPedido(null); resolver.current?.(v) }

  const analisar = useCallback(async (p = pasta, s = sub, e = exts) => {
    if (!p) return
    try { setAnalise(await call('ren:analisar', { pasta: p, subpastas: s, extensoes: e })) } catch (err) { toast(err.message, 'error') }
  }, [pasta, sub, exts, toast])

  useEffect(() => {
    if (!pasta) return
    let vivo = true
    call('ren:previa', { pasta, subpastas: sub, extensoes: exts, acoes }).then((l) => { if (vivo) setLinhas(l) }).catch((e) => toast(e.message, 'error'))
    return () => { vivo = false }
  }, [pasta, sub, exts, acoes, analise, toast])

  const atualizarUltimo = useCallback(() => call('ren:ultimo').then(setUltimo).catch(() => {}), [])
  useEffect(() => { atualizarUltimo() }, [atualizarUltimo])

  async function escolher() {
    const p = await call('sys:pickFolder', { title: 'Escolha a pasta', defaultPath: settings?.renomeador?.lastFolder || undefined })
    if (!p) return
    setPasta(p); setAcoes([]); setBusca('')
    analisar(p, sub, exts)
  }

  const add = (a) => setAcoes((l) => [...l, a])
  async function trocar([tipo, txt]) {
    const novo = await perguntar('Trocar', `Trocar "${txt}" por:`)
    if (novo === null) return
    add(novo ? { tipo: 'substituir', modo: tipo, termo: txt, novo } : { tipo: 'remover', modo: tipo, termo: txt })
  }
  async function mais(k) {
    setMaisOpen(false)
    if (['min', 'mai', 'tit'].includes(k)) return add({ tipo: 'caixa', modo: k })
    if (k === 'limpar') return add({ tipo: 'limpar' })
    if (k === 'numerar') {
      const fmt = await perguntar('Numerar', 'Modelo do nome. ### vira 001, 002, 003…\nEx.: ferias_###\n(deixe vazio para manter o nome e só numerar)')
      if (fmt !== null) add({ tipo: 'numerar', formato: fmt || '{nome}_###', inicio: 1 })
      return
    }
    const tipo = k === 'comeco' ? 'prefixo' : 'sufixo'
    const txt = await perguntar('Adicionar texto', `Texto para colocar no ${k === 'comeco' ? 'começo' : 'fim'} de todos os nomes:`)
    if (txt) add({ tipo, texto: txt })
  }

  const muda = linhas.filter((l) => l.status === 'muda').length
  const conf = linhas.filter((l) => l.status === 'conflito').length
  const pode = muda > 0 && conf === 0
  const visiveis = useMemo(() => {
    const q = busca.toLowerCase()
    return (analise?.itens || []).filter((i) => i[1].toLowerCase().includes(q))
  }, [analise, busca])
  const ordem = { conflito: 0, muda: 1, igual: 2 }
  const tabela = useMemo(() => [...linhas].sort((a, b) => ordem[a.status] - ordem[b.status]).filter((l) => !soMuda || l.status !== 'igual'), [linhas, soMuda]) // eslint-disable-line react-hooks/exhaustive-deps

  async function aplicar() {
    setConfirmar(false)
    try {
      const n = await call('ren:aplicar', { pasta, subpastas: sub, extensoes: exts, acoes })
      toast(`Pronto! ${n} arquivo(s) renomeado(s).`, 'success')
      setAcoes([])
      analisar()
      atualizarUltimo()
    } catch (e) { toast(`Nada foi alterado. ${e.message}`, 'error') }
  }
  async function desfazer() {
    if (!ultimo) return toast('Não há operação para desfazer.')
    try {
      const r = await call('ren:desfazer')
      if (r) toast(`Operação de ${r.data.replace('T', ' ')} desfeita (${r.total} arquivo(s)).`, 'success')
      analisar(); atualizarUltimo()
    } catch (e) { toast(`Não foi possível desfazer. Nada foi alterado. ${e.message}`, 'error') }
  }

  if (!pasta) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <Card className="fade-up w-full max-w-lg p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-slate-950"><FolderPen size={28} /></div>
          <h1 className="text-2xl font-bold">Renomeador</h1>
          <p className="mx-auto mb-7 mt-2 max-w-sm text-sm text-slate-400">Escolha uma pasta e eu analiso os nomes dos arquivos. Depois é só escolher o que trocar, conferir e aplicar.</p>
          <button className={`${btnPrimary} w-full py-3 text-[15px]`} onClick={escolher}><FolderOpen size={17} /> Escolher pasta</button>
          <label className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-400"><Toggle checked={sub} onChange={setSub} /> Incluir subpastas</label>
          <button className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300" onClick={desfazer}><Undo2 size={13} /> Desfazer última operação{ultimo ? ` (${ultimo.total} arquivos)` : ''}</button>
          <p className="mt-6 text-[11px] text-slate-600">Nunca apaga arquivos e nunca muda a extensão.</p>
        </Card>
        <Pergunta pedido={pedido} onClose={responder} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-6 py-5">
      <PageHeader icon={FolderPen} kicker="Ferramentas" title="Renomeador" />
      <Card className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <button className={btnGhost} onClick={escolher}>Trocar pasta</button>
        <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-300" title={pasta}>📁 {pasta}</p>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-400">{analise?.total ?? 0} arquivo(s)</span>
        <label className="flex items-center gap-2 text-xs text-slate-400"><Toggle checked={sub} onChange={(v) => { setSub(v); analisar(pasta, v, exts) }} /> Subpastas</label>
        <input className={`${inputCls} w-48 py-1.5`} placeholder="Só extensões: .mp4 .png" value={exts} onChange={(e) => setExts(e.target.value)} onBlur={() => analisar()} onKeyDown={(e) => { if (e.key === 'Enter') analisar() }} />
        <button className={btnGhost} onClick={desfazer}><Undo2 size={14} /> Desfazer última</button>
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-[400px_1fr] gap-4">
        <Card className="flex min-h-0 flex-col p-4">
          <h2 className="text-lg font-bold">O que encontrei</h2>
          <p className="mb-3 text-xs text-slate-500">Palavras que se repetem nos nomes. Troque ou remova o que quiser.</p>
          {analise?.sujos > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
              <Lightbulb size={16} className="shrink-0 text-amber-400" />
              <p className="flex-1 text-xs text-amber-300">{analise.sujos} arquivo(s) com espaços duplos, separadores repetidos ou caracteres inválidos.</p>
              <button className={`${btnPrimary} px-3 py-1 text-xs`} onClick={() => add({ tipo: 'limpar' })}>Corrigir</button>
            </div>
          )}
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input className={`${inputCls} py-2 pl-9`} placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
            {visiveis.length === 0 && <p className="py-6 text-center text-sm text-slate-600">Nada encontrado.</p>}
            {visiveis.slice(0, 200).map((it) => {
              const [tipo, txt, n] = it
              const mostra = tipo === 'prefixo' ? `${txt}…` : tipo === 'sufixo' ? `…${txt}` : txt
              const onde = tipo === 'prefixo' ? 'começo do nome · ' : tipo === 'sufixo' ? 'fim do nome · ' : ''
              return (
                <div key={`${tipo}|${txt}`} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-100">{mostra}</p>
                    <p className="text-[11px] text-slate-500">{onde}{n} arquivo{n !== 1 ? 's' : ''}</p>
                  </div>
                  <button className="rounded-lg bg-cyan-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400" onClick={() => trocar(it)}>Trocar</button>
                  <button className="rounded-lg border border-slate-800 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10" onClick={() => add({ tipo: 'remover', modo: tipo, termo: txt })}>Remover</button>
                </div>
              )
            })}
          </div>
          <div className="relative mt-3">
            <button className={`${btnGhost} w-full justify-between`} onClick={() => setMaisOpen(!maisOpen)}>Mais opções… <ChevronDown size={15} /></button>
            {maisOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
                {MAIS.map((m) => <button key={m.key} className="block w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800" onClick={() => mais(m.key)}>{m.label}</button>)}
              </div>
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">Como vai ficar</h2>
            <label className="flex items-center gap-2 text-xs text-slate-400"><Toggle checked={soMuda} onChange={setSoMuda} /> Só os que mudam</label>
          </div>
          {acoes.length === 0 ? (
            <p className="mb-3 text-sm text-slate-500">Nenhuma mudança escolhida ainda. Use Trocar ou Remover à esquerda.</p>
          ) : (
            <div className="mb-3 space-y-1">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">Mudanças escolhidas</p><button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => setAcoes([])}>Limpar tudo</button></div>
              {acoes.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg bg-slate-950/60 px-2 py-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[11px] font-bold text-slate-950">{i + 1}</span>
                  <span className="flex-1 text-sm text-slate-300">{descrever(a)}</span>
                  <button className="rounded p-1 text-slate-500 hover:text-red-400" onClick={() => setAcoes((l) => l.filter((_, j) => j !== i))}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-800">
            {tabela.length === 0 ? (
              <EmptyState title="Nada para mostrar" description={soMuda ? 'Nenhum arquivo muda com as escolhas atuais.' : 'Pasta vazia.'} />
            ) : (
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-slate-900 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-2">Antes</th><th className="px-3 py-2">Depois</th><th className="w-44 px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {tabela.map((l) => (
                    <tr key={l.de} className={`border-t border-slate-800/60 ${l.status === 'conflito' ? 'bg-red-500/10' : ''}`}>
                      <td className="max-w-0 truncate px-3 py-2 text-slate-400" title={l.rel}>{l.rel}</td>
                      <td className={`max-w-0 truncate px-3 py-2 ${l.status === 'muda' ? 'text-emerald-400' : l.status === 'conflito' ? 'text-red-300' : 'text-slate-500'}`} title={l.novo}>{l.novo}</td>
                      <td className="px-3 py-2 text-xs">
                        {l.status === 'muda' ? <span className="text-emerald-400"><Check size={12} className="mr-1 inline" />vai mudar</span>
                          : l.status === 'igual' ? <span className="text-slate-600">sem mudança</span>
                            : <span className="text-red-300"><TriangleAlert size={12} className="mr-1 inline" />{l.motivo}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-3 flex items-center gap-4">
            <p className={`flex-1 text-sm ${conf ? 'text-red-400' : muda ? 'text-emerald-400' : 'text-slate-500'}`}>
              {conf ? `⚠ ${conf} conflito(s). Remova ou ajuste uma mudança para continuar.` : muda ? `${muda} de ${linhas.length} arquivo(s) serão renomeados.` : 'Escolha o que mudar à esquerda e confira aqui antes de aplicar.'}
            </p>
            <button disabled={!pode} className="rounded-xl bg-emerald-600 px-8 py-3 text-[15px] font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500" onClick={() => setConfirmar(true)}>Aplicar</button>
          </div>
        </Card>
      </div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Renomear arquivos" width="max-w-sm"
        footer={<><button className={btnGhost} onClick={() => setConfirmar(false)}>Cancelar</button><button className={btnPrimary} onClick={aplicar}>Renomear {muda}</button></>}>
        <p className="text-sm text-slate-400">Renomear {muda} arquivo(s)? Você pode desfazer depois.</p>
      </Modal>
      <Pergunta pedido={pedido} onClose={responder} />
    </div>
  )
}
