import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-28 w-full rounded-xl border border-line bg-white px-3 py-2 text-base shadow-sm outline-none placeholder:text-ink/40 focus:border-leaf focus:ring-2 focus:ring-leaf/30 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
