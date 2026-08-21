import { readdir } from "node:fs/promises"
import path from "node:path"
import { COMPANY_STARTER_PACKS, GENERAL_DEPARTMENT, DEPARTMENT_ORDER } from "../company-starter-packs"

const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

export { GENERAL_DEPARTMENT, DEPARTMENT_ORDER }

/**
 * The name a skill or command is known by on disk — a skill's own directory,
 * a command's filename without `.md`.
 *
 * Deliberately not `SkillEntry.name`: that comes from frontmatter, which a user
 * is free to change, and a renamed skill would silently fall out of its
 * department. The path is what the pack actually shipped.
 */
export function skillBasename(filePath: string): string {
  const parts = filePath.split(path.sep)
  const file = parts[parts.length - 1] ?? ""
  if (file === "SKILL.md") return parts[parts.length - 2] ?? ""
  return file.replace(/\.md$/, "")
}

/**
 * basename -> department, derived from what each pack ships in templates/packs/.
 *
 * Derived rather than stored, for the same reason `isPackInstalled` is: a
 * departments.json a user could edit is a second answer to "which pack does this
 * belong to", and two answers drift. This one cannot — it reads the files the
 * pack was copied from.
 *
 * Memoized per packs root: templates/ cannot change while the app is running,
 * and this sits on the force-dynamic Skills render (same call as
 * `packCommands` in lib/vendored-skills.ts).
 */
const cache = new Map<string, Map<string, string>>()

async function departmentByBasename(packsRoot: string): Promise<Map<string, string>> {
  const hit = cache.get(packsRoot)
  if (hit) return hit

  const map = new Map<string, string>()
  for (const pack of COMPANY_STARTER_PACKS) {
    if (pack.dirName === null) continue
    for (const [dir, isSkill] of [
      [path.join(packsRoot, pack.dirName, ".claude", "skills"), true],
      [path.join(packsRoot, pack.dirName, ".claude", "commands"), false],
    ] as const) {
      for (const name of await readdir(dir).catch(() => [])) {
        // UPSTREAM.md sits beside the skill directories and is provenance, not
        // a skill; a command is a .md file and a skill is a directory.
        if (isSkill && name.endsWith(".md")) continue
        map.set(isSkill ? name : name.replace(/\.md$/, ""), pack.category)
      }
    }
  }
  cache.set(packsRoot, map)
  return map
}

/** Department for every path given, keyed by path. Anything unknown is the user's own. */
export async function departmentsByPath(
  filePaths: string[],
  packsRoot: string = PACKS_ROOT
): Promise<Record<string, string>> {
  const byName = await departmentByBasename(packsRoot)
  const out: Record<string, string> = {}
  for (const filePath of filePaths) {
    out[filePath] = byName.get(skillBasename(filePath)) ?? GENERAL_DEPARTMENT
  }
  return out
}
