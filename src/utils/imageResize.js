// Product photos come straight off a phone camera (3000-4000px, several MB)
// but only ever render as small thumbnails (POS grid tiles, search results,
// inventory rows) -- shipping the original to every one of those, on the
// cheap low-RAM Android tablets this app targets, is exactly what "images
// are too slow/heavy, low spec tabs are lagging" describes. Resize+
// recompress client-side before upload so every future upload is small by
// default; this can't fix images already uploaded, only new ones.
const MAX_DIMENSION = 800
const JPEG_QUALITY = 0.8

export function resizeImageFile(file, maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY) {
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      if (width <= maxDimension && height <= maxDimension) {
        // Already small enough -- skip the re-encode round trip entirely.
        resolve(file)
        return
      }
      if (width > height) {
        height = Math.round((height / width) * maxDimension)
        width = maxDimension
      } else {
        width = Math.round((width / height) * maxDimension)
        height = maxDimension
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return } // canvas/toBlob unsupported -- fall back to the original rather than block the upload
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file) } // not a decodable image (or engine can't) -- let the original upload attempt proceed/fail normally
    img.src = objectUrl
  })
}
