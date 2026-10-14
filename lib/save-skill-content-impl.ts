import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveWritableSkillPath } from "./resolve-known-skill"
import { commitFile } from "./git-commit-file"
import { CANONICAL_SKILLS_DIR, syncAgentSkills } from "./skills/sync-agent-skills"
import type { ExecFileFn } from "./git-commit-file"

const MAX_COMMIT_MESSAGE_LENGTH = 500

export async function saveSkillContentImpl(
  filePath: string,
  newContent: string,
  execFn?: ExecFileFn,
  customMessage?: string
): Promise<{ saved: boolean; message: string }> {
  const resolved = await resolveWritableSkillPath(filePath)
  if (!resolved.ok) {
    return {
      saved: false,
      message:
        resolved.reason === "outside-root"
          ? "Refusing to write a path outside configured agent directories"
          : resolved.reason === "app-managed"
            ? "This skill is kept up to date by Alacrán, so it can't be edited here. Copy it to a new name to make it yours."
            : "Refusing to write a path that is not a known skill/command file",
    }
  }

  let currentContent: string
  try {
    currentContent = await readFile(resolved.realPath, "utf-8")
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }

  if (currentContent === newContent) {
    return { saved: false, message: "No changes to save" }
  }

  const trimmedMessage = customMessage?.trim()
  if (trimmedMessage && trimmedMessage.length > MAX_COMMIT_MESSAGE_LENGTH) {
    return {
      saved: false,
      message: `Commit message is too long (max ${MAX_COMMIT_MESSAGE_LENGTH} characters)`,
    }
  }

  try {
    await writeFile(resolved.realPath, newContent, "utf-8")
    const relativePath = path.relative(resolved.agentRootPath, resolved.realPath)
    // Editing the shared copy: bring each agent's generated copy up to date and commit them together.
    const shared = relativePath.split(path.sep).join("/").startsWith(`${CANONICAL_SKILLS_DIR}/`)
    const mirrored = shared ? await syncAgentSkills(resolved.agentRootPath).catch(() => null) : null
    const fileName = path.basename(resolved.realPath)
    const commitMessage = trimmedMessage || `Edit ${fileName} via AI-Native control panel`
    try {
      await commitFile(resolved.agentRootPath, mirrored ? [relativePath, ...mirrored.written] : relativePath, commitMessage, execFn)
    } catch (err) {
      // Git refuses the whole commit when one path is ignored (a repo that ignores .claude/ or .kiro/).
      // The edit must still be saved and committed exactly as it was before copies existed; the copies
      // are already correct on disk.
      if (!mirrored) throw err
      await commitFile(resolved.agentRootPath, relativePath, commitMessage, execFn)
    }
    return { saved: true, message: "Saved and committed" }
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }
}
