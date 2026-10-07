import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, Person, ServerMessage } from '../../shared/types'

export function useBoardSocket(
  token: string | null,
  onMessage: (message: ServerMessage) => void,
  onExpired: () => void,
) {
  const [status, setStatus] = useState<'off' | 'connecting' | 'live'>('off')
  const [people, setPeople] = useState<Person[]>([])
  const onMessageRef = useRef(onMessage)
  const onExpiredRef = useRef(onExpired)
  const socketRef = useRef<WebSocket | null>(null)
  onMessageRef.current = onMessage
  onExpiredRef.current = onExpired

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(message))
  }, [])

  useEffect(() => {
    if (!token) {
      setStatus('off')
      setPeople([])
      return
    }
    let stopped = false
    let retry = 0
    let socket: WebSocket | null = null

    const connect = () => {
      if (stopped) return
      setStatus('connecting')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`)
      socketRef.current = socket
      socket.onopen = () => {
        if (!stopped) setStatus('live')
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage
          if (message.type === 'presence') setPeople(message.people)
          else onMessageRef.current(message)
        } catch {
          /* ignore malformed frames */
        }
      }
      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null
        if (stopped) return
        if (event.code === 4001) {
          setStatus('off')
          onExpiredRef.current()
          return
        }
        setStatus('connecting')
        retry = window.setTimeout(connect, 1500)
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      stopped = true
      window.clearTimeout(retry)
      socket?.close()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [token])

  return { status, people, send }
}
