import type { ItemKind } from './types'

export const SHAPE_KINDS = ['rect', 'ellipse', 'star', 'heart', 'triangle', 'cloud', 'bubble'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]
export type StrokeStyle = 'solid' | 'dash' | 'dot'
export type FillMode = 'both' | 'fill' | 'line'

const KINDS: ItemKind[] = ['sticky', 'text', 'rect', 'ellipse', 'image', 'pen', 'arrow', 'star', 'heart', 'triangle', 'cloud', 'bubble']

export function isItemKind(value: string): value is ItemKind {
  return (KINDS as string[]).includes(value)
}

export function isShapeKind(value: string): value is ShapeKind {
  return (SHAPE_KINDS as readonly string[]).includes(value)
}

export function fillModeOf(text: string): FillMode {
  if (text === 'fill' || text === 'line' || text === 'both') return text
  return 'both'
}

export function isFillMode(text: string) {
  return text === 'fill' || text === 'line' || text === 'both'
}

export function strokeStyleOf(text: string): StrokeStyle {
  if (text.startsWith('dash')) return 'dash'
  if (text.startsWith('dot')) return 'dot'
  return 'solid'
}

export interface InkPoint {
  x: number
  y: number
}

export function parseInk(text: string): { style: StrokeStyle; points: InkPoint[] } {
  const style = strokeStyleOf(text)
  const body = text.replace(/^(solid|dash|dot)\s+/, '')
  const points: InkPoint[] = []
  for (const token of body.split(/\s+/)) {
    const [rawX, rawY] = token.split(',')
    const x = Number(rawX)
    const y = Number(rawY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push({ x, y })
  }
  return { style, points }
}

export function encodeInk(style: StrokeStyle, points: InkPoint[]) {
  const body = points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ')
  return `${style} ${body}`.slice(0, 8000)
}

export function simplifyInk(points: InkPoint[], minDist = 3, max = 160) {
  if (points.length === 0) return []
  const kept: InkPoint[] = [points[0]]
  for (const point of points) {
    const last = kept[kept.length - 1]
    if (Math.hypot(point.x - last.x, point.y - last.y) >= minDist) kept.push(point)
  }
  if (kept.length === 1) kept.push({ x: kept[0].x + 1, y: kept[0].y + 1 })
  if (kept.length <= max) return kept
  const step = (kept.length - 1) / (max - 1)
  const out: InkPoint[] = []
  for (let index = 0; index < max; index += 1) out.push(kept[Math.round(index * step)])
  return out
}

export function inkFrame(points: InkPoint[], pad = 18) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const spanW = Math.max(1, maxX - minX)
  const spanH = Math.max(1, maxY - minY)
  const w = Math.max(8, spanW + pad * 2)
  const h = Math.max(8, spanH + pad * 2)
  const x = minX - (w - spanW) / 2
  const y = minY - (h - spanH) / 2
  return {
    x,
    y,
    w,
    h,
    relative: points.map((point) => ({ x: Math.round(point.x - x), y: Math.round(point.y - y) })),
  }
}
