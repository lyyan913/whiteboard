import { ArrowUpRight, Circle, Heart, Image as ImageIcon, MousePointer2, Pencil, Scan, Square, Star, StickyNote, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { isFontSize, NOTE_COLOR_LABELS, NOTE_COLORS, TEXT_COLOR_LABELS, TEXT_COLORS } from '../../shared/colors'
import { containBox, resizeBox, type Corner } from '../../shared/geometry'
import { encodeInk, inkFrame, isFillMode, isShapeKind, simplifyInk } from '../../shared/markup'
import { isAllowedImageUrl } from '../../shared/media'
import type { CanvasItem, ItemCreate, ItemKind, Role } from '../../shared/types'
import { makeId } from '../../shared/text'
import { DockHistory } from '@/components/DockHistory'
import { Markup } from '@/components/Markup'
import { RichNote } from '@/components/RichNote'
import { loadImageSize } from '@/lib/fitImage'
import { useEditHistory } from '@/lib/history'
import { useAppearIds } from '@/lib/useAppearIds'
import { cn, polaroidTilt } from '@/lib/utils'

type Tool = 'select' | ItemKind

const TOOLS: { id: Tool; label: string; icon: typeof MousePointer2; tone: string }[] = [
  { id: 'select', label: '選擇', icon: MousePointer2, tone: '#1f1a14' },
  { id: 'pen', label: '畫筆', icon: Pencil, tone: '#c4492c' },
  { id: 'text', label: '文字', icon: Type, tone: '#1d4e89' },
  { id: 'sticky', label: '便利貼', icon: StickyNote, tone: '#c99a06' },
  { id: 'rect', label: '方形', icon: Square, tone: '#e07b24' },
  { id: 'ellipse', label: '圓形', icon: Circle, tone: '#e07b24' },
  { id: 'star', label: '星', icon: Star, tone: '#d6457a' },
  { id: 'heart', label: '心', icon: Heart, tone: '#d6457a' },
  { id: 'arrow', label: '箭頭', icon: ArrowUpRight, tone: '#6b4c9a' },
]

const SOFT_SHADOW = '0 4px 12px rgba(60,40,20,.12)'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

function defaultSize(kind: ItemKind) {
  if (kind === 'text') return { w: 420, h: 160 }
  if (kind === 'sticky') return { w: 380, h: 300 }
  if (kind === 'image') return { w: 640, h: 480 }
  return { w: 320, h: 240 }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readingSize(item: CanvasItem) {
  if (item.kind === 'text' || item.kind === 'sticky') return isFontSize(item.fontSize) ? item.fontSize : 32
  return 32
}

function nearlySame(before: Partial<CanvasItem>, after: Partial<CanvasItem>) {
  const keys = Object.keys(after) as (keyof CanvasItem)[]
  return keys.every((key) => {
    const left = before[key]
    const right = after[key]
    if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right) < 0.5
    return left === right
  })
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
  onRemove,
  onViewFrame,
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
  onRemove: (id: string) => Promise<boolean>
  onViewFrame?: (frame: { x: number; y: number; w: number; h: number }) => void
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
  const fitted = useRef(new Set<string>())
  const onViewFrameRef = useRef(onViewFrame)
  itemsRef.current = items
  onViewFrameRef.current = onViewFrame
  const [tool, setTool] = useState<Tool>('sticky')
  const [color, setColor] = useState<string>(NOTE_COLORS[0])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [ink, setInk] = useState<{ x: number; y: number }[] | null>(null)
  const [hint, setHint] = useState(false)
  const canEdit = !locked || role === 'teacher'
  const appear = useAppearIds(items.map((item) => item.id).join('\u0001'))
  const drawing = tool === 'pen' || tool === 'arrow'
  const history = useEditHistory({ onCreate, onUpdate, onLocal, onRemove })

  function rememberCreate(item: CanvasItem | null) {
    if (item) history.note({ type: 'create', item })
    return item
  }

  function rememberPatch(id: string, before: Partial<CanvasItem>, after: Partial<CanvasItem>) {
    if (nearlySame(before, after)) return
    history.note({ type: 'patch', id, before, after })
  }

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

  function visibleFrame() {
    const rect = viewportRef.current?.getBoundingClientRect()
    const current = camera.current
    if (!rect || rect.width < 1 || rect.height < 1) return { x: 0, y: 0, w: 1400, h: 900 }
    return {
      x: -current.x / current.zoom,
      y: -current.y / current.zoom,
      w: rect.width / current.zoom,
      h: rect.height / current.zoom,
    }
  }

  function apply() {
    const current = camera.current
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${current.x}px, ${current.y}px) scale(${current.zoom})`
      worldRef.current.style.setProperty('--board-zoom', String(current.zoom))
    }
    if (dotsRef.current) {
      dotsRef.current.style.backgroundPosition = `${current.x}px ${current.y}px`
      dotsRef.current.style.backgroundSize = `${24 * current.zoom}px ${24 * current.zoom}px`
    }
    if (zoomRef.current) zoomRef.current.textContent = `${Math.round(current.zoom * 100)}%`
    onViewFrameRef.current?.(visibleFrame())
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
      if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        if (event.shiftKey) void history.redo()
        else void history.undo()
        return
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        void history.redo()
        return
      }
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
  }, [selected, onDelete, role, locked, clientId, history.undo, history.redo])

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

  function chooseTool(next: Tool) {
    setTool(next)
    if (next === 'pen' || next === 'arrow') setSelected(null)
    if (next === 'text') setColor(TEXT_COLORS[0])
    else if (tool === 'text') setColor(NOTE_COLORS[0])
  }

  function onBackgroundDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return
    if ((event.target as HTMLElement).closest('[data-node], [data-toolbar]')) return
    const startX = event.clientX
    const startY = event.clientY
    const origin = camera.current
    const world = screenToWorld(event.clientX, event.clientY)
    const mode = event.button === 1 || tool === 'select' || tool === 'image' || !canEdit ? 'pan' : tool === 'pen' || tool === 'arrow' ? 'ink' : 'create'
    let moved = false
    const inkPoints = [world]
    if (mode === 'ink') setInk(inkPoints.slice())
    const move = (pointer: PointerEvent) => {
      moved = Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 5
      if (mode === 'ink') {
        const point = screenToWorld(pointer.clientX, pointer.clientY)
        const last = inkPoints[inkPoints.length - 1]
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 2) inkPoints.push(point)
        setInk(inkPoints.slice())
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
        setInk(null)
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
        }).then((created) => rememberCreate(created))
        return
      }
      setDraft(null)
      const point = screenToWorld(pointer.clientX, pointer.clientY)
      const kind = tool as ItemKind
      const size = defaultSize(kind)
      const wide = Math.abs(point.x - world.x) > 24 && Math.abs(point.y - world.y) > 24
      const rect = wide
        ? { x: Math.min(world.x, point.x), y: Math.min(world.y, point.y), w: Math.max(64, Math.abs(point.x - world.x)), h: Math.max(48, Math.abs(point.y - world.y)) }
        : { x: world.x - size.w / 2, y: world.y - size.h / 2, w: size.w, h: size.h }
      void onCreate({
        id: makeId(12),
        kind,
        ...rect,
        color,
        text: isShapeKind(kind) ? 'both' : '',
        fontSize: isShapeKind(kind) ? 8 : 32,
      }).then((created) => {
        const saved = rememberCreate(created)
        if (!saved) return
        setSelected(saved.id)
        if (saved.kind === 'sticky' || saved.kind === 'text') setEditing(saved.id)
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onNodeDown(event: ReactPointerEvent, item: CanvasItem) {
    event.stopPropagation()
    if (drawing) return
    setSelected(item.id)
    if (!canEdit || tool !== 'select') return
    const target = event.target
    if (target instanceof Element && target.closest('[data-resize], textarea, button')) return
    const before = { x: item.x, y: item.y, w: item.w, h: item.h, z: item.z }
    const maxZ = Math.max(1, ...itemsRef.current.map((entry) => entry.z)) + 1
    const pointerId = event.pointerId
    const pointers = new Map<number, { x: number; y: number }>()
    pointers.set(pointerId, { x: event.clientX, y: event.clientY })
    const origin = { x: item.x, y: item.y, w: item.w, h: item.h }
    let placed = { x: item.x, y: item.y, w: item.w, h: item.h }
    let mode: 'drag' | 'pinch' = 'drag'
    let pinchDist = 1
    const dragStart = { x: event.clientX, y: event.clientY }
    onInteract(item.id, true)
    onLocal(item.id, { z: maxZ })
    const move = (pointer: PointerEvent) => {
      if (pointers.has(pointer.pointerId)) pointers.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY })
      if (mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y))
        const scale = dist / pinchDist
        const w = origin.w * scale
        const h = origin.h * scale
        placed = resizeBox({ ...origin }, 'se', w - origin.w, h - origin.h, true)
        placed = { x: origin.x + origin.w / 2 - placed.w / 2, y: origin.y + origin.h / 2 - placed.h / 2, w: placed.w, h: placed.h }
        onLocal(item.id, { ...placed, z: maxZ })
        emitLive(item.id, placed)
        return
      }
      if (pointer.pointerId !== pointerId) return
      placed = {
        x: origin.x + (pointer.clientX - dragStart.x) / camera.current.zoom,
        y: origin.y + (pointer.clientY - dragStart.y) / camera.current.zoom,
        w: origin.w,
        h: origin.h,
      }
      onLocal(item.id, { x: placed.x, y: placed.y, z: maxZ })
      emitLive(item.id, { x: placed.x, y: placed.y })
    }
    const extraDown = (pointer: PointerEvent) => {
      pointers.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY })
      if (item.kind === 'image' && pointers.size >= 2 && mode === 'drag') {
        mode = 'pinch'
        const [a, b] = [...pointers.values()]
        pinchDist = Math.max(12, Math.hypot(a.x - b.x, a.y - b.y))
        origin.x = placed.x
        origin.y = placed.y
        origin.w = placed.w
        origin.h = placed.h
      }
    }
    const up = (pointer: PointerEvent) => {
      pointers.delete(pointer.pointerId)
      if (pointers.size > 0) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('pointerdown', extraDown)
      emitLive(item.id, placed, true)
      const after = { ...placed, z: maxZ }
      void Promise.resolve(onUpdate(item.id, after)).finally(() => onInteract(item.id, false))
      rememberPatch(item.id, before, after)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('pointerdown', extraDown)
  }

  function onResizeDown(event: ReactPointerEvent<HTMLButtonElement>, item: CanvasItem, corner: Corner) {
    event.stopPropagation()
    event.preventDefault()
    if (!canEdit) return
    const before = { x: item.x, y: item.y, w: item.w, h: item.h }
    const origin = { x: item.x, y: item.y, w: item.w, h: item.h }
    const start = screenToWorld(event.clientX, event.clientY)
    let placed = origin
    onInteract(item.id, true)
    const move = (pointer: PointerEvent) => {
      const point = screenToWorld(pointer.clientX, pointer.clientY)
      placed = resizeBox(origin, corner, point.x - start.x, point.y - start.y, item.kind === 'image')
      onLocal(item.id, placed)
      emitLive(item.id, placed)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      emitLive(item.id, placed, true)
      void Promise.resolve(onUpdate(item.id, placed)).finally(() => onInteract(item.id, false))
      rememberPatch(item.id, before, placed)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function maybeFitImage(item: CanvasItem, naturalW: number, naturalH: number) {
    if (fitted.current.has(item.id) || naturalW < 1 || naturalH < 1) return
    fitted.current.add(item.id)
    if (Date.now() - item.createdAt > 30_000) return
    const frame = visibleFrame()
    const target = containBox(frame.w * 0.9, frame.h * 0.9, naturalW, naturalH)
    if (item.w >= target.w * 0.75 && item.h >= target.h * 0.75) return
    const next = {
      x: frame.x + (frame.w - target.w) / 2,
      y: frame.y + (frame.h - target.h) / 2,
      w: target.w,
      h: target.h,
    }
    onLocal(item.id, next)
    void onUpdate(item.id, next)
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUpload || !canEdit) return
    const url = await onUpload(file)
    if (!url) return
    const frame = visibleFrame()
    const natural = await loadImageSize(file)
    const size = natural ? containBox(frame.w * 0.9, frame.h * 0.9, natural.width, natural.height) : containBox(frame.w * 0.9, frame.h * 0.9, 4, 3)
    const created = await onCreate({
      id: makeId(12),
      kind: 'image',
      x: frame.x + (frame.w - size.w) / 2,
      y: frame.y + (frame.h - size.h) / 2,
      w: size.w,
      h: size.h,
      color: NOTE_COLORS[5],
      text: url,
      fontSize: 32,
    })
    const saved = rememberCreate(created)
    if (saved) {
      fitted.current.add(saved.id)
      setSelected(saved.id)
      setTool('select')
    }
  }

  const ordered = [...items].sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)
  const liveInk = ink && ink.length > 1 ? ink : null
  const liveFrame = liveInk ? inkFrame(liveInk, 8) : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-cream">
      <div className="relative min-h-0 flex-1">
      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-white shadow">
          拖動貼文可以擺位
        </div>
      )}
      <div ref={viewportRef} className="canvas-sheet board-sheet absolute inset-2 overflow-hidden sm:inset-3" onPointerDown={onBackgroundDown}>
        <div ref={dotsRef} className="canvas-dots pointer-events-none absolute inset-0" />
        <div ref={worldRef} className="absolute left-0 top-0 origin-top-left">
          {ordered.map((item) => {
            const active = selected === item.id
            const isText = item.kind === 'text'
            const isImage = item.kind === 'image'
            const inkItem = item.kind === 'pen' || item.kind === 'arrow'
            const graphic = inkItem || isShapeKind(item.kind)
            const caption = graphic && !isFillMode(item.text) && !inkItem ? item.text : ''
            const shape = isShapeKind(item.kind)
            const fontSize = readingSize(item)
            return (
              <div
                key={item.id}
                data-node
                className={cn('absolute touch-none', active && !inkItem && 'outline-2 outline-dashed outline-offset-4 outline-leaf', appear.has(item.id) && 'item-pop')}
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
                  pointerEvents: inkItem ? 'none' : undefined,
                }}
                onPointerDown={inkItem ? undefined : (event) => onNodeDown(event, item)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  if (!canEdit || isImage || inkItem || (graphic && isFillMode(item.text || 'both'))) return
                  setSelected(item.id)
                  setEditing(item.id)
                }}
              >
                {item.kind === 'sticky' && <span className="tape" aria-hidden />}
                {graphic && (
                  <Markup
                    item={item}
                    hit={!drawing && inkItem}
                    onPointerDown={(event) => onNodeDown(event, item)}
                  />
                )}
                {isImage ? (
                  <div className="polaroid h-full w-full" style={{ transform: active ? 'rotate(0deg)' : `rotate(${polaroidTilt(item.id)}deg)` }}>
                    {isAllowedImageUrl(item.text) ? (
                      <img
                        src={item.text}
                        alt=""
                        draggable={false}
                        className="pointer-events-none h-full w-full object-contain"
                        onLoad={(event) => {
                          const image = event.currentTarget
                          maybeFitImage(item, image.naturalWidth, image.naturalHeight)
                        }}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted">相片</div>
                    )}
                  </div>
                ) : editing === item.id ? (
                  <textarea
                    autoFocus
                    value={draftText}
                    maxLength={1000}
                    className="h-full w-full resize-none bg-transparent p-4 leading-snug outline-none"
                    style={{ color: isText ? item.color : '#2a2118', fontSize, textAlign: item.kind === 'rect' || item.kind === 'ellipse' ? 'center' : 'left' }}
                    onChange={(event) => setDraftText(event.target.value)}
                    onPointerDown={(event) => event.stopPropagation()}
                    onBlur={() => {
                      const text = draftText
                      setEditing(null)
                      if (text !== item.text) {
                        rememberPatch(item.id, { text: item.text }, { text })
                        void onUpdate(item.id, { text })
                      }
                    }}
                  />
                ) : (
                  <div
                    className={cn(
                      'h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 font-medium leading-snug',
                      (item.kind === 'rect' || item.kind === 'ellipse') && 'grid place-items-center text-center',
                      inkItem && 'pointer-events-none',
                    )}
                    style={{ fontSize }}
                  >
                    {graphic ? caption : item.text ? <RichNote text={item.text} /> : active ? '按兩下輸入文字' : ''}
                  </div>
                )}
                {active && canEdit &&
                  CORNERS.map((corner) => (
                    <button
                      key={corner}
                      type="button"
                      data-resize
                      aria-label="調整大小"
                      className="absolute z-10 grid place-items-center"
                      style={{
                        width: 'calc(52px / var(--board-zoom, 1))',
                        height: 'calc(52px / var(--board-zoom, 1))',
                        left: corner === 'nw' || corner === 'sw' ? 0 : undefined,
                        right: corner === 'ne' || corner === 'se' ? 0 : undefined,
                        top: corner === 'nw' || corner === 'ne' ? 0 : undefined,
                        bottom: corner === 'sw' || corner === 'se' ? 0 : undefined,
                        transform:
                          corner === 'nw' ? 'translate(-40%, -40%)' : corner === 'ne' ? 'translate(40%, -40%)' : corner === 'sw' ? 'translate(-40%, 40%)' : 'translate(40%, 40%)',
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(event) => onResizeDown(event, item, corner)}
                    >
                      <span
                        className="rounded-full border-leaf bg-white"
                        style={{
                          width: 'calc(22px / var(--board-zoom, 1))',
                          height: 'calc(22px / var(--board-zoom, 1))',
                          borderWidth: 'calc(3px / var(--board-zoom, 1))',
                        }}
                      />
                    </button>
                  ))}
                {active && canDelete(item) && (
                  <button
                    type="button"
                    aria-label="刪除"
                    className="absolute -right-3 -top-3 grid h-11 w-11 place-items-center rounded-full bg-white text-danger shadow"
                    style={{ pointerEvents: 'auto', width: 'calc(44px / var(--board-zoom, 1))', height: 'calc(44px / var(--board-zoom, 1))' }}
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
            <div className="absolute border-2 border-dashed border-leaf/70 bg-white/30" style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }} />
          )}
          {liveFrame && liveInk && (
            <svg className="pointer-events-none absolute overflow-visible" style={{ left: liveFrame.x, top: liveFrame.y, width: Math.max(1, liveFrame.w), height: Math.max(1, liveFrame.h) }}>
              <polyline
                points={liveInk.map((point) => `${point.x - liveFrame.x},${point.y - liveFrame.y}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        {items.length === 0 && !draft && (
          <div className="board-empty pointer-events-none absolute inset-0 grid place-items-center px-4 text-center">
            <div className="max-w-sm rounded-2xl bg-paper/95 p-4 shadow">
              <p className="font-serif text-2xl font-bold">{locked && role !== 'teacher' ? '畫布已鎖定' : '這塊畫布還是空的'}</p>
              <p className="board-empty-note mt-2 text-base leading-7 text-muted">
                {locked && role !== 'teacher' ? '現在只可以看，還不能新增貼文。' : '在下面選擇工具，再在空白處按一下。'}
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
      <div className="board-dock pointer-events-none z-20 flex shrink-0 justify-center px-2">
        <div data-toolbar className="tool-dock dock-row pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto p-2">
          {TOOLS.map((entry) => {
            const pressed = tool === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                disabled={!canEdit && entry.id !== 'select'}
                aria-pressed={pressed}
                onClick={() => chooseTool(entry.id)}
                className={cn('tool-btn pressable flex h-14 min-w-14 flex-col items-center justify-center rounded-xl px-2 text-[13px] font-semibold', pressed ? 'text-white' : 'hover:bg-white/70')}
                style={{ background: pressed ? entry.tone : 'transparent', color: pressed ? '#fff' : entry.tone }}
              >
                <entry.icon className="h-4 w-4" />
                <span className="tool-caption">{entry.label}</span>
              </button>
            )
          })}
          {onUpload && (
            <label
              className={cn('tool-btn pressable relative flex h-14 min-w-14 flex-col items-center justify-center rounded-xl px-2 text-[13px] font-semibold', !canEdit && 'opacity-40')}
              style={{ color: '#1f7a54' }}
            >
              <ImageIcon className="h-4 w-4" />
              <span className="tool-caption">相片</span>
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
              className={cn('color-dot pressable h-11 w-11 shrink-0 rounded-xl border-4', color === swatch ? 'border-ink' : 'border-white')}
              style={{ background: swatch }}
            />
          ))}
          <span className="mx-1 h-8 w-px bg-line" />
          <DockHistory
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => void history.undo()}
            onRedo={() => void history.redo()}
          />
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
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="tool-btn pressable grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl hover:bg-white/70 disabled:opacity-40">
      {children}
    </button>
  )
}
