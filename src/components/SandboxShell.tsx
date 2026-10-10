import { useEffect, useRef, useState } from 'react'
import type { CanvasItem, ItemCreate, Role, SandboxPage } from '../../shared/types'
import { isAllowedImageUrl } from '../../shared/media'
import { CardCanvas } from '@/components/CardCanvas'
import { CARD_H, CARD_W, cardBounds } from '@/components/cardFrame'
import { MenuItem, PopoverMenu } from '@/components/PopoverMenu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function SandboxShell({
  pages,
  activePageId,
  items,
  role,
  clientId,
  locked,
  allowStudentPages,
  onSelect,
  onCreatePage,
  onRenamePage,
  onDeletePage,
  onCreate,
  onUpload,
  onLocal,
  onUpdate,
  onDelete,
  onLive,
  onInteract,
  onError,
}: {
  pages: SandboxPage[]
  activePageId: string | null
  items: CanvasItem[]
  role: Role
  clientId: string
  locked: boolean
  allowStudentPages: boolean
  onSelect: (pageId: string) => void
  onCreatePage: () => Promise<SandboxPage | null>
  onRenamePage: (pageId: string, title: string) => Promise<boolean>
  onDeletePage: (pageId: string) => void
  onCreate: (input: ItemCreate) => Promise<CanvasItem | null>
  onUpload: (file: File) => Promise<string | null>
  onLocal: (id: string, patch: Partial<CanvasItem>) => void
  onUpdate: (id: string, patch: Partial<CanvasItem>) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onLive: (id: string, patch: { x?: number; y?: number; w?: number; h?: number }) => void
  onInteract: (id: string, active: boolean) => void
  onError: (message: string) => void
}) {
  const active = pages.find((page) => page.id === activePageId) ?? null
  const activeIndex = active ? pages.findIndex((page) => page.id === active.id) : -1
  const canAdd = role === 'teacher' || allowStudentPages
  const [hint, setHint] = useState(false)
  const [rename, setRename] = useState<SandboxPage | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [menuPage, setMenuPage] = useState<SandboxPage | null>(null)

  useEffect(() => {
    if (!rename) return
    const timer = window.setTimeout(() => {
      const input = document.getElementById('page-title')
      if (input instanceof HTMLInputElement) input.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [rename])

  useEffect(() => {
    if (!activePageId || (locked && role !== 'teacher')) return
    let seen = false
    try {
      seen = sessionStorage.getItem('tongchung.sandboxCoedit') === '1'
    } catch {
      seen = false
    }
    if (seen) return
    setHint(true)
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem('tongchung.sandboxCoedit', '1')
      } catch {
        /* ignore */
      }
      setHint(false)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [activePageId, locked, role])

  function canManage(page: SandboxPage) {
    return role === 'teacher' || (allowStudentPages && page.clientId === clientId)
  }

  function openRename(page: SandboxPage) {
    setMenuPage(null)
    setRename(page)
    setRenameValue(page.title)
  }

  async function addPage() {
    const page = await onCreatePage()
    if (page) openRename(page)
  }

  async function saveRename() {
    if (!rename) return
    const title = renameValue.trim()
    if (!title) return
    setSavingName(true)
    const ok = await onRenamePage(rename.id, title)
    setSavingName(false)
    if (ok) setRename(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="hidden w-[148px] shrink-0 flex-col border-r border-line bg-cream lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <Filmstrip
            pages={pages}
            items={items}
            activePageId={activePageId}
            canManage={canManage}
            onSelect={onSelect}
            onMenu={setMenuPage}
          />
        </div>
        {canAdd && (
          <div className="p-2">
            <AddCardButton onClick={() => void addPage()} />
          </div>
        )}
      </aside>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {active && (
          <div className="flex items-center gap-2 border-b border-line bg-cream px-3 py-1">
            <h2 className="min-w-0 flex-1 truncate font-serif text-2xl font-bold">
              <span className="mr-2 text-stamp">{cardNo(activeIndex)}</span>
              {active.title}
            </h2>
            {canManage(active) && (
              <PopoverMenu icon label="版面選項">
                <MenuItem onClick={() => openRename(active)}>改名</MenuItem>
                <MenuItem onClick={() => onDeletePage(active.id)}>刪除版面</MenuItem>
              </PopoverMenu>
            )}
          </div>
        )}
        {hint && active && (
          <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-white shadow">
            呢版大家可以一齊改
          </div>
        )}
        {active ? (
          <CardCanvas
            pageId={active.id}
            items={items.filter((item) => item.pageId === active.id)}
            role={role}
            clientId={clientId}
            locked={locked}
            onCreate={onCreate}
            onUpload={onUpload}
            onLocal={onLocal}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onLive={onLive}
            onInteract={onInteract}
            onError={onError}
          />
        ) : (
          <div className="grid flex-1 place-items-center bg-cream px-6 text-center">
            <div className="max-w-md">
              <p className="font-serif text-3xl font-bold">{canAdd ? '未有版面' : '老師未開版面'}</p>
              <ol className="mt-4 space-y-2 text-left text-lg text-muted">
                {canAdd ? (
                  <>
                    <li>① 撳「＋ 新版面」</li>
                    <li>② 改名，例如「第1組」</li>
                    <li>③ 喺白色版面貼上基本資料</li>
                  </>
                ) : (
                  <li>等老師開好版面，就可以一齊貼成果。</li>
                )}
              </ol>
              {canAdd && (
                <Button type="button" size="lg" className="mt-6 w-full" onClick={() => void addPage()}>
                  ＋ 新版面
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto border-t border-line bg-cream p-2 lg:hidden">
        <Filmstrip
          pages={pages}
          items={items}
          activePageId={activePageId}
          canManage={canManage}
          onSelect={onSelect}
          onMenu={setMenuPage}
          horizontal
        />
        {canAdd && <AddCardButton onClick={() => void addPage()} compact />}
      </div>
      <Dialog open={Boolean(rename)} onOpenChange={(open) => { if (!open) setRename(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>版面叫咩名？</DialogTitle>
            <DialogDescription>例如「第1組」或者「範例·狐狸」。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void saveRename()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="page-title">版面名稱</Label>
              <Input
                id="page-title"
                autoFocus
                maxLength={40}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={savingName || !renameValue.trim()}>
              {savingName ? '請稍等…' : '完成'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(menuPage)} onOpenChange={(open) => { if (!open) setMenuPage(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{menuPage?.title}</DialogTitle>
            <DialogDescription>改名或者刪除呢個版面。</DialogDescription>
          </DialogHeader>
          {menuPage && canManage(menuPage) && (
            <div className="grid gap-2">
              <Button type="button" size="lg" variant="outline" onClick={() => openRename(menuPage)}>
                改名
              </Button>
              <Button
                type="button"
                size="lg"
                variant="destructive"
                onClick={() => {
                  const page = menuPage
                  setMenuPage(null)
                  onDeletePage(page.id)
                }}
              >
                刪除版面
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Filmstrip({
  pages,
  items,
  activePageId,
  canManage,
  onSelect,
  onMenu,
  horizontal = false,
}: {
  pages: SandboxPage[]
  items: CanvasItem[]
  activePageId: string | null
  canManage: (page: SandboxPage) => boolean
  onSelect: (pageId: string) => void
  onMenu: (page: SandboxPage) => void
  horizontal?: boolean
}) {
  return (
    <>
      {pages.map((page, index) => (
        <CardButton
          key={page.id}
          page={page}
          index={index}
          count={items.filter((item) => item.pageId === page.id).length}
          preview={items.filter((item) => item.pageId === page.id)}
          active={page.id === activePageId}
          horizontal={horizontal}
          manageable={canManage(page)}
          onSelect={() => onSelect(page.id)}
          onMenu={() => onMenu(page)}
        />
      ))}
    </>
  )
}

function CardButton({
  page,
  index,
  count,
  preview,
  active,
  horizontal,
  manageable,
  onSelect,
  onMenu,
}: {
  page: SandboxPage
  index: number
  count: number
  preview: CanvasItem[]
  active: boolean
  horizontal: boolean
  manageable: boolean
  onSelect: () => void
  onMenu: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const hold = useRef(0)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'true' : undefined}
      aria-label={`版面 ${cardNo(index)} ${page.title}`}
      onClick={onSelect}
      onContextMenu={(event) => {
        if (!manageable) return
        event.preventDefault()
        onMenu()
      }}
      onPointerDown={(event) => {
        if (!manageable) return
        const startX = event.clientX
        const startY = event.clientY
        window.clearTimeout(hold.current)
        hold.current = window.setTimeout(() => onMenu(), 550)
        const move = (pointer: PointerEvent) => {
          if (Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 8) window.clearTimeout(hold.current)
        }
        const up = () => {
          window.clearTimeout(hold.current)
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      className={cn(
        'flex shrink-0 flex-col items-center gap-1 rounded-2xl border-2 p-1.5 text-center',
        horizontal ? 'min-h-[92px] w-[104px]' : 'mb-2 w-full',
        active ? 'border-stamp bg-paper' : 'border-transparent bg-transparent',
      )}
    >
      <CardThumb items={preview} />
      <span className="text-base font-bold leading-none text-stamp">{cardNo(index)}</span>
      <span className="w-full truncate text-sm font-semibold leading-tight">{shortName(page.title)}</span>
      <span className="text-xs text-muted">{count} 件</span>
    </button>
  )
}

function CardThumb({ items }: { items: CanvasItem[] }) {
  const bounds = cardBounds(items)
  const width = 112
  const height = Math.max(64, Math.round((width * bounds.h) / bounds.w))
  const scale = width / bounds.w
  return (
    <span className="relative block overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-line" style={{ width, height }}>
      <span
        className="absolute left-0 top-0 block"
        style={{ width: bounds.w, height: bounds.h, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        <span className="absolute block bg-white" style={{ left: -bounds.minX, top: -bounds.minY, width: CARD_W, height: CARD_H }} />
        {items.map((item) => (
          <ThumbBit key={item.id} item={item} minX={bounds.minX} minY={bounds.minY} />
        ))}
      </span>
    </span>
  )
}

function ThumbBit({ item, minX, minY }: { item: CanvasItem; minX: number; minY: number }) {
  const isText = item.kind === 'text'
  const isImage = item.kind === 'image' && isAllowedImageUrl(item.text)
  return (
    <span
      className="absolute block overflow-hidden"
      style={{
        left: item.x - minX,
        top: item.y - minY,
        width: item.w,
        height: item.h,
        background: isText ? 'transparent' : isImage ? 'transparent' : item.color,
        color: isText ? item.color : '#2a2118',
        borderRadius: item.kind === 'ellipse' ? 999 : 8,
        fontSize: isText ? item.fontSize || 28 : 18,
        lineHeight: 1.2,
      }}
    >
      {isImage ? <img src={item.text} alt="" className="h-full w-full object-contain" /> : item.kind === 'text' || item.kind === 'sticky' ? item.text : ''}
    </span>
  )
}

function AddCardButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl bg-stamp font-semibold text-white',
        compact ? 'min-h-[92px] min-w-[92px] px-3 text-base' : 'min-h-14 w-full px-2 text-base',
      )}
    >
      ＋ 新版面
    </button>
  )
}

function cardNo(index: number) {
  return String(Math.max(0, index) + 1).padStart(2, '0')
}

function shortName(title: string) {
  const chars = Array.from(title)
  return chars.length > 8 ? `${chars.slice(0, 8).join('')}…` : title
}
