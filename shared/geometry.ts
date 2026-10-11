export type Box = { x: number; y: number; w: number; h: number }
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

export function containBox(maxW: number, maxH: number, srcW: number, srcH: number) {
  const scale = Math.min(maxW / Math.max(1, srcW), maxH / Math.max(1, srcH))
  return {
    w: Math.max(48, Math.round(srcW * scale)),
    h: Math.max(36, Math.round(srcH * scale)),
  }
}

export function resizeBox(origin: Box, corner: Corner, dx: number, dy: number, proportional: boolean, maxW = 4000, maxH = 3000): Box {
  let w = origin.w
  let h = origin.h
  if (proportional) {
    const sx = corner === 'nw' || corner === 'sw' ? -dx : dx
    const sy = corner === 'nw' || corner === 'ne' ? -dy : dy
    const scale = Math.abs(sx) >= Math.abs(sy) ? (origin.w + sx) / origin.w : (origin.h + sy) / origin.h
    const next = Math.min(8, Math.max(0.15, scale))
    w = origin.w * next
    h = origin.h * next
  } else if (corner === 'se') {
    w = origin.w + dx
    h = origin.h + dy
  } else if (corner === 'sw') {
    w = origin.w - dx
    h = origin.h + dy
  } else if (corner === 'ne') {
    w = origin.w + dx
    h = origin.h - dy
  } else {
    w = origin.w - dx
    h = origin.h - dy
  }
  w = Math.min(maxW, Math.max(64, w))
  h = Math.min(maxH, Math.max(48, h))
  let x = origin.x
  let y = origin.y
  if (corner === 'sw' || corner === 'nw') x = origin.x + origin.w - w
  if (corner === 'ne' || corner === 'nw') y = origin.y + origin.h - h
  return { x, y, w, h }
}

export function imagePixelSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = readU32(bytes, 16)
    const height = readU32(bytes, 20)
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const width = bytes[6] + (bytes[7] << 8)
    const height = bytes[8] + (bytes[9] << 8)
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes)
  if (bytes.length > 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webpSize(bytes)
  return null
}

function readU32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  let text = ''
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index] ?? 0)
  return text
}

function jpegSize(bytes: Uint8Array) {
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) return null
    const length = (bytes[offset] << 8) + bytes[offset + 1]
    const startOfFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
    if (startOfFrame) {
      const height = (bytes[offset + 3] << 8) + bytes[offset + 4]
      const width = (bytes[offset + 5] << 8) + bytes[offset + 6]
      return width > 0 && height > 0 ? { width, height } : null
    }
    offset += length
  }
  return null
}

function webpSize(bytes: Uint8Array) {
  const kind = ascii(bytes, 12, 4)
  if (kind === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    return width > 1 && height > 1 ? { width, height } : null
  }
  if (kind === 'VP8 ' && bytes.length >= 30) {
    const width = (bytes[26] + (bytes[27] << 8)) & 0x3fff
    const height = (bytes[28] + (bytes[29] << 8)) & 0x3fff
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (kind === 'VP8L' && bytes.length >= 25) {
    const bits = bytes[21] + (bytes[22] << 8) + (bytes[23] << 16) + (bytes[24] << 24)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1
    return { width, height }
  }
  return null
}
