import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, FileDown, Captions, Check } from 'lucide-react'
import { useDb } from '../../lib/db'
import { Drawer, btnGhost, btnPrimary } from '../../components/ui'
import { countWords, countParagraphs, narrationSeconds, formatDuration, generateSrt, downloadFile } from '../../lib/text'

const AUTOSAVE_DEBOUNCE_MS = 2000

export default function ScriptDrawer({ video, onClose }) {
  const db = useDb()
  const existing = db.all('scripts').find((s) => s.videoId === video.id)
  const [content, setContent] = useState(existing?.content || '')
  const [savedAt, setSavedAt] = useState(existing ? Date.now() : null)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef(null)

  function persist(text) {
    const current = db.all('scripts').find((s) => s.videoId === video.id)
    if (current) db.update('scripts', current.id, { content: text })
    else db.insert('scripts', { videoId: video.id, content: text })
    // Auto-marca a etapa "Roteiro" quando há ao menos 1 caractere salvo.
    // Nunca desmarca sozinho: apagar o texto não desmarca a caixinha.
    if (text.trim().length >= 1) {
      const v = db.get('videos', video.id)
      if (v && !v.steps?.roteiro) db.update('videos', video.id, { steps: { ...(v.steps || {}), roteiro: true } })
    }
    setSavedAt(Date.now())
    setDirty(false)
  }

  function handleChange(text) {
    setContent(text)
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => persist(text), AUTOSAVE_DEBOUNCE_MS)
  }

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const stats = useMemo(
    () => ({
      chars: content.length,
      words: countWords(content),
      paragraphs: countParagraphs(content),
    }),
    [content],
  )

  const slug = video.title.toLowerCase().replace(/[^a-z0-9à-ú]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'roteiro'

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Roteiro — ${video.title}`}
      actions={
        <>
          <button className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => downloadFile(`${slug}.srt`, generateSrt(content))} disabled={!content.trim()}>
            <Captions size={13} />
            Gerar SRT
          </button>
          <button className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => downloadFile(`${slug}.txt`, content)} disabled={!content.trim()}>
            <FileDown size={13} />
            TXT
          </button>
          <button className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => persist(content)}>
            <Save size={13} />
            Salvar Roteiro
          </button>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Contadores + tempo de narração */}
        <div className="grid grid-cols-3 gap-3 border-b border-slate-800 px-6 py-4 sm:grid-cols-6">
          <Counter label="Caracteres" value={stats.chars.toLocaleString('pt-BR')} />
          <Counter label="Palavras" value={stats.words.toLocaleString('pt-BR')} />
          <Counter label="Parágrafos" value={stats.paragraphs} />
          <Counter label="Normal (150 WPM)" value={formatDuration(narrationSeconds(content, 'normal'))} accent />
          <Counter label="Lento/Pausado (+15%)" value={formatDuration(narrationSeconds(content, 'slow'))} />
          <Counter label="Rápido/Dinâmico (−15%)" value={formatDuration(narrationSeconds(content, 'fast'))} />
        </div>

        <textarea
          className="min-h-0 flex-1 resize-none bg-slate-950 p-6 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-slate-700 focus:outline-none"
          placeholder="Escreva ou cole o roteiro aqui... O tempo de narração é calculado automaticamente pela contagem de palavras (150 WPM ±15%)."
          value={content}
          onChange={(e) => handleChange(e.target.value)}
        />

        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-2.5 text-[11px] text-slate-500">
          <span>
            {dirty ? (
              'Alterações não salvas — autosave em instantes...'
            ) : savedAt ? (
              <span className="flex items-center gap-1 text-green-400">
                <Check size={12} />
                Roteiro salvo automaticamente
              </span>
            ) : (
              'Comece a digitar para ativar o autosave.'
            )}
          </span>
          <span>O SRT gerado usa o tempo de leitura estimado — ajuste fino no editor de vídeo.</span>
        </div>
      </div>
    </Drawer>
  )
}

function Counter({ label, value, accent }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-center">
      <p className={`text-sm font-bold ${accent ? 'text-cyan-400' : 'text-slate-200'}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-600">{label}</p>
    </div>
  )
}
