import { cn } from '@/lib/utils'

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-stamp font-serif text-xl font-bold text-white shadow-sm">
        同
      </div>
      {!compact && (
        <div className={cn('leading-tight', light ? 'text-white' : 'text-ink')}>
          <div className="font-serif text-lg font-bold">同窗</div>
          <div className={cn('text-xs', light ? 'text-white/75' : 'text-ink/60')}>課堂協作壁報</div>
        </div>
      )}
    </div>
  )
}
