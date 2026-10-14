import { promises as fs } from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { isSafeRecommendationFileName, updateFrontmatterStatus } from "@/lib/finances/recommendations"
import { INQUIRIES_DIR } from "./paths"

export type InquiryStatus = "pending" | "approved" | "replied" | "discarded"
export type InquiryUrgency = "high" | "medium" | "low"
export type InquiryCategory = "question" | "request" | "complaint" | "sales" | "other"

const STATUSES: readonly InquiryStatus[] = ["pending", "approved", "replied", "discarded"]
const URGENCIES: readonly InquiryUrgency[] = ["high", "medium", "low"]
const CATEGORIES: readonly InquiryCategory[] = ["question", "request", "complaint", "sales", "other"]

export interface CommsInquiry {
  id: string
  date: string
  from: string
  channel: string
  subject: string
  receivedAt: string
  urgency: InquiryUrgency
  category: InquiryCategory
  status: InquiryStatus
  threadHint?: string
  sourceNote?: string
  injectionFlag: boolean
  asked: string
  context: string
  draftReply: string
  fileName: string
}

// Same rule as finance cards: bare name, [a-zA-Z0-9_-], .md.
export const isSafeInquiryFileName = isSafeRecommendationFileName
export { updateFrontmatterStatus }

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(raw ?? "").toLowerCase()
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function section(body: string, heading: string): string {
  const match = body.match(new RegExp(`###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=###\\s+|$)`, "i"))
  return match ? match[1].trim() : ""
}

function optional(v: unknown): string | undefined {
  return v == null || v === "" ? undefined : String(v)
}

export function parseInquiry(content: string, fileName: string): CommsInquiry | null {
  if (!content.startsWith("---")) return null
  const end = content.indexOf("\n---", 3)
  if (end === -1) return null
  let data: Record<string, unknown>
  try {
    const parsed = yaml.parse(content.slice(3, end))
    if (!parsed || typeof parsed !== "object") return null
    data = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const body = content.slice(end + 4).trim()
  return {
    id: String(data.id ?? path.basename(fileName, ".md")),
    date: String(data.date ?? ""),
    from: String(data.from ?? "Unknown sender"),
    channel: String(data.channel ?? "other").toLowerCase(),
    subject: String(data.subject ?? ""),
    receivedAt: String(data.received_at ?? data.date ?? ""),
    urgency: pick(data.urgency, URGENCIES, "medium"),
    category: pick(data.category, CATEGORIES, "other"),
    status: pick(data.status, STATUSES, "pending"),
    threadHint: optional(data.thread_hint),
    sourceNote: optional(data.source_note),
    injectionFlag: data.injection_flag === true || data.injection_flag === "true",
    asked: section(body, "What they asked"),
    context: section(body, "Context used"),
    draftReply: section(body, "Draft reply"),
    fileName,
  }
}

const URGENCY_RANK: Record<InquiryUrgency, number> = { high: 3, medium: 2, low: 1 }

export async function listInquiries(companyRoot: string): Promise<CommsInquiry[]> {
  const dir = path.join(companyRoot, INQUIRIES_DIR)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: CommsInquiry[] = []
  for (const name of names) {
    if (!isSafeInquiryFileName(name)) continue
    try {
      const inq = parseInquiry(await fs.readFile(path.join(dir, name), "utf-8"), name)
      if (inq) out.push(inq)
    } catch {
      // Unreadable file: skip it, keep the rest.
    }
  }
  return out.sort(
    (a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] || b.receivedAt.localeCompare(a.receivedAt)
  )
}
