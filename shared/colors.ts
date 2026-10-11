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

export const FONT_SIZES = [18, 32, 40] as const

export const FONT_SIZE_LABELS: Record<(typeof FONT_SIZES)[number], string> = {
  18: '小',
  32: '中',
  40: '大',
}

export function isFontSize(value: number) {
  return value === 18 || value === 28 || value === 32 || value === 40
}

export const DRAW_COLORS = ['#1f1a14', '#c4492c', '#e11d48', '#f59e0b', '#facc15', '#1f7a54', '#1d4e89', '#2563eb', '#6b4c9a', '#ffffff', '#ffe9a0', '#ffd0dc'] as const

export const DRAW_COLOR_LABELS: Record<(typeof DRAW_COLORS)[number], string> = {
  '#1f1a14': '墨色',
  '#c4492c': '朱紅',
  '#e11d48': '玫紅',
  '#f59e0b': '橙色',
  '#facc15': '黃色',
  '#1f7a54': '綠色',
  '#1d4e89': '深藍',
  '#2563eb': '藍色',
  '#6b4c9a': '紫色',
  '#ffffff': '白色',
  '#ffe9a0': '淺黃',
  '#ffd0dc': '粉紅',
}

export const STROKE_WIDTHS = [4, 8, 14] as const

export const STROKE_WIDTH_LABELS: Record<(typeof STROKE_WIDTHS)[number], string> = {
  4: '細',
  8: '中',
  14: '粗',
}

export function isStrokeWidth(value: number) {
  return value === 4 || value === 8 || value === 14
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function defaultItemColor(kind: string) {
  if (kind === 'text') return TEXT_COLORS[0]
  if (kind === 'rect' || kind === 'cloud' || kind === 'bubble') return NOTE_COLORS[2]
  if (kind === 'ellipse') return NOTE_COLORS[3]
  if (kind === 'image') return NOTE_COLORS[5]
  if (kind === 'pen' || kind === 'arrow') return '#c4492c'
  if (kind === 'heart' || kind === 'star') return '#e11d48'
  return NOTE_COLORS[0]
}
