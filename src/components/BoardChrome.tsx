import { Link } from 'react-router-dom'
import { LayoutGrid, Lock, LockOpen, Plus, Settings, Share2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Board, Person, Role, WallLayout } from '../../shared/types'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function BoardChrome({
  board,
  role,
  people,
  status,
  nickname,
  onNickname,
  onShare,
  onSettings,
  onLockToggle,
  onLayout,
  onAdd,
}: {
  board: Board
  role: Role
  people: Person[]
  status: 'off' | 'connecting' | 'live'
  nickname: string
  onNickname: () => void
  onShare: () => void
  onSettings?: () => void
  onLockToggle?: () => void
  onLayout?: (layout: WallLayout) => void
  onAdd?: () => void
}) {
  const tone = board.type === 'wall' ? 'wood' : 'paper'
  const [openPeople, setOpenPeople] = useState(false)
  const peopleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPeople) return
    function onDoc(event: MouseEvent) {
      if (!peopleRef.current?.contains(event.target as Node)) setOpenPeople(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openPeople])

  const light = tone === 'wood'

  return (
    <header className={cn('sticky top-0 z-40', light ? 'wood' : 'border-b border-line bg-paper/95 backdrop-blur')}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {role === 'teacher' ? (
            <Link to="/" className={cn('text-sm underline-offset-2 hover:underline', light && 'text-white')}>
              課室
            </Link>
          ) : (
            <Logo compact light={light} />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-serif text-xl font-bold">{board.title}</h1>
              {board.groupLabel && (
                <span className={cn('rounded-full px-2 py-0.5 text-xs', light ? 'bg-white/20' : 'bg-cream')}>{board.groupLabel}</span>
              )}
              {board.locked && <span className={cn('text-xs', light ? 'text-white/85' : 'text-stamp')}>已鎖定</span>}
            </div>
            <p className={cn('text-xs', light ? 'text-white/75' : 'text-ink/60')}>
              {board.type === 'wall' ? '壁報板' : '互動畫布'}
              <span className="mx-1">·</span>
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', status === 'live' ? 'bg-emerald-400' : 'bg-amber-300')} />
              {status === 'live' ? '已連線' : status === 'connecting' ? '重新連線中' : '未連線'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {board.type === 'wall' && onLayout && (
            <div className={cn('flex rounded-xl p-1', light ? 'bg-black/15' : 'bg-cream')}>
              <LayoutButton active={board.layout === 'free'} light={light} onClick={() => onLayout('free')}>
                <Sparkles className="h-3.5 w-3.5" /> 自由擺放
              </LayoutButton>
              <LayoutButton active={board.layout === 'grid'} light={light} onClick={() => onLayout('grid')}>
                <LayoutGrid className="h-3.5 w-3.5" /> 整齊排列
              </LayoutButton>
            </div>
          )}
          <div className="relative" ref={peopleRef}>
            <Button type="button" size="sm" variant="ghost" className={light ? 'text-white hover:bg-white/15' : ''} onClick={() => setOpenPeople((value) => !value)}>
              在線 {people.length}
            </Button>
            {openPeople && (
              <ul className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-line bg-paper p-2 text-sm text-ink shadow-lg">
                {people.length === 0 && <li className="px-2 py-1 text-ink/60">暫時沒有人</li>}
                {people.map((person) => (
                  <li key={person.id} className="truncate px-2 py-1">
                    {person.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="button" size="sm" variant="ghost" className={light ? 'text-white hover:bg-white/15' : ''} onClick={onNickname}>
            {nickname || '設定暱稱'}
          </Button>
          <Button type="button" size="sm" variant="outline" className={light ? 'border-white/30 bg-white/10 text-white hover:bg-white/20' : ''} onClick={onShare}>
            <Share2 className="h-4 w-4" />
            分享
          </Button>
          {role === 'teacher' && onLockToggle && (
            <Button type="button" size="sm" variant="outline" className={light ? 'border-white/30 bg-white/10 text-white hover:bg-white/20' : ''} onClick={onLockToggle}>
              {board.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              {board.locked ? '解鎖' : '鎖定'}
            </Button>
          )}
          {role === 'teacher' && onSettings && (
            <Button type="button" size="sm" variant="outline" className={light ? 'border-white/30 bg-white/10 text-white hover:bg-white/20' : ''} onClick={onSettings}>
              <Settings className="h-4 w-4" />
              設定
            </Button>
          )}
          {onAdd && (
            <Button type="button" size="sm" className={light ? 'bg-white text-ink hover:bg-white/90' : ''} onClick={onAdd}>
              <Plus className="h-4 w-4" />
              新增貼文
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

function LayoutButton({
  active,
  light,
  onClick,
  children,
}: {
  active: boolean
  light: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium',
        active ? (light ? 'bg-white text-ink' : 'bg-white text-ink shadow-sm') : light ? 'text-white/85' : 'text-ink/70',
      )}
    >
      {children}
    </button>
  )
}
