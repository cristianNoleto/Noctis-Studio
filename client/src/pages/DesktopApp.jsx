import { useEffect, useState } from 'react'
import { Monitor, Download, ArrowRight, TriangleAlert, ChevronDown, Link2, Users, Lock, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { btnPrimary } from '../components/ui'

// Página do Noctis Studio Desktop: download do instalador (só para quem tem
// conta — o link é temporário e gerado pelo servidor) e o passo a passo.
async function desktopApi(path, token) {
  const res = await fetch(`/api/desktop${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || `HTTP ${res.status}`), { code: data.error })
  return data
}

function formatSize(bytes) {
  if (!bytes) return ''
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

const STEPS = ['install', 'connect', 'accounts']
const GUIDE = ['download', 'smartscreen', 'install', 'open', 'login', 'accounts']

export default function DesktopApp() {
  const { t } = useI18n()
  const { getAccessToken } = useAuth()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await desktopApi('/info', await getAccessToken())
        if (alive) setInfo(data)
      } catch (e) {
        if (alive) setError(e.message)
      }
    })()
    return () => { alive = false }
  }, [getAccessToken])

  async function download() {
    setBusy(true)
    setError('')
    try {
      const data = await desktopApi('/download', await getAccessToken())
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const available = info?.available
  const unavailableMsg = info && !available
    ? t(info.reason === 'not_configured' ? 'desktopApp.notConfigured' : 'desktopApp.noRelease')
    : ''

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-slate-950 shadow-[0_4px_14px_rgba(0,242,254,0.25)]">
          <Monitor size={21} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('desktopApp.title')}</h1>
          <p className="text-sm text-slate-500">{t('desktopApp.subtitle')}</p>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="pointer-events-none absolute -right-32 -top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(0,242,254,0.08),transparent_65%)]" />
        <div className="relative mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-400">{t('desktopApp.downloadsKicker')}</p>
            <h2 className="text-lg font-bold text-slate-100">{t('desktopApp.downloadsTitle')}</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300">
            <Lock size={11} /> {t('desktopApp.membersOnly')}
          </span>
        </div>

        <div className="relative grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400">
                <Monitor size={20} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-100">Windows</p>
                <p className="text-xs text-slate-500">{t('desktopApp.desktopApp')}</p>
              </div>
              {available && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">v{info.version}</span>
              )}
            </div>
            <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
              {t('desktopApp.windowsReq')}{available && info.size ? ` · ${formatSize(info.size)}` : ''}
            </p>
            <button onClick={download} disabled={!available || busy} className={`${btnPrimary} mt-auto inline-flex items-center justify-center gap-2`}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {t('desktopApp.downloadWindows')}
              <ArrowRight size={15} />
            </button>
            {!info && !error && <p className="text-center text-xs text-slate-500">{t('desktopApp.checking')}</p>}
            {unavailableMsg && <p className="text-center text-xs text-amber-400">{unavailableMsg}</p>}
            {error && <p className="text-center text-xs text-red-400">{error}</p>}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <p className="font-semibold text-slate-100">{t('desktopApp.insideTitle')}</p>
            <ul className="space-y-2 text-sm text-slate-400">
              {['creator', 'srt', 'audio', 'rename', 'chat'].map((k) => (
                <li key={k} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  {t(`desktopApp.inside.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
          {STEPS.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-2 text-[12.5px] text-slate-300">
              {i > 0 && <ArrowRight size={13} className="text-slate-600" />}
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-[11px] font-bold text-slate-950">{i + 1}</span>
              {t(`desktopApp.steps.${s}`)}
            </span>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-500/30 border-l-4 border-l-amber-400 bg-amber-500/5 px-5 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
          <TriangleAlert size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-100">{t('desktopApp.noticeTitle')}</p>
          <p className="text-sm leading-relaxed text-slate-400">{t('desktopApp.noticeBody')}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-cyan-500/30 bg-cyan-500/5">
        <button onClick={() => setGuideOpen(!guideOpen)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400"><Download size={16} /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-100">{t('desktopApp.guideTitle')}</p>
            <p className="text-xs text-slate-500">{t('desktopApp.guideSubtitle')}</p>
          </div>
          <ChevronDown size={18} className={`text-cyan-400 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="space-y-1.5 border-t border-cyan-500/20 bg-slate-950/30 p-4">
            {GUIDE.map((g, i) => (
              <div key={g} className="flex gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-[11px] font-semibold text-slate-950">{i + 1}</span>
                <p className="text-[13px] leading-relaxed text-slate-300">{t(`desktopApp.guide.${g}`)}</p>
              </div>
            ))}
            <div className="mt-2 flex gap-2.5 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-[13px] text-slate-400">
              <Link2 size={15} className="mt-0.5 shrink-0 text-cyan-400" />
              {t('desktopApp.guideConnectNote')}
            </div>
            <div className="flex gap-2.5 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-[13px] text-slate-400">
              <Users size={15} className="mt-0.5 shrink-0 text-cyan-400" />
              {t('desktopApp.guideAccountsNote')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
