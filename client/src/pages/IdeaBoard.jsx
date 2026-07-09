import { useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import { Plus, Trash2, Palette, CheckSquare, GripVertical, X } from 'lucide-react'
import { useDb } from '../lib/db'
import { Modal, inputCls, btnPrimary, btnGhost, ConfirmDialog } from '../components/ui'

const CARD_COLORS = ['#1e293b', '#3b2f4b', '#4b2f2f', '#2f4b3a', '#4b452f', '#2f3d4b', '#41304f']
const COLUMN_COLORS = ['#22d3ee', '#f59e0b', '#22c55e', '#38bdf8', '#ef4444', '#ec4899']

export default function IdeaBoard() {
  const db = useDb()
  const [newColumnOpen, setNewColumnOpen] = useState(false)
  const [deleteColumn, setDeleteColumn] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const columns = [...db.all('boardColumns')].sort((a, b) => a.position - b.position)
  const cards = db.all('boardCards')

  function onDragEnd({ active, over }) {
    if (!over) return
    const card = db.get('boardCards', active.id)
    if (card && card.columnId !== over.id) {
      db.update('boardCards', active.id, { columnId: over.id })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Quadro de Ideias</h1>
          <p className="mt-1 text-sm text-slate-500">Arraste os cards entre as colunas para organizar sua produção.</p>
        </div>
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setNewColumnOpen(true)}>
          <Plus size={16} />
          Nova Coluna
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <Column key={col.id} column={col} cards={cards.filter((c) => c.columnId === col.id)} onDelete={() => setDeleteColumn(col)} />
          ))}
        </div>
      </DndContext>

      <NewColumnModal open={newColumnOpen} onClose={() => setNewColumnOpen(false)} position={columns.length} />
      <ConfirmDialog
        open={deleteColumn !== null}
        onClose={() => setDeleteColumn(null)}
        onConfirm={() => {
          db.removeWhere('boardCards', (c) => c.columnId === deleteColumn.id)
          db.remove('boardColumns', deleteColumn.id)
        }}
        title="Excluir coluna"
        message={`Excluir "${deleteColumn?.title}" apaga também todos os cards dentro dela.`}
      />
    </div>
  )
}

function Column({ column, cards, onDelete }) {
  const db = useDb()
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  function addCard(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    db.insert('boardCards', { columnId: column.id, title: newTitle.trim(), color: CARD_COLORS[0], position: cards.length })
    setNewTitle('')
    setAdding(false)
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-slate-900/40 transition-colors ${
        isOver ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-3.5 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: column.color }} />
        <p className="text-sm font-semibold text-slate-200">{column.title}</p>
        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{cards.length}</span>
        <button onClick={onDelete} title="Excluir coluna" className="ml-auto text-slate-600 hover:text-red-400">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {cards.map((card) => (
          <Card key={card.id} card={card} />
        ))}
        {adding ? (
          <form onSubmit={addCard} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
            <input
              autoFocus
              className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
              placeholder="Título da ideia..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={() => !newTitle.trim() && setAdding(false)}
            />
            <div className="mt-2 flex gap-1.5">
              <button type="submit" className="rounded bg-cyan-500 px-2 py-1 text-[11px] font-semibold text-white">
                Adicionar
              </button>
              <button type="button" className="rounded px-2 py-1 text-[11px] text-slate-500" onClick={() => setAdding(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-500 hover:border-cyan-500/40 hover:text-cyan-400"
          >
            <Plus size={13} />
            Novo card
          </button>
        )}
      </div>
    </div>
  )
}

function Card({ card }) {
  const db = useDb()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id })
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const items = db.all('checklistItems').filter((i) => i.cardId === card.id)
  const done = items.filter((i) => i.done).length

  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ ...style, background: card.color || CARD_COLORS[0] }}
        className={`group rounded-lg border border-white/5 p-3 ${isDragging ? 'opacity-80 shadow-2xl' : ''}`}
      >
        <div className="flex items-start gap-1.5">
          <button {...listeners} {...attributes} className="mt-0.5 cursor-grab text-slate-500 active:cursor-grabbing" title="Arrastar">
            <GripVertical size={13} />
          </button>
          <p className="flex-1 text-sm font-medium leading-snug text-slate-100">{card.title}</p>
          <button onClick={() => setMenuOpen((v) => !v)} className="text-slate-500 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100">
            <Palette size={13} />
          </button>
          <button onClick={() => setEditOpen(true)} className="text-slate-500 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100" title="Checklist">
            <CheckSquare size={13} />
          </button>
          <button onClick={() => db.remove('boardCards', card.id)} className="text-slate-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100" title="Excluir">
            <X size={13} />
          </button>
        </div>

        {menuOpen && (
          <div className="mt-2 flex gap-1.5">
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  db.update('boardCards', card.id, { color: c })
                  setMenuOpen(false)
                }}
                className="h-5 w-5 rounded-full border border-white/20"
                style={{ background: c }}
              />
            ))}
          </div>
        )}

        {items.length > 0 && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
            <CheckSquare size={11} />
            {done}/{items.length} tarefas completadas
          </p>
        )}
        {card.source && card.source !== 'manual' && (
          <span className="mt-2 inline-block rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-slate-400">
            {{ niche_finder: 'NICHE FINDER', viral_videos: 'VÍDEOS VIRAIS', niche_doubling: 'DOBRA DE NICHO' }[card.source] || card.source}
          </span>
        )}
      </div>

      <CardEditModal open={editOpen} onClose={() => setEditOpen(false)} card={card} items={items} />
    </>
  )
}

function CardEditModal({ open, onClose, card, items }) {
  const db = useDb()
  const [title, setTitle] = useState(card.title)
  const [newItem, setNewItem] = useState('')

  function addItem(e) {
    e.preventDefault()
    if (!newItem.trim()) return
    db.insert('checklistItems', { cardId: card.id, label: newItem.trim(), done: false, position: items.length })
    setNewItem('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar Card">
      <input
        className={inputCls}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && db.update('boardCards', card.id, { title: title.trim() })}
      />

      <p className="mb-2 mt-5 text-xs font-semibold tracking-wide text-slate-400">CHECKLIST</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => db.update('checklistItems', item.id, { done: e.target.checked })}
              className="h-4 w-4 rounded accent-cyan-500"
            />
            <span className={`flex-1 text-sm ${item.done ? 'text-slate-600 line-through' : 'text-slate-300'}`}>{item.label}</span>
            <button onClick={() => db.remove('checklistItems', item.id)} className="text-slate-600 hover:text-red-400">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} className="mt-2 flex gap-2">
        <input className={inputCls} placeholder="Nova tarefa..." value={newItem} onChange={(e) => setNewItem(e.target.value)} />
        <button type="submit" className={`${btnGhost} shrink-0`}>
          <Plus size={15} />
        </button>
      </form>
    </Modal>
  )
}

function NewColumnModal({ open, onClose, position }) {
  const db = useDb()
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(COLUMN_COLORS[0])

  function create(e) {
    e.preventDefault()
    if (!title.trim()) return
    db.insert('boardColumns', { title: title.trim(), color, position })
    setTitle('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Coluna">
      <form onSubmit={create} className="space-y-4">
        <input className={inputCls} autoFocus placeholder="Nome da coluna" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          {COLUMN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Criar Coluna
          </button>
        </div>
      </form>
    </Modal>
  )
}
