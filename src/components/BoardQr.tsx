import { toDataURL } from 'qrcode'
import { useEffect, useState } from 'react'
import { copyText } from '@/lib/share'
import { Button } from '@/components/ui/button'

export function BoardQr({
  url,
  title,
  hint,
  heading = '學生掃碼交作品',
}: {
  url: string
  title: string
  hint: string
  heading?: string
}) {
  const [png, setPng] = useState('')
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPng('')
    setFailed(false)
    void toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 640,
      color: { dark: '#1f1a14', light: '#ffffff' },
    })
      .then((data) => {
        if (!cancelled) setPng(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  function download() {
    if (!png) return
    const link = document.createElement('a')
    link.href = png
    link.download = `${heading}-${safeFileName(title)}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function printSheet() {
    if (!png) return
    const popup = window.open('', 'tongchung-qr', 'width=640,height=840')
    if (!popup) {
      window.print()
      return
    }
    popup.document.open()
    popup.document.write(printHtml(png, title, url, heading))
    popup.document.close()
    const image = popup.document.querySelector('img')
    const go = () => {
      popup.focus()
      popup.print()
    }
    if (image && !image.complete) image.addEventListener('load', go)
    else go()
  }

  return (
    <div className="qr-sheet space-y-3">
      <div className="mx-auto w-[min(64vw,320px)] rounded-2xl bg-white p-2 ring-1 ring-line sm:p-3">
        {png ? (
          <img src={png} alt={heading} data-upload-url={url} className="aspect-square w-full" />
        ) : (
          <div className="grid aspect-square place-items-center text-base text-muted">{failed ? 'QR 碼暫時無法產生' : '正在產生 QR 碼…'}</div>
        )}
      </div>
      <p className="text-center text-base text-muted">{hint}</p>
      <p className="break-all rounded-2xl bg-cream px-4 py-4 text-center text-lg font-semibold text-sky">{url}</p>
      <div className="qr-actions grid gap-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => {
            void copyText(url).then((ok) => {
              if (!ok) return
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? '已複製' : '複製連結'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="lg" variant="outline" disabled={!png} onClick={download}>
            下載 QR 碼
          </Button>
          <Button type="button" size="lg" variant="outline" disabled={!png} onClick={printSheet}>
            列印
          </Button>
        </div>
      </div>
    </div>
  )
}

function safeFileName(title: string) {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, '').trim()
  return (cleaned || '同窗').slice(0, 40)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

function printHtml(png: string, title: string, url: string, heading: string) {
  return `<!doctype html>
<html lang="zh-Hant-HK">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(heading)}</title>
  <style>
    body { margin: 32px; text-align: center; font-family: "PingFang HK", "Microsoft JhengHei", sans-serif; color: #1f1a14; }
    h1 { font-size: 32px; margin: 0 0 8px; }
    img { width: 360px; height: 360px; }
    p { font-size: 18px; word-break: break-all; }
  </style>
</head>
<body>
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(title)}</p>
  <img src="${png}" alt="${escapeHtml(heading)}" />
  <p>${escapeHtml(url)}</p>
</body>
</html>`
}
