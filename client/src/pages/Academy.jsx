import { useState } from 'react'
import { GraduationCap, PlayCircle, X, FileDown } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'

export default function Academy() {
  const db = useDb()
  const { t } = useI18n()
  const [playing, setPlaying] = useState(null)
  // Conteúdo gerenciado pelo admin em /admin → Academia
  const CONTENT = [...db.all('academyContent')].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('academy.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('academy.subtitle')}</p>
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
          <div className="w-full max-w-[920px] rounded-xl border border-slate-800 bg-slate-950" onClick={(e) => e.stopPropagation()}>
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
                  {t('academy.comingSoon')}
                </p>
              )}
            </div>
            {playing.materials?.length > 0 && (
              <div className="space-y-2 px-5 py-4">
                <p className="text-xs font-semibold tracking-wide text-slate-400">{t('academy.materials')}</p>
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
