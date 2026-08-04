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
 * The exit code is NOT the source of truth — the resulting state is. Measured
 * on macOS 26.2: a redundant `unload` on an already-unloaded plist prints
 * `Unload failed: 5: Input/output error` to stderr but exits 0, so
 * `promisify(execFile)` never rejects and a stderr-only failure would pass
 * silently. We also catch a thrown error so an unobserved failure mode
 * (missing plist, permissions) can't turn into a rejected Server Action — a
 * non-zero exit there would be *correct* signalling, not unreliability; the
 * catch exists for safety, not because exit codes can't be trusted. Either
 * way, we read the real state back via `checkLaunchdJob` and compare it
 * against what was requested. That single check covers both cases without
 * needing to know in advance which exit code any given failure produces.
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
        : "Scheduled runs stopped. A run already in progress was stopped too.",
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
