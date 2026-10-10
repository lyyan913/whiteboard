import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { extractYouTubeId } from '../../shared/media'
import type { Board, BoardMeta, CanvasItem, ItemCreate, JoinResponse, Post, Role, SandboxPage, ServerMessage, StateResponse, WallLayout } from '../../shared/types'
import { BoardSettingsDialog, ShareDialog } from '@/components/BoardDialogs'
import { BoardChrome } from '@/components/BoardChrome'
import { CanvasView } from '@/components/CanvasView'
import { Logo } from '@/components/Logo'
import { NicknameDialog } from '@/components/NicknameDialog'
import { PostComposer, type ComposerInput } from '@/components/PostComposer'
import { SandboxShell } from '@/components/SandboxShell'
import { WallView } from '@/components/WallView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, boardTokenKey, getTeacherToken } from '@/lib/api'
import { useIdentity } from '@/lib/identity'
import { useBoardSocket } from '@/lib/socket'
import { readStorage, removeStorage, writeStorage } from '@/lib/utils'

type Phase =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'password'; meta: BoardMeta; error?: string }
  | { kind: 'deleted' }
  | { kind: 'ready'; role: Role; board: Board; posts: Post[]; items: CanvasItem[]; pages: SandboxPage[]; token: string }

function upsert<T extends { id: string }>(list: T[], item: T) {
  const index = list.findIndex((entry) => entry.id === item.id)
  if (index === -1) return [...list, item]
  const next = list.slice()
  next[index] = item
  return next
}

export function BoardPage() {
  const { boardId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const roomQuery = searchParams.get('room') || ''
  const navigate = useNavigate()
  const { nickname, clientId, saveNickname } = useIdentity()
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const [password, setPassword] = useState('')
  const [joining, setJoining] = useState(false)
  const [banner, setBanner] = useState('')
  const [nickOpen, setNickOpen] = useState(false)
  const [composer, setComposer] = useState<Post | null | undefined>(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Post | CanvasItem | null>(null)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [pendingPageDelete, setPendingPageDelete] = useState<string | null>(null)
  const interacting = useRef(new Set<string>())
  const tokenRef = useRef<string | null>(null)
  const nickPrompted = useRef('')
  const activePageRef = useRef<string | null>(null)
  activePageRef.current = activePageId

  const readyToken = phase.kind === 'ready' ? phase.token : null
  const role = phase.kind === 'ready' ? phase.role : null
  if (phase.kind === 'ready') tokenRef.current = phase.token

  const onSocket = useCallback((message: ServerMessage) => {
    setPhase((prev) => {
      if (prev.kind !== 'ready') return prev
      if (message.type === 'board.deleted') return { kind: 'deleted' }
      if (message.type === 'board.updated') return { ...prev, board: message.board }
      if (message.type === 'post.created') return { ...prev, posts: upsert(prev.posts, message.post) }
      if (message.type === 'post.updated') {
        if (interacting.current.has(message.post.id)) return prev
        return { ...prev, posts: upsert(prev.posts, message.post) }
      }
      if (message.type === 'post.deleted') return { ...prev, posts: prev.posts.filter((post) => post.id !== message.id) }
      if (message.type === 'page.created') return { ...prev, pages: upsert(prev.pages, message.page) }
      if (message.type === 'page.updated') return { ...prev, pages: upsert(prev.pages, message.page) }
      if (message.type === 'page.deleted') {
        return {
          ...prev,
          pages: prev.pages.filter((page) => page.id !== message.id),
          items: prev.items.filter((item) => item.pageId !== message.id),
        }
      }
      if (message.type === 'item.created') return { ...prev, items: upsert(prev.items, message.item) }
      if (message.type === 'item.updated') {
        if (interacting.current.has(message.item.id)) return prev
        return { ...prev, items: upsert(prev.items, message.item) }
      }
      if (message.type === 'item.deleted') return { ...prev, items: prev.items.filter((item) => item.id !== message.id) }
      if (message.type === 'live') {
        if (interacting.current.has(message.id)) return prev
        if (message.entity === 'post') {
          return {
            ...prev,
            posts: prev.posts.map((post) => (post.id === message.id ? { ...post, x: message.x ?? post.x, y: message.y ?? post.y } : post)),
          }
        }
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === message.id ? { ...item, x: message.x ?? item.x, y: message.y ?? item.y, w: message.w ?? item.w, h: message.h ?? item.h } : item,
          ),
        }
      }
      return prev
    })
  }, [])

  const { status, people, send } = useBoardSocket(readyToken, onSocket, () => {
    removeStorage(sessionStorage, boardTokenKey(boardId))
    setRetry((value) => value + 1)
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setPhase({ kind: 'loading' })
      setBanner('')
      try {
        const metaResult = await api<{ board: BoardMeta }>(`/api/boards/${boardId}/meta`)
        const saved = readStorage(sessionStorage, boardTokenKey(boardId))
        if (saved) {
          try {
            const state = await api<StateResponse>(`/api/boards/${boardId}/state`, { token: saved })
            if (!cancelled) openBoard({ role: state.role, board: state.board, posts: state.posts, items: state.items, pages: state.pages, token: saved })
            return
          } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
              removeStorage(sessionStorage, boardTokenKey(boardId))
            } else {
              throw error
            }
          }
        }
        const teacher = getTeacherToken()
        const roomKey = `tongchung.room.${boardId}`
        const classroomId = roomQuery || readStorage(sessionStorage, roomKey)
        if (roomQuery) writeStorage(sessionStorage, roomKey, roomQuery)
        if (teacher || classroomId || !metaResult.board.hasPassword) {
          try {
            const joined = await api<JoinResponse>(`/api/boards/${boardId}/join`, {
              method: 'POST',
              token: teacher || null,
              body: JSON.stringify(classroomId ? { classroomId } : {}),
            })
            if (cancelled) return
            writeStorage(sessionStorage, boardTokenKey(boardId), joined.accessToken)
            openBoard({ role: joined.role, board: joined.board, posts: joined.posts, items: joined.items, pages: joined.pages, token: joined.accessToken })
            return
          } catch (error) {
            if (error instanceof ApiError && error.status === 401 && metaResult.board.hasPassword) {
              if (!cancelled) setPhase({ kind: 'password', meta: metaResult.board })
              return
            }
            throw error
          }
        }
        if (!cancelled) setPhase({ kind: 'password', meta: metaResult.board })
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 404) setPhase({ kind: 'missing' })
        else setPhase({ kind: 'error', message: error instanceof Error ? error.message : '打開壁報失敗' })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [boardId, retry, roomQuery])

  useEffect(() => {
    if (!readyToken) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void api<StateResponse>(`/api/boards/${boardId}/state`, { token: readyToken })
        .then((state) => {
          setPhase((prev) => {
            if (prev.kind !== 'ready') return prev
            return {
              ...prev,
              role: state.role,
              board: state.board,
              pages: state.pages,
              posts: state.posts.map((post) => (interacting.current.has(post.id) ? (prev.posts.find((item) => item.id === post.id) ?? post) : post)),
              items: state.items.map((item) => (interacting.current.has(item.id) ? (prev.items.find((entry) => entry.id === item.id) ?? item) : item)),
            }
          })
        })
        .catch(() => {})
    }, 12000)
    return () => window.clearInterval(timer)
  }, [readyToken, boardId])

  useEffect(() => {
    if (!readyToken || status !== 'live' || !role) return
    const name = role === 'teacher' ? (nickname.trim() ? `${nickname}（教師）` : '教師') : nickname.trim() || '同學'
    send({ type: 'presence', name })
  }, [readyToken, status, role, nickname, send])

  useEffect(() => {
    const title = phase.kind === 'ready' ? `${phase.board.title} · 同窗` : '同窗 · 課堂壁報板'
    document.title = title
  }, [phase])

  useEffect(() => {
    if (phase.kind !== 'ready' || phase.role !== 'student' || nickname.trim()) return
    if (nickPrompted.current === phase.board.id) return
    nickPrompted.current = phase.board.id
    setNickOpen(true)
  }, [phase, nickname])

  const sandboxKey =
    phase.kind === 'ready' && phase.board.type === 'sandbox' ? `${phase.board.id}:${phase.pages.map((page) => page.id).join(',')}` : ''

  useEffect(() => {
    if (!sandboxKey || phase.kind !== 'ready') return
    setActivePageId((prev) => (prev && phase.pages.some((page) => page.id === prev) ? prev : (phase.pages[0]?.id ?? null)))
  }, [sandboxKey, phase])

  function openBoard(next: { role: Role; board: Board; posts: Post[]; items: CanvasItem[]; pages: SandboxPage[]; token: string }) {
    setPhase({ kind: 'ready', ...next })
    if (next.board.type === 'sandbox') {
      setActivePageId((current) => (current && next.pages.some((page) => page.id === current) ? current : (next.pages[0]?.id ?? null)))
    }
  }

  function remember(joined: JoinResponse) {
    writeStorage(sessionStorage, boardTokenKey(boardId), joined.accessToken)
    openBoard({ role: joined.role, board: joined.board, posts: joined.posts, items: joined.items, pages: joined.pages, token: joined.accessToken })
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault()
    setJoining(true)
    try {
      const classroomId = roomQuery || readStorage(sessionStorage, `tongchung.room.${boardId}`)
      const joined = await api<JoinResponse>(`/api/boards/${boardId}/join`, {
        method: 'POST',
        token: getTeacherToken() || null,
        body: JSON.stringify(classroomId ? { password, classroomId } : { password }),
      })
      setPassword('')
      remember(joined)
    } catch (error) {
      setPhase((prev) => (prev.kind === 'password' ? { ...prev, error: error instanceof ApiError ? error.message : '進入失敗' } : prev))
    } finally {
      setJoining(false)
    }
  }

  function authorName() {
    return nickname.trim() || (role === 'teacher' ? '教師' : '')
  }

  function ensureNickname(next: () => void) {
    if (nickname.trim() || role === 'teacher') next()
    else setNickOpen(true)
  }

  async function saveComposer(input: ComposerInput) {
    const token = tokenRef.current
    if (!token || phase.kind !== 'ready') return
    let mediaUrl = input.mediaUrl
    if (input.file) {
      const body = new FormData()
      body.append('file', input.file)
      const uploaded = await api<{ url: string }>(`/api/boards/${boardId}/uploads`, { method: 'POST', body, token })
      mediaUrl = uploaded.url
    }
    if (input.kind === 'youtube') {
      const id = extractYouTubeId(mediaUrl)
      if (!id) throw new ApiError(400, '請貼上有效的 YouTube 連結')
      mediaUrl = id
    }
    const editing = composer
    if (editing) {
      const result = await api<{ post: Post }>(`/api/boards/${boardId}/posts/${editing.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          body: input.body,
          mediaUrl,
          color: input.color,
          clientId,
        }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, posts: upsert(prev.posts, result.post) } : prev))
      return
    }
    const result = await api<{ post: Post }>(`/api/boards/${boardId}/posts`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        kind: input.kind,
        body: input.body,
        mediaUrl,
        color: input.color,
        clientId,
        authorName: authorName(),
      }),
    })
    setPhase((prev) => (prev.kind === 'ready' ? { ...prev, posts: upsert(prev.posts, result.post) } : prev))
  }

  async function commitPost(id: string, x: number, y: number, z: number) {
    const token = tokenRef.current
    if (!token) return
    try {
      const result = await api<{ post: Post }>(`/api/boards/${boardId}/posts/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ x, y, z }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, posts: upsert(prev.posts, result.post) } : prev))
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '移動失敗')
    }
  }

  async function createItem(input: ItemCreate) {
    if (role === 'student' && !nickname.trim()) {
      setNickOpen(true)
      return null
    }
    const token = tokenRef.current
    if (!token) return null
    const payload = {
      ...input,
      text: input.text ?? '',
      fontSize: input.fontSize ?? 28,
      clientId,
      authorName: authorName(),
      pageId: phase.kind === 'ready' && phase.board.type === 'sandbox' ? activePageRef.current : undefined,
    }
    try {
      const result = await api<{ item: CanvasItem }>(`/api/boards/${boardId}/items`, {
        method: 'POST',
        token,
        body: JSON.stringify(payload),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, items: upsert(prev.items, result.item) } : prev))
      return result.item
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const retryId = `${input.id}a`.slice(0, 24)
        const result = await api<{ item: CanvasItem }>(`/api/boards/${boardId}/items`, {
          method: 'POST',
          token,
          body: JSON.stringify({ ...payload, id: retryId }),
        })
        setPhase((prev) => (prev.kind === 'ready' ? { ...prev, items: upsert(prev.items, result.item) } : prev))
        return result.item
      }
      setBanner(error instanceof ApiError ? error.message : '新增失敗')
      return null
    }
  }

  async function uploadCanvasFile(file: File) {
    if (role === 'student' && !nickname.trim()) {
      setNickOpen(true)
      return null
    }
    const token = tokenRef.current
    if (!token) return null
    const body = new FormData()
    body.append('file', file)
    const uploaded = await api<{ url: string }>(`/api/boards/${boardId}/uploads`, { method: 'POST', body, token })
    return uploaded.url
  }

  async function updateItem(id: string, patch: Partial<CanvasItem>) {
    const token = tokenRef.current
    if (!token) return
    try {
      const result = await api<{ item: CanvasItem }>(`/api/boards/${boardId}/items/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ ...patch, clientId }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, items: upsert(prev.items, result.item) } : prev))
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '儲存失敗')
    }
  }

  async function removeTarget(target: Post | CanvasItem) {
    const token = tokenRef.current
    if (!token) return
    const isPost = 'body' in target
    const path = isPost
      ? `/api/boards/${boardId}/posts/${target.id}?clientId=${encodeURIComponent(clientId)}`
      : `/api/boards/${boardId}/items/${target.id}?clientId=${encodeURIComponent(clientId)}`
    try {
      await api(path, { method: 'DELETE', token })
      setPhase((prev) => {
        if (prev.kind !== 'ready') return prev
        return isPost
          ? { ...prev, posts: prev.posts.filter((post) => post.id !== target.id) }
          : { ...prev, items: prev.items.filter((item) => item.id !== target.id) }
      })
      setPendingDelete(null)
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '刪除失敗')
    }
  }

  async function createPage() {
    const token = tokenRef.current
    if (!token) return null
    try {
      const result = await api<{ page: SandboxPage }>(`/api/boards/${boardId}/pages`, {
        method: 'POST',
        token,
        body: JSON.stringify({ clientId, authorName: authorName() }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, pages: upsert(prev.pages, result.page) } : prev))
      setActivePageId(result.page.id)
      return result.page
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '未能開新版面')
      return null
    }
  }

  async function renamePage(pageId: string, title: string) {
    const token = tokenRef.current
    if (!token) return false
    try {
      const result = await api<{ page: SandboxPage }>(`/api/boards/${boardId}/pages/${pageId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ title, clientId }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, pages: upsert(prev.pages, result.page) } : prev))
      return true
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '未能改名')
      return false
    }
  }

  async function deletePage(pageId: string) {
    const token = tokenRef.current
    if (!token) return
    try {
      await api(`/api/boards/${boardId}/pages/${pageId}?clientId=${encodeURIComponent(clientId)}`, { method: 'DELETE', token })
      setPhase((prev) => {
        if (prev.kind !== 'ready') return prev
        return {
          ...prev,
          pages: prev.pages.filter((page) => page.id !== pageId),
          items: prev.items.filter((item) => item.pageId !== pageId),
        }
      })
      if (activePageRef.current === pageId) {
        const remaining = phase.kind === 'ready' ? phase.pages.filter((page) => page.id !== pageId) : []
        setActivePageId(remaining[0]?.id ?? null)
      }
      setPendingPageDelete(null)
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '刪除失敗')
    }
  }

  async function changeLayout(layout: WallLayout) {
    const token = tokenRef.current
    if (!token) return
    try {
      const result = await api<{ board: Board }>(`/api/boards/${boardId}/layout`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ layout }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, board: result.board } : prev))
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '未能切換版面')
    }
  }

  async function toggleLock() {
    if (phase.kind !== 'ready') return
    try {
      const result = await api<{ board: Board }>(`/api/boards/${boardId}`, {
        method: 'PATCH',
        token: getTeacherToken(),
        body: JSON.stringify({ locked: !phase.board.locked }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, board: result.board } : prev))
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '未能更新鎖定')
    }
  }

  async function toggleStudentPages() {
    if (phase.kind !== 'ready') return
    try {
      const result = await api<{ board: Board }>(`/api/boards/${boardId}`, {
        method: 'PATCH',
        token: getTeacherToken(),
        body: JSON.stringify({ allowStudentPages: !phase.board.allowStudentPages }),
      })
      setPhase((prev) => (prev.kind === 'ready' ? { ...prev, board: result.board } : prev))
    } catch (error) {
      setBanner(error instanceof ApiError ? error.message : '未能更新版面設定')
    }
  }

  if (phase.kind === 'loading') {
    return <StatusScreen title="請稍等…" />
  }
  if (phase.kind === 'missing') {
    return <StatusScreen title="找不到這塊壁報" body="請向老師核對連結是否正確。" />
  }
  if (phase.kind === 'deleted') {
    return <StatusScreen title="這塊壁報已刪除" body="老師已刪除這塊壁報，連結已失效。" />
  }
  if (phase.kind === 'error') {
    return (
      <StatusScreen title="未能打開壁報" body={phase.message}>
        <Button type="button" onClick={() => setRetry((value) => value + 1)}>
          再試一次
        </Button>
      </StatusScreen>
    )
  }
  if (phase.kind === 'password') {
    return (
      <div className="grid min-h-dvh place-items-center px-4 py-8">
        <form onSubmit={(event) => void submitPassword(event)} className="w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-sm">
          <Logo />
          <h1 className="mt-6 font-serif text-4xl font-bold">{phase.meta.title}</h1>
          {phase.meta.groupLabel && <p className="mt-2 text-lg text-leaf">{phase.meta.groupLabel}</p>}
          <p className="mt-3 text-lg text-muted">問老師攞密碼。</p>
          <div className="mt-5 space-y-2">
            <Label htmlFor="board-password">學生密碼</Label>
            <Input
              id="board-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {phase.error && (
            <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
              {phase.error}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={joining}>
            {joining ? '請稍等…' : '進入'}
          </Button>
        </form>
      </div>
    )
  }

  const board = phase.board
  const needsNickname = role === 'student' && !nickname.trim()

  return (
    <div className={board.type === 'wall' ? 'min-h-dvh' : 'flex h-dvh flex-col'}>
      <BoardChrome
        board={board}
        role={phase.role}
        people={people}
        status={status}
        nickname={nickname}
        onNickname={() => setNickOpen(true)}
        onShare={() => setShareOpen(true)}
        classroomId={roomQuery || readStorage(sessionStorage, `tongchung.room.${boardId}`) || undefined}
        onSettings={phase.role === 'teacher' ? () => setSettingsOpen(true) : undefined}
        onLockToggle={phase.role === 'teacher' ? () => void toggleLock() : undefined}
        onStudentPagesToggle={phase.role === 'teacher' && board.type === 'sandbox' ? () => void toggleStudentPages() : undefined}
        onLayout={board.type === 'wall' && (!board.locked || phase.role === 'teacher') ? (layout) => void changeLayout(layout) : undefined}
        onAdd={board.type === 'wall' && (!board.locked || phase.role === 'teacher') ? () => ensureNickname(() => setComposer(null)) : undefined}
      />
      {banner && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-stamp">
          {banner}
        </p>
      )}
      {board.locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-100 px-4 py-3 text-base text-ink">
          <p className="font-semibold text-warn">
            {board.type === 'sandbox' ? '老師暫停咗編輯' : '而家鎖定咗，學生暫時唔可以新貼。'}
          </p>
          {phase.role === 'teacher' && (
            <Button type="button" size="lg" onClick={() => void toggleLock()}>
              解除鎖定
            </Button>
          )}
        </div>
      )}
      {needsNickname && !nickOpen && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-paper px-4 py-3 text-base">
          <p>你叫咩名？其他同學會見到呢個名。</p>
          <Button type="button" size="lg" onClick={() => setNickOpen(true)}>
            開始
          </Button>
        </div>
      )}
      {board.type === 'sandbox' ? (
        <SandboxShell
          pages={phase.pages}
          activePageId={activePageId}
          items={phase.items}
          role={phase.role}
          clientId={clientId}
          locked={board.locked}
          allowStudentPages={board.allowStudentPages}
          onSelect={setActivePageId}
          onCreatePage={() => {
            if (phase.role === 'student' && !nickname.trim()) {
              setNickOpen(true)
              return Promise.resolve(null)
            }
            return createPage()
          }}
          onRenamePage={renamePage}
          onDeletePage={(pageId) => setPendingPageDelete(pageId)}
          onCreate={createItem}
          onUpload={uploadCanvasFile}
          onLocal={(id, patch) => {
            setPhase((prev) => (prev.kind === 'ready' ? { ...prev, items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) } : prev))
          }}
          onUpdate={updateItem}
          onDelete={(id) => {
            const item = phase.items.find((entry) => entry.id === id)
            if (item) setPendingDelete(item)
          }}
          onLive={(id, patch) => send({ type: 'live', entity: 'item', id, pageId: activePageRef.current ?? undefined, clientId, ...patch })}
          onInteract={(id, active) => {
            if (active) interacting.current.add(id)
            else interacting.current.delete(id)
          }}
          onError={setBanner}
        />
      ) : board.type === 'wall' ? (
        <WallView
          posts={phase.posts}
          layout={board.layout}
          role={phase.role}
          clientId={clientId}
          locked={board.locked}
          onMove={(id, x, y, z) => {
            setPhase((prev) => (prev.kind === 'ready' ? { ...prev, posts: prev.posts.map((post) => (post.id === id ? { ...post, x, y, z } : post)) } : prev))
          }}
          onCommit={commitPost}
          onInteract={(id, active) => {
            if (active) interacting.current.add(id)
            else interacting.current.delete(id)
          }}
          onEdit={(post) => ensureNickname(() => setComposer(post))}
          onDelete={(post) => setPendingDelete(post)}
          onLive={(id, x, y) => send({ type: 'live', entity: 'post', id, x, y })}
        />
      ) : (
        <CanvasView
          items={phase.items}
          role={phase.role}
          clientId={clientId}
          locked={board.locked}
          onCreate={createItem}
          onLocal={(id, patch) => {
            setPhase((prev) => (prev.kind === 'ready' ? { ...prev, items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) } : prev))
          }}
          onUpdate={updateItem}
          onDelete={(id) => {
            const item = phase.items.find((entry) => entry.id === id)
            if (item) setPendingDelete(item)
          }}
          onLive={(id, patch) => send({ type: 'live', entity: 'item', id, ...patch })}
          onInteract={(id, active) => {
            if (active) interacting.current.add(id)
            else interacting.current.delete(id)
          }}
        />
      )}
      <NicknameDialog open={nickOpen} initial={nickname} onOpenChange={setNickOpen} onSave={(name) => saveNickname(name)} />
      {composer !== undefined && (
        <PostComposer
          open
          initial={composer}
          onOpenChange={(open) => {
            if (!open) setComposer(undefined)
          }}
          onSubmit={saveComposer}
        />
      )}
      <ShareDialog board={board} open={shareOpen} onOpenChange={setShareOpen} />
      {phase.role === 'teacher' && (
        <BoardSettingsDialog
          board={board}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onChanged={(next) => setPhase((prev) => (prev.kind === 'ready' ? { ...prev, board: next } : prev))}
          onDeleted={() => navigate(roomQuery ? `/c/${roomQuery}` : '/')}
        />
      )}
      <Dialog open={Boolean(pendingPageDelete)} onOpenChange={(open) => { if (!open) setPendingPageDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除這個版面？</DialogTitle>
            <DialogDescription>這個版面同上面嘅內容會一併刪除，同學都會睇唔到。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setPendingPageDelete(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" size="lg" onClick={() => pendingPageDelete && void deletePage(pendingPageDelete)}>
              刪除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除這個內容？</DialogTitle>
            <DialogDescription>刪除後，正在看這塊壁報的同學會同時看不到它。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" size="lg" onClick={() => pendingDelete && void removeTarget(pendingDelete)}>
              刪除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusScreen({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Logo />
        <h1 className="mt-6 font-serif text-3xl font-bold">{title}</h1>
        {body && <p className="mt-3 text-lg leading-7 text-muted">{body}</p>}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  )
}
