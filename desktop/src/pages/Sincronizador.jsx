import { useEffect, useState } from 'react'
import { Film, History, Sparkles, FileText, Folder, Music, X, Info, Gauge, Shuffle, Play, FolderOpen, Square, CircleCheck, TriangleAlert, Trash2 } from 'lucide-react'
import { call, useEvent, useSettings, useToast } from '../lib/api'
import { btnGhost, btnPrimary, Card, Modal, Toggle } from '../components/ui'

const MODOS = [
  { v: 'start', t: 'Cortar do início', s: 'mantém o final' },
  { v: 'center', t: 'Centralizado', s: 'mantém o meio' },
  { v: 'end', t: 'Cortar do fim', s: 'mantém o início' },
]
const ACAO = {
  manter: ['Mantém', 'text-slate-300'], cortar: ['Corta', 'text-sky-300'], acelerar: ['Acelera', 'text-violet-300'],
  desacelerar: ['Desacelera', 'text-amber-300'], imagem: ['Imagem → vídeo', 'text-emerald-300'], erro: ['Erro', 'text-red-400'],
}
const t2 = (s) => { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}` }
const nome = (p) => (p ? p.split(/[\\/]/).pop() : '')

function Escolha({ Icon, titulo, opcional, valor, dica, onTrocar, onLimpar }) {
  const [ajuda, setAjuda] = useState(false)
  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400"><Icon size={14} /></span>
        <p className="flex-1 truncate text-[13px] font-semibold text-slate-200">{titulo}{opcional && <span className="font-normal text-slate-500"> (opcional)</span>}</p>
        {dica && <button onMouseEnter={() => setAjuda(true)} onMouseLeave={() => setAjuda(false)} className="text-red-400/80"><Info size={14} /></button>}
        {opcional && valor && <button onClick={onLimpar} className="text-slate-500 hover:text-slate-200"><X size={14} /></button>}
      </div>
      <p className="mb-2.5 truncate font-mono text-[11.5px] text-slate-400" title={valor}>{valor || 'Nada escolhido'}</p>
      <button className={`${btnGhost} w-full py-1.5 text-xs`} onClick={onTrocar}>{valor ? 'Trocar' : 'Escolher'}</button>
      {ajuda && <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-red-500/40 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300 shadow-2xl">{dica}</div>}
    </div>
  )
}

export default function Sincronizador() {
  const toast = useToast()
  const { settings } = useSettings()
  const [arq, setArq] = useState({ srt: '', principal: '', extra: '', audio: '' })
  const [cfg, setCfg] = useState({ cutMode: 'center', speedUp: true, minTarget: 7.5, slowDown: true, maxTarget: 11, random: false })
  const [prev, setPrev] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [prog, setProg] = useState(null)
  const [fim, setFim] = useState(null)
  const [hist, setHist] = useState(null)

  useEffect(() => {
    const s = settings?.srt
    if (!s) return
    setCfg((c) => ({ ...c, ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'ultimo')) }))
    if (s.ultimo) setArq((a) => ({ ...a, ...s.ultimo }))
  }, [settings]) // eslint-disable-line react-hooks/exhaustive-deps
  useEvent('srt:progress', setProg)

  const pegar = async (k) => {
    const p = k === 'principal' || k === 'extra'
      ? await call('sys:pickFolder', { title: k === 'principal' ? 'Pasta com os arquivos numerados' : 'Pasta extra (ex.: imagens)' })
      : await call('sys:pickFile', { title: k === 'srt' ? 'Arquivo SRT por tempo (VEO)' : 'Áudio da narração', filters: k === 'srt' ? [{ name: 'Legenda', extensions: ['srt'] }] : [{ name: 'Áudio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }] })
    if (p) { setArq((a) => ({ ...a, [k]: p })); setPrev(null) }
  }
  const passo = (k, d, min, max, step) => setCfg((c) => ({ ...c, [k]: Math.min(max, Math.max(min, Math.round((Number(c[k]) + d) / step) * step)) }))

  async function preview() {
    setCarregando(true); setFim(null)
    try { setPrev(await call('srt:preview', { ...arq, cfg })) } catch (e) { toast(e.message, 'error') } finally { setCarregando(false) }
  }
  async function aplicar() {
    setProg({ feitos: 0, total: prev.resumo.total - prev.resumo.erro }); setFim(null)
    try { setFim(await call('srt:apply', { ...arq, cfg })) } catch (e) { toast(e.message, 'error') } finally { setProg(null) }
  }

  const acel = ((8 - cfg.minTarget) / 8) * 100
  const desac = ((cfg.maxTarget - 8) / 8) * 100

  return (
    <div className="mx-auto max-w-[920px] px-8 py-8 pb-24">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sincronizador <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">SRT</span></h1>
          <p className="text-sm text-slate-500">Sincronização inteligente de vídeos e imagens com o SRT da narração</p>
        </div>
        <button className={btnGhost} onClick={async () => setHist(await call('srt:history'))}><History size={15} /> Histórico</button>
      </div>

      <Card className="mb-5 p-5">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400"><Sparkles size={14} /> Como usar</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] text-slate-300">
          {['Selecione o arquivo SRT VEO (por tempo) da narração', 'Selecione a pasta com os vídeos numerados', 'Opcional: adicione uma pasta extra (ex.: imagens)', 'Escolha o modo de corte e os limites de duração', 'Clique em "Gerar prévia" para conferir', 'Clique em "Aplicar sincronização"'].map((t, i) => (
            <p key={i}><span className="mr-2 font-bold text-cyan-400">{i + 1}.</span>{t}</p>
          ))}
        </div>
        <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
          <p>Arquivos devem começar com o número do bloco. Ex.: 1_video.mp4, 2_imagem.jpg, 3_video.mp4…</p>
          <p>Vídeos: MP4, MOV, AVI, MKV, WEBM · Imagens: JPG, JFIF, PNG, WEBP (viram vídeo com áudio silencioso)</p>
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Arquivos</p>
          <label className="flex items-center gap-2 text-xs text-slate-400" title="Blocos sem arquivo com o número deles recebem uma mídia sobrando, sorteada">
            <Shuffle size={13} /> Random <Toggle checked={cfg.random} onChange={(v) => { setCfg({ ...cfg, random: v }); setPrev(null) }} />
          </label>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Escolha Icon={FileText} titulo="Arquivo SRT" valor={arq.srt} onTrocar={() => pegar('srt')} />
          <Escolha Icon={Folder} titulo="Pasta principal" valor={arq.principal} onTrocar={() => pegar('principal')} />
          <Escolha Icon={Folder} titulo="Pasta extra" opcional valor={arq.extra} onTrocar={() => pegar('extra')} onLimpar={() => setArq({ ...arq, extra: '' })} dica="Use quando vídeos e imagens estão em pastas separadas. Os arquivos são mesclados pelo número inicial." />
          <Escolha Icon={Music} titulo="Áudio" opcional valor={arq.audio} onTrocar={() => pegar('audio')} onLimpar={() => setArq({ ...arq, audio: '' })} dica="Vai junto com os clipes na pasta de saída (000_narracao), para importar no CapCut. Não muda o processamento." />
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Modo de corte</p>
        <div className="grid grid-cols-3 gap-3">
          {MODOS.map((m) => (
            <button key={m.v} onClick={() => { setCfg({ ...cfg, cutMode: m.v }); setPrev(null) }} className={`rounded-xl border px-4 py-3 text-center transition-colors ${cfg.cutMode === m.v ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700'}`}>
              <p className="font-semibold">{m.t}</p><p className="text-[11px] text-slate-500">{m.s}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-5">
        {[
          { k: 'speedUp', alvo: 'minTarget', titulo: 'Aceleração inteligente', rot: 'Acelerar vídeos quando a diferença for pequena', alvoRot: 'Duração mínima alvo', min: 7, max: 7.9, step: 0.1, cor: 'violet', pct: `Aceleração máx ${acel.toFixed(1)}%`, pctCor: 'text-emerald-400', nota: `Vídeos que precisariam ser cortados em até ${(8 - cfg.minTarget).toFixed(1)}s são ACELERADOS em vez de cortados (preserva 100% do conteúdo).` },
          { k: 'slowDown', alvo: 'maxTarget', titulo: 'Desaceleração automática', rot: 'Desacelerar vídeos curtos automaticamente', alvoRot: 'Duração máxima alvo', min: 8, max: 11, step: 0.5, cor: 'amber', pct: `Desaceleração máx ${desac.toFixed(1)}%`, pctCor: desac > 25 ? 'text-red-400' : 'text-amber-300', nota: `Se o bloco (incluindo o silêncio) precisar durar mais que ${cfg.maxTarget}s, ele é marcado como erro.` },
        ].map((b) => (
          <Card key={b.k} className="p-5">
            <p className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${b.cor === 'violet' ? 'text-violet-300' : 'text-amber-300'}`}><Gauge size={14} /> {b.titulo}</p>
            <label className="mb-3 flex items-center justify-between text-[13px] font-semibold text-slate-200">{b.rot}<Toggle checked={cfg[b.k]} color={b.cor === 'violet' ? 'bg-violet-500' : 'bg-amber-500'} onChange={(v) => { setCfg({ ...cfg, [b.k]: v }); setPrev(null) }} /></label>
            <p className="mb-1.5 text-xs text-slate-500">{b.alvoRot}</p>
            <div className="flex items-center gap-2">
              <button className={`${btnGhost} px-3`} onClick={() => { passo(b.alvo, -b.step, b.min, b.max, b.step); setPrev(null) }}>−</button>
              <div className={`flex-1 rounded-lg border py-2 text-center font-mono text-sm ${b.cor === 'violet' ? 'border-violet-500/30 text-violet-200' : 'border-amber-500/30 text-amber-200'}`}>{Number(cfg[b.alvo]).toFixed(1)}s</div>
              <button className={`${btnGhost} px-3`} onClick={() => { passo(b.alvo, b.step, b.min, b.max, b.step); setPrev(null) }}>+</button>
            </div>
            <p className="mt-1.5 text-center font-mono text-[10.5px] text-slate-600">faixa {b.min.toFixed(1)}–{b.max.toFixed(1)}s · passo {b.step}s</p>
            <p className={`mt-3 border-t border-slate-800 pt-3 text-xs font-semibold ${b.pctCor}`}>{b.pct} <span className="font-normal text-slate-500">(para vídeos de 8s)</span></p>
            <p className="mt-1 text-xs text-slate-500">{b.nota}</p>
          </Card>
        ))}
      </div>

      <button onClick={preview} disabled={carregando || !arq.srt || !arq.principal} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 py-4 text-[15px] font-semibold text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-40">
        <Sparkles size={17} /> {carregando ? 'Analisando…' : 'Gerar prévia'}
      </button>

      {prev && (
        <Card className="mt-5 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-200">{prev.resumo.total} blocos · {t2(prev.resumo.duracao)}</span>
            {['cortar', 'acelerar', 'desacelerar', 'imagem', 'manter'].filter((k) => prev.resumo[k]).map((k) => <span key={k} className={`rounded-md bg-slate-900 px-2 py-1 ${ACAO[k][1]}`}>{prev.resumo[k]} {ACAO[k][0].toLowerCase()}</span>)}
            {prev.resumo.erro > 0 && <span className="rounded-md bg-red-500/10 px-2 py-1 text-red-300">{prev.resumo.erro} com erro</span>}
            <span className="ml-auto text-slate-500">Saída {prev.resolucao.w}×{prev.resolucao.h} · 30 fps</span>
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-slate-900 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Tempo</th><th className="px-3 py-2">Bloco</th><th className="w-[34%] px-3 py-2">Arquivo</th><th className="px-3 py-2">Ação</th></tr>
              </thead>
              <tbody>
                {prev.plano.map((p) => (
                  <tr key={p.num} className={`border-t border-slate-800/60 ${p.acao === 'erro' ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-1.5 font-bold text-cyan-300">{p.num}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-400">{t2(p.inicio)}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-300">{p.duracao.toFixed(2)}s</td>
                    <td className="max-w-0 truncate px-3 py-1.5 text-slate-400" title={p.arquivo}>{nome(p.arquivo) || '—'}{p.aleatoria && <span className="ml-1 text-[10px] text-amber-300">(random)</span>}</td>
                    <td className={`px-3 py-1.5 ${ACAO[p.acao][1]}`}>
                      {ACAO[p.acao][0]}
                      {p.acao === 'cortar' && ` ${p.cortado.toFixed(2)}s`}
                      {(p.acao === 'acelerar' || p.acao === 'desacelerar') && ` ${p.percentual.toFixed(1)}%`}
                      {p.acao === 'erro' && <span className="ml-1 text-[11px] text-red-300/80">· {p.motivo}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {prog ? (
            <div className="mt-4 space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${prog.total ? (prog.feitos / prog.total) * 100 : 0}%` }} /></div>
              <div className="flex items-center justify-between text-xs text-slate-400"><span>Processando {prog.feitos}/{prog.total}…</span><button className={btnGhost} onClick={() => call('srt:cancel')}><Square size={13} /> Cancelar</button></div>
            </div>
          ) : (
            <button onClick={aplicar} disabled={prev.resumo.total === prev.resumo.erro} className={`${btnPrimary} mt-4 w-full py-3 text-[15px]`}><Play size={16} /> Aplicar sincronização ({prev.resumo.total - prev.resumo.erro} clipe(s))</button>
          )}
        </Card>
      )}

      {fim && (
        <Card className="mt-5 flex items-center gap-4 border-emerald-500/30 p-5">
          {fim.erros.length ? <TriangleAlert size={22} className="text-amber-400" /> : <CircleCheck size={22} className="text-emerald-400" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{fim.feitos - fim.erros.length} clipe(s) prontos{fim.erros.length ? ` · ${fim.erros.length} com erro (veja os Logs)` : ''}</p>
            <p className="truncate font-mono text-xs text-slate-500">{fim.saida}</p>
            <p className="mt-1 text-xs text-slate-400">Selecione todos os arquivos da pasta e arraste para a timeline do CapCut: já estão na ordem e com a duração de cada bloco.</p>
          </div>
          <button className={btnGhost} onClick={() => call('sys:openPath', fim.saida)}><FolderOpen size={15} /> Abrir pasta</button>
        </Card>
      )}

      <Modal open={!!hist} onClose={() => setHist(null)} title="Histórico de sincronizações" width="max-w-2xl">
        {hist && !hist.length && <p className="text-sm text-slate-500">Nenhuma sincronização ainda.</p>}
        <div className="space-y-2">
          {(hist || []).map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
              <Film size={16} className="text-cyan-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-200">{nome(h.srt)} → {h.feitos}/{h.blocos} clipes{h.erros ? ` · ${h.erros} erro(s)` : ''}{h.cancelado ? ' · cancelado' : ''}</p>
                <p className="text-[11px] text-slate-500">{new Date(h.quando).toLocaleString('pt-BR')}</p>
              </div>
              <button className={btnGhost} onClick={() => call('sys:openPath', h.saida)}><FolderOpen size={14} /></button>
              <button className="text-slate-600 hover:text-red-400" onClick={async () => setHist(await call('srt:historyRemove', h.id))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
