import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-sans text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-stamp text-white shadow-sm hover:bg-stamp-hover',
        secondary: 'bg-leaf text-white shadow-sm hover:bg-leaf/90',
        outline: 'border border-line bg-paper text-ink hover:bg-cream',
        ghost: 'text-ink hover:bg-black/5',
        destructive: 'border border-danger/30 bg-white text-danger hover:bg-red-50',
      },
      size: {
        default: 'h-[52px] px-4',
        sm: 'h-[52px] px-3',
        lg: 'h-14 px-5',
        icon: 'h-[52px] w-[52px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
