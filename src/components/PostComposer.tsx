import { Image as ImageIcon, Music, Type, Youtube } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { NOTE_COLORS, NOTE_COLOR_LABELS, isNoteColor } from '../../shared/colors'
import { extractYouTubeId } from '../../shared/media'
import type { Post, PostKind } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

// TODO: 錄音與 Spotify 嵌入留待下一版。入口先顯示「即將推出」，避免老師以為已經可用。
const FUTURE = [
  { label: '錄音', hint: '即將推出' },
  { label: 'Spotify', hint: '即將推出' },
]

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
          <DialogTitle>{editing ? '編輯貼文' : '新增貼文'}</DialogTitle>
          <DialogDescription>文字、圖片或 YouTube 都可以貼上壁報。同學在線時會即時看到。</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          {!editing && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <KindButton active={kind === 'text'} icon={<Type className="h-4 w-4" />} label="文字" onClick={() => setKind('text')} />
              <KindButton active={kind === 'image'} icon={<ImageIcon className="h-4 w-4" />} label="圖片" onClick={() => setKind('image')} />
              <KindButton active={kind === 'youtube'} icon={<Youtube className="h-4 w-4" />} label="YouTube" onClick={() => setKind('youtube')} />
              {FUTURE.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled
                  className="rounded-2xl border border-dashed border-line px-3 py-3 text-left text-ink/45"
                >
                  <Music className="mb-1 h-4 w-4" />
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="text-xs">{item.hint}</span>
                </button>
              ))}
            </div>
          )}

          {kind === 'image' && (
            <div className="space-y-2">
              <Label htmlFor="image-file">圖片</Label>
              <input
                id="image-file"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="block w-full text-sm"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null
                  setFile(next)
                  if (next) setMediaUrl('')
                }}
              />
              <InputLike
                value={mediaUrl}
                placeholder="或貼上圖片網址 https://"
                onChange={(value) => {
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
              <InputLike id="youtube-url" value={mediaUrl} placeholder="https://www.youtube.com/watch?v=…" onChange={setMediaUrl} />
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
            <legend className="mb-2 text-sm font-medium">顏色</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_COLORS.map((swatch) => (
                <label key={swatch} className="cursor-pointer">
                  <span className="sr-only">{NOTE_COLOR_LABELS[swatch]}</span>
                  <input type="radio" name="post-color" className="sr-only" checked={color === swatch} onChange={() => setColor(swatch)} />
                  <span
                    className={cn('block h-8 w-8 rounded-full border-2 shadow-sm', color === swatch ? 'border-ink' : 'border-white')}
                    style={{ background: swatch }}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-stamp">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '儲存中…' : editing ? '儲存變更' : '貼上壁報'}
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
      className={cn('rounded-2xl border px-3 py-3 text-left', active ? 'border-stamp bg-stamp/5 ring-2 ring-stamp' : 'border-line bg-white')}
    >
      {icon}
      <span className="mt-1 block text-sm font-medium">{label}</span>
    </button>
  )
}

function InputLike({
  id,
  value,
  placeholder,
  onChange,
}: {
  id?: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <input
      id={id}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-11 w-full rounded-xl border border-line bg-white px-3 text-base shadow-sm outline-none placeholder:text-ink/40 focus:border-leaf focus:ring-2 focus:ring-leaf/30"
    />
  )
}
