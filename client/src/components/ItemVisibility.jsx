import { useEffect, useState } from 'react'
import { Lock, Users, Eye, Plus, X, Loader2, Mail } from 'lucide-react'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
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
export function VisibilityControl({ value = 'workspace', emails = [], onChange, area }) {
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
      {vis === 'specific' && <EmailChips emails={emails} area={area} onChange={(list) => onChange('specific', list)} />}
    </div>
  )
}

// Campo de e-mails autorizados: digita + Enter (ou botão) adiciona um chip; o
// commit é IMEDIATO (não depende de blur), então funciona mesmo dentro de menus
// que fecham ao clicar fora. Cada e-mail vira um chip removível.
function EmailChips({ emails = [], onChange, area }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState(null) // { kind, email } feedback do convite
  const [granting, setGranting] = useState(false)
  // Cópia local OTIMISTA: a UI reage na hora (chip some/entra instantâneo),
  // mesmo que o consumidor persista via rede (ex.: Drawings faz save + reload).
  // Ressincroniza quando o prop muda de fora.
  const [list, setList] = useState(Array.isArray(emails) ? emails : [])
  useEffect(() => {
    setList(Array.isArray(emails) ? emails : [])
  }, [emails])

  function commit(next) {
    setList(next)
    onChange(next)
  }
  // Ao liberar o item para um e-mail, garante o acesso de colaborador à área e
  // convida quem ainda não tem conta (comportamento escolhido pelo usuário).
  async function grant(added) {
    if (!area || !added.length) return
    setGranting(true)
    try {
      let invited = false
      let noAccount = false
      for (const email of added) {
        const r = await api.collaborators.grant(email, area)
        if (r?.invited) invited = true
        if (r && r.hasAccount === false) noAccount = true
      }
      setNotice({ kind: invited ? 'invited' : noAccount ? 'noAccount' : 'granted', email: added[added.length - 1] })
    } catch (e) {
      setNotice({ kind: 'error', email: added[0], msg: e?.message })
    } finally {
      setGranting(false)
    }
  }
  function add() {
    const additions = parseEmails(draft).filter((e) => !list.includes(e))
    const next = [...new Set([...list, ...parseEmails(draft)])]
    setDraft('')
    if (next.length !== list.length) {
      commit(next)
      grant(additions)
    }
  }
  function removeAt(i) {
    commit(list.filter((_, idx) => idx !== i))
  }
  const valid = parseEmails(draft).length > 0

  return (
    <div className="space-y-1.5">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {list.map((e, i) => (
            <span key={`${e}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-200">
              {e}
              <button type="button" onClick={() => removeAt(i)} className="text-slate-400 hover:text-red-400" aria-label="remover">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ',') {
              ev.preventDefault()
              add()
            }
          }}
          onBlur={add}
          className={`${inputCls} !py-1.5 text-xs`}
          placeholder={t('skillsLib.form.allowedEmails')}
        />
        <button
          type="button"
          onClick={add}
          disabled={!valid || granting}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-40"
        >
          {granting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {t('common.add') || 'Adicionar'}
        </button>
      </div>
      {notice && (
        <p className={`flex items-start gap-1.5 text-[11px] leading-snug ${notice.kind === 'error' ? 'text-red-400' : notice.kind === 'invited' || notice.kind === 'noAccount' ? 'text-amber-300' : 'text-emerald-300'}`}>
          <Mail size={12} className="mt-0.5 shrink-0" />
          <span>
            {notice.kind === 'invited' && t('itemVis.invited', { email: notice.email })}
            {notice.kind === 'noAccount' && t('itemVis.noAccount', { email: notice.email })}
            {notice.kind === 'granted' && t('itemVis.granted', { email: notice.email })}
            {notice.kind === 'error' && (notice.msg || t('itemVis.grantError'))}
          </span>
        </p>
      )}
    </div>
  )
}
