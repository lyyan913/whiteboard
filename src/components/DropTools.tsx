import { useEffect, useState } from 'react'
import type { CanvasItem, DropFile, DropFolder, Post } from '../../shared/types'
import { BoardQr } from '@/components/BoardQr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { ApiError, api, getTeacherToken } from '@/lib/api'
import { boardUrl, loadPublicOrigin, uploadPageUrl } from '@/lib/share'
import { dropRemainingLabel } from '../../shared/dropTtl'
import { cn, formatWhen } from '@/lib/utils'

export function JoinQrDialog({
  board,
  open,
  onOpenChange,
}: {
  board: { id: string; title: string; type?: string; hasPassword?: boolean }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [url, setUrl] = useState(() => boardUrl(board.id))

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setUrl(boardUrl(board.id))
    void loadPublicOrigin().then((origin) => {
      if (!cancelled) setUrl(boardUrl(board.id, origin))
    })
    return () => {
      cancelled = true
    }
  }, [open, board.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>掃碼入板</DialogTitle>
          <DialogDescription>
            {board.type === 'sandbox' ? '學生掃碼後填寫名字，然後進入作品集選擇版面。' : '學生掃碼後填寫名字，然後進入這塊板。'}
            {board.hasPassword ? '有學生密碼就要先輸入。' : '未設學生密碼，掃碼即可進入。'}
          </DialogDescription>
        </DialogHeader>
        <BoardQr
          url={url}
          title={board.title}
          heading="掃碼入板"
          hint="這個碼打開這塊板，不是交作品。交作品請用紅色的「掃碼交作品」。"
        />
      </DialogContent>
    </Dialog>
  )
}

export function DropQrDialog({
  boardId,
  title,
  paused,
  open,
  onOpenChange,
  onPaused,
}: {
  boardId: string
  title: string
  paused: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaused: (paused: boolean) => void
}) {
  const [token, setToken] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError('')
    void api<DropFolder>(`/api/boards/${boardId}/drops`, { token: getTeacherToken() })
      .then(async (folder) => {
        const origin = await loadPublicOrigin()
        if (cancelled) return
        setToken(folder.token)
        setUrl(uploadPageUrl(folder.token, origin))
        onPaused(folder.paused)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : '暫時未能顯示 QR 碼')
      })
    return () => {
      cancelled = true
    }
  }, [open, boardId, onPaused])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>掃碼交作品</DialogTitle>
          <DialogDescription>學生掃碼後只可以交檔案，不會進入這塊板。檔案會在 24 小時後自動刪除。</DialogDescription>
        </DialogHeader>
        {error && <p className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">{error}</p>}
        {url ? (
          <BoardQr url={url} title={title} heading="掃碼交作品" hint="用手機相機掃碼，選擇相片或 PDF，再按上載。有學生密碼就要先輸入。進入板面請用綠色的「掃碼入板」。" />
        ) : (
          <p className="py-8 text-center text-lg text-muted">{error ? '' : '正在產生 QR 碼…'}</p>
        )}
        <label className="mt-3 flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-line px-3 py-3">
          <span>
            <span className="block text-base font-semibold">暫停上載</span>
            <span className="block text-base text-muted">{paused ? '學生現在無法提交。' : '學生可以掃碼交作品。'}</span>
          </span>
          <Switch checked={paused} disabled={!token} aria-label="暫停上載" onCheckedChange={(value) => void setPaused(boardId, value, onPaused, setError)} />
        </label>
      </DialogContent>
    </Dialog>
  )
}

export function DropFolderDialog({
  boardId,
  files,
  paused,
  pageId,
  needsPage,
  getView,
  open,
  onOpenChange,
  onPaused,
  onPlaced,
  onDeleted,
}: {
  boardId: string
  files: DropFile[]
  paused: boolean
  pageId: string | null
  needsPage: boolean
  getView?: () => { x: number; y: number; w: number; h: number } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaused: (paused: boolean) => void
  onPlaced: (result: { posts: Post[]; items: CanvasItem[] }) => void
  onDeleted: (id: string) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<DropFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setSelected([])
      setPreview(null)
    }
  }, [open])

  useEffect(() => {
    if (preview && !files.some((file) => file.id === preview.id)) setPreview(null)
  }, [files, preview])

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function place(ids: string[]) {
    if (needsPage && !pageId) {
      setError('請先選擇一個版面')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<{ posts: Post[]; items: CanvasItem[] }>(`/api/boards/${boardId}/drops/place`, {
        method: 'POST',
        token: getTeacherToken(),
        body: JSON.stringify({ ids, pageId, view: getView?.() ?? undefined }),
      })
      onPlaced(result)
      setSelected((current) => current.filter((id) => !ids.includes(id)))
      setPreview(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '放上板失敗')
    } finally {
      setBusy(false)
    }
  }

  async function removeSelected() {
    setBusy(true)
    setError('')
    try {
      for (const id of selected) {
        await api(`/api/boards/${boardId}/drops/${id}`, { method: 'DELETE', token: getTeacherToken() })
        onDeleted(id)
      }
      setSelected([])
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '刪除失敗')
    } finally {
      setBusy(false)
    }
  }

  const shown = preview && files.some((file) => file.id === preview.id) ? preview : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>學生作品</DialogTitle>
          <DialogDescription>
            {shown ? '按「返回」可回到清單。' : '只有老師可以看到。按相片可看大圖；選取後可以放上現在這塊板。'}
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <DropPreview
            boardId={boardId}
            file={shown}
            busy={busy}
            onBack={() => {
              setError('')
              setPreview(null)
            }}
            onPlace={() => void place([shown.id])}
          />
        ) : (
          <>
            <p className="mb-3 rounded-2xl bg-cream px-4 py-3 text-base text-muted">學生上載的檔案會在 24 小時後自動刪除。放上板的副本會保留。</p>
            <label className="mb-3 flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-line px-3 py-3">
              <span className="text-base font-semibold">暫停上載</span>
              <Switch checked={paused} aria-label="暫停上載" onCheckedChange={(value) => void setPaused(boardId, value, onPaused, setError)} />
            </label>
            {files.length === 0 ? (
              <p className="rounded-2xl bg-cream px-4 py-8 text-center text-lg">尚未有學生作品</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {files.map((file) => {
                  const name = file.authorName || '同學'
                  const picked = selected.includes(file.id)
                  return (
                    <li key={file.id} className={cn('rounded-2xl border-2 bg-paper p-2', picked ? 'border-stamp' : 'border-line')}>
                      <button type="button" className="w-full text-left" aria-label={`開啟${name}的作品`} onClick={() => setPreview(file)}>
                        <DropThumb boardId={boardId} file={file} />
                        <p className="mt-2 truncate text-base font-semibold">{name}</p>
                        <p className="truncate text-sm text-muted">{file.originalName}</p>
                        <p className="text-sm text-muted">{formatWhen(file.createdAt)}</p>
                        <p className="text-sm font-semibold text-warn">{dropRemainingLabel(file.createdAt)}</p>
                      </button>
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() => toggle(file.id)}
                        className={cn('mt-2 min-h-11 w-full rounded-xl text-sm font-bold', picked ? 'bg-stamp text-white' : 'bg-cream text-muted')}
                      >
                        {picked ? '已選' : '選取'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" size="lg" disabled={busy || selected.length === 0} onClick={() => void place(selected)}>
                放上板
              </Button>
              <Button type="button" size="lg" variant="destructive" disabled={busy || selected.length === 0} onClick={() => void removeSelected()}>
                刪除
              </Button>
            </div>
          </>
        )}
        {error && <p className="mt-3 rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}

function DropPreview({
  boardId,
  file,
  busy,
  onBack,
  onPlace,
}: {
  boardId: string
  file: DropFile
  busy: boolean
  onBack: () => void
  onPlace: () => void
}) {
  const src = useDropObjectUrl(boardId, file)
  const name = file.authorName || '同學'
  return (
    <div>
      <p className="text-lg font-semibold">{name}</p>
      <p className="text-base text-muted">{formatWhen(file.createdAt)}</p>
      <div className="mt-3 overflow-hidden rounded-2xl bg-cream">
        {file.kind === 'pdf' ? (
          src ? (
            <iframe title={file.originalName || 'PDF'} src={src} className="h-[70vh] w-full bg-white" />
          ) : (
            <p className="grid h-48 place-items-center text-base text-muted">正在開啟 PDF…</p>
          )
        ) : src ? (
          <img src={src} alt={`${name}的作品`} className="max-h-[70vh] w-full object-contain" />
        ) : (
          <p className="grid h-48 place-items-center text-base text-muted">正在開啟相片…</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" size="lg" variant="outline" onClick={onBack}>
          返回
        </Button>
        <Button type="button" size="lg" disabled={busy} onClick={onPlace}>
          放上板
        </Button>
      </div>
    </div>
  )
}

function DropThumb({ boardId, file }: { boardId: string; file: DropFile }) {
  const src = useDropObjectUrl(boardId, file.kind === 'image' ? file : null)
  if (file.kind === 'pdf') {
    return <span className="grid aspect-square place-items-center rounded-xl bg-cream text-2xl font-bold text-stamp">PDF</span>
  }
  if (!src) return <span className="grid aspect-square place-items-center rounded-xl bg-cream text-base text-muted">相片</span>
  return <img src={src} alt="" className="aspect-square w-full rounded-xl bg-cream object-cover" />
}

function useDropObjectUrl(boardId: string, file: DropFile | null) {
  const fileId = file?.id ?? ''
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (!fileId) {
      setSrc('')
      return
    }
    let cancelled = false
    let objectUrl = ''
    setSrc('')
    void fetch(`/api/boards/${boardId}/drops/${fileId}/file`, {
      headers: { Authorization: `Bearer ${getTeacherToken()}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('fail')
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [boardId, fileId])
  return src
}

async function setPaused(boardId: string, paused: boolean, onPaused: (paused: boolean) => void, setError: (message: string) => void) {
  onPaused(paused)
  try {
    const folder = await api<DropFolder>(`/api/boards/${boardId}/drops`, {
      method: 'PATCH',
      token: getTeacherToken(),
      body: JSON.stringify({ paused }),
    })
    onPaused(folder.paused)
    setError('')
  } catch (caught) {
    onPaused(!paused)
    setError(caught instanceof ApiError ? caught.message : '暫時未能暫停上載')
  }
}
