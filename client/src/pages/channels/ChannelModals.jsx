import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2, Plus, Copy, Star, GripVertical, ExternalLink, X, Loader2, Save } from 'lucide-react'
import { useDb } from '../../lib/db'
import { useI18n } from '../../i18n'
import { api, apiErrorMessage } from '../../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, formatCompact } from '../../components/ui'
import { Field } from './ChannelsList'

const LANG_CODES = ['pt', 'en', 'es', 'de', 'fr', 'it', 'ja']

// Chaves de permissão de compartilhamento (labels traduzidos via i18n).
const PERMISSION_KEYS = ['permissionEditConfig', 'permissionEditPrompts', 'permissionDeleteVideos', 'permissionEditReferences']

// ---------------------------------------------------------------------------
// Editar Canal
// ---------------------------------------------------------------------------
export function EditChannelModal({ open, onClose, channel }) {
  const db = useDb()
  const { t } = useI18n()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (open) {
      setForm({
        name: channel.name || '',
        language: channel.language || 'pt',
        contactEmail: channel.contactEmail || '',
        // Suporta múltiplos horários de postagem (compat: defaultPostTime antigo)
        postTimes: channel.postTimes?.length ? channel.postTimes : [channel.defaultPostTime || '18:00'],
        frequency: channel.frequency || (channel.weeklyFrequency ? `${channel.weeklyFrequency}x por semana` : '1x por semana'),
        postedBaseline: channel.postedBaseline ?? 0,
        notes: channel.notes || '',
      })
    }
  }, [open, channel])

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function setTime(i, value) {
    set('postTimes', form.postTimes.map((t, idx) => (idx === i ? value : t)))
  }

  function save(e) {
    e.preventDefault()
    const postTimes = form.postTimes.filter(Boolean)
    db.update('channels', channel.id, {
      name: form.name,
      language: form.language,
      contactEmail: form.contactEmail,
      postTimes,
      defaultPostTime: postTimes[0] || null,
      frequency: form.frequency,
      postedBaseline: Number(form.postedBaseline) || 0,
      notes: form.notes,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('channels.modals.editTitle')}>
      <p className="-mt-3 mb-5 text-xs text-slate-500">{t('channels.modals.editSub')}</p>
      <form onSubmit={save} className="space-y-4">
        <Field label={t('channels.modals.name')}>
          <input className={inputCls} required value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('channels.modals.language')}>
            <select className={inputCls} value={form.language} onChange={(e) => set('language', e.target.value)}>
              {LANG_CODES.map((c) => (
                <option key={c} value={c}>
                  {t(`common.langFull.${c}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('channels.modals.email')}>
            <input className={inputCls} type="email" value={form.contactEmail || ''} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
        </div>

        <Field label={t('channels.modals.postTime')}>
          <div className="flex flex-wrap gap-2">
            {(form.postTimes || []).map((time, i) => (
              <div key={i} className="relative">
                <input className={`${inputCls} !w-32 ${form.postTimes.length > 1 ? '!pr-8' : ''}`} type="time" value={time} onChange={(e) => setTime(i, e.target.value)} />
                {form.postTimes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set('postTimes', form.postTimes.filter((_, idx) => idx !== i))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-red-400"
                    title={t('channels.modals.removeTime')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('postTimes', [...form.postTimes, '12:00'])}
              title={t('channels.modals.addTime')}
              className="flex h-10 w-14 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
            >
              <Plus size={15} />
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('channels.modals.frequency')}>
            <input className={inputCls} placeholder={t('channels.modals.frequencyPlaceholder')} value={form.frequency || ''} onChange={(e) => set('frequency', e.target.value)} />
          </Field>
          <Field label={t('channels.modals.postedBaseline')}>
            <input className={inputCls} type="number" min="0" value={form.postedBaseline ?? 0} onChange={(e) => set('postedBaseline', e.target.value)} />
          </Field>
        </div>

        <Field label={t('channels.modals.notes')}>
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={`${btnPrimary} flex items-center gap-2`}>
            <Save size={14} />
            {t('channels.modals.update')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Botões personalizados (grid de 6 posições)
// ---------------------------------------------------------------------------
export function CustomButtonsModal({ open, onClose, channelId }) {
  const db = useDb()
  const { t } = useI18n()
  const [slots, setSlots] = useState([])

  useEffect(() => {
    if (!open) return
    const existing = db.all('channelButtons').filter((b) => b.channelId === channelId)
    setSlots(
      Array.from({ length: 6 }, (_, i) => {
        const found = existing.find((b) => b.position === i + 1)
        return { position: i + 1, label: found?.label || '', url: found?.url || '' }
      }),
    )
  }, [open, channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  function setSlot(i, k, v) {
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, [k]: v } : slot)))
  }

  function save() {
    db.removeWhere('channelButtons', (b) => b.channelId === channelId)
    slots
      .filter((s) => s.label.trim() && s.url.trim())
      .forEach((s) => db.insert('channelButtons', { channelId, label: s.label.trim(), url: s.url.trim(), position: s.position }))
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('channels.modals.buttonsTitle')} wide>
      <p className="mb-4 text-sm text-slate-500">{t('channels.modals.buttonsDesc')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slots.map((slot, i) => (
          <div key={slot.position} className="rounded-lg border border-slate-800 p-3">
            <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-600">{t('channels.modals.buttonN', { n: slot.position })}</p>
            <input
              className={`${inputCls} mb-2`}
              placeholder={t('channels.modals.buttonName')}
              value={slot.label}
              onChange={(e) => setSlot(i, 'label', e.target.value)}
            />
            <input className={inputCls} placeholder="https://..." value={slot.url} onChange={(e) => setSlot(i, 'url', e.target.value)} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className={btnPrimary} onClick={save}>
          {t('channels.modals.saveButtons')}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Compartilhar canal (permissões granulares)
// ---------------------------------------------------------------------------
export function ShareChannelModal({ open, onClose, channelId }) {
  const db = useDb()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [perms, setPerms] = useState({})
  const members = db.all('channelMembers').filter((m) => m.channelId === channelId)

  function invite(e) {
    e.preventDefault()
    if (!email.trim()) return
    db.insert('channelMembers', { channelId, email: email.trim(), role: 'editor', ...perms })
    setEmail('')
    setPerms({})
  }

  return (
    <Modal open={open} onClose={onClose} title={t('channels.modals.shareTitle')} wide>
      <form onSubmit={invite} className="rounded-lg border border-slate-800 p-4">
        <Field label={t('channels.modals.guestEmail')}>
          <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="editor@email.com" />
        </Field>
        <p className="mb-1.5 mt-4 text-xs font-semibold tracking-wide text-slate-400">{t('channels.modals.permissions')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={!!perms[key]}
                onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-500"
              />
              {t(`channels.modals.perms.${key}`)}
            </label>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-600">{t('channels.modals.serverNote')}</p>
        <div className="mt-4 flex justify-end">
          <button type="submit" className={btnPrimary}>
            {t('channels.modals.invite')}
          </button>
        </div>
      </form>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{t('channels.modals.activeMembers')}</p>
        {members.length === 0 ? (
          <p className="text-sm text-slate-600">{t('channels.modals.onlyYou')}</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                  {m.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{m.email}</p>
                  <p className="text-[11px] text-slate-500">
                    {PERMISSION_KEYS.filter((k) => m[k]).map((k) => t(`channels.modals.perms.${k}`)).join(' · ') || t('channels.modals.viewOnly')}
                  </p>
                </div>
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400">{t('channels.modals.editor')}</span>
                <button onClick={() => db.remove('channelMembers', m.id)} title={t('channels.modals.removeAccess')} className="text-slate-600 hover:text-red-400">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Prompts do canal (view filtrada da biblioteca)
// ---------------------------------------------------------------------------
export function ChannelPromptsModal({ open, onClose, channelId }) {
  const db = useDb()
  const { t } = useI18n()
  const prompts = db.all('prompts').filter((p) => p.channelId === channelId)
  const [copied, setCopied] = useState(null)

  async function copy(p) {
    await navigator.clipboard.writeText(p.content)
    setCopied(p.id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('channels.modals.promptsTitle')} wide>
      {prompts.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{t('channels.modals.promptsEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {prompts.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-800 p-3.5">
              <div className="flex items-center gap-2">
                {p.isFavorite && <Star size={13} className="fill-amber-400 text-amber-400" />}
                <p className="font-medium text-slate-200">{p.name}</p>
                <button onClick={() => copy(p)} className={`ml-auto flex items-center gap-1.5 text-xs ${copied === p.id ? 'text-green-400' : 'text-slate-500 hover:text-cyan-400'}`}>
                  <Copy size={13} />
                  {copied === p.id ? t('channels.modals.copied') : t('channels.modals.copy')}
                </button>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{p.content}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Canais de referência vinculados ao canal (layout do print: lista arrastável
// para reordenar + seção "Adicionar novo canal" com nome e URL)
// ---------------------------------------------------------------------------
export function ChannelReferencesModal({ open, onClose, channelId }) {
  const db = useDb()
  const { t } = useI18n()
  const channel = db.get('channels', channelId)
  const refs = db
    .all('referenceChannels')
    .filter((r) => r.channelId === channelId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  async function add(e) {
    e.preventDefault()
    if (!url.trim()) return
    setAdding(true)
    setError('')
    let cached = null
    try {
      cached = await api.youtube.lookupChannel(url.trim())
    } catch (err) {
      // Sem chave/quota ainda dá pra salvar com o nome digitado — enriquece depois.
      if (err.code === 'channel_not_found') {
        setError(apiErrorMessage(err))
        setAdding(false)
        return
      }
    }
    db.insert('referenceChannels', {
      channelId,
      youtubeUrl: url.trim(),
      youtubeChannelId: cached?.id || null,
      cachedStats: cached || (name.trim() ? { title: name.trim() } : null),
      niche: '',
      notes: '',
      position: refs.length,
    })
    setName('')
    setUrl('')
    setAdding(false)
  }

  function onDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oldIndex = refs.findIndex((r) => r.id === active.id)
    const newIndex = refs.findIndex((r) => r.id === over.id)
    arrayMove(refs, oldIndex, newIndex).forEach((r, i) => db.update('referenceChannels', r.id, { position: i }))
  }

  return (
    <Modal open={open} onClose={onClose} title={t('channels.modals.refsTitle')}>
      <p className="-mt-4 text-xs text-cyan-400">{channel?.name}</p>
      <p className="mb-4 mt-1 text-xs text-slate-500">{t('channels.modals.refsSub')}</p>

      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{t('channels.modals.refsAdded', { n: refs.length })}</p>
      {refs.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 py-5 text-center text-xs text-slate-600">{t('channels.modals.refsEmpty')}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={refs.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {refs.map((r) => (
              <SortableReferenceRow key={r.id} reference={r} onRemove={() => db.remove('referenceChannels', r.id)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* Adicionar novo canal */}
      <div className="mt-4 rounded-lg border border-slate-800 p-3.5">
        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-red-400">
          <Plus size={13} />
          {t('channels.modals.addNew')}
        </p>
        <form onSubmit={add} className="space-y-2">
          <input className={inputCls} placeholder={t('channels.modals.refNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <input className={`${inputCls} font-mono text-xs`} required placeholder="https://youtube.com/@..." value={url} onChange={(e) => setUrl(e.target.value)} />
            <button type="submit" className={`${btnGhost} flex shrink-0 items-center gap-1.5 text-xs`} disabled={adding || !url.trim()}>
              {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {t('channels.modals.add')}
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end">
        <button className={btnGhost} onClick={onClose}>
          {t('channels.modals.close')}
        </button>
      </div>
    </Modal>
  )
}

function SortableReferenceRow({ reference: r, onRemove }) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const url = r.youtubeUrl.startsWith('http') ? r.youtubeUrl : `https://youtube.com/${r.youtubeUrl}`

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2.5 ${isDragging ? 'z-10 opacity-90 shadow-2xl' : ''}`}
    >
      <button {...listeners} {...attributes} className="cursor-grab text-slate-600 active:cursor-grabbing" title={t('channels.modals.dragReorder')}>
        <GripVertical size={15} />
      </button>
      {r.cachedStats?.avatar ? (
        <img src={r.cachedStats.avatar} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
          {(r.cachedStats?.title || 'YT').charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-100">{r.cachedStats?.title || r.youtubeUrl}</p>
        <p className="truncate text-[10px] text-slate-500">{r.youtubeUrl}</p>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300" title={t('channels.modals.openYoutube')}>
        <ExternalLink size={14} />
      </a>
      <button onClick={onRemove} title={t('channels.modals.remove')} className="text-red-400/70 hover:text-red-400">
        <X size={15} />
      </button>
    </li>
  )
}
