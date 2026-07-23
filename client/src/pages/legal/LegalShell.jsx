import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Logo from '../../components/Logo'

// E-mail de contato exibido nas páginas legais. Troque aqui se quiser outro.
export const CONTACT_EMAIL = 'cristian.noleto25@gmail.com'
export const LEGAL_UPDATED = '23 de julho de 2026'

// Casca comum das páginas públicas de Termos e Privacidade — layout limpo,
// legível, sem sidebar/header do app (são páginas públicas).
export default function LegalShell({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <header className="border-b border-slate-800/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
            <ArrowLeft size={14} />
            Voltar ao site
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
        <p className="mt-1 text-xs text-slate-500">Última atualização: {LEGAL_UPDATED}</p>
        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed">{children}</div>
        <div className="mt-12 flex gap-4 border-t border-slate-800 pt-6 text-xs text-slate-500">
          <Link to="/privacidade" className="hover:text-cyan-400">Política de Privacidade</Link>
          <Link to="/termos" className="hover:text-cyan-400">Termos de Serviço</Link>
        </div>
      </main>
    </div>
  )
}

// Seção com título — mantém a formatação consistente entre as páginas.
export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-slate-100">{title}</h2>
      <div className="space-y-2 text-slate-400">{children}</div>
    </section>
  )
}
