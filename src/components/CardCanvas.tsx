import { Circle, Image as ImageIcon, MousePointer2, Square, Trash2, Type } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { FONT_SIZES, NOTE_COLOR_LABELS, NOTE_COLORS, TEXT_COLOR_LABELS, TEXT_COLORS, isNoteColor, isTextColor } from '../../shared/colors'
import { isAllowedImageUrl } from '../../shared/media'
import type { CanvasItem, ItemCreate, ItemKind, Role } from '../../shared/types'
import { makeId } from '../../shared/text'
import { CARD_H, CARD_W, cardBounds, clampToCard } from '@/components/cardFrame'
import { cn } from '@/lib/utils'

type Tool = 'select' | 'text' | 'image' | 'rect' | 'ellipse'
type Corner = 'nw' | 'ne' | 'sw' | 'se'

const TOOLS: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: '揀', icon: MousePointer2 },
  { id: 'text', label: '文字', icon: Type },
  { id: 'image', label: '相片', icon: ImageIcon },
  { id: 'rect', label: '方形', icon: Square },
  { id: 'ellipse', label: '圓形', icon: Circle },
]

const SIZE_LABEL: Record<(typeof FONT_SIZES)[number], string> = { 18: '細', 28: '中', 40: '大' }

function colorName(kind: ItemKind, swatch: string) {
  if (kind === 'text') return TEXT_COLOR_LABELS[swatch as keyof typeof TEXT_COLOR_LABELS] ?? '顏色'
  return NOTE_COLOR_LABELS[swatch as keyof typeof NOTE_COLOR_LABELS] ?? '顏色'
}

function defaultSize(kind: 'text' | 'rect' | 'ellipse') {
  if (kind === 'text') return { w: 280, h: 96 }
  if (kind === 'rect') return { w: 220, h: 150 }
  return { w: 180, h: 180 }
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
  onLive: (id: string, patch: { x?: number; y?: number; w?: number; h?: number }) => void
  onInteract: (id: string, active: boolean) => void
  onError: (message: string) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingPoint = useRef<{ x: number; y: number } | null>(null)
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
  const [color, setColor] = useState<string>(TEXT_COLORS[0])
  const [textSize, setTextSize] = useState<(typeof FONT_SIZES)[number]>(28)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const canEdit = !locked || role === 'teacher'
  const selectedItem = items.find((item) => item.id === selected) ?? null

  useEffect(() => {
    setSelected(null)
    setEditing(null)
    editingRef.current = null
    setDraft(null)
  }, [pageId])

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
    if (item && text !== item.text) void onUpdate(id, { text })
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
  }, [selected, onDelete, role, locked, clientId])

  function canDelete(item: CanvasItem) {
    if (locked && role !== 'teacher') return false
    return role === 'teacher' || item.clientId === clientId
  }

  function chooseTool(next: Tool) {
    setTool(next)
    if (next === 'text' && !isTextColor(color)) setColor(TEXT_COLORS[0])
    if (next === 'rect' && !isNoteColor(color)) setColor(NOTE_COLORS[2])
    if (next === 'ellipse' && !isNoteColor(color)) setColor(NOTE_COLORS[3])
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
    if (selected) {
      setSelected(null)
      return
    }
    if (!canEdit || tool === 'select') return
    const origin = screenToCard(event.clientX, event.clientY)
    if (tool === 'image') {
      pendingPoint.current = origin
      fileRef.current?.click()
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
      if (kind !== 'text' && kind !== 'rect' && kind !== 'ellipse') return
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
        color,
        text: '',
        fontSize: kind === 'text' ? textSize : 28,
      }).then((created) => {
        if (!created) return
        setTool('select')
        setSelected(created.id)
        if (created.kind === 'text' || created.kind === 'sticky') beginEdit(created)
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    const point = pendingPoint.current
    pendingPoint.current = null
    if (!file || !point) return
    try {
      const url = await onUpload(file)
      if (!url) return
      const rect = clampToCard(point.x - 160, point.y - 120, 320, 240)
      const created = await onCreate({
        id: makeId(12),
        kind: 'image',
        ...rect,
        color: NOTE_COLORS[5],
        text: url,
        fontSize: 28,
      })
      if (created) {
        setTool('select')
        setSelected(created.id)
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : '上載失敗')
    }
  }

  function onNodeDown(event: ReactPointerEvent<HTMLDivElement>, item: CanvasItem) {
    event.stopPropagation()
    if (editingRef.current && editingRef.current !== item.id) commitEdit()
    setSelected(item.id)
    if (!canEdit || tool !== 'select') return
    if (editingRef.current === item.id) return
    if ((event.target as HTMLElement).closest('[data-resize], textarea, button')) return
    const maxZ = Math.max(1, ...itemsRef.current.map((entry) => entry.z)) + 1
    const start = screenToCard(event.clientX, event.clientY)
    let x = item.x
    let y = item.y
    onInteract(item.id, true)
    onLocal(item.id, { z: maxZ })
    const move = (pointer: PointerEvent) => {
      const point = screenToCard(pointer.clientX, pointer.clientY)
      const next = clampToCard(item.x + (point.x - start.x), item.y + (point.y - start.y), item.w, item.h)
      x = next.x
      y = next.y
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

  function onResizeDown(event: ReactPointerEvent<HTMLButtonElement>, item: CanvasItem, corner: Corner) {
    event.stopPropagation()
    event.preventDefault()
    if (!canEdit) return
    onInteract(item.id, true)
    const start = screenToCard(event.clientX, event.clientY)
    const origin = { x: item.x, y: item.y, w: item.w, h: item.h }
    let placed = origin
    const move = (pointer: PointerEvent) => {
      const point = screenToCard(pointer.clientX, pointer.clientY)
      const dx = point.x - start.x
      const dy = point.y - start.y
      placed = resized(origin, corner, dx, dy, item.kind === 'image')
      onLocal(item.id, placed)
      emitLive(item.id, placed)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      emitLive(item.id, placed, true)
      void Promise.resolve(onUpdate(item.id, placed)).finally(() => onInteract(item.id, false))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function paint(item: CanvasItem, nextColor: string) {
    onLocal(item.id, { color: nextColor })
    void onUpdate(item.id, { color: nextColor })
    setColor(nextColor)
  }

  function resizeFont(item: CanvasItem, fontSize: (typeof FONT_SIZES)[number]) {
    onLocal(item.id, { fontSize })
    void onUpdate(item.id, { fontSize })
    setTextSize(fontSize)
  }

  const ordered = [...items].sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)
  const handle = Math.max(28, 44 / scale)
  const ring = 3 / scale

  return (
    <div className="relative min-h-0 flex-1 bg-cream">
      <div ref={viewportRef} className="absolute inset-x-0 top-0 bottom-[7.25rem] overflow-auto">
        <div className={cn('flex min-h-full min-w-full items-center justify-center p-3', ready ? 'card-in' : 'opacity-0')}>
          <div style={{ width: bounds.w * scale, height: bounds.h * scale }}>
            <div
              ref={worldRef}
              data-card
              className="relative touch-none"
              style={{ width: bounds.w, height: bounds.h, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              onPointerDown={onCardPointerDown}
            >
              <div
                className="absolute rounded-sm bg-white shadow-[0_18px_50px_rgba(70,36,8,0.16)]"
                style={{ left: -bounds.minX, top: -bounds.minY, width: CARD_W, height: CARD_H }}
              />
              {ordered.map((item) => (
                <CardNode
                  key={item.id}
                  item={item}
                  minX={bounds.minX}
                  minY={bounds.minY}
                  active={selected === item.id}
                  editing={editing === item.id}
                  draftText={draftText}
                  ring={ring}
                  handle={handle}
                  canEdit={canEdit}
                  onDraft={(value) => {
                    draftRef.current = value
                    setDraftText(value)
                  }}
                  onCommit={commitEdit}
                  onNodeDown={onNodeDown}
                  onResizeDown={onResizeDown}
                  onEdit={() => {
                    if (!canEdit || item.kind === 'image') return
                    beginEdit(item)
                  }}
                  onFit={(rect) => {
                    if (fitted.current.has(item.id)) return
                    if (item.w !== 320 || item.h !== 240) return
                    fitted.current.add(item.id)
                    const next = clampToCard(item.x + (item.w - rect.w) / 2, item.y + (item.h - rect.h) / 2, rect.w, rect.h)
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
            </div>
          </div>
        </div>
      </div>
      {items.length === 0 && !draft && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[7.25rem] z-10 grid place-items-center px-6 text-center">
          <div className="max-w-md rounded-2xl bg-white/90 px-5 py-4 shadow-sm">
            <p className="font-serif text-2xl font-bold">{locked && role !== 'teacher' ? '老師暫停咗編輯' : '呢個版面未有內容'}</p>
            <ol className="mt-3 space-y-1 text-left text-lg text-muted">
              {locked && role !== 'teacher' ? (
                <li>而家只可以睇。</li>
              ) : (
                <>
                  <li>① 撳下面「文字／相片／圖形」加內容</li>
                  <li>② 小組可以一齊改呢一版</li>
                </>
              )}
            </ol>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-20 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
        <div
          data-toolbar
          className="mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-paper/95 p-1.5 shadow-lg"
          onPointerDown={(event) => {
            if (!editingRef.current) return
            if ((event.target as HTMLElement).closest('[data-commit]')) return
            event.preventDefault()
          }}
        >
          {selectedItem && canEdit ? (
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
          ) : (
            <>
              {TOOLS.map((entry) => (
                <ToolButton
                  key={entry.id}
                  label={entry.label}
                  pressed={tool === entry.id}
                  disabled={!canEdit && entry.id !== 'select'}
                  onClick={() => chooseTool(entry.id)}
                >
                  <entry.icon className="h-6 w-6" />
                </ToolButton>
              ))}
              {(tool === 'text' || tool === 'rect' || tool === 'ellipse') && (
                <>
                  <span className="mx-1 h-10 w-px shrink-0 bg-line" />
                  {(tool === 'text' ? TEXT_COLORS : NOTE_COLORS).map((swatch) => (
                    <ColorDot
                      key={swatch}
                      swatch={swatch}
                      label={colorName(tool === 'text' ? 'text' : 'rect', swatch)}
                      pressed={color === swatch}
                      disabled={!canEdit}
                      onClick={() => setColor(swatch)}
                    />
                  ))}
                </>
              )}
              {tool === 'text' && (
                <>
                  <span className="mx-1 h-10 w-px shrink-0 bg-line" />
                  {FONT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={textSize === size}
                      disabled={!canEdit}
                      onClick={() => setTextSize(size)}
                      className={cn(
                        'grid h-14 min-w-14 shrink-0 place-items-center rounded-xl px-2 text-lg font-bold',
                        textSize === size ? 'bg-leaf text-white' : 'hover:bg-cream',
                      )}
                    >
                      {SIZE_LABEL[size]}
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(event) => void onFile(event)} />
    </div>
  )
}

function resized(
  origin: { x: number; y: number; w: number; h: number },
  corner: Corner,
  dx: number,
  dy: number,
  proportional: boolean,
) {
  let w = origin.w
  let h = origin.h
  if (proportional) {
    const sx = corner === 'nw' || corner === 'sw' ? -dx : dx
    const sy = corner === 'nw' || corner === 'ne' ? -dy : dy
    const scale = Math.abs(sx) >= Math.abs(sy) ? (origin.w + sx) / origin.w : (origin.h + sy) / origin.h
    w = Math.max(48, origin.w * Math.max(0.2, scale))
    h = Math.max(36, origin.h * Math.max(0.2, scale))
  } else if (corner === 'se') {
    w = Math.max(48, origin.w + dx)
    h = Math.max(36, origin.h + dy)
  } else if (corner === 'sw') {
    w = Math.max(48, origin.w - dx)
    h = Math.max(36, origin.h + dy)
  } else if (corner === 'ne') {
    w = Math.max(48, origin.w + dx)
    h = Math.max(36, origin.h - dy)
  } else {
    w = Math.max(48, origin.w - dx)
    h = Math.max(36, origin.h - dy)
  }
  w = Math.min(CARD_W, w)
  h = Math.min(CARD_H, h)
  let x = origin.x
  let y = origin.y
  if (corner === 'sw' || corner === 'nw') x = origin.x + origin.w - w
  if (corner === 'ne' || corner === 'nw') y = origin.y + origin.h - h
  return clampToCard(x, y, w, h)
}

function CardNode({
  item,
  minX,
  minY,
  active,
  editing,
  draftText,
  ring,
  handle,
  canEdit,
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
  ring: number
  handle: number
  canEdit: boolean
  onDraft: (value: string) => void
  onCommit: () => void
  onNodeDown: (event: ReactPointerEvent<HTMLDivElement>, item: CanvasItem) => void
  onResizeDown: (event: ReactPointerEvent<HTMLButtonElement>, item: CanvasItem, corner: Corner) => void
  onEdit: () => void
  onFit: (rect: { w: number; h: number }) => void
}) {
  const isText = item.kind === 'text'
  const isImage = item.kind === 'image'
  const fontSize = item.fontSize || 28
  const corners: Corner[] = ['nw', 'ne', 'sw', 'se']
  return (
    <div
      data-node
      className="absolute touch-none"
      style={{
        left: item.x - minX,
        top: item.y - minY,
        width: item.w,
        height: item.h,
        zIndex: item.z,
        background: isText || isImage ? 'transparent' : item.color,
        color: isText ? item.color : '#2a2118',
        borderRadius: item.kind === 'ellipse' ? 999 : item.kind === 'rect' ? 8 : 14,
        border: item.kind === 'rect' ? '3px solid #2a2118' : undefined,
        boxShadow: active ? `0 0 0 ${ring}px #1f7a54` : isText || isImage ? 'none' : '0 10px 24px rgba(70, 36, 8, 0.16)',
      }}
      onPointerDown={(event) => onNodeDown(event, item)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onEdit()
      }}
    >
      {item.kind === 'sticky' && <span className="tape" aria-hidden />}
      {isImage ? (
        isAllowedImageUrl(item.text) ? (
          <img
            src={item.text}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
            onLoad={(event) => {
              const img = event.currentTarget
              if (!img.naturalWidth || !img.naturalHeight) return
              const ratio = img.naturalWidth / img.naturalHeight
              let w = 420
              let h = Math.round(w / ratio)
              if (h > 460) {
                h = 460
                w = Math.round(h * ratio)
              }
              onFit({ w: Math.max(48, w), h: Math.max(36, h) })
            }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-cream text-lg text-muted">相片</div>
        )
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
      ) : (
        <div
          className={cn(
            'h-full w-full overflow-hidden whitespace-pre-wrap break-words p-4 leading-snug',
            (item.kind === 'rect' || item.kind === 'ellipse') && 'grid place-items-center text-center',
          )}
          style={{ fontSize: isText ? fontSize : 22, fontWeight: isText ? 600 : 500 }}
        >
          {item.text || (active && canEdit ? '撳兩下打字' : '')}
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
              transform: corner === 'nw' ? 'translate(-35%, -35%)' : corner === 'ne' ? 'translate(35%, -35%)' : corner === 'sw' ? 'translate(-35%, 35%)' : 'translate(35%, 35%)',
            }}
            onPointerDown={(event) => onResizeDown(event, item, corner)}
          >
            <span className="rounded-sm border-[3px] border-leaf bg-white" style={{ width: handle * 0.38, height: handle * 0.38 }} />
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
  const colors = item.kind === 'text' ? TEXT_COLORS : item.kind === 'rect' || item.kind === 'ellipse' || item.kind === 'sticky' ? NOTE_COLORS : []
  return (
    <>
      <ToolButton label="揀" pressed={false} onClick={onBack}>
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
                'grid h-14 min-w-14 shrink-0 place-items-center rounded-xl px-3 text-lg font-bold',
                (item.fontSize || 28) === size ? 'bg-leaf text-white' : 'hover:bg-cream',
              )}
            >
              {SIZE_LABEL[size]}
            </button>
          ))}
        </>
      )}
      {editing && (
        <button type="button" data-commit onClick={onDone} className="grid h-14 min-w-[5.5rem] shrink-0 place-items-center rounded-xl bg-leaf px-4 text-lg font-bold text-white">
          完成
        </button>
      )}
      <span className="mx-1 h-10 w-px shrink-0 bg-line" />
      <ToolButton label="刪" disabled={!canDelete} onClick={onDelete}>
        <Trash2 className="h-6 w-6" />
      </ToolButton>
    </>
  )
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
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
        'flex h-[4.5rem] min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-sm font-semibold',
        pressed ? 'bg-leaf text-white' : 'hover:bg-cream',
        disabled && 'opacity-40',
      )}
    >
      {children}
      {label}
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
      className={cn('h-12 w-12 shrink-0 rounded-xl border-4', pressed ? 'border-ink' : 'border-white')}
      style={{ background: swatch }}
    />
  )
}
