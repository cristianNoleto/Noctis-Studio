import { useState } from 'react'
import { ExternalLink, Eye, EyeOff, Globe, LogIn, Lock, Mail, ShieldCheck, UserRound, X } from 'lucide-react'
import { Mark } from '../components/Logo'
import { call } from '../lib/api'
import { btnGhost, btnPrimary, inputCls, Spinner } from '../components/ui'

// Trava do app: sem conta Noctis conectada, nada além desta tela.
// Duas formas de entrar: e-mail + senha aqui mesmo (com opção de lembrar, cifrado no Windows)
// ou pelo navegador (site já logado, Google etc.).
export default function Login({ auth }) {
  const waiting = auth.status === 'waiting_browser'
  const checking = auth.status === 'checking'
  const [email, setEmail] = useState(auth.salvo?.email || '')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function entrar(e) {
    e?.preventDefault()
    setErro(''); setEnviando(true)
    try { await call('auth:signinPassword', { email, password: senha, lembrar: lembrar && auth.podeSalvar }) }
    catch (err) { setErro(err.message) }
    finally { setEnviando(false) }
  }
  async function entrarSalvo() {
    setErro(''); setEnviando(true)
    try { await call('auth:signinSaved') } catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }

  const mensagem = erro || (!waiting && auth.error)
  return (
    <div className="flex h-full flex-col">
      <div className="drag h-10 shrink-0" />
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto overflow-x-hidden px-6 py-6">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,242,254,0.08),transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-48 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,184,204,0.06),transparent_65%)]" />
        <div className="fade-up relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-9 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-5 flex justify-center"><Mark className="h-14 w-14 drop-shadow-[0_0_24px_rgba(0,242,254,0.35)]" /></div>
          <h1 className="mb-1.5 text-center text-2xl font-bold tracking-tight">Noctis <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">Studio</span></h1>
          <p className="mb-6 text-center text-sm leading-relaxed text-slate-400">Exclusivo para quem tem conta no Noctis Studio. Entre com a mesma conta do site.</p>

          {checking || (enviando && !erro) ? (
            <div className="flex items-center justify-center gap-3 py-6 text-sm text-slate-400"><Spinner /> Conferindo sua conta…</div>
          ) : waiting ? (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200"><Spinner /> Confirme no navegador que abriu…</div>
              <p className="text-xs leading-relaxed text-slate-500">No site, clique em <b className="text-slate-300">Conectar este computador</b>. Se o navegador não abriu, use o botão abaixo.</p>
              <div className="flex gap-2">
                <button className={`${btnGhost} flex-1`} onClick={() => call('auth:cancel')}><X size={15} /> Cancelar</button>
                <button className={`${btnGhost} flex-1`} onClick={() => call('sys:openExternal', auth.link)}><ExternalLink size={15} /> Abrir de novo</button>
              </div>
            </div>
          ) : (
            <>
              {auth.salvo && (
                <button onClick={entrarSalvo} className="mb-5 flex w-full items-center gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-left hover:bg-cyan-500/10">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-slate-950"><UserRound size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-slate-100">Continuar como</span><span className="block truncate text-xs text-slate-400">{auth.salvo.email}</span></span>
                  <LogIn size={16} className="text-cyan-300" />
                </button>
              )}
              <form onSubmit={entrar} className="space-y-3">
                <label className="relative block">
                  <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className={`${inputCls} pl-10`} type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="relative block">
                  <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className={`${inputCls} pl-10 pr-10`} type={ver ? 'text' : 'password'} autoComplete="current-password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
                  <button type="button" onClick={() => setVer(!ver)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" title={ver ? 'Ocultar' : 'Mostrar'}>{ver ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </label>
                <div className="flex items-center justify-between text-xs">
                  <label className={`flex items-center gap-2 ${auth.podeSalvar ? 'text-slate-400' : 'text-slate-600'}`} title={auth.podeSalvar ? 'Fica cifrada no seu usuário do Windows; o app entra sozinho ao abrir.' : 'Este computador não tem cofre de senhas disponível.'}>
                    <input type="checkbox" className="accent-cyan-500" disabled={!auth.podeSalvar} checked={lembrar && auth.podeSalvar} onChange={(e) => setLembrar(e.target.checked)} /> Lembrar senha neste computador
                  </label>
                  <button type="button" className="text-cyan-400 hover:underline" onClick={() => call('sys:openSite', '/login')}>Esqueci a senha</button>
                </div>
                <button type="submit" disabled={!email || !senha} className={`${btnPrimary} w-full py-3 text-[15px]`}><LogIn size={17} /> Entrar</button>
              </form>
              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-600"><span className="h-px flex-1 bg-slate-800" />ou<span className="h-px flex-1 bg-slate-800" /></div>
              <button className={`${btnGhost} w-full py-2.5`} onClick={() => call('auth:signin')}><Globe size={15} /> Entrar pelo navegador (Google e outros)</button>
            </>
          )}

          {mensagem && <p className="mt-4 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-center text-xs text-red-300">{mensagem}</p>}

          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} /> Senha salva só cifrada, neste PC</span>
            <button className="text-cyan-400 hover:underline" onClick={() => call('sys:openSite', '/register')}>Criar conta</button>
          </div>
        </div>
      </div>
    </div>
  )
}
