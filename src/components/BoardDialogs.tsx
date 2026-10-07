import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Board, BoardSummary, BoardType } from '../../shared/types'
import { ApiError, api, getTeacherToken } from '@/lib/api'
import { copyText, shareMessage } from '@/lib/share'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

function Alert({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-stamp">
      {message}
    </p>
  )
}

function TypePicker({ value, onChange }: { value: BoardType; onChange: (value: BoardType) => void }) {
  const options: { id: BoardType; title: string; body: string }[] = [
    { id: 'wall', title: '壁報板', body: '貼上文字、圖片或 YouTube，可以自由擺放或整齊排列。' },
    { id: 'canvas', title: '互動畫布', body: '無限畫布上一起加便利貼、文字和簡單圖形。' },
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'rounded-2xl border p-3 text-left',
            value === option.id ? 'border-stamp bg-stamp/5 ring-2 ring-stamp' : 'border-line bg-white',
          )}
        >
          <div className="font-semibold">{option.title}</div>
          <p className="mt-1 text-sm leading-5 text-ink/70">{option.body}</p>
        </button>
      ))}
    </div>
  )
}

export function CreateBoardDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (board: BoardSummary) => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<BoardType>('wall')
  const [groupLabel, setGroupLabel] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<BoardSummary | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) {
      setTitle('')
      setType('wall')
      setGroupLabel('')
      setPassword('')
      setError('')
      setSaving(false)
      setCreated(null)
    }
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('請填寫壁報標題')
      return
    }
    if (password && password.length < 4) {
      setError('學生密碼至少 4 個字元，或留空')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await api<{ board: BoardSummary }>('/api/boards', {
        method: 'POST',
        token: getTeacherToken(),
        body: JSON.stringify({ title: title.trim(), type, groupLabel: groupLabel.trim(), password }),
      })
      setCreated(result.board)
      onCreated(result.board)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '建立失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {created ? (
          <ShareBody
            board={created}
            password={password}
            title="壁報已建立"
            description="請現在把連結和密碼交給學生。密碼之後不能再查看，忘記可在設定重設。"
            extra={
              <Button type="button" onClick={() => navigate(`/b/${created.id}`)}>
                開啟這塊壁報
              </Button>
            }
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>新增壁報</DialogTitle>
              <DialogDescription>每塊壁報有自己的連結。組別用來標示第1組、第2組，學生不用登入。</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(event) => void submit(event)}>
              <div className="space-y-2">
                <Label htmlFor="board-title">壁報標題</Label>
                <Input id="board-title" value={title} maxLength={40} placeholder="例如：校園植物觀察" onChange={(event) => setTitle(event.target.value)} />
              </div>
              <TypePicker value={type} onChange={setType} />
              <div className="space-y-2">
                <Label htmlFor="group-label">組別（選填）</Label>
                <Input id="group-label" value={groupLabel} maxLength={20} placeholder="例如：第1組" onChange={(event) => setGroupLabel(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-password">學生密碼（選填）</Label>
                <Input
                  id="student-password"
                  type="text"
                  autoComplete="off"
                  value={password}
                  maxLength={32}
                  placeholder="留空表示知道連結的人都可以進入"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Alert message={error} />
              <Button type="submit" size="lg" disabled={saving} className="w-full">
                {saving ? '建立中…' : '建立壁報'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function BoardSettingsDialog({
  board,
  open,
  onOpenChange,
  onChanged,
  onDeleted,
}: {
  board: Board | BoardSummary | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: (board: Board) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [revealed, setRevealed] = useState('')

  useEffect(() => {
    if (!board || !open) return
    setTitle(board.title)
    setGroupLabel(board.groupLabel ?? '')
    setPassword('')
    setClearPassword(false)
    setLocked(board.locked)
    setError('')
    setConfirming(false)
    setRevealed('')
    // Reset only when the dialog opens or the board changes, not on every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, board?.id])

  if (!board) return null

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('請填寫壁報標題')
      return
    }
    if (password && password.length < 4) {
      setError('新密碼至少 4 個字元')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await api<{ board: Board }>(`/api/boards/${board!.id}`, {
        method: 'PATCH',
        token: getTeacherToken(),
        body: JSON.stringify({
          title: title.trim(),
          groupLabel: groupLabel.trim(),
          locked,
          ...(clearPassword ? { clearPassword: true } : {}),
          ...(password ? { password } : {}),
        }),
      })
      onChanged(result.board)
      if (password) setRevealed(password)
      else onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError('')
    try {
      await api(`/api/boards/${board!.id}`, { method: 'DELETE', token: getTeacherToken() })
      onOpenChange(false)
      onDeleted(board!.id)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '刪除失敗')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {revealed ? (
          <ShareBody
            board={{ id: board.id, title, groupLabel: groupLabel.trim() || null }}
            password={revealed}
            title="新密碼已設定"
            description="請現在抄給學生。關閉後不能再查看這組密碼。"
          />
        ) : confirming ? (
          <>
            <DialogHeader>
              <DialogTitle>刪除這塊壁報？</DialogTitle>
              <DialogDescription>「{board.title}」和裡面的貼文會一併刪除，已分享的連結會失效。</DialogDescription>
            </DialogHeader>
            <Alert message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                返回
              </Button>
              <Button type="button" variant="destructive" disabled={saving} onClick={() => void remove()}>
                {saving ? '刪除中…' : '確定刪除'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>壁報設定</DialogTitle>
              <DialogDescription>可以改名稱、組別、密碼，或鎖定後只讓學生觀看。</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(event) => void save(event)}>
              <div className="space-y-2">
                <Label htmlFor="edit-title">壁報標題</Label>
                <Input id="edit-title" value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-group">組別（選填）</Label>
                <Input id="edit-group" value={groupLabel} maxLength={20} onChange={(event) => setGroupLabel(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">新密碼</Label>
                <Input
                  id="edit-password"
                  type="text"
                  autoComplete="off"
                  value={password}
                  maxLength={32}
                  disabled={clearPassword}
                  placeholder={board.hasPassword ? '留空代表不更改' : '目前沒有密碼'}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {board.hasPassword && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={clearPassword} onChange={(event) => setClearPassword(event.target.checked)} />
                  移除密碼，之後只憑連結即可進入
                </label>
              )}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-3 py-3">
                <div>
                  <div className="font-medium">鎖定壁報</div>
                  <p className="text-sm text-ink/65">鎖定後學生只能觀看，不能新增或移動。</p>
                </div>
                <Switch checked={locked} onCheckedChange={setLocked} aria-label="鎖定壁報" />
              </div>
              <Alert message={error} />
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
                  刪除
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? '儲存中…' : '儲存'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ShareDialog({
  board,
  password,
  open,
  onOpenChange,
}: {
  board: { id: string; title: string; groupLabel: string | null } | null
  password?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!board) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ShareBody
          board={board}
          password={password}
          title="分享給學生"
          description={
            password
              ? '把下面的訊息交給這一組。'
              : '如果這塊壁報設了密碼，請用你告訴學生的那一組。密碼不會再顯示，忘記可在設定重設。'
          }
        />
      </DialogContent>
    </Dialog>
  )
}

function ShareBody({
  board,
  password,
  title,
  description,
  extra,
}: {
  board: { id: string; title: string; groupLabel: string | null }
  password?: string
  title: string
  description: string
  extra?: ReactNode
}) {
  const message = shareMessage(board, password)
  const [copied, setCopied] = useState(false)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <textarea readOnly value={message} rows={6} className="w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm" />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {extra}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void copyText(message).then((ok) => {
              if (ok) {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              }
            })
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? '已複製' : '複製訊息'}
        </Button>
      </div>
    </>
  )
}
