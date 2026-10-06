import { useCallback, useEffect, useState } from 'react'
import { Puzzle, Plus, Package, Trash2, User, X, Download, Check } from 'lucide-react'
import { call, useToast } from '../../lib/api'
import { mediaUrl } from '../../lib/media'
import { btnGhost, btnPrimary, inputCls, Toggle } from '../ui'

// Pacotes de imagens reutilizáveis (personagens, cenários, referências).
export default function Ingredientes({ projectId, onClose, importados = [], onImportado }) {
  const toast = useToast()
  const [packs, setPacks] = useState([])
  const [atual, setAtual] = useState(null)
  const [renomear, setRenomear] = useState(null)
  const [personagem, setPersonagem] = useState(null)

  const carregar = useCallback(() => call('creator:packs').then(setPacks).catch((e) => toast(e.message, 'error')), [toast])
  useEffect(() => { carregar() }, [carregar])
  const pack = packs.find((p) => p.id === atual)

  async function novoPacote() {
    const id = await call('creator:createPack', `Pacote ${packs.length + 1}`)
    await carregar(); setAtual(id); setRenomear(id)
  }
  async function adicionar(caminhos) {
    if (!pack || !caminhos?.length) return
    setPacks(await call('creator:addItems', pack.id, caminhos))
  }
  async function importar() {
    await call('creator:importPack', projectId, pack.id)
    toast(`Pacote "${pack.name}" importado: os [Nome] dele valem neste projeto.`, 'success')
    onImportado && onImportado()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fade-up flex h-[min(720px,90vh)] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex w-64 shrink-0 flex-col border-r border-slate-800">
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="flex items-center gap-2 font-bold"><Puzzle size={17} className="text-amber-400" /> Ingredientes</p>
            <p className="text-xs text-slate-500">Pacotes de imagens reutilizáveis</p>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {packs.map((p) => (
              <div key={p.id} onClick={() => setAtual(p.id)} onDoubleClick={() => setRenomear(p.id)} className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ${atual === p.id ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-900'}`}>
                <Package size={15} />
                {renomear === p.id
                  ? <input autoFocus defaultValue={p.name} className="w-full rounded bg-slate-950 px-1 text-sm text-slate-100" onBlur={async (e) => { await call('creator:renamePack', p.id, e.target.value || p.name); setRenomear(null); carregar() }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                  : <span className="flex-1 truncate text-sm">{p.name}</span>}
                {importados.includes(p.id) && <Check size={13} className="text-emerald-400" title="Importado neste projeto" />}
                <span className="text-[10px] text-slate-600">{p.items.length}</span>
              </div>
            ))}
          </div>
          <button onClick={novoPacote} className="flex items-center gap-2 border-t border-slate-800 px-5 py-3.5 text-sm font-semibold text-slate-300 hover:text-cyan-300"><Plus size={15} /> Novo pacote</button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-3">
            <p className="flex-1 truncate text-sm text-slate-300">{pack ? pack.name : 'Selecione um pacote'}</p>
            {pack && (
              <>
                <button className={btnGhost} onClick={async () => adicionar(await call('sys:pickFile', { title: 'Adicionar imagens', multi: true, filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] }))}><Plus size={14} /> Adicionar imagens</button>
                <button className={btnPrimary} onClick={importar}><Download size={14} /> Importar pro projeto</button>
                <button className="rounded-lg p-2 text-slate-500 hover:text-red-400" title="Excluir pacote" onClick={async () => { await call('creator:deletePack', pack.id); setAtual(null); carregar() }}><Trash2 size={15} /></button>
              </>
            )}
            <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" onClick={onClose}><X size={16} /></button>
          </div>
          <div
            className="flex-1 overflow-y-auto p-5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault()
              const jobId = e.dataTransfer.getData('noctis/job')
              if (jobId && pack) { setPacks(await call('creator:addItemFromJob', pack.id, jobId)); return }
              adicionar([...e.dataTransfer.files].map((f) => window.noctis.pathOf(f)).filter(Boolean))
            }}
          >
            {!pack ? (
              <div className="flex h-full flex-col items-center justify-center text-slate-600"><Package size={34} /><p className="mt-2 text-sm">Selecione ou crie um pacote</p></div>
            ) : pack.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-500"><p className="text-sm">Pacote vazio.</p><p className="text-xs">Adicione imagens ou arraste do computador (ou do grid).</p></div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {pack.items.map((it) => (
                  <div key={it.id} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                    <img src={mediaUrl(it.file_path)} className="aspect-square w-full object-cover" alt="" />
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      {it.is_character && <User size={12} className="shrink-0 text-amber-400" />}
                      <span className="truncate text-xs text-slate-300">{it.is_character ? `[${it.name}]` : it.name}</span>
                    </div>
                    <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 group-hover:opacity-100">
                      <button className="rounded-md bg-black/75 p-1.5 text-slate-200 hover:text-amber-300" title="Painel de personagem" onClick={() => setPersonagem({ ...it })}><User size={13} /></button>
                      <button className="rounded-md bg-black/75 p-1.5 text-slate-200 hover:text-red-400" title="Remover" onClick={async () => setPacks(await call('creator:removeItem', it.id))}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {personagem && (
          <div className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-slate-800 p-5">
            <div className="flex items-center justify-between"><p className="font-bold">Personagem</p><button onClick={() => setPersonagem(null)} className="text-slate-500"><X size={15} /></button></div>
            <img src={mediaUrl(personagem.file_path)} className="aspect-square w-full rounded-xl object-cover" alt="" />
            <label className="flex items-center justify-between text-sm text-slate-300">Usar como personagem <Toggle checked={personagem.is_character} onChange={(v) => setPersonagem({ ...personagem, is_character: v })} /></label>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400">Nome (vira a tag [Nome])</p>
              <input className={inputCls} value={personagem.name} onChange={(e) => setPersonagem({ ...personagem, name: e.target.value.replace(/[[\]]/g, '') })} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400">Corpo inteiro (opcional)</p>
              <button className={`${btnGhost} w-full`} onClick={async () => { const p = await call('sys:pickFile', { title: 'Foto de corpo inteiro', filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] }); if (p) setPersonagem({ ...personagem, body_path: p }) }}>{personagem.body_path ? 'Trocar foto de corpo' : 'Escolher foto de corpo'}</button>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400">Voz (fala dele nos vídeos por Elementos)</p>
              <input className={inputCls} placeholder="ex.: charon, kore" value={personagem.voice || ''} onChange={(e) => setPersonagem({ ...personagem, voice: e.target.value })} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400">Notas (jeito dele)</p>
              <textarea rows={3} className={inputCls} value={personagem.notes || ''} onChange={(e) => setPersonagem({ ...personagem, notes: e.target.value })} />
            </div>
            <button className={`${btnPrimary} w-full`} onClick={async () => {
              try {
                setPacks(await call('creator:updateItem', personagem.id, { name: personagem.name, is_character: personagem.is_character, voice: personagem.voice || null, notes: personagem.notes || null, body_path: personagem.body_path || null }))
                setPersonagem(null); toast('Personagem salvo.', 'success')
              } catch (e) { toast(e.message, 'error') }
            }}>Salvar</button>
          </div>
        )}
      </div>
    </div>
  )
}
