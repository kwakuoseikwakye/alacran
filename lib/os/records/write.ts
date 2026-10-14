import fs from "node:fs/promises"
import path from "node:path"
import yaml from "yaml"
import {
  LeadsFileSchema,
  LeadSchema,
  type Lead,
  type LeadStage,
} from "../schemas/funnel"
import {
  TransactionsFileSchema,
  TransactionSchema,
  type Transaction,
  type TransactionStatus,
  type TransactionType,
} from "../schemas/finances"
import {
  ContentItemsFileSchema,
  ContentItemSchema,
  type ContentItem,
  type ContentStatus,
  type ContentType,
} from "../schemas/content"
import {
  RoadmapFileSchema,
  RoadmapMilestoneSchema,
  type RoadmapMilestone,
  type RoadmapStatus,
} from "../schemas/roadmap"
import { commitFile, type ExecFileFn } from "../../git-commit-file"
import { defaultExecFile } from "../../default-exec-file"

export type RecordMutationResult<T> =
  | { ok: true; record: T }
  | { ok: false; error: string }

export type CreateLeadInput = {
  name: string
  value: number
  stage: LeadStage
  source: string
  currency?: string
}

export type CreateTransactionInput = {
  description: string
  amount: number
  type: TransactionType
  category: string
  account?: string
  status?: TransactionStatus
  currency?: string
  date?: string
}

export type CreateContentItemInput = {
  title: string
  type?: ContentType
  channel: string
  status?: ContentStatus
  publish_date?: string
  summary?: string
}

export type CreateMilestoneInput = {
  title: string
  /** YYYY-QX, e.g. 2026-Q4 — the schema's own format. */
  quarter: string
  description?: string
  status?: RoadmapStatus
}

function generateId(prefix: string): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}_${ts}_${rand}`
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date()) // YYYY-MM-DD
}

// In-memory mutex for serializing writes per file path
const fileLocks = new Map<string, Promise<unknown>>()

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const current = fileLocks.get(filePath) ?? Promise.resolve()
  let resolveNext: () => void
  const next = new Promise<void>((r) => {
    resolveNext = r
  })
  fileLocks.set(filePath, next)
  try {
    await current.catch(() => {})
    return await fn()
  } finally {
    resolveNext!()
    if (fileLocks.get(filePath) === next) {
      fileLocks.delete(filePath)
    }
  }
}

async function safeReadExisting<T>(
  filePath: string,
  schema: { parse: (val: unknown) => { schema_version: number; records: T[] } }
): Promise<{ ok: true; data: { schema_version: number; records: T[] } } | { ok: false; error: string }> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const parsed = yaml.parse(raw)
    if (!parsed) {
      return { ok: true, data: { schema_version: 1, records: [] } }
    }
    const validated = schema.parse(parsed)
    return { ok: true, data: validated }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { ok: true, data: { schema_version: 1, records: [] } }
    }
    return {
      ok: false,
      error: `File ${path.basename(filePath)} contains invalid formatting or schema. Aborting write to prevent data loss.`,
    }
  }
}

export async function appendLead(
  companyRoot: string,
  input: CreateLeadInput,
  execFn: ExecFileFn = defaultExecFile
): Promise<RecordMutationResult<Lead>> {
  const relPath = path.join("records", "funnel", "leads.yaml")
  const fullPath = path.join(companyRoot, relPath)

  return withFileLock(fullPath, async () => {
    const existing = await safeReadExisting(fullPath, LeadsFileSchema)
    if (!existing.ok) return existing

    const today = todayIso()
    const newLead: Lead = {
      id: generateId("lead"),
      name: input.name.trim(),
      stage: input.stage,
      source: input.source.trim(),
      owner: "human",
      value: input.value,
      currency: input.currency ?? "USD",
      first_seen: today,
      last_touch: today,
      provenance: [
        {
          claim: "Created manually via control panel",
          said_by: "operator",
          said_on: today,
          source: "manual-entry",
        },
      ],
    }

    // Validate through Zod
    const leadValidated = LeadSchema.safeParse(newLead)
    if (!leadValidated.success) {
      return { ok: false, error: leadValidated.error.issues.map((i) => i.message).join(", ") }
    }

    const updatedRecords = [...existing.data.records, newLead]
    const updatedFile = {
      schema_version: existing.data.schema_version || 1,
      records: updatedRecords,
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, yaml.stringify(updatedFile, { indent: 2 }), "utf8")
    try {
      await commitFile(companyRoot, relPath, `feat(funnel): add lead ${newLead.name}`, execFn)
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }

    return { ok: true, record: newLead }
  })
}

export async function updateLeadStage(
  companyRoot: string,
  leadId: string,
  stage: LeadStage,
  execFn: ExecFileFn = defaultExecFile
): Promise<RecordMutationResult<Lead>> {
  const relPath = path.join("records", "funnel", "leads.yaml")
  const fullPath = path.join(companyRoot, relPath)

  return withFileLock(fullPath, async () => {
    const existing = await safeReadExisting(fullPath, LeadsFileSchema)
    if (!existing.ok) return existing

    const idx = existing.data.records.findIndex((r) => r.id === leadId)
    if (idx === -1) {
      return { ok: false, error: `Lead not found: ${leadId}` }
    }

    const target = existing.data.records[idx]
    const updatedLead: Lead = {
      ...target,
      stage,
      last_touch: todayIso(),
    }

    const leadValidated = LeadSchema.safeParse(updatedLead)
    if (!leadValidated.success) {
      return { ok: false, error: leadValidated.error.issues.map((i) => i.message).join(", ") }
    }

    const updatedRecords = [...existing.data.records]
    updatedRecords[idx] = updatedLead

    const updatedFile = {
      schema_version: existing.data.schema_version || 1,
      records: updatedRecords,
    }

    await fs.writeFile(fullPath, yaml.stringify(updatedFile, { indent: 2 }), "utf8")
    try {
      await commitFile(companyRoot, relPath, `feat(funnel): update stage for ${updatedLead.name} to ${stage}`, execFn)
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }

    return { ok: true, record: updatedLead }
  })
}

export async function appendTransaction(
  companyRoot: string,
  input: CreateTransactionInput,
  execFn: ExecFileFn = defaultExecFile
): Promise<RecordMutationResult<Transaction>> {
  const relPath = path.join("records", "finances", "transactions.yaml")
  const fullPath = path.join(companyRoot, relPath)

  return withFileLock(fullPath, async () => {
    const existing = await safeReadExisting(fullPath, TransactionsFileSchema)
    if (!existing.ok) return existing

    const today = todayIso()
    const newTxn: Transaction = {
      id: generateId("txn"),
      date: input.date ?? today,
      description: input.description.trim(),
      amount: input.amount,
      currency: input.currency ?? "USD",
      type: input.type,
      category: input.category.trim(),
      account: input.account?.trim() || "Main",
      status: input.status ?? "cleared",
      provenance: [
        {
          claim: "Logged manually via control panel",
          said_by: "operator",
          said_on: today,
          source: "manual-entry",
        },
      ],
    }

    const txnValidated = TransactionSchema.safeParse(newTxn)
    if (!txnValidated.success) {
      return { ok: false, error: txnValidated.error.issues.map((i) => i.message).join(", ") }
    }

    const updatedRecords = [...existing.data.records, newTxn]
    const updatedFile = {
      schema_version: existing.data.schema_version || 1,
      records: updatedRecords,
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, yaml.stringify(updatedFile, { indent: 2 }), "utf8")
    try {
      await commitFile(companyRoot, relPath, `feat(finances): log transaction ${newTxn.description}`, execFn)
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }

    return { ok: true, record: newTxn }
  })
}

export async function updateTransactionStatus(
  companyRoot: string,
  txnId: string,
  status: TransactionStatus,
  execFn: ExecFileFn = defaultExecFile
): Promise<RecordMutationResult<Transaction>> {
  const relPath = path.join("records", "finances", "transactions.yaml")
  const fullPath = path.join(companyRoot, relPath)

  return withFileLock(fullPath, async () => {
    const existing = await safeReadExisting(fullPath, TransactionsFileSchema)
    if (!existing.ok) return existing

    const idx = existing.data.records.findIndex((r) => r.id === txnId)
    if (idx === -1) {
      return { ok: false, error: `Transaction not found: ${txnId}` }
    }

    const target = existing.data.records[idx]
    const updatedTxn: Transaction = {
      ...target,
      status,
    }

    const txnValidated = TransactionSchema.safeParse(updatedTxn)
    if (!txnValidated.success) {
      return { ok: false, error: txnValidated.error.issues.map((i) => i.message).join(", ") }
    }

    const updatedRecords = [...existing.data.records]
    updatedRecords[idx] = updatedTxn

    const updatedFile = {
      schema_version: existing.data.schema_version || 1,
      records: updatedRecords,
    }

    await fs.writeFile(fullPath, yaml.stringify(updatedFile, { indent: 2 }), "utf8")
    try {
      await commitFile(companyRoot, relPath, `feat(finances): mark ${updatedTxn.description} ${status}`, execFn)
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }

    return { ok: true, record: updatedTxn }
  })
}

export async function appendContentItem(
  companyRoot: string,
  input: CreateContentItemInput,
  execFn: ExecFileFn = defaultExecFile
): Promise<RecordMutationResult<ContentItem>> {
  const relPath = path.join("records", "content", "items.yaml")
  const fullPath = path.join(companyRoot, relPath)

  return withFileLock(fullPath, async () => {
    const existing = await safeReadExisting(fullPath, ContentItemsFileSchema)
    if (!existing.ok) return existing

    const today = todayIso()
    const newItem: ContentItem = {
      id: generateId("content"),
      title: input.title.trim(),
      type: input.type ?? "article",
      channel: input.channel.trim(),
      status: input.status ?? "idea",
      author: "human",
      publish_date: input.publish_date,
      summary: input.summary?.trim(),
      provenance: [
        {
          claim: "Created manually via control panel",
          said_by: "operator",
          said_on: today,
          source: "manual-entry",
        },
      ],
    }

    const itemValidated = ContentItemSchema.safeParse(newItem)
    if (!itemValidated.success) {
      return { ok: false, error: itemValidated.error.issues.map((i) => i.message).join(", ") }
    }

    const updatedRecords = [...existing.data.records, newItem]
    const updatedFile = {
      schema_version: existing.data.schema_version || 1,
      records: updatedRecords,
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, yaml.stringify(updatedFile, { indent: 2 }), "utf8")
    try {
      await commitFile(companyRoot, relPath, `feat(content): create content item ${newItem.title}`, execFn)
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }

    return { ok: true, record: newItem }
  })
}

export async function updateContentStage(
  companyRoot: string,
  itemId: string,
  status: ContentStatus,
  execFn: ExecFileFn = defaultExecFile
): Promise<RecordMutationResult<ContentItem>> {
  const relPath = path.join("records", "content", "items.yaml")
  const fullPath = path.join(companyRoot, relPath)

  return withFileLock(fullPath, async () => {
    const existing = await safeReadExisting(fullPath, ContentItemsFileSchema)
    if (!existing.ok) return existing

    const idx = existing.data.records.findIndex((r) => r.id === itemId)
    if (idx === -1) {
      return { ok: false, error: `Content item not found: ${itemId}` }
    }

    const target = existing.data.records[idx]
    const updatedItem: ContentItem = {
      ...target,
      status,
    }

    const itemValidated = ContentItemSchema.safeParse(updatedItem)
    if (!itemValidated.success) {
      return { ok: false, error: itemValidated.error.issues.map((i) => i.message).join(", ") }
    }

    const updatedRecords = [...existing.data.records]
    updatedRecords[idx] = updatedItem

    const updatedFile = {
      schema_version: existing.data.schema_version || 1,
      records: updatedRecords,
    }

    await fs.writeFile(fullPath, yaml.stringify(updatedFile, { indent: 2 }), "utf8")
    try {
      await commitFile(companyRoot, relPath, `feat(content): update status for ${updatedItem.title} to ${status}`, execFn)
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }

    return { ok: true, record: updatedItem }
  })
}

/**
 * Roadmap was the one department with no way in but hand-editing YAML. Its file
 * keeps phases and milestones side by side (and the starter ships
 * `records: []`), so it is read as a plain object and only `milestones` is
 * touched — anything else in the file is written back as it was.
 */
export async function appendMilestone(
  companyRoot: string,
  input: CreateMilestoneInput,
  execFn: ExecFileFn = defaultExecFile
): Promise<RecordMutationResult<RoadmapMilestone>> {
  const relPath = path.join("records", "roadmap", "milestones.yaml")
  const fullPath = path.join(companyRoot, relPath)
  const invalid = "milestones.yaml contains invalid formatting or schema. Aborting write to prevent data loss."

  return withFileLock(fullPath, async () => {
    let doc: Record<string, unknown> = {}
    try {
      const parsed = yaml.parse(await fs.readFile(fullPath, "utf8"))
      if (parsed && typeof parsed === "object") doc = parsed as Record<string, unknown>
    } catch (err: unknown) {
      if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
        return { ok: false, error: invalid }
      }
    }
    const existing = RoadmapFileSchema.safeParse(doc)
    if (!existing.success) return { ok: false, error: invalid }

    const milestone: RoadmapMilestone = {
      id: generateId("milestone"),
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      quarter: input.quarter,
      status: input.status ?? "next",
    }
    const validated = RoadmapMilestoneSchema.safeParse(milestone)
    if (!validated.success) {
      return { ok: false, error: validated.error.issues.map((i) => i.message).join(", ") }
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(
      fullPath,
      yaml.stringify({ ...doc, milestones: [...existing.data.milestones, milestone] }, { indent: 2 }),
      "utf8"
    )
    try {
      await commitFile(companyRoot, relPath, `feat(roadmap): add milestone ${milestone.title}`, execFn)
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }

    return { ok: true, record: milestone }
  })
}
