const PDF = /^\/uploads\/[a-f0-9]{24}\.pdf$/

export function RichNote({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\/uploads\/[a-f0-9]{24}\.pdf)/g)
  return (
    <span className={className}>
      {parts.map((part, index) =>
        PDF.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-sky underline"
            onPointerDown={(event) => event.stopPropagation()}
          >
            開啟 PDF
          </a>
        ) : (
          <span key={`${index}-${part.slice(0, 12)}`}>{part}</span>
        ),
      )}
    </span>
  )
}
