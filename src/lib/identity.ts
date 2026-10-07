import { useState } from 'react'
import { readStorage, writeStorage } from '@/lib/utils'

const NICK = 'tongchung.nickname'
const CLIENT = 'tongchung.clientId'

export function useIdentity() {
  const [nickname, setNickname] = useState(() => readStorage(sessionStorage, NICK))
  const [clientId] = useState(() => {
    const existing = readStorage(sessionStorage, CLIENT)
    if (existing) return existing
    const created = crypto.randomUUID()
    writeStorage(sessionStorage, CLIENT, created)
    return created
  })

  function saveNickname(name: string) {
    const next = name.trim().slice(0, 20)
    writeStorage(sessionStorage, NICK, next)
    setNickname(next)
    return next
  }

  return { nickname, clientId, saveNickname }
}
