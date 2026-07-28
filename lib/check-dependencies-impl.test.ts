import { describe, it, expect } from "vitest"
import { checkDependenciesImpl } from "./check-dependencies-impl"
import type { ExecFileFn } from "./check-dependencies-impl"

describe("checkDependenciesImpl", () => {
  it("reports both present when `which` resolves for both", async () => {
    const execFn: ExecFileFn = async () => ({ stdout: "/usr/bin/x", stderr: "" })
    expect(await checkDependenciesImpl(execFn)).toEqual({ claude: true, gog: true })
  })

  it("reports a dependency absent when `which` rejects for it", async () => {
    const execFn: ExecFileFn = async (_command, args) => {
      if (args[0] === "gog") throw new Error("not found")
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
})
