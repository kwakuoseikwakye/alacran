import { stat } from "node:fs/promises"

/** True if anything exists at this path — file, directory or symlink target. */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}
