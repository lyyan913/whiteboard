import type { IncomingMessage } from 'node:http'
import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, Person, Role, ServerMessage } from '../shared/types'
import { verifyToken } from './auth'
import { getBoardRow } from './db'
import { makeId } from '../shared/text'

type Client = {
  ws: WebSocket
  id: string
  name: string
  role: Role
  boardId: string
}

const rooms = new Map<string, Set<Client>>()

function people(boardId: string): Person[] {
  const room = rooms.get(boardId)
  if (!room) return []
  return [...room].map((client) => ({ id: client.id, name: client.name }))
}

export function broadcast(boardId: string, message: ServerMessage, except?: WebSocket) {
  const room = rooms.get(boardId)
  if (!room) return
  const payload = JSON.stringify(message)
  for (const client of room) {
    if (client.ws === except) continue
    if (client.ws.readyState === client.ws.OPEN) client.ws.send(payload)
  }
}

function sendPresence(boardId: string) {
  broadcast(boardId, { type: 'presence', people: people(boardId) })
}

function remove(client: Client) {
  const room = rooms.get(client.boardId)
  if (!room || !room.has(client)) return
  room.delete(client)
  if (room.size === 0) rooms.delete(client.boardId)
  sendPresence(client.boardId)
}

function clampCoord(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < -20000 || value > 20000) return undefined
  return value
}

export function attachWebsocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })

  server.on('upgrade', (request, socket, head) => {
    let pathname = ''
    try {
      pathname = new URL(request.url || '', 'http://localhost').pathname
    } catch {
      socket.destroy()
      return
    }
    if (pathname !== '/ws') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  wss.on('connection', (ws, request: IncomingMessage) => {
    let token = ''
    try {
      const url = new URL(request.url || '', 'http://localhost')
      token = url.searchParams.get('token') || ''
    } catch {
      ws.close(4001, 'unauthorized')
      return
    }
    const payload = verifyToken(token)
    if (!payload || payload.t !== 'board') {
      ws.close(4001, 'unauthorized')
      return
    }
    const board = getBoardRow(payload.bid)
    if (!board) {
      ws.close(4001, 'unauthorized')
      return
    }
    const client: Client = {
      ws,
      id: makeId(10),
      name: payload.role === 'teacher' ? '教師' : '同學',
      role: payload.role,
      boardId: payload.bid,
    }
    let room = rooms.get(client.boardId)
    if (!room) {
      room = new Set()
      rooms.set(client.boardId, room)
    }
    room.add(client)
    sendPresence(client.boardId)

    ws.on('message', (raw) => {
      let message: ClientMessage
      try {
        message = JSON.parse(raw.toString()) as ClientMessage
      } catch {
        return
      }
      if (!message || typeof message !== 'object') return
      if (message.type === 'presence') {
        const name = typeof message.name === 'string' ? message.name.replace(/[\u0000-\u001F]/g, '').trim().slice(0, 20) : ''
        client.name = name || (client.role === 'teacher' ? '教師' : '同學')
        sendPresence(client.boardId)
        return
      }
      if (message.type === 'live') {
        const current = getBoardRow(client.boardId)
        if (!current) return
        if (Number(current.locked) === 1 && client.role !== 'teacher') return
        if (message.entity !== 'post' && message.entity !== 'item') return
        if (typeof message.id !== 'string' || message.id.length > 40) return
        const live: ServerMessage = {
          type: 'live',
          entity: message.entity,
          id: message.id,
          x: clampCoord(message.x),
          y: clampCoord(message.y),
          w: clampCoord(message.w),
          h: clampCoord(message.h),
        }
        broadcast(client.boardId, live, ws)
      }
    })

    ws.on('close', () => remove(client))
    ws.on('error', () => remove(client))
  })

  const ping = setInterval(() => {
    for (const room of rooms.values()) {
      for (const client of room) {
        if (client.ws.readyState === client.ws.OPEN) client.ws.ping()
      }
    }
  }, 30000)
  server.on('close', () => clearInterval(ping))
}
