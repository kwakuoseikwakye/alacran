import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { Activity, Agent, Adapter } from "./types"

async function listMarkdownFilesRecursive(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFilesRecursive(full)))
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      files.push(full)
    }
  }
  return files
}

async function fileToActivity(agentId: string, type: string, filePath: string): Promise<Activity> {
  const [content, stats] = await Promise.all([readFile(filePath, "utf-8"), stat(filePath)])
  const firstLine = content.split("\n").find((line) => line.startsWith("# "))
  const title = firstLine ? firstLine.replace(/^# /, "").trim() : path.basename(filePath)
  return {
    id: filePath,
    agentId,
    type,
    timestamp: Math.floor(stats.mtimeMs / 1000),
    title,
    status: "done",
    detailPath: filePath,
  }
}

function parseCycleLine(line: string): { timestamp: number; title: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return null
  }
  const ts = typeof obj.ts === "number" ? obj.ts : typeof obj.timestamp === "number" ? obj.timestamp : null
  if (ts === null) return null
  const title =
    typeof obj.event === "string" ? obj.event : typeof obj.type === "string" ? obj.type : "cycle event"
  return { timestamp: ts, title }
}

async function cycleActivities(agentId: string, rootPath: string): Promise<Activity[]> {
  const cyclesDir = path.join(rootPath, "state", "cycles")
  let teamDirs: string[]
  try {
    teamDirs = await readdir(cyclesDir)
  } catch {
    return []
  }
  const activities: Activity[] = []
  for (const team of teamDirs) {
    const teamPath = path.join(cyclesDir, team)
    let dateDirs: string[]
    try {
      dateDirs = await readdir(teamPath)
    } catch {
      continue
    }
    for (const date of dateDirs) {
      const filePath = path.join(teamPath, date, "cycle.jsonl")
      let content: string
      try {
        content = await readFile(filePath, "utf-8")
      } catch {
        continue
      }
      content.split("\n").forEach((line, i) => {
        const parsed = parseCycleLine(line)
        if (!parsed) return
        activities.push({
          id: `${filePath}:${i}`,
          agentId,
          type: "cycle-event",
          timestamp: parsed.timestamp,
          title: parsed.title,
          status: "done",
          detailPath: filePath,
        })
      })
    }
  }
  return activities
}

export const aiCompanyStarterMainAdapter: Adapter = async (agent: Agent): Promise<Activity[]> => {
  const [decisionFiles, handoffFiles, retroFiles] = await Promise.all([
    listMarkdownFilesRecursive(path.join(agent.rootPath, "docs", "decisions")),
    listMarkdownFilesRecursive(path.join(agent.rootPath, "docs", "handoffs")),
    listMarkdownFilesRecursive(path.join(agent.rootPath, "docs", "retros")),
  ])

  const fileActivities = await Promise.all([
    ...decisionFiles.map((f) => fileToActivity(agent.id, "decision", f)),
    ...handoffFiles.map((f) => fileToActivity(agent.id, "handoff", f)),
    ...retroFiles.map((f) => fileToActivity(agent.id, "retro", f)),
  ])

  const cycleEvents = await cycleActivities(agent.id, agent.rootPath)

  return [...fileActivities, ...cycleEvents]
}
