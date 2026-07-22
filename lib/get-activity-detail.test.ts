import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
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
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "a", name: "A", rootPath: root, kind: "pipeline" }],
    }))
    const { getActivityDetail } = await import("./get-activity-detail")
    const outsidePath = path.join(tmpdir(), "outside.md")

    await expect(getActivityDetail(outsidePath)).rejects.toThrow(
      "Refusing to read a path outside configured agent directories"
    )
  })
})
