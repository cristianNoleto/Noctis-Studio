import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldCheck, Sparkles, Users, GraduationCap, ShieldAlert, Plus, Pencil, Trash2, Crown, X, Loader2, RefreshCw, Ban } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, ConfirmDialog, formatCompact } from '../components/ui'
import { Field } from './channels/ChannelsList'

// -----------------------------------------------------------------------------
// Área de Administração — permissões acima do usuário MASTER:
//   • Publicar/editar/excluir Novidades da Plataforma (feed do dashboard + sino)
//   • Gerenciar membros: plano de cada conta e transferência do papel de admin
//   • Gerenciar conteúdos da Academia
//   • Curadoria da base de Canais Removidos
// Usuários comuns (mesmo MASTER) não veem esta página.
// -----------------------------------------------------------------------------

const TABS = [
  ['news', 'Novidades', Sparkles],
  ['members', 'Membros', Users],
  ['academy', 'Academia', GraduationCap],
  ['removed', 'Canais Removidos', ShieldAlert],
]

export default function Admin() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('news')

  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Administração</h1>
          <p className="text-sm text-slate-500">Controles exclusivos do administrador — publicações, membros e curadoria da plataforma.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'news' && <NewsTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'academy' && <AcademyTab />}
      {tab === 'removed' && <RemovedTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Membros (produção/Supabase) — lista real de usuários da plataforma, direto
// do site: mudar plano, suspender/reativar e excluir contas.
// ---------------------------------------------------------------------------
const PLAN_OPTIONS = ['FREE', 'BASIC', 'LITE', 'PRO', 'MASTER']

function SupabaseMembersTab() {
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
          Todos os usuários da plataforma (Supabase Auth) — sem precisar entrar no painel do Supabase.
        </p>
        <button onClick={load} disabled={loading} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs`}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Atualizar
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
                {u.founder && <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">🛡️ FUNDADOR</span>}
                {isMe && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">👑 VOCÊ</span>}
                {u.banned && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">SUSPENSO</span>}
                {u.providers.map((p) => (
                  <span key={p} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                    {p === 'email' ? 'e-mail' : p}
                  </span>
                ))}
              </p>
              <p className="truncate text-xs text-slate-500">
                {u.email} · criado {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                {u.lastSignInAt ? ` · último acesso ${new Date(u.lastSignInAt).toLocaleDateString('pt-BR')}` : ''}
              </p>
            </div>
            <select
              className={`${inputCls} !w-28 !py-1.5 text-xs`}
              value={u.plan}
              disabled={busy || u.founder}
              title={u.founder ? 'Conta blindada do fundador — não pode ser alterada' : undefined}
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
                  title={u.banned ? 'Reativar conta' : 'Suspender conta (não consegue mais logar)'}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    u.banned ? 'border-green-500/40 text-green-400 hover:bg-green-500/10' : 'border-slate-800 text-slate-400 hover:border-amber-500/40 hover:text-amber-400'
                  }`}
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                  {u.banned ? 'Reativar' : 'Suspender'}
                </button>
                <button onClick={() => setRemoving(u)} disabled={busy} className="text-slate-500 hover:text-red-400" title="Excluir conta">
                  <X size={15} />
                </button>
              </>
            )}
          </div>
        )
      })}

      {users?.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">Nenhum usuário ainda.</p>}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => act(removing.id, () => api.admin.removeUser(removing.id))}
        title="Excluir conta"
        message={`Excluir a conta ${removing?.email}? O login deixa de existir — essa ação não pode ser desfeita.`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Novidades da Plataforma (aparecem no dashboard e nas notificações)
// ---------------------------------------------------------------------------
function NewsTab() {
  const db = useDb()
  const [editing, setEditing] = useState(null) // null | 'new' | update
  const [deleting, setDeleting] = useState(null)
  const updates = [...db.all('platformUpdates')].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">O que você publicar aqui aparece em "Novidades da Plataforma" no dashboard e no sino de notificações.</p>
        <button className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setEditing('new')}>
          <Plus size={13} />
          Publicar novidade
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
          <button onClick={() => setEditing(u)} className="text-slate-500 hover:text-slate-200" title="Editar">
            <Pencil size={14} />
          </button>
          <button onClick={() => setDeleting(u)} className="text-slate-500 hover:text-red-400" title="Excluir">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <NewsModal open={editing !== null} onClose={() => setEditing(null)} update={editing === 'new' ? null : editing} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => db.remove('platformUpdates', deleting.id)}
        title="Excluir novidade"
        message={`Excluir "${deleting?.title}" do feed e das notificações?`}
      />
    </div>
  )
}

function NewsModal({ open, onClose, update }) {
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
    <Modal open={open} onClose={onClose} title={update ? 'Editar novidade' : 'Publicar novidade'}>
      <form onSubmit={save} className="space-y-4">
        <Field label="TIPO">
          <select className={inputCls} value={form.tag || 'NOVO'} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}>
            <option value="NOVO">NOVO</option>
            <option value="MELHORIA">MELHORIA</option>
            <option value="ATUALIZAÇÃO">ATUALIZAÇÃO</option>
          </select>
        </Field>
        <Field label="TÍTULO">
          <input className={inputCls} required value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label="DESCRIÇÃO">
          <textarea className={`${inputCls} min-h-24 resize-y`} required value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            {update ? 'Salvar' : 'Publicar'}
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
        Contas registradas neste dispositivo (modo local). Com o Supabase ativo, esta aba passa a listar todos os usuários da plataforma.
      </p>
      {entries.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">Nenhuma conta registrada.</p>}
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
                    ADMIN
                  </span>
                )}
                {email === user?.email && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">você</span>}
              </p>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
            <select className={`${inputCls} !w-32 !py-1.5 text-xs`} value={u.plan || 'MASTER'} onChange={(e) => setPlan(email, e.target.value)}>
              <option value="FREE">FREE</option>
              <option value="PRO">PRO</option>
              <option value="MASTER">MASTER</option>
            </select>
            {!isThisAdmin && (
              <>
                <button onClick={() => setTransferTo(email)} className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
                  Tornar admin
                </button>
                <button onClick={() => setRemoving(email)} className="text-slate-500 hover:text-red-400" title="Remover conta">
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
        title="Transferir administração"
        message={`Só existe um admin por instalação. Transferir para ${transferTo}? Você perde o acesso a esta área.`}
        confirmLabel="Transferir"
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removeUser(removing)}
        title="Remover conta"
        message={`Remover a conta ${removing}? Os dados locais dela permanecem no dispositivo, mas o login deixa de existir.`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Academia — tutoriais exibidos na página Academia & Tutoriais
// ---------------------------------------------------------------------------
function AcademyTab() {
  const db = useDb()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const items = [...db.all('academyContent')].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Tutoriais exibidos na página Academia & Tutoriais. Use URLs de embed (YouTube: youtube.com/embed/ID).</p>
        <button className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setEditing('new')}>
          <Plus size={13} />
          Novo tutorial
        </button>
      </div>
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <GraduationCap size={16} className="mt-0.5 shrink-0 text-cyan-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100">{item.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
            {item.embedUrl ? (
              <p className="mt-1 truncate text-[10px] text-cyan-400">{item.embedUrl}</p>
            ) : (
              <p className="mt-1 text-[10px] text-slate-600">sem vídeo — aparece como "em breve"</p>
            )}
          </div>
          <button onClick={() => setEditing(item)} className="text-slate-500 hover:text-slate-200" title="Editar">
            <Pencil size={14} />
          </button>
          <button onClick={() => setDeleting(item)} className="text-slate-500 hover:text-red-400" title="Excluir">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <AcademyModal open={editing !== null} onClose={() => setEditing(null)} item={editing === 'new' ? null : editing} nextPosition={items.length} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => db.remove('academyContent', deleting.id)}
        title="Excluir tutorial"
        message={`Excluir "${deleting?.title}" da Academia?`}
      />
    </div>
  )
}

function AcademyModal({ open, onClose, item, nextPosition }) {
  const db = useDb()
  const [form, setForm] = useState({})
  const [init, setInit] = useState(false)
  if (open && !init) {
    setForm({ title: item?.title || '', description: item?.description || '', embedUrl: item?.embedUrl || '' })
    setInit(true)
  }
  if (!open && init) setInit(false)

  function save(e) {
    e.preventDefault()
    if (item) db.update('academyContent', item.id, form)
    else db.insert('academyContent', { ...form, position: nextPosition })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Editar tutorial' : 'Novo tutorial'}>
      <form onSubmit={save} className="space-y-4">
        <Field label="TÍTULO">
          <input className={inputCls} required value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label="DESCRIÇÃO">
          <textarea className={`${inputCls} min-h-16 resize-y`} value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label="URL DO VÍDEO (EMBED)">
          <input className={inputCls} placeholder="https://www.youtube.com/embed/..." value={form.embedUrl || ''} onChange={(e) => setForm((f) => ({ ...f, embedUrl: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Salvar
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
  const db = useDb()
  const [deleting, setDeleting] = useState(null)
  const channels = [...db.all('removedChannels')].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt))

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Base curada exibida em Tendências → Canais Removidos. Para registrar novos casos, use o botão "Registrar caso" na própria página — aqui você remove entradas incorretas.
      </p>
      {channels.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
          <ShieldAlert size={15} className="shrink-0 text-red-400" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{c.name}</p>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{c.niche || 'Other'}</span>
          <span className="text-xs text-slate-500">{formatCompact(c.subs)} inscritos</span>
          <button onClick={() => setDeleting(c)} className="text-slate-500 hover:text-red-400" title="Remover da base">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => db.remove('removedChannels', deleting.id)}
        title="Remover da base"
        message={`Remover "${deleting?.name}" da base de canais removidos?`}
      />
    </div>
  )
}
