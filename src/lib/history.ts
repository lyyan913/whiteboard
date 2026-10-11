import { useCallback, useRef, useState } from 'react'
import type { CanvasItem, ItemCreate } from '../../shared/types'

export type HistoryOp =
  | { type: 'create'; item: CanvasItem }
  | { type: 'patch'; id: string; before: Partial<CanvasItem>; after: Partial<CanvasItem> }

type HistoryDeps = {
  onCreate: (input: ItemCreate) => Promise<CanvasItem | null>
  onUpdate: (id: string, patch: Partial<CanvasItem>) => Promise<void> | void
  onLocal: (id: string, patch: Partial<CanvasItem>) => void
  onRemove: (id: string) => Promise<boolean>
}

export function useEditHistory(deps: HistoryDeps) {
  const depsRef = useRef(deps)
  depsRef.current = deps
  const past = useRef<HistoryOp[]>([])
  const future = useRef<HistoryOp[]>([])
  const applying = useRef(false)
  const [rev, setRev] = useState(0)
  const bump = () => setRev((value) => value + 1)

  const note = useCallback((op: HistoryOp) => {
    if (applying.current) return
    past.current.push(op)
    if (past.current.length > 100) past.current.shift()
    future.current = []
    bump()
  }, [])

  const reset = useCallback(() => {
    past.current = []
    future.current = []
    bump()
  }, [])

  const run = useCallback(async (op: HistoryOp, direction: 'undo' | 'redo') => {
    const { onCreate, onUpdate, onLocal, onRemove } = depsRef.current
    applying.current = true
    try {
      if (op.type === 'create') {
        if (direction === 'undo') return onRemove(op.item.id)
        const restored = await onCreate({
          id: op.item.id,
          kind: op.item.kind,
          x: op.item.x,
          y: op.item.y,
          w: op.item.w,
          h: op.item.h,
          color: op.item.color,
          text: op.item.text,
          fontSize: op.item.fontSize,
        })
        if (!restored) return false
        op.item = restored
        return true
      }
      const patch = direction === 'undo' ? op.before : op.after
      onLocal(op.id, patch)
      await onUpdate(op.id, patch)
      return true
    } catch {
      return false
    } finally {
      applying.current = false
    }
  }, [])

  const undo = useCallback(async () => {
    const op = past.current.pop()
    if (!op) return
    const ok = await run(op, 'undo')
    if (ok) future.current.push(op)
    else past.current.push(op)
    bump()
  }, [run])

  const redo = useCallback(async () => {
    const op = future.current.pop()
    if (!op) return
    const ok = await run(op, 'redo')
    if (ok) past.current.push(op)
    else future.current.push(op)
    bump()
  }, [run])

  return {
    note,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    rev,
  }
}
