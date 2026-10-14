import { describe, it, expect, afterEach, vi } from "vitest"
import type { ExecFileFn } from "./run-verify-impl"
import type { Agent } from "./adapters/types"

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

const rowsJson = JSON.stringify({ rows: [{ category: "secrets", id: "gitignore", status: "PASS", message: "ok" }] })

describe("runVerifyInRoot", () => {
  it("runs scripts/verify.py in the given root and returns the rows", async () => {
    const { runVerifyInRoot } = await import("./run-verify-impl")
    const execFn = vi.fn(async () => ({ stdout: rowsJson, stderr: "" })) as unknown as ExecFileFn
    const out = await runVerifyInRoot("/tmp/acme", execFn)
    expect(execFn).toHaveBeenCalledWith("python3", ["/tmp/acme/scripts/verify.py", "--json"], { cwd: "/tmp/acme" })
    expect(out).toMatchObject({ ran: true, passed: true })
    expect(out.rows).toHaveLength(1)
  })

  it("reports failing checks as a result, with the script's own rows", async () => {
    const { runVerifyInRoot } = await import("./run-verify-impl")
    const execFn = (async () => {
      throw Object.assign(new Error("exit 1"), { stdout: JSON.stringify({ rows: [{ category: "x", id: "y", status: "FAIL", message: "bad" }] }) })
    }) as unknown as ExecFileFn
    const out = await runVerifyInRoot("/tmp/acme", execFn)
    expect(out).toMatchObject({ ran: true, passed: false, message: "Some checks failed" })
    expect(out.rows[0].status).toBe("FAIL")
  })

  it("says plainly when the company has no verify script", async () => {
    const { runVerifyInRoot } = await import("./run-verify-impl")
    const execFn = (async () => {
      throw Object.assign(new Error("python3: can't open file '/tmp/acme/scripts/verify.py': [Errno 2] No such file or directory"), { stdout: "" })
    }) as unknown as ExecFileFn
    const out = await runVerifyInRoot("/tmp/acme", execFn)
    expect(out).toEqual({ ran: false, passed: false, rows: [], message: "This company has no scripts/verify.py, so there are no checks to run." })
  })

  it("passes a crashing script's own traceback through, and does not call a present script missing", async () => {
    const { runVerifyInRoot } = await import("./run-verify-impl")
    const raw = [
      "Command failed: python3 /tmp/acme/scripts/verify.py --json",
      "Traceback (most recent call last):",
      '  File "/tmp/acme/scripts/verify.py", line 3, in <module>',
      "FileNotFoundError: [Errno 2] No such file or directory: '/nonexistent/data.txt'",
    ].join("\n")
    const execFn = (async () => {
      throw Object.assign(new Error(raw), { stdout: "" })
    }) as unknown as ExecFileFn
    const out = await runVerifyInRoot("/tmp/acme", execFn)
    expect(out).toEqual({ ran: false, passed: false, rows: [], message: raw })
  })
})

describe("a verify script that hangs", () => {
  it("says the checks took too long when the exec was stopped by its timeout", async () => {
    const { runVerifyInRoot } = await import("./run-verify-impl")
    // The shape node gives a child it killed for running past `timeout`.
    const execFn = (async () => {
      throw Object.assign(new Error("Command failed: python3 /tmp/acme/scripts/verify.py --json"), { killed: true, signal: "SIGTERM", code: null, stdout: "" })
    }) as unknown as ExecFileFn
    const out = await runVerifyInRoot("/tmp/acme", execFn)
    expect(out).toEqual({ ran: false, passed: false, rows: [], message: "The checks took too long and were stopped." })
  })

  it("does not show half-printed rows as a result when the script was stopped", async () => {
    const { runVerifyInRoot } = await import("./run-verify-impl")
    const execFn = (async () => {
      throw Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM", stdout: rowsJson })
    }) as unknown as ExecFileFn
    expect((await runVerifyInRoot("/tmp/acme", execFn)).ran).toBe(false)
  })

  it("gives the real run a 60 second limit", async () => {
    const { promisify } = await import("node:util")
    const seen: unknown[] = []
    // runVerifyInRoot's default exec goes through promisify(execFile); capture what it is asked to do.
    const execFile = Object.assign(vi.fn(), {
      [promisify.custom]: async (_cmd: string, _args: string[], options: unknown) => {
        seen.push(options)
        return { stdout: rowsJson, stderr: "" }
      },
    })
    vi.doMock("node:child_process", () => ({ execFile }))
    const { runVerifyInRoot } = await import("./run-verify-impl")
    const out = await runVerifyInRoot("/tmp/acme")
    expect(out.ran).toBe(true)
    expect(seen).toEqual([{ cwd: "/tmp/acme", timeout: 60_000 }])
    vi.doUnmock("node:child_process")
  })
})

describe("runCompanyVerifyImpl", () => {
  it("resolves the company's root, and refuses an unknown company without running anything", async () => {
    const { runCompanyVerifyImpl } = await import("./run-verify-impl")
    const execFn = vi.fn() as unknown as ExecFileFn
    const none = await runCompanyVerifyImpl("ghost", { resolveRoot: async () => null, execFn })
    expect(none).toMatchObject({ ran: false, passed: false })
    expect(execFn).not.toHaveBeenCalled()

    const run = vi.fn(async () => ({ stdout: rowsJson, stderr: "" })) as unknown as ExecFileFn
    const ok = await runCompanyVerifyImpl("acme", { resolveRoot: async () => "/tmp/acme", execFn: run })
    expect(ok.ran).toBe(true)
  })

  it("finds companies among the agent list, and skips external folders, which get no company features", async () => {
    const { runCompanyVerifyImpl } = await import("./run-verify-impl")
    const agents: Pick<Agent, "id" | "rootPath" | "kind">[] = [
      { id: "acme", rootPath: "/tmp/acme", kind: "command-set" },
      { id: "folder", rootPath: "/tmp/folder", kind: "external" },
    ]
    const listAgents = async () => agents
    const run = vi.fn(async () => ({ stdout: rowsJson, stderr: "" })) as unknown as ExecFileFn

    const ok = await runCompanyVerifyImpl("acme", { listAgents, execFn: run })
    expect(ok.ran).toBe(true)
    expect(run).toHaveBeenCalledWith("python3", ["/tmp/acme/scripts/verify.py", "--json"], { cwd: "/tmp/acme" })

    const execFn = vi.fn() as unknown as ExecFileFn
    const folder = await runCompanyVerifyImpl("folder", { listAgents, execFn })
    expect(folder).toEqual({
      ran: false,
      passed: false,
      rows: [],
      message: "This folder isn't set up as a company, so there are no checks to run.",
    })
    expect(execFn).not.toHaveBeenCalled()

    const ghost = await runCompanyVerifyImpl("ghost", { listAgents, execFn })
    expect(ghost).toEqual({ ran: false, passed: false, rows: [], message: "Company not found: ghost" })
    expect(execFn).not.toHaveBeenCalled()
  })
})
