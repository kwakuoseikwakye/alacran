import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "detail-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("getActivityDetail", () => {
  it("reads a file inside a configured agent root", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { getActivityDetail } = await import("./get-activity-detail")
    const filePath = path.join(root, "report.md")
    await writeFile(filePath, "hello")

    const content = await getActivityDetail(filePath)
    expect(content).toBe("hello")
  })

  it("refuses to read a path outside any configured agent root", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { getActivityDetail } = await import("./get-activity-detail")
    const outsidePath = path.join(tmpdir(), "outside.md")

    await expect(getActivityDetail(outsidePath)).rejects.toThrow(
      "Refusing to read a path outside configured agent directories"
    )
  })

  it("refuses to read a symlink inside agent root pointing to a file outside", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { getActivityDetail } = await import("./get-activity-detail")

    // Create a file outside the agent root
    const outsideRoot = await mkdtemp(path.join(tmpdir(), "outside-test-"))
    try {
      const outsideFile = path.join(outsideRoot, "secret.md")
      await writeFile(outsideFile, "secret content")

      // Create a symlink inside the agent root pointing to the outside file
      const symlinkPath = path.join(root, "link.md")
      await symlink(outsideFile, symlinkPath)

      // Verify the symlink exists and points to the outside file
      expect(outsideFile).toBeDefined()

      // Attempting to read via the symlink should be rejected
      await expect(getActivityDetail(symlinkPath)).rejects.toThrow(
        "Refusing to read a path outside configured agent directories"
      )
    } finally {
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })

  it("refuses to read a path that is a directory, with a clear message instead of a raw fs error", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { getActivityDetail } = await import("./get-activity-detail")

    await expect(getActivityDetail(root)).rejects.toThrow("This activity has no single file to display")
  })
})
