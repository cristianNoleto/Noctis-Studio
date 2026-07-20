import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isLocalMode } from '../lib/supabase'
import { pullUserSettings } from '../lib/userSettings'

const AuthContext = createContext(null)

const LOCAL_SESSION_KEY = 'dp_local_session'
const LOCAL_USERS_KEY = 'dp_local_users'
const LOCAL_ADMIN_KEY = 'dp_local_admin'

// Admins em produção: lista de e-mails na env VITE_ADMIN_EMAILS (Vercel),
// separados por vírgula. Ex.: "cristian@exemplo.com,socio@exemplo.com"
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

// FUNDADOR: conta blindada. O(s) e-mail(s) em VITE_FOUNDER_EMAIL (Vercel) têm,
// PARA SEMPRE, acesso de fundador + plano MASTER + todas as funcionalidades —
// independente do que estiver salvo no banco. O painel Admin não consegue
// mudar plano, banir nem excluir essa conta (bloqueio também no servidor).
const FOUNDER_EMAILS = (import.meta.env.VITE_FOUNDER_EMAIL || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const isFounderEmail = (email) => !!email && FOUNDER_EMAILS.includes(email.toLowerCase())

// Modo local: a primeira conta criada vira o administrador da instalação.
function ensureLocalAdmin(email) {
  if (!localStorage.getItem(LOCAL_ADMIN_KEY)) localStorage.setItem(LOCAL_ADMIN_KEY, email)
}

function readLocalSession() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isLocalMode) {
      const session = readLocalSession()
      if (session?.email) ensureLocalAdmin(session.email)
      setUser(session)
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(sessionToUser(data.session))
      setLoading(false)
      if (data.session?.user) pullUserSettings().catch(() => {})
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(sessionToUser(session))
      // Ao logar, baixa as chaves de API salvas no servidor para este dispositivo.
      if (event === 'SIGNED_IN' && session?.user) pullUserSettings().catch(() => {})
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email, password) => {
    if (isLocalMode) {
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '{}')
      const found = users[email]
      if (!found || found.password !== password) {
        throw new Error('invalid_credentials')
      }
      const session = { email, name: found.name, plan: 'MASTER' }
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
      ensureLocalAdmin(email)
      setUser(session)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('invalid_credentials')
  }, [])

  const signUp = useCallback(async (name, email, password) => {
    if (isLocalMode) {
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '{}')
      users[email] = { name, password }
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users))
      const session = { email, name, plan: 'MASTER' }
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
      ensureLocalAdmin(email)
      setUser(session)
      return
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    })
    if (error) throw new Error('generic')
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (isLocalMode) {
      const session = { email: 'google@local.dev', name: 'Usuário Google', plan: 'MASTER' }
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
      setUser(session)
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw new Error('generic')
  }, [])

  const resetPassword = useCallback(async (email) => {
    if (isLocalMode) return
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
  }, [])

  const signOut = useCallback(async () => {
    if (isLocalMode) {
      localStorage.removeItem(LOCAL_SESSION_KEY)
      setUser(null)
      return
    }
    await supabase.auth.signOut()
  }, [])

  // ------ Vinculação de contas (Supabase) ------
  // Vincula uma identidade Google à conta LOGADA, mesmo com e-mails
  // diferentes — o e-mail principal da conta não muda.
  // Requer "Manual linking" ativado no painel do Supabase (Authentication).
  const linkGoogle = useCallback(async () => {
    if (isLocalMode) throw new Error('local_mode')
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/perfil` },
    })
    if (error) throw error
  }, [])

  const unlinkIdentity = useCallback(async (identity) => {
    if (isLocalMode) throw new Error('local_mode')
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) throw error
    await refreshUser()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Troca o e-mail PRINCIPAL (recebe confirmação por e-mail)
  const updateEmail = useCallback(async (newEmail) => {
    if (isLocalMode) throw new Error('local_mode')
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (newPassword) => {
    if (isLocalMode) throw new Error('local_mode')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }, [])

  // ------ 2FA / MFA (Supabase — TOTP de app autenticador, nativo e grátis) ------
  const refreshUserRef = useRef(null)
  const mfa = useMemo(
    () => ({
      // Nível de garantia atual x necessário (aal1 = só senha, aal2 = 2FA feito)
      async aal() {
        if (isLocalMode) return { currentLevel: 'aal1', nextLevel: 'aal1' }
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        return data || { currentLevel: 'aal1', nextLevel: 'aal1' }
      },
      // Fatores cadastrados (apps autenticadores)
      async factors() {
        if (isLocalMode) return []
        const { data } = await supabase.auth.mfa.listFactors()
        return data?.totp || []
      },
      // Inicia o cadastro de um app autenticador → devolve QR code + segredo
      async enroll() {
        if (isLocalMode) throw new Error('local_mode')
        // Remove fatores ainda não verificados que tenham sobrado de tentativas
        const { data: list } = await supabase.auth.mfa.listFactors()
        for (const f of list?.all || []) {
          if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
        if (error) throw error
        return data // { id, totp: { qr_code, secret, uri } }
      },
      // Confirma o cadastro com o código de 6 dígitos do app
      async activate(factorId, code) {
        const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId })
        if (ce) throw ce
        const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code })
        if (error) throw error
        await refreshUserRef.current?.()
      },
      // Verifica o código no login (step-up para aal2)
      async verifyLogin(factorId, code) {
        const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId })
        if (ce) throw ce
        const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code })
        if (error) throw error
      },
      // Desativa o 2FA
      async disable(factorId) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId })
        if (error) throw error
        await refreshUserRef.current?.()
      },
    }),
    [],
  ) // eslint-disable-line react-hooks/exhaustive-deps

  // Token JWT da sessão — usado pelas rotas /api/admin
  const getAccessToken = useCallback(async () => {
    if (isLocalMode) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }, [])

  const refreshUser = useCallback(async () => {
    if (isLocalMode) return
    const { data } = await supabase.auth.getSession()
    setUser(sessionToUser(data.session))
  }, [])
  refreshUserRef.current = refreshUser

  // Fundador: e-mail na allowlist VITE_FOUNDER_EMAIL. Blindado — nunca perde acesso.
  // No modo local (sem Supabase) o admin do dispositivo é o dono da instalação,
  // então também conta como fundador — permite testar as ferramentas dele.
  const isFounder =
    isFounderEmail(user?.email) || (isLocalMode && !!user?.email && localStorage.getItem(LOCAL_ADMIN_KEY) === user.email)

  // Admin: no modo local é a primeira conta criada; no Supabase é a
  // allowlist VITE_ADMIN_EMAILS (ou is_admin em app_metadata). O fundador é
  // SEMPRE admin, mesmo que não esteja em ADMIN_EMAILS ou perca o is_admin.
  const isAdmin = isFounder || (isLocalMode
    ? !!user?.email && localStorage.getItem(LOCAL_ADMIN_KEY) === user.email
    : !!user?.email && (ADMIN_EMAILS.includes(user.email.toLowerCase()) || !!user?.isAdmin))

  // Usuário exposto: o fundador tem plano MASTER forçado (todas as funcionalidades),
  // independente do que o app_metadata.plan disser.
  const exposedUser = useMemo(() => {
    if (!user) return null
    return { ...user, isFounder, plan: isFounder ? 'MASTER' : user.plan }
  }, [user, isFounder])

  const value = useMemo(
    () => ({
      user: exposedUser,
      loading,
      isFounder,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      linkGoogle,
      unlinkIdentity,
      updateEmail,
      updatePassword,
      getAccessToken,
      refreshUser,
      mfa,
      isLocalMode,
      isAdmin,
    }),
    [exposedUser, isFounder, loading, signIn, signUp, signInWithGoogle, resetPassword, signOut, linkGoogle, unlinkIdentity, updateEmail, updatePassword, getAccessToken, refreshUser, mfa, isAdmin],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function sessionToUser(session) {
  if (!session?.user) return null
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.user_metadata?.display_name || session.user.email.split('@')[0],
    plan: session.user.app_metadata?.plan || 'FREE',
    isAdmin: !!session.user.app_metadata?.is_admin,
    // Identidades vinculadas (email, google...) p/ a aba Segurança
    identities: (session.user.identities || []).map((i) => ({
      id: i.identity_id || i.id,
      provider: i.provider,
      email: i.identity_data?.email || null,
      raw: i,
    })),
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
