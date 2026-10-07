export function cleanText(input: unknown, max: number) {
  if (typeof input !== 'string') return ''
  return input.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function cleanBody(input: unknown, max: number) {
  if (typeof input !== 'string') return ''
  return input.replace(/\u0000/g, '').replace(/\r\n/g, '\n').slice(0, max)
}

export function cleanClientId(input: unknown) {
  if (typeof input !== 'string') return ''
  const value = input.trim()
  return /^[\w-]{8,80}$/.test(value) ? value : ''
}

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeId(len = 12) {
  const bytes = new Uint8Array(len)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < len; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return out
}
