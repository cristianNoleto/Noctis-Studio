import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Trash2, Tv, Check, Layers, ChevronDown } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { Modal, inputCls, btnPrimary } from './ui'

// Seletor segmentado de nível de acesso: Sem acesso / Ver / Editar.
// `showShared` adiciona um 4º estado "Compart." (só Desenhos): a pessoa vê
// apenas os desenhos compartilhados por e-mail com ela. É definido ao compartilhar
// um desenho; aqui aparece como um estado que o dono pode manter ou trocar.
function LevelSelect({ value, onChange, showShared, full }) {
  const { t } = useI18n()
  const opts = [
    ['none', t('skillsLib.collab.none'), 'bg-slate-700 text-slate-200'],
    ['view', t('skillsLib.collab.view'), 'bg-sky-500/20 text-sky-300'],
    ['edit', t('skillsLib.collab.edit'), 'bg-cyan-500/20 text-cyan-300'],
  ]
  if (showShared || value === 'shared') opts.push(['shared', t('skillsLib.collab.sharedLevel'), 'bg-amber-500/20 text-amber-300'])
  return (
    <div className={`${full ? 'flex w-full' : 'flex w-full sm:inline-flex sm:w-auto'} rounded-lg border border-slate-700 bg-slate-950 p-0.5`}>
      {opts.map(([v, label, active]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          title={v === 'shared' ? t('skillsLib.collab.sharedLevelHint') : undefined}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${full ? 'flex-1 text-center' : 'flex-1 text-center sm:flex-none'} ${(value || 'none') === v ? active : 'text-slate-500 hover:text-slate-300'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Campo de área: rótulo em cima, seletor de nível (largura total) embaixo.
// Uniforme, então Desenhos (4 estados) fica igual aos demais no grid.
function AreaField({ label, value, onChange, showShared }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <span className="mb-1.5 block text-[11px] font-semibold text-slate-400">{label}</span>
      <LevelSelect value={value} onChange={onChange} showShared={showShared} full />
    </div>
  )
}

// Permissão de Vídeos por canal: "Todos os canais" (um nível para todos) ou
// "Por canal" (Ver/Editar/Sem acesso em cada canal — permite ver um e editar
// outro). value = mapa {channelId:'view'|'edit'} ou null (= todos os canais).
function ChannelPermissions({ channels, videosLevel, channelAccess, onSetAll, onSetChannel, perMode, onModeChange }) {
  const { t } = useI18n()
  const isPer = perMode
  if (!channels.length) {
    // Sem canais cadastrados → só o nível geral de vídeos.
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">{t('skillsLib.collab.videos')}</span>
        <LevelSelect value={videosLevel} onChange={onSetAll} />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <Tv size={13} className="text-cyan-400" /> {t('skillsLib.collab.videos')}
        </span>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-[11px]">
          <button type="button" onClick={() => onModeChange(false)} className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${!isPer ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            {t('skillsLib.collab.allChannels')}
          </button>
          <button type="button" onClick={() => onModeChange(true)} className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${isPer ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}>
            {t('skillsLib.collab.perChannel')}
          </button>
        </div>
      </div>

      {!isPer ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
          <span className="text-[11px] text-slate-400">{t('skillsLib.collab.allChannelsHint')}</span>
          <LevelSelect value={videosLevel} onChange={onSetAll} />
        </div>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
          {channels.map((ch) => (
            <div key={ch.id} className="flex flex-col gap-1.5 rounded-md px-1.5 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-300">
                <Layers size={12} className="shrink-0 text-slate-600" />
                <span className="truncate">{ch.name || t('skillsLib.collab.untitledChannel')}</span>
              </span>
              <LevelSelect value={(channelAccess || {})[ch.id] || 'none'} onChange={(lvl) => onSetChannel(ch.id, lvl)} />
            </div>
          ))}
          <p className="px-1.5 pt-0.5 text-[10px] leading-snug text-slate-600">{t('skillsLib.collab.channelsHint')}</p>
        </div>
      )}
    </div>
  )
}

// Resumo do acesso de um colaborador em chips (para a linha recolhida da lista).
function accessSummary(c, t) {
  const label = (v) => (v === 'edit' ? t('skillsLib.collab.edit') : v === 'view' ? t('skillsLib.collab.view') : v === 'shared' ? t('skillsLib.collab.sharedLevel') : '')
  const tone = (v) => (v === 'edit' ? 'bg-cyan-500/15 text-cyan-300' : v === 'shared' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-300')
  const chips = []
  const chCount = c.channelAccess ? Object.keys(c.channelAccess).length : 0
  if (chCount) chips.push({ text: `${t('skillsLib.collab.videos')}: ${chCount} ${t('skillsLib.collab.channels').toLowerCase()}`, tone: 'bg-cyan-500/15 text-cyan-300' })
  else if (c.videos && c.videos !== 'none') chips.push({ text: `${t('skillsLib.collab.videos')}: ${label(c.videos)}`, tone: tone(c.videos) })
  for (const [key, lbl] of [['references', t('skillsLib.collab.references')], ['board', t('skillsLib.collab.board')], ['drawings', t('skillsLib.collab.drawings')], ['skills', t('skillsLib.collab.skills')]]) {
    if (c[key] && c[key] !== 'none') chips.push({ text: `${lbl}: ${label(c[key])}`, tone: tone(c[key]) })
  }
  return chips
}

// Gerenciador de colaboradores do workspace: convida por e-mail e define o
// acesso a Vídeos (geral ou por canal) / Referências / Quadro / Desenhos /
// Skills por pessoa. Usado no menu do perfil e como atalho na página de Skills.
export function CollaboratorsModal({ open, onClose, ownerEmail, isLocalMode }) {
  const db = useDb()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [form, setForm] = useState({ videos: 'edit', references: 'none', board: 'none', drawings: 'none', skills: 'view' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [savedId, setSavedId] = useState(null)
  const [expandedId, setExpandedId] = useState(null) // colaborador aberto na lista
  const [remote, setRemote] = useState([])
  const [perModeIds, setPerModeIds] = useState(() => new Set()) // cards em modo "por canal"
  const owner = (ownerEmail || '').toLowerCase()
  const mine = isLocalMode ? db.all('collaborators').filter((c) => (c.ownerEmail || '').toLowerCase() === owner) : remote
  const ownerChannels = db.all('channels').filter((c) => !c.archived)

  const refresh = useCallback(async () => {
    if (isLocalMode) return
    try {
      const { collaborators } = await api.collaborators.list()
      setRemote(collaborators)
    } catch {
      /* ignora */
    }
  }, [isLocalMode])
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const AREAS = [
    ['references', t('skillsLib.collab.references')],
    ['board', t('skillsLib.collab.board')],
    ['drawings', t('skillsLib.collab.drawings')],
    ['skills', t('skillsLib.collab.skills')],
  ]

  async function add(e) {
    e.preventDefault()
    const m = email.trim().toLowerCase()
    if (!m.includes('@')) return
    if (mine.some((c) => (c.memberEmail || '').toLowerCase() === m)) {
      setError(t('skillsLib.collab.dupe'))
      return
    }
    const payload = { memberEmail: m, ...form, channelAccess: null }
    if (isLocalMode) db.insert('collaborators', { ownerEmail: owner, ...payload })
    else {
      try {
        const res = await api.collaborators.save(payload)
        setInfo(res?.invited ? t('skillsLib.collab.invited', { email: m }) : '')
        refresh()
      } catch (err) {
        setError(err?.message || 'Erro')
        return
      }
    }
    setEmail('')
    setForm({ videos: 'edit', references: 'none', board: 'none', drawings: 'none', skills: 'view' })
    setError('')
  }

  function flashSaved(id) {
    setSavedId(id)
    clearTimeout(flashSaved._t)
    flashSaved._t = setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800)
  }

  // Salva o colaborador com um patch mesclado (otimista na nuvem; direto no local).
  async function saveCollab(c, patch) {
    if (isLocalMode) {
      db.update('collaborators', c.id, patch)
      flashSaved(c.id)
      return
    }
    const merged = { ...c, ...patch }
    setRemote((list) => list.map((x) => (x.id === c.id ? merged : x)))
    try {
      await api.collaborators.save({
        memberEmail: c.memberEmail,
        skills: merged.skills,
        references: merged.references,
        videos: merged.videos,
        board: merged.board,
        drawings: merged.drawings,
        channelAccess: merged.channelAccess ?? null,
      })
      flashSaved(c.id)
    } catch (e) {
      setError(e?.message || 'Erro ao salvar acesso.')
      refresh()
    }
  }

  // Vídeos: nível geral (modo "todos os canais").
  function setVideosAll(c, level) {
    saveCollab(c, { videos: level, channelAccess: null })
  }
  // Vídeos: nível de UM canal (modo "por canal").
  function setChannelLevel(c, channelId, level) {
    const map = { ...(c.channelAccess || {}) }
    if (level === 'none') delete map[channelId]
    else map[channelId] = level
    const next = Object.keys(map).length ? map : null
    // videos geral derivado (para os gates que olham só o nível de vídeos).
    const derived = Object.values(map).includes('edit') ? 'edit' : Object.keys(map).length ? 'view' : 'none'
    saveCollab(c, { channelAccess: next, videos: derived })
  }
  function setMode(c, per) {
    setPerModeIds((s) => {
      const n = new Set(s)
      per ? n.add(c.id) : n.delete(c.id)
      return n
    })
    if (!per) saveCollab(c, { channelAccess: null, videos: c.videos && c.videos !== 'none' ? c.videos : 'view' })
  }

  async function removeCollab(c) {
    if (isLocalMode) db.remove('collaborators', c.id)
    else {
      await api.collaborators.remove(c.id)
      refresh()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('skillsLib.collab.title')} size="2xl">
      <p className="-mt-2 mb-4 text-xs leading-relaxed text-slate-500">{t('skillsLib.collab.subtitle')}</p>

      {/* Convite */}
      <form onSubmit={add} className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] p-3">
        <div className="flex items-center gap-2">
          <input className={`${inputCls} !py-2`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('skillsLib.collab.emailPlaceholder')} />
          <button type="submit" className={`${btnPrimary} flex shrink-0 items-center gap-1.5 !px-3.5`}>
            <UserPlus size={15} /> {t('skillsLib.collab.add')}
          </button>
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <AreaField label={t('skillsLib.collab.videos')} value={form.videos} onChange={(v) => setForm((f) => ({ ...f, videos: v }))} />
          {AREAS.map(([key, label]) => (
            <AreaField key={key} label={label} value={form[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{t('skillsLib.collab.perChannelAfter')}</p>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {info && <p className="mt-2 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2 text-xs text-green-400">{info}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{t('skillsLib.collab.inviteHint')}</p>

      {/* Colaboradores — lista enxuta que expande ao clicar */}
      <div className="mt-4 space-y-2">
        {mine.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">{t('skillsLib.collab.empty')}</p>
        ) : (
          mine.map((c) => {
            const per = perModeIds.has(c.id) || !!c.channelAccess
            const open = expandedId === c.id
            const chips = accessSummary(c, t)
            return (
              <div key={c.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                {/* Linha (resumo) */}
                <div className="flex items-center gap-2.5 p-2.5">
                  <button onClick={() => setExpandedId(open ? null : c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                      {(c.memberEmail || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200" title={c.memberEmail}>{c.memberEmail}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {chips.length === 0 ? (
                          <span className="text-[11px] text-slate-600">{t('skillsLib.collab.noAccess')}</span>
                        ) : (
                          chips.map((ch, i) => (
                            <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ch.tone}`}>{ch.text}</span>
                          ))
                        )}
                      </div>
                    </div>
                  </button>
                  {savedId === c.id && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                      <Check size={10} /> {t('skillsLib.collab.saved')}
                    </span>
                  )}
                  <button onClick={() => removeCollab(c)} title={t('skillsLib.collab.remove')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                  <button onClick={() => setExpandedId(open ? null : c.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200">
                    <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Detalhes (editar) */}
                {open && (
                  <div className="border-t border-slate-800 p-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-2.5">
                      <ChannelPermissions
                        channels={ownerChannels}
                        videosLevel={c.videos || 'none'}
                        channelAccess={c.channelAccess}
                        perMode={per}
                        onModeChange={(p) => setMode(c, p)}
                        onSetAll={(lvl) => setVideosAll(c, lvl)}
                        onSetChannel={(chId, lvl) => setChannelLevel(c, chId, lvl)}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {AREAS.map(([key, label]) => (
                        <AreaField key={key} label={label} value={c[key] || 'none'} onChange={(v) => saveCollab(c, { [key]: v })} showShared={key === 'drawings'} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
