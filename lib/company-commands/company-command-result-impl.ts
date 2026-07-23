import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

export type CompanyCommandResult =
  | { changed: true; outputPath: string; oldText: string; newText: string; extraFiles: string[] }
  | { changed: false; message: string }

type RunRecord = {
  commandId: string
  outputKind: "new-file-in-dir" | "known-file"
  outputPath: string
  before: string[] | string | null
}

export async function getCompanyCommandResultImpl(
  commandId: string,
  dataDir: string,
  agentRootPath: string
): Promise<CompanyCommandResult> {
  let record: RunRecord
  try {
    const raw = await readFile(path.join(dataDir, `${commandId}.run.json`), "utf-8")
    record = JSON.parse(raw)
  } catch {
    return { changed: false, message: "No run recorded for this command yet." }
  }

  const absPath = path.join(agentRootPath, record.outputPath)

  if (record.outputKind === "new-file-in-dir") {
    const before = Array.isArray(record.before) ? record.before : []
    let current: string[]
    try {
      current = await readdir(absPath)
    } catch {
      current = []
    }
    const newFiles = current.filter((name) => !before.includes(name)).sort()
    if (newFiles.length === 0) {
      return { changed: false, message: "No changes produced." }
    }
    const [primary, ...rest] = newFiles
    const newText = await readFile(path.join(absPath, primary), "utf-8")
    return { changed: true, outputPath: path.join(record.outputPath, primary), oldText: "", newText, extraFiles: rest }
  }

  const before = typeof record.before === "string" ? record.before : ""
  let current: string
  try {
    current = await readFile(absPath, "utf-8")
  } catch {
    current = ""
  }
  if (current === before) {
    return { changed: false, message: "No changes produced." }
  }
  return { changed: true, outputPath: record.outputPath, oldText: before, newText: current, extraFiles: [] }
}
