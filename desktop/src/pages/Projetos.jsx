import { useCallback, useEffect, useState } from 'react'
import { Images, Plus, CheckSquare, Pause, Play, Trash2, ImageOff, FolderOpen, X } from 'lucide-react'
import { call, useEvent, useSettings, useToast } from '../lib/api'
import { mediaUrl, quando } from '../lib/media'
import { btnDanger, btnGhost, btnPrimary, EmptyState, Field, inputCls, Modal, PageHeader } from '../components/ui'

const PRIORIDADES = [{ v: -1, l: 'Baixa' }, { v: 0, l: 'Normal' }, { v: 1, l: 'Alta' }]

function NovoProjeto({ open, onClose, onCriado }) {
  const toast = useToast()
  const { settings } = useSettings()
  const [nome, setNome] = useState('')
  const [conta, setConta] = useState('')
  const [pasta, setPasta] = useState('')
  const [contas, setContas] = useState([])
  useEffect(() => { if (open) { setNome(''); setPasta(''); call('accounts:list').then((l) => { setContas(l.filter((c) => c.provider === 'flow')); setConta(l.find((c) => c.is_default)?.id || '') }).catch(() => {}) } }, [open])
  async function criar() {
    try {
      const p = await call('creator:createProject', { name: nome, account_id: conta || null, folder: pasta || null })
      onCriado(p)
    } catch (e) { toast(e.message, 'error') }
  }
  const manual = settings?.dispatch?.distribution === 'manual'
  return (
    <Modal open={open} onClose={onClose} title="Novo projeto" width="max-w-lg"
      footer={<><button className={btnGhost} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={!nome.trim()} onClick={criar}><Plus size={15} /> Criar projeto</button></>}>
      <div className="space-y-4">
        <Field label="Nome do projeto" hint="Vira também o nome da pasta (sem acentos).">
          <input autoFocus className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim()) criar() }} placeholder="Ex.: Vídeo 11 — A Ordem Secreta" />
        </Field>
        <Field label={`Conta Google ${manual ? '' : '(usada só na distribuição Manual)'}`}>
          <select className={inputCls} value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Conta padrão</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.masked}@… · {c.plan || 'free'}</option>)}
          </select>
        </Field>
        <Field label="Pasta (opcional)" hint={`Padrão: ${settings?.projectsRoot || ''}\\<nome do projeto>`}>
          <div className="flex gap-2">
            <input className={`${inputCls} font-mono text-[13px]`} value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="Deixe vazio para usar a pasta padrão" />
            <button className={btnGhost} onClick={async () => { const p = await call('sys:pickFolder', { title: 'Pasta do projeto' }); if (p) setPasta(p) }}><FolderOpen size={15} /></button>
          </div>
        </Field>
      </div>
    </Modal>
  )
}

export default function Projetos({ go }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [novo, setNovo] = useState(false)
  const [selecionar, setSelecionar] = useState(false)
  const [sel, setSel] = useState(new Set())
  const [renomear, setRenomear] = useState(null)
  const [excluir, setExcluir] = useState(null)
  const [comArquivos, setComArquivos] = useState(false)

  const carregar = useCallback(() => call('creator:projects').then(setLista).catch((e) => toast(e.message, 'error')), [toast])
  useEffect(() => { carregar() }, [carregar])
  useEvent('creator:update', carregar)

  const atualizar = async (id, campos) => { await call('creator:updateProject', id, campos); carregar() }
  async function confirmarExclusao() {
    await call('creator:deleteProjects', excluir, { arquivos: comArquivos })
    toast(`${excluir.length} projeto(s) excluído(s).`, 'success')
    setExcluir(null); setSel(new Set()); setSelecionar(false); carregar()
  }

  return (
    <div className="mx-auto max-w-[1500px] px-8 py-7 pb-28">
      <PageHeader icon={Images} kicker="Produção" title="Meus" accent="Projetos" subtitle="Cada projeto guarda as imagens e vídeos que você manda gerar."
        right={
          <div className="flex gap-2">
            {selecionar && sel.size > 0 && <button className={btnDanger} onClick={() => setExcluir([...sel])}><Trash2 size={15} /> Excluir {sel.size}</button>}
            <button className={btnGhost} onClick={() => { setSelecionar(!selecionar); setSel(new Set()) }}>{selecionar ? <X size={15} /> : <CheckSquare size={15} />}{selecionar ? 'Cancelar' : 'Selecionar'}</button>
          </div>
        } />

      {lista && lista.length === 0 && (
        <EmptyState icon={Images} title="Nenhum projeto ainda" description="Crie um projeto e mande os prompts: cada linha vira uma imagem ou um vídeo." action={<button className={btnPrimary} onClick={() => setNovo(true)}><Plus size={15} /> Novo projeto</button>} />
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
        {(lista || []).map((p) => {
          const marcado = sel.has(p.id)
          return (
            <div key={p.id} className="group">
              <div
                onClick={() => (selecionar ? setSel((s) => { const n = new Set(s); marcado ? n.delete(p.id) : n.add(p.id); return n }) : go(`creator/${p.id}`))}
                className={`card-hover relative aspect-video cursor-pointer overflow-hidden rounded-2xl border bg-slate-900 ${marcado ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-slate-800'}`}
              >
                {p.cover ? (
                  p.cover.kind === 'video'
                    ? <video src={mediaUrl(p.cover.path)} muted className="h-full w-full object-cover" />
                    : <img src={mediaUrl(p.cover.path)} className="h-full w-full object-cover" alt="" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-600"><ImageOff size={26} /><span className="text-xs">Sem mídia ainda</span></div>
                )}
                {p.paused && <span className="absolute left-3 top-3 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-slate-950">PAUSADO</span>}
                {(p.counts.pending + p.counts.processing) > 0 && !p.paused && <span className="absolute left-3 top-3 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-slate-950">GERANDO</span>}
                {!selecionar && (
                  <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <select value={p.priority} onChange={(e) => atualizar(p.id, { priority: Number(e.target.value) })} className="rounded-lg border border-slate-700 bg-slate-950/90 px-2 py-1 text-xs text-slate-200" title="Prioridade na fila">
                      {PRIORIDADES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                    </select>
                    <button onClick={() => atualizar(p.id, { paused: !p.paused })} className="rounded-lg border border-slate-700 bg-slate-950/90 p-1.5 text-slate-200 hover:text-cyan-300" title={p.paused ? 'Retomar' : 'Pausar'}>{p.paused ? <Play size={14} /> : <Pause size={14} />}</button>
                    <button onClick={() => setExcluir([p.id])} className="rounded-lg border border-slate-700 bg-slate-950/90 p-1.5 text-slate-200 hover:text-red-400" title="Excluir"><Trash2 size={14} /></button>
                  </div>
                )}
                {selecionar && <span className={`absolute right-3 top-3 h-5 w-5 rounded-md border-2 ${marcado ? 'border-cyan-400 bg-cyan-400' : 'border-slate-400 bg-slate-950/60'}`} />}
              </div>
              <div className="mt-2.5 flex items-center gap-2 px-1">
                {renomear === p.id ? (
                  <input autoFocus defaultValue={p.name} className={`${inputCls} py-1`} onBlur={(e) => { atualizar(p.id, { name: e.target.value.trim() || p.name }); setRenomear(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenomear(null) }} />
                ) : (
                  <button className="truncate font-semibold text-slate-100 hover:text-cyan-300" onClick={() => setRenomear(p.id)} title="Clique para renomear">{p.name}</button>
                )}
                <span className="rounded-md border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-300">{p.counts.done} / {p.counts.total}</span>
                <span className="ml-auto shrink-0 text-[11px] text-slate-500">{quando(p.updated_at)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={() => setNovo(true)} className="fixed bottom-7 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/95 px-7 py-3.5 text-[15px] font-bold text-slate-100 shadow-2xl shadow-black/50 backdrop-blur hover:border-cyan-500/50 hover:text-cyan-300">
        <Plus size={18} className="text-cyan-400" /> Novo projeto
      </button>

      <NovoProjeto open={novo} onClose={() => setNovo(false)} onCriado={(p) => { setNovo(false); toast(`Projeto "${p.name}" criado.`, 'success'); go(`creator/${p.id}`) }} />
      <Modal open={!!excluir} onClose={() => setExcluir(null)} title="Excluir projeto(s)" width="max-w-md"
        footer={<><button className={btnGhost} onClick={() => setExcluir(null)}>Cancelar</button><button className={btnDanger} onClick={confirmarExclusao}><Trash2 size={15} /> Excluir</button></>}>
        <p className="text-sm text-slate-400">Excluir {excluir?.length} projeto(s) do app? Os jobs pendentes param.</p>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="accent-cyan-500" checked={comArquivos} onChange={(e) => setComArquivos(e.target.checked)} /> Mandar também a pasta com os arquivos para a Lixeira do computador</label>
      </Modal>
    </div>
  )
}
