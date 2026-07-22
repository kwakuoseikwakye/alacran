import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { SkillEntry } from "./types"
import { parseFrontmatter } from "./parse-frontmatter"

async function entryFromFile(
  agentId: string,
  kind: SkillEntry["kind"],
  filePath: string,
  fallbackName: string
): Promise<SkillEntry | null> {
  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return null
  }
  const fm = parseFrontmatter(content)
  return {
    id: filePath,
    agentId,
    kind,
    name: fm.name ?? fallbackName,
    description: fm.description ?? "",
    path: filePath,
  }
}

export async function scanSkillsDir(agentId: string, skillsDir: string): Promise<SkillEntry[]> {
  let dirNames: string[]
  try {
    dirNames = await readdir(skillsDir)
  } catch {
    return []
  }
  const entries: SkillEntry[] = []
  for (const dirName of dirNames) {
    const skillFile = path.join(skillsDir, dirName, "SKILL.md")
    const entry = await entryFromFile(agentId, "skill", skillFile, dirName)
    if (entry) entries.push(entry)
  }
  return entries
}

export async function scanCommandsDir(agentId: string, commandsDir: string): Promise<SkillEntry[]> {
  let fileNames: string[]
  try {
    fileNames = await readdir(commandsDir)
  } catch {
    return []
  }
  const entries: SkillEntry[] = []
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".md")) continue
    const filePath = path.join(commandsDir, fileName)
    const fallbackName = fileName.replace(/\.md$/, "")
    const entry = await entryFromFile(agentId, "command", filePath, fallbackName)
    if (entry) entries.push(entry)
  }
  return entries
}
