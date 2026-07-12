import { useEffect, useState } from 'react'
import { Plus, Star, Copy, Trash2, Pencil, Search, FileText, MoreVertical, X, Globe, Check } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { Modal, inputCls, btnPrimary, btnGhost, EmptyState, ConfirmDialog } from '../components/ui'
import { PrivacyScope, PageEye, Masked } from '../components/privacy'
import { Field } from './channels/ChannelsList'

export default function Prompts() {
  const db = useDb()
  const { t } = useI18n()
  const [activeCat, setActiveCat] = useState('all')
  const [channelFilter, setChannelFilter] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [query, setQuery] = useState('')
  const [editPrompt, setEditPrompt] = useState(null) // null | 'new' | prompt
  const [deletePrompt, setDeletePrompt] = useState(null)
  const [managingCats, setManagingCats] = useState(false)

  const categories = [...db.all('promptCategories')].sort((a, b) => a.position - b.position)
  const prompts = db.all('prompts')
  const channels = db.all('channels')

  let filtered = prompts
  if (channelFilter === 'global') filtered = filtered.filter((p) => !p.channelId)
  else if (channelFilter) filtered = filtered.filter((p) => p.channelId === channelFilter)
  if (onlyFavorites) filtered = filtered.filter((p) => p.isFavorite)
  if (query.trim()) {
    const t = query.trim().toLowerCase()
    filtered = filtered.filter((p) => `${p.name} ${p.content} ${(p.tags || []).join(' ')}`.toLowerCase().includes(t))
  }
  const inCat = activeCat === 'all' ? filtered : filtered.filter((p) => p.categoryId === activeCat)

  return (
    <PrivacyScope page="prompts">
    <div className="mx-auto max-w-[1600px] space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{t('prompts.title')}</h1>
            <p className="text-sm text-slate-500">{t('prompts.subtitle')}</p>
          </div>
        </div>
        <PageEye />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputCls} !w-48`} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
          <option value="">{t('prompts.allChannels')}</option>
          <option value="global">{t('prompts.global')}</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setOnlyFavorites((v) => !v)}
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
            onlyFavorites ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
          }`}
        >
          <Star size={14} className={onlyFavorites ? 'fill-amber-400' : ''} />
          {t('prompts.onlyFavorites')}
        </button>
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={`${inputCls} !pl-9`} placeholder={t('prompts.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setEditPrompt('new')}>
          <Plus size={16} />
          {t('prompts.newPrompt')}
        </button>
      </div>

      {/* Pílulas de categoria */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CatPill active={activeCat === 'all'} onClick={() => setActiveCat('all')} label={t('prompts.all')} count={filtered.length} />
        {categories.map((cat) => (
          <CatPill
            key={cat.id}
            active={activeCat === cat.id}
            onClick={() => setActiveCat(cat.id)}
            label={cat.name}
            count={filtered.filter((p) => p.categoryId === cat.id).length}
          />
        ))}
        <button onClick={() => setManagingCats(true)} className="rounded-full border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-500 hover:border-cyan-500/40 hover:text-cyan-400" title={t('prompts.manageCategories')}>
          <Plus size={12} className="inline" /> {t('prompts.category')}
        </button>
      </div>

      {inCat.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('prompts.emptyTitle')}
          description={t('prompts.emptyDesc')}
          action={
            <button className={btnPrimary} onClick={() => setEditPrompt('new')}>
              {t('prompts.createFirst')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {inCat.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              category={categories.find((c) => c.id === p.categoryId)}
              channelName={p.channelId ? channels.find((c) => c.id === p.channelId)?.name : null}
              onEdit={() => setEditPrompt(p)}
              onDelete={() => setDeletePrompt(p)}
            />
          ))}
        </div>
      )}

      <PromptFormModal open={editPrompt !== null} onClose={() => setEditPrompt(null)} prompt={editPrompt === 'new' ? null : editPrompt} categories={categories} channels={channels} />
      <CategoriesModal open={managingCats} onClose={() => setManagingCats(false)} categories={categories} />
      <ConfirmDialog
        open={deletePrompt !== null}
        onClose={() => setDeletePrompt(null)}
        onConfirm={() => db.remove('prompts', deletePrompt.id)}
        title={t('prompts.deleteTitle')}
        message={t('prompts.deleteMsg', { name: deletePrompt?.name })}
      />
    </div>
    </PrivacyScope>
  )
}

function CatPill({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
      }`}
    >
      {label}
      <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'}`}>{count}</span>
    </button>
  )
}

function PromptCard({ prompt: p, category, channelName, onEdit, onDelete }) {
  const db = useDb()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(p.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 transition-colors hover:border-cyan-500/40">
      <div className="border-t-2 border-cyan-500/50" />
      <div className="flex flex-1 flex-col p-3.5">
        {/* Badges + ações */}
        <div className="flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {category && <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">{category.name}</span>}
            <span className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[9px] font-medium text-slate-400">
              <Globe size={8} />
              {t(`common.langNames.${p.suggestedLanguage || 'pt'}`)}
            </span>
          </div>
          <button onClick={copy} title={t('prompts.copy')} className={copied ? 'text-green-400' : 'text-slate-500 hover:text-slate-200'}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button onClick={() => db.update('prompts', p.id, { isFavorite: !p.isFavorite })} title={t('prompts.favorite')}>
            <Star size={14} className={p.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-500 hover:text-amber-400'} />
          </button>
          <button onClick={() => setMenuOpen((v) => !v)} className="text-slate-500 hover:text-slate-200">
            <MoreVertical size={14} />
          </button>
        </div>

        {menuOpen && (
          <div className="absolute right-3 top-10 z-20 w-36 rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
            <button onClick={() => { setMenuOpen(false); onEdit() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
              <Pencil size={12} />
              {t('prompts.edit')}
            </button>
            <button onClick={() => { setMenuOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
              <Trash2 size={12} />
              {t('prompts.delete')}
            </button>
          </div>
        )}

        <p className="mt-2.5 font-bold leading-snug text-slate-100"><Masked mask="•••••••••">{p.name}</Masked></p>
        <p className="mt-0.5 text-[11px] text-slate-500"><Masked mask="•••••">{channelName || t('prompts.global')}</Masked></p>

        {/* Preview do conteúdo — no modo restrito o texto real não entra no DOM */}
        <div className="mt-2.5 max-h-28 flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2.5">
          <p className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-400">
            <Masked mask="••••••••••••••••••••••••••••••••••••••••">{p.content.slice(0, 400)}</Masked>
          </p>
        </div>

        {(p.tags || []).length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {p.tags.map((tag) => (
              <span key={tag} className="rounded border border-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">
                🏷 {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal Criar/Editar Prompt (layout do print)
// ---------------------------------------------------------------------------
function PromptFormModal({ open, onClose, prompt, categories, channels }) {
  const db = useDb()
  const { t } = useI18n()
  const [form, setForm] = useState({})
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    if (open) {
      setForm({
        channelId: prompt?.channelId || '',
        name: prompt?.name || '',
        categoryId: prompt?.categoryId || categories[0]?.id || '',
        content: prompt?.content || '',
        notes: prompt?.notes || '',
        suggestedLanguage: prompt?.suggestedLanguage || 'pt',
        tags: prompt?.tags || [],
      })
      setTagInput('')
    }
  }, [open, prompt]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '')
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }

  function save(e) {
    e.preventDefault()
    const payload = { ...form, channelId: form.channelId || null }
    if (prompt) db.update('prompts', prompt.id, payload)
    else db.insert('prompts', { ...payload, isFavorite: false })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={prompt ? t('prompts.form.editTitle') : t('prompts.form.createTitle')} wide>
      <form onSubmit={save} className="space-y-4">
        <Field label={t('prompts.form.channel')}>
          <select className={inputCls} value={form.channelId || ''} onChange={(e) => set('channelId', e.target.value)}>
            <option value="">{t('prompts.globalOption')}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('prompts.form.name')}>
            <input className={inputCls} required placeholder={t('prompts.form.namePlaceholder')} value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('prompts.form.categoryLabel')}>
            <select className={inputCls} required value={form.categoryId || ''} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t('prompts.form.content')}>
          <textarea
            className={`${inputCls} min-h-36 resize-y font-mono text-xs`}
            required
            placeholder={t('prompts.form.contentPlaceholder')}
            value={form.content || ''}
            onChange={(e) => set('content', e.target.value)}
          />
        </Field>

        <Field label={t('prompts.form.notes')}>
          <textarea className={`${inputCls} min-h-16 resize-y`} placeholder={t('prompts.form.notesPlaceholder')} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <Field label={t('prompts.form.language')}>
          <select className={inputCls} value={form.suggestedLanguage || 'pt'} onChange={(e) => set('suggestedLanguage', e.target.value)}>
            <option value="pt">{t('common.langNames.pt')}</option>
            <option value="en">{t('common.langNames.en')}</option>
            <option value="es">{t('common.langNames.es')}</option>
          </select>
        </Field>

        <Field label={t('prompts.form.tags')}>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder={t('prompts.form.tagPlaceholder')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
            />
            <button type="button" onClick={addTag} className={`${btnGhost} shrink-0 !px-3`}>
              <Plus size={15} />
            </button>
          </div>
          {(form.tags || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {form.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                  {tag}
                  <button type="button" onClick={() => set('tags', form.tags.filter((t) => t !== tag))} className="text-slate-500 hover:text-red-400">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary}>
            {prompt ? t('prompts.form.save') : t('prompts.form.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CategoriesModal({ open, onClose, categories }) {
  const db = useDb()
  const { t } = useI18n()
  const [name, setName] = useState('')

  function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    db.insert('promptCategories', { name: name.trim(), position: categories.length })
    setName('')
  }

  return (
    <Modal open={open} onClose={onClose} title={t('prompts.manageCategoriesTitle')}>
      <form onSubmit={add} className="flex gap-2">
        <input className={inputCls} placeholder={t('prompts.newCategory')} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className={`${btnPrimary} shrink-0`}>
          <Plus size={15} />
        </button>
      </form>
      <ul className="mt-4 space-y-1.5">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">
            {c.name}
            <button onClick={() => db.remove('promptCategories', c.id)} className="text-slate-600 hover:text-red-400" title={t('prompts.deleteCategory')}>
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
