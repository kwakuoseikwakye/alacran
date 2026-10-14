import { promises as fs } from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { isSafeRecommendationFileName, parseRecommendation, updateFrontmatterStatus } from "./recommendations"
import { RECOMMENDATIONS_DIR } from "./audit-finances-command"

export const RUNWAY_FILE = "records/finances/runway.yaml"

export interface RunwayRecordItem {
  id: string
  vendor?: string
  savings_monthly?: number
  realized_at?: string
  action_type?: string
}

export interface RunwayYamlData {
  schema_version?: number
  records?: RunwayRecordItem[]
  realized_savings_monthly?: number
  realized_savings_annual?: number
  [key: string]: unknown
}

export interface MarkSavingsRealizedOptions {
  companyRoot: string
  fileName: string
  savingsMonthly?: number
  gitCommitFile?: (options: { rootPath: string; filePaths: string[]; commitMessage: string }) => Promise<void>
}

export async function markSavingsRealizedImpl({
  companyRoot,
  fileName,
  savingsMonthly,
  gitCommitFile,
}: MarkSavingsRealizedOptions): Promise<{ ok: boolean; message: string }> {
  if (!isSafeRecommendationFileName(fileName)) {
    return { ok: false, message: `Invalid recommendation file name: ${fileName}` }
  }

  const recPath = path.join(companyRoot, RECOMMENDATIONS_DIR, fileName)
  let recContent: string
  try {
    recContent = await fs.readFile(recPath, "utf-8")
  } catch {
    return { ok: false, message: `Recommendation file not found: ${fileName}` }
  }

  const rec = parseRecommendation(recContent, fileName, recPath)
  if (!rec) {
    return { ok: false, message: `Could not parse recommendation: ${fileName}` }
  }

  const runwayPath = path.join(companyRoot, RUNWAY_FILE)
  let runwayData: RunwayYamlData = { schema_version: 1, records: [] }
  try {
    const rawRunway = await fs.readFile(runwayPath, "utf-8")
    runwayData = (yaml.parse(rawRunway) as RunwayYamlData) || { schema_version: 1, records: [] }
  } catch {
    // Fresh runway record
  }

  if (!Array.isArray(runwayData.records)) {
    runwayData.records = []
  }

  const existingRecord = runwayData.records.find((r) => r.id === rec.id)
  if (rec.status === "realized" && existingRecord) {
    return { ok: true, message: `Savings for ${rec.vendor} already marked as realized.` }
  }

  const realizedAmount = savingsMonthly ?? rec.potentialSavingsMonthly ?? 0

  // 1. Update recommendation file frontmatter
  const updatedRecContent = updateFrontmatterStatus(recContent, "realized")
  await fs.writeFile(recPath, updatedRecContent, "utf-8")

  // 2. Update runway.yaml
  if (existingRecord) {
    existingRecord.savings_monthly = realizedAmount
    existingRecord.realized_at = new Date().toISOString()
  } else {
    runwayData.records.push({
      id: rec.id,
      vendor: rec.vendor,
      savings_monthly: realizedAmount,
      realized_at: new Date().toISOString(),
      action_type: rec.actionType,
    })
  }

  // Calculate totals
  const totalMonthlySavings = runwayData.records.reduce((acc: number, r) => acc + (Number(r.savings_monthly) || 0), 0)
  runwayData.realized_savings_monthly = totalMonthlySavings
  runwayData.realized_savings_annual = totalMonthlySavings * 12

  await fs.mkdir(path.dirname(runwayPath), { recursive: true })
  await fs.writeFile(runwayPath, yaml.stringify(runwayData), "utf-8")

  // 3. Commit files
  if (gitCommitFile) {
    await gitCommitFile({
      rootPath: companyRoot,
      filePaths: [path.join(RECOMMENDATIONS_DIR, fileName), RUNWAY_FILE],
      commitMessage: `chore(finances): mark $${realizedAmount}/mo savings realized for ${rec.vendor}`,
    })
  }

  return { ok: true, message: `Realized $${realizedAmount}/mo savings for ${rec.vendor}.` }
}
