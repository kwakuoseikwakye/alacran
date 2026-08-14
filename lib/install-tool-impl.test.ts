import { describe, expect, it } from "vitest"
import { installToolImpl, type ExecFileFn } from "./install-tool-impl"

/** Records every spawn, answers `which`/`--version` from a presence set that
 *  the install command can flip — so "did the tool actually appear" is a real
 *  transition, not a hardcoded answer. */
function fakeExec(opts: {
  present?: Set<string>
  installs?: string
  fail?: boolean
}): { exec: ExecFileFn; calls: [string, string[]][] } {
  const present = opts.present ?? new Set<string>()
  const calls: [string, string[]][] = []
  const exec: ExecFileFn = async (command, args) => {
    calls.push([command, args])
    if (command === "bash") {
      if (opts.installs) present.add(opts.installs)
      if (opts.fail) throw Object.assign(new Error("exit 1"), { stdout: "", stderr: "boom" })
      return { stdout: "installed\n", stderr: "" }
    }
    if (command === "which") {
      if (present.has(args[0])) return { stdout: `/x/${args[0]}`, stderr: "" }
      throw new Error("not found")
    }
    if (command === "claude" && args[0] === "--version") {
      if (present.has("claude")) return { stdout: "2.1.226 (Claude Code)", stderr: "" }
      throw new Error("not found")
    }
    throw new Error(`unexpected ${command}`)
  }
  return { exec, calls }
}

describe("installToolImpl", () => {
  it("runs the verified Claude Code installer and confirms it landed", async () => {
    const { exec, calls } = fakeExec({ installs: "claude" })
    const result = await installToolImpl("claude-code", exec, "darwin")

    expect(result.ok).toBe(true)
    expect(calls[0]).toEqual(["bash", ["-lc", "curl -fsSL https://claude.ai/install.sh | bash"]])
  })

  it("uses homebrew-core for gog — no tap, per v48", async () => {
    const { exec, calls } = fakeExec({ installs: "gog" })
    const result = await installToolImpl("gog", exec, "darwin")

    expect(result.ok).toBe(true)
    expect(calls[0]).toEqual(["bash", ["-lc", "brew install gogcli"]])
  })

  it("never invents a command for Antigravity — it defers to the agent", async () => {
    const { exec, calls } = fakeExec({})
    const result = await installToolImpl("google-antigravity", exec, "darwin")

    expect(result).toEqual({ ok: false, needsAgent: true, log: "" })
    expect(calls).toEqual([])
  })

  it("has no Linux command for the brew-only tools, and asks for the agent instead", async () => {
    const { exec } = fakeExec({})
    expect(await installToolImpl("gh", exec, "linux")).toEqual({ ok: false, needsAgent: true, log: "" })
    // Claude Code's installer is not brew-based, so it still runs on Linux.
    const claude = await installToolImpl("claude-code", fakeExec({ installs: "claude" }).exec, "linux")
    expect(claude.ok).toBe(true)
  })

  it("believes the probe, not the exit code: a failing command that still installed counts as ok", async () => {
    // Real shape: a Homebrew post-install warning exits non-zero having
    // installed the binary. v31 established that an OS tool's exit code can
    // lie in both directions, so success is always read back from the system.
    const { exec } = fakeExec({ installs: "gh", fail: true })
    const result = await installToolImpl("gh", exec, "darwin")

    expect(result.ok).toBe(true)
    expect(result.log).toContain("boom")
  })

  it("asks for the agent when the command ran but the tool still isn't there", async () => {
    const { exec } = fakeExec({ fail: true })
    const result = await installToolImpl("gh", exec, "darwin")

    expect(result.ok).toBe(false)
    expect(result.needsAgent).toBe(true)
    expect(result.log).toContain("$ brew install gh")
  })

  it("checks Claude Code by its --version signature, not a bare `which`", async () => {
    // A Homebrew Cask shim for the desktop app satisfies `which claude` — the
    // real v53 false positive. Presence alone must not count as installed.
    const { exec } = fakeExec({ present: new Set(["claude"]), installs: "" })
    const shimOnly: ExecFileFn = async (command, args) => {
      if (command === "bash") return { stdout: "", stderr: "" }
      if (command === "which") return { stdout: "/x/claude", stderr: "" }
      if (command === "claude") return { stdout: "Claude Desktop 1.0", stderr: "" }
      return exec(command, args)
    }
    const result = await installToolImpl("claude-code", shimOnly, "darwin")

    expect(result.ok).toBe(false)
    expect(result.needsAgent).toBe(true)
  })
})

describe("input validation at the Server Action boundary", () => {
  it("fails closed on an unknown id rather than throwing a TypeError", async () => {
    const { exec, calls } = fakeExec({})
    const result = await installToolImpl("../../etc" as never, exec, "darwin")

    expect(result.ok).toBe(false)
    expect(result.needsAgent).toBe(false)
    expect(calls).toEqual([])
  })
})
