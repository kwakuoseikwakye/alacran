import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, stat, utimes, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { Agent } from "../adapters/types"

/**
 * v238: a run that changed nothing must not leave a record behind that still claims its lanes or
 * later swallows another session's edits as a phantom review. Real fs, real git, real registry.
 */

const execFileAsync = promisify(execFile)
const run = (file: string, args: string[], options?: { cwd: string }) => execFileAsync(file, args, { ...options, encoding: "utf8" })
const realExec = (file: string, args: string[], options: { cwd: string }) => run(file, args, options)
const realExecNoCwd = (file: string, args: string[]) => run(file, args)

const YAML = "definitions/ontology/company.yaml"
const OLD_NOTE = "notes/company/sessions/2026-10-10-old.md"
const NEW_NOTE = "notes/company/sessions/2026-10-14-new.md"

let root: string
let dataRoot: string
let dataDir: string
let agent: Agent

const git = async (...args: string[]) => (await run("git", args, { cwd: root })).stdout
const exists = (p: string) => stat(p).then(() => true, () => false)
const applyRecord = () => path.join(dataDir, "apply-session-facts.run.json")

/** A finished run's record, aged past the render-time sweep's minimum unless `ageMs` says otherwise. */
async function writeApplyRecord(note = OLD_NOTE, ageMs = 60 * 60 * 1000) {
  await writeFile(
    applyRecord(),
    JSON.stringify({
      commandId: "apply-session-facts",
      outputKind: "known-file",
      outputPath: YAML,
      before: "pricing: hourly\n",
      beforeDirty: [],
      ownedBaseline: [],
      trailer: `Applied facts from: ${note}`,
    })
  )
  const t = new Date(Date.now() - ageMs)
  await utimes(applyRecord(), t, t)
}

async function pending() {
  const { listPendingReviews } = await import("./pending-reviews")
  return (await listPendingReviews([agent], dataRoot)).map((p) => p.commandId)
}

describe("a run that changed nothing leaves no record (v238)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "empty-run-root-"))
    dataRoot = await mkdtemp(path.join(tmpdir(), "empty-run-data-"))
    dataDir = path.join(dataRoot, "acme")
    await mkdir(dataDir, { recursive: true })
    agent = { id: "acme", name: "Acme", rootPath: root, kind: "command-set" }
    vi.resetModules()
    vi.doMock("../config", () => ({ AGENTS: [agent] }))
    vi.doMock("../get-effective-agents", () => ({ getEffectiveAgents: async () => [agent] }))
    await git("init", "-q")
    await git("config", "user.email", "t@example.com")
    await git("config", "user.name", "T")
    await git("config", "commit.gpgsign", "false")
    await mkdir(path.join(root, "definitions/ontology"), { recursive: true })
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await mkdir(path.join(root, "notes/company/sessions"), { recursive: true })
    await writeFile(path.join(root, YAML), "pricing: hourly\n")
    await writeFile(path.join(root, "notes/company/sessions/.keep"), "")
    await git("add", "-A")
    await git("commit", "-q", "-m", "init")
  }, 20_000)

  afterEach(async () => {
    vi.doUnmock("../config")
    vi.doUnmock("../get-effective-agents")
    vi.resetModules()
    await rm(root, { recursive: true, force: true })
    await rm(dataRoot, { recursive: true, force: true })
  }, 20_000)

  it("drops the record, so a later live note owns its company.yaml edit and no Apply review appears", async () => {
    await writeApplyRecord() // an apply that finished and changed nothing
    expect(await pending()).toEqual([])
    expect(await exists(applyRecord())).toBe(false)

    const { prepareSessionNote } = await import("../terminal/save-session-note-impl")
    expect((await prepareSessionNote(agent, dataRoot, "2026-10-14", "live", realExec)).ok).toBe(true)
    await writeFile(path.join(root, NEW_NOTE), "# note\n")
    await writeFile(path.join(root, YAML), "pricing: monthly  # source: x\n")

    const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
    const r = await getCompanyCommandResultImpl("session-note", dataDir, root, realExec)
    expect(r.changed && r.ownedFiles?.map((f) => f.path)).toEqual([YAML])
    expect(r.strays).toEqual([])
    expect(await pending()).toEqual(["session-note"])
  })

  it("a genuine later apply is not refused by hasAppliedFacts because of the empty one", async () => {
    // The empty apply's trailer names the SAME note that is applied afterwards, so a leftover that got committed would refuse it.
    await writeApplyRecord(NEW_NOTE)
    const { prepareSessionNote } = await import("../terminal/save-session-note-impl")
    await pending()
    expect((await prepareSessionNote(agent, dataRoot, "2026-10-14", "live", realExec)).ok).toBe(true)
    await writeFile(path.join(root, NEW_NOTE), "# note\n")
    await writeFile(path.join(root, YAML), "pricing: monthly\n")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
    const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
    const r = await getCompanyCommandResultImpl("session-note", dataDir, root, realExec)
    const expectedOwned = r.changed ? (r.ownedFiles ?? []).map((f) => ({ path: f.path, newText: f.newText })) : []
    expect((await commitCompanyCommandResultImpl("session-note", NEW_NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, expectedOwned)).committed).toBe(true)

    expect(await git("log", "--format=%B")).not.toContain("Applied facts from")
    const { hasAppliedFacts } = await import("./apply-session-facts-impl")
    expect(await hasAppliedFacts(root, NEW_NOTE, realExecNoCwd)).toBe(false)
    expect(await pending()).toEqual([])
    expect(await exists(applyRecord())).toBe(false)
  })

  it("an apply with real pending changes keeps its record and still claims its lanes", async () => {
    await writeApplyRecord()
    await writeFile(path.join(root, YAML), "pricing: fixed  # source: n\n")
    await writeFile(path.join(root, "docs/decisions/2026-10-14-y.md"), "# Decision\n")
    expect(await pending()).toEqual(["apply-session-facts"])
    expect(await exists(applyRecord())).toBe(true)

    const { pendingClaimedPaths } = await import("./pending-claims")
    const claimed = await pendingClaimedPaths(dataDir, "session-note")
    expect(claimed(YAML)).toBe(true)
    expect(claimed("docs/decisions/z.md")).toBe(true)
  })

  it("keeps the record while a run is in flight (lock held)", async () => {
    await writeApplyRecord()
    const { acquireRunLock } = await import("./run-lock")
    expect(await acquireRunLock(dataDir)).toBe(true)
    expect(await pending()).toEqual([])
    expect(await exists(applyRecord())).toBe(true)
  })

  it("keeps a live session note's record even though nothing has changed yet", async () => {
    const { prepareSessionNote } = await import("../terminal/save-session-note-impl")
    expect((await prepareSessionNote(agent, dataRoot, "2026-10-14", "live", realExec)).ok).toBe(true)
    expect(await pending()).toEqual([])
    expect(await exists(path.join(dataDir, "session-note.run.json"))).toBe(true)
  })

  describe("when the sweep may delete (v238 fix round)", () => {
    const read = async (opts?: Record<string, unknown>) => {
      const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
      return getCompanyCommandResultImpl("apply-session-facts", dataDir, root, realExec, true, opts)
    }

    it("a render-time read leaves a young record alone and sweeps an old one", async () => {
      await writeApplyRecord(OLD_NOTE, 60_000)
      await read()
      expect(await exists(applyRecord())).toBe(true)
      await read({ now: Date.now() + 11 * 60 * 1000 })
      expect(await exists(applyRecord())).toBe(false)
    })

    it("a run that just ended is swept at once, whatever the record's age", async () => {
      await writeApplyRecord(OLD_NOTE, 0)
      await read({ justFinished: true })
      expect(await exists(applyRecord())).toBe(false)
    })

    it("never removes a record rewritten between the read and the delete", async () => {
      await writeApplyRecord(OLD_NOTE, 0)
      const fresh = JSON.stringify({ commandId: "apply-session-facts", outputKind: "known-file", outputPath: YAML, before: "pricing: hourly\n", beforeDirty: [], ownedBaseline: [], trailer: "new run" })
      await read({ justFinished: true, beforeDelete: () => writeFile(applyRecord(), fresh) })
      expect(await readFile(applyRecord(), "utf-8")).toBe(fresh)
    })

    it("the headless exit handler re-reads after releasing the lock and drops the empty record", async () => {
      vi.doMock("../ai-executor-registry", async () => ({ resolveAiExecutorForAgent: async () => (await import("../ai-executors")).AI_EXECUTORS["claude-code"] }))
      vi.doMock("../visible-run-registry", () => ({ getVisibleRunForAgent: async () => false }))
      try {
        const { runCompanyCommandImpl } = await import("./run-company-command-impl")
        let onExit: () => void = () => {}
        const spawn = () => ({ unref: () => {}, on: (ev: string, cb: () => void) => { if (ev === "exit") onExit = cb } })
        const res = await runCompanyCommandImpl("apply-session-facts", { note: NEW_NOTE, lines: "fact | x | y" }, "acme", spawn as never, realExec as never, dataDir)
        expect(res.started).toBe(true)
        expect(await exists(applyRecord())).toBe(true) // young, and the run is in flight
        onExit()
        for (let i = 0; i < 50 && (await exists(applyRecord())); i++) await new Promise((r) => setTimeout(r, 40))
        expect(await exists(applyRecord())).toBe(false)
      } finally {
        vi.doUnmock("../ai-executor-registry")
        vi.doUnmock("../visible-run-registry")
      }
    })
  })
})
