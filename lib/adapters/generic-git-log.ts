import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import type { Activity, Agent } from "./types"
import type { ExecFileFn } from "../git-commit-file"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

const RECORD_SEP = "\x1e"
const FIELD_SEP = "\x1f"
const LOG_FORMAT = `%H${FIELD_SEP}%aI${FIELD_SEP}%s${RECORD_SEP}`

export async function genericGitLogActivityAdapter(
  agent: Agent,
  execFn: ExecFileFn = defaultExecFile
): Promise<Activity[]> {
  try {
    const { stdout } = await execFn("git", ["-C", agent.rootPath, "log", `--format=${LOG_FORMAT}`, "-20"])
    return stdout
      .split(RECORD_SEP)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [sha, date, message] = chunk.split(FIELD_SEP)
        return {
          id: sha,
          agentId: agent.id,
          type: "commit",
          timestamp: Math.floor(new Date(date).getTime() / 1000),
          title: message,
          status: "done" as const,
          detailPath: agent.rootPath,
        }
      })
  } catch {
    return []
  }
}
