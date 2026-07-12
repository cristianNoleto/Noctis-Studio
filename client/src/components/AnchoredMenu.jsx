import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Menu suspenso renderizado num PORTAL no <body> — nunca é cortado por
// `overflow-hidden` de containers-pai (cards, acordeões, tabelas). Fica
// ancorado ao botão (anchorRef) via position: fixed, reposiciona no scroll/
// resize e fecha ao clicar fora ou apertar Esc.
export function AnchoredMenu({ open, anchorRef, onClose, children, width = 176, align = 'right' }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const margin = 8
      let left = align === 'right' ? r.right - width : r.left
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
      setPos({ top: r.bottom + 6, left })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchorRef, width, align])

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return
      onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, anchorRef, onClose])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
      className="z-[999] rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-2xl shadow-black/50"
    >
      {children}
    </div>,
    document.body,
  )
}
