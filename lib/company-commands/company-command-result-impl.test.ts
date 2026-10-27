import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"

let dataDir: string
let agentRoot: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-result-data-"))
  agentRoot = await mkdtemp(path.join(tmpdir(), "company-result-agent-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(agentRoot, { recursive: true, force: true })
})

describe("getCompanyCommandResultImpl", () => {
  it("reports no run recorded when the run.json file doesn't exist", async () => {
    const result = await getCompanyCommandResultImpl("digest", dataDir, agentRoot)
    expect(result).toEqual({ changed: false, message: "No run recorded for this command yet.", strays: null })
  })

  it("detects a new file in a new-file-in-dir command's output directory", async () => {
    await mkdir(path.join(agentRoot, "notes/company/digests"), { recursive: true })
    await writeFile(
      path.join(dataDir, "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )
    await writeFile(path.join(agentRoot, "notes/company/digests/2026-07-23-digest.md"), "# Digest\ncontent")

    const result = await getCompanyCommandResultImpl("digest", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("notes/company/digests", "2026-07-23-digest.md"),
      oldText: "",
      newText: "# Digest\ncontent",
      extraFiles: [],
      strays: null
    })
  })

  it("reports no changes when no new file appears in the output directory", async () => {
    await mkdir(path.join(agentRoot, "docs/retros"), { recursive: true })
    await writeFile(path.join(agentRoot, "docs/retros/2026-07-01-retro.md"), "old")
    await writeFile(
      path.join(dataDir, "retro.run.json"),
      JSON.stringify({ commandId: "retro", outputKind: "new-file-in-dir", outputPath: "docs/retros", before: ["2026-07-01-retro.md"] })
    )

    const result = await getCompanyCommandResultImpl("retro", dataDir, agentRoot)

    expect(result).toEqual({ changed: false, message: "No changes produced.", strays: null })
  })

  it("says why when the run never started, instead of 'No changes produced.'", async () => {
    await mkdir(path.join(agentRoot, "docs/retros"), { recursive: true })
    await writeFile(
      path.join(dataDir, "retro.run.json"),
      JSON.stringify({ commandId: "retro", outputKind: "new-file-in-dir", outputPath: "docs/retros", before: [] })
    )
    await writeFile(
      path.join(dataDir, "retro.log"),
      '\nAlacrán: could not start "claude" — spawn claude ENOENT\nIs it installed and on this app\'s PATH?\n'
    )

    const result = await getCompanyCommandResultImpl("retro", dataDir, agentRoot)

    expect(result).toMatchObject({ changed: false, message: expect.stringMatching(/isn't installed on this computer yet/) })
  })

  it("still explains a sign-in failure wrapped in a JSON result, in words rather than JSON (v251)", async () => {
    await mkdir(path.join(agentRoot, "docs/retros"), { recursive: true })
    await writeFile(
      path.join(dataDir, "retro.run.json"),
      JSON.stringify({ commandId: "retro", outputKind: "new-file-in-dir", outputPath: "docs/retros", before: [] })
    )
    await writeFile(
      path.join(dataDir, "retro.log"),
      JSON.stringify({ type: "result", subtype: "success", is_error: true, total_cost_usd: 0, result: "Not logged in · Please run /login" }) + "\n"
    )

    const result = await getCompanyCommandResultImpl("retro", dataDir, agentRoot)

    expect(result).toMatchObject({ changed: false, message: expect.stringMatching(/needs you to sign in/) })
  })

  it("does not show a successful run's raw JSON result as its explanation (v251)", async () => {
    await mkdir(path.join(agentRoot, "docs/retros"), { recursive: true })
    await writeFile(
      path.join(dataDir, "retro.run.json"),
      JSON.stringify({ commandId: "retro", outputKind: "new-file-in-dir", outputPath: "docs/retros", before: [] })
    )
    await writeFile(
      path.join(dataDir, "retro.log"),
      JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0.01, result: "Nothing to add." }) + "\n"
    )

    const result = await getCompanyCommandResultImpl("retro", dataDir, agentRoot)

    expect(result).toMatchObject({ changed: false, message: "No changes produced." })
  })

  it("lists extra files beyond the primary one, sorted, if more than one new file appears", async () => {
    await mkdir(path.join(agentRoot, "docs/decisions"), { recursive: true })
    await writeFile(
      path.join(dataDir, "decision.run.json"),
      JSON.stringify({ commandId: "decision", outputKind: "new-file-in-dir", outputPath: "docs/decisions", before: [] })
    )
    await writeFile(path.join(agentRoot, "docs/decisions/b-second.md"), "second")
    await writeFile(path.join(agentRoot, "docs/decisions/a-first.md"), "first")

    const result = await getCompanyCommandResultImpl("decision", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("docs/decisions", "a-first.md"),
      oldText: "",
      newText: "first",
      extraFiles: ["b-second.md"],
      strays: null
    })
  })

  it("detects a content change for a known-file command", async () => {
    await mkdir(path.join(agentRoot, "definitions/ontology"), { recursive: true })
    await writeFile(path.join(agentRoot, "definitions/ontology/company.yaml"), "version: 1\nstatus: draft\n")
    await writeFile(
      path.join(dataDir, "define-company.run.json"),
      JSON.stringify({
        commandId: "define-company",
        outputKind: "known-file",
        outputPath: "definitions/ontology/company.yaml",
        before: null,
      })
    )

    const result = await getCompanyCommandResultImpl("define-company", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: "definitions/ontology/company.yaml",
      oldText: "",
      newText: "version: 1\nstatus: draft\n",
      extraFiles: [],
      strays: null
    })
  })

  it("reports no changes for a known-file command whose content is unchanged", async () => {
    await writeFile(path.join(agentRoot, "HANDOFF.md"), "# HANDOFF\nsame content\n")
    await writeFile(
      path.join(dataDir, "handoff.run.json"),
      JSON.stringify({ commandId: "handoff", outputKind: "known-file", outputPath: "HANDOFF.md", before: "# HANDOFF\nsame content\n" })
    )

    const result = await getCompanyCommandResultImpl("handoff", dataDir, agentRoot)

    expect(result).toEqual({ changed: false, message: "No changes produced.", strays: null })
  })
})

/**
 * The guard that lets an unscoped executor be used at all.
 *
 * Claude Code cannot write outside `Edit(<outputPath>/**)`, so for it these
 * paths are unreachable. For an executor reporting `enforcesToolScope: false`
 * they are the normal case, and before this the approval screen showed only
 * the expected folder while the other edits sat unmentioned in the tree.
 */
describe("stray files — what a run touched outside its own folder", () => {
  const run = promisify(execFile)

  async function gitCompany(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "strays-agent-"))
    await run("git", ["init", "-q", "."], { cwd: dir })
    await mkdir(path.join(dir, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(dir, "README.md"), "hi\n", "utf-8")
    await run("git", ["add", "-A"], { cwd: dir })
    await run("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: dir })
    return dir
  }

  async function record(dir: string, beforeDirty: string[] | null) {
    await writeFile(
      path.join(dataDir, "digest.run.json"),
      JSON.stringify({
        commandId: "digest",
        outputKind: "new-file-in-dir",
        outputPath: "notes/company/digests",
        before: [],
        beforeDirty,
      })
    )
    return dir
  }

  it("names a file written outside the output folder, alongside the real diff", async () => {
    const dir = await gitCompany()
    try {
      await record(dir, [])
      await writeFile(path.join(dir, "notes/company/digests/d.md"), "digest\n", "utf-8")
      await writeFile(path.join(dir, "HACKED.md"), "gotcha\n", "utf-8")

      const result = await getCompanyCommandResultImpl("digest", dataDir, dir)

      expect(result.changed).toBe(true)
      expect(result.strays).toEqual(["HACKED.md"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  /** The case that used to be invisible: nothing in the output folder, so the
   *  screen said "No changes produced." while three files sat edited. */
  it("reports strays even when the command produced no expected output", async () => {
    const dir = await gitCompany()
    try {
      await record(dir, [])
      await writeFile(path.join(dir, "SOMEWHERE.md"), "x\n", "utf-8")

      const result = await getCompanyCommandResultImpl("digest", dataDir, dir)

      expect(result.changed).toBe(false)
      expect(result.strays).toEqual(["SOMEWHERE.md"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("does not blame the agent for work the user already had uncommitted", async () => {
    const dir = await gitCompany()
    try {
      await writeFile(path.join(dir, "my-wip.md"), "mine\n", "utf-8")
      await record(dir, ["my-wip.md"])
      await writeFile(path.join(dir, "notes/company/digests/d.md"), "digest\n", "utf-8")

      const result = await getCompanyCommandResultImpl("digest", dataDir, dir)

      expect(result.strays).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  /** Absent is unknown, never none (v75). A record from before this shipped
   *  must not be rendered as a clean bill of health. */
  it("reports null, not an empty list, for a run record that predates the check", async () => {
    const dir = await gitCompany()
    try {
      await record(dir, null)
      await writeFile(path.join(dir, "notes/company/digests/d.md"), "digest\n", "utf-8")

      const result = await getCompanyCommandResultImpl("digest", dataDir, dir)

      expect(result.strays).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("reports null when git cannot answer at all, rather than claiming nothing strayed", async () => {
    const dir = await gitCompany()
    try {
      await record(dir, [])
      await writeFile(path.join(dir, "notes/company/digests/d.md"), "digest\n", "utf-8")

      const result = await getCompanyCommandResultImpl("digest", dataDir, dir, async () => {
        throw new Error("git exploded")
      })

      expect(result.strays).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

/** The review also carries what a command changed in its `alsoWrites` lanes (v234). */
describe("owned files", () => {
  const run = promisify(execFile)
  const realExec = async (file: string, args: string[], options: { cwd: string }) => run(file, args, { cwd: options.cwd })

  async function gitRepo(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "owned-repo-"))
    await run("git", ["init", "-q", "."], { cwd: dir })
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true })
      await writeFile(path.join(dir, rel), text, "utf-8")
    }
    await run("git", ["add", "-A"], { cwd: dir })
    await run("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: dir })
    return dir
  }

  function mockRegistry(cmd: { id: string; outputKind: "new-file-in-dir" | "known-file"; outputPath: string; alsoWrites?: string[] }) {
    // The file's top-level import already cached the impl against the real registry.
    vi.resetModules()
    vi.doMock("./registry", () => ({
      getCompanyCommand: (id: string) => id === cmd.id ? { fields: [], buildPrompt: () => "", label: "", commandFileName: "", ...cmd } : undefined,
    }))
  }

  afterEach(() => { vi.resetModules(); vi.doUnmock("./registry") })

  const sessionCmd = { id: "session-note", outputKind: "new-file-in-dir" as const, outputPath: "notes/company/sessions",
    alsoWrites: ["definitions/ontology/company.yaml", "docs/decisions/"] }

  async function sessionSetup(writeNote: boolean) {
    const root = await gitRepo({ "definitions/ontology/company.yaml": "pricing: hourly\n", "notes/company/sessions/.keep": "" })
    const data = await mkdtemp(path.join(tmpdir(), "owned-data-"))
    await writeFile(path.join(data, "session-note.run.json"), JSON.stringify({
      commandId: "session-note", outputKind: "new-file-in-dir", outputPath: "notes/company/sessions", before: [".keep"], beforeDirty: [], ownedBaseline: [],
    }))
    if (writeNote) await writeFile(path.join(root, "notes/company/sessions/2026-10-14-call.md"), "# note\n")
    await writeFile(path.join(root, "definitions/ontology/company.yaml"), "pricing: fixed  # source: notes/company/sessions/2026-10-14-call.md, 2026-10-14\n")
    return { root, data }
  }

  it("returns changed alsoWrites files with their committed and current text", async () => {
    const { root, data } = await sessionSetup(true)
    mockRegistry(sessionCmd)
    const { getCompanyCommandResultImpl: impl } = await import("./company-command-result-impl")
    const result = await impl("session-note", data, root, realExec)
    expect(result.changed && result.ownedFiles).toEqual([{
      path: "definitions/ontology/company.yaml", isNew: false,
      oldText: "pricing: hourly\n",
      newText: "pricing: fixed  # source: notes/company/sessions/2026-10-14-call.md, 2026-10-14\n",
    }])
    expect(result.strays).toEqual([])
    await rm(root, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  })

  it("reports owned edits as strays when no note was written (nothing must vanish)", async () => {
    const { root, data } = await sessionSetup(false)
    mockRegistry(sessionCmd)
    const { getCompanyCommandResultImpl: impl } = await import("./company-command-result-impl")
    const result = await impl("session-note", data, root, realExec)
    expect(result.changed).toBe(false)
    expect(result.strays).toEqual(["definitions/ontology/company.yaml"])
    await rm(root, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  })

  it("reports a known-file command as changed when only an owned file changed", async () => {
    const root = await gitRepo({ "definitions/ontology/company.yaml": "pricing: hourly\n" })
    const data = await mkdtemp(path.join(tmpdir(), "owned-data-"))
    await writeFile(path.join(data, "apply-session-facts.run.json"), JSON.stringify({
      commandId: "apply-session-facts", outputKind: "known-file", outputPath: "definitions/ontology/company.yaml",
      before: "pricing: hourly\n", beforeDirty: [], ownedBaseline: [],
    }))
    await mkdir(path.join(root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(root, "docs/decisions/x.md"), "# Decision\n")
    mockRegistry({ id: "apply-session-facts", outputKind: "known-file", outputPath: "definitions/ontology/company.yaml", alsoWrites: ["docs/decisions/"] })
    const { getCompanyCommandResultImpl: impl } = await import("./company-command-result-impl")
    const result = await impl("apply-session-facts", data, root, realExec)
    expect(result.changed).toBe(true)
    expect(result.changed && result.oldText === result.newText).toBe(true)
    expect(result.changed && result.ownedFiles?.map((f) => [f.path, f.isNew])).toEqual([["docs/decisions/x.md", true]])
    await rm(root, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  })

  it("has no ownedFiles for a command without alsoWrites", async () => {
    const root = await gitRepo({ "notes/company/digests/.keep": "" })
    const data = await mkdtemp(path.join(tmpdir(), "owned-data-"))
    await writeFile(path.join(data, "digest.run.json"), JSON.stringify({
      commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [".keep"], beforeDirty: [],
    }))
    await writeFile(path.join(root, "notes/company/digests/2026-10-14.md"), "# digest\n")
    mockRegistry({ id: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests" })
    const { getCompanyCommandResultImpl: impl } = await import("./company-command-result-impl")
    const result = await impl("digest", data, root, realExec)
    expect(result.changed && result.ownedFiles).toBeUndefined()
    await rm(root, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  })
})
