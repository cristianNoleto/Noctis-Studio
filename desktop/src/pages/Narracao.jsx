import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Loader2, Play, Download, Sparkles, Lock } from 'lucide-react'
import { PageHeader, Card, Field, inputCls, btnPrimary, Spinner } from '../components/ui'
import { studio } from '../lib/studio'
import { useToast } from '../lib/api'

// Narração (ElevenLabs) no app. A chave é do dono (no servidor); o app só chama a
// API hospedada com a conta Noctis. Multi-voz: [Nome] no texto troca a voz; cada
// voz extra conta +1 na cota diária (máx 3 extras).

const MAX_CHARS = 5000
const TAG_RE = /\[([^\]\n]{1,60})\]/g
const norm = (s) => String(s || '').trim().toLowerCase()

function detectTags(text) {
  const out = [], seen = new Set(), re = new RegExp(TAG_RE)
  let m
  while ((m = re.exec(text)) !== null) { const n = m[1].trim(); if (n && !seen.has(norm(n))) { seen.add(norm(n)); out.push(n) } }
  return out
}
function estimateVoices(text, defaultVoiceId, speakerMap) {
  const voices = new Set(); let cur = defaultVoiceId, buf = ''
  const flush = () => { if (buf.trim()) voices.add(cur); buf = '' }
  const re = new RegExp(TAG_RE); let last = 0, m
  while ((m = re.exec(text)) !== null) { const v = speakerMap[norm(m[1])]; if (v) { buf += text.slice(last, m.index); flush(); cur = v; last = m.index + m[0].length } }
  buf += text.slice(last); flush()
  return voices.size || (text.trim() ? 1 : 0)
}

export default function Narracao() {
  const toast = useToast()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voices, setVoices] = useState([])
  const [voiceId, setVoiceId] = useState('')
  const [speakerVoices, setSpeakerVoices] = useState({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [audio, setAudio] = useState(null)
  const lastUrl = useRef(null)

  useEffect(() => {
    studio.ttsStatus().then(setStatus).catch(() => setStatus({ available: false, reason: 'error' })).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!status?.available) return
    studio.ttsVoices().then((r) => { setVoices(r.voices || []); if (r.voices?.length) setVoiceId((p) => p || r.voices[0].voiceId) }).catch(() => {})
  }, [status?.available])
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const remaining = status?.unlimited ? null : status?.remaining
  const maxExtra = status?.maxExtraVoices ?? 3
  const detectedTags = useMemo(() => detectTags(text), [text])
  const speakerMap = useMemo(() => {
    const map = {}
    for (const tag of detectedTags) { const v = speakerVoices[norm(tag)]; if (v) map[norm(tag)] = v }
    return map
  }, [detectedTags, speakerVoices])
  const assignedCount = Object.keys(speakerMap).length
  const cost = useMemo(() => estimateVoices(text, voiceId, speakerMap), [text, voiceId, speakerMap])
  const canGen = status?.available && !!voiceId && text.trim() && text.length <= MAX_CHARS && assignedCount <= maxExtra && (status?.unlimited || (remaining ?? 0) >= cost)

  async function generate() {
    if (!canGen || busy) return
    setBusy(true)
    try {
      const speakers = detectedTags.map((tag) => ({ tag, voiceId: speakerVoices[norm(tag)] })).filter((s) => s.voiceId)
      const { blob, remaining: rem, unlimited } = await studio.ttsGenerate({ text: text.trim(), voiceId, modelId: status.modelId, speakers })
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
      const url = URL.createObjectURL(blob)
      lastUrl.current = url
      const vName = voices.find((v) => v.voiceId === voiceId)?.name || 'narracao'
      setAudio({ url, name: `${vName}-${Date.now()}.mp3` })
      setStatus((s) => (s ? { ...s, unlimited, remaining: unlimited ? null : rem } : s))
    } catch (e) {
      toast(e.message || 'Falha ao gerar a narração.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const header = <PageHeader icon={AudioLines} kicker="Produção" title="Narração" subtitle="Texto em voz com IA (ElevenLabs). Use [Nome] para trocar de voz entre personagens." />

  if (loading) return <Wrap>{header}<div className="flex h-40 items-center justify-center"><Spinner size={26} /></div></Wrap>

  if (status && !status.available) {
    if (status.reason === 'plan') return <Wrap>{header}<Card className="p-8 text-center"><Lock size={26} className="mx-auto mb-3 text-cyan-400" /><p className="text-lg font-semibold text-slate-200">Narração no plano {status.minPlan}+</p><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Faça upgrade para transformar seus roteiros em voz.</p></Card></Wrap>
    return <Wrap>{header}<Card className="p-8 text-center"><Sparkles size={26} className="mx-auto mb-3 text-slate-400" /><p className="text-lg font-semibold text-slate-200">Em breve</p><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">A narração ainda não foi ativada. O dono precisa configurar a chave do ElevenLabs em Perfil → APIs no site.</p></Card></Wrap>
  }

  return (
    <Wrap>
      {header}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
        <span className="text-sm text-slate-400">Áudios de hoje</span>
        {status.unlimited
          ? <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">Ilimitado</span>
          : <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${remaining > 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-amber-500/10 text-amber-300'}`}>{remaining ?? 0} / {status.dailyLimit}</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <Field label="Texto da narração">
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))} rows={12} placeholder="Cole ou escreva o texto. Use [Nome] para trocar de voz..." className={`${inputCls} resize-y leading-relaxed`} />
          </Field>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>{cost > 1 ? `Este áudio usa ${cost} vozes e conta como ${cost} da sua cota.` : 'Cada geração conta como 1 áudio da sua cota.'}</span>
            <span className={text.length >= MAX_CHARS ? 'text-amber-400' : ''}>{text.length}/{MAX_CHARS}</span>
          </div>
          <button onClick={generate} disabled={!canGen || busy} className={`${btnPrimary} inline-flex items-center gap-2 ${!canGen || busy ? 'cursor-not-allowed opacity-50' : ''}`}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {busy ? 'Gerando...' : 'Gerar narração'}
          </button>
          {audio && (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <audio controls src={audio.url} className="w-full" />
              <a href={audio.url} download={audio.name} className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline"><Download size={15} /> Baixar .mp3</a>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Field label="Voz principal">
            {voices.length === 0
              ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Carregando vozes...</div>
              : <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className={inputCls}>{voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}</select>}
          </Field>

          {voices.length > 0 && maxExtra > 0 && (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Personagens (vozes extras)</p>
              <p className="text-[11px] leading-relaxed text-slate-500">Escreva [Nome] no texto e escolha a voz de cada um. Até {maxExtra} vozes extras — cada voz a mais conta +1 áudio.</p>
              {detectedTags.length === 0
                ? <p className="text-xs text-slate-600">Nenhuma tag [Nome] no texto ainda.</p>
                : detectedTags.map((tag) => {
                    const atCap = assignedCount >= maxExtra && !speakerVoices[norm(tag)]
                    return (
                      <div key={norm(tag)} className="space-y-1">
                        <span className="inline-block rounded bg-cyan-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-300">[{tag}]</span>
                        <select value={speakerVoices[norm(tag)] || ''} disabled={atCap} onChange={(e) => setSpeakerVoices((p) => { const n = { ...p }; if (e.target.value) n[norm(tag)] = e.target.value; else delete n[norm(tag)]; return n })} className={`${inputCls} text-sm ${atCap ? 'opacity-50' : ''}`}>
                          <option value="">Usar a voz principal</option>
                          {voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
                        </select>
                      </div>
                    )
                  })}
              {assignedCount >= maxExtra && <p className="text-[11px] text-amber-400">Máximo de {maxExtra} vozes extras atingido.</p>}
            </div>
          )}
        </div>
      </div>
    </Wrap>
  )
}

function Wrap({ children }) {
  return <div className="mx-auto max-w-[1100px] px-8 py-7">{children}</div>
}
