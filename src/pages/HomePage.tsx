import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Workspace } from '../../shared/types'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api, clearTeacherToken, getTeacherToken, setTeacherToken } from '@/lib/api'

type MeResponse = { token: string; workspace: Workspace }
type Audience = 'pick' | 'teacher' | 'student'

export function HomePage() {
  const navigate = useNavigate()
  const [booting, setBooting] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [audience, setAudience] = useState<Audience>('pick')
  const [mode, setMode] = useState<'create' | 'enter'>('create')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [studentLink, setStudentLink] = useState('')
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    const token = getTeacherToken()
    if (!token) {
      setBooting(false)
      return
    }
    api<MeResponse>('/api/me', { token })
      .then((me) => {
      setTeacherToken(me.token)
      navigate(`/c/${me.workspace.id}`, { replace: true })
    })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) clearTeacherToken()
        else setLoadError(error instanceof Error ? error.message : '無法打開課室')
      })
      .finally(() => setBooting(false))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setFormError('請填寫課室名稱')
      return
    }
    if (pin.length < 4) {
      setFormError('老師密碼最少 4 個字')
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
      navigate(`/c/${me.workspace.id}`)
      return
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '登入失敗')
    } finally {
      setSubmitting(false)
    }
  }

  function openStudentLink(event: FormEvent) {
    event.preventDefault()
    const text = studentLink.trim()
    const room = text.match(/\/c\/([A-Za-z0-9_-]+)/)
    const board = text.match(/\/b\/([A-Za-z0-9_-]+)/)
    if (room) {
      setLinkError('')
      navigate(`/c/${room[1]}`)
      return
    }
    if (board) {
      setLinkError('')
      navigate(`/b/${board[1]}`)
      return
    }
    setLinkError('請貼上老師分享嘅課室連結')
  }

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream">
        <p className="text-lg text-muted">請稍等…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-4 py-8">
        <Logo />
        <h1 className="mt-6 font-serif text-4xl font-bold sm:text-5xl">課堂壁報板</h1>
        {loadError && (
          <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
            {loadError}
          </p>
        )}
        {audience === 'pick' && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setAudience('teacher')
                setMode('create')
                setFormError('')
              }}
              className="flex min-h-64 flex-col rounded-2xl border border-line bg-paper p-6 text-left shadow-sm"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-stamp text-xl font-bold text-white">①</span>
              <span className="mt-4 font-serif text-3xl font-bold">我係老師</span>
              <span className="mt-2 text-lg text-muted">建立／管理課室</span>
              <span className="mt-auto inline-flex h-14 items-center justify-center rounded-2xl bg-stamp text-base font-semibold text-white">開始</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAudience('student')
                setLinkError('')
              }}
              className="flex min-h-64 flex-col rounded-2xl border border-line bg-paper p-6 text-left shadow-sm"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-sky text-xl font-bold text-white">②</span>
              <span className="mt-4 font-serif text-3xl font-bold">我係學生</span>
              <span className="mt-2 text-lg text-muted">用連結入壁報</span>
              <span className="mt-auto inline-flex h-14 items-center justify-center rounded-2xl border border-line text-base font-semibold text-ink">我有連結</span>
            </button>
          </div>
        )}
        {audience === 'teacher' && (
          <form onSubmit={(event) => void submit(event)} className="mt-8 max-w-xl rounded-2xl border border-line bg-paper p-6 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" className={modeCard(mode === 'create')} onClick={() => setMode('create')}>
                建立新課室
              </button>
              <button type="button" className={modeCard(mode === 'enter')} onClick={() => setMode('enter')}>
                進入已有課室
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="class-name">課室名稱</Label>
                <Input id="class-name" value={name} maxLength={30} placeholder="例如：三年甲班" onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-pin">{mode === 'create' ? '老師密碼（最少 4 個字）' : '老師密碼'}</Label>
                <Input
                  id="teacher-pin"
                  type="password"
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  value={pin}
                  maxLength={32}
                  onChange={(event) => setPin(event.target.value)}
                />
                <p className="text-base text-muted">密碼請自己記住，唔好同學生講老師密碼。</p>
              </div>
              {formError && (
                <p role="alert" className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
                  {formError}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? '請稍等…' : mode === 'create' ? '建立並進入' : '進入課室'}
              </Button>
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setAudience('pick')}>
                返回
              </Button>
            </div>
          </form>
        )}
        {audience === 'student' && (
          <form onSubmit={openStudentLink} className="mt-8 max-w-xl rounded-2xl border border-line bg-paper p-6 shadow-sm">
            <h2 className="font-serif text-3xl font-bold">我係學生</h2>
            <p className="mt-2 text-lg text-muted">請用老師分享嘅課室連結。入面可以看到所有人的作品。</p>
            <div className="mt-5 space-y-2">
              <Label htmlFor="student-link">貼上連結</Label>
              <Input
                id="student-link"
                value={studentLink}
                placeholder="貼上老師俾你嘅連結"
                onChange={(event) => setStudentLink(event.target.value)}
              />
            </div>
            {linkError && (
              <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
                {linkError}
              </p>
            )}
            <Button type="submit" size="lg" className="mt-4 w-full">
              打開課室
            </Button>
            <p className="mt-4 text-base text-muted">或者直接用瀏覽器打開老師連結。</p>
            <Button type="button" variant="outline" size="lg" className="mt-4 w-full" onClick={() => setAudience('pick')}>
              返回
            </Button>
          </form>
        )}
    </div>
  )
}

function modeCard(active: boolean) {
  return active
    ? 'flex min-h-14 items-center justify-center rounded-2xl border-2 border-stamp bg-stamp/5 px-3 text-base font-semibold'
    : 'flex min-h-14 items-center justify-center rounded-2xl border border-line bg-paper px-3 text-base font-semibold'
}
