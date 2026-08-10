import { spawn as nodeSpawn } from "node:child_process"
import { openSync, closeSync } from "node:fs"
import path from "node:path"
import { AGENTS } from "./config"
import { checkPollLockStatus } from "./adapters/poll-lock"

export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number, number]
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptions
) => {
  unref: () => void
  // A spawn that fails to start (bash missing, poll.sh gone) emits "error";
  // with no listener that is an uncaught exception, not a caught one — the
  // try/catch below cannot see it, because it fires after this call returns.
  on: (event: "error", listener: (err: Error) => void) => void
}

const pipeline_AGENT_ID = "email-pipeline-agent"

export function defaultSpawn(command: string, args: string[], options: SpawnOptions) {
  return nodeSpawn(command, args, options)
}

export async function triggerPollImpl(
  spawnFn: SpawnFn = defaultSpawn
): Promise<{ started: boolean; message: string }> {
  const agent = AGENTS.find((a) => a.id === pipeline_AGENT_ID)
  if (!agent) {
    return { started: false, message: `Agent "${pipeline_AGENT_ID}" is not configured` }
  }

  const lockStatus = await checkPollLockStatus(agent.rootPath)
  if (lockStatus.running) {
    return { started: false, message: "Already running" }
  }

  let outFd: number | undefined
  let errFd: number | undefined
  try {
    const outPath = path.join(agent.rootPath, "logs", "poll.out.log")
    const errPath = path.join(agent.rootPath, "logs", "poll.err.log")
    outFd = openSync(outPath, "a")
    errFd = openSync(errPath, "a")
    const child = spawnFn("bash", [path.join(agent.rootPath, "bin", "poll.sh")], {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", outFd, errFd],
    })
    // The poll's own lock lives in the agent repo and is written by poll.sh
    // itself, so there is nothing here to release — this listener exists
    // purely so a failed spawn can't take the server down with it.
    child.on("error", () => {})
    child.unref()
    return { started: true, message: "Poll started" }
  } catch (err) {
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (outFd !== undefined) closeSync(outFd)
    if (errFd !== undefined) closeSync(errFd)
  }
}
