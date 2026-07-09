import { useEffect, useState } from 'react'
import { Trash2, Plus, Copy, Star } from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, formatCompact } from '../../components/ui'
import { Field } from './ChannelsList'

const LANGUAGES = [
  ['pt', 'Português'],
  ['en', 'Inglês'],
  ['es', 'Espanhol'],
  ['de', 'Alemão'],
  ['fr', 'Francês'],
  ['it', 'Italiano'],
  ['ja', 'Japonês'],
]

// ---------------------------------------------------------------------------
// Editar Canal
// ---------------------------------------------------------------------------
export function EditChannelModal({ open, onClose, channel }) {
  const db = useDb()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (open) {
      setForm({
        name: channel.name || '',
        language: channel.language || 'pt',
        contactEmail: channel.contactEmail || '',
        defaultPostTime: channel.defaultPostTime || '18:00',
        weeklyFrequency: channel.weeklyFrequency || 3,
        notes: channel.notes || '',
      })
    }
  }, [open, channel])

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save(e) {
    e.preventDefault()
    db.update('channels', channel.id, { ...form, weeklyFrequency: Number(form.weeklyFrequency) || null })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar Canal" wide>
      <form onSubmit={save} className="space-y-4">
        <Field label="NOME DO CANAL">
          <input className={inputCls} required value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="IDIOMA">
            <select className={inputCls} value={form.language} onChange={(e) => set('language', e.target.value)}>
              {LANGUAGES.map(([c, l]) => (
                <option key={c} value={c}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="E-MAIL DE CONTATO">
            <input className={inputCls} type="email" value={form.contactEmail || ''} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="HORÁRIO DE POSTAGEM">
            <input className={inputCls} type="time" value={form.defaultPostTime || ''} onChange={(e) => set('defaultPostTime', e.target.value)} />
          </Field>
          <Field label="POSTS POR SEMANA">
            <input className={inputCls} type="number" min="1" max="30" value={form.weeklyFrequency || ''} onChange={(e) => set('weeklyFrequency', e.target.value)} />
          </Field>
        </div>
        <Field label="ANOTAÇÕES">
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Atualizar Canal
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
    <Modal open={open} onClose={onClose} title="Configurar Botões Personalizados" wide>
      <p className="mb-4 text-sm text-slate-500">
        Atalhos exibidos no topo do canal (ex.: YouTube Studio, Canva, AI Studio). Cada botão abre a URL em nova aba.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slots.map((slot, i) => (
          <div key={slot.position} className="rounded-lg border border-slate-800 p-3">
            <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-600">BOTÃO {slot.position}</p>
            <input
              className={`${inputCls} mb-2`}
              placeholder="Nome do botão"
              value={slot.label}
              onChange={(e) => setSlot(i, 'label', e.target.value)}
            />
            <input className={inputCls} placeholder="https://..." value={slot.url} onChange={(e) => setSlot(i, 'url', e.target.value)} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnPrimary} onClick={save}>
          Salvar Botões
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Compartilhar canal (permissões granulares)
// ---------------------------------------------------------------------------
const PERMISSIONS = [
  ['permissionEditConfig', 'Editar configurações do canal'],
  ['permissionEditPrompts', 'Editar prompts'],
  ['permissionDeleteVideos', 'Excluir vídeos'],
  ['permissionEditReferences', 'Editar referências'],
]

export function ShareChannelModal({ open, onClose, channelId }) {
  const db = useDb()
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
    <Modal open={open} onClose={onClose} title="Compartilhar Canal" wide>
      <form onSubmit={invite} className="rounded-lg border border-slate-800 p-4">
        <Field label="E-MAIL DO CONVIDADO">
          <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="editor@email.com" />
        </Field>
        <p className="mb-1.5 mt-4 text-xs font-semibold tracking-wide text-slate-400">PERMISSÕES</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PERMISSIONS.map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={!!perms[key]}
                onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-500"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-600">
          As permissões são aplicadas também no servidor em toda ação sensível — nunca apenas na interface.
        </p>
        <div className="mt-4 flex justify-end">
          <button type="submit" className={btnPrimary}>
            Convidar
          </button>
        </div>
      </form>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">MEMBROS ATIVOS</p>
        {members.length === 0 ? (
          <p className="text-sm text-slate-600">Só você tem acesso a este canal.</p>
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
                    {PERMISSIONS.filter(([k]) => m[k]).map(([, l]) => l).join(' · ') || 'Somente visualização'}
                  </p>
                </div>
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400">EDITOR</span>
                <button onClick={() => db.remove('channelMembers', m.id)} title="Remover acesso" className="text-slate-600 hover:text-red-400">
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
  const prompts = db.all('prompts').filter((p) => p.channelId === channelId)
  const [copied, setCopied] = useState(null)

  async function copy(p) {
    await navigator.clipboard.writeText(p.content)
    setCopied(p.id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Modal open={open} onClose={onClose} title="Prompts do Canal" wide>
      {prompts.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Nenhum prompt vinculado a este canal ainda. Crie na página <b>Prompts</b> selecionando este canal no campo de vínculo.
        </p>
      ) : (
        <ul className="space-y-2">
          {prompts.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-800 p-3.5">
              <div className="flex items-center gap-2">
                {p.isFavorite && <Star size={13} className="fill-amber-400 text-amber-400" />}
                <p className="font-medium text-slate-200">{p.name}</p>
                <button onClick={() => copy(p)} className={`ml-auto flex items-center gap-1.5 text-xs ${copied === p.id ? 'text-green-400' : 'text-slate-500 hover:text-cyan-400'}`}>
                  <Copy size={13} />
                  {copied === p.id ? 'Copiado!' : 'Copiar'}
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
// Canais de referência vinculados ao canal
// ---------------------------------------------------------------------------
export function ChannelReferencesModal({ open, onClose, channelId }) {
  const db = useDb()
  const refs = db.all('referenceChannels').filter((r) => r.channelId === channelId)
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function add(e) {
    e.preventDefault()
    if (!url.trim()) return
    setAdding(true)
    setError('')
    let cached = null
    try {
      cached = await api.youtube.lookupChannel(url.trim())
    } catch (err) {
      // Sem chave/quota ainda dá pra salvar a URL crua — os dados são enriquecidos depois.
      if (err.code === 'channel_not_found') {
        setError(apiErrorMessage(err))
        setAdding(false)
        return
      }
    }
    db.insert('referenceChannels', {
      channelId,
      folderId: null,
      youtubeUrl: url.trim(),
      youtubeChannelId: cached?.id || null,
      cachedStats: cached || null,
      niche: '',
      notes: '',
    })
    setUrl('')
    setAdding(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Canais de Referência" wide>
      <form onSubmit={add} className="flex gap-2">
        <input className={inputCls} placeholder="URL ou @handle do canal benchmark" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" className={`${btnPrimary} flex shrink-0 items-center gap-1.5`} disabled={adding}>
          <Plus size={15} />
          Adicionar
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <ul className="mt-4 space-y-2">
        {refs.length === 0 && <p className="py-4 text-center text-sm text-slate-600">Nenhum canal de referência vinculado.</p>}
        {refs.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2.5">
            {r.cachedStats?.avatar ? (
              <img src={r.cachedStats.avatar} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-400">YT</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-200">{r.cachedStats?.title || r.youtubeUrl}</p>
              {r.cachedStats && (
                <p className="text-[11px] text-slate-500">
                  {formatCompact(r.cachedStats.subscribers)} inscritos · {formatCompact(r.cachedStats.views)} views
                </p>
              )}
            </div>
            <a href={r.youtubeUrl.startsWith('http') ? r.youtubeUrl : `https://youtube.com/${r.youtubeUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300">
              Abrir
            </a>
            <button onClick={() => db.remove('referenceChannels', r.id)} title="Excluir" className="text-slate-600 hover:text-red-400">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
