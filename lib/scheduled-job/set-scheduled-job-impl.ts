import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { checkLaunchdJob } from "../adapters/launchd"
import type { LaunchdHealth } from "../adapters/launchd"
import { TAKESHI_AGENT_LAUNCHD_LABEL } from "../config"
import { TAKESHI_LAUNCHD_PLIST_PATH } from "./paths"

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
 * Loads or unloads the Takeshi agent's LaunchAgent, always with `-w` so "off"
 * is durable — not just for this login session.
 *
 * Measured on macOS 26.2: a bare `unload` (no `-w`) writes no persistent
 * disable override at all — the label stays absent from `launchctl
 * print-disabled gui/$UID` — so the previous bare-`unload` design had nothing
 * backing "off" across a logout or reboot. Only `unload -w` writes a `=>
 * disabled` entry there, which is why Stop now uses it. Start therefore has
 * to clear that same override, and `launchctl load -w` was measured (v31,
 * macOS 26.2, two independent round-trips against a disposable job) to
 * reliably do exactly that: the override read back as `=> enabled` and the
 * job reappeared in `launchctl list` both times.
 *
 * The exit code is NOT the source of truth — the resulting state is, and
 * this matters in two independent, unrelated ways, both measured on macOS
 * 26.2. First: a redundant `unload` on an already-unloaded plist prints
 * `Unload failed: 5: Input/output error` to stderr but exits 0. Second: a
 * bare `load` (no `-w`) while the disable override is set does not load the
 * job — it stays absent from `launchctl list` — while *also* exiting 0 and
 * reporting `Load failed: 5: Input/output error` on stderr only. That is a
 * second, independent instance of the same exit-code-lies pattern, on the
 * opposite verb. `promisify(execFile)` only rejects on a non-zero exit, so
 * neither of these ever throws — a stderr-only failure would pass silently
 * in both directions without the state re-check below. We also catch a
 * thrown error so an unobserved failure mode (missing plist, permissions)
 * can't turn into a rejected Server Action — a non-zero exit there would be
 * *correct* signalling, not unreliability; the catch exists for safety, not
 * because exit codes can't be trusted. Either way, we read the real state
 * back via `checkLaunchdJob` and compare it against what was requested. That
 * single check covers all of the above without needing to know in advance
 * which exit code any given failure produces.
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
      "-w",
      TAKESHI_LAUNCHD_PLIST_PATH,
    ])
  } catch (error) {
    commandError = error instanceof Error ? error.message : String(error)
  }

  const health = await checkFn(TAKESHI_AGENT_LAUNCHD_LABEL)

  if (health.loaded === enabled) {
    return {
      ok: true,
      enabled: health.loaded,
      message: enabled
        ? "Scheduled runs enabled — the agent polls every 5 minutes."
        : "Scheduled runs stopped, including any run already in progress — off persists across logout and reboot until you start it again.",
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
