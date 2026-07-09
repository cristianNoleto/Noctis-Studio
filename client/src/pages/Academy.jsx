import { useState } from 'react'
import { GraduationCap, PlayCircle, X, FileDown } from 'lucide-react'

// Conteúdo institucional — no backend real vira a tabela academy_content
// gerenciada por um painel admin.
const CONTENT = [
  {
    id: 1,
    title: 'Primeiros passos no Noctis Studio',
    description: 'Tour completo pela plataforma: canais, pipeline de vídeos e roteiros.',
    embedUrl: '',
    materials: [],
  },
  {
    id: 2,
    title: 'Como usar tags e prompts recomendados',
    description: 'Monte sua biblioteca de prompts e vincule aos canais.',
    embedUrl: '',
    materials: [],
  },
  {
    id: 3,
    title: 'Dobra de Nicho na prática',
    description: 'Do canal semente ao mapa radial: replicando formatos vencedores.',
    embedUrl: '',
    materials: [],
  },
  {
    id: 4,
    title: 'Rotação de chaves da YouTube API',
    description: 'Configure 5 chaves e nunca mais pare por cota estourada.',
    embedUrl: '',
    materials: [],
  },
]

export default function Academy() {
  const [playing, setPlaying] = useState(null)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Academia & Tutoriais</h1>
        <p className="mt-1 text-sm text-slate-500">Aprenda a extrair o máximo de cada ferramenta da plataforma.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CONTENT.map((item) => (
          <button
            key={item.id}
            onClick={() => setPlaying(item)}
            className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 text-left transition-colors hover:border-cyan-500/40"
          >
            <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
              <GraduationCap size={36} className="text-slate-700 transition-colors group-hover:text-cyan-500/50" />
              <PlayCircle size={44} className="absolute text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="p-4">
              <p className="font-semibold text-slate-100">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
            </div>
          </button>
        ))}
      </div>

      {playing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={() => setPlaying(null)}>
          <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-950" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <p className="font-semibold text-slate-100">{playing.title}</p>
              <button onClick={() => setPlaying(null)} className="text-slate-500 hover:text-slate-300">
                <X size={18} />
              </button>
            </div>
            <div className="flex aspect-video items-center justify-center bg-black">
              {playing.embedUrl ? (
                <iframe src={playing.embedUrl} title={playing.title} className="h-full w-full" allowFullScreen />
              ) : (
                <p className="px-8 text-center text-sm text-slate-600">
                  O vídeo deste tutorial será publicado em breve — os conteúdos da Academia são gerenciados pelo painel admin.
                </p>
              )}
            </div>
            {playing.materials?.length > 0 && (
              <div className="space-y-2 px-5 py-4">
                <p className="text-xs font-semibold tracking-wide text-slate-400">MATERIAIS DE APOIO</p>
                {playing.materials.map((m, i) => (
                  <a key={i} href={m.url} className="flex items-center gap-2 text-sm text-cyan-400 hover:underline">
                    <FileDown size={14} />
                    {m.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
