import { Hammer } from 'lucide-react'

export default function ComingSoon({ phase, feature }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
        <Hammer size={30} />
      </div>
      <h2 className="mt-5 text-xl font-bold text-slate-100">{feature ? `${feature} — Em breve` : 'Em breve'}</h2>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        Esta funcionalidade está em desenvolvimento e será liberada em uma próxima atualização.
      </p>
      {phase && (
        <span className="mt-4 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-500">
          Fase {phase} do roadmap
        </span>
      )}
    </div>
  )
}
