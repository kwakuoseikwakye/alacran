import { promises as fs } from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { RECOMMENDATIONS_DIR } from "./audit-finances-command"

export type FinancesRecommendationStatus = "pending" | "approved" | "realized" | "discarded"
export type FinancesRecommendationActionType = "cancel" | "negotiate" | "downgrade" | "optimize"
export type FinancesRecommendationPriority = "high" | "medium" | "low"

export interface FinancesRecommendation {
  id: string
  date: string
  title: string
  vendor: string
  category: string
  actionType: FinancesRecommendationActionType
  potentialSavingsMonthly: number
  currency: string
  status: FinancesRecommendationStatus
  priority: FinancesRecommendationPriority
  vendorUrl?: string
  finding: string
  actionPlan: string
  draftPitch: string
  fileName: string
  filePath: string
}

export function isSafeRecommendationFileName(fileName: string): boolean {
  if (!fileName || typeof fileName !== "string") return false
  if (!fileName.endsWith(".md")) return false
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return false
  return /^[a-zA-Z0-9_-]+\.md$/.test(fileName)
}

function parseSection(body: string, heading: string): string {
  const regex = new RegExp(`###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=(?:###\\s+|$))`, "i")
  const match = body.match(regex)
  return match ? match[1].trim() : ""
}

export function parseRecommendation(content: string, fileName: string, filePath?: string): FinancesRecommendation | null {
  if (!content.startsWith("---")) return null
  const endIdx = content.indexOf("\n---", 3)
  if (endIdx === -1) return null

  const frontmatterRaw = content.slice(3, endIdx).trim()
  const bodyRaw = content.slice(endIdx + 4).trim()

  try {
    const data = yaml.parse(frontmatterRaw)
    if (!data || typeof data !== "object") return null

    const actionTypeRaw = String(data.action_type || data.actionType || "optimize").toLowerCase()
    const actionType: FinancesRecommendationActionType =
      actionTypeRaw === "cancel" || actionTypeRaw === "negotiate" || actionTypeRaw === "downgrade"
        ? actionTypeRaw
        : "optimize"

    const statusRaw = String(data.status || "pending").toLowerCase()
    const status: FinancesRecommendationStatus =
      statusRaw === "approved" || statusRaw === "realized" || statusRaw === "discarded"
        ? statusRaw
        : "pending"

    const priorityRaw = String(data.priority || "medium").toLowerCase()
    const priority: FinancesRecommendationPriority =
      priorityRaw === "high" || priorityRaw === "low" ? priorityRaw : "medium"

    const rawSavings = data.potential_savings_monthly ?? data.potentialSavingsMonthly ?? 0
    const parsedSavings =
      typeof rawSavings === "number"
        ? rawSavings
        : Number(String(rawSavings).replace(/[^0-9.-]/g, ""))
    const potentialSavingsMonthly = Number.isFinite(parsedSavings) ? parsedSavings : 0

    return {
      id: String(data.id || path.basename(fileName, ".md")),
      date: String(data.date || new Date().toISOString().slice(0, 10)),
      title: String(data.title || "Cost Optimization"),
      vendor: String(data.vendor || "Vendor"),
      category: String(data.category || "General"),
      actionType,
      potentialSavingsMonthly,
      currency: String(data.currency || "USD"),
      status,
      priority,
      vendorUrl: data.vendor_url || data.vendorUrl ? String(data.vendor_url || data.vendorUrl) : undefined,
      finding: parseSection(bodyRaw, "Audit finding & rationale") || bodyRaw,
      actionPlan: parseSection(bodyRaw, "Action plan"),
      draftPitch: parseSection(bodyRaw, "Draft vendor / support outreach"),
      fileName,
      filePath: filePath || fileName,
    }
  } catch {
    return null
  }
}

export function updateFrontmatterStatus(content: string, newStatus: string): string {
  return content.replace(/^---(?:\r?\n[\s\S]*?\r?\n)---/, (fmBlock) => {
    return fmBlock.replace(
      /(^|\n)([ \t]*status:[ \t]*)["']?[a-zA-Z_-]+["']?/,
      `$1$2"${newStatus}"`
    )
  })
}

export async function listRecommendations(
  companyRoot: string,
  status?: FinancesRecommendationStatus
): Promise<FinancesRecommendation[]> {
  const dir = path.join(companyRoot, RECOMMENDATIONS_DIR)
  let entries: string[] = []
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }

  const recommendations: FinancesRecommendation[] = []
  for (const entry of entries) {
    if (!isSafeRecommendationFileName(entry)) continue
    const fullPath = path.join(dir, entry)
    try {
      const content = await fs.readFile(fullPath, "utf-8")
      const rec = parseRecommendation(content, entry, fullPath)
      if (rec && (!status || rec.status === status)) {
        recommendations.push(rec)
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by priority (high > medium > low) then potential savings desc
  const priorityScore: Record<FinancesRecommendationPriority, number> = { high: 3, medium: 2, low: 1 }
  return recommendations.sort((a, b) => {
    const pDiff = priorityScore[b.priority] - priorityScore[a.priority]
    if (pDiff !== 0) return pDiff
    return b.potentialSavingsMonthly - a.potentialSavingsMonthly
  })
}
