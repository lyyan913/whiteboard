import { Lock, LockOpen, Settings, Share2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { BoardSummary, Workspace } from '../../shared/types'
import { BoardSettingsDialog, CreateBoardDialog, ShareDialog } from '@/components/BoardDialogs'
import { Logo } from '@/components/Logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, clearTeacherToken, getTeacherToken, setTeacherToken } from '@/lib/api'

type MeResponse = { token: string; workspace: Workspace; boards: BoardSummary[] }

export function HomePage() {
  const [booting, setBooting] = useState(true)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState<'create' | 'enter'>('create')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [settings, setSettings] = useState<BoardSummary | null>(null)
  const [share, setShare] = useState<BoardSummary | null>(null)

  useEffect(() => {
    const token = getTeacherToken()
    if (!token) {
      setBooting(false)
      return
    }
    api<MeResponse>('/api/me', { token })
      .then((me) => {
        setTeacherToken(me.token)
        setWorkspace(me.workspace)
        setBoards(me.boards)
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) clearTeacherToken()
        else setLoadError(error instanceof Error ? error.message : '無法打開課室')
      })
      .finally(() => setBooting(false))
  }, [])

  const visible = useMemo(() => {
    const keyword = query.trim()
    if (!keyword) return boards
    return boards.filter((board) => board.title.includes(keyword) || (board.groupLabel ?? '').includes(keyword))
  }, [boards, query])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setFormError('請填寫課室名稱')
      return
    }
    if (pin.length < 4) {
      setFormError('教師密碼至少 4 個字元')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      const path = mode === 'create' ? '/api/workspaces' : '/api/login'
      const result = await api<{ token: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), pin }),
      })
      setTeacherToken(result.token)
      const me = await api<MeResponse>('/api/me', { token: result.token })
      setTeacherToken(me.token)
      setWorkspace(me.workspace)
      setBoards(me.boards)
      setPin('')
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '登入失敗')
    } finally {
      setSubmitting(false)
    }
  }

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-ink/70">正在打開課室…</p>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="order-2 lg:order-1">
          <Logo />
          <h1 className="mt-6 font-serif text-4xl font-bold leading-tight sm:text-5xl">把課室壁報搬到螢幕上</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-ink/75">
            同窗給香港小學老師使用。學生不用註冊，打開連結、輸入密碼，就可以一起貼文。每塊壁報可以標上組別，例如第1組。
          </p>
          <ol className="mt-6 space-y-3 text-sm leading-6">
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stamp text-white">1</span>
              老師建立壁報，選擇壁報板或互動畫布，可加組別和密碼。
            </li>
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stamp text-white">2</span>
              把連結和密碼交給該組學生。
            </li>
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stamp text-white">3</span>
              學生填暱稱，一起貼上文字、圖片或 YouTube。
            </li>
          </ol>
          <div className="cork relative mt-8 hidden min-h-[280px] overflow-hidden rounded-[28px] shadow-xl lg:block">
            <article className="note-card absolute left-8 top-10 w-52 -rotate-2 bg-[#ffe9a0] p-4">
              <span className="tape" />
              <p className="text-sm leading-6">今天觀察到榕樹有很多氣根。</p>
              <p className="mt-3 text-xs text-ink/60">小美 · 第1組</p>
            </article>
            <article className="note-card absolute right-10 top-16 w-48 rotate-2 bg-[#d4e8ff] p-4">
              <span className="tape" />
              <p className="text-sm leading-6">植物怎樣喝水？</p>
              <p className="mt-3 text-xs text-ink/60">YouTube</p>
            </article>
            <article className="note-card absolute bottom-12 left-24 w-56 -rotate-1 bg-[#fffdf8] p-4">
              <span className="tape" />
              <p className="text-sm leading-6">記得寫上自己的名字，同學才知道是誰的發現。</p>
            </article>
            <p className="absolute bottom-3 right-4 text-xs text-white/85">示範，不是真正的貼文</p>
          </div>
        </section>
        <section className="order-1 lg:order-2">
          <form onSubmit={(event) => void submit(event)} className="rounded-[28px] border border-line bg-paper p-6 shadow-xl">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream p-1">
              <button type="button" className={tabClass(mode === 'create')} onClick={() => setMode('create')}>
                建立課室
              </button>
              <button type="button" className={tabClass(mode === 'enter')} onClick={() => setMode('enter')}>
                進入課室
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="class-name">課室名稱</Label>
                <Input id="class-name" value={name} maxLength={30} placeholder="例如：三年甲班" onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-pin">教師密碼</Label>
                <Input
                  id="teacher-pin"
                  type="password"
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  value={pin}
                  maxLength={32}
                  onChange={(event) => setPin(event.target.value)}
                />
                <p className="text-xs leading-5 text-ink/60">至少 4 個字元。請自行記低，忘記後不能找回。</p>
              </div>
              {formError && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-stamp">
                  {formError}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? '處理中…' : mode === 'create' ? '建立並進入' : '進入課室'}
              </Button>
            </div>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-cream/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="min-w-0 text-right">
            <div className="truncate font-serif text-lg font-bold">{workspace.name}</div>
            <button
              type="button"
              className="text-sm text-ink/60 underline-offset-2 hover:underline"
              onClick={() => {
                clearTeacherToken()
                setWorkspace(null)
                setBoards([])
              }}
            >
              登出
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold">本班壁報</h1>
            <p className="mt-1 text-sm text-ink/70">每塊壁報可以指定組別，再用連結分享給學生。</p>
          </div>
          <Button type="button" size="lg" onClick={() => setCreating(true)}>
            新增壁報
          </Button>
        </div>
        {loadError && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-stamp">
            {loadError}
          </p>
        )}
        {boards.length >= 4 && (
          <div className="mt-6 max-w-sm">
            <Label htmlFor="board-search" className="sr-only">
              搜尋壁報
            </Label>
            <Input id="board-search" value={query} placeholder="搜尋標題或組別" onChange={(event) => setQuery(event.target.value)} />
          </div>
        )}
        {boards.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-line bg-paper px-6 py-12 text-center">
            <p className="font-serif text-2xl">尚未有壁報</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/70">建立第一塊壁報，再把連結和密碼交給學生。他們不用註冊帳戶。</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-8 text-sm text-ink/70">沒有符合的壁報。</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((board) => (
              <article key={board.id} className="note-card relative flex flex-col bg-paper p-4 pt-6">
                <span className="tape" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{board.type === 'wall' ? '壁報板' : '互動畫布'}</Badge>
                  {board.groupLabel && <Badge>{board.groupLabel}</Badge>}
                </div>
                <h2 className="mt-3 font-serif text-2xl font-bold">{board.title}</h2>
                <p className="mt-2 flex items-center gap-1 text-sm text-ink/70">
                  {board.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                  {board.hasPassword ? '需要密碼' : '公開連結'}
                  {board.locked ? ' · 已鎖定' : ''}
                  {' · '}
                  {board.type === 'wall' ? `${board.activityCount} 則貼文` : `${board.activityCount} 個物件`}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to={`/b/${board.id}`}>開啟</Link>
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShare(board)}>
                    <Share2 className="h-4 w-4" />
                    分享
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSettings(board)}>
                    <Settings className="h-4 w-4" />
                    設定
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <CreateBoardDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(board) => setBoards((current) => [board, ...current.filter((item) => item.id !== board.id)])}
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
      <ShareDialog
        board={share}
        open={Boolean(share)}
        onOpenChange={(open) => {
          if (!open) setShare(null)
        }}
      />
    </div>
  )
}

function tabClass(active: boolean) {
  return active ? 'rounded-xl bg-white py-2 text-sm font-medium shadow-sm' : 'rounded-xl py-2 text-sm text-ink/70'
}
