import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import type { DropPageInfo } from '../../shared/types'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { prepareImageFile } from '@/lib/imageFile'

export function DropPage() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<DropPageInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [name, setName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    setMissing(false)
    setInfo(null)
    void api<DropPageInfo>(`/api/u/${encodeURIComponent(token)}`)
      .then((page) => {
        if (!cancelled) setInfo(page)
      })
      .catch((caught) => {
        if (cancelled) return
        if (caught instanceof ApiError && caught.status === 404) setMissing(true)
        else setError(caught instanceof ApiError ? caught.message : '暫時打唔開')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!info || files.length === 0) {
      setError('請先揀相或 PDF')
      return
    }
    setBusy(true)
    setError('')
    try {
      for (const file of files) {
        const prepared = await prepareDropFile(file)
        const body = new FormData()
        body.append('file', prepared)
        body.append('name', name.trim())
        if (info.hasPassword) body.append('password', password)
        await api(`/api/u/${encodeURIComponent(token)}`, { method: 'POST', body })
      }
      setDone(true)
      setFiles([])
      setUnlocked(true)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '上載失敗'
      setError(message)
      if (message.includes('暫停')) setInfo((prev) => (prev ? { ...prev, paused: true } : prev))
      if (message.includes('密碼')) setUnlocked(false)
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl font-bold">找不到這個上載頁</h1>
        <p className="mt-3 text-lg text-muted">請老師再顯示「掃碼交作品」。</p>
      </Shell>
    )
  }

  if (!info) {
    return (
      <Shell>
        <p className="text-lg text-muted">{error || '請稍等…'}</p>
      </Shell>
    )
  }

  if (info.paused) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl font-bold">{info.title}</h1>
        <p className="mt-4 text-lg">老師暫停咗上載。請遲啲再交。</p>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <h1 className="font-serif text-4xl font-bold">已交俾老師 ✅</h1>
        <p className="mt-3 text-lg text-muted">檔案已放進老師的「學生上載」資料夾。24 小時後會自動刪除；老師放上板的副本會留低。</p>
        <Button
          type="button"
          size="lg"
          className="mt-6 w-full"
          onClick={() => {
            setDone(false)
            setError('')
          }}
        >
          再交一份
        </Button>
      </Shell>
    )
  }

  if (info.hasPassword && !unlocked) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl font-bold">{info.title}</h1>
        <p className="mt-2 text-lg text-muted">問老師攞密碼，然後先交作品。</p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (password.trim().length < 4) {
              setError('請輸入學生密碼')
              return
            }
            setError('')
            setUnlocked(true)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="drop-password">學生密碼</Label>
            <Input id="drop-password" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error && <Alert message={error} />}
          <Button type="submit" size="lg" className="w-full">
            繼續
          </Button>
        </form>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="font-serif text-3xl font-bold">交作品</h1>
      <p className="mt-2 text-lg text-muted">{info.title}</p>
      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="space-y-2">
          <Label htmlFor="drop-name">你叫咩名？</Label>
          <Input id="drop-name" maxLength={20} placeholder="可留空" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <label className="relative flex min-h-16 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-stamp px-4 text-lg font-semibold text-white">
          揀相／檔案
          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            multiple
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []))
              setError('')
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1 text-base">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`} className="truncate rounded-xl bg-cream px-3 py-2">
                {file.name}
              </li>
            ))}
          </ul>
        )}
        {error && <Alert message={error} />}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? '上載中…' : '上載'}
        </Button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-cream px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-sm">
        <Logo />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function Alert({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
      {message}
    </p>
  )
}

async function prepareDropFile(file: File) {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (pdf) {
    if (file.size < 5) throw new Error('請再選一次檔案')
    if (file.size > 12 * 1024 * 1024) throw new Error('檔案不能超過 12MB')
    return file
  }
  return prepareImageFile(file)
}
