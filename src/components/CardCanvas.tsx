import { ArrowUpRight, Circle, Cloud, Heart, Image as ImageIcon, MessageCircle, MousePointer2, Pencil, Shapes, Square, Star, StickyNote, Trash2, Triangle, Type } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { DRAW_COLOR_LABELS, DRAW_COLORS, FONT_SIZES, NOTE_COLOR_LABELS, NOTE_COLORS, STROKE_WIDTHS, STROKE_WIDTH_LABELS, TEXT_COLOR_LABELS, TEXT_COLORS, isFontSize, isNoteColor, isTextColor } from '../../shared/colors'
import { containBox, resizeBox, type Corner } from '../../shared/geometry'
import { encodeInk, inkFrame, isFillMode, isShapeKind, simplifyInk, type FillMode, type StrokeStyle } from '../../shared/markup'
import { isAllowedImageUrl } from '../../shared/media'
import type { CanvasItem, ItemCreate, ItemKind, Role } from '../../shared/types'
import { makeId } from '../../shared/text'
import { DockHistory } from '@/components/DockHistory'
import { Markup } from '@/components/Markup'
import { CARD_H, CARD_W, cardBounds, clampToCard } from '@/components/cardFrame'
import { RichNote } from '@/components/RichNote'
import { loadImageSize } from '@/lib/fitImage'
import { useEditHistory } from '@/lib/history'
import { useAppearIds } from '@/lib/useAppearIds'
import { cn, polaroidTilt } from '@/lib/utils'

type Tool = 'select' | 'text' | 'sticky' | 'pen' | 'arrow' | 'image' | ShapeKind
type ShapeKind = 'rect' | 'ellipse' | 'star' | 'heart' | 'triangle' | 'cloud' | 'bubble'

const TOOLS: { id: Tool; label: string; icon: typeof MousePointer2; tone: string }[] = [
  { id: 'select', label: '選擇', icon: MousePointer2, tone: '#1f1a14' },
  { id: 'pen', label: '畫筆', icon: Pencil, tone: '#c4492c' },
  { id: 'text', label: '文字', icon: Type, tone: '#1d4e89' },
  { id: 'sticky', label: '便利貼', icon: StickyNote, tone: '#c99a06' },
  { id: 'rect', label: '圖形', icon: Shapes, tone: '#e07b24' },
  { id: 'arrow', label: '箭頭', icon: ArrowUpRight, tone: '#6b4c9a' },
]

const SHAPE_TONE = '#e07b24'

const SHAPES: { id: ShapeKind; label: string; icon: typeof Square }[] = [
  { id: 'rect', label: '方形', icon: Square },
  { id: 'ellipse', label: '圓形', icon: Circle },
  { id: 'triangle', label: '三角', icon: Triangle },
  { id: 'star', label: '星', icon: Star },
  { id: 'heart', label: '心', icon: Heart },
  { id: 'cloud', label: '雲', icon: Cloud },
  { id: 'bubble', label: '對話框', icon: MessageCircle },
]

const SIZE_LABEL: Record<(typeof FONT_SIZES)[number], string> = { 18: '小', 32: '中', 40: '大' }

function colorName(kind: ItemKind, swatch: string) {
  if (kind === 'text') return TEXT_COLOR_LABELS[swatch as keyof typeof TEXT_COLOR_LABELS] ?? '顏色'
  return NOTE_COLOR_LABELS[swatch as keyof typeof NOTE_COLOR_LABELS] ?? '顏色'
}

function defaultSize(kind: Tool) {
  if (kind === 'text') return { w: 480, h: 170 }
  if (kind === 'sticky') return { w: 420, h: 320 }
  if (kind === 'arrow') return { w: 300, h: 200 }
  if (kind === 'cloud' || kind === 'bubble') return { w: 380, h: 280 }
  if (kind === 'star' || kind === 'heart' || kind === 'triangle' || kind === 'ellipse') return { w: 280, h: 280 }
  return { w: 380, h: 260 }
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

function placeCard(box: { x: number; y: number; w: number; h: number }, proportional: boolean) {
  let { x, y, w, h } = box
  if (proportional && (w > CARD_W || h > CARD_H)) {
    const fittedSize = containBox(CARD_W, CARD_H, w, h)
    const cx = x + w / 2
    const cy = y + h / 2
    w = fittedSize.w
    h = fittedSize.h
    x = cx - w / 2
    y = cy - h / 2
  }
  return clampToCard(x, y, w, h)
}

function graphicKind(kind: string) {
  return kind === 'pen' || kind === 'arrow' || isShapeKind(kind)
}

export function CardCanvas({
  pageId,
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
  onLive,
  onInteract,
  onError,
}: {
  pageId: string
  items: CanvasItem[]
  role: Role
  clientId: string
  locked: boolean
  onCreate: (input: ItemCreate) => Promise<CanvasItem | null>
  onUpload: (file: File) => Promise<string | null>
  onLocal: (id: string, patch: Partial<CanvasItem>) => void
  onUpdate: (id: string, patch: Partial<CanvasItem>) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onRemove: (id: string) => Promise<boolean>
  onLive: (id: string, patch: { x?: number; y?: number; w?: number; h?: number }) => void
  onInteract: (id: string, active: boolean) => void
  onError: (message: string) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef(items)
  const boundsRef = useRef(cardBounds(items))
  const scaleRef = useRef(1)
  const measuredBox = useRef({ w: 0, h: 0 })
  const lastLive = useRef(0)
  const editingRef = useRef<string | null>(null)
  const draftRef = useRef('')
  const fitted = useRef(new Set<string>())
  itemsRef.current = items
  const bounds = cardBounds(items)
  boundsRef.current = bounds

  const [scale, setScale] = useState(0.4)
  const [ready, setReady] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<string>(DRAW_COLORS[1])
  const [textSize, setTextSize] = useState<(typeof FONT_SIZES)[number]>(32)
  const [strokeWidth, setStrokeWidth] = useState<(typeof STROKE_WIDTHS)[number]>(8)
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid')
  const [fillMode, setFillMode] = useState<FillMode>('both')
  const [ink, setInk] = useState<{ x: number; y: number }[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const canEdit = !locked || role === 'teacher'
  const selectedItem = items.find((item) => item.id === selected) ?? null
  const appear = useAppearIds(items.map((item) => item.id).join('\u0001'), pageId)
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
    setSelected(null)
    setEditing(null)
    editingRef.current = null
    setDraft(null)
    setInk(null)
    history.reset()
  }, [pageId, history.reset])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    measuredBox.current = { w: 0, h: 0 }
    const measure = () => {
      const w = viewport.clientWidth
      const h = viewport.clientHeight
      if (measuredBox.current.w > 0 && Math.abs(w - measuredBox.current.w) < 28 && Math.abs(h - measuredBox.current.h) < 28) return
      measuredBox.current = { w, h }
      const fit = Math.min(Math.max(160, w - 24) / bounds.w, Math.max(160, h - 16) / bounds.h)
      const next = Math.round(Math.min(1.6, Math.max(0.2, fit)) * 1000) / 1000
      scaleRef.current = next
      setScale(next)
      setReady(true)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [bounds.w, bounds.h])

  function screenToCard(clientX: number, clientY: number) {
    const rect = worldRef.current?.getBoundingClientRect()
    const box = boundsRef.current
    if (!rect || rect.width < 1 || rect.height < 1) return { x: CARD_W / 2, y: CARD_H / 2 }
    return {
      x: box.minX + ((clientX - rect.left) / rect.width) * box.w,
      y: box.minY + ((clientY - rect.top) / rect.height) * box.h,
    }
  }

  function emitLive(id: string, patch: { x?: number; y?: number; w?: number; h?: number }, force = false) {
    const now = Date.now()
    if (!force && now - lastLive.current < 50) return
    lastLive.current = now
    onLive(id, patch)
  }

  function commitEdit() {
    const id = editingRef.current
    if (!id) return
    const item = itemsRef.current.find((entry) => entry.id === id)
    const text = draftRef.current
    editingRef.current = null
    setEditing(null)
    if (item && text !== item.text) {
      rememberPatch(id, { text: item.text }, { text })
      void onUpdate(id, { text })
    }
  }

  function beginEdit(item: CanvasItem) {
    setSelected(item.id)
    setEditing(item.id)
    editingRef.current = item.id
    draftRef.current = item.text
    setDraftText(item.text)
  }

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
        editingRef.current = null
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

  function chooseTool(next: Tool) {
    setTool(next)
    if (next === 'pen' || next === 'arrow') setSelected(null)
    if (next === 'text' && !isTextColor(color)) setColor(TEXT_COLORS[0])
    if (next === 'sticky' && !isNoteColor(color)) setColor(NOTE_COLORS[0])
    if ((next === 'pen' || next === 'arrow' || isShapeKind(next)) && color === TEXT_COLORS[0]) setColor(DRAW_COLORS[1])
  }

  function placeInk(points: { x: number; y: number }[], kind: 'pen' | 'arrow') {
    const simplified = simplifyInk(points)
    const frame = inkFrame(simplified, strokeWidth + 10)
    const fitted = clampToCard(frame.x, frame.y, frame.w, frame.h)
    const shiftX = fitted.x - frame.x
    const shiftY = fitted.y - frame.y
    const relative = frame.relative.map((point) => ({ x: point.x - shiftX, y: point.y - shiftY }))
    void onCreate({
      id: makeId(12),
      kind,
      x: fitted.x,
      y: fitted.y,
      w: fitted.w,
      h: fitted.h,
      color,
      text: encodeInk(strokeStyle, relative),
      fontSize: strokeWidth,
    }).then((created) => rememberCreate(created))
  }

  function onCardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-node], [data-resize], textarea, button')) return
    if (editingRef.current) {
      commitEdit()
      setSelected(null)
      return
    }
    if (selected && tool !== 'pen' && tool !== 'arrow') {
      setSelected(null)
      return
    }
    if (!canEdit || tool === 'select' || tool === 'image') return
    const origin = screenToCard(event.clientX, event.clientY)
    if (tool === 'pen' || tool === 'arrow') {
      const points = [origin]
      setInk(points)
      const move = (pointer: PointerEvent) => {
        const point = screenToCard(pointer.clientX, pointer.clientY)
        const last = points[points.length - 1]
        if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return
        points.push(point)
        setInk(points.slice())
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setInk(null)
        if (tool === 'arrow' && points.length < 2) return
        placeInk(points, tool)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return
    }
    const startX = event.clientX
    const startY = event.clientY
    const move = (pointer: PointerEvent) => {
      const point = screenToCard(pointer.clientX, pointer.clientY)
      setDraft({
        x: Math.min(origin.x, point.x),
        y: Math.min(origin.y, point.y),
        w: Math.abs(point.x - origin.x),
        h: Math.abs(point.y - origin.y),
      })
    }
    const up = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDraft(null)
      const point = screenToCard(pointer.clientX, pointer.clientY)
      const kind = tool
      if (kind !== 'text' && kind !== 'sticky' && !isShapeKind(kind)) return
      const size = defaultSize(kind)
      const wide = Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 8 && Math.abs(point.x - origin.x) > 24 && Math.abs(point.y - origin.y) > 24
      const raw = wide
        ? {
            x: Math.min(origin.x, point.x),
            y: Math.min(origin.y, point.y),
            w: Math.max(48, Math.abs(point.x - origin.x)),
            h: Math.max(36, Math.abs(point.y - origin.y)),
          }
        : { x: origin.x - size.w / 2, y: origin.y - size.h / 2, w: size.w, h: size.h }
      const rect = clampToCard(raw.x, raw.y, raw.w, raw.h)
      void onCreate({
        id: makeId(12),
        kind,
        ...rect,
        color: kind === 'sticky' && !isNoteColor(color) ? NOTE_COLORS[0] : color,
        text: isShapeKind(kind) ? fillMode : '',
        fontSize: kind === 'text' ? textSize : isShapeKind(kind) ? strokeWidth : 32,
      }).then((created) => {
        if (!created) return
        const saved = rememberCreate(created)
        if (!saved) return
        setTool('select')
        setSelected(saved.id)
        if (saved.kind === 'text' || saved.kind === 'sticky') beginEdit(saved)
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !canEdit) return
    try {
      const url = await onUpload(file)
      if (!url) return
      const natural = await loadImageSize(file)
      const size = natural ? containBox(CARD_W * 0.9, CARD_H * 0.9, natural.width, natural.height) : { w: 720, h: 540 }
      const rect = clampToCard((CARD_W - size.w) / 2, (CARD_H - size.h) / 2, size.w, size.h)
      const created = await onCreate({
        id: makeId(12),
        kind: 'image',
        ...rect,
        color: NOTE_COLORS[5],
        text: url,
        fontSize: 32,
      })
      const saved = rememberCreate(created)
      if (saved) {
        fitted.current.add(saved.id)
        setTool('select')
        setSelected(saved.id)
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : '上載失敗')
    }
  }

  function onNodeDown(event: ReactPointerEvent, item: CanvasItem) {
    event.stopPropagation()
    if (drawing) return
    if (editingRef.current && editingRef.current !== item.id) commitEdit()
    setSelected(item.id)
    if (!canEdit || tool !== 'select') return
    if (editingRef.current === item.id) return
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
    const start = screenToCard(event.clientX, event.clientY)
    onInteract(item.id, true)
    onLocal(item.id, { z: maxZ })
    const move = (pointer: PointerEvent) => {
      if (pointers.has(pointer.pointerId)) pointers.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY })
      if (mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y))
        const scaled = resizeBox(origin, 'se', origin.w * (dist / pinchDist - 1), origin.h * (dist / pinchDist - 1), true)
        placed = placeCard(
          { x: origin.x + origin.w / 2 - scaled.w / 2, y: origin.y + origin.h / 2 - scaled.h / 2, w: scaled.w, h: scaled.h },
          true,
        )
        onLocal(item.id, { ...placed, z: maxZ })
        emitLive(item.id, placed)
        return
      }
      if (pointer.pointerId !== pointerId) return
      const point = screenToCard(pointer.clientX, pointer.clientY)
      const next = clampToCard(item.x + (point.x - start.x), item.y + (point.y - start.y), item.w, item.h)
      placed = { x: next.x, y: next.y, w: item.w, h: item.h }
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
    onInteract(item.id, true)
    const before = { x: item.x, y: item.y, w: item.w, h: item.h }
    const start = screenToCard(event.clientX, event.clientY)
    const origin = { x: item.x, y: item.y, w: item.w, h: item.h }
    let placed = origin
    const move = (pointer: PointerEvent) => {
      const point = screenToCard(pointer.clientX, pointer.clientY)
      placed = placeCard(resizeBox(origin, corner, point.x - start.x, point.y - start.y, item.kind === 'image'), item.kind === 'image')
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

  function paint(item: CanvasItem, nextColor: string) {
    if (nextColor !== item.color) rememberPatch(item.id, { color: item.color }, { color: nextColor })
    onLocal(item.id, { color: nextColor })
    void onUpdate(item.id, { color: nextColor })
    setColor(nextColor)
  }

  function resizeFont(item: CanvasItem, fontSize: (typeof FONT_SIZES)[number]) {
    if (fontSize !== item.fontSize) rememberPatch(item.id, { fontSize: item.fontSize }, { fontSize })
    onLocal(item.id, { fontSize })
    void onUpdate(item.id, { fontSize })
    setTextSize(fontSize)
  }

  const ordered = [...items].sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)
  const handle = Math.max(40, 56 / scale)

  const shapeOpen = isShapeKind(tool)
  const inkOpen = tool === 'pen' || tool === 'arrow' || shapeOpen
  const liveInk = ink && ink.length > 1 ? inkFrame(ink, 0) : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-cream">
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto">
        <div key={pageId} className={cn('card-stage flex min-h-full min-w-full items-center justify-center p-3', ready ? 'page-fade' : 'opacity-0')}>
          <div style={{ width: bounds.w * scale, height: bounds.h * scale }}>
            <div
              ref={worldRef}
              data-card
              className="relative touch-none"
              style={{ width: bounds.w, height: bounds.h, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              onPointerDown={onCardPointerDown}
            >
              <div
                className="canvas-sheet absolute overflow-hidden"
                style={{
                  left: -bounds.minX,
                  top: -bounds.minY,
                  width: CARD_W,
                  height: CARD_H,
                  borderRadius: 20 / scale,
                  boxShadow: `0 ${8 / scale}px ${24 / scale}px rgba(60,40,20,.10)`,
                }}
              >
                <div
                  className="canvas-dots absolute inset-0"
                  style={{ backgroundSize: '24px 24px' }}
                />
              </div>
              {ordered.map((item) => (
                <CardNode
                  key={item.id}
                  item={item}
                  minX={bounds.minX}
                  minY={bounds.minY}
                  active={selected === item.id}
                  editing={editing === item.id}
                  draftText={draftText}
                  handle={handle}
                  scale={scale}
                  pop={appear.has(item.id)}
                  canEdit={canEdit}
                  drawing={drawing}
                  onDraft={(value) => {
                    draftRef.current = value
                    setDraftText(value)
                  }}
                  onCommit={commitEdit}
                  onNodeDown={onNodeDown}
                  onResizeDown={onResizeDown}
                  onEdit={() => {
                    if (!canEdit || item.kind === 'image' || item.kind === 'pen' || item.kind === 'arrow') return
                    if (isShapeKind(item.kind) && isFillMode(item.text || 'both')) return
                    beginEdit(item)
                  }}
                  onFit={(natural) => {
                    if (fitted.current.has(item.id) || natural.w < 1 || natural.h < 1) return
                    fitted.current.add(item.id)
                    if (Date.now() - item.createdAt > 30_000) return
                    const target = containBox(CARD_W * 0.9, CARD_H * 0.9, natural.w, natural.h)
                    if (item.w >= target.w * 0.75 && item.h >= target.h * 0.75) return
                    const next = clampToCard((CARD_W - target.w) / 2, (CARD_H - target.h) / 2, target.w, target.h)
                    onLocal(item.id, next)
                    void onUpdate(item.id, next)
                  }}
                />
              ))}
              {draft && (
                <div
                  className="absolute border-2 border-dashed border-leaf/70 bg-white/40"
                  style={{ left: draft.x - bounds.minX, top: draft.y - bounds.minY, width: draft.w, height: draft.h }}
                />
              )}
              {liveInk && (
                <svg className="pointer-events-none absolute overflow-visible" style={{ left: -bounds.minX, top: -bounds.minY, width: CARD_W, height: CARD_H }}>
                  <polyline
                    points={(ink ?? []).map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </div>
        </div>
        {items.length === 0 && !draft && (
          <div className="board-empty pointer-events-none absolute inset-0 z-10 grid place-items-center px-4 text-center">
            <div className="max-w-md rounded-2xl bg-white/90 px-4 py-3 shadow-sm">
              <p className="font-serif text-2xl font-bold">{locked && role !== 'teacher' ? '老師已暫停編輯' : '這個版面尚未有內容'}</p>
              <ol className="mt-3 space-y-1 text-left text-lg text-muted">
              {locked && role !== 'teacher' ? (
                <li>現在只可以看。</li>
              ) : (
                <>
                  <li>① 按下面「畫筆／文字／相片／圖形」加入內容</li>
                  <li>② 小組可以一起修改這一版</li>
                </>
              )}
            </ol>
            </div>
          </div>
        )}
      </div>

      <div className="z-20 shrink-0 px-2 pb-1 pt-1">
        <div
          data-toolbar
          className="tool-dock dock-stack mx-auto flex max-w-full flex-col gap-1 p-1.5"
          onPointerDown={(event) => {
            if (!editingRef.current) return
            if ((event.target as HTMLElement).closest('[data-commit]')) return
            event.preventDefault()
          }}
        >
          {selectedItem && canEdit ? (
            <div className="dock-row flex items-center gap-1 overflow-x-auto">
            <DockHistory
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={() => void history.undo()}
              onRedo={() => void history.redo()}
            />
            <EditBar
              item={selectedItem}
              editing={editing === selectedItem.id}
              canDelete={canDelete(selectedItem)}
              onBack={() => {
                if (editingRef.current) commitEdit()
                setSelected(null)
                setTool('select')
              }}
              onColor={(next) => paint(selectedItem, next)}
              onSize={(next) => resizeFont(selectedItem, next)}
              onDone={commitEdit}
              onDelete={() => {
                void onDelete(selectedItem.id)
                setSelected(null)
              }}
            />
            </div>
          ) : (
            <>
              <div className="dock-row flex items-center gap-1 overflow-x-auto">
                <DockHistory
                  canUndo={history.canUndo}
                  canRedo={history.canRedo}
                  onUndo={() => void history.undo()}
                  onRedo={() => void history.redo()}
                />
                {TOOLS.map((entry) => (
                  <ToolButton
                    key={entry.id}
                    label={entry.label}
                    tone={entry.tone}
                    pressed={entry.id === 'rect' ? shapeOpen : tool === entry.id}
                    disabled={!canEdit && entry.id !== 'select'}
                    onClick={() => chooseTool(entry.id === 'rect' && !shapeOpen ? 'rect' : entry.id)}
                  >
                    <entry.icon className="h-6 w-6" />
                  </ToolButton>
                ))}
                <label
                  className={cn(
                    'tool-btn pressable relative flex h-[4.5rem] min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[13px] font-semibold',
                    !canEdit && 'opacity-40',
                  )}
                  style={{ color: '#1f7a54' }}
                >
                  <ImageIcon className="h-6 w-6" />
                  <span className="tool-caption">相片</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!canEdit}
                    className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    onChange={(event) => void onPhoto(event)}
                  />
                </label>
              </div>
              {(tool === 'text' || tool === 'sticky' || inkOpen) && (
                <div className="dock-panel flex items-center gap-1 overflow-x-auto border-t border-line pt-1">
                  {(tool === 'text' ? TEXT_COLORS : tool === 'sticky' ? NOTE_COLORS : DRAW_COLORS).map((swatch) => (
                    <ColorDot
                      key={swatch}
                      swatch={swatch}
                      label={tool === 'text' ? colorName('text', swatch) : tool === 'sticky' ? colorName('sticky', swatch) : (DRAW_COLOR_LABELS[swatch as keyof typeof DRAW_COLOR_LABELS] ?? '顏色')}
                      pressed={color === swatch}
                      disabled={!canEdit}
                      onClick={() => setColor(swatch)}
                    />
                  ))}
                  {tool === 'text' &&
                    FONT_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        aria-pressed={textSize === size}
                        disabled={!canEdit}
                        onClick={() => setTextSize(size)}
                        className={cn(
                          'pressable grid h-14 min-w-14 shrink-0 place-items-center rounded-xl px-2 text-lg font-bold',
                          textSize === size ? 'bg-leaf text-white' : 'hover:bg-white/70',
                        )}
                      >
                        {SIZE_LABEL[size]}
                      </button>
                    ))}
                  {inkOpen &&
                    STROKE_WIDTHS.map((size) => (
                      <button
                        key={size}
                        type="button"
                        aria-pressed={strokeWidth === size}
                        disabled={!canEdit}
                        onClick={() => setStrokeWidth(size)}
                        className={cn(
                          'pressable grid h-14 min-w-14 shrink-0 place-items-center rounded-xl px-2 text-base font-bold',
                          strokeWidth === size ? 'bg-leaf text-white' : 'hover:bg-white/70',
                        )}
                      >
                        {STROKE_WIDTH_LABELS[size]}
                      </button>
                    ))}
                  {(tool === 'pen' || tool === 'arrow') &&
                    ([
                      ['solid', '實線'],
                      ['dash', '虛線'],
                      ['dot', '點線'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={strokeStyle === id}
                        disabled={!canEdit}
                        onClick={() => setStrokeStyle(id)}
                        className={cn(
                          'pressable grid h-14 min-w-14 shrink-0 place-items-center rounded-xl px-2 text-base font-bold',
                          strokeStyle === id ? 'bg-leaf text-white' : 'hover:bg-white/70',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  {shapeOpen &&
                    ([
                      ['both', '填色加框'],
                      ['fill', '填色'],
                      ['line', '外框'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={fillMode === id}
                        disabled={!canEdit}
                        onClick={() => setFillMode(id)}
                        className={cn(
                          'pressable grid h-14 min-w-[4.5rem] shrink-0 place-items-center rounded-xl px-2 text-base font-bold',
                          fillMode === id ? 'bg-leaf text-white' : 'hover:bg-white/70',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  {shapeOpen &&
                    SHAPES.map((shape) => (
                      <ToolButton key={shape.id} label={shape.label} tone={SHAPE_TONE} pressed={tool === shape.id} disabled={!canEdit} onClick={() => chooseTool(shape.id)}>
                        <shape.icon className="h-6 w-6" />
                      </ToolButton>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CardNode({
  item,
  minX,
  minY,
  active,
  editing,
  draftText,
  handle,
  scale,
  pop,
  canEdit,
  drawing,
  onDraft,
  onCommit,
  onNodeDown,
  onResizeDown,
  onEdit,
  onFit,
}: {
  item: CanvasItem
  minX: number
  minY: number
  active: boolean
  editing: boolean
  draftText: string
  handle: number
  scale: number
  pop: boolean
  canEdit: boolean
  drawing: boolean
  onDraft: (value: string) => void
  onCommit: () => void
  onNodeDown: (event: ReactPointerEvent, item: CanvasItem) => void
  onResizeDown: (event: ReactPointerEvent<HTMLButtonElement>, item: CanvasItem, corner: Corner) => void
  onEdit: () => void
  onFit: (natural: { w: number; h: number }) => void
}) {
  const isText = item.kind === 'text'
  const isImage = item.kind === 'image'
  const inkItem = item.kind === 'pen' || item.kind === 'arrow'
  const graphic = graphicKind(item.kind)
  const caption = graphic && !isFillMode(item.text) && !inkItem ? item.text : ''
  const fontSize = readingSize(item)
  const corners: Corner[] = ['nw', 'ne', 'sw', 'se']
  const shape = isShapeKind(item.kind)
  return (
    <div
      data-node
      className={cn('absolute touch-none', pop && 'item-pop')}
      style={{
        left: item.x - minX,
        top: item.y - minY,
        width: item.w,
        height: item.h,
        zIndex: item.z,
        background: isText ? '#fffdf8' : isImage || graphic ? 'transparent' : item.color,
        color: isText ? item.color : '#2a2118',
        borderRadius: isImage || graphic ? 0 : item.kind === 'ellipse' ? 999 : item.kind === 'rect' ? 8 : 14,
        border: !graphic && item.kind === 'rect' ? '3px solid #2a2118' : undefined,
        boxShadow: isImage || graphic ? 'none' : `0 ${4 / scale}px ${12 / scale}px rgba(60,40,20,.12)`,
        filter: shape ? `drop-shadow(0 ${4 / scale}px ${12 / scale}px rgba(60,40,20,.12))` : undefined,
        outline: active && !inkItem ? `${2 / scale}px dashed #1f7a54` : 'none',
        outlineOffset: active ? `${4 / scale}px` : undefined,
        pointerEvents: inkItem ? 'none' : undefined,
      }}
      onPointerDown={inkItem ? undefined : (event) => onNodeDown(event, item)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onEdit()
      }}
    >
      {item.kind === 'sticky' && <span className="tape" aria-hidden />}
      {graphic && <Markup item={item} hit={!drawing && inkItem} onPointerDown={(event) => onNodeDown(event, item)} />}
      {isImage ? (
        <div
          className="polaroid h-full w-full"
          style={{
            padding: `${8 / scale}px ${8 / scale}px ${20 / scale}px`,
            boxShadow: `0 ${4 / scale}px ${12 / scale}px rgba(60,40,20,.12)`,
            transform: active ? 'rotate(0deg)' : `rotate(${polaroidTilt(item.id)}deg)`,
          }}
        >
          {isAllowedImageUrl(item.text) ? (
            <img
              src={item.text}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full object-contain"
              onLoad={(event) => {
                const image = event.currentTarget
                onFit({ w: image.naturalWidth, h: image.naturalHeight })
              }}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-lg text-muted">相片</div>
          )}
        </div>
      ) : editing ? (
        <textarea
          autoFocus
          value={draftText}
          maxLength={1000}
          className="h-full w-full resize-none bg-transparent p-4 leading-snug outline-none"
          style={{
            color: isText ? item.color : '#2a2118',
            fontSize,
            textAlign: item.kind === 'rect' || item.kind === 'ellipse' ? 'center' : 'left',
          }}
          onChange={(event) => onDraft(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={onCommit}
        />
      ) : graphic ? (
        caption ? (
          <div className="pointer-events-none grid h-full w-full place-items-center p-3 text-center font-semibold" style={{ fontSize: 32 }}>
            {caption}
          </div>
        ) : null
      ) : (
        <div
          className={cn(
            'h-full w-full overflow-hidden whitespace-pre-wrap break-words p-4 leading-snug',
            (item.kind === 'rect' || item.kind === 'ellipse') && 'grid place-items-center text-center',
          )}
          style={{ fontSize, fontWeight: isText ? 600 : 500 }}
        >
          {item.text ? <RichNote text={item.text} /> : active && canEdit ? '按兩下打字' : ''}
        </div>
      )}
      {active && canEdit &&
        corners.map((corner) => (
          <button
            key={corner}
            type="button"
            data-resize
            aria-label="調整大小"
            className="absolute z-10 grid place-items-center"
            style={{
              width: handle,
              height: handle,
              left: corner === 'nw' || corner === 'sw' ? 0 : undefined,
              right: corner === 'ne' || corner === 'se' ? 0 : undefined,
              top: corner === 'nw' || corner === 'ne' ? 0 : undefined,
              bottom: corner === 'sw' || corner === 'se' ? 0 : undefined,
              transform: corner === 'nw' ? 'translate(-40%, -40%)' : corner === 'ne' ? 'translate(40%, -40%)' : corner === 'sw' ? 'translate(-40%, 40%)' : 'translate(40%, 40%)',
              pointerEvents: 'auto',
            }}
            onPointerDown={(event) => onResizeDown(event, item, corner)}
          >
            <span
              className="rounded-full border-leaf bg-white"
              style={{ width: 22 / scale, height: 22 / scale, borderWidth: Math.max(3, 3 / scale) }}
            />
          </button>
        ))}
    </div>
  )
}

function EditBar({
  item,
  editing,
  canDelete,
  onBack,
  onColor,
  onSize,
  onDone,
  onDelete,
}: {
  item: CanvasItem
  editing: boolean
  canDelete: boolean
  onBack: () => void
  onColor: (color: string) => void
  onSize: (size: (typeof FONT_SIZES)[number]) => void
  onDone: () => void
  onDelete: () => void
}) {
  const colors = item.kind === 'text' ? TEXT_COLORS : item.kind === 'sticky' ? NOTE_COLORS : item.kind === 'image' ? [] : DRAW_COLORS
  return (
    <>
      <ToolButton label="選擇" pressed={false} onClick={onBack}>
        <MousePointer2 className="h-6 w-6" />
      </ToolButton>
      {colors.length > 0 && <span className="mx-1 h-10 w-px shrink-0 bg-line" />}
      {colors.map((swatch) => (
        <ColorDot
          key={swatch}
          swatch={swatch}
          label={colorName(item.kind, swatch)}
          pressed={item.color === swatch}
          onClick={() => onColor(swatch)}
        />
      ))}
      {item.kind === 'text' && (
        <>
          <span className="mx-1 h-10 w-px shrink-0 bg-line" />
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={(item.fontSize || 28) === size}
              onClick={() => onSize(size)}
              className={cn(
                'pressable grid h-14 min-w-14 shrink-0 place-items-center rounded-xl px-3 text-lg font-bold',
                (item.fontSize || 28) === size ? 'bg-leaf text-white' : 'hover:bg-white/70',
              )}
            >
              {SIZE_LABEL[size]}
            </button>
          ))}
        </>
      )}
      {editing && (
        <button type="button" data-commit onClick={onDone} className="pressable grid h-14 min-w-[5.5rem] shrink-0 place-items-center rounded-xl bg-leaf px-4 text-lg font-bold text-white">
          完成
        </button>
      )}
      <span className="mx-1 h-10 w-px shrink-0 bg-line" />
      <ToolButton label="刪除" tone="#b91c1c" disabled={!canDelete} onClick={onDelete}>
        <Trash2 className="h-6 w-6" />
      </ToolButton>
    </>
  )
}

function ToolButton({
  label,
  tone = '#1f1a14',
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  tone?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'tool-btn pressable flex h-[4.5rem] min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[13px] font-semibold',
        pressed ? 'text-white' : 'hover:bg-white/70',
        disabled && 'opacity-40',
      )}
      style={{ background: pressed ? tone : 'transparent', color: pressed ? '#fff' : tone }}
    >
      {children}
      <span className="tool-caption">{label}</span>
    </button>
  )
}

function ColorDot({
  swatch,
  label,
  pressed,
  disabled,
  onClick,
}: {
  swatch: string
  label: string
  pressed: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn('color-dot pressable h-12 w-12 shrink-0 rounded-xl border-4', pressed ? 'border-ink' : 'border-white')}
      style={{ background: swatch }}
    />
  )
}
