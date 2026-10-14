import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parse, stringify } from "yaml"
import { commitFile, type ExecFileFn } from "../git-commit-file"
import { defaultExecFile } from "../default-exec-file"
import { ContentItemsFileSchema, type ContentItem } from "../os/schemas/content"
import { POSTS_DIR } from "./make-posts-command"
import { isSafePostFileName, parsePost } from "./posts"

const ITEMS = "records/content/items.yaml"

function setField(frontmatter: string, key: string, value: string): string {
  const line = new RegExp(`^${key}:.*$`, "m")
  return line.test(frontmatter) ? frontmatter.replace(line, `${key}: ${value}`) : `${frontmatter.trimEnd()}\n${key}: ${value}\n`
}

/** Deterministic, never an AI run: the member says it went out, the app records it. */
export async function markPostPostedImpl(
  rootPath: string,
  fileName: string,
  today: string,
  runRecordPath: string,
  execFn?: ExecFileFn
): Promise<{ ok: boolean; message: string }> {
  if (!isSafePostFileName(fileName)) return { ok: false, message: "That isn't a post file." }
  try {
    const pending = await readFile(runRecordPath, "utf-8").then((t) => JSON.parse(t) as { before?: unknown }).catch(() => null)
    if (pending && Array.isArray(pending.before) && !pending.before.includes(fileName)) {
      return { ok: false, message: "Approve this post before marking it as posted." }
    }

    const postPath = path.join(rootPath, POSTS_DIR, fileName)
    const text = await readFile(postPath, "utf-8")
    const end = text.indexOf("\n---", 3)
    if (!text.startsWith("---") || end === -1) return { ok: false, message: "This post's details are unreadable, so it can't be marked." }

    const itemsPath = path.join(rootPath, ITEMS)
    const rawItems = await readFile(itemsPath, "utf-8").catch(() => null)
    const parsedItems = ContentItemsFileSchema.safeParse(rawItems === null ? { schema_version: 1, records: [] } : parse(rawItems))
    if (!parsedItems.success) return { ok: false, message: "The content list has an error in it, so nothing was changed. Fix records/content/items.yaml first." }

    const post = parsePost(fileName, text, "ready")
    const slug = fileName.replace(/\.md$/, "")
    const entryId = `post-${slug}`

    // Self-repair: write whatever is missing, then ONE commit for both paths.
    // Retrying after a half-finished mark (one file written or committed, not
    // the other) lands here and finishes the job instead of erroring.
    const postRel = `${POSTS_DIR}/${fileName}`
    const existingEntry = parsedItems.data.records.find((r) => r.id === entryId)
    if (!existingEntry) {
      const entry: ContentItem = { id: entryId, title: post.title, status: "published", type: "post", channel: "instagram", author: "agent", publish_date: post.postedOn || today, summary: postRel }
      await mkdir(path.dirname(itemsPath), { recursive: true })
      await writeFile(itemsPath, stringify({ ...parsedItems.data, records: [...parsedItems.data.records, entry] }), "utf-8")
    }
    if (post.status !== "published") {
      const frontmatter = text.slice(4, end + 1)
      let updated = setField(frontmatter, "status", "published")
      updated = setField(updated, "posted_on", today)
      updated = setField(updated, "updated", today)
      await writeFile(postPath, `---\n${updated}${text.slice(end + 1)}`, "utf-8")
    }

    // An empty status means both files already hold what they should, and
    // committing would only fail with "nothing to commit".
    const status = await (execFn ?? defaultExecFile)("git", ["-C", rootPath, "status", "--porcelain", "--", ITEMS, postRel])
    if (status.stdout.trim() === "") {
      return existingEntry && post.status === "published"
        ? { ok: true, message: "Already marked as posted." }
        : { ok: true, message: "Marked as posted." }
    }
    await commitFile(rootPath, [ITEMS, postRel], "Mark post as posted via AI-Native control panel", execFn)

    return { ok: true, message: "Marked as posted." }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
