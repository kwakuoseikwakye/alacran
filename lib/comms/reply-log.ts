import { promises as fs } from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { REPLY_LOG_FILE } from "./paths"

export interface ReplyLogEntry {
  id: string
  from: string
  channel: string
  subject: string
  replied_at: string
}

export interface ReplyLog {
  schema_version: number
  replied_count: number
  records: ReplyLogEntry[]
}

const corrupt = () =>
  new Error(`${REPLY_LOG_FILE} isn't a reply log Alacrán can read. Fix or move it by hand; nothing was changed.`)

/**
 * A missing or empty file is an empty log. A file that exists but isn't a log
 * throws, so no caller ever overwrites a record someone hand-edited.
 */
export async function readReplyLog(companyRoot: string): Promise<ReplyLog> {
  const empty: ReplyLog = { schema_version: 1, replied_count: 0, records: [] }
  let raw: string
  try {
    raw = await fs.readFile(path.join(companyRoot, REPLY_LOG_FILE), "utf-8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty
    throw err
  }
  let data: unknown
  try {
    data = yaml.parse(raw)
  } catch {
    throw corrupt()
  }
  if (data == null) return empty
  if (typeof data !== "object" || Array.isArray(data)) throw corrupt()
  const records = (data as { records?: unknown }).records ?? []
  if (!Array.isArray(records)) throw corrupt()
  return { schema_version: 1, replied_count: records.length, records: records as ReplyLogEntry[] }
}
