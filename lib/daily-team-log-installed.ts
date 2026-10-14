import { stat } from "node:fs/promises"
import path from "node:path"

export async function dailyTeamLogInstalled(rootPath: string): Promise<boolean> {
  try {
    await stat(path.join(rootPath, ".claude", "skills", "daily-team-log", "gather.py"))
    return true
  } catch {
    return false
  }
}
