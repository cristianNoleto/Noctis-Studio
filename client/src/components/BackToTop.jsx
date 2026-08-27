import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { useI18n } from '../i18n'

// Botão flutuante "voltar ao topo". Aparece só depois de rolar um pouco o
// container alvo (o <main> do Layout), em qualquer aparelho. Fica no canto,
// discreto, sem atrapalhar a navegação. Toque grande no mobile, menor no desktop.
export default function BackToTop({ scrollTargetId = 'main-scroll', threshold = 400 }) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = document.getElementById(scrollTargetId)
    if (!el) return
    const onScroll = () => setShow(el.scrollTop > threshold)
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollTargetId, threshold])

  if (!show) return null
  return (
    <button
      onClick={() => document.getElementById(scrollTargetId)?.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={t('common.backToTop')}
      title={t('common.backToTop')}
      className="fixed bottom-5 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-200 shadow-lg backdrop-blur transition-all hover:border-cyan-500/60 hover:text-cyan-300 active:scale-95 sm:bottom-6 sm:right-6 sm:h-10 sm:w-10"
    >
      <ArrowUp size={18} />
    </button>
  )
}
