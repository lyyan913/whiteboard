import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function NicknameDialog({
  open,
  initial,
  onOpenChange,
  onSave,
}: {
  open: boolean
  initial: string
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initial)
    setError('')
  }, [open, initial])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setName(initial)
          setError('')
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>你的暱稱</DialogTitle>
          <DialogDescription>同學會見到這個名字。關閉這個分頁後要重新填寫，方便共用電腦。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const next = name.trim()
            if (!next) {
              setError('請寫下暱稱')
              return
            }
            onSave(next)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nickname">暱稱</Label>
            <Input
              id="nickname"
              value={name}
              maxLength={20}
              autoFocus
              placeholder="例如：小明"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-stamp">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full">
            儲存暱稱
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
