import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { checkLaunchdJob } from "../adapters/launchd"
import type { LaunchdHealth } from "../adapters/launchd"
import { PIPELINE_LAUNCHD_LABEL } from "../config"
import { PIPELINE_LAUNCHD_PLIST_PATH } from "./paths"

const execFileAsync = promisify(execFile)

export type ExecFileFn = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>

export type CheckFn = (label: string) => Promise<LaunchdHealth>

export type SetScheduledJobResult = {
  ok: boolean
  /** The job's ACTUAL loaded state after the attempt, never an assumption. */
  enabled: boolean
  message: string
}

export async function defaultExecFile(command: string, args: string[]) {
  const { stdout, stderr } = await execFileAsync(command, args)
  return { stdout, stderr }
}

const defaultCheck: CheckFn = (label) => checkLaunchdJob(label)

/**
 * Loads or unloads the Owner agent's LaunchAgent.
 *
 * The exit code is NOT the source of truth — the resulting state is. `launchctl
 * unload` on an already-unloaded plist (and `load` on an already-loaded one)
 * exits non-zero even though the job ends up in exactly the requested state, so
 * naive exit-code handling reports a spurious failure. We run the command, then
 * read the real state back and compare it against what was asked for.
 */
export async function setScheduledJobImpl(
  enabled: boolean,
  execFileFn: ExecFileFn = defaultExecFile,
  checkFn: CheckFn = defaultCheck
): Promise<SetScheduledJobResult> {
  let commandError: string | null = null
  try {
    await execFileFn("launchctl", [
      enabled ? "load" : "unload",
      PIPELINE_LAUNCHD_PLIST_PATH,
    ])
  } catch (error) {
    commandError = error instanceof Error ? error.message : String(error)
  }

  const health = await checkFn(PIPELINE_LAUNCHD_LABEL)

  if (health.loaded === enabled) {
    return {
      ok: true,
      enabled: health.loaded,
      message: enabled
        ? "Scheduled runs enabled — the agent polls every 5 minutes."
        : "Scheduled runs stopped. A run already in progress will still finish.",
    }
  }

  return {
    ok: false,
    enabled: health.loaded,
    message: commandError
      ? `Could not change scheduled runs: ${commandError}`
      : `Could not change scheduled runs — the job is still ${health.loaded ? "loaded" : "not loaded"}.`,
  }
}
