import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ClassroomBoard, Role, Workspace } from '../../shared/types'
import { BoardSettingsDialog, CreateBoardDialog } from '@/components/BoardDialogs'
import { Logo } from '@/components/Logo'
import { MenuItem, PopoverMenu } from '@/components/PopoverMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, clearTeacherToken, getTeacherToken, setTeacherToken } from '@/lib/api'
import { classroomUrl, copyText } from '@/lib/share'

type ClassroomResponse = { workspace: Workspace; role: Role; boards: ClassroomBoard[] }

export function ClassroomPage() {
  const { workspaceId = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [role, setRole] = useState<Role>('student')
  const [boards, setBoards] = useState<ClassroomBoard[]>([])
  const [creating, setCreating] = useState(false)
  const [settings, setSettings] = useState<ClassroomBoard | null>(null)
  const [copied, setCopied] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const navigate = useNavigate()

  function load(token = getTeacherToken()) {
    setLoading(true)
    setError('')
    api<ClassroomResponse>(`/api/classrooms/${workspaceId}`, { token })
      .then((result) => {
        if (result.role === 'teacher' && token) setTeacherToken(token)
        setWorkspace(result.workspace)
        setRole(result.role)
        setBoards(result.boards)
        setMissing(false)
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 404) setMissing(true)
        else setError(caught instanceof Error ? caught.message : '無法打開課室')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Reload when the classroom id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream">
        <p className="text-lg text-muted">請稍等…</p>
      </div>
    )
  }

  if (missing || !workspace) {
    return (
      <div className="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <Logo />
          <h1 className="mt-6 font-serif text-3xl font-bold">找不到這個課室</h1>
          <p className="mt-3 text-lg text-muted">{error || '請向老師核對連結。'}</p>
        </div>
      </div>
    )
  }

  const link = classroomUrl(workspace.id)
  const teacher = role === 'teacher'

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          {teacher && (
            <button
              type="button"
              className="min-h-11 text-base font-semibold text-sky"
              onClick={() => {
                clearTeacherToken()
                setRole('student')
              }}
            >
              登出
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-bold">{workspace.name}</h1>
            <p className="mt-1 text-lg text-muted">一個連結入面有所有壁報。學生打開就睇到其他人的作品。</p>
          </div>
          {teacher && (
            <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setCreating(true)}>
              ＋ 新建壁報
            </Button>
          )}
        </div>

        <section className="mt-6 rounded-2xl border border-line bg-paper p-5">
          <p className="text-base font-semibold">課室連結</p>
          <p className="mt-2 break-all text-lg font-semibold text-sky">{link}</p>
          <Button
            type="button"
            size="lg"
            className="mt-4 w-full sm:w-auto"
            onClick={() => {
              void copyText(link).then((ok) => {
                if (!ok) return
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              })
            }}
          >
            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            {copied ? '已複製' : '複製課室連結'}
          </Button>
          {!teacher && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base text-muted">你而家看到全班的壁報。撳一塊板，就可以看裡面所有人的作品。</p>
              <Button type="button" variant="outline" onClick={() => setLoginOpen(true)}>
                我係老師
              </Button>
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
            {error}
          </p>
        )}

        {boards.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line bg-paper px-6 py-10">
            <ol className="space-y-3 text-lg">
              <li>① 老師撳「＋ 新建壁報」</li>
              <li>② 把上面這個課室連結交給學生</li>
              <li>③ 學生打開就看到所有人的作品</li>
            </ol>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {boards.map((board) => (
              <article key={board.id} className="relative rounded-2xl border border-line bg-paper p-5 shadow-sm">
                <Link
                  to={`/b/${board.id}?room=${workspace.id}`}
                  className="absolute inset-0 rounded-2xl"
                  aria-label={`打開壁報 ${board.title}`}
                />
                <div className={teacher ? 'pointer-events-none relative pr-14' : 'pointer-events-none relative'}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{board.type === 'wall' ? '壁報板' : board.type === 'sandbox' ? '作品集' : '畫布'}</Badge>
                    {board.groupLabel && <Badge>{board.groupLabel}</Badge>}
                    {board.locked && <Badge>{board.type === 'sandbox' ? '暫停編輯' : '已鎖定'}</Badge>}
                  </div>
                  <h2 className="mt-3 font-serif text-3xl font-bold">{board.title}</h2>
                  <p className="mt-2 text-base text-muted">
                    {board.type === 'wall'
                      ? `${board.activityCount} 則貼文`
                      : board.type === 'sandbox'
                        ? `${board.activityCount} 個版面`
                        : `${board.activityCount} 個物件`}
                  </p>
                  <div className="mt-4 space-y-1">
                    <p className="text-sm font-semibold text-ink">其他人的作品</p>
                    {board.works.length === 0 ? (
                      <p className="text-base text-muted">未有作品</p>
                    ) : (
                      board.works.map((work, index) => (
                        <p key={`${work.authorName}-${index}`} className="truncate text-base">
                          <span className="font-semibold">{work.authorName}</span>
                          <span className="text-muted">：{work.text}</span>
                        </p>
                      ))
                    )}
                  </div>
                  <p className="mt-4 text-base font-semibold text-stamp">打開壁報</p>
                </div>
                {teacher && (
                  <div className="absolute right-2 top-2 z-10">
                    <PopoverMenu icon label="更多">
                      <MenuItem onClick={() => setSettings(board)}>設定</MenuItem>
                    </PopoverMenu>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
      <TeacherLogin
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onLoggedIn={(id, token) => {
          setTeacherToken(token)
          if (id === workspace.id) load(token)
          else navigate(`/c/${id}`)
        }}
      />
      {teacher && (
        <>
          <CreateBoardDialog
            open={creating}
            classroomId={workspace.id}
            onOpenChange={setCreating}
            onCreated={(board) =>
              setBoards((current) => [{ ...board, works: [] }, ...current.filter((item) => item.id !== board.id)])
            }
          />
          <BoardSettingsDialog
            board={settings}
            open={Boolean(settings)}
            onOpenChange={(open) => {
              if (!open) setSettings(null)
            }}
            onChanged={(board) => {
              setBoards((current) => current.map((item) => (item.id === board.id ? { ...item, ...board } : item)))
              setSettings((current) => (current && current.id === board.id ? { ...current, ...board } : current))
            }}
            onDeleted={(id) => setBoards((current) => current.filter((item) => item.id !== id))}
          />
        </>
      )}
    </div>
  )
}

function TeacherLogin({
  open,
  onOpenChange,
  onLoggedIn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLoggedIn: (workspaceId: string, token: string) => void
}) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await api<{ token: string; workspace: Workspace }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), pin }),
      })
      onOpenChange(false)
      onLoggedIn(result.workspace.id, result.token)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '登入失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>老師登入</DialogTitle>
          <DialogDescription>登入之後就可以在這個連結裡面新建壁報。</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <Label htmlFor="room-class-name">課室名稱</Label>
            <Input id="room-class-name" value={name} maxLength={30} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room-pin">老師密碼</Label>
            <Input id="room-pin" type="password" value={pin} maxLength={32} onChange={(event) => setPin(event.target.value)} />
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? '請稍等…' : '進入課室'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
