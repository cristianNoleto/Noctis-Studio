import { useState } from 'react'
import { HelpCircle, ChevronDown, Tv, Compass, GitBranch, TrendingUp, KeyRound, Lightbulb, Mic, Eye, ShieldAlert, FileText } from 'lucide-react'
import { useI18n } from '../i18n'

// Ícone + chave i18n (título/corpo vêm de help.sections.<key>)
const SECTIONS = [
  { icon: Tv, key: 'channels' },
  { icon: KeyRound, key: 'apiKeys' },
  { icon: Compass, key: 'nicheFinder' },
  { icon: TrendingUp, key: 'viral' },
  { icon: GitBranch, key: 'doubling' },
  { icon: Lightbulb, key: 'ideas' },
  { icon: Mic, key: 'tools' },
  { icon: Eye, key: 'privacy' },
  { icon: ShieldAlert, key: 'removed' },
  { icon: FileText, key: 'admin' },
]

export default function Help() {
  const { t } = useI18n()
  const [open, setOpen] = useState(0)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
          <HelpCircle size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('help.title')}</h1>
          <p className="text-sm text-slate-500">{t('help.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {SECTIONS.map((s, i) => (
          <div key={s.key} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-900/60">
              <s.icon size={17} className="shrink-0 text-cyan-400" />
              <p className="flex-1 font-semibold text-slate-100">{t(`help.sections.${s.key}.title`)}</p>
              <ChevronDown size={16} className={`text-slate-500 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="border-t border-slate-800 px-5 py-4 text-sm leading-relaxed text-slate-400">{t(`help.sections.${s.key}.body`)}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
