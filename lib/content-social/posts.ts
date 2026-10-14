import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "yaml"
import { POSTS_DIR } from "./make-posts-command"

export type PostState = "waiting" | "ready" | "posted"
export type Post = {
  fileName: string; relativePath: string; state: PostState; text: string
  title: string; caption: string; hashtags: string; altText: string
  suggestedTime?: string; canvaDesignUrl?: string; imageUrl?: string
  imageStatus: "ok" | "failed" | "none"; imageError?: string
  postedOn?: string; localImage?: string; problems: string[]; status?: string
}

export const IMAGES_DIR = "notes/content/images"

export function isSafePostFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(name) && !name.includes("..")
}

function splitFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  if (!text.startsWith("---")) return { meta: {}, body: text }
  const end = text.indexOf("\n---", 3)
  if (end === -1) return { meta: {}, body: text }
  let meta: Record<string, unknown> = {}
  try {
    const parsed = parse(text.slice(3, end))
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>
  } catch { /* a broken block reads as none — the card says what's missing */ }
  return { meta, body: text.slice(end + 4) }
}

function section(body: string, heading: string): string {
  const match = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(body)
  return match ? match[1].trim() : ""
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined)

export function parsePost(fileName: string, text: string, state: PostState): Post {
  const { meta, body } = splitFrontmatter(text)
  const rawStatus = str(meta.image_status)
  const imageStatus = rawStatus === "ok" || rawStatus === "failed" ? rawStatus : "none"
  const caption = section(body, "Caption")
  return {
    fileName,
    relativePath: `${POSTS_DIR}/${fileName}`,
    state,
    text,
    title: str(meta.title) ?? fileName.replace(/\.md$/, ""),
    caption,
    hashtags: section(body, "Hashtags"),
    altText: section(body, "Alt text"),
    suggestedTime: str(meta.suggested_time),
    canvaDesignUrl: str(meta.canva_design_url),
    imageUrl: str(meta.image_url),
    imageStatus,
    imageError: str(meta.image_error),
    postedOn: str(meta.posted_on),
    status: str(meta.status),
    problems: caption ? [] : ["This post has no caption."],
  }
}

async function pendingBefore(runRecordPath: string): Promise<string[] | null> {
  try {
    const record = JSON.parse(await readFile(runRecordPath, "utf-8"))
    return Array.isArray(record.before) ? record.before : null
  } catch {
    return null
  }
}

/**
 * ponytail: "ready" means "not in the pending run and not published", so an
 * uncommitted post left behind by a crashed run reads as ready. The approval
 * path's own realpath/record checks still refuse to commit it; add a git
 * check here if that case is ever seen.
 */
export async function listPosts(rootPath: string, runRecordPath: string): Promise<Post[]> {
  const dir = path.join(rootPath, POSTS_DIR)
  const names = (await readdir(dir).catch(() => [] as string[])).filter(isSafePostFileName).sort()
  const before = await pendingBefore(runRecordPath)
  const images = await readdir(path.join(rootPath, IMAGES_DIR)).catch(() => [] as string[])
  return Promise.all(names.map(async (name) => {
    let text: string
    try {
      text = await readFile(path.join(dir, name), "utf-8")
    } catch {
      const state: PostState = before && !before.includes(name) ? "waiting" : "ready"
      const post = parsePost(name, "", state)
      return { ...post, problems: ["This post couldn't be read."] }
    }
    const post = parsePost(name, text, "ready")
    const state: PostState = before && !before.includes(name) ? "waiting" : post.status === "published" ? "posted" : "ready"
    const slug = name.replace(/\.md$/, "")
    const localImage = images.find((i) => i === `${slug}.png` || i === `${slug}.jpg`)
    return { ...post, state, ...(localImage ? { localImage } : {}) }
  }))
}
