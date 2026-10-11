import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWhen(timestamp: number) {
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp))
}

export function tiltOf(id: string) {
  let total = 0
  for (const char of id) total += char.charCodeAt(0)
  return [-1.5, -0.6, 0.4, 1.15, -1.05, 0.85][total % 6]
}

export function readStorage(store: Storage, key: string) {
  try {
    return store.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function writeStorage(store: Storage, key: string, value: string) {
  try {
    store.setItem(key, value)
  } catch {
    /* private mode */
  }
}

export function removeStorage(store: Storage, key: string) {
  try {
    store.removeItem(key)
  } catch {
    /* private mode */
  }
}
