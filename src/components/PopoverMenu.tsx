import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PopoverMenu({
  label,
  icon = false,
  children,
}: {
  label: string
  icon?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {icon ? (
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
          className="grid h-[52px] w-[52px] place-items-center rounded-2xl text-2xl font-bold leading-none text-ink hover:bg-cream"
        >
          ⋯
        </button>
      ) : (
        <Button type="button" variant="outline" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
          {label}
        </Button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-paper p-2 shadow-xl"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  children,
  onClick,
  pressed,
}: {
  children: ReactNode
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'flex min-h-[52px] w-full items-center rounded-xl px-3 text-left text-base font-semibold hover:bg-cream',
        pressed && 'bg-cream',
      )}
    >
      {children}
    </button>
  )
}
