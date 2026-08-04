import { describe, it, expect } from "vitest"
import { setScheduledJobImpl } from "./set-scheduled-job-impl"
import type { ExecFileFn, CheckFn } from "./set-scheduled-job-impl"
import { PIPELINE_LAUNCHD_PLIST_PATH } from "./paths"

const loaded: CheckFn = async () => ({ loaded: true, lastExitStatus: 0 })
const notLoaded: CheckFn = async () => ({ loaded: false, lastExitStatus: null })
const ok: ExecFileFn = async () => ({ stdout: "", stderr: "" })

describe("setScheduledJobImpl", () => {
  it("enables by running `launchctl load` against the hardcoded plist", async () => {
    const calls: Array<[string, string[]]> = []
    const execFn: ExecFileFn = async (command, args) => {
      calls.push([command, args])
      return { stdout: "", stderr: "" }
    }
    const result = await setScheduledJobImpl(true, execFn, loaded)
    expect(calls).toEqual([["launchctl", ["load", PIPELINE_LAUNCHD_PLIST_PATH]]])
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(true)
  })

  it("disables by running `launchctl unload` against the hardcoded plist", async () => {
    const calls: Array<[string, string[]]> = []
    const execFn: ExecFileFn = async (command, args) => {
      calls.push([command, args])
      return { stdout: "", stderr: "" }
    }
    const result = await setScheduledJobImpl(false, execFn, notLoaded)
    expect(calls).toEqual([["launchctl", ["unload", PIPELINE_LAUNCHD_PLIST_PATH]]])
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(false)
  })

  // Defensive for when execFileFn throws (missing plist, permissions error,
  // different macOS version, etc.) but the state happens to already match the
  // request. This can occur because exit-code handling is unreliable: on macOS,
  // `launchctl` may report a failure on stderr while exiting 0, or may exit
  // non-zero on other failure modes. The only trustworthy signal is the state
  // read back after the attempt.
  it("reports success when the command fails but the job is already in the requested state", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("Unload failed: 113: Could not find specified service")
    }
    const result = await setScheduledJobImpl(false, execFn, notLoaded)
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(false)
  })

  it("reports failure with the command's error when the state did not change", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("Load failed: 5: Input/output error")
    }
    const result = await setScheduledJobImpl(false, execFn, loaded)
    expect(result.ok).toBe(false)
    expect(result.enabled).toBe(true)
    expect(result.message).toContain("Input/output error")
  })

  it("reports failure when the command succeeds but the state did not change", async () => {
    const result = await setScheduledJobImpl(false, ok, loaded)
    expect(result.ok).toBe(false)
    expect(result.enabled).toBe(true)
  })

  it("never passes a caller-supplied path — the plist argv token is the constant", async () => {
    const calls: string[][] = []
    const execFn: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }
    await setScheduledJobImpl(true, execFn, loaded)
    expect(calls[0][1]).toBe(PIPELINE_LAUNCHD_PLIST_PATH)
    expect(calls[0]).toHaveLength(2)
  })
})
