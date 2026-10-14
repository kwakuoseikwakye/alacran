import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { commitFile, type ExecFileFn } from "../git-commit-file"
import { CANVA_IMAGE_HOSTS } from "./canva-tools"
import { IMAGES_DIR, isSafePostFileName, parsePost } from "./posts"
import { POSTS_DIR } from "./make-posts-command"

const MAX_BYTES = 15 * 1024 * 1024
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" }

const allowed = (raw: string, allowedHosts: string[]) => {
  try {
    const u = new URL(raw)
    return u.protocol === "https:" && allowedHosts.includes(u.hostname)
  } catch {
    return false
  }
}

async function followRedirects(
  url: string,
  fetchFn: typeof fetch,
  allowedHosts: string[],
  maxHops: number = 3
): Promise<{ ok: boolean; finalUrl?: string; message?: string; response?: Response }> {
  let currentUrl = url
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetchFn(currentUrl, { redirect: "manual" })
    if (!res.ok && (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308)) {
      const location = res.headers.get("location")
      if (!location) return { ok: false, message: "Redirect missing Location header" }
      try {
        const nextUrl = new URL(location, currentUrl).href
        if (!allowed(nextUrl, allowedHosts)) return { ok: false, message: "The image link pointed somewhere other than Canva, so it wasn't downloaded." }
        currentUrl = nextUrl
        continue
      } catch {
        return { ok: false, message: "Invalid redirect URL" }
      }
    }
    return { ok: true, finalUrl: currentUrl, response: res }
  }
  return { ok: false, message: "Too many redirects" }
}

/**
 * Fetch an approved post's Canva export and keep it in the company folder.
 * The URL was written by the AI, so this is a server-side fetch of an
 * agent-chosen address: only https, only the hosts step zero measured (checked
 * again after redirects), only PNG/JPEG, at most 15 MB.
 */
export async function savePostImageImpl(
  rootPath: string,
  fileName: string,
  fetchFn: typeof fetch = fetch,
  execFn?: ExecFileFn,
  allowedHosts: string[] = CANVA_IMAGE_HOSTS
): Promise<{ ok: boolean; message: string; image?: string }> {
  if (!isSafePostFileName(fileName)) return { ok: false, message: "That isn't a post file." }
  const text = await readFile(path.join(rootPath, POSTS_DIR, fileName), "utf-8").catch(() => null)
  if (text === null) return { ok: false, message: "That post no longer exists." }
  const { imageUrl } = parsePost(fileName, text, "ready")
  if (!imageUrl || !allowed(imageUrl, allowedHosts)) return { ok: false, message: "This post's image link isn't from Canva, so it wasn't downloaded." }
  try {
    const redirectResult = await followRedirects(imageUrl, fetchFn, allowedHosts)
    if (!redirectResult.ok) return { ok: false, message: redirectResult.message ?? "Failed to fetch image" }
    const res = redirectResult.response
    if (!res) return { ok: false, message: "Failed to fetch image" }

    const contentLength = res.headers.get("content-length")
    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) return { ok: false, message: "The image is larger than 15 MB, so it wasn't saved." }

    const ext = TYPES[(res.headers.get("content-type") ?? "").split(";")[0].trim()]
    if (!res.ok || !ext) return { ok: false, message: "Canva didn't return an image. Open the design in Canva and export it again." }

    const reader = res.body?.getReader()
    if (!reader) return { ok: false, message: "Canva didn't return an image. Open the design in Canva and export it again." }

    const chunks: Uint8Array[] = []
    let totalBytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > MAX_BYTES) {
          reader.cancel()
          return { ok: false, message: "The image is larger than 15 MB, so it wasn't saved." }
        }
        chunks.push(value)
      }
    } catch (err) {
      reader.cancel()
      throw err
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }

    const image = `${fileName.replace(/\.md$/, "")}.${ext}`
    await mkdir(path.join(rootPath, IMAGES_DIR), { recursive: true })
    await writeFile(path.join(rootPath, IMAGES_DIR, image), bytes)
    await commitFile(rootPath, `${IMAGES_DIR}/${image}`, "Save post image via AI-Native control panel", execFn)
    return { ok: true, message: "Image saved.", image }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
