import { Lock, Users, Eye } from 'lucide-react'
import { useI18n } from '../i18n'
import { inputCls } from './ui'

// Visibilidade por item (referências / cards do quadro). Níveis:
//   workspace = todos os colaboradores do dono (padrão, comportamento antigo)
//   specific  = só os e-mails autorizados
//   only_me   = ninguém além do dono
// Reaproveita os textos das skills (skillsLib.form.vis* / visShort).
export const ITEM_VISIBILITIES = ['workspace', 'specific', 'only_me']

export function visIcon(v) {
  return v === 'only_me' ? Lock : v === 'specific' ? Eye : Users
}

const parseEmails = (s) =>
  (s || '')
    .split(/[,\n;]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'))

// Badge compacto (aparece só quando não é o padrão 'workspace').
export function VisibilityBadge({ visibility }) {
  const { t } = useI18n()
  if (!visibility || visibility === 'workspace') return null
  const Icon = visIcon(visibility)
  return (
    <span
      title={t(`skillsLib.visShort.${visibility}`)}
      className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400"
    >
      <Icon size={9} />
      {t(`skillsLib.visShort.${visibility}`)}
    </span>
  )
}

// Controle de edição (só o dono usa). value = visibility atual, emails = array.
// onChange(visibility, allowedEmailsArray).
export function VisibilityControl({ value = 'workspace', emails = [], onChange }) {
  const { t } = useI18n()
  const vis = value || 'workspace'
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-semibold tracking-wide text-slate-500">{t('skillsLib.form.visibility')}</label>
      {/* Botões em vez de <select> nativo: o clique é capturado de forma
          confiável mesmo dentro de menus que fecham ao clicar fora (o select
          nativo às vezes fechava o menu antes de registrar a escolha). */}
      <div className="flex flex-col gap-1">
        {ITEM_VISIBILITIES.map((v) => {
          const Icon = visIcon(v)
          const active = vis === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v, v === 'specific' ? emails : [])}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                active ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Icon size={12} />
              {t(`skillsLib.form.vis${v === 'only_me' ? 'OnlyMe' : v.charAt(0).toUpperCase() + v.slice(1)}`)}
            </button>
          )
        })}
      </div>
      {vis === 'specific' && (
        <input
          className={`${inputCls} !py-1.5 text-xs`}
          placeholder={t('skillsLib.form.allowedEmails')}
          defaultValue={(emails || []).join(', ')}
          onBlur={(e) => onChange('specific', parseEmails(e.target.value))}
        />
      )}
    </div>
  )
}
