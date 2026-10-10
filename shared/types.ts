export type BoardType = 'wall' | 'canvas' | 'sandbox'
export type WallLayout = 'free' | 'grid'
export type PostKind = 'text' | 'image' | 'youtube'
export type ItemKind = 'sticky' | 'text' | 'rect' | 'ellipse' | 'image'
export type Role = 'teacher' | 'student'

export interface Workspace {
  id: string
  name: string
  createdAt: number
}

export interface Board {
  id: string
  title: string
  type: BoardType
  groupLabel: string | null
  hasPassword: boolean
  locked: boolean
  layout: WallLayout
  allowStudentPages: boolean
  createdAt: number
  updatedAt: number
}

export interface BoardSummary extends Board {
  activityCount: number
}

export interface WorkSnippet {
  authorName: string
  text: string
}

export interface ClassroomBoard extends BoardSummary {
  works: WorkSnippet[]
}

export interface BoardMeta {
  id: string
  title: string
  type: BoardType
  groupLabel: string | null
  hasPassword: boolean
  locked: boolean
}

export interface Post {
  id: string
  boardId: string
  authorName: string
  clientId: string
  kind: PostKind
  body: string
  mediaUrl: string | null
  x: number
  y: number
  z: number
  color: string
  createdAt: number
  updatedAt: number
}

export interface CanvasItem {
  id: string
  boardId: string
  pageId: string | null
  authorName: string
  clientId: string
  kind: ItemKind
  text: string
  x: number
  y: number
  w: number
  h: number
  color: string
  fontSize: number
  z: number
  createdAt: number
  updatedAt: number
}

export interface SandboxPage {
  id: string
  boardId: string
  title: string
  authorName: string
  clientId: string
  createdAt: number
  updatedAt: number
}

export interface JoinResponse {
  accessToken: string
  role: Role
  board: Board
  posts: Post[]
  items: CanvasItem[]
  pages: SandboxPage[]
}

export interface StateResponse {
  role: Role
  board: Board
  posts: Post[]
  items: CanvasItem[]
  pages: SandboxPage[]
}

export interface Person {
  id: string
  name: string
}

export type ServerMessage =
  | { type: 'presence'; people: Person[] }
  | { type: 'post.created'; post: Post }
  | { type: 'post.updated'; post: Post }
  | { type: 'post.deleted'; id: string }
  | { type: 'item.created'; item: CanvasItem }
  | { type: 'item.updated'; item: CanvasItem }
  | { type: 'item.deleted'; id: string; pageId?: string | null }
  | { type: 'page.created'; page: SandboxPage }
  | { type: 'page.updated'; page: SandboxPage }
  | { type: 'page.deleted'; id: string }
  | { type: 'board.updated'; board: Board }
  | { type: 'board.deleted' }
  | { type: 'live'; entity: 'post' | 'item'; id: string; pageId?: string; x?: number; y?: number; w?: number; h?: number }

export interface ItemCreate {
  id: string
  kind: ItemKind
  x: number
  y: number
  w: number
  h: number
  color: string
  text?: string
  fontSize?: number
}

export type ClientMessage =
  | { type: 'presence'; name: string }
  | { type: 'live'; entity: 'post' | 'item'; id: string; pageId?: string; clientId?: string; x?: number; y?: number; w?: number; h?: number }
