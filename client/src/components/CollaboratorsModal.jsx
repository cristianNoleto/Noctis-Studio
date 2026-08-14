import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Trash2, Tv, ChevronDown, Check } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { Modal, inputCls, btnPrimary } from './ui'

// Seletor de nível de acesso (Sem acesso / Ver / Editar).
export function AccessSelect({ label, value, onChange }) {
  const { t } = useI18n()
  return (
    <select className={`${inputCls} !w-full min-w-0 !py-2 text-xs`} title={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="none">{t('skillsLib.collab.none')}</option>
      <option value="view">{t('skillsLib.collab.view')}</option>
      <option value="edit">{t('skillsLib.collab.edit')}</option>
    </select>
  )
}

// Escopo por canal do acesso a Vídeos. value === null → todos os canais (padrão).
// Array → o colaborador só enxerga esses canais. Aparece só quando há acesso a
// vídeos. UI: um resumo clicável que expande a lista de canais em checkboxes.
export function ChannelScope({ channels, value, onChange }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const all = value == null
  const selected = new Set(all ? [] : value)
  const summary = all
    ? t('skillsLib.collab.allChannels')
    : t('skillsLib.collab.someChannels', { n: selected.size, total: channels.length })

  function setAll() {
    onChange(null)
  }
  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next]) // vazio = sem restrição efetiva (servidor trata [] como "todos")
  }

  if (!channels.length) return null
  return (
    <div className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-200">
        <Tv size={12} className="text-slate-500" />
        <span className="font-medium">{t('skillsLib.collab.channels')}:</span>
        <span className={all ? 'text-slate-400' : 'text-cyan-300'}>{summary}</span>
        <ChevronDown size={13} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-0.5 border-t border-slate-800 p-1.5">
          <button type="button" onClick={setAll} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${all ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-600'}`}>{all && <Check size={11} />}</span>
            {t('skillsLib.collab.allChannels')}
          </button>
          {channels.map((c) => {
            const on = selected.has(c.id)
            return (
              <button key={c.id} type="button" onClick={() => toggle(c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-600'}`}>{on && <Check size={11} />}</span>
                <span className="truncate">{c.name || t('skillsLib.collab.untitledChannel')}</span>
              </button>
            )
          })}
          <p className="px-2 pt-1 text-[10px] leading-snug text-slate-600">{t('skillsLib.collab.channelsHint')}</p>
        </div>
      )}
    </div>
  )
}

// Grid comum ao cabeçalho, ao form e às linhas — mantém tudo alinhado em colunas.
// Email ocupa o espaço flexível; os 4 seletores e o botão têm largura fixa.
const ROW = 'grid grid-cols-[minmax(13rem,1fr)_repeat(5,7.25rem)_2.25rem] items-center gap-2.5'

// Gerenciador de colaboradores do workspace: convida por e-mail e define o
// acesso a Vídeos / Skills / Referências por pessoa. Usado no menu do perfil
// (hub central) e como atalho na página de Skills.
export function CollaboratorsModal({ open, onClose, ownerEmail, isLocalMode }) {
  const db = useDb()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [skills, setSkills] = useState('view')
  const [references, setReferences] = useState('none')
  const [videos, setVideos] = useState('edit')
  const [board, setBoard] = useState('none')
  const [drawings, setDrawings] = useState('none')
  const [channelIds, setChannelIds] = useState(null) // null = todos os canais
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [savedId, setSavedId] = useState(null) // colaborador que acabou de salvar
  const [remote, setRemote] = useState([])
  const owner = (ownerEmail || '').toLowerCase()
  const mine = isLocalMode ? db.all('collaborators').filter((c) => (c.ownerEmail || '').toLowerCase() === owner) : remote
  // Canais do dono (não arquivados) para o escopo por canal.
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

  async function add(e) {
    e.preventDefault()
    const m = email.trim().toLowerCase()
    if (!m.includes('@')) return
    if (mine.some((c) => (c.memberEmail || '').toLowerCase() === m)) {
      setError(t('skillsLib.collab.dupe'))
      return
    }
    // Escopo por canal só faz sentido com acesso a vídeos.
    const scope = videos !== 'none' ? channelIds : null
    if (isLocalMode) db.insert('collaborators', { ownerEmail: owner, memberEmail: m, skills, references, videos, board, drawings, channelIds: scope })
    else {
      try {
        const res = await api.collaborators.save({ memberEmail: m, skills, references, videos, board, drawings, channelIds: scope })
        setInfo(res?.invited ? t('skillsLib.collab.invited', { email: m }) : '')
        refresh()
      } catch (err) {
        setError(err?.message || 'Erro')
        return
      }
    }
    setEmail('')
    setSkills('view')
    setReferences('none')
    setVideos('edit')
    setBoard('none')
    setChannelIds(null)
    setError('')
  }

  // Confirmação transitória "Alterações salvas ✓" por colaborador.
  function flashSaved(id) {
    setSavedId(id)
    clearTimeout(flashSaved._t)
    flashSaved._t = setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800)
  }

  async function setAccess(c, field, value) {
    if (isLocalMode) {
      db.update('collaborators', c.id, { [field]: value })
      flashSaved(c.id)
      return
    }
    // Otimista: atualiza a UI na hora e persiste em seguida (se falhar, reverte).
    setRemote((list) => list.map((x) => (x.id === c.id ? { ...x, [field]: value } : x)))
    try {
      // channelIds vai SEMPRE junto (senão o servidor o zeraria ao salvar outro campo).
      await api.collaborators.save({ memberEmail: c.memberEmail, skills: c.skills, references: c.references, videos: c.videos, board: c.board, drawings: c.drawings, channelIds: c.channelIds ?? null, [field]: value })
      flashSaved(c.id)
    } catch (e) {
      setError(e?.message || 'Erro ao salvar acesso.')
      refresh()
    }
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
      {/* Cabeçalho de colunas — rótulos aparecem só uma vez, alinhados ao grid */}
      <div className={`${ROW} px-1 pb-1.5`}>
        <span className="text-[11px] font-semibold text-slate-400">{t('skillsLib.collab.email')}</span>
        <span className="text-center text-[11px] font-semibold text-slate-400">{t('skillsLib.collab.videos')}</span>
        <span className="text-center text-[11px] font-semibold text-slate-400">{t('skillsLib.collab.references')}</span>
        <span className="text-center text-[11px] font-semibold text-slate-400">{t('skillsLib.collab.board')}</span>
        <span className="text-center text-[11px] font-semibold text-slate-400">{t('skillsLib.collab.drawings')}</span>
        <span className="text-center text-[11px] font-semibold text-slate-400">{t('skillsLib.collab.skills')}</span>
        <span />
      </div>
      <form onSubmit={add} className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
        <div className={ROW}>
          <input className={`${inputCls} !py-2`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('skillsLib.collab.emailPlaceholder')} />
          <AccessSelect label={t('skillsLib.collab.videos')} value={videos} onChange={setVideos} />
          <AccessSelect label={t('skillsLib.collab.references')} value={references} onChange={setReferences} />
          <AccessSelect label={t('skillsLib.collab.board')} value={board} onChange={setBoard} />
          <AccessSelect label={t('skillsLib.collab.drawings')} value={drawings} onChange={setDrawings} />
          <AccessSelect label={t('skillsLib.collab.skills')} value={skills} onChange={setSkills} />
          <button type="submit" title={t('skillsLib.collab.add')} className={`${btnPrimary} flex h-9 w-9 items-center justify-center !p-0`}>
            <UserPlus size={15} />
          </button>
        </div>
        {videos !== 'none' && <ChannelScope channels={ownerChannels} value={channelIds} onChange={setChannelIds} />}
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {info && <p className="mt-2 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2 text-xs text-green-400">{info}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{t('skillsLib.collab.inviteHint')}</p>

      <div className="mt-4 space-y-2">
        {mine.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">{t('skillsLib.collab.empty')}</p>
        ) : (
          mine.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <div className={ROW}>
                <div className="flex min-w-0 items-center gap-2 px-1">
                  <span className="truncate text-sm text-slate-200" title={c.memberEmail}>{c.memberEmail}</span>
                  {savedId === c.id && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                      <Check size={10} /> {t('skillsLib.collab.saved')}
                    </span>
                  )}
                </div>
                <AccessSelect label={t('skillsLib.collab.videos')} value={c.videos || 'none'} onChange={(v) => setAccess(c, 'videos', v)} />
                <AccessSelect label={t('skillsLib.collab.references')} value={c.references || 'none'} onChange={(v) => setAccess(c, 'references', v)} />
                <AccessSelect label={t('skillsLib.collab.board')} value={c.board || 'none'} onChange={(v) => setAccess(c, 'board', v)} />
                <AccessSelect label={t('skillsLib.collab.drawings')} value={c.drawings || 'none'} onChange={(v) => setAccess(c, 'drawings', v)} />
                <AccessSelect label={t('skillsLib.collab.skills')} value={c.skills || 'none'} onChange={(v) => setAccess(c, 'skills', v)} />
                <button onClick={() => removeCollab(c)} title={t('skillsLib.collab.remove')} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-500 transition-colors hover:border-red-500/40 hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
              {(c.videos || 'none') !== 'none' && <ChannelScope channels={ownerChannels} value={c.channelIds ?? null} onChange={(v) => setAccess(c, 'channelIds', v)} />}
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
