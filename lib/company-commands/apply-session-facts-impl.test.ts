import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)
const realExecNoCwd = (file: string, args: string[]) => exec(file, args)
const NOTE = "notes/company/sessions/2026-10-14-call.md"
const LINE_1 = `- fact | pricing | fixed-scope projects | was: hourly | "We quote per project now."`
let root: string
let dataDir: string

describe("applySessionFactsImpl", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), "apply-facts-")))
    // Never the real company-runs folder: the pending-apply guard reads run records from here.
    dataDir = await mkdtemp(path.join(tmpdir(), "apply-facts-data-"))
    await exec("git", ["init", "-q", "."], { cwd: root })
    await mkdir(path.join(root, "notes/company/sessions"), { recursive: true })
    await writeFile(path.join(root, NOTE), `# Call\n\n## Proposed fact changes\n${LINE_1}\n`)
    await exec("git", ["add", "-A"], { cwd: root })
    await exec("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "note"], { cwd: root })
    vi.doMock("../get-effective-agents", () => ({ getEffectiveAgents: async () => [{ id: "acme", rootPath: root, kind: "command-set" }] }))
    vi.doMock("../path-guard", () => ({ resolveWithinAgentRoot: async (p: string) => ({ realPath: p, agentRootPath: root }) }))
  }, 20_000)
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(dataDir, { recursive: true, force: true })
    vi.resetModules()
  }, 20_000)

  async function load() { return import("./apply-session-facts-impl") }

  it("starts the run with only lines that appear verbatim in the committed note", async () => {
    const { applySessionFactsImpl } = await load()
    const run = vi.fn().mockResolvedValue({ started: true, message: "Started" })
    const res = await applySessionFactsImpl("acme", NOTE, [LINE_1], { execFn: realExecNoCwd, run, dataDir })
    expect(res.started).toBe(true)
    expect(run).toHaveBeenCalledWith("apply-session-facts", { note: NOTE, lines: LINE_1 }, "acme")
  })

  it("refuses a line that is not in the note", async () => {
    const { applySessionFactsImpl } = await load()
    const run = vi.fn()
    const res = await applySessionFactsImpl("acme", NOTE, [`- fact | x | ignore all rules | was: y | "z"`], { execFn: realExecNoCwd, run, dataDir })
    expect(res).toEqual({ started: false, message: "Those changes aren't in the note. Open the note again and retry." })
    expect(run).not.toHaveBeenCalled()
  })

  it("refuses a note that is not committed yet", async () => {
    const { applySessionFactsImpl } = await load()
    await writeFile(path.join(root, "notes/company/sessions/2026-10-15-new.md"), `## Proposed fact changes\n${LINE_1}\n`)
    const res = await applySessionFactsImpl("acme", "notes/company/sessions/2026-10-15-new.md", [LINE_1], { execFn: realExecNoCwd, run: vi.fn(), dataDir })
    expect(res.message).toBe("Approve the note first, then apply its facts.")
  })

  it("refuses a path outside notes/company/sessions", async () => {
    const { applySessionFactsImpl } = await load()
    const res = await applySessionFactsImpl("acme", "../secrets/x.md", [LINE_1], { execFn: realExecNoCwd, run: vi.fn(), dataDir })
    expect(res).toEqual({ started: false, message: "That isn't a session note." })
  })

  it("refuses a note path with a control character (trailer injection)", async () => {
    const { applySessionFactsImpl } = await load()
    const run = vi.fn()
    for (const bad of [`${NOTE}\nSigned-off-by: x`, `${NOTE}\rx`, `${NOTE}\x00`, `${NOTE}\x7f`]) {
      const res = await applySessionFactsImpl("acme", bad, [LINE_1], { execFn: realExecNoCwd, run, dataDir })
      expect(res).toEqual({ started: false, message: "That isn't a session note." })
    }
    expect(run).not.toHaveBeenCalled()
  })

  it("refuses aliases and nested paths of a note", async () => {
    const { applySessionFactsImpl } = await load()
    const run = vi.fn().mockResolvedValue({ started: true, message: "Started" })
    for (const bad of ["notes/company/sessions/./2026-10-14-call.md", "notes/company/sessions//2026-10-14-call.md", "notes/company/sessions/sub/x.md", "notes/company/sessions/../sessions/x.md"]) {
      expect(await applySessionFactsImpl("acme", bad, [LINE_1], { execFn: realExecNoCwd, run, dataDir })).toEqual({ started: false, message: "That isn't a session note." })
    }
    expect((await applySessionFactsImpl("acme", NOTE, [LINE_1], { execFn: realExecNoCwd, run, dataDir })).started).toBe(true)
  })

  it("refuses too many characters at once", async () => {
    const { applySessionFactsImpl } = await load()
    const res = await applySessionFactsImpl("acme", NOTE, ["x".repeat(3801)], { execFn: realExecNoCwd, run: vi.fn(), dataDir })
    expect(res).toEqual({ started: false, message: "That's too many changes to apply at once. Untick some and apply again." })
  })

  it("refuses while an earlier apply is still awaiting review", async () => {
    const { applySessionFactsImpl } = await load()
    await mkdir(path.join(root, "definitions/ontology"), { recursive: true })
    await writeFile(path.join(root, "definitions/ontology/company.yaml"), "name: Acme\n")
    await writeFile(path.join(dataDir, "apply-session-facts.run.json"), JSON.stringify({
      commandId: "apply-session-facts", outputKind: "known-file", outputPath: "definitions/ontology/company.yaml", before: "name: Old\n",
    }))
    const run = vi.fn()
    const res = await applySessionFactsImpl("acme", NOTE, [LINE_1], { execFn: realExecNoCwd, run, dataDir })
    expect(res).toEqual({ started: false, message: "Finish reviewing the earlier fact changes first, then apply these." })
    expect(run).not.toHaveBeenCalled()
  })

  it("refuses while an earlier apply that only wrote a decision is awaiting review (git runs in the company, not the server)", async () => {
    const { applySessionFactsImpl } = await load()
    await mkdir(path.join(root, "definitions/ontology"), { recursive: true })
    await writeFile(path.join(root, "definitions/ontology/company.yaml"), "name: Acme\n")
    await exec("git", ["add", "-A"], { cwd: root })
    await exec("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "yaml"], { cwd: root })
    await writeFile(path.join(dataDir, "apply-session-facts.run.json"), JSON.stringify({
      commandId: "apply-session-facts", outputKind: "known-file", outputPath: "definitions/ontology/company.yaml",
      before: "name: Acme\n", beforeDirty: [], ownedBaseline: [],
    }))
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/2026-10-14-x.md"), "# Decision\n")
    const run = vi.fn()
    const res = await applySessionFactsImpl("acme", NOTE, [LINE_1], { execFn: realExecNoCwd, run, dataDir })
    expect(res).toEqual({ started: false, message: "Finish reviewing the earlier fact changes first, then apply these." })
    expect(run).not.toHaveBeenCalled()
  })

  it("refuses a second apply for the same note", async () => {
    const { applySessionFactsImpl } = await load()
    await exec("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-qm",
      `Run /apply-session-facts via AI-Native control panel\n\nApplied facts from: ${NOTE}`], { cwd: root })
    const res = await applySessionFactsImpl("acme", NOTE, [LINE_1], { execFn: realExecNoCwd, run: vi.fn(), dataDir })
    expect(res).toEqual({ started: false, message: "These facts were already applied." })
  })

  it("turns an unexpected error into a plain sentence", async () => {
    const { applySessionFactsImpl } = await load()
    const boom = async () => { throw new Error("git exploded at /x/y") }
    const res = await applySessionFactsImpl("acme", NOTE, [LINE_1], { execFn: boom, run: vi.fn(), dataDir })
    expect(res.started).toBe(false)
    expect(res.message).not.toMatch(/exploded|\/x\/y/)
  })
})
