import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Post, Role, WallLayout } from '../../shared/types'
import { formatWhen, tiltOf } from '@/lib/utils'

const WALL_WIDTH = 1200

function safeImage(url: string | null) {
  if (!url) return null
  if (url.startsWith('/uploads/')) return url
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch {
    return null
  }
  return null
}

export function WallView({
  posts,
  layout,
  role,
  clientId,
  locked,
  onMove,
  onCommit,
  onInteract,
  onEdit,
  onDelete,
  onLive,
}: {
  posts: Post[]
  layout: WallLayout
  role: Role
  clientId: string
  locked: boolean
  onMove: (id: string, x: number, y: number, z: number) => void
  onCommit: (id: string, x: number, y: number, z: number) => Promise<void> | void
  onInteract: (id: string, active: boolean) => void
  onEdit: (post: Post) => void
  onDelete: (post: Post) => void
  onLive: (id: string, x: number, y: number) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const lastLive = useRef(0)
  const canMove = !locked || role === 'teacher'
  const height = Math.max(1480, posts.reduce((max, post) => Math.max(max, post.y + 460), 0))

  function canChange(post: Post) {
    return role === 'teacher' || (!locked && post.clientId === clientId)
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, post: Post) {
    if (!canMove || layout !== 'free') return
    if ((event.target as HTMLElement).closest('button, a, iframe, input, textarea')) return
    const board = boardRef.current
    const card = event.currentTarget
    if (!board) return
    event.preventDefault()
    const cardRect = card.getBoundingClientRect()
    const offsetX = event.clientX - cardRect.left
    const offsetY = event.clientY - cardRect.top
    const maxZ = Math.max(1, ...posts.map((item) => item.z)) + 1
    let x = post.x
    let y = post.y
    onInteract(post.id, true)
    onMove(post.id, x, y, maxZ)
    card.setPointerCapture(event.pointerId)
    const move = (pointer: PointerEvent) => {
      const rect = board.getBoundingClientRect()
      x = Math.min(Math.max(pointer.clientX - rect.left - offsetX, 0), WALL_WIDTH - 296)
      y = Math.min(Math.max(pointer.clientY - rect.top - offsetY, 0), 8000)
      onMove(post.id, x, y, maxZ)
      const now = Date.now()
      if (now - lastLive.current > 50) {
        lastLive.current = now
        onLive(post.id, x, y)
      }
    }
    const up = () => {
      card.removeEventListener('pointermove', move)
      card.removeEventListener('pointerup', up)
      card.removeEventListener('pointercancel', up)
      onLive(post.id, x, y)
      void Promise.resolve(onCommit(post.id, x, y, maxZ)).finally(() => onInteract(post.id, false))
    }
    card.addEventListener('pointermove', move)
    card.addEventListener('pointerup', up)
    card.addEventListener('pointercancel', up)
  }

  const cards = posts.map((post) => (
    <article
      key={post.id}
      className={`note-card relative flex w-full flex-col gap-2 p-3 pt-5 ${layout === 'free' && canMove ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
      style={
        layout === 'free'
          ? {
              position: 'absolute',
              left: post.x,
              top: post.y,
              width: 280,
              zIndex: post.z,
              background: post.color,
              transform: `rotate(${tiltOf(post.id)}deg)`,
            }
          : { background: post.color }
      }
      onPointerDown={(event) => beginDrag(event, post)}
    >
      <span className="tape" aria-hidden />
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-base font-bold">{post.authorName}</p>
          <p className="shrink-0 text-sm text-muted">{formatWhen(post.createdAt)}</p>
        </div>
        {layout === 'free' && canMove && <p className="text-sm text-muted">拖動可以擺位</p>}
      </div>
      <PostBody post={post} />
      {canChange(post) && (
        <div className="flex justify-end gap-2">
          <button type="button" className="min-h-11 rounded-xl px-3 text-base font-semibold text-ink" onClick={() => onEdit(post)}>
            編輯
          </button>
          <button type="button" className="min-h-11 rounded-xl px-3 text-base font-semibold text-danger" onClick={() => onDelete(post)}>
            刪除
          </button>
        </div>
      )}
    </article>
  ))

  if (layout === 'grid') {
    return (
      <div className="cork relative z-0 min-h-[calc(100dvh-4.75rem)] px-4 py-6 pb-28 lg:pb-6">
        {posts.length === 0 ? (
          <Empty />
        ) : (
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards}</div>
        )}
      </div>
    )
  }

  return (
    <div className="cork relative z-0 min-h-[calc(100dvh-4.75rem)] overflow-x-auto px-3 py-6 pb-28 lg:pb-6">
      <p className="mb-3 text-center text-sm text-white sm:hidden">可以左右滑動壁報</p>
      {posts.length === 0 && <Empty floating />}
      <div ref={boardRef} className="relative mx-auto" style={{ width: WALL_WIDTH, minHeight: posts.length === 0 ? 480 : height }}>
        {cards}
      </div>
    </div>
  )
}

function Empty({ floating = false }: { floating?: boolean }) {
  return (
    <div className={floating ? 'pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-4' : 'grid min-h-[50dvh] place-items-center'}>
      <div className="note-card max-w-sm bg-paper p-6 text-center text-ink">
        <p className="font-serif text-2xl font-bold">
          <span className="lg:hidden">撳右下「＋」加第一張貼文</span>
          <span className="hidden lg:inline">撳上面「＋ 新增貼文」加第一張貼文</span>
        </p>
      </div>
    </div>
  )
}

function PostBody({ post }: { post: Post }) {
  const image = post.kind === 'image' ? safeImage(post.mediaUrl) : null
  const youtube = post.kind === 'youtube' && post.mediaUrl && /^[a-zA-Z0-9_-]{11}$/.test(post.mediaUrl) ? post.mediaUrl : null
  return (
    <div className="space-y-2">
      {image && <img src={image} alt={post.body || `${post.authorName}的圖片`} className="max-h-72 w-full rounded-lg bg-white object-cover" />}
      {youtube && (
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          <iframe
            title={`${post.authorName}的影片`}
            src={`https://www.youtube-nocookie.com/embed/${youtube}`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {post.body && <p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{post.body}</p>}
    </div>
  )
}
