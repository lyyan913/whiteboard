import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PopoverMenu({
  label,
  icon = false,
  children,
  triggerClassName,
}: {
  label: string
  icon?: boolean
  children: ReactNode
  triggerClassName?: string
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
          className={cn('grid h-[52px] w-[52px] place-items-center rounded-2xl text-2xl font-bold leading-none text-ink hover:bg-cream', triggerClassName)}
        >
          ⋯
        </button>
      ) : (
        <Button type="button" variant="outline" className={triggerClassName} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
          {label}
        </Button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 max-h-[min(70dvh,28rem)] w-64 overflow-y-auto rounded-2xl border border-line bg-paper p-2 shadow-xl"
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
  keepOpen = false,
  className,
}: {
  children: ReactNode
  onClick: () => void
  pressed?: boolean
  keepOpen?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-pressed={pressed}
      onClick={(event) => {
        if (keepOpen) event.stopPropagation()
        onClick()
      }}
      className={cn(
        'flex min-h-[52px] w-full items-center rounded-xl px-3 text-left text-base font-semibold hover:bg-cream',
        pressed && 'bg-cream',
        className,
      )}
    >
      {children}
    </button>
  )
}
