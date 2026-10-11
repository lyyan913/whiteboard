import { dropUploadUrl, joinBoardUrl } from '../../shared/joinUrl'

export function boardUrl(id: string, publicOrigin: string | null = null) {
  return joinBoardUrl(id, window.location.origin, publicOrigin)
}

export function uploadPageUrl(token: string, publicOrigin: string | null = null) {
  return dropUploadUrl(token, window.location.origin, publicOrigin)
}

let publicOriginRequest: Promise<string | null> | null = null

export function loadPublicOrigin() {
  if (!publicOriginRequest) {
    publicOriginRequest = fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) return null
        const data = (await response.json()) as { publicOrigin?: unknown }
        return typeof data.publicOrigin === 'string' && data.publicOrigin ? data.publicOrigin : null
      })
      .catch(() => null)
  }
  return publicOriginRequest
}

export function classroomUrl(id: string) {
  return `${window.location.origin}/c/${id}`
}

export function shareMessage(
  board: { id: string; title: string; groupLabel: string | null; type?: string },
  password?: string,
  url = boardUrl(board.id),
) {
  return [
    `【同窗】${board.title}`,
    board.groupLabel ? `組別：${board.groupLabel}` : '',
    board.type === 'sandbox' ? '學生打開這條連結，選擇版面，小組一起貼上成果。' : '',
    `連結：${url}`,
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
