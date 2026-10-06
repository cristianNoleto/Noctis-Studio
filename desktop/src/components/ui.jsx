import { useEffect } from 'react'
import { X } from 'lucide-react'

// Peças visuais do app (mesmas classes do site Noctis Studio).
export const inputCls =
  'w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50'
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40'
export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40'
export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-40'
export const iconBtn =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30'

export function Card({ className = '', children, ...rest }) {
  return <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 ${className}`} {...rest}>{children}</div>
}

export function PageHeader({ icon: Icon, kicker, title, accent, subtitle, right }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-slate-950 shadow-[0_4px_14px_rgba(0,242,254,0.22)]">
            <Icon size={21} />
          </div>
        )}
        <div>
          {kicker && <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-400">{kicker}</p>}
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            {title} {accent && <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">{accent}</span>}
          </h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

export function SectionLabel({ children, right }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{children}</p>
      {right}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, color = 'bg-cyan-500' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? color : 'bg-slate-700'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]'} ${
            value === o.value ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg', footer }) {
  useEffect(() => {
    if (!open) return undefined
    const k = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`fade-up w-full ${width} overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/60`}>
        {title && (
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
            <h3 className="font-semibold text-slate-100">{title}</h3>
            {onClose && <button onClick={onClose} className={iconBtn}><X size={16} /></button>}
          </div>
        )}
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-500"><Icon size={24} /></div>}
      <p className="font-semibold text-slate-300">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'cyan', className = '' }) {
  const tones = {
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    red: 'bg-red-500/10 text-red-400 border-red-500/25',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
    slate: 'bg-slate-800/70 text-slate-400 border-slate-700',
  }
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]} ${className}`}>{children}</span>
}

export function Field({ label, hint, children, right }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-slate-200">{label}</label>
        {right}
      </div>
      {hint && <p className="text-xs leading-relaxed text-slate-500">{hint}</p>}
      {children}
    </div>
  )
}

export function Spinner({ size = 18 }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" style={{ width: size, height: size }} />
}
