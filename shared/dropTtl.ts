export const DROP_TTL_MS = 24 * 60 * 60 * 1000

export function dropRemainingLabel(createdAt: number, now = Date.now()) {
  const left = createdAt + DROP_TTL_MS - now
  if (left <= 60_000) return '就快刪除'
  const minutes = Math.ceil(left / 60_000)
  if (minutes < 60) return `剩 ${minutes} 分鐘後刪除`
  const hours = Math.ceil(minutes / 60)
  return `剩 ${hours} 小時後刪除`
}
