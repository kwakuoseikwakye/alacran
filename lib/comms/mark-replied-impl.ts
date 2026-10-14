import { promises as fs } from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { INQUIRIES_DIR, REPLY_LOG_FILE } from "./paths"
import { isSafeInquiryFileName, parseInquiry, updateFrontmatterStatus } from "./inquiries"
import { readReplyLog, type ReplyLog } from "./reply-log"

export interface MarkRepliedOptions {
  companyRoot: string
  fileName: string
  now?: () => Date
  gitCommitFile?: (o: { rootPath: string; filePaths: string[]; commitMessage: string }) => Promise<void>
}

// ponytail: in-process queue — the control panel is one local Next server process. A second process would still race; use lib/file-lock.ts if that ever changes.
const queues = new Map<string, Promise<unknown>>()
function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn)
  queues.set(key, run.catch(() => {}))
  return run
}

async function markRepliedImplInner({
  companyRoot,
  fileName,
  now = () => new Date(),
  gitCommitFile,
}: MarkRepliedOptions): Promise<{ ok: boolean; message: string }> {
  if (!isSafeInquiryFileName(fileName)) return { ok: false, message: `Invalid inquiry file: ${fileName}` }

  const cardPath = path.join(companyRoot, INQUIRIES_DIR, fileName)
  let content: string
  try {
    content = await fs.readFile(cardPath, "utf-8")
  } catch {
    return { ok: false, message: `Inquiry not found: ${fileName}` }
  }
  const inquiry = parseInquiry(content, fileName)
  if (!inquiry) return { ok: false, message: `Couldn't read inquiry: ${fileName}` }

  // Read the log before writing anything, so a corrupt log leaves both files untouched.
  let log: ReplyLog
  try {
    log = await readReplyLog(companyRoot)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }

  const logged = log.records.some((r) => r.id === inquiry.id)
  if (inquiry.status === "replied" && logged) {
    return { ok: true, message: `Already marked replied to ${inquiry.from}.` }
  }

  if (inquiry.status !== "replied") {
    await fs.writeFile(cardPath, updateFrontmatterStatus(content, "replied"), "utf-8")
  }
  if (!logged) {
    log.records.push({
      id: inquiry.id,
      from: inquiry.from,
      channel: inquiry.channel,
      subject: inquiry.subject,
      replied_at: now().toISOString(),
    })
    log.replied_count = log.records.length
    const logPath = path.join(companyRoot, REPLY_LOG_FILE)
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.writeFile(logPath, yaml.stringify(log), "utf-8")
  }

  await gitCommitFile?.({
    rootPath: companyRoot,
    filePaths: [path.join(INQUIRIES_DIR, fileName), REPLY_LOG_FILE],
    commitMessage: `chore(comms): mark reply sent to ${inquiry.from}`,
  })
  return { ok: true, message: `Marked replied to ${inquiry.from}.` }
}

export async function markRepliedImpl(opts: MarkRepliedOptions): Promise<{ ok: boolean; message: string }> {
  return serialize(opts.companyRoot, () => markRepliedImplInner(opts))
}
