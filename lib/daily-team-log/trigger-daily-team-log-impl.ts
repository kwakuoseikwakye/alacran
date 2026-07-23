import { spawn as nodeSpawn } from "node:child_process"
import { openSync, closeSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { readDailyTeamLogConfig } from "./read-config"
import { buildDailyTeamLogPrompt } from "./build-prompt"
import { acquireLock, releaseLock } from "../file-lock"

export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number, number]
}
export type SpawnedProcess = {
  unref: () => void
  on: (event: "exit", listener: (code: number | null) => void) => void
}
export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => SpawnedProcess

export function defaultSpawn(command: string, args: string[], options: SpawnOptions): SpawnedProcess {
  return nodeSpawn(command, args, options)
}

const NOT_BOOTSTRAPPED_MESSAGE =
  "Not set up on this machine yet — run the daily-team-log skill's one-time setup first."

export async function triggerDailyTeamLogImpl(
  configPath: string,
  lockPath: string,
  logPath: string,
  spawnFn: SpawnFn = defaultSpawn
): Promise<{ started: boolean; message: string }> {
  const configResult = await readDailyTeamLogConfig(configPath)
  if (!configResult.ok) {
    return { started: false, message: NOT_BOOTSTRAPPED_MESSAGE }
  }
  const config = configResult.config

  const acquired = await acquireLock(lockPath)
  if (!acquired) {
    return { started: false, message: "Already running" }
  }

  let outFd: number | undefined
  try {
    const prompt = buildDailyTeamLogPrompt(config)
    const allowedTools = [
      "Read,Grep,Glob",
      `Edit(${config.outputRepo}/**)`,
      `Bash(git -C ${config.clone} pull*)`,
      `Bash(git -C ${config.clone} push*)`,
      `Bash(git -C ${config.outputRepo} add*)`,
      `Bash(git -C ${config.outputRepo} commit*)`,
      `Bash(python3 ${config.gatherPath}*)`,
    ].join(",")

    await mkdir(path.dirname(logPath), { recursive: true })
    outFd = openSync(logPath, "a")
    const child = spawnFn(
      "claude",
      ["-p", prompt, "--allowedTools", allowedTools, "--permission-mode", "default", "--output-format", "text"],
      { cwd: config.clone, detached: true, stdio: ["ignore", outFd, outFd] }
    )
    child.on("exit", () => {
      releaseLock(lockPath).catch(() => {})
    })
    child.unref()
    return { started: true, message: "Started" }
  } catch (err) {
    await releaseLock(lockPath).catch(() => {})
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (outFd !== undefined) closeSync(outFd)
  }
}
