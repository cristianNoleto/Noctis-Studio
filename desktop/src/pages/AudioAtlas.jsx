import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Music, AudioWaveform, Library, Star, History, ListPlus, Settings2, Search, Play, Pause, Download, FolderOpen, ExternalLink,
  SkipBack, SkipForward, Volume2, X, WifiOff, SearchX, FolderSearch, Check, Loader2, FolderPlus,
} from 'lucide-react'
import { call, fmtTime, useEvent, useSettings, useToast } from '../lib/api'
import { btnGhost, btnPrimary, Card, EmptyState, Field, inputCls, Modal, PageHeader, Segmented, Toggle, iconBtn } from '../components/ui'

const TABS = [
  { key: 'music', label: 'Músicas', Icon: Music },
  { key: 'sfx', label: 'Efeitos (SFX)', Icon: AudioWaveform },
  { key: 'library', label: 'Biblioteca', Icon: Library },
  { key: 'favorites', label: 'Favoritos', Icon: Star },
  { key: 'history', label: 'Histórico', Icon: History },
  { key: 'queue', label: 'Fila', Icon: ListPlus },
  { key: 'settings', label: 'Configurações', Icon: Settings2 },
]
const SUGESTOES = ['dark ambient', 'suspense', 'mystery', 'documentary', 'tension', 'drone', 'horror atmosphere', 'cinematic',
  'whoosh', 'impact', 'riser', 'typewriter', 'paper', 'glitch', 'bubble', 'pop', 'click', 'heartbeat']
const fresh = () => ({ query: '', items: [], page: 1, pages: 1, translation: null, loading: false, error: null })
const keyOf = (it) => (it.id ? `${it.type}:${it.id}` : it.localPath)

function Wave({ it, progress, onSeek }) {
  const svg = useMemo(() => {
    if (it.wave) return { vb: `0 0 ${it.wave.w} ${it.wave.h}`, body: <path d={it.wave.d} /> }
    // Sem forma de onda real: barras determinísticas a partir do id.
    let seed = [...String(keyOf(it))].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296)
    const bars = []
    for (let i = 0; i < 60; i++) {
      const h = 4 + Math.round((0.35 + 0.65 * rnd()) * Math.sin((Math.PI * (i + 1)) / 61) * 26)
      bars.push(<rect key={i} x={i * 5} y={(34 - h) / 2} width="3" height={h} rx="1.5" />)
    }
    return { vb: '0 0 300 34', body: bars }
  }, [it])
  return (
    <div className="wave w-full" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))) }}>
      <svg className="base" viewBox={svg.vb} preserveAspectRatio="none">{svg.body}</svg>
      <svg className="prog" viewBox={svg.vb} preserveAspectRatio="none" style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }}>{svg.body}</svg>
    </div>
  )
}

export default function AudioAtlas() {
  const toast = useToast()
  const { settings, save } = useSettings()
  const [tab, setTab] = useState('music')
  const [st, setSt] = useState({ categories: [], favorites: [], history: [], downloaded: new Set() })
  const [search, setSearch] = useState({ music: fresh(), sfx: fresh() })
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({ duration: '', order: 'relevance', hide: false })
  const [selected, setSelected] = useState(new Map())
  const [queue, setQueue] = useState([])
  const [queueRunning, setQueueRunning] = useState(false)
  const [lib, setLib] = useState(null)
  const [libQ, setLibQ] = useState('')
  const [libCat, setLibCat] = useState('')
  const [dl, setDl] = useState(null) // { item, sug, cat, novo }
  const [current, setCurrent] = useState(null)
  const [playlist, setPlaylist] = useState([])
  const [paused, setPaused] = useState(true)
  const [time, setTime] = useState({ c: 0, d: 0 })
  const [cfg, setCfg] = useState({ root: '', intervalMs: 1500 })
  const audio = useRef(null)

  const refreshState = useCallback(async () => {
    try {
      const s = await call('aa:state')
      setSt({ categories: s.categories, favorites: s.favorites, history: s.history, downloaded: new Set(s.downloaded) })
    } catch (e) { toast(e.message, 'error') }
  }, [toast])
  useEffect(() => { refreshState() }, [refreshState])
  useEffect(() => { if (settings) setCfg({ root: settings.audioAtlas?.root || '', intervalMs: settings.audioAtlas?.intervalMs || 1500 }) }, [settings])
  useEffect(() => { if (tab === 'music' || tab === 'sfx') setQ(search[tab].query) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEvent('aa:progress', ({ id, p }) => setQueue((l) => l.map((x) => (String(x.item.id) === String(id) && x.status === 'running' ? { ...x, p } : x))))

  const isSearch = tab === 'music' || tab === 'sfx'
  const cur = isSearch ? search[tab] : null

  async function runSearch(append = false, query = q, type = tab, f = filters) {
    const base = search[type]
    const termo = append ? base.query : query.trim()
    if (!termo) return
    const prox = append ? { ...base, loading: true, error: null } : { ...fresh(), query: termo, loading: true }
    setSearch((s) => ({ ...s, [type]: prox }))
    try {
      const r = await call('aa:search', { type, query: termo, page: append ? base.page + 1 : 1, order: f.order, duration: f.duration })
      setSearch((s) => {
        if (s[type].query !== termo) return s
        const seen = new Set(append ? s[type].items.map((i) => i.id) : [])
        const items = [...(append ? s[type].items : []), ...r.items.filter((i) => !seen.has(i.id))]
        return { ...s, [type]: { ...s[type], items, page: r.page, pages: r.pages, translation: r.translation, loading: false } }
      })
      setSt((x) => ({ ...x, downloaded: new Set(r.downloaded), history: append ? x.history : [{ query: termo, type, at: Date.now() }, ...x.history.filter((h) => !(h.query === termo && h.type === type))] }))
    } catch (e) {
      setSearch((s) => ({ ...s, [type]: { ...s[type], loading: false, error: e.message } }))
    }
  }

  // ---- player
  const play = (it, list) => {
    if (!it) return
    setCurrent(it)
    if (list) setPlaylist(list)
    const a = audio.current
    a.src = it.fileUrl || it.src
    a.play().catch((e) => toast(`Não foi possível tocar: ${e.message}`, 'error'))
  }
  const toggle = (it, list) => {
    const a = audio.current
    if (current && keyOf(current) === keyOf(it)) (a.paused ? a.play() : a.pause())
    else play(it, list)
  }
  const step = (dir) => {
    if (!playlist.length) return
    const i = current ? playlist.findIndex((x) => keyOf(x) === keyOf(current)) : -1
    const next = playlist[i + dir]
    if (next) play(next)
  }
  const seek = (it, list, f) => {
    const a = audio.current
    const apply = () => { if (a.duration) a.currentTime = f * a.duration }
    if (!current || keyOf(current) !== keyOf(it)) { play(it, list); a.addEventListener('loadedmetadata', apply, { once: true }) } else apply()
  }
  useEffect(() => {
    const k = (e) => {
      if (e.target.matches('input, select, textarea') || dl) return
      if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
      else if (e.key === ' ' && current) { e.preventDefault(); toggle(current) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  useEffect(() => { const v = Number(localStorage.getItem('aa_vol') ?? 0.8); if (audio.current) audio.current.volume = v }, [])

  // ---- download
  async function openDownload(it) {
    if (st.downloaded.has(String(it.id))) return toast('Já baixado antes — não baixei de novo.')
    const sug = await call('aa:suggestCategory', it).catch(() => null)
    setDl({ item: it, sug, cat: sug?.name || null, novo: '' })
  }
  async function doDownload(it, cat, entry) {
    try {
      const r = await call('aa:download', it, cat)
      setSt((x) => ({ ...x, downloaded: new Set([...x.downloaded, String(it.id)]) }))
      if (entry) setQueue((l) => l.map((x) => (x === entry || keyOf(x.item) === keyOf(it) ? { ...x, status: r.duplicate ? 'dup' : 'done', p: 1 } : x)))
      return r
    } catch (e) {
      if (entry) setQueue((l) => l.map((x) => (keyOf(x.item) === keyOf(it) ? { ...x, status: 'error', error: e.message } : x)))
      throw e
    }
  }
  async function confirmDownload(d = dl) {
    const { item, cat, novo } = d
    const categoria = novo.trim() || cat
    setDl(null)
    if (!categoria) return
    const entry = { item, category: categoria, status: 'running', p: 0 }
    setQueue((l) => [...l, entry])
    try {
      const r = await doDownload(item, categoria, entry)
      toast(r.duplicate ? 'Já baixado antes — não baixei de novo.' : `${r.newFolder ? 'Pasta nova criada:' : 'Salvo em'} ${categoria}`, 'success')
      refreshState()
    } catch (e) { toast(e.message, 'error') }
  }

  // ---- fila
  async function addSelected() {
    const novos = []
    for (const it of selected.values()) {
      if (queue.some((x) => keyOf(x.item) === keyOf(it))) continue
      const category = (await call('aa:suggestCategory', it).catch(() => null))?.name || 'short audio'
      novos.push({ item: it, category, status: 'pending', p: 0 })
    }
    setQueue((l) => [...l, ...novos])
    toast(`${selected.size} na fila`, 'success')
    setSelected(new Map())
  }
  async function runQueue() {
    if (queueRunning) return
    setQueueRunning(true)
    for (const entry of queue.filter((x) => x.status === 'pending')) {
      setQueue((l) => l.map((x) => (x === entry ? { ...x, status: 'running' } : x)))
      await doDownload(entry.item, entry.category, entry).catch(() => {})
    }
    setQueueRunning(false)
    refreshState()
  }

  async function toggleFav(it) {
    const favorites = await call('aa:favorite', it).catch((e) => { toast(e.message, 'error'); return st.favorites })
    setSt((x) => ({ ...x, favorites }))
  }

  async function loadLibrary() {
    setLib(null)
    try { setLib(await call('aa:library', '')) } catch (e) { toast(e.message, 'error'); setLib([]) }
  }
  useEffect(() => { if (tab === 'library') loadLibrary() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvarCfg() {
    await save({ audioAtlas: { root: cfg.root.trim(), intervalMs: Math.max(500, Number(cfg.intervalMs) || 1500) } })
    toast('Configurações salvas.', 'success')
    refreshState()
  }

  const visible = cur ? (filters.hide ? cur.items.filter((i) => !st.downloaded.has(String(i.id))) : cur.items) : []
  const libItems = useMemo(() => {
    const words = libQ.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return (lib || []).filter((i) => (!libCat || i.category === libCat) && words.every((w) => [i.title, i.category, i.author, ...(i.tags || [])].join(' ').toLowerCase().includes(w)))
  }, [lib, libQ, libCat])
  const libCats = useMemo(() => [...new Set((lib || []).map((i) => i.category).filter(Boolean))].sort(), [lib])
  const pendentes = queue.filter((x) => x.status === 'pending' || x.status === 'running').length

  // Função (e não componente) para a linha não remontar a cada atualização do player.
  function row(it, list, mode) {
    const k = keyOf(it)
    const isDl = it.id && st.downloaded.has(String(it.id))
    const fav = it.id && st.favorites.some((f) => f.id === it.id && f.type === it.type)
    const playing = current && keyOf(current) === k
    const prog = playing && time.d ? time.c / time.d : 0
    return (
      <div key={k} onDoubleClick={() => play(it, list)} className={`group grid items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${playing ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-transparent hover:border-slate-800 hover:bg-slate-900/60'} ${mode === 'search' ? 'grid-cols-[20px_36px_minmax(0,1.4fr)_minmax(0,1fr)_48px_auto]' : 'grid-cols-[36px_minmax(0,1.6fr)_minmax(0,0.6fr)_48px_auto]'}`}>
        {mode === 'search' && (
          <input type="checkbox" className="accent-cyan-500" disabled={isDl} checked={selected.has(k)} onChange={(e) => setSelected((m) => { const n = new Map(m); e.target.checked ? n.set(k, it) : n.delete(k); return n })} />
        )}
        <button onClick={() => toggle(it, list)} className={`flex h-9 w-9 items-center justify-center rounded-full ${playing && !paused ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
          {playing && !paused ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{it.title}</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
            {isDl && <span className="text-emerald-400">✓ baixado</span>}
            {it.contentId && <span className="rounded bg-amber-500/10 px-1 text-[10px] font-bold text-amber-400" title="Registrada no Content ID do YouTube: pode gerar reivindicação (normalmente liberável com a licença do Pixabay).">Content ID</span>}
            <span className="truncate">{it.author || it.category || 'local'}{(it.tags || []).length ? ` · ${it.tags.slice(0, 4).join(', ')}` : ''}</span>
          </p>
        </div>
        {mode === 'search' ? <Wave it={it} progress={prog} onSeek={(f) => seek(it, list, f)} /> : <span className="truncate rounded-md bg-slate-800/70 px-2 py-0.5 text-center text-[11px] text-slate-400">{it.category || '/'}</span>}
        <span className="text-right text-xs tabular-nums text-slate-500">{it.duration >= 1 ? fmtTime(it.duration) : it.duration ? '< 1s' : ''}</span>
        <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
          {it.src && <button title="Baixar" className={iconBtn} onClick={() => openDownload(it)}><Download size={15} /></button>}
          {it.src && <button title="Favoritar" className={`${iconBtn} ${fav ? 'text-amber-400' : ''}`} onClick={() => toggleFav(it)}><Star size={15} fill={fav ? 'currentColor' : 'none'} /></button>}
          {it.localPath && <button title="Mostrar na pasta" className={iconBtn} onClick={() => call('sys:reveal', it.localPath)}><FolderOpen size={15} /></button>}
          {it.pageUrl && <button title="Abrir no Pixabay" className={iconBtn} onClick={() => call('aa:openPage', it.pageUrl)}><ExternalLink size={15} /></button>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-7">
        <PageHeader icon={Music} kicker="Ferramentas" title="Audio" accent="Atlas" subtitle="Busque, ouça e baixe músicas e efeitos do Pixabay para o seu banco de sons" />
        <div className="flex flex-wrap gap-1 border-b border-slate-800">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${tab === t.key ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}>
              <t.Icon size={15} /> {t.label}
              {t.key === 'queue' && pendentes > 0 && <span className="rounded-full bg-cyan-500 px-1.5 text-[10px] font-bold text-slate-950">{pendentes}</span>}
              {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-cyan-400" />}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        {isSearch && (
          <>
            {!settings?.audioAtlas?.root && (
              <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
                Antes de baixar, escolha a pasta do seu banco de sons em <button className="font-semibold underline" onClick={() => setTab('settings')}>Configurações</button>.
              </div>
            )}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); runSearch(false) }}>
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input autoFocus className={`${inputCls} py-3 pl-10 text-[15px]`} placeholder="Busque em PT, ES ou EN — ex.: suspense, bolha, whoosh" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button className={`${btnPrimary} px-6`} type="submit">Buscar</button>
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Segmented size="sm" value={filters.duration} onChange={(v) => { const f = { ...filters, duration: v }; setFilters(f); if (cur.query) runSearch(false, cur.query, tab, f) }} options={[
                { value: '', label: 'Qualquer' }, { value: 'short', label: 'Curto < 2s' }, { value: 'medium', label: 'Médio' }, { value: 'long', label: 'Longo' },
              ]} />
              <Segmented size="sm" value={filters.order} onChange={(v) => { const f = { ...filters, order: v }; setFilters(f); if (cur.query) runSearch(false, cur.query, tab, f) }} options={[
                { value: 'relevance', label: 'Relevância' }, { value: 'latest', label: 'Recentes' },
              ]} />
              <label className="flex items-center gap-2 text-xs text-slate-400"><Toggle checked={filters.hide} onChange={(v) => setFilters({ ...filters, hide: v })} /> Esconder baixados</label>
              {cur.translation?.translated && <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] text-cyan-300">buscado como “{cur.translation.english}”</span>}
              {selected.size > 0 && <button className={`${btnPrimary} ml-auto py-1.5`} onClick={addSelected}><ListPlus size={15} /> Adicionar {selected.size} à fila</button>}
            </div>
            {!cur.query && (
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGESTOES.map((s) => <button key={s} onClick={() => { setQ(s); runSearch(false, s) }} className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300">{s}</button>)}
              </div>
            )}
            <div className="mt-4 space-y-1">
              {cur.loading && !cur.items.length && Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-900/70" />)}
              {cur.error && <EmptyState icon={WifiOff} title="Não deu certo" description={cur.error} />}
              {!cur.loading && !cur.error && !cur.query && <EmptyState icon={tab === 'music' ? Music : AudioWaveform} title="Escolha uma sugestão ou digite um termo." />}
              {!cur.loading && !cur.error && cur.query && !visible.length && <EmptyState icon={SearchX} title="Nada encontrado." description="Tente outro termo ou filtro." />}
              {visible.map((it) => row(it, visible, 'search'))}
            </div>
            {cur.items.length > 0 && cur.page < cur.pages && !cur.error && (
              <div className="mt-4 flex justify-center"><button className={btnGhost} disabled={cur.loading} onClick={() => runSearch(true)}>{cur.loading ? <Loader2 size={15} className="animate-spin" /> : null} Carregar mais</button></div>
            )}
          </>
        )}

        {tab === 'library' && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className={`${inputCls} pl-9`} placeholder="Filtrar biblioteca…" value={libQ} onChange={(e) => setLibQ(e.target.value)} />
              </div>
              <select className={`${inputCls} w-64`} value={libCat} onChange={(e) => setLibCat(e.target.value)}>
                <option value="">Todas as pastas ({(lib || []).length} arquivos)</option>
                {libCats.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="mt-4 space-y-1">
              {lib === null && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-900/70" />)}
              {lib && !libItems.length && <EmptyState icon={FolderSearch} title="Nenhum áudio encontrado na pasta raiz." />}
              {libItems.slice(0, 400).map((it) => row(it, libItems, 'library'))}
            </div>
          </>
        )}

        {tab === 'favorites' && (
          <div className="space-y-1">
            {!st.favorites.length && <EmptyState icon={Star} title="Nenhum favorito ainda." />}
            {st.favorites.map((it) => row(it, st.favorites, 'search'))}
          </div>
        )}

        {tab === 'history' && (
          <>
            <div className="mb-3 flex justify-end"><button className={btnGhost} onClick={async () => { await call('aa:clearHistory'); setSt((x) => ({ ...x, history: [] })) }}>Limpar</button></div>
            {!st.history.length && <EmptyState icon={History} title="Nenhuma busca ainda." />}
            <div className="grid grid-cols-2 gap-2">
              {st.history.map((h, i) => (
                <button key={i} onClick={() => { setTab(h.type); setQ(h.query); runSearch(false, h.query, h.type) }} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left hover:border-cyan-500/30">
                  {h.type === 'sfx' ? <AudioWaveform size={16} className="text-cyan-400" /> : <Music size={16} className="text-cyan-400" />}
                  <span className="flex-1 truncate text-sm text-slate-200">{h.query}</span>
                  <span className="text-[11px] text-slate-500">{new Date(h.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'queue' && (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Os downloads rodam um por vez, com intervalo entre eles. A pasta sugerida pode ser trocada em cada item.</p>
              <div className="flex gap-2">
                <button className={btnGhost} onClick={() => setQueue((l) => l.filter((x) => x.status === 'pending' || x.status === 'running'))}>Limpar concluídos</button>
                <button className={btnPrimary} disabled={queueRunning || !queue.some((x) => x.status === 'pending')} onClick={runQueue}><Download size={15} /> Baixar fila</button>
              </div>
            </div>
            {!queue.length && <EmptyState icon={ListPlus} title="Fila vazia." description="Marque resultados na busca para adicionar." />}
            <div className="space-y-1.5">
              {queue.map((x, i) => (
                <div key={keyOf(x.item)} className="grid grid-cols-[36px_minmax(0,1fr)_220px_90px_32px] items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <button onClick={() => toggle(x.item, queue.map((y) => y.item))} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300"><Play size={15} className="ml-0.5" /></button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{x.item.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{x.item.author} · {fmtTime(x.item.duration)}{x.error ? ` · ${x.error}` : ''}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-slate-800"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.round((x.p || 0) * 100)}%` }} /></div>
                  </div>
                  <select disabled={x.status !== 'pending'} className={`${inputCls} py-1.5 text-xs`} value={x.category} onChange={(e) => setQueue((l) => l.map((y, j) => (j === i ? { ...y, category: e.target.value } : y)))}>
                    {[...new Set([...st.categories, x.category])].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <span className={`text-xs ${x.status === 'error' ? 'text-red-400' : x.status === 'done' || x.status === 'dup' ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {{ pending: 'Aguardando', running: 'Baixando', done: 'Concluído', dup: 'Concluído', error: 'Erro' }[x.status]}
                  </span>
                  <button disabled={x.status === 'running'} className={iconBtn} onClick={() => setQueue((l) => l.filter((_, j) => j !== i))}><X size={15} /></button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'settings' && (
          <Card className="max-w-2xl space-y-5 p-6">
            <Field label="Pasta raiz do banco de sons" hint="As subpastas viram categorias. O catálogo (catalogo-pixabay.json e .csv) fica aqui.">
              <div className="flex gap-2">
                <input className={`${inputCls} font-mono text-[13px]`} value={cfg.root} onChange={(e) => setCfg({ ...cfg, root: e.target.value })} placeholder="Ex.: G:\Meu Drive\Video Youtube\Canal\Materiais\Sounds" />
                <button className={btnGhost} onClick={async () => { const p = await call('sys:pickFolder', { title: 'Pasta do banco de sons', defaultPath: cfg.root || undefined }); if (p) setCfg({ ...cfg, root: p }) }}><FolderPlus size={15} /> Escolher</button>
              </div>
            </Field>
            <Field label="Intervalo entre requisições ao Pixabay (ms)" hint="Mínimo 500 ms. Um item por vez, para não sobrecarregar o site.">
              <input type="number" min={500} className={`${inputCls} w-48`} value={cfg.intervalMs} onChange={(e) => setCfg({ ...cfg, intervalMs: e.target.value })} />
            </Field>
            <p className="text-xs text-slate-500">Cada arquivo baixado fica registrado no catálogo com a origem e a licença (Pixabay Content License). Músicas marcadas com Content ID podem gerar reivindicação no YouTube.</p>
            <button className={btnPrimary} onClick={salvarCfg}><Check size={15} /> Salvar</button>
          </Card>
        )}
      </div>

      {/* Player */}
      <div className="flex shrink-0 items-center gap-4 border-t border-slate-800 bg-slate-950/95 px-8 py-3">
        <div className="flex items-center gap-1">
          <button className={iconBtn} onClick={() => step(-1)}><SkipBack size={16} /></button>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-40" disabled={!current} onClick={() => current && toggle(current)}>
            {paused ? <Play size={17} className="ml-0.5" /> : <Pause size={17} />}
          </button>
          <button className={iconBtn} onClick={() => step(1)}><SkipForward size={16} /></button>
        </div>
        <div className="w-64 min-w-0">
          <p className="truncate text-sm font-semibold">{current?.title || 'Nada tocando'}</p>
          <p className="truncate text-[11px] text-slate-500">{current ? [current.author, current.category].filter(Boolean).join(' · ') : 'Espaço toca/pausa · ↑↓ navegam'}</p>
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-slate-500">{fmtTime(time.c)}</span>
        <div className="h-1.5 flex-1 cursor-pointer rounded-full bg-slate-800" onClick={(e) => { const a = audio.current; const r = e.currentTarget.getBoundingClientRect(); if (a.duration) a.currentTime = ((e.clientX - r.left) / r.width) * a.duration }}>
          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${time.d ? (time.c / time.d) * 100 : 0}%` }} />
        </div>
        <span className="w-10 text-xs tabular-nums text-slate-500">{fmtTime(time.d || current?.duration)}</span>
        <Volume2 size={15} className="text-slate-500" />
        <input type="range" min="0" max="1" step="0.05" defaultValue={localStorage.getItem('aa_vol') ?? 0.8} className="w-24 accent-cyan-500" onChange={(e) => { audio.current.volume = e.target.value; localStorage.setItem('aa_vol', e.target.value) }} />
        <audio ref={audio} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onEnded={() => setPaused(true)}
          onTimeUpdate={(e) => setTime({ c: e.currentTarget.currentTime, d: e.currentTarget.duration || 0 })}
          onError={() => { if (audio.current?.src) toast('Falha ao carregar o áudio (sem internet ou arquivo ausente).', 'error') }} />
      </div>

      <Modal open={!!dl} onClose={() => setDl(null)} title="Salvar em…" width="max-w-xl"
        footer={<><button className={btnGhost} onClick={() => setDl(null)}>Cancelar</button><button className={btnPrimary} onClick={() => confirmDownload()} disabled={!dl?.cat && !dl?.novo.trim()}><Download size={15} /> Baixar</button></>}>
        {dl && (
          <>
            <p className="mb-3 text-sm text-slate-400">{dl.item.title} — {dl.item.author}</p>
            <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto">
              {[...new Set([...(dl.sug ? [dl.sug.name] : []), ...st.categories])].map((c) => (
                <button key={c} onClick={() => setDl({ ...dl, cat: c, novo: '' })} onDoubleClick={() => confirmDownload({ ...dl, cat: c, novo: '' })}
                  className={`truncate rounded-lg border px-2.5 py-2 text-left text-xs ${dl.cat === c && !dl.novo ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200' : 'border-slate-800 text-slate-300 hover:border-slate-700'}`} title={c}>
                  {c}
                  {dl.sug && c === dl.sug.name && <span className="ml-1 rounded bg-cyan-500/20 px-1 text-[9px] font-bold text-cyan-300">{dl.sug.isNew ? 'pasta nova' : 'sugerida'}</span>}
                </button>
              ))}
            </div>
            <p className="mb-1.5 mt-4 text-xs text-slate-500">ou crie uma pasta nova (vale pasta\subpasta)</p>
            <input className={inputCls} placeholder="Nova pasta" value={dl.novo} onChange={(e) => setDl({ ...dl, novo: e.target.value })} />
          </>
        )}
      </Modal>
    </div>
  )
}
