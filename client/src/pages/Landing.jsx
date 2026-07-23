import { Link } from 'react-router-dom'
import { Tv, FileText, Lightbulb, Bookmark, PenTool, Compass, ArrowRight } from 'lucide-react'
import Logo from '../components/Logo'

// Página inicial PÚBLICA (visitante não logado). Explica claramente a finalidade
// do Noctis Studio — necessária para a verificação do Google OAuth e boa prática.
const FEATURES = [
  { Icon: Tv, title: 'Gestão de canais', desc: 'Organize seus canais do YouTube, vídeos, etapas de produção e agendamentos num só lugar.' },
  { Icon: FileText, title: 'Roteiros', desc: 'Escreva e mantenha os roteiros de cada vídeo junto do resto do projeto.' },
  { Icon: Bookmark, title: 'Referências', desc: 'Guarde canais e vídeos de referência organizados por nicho.' },
  { Icon: Lightbulb, title: 'Quadro de ideias', desc: 'Planeje pautas em colunas de arrastar e soltar.' },
  { Icon: PenTool, title: 'Desenhos', desc: 'Quadro de desenho (estilo Excalidraw) para fluxogramas e rascunhos, salvos na nuvem.' },
  { Icon: Compass, title: 'Pesquisa de nichos', desc: 'Descubra nichos e vídeos com potencial para o seu conteúdo.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      {/* Cabeçalho */}
      <header className="border-b border-slate-800/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-slate-300 hover:text-slate-100">Entrar</Link>
            <Link to="/register" className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      {/* Herói — explica a finalidade do app */}
      <section className="mx-auto max-w-5xl px-5 py-16 text-center">
        <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight text-slate-100 sm:text-4xl">
          <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">Noctis Studio</span> — sua central para criar e gerenciar canais no YouTube
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400">
          O Noctis Studio é uma plataforma que reúne, num só lugar, tudo o que um criador de conteúdo precisa para
          produzir vídeos: gestão de canais e vídeos, roteiros, referências, quadro de ideias, ferramenta de desenho e
          pesquisa de nichos. Seus dados ficam salvos na nuvem e sincronizam entre seus dispositivos.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/register" className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
            Começar agora <ArrowRight size={16} />
          </Link>
          <Link to="/login" className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-600">
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Recursos */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                <Icon size={20} />
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Rodapé com legais */}
      <footer className="border-t border-slate-800/70">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Noctis Studio</span>
          <div className="flex gap-4">
            <Link to="/privacidade" className="hover:text-cyan-400">Política de Privacidade</Link>
            <Link to="/termos" className="hover:text-cyan-400">Termos de Serviço</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
