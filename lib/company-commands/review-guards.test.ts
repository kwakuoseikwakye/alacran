import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { Agent } from "../adapters/types"

/** v238 minors: which sentence each action says, expectedOwned required when owned files exist, and the baseline rewrite taking the review lock. Real fs and git. */

const execFileAsync = promisify(execFile)
const run = (file: string, args: string[], options?: { cwd: string }) => execFileAsync(file, args, { ...options, encoding: "utf8" })
const realExec = (file: string, args: string[], options: { cwd: string }) => run(file, args, options)
const realExecNoCwd = (file: string, args: string[]) => run(file, args)

const NOTE = "notes/company/sessions/2026-10-14-call.md"
const YAML = "definitions/ontology/company.yaml"
const DEC = "docs/decisions/2026-10-14-x.md"
const REFUSED = "Some fact files changed since you opened this review. Reload and review again."

let root: string
let dataRoot: string
let dataDir: string
let agent: Agent
const git = async (...args: string[]) => (await run("git", args, { cwd: root })).stdout
const exists = (p: string) => stat(p).then(() => true, () => false)

async function setup(guardOverride?: () => Promise<unknown>) {
  root = await mkdtemp(path.join(tmpdir(), "guards-root-"))
  dataRoot = await mkdtemp(path.join(tmpdir(), "guards-data-"))
  dataDir = path.join(dataRoot, "acme")
  await mkdir(dataDir, { recursive: true })
  agent = { id: "acme", name: "Acme", rootPath: root, kind: "command-set" }
  vi.resetModules()
  vi.doMock("../config", () => ({ AGENTS: [agent] }))
  vi.doMock("../get-effective-agents", () => ({ getEffectiveAgents: async () => [agent] }))
  if (guardOverride) {
    const real = await vi.importActual<typeof import("../path-guard")>("../path-guard")
    vi.doMock("../path-guard", () => ({ ...real, resolveWithinAgentRoot: async (p: string) => (p.endsWith(DEC) ? guardOverride() : real.resolveWithinAgentRoot(p)) }))
  }
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
}

async function teardown() {
  vi.doUnmock("../config")
  vi.doUnmock("../get-effective-agents")
  vi.doUnmock("../path-guard")
  vi.resetModules()
  await rm(root, { recursive: true, force: true })
  await rm(dataRoot, { recursive: true, force: true })
}

const prepare = async (mode: "live" | "unattended") => (await import("../terminal/save-session-note-impl")).prepareSessionNote(agent, dataRoot, "2026-10-14", mode, realExec)
const writeApply = () =>
  writeFile(path.join(dataDir, "apply-session-facts.run.json"), JSON.stringify({ commandId: "apply-session-facts", outputKind: "known-file", outputPath: YAML, before: "pricing: hourly\n", beforeDirty: [], ownedBaseline: [] }))
const dropOwned = async (id: string, expected?: { path: string; newText: string }[]) =>
  (await import("./discard-owned-changes-impl")).discardOwnedChangesImpl(id, "acme", dataDir, realExecNoCwd, expected)
const discardAll = async (id: string, expected?: { path: string; newText: string }[]) =>
  (await import("./discard-company-command-result-impl")).discardCompanyCommandResultImpl(id, "acme", dataDir, realExec, expected)
async function shown(id: string) {
  const r = await (await import("./company-command-result-impl")).getCompanyCommandResultImpl(id, dataDir, root, realExec)
  return r.changed ? (r.ownedFiles ?? []).map((f) => ({ path: f.path, newText: f.newText })) : []
}

describe("drop and discard sentences (v238 B1)", { timeout: 20_000 }, () => {
  afterEach(teardown, 20_000)

  it("the drop button says the note is waiting for a session note", async () => {
    await setup()
    expect((await prepare("live")).ok).toBe(true)
    await writeFile(path.join(root, NOTE), "# note\n")
    await writeFile(path.join(root, YAML), "pricing: fixed\n")
    expect(await dropOwned("session-note", await shown("session-note"))).toEqual({ discarded: true, message: "Dropped the fact changes. The note is still waiting for you." })

  })

  it("says the rest of the review is waiting for an apply", async () => {
    await setup()
    await writeApply()
    await writeFile(path.join(root, YAML), "pricing: fixed\n")
    await writeFile(path.join(root, DEC), "# D\n")
    const r = await dropOwned("apply-session-facts", await shown("apply-session-facts"))
    expect(r).toEqual({ discarded: true, message: "Dropped the fact changes. The rest of this review is still waiting for you." })
  })

  it("an apply whose only change was decision files says the review is now empty", async () => {
    await setup()
    await writeApply()
    await writeFile(path.join(root, DEC), "# D\n")
    const r = await dropOwned("apply-session-facts", await shown("apply-session-facts"))
    expect(r).toEqual({ discarded: true, message: "Dropped the fact changes. Nothing is left in this review." })
  })

  it("approve never commits a directory in an owned lane (a nested repo)", async () => {
    await setup()
    expect((await prepare("live")).ok).toBe(true)
    await writeFile(path.join(root, NOTE), "# note\n")
    const nested = path.join(root, "docs/decisions/nested")
    await mkdir(nested, { recursive: true })
    await run("git", ["init", "-q"], { cwd: nested })
    await writeFile(path.join(nested, "a.md"), "x")
    const seen = await shown("session-note")
    const res = await (await import("./commit-company-command-result-impl")).commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, seen)
    expect(res.committed).toBe(true)
    expect((await git("show", "--name-only", "--format=", "HEAD")).trim()).toBe(NOTE)
  })

  it("a partial drop says 'before approving' from the drop button but not from whole-review Discard", async () => {
    // The guard refuses to place the new decision inside this company, so it cannot be removed safely.
    await setup(async () => null)
    expect((await prepare("live")).ok).toBe(true)
    await writeFile(path.join(root, NOTE), "# note\n")
    await writeFile(path.join(root, DEC), "# D\n")
    const seen = await shown("session-note")

    const viaDrop = await dropOwned("session-note", seen)
    expect(viaDrop.message).toContain("before approving")
    const viaDiscard = await discardAll("session-note", seen)
    expect(viaDiscard.discarded).toBe(false)
    expect(viaDiscard.message).not.toContain("before approving")
    expect(viaDiscard.message).toContain("discard again")
    expect(await exists(path.join(root, NOTE))).toBe(true)
  })
})

describe("expectedOwned is required when fact files are owned (v238 B2, B4)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    await setup()
    expect((await prepare("live")).ok).toBe(true)
    await writeFile(path.join(root, NOTE), "# note\n")
  }, 20_000)
  afterEach(teardown, 20_000)

  const approve = async (expected?: { path: string; newText: string }[]) =>
    (await import("./commit-company-command-result-impl")).commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, expected)

  it("approve, drop and whole-review Discard all refuse with owned files and no expectedOwned, changing nothing", async () => {
    await writeFile(path.join(root, YAML), "pricing: fixed\n")
    expect(await approve()).toEqual({ committed: false, message: REFUSED })
    expect(await dropOwned("session-note")).toEqual({ discarded: false, message: REFUSED })
    expect(await discardAll("session-note")).toEqual({ discarded: false, message: REFUSED })
    expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: fixed\n")
    expect(await readFile(path.join(root, NOTE), "utf-8")).toBe("# note\n")
    expect(await exists(path.join(dataDir, "session-note.run.json"))).toBe(true)
    expect((await git("log", "--format=%s")).trim()).toBe("init")
  })

  it("they act when the owner's shown set is passed", async () => {
    await writeFile(path.join(root, YAML), "pricing: fixed\n")
    expect((await approve(await shown("session-note"))).committed).toBe(true)
  })

  it("with no owned files there is nothing to check: approve and whole-review Discard need no expectedOwned", async () => {
    expect(await approve()).toEqual({ committed: true, message: "Committed" })
    await writeFile(path.join(root, "notes/company/sessions/2026-10-15-b.md"), "# b\n")
    expect((await prepare("live")).ok).toBe(true)
    await writeFile(path.join(root, "notes/company/sessions/2026-10-15-c.md"), "# c\n")
    expect(await discardAll("session-note")).toEqual({ discarded: true, message: "Discarded" })
  })
})

describe("the baseline rewrite takes the review lock (v238 B3)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    await setup()
    expect((await prepare("unattended")).ok).toBe(true)
    await writeFile(path.join(root, "notes/company/sessions/2026-10-12-earlier.md"), "# earlier\n")
  }, 20_000)
  afterEach(teardown, 20_000)

  const busy = "Your company is finishing other work. Save what we learned again in a minute."
  const recordPath = () => path.join(dataDir, "session-note.run.json")
  const live = async (sleep: (ms: number) => Promise<void>) =>
    (await import("../terminal/save-session-note-impl")).prepareSessionNote(agent, dataRoot, "2026-10-14", "live", realExec, sleep)

  it("waits for a lock that frees mid-retry, then writes the baseline", async () => {
    const { acquireRunLock, releaseRunLock } = await import("./run-lock")
    expect(await acquireRunLock(dataDir)).toBe(true)
    let sleeps = 0
    const r = await live(async () => { if (++sleeps === 3) await releaseRunLock(dataDir) })
    expect(r.ok).toBe(true)
    expect(sleeps).toBe(3)
    expect(JSON.parse(await readFile(recordPath(), "utf-8"))).toHaveProperty("ownedBaseline")
  })

  it("refuses with a plain sentence when the lock never frees, and leaves the baseline alone", async () => {
    const was = await readFile(recordPath(), "utf-8")
    const { acquireRunLock } = await import("./run-lock")
    expect(await acquireRunLock(dataDir)).toBe(true)
    let sleeps = 0
    expect(await live(async () => { sleeps++ })).toEqual({ ok: false, message: busy })
    expect(sleeps).toBe(10)
    expect(await readFile(recordPath(), "utf-8")).toBe(was)
  })

  it("an unattended note is never refused by a held lock", async () => {
    const { acquireRunLock } = await import("./run-lock")
    expect(await acquireRunLock(dataDir)).toBe(true)
    expect((await prepare("unattended")).ok).toBe(true)
  })

  it("holds the lock across its read and write, so Approve cannot delete the record in between", async () => {
    const { acquireRunLock } = await import("./run-lock")
    let statusReads = 0
    let approveCouldLock: boolean | null = null
    // The second git status is the rewrite's own look at the repo, between its read and its write.
    const racing = async (file: string, args: string[], options: { cwd: string }) => {
      if (args[0] === "status" && ++statusReads === 2) approveCouldLock = await acquireRunLock(dataDir)
      return realExec(file, args, options)
    }
    const { prepareSessionNote } = await import("../terminal/save-session-note-impl")
    expect((await prepareSessionNote(agent, dataRoot, "2026-10-14", "live", racing)).ok).toBe(true)
    expect(approveCouldLock).toBe(false)
    expect(JSON.parse(await readFile(recordPath(), "utf-8"))).toHaveProperty("ownedBaseline")
    expect(await acquireRunLock(dataDir)).toBe(true) // and it let go afterwards
  })
})
