import { randomBytes } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import * as fs from 'node:fs'
import * as path from 'node:path'
import multer from 'multer'
import { isFontSize, isNoteColor, isTextColor } from '../shared/colors'
import { extractYouTubeId, isAllowedImageUrl } from '../shared/media'
import type { BoardType, CanvasItem, ItemKind, Post, PostKind, WallLayout } from '../shared/types'
import { cleanBody, cleanClientId, cleanText, makeId } from '../shared/text'
import {
  assertRateLimit,
  bearer,
  hashSecret,
  HttpError,
  signBoard,
  signTeacher,
  verifySecret,
  verifyToken,
} from './auth'
import {
  countItems,
  countPages,
  countPosts,
  createBoard,
  createWorkspace,
  deleteBoard,
  countPageItems,
  deletePage,
  getBoard,
  getBoardRow,
  getItem,
  getPage,
  getPost,
  insertPage,
  itemIdExists,
  listAllItems,
  getWorkspace,
  getWorkspaceByName,
  insertItem,
  insertPost,
  listBoards,
  listItems,
  listPageItems,
  listPages,
  listPosts,
  listWorkSnippets,
  nextPageZ,
  nextWallSpot,
  nextZ,
  publicWorkspace,
  removeItem,
  removePost,
  saveItem,
  savePost,
  updateBoard,
  updatePageTitle,
  uploadDir,
} from './db'
import { broadcast } from './hub'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

function teacherOf(req: Request) {
  const payload = verifyToken(bearer(req.header('authorization')))
  if (!payload || payload.t !== 'teacher') throw new HttpError(401, '請先以教師身份登入')
  return payload
}

function optionalTeacher(req: Request) {
  const payload = verifyToken(bearer(req.header('authorization')))
  if (!payload || payload.t !== 'teacher') return null
  return payload
}

function boardAccess(req: Request, boardId: string) {
  const payload = verifyToken(bearer(req.header('authorization')))
  if (!payload || payload.t !== 'board' || payload.bid !== boardId) {
    throw new HttpError(401, '請重新進入壁報')
  }
  return payload
}

function ownedBoard(workspaceId: string, boardId: string) {
  const row = getBoardRow(boardId)
  if (!row || row.workspace_id !== workspaceId) throw new HttpError(404, '找不到壁報')
  return row
}

function writable(boardId: string, role: 'teacher' | 'student') {
  const row = getBoardRow(boardId)
  if (!row) throw new HttpError(404, '找不到壁報')
  if (Number(row.locked) === 1 && role !== 'teacher') throw new HttpError(403, '壁報已鎖定')
  return row
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function sniffImage(buffer: Buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (
    buffer.length > 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png'
  }
  if (buffer.length > 6) {
    const head = buffer.subarray(0, 6).toString('ascii')
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif'
  }
  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

function readString(body: unknown, key: string) {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export function createApi() {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  router.get('/classrooms/:workspaceId', (req, res) => {
    const row = getWorkspace(req.params.workspaceId)
    if (!row) throw new HttpError(404, '找不到課室')
    const teacher = optionalTeacher(req)
    const works = listWorkSnippets(row.id)
    res.json({
      workspace: publicWorkspace(row),
      role: teacher && teacher.wid === row.id ? 'teacher' : 'student',
      boards: listBoards(row.id).map((board) => ({ ...board, works: works.get(board.id) ?? [] })),
    })
  })

  router.post('/workspaces', (req, res) => {
    const name = cleanText(req.body?.name, 30)
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : ''
    if (!name) throw new HttpError(400, '請填寫課室名稱')
    if (pin.length < 4 || pin.length > 32) throw new HttpError(400, '教師密碼需要 4 至 32 個字元')
    if (getWorkspaceByName(name)) throw new HttpError(409, '這個課室名稱已有人使用，請進入課室或換一個名稱')
    const row = createWorkspace(name, hashSecret(pin))
    res.status(201).json({ token: signTeacher(row.id), workspace: publicWorkspace(row) })
  })

  router.post('/login', (req, res) => {
    const name = cleanText(req.body?.name, 30)
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : ''
    const row = name ? getWorkspaceByName(name) : undefined
    if (!row || !verifySecret(pin, row.pin_hash)) {
      assertRateLimit(`login:${name || 'empty'}`, 40)
      throw new HttpError(401, '課室名稱或教師密碼不正確')
    }
    res.json({ token: signTeacher(row.id), workspace: publicWorkspace(row) })
  })

  router.get('/me', (req, res) => {
    const teacher = teacherOf(req)
    const row = getWorkspace(teacher.wid)
    if (!row) throw new HttpError(401, '請重新登入')
    res.json({
      token: signTeacher(row.id),
      workspace: publicWorkspace(row),
      boards: listBoards(row.id),
    })
  })

  router.post('/boards', (req, res) => {
    const teacher = teacherOf(req)
    const title = cleanText(req.body?.title, 40)
    const rawType = req.body?.type
    if (rawType !== 'wall' && rawType !== 'canvas' && rawType !== 'sandbox') throw new HttpError(400, '請選擇壁報類型')
    const type: BoardType = rawType
    if (!title) throw new HttpError(400, '請填寫壁報標題')
    const groupLabel = cleanText(req.body?.groupLabel, 20) || null
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (password && (password.length < 4 || password.length > 32)) {
      throw new HttpError(400, '學生密碼需要 4 至 32 個字元，或留空')
    }
    const board = createBoard({
      workspaceId: teacher.wid,
      title,
      type,
      groupLabel,
      passwordHash: password ? hashSecret(password) : null,
    })
    let activityCount = 0
    if (type === 'sandbox') {
      const now = Date.now()
      insertPage({
        id: makeId(10),
        boardId: board.id,
        title: '版面 1',
        authorName: '教師',
        clientId: 'teacher-board',
        createdAt: now,
        updatedAt: now,
      })
      activityCount = 1
    }
    res.status(201).json({ board: { ...board, activityCount } })
  })

  router.patch('/boards/:boardId', (req, res) => {
    const teacher = teacherOf(req)
    const boardId = req.params.boardId
    ownedBoard(teacher.wid, boardId)
    const patch: {
      title?: string
      groupLabel?: string | null
      passwordHash?: string
      clearPassword?: boolean
      locked?: boolean
      allowStudentPages?: boolean
    } = {}
    if ('title' in (req.body ?? {})) {
      const title = cleanText(req.body?.title, 40)
      if (!title) throw new HttpError(400, '請填寫壁報標題')
      patch.title = title
    }
    if ('groupLabel' in (req.body ?? {})) {
      patch.groupLabel = cleanText(req.body?.groupLabel, 20) || null
    }
    if (req.body?.clearPassword === true) patch.clearPassword = true
    if (typeof req.body?.password === 'string' && req.body.password.length > 0) {
      if (req.body.password.length < 4 || req.body.password.length > 32) {
        throw new HttpError(400, '學生密碼需要 4 至 32 個字元')
      }
      patch.passwordHash = hashSecret(req.body.password)
      patch.clearPassword = false
    }
    if (typeof req.body?.locked === 'boolean') patch.locked = req.body.locked
    if (typeof req.body?.allowStudentPages === 'boolean') patch.allowStudentPages = req.body.allowStudentPages
    const board = updateBoard(boardId, patch)
    if (!board) throw new HttpError(404, '找不到壁報')
    broadcast(boardId, { type: 'board.updated', board })
    res.json({ board })
  })

  router.patch('/boards/:boardId/layout', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const layout: WallLayout = req.body?.layout === 'grid' ? 'grid' : req.body?.layout === 'free' ? 'free' : 'free'
    if (req.body?.layout !== 'grid' && req.body?.layout !== 'free') throw new HttpError(400, '版面不正確')
    writable(boardId, access.role)
    const board = updateBoard(boardId, { layout })
    if (!board) throw new HttpError(404, '找不到壁報')
    broadcast(boardId, { type: 'board.updated', board })
    res.json({ board })
  })

  router.delete('/boards/:boardId', (req, res) => {
    const teacher = teacherOf(req)
    const boardId = req.params.boardId
    ownedBoard(teacher.wid, boardId)
    deleteBoard(boardId)
    broadcast(boardId, { type: 'board.deleted' })
    res.status(204).end()
  })

  router.get('/boards/:boardId/meta', (req, res) => {
    const board = getBoard(req.params.boardId)
    if (!board) throw new HttpError(404, '找不到壁報')
    res.json({
      board: {
        id: board.id,
        title: board.title,
        type: board.type,
        groupLabel: board.groupLabel,
        hasPassword: board.hasPassword,
        locked: board.locked,
      },
    })
  })

  router.post('/boards/:boardId/join', (req, res) => {
    const boardId = req.params.boardId
    const row = getBoardRow(boardId)
    if (!row) throw new HttpError(404, '找不到壁報')
    const teacher = optionalTeacher(req)
    const classroomId = typeof req.body?.classroomId === 'string' ? req.body.classroomId : ''
    let role: 'teacher' | 'student' = 'student'
    if (teacher && teacher.wid === row.workspace_id) {
      role = 'teacher'
    } else if (classroomId && classroomId === row.workspace_id) {
      role = 'student'
    } else if (row.password_hash) {
      const password = typeof req.body?.password === 'string' ? req.body.password : ''
      if (!verifySecret(password, row.password_hash)) {
        assertRateLimit(`join:${req.ip}:${boardId}`, 40)
        throw new HttpError(401, '密碼不正確')
      }
    }
    const board = getBoard(boardId)!
    res.json({
      accessToken: signBoard(boardId, role),
      role,
      board,
      posts: listPosts(boardId),
      items: board.type === 'sandbox' ? listAllItems(boardId) : listItems(boardId),
      pages: listPages(boardId),
    })
  })

  router.get('/boards/:boardId/state', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const board = getBoard(boardId)
    if (!board) throw new HttpError(404, '找不到壁報')
    const items = board.type === 'sandbox' ? listAllItems(boardId) : listItems(boardId)
    res.json({ role: access.role, board, posts: listPosts(boardId), items, pages: listPages(boardId) })
  })

  router.get('/boards/:boardId/pages', (req, res) => {
    const boardId = req.params.boardId
    boardAccess(req, boardId)
    const row = getBoardRow(boardId)
    if (!row || row.type !== 'sandbox') throw new HttpError(400, '這不是作品集')
    res.json({ pages: listPages(boardId) })
  })

  router.post('/boards/:boardId/pages', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const row = getBoardRow(boardId)
    if (!row || row.type !== 'sandbox') throw new HttpError(400, '這不是作品集')
    if (access.role !== 'teacher' && Number(row.allow_student_pages) !== 1) {
      throw new HttpError(403, '老師未開放新版面')
    }
    const clientId = cleanClientId(req.body?.clientId)
    if (!clientId) throw new HttpError(400, '請先設定暱稱')
    const authorName = cleanText(req.body?.authorName, 20) || '同學'
    const title = cleanText(req.body?.title, 40) || `版面 ${countPages(boardId) + 1}`
    const now = Date.now()
    const page = insertPage({
      id: makeId(10),
      boardId,
      title,
      authorName,
      clientId,
      createdAt: now,
      updatedAt: now,
    })
    broadcast(boardId, { type: 'page.created', page })
    res.status(201).json({ page, created: true })
  })

  router.patch('/boards/:boardId/pages/:pageId', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const row = getBoardRow(boardId)
    if (!row || row.type !== 'sandbox') throw new HttpError(400, '這不是作品集')
    const page = getPage(boardId, req.params.pageId)
    if (!page) throw new HttpError(404, '找不到這個版面')
    const clientId = cleanClientId(req.body?.clientId)
    if (access.role !== 'teacher' && (Number(row.allow_student_pages) !== 1 || page.clientId !== clientId)) {
      throw new HttpError(403, '只能改自己開的版面')
    }
    const title = cleanText(req.body?.title, 40)
    if (!title) throw new HttpError(400, '請填寫版面名稱')
    const saved = updatePageTitle(boardId, page.id, title)
    broadcast(boardId, { type: 'page.updated', page: saved })
    res.json({ page: saved })
  })

  router.get('/boards/:boardId/pages/:pageId/state', (req, res) => {
    const boardId = req.params.boardId
    boardAccess(req, boardId)
    const page = getPage(boardId, req.params.pageId)
    if (!page) throw new HttpError(404, '找不到這個版面')
    res.json({ page, items: listPageItems(boardId, page.id) })
  })

  router.delete('/boards/:boardId/pages/:pageId', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const row = getBoardRow(boardId)
    if (!row || row.type !== 'sandbox') throw new HttpError(400, '這不是作品集')
    const page = getPage(boardId, req.params.pageId)
    if (!page) throw new HttpError(404, '找不到這個版面')
    const clientId = cleanClientId(req.query.clientId)
    if (access.role !== 'teacher' && (Number(row.allow_student_pages) !== 1 || page.clientId !== clientId)) {
      throw new HttpError(403, '只能刪除自己開的版面')
    }
    deletePage(boardId, page.id)
    broadcast(boardId, { type: 'page.deleted', id: page.id })
    res.status(204).end()
  })

  router.post('/boards/:boardId/posts', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const row = writable(boardId, access.role)
    if (row.type !== 'wall') throw new HttpError(400, '這不是壁報板')
    if (countPosts(boardId) >= 400) throw new HttpError(400, '這塊壁報的貼文已達上限')
    const kind = req.body?.kind as PostKind
    if (kind !== 'text' && kind !== 'image' && kind !== 'youtube') throw new HttpError(400, '貼文類型不正確')
    const clientId = cleanClientId(req.body?.clientId)
    if (!clientId) throw new HttpError(400, '請先設定暱稱')
    const authorName = cleanText(req.body?.authorName, 20) || '同學'
    const body = cleanBody(req.body?.body, kind === 'text' ? 2000 : 500)
    let mediaUrl: string | null = null
    if (kind === 'text' && !body.trim()) throw new HttpError(400, '請寫下內容')
    if (kind === 'image') {
      const raw = readString(req.body, 'mediaUrl') ?? ''
      if (!isAllowedImageUrl(raw)) throw new HttpError(400, '請上傳圖片或貼上有效網址')
      mediaUrl = raw
    }
    if (kind === 'youtube') {
      const id = extractYouTubeId(readString(req.body, 'mediaUrl') ?? '')
      if (!id) throw new HttpError(400, '請貼上有效的 YouTube 連結')
      mediaUrl = id
    }
    let color = '#ffe9a0'
    if (typeof req.body?.color === 'string') {
      if (!isNoteColor(req.body.color)) throw new HttpError(400, '不支援這個顏色')
      color = req.body.color
    }
    const spot = nextWallSpot(boardId)
    const now = Date.now()
    const post: Post = {
      id: makeId(12),
      boardId,
      authorName,
      clientId,
      kind,
      body: body.trim(),
      mediaUrl,
      x: spot.x,
      y: spot.y,
      z: nextZ('posts', boardId),
      color,
      createdAt: now,
      updatedAt: now,
    }
    const saved = insertPost(post)
    broadcast(boardId, { type: 'post.created', post: saved })
    res.status(201).json({ post: saved })
  })

  router.patch('/boards/:boardId/posts/:postId', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    writable(boardId, access.role)
    const post = getPost(boardId, req.params.postId)
    if (!post) throw new HttpError(404, '找不到貼文')
    const body = req.body ?? {}
    const contentEdit = 'body' in body || 'mediaUrl' in body || 'color' in body
    if (contentEdit && access.role !== 'teacher' && post.clientId !== cleanClientId(body.clientId)) {
      throw new HttpError(403, '只能修改自己的貼文')
    }
    const next = { ...post }
    if ('body' in body) {
      next.body = cleanBody(body.body, post.kind === 'text' ? 2000 : 500).trim()
      if (post.kind === 'text' && !next.body) throw new HttpError(400, '請寫下內容')
    }
    if ('mediaUrl' in body && post.kind === 'image') {
      const raw = typeof body.mediaUrl === 'string' ? body.mediaUrl : ''
      if (!isAllowedImageUrl(raw)) throw new HttpError(400, '圖片網址不正確')
      next.mediaUrl = raw
    }
    if ('mediaUrl' in body && post.kind === 'youtube') {
      const id = extractYouTubeId(typeof body.mediaUrl === 'string' ? body.mediaUrl : '')
      if (!id) throw new HttpError(400, '請貼上有效的 YouTube 連結')
      next.mediaUrl = id
    }
    if ('color' in body) {
      if (typeof body.color !== 'string' || !isNoteColor(body.color)) throw new HttpError(400, '不支援這個顏色')
      next.color = body.color
    }
    if (typeof body.x === 'number') next.x = clamp(body.x, 0, 920)
    if (typeof body.y === 'number') next.y = clamp(body.y, 0, 8000)
    if (typeof body.z === 'number') next.z = clamp(Math.round(body.z), 1, 100000)
    const saved = savePost(next)
    broadcast(boardId, { type: 'post.updated', post: saved })
    res.json({ post: saved })
  })

  router.delete('/boards/:boardId/posts/:postId', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    writable(boardId, access.role)
    const post = getPost(boardId, req.params.postId)
    if (!post) throw new HttpError(404, '找不到貼文')
    const clientId = cleanClientId(req.query.clientId)
    if (access.role !== 'teacher' && post.clientId !== clientId) throw new HttpError(403, '只能刪除自己的貼文')
    removePost(boardId, post.id)
    broadcast(boardId, { type: 'post.deleted', id: post.id })
    res.status(204).end()
  })

  router.post('/boards/:boardId/items', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const row = getBoardRow(boardId)
    if (!row) throw new HttpError(404, '找不到壁報')
    const clientId = cleanClientId(req.body?.clientId)
    if (!clientId) throw new HttpError(400, '請先設定暱稱')
    let pageId: string | null = null
    if (row.type === 'sandbox') {
      if (Number(row.locked) === 1 && access.role !== 'teacher') throw new HttpError(403, '老師暫停咗編輯')
      pageId = typeof req.body?.pageId === 'string' ? req.body.pageId : ''
      const page = pageId ? getPage(boardId, pageId) : undefined
      if (!page) throw new HttpError(404, '找不到這個版面')
      if (countPageItems(page.id) >= 400) throw new HttpError(400, '這個版面的物件已達上限')
      pageId = page.id
    } else if (row.type === 'canvas') {
      writable(boardId, access.role)
      if (countItems(boardId) >= 400) throw new HttpError(400, '畫布物件已達上限')
    } else {
      throw new HttpError(400, '這不是互動畫布')
    }
    const kind = req.body?.kind as ItemKind
    if (kind !== 'sticky' && kind !== 'text' && kind !== 'rect' && kind !== 'ellipse' && kind !== 'image') {
      throw new HttpError(400, '物件類型不正確')
    }
    const requestedId = cleanText(req.body?.id, 24)
    const id = /^[a-zA-Z0-9]{8,24}$/.test(requestedId) ? requestedId : makeId(12)
    if (itemIdExists(id)) throw new HttpError(409, '請再試一次')
    let text = cleanBody(req.body?.text, 1000)
    let color = typeof req.body?.color === 'string' ? req.body.color : ''
    if (kind === 'image') {
      text = text.trim()
      if (!isAllowedImageUrl(text)) throw new HttpError(400, '請上傳圖片')
      if (!isNoteColor(color)) color = '#fffdf8'
    } else if (kind === 'text') {
      if (!isTextColor(color)) throw new HttpError(400, '不支援這個顏色')
    } else if (!isNoteColor(color)) {
      throw new HttpError(400, '不支援這個顏色')
    }
    const fontSize = isFontSize(Number(req.body?.fontSize)) ? Number(req.body.fontSize) : 28
    const now = Date.now()
    const item: CanvasItem = {
      id,
      boardId,
      pageId,
      authorName: cleanText(req.body?.authorName, 20) || '同學',
      clientId,
      kind,
      text,
      x: clamp(Number(req.body?.x), -8000, 16000),
      y: clamp(Number(req.body?.y), -8000, 16000),
      w: clamp(Number(req.body?.w), 48, 1200),
      h: clamp(Number(req.body?.h), 36, 1000),
      color,
      fontSize,
      z: pageId ? nextPageZ(pageId) : nextZ('canvas_items', boardId),
      createdAt: now,
      updatedAt: now,
    }
    const saved = insertItem(item)
    broadcast(boardId, { type: 'item.created', item: saved })
    res.status(201).json({ item: saved })
  })

  router.patch('/boards/:boardId/items/:itemId', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const row = getBoardRow(boardId)
    if (!row) throw new HttpError(404, '找不到壁報')
    const item = getItem(boardId, req.params.itemId)
    if (!item) throw new HttpError(404, '找不到物件')
    if (row.type === 'sandbox') {
      if (Number(row.locked) === 1 && access.role !== 'teacher') throw new HttpError(403, '老師暫停咗編輯')
      const page = item.pageId ? getPage(boardId, item.pageId) : undefined
      if (!page) throw new HttpError(404, '找不到這個版面')
    } else {
      writable(boardId, access.role)
    }
    const body = req.body ?? {}
    const next = { ...item }
    if ('text' in body) {
      next.text = cleanBody(body.text, 1000)
      if (item.kind === 'image') {
        next.text = next.text.trim()
        if (!isAllowedImageUrl(next.text)) throw new HttpError(400, '請上傳圖片')
      }
    }
    if ('color' in body) {
      const color = typeof body.color === 'string' ? body.color : ''
      const ok = item.kind === 'text' ? isTextColor(color) : isNoteColor(color)
      if (!ok) throw new HttpError(400, '不支援這個顏色')
      next.color = color
    }
    if ('fontSize' in body) {
      const fontSize = Number(body.fontSize)
      if (!isFontSize(fontSize)) throw new HttpError(400, '字級不正確')
      next.fontSize = fontSize
    }
    if (typeof body.x === 'number') next.x = clamp(body.x, -8000, 16000)
    if (typeof body.y === 'number') next.y = clamp(body.y, -8000, 16000)
    if (typeof body.w === 'number') next.w = clamp(body.w, 48, 1200)
    if (typeof body.h === 'number') next.h = clamp(body.h, 36, 1000)
    if (typeof body.z === 'number') next.z = clamp(Math.round(body.z), 1, 100000)
    const saved = saveItem(next)
    broadcast(boardId, { type: 'item.updated', item: saved })
    res.json({ item: saved })
  })

  router.delete('/boards/:boardId/items/:itemId', (req, res) => {
    const boardId = req.params.boardId
    const access = boardAccess(req, boardId)
    const row = getBoardRow(boardId)
    if (!row) throw new HttpError(404, '找不到壁報')
    const item = getItem(boardId, req.params.itemId)
    if (!item) throw new HttpError(404, '找不到物件')
    const clientId = cleanClientId(req.query.clientId)
    if (row.type === 'sandbox') {
      if (Number(row.locked) === 1 && access.role !== 'teacher') throw new HttpError(403, '老師暫停咗編輯')
      if (access.role !== 'teacher' && item.clientId !== clientId) throw new HttpError(403, '只能刪除自己的物件')
    } else {
      writable(boardId, access.role)
      if (access.role !== 'teacher' && item.clientId !== clientId) throw new HttpError(403, '只能刪除自己新增的物件')
    }
    removeItem(boardId, item.id)
    broadcast(boardId, { type: 'item.deleted', id: item.id, pageId: item.pageId })
    res.status(204).end()
  })

  router.post('/boards/:boardId/uploads', (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (error) => {
      if (error) {
        next(error)
        return
      }
      try {
        const boardId = req.params.boardId
        const access = boardAccess(req, boardId)
        writable(boardId, access.role)
        const file = req.file
        if (!file) throw new HttpError(400, '請選擇圖片')
        const ext = sniffImage(file.buffer)
        if (!ext) throw new HttpError(400, '只接受 JPG、PNG、GIF 或 WebP')
        const filename = `${randomBytes(12).toString('hex')}.${ext}`
        fs.writeFileSync(path.join(uploadDir, filename), file.buffer)
        res.status(201).json({ url: `/uploads/${filename}` })
      } catch (caught) {
        next(caught)
      }
    })
  })

  router.use((_req, res) => {
    res.status(404).json({ error: '找不到這個路徑' })
  })

  return router
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: '圖片不能超過 5MB' })
    return
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message })
    return
  }
  if (error instanceof SyntaxError && 'status' in error && (error as { status?: number }).status === 400) {
    res.status(400).json({ error: '資料格式不正確' })
    return
  }
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 0
  if (status === 404) {
    res.status(404).json({ error: '找不到檔案' })
    return
  }
  console.error(error)
  res.status(500).json({ error: '伺服器發生問題，請稍後再試' })
}
