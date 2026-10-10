import type { CanvasItem } from '../../shared/types'

export const CARD_W = 1200
export const CARD_H = 760

export function cardBounds(items: CanvasItem[]) {
  let minX = 0
  let minY = 0
  let maxX = CARD_W
  let maxY = CARD_H
  for (const item of items) {
    minX = Math.min(minX, item.x)
    minY = Math.min(minY, item.y)
    maxX = Math.max(maxX, item.x + item.w)
    maxY = Math.max(maxY, item.y + item.h)
  }
  return { minX, minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}

export function clampToCard(x: number, y: number, w: number, h: number) {
  const width = Math.min(CARD_W, Math.max(48, w))
  const height = Math.min(CARD_H, Math.max(36, h))
  return {
    x: Math.min(Math.max(0, x), CARD_W - width),
    y: Math.min(Math.max(0, y), CARD_H - height),
    w: width,
    h: height,
  }
}
