import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AudioLines, Loader2, Play, Download, Sparkles, Lock, Info } from 'lucide-react'
import { useI18n } from '../i18n'
import { api, apiErrorMessage } from '../lib/api'
import { isLocalMode } from '../lib/supabase'
import { inputCls, btnPrimary } from '../components/ui'

// Narração (Text-to-Speech). A chave do ElevenLabs é do dono (central), então a
// cota é por usuário (padrão 30 áudios/dia) e travada no servidor. Esta tela só
// mostra o estado e chama /api/tts/* — nenhuma chave trafega pelo navegador.

const MAX_CHARS = 5000
const TAG_RE = /\[([^\]\n]{1,60})\]/g
const norm = (s) => String(s || '').trim().toLowerCase()

// Nomes [Tag] distintos escritos no texto (na ordem em que aparecem).
function detectTags(text) {
  const out = []
  const seen = new Set()
  const re = new RegExp(TAG_RE)
  let m
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim()
    if (name && !seen.has(norm(name))) { seen.add(norm(name)); out.push(name) }
  }
  return out
}

// Replica a contagem do servidor: nº de vozes DISTINTAS realmente usadas no texto.
// speakerMap = { tagLower: voiceId }. É o custo em "áudios" deste texto.
function estimateVoices(text, defaultVoiceId, speakerMap) {
  const voices = new Set()
  let cur = defaultVoiceId
  let buf = ''
  const flush = () => { if (buf.trim()) voices.add(cur); buf = '' }
  const re = new RegExp(TAG_RE)
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    const v = speakerMap[norm(m[1])]
    if (v) { buf += text.slice(last, m.index); flush(); cur = v; last = m.index + m[0].length }
  }
  buf += text.slice(last); flush()
  return voices.size || (text.trim() ? 1 : 0)
}

export default function Narracao() {
  const { t } = useI18n()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusError, setStatusError] = useState('')

  const [voices, setVoices] = useState([])
  const [voicesError, setVoicesError] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [speakerVoices, setSpeakerVoices] = useState({}) // tagLower -> voiceId

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [audio, setAudio] = useState(null) // { url, name }
  const lastUrl = useRef(null)

  // Estado do TTS (ligado? configurado? plano? cota do dia?)
  useEffect(() => {
    let alive = true
    if (isLocalMode) {
      setLoading(false)
      return
    }
    api.tts
      .status()
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setStatusError(apiErrorMessage(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // Vozes — só quando a narração está disponível para este usuário.
  useEffect(() => {
    if (!status?.available) return
    let alive = true
    api.tts
      .voices()
      .then((r) => {
        if (!alive) return
        setVoices(r.voices || [])
        if (r.voices?.length) setVoiceId((prev) => prev || r.voices[0].voiceId)
      })
      .catch((e) => alive && setVoicesError(apiErrorMessage(e)))
    return () => {
      alive = false
    }
  }, [status?.available])

  // Libera a URL do áudio anterior ao desmontar/trocar.
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const remaining = status?.unlimited ? null : status?.remaining
  const maxExtra = status?.maxExtraVoices ?? 3
  const detectedTags = useMemo(() => detectTags(text), [text])
  // Map tagLower -> voiceId só para as tags que estão no texto E com voz escolhida.
  const speakerMap = useMemo(() => {
    const map = {}
    for (const tag of detectedTags) { const v = speakerVoices[norm(tag)]; if (v) map[norm(tag)] = v }
    return map
  }, [detectedTags, speakerVoices])
  const assignedCount = Object.keys(speakerMap).length
  const cost = useMemo(() => estimateVoices(text, voiceId, speakerMap), [text, voiceId, speakerMap])
  const canGenerate = status?.available && !!voiceId && text.trim().length > 0 && text.length <= MAX_CHARS && assignedCount <= maxExtra && (status?.unlimited || (remaining ?? 0) >= cost)

  async function handleGenerate() {
    if (!canGenerate || busy) return
    setBusy(true)
    setError('')
    try {
      const speakers = detectedTags.map((tag) => ({ tag, voiceId: speakerVoices[norm(tag)] })).filter((s) => s.voiceId)
      const { blob, remaining: rem, unlimited } = await api.tts.generate({ text: text.trim(), voiceId, modelId: status.modelId, speakers })
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
      const url = URL.createObjectURL(blob)
      lastUrl.current = url
      const voiceName = voices.find((v) => v.voiceId === voiceId)?.name || 'narracao'
      setAudio({ url, name: `${voiceName}-${Date.now()}.mp3` })
      // Atualiza a cota exibida com o que o servidor devolveu (rem já desconta o custo).
      setStatus((s) => (s ? { ...s, unlimited, remaining: unlimited ? null : rem, used: unlimited ? s.used : (s.used ?? 0) + cost, over: !unlimited && rem === 0 } : s))
    } catch (e) {
      setError(apiErrorMessage(e))
      // Se o servidor disse que a cota acabou, reflete na tela.
      if (e?.code === 'tts_limit_reached') setStatus((s) => (s ? { ...s, remaining: 0, over: true } : s))
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-400">
        <AudioLines size={22} />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('narration.title')}</h1>
        <p className="text-sm text-slate-500">{t('narration.subtitle')}</p>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-6">
        {header}
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-cyan-500" />
        </div>
      </div>
    )
  }

  // Modo local (preview sem Supabase): a narração depende da conta + servidor.
  if (isLocalMode) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-6">
        {header}
        <Notice icon={Info} tone="muted" title={t('narration.localTitle')} body={t('narration.localBody')} />
      </div>
    )
  }

  // Estados de indisponibilidade.
  if (statusError) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-6">
        {header}
        <Notice icon={Info} tone="muted" title={t('narration.unavailableTitle')} body={statusError} />
      </div>
    )
  }
  if (status && !status.available) {
    if (status.reason === 'plan') {
      return (
        <div className="mx-auto max-w-[1100px] space-y-6">
          {header}
          <div className="mx-auto mt-2 flex max-w-xl flex-col items-center rounded-2xl border border-cyan-500/20 bg-slate-900/40 p-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-400"><Lock size={28} /></div>
            <h2 className="text-xl font-bold text-slate-100">{t('narration.title')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('narration.planBody', { plan: status.minPlan })}</p>
            <Link to="/meu-plano" className={`${btnPrimary} mt-5`}>{t('narration.planCta')}</Link>
          </div>
        </div>
      )
    }
    // não configurado ou desligado
    return (
      <div className="mx-auto max-w-[1100px] space-y-6">
        {header}
        <Notice icon={Sparkles} tone="muted" title={t('narration.soonTitle')} body={t('narration.soonBody')} />
      </div>
    )
  }

  // Disponível: editor de narração.
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      {header}

      {/* Cota do dia */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
        <span className="text-sm text-slate-400">{t('narration.quotaLabel')}</span>
        {status.unlimited ? (
          <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">{t('narration.unlimited')}</span>
        ) : (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${remaining > 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-amber-500/10 text-amber-300'}`}>
            {t('narration.quotaValue', { remaining: remaining ?? 0, limit: status.dailyLimit })}
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Texto */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('narration.textLabel')}</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              rows={12}
              placeholder={t('narration.textPlaceholder')}
              className={`${inputCls} resize-y leading-relaxed`}
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>{cost > 1 ? t('narration.costNote', { cost }) : t('narration.oneAudioNote')}</span>
              <span className={text.length >= MAX_CHARS ? 'text-amber-400' : ''}>{text.length}/{MAX_CHARS}</span>
            </div>
          </div>

          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">{error}</p>}

          <button onClick={handleGenerate} disabled={!canGenerate || busy} className={`${btnPrimary} inline-flex items-center gap-2 ${!canGenerate || busy ? 'cursor-not-allowed opacity-50' : ''}`}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {busy ? t('narration.generating') : t('narration.generate')}
          </button>

          {/* Player + download */}
          {audio && (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <audio controls src={audio.url} className="w-full" />
              <a href={audio.url} download={audio.name} className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline">
                <Download size={15} /> {t('narration.download')}
              </a>
            </div>
          )}
        </div>

        {/* Voz */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('narration.voiceLabel')}</label>
            {voicesError ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">{voicesError}</p>
            ) : voices.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> {t('narration.loadingVoices')}</div>
            ) : (
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className={inputCls}>
                {voices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>{v.name}{v.labels?.gender ? ` — ${v.labels.gender}` : ''}</option>
                ))}
              </select>
            )}
          </div>
          {voiceId && voices.find((v) => v.voiceId === voiceId)?.previewUrl && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('narration.preview')}</p>
              <audio controls src={voices.find((v) => v.voiceId === voiceId).previewUrl} className="w-full" />
            </div>
          )}

          {/* Personagens: vozes extras por tag [Nome]. Cada voz a mais conta +1 áudio. */}
          {voices.length > 0 && maxExtra > 0 && (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('narration.charactersLabel')}</p>
              <p className="text-[11px] leading-relaxed text-slate-500">{t('narration.charactersHint', { max: maxExtra })}</p>
              {detectedTags.length === 0 ? (
                <p className="text-xs text-slate-600">{t('narration.noTags')}</p>
              ) : (
                <div className="space-y-2">
                  {detectedTags.map((tag) => {
                    const atCap = assignedCount >= maxExtra && !speakerVoices[norm(tag)]
                    return (
                      <div key={norm(tag)} className="space-y-1">
                        <span className="inline-block rounded bg-cyan-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-300">[{tag}]</span>
                        <select
                          value={speakerVoices[norm(tag)] || ''}
                          disabled={atCap}
                          onChange={(e) => setSpeakerVoices((p) => { const n = { ...p }; if (e.target.value) n[norm(tag)] = e.target.value; else delete n[norm(tag)]; return n })}
                          className={`${inputCls} text-sm ${atCap ? 'opacity-50' : ''}`}
                        >
                          <option value="">{t('narration.useMainVoice')}</option>
                          {voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
                        </select>
                      </div>
                    )
                  })}
                  {assignedCount >= maxExtra && <p className="text-[11px] text-amber-400">{t('narration.tooManyVoices', { max: maxExtra })}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Notice({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/60 text-slate-400"><Icon size={22} /></div>
      <p className="text-lg font-semibold text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  )
}
