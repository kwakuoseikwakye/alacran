import { readdir, cp, mkdir } from "node:fs/promises"
import path from "node:path"
import { pathExists } from "./path-exists"

/**
 * Copy entries that aren't already there; never overwrite the user's own.
 *
 * Shared by the two flows that add app files to a directory someone already
 * works in — adding a starter pack to an existing company, and adopting an
 * outside folder as one. Deliberately one implementation: two never-overwrite
 * rules that drift is how a user's own edited command gets clobbered by the
 * flow that didn't get the fix.
 */
export async function copyNew(
  source: string,
  target: string,
  skip: (name: string) => boolean = () => false
): Promise<string[]> {
  const names = await readdir(source).catch(() => [])
  if (names.length === 0) return []
  await mkdir(target, { recursive: true })
  const copied: string[] = []
  for (const name of names) {
    if (skip(name)) continue
    // A command or skill of this name already in the company is the user's —
    // possibly their own edit of this very file. Adding is additive or it is
    // nothing.
    if (await pathExists(path.join(target, name))) continue
    await cp(path.join(source, name), path.join(target, name), { recursive: true })
    copied.push(name)
  }
  return copied
}
