function Mark({ className }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="noctis-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00f2fe" />
          <stop offset="1" stopColor="#00b8cc" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#noctis-g)" />
      {/* Lua crescente estilizada */}
      <path d="M26.5 10.5a10.5 10.5 0 1 0 3 17.4A11.8 11.8 0 0 1 26.5 10.5z" fill="#0d0e12" opacity="0.92" />
      <circle cx="25.5" cy="14.5" r="1.6" fill="#f0abfc" />
    </svg>
  )
}

export default function Logo({ size = 'md' }) {
  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const text = size === 'lg' ? 'text-2xl' : 'text-lg'
  return (
    <div className="flex items-center gap-2.5">
      <Mark className={`${box} drop-shadow-[0_0_12px_rgba(0,242,254,0.3)]`} />
      <span className={`${text} font-bold tracking-tight text-slate-100`}>
        Noctis <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">Studio</span>
      </span>
    </div>
  )
}
