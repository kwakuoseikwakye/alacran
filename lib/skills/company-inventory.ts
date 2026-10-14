import path from "node:path"
import { scanSkillsDir, scanCommandsDir } from "./scan-helpers"
import type { SkillEntry } from "./types"

/**
 * What this company can do, as a list the app reads for itself.
 *
 * The seeded terminal prompts used to say "read every skill or command file
 * under .agents/skills/, .claude/skills/, .claude/commands/ and .kiro/skills/", which is an instruction whose
 * cost is the size of the company's packs. Measured against the bundled
 * templates: the base scaffold is 16 files / 37KB, and one pack on top of it
 * is 48 files / 496KB (marketing) or 155 files / 489KB (hr-people) — so an
 * ordinary company opened an assistant tab by reading half a megabyte, every
 * time the summary went stale, before saying hello.
 *
 * None of that is needed to answer the question the prompt actually asks:
 * "what is installed here, and what can you help me run". A skill's frontmatter
 * `name` and `description` is exactly that — it is what the Skills page lists,
 * and what the written summary is made of. So the app reads the frontmatter
 * (cheap, local, no tokens) and hands over the list, which is the same
 * gather-here-hand-over-text seam the prefetch layer already uses for
 * everything else.
 *
 * Entries are never dropped, only their descriptions clipped: a list missing a
 * skill makes the summary wrong about what the company can do, which is the
 * one thing this list exists to get right.
 */
const MAX_DESCRIPTION = 200

export const NO_INVENTORY = "(no skills or commands are installed in this company yet)"

function line(entry: SkillEntry): string {
  const description = entry.description.replace(/\s+/g, " ").trim()
  const clipped =
    description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION).trimEnd()}…` : description
  return clipped ? `- ${entry.name} (${entry.kind}) — ${clipped}` : `- ${entry.name} (${entry.kind})`
}

export function formatInventory(entries: SkillEntry[]): string {
  if (entries.length === 0) return NO_INVENTORY
  return entries.map(line).join("\n")
}

/** The company's own skills and commands, by name and description. Never
 *  throws: a folder that isn't there scans as empty, same as `scan-helpers`
 *  already treats an unreadable directory. */
export async function readCompanyInventory(rootPath: string): Promise<string> {
  const [shared, commands, claudeSkills, kiroSkills] = await Promise.all([
    scanSkillsDir("", path.join(rootPath, ".agents", "skills")),
    scanCommandsDir("", path.join(rootPath, ".claude", "commands")),
    scanSkillsDir("", path.join(rootPath, ".claude", "skills")),
    scanSkillsDir("", path.join(rootPath, ".kiro", "skills")),
  ])
  // One name, one line: after the move the same skill is in up to three folders, and the shared copy comes first.
  const seen = new Set<string>()
  const unique: SkillEntry[] = []
  for (const entry of [...shared, ...commands, ...claudeSkills, ...kiroSkills]) {
    if (seen.has(entry.name)) continue
    seen.add(entry.name)
    unique.push(entry)
  }
  return formatInventory(unique)
}
