import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Folder, Search, Settings2, LayoutGrid, Image as ImageIcon, Film, Upload, Puzzle, Star, TriangleAlert, ClipboardList, Trash2,
  Pause, Play, RotateCcw, Wand2, Pencil, Copy, Recycle, FolderOpen, Sparkles, Undo2,
} from 'lucide-react'
import { call, useEvent, useToast } from '../lib/api'
import { btnDanger, btnGhost, btnPrimary, EmptyState, inputCls, Modal, Segmented, Toggle } from '../components/ui'
import JobCard from '../components/creator/JobCard'
import Composer from '../components/creator/Composer'
import Viewer from '../components/creator/Viewer'
import Ingredientes from '../components/creator/Ingredientes'

const FILTROS = [
  { key: 'all', Icon: LayoutGrid, label: 'Tudo' },
  { key: 'image', Icon: ImageIcon, label: 'Imagens' },
  { key: 'video', Icon: Film, label: 'Vídeos' },
  { key: 'upload', Icon: Upload, label: 'Uploads' },
  { key: 'ingredients', Icon: Puzzle, label: 'Ingredientes', cor: 'text-amber-400' },
  { key: 'favorites', Icon: Star, label: 'Favoritos' },
  { key: 'failed', Icon: TriangleAlert, label: 'Erros' },
  { key: 'prompts', Icon: ClipboardList, label: 'Copiar prompts' },
  { key: 'trash', Icon: Trash2, label: 'Lixeira' },
]
const PRIORIDADE = { '-1': 'Baixa', 0: 'Normal', 1: 'Alta' }
const ver = () => { try { return { tamanho: 260, volume: 0, detalhes: true, ordem: 'seq', ...JSON.parse(localStorage.getItem('noctis_grid') || '{}') } } catch { return { tamanho: 260, volume: 0, detalhes: true, ordem: 'seq' } } }

function numSeq(s) { const [a, b] = String(s).split('.'); return [Number(a) || 0, Number(b) || 0] }

export default function Creator({ go, param }) {
  const id = Number(param)
  const toast = useToast()
  const [proj, setProj] = useState(null)
  const [filtro, setFiltro] = useState('all')
  const [status, setStatus] = useState(null) // done | processing | pending | failed
  const [busca, setBusca] = useState('')
  const [vis, setVis] = useState(ver)
  const [engrenagem, setEngrenagem] = useState(false)
  const [sel, setSel] = useState(new Set())
  const [menu, setMenu] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [ingredientes, setIngredientes] = useState(false)
  const [prompts, setPrompts] = useState(false)
  const [abaPrompts, setAbaPrompts] = useState('all')
  const [editar, setEditar] = useState(null)
  const [animar, setAnimar] = useState(null)
  const [reescrever, setReescrever] = useState(false)
  const [reescritos, setReescritos] = useState('')
  const [refsGrid, setRefsGrid] = useState([])
  const [renomear, setRenomear] = useState(false)
  const recarregarTimer = useRef(null)

  const carregar = useCallback(() => call('creator:project', id).then(setProj).catch((e) => toast(e.message, 'error')), [id, toast])
  useEffect(() => { carregar() }, [carregar])
  useEvent('creator:update', () => { clearTimeout(recarregarTimer.current); recarregarTimer.current = setTimeout(carregar, 300) })
  useEffect(() => { try { localStorage.setItem('noctis_grid', JSON.stringify(vis)) } catch { /* sem storage */ } }, [vis])
  useEffect(() => {
    const k = (e) => {
      if (e.target.matches('input, textarea, select')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set(visiveis.map((j) => j.id))) }
      if (e.key === 'Escape') { setSel(new Set()); setMenu(null) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  useEffect(() => {
    if (!menu) return undefined
    const fechar = () => setMenu(null)
    window.addEventListener('click', fechar)
    return () => window.removeEventListener('click', fechar)
  }, [menu])

  const jobs = proj?.jobs || []
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let l = jobs.filter((j) => (filtro === 'trash' ? j.status === 'deleted' : j.status !== 'deleted'))
    if (filtro === 'image') l = l.filter((j) => j.kind === 'image')
    if (filtro === 'video') l = l.filter((j) => j.kind === 'video')
    if (filtro === 'upload') l = l.filter((j) => j.kind === 'upload')
    if (filtro === 'favorites') l = l.filter((j) => j.favorite)
    if (filtro === 'failed') l = l.filter((j) => j.status === 'failed')
    if (filtro !== 'upload' && filtro !== 'trash' && !vis.referencias) l = l.filter((j) => j.kind !== 'upload')
    if (status) l = l.filter((j) => (status === 'processing' ? j.status === 'processing' || j.status === 'downloading' : j.status === status))
    if (q) l = l.filter((j) => `${j.prompt} ${j.original_prompt}`.toLowerCase().includes(q))
    const ordem = vis.ordem
    return [...l].sort((a, b) => {
      if (ordem === 'new') return b.created_at - a.created_at
      if (ordem === 'old') return a.created_at - b.created_at
      const [x1, x2] = numSeq(a.seq); const [y1, y2] = numSeq(b.seq)
      return x1 - y1 || x2 - y2 || (a.kind === 'video') - (b.kind === 'video') || a.created_at - b.created_at
    })
  }, [jobs, filtro, status, busca, vis])

  if (!proj) return null
  const c = proj.counts
  const contagem = { failed: c.failed, trash: c.deleted, favorites: c.favorites, upload: c.uploads, image: c.images, video: c.videos }

  const atualizarProjeto = async (campos) => { await call('creator:updateProject', id, campos); carregar() }
  async function acao(job, tipo) {
    try {
      if (tipo === 'edit') return setEditar({ job, prompt: job.prompt })
      if (tipo === 'animate') return setAnimar({ job, prompt: '', quality: 'relaxed', duration: 8 })
      if (tipo === 'reveal') return call('sys:reveal', job.files[0])
      if (tipo === 'reuse') { await navigator.clipboard.writeText(job.original_prompt || job.prompt); toast('Prompt copiado — cole no composer.', 'success'); return }
      if (tipo === 'copy') { await navigator.clipboard.writeText(job.original_prompt || job.prompt); toast('Prompt copiado.', 'success'); return }
      if (tipo === 'copyError') { await navigator.clipboard.writeText(job.error || ''); toast('Erro copiado.', 'success'); return }
      if (tipo === 'ingredient') { setIngredientes(true); toast('Arraste o card para um pacote, ou use "Adicionar imagens".'); return }
      await call('creator:jobAction', job.id, tipo)
      if (tipo === 'delete') setViewer(null)
      carregar()
    } catch (e) { toast(e.message, 'error') }
  }
  async function emLote(tipo) {
    await call('creator:bulk', [...sel], tipo)
    toast(`${sel.size} item(ns) atualizados.`, 'success')
    setSel(new Set()); carregar()
  }
  const abrirFiltro = (k) => {
    if (k === 'ingredients') return setIngredientes(true)
    if (k === 'prompts') return setPrompts(true)
    setFiltro(k); setStatus(null); setSel(new Set())
  }
  const listaPrompts = [...new Set(jobs.filter((j) => j.status !== 'deleted' && j.kind !== 'upload' && (abaPrompts === 'all' || j.kind === abaPrompts)).sort((a, b) => numSeq(a.seq)[0] - numSeq(b.seq)[0]).map((j) => `${j.kind === 'video' ? '[v]' : '[i]'} [${j.params.aspect || '16:9'}] ${j.original_prompt || j.prompt}`))]
  const falhos = jobs.filter((j) => j.status === 'failed')

  return (
    <div className="flex h-full">
      {/* Trilho de filtros */}
      <div className="flex w-[54px] shrink-0 flex-col items-center gap-1.5 border-r border-slate-800/70 py-3">
        {FILTROS.map((f) => {
          const n = contagem[f.key]
          const ativo = filtro === f.key
          if (f.key === 'favorites' && !n) return null
          return (
            <button key={f.key} title={f.label} onClick={() => abrirFiltro(f.key)} className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${ativo ? 'bg-cyan-500/15 text-cyan-300' : `${f.cor || 'text-slate-400'} hover:bg-slate-900 hover:text-slate-100`}`}>
              <f.Icon size={18} />
              {n > 0 && (f.key === 'failed' || f.key === 'trash' || f.key === 'image' || f.key === 'video') && (
                <span className={`absolute -right-1 -top-1 rounded-full px-1 text-[9px] font-bold ${f.key === 'failed' ? 'bg-red-500 text-white' : f.key === 'trash' ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>{n > 99 ? '99+' : n}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-800/70 px-5 py-2.5">
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-slate-100" onClick={() => go('projetos')} title="Voltar"><ArrowLeft size={18} /></button>
          {renomear
            ? <input autoFocus defaultValue={proj.name} className={`${inputCls} w-56 py-1`} onBlur={(e) => { atualizarProjeto({ name: e.target.value.trim() || proj.name }); setRenomear(false) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            : <button className="text-[15px] font-bold text-slate-100 hover:text-cyan-300" onClick={() => setRenomear(true)}>{proj.name}</button>}
          <select value={proj.priority} onChange={(e) => atualizarProjeto({ priority: Number(e.target.value) })} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-slate-300" title="Prioridade na fila">
            {Object.entries(PRIORIDADE).map(([v, l]) => <option key={v} value={v}>● {l}</option>)}
          </select>
          <button onClick={() => atualizarProjeto({ paused: !proj.paused })} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${proj.paused ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'}`}>
            {proj.paused ? <Play size={11} /> : <Pause size={11} />}{proj.paused ? 'Pausado' : 'Processando'}
          </button>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-slate-100" title="Abrir a pasta do projeto" onClick={() => call('sys:openPath', proj.folder)}><Folder size={16} /></button>
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <button onClick={() => setStatus(status === 'done' ? null : 'done')} className={`rounded-md border px-2 py-0.5 ${status === 'done' ? 'border-emerald-500/60 text-emerald-300' : 'border-slate-800 text-slate-300'}`} title="Prontos">{c.done} / {c.total}</button>
            {c.processing > 0 && <button onClick={() => setStatus(status === 'processing' ? null : 'processing')} className="rounded-md border border-cyan-500/30 px-2 py-0.5 text-cyan-300" title="Gerando">{c.processing} gerando</button>}
            {c.pending > 0 && <button onClick={() => setStatus(status === 'pending' ? null : 'pending')} className="rounded-md border border-slate-800 px-2 py-0.5 text-slate-400" title="Na fila">{c.pending} na fila</button>}
            {c.failed > 0 && <button onClick={() => setStatus(status === 'failed' ? null : 'failed')} className="rounded-md border border-red-500/30 px-2 py-0.5 text-red-300" title="Com erro">{c.failed} erro(s)</button>}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input className={`${inputCls} py-1.5 pl-9`} placeholder="Buscar prompts…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="relative">
            <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-slate-100" onClick={() => setEngrenagem(!engrenagem)} title="Ajustes de visualização"><Settings2 size={17} /></button>
            {engrenagem && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm shadow-2xl">
                <div><p className="mb-1 text-xs text-slate-500">Tamanho do grid</p><input type="range" min="160" max="460" step="20" value={vis.tamanho} onChange={(e) => setVis({ ...vis, tamanho: Number(e.target.value) })} className="w-full accent-cyan-500" /></div>
                <div><p className="mb-1 text-xs text-slate-500">Volume dos vídeos</p><input type="range" min="0" max="1" step="0.05" value={vis.volume} onChange={(e) => setVis({ ...vis, volume: Number(e.target.value) })} className="w-full accent-cyan-500" /></div>
                <label className="flex items-center justify-between text-slate-300">Mostrar detalhes do bloco <Toggle checked={vis.detalhes} onChange={(v) => setVis({ ...vis, detalhes: v })} /></label>
                <label className="flex items-center justify-between text-slate-300">Mostrar uploads no grid <Toggle checked={!!vis.referencias} onChange={(v) => setVis({ ...vis, referencias: v })} /></label>
                <div><p className="mb-1 text-xs text-slate-500">Ordenação</p><Segmented size="sm" value={vis.ordem} onChange={(v) => setVis({ ...vis, ordem: v })} options={[{ value: 'new', label: 'Recentes' }, { value: 'old', label: 'Antigos' }, { value: 'seq', label: 'Sequência' }]} /></div>
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Só deste projeto</p>
                  <label className="flex items-center justify-between text-slate-300">Apagar imagem ao animar <Toggle checked={!!proj.settings.deleteSourceOnAnimate} onChange={(v) => atualizarProjeto({ settings: { deleteSourceOnAnimate: v } })} /></label>
                  <label className="flex items-center justify-between text-slate-300">Reescrita automática (Gemini) <Toggle checked={proj.settings.rewriteEnabled !== false} onChange={(v) => atualizarProjeto({ settings: { rewriteEnabled: v } })} /></label>
                  <p className="truncate text-[11px] text-slate-600" title={proj.folder}>Pasta: {proj.folder}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {filtro === 'failed' && falhos.length > 0 && (
          <div className="mx-5 mt-3 flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2.5 text-sm">
            <TriangleAlert size={16} className="text-red-400" /><span className="flex-1 text-red-200">{falhos.length} pedido(s) com erro.</span>
            <button className={btnGhost} onClick={async () => { const n = await call('creator:retryFailed', id); toast(`${n} de volta na fila.`, 'success'); carregar() }}><RotateCcw size={14} /> Tentar todos de novo</button>
            <button className={btnPrimary} onClick={() => { setReescritos(''); setReescrever(true) }}><Pencil size={14} /> Reescrever todos</button>
          </div>
        )}
        {filtro === 'trash' && c.deleted > 0 && (
          <div className="mx-5 mt-3 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm">
            <span className="flex-1 text-slate-300">{c.deleted} item(ns) na lixeira</span>
            <button className={btnGhost} onClick={async () => { await call('creator:restoreAll', id); carregar() }}><Undo2 size={14} /> Restaurar tudo</button>
            <button className={btnDanger} onClick={async () => { await call('creator:emptyTrash', id); toast('Lixeira esvaziada (arquivos foram para a Lixeira do computador).', 'success'); carregar() }}><Trash2 size={14} /> Esvaziar lixeira</button>
          </div>
        )}
        {sel.size > 0 && (
          <div className="mx-5 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-2 text-sm">
            <span className="mr-2 text-cyan-200">{sel.size} selecionado(s)</span>
            <button className={btnGhost} onClick={() => emLote('favorite')}><Star size={14} /> Favoritar</button>
            <button className={btnGhost} onClick={async () => { await navigator.clipboard.writeText(jobs.filter((j) => sel.has(j.id)).map((j) => j.original_prompt || j.prompt).join('\n')); toast('Prompts copiados.', 'success') }}><Copy size={14} /> Copiar prompts</button>
            <button className={btnGhost} onClick={() => emLote('retry')}><RotateCcw size={14} /> Tentar de novo</button>
            {filtro === 'trash' ? <button className={btnGhost} onClick={() => emLote('restore')}><Undo2 size={14} /> Restaurar</button> : <button className={btnDanger} onClick={() => emLote('delete')}><Trash2 size={14} /> Excluir</button>}
            <button className="ml-auto text-xs text-slate-400" onClick={() => setSel(new Set())}>Limpar seleção</button>
          </div>
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-56 pt-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            const caminhos = [...e.dataTransfer.files].map((f) => window.noctis.pathOf(f)).filter(Boolean)
            if (caminhos.length) { e.preventDefault(); const n = await call('creator:upload', id, caminhos); toast(`${n} imagem(ns) enviada(s) para Uploads.`, 'success'); carregar() }
          }}
        >
          {visiveis.length === 0 ? (
            <EmptyState icon={filtro === 'trash' ? Trash2 : ImageIcon} title={filtro === 'trash' ? 'Lixeira vazia' : 'Comece a criar ou adicione imagens'} description={filtro === 'all' ? 'Escreva no composer abaixo: cada linha vira uma imagem ou um vídeo. Arraste imagens do computador para cá para usá-las como referência.' : undefined} />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${vis.tamanho}px, 1fr))` }}>
              {visiveis.map((j) => (
                <JobCard key={j.id} job={j} selecionado={sel.has(j.id)} mostrarDetalhes={vis.detalhes} volume={vis.volume}
                  onOpen={(job) => setViewer(job.id)}
                  onSelect={(job) => setSel((s) => { const n = new Set(s); n.has(job.id) ? n.delete(job.id) : n.add(job.id); return n })}
                  onMenu={(e, job) => { e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, job }) }}
                  onAction={acao}
                  onDragStart={(e, job) => { e.dataTransfer.setData('noctis/job', job.id); e.dataTransfer.setData('noctis/file', job.files[0] || '') }}
                />
              ))}
            </div>
          )}
        </div>

        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const f = e.dataTransfer.getData('noctis/file'); if (f) { e.preventDefault(); setRefsGrid([f]) } }}>
          <Composer projectId={id} characters={proj.characters} onEnviado={carregar} refsExternas={refsGrid} limparRefs={() => setRefsGrid([])} />
        </div>
      </div>

      {menu && (
        <div className="fixed z-[75] w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 py-1 text-sm shadow-2xl" style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 340) }} onClick={(e) => e.stopPropagation()}>
          {(menu.job.status === 'deleted'
            ? [[Undo2, 'Restaurar', 'restore'], [Trash2, 'Excluir de vez', 'purge']]
            : menu.job.status === 'failed'
              ? [[RotateCcw, 'Tentar de novo', 'retry'], [Pencil, 'Editar prompt', 'edit'], [Copy, 'Copiar erro', 'copyError'], [Trash2, 'Excluir', 'delete']]
              : [
                [Star, menu.job.favorite ? 'Desfavoritar' : 'Favoritar', 'favorite'],
                [Pencil, 'Editar prompt', 'edit'],
                ...((menu.job.kind === 'image' || menu.job.kind === 'upload') && menu.job.status === 'done' ? [[Wand2, 'Animar', 'animate']] : []),
                [Puzzle, 'Ingrediente', 'ingredient'],
                [Copy, 'Copiar prompt', 'copy'],
                [Recycle, 'Regenerar', 'regenerate'],
                ...(menu.job.files[0] ? [[FolderOpen, 'Mostrar na pasta', 'reveal']] : []),
                [Trash2, 'Excluir', 'delete'],
              ]).map(([Icon, rot, a]) => (
            <button key={a} className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-800 ${a === 'delete' || a === 'purge' ? 'text-red-400' : 'text-slate-200'}`} onClick={() => { setMenu(null); acao(menu.job, a) }}>
              <Icon size={14} /> {rot}
            </button>
          ))}
        </div>
      )}

      {viewer && <Viewer jobs={visiveis.filter((j) => j.files.length)} inicial={viewer} volume={vis.volume} onClose={() => setViewer(null)} onAction={(j, a) => acao(j, a)} />}
      {ingredientes && <Ingredientes projectId={id} importados={proj.packs} onImportado={carregar} onClose={() => setIngredientes(false)} />}

      <Modal open={prompts} onClose={() => setPrompts(false)} title="Prompts" width="max-w-3xl"
        footer={<button className={btnPrimary} onClick={async () => { await navigator.clipboard.writeText(listaPrompts.join('\n')); toast(`${listaPrompts.length} prompt(s) copiados.`, 'success') }}><Copy size={15} /> Copiar tudo</button>}>
        <div className="mb-3"><Segmented size="sm" value={abaPrompts} onChange={setAbaPrompts} options={[{ value: 'all', label: `Tudo ${c.images + c.videos}` }, { value: 'image', label: `Imagem ${c.images}` }, { value: 'video', label: `Vídeo ${c.videos}` }]} /></div>
        <textarea readOnly rows={14} value={listaPrompts.join('\n\n')} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-[13px] leading-relaxed text-slate-300" />
      </Modal>

      <Modal open={!!editar} onClose={() => setEditar(null)} title="Editar prompt" width="max-w-2xl"
        footer={<><button className={btnGhost} onClick={() => setEditar(null)}>Cancelar</button><button className={btnPrimary} onClick={async () => { try { await call('creator:jobAction', editar.job.id, 'editPrompt', { prompt: editar.prompt }); setEditar(null); toast('Prompt trocado — voltou pra fila.', 'success'); carregar() } catch (e) { toast(e.message, 'error') } }}>Salvar e gerar de novo</button></>}>
        {editar?.job.error && <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-300">{editar.job.error}</p>}
        <textarea autoFocus rows={8} value={editar?.prompt || ''} onChange={(e) => setEditar({ ...editar, prompt: e.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-[13.5px] text-slate-100 focus:border-cyan-500 focus:outline-none" />
        <p className="mt-2 text-xs text-slate-500">O pedido mantém o número #{editar?.job.seq} e volta para a fila.</p>
      </Modal>

      <Modal open={!!animar} onClose={() => setAnimar(null)} title="Animar imagem" width="max-w-xl"
        footer={<><button className={btnGhost} onClick={() => setAnimar(null)}>Cancelar</button><button className={btnPrimary} onClick={async () => { await call('creator:jobAction', animar.job.id, 'animate', { prompt: animar.prompt, quality: animar.quality, duration: animar.duration }); setAnimar(null); toast('Animação na fila.', 'success'); carregar() }}><Wand2 size={15} /> Animar</button></>}>
        <p className="mb-2 text-xs text-slate-500">Prompt da animação (vazio = usa o prompt da imagem)</p>
        <textarea rows={4} value={animar?.prompt || ''} onChange={(e) => setAnimar({ ...animar, prompt: e.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none" />
        <div className="mt-3 flex gap-3">
          <select value={animar?.quality} onChange={(e) => setAnimar({ ...animar, quality: e.target.value })} className={inputCls}>
            <option value="relaxed">Veo 3.1 - Lite [Lower Priority]</option><option value="lite">Veo 3.1 - Lite</option><option value="fast">Veo 3.1 - Fast</option><option value="quality">Veo 3.1 - Quality</option><option value="omni">Veo 3.1 - Omni</option>
          </select>
          <select value={animar?.duration} onChange={(e) => setAnimar({ ...animar, duration: Number(e.target.value) })} className={`${inputCls} w-28`}>
            {[4, 6, 8, 10].map((d) => <option key={d} value={d}>{d}s</option>)}
          </select>
        </div>
      </Modal>

      <Modal open={reescrever} onClose={() => setReescrever(false)} title="Reescrever todos os prompts com erro" width="max-w-5xl"
        footer={<><button className={btnGhost} onClick={() => setReescrever(false)}>Cancelar</button><button className={btnPrimary} onClick={async () => { try { const n = await call('creator:rewriteFailed', id, reescritos.split('\n')); setReescrever(false); toast(`${n} prompt(s) trocados e de volta na fila.`, 'success'); carregar() } catch (e) { toast(e.message, 'error') } }}><Sparkles size={15} /> Trocar e gerar</button></>}>
        <p className="mb-3 text-sm text-slate-400">Copie os prompts da esquerda, corrija na sua IA (ou peça no chat) e cole na direita, <b>na mesma ordem, um por linha</b>.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 flex items-center justify-between"><p className="text-xs text-slate-500">Com erro ({falhos.length})</p><button className="text-xs text-cyan-400" onClick={() => navigator.clipboard.writeText(falhos.map((j) => j.prompt.replace(/\n/g, ' ')).join('\n'))}>Copiar tudo</button></div>
            <textarea readOnly rows={14} value={falhos.map((j) => j.prompt.replace(/\n/g, ' ')).join('\n')} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[12px] text-slate-400" />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Corrigidos ({reescritos.split('\n').filter((l) => l.trim()).length})</p>
            <textarea rows={14} value={reescritos} onChange={(e) => setReescritos(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[12px] text-slate-100 focus:border-cyan-500 focus:outline-none" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
