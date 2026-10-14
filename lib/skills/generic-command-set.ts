import path from "node:path"
import type { Agent } from "../adapters/types"
import type { SkillAdapter, SkillEntry } from "./types"
import { scanSkillsDir, scanCommandsDir } from "./scan-helpers"
import { readGeneratedMirrors } from "./sync-agent-skills"

/**
 * Scans the shared `.agents/skills` folder and every executor's own skill
 * directory, not only the configured one.
 *
 * Copies this app generated from a shared skill (recorded in
 * `.agents/mirror.json`) are the same skill and are left out, so a skill is
 * listed once and the editor only ever opens the copy that is safe to edit. A
 * hand-written skill of the same name is NOT left out: seeing both is how a
 * conflict shows.
 *
 * Deliberately unconditional rather than dispatching on the company's AI
 * executor: `SkillAdapter` takes an `Agent` and nothing else, so keying off
 * the executor would mean threading the executor registry through
 * `getEffectiveSkillAdapters` — which `resolve-known-skill.ts`, a write-
 * authorization path, also calls. A file browser is not worth widening that
 * seam for, and a company that has both directories should show both.
 *
 * Kiro's project-level layout is `.kiro/skills/<name>/SKILL.md` — the same
 * shape as Claude's, verified against the installed kiro-cli 2.19.1 (its own
 * path table carries `.kiro/skills` alongside `.kiro/agents`,
 * `.kiro/settings` and `.kiro/steering`). It has no `.claude/commands`
 * analogue — `.kiro/workflows` and `.kiro/specs` are different concepts, not
 * slash commands — so only skills are scanned for it.
 *
 * The consequence worth knowing: `getAllSkills` feeds `resolveKnownSkillPath`,
 * so a directory added here also becomes editable through the skill editor.
 * That is intended — these are the company's own skills, inside the company
 * root, so path-guard still holds — but it is a write-allowlist change, not
 * just a display one.
 */
export const genericCommandSetSkillAdapter: SkillAdapter = async (agent: Agent) => {
  const root = agent.rootPath
  const [shared, claudeSkills, claudeCommands, kiroSkills, generated] = await Promise.all([
    scanSkillsDir(agent.id, path.join(root, ".agents", "skills")),
    scanSkillsDir(agent.id, path.join(root, ".claude", "skills")),
    scanCommandsDir(agent.id, path.join(root, ".claude", "commands")),
    scanSkillsDir(agent.id, path.join(root, ".kiro", "skills")),
    readGeneratedMirrors(root),
  ])
  const notGenerated = (mirror: string) => (entry: SkillEntry) =>
    !generated.get(mirror)?.has(path.basename(path.dirname(entry.path)))
  return [
    ...shared,
    ...claudeSkills.filter(notGenerated(".claude/skills")),
    ...claudeCommands,
    ...kiroSkills.filter(notGenerated(".kiro/skills")),
  ]
}
