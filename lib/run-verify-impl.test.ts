import { describe, it, expect, afterEach, vi } from "vitest"
import type { ExecFileFn } from "./run-verify-impl"

afterEach(() => {
  vi.resetModules()
})

// ./config's AGENTS is existence-gated against a real ~/AI-Native/* directory
// (see lib/builtin-agents.ts) — every test below except the last one needs a
// real "ai-company-starter-main" entry to find, so ./config must be mocked
// explicitly rather than relying on that directory happening to exist on
// whatever machine runs the suite (true on this repo's own dev machine,
// false on a clean checkout/CI runner).
function mockConfiguredAgent() {
  vi.doMock("./config", () => ({
    AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/fake/root", kind: "command-set" }],
  }))
}

describe("runVerifyImpl", () => {
  it("returns passed:true when the script exits 0 with all-PASS rows", async () => {
    mockConfiguredAgent()
    const { runVerifyImpl } = await import("./run-verify-impl")
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
    mockConfiguredAgent()
    const { runVerifyImpl } = await import("./run-verify-impl")
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
    mockConfiguredAgent()
    const { runVerifyImpl } = await import("./run-verify-impl")
    const fakeExec: ExecFileFn = async () => {
      throw new Error("spawn python3 ENOENT")
    }

    const result = await runVerifyImpl(fakeExec)

    expect(result).toEqual({ ran: false, passed: false, rows: [], message: "spawn python3 ENOENT" })
  })

  it("returns ran:false when stdout is not valid JSON even on a successful exit", async () => {
    mockConfiguredAgent()
    const { runVerifyImpl } = await import("./run-verify-impl")
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
