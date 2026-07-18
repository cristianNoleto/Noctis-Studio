import { MessageCircle, ExternalLink, LifeBuoy, Mail } from 'lucide-react'
import { useI18n } from '../i18n'

const WHATSAPP_COMMUNITY_URL = import.meta.env.VITE_WHATSAPP_COMMUNITY_URL || ''
const DISCORD_URL = import.meta.env.VITE_DISCORD_URL || ''
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || ''

export default function Support() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('support.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('support.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SupportCard
          href={WHATSAPP_COMMUNITY_URL}
          icon={<MessageCircle size={22} className="text-green-400" />}
          cls="border-green-500/30 hover:bg-green-500/5"
          title={t('support.whatsappTitle')}
          desc={t('support.whatsappDesc')}
        />
        <SupportCard
          href={DISCORD_URL}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400" aria-hidden="true">
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          }
          cls="border-indigo-500/30 hover:bg-indigo-500/5"
          title={t('support.discordTitle')}
          desc={t('support.discordDesc')}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <LifeBuoy size={20} />
          </div>
          <div>
            <p className="font-semibold text-slate-100">{t('support.directTitle')}</p>
            <p className="text-xs text-slate-500">{t('support.directDesc')}</p>
          </div>
          {SUPPORT_EMAIL ? (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="ml-auto flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600">
              <Mail size={15} />
              {t('support.sendEmail')}
            </a>
          ) : (
            <span className="ml-auto rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-500">CONFIGURE VITE_SUPPORT_EMAIL</span>
          )}
        </div>
      </div>
    </div>
  )
}

function SupportCard({ href, icon, title, desc, cls }) {
  const inner = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-100">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{desc}</p>
      </div>
      <ExternalLink size={15} className="shrink-0 text-slate-600" />
    </>
  )
  const base = `flex items-center gap-4 rounded-xl border bg-slate-900/40 p-5 transition-colors ${cls}`
  if (!href) {
    return (
      <div className={`${base} opacity-70`}>
        {inner}
      </div>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
      {inner}
    </a>
  )
}
