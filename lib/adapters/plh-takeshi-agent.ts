import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import type { Activity, Agent, Adapter } from "./types"

type ProcessedState = {
  processed: Record<string, { attempts: number; status: string; ts: number }>
}

const NEEDS_ATTENTION_HEADING = "## Needs human attention"
const REPORT_FILENAME = /^(\d{8}-\d{6})-([a-z0-9]+)\.md$/

function extractNeedsAttentionText(report: string): string {
  const idx = report.indexOf(NEEDS_ATTENTION_HEADING)
  if (idx === -1) return ""
  const afterHeading = report.slice(idx + NEEDS_ATTENTION_HEADING.length)
  const nextHeadingIdx = afterHeading.indexOf("\n## ")
  const section = nextHeadingIdx === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIdx)
  return section.trim()
}

function reportFlagsAttention(report: string): boolean {
  const text = extractNeedsAttentionText(report)
  if (text === "") return false
  return !/^none\.?$/i.test(text)
}

export const plhTakeshiAgentAdapter: Adapter = async (agent: Agent): Promise<Activity[]> => {
  const statePath = path.join(agent.rootPath, "state", "processed.json")
  const reportsDir = path.join(agent.rootPath, "reports")

  let stateRaw: string
  try {
    stateRaw = await readFile(statePath, "utf-8")
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return []
    }
    throw err
  }
  const state = JSON.parse(stateRaw) as ProcessedState

  let reportFiles: string[] = []
  try {
    reportFiles = await readdir(reportsDir)
  } catch {
    reportFiles = []
  }

  const reportByEmailId = new Map<string, { file: string; ts: string }>()
  for (const file of reportFiles) {
    const match = REPORT_FILENAME.exec(file)
    if (!match) continue
    const [, ts, emailId] = match
    const existing = reportByEmailId.get(emailId)
    if (!existing || ts > existing.ts) {
      reportByEmailId.set(emailId, { file, ts })
    }
  }

  const activities: Activity[] = []
  for (const [emailId, entry] of Object.entries(state.processed)) {
    const report = reportByEmailId.get(emailId)
    let flagsAttention = false
    let detailPath = statePath
    let title = `Email ${emailId}`

    if (report) {
      detailPath = path.join(reportsDir, report.file)
      try {
        const content = await readFile(detailPath, "utf-8")
        flagsAttention = reportFlagsAttention(content)
        const firstLine = content.split("\n").find((line) => line.startsWith("# "))
        if (firstLine) title = firstLine.replace(/^# /, "").trim()
      } catch {
        // If report file is unreadable, fall back to defaults
        flagsAttention = false
        detailPath = statePath
        title = `Email ${emailId}`
      }
    }

    const status = entry.status === "done" && !flagsAttention ? "done" : "needs-attention"

    activities.push({
      id: emailId,
      agentId: agent.id,
      type: "email-processed",
      timestamp: entry.ts,
      title,
      status,
      detailPath,
    })
  }

  return activities
}
