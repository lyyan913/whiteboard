import { Redo2, Undo2 } from 'lucide-react'

export function DockHistory({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <>
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        aria-label="復原上一筆"
        title="復原上一筆"
        className="dock-undo pressable grid h-14 min-w-[5.75rem] shrink-0 place-items-center rounded-xl px-3 text-base font-bold hover:bg-white/70 disabled:opacity-40"
      >
        <Undo2 className="dock-undo-icon h-5 w-5" aria-hidden />
        <span className="dock-undo-label">復原上一筆</span>
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        aria-label="重做"
        title="重做"
        className="dock-undo pressable grid h-14 min-w-16 shrink-0 place-items-center rounded-xl px-3 text-base font-bold hover:bg-white/70 disabled:opacity-40"
      >
        <Redo2 className="dock-undo-icon h-5 w-5" aria-hidden />
        <span className="dock-undo-label">重做</span>
      </button>
    </>
  )
}
