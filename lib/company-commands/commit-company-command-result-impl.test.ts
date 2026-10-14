import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const run = (file: string, args: string[], options?: { cwd: string }) => execFileAsync(file, args, { ...options, encoding: "utf8" })
/** The exact shape commitFile receives in production: no cwd, so git must be told the repo with -C. */
const realExecNoCwd = (file: string, args: string[]) => run(file, args)

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "commit-company-command-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

// IMPORTANT: compare git args against `await realpath(root)`, never the raw
// mkdtemp path — on macOS, tmpdir() lives under /var, which is itself a
// symlink to /private/var, so the resolved path this code actually uses
// (via path-guard.ts's realpath-based containment check) differs from the
// raw string `root`. Asserting against raw `root` fails on macOS.

describe("commitCompanyCommandResultImpl", () => {
  it("commits a file within the command's declared output directory", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(root, "notes/company/digests/2026-07-23-digest.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
    const resolvedRoot = await realpath(root)

    const calls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    const result = await commitCompanyCommandResultImpl(
      "digest",
      path.join("notes/company/digests", "2026-07-23-digest.md"),
      "ai-company-starter-main",
      fakeExec
    )

    expect(result).toEqual({ committed: true, message: "Committed" })
    expect(calls[0]).toEqual({
      command: "git",
      args: ["-C", resolvedRoot, "add", "--", path.join("notes/company/digests", "2026-07-23-digest.md")],
    })
    expect(calls[1].args).toContain("Run /digest via AI-Native control panel")
  })

  it("commits the exact known-file path for a known-file command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    await writeFile(path.join(root, "definitions", "ontology", "company.yaml"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const calls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    const result = await commitCompanyCommandResultImpl(
      "refresh",
      "definitions/ontology/company.yaml",
      "ai-company-starter-main",
      fakeExec
    )

    expect(result).toEqual({ committed: true, message: "Committed" })
    expect(calls[1].args).toContain("Run /refresh via AI-Native control panel")
  })

  it("refuses a path outside the command's declared output location", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "bin"), { recursive: true })
    await writeFile(path.join(root, "bin", "poll.sh"), "#!/bin/bash\n")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    let execCalled = false
    const fakeExec = async () => {
      execCalled = true
      return { stdout: "", stderr: "" }
    }

    const result = await commitCompanyCommandResultImpl("digest", "bin/poll.sh", "ai-company-starter-main", fakeExec)

    expect(result).toEqual({ committed: false, message: 'Refusing to commit a path outside "digest"\'s expected output location' })
    expect(execCalled).toBe(false)
  })

  it("refuses a path-traversal string that textually starts with the expected output dir but resolves outside it", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "HANDOFF.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    let execCalled = false
    const fakeExec = async () => {
      execCalled = true
      return { stdout: "", stderr: "" }
    }

    // Deliberately NOT built with path.join/path.normalize: this is meant to
    // simulate the raw, un-normalized string an attacker-controlled caller of
    // the "use server" action would send. Textually, it starts with
    // "docs/decisions/" (the "decision" command's declared outputPath), so a
    // raw-string prefix check would wrongly allow it. Once joined with the
    // agent root and resolved, it actually points at HANDOFF.md at the repo
    // root — a completely different file.
    const maliciousRelativePath = "docs/decisions/../../HANDOFF.md"
    expect(maliciousRelativePath.startsWith("docs/decisions" + path.sep)).toBe(true)

    const result = await commitCompanyCommandResultImpl("decision", maliciousRelativePath, "ai-company-starter-main", fakeExec)

    expect(result).toEqual({ committed: false, message: 'Refusing to commit a path outside "decision"\'s expected output location' })
    expect(execCalled).toBe(false)
  })

  it("refuses an unknown commandId", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const result = await commitCompanyCommandResultImpl("create-epic", "docs/decisions/x.md", "ai-company-starter-main")

    expect(result).toEqual({ committed: false, message: 'Unknown command "create-epic"' })
  })

  it("propagates a commit failure message", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "docs/retros"), { recursive: true })
    await writeFile(path.join(root, "docs/retros/2026-07-23-retro.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const fakeExec = async () => {
      throw new Error("nothing to commit")
    }

    const result = await commitCompanyCommandResultImpl(
      "retro",
      path.join("docs/retros", "2026-07-23-retro.md"),
      "ai-company-starter-main",
      fakeExec
    )

    expect(result).toEqual({ committed: false, message: "nothing to commit" })
  })

  it("reports an error for an unknown agentId", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const result = await commitCompanyCommandResultImpl("decision", "docs/decisions/x.md", "no-such-agent")

    expect(result).toEqual({ committed: false, message: 'Unknown company "no-such-agent"' })
  })

  it("commits against the correct target when a second agent is registered", async () => {
    const secondRoot = await mkdtemp(path.join(tmpdir(), "commit-company-command-second-"))
    try {
      vi.doMock("../config", () => ({
        AGENTS: [
          { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" },
          { id: "second-co", name: "Second Co", rootPath: secondRoot, kind: "command-set" },
        ],
      }))
      await mkdir(path.join(secondRoot, "definitions/ontology"), { recursive: true })
      await writeFile(path.join(secondRoot, "definitions/ontology/company.yaml"), "version: 1\n")
      const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
      const resolvedSecondRoot = await realpath(secondRoot)

      const calls: { command: string; args: string[] }[] = []
      const fakeExec = async (command: string, args: string[]) => {
        calls.push({ command, args })
        return { stdout: "", stderr: "" }
      }

      const result = await commitCompanyCommandResultImpl(
        "define-company",
        "definitions/ontology/company.yaml",
        "second-co",
        fakeExec
      )

      expect(result).toEqual({ committed: true, message: "Committed" })
      expect(calls[0]).toEqual({
        command: "git",
        args: ["-C", resolvedSecondRoot, "add", "--", "definitions/ontology/company.yaml"],
      })
    } finally {
      await rm(secondRoot, { recursive: true, force: true })
    }
  })
})


describe("reviewing multiple documents", () => {
  it("keeps the second document pending after saving the first", async () => {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    const data = path.join(root, "run-data")
    await mkdir(data)
    await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(root, "notes/company/digests/a.md"), "First")
    await writeFile(path.join(root, "notes/company/digests/b.md"), "Second")
    await writeFile(path.join(data, "digest.run.json"), JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [], beforeDirty: [] }))
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
    const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
    const result = await commitCompanyCommandResultImpl("digest", "notes/company/digests/a.md", "ai-company-starter-main", async () => ({ stdout: "", stderr: "" }), data, "First")
    expect(result.committed).toBe(true)
    expect(JSON.parse(await readFile(path.join(data, "digest.run.json"), "utf-8")).before).toEqual(["a.md"])
    expect(await getCompanyCommandResultImpl("digest", data, root, undefined, false)).toMatchObject({ changed: true, outputPath: "notes/company/digests/b.md", newText: "Second" })
  })
  it("does not save a draft that changed after the user reviewed it", async () => {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    const data = path.join(root, "run-data")
    await mkdir(data)
    await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(root, "notes/company/digests/a.md"), "New version")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
    const commit = vi.fn(async () => ({ stdout: "", stderr: "" }))
    const result = await commitCompanyCommandResultImpl("digest", "notes/company/digests/a.md", "ai-company-starter-main", commit, data, "Old version")
    expect(result.committed).toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })
  it("clears the run when the only new .md is committed despite .DS_Store", async () => {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    const data = path.join(root, "run-data")
    await mkdir(data)
    await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(root, "notes/company/digests/a.md"), "Content")
    await writeFile(path.join(root, "notes/company/digests/.DS_Store"), "junk")
    await writeFile(path.join(data, "digest.run.json"), JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [], beforeDirty: [] }))
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
    const result = await commitCompanyCommandResultImpl("digest", "notes/company/digests/a.md", "ai-company-starter-main", async () => ({ stdout: "", stderr: "" }), data, "Content")
    expect(result.committed).toBe(true)
    expect(result.message).toBe("Committed")
    const runRecord = await readFile(path.join(data, "digest.run.json"), "utf-8").catch(() => null)
    expect(runRecord).toBeNull()
  })
})

// Every test here spawns real git several times (repo setup alone is seven calls), so the default
// 5s test / 10s hook limits are not a safe margin when the machine is busy.
describe("owned files (alsoWrites)", { timeout: 20_000 }, () => {
  const NOTE = "notes/company/sessions/2026-10-14-call.md"
  const COMPANY_YAML = "definitions/ontology/company.yaml"
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "commit-company-command-data-"))
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
  })

  async function writeRecord(record: Record<string, unknown>) {
    await writeFile(
      path.join(dataDir, "session-note.run.json"),
      // A record a live prompt wrote: the owned baseline is taken at the same moment as beforeDirty (v234 C1).
      JSON.stringify({ commandId: "session-note", outputKind: "new-file-in-dir", outputPath: "notes/company/sessions", before: [], ownedBaseline: record.beforeDirty, ...record })
    )
  }

  /** What the owner was shown; v238 requires it whenever owned files exist. */
  async function shownOwned() {
    const { getCompanyCommandResultImpl } = await import("./company-command-result-impl")
    const r = await getCompanyCommandResultImpl("session-note", dataDir, root, (file, args, options) => run(file, args, options))
    return r.changed ? (r.ownedFiles ?? []).map((f) => ({ path: f.path, newText: f.newText })) : []
  }

  async function headFiles() {
    const { stdout } = await run("git", ["show", "--name-only", "--format=", "HEAD"], { cwd: root })
    return stdout.trim().split("\n").sort()
  }

  it("commits owned changes in the same commit as the note", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, NOTE), "call notes")
    await writeFile(path.join(root, COMPANY_YAML), "pricing: monthly\n")
    await writeFile(path.join(root, "README.md"), "a stray the run was never allowed to write")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const res = await commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, await shownOwned())

    expect(res.committed).toBe(true)
    expect(await headFiles()).toEqual([COMPANY_YAML, NOTE])
    const status = await run("git", ["status", "--porcelain"], { cwd: root })
    expect(status.stdout).toContain("README.md")
  })

  it("leaves an owned file that was dirty before the run alone", async () => {
    await writeRecord({ beforeDirty: [COMPANY_YAML] })
    await writeFile(path.join(root, COMPANY_YAML), "pricing: the owner's own edit\n")
    await writeFile(path.join(root, NOTE), "call notes")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const res = await commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, await shownOwned())

    expect(res.committed).toBe(true)
    expect((await headFiles())).toEqual([NOTE])
    const status = await run("git", ["status", "--porcelain"], { cwd: root })
    expect(status.stdout).toContain(COMPANY_YAML)
  })

  it("appends the run record's trailer to the commit message", async () => {
    await writeRecord({ beforeDirty: [], trailer: `Applied facts from: ${NOTE}` })
    await writeFile(path.join(root, NOTE), "call notes")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    await commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir)

    const { stdout } = await run("git", ["log", "-1", "--format=%B"], { cwd: root })
    expect(stdout).toContain("Run /session-note via AI-Native control panel")
    expect(stdout).toContain(`Applied facts from: ${NOTE}`)
  })

  it("commits an owned file the run deleted, as a deletion in the same commit", async () => {
    await writeRecord({ beforeDirty: [] })
    await writeFile(path.join(root, NOTE), "call notes")
    await rm(path.join(root, COMPANY_YAML))
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const res = await commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, await shownOwned())

    expect(res.committed).toBe(true)
    const { stdout } = await run("git", ["show", "--name-status", "--format=", "HEAD"], { cwd: root })
    expect(stdout.trim().split("\n").sort()).toEqual([`A\t${NOTE}`, `D\t${COMPANY_YAML}`])
    const status = await run("git", ["status", "--porcelain"], { cwd: root })
    expect(status.stdout).not.toContain(COMPANY_YAML)
  })

  it("never commits an owned path that is a symlink, even one pointing outside every company", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "commit-company-command-outside-"))
    try {
      await writeFile(path.join(outside, "secret.txt"), "not part of any company")
      await mkdir(path.join(root, "docs/decisions"), { recursive: true })
      await symlink(path.join(outside, "secret.txt"), path.join(root, "docs/decisions/link.md"))
      await writeRecord({ beforeDirty: [] })
      await writeFile(path.join(root, NOTE), "call notes")
      await writeFile(path.join(root, COMPANY_YAML), "pricing: monthly\n")
      const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

      const res = await commitCompanyCommandResultImpl("session-note", NOTE, "acme", realExecNoCwd, dataDir, undefined, undefined, await shownOwned())

      expect(res.committed).toBe(true)
      expect(await headFiles()).toEqual([COMPANY_YAML, NOTE])
      const status = await run("git", ["status", "--porcelain", "-uall"], { cwd: root })
      expect(status.stdout).toContain("docs/decisions/link.md")
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})
