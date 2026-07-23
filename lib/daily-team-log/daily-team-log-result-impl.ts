import { readFile } from "node:fs/promises"

export type DailyTeamLogResult = {
  ranAtLeastOnce: boolean
  lastLine: string | null
}

export async function getDailyTeamLogResultImpl(logPath: string): Promise<DailyTeamLogResult> {
  let content: string
  try {
    content = await readFile(logPath, "utf-8")
  } catch {
    return { ranAtLeastOnce: false, lastLine: null }
  }

  const lines = content.split("\n").map((line) => line.trim()).filter((line) => line.length > 0)
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : null
  return { ranAtLeastOnce: true, lastLine }
}
