import { useState } from 'react'
import { Plus, Star, Copy, Trash2, Pencil, Sparkles, Globe, Lock, X } from 'lucide-react'
import { useDb } from '../lib/db'
import { Modal, inputCls, btnPrimary, btnGhost, EmptyState, ConfirmDialog } from '../components/ui'
import { Field } from './channels/ChannelsList'

export default function Prompts() {
  const db = useDb()
  const [activeCat, setActiveCat] = useState('all')
  const [editPrompt, setEditPrompt] = useState(null) // null | 'new' | prompt
  const [deletePrompt, setDeletePrompt] = useState(null)
  const [copied, setCopied] = useState(null)
  const [managingCats, setManagingCats] = useState(false)

  const categories = [...db.all('promptCategories')].sort((a, b) => a.position - b.position)
  const prompts = db.all('prompts')
  const channels = db.all('channels')

  const filtered = activeCat === 'all' ? prompts : prompts.filter((p) => p.categoryId === activeCat)

  async function copy(p) {
    await navigator.clipboard.writeText(p.content)
    setCopied(p.id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Biblioteca de Prompts</h1>
          <p className="mt-1 text-sm text-slate-500">Seus prompts organizados por categoria, prontos pra copiar.</p>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => setManagingCats(true)}>
            Categorias
          </button>
          <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setEditPrompt('new')}>
            <Plus size={16} />
            Novo Prompt
          </button>
        </div>
      </div>

      {/* Abas de categoria com contagem */}
      <div className="flex flex-wrap gap-1.5">
        <CatTab active={activeCat === 'all'} onClick={() => setActiveCat('all')} label="Todos" count={prompts.length} />
        {categories.map((cat) => (
          <CatTab
            key={cat.id}
            active={activeCat === cat.id}
            onClick={() => setActiveCat(cat.id)}
            label={cat.name}
            count={prompts.filter((p) => p.categoryId === cat.id).length}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhum prompt nesta categoria"
          description="Crie prompts com placeholders inteligentes como [COLE O TÍTULO] e reutilize em todos os canais."
          action={
            <button className={btnPrimary} onClick={() => setEditPrompt('new')}>
              Criar primeiro prompt
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const cat = categories.find((c) => c.id === p.categoryId)
            const channel = channels.find((c) => c.id === p.channelId)
            return (
              <div key={p.id} className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-cyan-500/40">
                <div className="flex items-center gap-2">
                  {cat && <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400">{cat.name}</span>}
                  {p.isPublic ? (
                    <span className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
                      <Globe size={9} />
                      PÚBLICO
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      <Lock size={9} />
                      PRIVADO
                    </span>
                  )}
                  <button
                    onClick={() => db.update('prompts', p.id, { isFavorite: !p.isFavorite })}
                    className="ml-auto"
                    title={p.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
                  >
                    <Star size={15} className={p.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-amber-400'} />
                  </button>
                </div>
                <p className="mt-2.5 font-semibold text-slate-100">{p.name}</p>
                <p className="mt-1 line-clamp-3 flex-1 whitespace-pre-line text-xs leading-relaxed text-slate-500">{p.content}</p>
                {channel && <p className="mt-2 text-[11px] text-slate-600">Vinculado a: {channel.name}</p>}
                <div className="mt-3 flex items-center gap-1 border-t border-slate-800 pt-3">
                  <button
                    onClick={() => copy(p)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      copied === p.id ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Copy size={12} />
                    {copied === p.id ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button onClick={() => setEditPrompt(p)} className="ml-auto rounded p-1.5 text-slate-500 hover:text-slate-200" title="Editar">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeletePrompt(p)} className="rounded p-1.5 text-slate-500 hover:text-red-400" title="Excluir">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <PromptFormModal open={editPrompt !== null} onClose={() => setEditPrompt(null)} prompt={editPrompt === 'new' ? null : editPrompt} categories={categories} channels={channels} />
      <CategoriesModal open={managingCats} onClose={() => setManagingCats(false)} categories={categories} />
      <ConfirmDialog
        open={deletePrompt !== null}
        onClose={() => setDeletePrompt(null)}
        onConfirm={() => db.remove('prompts', deletePrompt.id)}
        title="Excluir prompt"
        message={`Excluir "${deletePrompt?.name}"?`}
      />
    </div>
  )
}

function CatTab({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
      }`}
    >
      {label}
      <span className="ml-1.5 text-[10px] text-slate-500">{count}</span>
    </button>
  )
}

function PromptFormModal({ open, onClose, prompt, categories, channels }) {
  const db = useDb()
  const [form, setForm] = useState({})

  // Reinicializa o form quando abre
  const [initialized, setInitialized] = useState(false)
  if (open && !initialized) {
    setForm({
      name: prompt?.name || '',
      categoryId: prompt?.categoryId || categories[0]?.id || '',
      channelId: prompt?.channelId || '',
      content: prompt?.content || '',
      notes: prompt?.notes || '',
      suggestedLanguage: prompt?.suggestedLanguage || 'pt',
      isPublic: prompt?.isPublic || false,
    })
    setInitialized(true)
  }
  if (!open && initialized) setInitialized(false)

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save(e) {
    e.preventDefault()
    const payload = { ...form, channelId: form.channelId || null }
    if (prompt) db.update('prompts', prompt.id, payload)
    else db.insert('prompts', { ...payload, isFavorite: false })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={prompt ? 'Editar Prompt' : 'Novo Prompt'} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="NOME">
            <input className={inputCls} required value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="CATEGORIA">
            <select className={inputCls} value={form.categoryId || ''} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="CANAL DE VÍNCULO (opcional)">
            <select className={inputCls} value={form.channelId || ''} onChange={(e) => set('channelId', e.target.value)}>
              <option value="">Nenhum</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="IDIOMA SUGERIDO">
            <select className={inputCls} value={form.suggestedLanguage || 'pt'} onChange={(e) => set('suggestedLanguage', e.target.value)}>
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
              <option value="es">Espanhol</option>
            </select>
          </Field>
        </div>
        <Field label="CONTEÚDO DO PROMPT">
          <textarea
            className={`${inputCls} min-h-40 resize-y font-mono text-xs`}
            required
            placeholder="Use placeholders como [COLE O TÍTULO], [CORES DO STORYBOARD]..."
            value={form.content || ''}
            onChange={(e) => set('content', e.target.value)}
          />
        </Field>
        <Field label="ANOTAÇÕES">
          <textarea className={`${inputCls} min-h-16 resize-y`} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={!!form.isPublic}
            onChange={(e) => set('isPublic', e.target.checked)}
            className="h-4 w-4 rounded accent-cyan-500"
          />
          Público para a comunidade
          <span className="text-xs text-slate-600">(visível para outros usuários da plataforma)</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            {prompt ? 'Salvar' : 'Criar Prompt'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CategoriesModal({ open, onClose, categories }) {
  const db = useDb()
  const [name, setName] = useState('')

  function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    db.insert('promptCategories', { name: name.trim(), position: categories.length })
    setName('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerenciar Categorias">
      <form onSubmit={add} className="flex gap-2">
        <input className={inputCls} placeholder="Nova categoria..." value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className={`${btnPrimary} shrink-0`}>
          <Plus size={15} />
        </button>
      </form>
      <ul className="mt-4 space-y-1.5">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">
            {c.name}
            <button onClick={() => db.remove('promptCategories', c.id)} className="text-slate-600 hover:text-red-400" title="Excluir categoria">
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
