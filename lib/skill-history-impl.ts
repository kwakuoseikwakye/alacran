import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { resolveKnownSkillPath } from "./resolve-known-skill"
import type { ExecFileFn } from "./git-commit-file"

const execFileAsync = promisify(nodeExecFile)

export type SkillCommit = { sha: string; date: string; message: string }
export type SkillHistoryResult = { ok: boolean; commits: SkillCommit[]; message: string }
export type SkillRevisionResult = { ok: boolean; content: string; message: string }

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

const RECORD_SEP = "\x1e"
const FIELD_SEP = "\x1f"
const LOG_FORMAT = `%H${FIELD_SEP}%aI${FIELD_SEP}%s${RECORD_SEP}`

function boundaryMessage(reason: "outside-root" | "not-a-known-skill", verb: string): string {
  return reason === "outside-root"
    ? `Refusing to ${verb} for a path outside configured agent directories`
    : `Refusing to ${verb} for a path that is not a known skill/command file`
}

export async function getSkillHistoryImpl(
  filePath: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<SkillHistoryResult> {
  const resolved = await resolveKnownSkillPath(filePath)
  if (!resolved.ok) {
    return { ok: false, commits: [], message: boundaryMessage(resolved.reason, "read history") }
  }

  const relativePath = path.relative(resolved.agentRootPath, resolved.realPath)

  try {
    const { stdout } = await execFn("git", [
      "-C",
      resolved.agentRootPath,
      "log",
      `--format=${LOG_FORMAT}`,
      "--",
      relativePath,
    ])
    const commits = stdout
      .split(RECORD_SEP)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [sha, date, message] = chunk.split(FIELD_SEP)
        return { sha, date, message }
      })
    return { ok: true, commits, message: "" }
  } catch (err) {
    return { ok: false, commits: [], message: err instanceof Error ? err.message : String(err) }
  }
}

export async function getSkillRevisionImpl(
  filePath: string,
  sha: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<SkillRevisionResult> {
  const resolved = await resolveKnownSkillPath(filePath)
  if (!resolved.ok) {
    return { ok: false, content: "", message: boundaryMessage(resolved.reason, "view history") }
  }

  if (!/^[0-9a-f]{4,40}$/i.test(sha)) {
    return { ok: false, content: "", message: "Invalid revision" }
  }

  const relativePath = path.relative(resolved.agentRootPath, resolved.realPath)

  try {
    const { stdout } = await execFn("git", ["-C", resolved.agentRootPath, "show", `${sha}:${relativePath}`])
    return { ok: true, content: stdout, message: "" }
  } catch (err) {
    return { ok: false, content: "", message: err instanceof Error ? err.message : String(err) }
  }
}
