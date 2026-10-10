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
          <DialogTitle>你叫咩名？</DialogTitle>
          <DialogDescription>其他同學會見到呢個名。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const next = name.trim()
            if (!next) {
              setError('請寫低你的名')
              return
            }
            onSave(next)
            onOpenChange(false)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nickname">你的名</Label>
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
            <p role="alert" className="rounded-2xl bg-red-50 px-3 py-3 text-base text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full">
            開始
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
