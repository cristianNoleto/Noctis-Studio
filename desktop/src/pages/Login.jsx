import { ExternalLink, LogIn, ShieldCheck, X } from 'lucide-react'
import { Mark } from '../components/Logo'
import { call } from '../lib/api'
import { btnGhost, btnPrimary, Spinner } from '../components/ui'

// Trava do app: sem conta Noctis conectada, nada além desta tela.
export default function Login({ auth }) {
  const waiting = auth.status === 'waiting_browser'
  const checking = auth.status === 'checking'
  return (
    <div className="flex h-full flex-col">
      <div className="drag h-10 shrink-0" />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,242,254,0.08),transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-48 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,184,204,0.06),transparent_65%)]" />
        <div className="fade-up relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-9 text-center shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-6 flex justify-center"><Mark className="h-16 w-16 drop-shadow-[0_0_24px_rgba(0,242,254,0.35)]" /></div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight">Noctis <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">Studio</span></h1>
          <p className="mb-7 text-sm leading-relaxed text-slate-400">
            O app é exclusivo para quem tem conta no Noctis Studio. Entre com a mesma conta do site.
          </p>

          {checking ? (
            <div className="flex items-center justify-center gap-3 py-3 text-sm text-slate-400"><Spinner /> Conferindo sua conta…</div>
          ) : waiting ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">
                <Spinner /> Confirme no navegador que abriu…
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                No site, clique em <b className="text-slate-300">Conectar este computador</b>. Se o navegador não abriu, use o botão abaixo.
              </p>
              <div className="flex gap-2">
                <button className={`${btnGhost} flex-1`} onClick={() => call('auth:cancel')}><X size={15} /> Cancelar</button>
                <button className={`${btnGhost} flex-1`} onClick={() => call('sys:openExternal', auth.link)}><ExternalLink size={15} /> Abrir de novo</button>
              </div>
            </div>
          ) : (
            <button className={`${btnPrimary} w-full py-3 text-[15px]`} onClick={() => call('auth:signin')}>
              <LogIn size={17} /> Entrar com minha conta Noctis
            </button>
          )}

          {auth.error && !waiting && <p className="mt-4 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-300">{auth.error}</p>}

          <div className="mt-7 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} /> Sua senha fica só no site</span>
            <button className="text-cyan-400 hover:underline" onClick={() => call('sys:openSite', '/register')}>Criar conta</button>
          </div>
        </div>
      </div>
    </div>
  )
}
