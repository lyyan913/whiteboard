const HEIC = /heic|heif/i

export async function prepareImageFile(file: File): Promise<File> {
  if (!file || file.size < 32) throw new Error('請再選一次相片')
  const looksLikeImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name) || HEIC.test(file.type)
  if (!looksLikeImage) throw new Error('請選一張相片')
  const bitmap = await decodeImage(file)
  try {
    const maxEdge = 1600
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('這部裝置未能處理這張相片')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.82))
    if (!blob || blob.size < 32) throw new Error('這部裝置未能處理這張相片')
    return new File([blob], 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* iPhone HEIC on some browsers cannot be decoded here */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('fail'))
      element.src = url
    })
    return await createImageBitmap(image)
  } catch {
    throw new Error('無法讀取這張相片。iPhone 請在相簿選「最相容」格式，或改選 JPG。')
  } finally {
    URL.revokeObjectURL(url)
  }
}
