import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm, symlink, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "path-guard-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("resolveWithinAgentRoot", () => {
  it("resolves a path inside a configured agent root", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { resolveWithinAgentRoot } = await import("./path-guard")
    const filePath = path.join(root, "report.md")
    await writeFile(filePath, "hello")

    const result = await resolveWithinAgentRoot(filePath)
    expect(result).not.toBeNull()
    // Compare against realpath()-resolved expectations: on macOS, os.tmpdir()
    // returns a path through the /var -> /private/var symlink, so the
    // resolver's realpath() output legitimately differs from the raw path.
    expect(result?.realPath).toBe(await realpath(filePath))
    expect(result?.agentRootPath).toBe(await realpath(root))
  })

  it("returns null for a path outside any configured agent root", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { resolveWithinAgentRoot } = await import("./path-guard")
    const outsidePath = path.join(tmpdir(), "outside.md")

    const result = await resolveWithinAgentRoot(outsidePath)
    expect(result).toBeNull()
  })

  it("returns null for a symlink inside agent root pointing to a file outside", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { resolveWithinAgentRoot } = await import("./path-guard")

    const outsideRoot = await mkdtemp(path.join(tmpdir(), "outside-test-"))
    try {
      const outsideFile = path.join(outsideRoot, "secret.md")
      await writeFile(outsideFile, "secret content")

      const symlinkPath = path.join(root, "link.md")
      await symlink(outsideFile, symlinkPath)

      const result = await resolveWithinAgentRoot(symlinkPath)
      expect(result).toBeNull()
    } finally {
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })
})
