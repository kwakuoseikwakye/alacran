import { describe, it, expect, afterEach, vi } from "vitest"
import { runVerifyImpl } from "./run-verify-impl"
import type { ExecFileFn } from "./run-verify-impl"

afterEach(() => {
  vi.resetModules()
})

describe("runVerifyImpl", () => {
  it("returns passed:true when the script exits 0 with all-PASS rows", async () => {
    const fakeExec: ExecFileFn = async () => ({
      stdout: JSON.stringify({
        rows: [{ category: "STRUCTURE", id: "STRUCTURE-01", status: "PASS", message: "ok" }],
      }),
      stderr: "",
    })

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({
      ran: true,
      passed: true,
      rows: [{ category: "STRUCTURE", id: "STRUCTURE-01", status: "PASS", message: "ok" }],
      message: "All checks passed",
    })
  })

  it("treats a nonzero exit carrying valid JSON on stdout as a legitimate failed result, not a trigger error", async () => {
    const rows = [{ category: "HYGIENE", id: "HYGIENE-01", status: "FAIL", message: "found a TODO(temp) marker" }]
    const fakeExec: ExecFileFn = async () => {
      const err = new Error("Command failed with exit code 1") as Error & { stdout: string; stderr: string }
      err.stdout = JSON.stringify({ rows })
      err.stderr = ""
      throw err
    }

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({ ran: true, passed: false, rows, message: "Some checks failed" })
  })

  it("returns ran:false when the exec call fails with no parseable stdout", async () => {
    const fakeExec: ExecFileFn = async () => {
      throw new Error("spawn python3 ENOENT")
    }

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({ ran: false, passed: false, rows: [], message: "spawn python3 ENOENT" })
  })

  it("returns ran:false when stdout is not valid JSON even on a successful exit", async () => {
    const fakeExec: ExecFileFn = async () => ({ stdout: "not json", stderr: "" })

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({
      ran: false,
      passed: false,
      rows: [],
      message: "verify.py produced unparseable output",
    })
  })

  it("returns ran:false when the agent isn't configured", async () => {
    vi.doMock("./config", () => ({ AGENTS: [] }))
    const { runVerifyImpl: mockedRunVerifyImpl } = await import("./run-verify-impl")

    const result = await mockedRunVerifyImpl(async () => ({ stdout: "", stderr: "" }))

    expect(result).toEqual({
      ran: false,
      passed: false,
      rows: [],
      message: 'Agent "ai-company-starter-main" is not configured',
    })
  })
})
