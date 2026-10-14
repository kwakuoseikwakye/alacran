import { readdir } from "node:fs/promises"
import { getCompanyCommand } from "./registry"
import { isOwnedPath } from "./repo-changes"

const RUN_RECORD_SUFFIX = ".run.json"

/**
 * Paths another pending review in this company claims: each other run record's output (the exact
 * file, or the folder for a new-file-in-dir command) and its `alsoWrites` lanes. A record exists only
 * while its review is pending, so a path one of them claims is that review's to commit or discard,
 * never this one's (v234 C1). A record whose command is unknown is ignored. A data folder that cannot
 * be read claims everything: refusing to attribute is safe, attributing someone else's work is not.
 */
export async function pendingClaimedPaths(dataDir: string, exceptCommandId: string): Promise<(p: string) => boolean> {
  let names: string[]
  try {
    names = await readdir(dataDir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return () => false
    return () => true
  }
  const claims: string[] = []
  for (const name of names) {
    if (!name.endsWith(RUN_RECORD_SUFFIX)) continue
    const id = name.slice(0, -RUN_RECORD_SUFFIX.length)
    const command = id === exceptCommandId ? undefined : getCompanyCommand(id)
    if (!command) continue
    claims.push(command.outputKind === "new-file-in-dir" ? `${command.outputPath}/` : command.outputPath, ...(command.alsoWrites ?? []))
  }
  return (p) => isOwnedPath(p, claims)
}
