import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldCheck, Sparkles, Users, GraduationCap, ShieldAlert, Plus, Pencil, Trash2, Crown, X, Loader2, RefreshCw, Ban, Radar, Play, Pause, Database, AudioLines } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { persistMedia } from '../lib/storage'
import { optimizeDataUrl } from '../lib/imageOptimize'
import { Modal, inputCls, btnPrimary, btnGhost, ConfirmDialog, formatCompact } from '../components/ui'
import { Field } from './channels/ChannelsList'
import { useI18n } from '../i18n'
import { useAutoCrawl } from '../lib/useAutoCrawl'
import { startCrawl, stopCrawl, setCrawlCap, hasCrawlKeys, refreshCrawlStats } from '../lib/autoCrawl'

// -----------------------------------------------------------------------------
// Área de Administração — permissões acima do usuário MASTER:
//   • Publicar/editar/excluir Novidades da Plataforma (feed do dashboard + sino)
//   • Gerenciar membros: plano de cada conta e transferência do papel de admin
//   • Gerenciar conteúdos da Academia
//   • Curadoria da base de Canais Removidos
// Usuários comuns (mesmo MASTER) não veem esta página.
// -----------------------------------------------------------------------------

const TABS = [
  ['news', Sparkles],
  ['members', Users],
  ['academy', GraduationCap],
  ['removed', ShieldAlert],
  ['tts', AudioLines],
]

export default function Admin() {
  const { t } = useI18n()
  const { isAdmin, isFounder } = useAuth()
  const [tab, setTab] = useState('news')

  if (!isAdmin) return <Navigate to="/" replace />

  // A aba "Descoberta" (busca automática da base) é exclusiva do fundador.
  const tabs = isFounder ? [...TABS, ['crawl', Radar]] : TABS

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('admin.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map(([key, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Icon size={15} />
            {t(`admin.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'news' && <NewsTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'academy' && <AcademyTab />}
      {tab === 'removed' && <RemovedTab />}
      {tab === 'tts' && <TtsTab />}
      {tab === 'crawl' && isFounder && <AutoCrawlTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Narração (ElevenLabs) — a chave é do dono e vale para todos os usuários; o
// custo é do dono, então há cota diária por usuário. A chave é guardada CIFRADA
// no servidor (nunca volta ao navegador). Esta aba liga/desliga, define o limite
// diário, o plano mínimo e salva/testa a chave.
// ---------------------------------------------------------------------------
const TTS_PLAN_OPTIONS = ['FREE', 'BASIC', 'LITE', 'PRO']

function TtsTab() {
  const { t } = useI18n()
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }
  const [confirmRemove, setConfirmRemove] = useState(false)

  const load = () => {
    setLoading(true)
    api.tts
      .adminConfig()
      .then((c) => setCfg(c))
      .catch((e) => setLoadError(apiErrorMessage(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function save(extra = {}) {
    setSaving(true)
    setMsg(null)
    try {
      const body = {
        enabled: cfg.enabled,
        dailyLimit: cfg.dailyLimit,
        minPlan: cfg.minPlan,
        modelId: cfg.modelId,
        ...extra,
      }
      if (apiKey.trim() && !('clearKey' in extra)) body.apiKey = apiKey.trim()
      const res = await api.tts.adminSave(body)
      setCfg(res)
      setApiKey('')
      setMsg({ ok: true, text: extra.clearKey ? t('admin.tts.removed') : t('admin.tts.saved') })
    } catch (e) {
      setMsg({ ok: false, text: apiErrorMessage(e) })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setMsg(null)
    try {
      const res = await api.tts.adminTest(apiKey.trim() || undefined)
      setMsg({ ok: res.ok, text: res.message })
    } catch (e) {
      setMsg({ ok: false, text: apiErrorMessage(e) })
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-amber-400" /></div>
  if (loadError) return <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{loadError}</p>
  if (!cfg) return null

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100"><AudioLines size={18} className="text-cyan-400" /> {t('admin.tts.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('admin.tts.intro')}</p>
      </div>

      {/* Chave */}
      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <label className="block text-sm font-semibold text-slate-200">{t('admin.tts.keyLabel')}</label>
        <p className="text-xs text-slate-500">
          {cfg.configured ? t('admin.tts.keyConfigured', { hint: cfg.keyHint || '••••' }) : t('admin.tts.keyNone')}
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t('admin.tts.keyPlaceholder')}
          autoComplete="off"
          className={inputCls}
        />
        <p className="text-[11px] text-slate-500">{t('admin.tts.keyKeep')} · <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{t('admin.tts.getKey')}</a></p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={test} disabled={testing || saving} className={`${btnGhost} inline-flex items-center gap-2`}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {testing ? t('admin.tts.testing') : t('admin.tts.test')}
          </button>
          {cfg.configured && (
            <button onClick={() => setConfirmRemove(true)} disabled={saving} className={`${btnGhost} inline-flex items-center gap-2 text-red-300 hover:text-red-200`}>
              <Trash2 size={15} /> {t('admin.tts.removeKey')}
            </button>
          )}
        </div>
      </div>

      {/* Opções */}
      <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-semibold text-slate-200">{t('admin.tts.enabled')}</span>
            <span className="block text-xs text-slate-500">{t('admin.tts.enabledHint')}</span>
          </span>
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="h-5 w-5 accent-cyan-500" />
        </label>

        <div>
          <label className="block text-sm font-semibold text-slate-200">{t('admin.tts.dailyLimit')}</label>
          <p className="mb-1.5 text-xs text-slate-500">{t('admin.tts.dailyLimitHint')}</p>
          <input type="number" min={0} max={100000} value={cfg.dailyLimit} onChange={(e) => setCfg({ ...cfg, dailyLimit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={`${inputCls} max-w-[160px]`} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-200">{t('admin.tts.minPlan')}</label>
          <select value={cfg.minPlan} onChange={(e) => setCfg({ ...cfg, minPlan: e.target.value })} className={`${inputCls} max-w-[200px]`}>
            {TTS_PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-200">{t('admin.tts.model')}</label>
          <select value={cfg.modelId} onChange={(e) => setCfg({ ...cfg, modelId: e.target.value })} className={`${inputCls} max-w-[280px]`}>
            <option value="eleven_multilingual_v2">{t('admin.tts.modelAuto')}</option>
            <option value="eleven_turbo_v2_5">Turbo v2.5 (rápido)</option>
            <option value="eleven_flash_v2_5">Flash v2.5 (mais rápido)</option>
          </select>
        </div>
      </div>

      {msg && (
        <p className={`rounded-lg border px-4 py-3 text-sm ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-red-500/30 bg-red-500/5 text-red-300'}`}>{msg.text}</p>
      )}

      <button onClick={() => save()} disabled={saving} className={`${btnPrimary} inline-flex items-center gap-2`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : null}
        {saving ? t('admin.tts.saving') : t('admin.tts.save')}
      </button>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => { setConfirmRemove(false); save({ clearKey: true }) }}
        title={t('admin.tts.removeKey')}
        message={t('admin.tts.keyLabel')}
        confirmLabel={t('admin.tts.removeKey')}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Membros (produção/Supabase) — lista real de usuários da plataforma, direto
// do site: mudar plano, suspender/reativar e excluir contas.
// ---------------------------------------------------------------------------
const PLAN_OPTIONS = ['FREE', 'BASIC', 'LITE', 'PRO']

function SupabaseMembersTab() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [removing, setRemoving] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { users } = await api.admin.listUsers()
      setUsers(users)
    } catch (err) {
      setError(err?.message || apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function act(id, fn) {
    setBusyId(id)
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err?.message || apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {t('admin.members.intro')}
        </p>
        <button onClick={load} disabled={loading} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs`}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {t('admin.refresh')}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">{error}</p>}

      {loading && users === null && (
        <div className="flex justify-center py-10">
          <Loader2 size={22} className="animate-spin text-cyan-400" />
        </div>
      )}

      {users?.map((u) => {
        const isMe = u.email?.toLowerCase() === user?.email?.toLowerCase()
        const busy = busyId === u.id
        return (
          <div key={u.id} className={`flex flex-wrap items-center gap-3 rounded-xl border bg-slate-900/40 p-4 ${u.banned ? 'border-red-500/40' : 'border-slate-800'}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-sm font-bold text-slate-950">
              {(u.name || u.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                {u.name || u.email}
                {u.founder && <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">{t('admin.members.founder')}</span>}
                {isMe && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">{t('admin.members.you')}</span>}
                {u.banned && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">{t('admin.members.suspended')}</span>}
                {u.providers.map((p) => (
                  <span key={p} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                    {p === 'email' ? t('admin.members.email') : p}
                  </span>
                ))}
              </p>
              <p className="truncate text-xs text-slate-500">
                {u.email} · {t('admin.members.createdAt', { date: new Date(u.createdAt).toLocaleDateString('pt-BR') })}
                {u.lastSignInAt ? t('admin.members.lastSignIn', { date: new Date(u.lastSignInAt).toLocaleDateString('pt-BR') }) : ''}
              </p>
            </div>
            {/* No mobile os controles caem numa 2ª linha (w-full); no desktop, sm:contents os devolve à linha do membro */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:contents">
              <select
                className={`${inputCls} !w-28 !py-1.5 text-xs`}
                value={u.plan}
                disabled={busy || u.founder}
                title={u.founder ? t('admin.members.founderLocked') : undefined}
                onChange={(e) => act(u.id, () => api.admin.setPlan(u.id, e.target.value))}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {!isMe && !u.founder && (
                <>
                  <button
                    onClick={() => act(u.id, () => api.admin.setBan(u.id, !u.banned))}
                    disabled={busy}
                    title={u.banned ? t('admin.members.reactivateTitle') : t('admin.members.suspendTitle')}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      u.banned ? 'border-green-500/40 text-green-400 hover:bg-green-500/10' : 'border-slate-800 text-slate-400 hover:border-amber-500/40 hover:text-amber-400'
                    }`}
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                    {u.banned ? t('admin.members.reactivate') : t('admin.members.suspend')}
                  </button>
                  <button onClick={() => setRemoving(u)} disabled={busy} className="ml-auto text-slate-500 hover:text-red-400 sm:ml-0" title={t('admin.members.deleteAccount')}>
                    <X size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}

      {users?.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">{t('admin.members.empty')}</p>}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => act(removing.id, () => api.admin.removeUser(removing.id))}
        title={t('admin.members.deleteTitle')}
        message={t('admin.members.deleteMsg', { email: removing?.email })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Novidades da Plataforma (aparecem no dashboard e nas notificações)
// ---------------------------------------------------------------------------
function NewsTab() {
  const { t } = useI18n()
  const db = useDb()
  const [editing, setEditing] = useState(null) // null | 'new' | update
  const [deleting, setDeleting] = useState(null)
  const updates = [...db.all('platformUpdates')].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{t('admin.news.intro')}</p>
        <button className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setEditing('new')}>
          <Plus size={13} />
          {t('admin.news.publish')}
        </button>
      </div>

      {updates.map((u) => (
        <div key={u.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${u.tag === 'NOVO' ? 'bg-green-500/15 text-green-400' : u.tag === 'MELHORIA' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {u.tag}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100">{u.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{u.description}</p>
            <p className="mt-1 text-[10px] text-slate-600">{new Date(u.createdAt).toLocaleString('pt-BR')}</p>
          </div>
          <button onClick={() => setEditing(u)} className="text-slate-500 hover:text-slate-200" title={t('admin.news.edit')}>
            <Pencil size={14} />
          </button>
          <button onClick={() => setDeleting(u)} className="text-slate-500 hover:text-red-400" title={t('admin.news.delete')}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <NewsModal open={editing !== null} onClose={() => setEditing(null)} update={editing === 'new' ? null : editing} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => db.remove('platformUpdates', deleting.id)}
        title={t('admin.news.deleteTitle')}
        message={t('admin.news.deleteMsg', { title: deleting?.title })}
      />
    </div>
  )
}

function NewsModal({ open, onClose, update }) {
  const { t } = useI18n()
  const db = useDb()
  const [form, setForm] = useState({})
  const [init, setInit] = useState(false)
  if (open && !init) {
    setForm({ tag: update?.tag || 'NOVO', title: update?.title || '', description: update?.description || '' })
    setInit(true)
  }
  if (!open && init) setInit(false)

  function save(e) {
    e.preventDefault()
    if (update) db.update('platformUpdates', update.id, form)
    else db.insert('platformUpdates', form)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={update ? t('admin.news.modalEditTitle') : t('admin.news.modalNewTitle')}>
      <form onSubmit={save} className="space-y-4">
        <Field label={t('admin.news.type')}>
          <select className={inputCls} value={form.tag || 'NOVO'} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}>
            <option value="NOVO">NOVO</option>
            <option value="MELHORIA">MELHORIA</option>
            <option value="ATUALIZAÇÃO">ATUALIZAÇÃO</option>
          </select>
        </Field>
        <Field label={t('admin.news.titleField')}>
          <input className={inputCls} required value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label={t('admin.news.descField')}>
          <textarea className={`${inputCls} min-h-24 resize-y`} required value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('admin.cancel')}
          </button>
          <button type="submit" className={btnPrimary}>
            {update ? t('admin.save') : t('admin.news.publishBtn')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Membros — em produção (Supabase) lista os usuários reais; no modo local,
// as contas deste dispositivo.
// ---------------------------------------------------------------------------
function MembersTab() {
  const { isLocalMode } = useAuth()
  if (!isLocalMode) return <SupabaseMembersTab />
  return <LocalMembersTab />
}

function LocalMembersTab() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [, force] = useState(0)
  const [transferTo, setTransferTo] = useState(null)
  const [removing, setRemoving] = useState(null)

  const users = JSON.parse(localStorage.getItem('dp_local_users') || '{}')
  const adminEmail = localStorage.getItem('dp_local_admin')

  function setPlan(email, plan) {
    users[email] = { ...users[email], plan }
    localStorage.setItem('dp_local_users', JSON.stringify(users))
    // Se for a própria conta logada, reflete na sessão
    const session = JSON.parse(localStorage.getItem('dp_local_session') || 'null')
    if (session?.email === email) {
      localStorage.setItem('dp_local_session', JSON.stringify({ ...session, plan }))
    }
    force((v) => v + 1)
  }

  function transferAdmin(email) {
    localStorage.setItem('dp_local_admin', email)
    force((v) => v + 1)
  }

  function removeUser(email) {
    delete users[email]
    localStorage.setItem('dp_local_users', JSON.stringify(users))
    force((v) => v + 1)
  }

  const entries = Object.entries(users)

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {t('admin.members.localIntro')}
      </p>
      {entries.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">{t('admin.members.localEmpty')}</p>}
      {entries.map(([email, u]) => {
        const isThisAdmin = adminEmail === email
        return (
          <div key={email} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-sm font-bold text-slate-950">
              {(u.name || email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                {u.name || email}
                {isThisAdmin && (
                  <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                    <Crown size={9} />
                    {t('admin.members.admin')}
                  </span>
                )}
                {email === user?.email && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">{t('admin.members.youLower')}</span>}
              </p>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
            {u.plan === 'MASTER' ? (
              // Fundador: plano fixo (o servidor bloqueia alterar) — sem seletor.
              <span className="flex h-8 w-32 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-bold text-amber-400">
                {t('admin.members.founderPlan')}
              </span>
            ) : (
              <select className={`${inputCls} !w-32 !py-1.5 text-xs`} value={u.plan || 'FREE'} onChange={(e) => setPlan(email, e.target.value)}>
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            {!isThisAdmin && (
              <>
                <button onClick={() => setTransferTo(email)} className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
                  {t('admin.members.makeAdmin')}
                </button>
                <button onClick={() => setRemoving(email)} className="text-slate-500 hover:text-red-400" title={t('admin.members.removeAccount')}>
                  <X size={15} />
                </button>
              </>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={transferTo !== null}
        onClose={() => setTransferTo(null)}
        onConfirm={() => transferAdmin(transferTo)}
        title={t('admin.members.transferTitle')}
        message={t('admin.members.transferMsg', { email: transferTo })}
        confirmLabel={t('admin.members.transfer')}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removeUser(removing)}
        title={t('admin.members.removeTitle')}
        message={t('admin.members.removeMsg', { email: removing })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Academia — tutoriais exibidos na página Academia & Tutoriais
// ---------------------------------------------------------------------------
function AcademyTab() {
  const { t } = useI18n()
  const db = useDb()
  const { isLocalMode } = useAuth()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [remote, setRemote] = useState([])
  const [loading, setLoading] = useState(!isLocalMode)

  async function load() {
    if (isLocalMode) return
    setLoading(true)
    try {
      const { content } = await api.academy.list()
      setRemote(content || [])
    } catch {
      setRemote([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocalMode])

  const items = (isLocalMode ? [...db.all('academyContent')] : remote).sort(
    (a, b) => (a.section === 'setup' ? 0 : 1) - (b.section === 'setup' ? 0 : 1) || (a.position ?? 0) - (b.position ?? 0),
  )

  async function remove(item) {
    if (isLocalMode) db.remove('academyContent', item.id)
    else {
      try {
        await api.academy.remove(item.id)
      } catch {
        /* ignora */
      }
      load()
    }
    setDeleting(null)
  }

  const SECTION_LABEL = { setup: t('admin.academyTab.sectionSetup'), page: t('admin.academyTab.sectionPage') }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{t('admin.academyTab.intro')}</p>
        <button className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setEditing('new')}>
          <Plus size={13} />
          {t('admin.academyTab.newTutorial')}
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-slate-500">{t('common.loading')}</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <GraduationCap size={16} className="mt-0.5 shrink-0 text-cyan-400" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold text-slate-100">
                {item.title}
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${item.section === 'setup' ? 'bg-amber-500/15 text-amber-400' : 'bg-cyan-500/15 text-cyan-300'}`}>
                  {SECTION_LABEL[item.section] || SECTION_LABEL.page}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
              {item.embedUrl && <p className="mt-1 truncate text-[10px] text-cyan-400">{item.embedUrl}</p>}
            </div>
            <button onClick={() => setEditing(item)} className="text-slate-500 hover:text-slate-200" title={t('admin.academyTab.edit')}>
              <Pencil size={14} />
            </button>
            <button onClick={() => setDeleting(item)} className="text-slate-500 hover:text-red-400" title={t('admin.academyTab.delete')}>
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}

      <AcademyModal open={editing !== null} onClose={() => setEditing(null)} item={editing === 'new' ? null : editing} nextPosition={items.length} isLocalMode={isLocalMode} onSaved={load} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove(deleting)}
        title={t('admin.academyTab.deleteTitle')}
        message={t('admin.academyTab.deleteMsg', { title: deleting?.title })}
      />
    </div>
  )
}

function AcademyModal({ open, onClose, item, nextPosition, isLocalMode, onSaved }) {
  const { t } = useI18n()
  const db = useDb()
  const fileRef = useRef(null)
  const [form, setForm] = useState({})
  const [init, setInit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  if (open && !init) {
    setForm({
      section: item?.section || 'page',
      pageKey: item?.pageKey || '',
      title: item?.title || '',
      description: item?.description || '',
      body: item?.body || '',
      coverUrl: item?.coverUrl || '',
      embedUrl: item?.embedUrl || '',
    })
    setInit(true)
  }
  if (!open && init) setInit(false)

  async function pickCover(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await new Promise((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.readAsDataURL(file)
      })
      const opt = await optimizeDataUrl(dataUrl, file.type).catch(() => ({ dataURL: dataUrl }))
      const url = await persistMedia(opt.dataURL, { folder: 'academy', ext: 'jpg', contentType: 'image/jpeg' })
      setForm((f) => ({ ...f, coverUrl: url }))
    } finally {
      setUploading(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      if (isLocalMode) {
        if (item) db.update('academyContent', item.id, form)
        else db.insert('academyContent', { ...form, position: nextPosition })
      } else {
        await api.academy.save({ ...form, id: item?.id, position: item?.position ?? nextPosition })
        onSaved?.()
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? t('admin.academyTab.modalEditTitle') : t('admin.academyTab.modalNewTitle')} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.academyTab.sectionField')}>
            <select className={inputCls} value={form.section || 'page'} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}>
              <option value="page">{t('admin.academyTab.sectionPage')}</option>
              <option value="setup">{t('admin.academyTab.sectionSetup')}</option>
            </select>
          </Field>
          <Field label={t('admin.academyTab.pageKeyField')}>
            <input className={inputCls} placeholder="ex.: videos, referencias" value={form.pageKey || ''} onChange={(e) => setForm((f) => ({ ...f, pageKey: e.target.value }))} />
          </Field>
        </div>
        <Field label={t('admin.academyTab.titleField')}>
          <input className={inputCls} required value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label={t('admin.academyTab.descField')}>
          <textarea className={`${inputCls} min-h-16 resize-y`} value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label={t('admin.academyTab.bodyField')}>
          <textarea className={`${inputCls} min-h-40 resize-y`} placeholder={t('admin.academyTab.bodyPlaceholder')} value={form.body || ''} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        </Field>
        <Field label={t('admin.academyTab.coverField')}>
          <div className="flex items-center gap-2">
            <input className={inputCls} placeholder="https://... (ou envie uma imagem)" value={form.coverUrl || ''} onChange={(e) => setForm((f) => ({ ...f, coverUrl: e.target.value }))} />
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickCover} />
            <button type="button" className={`${btnGhost} shrink-0 !px-3 !py-2.5`} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : t('admin.academyTab.upload')}
            </button>
          </div>
          {form.coverUrl && <img src={form.coverUrl} alt="" className="mt-2 h-24 rounded-lg border border-slate-800 object-cover" />}
        </Field>
        <Field label={t('admin.academyTab.embedField')}>
          <input className={inputCls} placeholder="https://www.youtube.com/embed/..." value={form.embedUrl || ''} onChange={(e) => setForm((f) => ({ ...f, embedUrl: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('admin.cancel')}
          </button>
          <button type="submit" disabled={saving} className={`${btnPrimary} flex items-center gap-2`}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {t('admin.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Canais Removidos — curadoria da base pública
// ---------------------------------------------------------------------------
function RemovedTab() {
  const { t } = useI18n()
  const db = useDb()
  const [deleting, setDeleting] = useState(null)
  const channels = [...db.all('removedChannels')].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt))

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {t('admin.removedTab.intro')}
      </p>
      {channels.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
          <ShieldAlert size={15} className="shrink-0 text-red-400" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{c.name}</p>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{c.niche || 'Other'}</span>
          <span className="text-xs text-slate-500">{formatCompact(c.subs)} {t('admin.removedTab.subscribers')}</span>
          <button onClick={() => setDeleting(c)} className="text-slate-500 hover:text-red-400" title={t('admin.removedTab.removeTitle')}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => db.remove('removedChannels', deleting.id)}
        title={t('admin.removedTab.removeTitle')}
        message={t('admin.removedTab.removeMsg', { name: deleting?.name })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Descoberta automática (EXCLUSIVO do fundador) — enche a base global
// niche_channels sozinha. É "client-driven": roda no navegador do fundador
// enquanto esta aba estiver aberta (a Vercel é serverless, não roda loop
// persistente). Respeita um teto diário de buscas p/ não estourar a cota do
// YouTube, e pode ser ligada/desligada a qualquer momento (com confirmação).
// ---------------------------------------------------------------------------
// Texto de cada linha do log (o store guarda dados; a UI traduz).
function crawlLogText(e, t) {
  if (e.text) return e.text
  if (e.kind === 'stop') return t('admin.crawl.capReached', { cap: e.capReached })
  return t('admin.crawl.logChannels', { term: e.term, n: e.n })
}

function AutoCrawlTab() {
  const { t } = useI18n()
  // Estado vem do store global: a busca roda em segundo plano em qualquer página.
  const { running, current, sessionAdded, usedToday, cap, error, log, stats } = useAutoCrawl()
  const [confirm, setConfirm] = useState(null) // 'on' | 'off' | null
  const hasKeys = hasCrawlKeys()

  function applyToggle() {
    if (confirm === 'on') startCrawl(false)
    else if (confirm === 'off') stopCrawl()
    setConfirm(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500" dangerouslySetInnerHTML={{ __html: t('admin.crawl.intro') }} />

      {/* Base global */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
            <Database size={19} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-100">{formatCompact(stats.total)} {t('admin.crawl.channels')}</p>
            <p className="text-[11px] text-slate-500">{t('admin.crawl.inGlobalBase')}{stats.thisWeek > 0 ? t('admin.crawl.thisWeek', { n: formatCompact(stats.thisWeek) }) : ''}</p>
          </div>
        </div>
        <button onClick={() => refreshCrawlStats()} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs`}>
          <RefreshCw size={12} />
          {t('admin.refresh')}
        </button>
      </div>

      {!hasKeys && (
        <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-400" dangerouslySetInnerHTML={{ __html: t('admin.crawl.noKeys') }} />
      )}
      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-400">{error}</p>}

      {/* Controle liga/desliga */}
      <div className={`rounded-xl border p-4 ${running ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${running ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>
              <Radar size={18} className={running ? 'animate-pulse' : ''} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-100">{t('admin.crawl.statusLabel', { state: running ? t('admin.crawl.searchOn') : t('admin.crawl.searchOff') })}</p>
              <p className="text-[11px] text-slate-500">
                {running ? (current ? t('admin.crawl.searching', { term: current }) : t('admin.crawl.starting')) : t('admin.crawl.readyToStart')}
              </p>
              {running && <p className="mt-0.5 text-[11px] font-medium text-cyan-400/80">{t('admin.crawl.backgroundNote')}</p>}
            </div>
          </div>
          <button
            onClick={() => setConfirm(running ? 'off' : 'on')}
            disabled={!hasKeys && !running}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
              running ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
            }`}
          >
            {running ? <><Pause size={15} /> {t('admin.crawl.turnOff')}</> : <><Play size={15} /> {t('admin.crawl.turnOn')}</>}
          </button>
        </div>

        {/* Métricas da sessão */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-900/60 px-2 py-2.5">
            <p className="text-base font-bold text-cyan-300">{sessionAdded}</p>
            <p className="text-[10px] text-slate-500">{t('admin.crawl.sessionChannels')}</p>
          </div>
          <div className="rounded-lg bg-slate-900/60 px-2 py-2.5">
            <p className="text-base font-bold text-slate-200">{usedToday}<span className="text-slate-600">/{cap}</span></p>
            <p className="text-[10px] text-slate-500">{t('admin.crawl.searchesToday')}</p>
          </div>
          <div className="rounded-lg bg-slate-900/60 px-2 py-2.5">
            <label className="block text-[10px] text-slate-500">{t('admin.crawl.dailyCap')}</label>
            <input
              type="number"
              min="10"
              max="2000"
              value={cap}
              disabled={running}
              onChange={(e) => setCrawlCap(e.target.value)}
              className="mt-0.5 w-full bg-transparent text-center text-base font-bold text-slate-200 outline-none disabled:opacity-60"
            />
          </div>
        </div>
      </div>

      {/* Log ao vivo */}
      {log.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('admin.crawl.recentActivity')}</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {log.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.kind === 'ok' ? 'bg-green-400' : e.kind === 'err' ? 'bg-red-400' : 'bg-amber-400'}`} />
                <span className={`flex-1 truncate ${e.kind === 'err' ? 'text-red-400' : 'text-slate-400'}`}>{crawlLogText(e, t)}</span>
                <span className="shrink-0 text-[10px] text-slate-600">{new Date(e.id).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={applyToggle}
        danger={confirm === 'off'}
        confirmLabel={confirm === 'off' ? t('admin.crawl.turnOff') : t('admin.crawl.turnOn')}
        title={confirm === 'off' ? t('admin.crawl.confirmOffTitle') : t('admin.crawl.confirmOnTitle')}
        message={
          confirm === 'off'
            ? t('admin.crawl.confirmOffMsg')
            : t('admin.crawl.confirmOnMsg', { cap })
        }
      />
    </div>
  )
}
