import { describe, it, expect } from "vitest"
import { checkDependenciesImpl } from "./check-dependencies-impl"
import type { ExecFileFn } from "./check-dependencies-impl"

describe("checkDependenciesImpl", () => {
  it("reports both present when `which` resolves and `claude --version` looks real", async () => {
    const execFn: ExecFileFn = async (command, args) =>
      command === "claude" && args[0] === "--version"
        ? { stdout: "2.1.226 (Claude Code)", stderr: "" }
        : { stdout: "/usr/bin/x", stderr: "" }
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: true, gog: true })
  })

  it("reports a dependency absent when `which` rejects for it", async () => {
    const execFn: ExecFileFn = async (command, args) => {
      if (args[0] === "gog") throw new Error("not found")
      if (command === "claude" && args[0] === "--version") return { stdout: "2.1.226 (Claude Code)", stderr: "" }
      return { stdout: "/usr/bin/claude", stderr: "" }
    }
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: true, gog: false })
  })

  it("reports both absent when `which` rejects for both", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("not found")
    }
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: false, gog: false })
  })

  it("reports claude absent when something else on the PATH is named claude but isn't the real CLI", async () => {
    const execFn: ExecFileFn = async (command, args) => {
      if (command === "claude" && args[0] === "--version") return { stdout: "", stderr: "" }
      return { stdout: "/usr/bin/x", stderr: "" }
    }
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: false, gog: true })
  })
})
