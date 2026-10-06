import { useEffect, useRef, useState } from 'react'
import { Plus, CircleHelp, ArrowRight, Image as ImageIcon, Film, Frame, Puzzle, Sparkles, ChevronDown, X, Wand2, ArrowLeftRight, Flame } from 'lucide-react'
import { call, useToast } from '../../lib/api'
import { IMAGE_MODELS, VIDEO_MODELS, mediaUrl } from '../../lib/media'
import { btnGhost, btnPrimary, Modal, Toggle } from '../ui'

const PADRAO = {
  provider: 'flow', kind: 'image', aspect: '16:9', outputs: 1, model: 'nano_pro', quality: 'relaxed', duration: 8,
  videoMode: 'frames', upscaleImage: '', upscaleVideo: '', autoAnimate: false, animatePrompts: [],
}
const lerPadrao = () => { try { return { ...PADRAO, ...JSON.parse(localStorage.getItem('noctis_composer') || '{}'), animatePrompts: [] } } catch { return PADRAO } }

function Chip({ on, onClick, children, className = '' }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${on ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'} ${className}`}>{children}</button>
  )
}

const TAGS = [
  ['Motor', '[flow]'], ['Tipo', '[i] imagem · [v] vídeo · [iv] imagem + animação com o mesmo prompt'],
  ['Par', '"[i] prompt da imagem [v] prompt da animação" na mesma linha'],
  ['Formato', '[16:9] [9:16] [1:1] [4:3] [3:4]'], ['Imagem', '[nano_pro] [nano_2] [nano_lite]'],
  ['Vídeo', '[fast] [quality] [lite] [relaxed] [omni]'], ['Upscale', 'imagem [2k] [4k] · vídeo [1080p] [4k]'],
  ['Duração', '[4s] [6s] [8s] · [10s] só no Omni'], ['Voz', '[voice:charon] (vídeo por Elementos)'],
  ['Personagem', '[Nome] junto do texto: "o [João] acena" — o pacote precisa estar importado no projeto'],
]

export default function Composer({ projectId, characters = [], onEnviado, refsExternas, limparRefs }) {
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [cfg, setCfg] = useState(lerPadrao)
  const [aberto, setAberto] = useState(false)
  const [guia, setGuia] = useState(false)
  const [animModal, setAnimModal] = useState(false)
  const [animTexto, setAnimTexto] = useState('')
  const [refs, setRefs] = useState([])
  const [ini, setIni] = useState(null)
  const [fim, setFim] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [recolhido, setRecolhido] = useState(false)
  const pop = useRef(null)

  useEffect(() => { try { localStorage.setItem('noctis_composer', JSON.stringify({ ...cfg, animatePrompts: [] })) } catch { /* sem storage */ } }, [cfg])
  useEffect(() => {
    if (!refsExternas || !refsExternas.length) return
    if (cfg.kind === 'video' && cfg.videoMode === 'frames') { if (!ini) setIni(refsExternas[0]); else setFim(refsExternas[0]) } else setRefs((r) => [...new Set([...r, ...refsExternas])])
    limparRefs && limparRefs()
  }, [refsExternas]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => { if (pop.current && !pop.current.contains(e.target)) setAberto(false) }
    window.addEventListener('mousedown', fora)
    return () => window.removeEventListener('mousedown', fora)
  }, [aberto])

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }))
  const video = cfg.kind === 'video'
  const modelos = video ? VIDEO_MODELS : IMAGE_MODELS
  const modeloAtual = video ? cfg.quality : cfg.model
  const rotuloModelo = modelos.find((m) => m.value === modeloAtual)?.label || modeloAtual
  const nPrompts = texto.split('\n').map((l) => l.trim()).filter(Boolean).length

  async function anexar() {
    const arqs = await call('sys:pickFile', { title: 'Imagens de referência', multi: true, filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
    if (!arqs) return
    if (video && cfg.videoMode === 'frames') { setIni(arqs[0]); if (arqs[1]) setFim(arqs[1]) } else setRefs((r) => [...new Set([...r, ...arqs])])
  }

  function preparar() {
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!linhas.length) return
    const total = linhas.length * (cfg.outputs || 1)
    if (linhas.length > 1 || cfg.outputs > 1) setConfirmar({ linhas: linhas.length, total })
    else enviar()
  }

  async function enviar() {
    setConfirmar(null)
    try {
      const padrao = { ...cfg, refs: video && cfg.videoMode === 'frames' ? [] : refs, startImage: video && cfg.videoMode === 'frames' ? ini : null, endImage: video && cfg.videoMode === 'frames' ? fim : null }
      const r = await call('creator:submit', { projectId, texto, padrao })
      toast(`${r.linhas} prompt(s) na fila (${r.jobs} job(s)).`, 'success')
      setTexto(''); setRefs([]); setIni(null); setFim(null)
      set({ animatePrompts: [] })
      onEnviado && onEnviado()
    } catch (e) { toast(e.message, 'error') }
  }

  if (recolhido) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <button onClick={() => setRecolhido(false)} className="pointer-events-auto rounded-full border border-slate-700 bg-slate-900/95 px-5 py-2 text-sm text-slate-300 shadow-xl">Mostrar composer</button>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center px-6">
      <button onClick={() => setRecolhido(true)} className="pointer-events-auto mb-1.5 rounded-full border border-slate-700 bg-slate-900/90 p-1 text-slate-400 hover:text-slate-200" title="Recolher"><ChevronDown size={14} /></button>
      <div className="pointer-events-auto relative w-full max-w-[760px] rounded-2xl border border-slate-700/80 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur">
        {nPrompts > 1 && (
          <div className="pointer-events-none absolute -top-3 right-3 z-10">
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-[#1a150c] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-300 shadow-lg" title={`${nPrompts} prompts na fila (uma linha = um pedido)${cfg.outputs > 1 ? ` · ×${cfg.outputs} saídas = ~${nPrompts * cfg.outputs} gerações` : ''}`}>
              <Flame size={12} className="text-amber-400" /> Multi-prompt ({nPrompts})
            </span>
          </div>
        )}
        {(video && cfg.videoMode === 'frames') ? (
          <div className="flex items-center gap-2 px-4 pt-3">
            {[['Ini', ini, setIni], ['Fim', fim, setFim]].map(([rot, val, setter], i) => (
              <div key={rot} className="flex items-center gap-2">
                {i === 1 && <ArrowLeftRight size={13} className="text-slate-600" />}
                <button onClick={async () => { const a = await call('sys:pickFile', { title: `Imagem de ${rot === 'Ini' ? 'início' : 'fim'}`, filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] }); if (a) setter(a) }}
                  className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-600 text-[11px] text-slate-500 hover:border-cyan-500/60">
                  {val ? <img src={mediaUrl(val)} className="h-full w-full object-cover" alt="" /> : rot}
                  {val && <span onClick={(e) => { e.stopPropagation(); setter(null) }} className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5"><X size={10} /></span>}
                </button>
              </div>
            ))}
            <span className="text-[11px] text-slate-500">Sem imagens = texto para vídeo. Imagens prontas do grid também podem ser arrastadas.</span>
          </div>
        ) : refs.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {refs.map((r) => (
              <div key={r} className="relative h-14 w-14 overflow-hidden rounded-xl border border-cyan-500/40">
                <img src={mediaUrl(r)} className="h-full w-full object-cover" alt="" />
                <button onClick={() => setRefs((l) => l.filter((x) => x !== r))} className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5"><X size={10} /></button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preparar() } }}
          rows={Math.min(8, Math.max(2, texto.split('\n').length))}
          placeholder="Descreva o que deseja criar… (uma linha = um pedido · Shift+Enter quebra linha)"
          className="block w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[14.5px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <div className="flex items-center gap-1.5 px-3 pb-3">
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200" onClick={anexar} title="Anexar referências"><Plus size={17} /></button>
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200" onClick={() => setGuia(true)} title="Guia de tags"><CircleHelp size={17} /></button>
          {cfg.kind === 'image' && cfg.autoAnimate && (
            <button className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20" onClick={() => { setAnimTexto(cfg.animatePrompts.join('\n')); setAnimModal(true) }}>
              <Wand2 size={13} /> Auto-animar{cfg.animatePrompts.length ? ` · ${cfg.animatePrompts.length} prompt(s)` : ''}
            </button>
          )}
          <div className="flex-1" />
          <div className="relative" ref={pop}>
            <button onClick={() => setAberto(!aberto)} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] font-semibold text-slate-200 hover:border-slate-600">
              {video ? <Film size={14} /> : <ImageIcon size={14} />} {rotuloModelo}
              <span className="text-[11px] font-medium text-slate-500">{cfg.aspect} x{cfg.outputs}{video ? ` · ${cfg.duration}s` : ''}</span>
            </button>
            {aberto && (
              <div className="absolute bottom-full right-0 mb-2 w-[340px] space-y-2.5 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/60">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900 p-1">
                  <button onClick={() => set({ kind: 'image' })} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold ${!video ? 'bg-slate-100 text-slate-950' : 'text-slate-400'}`}><ImageIcon size={15} /> Imagem</button>
                  <button onClick={() => set({ kind: 'video', aspect: ['16:9', '9:16'].includes(cfg.aspect) ? cfg.aspect : '16:9' })} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold ${video ? 'bg-slate-100 text-slate-950' : 'text-slate-400'}`}><Film size={15} /> Vídeo</button>
                </div>
                {video && (
                  <div className="grid grid-cols-2 gap-1">
                    <Chip on={cfg.videoMode === 'frames'} onClick={() => set({ videoMode: 'frames' })}><Frame size={13} className="mr-1 inline" /> Frames</Chip>
                    <Chip on={cfg.videoMode === 'elements'} onClick={() => set({ videoMode: 'elements' })}><Puzzle size={13} className="mr-1 inline" /> Elementos</Chip>
                  </div>
                )}
                <div className={`grid gap-1 ${video ? 'grid-cols-2' : 'grid-cols-5'}`}>
                  {(video ? ['16:9', '9:16'] : ['16:9', '4:3', '1:1', '3:4', '9:16']).map((a) => <Chip key={a} on={cfg.aspect === a} onClick={() => set({ aspect: a })}>{a}</Chip>)}
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => <Chip key={n} on={cfg.outputs === n} onClick={() => set({ outputs: n })}>x{n}</Chip>)}
                </div>
                <select value={modeloAtual} onChange={(e) => set(video ? { quality: e.target.value } : { model: e.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                  {modelos.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {video && (
                  <div className="grid grid-cols-4 gap-1">
                    {[4, 6, 8, 10].map((d) => <Chip key={d} on={cfg.duration === d} onClick={() => set({ duration: d })} className={d === 10 && cfg.quality !== 'omni' ? 'opacity-40' : ''}>{d}S</Chip>)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1">
                  {(video ? ['1080p', '4k'] : ['2k', '4k']).map((u) => {
                    const k = video ? 'upscaleVideo' : 'upscaleImage'
                    return <Chip key={u} on={cfg[k] === u} onClick={() => set({ [k]: cfg[k] === u ? '' : u })}><Sparkles size={12} className="mr-1 inline" />{u.toUpperCase()}</Chip>
                  })}
                </div>
                {!video && (
                  <label className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-300">
                    Auto-animar (cada imagem pronta vira vídeo)
                    <Toggle checked={cfg.autoAnimate} onChange={(v) => set({ autoAnimate: v })} />
                  </label>
                )}
                <p className="px-1 text-[11px] leading-relaxed text-slate-500">Cada saída gasta crédito. Tags no começo da linha mudam só aquele pedido.</p>
              </div>
            )}
          </div>
          <button onClick={preparar} disabled={!texto.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-600" title="Enviar (Enter)">
            <ArrowRight size={17} />
          </button>
        </div>
      </div>

      <Modal open={guia} onClose={() => setGuia(false)} title="Guia de tags" width="max-w-2xl">
        <p className="mb-3 text-sm text-slate-400">Tags vão no <b className="text-slate-200">começo da linha</b>, várias juntas, em qualquer ordem, sem espaço dentro dos colchetes. Linha sem tag usa a configuração do composer.</p>
        <div className="space-y-1.5">
          {TAGS.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3 rounded-lg bg-slate-950/60 px-3 py-2 text-sm"><span className="font-semibold text-cyan-300">{k}</span><span className="font-mono text-[12.5px] text-slate-300">{v}</span></div>)}
        </div>
        {characters.length > 0 && <p className="mt-3 text-xs text-slate-500">Personagens deste projeto: {characters.map((c) => `[${c}]`).join(' ')}</p>}
      </Modal>

      <Modal open={animModal} onClose={() => setAnimModal(false)} title="Prompts de animação" width="max-w-2xl"
        footer={<><button className={btnGhost} onClick={() => setAnimModal(false)}>Cancelar</button><button className={btnPrimary} onClick={() => { set({ animatePrompts: animTexto.split('\n') }); setAnimModal(false) }}>Usar</button></>}>
        <p className="mb-3 text-sm text-slate-400">Um prompt de animação por linha, na mesma ordem das imagens. Linha vazia = anima com o próprio prompt da imagem.</p>
        <textarea rows={10} value={animTexto} onChange={(e) => setAnimTexto(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[12.5px] text-slate-200 focus:border-cyan-500 focus:outline-none" />
      </Modal>

      <Modal open={!!confirmar} onClose={() => setConfirmar(null)} title="Conferir antes de enviar" width="max-w-md"
        footer={<><button className={btnGhost} onClick={() => setConfirmar(null)}>Voltar</button><button className={btnPrimary} onClick={enviar}>Enviar {confirmar?.linhas}</button></>}>
        <p className="text-sm leading-relaxed text-slate-300">
          {confirmar?.linhas} prompt(s) × {cfg.outputs} saída(s) = <b className="text-cyan-300">~{confirmar?.total} geração(ões)</b>{cfg.kind === 'image' && cfg.autoAnimate ? `, mais ${confirmar?.linhas} animação(ões)` : ''}.
        </p>
        <p className="mt-2 text-xs text-slate-500">Cada linha vira um pedido separado. Tags na linha valem só para ela.</p>
      </Modal>
    </div>
  )
}
