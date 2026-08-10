import { describe, it, expect } from "vitest"
import { isClaudeCodeCli } from "./is-claude-code-cli"

describe("isClaudeCodeCli", () => {
  it("is true for the real CLI's version output", async () => {
    const exec = async (command: string) =>
      command === "claude" ? { stdout: "2.1.226 (Claude Code)\n", stderr: "" } : { stdout: "/usr/bin/claude", stderr: "" }
    expect(await isClaudeCodeCli(exec)).toBe(true)
  })

  it("is false when `which claude` finds nothing", async () => {
    const exec = async () => {
      throw new Error("not found")
    }
    expect(await isClaudeCodeCli(exec)).toBe(false)
  })

  it("is false for a same-named binary that isn't Claude Code — the reported false positive", async () => {
    // e.g. a Homebrew Cask launcher shim for the Claude desktop app: `which
    // claude` succeeds, but running it doesn't behave like the real CLI.
    const exec = async (command: string, args: string[]) => {
      if (command === "which") return { stdout: "/opt/homebrew/bin/claude", stderr: "" }
      if (command === "claude" && args[0] === "--version") return { stdout: "", stderr: "" }
      throw new Error(`unexpected ${command}`)
    }
    expect(await isClaudeCodeCli(exec)).toBe(false)
  })

  it("is false when running the binary throws (e.g. a GUI launcher that hangs/exits oddly)", async () => {
    const exec = async (command: string) => {
      if (command === "which") return { stdout: "/opt/homebrew/bin/claude", stderr: "" }
      throw new Error("spawn error")
    }
    expect(await isClaudeCodeCli(exec)).toBe(false)
  })
})
