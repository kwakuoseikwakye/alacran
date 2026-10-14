/**
 * Validates and processes uploaded company logo image files.
 *
 * Supported formats include PNG, JPEG, WebP, SVG, GIF, AVIF, and ICO.
 * For raster images, it scales dimensions down to a sensible maximum (default: 384px)
 * using an offscreen HTML5 canvas to keep the stored data URL compact (< 100KB),
 * well below Next.js Server Action body size limits and avoiding storage bloat.
 * SVG files are preserved as vector data URLs to retain crispness.
 */

const VALID_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
  ".avif",
  ".ico",
  ".bmp",
]

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

export function isValidImageType(file: { type?: string; name?: string }): boolean {
  if (file.type && file.type.startsWith("image/")) {
    return true
  }
  if (file.name) {
    const lowerName = file.name.toLowerCase()
    return VALID_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
  }
  return false
}

export async function readFileAsDataUrl(file: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result)
        } else {
          reject(new Error("Failed to read file as data URL"))
        }
      }
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"))
      reader.readAsDataURL(file)
    })
  }

  // Universal fallback using Blob.arrayBuffer()
  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString("base64")
  const mimeType = file.type || "image/png"
  return `data:${mimeType};base64,${base64}`
}

export async function scaleImageToDataUrl(
  dataUrl: string,
  maxDimension: number = 384
): Promise<string> {
  // If we're not in a browser environment with document/canvas support, return as is.
  if (typeof window === "undefined" || typeof document === "undefined") {
    return dataUrl
  }

  // Preserve vector SVGs directly without rasterizing to canvas.
  if (dataUrl.startsWith("data:image/svg")) {
    return dataUrl
  }

  // Attempt to downscale using Image and Canvas
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("Failed to load image for resizing"))
      el.src = dataUrl
    })

    const { naturalWidth, naturalHeight } = img
    if (!naturalWidth || !naturalHeight) {
      return dataUrl
    }

    // If both dimensions are already within bounds, keep the original data URL
    if (naturalWidth <= maxDimension && naturalHeight <= maxDimension) {
      return dataUrl
    }

    let targetWidth = naturalWidth
    let targetHeight = naturalHeight

    if (naturalWidth > naturalHeight) {
      targetHeight = Math.round((naturalHeight * maxDimension) / naturalWidth)
      targetWidth = maxDimension
    } else {
      targetWidth = Math.round((naturalWidth * maxDimension) / naturalHeight)
      targetHeight = maxDimension
    }

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return dataUrl
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
    return canvas.toDataURL("image/png")
  } catch {
    // If canvas manipulation fails for any reason, gracefully fall back to original
    return dataUrl
  }
}

export type ProcessImageResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string }

export async function processAvatarImage(
  file: File,
  maxDimension: number = 384
): Promise<ProcessImageResult> {
  if (!isValidImageType(file)) {
    return {
      ok: false,
      error: "Please select an image file (PNG, JPEG, WebP, SVG, GIF).",
    }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: "Image file is too large (maximum 10MB).",
    }
  }

  try {
    const rawDataUrl = await readFileAsDataUrl(file)
    const scaledDataUrl = await scaleImageToDataUrl(rawDataUrl, maxDimension)
    return { ok: true, dataUrl: scaledDataUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process image file."
    return { ok: false, error: message }
  }
}
