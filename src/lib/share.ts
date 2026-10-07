export function boardUrl(id: string) {
  return `${window.location.origin}/b/${id}`
}

export function shareMessage(board: { id: string; title: string; groupLabel: string | null }, password?: string) {
  return [
    `【同窗】${board.title}`,
    board.groupLabel ? `組別：${board.groupLabel}` : '',
    `連結：${boardUrl(board.id)}`,
    password ? `密碼：${password}` : '不用密碼，打開連結即可進入。',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
