import { readFile, stat } from "node:fs/promises"

/** True if anything exists at this path — file, directory or symlink target. */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/** True only if a directory is there. Four `-impl.ts` files each carried this
 *  verbatim; it belongs beside pathExists for the same reason pathExists is
 *  here rather than in six places. */
export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

/** The real default behind every injectable `readFileFn` seam. Same reason as
 *  isDirectory above: two modules each carried this verbatim, and a DI default
 *  duplicated is a DI default that can quietly stop matching its twin. Note it
 *  does NOT swallow errors — callers here treat a missing file as a real
 *  signal (an absent company summary means "regenerate"), so failing loudly is
 *  the contract, unlike the two predicates above. */
export async function readFileUtf8(p: string): Promise<string> {
  return readFile(p, "utf-8")
}
