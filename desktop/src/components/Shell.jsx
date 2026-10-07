import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Images, Film, AudioLines, Music, FolderPen, Users, Terminal, Settings, CircleHelp, ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, MessagesSquare, Plug,
} from 'lucide-react'
import Logo from './Logo'
import { call } from '../lib/api'

export const NAV = [
  { key: 'dashboard', label: 'Início', Icon: LayoutDashboard },
  {
    group: 'producao', label: 'Produção', items: [
      { key: 'projetos', label: 'Meus Projetos', Icon: Images },
      { key: 'srt', label: 'Sincronizador SRT', Icon: Film },
      { key: 'narracao', label: 'Narração', Icon: AudioLines, badge: 'EM BREVE' },
    ],
  },
  {
    group: 'ferramentas', label: 'Ferramentas', items: [
      { key: 'audio-atlas', label: 'Audio Atlas', Icon: Music },
      { key: 'renomeador', label: 'Renomeador', Icon: FolderPen },
      { key: 'conectar-ia', label: 'Conectar IA', Icon: Plug },
    ],
  },
  {
    group: 'sistema', label: 'Sistema', items: [
      { key: 'contas', label: 'Contas', Icon: Users },
      { key: 'logs', label: 'Logs', Icon: Terminal },
      { key: 'config', label: 'Configurações', Icon: Settings },
    ],
  },
]

function Item({ item, active, onClick, compact }) {
  const { Icon } = item
  return (
    <button
      onClick={onClick}
      title={compact ? item.label : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-2 text-[13px] font-medium tracking-tight transition-colors ${
        active ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'
      } ${compact ? 'justify-center px-0' : ''}`}
    >
      <Icon size={16} className="shrink-0" />
      {!compact && <span className="truncate">{item.label}</span>}
      {!compact && item.badge && <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{item.badge}</span>}
    </button>
  )
}

export default function Shell({ page, go, user, queue, onChat, chatOpen, children }) {
  const [compact, setCompact] = useState(false)
  const [closed, setClosed] = useState({})
  const [versao, setVersao] = useState('')
  useEffect(() => { call('app:info').then((i) => setVersao(i?.version || '')).catch(() => {}) }, [])
  const ativo = page.split('/')[0]
  const producing = queue && queue.running

  return (
    <div className="flex h-full flex-col">
      {/* Barra de título (arrastável). Os botões de janela do sistema ficam à direita. */}
      <div className="drag flex h-10 shrink-0 items-center gap-3 border-b border-slate-800/70 bg-slate-950 pl-4 pr-[150px]">
        <Logo size="sm" />
        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.14em] text-cyan-300">DESKTOP</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className={`flex shrink-0 flex-col border-r border-slate-800/70 bg-slate-950 transition-[width] duration-200 ${compact ? 'w-[64px]' : 'w-[232px]'}`}>
          <div className={`flex px-3 pt-3 ${compact ? 'justify-center' : 'justify-end'}`}>
            <button onClick={() => setCompact(!compact)} className="rounded-md p-1 text-slate-600 hover:text-slate-300" title={compact ? 'Expandir menu' : 'Recolher menu'}>
              {compact ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
          <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
            {NAV.map((n) =>
              n.key ? (
                <Item key={n.key} item={n} compact={compact} active={ativo === n.key} onClick={() => go(n.key)} />
              ) : (
                <div key={n.group}>
                  {!compact && (
                    <button
                      onClick={() => setClosed((c) => ({ ...c, [n.group]: !c[n.group] }))}
                      className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400/70 hover:text-cyan-300"
                    >
                      {n.label}
                      <ChevronDown size={13} className={`text-slate-600 transition-transform ${closed[n.group] ? '-rotate-90' : ''}`} />
                    </button>
                  )}
                  {!closed[n.group] && (
                    <div className="mt-0.5 space-y-px">
                      {n.items.map((it) => (
                        <Item key={it.key} item={it} compact={compact} active={ativo === it.key || (it.key === 'projetos' && ativo === 'creator')} onClick={() => go(it.key)} />
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            <div className="border-t border-slate-800/70 pt-3">
              <Item compact={compact} item={{ label: 'Ajuda', Icon: CircleHelp }} onClick={() => call('sys:openSite', '/app-desktop')} />
            </div>
          </nav>

          <div className="space-y-2 border-t border-slate-800/70 p-3">
            <button
              onClick={() => go('projetos')}
              title={producing ? 'Fila gerando' : queue?.paused ? 'Fila pausada' : 'Fila parada'}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                producing ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-400' : queue?.paused ? 'border-amber-500/25 bg-amber-500/5 text-amber-400' : 'border-slate-800 text-slate-500'
              } ${compact ? 'justify-center px-0' : ''}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${producing ? 'online-dot bg-emerald-400' : queue?.paused ? 'bg-amber-400' : 'bg-slate-600'}`} />
              {!compact && (producing ? 'Produzindo' : queue?.paused ? 'Fila pausada' : 'Fila parada')}
              {!compact && <span className="ml-auto text-[10px] text-slate-500">{queue ? `${queue.pending ?? 0} na fila` : ''}</span>}
            </button>
            {versao && !compact && (
              <p className="px-1.5 text-center text-[10px] font-medium tracking-wide text-slate-600">Noctis Studio v{versao}</p>
            )}
            {versao && compact && (
              <p className="text-center text-[9px] font-medium text-slate-600">v{versao}</p>
            )}
            {user && !compact && (
              <div className="flex items-center gap-2 rounded-lg px-1.5 py-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-xs font-bold text-slate-950">
                  {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-200">{user.name || user.email}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-400/80">{user.plan === 'MASTER' ? 'Pro' : user.plan}</p>
                </div>
                <button onClick={() => call('auth:signout')} title="Sair da conta" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-900 hover:text-red-400">
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden">
          {children}
          {!chatOpen && (
            <button
              onClick={onChat}
              title="Chat com IA"
              className={`absolute ${ativo === 'audio-atlas' ? 'bottom-24' : 'bottom-5'} right-5 z-40 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/30 bg-slate-900 text-cyan-300 shadow-xl shadow-black/40 transition-colors hover:bg-slate-800`}
            >
              <MessagesSquare size={20} />
            </button>
          )}
        </main>
      </div>
    </div>
  )
}
