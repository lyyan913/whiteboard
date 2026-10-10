import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Board, BoardSummary, BoardType } from '../../shared/types'
import { ApiError, api, getTeacherToken } from '@/lib/api'
import { boardUrl, copyText, shareMessage } from '@/lib/share'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

function Alert({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
      {message}
    </p>
  )
}

function TypePicker({ value, onChange }: { value: BoardType; onChange: (value: BoardType) => void }) {
  const options: { id: BoardType; title: string; hint: string }[] = [
    { id: 'wall', title: '壁報板（便利貼）', hint: '' },
    { id: 'canvas', title: '互動畫布（全班同一塊）', hint: '' },
    { id: 'sandbox', title: '作品集', hint: '共同畫布 · 多版面' },
  ]
  return (
    <div className="grid gap-3">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'min-h-28 rounded-2xl border p-4 text-left text-xl font-semibold',
            value === option.id ? 'border-stamp bg-stamp/5 ring-2 ring-stamp' : 'border-line bg-paper',
          )}
        >
          {option.title}
          {option.hint && <span className="mt-1 block text-base font-medium text-muted">{option.hint}</span>}
        </button>
      ))}
      {value === 'sandbox' && <p className="text-base text-muted">老師先開幾個版面。學生開同一條連結，揀版面，小組一齊貼成果。</p>}
    </div>
  )
}

export function CreateBoardDialog({
  open,
  classroomId,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  classroomId?: string
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
  const [advanced, setAdvanced] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
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
      setAdvanced(false)
      setCopiedLink(false)
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
          created.type === 'sandbox' ? (
            <>
              <DialogHeader>
                <DialogTitle>作品集已建立</DialogTitle>
                <DialogDescription>學生開呢條連結，揀版面，小組一齊貼成果。</DialogDescription>
              </DialogHeader>
              <p className="break-all rounded-2xl bg-cream px-4 py-4 text-lg font-semibold text-sky">{boardUrl(created.id)}</p>
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={() => {
                  void copyText(boardUrl(created.id)).then((ok) => {
                    if (!ok) return
                    setCopiedLink(true)
                    window.setTimeout(() => setCopiedLink(false), 2000)
                  })
                }}
              >
                {copiedLink ? '已複製' : '複製連結'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => navigate(classroomId ? `/b/${created.id}?room=${classroomId}` : `/b/${created.id}`)}
              >
                打開作品集
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>已加入這個課室</DialogTitle>
                <DialogDescription>學生打開課室連結，就睇到這塊板和其他人的作品。</DialogDescription>
              </DialogHeader>
              <Button type="button" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
                完成
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="mt-2 w-full"
                onClick={() => navigate(classroomId ? `/b/${created.id}?room=${classroomId}` : `/b/${created.id}`)}
              >
                打開壁報
              </Button>
            </>
          )
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>新建壁報</DialogTitle>
              <DialogDescription>加喺這個課室。學生用同一條課室連結就睇到。</DialogDescription>
            </DialogHeader>
            <form className="space-y-5" onSubmit={(event) => void submit(event)}>
              <div className="space-y-2">
                <Label htmlFor="board-title">① 叫咩名？</Label>
                <Input id="board-title" value={title} maxLength={40} placeholder="例如：校園植物觀察" onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold">② 邊種板？</p>
                <TypePicker value={type} onChange={setType} />
              </div>
              <div>
                <button
                  type="button"
                  className="flex min-h-[52px] w-full items-center text-left text-base font-semibold text-sky"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced((value) => !value)}
                >
                  ③ {advanced ? '收起進階' : '進階（可摺埋）'}
                </button>
                {advanced && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="group-label">組別名稱</Label>
                      <Input id="group-label" value={groupLabel} maxLength={20} placeholder="例如：第1組" onChange={(event) => setGroupLabel(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-password">學生密碼</Label>
                      <Input
                        id="student-password"
                        type="text"
                        autoComplete="off"
                        value={password}
                        maxLength={32}
                        placeholder="可留空"
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
              <Alert message={error} />
              <Button type="submit" size="lg" disabled={saving} className="w-full">
                {saving ? '請稍等…' : '建立壁報'}
              </Button>
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
                取消
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
  const [studentPages, setStudentPages] = useState(false)
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
    setStudentPages(board.allowStudentPages)
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
          allowStudentPages: studentPages,
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
            board={{ id: board.id, title, groupLabel: groupLabel.trim() || null, type: board.type }}
            password={revealed}
            title="新密碼已設定"
            description="而家抄低密碼。關閉後唔會再顯示。"
          />
        ) : confirming ? (
          <>
            <DialogHeader>
              <DialogTitle>刪除這塊壁報？</DialogTitle>
              <DialogDescription>「{board.title}」和裡面的貼文會一併刪除，已分享的連結會失效。</DialogDescription>
            </DialogHeader>
            <Alert message={error} />
              <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => setConfirming(false)}>
                返回
              </Button>
              <Button type="button" variant="destructive" size="lg" disabled={saving} onClick={() => void remove()}>
                {saving ? '請稍等…' : '確定刪除'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>壁報設定</DialogTitle>
              <DialogDescription>
                {board.type === 'sandbox' ? '可以改名稱、組別、密碼，暫停編輯，或者開放學生開新版面。' : '可以改名稱、組別、密碼，或鎖定後只讓學生觀看。'}
              </DialogDescription>
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
              <div className="flex min-h-[52px] items-center justify-between gap-4 rounded-2xl border border-line px-3 py-3">
                <div>
                  <div className="text-base font-semibold">{board.type === 'sandbox' ? '暫停編輯' : '鎖定壁報'}</div>
                  <p className="text-base text-muted">
                    {board.type === 'sandbox' ? '學生只可以睇，未可以改版面入面嘅內容。' : '鎖定後學生只能觀看，不能新增或移動。'}
                  </p>
                </div>
                <Switch checked={locked} onCheckedChange={setLocked} aria-label={board.type === 'sandbox' ? '暫停編輯' : '鎖定壁報'} />
              </div>
              {board.type === 'sandbox' && (
                <div className="flex min-h-[52px] items-center justify-between gap-4 rounded-2xl border border-line px-3 py-3">
                  <div>
                    <div className="text-base font-semibold">學生可開新版面</div>
                    <p className="text-base text-muted">預設關。開咗之後，學生先見到「＋ 新版面」，亦可以改名同刪除自己開嘅版面。</p>
                  </div>
                  <Switch checked={studentPages} onCheckedChange={setStudentPages} aria-label="學生可開新版面" />
                </div>
              )}
              <Alert message={error} />
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
                  刪除
                </Button>
                <Button type="submit" size="lg" disabled={saving}>
                  {saving ? '請稍等…' : '儲存'}
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
  board: { id: string; title: string; groupLabel: string | null; type?: BoardType } | null
  password?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!board) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ShareBody board={board} password={password} title="分享俾學生" description="" />
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
  board: { id: string; title: string; groupLabel: string | null; hasPassword?: boolean; type?: BoardType }
  password?: string
  title: string
  description: string
  extra?: ReactNode
}) {
  const url = boardUrl(board.id)
  const message = shareMessage(board, password)
  const [copied, setCopied] = useState<'link' | 'password' | 'all' | null>(null)

  function flash(kind: 'link' | 'password' | 'all') {
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">投影呢個畫面，叫學生掃／開連結。</DialogDescription>
        )}
      </DialogHeader>
      <p className="mb-3 text-lg font-semibold">投影呢個畫面，叫學生掃／開連結。</p>
      {board.type === 'sandbox' && <p className="mb-3 text-lg">學生開呢條連結，揀版面，小組一齊貼成果。</p>}
      <div className="space-y-3">
        <p className="text-base font-semibold">① 學生連結</p>
        <p className="break-all rounded-2xl bg-cream px-4 py-4 text-lg font-semibold text-sky">{url}</p>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => {
            void copyText(url).then((ok) => {
              if (ok) flash('link')
            })
          }}
        >
          {copied === 'link' ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          {copied === 'link' ? '已複製' : '複製連結'}
        </Button>
        {password ? (
          <>
            <p className="text-base font-semibold">② 學生密碼</p>
            <p className="rounded-2xl border border-line px-4 py-4 text-center text-3xl font-bold tracking-wide">{password}</p>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => {
                void copyText(password).then((ok) => {
                  if (ok) flash('password')
                })
              }}
            >
              {copied === 'password' ? '已複製' : '複製密碼'}
            </Button>
          </>
        ) : (
          <p className="text-base text-muted">
            {board.hasPassword ? '學生密碼已設定。呢度唔會再顯示，忘記可以喺設定重設。' : '未設學生密碼，打開連結就可以入。'}
          </p>
        )}
        <button
          type="button"
          className="min-h-[52px] w-full text-base font-semibold text-sky"
          onClick={() => {
            void copyText(message).then((ok) => {
              if (ok) flash('all')
            })
          }}
        >
          {copied === 'all' ? '已複製' : '複製全部訊息'}
        </button>
        {extra}
      </div>
    </>
  )
}
