import { ArrowUpRight, Circle, Heart, Image as ImageIcon, MousePointer2, Pencil, Scan, Square, Star, StickyNote, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { NOTE_COLOR_LABELS, NOTE_COLORS, TEXT_COLOR_LABELS, TEXT_COLORS } from '../../shared/colors'
import { encodeInk, inkFrame, isFillMode, isShapeKind, simplifyInk } from '../../shared/markup'
import { isAllowedImageUrl } from '../../shared/media'
import type { CanvasItem, ItemCreate, ItemKind, Role } from '../../shared/types'
import { makeId } from '../../shared/text'
import { Markup } from '@/components/Markup'
import { useAppearIds } from '@/lib/useAppearIds'
import { cn, polaroidTilt } from '@/lib/utils'

type Tool = 'select' | ItemKind

const TOOLS: { id: Tool; label: string; icon: typeof MousePointer2; tone: string }[] = [
  { id: 'select', label: '揀', icon: MousePointer2, tone: '#1f1a14' },
  { id: 'pen', label: '畫筆', icon: Pencil, tone: '#c4492c' },
  { id: 'text', label: '文字', icon: Type, tone: '#1d4e89' },
  { id: 'sticky', label: '便利貼', icon: StickyNote, tone: '#c99a06' },
  { id: 'rect', label: '方形', icon: Square, tone: '#e07b24' },
  { id: 'ellipse', label: '圓形', icon: Circle, tone: '#e07b24' },
  { id: 'star', label: '星', icon: Star, tone: '#d6457a' },
  { id: 'heart', label: '心', icon: Heart, tone: '#d6457a' },
  { id: 'arrow', label: '箭咀', icon: ArrowUpRight, tone: '#6b4c9a' },
]

const SOFT_SHADOW = '0 4px 12px rgba(60,40,20,.12)'

function defaultSize(kind: ItemKind) {
  if (kind === 'text') return { w: 240, h: 88 }
  if (kind === 'sticky') return { w: 220, h: 170 }
  if (kind === 'image') return { w: 320, h: 240 }
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
  onUpload,
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
  onCreate: (input: ItemCreate) => Promise<CanvasItem | null>
  onUpload?: (file: File) => Promise<string | null>
  onLocal: (id: string, patch: Partial<CanvasItem>) => void
  onUpdate: (id: string, patch: Partial<CanvasItem>) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onLive: (id: string, patch: { x?: number; y?: number; w?: number; h?: number }) => void
  onInteract: (id: string, active: boolean) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)
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
  const [hint, setHint] = useState(false)
  const canEdit = !locked || role === 'teacher'
  const appear = useAppearIds(items.map((item) => item.id).join('\u0001'))

  useEffect(() => {
    let seen = false
    try {
      seen = sessionStorage.getItem('tongchung.canvasHint') === '1'
      if (!seen) sessionStorage.setItem('tongchung.canvasHint', '1')
    } catch {
      seen = false
    }
    if (seen) return
    setHint(true)
    const timer = window.setTimeout(() => setHint(false), 2000)
    return () => window.clearTimeout(timer)
  }, [])
  const colors = tool === 'text' ? TEXT_COLORS : NOTE_COLORS
  const colorLabels = tool === 'text' ? TEXT_COLOR_LABELS : NOTE_COLOR_LABELS

  function apply() {
    const current = camera.current
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${current.x}px, ${current.y}px) scale(${current.zoom})`
    }
    if (dotsRef.current) {
      dotsRef.current.style.backgroundPosition = `${current.x}px ${current.y}px`
      dotsRef.current.style.backgroundSize = `${24 * current.zoom}px ${24 * current.zoom}px`
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
    const mode = event.button === 1 || tool === 'select' || tool === 'image' || !canEdit ? 'pan' : tool === 'pen' || tool === 'arrow' ? 'ink' : 'create'
    let moved = false
    const inkPoints = [world]
    const move = (pointer: PointerEvent) => {
      moved = Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 5
      if (mode === 'ink') {
        const point = screenToWorld(pointer.clientX, pointer.clientY)
        const last = inkPoints[inkPoints.length - 1]
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 2) inkPoints.push(point)
        return
      }
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
      if (mode === 'ink') {
        const kind = tool === 'arrow' ? 'arrow' : 'pen'
        if (kind === 'arrow' && inkPoints.length < 2) return
        const frame = inkFrame(simplifyInk(inkPoints), 16)
        void onCreate({
          id: makeId(12),
          kind,
          x: frame.x,
          y: frame.y,
          w: frame.w,
          h: frame.h,
          color,
          text: encodeInk('solid', frame.relative),
          fontSize: 8,
        }).then((created) => {
          if (created) setSelected(created.id)
        })
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
      void onCreate({
        id: makeId(12),
        kind,
        ...rect,
        color,
        text: isShapeKind(kind) ? 'both' : '',
        fontSize: isShapeKind(kind) ? 8 : 28,
      }).then((created) => {
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

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUpload || !canEdit) return
    const url = await onUpload(file)
    if (!url) return
    const rect = viewportRef.current?.getBoundingClientRect()
    const center = rect ? screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 200, y: 160 }
    const created = await onCreate({
      id: makeId(12),
      kind: 'image',
      x: center.x - 160,
      y: center.y - 120,
      w: 320,
      h: 240,
      color: NOTE_COLORS[5],
      text: url,
      fontSize: 28,
    })
    if (created) setSelected(created.id)
  }

  const ordered = [...items].sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)

  return (
    <div className="relative min-h-0 flex-1 bg-cream">
      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-white shadow">
          拖動貼文可以擺位
        </div>
      )}
      <div ref={viewportRef} className="canvas-sheet absolute inset-2 overflow-hidden sm:inset-3" onPointerDown={onBackgroundDown}>
        <div ref={dotsRef} className="canvas-dots pointer-events-none absolute inset-0" />
        <div ref={worldRef} className="absolute left-0 top-0 origin-top-left">
          {ordered.map((item) => {
            const active = selected === item.id
            const isText = item.kind === 'text'
            const isImage = item.kind === 'image'
            const graphic = item.kind === 'pen' || item.kind === 'arrow' || isShapeKind(item.kind)
            const caption = graphic && !isFillMode(item.text) && item.kind !== 'pen' && item.kind !== 'arrow' ? item.text : ''
            const shape = isShapeKind(item.kind)
            return (
              <div
                key={item.id}
                data-node
                className={cn(
                  'absolute touch-none',
                  active && 'outline-2 outline-dashed outline-offset-4 outline-leaf',
                  appear.has(item.id) && 'item-pop',
                )}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  height: item.h,
                  zIndex: item.z,
                  background: isText ? '#fffdf8' : isImage || graphic ? 'transparent' : item.color,
                  color: isText ? item.color : '#2a2118',
                  borderRadius: isImage || graphic ? 0 : item.kind === 'ellipse' ? 999 : item.kind === 'rect' ? 4 : 14,
                  border: !graphic && item.kind === 'rect' ? '2px solid #2a2118' : undefined,
                  boxShadow: isImage || graphic ? 'none' : SOFT_SHADOW,
                  filter: shape ? 'drop-shadow(0 4px 12px rgba(60,40,20,.12))' : undefined,
                }}
                onPointerDown={(event) => onNodeDown(event, item)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  if (!canEdit || isImage || item.kind === 'pen' || item.kind === 'arrow' || (graphic && isFillMode(item.text || 'both'))) return
                  setSelected(item.id)
                  setEditing(item.id)
                }}
              >
                {item.kind === 'sticky' && <span className="tape" aria-hidden />}
                {graphic && <Markup item={item} />}
                {isImage ? (
                  <div className="polaroid h-full w-full" style={{ transform: active ? 'rotate(0deg)' : `rotate(${polaroidTilt(item.id)}deg)` }}>
                    {isAllowedImageUrl(item.text) ? (
                      <img src={item.text} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted">相片</div>
                    )}
                  </div>
                ) : editing === item.id ? (
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
                      isText ? 'text-xl font-medium' : 'text-lg leading-relaxed',
                      (item.kind === 'rect' || item.kind === 'ellipse') && 'grid place-items-center text-center',
                    )}
                  >
                    {graphic ? caption : item.text || (active ? '按兩下輸入文字' : '')}
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
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-leaf bg-white" />
                  </button>
                )}
                {active && canDelete(item) && (
                  <button
                    type="button"
                    aria-label="刪除"
                    className="absolute -right-3 -top-3 grid h-11 w-11 place-items-center rounded-full bg-white text-danger shadow"
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
              <p className="font-serif text-2xl font-bold">{locked && role !== 'teacher' ? '畫布已鎖定' : '這塊畫布還是空的'}</p>
              <p className="mt-2 text-base leading-7 text-muted">
                {locked && role !== 'teacher' ? '而家只可以睇，未可以新貼。' : '喺下面揀工具，再喺空白處撳一下。'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-5">
        <div data-toolbar className="tool-dock pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto p-2">
          {TOOLS.map((entry) => {
            const pressed = tool === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                disabled={!canEdit && entry.id !== 'select'}
                aria-pressed={pressed}
                onClick={() => {
                  setTool(entry.id)
                  if (entry.id === 'text') setColor(TEXT_COLORS[0])
                  else if (tool === 'text') setColor(NOTE_COLORS[0])
                }}
                className={cn(
                  'pressable flex h-14 min-w-14 flex-col items-center justify-center rounded-xl px-2 text-[13px] font-semibold',
                  pressed ? 'text-white' : 'hover:bg-white/70',
                )}
                style={{ background: pressed ? entry.tone : 'transparent', color: pressed ? '#fff' : entry.tone }}
              >
                <entry.icon className="h-4 w-4" />
                {entry.label}
              </button>
            )
          })}
          {onUpload && (
            <label
              className={cn(
                'pressable relative flex h-14 min-w-14 flex-col items-center justify-center rounded-xl px-2 text-[13px] font-semibold',
                !canEdit && 'opacity-40',
              )}
              style={{ color: '#1f7a54' }}
            >
              <ImageIcon className="h-4 w-4" />
              相片
              <input type="file" accept="image/*" disabled={!canEdit} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => void onPhoto(event)} />
            </label>
          )}
          <span className="mx-1 h-8 w-px bg-line" />
          {colors.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={(colorLabels as Record<string, string>)[swatch] ?? '顏色'}
              aria-pressed={color === swatch}
              disabled={!canEdit}
              onClick={() => setColor(swatch)}
              className={cn('pressable h-11 w-11 shrink-0 rounded-xl border-4', color === swatch ? 'border-ink' : 'border-white')}
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
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="pressable grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl hover:bg-white/70 disabled:opacity-40">
      {children}
    </button>
  )
}
