import path from "node:path"
import yaml from "yaml"
import { memoizedReadFile } from "../file-memo"
import {
  LeadsFileSchema,
  FunnelStagesFileSchema,
  type Lead,
  type FunnelStage,
} from "../schemas/funnel"
import {
  TransactionsFileSchema,
  FinancialCategoriesFileSchema,
  type Transaction,
  type FinancialCategory,
} from "../schemas/finances"
import {
  SocialAccountsFileSchema,
  SocialSnapshotsFileSchema,
  type SocialAccount,
  type SocialSnapshot,
} from "../schemas/social"
import {
  ContentItemsFileSchema,
  type ContentItem,
} from "../schemas/content"
import { ZodError } from "zod"

export type RecordResult<T> =
  | { ok: true; records: T[] }
  | { ok: false; error: string; records: [] }

type ReadFn = (path: string) => Promise<string>
type StatFn = (path: string) => Promise<{ mtimeMs: number }>

async function readRecordFile<T>(
  filePath: string,
  schema: { parse: (val: unknown) => { records: T[] } },
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<T>> {
  try {
    const raw = await memoizedReadFile(filePath, readFn, statFn)
    const parsedYaml = yaml.parse(raw)
    if (!parsedYaml) {
      return { ok: true, records: [] }
    }
    const validated = schema.parse(parsedYaml)
    return { ok: true, records: validated.records }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { ok: true, records: [] }
    }
    if (err instanceof Error && err.message.includes("ENOENT")) {
      return { ok: true, records: [] }
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      return { ok: false, error: `Invalid record format in ${path.basename(filePath)}: ${details}`, records: [] }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to read ${path.basename(filePath)}: ${message}`, records: [] }
  }
}

export async function readLeads(
  companyRoot: string,
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<Lead>> {
  const filePath = path.join(companyRoot, "records", "funnel", "leads.yaml")
  return readRecordFile(filePath, LeadsFileSchema, readFn, statFn)
}

export async function readFunnelStages(
  companyRoot: string,
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<FunnelStage>> {
  const filePath = path.join(companyRoot, "records", "funnel", "stages.yaml")
  return readRecordFile(filePath, FunnelStagesFileSchema, readFn, statFn)
}

export async function readTransactions(
  companyRoot: string,
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<Transaction>> {
  const filePath = path.join(companyRoot, "records", "finances", "transactions.yaml")
  return readRecordFile(filePath, TransactionsFileSchema, readFn, statFn)
}

export async function readFinancialCategories(
  companyRoot: string,
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<FinancialCategory>> {
  const filePath = path.join(companyRoot, "records", "finances", "categories.yaml")
  return readRecordFile(filePath, FinancialCategoriesFileSchema, readFn, statFn)
}

export async function readSocialAccounts(
  companyRoot: string,
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<SocialAccount>> {
  const filePath = path.join(companyRoot, "records", "social", "accounts.yaml")
  return readRecordFile(filePath, SocialAccountsFileSchema, readFn, statFn)
}

export async function readSocialSnapshots(
  companyRoot: string,
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<SocialSnapshot>> {
  const filePath = path.join(companyRoot, "records", "social", "snapshots.yaml")
  return readRecordFile(filePath, SocialSnapshotsFileSchema, readFn, statFn)
}

export async function readContentItems(
  companyRoot: string,
  readFn?: ReadFn,
  statFn?: StatFn
): Promise<RecordResult<ContentItem>> {
  const filePath = path.join(companyRoot, "records", "content", "items.yaml")
  return readRecordFile(filePath, ContentItemsFileSchema, readFn, statFn)
}

