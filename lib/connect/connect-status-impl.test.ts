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

  it("marks Google not connected with a brew install command on macOS when gog is missing", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "gog") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "darwin")

    expect(status.google.connected).toBe(false)
    expect(status.google.guidance.command).toContain("gog")
    expect(status.claude.connected).toBe(true)
  })

  it("omits the macOS-only brew command on Linux, keeping the install link", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && (args[0] === "gog" || args[0] === "gh")) return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "linux")

    expect(status.google.guidance.command).toBeUndefined()
    expect(status.google.guidance.link).toBe("https://github.com/gogcli/gog")
    expect(status.github.guidance.command).toBeUndefined()
    expect(status.github.guidance.link).toBe("https://cli.github.com")
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

  it("reports GitHub signed in with the login name", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gh") return { stdout: "octocat\n" }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "a@b.c", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec)

    expect(status.github.connected).toBe(true)
    expect(status.github.detail).toContain("octocat")
  })

  it("guides installing gh with a brew command on macOS when the GitHub CLI is missing", async () => {
    const exec = fakeExec((command, args) => {
      if (command === "which" && args[0] === "gh") return new Error("not found")
      if (command === "which") return { stdout: `/usr/local/bin/${args[0]}` }
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "a@b.c", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec, "darwin")

    expect(status.github.connected).toBe(false)
    expect(status.github.guidance.command).toBe("brew install gh")
  })

  it("guides `gh auth login` when gh is installed but unauthenticated", async () => {
    const exec = fakeExec((command) => {
      if (command === "which") return { stdout: "/usr/local/bin/x" }
      if (command === "gh") return new Error("gh: not authenticated")
      if (command === "gog")
        return { stdout: JSON.stringify({ account: { email: "a@b.c", credentials_exists: true } }) }
      return new Error(`unexpected ${command}`)
    })
    const status = await getConnectStatusImpl(exec)

    expect(status.github.connected).toBe(false)
    expect(status.github.guidance.command).toBe("gh auth login")
  })
})
