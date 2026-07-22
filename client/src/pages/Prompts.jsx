import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Star, Copy, Trash2, Pencil, Search, FileText, MoreVertical, X, Globe, Check, Sparkles, Captions, Bot, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Bookmark, Download, PlayCircle, ListChecks, Loader2, ImagePlus, Video as VideoIcon, Lock, Users, Eye, UserPlus } from 'lucide-react'
import { useDb } from '../lib/db'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { downloadFile } from '../lib/text'
import { Modal, inputCls, btnPrimary, btnGhost, EmptyState, ConfirmDialog } from '../components/ui'
import { PrivacyScope, PageEye, Masked } from '../components/privacy'
import { Field } from './channels/ChannelsList'

const SKILL_CATEGORIES = ['generation', 'visual', 'camera']
const NEW_BADGE_MS = 14 * 86_400_000 // "Nova" nos primeiros 14 dias

// Visibilidade das skills. 'global' = catálogo oficial (só fundador publica);
// 'workspace' = colaboradores do dono; 'specific' = lista de e-mails; 'only_me'.
const SKILL_VISIBILITIES = ['global', 'workspace', 'specific', 'only_me']

function visibilityIcon(v) {
  return v === 'only_me' ? Lock : v === 'workspace' ? Users : v === 'specific' ? Eye : Globe
}

// Regra de visibilidade (mesma lógica usada no servidor): o fundador vê tudo;
// o dono vê a própria; global todos; specific pela lista; workspace se o
// espectador é colaborador (com acesso a skills) do dono.
function canSeeSkill(s, email, isFounder, workspaceOwners) {
  const vis = s.visibility || 'global'
  const owner = (s.ownerEmail || '').toLowerCase()
  if (isFounder) return true
  if (owner && owner === email) return true
  if (vis === 'global') return true
  if (vis === 'only_me') return false
  if (vis === 'specific') return (s.allowedEmails || []).map((e) => String(e).toLowerCase()).includes(email)
  if (vis === 'workspace') return workspaceOwners.has(owner)
  return false
}

// "a@b.com, c@d.com\n e@f.com" -> ['a@b.com','c@d.com','e@f.com']
function parseEmails(str) {
  return [...new Set((str || '').split(/[\n,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))]
}

// Comprime a imagem de exemplo para caber no banco (data URL ~640px).
function compressImage(file, maxW = 640, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Comprime o vídeo AO MÁXIMO no navegador: redesenha em canvas ~480px e
// regrava em WebM com bitrate baixo (e teto de duração) via MediaRecorder.
function compressVideo(file, { maxW = 480, maxSeconds = 12, bitrate = 350_000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.src = url
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid_video')) }
    video.onloadedmetadata = () => {
      try {
        const scale = Math.min(1, maxW / (video.videoWidth || maxW))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(2, Math.round((video.videoWidth || maxW) * scale))
        canvas.height = Math.max(2, Math.round((video.videoHeight || maxW) * scale))
        const ctx = canvas.getContext('2d')
        const stream = canvas.captureStream(24)
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate })
        const chunks = []
        let raf = 0
        let done = false
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
        rec.onstop = () => {
          URL.revokeObjectURL(url)
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }))
        }
        const finish = () => {
          if (done) return
          done = true
          cancelAnimationFrame(raf)
          video.pause()
          if (rec.state === 'recording') rec.stop()
        }
        const draw = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          raf = requestAnimationFrame(draw)
        }
        video.onended = finish
        video
          .play()
          .then(() => {
            rec.start(250)
            draw()
            setTimeout(finish, maxSeconds * 1000)
          })
          .catch(reject)
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
  })
}

// Compat: skills antigas com imageUrl única viram uma lista de mídia.
function skillMedia(s) {
  if (Array.isArray(s.media) && s.media.length) return s.media
  if (s.imageUrl) return [{ type: 'image', url: s.imageUrl, caption: '' }]
  return []
}

function MediaFrame({ item, className, controls = false }) {
  if (!item) return null
  return item.type === 'video' ? (
    <video src={item.url} muted playsInline loop autoPlay={!controls} controls={controls} className={className} />
  ) : (
    <img src={item.url} alt="" className={className} loading="lazy" />
  )
}

// Carrossel de exemplos: mídia grande com legenda, contador, setas ◂ ▸ e
// miniaturas. Suporta imagem e vídeo (o vídeo mostra controles quando ativo).
function MediaCarousel({ media }) {
  const [i, setI] = useState(0)
  const idx = Math.min(i, media.length - 1)
  const current = media[idx]
  const go = (d) => setI((v) => (v + d + media.length) % media.length)

  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-800 bg-black">
        <MediaFrame item={current} controls={current.type === 'video'} className="absolute inset-0 h-full w-full object-contain" />
        {/* Legenda (ex.: "PROMPT GERADO PELO: ...") */}
        {current.caption && (
          <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-full border border-white/15 bg-black/65 px-2.5 py-1 text-[11px] font-medium text-slate-100 backdrop-blur-sm">
            {current.caption}
          </span>
        )}
        {media.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {idx + 1}/{media.length}
            </span>
            <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75">
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
      {media.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {media.map((m, k) => (
            <button
              key={k}
              type="button"
              onClick={() => setI(k)}
              className={`relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg border transition-colors ${k === idx ? 'border-cyan-500' : 'border-slate-800 hover:border-slate-600'}`}
            >
              <MediaFrame item={m} className="absolute inset-0 h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Prompts() {
  const db = useDb()
  const { t } = useI18n()
  const { user, isFounder, isLocalMode } = useAuth()

  // Quem pode criar/filtrar skills: fundador + plano mais caro (MASTER).
  const myEmail = (user?.email || '').toLowerCase()
  const canManageSkills = isFounder || user?.plan === 'MASTER'
  const [managingCollab, setManagingCollab] = useState(false)

  // ------------------------------------------------------------------
  // Catálogo de skills do sistema (global via servidor; local no dev)
  // ------------------------------------------------------------------
  const localSkills = db.all('systemSkills')
  const [remoteSkills, setRemoteSkills] = useState([])
  const [loadingSkills, setLoadingSkills] = useState(!isLocalMode)
  const [skillsError, setSkillsError] = useState('')
  const [detail, setDetail] = useState(null) // skill aberta no modal
  const [editingSystem, setEditingSystem] = useState(null) // null | 'new:<cat>' | skill
  const [deletingSystem, setDeletingSystem] = useState(null)
  const [guideOpen, setGuideOpen] = useState(() => !db.getSetting('skillsGuideDismissed', false))

  const systemSkills = isLocalMode ? localSkills : remoteSkills

  // Workspaces em que EU sou colaborador (com acesso a skills) → posso ver as
  // skills desses donos marcadas como "workspace".
  const collaborators = db.all('collaborators')
  const workspaceOwners = new Set(
    collaborators
      .filter((c) => (c.memberEmail || '').toLowerCase() === myEmail && c.skills && c.skills !== 'none')
      .map((c) => (c.ownerEmail || '').toLowerCase()),
  )
  const canEditSkill = (s) => isFounder || (canManageSkills && (s.ownerEmail || '').toLowerCase() === myEmail)
  // Em produção o servidor já filtra por visibilidade; no modo local filtramos aqui.
  const visibleSkills = isLocalMode ? systemSkills.filter((s) => canSeeSkill(s, myEmail, isFounder, workspaceOwners)) : systemSkills

  const refreshSkills = useCallback(async () => {
    if (isLocalMode) return
    try {
      const { skills } = await api.skills.list()
      setRemoteSkills(skills)
      setSkillsError('')
    } catch {
      setSkillsError(t('skillsLib.loadError'))
    } finally {
      setLoadingSkills(false)
    }
  }, [isLocalMode, t])

  useEffect(() => {
    refreshSkills()
  }, [refreshSkills])

  function bumpCopies(skill) {
    if (isLocalMode) db.update('systemSkills', skill.id, { copies: (skill.copies || 0) + 1 })
    else {
      setRemoteSkills((list) => list.map((s) => (s.id === skill.id ? { ...s, copies: (s.copies || 0) + 1 } : s)))
      api.skills.copied(skill.id).catch(() => {})
    }
  }

  // Salva a skill do sistema na coleção pessoal do usuário (Minhas Skills)
  function saveToMine(skill) {
    db.insert('prompts', {
      name: skill.title,
      content: skill.content,
      notes: skill.howToUse || '',
      channelId: null,
      categoryId: db.all('promptCategories')[0]?.id || '',
      suggestedLanguage: 'pt',
      tags: [],
      isFavorite: false,
    })
    bumpCopies(skill)
  }

  async function deleteSystemSkill(skill) {
    if (isLocalMode) db.remove('systemSkills', skill.id)
    else {
      try {
        await api.skills.remove(skill.id)
        refreshSkills()
      } catch (e) {
        setSkillsError(e?.message || t('skillsLib.loadError'))
      }
    }
  }

  // ------------------------------------------------------------------
  // Minhas Skills (prompts do usuário — mesmo dado de antes)
  // ------------------------------------------------------------------
  const [activeCat, setActiveCat] = useState('all')
  const [channelFilter, setChannelFilter] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [query, setQuery] = useState('')
  const [editPrompt, setEditPrompt] = useState(null) // null | 'new' | prompt
  const [deletePrompt, setDeletePrompt] = useState(null)
  const [managingCats, setManagingCats] = useState(false)

  const categories = [...db.all('promptCategories')].sort((a, b) => a.position - b.position)
  const prompts = db.all('prompts')
  const channels = db.all('channels')

  let filtered = prompts
  if (channelFilter === 'global') filtered = filtered.filter((p) => !p.channelId)
  else if (channelFilter) filtered = filtered.filter((p) => p.channelId === channelFilter)
  if (onlyFavorites) filtered = filtered.filter((p) => p.isFavorite)
  if (query.trim()) {
    const q = query.trim().toLowerCase()
    filtered = filtered.filter((p) => `${p.name} ${p.content} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q))
  }
  const inCat = activeCat === 'all' ? filtered : filtered.filter((p) => p.categoryId === activeCat)

  return (
    <PrivacyScope page="prompts">
    <div className="mx-auto max-w-[1600px] space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 text-white shadow-lg shadow-cyan-500/25">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{t('skillsLib.title')}</h1>
            <p className="text-sm text-slate-500">{t('skillsLib.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManageSkills && (
            <button
              onClick={() => setManagingCollab(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
            >
              <Users size={14} />
              {t('skillsLib.collab.button')}
            </button>
          )}
          <PageEye />
        </div>
      </div>

      {/* Guia de 3 passos (dispensável) */}
      {guideOpen && (
        <section className="relative rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="border-t-2 border-cyan-500/50" />
          <button
            onClick={() => { setGuideOpen(false); db.setSetting('skillsGuideDismissed', true) }}
            title={t('skillsLib.dismiss')}
            className="absolute right-2.5 top-3 flex h-6 w-6 items-center justify-center rounded-md border border-slate-800 text-slate-500 hover:text-slate-300"
          >
            <X size={13} />
          </button>
          <div className="grid grid-cols-1 divide-y divide-slate-800 md:grid-cols-3 md:divide-x md:divide-y-0">
            <GuideStep n={1} title={t('skillsLib.step1Title')} desc={t('skillsLib.step1Desc')}>
              <Link to="/transcricao" className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20">
                <Captions size={11} />
                {t('skillsLib.step1Link')}
              </Link>
            </GuideStep>
            <GuideStep n={2} title={t('skillsLib.step2Title')} desc={t('skillsLib.step2Desc')} icon={<Copy size={12} className="text-cyan-400" />} />
            <GuideStep n={3} title={t('skillsLib.step3Title')} desc={t('skillsLib.step3Desc')} icon={<Bot size={13} className="text-cyan-400" />} />
          </div>
        </section>
      )}

      {skillsError && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-xs text-red-400">{skillsError}</p>}
      {loadingSkills && (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-cyan-400" />
        </div>
      )}

      {/* Seções do catálogo do sistema */}
      {!loadingSkills && SKILL_CATEGORIES.map((cat) => (
        <SystemSection
          key={cat}
          category={cat}
          skills={visibleSkills.filter((s) => s.category === cat)}
          canManage={canManageSkills}
          canEditSkill={canEditSkill}
          onOpen={setDetail}
          onNew={() => setEditingSystem(`new:${cat}`)}
          onEdit={setEditingSystem}
          onDelete={setDeletingSystem}
          onCopy={bumpCopies}
          onSaveToMine={saveToMine}
        />
      ))}

      {/* ------------------------------------------------------------ */}
      {/* Minhas Skills                                                  */}
      {/* ------------------------------------------------------------ */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="border-t-2 border-cyan-500/50" />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3">
          <FileText size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">{t('skillsLib.mySkills')}</span>
          <span className="rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 px-2 py-0.5 text-[10px] font-bold text-white">{prompts.length}</span>
          <span className="flex-1" />
          <button className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setEditPrompt('new')}>
            <Plus size={13} />
            {t('skillsLib.newSkill')}
          </button>
        </div>

        <div className="space-y-4 p-4">
          <p className="text-xs text-slate-500">{t('skillsLib.mySkillsIntro')}</p>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputCls} !w-48`} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              <option value="">{t('prompts.allChannels')}</option>
              <option value="global">{t('prompts.global')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="relative min-w-56 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className={`${inputCls} !pl-9`} placeholder={t('prompts.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <button
              onClick={() => setOnlyFavorites((v) => !v)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                onlyFavorites ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
              }`}
            >
              <Star size={13} className={onlyFavorites ? 'fill-amber-400' : ''} />
              {t('prompts.onlyFavorites')}
            </button>
          </div>

          {/* Pílulas de categoria */}
          <div className="flex flex-wrap items-center gap-1.5">
            <CatPill active={activeCat === 'all'} onClick={() => setActiveCat('all')} label={t('prompts.all')} count={filtered.length} />
            {categories.map((cat) => (
              <CatPill
                key={cat.id}
                active={activeCat === cat.id}
                onClick={() => setActiveCat(cat.id)}
                label={cat.name}
                count={filtered.filter((p) => p.categoryId === cat.id).length}
              />
            ))}
            <button onClick={() => setManagingCats(true)} className="rounded-full border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-500 hover:border-cyan-500/40 hover:text-cyan-400" title={t('prompts.manageCategories')}>
              <Plus size={12} className="inline" /> {t('prompts.category')}
            </button>
          </div>

          {inCat.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t('prompts.emptyTitle')}
              description={t('prompts.emptyDesc')}
              action={
                <button className={btnPrimary} onClick={() => setEditPrompt('new')}>
                  {t('prompts.createFirst')}
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {inCat.map((p) => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  category={categories.find((c) => c.id === p.categoryId)}
                  channelName={p.channelId ? channels.find((c) => c.id === p.channelId)?.name : null}
                  onEdit={() => setEditPrompt(p)}
                  onDelete={() => setDeletePrompt(p)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Modais */}
      <SkillDetailModal
        skill={detail}
        onClose={() => setDetail(null)}
        isFounder={isFounder}
        onCopy={bumpCopies}
        onSaveToMine={saveToMine}
        onEdit={(s) => { setDetail(null); setEditingSystem(s) }}
      />
      <SystemSkillFormModal
        open={editingSystem !== null}
        onClose={() => setEditingSystem(null)}
        skill={typeof editingSystem === 'string' ? null : editingSystem}
        initialCategory={typeof editingSystem === 'string' ? editingSystem.split(':')[1] : null}
        isLocalMode={isLocalMode}
        isFounder={isFounder}
        ownerEmail={myEmail}
        onSaved={refreshSkills}
      />
      <CollaboratorsModal open={managingCollab} onClose={() => setManagingCollab(false)} ownerEmail={myEmail} isLocalMode={isLocalMode} />
      <ConfirmDialog
        open={deletingSystem !== null}
        onClose={() => setDeletingSystem(null)}
        onConfirm={() => deleteSystemSkill(deletingSystem)}
        title={t('skillsLib.deleteTitle')}
        message={t('skillsLib.deleteMsg', { title: deletingSystem?.title })}
      />
      <PromptFormModal open={editPrompt !== null} onClose={() => setEditPrompt(null)} prompt={editPrompt === 'new' ? null : editPrompt} categories={categories} channels={channels} />
      <CategoriesModal open={managingCats} onClose={() => setManagingCats(false)} categories={categories} />
      <ConfirmDialog
        open={deletePrompt !== null}
        onClose={() => setDeletePrompt(null)}
        onConfirm={() => db.remove('prompts', deletePrompt.id)}
        title={t('prompts.deleteTitle')}
        message={t('prompts.deleteMsg', { name: deletePrompt?.name })}
      />
    </div>
    </PrivacyScope>
  )
}

function GuideStep({ n, title, desc, icon, children }) {
  return (
    <div className="flex gap-2.5 px-4 py-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-[11px] font-bold text-white shadow shadow-cyan-500/25">{n}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-100">
          {title}
          {icon}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-400">{desc}</p>
        {children && <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seção colapsável do catálogo (Skills de Geração / Estilos Visuais / Câmera)
// ---------------------------------------------------------------------------
function SystemSection({ category, skills, canManage, canEditSkill, onOpen, onNew, onEdit, onDelete, onCopy, onSaveToMine }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  if (!skills.length && !canManage) return null

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="border-t-2 border-cyan-500/50" />
      <div
        role="button"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer select-none flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3"
      >
        <Sparkles size={15} className="text-cyan-400" />
        <span className="text-sm font-semibold text-slate-100">{t(`skillsLib.sections.${category}`)}</span>
        <span className="rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 px-2 py-0.5 text-[10px] font-bold text-white">{skills.length}</span>
        <span className="flex-1" />
        {canManage && (
          <button
            onClick={(e) => { e.stopPropagation(); onNew() }}
            className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`}
          >
            <Plus size={13} />
            {t('skillsLib.newSystem')}
          </button>
        )}
        <ChevronDown size={15} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="p-4">
          {skills.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-600">{t('skillsLib.emptySection')}</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(205px, 1fr))' }}>
              {skills.map((s) => (
                <SystemSkillCard key={s.id} skill={s} canEdit={canEditSkill(s)} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onCopy={onCopy} onSaveToMine={onSaveToMine} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SystemSkillCard({ skill: s, canEdit, onOpen, onEdit, onDelete, onCopy, onSaveToMine }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hover, setHover] = useState(false)
  const isNew = s.createdAt && Date.now() - s.createdAt < NEW_BADGE_MS
  const media = skillMedia(s)
  // Ao passar o mouse, se houver mais de uma mídia, mostra a 2ª (imagem ou vídeo)
  // para sinalizar que a skill tem mais conteúdo salvo.
  const shown = hover && media.length > 1 ? media[1] : media[0]

  async function copy(e) {
    e.stopPropagation()
    await navigator.clipboard.writeText(s.content)
    onCopy(s)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function save(e) {
    e.stopPropagation()
    onSaveToMine(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div
      onClick={() => onOpen(s)}
      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 transition-colors hover:border-cyan-500/40"
    >
      {/* Thumb 16:9 — 1ª mídia (troca para a 2ª no hover se houver mais) */}
      <div
        className="relative aspect-video overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {shown ? (
          <MediaFrame key={shown.url} item={shown} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles size={26} className="text-slate-700" />
          </div>
        )}
        {/* Topo-esquerdo: "Nova" + badge de visibilidade (empilhados sem colidir com a legenda no rodapé) */}
        <div className="absolute left-2 top-2 z-[1] flex flex-wrap items-center gap-1">
          {isNew && (
            <span className="rounded-full border border-green-500/35 bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">
              {t('skillsLib.badgeNew')}
            </span>
          )}
          {s.visibility && s.visibility !== 'global' && (() => {
            const VisIcon = visibilityIcon(s.visibility)
            return (
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-black/65 px-2 py-0.5 text-[9.5px] font-semibold text-slate-100 backdrop-blur-sm">
                <VisIcon size={10} />
                {t(`skillsLib.visShort.${s.visibility}`)}
              </span>
            )
          })()}
        </div>
        {media.length > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {media.length} 🖼
          </span>
        )}
        {/* Legenda sobreposta na imagem, igual fica dentro da skill —
            ocupa a largura toda do card e mostra até 2 linhas para caber o
            máximo de texto legível; só corta (…) se for realmente longa. */}
        {shown?.caption && (
          <span className="absolute inset-x-1.5 bottom-1.5 line-clamp-2 rounded-lg border border-white/15 bg-black/70 px-2 py-1 text-[10.5px] font-medium leading-tight text-slate-100 backdrop-blur-sm">
            {shown.caption}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-3 pb-1.5 pt-2.5">
        <p className="truncate text-[13px] font-semibold text-slate-100">{s.title}</p>
        <p className="line-clamp-2 text-[11.5px] leading-snug text-slate-400">{s.description}</p>
        <p className="truncate text-[10.5px] text-slate-600">{t(`skillsLib.sections.${s.category}`)} · {t('skillsLib.copies', { n: s.copies || 0 })}</p>
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
        <button
          onClick={copy}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
            copied ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-400 hover:bg-cyan-500/15'
          }`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t('skillsLib.copied') : t('skillsLib.copy')}
        </button>
        <span className="flex-1" />
        {canEdit && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onEdit(s) }} title={t('prompts.edit')} className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-slate-800 text-slate-500 hover:text-slate-200">
              <Pencil size={12} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(s) }} title={t('prompts.delete')} className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-slate-800 text-slate-500 hover:text-red-400">
              <Trash2 size={12} />
            </button>
          </>
        )}
        <button
          onClick={save}
          title={t('skillsLib.saveToMine')}
          className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg border transition-colors ${
            saved ? 'border-green-500/40 text-green-400' : 'border-slate-800 text-slate-500 hover:text-cyan-300'
          }`}
        >
          {saved ? <Check size={12} /> : <Bookmark size={12} />}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de detalhe da skill (vídeo tutorial + como usar + exemplos + conteúdo)
// ---------------------------------------------------------------------------
function SkillDetailModal({ skill: s, onClose, isFounder, onCopy, onSaveToMine, onEdit }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setCopied(false); setSaved(false) }, [s])
  if (!s) return null

  async function copy() {
    await navigator.clipboard.writeText(s.content)
    onCopy(s)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function save() {
    onSaveToMine(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const slug = s.title.toLowerCase().replace(/[^a-z0-9à-ú]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'skill'
  const media = skillMedia(s)

  return (
    <Modal open onClose={onClose} title={s.title} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300">{t(`skillsLib.sections.${s.category}`)}</span>
          <span className="text-[11px] text-slate-500">{t('skillsLib.copies', { n: s.copies || 0 })}</span>
        </div>

        {s.description && <p className="text-[13px] leading-relaxed text-slate-400">{s.description}</p>}

        {s.videoUrl && (
          <a
            href={s.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] px-3.5 py-2.5 transition-colors hover:bg-cyan-500/10"
          >
            <PlayCircle size={19} className="shrink-0 text-cyan-400" />
            <span className="flex-1 text-[13px] font-semibold text-slate-100">{t('skillsLib.watchTutorial')}</span>
          </a>
        )}

        {s.howToUse && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <ListChecks size={12} />
              {t('skillsLib.howToUse')}
            </p>
            <div className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-200">{s.howToUse}</div>
          </div>
        )}

        {media.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('skillsLib.examples')}</p>
            <MediaCarousel media={media} />
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('skillsLib.contentLabel')}</p>
          <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200">{s.content}</pre>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={copy} className={`${btnGhost} flex items-center gap-1.5 text-xs ${copied ? '!text-green-400' : ''}`}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t('skillsLib.copied') : t('skillsLib.copy')}
          </button>
          <button onClick={() => downloadFile(`${slug}.md`, s.content)} className={`${btnGhost} flex items-center gap-1.5 text-xs`}>
            <Download size={13} />
            {t('skillsLib.downloadMd')}
          </button>
          <span className="flex-1" />
          {isFounder && (
            <button onClick={() => onEdit(s)} className={`${btnGhost} flex items-center gap-1.5 text-xs`}>
              <Pencil size={13} />
              {t('prompts.edit')}
            </button>
          )}
          <button onClick={save} className={`${btnPrimary} flex items-center gap-1.5 text-xs ${saved ? '!bg-green-500' : ''}`}>
            {saved ? <Check size={13} /> : <Bookmark size={13} />}
            {saved ? t('skillsLib.savedToMine') : t('skillsLib.saveToMine')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Form do fundador — cria/edita skill do sistema (vídeo + imagem + conteúdo)
// ---------------------------------------------------------------------------
function SystemSkillFormModal({ open, onClose, skill, initialCategory, isLocalMode, isFounder, ownerEmail, onSaved }) {
  const db = useDb()
  const { t } = useI18n()
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState('') // '' | 'image' | 'video'

  useEffect(() => {
    if (open) {
      setForm({
        category: skill?.category || initialCategory || 'generation',
        title: skill?.title || '',
        description: skill?.description || '',
        howToUse: skill?.howToUse || '',
        content: skill?.content || '',
        videoUrl: skill?.videoUrl || '',
        media: skill ? skillMedia(skill) : [],
        visibility: skill?.visibility || (isFounder ? 'global' : 'workspace'),
        allowedEmails: (skill?.allowedEmails || []).join(', '),
      })
      setError('')
    }
  }, [open, skill, initialCategory])

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const addMedia = (item) => setForm((f) => ({ ...f, media: [...(f.media || []), item].slice(0, 10) }))
  const updateMedia = (i, patch) => setForm((f) => ({ ...f, media: f.media.map((m, k) => (k === i ? { ...m, ...patch } : m)) }))
  const removeMedia = (i) => setForm((f) => ({ ...f, media: f.media.filter((_, k) => k !== i) }))
  const moveMedia = (i, d) =>
    setForm((f) => {
      const arr = [...f.media]
      const j = i + d
      if (j < 0 || j >= arr.length) return f
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...f, media: arr }
    })

  async function onPickImage(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setProcessing('image')
    try {
      for (const file of files) addMedia({ type: 'image', url: await compressImage(file), caption: '' })
    } catch {
      setError(t('skillsLib.mediaError'))
    } finally {
      setProcessing('')
    }
  }

  async function onPickVideo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcessing('video')
    setError('')
    try {
      addMedia({ type: 'video', url: await compressVideo(file), caption: '' })
    } catch {
      setError(t('skillsLib.mediaError'))
    } finally {
      setProcessing('')
    }
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      // Fundador pode publicar no global; outros não (força workspace).
      const visibility = !isFounder && form.visibility === 'global' ? 'workspace' : form.visibility
      const payload = {
        ...form,
        visibility,
        allowedEmails: visibility === 'specific' ? parseEmails(form.allowedEmails) : [],
        ownerEmail: skill?.ownerEmail || ownerEmail,
      }
      if (isLocalMode) {
        if (skill) db.update('systemSkills', skill.id, payload)
        else db.insert('systemSkills', { ...payload, copies: 0 })
      } else {
        await api.skills.save(skill ? { ...payload, id: skill.id } : payload)
        onSaved()
      }
      onClose()
    } catch (err) {
      setError(err?.message || 'Erro ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={skill ? t('skillsLib.editSystem') : t('skillsLib.newSystem')} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('skillsLib.form.category')}>
            <select className={inputCls} value={form.category || 'generation'} onChange={(e) => set('category', e.target.value)}>
              {SKILL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`skillsLib.sections.${c}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('skillsLib.form.video')}>
            <input className={inputCls} type="url" placeholder="https://youtu.be/..." value={form.videoUrl || ''} onChange={(e) => set('videoUrl', e.target.value)} />
          </Field>
        </div>
        <Field label={t('skillsLib.form.title')}>
          <input className={inputCls} required value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label={t('skillsLib.form.desc')}>
          <textarea className={`${inputCls} min-h-16 resize-y`} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label={t('skillsLib.form.howTo')}>
          <textarea className={`${inputCls} min-h-16 resize-y`} value={form.howToUse || ''} onChange={(e) => set('howToUse', e.target.value)} />
        </Field>
        <Field label={t('skillsLib.form.content')}>
          <textarea className={`${inputCls} min-h-44 resize-y font-mono text-xs`} required value={form.content || ''} onChange={(e) => set('content', e.target.value)} />
        </Field>

        {/* Visibilidade — quem pode ver a skill */}
        <Field label={t('skillsLib.form.visibility')}>
          <select className={inputCls} value={form.visibility || 'global'} onChange={(e) => set('visibility', e.target.value)}>
            {SKILL_VISIBILITIES.filter((v) => isFounder || v !== 'global').map((v) => (
              <option key={v} value={v}>
                {t(`skillsLib.form.vis${v === 'only_me' ? 'OnlyMe' : v.charAt(0).toUpperCase() + v.slice(1)}`)}
              </option>
            ))}
          </select>
          {!isFounder && <p className="mt-1 text-[11px] text-slate-600">{t('skillsLib.form.visGlobalFounder')}</p>}
        </Field>
        {form.visibility === 'specific' && (
          <Field label={t('skillsLib.form.allowedEmails')}>
            <textarea
              className={`${inputCls} min-h-16 resize-y`}
              placeholder={t('skillsLib.form.allowedPlaceholder')}
              value={form.allowedEmails || ''}
              onChange={(e) => set('allowedEmails', e.target.value)}
            />
          </Field>
        )}
        <Field label={t('skillsLib.form.media')}>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${btnGhost} flex cursor-pointer items-center gap-1.5 text-xs ${processing ? 'pointer-events-none opacity-50' : ''}`}>
              <ImagePlus size={13} />
              {t('skillsLib.form.addImage')}
              <input type="file" accept="image/*" multiple hidden onChange={onPickImage} />
            </label>
            <label className={`${btnGhost} flex cursor-pointer items-center gap-1.5 text-xs ${processing ? 'pointer-events-none opacity-50' : ''}`}>
              <VideoIcon size={13} />
              {t('skillsLib.form.addVideo')}
              <input type="file" accept="video/*" hidden onChange={onPickVideo} />
            </label>
            {processing && (
              <span className="flex items-center gap-1.5 text-xs text-cyan-300">
                <Loader2 size={12} className="animate-spin" />
                {processing === 'video' ? t('skillsLib.form.compressingVideo') : t('skillsLib.form.processingImage')}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600">{t('skillsLib.form.mediaHint')}</p>

          {(form.media || []).length > 0 && (
            <div className="mt-3 space-y-2">
              {form.media.map((m, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950 p-2">
                  <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md border border-slate-800 bg-black">
                    <MediaFrame item={m} className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[8px] font-bold uppercase text-white">{m.type === 'video' ? '▶' : '🖼'}</span>
                  </div>
                  <input
                    className={`${inputCls} !py-1.5 text-xs`}
                    placeholder={t('skillsLib.form.captionPlaceholder')}
                    value={m.caption || ''}
                    onChange={(e) => updateMedia(i, { caption: e.target.value })}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => moveMedia(i, -1)} disabled={i === 0} title={t('ideaBoard.moveUp')} className="text-slate-600 hover:text-slate-300 disabled:opacity-25">
                      <ChevronUp size={15} />
                    </button>
                    <button type="button" onClick={() => moveMedia(i, 1)} disabled={i === form.media.length - 1} title={t('ideaBoard.moveDown')} className="text-slate-600 hover:text-slate-300 disabled:opacity-25">
                      <ChevronDown size={15} />
                    </button>
                    <button type="button" onClick={() => removeMedia(i)} title={t('prompts.delete')} className="text-slate-600 hover:text-red-400">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Field>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy} className={`${btnPrimary} flex items-center gap-2 disabled:opacity-50`}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {t('skillsLib.form.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Colaboradores do workspace — liberam o acesso às skills marcadas como
// "workspace" (e opcionalmente às referências). Base para a futura fase de
// colaboração em canais/vídeos.
// ---------------------------------------------------------------------------
function AccessSelect({ label, value, onChange, compact }) {
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

function CollaboratorsModal({ open, onClose, ownerEmail, isLocalMode }) {
  const db = useDb()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [skills, setSkills] = useState('view')
  const [references, setReferences] = useState('none')
  const [videos, setVideos] = useState('edit')
  const [error, setError] = useState('')
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
    if (isLocalMode) db.insert('collaborators', { ownerEmail: owner, memberEmail: m, skills, references, videos })
    else {
      try {
        await api.collaborators.save({ memberEmail: m, skills, references, videos })
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
    setError('')
  }

  async function setAccess(c, field, value) {
    if (isLocalMode) db.update('collaborators', c.id, { [field]: value })
    else {
      const merged = { memberEmail: c.memberEmail, skills: c.skills, references: c.references, videos: c.videos, [field]: value }
      await api.collaborators.save(merged)
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
        <AccessSelect label={t('skillsLib.collab.skills')} value={skills} onChange={setSkills} />
        <AccessSelect label={t('skillsLib.collab.references')} value={references} onChange={setReferences} />
        <button type="submit" className={`${btnPrimary} flex items-center gap-1.5`}>
          <UserPlus size={14} />
          {t('skillsLib.collab.add')}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{t('skillsLib.collab.inviteHint')}</p>

      <div className="mt-4 space-y-2">
        {mine.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">{t('skillsLib.collab.empty')}</p>
        ) : (
          mine.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2.5">
              <span className="min-w-40 flex-1 truncate text-sm text-slate-200">{c.memberEmail}</span>
              <AccessSelect label={t('skillsLib.collab.videos')} value={c.videos || 'none'} onChange={(v) => setAccess(c, 'videos', v)} compact />
              <AccessSelect label={t('skillsLib.collab.skills')} value={c.skills || 'none'} onChange={(v) => setAccess(c, 'skills', v)} compact />
              <AccessSelect label={t('skillsLib.collab.references')} value={c.references || 'none'} onChange={(v) => setAccess(c, 'references', v)} compact />
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

function CatPill({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
      }`}
    >
      {label}
      <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'}`}>{count}</span>
    </button>
  )
}

function PromptCard({ prompt: p, category, channelName, onEdit, onDelete }) {
  const db = useDb()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(p.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 transition-colors hover:border-cyan-500/40">
      <div className="border-t-2 border-cyan-500/50" />
      <div className="flex flex-1 flex-col p-3.5">
        {/* Badges + ações */}
        <div className="flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {category && <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">{category.name}</span>}
            <span className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[9px] font-medium text-slate-400">
              <Globe size={8} />
              {t(`common.langNames.${p.suggestedLanguage || 'pt'}`)}
            </span>
          </div>
          <button onClick={copy} title={t('prompts.copy')} className={copied ? 'text-green-400' : 'text-slate-500 hover:text-slate-200'}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button onClick={() => db.update('prompts', p.id, { isFavorite: !p.isFavorite })} title={t('prompts.favorite')}>
            <Star size={14} className={p.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-500 hover:text-amber-400'} />
          </button>
          <button onClick={() => setMenuOpen((v) => !v)} className="text-slate-500 hover:text-slate-200">
            <MoreVertical size={14} />
          </button>
        </div>

        {menuOpen && (
          <div className="absolute right-3 top-10 z-20 w-36 rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
            <button onClick={() => { setMenuOpen(false); onEdit() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
              <Pencil size={12} />
              {t('prompts.edit')}
            </button>
            <button onClick={() => { setMenuOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
              <Trash2 size={12} />
              {t('prompts.delete')}
            </button>
          </div>
        )}

        <p className="mt-2.5 font-bold leading-snug text-slate-100"><Masked mask="•••••••••">{p.name}</Masked></p>
        <p className="mt-0.5 text-[11px] text-slate-500"><Masked mask="•••••">{channelName || t('prompts.global')}</Masked></p>

        {/* Preview do conteúdo — no modo restrito o texto real não entra no DOM */}
        <div className="mt-2.5 max-h-28 flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2.5">
          <p className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-400">
            <Masked mask="••••••••••••••••••••••••••••••••••••••••">{p.content.slice(0, 400)}</Masked>
          </p>
        </div>

        {(p.tags || []).length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {p.tags.map((tag) => (
              <span key={tag} className="rounded border border-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">
                🏷 {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal Criar/Editar Prompt (layout do print)
// ---------------------------------------------------------------------------
function PromptFormModal({ open, onClose, prompt, categories, channels }) {
  const db = useDb()
  const { t } = useI18n()
  const [form, setForm] = useState({})
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    if (open) {
      setForm({
        channelId: prompt?.channelId || '',
        name: prompt?.name || '',
        categoryId: prompt?.categoryId || categories[0]?.id || '',
        content: prompt?.content || '',
        notes: prompt?.notes || '',
        suggestedLanguage: prompt?.suggestedLanguage || 'pt',
        tags: prompt?.tags || [],
      })
      setTagInput('')
    }
  }, [open, prompt]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '')
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t])
    setTagInput('')
  }

  function save(e) {
    e.preventDefault()
    const payload = { ...form, channelId: form.channelId || null }
    if (prompt) db.update('prompts', prompt.id, payload)
    else db.insert('prompts', { ...payload, isFavorite: false })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={prompt ? t('prompts.form.editTitle') : t('prompts.form.createTitle')} wide>
      <form onSubmit={save} className="space-y-4">
        <Field label={t('prompts.form.channel')}>
          <select className={inputCls} value={form.channelId || ''} onChange={(e) => set('channelId', e.target.value)}>
            <option value="">{t('prompts.globalOption')}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('prompts.form.name')}>
            <input className={inputCls} required placeholder={t('prompts.form.namePlaceholder')} value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('prompts.form.categoryLabel')}>
            <select className={inputCls} required value={form.categoryId || ''} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t('prompts.form.content')}>
          <textarea
            className={`${inputCls} min-h-36 resize-y font-mono text-xs`}
            required
            placeholder={t('prompts.form.contentPlaceholder')}
            value={form.content || ''}
            onChange={(e) => set('content', e.target.value)}
          />
        </Field>

        <Field label={t('prompts.form.notes')}>
          <textarea className={`${inputCls} min-h-16 resize-y`} placeholder={t('prompts.form.notesPlaceholder')} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <Field label={t('prompts.form.language')}>
          <select className={inputCls} value={form.suggestedLanguage || 'pt'} onChange={(e) => set('suggestedLanguage', e.target.value)}>
            <option value="pt">{t('common.langNames.pt')}</option>
            <option value="en">{t('common.langNames.en')}</option>
            <option value="es">{t('common.langNames.es')}</option>
          </select>
        </Field>

        <Field label={t('prompts.form.tags')}>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder={t('prompts.form.tagPlaceholder')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
            />
            <button type="button" onClick={addTag} className={`${btnGhost} shrink-0 !px-3`}>
              <Plus size={15} />
            </button>
          </div>
          {(form.tags || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {form.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                  {tag}
                  <button type="button" onClick={() => set('tags', form.tags.filter((t) => t !== tag))} className="text-slate-500 hover:text-red-400">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary}>
            {prompt ? t('prompts.form.save') : t('prompts.form.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CategoriesModal({ open, onClose, categories }) {
  const db = useDb()
  const { t } = useI18n()
  const [name, setName] = useState('')

  function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    db.insert('promptCategories', { name: name.trim(), position: categories.length })
    setName('')
  }

  return (
    <Modal open={open} onClose={onClose} title={t('prompts.manageCategoriesTitle')}>
      <form onSubmit={add} className="flex gap-2">
        <input className={inputCls} placeholder={t('prompts.newCategory')} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className={`${btnPrimary} shrink-0`}>
          <Plus size={15} />
        </button>
      </form>
      <ul className="mt-4 space-y-1.5">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">
            {c.name}
            <button onClick={() => db.remove('promptCategories', c.id)} className="text-slate-600 hover:text-red-400" title={t('prompts.deleteCategory')}>
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
