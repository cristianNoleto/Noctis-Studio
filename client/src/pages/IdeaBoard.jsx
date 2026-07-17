import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import { Plus, Trash2, Settings2, Lightbulb, Package, FileText, CheckSquare, X, GripVertical, LayoutGrid, Minus, ChevronUp, ChevronDown } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { Modal, inputCls, btnPrimary, btnGhost, ConfirmDialog } from '../components/ui'

const COLUMN_COLORS = ['#00f2fe', '#f59e0b', '#22c55e', '#00b8cc', '#ef4444', '#ec4899']

export default function IdeaBoard() {
  const db = useDb()
  const { t } = useI18n()
  const [spaceId, setSpaceId] = useState(null) // null = Espaço Geral
  const [newColumnOpen, setNewColumnOpen] = useState(false)
  const [newSpaceOpen, setNewSpaceOpen] = useState(false)
  const [renameColumn, setRenameColumn] = useState(null)
  const [deleteColumn, setDeleteColumn] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const spaces = db.all('boardSpaces')
  const columns = [...db.all('boardColumns')].filter((c) => (c.spaceId ?? null) === spaceId).sort((a, b) => a.position - b.position)
  const cards = db.all('boardCards')
  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null

  function onDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const card = db.get('boardCards', active.id)
    if (card && card.columnId !== over.id) db.update('boardCards', active.id, { columnId: over.id })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Lightbulb size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{t('ideaBoard.title')}</h1>
            <p className="text-sm text-slate-500">{t('ideaBoard.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
            <LayoutGrid size={14} className="text-slate-500" />
            <select
              className="bg-transparent text-sm text-slate-200 focus:outline-none"
              value={spaceId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new') setNewSpaceOpen(true)
                else setSpaceId(e.target.value || null)
              }}
            >
              <option value="">{t('ideaBoard.generalSpace')}</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__new">{t('ideaBoard.newSpaceOption')}</option>
            </select>
          </div>
          <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setNewColumnOpen(true)}>
            <Plus size={16} />
            {t('ideaBoard.newColumn')}
          </button>
        </div>
      </div>

      {/* Colunas */}
      <DndContext sensors={sensors} onDragStart={({ active }) => setActiveId(active.id)} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              cards={cards.filter((c) => c.columnId === col.id)}
              onRename={() => setRenameColumn(col)}
              onDelete={() => setDeleteColumn(col)}
            />
          ))}
          {/* Coluna fantasma "+ Nova Coluna" */}
          <button
            onClick={() => setNewColumnOpen(true)}
            className="flex h-full min-h-[60vh] w-64 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-800 text-sm text-slate-600 transition-colors hover:border-cyan-500/40 hover:text-cyan-400"
          >
            + {t('ideaBoard.newColumn')}
          </button>
        </div>
        {/* Preview do card durante o arraste — renderizado acima de tudo, sem ser cortado */}
        <DragOverlay dropAnimation={null}>{activeCard ? <CardPreview card={activeCard} /> : null}</DragOverlay>
      </DndContext>

      <NewColumnModal open={newColumnOpen} onClose={() => setNewColumnOpen(false)} position={columns.length} spaceId={spaceId} />
      <NewSpaceModal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} onCreated={(id) => setSpaceId(id)} />
      <RenameColumnModal column={renameColumn} onClose={() => setRenameColumn(null)} />
      <ConfirmDialog
        open={deleteColumn !== null}
        onClose={() => setDeleteColumn(null)}
        onConfirm={() => {
          db.removeWhere('boardCards', (c) => c.columnId === deleteColumn.id)
          db.remove('boardColumns', deleteColumn.id)
        }}
        title={t('ideaBoard.deleteColumnTitle')}
        message={t('ideaBoard.deleteColumnMsg', { title: deleteColumn?.title })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
function Column({ column, cards, onRename, onDelete }) {
  const db = useDb()
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  // Ordena os cards por posição para permitir subir/descer dentro da coluna.
  const ordered = [...cards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  function move(cardId, dir) {
    const idx = ordered.findIndex((c) => c.id === cardId)
    const j = idx + dir
    if (j < 0 || j >= ordered.length) return
    const arr = [...ordered]
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    // Reescreve posições sequenciais (0..n) para a nova ordem valer sempre.
    arr.forEach((c, i) => {
      if (c.position !== i) db.update('boardCards', c.id, { position: i })
    })
  }

  function addCard(type) {
    db.insert('boardCards', {
      columnId: column.id,
      type,
      title: type === 'checklist' ? 'Nova checklist' : '',
      content: type === 'nota' ? '' : null,
      position: ordered.length,
    })
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-[60vh] w-72 shrink-0 flex-col rounded-xl border bg-slate-900/40 transition-colors ${
        isOver ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800'
      }`}
    >
      {/* Header da coluna */}
      <div className="flex items-center gap-2 border-b border-slate-800 px-3.5 py-3">
        <span className="h-4 w-1 rounded-full" style={{ background: column.color || '#00f2fe' }} />
        <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-200">{column.title}</p>
        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{cards.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onRename} title={t('ideaBoard.configColumn')} className="text-slate-600 hover:text-slate-300">
            <Settings2 size={13} />
          </button>
          <button onClick={onDelete} title={t('ideaBoard.deleteColumnTitle')} className="text-slate-600 hover:text-red-400">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-700">
            <Package size={22} />
            <p className="mt-2 text-xs">{t('ideaBoard.dragCards')}</p>
          </div>
        )}
        {ordered.map((card, i) => (
          <Card key={card.id} card={card} onMoveUp={() => move(card.id, -1)} onMoveDown={() => move(card.id, 1)} isFirst={i === 0} isLast={i === ordered.length - 1} />
        ))}
      </div>

      {/* Rodapé */}
      <div className="grid grid-cols-2 gap-2 border-t border-slate-800 p-2.5">
        <button
          onClick={() => addCard('nota')}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 py-2 text-xs text-slate-400 transition-colors hover:border-amber-500/40 hover:text-amber-400"
        >
          <FileText size={12} />{t('ideaBoard.addNote')}
        </button>
        <button
          onClick={() => addCard('checklist')}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 py-2 text-xs text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-400"
        >
          <CheckSquare size={12} />{t('ideaBoard.addChecklist')}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function MoveBtns({ onMoveUp, onMoveDown, isFirst, isLast }) {
  const { t } = useI18n()
  return (
    <>
      <button onClick={onMoveUp} disabled={isFirst} title={t('ideaBoard.moveUp')} className="text-slate-600 hover:text-slate-300 disabled:opacity-25">
        <ChevronUp size={12} />
      </button>
      <button onClick={onMoveDown} disabled={isLast} title={t('ideaBoard.moveDown')} className="text-slate-600 hover:text-slate-300 disabled:opacity-25">
        <ChevronDown size={12} />
      </button>
    </>
  )
}

function Card({ card, onMoveUp, onMoveDown, isFirst, isLast }) {
  const db = useDb()
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id })
  const [editing, setEditing] = useState(!card.content && card.type === 'nota' && !card.title)
  const [checklistOpen, setChecklistOpen] = useState(false)

  const items = db.all('checklistItems').filter((i) => i.cardId === card.id)
  const done = items.filter((i) => i.done).length
  const type = card.type || 'nota'
  // O movimento fica por conta do <DragOverlay>; aqui só esmaecemos a origem.
  const style = undefined
  void transform

  // ---- Nota (borda âmbar, editável com duplo clique) ----
  if (type === 'nota') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group rounded-lg border border-amber-500/40 bg-slate-950 p-3 ${isDragging ? 'opacity-30' : ''}`}
        onDoubleClick={() => setEditing(true)}
      >
        <div className="flex items-center gap-1.5">
          <button {...listeners} {...attributes} className="cursor-grab text-slate-600 active:cursor-grabbing" title={t('ideaBoard.dragBetween')}>
            <GripVertical size={12} />
          </button>
          <MoveBtns onMoveUp={onMoveUp} onMoveDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
          <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-400">
            <FileText size={9} />
            {t('ideaBoard.note')}
          </span>
          <button
            onClick={() => db.update('boardCards', card.id, { collapsed: !card.collapsed })}
            className="ml-auto text-slate-600 hover:text-slate-300"
            title={card.collapsed ? t('ideaBoard.expand') : t('ideaBoard.minimize')}
          >
            {card.collapsed ? <Plus size={12} /> : <Minus size={12} />}
          </button>
          <button
            onClick={() => db.remove('boardCards', card.id)}
            className="text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            title={t('ideaBoard.delete')}
          >
            <X size={12} />
          </button>
        </div>
        {card.collapsed ? (
          <p className="mt-2 truncate text-[11px] text-slate-500">{card.content || card.title || t('ideaBoard.emptyNote')}</p>
        ) : (
          <>
            {editing ? (
              <textarea
                autoFocus
                defaultValue={card.content || card.title || ''}
                onBlur={(e) => {
                  db.update('boardCards', card.id, { content: e.target.value, title: '' })
                  setEditing(false)
                }}
                className="mt-2 min-h-24 w-full resize-y rounded border border-slate-800 bg-slate-900 p-2 text-xs leading-relaxed text-slate-200 focus:outline-none"
              />
            ) : (
              <>
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-300">{card.content || card.title || '...'}</p>
                <p className="mt-2 text-[9px] text-slate-600">{t('ideaBoard.doubleClickEdit')}</p>
              </>
            )}
            {card.source && card.source !== 'manual' && (
              <span className="mt-2 inline-block rounded bg-black/30 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-slate-500">
                {{ niche_finder: 'NICHE FINDER', viral_videos: 'VÍDEOS VIRAIS', niche_doubling: 'DOBRA DE NICHO' }[card.source] || card.source}
              </span>
            )}
          </>
        )}
      </div>
    )
  }

  // ---- Checklist ----
  return (
    <>
      <div ref={setNodeRef} style={style} className={`group rounded-lg border border-cyan-500/30 bg-slate-950 p-3 ${isDragging ? 'opacity-30' : ''}`}>
        <div className="flex items-center gap-1.5">
          <button {...listeners} {...attributes} className="cursor-grab text-slate-600 active:cursor-grabbing" title={t('ideaBoard.dragBetween')}>
            <GripVertical size={12} />
          </button>
          <MoveBtns onMoveUp={onMoveUp} onMoveDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
          <span className="flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-cyan-400">
            <CheckSquare size={9} />
            {t('ideaBoard.checklist')}
          </span>
          <button
            onClick={() => db.update('boardCards', card.id, { collapsed: !card.collapsed })}
            className="ml-auto text-slate-600 hover:text-slate-300"
            title={card.collapsed ? t('ideaBoard.expand') : t('ideaBoard.minimize')}
          >
            {card.collapsed ? <Plus size={12} /> : <Minus size={12} />}
          </button>
          <button onClick={() => setChecklistOpen(true)} className="text-slate-600 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100" title={t('ideaBoard.edit')}>
            <Settings2 size={12} />
          </button>
          <button onClick={() => db.remove('boardCards', card.id)} className="text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100" title={t('ideaBoard.delete')}>
            <X size={12} />
          </button>
        </div>
        <p className="mt-2 truncate text-xs font-semibold text-slate-200">{card.title}</p>
        {card.collapsed ? (
          items.length > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              {done}/{items.length} {t('ideaBoard.tasks')}
            </p>
          )
        ) : (
          <>
            <div className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto">
              {items.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => db.update('checklistItems', item.id, { done: e.target.checked })}
                    className="h-3.5 w-3.5 shrink-0 rounded accent-cyan-500"
                  />
                  <span className={`text-[11px] ${item.done ? 'text-slate-600 line-through' : 'text-slate-300'}`}>{item.label}</span>
                </label>
              ))}
            </div>
            {items.length > 0 && (
              <p className="mt-2 text-[10px] text-slate-500">
                {t('ideaBoard.tasksCompleted', { done, total: items.length })}
              </p>
            )}
            {items.length === 0 && (
              <button onClick={() => setChecklistOpen(true)} className="mt-1.5 text-[10px] text-cyan-400 hover:underline">
                {t('ideaBoard.addTasks')}
              </button>
            )}
          </>
        )}
      </div>

      <ChecklistModal open={checklistOpen} onClose={() => setChecklistOpen(false)} card={card} items={items} />
    </>
  )
}

// Visual do card enquanto arrasta (dentro do DragOverlay) — não usa hooks de
// dnd, então nunca é cortado pelos containers com overflow.
function CardPreview({ card }) {
  const { t } = useI18n()
  const nota = (card.type || 'nota') === 'nota'
  return (
    <div className={`w-64 rotate-2 rounded-lg border bg-slate-950 p-3 shadow-2xl shadow-black/60 ${nota ? 'border-amber-500/60' : 'border-cyan-500/50'}`}>
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${nota ? 'bg-amber-500/15 text-amber-400' : 'bg-cyan-500/15 text-cyan-400'}`}>
        {nota ? <FileText size={9} /> : <CheckSquare size={9} />}
        {nota ? t('ideaBoard.note') : t('ideaBoard.checklist')}
      </span>
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-slate-300">{card.content || card.title || '...'}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
function ChecklistModal({ open, onClose, card, items }) {
  const db = useDb()
  const { t } = useI18n()
  const [title, setTitle] = useState(card.title)
  const [newItem, setNewItem] = useState('')

  function addItem(e) {
    e.preventDefault()
    if (!newItem.trim()) return
    db.insert('checklistItems', { cardId: card.id, label: newItem.trim(), done: false, position: items.length })
    setNewItem('')
  }

  return (
    <Modal open={open} onClose={onClose} title={t('ideaBoard.editChecklist')}>
      <input
        className={inputCls}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && db.update('boardCards', card.id, { title: title.trim() })}
      />
      <p className="mb-2 mt-5 text-xs font-semibold tracking-wide text-slate-400">{t('ideaBoard.tasksTitle')}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2">
            <input type="checkbox" checked={item.done} onChange={(e) => db.update('checklistItems', item.id, { done: e.target.checked })} className="h-4 w-4 rounded accent-cyan-500" />
            <span className={`flex-1 text-sm ${item.done ? 'text-slate-600 line-through' : 'text-slate-300'}`}>{item.label}</span>
            <button onClick={() => db.remove('checklistItems', item.id)} className="text-slate-600 hover:text-red-400">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} className="mt-2 flex gap-2">
        <input className={inputCls} placeholder={t('ideaBoard.newTask')} value={newItem} onChange={(e) => setNewItem(e.target.value)} />
        <button type="submit" className={`${btnGhost} shrink-0`}>
          <Plus size={15} />
        </button>
      </form>
    </Modal>
  )
}

function NewColumnModal({ open, onClose, position, spaceId }) {
  const db = useDb()
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(COLUMN_COLORS[0])

  function create(e) {
    e.preventDefault()
    if (!title.trim()) return
    db.insert('boardColumns', { title: title.trim(), color, position, spaceId })
    setTitle('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('ideaBoard.newColumn')}>
      <form onSubmit={create} className="space-y-4">
        <input className={inputCls} autoFocus placeholder={t('ideaBoard.columnNamePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          {COLUMN_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary}>
            {t('ideaBoard.createColumn')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RenameColumnModal({ column, onClose }) {
  const db = useDb()
  const { t } = useI18n()
  const [title, setTitle] = useState('')

  if (!column) return null

  return (
    <Modal open onClose={onClose} title={t('ideaBoard.configColumnTitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) db.update('boardColumns', column.id, { title: title.trim() })
          onClose()
        }}
        className="space-y-4"
      >
        <input className={inputCls} autoFocus placeholder={column.title} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          {COLUMN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => db.update('boardColumns', column.id, { color: c })}
              className={`h-7 w-7 rounded-full border-2 ${column.color === c ? 'border-white' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('ideaBoard.close')}
          </button>
          <button type="submit" className={btnPrimary}>
            {t('ideaBoard.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function NewSpaceModal({ open, onClose, onCreated }) {
  const db = useDb()
  const { t } = useI18n()
  const [name, setName] = useState('')

  function create(e) {
    e.preventDefault()
    if (!name.trim()) return
    const space = db.insert('boardSpaces', { name: name.trim() })
    setName('')
    onCreated(space.id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('ideaBoard.newSpaceTitle')}>
      <form onSubmit={create} className="space-y-4">
        <p className="text-sm text-slate-500">{t('ideaBoard.spaceDesc')}</p>
        <input className={inputCls} autoFocus placeholder={t('ideaBoard.spaceNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary}>
            {t('ideaBoard.createSpace')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
