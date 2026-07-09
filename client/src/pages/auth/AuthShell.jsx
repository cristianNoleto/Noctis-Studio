import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Volume2, Compass, Flame, LineChart, Monitor } from 'lucide-react'
import Logo from '../../components/Logo'
import WhatsAppWidget from '../../components/WhatsAppWidget'
import { useI18n } from '../../i18n'

const DISCORD_URL = import.meta.env.VITE_DISCORD_URL || 'https://discord.com'
const YOUTUBE_URL = import.meta.env.VITE_YOUTUBE_URL || 'https://youtube.com'

const features = [
  { key: 'audio', Icon: Volume2 },
  { key: 'niche', Icon: Compass },
  { key: 'viral', Icon: Flame },
  { key: 'insights', Icon: LineChart },
  { key: 'app', Icon: Monitor },
]

const avatarColors = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-sky-500']

function YoutubeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
    </svg>
  )
}

function DiscordIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

export default function AuthShell({ children }) {
  const { t, lang, setLang } = useI18n()
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSlide((s) => (s + 1) % features.length), 4000)
    return () => clearInterval(timer)
  }, [])

  const { Icon, key } = features[slide]

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Lado esquerdo — banner institucional */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-slate-800 p-10 lg:flex">
        <div className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

        <Logo size="lg" />

        <div className="relative z-10 space-y-10">
          <h1 className="max-w-md text-4xl font-extrabold leading-tight text-slate-100">
            {t('auth.slogan')}
          </h1>

          <div className="h-32">
            <AnimatePresence mode="wait">
              <motion.div
                key={key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="flex max-w-md items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                  <Icon size={22} />
                </div>
                <div>
                  <p className="font-semibold text-slate-100">{t(`auth.features.${key}.title`)}</p>
                  <p className="mt-1 text-sm text-slate-400">{t(`auth.features.${key}.desc`)}</p>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="mt-4 flex gap-1.5">
              {features.map((f, i) => (
                <button
                  key={f.key}
                  onClick={() => setSlide(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-6 bg-cyan-500' : 'w-1.5 bg-slate-700'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {avatarColors.map((c) => (
                <div key={c} className={`h-8 w-8 rounded-full border-2 border-slate-950 ${c}`} />
              ))}
            </div>
            <span className="text-sm text-slate-400">{t('auth.socialProof')}</span>
            <span className="text-indigo-400">
              <DiscordIcon size={18} />
            </span>
          </div>
        </div>

        <div className="relative z-10 flex gap-4 text-slate-500">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            className="transition-colors hover:text-indigo-400"
          >
            <DiscordIcon />
          </a>
          <a
            href={YOUTUBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="YouTube"
            className="transition-colors hover:text-red-500"
          >
            <YoutubeIcon />
          </a>
        </div>
      </div>

      {/* Lado direito — formulário */}
      <div className="relative flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="absolute right-6 top-6 flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1 text-sm">
          {[
            { code: 'pt', flag: 'br', label: 'PT' },
            { code: 'en', flag: 'us', label: 'EN' },
          ].map(({ code, flag, label }) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                lang === code ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <img src={`https://flagcdn.com/w40/${flag}.png`} alt="" className="h-3.5 w-5 rounded-[2px] object-cover" />
              {label}
            </button>
          ))}
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>

      <WhatsAppWidget />
    </div>
  )
}
