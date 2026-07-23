import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
    await writeFile(path.join(root, "HANDOFF.md"), "content")
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const calls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    const result = await commitCompanyCommandResultImpl("handoff", "HANDOFF.md", fakeExec)

    expect(result).toEqual({ committed: true, message: "Committed" })
    expect(calls[1].args).toContain("Run /handoff via AI-Native control panel")
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

    const result = await commitCompanyCommandResultImpl("digest", "bin/poll.sh", fakeExec)

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

    const result = await commitCompanyCommandResultImpl("decision", maliciousRelativePath, fakeExec)

    expect(result).toEqual({ committed: false, message: 'Refusing to commit a path outside "decision"\'s expected output location' })
    expect(execCalled).toBe(false)
  })

  it("refuses an unknown commandId", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")

    const result = await commitCompanyCommandResultImpl("create-epic", "docs/decisions/x.md")

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

    const result = await commitCompanyCommandResultImpl("retro", path.join("docs/retros", "2026-07-23-retro.md"), fakeExec)

    expect(result).toEqual({ committed: false, message: "nothing to commit" })
  })
})
