import { Image as ImageIcon, Type, Youtube } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { NOTE_COLORS, NOTE_COLOR_LABELS, isNoteColor } from '../../shared/colors'
import { extractYouTubeId } from '../../shared/media'
import type { Post, PostKind } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type ComposerInput = {
  kind: PostKind
  body: string
  color: string
  mediaUrl: string
  file: File | null
}

// TODO: 錄音與 Spotify 留待下一版，介面暫時不顯示，避免學生以為已經可用。

export function PostComposer({
  open,
  initial,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  initial?: Post | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ComposerInput) => Promise<void>
}) {
  const [kind, setKind] = useState<PostKind>(initial?.kind ?? 'text')
  const [body, setBody] = useState(initial?.body ?? '')
  const [color, setColor] = useState(initial?.color && isNoteColor(initial.color) ? initial.color : NOTE_COLORS[0])
  const [mediaUrl, setMediaUrl] = useState(
    initial?.kind === 'youtube' && initial.mediaUrl
      ? `https://youtu.be/${initial.mediaUrl}`
      : initial?.kind === 'image' && initial.mediaUrl?.startsWith('http')
        ? initial.mediaUrl
        : '',
  )
  const existingImage = initial?.kind === 'image' ? initial.mediaUrl : null
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(initial?.kind === 'image' ? initial.mediaUrl : null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(initial)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const youtubeId = kind === 'youtube' ? extractYouTubeId(mediaUrl) : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (kind === 'text' && !body.trim()) {
      setError('請寫下內容')
      return
    }
    if (kind === 'image' && !file && !mediaUrl.trim() && !existingImage) {
      setError('請上傳圖片或貼上圖片網址')
      return
    }
    if (kind === 'youtube' && !extractYouTubeId(mediaUrl)) {
      setError('請貼上有效的 YouTube 連結')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit({
        kind,
        body: body.trim(),
        color,
        mediaUrl: kind === 'image' ? mediaUrl.trim() || existingImage || '' : mediaUrl.trim(),
        file,
      })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? '編輯貼文' : '貼咩？'}</DialogTitle>
          <DialogDescription>{editing ? '改完再貼上去。' : '揀一種，然後寫低內容。'}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          {!editing && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KindButton active={kind === 'text'} icon={<Type className="h-7 w-7" />} label="文字" onClick={() => setKind('text')} />
              <KindButton active={kind === 'image'} icon={<ImageIcon className="h-7 w-7" />} label="圖片" onClick={() => setKind('image')} />
              <KindButton active={kind === 'youtube'} icon={<Youtube className="h-7 w-7" />} label="YouTube" onClick={() => setKind('youtube')} />
            </div>
          )}

          {kind === 'image' && (
            <div className="space-y-2">
              <Label htmlFor="image-file">圖片</Label>
              <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-line bg-paper px-4 text-base font-semibold">
                {file ? file.name : '選擇圖片'}
                <input
                  id="image-file"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null
                    setFile(next)
                    if (next) setMediaUrl('')
                  }}
                />
              </label>
              <Input
                value={mediaUrl}
                placeholder="或貼上圖片網址 https://"
                onChange={(event) => {
                  const value = event.target.value
                  setMediaUrl(value)
                  setFile(null)
                  setPreview(value.trim() || existingImage)
                }}
              />
              {preview && <img src={preview} alt="" className="max-h-48 rounded-xl object-contain" />}
            </div>
          )}

          {kind === 'youtube' && (
            <div className="space-y-2">
              <Label htmlFor="youtube-url">YouTube 連結</Label>
              <Input id="youtube-url" value={mediaUrl} placeholder="https://www.youtube.com/watch?v=…" onChange={(event) => setMediaUrl(event.target.value)} />
              {youtubeId && (
                <div className="aspect-video overflow-hidden rounded-xl bg-black">
                  <iframe
                    title="YouTube 預覽"
                    src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="post-body">{kind === 'text' ? '內容' : '說明（選填）'}</Label>
            <Textarea
              id="post-body"
              value={body}
              maxLength={kind === 'text' ? 2000 : 500}
              placeholder={kind === 'text' ? '寫下想分享的內容' : '可以加一句說明'}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-base font-semibold">顏色</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_COLORS.map((swatch) => (
                <label key={swatch} className="cursor-pointer">
                  <span className="sr-only">{NOTE_COLOR_LABELS[swatch]}</span>
                  <input type="radio" name="post-color" className="sr-only" checked={color === swatch} onChange={() => setColor(swatch)} />
                  <span
                    className={cn('block h-[52px] w-[52px] rounded-2xl border-4 shadow-sm', color === swatch ? 'border-ink' : 'border-white')}
                    style={{ background: swatch }}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
              {error}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? '請稍等…' : '貼上去'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function KindButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-28 flex-col items-start justify-center gap-2 rounded-2xl border px-4 py-4 text-left text-xl font-semibold',
        active ? 'border-stamp bg-stamp/5 ring-2 ring-stamp' : 'border-line bg-paper',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
