import { useEffect, useState } from 'react'
import { Users, ArrowRight, X, CornerUpLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'

// Aviso de descoberta: muitos colaboradores não sabem que precisam TROCAR de
// workspace para ver os canais do dono que os convidou. Este banner deixa isso
// explícito no topo do conteúdo:
//  - No próprio workspace, com acesso a outro(s): convida a acessar, com botão
//    que troca direto (dispensável, lembra por dono).
//  - Já dentro do workspace de outro: mostra em qual está + "voltar ao meu".
const DISMISS_KEY = 'noctis_ws_invite_dismissed'

function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
  } catch {
    return []
  }
}

export default function WorkspaceInviteBanner() {
  const db = useDb()
  const { t } = useI18n()
  const [list, setList] = useState(null)
  const [dismissed, setDismissed] = useState(readDismissed)
  const active = db.activeWorkspace()

  useEffect(() => {
    let alive = true
    api.workspace
      .workspaces()
      .then(({ workspaces }) => alive && setList(workspaces || []))
      .catch(() => alive && setList([]))
    return () => {
      alive = false
    }
  }, [db])

  if (!list) return null
  const shared = list.filter((w) => !w.self)
  if (shared.length === 0) return null

  // Estado 2: já estou no workspace de outro → contexto + voltar ao meu.
  if (active) {
    return (
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-sm text-cyan-100">
          <Users size={18} className="shrink-0 text-cyan-400" />
          <span>{t('workspaceBanner.inShared', { owner: active })}</span>
        </div>
        <button
          onClick={() => db.switchWorkspace(null)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 active:scale-[0.98]"
        >
          <CornerUpLeft size={15} />
          {t('workspaceBanner.backToMine')}
        </button>
      </div>
    )
  }

  // Estado 1: no MEU workspace, mas fui convidado para outro(s).
  const pending = shared.filter((w) => !dismissed.includes(w.ownerEmail))
  if (pending.length === 0) return null

  function dismiss() {
    const next = [...new Set([...dismissed, ...pending.map((w) => w.ownerEmail)])]
    setDismissed(next)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
    } catch {
      /* ignora */
    }
  }

  return (
    <div className="relative mb-4 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 px-4 py-3.5 pr-10">
      <button
        onClick={dismiss}
        aria-label={t('workspaceBanner.dismiss')}
        className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
      >
        <X size={15} />
      </button>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
          <Users size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{t('workspaceBanner.title')}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-400">
            {pending.length === 1
              ? t('workspaceBanner.invitedOne', { owner: pending[0].ownerEmail })
              : t('workspaceBanner.invitedMany', { n: pending.length })}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {pending.map((w) => (
              <button
                key={w.ownerEmail}
                onClick={() => db.switchWorkspace(w.ownerEmail)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-[13px] font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 active:scale-[0.98]"
              >
                {t('workspaceBanner.access', { owner: w.ownerEmail })}
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
