import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal, Copy, Trash2, Download, CircleCheck, Info, TriangleAlert, CircleX, Search } from 'lucide-react'
import { call, useEvent, useToast } from '../lib/api'
import { btnGhost, inputCls, Segmented } from '../components/ui'

const LEVEL = {
  info: { Icon: Info, cls: 'text-sky-400', text: 'text-slate-300' },
  success: { Icon: CircleCheck, cls: 'text-emerald-400', text: 'text-emerald-300/90' },
  warn: { Icon: TriangleAlert, cls: 'text-amber-400', text: 'text-amber-300' },
  error: { Icon: CircleX, cls: 'text-red-400', text: 'text-red-300' },
}

export default function Logs() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [nivel, setNivel] = useState('all')
  const [busca, setBusca] = useState('')
  const box = useRef(null)
  const colado = useRef(true)

  useEffect(() => { call('logs:recent', 1500).then(setItems).catch(() => {}) }, [])
  useEvent('log', (e) => setItems((l) => (l.length > 3000 ? [...l.slice(-2500), e] : [...l, e])))

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return items.filter((e) =>
      (nivel === 'all' || (nivel === 'warn' ? e.level === 'warn' || e.level === 'error' : e.level === nivel)) &&
      (!q || e.message.toLowerCase().includes(q)))
  }, [items, nivel, busca])

  useEffect(() => {
    const el = box.current
    if (el && colado.current) el.scrollTop = el.scrollHeight
  }, [visiveis])

  const copiar = async () => {
    await navigator.clipboard.writeText(visiveis.map((e) => `[${e.time}] [${e.level.toUpperCase()}] ${e.message}`).join('\n'))
    toast('Logs copiados.', 'success')
  }
  const exportar = async () => {
    const p = await call('logs:export').catch((e) => toast(e.message, 'error'))
    if (p) toast(`Logs exportados em ${p}`, 'success')
  }

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col px-8 py-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-slate-300">
            <Terminal size={12} className="text-cyan-400" /> CONSOLE
          </span>
          <h1 className="text-3xl font-bold tracking-tight">System <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">Logs</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-emerald-400"><span className="online-dot h-2 w-2 rounded-full bg-emerald-400" /> Ao vivo</span>
          <button className={btnGhost} onClick={copiar}><Copy size={14} /> Copiar</button>
          <button className={btnGhost} onClick={exportar}><Download size={14} /> Exportar</button>
          <button className={btnGhost} onClick={() => { call('logs:clear'); setItems([]) }}><Trash2 size={14} /> Limpar</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented size="sm" value={nivel} onChange={setNivel} options={[
          { value: 'all', label: 'Tudo' }, { value: 'success', label: 'Sucesso' }, { value: 'warn', label: 'Avisos e erros' }, { value: 'error', label: 'Só erros' },
        ]} />
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input className={`${inputCls} py-1.5 pl-9`} placeholder="Filtrar (projeto, conta, job…)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <span className="text-xs text-slate-600">{visiveis.length} linha(s)</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0a0b0e]">
        <div className="flex items-center gap-2 border-b border-slate-800/80 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-500/80" /><span className="h-3 w-3 rounded-full bg-amber-400/80" /><span className="h-3 w-3 rounded-full bg-emerald-500/80" />
          <span className="ml-2 font-mono text-[11px] text-slate-600">noctis-studio — logs</span>
        </div>
        <div
          ref={box}
          data-selectable
          onScroll={(e) => { const el = e.currentTarget; colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}
          className="flex-1 overflow-y-auto px-2 py-2 font-mono text-[12.5px]"
        >
          {visiveis.length === 0 && <p className="px-3 py-6 text-center text-slate-600">Nada por aqui ainda.</p>}
          {visiveis.map((e) => {
            const L = LEVEL[e.level] || LEVEL.info
            return (
              <div key={e.id} className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-900/60">
                <span className="w-16 shrink-0 text-[11px] text-slate-600">{e.time}</span>
                <L.Icon size={14} className={`mt-0.5 shrink-0 ${L.cls}`} />
                <span className={`whitespace-pre-wrap break-words ${L.text}`}>{e.message}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
