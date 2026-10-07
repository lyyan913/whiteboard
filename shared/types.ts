export type BoardType = 'wall' | 'canvas'
export type WallLayout = 'free' | 'grid'
export type PostKind = 'text' | 'image' | 'youtube'
export type ItemKind = 'sticky' | 'text' | 'rect' | 'ellipse'
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
  createdAt: number
  updatedAt: number
}

export interface BoardSummary extends Board {
  activityCount: number
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
  authorName: string
  clientId: string
  kind: ItemKind
  text: string
  x: number
  y: number
  w: number
  h: number
  color: string
  z: number
  createdAt: number
  updatedAt: number
}

export interface JoinResponse {
  accessToken: string
  role: Role
  board: Board
  posts: Post[]
  items: CanvasItem[]
}

export interface StateResponse {
  role: Role
  board: Board
  posts: Post[]
  items: CanvasItem[]
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
  | { type: 'item.deleted'; id: string }
  | { type: 'board.updated'; board: Board }
  | { type: 'board.deleted' }
  | { type: 'live'; entity: 'post' | 'item'; id: string; x?: number; y?: number; w?: number; h?: number }

export type ClientMessage =
  | { type: 'presence'; name: string }
  | { type: 'live'; entity: 'post' | 'item'; id: string; x?: number; y?: number; w?: number; h?: number }
