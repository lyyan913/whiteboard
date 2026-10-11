import { useEffect, useRef, useState } from 'react'

/** Ids that just appeared after the first paint (or after resetKey changes). */
export function useAppearIds(idKey: string, resetKey = '') {
  const known = useRef(new Set<string>())
  const ready = useRef(false)
  const reset = useRef(resetKey)
  const [pop, setPop] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const ids = idKey ? idKey.split('\u0001') : []
    if (!ready.current || reset.current !== resetKey) {
      ready.current = true
      reset.current = resetKey
      known.current = new Set(ids)
      setPop(new Set())
      return
    }
    const arrived = ids.filter((id) => !known.current.has(id))
    for (const id of ids) known.current.add(id)
    if (arrived.length === 0) return
    setPop((current) => {
      const next = new Set(current)
      for (const id of arrived) next.add(id)
      return next
    })
    const timer = window.setTimeout(() => {
      setPop((current) => {
        const next = new Set(current)
        for (const id of arrived) next.delete(id)
        return next
      })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [idKey, resetKey])

  return pop
}
