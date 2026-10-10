import * as fs from 'node:fs'
import * as path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { Board, BoardSummary, BoardType, CanvasItem, ItemKind, Post, PostKind, SandboxPage, WallLayout, Workspace } from '../shared/types'
import { makeId } from '../shared/text'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'))
export const uploadDir = path.join(dataDir, 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const db = new DatabaseSync(path.join(dataDir, 'classroom.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA busy_timeout = 3000')
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    group_label TEXT,
    password_hash TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    layout TEXT NOT NULL DEFAULT 'free',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    client_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    x REAL NOT NULL DEFAULT 40,
    y REAL NOT NULL DEFAULT 40,
    z INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS canvas_items (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    client_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL,
    y REAL NOT NULL,
    w REAL NOT NULL,
    h REAL NOT NULL,
    color TEXT NOT NULL,
    z INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_boards_workspace ON boards(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_posts_board ON posts(board_id);
  CREATE INDEX IF NOT EXISTS idx_items_board ON canvas_items(board_id);
`)

const itemColumns = db.prepare('PRAGMA table_info(canvas_items)').all() as { name: string }[]
if (!itemColumns.some((column) => column.name === 'page_id')) {
  db.exec('ALTER TABLE canvas_items ADD COLUMN page_id TEXT')
}
if (!itemColumns.some((column) => column.name === 'font_size')) {
  db.exec('ALTER TABLE canvas_items ADD COLUMN font_size INTEGER')
}
const boardColumns = db.prepare('PRAGMA table_info(boards)').all() as { name: string }[]
if (!boardColumns.some((column) => column.name === 'allow_student_pages')) {
  db.exec('ALTER TABLE boards ADD COLUMN allow_student_pages INTEGER NOT NULL DEFAULT 0')
}
db.exec(`
  CREATE TABLE IF NOT EXISTS sandbox_pages (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author_name TEXT NOT NULL,
    client_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pages_board ON sandbox_pages(board_id);
  CREATE INDEX IF NOT EXISTS idx_items_page ON canvas_items(page_id);
`)

type WorkspaceRow = { id: string; name: string; pin_hash: string; created_at: number | bigint }
type BoardRow = {
  id: string
  workspace_id: string
  title: string
  type: string
  group_label: string | null
  password_hash: string | null
  locked: number | bigint
  allow_student_pages?: number | bigint
  layout: string
  created_at: number | bigint
  updated_at: number | bigint
  activity_count?: number | bigint
}
type PostRow = {
  id: string
  board_id: string
  author_name: string
  client_id: string
  kind: string
  body: string
  media_url: string | null
  x: number
  y: number
  z: number | bigint
  color: string
  created_at: number | bigint
  updated_at: number | bigint
}
type ItemRow = {
  id: string
  board_id: string
  page_id: string | null
  author_name: string
  client_id: string
  kind: string
  text: string
  x: number
  y: number
  w: number
  h: number
  color: string
  font_size: number | bigint | null
  z: number | bigint
  created_at: number | bigint
  updated_at: number | bigint
}
type PageRow = {
  id: string
  board_id: string
  title: string
  author_name: string
  client_id: string
  created_at: number | bigint
  updated_at: number | bigint
}

function num(value: number | bigint | undefined) {
  return Number(value ?? 0)
}

function one<T>(sql: string, ...params: Array<string | number | null>) {
  return db.prepare(sql).get(...params) as T | undefined
}

function many<T>(sql: string, ...params: Array<string | number | null>) {
  return db.prepare(sql).all(...params) as T[]
}

export function publicWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, createdAt: num(row.created_at) }
}

export function getWorkspaceByName(name: string) {
  return one<WorkspaceRow>('SELECT * FROM workspaces WHERE name = ?', name)
}

export function getWorkspace(id: string) {
  return one<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', id)
}

export function createWorkspace(name: string, pinHash: string) {
  const id = makeId(16)
  const now = Date.now()
  db.prepare('INSERT INTO workspaces (id, name, pin_hash, created_at) VALUES (?, ?, ?, ?)').run(id, name, pinHash, now)
  return getWorkspace(id)!
}

function boardType(value: string): BoardType {
  if (value === 'canvas' || value === 'sandbox') return value
  return 'wall'
}

function mapBoard(row: BoardRow): Board {
  return {
    id: row.id,
    title: row.title,
    type: boardType(row.type),
    groupLabel: row.group_label,
    hasPassword: Boolean(row.password_hash),
    locked: num(row.locked) === 1,
    allowStudentPages: num(row.allow_student_pages) === 1,
    layout: row.layout === 'grid' ? 'grid' : 'free',
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  }
}

export function getBoardRow(id: string) {
  return one<BoardRow>('SELECT * FROM boards WHERE id = ?', id)
}

export function getBoard(id: string) {
  const row = getBoardRow(id)
  return row ? mapBoard(row) : undefined
}

export function listWorkSnippets(workspaceId: string) {
  const posts = many<{ board_id: string; author_name: string; body: string; kind: string }>(
    `SELECT p.board_id, p.author_name, p.body, p.kind
     FROM posts p
     JOIN boards b ON b.id = p.board_id
     WHERE b.workspace_id = ?
     ORDER BY p.created_at DESC`,
    workspaceId,
  )
  const items = many<{ board_id: string; author_name: string; text: string }>(
    `SELECT c.board_id, c.author_name, c.text
     FROM canvas_items c
     JOIN boards b ON b.id = c.board_id
     WHERE b.workspace_id = ? AND c.page_id IS NULL AND c.text != ''
     ORDER BY c.created_at DESC`,
    workspaceId,
  )
  const pages = many<{ board_id: string; author_name: string; title: string }>(
    `SELECT s.board_id, s.author_name, s.title
     FROM sandbox_pages s
     JOIN boards b ON b.id = s.board_id
     WHERE b.workspace_id = ?
     ORDER BY s.created_at DESC`,
    workspaceId,
  )
  const grouped = new Map<string, { authorName: string; text: string }[]>()
  function push(boardId: string, authorName: string, text: string) {
    const list = grouped.get(boardId) ?? []
    const line = text.replace(/\s+/g, ' ').trim()
    if (!line || list.length >= 3) return
    list.push({ authorName, text: line.slice(0, 42) })
    grouped.set(boardId, list)
  }
  for (const post of posts) {
    const text = post.body || (post.kind === 'image' ? '圖片' : post.kind === 'youtube' ? 'YouTube' : '')
    push(post.board_id, post.author_name, text)
  }
  for (const item of items) push(item.board_id, item.author_name, item.text)
  for (const page of pages) push(page.board_id, page.author_name, page.title || '版面')
  return grouped
}

export function listBoards(workspaceId: string): BoardSummary[] {
  const rows = many<BoardRow>(
    `SELECT b.*,
      (SELECT COUNT(*) FROM posts p WHERE p.board_id = b.id) +
      (SELECT COUNT(*) FROM canvas_items c WHERE c.board_id = b.id AND c.page_id IS NULL) +
      (SELECT COUNT(*) FROM sandbox_pages s WHERE s.board_id = b.id) AS activity_count
     FROM boards b
     WHERE b.workspace_id = ?
     ORDER BY b.updated_at DESC`,
    workspaceId,
  )
  return rows.map((row) => ({ ...mapBoard(row), activityCount: num(row.activity_count) }))
}

export function createBoard(input: {
  workspaceId: string
  title: string
  type: BoardType
  groupLabel: string | null
  passwordHash: string | null
}) {
  const now = Date.now()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = makeId(8)
    try {
      db.prepare(
        `INSERT INTO boards (id, workspace_id, title, type, group_label, password_hash, locked, layout, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'free', ?, ?)`,
      ).run(id, input.workspaceId, input.title, input.type, input.groupLabel, input.passwordHash, now, now)
      return getBoard(id)!
    } catch (error) {
      if (!String(error).includes('UNIQUE')) throw error
    }
  }
  throw new Error('Could not allocate a board id')
}

export function updateBoard(
  id: string,
  patch: {
    title?: string
    groupLabel?: string | null
    passwordHash?: string | null
    locked?: boolean
    allowStudentPages?: boolean
    layout?: WallLayout
    clearPassword?: boolean
  },
) {
  const current = getBoardRow(id)
  if (!current) return undefined
  const title = patch.title ?? current.title
  const groupLabel = patch.groupLabel === undefined ? current.group_label : patch.groupLabel
  const passwordHash = patch.clearPassword ? null : patch.passwordHash === undefined ? current.password_hash : patch.passwordHash
  const locked = patch.locked === undefined ? num(current.locked) : patch.locked ? 1 : 0
  const allowStudentPages = patch.allowStudentPages === undefined ? num(current.allow_student_pages) : patch.allowStudentPages ? 1 : 0
  const layout = patch.layout ?? (current.layout === 'grid' ? 'grid' : 'free')
  db.prepare(
    `UPDATE boards
     SET title = ?, group_label = ?, password_hash = ?, locked = ?, allow_student_pages = ?, layout = ?, updated_at = ?
     WHERE id = ?`,
  ).run(title, groupLabel, passwordHash, locked, allowStudentPages, layout, Date.now(), id)
  return getBoard(id)
}

export function deleteBoard(id: string) {
  db.prepare('DELETE FROM posts WHERE board_id = ?').run(id)
  db.prepare('DELETE FROM canvas_items WHERE board_id = ?').run(id)
  db.prepare('DELETE FROM sandbox_pages WHERE board_id = ?').run(id)
  db.prepare('DELETE FROM boards WHERE id = ?').run(id)
}

export function touchBoard(id: string) {
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    boardId: row.board_id,
    authorName: row.author_name,
    clientId: row.client_id,
    kind: row.kind as PostKind,
    body: row.body,
    mediaUrl: row.media_url,
    x: row.x,
    y: row.y,
    z: num(row.z),
    color: row.color,
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  }
}

function mapItem(row: ItemRow): CanvasItem {
  return {
    id: row.id,
    boardId: row.board_id,
    authorName: row.author_name,
    clientId: row.client_id,
    kind: row.kind as ItemKind,
    text: row.text,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    pageId: row.page_id,
    color: row.color,
    fontSize: fontSizeOf(row.font_size),
    z: num(row.z),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  }
}

function fontSizeOf(value: number | bigint | null | undefined) {
  const size = num(value ?? 0)
  if (size === 18 || size === 28 || size === 40) return size
  return 28
}

function mapPage(row: PageRow): SandboxPage {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    authorName: row.author_name,
    clientId: row.client_id,
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  }
}

export function listPosts(boardId: string) {
  return many<PostRow>('SELECT * FROM posts WHERE board_id = ? ORDER BY created_at ASC', boardId).map(mapPost)
}

export function listItems(boardId: string) {
  return many<ItemRow>('SELECT * FROM canvas_items WHERE board_id = ? AND page_id IS NULL ORDER BY z ASC, created_at ASC', boardId).map(mapItem)
}

export function listAllItems(boardId: string) {
  return many<ItemRow>('SELECT * FROM canvas_items WHERE board_id = ? ORDER BY z ASC, created_at ASC', boardId).map(mapItem)
}

export function listPages(boardId: string) {
  return many<PageRow>('SELECT * FROM sandbox_pages WHERE board_id = ? ORDER BY created_at ASC', boardId).map(mapPage)
}

export function getPage(boardId: string, pageId: string) {
  const row = one<PageRow>('SELECT * FROM sandbox_pages WHERE board_id = ? AND id = ?', boardId, pageId)
  return row ? mapPage(row) : undefined
}

export function insertPage(page: SandboxPage) {
  db.prepare(
    `INSERT INTO sandbox_pages (id, board_id, title, author_name, client_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(page.id, page.boardId, page.title, page.authorName, page.clientId, page.createdAt, page.updatedAt)
  touchBoard(page.boardId)
  return getPage(page.boardId, page.id)!
}

export function countPages(boardId: string) {
  return num(one<{ n: number | bigint }>('SELECT COUNT(*) AS n FROM sandbox_pages WHERE board_id = ?', boardId)?.n)
}

export function updatePageTitle(boardId: string, pageId: string, title: string) {
  db.prepare('UPDATE sandbox_pages SET title = ?, updated_at = ? WHERE board_id = ? AND id = ?').run(title, Date.now(), boardId, pageId)
  touchBoard(boardId)
  return getPage(boardId, pageId)!
}

export function deletePage(boardId: string, pageId: string) {
  db.prepare('DELETE FROM canvas_items WHERE board_id = ? AND page_id = ?').run(boardId, pageId)
  db.prepare('DELETE FROM sandbox_pages WHERE board_id = ? AND id = ?').run(boardId, pageId)
  touchBoard(boardId)
}

export function listPageItems(boardId: string, pageId: string) {
  return many<ItemRow>('SELECT * FROM canvas_items WHERE board_id = ? AND page_id = ? ORDER BY z ASC, created_at ASC', boardId, pageId).map(mapItem)
}

export function countPageItems(pageId: string) {
  return num(one<{ n: number | bigint }>('SELECT COUNT(*) AS n FROM canvas_items WHERE page_id = ?', pageId)?.n)
}

export function nextPageZ(pageId: string) {
  const row = one<{ z: number | bigint }>('SELECT COALESCE(MAX(z), 0) AS z FROM canvas_items WHERE page_id = ?', pageId)
  return num(row?.z) + 1
}

export function countPosts(boardId: string) {
  return num(one<{ n: number | bigint }>('SELECT COUNT(*) AS n FROM posts WHERE board_id = ?', boardId)?.n)
}

export function countItems(boardId: string) {
  return num(one<{ n: number | bigint }>('SELECT COUNT(*) AS n FROM canvas_items WHERE board_id = ?', boardId)?.n)
}

export function nextZ(table: 'posts' | 'canvas_items', boardId: string) {
  const row = one<{ z: number | bigint }>(`SELECT COALESCE(MAX(z), 0) AS z FROM ${table} WHERE board_id = ?`, boardId)
  return num(row?.z) + 1
}

export function nextWallSpot(boardId: string) {
  const count = countPosts(boardId)
  const col = count % 3
  const row = Math.floor(count / 3)
  return { x: 36 + col * 390 + (count % 2) * 18, y: 36 + row * 340 }
}

export function getPost(boardId: string, postId: string) {
  const row = one<PostRow>('SELECT * FROM posts WHERE board_id = ? AND id = ?', boardId, postId)
  return row ? mapPost(row) : undefined
}

export function getItem(boardId: string, itemId: string) {
  const row = one<ItemRow>('SELECT * FROM canvas_items WHERE board_id = ? AND id = ?', boardId, itemId)
  return row ? mapItem(row) : undefined
}

export function itemIdExists(itemId: string) {
  return Boolean(one<{ id: string }>('SELECT id FROM canvas_items WHERE id = ?', itemId))
}

export function insertPost(post: Post) {
  db.prepare(
    `INSERT INTO posts (id, board_id, author_name, client_id, kind, body, media_url, x, y, z, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    post.id,
    post.boardId,
    post.authorName,
    post.clientId,
    post.kind,
    post.body,
    post.mediaUrl,
    post.x,
    post.y,
    post.z,
    post.color,
    post.createdAt,
    post.updatedAt,
  )
  touchBoard(post.boardId)
  return getPost(post.boardId, post.id)!
}

export function savePost(post: Post) {
  db.prepare(
    `UPDATE posts
     SET body = ?, media_url = ?, x = ?, y = ?, z = ?, color = ?, updated_at = ?
     WHERE board_id = ? AND id = ?`,
  ).run(post.body, post.mediaUrl, post.x, post.y, post.z, post.color, Date.now(), post.boardId, post.id)
  touchBoard(post.boardId)
  return getPost(post.boardId, post.id)!
}

export function removePost(boardId: string, postId: string) {
  db.prepare('DELETE FROM posts WHERE board_id = ? AND id = ?').run(boardId, postId)
  touchBoard(boardId)
}

export function insertItem(item: CanvasItem) {
  db.prepare(
    `INSERT INTO canvas_items (id, board_id, page_id, author_name, client_id, kind, text, x, y, w, h, color, font_size, z, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.boardId,
    item.pageId,
    item.authorName,
    item.clientId,
    item.kind,
    item.text,
    item.x,
    item.y,
    item.w,
    item.h,
    item.color,
    item.fontSize,
    item.z,
    item.createdAt,
    item.updatedAt,
  )
  touchBoard(item.boardId)
  return getItem(item.boardId, item.id)!
}

export function saveItem(item: CanvasItem) {
  db.prepare(
    `UPDATE canvas_items
     SET text = ?, x = ?, y = ?, w = ?, h = ?, color = ?, font_size = ?, z = ?, updated_at = ?
     WHERE board_id = ? AND id = ?`,
  ).run(item.text, item.x, item.y, item.w, item.h, item.color, item.fontSize, item.z, Date.now(), item.boardId, item.id)
  touchBoard(item.boardId)
  return getItem(item.boardId, item.id)!
}

export function removeItem(boardId: string, itemId: string) {
  db.prepare('DELETE FROM canvas_items WHERE board_id = ? AND id = ?').run(boardId, itemId)
  touchBoard(boardId)
}
