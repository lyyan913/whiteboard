import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-32 w-full rounded-2xl border border-line bg-paper px-4 py-3 font-sans text-lg shadow-sm outline-none placeholder:text-muted focus:border-leaf focus:ring-2 focus:ring-leaf/30 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
