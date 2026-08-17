import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveWritableSkillPath } from "./resolve-known-skill"
import { commitFile } from "./git-commit-file"
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
    const fileName = path.basename(resolved.realPath)
    const commitMessage = trimmedMessage || `Edit ${fileName} via AI-Native control panel`
    await commitFile(resolved.agentRootPath, relativePath, commitMessage, execFn)
    return { saved: true, message: "Saved and committed" }
  } catch (err) {
    return { saved: false, message: err instanceof Error ? err.message : String(err) }
  }
}
