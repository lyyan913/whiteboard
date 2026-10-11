import { useId } from 'react'
import type { CanvasItem } from '../../shared/types'
import { fillModeOf, isShapeKind, parseInk, type FillMode, type StrokeStyle } from '../../shared/markup'

const PATHS: Record<string, string> = {
  star: 'M50 6 L61 38 H94 L67 58 L78 92 L50 72 L22 92 L33 58 L6 38 H39 Z',
  heart: 'M50 86 C18 64 6 48 8 32 C10 16 26 10 38 20 C44 26 50 34 50 34 C50 34 56 26 62 20 C74 10 90 16 92 32 C94 48 82 64 50 86 Z',
  triangle: 'M50 8 L94 90 H6 Z',
  cloud: 'M28 74 H72 Q90 74 90 58 Q90 46 78 44 Q80 26 62 26 Q56 12 40 18 Q26 10 20 26 Q6 28 8 44 Q2 48 8 60 Q8 74 24 74 Z',
  bubble: 'M10 16 H76 Q90 16 90 30 V54 Q90 68 76 68 H42 L26 88 L30 68 H24 Q10 68 10 54 V30 Q10 16 24 16 Z',
}

export function Markup({ item }: { item: CanvasItem }) {
  const width = Math.max(1, item.w)
  const height = Math.max(1, item.h)
  const stroke = item.fontSize === 4 || item.fontSize === 14 ? item.fontSize : 8
  if (item.kind === 'pen' || item.kind === 'arrow') {
    const ink = parseInk(item.text)
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" aria-hidden>
        {item.kind === 'arrow' ? <ArrowMark width={width} height={height} color={item.color} stroke={stroke} style={ink.style} points={ink.points} /> : <PenMark color={item.color} stroke={stroke} style={ink.style} points={ink.points} />}
      </svg>
    )
  }
  if (!isShapeKind(item.kind)) return null
  const mode = fillModeOf(item.text)
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden>
      <ShapeMark kind={item.kind} color={item.color} stroke={stroke} mode={mode} />
    </svg>
  )
}

function dash(style: StrokeStyle, stroke: number) {
  if (style === 'dash') return `${stroke * 3} ${stroke * 2}`
  if (style === 'dot') return `${stroke} ${stroke * 1.8}`
  return undefined
}

function PenMark({ color, stroke, style, points }: { color: string; stroke: number; style: StrokeStyle; points: { x: number; y: number }[] }) {
  if (points.length === 0) return null
  const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  return <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash(style, stroke)} />
}

function ArrowMark({
  width,
  height,
  color,
  stroke,
  style,
  points,
}: {
  width: number
  height: number
  color: string
  stroke: number
  style: StrokeStyle
  points: { x: number; y: number }[]
}) {
  const reactId = useId().replace(/:/g, '')
  const start = points[0] ?? { x: stroke + 4, y: height - stroke - 4 }
  const end = points[1] ?? { x: width - stroke - 4, y: stroke + 4 }
  const id = `arrow-${reactId}`
  return (
    <>
      <defs>
        <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0 0 L7 3 L0 6 Z" fill={color} />
        </marker>
      </defs>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={dash(style, stroke)} markerEnd={`url(#${id})`} />
    </>
  )
}

function ShapeMark({ kind, color, stroke, mode }: { kind: string; color: string; stroke: number; mode: FillMode }) {
  const fill = mode === 'line' ? 'none' : color
  const outline = mode === 'fill' ? 'none' : '#1f1a14'
  const common = { fill, stroke: outline, strokeWidth: mode === 'fill' ? 0 : Math.max(2, stroke / 3), strokeLinejoin: 'round' as const }
  if (kind === 'ellipse') return <ellipse cx="50" cy="50" rx="44" ry="44" {...common} />
  if (kind === 'rect') return <rect x="6" y="6" width="88" height="88" rx="8" {...common} />
  return <path d={PATHS[kind] ?? PATHS.star} {...common} />
}
