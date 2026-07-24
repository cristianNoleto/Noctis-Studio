import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Captions, Scissors, Copy, FileDown, AudioLines, Clock, ArrowRight } from 'lucide-react'
import { useI18n } from '../i18n'
import { inputCls, btnPrimary, btnGhost } from '../components/ui'
import { countWords, countParagraphs, generateSrt, splitTextByLimit, formatDuration, downloadFile } from '../lib/text'

const TABS = [
  ['editor', FileText],
  ['srt', Captions],
  ['splitter', Scissors],
]

export default function TextTools() {
  const { t } = useI18n()
  const [tab, setTab] = useState('editor')

  return (
    <div className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('textTools.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('textTools.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([key, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Icon size={15} />
            {t(`textTools.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'editor' && <EditorTab />}
      {tab === 'srt' && <SrtTab />}
      {tab === 'splitter' && <SplitterTab />}
    </div>
  )
}

// Velocidades de narração do original: Normal 155, Lento 130, Rápido 183 wpm
const NARRATION_SPEEDS = [
  ['normal', 155],
  ['slow', 130],
  ['fast', 183],
]

function EditorTab() {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const stats = useMemo(
    () => ({
      words: countWords(text),
      chars: text.length,
      paragraphs: countParagraphs(text),
    }),
    [text],
  )

  return (
    <div className="space-y-4">
      {/* Contadores como no original: CARACTERES / PALAVRAS / PARÁGRAFOS */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label={t('textTools.chars')} value={stats.chars.toLocaleString('pt-BR')} />
        <StatBox label={t('textTools.words')} value={stats.words.toLocaleString('pt-BR')} />
        <StatBox label={t('textTools.paragraphs')} value={stats.paragraphs} />
      </div>

      {/* Tempo de Narração (padrão) — 3 velocidades */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">{t('textTools.narrationTime')}</p>
        <div className="grid grid-cols-3 gap-3">
          {NARRATION_SPEEDS.map(([key, wpm]) => (
            <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-center">
              <p className="text-[11px] font-medium text-slate-400">{t(`textTools.speeds.${key}`)}</p>
              <p className="mt-0.5 text-lg font-bold text-cyan-400">{formatDuration(Math.round((stats.words / wpm) * 60))}</p>
              <p className="text-[10px] text-slate-600">{t('textTools.wordsPerMin', { n: wpm })}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Área de Texto */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-300">{t('textTools.textArea')}</p>
        <textarea
          className={`${inputCls} min-h-80 resize-y font-mono text-sm leading-relaxed`}
          placeholder={t('textTools.editorPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button className={`${btnGhost} flex items-center gap-2`} onClick={() => downloadFile('legendas.srt', generateSrt(text))} disabled={!text.trim()}>
          <Captions size={15} />
          {t('textTools.downloadSrt')}
        </button>
        <button className={`${btnGhost} flex items-center gap-2`} onClick={() => downloadFile('texto.txt', text)} disabled={!text.trim()}>
          <FileDown size={15} />
          {t('textTools.downloadTxt')}
        </button>
      </div>

      {/* Dicas de Uso — como no original */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <p className="mb-2 text-xs font-semibold text-cyan-300">{t('textTools.tipsTitle')}</p>
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-400">
          <li>• {t('textTools.tip1')}</li>
          <li>• {t('textTools.tip2')}</li>
          <li>• {t('textTools.tip3')}</li>
          <li>• {t('textTools.tip4')}</li>
        </ul>
      </div>
    </div>
  )
}

function SrtTab() {
  const { t } = useI18n()
  const [mode, setMode] = useState('script') // 'script' (tempos estimados) | 'audio' (tempos reais)

  return (
    <div className="space-y-4">
      {/* Seletor de modo: por roteiro (tempos estimados) x por áudio (tempos reais) */}
      <div className="flex flex-wrap gap-2">
        <ModeBtn active={mode === 'script'} onClick={() => setMode('script')} icon={<Captions size={14} />} label={t('textTools.srtModeScript')} desc={t('textTools.srtModeScriptDesc')} />
        <ModeBtn active={mode === 'audio'} onClick={() => setMode('audio')} icon={<AudioLines size={14} />} label={t('textTools.srtModeAudio')} desc={t('textTools.srtModeAudioDesc')} />
      </div>
      {mode === 'script' ? <SrtByScript /> : <SrtByAudio />}
    </div>
  )
}

function ModeBtn({ active, onClick, icon, label, desc }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
        active ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
      }`}
    >
      <span className={`mt-0.5 ${active ? 'text-cyan-300' : 'text-slate-500'}`}>{icon}</span>
      <span>
        <span className={`block text-sm font-semibold ${active ? 'text-cyan-200' : 'text-slate-200'}`}>{label}</span>
        <span className="block text-[11px] text-slate-500">{desc}</span>
      </span>
    </button>
  )
}

// Modo "Por áudio": leva à página de Transcrição (AssemblyAI), que já gera SRT
// com TEMPOS REAIS a partir do áudio, sem travar o navegador e com expiração.
function SrtByAudio() {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-400">
          <AudioLines size={22} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-100">{t('textTools.srtAudioTitle')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{t('textTools.srtAudioDesc')}</p>
          <ul className="mt-3 space-y-1.5 text-[13px] text-slate-300">
            <li className="flex items-center gap-2"><Clock size={13} className="shrink-0 text-cyan-400" /> {t('textTools.srtAudioReal')}</li>
            <li className="flex items-center gap-2"><Captions size={13} className="shrink-0 text-cyan-400" /> {t('textTools.srtAudioFormats')}</li>
            <li className="flex items-center gap-2"><AudioLines size={13} className="shrink-0 text-cyan-400" /> {t('textTools.srtAudioSafe')}</li>
          </ul>
          <button className={`${btnPrimary} mt-5 inline-flex items-center gap-2`} onClick={() => navigate('/transcricao')}>
            {t('textTools.srtAudioOpen')}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function SrtByScript() {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [wordsPerBlock, setWordsPerBlock] = useState(12)
  const srt = useMemo(() => generateSrt(text, { wordsPerBlock: Number(wordsPerBlock) || 12 }), [text, wordsPerBlock])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-slate-400">{t('textTools.script')}</p>
        <textarea
          className={`${inputCls} min-h-96 resize-y font-mono text-sm`}
          placeholder={t('textTools.srtPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">{t('textTools.wordsPerBlock')}</label>
          <input className={`${inputCls} !w-24`} type="number" min="4" max="30" value={wordsPerBlock} onChange={(e) => setWordsPerBlock(e.target.value)} />
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-slate-400">{t('textTools.srtGenerated')}</p>
          <button className={`${btnPrimary} flex items-center gap-2 !px-3 !py-1.5 text-xs`} onClick={() => downloadFile('legendas.srt', srt)} disabled={!srt}>
            <Captions size={13} />
            {t('textTools.downloadSrt')}
          </button>
        </div>
        <pre className="min-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
          {srt || t('textTools.srtHere')}
        </pre>
        <p className="text-[11px] text-slate-600">{t('textTools.srtHint')}</p>
      </div>
    </div>
  )
}

function SplitterTab() {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [limit, setLimit] = useState(500)
  const [parts, setParts] = useState(null)
  const [copiedIdx, setCopiedIdx] = useState(null)

  function split() {
    setParts(splitTextByLimit(text, Number(limit) || 500))
  }

  async function copyPart(i) {
    await navigator.clipboard.writeText(parts[i])
    setCopiedIdx(i)
    setTimeout(() => setCopiedIdx(null), 1500)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold tracking-wide text-slate-400">{t('textTools.charLimit')}</label>
          <input className={`${inputCls} !w-28`} type="number" min="50" max="5000" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <textarea
          className={`${inputCls} min-h-96 resize-y font-mono text-sm`}
          placeholder={t('textTools.splitterPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={split} disabled={!text.trim()}>
          <Scissors size={15} />
          {t('textTools.split')}
        </button>
        <p className="text-[11px] text-slate-600">{t('textTools.splitHint')}</p>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-slate-400">
          {t('textTools.parts')} {parts ? `(${parts.length})` : ''}
        </p>
        {!parts && <p className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">{t('textTools.partsHere')}</p>}
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
          {(parts || []).map((part, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400">{t('textTools.part', { n: i + 1 })}</span>
                <button
                  onClick={() => copyPart(i)}
                  className={`flex items-center gap-1.5 text-xs ${copiedIdx === i ? 'text-green-400' : 'text-slate-500 hover:text-cyan-400'}`}
                >
                  <Copy size={12} />
                  {copiedIdx === i ? t('textTools.copied') : t('textTools.copyBlock')}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{part}</p>
              <p className="mt-2 text-right text-[10px] text-slate-600">{t('textTools.charsCount', { n: part.length })}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-center">
      <p className={`truncate text-sm font-bold ${accent ? 'text-cyan-400' : 'text-slate-200'}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-slate-600">{label}</p>
    </div>
  )
}
