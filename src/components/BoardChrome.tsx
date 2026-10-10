import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { Board, Person, Role, WallLayout } from '../../shared/types'
import { MenuItem, PopoverMenu } from '@/components/PopoverMenu'
import { Button } from '@/components/ui/button'
import { classroomUrl, copyText } from '@/lib/share'
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
  onStudentPagesToggle,
  onLayout,
  onAdd,
  classroomId,
}: {
  board: Board
  role: Role
  people: Person[]
  status: 'off' | 'connecting' | 'live'
  nickname: string
  onNickname: () => void
  onShare?: () => void
  onSettings?: () => void
  onLockToggle?: () => void
  onStudentPagesToggle?: () => void
  onLayout?: (layout: WallLayout) => void
  onAdd?: () => void
  classroomId?: string
}) {
  const [openPeople, setOpenPeople] = useState(false)
  const [copiedRoom, setCopiedRoom] = useState(false)
  const peopleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPeople) return
    function onDoc(event: MouseEvent) {
      if (!peopleRef.current?.contains(event.target as Node)) setOpenPeople(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openPeople])

  const statusLabel = status === 'live' ? '已連線' : status === 'connecting' ? '重新連線中' : '未連線'

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-cream">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1 basis-40">
            {classroomId ? (
              <Link to={`/c/${classroomId}`} className="text-sm font-semibold text-sky">
                返回課室
              </Link>
            ) : role === 'teacher' ? (
              <Link to="/" className="text-sm font-semibold text-sky">
                返回課室
              </Link>
            ) : (
              <p className="text-sm font-semibold text-muted">
                {board.type === 'wall' ? '壁報板' : board.type === 'sandbox' ? '共同畫布' : '畫布'}
              </p>
            )}
            <h1 className="truncate font-serif text-2xl font-bold sm:text-3xl">{board.title}</h1>
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              {board.groupLabel && <span>{board.groupLabel}</span>}
              <span className={cn(status === 'live' ? 'text-leaf' : 'text-warn')}>{statusLabel}</span>
              <div className="relative" ref={peopleRef}>
                <button type="button" className="inline-flex min-h-[52px] items-center underline-offset-2 hover:underline" onClick={() => setOpenPeople((value) => !value)}>
                  {people.length} 人
                </button>
                {openPeople && (
                  <ul className="absolute left-0 z-50 mt-2 w-48 rounded-2xl border border-line bg-paper p-2 text-base text-ink shadow-lg">
                    {people.length === 0 && <li className="px-2 py-2 text-muted">暫時沒有人</li>}
                    {people.map((person) => (
                      <li key={person.id} className="truncate px-2 py-2">
                        {person.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onAdd && (
              <Button type="button" size="lg" className="hidden md:inline-flex" onClick={onAdd}>
                ＋ 新增貼文
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onNickname}>
              <span className="max-w-[7rem] truncate">{nickname || '我的名字'}</span>
            </Button>
            {role === 'teacher' && classroomId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void copyText(classroomUrl(classroomId)).then((ok) => {
                    if (!ok) return
                    setCopiedRoom(true)
                    window.setTimeout(() => setCopiedRoom(false), 2000)
                  })
                }}
              >
                {copiedRoom ? '已複製' : '課室連結'}
              </Button>
            )}
            {role === 'teacher' && onShare && (board.type === 'sandbox' || !classroomId) && (
              <Button type="button" variant="outline" onClick={onShare}>
                分享
              </Button>
            )}
            {role === 'teacher' && (onLockToggle || onStudentPagesToggle || onSettings || onLayout) && (
              <PopoverMenu label="老師工具 ▾">
                {onLayout && (
                  <>
                    <p className="px-3 py-1 text-sm font-semibold text-muted">排版</p>
                    <MenuItem pressed={board.layout === 'free'} onClick={() => onLayout('free')}>
                      自由擺放
                    </MenuItem>
                    <MenuItem pressed={board.layout === 'grid'} onClick={() => onLayout('grid')}>
                      整齊排列
                    </MenuItem>
                  </>
                )}
                {onLockToggle && (
                  <MenuItem onClick={onLockToggle}>
                    {board.type === 'sandbox' ? (board.locked ? '恢復編輯' : '暫停編輯') : board.locked ? '解除鎖定' : '鎖定壁報'}
                  </MenuItem>
                )}
                {onStudentPagesToggle && (
                  <MenuItem onClick={onStudentPagesToggle}>{board.allowStudentPages ? '暫停新版面' : '學生可開新版面'}</MenuItem>
                )}
                {onSettings && <MenuItem onClick={onSettings}>設定</MenuItem>}
              </PopoverMenu>
            )}
          </div>
        </div>
      </header>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="新增貼文"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 grid h-16 w-16 place-items-center rounded-full bg-stamp text-4xl leading-none text-white shadow-xl hover:bg-stamp-hover lg:hidden"
        >
          ＋
        </button>
      )}
    </>
  )
}
