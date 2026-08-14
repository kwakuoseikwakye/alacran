import { describe, expect, it } from "vitest"
import { buildRepairPrompt, installRepairImpl } from "./install-repair-impl"
import type { ExecFileFn } from "./install-tool-impl"

function fakeExec(opts: { installs?: string; transcript?: string }): {
  exec: ExecFileFn
  calls: [string, string[]][]
} {
  const present = new Set<string>()
  const calls: [string, string[]][] = []
  const exec: ExecFileFn = async (command, args) => {
    calls.push([command, args])
    if (command === "claude" && args[0] === "-p") {
      if (opts.installs) present.add(opts.installs)
      return { stdout: opts.transcript ?? "done", stderr: "" }
    }
    if (command === "which") {
      if (present.has(args[0])) return { stdout: `/x/${args[0]}`, stderr: "" }
      throw new Error("not found")
    }
    if (command === "claude") return { stdout: "2.1.226 (Claude Code)", stderr: "" }
    throw new Error(`unexpected ${command}`)
  }
  return { exec, calls }
}

describe("buildRepairPrompt", () => {
  it("hands the agent the exact failure, not a paraphrase", () => {
    const prompt = buildRepairPrompt("gh", "$ brew install gh\nbash: brew: command not found")
    expect(prompt).toContain("bash: brew: command not found")
    expect(prompt).toContain("which gh")
  })

  it("says nothing has been tried when there is no verified command", () => {
    expect(buildRepairPrompt("google-antigravity", "")).toContain("no verified install command")
  })

  it("forbids sudo in the prompt itself, not only in the allowlist", () => {
    expect(buildRepairPrompt("gh", "boom")).toContain("Do NOT use sudo")
  })
})

describe("installRepairImpl", () => {
  it("spawns a scoped agent — never --dangerously-skip-permissions", async () => {
    const { exec, calls } = fakeExec({ installs: "gh" })
    await installRepairImpl("gh", "brew: not found", exec, "/Users/test")

    const [command, args] = calls[0]
    expect(command).toBe("claude")
    expect(args).toContain("--allowedTools")
    expect(args).toContain("--permission-mode")
    expect(args).toContain("manual")
    expect(args).not.toContain("--dangerously-skip-permissions")
  })

  it("scopes Bash to a fixed allowlist that excludes sudo", async () => {
    const { exec, calls } = fakeExec({ installs: "gh" })
    await installRepairImpl("gh", "boom", exec, "/Users/test")

    const allowed = calls[0][1][calls[0][1].indexOf("--allowedTools") + 1]
    expect(allowed).toContain("Bash(brew *)")
    expect(allowed).toContain("Bash(curl *)")
    expect(allowed).not.toContain("sudo")
    // A blanket Bash grant would defeat the entire allowlist.
    expect(allowed).not.toContain("Bash(*)")
  })

  it("believes the machine, not the agent's transcript", async () => {
    // The agent confidently reports success while installing nothing — the
    // exact failure mode a self-report can't catch.
    const { exec } = fakeExec({ transcript: "All done! gh is installed." })
    const result = await installRepairImpl("gh", "boom", exec, "/Users/test")

    expect(result.ok).toBe(false)
    expect(result.needsAgent).toBe(true)
    expect(result.transcript).toContain("All done!")
  })

  it("reports success when the binary really did appear", async () => {
    const { exec } = fakeExec({ installs: "gh" })
    const result = await installRepairImpl("gh", "boom", exec, "/Users/test")

    expect(result.ok).toBe(true)
    expect(result.needsAgent).toBeUndefined()
  })

  it("verifies Claude Code by its version signature, so a desktop-app shim can't pass", async () => {
    const shim: ExecFileFn = async (command, args) => {
      if (command === "claude" && args[0] === "-p") return { stdout: "installed it", stderr: "" }
      if (command === "which") return { stdout: "/x/claude", stderr: "" }
      if (command === "claude") return { stdout: "Claude Desktop 1.0", stderr: "" }
      throw new Error(`unexpected ${command}`)
    }
    const result = await installRepairImpl("claude-code", "", shim, "/Users/test")

    expect(result.ok).toBe(false)
  })

  it("still reports a verdict when the agent itself errors out", async () => {
    const failing: ExecFileFn = async (command, args) => {
      if (command === "claude" && args[0] === "-p") {
        throw Object.assign(new Error("agent crashed"), { stdout: "", stderr: "boom" })
      }
      throw new Error("not found")
    }
    const result = await installRepairImpl("gh", "", failing, "/Users/test")

    expect(result.ok).toBe(false)
    expect(result.transcript).toContain("boom")
  })
})
