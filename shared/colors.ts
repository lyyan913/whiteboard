export const NOTE_COLORS = ['#ffe9a0', '#ffd0dc', '#cfeedd', '#d4e8ff', '#e6dcff', '#fffdf8'] as const

export const TEXT_COLORS = ['#2a2118', '#c4492c', '#1f7a64', '#1d4e89', '#6b4c9a'] as const

export const NOTE_COLOR_LABELS: Record<(typeof NOTE_COLORS)[number], string> = {
  '#ffe9a0': '淺黃',
  '#ffd0dc': '粉紅',
  '#cfeedd': '淺綠',
  '#d4e8ff': '淺藍',
  '#e6dcff': '淺紫',
  '#fffdf8': '白紙',
}

export const TEXT_COLOR_LABELS: Record<(typeof TEXT_COLORS)[number], string> = {
  '#2a2118': '墨色',
  '#c4492c': '朱紅',
  '#1f7a64': '深綠',
  '#1d4e89': '深藍',
  '#6b4c9a': '紫色',
}

export function isNoteColor(value: string) {
  return (NOTE_COLORS as readonly string[]).includes(value)
}

export function isTextColor(value: string) {
  return (TEXT_COLORS as readonly string[]).includes(value)
}

export function defaultItemColor(kind: 'sticky' | 'text' | 'rect' | 'ellipse') {
  if (kind === 'text') return TEXT_COLORS[0]
  if (kind === 'rect') return NOTE_COLORS[2]
  if (kind === 'ellipse') return NOTE_COLORS[3]
  return NOTE_COLORS[0]
}
