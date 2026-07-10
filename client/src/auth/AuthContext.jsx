import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, isLocalMode } from '../lib/supabase'

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
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(sessionToUser(session))
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

  // Admin: no modo local é a primeira conta criada; no Supabase é a
  // allowlist VITE_ADMIN_EMAILS (ou is_admin em app_metadata).
  const isAdmin = isLocalMode
    ? !!user?.email && localStorage.getItem(LOCAL_ADMIN_KEY) === user.email
    : !!user?.email && (ADMIN_EMAILS.includes(user.email.toLowerCase()) || !!user?.isAdmin)

  const value = useMemo(
    () => ({
      user,
      loading,
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
      isLocalMode,
      isAdmin,
    }),
    [user, loading, signIn, signUp, signInWithGoogle, resetPassword, signOut, linkGoogle, unlinkIdentity, updateEmail, updatePassword, getAccessToken, refreshUser, isAdmin],
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
