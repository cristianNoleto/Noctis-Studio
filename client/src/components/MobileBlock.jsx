import { Link } from 'react-router-dom'
import { Monitor, ArrowLeft } from 'lucide-react'
import { useIsMobile } from '../lib/useIsMobile'
import { useI18n } from '../i18n'

// Bloqueia uma ferramenta no celular e mostra um aviso amigável para abrir no
// PC. Usado nos Desenhos (Excalidraw): no celular não dá pra editar de verdade,
// então nem carregamos o editor pesado — só o aviso. No desktop, renderiza os
// filhos normalmente.
export default function MobileBlock({ children, back = '/' }) {
  const isMobile = useIsMobile()
  const { t } = useI18n()
  if (!isMobile) return children
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
        <Monitor size={30} />
      </div>
      <h2 className="mt-5 text-lg font-bold text-slate-100">{t('drawings.mobileBlockTitle')}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{t('drawings.mobileBlockBody')}</p>
      <Link
        to={back}
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 active:scale-[0.98]"
      >
        <ArrowLeft size={16} />
        {t('drawings.mobileBlockBack')}
      </Link>
    </div>
  )
}
