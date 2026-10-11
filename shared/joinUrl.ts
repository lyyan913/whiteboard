const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

export function absoluteUrl(pageOrigin: string, publicOrigin: string | null, path: string) {
  let origin = pageOrigin.replace(/\/$/, '')
  const configured = publicOrigin?.trim().replace(/\/$/, '') ?? ''
  try {
    const host = new URL(pageOrigin).hostname
    if (LOCAL_HOSTS.has(host) && configured) origin = configured
  } catch {
    if (configured) origin = configured
  }
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${origin}${suffix}`
}

export function joinBoardUrl(boardId: string, pageOrigin: string, publicOrigin: string | null) {
  return absoluteUrl(pageOrigin, publicOrigin, `/b/${boardId}`)
}

export function dropUploadUrl(token: string, pageOrigin: string, publicOrigin: string | null) {
  return absoluteUrl(pageOrigin, publicOrigin, `/u/${token}`)
}

export function configuredPublicOrigin(env: Record<string, string | undefined> = process.env) {
  const explicit = env.PUBLIC_URL?.trim()
  if (explicit) {
    try {
      const url = new URL(explicit)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      return url.origin
    } catch {
      return null
    }
  }
  const railway = env.RAILWAY_PUBLIC_DOMAIN?.trim()
  if (!railway) return null
  const host = railway.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!host || host.includes('/') || host.includes(' ')) return null
  return `https://${host}`
}
