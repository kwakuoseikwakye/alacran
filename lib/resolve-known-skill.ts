import { realpath } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"
import { getEffectiveAgents, getEffectiveSkillAdapters } from "./get-effective-agents"
import { getAllSkills } from "./get-all-skills"
import { isAppManagedSkillPath } from "./vendored-skills"

export type ResolveKnownSkillResult =
  | { ok: true; realPath: string; agentRootPath: string }
  | { ok: false; reason: "outside-root" | "not-a-known-skill" }

export async function resolveKnownSkillPath(filePath: string): Promise<ResolveKnownSkillResult> {
  const guard = await resolveWithinAgentRoot(filePath)
  if (!guard) {
    return { ok: false, reason: "outside-root" }
  }

  const [agents, skillAdapters] = await Promise.all([getEffectiveAgents(), getEffectiveSkillAdapters()])
  const results = await getAllSkills(agents, skillAdapters)
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

export type ResolveWritableSkillResult = ResolveKnownSkillResult | { ok: false; reason: "app-managed" }

/**
 * The write-side gate. Everything resolveKnownSkillPath checks, plus: a skill the
 * app installed and keeps updated cannot be written, because the next update
 * replaces the vendored tree wholesale and would destroy the edit.
 *
 * READS deliberately keep using resolveKnownSkillPath — viewing the content and
 * the history of an app-managed skill is fine, and useful. Any new WRITER should
 * reach for this function; that is why it has the more specific name.
 */
export async function resolveWritableSkillPath(filePath: string): Promise<ResolveWritableSkillResult> {
  const resolved = await resolveKnownSkillPath(filePath)
  if (!resolved.ok) return resolved
  if (await isAppManagedSkillPath(resolved.agentRootPath, resolved.realPath)) {
    return { ok: false, reason: "app-managed" }
  }
  return resolved
}
