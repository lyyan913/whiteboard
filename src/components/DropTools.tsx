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
            {board.type === 'sandbox' ? '學生掃碼後填名，然後入作品集揀版面。' : '學生掃碼後填名，然後入呢塊板。'}
            {board.hasPassword ? '有學生密碼就要先輸入。' : '未設學生密碼，掃碼就可以入。'}
          </DialogDescription>
        </DialogHeader>
        <BoardQr
          url={url}
          title={board.title}
          heading="掃碼入板"
          hint="呢個碼打開這塊板，唔係交作品。交作品請用紅色的「掃碼交作品」。"
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
          <DialogDescription>學生掃碼後只可以交檔案，唔會入到呢塊板。檔案會喺 24 小時後自動刪除。</DialogDescription>
        </DialogHeader>
        {error && <p className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">{error}</p>}
        {url ? (
          <BoardQr url={url} title={title} heading="掃碼交作品" hint="用手機相機掃碼，揀相或 PDF，再撳上載。有學生密碼就要先輸入。入板請用綠色的「掃碼入板」。" />
        ) : (
          <p className="py-8 text-center text-lg text-muted">{error ? '' : '正在產生 QR 碼…'}</p>
        )}
        <label className="mt-3 flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-line px-3 py-3">
          <span>
            <span className="block text-base font-semibold">暫停上載</span>
            <span className="block text-base text-muted">{paused ? '學生而家交唔到。' : '學生可以掃碼交作品。'}</span>
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
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaused: (paused: boolean) => void
  onPlaced: (result: { posts: Post[]; items: CanvasItem[] }) => void
  onDeleted: (id: string) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) setSelected([])
  }, [open])

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function place() {
    if (needsPage && !pageId) {
      setError('請先揀一個版面')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<{ posts: Post[]; items: CanvasItem[] }>(`/api/boards/${boardId}/drops/place`, {
        method: 'POST',
        token: getTeacherToken(),
        body: JSON.stringify({ ids: selected, pageId }),
      })
      onPlaced(result)
      setSelected([])
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>學生上載</DialogTitle>
          <DialogDescription>只有老師睇到呢個資料夾。揀檔案後可以放上而家呢塊板。</DialogDescription>
        </DialogHeader>
        <p className="mb-3 rounded-2xl bg-cream px-4 py-3 text-base text-muted">學生上載檔案會喺 24 小時後自動刪除。放上板的副本會留低。</p>
        <label className="mb-3 flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-line px-3 py-3">
          <span className="text-base font-semibold">暫停上載</span>
          <Switch checked={paused} aria-label="暫停上載" onCheckedChange={(value) => void setPaused(boardId, value, onPaused, setError)} />
        </label>
        {files.length === 0 ? (
          <p className="rounded-2xl bg-cream px-4 py-8 text-center text-lg">未有學生上載</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  aria-pressed={selected.includes(file.id)}
                  onClick={() => toggle(file.id)}
                  className={cn(
                    'w-full rounded-2xl border-2 bg-paper p-2 text-left',
                    selected.includes(file.id) ? 'border-stamp' : 'border-line',
                  )}
                >
                  <DropThumb boardId={boardId} file={file} />
                  <p className={cn('mt-2 text-sm font-bold', selected.includes(file.id) ? 'text-stamp' : 'text-muted')}>{selected.includes(file.id) ? '已揀' : '撳一下揀選'}</p>
                  <p className="mt-1 truncate text-base font-semibold">{file.authorName}</p>
                  <p className="truncate text-sm text-muted">{file.originalName}</p>
                  <p className="text-sm text-muted">{formatWhen(file.createdAt)}</p>
                  <p className="text-sm font-semibold text-warn">{dropRemainingLabel(file.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-3 rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" size="lg" disabled={busy || selected.length === 0} onClick={() => void place()}>
            放上板
          </Button>
          <Button type="button" size="lg" variant="destructive" disabled={busy || selected.length === 0} onClick={() => void removeSelected()}>
            刪除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DropThumb({ boardId, file }: { boardId: string; file: DropFile }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (file.kind !== 'image') return
    let cancelled = false
    let objectUrl = ''
    void fetch(`/api/boards/${boardId}/drops/${file.id}/file`, {
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
  }, [boardId, file.id, file.kind])

  if (file.kind === 'pdf') {
    return <span className="grid aspect-square place-items-center rounded-xl bg-cream text-2xl font-bold text-stamp">PDF</span>
  }
  if (!src) return <span className="grid aspect-square place-items-center rounded-xl bg-cream text-base text-muted">相片</span>
  return <img src={src} alt="" className="aspect-square w-full rounded-xl bg-cream object-cover" />
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
