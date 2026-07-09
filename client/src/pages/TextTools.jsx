import { useMemo, useState } from 'react'
import { FileText, Captions, Scissors, Copy, FileDown } from 'lucide-react'
import { inputCls, btnPrimary, btnGhost } from '../components/ui'
import { countWords, countParagraphs, fleschPt, generateSrt, splitTextByLimit, narrationSeconds, formatDuration, downloadFile } from '../lib/text'

const TABS = [
  ['editor', 'Editor de Texto', FileText],
  ['srt', 'Gerador de SRT', Captions],
  ['splitter', 'Divisor de Texto (CapCut)', Scissors],
]

export default function TextTools() {
  const [tab, setTab] = useState('editor')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Ferramentas de Texto</h1>
        <p className="mt-1 text-sm text-slate-500">Editor com legibilidade, gerador de SRT por tempo de leitura e divisor para CapCut/Shorts.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'editor' && <EditorTab />}
      {tab === 'srt' && <SrtTab />}
      {tab === 'splitter' && <SplitterTab />}
    </div>
  )
}

function EditorTab() {
  const [text, setText] = useState('')
  const stats = useMemo(
    () => ({
      words: countWords(text),
      chars: text.length,
      paragraphs: countParagraphs(text),
      readability: fleschPt(text),
      duration: formatDuration(narrationSeconds(text)),
    }),
    [text],
  )

  const readabilityLabel = stats.readability >= 75 ? 'Muito fácil' : stats.readability >= 50 ? 'Fácil' : stats.readability >= 25 ? 'Média' : 'Difícil'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatBox label="Palavras" value={stats.words.toLocaleString('pt-BR')} />
        <StatBox label="Caracteres" value={stats.chars.toLocaleString('pt-BR')} />
        <StatBox label="Parágrafos" value={stats.paragraphs} />
        <StatBox label="Legibilidade (Flesch-PT)" value={`${stats.readability} · ${readabilityLabel}`} />
        <StatBox label="Narração (150 WPM)" value={stats.duration} accent />
      </div>
      <textarea
        className={`${inputCls} min-h-96 resize-y font-mono text-sm leading-relaxed`}
        placeholder="Escreva ou cole seu texto aqui..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end">
        <button className={`${btnGhost} flex items-center gap-2`} onClick={() => downloadFile('texto.txt', text)} disabled={!text.trim()}>
          <FileDown size={15} />
          Baixar TXT
        </button>
      </div>
    </div>
  )
}

function SrtTab() {
  const [text, setText] = useState('')
  const [wordsPerBlock, setWordsPerBlock] = useState(12)
  const srt = useMemo(() => generateSrt(text, { wordsPerBlock: Number(wordsPerBlock) || 12 }), [text, wordsPerBlock])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-slate-400">ROTEIRO</p>
        <textarea
          className={`${inputCls} min-h-96 resize-y font-mono text-sm`}
          placeholder="Cole o roteiro aqui — os timestamps são calculados pelo tempo de leitura (150 WPM)..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">Palavras por bloco de legenda:</label>
          <input className={`${inputCls} !w-24`} type="number" min="4" max="30" value={wordsPerBlock} onChange={(e) => setWordsPerBlock(e.target.value)} />
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-slate-400">SRT GERADO</p>
          <button className={`${btnPrimary} flex items-center gap-2 !px-3 !py-1.5 text-xs`} onClick={() => downloadFile('legendas.srt', srt)} disabled={!srt}>
            <Captions size={13} />
            Baixar SRT
          </button>
        </div>
        <pre className="min-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
          {srt || 'O SRT aparece aqui...'}
        </pre>
        <p className="text-[11px] text-slate-600">Timestamps simulados pelo tempo de leitura — ajuste fino no editor de vídeo.</p>
      </div>
    </div>
  )
}

function SplitterTab() {
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
          <label className="text-xs font-semibold tracking-wide text-slate-400">LIMITE DE CARACTERES POR PARTE</label>
          <input className={`${inputCls} !w-28`} type="number" min="50" max="5000" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <textarea
          className={`${inputCls} min-h-96 resize-y font-mono text-sm`}
          placeholder="Cole o roteiro completo aqui..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className={`${btnPrimary} flex items-center gap-2`} onClick={split} disabled={!text.trim()}>
          <Scissors size={15} />
          Dividir
        </button>
        <p className="text-[11px] text-slate-600">Nunca corta palavra ao meio — a quebra acontece no espaço mais próximo antes do limite.</p>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-slate-400">
          PARTES {parts ? `(${parts.length})` : ''}
        </p>
        {!parts && <p className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">Os blocos numerados aparecem aqui.</p>}
        <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
          {(parts || []).map((part, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400">PARTE {i + 1}</span>
                <button
                  onClick={() => copyPart(i)}
                  className={`flex items-center gap-1.5 text-xs ${copiedIdx === i ? 'text-green-400' : 'text-slate-500 hover:text-cyan-400'}`}
                >
                  <Copy size={12} />
                  {copiedIdx === i ? 'Copiado!' : 'Copiar Bloco'}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">{part}</p>
              <p className="mt-2 text-right text-[10px] text-slate-600">{part.length} caracteres</p>
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
