const ID = /^[a-zA-Z0-9_-]{11}$/

export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim()
  if (ID.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
      return ID.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v') ?? ''
        return ID.test(id) ? id : null
      }
      const parts = url.pathname.split('/').filter(Boolean)
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1] && ID.test(parts[1])) {
        return parts[1]
      }
    }
  } catch {
    return null
  }
  return null
}

export function isAllowedImageUrl(url: string) {
  if (url.startsWith('/uploads/')) {
    return /^\/uploads\/[a-f0-9]{24}\.(jpg|png|gif|webp)$/.test(url)
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    return url.length <= 2000
  } catch {
    return false
  }
}
