import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, stat, lstat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const run = (file: string, args: string[], options?: { cwd: string }) => execFileAsync(file, args, { ...options, encoding: "utf8" })
/** The exact shape the impl receives in production: no cwd, so git must be told the repo with -C. */
const realExecNoCwd = (file: string, args: string[]) => run(file, args)

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "discard-owned-changes-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

// Every test here spawns real git several times (repo setup alone is seven calls), so the default
// 5s test / 10s hook limits are not a safe margin when the machine is busy.
describe("discardOwnedChangesImpl", { timeout: 20_000 }, () => {
  const NOTE = "notes/company/sessions/2026-10-14-call.md"
  const COMPANY_YAML = "definitions/ontology/company.yaml"
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "discard-owned-changes-data-"))
    vi.doMock("../config", () => ({ AGENTS: [{ id: "acme", name: "Acme", rootPath: root, kind: "command-set" }] }))
    vi.doMock("../get-effective-agents", () => ({
      getEffectiveAgents: async () => [{ id: "acme", name: "Acme", rootPath: root, kind: "command-set" }],
    }))
    vi.doMock("./registry", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./registry")>()),
      getCompanyCommand: (id: string) =>
        id === "session-note"
          ? {
              id: "session-note",
              commandFileName: "session-note.md",
              label: "Session note",
              fields: [],
              outputKind: "new-file-in-dir",
              outputPath: "notes/company/sessions",
              alsoWrites: [COMPANY_YAML, "docs/decisions/"],
              buildPrompt: () => "p",
            }
          : undefined,
    }))
    // A real repo whose company.yaml is committed, so an edit to it shows up as an owned change.
    await run("git", ["init", "-q"], { cwd: root })
    await run("git", ["config", "user.email", "t@example.com"], { cwd: root })
    await run("git", ["config", "user.name", "T"], { cwd: root })
    await run("git", ["config", "commit.gpgsign", "false"], { cwd: root })
    await mkdir(path.join(root, "definitions/ontology"), { recursive: true })
    await writeFile(path.join(root, COMPANY_YAML), "pricing: hourly\n")
    await run("git", ["add", "-A"], { cwd: root })
    await run("git", ["commit", "-q", "-m", "init"], { cwd: root })
    await mkdir(path.join(root, "notes/company/sessions"), { recursive: true })
  }, 20_000)

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
    vi.doUnmock("./registry")
    vi.doUnmock("../get-effective-agents")
    vi.doUnmock("../path-guard")
  })

  async function writeRecord(record: Record<string, unknown>) {
    await writeFile(
      path.join(dataDir, "session-note.run.json"),
      // A record a live prompt wrote: the owned baseline is taken at the same moment as beforeDirty (v234 C1).
      JSON.stringify({ commandId: "session-note", outputKind: "new-file-in-dir", outputPath: "notes/company/sessions", before: [], ownedBaseline: record.beforeDirty, ...record })
    )
  }

  async function discard(execFn: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }> = realExecNoCwd) {
    const { discardOwnedChangesImpl } = await import("./discard-owned-changes-impl")
    // What the owner was shown (v238: required whenever owned files exist): the owned set as the
    // matcher reads it, with real git whatever execFn does. A directory has no text and is never "shown".
    const { listChangedPathsAt, ownedOf } = await import("./repo-changes")
    const { getCompanyCommand } = await import("./registry")
    const record = JSON.parse(await readFile(path.join(dataDir, "session-note.run.json"), "utf-8"))
    const owned = ownedOf(record, getCompanyCommand("session-note"), await listChangedPathsAt(root, realExecNoCwd), () => false)
    const expected = await Promise.all(owned.map(async (p) => ({ path: p, newText: await readFile(path.join(root, p), "utf-8").catch(() => "") })))
    return discardOwnedChangesImpl("session-note", "acme", dataDir, execFn, expected)
  }

  /** Real git, except a call whose args include `sub` throws an error full of things the owner must not see. */
  const failingOn = (sub: string) => async (file: string, args: string[]) => {
    if (args.includes(sub)) throw new Error(`/Users/someone/secret/path: fatal: boom (${sub})`)
    return realExecNoCwd(file, args)
  }

  const FAILED = "Couldn't finish dropping the fact changes. Some may already be dropped, so check again before approving."
  const PARTIAL = "Dropped most of the fact changes. Some couldn't be dropped safely, so check them before approving."

  it("restores a tracked owned file and deletes a new one, keeping the note and the run record", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, NOTE), "# note\n")
    await writeFile(path.join(root, COMPANY_YAML), "pricing: monthly\n")
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/x.md"), "a decision")

    expect(await discard()).toEqual({ discarded: true, message: "Dropped the fact changes. The note is still waiting for you." })

    expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: hourly\n")
    await expect(stat(path.join(root, "docs/decisions/x.md"))).rejects.toThrow()
    expect(await readFile(path.join(root, NOTE), "utf-8")).toBe("# note\n")
    await expect(stat(path.join(dataDir, "session-note.run.json"))).resolves.toBeTruthy()
  })

  it("leaves an owned file that was dirty before the run untouched", async () => {
    await writeRecord({ beforeDirty: [COMPANY_YAML] })
    await writeFile(path.join(root, COMPANY_YAML), "pricing: mine\n")
    await writeFile(path.join(root, NOTE), "# note\n")

    expect(await discard()).toEqual({ discarded: false, message: "There are no fact changes to drop." })

    expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: mine\n")
  })

  it("says so when there is nothing to drop", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, NOTE), "# note\n")

    expect(await discard()).toEqual({ discarded: false, message: "There are no fact changes to drop." })
  })

  it("restores a tracked owned file the run deleted", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, NOTE), "# note\n")
    await rm(path.join(root, COMPANY_YAML))

    expect((await discard()).discarded).toBe(true)

    expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: hourly\n")
  })

  it("drops a staged edit and a staged new file, not just working-tree changes", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, COMPANY_YAML), "pricing: staged\n")
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/y.md"), "staged decision")
    await run("git", ["add", "-A"], { cwd: root })

    expect((await discard()).discarded).toBe(true)

    expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: hourly\n")
    await expect(stat(path.join(root, "docs/decisions/y.md"))).rejects.toThrow()
    expect((await run("git", ["status", "--porcelain", "-uall"], { cwd: root })).stdout).toBe("")
  })

  it("removes a symlink the run created as a link and never touches what it points at", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "discard-owned-changes-outside-"))
    try {
      await writeFile(path.join(outside, "secret.txt"), "not part of any company")
      await mkdir(path.join(root, "docs/decisions"), { recursive: true })
      await symlink(path.join(outside, "secret.txt"), path.join(root, "docs/decisions/link.md"))
      await writeRecord({ beforeDirty: [] })
      await writeFile(path.join(root, NOTE), "# note\n")

      expect((await discard()).discarded).toBe(true)

      await expect(lstat(path.join(root, "docs/decisions/link.md"))).rejects.toThrow()
      expect(await readFile(path.join(outside, "secret.txt"), "utf-8")).toBe("not part of any company")
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("restores a tracked owned file the run replaced with a symlink, without following the link", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "discard-owned-changes-outside-"))
    try {
      await writeFile(path.join(outside, "secret.txt"), "not part of any company")
      await writeRecord({ beforeDirty: [] })
      await rm(path.join(root, COMPANY_YAML))
      await symlink(path.join(outside, "secret.txt"), path.join(root, COMPANY_YAML))

      expect((await discard()).discarded).toBe(true)

      expect((await lstat(path.join(root, COMPANY_YAML))).isSymbolicLink()).toBe(false)
      expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: hourly\n")
      expect(await readFile(path.join(outside, "secret.txt"), "utf-8")).toBe("not part of any company")
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("does not read a file name as a glob when restoring", async () => {
    // The run edits a committed file literally named "*". As a glob it would also restore keep.md,
    // overwriting the owner's earlier edit to it.
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/keep.md"), "committed decision")
    await writeFile(path.join(root, "docs/decisions/*"), "committed star")
    await run("git", ["add", "-A"], { cwd: root })
    await run("git", ["commit", "-q", "-m", "decisions"], { cwd: root })
    await writeFile(path.join(root, "docs/decisions/keep.md"), "the owner's later edit")
    await writeFile(path.join(root, "docs/decisions/*"), "the run's edit")
    await writeRecord({ beforeDirty: ["docs/decisions/keep.md"] })

    expect((await discard()).discarded).toBe(true)

    expect(await readFile(path.join(root, "docs/decisions/keep.md"), "utf-8")).toBe("the owner's later edit")
    expect(await readFile(path.join(root, "docs/decisions/*"), "utf-8")).toBe("committed star")
  })

  it("reports a plain sentence, not the error text, when git fails part-way, and releases the lock", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, COMPANY_YAML), "pricing: monthly\n")
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/x.md"), "a decision")

    // company.yaml is restored first, then x.md is unlinked and the index step throws.
    const res = await discard(failingOn("rm"))

    expect(res).toEqual({ discarded: false, message: FAILED })
    expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: hourly\n")
    const { checkRunLockStatus } = await import("./run-lock")
    expect((await checkRunLockStatus(dataDir)).running).toBe(false)
  })

  it("never deletes a tracked file when it cannot tell whether HEAD has it", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, COMPANY_YAML), "pricing: monthly\n")

    const res = await discard(failingOn("ls-tree"))

    expect(res).toEqual({ discarded: false, message: FAILED })
    expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: monthly\n")
  })

  it("treats every owned file as run-created in a repo with no commits yet", async () => {
    await rm(path.join(root, ".git"), { recursive: true, force: true })
    await run("git", ["init", "-q"], { cwd: root })
    await writeRecord({ beforeDirty: [] })
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/x.md"), "a decision")

    expect((await discard()).discarded).toBe(true)

    await expect(lstat(path.join(root, "docs/decisions/x.md"))).rejects.toThrow()
    await expect(lstat(path.join(root, COMPANY_YAML))).rejects.toThrow()
  })

  it("skips a directory (a nested repo) and says some changes were not dropped", async () => {
    await writeRecord({ beforeDirty: [] })
    await mkdir(path.join(root, "docs/decisions/sub"), { recursive: true })
    await run("git", ["init", "-q"], { cwd: path.join(root, "docs/decisions/sub") })
    await writeFile(path.join(root, "docs/decisions/sub/inner.md"), "inside a nested repo")
    await writeFile(path.join(root, "docs/decisions/x.md"), "a decision")

    expect(await discard()).toEqual({ discarded: true, message: PARTIAL })

    await expect(lstat(path.join(root, "docs/decisions/x.md"))).rejects.toThrow()
    expect(await readFile(path.join(root, "docs/decisions/sub/inner.md"), "utf-8")).toBe("inside a nested repo")
  })

  it("says some changes were not dropped when the guard refuses a file, and leaves it", async () => {
    vi.doMock("../path-guard", () => ({ resolveWithinAgentRoot: async () => null }))
    await writeRecord({ beforeDirty: [] })
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/x.md"), "a decision")
    await writeFile(path.join(root, COMPANY_YAML), "pricing: monthly\n")

    expect(await discard()).toEqual({ discarded: true, message: PARTIAL })

    expect(await readFile(path.join(root, "docs/decisions/x.md"), "utf-8")).toBe("a decision")
    expect(await readFile(path.join(root, COMPANY_YAML), "utf-8")).toBe("pricing: hourly\n")
  })

  it("returns the plain sentence when something before the loop throws, instead of a redacted server error", async () => {
    vi.doMock("../get-effective-agents", () => ({
      getEffectiveAgents: async () => {
        throw new Error("/Users/someone/secret/path: registry unreadable")
      },
    }))
    await writeRecord({ beforeDirty: [] })

    expect(await discard()).toEqual({ discarded: false, message: FAILED })
  })
})
