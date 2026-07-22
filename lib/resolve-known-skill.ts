import { realpath } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"
import { AGENTS, SKILL_ADAPTERS } from "./config"
import { getAllSkills } from "./get-all-skills"

export type ResolveKnownSkillResult =
  | { ok: true; realPath: string; agentRootPath: string }
  | { ok: false; reason: "outside-root" | "not-a-known-skill" }

export async function resolveKnownSkillPath(filePath: string): Promise<ResolveKnownSkillResult> {
  const guard = await resolveWithinAgentRoot(filePath)
  if (!guard) {
    return { ok: false, reason: "outside-root" }
  }

  const results = await getAllSkills(AGENTS, SKILL_ADAPTERS)
  const allEntryPaths = results.flatMap((r) => r.entries.map((entry) => entry.path))
  // Entry paths come from scanning the (unresolved) configured agent root, while
  // guard.realPath has been through realpath() (see path-guard.ts). On macOS,
  // os.tmpdir()-based roots traverse the /var -> /private/var symlink, so the two
  // must be compared after both are realpath()-resolved, not by raw string equality.
  const resolvedEntryPaths = await Promise.all(
    allEntryPaths.map(async (entryPath) => {
      try {
        return await realpath(entryPath)
      } catch {
        return null
      }
    })
  )
  const isKnownSkill = resolvedEntryPaths.some((resolved) => resolved === guard.realPath)
  if (!isKnownSkill) {
    return { ok: false, reason: "not-a-known-skill" }
  }

  return { ok: true, realPath: guard.realPath, agentRootPath: guard.agentRootPath }
}
