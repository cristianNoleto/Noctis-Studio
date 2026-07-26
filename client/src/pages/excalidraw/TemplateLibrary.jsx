import { useEffect, useState } from 'react'
import { Loader2, Trash2, Pencil, LayoutTemplate, Plus, Sparkles, Users, Globe, Eye, Lock } from 'lucide-react'
import { api } from '../../lib/api'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthContext'
import { Modal, inputCls, btnPrimary, btnGhost, ConfirmDialog } from '../../components/ui'

// ---------------------------------------------------------------------------
// Biblioteca de MODELOS de Excalidraw. Componentes reutilizados pela galeria
// (usar = novo projeto) e pelo editor (inserir no canvas / salvar como modelo).
// ---------------------------------------------------------------------------

// Ao INSERIR um modelo no canvas atual, os elementos precisam de NOVOS ids para
// não colidirem com o que já existe (e permitir inserir o mesmo modelo 2x). Além
// do id, remapeia todas as referências cruzadas (grupos, frame, container,
// vínculos de seta e boundElements) para as ligações continuarem válidas.
export function remapTemplateElements(elements) {
  const gen = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
  const idMap = new Map()
  for (const el of elements || []) idMap.set(el.id, gen())
  const map = (id) => idMap.get(id) || id
  return (elements || []).map((el) => {
    const n = { ...el, id: map(el.id) }
    if (Array.isArray(el.groupIds)) n.groupIds = el.groupIds.map(map)
    if (el.frameId) n.frameId = map(el.frameId)
    if (el.containerId) n.containerId = map(el.containerId)
    if (Array.isArray(el.boundElements)) n.boundElements = el.boundElements.map((b) => ({ ...b, id: map(b.id) }))
    if (el.startBinding?.elementId) n.startBinding = { ...el.startBinding, elementId: map(el.startBinding.elementId) }
    if (el.endBinding?.elementId) n.endBinding = { ...el.endBinding, elementId: map(el.endBinding.elementId) }
    return n
  })
}

const VIS_ICON = { global: Globe, workspace: Users, specific: Eye, only_me: Lock }

function VisBadge({ visibility }) {
  const { t } = useI18n()
  const Icon = VIS_ICON[visibility] || Users
  return (
    <span className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
      <Icon size={9} /> {t(`drawings.templates.vis.${visibility === 'only_me' ? 'onlyMe' : visibility}`)}
    </span>
  )
}

// Formulário de publicar/editar um modelo. `getScene` (async) captura a cena +
// miniatura quando é uma publicação nova; na edição de metadados fica ausente.
// contextOwner = e-mail do dono do workspace ATIVO quando se está salvando de
// dentro do workspace de outra pessoa (colaborador). Habilita o destino "no
// workspace do dono".
export function TemplatePublishModal({ open, onClose, initial, getScene, onSaved, contextOwner }) {
  const { t } = useI18n()
  const { user, isFounder } = useAuth()
  const editing = !!initial?.id
  const canGlobal = isFounder || ['PRO', 'MASTER'].includes(user?.plan) // Pro + fundador publicam global
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [destination, setDestination] = useState('self') // owner | self | private | global
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Destinos disponíveis (onde o modelo vai ficar salvo).
  const DESTS = [
    ...(contextOwner ? [{ key: 'owner', icon: Users }] : []),
    { key: 'self', icon: Users },
    { key: 'private', icon: Lock },
    ...(canGlobal ? [{ key: 'global', icon: Globe }] : []),
  ]

  useEffect(() => {
    if (!open) return
    setName(initial?.name || '')
    setDescription(initial?.description || '')
    setCategory(initial?.category || '')
    // Destino inicial: edição deriva da visibilidade; criação começa no melhor
    // destino do contexto (workspace do dono se for colaborador, senão o próprio).
    const fromVis = initial ? (initial.visibility === 'global' ? 'global' : initial.visibility === 'only_me' ? 'private' : 'self') : contextOwner ? 'owner' : 'self'
    setDestination(fromVis)
    setError('')
    setSaving(false)
  }, [open, initial, contextOwner])

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      // Mapa destino → { visibility, targetOwner }.
      const map = {
        owner: { visibility: 'workspace', targetOwner: contextOwner },
        self: { visibility: 'workspace' },
        private: { visibility: 'only_me' },
        global: { visibility: 'global' },
      }
      const dest = map[destination] || map.self
      const payload = {
        id: initial?.id,
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        visibility: dest.visibility,
        targetOwner: dest.targetOwner,
      }
      // Publicação nova (ou "salvar como modelo"): captura a cena atual.
      if (getScene) {
        const captured = await getScene()
        if (!captured) throw new Error(t('drawings.templates.emptyScene'))
        // Guarda de tamanho: a cena vai como jsonb (limite prático da função serverless).
        const bytes = new Blob([JSON.stringify(captured.scene)]).size
        if (bytes > 3.5 * 1024 * 1024) throw new Error(t('drawings.templates.tooBig'))
        payload.scene = captured.scene
        payload.thumbnail = captured.thumbnail || undefined
      }
      const { template } = await api.templates.save(payload)
      onSaved?.(template)
      onClose()
    } catch (err) {
      setError(err?.message || 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('drawings.templates.editTitle') : t('drawings.templates.publishTitle')} wide>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">{t('drawings.templates.name')}</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('drawings.templates.namePlaceholder')} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">{t('drawings.templates.description')}</label>
          <textarea className={`${inputCls} min-h-20 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">{t('drawings.templates.category')}</label>
          <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('drawings.templates.categoryPlaceholder')} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t('drawings.templates.destination')}</label>
          <div className="flex flex-col gap-1.5">
            {DESTS.map(({ key, icon: Icon }) => {
              const active = destination === key
              const label = key === 'owner' ? t('drawings.templates.dest.owner', { owner: contextOwner }) : t(`drawings.templates.dest.${key}`)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDestination(key)}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                    active ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <Icon size={15} className={`mt-0.5 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
                  <span>
                    <span className={`block text-xs font-semibold ${active ? 'text-cyan-300' : 'text-slate-200'}`}>{label}</span>
                    <span className="block text-[11px] text-slate-500">{t(`drawings.templates.destHint.${key}`)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnGhost}>{t('common.cancel')}</button>
          <button type="submit" disabled={saving || !name.trim()} className={`${btnPrimary} flex items-center gap-2`}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {editing ? t('common.save') : t('drawings.templates.publish')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Navegador da biblioteca. mode 'new' (galeria: cria projeto) | 'insert' (editor:
// insere no canvas). onUse(templateMeta) fica a cargo de quem chama.
export function TemplateBrowser({ open, onClose, mode = 'new', onUse }) {
  const { t } = useI18n()
  const { user, isFounder } = useAuth()
  const myEmail = (user?.email || '').toLowerCase()
  const canManage = isFounder || ['PRO', 'MASTER'].includes(user?.plan)
  const [list, setList] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [editTpl, setEditTpl] = useState(null) // metadados em edição
  const [delTpl, setDelTpl] = useState(null)

  async function load() {
    try {
      const { templates } = await api.templates.list()
      setList(templates || [])
    } catch {
      setList([])
    }
  }
  useEffect(() => {
    if (open) { setList(null); load() }
  }, [open])

  async function use(tpl) {
    setBusyId(tpl.id)
    try {
      await onUse(tpl)
      api.templates.used(tpl.id).catch(() => {})
    } finally {
      setBusyId(null)
    }
  }

  async function remove(tpl) {
    try {
      await api.templates.remove(tpl.id)
    } catch {
      /* ignora */
    }
    setDelTpl(null)
    load()
  }

  const mine = (tpl) => isFounder || (tpl.ownerEmail || '').toLowerCase() === myEmail || (tpl.createdBy || '').toLowerCase() === myEmail

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('drawings.templates.browseTitle')} size="xl">
        {list === null ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <LayoutTemplate size={30} className="text-slate-700" />
            <p className="text-sm text-slate-400">{t('drawings.templates.empty')}</p>
            {canManage && <p className="text-xs text-slate-600">{t('drawings.templates.emptyHint')}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((tpl) => (
              <div key={tpl.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                <div className="flex aspect-video items-center justify-center border-b border-slate-800 bg-slate-950">
                  {tpl.thumbnail ? <img src={tpl.thumbnail} alt="" className="h-full w-full object-contain" /> : <LayoutTemplate size={26} className="text-slate-700" />}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{tpl.name}</p>
                    {mine(tpl) && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => setEditTpl(tpl)} title={t('common.edit')} className="text-slate-600 hover:text-slate-300"><Pencil size={13} /></button>
                        <button onClick={() => setDelTpl(tpl)} title={t('common.delete')} className="text-slate-600 hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                  {tpl.description && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{tpl.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {tpl.category && <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cyan-300">{tpl.category}</span>}
                    <VisBadge visibility={tpl.visibility} />
                    <span className="text-[10px] text-slate-600">{t('drawings.templates.uses', { n: tpl.uses })}</span>
                  </div>
                  <button
                    onClick={() => use(tpl)}
                    disabled={busyId === tpl.id}
                    className={`${btnPrimary} mt-3 flex items-center justify-center gap-2 py-1.5 text-xs`}
                  >
                    {busyId === tpl.id ? <Loader2 size={14} className="animate-spin" /> : mode === 'insert' ? <Plus size={14} /> : <Sparkles size={14} />}
                    {mode === 'insert' ? t('drawings.templates.insert') : t('drawings.templates.useNew')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <TemplatePublishModal open={editTpl !== null} onClose={() => setEditTpl(null)} initial={editTpl} onSaved={load} />
      <ConfirmDialog
        open={delTpl !== null}
        onClose={() => setDelTpl(null)}
        onConfirm={() => remove(delTpl)}
        title={t('drawings.templates.deleteTitle')}
        message={t('drawings.templates.deleteMsg', { name: delTpl?.name })}
      />
    </>
  )
}
