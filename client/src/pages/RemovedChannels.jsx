import { useState } from 'react'
import { ShieldAlert, Plus, CheckCircle2, HelpCircle } from 'lucide-react'
import { useDb } from '../lib/db'
import { Modal, inputCls, btnPrimary, btnGhost, formatCompact } from '../components/ui'
import { Field } from './channels/ChannelsList'

// Base curada — "hall da fama" de canais que sumiram. Não existe API que
// liste isso: os casos são cadastrados manualmente (painel admin) e, no
// futuro, alimentados pela detecção automática dos canais monitorados.
export default function RemovedChannels() {
  const db = useDb()
  const [addOpen, setAddOpen] = useState(false)
  const channels = [...db.all('removedChannels')].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Canais Removidos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Base curada de canais dark que caíram — estude os padrões para proteger os seus.
          </p>
        </div>
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={() => setAddOpen(true)}>
          <Plus size={16} />
          Registrar caso
        </button>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/90">
        ⚠️ Esta é uma base de referência alimentada manualmente. O YouTube não expõe canais removidos — os dados de inscritos e datas são aproximados.
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3.5">Canal</th>
              <th className="px-3 py-3.5">Nicho</th>
              <th className="px-3 py-3.5">Inscritos (aprox.)</th>
              <th className="px-3 py-3.5">Data da remoção</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-900/60">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                      <ShieldAlert size={16} />
                    </div>
                    <p className="font-medium text-slate-200">{c.name}</p>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{c.niche}</span>
                </td>
                <td className="px-3 py-3.5 font-semibold text-slate-200">{formatCompact(c.subs)}</td>
                <td className="px-3 py-3.5 text-slate-400">{new Date(c.removedAt + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-3.5">
                  {c.verified ? (
                    <span className="flex w-fit items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-400">
                      <CheckCircle2 size={11} />
                      Verificado
                    </span>
                  ) : (
                    <span className="flex w-fit items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      <HelpCircle size={11} />
                      Não confirmado
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddRemovedModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function AddRemovedModal({ open, onClose }) {
  const db = useDb()
  const [form, setForm] = useState({ name: '', niche: '', subs: '', removedAt: '', verified: false })

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save(e) {
    e.preventDefault()
    db.insert('removedChannels', {
      name: form.name,
      niche: form.niche,
      subs: Number(form.subs) || 0,
      removedAt: form.removedAt || new Date().toISOString().slice(0, 10),
      verified: form.verified,
    })
    setForm({ name: '', niche: '', subs: '', removedAt: '', verified: false })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar canal removido">
      <form onSubmit={save} className="space-y-4">
        <Field label="NOME DO CANAL">
          <input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="NICHO">
            <input className={inputCls} value={form.niche} onChange={(e) => set('niche', e.target.value)} />
          </Field>
          <Field label="INSCRITOS (APROX.)">
            <input className={inputCls} type="number" value={form.subs} onChange={(e) => set('subs', e.target.value)} />
          </Field>
        </div>
        <Field label="DATA APROXIMADA DA REMOÇÃO">
          <input className={inputCls} type="date" value={form.removedAt} onChange={(e) => set('removedAt', e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} className="h-4 w-4 rounded accent-cyan-500" />
          Caso verificado (confirmei que o canal caiu de fato)
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Registrar
          </button>
        </div>
      </form>
    </Modal>
  )
}
