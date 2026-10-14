import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { Agent } from "../adapters/types"

/**
 * v234 C1: owned files are attributed from the moment the agent was asked (ownedBaseline), never from
 * a possibly days-old `beforeDirty`; a path another pending review claims is never owned; and commit
 * and drop act only on the owned content the owner was shown. Real git, real registry.
 */

const execFileAsync = promisify(execFile)
const run = (file: string, args: string[], options?: { cwd: string }) => execFileAsync(file, args, { ...options, encoding: "utf8" })
const realExecNoCwd = (file: string, args: string[]) => run(file, args)
const realExec = (file: string, args: string[], options: { cwd: string }) => run(file, args, options)

const NOTE = "notes/company/sessions/2026-10-14-call.md"
const YAML = "definitions/ontology/company.yaml"
const MINE = "docs/decisions/2026-10-13-owner-own.md"
const REFUSED = "Some fact files changed since you opened this review. Reload and review again."

let root: string
let dataRoot: string
let dataDir: string
let agent: Agent

async function git(...args: string[]) {
  return (await run("git", args, { cwd: root })).stdout
}

async function headFiles() {
  return (await git("show", "--name-only", "--format=", "HEAD")).trim().split("\n").sort()
}

async function result() {
  const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
  return getCompanyCommandResultImpl("session-note", dataDir, root, realExec)
}

async function shown() {
  const r = await result()
  return r.changed ? (r.ownedFiles ?? []).map((f) => ({ path: f.path, newText: f.newText })) : []
}

async function shownFor(id: string) {
  const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
  const r = await getCompanyCommandResultImpl(id, dataDir, root, realExec)
  return r.changed ? (r.ownedFiles ?? []).map((f) => ({ path: f.path, newText: f.newText })) : []
}

async function approve(expectedOwned?: { path: string; newText: string }[]) {
  const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
  return commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, expectedOwned)
}

async function drop(expectedOwned?: { path: string; newText: string }[]) {
  const { discardOwnedChangesImpl } = await import("./discard-owned-changes-impl")
  return discardOwnedChangesImpl("session-note", "acme", dataDir, realExecNoCwd, expectedOwned)
}

async function prepare(mode: "live" | "unattended") {
  const { prepareSessionNote } = await import("../terminal/save-session-note-impl")
  return prepareSessionNote(agent, dataRoot, "2026-10-14", mode, realExec)
}

async function writeRunRecord(id: string, record: Record<string, unknown>) {
  await writeFile(path.join(dataDir, `${id}.run.json`), JSON.stringify({ commandId: id, ...record }))
}

const readRecord = async () => JSON.parse(await readFile(path.join(dataDir, "session-note.run.json"), "utf-8"))

describe("owned-file attribution (v234 C1)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "owned-attr-root-"))
    dataRoot = await mkdtemp(path.join(tmpdir(), "owned-attr-data-"))
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

  describe("(a) a path another pending review claims is never the note's", () => {
    beforeEach(async () => {
      // A /refresh is waiting for review: it rewrote company.yaml. A live note is pending too.
      await writeRunRecord("refresh", { outputKind: "known-file", outputPath: YAML, before: "pricing: hourly\n", beforeDirty: [], ownedBaseline: [] })
      await writeRunRecord("session-note", { outputKind: "new-file-in-dir", outputPath: "notes/company/sessions", before: [".keep"], beforeDirty: [], ownedBaseline: [] })
      await writeFile(path.join(root, YAML), "pricing: monthly  # from refresh\n")
      await writeFile(path.join(root, NOTE), "# note\n")
      await writeFile(path.join(root, "docs/decisions/2026-10-14-x.md"), "# Decision\n")
    })

    it("lists only the decision as the note's, and shows company.yaml as a stray", async () => {
      const r = await result()
      expect(r.changed && r.ownedFiles?.map((f) => f.path)).toEqual(["docs/decisions/2026-10-14-x.md"])
      expect(r.strays).toEqual([YAML])
    })

    it("drop leaves the other review's company.yaml alone", async () => {
      expect((await drop(await shown())).discarded).toBe(true)
      expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: monthly  # from refresh\n")
      await expect(stat(path.join(root, "docs/decisions/2026-10-14-x.md"))).rejects.toThrow()
    })

    it("approve never commits the other review's company.yaml", async () => {
      expect((await approve(await shown())).committed).toBe(true)
      expect(await headFiles()).toEqual(["docs/decisions/2026-10-14-x.md", NOTE])
      expect(await git("status", "--porcelain", "--", YAML)).toContain(YAML)
    })
  })

  describe("(b) an unattended note never owns a lane edit", () => {
    it("never sets ownedBaseline, so a company.yaml edit is a stray that is neither committed nor dropped", async () => {
      expect((await prepare("unattended")).ok).toBe(true)
      expect(await readRecord()).not.toHaveProperty("ownedBaseline")
      await writeFile(path.join(root, NOTE), "# note\n")
      await writeFile(path.join(root, YAML), "pricing: someone else's\n")

      const r = await result()
      expect(r.changed && r.ownedFiles).toBeUndefined()
      expect(r.strays).toEqual([YAML])

      expect((await drop()).discarded).toBe(false)
      expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: someone else's\n")

      expect((await approve(await shown())).committed).toBe(true)
      expect(await headFiles()).toEqual([NOTE])
      expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: someone else's\n")
    })
  })

  describe("(c) a live note owns only what changed after its prompt", () => {
    beforeEach(async () => {
      // An automatic note landed earlier and is still unapproved, so its old record is kept.
      expect((await prepare("unattended")).ok).toBe(true)
      await writeFile(path.join(root, "notes/company/sessions/2026-10-12-earlier.md"), "# earlier\n")
      // Days later, before the live prompt: the owner writes a decision of their own.
      await writeFile(path.join(root, MINE), "# Mine\n")
    })

    it("takes ownedBaseline at the live prompt: the owner's earlier edit is not owned, the agent's later one is", async () => {
      expect((await prepare("live")).ok).toBe(true)
      expect((await readRecord()).ownedBaseline).toEqual([MINE, "notes/company/sessions/2026-10-12-earlier.md"])
      await writeFile(path.join(root, NOTE), "# note\n")
      await writeFile(path.join(root, YAML), "pricing: fixed  # source: x, 2026-10-14\n")

      const r = await result()
      expect(r.changed && r.ownedFiles?.map((f) => f.path)).toEqual([YAML])
      expect(r.strays).toEqual([MINE])

      expect((await drop(await shown())).discarded).toBe(true)
      expect(await readFile(path.join(root, MINE), "utf-8")).toBe("# Mine\n")
      expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: hourly\n")
    })

    it("(f) leaves before and beforeDirty exactly as they were in the kept-baseline branch", async () => {
      const was = await readRecord()
      expect((await prepare("live")).ok).toBe(true)
      const now = await readRecord()
      expect(JSON.stringify(now.before)).toBe(JSON.stringify(was.before))
      expect(JSON.stringify(now.beforeDirty)).toBe(JSON.stringify(was.beforeDirty))
      expect(now.ownedBaseline).toEqual([MINE, "notes/company/sessions/2026-10-12-earlier.md"])
    })

    it("a second live prompt keeps the first prompt's fact changes owned", async () => {
      expect((await prepare("live")).ok).toBe(true)
      await writeFile(path.join(root, YAML), "pricing: fixed\n")
      expect((await prepare("live")).ok).toBe(true)
      expect((await readRecord()).ownedBaseline).not.toContain(YAML)
      const r = await result()
      expect(r.changed && r.ownedFiles?.map((f) => f.path)).toEqual([YAML])
    })
  })

  describe("(d) commit and drop act only on what the owner saw", () => {
    beforeEach(async () => {
      expect((await prepare("live")).ok).toBe(true)
      await writeFile(path.join(root, NOTE), "# note\n")
      await writeFile(path.join(root, YAML), "pricing: fixed\n")
    })

    it("refuses when an owned file's text changed after the review was rendered, and changes nothing", async () => {
      const seen = await shown()
      await writeFile(path.join(root, YAML), "pricing: changed later\n")

      expect(await approve(seen)).toEqual({ committed: false, message: REFUSED })
      expect(await headFiles()).toEqual([YAML, "notes/company/sessions/.keep"].sort())
      expect(await drop(seen)).toEqual({ discarded: false, message: REFUSED })
      expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: changed later\n")
      await expect(stat(path.join(dataDir, "session-note.run.json"))).resolves.toBeTruthy()
    })

    it("refuses when an owned file appeared after the review was rendered", async () => {
      const seen = await shown()
      await writeFile(path.join(root, "docs/decisions/2026-10-14-late.md"), "# Late\n")

      expect(await approve(seen)).toEqual({ committed: false, message: REFUSED })
      expect(await drop(seen)).toEqual({ discarded: false, message: REFUSED })
      expect(await readFile(path.join(root, "docs/decisions/2026-10-14-late.md"), "utf-8")).toBe("# Late\n")
      expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: fixed\n")
    })

    it("refuses when a shown owned file is gone", async () => {
      const seen = await shown()
      await git("checkout", "--", YAML)

      expect(await approve(seen)).toEqual({ committed: false, message: REFUSED })
    })

    it("commits when nothing changed since the review was rendered", async () => {
      expect((await approve(await shown())).committed).toBe(true)
      expect(await headFiles()).toEqual([YAML, NOTE].sort())
    })
  })

  describe("which owned files are new (v234 I4)", () => {
    it("is new only when HEAD lacks the path; a failed read is unknown, never new", async () => {
      await writeFile(path.join(root, "docs/decisions/2026-10-01-old.md"), "# Old\n")
      await git("add", "-A")
      await git("commit", "-q", "-m", "decision")
      expect((await prepare("live")).ok).toBe(true)
      await writeFile(path.join(root, NOTE), "# note\n")
      await writeFile(path.join(root, "docs/decisions/2026-10-01-old.md"), "# Old, revised\n")
      await writeFile(path.join(root, "docs/decisions/2026-10-14-new.md"), "# New\n")

      const r = await result()
      expect(r.changed && r.ownedFiles?.map((f) => [f.path, f.isNew, f.oldText])).toEqual([
        ["docs/decisions/2026-10-01-old.md", false, "# Old\n"],
        ["docs/decisions/2026-10-14-new.md", true, ""],
      ])

      const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
      const lsTreeFails = (file: string, args: string[], options: { cwd: string }) =>
        args.includes("ls-tree") ? Promise.reject(new Error("boom")) : realExec(file, args, options)
      const unknown = await getCompanyCommandResultImpl("session-note", dataDir, root, lsTreeFails)
      expect(unknown.changed && unknown.ownedFiles?.map((f) => f.isNew)).toEqual([null, null])
    })
  })

  describe("(e) a record written before ownedBaseline existed", () => {
    it("has its lanes off: a company.yaml edit is a stray, never owned, committed or dropped", async () => {
      await writeRunRecord("session-note", { outputKind: "new-file-in-dir", outputPath: "notes/company/sessions", before: [".keep"], beforeDirty: [] })
      await writeFile(path.join(root, NOTE), "# note\n")
      await writeFile(path.join(root, YAML), "pricing: fixed\n")

      const r = await result()
      expect(r.changed && r.ownedFiles).toBeUndefined()
      expect(r.strays).toEqual([YAML])
      expect(await drop()).toEqual({ discarded: false, message: "Couldn't tell which changes were the agent's, so nothing was dropped." })
      expect((await approve()).committed).toBe(true)
      expect(await headFiles()).toEqual([NOTE])
      expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: fixed\n")
    })
  })
})

describe("whole-review Discard with fact changes (v234 I3)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "owned-discard-root-"))
    dataRoot = await mkdtemp(path.join(tmpdir(), "owned-discard-data-"))
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

  async function discardAll(commandId: string, expectedOwned?: { path: string; newText: string }[]) {
    const { discardCompanyCommandResultImpl } = await import("./discard-company-command-result-impl")
    return discardCompanyCommandResultImpl(commandId, "acme", dataDir, realExec, expectedOwned)
  }

  it("discards a live note with fact changes and puts the facts back", async () => {
    expect((await prepare("live")).ok).toBe(true)
    await writeFile(path.join(root, NOTE), "# note\n")
    await writeFile(path.join(root, YAML), "pricing: fixed\n")
    await writeFile(path.join(root, "docs/decisions/2026-10-14-x.md"), "# Decision\n")

    expect(await discardAll("session-note", await shown())).toEqual({ discarded: true, message: "Discarded" })
    expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: hourly\n")
    await expect(stat(path.join(root, "docs/decisions/2026-10-14-x.md"))).rejects.toThrow()
    await expect(stat(path.join(root, NOTE))).rejects.toThrow()
    expect(await git("status", "--porcelain", "-uall")).toBe("")
    await expect(stat(path.join(dataDir, "session-note.run.json"))).rejects.toThrow()
  })

  it("discards an apply review that wrote a decision", async () => {
    await writeRunRecord("apply-session-facts", { outputKind: "known-file", outputPath: YAML, before: "pricing: hourly\n", beforeDirty: [], ownedBaseline: [] })
    await writeFile(path.join(root, YAML), "pricing: fixed  # source: n, 2026-10-14\n")
    await writeFile(path.join(root, "docs/decisions/2026-10-14-y.md"), "# Decision\n")

    expect(await discardAll("apply-session-facts", await shownFor("apply-session-facts"))).toEqual({ discarded: true, message: "Discarded" })
    expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: hourly\n")
    await expect(stat(path.join(root, "docs/decisions/2026-10-14-y.md"))).rejects.toThrow()
  })

  it("changes nothing when the fact changes differ from what the owner saw", async () => {
    expect((await prepare("live")).ok).toBe(true)
    await writeFile(path.join(root, NOTE), "# note\n")
    await writeFile(path.join(root, YAML), "pricing: fixed\n")
    const seen = await shown()
    await writeFile(path.join(root, YAML), "pricing: later\n")

    expect(await discardAll("session-note", seen)).toEqual({ discarded: false, message: REFUSED })
    expect(await readFile(path.join(root, YAML), "utf-8")).toBe("pricing: later\n")
    expect(await readFile(path.join(root, NOTE), "utf-8")).toBe("# note\n")
  })
})

describe("pendingClaimedPaths", () => {
  it("claims other records' outputs and lanes, ignores its own and unknown commands", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "claims-"))
    try {
      await writeFile(path.join(dir, "refresh.run.json"), "{}")
      await writeFile(path.join(dir, "decision.run.json"), "{}")
      await writeFile(path.join(dir, "no-such-command.run.json"), "{}")
      await writeFile(path.join(dir, "session-note.run.json"), "{}")
      const { pendingClaimedPaths } = await import("./pending-claims")
      const claimed = await pendingClaimedPaths(dir, "session-note")
      expect(claimed(YAML)).toBe(true)
      expect(claimed("docs/decisions/x.md")).toBe(true)
      expect(claimed("notes/company/sessions/x.md")).toBe(false)
      expect(claimed("README.md")).toBe(false)
      expect((await pendingClaimedPaths(path.join(dir, "missing"), "session-note"))(YAML)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
