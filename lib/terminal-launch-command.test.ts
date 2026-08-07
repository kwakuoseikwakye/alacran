import { describe, it, expect } from "vitest"
import { resolveTerminalLaunchCommand, type ExecFileFn } from "./terminal-launch-command"

function fakeExec(installed: string[]): ExecFileFn {
  return async (command, args) => {
    if (command === "which" && installed.includes(args[0])) return { stdout: `/usr/bin/${args[0]}`, stderr: "" }
    throw new Error("not found")
  }
}

describe("resolveTerminalLaunchCommand", () => {
  it("always uses `open -a Terminal` on macOS, without probing anything", async () => {
    const launch = await resolveTerminalLaunchCommand("darwin", fakeExec([]))
    expect(launch?.command).toBe("open")
    expect(launch?.args("/tmp/script.sh")).toEqual(["-a", "Terminal", "/tmp/script.sh"])
  })

  it("prefers x-terminal-emulator on Linux when it's installed", async () => {
    const launch = await resolveTerminalLaunchCommand("linux", fakeExec(["x-terminal-emulator", "gnome-terminal"]))
    expect(launch?.command).toBe("x-terminal-emulator")
    expect(launch?.args("/tmp/script.sh")).toEqual(["-e", "/tmp/script.sh"])
  })

  it("falls back down the list to whatever is actually installed", async () => {
    const launch = await resolveTerminalLaunchCommand("linux", fakeExec(["xterm"]))
    expect(launch?.command).toBe("xterm")
  })

  it("uses `--` instead of `-e` for gnome-terminal", async () => {
    const launch = await resolveTerminalLaunchCommand("linux", fakeExec(["gnome-terminal"]))
    expect(launch?.args("/tmp/script.sh")).toEqual(["--", "/tmp/script.sh"])
  })

  it("returns null on Linux when no known terminal emulator is installed", async () => {
    const launch = await resolveTerminalLaunchCommand("linux", fakeExec([]))
    expect(launch).toBeNull()
  })

  it("returns null on an unsupported platform", async () => {
    const launch = await resolveTerminalLaunchCommand("win32", fakeExec(["gnome-terminal"]))
    expect(launch).toBeNull()
  })
})
