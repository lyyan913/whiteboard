import { BookOpen, FolderUp, Palette, Pin, QrCode } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Board, BoardType, Person, Role, WallLayout } from '../../shared/types'
import { MenuItem, PopoverMenu } from '@/components/PopoverMenu'
import { Button } from '@/components/ui/button'
import { classroomUrl, copyText } from '@/lib/share'
import { cn } from '@/lib/utils'

const BOARD_MARK: Record<BoardType, { Icon: typeof Pin }> = {
  sandbox: { Icon: BookOpen },
  canvas: { Icon: Palette },
  wall: { Icon: Pin },
}

const AVATAR_COLORS = ['#e07b24', '#1f7a54', '#1d4e89', '#6b4c9a', '#d6457a', '#c99a06', '#c4492c']

function avatarColor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function avatarInk(color: string) {
  return color === '#c99a06' || color === '#e07b24' ? '#1f1a14' : '#ffffff'
}

function nameInitial(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return '？'
  return Array.from(trimmed)[0] ?? '？'
}

export function BoardChrome({
  board,
  role,
  people,
  status,
  nickname,
  onNickname,
  onShare,
  onJoin,
  onLink,
  onFolder,
  dropCount = 0,
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
  onJoin?: () => void
  onLink?: () => void
  onFolder?: () => void
  dropCount?: number
  onSettings?: () => void
  onLockToggle?: () => void
  onStudentPagesToggle?: () => void
  onLayout?: (layout: WallLayout) => void
  onAdd?: () => void
  classroomId?: string
}) {
  const [openPeople, setOpenPeople] = useState(false)
  const [copiedRoom, setCopiedRoom] = useState(false)
  const peopleDesktopRef = useRef<HTMLDivElement>(null)
  const peopleCompactRef = useRef<HTMLDivElement>(null)
  const peopleTabletRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPeople) return
    function onDoc(event: MouseEvent) {
      const target = event.target as Node
      if (peopleDesktopRef.current?.contains(target) || peopleCompactRef.current?.contains(target) || peopleTabletRef.current?.contains(target)) return
      setOpenPeople(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openPeople])

  const statusLabel = status === 'live' ? '已連線' : status === 'connecting' ? '重新連線中' : '未連線'
  const mark = BOARD_MARK[board.type]
  const shownPeople = people.slice(0, 5)
  const extraPeople = people.length - shownPeople.length
  const hasTeacherTools = Boolean(onLockToggle || onStudentPagesToggle || onSettings || onLayout)
  const showMore = role === 'teacher' || Boolean(onAdd)

  function copyRoom() {
    if (!classroomId) return
    void copyText(classroomUrl(classroomId)).then((ok) => {
      if (!ok) return
      setCopiedRoom(true)
      window.setTimeout(() => setCopiedRoom(false), 2000)
    })
  }

  function backLink(className: string) {
    if (classroomId) {
      return (
        <Link to={`/c/${classroomId}`} className={className}>
          返回課室
        </Link>
      )
    }
    if (role === 'teacher') {
      return (
        <Link to="/" className={className}>
          返回課室
        </Link>
      )
    }
    return <p className={className}>{board.type === 'wall' ? '壁報板' : board.type === 'sandbox' ? '共同畫布' : '畫布'}</p>
  }

  function teacherToolItems() {
    return (
      <>
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
          <MenuItem onClick={onStudentPagesToggle}>{board.allowStudentPages ? '暫停新版面' : '學生可新增版面'}</MenuItem>
        )}
        {onSettings && <MenuItem onClick={onSettings}>設定</MenuItem>}
      </>
    )
  }

  function peopleFaces() {
    if (people.length === 0) return <span className="text-sm font-semibold text-muted">0 人</span>
    return (
      <span className="flex items-center">
        {shownPeople.map((person, index) => {
          const color = avatarColor(person.name)
          return (
            <span
              key={person.id}
              className="grid h-8 w-8 place-items-center rounded-full border-2 border-white text-sm font-bold shadow-sm"
              style={{ background: color, color: avatarInk(color), marginLeft: index === 0 ? 0 : -8, zIndex: shownPeople.length - index }}
            >
              {nameInitial(person.name)}
            </span>
          )
        })}
        {extraPeople > 0 && (
          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-ink text-xs font-bold text-white shadow-sm" style={{ marginLeft: -8 }}>
            +{extraPeople}
          </span>
        )}
      </span>
    )
  }

  function peopleControl(mode: 'desktop' | 'compact' | 'tablet', ref: RefObject<HTMLDivElement | null>) {
    const countButton = (className: string) => (
      <button
        type="button"
        className={className}
        aria-expanded={openPeople}
        aria-label={`${people.length} 人在線`}
        onClick={() => setOpenPeople((value) => !value)}
      >
        <span className="whitespace-nowrap">{people.length} 人</span>
      </button>
    )
    return (
      <div className="relative shrink-0" ref={ref}>
        {mode === 'tablet' ? (
          <>
            {countButton('inline-flex h-[52px] min-w-11 items-center justify-center px-1.5 text-base font-semibold min-[1100px]:hidden')}
            <button
              type="button"
              className="hidden h-[52px] min-w-11 items-center justify-center px-1 min-[1100px]:inline-flex"
              aria-expanded={openPeople}
              aria-label={`${people.length} 人在線`}
              onClick={() => setOpenPeople((value) => !value)}
            >
              {peopleFaces()}
            </button>
          </>
        ) : (
        <button
          type="button"
          className={cn('inline-flex min-w-11 items-center justify-center px-1.5', mode === 'compact' ? 'h-11 text-sm font-semibold' : 'min-h-[52px]')}
          aria-expanded={openPeople}
          aria-label={`${people.length} 人在線`}
          onClick={() => setOpenPeople((value) => !value)}
        >
          {mode === 'compact' ? (
            <span className="whitespace-nowrap">{people.length} 人</span>
          ) : people.length === 0 ? (
            <span className="text-sm font-semibold text-muted">0 人</span>
          ) : (
            peopleFaces()
          )}
        </button>
        )}
        {openPeople && (
          <ul className="absolute right-0 z-50 mt-2 max-h-64 w-48 overflow-y-auto rounded-2xl border border-line bg-paper p-2 text-base text-ink shadow-lg">
            {people.length === 0 && <li className="px-2 py-2 text-muted">暫時沒有人</li>}
            {people.map((person) => (
              <li key={person.id} className="truncate px-2 py-2">
                {person.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  let moreMenu: ReactNode = null
  if (showMore) {
    moreMenu = (
      <PopoverMenu label="更多" triggerClassName="!h-11 !min-h-11 shrink-0 px-3">
        {role === 'teacher' && <MenuItem onClick={onNickname}>{nickname ? `我的名字：${nickname}` : '我的名字'}</MenuItem>}
        {role === 'teacher' && classroomId && (
          <MenuItem keepOpen onClick={copyRoom}>
            {copiedRoom ? '已複製課室連結' : '課室連結'}
          </MenuItem>
        )}
        {role === 'teacher' && onFolder && <MenuItem onClick={onFolder}>學生作品{dropCount > 0 ? `（${dropCount}）` : ''}</MenuItem>}
        {role === 'teacher' && onLink && <MenuItem onClick={onLink}>分享連結</MenuItem>}
        {role === 'teacher' && onJoin && <MenuItem onClick={onJoin}>掃碼入板</MenuItem>}
        {role === 'teacher' && onShare && <MenuItem onClick={onShare}>掃碼交作品</MenuItem>}
        {onAdd && <MenuItem onClick={onAdd}>新增貼文</MenuItem>}
        {role === 'teacher' && hasTeacherTools && (
          <>
            <p className="px-3 py-1 text-sm font-semibold text-muted">老師工具</p>
            {teacherToolItems()}
          </>
        )}
        {board.groupLabel && <p className="px-3 py-1 text-sm text-muted">{board.groupLabel}</p>}
      </PopoverMenu>
    )
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-cream">
        <div className="board-desktop-only flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1 basis-40">
            {backLink('inline-flex h-11 items-center text-sm font-semibold text-sky')}
            <h1 className="flex min-w-0 items-center gap-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">
              <mark.Icon className="h-7 w-7 shrink-0 text-stamp sm:h-8 sm:w-8" aria-hidden />
              <span className="truncate">{board.title}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              {board.groupLabel && <span>{board.groupLabel}</span>}
              <span className={cn(status === 'live' ? 'text-leaf' : 'text-warn')}>{statusLabel}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {peopleControl('desktop', peopleDesktopRef)}
            {onAdd && (
              <Button type="button" size="lg" className="hidden md:inline-flex" onClick={onAdd}>
                ＋ 新增貼文
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onNickname}>
              <span className="max-w-[7rem] truncate">{nickname || '我的名字'}</span>
            </Button>
            {role === 'teacher' && classroomId && (
              <Button type="button" variant="outline" onClick={copyRoom}>
                {copiedRoom ? '已複製' : '課室連結'}
              </Button>
            )}
            {role === 'teacher' && onFolder && (
              <Button type="button" variant="secondary" onClick={onFolder} aria-label={dropCount > 0 ? `學生作品，${dropCount} 份` : '學生作品'}>
                學生作品
                {dropCount > 0 && (
                  <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-sm font-bold leading-none text-leaf">
                    {dropCount}
                  </span>
                )}
              </Button>
            )}
            {role === 'teacher' && onLink && (
              <Button type="button" variant="outline" onClick={onLink}>
                分享連結
              </Button>
            )}
            {role === 'teacher' && onJoin && (
              <Button type="button" variant="secondary" onClick={onJoin}>
                <QrCode className="h-5 w-5" />
                掃碼入板
              </Button>
            )}
            {role === 'teacher' && onShare && (
              <Button type="button" onClick={onShare}>
                <FolderUp className="h-5 w-5" />
                掃碼交作品
              </Button>
            )}
            {role === 'teacher' && hasTeacherTools && <PopoverMenu label="老師工具 ▾">{teacherToolItems()}</PopoverMenu>}
          </div>
        </div>
        <div className="board-tablet-only">
          {backLink('inline-flex h-[52px] shrink-0 items-center whitespace-nowrap text-base font-semibold text-sky')}
          <h1 className="flex min-w-0 flex-1 items-center gap-1.5 text-xl font-bold leading-none">
            <mark.Icon className="h-6 w-6 shrink-0 text-stamp" aria-hidden />
            <span className="truncate">{board.title}</span>
          </h1>
          <span className={cn('shrink-0 whitespace-nowrap text-sm font-semibold', status === 'live' ? 'text-leaf' : 'text-warn')}>{statusLabel}</span>
          {peopleControl('tablet', peopleTabletRef)}
          {role !== 'teacher' && (
            <Button type="button" variant="outline" className="max-w-[8rem] shrink-0 px-3" onClick={onNickname}>
              <span className="truncate">{nickname || '我的名字'}</span>
            </Button>
          )}
          {role === 'teacher' && (
            <Button type="button" variant="outline" className="hidden shrink-0 px-3 min-[1100px]:inline-flex" onClick={onNickname}>
              <span className="max-w-[7rem] truncate">{nickname || '我的名字'}</span>
            </Button>
          )}
          {role === 'teacher' && classroomId && (
            <Button type="button" variant="outline" className="hidden shrink-0 px-3 min-[900px]:inline-flex" onClick={copyRoom}>
              {copiedRoom ? '已複製' : '課室連結'}
            </Button>
          )}
          {role === 'teacher' && onFolder && (
            <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={onFolder} aria-label={dropCount > 0 ? `學生作品，${dropCount} 份` : '學生作品'}>
              學生作品
              {dropCount > 0 && (
                <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-sm font-bold leading-none text-leaf">{dropCount}</span>
              )}
            </Button>
          )}
          {role === 'teacher' && onLink && (
            <Button type="button" variant="outline" className="hidden shrink-0 px-3 min-[900px]:inline-flex" onClick={onLink}>
              分享連結
            </Button>
          )}
          {role === 'teacher' && onJoin && (
            <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={onJoin}>
              <QrCode className="h-5 w-5" />
              掃碼入板
            </Button>
          )}
          {role === 'teacher' && onShare && (
            <Button type="button" className="shrink-0 px-3" onClick={onShare}>
              <FolderUp className="h-5 w-5" />
              掃碼交作品
            </Button>
          )}
          {role === 'teacher' && hasTeacherTools && (
            <span className="hidden shrink-0 min-[1100px]:inline-flex">
              <PopoverMenu label="老師工具 ▾">{teacherToolItems()}</PopoverMenu>
            </span>
          )}
          {showMore && (
            <PopoverMenu label="更多" triggerClassName="shrink-0 px-3 min-[1100px]:!hidden">
              {role === 'teacher' && (
                <MenuItem className="min-[1100px]:hidden" onClick={onNickname}>
                  {nickname ? `我的名字：${nickname}` : '我的名字'}
                </MenuItem>
              )}
              {role === 'teacher' && classroomId && (
                <MenuItem className="min-[900px]:hidden" keepOpen onClick={copyRoom}>
                  {copiedRoom ? '已複製課室連結' : '課室連結'}
                </MenuItem>
              )}
              {role === 'teacher' && onLink && (
                <MenuItem className="min-[900px]:hidden" onClick={onLink}>
                  分享連結
                </MenuItem>
              )}
              {onAdd && <MenuItem onClick={onAdd}>新增貼文</MenuItem>}
              {role === 'teacher' && hasTeacherTools && (
                <div className="min-[1100px]:hidden">
                  <p className="px-3 py-1 text-sm font-semibold text-muted">老師工具</p>
                  {teacherToolItems()}
                </div>
              )}
            </PopoverMenu>
          )}
        </div>
        <div className="board-compact-only">
          {backLink('inline-flex h-11 shrink-0 items-center whitespace-nowrap text-sm font-semibold text-sky')}
          <h1 className="flex min-w-0 flex-1 items-center gap-1 text-base font-bold leading-none">
            <mark.Icon className="h-5 w-5 shrink-0 text-stamp" aria-hidden />
            <span className="truncate">{board.title}</span>
          </h1>
          <span className={cn('shrink-0 whitespace-nowrap text-xs font-semibold', status === 'live' ? 'text-leaf' : 'text-warn')}>{statusLabel}</span>
          {peopleControl('compact', peopleCompactRef)}
          {role !== 'teacher' && (
            <Button type="button" variant="outline" className="!h-11 !min-h-11 max-w-[6.5rem] shrink-0 px-2.5" onClick={onNickname}>
              <span className="truncate">{nickname || '我的名字'}</span>
            </Button>
          )}
          {role === 'teacher' && onJoin && (
            <Button type="button" variant="secondary" className="!h-11 !w-11 !min-h-11 shrink-0 !px-0" aria-label="掃碼入板" onClick={onJoin}>
              <QrCode className="h-5 w-5" />
            </Button>
          )}
          {moreMenu}
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
