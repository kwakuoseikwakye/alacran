import { readFile, writeFile, realpath } from "node:fs/promises"
import path from "node:path"
import { resolveWithinAgentRoot } from "./path-guard"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { AGENTS, SKILL_ADAPTERS } from "./config"
import { getAllSkills } from "./get-all-skills"

export async function saveSkillContentImpl(
  filePath: string,
  newContent: string,
  execFn?: ExecFileFn
): Promise<{ saved: boolean; message: string }> {
  const guard = await resolveWithinAgentRoot(filePath)
  if (!guard) {
    return { saved: false, message: "Refusing to write a path outside configured agent directories" }
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
    return { saved: false, message: "Refusing to write a path that is not a known skill/command file" }
  }

  let currentContent: string
  try {
    currentContent = await readFile(guard.realPath, "utf-8")
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }

  if (currentContent === newContent) {
    return { saved: false, message: "No changes to save" }
  }

  try {
    await writeFile(guard.realPath, newContent, "utf-8")
    const relativePath = path.relative(guard.agentRootPath, guard.realPath)
    const fileName = path.basename(guard.realPath)
    await commitFile(guard.agentRootPath, relativePath, `Edit ${fileName} via AI-Native control panel`, execFn)
    return { saved: true, message: "Saved and committed" }
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }
}
