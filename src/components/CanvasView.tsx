import { Circle, MousePointer2, Scan, Square, StickyNote, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NOTE_COLOR_LABELS, NOTE_COLORS, TEXT_COLOR_LABELS, TEXT_COLORS } from '../../shared/colors'
import type { CanvasItem, ItemKind, Role } from '../../shared/types'
import { makeId } from '../../shared/text'
import { cn } from '@/lib/utils'

type Tool = 'select' | ItemKind

const TOOLS: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: '選取', icon: MousePointer2 },
  { id: 'sticky', label: '便利貼', icon: StickyNote },
  { id: 'text', label: '文字', icon: Type },
  { id: 'rect', label: '方形', icon: Square },
  { id: 'ellipse', label: '圓形', icon: Circle },
]

function defaultSize(kind: ItemKind) {
  if (kind === 'text') return { w: 240, h: 88 }
  if (kind === 'sticky') return { w: 220, h: 170 }
  return { w: 180, h: 140 }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function CanvasView({
  items,
  role,
  clientId,
  locked,
  onCreate,
  onLocal,
  onUpdate,
  onDelete,
  onLive,
  onInteract,
}: {
  items: CanvasItem[]
  role: Role
  clientId: string
  locked: boolean
  onCreate: (input: { id: string; kind: ItemKind; x: number; y: number; w: number; h: number; color: string }) => Promise<CanvasItem | null>
  onLocal: (id: string, patch: Partial<CanvasItem>) => void
  onUpdate: (id: string, patch: Partial<CanvasItem>) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onLive: (id: string, patch: { x?: number; y?: number; w?: number; h?: number }) => void
  onInteract: (id: string, active: boolean) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLSpanElement>(null)
  const camera = useRef({ x: 72, y: 56, zoom: 1 })
  const lastLive = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const [tool, setTool] = useState<Tool>('sticky')
  const [color, setColor] = useState<string>(NOTE_COLORS[0])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const canEdit = !locked || role === 'teacher'
  const colors = tool === 'text' ? TEXT_COLORS : NOTE_COLORS
  const colorLabels = tool === 'text' ? TEXT_COLOR_LABELS : NOTE_COLOR_LABELS

  function apply() {
    const current = camera.current
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${current.x}px, ${current.y}px) scale(${current.zoom})`
    }
    if (viewportRef.current) {
      viewportRef.current.style.backgroundPosition = `${current.x}px ${current.y}px`
      viewportRef.current.style.backgroundSize = `${28 * current.zoom}px ${28 * current.zoom}px`
    }
    if (zoomRef.current) zoomRef.current.textContent = `${Math.round(current.zoom * 100)}%`
  }

  useLayoutEffect(() => {
    apply()
  })

  function screenToWorld(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect()
    const current = camera.current
    return {
      x: (clientX - rect.left - current.x) / current.zoom,
      y: (clientY - rect.top - current.y) / current.zoom,
    }
  }

  function emitLive(id: string, patch: { x?: number; y?: number; w?: number; h?: number }, force = false) {
    const now = Date.now()
    if (!force && now - lastLive.current < 50) return
    lastLive.current = now
    onLive(id, patch)
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const current = camera.current
      const next = clamp(current.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.2, 2.5)
      const wx = (event.clientX - rect.left - current.x) / current.zoom
      const wy = (event.clientY - rect.top - current.y) / current.zoom
      current.zoom = next
      current.x = event.clientX - rect.left - wx * next
      current.y = event.clientY - rect.top - wy * next
      apply()
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!editing) return
    const item = itemsRef.current.find((entry) => entry.id === editing)
    setDraftText(item?.text ?? '')
  }, [editing])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.isComposing) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        const item = itemsRef.current.find((entry) => entry.id === selected)
        if (!item || !canDelete(item)) return
        event.preventDefault()
        void onDelete(item.id)
        setSelected(null)
      }
      if (event.key === 'Escape') {
        setSelected(null)
        setEditing(null)
        setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onDelete, role, locked, clientId])

  function canDelete(item: CanvasItem) {
    if (locked && role !== 'teacher') return false
    return role === 'teacher' || item.clientId === clientId
  }

  function zoomBy(factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const current = camera.current
    const next = clamp(current.zoom * factor, 0.2, 2.5)
    const cx = rect.width / 2
    const cy = rect.height / 2
    const wx = (cx - current.x) / current.zoom
    const wy = (cy - current.y) / current.zoom
    current.zoom = next
    current.x = cx - wx * next
    current.y = cy - wy * next
    apply()
  }

  function fitAll() {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    if (items.length === 0) {
      camera.current = { x: 72, y: 56, zoom: 1 }
      apply()
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const item of items) {
      minX = Math.min(minX, item.x)
      minY = Math.min(minY, item.y)
      maxX = Math.max(maxX, item.x + item.w)
      maxY = Math.max(maxY, item.y + item.h)
    }
    const pad = 72
    const zoom = clamp(Math.min((rect.width - pad * 2) / Math.max(1, maxX - minX), (rect.height - pad * 2) / Math.max(1, maxY - minY)), 0.2, 1.4)
    camera.current = { zoom, x: pad - minX * zoom, y: pad - minY * zoom }
    apply()
  }

  function onBackgroundDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return
    if ((event.target as HTMLElement).closest('[data-node], [data-toolbar]')) return
    const startX = event.clientX
    const startY = event.clientY
    const origin = camera.current
    const world = screenToWorld(event.clientX, event.clientY)
    const mode = event.button === 1 || tool === 'select' || !canEdit ? 'pan' : 'create'
    let moved = false
    const move = (pointer: PointerEvent) => {
      moved = Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 5
      if (mode === 'pan') {
        camera.current.x = origin.x + (pointer.clientX - startX)
        camera.current.y = origin.y + (pointer.clientY - startY)
        apply()
        return
      }
      const point = screenToWorld(pointer.clientX, pointer.clientY)
      setDraft({
        x: Math.min(world.x, point.x),
        y: Math.min(world.y, point.y),
        w: Math.abs(point.x - world.x),
        h: Math.abs(point.y - world.y),
      })
    }
    const up = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (mode === 'pan') {
        if (!moved) setSelected(null)
        return
      }
      setDraft(null)
      const point = screenToWorld(pointer.clientX, pointer.clientY)
      const kind = tool as ItemKind
      const size = defaultSize(kind)
      const wide = Math.abs(point.x - world.x) > 24 && Math.abs(point.y - world.y) > 24
      const rect = wide
        ? { x: Math.min(world.x, point.x), y: Math.min(world.y, point.y), w: Math.max(48, Math.abs(point.x - world.x)), h: Math.max(36, Math.abs(point.y - world.y)) }
        : { x: world.x - size.w / 2, y: world.y - size.h / 2, w: size.w, h: size.h }
      void onCreate({ id: makeId(12), kind, ...rect, color }).then((created) => {
        if (!created) return
        setSelected(created.id)
        if (created.kind === 'sticky' || created.kind === 'text') setEditing(created.id)
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onNodeDown(event: React.PointerEvent<HTMLDivElement>, item: CanvasItem) {
    event.stopPropagation()
    setSelected(item.id)
    if (!canEdit || tool !== 'select') return
    if ((event.target as HTMLElement).closest('[data-resize], textarea, button')) return
    const maxZ = Math.max(1, ...itemsRef.current.map((entry) => entry.z)) + 1
    let x = item.x
    let y = item.y
    onInteract(item.id, true)
    onLocal(item.id, { z: maxZ })
    const startX = event.clientX
    const startY = event.clientY
    const move = (pointer: PointerEvent) => {
      x = item.x + (pointer.clientX - startX) / camera.current.zoom
      y = item.y + (pointer.clientY - startY) / camera.current.zoom
      onLocal(item.id, { x, y, z: maxZ })
      emitLive(item.id, { x, y })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      emitLive(item.id, { x, y }, true)
      void Promise.resolve(onUpdate(item.id, { x, y, z: maxZ })).finally(() => onInteract(item.id, false))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onResizeDown(event: React.PointerEvent<HTMLButtonElement>, item: CanvasItem) {
    event.stopPropagation()
    if (!canEdit) return
    let w = item.w
    let h = item.h
    onInteract(item.id, true)
    const startX = event.clientX
    const startY = event.clientY
    const move = (pointer: PointerEvent) => {
      w = Math.max(48, item.w + (pointer.clientX - startX) / camera.current.zoom)
      h = Math.max(36, item.h + (pointer.clientY - startY) / camera.current.zoom)
      onLocal(item.id, { w, h })
      emitLive(item.id, { w, h })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      emitLive(item.id, { w, h }, true)
      void Promise.resolve(onUpdate(item.id, { w, h })).finally(() => onInteract(item.id, false))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const ordered = [...items].sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={viewportRef} className="canvas-grid absolute inset-0 overflow-hidden" onPointerDown={onBackgroundDown}>
        <div ref={worldRef} className="absolute left-0 top-0 origin-top-left">
          {ordered.map((item) => {
            const active = selected === item.id
            const isText = item.kind === 'text'
            return (
              <div
                key={item.id}
                data-node
                className={cn('absolute touch-none', active && 'outline outline-2 outline-offset-2 outline-leaf')}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  height: item.h,
                  zIndex: item.z,
                  background: isText ? 'transparent' : item.color,
                  color: isText ? item.color : '#2a2118',
                  borderRadius: item.kind === 'ellipse' ? 999 : item.kind === 'rect' ? 4 : 14,
                  border: item.kind === 'rect' ? '2px solid #2a2118' : undefined,
                  boxShadow: isText ? 'none' : '0 10px 24px rgba(70, 36, 8, 0.16)',
                }}
                onPointerDown={(event) => onNodeDown(event, item)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  if (!canEdit) return
                  setSelected(item.id)
                  setEditing(item.id)
                }}
              >
                {item.kind === 'sticky' && <span className="tape" aria-hidden />}
                {editing === item.id ? (
                  <textarea
                    autoFocus
                    value={draftText}
                    maxLength={1000}
                    className="h-full w-full resize-none bg-transparent p-3 text-[15px] leading-relaxed outline-none"
                    style={{ color: isText ? item.color : '#2a2118', textAlign: item.kind === 'rect' || item.kind === 'ellipse' ? 'center' : 'left' }}
                    onChange={(event) => setDraftText(event.target.value)}
                    onPointerDown={(event) => event.stopPropagation()}
                    onBlur={() => {
                      const text = draftText
                      setEditing(null)
                      if (text !== item.text) void onUpdate(item.id, { text })
                    }}
                  />
                ) : (
                  <div
                    className={cn(
                      'h-full w-full overflow-auto whitespace-pre-wrap break-words p-3',
                      isText ? 'text-xl font-medium' : 'text-[15px] leading-relaxed',
                      (item.kind === 'rect' || item.kind === 'ellipse') && 'grid place-items-center text-center',
                    )}
                  >
                    {item.text || (active ? '按兩下輸入文字' : '')}
                  </div>
                )}
                {active && canEdit && (
                  <button
                    type="button"
                    data-resize
                    aria-label="調整大小"
                    className="absolute -bottom-3 -right-3 grid h-11 w-11 place-items-center"
                    onPointerDown={(event) => onResizeDown(event, item)}
                  >
                    <span className="h-3.5 w-3.5 rounded-sm border-2 border-leaf bg-white" />
                  </button>
                )}
                {active && canDelete(item) && (
                  <button
                    type="button"
                    aria-label="刪除"
                    className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-white text-stamp shadow"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      void onDelete(item.id)
                      setSelected(null)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
          {draft && (
            <div
              className="absolute border-2 border-dashed border-leaf/70 bg-white/30"
              style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
            />
          )}
        </div>
        {items.length === 0 && !draft && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
            <div className="max-w-sm rounded-2xl bg-paper/95 p-5 shadow">
              <p className="font-serif text-xl">{locked && role !== 'teacher' ? '畫布已鎖定' : '這塊畫布還是空的'}</p>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                {locked && role !== 'teacher'
                  ? '老師已鎖定這塊畫布，暫時只能觀看。'
                  : '選擇下方工具，在空白處按一下或拖曳。拖動空白處可以移動畫布，滾輪可以縮放。'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 pb-[env(safe-area-inset-bottom)]">
        <div data-toolbar className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-paper/95 p-2 shadow-lg">
          {TOOLS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={!canEdit && entry.id !== 'select'}
              aria-pressed={tool === entry.id}
              onClick={() => {
                setTool(entry.id)
                if (entry.id === 'text') setColor(TEXT_COLORS[0])
                else if (tool === 'text') setColor(NOTE_COLORS[0])
              }}
              className={cn(
                'flex h-14 min-w-14 flex-col items-center justify-center rounded-xl px-2 text-[11px]',
                tool === entry.id ? 'bg-leaf text-white' : 'hover:bg-cream',
              )}
            >
              <entry.icon className="h-4 w-4" />
              {entry.label}
            </button>
          ))}
          <span className="mx-1 h-8 w-px bg-line" />
          {colors.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={(colorLabels as Record<string, string>)[swatch] ?? '顏色'}
              aria-pressed={color === swatch}
              disabled={!canEdit}
              onClick={() => setColor(swatch)}
              className={cn('h-7 w-7 rounded-full border-2', color === swatch ? 'border-ink' : 'border-white')}
              style={{ background: swatch }}
            />
          ))}
          <span className="mx-1 h-8 w-px bg-line" />
          <IconButton label="縮小" onClick={() => zoomBy(1 / 1.15)}>
            <ZoomOut className="h-4 w-4" />
          </IconButton>
          <span ref={zoomRef} className="w-12 text-center text-xs">
            100%
          </span>
          <IconButton label="放大" onClick={() => zoomBy(1.15)}>
            <ZoomIn className="h-4 w-4" />
          </IconButton>
          <IconButton label="顯示全部" onClick={fitAll}>
            <Scan className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="刪除"
            disabled={!selected || !items.some((item) => item.id === selected && canDelete(item))}
            onClick={() => {
              if (!selected) return
              void onDelete(selected)
              setSelected(null)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-xl hover:bg-cream disabled:opacity-40">
      {children}
    </button>
  )
}
