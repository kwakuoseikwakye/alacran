import { describe, it, expect } from "vitest"
import { getConnectStatusImpl, type ExecFileFn } from "./connect-status-impl"

/** Build a fake ExecFileFn from a handler map keyed by "command arg0 arg1 ...". */
function fakeExec(handler: (command: string, args: string[]) => { stdout: string } | Error): ExecFileFn {
  return async (command, args) => {
    const res = handler(command, args)
    if (res instanceof Error) throw res
    return { stdout: res.stdout, stderr: "" }
  }
}

const GOG_CONNECTED = JSON.stringify({
  account: { email: "user@example.com", credentials_exists: true },
})

describe("getConnectStatusImpl", () => {
  it("reports both connected, with the Google account email in the detail", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec)

    expect(status.claude.connected).toBe(true)
    expect(status.google.connected).toBe(true)
    expect(status.google.detail).toContain("user@example.com")
  })

  it("marks Claude not connected with install guidance when the CLI is missing", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "claude") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog") return { stdout: GOG_CONNECTED }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec)

    expect(status.claude.connected).toBe(false)
    expect(status.claude.guidance.command).toContain("claude-code")
    // The other tool still resolves independently.
    expect(status.google.connected).toBe(true)
  })

  it("marks Google not connected with install guidance when gog is missing", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "gog") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec)

    expect(status.google.connected).toBe(false)
    expect(status.google.guidance.command).toContain("gog")
    expect(status.claude.connected).toBe(true)
  })

  it("guides `gog auth setup` when gog is installed but no account is connected", async () => {
    const exec = fakeExec((command) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "", credentials_exists: false } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec)

    expect(status.google.connected).toBe(false)
    expect(status.google.guidance.command).toBe("gog auth setup")
  })

  it("does not crash on malformed gog JSON", async () => {
    const exec = fakeExec((command) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "gog") return { stdout: "not json {{{" }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec)

    expect(status.google.connected).toBe(false)
    expect(status.google.guidance.command).toBe("gog auth setup")
  })
})
