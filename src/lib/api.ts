import { readStorage, removeStorage, writeStorage } from '@/lib/utils'

const TEACHER_KEY = 'tongchung.teacherToken'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getTeacherToken() {
  return readStorage(localStorage, TEACHER_KEY)
}

export function setTeacherToken(token: string) {
  writeStorage(localStorage, TEACHER_KEY, token)
}

export function clearTeacherToken() {
  removeStorage(localStorage, TEACHER_KEY)
  try {
    const keys: string[] = []
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (key?.startsWith('tongchung.')) keys.push(key)
    }
    for (const key of keys) sessionStorage.removeItem(key)
  } catch {
    /* private mode */
  }
}

export function boardTokenKey(boardId: string) {
  return `tongchung.board.${boardId}`
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: BodyInit | null; token?: string | null } = {},
): Promise<T> {
  const headers = new Headers()
  if (typeof options.body === 'string') headers.set('Content-Type', 'application/json')
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
  let response: Response
  try {
    response = await fetch(path, { method: options.method ?? 'GET', body: options.body, headers })
  } catch {
    throw new ApiError(0, '連線失敗，請檢查網絡後再試')
  }
  if (!response.ok) {
    let message = '請求失敗'
    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
