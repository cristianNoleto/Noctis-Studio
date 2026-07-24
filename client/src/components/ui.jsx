import { useEffect } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '../i18n'

export const inputCls =
  'w-full rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500'

export const btnPrimary =
  'rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed'

export const btnGhost =
  'rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800'

export const btnDanger =
  'rounded-lg bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20'

export function Modal({ open, onClose, title, children, wide, size }) {
  const maxW = size === '2xl' ? 'max-w-6xl' : size === 'xl' ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-md'
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            className={`max-h-[85vh] w-full ${maxW} overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
              <button onClick={onClose} aria-label={t('common.close')} className="text-slate-500 hover:text-slate-300">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Drawer({ open, onClose, title, children, actions }) {
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
              <h3 className="truncate text-base font-semibold text-slate-100">{title}</h3>
              <div className="flex items-center gap-2">
                {actions}
                <button onClick={onClose} aria-label={t('common.close')} className="ml-2 text-slate-500 hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, danger = true }) {
  const { t } = useI18n()
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-400">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          className={danger ? btnDanger : btnPrimary}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel || t('common.delete')}
        </button>
      </div>
    </Modal>
  )
}

// Score circular 0–100 com gradiente vermelho → amarelo → verde.
export function ScoreRing({ score, size = 44 }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score ?? 0))
  const hue = Math.round((pct / 100) * 120) // 0 = vermelho, 120 = verde
  const color = `hsl(${hue} 85% 55%)`
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color }}>
        {score == null ? '—' : pct}
      </span>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
          <Icon size={26} />
        </div>
      )}
      <p className="font-semibold text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatusBadge({ status }) {
  const { t } = useI18n()
  const map = {
    planning: { key: 'planning', cls: 'bg-slate-700/40 text-slate-300' },
    production: { key: 'production', cls: 'bg-amber-500/15 text-amber-400' },
    finished: { key: 'finished', cls: 'bg-cyan-500/15 text-cyan-400' },
    scheduled: { key: 'scheduled', cls: 'bg-sky-500/15 text-sky-400' },
    published: { key: 'published', cls: 'bg-green-500/15 text-green-400' },
  }
  const { key, cls } = map[status] || map.planning
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{t(`common.status.${key}`)}</span>
}

export function SectionTitle({ children, right }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-bold text-slate-100">{children}</h2>
      {right}
    </div>
  )
}

export function formatCompact(n) {
  if (n == null) return '—'
  return Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
