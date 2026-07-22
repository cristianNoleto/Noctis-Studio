import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { Modal, inputCls, btnPrimary } from './ui'

// Seletor de nível de acesso (Sem acesso / Ver / Editar).
export function AccessSelect({ label, value, onChange, compact }) {
  const { t } = useI18n()
  return (
    <div>
      {!compact && <label className="mb-1 block text-[11px] font-semibold text-slate-400">{label}</label>}
      <select className={`${inputCls} !w-28 !py-2 text-xs`} title={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="none">{t('skillsLib.collab.none')}</option>
        <option value="view">{t('skillsLib.collab.view')}</option>
        <option value="edit">{t('skillsLib.collab.edit')}</option>
      </select>
    </div>
  )
}

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
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [remote, setRemote] = useState([])
  const owner = (ownerEmail || '').toLowerCase()
  const mine = isLocalMode ? db.all('collaborators').filter((c) => (c.ownerEmail || '').toLowerCase() === owner) : remote

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
    if (isLocalMode) db.insert('collaborators', { ownerEmail: owner, memberEmail: m, skills, references, videos, board })
    else {
      try {
        const res = await api.collaborators.save({ memberEmail: m, skills, references, videos, board })
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
    setError('')
  }

  async function setAccess(c, field, value) {
    if (isLocalMode) {
      db.update('collaborators', c.id, { [field]: value })
      return
    }
    // Otimista: atualiza a UI na hora e persiste em seguida (se falhar, reverte).
    setRemote((list) => list.map((x) => (x.id === c.id ? { ...x, [field]: value } : x)))
    try {
      await api.collaborators.save({ memberEmail: c.memberEmail, skills: c.skills, references: c.references, videos: c.videos, board: c.board, [field]: value })
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
    <Modal open={open} onClose={onClose} title={t('skillsLib.collab.title')} wide>
      <p className="-mt-2 mb-4 text-xs leading-relaxed text-slate-500">{t('skillsLib.collab.subtitle')}</p>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <label className="mb-1 block text-[11px] font-semibold text-slate-400">{t('skillsLib.collab.email')}</label>
          <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com" />
        </div>
        <AccessSelect label={t('skillsLib.collab.videos')} value={videos} onChange={setVideos} />
        <AccessSelect label={t('skillsLib.collab.references')} value={references} onChange={setReferences} />
        <AccessSelect label={t('skillsLib.collab.board')} value={board} onChange={setBoard} />
        <AccessSelect label={t('skillsLib.collab.skills')} value={skills} onChange={setSkills} />
        <button type="submit" className={`${btnPrimary} flex items-center gap-1.5`}>
          <UserPlus size={14} />
          {t('skillsLib.collab.add')}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {info && <p className="mt-2 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2 text-xs text-green-400">{info}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{t('skillsLib.collab.inviteHint')}</p>

      <div className="mt-4 space-y-2">
        {mine.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">{t('skillsLib.collab.empty')}</p>
        ) : (
          mine.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2.5">
              <span className="min-w-40 flex-1 truncate text-sm text-slate-200">{c.memberEmail}</span>
              <AccessSelect label={t('skillsLib.collab.videos')} value={c.videos || 'none'} onChange={(v) => setAccess(c, 'videos', v)} compact />
              <AccessSelect label={t('skillsLib.collab.references')} value={c.references || 'none'} onChange={(v) => setAccess(c, 'references', v)} compact />
              <AccessSelect label={t('skillsLib.collab.board')} value={c.board || 'none'} onChange={(v) => setAccess(c, 'board', v)} compact />
              <AccessSelect label={t('skillsLib.collab.skills')} value={c.skills || 'none'} onChange={(v) => setAccess(c, 'skills', v)} compact />
              <button onClick={() => removeCollab(c)} title={t('skillsLib.collab.remove')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-500 hover:text-red-400">
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
