import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { Activity, Agent, Adapter } from "./types"

const REPORT_FILENAME = /^(\d{4}-\d{2}-\d{2})\.md$/

function stripFrontmatter(content: string): string {
  const lines = content.split("\n")
  if (lines[0]?.trim() !== "---") return content

  const closingIdx = lines.findIndex((line, idx) => idx > 0 && line.trim() === "---")
  if (closingIdx === -1) return content

  return lines.slice(closingIdx + 1).join("\n")
}

export const plhOpsAdapter: Adapter = async (agent: Agent): Promise<Activity[]> => {
  const reportsDir = path.join(agent.rootPath, "reports")
  let people: string[]
  try {
    people = await readdir(reportsDir)
  } catch {
    return []
  }

  const activities: Activity[] = []
  for (const person of people) {
    const personDir = path.join(reportsDir, person)
    let files: string[]
    try {
      files = await readdir(personDir)
    } catch {
      continue
    }
    for (const file of files) {
      const match = REPORT_FILENAME.exec(file)
      if (!match) continue
      const [, dateStr] = match
      const filePath = path.join(personDir, file)

      let content: string
      try {
        content = await readFile(filePath, "utf-8")
      } catch {
        // If report file is unreadable, skip just this file and continue
        continue
      }

      const contentAfterFrontmatter = stripFrontmatter(content)
      const firstLine = contentAfterFrontmatter.split("\n").find((line) => line.trim().length > 0)
      const title = firstLine ? firstLine.replace(/^#+\s*/, "").trim() : `${person} — ${dateStr}`

      activities.push({
        id: `${person}/${dateStr}`,
        agentId: agent.id,
        type: "daily-report",
        timestamp: Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000),
        title: `${person}: ${title}`,
        status: "done",
        detailPath: filePath,
      })
    }
  }

  return activities
}
