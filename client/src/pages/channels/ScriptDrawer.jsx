import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, FileDown, Captions, Check } from 'lucide-react'
import { useDb } from '../../lib/db'
import { useI18n } from '../../i18n'
import { Drawer, btnGhost, btnPrimary } from '../../components/ui'
import { countWords, countParagraphs, narrationSeconds, formatDuration, generateSrt, downloadFile } from '../../lib/text'

const AUTOSAVE_DEBOUNCE_MS = 2000

export default function ScriptDrawer({ video, onClose }) {
  const db = useDb()
  const { t } = useI18n()
  const readOnly = !db.canEdit('videos') // colaborador "Ver": só leitura
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
      title={t('script.title', { title: video.title })}
      actions={
        <>
          <button className={`${btnGhost} flex shrink-0 items-center gap-1.5 whitespace-nowrap !px-3 !py-1.5 text-xs`} onClick={() => downloadFile(`${slug}.srt`, generateSrt(content))} disabled={!content.trim()}>
            <Captions size={13} className="shrink-0" />
            {t('script.generateSrt')}
          </button>
          <button className={`${btnGhost} flex shrink-0 items-center gap-1.5 whitespace-nowrap !px-3 !py-1.5 text-xs`} onClick={() => downloadFile(`${slug}.txt`, content)} disabled={!content.trim()}>
            <FileDown size={13} className="shrink-0" />
            {t('script.txt')}
          </button>
          {!readOnly && (
            <button className={`${btnPrimary} flex shrink-0 items-center gap-1.5 whitespace-nowrap !px-3 !py-1.5 text-xs`} onClick={() => persist(content)}>
              <Save size={13} className="shrink-0" />
              {t('script.save')}
            </button>
          )}
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Contadores + tempo de narração */}
        <div className="grid grid-cols-3 gap-3 border-b border-slate-800 px-6 py-4 sm:grid-cols-6">
          <Counter label={t('script.chars')} value={stats.chars.toLocaleString('pt-BR')} />
          <Counter label={t('script.words')} value={stats.words.toLocaleString('pt-BR')} />
          <Counter label={t('script.paragraphs')} value={stats.paragraphs} />
          <Counter label={t('script.normalShort')} tip={t('script.normal')} value={formatDuration(narrationSeconds(content, 'normal'))} accent />
          <Counter label={t('script.slowShort')} tip={t('script.slow')} value={formatDuration(narrationSeconds(content, 'slow'))} />
          <Counter label={t('script.fastShort')} tip={t('script.fast')} value={formatDuration(narrationSeconds(content, 'fast'))} />
        </div>

        <textarea
          className="min-h-0 flex-1 resize-none bg-slate-950 p-6 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-slate-700 focus:outline-none"
          placeholder={readOnly ? t('script.readOnlyEmpty') : t('script.placeholder')}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          readOnly={readOnly}
        />

        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-2.5 text-[11px] text-slate-500">
          <span>
            {readOnly ? (
              t('script.readOnly')
            ) : dirty ? (
              t('script.unsaved')
            ) : savedAt ? (
              <span className="flex items-center gap-1 text-green-400">
                <Check size={12} />
                {t('script.saved')}
              </span>
            ) : (
              t('script.startTyping')
            )}
          </span>
          <span>{t('script.srtHint')}</span>
        </div>
      </div>
    </Drawer>
  )
}

function Counter({ label, value, accent, tip }) {
  return (
    <div title={tip} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-center">
      <p className={`truncate text-sm font-bold ${accent ? 'text-cyan-400' : 'text-slate-200'}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-slate-600">{label}</p>
    </div>
  )
}
