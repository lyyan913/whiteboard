export function loadImageSize(file: File) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}
