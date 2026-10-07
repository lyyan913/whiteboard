import express from 'express'
import * as fs from 'node:fs'
import { createServer } from 'node:http'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { uploadDir } from './db'
import { attachWebsocket } from './hub'
import { createApi, errorHandler } from './routes'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isProd = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT) || 43123

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})
app.use(express.json({ limit: '1mb' }))
app.use('/api', createApi())
app.use('/uploads', express.static(uploadDir, { index: false, maxAge: '7d', fallthrough: false }))

const server = createServer(app)
attachWebsocket(server)

if (isProd) {
  const dist = path.join(root, 'dist')
  app.use(express.static(dist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next()
      return
    }
    res.sendFile(path.join(dist, 'index.html'))
  })
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    root,
    appType: 'custom',
    server: { middlewareMode: true, hmr: { port: port + 1 } },
  })
  app.use(vite.middlewares)
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next()
      return
    }
    try {
      const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      const html = await vite.transformIndexHtml(req.originalUrl, template)
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(html)
    } catch (error) {
      vite.ssrFixStacktrace(error as Error)
      next(error)
    }
  })
}

app.use(errorHandler)

server.listen(port, '0.0.0.0', () => {
  console.log(`同窗  http://127.0.0.1:${port}`)
})
