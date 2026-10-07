import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-xl border border-line bg-white px-3 text-base shadow-sm outline-none placeholder:text-ink/40 focus:border-leaf focus:ring-2 focus:ring-leaf/30 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
