import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Role } from '../shared/types'
import { dataDir } from './db'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function loadSecret() {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim()) return process.env.AUTH_SECRET.trim()
  const file = path.join(dataDir, 'auth-secret.txt')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  const secret = randomBytes(32).toString('hex')
  fs.writeFileSync(file, secret, { mode: 0o600 })
  return secret
}

const secret = loadSecret()

type TeacherToken = { t: 'teacher'; wid: string; exp: number }
type BoardToken = { t: 'board'; bid: string; role: Role; exp: number }
type Payload = TeacherToken | BoardToken

function sign(payload: Payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken(token: string | undefined | null): Payload | null {
  if (!token) return null
  const splitAt = token.lastIndexOf('.')
  if (splitAt <= 0) return null
  const body = token.slice(0, splitAt)
  const sig = token.slice(splitAt + 1)
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload
    if (!data || typeof data.exp !== 'number' || data.exp < Date.now()) return null
    if (data.t !== 'teacher' && data.t !== 'board') return null
    return data
  } catch {
    return null
  }
}

export function signTeacher(workspaceId: string) {
  return sign({ t: 'teacher', wid: workspaceId, exp: Date.now() + 60 * 24 * 60 * 60 * 1000 })
}

export function signBoard(boardId: string, role: Role) {
  return sign({ t: 'board', bid: boardId, role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
}

export function hashSecret(value: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(value, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifySecret(value: string, stored: string) {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const next = scryptSync(value, salt, 32)
    const prev = Buffer.from(hash, 'hex')
    if (next.length !== prev.length) return false
    return timingSafeEqual(next, prev)
  } catch {
    return false
  }
}

const attempts = new Map<string, { count: number; start: number }>()

export function assertRateLimit(key: string, limit: number) {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const current = attempts.get(key)
  if (!current || now - current.start > windowMs) {
    attempts.set(key, { count: 1, start: now })
    return
  }
  current.count += 1
  if (current.count > limit) throw new HttpError(429, '嘗試次數太多，請稍後再試')
}

export function bearer(header: string | undefined) {
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}
