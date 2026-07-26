import { useEffect, useState } from 'react'
import { GraduationCap, PlayCircle, X, FileDown, Rocket, BookOpen, ChevronRight } from 'lucide-react'
import { useDb } from '../lib/db'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { useI18n } from '../i18n'

// Academia & Tutoriais. O conteúdo é GLOBAL (servidor): o fundador edita em
// /admin → Academia e todos os usuários veem. Em modo local (dev) cai no seed.
export default function Academy() {
  const db = useDb()
  const { isLocalMode } = useAuth()
  const { t } = useI18n()
  const [playing, setPlaying] = useState(null)
  const [remote, setRemote] = useState(null) // null = carregando

  useEffect(() => {
    if (isLocalMode) { setRemote([]); return }
    api.academy
      .list()
      .then(({ content }) => setRemote(content || []))
      .catch(() => setRemote([]))
  }, [isLocalMode])

  // Produção usa o conteúdo do servidor; local usa o seed do db.
  const all = isLocalMode ? [...db.all('academyContent')] : remote || []
  const setup = all.filter((i) => i.section === 'setup').sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const pages = all.filter((i) => i.section !== 'setup').sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const loading = !isLocalMode && remote === null

  return (
    <div className="mx-auto max-w-[1500px] space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('academy.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('academy.subtitle')}</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
          <GraduationCap size={32} className="text-slate-700" />
          <p className="text-sm text-slate-400">{t('academy.empty')}</p>
        </div>
      ) : (
        <>
          {/* Guia: configurar do zero */}
          {setup.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Rocket size={17} className="text-cyan-400" />
                <h2 className="text-lg font-semibold text-slate-100">{t('academy.setupTitle')}</h2>
              </div>
              <p className="-mt-1 text-xs text-slate-500">{t('academy.setupSubtitle')}</p>
              <ol className="space-y-2">
                {setup.map((item, i) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setPlaying(item)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left transition-colors hover:border-cyan-500/40"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-100">{item.title}</span>
                        {item.description && <span className="block truncate text-xs text-slate-500">{item.description}</span>}
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-slate-600 transition-colors group-hover:text-cyan-400" />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Tutoriais por página */}
          {pages.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen size={17} className="text-cyan-400" />
                <h2 className="text-lg font-semibold text-slate-100">{t('academy.pagesTitle')}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pages.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPlaying(item)}
                    className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 text-left transition-colors hover:border-cyan-500/40"
                  >
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950">
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <GraduationCap size={36} className="text-slate-700 transition-colors group-hover:text-cyan-500/50" />
                      )}
                      {item.embedUrl && <PlayCircle size={44} className="absolute text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100" />}
                    </div>
                    <div className="p-4">
                      <p className="font-semibold text-slate-100">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {playing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={() => setPlaying(null)}>
          <div className="max-h-[90vh] w-full max-w-[920px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-5 py-3.5">
              <p className="font-semibold text-slate-100">{playing.title}</p>
              <button onClick={() => setPlaying(null)} className="text-slate-500 hover:text-slate-300">
                <X size={18} />
              </button>
            </div>
            {playing.embedUrl ? (
              <div className="flex aspect-video items-center justify-center bg-black">
                <iframe src={playing.embedUrl} title={playing.title} className="h-full w-full" allowFullScreen />
              </div>
            ) : playing.coverUrl ? (
              <img src={playing.coverUrl} alt="" className="max-h-[45vh] w-full object-contain bg-black" />
            ) : null}
            <div className="space-y-4 px-6 py-5">
              {playing.description && <p className="text-sm font-medium text-slate-300">{playing.description}</p>}
              {playing.body ? (
                <div className="whitespace-pre-line text-sm leading-relaxed text-slate-400">{playing.body}</div>
              ) : (
                !playing.embedUrl && !playing.description && <p className="text-sm text-slate-600">{t('academy.comingSoon')}</p>
              )}
              {playing.materials?.length > 0 && (
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <p className="text-xs font-semibold tracking-wide text-slate-400">{t('academy.materials')}</p>
                  {playing.materials.map((m, i) => (
                    <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-cyan-400 hover:underline">
                      <FileDown size={14} />
                      {m.label || m.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
