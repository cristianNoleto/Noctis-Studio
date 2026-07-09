import { useState } from 'react'
import { HelpCircle, ChevronDown, Tv, Compass, GitBranch, TrendingUp, KeyRound, Lightbulb, Mic, Eye, ShieldAlert, FileText } from 'lucide-react'

const SECTIONS = [
  {
    icon: Tv,
    title: 'Gestão de Canais',
    body: 'Crie um canal manualmente ou cole a URL/@handle do YouTube para importar nome, foto e estatísticas. Ao importar um canal ativo, todos os vídeos já publicados entram automaticamente com thumb, título, data, link e a tag "Agendado/Publicado". Dentro do canal você acompanha as 6 etapas de produção de cada vídeo (Título → Roteiro → Áudio → Thumbnail → Renderizado → Publicado), escreve roteiros com tempo de narração calculado (150 palavras/min ±15%) e exporta SRT/TXT. O menu ⋮ do canal tem: Editar, Criar Atalhos (com favicon do site), Compartilhar, Desvincular YouTube, Arquivar e Excluir.',
  },
  {
    icon: KeyRound,
    title: 'Chaves de API (Perfil → APIs)',
    body: 'O sistema é BYOK: as chaves são suas e ficam só no seu dispositivo. YouTube Data API v3 (até 5 chaves — quando uma estoura a cota diária, o sistema troca sozinho para a próxima; a cota reseta à meia-noite no horário do Pacífico). IA: Gemini (aistudio.google.com/apikey) com fallback automático entre os modelos gratuitos, e Groq (console.groq.com/keys) como alternativa grátis. AssemblyAI para transcrição e Pexels/Pixabay para o banco de mídia.',
  },
  {
    icon: Compass,
    title: 'Niche Finder',
    body: 'Busca canais ao vivo no YouTube (50 por página, botão "Mostrar mais" até acabar a listagem) e calcula métricas reais: views médias dos últimos vídeos, engajamento, cadência de postagem. As abas de tendência (Explodindo Agora, Subindo Rápido...) são classificações calculadas sobre esses números. Crescimento mensal exige 30 dias de acompanhamento — por isso alguns campos mostram "Coletando dados".',
  },
  {
    icon: TrendingUp,
    title: 'Vídeos Virais',
    body: 'Busca por palavra-chave com filtros de período, duração mínima (em segundos) e views mínimas. VPH = views ÷ horas desde a publicação. O círculo de engajamento é views do vídeo ÷ inscritos do canal — quanto maior, mais desproporcional (viral) é o alcance. Salve vídeos na aba "Vídeos Salvos" ou mande o canal direto para a Dobra de Nicho.',
  },
  {
    icon: GitBranch,
    title: 'Dobra de Nicho',
    body: 'Cole a URL de um canal semente: o sistema coleta os vídeos de maior desempenho e a IA monta o grafo de oportunidades — padrão vencedor, Mar de Ideias (com a VIRADA mais contraintuitiva), Dobra para outros nichos e Adaptação de Mercado. Os scores são estimativas de IA, não garantias. As análises ficam salvas e podem ser exportadas em TXT/PDF.',
  },
  {
    icon: Lightbulb,
    title: 'Quadro de Ideias, Prompts e Referências',
    body: 'O Quadro tem colunas personalizadas com cards de Nota (duplo clique edita) e Checklist, organizados por Espaços. A biblioteca de Prompts organiza por canal/categoria com tags e favoritos. Referências agrupa canais benchmark por nicho, vinculados a um canal seu ou Globais.',
  },
  {
    icon: Mic,
    title: 'Transcrição e Ferramentas de Texto',
    body: 'Arraste um MP3/WAV/MP4 para transcrever (chave AssemblyAI) e receba blocos por tempo com exportação TXT/SRT. Em Ferramentas de Texto: editor com legibilidade, gerador de SRT pelo tempo de leitura e divisor de roteiro para CapCut (nunca corta palavra no meio).',
  },
  {
    icon: Eye,
    title: 'Modo privado, tema e notificações',
    body: 'O olho no topo ativa o modo privado: nomes de canais, títulos e números ficam borrados em todas as páginas — ideal para gravar a tela. A lua alterna entre tema escuro e claro. O sino mostra as novidades da plataforma. A bandeira troca o idioma da interface (PT/EN).',
  },
  {
    icon: ShieldAlert,
    title: 'Canais Removidos',
    body: 'Base curada de canais que caíram — serve para estudar padrões de strike. O YouTube não expõe essa informação por API, então a base cresce com os casos registrados manualmente (botão "Registrar caso").',
  },
  {
    icon: FileText,
    title: 'Administração (só para o admin)',
    body: 'A primeira conta criada na instalação é a administradora. No menu do avatar → Administração, o admin publica Novidades da Plataforma (dashboard + sino), gerencia membros e planos, edita os tutoriais da Academia e faz a curadoria dos Canais Removidos. Usuários MASTER não têm acesso a essa área.',
  },
]

export default function Help() {
  const [open, setOpen] = useState(0)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
          <HelpCircle size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Central de Ajuda</h1>
          <p className="text-sm text-slate-500">As principais explicações sobre cada área do Noctis Studio.</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {SECTIONS.map((s, i) => (
          <div key={s.title} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-900/60">
              <s.icon size={17} className="shrink-0 text-cyan-400" />
              <p className="flex-1 font-semibold text-slate-100">{s.title}</p>
              <ChevronDown size={16} className={`text-slate-500 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="border-t border-slate-800 px-5 py-4 text-sm leading-relaxed text-slate-400">{s.body}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
