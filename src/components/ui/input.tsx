import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-14 w-full rounded-2xl border border-line bg-paper px-4 font-sans text-lg shadow-sm outline-none placeholder:text-muted focus:border-leaf focus:ring-2 focus:ring-leaf/30 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
